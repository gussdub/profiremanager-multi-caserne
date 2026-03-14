"""
Fonctions de workflow pour le module Remplacements
- Acceptation d'un remplacement
- Refus d'un remplacement
- Gestion des timeouts et pauses silencieuses
"""

from fastapi import HTTPException
from datetime import datetime, timezone
from typing import Optional
import asyncio
import uuid
import logging

from routes.remplacements.utils import est_dans_heures_silencieuses, calculer_prochaine_heure_active

logger = logging.getLogger(__name__)


async def accepter_remplacement_workflow(
    db,
    demande_id: str,
    remplacant_id: str,
    tenant_id: str,
    tenant_slug: str = None,
    creer_notification = None,
    creer_activite = None,
    broadcast_remplacement_update = None,
    send_push_notification_to_users = None,
    envoyer_email_remplacement_trouve = None
):
    """
    Traite l'acceptation d'un remplacement par un remplaçant.
    
    Args:
        db: Instance de la base de données
        demande_id: ID de la demande de remplacement
        remplacant_id: ID du remplaçant qui accepte
        tenant_id: ID du tenant
        tenant_slug: Slug du tenant (optionnel)
        creer_notification: Fonction pour créer une notification
        creer_activite: Fonction pour créer une activité
        broadcast_remplacement_update: Fonction WebSocket broadcast
        send_push_notification_to_users: Fonction pour envoyer des push
        envoyer_email_remplacement_trouve: Fonction pour envoyer email
    
    Returns:
        True si succès
    """
    try:
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
        
        # Mettre à jour le statut de la demande
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
        
        # Mettre à jour l'historique des tentatives
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
        
        # Mettre à jour le planning (remplacer l'assignation)
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
        
        # Notifications au demandeur (non bloquantes)
        if send_push_notification_to_users:
            try:
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
            except Exception as notif_error:
                logger.warning(f"⚠️ Erreur notification push demandeur: {notif_error}")
        
        # Notification in-app au demandeur
        try:
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
        except Exception as notif_error:
            logger.warning(f"⚠️ Erreur insertion notification demandeur: {notif_error}")
        
        # Email au demandeur
        if envoyer_email_remplacement_trouve:
            try:
                tenant = await db.tenants.find_one({"id": tenant_id})
                type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant_id})
                await envoyer_email_remplacement_trouve(
                    demande_data=demande_data,
                    remplacant=remplacant,
                    demandeur=demandeur,
                    type_garde=type_garde,
                    tenant=tenant
                )
            except Exception as email_error:
                logger.warning(f"⚠️ Erreur envoi email remplacement trouvé: {email_error}")
        
        # Notifications aux superviseurs
        superviseurs = await db.users.find({
            "tenant_id": tenant_id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = [s["id"] for s in superviseurs]
        remplacant_nom = f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}"
        demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}"
        
        if superviseur_ids:
            if send_push_notification_to_users:
                try:
                    await send_push_notification_to_users(
                        user_ids=superviseur_ids,
                        title="✅ Remplacement confirmé",
                        body=f"{remplacant_nom} remplace {demandeur_nom} le {demande_data['date']}",
                        data={
                            "type": "remplacement_accepte",
                            "demande_id": demande_id
                        }
                    )
                except Exception as notif_error:
                    logger.warning(f"⚠️ Erreur notification push superviseurs: {notif_error}")
            
            if creer_notification:
                for sup in superviseurs:
                    try:
                        await creer_notification(
                            tenant_id=tenant_id,
                            destinataire_id=sup["id"],
                            type="remplacement_accepte",
                            titre="✅ Remplacement confirmé",
                            message=f"{remplacant_nom} remplace {demandeur_nom} le {demande_data['date']}",
                            lien="/remplacements",
                            data={"demande_id": demande_id},
                            envoyer_email=True
                        )
                    except Exception as notif_error:
                        logger.warning(f"⚠️ Erreur notification superviseur {sup.get('email', '')}: {notif_error}")
        
        # Notifier les autres remplaçants que la demande est pourvue
        autres_remplacants_ids = [
            rid for rid in demande_data.get("remplacants_contactes_ids", [])
            if rid != remplacant_id
        ]
        
        if autres_remplacants_ids and send_push_notification_to_users:
            try:
                await send_push_notification_to_users(
                    user_ids=autres_remplacants_ids,
                    title="Remplacement pourvu",
                    body=f"Le remplacement du {demande_data['date']} a été pourvu par un autre pompier",
                    data={
                        "type": "remplacement_pourvu",
                        "demande_id": demande_id
                    }
                )
            except Exception as notif_error:
                logger.warning(f"⚠️ Erreur notification autres remplaçants: {notif_error}")
        
        # Créer l'activité
        if creer_activite:
            try:
                type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant_id})
                garde_nom = type_garde['nom'] if type_garde else 'garde'
                
                await creer_activite(
                    tenant_id=tenant_id,
                    type_activite="remplacement_accepte",
                    description=f"✅ {remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepté de remplacer {demandeur.get('prenom', '')} {demandeur.get('nom', '')} pour la {garde_nom} du {demande_data['date']}",
                    user_id=remplacant_id,
                    user_nom=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}"
                )
            except Exception as act_error:
                logger.warning(f"⚠️ Erreur création activité: {act_error}")
        
        # Broadcaster la mise à jour WebSocket
        if broadcast_remplacement_update:
            asyncio.create_task(broadcast_remplacement_update(tenant_slug or tenant_id, "accepte", {
                "demande_id": demande_id,
                "remplacant_id": remplacant_id,
                "remplacant_nom": f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}",
                "demandeur_id": demande_data["demandeur_id"],
                "date": demande_data["date"]
            }))
        
        logger.info(f"✅ Remplacement accepté: demande {demande_id}, remplaçant {remplacant.get('nom', '')}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors de l'acceptation du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de l'acceptation du remplacement")


async def refuser_remplacement_workflow(
    db,
    demande_id: str,
    remplacant_id: str,
    tenant_id: str,
    lancer_recherche_remplacant = None
):
    """
    Traite le refus d'un remplacement par un remplaçant.
    
    Args:
        db: Instance de la base de données
        demande_id: ID de la demande de remplacement
        remplacant_id: ID du remplaçant qui refuse
        tenant_id: ID du tenant
        lancer_recherche_remplacant: Fonction pour relancer la recherche
    
    Returns:
        True si succès
    """
    try:
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à refuser cette demande")
        
        maintenant = datetime.now(timezone.utc)
        
        # Mettre à jour l'historique des tentatives
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
        
        # Retirer le remplaçant de la liste des contactés
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$pull": {"remplacants_contactes_ids": remplacant_id},
                "$set": {"updated_at": maintenant}
            }
        )
        
        # Vérifier si tous les remplaçants ont refusé
        demande_updated = await db.demandes_remplacement.find_one({"id": demande_id})
        if not demande_updated.get("remplacants_contactes_ids"):
            logger.info(f"🔄 Tous les remplaçants ont refusé, relance de la recherche pour demande {demande_id}")
            if lancer_recherche_remplacant:
                asyncio.create_task(lancer_recherche_remplacant(demande_id, tenant_id))
        
        logger.info(f"❌ Remplacement refusé par remplaçant {remplacant_id} pour demande {demande_id}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erreur lors du refus du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors du refus du remplacement")


async def verifier_et_traiter_timeouts_workflow(
    db,
    lancer_recherche_remplacant = None
):
    """
    Fonction appelée périodiquement pour vérifier les demandes en timeout et les pauses silencieuses.
    
    Args:
        db: Instance de la base de données
        lancer_recherche_remplacant: Fonction pour relancer la recherche
    """
    try:
        maintenant = datetime.now(timezone.utc)
        
        # 1. Vérifier les demandes en pause silencieuse qui doivent reprendre
        demandes_en_pause = await db.demandes_remplacement.find({
            "statut": {"$in": ["en_cours", "en_attente"]},
            "en_pause_silencieuse": True,
            "reprise_contacts_prevue": {"$lte": maintenant.isoformat()}
        }).to_list(length=None)
        
        for demande in demandes_en_pause:
            tenant_id = demande["tenant_id"]
            
            # Vérifier si on est toujours dans les heures silencieuses
            parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant_id})
            heures_silencieuses_actif = parametres.get("heures_silencieuses_actif", True) if parametres else True
            heure_debut_silence = parametres.get("heure_debut_silence", "21:00") if parametres else "21:00"
            heure_fin_silence = parametres.get("heure_fin_silence", "07:00") if parametres else "07:00"
            
            if heures_silencieuses_actif and est_dans_heures_silencieuses(heure_debut_silence, heure_fin_silence):
                # Toujours en heures silencieuses, reporter
                prochaine_reprise = calculer_prochaine_heure_active(heure_fin_silence)
                await db.demandes_remplacement.update_one(
                    {"id": demande["id"]},
                    {"$set": {"reprise_contacts_prevue": prochaine_reprise.isoformat()}}
                )
                continue
            
            # Sortie des heures silencieuses - reprendre les contacts
            logger.info(f"☀️ Fin des heures silencieuses, reprise des contacts pour demande {demande['id']}")
            
            await db.demandes_remplacement.update_one(
                {"id": demande["id"]},
                {
                    "$set": {
                        "en_pause_silencieuse": False,
                        "updated_at": maintenant
                    },
                    "$unset": {"reprise_contacts_prevue": ""}
                }
            )
            
            # Relancer la recherche
            if lancer_recherche_remplacant:
                await lancer_recherche_remplacant(demande["id"], tenant_id)
        
        if demandes_en_pause:
            logger.info(f"☀️ {len(demandes_en_pause)} demande(s) reprises après pause silencieuse")
        
        # 2. Vérifier les demandes en timeout
        demandes_cursor = db.demandes_remplacement.find({
            "statut": "en_cours",
            "en_pause_silencieuse": {"$ne": True},
            "date_prochaine_tentative": {"$lte": maintenant}
        })
        
        demandes_timeout = await demandes_cursor.to_list(length=None)
        
        for demande in demandes_timeout:
            tenant_id = demande["tenant_id"]
            priorite = demande.get("priorite", "normal")
            
            # Vérifier si on doit respecter les heures silencieuses
            parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant_id})
            heures_silencieuses_actif = parametres.get("heures_silencieuses_actif", True) if parametres else True
            heure_debut_silence = parametres.get("heure_debut_silence", "21:00") if parametres else "21:00"
            heure_fin_silence = parametres.get("heure_fin_silence", "07:00") if parametres else "07:00"
            
            # Les demandes urgentes/hautes ignorent les heures silencieuses
            if priorite not in ["urgent", "haute"] and heures_silencieuses_actif:
                if est_dans_heures_silencieuses(heure_debut_silence, heure_fin_silence):
                    prochaine_reprise = calculer_prochaine_heure_active(heure_fin_silence)
                    
                    logger.info(f"🌙 Demande {demande['id']} mise en pause silencieuse jusqu'à {prochaine_reprise}")
                    
                    await db.demandes_remplacement.update_one(
                        {"id": demande["id"]},
                        {
                            "$set": {
                                "en_pause_silencieuse": True,
                                "reprise_contacts_prevue": prochaine_reprise.isoformat(),
                                "updated_at": maintenant
                            }
                        }
                    )
                    continue
            
            logger.info(f"⏱️ Timeout atteint pour demande {demande['id']}, relance de la recherche")
            
            # Marquer les tentatives comme expirées
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
            
            # Réinitialiser la liste des contactés
            await db.demandes_remplacement.update_one(
                {"id": demande["id"]},
                {
                    "$set": {
                        "remplacants_contactes_ids": [],
                        "updated_at": maintenant
                    }
                }
            )
            
            # Relancer la recherche
            if lancer_recherche_remplacant:
                await lancer_recherche_remplacant(demande["id"], demande["tenant_id"])
        
        if demandes_timeout:
            logger.info(f"✅ Traité {len(demandes_timeout)} demande(s) en timeout")
        
    except Exception as e:
        logger.error(f"❌ Erreur lors de la vérification des timeouts: {e}", exc_info=True)
