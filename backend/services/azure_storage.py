"""
Service Azure Blob Storage — Stockage hybride pour ProFireManager
=================================================================
Remplace l'ancien Emergent Object Storage.
- Upload de fichiers (photos, PDFs) vers Azure Blob Storage
- Génération de SAS URLs temporaires (15 min) pour accès sécurisé
- Suppression de blobs
- Rétrocompatibilité avec les anciennes fonctions (put_object, get_object)
"""
import os
import uuid
import logging
from datetime import datetime, timedelta, timezone

from azure.storage.blob import BlobServiceClient, generate_blob_sas, BlobSasPermissions, ContentSettings

logger = logging.getLogger(__name__)

ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
ACCOUNT_KEY = os.environ.get("AZURE_STORAGE_ACCOUNT_KEY")
CONTAINER_NAME = os.environ.get("AZURE_STORAGE_CONTAINER_NAME")
SAS_EXPIRY_MINUTES = 15

APP_NAME = "profiremanager"

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

_blob_service_client = None


def _get_client():
    """Obtient ou crée le BlobServiceClient (lazy init)."""
    global _blob_service_client
    if _blob_service_client is None:
        if not ACCOUNT_NAME or not ACCOUNT_KEY:
            raise RuntimeError("Azure Storage credentials manquantes (AZURE_STORAGE_ACCOUNT_NAME / AZURE_STORAGE_ACCOUNT_KEY)")
        conn_str = (
            f"DefaultEndpointsProtocol=https;"
            f"AccountName={ACCOUNT_NAME};"
            f"AccountKey={ACCOUNT_KEY};"
            f"EndpointSuffix=core.windows.net"
        )
        _blob_service_client = BlobServiceClient.from_connection_string(conn_str)
        logger.info("Azure Blob Storage connecté (compte: %s, conteneur: %s)", ACCOUNT_NAME, CONTAINER_NAME)
    return _blob_service_client


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """
    Upload un fichier vers Azure Blob Storage.
    Rétrocompatible avec l'ancienne API Emergent Object Storage.
    
    Args:
        path: Chemin du blob (ex: profiremanager/tenant_id/photos/uuid.jpg)
        data: Contenu binaire du fichier
        content_type: Type MIME (ex: image/jpeg)
    
    Returns:
        {"path": "...", "size": 123, "url": "https://..."}
    """
    client = _get_client()
    container = client.get_container_client(CONTAINER_NAME)
    blob_client = container.get_blob_client(path)

    blob_client.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type),
    )

    logger.info("Blob uploadé: %s (%d bytes, %s)", path, len(data), content_type)
    return {
        "path": path,
        "size": len(data),
        "url": generate_sas_url(path),
    }


def get_object(path: str) -> tuple:
    """
    Télécharge un fichier depuis Azure Blob Storage.
    Rétrocompatible avec l'ancienne API.
    
    Returns:
        (content_bytes, content_type)
    """
    client = _get_client()
    container = client.get_container_client(CONTAINER_NAME)
    blob_client = container.get_blob_client(path)

    download = blob_client.download_blob()
    data = download.readall()
    props = blob_client.get_blob_properties()
    ct = props.content_settings.content_type or "application/octet-stream"

    return data, ct


def delete_object(path: str) -> bool:
    """Supprime un blob. Retourne True si supprimé, False si introuvable."""
    try:
        client = _get_client()
        container = client.get_container_client(CONTAINER_NAME)
        blob_client = container.get_blob_client(path)
        blob_client.delete_blob()
        logger.info("Blob supprimé: %s", path)
        return True
    except Exception as e:
        logger.warning("Impossible de supprimer le blob %s: %s", path, e)
        return False


def generate_sas_url(blob_name: str, expiry_minutes: int = SAS_EXPIRY_MINUTES) -> str:
    """
    Génère une URL présignée (SAS) pour un accès temporaire en lecture seule.
    
    Args:
        blob_name: Chemin complet du blob
        expiry_minutes: Durée de validité en minutes (défaut: 15)
    
    Returns:
        URL complète avec jeton SAS
    """
    start_time = datetime.now(timezone.utc)
    expiry_time = start_time + timedelta(minutes=expiry_minutes)

    sas_token = generate_blob_sas(
        account_name=ACCOUNT_NAME,
        container_name=CONTAINER_NAME,
        blob_name=blob_name,
        account_key=ACCOUNT_KEY,
        permission=BlobSasPermissions(read=True),
        expiry=expiry_time,
        start=start_time,
    )

    return f"https://{ACCOUNT_NAME}.blob.core.windows.net/{CONTAINER_NAME}/{blob_name}?{sas_token}"


def get_content_type(filename: str) -> str:
    """Détermine le content-type à partir de l'extension du fichier."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return MIME_TYPES.get(ext, "application/octet-stream")


def generate_storage_path(tenant_id: str, category: str, filename: str) -> str:
    """Génère un chemin de stockage unique dans le conteneur Azure."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    unique_name = f"{uuid.uuid4()}.{ext}"
    return f"{APP_NAME}/{tenant_id}/{category}/{unique_name}"


def upload_base64_to_azure(base64_data: str, tenant_id: str, category: str, filename: str) -> dict:
    """
    Upload une image base64 vers Azure.
    Utilisé pour migrer les anciennes photos stockées en base64 dans MongoDB.
    
    Returns:
        {"blob_name": "...", "url": "...", "size": 123, "content_type": "..."}
    """
    import base64 as b64

    # Nettoyer le prefix data URI si présent
    if "," in base64_data:
        base64_data = base64_data.split(",", 1)[1]

    data = b64.b64decode(base64_data)
    content_type = get_content_type(filename)
    path = generate_storage_path(tenant_id, category, filename)

    put_object(path, data, content_type)

    return {
        "blob_name": path,
        "url": generate_sas_url(path),
        "size": len(data),
        "content_type": content_type,
    }
