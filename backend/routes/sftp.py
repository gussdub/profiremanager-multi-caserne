"""
Routes API pour la configuration SFTP et le polling des cartes d'appel
=====================================================================
"""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_current_user_or_super_admin,
    get_tenant_from_slug,
    User
)
from services.sftp_service import get_sftp_service, init_sftp_service
from services.websocket_manager import get_websocket_manager

router = APIRouter(tags=["SFTP Cartes d'appel"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class SFTPConfigCreate(BaseModel):
    """Configuration SFTP pour un tenant"""
    host: str
    port: int = 22
    username: str
    password: str
    remote_path: str = "/"
    polling_interval: int = 30  # Intervalle en secondes
    actif: bool = True
    description: Optional[str] = None


class SFTPConfigUpdate(BaseModel):
    """Mise à jour de configuration SFTP"""
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    remote_path: Optional[str] = None
    polling_interval: Optional[int] = None
    actif: Optional[bool] = None
    description: Optional[str] = None


class SFTPConfig(BaseModel):
    """Configuration SFTP complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    host: str
    port: int = 22
    username: str
    password: str  # En production, utiliser un vault
    remote_path: str = "/"
    polling_interval: int = 30
    actif: bool = True
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    last_check: Optional[datetime] = None
    last_files_count: int = 0


# ==================== ROUTES CONFIGURATION SFTP ====================

@router.get("/{tenant_slug}/sftp/config")
async def get_sftp_config(
    tenant_slug: str,
    current_user: User = Depends(get_current_user_or_super_admin)
):
    """Récupérer la configuration SFTP du tenant"""
    # Vérifier les permissions (admin du tenant ou super-admin)
    is_super_admin = getattr(current_user, 'is_super_admin', False)
    if not is_super_admin and current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.sftp_configs.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0, "password": 0}  # Ne pas exposer le mot de passe
    )
    
    if not config:
        return None
    
    # Ajouter le statut du polling
    sftp_service = get_sftp_service()
    config["polling_active"] = tenant.id in sftp_service.polling_tasks
    
    return config


@router.post("/{tenant_slug}/sftp/config")
async def create_sftp_config(
    tenant_slug: str,
    config_data: SFTPConfigCreate,
    current_user: User = Depends(get_current_user_or_super_admin)
):
    """Créer ou mettre à jour la configuration SFTP"""
    # Vérifier les permissions (admin du tenant ou super-admin)
    is_super_admin = getattr(current_user, 'is_super_admin', False)
    if not is_super_admin and current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si une config existe déjà
    existing = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    
    if existing:
        # Mettre à jour
        update_data = config_data.dict()
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await db.sftp_configs.update_one(
            {"tenant_id": tenant.id},
            {"$set": update_data}
        )
        
        return {"message": "Configuration SFTP mise à jour", "id": existing["id"]}
    else:
        # Créer
        config = SFTPConfig(
            tenant_id=tenant.id,
            **config_data.dict()
        )
        
        await db.sftp_configs.insert_one(config.dict())
        
        return {"message": "Configuration SFTP créée", "id": config.id}


@router.put("/{tenant_slug}/sftp/config")
async def update_sftp_config(
    tenant_slug: str,
    config_data: SFTPConfigUpdate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour la configuration SFTP"""
    if current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    existing = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
    
    update_data = {k: v for k, v in config_data.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.sftp_configs.update_one(
        {"tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    return {"message": "Configuration SFTP mise à jour"}


@router.delete("/{tenant_slug}/sftp/config")
async def delete_sftp_config(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer la configuration SFTP"""
    if current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Arrêter le polling si actif
    sftp_service = get_sftp_service()
    await sftp_service.stop_polling(tenant.id)
    
    result = await db.sftp_configs.delete_one({"tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
    
    return {"message": "Configuration SFTP supprimée"}


# ==================== ROUTES TEST ET CONTRÔLE ====================

@router.post("/{tenant_slug}/sftp/test")
async def test_sftp_connection(
    tenant_slug: str,
    config_data: Optional[SFTPConfigCreate] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Tester la connexion SFTP.
    Si config_data est fourni, teste avec ces paramètres.
    Sinon, teste avec la configuration existante.
    """
    # Permettre aux super-admins et admins
    if current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    sftp_service = get_sftp_service()
    
    if config_data:
        # Tester avec les paramètres fournis
        test_config = config_data.dict()
        logger.info(f"Test SFTP avec config fournie: host={test_config.get('host')}, user={test_config.get('username')}")
    else:
        # Tester avec la config existante
        test_config = await db.sftp_configs.find_one(
            {"tenant_id": tenant.id},
            {"_id": 0}
        )
        if not test_config:
            raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
        logger.info(f"Test SFTP avec config existante: host={test_config.get('host')}")
    
    result = await sftp_service.test_connection(test_config)
    
    return result


@router.post("/{tenant_slug}/sftp/start-polling")
async def start_sftp_polling(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Démarrer le polling SFTP pour ce tenant"""
    if current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la config existe et est active
    config = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    if not config:
        raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
    
    if not config.get("actif", False):
        raise HTTPException(status_code=400, detail="La configuration SFTP n'est pas active")
    
    sftp_service = get_sftp_service()
    
    # Démarrer le polling
    await sftp_service.start_polling(
        tenant.id,
        tenant_slug,
        interval=config.get("polling_interval", 30)
    )
    
    return {"message": "Polling SFTP démarré", "interval": config.get("polling_interval", 30)}


@router.post("/{tenant_slug}/sftp/stop-polling")
async def stop_sftp_polling(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Arrêter le polling SFTP pour ce tenant"""
    if current_user.role not in ["admin", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    sftp_service = get_sftp_service()
    
    await sftp_service.stop_polling(tenant.id)
    
    return {"message": "Polling SFTP arrêté"}


@router.post("/{tenant_slug}/sftp/check-now")
async def check_sftp_now(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Vérifier le SFTP immédiatement (sans attendre le polling)"""
    if current_user.role not in ["admin", "superviseur", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    sftp_service = get_sftp_service()
    
    new_interventions = await sftp_service.check_sftp_for_tenant(tenant.id, tenant_slug)
    
    # Mettre à jour le timestamp de dernière vérification
    await db.sftp_configs.update_one(
        {"tenant_id": tenant.id},
        {"$set": {
            "last_check": datetime.now(timezone.utc),
            "last_files_count": len(new_interventions)
        }}
    )
    
    return {
        "message": f"{len(new_interventions)} intervention(s) importée(s)",
        "interventions": [
            {
                "id": i.get("id"),
                "external_call_id": i.get("external_call_id"),
                "address": i.get("address_full"),
                "type": i.get("type_intervention")
            }
            for i in new_interventions
        ]
    }


@router.get("/{tenant_slug}/sftp/status")
async def get_sftp_status(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Obtenir le statut du service SFTP"""
    if current_user.role not in ["admin", "superviseur", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    sftp_service = get_sftp_service()
    ws_manager = get_websocket_manager()
    
    config = await db.sftp_configs.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0, "password": 0}
    )
    
    return {
        "configured": config is not None,
        "config_active": config.get("actif", False) if config else False,
        "polling_active": tenant.id in sftp_service.polling_tasks,
        "polling_interval": config.get("polling_interval", 30) if config else None,
        "last_check": config.get("last_check") if config else None,
        "websocket_connections": ws_manager.get_connected_count(tenant.id)
    }


# ==================== ROUTE WEBSOCKET ====================

@router.websocket("/{tenant_slug}/ws/interventions")
async def websocket_interventions(
    websocket: WebSocket,
    tenant_slug: str
):
    """
    WebSocket pour les notifications d'interventions en temps réel.
    
    Messages envoyés:
    - { "type": "new_intervention", "data": {...} }
    - { "type": "intervention_update", "data": {...} }
    - { "type": "ping" }
    
    Messages reçus:
    - { "type": "auth", "token": "..." }
    - { "type": "pong" }
    """
    ws_manager = get_websocket_manager()
    
    # Pour l'instant, accepter sans auth (à sécuriser en production)
    # En production, valider le token JWT
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Générer un ID temporaire pour cet utilisateur
    # En production, extraire du token
    import uuid
    user_id = str(uuid.uuid4())
    
    await ws_manager.connect(websocket, tenant.id, user_id)
    
    try:
        # Envoyer un message de confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connecté pour les interventions"
        })
        
        while True:
            try:
                # Attendre les messages du client
                data = await websocket.receive_json()
                
                if data.get("type") == "auth":
                    # Authentification (à implémenter)
                    # Pour l'instant, juste confirmer
                    await websocket.send_json({"type": "auth_ok"})
                
                elif data.get("type") == "pong":
                    # Réponse au ping
                    pass
                
                elif data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                    
            except Exception as e:
                logger.error(f"Erreur réception WebSocket: {e}")
                break
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket déconnecté: {user_id}")
    finally:
        await ws_manager.disconnect(tenant.id, user_id)
