"""
Routes API pour le module Types de Garde
========================================

STATUT: ACTIF
Ce module gère les types de garde (ex: Jour, Nuit, Astreinte, etc.)

Routes:
- POST   /{tenant_slug}/types-garde                  - Créer un type de garde
- GET    /{tenant_slug}/types-garde                  - Liste des types de garde
- PUT    /{tenant_slug}/types-garde/{type_garde_id} - Modifier un type de garde
- DELETE /{tenant_slug}/types-garde/{type_garde_id} - Supprimer un type de garde
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
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Types de Garde"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class TypeGarde(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []  # monday, tuesday, etc.
    officier_obligatoire: bool = False
    competences_requises: List[str] = []  # Liste des formations/compétences requises pour cette garde
    est_garde_externe: bool = False  # True si c'est une garde externe (astreinte à domicile)
    taux_horaire_externe: Optional[float] = None  # Taux horaire spécifique pour garde externe
    montant_garde: Optional[float] = None  # Montant fixe de la garde (prime)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TypeGardeCreate(BaseModel):
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []
    officier_obligatoire: bool = False
    competences_requises: List[str] = []
    est_garde_externe: bool = False
    taux_horaire_externe: Optional[float] = None
    montant_garde: Optional[float] = None  # Montant fixe de la garde (prime)


# ==================== HELPERS ====================

def calculer_duree_heures(heure_debut: str, heure_fin: str) -> float:
    """
    Calcule la durée en heures entre deux horaires.
    Gère les gardes qui traversent minuit.
    """
    try:
        debut = datetime.strptime(heure_debut, "%H:%M")
        fin = datetime.strptime(heure_fin, "%H:%M")
        
        duree_calculee = (fin - debut).total_seconds() / 3600
        
        # Si heure de fin < heure de début, c'est une garde qui traverse minuit
        if duree_calculee < 0:
            duree_calculee += 24
        
        return round(duree_calculee, 2)
    except Exception as e:
        logger.error(f"❌ [TYPE GARDE] Erreur calcul durée: {e}")
        return 8  # Fallback sur 8h si erreur


# ==================== ROUTES ====================

@router.post("/{tenant_slug}/types-garde", response_model=TypeGarde)
async def create_type_garde(
    tenant_slug: str,
    type_garde: TypeGardeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau type de garde"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    type_garde_dict = type_garde.dict()
    type_garde_dict["tenant_id"] = tenant.id
    
    # CALCUL AUTOMATIQUE de duree_heures à partir de heure_debut et heure_fin
    if type_garde_dict.get("heure_debut") and type_garde_dict.get("heure_fin"):
        duree_calculee = calculer_duree_heures(
            type_garde_dict["heure_debut"], 
            type_garde_dict["heure_fin"]
        )
        type_garde_dict["duree_heures"] = duree_calculee
        logger.info(f"✅ [TYPE GARDE] Durée calculée: {duree_calculee}h ({type_garde_dict['heure_debut']} → {type_garde_dict['heure_fin']})")
    
    type_garde_obj = TypeGarde(**type_garde_dict)
    await db.types_garde.insert_one(type_garde_obj.dict())
    return type_garde_obj


@router.get("/{tenant_slug}/types-garde", response_model=List[TypeGarde])
async def get_types_garde(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère tous les types de garde du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # OPTIMISATION: Projection explicite + exclusion _id
    types_garde = await db.types_garde.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(1000)
    
    cleaned_types = [clean_mongo_doc(type_garde) for type_garde in types_garde]
    return [TypeGarde(**type_garde) for type_garde in cleaned_types]


@router.put("/{tenant_slug}/types-garde/{type_garde_id}", response_model=TypeGarde)
async def update_type_garde(
    tenant_slug: str,
    type_garde_id: str,
    type_garde_update: TypeGardeCreate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un type de garde"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if type garde exists dans ce tenant
    existing_type = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    if not existing_type:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    # Update type garde data
    type_dict = type_garde_update.dict()
    type_dict["id"] = type_garde_id
    type_dict["tenant_id"] = tenant.id
    type_dict["created_at"] = existing_type.get("created_at")
    
    # CALCUL AUTOMATIQUE de duree_heures à partir de heure_debut et heure_fin
    if type_dict.get("heure_debut") and type_dict.get("heure_fin"):
        duree_calculee = calculer_duree_heures(
            type_dict["heure_debut"], 
            type_dict["heure_fin"]
        )
        type_dict["duree_heures"] = duree_calculee
        logger.info(f"✅ [TYPE GARDE UPDATE] Durée calculée: {duree_calculee}h ({type_dict['heure_debut']} → {type_dict['heure_fin']})")
    else:
        # Garder la durée existante si erreur
        type_dict["duree_heures"] = existing_type.get("duree_heures", 8)
    
    result = await db.types_garde.replace_one(
        {"id": type_garde_id, "tenant_id": tenant.id}, 
        type_dict
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de mettre à jour le type de garde")
    
    updated_type = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    updated_type = clean_mongo_doc(updated_type)
    return TypeGarde(**updated_type)


@router.delete("/{tenant_slug}/types-garde/{type_garde_id}")
async def delete_type_garde(
    tenant_slug: str,
    type_garde_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un type de garde et toutes ses assignations"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if type garde exists
    existing_type = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    if not existing_type:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    # Delete type garde
    result = await db.types_garde.delete_one({"id": type_garde_id, "tenant_id": tenant.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le type de garde")
    
    # Also delete related assignations
    deleted_assignations = await db.assignations.delete_many({"type_garde_id": type_garde_id})
    
    logger.info(f"🗑️ Type de garde '{existing_type.get('nom')}' supprimé avec {deleted_assignations.deleted_count} assignations")
    
    return {
        "message": "Type de garde supprimé avec succès",
        "assignations_supprimees": deleted_assignations.deleted_count
    }
