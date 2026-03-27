"""
Routes API pour les Notifications utilisateur
==============================================

STATUT: ACTIF
Ce module gère toutes les notifications:
- Notifications de base (liste, comptage, marquage lu)
- Push notifications (FCM - Firebase Cloud Messaging)
- Web Push notifications (VAPID)

Routes:
- GET  /{tenant_slug}/notifications                              - Liste des notifications
- GET  /{tenant_slug}/notifications/non-lues/count              - Compteur non lues
- PUT  /{tenant_slug}/notifications/{notification_id}/marquer-lu - Marquer une notification lue
- PUT  /{tenant_slug}/notifications/marquer-toutes-lues         - Marquer toutes lues
- POST /{tenant_slug}/notifications/register-device             - Enregistrer device FCM
- POST /{tenant_slug}/notifications/send                        - Envoyer push FCM
- GET  /{tenant_slug}/notifications/vapid-key                   - Obtenir clé VAPID
- POST /{tenant_slug}/notifications/subscribe                   - S'abonner Web Push
- POST /{tenant_slug}/notifications/unsubscribe                 - Se désabonner Web Push
- POST /{tenant_slug}/notifications/send-web-push               - Envoyer Web Push
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import logging
import uuid
import json
import time
import os
import base64

# Firebase pour les notifications push mobiles (import conditionnel)
try:
    import firebase_admin
    from firebase_admin import messaging
    FIREBASE_AVAILABLE = True
except ImportError:
    firebase_admin = None
    messaging = None
    FIREBASE_AVAILABLE = False

# Vérifier si Firebase est initialisé (appelé dynamiquement)
def is_firebase_enabled():
    if not FIREBASE_AVAILABLE or firebase_admin is None:
        return False
    try:
        firebase_admin.get_app()
        return True
    except ValueError:
        return False

# Note: FIREBASE_ENABLED sera vérifié dynamiquement dans send_push_notification_to_users

# Web Push pour les PWA
from pywebpush import webpush, WebPushException

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    Notification,
    User,
    require_permission
)

router = APIRouter(tags=["Notifications"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class DeviceToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    device_token: str
    platform: str  # "ios" ou "android"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceTokenRegister(BaseModel):
    user_id: str
    device_token: str
    platform: str

class PushNotificationSend(BaseModel):
    user_ids: List[str]
    title: str
    body: str
    data: Optional[dict] = None

class WebPushSubscription(BaseModel):
    user_id: str
    subscription: dict  # {endpoint, keys: {p256dh, auth}}
    platform: str = "web"
    user_agent: Optional[str] = None


# ==================== CONFIGURATION VAPID ====================

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', 
    'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgDXr3Kq0TKQrEV3Rk_FBiYGrPnvKQT3qrF_H3h0sK_0mhRANCAAT5YRwxiCKfb-5mvbU4bN5cVrC9YZh5TvBKQz4TnrpNYqv0s5L0vVsJXZvVQqS_x3N3rVpSqmkDnmr7R_JQKQQE')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY',
    'BPlhHDGIIp9v7ma9tThs3lxWsL1hmHlO8EpDPhOeuk1iq_SzkvS9WwldmVWpL_Hc3etWlKqaQOeavtH8lApBBAQ')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_EMAIL', 'admin@profiremanager.ca')

if VAPID_PUBLIC_KEY:
    logger.info(f"✅ Web Push configuré avec clé VAPID: {VAPID_PUBLIC_KEY[:20]}...")
else:
    logger.warning("⚠️ Web Push désactivé: clés VAPID non configurées")


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/notifications", response_model=List[Notification])
async def get_notifications(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère toutes les notifications de l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    notifications = await db.notifications.find({
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id
    }).sort("date_creation", -1).limit(50).to_list(50)
    
    cleaned_notifications = [clean_mongo_doc(notif) for notif in notifications]
    
    # Filter out invalid notifications (missing required fields)
    valid_notifications = []
    for notif in cleaned_notifications:
        # Ensure required fields exist with defaults if missing
        if "titre" not in notif or not notif["titre"]:
            notif["titre"] = notif.get("type", "Notification")
        if "message" not in notif or not notif["message"]:
            notif["message"] = ""
        try:
            valid_notifications.append(Notification(**notif))
        except Exception as e:
            logger.warning(f"Skipping invalid notification {notif.get('id')}: {e}")
    
    return valid_notifications


@router.get("/{tenant_slug}/notifications/non-lues/count")
async def get_unread_count(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Compte le nombre de notifications non lues"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    count = await db.notifications.count_documents({
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id,
        "statut": "non_lu"
    })
    return {"count": count}


@router.put("/{tenant_slug}/notifications/{notification_id}/marquer-lu")
async def marquer_notification_lue(
    tenant_slug: str,
    notification_id: str,
    current_user: User = Depends(get_current_user)
):
    """Marque une notification comme lue"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    notification = await db.notifications.find_one({
        "id": notification_id,
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id
    })
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification non trouvée")
    
    await db.notifications.update_one(
        {"id": notification_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "lu",
            "date_lecture": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Notification marquée comme lue"}


@router.put("/{tenant_slug}/notifications/marquer-toutes-lues")
async def marquer_toutes_lues(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Marque toutes les notifications comme lues"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.notifications.update_many(
        {
            "tenant_id": tenant.id,
            "destinataire_id": current_user.id,
            "statut": "non_lu"
        },
        {"$set": {
            "statut": "lu",
            "date_lecture": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"🔔 {result.modified_count} notification(s) marquée(s) comme lue(s) pour {current_user.email}")
    
    return {"message": f"{result.modified_count} notification(s) marquée(s) comme lue(s)"}


# ==================== PUSH NOTIFICATIONS (FCM) ====================

@router.post("/{tenant_slug}/notifications/register-device")
async def register_device_token(
    tenant_slug: str,
    device_data: DeviceTokenRegister,
    current_user: User = Depends(get_current_user)
):
    """
    Enregistre un device token pour les notifications push FCM
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur enregistre son propre device
    if current_user.id != device_data.user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Vérifier si un token existe déjà pour cet utilisateur et cette plateforme
        existing = await db.device_tokens.find_one({
            "user_id": device_data.user_id,
            "platform": device_data.platform
        })
        
        if existing:
            # Mettre à jour le token existant
            await db.device_tokens.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "device_token": device_data.device_token,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            message = "Device token mis à jour"
        else:
            # Créer un nouveau token
            new_token = DeviceToken(
                user_id=device_data.user_id,
                device_token=device_data.device_token,
                platform=device_data.platform
            )
            await db.device_tokens.insert_one(new_token.dict())
            message = "Device token enregistré"
        
        return {"message": message, "platform": device_data.platform}
    
    except Exception as e:
        logger.error(f"Erreur lors de l'enregistrement du device token: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


async def send_push_notification_to_users(user_ids: List[str], title: str, body: str, data: Optional[dict] = None, tenant_slug: str = None):
    """
    Helper function pour envoyer des notifications push FCM à plusieurs utilisateurs
    """
    # Vérifier dynamiquement si Firebase est activé
    if not is_firebase_enabled():
        logger.warning("⚠️ Firebase not enabled, skipping push notification")
        return None
    
    try:
        # Récupérer tous les device tokens pour ces utilisateurs
        tokens_cursor = db.device_tokens.find({"user_id": {"$in": user_ids}})
        tokens_list = await tokens_cursor.to_list(length=None)
        
        if not tokens_list:
            logger.info(f"No device tokens found for users: {user_ids}")
            return None
        
        device_tokens = [token["device_token"] for token in tokens_list]
        
        # Ajouter le tenant aux données si fourni
        notification_data = data or {}
        if tenant_slug and "tenant" not in notification_data:
            notification_data["tenant"] = tenant_slug
        
        # Vérifier si c'est une notification urgente (remplacement)
        is_urgent = notification_data.get("sound") == "urgent" or notification_data.get("type") == "remplacement_proposition"
        
        # S'assurer que toutes les valeurs sont des strings (requis par FCM)
        string_data = {k: str(v) if v is not None else "" for k, v in notification_data.items()}
        
        # Configuration Android - Toujours haute priorité pour le son
        android_config = messaging.AndroidConfig(
            priority="high",  # Haute priorité pour garantir la livraison immédiate
            notification=messaging.AndroidNotification(
                sound="default",
                priority="max" if is_urgent else "high",  # Au moins "high" pour le son
                channel_id="urgent_channel" if is_urgent else "default_channel",
                default_sound=True,  # Utiliser le son par défaut du système
                default_vibrate_timings=True  # Activer les vibrations
            )
        )
        
        # Configuration iOS/APNs 
        # Format simple pour garantir le son en arrière-plan
        apns_config = messaging.APNSConfig(
            headers={
                "apns-priority": "10",  # Priorité maximale pour livraison immédiate
                "apns-push-type": "alert"
            },
            payload=messaging.APNSPayload(
                aps=messaging.Aps(
                    alert=messaging.ApsAlert(
                        title=title,
                        body=body
                    ),
                    sound="default",
                    badge=1
                )
            )
        )
        
        # Créer les messages individuels pour chaque token (API v7+)
        messages = [
            messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body
                ),
                data=string_data,
                token=token,
                android=android_config,
                apns=apns_config
            )
            for token in device_tokens
        ]
        
        # Envoyer avec la nouvelle API
        response = messaging.send_each(messages)
        logger.info(f"✅ Push notification sent: {response.success_count} success, {response.failure_count} failures")
        
        # Supprimer les tokens invalides et logger les erreurs
        if response.failure_count > 0:
            failed_tokens = []
            for idx, resp in enumerate(response.responses):
                if not resp.success:
                    failed_tokens.append(device_tokens[idx])
                    logger.error(f"❌ Push failed for token {device_tokens[idx][:20]}...: {resp.exception}")
            
            if failed_tokens:
                await db.device_tokens.delete_many({"device_token": {"$in": failed_tokens}})
                logger.info(f"Removed {len(failed_tokens)} invalid tokens")
        
        return response
    
    except Exception as e:
        logger.error(f"Error sending push notification: {str(e)}")
        return None


@router.post("/{tenant_slug}/notifications/send")
async def send_push_notification(
    tenant_slug: str,
    notification_data: PushNotificationSend,
    current_user: User = Depends(get_current_user)
):
    """
    Envoie une notification push FCM à des utilisateurs spécifiques (Admin/Superviseur uniquement)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions RBAC
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    try:
        response = await send_push_notification_to_users(
            user_ids=notification_data.user_ids,
            title=notification_data.title,
            body=notification_data.body,
            data=notification_data.data
        )
        
        return {
            "message": "Notification envoyée",
            "success_count": response.success_count if response else 0,
            "failure_count": response.failure_count if response else 0
        }
    
    except Exception as e:
        logger.error(f"Erreur lors de l'envoi de la notification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


# ==================== WEB PUSH NOTIFICATIONS (VAPID) ====================

@router.get("/{tenant_slug}/notifications/vapid-key")
async def get_vapid_public_key(tenant_slug: str):
    """
    Retourne la clé publique VAPID pour l'inscription aux notifications push Web
    """
    return {"publicKey": VAPID_PUBLIC_KEY}


@router.post("/{tenant_slug}/notifications/subscribe")
async def subscribe_web_push(
    tenant_slug: str,
    subscription_data: WebPushSubscription,
    current_user: User = Depends(get_current_user)
):
    """
    Enregistre un abonnement Web Push pour un utilisateur
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Vérifier si un abonnement existe déjà pour cet endpoint
        existing = await db.web_push_subscriptions.find_one({
            "subscription.endpoint": subscription_data.subscription.get("endpoint")
        })
        
        if existing:
            # Mettre à jour l'abonnement existant
            await db.web_push_subscriptions.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "user_id": subscription_data.user_id,
                    "subscription": subscription_data.subscription,
                    "user_agent": subscription_data.user_agent,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            return {"message": "Abonnement mis à jour", "status": "updated"}
        else:
            # Créer un nouvel abonnement
            new_sub = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "user_id": subscription_data.user_id,
                "subscription": subscription_data.subscription,
                "platform": subscription_data.platform,
                "user_agent": subscription_data.user_agent,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await db.web_push_subscriptions.insert_one(new_sub)
            return {"message": "Abonnement créé", "status": "created"}
    
    except Exception as e:
        logger.error(f"Erreur inscription Web Push: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{tenant_slug}/notifications/unsubscribe")
async def unsubscribe_web_push(
    tenant_slug: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime un abonnement Web Push
    """
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id requis")
    
    result = await db.web_push_subscriptions.delete_many({"user_id": user_id})
    return {"message": f"{result.deleted_count} abonnement(s) supprimé(s)"}


async def send_web_push_to_users(tenant_id: str, user_ids: List[str], title: str, body: str, data: Optional[dict] = None):
    """
    Envoie une notification Web Push à plusieurs utilisateurs
    Retourne le nombre de succès et d'échecs
    """
    if not VAPID_PRIVATE_KEY:
        logger.warning("Web Push: Clés VAPID non configurées")
        return {"success": 0, "failed": 0}
    
    # Récupérer les abonnements pour ces utilisateurs
    subscriptions = await db.web_push_subscriptions.find({
        "tenant_id": tenant_id,
        "user_id": {"$in": user_ids}
    }).to_list(length=None)
    
    if not subscriptions:
        logger.info(f"Web Push: Aucun abonnement trouvé pour {len(user_ids)} utilisateurs")
        return {"success": 0, "failed": 0}
    
    success_count = 0
    failed_count = 0
    
    # Payload de la notification
    payload = json.dumps({
        "title": title,
        "body": body,
        "icon": "/logo192.png",
        "badge": "/logo192.png",
        "tag": f"profiremanager-{int(time.time())}",
        "data": data or {}
    })
    
    # Envoyer à chaque abonnement
    for sub in subscriptions:
        try:
            webpush(
                subscription_info=sub["subscription"],
                data=payload,
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"}
            )
            success_count += 1
        except WebPushException as e:
            logger.error(f"Web Push échec: {e}")
            # Si l'abonnement est expiré/invalide, le supprimer
            if e.response and e.response.status_code in [404, 410]:
                await db.web_push_subscriptions.delete_one({"_id": sub["_id"]})
            failed_count += 1
        except Exception as e:
            logger.error(f"Web Push erreur: {e}")
            failed_count += 1
    
    logger.info(f"Web Push: {success_count} succès, {failed_count} échecs")
    return {"success": success_count, "failed": failed_count}


@router.post("/{tenant_slug}/notifications/send-web-push")
async def send_web_push_notification(
    tenant_slug: str,
    notification_data: PushNotificationSend,
    current_user: User = Depends(get_current_user)
):
    """
    Envoie une notification Web Push à des utilisateurs spécifiques (Admin/Superviseur)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    result = await send_web_push_to_users(
        tenant_id=tenant.id,
        user_ids=notification_data.user_ids,
        title=notification_data.title,
        body=notification_data.body,
        data=notification_data.data
    )
    
    return {
        "message": "Notifications envoyées",
        "success_count": result["success"],
        "failure_count": result["failed"]
    }
