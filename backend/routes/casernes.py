"""
Routes API pour le module Multi-Casernes
=========================================

STATUT: ACTIF
Ce module gere les casernes au sein d'un tenant.
Quand le toggle multi_casernes_actif est OFF, tout fonctionne comme avant.
Quand il est ON, les casernes sont utilisees pour filtrer le planning,
l'attribution automatique et les remplacements.

Routes:
- GET    /{tenant_slug}/casernes                  - Liste des casernes
- POST   /{tenant_slug}/casernes                  - Creer une caserne
- PUT    /{tenant_slug}/casernes/{caserne_id}      - Modifier une caserne
- DELETE /{tenant_slug}/casernes/{caserne_id}      - Supprimer une caserne
- GET    /{tenant_slug}/casernes/config            - Etat du toggle multi-casernes
- PUT    /{tenant_slug}/casernes/config            - Activer/desactiver le multi-casernes
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    invalidate_tenant_cache,
    User,
    require_permission,
)

router = APIRouter(tags=["Casernes"])
logger = logging.getLogger(__name__)


# ==================== MODELES ====================

class Caserne(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    code: Optional[str] = None
    adresse: Optional[str] = None
    telephone: Optional[str] = None
    couleur: str = "#3B82F6"
    actif: bool = True
    ordre: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CaserneCreate(BaseModel):
    nom: str
    code: Optional[str] = None
    adresse: Optional[str] = None
    telephone: Optional[str] = None
    couleur: str = "#3B82F6"
    ordre: int = 0


class CaserneUpdate(BaseModel):
    nom: Optional[str] = None
    code: Optional[str] = None
    adresse: Optional[str] = None
    telephone: Optional[str] = None
    couleur: Optional[str] = None
    actif: Optional[bool] = None
    ordre: Optional[int] = None


class MultiCasernesConfig(BaseModel):
    multi_casernes_actif: bool


# ==================== ROUTES CONFIG ====================

@router.get("/{tenant_slug}/casernes/config")
async def get_multi_casernes_config(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Recuperer l'etat du toggle multi-casernes"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")

    tenant_doc = await db.tenants.find_one({"id": tenant.id}, {"_id": 0, "multi_casernes_actif": 1})
    return {
        "multi_casernes_actif": tenant_doc.get("multi_casernes_actif", False) if tenant_doc else False
    }


@router.put("/{tenant_slug}/casernes/config")
async def update_multi_casernes_config(
    tenant_slug: str,
    config: MultiCasernesConfig,
    current_user: User = Depends(get_current_user)
):
    """Activer ou desactiver le mode multi-casernes"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Seuls les admins peuvent modifier cette configuration")

    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {"multi_casernes_actif": config.multi_casernes_actif}}
    )
    invalidate_tenant_cache(tenant_slug)

    logger.info(f"Multi-casernes {'active' if config.multi_casernes_actif else 'desactive'} pour {tenant_slug}")
    return {"message": f"Multi-casernes {'active' if config.multi_casernes_actif else 'desactive'}", "multi_casernes_actif": config.multi_casernes_actif}


# ==================== ROUTES CRUD ====================

@router.get("/{tenant_slug}/casernes")
async def get_casernes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste de toutes les casernes du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")

    casernes = await db.casernes.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("ordre", 1).to_list(100)

    return casernes


@router.post("/{tenant_slug}/casernes")
async def create_caserne(
    tenant_slug: str,
    data: CaserneCreate,
    current_user: User = Depends(get_current_user)
):
    """Creer une nouvelle caserne"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Seuls les admins peuvent creer des casernes")

    # Verifier unicite du nom
    existing = await db.casernes.find_one({"tenant_id": tenant.id, "nom": data.nom})
    if existing:
        raise HTTPException(status_code=400, detail=f"Une caserne nommee '{data.nom}' existe deja")

    caserne = Caserne(
        tenant_id=tenant.id,
        nom=data.nom,
        code=data.code,
        adresse=data.adresse,
        telephone=data.telephone,
        couleur=data.couleur,
        ordre=data.ordre,
    )

    caserne_dict = caserne.dict()
    await db.casernes.insert_one(caserne_dict)

    response = {k: v for k, v in caserne_dict.items() if k != '_id'}
    if isinstance(response.get('created_at'), datetime):
        response['created_at'] = response['created_at'].isoformat()

    logger.info(f"Caserne creee: {data.nom} pour {tenant_slug}")
    return response


@router.put("/{tenant_slug}/casernes/{caserne_id}")
async def update_caserne(
    tenant_slug: str,
    caserne_id: str,
    data: CaserneUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier une caserne existante"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Seuls les admins peuvent modifier des casernes")

    existing = await db.casernes.find_one({"id": caserne_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Caserne non trouvee")

    update_data = {k: v for k, v in data.dict(exclude_unset=True).items()}

    # Verifier unicite du nom si modifie
    if "nom" in update_data:
        dupe = await db.casernes.find_one({
            "tenant_id": tenant.id,
            "nom": update_data["nom"],
            "id": {"$ne": caserne_id}
        })
        if dupe:
            raise HTTPException(status_code=400, detail=f"Une caserne nommee '{update_data['nom']}' existe deja")

    if update_data:
        await db.casernes.update_one(
            {"id": caserne_id, "tenant_id": tenant.id},
            {"$set": update_data}
        )

    updated = await db.casernes.find_one({"id": caserne_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), datetime):
        updated['created_at'] = updated['created_at'].isoformat()

    logger.info(f"Caserne mise a jour: {caserne_id} pour {tenant_slug}")
    return updated


@router.delete("/{tenant_slug}/casernes/{caserne_id}")
async def delete_caserne(
    tenant_slug: str,
    caserne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une caserne"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Acces refuse")
    if current_user.role not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Seuls les admins peuvent supprimer des casernes")

    existing = await db.casernes.find_one({"id": caserne_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Caserne non trouvee")

    # Verifier s'il y a des utilisateurs rattaches
    users_count = await db.users.count_documents({
        "tenant_id": tenant.id,
        "caserne_ids": caserne_id
    })
    if users_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer: {users_count} employe(s) sont rattache(s) a cette caserne. Retirez-les d'abord."
        )

    await db.casernes.delete_one({"id": caserne_id, "tenant_id": tenant.id})

    logger.info(f"Caserne supprimee: {caserne_id} pour {tenant_slug}")
    return {"message": "Caserne supprimee avec succes"}
