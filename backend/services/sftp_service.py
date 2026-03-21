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
    
    async def auto_link_batiment(self, tenant_id: str, intervention_data: Dict) -> Optional[str]:
        """
        Recherche automatiquement un bâtiment correspondant à l'adresse de l'intervention.
        Retourne l'ID du bâtiment si trouvé avec un score suffisant.
        
        Algorithme de scoring:
        - Correspondance exacte adresse: 50 pts
        - Correspondance partielle adresse: 30 pts
        - Correspondance ville: 30 pts
        - Numéro civique identique: 20 pts
        """
        import unicodedata
        
        def normalize(text):
            if not text:
                return ''
            # Enlever accents et normaliser
            text = unicodedata.normalize('NFD', str(text))
            text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
            return text.lower().replace(',', ' ').replace('.', ' ').replace('-', ' ').strip()
        
        # Extraire l'adresse de l'intervention
        address = intervention_data.get('address_street') or intervention_data.get('address_full') or intervention_data.get('address') or ''
        city = intervention_data.get('address_city') or intervention_data.get('municipalite') or ''
        
        if not address or len(address) < 3:
            return None
        
        normalized_address = normalize(address)
        normalized_city = normalize(city)
        
        # Extraire le numéro civique
        address_num = None
        num_match = re.match(r'^(\d+)', normalized_address)
        if num_match:
            address_num = num_match.group(1)
        
        try:
            # Rechercher les bâtiments correspondants
            batiments = await self.db.batiments.find(
                {"tenant_id": tenant_id},
                {"_id": 0, "id": 1, "adresse_civique": 1, "ville": 1, "nom_etablissement": 1}
            ).to_list(500)
            
            best_match = None
            best_score = 0
            
            for bat in batiments:
                score = 0
                bat_address = normalize(bat.get('adresse_civique', ''))
                bat_city = normalize(bat.get('ville', ''))
                
                # Correspondance adresse
                if bat_address == normalized_address:
                    score += 50
                elif bat_address in normalized_address or normalized_address in bat_address:
                    score += 30
                
                # Correspondance ville
                if bat_city == normalized_city:
                    score += 30
                elif bat_city in normalized_city or normalized_city in bat_city:
                    score += 15
                
                # Numéro civique
                bat_num = None
                bat_num_match = re.match(r'^(\d+)', bat_address)
                if bat_num_match:
                    bat_num = bat_num_match.group(1)
                
                if address_num and bat_num and address_num == bat_num:
                    score += 20
                
                if score > best_score:
                    best_score = score
                    best_match = bat
            
            # Seuil de 70 pour liaison automatique
            if best_score >= 70 and best_match:
                logger.info(f"Bâtiment auto-lié: {best_match.get('adresse_civique')} (score: {best_score})")
                return best_match['id']
            
            return None
            
        except Exception as e:
            logger.error(f"Erreur recherche auto bâtiment: {e}")
            return None
    
    def _clean_host(self, host: str) -> str:
        """Nettoie le hostname en enlevant les protocoles et trailing slashes"""
        if not host:
            return host
        # Enlever les protocoles courants
        for prefix in ['http://', 'https://', 'sftp://', 'ftp://']:
            if host.lower().startswith(prefix):
                host = host[len(prefix):]
        # Enlever le trailing slash et le path
        host = host.split('/')[0]
        # Enlever le port si présent dans l'URL
        if ':' in host:
            host = host.split(':')[0]
        return host.strip()
    
    def connect_sftp(self, config: Dict) -> tuple:
        """
        Établit une connexion SFTP
        
        Returns:
            tuple: (sftp_client, transport) - Les deux doivent être fermés après usage
        """
        host = self._clean_host(config["host"])
        port = config.get("port", 22)
        
        transport = paramiko.Transport((host, port))
        transport.connect(
            username=config["username"],
            password=config["password"]
        )
        sftp = paramiko.SFTPClient.from_transport(transport)
        return sftp, transport
    
    def close_sftp_connection(self, sftp: paramiko.SFTPClient, transport: paramiko.Transport):
        """
        Ferme proprement une connexion SFTP (client ET transport)
        
        IMPORTANT: Toujours appeler cette méthode pour éviter les connexions orphelines
        """
        try:
            if sftp:
                sftp.close()
        except Exception as e:
            logger.warning(f"Erreur fermeture SFTP client: {e}")
        
        try:
            if transport:
                transport.close()
        except Exception as e:
            logger.warning(f"Erreur fermeture transport: {e}")
    
    def disconnect_sftp(self, tenant_id: str):
        """Ferme une connexion SFTP stockée pour un tenant"""
        if tenant_id in self.active_connections:
            try:
                sftp, transport = self.active_connections[tenant_id]
                self.close_sftp_connection(sftp, transport)
            except:
                pass
            del self.active_connections[tenant_id]
    
    async def cleanup_all_connections(self):
        """
        Ferme TOUTES les connexions SFTP actives et arrête tous les pollings.
        Appelé au démarrage et à l'arrêt de l'application pour garantir un état propre.
        """
        logger.info("🧹 Nettoyage de toutes les connexions SFTP...")
        
        # 1. Arrêter tous les pollings actifs
        polling_tenant_ids = list(self.polling_tasks.keys())
        for tenant_id in polling_tenant_ids:
            try:
                await self.stop_polling(tenant_id)
                logger.info(f"  - Polling arrêté pour tenant {tenant_id}")
            except Exception as e:
                logger.warning(f"  - Erreur arrêt polling {tenant_id}: {e}")
        
        # 2. Fermer toutes les connexions actives
        connection_tenant_ids = list(self.active_connections.keys())
        for tenant_id in connection_tenant_ids:
            try:
                self.disconnect_sftp(tenant_id)
                logger.info(f"  - Connexion fermée pour tenant {tenant_id}")
            except Exception as e:
                logger.warning(f"  - Erreur fermeture connexion {tenant_id}: {e}")
        
        # 3. Réinitialiser les dictionnaires
        self.active_connections.clear()
        self.polling_tasks.clear()
        
        logger.info(f"✅ Nettoyage SFTP terminé: {len(polling_tenant_ids)} polling(s) arrêté(s), {len(connection_tenant_ids)} connexion(s) fermée(s)")
    
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
    
    def _detect_source_appel(self, remote_path: str) -> str:
        """
        Détecte la source de l'appel selon le chemin SFTP.
        
        - intervention_cauca ou cauca → 'cauca' (appels pompiers)
        - intervention_urgence_sante ou urgence_sante → 'urgence_sante' (premiers répondants)
        - Sinon → 'cauca' par défaut
        """
        path_lower = remote_path.lower()
        
        if "urgence_sante" in path_lower or "urgencesante" in path_lower or "urgence-sante" in path_lower:
            return "urgence_sante"
        elif "cauca" in path_lower:
            return "cauca"
        else:
            # Par défaut, considérer comme CAUCA
            return "cauca"

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
        
        # Détecter la source de l'appel selon le chemin SFTP
        source_appel = self._detect_source_appel(remote_path)
        
        # Ajouter les métadonnées
        intervention_data["tenant_id"] = tenant_id
        intervention_data["status"] = "new"
        intervention_data["created_at"] = datetime.now(timezone.utc)
        intervention_data["source"] = "sftp_auto"
        intervention_data["source_appel"] = source_appel  # 'cauca' ou 'urgence_sante'
        intervention_data["sftp_files"] = filenames
        intervention_data["sftp_remote_path"] = remote_path  # Pour traçabilité
        
        # RECHERCHE AUTOMATIQUE DE BÂTIMENT
        # Tenter de lier automatiquement un bâtiment basé sur l'adresse
        if not intervention_data.get("batiment_id"):
            batiment_id = await self.auto_link_batiment(tenant_id, intervention_data)
            if batiment_id:
                intervention_data["batiment_id"] = batiment_id
                intervention_data["batiment_auto_linked"] = True
                logger.info(f"Bâtiment auto-lié pour intervention {card_number}: {batiment_id}")
        
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
        
        sftp = None
        transport = None
        
        try:
            # Connexion SFTP
            sftp, transport = self.connect_sftp(config)
            remote_path = config.get("remote_path", "/")
            
            # Lister les fichiers XML
            xml_files = self.list_xml_files(sftp, remote_path)
            if not xml_files:
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
        
        finally:
            # TOUJOURS fermer la connexion, même en cas d'erreur
            self.close_sftp_connection(sftp, transport)
    
    async def start_polling(self, tenant_id: str, tenant_slug: str, interval: int = 300):
        """
        Démarre le polling SFTP pour un tenant
        
        Args:
            tenant_id: ID du tenant
            tenant_slug: Slug du tenant (pour les logs)
            interval: Intervalle en secondes entre chaque vérification (défaut: 300 = 5 minutes)
                      Minimum recommandé: 120 secondes (2 minutes)
        """
        # Forcer un minimum de 60 secondes pour éviter de surcharger le serveur SFTP
        interval = max(60, interval)
        
        async def poll_loop():
            logger.info(f"Démarrage polling SFTP pour tenant {tenant_slug} (intervalle: {interval}s = {interval//60} min)")
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
    
    async def start_polling_for_tenant(
        self, 
        tenant_id: str, 
        config: Dict, 
        type_carte: str = "incendie",
        polling_key: str = None
    ):
        """
        Démarre le polling SFTP pour un tenant avec une configuration spécifique
        
        Args:
            tenant_id: ID du tenant
            config: Configuration SFTP
            type_carte: Type de carte d'appel ('incendie' ou 'premier_repondant')
            polling_key: Clé unique pour ce polling (par défaut: tenant_id)
        """
        polling_key = polling_key or tenant_id
        interval = max(60, config.get("polling_interval", 300))
        
        async def poll_loop():
            logger.info(f"Démarrage polling SFTP {type_carte} pour tenant {tenant_id} (intervalle: {interval}s)")
            while True:
                try:
                    new_interventions = await self.check_sftp_for_tenant_with_config(
                        tenant_id, config, type_carte
                    )
                    if new_interventions:
                        logger.info(f"[{tenant_id}/{type_carte}] {len(new_interventions)} nouvelle(s) intervention(s) importée(s)")
                except Exception as e:
                    logger.error(f"Erreur polling SFTP {type_carte} {tenant_id}: {e}")
                
                await asyncio.sleep(interval)
        
        # Arrêter le polling existant si présent
        if polling_key in self.polling_tasks:
            self.polling_tasks[polling_key].cancel()
        
        # Démarrer le nouveau polling
        task = asyncio.create_task(poll_loop())
        self.polling_tasks[polling_key] = task
    
    async def check_sftp_for_tenant_with_config(
        self, 
        tenant_id: str, 
        config: Dict,
        type_carte: str = "incendie"
    ) -> List[Dict]:
        """
        Vérifie le SFTP d'un tenant avec une configuration spécifique et traite les nouveaux fichiers
        """
        sftp = None
        transport = None
        
        try:
            # Connexion SFTP
            sftp, transport = self.connect_sftp(config)
            remote_path = config.get("remote_path", "/")
            
            # Lister les fichiers XML
            xml_files = self.list_xml_files(sftp, remote_path)
            if not xml_files:
                return []
            
            new_interventions = []
            
            # Pour Alerte Santé, traiter chaque fichier XML individuellement
            # (format: un fichier = une ou plusieurs cartes)
            if type_carte == "alerte_sante":
                for filename in xml_files:
                    logger.info(f"[{tenant_id}/alerte_sante] Traitement du fichier: {filename}")
                    intervention = await self.process_alerte_sante_file(
                        tenant_id, sftp, remote_path, filename
                    )
                    if intervention:
                        if isinstance(intervention, list):
                            new_interventions.extend(intervention)
                        else:
                            new_interventions.append(intervention)
            else:
                # Pour CAUCA (incendie), grouper par intervention (ancien comportement)
                groups = self.group_files_by_intervention(xml_files)
                
                for card_number, filenames in groups.items():
                    # Vérifier si on a au moins le fichier Details
                    has_details = any(self.identify_file_type(f) == "details" for f in filenames)
                    if not has_details:
                        logger.warning(f"Pas de fichier Details pour carte {card_number}, attente...")
                        continue
                    
                    intervention = await self.process_intervention_files_with_type(
                        tenant_id, sftp, remote_path, card_number, filenames, type_carte
                    )
                    if intervention:
                        new_interventions.append(intervention)
            
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
                                "type_carte": type_carte,
                                "time_received": intervention.get("xml_time_call_received").isoformat() if intervention.get("xml_time_call_received") else None,
                                "action": intervention.get("_action", "created")
                            }
                        }
                    )
            
            return new_interventions
            
        except Exception as e:
            logger.error(f"Erreur SFTP pour tenant {tenant_id}: {e}")
            return []
        
        finally:
            self.close_sftp_connection(sftp, transport)
    
    async def process_alerte_sante_file(
        self,
        tenant_id: str,
        sftp: paramiko.SFTPClient,
        remote_path: str,
        filename: str
    ) -> List[Dict]:
        """
        Traite un fichier XML Alerte Santé (peut contenir plusieurs cartes)
        """
        from services.alerte_sante_parser import parse_pr_xml_file
        
        try:
            # Télécharger le fichier
            content = self.download_file(sftp, remote_path, filename)
            if not content:
                logger.warning(f"Fichier vide ou non téléchargé: {filename}")
                return []
            
            # Parser toutes les cartes du fichier
            cartes = parse_pr_xml_file(content)
            if not cartes:
                logger.warning(f"Aucune carte parsée dans {filename}")
                return []
            
            logger.info(f"[alerte_sante] {len(cartes)} carte(s) trouvée(s) dans {filename}")
            
            saved_interventions = []
            
            for carte in cartes:
                # Ajouter les métadonnées
                carte["tenant_id"] = tenant_id
                carte["status"] = carte.get("status", "new")
                carte["created_at"] = datetime.now(timezone.utc)
                carte["source"] = "sftp_auto"
                carte["type_carte"] = "alerte_sante"
                carte["sftp_files"] = [filename]
                carte["sftp_remote_path"] = remote_path
                
                external_id = carte.get("external_call_id")
                if not external_id:
                    logger.warning(f"Carte sans external_call_id dans {filename}, ignorée")
                    continue
                
                # Vérifier si l'intervention existe déjà
                existing = await self.db.interventions.find_one({
                    "tenant_id": tenant_id,
                    "external_call_id": external_id,
                    "type_carte": "alerte_sante"
                })
                
                if existing:
                    carte["updated_at"] = datetime.now(timezone.utc)
                    await self.db.interventions.update_one(
                        {"id": existing["id"]},
                        {"$set": carte}
                    )
                    carte["id"] = existing["id"]
                    carte["_action"] = "updated"
                    logger.info(f"Carte Alerte Santé mise à jour: {external_id}")
                else:
                    await self.db.interventions.insert_one(carte)
                    carte["_action"] = "created"
                    logger.info(f"Nouvelle carte Alerte Santé créée: {external_id}")
                
                saved_interventions.append(carte)
            
            # Supprimer le fichier du SFTP après traitement
            if saved_interventions:
                self.delete_file(sftp, remote_path, filename)
                logger.info(f"Fichier supprimé du SFTP: {filename}")
            
            return saved_interventions
            
        except Exception as e:
            logger.error(f"Erreur traitement fichier Alerte Santé {filename}: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    async def process_intervention_files_with_type(
        self, 
        tenant_id: str, 
        sftp: paramiko.SFTPClient, 
        remote_path: str,
        card_number: str, 
        filenames: List[str],
        type_carte: str = "incendie"
    ) -> Optional[Dict]:
        """
        Traite les fichiers d'une intervention avec un type de carte spécifique
        """
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
        
        # Parser l'intervention selon le type de carte
        try:
            if type_carte == "alerte_sante":
                from services.alerte_sante_parser import parse_pr_intervention
                intervention_data = parse_pr_intervention(files_content)
            else:
                from services.cauca_parser import parse_cauca_intervention
                intervention_data = parse_cauca_intervention(files_content)
        except Exception as e:
            logger.error(f"Erreur parsing carte {type_carte} {card_number}: {e}")
            return None
        
        if not intervention_data:
            logger.warning(f"Pas de données parsées pour la carte {card_number}")
            return None
        
        # Ajouter les métadonnées avec le type de carte
        intervention_data["tenant_id"] = tenant_id
        intervention_data["status"] = intervention_data.get("status", "new")
        intervention_data["created_at"] = datetime.now(timezone.utc)
        intervention_data["source"] = "sftp_auto"
        intervention_data["type_carte"] = type_carte  # 'incendie' ou 'premier_repondant'
        intervention_data["sftp_files"] = filenames
        intervention_data["sftp_remote_path"] = remote_path
        
        # Vérifier si l'intervention existe déjà
        external_id = intervention_data.get("external_call_id") or card_number
        existing = await self.db.interventions.find_one({
            "tenant_id": tenant_id,
            "external_call_id": external_id,
            "type_carte": type_carte
        })
        
        if existing:
            intervention_data["updated_at"] = datetime.now(timezone.utc)
            await self.db.interventions.update_one(
                {"id": existing["id"]},
                {"$set": intervention_data}
            )
            intervention_data["id"] = existing["id"]
            intervention_data["_action"] = "updated"
            logger.info(f"Intervention {type_carte} mise à jour: {external_id}")
        else:
            intervention_data["external_call_id"] = external_id
            await self.db.interventions.insert_one(intervention_data)
            intervention_data["_action"] = "created"
            logger.info(f"Nouvelle intervention {type_carte} créée: {external_id}")
        
        # Supprimer les fichiers du SFTP
        for filename in filenames:
            self.delete_file(sftp, remote_path, filename)
        
        return intervention_data
    
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
        sftp = None
        transport = None
        
        try:
            sftp, transport = self.connect_sftp(config)
            remote_path = config.get("remote_path", "/")
            
            # Tester l'accès au répertoire
            try:
                files = sftp.listdir(remote_path)
                xml_count = len([f for f in files if f.lower().endswith('.xml')])
            except FileNotFoundError:
                return {
                    "success": False,
                    "message": f"Le répertoire '{remote_path}' n'existe pas"
                }
            
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
        
        finally:
            # TOUJOURS fermer la connexion, même en cas d'erreur
            self.close_sftp_connection(sftp, transport)


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
