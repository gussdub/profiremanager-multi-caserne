"""
Routes API pour le module Paramètres Disponibilités
===================================================

STATUT: ACTIF
Ce module gère les paramètres de disponibilités et les rappels automatiques.

Routes principales:
- GET    /{tenant_slug}/parametres/disponibilites              - Récupérer les paramètres
- PUT    /{tenant_slug}/parametres/disponibilites              - Modifier les paramètres
- POST   /{tenant_slug}/disponibilites/envoyer-rappels         - Déclencher les rappels manuellement
- GET    /{tenant_slug}/parametres/validation-planning         - Paramètres validation planning
- PUT    /{tenant_slug}/parametres/validation-planning         - Modifier paramètres validation
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, date, timedelta
import uuid
import logging
import os

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Paramètres Disponibilités"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class ParametresValidationPlanning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    frequence: str = "mensuel"  # mensuel, bimensuel, hebdomadaire
    jour_envoi: int = 25  # Jour du mois pour l'envoi
    heure_envoi: str = "17:00"
    periode_couverte: str = "mois_suivant"  # mois_suivant, 2_semaines
    envoi_automatique: bool = True
    derniere_notification: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== FONCTIONS HELPER ====================

async def get_send_push_notification():
    """Récupère la fonction send_push_notification_to_users depuis server.py"""
    try:
        import server
        return server.send_push_notification_to_users
    except:
        async def noop(*args, **kwargs):
            logger.warning("send_push_notification_to_users non disponible")
        return noop


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/parametres/validation-planning")
async def get_parametres_validation_planning(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres de validation/notification du planning"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_validation_planning.find_one({"tenant_id": tenant.id})
    
    if not params:
        # Créer paramètres par défaut
        default_params = ParametresValidationPlanning(
            tenant_id=tenant.id,
            frequence="mensuel",
            jour_envoi=25,
            heure_envoi="17:00",
            periode_couverte="mois_suivant",
            envoi_automatique=True,
            derniere_notification=None
        )
        await db.parametres_validation_planning.insert_one(default_params.dict())
        params = default_params.dict()
    
    return clean_mongo_doc(params)


@router.put("/{tenant_slug}/parametres/validation-planning")
async def update_parametres_validation_planning(
    tenant_slug: str,
    params: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres de validation/notification du planning"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Valider les données
    if params.get("jour_envoi") and (params["jour_envoi"] < 1 or params["jour_envoi"] > 28):
        raise HTTPException(status_code=400, detail="Le jour d'envoi doit être entre 1 et 28")
    
    # Vérifier si paramètres existent
    existing = await db.parametres_validation_planning.find_one({"tenant_id": tenant.id})
    
    if existing:
        # Mettre à jour
        await db.parametres_validation_planning.update_one(
            {"tenant_id": tenant.id},
            {"$set": {**params, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
    else:
        # Créer
        new_params = ParametresValidationPlanning(
            tenant_id=tenant.id,
            **params
        )
        await db.parametres_validation_planning.insert_one(new_params.dict())
    
    # Si les notifications automatiques ont été activées, redémarrer le scheduler
    if params.get("envoi_automatique"):
        logger.info(f"Notifications automatiques activées pour {tenant.nom}")
    
    return {"message": "Paramètres mis à jour avec succès"}


@router.get("/{tenant_slug}/parametres/disponibilites")
async def get_parametres_disponibilites(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres disponibilités"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_disponibilites.find_one({"tenant_id": tenant.id})
    
    if not params:
        # Créer paramètres par défaut
        default_params = {
            "tenant_id": tenant.id,
            "blocage_dispos_active": False,
            "jour_blocage_dispos": 15,
            "exceptions_admin_superviseur": True,
            "admin_peut_modifier_temps_partiel": True,
            "notifications_dispos_actives": True,
            "jours_avance_notification": 3
        }
        await db.parametres_disponibilites.insert_one(default_params)
        return default_params
    
    return clean_mongo_doc(params)


@router.put("/{tenant_slug}/parametres/disponibilites")
async def update_parametres_disponibilites(
    tenant_slug: str,
    params: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres disponibilités"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.parametres_disponibilites.update_one(
        {"tenant_id": tenant.id},
        {"$set": params},
        upsert=True
    )
    
    return {"message": "Paramètres disponibilités mis à jour"}


@router.post("/{tenant_slug}/disponibilites/envoyer-rappels")
async def trigger_rappels_disponibilites(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint admin pour déclencher manuellement l'envoi des rappels de disponibilités.
    Utile pour tester le système sans attendre le job planifié.
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les paramètres
    params = await db.parametres_disponibilites.find_one({"tenant_id": tenant.id})
    
    if not params:
        raise HTTPException(status_code=400, detail="Paramètres de disponibilités non configurés")
    
    if not params.get("blocage_dispos_active", False):
        raise HTTPException(status_code=400, detail="Le système de blocage n'est pas activé")
    
    if not params.get("notifications_dispos_actives", True):
        raise HTTPException(status_code=400, detail="Les notifications de disponibilités ne sont pas activées")
    
    # Calculer les dates
    today = datetime.now(timezone.utc).date()
    current_month = today.month
    current_year = today.year
    
    if current_month == 12:
        next_month = 1
        next_month_year = current_year + 1
    else:
        next_month = current_month + 1
        next_month_year = current_year
    
    periode_debut = f"{next_month_year}-{str(next_month).zfill(2)}-01"
    if next_month == 12:
        dernier_jour = date(next_month_year + 1, 1, 1) - timedelta(days=1)
    else:
        dernier_jour = date(next_month_year, next_month + 1, 1) - timedelta(days=1)
    periode_fin = dernier_jour.isoformat()
    
    # Récupérer les employés temps partiel actifs
    users_temps_partiel = await db.users.find({
        "tenant_id": tenant.id,
        "type_emploi": "temps_partiel",
        "statut": "actif"
    }).to_list(None)
    
    if not users_temps_partiel:
        return {
            "message": "Aucun employé temps partiel à notifier",
            "users_notifies": 0,
            "users_deja_complets": 0
        }
    
    # Identifier les employés qui n'ont pas soumis de disponibilités
    users_a_notifier = []
    users_complets = []
    
    for user in users_temps_partiel:
        user_id = user.get("id")
        disponibilites_count = await db.disponibilites.count_documents({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": {"$gte": periode_debut, "$lte": periode_fin}
        })
        
        if disponibilites_count == 0:
            users_a_notifier.append(user)
        else:
            users_complets.append(user)
    
    if not users_a_notifier:
        return {
            "message": "Tous les employés ont déjà soumis leurs disponibilités",
            "users_notifies": 0,
            "users_deja_complets": len(users_complets)
        }
    
    # Envoyer les notifications
    jour_blocage = params.get("jour_blocage_dispos", 15)
    date_blocage = date(current_year, current_month, jour_blocage)
    jours_restants = max(0, (date_blocage - today).days)
    
    mois_noms = ["janvier", "février", "mars", "avril", "mai", "juin", 
                 "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
    mois_suivant_texte = mois_noms[next_month - 1]
    
    titre_notification = "📅 Rappel: Saisissez vos disponibilités"
    message_notification = f"Vous avez jusqu'au {jour_blocage} {mois_noms[current_month - 1]} pour saisir vos disponibilités de {mois_suivant_texte}. Il vous reste {jours_restants} jour(s)."
    
    resend_api_key = os.environ.get("RESEND_API_KEY")
    sender_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@resend.dev")
    app_url = os.environ.get("FRONTEND_URL", os.environ.get("REACT_APP_BACKEND_URL", ""))
    
    notifications_envoyees = 0
    emails_envoyes = 0
    
    for user in users_a_notifier:
        user_id = user.get("id")
        user_email = user.get("email")
        user_prenom = user.get("prenom", "")
        
        # Notification in-app
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "user_id": user_id,
            "type": "rappel_disponibilites",
            "titre": titre_notification,
            "message": message_notification,
            "lu": False,
            "urgent": jours_restants <= 1,
            "data": {
                "lien": "/disponibilites",
                "mois_cible": f"{next_month_year}-{str(next_month).zfill(2)}"
            },
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        notifications_envoyees += 1
        
        # Push notification
        try:
            await send_push_notification_to_users(
                user_ids=[user_id],
                title=titre_notification,
                body=message_notification,
                data={"type": "rappel_disponibilites", "lien": "/disponibilites"}
            )
        except:
            pass
        
        # Email
        if resend_api_key and user_email:
            try:
                import resend
                resend.api_key = resend_api_key
                
                html_content = f"""
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                        .header {{ background-color: #1E40AF; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                        .content {{ background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                        .alert {{ background-color: {'#FEF3C7' if jours_restants > 1 else '#FEE2E2'}; border-left: 4px solid {'#F59E0B' if jours_restants > 1 else '#EF4444'}; padding: 15px; margin: 20px 0; }}
                        .btn {{ display: inline-block; background-color: #1E40AF; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📅 Rappel Disponibilités</h1>
                        </div>
                        <div class="content">
                            <p>Bonjour {user_prenom},</p>
                            <div class="alert">
                                <strong>📢 Rappel</strong><br>
                                Vous n'avez pas encore saisi vos disponibilités pour le mois de <strong>{mois_suivant_texte} {next_month_year}</strong>.
                            </div>
                            <p>La date limite est le <strong>{jour_blocage} {mois_noms[current_month - 1]}</strong>. Il vous reste <strong>{jours_restants} jour(s)</strong>.</p>
                            <center>
                                <a href="{app_url}/disponibilites" class="btn">Saisir mes disponibilités</a>
                            </center>
                        </div>
                    </div>
                </body>
                </html>
                """
                
                resend.Emails.send({
                    "from": f"{tenant.nom} <{sender_email}>",
                    "to": [user_email],
                    "subject": f"Rappel - Saisissez vos disponibilités pour {mois_suivant_texte}",
                    "html": html_content
                })
                emails_envoyes += 1
            except:
                pass
    
    return {
        "message": f"Rappels envoyés avec succès",
        "users_notifies": notifications_envoyees,
        "emails_envoyes": emails_envoyes,
        "users_deja_complets": len(users_complets),
        "periode_cible": f"{mois_suivant_texte} {next_month_year}",
        "jours_restants": jours_restants
    }
