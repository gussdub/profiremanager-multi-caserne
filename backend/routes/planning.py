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

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta, date
from io import BytesIO
import uuid
import logging

# Import des fonctions de calcul d'équipe de garde
from routes.equipes_garde import get_equipe_garde_du_jour_sync, get_equipe_garde_rotation_standard, get_equipe_from_horaire_personnalise
import json
import asyncio
import time

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

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_planning_update

# Import pour les notifications push
from routes.notifications import send_push_notification_to_users

# Import des helpers PDF partagés
from utils.pdf_helpers import (
    create_branded_pdf,
    get_modern_pdf_styles,
    create_pdf_footer_text
)

# Import de la classe ParametresRemplacements
from routes.remplacements.models import ParametresRemplacements

router = APIRouter(tags=["Planning"])
logger = logging.getLogger(__name__)

import os
import resend
from services.email_builder import build_email, email_card, email_alert_card, email_detail_row


def send_planning_notification_email(user_email: str, user_name: str, gardes_list: list, tenant_slug: str, periode: str, tenant_nom: str = None, stats: dict = None):
    """
    Envoie un email détaillé avec les gardes assignées pour le mois
    """
    resend_api_key = os.environ.get('RESEND_API_KEY')
    
    if not resend_api_key:
        logger.warning(f"RESEND_API_KEY non configurée - Email NON envoyé à {user_email}")
        return False
    
    try:
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        caserne_nom = tenant_nom or tenant_slug.title()
        
        # URL de l'application (utiliser FRONTEND_URL ou construire depuis REACT_APP_BACKEND_URL)
        frontend_url = os.environ.get('FRONTEND_URL', os.environ.get('REACT_APP_BACKEND_URL', 'https://www.profiremanager.ca'))
        # Construire l'URL vers le planning avec le paramètre de page
        planning_url = f"{frontend_url}/{tenant_slug}?page=planning"
        
        # Extraire le mois de la période
        mois_noms = ["janvier", "février", "mars", "avril", "mai", "juin", 
                     "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        try:
            date_debut = datetime.strptime(periode.split(" au ")[0], "%Y-%m-%d")
            mois_texte = f"{mois_noms[date_debut.month - 1]} {date_debut.year}"
        except:
            mois_texte = periode
        
        subject = f"📅 Votre planning validé - {mois_texte}"
        
        # Utiliser les stats fournies ou calculer
        if stats is None:
            stats = {
                "par_type": {},
                "heures_internes": 0,
                "heures_externes": 0,
                "total_gardes": len(gardes_list)
            }
            for g in gardes_list:
                t = g.get('type_garde', 'Garde')
                stats["par_type"][t] = stats["par_type"].get(t, 0) + 1
                duree = g.get('duree_heures', 0) or 0
                if g.get('est_externe', False):
                    stats["heures_externes"] += duree
                else:
                    stats["heures_internes"] += duree
        
        nb_gardes = stats.get("total_gardes", len(gardes_list))
        heures_internes = stats.get("heures_internes", 0)
        heures_externes = stats.get("heures_externes", 0)
        total_heures = heures_internes + heures_externes
        par_type = stats.get("par_type", {})
        
        # Résumé par type de garde
        resume_types_html = ""
        for type_nom, count in par_type.items():
            resume_types_html += f"""
                <div style="display: inline-block; background: #f1f5f9; border-radius: 20px; padding: 8px 16px; margin: 4px; font-size: 14px;">
                    <strong style="color: #dc2626;">{count}</strong> <span style="color: #475569;">{type_nom}</span>
                </div>
            """
        
        # Bloc heures
        heures_html = ""
        if heures_internes > 0 or heures_externes > 0:
            heures_html = '<div style="display: flex; justify-content: center; gap: 30px; margin-top: 20px; flex-wrap: wrap;">'
            if heures_internes > 0:
                heures_html += f'''
                    <div style="text-align: center; background: #f0fdf4; border-radius: 12px; padding: 15px 25px;">
                        <span style="font-size: 28px; font-weight: bold; color: #16a34a;">{heures_internes:.1f}h</span>
                        <br>
                        <span style="color: #166534; font-size: 13px;">Heures internes</span>
                    </div>
                '''
            if heures_externes > 0:
                heures_html += f'''
                    <div style="text-align: center; background: #fef3c7; border-radius: 12px; padding: 15px 25px;">
                        <span style="font-size: 28px; font-weight: bold; color: #d97706;">{heures_externes:.1f}h</span>
                        <br>
                        <span style="color: #92400e; font-size: 13px;">Heures externes</span>
                    </div>
                '''
            if heures_internes > 0 and heures_externes > 0:
                heures_html += f'''
                    <div style="text-align: center; background: #eff6ff; border-radius: 12px; padding: 15px 25px;">
                        <span style="font-size: 28px; font-weight: bold; color: #2563eb;">{total_heures:.1f}h</span>
                        <br>
                        <span style="color: #1e40af; font-size: 13px;">Total</span>
                    </div>
                '''
            heures_html += "</div>"
        
        # Liste des gardes en HTML
        gardes_html = ''
        for garde in gardes_list:
            collegues_str = ', '.join(garde.get('collegues', [])) if garde.get('collegues') else 'Seul(e)'
            jour = garde.get('jour', '')
            horaire = garde.get('horaire', 'Horaire non défini')
            
            try:
                date_obj = datetime.strptime(garde['date'], "%Y-%m-%d")
                date_formatee = date_obj.strftime("%d/%m/%Y")
            except:
                date_formatee = garde['date']
            
            gardes_html += f"""
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 12px; font-weight: 600; color: #1e293b;">
                        {jour}<br>
                        <span style="font-weight: normal; color: #64748b; font-size: 0.9rem;">{date_formatee}</span>
                    </td>
                    <td style="padding: 12px;">
                        <strong style="color: #dc2626;">{garde['type_garde']}</strong><br>
                        <span style="color: #64748b; font-size: 0.9rem;">{horaire}</span>
                    </td>
                    <td style="padding: 12px; color: #64748b; font-size: 0.9rem;">
                        {collegues_str}
                    </td>
                </tr>
            """
        
        html_content = build_email(
            title=f"Planning Valide - {mois_texte}",
            body_html=f"""
                <p style="font-size: 15px; color: #374151;">Bonjour <strong>{user_name}</strong>,</p>
                <p style="font-size: 15px; color: #374151; margin: 0 0 24px;">
                    Votre planning pour le mois de <strong>{mois_texte}</strong> a ete valide par votre administrateur.
                </p>
                
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #EFF6FF; border-radius: 12px; padding: 24px; margin: 20px 0; text-align: center;">
                    <tr>
                        <td style="padding: 20px;">
                            <div style="font-size: 42px; font-weight: bold; color: #dc2626; margin-bottom: 4px;">{nb_gardes}</div>
                            <div style="color: #64748b; font-size: 14px; margin-bottom: 16px;">garde(s) assignee(s)</div>
                            <div>{resume_types_html}</div>
                            {heures_html}
                        </td>
                    </tr>
                </table>
                
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #ECFDF5; border-radius: 12px; border-left: 4px solid #10B981; margin: 20px 0;">
                    <tr>
                        <td style="padding: 14px 20px;">
                            <strong style="color: #065F46;">Vos gardes pour {mois_texte}</strong>
                        </td>
                    </tr>
                </table>
                
                <table style="width: 100%; border-collapse: collapse; margin: 16px 0; background: #fafafa; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 12px; text-align: left; color: #475569; font-weight: 600; font-size: 13px;">Jour</th>
                            <th style="padding: 12px; text-align: left; color: #475569; font-weight: 600; font-size: 13px;">Type de garde</th>
                            <th style="padding: 12px; text-align: left; color: #475569; font-weight: 600; font-size: 13px;">Collegues</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gardes_html}
                    </tbody>
                </table>
                
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF3C7; border-radius: 12px; border-left: 4px solid #F59E0B; margin: 20px 0;">
                    <tr>
                        <td style="padding: 20px;">
                            <strong style="color: #92400E; display: block; margin-bottom: 8px;">Rappels importants</strong>
                            <ul style="color: #78350f; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
                                <li>Ce planning a ete valide par votre administrateur</li>
                                <li>Des ajustements peuvent survenir en cas de remplacements</li>
                                <li>Consultez regulierement l'application pour les mises a jour</li>
                            </ul>
                        </td>
                    </tr>
                </table>
                
                <p style="color: #64748b; margin-top: 24px;">
                    Cordialement,<br>
                    <strong>L'equipe {caserne_nom}</strong>
                </p>
            """,
            accent_color="#dc2626",
            cta_text="Consulter mon planning",
            cta_url=planning_url,
            footer_text="Ceci est un message automatique de ProFireManager."
        )
        
        resend.api_key = resend_api_key
        
        params = {
            "from": f"{caserne_nom} <{sender_email}>",
            "to": [user_email],
            "subject": subject,
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email de planning envoyé à {user_email} (ID: {response.get('id', 'N/A')})")
        
        # Log email (synchrone via create_task)
        try:
            from routes.emails_history import log_email_sent
            import asyncio
            asyncio.create_task(log_email_sent(
                type_email="planning_gardes",
                destinataire_email=user_email,
                destinataire_nom=user_name,
                sujet=subject,
                tenant_slug=tenant_slug,
                metadata={"nb_gardes": len(gardes_list), "periode": periode}
            ))
        except Exception as log_err:
            logger.warning(f"Erreur log email: {log_err}")
        
        return True
            
    except Exception as e:
        logger.error(f"❌ Erreur envoi email planning à {user_email}: {str(e)}")
        return False


# ==================== SYSTÈME DE PROGRESSION TEMPS RÉEL ====================
# Dictionnaire global pour stocker les progressions des attributions auto

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
    publication_status: str = "publie"  # brouillon, publie - pour le mode test/preview
    caserne_id: Optional[str] = None  # ID de la caserne (si mode multi-casernes actif et type_garde par_caserne)
    justification: Optional[Dict[str, Any]] = None
    notes_admin: Optional[str] = None
    justification_historique: Optional[List[Dict[str, Any]]] = None


class AssignationCreate(BaseModel):
    user_id: str
    type_garde_id: str
    date: str
    assignation_type: str = "manuel"
    caserne_id: Optional[str] = None
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
    
    Filtrage selon les permissions:
    - Les utilisateurs avec 'planning-creer' voient TOUTES les assignations (brouillons + publiés)
    - Les autres utilisateurs ne voient que les assignations PUBLIÉES
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si l'utilisateur peut voir les brouillons
    can_see_drafts = await user_has_module_action(tenant.id, current_user, "planning", "creer")
    
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
    
    # Construire la requête avec filtre sur publication_status
    query = {
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut_str,
            "$lte": date_fin_str
        }
    }
    
    # Si l'utilisateur ne peut pas voir les brouillons, filtrer
    if not can_see_drafts:
        query["$or"] = [
            {"publication_status": "publie"},
            {"publication_status": {"$exists": False}}  # Rétrocompatibilité avec anciennes assignations
        ]
    
    assignations = await db.assignations.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    
    return assignations


@router.post("/{tenant_slug}/planning/assignation")
async def create_assignation(
    tenant_slug: str,
    assignation_data: AssignationCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle assignation"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
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
        caserne_id=assignation_data.caserne_id,
        notes_admin=assignation_data.notes_admin
    )
    
    await db.assignations.insert_one(assignation.dict())
    
    # Notifier l'employé UNIQUEMENT si le planning de cette période est déjà publié
    # (pas de notification pendant la phase brouillon/pré-publication)
    planning_publie = await db.assignations.find_one({
        "tenant_id": tenant.id,
        "date": {"$regex": f"^{assignation_data.date[:7]}"},  # même mois (YYYY-MM)
        "publication_status": "publie",
        "id": {"$ne": assignation.id}  # exclure l'assignation qu'on vient de créer
    })
    
    if planning_publie:
        try:
            await creer_notification(
                tenant_id=tenant.id,
                user_id=assignation_data.user_id,
                type_notification="planning_assignation",
                titre="Nouvelle assignation",
                message=f"Vous avez été assigné(e) le {assignation_data.date} - {type_garde.get('nom', 'Garde')}",
                lien=f"/planning?date={assignation_data.date}",
                envoyer_email=False
            )
        except Exception as e:
            logging.warning(f"Erreur lors de la création de notification: {e}")
    
    # Créer un log d'activité
    try:
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="planning",
            description=f"Nouvelle assignation créée pour {user.get('prenom', '')} {user.get('nom', '')}",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}",
            metadata={"assignation_id": assignation.id, "date": assignation_data.date}
        )
    except Exception as e:
        logging.warning(f"Erreur lors de la création d'activité: {e}")
    
    # Retourner l'assignation avec un éventuel avertissement
    result = clean_mongo_doc(assignation.dict())
    if warning_message:
        result["warning"] = warning_message
    
    # Broadcaster la mise à jour à tous les clients connectés
    asyncio.create_task(broadcast_planning_update(tenant_slug, "create", {
        "assignation_id": assignation.id,
        "date": assignation_data.date,
        "user_id": assignation_data.user_id,
        "type_garde_id": assignation_data.type_garde_id,
        "user_nom": f"{user.get('prenom', '')} {user.get('nom', '')}"
    }))
    
    return result


@router.delete("/{tenant_slug}/planning/assignation/{assignation_id}")
async def delete_assignation(
    tenant_slug: str,
    assignation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une assignation"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "supprimer")
    
    assignation = await db.assignations.find_one({
        "id": assignation_id,
        "tenant_id": tenant.id
    })
    
    if not assignation:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    
    # Récupérer les infos AVANT la suppression
    employe = await db.users.find_one({"id": assignation.get("user_id")}, {"prenom": 1, "nom": 1})
    employe_nom = f"{employe.get('prenom', '')} {employe.get('nom', '')}".strip() if employe else "Inconnu"
    
    type_garde = await db.types_garde.find_one({"id": assignation.get("type_garde_id")}, {"nom": 1})
    type_garde_nom = type_garde.get("nom", "Garde") if type_garde else "Garde"
    
    # SUPPRIMER L'ASSIGNATION D'ABORD (action principale)
    await db.assignations.delete_one({"id": assignation_id})
    
    # Notifier l'employé UNIQUEMENT si l'assignation était publiée
    # (pas de notification pour les brouillons/pré-publication)
    is_published = assignation.get("publication_status", "publie") == "publie"
    
    if is_published:
        async def notify_and_log():
            try:
                await creer_notification(
                    tenant_id=tenant.id,
                    user_id=assignation.get("user_id"),
                    type_notification="planning_suppression",
                    titre="Assignation annulée",
                    message=f"Votre assignation du {assignation.get('date', '')} a été annulée",
                    lien="/planning",
                    envoyer_email=False
                )
            except Exception as notif_error:
                logger.warning(f"Erreur notification suppression assignation: {notif_error}")
            
            # Envoyer une notification push à l'employé concerné
            try:
                await send_push_notification_to_users(
                    user_ids=[assignation.get("user_id")],
                    title="Assignation annulée",
                    body=f"Votre assignation du {assignation.get('date', '')} ({type_garde_nom}) a été annulée",
                    data={"type": "planning_suppression", "date": assignation.get("date", "")},
                    tenant_slug=tenant_slug
                )
            except Exception as push_error:
                logger.warning(f"Erreur push notification suppression assignation: {push_error}")
            
            try:
                await creer_activite(
                    tenant_id=tenant.id,
                    type_activite="planning_suppression",
                    description=f"Assignation supprimée: {employe_nom} - {type_garde_nom} le {assignation.get('date', '')}",
                    user_id=current_user.id,
                    user_nom=f"{current_user.prenom} {current_user.nom}",
                    metadata={"assignation_id": assignation_id, "date": assignation.get("date"), "employe": employe_nom}
                )
            except Exception as activite_error:
                logger.warning(f"Erreur activité suppression assignation: {activite_error}")
        
        # Lancer en arrière-plan
        asyncio.create_task(notify_and_log())
    else:
        # Brouillon supprimé : juste loguer l'activité, pas de notification
        try:
            await creer_activite(
                tenant_id=tenant.id,
                type_activite="planning_suppression",
                description=f"Brouillon supprimé: {employe_nom} - {type_garde_nom} le {assignation.get('date', '')}",
                user_id=current_user.id,
                user_nom=f"{current_user.prenom} {current_user.nom}",
                metadata={"assignation_id": assignation_id, "date": assignation.get("date"), "employe": employe_nom}
            )
        except Exception as activite_error:
            logger.warning(f"Erreur activité suppression brouillon: {activite_error}")
    
    # Broadcaster la mise à jour à tous les clients connectés
    asyncio.create_task(broadcast_planning_update(tenant_slug, "delete", {
        "assignation_id": assignation_id,
        "date": assignation.get("date"),
        "user_id": assignation.get("user_id"),
        "type_garde_id": assignation.get("type_garde_id")
    }))
    
    return {"message": "Assignation supprimée avec succès"}


# ==================== ROUTES PUBLICATION PLANNING ====================

class PublierPlanningRequest(BaseModel):
    date_debut: str  # Format: YYYY-MM-DD
    date_fin: str    # Format: YYYY-MM-DD


@router.post("/{tenant_slug}/planning/publier")
async def publier_planning(
    tenant_slug: str,
    request: PublierPlanningRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    """
    Publie le planning en brouillon pour une période donnée.
    - Change le statut des assignations de 'brouillon' à 'publie'
    - Envoie des notifications (in-app, push, email) à tous les employés concernés
    
    Requiert la permission 'planning-creer'
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
    date_debut = request.date_debut
    date_fin = request.date_fin
    
    # Trouver tous les brouillons à publier
    brouillons = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut,
            "$lte": date_fin
        },
        "publication_status": "brouillon"
    }).to_list(10000)
    
    if not brouillons:
        raise HTTPException(status_code=404, detail="Aucun brouillon à publier pour cette période")
    
    # Mettre à jour le statut de tous les brouillons
    result = await db.assignations.update_many(
        {
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut,
                "$lte": date_fin
            },
            "publication_status": "brouillon"
        },
        {
            "$set": {
                "publication_status": "publie",
                "published_at": datetime.now(timezone.utc).isoformat(),
                "published_by": current_user.id
            }
        }
    )
    
    nb_publies = result.modified_count
    
    # Collecter les user_ids uniques pour les notifications
    user_ids_affected = list(set([a.get("user_id") for a in brouillons if a.get("user_id")]))
    
    # Récupérer les informations des utilisateurs
    users = await db.users.find({"id": {"$in": user_ids_affected}}).to_list(1000)
    users_dict = {u["id"]: u for u in users}
    
    # Récupérer les types de garde pour les notifications détaillées
    type_garde_ids = list(set([a.get("type_garde_id") for a in brouillons if a.get("type_garde_id")]))
    types_garde = await db.types_garde.find({"id": {"$in": type_garde_ids}}).to_list(100)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    # Formatter la période pour les messages
    mois_noms = ["janvier", "février", "mars", "avril", "mai", "juin", 
                 "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    try:
        date_debut_obj = datetime.strptime(date_debut, "%Y-%m-%d")
        mois_texte = f"{mois_noms[date_debut_obj.month - 1]} {date_debut_obj.year}"
    except:
        mois_texte = f"{date_debut} au {date_fin}"
    
    periode_str = f"{date_debut} au {date_fin}"
    
    # Préparer les notifications par utilisateur
    notifications_envoyees = 0
    emails_envoyes = 0
    push_envoyes = 0
    
    async def envoyer_notifications_publication():
        nonlocal notifications_envoyees, emails_envoyes, push_envoyes
        
        for user_id in user_ids_affected:
            user = users_dict.get(user_id)
            if not user:
                continue
            
            # Récupérer TOUTES les gardes de cet utilisateur pour la période (pas seulement les brouillons)
            # Cela inclut les gardes déjà publiées + les nouvelles publiées
            all_user_gardes = await db.assignations.find({
                "tenant_id": tenant.id,
                "user_id": user_id,
                "date": {
                    "$gte": date_debut,
                    "$lte": date_fin
                },
                "publication_status": "publie"
            }).to_list(1000)
            
            all_user_gardes.sort(key=lambda x: x.get("date", ""))
            
            nb_gardes = len(all_user_gardes)
            
            # 1. Créer notification in-app
            try:
                await creer_notification(
                    tenant_id=tenant.id,
                    user_id=user_id,
                    type_notification="planning_publie",
                    titre=f"📅 Planning validé - {mois_texte}",
                    message=f"Votre planning pour {mois_texte} a été validé. Vous avez {nb_gardes} garde(s) assignée(s).",
                    lien=f"/planning?date={date_debut}",
                    envoyer_email=False
                )
                notifications_envoyees += 1
            except Exception as e:
                logger.warning(f"Erreur notification in-app pour {user_id}: {e}")
            
            # 2. Envoyer notification push
            try:
                await send_push_notification_to_users(
                    user_ids=[user_id],
                    title=f"📅 Planning validé - {mois_texte}",
                    body=f"Vous avez {nb_gardes} garde(s) assignée(s). Consultez votre planning!",
                    data={"type": "planning_publie", "date_debut": date_debut, "date_fin": date_fin},
                    tenant_slug=tenant_slug
                )
                push_envoyes += 1
            except Exception as e:
                logger.warning(f"Erreur push notification pour {user_id}: {e}")
            
            # 3. Envoyer email avec détails des gardes
            try:
                user_email = user.get("email")
                user_name = f"{user.get('prenom', '')} {user.get('nom', '')}".strip()
                
                if user_email:
                    # Récupérer les types de garde pour toutes les assignations de l'utilisateur
                    all_type_garde_ids = list(set([a.get("type_garde_id") for a in all_user_gardes if a.get("type_garde_id")]))
                    all_types_garde = await db.types_garde.find({"id": {"$in": all_type_garde_ids}}).to_list(100)
                    all_types_garde_dict = {t["id"]: t for t in all_types_garde}
                    
                    # Formatter la liste des gardes pour l'email
                    gardes_list = []
                    stats = {"par_type": {}, "heures_internes": 0, "heures_externes": 0, "total_gardes": nb_gardes}
                    
                    jours_fr = {
                        0: "Lundi", 1: "Mardi", 2: "Mercredi", 3: "Jeudi",
                        4: "Vendredi", 5: "Samedi", 6: "Dimanche"
                    }
                    
                    for garde in all_user_gardes:
                        type_garde = all_types_garde_dict.get(garde.get("type_garde_id"), {})
                        type_nom = type_garde.get("nom", "Garde")
                        duree = type_garde.get("duree_heures", 0) or 0
                        est_externe = type_garde.get("est_garde_externe", False)
                        
                        # Stats
                        stats["par_type"][type_nom] = stats["par_type"].get(type_nom, 0) + 1
                        if est_externe:
                            stats["heures_externes"] += duree
                        else:
                            stats["heures_internes"] += duree
                        
                        # Formatter date
                        try:
                            date_obj = datetime.strptime(garde.get("date", ""), "%Y-%m-%d")
                            jour = jours_fr.get(date_obj.weekday(), "")
                        except:
                            jour = ""
                        
                        horaire = f"{type_garde.get('heure_debut', '??:??')} - {type_garde.get('heure_fin', '??:??')}"
                        
                        # Trouver les collègues pour cette garde (parmi toutes les assignations publiées)
                        collegues_gardes = await db.assignations.find({
                            "tenant_id": tenant.id,
                            "date": garde.get("date"),
                            "type_garde_id": garde.get("type_garde_id"),
                            "user_id": {"$ne": user_id},
                            "publication_status": "publie"
                        }).to_list(50)
                        
                        collegues = []
                        for cg in collegues_gardes:
                            collegue = users_dict.get(cg.get("user_id"))
                            if not collegue:
                                collegue = await db.users.find_one({"id": cg.get("user_id")}, {"_id": 0})
                            if collegue:
                                collegues.append(f"{collegue.get('prenom', '')} {collegue.get('nom', '')}".strip())
                        
                        gardes_list.append({
                            "date": garde.get("date", ""),
                            "jour": jour,
                            "type_garde": type_nom,
                            "horaire": horaire,
                            "duree_heures": duree,
                            "est_externe": est_externe,
                            "collegues": collegues
                        })
                    
                    # Envoyer l'email
                    tenant_nom = tenant.nom if hasattr(tenant, 'nom') else tenant_slug.title()
                    email_sent = send_planning_notification_email(
                        user_email=user_email,
                        user_name=user_name,
                        gardes_list=gardes_list,
                        tenant_slug=tenant_slug,
                        periode=periode_str,
                        tenant_nom=tenant_nom,
                        stats=stats
                    )
                    if email_sent:
                        emails_envoyes += 1
                        
            except Exception as e:
                logger.warning(f"Erreur email pour {user_id}: {e}")
    
    # Lancer les notifications en tâche de fond
    background_tasks.add_task(envoyer_notifications_publication)
    
    # Log d'activité
    try:
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="planning_publie",
            description=f"Planning publié pour la période {periode_str}: {nb_publies} assignations publiées pour {len(user_ids_affected)} employé(s)",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}",
            metadata={
                "date_debut": date_debut,
                "date_fin": date_fin,
                "nb_assignations": nb_publies,
                "nb_employes": len(user_ids_affected)
            }
        )
    except Exception as e:
        logger.warning(f"Erreur log activité publication: {e}")
    
    # Broadcaster la mise à jour WebSocket
    asyncio.create_task(broadcast_planning_update(tenant_slug, "publish", {
        "date_debut": date_debut,
        "date_fin": date_fin,
        "nb_assignations": nb_publies,
        "nb_employes": len(user_ids_affected)
    }))
    
    return {
        "message": f"Planning publié avec succès",
        "periode": periode_str,
        "assignations_publiees": nb_publies,
        "employes_notifies": len(user_ids_affected),
        "notifications": {
            "in_app": "en cours",
            "push": "en cours",
            "email": "en cours"
        }
    }


@router.delete("/{tenant_slug}/planning/brouillons")
async def supprimer_brouillons(
    tenant_slug: str,
    date_debut: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    date_fin: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Supprime tous les brouillons pour une période donnée.
    Utile pour annuler un planning test avant publication.
    
    Requiert la permission 'planning-supprimer'
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "supprimer")
    
    result = await db.assignations.delete_many({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut,
            "$lte": date_fin
        },
        "publication_status": "brouillon"
    })
    
    return {
        "message": f"{result.deleted_count} brouillon(s) supprimé(s)",
        "periode": f"{date_debut} au {date_fin}",
        "brouillons_supprimes": result.deleted_count
    }


@router.get("/{tenant_slug}/planning/brouillons/count")
async def count_brouillons(
    tenant_slug: str,
    date_debut: str = Query(..., description="Date de début (YYYY-MM-DD)"),
    date_fin: str = Query(..., description="Date de fin (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    Compte le nombre de brouillons pour une période donnée.
    Requiert la permission 'planning-creer'
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
    count = await db.assignations.count_documents({
        "tenant_id": tenant.id,
        "date": {
            "$gte": date_debut,
            "$lte": date_fin
        },
        "publication_status": "brouillon"
    })
    
    return {
        "periode": f"{date_debut} au {date_fin}",
        "nb_brouillons": count
    }


# ==================== ROUTES RAPPORTS D'HEURES ====================

@router.get("/{tenant_slug}/planning/mes-heures")
async def get_mes_heures(
    tenant_slug: str,
    mois: Optional[str] = None,  # Format: YYYY-MM
    date_debut: Optional[str] = None,  # Format: YYYY-MM-DD
    date_fin: Optional[str] = None,  # Format: YYYY-MM-DD
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer mes heures pour un mois donné (pour l'employé connecté)
    Accepte soit 'mois' (YYYY-MM) soit 'date_debut/date_fin' (YYYY-MM-DD)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Déterminer les dates de début et fin
    if date_debut and date_fin:
        # Utiliser les dates fournies directement
        debut = datetime.strptime(date_debut, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        fin = datetime.strptime(date_fin, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        mois_str = date_debut[:7]  # YYYY-MM
    elif mois:
        # Utiliser le mois fourni
        year, month = map(int, mois.split('-'))
        debut = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            fin = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            fin = datetime(year, month + 1, 1, tzinfo=timezone.utc)
        mois_str = mois
    else:
        # Prendre le mois courant par défaut
        now = datetime.now(timezone.utc)
        debut = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        if now.month == 12:
            fin = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            fin = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
        mois_str = now.strftime("%Y-%m")
    
    # Récupérer les assignations de l'utilisateur pour cette période
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "date": {
            "$gte": debut.strftime("%Y-%m-%d"),
            "$lte": fin.strftime("%Y-%m-%d")
        }
    }, {"_id": 0}).to_list(500)
    
    # Récupérer les types de garde pour calculer les heures
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    total_heures = 0
    heures_internes = 0
    heures_externes = 0
    detail_par_type = {}
    
    for assignation in assignations:
        type_garde_id = assignation.get("type_garde_id")
        if type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            duree = tg.get("duree_heures", 0)
            est_externe = tg.get("est_garde_externe", False)
            
            total_heures += duree
            if est_externe:
                heures_externes += duree
            else:
                heures_internes += duree
            
            if type_garde_id not in detail_par_type:
                detail_par_type[type_garde_id] = {
                    "nom": tg.get("nom", ""),
                    "couleur": tg.get("couleur", "#3B82F6"),
                    "heures": 0,
                    "count": 0,
                    "est_externe": est_externe
                }
            
            detail_par_type[type_garde_id]["heures"] += duree
            detail_par_type[type_garde_id]["count"] += 1
    
    return {
        "mois": mois_str,
        "total_heures": total_heures,
        "heures_internes": heures_internes,
        "heures_externes": heures_externes,
        "nombre_gardes": len(assignations),
        "detail_par_type": list(detail_par_type.values()),
        "assignations": assignations
    }


@router.get("/{tenant_slug}/planning/rapport-heures")
async def get_rapport_heures(
    tenant_slug: str,
    mois: Optional[str] = None,  # Format: YYYY-MM
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Rapport d'heures global pour tous les employés (admin/superviseur)
    
    Les heures sont catégorisées ainsi:
    - Heures INTERNES = gardes de type "interne" (est_garde_externe = False)
    - Heures EXTERNES = gardes de type "externe" (est_garde_externe = True)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "voir")
    
    # Calculer les dates de la période
    # use_lte = True signifie qu'on utilise $lte (<=) pour la date de fin
    # use_lte = False signifie qu'on utilise $lt (<) pour la date de fin (quand fin_str = premier jour du mois suivant)
    use_lte = False
    
    if date_debut and date_fin:
        # Utiliser les dates fournies directement
        # Dans ce cas, date_fin est le DERNIER jour inclus (ex: 2026-04-30)
        # Donc on utilise $lte pour inclure ce jour
        debut_str = date_debut
        fin_str = date_fin
        use_lte = True
    elif mois:
        # Calculer les dates du mois
        # fin_str sera le premier jour du mois suivant, donc on utilise $lt
        year, month = map(int, mois.split('-'))
        debut_str = f"{year}-{month:02d}-01"
        if month == 12:
            fin_str = f"{year + 1}-01-01"
        else:
            fin_str = f"{year}-{month + 1:02d}-01"
        use_lte = False
    else:
        # Mois courant par défaut
        # fin_str sera le premier jour du mois suivant, donc on utilise $lt
        now = datetime.now(timezone.utc)
        debut_str = f"{now.year}-{now.month:02d}-01"
        if now.month == 12:
            fin_str = f"{now.year + 1}-01-01"
        else:
            fin_str = f"{now.year}-{now.month + 1:02d}-01"
        use_lte = False
    
    # Récupérer toutes les assignations de la période
    # $lte inclut la date de fin, $lt l'exclut
    date_filter = {"$lte": fin_str} if use_lte else {"$lt": fin_str}
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": debut_str,
            **date_filter
        }
    }, {"_id": 0}).to_list(10000)
    
    # Récupérer les types de garde avec leur catégorisation interne/externe
    types_garde = await get_types_garde(tenant.id)
    types_garde_dict = {t["id"]: t for t in types_garde}
    
    # Récupérer tous les employés actifs (temps plein ET temps partiel)
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
        
        if not user_id or user_id not in users_dict:
            continue
        
        if user_id not in rapport:
            user = users_dict.get(user_id, {})
            nom = user.get("nom", "")
            prenom = user.get("prenom", "")
            type_emploi = user.get("type_emploi", "")
            
            rapport[user_id] = {
                "user_id": user_id,
                "nom": nom,
                "prenom": prenom,
                "nom_complet": f"{prenom} {nom}".strip(),
                "grade": user.get("grade", ""),
                "type_emploi": type_emploi,
                "total_heures": 0,
                "heures_internes": 0,  # Heures de gardes INTERNES (pas externe)
                "heures_externes": 0,  # Heures de gardes EXTERNES
                "nombre_gardes": 0,
                "detail_par_type": {}
            }
        
        if type_garde_id in types_garde_dict:
            tg = types_garde_dict[type_garde_id]
            duree = tg.get("duree_heures", 0) or 0
            est_garde_externe = tg.get("est_garde_externe", False)
            
            rapport[user_id]["total_heures"] += duree
            rapport[user_id]["nombre_gardes"] += 1
            
            # Catégoriser selon le TYPE DE GARDE (pas le type d'emploi!)
            if est_garde_externe:
                rapport[user_id]["heures_externes"] += duree
            else:
                rapport[user_id]["heures_internes"] += duree
            
            if type_garde_id not in rapport[user_id]["detail_par_type"]:
                rapport[user_id]["detail_par_type"][type_garde_id] = {
                    "nom": tg.get("nom", ""),
                    "heures": 0,
                    "count": 0,
                    "est_externe": est_garde_externe
                }
            
            rapport[user_id]["detail_par_type"][type_garde_id]["heures"] += duree
            rapport[user_id]["detail_par_type"][type_garde_id]["count"] += 1
    
    # Ajouter les employés sans assignation (pour voir qui n'a pas d'heures)
    for user_id, user in users_dict.items():
        if user_id not in rapport:
            rapport[user_id] = {
                "user_id": user_id,
                "nom": user.get("nom", ""),
                "prenom": user.get("prenom", ""),
                "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}".strip(),
                "grade": user.get("grade", ""),
                "type_emploi": user.get("type_emploi", ""),
                "total_heures": 0,
                "heures_internes": 0,
                "heures_externes": 0,
                "nombre_gardes": 0,
                "detail_par_type": {}
            }
    
    # Convertir en liste triée
    rapport_list = list(rapport.values())
    rapport_list.sort(key=lambda x: x["total_heures"], reverse=True)
    
    # Calculer les statistiques globales
    total_heures_planifiees = sum([r["total_heures"] for r in rapport_list])
    total_heures_internes = sum([r["heures_internes"] for r in rapport_list])
    total_heures_externes = sum([r["heures_externes"] for r in rapport_list])
    nb_employes = len(rapport_list)
    
    # Compter employés avec heures internes/externes
    nb_avec_heures_internes = len([r for r in rapport_list if r["heures_internes"] > 0])
    nb_avec_heures_externes = len([r for r in rapport_list if r["heures_externes"] > 0])
    
    return {
        "mois": mois if mois else f"{debut_str[:7]}",
        "date_debut": debut_str,
        "date_fin": fin_str,
        "total_assignations": len(assignations),
        "employes": rapport_list,
        "statistiques": {
            "total_heures_planifiees": round(total_heures_planifiees, 2),
            "total_heures_internes": round(total_heures_internes, 2),
            "total_heures_externes": round(total_heures_externes, 2),
            "moyenne_heures_internes": round(total_heures_internes / nb_avec_heures_internes, 2) if nb_avec_heures_internes > 0 else 0,
            "moyenne_heures_externes": round(total_heures_externes / nb_avec_heures_externes, 2) if nb_avec_heures_externes > 0 else 0,
            "nb_employes": nb_employes,
            "nb_avec_heures_internes": nb_avec_heures_internes,
            "nb_avec_heures_externes": nb_avec_heures_externes
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
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "voir")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "modifier")
    
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
# IMPORTANT: Les routes spécifiques comme /export-pdf doivent être définies AVANT dans le fichier

@router.get("/{tenant_slug}/planning/{semaine_debut}")
async def get_planning_semaine(
    tenant_slug: str,
    semaine_debut: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer le planning d'une semaine complète
    Retourne les assignations avec les informations des employés et types de garde
    
    Filtrage selon les permissions:
    - Les utilisateurs avec 'planning-creer' voient TOUTES les assignations (brouillons + publiés)
    - Les autres utilisateurs ne voient que les assignations PUBLIÉES
    
    IMPORTANT: Cette route DOIT être définie en DERNIER car {semaine_debut} 
    est un paramètre générique qui capturerait sinon les autres routes.
    """
    # Vérifier que semaine_debut est bien une date (format YYYY-MM-DD)
    # Sinon, c'est probablement une autre route qui n'a pas été matchée
    import re
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', semaine_debut):
        raise HTTPException(status_code=404, detail=f"Route non trouvée: /planning/{semaine_debut}")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si l'utilisateur peut voir les brouillons
    can_see_drafts = await user_has_module_action(tenant.id, current_user, "planning", "creer")
    
    date_debut, date_fin = get_semaine_range(semaine_debut)
    semaine_fin = date_fin.strftime("%Y-%m-%d")
    
    # Construire la requête avec filtre sur publication_status
    query = {
        "tenant_id": tenant.id,
        "date": {
            "$gte": semaine_debut,
            "$lte": semaine_fin
        }
    }
    
    # Si l'utilisateur ne peut pas voir les brouillons, filtrer
    if not can_see_drafts:
        query["$or"] = [
            {"publication_status": "publie"},
            {"publication_status": {"$exists": False}}  # Rétrocompatibilité avec anciennes assignations
        ]
    
    # Récupérer les assignations de la semaine
    assignations = await db.assignations.find(query, {"_id": 0}).to_list(1000)
    
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
    
    tenant = await get_tenant_from_slug(tenant_slug)
    # Opération critique - exige permission "supprimer" sur planning
    await require_permission(tenant.id, current_user, "planning", "supprimer")
    
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
# GET export-excel

# GET export-ical - Export des gardes au format iCalendar (.ics)
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
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "voir")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "supprimer")
    
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
# GET rapport-heures/export-excel

# POST assignation-avancee
@router.post("/{tenant_slug}/planning/assignation-avancee")
async def assignation_manuelle_avancee(
    tenant_slug: str,
    assignation_data: dict,
    current_user: User = Depends(get_current_user)
):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "creer")
    
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
@router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")


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
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        await require_permission(tenant.id, current_user, "planning", "modifier")
        
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
                'date': assignation['date'],  # Format YYYY-MM-DD pour compatibilité
                'jour': jour_fr,
                'type_garde': type_garde.get('nom', 'Garde'),
                'horaire': f"{type_garde.get('heure_debut', '08:00')} - {type_garde.get('heure_fin', '08:00')}",
                'duree_heures': type_garde.get('duree_heures', 0),
                'est_externe': type_garde.get('est_garde_externe', False),
                'collegues': collegues
            })
        
        # Envoyer les emails
        emails_envoyes = 0
        emails_echoues = 0
        
        for user_id, gardes in gardes_par_user.items():
            user = users_map.get(user_id)
            if not user or not user.get('email'):
                continue
            
            # Vérifier les préférences de notification
            preferences = user.get("preferences_notifications", {})
            if not preferences.get("email_actif", True):
                logger.info(f"📧 Email désactivé pour {user.get('prenom')} - préférences utilisateur")
                continue
            
            # Calculer les statistiques pour cet utilisateur
            stats = {
                "par_type": {},
                "heures_internes": 0,
                "heures_externes": 0,
                "total_gardes": len(gardes)
            }
            
            for garde in gardes:
                type_nom = garde.get("type_garde", "Garde")
                duree = garde.get("duree_heures", 0) or 0
                
                if type_nom not in stats["par_type"]:
                    stats["par_type"][type_nom] = 0
                stats["par_type"][type_nom] += 1
                
                if garde.get("est_externe", False):
                    stats["heures_externes"] += duree
                else:
                    stats["heures_internes"] += duree
            
            user_name = f"{user['prenom']} {user['nom']}"
            email_sent = send_planning_notification_email(
                user_email=user['email'],
                user_name=user_name,
                gardes_list=gardes,
                tenant_slug=tenant_slug,
                periode=f"{periode_debut} au {periode_fin}",
                tenant_nom=tenant.nom,
                stats=stats
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
        logger.error(f"Erreur envoi notifications planning: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur envoi notifications: {str(e)}")



@router.put("/{tenant_slug}/assignations/{assignation_id}/notes")
async def update_assignation_notes(
    tenant_slug: str,
    assignation_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """Permet à un admin de mettre à jour les notes sur une assignation"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "planning", "modifier")
    
    # Trouver l'assignation
    assignation = await db.assignations.find_one({
        "id": assignation_id,
        "tenant_id": tenant.id
    })
    
    if not assignation:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    
    notes = data.get("notes", "")
    
    # Mettre à jour les notes
    await db.assignations.update_one(
        {"id": assignation_id},
        {"$set": {"notes_admin": notes}}
    )
    
    return {"message": "Notes mises à jour avec succès", "notes": notes}
