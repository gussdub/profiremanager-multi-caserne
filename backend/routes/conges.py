"""
Routes API pour les Demandes de Congé
=====================================

STATUT: ACTIF
Ce module gère les demandes de congé des employés.

Routes:
- POST /{tenant_slug}/demandes-conge                    - Créer une demande de congé
- GET  /{tenant_slug}/demandes-conge                    - Liste des demandes de congé
- PUT  /{tenant_slug}/demandes-conge/{demande_id}/approuver - Approuver/Refuser une demande
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
import asyncio

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    creer_notification,
    User,
    envoyer_notification_delegation_debut,
    get_user_responsibilities
)

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_conge_update

router = APIRouter(tags=["Demandes de Congé"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class DemandeCongé(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demandeur_id: str
    type_conge: str  # maladie, vacances, parental, personnel
    date_debut: str  # YYYY-MM-DD
    date_fin: str  # YYYY-MM-DD
    nombre_jours: int = 0
    raison: str = ""
    documents: List[str] = []  # URLs des documents justificatifs
    priorite: str = "normale"  # urgente, haute, normale, faible
    statut: str = "en_attente"  # en_attente, approuve, refuse
    approuve_par: Optional[str] = None  # ID du superviseur/admin qui approuve
    date_approbation: Optional[str] = None
    commentaire_approbation: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DemandeCongeCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    type_conge: str
    date_debut: str
    date_fin: str
    raison: str = ""
    statut: str = "en_attente"


# ==================== ROUTES ====================

@router.post("/{tenant_slug}/demandes-conge", response_model=DemandeCongé)
async def create_demande_conge(
    tenant_slug: str,
    demande: DemandeCongeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle demande de congé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Calculer le nombre de jours
    date_debut = datetime.strptime(demande.date_debut, "%Y-%m-%d")
    date_fin = datetime.strptime(demande.date_fin, "%Y-%m-%d")
    nombre_jours = (date_fin - date_debut).days + 1
    
    demande_dict = demande.dict()
    demande_dict["tenant_id"] = tenant.id
    demande_dict["demandeur_id"] = current_user.id
    demande_dict["nombre_jours"] = nombre_jours
    
    demande_obj = DemandeCongé(**demande_dict)
    await db.demandes_conge.insert_one(demande_obj.dict())
    
    # Créer notification pour approbation - notifier tous les superviseurs/admins sauf le demandeur
    superviseurs_admins = await db.users.find({
        "tenant_id": tenant.id,
        "role": {"$in": ["superviseur", "admin"]},
        "id": {"$ne": current_user.id}  # Exclure le demandeur lui-même
    }).to_list(100)
    
    for superviseur in superviseurs_admins:
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=superviseur["id"],
            type="conge_demande",
            titre="📅 Nouvelle demande de congé",
            message=f"{current_user.prenom} {current_user.nom} demande un congé ({demande.type_conge}) du {demande.date_debut} au {demande.date_fin}",
            lien="/conges",
            data={"demande_id": demande_obj.id}
        )
    
    logger.info(f"📅 Nouvelle demande de congé créée par {current_user.email}: {demande.type_conge} du {demande.date_debut} au {demande.date_fin}")
    
    # Broadcaster la mise à jour
    asyncio.create_task(broadcast_conge_update(tenant.id, "create", {
        "demande_id": demande_obj.id,
        "demandeur": f"{current_user.prenom} {current_user.nom}",
        "type_conge": demande.type_conge,
        "date_debut": demande.date_debut,
        "date_fin": demande.date_fin
    }))
    
    return demande_obj


@router.get("/{tenant_slug}/demandes-conge", response_model=List[DemandeCongé])
async def get_demandes_conge(
    tenant_slug: str,
    statut: str = None,
    date_actuelle: str = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère les demandes de congé selon le rôle de l'utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Construire le filtre de base
    filter_query = {"tenant_id": tenant.id}
    
    if current_user.role == "employe":
        # Employés voient seulement leurs demandes
        filter_query["demandeur_id"] = current_user.id
    
    # Filtrer par statut si spécifié
    if statut:
        filter_query["statut"] = statut
    
    # Filtrer par date actuelle (congés en cours)
    if date_actuelle:
        filter_query["date_debut"] = {"$lte": date_actuelle}
        filter_query["date_fin"] = {"$gte": date_actuelle}
    
    demandes = await db.demandes_conge.find(filter_query).to_list(1000)
    
    cleaned_demandes = [clean_mongo_doc(demande) for demande in demandes]
    return [DemandeCongé(**demande) for demande in cleaned_demandes]


@router.put("/{tenant_slug}/demandes-conge/{demande_id}/approuver")
async def approuver_demande_conge(
    tenant_slug: str,
    demande_id: str,
    action: str,
    commentaire: str = "",
    current_user: User = Depends(get_current_user)
):
    """Approuve ou refuse une demande de congé"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande = await db.demandes_conge.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Empêcher le demandeur d'approuver sa propre demande
    if demande["demandeur_id"] == current_user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas approuver votre propre demande de congé")
    
    # Vérifier les permissions : superviseur peut approuver employés, admin peut tout approuver
    demandeur = await db.users.find_one({"id": demande["demandeur_id"], "tenant_id": tenant.id})
    if current_user.role == "superviseur" and demandeur and demandeur.get("role") != "employe":
        raise HTTPException(status_code=403, detail="Un superviseur ne peut approuver que les demandes d'employés")
    
    statut = "approuve" if action == "approuver" else "refuse"
    
    await db.demandes_conge.update_one(
        {"id": demande_id, "tenant_id": tenant.id},
        {
            "$set": {
                "statut": statut,
                "approuve_par": current_user.id,
                "date_approbation": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "commentaire_approbation": commentaire
            }
        }
    )
    
    # Créer notification pour le demandeur
    if demandeur:
        titre = f"Congé {statut}" if statut == "approuve" else "Congé refusé"
        message = f"Votre demande de congé du {demande['date_debut']} au {demande['date_fin']} a été {statut}e"
        if commentaire:
            message += f". Commentaire: {commentaire}"
        
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=demande["demandeur_id"],
            type=f"conge_{statut}",
            titre=titre,
            message=message,
            lien="/conges",
            data={"demande_id": demande_id}
        )
    
    # Si le congé est approuvé, vérifier si le demandeur a des responsabilités à déléguer
    if statut == "approuve":
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        # Si le congé commence aujourd'hui ou est déjà commencé, déclencher la délégation immédiatement
        if demande["date_debut"] <= today <= demande["date_fin"]:
            responsibilities = await get_user_responsibilities(tenant.id, demande["demandeur_id"])
            if responsibilities:
                # Construire un objet congé avec les infos nécessaires
                conge_obj = {
                    "id": demande_id,
                    "date_debut": demande["date_debut"],
                    "date_fin": demande["date_fin"],
                    "type_conge": demande.get("type_conge")
                }
                await envoyer_notification_delegation_debut(tenant.id, demande["demandeur_id"], conge_obj)
                logger.info(f"📋 Délégation activée pour {demande['demandeur_id']} - {len(responsibilities)} responsabilité(s)")
    
    logger.info(f"📅 Demande de congé {demande_id} {statut}e par {current_user.email}")
    
    return {"message": f"Demande {statut}e avec succès"}
