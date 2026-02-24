"""
WebSocket pour la synchronisation temps réel entre tous les clients
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Set
import json
import logging
import asyncio

router = APIRouter(tags=["WebSocket"])
logger = logging.getLogger(__name__)

# Gestionnaire de connexions WebSocket
class ConnectionManager:
    def __init__(self):
        # Structure: {tenant_id: {user_id: [websocket, ...]}}
        self.active_connections: Dict[str, Dict[str, List[WebSocket]]] = {}
        # Pour broadcast à tout un tenant: {tenant_id: [websocket, ...]}
        self.tenant_connections: Dict[str, List[WebSocket]] = {}
        
    async def connect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        await websocket.accept()
        
        # Ajouter à la liste du tenant
        if tenant_id not in self.tenant_connections:
            self.tenant_connections[tenant_id] = []
        self.tenant_connections[tenant_id].append(websocket)
        
        # Ajouter à la liste user-specific
        if tenant_id not in self.active_connections:
            self.active_connections[tenant_id] = {}
        if user_id not in self.active_connections[tenant_id]:
            self.active_connections[tenant_id][user_id] = []
        self.active_connections[tenant_id][user_id].append(websocket)
        
        logger.info(f"🔌 WebSocket connecté: tenant={tenant_id}, user={user_id[:8]}...")
        
    def disconnect(self, websocket: WebSocket, tenant_id: str, user_id: str):
        # Retirer de la liste tenant
        if tenant_id in self.tenant_connections:
            if websocket in self.tenant_connections[tenant_id]:
                self.tenant_connections[tenant_id].remove(websocket)
                
        # Retirer de la liste user
        if tenant_id in self.active_connections:
            if user_id in self.active_connections[tenant_id]:
                if websocket in self.active_connections[tenant_id][user_id]:
                    self.active_connections[tenant_id][user_id].remove(websocket)
                    
        logger.info(f"🔌 WebSocket déconnecté: tenant={tenant_id}, user={user_id[:8]}...")
    
    async def broadcast_to_tenant(self, tenant_id: str, message: dict):
        """Envoyer un message à tous les clients d'un tenant"""
        if tenant_id not in self.tenant_connections:
            return
            
        disconnected = []
        for connection in self.tenant_connections[tenant_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Erreur envoi WebSocket: {e}")
                disconnected.append(connection)
        
        # Nettoyer les connexions mortes
        for conn in disconnected:
            if conn in self.tenant_connections[tenant_id]:
                self.tenant_connections[tenant_id].remove(conn)
                
    async def send_to_user(self, tenant_id: str, user_id: str, message: dict):
        """Envoyer un message à un utilisateur spécifique"""
        if tenant_id not in self.active_connections:
            return
        if user_id not in self.active_connections[tenant_id]:
            return
            
        disconnected = []
        for connection in self.active_connections[tenant_id][user_id]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Erreur envoi WebSocket à user: {e}")
                disconnected.append(connection)
        
        # Nettoyer
        for conn in disconnected:
            if conn in self.active_connections[tenant_id][user_id]:
                self.active_connections[tenant_id][user_id].remove(conn)

    async def broadcast_to_users(self, tenant_id: str, user_ids: List[str], message: dict):
        """Envoyer un message à plusieurs utilisateurs spécifiques"""
        for user_id in user_ids:
            await self.send_to_user(tenant_id, user_id, message)

    def get_connection_count(self, tenant_id: str = None) -> int:
        """Obtenir le nombre de connexions actives"""
        if tenant_id:
            return len(self.tenant_connections.get(tenant_id, []))
        return sum(len(conns) for conns in self.tenant_connections.values())


# Instance globale du gestionnaire
manager = ConnectionManager()


@router.websocket("/ws/{tenant_slug}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, tenant_slug: str, user_id: str):
    """
    Endpoint WebSocket pour la synchronisation temps réel
    
    Les clients se connectent avec leur tenant_slug et user_id.
    Ils reçoivent automatiquement les mises à jour pour leur tenant.
    """
    await manager.connect(websocket, tenant_slug, user_id)
    
    try:
        while True:
            # Garder la connexion ouverte et écouter les messages
            data = await websocket.receive_text()
            
            # Les clients peuvent envoyer des "ping" pour garder la connexion active
            if data == "ping":
                await websocket.send_text("pong")
            else:
                # Traiter d'autres messages si nécessaire
                try:
                    message = json.loads(data)
                    logger.debug(f"Message WebSocket reçu: {message}")
                except json.JSONDecodeError:
                    pass
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, tenant_slug, user_id)
    except Exception as e:
        logger.error(f"Erreur WebSocket: {e}")
        manager.disconnect(websocket, tenant_slug, user_id)


# ==================== FONCTIONS HELPER POUR BROADCASTER ====================

async def broadcast_planning_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour du planning"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "planning_update",
        "action": action,  # "create", "update", "delete"
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_remplacement_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des remplacements"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "remplacement_update",
        "action": action,  # "nouvelle_demande", "accepte", "refuse", "expire"
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_notification(tenant_id: str, user_id: str, notification: dict):
    """Envoyer une notification en temps réel à un utilisateur"""
    await manager.send_to_user(tenant_id, user_id, {
        "type": "notification",
        "data": notification,
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_epi_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour EPI"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "epi_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_disponibilite_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des disponibilités"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "disponibilite_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_generic_update(tenant_id: str, update_type: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour générique"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": update_type,
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_conge_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des congés"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "conge_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_user_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des utilisateurs"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "user_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_intervention_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des interventions"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "intervention_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })

async def broadcast_actif_update(tenant_id: str, action: str, data: dict = None):
    """Notifier tous les clients d'une mise à jour des actifs/équipements"""
    await manager.broadcast_to_tenant(tenant_id, {
        "type": "actif_update",
        "action": action,
        "data": data or {},
        "timestamp": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    })
