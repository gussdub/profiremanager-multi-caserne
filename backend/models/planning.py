"""
Modèles Planning pour ProFireManager
Gestion des gardes, assignations et remplacements
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import uuid


class TypeGarde(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []  # monday, tuesday, etc.
    officier_obligatoire: bool = False
    competences_requises: List[str] = []  # Formations/compétences requises
    est_garde_externe: bool = False  # True si garde externe (astreinte)
    taux_horaire_externe: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TypeGardeCreate(BaseModel):
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []
    officier_obligatoire: bool = False
    competences_requises: List[str] = []
    est_garde_externe: bool = False
    taux_horaire_externe: Optional[float] = None


class Planning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    semaine_debut: str  # Format: YYYY-MM-DD
    semaine_fin: str
    assignations: Dict[str, Any] = {}  # jour -> type_garde -> assignation
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlanningCreate(BaseModel):
    semaine_debut: str
    semaine_fin: str
    assignations: Dict[str, Any] = {}


class Assignation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    type_garde_id: str
    date: str
    statut: str = "planifie"  # planifie, confirme, remplacement_demande
    assignation_type: str = "auto"  # auto, manuel, manuel_avance
    justification: Optional[Dict[str, Any]] = None
    notes_admin: Optional[str] = None
    justification_historique: Optional[List[Dict[str, Any]]] = None


class AssignationCreate(BaseModel):
    tenant_id: Optional[str] = None
    user_id: str
    type_garde_id: str
    date: str
    assignation_type: str = "manuel"


class TentativeRemplacement(BaseModel):
    """Historique des tentatives de remplacement"""
    user_id: str
    nom_complet: str
    date_contact: datetime
    statut: str  # contacted, accepted, refused, expired
    date_reponse: Optional[datetime] = None


class DemandeRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demandeur_id: str
    type_garde_id: str
    date: str  # Date de la garde à remplacer
    raison: str
    statut: str = "en_attente"  # en_attente, en_cours, accepte, expiree, annulee
    priorite: str = "normal"  # urgent (≤24h), normal (>24h)
    remplacant_id: Optional[str] = None
    tentatives_historique: List[Dict[str, Any]] = []
    remplacants_contactes_ids: List[str] = []
    date_prochaine_tentative: Optional[datetime] = None
    nombre_tentatives: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DemandeRemplacementCreate(BaseModel):
    type_garde_id: str
    date: str
    raison: str


class Disponibilite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    date: str
    type: str  # disponible, indisponible
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    raison: Optional[str] = None
    priorite: int = 0  # 0=normal, 1=haute (vacances), 2=système
    source: str = "manuel"  # manuel, auto, systeme
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DisponibiliteCreate(BaseModel):
    date: str
    type: str  # disponible, indisponible
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    raison: Optional[str] = None
    priorite: int = 0
    source: str = "manuel"


class IndisponibiliteGenerate(BaseModel):
    """Pour générer des indisponibilités en masse (vacances, congés)"""
    date_debut: str
    date_fin: str
    raison: str = "Vacances"
    priorite: int = 1
    exclure_weekends: bool = False


class DisponibiliteReinitialiser(BaseModel):
    """Pour réinitialiser les disponibilités d'une période"""
    date_debut: str
    date_fin: str
    generer_disponibles: bool = True


class ConflictResolution(BaseModel):
    """Résolution de conflits de disponibilités"""
    resolution_type: str  # keep_existing, replace, merge
    disponibilite_id: Optional[str] = None
    new_data: Optional[Dict[str, Any]] = None


class ConflictDetail(BaseModel):
    """Détail d'un conflit de disponibilité"""
    existing_id: str
    existing_date: str
    existing_type: str
    new_type: str
    conflict_type: str  # overlap, same_day
    suggested_resolution: str
