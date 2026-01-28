"""
Routes API pour le module Paramètres Généraux
=============================================

STATUT: ACTIF
Ce module gère les paramètres généraux du tenant (niveaux d'attribution, etc.).

Routes:
- GET /{tenant_slug}/parametres/niveaux-attribution     - Obtenir les niveaux d'attribution
- PUT /{tenant_slug}/parametres/niveaux-attribution     - Mettre à jour les niveaux
"""

from fastapi import APIRouter, Depends
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User
)

router = APIRouter(tags=["Paramètres"])
logger = logging.getLogger(__name__)


@router.get("/{tenant_slug}/parametres/niveaux-attribution")
async def get_niveaux_attribution(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres des niveaux d'attribution automatique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Les niveaux sont stockés dans les paramètres du tenant
    return {
        "niveau_2_actif": tenant.parametres.get("niveau_2_actif", True),
        "niveau_3_actif": tenant.parametres.get("niveau_3_actif", True),
        "niveau_4_actif": tenant.parametres.get("niveau_4_actif", True),
        "niveau_5_actif": tenant.parametres.get("niveau_5_actif", True)
    }


@router.put("/{tenant_slug}/parametres/niveaux-attribution")
async def update_niveaux_attribution(
    tenant_slug: str,
    niveaux_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres des niveaux d'attribution automatique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Mettre à jour les niveaux dans les paramètres du tenant
    update_fields = {}
    for key in ['niveau_2_actif', 'niveau_3_actif', 'niveau_4_actif', 'niveau_5_actif']:
        if key in niveaux_data:
            update_fields[f"parametres.{key}"] = niveaux_data[key]
    
    if update_fields:
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": update_fields}
        )
        logger.info(f"✅ Niveaux d'attribution mis à jour pour {tenant.slug}: {update_fields}")
    
    return {"message": "Niveaux d'attribution mis à jour avec succès"}
