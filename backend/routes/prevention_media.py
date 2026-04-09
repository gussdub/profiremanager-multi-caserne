"""
Routes API pour les Photos et Icônes personnalisées (Module Prévention)
=======================================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.
MIGRÉ vers Azure Blob Storage (avec rétrocompatibilité base64 legacy).

Routes:
- POST   /{tenant_slug}/prevention/upload-photo                       - Upload photo prévention
- POST   /{tenant_slug}/inventaires/upload-photo                      - Upload photo inventaire
- GET    /{tenant_slug}/inventaires/photos/{photo_id}                 - Récupérer photo inventaire
- GET    /{tenant_slug}/prevention/photos/{photo_id}                  - Récupérer photo prévention
- DELETE /{tenant_slug}/prevention/photos/{photo_id}                  - Supprimer photo
- POST   /{tenant_slug}/prevention/icones-personnalisees              - Créer icône
- GET    /{tenant_slug}/prevention/icones-personnalisees              - Liste icônes
- DELETE /{tenant_slug}/prevention/icones-personnalisees/{icone_id}   - Supprimer icône
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone
from starlette.responses import Response
import uuid
import base64
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    require_permission,
)

from routes.prevention_models import (
    IconePersonnaliseeCreate,
)

from services.azure_storage import (
    upload_base64_to_azure,
    generate_sas_url,
    delete_object,
)

router = APIRouter(tags=["Prévention - Photos & Icônes"])
logger = logging.getLogger(__name__)


# ==================== UPLOAD PHOTOS ====================

@router.post("/{tenant_slug}/prevention/upload-photo")
async def upload_photo(
    tenant_slug: str,
    photo_base64: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Upload une photo vers Azure Blob Storage et retourne l'URL SAS"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "photos")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        photo_id = str(uuid.uuid4())
        
        # Upload vers Azure Blob Storage
        azure_result = upload_base64_to_azure(photo_base64, tenant.id, "prevention-photos", filename)
        
        # Stocker uniquement les métadonnées dans MongoDB
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "blob_name": azure_result["blob_name"],
            "content_type": azure_result["content_type"],
            "size": azure_result["size"],
            "storage": "azure",
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.photos_prevention.insert_one(photo_doc)
        
        return {
            "photo_id": photo_id,
            "url": azure_result["url"]
        }
    except Exception as e:
        logger.error("Erreur upload photo prévention: %s", e)
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")

@router.post("/{tenant_slug}/inventaires/upload-photo")
async def upload_inventaire_photo(
    tenant_slug: str,
    photo_base64: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Upload une photo d'inventaire vers Azure Blob Storage"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        photo_id = str(uuid.uuid4())
        
        # Upload vers Azure Blob Storage
        azure_result = upload_base64_to_azure(photo_base64, tenant.id, "inventaires-photos", filename)
        
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "blob_name": azure_result["blob_name"],
            "content_type": azure_result["content_type"],
            "size": azure_result["size"],
            "storage": "azure",
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "type": "inventaire_vehicule"
        }
        
        await db.photos_inventaires.insert_one(photo_doc)
        
        return {
            "photo_id": photo_id,
            "url": azure_result["url"]
        }
    except Exception as e:
        logger.error("Erreur upload photo inventaire: %s", e)
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")


# ==================== RÉCUPÉRATION PHOTOS ====================

@router.get("/{tenant_slug}/inventaires/photos/{photo_id}")
async def get_inventaire_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo d'inventaire (Azure SAS ou legacy base64)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    photo = await db.photos_inventaires.find_one({
        "id": photo_id,
        "tenant_id": tenant.id
    }, {"_id": 0})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    # Nouvelle photo Azure → retourner SAS URL
    if photo.get("storage") == "azure" and photo.get("blob_name"):
        return {"url": generate_sas_url(photo["blob_name"]), "storage": "azure"}
    
    # Legacy : photo base64 dans MongoDB → servir comme avant
    if photo.get('data'):
        if photo['data'].startswith('data:'):
            header, data = photo['data'].split(',', 1)
            mime_type = header.split(':')[1].split(';')[0]
        else:
            data = photo['data']
            mime_type = 'image/png'
        image_data = base64.b64decode(data)
        return Response(content=image_data, media_type=mime_type)
    
    raise HTTPException(status_code=404, detail="Données photo manquantes")

@router.get("/{tenant_slug}/prevention/photos/{photo_id}")
async def get_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo prévention (Azure SAS ou legacy base64)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    photo = await db.photos_prevention.find_one({"id": photo_id, "tenant_id": tenant.id}, {"_id": 0})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    # Nouvelle photo Azure
    if photo.get("storage") == "azure" and photo.get("blob_name"):
        return {
            "id": photo["id"],
            "filename": photo.get("filename", "photo.jpg"),
            "url": generate_sas_url(photo["blob_name"]),
            "storage": "azure",
            "uploaded_at": photo.get("uploaded_at")
        }
    
    # Legacy base64
    return {
        "id": photo["id"],
        "filename": photo.get("filename", "photo.jpg"),
        "data": photo.get("data", ""),
        "uploaded_at": photo.get("uploaded_at")
    }

@router.delete("/{tenant_slug}/prevention/photos/{photo_id}")
async def delete_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une photo (Azure + MongoDB)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "photos")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer les infos pour supprimer le blob Azure
    photo = await db.photos_prevention.find_one({"id": photo_id, "tenant_id": tenant.id}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    # Supprimer le blob Azure si applicable
    if photo.get("storage") == "azure" and photo.get("blob_name"):
        delete_object(photo["blob_name"])
    
    # Supprimer le document MongoDB
    await db.photos_prevention.delete_one({"id": photo_id, "tenant_id": tenant.id})
    
    return {"message": "Photo supprimée avec succès"}


# ==================== ICÔNES PERSONNALISÉES ====================

@router.post("/{tenant_slug}/prevention/icones-personnalisees")
async def create_icone_personnalisee(
    tenant_slug: str,
    icone: IconePersonnaliseeCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une icône personnalisée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "icones")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        icone_dict = icone.dict()
        icone_dict["id"] = str(uuid.uuid4())
        icone_dict["tenant_id"] = tenant.id
        icone_dict["created_by_id"] = current_user.id
        icone_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.icones_personnalisees.insert_one(icone_dict)
        
        return clean_mongo_doc(icone_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur création icône: {str(e)}")

@router.get("/{tenant_slug}/prevention/icones-personnalisees")
async def get_icones_personnalisees(
    tenant_slug: str,
    categorie: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les icônes personnalisées d'un tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    if categorie:
        query["categorie"] = categorie
    
    icones = await db.icones_personnalisees.find(query).to_list(length=None)
    
    return [clean_mongo_doc(icone) for icone in icones]

@router.delete("/{tenant_slug}/prevention/icones-personnalisees/{icone_id}")
async def delete_icone_personnalisee(
    tenant_slug: str,
    icone_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une icône personnalisée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "icones")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.icones_personnalisees.delete_one({"id": icone_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Icône non trouvée")
    
    return {"message": "Icône supprimée avec succès"}
