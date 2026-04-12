"""
Utilitaire partagé pour les uploads par chunks.
Permet de gérer les gros fichiers (> 10 Mo) pour tous les types d'import.
Les chunks ET les sessions sont stockés sur disque (survit aux redémarrages).
"""
import os
import uuid
import json
import shutil
import tempfile
from datetime import datetime, timezone
from typing import Optional
from fastapi import UploadFile

import logging
logger = logging.getLogger(__name__)

CHUNK_SIZE = 10 * 1024 * 1024  # 10 Mo par chunk
CHUNKS_DIR = os.path.join(tempfile.gettempdir(), "pfm_upload_chunks")
os.makedirs(CHUNKS_DIR, exist_ok=True)


def _session_path(upload_id: str) -> str:
    return os.path.join(CHUNKS_DIR, upload_id, "_session.json")


def _save_session(upload_id: str, data: dict):
    with open(_session_path(upload_id), "w") as f:
        json.dump(data, f)


def _load_session(upload_id: str) -> Optional[dict]:
    path = _session_path(upload_id)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def init_upload(tenant_id: str, user_id: str, filename: str, total_size: int, total_chunks: int) -> str:
    """Initialise un upload par chunks. Retourne l'upload_id."""
    upload_id = str(uuid.uuid4())
    upload_dir = os.path.join(CHUNKS_DIR, upload_id)
    os.makedirs(upload_dir, exist_ok=True)

    session = {
        "upload_id": upload_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "filename": filename,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "received_chunks": [],
        "upload_dir": upload_dir,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_session(upload_id, session)
    return upload_id


def get_upload_session(upload_id: str) -> Optional[dict]:
    """Récupère les métadonnées d'un upload (depuis le disque)."""
    return _load_session(upload_id)


async def save_chunk(upload_id: str, chunk_index: int, file: UploadFile) -> dict:
    """Sauvegarde un chunk sur disque. Retourne le statut."""
    session = _load_session(upload_id)
    if not session:
        return {"error": "Session d'upload non trouvée"}

    upload_dir = session["upload_dir"]
    chunk_path = os.path.join(upload_dir, f"chunk_{chunk_index:06d}")

    # Écrire sur disque par blocs de 1 Mo
    with open(chunk_path, "wb") as f:
        while True:
            block = await file.read(1024 * 1024)
            if not block:
                break
            f.write(block)

    # Mettre à jour la liste des chunks reçus
    if chunk_index not in session["received_chunks"]:
        session["received_chunks"].append(chunk_index)
    _save_session(upload_id, session)

    received = len(session["received_chunks"])
    total = session["total_chunks"]

    return {
        "status": "received",
        "chunk_index": chunk_index,
        "received": received,
        "total": total,
        "complete": received >= total,
    }


def assemble_chunks(upload_id: str) -> str:
    """
    Assemble les chunks en un seul fichier sur disque.
    Retourne le chemin du fichier assemblé.
    """
    session = _load_session(upload_id)
    if not session:
        raise ValueError("Session d'upload non trouvée")

    total = session["total_chunks"]
    upload_dir = session["upload_dir"]

    received = session.get("received_chunks", [])
    if len(received) < total:
        raise ValueError(f"Chunks manquants: {len(received)}/{total}")

    final_path = os.path.join(upload_dir, "assembled_file")
    with open(final_path, "wb") as out:
        for i in range(total):
            chunk_path = os.path.join(upload_dir, f"chunk_{i:06d}")
            if not os.path.exists(chunk_path):
                raise ValueError(f"Chunk {i} manquant sur disque")
            with open(chunk_path, "rb") as chunk_file:
                while True:
                    block = chunk_file.read(8 * 1024 * 1024)
                    if not block:
                        break
                    out.write(block)

    # Supprimer les chunks individuels et la session
    for i in range(total):
        chunk_path = os.path.join(upload_dir, f"chunk_{i:06d}")
        try:
            os.remove(chunk_path)
        except OSError:
            pass
    try:
        os.remove(_session_path(upload_id))
    except OSError:
        pass

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
    Sauvegarde un upload direct (non-chunked) sur disque.
    Lit par blocs pour ne pas exploser la RAM.
    """
    upload_id = str(uuid.uuid4())
    upload_dir = os.path.join(CHUNKS_DIR, upload_id)
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.join(upload_dir, "uploaded_file")
    with open(file_path, "wb") as f:
        while True:
            chunk = await file.read(8 * 1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    return file_path
