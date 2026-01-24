"""
Routes API pour le module Planning
==================================

Ce fichier contient les routes pour la gestion du planning et des assignations.

STATUT: PRÊT POUR ACTIVATION
Les routes sont dans server.py lignes 8500-9500 environ.

Pour activer ce module:
1. Dans server.py, importer: from routes.planning import router as planning_router
2. Inclure: api_router.include_router(planning_router)
3. Supprimer les routes correspondantes de server.py
4. Tester exhaustivement

Routes incluses:
- GET    /{tenant_slug}/planning/types-garde                  - Liste des types de garde
- POST   /{tenant_slug}/planning/types-garde                  - Créer un type de garde
- PUT    /{tenant_slug}/planning/types-garde/{id}             - Modifier un type
- DELETE /{tenant_slug}/planning/types-garde/{id}             - Supprimer un type
- GET    /{tenant_slug}/planning/assignations/{semaine}       - Assignations de la semaine
- POST   /{tenant_slug}/planning/assignations                 - Créer une assignation
- PUT    /{tenant_slug}/planning/assignations/{id}            - Modifier une assignation
- DELETE /{tenant_slug}/planning/assignations/{id}            - Supprimer une assignation
- POST   /{tenant_slug}/planning/auto-assign                  - Auto-assignation
- GET    /{tenant_slug}/planning/export-pdf                   - Export PDF
- GET    /{tenant_slug}/planning/export-excel                 - Export Excel
- GET    /{tenant_slug}/planning/mes-heures                   - Mes heures travaillées
- GET    /{tenant_slug}/planning/statistiques                 - Statistiques planning
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date, timedelta
import uuid
import logging

# Ces imports seront résolus quand le module sera activé
# from server import (
#     db, 
#     get_current_user, 
#     get_tenant_from_slug, 
#     clean_mongo_doc,
#     User,
#     TypeGarde,
#     Assignation
# )

router = APIRouter(tags=["Planning"])


# ==================== MODÈLES ====================

class TypeGardeCreate(BaseModel):
    """Modèle pour la création d'un type de garde"""
    nom: str
    code: str
    couleur: str = "#3B82F6"
    heure_debut: str = "08:00"
    heure_fin: str = "16:00"
    est_garde_interne: bool = False
    est_rappel: bool = False
    nombre_pompiers_requis: int = 1
    actif: bool = True


class TypeGardeUpdate(BaseModel):
    """Modèle pour la mise à jour d'un type de garde"""
    nom: Optional[str] = None
    code: Optional[str] = None
    couleur: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    est_garde_interne: Optional[bool] = None
    est_rappel: Optional[bool] = None
    nombre_pompiers_requis: Optional[int] = None
    actif: Optional[bool] = None


class AssignationCreate(BaseModel):
    """Modèle pour la création d'une assignation"""
    user_id: str
    date: str  # Format YYYY-MM-DD
    type_garde_id: str
    vehicule_id: Optional[str] = None
    notes: Optional[str] = None


class AssignationUpdate(BaseModel):
    """Modèle pour la mise à jour d'une assignation"""
    user_id: Optional[str] = None
    date: Optional[str] = None
    type_garde_id: Optional[str] = None
    vehicule_id: Optional[str] = None
    notes: Optional[str] = None


# ==================== ROUTES ====================
# Note: Ces routes sont commentées car elles ne sont pas encore activées.
# Décommenter quand prêt à migrer depuis server.py

"""
@router.get("/{tenant_slug}/planning/types-garde")
async def get_types_garde(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    '''Liste tous les types de garde du tenant'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    types = await db.types_garde.find({"tenant_id": tenant.id}).to_list(100)
    return [clean_mongo_doc(t) for t in types]


@router.post("/{tenant_slug}/planning/types-garde")
async def create_type_garde(
    tenant_slug: str,
    type_garde: TypeGardeCreate,
    current_user: User = Depends(get_current_user)
):
    '''Créer un nouveau type de garde'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier unicité du code
    existing = await db.types_garde.find_one({
        "tenant_id": tenant.id,
        "code": type_garde.code
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce code existe déjà")
    
    type_dict = type_garde.dict()
    type_dict["id"] = str(uuid.uuid4())
    type_dict["tenant_id"] = tenant.id
    type_dict["created_at"] = datetime.now(timezone.utc)
    
    await db.types_garde.insert_one(type_dict)
    
    return type_dict


@router.put("/{tenant_slug}/planning/types-garde/{type_id}")
async def update_type_garde(
    tenant_slug: str,
    type_id: str,
    type_update: TypeGardeUpdate,
    current_user: User = Depends(get_current_user)
):
    '''Modifier un type de garde'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in type_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.types_garde.update_one(
        {"id": type_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    return {"message": "Type de garde mis à jour"}


@router.delete("/{tenant_slug}/planning/types-garde/{type_id}")
async def delete_type_garde(
    tenant_slug: str,
    type_id: str,
    current_user: User = Depends(get_current_user)
):
    '''Supprimer un type de garde'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier qu'il n'y a pas d'assignations utilisant ce type
    assignations_count = await db.garde_assignments.count_documents({
        "tenant_id": tenant.id,
        "type_garde_id": type_id
    })
    
    if assignations_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer: {assignations_count} assignations utilisent ce type"
        )
    
    result = await db.types_garde.delete_one({"id": type_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    return {"message": "Type de garde supprimé"}


@router.get("/{tenant_slug}/planning/assignations/{semaine_debut}")
async def get_assignations_semaine(
    tenant_slug: str,
    semaine_debut: str,
    current_user: User = Depends(get_current_user)
):
    '''Récupère les assignations d'une semaine (ou mois si 1er du mois)'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Déterminer la plage de dates
    start_date = datetime.strptime(semaine_debut, "%Y-%m-%d").date()
    
    # Si c'est le 1er du mois, récupérer tout le mois
    if start_date.day == 1:
        import calendar
        _, last_day = calendar.monthrange(start_date.year, start_date.month)
        end_date = start_date.replace(day=last_day)
    else:
        # Sinon, récupérer la semaine
        end_date = start_date + timedelta(days=6)
    
    assignations = await db.garde_assignments.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": semaine_debut,
            "$lte": end_date.strftime("%Y-%m-%d")
        }
    }).to_list(1000)
    
    return [clean_mongo_doc(a) for a in assignations]


@router.post("/{tenant_slug}/planning/assignations")
async def create_assignation(
    tenant_slug: str,
    assignation: AssignationCreate,
    current_user: User = Depends(get_current_user)
):
    '''Créer une nouvelle assignation'''
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur existe
    user = await db.users.find_one({"id": assignation.user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Vérifier que le type de garde existe
    type_garde = await db.types_garde.find_one({
        "id": assignation.type_garde_id,
        "tenant_id": tenant.id
    })
    if not type_garde:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    assign_dict = assignation.dict()
    assign_dict["id"] = str(uuid.uuid4())
    assign_dict["tenant_id"] = tenant.id
    assign_dict["type_garde_nom"] = type_garde.get("nom")
    assign_dict["user_nom"] = f"{user.get('prenom')} {user.get('nom')}"
    assign_dict["created_at"] = datetime.now(timezone.utc)
    assign_dict["created_by"] = current_user.id
    
    await db.garde_assignments.insert_one(assign_dict)
    
    return assign_dict


@router.delete("/{tenant_slug}/planning/assignations/{assignation_id}")
async def delete_assignation(
    tenant_slug: str,
    assignation_id: str,
    current_user: User = Depends(get_current_user)
):
    '''Supprimer une assignation'''
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.garde_assignments.delete_one({
        "id": assignation_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    
    return {"message": "Assignation supprimée"}


@router.get("/{tenant_slug}/planning/mes-heures")
async def get_mes_heures(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    '''Récupère les heures travaillées de l'utilisateur connecté'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer mes assignations
    assignations = await db.garde_assignments.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "date": {"$gte": date_debut, "$lte": date_fin}
    }).to_list(1000)
    
    # Calculer les heures
    heures_internes = 0
    heures_externes = 0
    
    for assign in assignations:
        type_garde = await db.types_garde.find_one({
            "id": assign.get("type_garde_id"),
            "tenant_id": tenant.id
        })
        
        if type_garde:
            # Calculer la durée
            try:
                h_debut = datetime.strptime(type_garde.get("heure_debut", "08:00"), "%H:%M")
                h_fin = datetime.strptime(type_garde.get("heure_fin", "16:00"), "%H:%M")
                duree = (h_fin - h_debut).seconds / 3600
                
                if type_garde.get("est_garde_interne"):
                    heures_internes += duree
                else:
                    heures_externes += duree
            except:
                pass
    
    return {
        "heures_internes": round(heures_internes, 1),
        "heures_externes": round(heures_externes, 1),
        "total_heures": round(heures_internes + heures_externes, 1)
    }
"""


# ==================== FONCTIONS UTILITAIRES ====================

def calculer_duree_garde(heure_debut: str, heure_fin: str) -> float:
    """Calcule la durée d'une garde en heures"""
    try:
        h_debut = datetime.strptime(heure_debut, "%H:%M")
        h_fin = datetime.strptime(heure_fin, "%H:%M")
        
        # Gérer le cas où la garde traverse minuit
        if h_fin < h_debut:
            duree = (24 * 3600 - (h_debut - h_fin).seconds) / 3600
        else:
            duree = (h_fin - h_debut).seconds / 3600
        
        return round(duree, 2)
    except:
        return 0


def generer_dates_semaine(date_debut: str) -> List[str]:
    """Génère les 7 dates d'une semaine à partir du lundi"""
    start = datetime.strptime(date_debut, "%Y-%m-%d").date()
    return [
        (start + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(7)
    ]


def calculer_statistiques_planning(assignations: List[dict], types_garde: List[dict]) -> dict:
    """Calcule les statistiques d'un planning"""
    total_assignations = len(assignations)
    par_type = {}
    
    for assign in assignations:
        type_id = assign.get("type_garde_id")
        par_type[type_id] = par_type.get(type_id, 0) + 1
    
    # Enrichir avec les noms des types
    types_dict = {t["id"]: t["nom"] for t in types_garde}
    par_type_enrichi = {
        types_dict.get(k, k): v 
        for k, v in par_type.items()
    }
    
    return {
        "total_assignations": total_assignations,
        "par_type_garde": par_type_enrichi
    }
