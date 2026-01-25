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

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import csv
from io import StringIO

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Prévention"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class Batiment(BaseModel):
    """Fiche d'établissement/bâtiment pour les inspections de prévention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""
    valeur_fonciere: Optional[str] = ""
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    locataire_nom: str = ""
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    groupe_occupation: str = ""
    sous_groupe: str = ""
    description_activite: str = ""
    niveau_risque: str = ""
    risques: List[str] = []
    risques_identifies: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = ""
    statut: str = "actif"
    notes_generales: str = ""
    notes: str = ""
    preventionniste_assigne_id: Optional[str] = None
    historique_assignations: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BatimentCreate(BaseModel):
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""
    valeur_fonciere: Optional[str] = ""
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    locataire_nom: str = ""
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    groupe_occupation: str = ""
    sous_groupe: str = ""
    description_activite: str = ""
    niveau_risque: str = ""
    risques: List[str] = []
    risques_identifies: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = ""
    statut: str = "actif"
    notes_generales: str = ""
    notes: str = ""
    preventionniste_assigne_id: Optional[str] = None


class SecteurGeographique(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    couleur: str = "#3B82F6"
    coordonnees: List[Dict[str, float]] = []
    preventionniste_assigne_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SecteurGeographiqueCreate(BaseModel):
    nom: str
    description: str = ""
    couleur: str = "#3B82F6"
    coordonnees: List[Dict[str, float]] = []
    preventionniste_assigne_id: Optional[str] = None


class GrilleInspection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    sections: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GrilleInspectionCreate(BaseModel):
    nom: str
    description: str = ""
    sections: List[Dict[str, Any]] = []


class Inspection(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    grille_id: str = ""
    preventionniste_id: str
    preventionniste_nom: str = ""
    date_inspection: str
    type_inspection: str = "routine"
    statut: str = "planifiee"
    resultats: List[Dict[str, Any]] = []
    photos: List[str] = []
    anomalies: List[Dict[str, Any]] = []
    recommandations: str = ""
    notes: str = ""
    signature_preventionniste: str = ""
    signature_responsable: str = ""
    date_signature_responsable: str = ""
    prochaine_inspection: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionCreate(BaseModel):
    batiment_id: str
    grille_id: str = ""
    preventionniste_id: str
    preventionniste_nom: str = ""
    date_inspection: str
    type_inspection: str = "routine"
    statut: str = "planifiee"
    resultats: List[Dict[str, Any]] = []
    photos: List[str] = []
    anomalies: List[Dict[str, Any]] = []
    recommandations: str = ""
    notes: str = ""
    signature_preventionniste: str = ""
    signature_responsable: str = ""
    date_signature_responsable: str = ""
    prochaine_inspection: str = ""


# ==================== DONNÉES DE RÉFÉRENCE ====================

CATEGORIES_NR24_27 = {
    "A": {
        "nom": "Établissements de réunion",
        "sous_groupes": {
            "A-1": "Destinés à la production et à la présentation d'arts du spectacle",
            "A-2": "Qui ne figurent dans aucune autre division du groupe A",
            "A-3": "De type aréna",
            "A-4": "Où les occupants sont rassemblés en plein air"
        }
    },
    "B": {
        "nom": "Établissements de détention, soins, traitement et habitations supervisées",
        "sous_groupes": {
            "B-1": "Établissements de détention",
            "B-2": "Établissements de traitement",
            "B-3": "Établissements de soins",
            "B-4": "Établissements de soins de type résidentiel"
        }
    },
    "C": {"nom": "Habitations", "sous_groupes": {}},
    "D": {"nom": "Établissements d'affaires", "sous_groupes": {}},
    "E": {"nom": "Établissements commerciaux", "sous_groupes": {}},
    "F": {
        "nom": "Établissements industriels",
        "sous_groupes": {
            "F-1": "À risques très élevés",
            "F-2": "À risques moyens",
            "F-3": "À risques faibles"
        }
    },
    "G": {
        "nom": "Établissements agricoles",
        "sous_groupes": {
            "G-1": "À risques très élevés",
            "G-2": "Qui ne figurent dans aucune autre division du groupe G",
            "G-3": "Abritant des serres",
            "G-4": "Sans occupation humaine"
        }
    }
}

RISQUES_GUIDE_PLANIFICATION = {
    "incendies": ["Incendie", "Conflagration"],
    "matieres": [
        "Matières dangereuses", "Matières hautement inflammables",
        "Matières très toxiques", "Matières combustibles", "Produits chimiques"
    ],
    "infrastructure": [
        "Explosion", "Défaillances des systèmes de sécurité incendie",
        "Matériaux de construction douteux"
    ],
    "naturels": ["Inondation", "Tremblement de terre", "Tempête de verglas"],
    "humains": ["Négligence", "Acte criminel", "Occupation illégale"]
}

NIVEAUX_RISQUE = [
    {"id": "faible", "nom": "Faible", "couleur": "#22C55E", "description": "Risque minimal"},
    {"id": "moyen", "nom": "Moyen", "couleur": "#F59E0B", "description": "Risque modéré"},
    {"id": "eleve", "nom": "Élevé", "couleur": "#EF4444", "description": "Risque important"},
    {"id": "tres_eleve", "nom": "Très élevé", "couleur": "#7C3AED", "description": "Risque critique"}
]


# ==================== ROUTES RÉFÉRENCES ====================

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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    inspection_obj = Inspection(tenant_id=tenant.id, **inspection.dict())
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    """Récupérer toutes les grilles d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    grilles = await db.grilles_inspection.find(
        {"tenant_id": tenant.id},
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
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
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.secteurs_geographiques.find_one({"id": secteur_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Secteur non trouvé")
    
    await db.secteurs_geographiques.delete_one({"id": secteur_id, "tenant_id": tenant.id})
    
    return {"message": "Secteur supprimé avec succès"}
