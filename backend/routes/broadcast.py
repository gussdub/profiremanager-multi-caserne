"""
Routes API pour la diffusion de messages à tout le personnel
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    get_current_user,
    get_tenant_from_slug,
    User,
    db,
    require_permission
)
from services.email_service import send_notification_email

# Import pour les push notifications
try:
    from routes.notifications import send_push_notification_to_users
except ImportError:
    send_push_notification_to_users = None

router = APIRouter()
logger = logging.getLogger(__name__)


class BroadcastMessageCreate(BaseModel):
    """Modèle pour créer un message de diffusion"""
    contenu: str
    priorite: str = "normal"  # normal, important, urgent


class BroadcastMessageResponse(BaseModel):
    """Modèle de réponse pour un message de diffusion"""
    id: str
    contenu: str
    priorite: str
    auteur_id: str
    auteur_nom: str
    date_publication: str
    lu_par: List[str] = []


@router.post("/{tenant_slug}/broadcast/publier")
async def publier_message(
    tenant_slug: str,
    message: BroadcastMessageCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Publie un message à tout le personnel actif.
    Réservé aux admins et superviseurs.
    Envoie une notification et un email à tous les utilisateurs actifs.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    # Vérifier les permissions RBAC - permission de modifier les paramètres = droit de diffuser
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    # Créer le message
    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    broadcast_doc = {
        "id": message_id,
        "tenant_id": tenant.id,
        "contenu": message.contenu,
        "priorite": message.priorite,
        "auteur_id": current_user.id,
        "auteur_nom": f"{current_user.prenom} {current_user.nom}",
        "date_publication": now.isoformat(),
        "lu_par": [],
        "actif": True
    }
    
    # Désactiver les anciens messages actifs
    await db.broadcast_messages.update_many(
        {"tenant_id": tenant.id, "actif": True},
        {"$set": {"actif": False}}
    )
    
    # Insérer le nouveau message
    await db.broadcast_messages.insert_one(broadcast_doc)
    
    # Récupérer tous les utilisateurs actifs du tenant
    users_actifs = await db.users.find({
        "tenant_id": tenant.id,
        "statut": "Actif"
    }).to_list(None)
    
    # Préparer le sujet de l'email selon la priorité
    priorite_labels = {
        "normal": "📢 Nouveau message",
        "important": "⚠️ Message IMPORTANT",
        "urgent": "🚨 Message URGENT"
    }
    sujet = f"{priorite_labels.get(message.priorite, '📢 Nouveau message')} - {tenant.nom}"
    
    # Couleur selon priorité pour l'email
    priorite_colors = {
        "normal": "#3B82F6",
        "important": "#F59E0B",
        "urgent": "#EF4444"
    }
    color = priorite_colors.get(message.priorite, "#3B82F6")
    
    # Envoyer les notifications et emails
    emails_envoyes = 0
    notifications_creees = 0
    user_ids = []  # Pour les push notifications

    for user in users_actifs:
        user_ids.append(user.get("id"))
        # Créer une notification in-app
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "user_id": user.get("id"),
            "type": "broadcast",
            "titre": priorite_labels.get(message.priorite, "Nouveau message"),
            "message": message.contenu[:100] + "..." if len(message.contenu) > 100 else message.contenu,
            "broadcast_id": message_id,
            "priorite": message.priorite,
            "lu": False,
            "date_creation": now.isoformat()
        }
        await db.notifications.insert_one(notification)
        notifications_creees += 1
        
        # Envoyer un email si l'utilisateur a un email
        user_email = user.get("email")
        if user_email:
            try:
                await send_notification_email(
                    to_email=user_email,
                    subject=sujet,
                    notification_titre=priorite_labels.get(message.priorite, "Nouveau message"),
                    notification_message=message.contenu,
                    user_prenom=user.get("prenom"),
                    tenant_slug=tenant_slug
                )
                emails_envoyes += 1
            except Exception as e:
                logger.error(f"Erreur envoi email à {user_email}: {e}")
    
    logger.info(f"Message broadcast publié: {notifications_creees} notifications, {emails_envoyes} emails")
    
    # Envoyer push notifications à tous les destinataires
    if send_push_notification_to_users and user_ids:
        try:
            push_data = {
                "type": "broadcast",
                "broadcast_id": message_id,
                "priorite": message.priorite,
                "tenant": tenant_slug
            }
            await send_push_notification_to_users(
                user_ids=user_ids,
                title=priorite_labels.get(message.priorite, "Nouveau message"),
                body=message.contenu[:100] + "..." if len(message.contenu) > 100 else message.contenu,
                data=push_data,
                tenant_slug=tenant_slug
            )
            logger.info(f"📱 Push notifications broadcast envoyées à {len(user_ids)} utilisateurs")
        except Exception as e:
            logger.warning(f"Erreur envoi push broadcast: {e}")
    
    return {
        "success": True,
        "message_id": message_id,
        "notifications_envoyees": notifications_creees,
        "emails_envoyes": emails_envoyes
    }


@router.get("/{tenant_slug}/broadcast/actif")
async def get_message_actif(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère le message de diffusion actif pour le tenant.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    message = await db.broadcast_messages.find_one(
        {"tenant_id": tenant.id, "actif": True},
        {"_id": 0}
    )
    
    if not message:
        return {"message": None}
    
    # Vérifier si l'utilisateur a lu le message
    est_lu = current_user.id in message.get("lu_par", [])
    
    return {
        "message": {
            "id": message["id"],
            "contenu": message["contenu"],
            "priorite": message["priorite"],
            "auteur_nom": message["auteur_nom"],
            "date_publication": message["date_publication"],
            "est_lu": est_lu
        }
    }


@router.put("/{tenant_slug}/broadcast/{message_id}/marquer-lu")
async def marquer_message_lu(
    tenant_slug: str,
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Marque un message comme lu par l'utilisateur courant.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.broadcast_messages.update_one(
        {"id": message_id, "tenant_id": tenant.id},
        {"$addToSet": {"lu_par": current_user.id}}
    )
    
    if result.modified_count == 0:
        # Peut-être déjà marqué comme lu
        pass
    
    # Marquer aussi la notification comme lue
    await db.notifications.update_one(
        {
            "user_id": current_user.id,
            "broadcast_id": message_id
        },
        {"$set": {"lu": True}}
    )
    
    return {"success": True}


@router.delete("/{tenant_slug}/broadcast/{message_id}")
async def supprimer_message(
    tenant_slug: str,
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime/désactive un message de diffusion.
    Réservé aux admins et superviseurs.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "parametres", "supprimer")
    
    await db.broadcast_messages.update_one(
        {"id": message_id, "tenant_id": tenant.id},
        {"$set": {"actif": False}}
    )
    
    return {"success": True}
