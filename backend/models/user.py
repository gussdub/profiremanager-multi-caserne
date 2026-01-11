"""
Modèles User pour ProFireManager
Gestion des utilisateurs (pompiers, admins)
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str  # ID de la caserne
    nom: str
    prenom: str
    email: str
    telephone: str = ""
    adresse: str = ""  # Adresse du pompier
    contact_urgence: str = ""
    grade: str = "Pompier"  # Capitaine, Directeur, Pompier, Lieutenant
    fonction_superieur: bool = False  # Pour pompiers pouvant agir comme lieutenant
    type_emploi: str = "temps_plein"  # temps_plein, temps_partiel, temporaire
    heures_max_semaine: int = 40  # Heures max par semaine (pour temps partiel)
    role: str = "employe"  # admin, superviseur, employe
    statut: str = "Actif"  # Actif, Inactif
    numero_employe: str = ""
    date_embauche: str = ""
    taux_horaire: float = 0.0  # Taux horaire en $/h
    heures_internes: float = 0.0  # Heures de garde internes (travail physique)
    heures_externes: float = 0.0  # Heures de garde externes (astreinte à domicile)
    formations: List[str] = []  # Liste des UUIDs de formations suivies
    competences: List[str] = []  # Liste des UUIDs de compétences acquises/certifiées
    accepte_gardes_externes: bool = True  # Accepte d'être assigné aux gardes externes
    est_preventionniste: bool = False  # Désigné comme préventionniste
    equipe_garde: Optional[int] = None  # Équipe de garde (1, 2, 3, 4, 5 selon config)
    photo_profil: Optional[str] = None  # Photo de profil en base64
    mot_de_passe_hash: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    nom: str
    prenom: str
    email: str
    telephone: str = ""
    adresse: str = ""
    contact_urgence: str = ""
    grade: str = "Pompier"
    fonction_superieur: bool = False
    type_emploi: str = "temps_plein"
    heures_max_semaine: int = 40
    role: str = "employe"
    numero_employe: str = ""
    date_embauche: str = ""
    taux_horaire: float = 0.0
    formations: List[str] = []
    competences: List[str] = []
    accepte_gardes_externes: bool = True
    est_preventionniste: bool = False
    equipe_garde: Optional[int] = None
    mot_de_passe: str = "TempPass123!"


class UserUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    contact_urgence: Optional[str] = None
    grade: Optional[str] = None
    fonction_superieur: Optional[bool] = None
    type_emploi: Optional[str] = None
    heures_max_semaine: Optional[int] = None
    role: Optional[str] = None
    numero_employe: Optional[str] = None
    date_embauche: Optional[str] = None
    taux_horaire: Optional[float] = None
    formations: Optional[List[str]] = None
    competences: Optional[List[str]] = None
    accepte_gardes_externes: Optional[bool] = None
    est_preventionniste: Optional[bool] = None
    equipe_garde: Optional[int] = None
    photo_profil: Optional[str] = None
    mot_de_passe: Optional[str] = None


class UserLogin(BaseModel):
    email: str
    mot_de_passe: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    nouveau_mot_de_passe: str


class PasswordResetToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    email: str
    token: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
