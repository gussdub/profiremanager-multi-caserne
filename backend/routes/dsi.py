"""
Routes API pour le module DSI (Déclaration de Sinistre Incendie)
- Gestion des données de référence MSP
- Validation des rapports DSI
- Export XML pour transmission GSI
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import os

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/dsi", tags=["DSI"])

# Connexion MongoDB
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')
client = MongoClient(MONGO_URL)
db = client[DB_NAME]


# ============== MODÈLES ==============

class Municipalite(BaseModel):
    code_mamh: str
    nom: str
    designation: Optional[str] = None
    region_administrative: Optional[str] = None
    mrc: Optional[str] = None

class CodeReference(BaseModel):
    code: str
    libelle: str
    groupe: Optional[str] = None
    categorie: Optional[str] = None
    description: Optional[str] = None

class ValidationError(BaseModel):
    section: str
    champ: str
    message: str
    severity: str  # 'error' ou 'warning'

class ValidationResult(BaseModel):
    valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationError]


# ============== ENDPOINTS RÉFÉRENCE ==============

@router.get("/references/municipalites", response_model=List[Municipalite])
async def get_municipalites(search: Optional[str] = None, limit: int = 50):
    """Récupérer la liste des municipalités MAMH"""
    query = {}
    if search:
        query = {
            "$or": [
                {"nom": {"$regex": search, "$options": "i"}},
                {"code_mamh": {"$regex": f"^{search}"}}
            ]
        }
    
    municipalites = list(db.dsi_municipalites.find(
        query, 
        {"_id": 0, "code_mamh": 1, "nom": 1, "designation": 1, "region_administrative": 1, "mrc": 1}
    ).limit(limit))
    
    return municipalites


@router.get("/references/causes", response_model=List[CodeReference])
async def get_causes():
    """Récupérer la liste des causes MSP"""
    causes = list(db.dsi_causes.find({}, {"_id": 0}))
    return causes


@router.get("/references/sources-chaleur", response_model=List[CodeReference])
async def get_sources_chaleur():
    """Récupérer la liste des sources de chaleur MSP"""
    sources = list(db.dsi_sources_chaleur.find({}, {"_id": 0}))
    return sources


@router.get("/references/facteurs-allumage", response_model=List[CodeReference])
async def get_facteurs_allumage():
    """Récupérer la liste des facteurs d'allumage MSP"""
    facteurs = list(db.dsi_facteurs_allumage.find({}, {"_id": 0}))
    return facteurs


@router.get("/references/usages-batiment", response_model=List[CodeReference])
async def get_usages_batiment():
    """Récupérer la liste des usages de bâtiment CNB"""
    usages = list(db.dsi_usages_batiment.find({}, {"_id": 0}))
    return usages


@router.get("/references/natures-sinistre", response_model=List[CodeReference])
async def get_natures_sinistre():
    """Récupérer la liste des natures de sinistre MSP"""
    natures = list(db.dsi_natures_sinistre.find({}, {"_id": 0}))
    return natures


@router.get("/references/materiaux", response_model=List[CodeReference])
async def get_materiaux():
    """Récupérer la liste des matériaux premiers enflammés"""
    materiaux = list(db.dsi_materiaux.find({}, {"_id": 0}))
    return materiaux


# ============== VALIDATION DSI ==============

def validate_dsi_report(intervention: dict) -> ValidationResult:
    """
    Valide un rapport DSI selon les exigences du MSP
    Retourne une liste d'erreurs et d'avertissements
    """
    errors = []
    warnings = []
    
    # Déterminer si c'est un vrai incendie (requiert DSI complet)
    nature_code = intervention.get('nature_code', '')
    nature = db.dsi_natures_sinistre.find_one({"code": nature_code})
    is_real_fire = nature.get('requiert_dsi', False) if nature else False
    
    # ===== SECTION IDENTIFICATION =====
    if not intervention.get('xml_incident_number'):
        errors.append(ValidationError(
            section="Identification",
            champ="xml_incident_number",
            message="Numéro d'intervention obligatoire",
            severity="error"
        ))
    
    if not intervention.get('xml_time_call_received'):
        errors.append(ValidationError(
            section="Identification",
            champ="xml_time_call_received",
            message="Date/heure d'appel obligatoire",
            severity="error"
        ))
    
    if not intervention.get('municipalite_code'):
        errors.append(ValidationError(
            section="Identification",
            champ="municipalite_code",
            message="Code de municipalité MAMH obligatoire",
            severity="error"
        ))
    
    # ===== SECTION LOCALISATION =====
    if not intervention.get('xml_address'):
        errors.append(ValidationError(
            section="Localisation",
            champ="xml_address",
            message="Adresse complète obligatoire",
            severity="error"
        ))
    
    if is_real_fire and not intervention.get('usage_batiment_code'):
        errors.append(ValidationError(
            section="Localisation",
            champ="usage_batiment_code",
            message="Usage du bâtiment (CNB) obligatoire pour les incendies",
            severity="error"
        ))
    
    # ===== SECTION CHRONOLOGIE =====
    if not intervention.get('xml_time_dispatched'):
        warnings.append(ValidationError(
            section="Chronologie",
            champ="xml_time_dispatched",
            message="Heure de départ recommandée",
            severity="warning"
        ))
    
    if not intervention.get('xml_time_arrived'):
        errors.append(ValidationError(
            section="Chronologie",
            champ="xml_time_arrived",
            message="Heure d'arrivée sur les lieux obligatoire",
            severity="error"
        ))
    
    if is_real_fire and not intervention.get('xml_time_controlled'):
        errors.append(ValidationError(
            section="Chronologie",
            champ="xml_time_controlled",
            message="Heure de maîtrise (10-10) obligatoire pour les incendies",
            severity="error"
        ))
    
    # ===== SECTION DSI (ANALYSE) =====
    if is_real_fire:
        if not intervention.get('cause_id'):
            errors.append(ValidationError(
                section="Analyse DSI",
                champ="cause_id",
                message="Cause probable obligatoire pour les incendies",
                severity="error"
            ))
        
        if not intervention.get('source_heat_id'):
            errors.append(ValidationError(
                section="Analyse DSI",
                champ="source_heat_id",
                message="Source de chaleur (ignition) obligatoire pour les incendies",
                severity="error"
            ))
        
        if not intervention.get('facteur_allumage_id'):
            errors.append(ValidationError(
                section="Analyse DSI",
                champ="facteur_allumage_id",
                message="Facteur d'allumage obligatoire pour les incendies",
                severity="error"
            ))
        
        if not intervention.get('material_first_ignited_id'):
            errors.append(ValidationError(
                section="Analyse DSI",
                champ="material_first_ignited_id",
                message="Matériau premier enflammé obligatoire pour les incendies",
                severity="error"
            ))
        
        # Vérifier si cause indéterminée nécessite justification
        cause = db.dsi_causes.find_one({"code": intervention.get('cause_id')})
        if cause and 'indéterminée' in cause.get('libelle', '').lower():
            if not intervention.get('cause_indeterminee_justification'):
                errors.append(ValidationError(
                    section="Analyse DSI",
                    champ="cause_indeterminee_justification",
                    message="Justification obligatoire si cause indéterminée",
                    severity="error"
                ))
    
    # ===== SECTION RESSOURCES =====
    personnel = intervention.get('manual_personnel', [])
    vehicles = intervention.get('manual_vehicles', [])
    xml_resources = intervention.get('resources', [])
    xml_vehicles = intervention.get('vehicles', [])
    
    total_pompiers = len(personnel) + len(xml_resources)
    total_vehicules = len(vehicles) + len(xml_vehicles)
    
    if total_pompiers == 0:
        errors.append(ValidationError(
            section="Ressources",
            champ="personnel",
            message="Au moins un pompier doit être assigné",
            severity="error"
        ))
    
    if total_vehicules == 0:
        warnings.append(ValidationError(
            section="Ressources",
            champ="vehicules",
            message="Aucun véhicule enregistré",
            severity="warning"
        ))
    
    # ===== SECTION VICTIMES =====
    # Les champs doivent être renseignés (même si 0)
    if intervention.get('civilian_deaths') is None:
        errors.append(ValidationError(
            section="Victimes",
            champ="civilian_deaths",
            message="Nombre de décès civils doit être renseigné (0 si aucun)",
            severity="error"
        ))
    
    if intervention.get('civilian_injuries_minor') is None and intervention.get('civilian_injuries_major') is None:
        warnings.append(ValidationError(
            section="Victimes",
            champ="civilian_injuries",
            message="Nombre de blessés civils recommandé",
            severity="warning"
        ))
    
    if intervention.get('firefighter_deaths') is None:
        errors.append(ValidationError(
            section="Victimes",
            champ="firefighter_deaths",
            message="Nombre de décès pompiers doit être renseigné (0 si aucun)",
            severity="error"
        ))
    
    # ===== SECTION DOMMAGES =====
    if is_real_fire:
        if intervention.get('estimated_loss_building') is None:
            errors.append(ValidationError(
                section="Dommages",
                champ="estimated_loss_building",
                message="Estimation des dommages au bâtiment obligatoire (0$ si aucun)",
                severity="error"
            ))
        
        if intervention.get('estimated_loss_content') is None:
            warnings.append(ValidationError(
                section="Dommages",
                champ="estimated_loss_content",
                message="Estimation des dommages au contenu recommandée",
                severity="warning"
            ))
    
    return ValidationResult(
        valid=len(errors) == 0,
        errors=errors,
        warnings=warnings
    )


@router.post("/validate/{intervention_id}", response_model=ValidationResult)
async def validate_intervention_dsi(intervention_id: str, tenant_slug: str):
    """Valider une intervention pour la conformité DSI"""
    intervention = db.interventions.find_one({"id": intervention_id})
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    return validate_dsi_report(intervention)


# ============== EXPORT XML ==============

@router.get("/export/{intervention_id}/xml")
async def export_intervention_xml(intervention_id: str, tenant_slug: str):
    """Générer le fichier XML DSI pour une intervention"""
    intervention = db.interventions.find_one({"id": intervention_id})
    if not intervention:
        raise HTTPException(status_code=404, detail="Intervention non trouvée")
    
    # Valider d'abord
    validation = validate_dsi_report(intervention)
    if not validation.valid:
        raise HTTPException(
            status_code=400, 
            detail={
                "message": "L'intervention ne peut pas être exportée - validation échouée",
                "errors": [e.dict() for e in validation.errors]
            }
        )
    
    # Générer le XML (structure générique GSI en attendant le schéma officiel)
    xml_content = generate_gsi_xml(intervention)
    
    return {
        "filename": f"DSI_{intervention.get('xml_incident_number', intervention_id)}.xml",
        "content": xml_content,
        "generated_at": datetime.utcnow().isoformat()
    }


def generate_gsi_xml(intervention: dict) -> str:
    """Générer le contenu XML selon le format GSI"""
    
    # Récupérer les libellés depuis les tables de référence
    cause = db.dsi_causes.find_one({"code": intervention.get('cause_id')})
    source = db.dsi_sources_chaleur.find_one({"code": intervention.get('source_heat_id')})
    facteur = db.dsi_facteurs_allumage.find_one({"code": intervention.get('facteur_allumage_id')})
    materiau = db.dsi_materiaux.find_one({"code": intervention.get('material_first_ignited_id')})
    municipalite = db.dsi_municipalites.find_one({"code_mamh": intervention.get('municipalite_code')})
    
    # Calculer les totaux
    total_pompiers = len(intervention.get('manual_personnel', [])) + len(intervention.get('resources', []))
    total_vehicules = len(intervention.get('manual_vehicles', [])) + len(intervention.get('vehicles', []))
    
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<DeclarationSinistreIncendie xmlns="http://msp.gouv.qc.ca/gsi" version="1.0">
    <Identification>
        <NumeroIntervention>{intervention.get('xml_incident_number', '')}</NumeroIntervention>
        <CodeMunicipalite>{intervention.get('municipalite_code', '')}</CodeMunicipalite>
        <NomMunicipalite>{municipalite.get('nom', '') if municipalite else ''}</NomMunicipalite>
        <DateHeureAppel>{intervention.get('xml_time_call_received', '')}</DateHeureAppel>
    </Identification>
    
    <Localisation>
        <Adresse>{intervention.get('xml_address', '')}</Adresse>
        <Ville>{intervention.get('xml_city', '')}</Ville>
        <CodePostal>{intervention.get('xml_postal_code', '')}</CodePostal>
        <UsageBatiment code="{intervention.get('usage_batiment_code', '')}">{intervention.get('usage_batiment_libelle', '')}</UsageBatiment>
    </Localisation>
    
    <Chronologie>
        <HeureAlerte>{intervention.get('xml_time_call_received', '')}</HeureAlerte>
        <HeureDepart>{intervention.get('xml_time_dispatched', '')}</HeureDepart>
        <HeureArrivee>{intervention.get('xml_time_arrived', '')}</HeureArrivee>
        <HeureMaitrise>{intervention.get('xml_time_controlled', '')}</HeureMaitrise>
        <HeureFinIntervention>{intervention.get('xml_time_available', '')}</HeureFinIntervention>
    </Chronologie>
    
    <AnalyseIncendie>
        <Cause code="{intervention.get('cause_id', '')}">{cause.get('libelle', '') if cause else ''}</Cause>
        <SourceChaleur code="{intervention.get('source_heat_id', '')}">{source.get('libelle', '') if source else ''}</SourceChaleur>
        <FacteurAllumage code="{intervention.get('facteur_allumage_id', '')}">{facteur.get('libelle', '') if facteur else ''}</FacteurAllumage>
        <MateriauPremierEnflamme code="{intervention.get('material_first_ignited_id', '')}">{materiau.get('libelle', '') if materiau else ''}</MateriauPremierEnflamme>
        <LieuOrigine>{intervention.get('fire_origin_location', '')}</LieuOrigine>
        <Propagation>{intervention.get('fire_spread', '')}</Propagation>
    </AnalyseIncendie>
    
    <Ressources>
        <NombrePompiers>{total_pompiers}</NombrePompiers>
        <NombreVehicules>{total_vehicules}</NombreVehicules>
    </Ressources>
    
    <BilanHumain>
        <Civils>
            <BlessesLegers>{intervention.get('civilian_injuries_minor', 0) or 0}</BlessesLegers>
            <BlessesGraves>{intervention.get('civilian_injuries_major', 0) or 0}</BlessesGraves>
            <Deces>{intervention.get('civilian_deaths', 0) or 0}</Deces>
        </Civils>
        <Pompiers>
            <BlessesLegers>{intervention.get('firefighter_injuries_minor', 0) or 0}</BlessesLegers>
            <BlessesGraves>{intervention.get('firefighter_injuries_major', 0) or 0}</BlessesGraves>
            <Deces>{intervention.get('firefighter_deaths', 0) or 0}</Deces>
        </Pompiers>
    </BilanHumain>
    
    <Dommages>
        <EstimationBatiment devise="CAD">{intervention.get('estimated_loss_building', 0) or 0}</EstimationBatiment>
        <EstimationContenu devise="CAD">{intervention.get('estimated_loss_content', 0) or 0}</EstimationContenu>
        <EstimationTotale devise="CAD">{(intervention.get('estimated_loss_building', 0) or 0) + (intervention.get('estimated_loss_content', 0) or 0)}</EstimationTotale>
    </Dommages>
    
    <Metadata>
        <DateGeneration>{datetime.utcnow().isoformat()}</DateGeneration>
        <Version>ProFireManager-GSI-1.0</Version>
    </Metadata>
</DeclarationSinistreIncendie>'''
    
    return xml
