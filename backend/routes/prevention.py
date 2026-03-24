"""
Routes API pour le module Prévention
====================================

STATUT: ACTIF
Ce module gère la prévention incendie : bâtiments, inspections, grilles, secteurs.

Routes Bâtiments:
- GET    /{tenant_slug}/prevention/batiments                    - Liste bâtiments
- GET    /{tenant_slug}/prevention/batiments/search             - Recherche bâtiments
- GET    /{tenant_slug}/prevention/batiments/{id}               - Détail bâtiment
- POST   /{tenant_slug}/prevention/batiments                    - Créer bâtiment
- PUT    /{tenant_slug}/prevention/batiments/{id}               - Modifier bâtiment
- DELETE /{tenant_slug}/prevention/batiments/{id}               - Supprimer bâtiment
- POST   /{tenant_slug}/prevention/batiments/import-csv         - Importer CSV

Routes Inspections:
- GET    /{tenant_slug}/prevention/inspections                  - Liste inspections
- GET    /{tenant_slug}/prevention/inspections/{id}             - Détail inspection
- POST   /{tenant_slug}/prevention/inspections                  - Créer inspection
- PUT    /{tenant_slug}/prevention/inspections/{id}             - Modifier inspection

Routes Grilles:
- GET    /{tenant_slug}/prevention/grilles-inspection           - Liste grilles
- GET    /{tenant_slug}/prevention/grilles-inspection/{id}      - Détail grille
- POST   /{tenant_slug}/prevention/grilles-inspection           - Créer grille
- PUT    /{tenant_slug}/prevention/grilles-inspection/{id}      - Modifier grille
- DELETE /{tenant_slug}/prevention/grilles-inspection/{id}      - Supprimer grille
- POST   /{tenant_slug}/prevention/grilles-inspection/{id}/dupliquer - Dupliquer

Routes Secteurs:
- GET    /{tenant_slug}/prevention/secteurs                     - Liste secteurs
- GET    /{tenant_slug}/prevention/secteurs/{id}                - Détail secteur
- POST   /{tenant_slug}/prevention/secteurs                     - Créer secteur
- PUT    /{tenant_slug}/prevention/secteurs/{id}                - Modifier secteur
- DELETE /{tenant_slug}/prevention/secteurs/{id}                - Supprimer secteur

Routes Références:
- GET    /{tenant_slug}/prevention/references                   - Catégories et risques
- GET    /{tenant_slug}/prevention/meta/niveaux-risque          - Niveaux de risque
- GET    /{tenant_slug}/prevention/meta/categories-batiments    - Catégories bâtiments
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import csv
import base64
import json
from io import StringIO, BytesIO
from datetime import timedelta
from starlette.responses import Response

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    require_permission,
    user_has_module_action,
    creer_activite
)

# Import des helpers PDF partagés (utilisés dans prevention_reports.py et prevention_plans.py)



router = APIRouter(tags=["Prévention"])
logger = logging.getLogger(__name__)

# Import des modèles Pydantic depuis le fichier dédié
from routes.prevention_models import (
    Batiment, BatimentCreate, BatimentMapView, BatimentPhotoUpload,
    DependanceBatiment, DependanceCreate, DependanceUpdate,
    GeocodeRequest, GeocodeResponse,
    GrilleInspection, GrilleInspectionCreate,
    IconePersonnaliseeCreate,
    Inspection, InspectionCreate,
    InspectionVisuelle, InspectionVisuelleCreate, InspectionVisuelleUpdate,
    NonConformite, NonConformiteCreate,
    NonConformiteVisuelle, NonConformiteVisuelleCreate,
    PhotoBatiment, PhotoInspection,
    SecteurGeographique, SecteurGeographiqueCreate,
    SymbolePersonnalise, SymbolePersonnaliseCreate,
    CATEGORIES_NR24_27, RISQUES_GUIDE_PLANIFICATION, NIVEAUX_RISQUE
)

@router.get("/{tenant_slug}/prevention/references")
async def get_prevention_references(tenant_slug: str):
    """Récupère les catégories officielles (NR24-27) et risques pour le module prévention"""
    return {
        "categories_nr24_27": CATEGORIES_NR24_27,
        "risques_guide_planification": RISQUES_GUIDE_PLANIFICATION,
        "niveaux_risque": NIVEAUX_RISQUE
    }


@router.get("/{tenant_slug}/prevention/meta/niveaux-risque")
async def get_niveaux_risque(tenant_slug: str):
    """Récupère les niveaux de risque disponibles"""
    return NIVEAUX_RISQUE


@router.get("/{tenant_slug}/prevention/meta/categories-batiments")
async def get_categories_batiments(tenant_slug: str):
    """Récupère les catégories de bâtiments selon le Code national"""
    return CATEGORIES_NR24_27


# ==================== ROUTES BÂTIMENTS ====================

@router.get("/{tenant_slug}/prevention/batiments")
async def get_batiments(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les bâtiments"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    batiments = await db.batiments.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("nom_etablissement", 1).to_list(10000)
    
    return batiments


@router.get("/{tenant_slug}/prevention/batiments/search")
async def search_batiments(
    tenant_slug: str,
    q: str = "",
    niveau_risque: str = "",
    groupe_occupation: str = "",
    current_user: User = Depends(get_current_user)
):
    """Recherche de bâtiments avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    
    if q:
        query["$or"] = [
            {"nom_etablissement": {"$regex": q, "$options": "i"}},
            {"adresse_civique": {"$regex": q, "$options": "i"}},
            {"ville": {"$regex": q, "$options": "i"}}
        ]
    
    if niveau_risque:
        query["niveau_risque"] = niveau_risque
    
    if groupe_occupation:
        query["groupe_occupation"] = groupe_occupation
    
    batiments = await db.batiments.find(query, {"_id": 0}).sort("nom_etablissement", 1).to_list(1000)
    
    return batiments


@router.get("/{tenant_slug}/prevention/batiments/{batiment_id}")
async def get_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un bâtiment spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    batiment = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return batiment


@router.post("/{tenant_slug}/prevention/batiments")
async def create_batiment(
    tenant_slug: str,
    batiment: BatimentCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    batiment_obj = Batiment(tenant_id=tenant.id, **batiment.dict())
    
    await db.batiments.insert_one(batiment_obj.dict())
    
    return clean_mongo_doc(batiment_obj.dict())


@router.put("/{tenant_slug}/prevention/batiments/{batiment_id}")
async def update_batiment(
    tenant_slug: str,
    batiment_id: str,
    batiment_data: BatimentCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    update_data = batiment_data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id}, {"_id": 0})
    return updated


@router.delete("/{tenant_slug}/prevention/batiments/{batiment_id}")
async def delete_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "batiments")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    await db.batiments.delete_one({"id": batiment_id, "tenant_id": tenant.id})
    await db.inspections.delete_many({"batiment_id": batiment_id})
    
    return {"message": "Bâtiment supprimé avec succès"}


@router.post("/{tenant_slug}/prevention/batiments/import-csv")
async def import_batiments_csv(
    tenant_slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Importer des bâtiments depuis un fichier CSV"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    contents = await file.read()
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        csv_text = contents.decode('latin-1')
    
    csv_reader = csv.DictReader(StringIO(csv_text))
    
    imported = 0
    errors = 0
    error_details = []
    
    for row in csv_reader:
        try:
            batiment = Batiment(
                tenant_id=tenant.id,
                nom_etablissement=row.get('nom_etablissement', row.get('nom', '')),
                adresse_civique=row.get('adresse_civique', row.get('adresse', '')),
                ville=row.get('ville', ''),
                code_postal=row.get('code_postal', ''),
                type_batiment=row.get('type_batiment', ''),
                niveau_risque=row.get('niveau_risque', ''),
                groupe_occupation=row.get('groupe_occupation', ''),
                notes=row.get('notes', '')
            )
            await db.batiments.insert_one(batiment.dict())
            imported += 1
        except Exception as e:
            errors += 1
            error_details.append(str(e))
    
    return {
        "imported": imported,
        "errors": errors,
        "error_details": error_details[:10],
        "message": f"{imported} bâtiment(s) importé(s), {errors} erreur(s)"
    }


# ==================== ROUTES INSPECTIONS ====================

@router.get("/{tenant_slug}/prevention/inspections")
async def get_inspections(
    tenant_slug: str,
    batiment_id: Optional[str] = None,
    preventionniste_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les inspections avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    if batiment_id:
        query["batiment_id"] = batiment_id
    if preventionniste_id:
        query["preventionniste_id"] = preventionniste_id
    
    inspections = await db.inspections.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return inspections


@router.get("/{tenant_slug}/prevention/inspections/{inspection_id}")
async def get_inspection(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une inspection spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    inspection = await db.inspections.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    return inspection


@router.post("/{tenant_slug}/prevention/inspections")
async def create_inspection(
    tenant_slug: str,
    inspection: InspectionCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    # Vérifie permission RBAC ou est_preventionniste
    can_create = await user_has_module_action(tenant.id, current_user, "prevention", "creer", "inspections")
    if not can_create and not getattr(current_user, 'est_preventionniste', False):
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Normaliser les données
    inspection_data = inspection.dict()
    
    # Convertir resultats en dict si c'est une liste (compatibilité ancien format)
    if isinstance(inspection_data.get('resultats'), list):
        inspection_data['resultats'] = {}
    
    # Si inspecteur_id est fourni mais pas preventionniste_id, les synchroniser
    if inspection_data.get('inspecteur_id') and not inspection_data.get('preventionniste_id'):
        inspection_data['preventionniste_id'] = inspection_data['inspecteur_id']
    elif inspection_data.get('preventionniste_id') and not inspection_data.get('inspecteur_id'):
        inspection_data['inspecteur_id'] = inspection_data['preventionniste_id']
    
    # Si le nom de l'inspecteur n'est pas fourni, utiliser l'utilisateur courant
    if not inspection_data.get('inspecteur_nom') and not inspection_data.get('inspection_realisee_par'):
        nom_complet = f"{current_user.prenom or ''} {current_user.nom or ''}".strip()
        inspection_data['inspecteur_nom'] = nom_complet
        inspection_data['inspection_realisee_par'] = nom_complet
    
    inspection_obj = Inspection(tenant_id=tenant.id, **inspection_data)
    
    await db.inspections.insert_one(inspection_obj.dict())
    
    return clean_mongo_doc(inspection_obj.dict())


@router.put("/{tenant_slug}/prevention/inspections/{inspection_id}")
async def update_inspection(
    tenant_slug: str,
    inspection_id: str,
    inspection_data: InspectionCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "inspections")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.inspections.find_one({"id": inspection_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    update_data = inspection_data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.inspections.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.inspections.find_one({"id": inspection_id, "tenant_id": tenant.id}, {"_id": 0})
    return updated


# ==================== ROUTES GRILLES ====================

@router.get("/{tenant_slug}/prevention/grilles-inspection")
async def get_grilles_inspection(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les grilles d'inspection (spécifiques au tenant + globales)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer les grilles du tenant ET les grilles globales (tenant_id null ou absent)
    grilles = await db.grilles_inspection.find(
        {"$or": [
            {"tenant_id": tenant.id},
            {"tenant_id": None},
            {"tenant_id": {"$exists": False}}
        ]},
        {"_id": 0}
    ).sort("nom", 1).to_list(1000)
    
    return grilles


@router.get("/{tenant_slug}/prevention/grilles-inspection/{grille_id}")
async def get_grille_inspection(
    tenant_slug: str,
    grille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une grille d'inspection spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    grille = await db.grilles_inspection.find_one(
        {"id": grille_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not grille:
        raise HTTPException(status_code=404, detail="Grille non trouvée")
    
    return grille


@router.post("/{tenant_slug}/prevention/grilles-inspection")
async def create_grille_inspection(
    tenant_slug: str,
    grille: GrilleInspectionCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle grille d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "grilles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    grille_obj = GrilleInspection(tenant_id=tenant.id, **grille.dict())
    
    await db.grilles_inspection.insert_one(grille_obj.dict())
    
    return clean_mongo_doc(grille_obj.dict())


@router.put("/{tenant_slug}/prevention/grilles-inspection/{grille_id}")
async def update_grille_inspection(
    tenant_slug: str,
    grille_id: str,
    grille_data: GrilleInspectionCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une grille d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "grilles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.grilles_inspection.find_one({"id": grille_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Grille non trouvée")
    
    update_data = grille_data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.grilles_inspection.update_one(
        {"id": grille_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.grilles_inspection.find_one({"id": grille_id, "tenant_id": tenant.id}, {"_id": 0})
    return updated


@router.delete("/{tenant_slug}/prevention/grilles-inspection/{grille_id}")
async def delete_grille_inspection(
    tenant_slug: str,
    grille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une grille d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "grilles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.grilles_inspection.find_one({"id": grille_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Grille non trouvée")
    
    await db.grilles_inspection.delete_one({"id": grille_id, "tenant_id": tenant.id})
    
    return {"message": "Grille supprimée avec succès"}


@router.post("/{tenant_slug}/prevention/grilles-inspection/{grille_id}/dupliquer")
async def dupliquer_grille_inspection(
    tenant_slug: str,
    grille_id: str,
    current_user: User = Depends(get_current_user)
):
    """Dupliquer une grille d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "grilles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    grille = await db.grilles_inspection.find_one({"id": grille_id, "tenant_id": tenant.id})
    if not grille:
        raise HTTPException(status_code=404, detail="Grille non trouvée")
    
    new_grille = GrilleInspection(
        tenant_id=tenant.id,
        nom=f"{grille['nom']} (copie)",
        description=grille.get('description', ''),
        sections=grille.get('sections', [])
    )
    
    await db.grilles_inspection.insert_one(new_grille.dict())
    
    return clean_mongo_doc(new_grille.dict())


# ==================== ROUTES SECTEURS ====================

@router.get("/{tenant_slug}/prevention/secteurs-geographiques")
async def get_secteurs_geographiques_alias(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Alias pour récupérer tous les secteurs géographiques (compatibilité frontend)"""
    return await get_secteurs(tenant_slug, current_user)


@router.get("/{tenant_slug}/prevention/secteurs")
async def get_secteurs(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les secteurs géographiques"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    secteurs = await db.secteurs_geographiques.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("nom", 1).to_list(1000)
    
    return secteurs


@router.get("/{tenant_slug}/prevention/secteurs/{secteur_id}")
async def get_secteur(
    tenant_slug: str,
    secteur_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un secteur spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    secteur = await db.secteurs_geographiques.find_one(
        {"id": secteur_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not secteur:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    return secteur


@router.post("/{tenant_slug}/prevention/secteurs")
async def create_secteur(
    tenant_slug: str,
    secteur: SecteurGeographiqueCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau secteur géographique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "secteurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    secteur_obj = SecteurGeographique(tenant_id=tenant.id, **secteur.dict())
    
    await db.secteurs_geographiques.insert_one(secteur_obj.dict())
    
    return clean_mongo_doc(secteur_obj.dict())


@router.put("/{tenant_slug}/prevention/secteurs/{secteur_id}")
async def update_secteur(
    tenant_slug: str,
    secteur_id: str,
    secteur_data: SecteurGeographiqueCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un secteur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "secteurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    update_data = secteur_data.dict()
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.secteurs_geographiques.update_one(
        {"id": secteur_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id}, {"_id": 0})
    return updated


@router.delete("/{tenant_slug}/prevention/secteurs/{secteur_id}")
async def delete_secteur(
    tenant_slug: str,
    secteur_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un secteur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "secteurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    await db.secteurs_geographiques.delete_one({"id": secteur_id, "tenant_id": tenant.id})
    
    return {"message": "Secteur supprimé avec succès"}


@router.post("/{tenant_slug}/prevention/initialiser")
async def initialiser_module_prevention(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Initialiser le module prévention avec les 7 grilles d'inspection standards"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "grilles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le module prévention est activé
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier si des grilles existent déjà
    existing_count = await db.grilles_inspection.count_documents({"tenant_id": tenant.id})
    if existing_count > 0:
        raise HTTPException(status_code=400, detail=f"{existing_count} grille(s) existent déjà. Supprimez-les d'abord si vous voulez réinitialiser.")
    
    # Importer les grilles depuis insert_grilles.py
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from insert_grilles import GRILLES
    
    # Créer les 7 grilles pour ce tenant
    grilles_creees = []
    for grille_template in GRILLES:
        grille = grille_template.copy()
        grille["id"] = str(uuid.uuid4())
        grille["tenant_id"] = tenant.id
        grille["actif"] = True
        grille["version"] = "1.0"
        
        await db.grilles_inspection.insert_one(grille)
        grilles_creees.append({"id": grille["id"], "nom": grille["nom"]})
    
    return {
        "message": f"{len(grilles_creees)} grilles d'inspection créées avec succès",
        "grilles": grilles_creees
    }



@router.post("/{tenant_slug}/prevention/batiments/{batiment_id}/photo")
async def upload_batiment_photo(
    tenant_slug: str,
    batiment_id: str,
    photo_data: BatimentPhotoUpload,
    current_user: User = Depends(get_current_user)
):
    """Uploader/Mettre à jour la photo d'un bâtiment (en base64)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    # Vérifie permission RBAC ou est_preventionniste
    can_modify = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "batiments")
    if not can_modify and not current_user.est_preventionniste:
        raise HTTPException(status_code=403, detail="Accès refusé - Permission insuffisante")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le module prévention est activé
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que le bâtiment existe
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Vérifier que la photo est au bon format base64
    if not photo_data.photo_base64.startswith('data:image/'):
        raise HTTPException(status_code=400, detail="Format de photo invalide (doit être base64 data URL)")
    
    # Mettre à jour la photo
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {"photo_url": photo_data.photo_base64, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Photo mise à jour avec succès", "photo_url": photo_data.photo_base64}

@router.delete("/{tenant_slug}/prevention/batiments/{batiment_id}/photo")
async def delete_batiment_photo(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer la photo d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "batiments")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le module prévention est activé
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Mettre à jour pour retirer la photo
    result = await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {"photo_url": "", "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return {"message": "Photo supprimée avec succès"}


# ==================== DÉPENDANCES DE BÂTIMENTS ====================

@router.get("/{tenant_slug}/prevention/batiments/{batiment_id}/dependances")
async def get_dependances_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les dépendances d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que le bâtiment existe
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Récupérer les dépendances
    dependances = await db.dependances_batiments.find({
        "tenant_id": tenant.id,
        "batiment_parent_id": batiment_id
    }).to_list(100)
    
    return [clean_mongo_doc(d) for d in dependances]


@router.get("/{tenant_slug}/prevention/dependances-count")
async def get_dependances_count_all(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les informations sur les dépendances pour tous les bâtiments (optimisé pour la liste)
    Retourne pour chaque bâtiment: le nombre total de dépendances et le détail par niveau de risque
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Utiliser aggregation pour compter les dépendances par bâtiment parent et par niveau de risque
    pipeline = [
        {"$match": {"tenant_id": tenant.id}},
        {"$group": {
            "_id": {
                "batiment_id": "$batiment_parent_id",
                "niveau_risque": "$niveau_risque"
            },
            "count": {"$sum": 1}
        }}
    ]
    
    result = await db.dependances_batiments.aggregate(pipeline).to_list(1000)
    
    # Construire un dictionnaire structuré
    # {batiment_id: {total: X, par_risque: {faible: X, moyen: X, eleve: X, tres_eleve: X}}}
    batiments_deps = {}
    for item in result:
        if not item["_id"]["batiment_id"]:
            continue
        bat_id = item["_id"]["batiment_id"]
        risque = (item["_id"]["niveau_risque"] or "").lower()
        count = item["count"]
        
        if bat_id not in batiments_deps:
            batiments_deps[bat_id] = {
                "total": 0,
                "par_risque": {}
            }
        
        batiments_deps[bat_id]["total"] += count
        if risque:
            batiments_deps[bat_id]["par_risque"][risque] = count
    
    return batiments_deps


@router.get("/{tenant_slug}/prevention/dependances-all")
async def get_all_dependances(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les dépendances avec les informations du bâtiment parent
    Utilisé pour la planification où les dépendances sont des entrées séparées
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer toutes les dépendances
    dependances = await db.dependances_batiments.find({
        "tenant_id": tenant.id
    }).to_list(1000)
    
    # Récupérer les bâtiments parents pour avoir leurs adresses
    batiment_ids = list(set(d.get("batiment_parent_id") for d in dependances if d.get("batiment_parent_id")))
    batiments = await db.batiments.find({
        "id": {"$in": batiment_ids},
        "tenant_id": tenant.id
    }).to_list(1000)
    
    # Créer un mapping batiment_id -> batiment
    batiments_map = {b["id"]: b for b in batiments}
    
    # Enrichir les dépendances avec les infos du bâtiment parent
    result = []
    for dep in dependances:
        parent = batiments_map.get(dep.get("batiment_parent_id"), {})
        dep_clean = clean_mongo_doc(dep)
        dep_clean["batiment_parent"] = {
            "id": parent.get("id"),
            "nom_etablissement": parent.get("nom_etablissement"),
            "adresse_civique": parent.get("adresse_civique"),
            "ville": parent.get("ville")
        }
        # Ajouter un type pour différencier des bâtiments
        dep_clean["type_element"] = "dependance"
        result.append(dep_clean)
    
    return result


@router.get("/{tenant_slug}/prevention/dependances/{dependance_id}")
async def get_dependance(
    tenant_slug: str,
    dependance_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le détail d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    return clean_mongo_doc(dependance)


@router.post("/{tenant_slug}/prevention/batiments/{batiment_id}/dependances")
async def create_dependance(
    tenant_slug: str,
    batiment_id: str,
    data: DependanceCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle dépendance pour un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que le bâtiment parent existe
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment parent non trouvé")
    
    # Créer la dépendance
    dependance = DependanceBatiment(
        tenant_id=tenant.id,
        batiment_parent_id=batiment_id,
        **data.dict()
    )
    
    await db.dependances_batiments.insert_one(dependance.dict())
    
    # Si risque moyen/élevé/très élevé et pas de préventionniste assigné,
    # assigner le même que le bâtiment parent
    if dependance.niveau_risque in ["moyen", "élevé", "tres_eleve", "très élevé"]:
        if not dependance.preventionniste_assigne_id and batiment.get("preventionniste_assigne_id"):
            await db.dependances_batiments.update_one(
                {"id": dependance.id},
                {"$set": {"preventionniste_assigne_id": batiment.get("preventionniste_assigne_id")}}
            )
    
    logger.info(f"Dépendance '{data.nom}' créée pour le bâtiment {batiment_id}")
    
    return clean_mongo_doc(dependance.dict())


@router.put("/{tenant_slug}/prevention/dependances/{dependance_id}")
async def update_dependance(
    tenant_slug: str,
    dependance_id: str,
    data: DependanceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que la dépendance existe
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Préparer les données de mise à jour
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.dependances_batiments.update_one(
        {"id": dependance_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Récupérer la dépendance mise à jour
    updated = await db.dependances_batiments.find_one({"id": dependance_id})
    
    return clean_mongo_doc(updated)


@router.delete("/{tenant_slug}/prevention/dependances/{dependance_id}")
async def delete_dependance(
    tenant_slug: str,
    dependance_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que la dépendance existe
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Supprimer les inspections liées à cette dépendance
    await db.inspections_prevention.delete_many({
        "dependance_id": dependance_id,
        "tenant_id": tenant.id
    })
    
    # Supprimer la dépendance
    await db.dependances_batiments.delete_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    
    logger.info(f"Dépendance {dependance_id} supprimée")
    
    return {"message": "Dépendance supprimée avec succès"}


# ==================== INSPECTIONS DÉPENDANCES ====================

@router.get("/{tenant_slug}/prevention/dependances/{dependance_id}/inspections")
async def get_inspections_dependance(
    tenant_slug: str,
    dependance_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que la dépendance existe
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Récupérer les inspections de cette dépendance
    inspections = await db.inspections.find({
        "dependance_id": dependance_id,
        "tenant_id": tenant.id
    }, {"_id": 0}).sort("date_inspection", -1).to_list(100)
    
    return inspections


@router.post("/{tenant_slug}/prevention/dependances/{dependance_id}/inspections")
async def create_inspection_dependance(
    tenant_slug: str,
    dependance_id: str,
    data: InspectionCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une inspection pour une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que la dépendance existe
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Créer l'inspection avec la référence à la dépendance
    inspection_data = data.dict()
    inspection_data["dependance_id"] = dependance_id
    inspection_data["batiment_id"] = dependance.get("batiment_parent_id", "")
    
    # Convertir resultats en dict si c'est une liste (compatibilité ancien format)
    if isinstance(inspection_data.get('resultats'), list):
        inspection_data['resultats'] = {}
    
    inspection = Inspection(
        tenant_id=tenant.id,
        **inspection_data
    )
    
    await db.inspections.insert_one(inspection.dict())
    
    # Mettre à jour la date de dernière inspection de la dépendance
    await db.dependances_batiments.update_one(
        {"id": dependance_id, "tenant_id": tenant.id},
        {"$set": {
            "derniere_inspection": data.date_inspection,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    logger.info(f"Inspection créée pour la dépendance {dependance_id}")
    
    return clean_mongo_doc(inspection.dict())


@router.get("/{tenant_slug}/prevention/dependances/{dependance_id}/stats")
async def get_stats_dependance(
    tenant_slug: str,
    dependance_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les statistiques d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que la dépendance existe
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Compter les inspections
    total_inspections = await db.inspections.count_documents({
        "dependance_id": dependance_id,
        "tenant_id": tenant.id
    })
    
    # Dernière inspection
    derniere = await db.inspections.find_one(
        {"dependance_id": dependance_id, "tenant_id": tenant.id},
        sort=[("date_inspection", -1)]
    )
    
    return {
        "total_inspections": total_inspections,
        "derniere_inspection": derniere.get("date_inspection") if derniere else None,
        "dernier_statut": derniere.get("statut") if derniere else None
    }


# ==================== GALERIE PHOTOS BÂTIMENTS & DÉPENDANCES ====================

@router.get("/{tenant_slug}/prevention/batiments/{batiment_id}/photos")
async def get_photos_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la galerie de photos d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return batiment.get("photos", [])


@router.post("/{tenant_slug}/prevention/batiments/{batiment_id}/photos")
async def add_photo_batiment(
    tenant_slug: str,
    batiment_id: str,
    photo: PhotoBatiment,
    current_user: User = Depends(get_current_user)
):
    """Ajouter une photo à la galerie d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Ajouter les infos de l'utilisateur
    photo_data = photo.dict()
    photo_data["ajoutee_par_id"] = current_user.id
    photo_data["ajoutee_par_nom"] = f"{current_user.prenom} {current_user.nom}"
    
    # Ajouter à la galerie
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {
            "$push": {"photos": photo_data},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Photo ajoutée avec succès", "photo": photo_data}


@router.delete("/{tenant_slug}/prevention/batiments/{batiment_id}/photos/{photo_id}")
async def delete_photo_from_galerie(
    tenant_slug: str,
    batiment_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une photo de la galerie d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    result = await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {
            "$pull": {"photos": {"id": photo_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return {"message": "Photo supprimée avec succès"}


@router.get("/{tenant_slug}/prevention/dependances/{dependance_id}/photos")
async def get_photos_dependance(
    tenant_slug: str,
    dependance_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la galerie de photos d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    return dependance.get("photos", [])


@router.post("/{tenant_slug}/prevention/dependances/{dependance_id}/photos")
async def add_photo_dependance(
    tenant_slug: str,
    dependance_id: str,
    photo: PhotoBatiment,
    current_user: User = Depends(get_current_user)
):
    """Ajouter une photo à la galerie d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    dependance = await db.dependances_batiments.find_one({
        "id": dependance_id,
        "tenant_id": tenant.id
    })
    if not dependance:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    # Ajouter les infos de l'utilisateur
    photo_data = photo.dict()
    photo_data["ajoutee_par_id"] = current_user.id
    photo_data["ajoutee_par_nom"] = f"{current_user.prenom} {current_user.nom}"
    
    # Ajouter à la galerie
    await db.dependances_batiments.update_one(
        {"id": dependance_id, "tenant_id": tenant.id},
        {
            "$push": {"photos": photo_data},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    return {"message": "Photo ajoutée avec succès", "photo": photo_data}


@router.delete("/{tenant_slug}/prevention/dependances/{dependance_id}/photos/{photo_id}")
async def delete_photo_from_dependance(
    tenant_slug: str,
    dependance_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une photo de la galerie d'une dépendance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")
    
    result = await db.dependances_batiments.update_one(
        {"id": dependance_id, "tenant_id": tenant.id},
        {
            "$pull": {"photos": {"id": photo_id}},
            "$set": {"updated_at": datetime.now(timezone.utc)}
        }
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dépendance non trouvée")
    
    return {"message": "Photo supprimée avec succès"}


# ==================== SYMBOLES PERSONNALISÉS ====================

@router.get("/{tenant_slug}/prevention/symboles-personnalises")
async def get_symboles_personnalises(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les symboles personnalisés du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "symboles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    symboles = await db.symboles_personnalises.find({"tenant_id": tenant.id}).to_list(1000)
    return [clean_mongo_doc(symbole) for symbole in symboles]

@router.post("/{tenant_slug}/prevention/symboles-personnalises")
async def create_symbole_personnalise(
    tenant_slug: str,
    symbole: SymbolePersonnaliseCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau symbole personnalisé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "symboles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que l'image est au bon format base64
    if not symbole.image_base64.startswith('data:image/'):
        raise HTTPException(status_code=400, detail="Format d'image invalide (doit être base64 data URL)")
    
    symbole_dict = symbole.dict()
    symbole_dict["tenant_id"] = tenant.id
    symbole_dict["id"] = str(uuid.uuid4())
    symbole_dict["created_at"] = datetime.now(timezone.utc)
    symbole_dict["created_by"] = current_user.id
    
    symbole_obj = SymbolePersonnalise(**symbole_dict)
    await db.symboles_personnalises.insert_one(symbole_obj.dict())
    
    return clean_mongo_doc(symbole_obj.dict())

@router.put("/{tenant_slug}/prevention/symboles-personnalises/{symbole_id}")
async def update_symbole_personnalise(
    tenant_slug: str,
    symbole_id: str,
    symbole: SymbolePersonnaliseCreate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un symbole personnalisé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "symboles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que le symbole existe
    existing = await db.symboles_personnalises.find_one({"id": symbole_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Symbole non trouvé")
    
    # Vérifier que l'image est au bon format si elle est fournie
    if symbole.image_base64 and not symbole.image_base64.startswith('data:image/'):
        raise HTTPException(status_code=400, detail="Format d'image invalide (doit être base64 data URL)")
    
    update_dict = symbole.dict()
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.symboles_personnalises.update_one(
        {"id": symbole_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    updated = await db.symboles_personnalises.find_one({"id": symbole_id, "tenant_id": tenant.id})
    return clean_mongo_doc(updated)

@router.delete("/{tenant_slug}/prevention/symboles-personnalises/{symbole_id}")
async def delete_symbole_personnalise(
    tenant_slug: str,
    symbole_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un symbole personnalisé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "symboles")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier si le symbole existe
    symbole = await db.symboles_personnalises.find_one({"id": symbole_id, "tenant_id": tenant.id})
    if not symbole:
        raise HTTPException(status_code=404, detail="Symbole non trouvé")
    
    # Vérifier si le symbole est utilisé dans des plans d'intervention
    # Les plans peuvent stocker les symboles dans les layers (format GeoJSON)
    plans_utilisant = await db.plans_intervention.count_documents({
        "tenant_id": tenant.id,
        "$or": [
            {"layers.properties.symbolId": symbole_id},
            {"layers": {"$elemMatch": {"properties.symbolId": symbole_id}}}
        ]
    })
    
    if plans_utilisant > 0:
        raise HTTPException(
            status_code=409, 
            detail=f"Impossible de supprimer ce symbole. Il est utilisé dans {plans_utilisant} plan(s) d'intervention."
        )
    
    result = await db.symboles_personnalises.delete_one({"id": symbole_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Symbole non trouvé")
    
    return {"message": "Symbole supprimé avec succès"}



# ==================== SECTEURS GÉOGRAPHIQUES ====================











# ==================== GÉNÉRATION RAPPORT PDF ====================
# Routes déplacées vers prevention_reports.py

# ==================== INSPECTIONS ====================





@router.get("/{tenant_slug}/prevention/inspections-planifiees")
async def get_inspections_planifiees(
    tenant_slug: str,
    days: int = 7,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les inspections planifiées pour les X prochains jours (pour mode offline)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Calculer la plage de dates
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    end_date = today + timedelta(days=days)
    
    # Convertir en format ISO string YYYY-MM-DD pour comparaison
    today_str = today.isoformat()
    end_date_str = end_date.isoformat()
    
    # Récupérer les inspections planifiées (date_inspection entre aujourd'hui et end_date)
    inspections = await db.inspections.find({
        "tenant_id": tenant.id,
        "date_inspection": {
            "$gte": today_str,
            "$lte": end_date_str
        },
        "statut": {"$in": ["planifiee", "en_cours", "a_faire", None]}  # Exclure les terminées
    }).sort("date_inspection", 1).to_list(100)
    
    # Enrichir avec les infos du bâtiment
    enriched = []
    for insp in inspections:
        batiment = await db.batiments.find_one(
            {"id": insp.get("batiment_id"), "tenant_id": tenant.id},
            {"_id": 0}
        )
        
        enriched.append({
            **clean_mongo_doc(insp),
            "batiment": batiment
        })
    
    return enriched

@router.delete("/{tenant_slug}/prevention/inspections/{inspection_id}")
async def delete_inspection(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "inspections")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.inspections.delete_one({"id": inspection_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Supprimer aussi les non-conformités associées
    await db.non_conformites.delete_many({"inspection_id": inspection_id, "tenant_id": tenant.id})
    
    return {"message": "Inspection supprimée avec succès"}


# ==================== NON-CONFORMITÉS ====================

@router.post("/{tenant_slug}/prevention/non-conformites")
async def create_non_conformite(
    tenant_slug: str,
    non_conformite: NonConformiteCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle non-conformité (manuelle ou liée à une inspection)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "non_conformites")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc_dict = non_conformite.dict()
    nc_dict["tenant_id"] = tenant.id
    nc_dict["createur_id"] = current_user.id  # Sauvegarder le créateur
    
    # Marquer comme manuel si pas d'inspection_id
    if not nc_dict.get("inspection_id"):
        nc_dict["est_manuel"] = True
        nc_dict["inspection_id"] = None
    
    # Mapper priorite vers gravite si fourni
    if nc_dict.get("priorite"):
        priorite_map = {"haute": "eleve", "moyenne": "moyen", "faible": "faible"}
        nc_dict["gravite"] = priorite_map.get(nc_dict["priorite"], nc_dict["priorite"])
    
    nc_obj = NonConformite(**nc_dict)
    
    await db.non_conformites.insert_one(nc_obj.dict())
    
    return clean_mongo_doc(nc_obj.dict())

@router.get("/{tenant_slug}/prevention/non-conformites")
async def get_non_conformites(
    tenant_slug: str,
    inspection_id: Optional[str] = None,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les non-conformités avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    if inspection_id:
        query["inspection_id"] = inspection_id
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    
    non_conformites = await db.non_conformites.find(query).sort("created_at", -1).to_list(1000)
    return [clean_mongo_doc(nc) for nc in non_conformites]

@router.get("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def get_non_conformite(
    tenant_slug: str,
    nc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une non-conformité spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc = await db.non_conformites.find_one({"id": nc_id, "tenant_id": tenant.id})
    
    if not nc:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    return clean_mongo_doc(nc)

@router.put("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def update_non_conformite(
    tenant_slug: str,
    nc_id: str,
    nc_data: NonConformiteCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "non_conformites")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_dict = nc_data.dict()
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.non_conformites.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated_nc = await db.non_conformites.find_one({"id": nc_id})
    return clean_mongo_doc(updated_nc)

@router.patch("/{tenant_slug}/prevention/non-conformites/{nc_id}/statut")
async def update_non_conformite_statut(
    tenant_slug: str,
    nc_id: str,
    statut: str = Body(..., embed=True),
    notes_correction: str = Body("", embed=True),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour le statut d'une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "non_conformites")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_data = {
        "statut": statut,
        "notes_correction": notes_correction,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if statut == "corrigee" or statut == "fermee":
        update_data["date_correction"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    result = await db.non_conformites.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated_nc = await db.non_conformites.find_one({"id": nc_id})
    return clean_mongo_doc(updated_nc)

@router.delete("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def delete_non_conformite(
    tenant_slug: str,
    nc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "non_conformites")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.non_conformites.delete_one({"id": nc_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    return {"message": "Non-conformité supprimée avec succès"}


@router.get("/{tenant_slug}/prevention/non-conformites-en-retard")
async def get_non_conformites_en_retard(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupérer les non-conformités dont le délai de correction est dépassé ou arrive à échéance.
    Utilisé pour le tableau de bord et les relances.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # NC ouvertes avec délai de correction défini
    non_conformites = await db.non_conformites.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["ouverte", "en_cours", "a_corriger"]},
        "delai_correction": {"$ne": None, "$lte": today}
    }).sort("delai_correction", 1).to_list(500)
    
    # Enrichir avec les infos du bâtiment
    result = []
    for nc in non_conformites:
        nc_clean = clean_mongo_doc(nc)
        
        # Récupérer le bâtiment
        batiment = await db.batiments.find_one({"id": nc.get("batiment_id"), "tenant_id": tenant.id})
        if batiment:
            nc_clean["batiment"] = {
                "id": batiment.get("id"),
                "nom_etablissement": batiment.get("nom_etablissement"),
                "adresse_civique": batiment.get("adresse_civique"),
                "ville": batiment.get("ville"),
                "preventionniste_assigne_id": batiment.get("preventionniste_assigne_id")
            }
        
        # Calculer le retard en jours
        if nc.get("delai_correction"):
            try:
                delai_date = datetime.strptime(nc["delai_correction"], "%Y-%m-%d").date()
                today_date = datetime.now(timezone.utc).date()
                nc_clean["jours_retard"] = (today_date - delai_date).days
            except:
                nc_clean["jours_retard"] = 0
        
        result.append(nc_clean)
    
    return result


@router.post("/{tenant_slug}/prevention/relancer-non-conformites")
async def relancer_non_conformites(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Envoyer des notifications de relance pour les NC en retard.
    Crée des notifications pour:
    - Le créateur de la NC
    - Le responsable prévention (admin/superviseur avec role prevention)
    - Le préventionniste assigné au bâtiment
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "non_conformites")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # NC en retard qui n'ont pas été relancées aujourd'hui
    non_conformites = await db.non_conformites.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["ouverte", "en_cours", "a_corriger"]},
        "delai_correction": {"$ne": None, "$lte": today},
        "$or": [
            {"derniere_relance": {"$ne": today}},
            {"derniere_relance": {"$exists": False}}
        ]
    }).to_list(500)
    
    relances_envoyees = 0
    
    for nc in non_conformites:
        # Récupérer le bâtiment pour le préventionniste assigné
        batiment = await db.batiments.find_one({"id": nc.get("batiment_id"), "tenant_id": tenant.id})
        
        # Collecter les destinataires uniques
        destinataires_ids = set()
        
        # 1. Le créateur de la NC
        if nc.get("createur_id"):
            destinataires_ids.add(nc["createur_id"])
        
        # 2. Le préventionniste assigné au bâtiment
        if batiment and batiment.get("preventionniste_assigne_id"):
            destinataires_ids.add(batiment["preventionniste_assigne_id"])
        
        # 3. Les responsables prévention (admins/superviseurs avec est_preventionniste)
        responsables = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["admin", "superviseur"]},
            "$or": [
                {"est_preventionniste": True},
                {"est_responsable_prevention": True}
            ]
        }).to_list(50)
        for resp in responsables:
            destinataires_ids.add(resp["id"])
        
        # Calculer le retard
        jours_retard = 0
        if nc.get("delai_correction"):
            try:
                delai_date = datetime.strptime(nc["delai_correction"], "%Y-%m-%d").date()
                today_date = datetime.now(timezone.utc).date()
                jours_retard = (today_date - delai_date).days
            except:
                pass
        
        # Envoyer les notifications
        titre_nc = nc.get("titre") or nc.get("section_grille") or "Non-conformité"
        batiment_nom = batiment.get("nom_etablissement") or batiment.get("adresse_civique") if batiment else "Bâtiment inconnu"
        
        for dest_id in destinataires_ids:
            try:
                await creer_notification(
                    tenant_id=tenant.id,
                    destinataire_id=dest_id,
                    type="relance_nc",
                    titre=f"⚠️ NC en retard: {titre_nc}",
                    message=f"Non-conformité au {batiment_nom} - {jours_retard} jour(s) de retard",
                    lien=f"/prevention/non-conformites",
                    data={"nc_id": nc.get("id"), "jours_retard": jours_retard, "batiment_id": nc.get("batiment_id")}
                )
                relances_envoyees += 1
            except Exception as e:
                logger.error(f"Erreur envoi notification relance NC: {e}")
        
        # Mettre à jour la NC avec la date de relance
        await db.non_conformites.update_one(
            {"id": nc.get("id"), "tenant_id": tenant.id},
            {"$set": {
                "derniere_relance": today,
                "nb_relances": nc.get("nb_relances", 0) + 1,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    
    return {
        "message": f"Relances envoyées avec succès",
        "nc_traitees": len(non_conformites),
        "notifications_envoyees": relances_envoyees
    }


# ==================== UPLOAD PHOTOS ====================

@router.post("/{tenant_slug}/prevention/upload-photo")
async def upload_photo(
    tenant_slug: str,
    photo_base64: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Upload une photo en base64 et retourne l'URL"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "photos")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        # Générer un ID unique pour la photo
        photo_id = str(uuid.uuid4())
        
        # Stocker la photo dans la collection photos
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "data": photo_base64,
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.photos_prevention.insert_one(photo_doc)
        
        # Retourner l'ID de la photo (qui servira d'URL)
        return {
            "photo_id": photo_id,
            "url": f"/api/{tenant_slug}/prevention/photos/{photo_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")

@router.post("/{tenant_slug}/inventaires/upload-photo")
async def upload_inventaire_photo(
    tenant_slug: str,
    photo_base64: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Upload une photo pour un inventaire véhicule et retourne l'URL"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Générer un ID unique pour la photo
        photo_id = str(uuid.uuid4())
        
        # Stocker la photo dans la collection photos
        photo_doc = {
            "id": photo_id,
            "tenant_id": tenant.id,
            "filename": filename,
            "data": photo_base64,
            "uploaded_by": current_user.id,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "type": "inventaire_vehicule"
        }
        
        await db.photos_inventaires.insert_one(photo_doc)
        
        # Retourner l'URL de la photo
        return {
            "photo_id": photo_id,
            "url": f"/api/{tenant_slug}/inventaires/photos/{photo_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")

@router.get("/{tenant_slug}/inventaires/photos/{photo_id}")
async def get_inventaire_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo d'inventaire par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    photo = await db.photos_inventaires.find_one({
        "id": photo_id,
        "tenant_id": tenant.id
    }, {"_id": 0})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    # Retourner la photo en base64
    from fastapi.responses import Response
    import base64
    
    # Extraire les données de l'image
    if photo['data'].startswith('data:'):
        # Format: data:image/png;base64,xxxx
        header, data = photo['data'].split(',', 1)
        mime_type = header.split(':')[1].split(';')[0]
    else:
        data = photo['data']
        mime_type = 'image/png'
    
    image_data = base64.b64decode(data)
    
    return Response(content=image_data, media_type=mime_type)

@router.get("/{tenant_slug}/prevention/photos/{photo_id}")
async def get_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une photo par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    photo = await db.photos_prevention.find_one({"id": photo_id, "tenant_id": tenant.id})
    
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    return {
        "id": photo["id"],
        "filename": photo.get("filename", "photo.jpg"),
        "data": photo["data"],
        "uploaded_at": photo.get("uploaded_at")
    }

@router.delete("/{tenant_slug}/prevention/photos/{photo_id}")
async def delete_photo(
    tenant_slug: str,
    photo_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une photo"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "photos")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.photos_prevention.delete_one({"id": photo_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    
    return {"message": "Photo supprimée avec succès"}


# ==================== ICÔNES PERSONNALISÉES ====================

@router.post("/{tenant_slug}/prevention/icones-personnalisees")
async def create_icone_personnalisee(
    tenant_slug: str,
    icone: IconePersonnaliseeCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une icône personnalisée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "icones")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    try:
        # Créer l'icône
        icone_dict = icone.dict()
        icone_dict["id"] = str(uuid.uuid4())
        icone_dict["tenant_id"] = tenant.id
        icone_dict["created_by_id"] = current_user.id
        icone_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.icones_personnalisees.insert_one(icone_dict)
        
        return clean_mongo_doc(icone_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur création icône: {str(e)}")

@router.get("/{tenant_slug}/prevention/icones-personnalisees")
async def get_icones_personnalisees(
    tenant_slug: str,
    categorie: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les icônes personnalisées d'un tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    if categorie:
        query["categorie"] = categorie
    
    icones = await db.icones_personnalisees.find(query).to_list(length=None)
    
    return [clean_mongo_doc(icone) for icone in icones]

@router.delete("/{tenant_slug}/prevention/icones-personnalisees/{icone_id}")
async def delete_icone_personnalisee(
    tenant_slug: str,
    icone_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une icône personnalisée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "icones")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.icones_personnalisees.delete_one({"id": icone_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Icône non trouvée")
    
    return {"message": "Icône supprimée avec succès"}


# ==================== INSPECTIONS VISUELLES (NOUVEAU SYSTÈME) ====================

@router.post("/{tenant_slug}/prevention/inspections-visuelles")
async def create_inspection_visuelle(
    tenant_slug: str,
    inspection: InspectionVisuelleCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection visuelle (pompiers + préventionnistes)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier que le bâtiment existe
    batiment = await db.batiments.find_one({"id": inspection.batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    inspection_dict = inspection.dict()
    inspection_dict["tenant_id"] = tenant.id
    
    # Créer l'objet InspectionVisuelle complet
    inspection_obj = InspectionVisuelle(**inspection_dict)
    
    await db.inspections_visuelles.insert_one(inspection_obj.dict())
    
    return clean_mongo_doc(inspection_obj.dict())

@router.get("/{tenant_slug}/prevention/inspections-visuelles")
async def get_inspections_visuelles(
    tenant_slug: str,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la liste des inspections visuelles avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    
    if batiment_id:
        query["batiment_id"] = batiment_id
    
    if statut:
        query["statut"] = statut
    
    if date_debut and date_fin:
        query["date_inspection"] = {"$gte": date_debut, "$lte": date_fin}
    
    inspections = await db.inspections_visuelles.find(query).sort("created_at", -1).to_list(length=None)
    
    return [clean_mongo_doc(insp) for insp in inspections]

@router.get("/{tenant_slug}/prevention/inspections-visuelles/a-valider")
async def get_inspections_a_valider(
    tenant_slug: str,
    secteur_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    Liste des inspections en attente de validation.
    Filtrable par secteur pour le préventionniste assigné.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {
        "tenant_id": tenant.id,
        "statut": "en_attente_validation"
    }
    
    # Si secteur spécifié, filtrer par bâtiments de ce secteur
    if secteur_id:
        batiments_secteur = await db.batiments.find(
            {"tenant_id": tenant.id, "secteur_id": secteur_id}
        ).to_list(1000)
        batiment_ids = [b.get("id") for b in batiments_secteur]
        query["batiment_id"] = {"$in": batiment_ids}
    
    inspections = await db.inspections_visuelles.find(query).sort("date_inspection", -1).to_list(100)
    
    # Enrichir avec les infos du bâtiment
    result = []
    for insp in inspections:
        insp_clean = clean_mongo_doc(insp)
        
        # Récupérer le bâtiment
        batiment = await db.batiments.find_one({"id": insp.get("batiment_id"), "tenant_id": tenant.id})
        if batiment:
            insp_clean["batiment"] = {
                "id": batiment.get("id"),
                "nom_etablissement": batiment.get("nom_etablissement"),
                "adresse_civique": batiment.get("adresse_civique"),
                "ville": batiment.get("ville"),
                "secteur_id": batiment.get("secteur_id")
            }
        
        # Compter les non-conformités
        nb_nc = await db.non_conformites_visuelles.count_documents({
            "inspection_id": insp.get("id"),
            "tenant_id": tenant.id
        })
        insp_clean["nb_non_conformites"] = nb_nc
        
        result.append(insp_clean)
    
    return result

@router.get("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def get_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une inspection visuelle spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    inspection = await db.inspections_visuelles.find_one({"id": inspection_id, "tenant_id": tenant.id})
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    return clean_mongo_doc(inspection)

@router.put("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def update_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    inspection_update: InspectionVisuelleUpdate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une inspection visuelle (toujours modifiable)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer l'inspection existante
    existing = await db.inspections_visuelles.find_one({"id": inspection_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Mettre à jour uniquement les champs fournis
    update_dict = {k: v for k, v in inspection_update.dict(exclude_unset=True).items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    # Calculer la durée si heure_fin est fournie
    if "heure_fin" in update_dict and existing.get("heure_debut"):
        try:
            debut = datetime.fromisoformat(f"{existing['date_inspection']}T{existing['heure_debut']}")
            fin = datetime.fromisoformat(f"{existing['date_inspection']}T{update_dict['heure_fin']}")
            update_dict["duree_minutes"] = int((fin - debut).total_seconds() / 60)
        except:
            pass
    
    result = await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    updated = await db.inspections_visuelles.find_one({"id": inspection_id})
    return clean_mongo_doc(updated)

@router.delete("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def delete_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une inspection visuelle (préventionnistes uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_delete = await user_has_module_action(tenant.id, current_user, "prevention", "supprimer", "inspections")
    if not can_delete and current_user.type_emploi != "preventionniste":
        raise HTTPException(status_code=403, detail="Seuls les préventionnistes peuvent supprimer des inspections")
    
    result = await db.inspections_visuelles.delete_one({"id": inspection_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Supprimer aussi les non-conformités associées
    await db.non_conformites_visuelles.delete_many({"inspection_id": inspection_id, "tenant_id": tenant.id})
    
    return {"message": "Inspection supprimée avec succès"}


# ==================== WORKFLOW VALIDATION INSPECTION ====================

@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/soumettre")
async def soumettre_inspection_validation(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Soumettre une inspection pour validation par le préventionniste.
    Appelé par les pompiers après avoir terminé l'inspection terrain.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Récupérer l'inspection
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Vérifier que l'inspection peut être soumise
    if inspection.get("statut") not in ["en_cours", "brouillon"]:
        raise HTTPException(
            status_code=400, 
            detail=f"L'inspection ne peut pas être soumise (statut actuel: {inspection.get('statut')})"
        )
    
    # Mettre à jour le statut
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_attente_validation",
            "date_soumission": datetime.now(timezone.utc).isoformat(),
            "soumis_par_id": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} soumise pour validation par {current_user.email}")
    
    # Récupérer l'inspection mise à jour
    updated = await db.inspections_visuelles.find_one({"id": inspection_id})
    return clean_mongo_doc(updated)


@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/valider")
async def valider_inspection(
    tenant_slug: str,
    inspection_id: str,
    commentaires: str = Body("", embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Valider une inspection.
    Si des non-conformités existent, génère automatiquement un brouillon d'avis.
    Réservé aux préventionnistes et admins.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_access = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if not can_access and not current_user.est_preventionniste:
        raise HTTPException(status_code=403, detail="Réservé aux préventionnistes")
    
    # Récupérer l'inspection
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Récupérer les non-conformités
    non_conformites = await db.non_conformites_visuelles.find({
        "inspection_id": inspection_id,
        "tenant_id": tenant.id
    }).to_list(100)
    
    # Déterminer le statut de conformité
    statut_conformite = "conforme" if len(non_conformites) == 0 else "non_conforme"
    
    # Mettre à jour l'inspection
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "validee",
            "statut_conformite": statut_conformite,
            "validee_par_id": current_user.id,
            "date_validation": datetime.now(timezone.utc).isoformat(),
            "commentaires_validation": commentaires,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} validée par {current_user.email} - {len(non_conformites)} NC")
    
    # Si non-conformités, retourner les infos pour générer l'avis
    result = {
        "inspection_id": inspection_id,
        "statut": "validee",
        "statut_conformite": statut_conformite,
        "nb_non_conformites": len(non_conformites),
        "non_conformites": [clean_mongo_doc(nc) for nc in non_conformites],
        "avis_requis": len(non_conformites) > 0,
        "message": f"Inspection validée - {len(non_conformites)} non-conformité(s) détectée(s)"
    }
    
    return result


@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/rejeter")
async def rejeter_inspection(
    tenant_slug: str,
    inspection_id: str,
    motif: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """
    Rejeter une inspection et la renvoyer au pompier pour corrections.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    # Vérifier permission RBAC ou préventionniste
    can_access = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if not can_access and not current_user.est_preventionniste:
        raise HTTPException(status_code=403, detail="Réservé aux préventionnistes")
    
    # Récupérer l'inspection
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Mettre à jour le statut
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_cours",  # Retour à "en_cours" pour permettre les modifications
            "rejete_par_id": current_user.id,
            "date_rejet": datetime.now(timezone.utc).isoformat(),
            "motif_rejet": motif,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} rejetée par {current_user.email} - Motif: {motif}")
    
    return {
        "message": "Inspection rejetée",
        "motif": motif
    }


# ==================== NON-CONFORMITÉS VISUELLES ====================

@router.post("/{tenant_slug}/prevention/non-conformites-visuelles")
async def create_non_conformite_visuelle(
    tenant_slug: str,
    nc: NonConformiteVisuelleCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle non-conformité visuelle"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc_dict = nc.dict()
    nc_dict["tenant_id"] = tenant.id
    
    # Calculer la date limite si délai fourni
    if nc_dict.get("delai_correction_jours"):
        from datetime import timedelta
        inspection = await db.inspections_visuelles.find_one({"id": nc.inspection_id})
        if inspection:
            date_insp = datetime.fromisoformat(inspection["date_inspection"])
            date_limite = date_insp + timedelta(days=nc_dict["delai_correction_jours"])
            nc_dict["date_limite"] = date_limite.strftime("%Y-%m-%d")
    
    nc_obj = NonConformiteVisuelle(**nc_dict)
    
    await db.non_conformites_visuelles.insert_one(nc_obj.dict())
    
    # Ajouter l'ID de la NC à l'inspection
    await db.inspections_visuelles.update_one(
        {"id": nc.inspection_id, "tenant_id": tenant.id},
        {"$push": {"non_conformites_ids": nc_obj.id}}
    )
    
    return clean_mongo_doc(nc_obj.dict())

@router.get("/{tenant_slug}/prevention/non-conformites-visuelles")
async def get_non_conformites_visuelles(
    tenant_slug: str,
    inspection_id: Optional[str] = None,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    gravite: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les non-conformités visuelles avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    
    if inspection_id:
        query["inspection_id"] = inspection_id
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    if gravite:
        query["gravite"] = gravite
    
    ncs = await db.non_conformites_visuelles.find(query).sort("created_at", -1).to_list(length=None)
    
    return [clean_mongo_doc(nc) for nc in ncs]

@router.put("/{tenant_slug}/prevention/non-conformites-visuelles/{nc_id}")
async def update_non_conformite_visuelle(
    tenant_slug: str,
    nc_id: str,
    statut: Optional[str] = Body(None),
    photos_resolution: Optional[List[PhotoInspection]] = Body(None),
    notes_resolution: Optional[str] = Body(None),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour le statut d'une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_dict = {"updated_at": datetime.now(timezone.utc)}
    
    if statut:
        update_dict["statut"] = statut
        if statut == "resolue":
            update_dict["date_resolution"] = datetime.now(timezone.utc)
    
    if photos_resolution:
        update_dict["photos_resolution"] = [p.dict() for p in photos_resolution]
    
    if notes_resolution:
        update_dict["notes_resolution"] = notes_resolution
    
    result = await db.non_conformites_visuelles.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated = await db.non_conformites_visuelles.find_one({"id": nc_id})
    return clean_mongo_doc(updated)


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
    
    # Récupérer tous les bâtiments
    query = {"tenant_id": tenant.id, "statut": "actif"}
    
    if niveau_risque:
        query["niveau_risque"] = niveau_risque
    
    batiments = await db.batiments.find(query).to_list(length=None)
    
    # Pour chaque bâtiment, déterminer le statut d'inspection
    map_data = []
    for bat in batiments:
        # Chercher la dernière inspection
        derniere_inspection = await db.inspections_visuelles.find_one(
            {"batiment_id": bat["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        # Déterminer le statut
        if not derniere_inspection:
            statut_insp = "a_faire"
        elif derniere_inspection["statut"] == "en_cours":
            statut_insp = "en_cours"
        elif derniere_inspection["statut_conformite"] == "non_conforme":
            statut_insp = "non_conforme"
        else:
            statut_insp = "fait_conforme"
        
        # Filtrer par statut si demandé
        if statut_inspection and statut_insp != statut_inspection:
            continue
        
        # Géocoder l'adresse si pas déjà fait (latitude/longitude manquants)
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
        
        # Appeler l'API Google Geocoding
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
            
            # Déterminer la précision
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
    
    # Vérifier permission RBAC
    await require_permission(tenant.id, current_user, "prevention", "modifier", "inspections")
    
    # Récupérer l'utilisateur
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Toggle le statut
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
    
    # Récupérer tous les utilisateurs avec est_preventionniste = true et statut actif
    preventionnistes_cursor = db.users.find({
        "tenant_id": tenant.id,
        "est_preventionniste": True,
        "statut": "Actif"
    })
    
    preventionnistes = await preventionnistes_cursor.to_list(length=None)
    
    # Pour chaque préventionniste, ajouter des statistiques
    result = []
    for prev in preventionnistes:
        # Compter les bâtiments assignés
        nb_batiments = await db.batiments.count_documents({
            "tenant_id": tenant.id,
            "preventionniste_assigne_id": prev["id"]
        })
        
        # Compter les secteurs assignés
        nb_secteurs = await db.secteurs_geographiques.count_documents({
            "tenant_id": tenant.id,
            "preventionniste_assigne_id": prev["id"]
        })
        
        # Compter les inspections ce mois
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
    
    # Vérifier que le préventionniste existe
    preventionniste = await db.users.find_one({
        "id": preventionniste_id,
        "tenant_id": tenant.id,
        "est_preventionniste": True
    })
    
    if not preventionniste:
        raise HTTPException(status_code=404, detail="Préventionniste non trouvé")
    
    # Statistiques globales
    nb_batiments = await db.batiments.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    nb_secteurs = await db.secteurs_geographiques.count_documents({
        "tenant_id": tenant.id,
        "preventionniste_assigne_id": preventionniste_id
    })
    
    # Inspections par période
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
    
    # Plans d'intervention créés
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
    
    # Nettoyer les ObjectIds pour sérialisation JSON
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
    
    # Nettoyer les ObjectIds pour sérialisation JSON
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
    
    # Vérifier permission RBAC
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    # Récupérer le bâtiment
    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Si preventionniste_id fourni, vérifier qu'il existe et est actif
    if preventionniste_id:
        preventionniste = await db.users.find_one({
            "id": preventionniste_id,
            "tenant_id": tenant.id,
            "est_preventionniste": True,
            "statut": "Actif"
        })
        if not preventionniste:
            raise HTTPException(status_code=404, detail="Préventionniste non trouvé ou inactif")
    
    # Créer l'entrée d'historique
    ancien_preventionniste_id = batiment.get("preventionniste_assigne_id")
    historique_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "ancien_preventionniste_id": ancien_preventionniste_id,
        "nouveau_preventionniste_id": preventionniste_id,
        "modifie_par": current_user.id,
        "modifie_par_nom": f"{current_user.prenom} {current_user.nom}",
        "raison": raison
    }
    
    # Mettre à jour le bâtiment
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
    
    # Créer notification pour le préventionniste
    if preventionniste_id:
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "user_id": preventionniste_id,
            "type": "assignation_batiment",
            "titre": "Nouveau bâtiment assigné",
            "message": f"Le bâtiment '{batiment.get('nom_etablissement') or batiment.get('adresse_civique')}' vous a été assigné.",
            "lue": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
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
    
    # Vérifier permission RBAC
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    # Récupérer le secteur
    secteur = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id})
    if not secteur:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    # Si preventionniste_id fourni, vérifier qu'il existe
    if preventionniste_id:
        preventionniste = await db.users.find_one({
            "id": preventionniste_id,
            "tenant_id": tenant.id,
            "est_preventionniste": True,
            "statut": "Actif"
        })
        if not preventionniste:
            raise HTTPException(status_code=404, detail="Préventionniste non trouvé ou inactif")
    
    # Mettre à jour le secteur
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
    
    # Si demandé, assigner tous les bâtiments du secteur
    if assigner_batiments:
        # Trouver tous les bâtiments dans ce secteur (géométriquement)
        # Pour simplifier, on va assigner tous les bâtiments sans preventionniste ou avec autre preventionniste
        batiments_cursor = db.batiments.find({
            "tenant_id": tenant.id,
            "latitude": {"$ne": None},
            "longitude": {"$ne": None}
        })
        
        batiments = await batiments_cursor.to_list(length=None)
        
        # Pour chaque bâtiment, vérifier s'il est dans le polygone du secteur
        from shapely.geometry import Point, shape
        
        secteur_polygon = shape(secteur["geometry"])
        
        for batiment in batiments:
            if batiment.get("latitude") and batiment.get("longitude"):
                point = Point(batiment["longitude"], batiment["latitude"])
                
                if secteur_polygon.contains(point):
                    # Créer l'entrée d'historique
                    ancien_preventionniste_id = batiment.get("preventionniste_assigne_id")
                    historique_entry = {
                        "date": datetime.now(timezone.utc).isoformat(),
                        "ancien_preventionniste_id": ancien_preventionniste_id,
                        "nouveau_preventionniste_id": preventionniste_id,
                        "modifie_par": current_user.id,
                        "modifie_par_nom": f"{current_user.prenom} {current_user.nom}",
                        "raison": f"Assignation automatique via secteur '{secteur['nom']}'"
                    }
                    
                    # Mettre à jour le bâtiment
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
    
    # Créer notification pour le préventionniste
    if preventionniste_id:
        notification = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "user_id": preventionniste_id,
            "type": "assignation_secteur",
            "titre": "Nouveau secteur assigné",
            "message": f"Le secteur '{secteur['nom']}' vous a été assigné" + (f" avec {nb_batiments_assignes} bâtiments." if assigner_batiments else "."),
            "lue": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
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
    
    # Vérifier permission RBAC
    await require_permission(tenant.id, current_user, "prevention", "modifier", "parametres")
    
    # Valider les valeurs
    if recurrence_inspections not in [1, 2, 3, 4, 5]:
        raise HTTPException(status_code=400, detail="La récurrence doit être entre 1 et 5 ans")
    
    if nombre_visites_requises not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Le nombre de visites doit être entre 1 et 3")
    
    # Si superviseur fourni, vérifier qu'il existe
    if superviseur_prevention_id:
        superviseur = await db.users.find_one({
            "id": superviseur_prevention_id,
            "tenant_id": tenant.id
        })
        if not superviseur:
            raise HTTPException(status_code=404, detail="Superviseur non trouvé")
    
    # Mettre à jour les paramètres du tenant
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


# ==================== PLANS D'INTERVENTION ====================
# Routes déplacées vers prevention_plans.py


# ==================== STATISTIQUES, RAPPORTS, EXPORTS, NOTIFICATIONS ====================
# Routes déplacées vers prevention_reports.py
