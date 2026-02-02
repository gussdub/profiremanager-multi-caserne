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


# ==================== DONNÉES PAR DÉFAUT ====================

VIOLATIONS_DEFAUT = [
    {
        "code_article": "CNPI 2.1.5.1",
        "description_standard": "Extincteurs portatifs manquants, hors service ou inspection annuelle échue.",
        "delai_jours": 15,
        "severite": "majeure",
        "categorie": "Extincteurs"
    },
    {
        "code_article": "CNPI 2.7.3.1",
        "description_standard": "Le système d'éclairage d'urgence est défectueux ou les batteries sont à remplacer.",
        "delai_jours": 30,
        "severite": "majeure",
        "categorie": "Éclairage Urgence"
    },
    {
        "code_article": "CNPI 2.4.1.1",
        "description_standard": "Accumulation de matières combustibles représentant un risque d'incendie dans le local technique.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Entreposage"
    },
    {
        "code_article": "RM-2024 Art. 12",
        "description_standard": "Le numéro civique n'est pas visible depuis la voie publique.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Municipal"
    },
    {
        "code_article": "CSQ Chap. VIII",
        "description_standard": "Porte coupe-feu endommagée ou ne se refermant pas hermétiquement (ferme-porte brisé).",
        "delai_jours": 45,
        "severite": "majeure",
        "categorie": "Structure"
    },
    {
        "code_article": "CNPI 2.2.1.1",
        "description_standard": "Avertisseur de fumée manquant ou hors service.",
        "delai_jours": 7,
        "severite": "urgente",
        "categorie": "Détection"
    },
    {
        "code_article": "CNPI 2.7.1.1",
        "description_standard": "Issues de secours obstruées ou verrouillées empêchant l'évacuation.",
        "delai_jours": 1,
        "severite": "urgente",
        "categorie": "Moyens d'évacuation"
    },
    {
        "code_article": "CNPI 2.6.1.1",
        "description_standard": "Système d'alarme incendie défectueux ou non fonctionnel.",
        "delai_jours": 14,
        "severite": "urgente",
        "categorie": "Alarme"
    },
    {
        "code_article": "CNPI 2.8.1.1",
        "description_standard": "Plan d'évacuation non affiché ou non conforme.",
        "delai_jours": 30,
        "severite": "mineure",
        "categorie": "Plans"
    },
    {
        "code_article": "CNPI 6.2.1.1",
        "description_standard": "Installation électrique non conforme présentant un risque d'incendie.",
        "delai_jours": 14,
        "severite": "majeure",
        "categorie": "Électricité"
    }
]


# ==================== ROUTES RÉFÉRENTIEL VIOLATIONS ====================

@router.get("/{tenant_slug}/prevention/ref-violations")
async def list_ref_violations(
    tenant_slug: str,
    categorie: Optional[str] = None,
    severite: Optional[str] = None,
    actif: Optional[bool] = True,
    current_user: User = Depends(get_current_user)
):
    """Liste des articles de référence pour les violations"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if categorie:
        query["categorie"] = categorie
    if severite:
        query["severite"] = severite
    if actif is not None:
        query["actif"] = actif
    
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
    current_user: User = Depends(get_current_user)
):
    """Initialiser le référentiel avec les données par défaut"""
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier s'il existe déjà des données
    existing = await db.ref_violations.count_documents({"tenant_id": tenant.id})
    if existing > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Le référentiel contient déjà {existing} articles. Supprimez-les d'abord."
        )
    
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
