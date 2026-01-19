"""
Modèles Pydantic pour le module Paie
====================================
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class ParametresPaie(BaseModel):
    """Paramètres de paie basés sur la convention collective du tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Période de paie
    periode_paie_jours: int = 14  # 7, 14, 30 jours
    jour_debut_periode: str = "lundi"  # lundi, dimanche, etc.
    
    # Configuration par type de présence
    # Garde interne: déjà payé via salaire, stats seulement
    garde_interne_taux: float = 0.0  # Multiplicateur (0 = pas de paiement supplémentaire)
    garde_interne_minimum_heures: float = 0.0
    
    # Garde externe (astreinte à domicile)
    garde_externe_taux: float = 1.0  # Multiplicateur du taux horaire
    garde_externe_minimum_heures: float = 3.0  # Minimum payé même si intervention plus courte
    garde_externe_montant_fixe: float = 0.0  # Montant fixe par garde (alternative au taux)
    
    # Rappel (hors garde planifiée)
    rappel_taux: float = 1.0  # Multiplicateur du taux horaire
    rappel_minimum_heures: float = 3.0  # Minimum payé
    
    # Formations
    formation_taux: float = 1.0  # Multiplicateur pour les formations
    formation_taux_specifique: bool = False  # Si True, utiliser un taux différent
    formation_taux_horaire: float = 0.0  # Taux horaire spécifique pour formations
    
    # Heures supplémentaires (lié au paramètre Planning)
    heures_sup_seuil_hebdo: int = 40  # Seuil pour heures supplémentaires
    heures_sup_taux: float = 1.5  # Multiplicateur pour heures sup
    
    # Primes de repas (lié aux paramètres interventions)
    inclure_primes_repas: bool = True
    
    # Formats d'export
    formats_export_actifs: List[str] = ["pdf", "excel"]
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FeuilleTemps(BaseModel):
    """Feuille de temps générée pour un employé sur une période"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    
    # Période
    annee: int
    periode_debut: str  # Format YYYY-MM-DD
    periode_fin: str  # Format YYYY-MM-DD
    numero_periode: int  # Numéro de la période dans l'année
    
    # Informations employé (snapshot au moment de la génération)
    employe_nom: str
    employe_prenom: str
    employe_numero: str
    employe_grade: str
    employe_type_emploi: str  # temps_plein, temps_partiel
    employe_taux_horaire: float
    
    # Détails des heures
    lignes: List[dict] = []
    # Chaque ligne: {date, type, description, heures_brutes, heures_payees, taux, montant, source_id, source_type}
    
    # Totaux calculés
    total_heures_gardes_internes: float = 0.0
    total_heures_gardes_externes: float = 0.0
    total_heures_rappels: float = 0.0
    total_heures_formations: float = 0.0
    total_heures_interventions: float = 0.0
    total_heures_supplementaires: float = 0.0
    
    total_heures_payees: float = 0.0
    total_montant_brut: float = 0.0
    total_primes_repas: float = 0.0
    total_montant_final: float = 0.0
    
    # Workflow
    statut: str = "brouillon"  # brouillon, valide, exporte
    
    # Audit
    genere_par: str
    genere_le: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    valide_par: Optional[str] = None
    valide_le: Optional[datetime] = None
    exporte_le: Optional[datetime] = None
    format_export: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TenantPayrollConfig(BaseModel):
    """Configuration de paie spécifique au tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    provider_id: Optional[str] = None  # Fournisseur de paie sélectionné
    
    # Configuration Nethris spécifique
    company_number: Optional[str] = None  # Numéro de compagnie Nethris (sans lettres)
    company_number_mode: str = "single"  # "single" ou "per_branch" (par succursale)
    branch_company_numbers: dict = {}  # {succursale_id: numero_compagnie}
    
    # Codes de gains standards Nethris (comme Agendrix)
    code_gain_regulier: str = "1"  # Code pour temps régulier
    code_gain_supplementaire: str = "43"  # Code pour temps supplémentaire
    code_gain_formation_regulier: str = ""  # Code pour formation régulière
    code_gain_formation_sup: str = ""  # Code pour formation supplémentaire
    
    # Correspondances organisationnelles (Nethris)
    division_mapping: dict = {}  # {position_id: division_nethris}
    service_mapping: dict = {}  # {succursale_id: service_nethris}
    departement_mapping: dict = {}  # {grade_id: departement_nethris}
    
    # Credentials API du tenant (chiffrés/sécurisés)
    api_credentials: dict = {}  # {client_id, client_secret, business_id, company_number, etc.}
    api_connection_tested: bool = False
    api_last_test_date: Optional[datetime] = None
    api_last_test_result: Optional[str] = None
    
    # Champs personnalisables
    champs_supplementaires: List[dict] = []  # [{nom, type, valeur_defaut}]
    # Options d'export
    inclure_employes_sans_heures: bool = False
    grouper_par_code: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PayrollProvider(BaseModel):
    """Fournisseur de paie configurable par Super Admin"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # Nethris, Employeur D, Ceridian, etc.
    description: str = ""
    
    # Format d'export
    export_format: str = "csv"  # csv, xlsx, xml, json
    delimiter: str = ";"  # Pour CSV
    encoding: str = "utf-8"
    
    # Configuration des colonnes
    columns: List[dict] = []  # Liste de ProviderColumnDefinition
    
    # Configuration API (si disponible)
    api_available: bool = False
    api_auth_type: str = "oauth2"  # oauth2, api_key, basic
    api_base_url: str = ""
    api_token_url: str = ""
    api_upload_endpoint: str = ""
    api_config_endpoint: str = ""
    api_documentation_url: str = ""
    api_required_fields: List[dict] = []  # [{name, label, type, required, help_text}]
    
    integration_notes: str = ""
    is_active: bool = True
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProviderColumnDefinition(BaseModel):
    """Définition d'une colonne pour l'export vers un fournisseur"""
    column_order: int
    header_name: str  # Nom de la colonne dans le fichier export
    field_reference: str  # Référence au champ interne (employee_id, employee_name, hours, amount, etc.)
    is_required: bool = True
    default_value: str = ""
    format_pattern: str = ""  # Pattern de formatage (date, number, etc.)


class ClientPayCodeMapping(BaseModel):
    """Mapping des codes de paie entre ProFireManager et le fournisseur pour un client"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    provider_id: str
    internal_event_type: str  # INTERVENTION, TRAINING, STATION_DUTY, etc.
    external_pay_code: str  # Code du fournisseur
    description: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PayrollExportConfig(BaseModel):
    """Configuration d'un export spécifique"""
    date_format: str = "YYYY-MM-DD"
    decimal_separator: str = "."
    include_header: bool = True
    is_active: bool = True
