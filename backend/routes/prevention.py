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
from io import StringIO
from datetime import timedelta

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
    Batiment, BatimentCreate, BatimentPhotoUpload,
    DependanceBatiment, DependanceCreate, DependanceUpdate,
    GrilleInspection, GrilleInspectionCreate,
    Inspection, InspectionCreate,
    PhotoBatiment,
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


@router.put("/{tenant_slug}/prevention/batiments/{batiment_id}/photos/reorder")
async def reorder_photos_batiment(
    tenant_slug: str,
    batiment_id: str,
    body: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Met a jour l'ordre et les legendes des photos d'un batiment."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "batiments")

    batiment = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id}, {"_id": 0})
    if not batiment:
        raise HTTPException(status_code=404, detail="Batiment non trouve")

    photos_update = body.get("photos", [])
    existing_photos = batiment.get("photos", [])

    # Rebuild ordered photos array
    photos_by_id = {p["id"]: p for p in existing_photos}
    new_photos = []
    for item in photos_update:
        pid = item.get("id")
        if pid in photos_by_id:
            photo = photos_by_id[pid]
            if "legende" in item:
                photo["legende"] = item["legende"]
            new_photos.append(photo)

    # Append any photos not in the update list (safety)
    seen_ids = {p["id"] for p in new_photos}
    for p in existing_photos:
        if p["id"] not in seen_ids:
            new_photos.append(p)

    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {"photos": new_photos, "updated_at": datetime.now(timezone.utc)}}
    )

    return {"success": True, "photos_count": len(new_photos)}


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
# Routes déplacées vers prevention_nc.py

# ==================== UPLOAD PHOTOS, ICÔNES PERSONNALISÉES ====================
# Routes déplacées vers prevention_media.py

# ==================== INSPECTIONS VISUELLES, WORKFLOW, NC VISUELLES ====================
# Routes déplacées vers prevention_inspections_visuelles.py

# ==================== CARTE, PRÉVENTIONNISTES, PARAMÈTRES ====================
# Routes déplacées vers prevention_config.py

# ==================== PLANS D'INTERVENTION ====================
# Routes déplacées vers prevention_plans.py


# ==================== STATISTIQUES, RAPPORTS, EXPORTS, NOTIFICATIONS ====================
# Routes déplacées vers prevention_reports.py
