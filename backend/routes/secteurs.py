"""
Routes API pour la gestion des Secteurs d'intervention
======================================================

Permet de définir des secteurs géographiques pour les interventions.
Types de secteurs supportés:
- Municipalité/Ville
- Zone numérotée
- District
- Caserne
- Personnalisé
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Secteurs"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class SecteurCreate(BaseModel):
    """Modèle pour créer un secteur"""
    nom: str = Field(..., min_length=1, max_length=100)
    type_secteur: str = Field(default="personnalise")  # municipalite, zone, district, caserne, personnalise
    code: Optional[str] = None  # Code court (ex: "Z1", "D2", "MTL")
    description: Optional[str] = None
    couleur: str = "#3B82F6"
    actif: bool = True
    # Données géographiques optionnelles
    municipalites: List[str] = []  # Liste des municipalités incluses
    codes_postaux: List[str] = []  # Liste des codes postaux inclus
    coordonnees: Optional[Dict[str, Any]] = None  # Pour une future carte

class SecteurUpdate(BaseModel):
    """Modèle pour mettre à jour un secteur"""
    nom: Optional[str] = None
    type_secteur: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    couleur: Optional[str] = None
    actif: Optional[bool] = None
    municipalites: Optional[List[str]] = None
    codes_postaux: Optional[List[str]] = None
    coordonnees: Optional[Dict[str, Any]] = None


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/secteurs")
async def get_secteurs(
    tenant_slug: str,
    actifs_seulement: bool = False,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère tous les secteurs du tenant
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if actifs_seulement:
        query["actif"] = True
    
    secteurs = await db.secteurs.find(query).sort("nom", 1).to_list(500)
    
    return [clean_mongo_doc(s) for s in secteurs]


@router.get("/{tenant_slug}/secteurs/{secteur_id}")
async def get_secteur(
    tenant_slug: str,
    secteur_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère un secteur spécifique
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    secteur = await db.secteurs.find_one({
        "tenant_id": tenant.id,
        "id": secteur_id
    })
    
    if not secteur:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    return clean_mongo_doc(secteur)


@router.post("/{tenant_slug}/secteurs")
async def create_secteur(
    tenant_slug: str,
    data: SecteurCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Crée un nouveau secteur
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si le nom existe déjà
    existing = await db.secteurs.find_one({
        "tenant_id": tenant.id,
        "nom": data.nom
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Un secteur nommé '{data.nom}' existe déjà")
    
    # Vérifier si le code existe déjà (si fourni)
    if data.code:
        existing_code = await db.secteurs.find_one({
            "tenant_id": tenant.id,
            "code": data.code
        })
        if existing_code:
            raise HTTPException(status_code=400, detail=f"Un secteur avec le code '{data.code}' existe déjà")
    
    secteur_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": data.nom,
        "type_secteur": data.type_secteur,
        "code": data.code,
        "description": data.description,
        "couleur": data.couleur,
        "actif": data.actif,
        "municipalites": data.municipalites,
        "codes_postaux": data.codes_postaux,
        "coordonnees": data.coordonnees,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.email,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.secteurs.insert_one(secteur_doc)
    logger.info(f"[SECTEUR] Créé: {data.nom} par {current_user.email}")
    
    return clean_mongo_doc(secteur_doc)


@router.put("/{tenant_slug}/secteurs/{secteur_id}")
async def update_secteur(
    tenant_slug: str,
    secteur_id: str,
    data: SecteurUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Met à jour un secteur
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    secteur = await db.secteurs.find_one({
        "tenant_id": tenant.id,
        "id": secteur_id
    })
    if not secteur:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    # Construire les mises à jour
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if data.nom is not None:
        # Vérifier l'unicité du nom
        existing = await db.secteurs.find_one({
            "tenant_id": tenant.id,
            "nom": data.nom,
            "id": {"$ne": secteur_id}
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Un secteur nommé '{data.nom}' existe déjà")
        updates["nom"] = data.nom
    
    if data.code is not None:
        # Vérifier l'unicité du code
        if data.code:
            existing = await db.secteurs.find_one({
                "tenant_id": tenant.id,
                "code": data.code,
                "id": {"$ne": secteur_id}
            })
            if existing:
                raise HTTPException(status_code=400, detail=f"Un secteur avec le code '{data.code}' existe déjà")
        updates["code"] = data.code
    
    if data.type_secteur is not None:
        updates["type_secteur"] = data.type_secteur
    if data.description is not None:
        updates["description"] = data.description
    if data.couleur is not None:
        updates["couleur"] = data.couleur
    if data.actif is not None:
        updates["actif"] = data.actif
    if data.municipalites is not None:
        updates["municipalites"] = data.municipalites
    if data.codes_postaux is not None:
        updates["codes_postaux"] = data.codes_postaux
    if data.coordonnees is not None:
        updates["coordonnees"] = data.coordonnees
    
    await db.secteurs.update_one(
        {"tenant_id": tenant.id, "id": secteur_id},
        {"$set": updates}
    )
    
    updated = await db.secteurs.find_one({"tenant_id": tenant.id, "id": secteur_id})
    return clean_mongo_doc(updated)


@router.delete("/{tenant_slug}/secteurs/{secteur_id}")
async def delete_secteur(
    tenant_slug: str,
    secteur_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime un secteur
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si le secteur est utilisé dans des interventions
    interventions_count = await db.interventions.count_documents({
        "tenant_id": tenant.id,
        "secteur_id": secteur_id
    })
    
    cartes_count = await db.cartes_appel.count_documents({
        "tenant_id": tenant.id,
        "secteur_id": secteur_id
    })
    
    batiments_count = await db.batiments.count_documents({
        "tenant_id": tenant.id,
        "secteur_id": secteur_id
    })
    
    total_usage = interventions_count + cartes_count + batiments_count
    
    if total_usage > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Ce secteur est utilisé dans {total_usage} enregistrement(s) ({interventions_count} interventions, {cartes_count} cartes d'appel, {batiments_count} bâtiments). Désactivez-le plutôt que de le supprimer."
        )
    
    result = await db.secteurs.delete_one({
        "tenant_id": tenant.id,
        "id": secteur_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    logger.info(f"[SECTEUR] Supprimé: {secteur_id} par {current_user.email}")
    
    return {"success": True, "message": "Secteur supprimé"}


@router.get("/{tenant_slug}/secteurs/stats/utilisation")
async def get_stats_utilisation_secteurs(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les statistiques d'utilisation des secteurs
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    secteurs = await db.secteurs.find({"tenant_id": tenant.id}).to_list(500)
    
    stats = []
    for s in secteurs:
        secteur_id = s.get("id")
        
        nb_interventions = await db.interventions.count_documents({
            "tenant_id": tenant.id,
            "secteur_id": secteur_id
        })
        
        nb_cartes = await db.cartes_appel.count_documents({
            "tenant_id": tenant.id,
            "secteur_id": secteur_id
        })
        
        nb_batiments = await db.batiments.count_documents({
            "tenant_id": tenant.id,
            "secteur_id": secteur_id
        })
        
        stats.append({
            "secteur_id": secteur_id,
            "nom": s.get("nom"),
            "code": s.get("code"),
            "couleur": s.get("couleur"),
            "actif": s.get("actif", True),
            "nb_interventions": nb_interventions,
            "nb_cartes_appel": nb_cartes,
            "nb_batiments": nb_batiments,
            "total": nb_interventions + nb_cartes + nb_batiments
        })
    
    # Trier par utilisation décroissante
    stats.sort(key=lambda x: x["total"], reverse=True)
    
    return stats


@router.post("/{tenant_slug}/secteurs/initialiser-defaut")
async def initialiser_secteurs_defaut(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Initialise des secteurs par défaut pour un nouveau tenant
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si des secteurs existent déjà
    existing = await db.secteurs.count_documents({"tenant_id": tenant.id})
    if existing > 0:
        raise HTTPException(
            status_code=400,
            detail=f"{existing} secteur(s) existe(nt) déjà. Supprimez-les d'abord si vous voulez réinitialiser."
        )
    
    # Secteurs par défaut
    secteurs_defaut = [
        {"nom": "Zone 1 - Centre", "type_secteur": "zone", "code": "Z1", "couleur": "#EF4444", "description": "Zone centrale"},
        {"nom": "Zone 2 - Nord", "type_secteur": "zone", "code": "Z2", "couleur": "#3B82F6", "description": "Zone nord"},
        {"nom": "Zone 3 - Sud", "type_secteur": "zone", "code": "Z3", "couleur": "#22C55E", "description": "Zone sud"},
        {"nom": "Zone 4 - Est", "type_secteur": "zone", "code": "Z4", "couleur": "#F97316", "description": "Zone est"},
        {"nom": "Zone 5 - Ouest", "type_secteur": "zone", "code": "Z5", "couleur": "#8B5CF6", "description": "Zone ouest"},
    ]
    
    created = []
    for s in secteurs_defaut:
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": s["nom"],
            "type_secteur": s["type_secteur"],
            "code": s["code"],
            "description": s["description"],
            "couleur": s["couleur"],
            "actif": True,
            "municipalites": [],
            "codes_postaux": [],
            "coordonnees": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.email,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.secteurs.insert_one(doc)
        created.append(clean_mongo_doc(doc))
    
    logger.info(f"[SECTEUR] {len(created)} secteurs par défaut créés par {current_user.email}")
    
    return {
        "success": True,
        "message": f"{len(created)} secteurs créés",
        "secteurs": created
    }
