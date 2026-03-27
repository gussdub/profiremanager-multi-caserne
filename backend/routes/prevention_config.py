"""
Routes API pour la Carte, Géocodage, Préventionnistes et Paramètres (Module Prévention)
========================================================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.

Routes:
- GET    /{tenant_slug}/prevention/batiments/map                                     - Carte bâtiments
- POST   /{tenant_slug}/prevention/geocode                                           - Géocoder adresse
- PUT    /{tenant_slug}/prevention/batiments/{batiment_id}/coordinates               - MAJ coordonnées
- PUT    /{tenant_slug}/users/{user_id}/toggle-preventionniste                       - Toggle préventionniste
- GET    /{tenant_slug}/prevention/preventionnistes                                  - Liste préventionnistes
- GET    /{tenant_slug}/prevention/preventionnistes/{id}/stats                       - Stats préventionniste
- GET    /{tenant_slug}/prevention/preventionnistes/{id}/batiments                   - Bâtiments assignés
- GET    /{tenant_slug}/prevention/preventionnistes/{id}/secteurs                    - Secteurs assignés
- PUT    /{tenant_slug}/prevention/batiments/{batiment_id}/assigner                  - Assigner bâtiment
- PUT    /{tenant_slug}/prevention/secteurs/{secteur_id}/assigner                    - Assigner secteur
- PUT    /{tenant_slug}/prevention/parametres                                        - MAJ paramètres
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    require_permission,
)

from routes.prevention_models import (
    BatimentMapView,
    GeocodeRequest,
    GeocodeResponse,
)

router = APIRouter(tags=["Prévention - Configuration & Carte"])
logger = logging.getLogger(__name__)


# ==================== CARTE INTERACTIVE & GÉOCODAGE ====================

@router.get("/{tenant_slug}/prevention/batiments/map")
async def get_batiments_for_map(
    tenant_slug: str,
    niveau_risque: Optional[str] = None,
    statut_inspection: Optional[str] = None,
    secteur: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les bâtiments formatés pour affichage sur carte"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id, "statut": "actif"}
    
    if niveau_risque:
        query["niveau_risque"] = niveau_risque
    
    batiments = await db.batiments.find(query).to_list(length=None)
    
    map_data = []
    for bat in batiments:
        derniere_inspection = await db.inspections_visuelles.find_one(
            {"batiment_id": bat["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        if not derniere_inspection:
            statut_insp = "a_faire"
        elif derniere_inspection["statut"] == "en_cours":
            statut_insp = "en_cours"
        elif derniere_inspection.get("statut_conformite") == "non_conforme":
            statut_insp = "non_conforme"
        else:
            statut_insp = "fait_conforme"
        
        if statut_inspection and statut_insp != statut_inspection:
            continue
        
        latitude = bat.get("latitude")
        longitude = bat.get("longitude")
        
        map_item = BatimentMapView(
            id=bat["id"],
            nom_etablissement=bat.get("nom_etablissement", ""),
            adresse_civique=bat.get("adresse_civique", ""),
            ville=bat.get("ville", ""),
            latitude=latitude,
            longitude=longitude,
            niveau_risque=bat.get("niveau_risque", ""),
            statut_inspection=statut_insp,
            derniere_inspection=derniere_inspection["date_inspection"] if derniere_inspection else None,
            groupe_occupation=bat.get("groupe_occupation", ""),
            sous_groupe=bat.get("sous_groupe", "")
        )
        
        map_data.append(map_item.dict())
    
    return map_data

@router.post("/{tenant_slug}/prevention/geocode")
async def geocode_address(
    tenant_slug: str,
    request: GeocodeRequest,
    current_user: User = Depends(get_current_user)
):
    """Géocoder une adresse en latitude/longitude avec Google Maps API"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        import requests
        import os
        
        api_key = os.getenv("GOOGLE_MAPS_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API Google Maps non configurée")
        
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        params = {
            "address": request.adresse_complete,
            "key": api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data["status"] == "OK" and len(data["results"]) > 0:
            result = data["results"][0]
            location = result["geometry"]["location"]
            
            location_type = result["geometry"]["location_type"]
            if location_type == "ROOFTOP":
                precision = "building"
            elif location_type in ["RANGE_INTERPOLATED", "GEOMETRIC_CENTER"]:
                precision = "street"
            else:
                precision = "city"
            
            return GeocodeResponse(
                latitude=location["lat"],
                longitude=location["lng"],
                adresse_formatee=result["formatted_address"],
                precision=precision
            )
        else:
            raise HTTPException(status_code=404, detail="Adresse non trouvée")
    
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du géocodage: {str(e)}")

@router.put("/{tenant_slug}/prevention/batiments/{batiment_id}/coordinates")
async def update_batiment_coordinates(
    tenant_slug: str,
    batiment_id: str,
    latitude: float = Body(...),
    longitude: float = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les coordonnées GPS d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {
            "latitude": latitude,
            "longitude": longitude,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return {"message": "Coordonnées mises à jour avec succès"}


# ==================== GESTION DES PRÉVENTIONNISTES ====================

@router.put("/{tenant_slug}/users/{user_id}/toggle-preventionniste")
async def toggle_preventionniste(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Activer/désactiver le statut de préventionniste pour un utilisateur (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    await require_permission(tenant.id, current_user, "prevention", "modifier", "inspections")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    new_status = not user.get('est_preventionniste', False)
    
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"est_preventionniste": new_status}}
    )
    
    return {
        "message": "Statut de préventionniste mis à jour",
        "user_id": user_id,
        "est_preventionniste": new_status
    }


@router.get("/{tenant_slug}/prevention/preventionnistes")
async def get_preventionnistes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la liste de tous les préventionnistes actifs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    preventionnistes_cursor = db.users.find({
        "tenant_id": tenant.id,
        "est_preventionniste": True,
        "statut": "Actif"
    })
    
    preventionnistes = await preventionnistes_cursor.to_list(length=None)
    
    result = []
    for prev in preventionnistes:
        nb_batiments = await db.batiments.count_documents({
            "tenant_id": tenant.id,
            "preventionniste_assigne_id": prev["id"]
        })
        
        nb_secteurs = await db.secteurs_geographiques.count_documents({
            "tenant_id": tenant.id,
            "preventionniste_assigne_id": prev["id"]
        })
        
        start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        nb_inspections_mois = await db.inspections.count_documents({
            "tenant_id": tenant.id,
            "preventionniste_id": prev["id"],
            "date_inspection": {"$gte": start_of_month.isoformat()}
        })
        
        result.append({
            "id": prev["id"],
            "nom": prev["nom"],
            "prenom": prev["prenom"],
            "email": prev["email"],
            "telephone": prev.get("telephone", ""),
            "grade": prev.get("grade", ""),
            "nb_batiments": nb_batiments,
            "nb_secteurs": nb_secteurs,
            "nb_inspections_mois": nb_inspections_mois
        })
    
    return result


@router.get("/{tenant_slug}/prevention/preventionnistes/{preventionniste_id}/stats")
async def get_preventionniste_stats(
    tenant_slug: str,
    preventionniste_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les statistiques détaillées d'un préventionniste"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    preventionniste = await db.users.find_one({
        "id": preventionniste_id,
        "tenant_id": tenant.id,
        "est_preventionniste": True
    })
    
    if not preventionniste:
        raise HTTPException(status_code=404, detail="Préventionniste non trouvé")
    
    nb_batiments = await db.batiments.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    nb_secteurs = await db.secteurs_geographiques.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    start_of_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    start_of_year = datetime.now(timezone.utc).replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    
    nb_inspections_mois = await db.inspections.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_id": preventionniste_id,
        "date_inspection": {"$gte": start_of_month.isoformat()}
    })
    
    nb_inspections_annee = await db.inspections.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_id": preventionniste_id,
        "date_inspection": {"$gte": start_of_year.isoformat()}
    })
    
    nb_plans = await db.plans_intervention.count_documents({
        "tenant_id": tenant.id,
        "created_by": preventionniste_id
    })
    
    return {
        "preventionniste": {
            "id": preventionniste["id"],
            "nom": preventionniste["nom"],
            "prenom": preventionniste["prenom"],
            "email": preventionniste["email"],
            "telephone": preventionniste.get("telephone", ""),
            "grade": preventionniste.get("grade", "")
        },
        "stats": {
            "nb_batiments": nb_batiments,
            "nb_secteurs": nb_secteurs,
            "nb_inspections_mois": nb_inspections_mois,
            "nb_inspections_annee": nb_inspections_annee,
            "nb_plans": nb_plans
        }
    }


@router.get("/{tenant_slug}/prevention/preventionnistes/{preventionniste_id}/batiments")
async def get_preventionniste_batiments(
    tenant_slug: str,
    preventionniste_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les bâtiments assignés à un préventionniste"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    batiments_cursor = db.batiments.find({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    batiments = await batiments_cursor.to_list(length=None)
    
    for batiment in batiments:
        if "_id" in batiment:
            del batiment["_id"]
    
    return batiments


@router.get("/{tenant_slug}/prevention/preventionnistes/{preventionniste_id}/secteurs")
async def get_preventionniste_secteurs(
    tenant_slug: str,
    preventionniste_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les secteurs assignés à un préventionniste"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    secteurs_cursor = db.secteurs_geographiques.find({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    secteurs = await secteurs_cursor.to_list(length=None)
    
    for secteur in secteurs:
        if "_id" in secteur:
            del secteur["_id"]
    
    return secteurs


@router.put("/{tenant_slug}/prevention/batiments/{batiment_id}/assigner")
async def assigner_batiment_preventionniste(
    tenant_slug: str,
    batiment_id: str,
    preventionniste_id: Optional[str] = Body(None),
    raison: Optional[str] = Body(""),
    current_user: User = Depends(get_current_user)
):
    """Assigner un préventionniste à un bâtiment (avec historique)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    if preventionniste_id:
        preventionniste = await db.users.find_one({
            "id": preventionniste_id,
            "tenant_id": tenant.id,
            "est_preventionniste": True,
            "statut": "Actif"
        })
        if not preventionniste:
            raise HTTPException(status_code=404, detail="Préventionniste non trouvé ou inactif")
    
    ancien_preventionniste_id = batiment.get("preventionniste_assigne_id")
    historique_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "ancien_preventionniste_id": ancien_preventionniste_id,
        "nouveau_preventionniste_id": preventionniste_id,
        "modifie_par": current_user.id,
        "modifie_par_nom": f"{current_user.prenom} {current_user.nom}",
        "raison": raison
    }
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {
            "$set": {
                "preventionniste_assigne_id": preventionniste_id,
                "updated_at": datetime.now(timezone.utc)
            },
            "$push": {"historique_assignations": historique_entry}
        }
    )
    
    if preventionniste_id:
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "destinataire_id": preventionniste_id,
            "type": "assignation_batiment",
            "titre": "Nouveau bâtiment assigné",
            "message": f"Le bâtiment '{batiment.get('nom_etablissement') or batiment.get('adresse_civique')}' vous a été assigné.",
            "statut": "non_lu",
            "lu": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "date_creation": datetime.now(timezone.utc).isoformat(),
            "data": {
                "batiment_id": batiment_id,
                "batiment_nom": batiment.get('nom_etablissement') or batiment.get('adresse_civique')
            }
        }
        await db.notifications.insert_one(notification)
    
    return {
        "message": "Bâtiment assigné avec succès",
        "batiment_id": batiment_id,
        "preventionniste_id": preventionniste_id
    }


@router.put("/{tenant_slug}/prevention/secteurs/{secteur_id}/assigner")
async def assigner_secteur_preventionniste(
    tenant_slug: str,
    secteur_id: str,
    preventionniste_id: Optional[str] = Body(None),
    assigner_batiments: bool = Body(True),
    current_user: User = Depends(get_current_user)
):
    """Assigner un préventionniste à un secteur (et optionnellement tous ses bâtiments)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    secteur = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id})
    if not secteur:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    if preventionniste_id:
        preventionniste = await db.users.find_one({
            "id": preventionniste_id,
            "tenant_id": tenant.id,
            "est_preventionniste": True,
            "statut": "Actif"
        })
        if not preventionniste:
            raise HTTPException(status_code=404, detail="Préventionniste non trouvé ou inactif")
    
    await db.secteurs_geographiques.update_one(
        {"id": secteur_id, "tenant_id": tenant.id},
        {
            "$set": {
                "preventionniste_assigne_id": preventionniste_id,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    nb_batiments_assignes = 0
    
    if assigner_batiments:
        batiments_cursor = db.batiments.find({
            "tenant_id": tenant.id,
            "latitude": {"$ne": None},
            "longitude": {"$ne": None}
        })
        
        batiments = await batiments_cursor.to_list(length=None)
        
        from shapely.geometry import Point, shape
        
        secteur_polygon = shape(secteur["geometry"])
        
        for batiment in batiments:
            if batiment.get("latitude") and batiment.get("longitude"):
                point = Point(batiment["longitude"], batiment["latitude"])
                
                if secteur_polygon.contains(point):
                    ancien_preventionniste_id = batiment.get("preventionniste_assigne_id")
                    historique_entry = {
                        "date": datetime.now(timezone.utc).isoformat(),
                        "ancien_preventionniste_id": ancien_preventionniste_id,
                        "nouveau_preventionniste_id": preventionniste_id,
                        "modifie_par": current_user.id,
                        "modifie_par_nom": f"{current_user.prenom} {current_user.nom}",
                        "raison": f"Assignation automatique via secteur '{secteur['nom']}'"
                    }
                    
                    await db.batiments.update_one(
                        {"id": batiment["id"]},
                        {
                            "$set": {
                                "preventionniste_assigne_id": preventionniste_id,
                                "updated_at": datetime.now(timezone.utc)
                            },
                            "$push": {"historique_assignations": historique_entry}
                        }
                    )
                    nb_batiments_assignes += 1
    
    if preventionniste_id:
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "destinataire_id": preventionniste_id,
            "type": "assignation_secteur",
            "titre": "Nouveau secteur assigné",
            "message": f"Le secteur '{secteur['nom']}' vous a été assigné" + (f" avec {nb_batiments_assignes} bâtiments." if assigner_batiments else "."),
            "statut": "non_lu",
            "lu": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "date_creation": datetime.now(timezone.utc).isoformat(),
            "data": {
                "secteur_id": secteur_id,
                "secteur_nom": secteur['nom'],
                "nb_batiments": nb_batiments_assignes
            }
        }
        await db.notifications.insert_one(notification)
    
    return {
        "message": "Secteur assigné avec succès",
        "secteur_id": secteur_id,
        "preventionniste_id": preventionniste_id,
        "nb_batiments_assignes": nb_batiments_assignes
    }


# ==================== PARAMÈTRES PRÉVENTION ====================

@router.put("/{tenant_slug}/prevention/parametres")
async def update_parametres_prevention(
    tenant_slug: str,
    recurrence_inspections: int = Body(...),
    nombre_visites_requises: int = Body(...),
    superviseur_prevention_id: Optional[str] = Body(None),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres de prévention (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    await require_permission(tenant.id, current_user, "prevention", "modifier", "parametres")
    
    if recurrence_inspections not in [1, 2, 3, 4, 5]:
        raise HTTPException(status_code=400, detail="La récurrence doit être entre 1 et 5 ans")
    
    if nombre_visites_requises not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Le nombre de visites doit être entre 1 et 3")
    
    if superviseur_prevention_id:
        superviseur = await db.users.find_one({
            "id": superviseur_prevention_id,
            "tenant_id": tenant.id
        })
        if not superviseur:
            raise HTTPException(status_code=404, detail="Superviseur non trouvé")
    
    parametres_update = {
        "parametres.recurrence_inspections": recurrence_inspections,
        "parametres.nombre_visites_requises": nombre_visites_requises,
        "parametres.superviseur_prevention_id": superviseur_prevention_id,
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": parametres_update}
    )
    
    logging.info(f"Paramètres prévention mis à jour pour {tenant_slug} par {current_user.prenom} {current_user.nom}")
    
    return {
        "message": "Paramètres mis à jour avec succès",
        "parametres": {
            "recurrence_inspections": recurrence_inspections,
            "nombre_visites_requises": nombre_visites_requises,
            "superviseur_prevention_id": superviseur_prevention_id
        }
    }
