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

NOTE: Ce fichier est en cours de refactoring vers /routes/remplacements/
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse, StreamingResponse
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import asyncio
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

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_remplacement_update

# Import des modèles depuis le nouveau module
from routes.remplacements.models import (
    DemandeRemplacement,
    DemandeRemplacementCreate,
    NotificationRemplacement,
    ParametresRemplacements,
    TentativeRemplacement
)

# Import des utilitaires depuis le nouveau module
from routes.remplacements.utils import (
    calculer_priorite_demande,
    est_dans_heures_silencieuses,
    calculer_prochaine_heure_active,
    formater_numero_telephone
)

# Import de la fonction de recherche depuis le nouveau module
from routes.remplacements.search import trouver_remplacants_potentiels

# Import des fonctions d'export
from routes.remplacements.exports import export_remplacements_to_pdf, export_remplacements_to_excel

# Import des fonctions de workflow
from routes.remplacements.workflow import (
    accepter_remplacement_workflow,
    refuser_remplacement_workflow,
    verifier_et_traiter_timeouts_workflow
)

# Import des fonctions de notification depuis le module
from routes.remplacements.notifications import (
    generer_token_remplacement,
    envoyer_email_remplacement,
    envoyer_email_remplacement_trouve,
    envoyer_email_remplacement_non_trouve,
    envoyer_sms_remplacement
)

router = APIRouter(tags=["Remplacements"])
logger = logging.getLogger(__name__)


# Note: La fonction trouver_remplacants_potentiels est importée depuis routes/remplacements/search.py




# Import direct de send_push_notification_to_users depuis notifications.py
from routes.notifications import send_push_notification_to_users as push_notification_func

async def get_send_push_notification():
    """Retourne la fonction send_push_notification_to_users"""
    return push_notification_func


async def lancer_recherche_remplacant(demande_id: str, tenant_id: str):
    """Lance la recherche de remplaçant pour une demande"""
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            logger.error(f"Demande de remplacement non trouvée: {demande_id}")
            return
        
        # IMPORTANT: Lire depuis parametres_remplacements (pas parametres) 
        # C'est là que le frontend sauvegarde les paramètres
        parametres_data = await db.parametres_remplacements.find_one({"tenant_id": tenant_id})
        if not parametres_data:
            mode_notification = "un_par_un"
            # Délais par défaut selon la priorité
            delais_par_priorite = {
                "urgent": 5,
                "haute": 15,
                "normal": 60,
                "faible": 120
            }
            nombre_simultane = 1
            max_contacts = 5
            heures_silencieuses_actif = True
            heure_debut_silence = "21:00"
            heure_fin_silence = "07:00"
            logger.info(f"⚙️ Paramètres remplacements: Aucun trouvé, utilisation des valeurs par défaut")
        else:
            mode_notification = parametres_data.get("mode_notification", "un_par_un")
            # Nouveaux délais par priorité (avec fallback sur l'ancien délai unique)
            delai_fallback = parametres_data.get("delai_attente_minutes") or (parametres_data.get("delai_attente_heures", 2) * 60)
            delais_par_priorite = {
                "urgent": parametres_data.get("delai_attente_urgente", 5),
                "haute": parametres_data.get("delai_attente_haute", 15),
                "normal": parametres_data.get("delai_attente_normale", delai_fallback),
                "faible": parametres_data.get("delai_attente_faible", 120)
            }
            nombre_simultane = parametres_data.get("nombre_simultane", 3)
            max_contacts = parametres_data.get("max_contacts", 5)
            heures_silencieuses_actif = parametres_data.get("heures_silencieuses_actif", True)
            heure_debut_silence = parametres_data.get("heure_debut_silence", "21:00")
            heure_fin_silence = parametres_data.get("heure_fin_silence", "07:00")
            logger.info(f"⚙️ Paramètres remplacements chargés: délais={delais_par_priorite}, mode={mode_notification}, max_contacts={max_contacts}")
        
        # Vérifier les heures silencieuses pour les demandes non-urgentes
        priorite = demande_data.get("priorite", "normal")
        
        # Sélectionner le délai d'attente selon la priorité de la demande
        delai_attente_minutes = delais_par_priorite.get(priorite, delais_par_priorite.get("normal", 60))
        logger.info(f"⏱️ Délai d'attente pour priorité '{priorite}': {delai_attente_minutes} minutes")
        
        # Les demandes Urgentes et Hautes ignorent les heures silencieuses
        
        # Les demandes Urgentes et Hautes ignorent les heures silencieuses
        if priorite not in ["urgent", "haute"] and heures_silencieuses_actif:
            if est_dans_heures_silencieuses(heure_debut_silence, heure_fin_silence):
                # On est dans les heures de pause - reporter au lendemain matin
                prochaine_reprise = calculer_prochaine_heure_active(heure_fin_silence)
                
                logger.info(f"🌙 Heures silencieuses actives ({heure_debut_silence}-{heure_fin_silence}). Demande {demande_id} (priorité: {priorite}) mise en pause jusqu'à {prochaine_reprise}")
                
                await db.demandes_remplacement.update_one(
                    {"id": demande_id},
                    {
                        "$set": {
                            "en_pause_silencieuse": True,
                            "reprise_contacts_prevue": prochaine_reprise.isoformat(),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
                return  # Ne pas continuer - la demande sera reprise par le job de timeout
        
        exclus_ids = [t.get("user_id") for t in demande_data.get("tentatives_historique", [])]
        
        remplacants = await trouver_remplacants_potentiels(
            db=db,
            tenant_id=tenant_id,
            type_garde_id=demande_data["type_garde_id"],
            date_garde=demande_data["date"],
            demandeur_id=demande_data["demandeur_id"],
            exclus_ids=exclus_ids
        )
        
        logger.info(f"📋 Résultat recherche remplaçants: {len(remplacants)} trouvé(s)")
        for r in remplacants[:5]:
            logger.info(f"  - {r.get('nom_complet')} (priorité {r.get('priorite')}, {r.get('raison')})")
        
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
                demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Un employé"
                
                # Push notification
                await send_push_notification_to_users(
                    user_ids=superviseur_ids,
                    title="❌ Aucun remplaçant trouvé",
                    body=f"Aucun remplaçant disponible pour {demandeur_nom} le {demande_data['date']}",
                    data={
                        "type": "remplacement_expiree",
                        "demande_id": demande_id
                    }
                )
                
                # Notification in-app + email pour chaque superviseur
                for sup in superviseurs:
                    await creer_notification(
                        tenant_id=tenant_id,
                        destinataire_id=sup["id"],
                        type="remplacement_expiree",
                        titre="❌ Aucun remplaçant trouvé",
                        message=f"Aucun remplaçant disponible pour {demandeur_nom} le {demande_data['date']}. Une intervention manuelle est requise.",
                        lien="/remplacements",
                        data={"demande_id": demande_id},
                        envoyer_email=True  # Email aux superviseurs quand demande expirée
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
                
                # Envoyer un email au demandeur pour l'informer qu'aucun remplaçant n'a été trouvé
                try:
                    tenant = await db.tenants.find_one({"id": tenant_id})
                    type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant_id})
                    await envoyer_email_remplacement_non_trouve(
                        db=db,
                        demande_data=demande_data,
                        demandeur=demandeur,
                        type_garde=type_garde,
                        tenant=tenant
                    )
                except Exception as email_error:
                    logger.warning(f"⚠️ Erreur envoi email remplacement non trouvé: {email_error}")
                    
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
        
        date_prochaine = maintenant + timedelta(minutes=delai_attente_minutes)
        
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
                logger.info(f"📧 Envoi email à {remplacant.get('nom_complet', 'N/A')} ({remplacant.get('email', 'N/A')})")
                token = await generer_token_remplacement(db, demande_id, remplacant["user_id"], tenant_id)
                
                # Envoyer l'email
                email_result = await envoyer_email_remplacement(
                    db=db,
                    demande_data=demande_data,
                    remplacant=remplacant,
                    demandeur=demandeur,
                    type_garde=type_garde,
                    tenant_id=tenant_id,
                    token=token
                )
                logger.info(f"📧 Résultat email: {email_result}")
                
                # Envoyer le SMS
                sms_result = await envoyer_sms_remplacement(
                    db=db,
                    remplacant=remplacant,
                    demande_data=demande_data,
                    demandeur=demandeur,
                    type_garde=type_garde,
                    tenant_id=tenant_id,
                    token=token
                )
                logger.info(f"📱 Résultat SMS: {sms_result}")
                
            except Exception as notif_error:
                logger.error(f"Erreur envoi notification à {remplacant.get('nom_complet', 'N/A')}: {notif_error}", exc_info=True)
        
        logger.info(f"✅ Recherche lancée pour demande {demande_id}: {nombre_a_contacter} remplaçant(s) contacté(s)")
        
    except Exception as e:
        logger.error(f"❌ Erreur lors du lancement de la recherche de remplaçant: {e}", exc_info=True)


async def accepter_remplacement(demande_id: str, remplacant_id: str, tenant_id: str, tenant_slug: str = None):
    """Traite l'acceptation d'un remplacement par un remplaçant - wrapper vers workflow"""
    send_push_notification_to_users = await get_send_push_notification()
    
    return await accepter_remplacement_workflow(
        db=db,
        demande_id=demande_id,
        remplacant_id=remplacant_id,
        tenant_id=tenant_id,
        tenant_slug=tenant_slug,
        creer_notification=creer_notification,
        creer_activite=creer_activite,
        broadcast_remplacement_update=broadcast_remplacement_update,
        send_push_notification_to_users=send_push_notification_to_users,
        envoyer_email_remplacement_trouve=envoyer_email_remplacement_trouve
    )


async def refuser_remplacement(demande_id: str, remplacant_id: str, tenant_id: str):
    """Traite le refus d'un remplacement par un remplaçant - wrapper vers workflow"""
    return await refuser_remplacement_workflow(
        db=db,
        demande_id=demande_id,
        remplacant_id=remplacant_id,
        tenant_id=tenant_id,
        lancer_recherche_remplacant=lancer_recherche_remplacant
    )


async def verifier_et_traiter_timeouts():
    """Fonction appelée périodiquement pour vérifier les demandes en timeout - wrapper vers workflow"""
    return await verifier_et_traiter_timeouts_workflow(
        db=db,
        lancer_recherche_remplacant=lancer_recherche_remplacant
    )


# ==================== ROUTES API ====================

@router.post("/{tenant_slug}/remplacements", response_model=DemandeRemplacement)
async def create_demande_remplacement(tenant_slug: str, demande: DemandeRemplacementCreate, current_user: User = Depends(get_current_user)):
    """Créer une demande de remplacement et lancer automatiquement la recherche"""
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # ==================== VALIDATION: Vérifier que le demandeur est bien planifié ====================
        assignation_existante = await db.assignations.find_one({
            "tenant_id": tenant.id,
            "user_id": current_user.id,
            "date": demande.date,
            "type_garde_id": demande.type_garde_id
        })
        
        if not assignation_existante:
            # Récupérer le nom du type de garde pour un message clair
            type_garde = await db.types_garde.find_one({"id": demande.type_garde_id, "tenant_id": tenant.id})
            type_garde_nom = type_garde.get("nom", "ce type de garde") if type_garde else "ce type de garde"
            
            raise HTTPException(
                status_code=400, 
                detail=f"Vous n'êtes pas planifié sur '{type_garde_nom}' le {demande.date}. Veuillez vérifier votre planning."
            )
        # ==================== FIN VALIDATION ====================
        
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
                data={"demande_id": demande_obj.id},
                envoyer_email=False  # Pas d'email aux superviseurs, juste push
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
        
        # Lancer la recherche de remplaçant EN ARRIÈRE-PLAN pour une réponse plus rapide
        asyncio.create_task(lancer_recherche_remplacant(demande_obj.id, tenant.id))
        
        type_garde = await db.types_garde.find_one({"id": demande.type_garde_id, "tenant_id": tenant.id})
        garde_nom = type_garde['nom'] if type_garde else 'garde'
        
        # Créer l'activité aussi en arrière-plan
        asyncio.create_task(creer_activite(
            tenant_id=tenant.id,
            type_activite="remplacement_demande",
            description=f"🔄 {current_user.prenom} {current_user.nom} cherche un remplaçant pour la {garde_nom} du {demande.date}",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}"
        ))
        
        # Broadcaster la mise à jour pour actualiser les pages des autres utilisateurs
        asyncio.create_task(broadcast_remplacement_update(tenant_slug, "nouvelle_demande", {
            "demande_id": demande_obj.id,
            "demandeur_nom": f"{current_user.prenom} {current_user.nom}",
            "date": demande.date
        }))
        
        cleaned_demande = clean_mongo_doc(demande_obj.dict())
        return DemandeRemplacement(**cleaned_demande)
        
    except HTTPException:
        raise  # Re-raise les HTTPException (comme notre validation)
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
    tenant = await get_tenant_from_slug(tenant_slug)
    return await export_remplacements_to_pdf(db, tenant, current_user, user_id)


@router.get("/{tenant_slug}/remplacements/export-excel")
async def export_remplacements_excel(
    tenant_slug: str,
    user_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Export des demandes de remplacement en Excel"""
    tenant = await get_tenant_from_slug(tenant_slug)
    return await export_remplacements_to_excel(db, tenant, current_user, user_id)


@router.get("/{tenant_slug}/remplacements", response_model=List[DemandeRemplacement])
async def get_demandes_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Liste des demandes de remplacement avec les noms des demandeurs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role == "employe":
        demandes = await db.demandes_remplacement.find({
            "tenant_id": tenant.id,
            "demandeur_id": current_user.id
        }).to_list(1000)
    else:
        demandes = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Enrichir les demandes avec le nom du demandeur
    enriched_demandes = []
    for demande in demandes:
        cleaned = clean_mongo_doc(demande)
        
        # Récupérer le nom du demandeur si non présent
        if not cleaned.get("demandeur_nom") and cleaned.get("demandeur_id"):
            demandeur = await db.users.find_one({"id": cleaned["demandeur_id"]}, {"prenom": 1, "nom": 1})
            if demandeur:
                cleaned["demandeur_nom"] = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}".strip()
        
        # Récupérer le nom du remplaçant si présent
        if cleaned.get("remplacant_id") and not cleaned.get("remplacant_nom"):
            remplacant = await db.users.find_one({"id": cleaned["remplacant_id"]}, {"prenom": 1, "nom": 1})
            if remplacant:
                cleaned["remplacant_nom"] = f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}".strip()
        
        # Récupérer le nom de la personne qui a annulé
        if cleaned.get("annule_par_id") and not cleaned.get("annule_par_nom"):
            annule_par = await db.users.find_one({"id": cleaned["annule_par_id"]}, {"prenom": 1, "nom": 1})
            if annule_par:
                cleaned["annule_par_nom"] = f"{annule_par.get('prenom', '')} {annule_par.get('nom', '')}".strip()
        
        # Récupérer le nom de la personne qui a relancé
        if cleaned.get("relance_par_id") and not cleaned.get("relance_par_nom"):
            relance_par = await db.users.find_one({"id": cleaned["relance_par_id"]}, {"prenom": 1, "nom": 1})
            if relance_par:
                cleaned["relance_par_nom"] = f"{relance_par.get('prenom', '')} {relance_par.get('nom', '')}".strip()
        
        # Récupérer le nom de la personne qui a approuvé manuellement
        if cleaned.get("approuve_par_id") and not cleaned.get("approuve_par_nom"):
            approuve_par = await db.users.find_one({"id": cleaned["approuve_par_id"]}, {"prenom": 1, "nom": 1})
            if approuve_par:
                cleaned["approuve_par_nom"] = f"{approuve_par.get('prenom', '')} {approuve_par.get('nom', '')}".strip()
        
        enriched_demandes.append(DemandeRemplacement(**cleaned))
    
    return enriched_demandes


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


@router.get("/{tenant_slug}/remplacements/{demande_id}/suivi")
async def get_suivi_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère le suivi détaillé d'une demande de remplacement
    Accessible par le demandeur, les admins et les superviseurs
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande = await db.demandes_remplacement.find_one({
        "id": demande_id,
        "tenant_id": tenant.id
    })
    
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier les permissions : demandeur ou admin/superviseur
    if current_user.role == "employe" and demande.get("demandeur_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    # Récupérer les informations de notifications envoyées
    tentatives = demande.get("tentatives_historique", [])
    
    # Enrichir chaque tentative avec les informations de l'utilisateur
    tentatives_enrichies = []
    for tentative in tentatives:
        user_id = tentative.get("user_id")
        user_info = await db.users.find_one({"id": user_id}, {"prenom": 1, "nom": 1, "email": 1, "telephone": 1})
        
        tentative_enrichie = {
            **tentative,
            "nom_complet": tentative.get("nom_complet") or (f"{user_info.get('prenom', '')} {user_info.get('nom', '')}" if user_info else "Inconnu"),
            "email": user_info.get("email") if user_info else None,
            "telephone": user_info.get("telephone") if user_info else None,
            # Par défaut, on considère que tous les canaux ont été utilisés
            # (à améliorer plus tard avec un vrai tracking des envois)
            "email_envoye": True,
            "sms_envoye": True,
            "push_envoye": True
        }
        tentatives_enrichies.append(tentative_enrichie)
    
    # Calculer les statistiques
    nb_tentatives = len(tentatives_enrichies)
    nb_acceptes = sum(1 for t in tentatives if t.get("statut") == "accepted")
    nb_refuses = sum(1 for t in tentatives if t.get("statut") == "refused")
    nb_en_attente = sum(1 for t in tentatives if t.get("statut") == "contacted")
    
    # Récupérer les informations du demandeur et du remplaçant
    demandeur = await db.users.find_one({"id": demande.get("demandeur_id")}, {"prenom": 1, "nom": 1})
    remplacant = None
    if demande.get("remplacant_id"):
        remplacant = await db.users.find_one({"id": demande.get("remplacant_id")}, {"prenom": 1, "nom": 1})
    
    type_garde = await db.types_garde.find_one({"id": demande.get("type_garde_id"), "tenant_id": tenant.id})
    
    # Récupérer les informations sur l'annulation/relance si présentes
    annule_par_nom = None
    if demande.get("annule_par_id"):
        annule_par = await db.users.find_one({"id": demande["annule_par_id"]})
        if annule_par:
            annule_par_nom = f"{annule_par.get('prenom', '')} {annule_par.get('nom', '')}"
    
    relance_par_nom = None
    if demande.get("relance_par_id"):
        relance_par = await db.users.find_one({"id": demande["relance_par_id"]})
        if relance_par:
            relance_par_nom = f"{relance_par.get('prenom', '')} {relance_par.get('nom', '')}"
    
    approuve_par_nom = None
    if demande.get("approuve_par_id"):
        approuve_par = await db.users.find_one({"id": demande["approuve_par_id"]})
        if approuve_par:
            approuve_par_nom = f"{approuve_par.get('prenom', '')} {approuve_par.get('nom', '')}"
    
    suivi = {
        "demande_id": demande_id,
        "statut": demande.get("statut"),
        "date_garde": demande.get("date"),
        "raison": demande.get("raison"),
        "priorite": demande.get("priorite"),
        "type_garde": type_garde.get("nom") if type_garde else "Inconnu",
        "demandeur_nom": f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Inconnu",
        "remplacant_nom": f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')}" if remplacant else None,
        "created_at": demande.get("created_at"),
        "updated_at": demande.get("updated_at"),
        "tentatives": tentatives_enrichies,
        "notifications_envoyees": {
            "email": nb_tentatives,
            "sms": nb_tentatives,  # Approximation - à améliorer
            "push": nb_tentatives  # Approximation - à améliorer
        },
        "statistiques": {
            "total_contactes": nb_tentatives,
            "acceptes": nb_acceptes,
            "refuses": nb_refuses,
            "en_attente": nb_en_attente,
            "sans_reponse": nb_tentatives - nb_acceptes - nb_refuses - nb_en_attente
        },
        # Informations d'annulation/relance/approbation
        "annule_par_nom": annule_par_nom,
        "date_annulation": demande.get("date_annulation"),
        "relance_par_nom": relance_par_nom,
        "date_relance": demande.get("date_relance"),
        "approuve_par_nom": approuve_par_nom,
        "date_approbation": demande.get("date_approbation"),
        # Informations de pause silencieuse
        "en_pause_silencieuse": demande.get("en_pause_silencieuse", False),
        "reprise_contacts_prevue": demande.get("reprise_contacts_prevue")
    }
    
    logger.info(f"📋 Suivi demande {demande_id}: {nb_tentatives} tentatives, statut={demande.get('statut')}")
    
    return suivi


@router.put("/{tenant_slug}/remplacements/{demande_id}/accepter")
async def accepter_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Accepter une demande de remplacement (en tant que remplaçant contacté)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier si l'utilisateur est contacté comme remplaçant
    remplacants_contactes = demande_data.get("remplacants_contactes_ids", [])
    
    if current_user.id in remplacants_contactes:
        # L'utilisateur (peu importe son rôle) est contacté comme remplaçant → traiter normalement
        await accepter_remplacement(demande_id, current_user.id, tenant.id, tenant_slug)
        
        return {
            "message": "Remplacement accepté avec succès",
            "demande_id": demande_id
        }
    else:
        # L'utilisateur n'est pas contacté → pas autorisé à accepter
        raise HTTPException(
            status_code=403, 
            detail="Vous n'êtes pas contacté comme remplaçant pour cette demande. Utilisez 'Arrêter le processus' si vous souhaitez fermer cette demande."
        )


@router.put("/{tenant_slug}/remplacements/{demande_id}/refuser")
async def refuser_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Refuser une demande de remplacement (en tant que remplaçant contacté)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier si l'utilisateur est contacté comme remplaçant
    remplacants_contactes = demande_data.get("remplacants_contactes_ids", [])
    
    if current_user.id in remplacants_contactes:
        # L'utilisateur (peu importe son rôle) est contacté comme remplaçant → traiter normalement
        await refuser_remplacement(demande_id, current_user.id, tenant.id)
        
        return {
            "message": "Remplacement refusé",
            "demande_id": demande_id
        }
    else:
        # L'utilisateur n'est pas contacté → pas autorisé à refuser
        raise HTTPException(
            status_code=403, 
            detail="Vous n'êtes pas contacté comme remplaçant pour cette demande. Utilisez 'Arrêter le processus' si vous souhaitez fermer cette demande."
        )


@router.put("/{tenant_slug}/remplacements/{demande_id}/arreter")
async def arreter_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Arrêter le processus de remplacement (admin/superviseur uniquement)"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Seuls les administrateurs et superviseurs peuvent arrêter le processus")
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    if demande_data["statut"] not in ["en_cours", "en_attente"]:
        raise HTTPException(status_code=400, detail="Cette demande n'est plus en cours")
    
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
    
    # Notifier le demandeur
    demandeur_id = demande_data.get("demandeur_id")
    if demandeur_id:
        try:
            await send_push_notification_to_users(
                user_ids=[demandeur_id],
                title="🛑 Processus arrêté",
                body=f"Le processus de remplacement du {demande_data['date']} a été arrêté par un superviseur.",
                data={
                    "type": "remplacement_arrete",
                    "demande_id": demande_id
                }
            )
        except Exception as e:
            logger.warning(f"Erreur notification arrêt: {e}")
        
        try:
            await db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "user_id": demandeur_id,
                "type": "remplacement_arrete",
                "titre": "🛑 Processus arrêté",
                "message": f"Le processus de remplacement du {demande_data['date']} a été arrêté par {current_user.prenom} {current_user.nom}.",
                "lu": False,
                "data": {"demande_id": demande_id},
                "created_at": maintenant.isoformat()
            })
        except Exception as e:
            logger.warning(f"Erreur création notification: {e}")
    
    logger.info(f"🛑 Processus {demande_id} arrêté par {current_user.prenom} {current_user.nom}")
    
    # Broadcaster la mise à jour
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "arrete", {
        "demande_id": demande_id,
        "arrete_par_nom": f"{current_user.prenom} {current_user.nom}",
        "date": demande_data.get("date")
    }))
    
    return {
        "message": "Processus de remplacement arrêté",
        "demande_id": demande_id
    }


@router.put("/{tenant_slug}/remplacements/{demande_id}/relancer")
async def relancer_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Relancer une demande de remplacement expirée (repart de zéro)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier que la demande est expirée ou annulée
    if demande_data["statut"] not in ["expiree", "annulee"]:
        raise HTTPException(status_code=400, detail="Seules les demandes expirées ou annulées peuvent être relancées")
    
    # Vérifier que l'utilisateur a le droit (admin, superviseur, ou demandeur original)
    if current_user.role not in ["admin", "superviseur"] and current_user.id != demande_data.get("demandeur_id"):
        raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à relancer cette demande")
    
    # Vérifier que la date n'est pas passée
    from datetime import datetime, timezone
    date_garde = demande_data.get("date")
    if date_garde:
        try:
            date_obj = datetime.strptime(date_garde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if date_obj.date() < datetime.now(timezone.utc).date():
                raise HTTPException(status_code=400, detail="Impossible de relancer une demande pour une date passée")
        except ValueError:
            pass
    
    maintenant = datetime.now(timezone.utc)
    
    # Réinitialiser la demande (repartir de zéro)
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "en_cours",
                "remplacant_id": None,
                "remplacants_contactes_ids": [],
                "tentatives_historique": [],  # Réinitialiser l'historique
                "niveau_actuel": 2,  # Recommencer au niveau N2
                "relance_par_id": current_user.id,
                "date_relance": maintenant.isoformat(),
                "updated_at": maintenant
            },
            "$unset": {
                "annule_par_id": "",
                "date_annulation": "",
                "date_expiration": ""
            }
        }
    )
    
    logger.info(f"🔄 Demande {demande_id} relancée par {current_user.prenom} {current_user.nom}")
    
    # Lancer la recherche de remplaçant en arrière-plan
    asyncio.create_task(lancer_recherche_remplacant(demande_id, tenant.id))
    
    # Broadcaster la mise à jour pour actualiser les pages des autres utilisateurs
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "relancee", {
        "demande_id": demande_id,
        "relance_par_nom": f"{current_user.prenom} {current_user.nom}"
    }))
    
    return {
        "message": "Demande relancée avec succès. La recherche de remplaçant a redémarré.",
        "demande_id": demande_id
    }


@router.delete("/{tenant_slug}/remplacements/{demande_id}")
async def supprimer_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une demande de remplacement (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Admin uniquement
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent supprimer des demandes")
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Supprimer la demande
    await db.demandes_remplacement.delete_one({"id": demande_id, "tenant_id": tenant.id})
    
    logger.info(f"🗑️ Demande {demande_id} supprimée par {current_user.prenom} {current_user.nom}")
    
    # Broadcaster la mise à jour pour actualiser les pages des autres utilisateurs
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "supprimee", {
        "demande_id": demande_id
    }))
    
    return {
        "message": "Demande supprimée avec succès",
        "demande_id": demande_id
    }


@router.post("/{tenant_slug}/remplacements/nettoyer")
async def nettoyer_anciennes_demandes(
    tenant_slug: str,
    delai_jours: int = 365,
    current_user: User = Depends(get_current_user)
):
    """Nettoyer les anciennes demandes terminées (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Admin uniquement
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent nettoyer les demandes")
    
    from datetime import datetime, timezone, timedelta
    date_limite = datetime.now(timezone.utc) - timedelta(days=delai_jours)
    
    # Supprimer les demandes terminées (accepte, expiree, annulee, refusee) plus anciennes que le délai
    result = await db.demandes_remplacement.delete_many({
        "tenant_id": tenant.id,
        "statut": {"$in": ["accepte", "expiree", "annulee", "refusee", "approuve_manuellement"]},
        "created_at": {"$lt": date_limite.isoformat()}
    })
    
    logger.info(f"🗑️ {result.deleted_count} demande(s) nettoyée(s) par {current_user.prenom} {current_user.nom}")
    
    return {
        "message": f"{result.deleted_count} demande(s) supprimée(s)",
        "deleted_count": result.deleted_count
    }
async def action_remplacement_via_email(token: str, action: str):
    """Traite une action de remplacement via le lien email"""
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    
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
        
        # Si action = "choix", afficher une page avec les deux boutons
        if action == "choix":
            # Rediriger vers une page frontend qui affiche les deux options
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-choix?token={token}",
                status_code=302
            )
        
        # Valider l'action avant de marquer le token comme utilisé
        if action not in ["accepter", "refuser"]:
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Action non reconnue",
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
        logger.info(f"📋 Création des paramètres de remplacement par défaut pour tenant {tenant.slug}")
        default_params = ParametresRemplacements(tenant_id=tenant.id)
        await db.parametres_remplacements.insert_one(default_params.dict())
        return default_params
    
    cleaned_params = clean_mongo_doc(parametres)
    logger.info(f"📋 Paramètres remplacements chargés pour {tenant.slug}: delai={cleaned_params.get('delai_attente_minutes')}min, max_contacts={cleaned_params.get('max_contacts')}")
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
    
    logger.info(f"💾 Sauvegarde paramètres remplacements pour {tenant.slug}: {parametres_data}")
    
    existing = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    
    parametres_data["tenant_id"] = tenant.id
    
    if existing:
        await db.parametres_remplacements.update_one(
            {"tenant_id": tenant.id},
            {"$set": parametres_data}
        )
        logger.info(f"✅ Paramètres remplacements MIS À JOUR pour {tenant.slug}")
    else:
        if "id" not in parametres_data:
            parametres_data["id"] = str(uuid.uuid4())
        await db.parametres_remplacements.insert_one(parametres_data)
        logger.info(f"✅ Paramètres remplacements CRÉÉS pour {tenant.slug}")
    
    return {"message": "Paramètres mis à jour avec succès"}



@router.get("/{tenant_slug}/remplacements/debug/{demande_id}")
async def debug_recherche_remplacant(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint de diagnostic pour comprendre pourquoi aucun remplaçant n'est trouvé.
    Retourne des détails sur chaque utilisateur et pourquoi il est éligible ou non.
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès réservé aux admins")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer la demande
    demande = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    date_garde = demande.get("date")
    type_garde_id = demande.get("type_garde_id")
    demandeur_id = demande.get("demandeur_id")
    exclus_ids = demande.get("remplacants_contactes_ids", [])
    
    # Type de garde
    type_garde = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    competences_requises = type_garde.get("competences_requises", []) if type_garde else []
    officier_obligatoire = type_garde.get("officier_obligatoire", False) if type_garde else False
    heure_debut_garde = type_garde.get("heure_debut", "00:00") if type_garde else "00:00"
    heure_fin_garde = type_garde.get("heure_fin", "23:59") if type_garde else "23:59"
    
    # Fonction pour vérifier si deux plages horaires se chevauchent
    def plages_se_chevauchent(debut1: str, fin1: str, debut2: str, fin2: str) -> bool:
        def heure_to_minutes(h: str) -> int:
            try:
                parts = h.split(":")
                return int(parts[0]) * 60 + int(parts[1])
            except:
                return 0
        
        d1, f1 = heure_to_minutes(debut1), heure_to_minutes(fin1)
        d2, f2 = heure_to_minutes(debut2), heure_to_minutes(fin2)
        
        if f1 < d1:
            f1 += 24 * 60
        if f2 < d2:
            f2 += 24 * 60
        
        return d1 < f2 and d2 < f1
    
    # Récupérer les grades pour déterminer qui est officier
    grades_list = await db.grades.find({"tenant_id": tenant.id}).to_list(100)
    grades_map = {g.get("nom"): g for g in grades_list}
    
    def est_officier_grade(grade_nom: str) -> bool:
        """Vérifie si un grade est considéré comme officier"""
        grade_info = grades_map.get(grade_nom, {})
        return grade_info.get("est_officier", False) == True
    
    # Demandeur
    demandeur = await db.users.find_one({"id": demandeur_id})
    demandeur_grade = demandeur.get("grade", "") if demandeur else ""
    demandeur_est_officier = est_officier_grade(demandeur_grade)
    
    # Vérifier la règle officier
    besoin_officier_remplacement = False
    autre_officier_present = False
    
    if officier_obligatoire and demandeur_est_officier:
        # Vérifier s'il y a d'autres officiers assignés à cette garde à cette date
        autres_assignations = await db.assignations.find({
            "tenant_id": tenant.id,
            "type_garde_id": type_garde_id,
            "date": date_garde,
            "user_id": {"$ne": demandeur_id}
        }).to_list(100)
        
        for assignation in autres_assignations:
            autre_user = await db.users.find_one({"id": assignation["user_id"], "tenant_id": tenant.id})
            if autre_user:
                autre_grade = autre_user.get("grade", "")
                if est_officier_grade(autre_grade):
                    autre_officier_present = True
                    break
        
        besoin_officier_remplacement = not autre_officier_present
    
    # Tous les utilisateurs actifs
    users = await db.users.find({"tenant_id": tenant.id, "statut": "Actif"}).to_list(1000)
    
    resultats = []
    
    for user in users:
        user_id = user["id"]
        user_name = f"{user.get('prenom', '')} {user.get('nom', '')}"
        user_competences = user.get("competences", [])
        user_type_emploi = user.get("type_emploi", "")
        
        resultat = {
            "nom": user_name,
            "id": user_id,
            "type_emploi": user_type_emploi,
            "competences": user_competences,
            "eligible": True,
            "raisons_exclusion": []
        }
        
        # Check 1: Est-ce le demandeur ?
        if user_id == demandeur_id:
            resultat["eligible"] = False
            resultat["raisons_exclusion"].append("C'est le demandeur lui-même")
            resultats.append(resultat)
            continue
        
        # Check 2: Déjà contacté ?
        if user_id in exclus_ids:
            resultat["eligible"] = False
            resultat["raisons_exclusion"].append("Déjà contacté précédemment")
            resultats.append(resultat)
            continue
        
        # Check 3: Compétences requises
        if competences_requises:
            # Normaliser pour comparaison insensible à la casse
            competences_requises_norm = set(c.lower().strip() for c in competences_requises if c)
            user_competences_norm = set(c.lower().strip() for c in user_competences if c)
            manquantes = competences_requises_norm - user_competences_norm
            if manquantes:
                resultat["eligible"] = False
                resultat["raisons_exclusion"].append(f"Compétences manquantes: {list(manquantes)}")
            resultat["competences_requises_norm"] = list(competences_requises_norm)
            resultat["competences_user_norm"] = list(user_competences_norm)
        
        # Check 4: Indisponibilité déclarée
        indispo = await db.disponibilites.find_one({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": date_garde,
            "statut": "indisponible"
        })
        if indispo:
            resultat["eligible"] = False
            resultat["raisons_exclusion"].append("Indisponibilité déclarée pour cette date")
        
        # Check 4b: Règle officier
        if besoin_officier_remplacement:
            user_grade = user.get("grade", "")
            user_est_officier = est_officier_grade(user_grade)
            user_est_eligible = user.get("fonction_superieur", False) == True
            resultat["est_officier"] = user_est_officier
            resultat["est_eligible_fonction_sup"] = user_est_eligible
            
            if not user_est_officier and not user_est_eligible:
                resultat["eligible"] = False
                resultat["raisons_exclusion"].append(f"Règle officier: Le demandeur est le seul officier, le remplaçant doit être officier ou éligible (grade={user_grade})")
        
        # Check 5: Conflit horaire (assignation existante qui chevauche)
        assignations_ce_jour = await db.assignations.find({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": date_garde
        }).to_list(10)
        
        for assignation in assignations_ce_jour:
            type_garde_assignation = await db.types_garde.find_one({"id": assignation.get("type_garde_id")})
            if type_garde_assignation:
                heure_debut_existante = type_garde_assignation.get("heure_debut", "00:00")
                heure_fin_existante = type_garde_assignation.get("heure_fin", "23:59")
                nom_garde_existante = type_garde_assignation.get("nom", "Inconnu")
                
                if plages_se_chevauchent(heure_debut_garde, heure_fin_garde, heure_debut_existante, heure_fin_existante):
                    resultat["eligible"] = False
                    resultat["raisons_exclusion"].append(f"Conflit horaire: Déjà assigné à {nom_garde_existante} ({heure_debut_existante}-{heure_fin_existante}) qui chevauche {heure_debut_garde}-{heure_fin_garde}")
                else:
                    # Info: assigné mais pas de chevauchement
                    if "assignations_sans_conflit" not in resultat:
                        resultat["assignations_sans_conflit"] = []
                    resultat["assignations_sans_conflit"].append(f"{nom_garde_existante} ({heure_debut_existante}-{heure_fin_existante})")
        
        # Check 6: Disponibilité déclarée
        dispo = await db.disponibilites.find_one({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": date_garde,
            "statut": "disponible"
        })
        resultat["a_disponibilite"] = dispo is not None
        
        # Classification niveau
        if resultat["eligible"]:
            if user_type_emploi in ["temps_partiel", "temporaire"]:
                if dispo:
                    resultat["niveau"] = "N2 (TP Disponible)"
                else:
                    resultat["niveau"] = "N3 (TP Stand-by)"
            elif user_type_emploi == "temps_plein":
                resultat["niveau"] = "N4 (Temps plein)"
            else:
                resultat["niveau"] = "N5 ou non classé"
        
        resultats.append(resultat)
    
    # Compter les éligibles
    eligibles = [r for r in resultats if r["eligible"]]
    non_eligibles = [r for r in resultats if not r["eligible"]]
    
    return {
        "demande": {
            "id": demande_id,
            "date": date_garde,
            "type_garde": type_garde.get("nom") if type_garde else "Inconnu",
            "horaires": f"{heure_debut_garde} - {heure_fin_garde}",
            "competences_requises": competences_requises,
            "demandeur": f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Inconnu",
            "demandeur_grade": demandeur_grade,
            "demandeur_est_officier": demandeur_est_officier
        },
        "regle_officier": {
            "officier_obligatoire": officier_obligatoire,
            "demandeur_est_officier": demandeur_est_officier,
            "autre_officier_present_sur_garde": autre_officier_present,
            "regle_active": besoin_officier_remplacement,
            "explication": (
                "Le remplaçant DOIT être officier ou éligible car le demandeur est le seul officier sur cette garde"
                if besoin_officier_remplacement else
                "Pas de contrainte officier (soit type de garde sans officier obligatoire, soit le demandeur n'est pas officier, soit un autre officier est déjà présent)"
            )
        },
        "resume": {
            "total_utilisateurs": len(resultats),
            "eligibles": len(eligibles),
            "non_eligibles": len(non_eligibles)
        },
        "eligibles": eligibles,
        "non_eligibles": non_eligibles
    }
