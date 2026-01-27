"""
Service SFTP pour la récupération automatique des cartes d'appel 911
====================================================================

Ce service :
1. Se connecte au serveur SFTP configuré pour chaque tenant
2. Vérifie périodiquement les nouveaux fichiers XML
3. Parse les cartes d'appel et les importe dans la base
4. Supprime les fichiers traités du SFTP
5. Notifie le frontend via WebSocket en temps réel
"""

import paramiko
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Set
from pathlib import Path
import os
import re

logger = logging.getLogger(__name__)


class SFTPService:
    """Service de gestion SFTP pour les cartes d'appel 911"""
    
    def __init__(self, db, websocket_manager=None):
        self.db = db
        self.websocket_manager = websocket_manager
        self.active_connections: Dict[str, paramiko.SFTPClient] = {}
        self.polling_tasks: Dict[str, asyncio.Task] = {}
        self.processed_files: Dict[str, Set[str]] = {}  # Cache des fichiers déjà traités par tenant
        
    async def get_sftp_config(self, tenant_id: str) -> Optional[Dict]:
        """Récupère la configuration SFTP d'un tenant"""
        config = await self.db.sftp_configs.find_one(
            {"tenant_id": tenant_id, "actif": True},
            {"_id": 0}
        )
        return config
    
    def connect_sftp(self, config: Dict) -> paramiko.SFTPClient:
        """Établit une connexion SFTP"""
        transport = paramiko.Transport((config["host"], config.get("port", 22)))
        transport.connect(
            username=config["username"],
            password=config["password"]
        )
        sftp = paramiko.SFTPClient.from_transport(transport)
        return sftp
    
    def disconnect_sftp(self, tenant_id: str):
        """Ferme une connexion SFTP"""
        if tenant_id in self.active_connections:
            try:
                self.active_connections[tenant_id].close()
            except:
                pass
            del self.active_connections[tenant_id]
    
    def list_xml_files(self, sftp: paramiko.SFTPClient, remote_path: str) -> List[str]:
        """Liste les fichiers XML dans le répertoire distant"""
        try:
            files = sftp.listdir(remote_path)
            xml_files = [f for f in files if f.lower().endswith('.xml')]
            return xml_files
        except Exception as e:
            logger.error(f"Erreur listdir SFTP: {e}")
            return []
    
    def download_file(self, sftp: paramiko.SFTPClient, remote_path: str, filename: str) -> str:
        """Télécharge un fichier et retourne son contenu"""
        try:
            full_path = f"{remote_path.rstrip('/')}/{filename}"
            with sftp.open(full_path, 'r') as f:
                content = f.read()
                if isinstance(content, bytes):
                    # Essayer différents encodages
                    for encoding in ['utf-8', 'iso-8859-1', 'cp1252']:
                        try:
                            return content.decode(encoding)
                        except:
                            continue
                    return content.decode('utf-8', errors='replace')
                return content
        except Exception as e:
            logger.error(f"Erreur téléchargement SFTP {filename}: {e}")
            return None
    
    def delete_file(self, sftp: paramiko.SFTPClient, remote_path: str, filename: str) -> bool:
        """Supprime un fichier du serveur SFTP"""
        try:
            full_path = f"{remote_path.rstrip('/')}/{filename}"
            sftp.remove(full_path)
            logger.info(f"Fichier supprimé du SFTP: {full_path}")
            return True
        except Exception as e:
            logger.error(f"Erreur suppression SFTP {filename}: {e}")
            return False
    
    def group_files_by_intervention(self, filenames: List[str]) -> Dict[str, List[str]]:
        """
        Groupe les fichiers par intervention (basé sur le numéro de carte).
        Format attendu: XXXX_CAUCA..._NUMERO_type.xml ou NUMERO_type.xml
        """
        groups = {}
        
        # Patterns possibles
        patterns = [
            r"_(\d+)_[^_]+\.xml$",  # Format CAUCA: ..._123456_Details.xml
            r"^(\d+)_[^_]+\.xml$",  # Format simple: 123456_Details.xml
            r"_(\d+)\.xml$",        # Format minimal: ..._123456.xml
        ]
        
        for filename in filenames:
            card_number = None
            for pattern in patterns:
                match = re.search(pattern, filename, re.IGNORECASE)
                if match:
                    card_number = match.group(1)
                    break
            
            if card_number:
                if card_number not in groups:
                    groups[card_number] = []
                groups[card_number].append(filename)
        
        return groups
    
    def identify_file_type(self, filename: str) -> Optional[str]:
        """Identifie le type de fichier CAUCA"""
        filename_lower = filename.lower()
        
        if "_details" in filename_lower or "details" in filename_lower:
            return "details"
        elif "_ressources" in filename_lower or "ressources" in filename_lower:
            return "ressources"
        elif "_commentaires" in filename_lower or "commentaires" in filename_lower:
            return "commentaires"
        elif "_priseappel" in filename_lower or "priseappel" in filename_lower:
            return "prise_appel"
        elif "_assistance" in filename_lower or "assistance" in filename_lower:
            return "assistance"
        
        # Si c'est un seul fichier XML, c'est probablement le détail
        return "details"
    
    async def process_intervention_files(
        self, 
        tenant_id: str, 
        sftp: paramiko.SFTPClient, 
        remote_path: str,
        card_number: str, 
        filenames: List[str]
    ) -> Optional[Dict]:
        """
        Traite les fichiers d'une intervention et crée l'entrée en base
        """
        from services.cauca_parser import parse_cauca_intervention
        
        # Télécharger tous les fichiers
        files_content = {}
        for filename in filenames:
            file_type = self.identify_file_type(filename)
            if file_type:
                content = self.download_file(sftp, remote_path, filename)
                if content:
                    files_content[file_type] = content
        
        if not files_content:
            logger.warning(f"Aucun contenu valide pour la carte {card_number}")
            return None
        
        # Parser l'intervention
        try:
            intervention_data = parse_cauca_intervention(files_content)
        except Exception as e:
            logger.error(f"Erreur parsing carte {card_number}: {e}")
            return None
        
        # Ajouter les métadonnées
        intervention_data["tenant_id"] = tenant_id
        intervention_data["status"] = "new"
        intervention_data["created_at"] = datetime.now(timezone.utc)
        intervention_data["source"] = "sftp_auto"
        intervention_data["sftp_files"] = filenames
        
        # Vérifier si l'intervention existe déjà
        external_id = intervention_data.get("external_call_id") or card_number
        existing = await self.db.interventions.find_one({
            "tenant_id": tenant_id,
            "external_call_id": external_id
        })
        
        if existing:
            # Mettre à jour l'intervention existante
            intervention_data["updated_at"] = datetime.now(timezone.utc)
            await self.db.interventions.update_one(
                {"id": existing["id"]},
                {"$set": intervention_data}
            )
            intervention_data["id"] = existing["id"]
            intervention_data["_action"] = "updated"
            logger.info(f"Intervention mise à jour: {external_id}")
        else:
            # Créer une nouvelle intervention
            intervention_data["external_call_id"] = external_id
            await self.db.interventions.insert_one(intervention_data)
            intervention_data["_action"] = "created"
            logger.info(f"Nouvelle intervention créée: {external_id}")
        
        # Supprimer les fichiers du SFTP
        for filename in filenames:
            self.delete_file(sftp, remote_path, filename)
        
        return intervention_data
    
    async def check_sftp_for_tenant(self, tenant_id: str, tenant_slug: str) -> List[Dict]:
        """
        Vérifie le SFTP d'un tenant et traite les nouveaux fichiers
        """
        config = await self.get_sftp_config(tenant_id)
        if not config:
            return []
        
        try:
            # Connexion SFTP
            sftp = self.connect_sftp(config)
            remote_path = config.get("remote_path", "/")
            
            # Lister les fichiers XML
            xml_files = self.list_xml_files(sftp, remote_path)
            if not xml_files:
                sftp.close()
                return []
            
            # Grouper par intervention
            groups = self.group_files_by_intervention(xml_files)
            
            # Traiter chaque intervention
            new_interventions = []
            for card_number, filenames in groups.items():
                # Vérifier si on a au moins le fichier Details
                has_details = any(self.identify_file_type(f) == "details" for f in filenames)
                if not has_details:
                    logger.warning(f"Pas de fichier Details pour carte {card_number}, attente...")
                    continue
                
                intervention = await self.process_intervention_files(
                    tenant_id, sftp, remote_path, card_number, filenames
                )
                if intervention:
                    new_interventions.append(intervention)
            
            sftp.close()
            
            # Notifier via WebSocket
            if new_interventions and self.websocket_manager:
                for intervention in new_interventions:
                    await self.websocket_manager.broadcast_to_tenant(
                        tenant_id,
                        {
                            "type": "new_intervention",
                            "data": {
                                "id": intervention.get("id"),
                                "external_call_id": intervention.get("external_call_id"),
                                "address": intervention.get("address_full"),
                                "type_intervention": intervention.get("type_intervention"),
                                "time_received": intervention.get("xml_time_call_received").isoformat() if intervention.get("xml_time_call_received") else None,
                                "action": intervention.get("_action", "created")
                            }
                        }
                    )
            
            return new_interventions
            
        except Exception as e:
            logger.error(f"Erreur SFTP pour tenant {tenant_id}: {e}")
            return []
    
    async def start_polling(self, tenant_id: str, tenant_slug: str, interval: int = 30):
        """
        Démarre le polling SFTP pour un tenant
        
        Args:
            tenant_id: ID du tenant
            tenant_slug: Slug du tenant (pour les logs)
            interval: Intervalle en secondes entre chaque vérification
        """
        async def poll_loop():
            logger.info(f"Démarrage polling SFTP pour tenant {tenant_slug} (intervalle: {interval}s)")
            while True:
                try:
                    new_interventions = await self.check_sftp_for_tenant(tenant_id, tenant_slug)
                    if new_interventions:
                        logger.info(f"[{tenant_slug}] {len(new_interventions)} nouvelle(s) intervention(s) importée(s)")
                except Exception as e:
                    logger.error(f"Erreur polling SFTP {tenant_slug}: {e}")
                
                await asyncio.sleep(interval)
        
        # Arrêter le polling existant si présent
        if tenant_id in self.polling_tasks:
            self.polling_tasks[tenant_id].cancel()
        
        # Démarrer le nouveau polling
        task = asyncio.create_task(poll_loop())
        self.polling_tasks[tenant_id] = task
    
    async def stop_polling(self, tenant_id: str):
        """Arrête le polling SFTP pour un tenant"""
        if tenant_id in self.polling_tasks:
            self.polling_tasks[tenant_id].cancel()
            del self.polling_tasks[tenant_id]
            logger.info(f"Polling SFTP arrêté pour tenant {tenant_id}")
    
    async def test_connection(self, config: Dict) -> Dict[str, Any]:
        """
        Teste la connexion SFTP avec la configuration fournie
        
        Returns:
            Dict avec success, message, et éventuellement files_count
        """
        try:
            sftp = self.connect_sftp(config)
            remote_path = config.get("remote_path", "/")
            
            # Tester l'accès au répertoire
            try:
                files = sftp.listdir(remote_path)
                xml_count = len([f for f in files if f.lower().endswith('.xml')])
            except FileNotFoundError:
                sftp.close()
                return {
                    "success": False,
                    "message": f"Le répertoire '{remote_path}' n'existe pas"
                }
            
            sftp.close()
            
            return {
                "success": True,
                "message": f"Connexion réussie. {xml_count} fichier(s) XML trouvé(s) dans {remote_path}",
                "files_count": xml_count,
                "total_files": len(files)
            }
            
        except paramiko.AuthenticationException:
            return {
                "success": False,
                "message": "Échec d'authentification. Vérifiez le nom d'utilisateur et le mot de passe."
            }
        except paramiko.SSHException as e:
            return {
                "success": False,
                "message": f"Erreur SSH: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Erreur de connexion: {str(e)}"
            }


# Instance globale du service (sera initialisée dans server.py)
sftp_service: Optional[SFTPService] = None


def get_sftp_service() -> SFTPService:
    """Récupère l'instance du service SFTP"""
    global sftp_service
    if sftp_service is None:
        raise RuntimeError("SFTP Service not initialized")
    return sftp_service


def init_sftp_service(db, websocket_manager=None) -> SFTPService:
    """Initialise le service SFTP"""
    global sftp_service
    sftp_service = SFTPService(db, websocket_manager)
    return sftp_service
