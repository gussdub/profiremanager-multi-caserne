"""
Routes API pour le module Points d'Eau (Approvisionnement)
=========================================================

STATUT: ACTIF
Ce module gère les points d'eau: bornes fontaines, bornes sèches, 
points d'eau statiques et leurs inspections.

Routes:
- GET    /{tenant_slug}/points-eau                        - Liste des points d'eau
- GET    /{tenant_slug}/points-eau-statistiques           - Statistiques des points d'eau
- GET    /{tenant_slug}/points-eau/{point_id}             - Détail d'un point d'eau
- POST   /{tenant_slug}/points-eau                        - Créer un point d'eau
- PUT    /{tenant_slug}/points-eau/{point_id}             - Modifier un point d'eau
- DELETE /{tenant_slug}/points-eau/{point_id}             - Supprimer un point d'eau
- POST   /{tenant_slug}/points-eau/{point_id}/inspections - Créer une inspection
- GET    /{tenant_slug}/points-eau/{point_id}/inspections - Historique des inspections
- GET    /{tenant_slug}/parametres/dates-tests-bornes-seches - Dates de tests configurées
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Points d'Eau"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class PointEauBase(BaseModel):
    type: str  # "borne_fontaine", "borne_seche", "point_eau_statique"
    numero_identification: str
    latitude: float
    longitude: float
    adresse: Optional[str] = None
    ville: Optional[str] = None
    secteur_id: Optional[str] = None
    notes: Optional[str] = None


class PointEauCreate(BaseModel):
    type: str
    numero_identification: str
    latitude: float
    longitude: float
    adresse: Optional[str] = None
    ville: Optional[str] = None
    secteur_id: Optional[str] = None
    notes: Optional[str] = None
    debit_gpm: Optional[float] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    etat: str = "fonctionnel"
    etat_raccords: Optional[str] = None
    accessibilite: Optional[str] = None
    frequence_inspection_mois: int = 12
    capacite_litres: Optional[float] = None
    type_acces: Optional[str] = None


class PointEauUpdate(BaseModel):
    type: Optional[str] = None
    numero_identification: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    secteur_id: Optional[str] = None
    notes: Optional[str] = None
    debit_gpm: Optional[float] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    etat: Optional[str] = None
    etat_raccords: Optional[str] = None
    accessibilite: Optional[str] = None
    frequence_inspection_mois: Optional[int] = None
    capacite_litres: Optional[float] = None
    type_acces: Optional[str] = None
    modele_inspection_assigne_id: Optional[str] = None


class InspectionPointEauCreate(BaseModel):
    date_inspection: str
    inspecteur_nom: Optional[str] = None
    etat_general: str
    debit_mesure: Optional[float] = None
    pression_mesure: Optional[float] = None
    accessibilite: Optional[str] = None
    signalisation: Optional[str] = None
    commentaire: Optional[str] = None
    photos: List[str] = []
    anomalies: List[str] = []
    has_defaut: bool = False


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/points-eau")
async def get_points_eau(
    tenant_slug: str,
    type_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les points d'eau"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if type_filter:
        query["type"] = type_filter
    
    points = await db.points_eau.find(
        query,
        {"_id": 0}
    ).to_list(length=None)
    
    return points


@router.get("/{tenant_slug}/points-eau-statistiques")
async def get_points_eau_statistiques(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les statistiques des points d'eau (tous types)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Compter par type
    bornes_fontaines = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "type": "borne_fontaine"
    })
    
    bornes_seches = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "type": "borne_seche"
    })
    
    points_statiques = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "type": "point_eau_statique"
    })
    
    # Compter par état
    fonctionnels = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "etat": {"$in": ["fonctionnel", "fonctionnelle", "bon"]}
    })
    
    defectueux = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "etat": {"$in": ["defectueux", "défectueux", "en_panne", "mauvais"]}
    })
    
    # Points nécessitant inspection (dernière inspection > 6 mois)
    date_limite = (datetime.now(timezone.utc) - timedelta(days=180)).isoformat()
    necessitant_inspection = await db.points_eau.count_documents({
        "tenant_id": tenant.id,
        "$or": [
            {"date_derniere_inspection": {"$lt": date_limite}},
            {"date_derniere_inspection": None},
            {"date_derniere_inspection": {"$exists": False}}
        ]
    })
    
    # Dernières inspections
    dernieres_inspections = await db.inspections_bornes_seches.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inspection", -1).limit(5).to_list(5)
    
    return {
        "total": bornes_fontaines + bornes_seches + points_statiques,
        "par_type": {
            "bornes_fontaines": bornes_fontaines,
            "bornes_seches": bornes_seches,
            "points_statiques": points_statiques
        },
        "par_etat": {
            "fonctionnels": fonctionnels,
            "defectueux": defectueux
        },
        "necessitant_inspection": necessitant_inspection,
        "dernieres_inspections": dernieres_inspections
    }


@router.get("/{tenant_slug}/points-eau/{point_id}")
async def get_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un point d'eau spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    point = await db.points_eau.find_one(
        {"id": point_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not point:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    return point


@router.post("/{tenant_slug}/points-eau")
async def create_point_eau(
    tenant_slug: str,
    point_data: PointEauCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau point d'eau (Admin/Superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    point_dict = point_data.dict()
    point_dict['id'] = str(uuid.uuid4())
    point_dict['tenant_id'] = tenant.id
    point_dict['created_by_id'] = current_user.id
    point_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    point_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.points_eau.insert_one(point_dict)
    
    logger.info(f"💧 Point d'eau créé: {point_data.numero_identification} ({point_data.type}) par {current_user.email}")
    
    return {"message": "Point d'eau créé avec succès", "id": point_dict['id']}


@router.put("/{tenant_slug}/points-eau/{point_id}")
async def update_point_eau(
    tenant_slug: str,
    point_id: str,
    point_data: PointEauUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un point d'eau (Admin/Superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    update_data = {k: v for k, v in point_data.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.points_eau.update_one(
        {"id": point_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    return {"message": "Point d'eau mis à jour avec succès"}


@router.delete("/{tenant_slug}/points-eau/{point_id}")
async def delete_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un point d'eau (Admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    result = await db.points_eau.delete_one({
        "id": point_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    # Supprimer aussi les inspections associées
    await db.inspections_bornes_seches.delete_many({"point_eau_id": point_id})
    
    logger.info(f"🗑️ Point d'eau supprimé: {point_id} par {current_user.email}")
    
    return {"message": "Point d'eau supprimé avec succès"}


@router.post("/{tenant_slug}/points-eau/{point_id}/inspections")
async def create_inspection_point_eau(
    tenant_slug: str,
    point_id: str,
    inspection_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Enregistrer une inspection de point d'eau"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le point d'eau existe
    point = await db.points_eau.find_one({
        "id": point_id,
        "tenant_id": tenant.id
    })
    
    if not point:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    # Créer l'inspection
    inspection = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "point_eau_id": point_id,
        "point_eau_numero": point.get("numero_identification"),
        "point_eau_type": point.get("type"),
        "inspecteur_id": current_user.id,
        "inspecteur_nom": inspection_data.get("inspecteur_nom") or f"{current_user.prenom} {current_user.nom}",
        "date_inspection": inspection_data.get("date_inspection") or datetime.now(timezone.utc).isoformat(),
        "etat_general": inspection_data.get("etat_general", "bon"),
        "debit_mesure": inspection_data.get("debit_mesure"),
        "pression_mesure": inspection_data.get("pression_mesure"),
        "accessibilite": inspection_data.get("accessibilite"),
        "signalisation": inspection_data.get("signalisation"),
        "commentaire": inspection_data.get("commentaire", ""),
        "photos": inspection_data.get("photos", []),
        "anomalies": inspection_data.get("anomalies", []),
        "has_defaut": inspection_data.get("has_defaut", False),
        "reponses": inspection_data.get("reponses", []),
        "signature_inspecteur": inspection_data.get("signature_inspecteur", ""),
        "latitude": inspection_data.get("latitude"),
        "longitude": inspection_data.get("longitude"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inspections_bornes_seches.insert_one(inspection)
    
    # Mettre à jour le point d'eau
    update_point = {
        "date_derniere_inspection": inspection["date_inspection"],
        "derniere_inspection_id": inspection["id"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if inspection_data.get("has_defaut"):
        update_point["etat"] = "defectueux"
        update_point["statut_inspection"] = "anomalie"
    else:
        update_point["etat"] = "fonctionnel"
        update_point["statut_inspection"] = "ok"
    
    await db.points_eau.update_one(
        {"id": point_id, "tenant_id": tenant.id},
        {"$set": update_point}
    )
    
    logger.info(f"📋 Inspection point d'eau créée: {point.get('numero_identification')} par {current_user.email}")
    
    return {"message": "Inspection enregistrée avec succès", "id": inspection["id"]}


@router.get("/{tenant_slug}/points-eau/{point_id}/inspections")
async def get_inspections_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections d'un point d'eau"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_bornes_seches.find(
        {"point_eau_id": point_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(100)
    
    return inspections


@router.get("/{tenant_slug}/parametres/dates-tests-bornes-seches")
async def get_dates_tests_bornes_seches(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les dates de tests configurées pour les bornes sèches"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Chercher dans les paramètres du tenant
    parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
    dates_tests = parametres.get('dates_tests_bornes_seches', [])
    
    return {"dates": dates_tests}
