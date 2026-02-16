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
    duree_cycle: int,
    jour_rotation: str = None,
    heure_rotation: str = None,
    heure_actuelle: str = None
) -> int:
    """
    Calcule quelle équipe est de garde pour une date donnée.
    Retourne le numéro de l'équipe (1, 2, 3, 4, 5).
    
    Prend en compte le jour et l'heure de rotation si spécifiés.
    Par exemple, si jour_rotation="monday" et heure_rotation="18:00",
    la rotation change chaque lundi à 18h.
    """
    date_ref = datetime.strptime(date_reference, "%Y-%m-%d").date()
    date_obj = datetime.strptime(date_cible, "%Y-%m-%d").date()
    
    # Si on a un jour et une heure de rotation, ajuster la date pour le calcul
    # L'idée: on calcule la "date effective" qui correspond au début de la période de rotation actuelle
    if jour_rotation and heure_rotation:
        # Convertir le jour de rotation en numéro (monday=0, tuesday=1, etc.)
        jours_semaine = {
            "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6
        }
        jour_rotation_num = jours_semaine.get(jour_rotation, 0)
        
        # Jour de la semaine actuel (0=lundi, 6=dimanche)
        jour_actuel = date_obj.weekday()
        
        # Calculer combien de jours depuis le dernier jour de rotation
        if jour_actuel >= jour_rotation_num:
            # Le jour de rotation est déjà passé cette semaine ou c'est aujourd'hui
            jours_depuis_rotation = jour_actuel - jour_rotation_num
        else:
            # Le jour de rotation n'est pas encore arrivé cette semaine
            # On est dans la période qui a commencé la semaine dernière
            jours_depuis_rotation = 7 - (jour_rotation_num - jour_actuel)
        
        # Si c'est le jour de rotation, vérifier l'heure
        if jour_actuel == jour_rotation_num and heure_actuelle:
            heure_rot = datetime.strptime(heure_rotation, "%H:%M").time()
            heure_act = datetime.strptime(heure_actuelle, "%H:%M").time()
            
            if heure_act < heure_rot:
                # Avant l'heure de rotation, on est encore dans la période précédente
                jours_depuis_rotation = 7
        
        # Ajuster la date_obj pour qu'elle corresponde au début de la période
        date_obj = date_obj - timedelta(days=jours_depuis_rotation)
    
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
    heure: str = None,  # Format HH:MM (optionnel, utilise l'heure actuelle si non fourni)
    type_emploi: str = "temps_plein",  # temps_plein ou temps_partiel
    current_user: User = Depends(get_current_user)
):
    """
    Retourne quelle équipe est de garde pour une date et un type d'emploi donnés.
    Prend en compte l'heure pour déterminer si la rotation a changé.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Si pas d'heure fournie, utiliser l'heure actuelle
    if not heure:
        heure = datetime.now().strftime("%H:%M")
    
    params = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
    
    if not params or not params.get("actif", False):
        return {"equipe": None, "message": "Système d'équipes de garde non activé"}
    
    config = params.get(type_emploi, {})
    
    if not config.get("rotation_active", False):
        return {"equipe": None, "message": f"Rotation non activée pour {type_emploi}"}
    
    type_rotation = config.get("type_rotation", "aucun")
    
    if type_rotation == "aucun":
        return {"equipe": None, "message": "Aucune rotation configurée"}
    
    # Récupérer les paramètres de rotation horaire
    jour_rotation = config.get("jour_rotation", "monday")
    heure_rotation = config.get("heure_rotation", "08:00")
    
    # Pour les rotations standards (Montreal, Quebec, Longueuil)
    if type_rotation in ["montreal", "quebec", "longueuil"]:
        equipe_num = get_equipe_garde_rotation_standard(type_rotation, "", date)
        equipes_config = config.get("equipes_config", [])
    elif type_rotation == "personnalisee":
        # Rotation personnalisée manuelle (définie directement dans les paramètres)
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
            duree_cycle=config.get("duree_cycle", 28),
            jour_rotation=jour_rotation,
            heure_rotation=heure_rotation,
            heure_actuelle=heure
        )
        equipes_config = config.get("equipes_config", [])
    else:
        # C'est un UUID - aller chercher l'horaire personnalisé dans la base
        horaire_perso = await db.horaires_personnalises.find_one({
            "tenant_id": tenant.id,
            "id": type_rotation
        })
        
        if not horaire_perso:
            # Si pas trouvé, peut-être que c'est basé sur un prédéfini modifié
            horaire_perso = await db.horaires_personnalises.find_one({
                "tenant_id": tenant.id,
                "base_predefini_id": type_rotation
            })
        
        if not horaire_perso:
            logger.warning(f"Horaire personnalisé {type_rotation} non trouvé pour {tenant.id}")
            return {"equipe": None, "message": "Horaire personnalisé non trouvé"}
        
        date_reference = horaire_perso.get("date_reference")
        if not date_reference:
            return {"equipe": None, "message": "Date de référence non configurée dans l'horaire"}
        
        # Utiliser la logique de calcul basée sur les jours de travail de chaque équipe
        equipe_num = get_equipe_from_horaire_personnalise(horaire_perso, date)
        equipes_config = horaire_perso.get("equipes", [])
        
        # Convertir les équipes au format attendu si nécessaire
        if equipes_config and not equipes_config[0].get("numero"):
            equipes_config = [
                {"numero": i + 1, "nom": eq.get("nom", f"Équipe {i+1}"), "couleur": eq.get("couleur", "#3B82F6")}
                for i, eq in enumerate(equipes_config)
            ]
    
    # Récupérer la config de l'équipe
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


def get_equipe_from_horaire_personnalise(horaire: dict, date_cible: str) -> int:
    """
    Calcule quelle équipe est de garde selon un horaire personnalisé.
    Utilise les jours_travail définis pour chaque équipe.
    """
    date_ref = datetime.strptime(horaire.get("date_reference"), "%Y-%m-%d").date()
    date_obj = datetime.strptime(date_cible, "%Y-%m-%d").date()
    duree_cycle = horaire.get("duree_cycle", 28)
    
    # Calculer le jour dans le cycle (1-based)
    jours_depuis_ref = (date_obj - date_ref).days
    
    if jours_depuis_ref < 0:
        jour_cycle = duree_cycle - ((-jours_depuis_ref - 1) % duree_cycle)
    else:
        jour_cycle = (jours_depuis_ref % duree_cycle) + 1
    
    # Chercher quelle équipe travaille ce jour
    equipes = horaire.get("equipes", [])
    for eq in equipes:
        jours_travail = eq.get("jours_travail", [])
        for jt in jours_travail:
            if isinstance(jt, int):
                if jt == jour_cycle:
                    return eq.get("numero", 1)
            elif isinstance(jt, dict):
                if jt.get("jour") == jour_cycle:
                    return eq.get("numero", 1)
    
    # Par défaut, retourner équipe 1
    return 1


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
