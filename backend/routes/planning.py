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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from io import BytesIO
import uuid
import logging
import asyncio
import time

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_activite
)

# Import des helpers PDF partagés
from utils.pdf_helpers import (
    create_branded_pdf,
    get_modern_pdf_styles,
    create_pdf_footer_text
)

router = APIRouter(tags=["Planning"])
logger = logging.getLogger(__name__)


# ==================== SYSTÈME DE PROGRESSION TEMPS RÉEL ====================
# Dictionnaire global pour stocker les progressions des attributions auto
attribution_progress_store: Dict[str, Dict[str, Any]] = {}

class AttributionProgress:
    """Classe pour gérer la progression d'une attribution automatique"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.start_time = time.time()
        self.current_step = ""
        self.progress_percentage = 0
        self.total_gardes = 0
        self.gardes_traitees = 0
        self.assignations_creees = 0
        self.status = "en_cours"  # en_cours, termine, erreur
        self.error_message = None
        self.expires_at = time.time() + 3600  # Expire après 1 heure
        
    def update(self, step: str, progress: int, gardes_traitees: int = 0, assignations: int = 0):
        """Met à jour la progression"""
        self.current_step = step
        self.progress_percentage = min(progress, 100)
        self.gardes_traitees = gardes_traitees
        if assignations > 0:
            self.assignations_creees = assignations
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def complete(self, assignations_totales: int):
        """Marque la tâche comme terminée"""
        self.status = "termine"
        self.progress_percentage = 100
        self.assignations_creees = assignations_totales
        elapsed_time = time.time() - self.start_time
        self.current_step = f"✅ Terminé en {elapsed_time:.1f}s - {assignations_totales} assignations créées"
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def error(self, message: str):
        """Marque la tâche en erreur"""
        self.status = "erreur"
        self.error_message = message
        self.current_step = f"❌ Erreur: {message}"
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def to_dict(self):
        """Convertit en dictionnaire pour JSON"""
        elapsed = time.time() - self.start_time
        return {
            "task_id": self.task_id,
            "status": self.status,
            "current_step": self.current_step,
            "progress_percentage": self.progress_percentage,
            "total_gardes": self.total_gardes,
            "gardes_traitees": self.gardes_traitees,
            "assignations_creees": self.assignations_creees,
            "elapsed_time": f"{elapsed:.1f}s",
            "error_message": self.error_message
        }


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
    
    # Vérifier s'il n'y a pas déjà une assignation pour ce user/jour/type (évite les doublons)
    existing = await db.assignations.find_one({
        "tenant_id": tenant.id,
        "user_id": assignation_data.user_id,
        "date": assignation_data.date,
        "type_garde_id": assignation_data.type_garde_id
    })
    
    if existing:
        # Mettre à jour l'assignation existante pour ce même utilisateur
        await db.assignations.update_one(
            {"id": existing["id"]},
            {"$set": {
                "assignation_type": assignation_data.assignation_type,
                "notes_admin": assignation_data.notes_admin,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        updated = await db.assignations.find_one({"id": existing["id"]}, {"_id": 0})
        return updated
    
    # Compter le nombre d'assignations actuelles pour cette garde/date
    current_count = await db.assignations.count_documents({
        "tenant_id": tenant.id,
        "date": assignation_data.date,
        "type_garde_id": assignation_data.type_garde_id
    })
    
    personnel_requis = type_garde.get("personnel_requis", 1)
    warning_message = None
    
    # Vérifier si on va dépasser le personnel requis
    if current_count >= personnel_requis:
        warning_message = f"Cette garde nécessite {personnel_requis} personne(s), vous en avez maintenant {current_count + 1}."
    
    # Créer une nouvelle assignation (permet plusieurs personnes sur le même créneau)
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
    
    # Retourner l'assignation avec un éventuel avertissement
    result = clean_mongo_doc(assignation.dict())
    if warning_message:
        result["warning"] = warning_message
    
    return result


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


# ==================== ROUTES PLANNING AVANCÉES (MIGRÉES DE SERVER.PY) ====================


# DELETE formater-mois
@router.delete("/{tenant_slug}/planning/formater-mois")
async def formater_planning_mois(
    tenant_slug: str,
    mois: str,  # Format: YYYY-MM
    current_user: User = Depends(get_current_user)
):
    """
    Formate (vide) le planning d'un mois spécifique
    UNIQUEMENT pour le tenant demo
    Supprime: assignations, demandes de remplacement
    """
    # 1. Vérifier que c'est le tenant demo
    if tenant_slug != "demo":
        raise HTTPException(status_code=403, detail="Cette fonctionnalité est réservée au tenant demo")
    
    # 2. Vérifier que l'utilisateur est admin
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # 3. Valider le format du mois
    try:
        year, month = map(int, mois.split('-'))
        if month < 1 or month > 12:
            raise ValueError()
    except:
        raise HTTPException(status_code=400, detail="Format de mois invalide. Utilisez YYYY-MM")
    
    # 4. Calculer les dates de début et fin du mois
    date_debut = datetime(year, month, 1, tzinfo=timezone.utc)
    if month == 12:
        date_fin = datetime(year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    else:
        date_fin = datetime(year, month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    
    # 5. Supprimer les assignations du mois
    result_assignations = await db.assignations.delete_many({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut.isoformat(),
            "$lte": date_fin.isoformat()
        }
    })
    
    # 6. Supprimer les demandes de remplacement du mois
    result_remplacements = await db.demandes_remplacement.delete_many({
        "tenant_id": tenant.id,
        "date_garde": {
            "$gte": date_debut.isoformat(),
            "$lte": date_fin.isoformat()
        }
    })
    
    return {
        "message": f"Planning formaté avec succès pour {mois}",
        "mois": mois,
        "assignations_supprimees": result_assignations.deleted_count,
        "demandes_supprimees": result_remplacements.deleted_count
    }


# GET export-pdf
@router.get("/{tenant_slug}/planning/export-pdf")
async def export_planning_pdf(
    tenant_slug: str, 
    periode: str,
    type: str,
    current_user: User = Depends(get_current_user)
):
    """Export du planning en PDF"""
    try:
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        from io import BytesIO
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Calculer la période
        if type == 'semaine':
            date_debut = datetime.strptime(periode, '%Y-%m-%d')
            date_fin = date_debut + timedelta(days=6)
        else:  # mois
            year, month = map(int, periode.split('-'))
            date_debut = datetime(year, month, 1)
            if month == 12:
                date_fin = datetime(year + 1, 1, 1) - timedelta(days=1)
            else:
                date_fin = datetime(year, month + 1, 1) - timedelta(days=1)
        
        # Récupérer les données
        assignations_list = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut.strftime('%Y-%m-%d'),
                "$lte": date_fin.strftime('%Y-%m-%d')
            }
        }).to_list(length=None)
        
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        
        types_map = {t['id']: t for t in types_garde_list}
        users_map = {u['id']: u for u in users_list}
        
        # Créer le PDF avec branding
        buffer, doc, elements = create_branded_pdf(
            tenant,
            pagesize=landscape(letter),
            leftMargin=0.5*inch,
            rightMargin=0.5*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        styles = getSampleStyleSheet()
        modern_styles = get_modern_pdf_styles(styles)
        
        # Titre principal
        titre = f"PLANNING DES GARDES - V4"
        elements.append(Paragraph(titre, modern_styles['title']))
        
        # Sous-titre avec période
        type_label = "Semaine" if type == "semaine" else "Mois"
        periode_str = f"{type_label} du {date_debut.strftime('%d/%m/%Y')} au {date_fin.strftime('%d/%m/%Y')}"
        elements.append(Paragraph(periode_str, modern_styles['subheading']))
        elements.append(Spacer(1, 0.1*inch))
        
        # Ligne de séparation
        from reportlab.platypus import HRFlowable
        elements.append(HRFlowable(width="100%", thickness=1, color=modern_styles['grid'], spaceAfter=0.3*inch))
        
        # Jours français
        jours_fr = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
        
        # Couleurs pour la grille
        HEADER_BG = colors.HexColor('#1F2937')
        PRIMARY_RED = colors.HexColor('#DC2626')
        COMPLETE_GREEN = colors.HexColor('#D1FAE5')
        PARTIAL_YELLOW = colors.HexColor('#FEF3C7')
        VACANT_RED = colors.HexColor('#FEE2E2')
        LIGHT_GRAY = colors.HexColor('#F3F4F6')
        BORDER_COLOR = colors.HexColor('#E5E7EB')
        
        # Trier les types de garde par heure
        types_garde_sorted = sorted(types_garde_list, key=lambda x: x.get('heure_debut', '00:00'))
        
        if type == 'semaine':
            # ===== FORMAT GRILLE SEMAINE =====
            from reportlab.lib.enums import TA_LEFT
            
            # Styles pour les cellules - taille augmentée et leading adapté
            header_style_white = ParagraphStyle('HeaderWhite', fontSize=9, alignment=TA_CENTER, textColor=colors.white, leading=12, wordWrap='CJK')
            garde_cell_style = ParagraphStyle('GardeCell', fontSize=8, alignment=TA_LEFT, textColor=colors.white, leading=11, wordWrap='CJK')
            day_cell_style = ParagraphStyle('DayCell', fontSize=8, alignment=TA_CENTER, leading=11, textColor=colors.HexColor('#1F2937'), wordWrap='CJK')
            
            # Debug: logger les assignations
            logging.warning(f"DEBUG PDF: {len(assignations_list)} assignations trouvées pour {date_debut.strftime('%Y-%m-%d')} à {date_fin.strftime('%Y-%m-%d')}")
            logging.warning(f"DEBUG PDF: {len(types_garde_sorted)} types de garde")
            
            # En-tête : Type de garde + 7 jours
            header_row = [Paragraph("<b>Type de garde</b>", header_style_white)]
            for i in range(7):
                d = date_debut + timedelta(days=i)
                header_row.append(Paragraph(f"<b>{jours_fr[d.weekday()]}</b><br/>{d.strftime('%d/%m')}", header_style_white))
            
            table_data = [header_row]
            cell_colors = []
            
            # Une ligne par type de garde
            for type_garde in types_garde_sorted:
                garde_nom = type_garde.get('nom', 'N/A')
                heure_debut_garde = type_garde.get('heure_debut', '??:??')
                heure_fin_garde = type_garde.get('heure_fin', '??:??')
                personnel_requis = type_garde.get('personnel_requis', 1)
                jours_app = type_garde.get('jours_application', [])
                type_garde_id = type_garde.get('id')
                
                # Première colonne - nom complet sans troncature
                row = [Paragraph(f"<b>{garde_nom}</b><br/><font size='7'>{heure_debut_garde}-{heure_fin_garde}</font>", garde_cell_style)]
                row_colors = [PRIMARY_RED]
                
                for i in range(7):
                    d = date_debut + timedelta(days=i)
                    date_str = d.strftime('%Y-%m-%d')
                    day_name = d.strftime('%A').lower()
                    
                    # Vérifier si applicable ce jour
                    if jours_app and day_name not in jours_app:
                        row.append(Paragraph("-", day_cell_style))
                        row_colors.append(LIGHT_GRAY)
                        continue
                    
                    # Trouver les assignations pour ce jour et ce type de garde
                    assignations_jour = [a for a in assignations_list 
                                        if a.get('date') == date_str and a.get('type_garde_id') == type_garde_id]
                    
                    # Construire les noms des pompiers
                    noms = []
                    for a in assignations_jour:
                        user_id = a.get('user_id')
                        if user_id and user_id in users_map:
                            u = users_map[user_id]
                            prenom = u.get('prenom', '')
                            nom = u.get('nom', '')
                            if prenom or nom:
                                noms.append(f"{prenom[:1]}. {nom}")
                    
                    if noms:
                        cell_text = "<br/>".join(noms[:4])
                        if len(noms) > 4:
                            cell_text += f"<br/><font size='6'>+{len(noms)-4}</font>"
                        row.append(Paragraph(cell_text, day_cell_style))
                        
                        if len(noms) >= personnel_requis:
                            row_colors.append(COMPLETE_GREEN)
                        else:
                            row_colors.append(PARTIAL_YELLOW)
                    else:
                        row.append(Paragraph("<font color='#B91C1C'>Vacant</font>", day_cell_style))
                        row_colors.append(VACANT_RED)
                
                table_data.append(row)
                cell_colors.append(row_colors)
            
            # Largeurs de colonnes - première colonne plus large pour les noms de garde
            page_width = landscape(letter)[0]
            available_width = page_width - 1*inch
            first_col = 1.8*inch
            day_col = (available_width - first_col) / 7
            col_widths = [first_col] + [day_col] * 7
            
            # Hauteur minimale des lignes pour permettre l'affichage des noms
            row_heights = [0.5*inch] + [0.7*inch] * (len(table_data) - 1)
            
            # Créer la table avec hauteurs de lignes
            table = Table(table_data, colWidths=col_widths, rowHeights=row_heights)
            
            # Style de base - WORDWRAP activé pour permettre le retour à la ligne
            style_commands = [
                ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ('FONTSIZE', (0, 1), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 4),
                ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ]
            
            # Appliquer les couleurs par cellule
            for row_idx, colors_row in enumerate(cell_colors, start=1):
                for col_idx, bg_color in enumerate(colors_row):
                    style_commands.append(('BACKGROUND', (col_idx, row_idx), (col_idx, row_idx), bg_color))
                    if col_idx == 0:
                        style_commands.append(('TEXTCOLOR', (col_idx, row_idx), (col_idx, row_idx), colors.white))
                        style_commands.append(('ALIGN', (col_idx, row_idx), (col_idx, row_idx), 'LEFT'))
                        style_commands.append(('LEFTPADDING', (col_idx, row_idx), (col_idx, row_idx), 8))
            
            table.setStyle(TableStyle(style_commands))
            elements.append(table)
            
            # Légende
            elements.append(Spacer(1, 0.3*inch))
            legend_style = ParagraphStyle('Legend', fontSize=9, alignment=TA_CENTER, textColor=colors.HexColor('#6B7280'))
            elements.append(Paragraph("Legende: Vert = Complet | Jaune = Partiel | Rouge = Vacant | Gris = Non applicable", legend_style))
            
        elif type == 'mois':
            # ===== FORMAT GRILLE MOIS - Une grille par semaine =====
            from reportlab.platypus import PageBreak
            
            current = date_debut
            semaine_num = 1
            page_width = landscape(letter)[0]
            
            # Style pour titre de semaine
            semaine_style = ParagraphStyle(
                'SemaineStyle',
                parent=styles['Heading2'],
                fontSize=12,
                textColor=PRIMARY_RED,
                spaceBefore=10,
                spaceAfter=10,
                fontName='Helvetica-Bold'
            )
            
            while current <= date_fin:
                fin_semaine = min(current + timedelta(days=6), date_fin)
                nb_jours = (fin_semaine - current).days + 1
                
                # Titre de la semaine
                elements.append(Paragraph(
                    f"Semaine {semaine_num} - Du {current.strftime('%d/%m')} au {fin_semaine.strftime('%d/%m/%Y')}",
                    semaine_style
                ))
                
                # Styles pour le format mois - avec retour à la ligne
                from reportlab.lib.enums import TA_LEFT
                header_style_mois = ParagraphStyle('HeaderMois', fontSize=8, alignment=TA_CENTER, textColor=colors.white, leading=10, wordWrap='CJK')
                garde_cell_style_mois = ParagraphStyle('GardeCellMois', fontSize=7, alignment=TA_LEFT, textColor=colors.white, leading=9, wordWrap='CJK')
                day_cell_style_mois = ParagraphStyle('DayCellMois', fontSize=7, alignment=TA_CENTER, leading=9, textColor=colors.HexColor('#1F2937'), wordWrap='CJK')
                
                # En-tête avec des Paragraph pour le retour à la ligne
                header_row = [Paragraph("<b>Type de garde</b>", header_style_mois)]
                for i in range(nb_jours):
                    d = current + timedelta(days=i)
                    header_row.append(Paragraph(f"<b>{jours_fr[d.weekday()]}</b><br/>{d.strftime('%d')}", header_style_mois))
                
                table_data = [header_row]
                cell_colors_mois = []
                
                for type_garde in types_garde_sorted:
                    garde_nom = type_garde.get('nom', 'N/A')  # NE PLUS TRONQUER
                    heure_debut_garde = type_garde.get('heure_debut', '')
                    heure_fin_garde = type_garde.get('heure_fin', '')
                    personnel_requis = type_garde.get('personnel_requis', 1)
                    jours_app = type_garde.get('jours_application', [])
                    type_garde_id = type_garde.get('id')
                    
                    # Première colonne avec nom complet et horaires
                    row = [Paragraph(f"<b>{garde_nom}</b><br/><font size='6'>{heure_debut_garde}-{heure_fin_garde}</font>", garde_cell_style_mois)]
                    row_colors = [PRIMARY_RED]
                    
                    for i in range(nb_jours):
                        d = current + timedelta(days=i)
                        date_str = d.strftime('%Y-%m-%d')
                        day_name = d.strftime('%A').lower()
                        
                        if jours_app and day_name not in jours_app:
                            row.append(Paragraph("-", day_cell_style_mois))
                            row_colors.append(LIGHT_GRAY)
                            continue
                        
                        assignations_jour = [a for a in assignations_list 
                                            if a['date'] == date_str and a['type_garde_id'] == type_garde_id]
                        
                        # Construire les noms des pompiers
                        noms = []
                        for a in assignations_jour:
                            user_id = a.get('user_id')
                            if user_id and user_id in users_map:
                                u = users_map[user_id]
                                prenom = u.get('prenom', '')
                                nom = u.get('nom', '')
                                if prenom or nom:
                                    noms.append(f"{prenom[:1]}. {nom}")
                        
                        if noms:
                            cell_text = "<br/>".join(noms[:3])  # Max 3 noms pour le mois
                            if len(noms) > 3:
                                cell_text += f"<br/><font size='5'>+{len(noms)-3}</font>"
                            row.append(Paragraph(cell_text, day_cell_style_mois))
                            
                            if len(noms) >= personnel_requis:
                                row_colors.append(COMPLETE_GREEN)
                            else:
                                row_colors.append(PARTIAL_YELLOW)
                        else:
                            row.append(Paragraph("<font color='#B91C1C'>Vacant</font>", day_cell_style_mois))
                            row_colors.append(VACANT_RED)
                    
                    table_data.append(row)
                    cell_colors_mois.append(row_colors)
                
                # Largeurs - première colonne plus large pour afficher le nom complet
                available_width = page_width - 1*inch
                first_col = 1.6*inch  # Augmenté pour les noms de garde complets
                day_col = (available_width - first_col) / nb_jours
                col_widths = [first_col] + [day_col] * nb_jours
                
                # Hauteurs de lignes - plus hautes pour afficher les noms des pompiers
                row_heights = [0.4*inch] + [0.6*inch] * (len(table_data) - 1)
                
                table = Table(table_data, colWidths=col_widths, rowHeights=row_heights)
                
                style_commands = [
                    ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 7),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LEFTPADDING', (0, 0), (-1, -1), 3),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                ]
                
                for row_idx, colors_row in enumerate(cell_colors_mois, start=1):
                    for col_idx, bg_color in enumerate(colors_row):
                        style_commands.append(('BACKGROUND', (col_idx, row_idx), (col_idx, row_idx), bg_color))
                        if col_idx == 0:
                            style_commands.append(('TEXTCOLOR', (col_idx, row_idx), (col_idx, row_idx), colors.white))
                            style_commands.append(('ALIGN', (col_idx, row_idx), (col_idx, row_idx), 'LEFT'))
                            style_commands.append(('LEFTPADDING', (col_idx, row_idx), (col_idx, row_idx), 6))
                
                table.setStyle(TableStyle(style_commands))
                elements.append(table)
                elements.append(Spacer(1, 0.2*inch))
                
                current = fin_semaine + timedelta(days=1)
                semaine_num += 1
                
                if current <= date_fin:
                    elements.append(PageBreak())
        
        # Footer
        def add_footer(canvas, doc_obj):
            canvas.saveState()
            canvas.setStrokeColor(colors.HexColor('#e2e8f0'))
            canvas.setLineWidth(1)
            canvas.line(0.5*inch, 0.5*inch, landscape(letter)[0] - 0.5*inch, 0.5*inch)
            canvas.setFont('Helvetica', 9)
            canvas.setFillColor(colors.HexColor('#64748b'))
            footer_text = f"ProFireManager - {datetime.now().strftime('%d/%m/%Y %H:%M')}"
            canvas.drawCentredString(landscape(letter)[0] / 2, 0.35*inch, footer_text)
            canvas.setFont('Helvetica', 8)
            canvas.drawRightString(landscape(letter)[0] - 0.5*inch, 0.35*inch, f"Page {doc_obj.page}")
            canvas.restoreState()
        
        doc.build(elements, onFirstPage=add_footer, onLaterPages=add_footer)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=planning_{type}_{periode}.pdf"}
        )
        
    except Exception as e:
        import traceback
        logging.error(f"Erreur export PDF: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Erreur export PDF: {str(e)}")



# GET export-excel
@router.get("/{tenant_slug}/planning/export-excel")
async def export_planning_excel(
    tenant_slug: str, 
    periode: str,
    type: str,
    current_user: User = Depends(get_current_user)
):
    """Export du planning en Excel"""
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        from io import BytesIO
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Calculer la période
        if type == 'semaine':
            date_debut = datetime.strptime(periode, '%Y-%m-%d')
            date_fin = date_debut + timedelta(days=6)
        else:
            year, month = map(int, periode.split('-'))
            date_debut = datetime(year, month, 1)
            if month == 12:
                date_fin = datetime(year + 1, 1, 1) - timedelta(days=1)
            else:
                date_fin = datetime(year, month + 1, 1) - timedelta(days=1)
        
        assignations_list = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut.strftime('%Y-%m-%d'),
                "$lte": date_fin.strftime('%Y-%m-%d')
            }
        }).to_list(length=None)
        
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        
        types_map = {t['id']: t for t in types_garde_list}
        users_map = {u['id']: u for u in users_list}
        
        wb = Workbook()
        ws = wb.active
        ws.title = f"Planning {type}"
        
        header_fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=12)
        center_alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        ws.merge_cells('A1:H1')
        ws['A1'] = f"Planning des Gardes - {type.capitalize()}"
        ws['A1'].font = Font(bold=True, size=16, color="EF4444")
        ws['A1'].alignment = center_alignment
        
        ws.merge_cells('A2:H2')
        ws['A2'] = f"Du {date_debut.strftime('%d/%m/%Y')} au {date_fin.strftime('%d/%m/%Y')}"
        ws['A2'].alignment = center_alignment
        
        row = 4
        if type == 'semaine':
            headers = ['Type de Garde', 'Horaires'] + [(date_debut + timedelta(days=i)).strftime('%a %d/%m') for i in range(7)]
        else:
            headers = ['Date', 'Jour', 'Type de Garde', 'Horaires', 'Personnel', 'Requis', 'Assignés', 'Statut']
        
        for col, header in enumerate(headers, start=1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_alignment
            cell.border = border
        
        row += 1
        
        if type == 'semaine':
            for type_garde in sorted(types_garde_list, key=lambda x: x.get('heure_debut', '')):
                ws.cell(row=row, column=1, value=type_garde['nom'])
                ws.cell(row=row, column=2, value=f"{type_garde.get('heure_debut', '')} - {type_garde.get('heure_fin', '')}")
                
                for i in range(7):
                    current_date = (date_debut + timedelta(days=i)).strftime('%Y-%m-%d')
                    assignations_jour = [a for a in assignations_list if a['date'] == current_date and a['type_garde_id'] == type_garde['id']]
                    
                    noms = [f"{users_map[a['user_id']]['prenom']} {users_map[a['user_id']]['nom']}" 
                           for a in assignations_jour if a['user_id'] in users_map]
                    
                    cell_text = '\n'.join(noms) if noms else 'Vacant'
                    cell = ws.cell(row=row, column=3+i, value=cell_text)
                    cell.alignment = center_alignment
                    cell.border = border
                    
                    if len(noms) >= type_garde.get('personnel_requis', 1):
                        cell.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
                    elif noms:
                        cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                    else:
                        cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
                
                row += 1
        else:
            current = date_debut
            while current <= date_fin:
                date_str = current.strftime('%Y-%m-%d')
                jour_fr = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][current.weekday()]
                
                for type_garde in types_garde_list:
                    assignations_jour = [a for a in assignations_list if a['date'] == date_str and a['type_garde_id'] == type_garde['id']]
                    
                    noms = [f"{users_map[a['user_id']]['prenom']} {users_map[a['user_id']]['nom']}" 
                           for a in assignations_jour if a['user_id'] in users_map]
                    
                    personnel_str = ', '.join(noms) if noms else 'Aucun'
                    requis = type_garde.get('personnel_requis', 1)
                    assignes = len(noms)
                    statut = 'Complet' if assignes >= requis else 'Partiel' if noms else 'Vacant'
                    
                    ws.cell(row=row, column=1, value=current.strftime('%d/%m/%Y'))
                    ws.cell(row=row, column=2, value=jour_fr)
                    ws.cell(row=row, column=3, value=type_garde['nom'])
                    ws.cell(row=row, column=4, value=f"{type_garde.get('heure_debut', '')} - {type_garde.get('heure_fin', '')}")
                    ws.cell(row=row, column=5, value=personnel_str)
                    ws.cell(row=row, column=6, value=requis)
                    ws.cell(row=row, column=7, value=assignes)
                    status_cell = ws.cell(row=row, column=8, value=statut)
                    
                    if statut == 'Complet':
                        status_cell.fill = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")
                    elif statut == 'Partiel':
                        status_cell.fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
                    else:
                        status_cell.fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
                    
                    for col in range(1, 9):
                        ws.cell(row=row, column=col).border = border
                        ws.cell(row=row, column=col).alignment = center_alignment
                    
                    row += 1
                
                current += timedelta(days=1)
        
        # Définir les largeurs de colonnes fixes pour éviter les erreurs avec MergedCell
        column_widths = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
        default_widths = [12, 12, 18, 15, 25, 10, 10, 12, 12]
        for i, col_letter in enumerate(column_widths):
            if i < len(default_widths):
                ws.column_dimensions[col_letter].width = default_widths[i]
        
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=planning_{type}_{periode}.xlsx"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur export Excel: {str(e)}")

# ===== RAPPORT D'HEURES =====



# GET rapport-heures/debug
@router.get("/{tenant_slug}/planning/rapport-heures/debug/{user_id}")
async def debug_rapport_heures_user(
    tenant_slug: str,
    user_id: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    """Endpoint de diagnostic pour comprendre le calcul des heures d'un utilisateur"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'utilisateur
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Récupérer TOUTES les assignations (avec doublons éventuels)
    assignations_brutes = await db.assignations.find({
        "user_id": user_id,
        "tenant_id": tenant.id,
        "date": {"$gte": date_debut, "$lte": date_fin}
    }, {"_id": 0}).to_list(10000)
    
    # Déduplication
    assignations_uniques = {}
    doublons = []
    for a in assignations_brutes:
        key = f"{a['user_id']}_{a['type_garde_id']}_{a['date']}"
        if key not in assignations_uniques:
            assignations_uniques[key] = a
        else:
            doublons.append(a)
    
    assignations = list(assignations_uniques.values())
    
    # Récupérer les types de garde
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    types_garde_map = {t["id"]: t for t in types_garde}
    
    # Calculer les détails
    details = []
    total_heures = 0
    total_heures_calculees = 0
    
    for a in assignations:
        type_garde = types_garde_map.get(a["type_garde_id"])
        if type_garde:
            duree_stored = type_garde.get("duree_heures", None)
            
            # Calculer la durée réelle à partir des horaires
            duree_calculee = None
            if type_garde.get("heure_debut") and type_garde.get("heure_fin"):
                try:
                    from datetime import datetime
                    debut = datetime.strptime(type_garde["heure_debut"], "%H:%M")
                    fin = datetime.strptime(type_garde["heure_fin"], "%H:%M")
                    if fin < debut:
                        fin = fin.replace(day=debut.day + 1)
                    delta = (fin - debut).total_seconds() / 3600
                    duree_calculee = round(delta, 2)
                except:
                    duree_calculee = None
            
            # Durée utilisée par le code (celle dans le rapport)
            duree_utilisee = duree_stored if duree_stored is not None else 8
            
            total_heures += duree_utilisee
            if duree_calculee:
                total_heures_calculees += duree_calculee
            
            details.append({
                "date": a["date"],
                "type_garde_nom": type_garde.get("nom"),
                "type_garde_id": a["type_garde_id"],
                "heure_debut": type_garde.get("heure_debut"),
                "heure_fin": type_garde.get("heure_fin"),
                "duree_stored_bd": duree_stored,
                "duree_calculee_horaires": duree_calculee,
                "duree_utilisee_rapport": duree_utilisee,
                "est_garde_externe": type_garde.get("est_garde_externe", False)
            })
    
    return {
        "user": {
            "id": user["id"],
            "nom_complet": f"{user.get('prenom')} {user.get('nom')}",
            "email": user.get("email"),
            "heures_max_semaine": user.get("heures_max_semaine", 40)
        },
        "periode": f"{date_debut} au {date_fin}",
        "compteurs": {
            "assignations_brutes": len(assignations_brutes),
            "assignations_uniques": len(assignations),
            "doublons_detectes": len(doublons),
            "total_heures_rapport": total_heures,
            "total_heures_reelles_calculees": total_heures_calculees
        },
        "assignations_details": sorted(details, key=lambda x: x["date"]),
        "doublons": doublons[:10] if doublons else []
    }


# POST supprimer-assignations-invalides
@router.post("/{tenant_slug}/planning/supprimer-assignations-invalides")
async def supprimer_assignations_invalides(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime toutes les assignations qui ne respectent pas les jours_application"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin uniquement")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # D'abord, récupérer le rapport des invalides
    assignations = await db.assignations.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(10000)
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}, {"_id": 0}).to_list(1000)
    types_garde_map = {t["id"]: t for t in types_garde}
    
    jours_fr_to_en = {
        0: "monday", 1: "tuesday", 2: "wednesday", 3: "thursday",
        4: "friday", 5: "saturday", 6: "sunday"
    }
    
    ids_to_delete = []
    
    for a in assignations:
        type_garde = types_garde_map.get(a["type_garde_id"])
        if not type_garde:
            continue
        
        jours_application = type_garde.get("jours_application", [])
        if not jours_application:
            continue
        
        try:
            from datetime import datetime
            date_obj = datetime.strptime(a["date"], "%Y-%m-%d")
            jour_semaine_en = jours_fr_to_en[date_obj.weekday()]
            
            if jour_semaine_en not in jours_application:
                ids_to_delete.append(a["id"])
        except:
            pass
    
    # Supprimer
    if ids_to_delete:
        result = await db.assignations.delete_many({
            "id": {"$in": ids_to_delete},
            "tenant_id": tenant.id
        })
        deleted_count = result.deleted_count
    else:
        deleted_count = 0
    
    return {
        "message": f"Supprimé {deleted_count} assignations invalides",
        "deleted_count": deleted_count,
        "ids_supprimes": ids_to_delete[:50]  # Max 50 pour la réponse
    }


# GET rapport-heures/export-pdf
@router.get("/{tenant_slug}/planning/rapport-heures/export-pdf")
async def export_rapport_heures_pdf(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    """Génère le PDF du rapport d'heures pour impression"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Convertir date_debut en format mois pour appeler get_rapport_heures
    mois = date_debut[:7]  # YYYY-MM
    
    # Récupérer les données du rapport en créant un faux current_user pour l'appel interne
    # On va récupérer les données directement ici
    from datetime import datetime as dt
    debut_dt = dt.strptime(date_debut, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    fin_dt = dt.strptime(date_fin, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    
    # Récupérer toutes les assignations de la période
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {"$gte": debut_dt.strftime("%Y-%m-%d"), "$lt": fin_dt.strftime("%Y-%m-%d")}
    }).to_list(10000)
    
    # Récupérer tous les utilisateurs
    users = await db.users.find({"tenant_id": tenant.id, "actif": True}).to_list(1000)
    users_dict = {u["id"]: u for u in users}
    
    # Calculer les heures par employé
    heures_par_employe = {}
    for assign in assignations:
        uid = assign.get("user_id")
        if uid not in heures_par_employe:
            heures_par_employe[uid] = {"internes": 0, "externes": 0}
        
        duree = assign.get("duree_heures", 0)
        if assign.get("externe"):
            heures_par_employe[uid]["externes"] += duree
        else:
            heures_par_employe[uid]["internes"] += duree
    
    # Construire la liste des employés
    employes = []
    for uid, heures in heures_par_employe.items():
        user = users_dict.get(uid, {})
        employes.append({
            "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or "Inconnu",
            "type_emploi": user.get("type_emploi", "temps_plein"),
            "grade": user.get("grade", "N/A"),
            "heures_internes": heures["internes"],
            "heures_externes": heures["externes"],
            "total_heures": heures["internes"] + heures["externes"]
        })
    
    # Trier par nom
    employes.sort(key=lambda x: x["nom_complet"])
    
    # Statistiques
    total_internes = sum(e["heures_internes"] for e in employes)
    total_externes = sum(e["heures_externes"] for e in employes)
    nb_employes = len(employes)
    
    statistiques = {
        "nombre_employes": nb_employes,
        "total_heures_planifiees": total_internes + total_externes,
        "moyenne_heures_internes": round(total_internes / nb_employes, 1) if nb_employes > 0 else 0,
        "moyenne_heures_externes": round(total_externes / nb_employes, 1) if nb_employes > 0 else 0
    }
    
    rapport_response = {"employes": employes, "statistiques": statistiques}
    
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    # Utiliser la fonction helper pour créer un PDF brandé
    buffer, doc, elements = create_branded_pdf(tenant, pagesize=A4)
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Titre
    elements.append(Paragraph("Rapport d'Heures", modern_styles['title']))
    
    # Période
    debut_dt = datetime.strptime(date_debut, "%Y-%m-%d")
    fin_dt = datetime.strptime(date_fin, "%Y-%m-%d")
    periode_text = f"Période: {debut_dt.strftime('%d/%m/%Y')} - {fin_dt.strftime('%d/%m/%Y')}"
    elements.append(Paragraph(periode_text, modern_styles['subheading']))
    
    # Tableau des employés
    table_data = [
        ['Employé', 'Type', 'Grade', 'H. Internes', 'H. Externes', 'Total']
    ]
    
    for emp in rapport_response["employes"]:
        type_emploi = emp.get("type_emploi", "temps_plein")
        if type_emploi == "temps_plein":
            type_emploi_abbr = "TP"
        elif type_emploi == "temporaire":
            type_emploi_abbr = "Tempo"
        else:
            type_emploi_abbr = "TPart"
        table_data.append([
            emp["nom_complet"],
            type_emploi_abbr,
            emp.get("grade", "N/A"),
            f"{emp['heures_internes']}h",
            f"{emp['heures_externes']}h",
            f"{emp['total_heures']}h"
        ])
    
    table = Table(table_data, colWidths=[2.5*inch, 0.6*inch, 1.2*inch, 1*inch, 1*inch, 0.8*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    elements.append(table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Statistiques
    stats = rapport_response["statistiques"]
    stats_text = f"""
    <b>Statistiques Globales</b><br/>
    Nombre d'employés: {stats['nombre_employes']}<br/>
    Total heures planifiées: {stats['total_heures_planifiees']}h<br/>
    Moyenne heures internes: {stats['moyenne_heures_internes']}h<br/>
    Moyenne heures externes: {stats['moyenne_heures_externes']}h
    """
    elements.append(Paragraph(stats_text, styles['Normal']))
    
    # Ajouter footer ProFireManager
    elements.append(Spacer(1, 0.5*inch))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.grey,
        alignment=TA_CENTER
    )
    footer_text = create_pdf_footer_text(tenant)
    if footer_text:
        elements.append(Paragraph(footer_text, footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rapport_heures_{date_debut}_{date_fin}.pdf"}
    )


# GET rapport-heures/export-excel
@router.get("/{tenant_slug}/planning/rapport-heures/export-excel")
async def export_rapport_heures_excel(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    """Génère l'Excel du rapport d'heures"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données directement (même logique que pour le PDF)
    from datetime import datetime as dt
    debut_dt = dt.strptime(date_debut, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    fin_dt = dt.strptime(date_fin, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
    
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {"$gte": debut_dt.strftime("%Y-%m-%d"), "$lt": fin_dt.strftime("%Y-%m-%d")}
    }).to_list(10000)
    
    users = await db.users.find({"tenant_id": tenant.id, "actif": True}).to_list(1000)
    users_dict = {u["id"]: u for u in users}
    
    heures_par_employe = {}
    for assign in assignations:
        uid = assign.get("user_id")
        if uid not in heures_par_employe:
            heures_par_employe[uid] = {"internes": 0, "externes": 0}
        
        duree = assign.get("duree_heures", 0)
        if assign.get("externe"):
            heures_par_employe[uid]["externes"] += duree
        else:
            heures_par_employe[uid]["internes"] += duree
    
    employes = []
    for uid, heures in heures_par_employe.items():
        user = users_dict.get(uid, {})
        employes.append({
            "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or "Inconnu",
            "type_emploi": user.get("type_emploi", "temps_plein"),
            "grade": user.get("grade", "N/A"),
            "heures_internes": heures["internes"],
            "heures_externes": heures["externes"],
            "total_heures": heures["internes"] + heures["externes"]
        })
    
    employes.sort(key=lambda x: x["nom_complet"])
    
    total_internes = sum(e["heures_internes"] for e in employes)
    total_externes = sum(e["heures_externes"] for e in employes)
    nb_employes = len(employes)
    
    statistiques = {
        "nombre_employes": nb_employes,
        "total_heures_planifiees": total_internes + total_externes,
        "moyenne_heures_internes": round(total_internes / nb_employes, 1) if nb_employes > 0 else 0,
        "moyenne_heures_externes": round(total_externes / nb_employes, 1) if nb_employes > 0 else 0
    }
    
    rapport_response = {"employes": employes, "statistiques": statistiques}
    
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Rapport Heures"
    
    # Styles
    header_fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    border = Border(
        left=Side(style='thin'),
        right=Side(style='thin'),
        top=Side(style='thin'),
        bottom=Side(style='thin')
    )
    center_alignment = Alignment(horizontal="center", vertical="center")
    
    # Titre
    ws.merge_cells('A1:F1')
    title_cell = ws['A1']
    title_cell.value = "Rapport d'Heures"
    title_cell.font = Font(size=16, bold=True, color="DC2626")
    title_cell.alignment = center_alignment
    
    # Période
    ws.merge_cells('A2:F2')
    periode_cell = ws['A2']
    debut_dt = datetime.strptime(date_debut, "%Y-%m-%d")
    fin_dt = datetime.strptime(date_fin, "%Y-%m-%d")
    periode_cell.value = f"Période: {debut_dt.strftime('%d/%m/%Y')} - {fin_dt.strftime('%d/%m/%Y')}"
    periode_cell.alignment = center_alignment
    
    # En-têtes du tableau
    headers = ['Employé', 'Type', 'Grade', 'H. Internes', 'H. Externes', 'Total']
    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=4, column=col)
        cell.value = header
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
        cell.alignment = center_alignment
    
    # Données
    row = 5
    for emp in rapport_response["employes"]:
        type_emploi = emp.get("type_emploi", "temps_plein")
        if type_emploi == "temps_plein":
            type_emploi_abbr = "TP"
        elif type_emploi == "temporaire":
            type_emploi_abbr = "Tempo"
        else:
            type_emploi_abbr = "TPart"
        ws.cell(row=row, column=1, value=emp["nom_complet"])
        ws.cell(row=row, column=2, value=type_emploi_abbr)
        ws.cell(row=row, column=3, value=emp.get("grade", "N/A"))
        ws.cell(row=row, column=4, value=emp["heures_internes"])
        ws.cell(row=row, column=5, value=emp["heures_externes"])
        ws.cell(row=row, column=6, value=emp["total_heures"])
        
        for col in range(1, 7):
            ws.cell(row=row, column=col).border = border
            ws.cell(row=row, column=col).alignment = center_alignment
        
        row += 1
    
    # Statistiques
    stats = rapport_response["statistiques"]
    row += 1
    ws.merge_cells(f'A{row}:F{row}')
    stats_cell = ws.cell(row=row, column=1)
    stats_cell.value = "Statistiques Globales"
    stats_cell.font = Font(bold=True, size=12)
    
    row += 1
    ws.cell(row=row, column=1, value="Nombre d'employés:")
    ws.cell(row=row, column=2, value=stats['nombre_employes'])
    
    row += 1
    ws.cell(row=row, column=1, value="Total heures planifiées:")
    ws.cell(row=row, column=2, value=stats['total_heures_planifiees'])
    
    row += 1
    ws.cell(row=row, column=1, value="Moyenne heures internes:")
    ws.cell(row=row, column=2, value=stats['moyenne_heures_internes'])
    
    row += 1
    ws.cell(row=row, column=1, value="Moyenne heures externes:")
    ws.cell(row=row, column=2, value=stats['moyenne_heures_externes'])
    
    # Ajuster les largeurs
    ws.column_dimensions['A'].width = 25
    ws.column_dimensions['B'].width = 8
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    ws.column_dimensions['E'].width = 12
    ws.column_dimensions['F'].width = 10
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=rapport_heures_{date_debut}_{date_fin}.xlsx"}
    )


# POST assignation-avancee
@router.post("/{tenant_slug}/planning/assignation-avancee")
async def assignation_manuelle_avancee(
    tenant_slug: str,
    assignation_data: dict,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        user_id = assignation_data.get("user_id")
        type_garde_id = assignation_data.get("type_garde_id")
        recurrence_type = assignation_data.get("recurrence_type", "unique")
        date_debut = datetime.strptime(assignation_data.get("date_debut"), "%Y-%m-%d").date()
        date_fin = datetime.strptime(assignation_data.get("date_fin", assignation_data.get("date_debut")), "%Y-%m-%d").date()
        jours_semaine = assignation_data.get("jours_semaine", [])
        bi_hebdomadaire = assignation_data.get("bi_hebdomadaire", False)
        recurrence_intervalle = assignation_data.get("recurrence_intervalle", 1)
        recurrence_frequence = assignation_data.get("recurrence_frequence", "jours")
        
        assignations_creees = []
        
        if recurrence_type == "unique":
            # Assignation unique
            assignation_obj = Assignation(
                user_id=user_id,
                type_garde_id=type_garde_id,
                date=date_debut.strftime("%Y-%m-%d"),
                assignation_type="manuel_avance",
                tenant_id=tenant.id
            )
            await db.assignations.insert_one(assignation_obj.dict())
            assignations_creees.append(assignation_obj.dict())
            
        elif recurrence_type == "hebdomadaire":
            # Récurrence hebdomadaire (avec option bi-hebdomadaire)
            current_date = date_debut
            jours_semaine_index = {
                'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
                'friday': 4, 'saturday': 5, 'sunday': 6
            }
            
            # Pour bi-hebdomadaire : calculer le numéro de semaine ISO de la date de début
            def get_iso_week_number(date):
                # Python's isocalendar() retourne (année, semaine, jour_semaine)
                return date.isocalendar()[1]
            
            reference_week = get_iso_week_number(date_debut)
            
            while current_date <= date_fin:
                day_name = current_date.strftime("%A").lower()
                
                # Vérifier si c'est un jour sélectionné
                if day_name in jours_semaine:
                    # Si bi-hebdomadaire, vérifier la différence de semaines
                    current_week = get_iso_week_number(current_date)
                    weeks_difference = current_week - reference_week
                    
                    if not bi_hebdomadaire or weeks_difference % 2 == 0:
                        # Vérifier qu'il n'y a pas déjà une assignation
                        existing = await db.assignations.find_one({
                            "user_id": user_id,
                            "type_garde_id": type_garde_id,
                            "date": current_date.strftime("%Y-%m-%d"),
                            "tenant_id": tenant.id
                        })
                        
                        if not existing:
                            assignation_obj = Assignation(
                                user_id=user_id,
                                type_garde_id=type_garde_id,
                                date=current_date.strftime("%Y-%m-%d"),
                                assignation_type="manuel_avance",
                                tenant_id=tenant.id
                            )
                            await db.assignations.insert_one(assignation_obj.dict())
                            assignations_creees.append(assignation_obj.dict())
                
                current_date += timedelta(days=1)
        
        elif recurrence_type == "bihebdomadaire":
            # Récurrence bi-hebdomadaire (toutes les 2 semaines)
            current_date = date_debut
            
            # Calculer le numéro de semaine ISO de référence
            def get_iso_week_number(date):
                return date.isocalendar()[1]
            
            reference_week = get_iso_week_number(date_debut)
            
            while current_date <= date_fin:
                day_name = current_date.strftime("%A").lower()
                
                # Calculer la différence de semaines
                current_week = get_iso_week_number(current_date)
                weeks_difference = current_week - reference_week
                
                # Vérifier si c'est un jour sélectionné et une semaine paire
                if day_name in jours_semaine and weeks_difference % 2 == 0:
                    existing = await db.assignations.find_one({
                        "user_id": user_id,
                        "type_garde_id": type_garde_id,
                        "date": current_date.strftime("%Y-%m-%d"),
                        "tenant_id": tenant.id
                    })
                    
                    if not existing:
                        assignation_obj = Assignation(
                            user_id=user_id,
                            type_garde_id=type_garde_id,
                            date=current_date.strftime("%Y-%m-%d"),
                            assignation_type="manuel_avance",
                            tenant_id=tenant.id
                        )
                        await db.assignations.insert_one(assignation_obj.dict())
                        assignations_creees.append(assignation_obj.dict())
                
                current_date += timedelta(days=1)
                
        elif recurrence_type == "mensuel" or recurrence_type == "mensuelle":
            # Récurrence mensuelle (même jour du mois)
            jour_mois = date_debut.day
            current_month = date_debut.replace(day=1)
            
            while current_month <= date_fin:
                try:
                    # Essayer de créer la date pour ce mois
                    target_date = current_month.replace(day=jour_mois)
                    
                    if date_debut <= target_date <= date_fin:
                        existing = await db.assignations.find_one({
                            "user_id": user_id,
                            "type_garde_id": type_garde_id,
                            "date": target_date.strftime("%Y-%m-%d"),
                            "tenant_id": tenant.id
                        })
                        
                        if not existing:
                            assignation_obj = Assignation(
                                user_id=user_id,
                                type_garde_id=type_garde_id,
                                date=target_date.strftime("%Y-%m-%d"),
                                assignation_type="manuel_avance",
                                tenant_id=tenant.id
                            )
                            await db.assignations.insert_one(assignation_obj.dict())
                            assignations_creees.append(assignation_obj.dict())
                            
                except ValueError:
                    # Jour n'existe pas dans ce mois (ex: 31 février)
                    pass
                
                # Passer au mois suivant
                if current_month.month == 12:
                    current_month = current_month.replace(year=current_month.year + 1, month=1)
                else:
                    current_month = current_month.replace(month=current_month.month + 1)
        
        elif recurrence_type == "annuelle":
            # Récurrence annuelle (même jour et mois chaque année)
            jour_mois = date_debut.day
            mois = date_debut.month
            current_year = date_debut.year
            
            while True:
                try:
                    target_date = date(current_year, mois, jour_mois)
                    
                    if target_date > date_fin:
                        break
                    
                    if target_date >= date_debut:
                        existing = await db.assignations.find_one({
                            "user_id": user_id,
                            "type_garde_id": type_garde_id,
                            "date": target_date.strftime("%Y-%m-%d"),
                            "tenant_id": tenant.id
                        })
                        
                        if not existing:
                            assignation_obj = Assignation(
                                user_id=user_id,
                                type_garde_id=type_garde_id,
                                date=target_date.strftime("%Y-%m-%d"),
                                assignation_type="manuel_avance",
                                tenant_id=tenant.id
                            )
                            await db.assignations.insert_one(assignation_obj.dict())
                            assignations_creees.append(assignation_obj.dict())
                    
                    current_year += 1
                except ValueError:
                    # Jour n'existe pas (ex: 29 février dans une année non bissextile)
                    current_year += 1
        
        elif recurrence_type == "personnalisee":
            # Récurrence personnalisée
            current_date = date_debut
            
            if recurrence_frequence == "jours":
                delta = timedelta(days=recurrence_intervalle)
            elif recurrence_frequence == "semaines":
                delta = timedelta(weeks=recurrence_intervalle)
            else:
                # Pour mois et ans, on gérera différemment
                delta = None
            
            if delta:
                while current_date <= date_fin:
                    existing = await db.assignations.find_one({
                        "user_id": user_id,
                        "type_garde_id": type_garde_id,
                        "date": current_date.strftime("%Y-%m-%d"),
                        "tenant_id": tenant.id
                    })
                    
                    if not existing:
                        assignation_obj = Assignation(
                            user_id=user_id,
                            type_garde_id=type_garde_id,
                            date=current_date.strftime("%Y-%m-%d"),
                            assignation_type="manuel_avance",
                            tenant_id=tenant.id
                        )
                        await db.assignations.insert_one(assignation_obj.dict())
                        assignations_creees.append(assignation_obj.dict())
                    
                    current_date += delta
            else:
                # Pour mois et ans
                current_date = date_debut
                while current_date <= date_fin:
                    existing = await db.assignations.find_one({
                        "user_id": user_id,
                        "type_garde_id": type_garde_id,
                        "date": current_date.strftime("%Y-%m-%d"),
                        "tenant_id": tenant.id
                    })
                    
                    if not existing:
                        assignation_obj = Assignation(
                            user_id=user_id,
                            type_garde_id=type_garde_id,
                            date=current_date.strftime("%Y-%m-%d"),
                            assignation_type="manuel_avance",
                            tenant_id=tenant.id
                        )
                        await db.assignations.insert_one(assignation_obj.dict())
                        assignations_creees.append(assignation_obj.dict())
                    
                    if recurrence_frequence == "mois":
                        # Ajouter X mois
                        month = current_date.month + recurrence_intervalle
                        year = current_date.year
                        while month > 12:
                            month -= 12
                            year += 1
                        try:
                            current_date = current_date.replace(year=year, month=month)
                        except ValueError:
                            # Jour invalide pour ce mois
                            break
                    elif recurrence_frequence == "ans":
                        # Ajouter X ans
                        try:
                            current_date = current_date.replace(year=current_date.year + recurrence_intervalle)
                        except ValueError:
                            # Jour invalide (29 février)
                            break
        
        return {
            "message": "Assignation avancée créée avec succès",
            "assignations_creees": len(assignations_creees),
            "recurrence": recurrence_type,
            "periode": f"{date_debut.strftime('%Y-%m-%d')} à {date_fin.strftime('%Y-%m-%d')}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur assignation avancée: {str(e)}")

# Mode démo spécial - Attribution automatique agressive pour impression client

# POST attribution-auto-demo
@router.post("/{tenant_slug}/planning/attribution-auto-demo")
async def attribution_automatique_demo(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Get all available users and types de garde pour ce tenant
        users = await db.users.find({"statut": "Actif", "tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Get existing assignations for the week
        semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        existing_assignations = await db.assignations.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        nouvelles_assignations = []
        
        # MODE DÉMO AGRESSIF - REMPLIR AU MAXIMUM
        for type_garde in types_garde:
            for day_offset in range(7):
                current_date = datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=day_offset)
                date_str = current_date.strftime("%Y-%m-%d")
                day_name = current_date.strftime("%A").lower()
                
                # CORRECTION CRITIQUE: Skip if type garde doesn't apply to this day
                jours_app = type_garde.get("jours_application", [])
                if jours_app and len(jours_app) > 0 and day_name not in jours_app:
                    logging.debug(f"⏭️ [SKIP DAY DEMO] {type_garde['nom']} - {date_str} ({day_name}): Jour non applicable (limité à {jours_app})")
                    continue
                
                # Compter combien de personnel déjà assigné pour cette garde
                existing_for_garde = [a for a in existing_assignations 
                                    if a["date"] == date_str and a["type_garde_id"] == type_garde["id"]]
                
                personnel_deja_assigne = len(existing_for_garde)
                personnel_requis = type_garde.get("personnel_requis", 1)
                
                # Assigner jusqu'au maximum requis
                for i in range(personnel_requis - personnel_deja_assigne):
                    # Trouver utilisateurs disponibles
                    available_users = []
                    
                    for user in users:
                        # Skip si déjà assigné cette garde ce jour
                        if any(a["user_id"] == user["id"] and a["date"] == date_str and a["type_garde_id"] == type_garde["id"] 
                               for a in existing_assignations):
                            continue
                        
                        # Skip si déjà assigné autre garde ce jour (éviter conflits)
                        if any(a["user_id"] == user["id"] and a["date"] == date_str 
                               for a in existing_assignations):
                            continue
                        
                        # Vérifier disponibilités
                        user_dispos = await db.disponibilites.find({
                            "user_id": user["id"],
                            "date": date_str,
                            "type_garde_id": type_garde["id"],
                            "statut": "disponible"
                        }).to_list(10)
                        
                        if user_dispos:
                            available_users.append(user)
                    
                    if not available_users:
                        break  # Pas d'utilisateurs disponibles pour ce poste
                    
                    # MODE DÉMO : ASSOUPLIR CONTRAINTE OFFICIER
                    if type_garde.get("officier_obligatoire", False):
                        # Chercher officiers d'abord
                        officers = [u for u in available_users if u.get("grade", "") in ["Capitaine", "Lieutenant", "Directeur"]]
                        # Sinon pompiers avec fonction supérieur
                        if not officers:
                            officers = [u for u in available_users if u.get("fonction_superieur", False)]
                        # En dernier recours : tous pompiers (MODE DÉMO)
                        if not officers:
                            officers = available_users
                        
                        if officers:
                            selected_user = officers[0]
                        else:
                            continue
                    else:
                        selected_user = available_users[0]
                    
                    # Créer assignation
                    assignation_obj = Assignation(
                        user_id=selected_user["id"],
                        type_garde_id=type_garde["id"],
                        date=date_str,
                        assignation_type="auto_demo",
                        tenant_id=tenant.id
                    )
                    
                    await db.assignations.insert_one(assignation_obj.dict())
                    nouvelles_assignations.append(assignation_obj.dict())
                    existing_assignations.append(assignation_obj.dict())
        
        return {
            "message": "Attribution DÉMO agressive effectuée avec succès",
            "assignations_creees": len(nouvelles_assignations),
            "algorithme": "Mode démo : Contraintes assouplies pour impression maximum",
            "semaine": f"{semaine_debut} - {semaine_fin}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur attribution démo: {str(e)}")

# Vérification des assignations existantes pour une période

# GET check-periode
@router.get("/{tenant_slug}/planning/assignations/check-periode")
async def check_assignations_periode(
    tenant_slug: str, 
    debut: str, 
    fin: str, 
    current_user: User = Depends(get_current_user)
):
    """Vérifie s'il existe des assignations pour la période donnée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        existing_count = await db.assignations.count_documents({
            "date": {
                "$gte": debut,
                "$lte": fin
            },
            "tenant_id": tenant.id
        })
        
        return {
            "existing_count": existing_count,
            "periode": f"{debut} au {fin}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur vérification période: {str(e)}")


# GET progress/{task_id}
@router.get("/{tenant_slug}/planning/attribution-auto/progress/{task_id}")
async def attribution_progress_stream(
    tenant_slug: str,
    task_id: str
):
    """Stream SSE pour suivre la progression de l'attribution automatique
    
    Note: Pas d'authentification JWT car EventSource ne peut pas envoyer de headers.
    La sécurité est assurée par le task_id unique et éphémère.
    """
    # Vérifier que le task_id existe (sécurité basique)
    if task_id not in attribution_progress_store and task_id != "test":
        # Attendre un peu que la tâche soit créée
        await asyncio.sleep(1)
        if task_id not in attribution_progress_store:
            raise HTTPException(status_code=404, detail="Task ID non trouvé")
    
    return StreamingResponse(
        progress_event_generator(task_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Nginx buffering disabled
        }
    )

# Attribution automatique intelligente avec rotation équitable et ancienneté

# POST attribution-auto
@router.post("/{tenant_slug}/planning/attribution-auto")
async def attribution_automatique(
    tenant_slug: str, 
    semaine_debut: str, 
    semaine_fin: str = None,
    reset: bool = False,  # Nouveau paramètre pour réinitialiser
    current_user: User = Depends(get_current_user)
):
    """Attribution automatique pour une ou plusieurs semaines avec progression temps réel
    
    Args:
        reset: Si True, supprime d'abord toutes les assignations AUTO de la période
        
    Returns:
        task_id: Identifiant pour suivre la progression via SSE
    """
    logging.info(f"🔥 [ENDPOINT] Attribution auto appelé par {current_user.email}")
    logging.info(f"🔥 [ENDPOINT] Paramètres reçus: tenant={tenant_slug}, debut={semaine_debut}, fin={semaine_fin}, reset={reset}")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Générer un task_id unique
    task_id = str(uuid.uuid4())
    
    # Lancer la tâche en arrière-plan
    asyncio.create_task(
        process_attribution_auto_async(
            task_id, tenant, semaine_debut, semaine_fin, reset
        )
    )
    
    # Retourner immédiatement le task_id
    return {
        "task_id": task_id,
        "message": "Attribution automatique lancée en arrière-plan",
        "stream_url": f"/api/{tenant_slug}/planning/attribution-auto/progress/{task_id}"
    }

async def process_attribution_auto_async(
    task_id: str,
    tenant,
    semaine_debut: str,
    semaine_fin: str = None,
    reset: bool = False
):
    """Traite l'attribution automatique de manière asynchrone avec suivi de progression"""
    progress = AttributionProgress(task_id)
    
    try:
        start_time = time.time()
        logging.info(f"⏱️ [PERF] Attribution auto démarrée - Task ID: {task_id}")
        logging.info(f"🔍 [DEBUG] reset={reset}, type={type(reset)}, tenant_id={tenant.id}")
        logging.info(f"🔍 [DEBUG] Période: {semaine_debut} → {semaine_fin}")
        
        # Si pas de semaine_fin fournie, calculer pour une seule semaine
        if not semaine_fin:
            semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        
        progress.update("Initialisation...", 5)
        
        # Si reset=True, supprimer d'abord toutes les assignations AUTO de la période
        assignations_supprimees = 0
        if reset:
            logging.info(f"🔍 [DEBUG] RESET MODE ACTIVÉ - Tentative de suppression...")
            
            # Vérifier combien d'assignations existent
            count_before = await db.assignations.count_documents({
                "tenant_id": tenant.id,
                "date": {"$gte": semaine_debut, "$lte": semaine_fin}
            })
            logging.info(f"🔍 [DEBUG] Assignations totales dans période: {count_before}")
            
            # Vérifier les types d'assignation existants
            distinct_types = await db.assignations.distinct("assignation_type", {
                "tenant_id": tenant.id,
                "date": {"$gte": semaine_debut, "$lte": semaine_fin}
            })
            logging.info(f"🔍 [DEBUG] Types d'assignation existants: {distinct_types}")
            
            progress.update("Suppression des assignations existantes...", 10)
            # CORRECTION: Supprimer TOUTES les assignations AUTO + celles sans type (anciennes)
            result = await db.assignations.delete_many({
                "tenant_id": tenant.id,
                "date": {
                    "$gte": semaine_debut,
                    "$lte": semaine_fin
                },
                "$or": [
                    {"assignation_type": {"$in": ["auto", "automatique"]}},
                    {"assignation_type": {"$exists": False}},  # Assignations sans type (anciennes)
                    {"assignation_type": None}  # Assignations avec type null
                ]
            })
            assignations_supprimees = result.deleted_count
            logging.info(f"⏱️ [PERF] ✅ {assignations_supprimees} assignations supprimées (incluant anciennes sans type)")
        else:
            logging.info(f"🔍 [DEBUG] RESET MODE DÉSACTIVÉ - Pas de suppression")
        
        # Pour une période complète (mois), traiter semaine par semaine
        start_date = datetime.strptime(semaine_debut, "%Y-%m-%d")
        end_date = datetime.strptime(semaine_fin, "%Y-%m-%d")
        
        # Calculer le nombre total de semaines
        total_weeks = ((end_date - start_date).days // 7) + 1
        progress.total_gardes = total_weeks
        
        total_assignations_creees = 0
        current_week_start = start_date
        week_number = 0
        
        # Itérer sur toutes les semaines de la période
        while current_week_start <= end_date:
            week_number += 1
            current_week_end = current_week_start + timedelta(days=6)
            if current_week_end > end_date:
                current_week_end = end_date
            
            week_start_str = current_week_start.strftime("%Y-%m-%d")
            week_end_str = current_week_end.strftime("%Y-%m-%d")
            
            # Mise à jour progression
            progress_percent = 15 + int((week_number / total_weeks) * 80)
            progress.update(
                f"Traitement semaine {week_number}/{total_weeks} ({week_start_str})",
                progress_percent,
                gardes_traitees=week_number
            )
            
            week_start_time = time.time()
            
            # Traiter cette semaine
            assignations_cette_semaine = await traiter_semaine_attribution_auto(
                tenant, 
                week_start_str, 
                week_end_str,
                progress=progress  # Passer l'objet progress pour mises à jour granulaires
            )
            
            week_elapsed = time.time() - week_start_time
            logging.info(f"⏱️ [PERF] Semaine {week_number} traitée en {week_elapsed:.2f}s - {assignations_cette_semaine} assignations")
            
            total_assignations_creees += assignations_cette_semaine
            progress.assignations_creees = total_assignations_creees
            
            # Passer à la semaine suivante
            current_week_start += timedelta(days=7)
        
        # Terminer
        total_elapsed = time.time() - start_time
        logging.info(f"⏱️ [PERF] Attribution auto terminée en {total_elapsed:.2f}s - Total: {total_assignations_creees} assignations")
        
        progress.complete(total_assignations_creees)
        
    except Exception as e:
        logging.error(f"❌ [ERROR] Attribution auto échouée: {str(e)}", exc_info=True)
        progress.error(str(e))

async def generer_justification_attribution(
    selected_user: Dict,
    all_candidates: List[Dict],
    type_garde: Dict,
    date_str: str,
    user_monthly_hours_internes: Dict,
    user_monthly_hours_externes: Dict,
    activer_heures_sup: bool,
    existing_assignations: List[Dict],
    disponibilites_evaluees: List[Dict] = None,
    dispos_lookup: Dict = None  # NOUVEAU: pour vérifier les disponibilités
) -> Dict[str, Any]:
    """
    Génère une justification détaillée pour une attribution automatique
    """
    # Utiliser le compteur approprié selon le type de garde
    user_monthly_hours = user_monthly_hours_externes if type_garde.get("est_garde_externe", False) else user_monthly_hours_internes
    
    # Calculer les scores pour l'utilisateur sélectionné
    heures_selectionnee = user_monthly_hours.get(selected_user["id"], 0)
    moyenne_equipe = sum(user_monthly_hours.values()) / len(user_monthly_hours) if user_monthly_hours else 0
    
    # Score d'équité (0-100) - Plus les heures sont basses, meilleur le score
    if moyenne_equipe > 0:
        ecart_ratio = (moyenne_equipe - heures_selectionnee) / moyenne_equipe
        score_equite = min(100, max(0, 50 + (ecart_ratio * 50)))
    else:
        score_equite = 50
    
    # Score d'ancienneté (0-100)
    try:
        date_embauche = selected_user.get("date_embauche", "1900-01-01")
        try:
            embauche_dt = datetime.strptime(date_embauche, "%Y-%m-%d")
        except:
            embauche_dt = datetime.strptime(date_embauche, "%d/%m/%Y")
        
        annees_service = (datetime.now() - embauche_dt).days / 365.25
        score_anciennete = min(100, annees_service * 5)  # 5 points par an, max 100
    except:
        annees_service = 0
        score_anciennete = 0
    
    # Score de disponibilité (0-100)
    if selected_user.get("type_emploi") in ("temps_partiel", "temporaire"):
        score_disponibilite = 100 if disponibilites_evaluees else 50
    else:
        score_disponibilite = 75  # Temps plein toujours disponible
    
    # Score de compétences (0-100) - basé sur le grade
    grade_scores = {
        "Directeur": 100,
        "Capitaine": 85,
        "Lieutenant": 70,
        "Pompier": 50
    }
    score_competences = grade_scores.get(selected_user.get("grade", "Pompier"), 50)
    
    # Score total
    score_total = score_equite + score_anciennete + score_disponibilite + score_competences
    
    # Détails de l'utilisateur sélectionné
    assigned_user_info = {
        "user_id": selected_user["id"],
        "nom_complet": f"{selected_user['prenom']} {selected_user['nom']}",
        "grade": selected_user.get("grade", "N/A"),
        "type_emploi": selected_user.get("type_emploi", "N/A"),
        "scores": {
            "equite": round(score_equite, 1),
            "anciennete": round(score_anciennete, 1),
            "disponibilite": round(score_disponibilite, 1),
            "competences": round(score_competences, 1),
            "total": round(score_total, 1)
        },
        "details": {
            "heures_ce_mois": heures_selectionnee,
            "moyenne_equipe": round(moyenne_equipe, 1),
            "annees_service": round(annees_service, 1),
            "disponibilite_declaree": selected_user.get("type_emploi") in ("temps_partiel", "temporaire") and bool(disponibilites_evaluees),
            "heures_max_autorisees": selected_user.get("heures_max_semaine", 40) if not activer_heures_sup else None
        }
    }
    
    # Évaluer les autres candidats
    other_candidates = []
    for candidate in all_candidates:
        if candidate["id"] == selected_user["id"]:
            continue  # Skip l'utilisateur sélectionné
        
        # Déterminer la raison d'exclusion
        raison_exclusion = None
        candidate_scores = None
        
        # Vérifier heures supplémentaires (seulement si désactivées)
        if not activer_heures_sup:
            # Calculer heures de la semaine pour ce candidat
            heures_semaine_candidate = 0
            for assignation in existing_assignations:
                if assignation["user_id"] == candidate["id"]:
                    heures_semaine_candidate += 8  # Simplification
            
            heures_max_user = candidate.get("heures_max_semaine", 40)
            
            if heures_semaine_candidate + type_garde.get("duree_heures", 8) > heures_max_user:
                raison_exclusion = f"Heures max atteintes ({heures_semaine_candidate}h/{heures_max_user}h)"
        
        # Vérifier disponibilité (temps partiel)
        if not raison_exclusion and candidate.get("type_emploi") in ("temps_partiel", "temporaire"):
            # Vérifier s'il a déclaré une disponibilité (même logique que l'attribution)
            has_dispo = False
            if dispos_lookup and candidate["id"] in dispos_lookup and date_str in dispos_lookup[candidate["id"]]:
                # Disponibilité spécifique pour ce type de garde
                if type_garde["id"] in dispos_lookup[candidate["id"]][date_str]:
                    has_dispo = True
                # OU disponibilité générale (type_garde_id = None)
                elif None in dispos_lookup[candidate["id"]][date_str]:
                    has_dispo = True
            
            if not has_dispo:
                raison_exclusion = "Disponibilité non déclarée"
        
        # Vérifier s'il est déjà assigné
        if not raison_exclusion:
            deja_assigne = any(
                a["user_id"] == candidate["id"] and 
                a["date"] == date_str and 
                a["type_garde_id"] == type_garde["id"]
                for a in existing_assignations
            )
            if deja_assigne:
                raison_exclusion = "Déjà assigné à cette garde"
        
        # Si pas exclu, calculer les scores
        if not raison_exclusion:
            heures_candidate = user_monthly_hours.get(candidate["id"], 0)
            
            # Scores similaires à l'utilisateur sélectionné
            if moyenne_equipe > 0:
                ecart_ratio = (moyenne_equipe - heures_candidate) / moyenne_equipe
                cand_score_equite = min(100, max(0, 50 + (ecart_ratio * 50)))
            else:
                cand_score_equite = 50
            
            try:
                date_emb = candidate.get("date_embauche", "1900-01-01")
                try:
                    emb_dt = datetime.strptime(date_emb, "%Y-%m-%d")
                except:
                    emb_dt = datetime.strptime(date_emb, "%d/%m/%Y")
                cand_annees = (datetime.now() - emb_dt).days / 365.25
                cand_score_anc = min(100, cand_annees * 5)
            except:
                cand_score_anc = 0
            
            cand_score_dispo = 100 if candidate.get("type_emploi") in ("temps_partiel", "temporaire") else 75
            cand_score_comp = grade_scores.get(candidate.get("grade", "Pompier"), 50)
            cand_total = cand_score_equite + cand_score_anc + cand_score_dispo + cand_score_comp
            
            candidate_scores = {
                "equite": round(cand_score_equite, 1),
                "anciennete": round(cand_score_anc, 1),
                "disponibilite": round(cand_score_dispo, 1),
                "competences": round(cand_score_comp, 1),
                "total": round(cand_total, 1)
            }
            
            raison_exclusion = f"Score inférieur (total: {round(cand_total, 1)} vs {round(score_total, 1)})"
        
        other_candidates.append({
            "user_id": candidate["id"],
            "nom_complet": f"{candidate['prenom']} {candidate['nom']}",
            "grade": candidate.get("grade", "N/A"),
            "excluded_reason": raison_exclusion,
            "scores": candidate_scores,
            "heures_ce_mois": user_monthly_hours.get(candidate["id"], 0)
        })
    
    # Trier les autres candidats par score décroissant (si scores disponibles)
    other_candidates.sort(key=lambda x: x["scores"]["total"] if x["scores"] else 0, reverse=True)
    
    return {
        "assigned_user": assigned_user_info,
        "other_candidates": other_candidates[:10],  # Limiter à 10 pour ne pas surcharger
        "total_candidates_evaluated": len(all_candidates),
        "date_attribution": datetime.now(timezone.utc).isoformat(),
        "type_garde_info": {
            "nom": type_garde.get("nom", "N/A"),
            "duree_heures": type_garde.get("duree_heures", 8),
            "personnel_requis": type_garde.get("personnel_requis", 1)
        }
    }


async def traiter_semaine_attribution_auto(tenant, semaine_debut: str, semaine_fin: str, progress: AttributionProgress = None):
    """Traite l'attribution automatique pour une seule semaine avec suivi de performance"""
    perf_start = time.time()
    
    try:
        # Get all available users and types de garde pour ce tenant
        users = await db.users.find({"statut": "Actif", "tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Récupérer les paramètres de remplacements (incluant gestion heures sup)
        parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
        if not parametres:
            # Créer des paramètres par défaut
            default_params = ParametresRemplacements(tenant_id=tenant.id)
            await db.parametres_remplacements.insert_one(default_params.dict())
            parametres = default_params.dict()
        
        activer_heures_sup = parametres.get("activer_gestion_heures_sup", False)
        
        # Récupérer les paramètres des équipes de garde
        params_equipes_garde = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
        equipes_garde_actif = params_equipes_garde.get("actif", False) if params_equipes_garde else False
        privilegier_equipe_garde_tp = False
        if equipes_garde_actif and params_equipes_garde:
            privilegier_equipe_garde_tp = params_equipes_garde.get("temps_partiel", {}).get("privilegier_equipe_garde", False)
        
        # CORRECTION CRITIQUE: Charger les paramètres des niveaux d'attribution
        niveaux_actifs = {
            "niveau_2": tenant.parametres.get("niveau_2_actif", True),
            "niveau_3": tenant.parametres.get("niveau_3_actif", True),
            "niveau_4": tenant.parametres.get("niveau_4_actif", True),
            "niveau_5": tenant.parametres.get("niveau_5_actif", True)
        }
        logging.info(f"📊 [NIVEAUX] Niveaux d'attribution actifs: {niveaux_actifs}")
        
        # Récupérer les grades pour vérifier les officiers
        grades = await db.grades.find({"tenant_id": tenant.id}).to_list(1000)
        grades_map = {g["nom"]: g for g in grades}
        
        # Récupérer les compétences pour la priorisation des gardes
        competences = await db.competences.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Get existing assignations for the week
        # NOTE: Ne PAS écraser semaine_fin car il est passé correctement depuis la boucle appelante
        # (Bug précédent: la ligne suivante écrasait semaine_fin et limitait à 7 jours)
        if not semaine_fin:
            semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        existing_assignations = await db.assignations.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        # Get monthly statistics for rotation équitable (current month)
        current_month_start = datetime.strptime(semaine_debut, "%Y-%m-%d").replace(day=1).strftime("%Y-%m-%d")
        current_month_end = (datetime.strptime(current_month_start, "%Y-%m-%d") + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        current_month_end = current_month_end.strftime("%Y-%m-%d")
        
        monthly_assignations = await db.assignations.find({
            "date": {
                "$gte": current_month_start,
                "$lte": current_month_end
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        # ⚡ OPTIMIZATION: Précharger TOUTES les disponibilités de la semaine en UNE SEULE requête
        # Cela évite le problème N+1 (une requête par user/garde)
        all_disponibilites = await db.disponibilites.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "statut": "disponible",
            "tenant_id": tenant.id
        }).to_list(10000)
        
        # Créer un index/dictionnaire pour lookup rapide
        # Structure: {user_id: {date: {type_garde_id: [list of dispos with horaires]}}}
        dispos_lookup = {}
        for dispo in all_disponibilites:
            user_id = dispo.get("user_id")
            date = dispo.get("date")
            type_garde_id = dispo.get("type_garde_id")
            
            if user_id not in dispos_lookup:
                dispos_lookup[user_id] = {}
            if date not in dispos_lookup[user_id]:
                dispos_lookup[user_id][date] = {}
            if type_garde_id not in dispos_lookup[user_id][date]:
                dispos_lookup[user_id][date][type_garde_id] = []
            
            # Stocker la dispo complète avec ses horaires
            dispos_lookup[user_id][date][type_garde_id].append({
                "heure_debut": dispo.get("heure_debut"),
                "heure_fin": dispo.get("heure_fin")
            })
        
        # ⚡ OPTIMIZATION: Précharger TOUTES les indisponibilités de la semaine
        all_indisponibilites = await db.disponibilites.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "statut": "indisponible",
            "tenant_id": tenant.id
        }).to_list(10000)
        
        # Créer un index pour les indisponibilités
        # Structure: {user_id: {date: True}}
        # PRIORITÉ: Les disponibilités manuelles ont priorité sur les indisponibilités auto-générées
        indispos_lookup = {}
        for indispo in all_indisponibilites:
            user_id = indispo.get("user_id")
            date = indispo.get("date")
            source = indispo.get("source", "manuel")  # Par défaut: manuel
            
            # Vérifier s'il existe une disponibilité manuelle pour ce user/date
            has_manual_dispo = any(
                d.get("user_id") == user_id and 
                d.get("date") == date and 
                d.get("source", "manuel") == "manuel"
                for d in all_disponibilites
            )
            
            # N'ajouter l'indisponibilité que si:
            # - C'est une indispo manuelle OU
            # - Il n'y a pas de dispo manuelle qui la contredit
            if source == "manuel" or not has_manual_dispo:
                if user_id not in indispos_lookup:
                    indispos_lookup[user_id] = {}
                indispos_lookup[user_id][date] = True
            else:
                logging.info(f"✅ [CONFLIT RÉSOLU] Indispo auto-générée ignorée pour {user_id} le {date} (dispo manuelle trouvée)")
        
        # Récupérer les paramètres d'équité
        params_planning = await db.parametres_validation_planning.find_one({"tenant_id": tenant.id})
        periode_equite = params_planning.get("periode_equite", "mensuel") if params_planning else "mensuel"
        periode_equite_jours = params_planning.get("periode_equite_jours", 30) if params_planning else 30
        
        # Calculer la date de début de la période d'équité
        start_date = datetime.strptime(semaine_debut, "%Y-%m-%d")
        end_date = datetime.strptime(semaine_fin, "%Y-%m-%d")
        date_debut_periode = start_date
        if periode_equite == "hebdomadaire":
            # Début de la semaine (lundi)
            jours_depuis_lundi = date_debut_periode.weekday()
            date_debut_periode = date_debut_periode - timedelta(days=jours_depuis_lundi)
        elif periode_equite == "bi-hebdomadaire":
            # Début de la bi-semaine (14 jours glissants)
            date_debut_periode = start_date - timedelta(days=14)
        elif periode_equite == "mensuel":
            # Début du mois
            date_debut_periode = date_debut_periode.replace(day=1)
        elif periode_equite == "personnalise":
            # Période personnalisée en jours
            date_debut_periode = start_date - timedelta(days=periode_equite_jours)
        
        logging.info(f"📊 [ÉQUITÉ] Période: {periode_equite}, Début: {date_debut_periode}, Jours: {periode_equite_jours if periode_equite == 'personnalise' else 'N/A'}")
        
        # Récupérer les assignations de la période d'équité
        assignations_periode = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut_periode.strftime("%Y-%m-%d"),
                "$lt": end_date.strftime("%Y-%m-%d")
            }
        }).to_list(length=None)
        
        logging.info(f"📊 [ÉQUITÉ] {len(assignations_periode)} assignations trouvées pour la période d'équité")
        
        # Calculate hours for each user based on equity period (séparé interne/externe)
        user_monthly_hours_internes = {}
        user_monthly_hours_externes = {}
        for user in users:
            user_hours_internes = 0
            user_hours_externes = 0
            for assignation in assignations_periode:
                if assignation["user_id"] == user["id"]:
                    # Find type garde to get duration
                    type_garde = next((t for t in types_garde if t["id"] == assignation["type_garde_id"]), None)
                    if type_garde:
                        duree = type_garde.get("duree_heures", 8)
                        # Séparer les heures selon le type de garde
                        if type_garde.get("est_garde_externe", False):
                            user_hours_externes += duree
                        else:
                            user_hours_internes += duree
            user_monthly_hours_internes[user["id"]] = user_hours_internes
            user_monthly_hours_externes[user["id"]] = user_hours_externes
        
        logging.info(f"📊 [ÉQUITÉ] Heures calculées pour {len(users)} utilisateurs sur la période")
        
        # Initialiser la liste des nouvelles assignations
        nouvelles_assignations = []
        
        # REGROUPEMENT DES HEURES - TEMPORAIREMENT DÉSACTIVÉ (cause des doublons)
        # TODO: Réimplémenter avec vérifications correctes de personnel_requis
        regroupements_traites = []
        if False:  # Désactivé car cause des assignations multiples incorrectes
            # Code de regroupement commenté pour investigation future
            pass
        
        # Attribution automatique logic (5 niveaux de priorité)
        # nouvelles_assignations déjà déclaré plus haut
        
        return nouvelles_assignations
    
    except Exception as e:
        logging.error(f"Erreur attribution automatique: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur attribution: {str(e)}")


# GET rapport-audit
@router.get("/{tenant_slug}/planning/rapport-audit")
async def generer_rapport_audit_assignations(
    tenant_slug: str,
    mois: str,  # Format: YYYY-MM
    format: str = "pdf",  # pdf ou excel
    current_user: User = Depends(get_current_user)
):
    """Génère un rapport d'audit complet des assignations automatiques pour un mois donné"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé - Admin uniquement")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Parser le mois
        annee, mois_num = map(int, mois.split('-'))
        date_debut = datetime(annee, mois_num, 1)
        
        # Calculer la date de fin du mois
        if mois_num == 12:
            date_fin = datetime(annee + 1, 1, 1) - timedelta(days=1)
        else:
            date_fin = datetime(annee, mois_num + 1, 1) - timedelta(days=1)
        
        date_debut_str = date_debut.strftime("%Y-%m-%d")
        date_fin_str = date_fin.strftime("%Y-%m-%d")
        
        # Récupérer toutes les assignations automatiques du mois
        assignations_auto = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut_str,
                "$lte": date_fin_str
            },
            "assignation_type": "auto",
            "justification": {"$exists": True, "$ne": None}
        }).to_list(1000)
        
        if not assignations_auto:
            raise HTTPException(status_code=404, detail="Aucune assignation automatique trouvée pour ce mois")
        
        # Récupérer les infos complémentaires (users, types garde)
        users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Mapper users et types garde
        user_map = {u["id"]: u for u in users}
        type_garde_map = {t["id"]: t for t in types_garde}
        
        # Générer le rapport selon le format
        if format == "pdf":
            return await generer_pdf_audit(assignations_auto, user_map, type_garde_map, tenant, mois)
        else:  # excel
            return await generer_excel_audit(assignations_auto, user_map, type_garde_map, tenant, mois)
            
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de mois invalide. Utilisez YYYY-MM")
    except Exception as e:
        logging.error(f"Erreur génération rapport audit: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur génération rapport: {str(e)}")

async def generer_pdf_audit(assignations, user_map, type_garde_map, tenant, mois):
    """Génère un PDF du rapport d'audit"""
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer, PageBreak
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    
    # Utiliser la fonction helper pour créer un PDF brandé
    buffer, doc, elements = create_branded_pdf(tenant, pagesize=A4)
    styles = getSampleStyleSheet()
    
    # Style titre
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    # Titre
    titre = Paragraph(f"<b>Rapport d'Audit des Affectations Automatiques</b><br/>{tenant.nom}<br/>Période: {mois}", title_style)
    elements.append(titre)
    elements.append(Spacer(1, 0.3*inch))
    
    # Statistiques globales
    stats = Paragraph(f"<b>Total d'assignations automatiques: {len(assignations)}</b>", styles['Normal'])
    elements.append(stats)
    elements.append(Spacer(1, 0.2*inch))
    
    # Tableau pour chaque assignation
    for idx, assignation in enumerate(assignations[:50], 1):  # Limiter à 50 pour PDF
        user = user_map.get(assignation["user_id"], {})
        type_garde = type_garde_map.get(assignation["type_garde_id"], {})
        justif = assignation.get("justification", {})
        
        # Info assignation
        info_title = Paragraph(f"<b>{idx}. {user.get('prenom', 'N/A')} {user.get('nom', 'N/A')} - {type_garde.get('nom', 'N/A')} - {assignation['date']}</b>", styles['Heading3'])
        elements.append(info_title)
        
        # Scores
        assigned_user = justif.get("assigned_user", {})
        scores = assigned_user.get("scores", {})
        details = assigned_user.get("details", {})
        
        data_scores = [
            ["Critère", "Score", "Détail"],
            ["Équité", f"{scores.get('equite', 0)}/100", f"{details.get('heures_ce_mois', 0)}h (moy: {details.get('moyenne_equipe', 0)}h)"],
            ["Ancienneté", f"{scores.get('anciennete', 0)}/100", f"{details.get('annees_service', 0)} ans"],
            ["Disponibilité", f"{scores.get('disponibilite', 0)}/100", "Déclarée" if details.get('disponibilite_declaree') else "Temps plein"],
            ["Compétences", f"{scores.get('competences', 0)}/100", user.get('grade', 'N/A')],
            ["TOTAL", f"{scores.get('total', 0)}/400", ""]
        ]
        
        table_scores = Table(data_scores, colWidths=[2*inch, 1.5*inch, 2.5*inch])
        table_scores.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e5e7eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.grey)
        ]))
        
        elements.append(table_scores)
        elements.append(Spacer(1, 0.1*inch))
        
        # Notes admin
        notes = assignation.get("notes_admin")
        if notes:
            notes_para = Paragraph(f"<b>Notes admin:</b> {notes}", styles['Normal'])
            elements.append(notes_para)
        
        # Autres candidats (top 3)
        other_candidates = justif.get("other_candidates", [])[:3]
        if other_candidates:
            autres_title = Paragraph("<b>Autres candidats évalués:</b>", styles['Normal'])
            elements.append(autres_title)
            
            for cand in other_candidates:
                cand_text = f"• {cand.get('nom_complet', 'N/A')} - {cand.get('excluded_reason', 'N/A')}"
                cand_para = Paragraph(cand_text, styles['Normal'])
                elements.append(cand_para)
        
        elements.append(Spacer(1, 0.3*inch))
        
        # Page break tous les 5 pour éviter surcharge
        if idx % 5 == 0 and idx < len(assignations):
            elements.append(PageBreak())
    
    doc.build(elements)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=audit_affectations_{mois}.pdf"
        }
    )

async def generer_excel_audit(assignations, user_map, type_garde_map, tenant, mois):
    """Génère un fichier Excel du rapport d'audit"""
    from io import BytesIO
    import openpyxl
    from openpyxl.styles import Font, Alignment, PatternFill
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Audit Affectations"
    
    # En-tête
    ws['A1'] = f"Rapport d'Audit - {tenant.nom}"
    ws['A1'].font = Font(size=14, bold=True)
    ws['A2'] = f"Période: {mois}"
    ws['A3'] = f"Total d'assignations: {len(assignations)}"
    
    # Colonnes
    headers = ["Date", "Garde", "Pompier", "Grade", "Heures mois", "Score Équité", 
               "Score Ancienneté", "Score Dispo", "Score Compét", "Score Total", 
               "Candidats évalués", "Notes Admin"]
    
    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=5, column=col_num)
        cell.value = header
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")
        cell.alignment = Alignment(horizontal='center')
    
    # Données
    row_num = 6
    for assignation in assignations:
        user = user_map.get(assignation["user_id"], {})
        type_garde = type_garde_map.get(assignation["type_garde_id"], {})
        justif = assignation.get("justification", {})
        assigned_user = justif.get("assigned_user", {})
        scores = assigned_user.get("scores", {})
        details = assigned_user.get("details", {})
        
        ws.cell(row=row_num, column=1).value = assignation["date"]
        ws.cell(row=row_num, column=2).value = type_garde.get("nom", "N/A")
        ws.cell(row=row_num, column=3).value = f"{user.get('prenom', '')} {user.get('nom', '')}"
        ws.cell(row=row_num, column=4).value = user.get("grade", "N/A")
        ws.cell(row=row_num, column=5).value = details.get("heures_ce_mois", 0)
        ws.cell(row=row_num, column=6).value = scores.get("equite", 0)
        ws.cell(row=row_num, column=7).value = scores.get("anciennete", 0)
        ws.cell(row=row_num, column=8).value = scores.get("disponibilite", 0)
        ws.cell(row=row_num, column=9).value = scores.get("competences", 0)
        ws.cell(row=row_num, column=10).value = scores.get("total", 0)
        ws.cell(row=row_num, column=11).value = justif.get("total_candidates_evaluated", 0)
        ws.cell(row=row_num, column=12).value = assignation.get("notes_admin", "")
        
        row_num += 1
    
    # Ajuster les largeurs avec des valeurs fixes pour éviter les erreurs MergedCell
    column_widths = {
        'A': 12, 'B': 12, 'C': 15, 'D': 15, 'E': 12, 'F': 12,
        'G': 12, 'H': 12, 'I': 12, 'J': 10, 'K': 10, 'L': 25
    }
    for col_letter, width in column_widths.items():
        ws.column_dimensions[col_letter].width = width
    
    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=audit_affectations_{mois}.xlsx"
        }
    )

# Endpoint pour obtenir les statistiques personnelles mensuelles
@router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")

# POST reinitialiser
@router.post("/planning/reinitialiser")
async def reinitialiser_planning(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer toutes les assignations
        result = await db.assignations.delete_many({})
        
        return {
            "message": "Planning réinitialisé avec succès",
            "assignations_supprimees": result.deleted_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur réinitialisation: {str(e)}")


# GET parametres/validation-planning
@router.get("/{tenant_slug}/parametres/validation-planning")
async def get_parametres_validation(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """
    Récupérer les paramètres de validation du planning pour le tenant
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer les paramètres de validation ou retourner valeurs par défaut
        validation_params = tenant.parametres.get('validation_planning', {
            'frequence': 'mensuel',
            'jour_envoi': 25,  # 25 du mois
            'heure_envoi': '17:00',
            'periode_couverte': 'mois_suivant',
            'envoi_automatique': True,
            'derniere_notification': None
        })
        
        return validation_params
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération paramètres: {str(e)}")


# PUT parametres/validation-planning
@router.put("/{tenant_slug}/parametres/validation-planning")
async def update_parametres_validation(tenant_slug: str, parametres: dict, current_user: User = Depends(get_current_user)):
    """
    Mettre à jour les paramètres de validation du planning
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        tenant_doc = await db.tenants.find_one({"id": tenant.id})
        
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        # Mettre à jour les paramètres
        current_parametres = tenant_doc.get('parametres', {})
        current_parametres['validation_planning'] = parametres
        
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": {"parametres": current_parametres}}
        )
        
        return {"message": "Paramètres mis à jour avec succès", "parametres": parametres}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour paramètres: {str(e)}")


# POST envoyer-notifications
@router.post("/{tenant_slug}/planning/envoyer-notifications")
async def envoyer_notifications_planning(tenant_slug: str, periode_debut: str, periode_fin: str, current_user: User = Depends(get_current_user)):
    """
    Envoyer les notifications par email à tous les pompiers avec leurs gardes assignées
    
    Args:
        tenant_slug: slug de la caserne
        periode_debut: Date début (YYYY-MM-DD)
        periode_fin: Date fin (YYYY-MM-DD)
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer toutes les assignations de la période
        assignations_list = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {"$gte": periode_debut, "$lte": periode_fin}
        }).to_list(length=None)
        
        # Récupérer tous les users et types de garde
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        
        # Créer des maps pour accès rapide
        users_map = {u['id']: u for u in users_list}
        types_garde_map = {t['id']: t for t in types_garde_list}
        
        # Grouper les assignations par user
        gardes_par_user = {}
        for assignation in assignations_list:
            user_id = assignation['user_id']
            if user_id not in gardes_par_user:
                gardes_par_user[user_id] = []
            
            type_garde = types_garde_map.get(assignation['type_garde_id'], {})
            
            # Trouver les collègues pour cette garde
            collegues = [
                f"{users_map[a['user_id']]['prenom']} {users_map[a['user_id']]['nom']}"
                for a in assignations_list
                if a['date'] == assignation['date'] and 
                   a['type_garde_id'] == assignation['type_garde_id'] and 
                   a['user_id'] != user_id and 
                   a['user_id'] in users_map
            ]
            
            # Formater la date
            from datetime import datetime as dt
            date_obj = dt.strptime(assignation['date'], '%Y-%m-%d')
            jour_fr = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][date_obj.weekday()]
            
            gardes_par_user[user_id].append({
                'date': date_obj.strftime('%d %B %Y'),
                'jour': jour_fr,
                'type_garde': type_garde.get('nom', 'Garde'),
                'horaire': f"{type_garde.get('heure_debut', '08:00')} - {type_garde.get('heure_fin', '08:00')}",
                'collegues': collegues
            })
        
        # Envoyer les emails
        emails_envoyes = 0
        emails_echoues = 0
        
        periode_str = f"{dt.strptime(periode_debut, '%Y-%m-%d').strftime('%B %Y')}"
        
        for user_id, gardes in gardes_par_user.items():
            user = users_map.get(user_id)
            if not user or not user.get('email'):
                continue
            
            user_name = f"{user['prenom']} {user['nom']}"
            email_sent = send_gardes_notification_email(
                user['email'],
                user_name,
                gardes,
                tenant_slug,
                periode_str
            )
            
            if email_sent:
                emails_envoyes += 1
            else:
                emails_echoues += 1
        
        # Mettre à jour la date de dernière notification
        tenant_doc = await db.tenants.find_one({"id": tenant.id})
        current_parametres = tenant_doc.get('parametres', {})
        if 'validation_planning' not in current_parametres:
            current_parametres['validation_planning'] = {}
        current_parametres['validation_planning']['derniere_notification'] = datetime.now(timezone.utc).isoformat()
        
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": {"parametres": current_parametres}}
        )
        
        return {
            "message": "Notifications envoyées",
            "emails_envoyes": emails_envoyes,
            "emails_echoues": emails_echoues,
            "total_pompiers": len(gardes_par_user)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur envoi notifications: {str(e)}")

