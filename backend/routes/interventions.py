"""
Routes API pour le module Gestion des Interventions
===================================================

Ce module gère toute la fonctionnalité des interventions :
- CRUD des interventions
- Import XML depuis les centrales 911
- Calcul des primes de repas
- Équipes de garde
- Assignation des rédacteurs
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import xml.etree.ElementTree as ET
import uuid
import logging
import re

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Interventions"])
logger = logging.getLogger(__name__)


import xml.etree.ElementTree as ET

def parse_xml_datetime_intervention(date_str: str, time_str: str):
    """Parse date et heure du XML en datetime"""
    if not date_str or not time_str or time_str == "00:00:00":
        return None
    try:
        dt_str = f"{date_str} {time_str}"
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return dt
    except:
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return dt
        except:
            return None


async def calculate_meal_primes_for_intervention(intervention: dict, settings: dict) -> dict:
    """
    Calcule automatiquement les primes de repas en fonction des heures d'intervention.
    Retourne un dict avec les informations de primes à appliquer.
    """
    if not settings:
        return None
    
    # Récupérer les heures de l'intervention
    time_start = intervention.get("xml_time_call_received")
    time_end = intervention.get("xml_time_call_closed") or intervention.get("xml_time_terminated")
    
    if not time_start or not time_end:
        return None
    
    try:
        # Convertir en datetime
        if isinstance(time_start, str):
            start_dt = datetime.fromisoformat(time_start.replace('Z', '+00:00'))
        else:
            start_dt = time_start
        
        if isinstance(time_end, str):
            end_dt = datetime.fromisoformat(time_end.replace('Z', '+00:00'))
        else:
            end_dt = time_end
        
        # Calculer la durée en heures
        duree_heures = (end_dt - start_dt).total_seconds() / 3600
        
        # Fonction pour vérifier si une période est couverte
        def check_meal_period(config, start_dt, end_dt, duree):
            if not config or not config.get("actif"):
                return False
            
            heure_debut = config.get("heure_debut", "00:00")
            heure_fin = config.get("heure_fin", "23:59")
            duree_min = config.get("duree_minimum", 0)
            
            # Vérifier la durée minimum
            if duree < duree_min:
                return False
            
            # Parser les heures de la période
            h_debut, m_debut = map(int, heure_debut.split(':'))
            h_fin, m_fin = map(int, heure_fin.split(':'))
            
            # Créer les datetimes pour la période du repas le jour de l'intervention
            periode_debut = start_dt.replace(hour=h_debut, minute=m_debut, second=0, microsecond=0)
            periode_fin = start_dt.replace(hour=h_fin, minute=m_fin, second=0, microsecond=0)
            
            # Vérifier si l'intervention chevauche la période du repas
            return start_dt < periode_fin and end_dt > periode_debut
        
        # Calculer les primes pour chaque repas
        prime_dejeuner = check_meal_period(settings.get("repas_dejeuner"), start_dt, end_dt, duree_heures)
        prime_diner = check_meal_period(settings.get("repas_diner"), start_dt, end_dt, duree_heures)
        prime_souper = check_meal_period(settings.get("repas_souper"), start_dt, end_dt, duree_heures)
        
        return {
            "prime_dejeuner": prime_dejeuner,
            "prime_diner": prime_diner,
            "prime_souper": prime_souper,
            "duree_heures": round(duree_heures, 2)
        }
        
    except Exception as e:
        logging.error(f"Erreur calcul primes repas: {e}")
        return None


@router.get("/{tenant_slug}/interventions")
async def list_interventions(
    tenant_slug: str,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Liste les interventions avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    query = {"tenant_id": tenant.id}
    
    if status:
        query["status"] = status
    
    if date_from:
        try:
            query["created_at"] = {"$gte": datetime.fromisoformat(date_from)}
        except:
            pass
    if date_to:
        try:
            if "created_at" in query:
                query["created_at"]["$lte"] = datetime.fromisoformat(date_to)
            else:
                query["created_at"] = {"$lte": datetime.fromisoformat(date_to)}
        except:
            pass
    
    total = await db.interventions.count_documents(query)
    
    interventions = await db.interventions.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    
    return {
        "interventions": interventions,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/{tenant_slug}/interventions/dashboard")
async def get_interventions_dashboard(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Retourne les interventions groupées par statut pour le dashboard"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    pipeline = [
        {"$match": {"tenant_id": tenant.id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    
    status_counts = {}
    async for doc in db.interventions.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]
    
    # Récupérer les interventions par catégorie
    new_interventions = await db.interventions.find(
        {"tenant_id": tenant.id, "status": "new"}, {"_id": 0}
    ).sort("created_at", -1).limit(20).to_list(20)
    
    draft_interventions = await db.interventions.find(
        {"tenant_id": tenant.id, "status": {"$in": ["draft", "revision"]}}, {"_id": 0}
    ).sort("updated_at", -1).limit(20).to_list(20)
    
    review_interventions = await db.interventions.find(
        {"tenant_id": tenant.id, "status": "review"}, {"_id": 0}
    ).sort("updated_at", -1).limit(20).to_list(20)
    
    return {
        "counts": status_counts,
        "new": new_interventions,
        "drafts": draft_interventions,
        "review": review_interventions
    }


@router.get("/{tenant_slug}/interventions/reference-data")
async def get_intervention_reference_data(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les données de référence (natures, causes, etc.) depuis les tables DSI"""
    # Utiliser les nouvelles collections DSI
    natures = await db.dsi_natures_sinistre.find({}, {"_id": 0}).to_list(200)
    causes = await db.dsi_causes.find({}, {"_id": 0}).to_list(200)
    sources = await db.dsi_sources_chaleur.find({}, {"_id": 0}).to_list(200)
    materiaux = await db.dsi_materiaux.find({}, {"_id": 0}).to_list(200)
    facteurs = await db.dsi_facteurs_allumage.find({}, {"_id": 0}).to_list(200)
    usages = await db.dsi_usages_batiment.find({}, {"_id": 0}).to_list(200)
    
    # Formater les données pour le frontend (ajouter 'id' basé sur 'code')
    for n in natures:
        n['id'] = n.get('code', '')
        n['libelle'] = n.get('libelle', '')
    for c in causes:
        c['id'] = c.get('code', '')
    for s in sources:
        s['id'] = s.get('code', '')
    for m in materiaux:
        m['id'] = m.get('code', '')
    for f in facteurs:
        f['id'] = f.get('code', '')
    for u in usages:
        u['id'] = u.get('code', '')
    
    return {
        "natures": natures,
        "causes": causes,
        "sources_chaleur": sources,
        "materiaux": materiaux,
        "facteurs_allumage": facteurs,
        "usages_batiment": usages,
        "categories_batiment": usages  # Alias pour compatibilité
    }


@router.get("/{tenant_slug}/interventions/settings")
async def get_intervention_settings(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les paramètres du module"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    settings = await db.intervention_settings.find_one(
        {"tenant_id": tenant.id}, {"_id": 0}
    )
    
    if not settings:
        settings = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "supervisors_can_validate": True,
            "auto_assign_officer": True,
            "require_dsi_for_fire": True,
            "require_narrative": True,
            "alert_response_time_threshold": 480,
            "alert_on_import": True,
            "auto_archive_after_days": 365,
            "personnes_ressources": [],
            "validateurs": [],
            "acces_employes_historique": False,  # Par défaut, employés n'ont pas accès à l'historique
            "modeles_narratif": [
                {"id": "1", "titre": "Arrivée sur les lieux", "contenu": "À notre arrivée sur les lieux, nous avons constaté..."},
                {"id": "2", "titre": "Intervention standard", "contenu": "L'intervention s'est déroulée sans incident. Les opérations ont consisté en..."},
                {"id": "3", "titre": "Fausse alerte", "contenu": "Suite à notre investigation, il s'agit d'une fausse alerte causée par..."},
            ],
            "created_at": datetime.now(timezone.utc)
        }
        await db.intervention_settings.insert_one(settings)
        settings.pop("_id", None)
    
    # S'assurer que les champs existent toujours
    if "personnes_ressources" not in settings:
        settings["personnes_ressources"] = []
    if "validateurs" not in settings:
        settings["validateurs"] = []
    if "modeles_narratif" not in settings:
        settings["modeles_narratif"] = []
    
    return {"settings": settings}


@router.put("/{tenant_slug}/interventions/settings")
async def update_intervention_settings(
    tenant_slug: str,
    settings_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres du module"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    settings_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.intervention_settings.update_one(
        {"tenant_id": tenant.id},
        {"$set": settings_data},
        upsert=True
    )
    
    return {"success": True}


@router.get("/{tenant_slug}/interventions/detail/{intervention_id}")
async def get_intervention_detail(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une intervention avec ses ressources"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    intervention = await db.interventions.find_one(
        {"id": intervention_id, "tenant_id": tenant.id}, {"_id": 0}
    )
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Récupérer les ressources
    resources = await db.intervention_resources.find(
        {"intervention_id": intervention_id}, {"_id": 0}
    ).to_list(100)
    
    vehicles = await db.intervention_vehicles.find(
        {"intervention_id": intervention_id}, {"_id": 0}
    ).to_list(50)
    
    assistance = await db.intervention_assistance.find(
        {"intervention_id": intervention_id}, {"_id": 0}
    ).to_list(20)
    
    # Calculer les délais
    response_time = None
    if intervention.get("xml_time_dispatch") and intervention.get("xml_time_arrival_1st"):
        dispatch = intervention["xml_time_dispatch"]
        arrival = intervention["xml_time_arrival_1st"]
        if isinstance(dispatch, str):
            dispatch = datetime.fromisoformat(dispatch.replace('Z', '+00:00'))
        if isinstance(arrival, str):
            arrival = datetime.fromisoformat(arrival.replace('Z', '+00:00'))
        if dispatch and arrival:
            response_time = int((arrival - dispatch).total_seconds())
    
    return {
        "intervention": intervention,
        "resources": resources,
        "vehicles": vehicles,
        "assistance": assistance,
        "response_time_seconds": response_time
    }


@router.put("/{tenant_slug}/interventions/{intervention_id}")
async def update_intervention(
    tenant_slug: str,
    intervention_id: str,
    update_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    intervention = await db.interventions.find_one(
        {"id": intervention_id, "tenant_id": tenant.id}
    )
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Vérifier si l'intervention est signée - ajouter au journal d'audit
    if intervention.get("status") == "signed":
        audit_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": current_user.id,
            "user_name": f"{current_user.prenom} {current_user.nom}",
            "action": "modification_post_signature",
            "changes": {k: v for k, v in update_data.items() if k not in ["_id"]}
        }
        await db.interventions.update_one(
            {"id": intervention_id},
            {"$push": {"audit_log": audit_entry}}
        )
    
    # Préparer les données de mise à jour
    update_data.pop("_id", None)
    update_data.pop("id", None)
    update_data.pop("tenant_id", None)
    update_data["updated_at"] = datetime.now(timezone.utc)
    update_data["last_modified_by"] = current_user.id
    update_data["last_modified_at"] = datetime.now(timezone.utc)
    
    await db.interventions.update_one(
        {"id": intervention_id},
        {"$set": update_data}
    )
    
    updated = await db.interventions.find_one(
        {"id": intervention_id}, {"_id": 0}
    )
    
    return {"success": True, "intervention": updated}


@router.post("/{tenant_slug}/interventions/{intervention_id}/validate")
async def validate_intervention(
    tenant_slug: str,
    intervention_id: str,
    validation_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Valide ou retourne une intervention"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    intervention = await db.interventions.find_one(
        {"id": intervention_id, "tenant_id": tenant.id}
    )
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    action = validation_data.get("action")
    comment = validation_data.get("comment")
    
    update_data = {
        "updated_at": datetime.now(timezone.utc),
        "last_modified_by": current_user.id,
        "last_modified_at": datetime.now(timezone.utc)
    }
    
    if action == "submit":
        update_data["status"] = "review"
        
    elif action == "return_for_revision":
        update_data["status"] = "revision"
        if comment:
            audit_entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_id": current_user.id,
                "user_name": f"{current_user.prenom} {current_user.nom}",
                "action": "return_for_revision",
                "comment": comment
            }
            await db.interventions.update_one(
                {"id": intervention_id},
                {"$push": {"audit_log": audit_entry}}
            )
            
    elif action == "sign":
        # Vérifier les champs obligatoires pour incendie
        type_intervention = (intervention.get("type_intervention") or "").lower()
        if "incendie" in type_intervention and "alarme" not in type_intervention:
            settings = await db.intervention_settings.find_one(
                {"tenant_id": tenant.id}
            )
            if settings and settings.get("require_dsi_for_fire"):
                required_fields = ["cause_id", "source_heat_id"]
                missing = [f for f in required_fields if not intervention.get(f)]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Champs DSI obligatoires manquants: {', '.join(missing)}"
                    )
        
        # NOTE: Le calcul des primes de repas est maintenant effectué à l'import XML
        # Les primes suggérées sont stockées dans intervention.primes_suggerees
        # et peuvent être modifiées manuellement avant la signature.
        
        # ==================== DÉDUCTION DU STOCK POUR MATÉRIEL CONSOMMABLE ====================
        # Ne déduire le stock que si c'est la PREMIÈRE signature (pas une re-signature après déverrouillage)
        # On vérifie si stock_deductions existe déjà - si oui, c'est une re-signature
        already_deducted = len(intervention.get("stock_deductions", [])) > 0
        
        if already_deducted:
            logging.info(f"📦 Stock déjà déduit pour cette intervention - pas de nouvelle déduction")
            stock_deductions = intervention.get("stock_deductions", [])
        else:
            # Déduire le stock des équipements marqués comme "gerer_quantite" (consommables)
            materiel_utilise = intervention.get("materiel_utilise", [])
            stock_deductions = []
            
            for mat in materiel_utilise:
                materiel_id = mat.get("id")
                quantite_utilisee = mat.get("quantite", 1)
                
                if not materiel_id or quantite_utilisee <= 0:
                    continue
                
                # Récupérer l'équipement depuis la base de données
                equipement = await db.equipements.find_one({
                    "id": materiel_id,
                    "tenant_id": tenant.id
                })
                
                if not equipement:
                    continue
                
                # Vérifier si cet équipement a la gestion des quantités activée
                if equipement.get("gerer_quantite", False):
                    stock_actuel = equipement.get("quantite", 0)
                    nouveau_stock = max(0, stock_actuel - quantite_utilisee)
                    
                    # Mettre à jour le stock de l'équipement
                    await db.equipements.update_one(
                        {"id": materiel_id, "tenant_id": tenant.id},
                        {
                            "$set": {
                                "quantite": nouveau_stock,
                                "updated_at": datetime.now(timezone.utc),
                                # Activer l'alerte stock bas si nécessaire
                                "alerte_stock_bas": nouveau_stock <= equipement.get("quantite_minimum", 1)
                            }
                        }
                    )
                    
                    stock_deductions.append({
                        "equipement_id": materiel_id,
                        "equipement_nom": equipement.get("nom", ""),
                        "quantite_deduite": quantite_utilisee,
                        "stock_avant": stock_actuel,
                        "stock_apres": nouveau_stock
                    })
                    
                    logging.info(f"📦 Stock déduit: {equipement.get('nom')} - {quantite_utilisee} unité(s) (restant: {nouveau_stock})")
            
            # Enregistrer les déductions dans l'audit log si des stocks ont été modifiés
            if stock_deductions:
                audit_entry = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "user_id": current_user.id,
                    "user_name": f"{current_user.prenom} {current_user.nom}",
                    "action": "stock_deduction",
                    "comment": f"Déduction de stock pour {len(stock_deductions)} équipement(s) consommable(s)",
                    "details": stock_deductions
                }
                await db.interventions.update_one(
                    {"id": intervention_id},
                    {"$push": {"audit_log": audit_entry}}
                )
        
        update_data["status"] = "signed"
        update_data["signed_at"] = datetime.now(timezone.utc)
        update_data["signed_by"] = current_user.id
        update_data["stock_deductions"] = stock_deductions  # Sauvegarder pour référence
    
    await db.interventions.update_one(
        {"id": intervention_id},
        {"$set": update_data}
    )
    
    updated = await db.interventions.find_one(
        {"id": intervention_id}, {"_id": 0}
    )
    
    return {"success": True, "intervention": updated}


@router.post("/{tenant_slug}/interventions/{intervention_id}/unlock")
async def unlock_intervention(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Déverrouille une intervention signée pour permettre des modifications.
    Réservé aux administrateurs uniquement.
    Remet l'intervention en statut 'draft' (brouillon).
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que c'est un admin
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Seuls les administrateurs peuvent déverrouiller une intervention")
    
    # Récupérer l'intervention
    intervention = await db.interventions.find_one({
        "id": intervention_id,
        "tenant_id": tenant.id
    })
    
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    if intervention.get("status") != "signed":
        raise HTTPException(status_code=400, detail="Seules les interventions signées peuvent être déverrouillées")
    
    # Créer une entrée d'audit
    audit_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_id": current_user.id,
        "user_name": f"{current_user.prenom} {current_user.nom}",
        "action": "unlock",
        "comment": "Intervention déverrouillée pour modification"
    }
    
    # Mettre à jour l'intervention
    update_data = {
        "status": "draft",
        "signed_at": None,
        "signed_by": None,
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.interventions.update_one(
        {"id": intervention_id},
        {
            "$set": update_data,
            "$push": {"audit_log": audit_entry}
        }
    )
    
    logging.info(f"🔓 Intervention {intervention_id} déverrouillée par {current_user.email}")
    
    return {"success": True, "message": "Intervention déverrouillée avec succès"}


# ==================== FACTURES ENTRAIDE ====================

@router.post("/{tenant_slug}/interventions/{intervention_id}/facture-entraide")
async def generer_facture_entraide(
    tenant_slug: str,
    intervention_id: str,
    facture_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    Génère et enregistre une facture d'entraide pour une intervention.
    Incrémente automatiquement le numéro de facture.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'intervention existe
    intervention = await db.interventions.find_one({
        "id": intervention_id,
        "tenant_id": tenant.id
    })
    
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Récupérer les settings pour la numérotation
    settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
    if not settings:
        settings = {}
    
    # Générer le numéro de facture
    prefixe = settings.get("facture_prefixe", str(datetime.now().year))
    prochain_numero = settings.get("facture_prochain_numero", 1)
    numero_facture = f"{prefixe}-{str(prochain_numero).zfill(3)}"
    
    # Créer la facture
    facture = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "intervention_id": intervention_id,
        "numero_facture": numero_facture,
        "date_facture": datetime.now(timezone.utc).isoformat(),
        "municipalite_facturation": facture_data.get("municipalite_facturation"),
        "entente_utilisee": facture_data.get("entente_utilisee"),
        "lignes": facture_data.get("lignes", []),
        "total": facture_data.get("total", 0),
        "duree_heures": facture_data.get("duree_heures", 0),
        "coordonnees_facturation": facture_data.get("coordonnees_facturation", {}),
        "intervention_info": {
            "external_call_id": intervention.get("external_call_id"),
            "type_intervention": intervention.get("type_intervention"),
            "address_full": intervention.get("address_full"),
            "municipality": intervention.get("municipality"),
            "date_intervention": intervention.get("xml_time_call_received"),
        },
        "statut": "generee",
        "created_at": datetime.now(timezone.utc),
        "created_by": current_user.id,
        "created_by_name": f"{current_user.prenom} {current_user.nom}"
    }
    
    # Enregistrer la facture
    await db.factures_entraide.insert_one(facture)
    
    # Incrémenter le numéro de facture
    await db.intervention_settings.update_one(
        {"tenant_id": tenant.id},
        {"$set": {"facture_prochain_numero": prochain_numero + 1}},
        upsert=True
    )
    
    # Mettre à jour l'intervention avec la référence de facture
    await db.interventions.update_one(
        {"id": intervention_id},
        {
            "$set": {
                "facture_entraide_id": facture["id"],
                "facture_entraide_numero": numero_facture,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    logging.info(f"🧾 Facture entraide {numero_facture} générée pour intervention {intervention.get('external_call_id')}")
    
    # Retourner la facture sans _id
    facture.pop("_id", None)
    facture["created_at"] = facture["created_at"].isoformat()
    
    return {"success": True, "facture": facture}


@router.get("/{tenant_slug}/factures-entraide")
async def lister_factures_entraide(
    tenant_slug: str,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """
    Liste les factures d'entraide du tenant.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    factures = await db.factures_entraide.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_facture", -1).limit(limit).to_list(limit)
    
    return {"factures": factures}


@router.get("/{tenant_slug}/factures-entraide/{facture_id}")
async def get_facture_entraide(
    tenant_slug: str,
    facture_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère une facture d'entraide spécifique.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    facture = await db.factures_entraide.find_one(
        {"id": facture_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not facture:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    
    return facture


# ==================== MÉTÉO AUTOMATIQUE ====================

@router.get("/{tenant_slug}/interventions/weather")
async def get_weather_for_intervention(
    tenant_slug: str,
    lat: float,
    lon: float,
    datetime_str: str,  # Format ISO
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les conditions météo pour un lieu et une date/heure donnés.
    Utilise Open-Meteo (gratuit, sans clé API).
    """
    import httpx
    
    try:
        # Parser la date
        target_date = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
        date_str = target_date.strftime('%Y-%m-%d')
        hour = target_date.hour
        
        # Appeler l'API Open-Meteo pour l'historique météo
        url = f"https://archive-api.open-meteo.com/v1/archive"
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": date_str,
            "end_date": date_str,
            "hourly": "temperature_2m,precipitation,rain,snowfall,weathercode,windspeed_10m,visibility",
            "timezone": "America/Montreal"
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params=params, timeout=10.0)
            
            if response.status_code == 200:
                data = response.json()
                hourly = data.get("hourly", {})
                
                # Obtenir les valeurs pour l'heure cible
                idx = min(hour, len(hourly.get("temperature_2m", [])) - 1)
                
                temperature = hourly.get("temperature_2m", [None])[idx]
                precipitation = hourly.get("precipitation", [0])[idx] or 0
                rain = hourly.get("rain", [0])[idx] or 0
                snowfall = hourly.get("snowfall", [0])[idx] or 0
                weathercode = hourly.get("weathercode", [0])[idx] or 0
                windspeed = hourly.get("windspeed_10m", [0])[idx] or 0
                visibility = hourly.get("visibility", [10000])[idx] or 10000
                
                # Déterminer les conditions
                conditions = []
                if snowfall > 0:
                    conditions.append("neige")
                if rain > 0:
                    conditions.append("pluie")
                if weathercode in [0, 1]:
                    conditions.append("soleil")
                elif weathercode in [2, 3]:
                    conditions.append("nuageux")
                elif weathercode in [45, 48]:
                    conditions.append("brouillard")
                
                # Déterminer l'état de la chaussée
                chaussee = "sec"
                if temperature is not None and temperature < 0 and (precipitation > 0 or snowfall > 0):
                    chaussee = "glissante"
                elif rain > 0 or snowfall > 0:
                    chaussee = "mouillée"
                elif temperature is not None and temperature < -5:
                    chaussee = "potentiellement_glacée"
                
                return {
                    "temperature": round(temperature, 1) if temperature else None,
                    "conditions": conditions if conditions else ["inconnu"],
                    "precipitation_mm": round(precipitation, 1),
                    "neige_cm": round(snowfall, 1),
                    "vent_kmh": round(windspeed, 1),
                    "visibilite_m": round(visibility),
                    "chaussee": chaussee,
                    "code_meteo": weathercode
                }
            else:
                # Fallback: retourner des valeurs par défaut modifiables
                return {
                    "temperature": None,
                    "conditions": ["inconnu"],
                    "precipitation_mm": 0,
                    "neige_cm": 0,
                    "vent_kmh": 0,
                    "visibilite_m": 10000,
                    "chaussee": "inconnu",
                    "code_meteo": None,
                    "error": "Données météo non disponibles"
                }
                
    except Exception as e:
        logging.error(f"Erreur météo: {e}")
        return {
            "temperature": None,
            "conditions": ["inconnu"],
            "chaussee": "inconnu",
            "error": str(e)
        }


# ==================== ÉQUIPES DE GARDE POUR INTERVENTIONS ====================

@router.get("/{tenant_slug}/interventions/equipes-garde")
async def get_equipes_garde_for_intervention(
    tenant_slug: str,
    date: str,  # Format YYYY-MM-DD
    heure: str = None,  # Format HH:MM - heure de l'intervention pour détection automatique
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les équipes de garde et leurs membres pour une date donnée.
    Si l'heure est fournie, détermine automatiquement si c'est garde interne ou externe
    en fonction des types de garde configurés.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    params = await db.parametres_equipes_garde.find_one({"tenant_id": tenant.id})
    
    if not params or not params.get("actif", False):
        return {"equipes": [], "message": "Système d'équipes de garde non activé"}
    
    # Si heure fournie, déterminer le type de garde (interne/externe) basé sur les horaires configurés
    type_garde_cible = None
    if heure:
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(None)
        
        # Convertir l'heure en minutes depuis minuit pour comparaison facile
        try:
            heure_parts = heure.split(":")
            heure_minutes = int(heure_parts[0]) * 60 + int(heure_parts[1])
        except:
            heure_minutes = None
        
        if heure_minutes is not None and types_garde:
            for tg in types_garde:
                try:
                    debut_parts = tg.get("heure_debut", "00:00").split(":")
                    fin_parts = tg.get("heure_fin", "00:00").split(":")
                    debut_minutes = int(debut_parts[0]) * 60 + int(debut_parts[1])
                    fin_minutes = int(fin_parts[0]) * 60 + int(fin_parts[1])
                    
                    # Gestion des gardes qui passent minuit (ex: 16:00 - 08:00)
                    if fin_minutes < debut_minutes:
                        # Garde de nuit - passe minuit
                        is_in_range = heure_minutes >= debut_minutes or heure_minutes < fin_minutes
                    else:
                        # Garde normale
                        is_in_range = debut_minutes <= heure_minutes < fin_minutes
                    
                    if is_in_range:
                        type_garde_cible = "externe" if tg.get("est_garde_externe", False) else "interne"
                        logging.info(f"🕐 Intervention à {heure} → Type garde: {type_garde_cible} ({tg.get('nom')})")
                        break
                except Exception as e:
                    logging.warning(f"Erreur parsing horaire type garde: {e}")
                    continue
    
    result = {"equipes": [], "type_garde_detecte": type_garde_cible}
    
    # Pour chaque type d'emploi (temps plein et temps partiel)
    for type_emploi in ["temps_plein", "temps_partiel"]:
        config = params.get(type_emploi, {})
        
        if not config.get("rotation_active", False):
            continue
        
        type_rotation = config.get("type_rotation", "aucun")
        if type_rotation == "aucun":
            continue
        
        # Déterminer l'équipe de garde
        if type_rotation in ["montreal", "quebec", "longueuil"]:
            equipe_num = get_equipe_garde_rotation_standard(type_rotation, "", date)
        else:
            date_reference = config.get("date_reference")
            if not date_reference:
                continue
            equipe_num = get_equipe_garde_du_jour_sync(
                type_rotation=type_rotation,
                date_reference=date_reference,
                date_cible=date,
                nombre_equipes=config.get("nombre_equipes", 4),
                pattern_mode=config.get("pattern_mode", "hebdomadaire"),
                pattern_personnalise=config.get("pattern_personnalise", []),
                duree_cycle=config.get("duree_cycle", 28)
            )
        
        if equipe_num is None:
            continue
        
        # Récupérer la config de l'équipe
        equipes_config = config.get("equipes_config", [])
        equipe_info = next((e for e in equipes_config if e.get("numero") == equipe_num), None)
        
        # Récupérer les membres de cette équipe
        membres = await db.users.find({
            "tenant_id": tenant.id,
            "equipe_garde": equipe_num,
            "type_emploi": type_emploi.replace("_", " "),
            "statut": "Actif"
        }, {"_id": 0, "mot_de_passe_hash": 0}).to_list(100)
        
        result["equipes"].append({
            "type_emploi": type_emploi,
            "equipe_numero": equipe_num,
            "equipe_nom": equipe_info.get("nom", f"Équipe {equipe_num}") if equipe_info else f"Équipe {equipe_num}",
            "couleur": equipe_info.get("couleur", "#3B82F6") if equipe_info else "#3B82F6",
            "membres": [{
                "id": m.get("id"),
                "nom": m.get("nom"),
                "prenom": m.get("prenom"),
                "grade": m.get("grade"),
                "type_emploi": m.get("type_emploi"),
                "fonction_superieur": m.get("fonction_superieur", False)
            } for m in membres]
        })
    
    return result


@router.post("/{tenant_slug}/interventions/import-xml")
async def import_intervention_xml(
    tenant_slug: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    """Importe des fichiers XML de la centrale 911"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    results = {
        "imported": [],
        "updated": [],
        "errors": [],
        "unmapped_codes": []
    }
    
    # Grouper les fichiers par carte d'appel
    files_by_call = {}
    
    for file in files:
        filename = file.filename
        # Extraire le numéro de carte d'appel du nom de fichier
        match = re.search(r'_(\d+)_([^_]+)\.xml$', filename)
        if match:
            call_number = match.group(1)
            file_type = match.group(2).lower()
            
            if call_number not in files_by_call:
                files_by_call[call_number] = {}
            
            content = await file.read()
            files_by_call[call_number][file_type] = content
    
    # Traiter chaque carte d'appel
    for call_number, call_files in files_by_call.items():
        intervention_id = None
        try:
            existing = await db.interventions.find_one({
                "tenant_id": tenant.id,
                "external_call_id": call_number
            })
            
            # Parser le fichier Details
            if 'details' in call_files:
                details_xml = ET.fromstring(call_files['details'])
                table = details_xml.find('.//Table')
                
                if table is not None:
                    # Extraire la municipalité depuis villePourQui ou service
                    municipality_raw = table.findtext('villePourQui') or ''
                    # Si vide, essayer d'extraire depuis le champ service (ex: "Wentworth (SI)" -> "Wentworth")
                    if not municipality_raw:
                        service = table.findtext('service') or ''
                        # Extraire le nom avant les parenthèses
                        if '(' in service:
                            municipality_raw = service.split('(')[0].strip()
                        else:
                            municipality_raw = service
                    
                    intervention_data = {
                        "tenant_id": tenant.id,
                        "external_call_id": call_number,
                        "guid_carte": table.findtext('idCarteAppel'),
                        "guid_municipalite": table.findtext('guidMun'),
                        "no_sequentiel": int(table.findtext('noSequentiel') or 0),
                        
                        "address_civic": table.findtext('noPorte'),
                        "address_street": table.findtext('rue'),
                        "address_apartment": table.findtext('noAppart'),
                        "address_city": table.findtext('villePourQui'),
                        
                        # Municipalité - villePourQui contient la municipalité (ex: WENTWORTH)
                        "municipality": municipality_raw.title() if municipality_raw else None,
                        "xml_municipality": municipality_raw,
                        "xml_service": table.findtext('service'),  # Ex: "Wentworth (SI)"
                        
                        "caller_name": table.findtext('deQui'),
                        "caller_phone": table.findtext('telDeQui'),
                        "for_whom": table.findtext('pourQui'),
                        "for_whom_phone": table.findtext('telPourQui'),
                        
                        "type_intervention": table.findtext('typeIntervention'),
                        "code_feu": table.findtext('codeFeu'),
                        "niveau_risque": table.findtext('niveauRisque'),
                        "officer_in_charge_xml": table.findtext('officierCharge'),
                        
                        # Coordonnées GPS pour la météo (si disponibles dans le XML)
                        "latitude": float(table.findtext('latitude') or 0) if table.findtext('latitude') else None,
                        "longitude": float(table.findtext('longitude') or 0) if table.findtext('longitude') else None,
                        
                        "xml_time_call_received": parse_xml_datetime_intervention(
                            table.findtext('dateAppel'),
                            table.findtext('heureAppel')
                        ),
                        "xml_time_911": parse_xml_datetime_intervention(
                            table.findtext('dateHeure911'),
                            table.findtext('heure911')
                        ),
                        "xml_time_dispatch": parse_xml_datetime_intervention(
                            table.findtext('dateAlerte'),
                            table.findtext('heureAlerte')
                        ),
                        "xml_time_en_route": parse_xml_datetime_intervention(
                            table.findtext('date1016_1'),
                            table.findtext('depCaserne')
                        ),
                        "xml_time_arrival_1st": parse_xml_datetime_intervention(
                            table.findtext('date1018'),
                            table.findtext('hre1018') or table.findtext('arrLieux')
                        ),
                        "xml_time_under_control": parse_xml_datetime_intervention(
                            table.findtext('dateSousControle'),
                            table.findtext('sousControle')
                        ),
                        "xml_time_1022": parse_xml_datetime_intervention(
                            table.findtext('date1022'),
                            table.findtext('heure1022')
                        ),
                        "xml_time_departure": parse_xml_datetime_intervention(
                            table.findtext('dateDepLieux'),
                            table.findtext('depLieux')
                        ),
                        "xml_time_terminated": parse_xml_datetime_intervention(
                            table.findtext('dateDispFinale'),
                            table.findtext('dispFinale')
                        ),
                        
                        "imported_at": datetime.now(timezone.utc),
                        "imported_by": current_user.id
                    }
                    
                    # Construire l'adresse complète (SANS la municipalité car elle est affichée séparément)
                    addr_parts = []
                    if intervention_data.get("address_civic"):
                        addr_parts.append(intervention_data["address_civic"])
                    if intervention_data.get("address_street"):
                        addr_parts.append(intervention_data["address_street"])
                    # Ne PAS inclure la municipalité dans address_full car elle est affichée séparément
                    intervention_data["address_full"] = ", ".join(addr_parts)
                    
                    if existing:
                        if existing.get("status") == "signed":
                            results["errors"].append({
                                "call_number": call_number,
                                "error": "Intervention déjà signée"
                            })
                            continue
                        
                        intervention_data["updated_at"] = datetime.now(timezone.utc)
                        await db.interventions.update_one(
                            {"id": existing["id"]},
                            {"$set": intervention_data}
                        )
                        intervention_id = existing["id"]
                        results["updated"].append(call_number)
                    else:
                        intervention_data["id"] = str(uuid.uuid4())
                        intervention_data["status"] = "new"
                        intervention_data["created_at"] = datetime.now(timezone.utc)
                        intervention_data["audit_log"] = []
                        intervention_data["assigned_reporters"] = []
                        await db.interventions.insert_one(intervention_data)
                        intervention_id = intervention_data["id"]
                        results["imported"].append(call_number)
            
            # ==================== CALCUL AUTOMATIQUE DES PRIMES DE REPAS À L'IMPORT ====================
            if intervention_id:
                # Charger les paramètres du tenant pour les primes de repas
                settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
                
                if settings:
                    # Récupérer l'intervention fraîchement importée/mise à jour
                    intervention_for_primes = await db.interventions.find_one({"id": intervention_id})
                    
                    if intervention_for_primes:
                        # Calculer les primes
                        primes_result = await calculate_meal_primes_for_intervention(intervention_for_primes, settings)
                        
                        if primes_result:
                            # Appliquer les primes suggérées (modifiables par l'utilisateur avant validation)
                            update_primes = {
                                "primes_suggerees": {
                                    "dejeuner": primes_result["prime_dejeuner"],
                                    "diner": primes_result["prime_diner"],
                                    "souper": primes_result["prime_souper"],
                                    "duree_heures": primes_result["duree_heures"],
                                    "calculees_a_import": True
                                }
                            }
                            
                            await db.interventions.update_one(
                                {"id": intervention_id},
                                {"$set": update_primes}
                            )
                            
                            logging.info(f"🍽️ Primes suggérées à l'import - Déjeuner: {primes_result['prime_dejeuner']}, Dîner: {primes_result['prime_diner']}, Souper: {primes_result['prime_souper']} (durée: {primes_result['duree_heures']:.1f}h)")
            
            # Parser les Ressources (véhicules)
            if 'ressources' in call_files and intervention_id:
                resources_xml = ET.fromstring(call_files['ressources'])
                
                await db.intervention_vehicles.delete_many({
                    "intervention_id": intervention_id
                })
                
                vehicles_processed = set()
                for table in resources_xml.findall('.//Table'):
                    vehicle_number = table.findtext('noRessource')
                    if vehicle_number and vehicle_number not in vehicles_processed:
                        vehicle_data = {
                            "id": str(uuid.uuid4()),
                            "intervention_id": intervention_id,
                            "tenant_id": tenant.id,
                            "xml_vehicle_number": vehicle_number,
                            "xml_vehicle_id": table.findtext('idRessource'),
                            "xml_status": table.findtext('disponibilite'),
                            "crew_count": int(table.findtext('nbPompier') or 0),
                            "created_at": datetime.now(timezone.utc)
                        }
                        
                        mapping = await db.intervention_code_mappings.find_one({
                            "tenant_id": tenant.id,
                            "type_mapping": "vehicule",
                            "code_externe": vehicle_number
                        })
                        if mapping and mapping.get("code_interne"):
                            vehicle_data["vehicle_id"] = mapping["code_interne"]
                        else:
                            results["unmapped_codes"].append({
                                "type": "vehicule",
                                "code": vehicle_number
                            })
                        
                        await db.intervention_vehicles.insert_one(vehicle_data)
                        vehicles_processed.add(vehicle_number)
            
            # Parser les Commentaires
            if 'commentaires' in call_files and intervention_id:
                comments_xml = ET.fromstring(call_files['commentaires'])
                comments = []
                for table in comments_xml.findall('.//Table'):
                    comment = {
                        "id": table.findtext('idCommentaire'),
                        "timestamp": table.findtext('timestampDetail'),
                        "detail": table.findtext('detail'),
                        "type": table.findtext('type'),
                        "repartiteur": table.findtext('repartiteur')
                    }
                    comments.append(comment)
                
                await db.interventions.update_one(
                    {"id": intervention_id},
                    {"$set": {"xml_comments": comments}}
                )
            
            # Parser l'Assistance
            if 'assistance' in call_files and intervention_id:
                assistance_xml = ET.fromstring(call_files['assistance'])
                
                await db.intervention_assistance.delete_many({
                    "intervention_id": intervention_id
                })
                
                for table in assistance_xml.findall('.//Table'):
                    assistance_data = {
                        "id": str(uuid.uuid4()),
                        "intervention_id": intervention_id,
                        "tenant_id": tenant.id,
                        "xml_assistance_id": table.findtext('idAssistance'),
                        "no_carte_entraide": table.findtext('noCarteEntraide'),
                        "municipalite": table.findtext('municipalite'),
                        "type_equipement": table.findtext('typeEquipement'),
                        "time_called": parse_xml_datetime_intervention(
                            table.findtext('dateAppel'),
                            table.findtext('heureAppel')
                        ),
                        "time_en_route": parse_xml_datetime_intervention(
                            table.findtext('dateDirection'),
                            table.findtext('heureDirection')
                        ),
                        "time_on_scene": parse_xml_datetime_intervention(
                            table.findtext('dateLieux'),
                            table.findtext('heureLieux')
                        ),
                        "time_released": parse_xml_datetime_intervention(
                            table.findtext('dateLiberee'),
                            table.findtext('heureLiberee')
                        ),
                        "created_at": datetime.now(timezone.utc)
                    }
                    await db.intervention_assistance.insert_one(assistance_data)
            
            # Parser les notes de PriseAppel
            if 'priseappel' in call_files and intervention_id:
                priseappel_xml = ET.fromstring(call_files['priseappel'])
                notes_priseappel = []
                for table in priseappel_xml.findall('.//Table'):
                    note = {
                        "libelle": table.findtext('libelle'),
                        "date_rep": table.findtext('dateRep')
                    }
                    if note["libelle"]:
                        notes_priseappel.append(note)
                
                await db.interventions.update_one(
                    {"id": intervention_id},
                    {"$set": {"xml_notes_priseappel": notes_priseappel}}
                )
                    
        except Exception as e:
            logging.error(f"Erreur import XML {call_number}: {e}")
            results["errors"].append({
                "call_number": call_number,
                "error": str(e)
            })
    
    return results


@router.get("/{tenant_slug}/interventions/mappings")
async def get_intervention_mappings(
    tenant_slug: str,
    type_mapping: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste les mappings de codes 911"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    query = {"tenant_id": tenant.id}
    if type_mapping:
        query["type_mapping"] = type_mapping
    
    mappings = await db.intervention_code_mappings.find(
        query, {"_id": 0}
    ).to_list(500)
    
    return {"mappings": mappings}


@router.post("/{tenant_slug}/interventions/mappings")
async def create_intervention_mapping(
    tenant_slug: str,
    mapping_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Crée ou met à jour un mapping de code"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    existing = await db.intervention_code_mappings.find_one({
        "tenant_id": tenant.id,
        "type_mapping": mapping_data["type_mapping"],
        "code_externe": mapping_data["code_externe"]
    })
    
    if existing:
        await db.intervention_code_mappings.update_one(
            {"id": existing["id"]},
            {"$set": {
                "code_interne": mapping_data.get("code_interne"),
                "libelle_interne": mapping_data.get("libelle_interne"),
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        return {"success": True, "action": "updated"}
    else:
        new_mapping = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "type_mapping": mapping_data["type_mapping"],
            "code_externe": mapping_data["code_externe"],
            "libelle_externe": mapping_data.get("libelle_externe", ""),
            "code_interne": mapping_data.get("code_interne"),
            "libelle_interne": mapping_data.get("libelle_interne"),
            "auto_mapped": False,
            "created_at": datetime.now(timezone.utc)
        }
        await db.intervention_code_mappings.insert_one(new_mapping)
        return {"success": True, "action": "created"}


@router.post("/{tenant_slug}/interventions/{intervention_id}/resources")
async def add_intervention_resource(
    tenant_slug: str,
    intervention_id: str,
    resource_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Ajoute une ressource humaine à l'intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    intervention = await db.interventions.find_one({
        "id": intervention_id,
        "tenant_id": tenant.id
    })
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    resource = {
        "id": str(uuid.uuid4()),
        "intervention_id": intervention_id,
        "tenant_id": tenant.id,
        "user_id": resource_data.get("user_id"),
        "role_on_scene": resource_data.get("role_on_scene", "Pompier"),
        "datetime_start": resource_data.get("datetime_start"),
        "datetime_end": resource_data.get("datetime_end"),
        "is_remunerated": resource_data.get("is_remunerated", True),
        "is_manually_added": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.intervention_resources.insert_one(resource)
    
    return {"success": True, "resource": {k: v for k, v in resource.items() if k != "_id"}}


@router.delete("/{tenant_slug}/interventions/{intervention_id}/resources/{resource_id}")
async def remove_intervention_resource(
    tenant_slug: str,
    intervention_id: str,
    resource_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une ressource de l'intervention"""
    result = await db.intervention_resources.delete_one({
        "id": resource_id,
        "intervention_id": intervention_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ressource non trouvée")
    
    return {"success": True}


@router.put("/{tenant_slug}/interventions/{intervention_id}/assign-reporters")
async def assign_intervention_reporters(
    tenant_slug: str,
    intervention_id: str,
    reporters_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Assigne des personnes pour remplir le rapport"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    user_ids = reporters_data.get("user_ids", [])
    
    await db.interventions.update_one(
        {"id": intervention_id, "tenant_id": tenant.id},
        {"$set": {
            "assigned_reporters": user_ids,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {"success": True}


# ==================== REMISE DE PROPRIÉTÉ ====================

class RemiseProprieteCreate(BaseModel):
    """Modèle pour créer une remise de propriété"""
    intervention_id: str
    
    # État des énergies
    electricite: str  # "en_fonction", "coupee_panneau", "coupee_hydro"
    gaz: str  # "en_fonction", "ferme_valve", "verrouille"
    eau: str  # "en_fonction", "fermee"
    
    # Autorisation d'accès
    niveau_acces: str  # "rouge", "jaune", "vert"
    zone_interdite: Optional[str] = None  # Pour jaune: zones spécifiques interdites
    
    # Propriétaire
    proprietaire_nom: str
    proprietaire_email: Optional[str] = None
    proprietaire_accepte_email: bool = False
    proprietaire_confirme_avertissements: bool = True
    proprietaire_comprend_interdiction: bool = False  # Pour rouge seulement
    
    # Signatures
    officier_nom: str
    officier_signature: str  # Base64
    proprietaire_signature: Optional[str] = None  # Base64, optionnel si refus
    
    # Refus de signer
    refus_de_signer: bool = False
    temoin_nom: Optional[str] = None  # Requis si refus
    
    # GPS
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.post("/{tenant_slug}/interventions/{intervention_id}/remise-propriete")
async def creer_remise_propriete(
    tenant_slug: str,
    intervention_id: str,
    data: RemiseProprieteCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une remise de propriété et génère le PDF"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier que l'intervention existe
    intervention = await db.interventions.find_one({
        "id": intervention_id,
        "tenant_id": tenant.id
    })
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Créer l'enregistrement de remise
    remise_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    remise = {
        "id": remise_id,
        "tenant_id": tenant.id,
        "intervention_id": intervention_id,
        "created_at": now,
        "created_by": current_user.id,
        
        # État des énergies
        "electricite": data.electricite,
        "gaz": data.gaz,
        "eau": data.eau,
        
        # Autorisation d'accès
        "niveau_acces": data.niveau_acces,
        "zone_interdite": data.zone_interdite,
        
        # Propriétaire
        "proprietaire_nom": data.proprietaire_nom,
        "proprietaire_email": data.proprietaire_email,
        "proprietaire_accepte_email": data.proprietaire_accepte_email,
        "proprietaire_confirme_avertissements": data.proprietaire_confirme_avertissements,
        "proprietaire_comprend_interdiction": data.proprietaire_comprend_interdiction,
        
        # Signatures
        "officier_nom": data.officier_nom,
        "officier_id": current_user.id,
        "officier_signature": data.officier_signature,
        "proprietaire_signature": data.proprietaire_signature,
        
        # Refus
        "refus_de_signer": data.refus_de_signer,
        "temoin_nom": data.temoin_nom,
        
        # GPS
        "latitude": data.latitude,
        "longitude": data.longitude,
        
        # PDF sera généré ensuite
        "pdf_base64": None
    }
    
    # Générer le PDF
    pdf_base64 = await generer_pdf_remise_propriete(tenant, intervention, remise)
    remise["pdf_base64"] = pdf_base64
    
    # Sauvegarder dans la collection remises_propriete
    await db.remises_propriete.insert_one(remise)
    
    # Ajouter la référence à l'intervention
    await db.interventions.update_one(
        {"id": intervention_id, "tenant_id": tenant.id},
        {
            "$push": {"remises_propriete": remise_id},
            "$set": {"updated_at": now}
        }
    )
    
    # Envoyer l'email si demandé
    email_envoye = False
    if data.proprietaire_accepte_email and data.proprietaire_email:
        email_envoye = await envoyer_email_remise_propriete(tenant, intervention, remise, pdf_base64)
    
    return {
        "success": True,
        "remise_id": remise_id,
        "pdf_base64": pdf_base64,
        "email_envoye": email_envoye
    }


async def generer_pdf_remise_propriete(tenant: dict, intervention: dict, remise: dict) -> str:
    """Génère le PDF de remise de propriété et retourne en base64"""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.lib.units import inch
    from io import BytesIO
    import base64
    
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    elements = []
    styles = getSampleStyleSheet()
    
    # Styles personnalisés
    title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=14, spaceAfter=12, alignment=TA_CENTER)
    section_style = ParagraphStyle('Section', parent=styles['Heading2'], fontSize=11, spaceBefore=12, spaceAfter=6, textColor=colors.darkblue)
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=9, spaceAfter=4)
    warning_style = ParagraphStyle('Warning', parent=styles['Normal'], fontSize=8, textColor=colors.red, spaceBefore=4, spaceAfter=4)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, textColor=colors.grey)
    
    # Logo et en-tête
    nom_service = tenant.get("nom_service") or tenant.get("nom", "Service de sécurité incendie")
    logo_url = tenant.get("logo_url")
    
    header_data = []
    if logo_url and logo_url.startswith('data:image/'):
        try:
            header, encoded = logo_url.split(',', 1)
            logo_data = base64.b64decode(encoded)
            logo_buffer = BytesIO(logo_data)
            logo_img = Image(logo_buffer, width=1*inch, height=1*inch)
            header_data.append([logo_img, Paragraph(f"<b>{nom_service}</b><br/>AVIS DE CESSATION D'INTERVENTION<br/>ET TRANSFERT DE GARDE", title_style)])
        except:
            header_data.append([Paragraph(f"<b>{nom_service}</b><br/>AVIS DE CESSATION D'INTERVENTION ET TRANSFERT DE GARDE", title_style)])
    else:
        header_data.append([Paragraph(f"<b>{nom_service}</b><br/><br/>AVIS DE CESSATION D'INTERVENTION ET TRANSFERT DE GARDE", title_style)])
    
    if header_data and len(header_data[0]) == 2:
        header_table = Table(header_data, colWidths=[1.2*inch, 5.3*inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ]))
        elements.append(header_table)
    else:
        elements.append(header_data[0][0])
    
    elements.append(Spacer(1, 12))
    
    # 1. IDENTIFICATION
    elements.append(Paragraph("1. IDENTIFICATION DE L'INTERVENTION", section_style))
    
    date_fin = remise.get("created_at")
    if isinstance(date_fin, datetime):
        date_fin_str = date_fin.strftime("%Y-%m-%d à %H:%M")
    else:
        date_fin_str = str(date_fin)[:16] if date_fin else ""
    
    id_data = [
        ["No. d'événement:", intervention.get("external_call_id", "N/A")],
        ["Adresse du sinistre:", intervention.get("address_full", intervention.get("address_street", "N/A"))],
        ["Date et heure fin d'intervention:", date_fin_str],
    ]
    
    if remise.get("latitude") and remise.get("longitude"):
        id_data.append(["Coordonnées GPS:", f"{remise['latitude']:.6f}, {remise['longitude']:.6f}"])
    
    id_table = Table(id_data, colWidths=[2.2*inch, 4.3*inch])
    id_table.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
    ]))
    elements.append(id_table)
    
    # 2. ÉTAT DES ÉNERGIES
    elements.append(Paragraph("2. ÉTAT DES ÉNERGIES ET SERVICES", section_style))
    
    elec_map = {
        "en_fonction": "☑ Laissée en fonction",
        "coupee_panneau": "☑ Coupée au panneau principal",
        "coupee_hydro": "☑ Coupée par Hydro-Québec"
    }
    gaz_map = {
        "en_fonction": "☑ Laissé en fonction",
        "ferme_valve": "☑ Fermé à la valve extérieure",
        "verrouille": "☑ Compteur verrouillé/retiré"
    }
    eau_map = {
        "en_fonction": "☑ Laissée en fonction",
        "fermee": "☑ Fermée à l'entrée principale"
    }
    
    elements.append(Paragraph(f"<b>ÉLECTRICITÉ:</b> {elec_map.get(remise.get('electricite'), remise.get('electricite'))}", normal_style))
    if remise.get("electricite") in ["coupee_panneau", "coupee_hydro"]:
        elements.append(Paragraph("⚠️ AVERTISSEMENT: L'électricité ne doit être rétablie que par un maître électricien certifié.", warning_style))
    
    elements.append(Paragraph(f"<b>GAZ:</b> {gaz_map.get(remise.get('gaz'), remise.get('gaz'))}", normal_style))
    if remise.get("gaz") in ["ferme_valve", "verrouille"]:
        elements.append(Paragraph("⚠️ AVERTISSEMENT: Ne jamais réouvrir une valve de gaz fermée. Seul le distributeur est autorisé.", warning_style))
    
    elements.append(Paragraph(f"<b>EAU:</b> {eau_map.get(remise.get('eau'), remise.get('eau'))}", normal_style))
    
    # 3. AUTORISATION D'ACCÈS
    elements.append(Paragraph("3. AUTORISATION D'ACCÈS ET SÉCURITÉ", section_style))
    
    niveau = remise.get("niveau_acces", "vert")
    if niveau == "rouge":
        elements.append(Paragraph("🔴 <b>ACCÈS INTERDIT (DANGER)</b>", ParagraphStyle('RedAlert', parent=normal_style, textColor=colors.red, fontSize=10)))
        elements.append(Paragraph("L'accès au bâtiment est strictement interdit. La structure est instable ou présente un danger immédiat.", normal_style))
        elements.append(Paragraph("Action requise: Sécuriser le périmètre et contacter un ingénieur en structure.", normal_style))
    elif niveau == "jaune":
        elements.append(Paragraph("🟡 <b>ACCÈS RESTREINT</b>", ParagraphStyle('YellowAlert', parent=normal_style, textColor=colors.orange, fontSize=10)))
        elements.append(Paragraph("L'accès est limité pour récupération de biens essentiels sous supervision. L'occupation est interdite.", normal_style))
        if remise.get("zone_interdite"):
            elements.append(Paragraph(f"Zones interdites: {remise['zone_interdite']}", normal_style))
    else:
        elements.append(Paragraph("🟢 <b>RÉINTÉGRATION POSSIBLE</b>", ParagraphStyle('GreenAlert', parent=normal_style, textColor=colors.green, fontSize=10)))
        elements.append(Paragraph("Le service incendie n'émet aucune contre-indication à la réintégration.", normal_style))
    
    # 4. TRANSFERT DE RESPONSABILITÉ
    elements.append(Paragraph("4. TRANSFERT DE RESPONSABILITÉ", section_style))
    elements.append(Paragraph("<b>Transfert de garde:</b> La garde juridique des lieux est officiellement remise au propriétaire/occupant signataire.", normal_style))
    elements.append(Paragraph("<b>Exonération:</b> Le Service de sécurité incendie et la municipalité se dégagent de toute responsabilité concernant le vol, le vandalisme, les dommages climatiques ou la détérioration des biens.", normal_style))
    elements.append(Paragraph("<b>Obligation du propriétaire:</b> Sécuriser les ouvertures et aviser les assureurs.", normal_style))
    
    # 5. SIGNATURES
    elements.append(Paragraph("5. SIGNATURES", section_style))
    
    # Signature officier
    elements.append(Paragraph(f"<b>L'Officier Responsable:</b> {remise.get('officier_nom', '')}", normal_style))
    if remise.get("officier_signature"):
        try:
            sig_data = remise["officier_signature"]
            if "," in sig_data:
                sig_data = sig_data.split(",")[1]
            sig_bytes = base64.b64decode(sig_data)
            sig_buffer = BytesIO(sig_bytes)
            sig_img = Image(sig_buffer, width=2*inch, height=0.6*inch)
            elements.append(sig_img)
        except:
            elements.append(Paragraph("[Signature numérique enregistrée]", small_style))
    
    elements.append(Spacer(1, 12))
    
    # Signature propriétaire
    if remise.get("refus_de_signer"):
        elements.append(Paragraph(f"<b>Le Propriétaire/Représentant:</b> REFUS DE SIGNER", ParagraphStyle('Refus', parent=normal_style, textColor=colors.red)))
        elements.append(Paragraph(f"Avis remis verbalement. Témoin: {remise.get('temoin_nom', 'N/A')}", normal_style))
    else:
        elements.append(Paragraph(f"<b>Le Propriétaire/Représentant:</b> {remise.get('proprietaire_nom', '')}", normal_style))
        if remise.get("proprietaire_confirme_avertissements"):
            elements.append(Paragraph("☑ Confirme avoir reçu la garde et pris connaissance des avertissements.", small_style))
        if remise.get("proprietaire_comprend_interdiction") and niveau == "rouge":
            elements.append(Paragraph("☑ Comprend qu'il est interdit de pénétrer dans le périmètre de sécurité.", small_style))
        
        if remise.get("proprietaire_signature"):
            try:
                sig_data = remise["proprietaire_signature"]
                if "," in sig_data:
                    sig_data = sig_data.split(",")[1]
                sig_bytes = base64.b64decode(sig_data)
                sig_buffer = BytesIO(sig_bytes)
                sig_img = Image(sig_buffer, width=2*inch, height=0.6*inch)
                elements.append(sig_img)
            except:
                elements.append(Paragraph("[Signature numérique enregistrée]", small_style))
    
    # Footer
    elements.append(Spacer(1, 20))
    elements.append(Paragraph(f"Document généré le {datetime.now().strftime('%Y-%m-%d à %H:%M')} par {nom_service}", small_style))
    
    # Build PDF
    doc.build(elements)
    
    # Retourner en base64
    pdf_bytes = buffer.getvalue()
    return base64.b64encode(pdf_bytes).decode('utf-8')


async def envoyer_email_remise_propriete(tenant: dict, intervention: dict, remise: dict, pdf_base64: str) -> bool:
    """Envoie l'email avec le PDF en pièce jointe"""
    try:
        resend_api_key = os.environ.get("RESEND_API_KEY")
        if not resend_api_key:
            print("RESEND_API_KEY non configurée")
            return False
        
        resend.api_key = resend_api_key
        
        # Construire l'adresse d'envoi
        tenant_slug = tenant.get("slug", "service")
        # Utiliser l'email configuré ou fallback
        from_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@resend.dev")
        
        nom_service = tenant.get("nom_service") or tenant.get("nom", "Service de sécurité incendie")
        
        niveau_acces = remise.get("niveau_acces", "vert")
        niveau_label = {
            "rouge": "🔴 ACCÈS INTERDIT",
            "jaune": "🟡 ACCÈS RESTREINT", 
            "vert": "🟢 RÉINTÉGRATION POSSIBLE"
        }.get(niveau_acces, niveau_acces)
        
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Avis de cessation d'intervention et transfert de garde</h2>
            
            <p>Bonjour {remise.get('proprietaire_nom', '')},</p>
            
            <p>Veuillez trouver ci-joint l'avis officiel de cessation d'intervention suite au sinistre à l'adresse:</p>
            
            <p style="background: #f3f4f6; padding: 12px; border-radius: 8px;">
                <strong>📍 {intervention.get('address_full', intervention.get('address_street', 'N/A'))}</strong><br>
                <strong>No. d'événement:</strong> {intervention.get('external_call_id', 'N/A')}<br>
                <strong>Statut d'accès:</strong> {niveau_label}
            </p>
            
            <p><strong>Rappels importants:</strong></p>
            <ul>
                <li>Contactez votre compagnie d'assurance dans les plus brefs délais</li>
                <li>Sécurisez les ouvertures (portes, fenêtres) pour éviter les intrusions</li>
                {"<li style='color: red;'><strong>L'accès au bâtiment est interdit jusqu'à évaluation par un ingénieur</strong></li>" if niveau_acces == "rouge" else ""}
            </ul>
            
            <p>Le document PDF ci-joint constitue la preuve officielle du transfert de responsabilité.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            
            <p style="color: #6b7280; font-size: 12px;">
                {nom_service}<br>
                Ce courriel a été envoyé automatiquement suite à votre intervention.
            </p>
        </div>
        """
        
        # Décoder le PDF pour l'attachement
        pdf_bytes = base64.b64decode(pdf_base64)
        
        params = {
            "from": f"{nom_service} <{from_email}>",
            "to": [remise.get("proprietaire_email")],
            "subject": f"Avis de cessation d'intervention - {intervention.get('external_call_id', '')}",
            "html": html_content,
            "attachments": [
                {
                    "filename": f"remise_propriete_{intervention.get('external_call_id', 'NA')}.pdf",
                    "content": pdf_base64
                }
            ]
        }
        
        response = resend.Emails.send(params)
        print(f"Email remise propriété envoyé: {response}")
        return True
        
    except Exception as e:
        print(f"Erreur envoi email remise propriété: {e}")
        return False


@router.get("/{tenant_slug}/interventions/{intervention_id}/remises-propriete")
async def get_remises_propriete(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère toutes les remises de propriété d'une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    remises = await db.remises_propriete.find({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    return {"remises": remises}


@router.get("/{tenant_slug}/interventions/{intervention_id}/remise-propriete/{remise_id}/pdf")
async def get_remise_propriete_pdf(
    tenant_slug: str,
    intervention_id: str,
    remise_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère le PDF d'une remise de propriété"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    remise = await db.remises_propriete.find_one({
        "id": remise_id,
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    }, {"_id": 0})
    
    if not remise:
        raise HTTPException(status_code=404, detail="Remise non trouvée")
    
    if not remise.get("pdf_base64"):
        raise HTTPException(status_code=404, detail="PDF non disponible")
    
    # Décoder et retourner le PDF
    pdf_bytes = base64.b64decode(remise["pdf_base64"])
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=remise_propriete_{remise_id[:8]}.pdf"
        }
    )


