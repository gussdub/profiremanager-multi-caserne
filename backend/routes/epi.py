"""
Routes API pour le module EPI (Équipements de Protection Individuelle)
=====================================================================

Ce module gère les EPI selon la norme NFPA 1851 :
- Types d'EPI personnalisables
- Inventaire des EPI
- Inspections et nettoyages
- Réparations et retrait
- Module "Mes EPI" pour les employés
- Demandes de remplacement
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["EPI - Équipements de Protection"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES IMPORT CSV ====================

class ImportFieldConfig(BaseModel):
    """Configuration d'un champ pour l'import CSV"""
    key: str
    label: str
    required: bool = False


class ImportSettings(BaseModel):
    """Configuration des imports CSV pour un tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_fields: List[ImportFieldConfig] = []
    personnel_fields: List[ImportFieldConfig] = []
    rapports_fields: List[ImportFieldConfig] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ImportSettingsUpdate(BaseModel):
    """Mise à jour des configurations d'import"""
    epi_fields: Optional[List[ImportFieldConfig]] = None
    personnel_fields: Optional[List[ImportFieldConfig]] = None
    rapports_fields: Optional[List[ImportFieldConfig]] = None


# ==================== MODÈLES EPI NFPA 1851 ====================

class EPI(BaseModel):
    """Modèle complet d'un équipement de protection individuelle selon NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    numero_serie: str  # Numéro de série interne (format libre)
    type_epi: str  # ID du type d'EPI personnalisé
    marque: str
    modele: str
    numero_serie_fabricant: str = ""
    date_fabrication: Optional[str] = None
    date_mise_en_service: str
    norme_certification: str = ""  # ex: NFPA 1971, édition 2018
    cout_achat: float = 0.0
    couleur: str = ""
    taille: str = ""
    user_id: Optional[str] = None  # Affecté à quel pompier
    statut: str = "En service"  # En service, En inspection, En réparation, Hors service, Retiré
    notes: str = ""
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: str = ""  # Formulaire pour inspection après utilisation
    formulaire_routine_id: str = ""  # Formulaire pour inspection routine mensuelle
    formulaire_avancee_id: str = ""  # Formulaire pour inspection avancée annuelle
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== TYPES D'EPI PERSONNALISÉS ====================
class TypeEPI(BaseModel):
    """Type/Catégorie d'EPI personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Casque", "Harnais", "Bottes"
    icone: str = "🛡️"  # Emoji pour l'affichage
    description: str = ""
    ordre: int = 0  # Pour trier l'affichage
    est_defaut: bool = False  # Types par défaut non supprimables
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TypeEPICreate(BaseModel):
    nom: str
    icone: str = "🛡️"
    description: str = ""
    ordre: int = 0

class TypeEPIUpdate(BaseModel):
    nom: Optional[str] = None
    icone: Optional[str] = None
    description: Optional[str] = None
    ordre: Optional[int] = None
    actif: Optional[bool] = None

class EPICreate(BaseModel):
    tenant_id: Optional[str] = None
    numero_serie: str = ""  # Auto-généré si vide
    type_epi: str
    marque: str
    modele: str
    numero_serie_fabricant: str = ""
    date_fabrication: Optional[str] = None
    date_mise_en_service: str
    norme_certification: str = ""
    cout_achat: float = 0.0
    couleur: str = ""
    taille: str = ""
    user_id: Optional[str] = None
    statut: str = "En service"
    notes: str = ""
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: str = ""
    formulaire_routine_id: str = ""
    formulaire_avancee_id: str = ""

class EPIUpdate(BaseModel):
    numero_serie: Optional[str] = None
    type_epi: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    numero_serie_fabricant: Optional[str] = None
    date_fabrication: Optional[str] = None
    date_mise_en_service: Optional[str] = None
    norme_certification: Optional[str] = None
    cout_achat: Optional[float] = None
    couleur: Optional[str] = None
    taille: Optional[str] = None
    user_id: Optional[str] = None
    statut: Optional[str] = None
    notes: Optional[str] = None
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: Optional[str] = None
    formulaire_routine_id: Optional[str] = None
    formulaire_avancee_id: Optional[str] = None

class InspectionEPI(BaseModel):
    """Modèle pour les 3 types d'inspections NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    type_inspection: str  # apres_utilisation, routine_mensuelle, avancee_annuelle
    date_inspection: str
    inspecteur_nom: str
    inspecteur_id: Optional[str] = None  # Si c'est un utilisateur du système
    isp_id: Optional[str] = None  # Si inspection par ISP
    isp_nom: str = ""
    isp_accreditations: str = ""
    statut_global: str  # conforme, non_conforme, necessite_reparation, hors_service
    checklist: Dict[str, Any] = {}  # JSON avec tous les points de vérification
    photos: List[str] = []
    commentaires: str = ""
    rapport_pdf_url: str = ""  # Pour inspection avancée
    signature_numerique: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    type_inspection: str
    date_inspection: str
    inspecteur_nom: str
    inspecteur_id: Optional[str] = None
    isp_id: Optional[str] = None
    isp_nom: str = ""
    isp_accreditations: str = ""
    statut_global: str
    checklist: Dict[str, Any] = {}
    photos: List[str] = []
    commentaires: str = ""
    rapport_pdf_url: str = ""
    signature_numerique: str = ""

# Nouveaux modèles pour "Mes EPI"
class InspectionApresUsage(BaseModel):
    """Inspection simple après utilisation par l'employé"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    user_id: str  # Employé qui fait l'inspection
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str  # "ok" ou "defaut"
    defauts_constates: str = ""  # Description des défauts si statut = "defaut"
    notes: str = ""
    photo_url: str = ""  # URL de la photo du défaut (optionnel)
    criteres_inspection: Optional[Dict[str, bool]] = {}  # Critères cochés/décochés

class InspectionApresUsageCreate(BaseModel):
    statut: str  # "ok" ou "defaut"
    defauts_constates: Optional[str] = ""
    notes: Optional[str] = ""
    photo_url: Optional[str] = ""
    criteres_inspection: Optional[Dict[str, bool]] = {}

class DemandeRemplacementEPI(BaseModel):
    """Demande de remplacement d'EPI par un employé"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    user_id: str  # Employé qui fait la demande
    raison: str  # "Usé", "Perdu", "Défectueux", "Taille inadaptée"
    notes_employe: str = ""
    statut: str = "En attente"  # "En attente", "Approuvée", "Refusée"
    date_demande: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_traitement: Optional[datetime] = None
    traite_par: Optional[str] = None  # ID admin/superviseur qui traite
    notes_admin: str = ""  # Notes de l'admin lors du traitement

class DemandeRemplacementEPICreate(BaseModel):
    raison: str
    notes_employe: Optional[str] = ""

class ISP(BaseModel):
    """Fournisseur de Services Indépendant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    contact: str = ""
    telephone: str = ""
    email: str = ""
    accreditations: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ISPCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    contact: str = ""
    telephone: str = ""
    email: str = ""
    accreditations: str = ""
    notes: str = ""

class ISPUpdate(BaseModel):
    nom: Optional[str] = None
    contact: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    accreditations: Optional[str] = None
    notes: Optional[str] = None

# ==================== MODÈLES PHASE 2 : NETTOYAGE, RÉPARATIONS, RETRAIT ====================

class NettoyageEPI(BaseModel):
    """Suivi des nettoyages EPI selon NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    type_nettoyage: str  # routine, avance
    date_nettoyage: str
    methode: str  # laveuse_extractrice, manuel, externe
    effectue_par: str  # Nom de la personne ou organisation
    effectue_par_id: Optional[str] = None  # ID utilisateur si interne
    isp_id: Optional[str] = None  # Si nettoyage externe
    nombre_cycles: int = 1  # Pour suivi limite fabricant
    temperature: str = ""  # Ex: "Eau tiède max 40°C"
    produits_utilises: str = ""
    cout_nettoyage: float = 0.0  # Coût du nettoyage (pour les externes)
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NettoyageEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    type_nettoyage: str
    date_nettoyage: str
    methode: str
    effectue_par: str
    effectue_par_id: Optional[str] = None
    isp_id: Optional[str] = None
    nombre_cycles: int = 1
    temperature: str = ""
    produits_utilises: str = ""
    cout_nettoyage: float = 0.0
    notes: str = ""

class ReparationEPI(BaseModel):
    """Gestion des réparations EPI"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    statut: str  # demandee, en_cours, terminee, impossible
    date_demande: str
    demandeur: str
    demandeur_id: Optional[str] = None
    date_envoi: Optional[str] = None
    date_reception: Optional[str] = None
    date_reparation: Optional[str] = None
    reparateur_type: str  # interne, externe
    reparateur_nom: str = ""
    isp_id: Optional[str] = None
    probleme_description: str
    pieces_remplacees: List[str] = []
    cout_reparation: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReparationEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    statut: str = "demandee"
    date_demande: str
    demandeur: str
    demandeur_id: Optional[str] = None
    reparateur_type: str
    reparateur_nom: str = ""
    isp_id: Optional[str] = None
    probleme_description: str
    notes: str = ""

class ReparationEPIUpdate(BaseModel):
    statut: Optional[str] = None
    date_envoi: Optional[str] = None
    date_reception: Optional[str] = None
    date_reparation: Optional[str] = None
    reparateur_nom: Optional[str] = None
    isp_id: Optional[str] = None
    pieces_remplacees: Optional[List[str]] = None
    cout_reparation: Optional[float] = None
    notes: Optional[str] = None

class RetraitEPI(BaseModel):
    """Enregistrement du retrait définitif d'un EPI"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    date_retrait: str
    raison: str  # age_limite, dommage_irreparable, echec_inspection, autre
    description_raison: str
    methode_disposition: str  # coupe_detruit, recyclage, don, autre
    preuve_disposition: List[str] = []  # URLs photos
    certificat_disposition_url: str = ""
    cout_disposition: float = 0.0
    retire_par: str
    retire_par_id: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetraitEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    date_retrait: str
    raison: str
    description_raison: str
    methode_disposition: str
    preuve_disposition: List[str] = []
    certificat_disposition_url: str = ""
    cout_disposition: float = 0.0
    retire_par: str
    retire_par_id: Optional[str] = None
    notes: str = ""




# ==================== ROUTES EPI ====================

# ========== TYPES D'EPI PERSONNALISÉS ==========

# Types d'EPI par défaut
TYPES_EPI_DEFAUT = [
    {"nom": "Casque", "icone": "⛑️", "description": "Casque de protection incendie", "ordre": 1},
    {"nom": "Bottes", "icone": "🥾", "description": "Bottes de combat incendie", "ordre": 2},
    {"nom": "Manteau Habit de Combat", "icone": "🧥", "description": "Veste/Manteau bunker gear", "ordre": 3},
    {"nom": "Pantalon Habit de Combat", "icone": "👖", "description": "Pantalon bunker gear", "ordre": 4},
    {"nom": "Gants", "icone": "🧤", "description": "Gants de protection incendie", "ordre": 5},
    {"nom": "Cagoule Anti-Particules", "icone": "🎭", "description": "Cagoule de protection", "ordre": 6},
]

async def ensure_default_types_epi(tenant_id: str):
    """Crée les types d'EPI par défaut s'ils n'existent pas"""
    existing = await db.types_epi.count_documents({"tenant_id": tenant_id})
    if existing == 0:
        for type_defaut in TYPES_EPI_DEFAUT:
            await db.types_epi.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "nom": type_defaut["nom"],
                "icone": type_defaut["icone"],
                "description": type_defaut["description"],
                "ordre": type_defaut["ordre"],
                "est_defaut": True,
                "actif": True,
                "created_at": datetime.now(timezone.utc)
            })

@router.get("/{tenant_slug}/types-epi")
async def get_types_epi(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les types d'EPI du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # S'assurer que les types par défaut existent
    await ensure_default_types_epi(tenant.id)
    
    types = await db.types_epi.find(
        {"tenant_id": tenant.id, "actif": True},
        {"_id": 0}
    ).sort("ordre", 1).to_list(100)
    
    return types

@router.post("/{tenant_slug}/types-epi")
async def create_type_epi(
    tenant_slug: str, 
    type_data: TypeEPICreate, 
    current_user: User = Depends(get_current_user)
):
    """Crée un nouveau type d'EPI (Admin uniquement)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier si le nom existe déjà
    existing = await db.types_epi.find_one({
        "tenant_id": tenant.id, 
        "nom": {"$regex": f"^{type_data.nom}$", "$options": "i"},
        "actif": True
    })
    if existing:
        raise HTTPException(status_code=400, detail="Un type d'EPI avec ce nom existe déjà")
    
    # Trouver le prochain ordre
    max_ordre = await db.types_epi.find_one(
        {"tenant_id": tenant.id},
        sort=[("ordre", -1)]
    )
    next_ordre = (max_ordre.get("ordre", 0) + 1) if max_ordre else 1
    
    new_type = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": type_data.nom,
        "icone": type_data.icone or "🛡️",
        "description": type_data.description or "",
        "ordre": type_data.ordre if type_data.ordre > 0 else next_ordre,
        "est_defaut": False,
        "actif": True,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.types_epi.insert_one(new_type)
    del new_type["_id"]
    
    return new_type

@router.put("/{tenant_slug}/types-epi/{type_id}")
async def update_type_epi(
    tenant_slug: str,
    type_id: str,
    type_data: TypeEPIUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifie un type d'EPI (Admin uniquement)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le type existe
    type_epi = await db.types_epi.find_one({"id": type_id, "tenant_id": tenant.id})
    if not type_epi:
        raise HTTPException(status_code=404, detail="Type d'EPI non trouvé")
    
    # Préparer les mises à jour
    update_data = {}
    if type_data.nom is not None:
        # Vérifier unicité du nom
        existing = await db.types_epi.find_one({
            "tenant_id": tenant.id,
            "nom": {"$regex": f"^{type_data.nom}$", "$options": "i"},
            "id": {"$ne": type_id},
            "actif": True
        })
        if existing:
            raise HTTPException(status_code=400, detail="Un type d'EPI avec ce nom existe déjà")
        update_data["nom"] = type_data.nom
    
    if type_data.icone is not None:
        update_data["icone"] = type_data.icone
    if type_data.description is not None:
        update_data["description"] = type_data.description
    if type_data.ordre is not None:
        update_data["ordre"] = type_data.ordre
    if type_data.actif is not None:
        update_data["actif"] = type_data.actif
    
    if update_data:
        await db.types_epi.update_one(
            {"id": type_id, "tenant_id": tenant.id},
            {"$set": update_data}
        )
    
    updated = await db.types_epi.find_one({"id": type_id}, {"_id": 0})
    return updated

@router.delete("/{tenant_slug}/types-epi/{type_id}")
async def delete_type_epi(
    tenant_slug: str,
    type_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un type d'EPI (Admin uniquement, types non-défaut uniquement)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le type existe
    type_epi = await db.types_epi.find_one({"id": type_id, "tenant_id": tenant.id})
    if not type_epi:
        raise HTTPException(status_code=404, detail="Type d'EPI non trouvé")
    
    # Empêcher la suppression des types par défaut
    if type_epi.get("est_defaut"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer un type d'EPI par défaut. Vous pouvez le désactiver.")
    
    # Vérifier si des EPIs utilisent ce type
    epis_count = await db.epi.count_documents({
        "tenant_id": tenant.id,
        "type_epi": type_epi.get("nom")
    })
    
    if epis_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer: {epis_count} EPI(s) utilisent ce type. Désactivez-le plutôt."
        )
    
    await db.types_epi.delete_one({"id": type_id, "tenant_id": tenant.id})
    
    return {"message": "Type d'EPI supprimé"}

# ========== EPI CRUD ==========

@router.post("/{tenant_slug}/epi", response_model=EPI)
async def create_epi(tenant_slug: str, epi: EPICreate, current_user: User = Depends(get_current_user)):
    """Crée un nouvel équipement EPI (Admin/Superviseur/Employé pour lui-même)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Les admins/superviseurs peuvent créer pour n'importe qui
    # Les employés peuvent créer uniquement pour eux-mêmes
    if current_user.role not in ["admin", "superviseur"]:
        if epi.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Vous ne pouvez créer des EPI que pour vous-même")
    
    epi_dict = epi.dict()
    epi_dict["tenant_id"] = tenant.id
    
    # Générer numéro de série automatique si vide
    if not epi_dict.get("numero_serie") or epi_dict["numero_serie"].strip() == "":
        # Compter les EPI existants pour générer un numéro unique
        count = await db.epis.count_documents({"tenant_id": tenant.id})
        annee = datetime.now(timezone.utc).year
        epi_dict["numero_serie"] = f"EPI-{annee}-{count + 1:04d}"
    else:
        # Vérifier que le numéro de série est unique
        existing_epi = await db.epis.find_one({
            "numero_serie": epi_dict["numero_serie"],
            "tenant_id": tenant.id
        })
        
        if existing_epi:
            raise HTTPException(
                status_code=400,
                detail=f"Un EPI avec le numéro de série {epi_dict['numero_serie']} existe déjà"
            )
    
    epi_obj = EPI(**epi_dict)
    
    # Préparer pour MongoDB (conversion datetime -> ISO string)
    epi_data = epi_obj.dict()
    epi_data["created_at"] = epi_obj.created_at.isoformat()
    epi_data["updated_at"] = epi_obj.updated_at.isoformat()
    
    await db.epis.insert_one(epi_data)
    
    # Créer une activité
    user = await db.users.find_one({"id": epi.user_id, "tenant_id": tenant.id})
    if user:
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="epi_attribution",
            description=f"🧰 {current_user.prenom} {current_user.nom} a attribué l'EPI '{epi.type_epi}' (#{epi_dict['numero_serie']}) à {user['prenom']} {user['nom']}",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}",
            data={"concerne_user_id": epi.user_id}
        )
    
    return epi_obj

@router.post("/{tenant_slug}/epi/import-csv")
async def import_epis_csv(
    tenant_slug: str,
    epis_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Import en masse d'EPI depuis un CSV"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = epis_data.get("epis", [])
    if not epis:
        raise HTTPException(status_code=400, detail="Aucun EPI à importer")
    
    results = {
        "total": len(epis),
        "created": 0,
        "updated": 0,
        "errors": [],
        "duplicates": []
    }
    
    # Précharger les utilisateurs pour matching intelligent
    users_list = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    users_by_name = create_user_matching_index(users_list)
    users_by_num = {u.get("numero_employe"): u for u in users_list if u.get("numero_employe")}
    
    for index, epi_data in enumerate(epis):
        try:
            # Validation des champs obligatoires
            if not epi_data.get("type_epi") or not epi_data.get("numero_serie"):
                results["errors"].append({
                    "line": index + 1,
                    "error": "Type EPI et Numéro de série requis",
                    "data": epi_data
                })
                continue
            
            # Rechercher l'employé avec matching intelligent
            user_id = None
            if epi_data.get("employe_nom"):
                employe_str = epi_data["employe_nom"].strip()
                
                # Utiliser le matching intelligent
                user_obj = find_user_intelligent(
                    search_string=employe_str,
                    users_by_name=users_by_name,
                    users_by_num=users_by_num,
                    numero_field="numero_employe"
                )
                
                if user_obj:
                    user_id = user_obj["id"]
                else:
                    results["errors"].append({
                        "line": index + 1,
                        "error": f"Employé non trouvé: {employe_str}",
                        "data": epi_data
                    })
                    continue
            
            # Vérifier si l'EPI existe déjà (par numéro de série)
            existing_epi = await db.epis.find_one({
                "numero_serie": epi_data["numero_serie"],
                "tenant_id": tenant.id
            })
            
            if existing_epi:
                results["duplicates"].append({
                    "line": index + 1,
                    "numero_serie": epi_data["numero_serie"],
                    "action": epi_data.get("action_doublon", "skip"),  # skip, update, create
                    "data": epi_data
                })
                
                # Si action_doublon = update, mettre à jour
                if epi_data.get("action_doublon") == "update":
                    update_data = {
                        "type_epi": epi_data.get("type_epi"),
                        "marque": epi_data.get("marque", ""),
                        "modele": epi_data.get("modele", ""),
                        "taille": epi_data.get("taille", ""),
                        "statut": epi_data.get("statut", "bon"),
                        "norme_certification": epi_data.get("norme_certification", ""),
                        "notes": epi_data.get("notes", ""),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    if user_id:
                        update_data["user_id"] = user_id
                    
                    # Dates optionnelles
                    if epi_data.get("date_mise_en_service"):
                        update_data["date_mise_en_service"] = epi_data["date_mise_en_service"]
                    if epi_data.get("date_dernier_controle"):
                        update_data["date_dernier_controle"] = epi_data["date_dernier_controle"]
                    if epi_data.get("date_prochain_controle"):
                        update_data["date_prochain_controle"] = epi_data["date_prochain_controle"]
                    
                    await db.epis.update_one(
                        {"id": existing_epi["id"], "tenant_id": tenant.id},
                        {"$set": update_data}
                    )
                    results["updated"] += 1
                elif epi_data.get("action_doublon") == "create":
                    # Créer quand même avec un numéro de série modifié
                    count = await db.epis.count_documents({"tenant_id": tenant.id})
                    epi_data["numero_serie"] = f"{epi_data['numero_serie']}-DUP-{count + 1}"
                    # Continue avec la création ci-dessous
                else:
                    # skip par défaut
                    continue
            
            # Créer l'EPI s'il n'existe pas (ou si action_doublon = create)
            if not existing_epi or epi_data.get("action_doublon") == "create":
                new_epi = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant.id,
                    "type_epi": epi_data["type_epi"],
                    "numero_serie": epi_data["numero_serie"],
                    "marque": epi_data.get("marque", ""),
                    "modele": epi_data.get("modele", ""),
                    "taille": epi_data.get("taille", ""),
                    "statut": epi_data.get("statut", "bon"),
                    "norme_certification": epi_data.get("norme_certification", ""),
                    "notes": epi_data.get("notes", ""),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                
                if user_id:
                    new_epi["user_id"] = user_id
                
                # Dates optionnelles
                if epi_data.get("date_mise_en_service"):
                    new_epi["date_mise_en_service"] = epi_data["date_mise_en_service"]
                if epi_data.get("date_dernier_controle"):
                    new_epi["date_dernier_controle"] = epi_data["date_dernier_controle"]
                if epi_data.get("date_prochain_controle"):
                    new_epi["date_prochain_controle"] = epi_data["date_prochain_controle"]
                
                await db.epis.insert_one(new_epi)
                results["created"] += 1
        
        except Exception as e:
            results["errors"].append({
                "line": index + 1,
                "error": str(e),
                "data": epi_data
            })
    
    return results


# ==================== CONFIGURATION IMPORTS CSV ====================

@router.get("/{tenant_slug}/config/import-settings")
async def get_import_settings(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère la configuration des imports CSV pour le tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur a les droits
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    # Récupérer ou créer la configuration par défaut
    settings = await db.import_settings.find_one({"tenant_id": tenant.id})
    
    if not settings:
        # Créer une configuration par défaut avec tous les champs disponibles
        default_epi_fields = [
            {"key": "numero_serie", "label": "Numéro de série interne (optionnel)", "required": False},
            {"key": "type_epi", "label": "Type d'EPI", "required": True},
            {"key": "marque", "label": "Marque", "required": True},
            {"key": "modele", "label": "Modèle", "required": True},
            {"key": "numero_serie_fabricant", "label": "N° série fabricant", "required": False},
            {"key": "date_fabrication", "label": "Date fabrication (YYYY-MM-DD)", "required": False},
            {"key": "date_mise_en_service", "label": "Date mise en service (YYYY-MM-DD)", "required": True},
            {"key": "norme_certification", "label": "Norme certification", "required": False},
            {"key": "cout_achat", "label": "Coût d'achat", "required": False},
            {"key": "couleur", "label": "Couleur", "required": False},
            {"key": "taille", "label": "Taille", "required": False},
            {"key": "user_id", "label": "Assigné à (ID utilisateur)", "required": False},
            {"key": "statut", "label": "Statut", "required": True},
            {"key": "notes", "label": "Notes", "required": False}
        ]
        
        default_personnel_fields = [
            {"key": "prenom", "label": "Prénom", "required": True},
            {"key": "nom", "label": "Nom", "required": True},
            {"key": "email", "label": "Email", "required": True},
            {"key": "numero_badge", "label": "Numéro de badge", "required": False},
            {"key": "telephone", "label": "Téléphone", "required": False},
            {"key": "adresse", "label": "Adresse", "required": False},
            {"key": "ville", "label": "Ville", "required": False},
            {"key": "code_postal", "label": "Code postal", "required": False},
            {"key": "date_naissance", "label": "Date de naissance", "required": False},
            {"key": "date_embauche", "label": "Date d'embauche", "required": False},
            {"key": "role", "label": "Rôle", "required": False},
            {"key": "statut", "label": "Statut", "required": False},
            {"key": "contact_urgence_nom", "label": "Contact urgence - Nom", "required": False},
            {"key": "contact_urgence_telephone", "label": "Contact urgence - Téléphone", "required": False},
            {"key": "contact_urgence_relation", "label": "Contact urgence - Relation", "required": False}
        ]
        
        default_rapports_fields = [
            {"key": "type", "label": "Type (budget/depense)", "required": True},
            {"key": "date", "label": "Date", "required": True},
            {"key": "description", "label": "Description", "required": True},
            {"key": "categorie", "label": "Catégorie", "required": False},
            {"key": "montant", "label": "Montant", "required": True},
            {"key": "notes", "label": "Notes", "required": False}
        ]
        
        settings = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "epi_fields": default_epi_fields,
            "personnel_fields": default_personnel_fields,
            "rapports_fields": default_rapports_fields,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.import_settings.insert_one(settings)
    
    # Remove MongoDB ObjectId and return clean data
    if settings and "_id" in settings:
        del settings["_id"]
    
    return settings


@router.put("/{tenant_slug}/config/import-settings")
async def update_import_settings(
    tenant_slug: str,
    settings_update: ImportSettingsUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour la configuration des imports CSV"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur a les droits
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    # Récupérer la configuration existante
    existing_settings = await db.import_settings.find_one({"tenant_id": tenant.id})
    
    if not existing_settings:
        raise HTTPException(status_code=404, detail="Configuration non trouvée")
    
    # Mettre à jour uniquement les champs fournis
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    
    if settings_update.epi_fields is not None:
        update_data["epi_fields"] = [field.dict() for field in settings_update.epi_fields]
    
    if settings_update.personnel_fields is not None:
        update_data["personnel_fields"] = [field.dict() for field in settings_update.personnel_fields]
    
    if settings_update.rapports_fields is not None:
        update_data["rapports_fields"] = [field.dict() for field in settings_update.rapports_fields]
    
    await db.import_settings.update_one(
        {"tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Retourner la configuration mise à jour
    updated_settings = await db.import_settings.find_one({"tenant_id": tenant.id})
    return updated_settings



@router.get("/{tenant_slug}/epi", response_model=List[EPI])
async def get_all_epis(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les EPI du tenant (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_epis = [clean_mongo_doc(epi) for epi in epis]
    
    # Convertir les dates ISO string vers datetime
    for epi in cleaned_epis:
        if isinstance(epi.get("created_at"), str):
            epi["created_at"] = datetime.fromisoformat(epi["created_at"].replace('Z', '+00:00'))
        if isinstance(epi.get("updated_at"), str):
            epi["updated_at"] = datetime.fromisoformat(epi["updated_at"].replace('Z', '+00:00'))
    
    return [EPI(**epi) for epi in cleaned_epis]

@router.get("/{tenant_slug}/epi/employe/{user_id}", response_model=List[EPI])
async def get_epis_by_employe(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les EPI d'un employé spécifique"""
    # Un employé peut voir ses propres EPIs, admin/superviseur peuvent voir tous les EPIs
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les EPIs assignés à cet employé
    epis = await db.epis.find({"tenant_id": tenant.id, "user_id": user_id}).to_list(1000)
    cleaned_epis = [clean_mongo_doc(epi) for epi in epis]
    
    # Convertir les dates ISO string vers datetime
    for epi in cleaned_epis:
        if isinstance(epi.get("created_at"), str):
            epi["created_at"] = datetime.fromisoformat(epi["created_at"].replace('Z', '+00:00'))
        if isinstance(epi.get("updated_at"), str):
            epi["updated_at"] = datetime.fromisoformat(epi["updated_at"].replace('Z', '+00:00'))
    
    return [EPI(**epi) for epi in cleaned_epis]

@router.get("/{tenant_slug}/epi/demandes-remplacement")
async def get_demandes_remplacement_epi(
    tenant_slug: str,
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupère les demandes de remplacement EPI (admin/superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Filtrer par statut si spécifié
    query = {"tenant_id": tenant.id}
    if statut:
        query["statut"] = statut
    
    demandes = await db.demandes_remplacement_epi.find(query).sort("date_demande", -1).to_list(1000)
    
    # Enrichir avec les infos EPI et utilisateur
    for demande in demandes:
        # Remove MongoDB ObjectId to prevent JSON serialization errors
        if "_id" in demande:
            del demande["_id"]
            
        epi = await db.epis.find_one({"id": demande["epi_id"], "tenant_id": tenant.id})
        user = await db.users.find_one({"id": demande["user_id"], "tenant_id": tenant.id})
        
        if epi:
            demande["epi_info"] = {
                "type_epi": epi.get("type_epi"),
                "marque": epi.get("marque"),
                "modele": epi.get("modele"),
                "numero_serie": epi.get("numero_serie")
            }
        
        if user:
            demande["user_nom"] = f"{user.get('prenom', '')} {user.get('nom', '')}"
        
        # Ajouter info admin si traité
        if demande.get("traite_par"):
            admin = await db.users.find_one({"id": demande["traite_par"], "tenant_id": tenant.id})
            if admin:
                demande["traite_par_nom"] = f"{admin.get('prenom', '')} {admin.get('nom', '')}"
    
    return demandes

@router.put("/{tenant_slug}/epi/demandes-remplacement/{demande_id}")
async def traiter_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    statut: str,
    notes_admin: str = "",
    current_user: User = Depends(get_current_user)
):
    """Approuver ou refuser une demande de remplacement (admin/superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if statut not in ["Approuvée", "Refusée"]:
        raise HTTPException(status_code=400, detail="Statut invalide. Doit être 'Approuvée' ou 'Refusée'")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer la demande
    demande = await db.demandes_remplacement_epi.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    if demande["statut"] != "En attente":
        raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
    
    # Mettre à jour la demande
    await db.demandes_remplacement_epi.update_one(
        {"id": demande_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": statut,
            "date_traitement": datetime.now(timezone.utc),
            "traite_par": current_user.id,
            "notes_admin": notes_admin
        }}
    )
    
    # Envoyer notification à l'employé
    await creer_notification(
        tenant_id=tenant.id,
        destinataire_id=demande["user_id"],
        type="reponse_demande_remplacement_epi",
        titre=f"Demande de remplacement EPI {'approuvée' if statut == 'Approuvée' else 'refusée'}",
        message=f"Votre demande de remplacement EPI a été {statut.lower()}. {notes_admin}",
        lien="/mes-epi",
        data={"demande_id": demande_id, "statut": statut}
    )
    
    return {"message": f"Demande {statut.lower()} avec succès"}

@router.post("/{tenant_slug}/epi/demandes-remplacement/{demande_id}/approuver")
async def approuver_demande_remplacement_epi(
    tenant_slug: str,
    demande_id: str,
    notes_admin: str = "",
    current_user: User = Depends(get_current_user)
):
    """Approuver une demande de remplacement EPI"""
    return await traiter_demande_remplacement(tenant_slug, demande_id, "Approuvée", notes_admin, current_user)

@router.post("/{tenant_slug}/epi/demandes-remplacement/{demande_id}/refuser")
async def refuser_demande_remplacement_epi(
    tenant_slug: str,
    demande_id: str,
    notes_admin: str = "",
    current_user: User = Depends(get_current_user)
):
    """Refuser une demande de remplacement EPI"""
    return await traiter_demande_remplacement(tenant_slug, demande_id, "Refusée", notes_admin, current_user)

# ==================== EPI PARAMETRES ENDPOINTS (doit être AVANT /{epi_id}) ====================

@router.get("/{tenant_slug}/epi/parametres")
async def get_epi_parametres(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres EPI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Retourner les paramètres EPI depuis les paramètres du tenant
    parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
    
    return {
        "epi_jours_avance_expiration": parametres.get('epi_jours_avance_expiration', 30),
        "epi_jour_alerte_inspection_mensuelle": parametres.get('epi_jour_alerte_inspection_mensuelle', 20),
        "emails_notifications_epi": parametres.get('emails_notifications_epi', [])
    }

@router.put("/{tenant_slug}/epi/parametres")
async def update_epi_parametres(
    tenant_slug: str,
    parametres_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres EPI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions (admin ou superviseur)
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Récupérer les paramètres actuels
    current_parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
    
    # Mettre à jour seulement les champs EPI fournis
    if 'epi_jours_avance_expiration' in parametres_data:
        current_parametres['epi_jours_avance_expiration'] = parametres_data['epi_jours_avance_expiration']
    
    if 'epi_jour_alerte_inspection_mensuelle' in parametres_data:
        current_parametres['epi_jour_alerte_inspection_mensuelle'] = parametres_data['epi_jour_alerte_inspection_mensuelle']
    
    if 'emails_notifications_epi' in parametres_data:
        current_parametres['emails_notifications_epi'] = parametres_data['emails_notifications_epi']
    
    # Sauvegarder dans la base de données
    await db.tenants.update_one(
        {"slug": tenant_slug},
        {"$set": {"parametres": current_parametres}}
    )
    
    return {"message": "Paramètres EPI mis à jour avec succès"}

@router.get("/{tenant_slug}/epi/{epi_id}", response_model=EPI)
async def get_epi_by_id(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Récupère un EPI spécifique par son ID"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    cleaned_epi = clean_mongo_doc(epi)
    
    # Convertir les dates
    if isinstance(cleaned_epi.get("created_at"), str):
        cleaned_epi["created_at"] = datetime.fromisoformat(cleaned_epi["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned_epi.get("updated_at"), str):
        cleaned_epi["updated_at"] = datetime.fromisoformat(cleaned_epi["updated_at"].replace('Z', '+00:00'))
    
    return EPI(**cleaned_epi)

@router.put("/{tenant_slug}/epi/{epi_id}", response_model=EPI)
async def update_epi(
    tenant_slug: str,
    epi_id: str,
    epi_update: EPIUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un EPI (Admin/Superviseur/Employé pour sa taille uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    # Les admins/superviseurs peuvent tout modifier
    # Les employés peuvent modifier uniquement la taille de leurs propres EPIs
    if current_user.role not in ["admin", "superviseur"]:
        if epi.get("user_id") != current_user.id:
            raise HTTPException(status_code=403, detail="Vous ne pouvez modifier que vos propres EPIs")
        
        # Restreindre les modifications aux champs autorisés pour un employé
        allowed_fields = ["taille"]
        update_data_dict = epi_update.dict()
        for key in list(update_data_dict.keys()):
            if key not in allowed_fields and update_data_dict[key] is not None:
                raise HTTPException(status_code=403, detail=f"Vous ne pouvez modifier que la taille de vos EPIs")
    
    # Préparer les champs à mettre à jour
    update_data = {k: v for k, v in epi_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Vérifier si changement d'affectation (user_id)
    ancien_user_id = epi.get("user_id")
    nouveau_user_id = update_data.get("user_id")
    
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Notifier si changement d'affectation
    if nouveau_user_id and nouveau_user_id != ancien_user_id:
        type_epi_nom = epi.get("type_epi", "EPI")
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=nouveau_user_id,
            type="epi_nouvel_assignation",
            titre="Nouvel EPI assigné",
            message=f"Un {type_epi_nom} #{epi.get('numero_serie', '')} vous a été assigné",
            lien="/epi"
        )
    
    updated_epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    cleaned_epi = clean_mongo_doc(updated_epi)
    
    # Convertir les dates
    if isinstance(cleaned_epi.get("created_at"), str):
        cleaned_epi["created_at"] = datetime.fromisoformat(cleaned_epi["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned_epi.get("updated_at"), str):
        cleaned_epi["updated_at"] = datetime.fromisoformat(cleaned_epi["updated_at"].replace('Z', '+00:00'))
    
    return EPI(**cleaned_epi)

@router.delete("/{tenant_slug}/epi/{epi_id}")
async def delete_epi(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Supprime un EPI (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.epis.delete_one({"id": epi_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    # Supprimer aussi toutes les inspections associées
    await db.inspections_epi.delete_many({"epi_id": epi_id, "tenant_id": tenant.id})
    
    return {"message": "EPI supprimé avec succès"}

# ========== INSPECTIONS EPI ==========

@router.post("/{tenant_slug}/epi/{epi_id}/inspection", response_model=InspectionEPI)
async def create_inspection(
    tenant_slug: str,
    epi_id: str,
    inspection: InspectionEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle inspection pour un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    inspection_dict = inspection.dict()
    inspection_dict["tenant_id"] = tenant.id
    inspection_dict["epi_id"] = epi_id
    inspection_obj = InspectionEPI(**inspection_dict)
    
    # Préparer pour MongoDB
    inspection_data = inspection_obj.dict()
    inspection_data["created_at"] = inspection_obj.created_at.isoformat()
    
    await db.inspections_epi.insert_one(inspection_data)
    
    # Mettre à jour le statut de l'EPI si nécessaire
    if inspection.statut_global == "hors_service":
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "Hors service"}}
        )
    elif inspection.statut_global == "necessite_reparation":
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "En réparation"}}
        )
    
    # Notifier le pompier assigné
    if epi.get("user_id"):
        type_epi_nom = epi.get("type_epi", "EPI")
        type_inspection_nom = {
            'apres_utilisation': 'après utilisation',
            'routine_mensuelle': 'de routine mensuelle',
            'avancee_annuelle': 'avancée annuelle'
        }.get(inspection.type_inspection, 'inspection')
        
        statut_msg = {
            'conforme': 'est conforme',
            'non_conforme': 'n\'est pas conforme',
            'necessite_reparation': 'nécessite une réparation',
            'hors_service': 'est hors service'
        }.get(inspection.statut_global, 'a été inspecté')
        
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=epi["user_id"],
            type="epi_inspection",
            titre=f"Inspection {type_inspection_nom}",
            message=f"Votre {type_epi_nom} #{epi.get('numero_serie', '')} {statut_msg}",
            lien="/epi"
        )
    
    return inspection_obj

@router.get("/{tenant_slug}/epi/{epi_id}/inspections", response_model=List[InspectionEPI])
async def get_epi_inspections(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Récupère toutes les inspections d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_inspection", -1).to_list(1000)
    
    cleaned_inspections = [clean_mongo_doc(insp) for insp in inspections]
    
    # Convertir les dates
    for insp in cleaned_inspections:
        if isinstance(insp.get("created_at"), str):
            insp["created_at"] = datetime.fromisoformat(insp["created_at"].replace('Z', '+00:00'))
    
    return [InspectionEPI(**insp) for insp in cleaned_inspections]

# ========== ISP (Fournisseurs) ==========

@router.post("/{tenant_slug}/isp", response_model=ISP)
async def create_isp(tenant_slug: str, isp: ISPCreate, current_user: User = Depends(get_current_user)):
    """Crée un nouveau fournisseur de services indépendant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isp_dict = isp.dict()
    isp_dict["tenant_id"] = tenant.id
    isp_obj = ISP(**isp_dict)
    
    # Préparer pour MongoDB
    isp_data = isp_obj.dict()
    isp_data["created_at"] = isp_obj.created_at.isoformat()
    
    await db.isps.insert_one(isp_data)
    
    return isp_obj

@router.get("/{tenant_slug}/isp", response_model=List[ISP])
async def get_all_isps(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les ISP du tenant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isps = await db.isps.find({"tenant_id": tenant.id}).to_list(100)
    cleaned_isps = [clean_mongo_doc(isp) for isp in isps]
    
    # Convertir les dates
    for isp in cleaned_isps:
        if isinstance(isp.get("created_at"), str):
            isp["created_at"] = datetime.fromisoformat(isp["created_at"].replace('Z', '+00:00'))
    
    return [ISP(**isp) for isp in cleaned_isps]

@router.put("/{tenant_slug}/isp/{isp_id}", response_model=ISP)
async def update_isp(
    tenant_slug: str,
    isp_id: str,
    isp_update: ISPUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un ISP"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isp = await db.isps.find_one({"id": isp_id, "tenant_id": tenant.id})
    if not isp:
        raise HTTPException(status_code=404, detail="ISP non trouvé")
    
    update_data = {k: v for k, v in isp_update.dict().items() if v is not None}
    
    await db.isps.update_one(
        {"id": isp_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_isp = await db.isps.find_one({"id": isp_id, "tenant_id": tenant.id})
    cleaned_isp = clean_mongo_doc(updated_isp)
    
    if isinstance(cleaned_isp.get("created_at"), str):
        cleaned_isp["created_at"] = datetime.fromisoformat(cleaned_isp["created_at"].replace('Z', '+00:00'))
    
    return ISP(**cleaned_isp)

@router.delete("/{tenant_slug}/isp/{isp_id}")
async def delete_isp(tenant_slug: str, isp_id: str, current_user: User = Depends(get_current_user)):
    """Supprime un ISP"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.isps.delete_one({"id": isp_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="ISP non trouvé")
    
    return {"message": "ISP supprimé avec succès"}

# ========== RAPPORTS ==========

@router.get("/{tenant_slug}/epi/rapports/conformite")
async def get_rapport_conformite(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Rapport de conformité générale avec code couleur"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer tous les EPI
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = {
        "total": len(epis),
        "en_service": 0,
        "en_inspection": 0,
        "en_reparation": 0,
        "hors_service": 0,
        "retire": 0,
        "epis": []
    }
    
    for epi in epis:
        statut = epi.get("statut", "En service")
        
        # Compter par statut
        if statut == "En service":
            rapport["en_service"] += 1
        elif statut == "En inspection":
            rapport["en_inspection"] += 1
        elif statut == "En réparation":
            rapport["en_reparation"] += 1
        elif statut == "Hors service":
            rapport["hors_service"] += 1
        elif statut == "Retiré":
            rapport["retire"] += 1
        
        # Récupérer la dernière inspection
        derniere_inspection = await db.inspections_epi.find_one(
            {"epi_id": epi["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        # Déterminer le code couleur
        couleur = "vert"  # Par défaut
        
        if statut in ["Hors service", "Retiré"]:
            couleur = "rouge"
        elif statut == "En réparation":
            couleur = "jaune"
        elif derniere_inspection:
            # Vérifier si l'inspection est récente
            date_inspection = datetime.fromisoformat(derniere_inspection["date_inspection"])
            jours_depuis_inspection = (datetime.now(timezone.utc) - date_inspection).days
            
            if jours_depuis_inspection > 365:  # Inspection avancée en retard
                couleur = "rouge"
            elif jours_depuis_inspection > 330:  # Inspection bientôt en retard (dans 35 jours)
                couleur = "jaune"
        else:
            # Pas d'inspection du tout
            couleur = "rouge"
        
        cleaned_epi = clean_mongo_doc(epi)
        cleaned_epi["code_couleur"] = couleur
        cleaned_epi["derniere_inspection"] = clean_mongo_doc(derniere_inspection) if derniere_inspection else None
        
        rapport["epis"].append(cleaned_epi)
    
    return rapport

@router.get("/{tenant_slug}/epi/rapports/echeances")
async def get_rapport_echeances(tenant_slug: str, jours: int = 30, current_user: User = Depends(get_current_user)):
    """Rapport des échéances d'inspection (dans X jours)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer tous les EPI
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    echeances = []
    aujourd_hui = datetime.now(timezone.utc)
    
    for epi in epis:
        # Récupérer la dernière inspection
        derniere_inspection = await db.inspections_epi.find_one(
            {"epi_id": epi["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        if derniere_inspection:
            date_inspection = datetime.fromisoformat(derniere_inspection["date_inspection"])
            type_inspection = derniere_inspection["type_inspection"]
            
            # Calculer la prochaine échéance selon le type
            if type_inspection == "avancee_annuelle":
                prochaine_echeance = date_inspection + timedelta(days=365)
            elif type_inspection == "routine_mensuelle":
                prochaine_echeance = date_inspection + timedelta(days=30)
            else:  # apres_utilisation
                prochaine_echeance = date_inspection + timedelta(days=30)  # Routine dans 30 jours
            
            # Vérifier si dans la fenêtre de X jours
            jours_restants = (prochaine_echeance - aujourd_hui).days
            
            if 0 <= jours_restants <= jours:
                cleaned_epi = clean_mongo_doc(epi)
                cleaned_epi["prochaine_echeance"] = prochaine_echeance.isoformat()
                cleaned_epi["jours_restants"] = jours_restants
                cleaned_epi["type_inspection_requise"] = "avancee_annuelle" if type_inspection == "avancee_annuelle" else "routine_mensuelle"
                echeances.append(cleaned_epi)
        else:
            # Pas d'inspection = inspection immédiate requise
            cleaned_epi = clean_mongo_doc(epi)
            cleaned_epi["prochaine_echeance"] = aujourd_hui.isoformat()
            cleaned_epi["jours_restants"] = 0
            cleaned_epi["type_inspection_requise"] = "routine_mensuelle"
            echeances.append(cleaned_epi)
    
    # Trier par jours restants
    echeances.sort(key=lambda x: x["jours_restants"])
    
    return {
        "total": len(echeances),
        "echeances": echeances
    }

# Alias pour compatibilité frontend
@router.get("/{tenant_slug}/epi/rapports/echeances-inspection")
async def get_rapport_echeances_inspection_alias(tenant_slug: str, jours: int = 30, current_user: User = Depends(get_current_user)):
    """Alias pour /echeances (compatibilité frontend)"""
    return await get_rapport_echeances(tenant_slug, jours, current_user)


# ========== PHASE 2 : NETTOYAGE EPI ==========

@router.post("/{tenant_slug}/epi/{epi_id}/nettoyage", response_model=NettoyageEPI)
async def create_nettoyage(
    tenant_slug: str,
    epi_id: str,
    nettoyage: NettoyageEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistre un nettoyage EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    nettoyage_dict = nettoyage.dict()
    nettoyage_dict["tenant_id"] = tenant.id
    nettoyage_dict["epi_id"] = epi_id
    nettoyage_obj = NettoyageEPI(**nettoyage_dict)
    
    nettoyage_data = nettoyage_obj.dict()
    nettoyage_data["created_at"] = nettoyage_obj.created_at.isoformat()
    
    await db.nettoyages_epi.insert_one(nettoyage_data)
    
    return nettoyage_obj

@router.get("/{tenant_slug}/epi/{epi_id}/nettoyages", response_model=List[NettoyageEPI])
async def get_nettoyages_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique de nettoyage d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    nettoyages = await db.nettoyages_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_nettoyage", -1).to_list(1000)
    
    cleaned_nettoyages = [clean_mongo_doc(n) for n in nettoyages]
    
    for n in cleaned_nettoyages:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"].replace('Z', '+00:00'))
    
    return [NettoyageEPI(**n) for n in cleaned_nettoyages]

# ========== PHASE 2 : RÉPARATIONS EPI ==========

@router.post("/{tenant_slug}/epi/{epi_id}/reparation", response_model=ReparationEPI)
async def create_reparation(
    tenant_slug: str,
    epi_id: str,
    reparation: ReparationEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une demande de réparation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    reparation_dict = reparation.dict()
    reparation_dict["tenant_id"] = tenant.id
    reparation_dict["epi_id"] = epi_id
    reparation_obj = ReparationEPI(**reparation_dict)
    
    reparation_data = reparation_obj.dict()
    reparation_data["created_at"] = reparation_obj.created_at.isoformat()
    reparation_data["updated_at"] = reparation_obj.updated_at.isoformat()
    
    await db.reparations_epi.insert_one(reparation_data)
    
    # Mettre à jour statut EPI
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": {"statut": "En réparation"}}
    )
    
    return reparation_obj

@router.get("/{tenant_slug}/epi/{epi_id}/reparations", response_model=List[ReparationEPI])
async def get_reparations_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique de réparations d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    reparations = await db.reparations_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_demande", -1).to_list(1000)
    
    cleaned_reparations = [clean_mongo_doc(r) for r in reparations]
    
    for r in cleaned_reparations:
        if isinstance(r.get("created_at"), str):
            r["created_at"] = datetime.fromisoformat(r["created_at"].replace('Z', '+00:00'))
        if isinstance(r.get("updated_at"), str):
            r["updated_at"] = datetime.fromisoformat(r["updated_at"].replace('Z', '+00:00'))
    
    return [ReparationEPI(**r) for r in cleaned_reparations]

@router.put("/{tenant_slug}/epi/{epi_id}/reparation/{reparation_id}", response_model=ReparationEPI)
async def update_reparation(
    tenant_slug: str,
    epi_id: str,
    reparation_id: str,
    reparation_update: ReparationEPIUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une réparation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    reparation = await db.reparations_epi.find_one({
        "id": reparation_id,
        "epi_id": epi_id,
        "tenant_id": tenant.id
    })
    
    if not reparation:
        raise HTTPException(status_code=404, detail="Réparation non trouvée")
    
    update_data = {k: v for k, v in reparation_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.reparations_epi.update_one(
        {"id": reparation_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Si réparation terminée, remettre EPI en service
    if reparation_update.statut == "terminee":
        epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
        
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "En service"}}
        )
        
        # Notifier le pompier assigné que son EPI est de retour
        if epi and epi.get("user_id"):
            type_epi_nom = epi.get("type_epi", "EPI")
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=epi["user_id"],
                type="epi_reparation_terminee",
                titre="EPI de retour de réparation",
                message=f"Votre {type_epi_nom} #{epi.get('numero_serie', '')} est de retour et remis en service",
                lien="/epi"
            )
    
    updated_reparation = await db.reparations_epi.find_one({
        "id": reparation_id,
        "tenant_id": tenant.id
    })
    
    cleaned = clean_mongo_doc(updated_reparation)
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return ReparationEPI(**cleaned)

# ========== PHASE 2 : RETRAIT EPI ==========

@router.post("/{tenant_slug}/epi/{epi_id}/retrait", response_model=RetraitEPI)
async def create_retrait(
    tenant_slug: str,
    epi_id: str,
    retrait: RetraitEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistre le retrait définitif d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    retrait_dict = retrait.dict()
    retrait_dict["tenant_id"] = tenant.id
    retrait_dict["epi_id"] = epi_id
    retrait_obj = RetraitEPI(**retrait_dict)
    
    retrait_data = retrait_obj.dict()
    retrait_data["created_at"] = retrait_obj.created_at.isoformat()
    
    await db.retraits_epi.insert_one(retrait_data)
    
    # Mettre à jour statut EPI
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": {"statut": "Retiré"}}
    )
    
    return retrait_obj

@router.get("/{tenant_slug}/epi/{epi_id}/retrait", response_model=RetraitEPI)
async def get_retrait_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les informations de retrait d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    retrait = await db.retraits_epi.find_one({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    })
    
    if not retrait:
        raise HTTPException(status_code=404, detail="Aucun retrait enregistré pour cet EPI")
    
    cleaned = clean_mongo_doc(retrait)
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    
    return RetraitEPI(**cleaned)

# ========== RAPPORTS PHASE 2 ==========

@router.get("/{tenant_slug}/epi/rapports/retraits-prevus")
async def get_rapport_retraits_prevus(
    tenant_slug: str,
    mois: int = 12,
    current_user: User = Depends(get_current_user)
):
    """Rapport des EPI approchant de leur limite de 10 ans"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    aujourd_hui = datetime.now(timezone.utc)
    limite_jours = mois * 30
    
    retraits_prevus = []
    
    for epi in epis:
        if epi.get("statut") == "Retiré":
            continue
        
        # Gestion sécurisée de la date avec ou sans timezone
        date_service_str = epi.get("date_mise_en_service")
        if not date_service_str:
            continue
        
        try:
            date_mise_service = datetime.fromisoformat(date_service_str.replace('Z', '+00:00'))
            # S'assurer que la date a une timezone
            if date_mise_service.tzinfo is None:
                date_mise_service = date_mise_service.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            continue
        
        age_jours = (aujourd_hui - date_mise_service).days
        age_limite_jours = 365 * 10  # 10 ans
        
        jours_restants = age_limite_jours - age_jours
        
        if 0 <= jours_restants <= limite_jours:
            cleaned_epi = clean_mongo_doc(epi)
            cleaned_epi["age_annees"] = round(age_jours / 365, 1)
            cleaned_epi["jours_avant_limite"] = jours_restants
            cleaned_epi["date_limite_prevue"] = (date_mise_service + timedelta(days=age_limite_jours)).isoformat()
            retraits_prevus.append(cleaned_epi)
    
    retraits_prevus.sort(key=lambda x: x["jours_avant_limite"])
    
    return {
        "total": len(retraits_prevus),
        "periode_mois": mois,
        "epis": retraits_prevus
    }

@router.get("/{tenant_slug}/epi/rapports/cout-total")
async def get_rapport_cout_total(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Rapport du coût total de possession (TCO) par EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = []
    
    for epi in epis:
        # Coût d'achat
        cout_achat = epi.get("cout_achat", 0)
        
        # Coûts de nettoyage (utiliser le coût réel si disponible, sinon estimation)
        nettoyages = await db.nettoyages_epi.find({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        # Additionner les coûts réels, ou estimer 50$ pour les nettoyages avancés sans coût
        cout_nettoyages = sum([
            n.get("cout_nettoyage", 0) if n.get("cout_nettoyage", 0) > 0 
            else (50 if n.get("type_nettoyage") == "avance" else 0)
            for n in nettoyages
        ])
        
        # Coûts de réparation
        reparations = await db.reparations_epi.find({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        cout_reparations = sum([r.get("cout_reparation", 0) for r in reparations])
        
        # Coût de retrait
        retrait = await db.retraits_epi.find_one({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        })
        cout_retrait = retrait.get("cout_disposition", 0) if retrait else 0
        
        cout_total = cout_achat + cout_nettoyages + cout_reparations + cout_retrait
        
        cleaned_epi = clean_mongo_doc(epi)
        cleaned_epi["cout_achat"] = cout_achat
        cleaned_epi["cout_nettoyages"] = cout_nettoyages
        cleaned_epi["nombre_nettoyages"] = len(nettoyages)
        cleaned_epi["cout_reparations"] = cout_reparations
        cleaned_epi["nombre_reparations"] = len(reparations)
        cleaned_epi["cout_retrait"] = cout_retrait
        cleaned_epi["cout_total"] = cout_total
        
        rapport.append(cleaned_epi)
    
    # Trier par coût total décroissant
    rapport.sort(key=lambda x: x["cout_total"], reverse=True)
    
    return {
        "total_epis": len(rapport),
        "cout_total_flotte": sum([e["cout_total"] for e in rapport]),
        "cout_moyen_par_epi": sum([e["cout_total"] for e in rapport]) / len(rapport) if len(rapport) > 0 else 0,
        "epis": rapport
    }

# Alias pour compatibilité frontend
@router.get("/{tenant_slug}/epi/rapports/tco")
async def get_rapport_tco_alias(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Alias pour /cout-total (compatibilité frontend)"""
    return await get_rapport_cout_total(tenant_slug, current_user)


# ==================== MES EPI (Module Employé) ====================

@router.get("/{tenant_slug}/mes-epi/masque-apria")
async def get_masque_apria_assigne(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère le masque APRIA assigné à l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Chercher la catégorie APRIA ou Masques APRIA
    categorie_masques = await db.categories_equipements.find_one(
        {"tenant_id": tenant.id, "nom": {"$regex": "(masque|facial|APRIA)", "$options": "i"}},
        {"_id": 0}
    )
    
    # Construire la requête pour trouver le masque assigné à cet utilisateur
    query = {
        "tenant_id": tenant.id,
        "employe_id": current_user.id,
        "$or": [
            {"nom": {"$regex": "(masque|facial|partie faciale)", "$options": "i"}},
            {"description": {"$regex": "(masque|facial|partie faciale)", "$options": "i"}},
            {"categorie_nom": {"$regex": "(masque|facial|APRIA)", "$options": "i"}}
        ]
    }
    
    # Si une catégorie est trouvée, ajouter cette condition
    if categorie_masques:
        query["$or"].append({"categorie_id": categorie_masques.get("id")})
    
    # Chercher dans la collection équipements
    masque = await db.equipements.find_one(query, {"_id": 0})
    
    if not masque:
        raise HTTPException(status_code=404, detail="Aucun masque APRIA assigné")
    
    # Récupérer la dernière inspection APRIA pour ce masque
    derniere_inspection = await db.inspections_apria.find_one(
        {"equipement_id": masque["id"], "tenant_id": tenant.id},
        sort=[("date_inspection", -1)],
        projection={"_id": 0}
    )
    
    result = clean_mongo_doc(masque)
    result["derniere_inspection_apria"] = clean_mongo_doc(derniere_inspection) if derniere_inspection else None
    
    return result


@router.get("/{tenant_slug}/mes-epi")
async def get_mes_epi(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les EPI de l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer tous les EPI assignés à cet utilisateur
    mes_epis = await db.epis.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id
    }).to_list(1000)
    
    # Nettoyer les documents MongoDB et récupérer la dernière inspection
    cleaned_epis = []
    for epi in mes_epis:
        cleaned_epi = clean_mongo_doc(epi)
        
        # Récupérer la dernière inspection après usage
        derniereInspection = await db.inspections_apres_usage.find_one(
            {"epi_id": epi["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        if derniereInspection:
            cleaned_epi["derniere_inspection"] = clean_mongo_doc(derniereInspection)
        else:
            cleaned_epi["derniere_inspection"] = None
            
        cleaned_epis.append(cleaned_epi)
    
    return cleaned_epis

@router.post("/{tenant_slug}/mes-epi/{epi_id}/inspection")
async def creer_inspection_apres_usage(
    tenant_slug: str,
    epi_id: str,
    inspection: InspectionApresUsageCreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistre une inspection après usage par l'employé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'EPI appartient à l'utilisateur
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id, "user_id": current_user.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé ou non assigné à vous")
    
    # Créer l'inspection
    inspection_obj = InspectionApresUsage(
        tenant_id=tenant.id,
        epi_id=epi_id,
        user_id=current_user.id,
        statut=inspection.statut,
        defauts_constates=inspection.defauts_constates or "",
        notes=inspection.notes or "",
        photo_url=inspection.photo_url or "",
        criteres_inspection=inspection.criteres_inspection or {}
    )
    
    await db.inspections_apres_usage.insert_one(inspection_obj.dict())
    
    # Si défaut signalé, envoyer notification aux admins/superviseurs
    if inspection.statut == "defaut":
        # Récupérer tous les admins/superviseurs
        admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["admin", "superviseur"]}
        }).to_list(1000)
        
        for admin in admins:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=admin["id"],
                type="epi_defaut",
                titre="⚠️ Défaut EPI signalé",
                message=f"{current_user.prenom} {current_user.nom} a signalé un défaut sur {epi['type_epi']} - {epi.get('marque', '')} {epi.get('modele', '')}",
                lien=f"/gestion-epi",
                data={"epi_id": epi_id, "user_id": current_user.id}
            )
    
    return {"message": "Inspection enregistrée avec succès", "defaut_signale": inspection.statut == "defaut"}

@router.get("/{tenant_slug}/mes-epi/{epi_id}/historique")
async def get_historique_inspections(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique des inspections après usage d'un EPI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'EPI appartient à l'utilisateur (ou que c'est un admin/superviseur)
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    if epi.get("user_id") != current_user.id and current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Récupérer toutes les inspections
    inspections = await db.inspections_apres_usage.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_inspection", -1).to_list(1000)
    
    # Nettoyer les documents MongoDB et ajouter les infos utilisateur
    cleaned_inspections = []
    for inspection in inspections:
        cleaned_inspection = clean_mongo_doc(inspection)
        
        # Ajouter les infos utilisateur
        user = await db.users.find_one({"id": inspection["user_id"], "tenant_id": tenant.id})
        if user:
            cleaned_inspection["user_nom"] = f"{user.get('prenom', '')} {user.get('nom', '')}"
        
        cleaned_inspections.append(cleaned_inspection)
    
    return cleaned_inspections

@router.get("/{tenant_slug}/mes-epi/{epi_id}/demande-en-attente")
async def verifier_demande_remplacement_en_attente(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Vérifier s'il existe une demande de remplacement en attente pour cet EPI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier s'il y a une demande en attente
    demande_existante = await db.demandes_remplacement_epi.find_one({
        "epi_id": epi_id,
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "statut": "En attente"
    })
    
    if demande_existante:
        return {
            "existe": True,
            "demande": {
                "id": demande_existante["id"],
                "date_demande": demande_existante["date_demande"],
                "raison": demande_existante["raison"],
                "notes_employe": demande_existante.get("notes_employe", "")
            }
        }
    
    return {"existe": False}

@router.post("/{tenant_slug}/mes-epi/{epi_id}/demander-remplacement")
async def demander_remplacement_epi(
    tenant_slug: str,
    epi_id: str,
    demande: DemandeRemplacementEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une demande de remplacement d'EPI"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'EPI appartient à l'utilisateur
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id, "user_id": current_user.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé ou non assigné à vous")
    
    # Vérifier s'il n'y a pas déjà une demande en attente pour cet EPI
    demande_existante = await db.demandes_remplacement_epi.find_one({
        "epi_id": epi_id,
        "tenant_id": tenant.id,
        "statut": "En attente"
    })
    
    if demande_existante:
        raise HTTPException(status_code=400, detail="Une demande de remplacement est déjà en attente pour cet EPI")
    
    # Créer la demande
    demande_obj = DemandeRemplacementEPI(
        tenant_id=tenant.id,
        epi_id=epi_id,
        user_id=current_user.id,
        raison=demande.raison,
        notes_employe=demande.notes_employe
    )
    
    await db.demandes_remplacement_epi.insert_one(demande_obj.dict())
    
    # Envoyer notification aux admins/superviseurs
    admins = await db.users.find({
        "tenant_id": tenant.id,
        "role": {"$in": ["admin", "superviseur"]}
    }).to_list(1000)
    
    for admin in admins:
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=admin["id"],
            type="demande_remplacement_epi",
            titre="🔄 Demande de remplacement EPI",
            message=f"{current_user.prenom} {current_user.nom} demande le remplacement de {epi['type_epi']} - Raison: {demande.raison}",
            lien=f"/gestion-epi",
            data={"epi_id": epi_id, "demande_id": demande_obj.id, "raison": demande.raison}
        )
    
    return {"message": "Demande de remplacement créée avec succès", "demande_id": demande_obj.id}



