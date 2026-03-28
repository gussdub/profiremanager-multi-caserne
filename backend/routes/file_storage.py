"""
Routes pour le stockage et la récupération de fichiers via Object Storage.
Gère les uploads/downloads de photos et documents pour tous les modules.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body, Query, Header
from fastapi.responses import Response
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
from utils.object_storage import put_object, get_object, get_content_type, generate_storage_path

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
    """Upload un fichier vers Object Storage et enregistre la référence en base."""
    tenant = await get_tenant_from_slug(tenant_slug)

    data = await file.read()
    content_type = file.content_type or get_content_type(file.filename)
    path = generate_storage_path(tenant.id, category, file.filename)

    result = put_object(path, data, content_type)

    file_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "category": category,
        "entity_type": entity_type,
        "entity_id": entity_id,
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
    }


@router.get("/{tenant_slug}/files/{file_id}/download")
async def download_file(
    tenant_slug: str,
    file_id: str,
    auth: Optional[str] = Query(None),
):
    """Télécharge un fichier depuis Object Storage. Supporte auth via query param pour les img tags."""
    tenant = await get_tenant_from_slug(tenant_slug)

    # Valider le token depuis le query param
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

    data, ct = get_object(record["storage_path"])
    return Response(
        content=data,
        media_type=record.get("content_type", ct),
        headers={
            "Content-Disposition": f'inline; filename="{record["original_filename"]}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@router.get("/{tenant_slug}/files/by-entity/{entity_type}/{entity_id}")
async def list_files_by_entity(
    tenant_slug: str,
    entity_type: str,
    entity_id: str,
    current_user: User = Depends(get_current_user),
):
    """Liste les fichiers associés à une entité (bâtiment, intervention, etc.)."""
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



from pydantic import BaseModel

class ReassignFileRequest(BaseModel):
    new_entity_id: str


@router.put("/{tenant_slug}/files/{file_id}/reassign")
async def reassign_file(
    tenant_slug: str,
    file_id: str,
    body: ReassignFileRequest,
    current_user: User = Depends(get_current_user),
):
    """Reassigne un fichier a une nouvelle entite (ex: deplacer une photo vers un autre batiment)."""
    tenant = await get_tenant_from_slug(tenant_slug)

    record = await db.stored_files.find_one(
        {"id": file_id, "tenant_id": tenant.id, "is_deleted": False},
        {"_id": 0},
    )
    if not record:
        raise HTTPException(status_code=404, detail="Fichier non trouve")

    old_entity_id = record.get("entity_id")

    result = await db.stored_files.update_one(
        {"id": file_id, "tenant_id": tenant.id},
        {
            "$set": {
                "entity_id": body.new_entity_id,
                "reassigned_at": datetime.now(timezone.utc).isoformat(),
                "reassigned_by": current_user.id,
            }
        },
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=500, detail="Erreur lors de la reassignation")

    return {
        "success": True,
        "file_id": file_id,
        "old_entity_id": old_entity_id,
        "new_entity_id": body.new_entity_id,
    }
