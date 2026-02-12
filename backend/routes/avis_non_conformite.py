"""
Routes API pour le module Avis de Non-Conformité
=================================================

STATUT: ACTIF
Ce module gère la génération d'avis de non-conformité suite aux inspections prévention.

Routes Référentiel Violations:
- GET    /{tenant_slug}/prevention/ref-violations           - Liste des articles de référence
- GET    /{tenant_slug}/prevention/ref-violations/{id}      - Détail d'un article
- POST   /{tenant_slug}/prevention/ref-violations           - Créer un article
- PUT    /{tenant_slug}/prevention/ref-violations/{id}      - Modifier un article
- DELETE /{tenant_slug}/prevention/ref-violations/{id}      - Supprimer un article
- POST   /{tenant_slug}/prevention/ref-violations/init      - Initialiser avec données par défaut

Routes Avis de Non-Conformité:
- POST   /{tenant_slug}/prevention/inspections/{id}/generer-avis  - Générer un avis
- GET    /{tenant_slug}/prevention/avis-non-conformite             - Liste des avis
- GET    /{tenant_slug}/prevention/avis-non-conformite/{id}        - Détail d'un avis
- GET    /{tenant_slug}/prevention/avis-non-conformite/{id}/pdf    - Télécharger le PDF
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
from io import BytesIO

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Table, TableStyle, Spacer, Image

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

# Import des helpers PDF partagés
from utils.pdf_helpers import (
    create_branded_pdf,
    BrandedDocTemplate
)

router = APIRouter(tags=["Avis Non-Conformité"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class RefViolation(BaseModel):
    """Référentiel des articles de loi et infractions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    code_article: str  # Ex: "CNPI 2.4.1.1", "RM-2024 Art. 5"
    description_standard: str  # Le texte légal complet
    delai_jours: int = 30  # Délai de correction en jours
    severite: str = "majeure"  # mineure, majeure, urgente
    categorie: str = ""  # Catégorie pour le tri (Extincteurs, Éclairage, etc.)
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RefViolationCreate(BaseModel):
    code_article: str
    description_standard: str
    delai_jours: int = 30
    severite: str = "majeure"
    categorie: str = ""
    actif: bool = True


class RefViolationUpdate(BaseModel):
    code_article: Optional[str] = None
    description_standard: Optional[str] = None
    delai_jours: Optional[int] = None
    severite: Optional[str] = None
    categorie: Optional[str] = None
    actif: Optional[bool] = None


class ViolationAvis(BaseModel):
    """Une violation spécifique dans un avis"""
    ref_violation_id: str
    code_article: str
    description: str  # Peut être personnalisée par rapport au standard
    delai_jours: int
    date_limite: str  # Date calculée (YYYY-MM-DD)
    severite: str
    notes: str = ""  # Notes spécifiques à cette violation


class AvisNonConformite(BaseModel):
    """Avis de non-conformité généré"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    inspection_id: str
    batiment_id: str
    numero_avis: str  # Numéro unique (ex: ANC-2026-001)
    date_generation: str  # Date de génération de l'avis
    date_inspection: str  # Date de l'inspection
    
    # Destinataire (propriétaire ou gestionnaire)
    destinataire_type: str = "proprietaire"  # proprietaire, gestionnaire
    destinataire_nom: str = ""
    destinataire_prenom: str = ""
    destinataire_adresse: str = ""
    destinataire_ville: str = ""
    destinataire_code_postal: str = ""
    
    # Bâtiment inspecté
    batiment_nom: str = ""
    batiment_adresse: str = ""
    batiment_ville: str = ""
    
    # Violations constatées
    violations: List[ViolationAvis] = []
    
    # Dates clés
    date_echeance_min: str = ""  # Date la plus proche parmi les violations
    
    # Statut et suivi
    statut: str = "genere"  # genere, envoye, en_attente, cloture
    date_envoi: Optional[str] = None
    mode_envoi: Optional[str] = None  # courrier, courriel, main_propre
    
    # Préventionniste
    preventionniste_id: str = ""
    preventionniste_nom: str = ""
    
    # PDF
    pdf_url: Optional[str] = None
    
    # Métadonnées
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GenerateAvisRequest(BaseModel):
    """Requête pour générer un avis de non-conformité"""
    violations: List[Dict[str, Any]]  # Liste des violations avec ref_violation_id et notes optionnelles
    destinataire_type: str = "proprietaire"  # proprietaire ou gestionnaire
    notes: str = ""


# ==================== DONNÉES PAR DÉFAUT - RÉFÉRENTIEL CNPI ====================
# Basé sur le Code National de Prévention des Incendies - Canada (CNPI 2020/2025)
# et le Chapitre VIII - Bâtiment du Code de sécurité du Québec

VIOLATIONS_DEFAUT = [
    # ========== EXTINCTEURS (NFPA 10 / CNPI Division B Section 6) ==========
    {
        "code_article": "CNPI 6.2.1.1",
        "description_standard": "Extincteurs portatifs manquants ou en nombre insuffisant selon la classification des risques.",
        "delai_jours": 15,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.2",
        "description_standard": "Extincteurs portatifs non accessibles, obstrués ou non visibles (distance maximale de parcours non respectée).",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.3",
        "description_standard": "Inspection mensuelle des extincteurs non effectuée ou non documentée.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.4",
        "description_standard": "Entretien annuel des extincteurs non effectué selon NFPA 10 (étiquette d'inspection expirée).",
        "delai_jours": 15,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.5",
        "description_standard": "Extincteur portatif endommagé, corrodé ou présentant des signes de détérioration.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.6",
        "description_standard": "Extincteur portatif dont la pression est insuffisante ou excessive (aiguille hors zone verte).",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 6.2.1.7",
        "description_standard": "Classe d'extincteur inappropriée pour les risques présents (ex: classe A dans cuisine commerciale).",
        "delai_jours": 15,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    
    # ========== DÉTECTION INCENDIE (CNPI Division B Section 2.1) ==========
    {
        "code_article": "CNPI 2.1.3.1",
        "description_standard": "Avertisseur de fumée manquant ou absent dans un logement ou chambre à coucher.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.3.2",
        "description_standard": "Avertisseur de fumée hors service, déconnecté ou dont la pile est retirée.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.3.3",
        "description_standard": "Avertisseur de fumée âgé de plus de 10 ans et devant être remplacé.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.3.4",
        "description_standard": "Avertisseur de fumée installé à un emplacement non conforme (trop près d'un mur, cuisine, salle de bain).",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.3.5",
        "description_standard": "Avertisseur de monoxyde de carbone (CO) manquant dans un logement avec appareil à combustion ou garage attenant.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.4.1",
        "description_standard": "Système de détection incendie non fonctionnel ou présentant des défectuosités.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.4.2",
        "description_standard": "Détecteurs de fumée du système central hors service, obstrués ou non entretenus.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.1.4.3",
        "description_standard": "Essai et vérification annuelle du système de détection non effectués ou non documentés.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Détection"
    },
    
    # ========== ALARME INCENDIE (CNPI Division B Section 2.6) ==========
    {
        "code_article": "CNPI 2.6.1.1",
        "description_standard": "Système d'alarme incendie non fonctionnel ou défectueux.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.1.2",
        "description_standard": "Avertisseurs sonores (cloches, sirènes) du système d'alarme défectueux ou inaudibles.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.1.3",
        "description_standard": "Déclencheurs manuels (postes d'alarme) obstrués, non accessibles ou non identifiés.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.1.4",
        "description_standard": "Panneau de contrôle d'alarme incendie présentant des défauts non corrigés ou des signaux de trouble.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.1.5",
        "description_standard": "Essai et vérification annuelle du système d'alarme non effectués selon CAN/ULC-S536.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.1.6",
        "description_standard": "Liaison au service d'incendie (centrale de surveillance) non fonctionnelle ou déconnectée.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.6.2.1",
        "description_standard": "Signaux visuels (stroboscopes) pour malentendants manquants ou non fonctionnels.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Alarme"
    },
    
    # ========== ÉCLAIRAGE D'URGENCE (CNPI Division B Section 2.7.3) ==========
    {
        "code_article": "CNPI 2.7.3.1",
        "description_standard": "Système d'éclairage d'urgence non fonctionnel ou batteries défectueuses.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Éclairage Urgence"
    },
    {
        "code_article": "CNPI 2.7.3.2",
        "description_standard": "Niveau d'éclairement insuffisant dans les voies d'évacuation (minimum 10 lux au sol).",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Éclairage Urgence"
    },
    {
        "code_article": "CNPI 2.7.3.3",
        "description_standard": "Durée d'autonomie de l'éclairage d'urgence insuffisante (minimum 30 min, 1h ou 2h selon usage).",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Éclairage Urgence"
    },
    {
        "code_article": "CNPI 2.7.3.4",
        "description_standard": "Essai mensuel de l'éclairage d'urgence non effectué ou non documenté.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Éclairage Urgence"
    },
    {
        "code_article": "CNPI 2.7.3.5",
        "description_standard": "Enseignes de sortie (EXIT) non éclairées, endommagées ou non visibles.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Éclairage Urgence"
    },
    
    # ========== MOYENS D'ÉVACUATION / ISSUES (CNPI Division B Section 2.7) ==========
    {
        "code_article": "CNPI 2.7.1.1",
        "description_standard": "Issue de secours verrouillée, bloquée ou obstruée empêchant l'évacuation.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.1.2",
        "description_standard": "Corridor ou voie d'évacuation obstrué par du mobilier, des équipements ou des marchandises.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.1.3",
        "description_standard": "Largeur minimale de la voie d'évacuation non respectée (obstruction partielle).",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.1.4",
        "description_standard": "Quincaillerie de porte d'issue non conforme (barre panique absente ou défectueuse).",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.1.5",
        "description_standard": "Escalier d'issue encombré ou utilisé comme espace d'entreposage.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.1.6",
        "description_standard": "Main courante d'escalier manquante, non continue ou non conforme.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.7.2.1",
        "description_standard": "Signalisation des issues de secours manquante, non visible ou non conforme.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Moyens d'évacuation"
    },
    
    # ========== SÉPARATIONS COUPE-FEU / PORTES (CNPI Division B Section 2.3) ==========
    {
        "code_article": "CNPI 2.3.2.1",
        "description_standard": "Porte coupe-feu maintenue ouverte sans dispositif de fermeture automatique conforme.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_article": "CNPI 2.3.2.2",
        "description_standard": "Ferme-porte automatique absent, défectueux ou désactivé sur porte coupe-feu.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_article": "CNPI 2.3.2.3",
        "description_standard": "Porte coupe-feu endommagée, déformée ou ne se fermant pas hermétiquement.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_article": "CNPI 2.3.2.4",
        "description_standard": "Joint intumescent de porte coupe-feu endommagé ou manquant.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_article": "CNPI 2.3.3.1",
        "description_standard": "Ouverture non protégée dans une séparation coupe-feu (trous, passages de câbles non scellés).",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_article": "CNPI 2.3.3.2",
        "description_standard": "Coupe-feu perforé ou altéré par des travaux (plafond, mur) sans scellement approprié.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Séparations coupe-feu"
    },
    
    # ========== ENTREPOSAGE / MATIÈRES DANGEREUSES (CNPI Division B Section 2.4) ==========
    {
        "code_article": "CNPI 2.4.1.1",
        "description_standard": "Accumulation de matières combustibles représentant un risque d'incendie.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Entreposage"
    },
    {
        "code_article": "CNPI 2.4.1.2",
        "description_standard": "Entreposage de matières combustibles à moins de 1 mètre des appareils de chauffage.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Entreposage"
    },
    {
        "code_article": "CNPI 2.4.1.3",
        "description_standard": "Entreposage de matières dangereuses (inflammables, explosifs) non conforme.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Entreposage"
    },
    {
        "code_article": "CNPI 2.4.1.4",
        "description_standard": "Contenants de liquides inflammables non conformes ou mal entreposés.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Entreposage"
    },
    {
        "code_article": "CNPI 2.4.1.5",
        "description_standard": "Local de rangement ou vide technique encombré de matières combustibles.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Entreposage"
    },
    {
        "code_article": "CNPI 2.4.2.1",
        "description_standard": "Bonbonnes de propane ou gaz comprimé entreposées à l'intérieur contrairement aux normes.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Entreposage"
    },
    
    # ========== SYSTÈMES DE GICLEURS (CNPI Division B Section 2.5) ==========
    {
        "code_article": "CNPI 2.5.1.1",
        "description_standard": "Système de gicleurs hors service ou vannes de contrôle fermées.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Gicleurs"
    },
    {
        "code_article": "CNPI 2.5.1.2",
        "description_standard": "Têtes de gicleurs obstruées, peintes, endommagées ou recouvertes.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Gicleurs"
    },
    {
        "code_article": "CNPI 2.5.1.3",
        "description_standard": "Dégagement insuffisant sous les têtes de gicleurs (min. 450 mm d'entreposage).",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Gicleurs"
    },
    {
        "code_article": "CNPI 2.5.1.4",
        "description_standard": "Inspection et essai annuels du système de gicleurs non effectués selon NFPA 25.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Gicleurs"
    },
    {
        "code_article": "CNPI 2.5.1.5",
        "description_standard": "Raccord-pompier (connexion siamoise) obstrué, endommagé ou non accessible.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Gicleurs"
    },
    
    # ========== PLANS ET PROCÉDURES (CNPI Division B Section 2.8) ==========
    {
        "code_article": "CNPI 2.8.1.1",
        "description_standard": "Plan de sécurité incendie absent ou non conforme aux exigences.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Plans"
    },
    {
        "code_article": "CNPI 2.8.1.2",
        "description_standard": "Plan d'évacuation non affiché ou non visible dans les aires communes.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Plans"
    },
    {
        "code_article": "CNPI 2.8.1.3",
        "description_standard": "Plan d'évacuation obsolète (ne reflète pas l'aménagement actuel du bâtiment).",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Plans"
    },
    {
        "code_article": "CNPI 2.8.2.1",
        "description_standard": "Exercice d'évacuation annuel non effectué ou non documenté.",
        "delai_jours": 60,
        "severite": "mineure",
        "categorie": "Plans"
    },
    {
        "code_article": "CNPI 2.8.2.2",
        "description_standard": "Formation du personnel sur les procédures d'urgence non effectuée.",
        "delai_jours": 60,
        "severite": "mineure",
        "categorie": "Plans"
    },
    
    # ========== ÉLECTRICITÉ (CNPI Division B Section 6) ==========
    {
        "code_article": "CNPI 6.1.1.1",
        "description_standard": "Installation électrique présentant des risques apparents (fils dénudés, surcharge).",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Électricité"
    },
    {
        "code_article": "CNPI 6.1.1.2",
        "description_standard": "Panneau électrique obstrué ou inaccessible (dégagement min. 1 mètre).",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Électricité"
    },
    {
        "code_article": "CNPI 6.1.1.3",
        "description_standard": "Utilisation abusive de rallonges électriques comme installation permanente.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Électricité"
    },
    {
        "code_article": "CNPI 6.1.1.4",
        "description_standard": "Prises électriques ou interrupteurs endommagés présentant un risque.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Électricité"
    },
    {
        "code_article": "CNPI 6.1.1.5",
        "description_standard": "Barres multiprises en cascade (daisy chain) créant un risque de surcharge.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Électricité"
    },
    
    # ========== CHAUFFAGE ET VENTILATION (CNPI Division B Section 6) ==========
    {
        "code_article": "CNPI 6.3.1.1",
        "description_standard": "Appareil de chauffage non entretenu ou inspection annuelle non effectuée.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Chauffage"
    },
    {
        "code_article": "CNPI 6.3.1.2",
        "description_standard": "Cheminée non ramonée ou conduit d'évacuation obstrué ou détérioré.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Chauffage"
    },
    {
        "code_article": "CNPI 6.3.1.3",
        "description_standard": "Dégagement insuffisant entre l'appareil de chauffage et les matériaux combustibles.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Chauffage"
    },
    {
        "code_article": "CNPI 6.3.1.4",
        "description_standard": "Appareil de chauffage d'appoint non homologué ou utilisé de façon non sécuritaire.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Chauffage"
    },
    {
        "code_article": "CNPI 6.3.2.1",
        "description_standard": "Système de ventilation de cuisine commerciale non entretenu (hottes, conduits gras).",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Chauffage"
    },
    
    # ========== EXIGENCES MUNICIPALES ==========
    {
        "code_article": "RM Art. 1",
        "description_standard": "Numéro civique non visible ou non conforme depuis la voie publique.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Municipal"
    },
    {
        "code_article": "RM Art. 2",
        "description_standard": "Accès au bâtiment pour les services d'urgence obstrué ou inadéquat.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Municipal"
    },
    {
        "code_article": "RM Art. 3",
        "description_standard": "Borne d'incendie obstruée ou inaccessible (dégagement min. 1,5 m).",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Municipal"
    },
    {
        "code_article": "RM Art. 4",
        "description_standard": "Voie d'accès pour véhicules d'urgence non dégagée ou non carrossable.",
        "delai_jours": 7,
        "severite": "majeure",
        "categorie": "Municipal"
    },
    {
        "code_article": "RM Art. 5",
        "description_standard": "Absence de clé ou d'accès au bâtiment pour le service d'incendie (boîte à clé).",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Municipal"
    },
]


# ==================== SYSTÈME DE PRÉDICTION D'ARTICLES ====================
# Mots-clés pondérés pour la prédiction d'articles basée sur le texte

MOTS_CLES_PREDICTION = {
    # Catégorie Extincteurs
    "extincteur": {"categorie": "Extincteurs", "poids": 10},
    "extincteurs": {"categorie": "Extincteurs", "poids": 10},
    "portatif": {"categorie": "Extincteurs", "poids": 5},
    "pression": {"categorie": "Extincteurs", "poids": 4, "articles": ["CNPI 6.2.1.6"]},
    "classe a": {"categorie": "Extincteurs", "poids": 5},
    "classe b": {"categorie": "Extincteurs", "poids": 5},
    "classe c": {"categorie": "Extincteurs", "poids": 5},
    "nfpa 10": {"categorie": "Extincteurs", "poids": 8},
    
    # Catégorie Détection
    "détecteur": {"categorie": "Détection", "poids": 10},
    "détecteurs": {"categorie": "Détection", "poids": 10},
    "avertisseur": {"categorie": "Détection", "poids": 10},
    "avertisseurs": {"categorie": "Détection", "poids": 10},
    "fumée": {"categorie": "Détection", "poids": 8},
    "monoxyde": {"categorie": "Détection", "poids": 8, "articles": ["CNPI 2.1.3.5"]},
    "co": {"categorie": "Détection", "poids": 6, "articles": ["CNPI 2.1.3.5"]},
    "pile": {"categorie": "Détection", "poids": 5, "articles": ["CNPI 2.1.3.2"]},
    "batterie": {"categorie": "Détection", "poids": 4},
    "10 ans": {"categorie": "Détection", "poids": 6, "articles": ["CNPI 2.1.3.3"]},
    
    # Catégorie Alarme
    "alarme": {"categorie": "Alarme", "poids": 10},
    "sirène": {"categorie": "Alarme", "poids": 8},
    "cloche": {"categorie": "Alarme", "poids": 8},
    "déclencheur": {"categorie": "Alarme", "poids": 8, "articles": ["CNPI 2.6.1.3"]},
    "poste d'alarme": {"categorie": "Alarme", "poids": 9},
    "panneau": {"categorie": "Alarme", "poids": 6, "articles": ["CNPI 2.6.1.4"]},
    "centrale": {"categorie": "Alarme", "poids": 7, "articles": ["CNPI 2.6.1.6"]},
    "surveillance": {"categorie": "Alarme", "poids": 6, "articles": ["CNPI 2.6.1.6"]},
    "stroboscope": {"categorie": "Alarme", "poids": 8, "articles": ["CNPI 2.6.2.1"]},
    "malentendant": {"categorie": "Alarme", "poids": 7, "articles": ["CNPI 2.6.2.1"]},
    
    # Catégorie Éclairage Urgence
    "éclairage": {"categorie": "Éclairage Urgence", "poids": 8},
    "urgence": {"categorie": "Éclairage Urgence", "poids": 5},
    "exit": {"categorie": "Éclairage Urgence", "poids": 9, "articles": ["CNPI 2.7.3.5"]},
    "sortie": {"categorie": "Éclairage Urgence", "poids": 6},
    "enseigne": {"categorie": "Éclairage Urgence", "poids": 7, "articles": ["CNPI 2.7.3.5"]},
    "autonomie": {"categorie": "Éclairage Urgence", "poids": 6, "articles": ["CNPI 2.7.3.3"]},
    "lux": {"categorie": "Éclairage Urgence", "poids": 7, "articles": ["CNPI 2.7.3.2"]},
    
    # Catégorie Moyens d'évacuation
    "issue": {"categorie": "Moyens d'évacuation", "poids": 9},
    "issues": {"categorie": "Moyens d'évacuation", "poids": 9},
    "évacuation": {"categorie": "Moyens d'évacuation", "poids": 8},
    "corridor": {"categorie": "Moyens d'évacuation", "poids": 7},
    "couloir": {"categorie": "Moyens d'évacuation", "poids": 7},
    "escalier": {"categorie": "Moyens d'évacuation", "poids": 8, "articles": ["CNPI 2.7.1.5", "CNPI 2.7.1.6"]},
    "main courante": {"categorie": "Moyens d'évacuation", "poids": 8, "articles": ["CNPI 2.7.1.6"]},
    "barre panique": {"categorie": "Moyens d'évacuation", "poids": 9, "articles": ["CNPI 2.7.1.4"]},
    "quincaillerie": {"categorie": "Moyens d'évacuation", "poids": 6, "articles": ["CNPI 2.7.1.4"]},
    "signalisation": {"categorie": "Moyens d'évacuation", "poids": 6, "articles": ["CNPI 2.7.2.1"]},
    
    # Catégorie Séparations coupe-feu
    "coupe-feu": {"categorie": "Séparations coupe-feu", "poids": 10},
    "coupe feu": {"categorie": "Séparations coupe-feu", "poids": 10},
    "ferme-porte": {"categorie": "Séparations coupe-feu", "poids": 9, "articles": ["CNPI 2.3.2.2"]},
    "ferme porte": {"categorie": "Séparations coupe-feu", "poids": 9, "articles": ["CNPI 2.3.2.2"]},
    "intumescent": {"categorie": "Séparations coupe-feu", "poids": 9, "articles": ["CNPI 2.3.2.4"]},
    "scellement": {"categorie": "Séparations coupe-feu", "poids": 7, "articles": ["CNPI 2.3.3.1", "CNPI 2.3.3.2"]},
    "pénétration": {"categorie": "Séparations coupe-feu", "poids": 7, "articles": ["CNPI 2.3.3.1"]},
    "câbles": {"categorie": "Séparations coupe-feu", "poids": 5, "articles": ["CNPI 2.3.3.1"]},
    
    # Catégorie Entreposage
    "entreposage": {"categorie": "Entreposage", "poids": 9},
    "combustible": {"categorie": "Entreposage", "poids": 8},
    "combustibles": {"categorie": "Entreposage", "poids": 8},
    "inflammable": {"categorie": "Entreposage", "poids": 9},
    "inflammables": {"categorie": "Entreposage", "poids": 9},
    "propane": {"categorie": "Entreposage", "poids": 10, "articles": ["CNPI 2.4.2.1"]},
    "bonbonne": {"categorie": "Entreposage", "poids": 9, "articles": ["CNPI 2.4.2.1"]},
    "gaz": {"categorie": "Entreposage", "poids": 7, "articles": ["CNPI 2.4.2.1"]},
    "liquide": {"categorie": "Entreposage", "poids": 5, "articles": ["CNPI 2.4.1.4"]},
    "accumulation": {"categorie": "Entreposage", "poids": 8, "articles": ["CNPI 2.4.1.1"]},
    "encombré": {"categorie": "Entreposage", "poids": 7},
    "encombrement": {"categorie": "Entreposage", "poids": 7},
    
    # Catégorie Gicleurs
    "gicleur": {"categorie": "Gicleurs", "poids": 10},
    "gicleurs": {"categorie": "Gicleurs", "poids": 10},
    "sprinkler": {"categorie": "Gicleurs", "poids": 10},
    "sprinkleur": {"categorie": "Gicleurs", "poids": 10},
    "tête de gicleur": {"categorie": "Gicleurs", "poids": 10},
    "vanne": {"categorie": "Gicleurs", "poids": 7, "articles": ["CNPI 2.5.1.1"]},
    "siamoise": {"categorie": "Gicleurs", "poids": 9, "articles": ["CNPI 2.5.1.5"]},
    "raccord-pompier": {"categorie": "Gicleurs", "poids": 10, "articles": ["CNPI 2.5.1.5"]},
    "nfpa 25": {"categorie": "Gicleurs", "poids": 8, "articles": ["CNPI 2.5.1.4"]},
    
    # Catégorie Plans
    "plan": {"categorie": "Plans", "poids": 7},
    "plans": {"categorie": "Plans", "poids": 7},
    "affichage": {"categorie": "Plans", "poids": 5, "articles": ["CNPI 2.8.1.2"]},
    "affiché": {"categorie": "Plans", "poids": 5, "articles": ["CNPI 2.8.1.2"]},
    "exercice": {"categorie": "Plans", "poids": 7, "articles": ["CNPI 2.8.2.1"]},
    "formation": {"categorie": "Plans", "poids": 6, "articles": ["CNPI 2.8.2.2"]},
    "procédure": {"categorie": "Plans", "poids": 5},
    
    # Catégorie Électricité
    "électrique": {"categorie": "Électricité", "poids": 8},
    "électricité": {"categorie": "Électricité", "poids": 8},
    "panneau électrique": {"categorie": "Électricité", "poids": 9, "articles": ["CNPI 6.1.1.2"]},
    "rallonge": {"categorie": "Électricité", "poids": 8, "articles": ["CNPI 6.1.1.3"]},
    "multiprise": {"categorie": "Électricité", "poids": 8, "articles": ["CNPI 6.1.1.5"]},
    "barre multiprise": {"categorie": "Électricité", "poids": 9, "articles": ["CNPI 6.1.1.5"]},
    "surcharge": {"categorie": "Électricité", "poids": 7},
    "fil dénudé": {"categorie": "Électricité", "poids": 9, "articles": ["CNPI 6.1.1.1"]},
    "prise": {"categorie": "Électricité", "poids": 5, "articles": ["CNPI 6.1.1.4"]},
    
    # Catégorie Chauffage
    "chauffage": {"categorie": "Chauffage", "poids": 9},
    "cheminée": {"categorie": "Chauffage", "poids": 9, "articles": ["CNPI 6.3.1.2"]},
    "ramonage": {"categorie": "Chauffage", "poids": 9, "articles": ["CNPI 6.3.1.2"]},
    "conduit": {"categorie": "Chauffage", "poids": 6},
    "hotte": {"categorie": "Chauffage", "poids": 8, "articles": ["CNPI 6.3.2.1"]},
    "cuisine commerciale": {"categorie": "Chauffage", "poids": 9, "articles": ["CNPI 6.3.2.1"]},
    "dégagement": {"categorie": "Chauffage", "poids": 6, "articles": ["CNPI 6.3.1.3"]},
    
    # Catégorie Municipal
    "numéro civique": {"categorie": "Municipal", "poids": 10, "articles": ["RM Art. 1"]},
    "adresse": {"categorie": "Municipal", "poids": 5, "articles": ["RM Art. 1"]},
    "borne": {"categorie": "Municipal", "poids": 8, "articles": ["RM Art. 3"]},
    "borne-fontaine": {"categorie": "Municipal", "poids": 10, "articles": ["RM Art. 3"]},
    "hydrant": {"categorie": "Municipal", "poids": 10, "articles": ["RM Art. 3"]},
    "accès pompier": {"categorie": "Municipal", "poids": 9, "articles": ["RM Art. 2", "RM Art. 4"]},
    "voie d'accès": {"categorie": "Municipal", "poids": 8, "articles": ["RM Art. 4"]},
    "clé": {"categorie": "Municipal", "poids": 5, "articles": ["RM Art. 5"]},
    "boîte à clé": {"categorie": "Municipal", "poids": 9, "articles": ["RM Art. 5"]},
    
    # Mots-clés d'état/action (bonus de score)
    "manquant": {"bonus": 3},
    "manquante": {"bonus": 3},
    "manquants": {"bonus": 3},
    "manquantes": {"bonus": 3},
    "absent": {"bonus": 3},
    "absente": {"bonus": 3},
    "absents": {"bonus": 3},
    "défectueux": {"bonus": 4},
    "défectueuse": {"bonus": 4},
    "hors service": {"bonus": 5},
    "non fonctionnel": {"bonus": 5},
    "obstrué": {"bonus": 4},
    "obstruée": {"bonus": 4},
    "bloqué": {"bonus": 4},
    "bloquée": {"bonus": 4},
    "verrouillé": {"bonus": 3},
    "verrouillée": {"bonus": 3},
    "endommagé": {"bonus": 3},
    "endommagée": {"bonus": 3},
    "brisé": {"bonus": 4},
    "brisée": {"bonus": 4},
    "expiré": {"bonus": 3},
    "expirée": {"bonus": 3},
    "non conforme": {"bonus": 4},
    "insuffisant": {"bonus": 3},
    "insuffisante": {"bonus": 3},
}

def normalize_text(text: str) -> str:
    """Normalise le texte pour la recherche (minuscules, accents conservés)"""
    return text.lower().strip()

def calculer_score_article(texte: str, article: dict, tous_articles: list) -> dict:
    """
    Calcule le score de pertinence d'un article par rapport au texte donné.
    Retourne un dict avec l'article et son score.
    """
    texte_normalise = normalize_text(texte)
    score = 0
    mots_trouves = []
    
    # Vérifier chaque mot-clé
    for mot_cle, config in MOTS_CLES_PREDICTION.items():
        if mot_cle in texte_normalise:
            # Bonus si le mot-clé pointe directement vers cet article
            if "articles" in config and article.get("code_article") in config["articles"]:
                score += config.get("poids", 5) * 2  # Double le score pour match direct
                mots_trouves.append(f"{mot_cle} (direct)")
            # Score de catégorie
            elif "categorie" in config and config["categorie"] == article.get("categorie"):
                score += config.get("poids", 5)
                mots_trouves.append(mot_cle)
            # Bonus d'état/action
            elif "bonus" in config:
                score += config["bonus"]
    
    # Bonus si des mots du texte apparaissent dans la description de l'article
    description_article = normalize_text(article.get("description_standard", ""))
    mots_texte = texte_normalise.split()
    for mot in mots_texte:
        if len(mot) > 3 and mot in description_article:
            score += 2
    
    # Score minimum pour être considéré
    if score < 5:
        return None
    
    # Calculer le pourcentage de confiance (max théorique ~50 points)
    confiance = min(100, int((score / 40) * 100))
    
    return {
        "article": article,
        "score": score,
        "confiance": confiance,
        "mots_cles_trouves": mots_trouves
    }

async def predire_articles(tenant_id: str, texte: str, limite: int = 10) -> list:
    """
    Prédit les articles pertinents basés sur le texte fourni.
    Retourne une liste d'articles avec leur score de confiance.
    """
    if not texte or len(texte.strip()) < 3:
        return []
    
    # Récupérer tous les articles actifs du tenant
    articles = await db.ref_violations.find({
        "tenant_id": tenant_id,
        "actif": True
    }).to_list(1000)
    
    if not articles:
        return []
    
    # Calculer le score pour chaque article
    resultats = []
    for article in articles:
        resultat = calculer_score_article(texte, article, articles)
        if resultat:
            resultats.append(resultat)
    
    # Trier par score décroissant
    resultats.sort(key=lambda x: x["score"], reverse=True)
    
    # Limiter et formater les résultats
    return resultats[:limite]


# ==================== ROUTES RÉFÉRENTIEL VIOLATIONS ====================

@router.get("/{tenant_slug}/prevention/ref-violations")
async def list_ref_violations(
    tenant_slug: str,
    categorie: Optional[str] = None,
    severite: Optional[str] = None,
    actif: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste des articles de référence pour les violations"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if categorie:
        query["categorie"] = categorie
    if severite:
        query["severite"] = severite
    # Par défaut, retourner uniquement les actifs, sauf si explicitement demandé
    if actif is not None:
        query["actif"] = actif
    else:
        # Par défaut, ne pas filtrer (retourner tous)
        pass
    
    violations = await db.ref_violations.find(query).sort("code_article", 1).to_list(500)
    return [clean_mongo_doc(v) for v in violations]


@router.get("/{tenant_slug}/prevention/ref-violations/categories")
async def get_categories_violations(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste des catégories distinctes"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    pipeline = [
        {"$match": {"tenant_id": tenant.id, "actif": True}},
        {"$group": {"_id": "$categorie"}},
        {"$sort": {"_id": 1}}
    ]
    
    result = await db.ref_violations.aggregate(pipeline).to_list(100)
    return [r["_id"] for r in result if r["_id"]]


@router.get("/{tenant_slug}/prevention/ref-violations/{violation_id}")
async def get_ref_violation(
    tenant_slug: str,
    violation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Détail d'un article de référence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    violation = await db.ref_violations.find_one({
        "id": violation_id,
        "tenant_id": tenant.id
    })
    
    if not violation:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    
    return clean_mongo_doc(violation)


@router.post("/{tenant_slug}/prevention/ref-violations")
async def create_ref_violation(
    tenant_slug: str,
    data: RefViolationCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouvel article de référence"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le code n'existe pas déjà
    existing = await db.ref_violations.find_one({
        "tenant_id": tenant.id,
        "code_article": data.code_article
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Le code {data.code_article} existe déjà")
    
    violation = RefViolation(
        tenant_id=tenant.id,
        **data.dict()
    )
    
    await db.ref_violations.insert_one(violation.dict())
    logger.info(f"[REF-VIOLATION] Article {data.code_article} créé par {current_user.email}")
    
    return clean_mongo_doc(violation.dict())


@router.put("/{tenant_slug}/prevention/ref-violations/{violation_id}")
async def update_ref_violation(
    tenant_slug: str,
    violation_id: str,
    data: RefViolationUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un article de référence"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    violation = await db.ref_violations.find_one({
        "id": violation_id,
        "tenant_id": tenant.id
    })
    if not violation:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    for field, value in data.dict(exclude_unset=True).items():
        if value is not None:
            updates[field] = value
    
    await db.ref_violations.update_one(
        {"id": violation_id, "tenant_id": tenant.id},
        {"$set": updates}
    )
    
    updated = await db.ref_violations.find_one({"id": violation_id})
    return clean_mongo_doc(updated)


@router.delete("/{tenant_slug}/prevention/ref-violations/{violation_id}")
async def delete_ref_violation(
    tenant_slug: str,
    violation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un article de référence"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.ref_violations.delete_one({
        "id": violation_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article non trouvé")
    
    return {"message": "Article supprimé"}


@router.post("/{tenant_slug}/prevention/ref-violations/init")
async def init_ref_violations(
    tenant_slug: str,
    force: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Initialiser le référentiel avec les données par défaut"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier s'il existe déjà des données
    existing = await db.ref_violations.count_documents({"tenant_id": tenant.id})
    if existing > 0 and not force:
        # Supprimer les articles existants si force=true ou si le frontend a déjà supprimé
        raise HTTPException(
            status_code=400,
            detail=f"Le référentiel contient déjà {existing} articles. Utilisez force=true pour réinitialiser."
        )
    
    # Supprimer les articles existants si force=true
    if existing > 0 and force:
        await db.ref_violations.delete_many({"tenant_id": tenant.id})
        logger.info(f"[REF-VIOLATION] {existing} articles supprimés pour réinitialisation")
    
    # Créer les articles par défaut
    articles = []
    for v in VIOLATIONS_DEFAUT:
        article = RefViolation(
            tenant_id=tenant.id,
            code_article=v["code_article"],
            description_standard=v["description_standard"],
            delai_jours=v["delai_jours"],
            severite=v["severite"],
            categorie=v["categorie"]
        )
        articles.append(article.dict())
    
    await db.ref_violations.insert_many(articles)
    
    logger.info(f"[REF-VIOLATION] {len(articles)} articles initialisés pour {tenant_slug}")
    
    return {
        "message": f"{len(articles)} articles de référence créés",
        "articles": [clean_mongo_doc(a) for a in articles]
    }


# Modèle pour la requête de prédiction
class PredictionRequest(BaseModel):
    texte: str
    limite: int = 10
    methode: str = "hybride"  # "hybride", "ml", ou "keywords"


# Import du service de prédiction ML
try:
    from services.prediction_cnpi_service import (
        get_predicteur,
        entrainer_predicteur,
        predire_articles_ml,
        predire_articles_hybride
    )
    ML_DISPONIBLE = True
except ImportError:
    ML_DISPONIBLE = False
    logger.warning("Service de prédiction ML non disponible, utilisation des mots-clés uniquement")


@router.post("/{tenant_slug}/prevention/ref-violations/predire")
async def predire_articles_endpoint(
    tenant_slug: str,
    data: PredictionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Prédit les articles de référence pertinents basés sur un texte.
    Utilisé pour suggérer des articles lors de la création de non-conformités.
    
    Méthodes disponibles:
    - "hybride" (défaut): Combine ML (TF-IDF) et mots-clés pour les meilleurs résultats
    - "ml": Utilise uniquement l'algorithme TF-IDF + similarité cosinus
    - "keywords": Utilise uniquement l'algorithme par mots-clés (legacy)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Toujours calculer les résultats par mots-clés (rapide et fiable)
    resultats_keywords = await predire_articles(tenant.id, data.texte, data.limite * 2)
    
    # Déterminer la méthode à utiliser
    methode_utilisee = data.methode
    
    if ML_DISPONIBLE and data.methode in ("hybride", "ml"):
        # S'assurer que le modèle est entraîné
        predicteur = get_predicteur()
        
        if not predicteur.is_fitted:
            # Entraîner le modèle avec les articles du tenant
            articles = await db.ref_violations.find({
                "tenant_id": tenant.id,
                "actif": True
            }).to_list(1000)
            
            if articles:
                await entrainer_predicteur(articles)
        
        # Utiliser la méthode appropriée
        if predicteur.is_fitted:
            if data.methode == "ml":
                resultats = predire_articles_ml(data.texte, data.limite)
            else:  # hybride
                resultats = predire_articles_hybride(data.texte, resultats_keywords, data.limite)
        else:
            # Fallback aux mots-clés si l'entraînement a échoué
            resultats = resultats_keywords[:data.limite]
            methode_utilisee = "keywords"
    else:
        # Utiliser uniquement les mots-clés
        resultats = resultats_keywords[:data.limite]
        methode_utilisee = "keywords"
    
    # Formater les résultats pour le frontend
    suggestions = []
    for r in resultats:
        article = r["article"]
        suggestion = {
            "id": article.get("id"),
            "code_article": article.get("code_article"),
            "description_standard": article.get("description_standard"),
            "categorie": article.get("categorie"),
            "severite": article.get("severite"),
            "delai_jours": article.get("delai_jours"),
            "confiance": r.get("confiance", 0),
            "score": r.get("score", 0),
            "mots_cles_trouves": r.get("mots_cles_trouves", [])
        }
        
        # Ajouter les scores détaillés si disponibles (mode hybride)
        if "score_ml" in r:
            suggestion["score_ml"] = r["score_ml"]
        if "score_keywords" in r:
            suggestion["score_keywords"] = r["score_keywords"]
        
        suggestions.append(suggestion)
    
    return {
        "texte_analyse": data.texte,
        "methode": methode_utilisee,
        "ml_disponible": ML_DISPONIBLE,
        "suggestions": suggestions,
        "total": len(suggestions)
    }


# ==================== ROUTES AVIS DE NON-CONFORMITÉ ====================

async def generer_numero_avis(tenant_id: str) -> str:
    """Génère un numéro d'avis unique: ANC-YYYY-NNN"""
    annee = datetime.now().year
    
    # Compter les avis de cette année
    count = await db.avis_non_conformite.count_documents({
        "tenant_id": tenant_id,
        "numero_avis": {"$regex": f"^ANC-{annee}-"}
    })
    
    return f"ANC-{annee}-{str(count + 1).zfill(3)}"


@router.post("/{tenant_slug}/prevention/inspections/{inspection_id}/generer-avis")
async def generer_avis_non_conformite(
    tenant_slug: str,
    inspection_id: str,
    data: GenerateAvisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Génère un avis de non-conformité pour une inspection.
    
    Workflow automatique:
    1. Génère le PDF de l'avis
    2. Met à jour le statut de l'inspection → "en_attente_reinspection"
    3. Crée une tâche de suivi dans le calendrier
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'inspection
    inspection = await db.inspections.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    if not inspection:
        # Chercher dans inspections_visuelles
        inspection = await db.inspections_visuelles.find_one({
            "id": inspection_id,
            "tenant_id": tenant.id
        })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    # Récupérer le bâtiment
    batiment_id = inspection.get("batiment_id")
    batiment = await db.batiments.find_one({
        "id": batiment_id,
        "tenant_id": tenant.id
    })
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Déterminer le destinataire
    if data.destinataire_type == "gestionnaire":
        dest_nom = batiment.get("gestionnaire_nom", "")
        dest_prenom = batiment.get("gestionnaire_prenom", "")
        dest_adresse = batiment.get("gestionnaire_adresse", batiment.get("adresse_civique", ""))
        dest_ville = batiment.get("gestionnaire_ville", batiment.get("ville", ""))
        dest_cp = batiment.get("gestionnaire_code_postal", batiment.get("code_postal", ""))
    else:
        dest_nom = batiment.get("proprietaire_nom", "")
        dest_prenom = batiment.get("proprietaire_prenom", "")
        dest_adresse = batiment.get("proprietaire_adresse", batiment.get("adresse_civique", ""))
        dest_ville = batiment.get("proprietaire_ville", batiment.get("ville", ""))
        dest_cp = batiment.get("proprietaire_code_postal", batiment.get("code_postal", ""))
    
    # Si pas d'adresse du destinataire, utiliser celle du bâtiment
    if not dest_adresse:
        dest_adresse = batiment.get("adresse_civique", "")
    if not dest_ville:
        dest_ville = batiment.get("ville", "")
    if not dest_cp:
        dest_cp = batiment.get("code_postal", "")
    
    # Date d'inspection
    date_inspection = inspection.get("date_inspection", inspection.get("date", datetime.now().strftime("%Y-%m-%d")))
    date_insp_obj = datetime.strptime(date_inspection, "%Y-%m-%d")
    
    # Traiter les violations
    violations_avis = []
    date_echeance_min = None
    
    for v in data.violations:
        ref_id = v.get("ref_violation_id")
        
        # Récupérer l'article de référence
        ref_violation = await db.ref_violations.find_one({
            "id": ref_id,
            "tenant_id": tenant.id
        })
        
        if not ref_violation:
            # Si l'article n'existe pas, utiliser les données fournies
            code = v.get("code_article", "N/A")
            description = v.get("description", "Infraction constatée")
            delai = v.get("delai_jours", 30)
            severite = v.get("severite", "majeure")
        else:
            code = ref_violation.get("code_article")
            description = v.get("description") or ref_violation.get("description_standard")
            delai = v.get("delai_jours") or ref_violation.get("delai_jours", 30)
            severite = ref_violation.get("severite", "majeure")
        
        # Calculer la date limite
        date_limite_obj = date_insp_obj + timedelta(days=delai)
        date_limite = date_limite_obj.strftime("%Y-%m-%d")
        
        # Mettre à jour la date d'échéance minimale
        if date_echeance_min is None or date_limite_obj < datetime.strptime(date_echeance_min, "%Y-%m-%d"):
            date_echeance_min = date_limite
        
        violation_avis = ViolationAvis(
            ref_violation_id=ref_id or "",
            code_article=code,
            description=description,
            delai_jours=delai,
            date_limite=date_limite,
            severite=severite,
            notes=v.get("notes", "")
        )
        violations_avis.append(violation_avis)
    
    if not violations_avis:
        raise HTTPException(status_code=400, detail="Aucune violation spécifiée")
    
    # Générer le numéro d'avis
    numero_avis = await generer_numero_avis(tenant.id)
    
    # Récupérer le préventionniste
    preventionniste_id = inspection.get("preventionniste_id", current_user.id)
    preventionniste = await db.users.find_one({"id": preventionniste_id})
    preventionniste_nom = f"{preventionniste.get('prenom', '')} {preventionniste.get('nom', '')}" if preventionniste else current_user.nom
    
    # Créer l'avis
    avis = AvisNonConformite(
        tenant_id=tenant.id,
        inspection_id=inspection_id,
        batiment_id=batiment_id,
        numero_avis=numero_avis,
        date_generation=datetime.now().strftime("%Y-%m-%d"),
        date_inspection=date_inspection,
        destinataire_type=data.destinataire_type,
        destinataire_nom=dest_nom,
        destinataire_prenom=dest_prenom,
        destinataire_adresse=dest_adresse,
        destinataire_ville=dest_ville,
        destinataire_code_postal=dest_cp,
        batiment_nom=batiment.get("nom_etablissement", ""),
        batiment_adresse=batiment.get("adresse_civique", ""),
        batiment_ville=batiment.get("ville", ""),
        violations=[v.dict() for v in violations_avis],
        date_echeance_min=date_echeance_min,
        preventionniste_id=preventionniste_id,
        preventionniste_nom=preventionniste_nom,
        notes=data.notes
    )
    
    # Sauvegarder l'avis
    await db.avis_non_conformite.insert_one(avis.dict())
    
    # === WORKFLOW AUTOMATIQUE ===
    
    # 1. Mettre à jour le statut de l'inspection
    collection_inspection = "inspections" if await db.inspections.find_one({"id": inspection_id}) else "inspections_visuelles"
    await db[collection_inspection].update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_attente_reinspection",
            "statut_conformite": "non_conforme",
            "avis_non_conformite_id": avis.id,
            "date_echeance_correction": date_echeance_min,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # 2. Créer une tâche de suivi dans le calendrier des inspections
    tache_suivi = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "type": "reinspection",
        "titre": f"Réinspection - {batiment.get('nom_etablissement', batiment.get('adresse_civique', 'N/A'))}",
        "description": f"Suivi de l'avis {numero_avis}. {len(violations_avis)} non-conformité(s) à vérifier.",
        "batiment_id": batiment_id,
        "inspection_origine_id": inspection_id,
        "avis_id": avis.id,
        "date_prevue": date_echeance_min,
        "preventionniste_id": preventionniste_id,
        "statut": "planifiee",
        "priorite": "haute" if any(v.severite == "urgente" for v in violations_avis) else "normale",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.id
    }
    
    # Ajouter dans le calendrier des inspections (ou créer une collection tâches si nécessaire)
    await db.taches_suivi_prevention.insert_one(tache_suivi)
    
    logger.info(f"[AVIS] {numero_avis} généré pour inspection {inspection_id} par {current_user.email}")
    
    return {
        "avis": clean_mongo_doc(avis.dict()),
        "tache_suivi": clean_mongo_doc(tache_suivi),
        "message": f"Avis {numero_avis} généré avec succès"
    }


@router.get("/{tenant_slug}/prevention/avis-non-conformite")
async def list_avis_non_conformite(
    tenant_slug: str,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste des avis de non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    
    avis_list = await db.avis_non_conformite.find(query).sort("date_generation", -1).to_list(500)
    return [clean_mongo_doc(a) for a in avis_list]


@router.get("/{tenant_slug}/prevention/avis-non-conformite/{avis_id}")
async def get_avis_non_conformite(
    tenant_slug: str,
    avis_id: str,
    current_user: User = Depends(get_current_user)
):
    """Détail d'un avis de non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    avis = await db.avis_non_conformite.find_one({
        "id": avis_id,
        "tenant_id": tenant.id
    })
    
    if not avis:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    return clean_mongo_doc(avis)


@router.put("/{tenant_slug}/prevention/avis-non-conformite/{avis_id}")
async def update_avis_non_conformite(
    tenant_slug: str,
    avis_id: str,
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un avis (statut, date d'envoi, etc.)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    avis = await db.avis_non_conformite.find_one({
        "id": avis_id,
        "tenant_id": tenant.id
    })
    
    if not avis:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    # Champs modifiables
    allowed_fields = ["statut", "date_envoi", "mode_envoi", "notes"]
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    for field in allowed_fields:
        if field in data:
            updates[field] = data[field]
    
    await db.avis_non_conformite.update_one(
        {"id": avis_id, "tenant_id": tenant.id},
        {"$set": updates}
    )
    
    updated = await db.avis_non_conformite.find_one({"id": avis_id})
    return clean_mongo_doc(updated)


@router.get("/{tenant_slug}/prevention/avis-non-conformite/{avis_id}/pdf")
async def get_avis_pdf(
    tenant_slug: str,
    avis_id: str,
    current_user: User = Depends(get_current_user)
):
    """Générer et télécharger le PDF de l'avis de non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    avis = await db.avis_non_conformite.find_one({
        "id": avis_id,
        "tenant_id": tenant.id
    })
    
    if not avis:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    # Récupérer le tenant pour le branding
    tenant_doc = await db.tenants.find_one({"id": tenant.id})
    
    # Générer le PDF
    pdf_buffer = await generer_avis_pdf(avis, tenant_doc)
    
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=avis_{avis['numero_avis']}.pdf"
        }
    )


async def generer_avis_pdf(avis: Dict, tenant: Dict) -> BytesIO:
    """Génère le PDF de l'avis de non-conformité"""
    from types import SimpleNamespace
    
    # Créer le PDF avec branding
    tenant_obj = SimpleNamespace(**tenant) if tenant else None
    buffer, doc, story = create_branded_pdf(tenant_obj, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # === STYLES PERSONNALISÉS ===
    title_style = ParagraphStyle(
        'AvisTitle',
        parent=styles['Heading1'],
        fontSize=18,
        textColor=colors.HexColor('#dc2626'),
        spaceAfter=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'AvisSubtitle',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=15,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'AvisHeading',
        parent=styles['Heading2'],
        fontSize=12,
        textColor=colors.HexColor('#374151'),
        spaceAfter=10,
        spaceBefore=15,
        fontName='Helvetica-Bold'
    )
    
    body_style = ParagraphStyle(
        'AvisBody',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=8,
        alignment=TA_JUSTIFY,
        leading=14
    )
    
    # === EN-TÊTE ===
    # Titre principal
    story.append(Paragraph("AVIS DE NON-CONFORMITÉ", title_style))
    story.append(Paragraph(f"N° {avis['numero_avis']}", subtitle_style))
    story.append(Spacer(1, 0.2*inch))
    
    # Objet
    objet_text = f"<b>OBJET :</b> Avis de non-conformité - {avis['batiment_adresse']}, {avis['batiment_ville']}"
    story.append(Paragraph(objet_text, body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # === DESTINATAIRE ===
    story.append(Paragraph("DESTINATAIRE", heading_style))
    
    dest_nom_complet = f"{avis['destinataire_prenom']} {avis['destinataire_nom']}".strip()
    if not dest_nom_complet:
        dest_nom_complet = "Propriétaire/Responsable"
    
    dest_data = [
        ["Nom:", dest_nom_complet],
        ["Adresse:", avis['destinataire_adresse']],
        ["Ville:", f"{avis['destinataire_ville']} {avis['destinataire_code_postal']}"],
    ]
    
    dest_table = Table(dest_data, colWidths=[1.5*inch, 4.5*inch])
    dest_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(dest_table)
    story.append(Spacer(1, 0.2*inch))
    
    # === INFORMATIONS DE L'INSPECTION ===
    story.append(Paragraph("INFORMATIONS DE L'INSPECTION", heading_style))
    
    # Formater la date
    date_insp_str = avis['date_inspection']
    try:
        date_insp_obj = datetime.strptime(date_insp_str, "%Y-%m-%d")
        date_insp_formatee = date_insp_obj.strftime("%d %B %Y")
    except:
        date_insp_formatee = date_insp_str
    
    insp_data = [
        ["Date de l'inspection:", date_insp_formatee],
        ["Établissement:", avis['batiment_nom'] or "N/A"],
        ["Adresse inspectée:", f"{avis['batiment_adresse']}, {avis['batiment_ville']}"],
        ["Préventionniste:", avis['preventionniste_nom']],
    ]
    
    insp_table = Table(insp_data, colWidths=[2*inch, 4*inch])
    insp_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(insp_table)
    story.append(Spacer(1, 0.3*inch))
    
    # === CORPS DE LA LETTRE ===
    intro_text = """
    Suite à l'inspection effectuée à l'adresse mentionnée ci-dessus, nous avons constaté les non-conformités 
    suivantes au regard de la réglementation en vigueur. Conformément à nos obligations légales, nous vous 
    demandons de corriger ces situations dans les délais prescrits.
    """
    story.append(Paragraph(intro_text.strip(), body_style))
    story.append(Spacer(1, 0.2*inch))
    
    # === TABLEAU DES INFRACTIONS ===
    story.append(Paragraph("NON-CONFORMITÉS CONSTATÉES", heading_style))
    
    # Définir les couleurs de sévérité
    severite_colors = {
        "urgente": colors.HexColor('#dc2626'),
        "majeure": colors.HexColor('#f97316'),
        "mineure": colors.HexColor('#eab308')
    }
    
    # En-tête du tableau
    violations_header = ["Article", "Description de l'infraction", "Sévérité", "Date limite"]
    violations_data = [violations_header]
    
    for v in avis['violations']:
        # Formater la date limite
        try:
            date_lim_obj = datetime.strptime(v['date_limite'], "%Y-%m-%d")
            date_lim_formatee = date_lim_obj.strftime("%d/%m/%Y")
        except:
            date_lim_formatee = v['date_limite']
        
        # Tronquer la description si trop longue
        desc = v['description']
        if len(desc) > 200:
            desc = desc[:197] + "..."
        
        violations_data.append([
            v['code_article'],
            desc,
            v['severite'].upper(),
            date_lim_formatee
        ])
    
    # Créer le tableau
    col_widths = [1.2*inch, 3.5*inch, 0.8*inch, 1*inch]
    violations_table = Table(violations_data, colWidths=col_widths)
    
    # Style du tableau
    table_style = [
        # En-tête
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1f2937')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        
        # Corps
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 1), (0, -1), 'LEFT'),  # Article
        ('ALIGN', (1, 1), (1, -1), 'LEFT'),  # Description
        ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # Sévérité
        ('ALIGN', (3, 1), (3, -1), 'CENTER'),  # Date
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        
        # Grille
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]
    
    # Colorer les lignes selon la sévérité
    for i, v in enumerate(avis['violations'], start=1):
        severite = v['severite'].lower()
        if severite in severite_colors:
            # Fond léger de la ligne
            bg_color = colors.HexColor('#fef2f2') if severite == 'urgente' else \
                       colors.HexColor('#fff7ed') if severite == 'majeure' else \
                       colors.HexColor('#fefce8')
            table_style.append(('BACKGROUND', (0, i), (-1, i), bg_color))
            # Couleur du texte de sévérité
            table_style.append(('TEXTCOLOR', (2, i), (2, i), severite_colors[severite]))
            table_style.append(('FONTNAME', (2, i), (2, i), 'Helvetica-Bold'))
    
    violations_table.setStyle(TableStyle(table_style))
    story.append(violations_table)
    story.append(Spacer(1, 0.3*inch))
    
    # === INSTRUCTIONS ===
    story.append(Paragraph("INSTRUCTIONS", heading_style))
    
    instructions_text = f"""
    Vous êtes tenu de corriger les non-conformités identifiées dans les délais prescrits. 
    Une réinspection sera effectuée après la date d'échéance la plus proche pour vérifier 
    que les corrections ont été apportées.
    <br/><br/>
    <b>Date de réinspection prévue :</b> À compter du {avis['date_echeance_min']}
    <br/><br/>
    En cas de non-respect des délais, des mesures supplémentaires pourront être prises 
    conformément à la réglementation municipale et provinciale en vigueur.
    """
    story.append(Paragraph(instructions_text.strip(), body_style))
    story.append(Spacer(1, 0.3*inch))
    
    # === SIGNATURE ===
    story.append(Paragraph("RESPONSABLE DU DOSSIER", heading_style))
    
    # Ajouter signature numérique si disponible
    if avis.get('signature_url') and avis['signature_url'].startswith('data:image'):
        try:
            import base64
            from io import BytesIO
            from reportlab.platypus import Image as RLImage
            
            # Extraire le contenu base64
            header, encoded = avis['signature_url'].split(',', 1)
            signature_data = base64.b64decode(encoded)
            signature_buffer = BytesIO(signature_data)
            
            # Ajouter l'image de signature
            signature_img = RLImage(signature_buffer, width=2*inch, height=0.8*inch)
            story.append(signature_img)
        except Exception as e:
            logger.warning(f"Impossible d'ajouter la signature image: {e}")
    
    signature_text = f"""
    {avis['preventionniste_nom']}<br/>
    Préventionniste en sécurité incendie<br/>
    Date : {datetime.now().strftime("%d %B %Y")}
    """
    story.append(Paragraph(signature_text, body_style))
    
    # === PIED DE PAGE ===
    story.append(Spacer(1, 0.5*inch))
    
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6b7280'),
        alignment=TA_CENTER
    )
    
    footer_text = """
    Ce document est un avis officiel émis par le Service de sécurité incendie. 
    Veuillez conserver ce document pour vos dossiers.
    """
    story.append(Paragraph(footer_text.strip(), footer_style))
    
    # Générer le PDF
    doc.build(story)
    buffer.seek(0)
    
    return buffer


# ==================== TÂCHES DE SUIVI ====================

@router.get("/{tenant_slug}/prevention/taches-suivi")
async def list_taches_suivi(
    tenant_slug: str,
    statut: Optional[str] = None,
    preventionniste_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste des tâches de suivi (réinspections programmées)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if statut:
        query["statut"] = statut
    if preventionniste_id:
        query["preventionniste_id"] = preventionniste_id
    
    taches = await db.taches_suivi_prevention.find(query).sort("date_prevue", 1).to_list(500)
    return [clean_mongo_doc(t) for t in taches]


@router.put("/{tenant_slug}/prevention/taches-suivi/{tache_id}")
async def update_tache_suivi(
    tenant_slug: str,
    tache_id: str,
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une tâche de suivi"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    tache = await db.taches_suivi_prevention.find_one({
        "id": tache_id,
        "tenant_id": tenant.id
    })
    
    if not tache:
        raise HTTPException(status_code=404, detail="Tâche non trouvée")
    
    allowed_fields = ["statut", "date_prevue", "notes", "preventionniste_id"]
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    for field in allowed_fields:
        if field in data:
            updates[field] = data[field]
    
    await db.taches_suivi_prevention.update_one(
        {"id": tache_id, "tenant_id": tenant.id},
        {"$set": updates}
    )
    
    updated = await db.taches_suivi_prevention.find_one({"id": tache_id})
    return clean_mongo_doc(updated)



# ==================== ENVOI PAR COURRIEL ====================

class EnvoiAvisRequest(BaseModel):
    email: str
    mode: str = "courriel"
    message_personnalise: Optional[str] = None


@router.post("/{tenant_slug}/prevention/avis-non-conformite/{avis_id}/envoyer")
async def envoyer_avis_courriel(
    tenant_slug: str,
    avis_id: str,
    data: EnvoiAvisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Envoyer l'avis de non-conformité par courriel
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer l'avis
    avis = await db.avis_non_conformite.find_one({
        "id": avis_id,
        "tenant_id": tenant.id
    })
    
    if not avis:
        raise HTTPException(status_code=404, detail="Avis non trouvé")
    
    # Récupérer les infos du tenant
    tenant_doc = await db.tenants.find_one({"id": tenant.id})
    tenant_nom = tenant_doc.get("nom", "Service Incendie") if tenant_doc else "Service Incendie"
    
    # Générer le PDF
    pdf_buffer = await generer_avis_pdf(avis, tenant_doc)
    pdf_content = pdf_buffer.getvalue()
    
    # Préparer l'email
    try:
        import resend
        import base64
        import os
        
        resend.api_key = os.environ.get("RESEND_API_KEY")
        sender_email = os.environ.get("SENDER_EMAIL", "noreply@profiremanager.ca")
        
        # Contenu de l'email
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Avis de Non-Conformité</h1>
            </div>
            
            <div style="padding: 20px; background-color: #f9fafb;">
                <p>Bonjour,</p>
                
                <p>
                    Suite à l'inspection effectuée le <strong>{avis.get('date_inspection', 'N/A')}</strong> 
                    à l'adresse <strong>{avis.get('batiment_adresse', 'N/A')}, {avis.get('batiment_ville', '')}</strong>, 
                    nous vous transmettons ci-joint l'avis de non-conformité <strong>N° {avis.get('numero_avis', 'N/A')}</strong>.
                </p>
                
                <p>
                    Cet avis contient {len(avis.get('violations', []))} non-conformité(s) à corriger 
                    dans les délais prescrits.
                </p>
                
                <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0;">
                    <strong>Date limite de correction la plus proche:</strong><br/>
                    {avis.get('date_echeance_min', 'Voir document ci-joint')}
                </div>
                
                {f'<p><em>Message du préventionniste:</em><br/>{data.message_personnalise}</p>' if data.message_personnalise else ''}
                
                <p>
                    Veuillez consulter le document PDF ci-joint pour les détails complets des non-conformités 
                    et les délais de correction.
                </p>
                
                <p>
                    Pour toute question, veuillez contacter notre service de prévention incendie.
                </p>
                
                <p>Cordialement,</p>
                <p>
                    <strong>{avis.get('preventionniste_nom', 'Préventionniste')}</strong><br/>
                    Service de prévention incendie<br/>
                    {tenant_nom}
                </p>
            </div>
            
            <div style="background-color: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px;">
                Ce courriel et ses pièces jointes sont des documents officiels.<br/>
                Veuillez les conserver pour vos dossiers.
            </div>
        </div>
        """
        
        # Envoyer avec Resend
        params = {
            "from": f"{tenant_nom} <{sender_email}>",
            "to": [data.email],
            "subject": f"Avis de Non-Conformité N° {avis.get('numero_avis', 'N/A')} - {avis.get('batiment_adresse', 'N/A')}",
            "html": html_content,
            "attachments": [
                {
                    "filename": f"avis_{avis.get('numero_avis', 'NC')}.pdf",
                    "content": base64.b64encode(pdf_content).decode('utf-8')
                }
            ]
        }
        
        email_response = resend.Emails.send(params)
        
        # Mettre à jour le statut de l'avis
        await db.avis_non_conformite.update_one(
            {"id": avis_id, "tenant_id": tenant.id},
            {"$set": {
                "statut": "envoye",
                "date_envoi": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "mode_envoi": "courriel",
                "email_envoye_a": data.email,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        logger.info(f"[AVIS] Courriel envoyé pour {avis.get('numero_avis')} à {data.email}")
        
        return {
            "message": f"Avis envoyé avec succès à {data.email}",
            "email_id": email_response.get("id") if isinstance(email_response, dict) else str(email_response)
        }
        
    except Exception as e:
        logger.error(f"[AVIS] Erreur envoi courriel: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Erreur lors de l'envoi du courriel: {str(e)}"
        )
