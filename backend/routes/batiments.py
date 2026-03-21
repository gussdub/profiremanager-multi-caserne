"""
Routes pour le module Bâtiments (indépendant de Prévention)
Ce module permet de gérer les bâtiments/adresses de manière centralisée,
utilisable par Prévention, Interventions, et autres modules.

Endpoints:
- GET    /{tenant_slug}/batiments                    - Liste bâtiments
- GET    /{tenant_slug}/batiments/search             - Recherche bâtiments
- GET    /{tenant_slug}/batiments/{id}               - Détail bâtiment
- POST   /{tenant_slug}/batiments                    - Créer bâtiment
- PUT    /{tenant_slug}/batiments/{id}               - Modifier bâtiment
- DELETE /{tenant_slug}/batiments/{id}               - Supprimer bâtiment
- GET    /{tenant_slug}/batiments/meta/categories    - Catégories bâtiments
- GET    /{tenant_slug}/batiments/statistiques       - Statistiques
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid

from .dependencies import (
    get_db, 
    get_tenant_from_slug, 
    get_current_user, 
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Bâtiments"])


# ======================== MODÈLES ========================

class BatimentBase(BaseModel):
    adresse_civique: str
    ville: str
    code_postal: Optional[str] = None
    province: Optional[str] = "Québec"
    pays: Optional[str] = "Canada"
    nom_etablissement: Optional[str] = None
    groupe_occupation: Optional[str] = None  # A, B, C, D, E, F, I
    sous_type_batiment: Optional[str] = None
    nombre_etages: Optional[int] = None
    superficie: Optional[float] = None
    annee_construction: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: Optional[str] = "Faible"  # Faible, Moyen, Élevé, Très élevé
    description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_telephone: Optional[str] = None
    contact_email: Optional[str] = None
    actif: bool = True


class BatimentCreate(BatimentBase):
    pass


class BatimentUpdate(BaseModel):
    adresse_civique: Optional[str] = None
    ville: Optional[str] = None
    code_postal: Optional[str] = None
    province: Optional[str] = None
    pays: Optional[str] = None
    nom_etablissement: Optional[str] = None
    groupe_occupation: Optional[str] = None
    sous_type_batiment: Optional[str] = None
    nombre_etages: Optional[int] = None
    superficie: Optional[float] = None
    annee_construction: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_telephone: Optional[str] = None
    contact_email: Optional[str] = None
    actif: Optional[bool] = None


class Batiment(BatimentBase):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None


# ======================== ROUTES ========================

@router.get("/{tenant_slug}/batiments/meta/categories")
async def get_categories_batiments(tenant_slug: str):
    """Retourne les catégories/groupes d'occupation des bâtiments"""
    return {
        "groupes_occupation": [
            {"code": "A", "nom": "Groupe A - Établissements de Réunion", "description": "Théâtres, salles de spectacles, églises, restaurants"},
            {"code": "B", "nom": "Groupe B - Soins et Détention", "description": "Hôpitaux, CHSLD, prisons"},
            {"code": "C", "nom": "Groupe C - Habitations", "description": "Maisons, appartements, condos"},
            {"code": "D", "nom": "Groupe D - Établissements d'Affaires", "description": "Bureaux, banques, cliniques"},
            {"code": "E", "nom": "Groupe E - Établissements Commerciaux", "description": "Magasins, centres commerciaux"},
            {"code": "F", "nom": "Groupe F - Établissements Industriels", "description": "Usines, ateliers, entrepôts"},
            {"code": "I", "nom": "Groupe I - Établissements Industriels à risques", "description": "Industries à risques élevés"}
        ],
        "niveaux_risque": ["Faible", "Moyen", "Élevé", "Très élevé"]
    }


@router.get("/{tenant_slug}/batiments/statistiques")
async def get_batiments_statistiques(
    tenant_slug: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Statistiques des bâtiments"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    pipeline = [
        {"$match": {"tenant_id": tenant.id}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "par_risque": {
                "$push": "$niveau_risque"
            },
            "par_groupe": {
                "$push": "$groupe_occupation"
            }
        }}
    ]
    
    result = await db.batiments.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "total": 0,
            "par_niveau_risque": {},
            "par_groupe_occupation": {}
        }
    
    stats = result[0]
    
    # Compter par niveau de risque
    risques = {}
    for r in stats.get("par_risque", []):
        if r:
            risques[r] = risques.get(r, 0) + 1
    
    # Compter par groupe d'occupation
    groupes = {}
    for g in stats.get("par_groupe", []):
        if g:
            groupes[g] = groupes.get(g, 0) + 1
    
    return {
        "total": stats.get("total", 0),
        "par_niveau_risque": risques,
        "par_groupe_occupation": groupes
    }


@router.get("/{tenant_slug}/batiments")
async def get_batiments(
    tenant_slug: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    actif: Optional[bool] = None,
    niveau_risque: Optional[str] = None,
    groupe_occupation: Optional[str] = None
):
    """Liste tous les bâtiments du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    query = {"tenant_id": tenant.id}
    
    if actif is not None:
        query["actif"] = actif
    
    if niveau_risque:
        query["niveau_risque"] = niveau_risque
    
    if groupe_occupation:
        query["groupe_occupation"] = groupe_occupation
    
    batiments = await db.batiments.find(
        query, 
        {"_id": 0}
    ).sort("nom_etablissement", 1).to_list(5000)
    
    return batiments


@router.get("/{tenant_slug}/batiments/search")
async def search_batiments(
    tenant_slug: str,
    q: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    limit: int = 50
):
    """Recherche de bâtiments par texte"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    if not q or len(q) < 2:
        return []
    
    # Recherche sur plusieurs champs
    query = {
        "tenant_id": tenant.id,
        "$or": [
            {"adresse_civique": {"$regex": q, "$options": "i"}},
            {"ville": {"$regex": q, "$options": "i"}},
            {"nom_etablissement": {"$regex": q, "$options": "i"}},
            {"code_postal": {"$regex": q, "$options": "i"}}
        ]
    }
    
    batiments = await db.batiments.find(
        query, 
        {"_id": 0}
    ).sort("nom_etablissement", 1).limit(limit).to_list(limit)
    
    return batiments


@router.get("/{tenant_slug}/batiments/{batiment_id}")
async def get_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Détail d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    batiment = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return batiment


@router.post("/{tenant_slug}/batiments")
async def create_batiment(
    tenant_slug: str,
    batiment: BatimentCreate,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Créer un nouveau bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "creer", "liste")
    
    batiment_obj = Batiment(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        created_at=datetime.now(timezone.utc),
        created_by=current_user.id,
        **batiment.dict()
    )
    
    await db.batiments.insert_one(batiment_obj.dict())
    
    return {"message": "Bâtiment créé", "id": batiment_obj.id}


@router.put("/{tenant_slug}/batiments/{batiment_id}")
async def update_batiment(
    tenant_slug: str,
    batiment_id: str,
    data: BatimentUpdate,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Modifier un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id}, 
        {"_id": 0}
    )
    
    return updated


@router.delete("/{tenant_slug}/batiments/{batiment_id}")
async def delete_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Supprimer un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "supprimer", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Vérifier si le bâtiment a des dépendances (inspections, interventions, etc.)
    # Pour l'instant, on permet la suppression mais on pourrait ajouter une vérification
    
    await db.batiments.delete_one({"id": batiment_id, "tenant_id": tenant.id})
    
    return {"message": "Bâtiment supprimé", "id": batiment_id}


@router.post("/{tenant_slug}/batiments/{batiment_id}/photo")
async def upload_batiment_photo(
    tenant_slug: str,
    batiment_id: str,
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Upload une photo pour un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Lire le contenu du fichier et le convertir en base64
    import base64
    content = await file.read()
    content_type = file.content_type or "image/jpeg"
    
    # Limiter la taille (5MB max)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5MB)")
    
    base64_content = base64.b64encode(content).decode('utf-8')
    photo_url = f"data:{content_type};base64,{base64_content}"
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Photo uploadée", "photo_url": photo_url}
