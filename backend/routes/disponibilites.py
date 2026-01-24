"""
Routes API pour le module Disponibilités
=========================================

STATUT: ACTIF
Ce module gère les disponibilités des pompiers.

Routes de base (les routes avancées restent dans server.py pour l'instant):
- GET    /{tenant_slug}/disponibilites/{user_id}  - Disponibilités d'un utilisateur
- POST   /{tenant_slug}/disponibilites            - Créer une disponibilité
- PUT    /{tenant_slug}/disponibilites/{user_id}  - Modifier disponibilités
- GET    /{tenant_slug}/disponibilites/statut-blocage - Statut de blocage
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date
import uuid
import logging

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Disponibilités"])


# ==================== MODÈLES ====================

class Disponibilite(BaseModel):
    """Modèle disponibilité"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    tenant_id: str
    date: str  # Format YYYY-MM-DD
    type_garde_id: str
    est_disponible: bool = True
    commentaire: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        extra = "allow"


class DisponibiliteCreate(BaseModel):
    """Modèle pour la création d'une disponibilité"""
    date: str
    type_garde_id: str
    est_disponible: bool = True
    commentaire: Optional[str] = None


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/disponibilites/statut-blocage")
async def get_statut_blocage(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Retourne le statut de blocage des soumissions"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    params = await db.parametres_disponibilites.find_one({"tenant_id": tenant.id})
    
    if not params:
        return {
            "bloque": False,
            "message": "Soumissions ouvertes",
            "deadline": None
        }
    
    today = date.today()
    jour_fin = params.get("jour_fin_soumission", 25)
    bloque = params.get("bloquer_apres_deadline", False) and today.day > jour_fin
    
    return {
        "bloque": bloque,
        "message": f"Deadline: jour {jour_fin} du mois",
        "deadline": jour_fin,
        "jour_actuel": today.day
    }


@router.get("/{tenant_slug}/disponibilites/{user_id}", response_model=List[Disponibilite])
async def get_disponibilites_user(
    tenant_slug: str,
    user_id: str,
    mois: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère les disponibilités d'un utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    # Vérifier permissions
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Construire le filtre
    filter_query = {"user_id": user_id, "tenant_id": tenant.id}
    
    if mois:
        filter_query["date"] = {"$regex": f"^{mois}"}
    
    dispos = await db.disponibilites.find(filter_query).to_list(1000)
    cleaned_dispos = [clean_mongo_doc(d) for d in dispos]
    
    return [Disponibilite(**d) for d in cleaned_dispos]


@router.post("/{tenant_slug}/disponibilites", response_model=Disponibilite)
async def create_disponibilite(
    tenant_slug: str,
    dispo: DisponibiliteCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle disponibilité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    # Vérifier si l'utilisateur peut soumettre (deadline)
    params = await db.parametres_disponibilites.find_one({"tenant_id": tenant.id})
    if params and params.get("bloquer_apres_deadline"):
        today = date.today()
        jour_fin = params.get("jour_fin_soumission", 25)
        
        if today.day > jour_fin and current_user.role not in ["admin", "superviseur"]:
            raise HTTPException(
                status_code=400,
                detail=f"La période de soumission est terminée (deadline: jour {jour_fin})"
            )
    
    # Créer la disponibilité
    dispo_dict = dispo.dict()
    dispo_dict["id"] = str(uuid.uuid4())
    dispo_dict["user_id"] = current_user.id
    dispo_dict["tenant_id"] = tenant.id
    dispo_dict["created_at"] = datetime.now(timezone.utc)
    
    await db.disponibilites.insert_one(dispo_dict)
    
    return Disponibilite(**dispo_dict)


@router.put("/{tenant_slug}/disponibilites/{user_id}")
async def update_disponibilites(
    tenant_slug: str,
    user_id: str,
    disponibilites: List[Dict] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour les disponibilités d'un utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    # Vérification de sécurité côté serveur
    if current_user.id != user_id and current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez pas modifier les disponibilités d'un autre utilisateur"
        )
    
    # Vérifier que l'utilisateur modifié appartient au même tenant
    target_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Supprimer les anciennes disponibilités pour ce mois
    if disponibilites and len(disponibilites) > 0:
        mois = disponibilites[0].get("date", "")[:7]  # Format YYYY-MM
        await db.disponibilites.delete_many({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": {"$regex": f"^{mois}"}
        })
    
    # Insérer les nouvelles
    for dispo in disponibilites:
        dispo["id"] = dispo.get("id") or str(uuid.uuid4())
        dispo["user_id"] = user_id
        dispo["tenant_id"] = tenant.id
        dispo["updated_at"] = datetime.now(timezone.utc)
        await db.disponibilites.insert_one(dispo)
    
    return {"message": f"{len(disponibilites)} disponibilités mises à jour"}
