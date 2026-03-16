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
    get_user_responsibilities,
    require_permission,
    user_has_module_action
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
    # Traçabilité: qui a créé la demande (si différent du demandeur)
    created_by_id: Optional[str] = None
    created_by_nom: Optional[str] = None


class DemandeCongeCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    type_conge: str
    date_debut: str
    date_fin: str
    raison: str = ""
    statut: str = "en_attente"
    # Optionnel: pour créer une demande au nom d'un autre employé (admin uniquement)
    target_user_id: Optional[str] = None


# ==================== ROUTES ====================

@router.post("/{tenant_slug}/demandes-conge", response_model=DemandeCongé)
async def create_demande_conge(
    tenant_slug: str,
    demande: DemandeCongeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle demande de congé.
    
    Si target_user_id est fourni et l'utilisateur courant a la permission 'remplacements.modifier',
    la demande sera créée au nom de l'employé ciblé ET automatiquement approuvée.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Déterminer le demandeur effectif
    demandeur_id = current_user.id
    created_by_id = None
    created_by_nom = None
    auto_approve = False
    
    # Si target_user_id est fourni, vérifier la permission et utiliser cet utilisateur comme demandeur
    if demande.target_user_id and demande.target_user_id != current_user.id:
        # Vérifier que l'utilisateur courant a la permission de créer pour autrui
        can_create_for_others = await user_has_module_action(tenant.id, current_user, "remplacements", "modifier")
        if not can_create_for_others:
            raise HTTPException(
                status_code=403, 
                detail="Vous n'avez pas la permission de créer des demandes de congé pour d'autres employés."
            )
        
        # Vérifier que l'utilisateur cible existe et est actif
        target_user = await db.users.find_one({
            "id": demande.target_user_id, 
            "tenant_id": tenant.id,
            "actif": {"$ne": False}
        })
        if not target_user:
            raise HTTPException(status_code=404, detail="Employé cible non trouvé ou inactif")
        
        demandeur_id = demande.target_user_id
        created_by_id = current_user.id
        created_by_nom = f"{current_user.prenom} {current_user.nom}"
        auto_approve = True  # Les congés créés par un admin pour un autre sont auto-approuvés
        
        logger.info(f"📋 Création de demande de congé pour {target_user.get('prenom')} {target_user.get('nom')} par {current_user.prenom} {current_user.nom}")
    
    # Calculer le nombre de jours
    date_debut = datetime.strptime(demande.date_debut, "%Y-%m-%d")
    date_fin = datetime.strptime(demande.date_fin, "%Y-%m-%d")
    nombre_jours = (date_fin - date_debut).days + 1
    
    demande_dict = demande.dict()
    demande_dict.pop("target_user_id", None)  # Retirer le champ temporaire
    demande_dict["tenant_id"] = tenant.id
    demande_dict["demandeur_id"] = demandeur_id
    demande_dict["nombre_jours"] = nombre_jours
    
    # Ajouter la traçabilité si créé par un autre utilisateur
    if created_by_id:
        demande_dict["created_by_id"] = created_by_id
        demande_dict["created_by_nom"] = created_by_nom
    
    # Auto-approbation si créé par un admin pour un autre employé
    if auto_approve:
        demande_dict["statut"] = "approuve"
        demande_dict["approuve_par"] = current_user.id
        demande_dict["date_approbation"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        demande_dict["commentaire_approbation"] = f"Auto-approuvé (créé par {created_by_nom})"
    
    demande_obj = DemandeCongé(**demande_dict)
    await db.demandes_conge.insert_one(demande_obj.dict())
    
    # Récupérer le nom du demandeur effectif pour les notifications
    if demandeur_id != current_user.id:
        demandeur_user = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant.id})
        demandeur_prenom = demandeur_user.get("prenom", "") if demandeur_user else ""
        demandeur_nom_complet = demandeur_user.get("nom", "") if demandeur_user else ""
    else:
        demandeur_prenom = current_user.prenom
        demandeur_nom_complet = current_user.nom
    
    if auto_approve:
        # Si auto-approuvé, appliquer directement les effets (suppression assignations, etc.)
        # ========== RETIRER LES ASSIGNATIONS DU PLANNING ==========
        deleted_assignations = await db.assignations.delete_many({
            "tenant_id": tenant.id,
            "user_id": demandeur_id,
            "date": {
                "$gte": demande.date_debut,
                "$lte": demande.date_fin
            }
        })
        
        if deleted_assignations.deleted_count > 0:
            logger.info(f"🗑️ {deleted_assignations.deleted_count} assignation(s) supprimée(s) pour {demandeur_id} ({demande.date_debut} → {demande.date_fin})")
            
            # Broadcaster la mise à jour du planning
            from routes.websocket import broadcast_planning_update
            asyncio.create_task(broadcast_planning_update(tenant_slug, "delete", {
                "user_id": demandeur_id,
                "date_debut": demande.date_debut,
                "date_fin": demande.date_fin,
                "raison": "conge_approuve",
                "count": deleted_assignations.deleted_count
            }))
        
        # Notifier l'employé que son congé a été créé et approuvé
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=demandeur_id,
            type="conge_approuve",
            titre="📅 Congé créé et approuvé",
            message=f"Un congé ({demande.type_conge}) du {demande.date_debut} au {demande.date_fin} a été créé pour vous par {created_by_nom}",
            lien="/conges",
            data={"demande_id": demande_obj.id}
        )
        
        logger.info(f"📅 Congé auto-approuvé pour {demandeur_prenom} {demandeur_nom_complet} par {created_by_nom}")
    else:
        # Créer notification pour approbation - notifier tous les superviseurs/admins sauf le demandeur
        superviseurs_admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]},
            "id": {"$ne": demandeur_id}  # Exclure le demandeur lui-même
        }).to_list(100)
        
        for superviseur in superviseurs_admins:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=superviseur["id"],
                type="conge_demande",
                titre="📅 Nouvelle demande de congé",
                message=f"{demandeur_prenom} {demandeur_nom_complet} demande un congé ({demande.type_conge}) du {demande.date_debut} au {demande.date_fin}",
                lien="/conges",
                data={"demande_id": demande_obj.id}
            )
        
        logger.info(f"📅 Nouvelle demande de congé créée par {current_user.email}: {demande.type_conge} du {demande.date_debut} au {demande.date_fin}")
    
    # Broadcaster la mise à jour
    asyncio.create_task(broadcast_conge_update(tenant_slug, "create", {
        "demande_id": demande_obj.id,
        "demandeur": f"{demandeur_prenom} {demandeur_nom_complet}",
        "type_conge": demande.type_conge,
        "date_debut": demande.date_debut,
        "date_fin": demande.date_fin,
        "auto_approuve": auto_approve
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
    
    # RBAC: Vérifier si l'utilisateur peut voir toutes les demandes
    can_view_all = await user_has_module_action(tenant.id, current_user, "remplacements", "voir", "conges")
    if not can_view_all:
        # Utilisateurs sans permission voient seulement leurs demandes
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
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission d'approuver les congés
    await require_permission(tenant.id, current_user, "remplacements", "approuver", "conges")
    
    demande = await db.demandes_conge.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Empêcher le demandeur d'approuver sa propre demande
    if demande["demandeur_id"] == current_user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas approuver votre propre demande de congé")
    
    # Vérifier via RBAC si l'utilisateur peut approuver des demandes d'utilisateurs avec des rôles différents
    demandeur = await db.users.find_one({"id": demande["demandeur_id"], "tenant_id": tenant.id})
    
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
        # ========== RETIRER LES ASSIGNATIONS DU PLANNING ==========
        # Supprimer toutes les assignations de l'employé pendant la période de congé
        date_debut_str = demande["date_debut"]
        date_fin_str = demande["date_fin"]
        
        deleted_assignations = await db.assignations.delete_many({
            "tenant_id": tenant.id,
            "user_id": demande["demandeur_id"],
            "date": {
                "$gte": date_debut_str,
                "$lte": date_fin_str
            }
        })
        
        if deleted_assignations.deleted_count > 0:
            logger.info(f"🗑️ {deleted_assignations.deleted_count} assignation(s) supprimée(s) pour {demande['demandeur_id']} ({date_debut_str} → {date_fin_str})")
            
            # Broadcaster la mise à jour du planning pour que le frontend se rafraîchisse
            from routes.websocket import broadcast_planning_update
            asyncio.create_task(broadcast_planning_update(tenant_slug, "delete", {
                "user_id": demande["demandeur_id"],
                "date_debut": date_debut_str,
                "date_fin": date_fin_str,
                "raison": "conge_approuve",
                "count": deleted_assignations.deleted_count
            }))
        
        # Vérifier les responsabilités à déléguer
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
    
    # Broadcaster la mise à jour
    asyncio.create_task(broadcast_conge_update(tenant_slug, "update", {
        "demande_id": demande_id,
        "statut": statut,
        "approuve_par": f"{current_user.prenom} {current_user.nom}"
    }))
    
    return {"message": f"Demande {statut}e avec succès"}


@router.get("/{tenant_slug}/demandes-conge/{demande_id}/impact-planning")
async def get_impact_planning_conge(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère l'impact de la demande de congé sur le planning.
    Retourne la liste des assignations qui seront supprimées si le congé est approuvé.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de voir les congés
    await require_permission(tenant.id, current_user, "remplacements", "voir", "conges")
    
    demande = await db.demandes_conge.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Récupérer le demandeur
    demandeur = await db.users.find_one({"id": demande["demandeur_id"], "tenant_id": tenant.id})
    demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Inconnu"
    
    # Récupérer les assignations pendant la période de congé
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "user_id": demande["demandeur_id"],
        "date": {
            "$gte": demande["date_debut"],
            "$lte": demande["date_fin"]
        }
    }).to_list(1000)
    
    # Enrichir avec les noms des types de garde
    assignations_enrichies = []
    for assignation in assignations:
        type_garde = await db.types_garde.find_one({"id": assignation.get("type_garde_id"), "tenant_id": tenant.id})
        type_garde_nom = type_garde.get("nom", "Inconnu") if type_garde else "Inconnu"
        
        assignations_enrichies.append({
            "id": assignation.get("id"),
            "date": assignation.get("date"),
            "type_garde_id": assignation.get("type_garde_id"),
            "type_garde_nom": type_garde_nom,
            "debut": assignation.get("debut"),
            "fin": assignation.get("fin")
        })
    
    # Trier par date
    assignations_enrichies.sort(key=lambda x: x["date"])
    
    logger.info(f"📊 Impact planning pour congé {demande_id}: {len(assignations_enrichies)} assignation(s) impactée(s)")
    
    return {
        "demande_id": demande_id,
        "demandeur_id": demande["demandeur_id"],
        "demandeur_nom": demandeur_nom,
        "date_debut": demande["date_debut"],
        "date_fin": demande["date_fin"],
        "nombre_jours": demande.get("nombre_jours", 0),
        "assignations_impactees": assignations_enrichies,
        "total_assignations": len(assignations_enrichies)
    }
