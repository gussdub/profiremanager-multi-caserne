"""
Service CAUCA API CAD Transfert
================================

Ce service gère l'intégration avec l'API CAUCA pour la réception automatique 
des cartes d'appel via polling périodique.

Architecture:
1. Poll périodique de GET /CallingCardEvents pour détecter les nouveaux événements
2. Pour chaque événement, récupérer les détails via GET /CallingCards/{cardNumber}
3. Parser et importer les cartes d'appel dans la base de données
4. Notifier le frontend via WebSocket en temps réel

Authentification:
- Certificat SSL client (fourni par CAUCA après envoi du CSR)
- Header "ssi-token" spécifique par service incendie
"""

import asyncio
import logging
import httpx
import ssl
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from pathlib import Path
import os
import tempfile

logger = logging.getLogger(__name__)


class CAUCAAPIService:
    """Service de gestion de l'API CAUCA CAD Transfert"""
    
    def __init__(self, db, websocket_manager=None):
        self.db = db
        self.websocket_manager = websocket_manager
        self.polling_tasks: Dict[str, asyncio.Task] = {}
        self.processed_events: Dict[str, Set[str]] = {}  # Cache des événements déjà traités par tenant
        self.last_event_timestamps: Dict[str, datetime] = {}  # Dernière heure de vérification par tenant
        
    async def get_cauca_config(self, tenant_id: str) -> Optional[Dict]:
        """Récupère la configuration CAUCA API d'un tenant"""
        config = await self.db.cauca_configs.find_one(
            {"tenant_id": tenant_id, "actif": True},
            {"_id": 0}
        )
        return config
    
    async def get_ssl_context(self, config: Dict) -> Optional[ssl.SSLContext]:
        """
        Crée un contexte SSL avec le certificat client et la clé privée.
        Les fichiers sont stockés dans Azure Blob Storage.
        """
        try:
            from services.azure_storage import get_object
            
            cert_blob = config.get("certificate_blob_name")
            key_blob = config.get("private_key_blob_name")
            
            if not cert_blob or not key_blob:
                logger.error("Certificat ou clé privée manquant dans la configuration CAUCA")
                return None
            
            # Télécharger les fichiers depuis Azure Blob Storage
            cert_content = get_object(cert_blob)
            key_content = get_object(key_blob)
            
            # Créer des fichiers temporaires (httpx nécessite des chemins de fichiers)
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.pem') as cert_file:
                cert_file.write(cert_content)
                cert_path = cert_file.name
            
            with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.pem') as key_file:
                key_file.write(key_content)
                key_path = key_file.name
            
            # Créer le contexte SSL
            ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ssl_context.load_cert_chain(certfile=cert_path, keyfile=key_path)
            
            # Nettoyer les fichiers temporaires après création du contexte
            # Note: On les garde tant que la connexion est active
            # TODO: Implémenter un nettoyage approprié
            
            return ssl_context
            
        except Exception as e:
            logger.error(f"Erreur création contexte SSL CAUCA: {e}")
            return None
    
    async def call_cauca_api(
        self,
        endpoint: str,
        config: Dict,
        ssl_context: Optional[ssl.SSLContext] = None
    ) -> Optional[Dict]:
        """
        Appelle l'API CAUCA avec authentification SSL et header ssi-token.
        
        Args:
            endpoint: Endpoint à appeler (ex: "/CallingCardEvents")
            config: Configuration CAUCA du tenant
            ssl_context: Contexte SSL (certificat client)
        
        Returns:
            Réponse JSON de l'API ou None en cas d'erreur
        """
        api_url = config.get("api_url", "https://cad-transfert.cauca.ca/api")
        ssi_token = config.get("ssi_token")
        
        if not ssi_token:
            logger.error("Token SSI manquant dans la configuration CAUCA")
            return None
        
        url = f"{api_url}{endpoint}"
        headers = {
            "ssi-token": ssi_token,
            "Accept": "application/json"
        }
        
        try:
            # TODO: Une fois les certificats disponibles, utiliser ssl_context
            # Pour le moment, on prépare la structure
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, headers=headers)
                
                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 400:
                    logger.error(f"CAUCA API - Certificat manquant: {url}")
                    return None
                elif response.status_code == 401:
                    logger.error(f"CAUCA API - Non authentifié: {url}")
                    return None
                elif response.status_code == 403:
                    logger.error(f"CAUCA API - Non autorisé (token SSI invalide?): {url}")
                    return None
                else:
                    logger.error(f"CAUCA API - Erreur {response.status_code}: {url}")
                    return None
                    
        except Exception as e:
            logger.error(f"Erreur appel CAUCA API {url}: {e}")
            return None
    
    async def fetch_events(self, tenant_id: str, config: Dict) -> List[Dict]:
        """
        Récupère les nouveaux événements via GET /CallingCardEvents.
        
        Format de réponse attendu:
        [
            {
                "cardNumber": "string",
                "eventType": 0,  // 0=création, 1=annulation, 2=fermeture
                "occurredOn": "2026-04-13T14:06:07.971Z"
            }
        ]
        """
        ssl_context = await self.get_ssl_context(config)
        events = await self.call_cauca_api("/CallingCardEvents", config, ssl_context)
        
        if not events or not isinstance(events, list):
            return []
        
        # Filtrer les événements déjà traités
        if tenant_id not in self.processed_events:
            self.processed_events[tenant_id] = set()
        
        new_events = []
        for event in events:
            card_number = event.get("cardNumber")
            event_type = event.get("eventType")
            occurred_on = event.get("occurredOn")
            
            # Créer un ID unique pour cet événement
            event_id = f"{card_number}_{event_type}_{occurred_on}"
            
            if event_id not in self.processed_events[tenant_id]:
                new_events.append(event)
                self.processed_events[tenant_id].add(event_id)
        
        return new_events
    
    async def fetch_calling_card(
        self,
        card_number: str,
        tenant_id: str,
        config: Dict
    ) -> Optional[Dict]:
        """
        Récupère les détails d'une carte d'appel via GET /CallingCards/{cardNumber}.
        
        Retourne le JSON complet de la carte selon le schéma CAUCA.
        """
        ssl_context = await self.get_ssl_context(config)
        card_data = await self.call_cauca_api(
            f"/CallingCards/{card_number}",
            config,
            ssl_context
        )
        
        return card_data
    
    async def process_event(
        self,
        event: Dict,
        tenant_id: str,
        config: Dict
    ):
        """
        Traite un événement CAUCA:
        - eventType 0: Création → Récupérer et importer la carte
        - eventType 1: Annulation → Marquer comme annulée
        - eventType 2: Fermeture → Mettre à jour le statut
        """
        card_number = event.get("cardNumber")
        event_type = event.get("eventType")
        occurred_on = event.get("occurredOn")
        
        logger.info(f"Traitement événement CAUCA - Carte {card_number}, Type {event_type}, Tenant {tenant_id}")
        
        try:
            if event_type == 0:  # Création
                # Récupérer les détails de la carte
                card_data = await self.fetch_calling_card(card_number, tenant_id, config)
                
                if card_data:
                    # Parser et importer
                    from services.cauca_api_parser import parse_cauca_calling_card
                    intervention_data = parse_cauca_calling_card(card_data, tenant_id)
                    
                    # Vérifier si la carte existe déjà
                    existing = await self.db.interventions.find_one({
                        "tenant_id": tenant_id,
                        "external_call_id": card_number
                    })
                    
                    if not existing:
                        await self.db.interventions.insert_one(intervention_data)
                        logger.info(f"Carte CAUCA {card_number} importée avec succès")
                        
                        # Notifier le frontend via WebSocket
                        if self.websocket_manager:
                            await self.websocket_manager.broadcast_to_tenant(
                                tenant_id,
                                {
                                    "type": "new_intervention",
                                    "source": "cauca_api",
                                    "data": {
                                        "card_number": card_number,
                                        "intervention_id": intervention_data["id"]
                                    }
                                }
                            )
                    else:
                        logger.info(f"Carte CAUCA {card_number} déjà existante, ignorée")
            
            elif event_type == 1:  # Annulation
                # Marquer l'intervention comme annulée
                result = await self.db.interventions.update_one(
                    {"tenant_id": tenant_id, "external_call_id": card_number},
                    {"$set": {
                        "status": "cancelled",
                        "cancelled_at": occurred_on,
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
                
                if result.modified_count > 0:
                    logger.info(f"Carte CAUCA {card_number} marquée comme annulée")
            
            elif event_type == 2:  # Fermeture
                # Mettre à jour le statut
                result = await self.db.interventions.update_one(
                    {"tenant_id": tenant_id, "external_call_id": card_number},
                    {"$set": {
                        "status": "closed",
                        "closed_at": occurred_on,
                        "updated_at": datetime.now(timezone.utc)
                    }}
                )
                
                if result.modified_count > 0:
                    logger.info(f"Carte CAUCA {card_number} marquée comme fermée")
        
        except Exception as e:
            logger.error(f"Erreur traitement événement CAUCA {card_number}: {e}")
    
    async def polling_loop(self, tenant_id: str):
        """
        Boucle de polling pour un tenant.
        Vérifie périodiquement les nouveaux événements CAUCA.
        """
        logger.info(f"Démarrage polling CAUCA pour tenant {tenant_id}")
        
        while True:
            try:
                config = await self.get_cauca_config(tenant_id)
                
                if not config or not config.get("actif"):
                    logger.warning(f"Config CAUCA inactive ou inexistante pour tenant {tenant_id}, arrêt du polling")
                    break
                
                polling_interval = config.get("polling_interval", 300)
                
                # Récupérer les nouveaux événements
                events = await self.fetch_events(tenant_id, config)
                
                if events:
                    logger.info(f"CAUCA - {len(events)} nouveaux événements pour tenant {tenant_id}")
                    
                    # Traiter chaque événement
                    for event in events:
                        await self.process_event(event, tenant_id, config)
                    
                    # Mettre à jour les stats
                    await self.db.cauca_configs.update_one(
                        {"tenant_id": tenant_id},
                        {"$set": {
                            "last_check": datetime.now(timezone.utc),
                            "last_events_count": len(events)
                        }}
                    )
                else:
                    # Mettre à jour uniquement last_check
                    await self.db.cauca_configs.update_one(
                        {"tenant_id": tenant_id},
                        {"$set": {"last_check": datetime.now(timezone.utc)}}
                    )
                
                # Attendre avant la prochaine vérification
                await asyncio.sleep(polling_interval)
                
            except asyncio.CancelledError:
                logger.info(f"Polling CAUCA annulé pour tenant {tenant_id}")
                break
            except Exception as e:
                logger.error(f"Erreur dans polling CAUCA pour tenant {tenant_id}: {e}")
                await asyncio.sleep(60)  # Attendre 1 minute avant de réessayer
    
    async def start_polling(self, tenant_id: str) -> Dict:
        """Démarre le polling pour un tenant"""
        if tenant_id in self.polling_tasks:
            return {"success": False, "error": "Polling déjà actif"}
        
        config = await self.get_cauca_config(tenant_id)
        if not config:
            return {"success": False, "error": "Configuration CAUCA non trouvée ou inactive"}
        
        # Vérifier les certificats
        if not config.get("certificate_blob_name") or not config.get("private_key_blob_name"):
            return {"success": False, "error": "Certificat SSL ou clé privée manquant"}
        
        # Créer et démarrer la tâche
        task = asyncio.create_task(self.polling_loop(tenant_id))
        self.polling_tasks[tenant_id] = task
        
        logger.info(f"Polling CAUCA démarré pour tenant {tenant_id}")
        return {"success": True}
    
    async def stop_polling(self, tenant_id: str):
        """Arrête le polling pour un tenant"""
        if tenant_id in self.polling_tasks:
            task = self.polling_tasks[tenant_id]
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            del self.polling_tasks[tenant_id]
            logger.info(f"Polling CAUCA arrêté pour tenant {tenant_id}")
    
    async def stop_all_polling(self):
        """Arrête tous les pollings actifs (appelé au shutdown)"""
        for tenant_id in list(self.polling_tasks.keys()):
            await self.stop_polling(tenant_id)


# ==================== SINGLETON ====================

_cauca_service_instance = None

def init_cauca_service(db, websocket_manager=None):
    """Initialise le service CAUCA (appelé au démarrage de l'application)"""
    global _cauca_service_instance
    _cauca_service_instance = CAUCAAPIService(db, websocket_manager)
    return _cauca_service_instance


def get_cauca_service() -> CAUCAAPIService:
    """Retourne l'instance du service CAUCA"""
    if _cauca_service_instance is None:
        raise RuntimeError("CAUCAAPIService n'est pas initialisé. Appelez init_cauca_service() d'abord.")
    return _cauca_service_instance
