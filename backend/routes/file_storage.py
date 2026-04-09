"""
Routes pour le stockage et la récupération de fichiers via Azure Blob Storage.
Gère les uploads/downloads de photos et documents pour tous les modules.
Retourne des SAS URLs temporaires (15 min) pour l'accès direct depuis le frontend.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body, Query, Header
from fastapi.responses import Response, RedirectResponse
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import jwt
import os

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
)
from services.azure_storage import put_object, get_object, get_content_type, generate_storage_path, generate_sas_url, delete_object

router = APIRouter(tags=["File Storage"])
logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "your-secret-key-here")
JWT_ALGORITHM = "HS256"


@router.post("/{tenant_slug}/files/upload")
async def upload_file(
    tenant_slug: str,
    file: UploadFile = File(...),
    category: str = Query("general"),
    entity_type: Optional[str] = Query(None),
    entity_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
):
    """Upload un fichier vers Azure Blob Storage et enregistre les métadonnées en base."""
    tenant = await get_tenant_from_slug(tenant_slug)

    data = await file.read()
    content_type = file.content_type or get_content_type(file.filename)
    path = generate_storage_path(tenant.id, category, file.filename)

    result = put_object(path, data, content_type)

    file_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "storage_path": result["path"],
        "blob_name": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": category,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "storage": "azure",
        "uploaded_by": current_user.id,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "is_deleted": False,
    }
    await db.stored_files.insert_one(file_doc)

    return {
        "id": file_doc["id"],
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": file_doc["size"],
        "url": result.get("url", ""),
    }


@router.get("/{tenant_slug}/files/{file_id}/download")
async def download_file(
    tenant_slug: str,
    file_id: str,
    auth: Optional[str] = Query(None),
):
    """Redirige vers une URL SAS Azure pour téléchargement direct."""
    tenant = await get_tenant_from_slug(tenant_slug)

    if not auth:
        raise HTTPException(status_code=401, detail="Token d'authentification requis")
    try:
        jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

    record = await db.stored_files.find_one(
        {"id": file_id, "tenant_id": tenant.id, "is_deleted": False},
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Fichier non trouvé")

    blob_name = record.get("blob_name") or record.get("storage_path")
    
    # Fichier Azure : rediriger vers SAS URL
    if blob_name:
        sas_url = generate_sas_url(blob_name)
        return RedirectResponse(url=sas_url, status_code=302)
    
    raise HTTPException(status_code=404, detail="Fichier introuvable dans le stockage")


@router.get("/{tenant_slug}/files/{file_id}/sas-url")
async def get_file_sas_url(
    tenant_slug: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Génère une URL SAS temporaire (15 min) pour accéder au fichier."""
    tenant = await get_tenant_from_slug(tenant_slug)

    record = await db.stored_files.find_one(
        {"id": file_id, "tenant_id": tenant.id, "is_deleted": False},
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Fichier non trouvé")

    blob_name = record.get("blob_name") or record.get("storage_path")
    if not blob_name:
        raise HTTPException(status_code=404, detail="Chemin de stockage manquant")

    return {
        "url": generate_sas_url(blob_name),
        "expires_in_minutes": 15,
        "original_filename": record.get("original_filename"),
        "content_type": record.get("content_type"),
    }


@router.get("/{tenant_slug}/files/by-entity/{entity_type}/{entity_id}")
async def list_files_by_entity(
    tenant_slug: str,
    entity_type: str,
    entity_id: str,
    current_user: User = Depends(get_current_user),
):
    """Liste les fichiers associés à une entité avec SAS URLs."""
    tenant = await get_tenant_from_slug(tenant_slug)

    files = await db.stored_files.find(
        {
            "tenant_id": tenant.id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "is_deleted": False,
        },
        {"_id": 0},
    ).sort("uploaded_at", -1).to_list(length=500)

    # Ajouter les SAS URLs pour chaque fichier
    for f in files:
        blob_name = f.get("blob_name") or f.get("storage_path")
        if blob_name:
            f["url"] = generate_sas_url(blob_name)

    return {"files": files}


@router.delete("/{tenant_slug}/files/{file_id}")
async def soft_delete_file(
    tenant_slug: str,
    file_id: str,
    current_user: User = Depends(get_current_user),
):
    """Supprime (soft) un fichier."""
    tenant = await get_tenant_from_slug(tenant_slug)

    result = await db.stored_files.update_one(
        {"id": file_id, "tenant_id": tenant.id},
        {
            "$set": {
                "is_deleted": True,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "deleted_by": current_user.id,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Fichier non trouvé")

    return {"success": True}
