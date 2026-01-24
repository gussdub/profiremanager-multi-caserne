"""
Routes API pour le module Actifs (Véhicules, Bornes d'incendie, Inventaires)
============================================================================

STATUT: ACTIF
Ce module gère les actifs de la caserne : véhicules, bornes d'incendie, inventaires,
rondes de sécurité SAAQ, et QR codes.

Routes:
Véhicules:
- GET    /{tenant_slug}/actifs/vehicules                        - Liste des véhicules
- GET    /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Détail véhicule
- GET    /{tenant_slug}/actifs/vehicules/{vehicule_id}/public   - Info publique (QR)
- POST   /{tenant_slug}/actifs/vehicules                        - Créer véhicule
- PUT    /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Modifier véhicule
- DELETE /{tenant_slug}/actifs/vehicules/{vehicule_id}          - Supprimer véhicule
- POST   /{tenant_slug}/actifs/vehicules/{vehicle_id}/qr-code   - Générer QR code
- POST   /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspection-saaq - Inspection SAAQ
- GET    /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspections     - Historique inspections
- GET    /{tenant_slug}/actifs/vehicules/{vehicle_id}/fiche-vie       - Fiche de vie

Bornes d'incendie:
- GET    /{tenant_slug}/actifs/bornes                           - Liste des bornes
- GET    /{tenant_slug}/actifs/bornes/{borne_id}                - Détail borne
- POST   /{tenant_slug}/actifs/bornes                           - Créer borne
- PUT    /{tenant_slug}/actifs/bornes/{borne_id}                - Modifier borne
- DELETE /{tenant_slug}/actifs/bornes/{borne_id}                - Supprimer borne
- POST   /{tenant_slug}/actifs/bornes/{borne_id}/qr-code        - Générer QR code
- POST   /{tenant_slug}/actifs/bornes/import-inspections        - Importer inspections CSV

Inventaires:
- GET/POST/PUT/DELETE /{tenant_slug}/actifs/inventaires/modeles/*    - Modèles d'inventaire
- GET/POST/PUT/DELETE /{tenant_slug}/actifs/inventaires/inspections/* - Inspections

Rondes de sécurité:
- GET/POST /{tenant_slug}/actifs/rondes-securite/*              - Rondes SAAQ
- POST /{tenant_slug}/actifs/rondes-securite/{id}/contre-signer - Contre-signature

Matériels:
- GET    /{tenant_slug}/actifs/materiels                        - Liste matériels pour interventions

Paramètres:
- GET/PUT /{tenant_slug}/actifs/parametres                      - Paramètres du module
- GET/PUT /{tenant_slug}/actifs/configuration-emails-rondes     - Config emails rondes
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import os
import qrcode
import base64
import csv
from io import BytesIO, StringIO

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Actifs"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES - VÉHICULES ====================

class LocalisationGPS(BaseModel):
    lat: float
    lng: float


class Vehicule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: str = "actif"
    date_mise_service: Optional[str] = None
    modele_inventaire_id: Optional[str] = None
    photos: List[str] = []
    documents: List[Dict[str, str]] = []
    notes: Optional[str] = None
    derniere_inspection_id: Optional[str] = None
    derniere_inspection_date: Optional[str] = None
    qr_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    logs: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class VehiculeCreate(BaseModel):
    nom: str
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: str = "actif"
    date_mise_service: Optional[str] = None
    photos: List[str] = []
    documents: List[Dict[str, str]] = []
    notes: Optional[str] = None


class VehiculeUpdate(BaseModel):
    nom: Optional[str] = None
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: Optional[str] = None
    date_mise_service: Optional[str] = None
    modele_inventaire_id: Optional[str] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[Dict[str, str]]] = None
    notes: Optional[str] = None


# ==================== MODÈLES - BORNES D'INCENDIE ====================

class BorneIncendie(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    type_borne: str
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: str = "operationnelle"
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: List[str] = []
    schemas: List[str] = []
    notes_importantes: Optional[str] = None
    qr_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    logs: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BorneIncendieCreate(BaseModel):
    nom: str
    type_borne: str
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: str = "operationnelle"
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: List[str] = []
    schemas: List[str] = []
    notes_importantes: Optional[str] = None


class BorneIncendieUpdate(BaseModel):
    nom: Optional[str] = None
    type_borne: Optional[str] = None
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: Optional[str] = None
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: Optional[List[str]] = None
    schemas: Optional[List[str]] = None
    notes_importantes: Optional[str] = None


# ==================== MODÈLES - INVENTAIRES ====================

class ItemInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    type_item: str = "checkbox"
    obligatoire: bool = False
    ordre: int = 0


class SectionInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    description: Optional[str] = None
    photos_reference: List[str] = []
    items: List[ItemInventaire] = []
    ordre: int = 0


class ModeleInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: List[SectionInventaire] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ModeleInventaireCreate(BaseModel):
    nom: str
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: List[SectionInventaire] = []


class ModeleInventaireUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: Optional[List[SectionInventaire]] = None


class ResultatItemInspection(BaseModel):
    item_id: str
    section_id: str
    statut: str
    notes: Optional[str] = None
    photo_url: Optional[str] = None


class InspectionInventaire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str
    inspecteur_nom: Optional[str] = None
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str = "en_cours"
    resultats: List[ResultatItemInspection] = []
    notes_generales: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None


class InspectionInventaireCreate(BaseModel):
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str


class InspectionInventaireUpdate(BaseModel):
    statut: Optional[str] = None
    resultats: Optional[List[ResultatItemInspection]] = None
    notes_generales: Optional[str] = None


# ==================== MODÈLES - INSPECTION SAAQ ====================

class DefectDetail(BaseModel):
    item: str
    severity: str
    description: str
    photo_url: Optional[str] = None
    reported_by: str
    reported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


class InspectionSAAQ(BaseModel):
    id: str = Field(default_factory=lambda: f"insp_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    vehicle_id: str
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    signature_certify: bool = False
    signature_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signature_gps: Optional[List[float]] = None
    inspection_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    checklist: Dict[str, Any] = Field(default_factory=dict)
    defects: List[DefectDetail] = []
    has_major_defect: bool = False
    photo_urls: List[str] = []
    passed: bool = True
    comments: Optional[str] = None
    synced: bool = False
    created_offline: bool = False
    device_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionSAAQCreate(BaseModel):
    vehicle_id: str
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    signature_certify: bool
    signature_gps: Optional[List[float]] = None
    checklist: Dict[str, Any]
    defects: List[DefectDetail] = []
    photo_urls: List[str] = []
    comments: Optional[str] = None
    device_id: Optional[str] = None


class AuditLogEntry(BaseModel):
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str
    user_name: str
    action: str
    details: Optional[str] = None
    gps: Optional[List[float]] = None


# ==================== MODÈLES - RONDES DE SÉCURITÉ ====================

class ContreSignature(BaseModel):
    nom_conducteur: str
    prenom_conducteur: str
    signature: str
    date_contre_signature: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: Optional[str] = None


class RondeSecuriteCreate(BaseModel):
    vehicule_id: str
    date: str
    heure: str
    lieu: str
    position_gps: Optional[List[float]] = None
    km: int
    personne_mandatee: str
    defectuosites: Optional[str] = ""
    points_verification: Dict[str, str]
    signature_mandatee: str


class RondeSecurite(BaseModel):
    id: str = Field(default_factory=lambda: f"ronde_{str(uuid.uuid4())[:12]}")
    tenant_id: str
    vehicule_id: str
    date: str
    heure: str
    lieu: str
    position_gps: Optional[List[float]] = None
    km: int
    personne_mandatee: str
    defectuosites: Optional[str] = ""
    points_verification: Dict[str, str]
    signature_mandatee: str
    contre_signatures: List[ContreSignature] = []
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContreSignatureCreate(BaseModel):
    nom_conducteur: str
    prenom_conducteur: str
    signature: str
    raison_refus: Optional[str] = None


# ==================== ROUTES - VÉHICULES ====================

@router.get("/{tenant_slug}/actifs/vehicules", response_model=List[Vehicule])
async def get_vehicules(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste de tous les véhicules du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicules = await db.vehicules.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return vehicules


@router.get("/{tenant_slug}/actifs/vehicules/{vehicule_id}/public")
async def get_vehicule_public(tenant_slug: str, vehicule_id: str):
    """Récupère les informations publiques d'un véhicule (pour QR code) - Sans authentification"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0, "nom": 1, "type_vehicule": 1, "marque": 1, "modele": 1, "numero_plaque": 1, "id": 1}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return vehicule


@router.get("/{tenant_slug}/actifs/vehicules/{vehicule_id}", response_model=Vehicule)
async def get_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un véhicule spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return vehicule


@router.post("/{tenant_slug}/actifs/vehicules", response_model=Vehicule)
async def create_vehicule(
    tenant_slug: str,
    vehicule_data: VehiculeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    vehicule = Vehicule(
        tenant_id=tenant.id,
        **vehicule_data.dict()
    )
    
    log_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "user_id": current_user.id,
        "user_name": f"{current_user.prenom} {current_user.nom}",
        "action": "created",
        "details": f"Véhicule {vehicule.nom} créé",
        "gps": None
    }
    vehicule.logs = [log_entry]
    
    await db.vehicules.insert_one(vehicule.dict())
    
    return vehicule


@router.put("/{tenant_slug}/actifs/vehicules/{vehicule_id}", response_model=Vehicule)
async def update_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    vehicule_data: VehiculeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id}
    )
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    update_data = {k: v for k, v in vehicule_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.vehicules.update_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_vehicule


@router.delete("/{tenant_slug}/actifs/vehicules/{vehicule_id}")
async def delete_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id}
    )
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    await db.vehicules.delete_one({"id": vehicule_id, "tenant_id": tenant.id})
    
    return {"message": "Véhicule supprimé avec succès"}


@router.post("/{tenant_slug}/actifs/vehicules/{vehicle_id}/qr-code")
async def generate_vehicle_qr_code(
    tenant_slug: str,
    vehicle_id: str,
    current_user: User = Depends(get_current_user)
):
    """Génère un QR code pour un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    vehicle_url = f"{frontend_url}/qr/{tenant_slug}/vehicule/{vehicle_id}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(vehicle_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    qr_code_data_url = f"data:image/png;base64,{img_base64}"
    
    await db.vehicules.update_one(
        {"id": vehicle_id},
        {"$set": {
            "qr_code": qr_code_data_url,
            "qr_code_url": vehicle_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "qr_code": qr_code_data_url,
        "qr_code_url": vehicle_url,
        "message": "QR code généré avec succès"
    }


@router.post("/{tenant_slug}/actifs/vehicules/{vehicle_id}/inspection-saaq")
async def create_inspection_saaq(
    tenant_slug: str,
    vehicle_id: str,
    inspection_data: InspectionSAAQCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection SAAQ (Ronde de sécurité)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    inspection = InspectionSAAQ(
        tenant_id=tenant.id,
        vehicle_id=vehicle_id,
        inspector_id=inspection_data.inspector_id,
        inspector_name=inspection_data.inspector_name,
        inspector_matricule=inspection_data.inspector_matricule,
        signature_certify=inspection_data.signature_certify,
        signature_gps=inspection_data.signature_gps,
        checklist=inspection_data.checklist,
        defects=inspection_data.defects,
        photo_urls=inspection_data.photo_urls,
        comments=inspection_data.comments,
        device_id=inspection_data.device_id
    )
    
    has_major = any(defect.severity == "majeure" for defect in inspection.defects)
    
    inspection.has_major_defect = has_major
    inspection.passed = not has_major
    
    await db.inspections_saaq.insert_one(inspection.dict())
    
    if has_major:
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$set": {
                "statut": "maintenance",
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        log_entry = AuditLogEntry(
            user_id=current_user.id,
            user_name=f"{current_user.prenom} {current_user.nom}",
            action="inspection_defaut_majeur",
            details="Inspection SAAQ - Défaut majeur détecté. Véhicule mis hors service.",
            gps=inspection_data.signature_gps
        )
        
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$push": {"logs": log_entry.dict()}}
        )
    else:
        log_entry = AuditLogEntry(
            user_id=current_user.id,
            user_name=f"{current_user.prenom} {current_user.nom}",
            action="inspection_passed",
            details="Inspection SAAQ réussie - Aucun défaut majeur",
            gps=inspection_data.signature_gps
        )
        
        await db.vehicules.update_one(
            {"id": vehicle_id},
            {"$push": {"logs": log_entry.dict()}}
        )
    
    await db.vehicules.update_one(
        {"id": vehicle_id},
        {"$set": {
            "derniere_inspection_id": inspection.id,
            "derniere_inspection_date": inspection.inspection_date.isoformat()
        }}
    )
    
    return {
        "message": "Inspection créée avec succès",
        "inspection_id": inspection.id,
        "vehicle_status": "maintenance" if has_major else "actif",
        "passed": inspection.passed
    }


@router.get("/{tenant_slug}/actifs/vehicules/{vehicle_id}/inspections")
async def get_vehicle_inspections(
    tenant_slug: str,
    vehicle_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique des inspections d'un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    inspections = await db.inspections_saaq.find(
        {"vehicle_id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("inspection_date", -1).limit(limit).to_list(limit)
    
    return inspections


@router.get("/{tenant_slug}/actifs/vehicules/{vehicle_id}/fiche-vie")
async def get_vehicle_lifecycle(
    tenant_slug: str,
    vehicle_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la fiche de vie complète d'un véhicule (audit trail)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": vehicle_id, "tenant_id": tenant.id},
        {"_id": 0, "logs": 1, "nom": 1, "type_vehicule": 1, "created_at": 1}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    return {
        "vehicle_id": vehicle_id,
        "vehicle_name": vehicle.get("nom", ""),
        "vehicle_type": vehicle.get("type_vehicule", ""),
        "created_at": vehicle.get("created_at"),
        "logs": vehicle.get("logs", [])
    }


# ==================== ROUTES - MATÉRIELS POUR INTERVENTIONS ====================

@router.get("/{tenant_slug}/actifs/materiels")
async def get_materiels_pour_interventions(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la liste des équipements/matériels pour utilisation dans les interventions."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    equipements = await db.equipements.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("nom", 1).to_list(10000)
    
    materiels = []
    for eq in equipements:
        materiel = {
            "id": eq.get("id"),
            "nom": eq.get("nom", ""),
            "designation": eq.get("nom", ""),
            "type": eq.get("categorie_nom", ""),
            "categorie": eq.get("categorie_nom", ""),
            "numero_serie": eq.get("code_unique", ""),
            "code_unique": eq.get("code_unique", ""),
            "etat": eq.get("etat", "bon"),
            "quantite": eq.get("quantite", 1),
            "quantite_disponible": eq.get("quantite", 1),
            "gerer_quantite": eq.get("gerer_quantite", False),
            "est_consommable": eq.get("gerer_quantite", False),
            "emplacement_nom": eq.get("emplacement_nom", ""),
            "vehicule_nom": eq.get("vehicule_nom", ""),
            "description": eq.get("description", ""),
        }
        materiels.append(materiel)
    
    return materiels


# ==================== ROUTES - BORNES D'INCENDIE ====================

@router.get("/{tenant_slug}/actifs/bornes", response_model=List[BorneIncendie])
async def get_bornes(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste de toutes les bornes d'incendie du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    bornes = await db.bornes_incendie.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return bornes


@router.get("/{tenant_slug}/actifs/bornes/{borne_id}", response_model=BorneIncendie)
async def get_borne(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une borne d'incendie spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    return borne


@router.post("/{tenant_slug}/actifs/bornes", response_model=BorneIncendie)
async def create_borne(
    tenant_slug: str,
    borne_data: BorneIncendieCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    borne = BorneIncendie(
        tenant_id=tenant.id,
        **borne_data.dict()
    )
    
    log_entry = {
        "date": datetime.now(timezone.utc).isoformat(),
        "user_id": current_user.id,
        "user_name": f"{current_user.prenom} {current_user.nom}",
        "action": "created",
        "details": f"Borne {borne.nom} créée",
        "gps": borne.localisation_gps.dict() if borne.localisation_gps else None
    }
    borne.logs = [log_entry]
    
    await db.bornes_incendie.insert_one(borne.dict())
    
    return borne


@router.put("/{tenant_slug}/actifs/bornes/{borne_id}", response_model=BorneIncendie)
async def update_borne(
    tenant_slug: str,
    borne_id: str,
    borne_data: BorneIncendieUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    update_data = {k: v for k, v in borne_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.bornes_incendie.update_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_borne


@router.delete("/{tenant_slug}/actifs/bornes/{borne_id}")
async def delete_borne(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne d'incendie non trouvée")
    
    await db.bornes_incendie.delete_one({"id": borne_id, "tenant_id": tenant.id})
    
    return {"message": "Borne d'incendie supprimée avec succès"}


@router.post("/{tenant_slug}/actifs/bornes/{borne_id}/qr-code")
async def generate_borne_qr_code(
    tenant_slug: str,
    borne_id: str,
    current_user: User = Depends(get_current_user)
):
    """Génère un QR code pour une borne d'incendie"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    borne = await db.bornes_incendie.find_one(
        {"id": borne_id, "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne non trouvée")
    
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    borne_url = f"{frontend_url}/{tenant_slug}/actifs/bornes/{borne_id}"
    
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(borne_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    qr_code_data_url = f"data:image/png;base64,{img_base64}"
    
    await db.bornes_incendie.update_one(
        {"id": borne_id},
        {"$set": {
            "qr_code": qr_code_data_url,
            "qr_code_url": borne_url,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "qr_code": qr_code_data_url,
        "qr_code_url": borne_url,
        "message": "QR code généré avec succès"
    }


@router.post("/{tenant_slug}/actifs/bornes/import-inspections")
async def import_inspections_bornes(
    tenant_slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Importer des inspections de bornes fontaines depuis un fichier CSV"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
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
            numero_borne = row.get('numero_borne', '').strip()
            date_inspection = row.get('date_inspection', '').strip()
            debit_gpm = row.get('debit_gpm', '').strip()
            etat = row.get('etat', 'conforme').strip()
            observations = row.get('observations', '').strip()
            
            if not numero_borne or not date_inspection:
                errors += 1
                error_details.append("Ligne ignorée: numero_borne ou date_inspection manquant")
                continue
            
            borne = await db.bornes_incendie.find_one({
                "tenant_id": tenant.id,
                "nom": numero_borne
            })
            
            if not borne:
                errors += 1
                error_details.append(f"Borne {numero_borne} non trouvée")
                continue
            
            inspection = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant.id,
                "borne_id": borne['id'],
                "numero_borne": numero_borne,
                "date_inspection": date_inspection,
                "debit_mesure_gpm": float(debit_gpm) if debit_gpm else None,
                "etat_general": etat,
                "observations": observations,
                "inspecteur_id": current_user.id,
                "inspecteur_nom": f"{current_user.prenom} {current_user.nom}",
                "source": "import_csv",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.inspections_bornes.insert_one(inspection)
            
            await db.bornes_incendie.update_one(
                {"id": borne['id']},
                {"$set": {
                    "date_derniere_inspection": date_inspection,
                    "dernier_etat_inspection": etat,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }}
            )
            
            imported += 1
            
        except Exception as e:
            errors += 1
            error_details.append(f"Erreur ligne {csv_reader.line_num}: {str(e)}")
            continue
    
    return {
        "imported": imported,
        "errors": errors,
        "error_details": error_details[:10],
        "message": f"{imported} inspection(s) importée(s), {errors} erreur(s)"
    }


# ==================== ROUTES - INVENTAIRES ====================

@router.get("/{tenant_slug}/actifs/inventaires/modeles", response_model=List[ModeleInventaire])
async def get_modeles_inventaire(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère la liste des modèles d'inventaire du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    modeles = await db.modeles_inventaire.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return modeles


@router.get("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}", response_model=ModeleInventaire)
async def get_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un modèle d'inventaire spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    return modele


@router.post("/{tenant_slug}/actifs/inventaires/modeles", response_model=ModeleInventaire)
async def create_modele_inventaire(
    tenant_slug: str,
    modele_data: ModeleInventaireCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    modele = ModeleInventaire(
        tenant_id=tenant.id,
        **modele_data.dict()
    )
    
    await db.modeles_inventaire.insert_one(modele.dict())
    
    return modele


@router.put("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}", response_model=ModeleInventaire)
async def update_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    modele_data: ModeleInventaireUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    update_data = {k: v for k, v in modele_data.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.modeles_inventaire.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_modele


@router.delete("/{tenant_slug}/actifs/inventaires/modeles/{modele_id}")
async def delete_modele_inventaire(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un modèle d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    modele = await db.modeles_inventaire.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    vehicules_utilisant = await db.vehicules.count_documents({
        "tenant_id": tenant.id,
        "modele_inventaire_id": modele_id
    })
    
    if vehicules_utilisant > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Ce modèle est utilisé par {vehicules_utilisant} véhicule(s) et ne peut pas être supprimé"
        )
    
    await db.modeles_inventaire.delete_one({"id": modele_id, "tenant_id": tenant.id})
    
    return {"message": "Modèle d'inventaire supprimé avec succès"}


# ==================== ROUTES - INSPECTIONS INVENTAIRE ====================

@router.get("/{tenant_slug}/actifs/inventaires/inspections", response_model=List[InspectionInventaire])
async def get_inspections_inventaire(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère la liste des inspections d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    query = {"tenant_id": tenant.id}
    
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    
    if current_user.role == "employe":
        query["inspecteur_id"] = current_user.id
    
    inspections = await db.inspections_inventaire.find(
        query,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=None)
    
    return inspections


@router.get("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}", response_model=InspectionInventaire)
async def get_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère une inspection d'inventaire spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    if current_user.role == "employe" and inspection["inspecteur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    return inspection


@router.post("/{tenant_slug}/actifs/inventaires/inspections", response_model=InspectionInventaire)
async def create_inspection_inventaire(
    tenant_slug: str,
    inspection_data: InspectionInventaireCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicule = await db.vehicules.find_one({
        "id": inspection_data.vehicule_id,
        "tenant_id": tenant.id
    })
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    modele = await db.modeles_inventaire.find_one({
        "id": inspection_data.modele_inventaire_id,
        "tenant_id": tenant.id
    })
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    inspecteur = await db.users.find_one({"id": inspection_data.inspecteur_id})
    inspecteur_nom = f"{inspecteur.get('prenom', '')} {inspecteur.get('nom', '')}".strip() if inspecteur else None
    
    inspection = InspectionInventaire(
        tenant_id=tenant.id,
        inspecteur_nom=inspecteur_nom,
        **inspection_data.dict()
    )
    
    await db.inspections_inventaire.insert_one(inspection.dict())
    
    return inspection


@router.put("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}", response_model=InspectionInventaire)
async def update_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    inspection_data: InspectionInventaireUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id}
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    if current_user.role == "employe" and inspection["inspecteur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    update_data = {k: v for k, v in inspection_data.dict(exclude_unset=True).items() if v is not None}
    
    if inspection_data.statut == "complete" and inspection.get("statut") != "complete":
        update_data["completed_at"] = datetime.now(timezone.utc)
    
    await db.inspections_inventaire.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return updated_inspection


@router.delete("/{tenant_slug}/actifs/inventaires/inspections/{inspection_id}")
async def delete_inspection_inventaire(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une inspection d'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Permissions insuffisantes")
    
    inspection = await db.inspections_inventaire.find_one(
        {"id": inspection_id, "tenant_id": tenant.id}
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    await db.inspections_inventaire.delete_one({"id": inspection_id, "tenant_id": tenant.id})
    
    return {"message": "Inspection supprimée avec succès"}


# ==================== ROUTES - RONDES DE SÉCURITÉ ====================

@router.post("/{tenant_slug}/actifs/rondes-securite", response_model=RondeSecurite)
async def create_ronde_securite(
    tenant_slug: str,
    ronde_data: RondeSecuriteCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle ronde de sécurité SAAQ pour un véhicule"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    vehicle = await db.vehicules.find_one(
        {"id": ronde_data.vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    ronde = RondeSecurite(
        tenant_id=tenant.id,
        vehicule_id=ronde_data.vehicule_id,
        date=ronde_data.date,
        heure=ronde_data.heure,
        lieu=ronde_data.lieu,
        position_gps=ronde_data.position_gps,
        km=ronde_data.km,
        personne_mandatee=ronde_data.personne_mandatee,
        defectuosites=ronde_data.defectuosites,
        points_verification=ronde_data.points_verification,
        signature_mandatee=ronde_data.signature_mandatee,
        contre_signatures=[],
        created_by=current_user.id
    )
    
    await db.rondes_securite.insert_one(ronde.dict())
    
    await db.vehicules.update_one(
        {"id": ronde_data.vehicule_id},
        {"$set": {"derniere_inspection_date": ronde_data.date}}
    )
    
    # Envoi d'email en arrière-plan (géré par server.py pour l'instant)
    
    return ronde


@router.get("/{tenant_slug}/actifs/rondes-securite", response_model=List[RondeSecurite])
async def get_rondes_securite(
    tenant_slug: str,
    vehicule_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    query = {"tenant_id": tenant.id}
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    
    rondes = await db.rondes_securite.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return rondes


@router.get("/{tenant_slug}/actifs/rondes-securite/{ronde_id}", response_model=RondeSecurite)
async def get_ronde_securite_by_id(
    tenant_slug: str,
    ronde_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une ronde de sécurité spécifique par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    ronde = await db.rondes_securite.find_one(
        {"id": ronde_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not ronde:
        raise HTTPException(status_code=404, detail="Ronde de sécurité non trouvée")
    
    return ronde


@router.post("/{tenant_slug}/actifs/rondes-securite/{ronde_id}/contre-signer")
async def contre_signer_ronde(
    tenant_slug: str,
    ronde_id: str,
    contre_signature_data: ContreSignatureCreate,
    current_user: User = Depends(get_current_user)
):
    """Contre-signer une ronde de sécurité existante (dans les 24h)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    ronde = await db.rondes_securite.find_one(
        {"id": ronde_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not ronde:
        raise HTTPException(status_code=404, detail="Ronde de sécurité non trouvée")
    
    ronde_datetime = datetime.fromisoformat(f"{ronde['date']}T{ronde['heure']}")
    now = datetime.now()
    time_elapsed = now - ronde_datetime
    
    if time_elapsed > timedelta(hours=24):
        raise HTTPException(
            status_code=400, 
            detail=f"Cette ronde a expiré (effectuée il y a {int(time_elapsed.total_seconds() / 3600)}h). Vous devez créer une nouvelle ronde."
        )
    
    nom_complet_actuel = f"{contre_signature_data.prenom_conducteur} {contre_signature_data.nom_conducteur}"
    if nom_complet_actuel.lower().strip() == ronde['personne_mandatee'].lower().strip():
        raise HTTPException(
            status_code=400,
            detail="Vous êtes la personne qui a effectué cette ronde. Pas besoin de contre-signer."
        )
    
    contre_signature = ContreSignature(
        nom_conducteur=contre_signature_data.nom_conducteur,
        prenom_conducteur=contre_signature_data.prenom_conducteur,
        signature=contre_signature_data.signature,
        user_id=current_user.id
    )
    
    await db.rondes_securite.update_one(
        {"id": ronde_id},
        {"$push": {"contre_signatures": contre_signature.dict()}}
    )
    
    return {
        "message": "Contre-signature ajoutée avec succès",
        "ronde_id": ronde_id,
        "temps_restant_heures": int((timedelta(hours=24) - time_elapsed).total_seconds() / 3600)
    }


# ==================== ROUTES - PARAMÈTRES ====================

@router.get("/{tenant_slug}/actifs/parametres")
async def get_parametres_actifs(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres du module actifs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    parametres = tenant.parametres.get('actifs', {}) if tenant.parametres else {}
    
    if not parametres:
        parametres = {
            "dates_tests_bornes_seches": []
        }
    
    return parametres


@router.put("/{tenant_slug}/actifs/parametres")
async def update_parametres_actifs(
    tenant_slug: str,
    parametres: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres du module actifs"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    current_params = tenant.parametres or {}
    current_params['actifs'] = parametres
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {
            "parametres": current_params,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Paramètres mis à jour avec succès", "parametres": parametres}


@router.get("/{tenant_slug}/actifs/configuration-emails-rondes")
async def get_configuration_emails_rondes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la configuration des emails automatiques pour les rondes de sécurité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user_ids_config = tenant.parametres.get('user_ids_rondes_securite', [])
    
    return {"user_ids_rondes_securite": user_ids_config}


@router.put("/{tenant_slug}/actifs/configuration-emails-rondes")
async def update_configuration_emails_rondes(
    tenant_slug: str,
    config: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour la configuration des emails automatiques pour les rondes de sécurité"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé - Admin ou superviseur uniquement")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user_ids = config.get('user_ids_rondes_securite', [])
    if not isinstance(user_ids, list):
        raise HTTPException(status_code=400, detail="Le format des IDs utilisateurs est invalide")
    
    tenant_doc = await db.tenants.find_one({"id": tenant.id})
    if not tenant_doc:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    current_parametres = tenant_doc.get('parametres', {})
    current_parametres['user_ids_rondes_securite'] = user_ids
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {"parametres": current_parametres}}
    )
    
    return {"message": "Configuration mise à jour", "user_ids_rondes_securite": user_ids}
