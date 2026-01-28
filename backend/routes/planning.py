"""
Routes API pour le module Planning
==================================

STATUT: ACTIF
Ce module gère le planning des gardes : assignations, exports, rapports d'heures.

Routes Assignations:
- GET    /{tenant_slug}/planning/{semaine_debut}                - Obtenir planning d'une semaine
- GET    /{tenant_slug}/planning/assignations/{semaine_debut}   - Liste assignations semaine
- POST   /{tenant_slug}/planning/assignation                    - Créer assignation
- DELETE /{tenant_slug}/planning/assignation/{assignation_id}   - Supprimer assignation

Routes Rapports:
- GET    /{tenant_slug}/planning/mes-heures                     - Mes heures (employé)
- GET    /{tenant_slug}/planning/rapport-heures                 - Rapport heures global

Routes Outils:
- POST   /{tenant_slug}/planning/recalculer-durees-gardes       - Recalculer durées
- GET    /{tenant_slug}/planning/rapport-assignations-invalides - Rapport assignations invalides
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_activite
)

router = APIRouter(tags=["Planning"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class Planning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    semaine_debut: str  # Format: YYYY-MM-DD
    semaine_fin: str
    assignations: Dict[str, Any] = {}  # jour -> type_garde -> assignation
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Assignation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    type_garde_id: str
    date: str
    statut: str = "planifie"  # planifie, confirme, remplacement_demande
    assignation_type: str = "auto"  # auto, manuel, manuel_avance
    justification: Optional[Dict[str, Any]] = None
    notes_admin: Optional[str] = None
    justification_historique: Optional[List[Dict[str, Any]]] = None


class AssignationCreate(BaseModel):
    user_id: str
    type_garde_id: str
    date: str
    assignation_type: str = "manuel"
    notes_admin: Optional[str] = None


# ==================== FONCTIONS UTILITAIRES ====================

def get_semaine_range(semaine_debut: str) -> tuple:
    """Retourne les dates de début et fin de semaine"""
    date_debut = datetime.strptime(semaine_debut, "%Y-%m-%d")
    date_fin = date_debut + timedelta(days=6)
    return date_debut, date_fin


async def get_types_garde(tenant_id: str) -> List[Dict]:
    """Récupère les types de garde d'un tenant"""
    types = await db.types_garde.find(
        {"tenant_id": tenant_id},
        {"_id": 0}
    ).sort("ordre", 1).to_list(100)
    return types


async def get_user_info(user_id: str) -> Optional[Dict]:
    """Récupère les informations d'un utilisateur"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "mot_de_passe_hash": 0})
    return user


# ==================== ROUTES PLANNING ====================

# NOTE: La route générique /{tenant_slug}/planning/{semaine_debut} 
# est définie à la FIN du fichier pour éviter les conflits avec les routes spécifiques


@router.get("/{tenant_slug}/planning/assignations/{date_debut}")
async def get_assignations_periode(
    tenant_slug: str,
    date_debut: str,
    mode: str = Query(default="semaine", description="Mode d'affichage: 'semaine' ou 'mois'"),
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer les assignations pour une période donnée.
    - mode='semaine': Récupère 7 jours à partir de date_debut
    - mode='mois': Récupère tout le mois de la date fournie
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if mode == "mois":
        # Parser la date et calculer le premier et dernier jour du mois
        date_obj = datetime.strptime(date_debut, "%Y-%m-%d")
        year = date_obj.year
        month = date_obj.month
        
        # Premier jour du mois
        debut_mois = datetime(year, month, 1)
        # Dernier jour du mois
        if month == 12:
            fin_mois = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            fin_mois = datetime(year, month + 1, 1) - timedelta(days=1)
        
        date_debut_str = debut_mois.strftime("%Y-%m-%d")
        date_fin_str = fin_mois.strftime("%Y-%m-%d")
    else:
        # Mode semaine (par défaut): 7 jours à partir de la date
        date_obj, date_fin_obj = get_semaine_range(date_debut)
        date_debut_str = date_debut
        date_fin_str = date_fin_obj.strftime("%Y-%m-%d")
    
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut_str,
            "$lte": date_fin_str
        }
    }, {"_id": 0}).sort("date", 1).to_list(1000)
    
    return assignations


@router.post("/{tenant_slug}/planning/assignation")
async def create_assignation(
    tenant_slug: str,
    assignation_data: AssignationCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle assignation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur existe
    user = await db.users.find_one({"id": assignation_data.user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Vérifier que le type de garde existe
    type_garde = await db.types_garde.find_one({"id": assignation_data.type_garde_id, "tenant_id": tenant.id})
    if not type_garde:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    # Vérifier s'il n'y a pas déjà une assignation pour ce jour/type
    existing = await db.assignations.find_one({
        "tenant_id": tenant.id,
        "date": assignation_data.date,
        "type_garde_id": assignation_data.type_garde_id
    })
    
    if existing:
        # Mettre à jour l'assignation existante
        await db.assignations.update_one(
            {"id": existing["id"]},
            {"$set": {
                "user_id": assignation_data.user_id,
                "assignation_type": assignation_data.assignation_type,
                "notes_admin": assignation_data.notes_admin,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        updated = await db.assignations.find_one({"id": existing["id"]}, {"_id": 0})
        return updated
    
    # Créer une nouvelle assignation
    assignation = Assignation(
        tenant_id=tenant.id,
        user_id=assignation_data.user_id,
        type_garde_id=assignation_data.type_garde_id,
        date=assignation_data.date,
        assignation_type=assignation_data.assignation_type,
        notes_admin=assignation_data.notes_admin
    )
    
    await db.assignations.insert_one(assignation.dict())
    
    # Créer une notification
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="planning",
        description=f"Nouvelle assignation créée pour {user.get('prenom', '')} {user.get('nom', '')}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}",
        metadata={"assignation_id": assignation.id, "date": assignation_data.date}
    )
    
    return clean_mongo_doc(assignation.dict())


@router.delete("/{tenant_slug}/planning/assignation/{assignation_id}")
async def delete_assignation(
    tenant_slug: str,
    assignation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une assignation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    assignation = await db.assignations.find_one({
        "id": assignation_id,
        "tenant_id": tenant.id
    })
    
    if not assignation:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    
    await db.assignations.delete_one({"id": assignation_id})
    
    return {"message": "Assignation supprimée avec succès"}


# ==================== ROUTES RAPPORTS D'HEURES ====================

@router.get("/{tenant_slug}/planning/mes-heures")
async def get_mes_heures(
    tenant_slug: str,
    mois: Optional[str] = None,  # Format: YYYY-MM
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer mes heures pour un mois donné (pour l'employé connecté)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Si pas de mois spécifié, prendre le mois courant
    if not mois:
        mois = datetime.now(timezone.utc).strftime("%Y-%m")
    
    # Calculer les dates du mois
    year, month = map(int, mois.split('-'))
    date_debut = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        date_fin = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        date_fin = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Récupérer les assignations de l'utilisateur pour ce mois
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "date": {
            "$gte": date_debut.strftime("%Y-%m-%d"),
            "$lt": date_fin.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(100)
    
    # Récupérer les types de garde pour calculer les heures
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    total_heures = 0
    detail_par_type = {}
    
    for assignation in assignations:
        type_garde_id = assignation.get("type_garde_id")
        if type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            duree = tg.get("duree_heures", 0)
            total_heures += duree
            
            if type_garde_id not in detail_par_type:
                detail_par_type[type_garde_id] = {
                    "nom": tg.get("nom", ""),
                    "couleur": tg.get("couleur", "#3B82F6"),
                    "heures": 0,
                    "count": 0
                }
            
            detail_par_type[type_garde_id]["heures"] += duree
            detail_par_type[type_garde_id]["count"] += 1
    
    return {
        "mois": mois,
        "total_heures": total_heures,
        "nombre_gardes": len(assignations),
        "detail_par_type": list(detail_par_type.values()),
        "assignations": assignations
    }


@router.get("/{tenant_slug}/planning/rapport-heures")
async def get_rapport_heures(
    tenant_slug: str,
    mois: Optional[str] = None,  # Format: YYYY-MM
    current_user: User = Depends(get_current_user)
):
    """
    Rapport d'heures global pour tous les employés (admin/superviseur)
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Si pas de mois spécifié, prendre le mois courant
    if not mois:
        mois = datetime.now(timezone.utc).strftime("%Y-%m")
    
    # Calculer les dates du mois
    year, month = map(int, mois.split('-'))
    date_debut = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        date_fin = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        date_fin = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    # Récupérer toutes les assignations du mois
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut.strftime("%Y-%m-%d"),
            "$lt": date_fin.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(10000)
    
    # Récupérer les types de garde
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    # Récupérer tous les employés actifs
    users = await db.users.find(
        {"tenant_id": tenant.id, "statut": "Actif"},
        {"_id": 0, "mot_de_passe_hash": 0}
    ).to_list(1000)
    users_dict = {u["id"]: u for u in users}
    
    # Calculer les heures par employé
    rapport = {}
    for assignation in assignations:
        user_id = assignation.get("user_id")
        type_garde_id = assignation.get("type_garde_id")
        
        if user_id not in rapport:
            user = users_dict.get(user_id, {})
            nom = user.get("nom", "")
            prenom = user.get("prenom", "")
            type_emploi = user.get("type_emploi", "")
            
            # Déterminer si interne ou externe
            is_interne = type_emploi == "Temps plein"
            
            rapport[user_id] = {
                "user_id": user_id,
                "nom": nom,
                "prenom": prenom,
                "nom_complet": f"{prenom} {nom}".strip(),
                "grade": user.get("grade", ""),
                "type_emploi": type_emploi,
                "is_interne": is_interne,
                "total_heures": 0,
                "heures_internes": 0,
                "heures_externes": 0,
                "nombre_gardes": 0,
                "detail_par_type": {}
            }
        
        if type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            duree = tg.get("duree_heures", 0)
            rapport[user_id]["total_heures"] += duree
            rapport[user_id]["nombre_gardes"] += 1
            
            # Répartir entre heures internes et externes
            if rapport[user_id]["is_interne"]:
                rapport[user_id]["heures_internes"] += duree
            else:
                rapport[user_id]["heures_externes"] += duree
            
            if type_garde_id not in rapport[user_id]["detail_par_type"]:
                rapport[user_id]["detail_par_type"][type_garde_id] = {
                    "nom": tg.get("nom", ""),
                    "heures": 0,
                    "count": 0
                }
            
            rapport[user_id]["detail_par_type"][type_garde_id]["heures"] += duree
            rapport[user_id]["detail_par_type"][type_garde_id]["count"] += 1
    
    # Convertir en liste triée
    rapport_list = list(rapport.values())
    rapport_list.sort(key=lambda x: x["total_heures"], reverse=True)
    
    # Calculer les statistiques
    total_heures_planifiees = sum([r["total_heures"] for r in rapport_list])
    nb_employes = len(rapport_list)
    
    # Séparer internes et externes
    heures_internes = sum([r["total_heures"] for r in rapport_list if r.get("type_emploi") == "Temps plein" or r.get("type_emploi") == "Permanent"])
    heures_externes = sum([r["total_heures"] for r in rapport_list if r.get("type_emploi") not in ["Temps plein", "Permanent", ""]])
    nb_internes = len([r for r in rapport_list if r.get("type_emploi") == "Temps plein" or r.get("type_emploi") == "Permanent"])
    nb_externes = len([r for r in rapport_list if r.get("type_emploi") not in ["Temps plein", "Permanent", ""]])
    
    return {
        "mois": mois,
        "total_assignations": len(assignations),
        "employes": rapport_list,
        "statistiques": {
            "total_heures_planifiees": round(total_heures_planifiees, 2),
            "moyenne_heures_internes": round(heures_internes / nb_internes, 2) if nb_internes > 0 else 0,
            "moyenne_heures_externes": round(heures_externes / nb_externes, 2) if nb_externes > 0 else 0,
            "nb_employes": nb_employes,
            "nb_internes": nb_internes,
            "nb_externes": nb_externes
        }
    }


# ==================== ROUTES OUTILS ====================

@router.get("/{tenant_slug}/planning/rapport-assignations-invalides")
async def get_assignations_invalides(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Rapport des assignations invalides (employés inactifs, types de garde supprimés, etc.)
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer toutes les assignations futures
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {"$gte": today}
    }, {"_id": 0}).to_list(10000)
    
    # Récupérer les employés actifs
    users_actifs = await db.users.find(
        {"tenant_id": tenant.id, "statut": "Actif"},
        {"_id": 0, "id": 1}
    ).to_list(1000)
    users_actifs_ids = set([u["id"] for u in users_actifs])
    
    # Récupérer les types de garde actifs
    types_garde = await db.types_garde.find(
        {"tenant_id": tenant.id},
        {"_id": 0, "id": 1}
    ).to_list(100)
    types_garde_ids = set([t["id"] for t in types_garde])
    
    invalides = []
    for assignation in assignations:
        problemes = []
        
        if assignation.get("user_id") not in users_actifs_ids:
            problemes.append("Employé inactif ou supprimé")
        
        if assignation.get("type_garde_id") not in types_garde_ids:
            problemes.append("Type de garde supprimé")
        
        if problemes:
            invalides.append({
                "assignation_id": assignation.get("id"),
                "date": assignation.get("date"),
                "user_id": assignation.get("user_id"),
                "type_garde_id": assignation.get("type_garde_id"),
                "problemes": problemes
            })
    
    return {
        "total_invalides": len(invalides),
        "assignations_invalides": invalides
    }


@router.post("/{tenant_slug}/planning/recalculer-durees-gardes")
async def recalculer_durees_gardes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Recalculer les durées de toutes les gardes selon les types de garde actuels
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les types de garde
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    # Récupérer toutes les assignations
    assignations = await db.assignations.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(100000)
    
    updated_count = 0
    for assignation in assignations:
        type_garde_id = assignation.get("type_garde_id")
        if type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            duree = tg.get("duree_heures", 0)
            
            # Mettre à jour si différent
            if assignation.get("duree_heures") != duree:
                await db.assignations.update_one(
                    {"id": assignation["id"]},
                    {"$set": {"duree_heures": duree}}
                )
                updated_count += 1
    
    return {
        "message": "Recalcul des durées terminé",
        "total_assignations": len(assignations),
        "mises_a_jour": updated_count
    }


# ==================== ROUTE GÉNÉRIQUE (DOIT ÊTRE À LA FIN) ====================
# Cette route capture tout ce qui n'a pas été capturé par les routes spécifiques ci-dessus

@router.get("/{tenant_slug}/planning/{semaine_debut}")
async def get_planning_semaine(
    tenant_slug: str,
    semaine_debut: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer le planning d'une semaine complète
    Retourne les assignations avec les informations des employés et types de garde
    
    IMPORTANT: Cette route DOIT être définie en DERNIER car {semaine_debut} 
    est un paramètre générique qui capturerait sinon les autres routes.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    date_debut, date_fin = get_semaine_range(semaine_debut)
    semaine_fin = date_fin.strftime("%Y-%m-%d")
    
    # Récupérer les assignations de la semaine
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": semaine_debut,
            "$lte": semaine_fin
        }
    }, {"_id": 0}).to_list(1000)
    
    # Récupérer les types de garde
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    # Récupérer les infos des employés assignés
    user_ids = list(set([a["user_id"] for a in assignations if a.get("user_id")]))
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "mot_de_passe_hash": 0}
    ).to_list(1000)
    users_dict = {u["id"]: u for u in users}
    
    # Enrichir les assignations
    for assignation in assignations:
        user_id = assignation.get("user_id")
        type_garde_id = assignation.get("type_garde_id")
        
        if user_id and user_id in users_dict:
            user = users_dict[user_id]
            assignation["user_nom"] = f"{user.get('prenom', '')} {user.get('nom', '')}"
            assignation["user_grade"] = user.get("grade", "")
        
        if type_garde_id and type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            assignation["type_garde_nom"] = tg.get("nom", "")
            assignation["type_garde_couleur"] = tg.get("couleur", "#3B82F6")
    
    # Construire l'objet Planning
    planning_obj = Planning(semaine_debut=semaine_debut, semaine_fin=semaine_fin)
    
    return {
        "id": planning_obj.id,
        "semaine_debut": semaine_debut,
        "semaine_fin": semaine_fin,
        "assignations": assignations,
        "types_garde": types_garde
    }
