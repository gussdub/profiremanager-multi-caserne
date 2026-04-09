"""
Script de migration des anciennes photos base64/Emergent vers Azure Blob Storage.
À exécuter une seule fois. Idempotent (skip les docs déjà migrés).
"""
import asyncio
import os
import sys
import logging
import base64
import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from services.azure_storage import put_object, generate_sas_url, generate_storage_path, get_content_type

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME", "profiremanager-dev")


def upload_base64(data_url: str, tenant_id: str, category: str, filename: str):
    """Upload base64 data URL vers Azure et retourne le blob_name."""
    if "," in data_url:
        header, b64_data = data_url.split(",", 1)
    else:
        b64_data = data_url
    
    raw = base64.b64decode(b64_data)
    ct = get_content_type(filename)
    path = generate_storage_path(tenant_id, category, filename)
    put_object(path, raw, ct)
    return path


async def migrate_photos_inventaires(db):
    """Migrer photos_inventaires legacy (base64 dans 'data')."""
    logger.info("--- Migration photos_inventaires ---")
    docs = await db.photos_inventaires.find({"storage": {"$ne": "azure"}, "data": {"$exists": True}}).to_list(1000)
    count = 0
    for doc in docs:
        data = doc.get("data", "")
        if not data:
            continue
        try:
            tenant_id = doc.get("tenant_id", "unknown")
            filename = doc.get("filename", f"inventaire_{doc.get('id', 'photo')}.jpg")
            blob_name = upload_base64(data, tenant_id, "inventaires-photos", filename)
            await db.photos_inventaires.update_one(
                {"_id": doc["_id"]},
                {"$set": {"blob_name": blob_name, "storage": "azure"}, "$unset": {"data": ""}}
            )
            count += 1
            logger.info(f"  Migré photo inventaire: {doc.get('id')}")
        except Exception as e:
            logger.error(f"  ERREUR photo inventaire {doc.get('id')}: {e}")
    logger.info(f"  => {count} photos inventaires migrées")


async def migrate_batiments_photo_url(db):
    """Migrer batiments.photo_url (base64 → Azure)."""
    logger.info("--- Migration batiments.photo_url ---")
    docs = await db.batiments.find(
        {"photo_url": {"$regex": "^data:image"}, "photo_storage": {"$ne": "azure"}},
        {"_id": 1, "id": 1, "photo_url": 1, "tenant_id": 1}
    ).to_list(1000)
    count = 0
    for doc in docs:
        try:
            tenant_id = doc.get("tenant_id", "unknown")
            blob_name = upload_base64(doc["photo_url"], tenant_id, "batiments-photos", f"batiment_{doc['id']}.jpg")
            sas_url = generate_sas_url(blob_name)
            await db.batiments.update_one(
                {"_id": doc["_id"]},
                {"$set": {"photo_url": sas_url, "photo_blob_name": blob_name, "photo_storage": "azure"}}
            )
            count += 1
            logger.info(f"  Migré photo bâtiment: {doc.get('id')}")
        except Exception as e:
            logger.error(f"  ERREUR bâtiment {doc.get('id')}: {e}")
    logger.info(f"  => {count} photos bâtiments migrées")


async def migrate_vehicules_qr(db):
    """Migrer vehicules.qr_code (base64 → Azure)."""
    logger.info("--- Migration vehicules.qr_code ---")
    docs = await db.vehicules.find(
        {"qr_code": {"$regex": "^data:"}, "qr_code_blob_name": {"$exists": False}},
        {"_id": 1, "id": 1, "qr_code": 1, "tenant_id": 1}
    ).to_list(1000)
    count = 0
    for doc in docs:
        try:
            tenant_id = doc.get("tenant_id", "unknown")
            blob_name = upload_base64(doc["qr_code"], tenant_id, "qr-codes", f"vehicule_{doc['id']}.png")
            sas_url = generate_sas_url(blob_name)
            await db.vehicules.update_one(
                {"_id": doc["_id"]},
                {"$set": {"qr_code": sas_url, "qr_code_blob_name": blob_name}}
            )
            count += 1
            logger.info(f"  Migré QR code véhicule: {doc.get('id')}")
        except Exception as e:
            logger.error(f"  ERREUR véhicule {doc.get('id')}: {e}")
    logger.info(f"  => {count} QR codes migrés")


async def migrate_users_photo_profil(db):
    """Migrer users.photo_profil (base64 → Azure)."""
    logger.info("--- Migration users.photo_profil ---")
    docs = await db.users.find(
        {"photo_profil": {"$regex": "^data:"}, "photo_profil_blob_name": {"$exists": False}},
        {"_id": 1, "id": 1, "photo_profil": 1, "tenant_id": 1, "email": 1}
    ).to_list(1000)
    count = 0
    for doc in docs:
        try:
            tenant_id = doc.get("tenant_id", "unknown")
            blob_name = upload_base64(doc["photo_profil"], tenant_id, "profils", f"user_{doc['id']}.jpg")
            sas_url = generate_sas_url(blob_name)
            await db.users.update_one(
                {"_id": doc["_id"]},
                {"$set": {"photo_profil": sas_url, "photo_profil_blob_name": blob_name}}
            )
            count += 1
            logger.info(f"  Migré photo profil: {doc.get('email')}")
        except Exception as e:
            logger.error(f"  ERREUR user {doc.get('email')}: {e}")
    logger.info(f"  => {count} photos profil migrées")


async def migrate_stored_files(db):
    """Migrer stored_files legacy (Emergent Object Storage → Azure)."""
    logger.info("--- Migration stored_files (Emergent → Azure) ---")
    docs = await db.stored_files.find(
        {"storage": {"$ne": "azure"}, "is_deleted": {"$ne": True}},
        {"_id": 1, "id": 1, "storage_path": 1, "tenant_id": 1, "original_filename": 1, "content_type": 1}
    ).to_list(5000)
    
    if not docs:
        logger.info("  Aucun fichier legacy à migrer")
        return
    
    # Tenter de télécharger depuis Emergent Object Storage
    STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
    STORAGE_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
    
    count = 0
    errors = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        for doc in docs:
            path = doc.get("storage_path", "")
            if not path:
                continue
            try:
                # Télécharger depuis Emergent
                resp = await client.get(
                    f"{STORAGE_URL}/objects/{path}",
                    headers={"Authorization": f"Bearer {STORAGE_KEY}"}
                )
                if resp.status_code != 200:
                    logger.warning(f"  Fichier introuvable sur Emergent: {path} (HTTP {resp.status_code})")
                    errors += 1
                    continue
                
                data = resp.content
                ct = doc.get("content_type", "application/octet-stream")
                
                # Upload vers Azure au même path
                put_object(path, data, ct)
                
                await db.stored_files.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"storage": "azure", "blob_name": path}}
                )
                count += 1
                if count % 10 == 0:
                    logger.info(f"  ... {count}/{len(docs)} fichiers migrés")
            except Exception as e:
                logger.error(f"  ERREUR fichier {doc.get('id')}: {e}")
                errors += 1
    
    logger.info(f"  => {count} fichiers migrés, {errors} erreurs")


async def main():
    logger.info("========================================")
    logger.info("MIGRATION BASE64/EMERGENT → AZURE BLOB STORAGE")
    logger.info("========================================\n")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    await migrate_photos_inventaires(db)
    await migrate_batiments_photo_url(db)
    await migrate_vehicules_qr(db)
    await migrate_users_photo_profil(db)
    await migrate_stored_files(db)
    
    logger.info("\n========================================")
    logger.info("MIGRATION TERMINÉE")
    logger.info("========================================")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
