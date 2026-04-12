"""
Utilitaire partagé pour les uploads par chunks.
Permet de gérer les gros fichiers (> 50 Mo) pour tous les types d'import.
Les chunks sont stockés sur disque, jamais en RAM.
"""
import os
import uuid
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Dict, Optional
from fastapi import UploadFile

import logging
logger = logging.getLogger(__name__)

CHUNK_SIZE = 50 * 1024 * 1024  # 50 Mo
CHUNKS_DIR = os.path.join(tempfile.gettempdir(), "pfm_upload_chunks")
os.makedirs(CHUNKS_DIR, exist_ok=True)

# Métadonnées des uploads en cours (léger, en mémoire)
_upload_sessions: Dict[str, dict] = {}


def init_upload(tenant_id: str, user_id: str, filename: str, total_size: int, total_chunks: int) -> str:
    """Initialise un upload par chunks. Retourne l'upload_id."""
    upload_id = str(uuid.uuid4())
    upload_dir = os.path.join(CHUNKS_DIR, upload_id)
    os.makedirs(upload_dir, exist_ok=True)

    _upload_sessions[upload_id] = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "filename": filename,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "received_count": 0,
        "upload_dir": upload_dir,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return upload_id


def get_upload_session(upload_id: str) -> Optional[dict]:
    """Récupère les métadonnées d'un upload."""
    return _upload_sessions.get(upload_id)


async def save_chunk(upload_id: str, chunk_index: int, file: UploadFile) -> dict:
    """Sauvegarde un chunk sur disque. Retourne le statut."""
    session = _upload_sessions.get(upload_id)
    if not session:
        return {"error": "Session d'upload non trouvée"}

    chunk_path = os.path.join(session["upload_dir"], f"chunk_{chunk_index:06d}")
    chunk_data = await file.read()
    with open(chunk_path, "wb") as f:
        f.write(chunk_data)

    session["received_count"] += 1
    return {
        "status": "received",
        "chunk_index": chunk_index,
        "received": session["received_count"],
        "total": session["total_chunks"],
        "complete": session["received_count"] >= session["total_chunks"],
    }


def assemble_chunks(upload_id: str) -> str:
    """
    Assemble les chunks en un seul fichier sur disque.
    Retourne le chemin du fichier assemblé.
    Lève une exception si des chunks manquent.
    """
    session = _upload_sessions.get(upload_id)
    if not session:
        raise ValueError("Session d'upload non trouvée")

    total = session["total_chunks"]
    upload_dir = session["upload_dir"]

    received_files = [f for f in os.listdir(upload_dir) if f.startswith("chunk_")]
    if len(received_files) < total:
        raise ValueError(f"Chunks manquants: {len(received_files)}/{total}")

    final_path = os.path.join(upload_dir, "assembled_file")
    with open(final_path, "wb") as out:
        for i in range(total):
            chunk_path = os.path.join(upload_dir, f"chunk_{i:06d}")
            if not os.path.exists(chunk_path):
                raise ValueError(f"Chunk {i} manquant")
            with open(chunk_path, "rb") as chunk_file:
                while True:
                    block = chunk_file.read(8 * 1024 * 1024)  # 8 Mo
                    if not block:
                        break
                    out.write(block)

    # Supprimer les chunks individuels pour libérer l'espace disque
    for i in range(total):
        chunk_path = os.path.join(upload_dir, f"chunk_{i:06d}")
        try:
            os.remove(chunk_path)
        except OSError:
            pass

    # Supprimer la session mémoire
    del _upload_sessions[upload_id]

    logger.info("Upload %s assemblé: %s (%.1f Mo)", upload_id, final_path, os.path.getsize(final_path) / (1024 * 1024))
    return final_path


def cleanup_file(file_path: str):
    """Nettoie un fichier temporaire et son dossier parent si dans CHUNKS_DIR."""
    if not file_path:
        return
    try:
        if os.path.isfile(file_path):
            os.remove(file_path)
        parent = os.path.dirname(file_path)
        if parent.startswith(CHUNKS_DIR) and os.path.isdir(parent):
            shutil.rmtree(parent, ignore_errors=True)
    except Exception:
        pass


async def save_upload_to_disk(file: UploadFile) -> str:
    """
    Sauvegarde un upload direct (non-chunked) sur disque au lieu de le garder en RAM.
    Retourne le chemin du fichier temporaire.
    """
    upload_id = str(uuid.uuid4())
    upload_dir = os.path.join(CHUNKS_DIR, upload_id)
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, "uploaded_file")
    with open(file_path, "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)  # Lire 8 Mo à la fois
            if not chunk:
                break
            f.write(chunk)
    
    return file_path
