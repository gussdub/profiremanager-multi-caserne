"""
Routes API pour le module Approvisionnement en Eau
==================================================

STATUT: ACTIF
Ce module gère les points d'eau (bornes sèches, hydrantes, points statiques).

Routes:
- GET    /{tenant_slug}/approvisionnement-eau/points-eau                              - Liste des points d'eau
- POST   /{tenant_slug}/approvisionnement-eau/points-eau                              - Créer un point d'eau
- GET    /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}                   - Détail d'un point
- PUT    /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}                   - Modifier un point
- DELETE /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}                   - Supprimer un point
- POST   /{tenant_slug}/approvisionnement-eau/inspections                             - Créer une inspection
- GET    /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}/inspections       - Historique inspections
- POST   /{tenant_slug}/approvisionnement-eau/bornes-seches/{point_id}/programmer-test - Programmer test
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User
)

router = APIRouter(tags=["Approvisionnement Eau"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class PointEauCreate(BaseModel):
    type: str  # 'borne_seche', 'hydrante', 'point_statique'
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
    capacite_litres: Optional[float] = None
    profondeur_metres: Optional[float] = None
    etat_eau: Optional[str] = None
    type_source: Optional[str] = None
    frequence_inspection_mois: Optional[int] = None
    modele_inspection_assigne_id: Optional[str] = None
    prochaine_date_test: Optional[str] = None


class InspectionPointEauCreate(BaseModel):
    point_eau_id: str
    inspecteur_id: str
    date_inspection: str
    etat_general: str  # conforme, non_conforme, defectueux
    debit_mesure_gpm: Optional[float] = None
    observations: Optional[str] = None
    photos: Optional[List[str]] = []
    defauts_constates: Optional[List[str]] = []
    actions_requises: Optional[str] = None
    etat_raccords: Optional[str] = None
    test_pression_ok: Optional[bool] = None
    niveau_eau: Optional[str] = None
    accessibilite_verifiee: Optional[str] = None


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/approvisionnement-eau/points-eau")
async def get_points_eau(
    tenant_slug: str,
    type: Optional[str] = None,
    secteur_id: Optional[str] = None,
    etat: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les points d'eau avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if type:
        query["type"] = type
    if secteur_id:
        query["secteur_id"] = secteur_id
    if etat:
        query["etat"] = etat
    
    points = await db.points_eau.find(query, {"_id": 0}).to_list(length=None)
    
    # Calculer le statut de couleur pour chaque point (vert/orange/rouge/gris)
    today = datetime.now()
    
    for point in points:
        date_derniere = point.get('date_derniere_inspection')
        freq_mois = point.get('frequence_inspection_mois', 12)
        
        if not date_derniere:
            point['statut_couleur'] = 'gris'  # Non inspecté
        else:
            try:
                if isinstance(date_derniere, str):
                    last_inspection = datetime.fromisoformat(date_derniere.replace('Z', '+00:00'))
                else:
                    last_inspection = date_derniere
                
                next_due = last_inspection + timedelta(days=freq_mois * 30)
                days_until = (next_due - today).days
                
                if days_until < 0:
                    point['statut_couleur'] = 'rouge'  # En retard
                elif days_until <= 30:
                    point['statut_couleur'] = 'orange'  # Bientôt dû
                else:
                    point['statut_couleur'] = 'vert'  # OK
            except:
                point['statut_couleur'] = 'gris'
    
    return points


@router.post("/{tenant_slug}/approvisionnement-eau/points-eau")
async def create_point_eau(
    tenant_slug: str,
    point_data: PointEauCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau point d'eau (admin ou superviseur)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    point_dict = point_data.dict()
    point_dict['id'] = str(uuid.uuid4())
    point_dict['tenant_id'] = tenant.id
    point_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    point_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.points_eau.insert_one(point_dict)
    
    # Retourner sans _id
    if '_id' in point_dict:
        del point_dict['_id']
    
    return point_dict


@router.get("/{tenant_slug}/approvisionnement-eau/points-eau/{point_id}")
async def get_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un point d'eau par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    point = await db.points_eau.find_one(
        {"id": point_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not point:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    return point


@router.put("/{tenant_slug}/approvisionnement-eau/points-eau/{point_id}")
async def update_point_eau(
    tenant_slug: str,
    point_id: str,
    point_data: PointEauCreate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un point d'eau (admin ou superviseur)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    update_dict = {k: v for k, v in point_data.dict().items() if v is not None}
    update_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.points_eau.update_one(
        {"id": point_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    updated_point = await db.points_eau.find_one(
        {"id": point_id},
        {"_id": 0}
    )
    
    return updated_point


@router.delete("/{tenant_slug}/approvisionnement-eau/points-eau/{point_id}")
async def delete_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un point d'eau (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    result = await db.points_eau.delete_one(
        {"id": point_id, "tenant_id": tenant.id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    # Supprimer aussi les inspections associées
    await db.inspections_points_eau.delete_many({"point_eau_id": point_id})
    
    return {"message": "Point d'eau supprimé avec succès"}


@router.post("/{tenant_slug}/approvisionnement-eau/inspections")
async def create_inspection_point_eau(
    tenant_slug: str,
    inspection_data: InspectionPointEauCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection pour un point d'eau"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le point d'eau existe
    point = await db.points_eau.find_one({
        "id": inspection_data.point_eau_id,
        "tenant_id": tenant.id
    })
    
    if not point:
        raise HTTPException(status_code=404, detail="Point d'eau non trouvé")
    
    inspection_dict = inspection_data.dict()
    inspection_dict['id'] = str(uuid.uuid4())
    inspection_dict['tenant_id'] = tenant.id
    inspection_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.inspections_points_eau.insert_one(inspection_dict)
    
    # Mettre à jour la date de dernière inspection du point
    await db.points_eau.update_one(
        {"id": inspection_data.point_eau_id},
        {"$set": {
            "date_derniere_inspection": inspection_data.date_inspection,
            "etat": inspection_data.etat_general,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if '_id' in inspection_dict:
        del inspection_dict['_id']
    
    return inspection_dict


@router.get("/{tenant_slug}/approvisionnement-eau/points-eau/{point_id}/inspections")
async def get_inspections_point_eau(
    tenant_slug: str,
    point_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections d'un point d'eau"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_points_eau.find(
        {"point_eau_id": point_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=None)
    
    return inspections


@router.post("/{tenant_slug}/approvisionnement-eau/bornes-seches/{point_id}/programmer-test")
async def programmer_test_borne_seche(
    tenant_slug: str,
    point_id: str,
    date_test: str,
    current_user: User = Depends(get_current_user)
):
    """Programmer la prochaine date de test pour une borne sèche (superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Superviseur requis")
    
    result = await db.points_eau.update_one(
        {"id": point_id, "tenant_id": tenant.id, "type": "borne_seche"},
        {"$set": {
            "prochaine_date_test": date_test,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Borne sèche non trouvée")
    
    return {"message": "Date de test programmée avec succès"}
