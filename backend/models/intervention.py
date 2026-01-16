"""
Modèles de données pour le module Gestion des Interventions
Conforme aux standards DSI du Québec (MSP)
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ==================== ENUMS ====================

class InterventionStatus(str, Enum):
    NEW = "new"           # Importé du 911, non traité
    DRAFT = "draft"       # En cours de rédaction
    REVIEW = "review"     # Soumis pour validation
    REVISION = "revision" # Retourné pour modification
    SIGNED = "signed"     # Validé et signé
    ARCHIVED = "archived" # Archivé


class RoleOnScene(str, Enum):
    POMPIER = "Pompier"
    OFFICIER = "Officier"
    CHAUFFEUR = "Chauffeur"
    PHOTOGRAPHE = "Photographe"
    CHEF_EQUIPE = "Chef d'équipe"
    AUTRE = "Autre"


# ==================== REFERENCE TABLES (DSI QUEBEC) ====================

class NatureIntervention(BaseModel):
    """Types d'intervention (codes MSP)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str  # Code MSP
    libelle: str
    categorie: str  # Incendie, Sauvetage, Premiers soins, etc.
    actif: bool = True


class CauseProbable(BaseModel):
    """Causes probables d'incendie (DSI)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    libelle: str
    description: Optional[str] = None
    actif: bool = True


class SourceChaleur(BaseModel):
    """Sources de chaleur (DSI)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    libelle: str
    categorie: str  # Cuisson, Chauffage, Électrique, etc.
    actif: bool = True


class MateriauEnflamme(BaseModel):
    """Matériaux premiers enflammés (DSI)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    libelle: str
    categorie: str  # Structure, Contenu, Liquides, etc.
    actif: bool = True


class CategorieBatiment(BaseModel):
    """Catégories de bâtiments (DSI)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    libelle: str
    description: Optional[str] = None
    actif: bool = True


# ==================== MAPPING CODES 911 ====================

class MappingCode911(BaseModel):
    """Table de mapping entre codes 911 et codes internes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    type_mapping: str  # "nature", "vehicule", "unite", etc.
    code_externe: str  # Code de la centrale 911
    code_interne: Optional[str] = None  # ID interne ProFireManager
    libelle_externe: str  # Libellé reçu du 911
    libelle_interne: Optional[str] = None
    auto_mapped: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


# ==================== MAIN INTERVENTION MODEL ====================

class Intervention(BaseModel):
    """Modèle principal d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Identifiants externes (XML 911)
    external_call_id: str  # noCarteAppel - Unique
    guid_carte: Optional[str] = None  # idCarteAppel
    guid_municipalite: Optional[str] = None  # guidMun
    no_sequentiel: Optional[int] = None
    
    # Statut du workflow
    status: InterventionStatus = InterventionStatus.NEW
    
    # Personnel
    officer_in_charge_id: Optional[str] = None  # FK vers Users
    officer_in_charge_xml: Optional[str] = None  # Code officier du XML
    assigned_reporters: List[str] = []  # IDs des personnes assignées pour remplir
    
    # Adresse
    address_civic: Optional[str] = None  # noPorte
    address_street: Optional[str] = None  # rue
    address_apartment: Optional[str] = None  # noAppart
    address_city: Optional[str] = None  # villePourQui
    address_full: Optional[str] = None  # Adresse complète construite
    geo_lat: Optional[float] = None
    geo_long: Optional[float] = None
    
    # Informations appelant
    caller_name: Optional[str] = None  # deQui
    caller_phone: Optional[str] = None  # telDeQui
    for_whom: Optional[str] = None  # pourQui
    for_whom_phone: Optional[str] = None  # telPourQui
    
    # Type d'intervention
    type_intervention: Optional[str] = None  # typeIntervention
    nature_id: Optional[str] = None  # FK vers NatureIntervention
    code_feu: Optional[str] = None  # codeFeu
    niveau_risque: Optional[str] = None  # niveauRisque
    
    # Chronologie (UTC) - Données XML (source de vérité initiale)
    xml_time_call_received: Optional[datetime] = None  # heureAppel
    xml_time_911: Optional[datetime] = None  # heure911
    xml_time_dispatch: Optional[datetime] = None  # heureAlerte
    xml_time_en_route: Optional[datetime] = None  # depCaserne
    xml_time_arrival_1st: Optional[datetime] = None  # arrLieux / hre1018
    xml_time_force_frappe: Optional[datetime] = None  # forceFrappe
    xml_time_under_control: Optional[datetime] = None  # sousControle
    xml_time_1022: Optional[datetime] = None  # heure1022 (Disponible sur radio)
    xml_time_departure: Optional[datetime] = None  # depLieux
    xml_time_terminated: Optional[datetime] = None  # dispFinale
    
    # Chronologie - Données manuelles (si modifiées par utilisateur)
    manual_time_call_received: Optional[datetime] = None
    manual_time_dispatch: Optional[datetime] = None
    manual_time_en_route: Optional[datetime] = None
    manual_time_arrival_1st: Optional[datetime] = None
    manual_time_force_frappe: Optional[datetime] = None
    manual_time_under_control: Optional[datetime] = None
    manual_time_terminated: Optional[datetime] = None
    
    # Champs DSI (Sinistre) - Requis pour incendies
    cause_id: Optional[str] = None  # FK vers CauseProbable
    source_heat_id: Optional[str] = None  # FK vers SourceChaleur
    material_first_ignited_id: Optional[str] = None  # FK vers MateriauEnflamme
    building_category_code: Optional[str] = None
    estimated_loss_building: Optional[float] = 0
    estimated_loss_content: Optional[float] = 0
    
    # Avertisseurs et gicleurs
    smoke_detector_present: Optional[bool] = None
    smoke_detector_functional: Optional[bool] = None
    sprinkler_present: Optional[bool] = None
    sprinkler_functional: Optional[bool] = None
    
    # Narratif
    narrative: Optional[str] = None
    
    # Services externes
    police_called: bool = False
    police_time: Optional[datetime] = None
    ambulance_called: bool = False
    ambulance_time: Optional[datetime] = None
    hydro_called: bool = False
    hydro_time: Optional[datetime] = None
    
    # Commentaires XML importés
    xml_comments: List[dict] = []
    
    # Metadata
    xml_raw_data: Optional[dict] = None  # Données XML brutes pour audit
    imported_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    imported_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None
    signed_at: Optional[datetime] = None
    signed_by: Optional[str] = None
    
    # Audit trail (modifications après signature)
    audit_log: List[dict] = []
    
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


# ==================== RESOURCES ====================

class InterventionResource(BaseModel):
    """Ressources humaines assignées à l'intervention (pour la paie)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    intervention_id: str  # FK vers Intervention
    tenant_id: str
    user_id: Optional[str] = None  # FK vers Users (peut être null si non mappé)
    
    # Données XML
    xml_resource_id: Optional[str] = None
    xml_resource_number: Optional[str] = None
    
    # Rôle et présence
    role_on_scene: RoleOnScene = RoleOnScene.POMPIER
    
    # Temps de travail (pour export paie)
    datetime_start: Optional[datetime] = None
    datetime_end: Optional[datetime] = None
    
    # Flags
    is_remunerated: bool = True  # Pour export futur module RH
    is_manually_added: bool = False  # Ajouté manuellement vs importé du XML
    
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


class InterventionVehicle(BaseModel):
    """Véhicules déployés sur l'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    intervention_id: str  # FK vers Intervention
    tenant_id: str
    vehicle_id: Optional[str] = None  # FK vers module Garage/Actifs
    
    # Données XML
    xml_vehicle_number: Optional[str] = None  # noRessource (372, etc.)
    xml_vehicle_id: Optional[str] = None
    xml_status: Optional[str] = None  # statutCamion
    
    # Équipage
    crew_count: int = 0  # nbPompier
    
    # Kilométrage (optionnel)
    mileage_start: Optional[int] = None
    mileage_end: Optional[int] = None
    
    # Timestamps du véhicule
    time_dispatched: Optional[datetime] = None
    time_en_route: Optional[datetime] = None
    time_on_scene: Optional[datetime] = None
    time_departed: Optional[datetime] = None
    time_available: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


class InterventionAssistance(BaseModel):
    """Entraide avec autres municipalités"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    intervention_id: str
    tenant_id: str
    
    # Données XML
    xml_assistance_id: Optional[str] = None
    no_carte_entraide: Optional[str] = None
    municipalite: Optional[str] = None
    type_equipement: Optional[str] = None
    
    # Timestamps
    time_called: Optional[datetime] = None
    time_en_route: Optional[datetime] = None
    time_on_scene: Optional[datetime] = None
    time_released: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())


# ==================== MODULE SETTINGS ====================

class InterventionModuleSettings(BaseModel):
    """Paramètres du module Interventions par tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Permissions
    supervisors_can_validate: bool = True
    auto_assign_officer: bool = True  # Assigner auto l'officier du XML
    
    # Validation DSI
    require_dsi_for_fire: bool = True  # Exiger champs DSI pour incendies
    require_narrative: bool = True
    
    # Alertes
    alert_response_time_threshold: int = 480  # 8 minutes en secondes
    alert_on_import: bool = True  # Notifier les admins sur nouvel import
    
    # Export
    auto_archive_after_days: int = 365
    
    created_at: datetime = Field(default_factory=lambda: datetime.utcnow())
    updated_at: Optional[datetime] = None


# ==================== API SCHEMAS ====================

class InterventionCreate(BaseModel):
    """Schéma pour création manuelle d'intervention"""
    type_intervention: str
    address_civic: Optional[str] = None
    address_street: Optional[str] = None
    address_city: Optional[str] = None
    officer_in_charge_id: Optional[str] = None


class InterventionUpdate(BaseModel):
    """Schéma pour mise à jour d'intervention"""
    status: Optional[InterventionStatus] = None
    officer_in_charge_id: Optional[str] = None
    assigned_reporters: Optional[List[str]] = None
    
    # Champs modifiables
    nature_id: Optional[str] = None
    cause_id: Optional[str] = None
    source_heat_id: Optional[str] = None
    material_first_ignited_id: Optional[str] = None
    building_category_code: Optional[str] = None
    estimated_loss_building: Optional[float] = None
    estimated_loss_content: Optional[float] = None
    
    smoke_detector_present: Optional[bool] = None
    smoke_detector_functional: Optional[bool] = None
    sprinkler_present: Optional[bool] = None
    sprinkler_functional: Optional[bool] = None
    
    narrative: Optional[str] = None
    
    # Temps manuels
    manual_time_arrival_1st: Optional[datetime] = None
    manual_time_under_control: Optional[datetime] = None
    manual_time_terminated: Optional[datetime] = None


class InterventionValidation(BaseModel):
    """Schéma pour validation/signature"""
    action: str  # "validate", "return_for_revision", "sign"
    comment: Optional[str] = None
