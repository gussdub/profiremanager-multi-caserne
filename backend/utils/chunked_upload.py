"""
Utilitaire partagé pour les uploads par chunks.
Stockage persistant : chunks dans Azure Blob Storage, sessions dans MongoDB.
Survit aux redémarrages du serveur (Render, etc.).
"""
import os
import uuid
import tempfile
import shutil
from datetime import datetime, timezone
from typing import Optional
from fastapi import UploadFile

import logging
logger = logging.getLogger(__name__)

CHUNK_SIZE = 10 * 1024 * 1024  # 10 Mo par chunk

# Répertoire local temporaire (assemblage uniquement)
LOCAL_TMP = os.path.join(tempfile.gettempdir(), "pfm_upload_tmp")
os.makedirs(LOCAL_TMP, exist_ok=True)


async def _get_db():
    """Accès à la base MongoDB."""
    from routes.dependencies import db
    return db


def _chunk_blob_path(upload_id: str, chunk_index: int) -> str:
    """Chemin Azure pour un chunk."""
    return f"_tmp_chunks/{upload_id}/chunk_{chunk_index:06d}"


async def init_upload(tenant_id: str, user_id: str, filename: str, total_size: int, total_chunks: int) -> str:
    """Initialise un upload. Session stockée dans MongoDB."""
    db = await _get_db()
    upload_id = str(uuid.uuid4())

    await db.upload_sessions.insert_one({
        "upload_id": upload_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "filename": filename,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "received_chunks": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info("Upload init: %s (%s, %d chunks)", upload_id, filename, total_chunks)
    return upload_id


async def get_upload_session(upload_id: str) -> Optional[dict]:
    """Récupère la session depuis MongoDB."""
    db = await _get_db()
    session = await db.upload_sessions.find_one(
        {"upload_id": upload_id},
        {"_id": 0}
    )
    return session


async def save_chunk(upload_id: str, chunk_index: int, file: UploadFile) -> dict:
    """Sauvegarde un chunk dans Azure Blob Storage."""
    db = await _get_db()
    session = await db.upload_sessions.find_one({"upload_id": upload_id}, {"_id": 0})
    if not session:
        return {"error": "Session d'upload non trouvée"}

    # Lire le chunk
    chunk_data = await file.read()

    # Upload vers Azure
    from services.azure_storage import put_object
    blob_path = _chunk_blob_path(upload_id, chunk_index)
    put_object(blob_path, chunk_data, "application/octet-stream")

    # Incrémenter le compteur (atomique)
    await db.upload_sessions.update_one(
        {"upload_id": upload_id},
        {"$inc": {"received_chunks": 1}}
    )

    # Relire le compteur mis à jour
    session = await db.upload_sessions.find_one({"upload_id": upload_id}, {"_id": 0})
    received = session["received_chunks"] if session else 0
    total = session["total_chunks"] if session else 0

    return {
        "status": "received",
        "chunk_index": chunk_index,
        "received": received,
        "total": total,
        "complete": received >= total,
    }


async def assemble_chunks(upload_id: str) -> str:
    """
    Télécharge les chunks depuis Azure et assemble en fichier local.
    Retourne le chemin du fichier assemblé.
    """
    db = await _get_db()
    session = await db.upload_sessions.find_one({"upload_id": upload_id}, {"_id": 0})
    if not session:
        raise ValueError("Session d'upload non trouvée")

    total = session["total_chunks"]
    received = session.get("received_chunks", 0)
    if received < total:
        raise ValueError(f"Chunks manquants: {received}/{total}")

    from services.azure_storage import get_object, delete_object

    # Assembler dans un fichier local temporaire
    assemble_dir = os.path.join(LOCAL_TMP, upload_id)
    os.makedirs(assemble_dir, exist_ok=True)
    final_path = os.path.join(assemble_dir, "assembled_file")

    with open(final_path, "wb") as out:
        for i in range(total):
            blob_path = _chunk_blob_path(upload_id, i)
            try:
                data, _ = get_object(blob_path)
                out.write(data)
            except Exception as e:
                raise ValueError(f"Impossible de lire le chunk {i}: {e}")

    size_mb = os.path.getsize(final_path) / (1024 * 1024)
    logger.info("Upload %s assemblé: %.1f Mo", upload_id, size_mb)

    # Nettoyer Azure (en arrière-plan, non bloquant)
    for i in range(total):
        try:
            delete_object(_chunk_blob_path(upload_id, i))
        except Exception:
            pass

    # Supprimer la session MongoDB
    await db.upload_sessions.delete_one({"upload_id": upload_id})

    return final_path


def cleanup_file(file_path: str):
    """Nettoie un fichier temporaire local."""
    if not file_path:
        return
    try:
        if os.path.isfile(file_path):
            os.remove(file_path)
        parent = os.path.dirname(file_path)
        if parent.startswith(LOCAL_TMP) and os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)
    except Exception:
        pass


async def save_upload_to_disk(file: UploadFile) -> str:
    """
    Sauvegarde un upload direct (non-chunked) sur disque local.
    Pour les petits fichiers (< CHUNK_SIZE).
    """
    upload_id = str(uuid.uuid4())
    upload_dir = os.path.join(LOCAL_TMP, upload_id)
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, "uploaded_file")
    with open(file_path, "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return file_path
