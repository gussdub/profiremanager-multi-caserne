"""
Routes API pour la configuration CAUCA API CAD Transfert
========================================================

Routes accessibles UNIQUEMENT aux super-administrateurs depuis /admin.
Permet de configurer l'intégration avec l'API CAUCA pour la réception des cartes d'appel.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging
import os

from routes.dependencies import (
    db,
    get_super_admin,
    get_tenant_from_slug,
    SuperAdmin
)
from services.cauca_api_service import get_cauca_service
from services.azure_storage import put_object

router = APIRouter(tags=["CAUCA API CAD Transfert"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class CAUCAConfigCreate(BaseModel):
    """Configuration CAUCA API pour un tenant"""
    api_url: str = "https://cad-transfert.cauca.ca/api"
    ssi_token: str  # Token fourni par CAUCA pour ce service incendie
    polling_interval: int = 300  # Intervalle de vérification en secondes (défaut: 5 minutes)
    actif: bool = True
    description: Optional[str] = None


class CAUCAConfigUpdate(BaseModel):
    """Mise à jour de configuration CAUCA API"""
    api_url: Optional[str] = None
    ssi_token: Optional[str] = None
    polling_interval: Optional[int] = None
    actif: Optional[bool] = None
    description: Optional[str] = None


class CAUCAConfig(BaseModel):
    """Configuration CAUCA API complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    api_url: str = "https://cad-transfert.cauca.ca/api"
    ssi_token: str
    certificate_blob_name: Optional[str] = None  # Stocké dans Azure Blob Storage
    private_key_blob_name: Optional[str] = None  # Stocké dans Azure Blob Storage
    polling_interval: int = 300
    actif: bool = True
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    last_check: Optional[datetime] = None
    last_events_count: int = 0


# ==================== ROUTES CONFIGURATION CAUCA ====================

@router.get("/{tenant_slug}/cauca-api/config")
async def get_cauca_config(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer la configuration CAUCA API du tenant (Super-admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.cauca_configs.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not config:
        return None
    
    # Ajouter le statut du polling
    cauca_service = get_cauca_service()
    config["polling_active"] = tenant.id in cauca_service.polling_tasks
    
    return config


@router.post("/{tenant_slug}/cauca-api/config")
async def create_cauca_config(
    tenant_slug: str,
    config_data: CAUCAConfigCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer une configuration CAUCA API pour un tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si une config existe déjà
    existing = await db.cauca_configs.find_one({"tenant_id": tenant.id})
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Une configuration CAUCA existe déjà pour ce tenant. Utilisez PUT pour la modifier."
        )
    
    config = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "api_url": config_data.api_url,
        "ssi_token": config_data.ssi_token,
        "certificate_blob_name": None,
        "private_key_blob_name": None,
        "polling_interval": config_data.polling_interval,
        "actif": config_data.actif,
        "description": config_data.description,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
        "last_check": None,
        "last_events_count": 0
    }
    
    await db.cauca_configs.insert_one(config)
    
    logger.info(f"Configuration CAUCA créée pour tenant {tenant.slug} par admin {admin.email}")
    
    return {"success": True, "message": "Configuration CAUCA créée avec succès", "config": config}


@router.put("/{tenant_slug}/cauca-api/config")
async def update_cauca_config(
    tenant_slug: str,
    config_data: CAUCAConfigUpdate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Mettre à jour la configuration CAUCA API"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    existing = await db.cauca_configs.find_one({"tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Configuration CAUCA non trouvée")
    
    # Construire les mises à jour
    updates = {}
    if config_data.api_url is not None:
        updates["api_url"] = config_data.api_url
    if config_data.ssi_token is not None:
        updates["ssi_token"] = config_data.ssi_token
    if config_data.polling_interval is not None:
        updates["polling_interval"] = config_data.polling_interval
    if config_data.actif is not None:
        updates["actif"] = config_data.actif
    if config_data.description is not None:
        updates["description"] = config_data.description
    
    updates["updated_at"] = datetime.now(timezone.utc)
    
    await db.cauca_configs.update_one(
        {"tenant_id": tenant.id},
        {"$set": updates}
    )
    
    # Si la config est désactivée, arrêter le polling
    if config_data.actif is False:
        cauca_service = get_cauca_service()
        await cauca_service.stop_polling(tenant.id)
    
    logger.info(f"Configuration CAUCA mise à jour pour tenant {tenant.slug} par admin {admin.email}")
    
    return {"success": True, "message": "Configuration CAUCA mise à jour"}


@router.delete("/{tenant_slug}/cauca-api/config")
async def delete_cauca_config(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer la configuration CAUCA API"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Arrêter le polling d'abord
    cauca_service = get_cauca_service()
    await cauca_service.stop_polling(tenant.id)
    
    result = await db.cauca_configs.delete_one({"tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Configuration CAUCA non trouvée")
    
    logger.info(f"Configuration CAUCA supprimée pour tenant {tenant.slug} par admin {admin.email}")
    
    return {"success": True, "message": "Configuration CAUCA supprimée"}


# ==================== UPLOAD CERTIFICATS SSL ====================

@router.post("/{tenant_slug}/cauca-api/upload-certificate")
async def upload_certificate(
    tenant_slug: str,
    certificate: UploadFile = File(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Upload du certificat SSL client (fourni par CAUCA après envoi du CSR)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.cauca_configs.find_one({"tenant_id": tenant.id})
    if not config:
        raise HTTPException(status_code=404, detail="Configuration CAUCA non trouvée")
    
    # Lire le fichier
    cert_content = await certificate.read()
    
    # Stocker dans Azure Blob Storage
    blob_name = f"profiremanager/{tenant.id}/cauca/certificate.pem"
    put_object(blob_name, cert_content, "application/x-pem-file")
    
    # Mettre à jour la config
    await db.cauca_configs.update_one(
        {"tenant_id": tenant.id},
        {"$set": {
            "certificate_blob_name": blob_name,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Certificat CAUCA uploadé pour tenant {tenant.slug}")
    
    return {"success": True, "message": "Certificat SSL uploadé avec succès"}


@router.post("/{tenant_slug}/cauca-api/upload-private-key")
async def upload_private_key(
    tenant_slug: str,
    private_key: UploadFile = File(...),
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Upload de la clé privée SSL (générée lors du CSR)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.cauca_configs.find_one({"tenant_id": tenant.id})
    if not config:
        raise HTTPException(status_code=404, detail="Configuration CAUCA non trouvée")
    
    # Lire le fichier
    key_content = await private_key.read()
    
    # Stocker dans Azure Blob Storage
    blob_name = f"profiremanager/{tenant.id}/cauca/private_key.pem"
    put_object(blob_name, key_content, "application/x-pem-file")
    
    # Mettre à jour la config
    await db.cauca_configs.update_one(
        {"tenant_id": tenant.id},
        {"$set": {
            "private_key_blob_name": blob_name,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Clé privée CAUCA uploadée pour tenant {tenant.slug}")
    
    return {"success": True, "message": "Clé privée SSL uploadée avec succès"}


# ==================== POLLING CONTROL ====================

@router.post("/{tenant_slug}/cauca-api/start-polling")
async def start_cauca_polling(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Démarrer la surveillance automatique CAUCA API"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.cauca_configs.find_one({"tenant_id": tenant.id, "actif": True})
    if not config:
        raise HTTPException(
            status_code=400,
            detail="Configuration CAUCA non trouvée ou inactive"
        )
    
    # Vérifier que les certificats sont présents
    if not config.get("certificate_blob_name") or not config.get("private_key_blob_name"):
        raise HTTPException(
            status_code=400,
            detail="Certificat SSL ou clé privée manquant. Veuillez les uploader d'abord."
        )
    
    cauca_service = get_cauca_service()
    result = await cauca_service.start_polling(tenant.id)
    
    if result["success"]:
        logger.info(f"Polling CAUCA démarré pour tenant {tenant.slug} par admin {admin.email}")
        return {"success": True, "message": "Surveillance CAUCA démarrée"}
    else:
        raise HTTPException(status_code=500, detail=result.get("error", "Erreur inconnue"))


@router.post("/{tenant_slug}/cauca-api/stop-polling")
async def stop_cauca_polling(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Arrêter la surveillance automatique CAUCA API"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    cauca_service = get_cauca_service()
    await cauca_service.stop_polling(tenant.id)
    
    logger.info(f"Polling CAUCA arrêté pour tenant {tenant.slug} par admin {admin.email}")
    
    return {"success": True, "message": "Surveillance CAUCA arrêtée"}


@router.get("/{tenant_slug}/cauca-api/status")
async def get_cauca_status(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Obtenir le statut actuel de la surveillance CAUCA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    config = await db.cauca_configs.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not config:
        return {
            "configured": False,
            "polling_active": False,
            "message": "Configuration CAUCA non trouvée"
        }
    
    cauca_service = get_cauca_service()
    polling_active = tenant.id in cauca_service.polling_tasks
    
    return {
        "configured": True,
        "polling_active": polling_active,
        "config": {
            "api_url": config["api_url"],
            "polling_interval": config["polling_interval"],
            "actif": config["actif"],
            "has_certificate": config.get("certificate_blob_name") is not None,
            "has_private_key": config.get("private_key_blob_name") is not None,
            "last_check": config.get("last_check"),
            "last_events_count": config.get("last_events_count", 0)
        }
    }


# ==================== CODES D'INTERVENTION ====================

@router.get("/cauca-api/codes-intervention")
async def get_codes_intervention_cauca(
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer tous les codes d'intervention CAUCA"""
    codes = await db.codes_intervention_cauca.find(
        {"actif": True},
        {"_id": 0}
    ).sort("code", 1).to_list(length=None)
    
    return {"codes": codes, "total": len(codes)}
