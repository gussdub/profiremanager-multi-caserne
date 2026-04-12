"""
Utilitaire partagé pour les uploads par chunks.
Stockage persistant : chunks ET sessions dans MongoDB.
Survit aux redémarrages, pas besoin d'Azure ni de disque local.
MongoDB supporte les documents jusqu'à 16 Mo (chunks de 10 Mo OK).
"""
import os
import uuid
import tempfile
import shutil
from datetime import datetime, timezone
from typing import Optional
from fastapi import UploadFile
from bson import Binary

import logging
logger = logging.getLogger(__name__)

CHUNK_SIZE = 10 * 1024 * 1024  # 10 Mo par chunk

# Répertoire local temporaire (assemblage uniquement, éphémère OK)
LOCAL_TMP = os.path.join(tempfile.gettempdir(), "pfm_upload_tmp")
os.makedirs(LOCAL_TMP, exist_ok=True)


async def _get_db():
    from routes.dependencies import db
    return db


async def init_upload(tenant_id: str, user_id: str, filename: str, total_size: int, total_chunks: int) -> str:
    """Initialise un upload. Session dans MongoDB."""
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
    """Sauvegarde un chunk dans MongoDB (Binary)."""
    db = await _get_db()
    session = await db.upload_sessions.find_one({"upload_id": upload_id}, {"_id": 0})
    if not session:
        return {"error": "Session d'upload non trouvée"}

    try:
        chunk_data = await file.read()

        # Stocker le chunk dans MongoDB
        await db.upload_chunks.update_one(
            {"upload_id": upload_id, "chunk_index": chunk_index},
            {"$set": {
                "upload_id": upload_id,
                "chunk_index": chunk_index,
                "data": Binary(chunk_data),
                "size": len(chunk_data),
            }},
            upsert=True
        )
    except Exception as e:
        logger.error("Erreur save_chunk %s/%d: %s", upload_id, chunk_index, e)
        return {"error": f"Erreur stockage chunk {chunk_index}: {str(e)}"}

    # Incrémenter le compteur (atomique)
    await db.upload_sessions.update_one(
        {"upload_id": upload_id},
        {"$inc": {"received_chunks": 1}}
    )

    # Relire le compteur
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
    Télécharge les chunks depuis MongoDB et assemble en fichier local temporaire.
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

    # Assembler dans un fichier local temporaire
    assemble_dir = os.path.join(LOCAL_TMP, upload_id)
    os.makedirs(assemble_dir, exist_ok=True)
    final_path = os.path.join(assemble_dir, "assembled_file")

    with open(final_path, "wb") as out:
        for i in range(total):
            chunk_doc = await db.upload_chunks.find_one(
                {"upload_id": upload_id, "chunk_index": i}
            )
            if not chunk_doc or "data" not in chunk_doc:
                raise ValueError(f"Chunk {i} manquant dans MongoDB")
            out.write(chunk_doc["data"])

    size_mb = os.path.getsize(final_path) / (1024 * 1024)
    logger.info("Upload %s assemblé: %.1f Mo", upload_id, size_mb)

    # Nettoyer MongoDB (chunks + session)
    await db.upload_chunks.delete_many({"upload_id": upload_id})
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
    Pour les petits fichiers uniquement.
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
