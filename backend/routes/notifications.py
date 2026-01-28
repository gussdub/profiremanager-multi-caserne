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

# Firebase pour les notifications push mobiles
import firebase_admin
from firebase_admin import messaging

# Web Push pour les PWA
from pywebpush import webpush, WebPushException

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    Notification,
    User
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
    return [Notification(**notif) for notif in cleaned_notifications]


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
