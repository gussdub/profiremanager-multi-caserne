"""
Routes API pour le module Équipements
=====================================

STATUT: ACTIF
Ce module gère les équipements de la caserne (boyaux, radios, ARI, etc.)

Routes Catégories:
- GET    /{tenant_slug}/equipements/categories                 - Liste catégories
- POST   /{tenant_slug}/equipements/categories                 - Créer catégorie
- PUT    /{tenant_slug}/equipements/categories/{id}            - Modifier catégorie
- DELETE /{tenant_slug}/equipements/categories/{id}            - Supprimer catégorie
- POST   /{tenant_slug}/equipements/categories/initialiser     - Initialiser catégories NFPA

Routes Équipements:
- GET    /{tenant_slug}/equipements                            - Liste équipements
- GET    /{tenant_slug}/equipements/{id}                       - Détail équipement
- POST   /{tenant_slug}/equipements                            - Créer équipement
- PUT    /{tenant_slug}/equipements/{id}                       - Modifier équipement
- DELETE /{tenant_slug}/equipements/{id}                       - Supprimer équipement

Routes Maintenance:
- GET    /{tenant_slug}/equipements/{id}/maintenances          - Historique maintenance
- POST   /{tenant_slug}/equipements/{id}/maintenances          - Ajouter maintenance

Routes Paramètres:
- GET    /{tenant_slug}/equipements/parametres                 - Paramètres alertes
- PUT    /{tenant_slug}/equipements/parametres                 - Modifier paramètres

Routes Alertes:
- GET    /{tenant_slug}/equipements/alertes                    - Liste alertes
- POST   /{tenant_slug}/equipements/alertes/recalculer         - Recalculer alertes

Routes Stats:
- GET    /{tenant_slug}/equipements/stats/resume               - Statistiques
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Équipements"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class CategorieEquipement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    norme_reference: str = ""
    frequence_inspection: str = ""
    couleur: str = "#6366F1"
    icone: str = "📦"
    est_predefinit: bool = False
    permet_assignation_employe: bool = False
    champs_supplementaires: List[dict] = []
    personnes_ressources: List[dict] = []
    personne_ressource_id: str = ""
    personne_ressource_email: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategorieEquipementCreate(BaseModel):
    nom: str
    description: str = ""
    norme_reference: str = ""
    frequence_inspection: str = ""
    couleur: str = "#6366F1"
    icone: str = "📦"
    permet_assignation_employe: bool = False
    champs_supplementaires: List[dict] = []
    personnes_ressources: List[dict] = []
    personne_ressource_id: str = ""
    personne_ressource_email: str = ""


class CategorieEquipementUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    norme_reference: Optional[str] = None
    frequence_inspection: Optional[str] = None
    couleur: Optional[str] = None
    icone: Optional[str] = None
    permet_assignation_employe: Optional[bool] = None
    champs_supplementaires: Optional[List[dict]] = None
    personnes_ressources: Optional[List[dict]] = None
    personne_ressource_id: Optional[str] = None
    personne_ressource_email: Optional[str] = None


class HistoriqueMaintenanceCreate(BaseModel):
    equipement_id: str = ""
    type_intervention: str
    date_intervention: str
    description: str
    cout: float = 0.0
    effectue_par: str = ""
    effectue_par_id: str = ""
    pieces_remplacees: List[str] = []
    resultats: str = ""
    prochaine_intervention: str = ""
    documents: List[str] = []
    notes: str = ""


class Equipement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    code_unique: str
    categorie_id: str = ""
    categorie_nom: str = ""
    description: str = ""
    etat: str = "bon"
    quantite: int = 1
    quantite_minimum: int = 1
    gerer_quantite: bool = False
    fournisseur_id: str = ""
    fournisseur_nom: str = ""
    date_achat: str = ""
    prix_achat: float = 0.0
    garantie_fin: str = ""
    emplacement_type: str = ""
    emplacement_id: str = ""
    emplacement_nom: str = ""
    vehicule_id: str = ""
    vehicule_nom: str = ""
    employe_id: str = ""
    employe_nom: str = ""
    norme_reference: str = ""
    frequence_maintenance: str = ""
    date_derniere_maintenance: str = ""
    date_prochaine_maintenance: str = ""
    date_fin_vie: str = ""
    alerte_maintenance: bool = False
    alerte_stock_bas: bool = False
    alerte_reparation: bool = False
    alerte_fin_vie: bool = False
    alerte_expiration: bool = False
    photos: List[str] = []
    documents: List[str] = []
    champs_personnalises: Dict[str, Any] = {}
    modele_inspection_id: str = ""
    notes: str = ""
    tags: List[str] = []
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EquipementCreate(BaseModel):
    nom: str
    code_unique: str
    categorie_id: str = ""
    categorie_nom: str = ""
    description: str = ""
    etat: str = "bon"
    quantite: int = 1
    quantite_minimum: int = 1
    gerer_quantite: bool = False
    fournisseur_id: str = ""
    fournisseur_nom: str = ""
    date_achat: str = ""
    prix_achat: float = 0.0
    garantie_fin: str = ""
    emplacement_type: str = ""
    emplacement_id: str = ""
    emplacement_nom: str = ""
    vehicule_id: str = ""
    vehicule_nom: str = ""
    employe_id: str = ""
    employe_nom: str = ""
    norme_reference: str = ""
    frequence_maintenance: str = ""
    date_derniere_maintenance: str = ""
    date_prochaine_maintenance: str = ""
    date_fin_vie: str = ""
    photos: List[str] = []
    documents: List[str] = []
    champs_personnalises: Dict[str, Any] = {}
    modele_inspection_id: str = ""
    notes: str = ""
    tags: List[str] = []


class EquipementUpdate(BaseModel):
    nom: Optional[str] = None
    code_unique: Optional[str] = None
    categorie_id: Optional[str] = None
    categorie_nom: Optional[str] = None
    description: Optional[str] = None
    etat: Optional[str] = None
    quantite: Optional[int] = None
    quantite_minimum: Optional[int] = None
    gerer_quantite: Optional[bool] = None
    fournisseur_id: Optional[str] = None
    fournisseur_nom: Optional[str] = None
    date_achat: Optional[str] = None
    prix_achat: Optional[float] = None
    garantie_fin: Optional[str] = None
    emplacement_type: Optional[str] = None
    emplacement_id: Optional[str] = None
    emplacement_nom: Optional[str] = None
    vehicule_id: Optional[str] = None
    vehicule_nom: Optional[str] = None
    employe_id: Optional[str] = None
    employe_nom: Optional[str] = None
    norme_reference: Optional[str] = None
    frequence_maintenance: Optional[str] = None
    date_derniere_maintenance: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    date_fin_vie: Optional[str] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[str]] = None
    champs_personnalises: Optional[Dict[str, Any]] = None
    modele_inspection_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


# ==================== ROUTES CATÉGORIES ====================

@router.get("/{tenant_slug}/equipements/categories")
async def get_categories_equipement(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les catégories d'équipements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    categories = await db.categories_equipement.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("nom", 1).to_list(1000)
    
    return categories


@router.post("/{tenant_slug}/equipements/categories")
async def create_categorie_equipement(
    tenant_slug: str,
    categorie: CategorieEquipementCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle catégorie d'équipement (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    existing = await db.categories_equipement.find_one({
        "tenant_id": tenant.id,
        "nom": categorie.nom
    })
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Une catégorie '{categorie.nom}' existe déjà")
    
    categorie_obj = CategorieEquipement(
        tenant_id=tenant.id,
        **categorie.dict()
    )
    
    await db.categories_equipement.insert_one(categorie_obj.dict())
    
    return {"message": "Catégorie créée avec succès", "id": categorie_obj.id, "categorie": categorie_obj.dict()}


@router.put("/{tenant_slug}/equipements/categories/{categorie_id}")
async def update_categorie_equipement(
    tenant_slug: str,
    categorie_id: str,
    categorie: CategorieEquipementUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier une catégorie d'équipement (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    existing = await db.categories_equipement.find_one({
        "id": categorie_id,
        "tenant_id": tenant.id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    update_data = {k: v for k, v in categorie.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.categories_equipement.update_one(
        {"id": categorie_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if categorie.nom:
        await db.equipements.update_many(
            {"categorie_id": categorie_id, "tenant_id": tenant.id},
            {"$set": {"categorie_nom": categorie.nom}}
        )
    
    updated = await db.categories_equipement.find_one(
        {"id": categorie_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return {"message": "Catégorie modifiée avec succès", "categorie": updated}


@router.delete("/{tenant_slug}/equipements/categories/{categorie_id}")
async def delete_categorie_equipement(
    tenant_slug: str,
    categorie_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une catégorie d'équipement (admin uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    existing = await db.categories_equipement.find_one({
        "id": categorie_id,
        "tenant_id": tenant.id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    if existing.get("est_predefinit"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer une catégorie prédéfinie")
    
    equipements_count = await db.equipements.count_documents({
        "categorie_id": categorie_id,
        "tenant_id": tenant.id
    })
    
    if equipements_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer: {equipements_count} équipement(s) utilisent cette catégorie"
        )
    
    await db.categories_equipement.delete_one({"id": categorie_id, "tenant_id": tenant.id})
    
    return {"message": "Catégorie supprimée avec succès"}


# ==================== ROUTES ÉQUIPEMENTS ====================

@router.get("/{tenant_slug}/equipements")
async def get_equipements(
    tenant_slug: str,
    categorie_id: Optional[str] = None,
    etat: Optional[str] = None,
    vehicule_id: Optional[str] = None,
    employe_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste des équipements avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    
    if categorie_id:
        query["categorie_id"] = categorie_id
    if etat:
        query["etat"] = etat
    if vehicule_id:
        query["vehicule_id"] = vehicule_id
    if employe_id:
        query["employe_id"] = employe_id
    
    equipements = await db.equipements.find(query, {"_id": 0}).sort("nom", 1).to_list(10000)
    
    return equipements


@router.get("/{tenant_slug}/equipements/{equipement_id}")
async def get_equipement(
    tenant_slug: str,
    equipement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Détail d'un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    equipement = await db.equipements.find_one(
        {"id": equipement_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not equipement:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    
    return equipement


@router.post("/{tenant_slug}/equipements")
async def create_equipement(
    tenant_slug: str,
    equipement: EquipementCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    if equipement.code_unique:
        existing = await db.equipements.find_one({
            "code_unique": equipement.code_unique,
            "tenant_id": tenant.id
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Un équipement avec le code '{equipement.code_unique}' existe déjà")
    
    equipement_obj = Equipement(
        tenant_id=tenant.id,
        created_by=current_user.id,
        **equipement.dict()
    )
    
    await db.equipements.insert_one(equipement_obj.dict())
    
    return {"message": "Équipement créé avec succès", "id": equipement_obj.id, "equipement": clean_mongo_doc(equipement_obj.dict())}


@router.put("/{tenant_slug}/equipements/{equipement_id}")
async def update_equipement(
    tenant_slug: str,
    equipement_id: str,
    equipement: EquipementUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    existing = await db.equipements.find_one({
        "id": equipement_id,
        "tenant_id": tenant.id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    
    update_data = {k: v for k, v in equipement.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.equipements.update_one(
        {"id": equipement_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.equipements.find_one(
        {"id": equipement_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    return {"message": "Équipement modifié avec succès", "equipement": updated}


@router.delete("/{tenant_slug}/equipements/{equipement_id}")
async def delete_equipement(
    tenant_slug: str,
    equipement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    existing = await db.equipements.find_one({
        "id": equipement_id,
        "tenant_id": tenant.id
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    
    await db.equipements.delete_one({"id": equipement_id, "tenant_id": tenant.id})
    await db.historique_maintenance.delete_many({"equipement_id": equipement_id})
    
    return {"message": "Équipement supprimé avec succès"}


# ==================== ROUTES MAINTENANCE ====================

@router.get("/{tenant_slug}/equipements/{equipement_id}/maintenances")
async def get_historique_maintenance(
    tenant_slug: str,
    equipement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Historique de maintenance d'un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    equipement = await db.equipements.find_one({
        "id": equipement_id,
        "tenant_id": tenant.id
    })
    
    if not equipement:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    
    historique = await db.historique_maintenance.find(
        {"equipement_id": equipement_id},
        {"_id": 0}
    ).sort("date_intervention", -1).to_list(1000)
    
    return historique


@router.post("/{tenant_slug}/equipements/{equipement_id}/maintenances")
async def add_maintenance(
    tenant_slug: str,
    equipement_id: str,
    maintenance: HistoriqueMaintenanceCreate,
    current_user: User = Depends(get_current_user)
):
    """Ajouter une entrée de maintenance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    equipement = await db.equipements.find_one({
        "id": equipement_id,
        "tenant_id": tenant.id
    })
    
    if not equipement:
        raise HTTPException(status_code=404, detail="Équipement non trouvé")
    
    maintenance_obj = {
        "id": str(uuid.uuid4()),
        "equipement_id": equipement_id,
        "type_intervention": maintenance.type_intervention,
        "date_intervention": maintenance.date_intervention,
        "description": maintenance.description,
        "cout": maintenance.cout,
        "effectue_par": maintenance.effectue_par or f"{current_user.prenom} {current_user.nom}",
        "effectue_par_id": maintenance.effectue_par_id or current_user.id,
        "pieces_remplacees": maintenance.pieces_remplacees,
        "resultats": maintenance.resultats,
        "prochaine_intervention": maintenance.prochaine_intervention,
        "documents": maintenance.documents,
        "notes": maintenance.notes,
        "created_at": datetime.now(timezone.utc)
    }
    
    await db.historique_maintenance.insert_one(maintenance_obj)
    
    update_equip = {
        "date_derniere_maintenance": maintenance.date_intervention,
        "updated_at": datetime.now(timezone.utc)
    }
    if maintenance.prochaine_intervention:
        update_equip["date_prochaine_maintenance"] = maintenance.prochaine_intervention
    
    await db.equipements.update_one(
        {"id": equipement_id},
        {"$set": update_equip}
    )
    
    return {"message": "Maintenance enregistrée avec succès", "id": maintenance_obj["id"]}


# ==================== ROUTES PARAMÈTRES ====================

@router.get("/{tenant_slug}/equipements/parametres")
async def get_parametres_equipements(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres du module équipements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    parametres = tenant.parametres.get('equipements', {
        'delai_alerte_maintenance_jours': 30,
        'delai_alerte_fin_vie_jours': 90,
        'activer_alertes_email': True
    }) if tenant.parametres else {
        'delai_alerte_maintenance_jours': 30,
        'delai_alerte_fin_vie_jours': 90,
        'activer_alertes_email': True
    }
    
    return parametres


@router.put("/{tenant_slug}/equipements/parametres")
async def update_parametres_equipements(
    tenant_slug: str,
    parametres: dict,
    current_user: User = Depends(get_current_user)
):
    """Modifier les paramètres du module équipements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Permission refusée - Admin requis")
    
    tenant_doc = await db.tenants.find_one({"id": tenant.id})
    current_params = tenant_doc.get('parametres', {})
    current_params['equipements'] = parametres
    
    await db.tenants.update_one(
        {"id": tenant.id},
        {"$set": {"parametres": current_params}}
    )
    
    return {"message": "Paramètres mis à jour", "parametres": parametres}


# ==================== ROUTES ALERTES ====================

@router.get("/{tenant_slug}/equipements/alertes")
async def get_alertes_equipements(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste des alertes équipements actives"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    alertes = []
    
    equipements = await db.equipements.find({
        "tenant_id": tenant.id,
        "$or": [
            {"alerte_maintenance": True},
            {"alerte_stock_bas": True},
            {"alerte_reparation": True},
            {"alerte_fin_vie": True},
            {"alerte_expiration": True}
        ]
    }, {"_id": 0}).to_list(10000)
    
    for eq in equipements:
        if eq.get("alerte_maintenance"):
            alertes.append({
                "type": "maintenance",
                "equipement_id": eq["id"],
                "equipement_nom": eq["nom"],
                "message": f"Maintenance requise pour {eq['nom']}",
                "date_prochaine": eq.get("date_prochaine_maintenance", ""),
                "priorite": "haute"
            })
        if eq.get("alerte_stock_bas"):
            alertes.append({
                "type": "stock_bas",
                "equipement_id": eq["id"],
                "equipement_nom": eq["nom"],
                "message": f"Stock bas pour {eq['nom']} ({eq.get('quantite', 0)}/{eq.get('quantite_minimum', 1)})",
                "priorite": "moyenne"
            })
        if eq.get("alerte_reparation"):
            alertes.append({
                "type": "reparation",
                "equipement_id": eq["id"],
                "equipement_nom": eq["nom"],
                "message": f"{eq['nom']} nécessite une réparation",
                "priorite": "haute"
            })
        if eq.get("alerte_fin_vie"):
            alertes.append({
                "type": "fin_vie",
                "equipement_id": eq["id"],
                "equipement_nom": eq["nom"],
                "message": f"{eq['nom']} approche de sa fin de vie ({eq.get('date_fin_vie', '')})",
                "priorite": "moyenne"
            })
    
    return alertes


@router.post("/{tenant_slug}/equipements/alertes/recalculer")
async def recalculer_alertes(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Recalculer toutes les alertes équipements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    from datetime import timedelta
    
    params = tenant.parametres.get('equipements', {}) if tenant.parametres else {}
    delai_maintenance = params.get('delai_alerte_maintenance_jours', 30)
    delai_fin_vie = params.get('delai_alerte_fin_vie_jours', 90)
    
    aujourdhui = datetime.now(timezone.utc).date()
    date_limite_maintenance = (aujourdhui + timedelta(days=delai_maintenance)).isoformat()
    date_limite_fin_vie = (aujourdhui + timedelta(days=delai_fin_vie)).isoformat()
    
    equipements = await db.equipements.find({"tenant_id": tenant.id}).to_list(10000)
    
    alertes_generees = 0
    
    for eq in equipements:
        updates = {}
        
        if eq.get("date_prochaine_maintenance") and eq["date_prochaine_maintenance"] <= date_limite_maintenance:
            updates["alerte_maintenance"] = True
            alertes_generees += 1
        else:
            updates["alerte_maintenance"] = False
        
        if eq.get("quantite", 1) < eq.get("quantite_minimum", 1):
            updates["alerte_stock_bas"] = True
            alertes_generees += 1
        else:
            updates["alerte_stock_bas"] = False
        
        if eq.get("etat") in ["a_reparer", "en_reparation"]:
            updates["alerte_reparation"] = True
            alertes_generees += 1
        else:
            updates["alerte_reparation"] = False
        
        if eq.get("date_fin_vie") and eq["date_fin_vie"] <= date_limite_fin_vie:
            updates["alerte_fin_vie"] = True
            alertes_generees += 1
        else:
            updates["alerte_fin_vie"] = False
        
        if updates:
            await db.equipements.update_one(
                {"id": eq["id"]},
                {"$set": updates}
            )
    
    return {"message": f"Alertes recalculées: {alertes_generees} alertes actives"}


# ==================== ROUTES STATS ====================

@router.get("/{tenant_slug}/equipements/stats/resume")
async def get_stats_equipements(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Statistiques résumé des équipements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    total = await db.equipements.count_documents({"tenant_id": tenant.id})
    
    par_etat = {}
    for etat in ["neuf", "bon", "a_reparer", "en_reparation", "hors_service"]:
        count = await db.equipements.count_documents({"tenant_id": tenant.id, "etat": etat})
        par_etat[etat] = count
    
    alertes_maintenance = await db.equipements.count_documents({
        "tenant_id": tenant.id,
        "alerte_maintenance": True
    })
    
    alertes_stock = await db.equipements.count_documents({
        "tenant_id": tenant.id,
        "alerte_stock_bas": True
    })
    
    categories = await db.categories_equipement.find(
        {"tenant_id": tenant.id},
        {"_id": 0, "id": 1, "nom": 1}
    ).to_list(100)
    
    par_categorie = {}
    for cat in categories:
        count = await db.equipements.count_documents({
            "tenant_id": tenant.id,
            "categorie_id": cat["id"]
        })
        par_categorie[cat["nom"]] = count
    
    return {
        "total": total,
        "par_etat": par_etat,
        "par_categorie": par_categorie,
        "alertes": {
            "maintenance": alertes_maintenance,
            "stock_bas": alertes_stock
        }
    }
