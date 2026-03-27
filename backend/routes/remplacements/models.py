"""
Modèles Pydantic pour le module Remplacements
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid


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
    date: str  # Date de la garde à remplacer (format: YYYY-MM-DD)
    raison: str
    statut: str = "en_attente"  # en_attente, en_cours, accepte, expiree, annulee, ouvert, approuve_manuellement
    priorite: str = "normal"  # urgent (≤24h), normal (>24h) - calculé automatiquement
    remplacant_id: Optional[str] = None
    tentatives_historique: List[Dict[str, Any]] = []
    remplacants_contactes_ids: List[str] = []
    date_prochaine_tentative: Optional[datetime] = None
    nombre_tentatives: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Champs enrichis
    demandeur_nom: Optional[str] = None
    remplacant_nom: Optional[str] = None
    annule_par_id: Optional[str] = None
    annule_par_nom: Optional[str] = None
    date_annulation: Optional[str] = None
    relance_par_id: Optional[str] = None
    relance_par_nom: Optional[str] = None
    date_relance: Optional[str] = None
    approuve_par_id: Optional[str] = None
    approuve_par_nom: Optional[str] = None
    date_approbation: Optional[str] = None
    # Traçabilité: qui a créé la demande (si différent du demandeur)
    created_by_id: Optional[str] = None
    created_by_nom: Optional[str] = None


class DemandeRemplacementCreate(BaseModel):
    type_garde_id: str
    date: str
    raison: str
    # Optionnel: pour créer une demande au nom d'un autre employé (admin uniquement)
    target_user_id: Optional[str] = None


class NotificationRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demande_remplacement_id: str
    destinataire_id: str
    message: str
    type_notification: str = "remplacement_disponible"
    statut: str = "envoye"  # envoye, lu, accepte, refuse
    date_envoi: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_reponse: Optional[datetime] = None
    ordre_priorite: Optional[int] = None


class ParametresRemplacements(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    mode_notification: str = "simultane"  # simultane, sequentiel, groupe_sequentiel
    taille_groupe: int = 3
    delai_attente_heures: int = 24  # Gardé pour compatibilité
    delai_attente_minutes: int = 1440  # Ancien champ unique (gardé pour compatibilité)
    # Nouveaux délais par niveau de priorité (en minutes)
    delai_attente_urgente: int = 5      # Priorité Urgente: 5 min par défaut
    delai_attente_haute: int = 15       # Priorité Haute: 15 min par défaut
    delai_attente_normale: int = 60     # Priorité Normale: 60 min par défaut
    delai_attente_faible: int = 120     # Priorité Faible: 120 min par défaut
    max_contacts: int = 5
    priorite_grade: bool = True
    priorite_competences: bool = True
    activer_gestion_heures_sup: bool = False
    seuil_max_heures: int = 40
    periode_calcul_heures: str = "semaine"
    jours_periode_personnalisee: int = 7
    activer_regroupement_heures: bool = False
    duree_max_regroupement: int = 24
    # Archivage automatique
    delai_archivage_jours: int = 365  # 1 an par défaut (0 = désactivé)
    archivage_auto_actif: bool = True
    # Heures silencieuses (pause nocturne)
    heures_silencieuses_actif: bool = True
    heure_debut_silence: str = "21:00"  # Format HH:MM
    heure_fin_silence: str = "07:00"    # Format HH:MM
