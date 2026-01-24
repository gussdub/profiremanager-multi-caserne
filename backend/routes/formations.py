"""
Routes API pour le module Formations
====================================

Ce fichier contient les routes pour la gestion des formations et compétences.

STATUT: PRÊT POUR ACTIVATION
Les routes sont dans server.py lignes 10800-11200 environ.

Pour activer ce module:
1. Dans server.py, importer: from routes.formations import router as formations_router
2. Inclure: api_router.include_router(formations_router)
3. Supprimer les routes correspondantes de server.py
4. Tester exhaustivement

Routes incluses:
- GET    /{tenant_slug}/formations                            - Liste des formations
- POST   /{tenant_slug}/formations                            - Créer une formation
- GET    /{tenant_slug}/formations/{id}                       - Détail formation
- PUT    /{tenant_slug}/formations/{id}                       - Modifier formation
- DELETE /{tenant_slug}/formations/{id}                       - Supprimer formation
- POST   /{tenant_slug}/formations/{id}/inscrire              - S'inscrire
- DELETE /{tenant_slug}/formations/{id}/desinscrire           - Se désinscrire
- PUT    /{tenant_slug}/formations/{id}/presence              - Marquer présence
- GET    /{tenant_slug}/formations/mon-taux-presence          - Mon taux de présence
- GET    /{tenant_slug}/formations/rapport-presence           - Rapport de présence
- GET    /{tenant_slug}/competences                           - Liste des compétences
- POST   /{tenant_slug}/competences                           - Créer compétence
- PUT    /{tenant_slug}/competences/{id}                      - Modifier compétence
- DELETE /{tenant_slug}/competences/{id}                      - Supprimer compétence
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date
import uuid
import logging

# Ces imports seront résolus quand le module sera activé
# from server import (
#     db, 
#     get_current_user, 
#     get_tenant_from_slug, 
#     clean_mongo_doc,
#     User,
#     Formation,
#     Competence
# )

router = APIRouter(tags=["Formations"])


# ==================== MODÈLES ====================

class FormationCreate(BaseModel):
    """Modèle pour la création d'une formation"""
    titre: str
    description: Optional[str] = None
    type_formation: str  # obligatoire, optionnelle, specialisee
    date_debut: str  # Format YYYY-MM-DD
    date_fin: Optional[str] = None
    heure_debut: str = "09:00"
    heure_fin: str = "17:00"
    lieu: Optional[str] = None
    formateur: Optional[str] = None
    places_max: int = 20
    competences_acquises: Optional[List[str]] = []


class FormationUpdate(BaseModel):
    """Modèle pour la mise à jour d'une formation"""
    titre: Optional[str] = None
    description: Optional[str] = None
    type_formation: Optional[str] = None
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    lieu: Optional[str] = None
    formateur: Optional[str] = None
    places_max: Optional[int] = None
    competences_acquises: Optional[List[str]] = None
    statut: Optional[str] = None  # planifiee, en_cours, terminee, annulee


class CompetenceCreate(BaseModel):
    """Modèle pour la création d'une compétence"""
    nom: str
    code: str
    description: Optional[str] = None
    categorie: Optional[str] = None
    validite_mois: Optional[int] = None  # Durée de validité en mois
    obligatoire: bool = False


class InscriptionFormation(BaseModel):
    """Modèle pour une inscription à une formation"""
    user_id: str
    formation_id: str
    date_inscription: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str = "inscrit"  # inscrit, present, absent, excuse


class ParametresFormations(BaseModel):
    """Paramètres du module formations"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Seuil de conformité
    pourcentage_presence_minimum: int = 80
    heures_formation_annuelles_requises: int = 40
    
    # Notifications
    rappel_jours_avant: int = 7
    notifier_non_conformes: bool = True
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== ROUTES ====================
# Note: Ces routes sont commentées car elles ne sont pas encore activées.
# Décommenter quand prêt à migrer depuis server.py

"""
@router.get("/{tenant_slug}/formations")
async def get_formations(
    tenant_slug: str,
    annee: Optional[int] = None,
    type_formation: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    '''Liste toutes les formations du tenant'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    filter_query = {"tenant_id": tenant.id}
    
    if annee:
        filter_query["date_debut"] = {"$regex": f"^{annee}"}
    
    if type_formation:
        filter_query["type_formation"] = type_formation
    
    formations = await db.formations.find(filter_query).to_list(500)
    return [clean_mongo_doc(f) for f in formations]


@router.post("/{tenant_slug}/formations")
async def create_formation(
    tenant_slug: str,
    formation: FormationCreate,
    current_user: User = Depends(get_current_user)
):
    '''Créer une nouvelle formation'''
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation_dict = formation.dict()
    formation_dict["id"] = str(uuid.uuid4())
    formation_dict["tenant_id"] = tenant.id
    formation_dict["statut"] = "planifiee"
    formation_dict["inscrits"] = []
    formation_dict["participants"] = []
    formation_dict["created_at"] = datetime.now(timezone.utc)
    formation_dict["created_by"] = current_user.id
    
    await db.formations.insert_one(formation_dict)
    
    return formation_dict


@router.get("/{tenant_slug}/formations/{formation_id}")
async def get_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    '''Récupère une formation par son ID'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation = await db.formations.find_one({
        "id": formation_id,
        "tenant_id": tenant.id
    })
    
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    return clean_mongo_doc(formation)


@router.put("/{tenant_slug}/formations/{formation_id}")
async def update_formation(
    tenant_slug: str,
    formation_id: str,
    formation_update: FormationUpdate,
    current_user: User = Depends(get_current_user)
):
    '''Modifier une formation'''
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in formation_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    return {"message": "Formation mise à jour"}


@router.delete("/{tenant_slug}/formations/{formation_id}")
async def delete_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    '''Supprimer une formation'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.formations.delete_one({
        "id": formation_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    return {"message": "Formation supprimée"}


@router.post("/{tenant_slug}/formations/{formation_id}/inscrire")
async def inscrire_formation(
    tenant_slug: str,
    formation_id: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    '''S'inscrire à une formation'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Déterminer qui s'inscrit
    target_user_id = user_id if user_id and current_user.role == "admin" else current_user.id
    
    formation = await db.formations.find_one({
        "id": formation_id,
        "tenant_id": tenant.id
    })
    
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    # Vérifier si déjà inscrit
    inscrits = formation.get("inscrits", [])
    if target_user_id in inscrits:
        raise HTTPException(status_code=400, detail="Déjà inscrit à cette formation")
    
    # Vérifier les places disponibles
    if len(inscrits) >= formation.get("places_max", 20):
        raise HTTPException(status_code=400, detail="Formation complète")
    
    # Ajouter l'inscription
    await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {
            "$push": {
                "inscrits": target_user_id,
                "participants": {
                    "user_id": target_user_id,
                    "date_inscription": datetime.now(timezone.utc),
                    "statut": "inscrit"
                }
            }
        }
    )
    
    return {"message": "Inscription réussie"}


@router.delete("/{tenant_slug}/formations/{formation_id}/desinscrire")
async def desinscrire_formation(
    tenant_slug: str,
    formation_id: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    '''Se désinscrire d'une formation'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    target_user_id = user_id if user_id and current_user.role == "admin" else current_user.id
    
    await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {
            "$pull": {
                "inscrits": target_user_id,
                "participants": {"user_id": target_user_id}
            }
        }
    )
    
    return {"message": "Désinscription réussie"}


@router.get("/{tenant_slug}/formations/mon-taux-presence")
async def get_mon_taux_presence(
    tenant_slug: str,
    annee: int,
    current_user: User = Depends(get_current_user)
):
    '''Récupère le taux de présence aux formations de l'utilisateur'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les formations passées de l'année où l'utilisateur était inscrit
    formations = await db.formations.find({
        "tenant_id": tenant.id,
        "date_debut": {"$regex": f"^{annee}"},
        "inscrits": current_user.id
    }).to_list(500)
    
    # Compter les présences
    formations_passees = 0
    presences_validees = 0
    
    today = date.today().strftime("%Y-%m-%d")
    
    for formation in formations:
        date_fin = formation.get("date_fin") or formation.get("date_debut")
        if date_fin < today:
            formations_passees += 1
            
            # Vérifier la présence
            participants = formation.get("participants", [])
            for p in participants:
                if p.get("user_id") == current_user.id and p.get("statut") == "present":
                    presences_validees += 1
                    break
    
    # Si aucune formation passée, l'utilisateur est conforme par défaut
    taux_presence = round((presences_validees / formations_passees * 100) if formations_passees > 0 else 100, 1)
    
    # Récupérer les paramètres pour savoir si conforme
    params = await db.parametres_formations.find_one({"tenant_id": tenant.id})
    pourcentage_min = params.get("pourcentage_presence_minimum", 80) if params else 80
    
    conforme = taux_presence >= pourcentage_min if formations_passees > 0 else True
    
    return {
        "formations_passees": formations_passees,
        "presences_validees": presences_validees,
        "taux_presence": taux_presence,
        "pourcentage_minimum": pourcentage_min,
        "conforme": conforme
    }


@router.get("/{tenant_slug}/competences")
async def get_competences(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    '''Liste toutes les compétences du tenant'''
    tenant = await get_tenant_from_slug(tenant_slug)
    
    competences = await db.competences.find({"tenant_id": tenant.id}).to_list(500)
    return [clean_mongo_doc(c) for c in competences]


@router.post("/{tenant_slug}/competences")
async def create_competence(
    tenant_slug: str,
    competence: CompetenceCreate,
    current_user: User = Depends(get_current_user)
):
    '''Créer une nouvelle compétence'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier unicité du code
    existing = await db.competences.find_one({
        "tenant_id": tenant.id,
        "code": competence.code
    })
    if existing:
        raise HTTPException(status_code=400, detail="Ce code de compétence existe déjà")
    
    competence_dict = competence.dict()
    competence_dict["id"] = str(uuid.uuid4())
    competence_dict["tenant_id"] = tenant.id
    competence_dict["created_at"] = datetime.now(timezone.utc)
    
    await db.competences.insert_one(competence_dict)
    
    return competence_dict
"""


# ==================== FONCTIONS UTILITAIRES ====================

def calculer_heures_formation(formation: dict) -> float:
    """Calcule le nombre d'heures d'une formation"""
    try:
        h_debut = datetime.strptime(formation.get("heure_debut", "09:00"), "%H:%M")
        h_fin = datetime.strptime(formation.get("heure_fin", "17:00"), "%H:%M")
        heures_par_jour = (h_fin - h_debut).seconds / 3600
        
        # Calculer le nombre de jours
        date_debut = datetime.strptime(formation.get("date_debut"), "%Y-%m-%d")
        date_fin_str = formation.get("date_fin") or formation.get("date_debut")
        date_fin = datetime.strptime(date_fin_str, "%Y-%m-%d")
        
        nb_jours = (date_fin - date_debut).days + 1
        
        return round(heures_par_jour * nb_jours, 1)
    except:
        return 0


def verifier_conformite_formations(
    formations_passees: int, 
    presences: int, 
    pourcentage_min: int = 80
) -> dict:
    """Vérifie si un utilisateur est conforme aux exigences de formation"""
    if formations_passees == 0:
        return {
            "conforme": True,
            "taux_presence": 100,
            "message": "Aucune formation requise - Conforme par défaut"
        }
    
    taux = round(presences / formations_passees * 100, 1)
    conforme = taux >= pourcentage_min
    
    return {
        "conforme": conforme,
        "taux_presence": taux,
        "message": f"Taux de présence: {taux}% (minimum requis: {pourcentage_min}%)"
    }
