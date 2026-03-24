"""
Routes API pour les Photos et Icônes personnalisées (Module Prévention)
=======================================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.

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
    """Upload une photo en base64 et retourne l'URL"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "photos")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        photo_id = str(uuid.uuid4())
        
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "data": photo_base64,
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.photos_prevention.insert_one(photo_doc)
        
        return {
            "photo_id": photo_id,
            "url": f"/api/{tenant_slug}/prevention/photos/{photo_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")

@router.post("/{tenant_slug}/inventaires/upload-photo")
async def upload_inventaire_photo(
    tenant_slug: str,
    photo_base64: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Upload une photo pour un inventaire véhicule et retourne l'URL"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        photo_id = str(uuid.uuid4())
        
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "data": photo_base64,
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "type": "inventaire_vehicule"
        }
        
        await db.photos_inventaires.insert_one(photo_doc)
        
        return {
            "photo_id": photo_id,
            "url": f"/api/{tenant_slug}/inventaires/photos/{photo_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")

@router.get("/{tenant_slug}/inventaires/photos/{photo_id}")
async def get_inventaire_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo d'inventaire par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    photo = await db.photos_inventaires.find_one({
        "id": photo_id,
        "tenant_id": tenant.id
    }, {"_id": 0})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    if photo['data'].startswith('data:'):
        header, data = photo['data'].split(',', 1)
        mime_type = header.split(':')[1].split(';')[0]
    else:
        data = photo['data']
        mime_type = 'image/png'
    
    image_data = base64.b64decode(data)
    
    return Response(content=image_data, media_type=mime_type)

@router.get("/{tenant_slug}/prevention/photos/{photo_id}")
async def get_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    photo = await db.photos_prevention.find_one({"id": photo_id, "tenant_id": tenant.id})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    return {
        "id": photo["id"],
        "filename": photo.get("filename", "photo.jpg"),
        "data": photo["data"],
        "uploaded_at": photo.get("uploaded_at")
    }

@router.delete("/{tenant_slug}/prevention/photos/{photo_id}")
async def delete_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une photo"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "photos")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.photos_prevention.delete_one({"id": photo_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
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
