"""
Gestionnaire WebSocket pour les notifications temps réel
========================================================

Gère les connexions WebSocket par tenant pour :
- Nouvelles interventions (cartes d'appel 911)
- Mises à jour de statut
- Notifications diverses
"""

from fastapi import WebSocket
from typing import Dict, List, Set
import asyncio
import json
import logging

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Gestionnaire des connexions WebSocket par tenant"""
    
    def __init__(self):
        # Structure: { tenant_id: { user_id: WebSocket } }
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        # Lock pour thread-safety
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        """Accepte une nouvelle connexion WebSocket"""
        await websocket.accept()
        
        async with self.lock:
            if tenant_id not in self.active_connections:
                self.active_connections[tenant_id] = {}
            
            # Fermer l'ancienne connexion si existe
            if user_id in self.active_connections[tenant_id]:
                try:
                    await self.active_connections[tenant_id][user_id].close()
                except:
                    pass
            
            self.active_connections[tenant_id][user_id] = websocket
        
        logger.info(f"WebSocket connecté: tenant={tenant_id}, user={user_id}")
    
    async def disconnect(self, tenant_id: str, user_id: str):
        """Déconnecte un WebSocket"""
        async with self.lock:
            if tenant_id in self.active_connections:
                if user_id in self.active_connections[tenant_id]:
                    del self.active_connections[tenant_id][user_id]
                    logger.info(f"WebSocket déconnecté: tenant={tenant_id}, user={user_id}")
                
                # Nettoyer le tenant si vide
                if not self.active_connections[tenant_id]:
                    del self.active_connections[tenant_id]
    
    async def send_to_user(self, tenant_id: str, user_id: str, message: dict):
        """Envoie un message à un utilisateur spécifique"""
        async with self.lock:
            if tenant_id in self.active_connections:
                if user_id in self.active_connections[tenant_id]:
                    try:
                        await self.active_connections[tenant_id][user_id].send_json(message)
                        return True
                    except Exception as e:
                        logger.error(f"Erreur envoi WebSocket à {user_id}: {e}")
                        # Nettoyer la connexion morte
                        del self.active_connections[tenant_id][user_id]
        return False
    
    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        """Diffuse un message à tous les utilisateurs d'un tenant"""
        if tenant_id not in self.active_connections:
            return 0
        
        sent_count = 0
        dead_connections = []
        
        async with self.lock:
            connections = list(self.active_connections.get(tenant_id, {}).items())
        
        for user_id, websocket in connections:
            try:
                await websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.error(f"Erreur broadcast à {user_id}: {e}")
                dead_connections.append(user_id)
        
        # Nettoyer les connexions mortes
        async with self.lock:
            for user_id in dead_connections:
                if tenant_id in self.active_connections:
                    if user_id in self.active_connections[tenant_id]:
                        del self.active_connections[tenant_id][user_id]
        
        logger.info(f"Broadcast tenant {tenant_id}: {sent_count} destinataire(s)")
        return sent_count
    
    async def broadcast_to_role(self, tenant_id: str, role: str, message: dict, db):
        """
        Diffuse un message aux utilisateurs d'un rôle spécifique
        Nécessite l'accès à la DB pour vérifier les rôles
        """
        if tenant_id not in self.active_connections:
            return 0
        
        # Récupérer les IDs des utilisateurs du rôle
        users = await db.users.find(
            {"tenant_id": tenant_id, "role": role, "statut": "Actif"},
            {"id": 1}
        ).to_list(1000)
        
        target_ids = set(u["id"] for u in users)
        
        sent_count = 0
        async with self.lock:
            connections = list(self.active_connections.get(tenant_id, {}).items())
        
        for user_id, websocket in connections:
            if user_id in target_ids:
                try:
                    await websocket.send_json(message)
                    sent_count += 1
                except:
                    pass
        
        return sent_count
    
    def get_connected_count(self, tenant_id: str = None) -> int:
        """Retourne le nombre de connexions actives"""
        if tenant_id:
            return len(self.active_connections.get(tenant_id, {}))
        
        total = 0
        for tenant_connections in self.active_connections.values():
            total += len(tenant_connections)
        return total
    
    def get_connected_users(self, tenant_id: str) -> List[str]:
        """Retourne la liste des user_id connectés pour un tenant"""
        return list(self.active_connections.get(tenant_id, {}).keys())


# Instance globale
websocket_manager = WebSocketManager()


def get_websocket_manager() -> WebSocketManager:
    """Récupère l'instance du gestionnaire WebSocket"""
    return websocket_manager
