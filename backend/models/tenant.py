"""
Modèles Tenant et SuperAdmin pour ProFireManager
Gestion multi-tenant des casernes
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime, timezone
import uuid


class Tenant(BaseModel):
    """Modèle pour une caserne (tenant)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str  # URL slug (shefford, bromont, etc.)
    nom: str  # Nom complet de la caserne
    adresse: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    telephone: str = ""
    email_contact: str = ""
    actif: bool = True
    date_creation: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parametres: Dict[str, Any] = {}
    # Personnalisation
    logo_url: str = ""  # URL ou base64 du logo
    nom_service: str = ""  # Nom complet du service (ex: "Service Incendie de Ville-X")
    afficher_profiremanager: bool = True  # Afficher le branding ProFireManager


class TenantCreate(BaseModel):
    slug: str
    nom: str
    adresse: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    telephone: str = ""
    email_contact: str = ""
    date_creation: Optional[str] = None  # Date optionnelle


class SuperAdmin(BaseModel):
    """Super administrateur gérant toutes les casernes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    nom: str = "Super Admin"
    mot_de_passe_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SuperAdminLogin(BaseModel):
    email: str
    mot_de_passe: str
