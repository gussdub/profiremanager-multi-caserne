"""
Utilitaire pour le stockage d'objets (Object Storage) via Emergent Integrations.
Gère l'upload et le téléchargement de fichiers (photos, PDFs, etc.)
"""
import os
import uuid
import logging
import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "profiremanager"

storage_key = None

MIME_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
    "json": "application/json",
    "csv": "text/csv",
    "txt": "text/plain",
    "xml": "application/xml",
}


def init_storage():
    """Initialise la connexion au storage. Appelé une seule fois au démarrage."""
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": EMERGENT_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    logger.info("Object Storage initialisé avec succès")
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload un fichier. Retourne {"path": "...", "size": 123, "etag": "..."}"""
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    """Télécharge un fichier. Retourne (content_bytes, content_type)."""
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def get_content_type(filename: str) -> str:
    """Détermine le content-type à partir de l'extension du fichier."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return MIME_TYPES.get(ext, "application/octet-stream")


def generate_storage_path(tenant_id: str, category: str, filename: str) -> str:
    """Génère un chemin de stockage unique."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    unique_name = f"{uuid.uuid4()}.{ext}"
    return f"{APP_NAME}/{tenant_id}/{category}/{unique_name}"
