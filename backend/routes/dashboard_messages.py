"""
Routes API pour les Messages Importants du Dashboard
====================================================

STATUT: ACTIF
Ce module gère les messages importants affichés sur le tableau de bord.

Routes:
- POST   /{tenant_slug}/dashboard/messages              - Créer un message important
- GET    /{tenant_slug}/dashboard/messages              - Liste des messages importants
- DELETE /{tenant_slug}/dashboard/messages/{message_id} - Supprimer un message
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Dashboard Messages"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class MessageImportant(BaseModel):
    """Message important affiché sur le dashboard"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    titre: str
    contenu: str
    type_message: str = "info"  # info, warning, danger, success
    date_expiration: Optional[str] = None  # Date après laquelle le message n'est plus affiché
    auteur_id: str = ""
    auteur_nom: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MessageImportantCreate(BaseModel):
    titre: str
    contenu: str
    type_message: str = "info"
    date_expiration: Optional[str] = None


# ==================== ROUTES ====================

@router.post("/{tenant_slug}/dashboard/messages")
async def create_message_important(
    tenant_slug: str,
    message: MessageImportantCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau message important sur le dashboard"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    message_dict = message.dict()
    message_dict["tenant_id"] = tenant.id
    message_dict["auteur_id"] = current_user.id
    message_dict["auteur_nom"] = f"{current_user.prenom} {current_user.nom}"
    
    message_obj = MessageImportant(**message_dict)
    await db.messages_importants.insert_one(message_obj.dict())
    
    logger.info(f"📢 Nouveau message important créé par {current_user.email}: {message.titre}")
    
    return clean_mongo_doc(message_obj.dict())


@router.get("/{tenant_slug}/dashboard/messages")
async def get_messages_importants(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère tous les messages importants non expirés"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer messages non expirés
    today = datetime.now(timezone.utc).date().isoformat()
    messages = await db.messages_importants.find({
        "tenant_id": tenant.id,
        "$or": [
            {"date_expiration": None},
            {"date_expiration": {"$gte": today}}
        ]
    }).sort("created_at", -1).to_list(100)
    
    return [clean_mongo_doc(m) for m in messages]


@router.delete("/{tenant_slug}/dashboard/messages/{message_id}")
async def delete_message_important(
    tenant_slug: str,
    message_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un message important"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    result = await db.messages_importants.delete_one({
        "id": message_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Message non trouvé")
    
    logger.info(f"🗑️ Message important supprimé par {current_user.email}")
    
    return {"message": "Message supprimé"}
