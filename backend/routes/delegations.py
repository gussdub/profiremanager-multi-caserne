"""
Routes API pour la Gestion des Délégations de Responsabilités
=============================================================

STATUT: ACTIF
Ce module gère la délégation automatique des responsabilités
lorsqu'une personne ressource est en congé.

Routes:
- GET  /{tenant_slug}/delegations/actives     - Liste des délégations actives
- POST /{tenant_slug}/delegations/verifier    - Vérifier et mettre à jour les délégations
- GET  /{tenant_slug}/delegations/user/{id}   - Responsabilités d'un utilisateur
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    get_delegations_actives,
    get_user_responsibilities,
    verifier_et_mettre_a_jour_delegations,
    get_user_active_conge
)

router = APIRouter(tags=["Délégations"])
logger = logging.getLogger(__name__)


@router.get("/{tenant_slug}/delegations/actives")
async def get_active_delegations(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère toutes les délégations actives pour le tenant.
    Accessible aux admins et superviseurs.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    delegations = await get_delegations_actives(tenant.id)
    
    return {
        "delegations": delegations,
        "count": len(delegations)
    }


@router.post("/{tenant_slug}/delegations/verifier")
async def verify_delegations(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Vérifie et met à jour les délégations selon les congés actifs.
    Déclenche les notifications de début/fin de délégation si nécessaire.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    await verifier_et_mettre_a_jour_delegations(tenant.id)
    
    # Retourner l'état actuel des délégations
    delegations = await get_delegations_actives(tenant.id)
    
    return {
        "message": "Vérification des délégations effectuée",
        "delegations_actives": len(delegations),
        "delegations": delegations
    }


@router.get("/{tenant_slug}/delegations/user/{user_id}")
async def get_user_responsibilities_endpoint(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les responsabilités d'un utilisateur spécifique.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    responsibilities = await get_user_responsibilities(tenant.id, user_id)
    
    # Vérifier si l'utilisateur est en congé
    conge = await get_user_active_conge(tenant.id, user_id)
    
    # Récupérer les infos de l'utilisateur
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    user_nom = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() if user else "Inconnu"
    
    return {
        "user_id": user_id,
        "user_nom": user_nom,
        "responsibilities": responsibilities,
        "is_on_leave": conge is not None,
        "leave_details": {
            "date_debut": conge.get("date_debut") if conge else None,
            "date_fin": conge.get("date_fin") if conge else None,
            "type": conge.get("type_conge") if conge else None
        } if conge else None
    }


@router.get("/{tenant_slug}/delegations/mes-responsabilites")
async def get_my_responsibilities(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les responsabilités de l'utilisateur connecté.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    responsibilities = await get_user_responsibilities(tenant.id, current_user.id)
    conge = await get_user_active_conge(tenant.id, current_user.id)
    
    return {
        "responsibilities": responsibilities,
        "is_on_leave": conge is not None,
        "leave_details": {
            "date_debut": conge.get("date_debut") if conge else None,
            "date_fin": conge.get("date_fin") if conge else None,
            "type": conge.get("type_conge") if conge else None
        } if conge else None
    }


@router.get("/{tenant_slug}/delegations/recues")
async def get_delegations_received(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les délégations que l'utilisateur connecté a reçues.
    (Responsabilités déléguées par d'autres personnes en congé)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ["admin", "superviseur"]:
        return {"delegations_recues": [], "count": 0}
    
    # Récupérer les délégations où l'utilisateur est délégué
    delegations = await db.delegations_actives.find({
        "tenant_id": tenant.id,
        "delegues_ids": current_user.id
    }).to_list(100)
    
    delegations_clean = [clean_mongo_doc(d) for d in delegations]
    
    return {
        "delegations_recues": delegations_clean,
        "count": len(delegations_clean)
    }
