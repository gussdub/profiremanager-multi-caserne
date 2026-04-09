"""
Routes API pour la Personnalisation (Logo & Branding)
=====================================================

STATUT: ACTIF
Ce module gère la personnalisation visuelle du tenant (logo, nom, branding).

Routes:
- GET  /{tenant_slug}/public/branding           - Branding public (sans auth)
- GET  /{tenant_slug}/personnalisation          - Paramètres de personnalisation
- PUT  /{tenant_slug}/personnalisation          - Modifier la personnalisation
- POST /{tenant_slug}/personnalisation/upload-logo - Uploader un logo (base64)
"""

from fastapi import APIRouter, Depends, HTTPException
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    invalidate_tenant_cache,
    User,
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Personnalisation"])
logger = logging.getLogger(__name__)


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/public/branding")
async def get_public_branding(tenant_slug: str):
    """
    Récupérer les paramètres de branding publics (pas d'authentification requise).
    Utilisé sur la page de connexion pour afficher le logo et le nom du service.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    logo_url = tenant.logo_url if hasattr(tenant, 'logo_url') else ""
    # Résoudre blob_name en SAS URL
    tenant_doc = await db.tenants.find_one({"id": tenant.id}, {"logo_blob_name": 1})
    if tenant_doc and tenant_doc.get("logo_blob_name"):
        from services.azure_storage import generate_sas_url
        logo_url = generate_sas_url(tenant_doc["logo_blob_name"])
    
    return {
        "logo_url": logo_url,
        "nom_service": tenant.nom_service if hasattr(tenant, 'nom_service') else tenant.nom,
        "afficher_profiremanager": tenant.afficher_profiremanager if hasattr(tenant, 'afficher_profiremanager') else True
    }


@router.get("/{tenant_slug}/personnalisation")
async def get_personnalisation(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres de personnalisation du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    logo_url = tenant.logo_url if hasattr(tenant, 'logo_url') else ""
    tenant_doc = await db.tenants.find_one({"id": tenant.id}, {"logo_blob_name": 1})
    if tenant_doc and tenant_doc.get("logo_blob_name"):
        from services.azure_storage import generate_sas_url
        logo_url = generate_sas_url(tenant_doc["logo_blob_name"])
    
    return {
        "logo_url": logo_url,
        "nom_service": tenant.nom_service if hasattr(tenant, 'nom_service') else tenant.nom,
        "afficher_profiremanager": tenant.afficher_profiremanager if hasattr(tenant, 'afficher_profiremanager') else True
    }


@router.put("/{tenant_slug}/personnalisation")
async def update_personnalisation(
    tenant_slug: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres de personnalisation (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modifier sur le module parametres/personnalisation
    await require_permission(tenant.id, current_user, "parametres", "modifier", "personnalisation")
    
    # Préparer les mises à jour
    update_data = {}
    
    if "logo_url" in data:
        update_data["logo_url"] = data["logo_url"]
    
    if "nom_service" in data:
        update_data["nom_service"] = data["nom_service"]
    
    if "afficher_profiremanager" in data:
        update_data["afficher_profiremanager"] = data["afficher_profiremanager"]
    
    # Mettre à jour dans MongoDB
    if update_data:
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": update_data}
        )
        # Invalider le cache pour que les prochaines lectures reflètent la mise à jour
        invalidate_tenant_cache(tenant_slug)
        logger.info(f"🎨 Personnalisation mise à jour pour {tenant_slug}: {list(update_data.keys())}")
    
    return {
        "message": "Personnalisation mise à jour avec succès",
        **update_data
    }


@router.post("/{tenant_slug}/personnalisation/upload-logo")
async def upload_logo(
    tenant_slug: str,
    logo_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Upload du logo vers Azure Blob Storage"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modifier sur le module parametres/personnalisation
    await require_permission(tenant.id, current_user, "parametres", "modifier", "personnalisation")
    
    # Récupérer les données base64
    if "logo_base64" not in logo_data:
        raise HTTPException(status_code=400, detail="Données logo manquantes")
    
    logo_base64 = logo_data["logo_base64"]
    
    # Vérifier que c'est bien du base64 valide
    if not logo_base64.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Format d'image invalide")
    
    # Upload vers Azure
    from services.azure_storage import upload_base64_to_azure, generate_sas_url
    result = upload_base64_to_azure(logo_base64, tenant.id, "logos", f"logo_{tenant.id}.png")
    sas_url = generate_sas_url(result["blob_name"])
    
    # Stocker le blob_name dans MongoDB
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {"logo_blob_name": result["blob_name"], "logo_url": None}}
    )
    # Invalider le cache pour que les prochaines lectures reflètent la mise à jour
    invalidate_tenant_cache(tenant_slug)
    
    logger.info(f"Logo uploadé vers Azure pour {tenant_slug}")
    
    return {
        "message": "Logo uploadé avec succès",
        "logo_url": sas_url
    }
