"""
Rétrocompatibilité — Redirige vers le service Azure Blob Storage.
Tous les modules existants qui importent depuis utils.object_storage
continueront de fonctionner sans modification.
"""
from services.azure_storage import (
    put_object,
    get_object,
    delete_object,
    generate_sas_url,
    get_content_type,
    generate_storage_path,
    upload_base64_to_azure,
)
