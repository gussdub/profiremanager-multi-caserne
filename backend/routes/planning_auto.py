"""
Routes Auto-Attribution du module Planning
===========================================
Extraits de planning.py pour maintenabilité.

Routes:
- POST /{tenant_slug}/planning/attribution-auto-demo
- GET  /{tenant_slug}/planning/assignations/check-periode
- GET  /{tenant_slug}/planning/attribution-auto/progress/{task_id}
- POST /{tenant_slug}/planning/attribution-auto
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from io import BytesIO
import uuid
import logging
import json
import asyncio
import time

from routes.equipes_garde import get_equipe_garde_du_jour_sync, get_equipe_garde_rotation_standard, get_equipe_from_horaire_personnalise

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_activite,
    creer_notification,
    require_permission,
    user_has_module_action
)

from routes.websocket import broadcast_planning_update
from routes.notifications import send_push_notification_to_users
from routes.remplacements.models import ParametresRemplacements

router = APIRouter(tags=["Planning Auto-Attribution"])
logger = logging.getLogger(__name__)

# Import du modèle Assignation depuis le module principal
from routes.planning import Assignation


# ==================== ATTRIBUTION PROGRESS ====================

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


async def progress_event_generator(task_id: str):
    """Générateur SSE pour streamer les mises à jour de progression"""
    try:
        # Attendre que la tâche soit créée
        for _ in range(50):  # Attendre max 5 secondes
            if task_id in attribution_progress_store:
                break
            await asyncio.sleep(0.1)
        
        # Streamer les mises à jour
        last_data = None
        while True:
            if task_id in attribution_progress_store:
                current_data = attribution_progress_store[task_id]
                
                # Envoyer seulement si les données ont changé
                if current_data != last_data:
                    yield f"data: {json.dumps(current_data)}\n\n"
                    last_data = current_data.copy()
                
                # Si terminé ou en erreur, arrêter le stream
                if current_data.get("status") in ["termine", "erreur"]:
                    break
            
            await asyncio.sleep(0.5)  # Mise à jour toutes les 500ms
            
    except asyncio.CancelledError:
        pass



# ==================== ROUTES ====================

@router.post("/{tenant_slug}/planning/attribution-auto-demo")
async def attribution_automatique_demo(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
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



@router.post("/{tenant_slug}/planning/attribution-auto")
async def attribution_automatique(
    tenant_slug: str, 
    semaine_debut: str, 
    semaine_fin: str = None,
    reset: bool = False,  # Paramètre pour réinitialiser
    mode_brouillon: bool = True,  # NOUVEAU: Par défaut en mode brouillon
    current_user: User = Depends(get_current_user)
):
    """Attribution automatique pour une ou plusieurs semaines avec progression temps réel
    
    Args:
        reset: Si True, supprime d'abord toutes les assignations AUTO de la période
        mode_brouillon: Si True, crée les assignations en mode brouillon (non visibles aux employés)
        
    Returns:
        task_id: Identifiant pour suivre la progression via SSE
    """
    logging.info(f"🔥 [ENDPOINT] Attribution auto appelé par {current_user.email}")
    logging.info(f"🔥 [ENDPOINT] Paramètres reçus: tenant={tenant_slug}, debut={semaine_debut}, fin={semaine_fin}, reset={reset}, mode_brouillon={mode_brouillon}")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
    # Générer un task_id unique
    task_id = str(uuid.uuid4())
    
    # Lancer la tâche en arrière-plan
    asyncio.create_task(
        process_attribution_auto_async(
            task_id, tenant, semaine_debut, semaine_fin, reset, mode_brouillon
        )
    )
    
    # Retourner immédiatement le task_id
    return {
        "task_id": task_id,
        "message": "Attribution automatique lancée en arrière-plan",
        "mode_brouillon": mode_brouillon,
        "stream_url": f"/api/{tenant_slug}/planning/attribution-auto/progress/{task_id}"
    }

async def process_attribution_auto_async(
    task_id: str,
    tenant,
    semaine_debut: str,
    semaine_fin: str = None,
    reset: bool = False,
    mode_brouillon: bool = True
):
    """Traite l'attribution automatique de manière asynchrone avec suivi de progression"""
    progress = AttributionProgress(task_id)
    
    try:
        start_time = time.time()
        logging.info(f"⏱️ [PERF] Attribution auto démarrée - Task ID: {task_id}")
        logging.info(f"🔍 [DEBUG] reset={reset}, mode_brouillon={mode_brouillon}, tenant_id={tenant.id}")
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
                    {"assignation_type": {"$in": ["auto", "automatique", "rotation_temps_plein"]}},
                    {"assignation_type": {"$exists": False}},  # Assignations sans type (anciennes)
                    {"assignation_type": None}  # Assignations avec type null
                ]
            })
            assignations_supprimees = result.deleted_count
            logging.info(f"⏱️ [PERF] ✅ {assignations_supprimees} assignations supprimées (incluant anciennes sans type)")
        else:
            logging.info(f"🔍 [DEBUG] RESET MODE DÉSACTIVÉ - Pas de suppression")
        
        # Pour une période complète (mois), traiter par blocs de 7 jours
        start_date = datetime.strptime(semaine_debut, "%Y-%m-%d")
        end_date = datetime.strptime(semaine_fin, "%Y-%m-%d")
        
        # Calculer le nombre total de jours et de "semaines" (blocs de 7 jours)
        total_days = (end_date - start_date).days + 1
        total_weeks = (total_days + 6) // 7  # Arrondi vers le haut
        progress.total_gardes = total_weeks
        
        logging.info(f"📅 [DEBUG] Période calendaire: {semaine_debut} → {semaine_fin} ({total_days} jours, {total_weeks} blocs)")
        
        total_assignations_creees = 0
        current_week_start = start_date
        week_number = 0
        
        # Itérer sur toutes les semaines (blocs de 7 jours) de la période
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
            
            # Compter le nombre d'assignations créées (la fonction retourne une liste)
            nb_assignations_semaine = len(assignations_cette_semaine) if isinstance(assignations_cette_semaine, list) else assignations_cette_semaine
            
            week_elapsed = time.time() - week_start_time
            logging.info(f"⏱️ [PERF] Semaine {week_number} traitée en {week_elapsed:.2f}s - {nb_assignations_semaine} assignations")
            
            total_assignations_creees += nb_assignations_semaine
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
        
        # Créer un dictionnaire pour lookup rapide des utilisateurs par ID
        users_dict = {u["id"]: u for u in users}
        
        # ==================== MULTI-CASERNES ====================
        # Charger la config multi-casernes du tenant
        tenant_doc = await db.tenants.find_one({"id": tenant.id}, {"_id": 0, "multi_casernes_actif": 1})
        multi_casernes_actif = tenant_doc.get("multi_casernes_actif", False) if tenant_doc else False
        
        casernes_list = []
        casernes_map = {}
        if multi_casernes_actif:
            casernes_list = await db.casernes.find({"tenant_id": tenant.id, "actif": True}, {"_id": 0}).to_list(100)
            casernes_map = {c["id"]: c for c in casernes_list}
            logging.info(f"🏢 [MULTI-CASERNES] Actif. {len(casernes_list)} caserne(s): {[c['nom'] for c in casernes_list]}")
        else:
            logging.info(f"🏢 [MULTI-CASERNES] Desactive - mode standard")
        
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
        config_temps_partiel = {}
        if equipes_garde_actif and params_equipes_garde:
            config_temps_partiel = params_equipes_garde.get("temps_partiel", {})
            privilegier_equipe_garde_tp = config_temps_partiel.get("privilegier_equipe_garde", False)
        
        logging.info(f"📊 [EQUIPE GARDE] Actif: {equipes_garde_actif}, Prioriser équipe de garde: {privilegier_equipe_garde_tp}")
        
        # === CHARGEMENT ROTATION TEMPS PLEIN (N1.1) ===
        rotation_tp_active = False
        rotation_tp_date_activation = None
        horaire_tp_template = None
        config_temps_plein = {}
        rotation_tp_users_by_equipe = {}  # {equipe_num: [user_ids]}
        
        if equipes_garde_actif and params_equipes_garde:
            config_temps_plein = params_equipes_garde.get("temps_plein", {})
            if config_temps_plein.get("rotation_active", False):
                rotation_tp_date_activation = config_temps_plein.get("date_activation")
                if rotation_tp_date_activation:
                    rotation_tp_active = True
                    type_rotation_tp = config_temps_plein.get("type_rotation", "aucun")
                    
                    # Charger le template horaire si c'est un UUID (pas un preset standard)
                    if type_rotation_tp not in ["aucun", "montreal", "quebec", "longueuil", "personnalisee"]:
                        horaire_tp_template = await db.horaires_personnalises.find_one({
                            "tenant_id": tenant.id,
                            "id": type_rotation_tp
                        })
                        if horaire_tp_template:
                            logging.info(f"🔄 [ROTATION TP] Template chargé: {horaire_tp_template.get('nom')}")
                    
                    # Pré-indexer les utilisateurs temps plein par équipe de garde
                    for user in users:
                        if user.get("type_emploi") == "temps_plein" and user.get("equipe_garde"):
                            eq_num = user.get("equipe_garde")
                            if eq_num not in rotation_tp_users_by_equipe:
                                rotation_tp_users_by_equipe[eq_num] = []
                            rotation_tp_users_by_equipe[eq_num].append(user["id"])
        
        logging.info(f"🔄 [ROTATION TP] Active: {rotation_tp_active}, Date activation: {rotation_tp_date_activation}, Équipes: {list(rotation_tp_users_by_equipe.keys())}, Membres: {sum(len(v) for v in rotation_tp_users_by_equipe.values())}")
        
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
        # Note: Accepter plusieurs formats de statut (disponible, Disponible, dispo, etc.)
        all_disponibilites = await db.disponibilites.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "statut": {"$regex": "^dispo", "$options": "i"},  # Accepte "disponible", "Disponible", "dispo"
            "tenant_id": tenant.id
        }).to_list(10000)
        
        logging.info(f"📅 [DISPOS] {len(all_disponibilites)} disponibilités trouvées pour la période {semaine_debut} - {semaine_fin}")
        
        # Créer un index/dictionnaire pour lookup rapide
        # Structure: {user_id: {date: {type_garde_id: [list of dispos with horaires]}}}
        # Note: type_garde_id peut être None pour les disponibilités générales (toutes gardes)
        dispos_lookup = {}
        for dispo in all_disponibilites:
            user_id = dispo.get("user_id")
            date = dispo.get("date")
            type_garde_id = dispo.get("type_garde_id")  # Peut être None = disponible pour toutes les gardes
            
            if user_id not in dispos_lookup:
                dispos_lookup[user_id] = {}
            if date not in dispos_lookup[user_id]:
                dispos_lookup[user_id][date] = {"_general": []}  # _general pour les dispos sans type spécifique
            
            # Stocker sous le type_garde_id spécifique OU sous _general si None
            key = type_garde_id if type_garde_id else "_general"
            if key not in dispos_lookup[user_id][date]:
                dispos_lookup[user_id][date][key] = []
            
            # Stocker la dispo complète avec ses horaires
            # IMPORTANT: S'assurer que les heures ont des valeurs par défaut si None
            heure_debut = dispo.get("heure_debut") or "00:00"
            heure_fin = dispo.get("heure_fin") or "23:59"
            dispos_lookup[user_id][date][key].append({
                "heure_debut": heure_debut,
                "heure_fin": heure_fin
            })
        
        logging.info(f"📅 [DISPOS] Lookup créé pour {len(dispos_lookup)} utilisateurs")
        
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
        # Nouveau: Stocker aussi les détails horaires des indisponibilités
        # Structure: {user_id: {date: [{heure_debut, heure_fin}, ...]}}
        indispos_details_lookup = {}
        
        for indispo in all_indisponibilites:
            user_id = indispo.get("user_id")
            date = indispo.get("date")
            source = indispo.get("source", "manuel")  # Par défaut: manuel
            heure_debut = indispo.get("heure_debut", "00:00")
            heure_fin = indispo.get("heure_fin", "23:59")
            
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
                
                # Stocker les détails horaires
                if user_id not in indispos_details_lookup:
                    indispos_details_lookup[user_id] = {}
                if date not in indispos_details_lookup[user_id]:
                    indispos_details_lookup[user_id][date] = []
                indispos_details_lookup[user_id][date].append({
                    "heure_debut": heure_debut,
                    "heure_fin": heure_fin
                })
            else:
                logging.info(f"✅ [CONFLIT RÉSOLU] Indispo auto-générée ignorée pour {user_id} le {date} (dispo manuelle trouvée)")
        
        # Récupérer les paramètres d'équité
        params_planning = await db.parametres_validation_planning.find_one({"tenant_id": tenant.id})
        periode_equite = params_planning.get("periode_equite", "mensuel") if params_planning else "mensuel"
        periode_equite_jours = params_planning.get("periode_equite_jours", 30) if params_planning else 30
        
        # Calculer la date de début et de fin de la période d'équité
        # La période d'équité détermine sur quelle durée les heures sont comptabilisées
        # pour assurer une répartition équitable des gardes
        start_date = datetime.strptime(semaine_debut, "%Y-%m-%d")
        end_date = datetime.strptime(semaine_fin, "%Y-%m-%d")
        date_debut_periode = start_date
        date_fin_periode = end_date  # Par défaut, même fin que la période demandée
        
        if periode_equite == "hebdomadaire":
            # Équité sur la semaine : du lundi au dimanche de la semaine de start_date
            jours_depuis_lundi = date_debut_periode.weekday()
            date_debut_periode = date_debut_periode - timedelta(days=jours_depuis_lundi)
            date_fin_periode = date_debut_periode + timedelta(days=7)  # Dimanche inclus
        elif periode_equite == "bi-hebdomadaire":
            # Équité sur 14 jours : du start_date jusqu'à start_date + 14 jours
            date_debut_periode = start_date
            date_fin_periode = start_date + timedelta(days=14)
            # Ne pas dépasser la fin demandée
            if date_fin_periode > end_date:
                date_fin_periode = end_date
        elif periode_equite == "mensuel":
            # Équité sur le mois calendaire : du 1er au dernier jour du mois
            date_debut_periode = start_date.replace(day=1)
            # Fin du mois
            if start_date.month == 12:
                date_fin_periode = start_date.replace(year=start_date.year + 1, month=1, day=1)
            else:
                date_fin_periode = start_date.replace(month=start_date.month + 1, day=1)
        elif periode_equite == "personnalise":
            # Équité personnalisée : du start_date jusqu'à start_date + X jours
            date_debut_periode = start_date
            date_fin_periode = start_date + timedelta(days=periode_equite_jours)
            # Ne pas dépasser la fin demandée
            if date_fin_periode > end_date:
                date_fin_periode = end_date
        
        logging.info(f"📊 [ÉQUITÉ] Période: {periode_equite}, Début: {date_debut_periode.strftime('%Y-%m-%d')}, Fin: {date_fin_periode.strftime('%Y-%m-%d')}")
        
        # Récupérer les assignations de la période d'équité
        assignations_periode = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut_periode.strftime("%Y-%m-%d"),
                "$lt": date_fin_periode.strftime("%Y-%m-%d")
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
        
        # ==================== RÉCUPÉRATION DES PARAMÈTRES ====================
        # Lire les paramètres de remplacement pour heures_supplementaires_activees
        params_remplacements = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
        heures_sup_from_params = False
        if params_remplacements:
            heures_sup_from_params = params_remplacements.get("heures_supplementaires_activees", False)
        
        # Charger les niveaux depuis les paramètres du TENANT
        tenant_params = tenant.parametres or {}
        logging.info(f"📊 [NIVEAUX] Paramètres tenant: {tenant_params}")
        niveaux_actifs = {
            "niveau_2": tenant_params.get("niveau_2_actif", True),  # Temps partiel DISPONIBLES
            "niveau_3": tenant_params.get("niveau_3_actif", True),  # Temps partiel STAND-BY
            "niveau_4": tenant_params.get("niveau_4_actif", True),  # Temps plein INCOMPLETS
            "niveau_5": tenant_params.get("niveau_5_actif", True)   # Temps plein COMPLETS (heures sup)
        }
        # Activer heures sup si:
        # - Le paramètre dans la requête est True OU
        # - Le paramètre dans parametres_remplacements est True
        autoriser_heures_sup = activer_heures_sup or heures_sup_from_params or tenant_params.get("autoriser_heures_supplementaires", False)
        
        # Si heures sup non autorisées, désactiver niveau 5
        if not autoriser_heures_sup:
            niveaux_actifs["niveau_5"] = False
        
        logging.info(f"📋 Niveaux actifs: {niveaux_actifs}, Heures sup: {autoriser_heures_sup} (from_params={heures_sup_from_params}, activer_heures_sup={activer_heures_sup})")
        
        # Paramètres de paie pour seuil hebdomadaire temps plein
        params_paie = await db.parametres_paie.find_one({"tenant_id": tenant.id})
        seuil_hebdo_temps_plein = 40  # Défaut
        if params_paie:
            seuil_hebdo_temps_plein = params_paie.get("seuil_hebdomadaire", 40)
        
        logging.info(f"📋 Seuil hebdo temps plein: {seuil_hebdo_temps_plein}h")
        
        # ==================== RÉCUPÉRATION DES GRADES ====================
        grades_list = await db.grades.find({"tenant_id": tenant.id}).to_list(100)
        grades_map = {g.get("nom"): g for g in grades_list}
        
        def est_officier(user):
            """Vérifie si l'utilisateur est un officier basé sur son grade"""
            grade_nom = user.get("grade", "")
            grade_info = grades_map.get(grade_nom, {})
            return grade_info.get("est_officier", False) == True
        
        def est_eligible_fonction_superieure(user):
            """Vérifie si l'utilisateur peut opérer en fonction supérieure (grade +1)"""
            return user.get("fonction_superieur", False) == True
        
        def get_niveau_grade(user):
            """Retourne le niveau hiérarchique du grade de l'utilisateur"""
            grade_nom = user.get("grade", "")
            grade_info = grades_map.get(grade_nom, {})
            return grade_info.get("niveau_hierarchique", 0) or 0
        
        def user_a_competences_requises(user, competences_requises):
            """Vérifie si l'utilisateur possède toutes les compétences requises"""
            if not competences_requises:
                return True  # Pas de compétences requises
            user_competences = set(user.get("competences", []) or [])
            return all(comp_id in user_competences for comp_id in competences_requises)
        
        # ==================== PRÉPARATION DES DONNÉES UTILISATEURS ====================
        # Créer un dictionnaire pour accès rapide aux infos utilisateurs
        users_map = {u["id"]: u for u in users}
        
        # Calculer les heures hebdomadaires pour chaque utilisateur
        # (pour déterminer si temps plein incomplet ou complet)
        def get_heures_semaine(user_id, date_str, type_garde_externe=False):
            """Calcule les heures dans la semaine contenant date_str pour un type de garde (interne ou externe)"""
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            # Trouver le lundi de cette semaine
            lundi = date_obj - timedelta(days=date_obj.weekday())
            dimanche = lundi + timedelta(days=6)
            
            heures = 0
            for a in existing_assignations:
                if a.get("user_id") != user_id:
                    continue
                try:
                    a_date = datetime.strptime(a.get("date", ""), "%Y-%m-%d")
                    if lundi <= a_date <= dimanche:
                        tg = next((t for t in types_garde if t["id"] == a.get("type_garde_id")), None)
                        if tg:
                            is_externe = tg.get("est_garde_externe", False)
                            if type_garde_externe == is_externe:  # Compter séparément
                                heures += tg.get("duree_heures", 8)
                except:
                    pass
            return heures
        
        def get_heures_travaillees_semaine(user_id, date_str):
            """
            Calcule les heures TRAVAILLÉES dans la semaine contenant date_str.
            IMPORTANT: Seules les gardes INTERNES comptent comme heures travaillées.
            Les gardes EXTERNES ne comptent PAS vers le max d'heures.
            """
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            # Trouver le lundi de cette semaine
            lundi = date_obj - timedelta(days=date_obj.weekday())
            dimanche = lundi + timedelta(days=6)
            
            heures = 0
            for a in existing_assignations:
                if a.get("user_id") != user_id:
                    continue
                try:
                    a_date = datetime.strptime(a.get("date", ""), "%Y-%m-%d")
                    if lundi <= a_date <= dimanche:
                        tg = next((t for t in types_garde if t["id"] == a.get("type_garde_id")), None)
                        if tg:
                            # IMPORTANT: Seules les gardes INTERNES comptent
                            is_externe = tg.get("est_garde_externe", False)
                            if not is_externe:
                                heures += tg.get("duree_heures", 8)
                except:
                    pass
            return heures
        
        def get_heures_max_semaine(user):
            """Retourne le max d'heures par semaine pour cet utilisateur"""
            # Utiliser la valeur définie dans la fiche employé si disponible
            user_max = user.get("heures_max_semaine")
            if user_max is not None and user_max > 0:
                return user_max
            
            # Sinon, utiliser la valeur par défaut selon le type d'emploi
            type_emploi = user.get("type_emploi", "temps_plein")
            if type_emploi in ["temps_partiel", "temporaire"]:
                return 20  # Défaut temps partiel
            else:
                return seuil_hebdo_temps_plein  # Défaut temps plein
        
        def plages_se_chevauchent(debut1, fin1, debut2, fin2):
            """
            Vérifie si deux plages horaires se chevauchent.
            Les heures sont au format 'HH:MM'.
            Gère les gardes qui passent minuit (ex: 18:00-06:00).
            Retourne True si les plages se chevauchent.
            """
            # Convertir en minutes pour faciliter la comparaison
            def to_minutes(time_str):
                if not time_str:
                    return 0
                parts = time_str.split(':')
                return int(parts[0]) * 60 + int(parts[1])
            
            start1 = to_minutes(debut1)
            end1 = to_minutes(fin1)
            start2 = to_minutes(debut2)
            end2 = to_minutes(fin2)
            
            # Gérer le cas où fin = 23:59 (toute la journée)
            if end1 == 23 * 60 + 59:
                end1 = 24 * 60
            if end2 == 23 * 60 + 59:
                end2 = 24 * 60
            
            # Gérer les gardes qui passent minuit (fin < debut)
            # Ex: 18:00-06:00 -> on considère que ça se termine à 06:00 le LENDEMAIN
            # Pour la comparaison sur une même journée, une garde de nuit (18:00-06:00)
            # ne chevauche PAS une garde de jour (06:00-18:00)
            
            # Si la plage 1 passe minuit (ex: 18:00-06:00)
            if end1 < start1:
                # Elle couvre [start1, 24:00] et [00:00, end1]
                # Pour simplifier sur une journée: [start1, 24:00]
                end1 = 24 * 60
            
            # Si la plage 2 passe minuit (ex: 18:00-06:00)
            if end2 < start2:
                # Elle couvre [start2, 24:00] et [00:00, end2]
                # Pour simplifier sur une journée: [start2, 24:00]
                end2 = 24 * 60
            
            # Les plages se chevauchent si: start1 < end2 AND start2 < end1
            return start1 < end2 and start2 < end1
        
        def est_disponible_pour_garde(user_id, date_str, garde_heure_debut, garde_heure_fin, type_garde_id):
            """
            Vérifie si l'utilisateur a une disponibilité qui couvre la plage horaire de la garde.
            Retourne True si l'utilisateur est disponible pour cette garde.
            
            LOGIQUE MÉTIER:
            - Si la dispo a le MÊME type_garde_id et les MÊMES heures → match parfait
            - Pour une garde de jour: la dispo doit couvrir toute la plage
            - Pour une garde de nuit: il suffit que la dispo couvre le DÉBUT de la garde
            """
            def to_minutes(time_str):
                if not time_str:
                    return 0
                parts = time_str.split(':')
                return int(parts[0]) * 60 + int(parts[1])
            
            # Récupérer toutes les dispos (spécifiques + générales) pour cette date
            user_dispos = dispos_lookup.get(user_id, {}).get(date_str, {})
            specific_dispos = user_dispos.get(type_garde_id, [])
            general_dispos = user_dispos.get("_general", [])
            all_dispos = specific_dispos + general_dispos
            
            garde_start = to_minutes(garde_heure_debut)
            garde_end = to_minutes(garde_heure_fin)
            
            # Gérer 23:59 comme fin de journée
            if garde_end == 23 * 60 + 59:
                garde_end = 24 * 60
            
            # Déterminer si c'est une garde de nuit (traverse minuit)
            est_garde_nuit = garde_end < garde_start
            
            for dispo in all_dispos:
                dispo_debut = dispo.get("heure_debut") or "00:00"
                dispo_fin = dispo.get("heure_fin") or "23:59"
                
                dispo_start = to_minutes(dispo_debut)
                dispo_end = to_minutes(dispo_fin)
                
                # Gérer 23:59 comme fin de journée (= minuit)
                if dispo_end == 23 * 60 + 59:
                    dispo_end = 24 * 60
                
                # CAS 1: Match parfait des horaires (ex: dispo 18:00-06:00 pour garde 18:00-06:00)
                # Peu importe si ça traverse minuit, si les heures sont identiques c'est OK
                if dispo_debut == garde_heure_debut and dispo_fin == garde_heure_fin:
                    return True
                
                # CAS 2: La dispo elle-même traverse minuit (ex: 18:00-06:00)
                dispo_traverse_minuit = dispo_end < dispo_start
                if dispo_traverse_minuit:
                    # La dispo couvre de dispo_start jusqu'à minuit, puis de minuit jusqu'à dispo_end
                    # Pour une garde de nuit qui commence à garde_start, vérifier si dispo_start <= garde_start
                    if dispo_start <= garde_start:
                        return True
                    continue
                
                # CAS 3: Logique normale
                if est_garde_nuit:
                    # GARDE DE NUIT: Il suffit que la dispo couvre le DÉBUT de la garde
                    # Ex: Garde 18:00->06:00, dispo 00:00->23:59 = OK car couvre 18:00
                    if dispo_start <= garde_start and dispo_end > garde_start:
                        return True
                else:
                    # GARDE DE JOUR: La dispo doit couvrir toute la plage horaire
                    if dispo_start <= garde_start and dispo_end >= garde_end:
                        return True
            
            return False
        
        def a_indisponibilite_bloquante(user_id, date_str, garde_heure_debut, garde_heure_fin):
            """
            Vérifie si l'utilisateur a une indisponibilité qui chevauche la plage horaire de la garde.
            Retourne True si l'utilisateur est BLOQUÉ par une indisponibilité.
            """
            user_indispos = indispos_details_lookup.get(user_id, {}).get(date_str, [])
            
            for indispo in user_indispos:
                indispo_debut = indispo.get("heure_debut", "00:00")
                indispo_fin = indispo.get("heure_fin", "23:59")
                
                # Si l'indisponibilité chevauche la garde, l'utilisateur est bloqué
                if plages_se_chevauchent(garde_heure_debut, garde_heure_fin, indispo_debut, indispo_fin):
                    return True
            
            return False
        
        def trier_candidats_equite_anciennete(candidats, type_garde_externe=False, prioriser_officiers=False, user_monthly_hours=None, equipe_garde_du_jour=None, prioriser_equipe_garde=False):
            """
            Trie les candidats selon:
            0. Si prioriser_equipe_garde: Membres de l'équipe de garde du jour d'abord (NON ABSOLU - juste priorité)
            1. Si prioriser_officiers: Officiers d'abord, puis éligibles, puis autres
            2. Équité (moins d'heures d'abord)
            3. Ancienneté (plus ancien d'abord)
            """
            if user_monthly_hours is None:
                user_monthly_hours = user_monthly_hours_internes
                
            def sort_key(user):
                user_id = user["id"]
                
                # Priorité équipe de garde (0=membre équipe garde, 1=autre)
                # C'est une priorité NON ABSOLUE - elle influence le tri mais ne bloque pas les autres
                if prioriser_equipe_garde and equipe_garde_du_jour and type_garde_externe:
                    # La priorité équipe de garde s'applique uniquement aux gardes EXTERNES
                    equipe_utilisateur = user.get("equipe_garde")
                    if equipe_utilisateur == equipe_garde_du_jour:
                        equipe_priority = 0  # Membre de l'équipe de garde
                    else:
                        equipe_priority = 1  # Pas membre
                else:
                    equipe_priority = 0  # Pas de tri par équipe de garde
                
                # Priorité officier (0=officier, 1=éligible, 2=autre)
                if prioriser_officiers:
                    if est_officier(user):
                        officier_priority = 0
                    elif est_eligible_fonction_superieure(user):
                        officier_priority = 1
                    else:
                        officier_priority = 2
                else:
                    officier_priority = 0  # Pas de tri par officier
                
                # Heures selon le type de garde (interne ou externe)
                if type_garde_externe:
                    heures = user_monthly_hours_externes.get(user_id, 0)
                else:
                    heures = user_monthly_hours.get(user_id, 0)
                
                # Ancienneté (date_embauche)
                date_embauche = user.get("date_embauche", "2099-12-31")
                
                return (equipe_priority, officier_priority, heures, date_embauche)
            
            return sorted(candidats, key=sort_key)
        
        # ==================== HELPER: ROTATION TEMPS PLEIN (N1.1) ====================
        def get_rotation_tp_membres_pour_garde(date_str, heure_debut_garde, heure_fin_garde):
            """
            Retourne la liste des user_ids temps plein de rotation qui doivent
            travailler cette garde ce jour-là, basé sur le template de rotation.
            """
            if not rotation_tp_active:
                return []
            
            type_rotation_tp = config_temps_plein.get("type_rotation", "aucun")
            
            # Rotations standards (montreal, quebec, longueuil): une équipe par jour, couvre tout le jour
            if type_rotation_tp in ["montreal", "quebec", "longueuil"]:
                equipe_num = get_equipe_garde_rotation_standard(type_rotation_tp, "", date_str)
                return list(rotation_tp_users_by_equipe.get(equipe_num, []))
            
            # Rotation personnalisée simple (non basée sur template)
            elif type_rotation_tp == "personnalisee":
                date_reference = config_temps_plein.get("date_reference")
                if not date_reference:
                    return []
                equipe_num = get_equipe_garde_du_jour_sync(
                    type_rotation=type_rotation_tp,
                    date_reference=date_reference,
                    date_cible=date_str,
                    nombre_equipes=config_temps_plein.get("nombre_equipes", 4),
                    pattern_mode=config_temps_plein.get("pattern_mode", "hebdomadaire"),
                    pattern_personnalise=config_temps_plein.get("pattern_personnalise", []),
                    duree_cycle=config_temps_plein.get("duree_cycle", 28),
                    jour_rotation=config_temps_plein.get("jour_rotation") or "monday",
                    heure_rotation=config_temps_plein.get("heure_rotation") or "08:00",
                    heure_actuelle="12:00"
                )
                return list(rotation_tp_users_by_equipe.get(equipe_num, []))
            
            # Template personnalisé (UUID) avec segments potentiels
            elif horaire_tp_template:
                date_ref_str = horaire_tp_template.get("date_reference")
                if not date_ref_str:
                    return []
                
                date_ref = datetime.strptime(date_ref_str, "%Y-%m-%d").date()
                date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                duree_cycle = horaire_tp_template.get("duree_cycle", 28)
                
                # Calculer le jour dans le cycle (1-based)
                jours_depuis_ref = (date_obj - date_ref).days
                if jours_depuis_ref < 0:
                    jour_cycle = duree_cycle - ((-jours_depuis_ref - 1) % duree_cycle)
                else:
                    jour_cycle = (jours_depuis_ref % duree_cycle) + 1
                
                # Heures de chaque segment depuis le template
                heures_quart = horaire_tp_template.get("heures_quart", {})
                segment_heures = {
                    "24h": (heures_quart.get("h24_debut", "07:00"), heures_quart.get("h24_fin", "07:00")),
                    "jour": (heures_quart.get("jour_debut", "07:00"), heures_quart.get("jour_fin", "19:00")),
                    "nuit": (heures_quart.get("nuit_debut", "19:00"), heures_quart.get("nuit_fin", "07:00")),
                    "am": (heures_quart.get("am_debut", "06:00"), heures_quart.get("am_fin", "12:00")),
                    "pm": (heures_quart.get("pm_debut", "12:00"), heures_quart.get("pm_fin", "18:00")),
                }
                
                # Pour chaque équipe, vérifier si elle a un segment ce jour qui chevauche la garde
                membres = []
                equipes_deja_ajoutees = set()
                for equipe in horaire_tp_template.get("equipes", []):
                    eq_num = equipe.get("numero")
                    if eq_num in equipes_deja_ajoutees:
                        continue
                    
                    for jt in equipe.get("jours_travail", []):
                        if isinstance(jt, int):
                            # Format simple: jour entier → chevauche toute garde
                            if jt == jour_cycle:
                                membres.extend(rotation_tp_users_by_equipe.get(eq_num, []))
                                equipes_deja_ajoutees.add(eq_num)
                                break
                        elif isinstance(jt, dict):
                            if jt.get("jour") == jour_cycle:
                                seg = jt.get("segment", "24h")
                                seg_debut, seg_fin = segment_heures.get(seg, ("00:00", "23:59"))
                                if plages_se_chevauchent(seg_debut, seg_fin, heure_debut_garde, heure_fin_garde):
                                    membres.extend(rotation_tp_users_by_equipe.get(eq_num, []))
                                    equipes_deja_ajoutees.add(eq_num)
                                    break  # Cette équipe est déjà incluse
                
                return list(set(membres))  # Dédupliquer
            
            return []
        
        # ==================== INITIALISATION ====================
        nouvelles_assignations = []
        
        # ==================== ATTRIBUTION AUTOMATIQUE À 5 NIVEAUX ====================
        current_date = datetime.strptime(semaine_debut, "%Y-%m-%d")
        end_date = datetime.strptime(semaine_fin, "%Y-%m-%d")
        
        while current_date <= end_date:
            date_str = current_date.strftime("%Y-%m-%d")
            day_name = current_date.strftime("%A").lower()
            
            if progress:
                progress.current_step = f"📅 Traitement du {date_str}..."
            
            # Calculer l'équipe de garde du jour si le système est actif
            equipe_garde_du_jour = None
            if privilegier_equipe_garde_tp and config_temps_partiel.get("rotation_active"):
                # Calculer quelle équipe est de garde ce jour
                equipe_garde_du_jour = get_equipe_garde_du_jour_sync(
                    type_rotation=config_temps_partiel.get("type_rotation", "hebdomadaire"),
                    date_reference=config_temps_partiel.get("date_reference", date_str),
                    date_cible=date_str,
                    nombre_equipes=config_temps_partiel.get("nombre_equipes", 2),
                    pattern_mode=config_temps_partiel.get("pattern_mode", "hebdomadaire"),
                    pattern_personnalise=config_temps_partiel.get("pattern_personnalise", []),
                    duree_cycle=config_temps_partiel.get("duree_cycle", 14),
                    jour_rotation=config_temps_partiel.get("jour_rotation") or "monday",
                    heure_rotation=config_temps_partiel.get("heure_rotation") or "18:00",
                    heure_actuelle="12:00"  # Milieu de journée pour la comparaison
                )
                logging.info(f"📊 [EQUIPE GARDE] {date_str}: Équipe {equipe_garde_du_jour} de garde")
            
            # N0: Priorisation des types de garde (par priorité intrinsèque)
            types_garde_tries = sorted(types_garde, key=lambda t: t.get("priorite", 99))
            
            # ==================== MULTI-CASERNES: EXPANSION ====================
            # Pour les types de garde "par_caserne", créer une entrée virtuelle par caserne
            # Cela permet de traiter chaque caserne séparément sans modifier la logique existante
            if multi_casernes_actif and casernes_list:
                types_garde_expanded = []
                for tg in types_garde_tries:
                    if tg.get("mode_caserne") == "par_caserne":
                        for caserne in casernes_list:
                            tg_copy = dict(tg)
                            tg_copy["_caserne_filter"] = caserne["id"]
                            tg_copy["_caserne_nom"] = caserne.get("nom", "")
                            types_garde_expanded.append(tg_copy)
                    else:
                        types_garde_expanded.append(tg)
                types_garde_tries = types_garde_expanded
            
            for type_garde in types_garde_tries:
                type_garde_id = type_garde["id"]
                type_garde_nom = type_garde.get("nom", "Garde")
                personnel_requis = type_garde.get("personnel_requis", 1)
                est_externe = type_garde.get("est_garde_externe", False)
                duree_garde = type_garde.get("duree_heures", 8)
                competences_requises = type_garde.get("competences_requises", [])
                officier_obligatoire = type_garde.get("officier_obligatoire", False)
                # IMPORTANT: Extraire les heures de début et fin de la garde
                heure_debut = type_garde.get("heure_debut", "00:00")
                heure_fin = type_garde.get("heure_fin", "23:59")
                
                # Multi-casernes: caserne cible pour cette itération
                caserne_filter_id = type_garde.get("_caserne_filter")
                caserne_filter_nom = type_garde.get("_caserne_nom", "")
                if caserne_filter_id:
                    logging.info(f"🏢 [CASERNE] {type_garde_nom} → Caserne: {caserne_filter_nom}")
                
                # Vérifier si ce type de garde s'applique ce jour
                jours_app = type_garde.get("jours_application", [])
                if jours_app and len(jours_app) > 0 and day_name not in jours_app:
                    continue
                
                # N1: Compter les assignations MANUELLES existantes (ne jamais écraser)
                existing_this_garde = [
                    a for a in existing_assignations
                    if a.get("date") == date_str and a.get("type_garde_id") == type_garde_id
                    and (not caserne_filter_id or a.get("caserne_id") == caserne_filter_id)
                ]
                existing_count = len(existing_this_garde)
                
                places_restantes = personnel_requis - existing_count
                
                if places_restantes <= 0:
                    continue  # Garde complète
                
                # Vérifier si un officier est déjà assigné à cette garde
                officier_deja_assigne = False
                if officier_obligatoire:
                    for a in existing_this_garde:
                        assigned_user = users_map.get(a.get("user_id"))
                        if assigned_user and est_officier(assigned_user):
                            officier_deja_assigne = True
                            break
                
                # Utilisateurs déjà assignés à des gardes qui CHEVAUCHENT cette garde
                # Une personne peut faire garde de jour + garde de nuit le même jour si elles ne se chevauchent pas
                def garde_chevauche(assignation_existante):
                    """Vérifie si une assignation existante chevauche la garde actuelle"""
                    tg_existant = next((t for t in types_garde if t["id"] == assignation_existante.get("type_garde_id")), None)
                    if not tg_existant:
                        return False
                    
                    existing_debut = tg_existant.get("heure_debut", "00:00")
                    existing_fin = tg_existant.get("heure_fin", "23:59")
                    
                    # Debug pour le 12 février
                    if date_str == "2026-02-12" and "jour" in type_garde_nom.lower():
                        chevauche = plages_se_chevauchent(heure_debut, heure_fin, existing_debut, existing_fin)
                        logging.info(f"🔎 Comparaison: {type_garde_nom}({heure_debut}-{heure_fin}) vs {tg_existant.get('nom')}({existing_debut}-{existing_fin}) = {chevauche}")
                        return chevauche
                    
                    return plages_se_chevauchent(heure_debut, heure_fin, existing_debut, existing_fin)
                
                # Séparer les utilisateurs déjà assignés à cette même garde vs une autre garde
                users_assignes_cette_garde = set(
                    a.get("user_id") for a in existing_assignations
                    if a.get("date") == date_str and a.get("type_garde_id") == type_garde_id
                )
                
                users_assignes_autre_garde = set(
                    a.get("user_id") for a in existing_assignations
                    if a.get("date") == date_str and a.get("type_garde_id") != type_garde_id and garde_chevauche(a)
                )
                
                users_assignes_ce_jour = users_assignes_cette_garde | users_assignes_autre_garde
                
                # Debug log pour le 12 février garde de jour
                if date_str == "2026-02-12" and "jour" in type_garde_nom.lower():
                    logging.info(f"🔍 DEBUG {date_str} {type_garde_nom}: users_assignes_ce_jour = {len(users_assignes_ce_jour)}")
                    for uid in users_assignes_ce_jour:
                        u = users_map.get(uid)
                        if u:
                            logging.info(f"   - {u.get('prenom')} {u.get('nom')} bloqué")
                
                # ==================== N1.1: ROTATION TEMPS PLEIN ====================
                # Insérer automatiquement les membres de l'équipe de garde temps plein
                # AVANT l'attribution automatique N2-N5. Si un membre est absent,
                # le trou sera comblé par N2-N5.
                rotation_tp_assignes = 0
                if rotation_tp_active and not est_externe and date_str >= rotation_tp_date_activation:
                    rotation_membres = get_rotation_tp_membres_pour_garde(date_str, heure_debut, heure_fin)
                    
                    for rm_user_id in rotation_membres:
                        if rotation_tp_assignes >= places_restantes:
                            break
                        
                        # Déjà assigné manuellement (N1) à cette garde ?
                        if rm_user_id in users_assignes_cette_garde:
                            logging.info(f"🔄 [N1.1] {users_map.get(rm_user_id, {}).get('prenom', '')} déjà assigné manuellement à {type_garde_nom}")
                            continue
                        
                        # Déjà assigné à une garde chevauchante ?
                        if rm_user_id in users_assignes_ce_jour:
                            continue
                        
                        # Indisponible (absent, vacances) ? → laisser un trou pour N2
                        if a_indisponibilite_bloquante(rm_user_id, date_str, heure_debut, heure_fin):
                            user_info = users_map.get(rm_user_id, {})
                            logging.info(f"🔄 [N1.1] {user_info.get('prenom', '')} {user_info.get('nom', '')} absent le {date_str} → trou pour N2")
                            continue
                        
                        rm_user = users_map.get(rm_user_id)
                        if not rm_user:
                            continue
                        
                        # Créer l'assignation de rotation temps plein
                        assignation = {
                            "id": str(uuid.uuid4()),
                            "tenant_id": tenant.id,
                            "user_id": rm_user_id,
                            "type_garde_id": type_garde_id,
                            "date": date_str,
                            "statut": "assigne",
                            "auto_attribue": True,
                            "assignation_type": "rotation_temps_plein",
                            "publication_status": "brouillon",
                            "caserne_id": caserne_filter_id,
                            "niveau_attribution": 1,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "justification": {
                                "assigned_user": {
                                    "nom_complet": f"{rm_user.get('prenom', '')} {rm_user.get('nom', '')}",
                                    "grade": rm_user.get("grade", ""),
                                    "type_emploi": "temps_plein",
                                    "details": {
                                        "equipe_garde": rm_user.get("equipe_garde"),
                                        "rotation_template": horaire_tp_template.get("nom", "") if horaire_tp_template else config_temps_plein.get("type_rotation", "")
                                    }
                                },
                                "type_garde_info": {
                                    "nom": type_garde_nom,
                                    "heure_debut": heure_debut,
                                    "heure_fin": heure_fin,
                                    "duree_heures": duree_garde,
                                    "est_externe": est_externe
                                },
                                "niveau": 1.1,
                                "niveau_description": "Rotation automatique temps plein",
                                "raison": f"Rotation temps plein - Équipe {rm_user.get('equipe_garde')} de garde"
                            }
                        }
                        
                        await db.assignations.insert_one(assignation)
                        nouvelles_assignations.append(assignation)
                        existing_assignations.append(assignation)
                        users_assignes_ce_jour.add(rm_user_id)
                        users_assignes_cette_garde.add(rm_user_id)
                        
                        # Mise à jour des heures mensuelles
                        user_monthly_hours_internes[rm_user_id] = user_monthly_hours_internes.get(rm_user_id, 0) + duree_garde
                        
                        rotation_tp_assignes += 1
                        logging.info(f"🔄 [N1.1 ROTATION] {rm_user.get('prenom', '')} {rm_user.get('nom', '')} → {type_garde_nom} le {date_str}")
                    
                    if rotation_tp_assignes > 0:
                        places_restantes -= rotation_tp_assignes
                        logging.info(f"🔄 [N1.1] {rotation_tp_assignes} assignation(s) rotation TP pour {type_garde_nom} le {date_str}. Reste: {places_restantes}")
                        if places_restantes <= 0:
                            continue  # Garde complète après rotation → type_garde suivant
                
                # Récupérer les disponibilités pour ce jour/type_garde
                # IMPORTANT: Inclure aussi les disponibilités générales (type_garde_id = None)
                def get_user_dispos(user_id):
                    user_dispos = dispos_lookup.get(user_id, {}).get(date_str, {})
                    # Disponibilités spécifiques à ce type de garde
                    specific_dispos = user_dispos.get(type_garde_id, [])
                    # Disponibilités générales (toute la journée, sans type_garde spécifique)
                    general_dispos = user_dispos.get(None, [])
                    return specific_dispos + general_dispos
                
                # Récupérer les indisponibilités pour ce jour
                def has_indisponibilite(user_id):
                    user_indispos = indispos_lookup.get(user_id, {})
                    return date_str in user_indispos
                
                # ==================== N0: FILTRE COMPÉTENCES ====================
                # Pré-filtrer les utilisateurs qui ont les compétences requises
                users_avec_competences = [
                    u for u in users 
                    if user_a_competences_requises(u, competences_requises)
                ]
                
                # ==================== N0-caserne: FILTRE PAR CASERNE ====================
                # Si mode par_caserne, ne garder que les utilisateurs rattachés à cette caserne
                if caserne_filter_id:
                    nb_avant_caserne = len(users_avec_competences)
                    users_avec_competences = [
                        u for u in users_avec_competences
                        if caserne_filter_id in (u.get("caserne_ids") or [])
                    ]
                    logging.info(f"  🏢 Filtre caserne '{caserne_filter_nom}': {len(users_avec_competences)}/{nb_avant_caserne} candidats")
                
                # Log si peu de candidats avec les compétences requises
                if competences_requises and len(users_avec_competences) < len(users) // 2:
                    logging.info(f"  ⚠️ {type_garde_nom}: seulement {len(users_avec_competences)}/{len(users)} ont les compétences requises")
                
                # ==================== N0-bis: FILTRE GARDES EXTERNES ====================
                # Si c'est une garde externe, ne garder que les utilisateurs qui acceptent les gardes externes
                # LOGIQUE OPT-OUT: Par défaut tous acceptent, sauf ceux qui ont explicitement refusé (False)
                if est_externe:
                    nb_avant = len(users_avec_competences)
                    users_avec_competences = [
                        u for u in users_avec_competences
                        if u.get("accepter_gardes_externes") != False  # Exclure SEULEMENT ceux qui ont explicitement refusé
                    ]
                    logging.info(f"  🏠 Garde externe: {len(users_avec_competences)}/{nb_avant} candidats acceptant les gardes externes")
                
                # ==================== LOGIQUE OFFICIER OBLIGATOIRE ====================
                # Si officier obligatoire et pas encore d'officier assigné
                besoin_officier = officier_obligatoire and not officier_deja_assigne
                officier_assigne_cette_iteration = False
                
                # ==================== NIVEAUX 2-5 ====================
                assignes_cette_garde = 0
                
                for niveau in [2, 3, 4, 5]:
                    if assignes_cette_garde >= places_restantes:
                        break
                    
                    if not niveaux_actifs.get(f"niveau_{niveau}", True):
                        continue  # Niveau désactivé
                    
                    candidats = []
                    candidats_rejetes = []  # Pour l'audit: stocker les candidats non sélectionnés avec leurs raisons
                    
                    for user in users_avec_competences:  # Utiliser la liste filtrée par compétences
                        user_id = user["id"]
                        user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
                        
                        # Debug pour Alva le 12 février garde de jour
                        is_debug = date_str == "2026-02-12" and "jour" in type_garde_nom.lower() and "Alva" in user_name
                        
                        # Ignorer si déjà assigné ce jour à une garde qui chevauche
                        if user_id in users_assignes_ce_jour:
                            if is_debug:
                                logging.info(f"🔴 DEBUG Alva bloqué: déjà assigné à garde chevauchante")
                            
                            # Si déjà assigné à CETTE MÊME garde, ne pas l'ajouter aux rejetés
                            # car il a été sélectionné pour un slot précédent
                            if user_id in users_assignes_cette_garde:
                                # Ne rien faire - il est déjà sur cette garde
                                pass
                            else:
                                # Trouver le nom de l'autre garde
                                autre_garde = next(
                                    (a for a in existing_assignations 
                                     if a.get("user_id") == user_id and a.get("date") == date_str and a.get("type_garde_id") != type_garde_id),
                                    None
                                )
                                if autre_garde:
                                    autre_tg = next((t for t in types_garde if t["id"] == autre_garde.get("type_garde_id")), None)
                                    autre_nom = autre_tg.get("nom", "Autre garde") if autre_tg else "Autre garde"
                                    raison = f"Déjà assigné à '{autre_nom}' ce jour (conflit d'horaire)"
                                else:
                                    raison = "Déjà assigné à une autre garde ce jour"
                                
                                candidats_rejetes.append({
                                    "nom_complet": user_name,
                                    "grade": user.get("grade", ""),
                                    "type_emploi": user.get("type_emploi", ""),
                                    "raison_rejet": raison
                                })
                            continue
                        
                        # Ignorer si statut inactif
                        if user.get("statut") != "Actif":
                            if is_debug:
                                logging.info(f"🔴 DEBUG Alva bloqué: statut inactif")
                            candidats_rejetes.append({
                                "nom_complet": user_name,
                                "grade": user.get("grade", ""),
                                "type_emploi": user.get("type_emploi", ""),
                                "raison_rejet": "Statut inactif"
                            })
                            continue
                        
                        type_emploi = user.get("type_emploi", "temps_plein")
                        
                        # Heures travaillées = UNIQUEMENT les gardes INTERNES
                        # Les gardes externes ne comptent PAS vers le max d'heures
                        heures_travaillees = get_heures_travaillees_semaine(user_id, date_str)
                        heures_max = get_heures_max_semaine(user)
                        
                        # Pour une garde INTERNE : vérifier si on dépasse le max
                        # Pour une garde EXTERNE : pas de vérification du max (ne compte pas comme travaillé)
                        if est_externe:
                            # Garde externe - ne compte pas vers le max, toujours OK niveau heures
                            depasserait_max = False
                        else:
                            # Garde interne - vérifier le max
                            depasserait_max = (heures_travaillees + duree_garde) > heures_max
                        
                        # Vérification des plages horaires
                        # 1. Vérifie si l'utilisateur a une DISPONIBILITÉ qui COUVRE la garde
                        has_dispo_valide = est_disponible_pour_garde(user_id, date_str, heure_debut, heure_fin, type_garde_id)
                        # 2. Vérifie si l'utilisateur a une INDISPONIBILITÉ qui CHEVAUCHE la garde
                        has_indispo_bloquante = a_indisponibilite_bloquante(user_id, date_str, heure_debut, heure_fin)
                        
                        if is_debug:
                            logging.info(f"🔵 DEBUG Alva: niveau={niveau}, type_emploi={type_emploi}, heures={heures_travaillees}/{heures_max}, depasserait={depasserait_max}, dispo={has_dispo_valide}, indispo={has_indispo_bloquante}")
                        
                        # RÈGLE PRIORITAIRE: Si indisponibilité chevauche la garde, l'utilisateur est BLOQUÉ
                        if has_indispo_bloquante:
                            if is_debug:
                                logging.info(f"🔴 DEBUG Alva bloqué: indisponibilité")
                            candidats_rejetes.append({
                                "nom_complet": user_name,
                                "grade": user.get("grade", ""),
                                "type_emploi": type_emploi,
                                "heures_ce_mois": user_monthly_hours_internes.get(user_id, 0),
                                "raison_rejet": "Indisponibilité sur cette plage horaire"
                            })
                            continue
                        
                        # Variables pour tracking des raisons de rejet par niveau
                        accepte = False
                        raison_rejet = ""
                        
                        # Construire une explication détaillée
                        explication_niveaux = []
                        
                        # DEBUG pour gardes externes de nuit uniquement
                        # N2: Temps partiel DISPONIBLES
                        if niveau == 2:
                            if type_emploi in ["temps_partiel", "temporaire"] and has_dispo_valide:
                                # Vérifier qu'il n'a pas atteint son max (sauf garde externe)
                                if not depasserait_max:
                                    candidats.append(user)
                                    accepte = True
                                else:
                                    raison_rejet = f"A une dispo mais dépasserait {heures_max}h max ({heures_travaillees}h + {duree_garde}h)"
                            elif type_emploi not in ["temps_partiel", "temporaire"]:
                                raison_rejet = f"Temps plein (N2 = temps partiel)"
                            else:
                                raison_rejet = f"Pas de disponibilité (N2 requiert dispo)"
                        
                        # N3: Temps partiel STAND-BY (ni dispo explicite ni indispo bloquante)
                        elif niveau == 3:
                            if type_emploi in ["temps_partiel", "temporaire"] and not has_dispo_valide:
                                # Pas de dispo explicite mais pas d'indispo bloquante non plus
                                if not depasserait_max:
                                    candidats.append(user)
                                    accepte = True
                                else:
                                    raison_rejet = f"Dépasserait {heures_max}h max ({heures_travaillees}h + {duree_garde}h)"
                            elif type_emploi not in ["temps_partiel", "temporaire"]:
                                raison_rejet = f"Temps plein (N3 = temps partiel)"
                            else:
                                # A une dispo - expliquer pourquoi pas éligible N2 aussi
                                if depasserait_max:
                                    raison_rejet = f"A une dispo mais dépasserait {heures_max}h max → éligible N5 si heures sup autorisées"
                                else:
                                    raison_rejet = f"A une dispo → devrait être au N2 (vérifier les assignations)"
                        
                        # N4: Temps plein INCOMPLETS (heures < max de l'employé)
                        elif niveau == 4:
                            if type_emploi == "temps_plein":
                                # Pas encore au max d'heures de l'employé
                                if not depasserait_max:
                                    candidats.append(user)
                                    accepte = True
                                else:
                                    raison_rejet = f"Dépasserait {heures_max}h max ({heures_travaillees}h + {duree_garde}h) → éligible N5"
                            else:
                                raison_rejet = f"Temps partiel (N4 = temps plein)"
                        
                        # N5: HEURES SUPPLÉMENTAIRES (tous types d'emploi si autorisé)
                        elif niveau == 5:
                            # L'employé DÉPASSERAIT son max avec cette garde = heures supplémentaires
                            if depasserait_max:
                                if type_emploi in ["temps_partiel", "temporaire"]:
                                    # Temps partiel : DOIT avoir une dispo pour faire des heures sup
                                    if has_dispo_valide:
                                        candidats.append(user)
                                        accepte = True
                                    else:
                                        raison_rejet = f"Temps partiel en heures sup MAIS sans disponibilité"
                                else:
                                    # Temps plein : PAS besoin de dispo pour heures sup
                                    candidats.append(user)
                                    accepte = True
                            else:
                                raison_rejet = f"Pas en heures sup ({heures_travaillees}h < {heures_max}h max)"
                        
                        # Si pas accepté, ajouter aux rejetés
                        if not accepte and raison_rejet:
                            candidats_rejetes.append({
                                "nom_complet": user_name,
                                "grade": user.get("grade", ""),
                                "type_emploi": type_emploi,
                                "heures_ce_mois": user_monthly_hours_internes.get(user_id, 0),
                                "heures_semaine": heures_travaillees,
                                "heures_max": heures_max,
                                "raison_rejet": raison_rejet
                            })
                    
                    # Trier par équité puis ancienneté, avec priorité officier si nécessaire
                    # et priorité équipe de garde pour les gardes EXTERNES
                    candidats_tries = trier_candidats_equite_anciennete(
                        candidats, 
                        est_externe, 
                        prioriser_officiers=(besoin_officier and not officier_assigne_cette_iteration),
                        user_monthly_hours=user_monthly_hours_internes,
                        equipe_garde_du_jour=equipe_garde_du_jour,
                        prioriser_equipe_garde=privilegier_equipe_garde_tp
                    )
                    
                    # Assigner les candidats
                    for user in candidats_tries:
                        if assignes_cette_garde >= places_restantes:
                            break
                        
                        user_id = user["id"]
                        user_type_emploi = user.get("type_emploi", "temps_plein")
                        user_heures_travaillees = get_heures_travaillees_semaine(user_id, date_str)
                        user_heures_max = get_heures_max_semaine(user)
                        user_has_dispo = est_disponible_pour_garde(user_id, date_str, heure_debut, heure_fin, type_garde_id)
                        
                        # Si on a besoin d'un officier et qu'on vient d'en assigner un
                        if besoin_officier and not officier_assigne_cette_iteration:
                            if est_officier(user) or est_eligible_fonction_superieure(user):
                                officier_assigne_cette_iteration = True
                        
                        # Construire la liste des autres candidats (ceux qui n'ont pas été sélectionnés)
                        other_candidates_list = []
                        for other in candidats_tries:
                            if other["id"] != user_id:
                                other_heures = user_monthly_hours_internes.get(other["id"], 0)
                                other_candidates_list.append({
                                    "nom_complet": f"{other.get('prenom', '')} {other.get('nom', '')}",
                                    "grade": other.get("grade", ""),
                                    "type_emploi": other.get("type_emploi", ""),
                                    "heures_ce_mois": other_heures,
                                    "raison_non_selection": "Moins prioritaire (équité/ancienneté)"
                                })
                        
                        # Ajouter les candidats rejetés
                        other_candidates_list.extend(candidats_rejetes[:10])  # Limiter à 10 pour l'espace
                        
                        # Créer l'assignation
                        assignation = {
                            "id": str(uuid.uuid4()),
                            "tenant_id": tenant.id,
                            "user_id": user_id,
                            "type_garde_id": type_garde_id,
                            "date": date_str,
                            "statut": "assigne",
                            "auto_attribue": True,
                            "assignation_type": "auto",
                            "publication_status": "brouillon",  # Mode brouillon par défaut
                            "caserne_id": caserne_filter_id,
                            "niveau_attribution": niveau,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            # Données d'audit/justification pour traçabilité (format attendu par le frontend)
                            "justification": {
                                "assigned_user": {
                                    "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}",
                                    "grade": user.get("grade", ""),
                                    "type_emploi": user_type_emploi,
                                    "details": {
                                        "heures_ce_mois": user_monthly_hours_internes.get(user_id, 0),
                                        "heures_externes_ce_mois": user_monthly_hours_externes.get(user_id, 0),
                                        "heures_semaine": user_heures_travaillees,
                                        "heures_max": user_heures_max,
                                        "est_officier": est_officier(user),
                                        "est_eligible": est_eligible_fonction_superieure(user),
                                        "had_disponibilite": user_has_dispo,
                                        "date_embauche": user.get("date_embauche", "")
                                    }
                                },
                                "type_garde_info": {
                                    "nom": type_garde_nom,
                                    "heure_debut": heure_debut,
                                    "heure_fin": heure_fin,
                                    "duree_heures": duree_garde,
                                    "est_externe": est_externe
                                },
                                "niveau": niveau,
                                "niveau_description": {
                                    2: "Temps partiel DISPONIBLE",
                                    3: "Temps partiel STAND-BY",
                                    4: "Temps plein (heures incomplètes)",
                                    5: "Heures supplémentaires"
                                }.get(niveau, f"Niveau {niveau}"),
                                "total_candidates_evaluated": len(users_avec_competences),
                                "candidates_acceptes": len(candidats),
                                "candidates_rejetes": len(candidats_rejetes),
                                "other_candidates": other_candidates_list,
                                "raison": f"Niveau {niveau} - {user_type_emploi} - {user_heures_travaillees}h travaillées/{user_heures_max}h max",
                                "periode_equite_info": {
                                    "type": periode_equite,
                                    "date_debut": date_debut_periode.strftime("%Y-%m-%d"),
                                    "date_fin": date_fin_periode.strftime("%Y-%m-%d"),
                                    "description": {
                                        "hebdomadaire": f"Hebdomadaire (du {date_debut_periode.strftime('%d/%m')} au {(date_fin_periode - timedelta(days=1)).strftime('%d/%m/%Y')})",
                                        "bi-hebdomadaire": f"Bi-hebdomadaire (du {date_debut_periode.strftime('%d/%m')} au {(date_fin_periode - timedelta(days=1)).strftime('%d/%m/%Y')})",
                                        "mensuel": f"Mensuel (du {date_debut_periode.strftime('%d/%m')} au {(date_fin_periode - timedelta(days=1)).strftime('%d/%m/%Y')})",
                                        "personnalise": f"Personnalisé {periode_equite_jours}j (du {date_debut_periode.strftime('%d/%m')} au {(date_fin_periode - timedelta(days=1)).strftime('%d/%m/%Y')})"
                                    }.get(periode_equite, periode_equite)
                                }
                            }
                        }
                        
                        # Si officier manquant, ajouter le flag
                        if besoin_officier and not officier_assigne_cette_iteration and assignes_cette_garde == 0:
                            # Ce sera le premier assigné et ce n'est pas un officier
                            if not est_officier(user) and not est_eligible_fonction_superieure(user):
                                assignation["officier_manquant"] = True
                        
                        # Insérer dans la DB
                        await db.assignations.insert_one(assignation)
                        nouvelles_assignations.append(assignation)
                        
                        # Mise à jour locale
                        existing_assignations.append(assignation)
                        users_assignes_ce_jour.add(user_id)
                        
                        # Mettre à jour les heures mensuelles
                        if est_externe:
                            user_monthly_hours_externes[user_id] = user_monthly_hours_externes.get(user_id, 0) + duree_garde
                        else:
                            user_monthly_hours_internes[user_id] = user_monthly_hours_internes.get(user_id, 0) + duree_garde
                        
                        assignes_cette_garde += 1
                        
                        # Log avec info officier
                        officier_tag = ""
                        if est_officier(user):
                            officier_tag = " [OFFICIER]"
                        elif est_eligible_fonction_superieure(user):
                            officier_tag = " [ÉLIGIBLE]"
                        
                        logging.info(f"✅ [N{niveau}]{officier_tag} {user.get('prenom', '')} {user.get('nom', '')} → {type_garde_nom} le {date_str}")
                
                # Log si garde non remplie après tous les niveaux
                if assignes_cette_garde == 0 and places_restantes > 0:
                    logging.warning(f"❌ [NON REMPLIE] {type_garde_nom} @ {date_str}: 0 assignation sur {places_restantes} places. Candidats avec compétences: {len(users_avec_competences)}")
            
            current_date += timedelta(days=1)
        
        logging.info(f"📊 [RÉSULTAT] {len(nouvelles_assignations)} nouvelles assignations créées")
        
        return nouvelles_assignations
    
    except Exception as e:
        logging.error(f"Erreur attribution automatique: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur attribution: {str(e)}")


# GET rapport-audit
