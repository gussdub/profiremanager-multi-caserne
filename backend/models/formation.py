"""
Modèles Formation pour ProFireManager
Gestion des formations, compétences et certifications NFPA 1500
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid


class Formation(BaseModel):
    """Formation planifiée avec gestion inscriptions NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    competence_id: str = ""
    description: str = ""
    date_debut: str = ""
    date_fin: str = ""
    heure_debut: str = ""
    heure_fin: str = ""
    duree_heures: float = 0
    lieu: str = ""
    instructeur: str = ""
    places_max: int = 20
    places_restantes: int = 20
    statut: str = "planifiee"
    obligatoire: bool = False
    annee: int = 0
    validite_mois: int = 12
    user_inscrit: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FormationCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    competence_id: str
    description: str = ""
    date_debut: str
    date_fin: str
    heure_debut: str
    heure_fin: str
    duree_heures: float
    lieu: str = ""
    instructeur: str = ""
    places_max: int
    obligatoire: bool = False
    annee: int


class FormationUpdate(BaseModel):
    nom: Optional[str] = None
    competence_id: Optional[str] = None
    description: Optional[str] = None
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    duree_heures: Optional[float] = None
    lieu: Optional[str] = None
    instructeur: Optional[str] = None
    places_max: Optional[int] = None
    obligatoire: Optional[bool] = None
    statut: Optional[str] = None


class InscriptionFormation(BaseModel):
    """Inscription d'un pompier à une formation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    formation_id: str
    user_id: str
    date_inscription: str
    statut: str = "inscrit"  # inscrit, en_attente, present, absent, complete
    heures_creditees: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InscriptionFormationCreate(BaseModel):
    tenant_id: Optional[str] = None
    formation_id: str
    user_id: str


class InscriptionFormationUpdate(BaseModel):
    statut: Optional[str] = None
    heures_creditees: Optional[float] = None
    notes: Optional[str] = None


class Competence(BaseModel):
    """Compétence avec exigences NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CompetenceCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False


class CompetenceUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    heures_requises_annuelles: Optional[float] = None
    obligatoire: Optional[bool] = None


class Grade(BaseModel):
    """Grade hiérarchique pour les pompiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    niveau_hierarchique: int  # 1 = plus bas, 10 = plus haut
    est_officier: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GradeCreate(BaseModel):
    nom: str
    niveau_hierarchique: int
    est_officier: bool = False


class GradeUpdate(BaseModel):
    nom: Optional[str] = None
    niveau_hierarchique: Optional[int] = None
    est_officier: Optional[bool] = None


class ParametresFormations(BaseModel):
    """Paramètres globaux des formations pour un tenant"""
    tenant_id: str
    heures_entrainement_min: float = 12.0  # NFPA 1500
    heures_education_min: float = 24.0
    frequence_recyclage_mois: int = 12
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ValidationCompetence(BaseModel):
    """Validation/certification d'une compétence pour un pompier"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    competence_id: str
    date_obtention: str
    date_expiration: Optional[str] = None
    certificat_url: Optional[str] = None
    validee_par: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ValidationCompetenceCreate(BaseModel):
    user_id: str
    competence_id: str
    date_obtention: str
    date_expiration: Optional[str] = None
    certificat_url: Optional[str] = None
