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
    creer_activite,
    user_has_module_action,
    require_permission
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
            logger.warning(f"⚠️ Aucun remplaçant trouvé pour la demande {demande_id} — passage en quart ouvert")
            
            # Passer en statut "ouvert" au lieu de "expiree"
            await db.demandes_remplacement.update_one(
                {"id": demande_id},
                {
                    "$set": {
                        "statut": "ouvert",
                        "date_ouverture": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
            demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Un employe"
            type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant_id})
            type_garde_nom = type_garde.get("nom", "une garde") if type_garde else "une garde"
            
            # Notifier superviseurs
            superviseurs = await db.users.find({
                "tenant_id": tenant_id,
                "role": {"$in": ["superviseur", "admin"]}
            }).to_list(100)
            
            superviseur_ids = [s["id"] for s in superviseurs]
            if superviseur_ids:
                await send_push_notification_to_users(
                    user_ids=superviseur_ids,
                    title="Quart ouvert",
                    body=f"Aucun remplacant trouve pour {demandeur_nom} le {demande_data['date']}. Le quart est maintenant ouvert a tous.",
                    data={
                        "type": "quart_ouvert",
                        "demande_id": demande_id
                    }
                )
                
                for sup in superviseurs:
                    await creer_notification(
                        tenant_id=tenant_id,
                        destinataire_id=sup["id"],
                        type="quart_ouvert",
                        titre="Quart ouvert a tous",
                        message=f"Aucun remplacant trouve pour {demandeur_nom} le {demande_data['date']}. Le quart ({type_garde_nom}) est maintenant ouvert a tous les employes.",
                        lien="/remplacements",
                        data={"demande_id": demande_id},
                        envoyer_email=True
                    )
            
            # Notifier le demandeur
            demandeur_id = demande_data.get("demandeur_id")
            if demandeur_id:
                await send_push_notification_to_users(
                    user_ids=[demandeur_id],
                    title="Quart ouvert a tous",
                    body=f"Aucun remplacant n'a ete trouve automatiquement pour votre {type_garde_nom} du {demande_data['date']}. Le quart est maintenant ouvert a tous les employes.",
                    data={
                        "type": "quart_ouvert",
                        "demande_id": demande_id
                    }
                )
                await db.notifications.insert_one({
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant_id,
                    "destinataire_id": demandeur_id,
                    "type": "quart_ouvert",
                    "titre": "Quart ouvert a tous",
                    "message": f"Aucun remplacant n'a ete trouve automatiquement pour votre {type_garde_nom} du {demande_data['date']}. Le quart est maintenant ouvert a tous les employes.",
                    "statut": "non_lu",
                    "lu": False,
                    "data": {"demande_id": demande_id},
                    "date_creation": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
            
            # Broadcast à TOUS les employés actifs (sauf le demandeur)
            tous_employes = await db.users.find({
                "tenant_id": tenant_id,
                "actif": {"$ne": False},
                "id": {"$ne": demande_data["demandeur_id"]}
            }).to_list(None)
            
            employe_ids = [e["id"] for e in tous_employes]
            if employe_ids:
                await send_push_notification_to_users(
                    user_ids=employe_ids,
                    title="Quart disponible",
                    body=f"Un quart de {type_garde_nom} le {demande_data['date']} est disponible. Premier arrive, premier servi !",
                    data={
                        "type": "quart_ouvert",
                        "demande_id": demande_id,
                        "lien": "/remplacements"
                    }
                )
                
                # Notification in-app pour tous les employés
                notifications_batch = []
                for emp in tous_employes:
                    notifications_batch.append({
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant_id,
                        "destinataire_id": emp["id"],
                        "type": "quart_ouvert",
                        "titre": "Quart disponible",
                        "message": f"Un quart de {type_garde_nom} le {demande_data['date']} est disponible. Rendez-vous dans Remplacements pour le prendre !",
                        "statut": "non_lu",
                        "lu": False,
                        "data": {"demande_id": demande_id, "lien": "/remplacements"},
                        "date_creation": datetime.now(timezone.utc).isoformat(),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                if notifications_batch:
                    await db.notifications.insert_many(notifications_batch)
                    logger.info(f"📢 {len(notifications_batch)} notification(s) 'quart ouvert' envoyées à tous les employés")
            
            # Envoyer un email au demandeur
            try:
                tenant = await db.tenants.find_one({"id": tenant_id})
                await envoyer_email_remplacement_non_trouve(
                    db=db,
                    demande_data=demande_data,
                    demandeur=demandeur,
                    type_garde=type_garde,
                    tenant=tenant
                )
            except Exception as email_error:
                logger.warning(f"⚠️ Erreur envoi email remplacement non trouvé: {email_error}")
            
            # Broadcaster la mise à jour WebSocket
            tenant_data = await db.tenants.find_one({"id": tenant_id})
            tenant_slug_ws = tenant_data.get("slug", "") if tenant_data else ""
            if tenant_slug_ws:
                asyncio.create_task(broadcast_remplacement_update(tenant_slug_ws, "quart_ouvert", {
                    "demande_id": demande_id,
                    "demandeur_nom": demandeur_nom,
                    "date": demande_data["date"],
                    "type_garde_nom": type_garde_nom
                }))
            
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
                "destinataire_id": remplacant_id,
                "type": "remplacement_proposition",
                "titre": "Demande de remplacement urgente",
                "message": f"{demandeur_nom} cherche un remplaçant pour {type_garde_nom} le {demande_data['date']}. Répondez rapidement !",
                "statut": "non_lu",
                "lu": False,
                "urgent": True,
                "data": {
                    "demande_id": demande_id,
                    "lien": "/remplacements"
                },
                "date_creation": datetime.now(timezone.utc).isoformat(),
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
    """Créer une demande de remplacement et lancer automatiquement la recherche.
    
    Si target_user_id est fourni et l'utilisateur courant a la permission 'remplacements.modifier',
    la demande sera créée au nom de l'employé ciblé.
    """
    try:
        send_push_notification_to_users = await get_send_push_notification()
        
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Déterminer le demandeur effectif
        demandeur_id = current_user.id
        created_by_id = None
        created_by_nom = None
        
        # Si target_user_id est fourni, vérifier la permission et utiliser cet utilisateur comme demandeur
        if demande.target_user_id and demande.target_user_id != current_user.id:
            # Vérifier que l'utilisateur courant a la permission de créer pour autrui
            can_create_for_others = await user_has_module_action(tenant.id, current_user, "remplacements", "modifier")
            if not can_create_for_others:
                raise HTTPException(
                    status_code=403, 
                    detail="Vous n'avez pas la permission de créer des demandes de remplacement pour d'autres employés."
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
            
            logger.info(f"📋 Création de demande pour {target_user.get('prenom')} {target_user.get('nom')} par {current_user.prenom} {current_user.nom}")
        
        # ==================== VALIDATION: Vérifier que le demandeur est bien planifié ====================
        assignation_existante = await db.assignations.find_one({
            "tenant_id": tenant.id,
            "user_id": demandeur_id,
            "date": demande.date,
            "type_garde_id": demande.type_garde_id
        })
        
        if not assignation_existante:
            # Récupérer le nom du type de garde pour un message clair
            type_garde = await db.types_garde.find_one({"id": demande.type_garde_id, "tenant_id": tenant.id})
            type_garde_nom = type_garde.get("nom", "ce type de garde") if type_garde else "ce type de garde"
            
            # Message différent selon si c'est pour soi ou pour un autre
            if demandeur_id != current_user.id:
                target_user = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant.id})
                nom_employe = f"{target_user.get('prenom', '')} {target_user.get('nom', '')}" if target_user else "Cet employé"
                raise HTTPException(
                    status_code=400, 
                    detail=f"{nom_employe} n'est pas planifié(e) sur '{type_garde_nom}' le {demande.date}. Veuillez vérifier le planning."
                )
            else:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Vous n'êtes pas planifié sur '{type_garde_nom}' le {demande.date}. Veuillez vérifier votre planning."
                )
        # ==================== FIN VALIDATION ====================
        
        # ==================== ANTI-DOUBLON: Vérifier qu'une demande identique n'existe pas déjà ====================
        demande_existante = await db.demandes_remplacement.find_one({
            "tenant_id": tenant.id,
            "demandeur_id": demandeur_id,
            "date": demande.date,
            "type_garde_id": demande.type_garde_id,
            "statut": {"$in": ["en_attente", "en_cours"]}
        })
        
        if demande_existante:
            raise HTTPException(
                status_code=409,
                detail=f"Une demande de remplacement identique existe déjà pour cette date et ce type de garde (statut: {demande_existante['statut']})"
            )
        # ==================== FIN ANTI-DOUBLON ====================
        
        priorite = await calculer_priorite_demande(demande.date)
        
        demande_dict = demande.dict()
        demande_dict.pop("target_user_id", None)  # Retirer le champ temporaire
        demande_dict["tenant_id"] = tenant.id
        demande_dict["demandeur_id"] = demandeur_id
        demande_dict["priorite"] = priorite
        demande_dict["statut"] = "en_attente"
        
        # Ajouter la traçabilité si créé par un autre utilisateur
        if created_by_id:
            demande_dict["created_by_id"] = created_by_id
            demande_dict["created_by_nom"] = created_by_nom
        
        demande_obj = DemandeRemplacement(**demande_dict)
        await db.demandes_remplacement.insert_one(demande_obj.dict())
        
        # Récupérer le nom du demandeur effectif pour les notifications
        if demandeur_id != current_user.id:
            demandeur_user = await db.users.find_one({"id": demandeur_id, "tenant_id": tenant.id})
            demandeur_prenom = demandeur_user.get("prenom", "") if demandeur_user else ""
            demandeur_nom = demandeur_user.get("nom", "") if demandeur_user else ""
        else:
            demandeur_prenom = current_user.prenom
            demandeur_nom = current_user.nom
        
        logger.info(f"✅ Demande de remplacement créée: {demande_obj.id} (priorité: {priorite})" + 
                   (f" - créée par {created_by_nom}" if created_by_nom else ""))
        
        superviseurs_admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = [u["id"] for u in superviseurs_admins]
        
        # Notifications aux superviseurs en arrière-plan (non bloquant)
        async def notifier_superviseurs():
            for user in superviseurs_admins:
                try:
                    await creer_notification(
                        tenant_id=tenant.id,
                        destinataire_id=user["id"],
                        type="remplacement_demande",
                        titre=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement en cours",
                        message=f"{demandeur_prenom} {demandeur_nom} cherche un remplaçant pour le {demande.date}" + 
                               (f" (créé par {created_by_nom})" if created_by_nom else ""),
                        lien="/remplacements",
                        data={"demande_id": demande_obj.id},
                        envoyer_email=False
                    )
                except Exception as e:
                    logger.warning(f"⚠️ Erreur notification superviseur: {e}")
            
            if superviseur_ids:
                try:
                    await send_push_notification_to_users(
                        user_ids=superviseur_ids,
                        title=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement",
                        body=f"{demandeur_prenom} {demandeur_nom} cherche un remplaçant pour le {demande.date}",
                        data={
                            "type": "remplacement_demande",
                            "demande_id": demande_obj.id,
                            "lien": "/remplacements"
                        }
                    )
                except Exception as e:
                    logger.warning(f"⚠️ Erreur push superviseurs: {e}")
        
        asyncio.create_task(notifier_superviseurs())
        
        # Lancer la recherche de remplaçant EN ARRIÈRE-PLAN pour une réponse plus rapide
        asyncio.create_task(lancer_recherche_remplacant(demande_obj.id, tenant.id))
        
        type_garde = await db.types_garde.find_one({"id": demande.type_garde_id, "tenant_id": tenant.id})
        garde_nom = type_garde['nom'] if type_garde else 'garde'
        
        # Créer l'activité aussi en arrière-plan
        description_activite = f"🔄 {demandeur_prenom} {demandeur_nom} cherche un remplaçant pour la {garde_nom} du {demande.date}"
        if created_by_nom:
            description_activite += f" (créé par {created_by_nom})"
        
        asyncio.create_task(creer_activite(
            tenant_id=tenant.id,
            type_activite="remplacement_demande",
            description=description_activite,
            user_id=demandeur_id,
            user_nom=f"{demandeur_prenom} {demandeur_nom}"
        ))
        
        # Broadcaster la mise à jour pour actualiser les pages des autres utilisateurs
        asyncio.create_task(broadcast_remplacement_update(tenant_slug, "nouvelle_demande", {
            "demande_id": demande_obj.id,
            "demandeur_nom": f"{demandeur_prenom} {demandeur_nom}",
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
    # RBAC: Vérifier si l'utilisateur peut voir toutes les demandes
    can_view_all = await user_has_module_action(tenant.id, current_user, "remplacements", "voir", "toutes-demandes")
    return await export_remplacements_to_pdf(db, tenant, current_user, user_id, can_view_all)


@router.get("/{tenant_slug}/remplacements/export-excel")
async def export_remplacements_excel(
    tenant_slug: str,
    user_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Export des demandes de remplacement en Excel"""
    tenant = await get_tenant_from_slug(tenant_slug)
    # RBAC: Vérifier si l'utilisateur peut voir toutes les demandes
    can_view_all = await user_has_module_action(tenant.id, current_user, "remplacements", "voir", "toutes-demandes")
    return await export_remplacements_to_excel(db, tenant, current_user, user_id, can_view_all)


@router.get("/{tenant_slug}/remplacements/quarts-ouverts")
async def get_quarts_ouverts(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Retourne les quarts ouverts (disponibles pour tous) dont la date n'est pas passée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    demandes = await db.demandes_remplacement.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["ouvert", "en_attente_approbation"]},
        "date": {"$gte": today}
    }).to_list(100)
    
    quarts = []
    for demande in demandes:
        cleaned = clean_mongo_doc(demande)
        
        # Enrichir avec le nom du demandeur
        demandeur = await db.users.find_one({"id": cleaned.get("demandeur_id")}, {"prenom": 1, "nom": 1})
        if demandeur:
            cleaned["demandeur_nom"] = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}".strip()
        
        # Enrichir avec le type de garde
        type_garde = await db.types_garde.find_one({"id": cleaned.get("type_garde_id")}, {"nom": 1, "heure_debut": 1, "heure_fin": 1})
        if type_garde:
            cleaned["type_garde_nom"] = type_garde.get("nom", "")
            cleaned["type_garde_heure_debut"] = type_garde.get("heure_debut", "")
            cleaned["type_garde_heure_fin"] = type_garde.get("heure_fin", "")
        
        # Enrichir avec le nom du volontaire si en attente d'approbation
        if cleaned.get("volontaire_id"):
            volontaire = await db.users.find_one({"id": cleaned["volontaire_id"]}, {"prenom": 1, "nom": 1})
            if volontaire:
                cleaned["volontaire_nom"] = f"{volontaire.get('prenom', '')} {volontaire.get('nom', '')}".strip()
        
        quarts.append(cleaned)
    
    return quarts


@router.put("/{tenant_slug}/remplacements/{demande_id}/prendre")
async def prendre_quart_ouvert(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Permet à n'importe quel employé de prendre un quart ouvert"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvee")
    
    if demande_data["statut"] != "ouvert":
        raise HTTPException(status_code=400, detail="Ce quart n'est plus disponible")
    
    # Empêcher le demandeur de prendre son propre quart
    if current_user.id == demande_data["demandeur_id"]:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas prendre votre propre quart")
    
    # Vérifier que la date n'est pas passée
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if demande_data["date"] < today:
        raise HTTPException(status_code=400, detail="Ce quart est pour une date passee")
    
    maintenant = datetime.now(timezone.utc)
    
    # Vérifier le paramètre d'approbation
    parametres = await db.parametres_remplacements.find_one({"tenant_id": tenant.id})
    approbation_requise = parametres.get("quart_ouvert_approbation_requise", False) if parametres else False
    
    remplacant_nom = f"{current_user.prenom} {current_user.nom}"
    demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
    demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "le demandeur"
    demandeur_id = demande_data["demandeur_id"]
    type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant.id})
    type_garde_nom = type_garde.get("nom", "une garde") if type_garde else "une garde"
    
    if approbation_requise:
        # Mode avec approbation : statut "en_attente_approbation"
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "en_attente_approbation",
                    "volontaire_id": current_user.id,
                    "volontaire_nom": remplacant_nom,
                    "pris_via_quart_ouvert": True,
                    "updated_at": maintenant
                }
            }
        )
        
        # Notifier les superviseurs pour approbation
        superviseurs = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        for sup in superviseurs:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=sup["id"],
                type="quart_attente_approbation",
                titre="Quart ouvert : approbation requise",
                message=f"{remplacant_nom} souhaite prendre le quart de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']}. Approbation requise.",
                lien="/remplacements",
                data={"demande_id": demande_id, "volontaire_id": current_user.id},
                envoyer_email=True
            )
        
        await send_push_notification_to_users(
            user_ids=[s["id"] for s in superviseurs],
            title="Quart ouvert : approbation requise",
            body=f"{remplacant_nom} veut prendre le quart de {demandeur_nom} ({type_garde_nom}) du {demande_data['date']}",
            data={"type": "quart_attente_approbation", "demande_id": demande_id}
        )
        
        # Notifier le volontaire
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "destinataire_id": current_user.id,
            "type": "quart_en_attente",
            "titre": "Candidature envoyee",
            "message": f"Votre candidature pour le quart de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']} est en attente d'approbation.",
            "statut": "non_lu",
            "lu": False,
            "data": {"demande_id": demande_id},
            "date_creation": maintenant.isoformat(),
            "created_at": maintenant.isoformat()
        })
        
        asyncio.create_task(broadcast_remplacement_update(tenant_slug, "quart_attente_approbation", {
            "demande_id": demande_id,
            "volontaire_id": current_user.id,
            "volontaire_nom": remplacant_nom,
            "demandeur_nom": demandeur_nom,
            "date": demande_data["date"]
        }))
        
        logger.info(f"Quart ouvert candidature: {remplacant_nom} pour le quart de {demandeur_nom} ({demande_id}) - attente approbation")
        
        return {
            "message": f"Candidature envoyee ! Un superviseur doit approuver avant confirmation.",
            "demande_id": demande_id,
            "approbation_requise": True
        }
    
    # Mode automatique (premier arrivé, premier servi)
    # Mettre à jour la demande
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "accepte",
                "remplacant_id": current_user.id,
                "pris_via_quart_ouvert": True,
                "updated_at": maintenant
            }
        }
    )
    
    # Mettre à jour le planning (remplacer l'assignation)
    assignation = await db.assignations.find_one({
        "tenant_id": tenant.id,
        "user_id": demande_data["demandeur_id"],
        "date": demande_data["date"],
        "type_garde_id": demande_data["type_garde_id"]
    })
    
    if assignation:
        await db.assignations.update_one(
            {"id": assignation["id"]},
            {
                "$set": {
                    "user_id": current_user.id,
                    "est_remplacement": True,
                    "demandeur_original_id": demande_data["demandeur_id"],
                    "pris_via_quart_ouvert": True,
                    "updated_at": maintenant
                }
            }
        )
        logger.info(f"Planning mis a jour: {remplacant_nom} prend l'assignation {assignation['id']}")
    
    # Notifier le demandeur
    await send_push_notification_to_users(
        user_ids=[demandeur_id],
        title="Remplacant trouve !",
        body=f"{remplacant_nom} a pris votre quart de {type_garde_nom} du {demande_data['date']}.",
        data={"type": "quart_pris", "demande_id": demande_id}
    )
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "destinataire_id": demandeur_id,
        "type": "quart_pris",
        "titre": "Remplacant trouve !",
        "message": f"{remplacant_nom} a pris votre quart de {type_garde_nom} du {demande_data['date']}.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": demande_id, "remplacant_id": current_user.id},
        "date_creation": maintenant.isoformat(),
        "created_at": maintenant.isoformat()
    })
    
    # Notifier les superviseurs
    superviseurs = await db.users.find({
        "tenant_id": tenant.id,
        "role": {"$in": ["superviseur", "admin"]}
    }).to_list(100)
    
    for sup in superviseurs:
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=sup["id"],
            type="quart_pris",
            titre="Quart ouvert pris",
            message=f"{remplacant_nom} a pris le quart de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']}.",
            lien="/remplacements",
            data={"demande_id": demande_id},
            envoyer_email=False
        )
    
    # Activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="quart_ouvert_pris",
        description=f"{remplacant_nom} a pris le quart ouvert de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']}",
        user_id=current_user.id,
        user_nom=remplacant_nom
    )
    
    # Broadcaster la mise à jour WebSocket
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "quart_pris", {
        "demande_id": demande_id,
        "remplacant_id": current_user.id,
        "remplacant_nom": remplacant_nom,
        "demandeur_nom": demandeur_nom,
        "date": demande_data["date"]
    }))
    
    logger.info(f"Quart ouvert pris: {remplacant_nom} prend le quart de {demandeur_nom} ({demande_id})")
    
    return {
        "message": f"Quart pris avec succes ! Vous remplacez {demandeur_nom} le {demande_data['date']}.",
        "demande_id": demande_id,
        "approbation_requise": False
    }


@router.put("/{tenant_slug}/remplacements/{demande_id}/approuver-quart")
async def approuver_quart_ouvert(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Permet à un admin/superviseur d'approuver un volontaire pour un quart ouvert"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier permission admin/superviseur
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Seuls les superviseurs peuvent approuver")
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvee")
    
    if demande_data["statut"] != "en_attente_approbation":
        raise HTTPException(status_code=400, detail="Cette demande n'est pas en attente d'approbation")
    
    volontaire_id = demande_data.get("volontaire_id")
    if not volontaire_id:
        raise HTTPException(status_code=400, detail="Aucun volontaire associe")
    
    maintenant = datetime.now(timezone.utc)
    
    # Approuver : passer en "accepte" et assigner le remplaçant
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "accepte",
                "remplacant_id": volontaire_id,
                "approuve_par_id": current_user.id,
                "date_approbation": maintenant.isoformat(),
                "updated_at": maintenant
            }
        }
    )
    
    # Mettre à jour le planning
    assignation = await db.assignations.find_one({
        "tenant_id": tenant.id,
        "user_id": demande_data["demandeur_id"],
        "date": demande_data["date"],
        "type_garde_id": demande_data["type_garde_id"]
    })
    
    if assignation:
        await db.assignations.update_one(
            {"id": assignation["id"]},
            {
                "$set": {
                    "user_id": volontaire_id,
                    "est_remplacement": True,
                    "demandeur_original_id": demande_data["demandeur_id"],
                    "pris_via_quart_ouvert": True,
                    "updated_at": maintenant
                }
            }
        )
    
    volontaire = await db.users.find_one({"id": volontaire_id})
    volontaire_nom = demande_data.get("volontaire_nom", f"{volontaire.get('prenom', '')} {volontaire.get('nom', '')}" if volontaire else "Volontaire")
    demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
    demandeur_nom = f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "le demandeur"
    type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant.id})
    type_garde_nom = type_garde.get("nom", "une garde") if type_garde else "une garde"
    
    # Notifier le volontaire
    await send_push_notification_to_users(
        user_ids=[volontaire_id],
        title="Candidature approuvee !",
        body=f"Votre candidature pour le quart de {type_garde_nom} du {demande_data['date']} a ete approuvee.",
        data={"type": "quart_approuve", "demande_id": demande_id}
    )
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "destinataire_id": volontaire_id,
        "type": "quart_approuve",
        "titre": "Candidature approuvee !",
        "message": f"Votre candidature pour le quart de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']} a ete approuvee par {current_user.prenom} {current_user.nom}.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": demande_id},
        "date_creation": maintenant.isoformat(),
        "created_at": maintenant.isoformat()
    })
    
    # Notifier le demandeur
    demandeur_id = demande_data["demandeur_id"]
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "destinataire_id": demandeur_id,
        "type": "quart_pris",
        "titre": "Remplacant trouve !",
        "message": f"{volontaire_nom} a ete approuve pour votre quart de {type_garde_nom} du {demande_data['date']}.",
        "statut": "non_lu",
        "lu": False,
        "data": {"demande_id": demande_id, "remplacant_id": volontaire_id},
        "date_creation": maintenant.isoformat(),
        "created_at": maintenant.isoformat()
    })
    
    # Activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="quart_ouvert_approuve",
        description=f"{current_user.prenom} {current_user.nom} a approuve {volontaire_nom} pour le quart de {type_garde_nom} ({demandeur_nom}) du {demande_data['date']}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "quart_approuve", {
        "demande_id": demande_id,
        "volontaire_nom": volontaire_nom,
        "demandeur_nom": demandeur_nom,
        "date": demande_data["date"]
    }))
    
    return {"message": f"Quart approuve ! {volontaire_nom} remplace {demandeur_nom} le {demande_data['date']}."}


@router.put("/{tenant_slug}/remplacements/{demande_id}/refuser-quart")
async def refuser_quart_ouvert(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """Permet à un admin/superviseur de refuser un volontaire et remettre le quart en 'ouvert'"""
    send_push_notification_to_users = await get_send_push_notification()
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Seuls les superviseurs peuvent refuser")
    
    demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande_data:
        raise HTTPException(status_code=404, detail="Demande non trouvee")
    
    if demande_data["statut"] != "en_attente_approbation":
        raise HTTPException(status_code=400, detail="Cette demande n'est pas en attente d'approbation")
    
    volontaire_id = demande_data.get("volontaire_id")
    maintenant = datetime.now(timezone.utc)
    
    # Remettre en "ouvert"
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "ouvert",
                "updated_at": maintenant
            },
            "$unset": {
                "volontaire_id": "",
                "volontaire_nom": ""
            }
        }
    )
    
    # Notifier le volontaire
    if volontaire_id:
        volontaire = await db.users.find_one({"id": volontaire_id})
        volontaire_nom = f"{volontaire.get('prenom', '')} {volontaire.get('nom', '')}" if volontaire else "Volontaire"
        type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"], "tenant_id": tenant.id})
        type_garde_nom = type_garde.get("nom", "une garde") if type_garde else "une garde"
        
        await send_push_notification_to_users(
            user_ids=[volontaire_id],
            title="Candidature refusee",
            body=f"Votre candidature pour le quart du {demande_data['date']} n'a pas ete retenue.",
            data={"type": "quart_refuse", "demande_id": demande_id}
        )
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "destinataire_id": volontaire_id,
            "type": "quart_refuse",
            "titre": "Candidature non retenue",
            "message": f"Votre candidature pour le quart de {type_garde_nom} du {demande_data['date']} n'a pas ete retenue. Le quart est a nouveau ouvert.",
            "statut": "non_lu",
            "lu": False,
            "data": {"demande_id": demande_id},
            "date_creation": maintenant.isoformat(),
            "created_at": maintenant.isoformat()
        })
    
    asyncio.create_task(broadcast_remplacement_update(tenant_slug, "quart_refuse", {
        "demande_id": demande_id,
        "date": demande_data["date"]
    }))
    
    return {"message": "Candidature refusee. Le quart est a nouveau ouvert."}


@router.get("/{tenant_slug}/remplacements", response_model=List[DemandeRemplacement])
async def get_demandes_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Liste des demandes de remplacement avec les noms des demandeurs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier si l'utilisateur peut voir toutes les demandes
    can_view_all = await user_has_module_action(tenant.id, current_user, "remplacements", "voir", "toutes-demandes")
    
    if not can_view_all:
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
    
    maintenant = datetime.now(timezone.utc)
    propositions = []
    for demande in demandes:
        # Filtrer les demandes dont le temps alloué est dépassé
        date_prochaine = demande.get("date_prochaine_tentative")
        if date_prochaine:
            try:
                if isinstance(date_prochaine, str):
                    date_prochaine = datetime.fromisoformat(date_prochaine.replace('Z', '+00:00'))
                if maintenant > date_prochaine:
                    continue  # Temps dépassé, ne pas afficher
            except Exception:
                pass
        
        # Vérifier si la tentative du user est marquée comme expirée
        tentative_expiree = False
        for tentative in demande.get("tentatives_historique", []):
            if tentative.get("user_id") == current_user.id and tentative.get("statut") == "expired":
                tentative_expiree = True
                break
        if tentative_expiree:
            continue
        
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
    
    # Vérifier les permissions via RBAC : demandeur ou permission de voir toutes les demandes
    can_view_all = await user_has_module_action(tenant.id, current_user, "remplacements", "voir", "toutes-demandes")
    if not can_view_all and demande.get("demandeur_id") != current_user.id:
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
    
    # RBAC: Vérifier permission de modifier toutes les demandes
    await require_permission(tenant.id, current_user, "remplacements", "modifier", "toutes-demandes")
    
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
                "destinataire_id": demandeur_id,
                "type": "remplacement_arrete",
                "titre": "Processus arrete",
                "message": f"Le processus de remplacement du {demande_data['date']} a ete arrete par {current_user.prenom} {current_user.nom}.",
                "statut": "non_lu",
                "lu": False,
                "data": {"demande_id": demande_id},
                "date_creation": maintenant.isoformat(),
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
    if demande_data["statut"] not in ["expiree", "annulee", "ouvert"]:
        raise HTTPException(status_code=400, detail="Seules les demandes expirées ou annulées peuvent être relancées")
    
    # Vérifier que l'utilisateur a le droit via RBAC (permission modifier ou demandeur original)
    can_modify_all = await user_has_module_action(tenant.id, current_user, "remplacements", "modifier", "toutes-demandes")
    if not can_modify_all and current_user.id != demande_data.get("demandeur_id"):
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
    """Supprimer une demande de remplacement (selon permissions RBAC)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions RBAC pour l'action "supprimer" sur le module "remplacements"
    can_delete = await user_has_module_action(tenant.id, current_user, "remplacements", "supprimer")
    if not can_delete:
        raise HTTPException(status_code=403, detail="Vous n'avez pas la permission de supprimer des demandes")
    
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
    
    # RBAC: Vérifier permission de supprimer sur le module remplacements
    await require_permission(tenant.id, current_user, "remplacements", "supprimer", "toutes-demandes")
    
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


@router.get("/remplacement-action/{token}/{action}")
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
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message=Cette demande est {status_label}",
                status_code=302
            )
        
        # Vérifier si le temps alloué au remplaçant est écoulé
        temps_depasse = False
        
        # 1. Vérifier si le remplaçant est encore dans la liste des contactés
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            temps_depasse = True
            logger.info(f"⏱️ Remplaçant {remplacant_id} n'est plus dans les contactés pour demande {demande_id}")
        
        # 2. Vérifier si la tentative du remplaçant est marquée comme expirée
        if not temps_depasse:
            for tentative in demande_data.get("tentatives_historique", []):
                if tentative.get("user_id") == remplacant_id and tentative.get("statut") == "expired":
                    temps_depasse = True
                    logger.info(f"⏱️ Tentative expirée pour remplaçant {remplacant_id} dans demande {demande_id}")
                    break
        
        # 3. Vérifier si date_prochaine_tentative est dépassée (le batch a expiré)
        if not temps_depasse and demande_data.get("date_prochaine_tentative"):
            try:
                date_prochaine = demande_data["date_prochaine_tentative"]
                if isinstance(date_prochaine, str):
                    date_prochaine = datetime.fromisoformat(date_prochaine.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) > date_prochaine:
                    temps_depasse = True
                    logger.info(f"⏱️ date_prochaine_tentative dépassée pour demande {demande_id}")
            except Exception as e:
                logger.warning(f"⚠️ Erreur parsing date_prochaine_tentative: {e}")
        
        if temps_depasse:
            msg = "Temps dépassé, impossible de choisir"
            return RedirectResponse(
                url=f"{frontend_url}/remplacement-resultat?status=erreur&message={msg}",
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


@router.delete("/{tenant_slug}/remplacements/{demande_id}/annuler")
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




@router.get("/remplacement-check-token/{token}")
async def check_remplacement_token(token: str):
    """Vérifie si un token de remplacement est encore valide (temps non dépassé)"""
    try:
        token_data = await db.tokens_remplacement.find_one({"token": token})
        
        if not token_data:
            return {"valid": False, "reason": "Token invalide ou expiré"}
        
        # Vérifier expiration du token (48h)
        expiration = datetime.fromisoformat(token_data["expiration"].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expiration:
            return {"valid": False, "reason": "Ce lien a expiré"}
        
        if token_data.get("utilise"):
            return {"valid": False, "reason": "Cette action a déjà été traitée"}
        
        demande_id = token_data["demande_id"]
        remplacant_id = token_data["remplacant_id"]
        tenant_id = token_data["tenant_id"]
        
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            return {"valid": False, "reason": "Demande non trouvée"}
        
        if demande_data["statut"] not in ["en_cours", "en_attente"]:
            status_label = {
                "accepte": "déjà acceptée",
                "expiree": "expirée",
                "annulee": "annulée",
                "approuve_manuellement": "déjà approuvée"
            }.get(demande_data["statut"], demande_data["statut"])
            return {"valid": False, "reason": f"Cette demande est {status_label}"}
        
        # Vérifier si le temps alloué est écoulé
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            return {"valid": False, "reason": "Temps dépassé, impossible de choisir"}
        
        for tentative in demande_data.get("tentatives_historique", []):
            if tentative.get("user_id") == remplacant_id and tentative.get("statut") == "expired":
                return {"valid": False, "reason": "Temps dépassé, impossible de choisir"}
        
        if demande_data.get("date_prochaine_tentative"):
            try:
                date_prochaine = demande_data["date_prochaine_tentative"]
                if isinstance(date_prochaine, str):
                    date_prochaine = datetime.fromisoformat(date_prochaine.replace('Z', '+00:00'))
                if datetime.now(timezone.utc) > date_prochaine:
                    return {"valid": False, "reason": "Temps dépassé, impossible de choisir"}
            except Exception:
                pass
        
        # Récupérer les infos pour affichage
        demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
        type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"]})
        
        return {
            "valid": True,
            "demandeur_nom": f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')}" if demandeur else "Inconnu",
            "date": demande_data.get("date", ""),
            "type_garde_nom": type_garde.get("nom", "Garde") if type_garde else "Garde",
            "heure_debut": type_garde.get("heure_debut", "") if type_garde else "",
            "heure_fin": type_garde.get("heure_fin", "") if type_garde else "",
            "raison": demande_data.get("raison", "")
        }
        
    except Exception as e:
        logger.error(f"Erreur vérification token remplacement: {e}", exc_info=True)
        return {"valid": False, "reason": "Une erreur est survenue"}
