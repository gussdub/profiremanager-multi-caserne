"""
Routes API pour le module Remplacements
=======================================

STATUT: ACTIF
Ce module gère le système automatisé de demandes de remplacement entre pompiers.

Routes principales:
- POST   /{tenant_slug}/remplacements                        - Créer une demande de remplacement
- GET    /{tenant_slug}/remplacements                        - Liste des demandes
- GET    /{tenant_slug}/remplacements/propositions           - Propositions pour l'utilisateur
- GET    /{tenant_slug}/remplacements/export-pdf             - Export PDF des demandes
- GET    /{tenant_slug}/remplacements/export-excel           - Export Excel des demandes
- PUT    /{tenant_slug}/remplacements/{id}/accepter          - Accepter une demande
- PUT    /{tenant_slug}/remplacements/{id}/refuser           - Refuser une demande
- DELETE /{tenant_slug}/remplacements/{id}                   - Annuler une demande

Routes publiques (actions via email):
- GET    /remplacement-action/{token}/{action}               - Action via lien email

Paramètres remplacements:
- GET    /{tenant_slug}/parametres/remplacements             - Récupérer les paramètres
- PUT    /{tenant_slug}/parametres/remplacements             - Modifier les paramètres
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    creer_activite
)

router = APIRouter(tags=["Remplacements"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class TentativeRemplacement(BaseModel):
    """Historique des tentatives de remplacement"""
    user_id: str
    nom_complet: str
    date_contact: datetime
    statut: str  # contacted, accepted, refused, expired
    date_reponse: Optional[datetime] = None


class DemandeRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demandeur_id: str
    type_garde_id: str
    date: str  # Date de la garde à remplacer (format: YYYY-MM-DD)
    raison: str
    statut: str = "en_attente"  # en_attente, en_cours, accepte, expiree, annulee
    priorite: str = "normal"  # urgent (≤24h), normal (>24h) - calculé automatiquement
    remplacant_id: Optional[str] = None
    tentatives_historique: List[Dict[str, Any]] = []
    remplacants_contactes_ids: List[str] = []
    date_prochaine_tentative: Optional[datetime] = None
    nombre_tentatives: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DemandeRemplacementCreate(BaseModel):
    type_garde_id: str
    date: str
    raison: str


class NotificationRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demande_remplacement_id: str
    destinataire_id: str
    message: str
    type_notification: str = "remplacement_disponible"
    statut: str = "envoye"  # envoye, lu, accepte, refuse
    date_envoi: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_reponse: Optional[datetime] = None
    ordre_priorite: Optional[int] = None


class ParametresRemplacements(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    mode_notification: str = "simultane"  # simultane, sequentiel, groupe_sequentiel
    taille_groupe: int = 3
    delai_attente_heures: int = 24
    max_contacts: int = 5
    priorite_grade: bool = True
    priorite_competences: bool = True
    activer_gestion_heures_sup: bool = False
    seuil_max_heures: int = 40
    periode_calcul_heures: str = "semaine"
    jours_periode_personnalisee: int = 7
    activer_regroupement_heures: bool = False
    duree_max_regroupement: int = 24


# ==================== FONCTIONS HELPER ====================

async def calculer_priorite_demande(date_garde: str) -> str:
    """
    Calcule la priorité d'une demande de remplacement
    - urgent: Si la garde est dans 24h ou moins
    - normal: Si la garde est dans plus de 24h
    """
    try:
        date_garde_obj = datetime.strptime(date_garde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        maintenant = datetime.now(timezone.utc)
        delta = date_garde_obj - maintenant
        
        if delta.total_seconds() <= 86400:  # 24 heures en secondes
            return "urgent"
        return "normal"
    except Exception as e:
        logger.error(f"Erreur calcul priorité: {e}")
        return "normal"


async def trouver_remplacants_potentiels(
    tenant_id: str,
    type_garde_id: str,
    date_garde: str,
    demandeur_id: str,
    exclus_ids: List[str] = []
) -> List[Dict[str, Any]]:
    """
    Trouve les remplaçants potentiels selon les critères configurés dans Paramètres > Remplacements:
    1. Compétences requises pour le type de garde (si competences_egales activé)
    2. Grade équivalent ou supérieur (si grade_egal activé)
    3. Pas d'indisponibilité pour cette date
    4. Disponibilité déclarée (filtré si privilegier_disponibles activé, sinon bonus de tri)
    5. Ancienneté (date_embauche la plus ancienne)
    """
    try:
        # Récupérer les paramètres de remplacements pour ce tenant
        parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant_id})
        
        # Valeurs par défaut si pas de paramètres
        privilegier_disponibles = parametres.get("privilegier_disponibles", False) if parametres else False
        grade_egal = parametres.get("grade_egal", False) if parametres else False
        competences_egales = parametres.get("competences_egales", False) if parametres else False
        
        logger.warning(f"⚙️ Paramètres remplacements - privilegier_disponibles: {privilegier_disponibles}, grade_egal: {grade_egal}, competences_egales: {competences_egales}")
        
        # Récupérer le type de garde pour connaître les compétences requises
        type_garde_data = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant_id})
        if not type_garde_data:
            logger.error(f"Type de garde non trouvé: {type_garde_id}")
            return []
        
        competences_requises = type_garde_data.get("competences_requises", [])
        officier_obligatoire = type_garde_data.get("officier_obligatoire", False)
        
        # Récupérer le demandeur pour comparer grade/compétences
        demandeur = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant_id})
        demandeur_grade = demandeur.get("grade", "pompier").lower() if demandeur else "pompier"
        demandeur_competences = set(demandeur.get("competences", [])) if demandeur else set()
        
        # Récupérer tous les utilisateurs du tenant (sauf demandeur et déjà exclus)
        exclus_ids_set = set(exclus_ids + [demandeur_id])
        
        users_cursor = db.users.find({
            "tenant_id": tenant_id,
            "id": {"$nin": list(exclus_ids_set)},
            "type_emploi": "temps_partiel"  # Seulement temps partiel pour remplacements
        })
        users_list = await users_cursor.to_list(length=None)
        
        logger.warning(f"🔍 Recherche remplaçants - Type garde: {type_garde_id}, Compétences requises: {competences_requises}, Officier obligatoire: {officier_obligatoire}")
        logger.warning(f"🔍 Trouvé {len(users_list)} employés temps partiel (excluant {len(exclus_ids_set)} IDs)")
        
        remplacants_potentiels = []
        
        # Hiérarchie des grades (du plus bas au plus haut)
        grades_hierarchie = {
            "pompier": 1,
            "lieutenant": 2,
            "capitaine": 3,
            "chef": 4,
            "eligible": 2,
            "éligible": 2
        }
        demandeur_grade_niveau = grades_hierarchie.get(demandeur_grade, 1)
        
        for user in users_list:
            user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
            user_grade = user.get("grade", "pompier")
            user_grade_lower = user_grade.lower() if user_grade else "pompier"
            user_grade_niveau = grades_hierarchie.get(user_grade_lower, 1)
            
            # 1. Vérifier les compétences (SI competences_egales est activé)
            if competences_egales:
                user_competences = set(user.get("competences", []))
                if demandeur_competences and not demandeur_competences.issubset(user_competences):
                    logger.warning(f"❌ {user_name} - Compétences insuffisantes: {user_competences} vs demandeur: {demandeur_competences}")
                    continue
                if competences_requises and not set(competences_requises).issubset(user_competences):
                    logger.warning(f"❌ {user_name} - Compétences type garde insuffisantes: {user_competences} vs requis: {competences_requises}")
                    continue
            
            # 2. Vérifier le grade (SI grade_egal est activé OU si officier_obligatoire)
            if grade_egal:
                if user_grade_niveau < demandeur_grade_niveau:
                    logger.warning(f"❌ {user_name} - Grade insuffisant: {user_grade} (niveau {user_grade_niveau}) vs demandeur niveau {demandeur_grade_niveau}")
                    continue
            
            if officier_obligatoire:
                grades_autorises = ["lieutenant", "capitaine", "chef", "eligible", "éligible"]
                if user_grade_lower not in grades_autorises:
                    logger.warning(f"❌ {user_name} - Grade insuffisant: {user_grade} (officier ou éligible requis)")
                    continue
            
            # 3. Vérifier qu'il n'a PAS d'indisponibilité pour cette date
            indispo = await db.disponibilites.find_one({
                "user_id": user["id"],
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "indisponible"
            })
            
            if indispo:
                logger.warning(f"❌ {user_name} - Indisponible pour cette date")
                continue
            
            # 4. Vérifier s'il a une disponibilité déclarée
            dispo = await db.disponibilites.find_one({
                "user_id": user["id"],
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "disponible"
            })
            
            has_disponibilite = dispo is not None
            
            # Si privilegier_disponibles est activé, FILTRER ceux qui n'ont pas de dispo
            if privilegier_disponibles and not has_disponibilite:
                logger.warning(f"❌ {user_name} - Pas de disponibilité déclarée (filtre privilegier_disponibles actif)")
                continue
            
            # 5. Vérifier les limites d'heures (gestion heures supplémentaires)
            if parametres and not parametres.get("activer_gestion_heures_sup", False):
                heures_max_user = user.get("heures_max_semaine", 40)
                
                semaine_debut = datetime.strptime(date_garde, "%Y-%m-%d")
                while semaine_debut.weekday() != 0:
                    semaine_debut -= timedelta(days=1)
                semaine_fin = semaine_debut + timedelta(days=6)
                
                assignations_semaine = await db.assignations.find({
                    "user_id": user["id"],
                    "tenant_id": tenant_id,
                    "date": {
                        "$gte": semaine_debut.strftime("%Y-%m-%d"),
                        "$lte": semaine_fin.strftime("%Y-%m-%d")
                    }
                }).to_list(1000)
                
                heures_semaine = sum(8 for _ in assignations_semaine)
                duree_garde = type_garde_data.get("duree_heures", 8)
                
                if heures_semaine + duree_garde > heures_max_user:
                    logger.warning(f"❌ {user_name} - Dépasse heures max hebdo ({heures_semaine + duree_garde} > {heures_max_user})")
                    continue
            
            # 6. Ancienneté (date_embauche)
            date_embauche = user.get("date_embauche", "2999-12-31")
            
            logger.warning(f"✅ {user_name} - Ajouté comme remplaçant potentiel (dispo déclarée: {has_disponibilite})")
            
            remplacants_potentiels.append({
                "user_id": user["id"],
                "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "email": user.get("email", ""),
                "grade": user_grade,
                "date_embauche": date_embauche,
                "has_disponibilite": has_disponibilite,
                "formations": list(set(user.get("competences", [])))
            })
        
        # Trier par: 1. Disponibilité déclarée, 2. Ancienneté
        remplacants_potentiels.sort(
            key=lambda x: (
                not x["has_disponibilite"],
                x["date_embauche"]
            )
        )
        
        logger.info(f"✅ Trouvé {len(remplacants_potentiels)} remplaçants potentiels pour demande {type_garde_id}")
        return remplacants_potentiels
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la recherche de remplaçants: {e}", exc_info=True)
        return []


async def generer_token_remplacement(demande_id: str, remplacant_id: str, tenant_id: str) -> str:
    """Génère un token unique et temporaire pour accepter/refuser un remplacement par email"""
    token = str(uuid.uuid4())
    expiration = datetime.now(timezone.utc) + timedelta(hours=48)
    
    await db.tokens_remplacement.insert_one({
        "token": token,
        "demande_id": demande_id,
        "remplacant_id": remplacant_id,
        "tenant_id": tenant_id,
        "expiration": expiration.isoformat(),
        "utilise": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return token


async def envoyer_email_remplacement(
    demande_data: dict,
    remplacant: dict,
    demandeur: dict,
    type_garde: dict,
    tenant_id: str,
    token: str
):
    """Envoie un email au remplaçant potentiel avec les boutons Accepter/Refuser"""
    try:
        import resend
        
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning(f"RESEND_API_KEY non configurée - Email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        remplacant_user = await db.users.find_one({"id": remplacant["user_id"]})
        if not remplacant_user or not remplacant_user.get("email"):
            logger.warning(f"Email non trouvé pour remplaçant {remplacant['user_id']}")
            return False
        
        remplacant_email = remplacant_user["email"]
        remplacant_prenom = remplacant_user.get("prenom", "")
        
        frontend_url = os.environ.get('FRONTEND_URL', 'https://ems-dispatcher.preview.emergentagent.com')
        backend_url = os.environ.get('REACT_APP_BACKEND_URL', frontend_url)
        
        lien_accepter = f"{backend_url}/api/remplacement-action/{token}/accepter"
        lien_refuser = f"{backend_url}/api/remplacement-action/{token}/refuser"
        
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "Garde")
        date_garde = demande_data.get("date", "")
        heure_debut = type_garde.get("heure_debut", "")
        heure_fin = type_garde.get("heure_fin", "")
        raison = demande_data.get("raison", "")
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
            <div style="background-color: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #dc2626; margin: 0;">🚨 Demande de Remplacement</h1>
                </div>
                
                <p style="font-size: 16px; color: #333;">Bonjour {remplacant_prenom},</p>
                
                <p style="font-size: 16px; color: #333;">
                    <strong>{demandeur_nom}</strong> recherche un remplaçant et vous avez été identifié comme disponible.
                </p>
                
                <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #1e3a5f;">📋 Détails de la garde</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #666; width: 40%;">Type de garde:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{type_garde_nom}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Date:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{date_garde}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Horaire:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{heure_debut} - {heure_fin}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #666;">Demandeur:</td>
                            <td style="padding: 8px 0; color: #333; font-weight: bold;">{demandeur_nom}</td>
                        </tr>
                        {f'<tr><td style="padding: 8px 0; color: #666;">Raison:</td><td style="padding: 8px 0; color: #333;">{raison}</td></tr>' if raison else ''}
                    </table>
                </div>
                
                <p style="font-size: 16px; color: #333; text-align: center; margin: 30px 0 20px;">
                    <strong>Pouvez-vous effectuer ce remplacement ?</strong>
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{lien_accepter}" 
                       style="display: inline-block; background-color: #22c55e; color: white; padding: 15px 40px; 
                              text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; 
                              margin: 0 10px; box-shadow: 0 2px 5px rgba(34,197,94,0.3);">
                        ✅ J'accepte
                    </a>
                    <a href="{lien_refuser}" 
                       style="display: inline-block; background-color: #ef4444; color: white; padding: 15px 40px; 
                              text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; 
                              margin: 0 10px; box-shadow: 0 2px 5px rgba(239,68,68,0.3);">
                        ❌ Je refuse
                    </a>
                </div>
                
                <p style="font-size: 14px; color: #666; text-align: center; margin-top: 30px;">
                    Vous pouvez également répondre directement dans l'application ProFireManager.
                </p>
                
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                
                <p style="font-size: 12px; color: #999; text-align: center;">
                    Ce lien est valide pendant 48 heures.<br>
                    Si vous n'êtes pas concerné par cette demande, veuillez ignorer cet email.
                </p>
            </div>
        </body>
        </html>
        """
        
        params = {
            "from": "ProFireManager <remplacement@profiremanager.ca>",
            "to": [remplacant_email],
            "subject": f"🚨 Demande de remplacement - {type_garde_nom} le {date_garde}",
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        logger.info(f"✅ Email de remplacement envoyé à {remplacant_email} (ID: {response.get('id', 'N/A')})")
        return True
        
    except Exception as e:
        logger.error(f"❌ Erreur envoi email remplacement: {e}", exc_info=True)
        return False


# Import de send_push_notification_to_users depuis server.py (sera appelé dynamiquement)
async def get_send_push_notification():
    """Récupère la fonction send_push_notification_to_users depuis server.py"""
    try:
        import server
        return server.send_push_notification_to_users
    except:
        # Fonction de fallback qui ne fait rien si l'import échoue
        async def noop(*args, **kwargs):
            logger.warning("send_push_notification_to_users non disponible")
        return noop


async def lancer_recherche_remplacant(demande_id: str, tenant_id: str):
    """Lance la recherche de remplaçant pour une demande"""
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            logger.error(f"Demande de remplacement non trouvée: {demande_id}")
            return
        
        parametres_data = await db.parametres.find_one({"tenant_id": tenant_id})
        if not parametres_data:
            mode_notification = "un_par_un"
            delai_attente_heures = 2
            nombre_simultane = 1
        else:
            mode_notification = parametres_data.get("mode_notification", "un_par_un")
            delai_attente_heures = parametres_data.get("delai_attente_heures", 2)
            nombre_simultane = parametres_data.get("nombre_simultane", 3)
        
        exclus_ids = [t.get("user_id") for t in demande_data.get("tentatives_historique", [])]
        
        remplacants = await trouver_remplacants_potentiels(
            tenant_id=tenant_id,
            type_garde_id=demande_data["type_garde_id"],
            date_garde=demande_data["date"],
            demandeur_id=demande_data["demandeur_id"],
            exclus_ids=exclus_ids
        )
        
        if not remplacants:
            logger.warning(f"⚠️ Aucun remplaçant trouvé pour la demande {demande_id}")
            await db.demandes_remplacement.update_one(
                {"id": demande_id},
                {
                    "$set": {
                        "statut": "expiree",
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            # Notifier superviseurs
            superviseurs = await db.users.find({
                "tenant_id": tenant_id,
                "role": {"$in": ["superviseur", "admin"]}
            }).to_list(100)
            
            superviseur_ids = [s["id"] for s in superviseurs]
            if superviseur_ids:
                demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
                await send_push_notification_to_users(
                    user_ids=superviseur_ids,
                    title="❌ Aucun remplaçant trouvé",
                    body=f"Aucun remplaçant disponible pour {demandeur.get('prenom', '')} {demandeur.get('nom', '')} le {demande_data['date']}",
                    data={
                        "type": "remplacement_expiree",
                        "demande_id": demande_id
                    }
                )
            
            # Notifier le demandeur
            demandeur_id = demande_data.get("demandeur_id")
            if demandeur_id:
                await send_push_notification_to_users(
                    user_ids=[demandeur_id],
                    title="❌ Demande de remplacement expirée",
                    body=f"Aucun remplaçant n'a été trouvé pour votre demande du {demande_data['date']}. Contactez votre superviseur.",
                    data={
                        "type": "remplacement_expiree",
                        "demande_id": demande_id
                    }
                )
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "user_id": demandeur_id,
                    "type": "remplacement_expiree",
                    "titre": "❌ Demande de remplacement expirée",
                    "message": f"Aucun remplaçant n'a été trouvé pour votre demande du {demande_data['date']}.",
                    "lu": False,
                    "data": {"demande_id": demande_id},
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
            return
        
        if mode_notification == "multiple":
            nombre_a_contacter = min(nombre_simultane, len(remplacants))
        else:
            nombre_a_contacter = 1
        
        remplacants_a_contacter = remplacants[:nombre_a_contacter]
        
        remplacant_ids = []
        maintenant = datetime.now(timezone.utc)
        
        for remplacant in remplacants_a_contacter:
            tentative = {
                "user_id": remplacant["user_id"],
                "nom_complet": remplacant["nom_complet"],
                "date_contact": maintenant.isoformat(),
                "statut": "contacted",
                "date_reponse": None
            }
            
            await db.demandes_remplacement.update_one(
                {"id": demande_id},
                {
                    "$push": {"tentatives_historique": tentative},
                    "$addToSet": {"remplacants_contactes_ids": remplacant["user_id"]}
                }
            )
            
            remplacant_ids.append(remplacant["user_id"])
            logger.info(f"📤 Contact remplaçant {remplacant['nom_complet']} pour demande {demande_id}")
        
        date_prochaine = maintenant + timedelta(hours=delai_attente_heures)
        
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "en_cours",
                    "date_prochaine_tentative": date_prochaine,
                    "updated_at": maintenant
                },
                "$inc": {"nombre_tentatives": 1}
            }
        )
        
        demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
        type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"]})
        
        await send_push_notification_to_users(
            user_ids=remplacant_ids,
            title="🚨 Demande de remplacement",
            body=f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')} cherche un remplaçant pour {type_garde.get('nom', 'une garde')} le {demande_data['date']}",
            data={
                "type": "remplacement_proposition",
                "demande_id": demande_id,
                "lien": "/remplacements",
                "sound": "urgent"
            }
        )
        
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        type_garde_nom = type_garde.get("nom", "une garde") if type_garde else "une garde"
        
        for remplacant_id in remplacant_ids:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": remplacant_id,
                "type": "remplacement_proposition",
                "titre": "🚨 Demande de remplacement urgente",
                "message": f"{demandeur_nom} cherche un remplaçant pour {type_garde_nom} le {demande_data['date']}. Répondez rapidement !",
                "lu": False,
                "urgent": True,
                "data": {
                    "demande_id": demande_id,
                    "lien": "/remplacements"
                },
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        
        for remplacant in remplacants_a_contacter:
            try:
                token = await generer_token_remplacement(demande_id, remplacant["user_id"], tenant_id)
                await envoyer_email_remplacement(
                    demande_data=demande_data,
                    remplacant=remplacant,
                    demandeur=demandeur,
                    type_garde=type_garde,
                    tenant_id=tenant_id,
                    token=token
                )
            except Exception as email_error:
                logger.error(f"Erreur envoi email à {remplacant['nom_complet']}: {email_error}")
        
        logger.info(f"✅ Recherche lancée pour demande {demande_id}: {nombre_a_contacter} remplaçant(s) contacté(s)")
        
    except Exception as e:
        logger.error(f"❌ Erreur lors du lancement de la recherche de remplaçant: {e}", exc_info=True)


async def accepter_remplacement(demande_id: str, remplacant_id: str, tenant_id: str):
    """Traite l'acceptation d'un remplacement par un remplaçant"""
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if demande_data["statut"] != "en_cours":
            raise HTTPException(status_code=400, detail="Cette demande n'est plus disponible")
        
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à accepter cette demande")
        
        remplacant = await db.users.find_one({"id": remplacant_id, "tenant_id": tenant_id})
        if not remplacant:
            raise HTTPException(status_code=404, detail="Remplaçant non trouvé")
        
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "accepte",
                    "remplacant_id": remplacant_id,
                    "updated_at": maintenant
                }
            }
        )
        
        await db.demandes_remplacement.update_one(
            {
                "id": demande_id,
                "tentatives_historique.user_id": remplacant_id
            },
            {
                "$set": {
                    "tentatives_historique.$.statut": "accepted",
                    "tentatives_historique.$.date_reponse": maintenant.isoformat()
                }
            }
        )
        
        assignation = await db.assignations.find_one({
            "tenant_id": tenant_id,
            "user_id": demande_data["demandeur_id"],
            "date": demande_data["date"],
            "type_garde_id": demande_data["type_garde_id"]
        })
        
        if assignation:
            await db.assignations.update_one(
                {"id": assignation["id"]},
                {
                    "$set": {
                        "user_id": remplacant_id,
                        "est_remplacement": True,
                        "demandeur_original_id": demande_data["demandeur_id"],
                        "updated_at": maintenant
                    }
                }
            )
            logger.info(f"✅ Planning mis à jour: {remplacant['prenom']} {remplacant['nom']} remplace assignation {assignation['id']}")
        else:
            logger.warning(f"⚠️ Aucune assignation trouvée pour le demandeur {demande_data['demandeur_id']} le {demande_data['date']}")
        
        demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
        await send_push_notification_to_users(
            user_ids=[demande_data["demandeur_id"]],
            title="✅ Remplacement trouvé!",
            body=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepté de vous remplacer le {demande_data['date']}",
            data={
                "type": "remplacement_accepte",
                "demande_id": demande_id,
                "remplacant_id": remplacant_id
            }
        )
        
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "user_id": demande_data["demandeur_id"],
            "type": "remplacement_accepte",
            "titre": "✅ Remplacement trouvé!",
            "message": f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepté de vous remplacer le {demande_data['date']}.",
            "lu": False,
            "data": {"demande_id": demande_id, "remplacant_id": remplacant_id},
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        superviseurs = await db.users.find({
            "tenant_id": tenant_id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = [s["id"] for s in superviseurs]
        if superviseur_ids:
            await send_push_notification_to_users(
                user_ids=superviseur_ids,
                title="✅ Remplacement confirmé",
                body=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} remplace {demandeur.get('prenom', '')} {demandeur.get('nom', '')} le {demande_data['date']}",
                data={
                    "type": "remplacement_accepte",
                    "demande_id": demande_id
                }
            )
        
        autres_remplacants_ids = [
            rid for rid in demande_data.get("remplacants_contactes_ids", [])
            if rid != remplacant_id
        ]
        
        if autres_remplacants_ids:
            await send_push_notification_to_users(
                user_ids=autres_remplacants_ids,
                title="Remplacement pourvu",
                body=f"Le remplacement du {demande_data['date']} a été pourvu par un autre pompier",
                data={
                    "type": "remplacement_pourvu",
                    "demande_id": demande_id
                }
            )
        
        type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant_id})
        garde_nom = type_garde['nom'] if type_garde else 'garde'
        await creer_activite(
            tenant_id=tenant_id,
            type_activite="remplacement_accepte",
            description=f"✅ {remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepté de remplacer {demandeur.get('prenom', '')} {demandeur.get('nom', '')} pour la {garde_nom} du {demande_data['date']}",
            user_id=remplacant_id,
            user_nom=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}"
        )
        
        logger.info(f"✅ Remplacement accepté: demande {demande_id}, remplaçant {remplacant.get('nom', '')}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'acceptation du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de l'acceptation du remplacement")


async def refuser_remplacement(demande_id: str, remplacant_id: str, tenant_id: str):
    """Traite le refus d'un remplacement par un remplaçant"""
    try:
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à refuser cette demande")
        
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {
                "id": demande_id,
                "tentatives_historique.user_id": remplacant_id
            },
            {
                "$set": {
                    "tentatives_historique.$.statut": "refused",
                    "tentatives_historique.$.date_reponse": maintenant.isoformat()
                }
            }
        )
        
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$pull": {"remplacants_contactes_ids": remplacant_id},
                "$set": {"updated_at": maintenant}
            }
        )
        
        demande_updated = await db.demandes_remplacement.find_one({"id": demande_id})
        if not demande_updated.get("remplacants_contactes_ids"):
            logger.info(f"🔄 Tous les remplaçants ont refusé, relance de la recherche pour demande {demande_id}")
            await lancer_recherche_remplacant(demande_id, tenant_id)
        
        logger.info(f"❌ Remplacement refusé par remplaçant {remplacant_id} pour demande {demande_id}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors du refus du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors du refus du remplacement")


async def verifier_et_traiter_timeouts():
    """Fonction appelée périodiquement pour vérifier les demandes en timeout"""
    try:
        maintenant = datetime.now(timezone.utc)
        
        demandes_cursor = db.demandes_remplacement.find({
            "statut": "en_cours",
            "date_prochaine_tentative": {"$lte": maintenant}
        })
        
        demandes_timeout = await demandes_cursor.to_list(length=None)
        
        for demande in demandes_timeout:
            logger.info(f"⏱️ Timeout atteint pour demande {demande['id']}, relance de la recherche")
            
            for remplacant_id in demande.get("remplacants_contactes_ids", []):
                await db.demandes_remplacement.update_one(
                    {
                        "id": demande["id"],
                        "tentatives_historique.user_id": remplacant_id,
                        "tentatives_historique.statut": "contacted"
                    },
                    {
                        "$set": {
                            "tentatives_historique.$.statut": "expired",
                            "tentatives_historique.$.date_reponse": maintenant.isoformat()
                        }
                    }
                )
            
            await db.demandes_remplacement.update_one(
                {"id": demande["id"]},
                {
                    "$set": {
                        "remplacants_contactes_ids": [],
                        "updated_at": maintenant
                    }
                }
            )
            
            await lancer_recherche_remplacant(demande["id"], demande["tenant_id"])
        
        if demandes_timeout:
            logger.info(f"✅ Traité {len(demandes_timeout)} demande(s) en timeout")
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification des timeouts: {e}", exc_info=True)


# ==================== ROUTES API ====================

@router.post("/{tenant_slug}/remplacements", response_model=DemandeRemplacement)
async def create_demande_remplacement(tenant_slug: str, demande: DemandeRemplacementCreate, current_user: User = Depends(get_current_user)):
    """Créer une demande de remplacement et lancer automatiquement la recherche"""
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        priorite = await calculer_priorite_demande(demande.date)
        
        demande_dict = demande.dict()
        demande_dict["tenant_id"] = tenant.id
        demande_dict["demandeur_id"] = current_user.id
        demande_dict["priorite"] = priorite
        demande_dict["statut"] = "en_attente"
        
        demande_obj = DemandeRemplacement(**demande_dict)
        await db.demandes_remplacement.insert_one(demande_obj.dict())
        
        logger.info(f"✅ Demande de remplacement créée: {demande_obj.id} (priorité: {priorite})")
        
        superviseurs_admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = []
        for user in superviseurs_admins:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=user["id"],
                type="remplacement_demande",
                titre=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement en cours",
                message=f"{current_user.prenom} {current_user.nom} cherche un remplaçant pour le {demande.date}",
                lien="/remplacements",
                data={"demande_id": demande_obj.id}
            )
            superviseur_ids.append(user["id"])
        
        if superviseur_ids:
            await send_push_notification_to_users(
                user_ids=superviseur_ids,
                title=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement",
                body=f"{current_user.prenom} {current_user.nom} cherche un remplaçant pour le {demande.date}",
                data={
                    "type": "remplacement_demande",
                    "demande_id": demande_obj.id,
                    "lien": "/remplacements"
                }
            )
        
        await lancer_recherche_remplacant(demande_obj.id, tenant.id)
        
        type_garde = await db.types_garde.find_one({"id": demande.type_garde_id, "tenant_id": tenant.id})
        garde_nom = type_garde['nom'] if type_garde else 'garde'
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="remplacement_demande",
            description=f"🔄 {current_user.prenom} {current_user.nom} cherche un remplaçant pour la {garde_nom} du {demande.date}",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}"
        )
        
        cleaned_demande = clean_mongo_doc(demande_obj.dict())
        return DemandeRemplacement(**cleaned_demande)
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la création de la demande de remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la demande")


@router.get("/{tenant_slug}/remplacements/export-pdf")
async def export_remplacements_pdf(
    tenant_slug: str,
    user_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Export des demandes de remplacement en PDF"""
    try:
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER
        from io import BytesIO
        
        # Import des helpers PDF depuis server
        import server
        create_branded_pdf = server.create_branded_pdf
        get_modern_pdf_styles = server.get_modern_pdf_styles
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        if user_id:
            demandes_list = await db.demandes_remplacement.find({
                "tenant_id": tenant.id,
                "demandeur_id": user_id
            }).to_list(length=None)
        else:
            if current_user.role == "employe":
                demandes_list = await db.demandes_remplacement.find({
                    "tenant_id": tenant.id,
                    "demandeur_id": current_user.id
                }).to_list(length=None)
            else:
                demandes_list = await db.demandes_remplacement.find({
                    "tenant_id": tenant.id
                }).to_list(length=None)
        
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        
        users_map = {u['id']: u for u in users_list}
        types_map = {t['id']: t for t in types_garde_list}
        
        buffer, doc, elements = create_branded_pdf(tenant, pagesize=landscape(letter))
        styles = getSampleStyleSheet()
        modern_styles = get_modern_pdf_styles(styles)
        
        titre = "Demandes de Remplacement"
        if user_id and user_id in users_map:
            titre = f"Demandes de {users_map[user_id]['prenom']} {users_map[user_id]['nom']}"
        
        elements.append(Paragraph(titre, modern_styles['title']))
        elements.append(Spacer(1, 0.3*inch))
        
        table_data = [['Date', 'Type Garde', 'Demandeur', 'Statut', 'Priorité', 'Remplaçant', 'Notes']]
        
        for demande in sorted(demandes_list, key=lambda x: x.get('date', ''), reverse=True):
            demandeur = users_map.get(demande['demandeur_id'], {})
            demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "N/A"
            
            type_garde = types_map.get(demande.get('type_garde_id', ''), {})
            type_nom = type_garde.get('nom', 'N/A')
            
            statut_labels = {
                'en_attente': 'En attente',
                'en_cours': 'En cours',
                'accepte': 'Accepté',
                'expiree': 'Expirée',
                'annulee': 'Annulée',
                'approuve_manuellement': 'Approuvé'
            }
            statut = statut_labels.get(demande.get('statut', ''), demande.get('statut', ''))
            
            priorite = 'Urgent' if demande.get('priorite') == 'urgent' else 'Normal'
            
            remplacant = users_map.get(demande.get('remplacant_id', ''), {})
            remplacant_nom = f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}" if remplacant else "-"
            
            table_data.append([
                demande.get('date', ''),
                type_nom,
                demandeur_nom,
                statut,
                priorite,
                remplacant_nom,
                demande.get('raison', '')[:30] + '...' if len(demande.get('raison', '')) > 30 else demande.get('raison', '')
            ])
        
        table = Table(table_data, repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')])
        ]))
        elements.append(table)
        
        doc.build(elements)
        buffer.seek(0)
        
        filename = f"remplacements_{tenant_slug}_{datetime.now().strftime('%Y%m%d')}.pdf"
        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Erreur export PDF remplacements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur export PDF: {str(e)}")


@router.get("/{tenant_slug}/remplacements/export-excel")
async def export_remplacements_excel(
    tenant_slug: str,
    user_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Export des demandes de remplacement en Excel"""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from io import BytesIO
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        if user_id:
            demandes_list = await db.demandes_remplacement.find({
                "tenant_id": tenant.id,
                "demandeur_id": user_id
            }).to_list(length=None)
        else:
            if current_user.role == "employe":
                demandes_list = await db.demandes_remplacement.find({
                    "tenant_id": tenant.id,
                    "demandeur_id": current_user.id
                }).to_list(length=None)
            else:
                demandes_list = await db.demandes_remplacement.find({
                    "tenant_id": tenant.id
                }).to_list(length=None)
        
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        
        users_map = {u['id']: u for u in users_list}
        types_map = {t['id']: t for t in types_garde_list}
        
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Remplacements"
        
        header_fill = PatternFill(start_color="1E3A5F", end_color="1E3A5F", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        thin_border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        
        headers = ['Date', 'Type Garde', 'Demandeur', 'Statut', 'Priorité', 'Remplaçant', 'Raison', 'Créé le']
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')
            cell.border = thin_border
        
        for row, demande in enumerate(sorted(demandes_list, key=lambda x: x.get('date', ''), reverse=True), 2):
            demandeur = users_map.get(demande['demandeur_id'], {})
            type_garde = types_map.get(demande.get('type_garde_id', ''), {})
            remplacant = users_map.get(demande.get('remplacant_id', ''), {})
            
            statut_labels = {
                'en_attente': 'En attente',
                'en_cours': 'En cours',
                'accepte': 'Accepté',
                'expiree': 'Expirée',
                'annulee': 'Annulée',
                'approuve_manuellement': 'Approuvé'
            }
            
            data = [
                demande.get('date', ''),
                type_garde.get('nom', 'N/A'),
                f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}",
                statut_labels.get(demande.get('statut', ''), demande.get('statut', '')),
                'Urgent' if demande.get('priorite') == 'urgent' else 'Normal',
                f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}" if remplacant else "-",
                demande.get('raison', ''),
                str(demande.get('created_at', ''))[:10]
            ]
            
            for col, value in enumerate(data, 1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.border = thin_border
                cell.alignment = Alignment(horizontal='center')
        
        for column_cells in ws.columns:
            length = max(len(str(cell.value or '')) for cell in column_cells)
            ws.column_dimensions[column_cells[0].column_letter].width = min(length + 2, 50)
        
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        
        filename = f"remplacements_{tenant_slug}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        logger.error(f"Erreur export Excel remplacements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur export Excel: {str(e)}")


@router.get("/{tenant_slug}/remplacements", response_model=List[DemandeRemplacement])
async def get_demandes_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Liste des demandes de remplacement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role == "employe":
        demandes = await db.demandes_remplacement.find({
            "tenant_id": tenant.id,
            "demandeur_id": current_user.id
        }).to_list(1000)
    else:
        demandes = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
    
    cleaned_demandes = [clean_mongo_doc(demande) for demande in demandes]
    return [DemandeRemplacement(**demande) for demande in cleaned_demandes]


@router.get("/{tenant_slug}/remplacements/propositions")
async def get_propositions_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les propositions de remplacement pour l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demandes = await db.demandes_remplacement.find({
        "tenant_id": tenant.id,
        "statut": "en_cours",
        "remplacants_contactes_ids": current_user.id
    }).to_list(1000)
    
    propositions = []
    for demande in demandes:
        demandeur = await db.users.find_one({"id": demande["demandeur_id"]})
        type_garde = await db.types_garde.find_one({"id": demande["type_garde_id"]})
        
        demande["demandeur"] = {
            "nom": demandeur.get("nom", ""),
            "prenom": demandeur.get("prenom", ""),
            "email": demandeur.get("email", "")
        } if demandeur else None
        
        demande["type_garde"] = {
            "nom": type_garde.get("nom", ""),
            "heure_debut": type_garde.get("heure_debut", ""),
            "heure_fin": type_garde.get("heure_fin", "")
        } if type_garde else None
        
        propositions.append(clean_mongo_doc(demande))
    
    return propositions


@router.put("/{tenant_slug}/remplacements/{demande_id}/accepter")
async def accepter_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Accepter/Approuver manuellement une demande de remplacement"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    if current_user.role in ["admin", "superviseur"]:
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "approuve_manuellement",
                    "approuve_par_id": current_user.id,
                    "date_approbation": maintenant.isoformat(),
                    "updated_at": maintenant
                }
            }
        )
        
        demandeur_id = demande_data.get("demandeur_id")
        if demandeur_id:
            await send_push_notification_to_users(
                user_ids=[demandeur_id],
                title="✅ Demande approuvée",
                body=f"Votre demande de remplacement du {demande_data['date']} a été approuvée par un superviseur.",
                data={
                    "type": "remplacement_approuve",
                    "demande_id": demande_id
                }
            )
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "user_id": demandeur_id,
                "type": "remplacement_approuve",
                "titre": "✅ Demande approuvée",
                "message": f"Votre demande de remplacement du {demande_data['date']} a été approuvée.",
                "lu": False,
                "data": {"demande_id": demande_id},
                "created_at": maintenant.isoformat()
            })
        
        return {
            "message": "Demande approuvée avec succès",
            "demande_id": demande_id
        }
    else:
        await accepter_remplacement(demande_id, current_user.id, tenant.id)
        
        return {
            "message": "Remplacement accepté avec succès",
            "demande_id": demande_id
        }


@router.put("/{tenant_slug}/remplacements/{demande_id}/refuser")
async def refuser_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Refuser/Annuler une demande de remplacement"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    if current_user.role in ["admin", "superviseur"]:
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "annulee",
                    "annule_par_id": current_user.id,
                    "date_annulation": maintenant.isoformat(),
                    "updated_at": maintenant
                }
            }
        )
        
        demandeur_id = demande_data.get("demandeur_id")
        if demandeur_id:
            await send_push_notification_to_users(
                user_ids=[demandeur_id],
                title="❌ Demande annulée",
                body=f"Votre demande de remplacement du {demande_data['date']} a été annulée par un superviseur.",
                data={
                    "type": "remplacement_annulee",
                    "demande_id": demande_id
                }
            )
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "user_id": demandeur_id,
                "type": "remplacement_annulee",
                "titre": "❌ Demande annulée",
                "message": f"Votre demande de remplacement du {demande_data['date']} a été annulée.",
                "lu": False,
                "data": {"demande_id": demande_id},
                "created_at": maintenant.isoformat()
            })
        
        return {
            "message": "Demande annulée avec succès",
            "demande_id": demande_id
        }
    else:
        await refuser_remplacement(demande_id, current_user.id, tenant.id)
        
        return {
            "message": "Remplacement refusé",
            "demande_id": demande_id
        }


@router.get("/remplacement-action/{token}/{action}")
async def action_remplacement_via_email(token: str, action: str):
    """Traite une action de remplacement via le lien email"""
    frontend_url = os.environ.get('FRONTEND_URL', 'https://ems-dispatcher.preview.emergentagent.com')
    
    try:
        token_data = await db.tokens_remplacement.find_one({"token": token})
        
        if not token_data:
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Lien invalide ou expiré",
                status_code=302
            )
        
        expiration = datetime.fromisoformat(token_data["expiration"].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expiration:
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Ce lien a expiré",
                status_code=302
            )
        
        if token_data.get("utilise"):
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=info&message=Cette action a déjà été traitée",
                status_code=302
            )
        
        demande_id = token_data["demande_id"]
        remplacant_id = token_data["remplacant_id"]
        tenant_id = token_data["tenant_id"]
        
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Demande non trouvée",
                status_code=302
            )
        
        if demande_data["statut"] not in ["en_cours", "en_attente"]:
            status_label = {
                "accepte": "déjà acceptée",
                "expiree": "expirée",
                "annulee": "annulée",
                "approuve_manuellement": "déjà approuvée"
            }.get(demande_data["statut"], demande_data["statut"])
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=info&message=Cette demande est {status_label}",
                status_code=302
            )
        
        await db.tokens_remplacement.update_one(
            {"token": token},
            {"$set": {"utilise": True, "action": action, "date_utilisation": datetime.now(timezone.utc).isoformat()}}
        )
        
        if action == "accepter":
            try:
                await accepter_remplacement(demande_id, remplacant_id, tenant_id)
                
                demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
                demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "le demandeur"
                
                return RedirectResponse(
                    url=f"{frontend_url}/remplacement-resultat?status=succes&message=Vous avez accepté le remplacement de {demandeur_nom} le {demande_data['date']}",
                    status_code=302
                )
            except Exception as e:
                logger.error(f"Erreur acceptation via email: {e}")
                return RedirectResponse(
                    url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Erreur lors de l'acceptation",
                    status_code=302
                )
        
        elif action == "refuser":
            try:
                await refuser_remplacement(demande_id, remplacant_id, tenant_id)
                
                return RedirectResponse(
                    url=f"{frontend_url}/remplacement-resultat?status=info&message=Vous avez refusé cette demande de remplacement",
                    status_code=302
                )
            except Exception as e:
                logger.error(f"Erreur refus via email: {e}")
                return RedirectResponse(
                    url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Erreur lors du refus",
                    status_code=302
                )
        
        else:
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Action non reconnue",
                status_code=302
            )
            
    except Exception as e:
        logger.error(f"Erreur traitement action email: {e}", exc_info=True)
        return RedirectResponse(
            url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Une erreur est survenue",
            status_code=302
        )


@router.delete("/{tenant_slug}/remplacements/{demande_id}")
async def annuler_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Annuler une demande de remplacement (seulement par le demandeur)"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    if demande["demandeur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Seul le demandeur peut annuler la demande")
    
    if demande["statut"] == "accepte":
        raise HTTPException(status_code=400, detail="Impossible d'annuler une demande déjà acceptée")
    
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "annulee",
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    if demande.get("remplacants_contactes_ids"):
        await send_push_notification_to_users(
            user_ids=demande["remplacants_contactes_ids"],
            title="Demande annulée",
            body=f"La demande de remplacement du {demande['date']} a été annulée",
            data={
                "type": "remplacement_annulee",
                "demande_id": demande_id
            }
        )
    
    logger.info(f"✅ Demande de remplacement annulée: {demande_id}")
    
    return {
        "message": "Demande annulée avec succès",
        "demande_id": demande_id
    }


# ==================== PARAMÈTRES REMPLACEMENTS ====================

@router.get("/{tenant_slug}/parametres/remplacements")
async def get_parametres_remplacements(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres de remplacements"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    
    if not parametres:
        default_params = ParametresRemplacements(tenant_id=tenant.id)
        await db.parametres_remplacements.insert_one(default_params.dict())
        return default_params
    
    cleaned_params = clean_mongo_doc(parametres)
    return cleaned_params


@router.put("/{tenant_slug}/parametres/remplacements")
async def update_parametres_remplacements(
    tenant_slug: str,
    parametres_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres de remplacements"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    existing = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    
    parametres_data["tenant_id"] = tenant.id
    
    if existing:
        await db.parametres_remplacements.update_one(
            {"tenant_id": tenant.id},
            {"$set": parametres_data}
        )
    else:
        if "id" not in parametres_data:
            parametres_data["id"] = str(uuid.uuid4())
        await db.parametres_remplacements.insert_one(parametres_data)
    
    return {"message": "Paramètres mis à jour avec succès"}
