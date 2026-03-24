"""
Modèles Pydantic pour le module Prévention
============================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

class Batiment(BaseModel):
    """Fiche d'établissement/bâtiment pour les inspections de prévention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""
    valeur_fonciere: Optional[str] = ""
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    proprietaire_adresse: str = ""
    proprietaire_ville: str = ""
    proprietaire_code_postal: str = ""
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    gestionnaire_adresse: str = ""
    gestionnaire_ville: str = ""
    gestionnaire_code_postal: str = ""
    locataire_nom: str = ""
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    groupe_occupation: str = ""
    sous_groupe: str = ""
    description_activite: str = ""
    niveau_risque: str = ""
    risques: List[str] = []
    risques_identifies: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = ""
    statut: str = "actif"
    notes_generales: str = ""
    notes: str = ""
    preventionniste_assigne_id: Optional[str] = None
    historique_assignations: List[Dict[str, Any]] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BatimentCreate(BaseModel):
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""
    valeur_fonciere: Optional[str] = ""
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    proprietaire_adresse: str = ""
    proprietaire_ville: str = ""
    proprietaire_code_postal: str = ""
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    gestionnaire_adresse: str = ""
    gestionnaire_ville: str = ""
    gestionnaire_code_postal: str = ""
    locataire_nom: str = ""
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    groupe_occupation: str = ""
    sous_groupe: str = ""
    description_activite: str = ""
    niveau_risque: str = ""
    risques: List[str] = []
    risques_identifies: List[str] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_url: Optional[str] = ""
    statut: str = "actif"
    notes_generales: str = ""
    notes: str = ""
    preventionniste_assigne_id: Optional[str] = None


# ==================== MODÈLES DÉPENDANCES ====================

class DependanceBatiment(BaseModel):
    """Dépendance rattachée à un bâtiment principal (ex: poulailler, grange, hangar)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_parent_id: str  # ID du bâtiment principal
    nom: str  # Ex: "Poulailler", "Grange", "Hangar"
    description: str = ""
    photo_url: Optional[str] = ""
    photos: List[Dict[str, Any]] = []  # Galerie de photos
    # Classification
    groupe_occupation: str = ""  # Catégorie (Agricole, Commercial, etc.)
    sous_groupe: str = ""
    niveau_risque: str = ""  # faible, moyen, élevé, très élevé
    # Caractéristiques
    valeur_fonciere: str = ""
    annee_construction: str = ""
    nombre_etages: str = "1"
    superficie_m2: str = ""
    materiaux_construction: str = ""
    # Notes
    notes: str = ""
    notes_generales: str = ""
    # Gestion
    preventionniste_assigne_id: Optional[str] = None  # Si risque moyen+
    statut: str = "actif"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DependanceCreate(BaseModel):
    """Modèle pour la création d'une dépendance"""
    nom: str
    description: str = ""
    photo_url: Optional[str] = ""
    groupe_occupation: str = ""
    sous_groupe: str = ""
    niveau_risque: str = ""
    valeur_fonciere: str = ""
    annee_construction: str = ""
    nombre_etages: str = "1"
    superficie_m2: str = ""
    materiaux_construction: str = ""
    notes: str = ""
    notes_generales: str = ""
    preventionniste_assigne_id: Optional[str] = None


class DependanceUpdate(BaseModel):
    """Modèle pour la mise à jour d'une dépendance"""
    nom: Optional[str] = None
    description: Optional[str] = None
    photo_url: Optional[str] = None
    groupe_occupation: Optional[str] = None
    sous_groupe: Optional[str] = None
    niveau_risque: Optional[str] = None
    valeur_fonciere: Optional[str] = None
    annee_construction: Optional[str] = None
    nombre_etages: Optional[str] = None
    superficie_m2: Optional[str] = None
    materiaux_construction: Optional[str] = None
    notes: Optional[str] = None
    notes_generales: Optional[str] = None
    preventionniste_assigne_id: Optional[str] = None
    statut: Optional[str] = None


class PhotoBatiment(BaseModel):
    """Photo stockée dans un bâtiment ou une dépendance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    nom: str = ""
    description: str = ""
    date_ajout: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ajoutee_par_id: Optional[str] = None
    ajoutee_par_nom: Optional[str] = None


# ==================== MODÈLES PRINCIPAUX ====================
# (Définis tôt dans le fichier pour être utilisés par les endpoints)

class SecteurGeographique(BaseModel):
    """Secteur géographique pour l'assignation des préventionnistes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    couleur: str = "#3b82f6"
    geometry: Dict[str, Any] = {}
    preventionniste_assigne_id: Optional[str] = None
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SecteurGeographiqueCreate(BaseModel):
    """Modèle pour la création d'un secteur géographique"""
    nom: str
    description: str = ""
    couleur: str = "#3b82f6"
    geometry: Dict[str, Any]
    preventionniste_assigne_id: Optional[str] = None
    actif: bool = True
    
    class Config:
        extra = "ignore"


class GrilleInspection(BaseModel):
    """Template de grille d'inspection selon le groupe d'occupation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    groupe_occupation: str = ""
    description: str = ""
    sections: List[Dict[str, Any]] = []
    actif: bool = True
    version: str = "1.0"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GrilleInspectionCreate(BaseModel):
    nom: str
    groupe_occupation: str = ""
    description: str = ""
    sections: List[Dict[str, Any]] = []
    actif: bool = True
    version: str = "1.0"


class Inspection(BaseModel):
    """Inspection réalisée sur un bâtiment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str = ""
    dependance_id: str = ""
    grille_inspection_id: str = ""
    grille_id: str = ""  # Alias pour compatibilité
    preventionniste_id: str = ""
    preventionniste_nom: str = ""
    inspecteur_id: str = ""
    inspecteur_nom: str = ""
    inspection_realisee_par: str = ""
    grille_nom: str = ""
    date_inspection: str = ""
    heure_debut: str = ""
    heure_fin: str = ""
    type_inspection: str = "reguliere"
    statut: str = "planifiee"
    resultats: Dict[str, Any] = {}
    statut_global: str = "conforme"
    score_conformite: float = 100.0
    photos: Any = []
    anomalies: List[Dict[str, Any]] = []
    notes: str = ""
    notes_inspection: str = ""
    recommandations: str = ""
    signature_preventionniste: str = ""
    signature_proprietaire: Optional[str] = None
    signature_responsable: str = ""
    nom_representant: str = ""
    date_signature_responsable: str = ""
    prochaine_inspection: str = ""
    rapport_pdf_url: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionCreate(BaseModel):
    batiment_id: str = ""
    dependance_id: str = ""
    grille_inspection_id: str = ""
    grille_id: str = ""
    preventionniste_id: str = ""
    preventionniste_nom: str = ""
    inspecteur_id: str = ""
    inspecteur_nom: str = ""
    inspection_realisee_par: str = ""
    grille_nom: str = ""
    date_inspection: str
    heure_debut: str = ""
    heure_fin: str = ""
    type_inspection: str = "reguliere"
    statut: str = "planifiee"
    resultats: Dict[str, Any] = {}
    statut_global: str = "conforme"
    score_conformite: float = 100.0
    photos: Any = []
    anomalies: List[Dict[str, Any]] = []
    notes: str = ""
    notes_inspection: str = ""
    recommandations: str = ""
    signature_preventionniste: str = ""
    signature_proprietaire: Optional[str] = None
    signature_responsable: str = ""
    nom_representant: str = ""
    date_signature_responsable: str = ""
    prochaine_inspection: str = ""
    
    class Config:
        extra = "ignore"


# ==================== DONNÉES DE RÉFÉRENCE ====================

class BatimentPhotoUpload(BaseModel):
    """Modèle pour l'upload de photo de bâtiment en base64"""
    photo_base64: str  # Data URL base64 (ex: data:image/jpeg;base64,...)


class SymbolePersonnalise(BaseModel):
    """Symbole personnalisé pour les plans d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Borne-fontaine personnalisée"
    categorie: str = "Personnalisé"  # Catégorie du symbole
    image_base64: str  # Image en base64
    couleur: str = "#3b82f6"  # Couleur de bordure dans la palette
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str  # ID de l'utilisateur qui a créé


class SymbolePersonnaliseCreate(BaseModel):
    """Modèle pour la création d'un symbole personnalisé"""
    nom: str
    categorie: str = "Personnalisé"
    image_base64: str
    couleur: str = "#3b82f6"
    
    class Config:
        extra = "ignore"


class NonConformite(BaseModel):
    """Non-conformité identifiée lors d'une inspection ou créée manuellement"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    inspection_id: Optional[str] = None  # Optionnel pour création manuelle
    batiment_id: str
    
    # Description de la non-conformité
    titre: str = ""
    description: str = ""
    section_grille: str = ""  # Section de la grille où elle a été identifiée
    gravite: str = "moyen"  # faible, moyen, eleve, critique
    categorie: str = ""  # Catégorie pour création manuelle
    priorite: str = "moyenne"  # haute, moyenne, faible - alias de gravite
    article_code: str = ""  # Article du code de sécurité (legacy)
    violation_id: Optional[str] = None  # Référence au référentiel de violations (legacy)
    # Support pour articles multiples
    articles_ids: List[str] = []  # IDs des articles sélectionnés
    articles_codes: List[str] = []  # Codes des articles (ex: CNPI 2.1.3.1)
    
    # Suivi
    statut: str = "ouverte"  # ouverte, en_cours, corrigee, fermee
    delai_correction: Optional[str] = None  # Date limite YYYY-MM-DD
    date_correction: Optional[str] = None
    date_identification: Optional[str] = None  # Date d'identification manuelle
    notes_correction: str = ""
    
    # Documentation
    photos_avant: List[str] = []
    photos_apres: List[str] = []
    
    # Responsabilité
    responsable_correction: str = ""  # Propriétaire/Gestionnaire
    preventionniste_suivi_id: Optional[str] = None
    createur_id: Optional[str] = None  # ID de l'utilisateur qui a créé la NC
    
    # Source
    est_manuel: bool = False  # True si créée manuellement
    
    # Relances
    derniere_relance: Optional[str] = None  # Date de la dernière relance YYYY-MM-DD
    nb_relances: int = 0
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NonConformiteCreate(BaseModel):
    inspection_id: Optional[str] = None  # Optionnel pour création manuelle
    batiment_id: str
    titre: str
    description: str = ""
    section_grille: str = ""
    gravite: str = "moyen"
    categorie: str = ""  # Pour création manuelle
    priorite: str = "moyenne"  # Pour création manuelle
    article_code: str = ""
    violation_id: Optional[str] = None
    # Support pour articles multiples
    articles_ids: List[str] = []  # IDs des articles sélectionnés
    articles_codes: List[str] = []  # Codes des articles (ex: CNPI 2.1.3.1)
    delai_correction: Optional[str] = None
    date_identification: Optional[str] = None  # Pour création manuelle
    statut: str = "ouverte"
    photos_avant: List[str] = []
    responsable_correction: str = ""
    preventionniste_suivi_id: Optional[str] = None


# ==================== MODÈLES ÉTENDUS POUR INSPECTIONS VISUELLES ====================

class PhotoInspection(BaseModel):
    """Photo prise lors d'une inspection"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str  # URL de stockage de la photo
    categorie: str = ""  # Ex: "Preuve accroche porte", "Adresse non visible", "Matières dangereuses"
    secteur: Optional[str] = None  # Secteur 1, 2, 3, 4, 5 selon schéma
    cadran: Optional[str] = None  # Cadran A, B, C, D (subdivision du Secteur 1)
    description: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ParticipantInspection(BaseModel):
    """Participant à une inspection (pompier ou préventionniste)"""
    user_id: str
    nom_complet: str
    role: str  # "pompier" ou "preventionniste"
    est_principal: bool = False  # Le pompier connecté qui crée l'inspection

class InspectionVisuelle(BaseModel):
    """Inspection visuelle complète pour tablette/mobile"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    
    # Participants
    participants: List[ParticipantInspection] = []
    
    # Timing
    date_inspection: str = ""  # YYYY-MM-DD
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    duree_minutes: Optional[int] = None
    
    # Géolocalisation (capture automatique)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # Photos catégorisées
    photos: List[PhotoInspection] = []
    
    # Non-conformités détaillées
    non_conformites_ids: List[str] = []  # Références aux NonConformite
    
    # Checklist dynamique selon type de bâtiment
    checklist_reponses: Dict[str, Any] = {}
    
    # Statuts
    statut: str = "en_cours"  # en_cours, en_attente_validation, validee, non_conforme, suivi_requis
    statut_conformite: str = "conforme"  # conforme, non_conforme, partiellement_conforme
    
    # Plan d'intervention
    plan_intervention_url: Optional[str] = None  # URL du PDF du plan
    
    # Notes
    notes_terrain: str = ""
    recommandations: str = ""
    
    # Validation (modifiable en tout temps)
    validee_par_id: Optional[str] = None
    date_validation: Optional[datetime] = None
    
    # Mode hors-ligne
    sync_status: str = "synced"  # synced, pending, offline
    
    # Métadonnées
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionVisuelleCreate(BaseModel):
    batiment_id: str
    participants: List[ParticipantInspection]
    date_inspection: str
    heure_debut: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes_terrain: str = ""

class InspectionVisuelleUpdate(BaseModel):
    participants: Optional[List[ParticipantInspection]] = None
    heure_fin: Optional[str] = None
    photos: Optional[List[PhotoInspection]] = None
    checklist_reponses: Optional[Dict[str, Any]] = None
    statut: Optional[str] = None
    statut_conformite: Optional[str] = None
    notes_terrain: Optional[str] = None
    recommandations: Optional[str] = None
    validee_par_id: Optional[str] = None

class NonConformiteVisuelle(BaseModel):
    """Non-conformité avec photos et gravité détaillée"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    inspection_id: str
    batiment_id: str
    
    # Description
    titre: str
    description: str = ""
    gravite: str = "mineur"  # mineur, majeur, critique
    
    # Articles et délais
    article_municipal: str = ""  # Ex: "Article 45.2"
    delai_correction_jours: Optional[int] = None
    date_limite: Optional[str] = None  # YYYY-MM-DD
    
    # Photos
    photos_nc: List[PhotoInspection] = []  # Photos de la non-conformité
    photos_resolution: List[PhotoInspection] = []  # Photos après correction
    
    # Statut
    statut: str = "nouvelle"  # nouvelle, en_cours, resolue
    date_resolution: Optional[datetime] = None
    notes_resolution: str = ""
    
    # Suivi
    responsable_correction: str = ""  # Nom propriétaire/gestionnaire
    preventionniste_suivi_id: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NonConformiteVisuelleCreate(BaseModel):
    inspection_id: str
    batiment_id: str
    titre: str
    description: str = ""
    gravite: str = "mineur"
    article_municipal: str = ""
    delai_correction_jours: Optional[int] = None
    photos_nc: List[PhotoInspection] = []
    responsable_correction: str = ""

class BatimentMapView(BaseModel):
    """Vue simplifiée pour affichage sur carte"""
    id: str
    nom_etablissement: str
    adresse_civique: str
    ville: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: str
    statut_inspection: str  # "fait_conforme", "a_faire", "non_conforme", "en_cours"
    derniere_inspection: Optional[str] = None  # Date ISO
    groupe_occupation: str
    sous_groupe: str

class GeocodeRequest(BaseModel):
    """Requête de géocodage d'adresse"""
    adresse_complete: str

class GeocodeResponse(BaseModel):
    """Réponse de géocodage"""
    latitude: float
    longitude: float
    adresse_formatee: str
    precision: str  # "building", "street", "city"


# ==================== MODÈLES PLANS D'INTERVENTION ====================

class ElementPlanBase(BaseModel):
    """Classe de base pour tous les éléments d'un plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type_element: str  # hydrant, sortie, matiere_dangereuse, generatrice, gaz_naturel, reservoir_propane, vehicule
    latitude: float
    longitude: float
    numero: Optional[str] = None  # Ex: H1, S1, MD1 (auto-généré)
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HydrantElement(ElementPlanBase):
    """Hydrant sur le plan"""
    type_element: str = "hydrant"
    type_hydrant: str  # borne_fontaine, borne_seche, aspiration
    debit: float  # Débit
    unite_debit: str = "gal/min"  # gal/min ou L/min
    couleur_indicateur: Optional[str] = None  # Rouge, jaune, vert selon débit

class SortieElement(ElementPlanBase):
    """Sortie d'urgence sur le plan"""
    type_element: str = "sortie"
    type_sortie: str  # urgence, principale, secondaire
    largeur_m: Optional[float] = None
    acces_fauteuil: bool = False
    eclairage_secours: bool = False

class MatiereDangereuse(ElementPlanBase):
    """Matière dangereuse présente"""
    type_element: str = "matiere_dangereuse"
    nom_produit: str
    pictogramme_simdut: str  # URL ou code du pictogramme
    quantite: Optional[float] = None
    unite_quantite: str = "L"  # L, kg, m³
    classe_danger: str = ""  # Ex: "Inflammable", "Toxique", "Corrosif"

class GeneratriceElement(ElementPlanBase):
    """Génératrice d'urgence"""
    type_element: str = "generatrice"
    puissance_kw: Optional[float] = None
    emplacement_commutateur: str = ""
    type_carburant: str = ""  # diesel, essence, gaz naturel

class GazNaturelElement(ElementPlanBase):
    """Entrée de gaz naturel"""
    type_element: str = "gaz_naturel"
    emplacement_vanne_coupure: str
    accessible_exterieur: bool = True

class ReservoirPropaneElement(ElementPlanBase):
    """Réservoir de propane"""
    type_element: str = "reservoir_propane"
    capacite: float
    unite_capacite: str = "gallons"  # gallons ou litres
    emplacement_vanne: str
    type_reservoir: str = ""  # aerien, enterre

class VehiculeElement(ElementPlanBase):
    """Position recommandée pour véhicules d'intervention"""
    type_element: str = "vehicule"
    type_vehicule: str  # echelle, pompe, citerne
    position_recommandee: str  # Ex: "Face façade nord", "Cour arrière"
    notes_stationnement: str = ""

class RouteAcces(BaseModel):
    """Route d'accès au bâtiment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str = "Route principale"
    chemin_polyline: List[Dict[str, float]] = []  # Liste de {lat, lng}
    largeur_m: Optional[float] = None
    pente: Optional[str] = None  # faible, moyenne, forte
    notes: str = ""
    est_principale: bool = True

class ZoneDanger(BaseModel):
    """Zone de danger ou périmètre d'évacuation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    type_zone: str  # perimetre_evacuation, zone_chaude, zone_tiede, zone_froide
    polygone: List[Dict[str, float]] = []  # Liste de {lat, lng}
    couleur: str = "#ff0000"  # Hex color
    opacite: float = 0.3
    rayon_m: Optional[float] = None
    description: str = ""

class SecteurPlan(BaseModel):
    """Secteur du bâtiment (même système que photos inspection)"""
    numero: int  # 1, 2, 3, 4, 5
    cadran: Optional[str] = None  # A, B, C, D (subdivision secteur 1)
    description: str = ""
    elements_ids: List[str] = []  # IDs des éléments dans ce secteur

class PlanEtage(BaseModel):
    """Plan d'un étage intérieur"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_etage: int  # -1 (sous-sol), 0 (RDC), 1, 2, 3...
    nom: str  # "Rez-de-chaussée", "1er étage", "Sous-sol"
    image_url: Optional[str] = None  # Image du plan d'étage
    annotations: List[Dict[str, Any]] = []  # Annotations sur le plan
    elements_interieurs: List[Dict[str, Any]] = []  # Escaliers, ascenseurs, etc.

class PhotoPlanIntervention(BaseModel):
    """Photo attachée au plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    latitude: float = 0.0
    longitude: float = 0.0
    titre: str = ""
    description: str = ""
    localisation: str = ""  # Localisation textuelle dans le bâtiment (ex: "Entrée principale", "2e étage - côté est")
    categorie: str = ""  # facade, entree, systeme_alarme, points_eau, risques, autre
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IconePersonnalisee(BaseModel):
    """Icône personnalisée pour les plans d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    image_base64: str  # Image encodée en base64
    categorie: str  # hydrants, sorties, matieres_dangereuses, generateurs, gaz_naturel, propane, vehicules, autre
    created_by_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IconePersonnaliseeCreate(BaseModel):
    """Création d'une icône personnalisée"""
    nom: str
    image_base64: str
    categorie: str

class PlanIntervention(BaseModel):
    """Plan d'intervention complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    
    # Identification
    numero_plan: str  # Ex: "PI-2025-001"
    nom: str = ""
    
    # Versioning
    version: str = "1.0"
    version_precedente_id: Optional[str] = None
    
    # Statut et workflow
    statut: str = "brouillon"  # brouillon, en_attente_validation, valide, archive, rejete
    created_by_id: str  # ID du préventionniste créateur
    validated_by_id: Optional[str] = None  # ID admin/superviseur qui valide
    date_validation: Optional[datetime] = None
    commentaires_validation: str = ""
    commentaires_rejet: str = ""
    
    # Éléments du plan
    hydrants: List[HydrantElement] = []
    sorties: List[SortieElement] = []
    matieres_dangereuses: List[MatiereDangereuse] = []
    generatrices: List[GeneratriceElement] = []
    gaz_naturel: List[GazNaturelElement] = []
    reservoirs_propane: List[ReservoirPropaneElement] = []
    vehicules: List[VehiculeElement] = []
    
    # Structure spatiale
    routes_acces: List[RouteAcces] = []
    zones_danger: List[ZoneDanger] = []
    secteurs: List[SecteurPlan] = []
    plans_etages: List[PlanEtage] = []
    photos: List[PhotoPlanIntervention] = []
    
    # Layers GeoJSON pour le plan interactif (depuis le builder)
    layers: List[Dict[str, Any]] = []
    
    # Vue aérienne
    centre_lat: float
    centre_lng: float
    zoom_level: int = 18
    vue_aerienne_url: Optional[str] = None  # Google Static Map URL
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Dict[str, Any] = {}  # Modifications des icônes prédéfinies
    
    # Calculs automatiques
    distance_caserne_km: Optional[float] = None
    distance_caserne_unite: str = "km"  # km ou m
    temps_acces_minutes: Optional[int] = None
    
    # Documentation
    notes_generales: str = ""
    instructions_particulieres: str = ""
    
    # Export
    pdf_url: Optional[str] = None
    date_derniere_maj: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Métadonnées
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlanInterventionCreate(BaseModel):
    batiment_id: str
    nom: str = ""
    centre_lat: float
    centre_lng: float
    notes_generales: str = ""
    
    # Champs optionnels pour permettre la sauvegarde depuis le builder
    layers: List[Dict[str, Any]] = Field(default_factory=list)
    hydrants: List[HydrantElement] = Field(default_factory=list)
    sorties: List[SortieElement] = Field(default_factory=list)
    matieres_dangereuses: List[MatiereDangereuse] = Field(default_factory=list)
    generatrices: List[GeneratriceElement] = Field(default_factory=list)
    gaz_naturel: List[GazNaturelElement] = Field(default_factory=list)
    reservoirs_propane: List[ReservoirPropaneElement] = Field(default_factory=list)
    vehicules: List[VehiculeElement] = Field(default_factory=list)
    routes_acces: List[RouteAcces] = Field(default_factory=list)
    zones_danger: List[ZoneDanger] = Field(default_factory=list)
    secteurs: List[SecteurPlan] = Field(default_factory=list)
    plans_etages: List[PlanEtage] = Field(default_factory=list)
    photos: List[PhotoPlanIntervention] = Field(default_factory=list)
    instructions_particulieres: str = ""
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Dict[str, Any] = Field(default_factory=dict)  # Modifications des icônes prédéfinies

class PlanInterventionUpdate(BaseModel):
    nom: Optional[str] = None
    statut: Optional[str] = None  # Permettre la mise à jour du statut (pour repasser rejete -> brouillon)
    layers: Optional[List[Dict[str, Any]]] = None  # Layers GeoJSON du builder
    hydrants: Optional[List[HydrantElement]] = None
    sorties: Optional[List[SortieElement]] = None
    matieres_dangereuses: Optional[List[MatiereDangereuse]] = None
    generatrices: Optional[List[GeneratriceElement]] = None
    gaz_naturel: Optional[List[GazNaturelElement]] = None
    reservoirs_propane: Optional[List[ReservoirPropaneElement]] = None
    vehicules: Optional[List[VehiculeElement]] = None
    routes_acces: Optional[List[RouteAcces]] = None
    zones_danger: Optional[List[ZoneDanger]] = None
    secteurs: Optional[List[SecteurPlan]] = None
    plans_etages: Optional[List[PlanEtage]] = None
    photos: Optional[List[PhotoPlanIntervention]] = None
    notes_generales: Optional[str] = None
    instructions_particulieres: Optional[str] = None
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Optional[Dict[str, Any]] = None  # Modifications des icônes prédéfinies

class TemplatePlanIntervention(BaseModel):
    """Template pré-défini de plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Résidentiel unifamilial", "Commercial petit", "Industriel F-1"
    type_batiment: str  # residentiel, commercial, industriel
    groupe_occupation: str  # A, B, C, D, E, F, G, I
    sous_groupe: Optional[str] = None  # F-1, F-2, F-3, etc.
    
    # Éléments pré-configurés (positions relatives)
    hydrants_defaut: List[Dict[str, Any]] = []
    sorties_defaut: List[Dict[str, Any]] = []
    vehicules_defaut: List[Dict[str, Any]] = []
    
    # Instructions
    instructions_utilisation: str = ""
    
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ValidationRequest(BaseModel):
    """Requête de validation de plan"""
    commentaires: str = ""

class RejectionRequest(BaseModel):
    """Requête de rejet de plan"""
    commentaires_rejet: str





# ==================== ROUTES PRÉVENTION MIGRÉES DE SERVER.PY ====================

# ==================== PRÉVENTION ENDPOINTS ====================















CATEGORIES_NR24_27 = {
    "A": {
        "nom": "Établissements de réunion",
        "sous_groupes": {
            "A-1": "Destinés à la production et à la présentation d'arts du spectacle",
            "A-2": "Qui ne figurent dans aucune autre division du groupe A",
            "A-3": "De type aréna",
            "A-4": "Où les occupants sont rassemblés en plein air"
        }
    },
    "B": {
        "nom": "Établissements de détention, soins, traitement et habitations supervisées",
        "sous_groupes": {
            "B-1": "Établissements de détention",
            "B-2": "Établissements de traitement",
            "B-3": "Établissements de soins",
            "B-4": "Établissements de soins de type résidentiel"
        }
    },
    "C": {"nom": "Habitations", "sous_groupes": {}},
    "D": {"nom": "Établissements d'affaires", "sous_groupes": {}},
    "E": {"nom": "Établissements commerciaux", "sous_groupes": {}},
    "F": {
        "nom": "Établissements industriels",
        "sous_groupes": {
            "F-1": "À risques très élevés",
            "F-2": "À risques moyens",
            "F-3": "À risques faibles"
        }
    },
    "G": {
        "nom": "Établissements agricoles",
        "sous_groupes": {
            "G-1": "À risques très élevés",
            "G-2": "Qui ne figurent dans aucune autre division du groupe G",
            "G-3": "Abritant des serres",
            "G-4": "Sans occupation humaine"
        }
    }
}

RISQUES_GUIDE_PLANIFICATION = {
    "incendies": ["Incendie", "Conflagration"],
    "matieres": [
        "Matières dangereuses", "Matières hautement inflammables",
        "Matières très toxiques", "Matières combustibles", "Produits chimiques"
    ],
    "infrastructure": [
        "Explosion", "Défaillances des systèmes de sécurité incendie",
        "Matériaux de construction douteux"
    ],
    "naturels": ["Inondation", "Tremblement de terre", "Tempête de verglas"],
    "humains": ["Négligence", "Acte criminel", "Occupation illégale"]
}

NIVEAUX_RISQUE = [
    {"id": "faible", "nom": "Faible", "couleur": "#22C55E", "description": "Risque minimal"},
    {"id": "moyen", "nom": "Moyen", "couleur": "#F59E0B", "description": "Risque modéré"},
    {"id": "eleve", "nom": "Élevé", "couleur": "#EF4444", "description": "Risque important"},
    {"id": "tres_eleve", "nom": "Très élevé", "couleur": "#7C3AED", "description": "Risque critique"}
]

