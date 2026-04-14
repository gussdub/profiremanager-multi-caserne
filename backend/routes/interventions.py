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
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import xml.etree.ElementTree as ET
import uuid
import logging
import re
import asyncio
import base64

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    creer_activite,
    require_permission,
    user_has_module_action
)

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_intervention_update

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
    tenant_slug: str
):
    """Récupère les données de référence (natures, causes, etc.) depuis les tables DSI"""
    # Vérifier si les données de référence existent, sinon les initialiser
    causes_count = await db.dsi_causes.count_documents({})
    if causes_count == 0:
        # Initialiser les données de référence DSI automatiquement
        await initialize_dsi_reference_data()
    
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


async def initialize_dsi_reference_data():
    """Initialise les données de référence DSI si elles n'existent pas"""
    import logging
    logging.info("Initialisation automatique des données de référence DSI...")
    
    # Causes probables (MSP)
    causes = [
        {"code": "1", "libelle": "Incendiaire (intentionnel)"},
        {"code": "2", "libelle": "Suspect"},
        {"code": "3", "libelle": "Imprudence de fumeur"},
        {"code": "4", "libelle": "Jeux d'enfants"},
        {"code": "5", "libelle": "Utilisation imprudente d'un appareil de chauffage"},
        {"code": "6", "libelle": "Défaillance mécanique ou électrique"},
        {"code": "7", "libelle": "Causes naturelles"},
        {"code": "8", "libelle": "Exposition à d'autres feux"},
        {"code": "9", "libelle": "Autre cause accidentelle"},
        {"code": "0", "libelle": "Cause indéterminée"},
    ]
    
    # Sources de chaleur (MSP)
    sources_chaleur = [
        {"code": "11", "libelle": "Équipement électrique en fonctionnement"},
        {"code": "12", "libelle": "Équipement électrique en panne/défectueux"},
        {"code": "13", "libelle": "Câblage électrique"},
        {"code": "21", "libelle": "Appareil de chauffage central"},
        {"code": "22", "libelle": "Appareil de chauffage d'appoint fixe"},
        {"code": "23", "libelle": "Appareil de chauffage d'appoint portatif"},
        {"code": "24", "libelle": "Cheminée, foyer"},
        {"code": "31", "libelle": "Équipement de cuisson - cuisinière"},
        {"code": "32", "libelle": "Équipement de cuisson - four"},
        {"code": "33", "libelle": "Équipement de cuisson - BBQ"},
        {"code": "34", "libelle": "Équipement de cuisson - friteuse"},
        {"code": "41", "libelle": "Flamme/étincelle d'outils/équipement de travail"},
        {"code": "42", "libelle": "Torche, chalumeau"},
        {"code": "43", "libelle": "Équipement de soudure"},
        {"code": "51", "libelle": "Allumette"},
        {"code": "52", "libelle": "Briquet"},
        {"code": "53", "libelle": "Bougie, lampion"},
        {"code": "54", "libelle": "Cigarette, cigare"},
        {"code": "61", "libelle": "Foudre"},
        {"code": "62", "libelle": "Soleil (concentration de rayons)"},
        {"code": "71", "libelle": "Véhicule à moteur"},
        {"code": "72", "libelle": "Petit équipement motorisé"},
        {"code": "81", "libelle": "Feux d'artifice"},
        {"code": "82", "libelle": "Fusées éclairantes"},
        {"code": "90", "libelle": "Autre source de chaleur"},
        {"code": "00", "libelle": "Source de chaleur indéterminée"},
    ]
    
    # Matériaux premiers enflammés (MSP)
    materiaux = [
        {"code": "11", "libelle": "Gaz naturel"},
        {"code": "12", "libelle": "Propane, butane"},
        {"code": "13", "libelle": "Essence"},
        {"code": "14", "libelle": "Kérosène, diesel"},
        {"code": "15", "libelle": "Huile de cuisson"},
        {"code": "16", "libelle": "Autre liquide inflammable"},
        {"code": "21", "libelle": "Bois de construction"},
        {"code": "22", "libelle": "Bois de finition"},
        {"code": "23", "libelle": "Bois de chauffage"},
        {"code": "31", "libelle": "Tissu, textile"},
        {"code": "32", "libelle": "Vêtements"},
        {"code": "33", "libelle": "Literie, matelas"},
        {"code": "34", "libelle": "Meubles rembourrés"},
        {"code": "41", "libelle": "Papier, carton"},
        {"code": "42", "libelle": "Plastique"},
        {"code": "43", "libelle": "Caoutchouc"},
        {"code": "51", "libelle": "Isolant électrique"},
        {"code": "52", "libelle": "Câblage/fil électrique"},
        {"code": "61", "libelle": "Herbe, feuilles, végétation"},
        {"code": "62", "libelle": "Ordures, déchets"},
        {"code": "71", "libelle": "Graisse de cuisson"},
        {"code": "72", "libelle": "Nourriture"},
        {"code": "90", "libelle": "Autre matériau"},
        {"code": "00", "libelle": "Matériau indéterminé"},
    ]
    
    # Facteurs ayant contribué à l'allumage (MSP)
    facteurs_allumage = [
        {"code": "11", "libelle": "Court-circuit, arc électrique"},
        {"code": "12", "libelle": "Surcharge électrique"},
        {"code": "13", "libelle": "Défaut d'isolation électrique"},
        {"code": "21", "libelle": "Accumulation de créosote"},
        {"code": "22", "libelle": "Installation non conforme"},
        {"code": "23", "libelle": "Défaut d'entretien"},
        {"code": "31", "libelle": "Équipement laissé sans surveillance"},
        {"code": "32", "libelle": "Équipement trop près de combustibles"},
        {"code": "33", "libelle": "Mauvaise manipulation"},
        {"code": "41", "libelle": "Matériel de fumeur mal éteint"},
        {"code": "42", "libelle": "Cendres chaudes mal disposées"},
        {"code": "51", "libelle": "Incapacité physique"},
        {"code": "52", "libelle": "Incapacité mentale"},
        {"code": "53", "libelle": "Personne sous l'effet de l'alcool/drogue"},
        {"code": "54", "libelle": "Personne endormie"},
        {"code": "61", "libelle": "Acte intentionnel"},
        {"code": "62", "libelle": "Jeux d'enfants"},
        {"code": "90", "libelle": "Autre facteur"},
        {"code": "00", "libelle": "Facteur indéterminé"},
    ]
    
    # Usages du bâtiment (MSP)
    usages_batiment = [
        {"code": "1", "libelle": "Résidentiel - logement unifamilial"},
        {"code": "2", "libelle": "Résidentiel - logement multifamilial (2-5)"},
        {"code": "3", "libelle": "Résidentiel - immeuble d'appartements (6+)"},
        {"code": "4", "libelle": "Résidentiel - maison mobile"},
        {"code": "5", "libelle": "Commercial - magasin de détail"},
        {"code": "6", "libelle": "Commercial - bureau"},
        {"code": "7", "libelle": "Commercial - restaurant"},
        {"code": "8", "libelle": "Commercial - hôtel/motel"},
        {"code": "9", "libelle": "Industriel - fabrication"},
        {"code": "10", "libelle": "Industriel - entreposage"},
        {"code": "11", "libelle": "Institutionnel - école"},
        {"code": "12", "libelle": "Institutionnel - hôpital/CHSLD"},
        {"code": "13", "libelle": "Institutionnel - église"},
        {"code": "14", "libelle": "Agricole - grange/étable"},
        {"code": "15", "libelle": "Agricole - silo"},
        {"code": "16", "libelle": "Véhicule"},
        {"code": "17", "libelle": "Extérieur - terrain vacant"},
        {"code": "18", "libelle": "Extérieur - forêt"},
        {"code": "99", "libelle": "Autre usage"},
    ]
    
    # Insérer les données
    if causes:
        await db.dsi_causes.delete_many({})
        await db.dsi_causes.insert_many(causes)
    
    if sources_chaleur:
        await db.dsi_sources_chaleur.delete_many({})
        await db.dsi_sources_chaleur.insert_many(sources_chaleur)
    
    if materiaux:
        await db.dsi_materiaux.delete_many({})
        await db.dsi_materiaux.insert_many(materiaux)
    
    if facteurs_allumage:
        await db.dsi_facteurs_allumage.delete_many({})
        await db.dsi_facteurs_allumage.insert_many(facteurs_allumage)
    
    if usages_batiment:
        await db.dsi_usages_batiment.delete_many({})
        await db.dsi_usages_batiment.insert_many(usages_batiment)
    
    logging.info("Données de référence DSI initialisées avec succès")
    
@router.post("/{tenant_slug}/interventions/seed-dsi-references")
async def seed_dsi_reference_data(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Initialise les données de référence DSI (codes MSP du Québec)"""
    await initialize_dsi_reference_data()
    
    # Compter les données insérées
    counts = {
        "causes": await db.dsi_causes.count_documents({}),
        "sources_chaleur": await db.dsi_sources_chaleur.count_documents({}),
        "materiaux": await db.dsi_materiaux.count_documents({}),
        "facteurs_allumage": await db.dsi_facteurs_allumage.count_documents({}),
        "usages_batiment": await db.dsi_usages_batiment.count_documents({})
    }
    
    return {
        "success": True,
        "message": "Données de référence DSI initialisées",
        "counts": counts
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
            "modeles_narratif": [
                {"id": "1", "titre": "Arrivée sur les lieux", "contenu": "À notre arrivée sur les lieux, nous avons constaté..."},
                {"id": "2", "titre": "Intervention standard", "contenu": "L'intervention s'est déroulée sans incident. Les opérations ont consisté en..."},
                {"id": "3", "titre": "Fausse alerte", "contenu": "Suite à notre investigation, il s'agit d'une fausse alerte causée par..."},
            ],
            "fausse_alarme_config": {
                "actif": False,
                "seuil_gratuit": 3,
                "periode": "roulante_12_mois",
                "type_facturation": "fixe",
                "montant_fixe": 500,
                "montants_progressifs": [200, 400, 600],
                "types_intervention_concernes": ["Alarme incendie", "Alarme CO", "Alarme automatique"]
            },
            "created_at": datetime.now(timezone.utc)
        }
        await db.intervention_settings.insert_one(settings)
        settings.pop("_id", None)
    
    # S'assurer que les champs existent toujours
    if "modeles_narratif" not in settings:
        settings["modeles_narratif"] = []
    if "fausse_alarme_config" not in settings:
        settings["fausse_alarme_config"] = {
            "actif": False,
            "seuil_gratuit": 3,
            "periode": "roulante_12_mois",
            "type_facturation": "fixe",
            "montant_fixe": 500,
            "montants_progressifs": [200, 400, 600],
            "types_intervention_concernes": ["Alarme incendie", "Alarme CO", "Alarme automatique"]
        }
    
    return {"settings": settings}


@router.put("/{tenant_slug}/interventions/settings")
async def update_intervention_settings(
    tenant_slug: str,
    settings_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres du module"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "modifier", "parametres")
    
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
    
    # Pour les interventions importées : enrichir avec les données PremLigne
    if intervention.get("import_source") == "history_import":
        # Véhicules depuis le champ extrait par import_batch
        if not vehicles and intervention.get("vehicules"):
            for v in intervention["vehicules"]:
                if isinstance(v, dict):
                    vehicles.append({
                        "intervention_id": intervention_id,
                        "xml_vehicle_number": v.get("numero") or v.get("xml_vehicle_number") or v.get("id_vehicule") or "",
                        "crew_count": v.get("nb_intervenants") or v.get("crew_count") or 0,
                        "heure_appel": v.get("heure_appel") or "",
                        "heure_en_route": v.get("heure_en_route") or "",
                        "heure_lieu": v.get("heure_lieu") or "",
                        "heure_retour": v.get("heure_retour") or v.get("heure_disp_caserne") or "",
                        "imported": True,
                    })
        
        # Personnel depuis le champ extrait par import_batch
        if not resources and intervention.get("personnel"):
            for p in intervention["personnel"]:
                if isinstance(p, dict):
                    nom_complet = p.get("nom") or ""
                    resources.append({
                        "intervention_id": intervention_id,
                        "id": nom_complet,
                        "user_name": nom_complet,
                        "nom": nom_complet.split("(")[0].strip().split(" ")[-1] if nom_complet else "",
                        "prenom": nom_complet.split("(")[0].strip().split(" ")[0] if nom_complet else "",
                        "vehicle_number": p.get("vehicule") or "",
                        "statut_presence": "present" if p.get("presence") in ("Présent", "Détaché") else p.get("presence", ""),
                        "date_debut": p.get("date_debut") or "",
                        "date_fin": p.get("date_fin") or "",
                        "libere": p.get("libere") or "",
                        "imported": True,
                    })
        
        # S'assurer que narratif_structure contient les notes pour l'onglet Narratif
        if intervention.get("notes") and not intervention.get("narratif_structure"):
            intervention["narratif_structure"] = {"notes": intervention["notes"]}
        
        # Photos : fusionner les photos stockées dans stored_files
        stored_photos = await db.stored_files.find({
            "entity_id": intervention_id,
            "is_deleted": False,
        }, {"_id": 0}).to_list(100)
        if stored_photos:
            existing_photos = intervention.get("photos") or []
            from services.azure_storage import generate_sas_url as _gen_sas
            for sf in stored_photos:
                blob_name = sf.get("blob_name") or sf.get("storage_path")
                content_type = sf.get("content_type", "")
                if blob_name and content_type.startswith("image/"):
                    existing_photos.append({
                        "id": sf.get("id", ""),
                        "photo_url": _gen_sas(blob_name),
                        "blob_name": blob_name,
                        "description": sf.get("original_filename", ""),
                        "imported": True,
                    })
            intervention["photos"] = existing_photos
        
        # Matériel utilisé → injecter dans formData pour l'onglet Matériel
        if intervention.get("materiel_utilise") and not intervention.get("_materiel_loaded"):
            # Le frontend lit formData.materiel_utilise directement
            pass  # déjà dans l'objet intervention
        
        # Remise de propriété → créer dans la collection si pas encore fait
        if intervention.get("remise_propriete") and intervention["remise_propriete"].get("remis_a"):
            rp = intervention["remise_propriete"]
            existing_rp = await db.remises_propriete.find_one(
                {"intervention_id": intervention_id, "imported": True}, {"_id": 0, "id": 1}
            )
            if not existing_rp:
                import uuid as _uuid
                rp_id = str(_uuid.uuid4())
                await db.remises_propriete.insert_one({
                    "id": rp_id,
                    "intervention_id": intervention_id,
                    "tenant_id": intervention["tenant_id"],
                    "date_libere": rp.get("date_libere", ""),
                    "remis_a": rp.get("remis_a", ""),
                    "nom_signataire": rp.get("remis_a", ""),
                    "fichier_ref": rp.get("fichier_ref", ""),
                    "repondant": intervention.get("repondant", {}),
                    "imported": True,
                    "created_at": intervention.get("imported_at", ""),
                })
    
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
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_intervention_update(tenant_slug, "update", {
        "id": intervention_id,
        "numero": updated.get("numero")
    }))
    
    return {"success": True, "intervention": updated}


@router.post("/{tenant_slug}/interventions/{intervention_id}/validate")
async def validate_intervention(
    tenant_slug: str,
    intervention_id: str,
    validation_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Valide ou retourne une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "valider", "rapports")
    
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
        
        # Notifier les rédacteurs assignés que le rapport est renvoyé pour révision
        assigned_reporters = intervention.get("assigned_reporters", [])
        external_call_id = intervention.get("external_call_id", intervention_id)
        
        for reporter in assigned_reporters:
            reporter_id = reporter.get("user_id") if isinstance(reporter, dict) else reporter
            if reporter_id and reporter_id != current_user.id:
                await creer_notification(
                    tenant_id=tenant.id,
                    user_id=reporter_id,
                    type_notification="intervention_revision",
                    titre="📝 Rapport à réviser",
                    message=f"Le rapport d'intervention #{external_call_id} a été retourné pour révision. {comment or ''}".strip(),
                    lien=f"/interventions/{intervention_id}",
                    data={"intervention_id": intervention_id, "comment": comment}
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
    
    # Vérifier permission de modification
    await require_permission(tenant.id, current_user, "interventions", "modifier", "rapports")
    
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

@router.get("/{tenant_slug}/interventions/geocode")
async def geocode_for_intervention(
    tenant_slug: str,
    address: str,
    current_user: User = Depends(get_current_user),
):
    """Proxy de geocoding Nominatim pour éviter les problèmes CORS côté frontend."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"format": "json", "q": address, "limit": 1},
                headers={"User-Agent": "ProFireManager/1.0"},
            )
            if response.status_code == 200:
                data = response.json()
                if data:
                    return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"])}
            return {"lat": None, "lon": None}
    except Exception as e:
        logger.error(f"Erreur geocoding: {e}")
        return {"lat": None, "lon": None}

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
        config_equipe = params.get(type_emploi, {})
        
        if not config_equipe.get("rotation_active", False):
            continue
        
        type_rotation = config_equipe.get("type_rotation", "aucun")
        if type_rotation == "aucun":
            continue
        
        nb_equipes = config_equipe.get("nombre_equipes", 4)
        
        # Calculer quelle équipe est de garde
        date_obj = datetime.strptime(date, "%Y-%m-%d").date()
        date_debut_rotation = config_equipe.get("date_debut_rotation")
        
        if not date_debut_rotation:
            continue
        
        if isinstance(date_debut_rotation, str):
            date_debut = datetime.strptime(date_debut_rotation[:10], "%Y-%m-%d").date()
        else:
            date_debut = date_debut_rotation.date() if hasattr(date_debut_rotation, 'date') else date_debut_rotation
        
        jours_depuis_debut = (date_obj - date_debut).days
        
        if type_rotation == "24h":
            equipe_index = jours_depuis_debut % nb_equipes
        elif type_rotation == "48h":
            equipe_index = (jours_depuis_debut // 2) % nb_equipes
        elif type_rotation == "semaine":
            equipe_index = (jours_depuis_debut // 7) % nb_equipes
        else:
            equipe_index = 0
        
        equipe_nom = f"Équipe {equipe_index + 1}"
        
        # Récupérer les membres de cette équipe
        membres = await db.users.find({
            "tenant_id": tenant.id,
            "equipe_garde": equipe_nom,
            "type_emploi": type_emploi.replace("_", " ").title(),
            "statut": {"$in": ["Actif", "actif"]}
        }).to_list(None)
        
        result["equipes"].append({
            "type_emploi": type_emploi,
            "type_rotation": type_rotation,
            "equipe_numero": equipe_index + 1,
            "equipe_nom": equipe_nom,
            "membres": [{
                "id": m.get("id"),
                "nom": m.get("nom"),
                "prenom": m.get("prenom"),
                "matricule": m.get("matricule"),
                "grade": m.get("grade"),
                "fonction_superieur": m.get("fonction_superieur", False)
            } for m in membres]
        })
    
    return result


# ==================== FAUSSES ALARMES ====================

def normaliser_adresse(adresse: str) -> str:
    """Normalise une adresse pour la comparaison"""
    if not adresse:
        return ""
    # Mettre en minuscules, supprimer les espaces multiples et les accents courants
    import unicodedata
    normalized = unicodedata.normalize('NFKD', adresse.lower())
    normalized = ''.join(c for c in normalized if not unicodedata.combining(c))
    # Supprimer ponctuation et espaces multiples
    normalized = re.sub(r'[^\w\s]', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


async def get_fausses_alarmes_count(tenant_id: str, adresse: str, config: dict) -> dict:
    """
    Compte les fausses alarmes pour une adresse donnée selon la période configurée.
    """
    adresse_norm = normaliser_adresse(adresse)
    
    # Déterminer la date de début selon la période
    now = datetime.now(timezone.utc)
    if config.get("periode") == "annuelle":
        date_debut = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:  # roulante_12_mois
        date_debut = now - timedelta(days=365)
    
    # Chercher dans le suivi existant
    suivi = await db.fausses_alarmes_suivi.find_one({
        "tenant_id": tenant_id,
        "adresse_normalisee": adresse_norm
    })
    
    if suivi:
        # Filtrer les interventions selon la période
        interventions_periode = [
            i for i in suivi.get("interventions", [])
            if datetime.fromisoformat(i["date"].replace("Z", "+00:00")) >= date_debut
        ]
        return {
            "count": len(interventions_periode),
            "interventions": interventions_periode,
            "suivi_id": suivi.get("id"),
            "statut_facturation": suivi.get("statut_facturation", "ok"),
            "batiment_id": suivi.get("batiment_id")
        }
    
    return {
        "count": 0,
        "interventions": [],
        "suivi_id": None,
        "statut_facturation": "ok",
        "batiment_id": None
    }


async def update_fausse_alarme_suivi(
    tenant_id: str, 
    intervention: dict, 
    config: dict,
    is_fausse_alarme: bool
):
    """
    Met à jour le suivi des fausses alarmes pour une adresse.
    """
    adresse = intervention.get("adresse") or intervention.get("location", {}).get("address", "")
    if not adresse:
        return None
    
    adresse_norm = normaliser_adresse(adresse)
    intervention_id = intervention.get("id")
    date_intervention = intervention.get("date_heure_alerte") or intervention.get("created_at")
    
    if isinstance(date_intervention, str):
        date_str = date_intervention
    else:
        date_str = date_intervention.isoformat() if date_intervention else datetime.now(timezone.utc).isoformat()
    
    # Chercher un suivi existant
    suivi = await db.fausses_alarmes_suivi.find_one({
        "tenant_id": tenant_id,
        "adresse_normalisee": adresse_norm
    })
    
    intervention_entry = {
        "intervention_id": intervention_id,
        "date": date_str,
        "numero_intervention": intervention.get("numero_carte_appel", "")
    }
    
    if is_fausse_alarme:
        if suivi:
            # Vérifier si l'intervention est déjà dans la liste
            existing_ids = [i["intervention_id"] for i in suivi.get("interventions", [])]
            if intervention_id not in existing_ids:
                await db.fausses_alarmes_suivi.update_one(
                    {"_id": suivi["_id"]},
                    {
                        "$push": {"interventions": intervention_entry},
                        "$set": {
                            "derniere_alarme": datetime.now(timezone.utc),
                            "updated_at": datetime.now(timezone.utc)
                        }
                    }
                )
        else:
            # Créer un nouveau suivi
            # Chercher si l'adresse correspond à un bâtiment (module prévention)
            batiment = await db.prevention_batiments.find_one({
                "tenant_id": tenant_id,
                "$or": [
                    {"adresse_normalisee": adresse_norm},
                    {"adresse": {"$regex": re.escape(adresse[:20]), "$options": "i"}}
                ]
            })
            
            new_suivi = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "adresse_normalisee": adresse_norm,
                "adresse_originale": adresse,
                "batiment_id": batiment.get("id") if batiment else None,
                "batiment_nom": batiment.get("nom") if batiment else None,
                "interventions": [intervention_entry],
                "derniere_alarme": datetime.now(timezone.utc),
                "statut_facturation": "ok",
                "factures": [],
                "exemption": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            await db.fausses_alarmes_suivi.insert_one(new_suivi)
            suivi = new_suivi
    else:
        # Retirer l'intervention si elle était marquée comme fausse alarme
        if suivi:
            await db.fausses_alarmes_suivi.update_one(
                {"_id": suivi["_id"]},
                {
                    "$pull": {"interventions": {"intervention_id": intervention_id}},
                    "$set": {"updated_at": datetime.now(timezone.utc)}
                }
            )
    
    # Recalculer le statut
    if suivi or is_fausse_alarme:
        count_data = await get_fausses_alarmes_count(tenant_id, adresse, config)
        count = count_data["count"]
        seuil = config.get("seuil_gratuit", 3)
        
        if count > seuil:
            new_statut = "a_facturer"
        elif count >= seuil:
            new_statut = "a_surveiller"
        else:
            new_statut = "ok"
        
        await db.fausses_alarmes_suivi.update_one(
            {"tenant_id": tenant_id, "adresse_normalisee": adresse_norm},
            {"$set": {"statut_facturation": new_statut, "compteur_periode": count}}
        )
        
        # Envoyer une alerte si le seuil est dépassé
        if count == seuil + 1 and config.get("actif"):
            await creer_notification(
                tenant_id=tenant_id,
                type_notification="fausse_alarme_seuil",
                titre=f"⚠️ Seuil de fausses alarmes atteint",
                message=f"L'adresse '{adresse}' a atteint {count} fausses alarmes. Facturation suggérée.",
                lien="/interventions?tab=fausses-alarmes",
                data={
                    "adresse": adresse,
                    "count": count,
                    "seuil": seuil
                },
                destinataires_roles=["admin", "superviseur"]
            )
        
        return count_data
    
    return None


@router.get("/{tenant_slug}/interventions/fausses-alarmes")
async def get_fausses_alarmes_list(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Liste toutes les adresses avec des fausses alarmes.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "voir", "fausses-alarmes")
    
    # Récupérer la config
    settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
    config = settings.get("fausse_alarme_config", {}) if settings else {}
    seuil = config.get("seuil_gratuit", 3)
    
    # Récupérer tous les suivis
    suivis = await db.fausses_alarmes_suivi.find({
        "tenant_id": tenant.id
    }).to_list(1000)
    
    # Recalculer les compteurs selon la période
    now = datetime.now(timezone.utc)
    if config.get("periode") == "annuelle":
        date_debut = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:
        date_debut = now - timedelta(days=365)
    
    result = []
    for suivi in suivis:
        interventions_periode = [
            i for i in suivi.get("interventions", [])
            if datetime.fromisoformat(i["date"].replace("Z", "+00:00")) >= date_debut
        ]
        
        count = len(interventions_periode)
        if count == 0:
            continue
        
        # Calculer le montant à facturer
        montant = 0
        if count > seuil and config.get("actif"):
            facturables = count - seuil
            if config.get("type_facturation") == "fixe":
                montant = facturables * config.get("montant_fixe", 500)
            else:
                montants_prog = config.get("montants_progressifs", [200, 400, 600])
                for i in range(facturables):
                    idx = min(i, len(montants_prog) - 1)
                    montant += montants_prog[idx]
        
        result.append({
            "id": suivi.get("id"),
            "adresse": suivi.get("adresse_originale"),
            "adresse_normalisee": suivi.get("adresse_normalisee"),
            "batiment_id": suivi.get("batiment_id"),
            "batiment_nom": suivi.get("batiment_nom"),
            "count": count,
            "seuil": seuil,
            "statut_facturation": suivi.get("statut_facturation", "ok"),
            "montant_a_facturer": montant,
            "derniere_alarme": suivi.get("derniere_alarme"),
            "interventions": interventions_periode,
            "factures": suivi.get("factures", []),
            "exemption": suivi.get("exemption")
        })
    
    # Trier par count décroissant
    result.sort(key=lambda x: x["count"], reverse=True)
    
    return {
        "fausses_alarmes": result,
        "config": config,
        "total_adresses": len(result),
        "total_a_facturer": len([r for r in result if r["statut_facturation"] == "a_facturer"])
    }


@router.get("/{tenant_slug}/interventions/fausses-alarmes/{adresse_id}")
async def get_fausse_alarme_detail(
    tenant_slug: str,
    adresse_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Détail d'une adresse avec ses fausses alarmes.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    suivi = await db.fausses_alarmes_suivi.find_one({
        "tenant_id": tenant.id,
        "id": adresse_id
    })
    
    if not suivi:
        raise HTTPException(status_code=404, detail="Suivi non trouvé")
    
    # Récupérer les détails des interventions
    intervention_ids = [i["intervention_id"] for i in suivi.get("interventions", [])]
    interventions = await db.interventions.find({
        "tenant_id": tenant.id,
        "id": {"$in": intervention_ids}
    }).to_list(100)
    
    # Récupérer le bâtiment si lié
    batiment = None
    if suivi.get("batiment_id"):
        batiment = await db.prevention_batiments.find_one({
            "tenant_id": tenant.id,
            "id": suivi["batiment_id"]
        })
        if batiment:
            batiment = clean_mongo_doc(batiment)
    
    return {
        "suivi": clean_mongo_doc(suivi),
        "interventions": [clean_mongo_doc(i) for i in interventions],
        "batiment": batiment
    }


@router.post("/{tenant_slug}/interventions/fausses-alarmes/{adresse_id}/exempter")
async def exempter_fausse_alarme(
    tenant_slug: str,
    adresse_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Exempte une adresse de la facturation des fausses alarmes.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "modifier", "fausses-alarmes")
    
    await db.fausses_alarmes_suivi.update_one(
        {"tenant_id": tenant.id, "id": adresse_id},
        {
            "$set": {
                "statut_facturation": "exempte",
                "exemption": {
                    "raison": data.get("raison", ""),
                    "date": datetime.now(timezone.utc),
                    "par": current_user.id,
                    "par_nom": f"{current_user.prenom} {current_user.nom}"
                },
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"success": True, "message": "Adresse exemptée de facturation"}


@router.post("/{tenant_slug}/interventions/fausses-alarmes/{adresse_id}/facturer")
async def creer_suggestion_facture(
    tenant_slug: str,
    adresse_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Crée une suggestion de facture pour les fausses alarmes d'une adresse.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "creer", "fausses-alarmes")
    
    suivi = await db.fausses_alarmes_suivi.find_one({
        "tenant_id": tenant.id,
        "id": adresse_id
    })
    
    if not suivi:
        raise HTTPException(status_code=404, detail="Suivi non trouvé")
    
    # Créer la facture
    facture = {
        "id": str(uuid.uuid4()),
        "date_creation": datetime.now(timezone.utc),
        "montant": data.get("montant", 0),
        "responsable": {
            "nom": data.get("responsable_nom", ""),
            "adresse": data.get("responsable_adresse", ""),
            "telephone": data.get("responsable_telephone", ""),
            "courriel": data.get("responsable_courriel", "")
        },
        "interventions_facturees": [i["intervention_id"] for i in suivi.get("interventions", [])],
        "statut": "suggestion",
        "notes": data.get("notes", ""),
        "cree_par": current_user.id,
        "cree_par_nom": f"{current_user.prenom} {current_user.nom}"
    }
    
    await db.fausses_alarmes_suivi.update_one(
        {"tenant_id": tenant.id, "id": adresse_id},
        {
            "$push": {"factures": facture},
            "$set": {
                "statut_facturation": "facture",
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Créer une activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="facture_fausse_alarme",
        description=f"Suggestion de facture créée pour {suivi.get('adresse_originale')} - {data.get('montant', 0)}$",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    return {"success": True, "facture": facture}


@router.get("/{tenant_slug}/interventions/{intervention_id}/fausse-alarme-info")
async def get_intervention_fausse_alarme_info(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les infos de fausse alarme pour une intervention.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    intervention = await db.interventions.find_one({
        "tenant_id": tenant.id,
        "id": intervention_id
    })
    
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Récupérer la config
    settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
    config = settings.get("fausse_alarme_config", {}) if settings else {}
    
    adresse = intervention.get("adresse") or intervention.get("location", {}).get("address", "")
    count_data = await get_fausses_alarmes_count(tenant.id, adresse, config)
    
    return {
        "is_fausse_alarme": intervention.get("alarme_non_fondee", False),
        "adresse": adresse,
        "count": count_data["count"],
        "seuil": config.get("seuil_gratuit", 3),
        "config_active": config.get("actif", False),
        "statut_facturation": count_data["statut_facturation"],
        "batiment_id": count_data["batiment_id"]
    }


@router.put("/{tenant_slug}/interventions/{intervention_id}/alarme-non-fondee")
async def toggle_alarme_non_fondee(
    tenant_slug: str,
    intervention_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Marque ou démarque une intervention comme alarme non fondée.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "modifier", "fausses-alarmes")
    
    intervention = await db.interventions.find_one({
        "tenant_id": tenant.id,
        "id": intervention_id
    })
    
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    is_fausse_alarme = data.get("alarme_non_fondee", False)
    
    # Mettre à jour l'intervention
    await db.interventions.update_one(
        {"tenant_id": tenant.id, "id": intervention_id},
        {
            "$set": {
                "alarme_non_fondee": is_fausse_alarme,
                "alarme_non_fondee_date": datetime.now(timezone.utc) if is_fausse_alarme else None,
                "alarme_non_fondee_par": current_user.id if is_fausse_alarme else None,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Récupérer la config
    settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
    config = settings.get("fausse_alarme_config", {}) if settings else {}
    
    # Mettre à jour le suivi
    intervention["alarme_non_fondee"] = is_fausse_alarme
    count_data = await update_fausse_alarme_suivi(tenant.id, intervention, config, is_fausse_alarme)
    
    action = "marquée comme" if is_fausse_alarme else "retirée des"
    logger.info(f"🚨 Intervention {intervention_id} {action} fausse alarme par {current_user.email}")
    
    return {
        "success": True,
        "alarme_non_fondee": is_fausse_alarme,
        "count": count_data["count"] if count_data else 0,
        "statut_facturation": count_data["statut_facturation"] if count_data else "ok"
    }


@router.post("/{tenant_slug}/interventions/import-xml")
async def import_intervention_xml(
    tenant_slug: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user)
):
    """Importe des fichiers XML de la centrale 911"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "creer", "rapports")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "voir", "parametres")
    
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
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "modifier", "parametres")
    
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


@router.delete("/{tenant_slug}/interventions/{intervention_id}")
async def delete_intervention(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime une carte d'appel (intervention).
    RÉSERVÉ AUX SUPERADMINS uniquement - pour nettoyer les données de test.
    """
    # Vérifier que c'est un superadmin
    if not getattr(current_user, 'is_super_admin', False):
        raise HTTPException(
            status_code=403, 
            detail="Cette action est réservée aux superadmins uniquement"
        )
    
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
    
    # Supprimer l'intervention
    await db.interventions.delete_one({"id": intervention_id})
    
    # Supprimer les données associées
    await db.intervention_resources.delete_many({"intervention_id": intervention_id})
    await db.intervention_personnel.delete_many({"intervention_id": intervention_id})
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_intervention_update(tenant_slug, "delete", {
        "id": intervention_id
    }))
    
    logger.warning(f"🗑️ SUPERADMIN {current_user.email} a supprimé l'intervention {intervention.get('external_call_id', intervention_id)} du tenant {tenant_slug}")
    
    return {
        "success": True,
        "message": f"Carte d'appel {intervention.get('external_call_id', intervention_id)} supprimée"
    }


@router.put("/{tenant_slug}/interventions/{intervention_id}/assign-reporters")
async def assign_intervention_reporters(
    tenant_slug: str,
    intervention_id: str,
    reporters_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Assigne des personnes pour remplir le rapport"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    await require_permission(tenant.id, current_user, "interventions", "modifier", "rapports")
    
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
    
    header_data = []
    try:
        from services.azure_storage import get_logo_bytes
        logo_data = get_logo_bytes(tenant)
        if logo_data:
            logo_buffer = BytesIO(logo_data)
            logo_img = Image(logo_buffer, width=1*inch, height=1*inch)
            header_data.append([logo_img, Paragraph(f"<b>{nom_service}</b><br/>AVIS DE CESSATION D'INTERVENTION<br/>ET TRANSFERT DE GARDE", title_style)])
        else:
            header_data.append([Paragraph(f"<b>{nom_service}</b><br/><br/>AVIS DE CESSATION D'INTERVENTION ET TRANSFERT DE GARDE", title_style)])
    except:
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
        from_email = os.environ.get("SENDER_EMAIL", "noreply@profiremanager.ca")
        
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
        
        # Log email
        try:
            from routes.emails_history import log_email_sent
            import asyncio
            asyncio.create_task(log_email_sent(
                type_email="remise_propriete",
                destinataire_email=recipient_email,
                sujet=f"Remise de propriété - Intervention {intervention.get('external_call_id', 'NA')}",
                tenant_id=tenant_id,
                metadata={"intervention_id": intervention.get('id'), "external_call_id": intervention.get('external_call_id')}
            ))
        except Exception as log_err:
            print(f"Erreur log email: {log_err}")
        
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
        # Pour les interventions importées : chercher le fichier dans stored_files
        stored_file = await db.stored_files.find_one({
            "entity_id": intervention_id,
            "is_deleted": False,
            "$or": [
                {"original_filename": {"$regex": "remise|propriete|prop", "$options": "i"}},
                {"content_type": "application/pdf"},
                {"category": "import-history"},
            ]
        }, {"_id": 0})
        if stored_file:
            blob_name = stored_file.get("blob_name") or stored_file.get("storage_path")
            if blob_name:
                from services.azure_storage import get_object
                try:
                    data, content_type = get_object(blob_name)
                    return Response(
                        content=data,
                        media_type=content_type or "application/pdf",
                        headers={"Content-Disposition": f"attachment; filename=remise_propriete_{remise_id[:8]}.pdf"}
                    )
                except Exception:
                    pass
        
        # Fallback : générer le PDF à la volée depuis les données existantes
        intervention = await db.interventions.find_one(
            {"id": intervention_id, "tenant_id": tenant.id}, {"_id": 0}
        )
        if intervention and remise.get("remis_a"):
            try:
                pdf_b64 = await generer_pdf_remise_propriete(
                    {"id": tenant.id, "nom": tenant.nom, "nom_service": getattr(tenant, 'nom_service', tenant.nom)},
                    intervention,
                    remise
                )
                if pdf_b64:
                    # Sauvegarder pour ne pas regénérer à chaque appel
                    await db.remises_propriete.update_one(
                        {"id": remise_id}, {"$set": {"pdf_base64": pdf_b64}}
                    )
                    pdf_bytes = base64.b64decode(pdf_b64)
                    return Response(
                        content=pdf_bytes,
                        media_type="application/pdf",
                        headers={"Content-Disposition": f"attachment; filename=remise_propriete_{remise_id[:8]}.pdf"}
                    )
            except Exception as e:
                logger.error(f"Erreur génération PDF remise à la volée: {e}")
        
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




# ==================== SECTION RCCI (ENQUÊTE) ====================

class RCCICreate(BaseModel):
    """Modèle pour créer/mettre à jour un rapport RCCI"""
    # Données de l'enquête
    origin_area: str = ""  # Point d'origine précis
    probable_cause: str = "indeterminee"  # accidentelle, intentionnelle, naturelle, indeterminee
    ignition_source: str = ""  # Source de chaleur
    material_first_ignited: str = ""  # Premier matériau enflammé
    smoke_detector_status: str = "indetermine"  # absent, present_fonctionnel, present_non_fonctionnel, indetermine
    investigator_id: Optional[str] = None  # Matricule officier responsable
    narrative: str = ""  # Description des circonstances
    
    # Transfert dossier
    transfert_police: bool = False
    motif_transfert: Optional[str] = None
    date_transfert: Optional[datetime] = None
    numero_dossier_police: Optional[str] = None


class RCCIPhotoCreate(BaseModel):
    """Modèle pour ajouter une photo à l'enquête"""
    photo_base64: str
    description: str = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.get("/{tenant_slug}/interventions/{intervention_id}/rcci")
async def get_rcci(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les données RCCI d'une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    rcci = await db.rcci.find_one({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    }, {"_id": 0})
    
    # Pour les interventions importées : créer automatiquement la RCCI si données disponibles
    if not rcci:
        intervention = await db.interventions.find_one(
            {"tenant_id": tenant.id, "id": intervention_id, "import_source": "history_import"},
            {"_id": 0, "probable_cause": 1, "ignition_source": 1, "origin_area": 1,
             "material_first_ignited": 1, "fire_combustible": 1, "fire_extent": 1,
             "fire_propagation": 1, "fire_dommage": 1, "fire_mode_inflammation": 1,
             "fire_energie": 1, "enquete_police": 1, "enquete_date": 1, "enquete_num_dossier": 1}
        )
        if intervention and (intervention.get("probable_cause") or intervention.get("ignition_source") or intervention.get("enquete_num_dossier")):
            import uuid as _uuid
            
            # Normaliser probable_cause pour correspondre aux valeurs du frontend
            raw_cause = (intervention.get("probable_cause") or "").lower().strip()
            normalized_cause = "indeterminee"
            if "accident" in raw_cause or "négligence" in raw_cause:
                normalized_cause = "accidentelle"
            elif "intention" in raw_cause or "criminal" in raw_cause:
                normalized_cause = "intentionnelle"
            elif "natur" in raw_cause or "foudre" in raw_cause:
                normalized_cause = "naturelle"
            elif raw_cause in ("accidentelle", "intentionnelle", "naturelle", "indeterminee"):
                normalized_cause = raw_cause
            
            # Normaliser ignition_source pour correspondre au dropdown frontend
            raw_ignition = (intervention.get("ignition_source") or "").lower().strip()
            normalized_ignition = intervention.get("ignition_source", "")
            ignition_map = {
                "electr": "electrique", "court-circuit": "electrique", "surcharge": "electrique",
                "cuisi": "cuisson", "four": "cuisson", "plaque": "cuisson",
                "chandel": "flamme_nue", "bougie": "flamme_nue", "allumette": "flamme_nue",
                "cigarette": "cigarette", "fumeur": "cigarette",
                "chauff": "appareil_chauffage", "poêle": "appareil_chauffage",
                "foudre": "foudre",
                "friction": "friction",
                "chimiq": "produit_chimique",
            }
            for keyword, code in ignition_map.items():
                if keyword in raw_ignition:
                    normalized_ignition = code
                    break
            
            rcci = {
                "id": str(_uuid.uuid4()),
                "tenant_id": tenant.id,
                "intervention_id": intervention_id,
                "origin_area": intervention.get("origin_area", ""),
                "probable_cause": normalized_cause,
                "probable_cause_raw": intervention.get("probable_cause", ""),
                "ignition_source": normalized_ignition,
                "ignition_source_raw": intervention.get("ignition_source", ""),
                "material_first_ignited": intervention.get("material_first_ignited", ""),
                "fire_combustible": intervention.get("fire_combustible", ""),
                "fire_extent": intervention.get("fire_extent", ""),
                "fire_propagation": intervention.get("fire_propagation", ""),
                "fire_dommage": intervention.get("fire_dommage", ""),
                "fire_mode_inflammation": intervention.get("fire_mode_inflammation", ""),
                "fire_energie": intervention.get("fire_energie", ""),
                "transfert_police": intervention.get("enquete_police", "") != "Non" and bool(intervention.get("enquete_num_dossier")),
                "numero_dossier_police": intervention.get("enquete_num_dossier", ""),
                "date_transfert": intervention.get("enquete_date", ""),
                "imported": True,
                "photos": [],
            }
            await db.rcci.insert_one(rcci)
            rcci.pop("_id", None)
    
    # Résoudre blob_names en SAS URLs pour les photos RCCI
    if rcci and rcci.get("photos"):
        from services.azure_storage import generate_sas_url as _sas
        for p in rcci["photos"]:
            if p.get("blob_name"):
                p["photo_url"] = _sas(p["blob_name"])
            elif p.get("photo_base64"):
                p["photo_url"] = p["photo_base64"]
    
    return {"rcci": rcci}


@router.post("/{tenant_slug}/interventions/{intervention_id}/rcci")
async def create_or_update_rcci(
    tenant_slug: str,
    intervention_id: str,
    data: RCCICreate,
    current_user: User = Depends(get_current_user)
):
    """Crée ou met à jour le rapport RCCI d'une intervention"""
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
    
    now = datetime.now(timezone.utc)
    
    # Vérifier si un RCCI existe déjà
    existing = await db.rcci.find_one({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    })
    
    # Vérifier si transfert à la police est nécessaire
    requires_transfer = data.probable_cause in ["indeterminee", "intentionnelle"]
    
    rcci_data = {
        "tenant_id": tenant.id,
        "intervention_id": intervention_id,
        "origin_area": data.origin_area,
        "probable_cause": data.probable_cause,
        "ignition_source": data.ignition_source,
        "material_first_ignited": data.material_first_ignited,
        "smoke_detector_status": data.smoke_detector_status,
        "investigator_id": data.investigator_id,
        "narrative": data.narrative,
        "transfert_police": data.transfert_police,
        "motif_transfert": data.motif_transfert,
        "date_transfert": data.date_transfert,
        "numero_dossier_police": data.numero_dossier_police,
        "requires_transfer_alert": requires_transfer and not data.transfert_police,
        "updated_at": now,
        "updated_by": current_user.id
    }
    
    if existing:
        # Mise à jour
        await db.rcci.update_one(
            {"tenant_id": tenant.id, "intervention_id": intervention_id},
            {"$set": rcci_data}
        )
        rcci_id = existing.get("id")
    else:
        # Création
        rcci_id = str(uuid.uuid4())
        rcci_data["id"] = rcci_id
        rcci_data["created_at"] = now
        rcci_data["created_by"] = current_user.id
        rcci_data["photos"] = []
        await db.rcci.insert_one(rcci_data)
        
        # Ajouter référence à l'intervention
        await db.interventions.update_one(
            {"id": intervention_id, "tenant_id": tenant.id},
            {"$set": {"rcci_id": rcci_id, "updated_at": now}}
        )
    
    return {
        "success": True,
        "rcci_id": rcci_id,
        "requires_transfer_alert": requires_transfer and not data.transfert_police
    }


@router.post("/{tenant_slug}/interventions/{intervention_id}/rcci/photos")
async def add_rcci_photo(
    tenant_slug: str,
    intervention_id: str,
    data: RCCIPhotoCreate,
    current_user: User = Depends(get_current_user)
):
    """Ajoute une photo à l'enquête RCCI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier que le RCCI existe
    rcci = await db.rcci.find_one({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    })
    if not rcci:
        raise HTTPException(status_code=404, detail="RCCI non trouvé. Créez d'abord le rapport d'enquête.")
    
    now = datetime.now(timezone.utc)
    
    # Upload photo vers Azure
    from services.azure_storage import upload_base64_to_azure, generate_sas_url
    azure_result = upload_base64_to_azure(data.photo_base64, tenant.id, "rcci-photos", f"rcci_{intervention_id}.jpg")
    
    photo = {
        "id": str(uuid.uuid4()),
        "blob_name": azure_result["blob_name"],
        "description": data.description,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "timestamp": now,
        "uploaded_by": current_user.id,
        "uploaded_by_name": f"{current_user.prenom} {current_user.nom}"
    }
    
    await db.rcci.update_one(
        {"tenant_id": tenant.id, "intervention_id": intervention_id},
        {"$push": {"photos": photo}}
    )
    
    return {"success": True, "photo_id": photo["id"]}


@router.delete("/{tenant_slug}/interventions/{intervention_id}/rcci/photos/{photo_id}")
async def delete_rcci_photo(
    tenant_slug: str,
    intervention_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une photo de l'enquête RCCI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer le blob_name avant suppression
    rcci = await db.rcci.find_one(
        {"tenant_id": tenant.id, "intervention_id": intervention_id},
        {"photos": 1}
    )
    if rcci:
        for p in rcci.get("photos", []):
            if p.get("id") == photo_id and p.get("blob_name"):
                from services.azure_storage import delete_object
                delete_object(p["blob_name"])
                break
    
    await db.rcci.update_one(
        {"tenant_id": tenant.id, "intervention_id": intervention_id},
        {"$pull": {"photos": {"id": photo_id}}}
    )
    
    return {"success": True}


# ==================== DONNÉES SINISTRÉ (PROPRIÉTAIRE + ASSURANCE) ====================

class DonneesSinistreCreate(BaseModel):
    """Modèle pour les données du sinistré"""
    # Propriétaire
    owner_name: str = ""
    owner_phone: str = ""
    owner_email: str = ""
    owner_address: str = ""
    
    # Assurance
    insurance_company: str = ""
    policy_number: str = ""
    insurance_broker: str = ""
    insurance_phone: str = ""
    
    # Estimations des pertes
    estimated_loss_building: float = 0
    estimated_loss_content: float = 0
    loss_notes: str = ""


@router.get("/{tenant_slug}/interventions/{intervention_id}/sinistre")
async def get_donnees_sinistre(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les données du sinistré d'une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    sinistre = await db.donnees_sinistres.find_one({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    }, {"_id": 0})
    
    return {"sinistre": sinistre}


@router.post("/{tenant_slug}/interventions/{intervention_id}/sinistre")
async def create_or_update_sinistre(
    tenant_slug: str,
    intervention_id: str,
    data: DonneesSinistreCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée ou met à jour les données du sinistré"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    now = datetime.now(timezone.utc)
    
    existing = await db.donnees_sinistres.find_one({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    })
    
    sinistre_data = {
        "tenant_id": tenant.id,
        "intervention_id": intervention_id,
        **data.dict(),
        "updated_at": now,
        "updated_by": current_user.id
    }
    
    if existing:
        await db.donnees_sinistres.update_one(
            {"tenant_id": tenant.id, "intervention_id": intervention_id},
            {"$set": sinistre_data}
        )
        sinistre_id = existing.get("id")
    else:
        sinistre_id = str(uuid.uuid4())
        sinistre_data["id"] = sinistre_id
        sinistre_data["created_at"] = now
        sinistre_data["created_by"] = current_user.id
        await db.donnees_sinistres.insert_one(sinistre_data)
    
    return {"success": True, "sinistre_id": sinistre_id}


# ==================== PHOTOS DOMMAGES AVANT DÉPART ====================

class PhotoDommageCreate(BaseModel):
    """Modèle pour une photo de dommage avant départ"""
    photo_base64: str
    description: str = ""
    zone: str = ""  # ex: "entrée principale", "cuisine", etc.
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@router.get("/{tenant_slug}/interventions/{intervention_id}/photos-dommages")
async def get_photos_dommages(
    tenant_slug: str,
    intervention_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les photos de dommages d'une intervention"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    photos = await db.photos_dommages.find({
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    }, {"_id": 0}).sort("timestamp", 1).to_list(100)
    
    # Résoudre blob_names en SAS URLs
    from services.azure_storage import generate_sas_url as _sas
    for p in photos:
        if p.get("blob_name"):
            p["photo_url"] = _sas(p["blob_name"])
        elif p.get("photo_base64"):
            p["photo_url"] = p["photo_base64"]
    
    return {"photos": photos}


@router.post("/{tenant_slug}/interventions/{intervention_id}/photos-dommages")
async def add_photo_dommage(
    tenant_slug: str,
    intervention_id: str,
    data: PhotoDommageCreate,
    current_user: User = Depends(get_current_user)
):
    """Ajoute une photo de dommage avant départ"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    now = datetime.now(timezone.utc)
    
    # Upload photo vers Azure
    from services.azure_storage import upload_base64_to_azure
    azure_result = upload_base64_to_azure(data.photo_base64, tenant.id, "photos-dommages", f"dommage_{intervention_id}.jpg")
    
    photo = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "intervention_id": intervention_id,
        "blob_name": azure_result["blob_name"],
        "description": data.description,
        "zone": data.zone,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "timestamp": now,
        "uploaded_by": current_user.id,
        "uploaded_by_name": f"{current_user.prenom} {current_user.nom}"
    }
    
    await db.photos_dommages.insert_one(photo)
    
    # Incrémenter le compteur sur l'intervention
    await db.interventions.update_one(
        {"id": intervention_id, "tenant_id": tenant.id},
        {
            "$inc": {"photos_dommages_count": 1},
            "$set": {"updated_at": now}
        }
    )
    
    return {"success": True, "photo_id": photo["id"]}


@router.delete("/{tenant_slug}/interventions/{intervention_id}/photos-dommages/{photo_id}")
async def delete_photo_dommage(
    tenant_slug: str,
    intervention_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une photo de dommage"""
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Récupérer le doc pour nettoyer Azure
    photo_doc = await db.photos_dommages.find_one({
        "id": photo_id, "tenant_id": tenant.id, "intervention_id": intervention_id
    })
    if photo_doc and photo_doc.get("blob_name"):
        from services.azure_storage import delete_object
        delete_object(photo_doc["blob_name"])
    
    result = await db.photos_dommages.delete_one({
        "id": photo_id,
        "tenant_id": tenant.id,
        "intervention_id": intervention_id
    })
    
    if result.deleted_count > 0:
        await db.interventions.update_one(
            {"id": intervention_id, "tenant_id": tenant.id},
            {"$inc": {"photos_dommages_count": -1}}
        )
    
    return {"success": True}

