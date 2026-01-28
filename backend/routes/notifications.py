"""
Routes API pour les Notifications utilisateur (lecture/comptage)
================================================================

STATUT: ACTIF
Ce module gère les notifications de base (liste, comptage, marquage lu).
Note: Les notifications Push sont gérées séparément dans server.py.

Routes:
- GET /{tenant_slug}/notifications                            - Liste des notifications
- GET /{tenant_slug}/notifications/non-lues/count            - Compteur non lues
- PUT /{tenant_slug}/notifications/{notification_id}/marquer-lu - Marquer une notification lue
- PUT /{tenant_slug}/notifications/marquer-toutes-lues       - Marquer toutes lues
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import List
from datetime import datetime, timezone
import logging

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
