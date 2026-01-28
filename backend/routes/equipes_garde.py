"""
Routes API pour le module Équipes de Garde
==========================================

STATUT: ACTIF
Ce module gère la configuration et le calcul des équipes de garde (rotations).

Routes principales:
- GET    /{tenant_slug}/parametres/equipes-garde     - Récupérer les paramètres
- PUT    /{tenant_slug}/parametres/equipes-garde     - Modifier les paramètres
- GET    /{tenant_slug}/equipes-garde/equipe-du-jour - Équipe de garde pour une date
- GET    /{tenant_slug}/equipes-garde/calendrier     - Calendrier des rotations
- GET    /{tenant_slug}/equipes-garde/employes       - Employés par équipe
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Équipes de Garde"])
logger = logging.getLogger(__name__)


# ==================== FONCTIONS HELPER ====================

def get_equipe_garde_du_jour_sync(
    type_rotation: str, 
    date_reference: str, 
    date_cible: str, 
    nombre_equipes: int, 
    pattern_mode: str, 
    pattern_personnalise: List[int],
    duree_cycle: int
) -> int:
    """
    Calcule quelle équipe est de garde pour une date donnée.
    Retourne le numéro de l'équipe (1, 2, 3, 4, 5).
    
    IMPORTANT: Cette fonction N'UTILISE PAS les patterns Montreal/Quebec/Longueuil existants.
    Elle calcule uniquement pour les rotations personnalisées ou les rotations standards appliquées aux équipes de garde.
    """
    date_ref = datetime.strptime(date_reference, "%Y-%m-%d").date()
    date_obj = datetime.strptime(date_cible, "%Y-%m-%d").date()
    
    # Calculer le jour dans le cycle
    jours_depuis_ref = (date_obj - date_ref).days
    
    # Pour les dates avant la référence
    if jours_depuis_ref < 0:
        jour_cycle = duree_cycle - ((-jours_depuis_ref - 1) % duree_cycle) - 1
    else:
        jour_cycle = jours_depuis_ref % duree_cycle
    
    # Si pattern personnalisé défini
    if pattern_personnalise and len(pattern_personnalise) >= duree_cycle:
        return pattern_personnalise[jour_cycle]
    
    # Sinon, utiliser le mode de pattern
    if pattern_mode == "hebdomadaire":
        # Alternance hebdomadaire: équipe change chaque semaine
        semaine = jour_cycle // 7
        return (semaine % nombre_equipes) + 1
    
    elif pattern_mode == "quotidien":
        # Alternance quotidienne: équipe change chaque jour
        return (jour_cycle % nombre_equipes) + 1
    
    elif pattern_mode == "deux_jours":
        # 2 jours chacun: 1,1,2,2,3,3,4,4...
        return ((jour_cycle // 2) % nombre_equipes) + 1
    
    else:
        # Par défaut: hebdomadaire
        semaine = jour_cycle // 7
        return (semaine % nombre_equipes) + 1


def get_equipe_garde_rotation_standard(type_rotation: str, date_reference: str, date_cible: str) -> int:
    """
    Calcule quelle équipe (1=Vert, 2=Bleu, 3=Jaune, 4=Rouge) est de garde pour une rotation standard.
    Utilise les mêmes patterns que les fonctions de génération d'indisponibilités.
    
    IMPORTANT: Cette fonction N'APPELLE PAS et NE MODIFIE PAS les fonctions existantes.
    Elle utilise simplement la même logique de calcul de jour dans le cycle.
    """
    date_obj = datetime.strptime(date_cible, "%Y-%m-%d").date()
    
    # Définir les dates de référence et les patterns pour chaque type de rotation
    # Ces valeurs sont copiées des fonctions existantes (lecture seule)
    if type_rotation == "montreal":
        # Date ref: 27 janvier 2025 (premier lundi rouge = jour 1)
        jour_1_cycle = datetime(2025, 1, 27).date()
        # Pattern: équipe qui travaille chaque jour du cycle
        # Rouge=4 travaille jours 1, 4, 12, 14, 17, 20, 23
        # Vert=1 travaille jours 2, 8, 11, 19, 21, 24, 27
        # Bleu=2 travaille jours 3, 6, 9, 15, 18, 26, 28
        # Jaune=3 travaille jours 5, 7, 10, 13, 16, 22, 25
        equipes_jours = {
            1: [2, 8, 11, 19, 21, 24, 27],   # Vert
            2: [3, 6, 9, 15, 18, 26, 28],    # Bleu
            3: [5, 7, 10, 13, 16, 22, 25],   # Jaune
            4: [1, 4, 12, 14, 17, 20, 23]    # Rouge
        }
    elif type_rotation == "quebec":
        jour_1_cycle = datetime(2026, 2, 1).date()
        equipes_jours = {
            1: [2, 3, 4, 5, 12, 13, 14, 20, 21, 22, 23, 24, 25],  # Vert
            2: [6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 26, 27, 28],  # Bleu
            3: [1, 2, 3, 4, 9, 10, 11, 12, 19, 20, 21, 27, 28],   # Jaune
            4: [5, 6, 7, 13, 14, 15, 16, 17, 18, 23, 24, 25, 26]  # Rouge
        }
    elif type_rotation == "longueuil":
        # Date ref: 25 janvier 2026 (premier dimanche rouge = jour 1)
        jour_1_cycle = datetime(2026, 1, 25).date()
        equipes_jours = {
            1: [2, 6, 8, 12, 18, 21, 24],    # Vert
            2: [3, 9, 13, 15, 19, 25, 28],   # Bleu
            3: [4, 7, 10, 16, 20, 22, 26],   # Jaune
            4: [1, 5, 11, 14, 17, 23, 27]    # Rouge
        }
    else:
        return 1  # Par défaut équipe 1
    
    # Calculer le jour dans le cycle (1-28)
    jours_depuis_jour1 = (date_obj - jour_1_cycle).days
    jour_cycle = (jours_depuis_jour1 % 28) + 1
    
    if jours_depuis_jour1 < 0:
        jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
    
    # Trouver quelle équipe travaille ce jour
    for equipe, jours in equipes_jours.items():
        if jour_cycle in jours:
            return equipe
    
    return 1  # Par défaut


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/parametres/equipes-garde")
async def get_parametres_equipes_garde(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres des équipes de garde"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
    
    if not params:
        # Créer paramètres par défaut
        default_params = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "actif": False,
            "temps_plein": {
                "rotation_active": False,
                "type_rotation": "aucun",
                "date_reference": None,
                "nombre_equipes": 4,
                "duree_cycle": 28,
                "pattern_mode": "hebdomadaire",
                "pattern_personnalise": [],
                "equipes_config": [
                    {"numero": 1, "nom": "Vert", "couleur": "#22C55E"},
                    {"numero": 2, "nom": "Bleu", "couleur": "#3B82F6"},
                    {"numero": 3, "nom": "Jaune", "couleur": "#EAB308"},
                    {"numero": 4, "nom": "Rouge", "couleur": "#EF4444"}
                ],
                "pre_remplissage_auto": False,
                "privilegier_equipe_garde": False
            },
            "temps_partiel": {
                "rotation_active": False,
                "type_rotation": "personnalisee",
                "date_reference": None,
                "nombre_equipes": 2,
                "duree_cycle": 14,
                "pattern_mode": "hebdomadaire",
                "pattern_personnalise": [],
                "equipes_config": [
                    {"numero": 1, "nom": "Équipe A", "couleur": "#3B82F6"},
                    {"numero": 2, "nom": "Équipe B", "couleur": "#EF4444"}
                ],
                "pre_remplissage_auto": False,
                "privilegier_equipe_garde": True
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.parametres_equipes_garde.insert_one(default_params)
        return clean_mongo_doc(default_params)
    
    return clean_mongo_doc(params)


@router.put("/{tenant_slug}/parametres/equipes-garde")
async def update_parametres_equipes_garde(
    tenant_slug: str,
    params: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres des équipes de garde"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.parametres_equipes_garde.update_one(
        {"tenant_id": tenant.id},
        {"$set": params},
        upsert=True
    )
    
    return {"message": "Paramètres équipes de garde mis à jour"}


@router.get("/{tenant_slug}/equipes-garde/equipe-du-jour")
async def get_equipe_garde_du_jour(
    tenant_slug: str,
    date: str,  # Format YYYY-MM-DD
    type_emploi: str = "temps_plein",  # temps_plein ou temps_partiel
    current_user: User = Depends(get_current_user)
):
    """
    Retourne quelle équipe est de garde pour une date et un type d'emploi donnés.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
    
    if not params or not params.get("actif", False):
        return {"equipe": None, "message": "Système d'équipes de garde non activé"}
    
    config = params.get(type_emploi, {})
    
    if not config.get("rotation_active", False):
        return {"equipe": None, "message": f"Rotation non activée pour {type_emploi}"}
    
    type_rotation = config.get("type_rotation", "aucun")
    
    if type_rotation == "aucun":
        return {"equipe": None, "message": "Aucune rotation configurée"}
    
    # Pour les rotations standards (Montreal, Quebec, Longueuil)
    if type_rotation in ["montreal", "quebec", "longueuil"]:
        equipe_num = get_equipe_garde_rotation_standard(type_rotation, "", date)
    else:
        # Rotation personnalisée
        date_reference = config.get("date_reference")
        if not date_reference:
            return {"equipe": None, "message": "Date de référence non configurée"}
        
        equipe_num = get_equipe_garde_du_jour_sync(
            type_rotation=type_rotation,
            date_reference=date_reference,
            date_cible=date,
            nombre_equipes=config.get("nombre_equipes", 4),
            pattern_mode=config.get("pattern_mode", "hebdomadaire"),
            pattern_personnalise=config.get("pattern_personnalise", []),
            duree_cycle=config.get("duree_cycle", 28)
        )
    
    # Récupérer la config de l'équipe
    equipes_config = config.get("equipes_config", [])
    equipe_info = next((e for e in equipes_config if e.get("numero") == equipe_num), None)
    
    if equipe_info:
        return {
            "equipe": equipe_num,
            "nom": equipe_info.get("nom", f"Équipe {equipe_num}"),
            "couleur": equipe_info.get("couleur", "#3B82F6"),
            "date": date,
            "type_emploi": type_emploi
        }
    else:
        return {
            "equipe": equipe_num,
            "nom": f"Équipe {equipe_num}",
            "couleur": "#3B82F6",
            "date": date,
            "type_emploi": type_emploi
        }


@router.get("/{tenant_slug}/equipes-garde/calendrier")
async def get_calendrier_equipes_garde(
    tenant_slug: str,
    date_debut: str,  # Format YYYY-MM-DD
    date_fin: str,    # Format YYYY-MM-DD
    type_emploi: str = "temps_plein",
    current_user: User = Depends(get_current_user)
):
    """
    Retourne le calendrier des équipes de garde pour une période.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
    
    if not params or not params.get("actif", False):
        return {"calendrier": [], "message": "Système d'équipes de garde non activé"}
    
    config = params.get(type_emploi, {})
    
    if not config.get("rotation_active", False):
        return {"calendrier": [], "message": f"Rotation non activée pour {type_emploi}"}
    
    type_rotation = config.get("type_rotation", "aucun")
    date_reference = config.get("date_reference")
    equipes_config = config.get("equipes_config", [])
    
    calendrier = []
    current = datetime.strptime(date_debut, "%Y-%m-%d").date()
    end = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        
        if type_rotation in ["montreal", "quebec", "longueuil"]:
            equipe_num = get_equipe_garde_rotation_standard(type_rotation, "", date_str)
        elif type_rotation != "aucun" and date_reference:
            equipe_num = get_equipe_garde_du_jour_sync(
                type_rotation=type_rotation,
                date_reference=date_reference,
                date_cible=date_str,
                nombre_equipes=config.get("nombre_equipes", 4),
                pattern_mode=config.get("pattern_mode", "hebdomadaire"),
                pattern_personnalise=config.get("pattern_personnalise", []),
                duree_cycle=config.get("duree_cycle", 28)
            )
        else:
            equipe_num = None
        
        if equipe_num:
            equipe_info = next((e for e in equipes_config if e.get("numero") == equipe_num), {})
            calendrier.append({
                "date": date_str,
                "equipe": equipe_num,
                "nom": equipe_info.get("nom", f"Équipe {equipe_num}"),
                "couleur": equipe_info.get("couleur", "#3B82F6")
            })
        
        current += timedelta(days=1)
    
    return {"calendrier": calendrier, "type_emploi": type_emploi}


@router.get("/{tenant_slug}/equipes-garde/employes")
async def get_employes_par_equipe(
    tenant_slug: str,
    equipe: int,  # Numéro de l'équipe (1, 2, 3, 4, 5)
    type_emploi: Optional[str] = None,  # Filtrer par temps_plein ou temps_partiel
    current_user: User = Depends(get_current_user)
):
    """
    Retourne la liste des employés d'une équipe de garde.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {
        "tenant_id": tenant.id,
        "statut": "Actif",
        "equipe_garde": equipe
    }
    
    if type_emploi:
        query["type_emploi"] = type_emploi
    
    users = await db.users.find(query).to_list(None)
    
    return [
        {
            "id": u.get("id"),
            "nom": u.get("nom"),
            "prenom": u.get("prenom"),
            "type_emploi": u.get("type_emploi"),
            "grade": u.get("grade"),
            "equipe_garde": u.get("equipe_garde")
        }
        for u in users
    ]
