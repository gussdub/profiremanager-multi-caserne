"""
Modèles Pydantic pour le module Gestion des Actifs
Conforme aux normes NFPA, SAAQ et meilleures pratiques des services incendie
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ===== ENUMS =====

class VehicleStatus(str, Enum):
    """Statut opérationnel d'un véhicule"""
    EN_SERVICE = "en_service"
    HORS_SERVICE = "hors_service"
    MAINTENANCE = "maintenance"
    RETIRE = "retire"


class VehicleType(str, Enum):
    """Types de véhicules selon NFPA 1901"""
    AUTOPOMPE = "autopompe"
    ECHELLE = "echelle"
    CITERNE = "citerne"
    UNITE_URGENCE = "unite_urgence"
    PICK_UP = "pick_up"
    VUS = "vus"
    AUTRE = "autre"


class DefectSeverity(str, Enum):
    """Sévérité d'une défectuosité selon SAAQ"""
    MINEURE = "mineure"  # Véhicule reste en service
    MAJEURE = "majeure"  # Véhicule hors service immédiat


class BorneType(str, Enum):
    """Types de points d'eau"""
    FONTAINE = "fontaine"  # Réseau municipal
    SECHE = "seche"  # Borne sèche (aspiration)
    ETANG = "etang"  # Plan d'eau naturel
    PISCINE = "piscine"  # Piscine/réservoir


class BorneStatus(str, Enum):
    """Statut d'une borne"""
    SERVICE = "service"
    HORS_SERVICE = "hors_service"
    A_INSPECTER = "a_inspecter"


# ===== MODÈLES EMBARQUÉS (Subdocuments) =====

class GeoLocation(BaseModel):
    """Coordonnées géographiques GeoJSON Standard"""
    type: str = "Point"
    coordinates: List[float] = Field(..., description="[Longitude, Latitude]")


class AuditLog(BaseModel):
    """Entrée de journal d'audit (immuable)"""
    date: datetime
    user_id: str
    user_name: str
    action: str  # Ex: "created", "updated", "inspected", "repaired"
    details: Optional[str] = None
    gps: Optional[List[float]] = None  # Position GPS si applicable


class PhotoReference(BaseModel):
    """Référence à une photo stockée"""
    photo_id: str
    url: str  # URL base64 ou S3
    filename: str
    uploaded_by: str
    uploaded_at: datetime
    description: Optional[str] = None


class Defect(BaseModel):
    """Défectuosité identifiée lors d'une inspection"""
    item: str  # Ex: "Freins avant", "Pneu avant gauche"
    severity: DefectSeverity
    description: str
    photo_ids: List[str] = []
    reported_by: str
    reported_at: datetime
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None


# ===== MODÈLES PRINCIPAUX =====

class Vehicle(BaseModel):
    """
    Véhicule du service incendie
    Conforme NFPA 1901 et Loi 430 SAAQ
    """
    id: str = Field(default_factory=lambda: f"veh_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    
    # Identification
    numero: str  # Ex: "Camion 201"
    type: VehicleType
    marque: str  # Ex: "Freightliner", "Ford"
    modele: str  # Ex: "M2 106", "F-550"
    annee: int
    
    # Immatriculation
    vin: Optional[str] = None
    plaque: Optional[str] = None
    date_immatriculation: Optional[datetime] = None
    
    # Statut opérationnel
    status: VehicleStatus = VehicleStatus.EN_SERVICE
    status_reason: Optional[str] = None  # Raison si hors service
    
    # Lifecycle
    date_acquisition: datetime
    date_mise_en_service: datetime
    date_retrait: Optional[datetime] = None
    
    # SAAQ
    date_prochaine_inspection_saaq: Optional[datetime] = None
    
    # QR Code
    qr_code: Optional[str] = None  # URL du QR code généré
    
    # Inspections (référence)
    derniere_inspection_id: Optional[str] = None
    derniere_inspection_date: Optional[datetime] = None
    
    # Audit trail
    logs: List[AuditLog] = []
    
    # Métadonnées
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        use_enum_values = True


class InspectionSAAQ(BaseModel):
    """
    Inspection de sécurité SAAQ (Ronde pré-départ)
    Conforme Loi 430 et Règlement sur les normes de sécurité
    """
    id: str = Field(default_factory=lambda: f"insp_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    vehicle_id: str
    
    # Inspecteur
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    
    # Signature électronique
    signature_certify: bool  # "Je certifie avoir effectué cette inspection"
    signature_timestamp: datetime
    signature_gps: Optional[List[float]] = None
    
    # Date/Heure inspection
    inspection_date: datetime = Field(default_factory=datetime.now)
    
    # Checklist (Structure flexible pour différents types de véhicules)
    checklist: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structure: {'freins': True, 'pneus': True, ...}"
    )
    
    # Défectuosités
    defects: List[Defect] = []
    has_major_defect: bool = False  # Flag pour hors service
    
    # Photos
    photo_ids: List[str] = []
    
    # Résultat
    passed: bool = True
    comments: Optional[str] = None
    
    # Offline sync
    synced: bool = False
    created_offline: bool = False
    
    # Métadonnées
    created_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        use_enum_values = True


class BorneIncendie(BaseModel):
    """
    Borne fontaine / Point d'eau
    Conforme NFPA 291 (Hydrant testing)
    """
    id: str = Field(default_factory=lambda: f"bh_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    
    # Identification
    numero: str  # Ex: "BH-001", "BS-042"
    type: BorneType
    
    # Géolocalisation (GeoJSON pour MongoDB geospatial queries)
    location: GeoLocation
    adresse: Optional[str] = None
    
    # Statut
    status: BorneStatus = BorneStatus.SERVICE
    
    # Caractéristiques (Fontaines)
    diametre_raccord: Optional[str] = None  # Ex: "2.5 pouces"
    nb_sorties: Optional[int] = None
    
    # Dernier test de débit (NFPA 291)
    dernier_test_debit: Optional[Dict[str, Any]] = Field(
        default=None,
        description="""
        {
          'date': '2024-05-15',
          'gpm': 1200,
          'pression_statique': 65,
          'pression_residuelle': 45,
          'tested_by': 'user_id'
        }
        """
    )
    
    # Couleur NFPA 291 (calculée automatiquement)
    couleur_nfpa: Optional[str] = None  # 'blue', 'green', 'orange', 'red'
    
    # Inspection hivernale (Bornes sèches)
    inspection_automne_done: bool = False
    inspection_printemps_done: bool = False
    
    # QR Code
    qr_code: Optional[str] = None
    
    # Audit trail
    logs: List[AuditLog] = []
    
    # Métadonnées
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    class Config:
        use_enum_values = True


class TestDebitBorne(BaseModel):
    """Test de débit d'une borne fontaine selon NFPA 291"""
    id: str = Field(default_factory=lambda: f"test_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    borne_id: str
    
    # Testeur
    tested_by_id: str
    tested_by_name: str
    test_date: datetime = Field(default_factory=datetime.now)
    
    # Mesures
    pression_statique_psi: float
    pression_residuelle_psi: float
    debit_gpm: float
    
    # Couleur calculée (automatique)
    couleur_nfpa: str  # Calculée selon debit_gpm
    
    # Conditions
    temperature_c: Optional[float] = None
    weather: Optional[str] = None
    
    # Photos
    photo_ids: List[str] = []
    
    # Notes
    notes: Optional[str] = None
    
    # GPS validation (géofencing)
    gps_coordinates: Optional[List[float]] = None
    gps_validated: bool = False
    
    class Config:
        use_enum_values = True


# ===== MODÈLES DE CONFIGURATION =====

class ChecklistTemplate(BaseModel):
    """Template de checklist SAAQ pour un type de véhicule"""
    id: str = Field(default_factory=lambda: f"tpl_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    vehicle_type: VehicleType
    nom: str
    
    # Structure de checklist
    sections: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="""
        [
          {
            'section': 'Freinage',
            'items': [
              {'id': 'freins_avant', 'label': 'Freins avant', 'majeur': True},
              {'id': 'freins_arriere', 'label': 'Freins arrière', 'majeur': True}
            ]
          }
        ]
        """
    )
    
    active: bool = True
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# Import nécessaire pour uuid
import uuid
