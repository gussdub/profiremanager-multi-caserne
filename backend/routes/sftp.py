"""
Routes API pour la configuration SFTP et le polling des cartes d'appel
=====================================================================

Ces routes sont accessibles UNIQUEMENT aux super-administrateurs depuis /admin.
"""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_super_admin,
    get_tenant_from_slug,
    SuperAdmin
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
    polling_interval: int = 300  # Intervalle en secondes (défaut: 5 minutes)
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
    polling_interval: int = 300  # Défaut: 5 minutes
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer la configuration SFTP du tenant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.sftp_configs.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}  # Inclure le mot de passe pour les super-admins
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer ou mettre à jour la configuration SFTP (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si une config existe déjà
    existing = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    
    if existing:
        # Mettre à jour - exclure le mot de passe s'il est vide pour conserver l'ancien
        update_data = config_data.dict()
        
        # Si le mot de passe est vide, ne pas l'inclure dans la mise à jour
        if not update_data.get("password"):
            del update_data["password"]
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await db.sftp_configs.update_one(
            {"tenant_id": tenant.id},
            {"$set": update_data}
        )
        
        return {"message": "Configuration SFTP mise à jour", "id": existing["id"]}
    else:
        # Créer - le mot de passe est obligatoire pour une nouvelle config
        if not config_data.password:
            raise HTTPException(status_code=400, detail="Le mot de passe est obligatoire pour une nouvelle configuration")
        
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Mettre à jour la configuration SFTP (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    existing = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
    
    # Exclure les valeurs None ET le mot de passe vide
    update_data = {}
    for k, v in config_data.dict().items():
        if v is None:
            continue
        # Ne pas inclure le mot de passe s'il est vide
        if k == "password" and not v:
            continue
        update_data[k] = v
    
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer la configuration SFTP (Super-admin uniquement)"""
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """
    Tester la connexion SFTP (Super-admin uniquement).
    Si config_data est fourni, teste avec ces paramètres.
    Sinon, teste avec la configuration existante.
    """
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Démarrer le polling SFTP pour ce tenant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la config existe et est active
    config = await db.sftp_configs.find_one({"tenant_id": tenant.id})
    if not config:
        raise HTTPException(status_code=404, detail="Configuration SFTP non trouvée")
    
    if not config.get("actif", False):
        raise HTTPException(status_code=400, detail="La configuration SFTP n'est pas active")
    
    sftp_service = get_sftp_service()
    
    # Récupérer l'intervalle configuré (minimum 60 secondes)
    interval = max(60, config.get("polling_interval", 300))
    
    # Démarrer le polling
    await sftp_service.start_polling(
        tenant.id,
        tenant_slug,
        interval=interval
    )
    
    return {"message": "Polling SFTP démarré", "interval": interval, "interval_minutes": interval // 60}


@router.post("/{tenant_slug}/sftp/stop-polling")
async def stop_sftp_polling(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Arrêter le polling SFTP pour ce tenant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    sftp_service = get_sftp_service()
    
    await sftp_service.stop_polling(tenant.id)
    
    return {"message": "Polling SFTP arrêté"}


@router.post("/{tenant_slug}/sftp/check-now")
async def check_sftp_now(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Vérifier le SFTP immédiatement (Super-admin uniquement)"""
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
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Obtenir le statut du service SFTP (Super-admin uniquement)"""
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



# ==================== ROUTES CONFIGURATION SFTP PREMIER RÉPONDANT ====================

@router.get("/{tenant_slug}/sftp-pr/config")
async def get_sftp_pr_config(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer la configuration SFTP Premier Répondant du tenant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.sftp_configs_pr.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not config:
        return None
    
    # Ajouter le statut du polling
    sftp_service = get_sftp_service()
    polling_key = f"{tenant.id}_pr"
    config["polling_active"] = polling_key in sftp_service.polling_tasks
    
    return config


@router.post("/{tenant_slug}/sftp-pr/config")
async def create_sftp_pr_config(
    tenant_slug: str,
    config_data: SFTPConfigCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer ou mettre à jour la configuration SFTP Premier Répondant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si une config existe déjà
    existing = await db.sftp_configs_pr.find_one({"tenant_id": tenant.id})
    
    if existing:
        update_data = config_data.dict()
        if not update_data.get("password"):
            del update_data["password"]
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        await db.sftp_configs_pr.update_one(
            {"tenant_id": tenant.id},
            {"$set": update_data}
        )
        
        return {"message": "Configuration SFTP Premier Répondant mise à jour", "id": existing["id"]}
    else:
        if not config_data.password:
            raise HTTPException(status_code=400, detail="Le mot de passe est obligatoire pour une nouvelle configuration")
        
        config = SFTPConfig(
            tenant_id=tenant.id,
            **config_data.dict()
        )
        
        await db.sftp_configs_pr.insert_one(config.dict())
        
        return {"message": "Configuration SFTP Premier Répondant créée", "id": config.id}


@router.put("/{tenant_slug}/sftp-pr/config")
async def update_sftp_pr_config(
    tenant_slug: str,
    config_data: SFTPConfigUpdate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Mettre à jour la configuration SFTP Premier Répondant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    existing = await db.sftp_configs_pr.find_one({"tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration SFTP Premier Répondant non trouvée")
    
    update_data = {}
    for k, v in config_data.dict().items():
        if v is None:
            continue
        if k == "password" and not v:
            continue
        update_data[k] = v
    
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.sftp_configs_pr.update_one(
        {"tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    return {"message": "Configuration SFTP Premier Répondant mise à jour"}


@router.delete("/{tenant_slug}/sftp-pr/config")
async def delete_sftp_pr_config(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer la configuration SFTP Premier Répondant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Arrêter le polling s'il est actif
    sftp_service = get_sftp_service()
    polling_key = f"{tenant.id}_pr"
    if polling_key in sftp_service.polling_tasks:
        await sftp_service.stop_polling(polling_key)
    
    result = await db.sftp_configs_pr.delete_one({"tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration non trouvée")
    
    return {"message": "Configuration SFTP Premier Répondant supprimée"}


@router.post("/{tenant_slug}/sftp-pr/test")
async def test_sftp_pr_connection(
    tenant_slug: str,
    config_data: SFTPConfigCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Tester la connexion SFTP Premier Répondant"""
    import paramiko
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Si pas de mot de passe fourni, utiliser celui de la config existante
    password = config_data.password
    if not password:
        existing = await db.sftp_configs_pr.find_one({"tenant_id": tenant.id})
        if existing:
            password = existing.get("password")
        else:
            raise HTTPException(status_code=400, detail="Mot de passe requis pour tester")
    
    try:
        transport = paramiko.Transport((config_data.host, config_data.port))
        transport.connect(username=config_data.username, password=password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        # Tester l'accès au répertoire
        files = sftp.listdir(config_data.remote_path)
        
        sftp.close()
        transport.close()
        
        return {
            "success": True,
            "message": f"Connexion réussie ! {len(files)} fichier(s) trouvé(s)",
            "files_count": len(files)
        }
    except paramiko.AuthenticationException:
        return {"success": False, "message": "Échec d'authentification - vérifiez les identifiants"}
    except Exception as e:
        return {"success": False, "message": f"Erreur de connexion: {str(e)}"}


@router.post("/{tenant_slug}/sftp-pr/start")
async def start_sftp_pr_polling(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Démarrer le polling SFTP Premier Répondant pour un tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.sftp_configs_pr.find_one({"tenant_id": tenant.id})
    if not config:
        raise HTTPException(status_code=404, detail="Configuration SFTP Premier Répondant non trouvée")
    
    if not config.get("actif"):
        raise HTTPException(status_code=400, detail="Configuration SFTP Premier Répondant non active")
    
    sftp_service = get_sftp_service()
    polling_key = f"{tenant.id}_pr"
    
    if polling_key in sftp_service.polling_tasks:
        return {"message": "Polling déjà actif", "status": "running"}
    
    await sftp_service.start_polling_for_tenant(
        tenant_id=tenant.id,
        config=config,
        type_carte="premier_repondant",
        polling_key=polling_key
    )
    
    return {"message": "Polling Premier Répondant démarré", "status": "started"}


@router.post("/{tenant_slug}/sftp-pr/stop")
async def stop_sftp_pr_polling(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Arrêter le polling SFTP Premier Répondant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    sftp_service = get_sftp_service()
    polling_key = f"{tenant.id}_pr"
    
    if polling_key not in sftp_service.polling_tasks:
        return {"message": "Polling non actif", "status": "stopped"}
    
    await sftp_service.stop_polling(polling_key)
    
    return {"message": "Polling Premier Répondant arrêté", "status": "stopped"}


@router.get("/{tenant_slug}/sftp-pr/status")
async def get_sftp_pr_status(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Obtenir le statut du polling SFTP Premier Répondant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.sftp_configs_pr.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0, "password": 0}
    )
    
    sftp_service = get_sftp_service()
    polling_key = f"{tenant.id}_pr"
    is_polling = polling_key in sftp_service.polling_tasks
    
    return {
        "configured": config is not None,
        "polling_active": is_polling,
        "config": config
    }
