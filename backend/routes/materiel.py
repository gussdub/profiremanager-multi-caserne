"""
Routes API pour le module Matériel & Stock
==========================================

STATUT: ACTIF
Ce module gère le matériel, les catégories, les mouvements de stock,
les maintenances et les inspections.

Routes Catégories:
- GET    /{tenant_slug}/materiel/categories                    - Liste des catégories
- POST   /{tenant_slug}/materiel/categories                    - Créer une catégorie
- PUT    /{tenant_slug}/materiel/categories/{id}               - Modifier une catégorie
- DELETE /{tenant_slug}/materiel/categories/{id}               - Supprimer une catégorie

Routes Matériel:
- GET    /{tenant_slug}/materiel                               - Liste du matériel (avec filtres)
- GET    /{tenant_slug}/materiel/{id}                          - Détail d'un item
- POST   /{tenant_slug}/materiel                               - Créer un item
- PUT    /{tenant_slug}/materiel/{id}                          - Modifier un item
- DELETE /{tenant_slug}/materiel/{id}                          - Supprimer un item

Routes Stock:
- POST   /{tenant_slug}/materiel/{id}/mouvement                - Créer un mouvement de stock
- GET    /{tenant_slug}/materiel/{id}/mouvements               - Historique des mouvements

Routes Maintenance:
- GET    /{tenant_slug}/materiel/maintenances                  - Liste des maintenances
- POST   /{tenant_slug}/materiel/{id}/maintenance              - Planifier une maintenance
- PUT    /{tenant_slug}/materiel/maintenances/{id}             - Modifier une maintenance

Routes Inspection:
- POST   /{tenant_slug}/materiel/{id}/inspection               - Enregistrer une inspection
- GET    /{tenant_slug}/materiel/{id}/inspections              - Historique des inspections

Routes Statistiques:
- GET    /{tenant_slug}/materiel/statistiques                  - Statistiques globales
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    require_permission,
    user_has_module_action
)

# Import pour les notifications push (optionnel, peut échouer si module incomplet)
try:
    from routes.notifications import send_push_notification_to_users, send_web_push_to_users
except ImportError:
    send_push_notification_to_users = None
    send_web_push_to_users = None

router = APIRouter(tags=["Matériel & Stock"])
logger = logging.getLogger(__name__)


# ==================== FONCTION NOTIFICATION HORS SERVICE MATÉRIEL ====================

async def notifier_materiel_hors_service(
    tenant_id: str,
    nom_materiel: str,
    statut: str,
    raison: str = None,
    modifie_par: str = None
):
    """
    Notifie tous les utilisateurs qu'un matériel est hors service.
    Envoie notification push, web push et email à tout le monde.
    """
    try:
        # Récupérer tous les utilisateurs actifs du tenant
        all_users = await db.users.find({
            "tenant_id": tenant_id,
            "statut": "Actif"
        }).to_list(500)
        
        if not all_users:
            return
        
        # Préparer le message
        statut_label = "HORS SERVICE" if "hors" in statut.lower() else "EN MAINTENANCE"
        
        titre = f"🛠️ Matériel {statut_label}"
        message = f"{nom_materiel} est maintenant {statut_label.lower()}."
        if raison:
            message += f" Raison: {raison}"
        if modifie_par:
            message += f" (Signalé par {modifie_par})"
        
        user_ids = [u.get("id") for u in all_users if u.get("id")]
        
        # 1. Créer les notifications internes pour chaque utilisateur
        for user_id in user_ids:
            await creer_notification(
                tenant_id=tenant_id,
                user_id=user_id,
                type_notification="materiel_hors_service",
                titre=titre,
                message=message,
                lien="/materiel",
                data={
                    "type_actif": "materiel",
                    "nom_actif": nom_materiel,
                    "statut": statut
                },
                envoyer_email=True
            )
        
        # 2. Envoyer notifications push FCM (si disponible)
        if send_push_notification_to_users:
            try:
                await send_push_notification_to_users(
                    user_ids=user_ids,
                    title=titre,
                    body=message,
                    data={"type": "materiel_hors_service", "sound": "urgent"}
                )
            except Exception as e:
                logger.warning(f"Erreur push FCM: {e}")
        
        # 3. Envoyer notifications Web Push (si disponible)
        if send_web_push_to_users:
            try:
                await send_web_push_to_users(
                    tenant_id=tenant_id,
                    user_ids=user_ids,
                    title=titre,
                    body=message,
                    data={"type": "materiel_hors_service"}
                )
            except Exception as e:
                logger.warning(f"Erreur Web Push: {e}")
        
        logger.info(f"🚨 Notification hors service envoyée: {nom_materiel} ({statut}) à {len(user_ids)} utilisateurs")
        
    except Exception as e:
        logger.error(f"Erreur notification hors service matériel: {e}")


# ==================== MODÈLES ====================

class CategorieMateriel(BaseModel):
    """Catégorie de matériel personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    icone: str = "📦"
    couleur: str = "#3b82f6"
    ordre: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategorieMaterielCreate(BaseModel):
    nom: str
    description: str = ""
    icone: str = "📦"
    couleur: str = "#3b82f6"
    ordre: int = 0


class CategorieMaterielUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    icone: Optional[str] = None
    couleur: Optional[str] = None
    ordre: Optional[int] = None


class Materiel(BaseModel):
    """Item de matériel avec gestion complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    numero_identification: str
    nom: str
    categorie_id: str
    quantite_stock: int = 0
    quantite_minimum: int = 0
    unite_mesure: str = "unité"
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    etat: str = "bon"
    localisation_type: str = "stock"
    localisation_id: Optional[str] = None
    localisation_details: str = ""
    fournisseur: str = ""
    numero_modele: str = ""
    cout_unitaire: float = 0.0
    cout_total: float = 0.0
    photos: List[str] = []
    documents: List[str] = []
    frequence_maintenance: Optional[str] = None
    frequence_maintenance_jours: Optional[int] = None
    derniere_maintenance: Optional[str] = None
    notes: str = ""
    code_barre: Optional[str] = None
    qr_code: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaterielCreate(BaseModel):
    numero_identification: str
    nom: str
    categorie_id: str
    quantite_stock: int = 0
    quantite_minimum: int = 0
    unite_mesure: str = "unité"
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    etat: str = "bon"
    localisation_type: str = "stock"
    localisation_id: Optional[str] = None
    localisation_details: str = ""
    fournisseur: str = ""
    numero_modele: str = ""
    cout_unitaire: float = 0.0
    photos: List[str] = []
    documents: List[str] = []
    frequence_maintenance: Optional[str] = None
    frequence_maintenance_jours: Optional[int] = None
    notes: str = ""


class MaterielUpdate(BaseModel):
    numero_identification: Optional[str] = None
    nom: Optional[str] = None
    categorie_id: Optional[str] = None
    quantite_stock: Optional[int] = None
    quantite_minimum: Optional[int] = None
    unite_mesure: Optional[str] = None
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    etat: Optional[str] = None
    localisation_type: Optional[str] = None
    localisation_id: Optional[str] = None
    localisation_details: Optional[str] = None
    fournisseur: Optional[str] = None
    numero_modele: Optional[str] = None
    cout_unitaire: Optional[float] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[str]] = None
    frequence_maintenance: Optional[str] = None
    frequence_maintenance_jours: Optional[int] = None
    derniere_maintenance: Optional[str] = None
    notes: Optional[str] = None


class MouvementStock(BaseModel):
    """Historique des mouvements de stock"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    type_mouvement: str
    quantite: int
    quantite_avant: int
    quantite_apres: int
    raison: str
    reference: str = ""
    effectue_par: str
    effectue_par_id: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MouvementStockCreate(BaseModel):
    materiel_id: str
    type_mouvement: str
    quantite: int
    raison: str
    reference: str = ""
    notes: str = ""


class MaintenanceMateriel(BaseModel):
    """Maintenance préventive ou corrective"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    type_maintenance: str
    statut: str
    date_prevue: str
    date_realisation: Optional[str] = None
    description: str = ""
    cout: float = 0.0
    effectue_par: Optional[str] = None
    effectue_par_id: Optional[str] = None
    pieces_remplacees: List[str] = []
    notes: str = ""
    documents: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaintenanceMaterielCreate(BaseModel):
    materiel_id: str
    type_maintenance: str
    date_prevue: str
    description: str = ""
    cout: float = 0.0
    notes: str = ""


class MaintenanceMaterielUpdate(BaseModel):
    type_maintenance: Optional[str] = None
    statut: Optional[str] = None
    date_prevue: Optional[str] = None
    date_realisation: Optional[str] = None
    description: Optional[str] = None
    cout: Optional[float] = None
    effectue_par: Optional[str] = None
    effectue_par_id: Optional[str] = None
    pieces_remplacees: Optional[List[str]] = None
    notes: Optional[str] = None
    documents: Optional[List[str]] = None


class InspectionMateriel(BaseModel):
    """Inspection périodique"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    date_inspection: str
    resultat: str
    inspecteur: str
    inspecteur_id: Optional[str] = None
    observations: str = ""
    anomalies: List[str] = []
    photos: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InspectionMaterielCreate(BaseModel):
    date_inspection: str
    resultat: str
    observations: str = ""
    anomalies: List[str] = []
    photos: List[str] = []


# ==================== ROUTES CATÉGORIES ====================

@router.get("/{tenant_slug}/materiel/categories")
async def get_categories_materiel(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les catégories de matériel"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    categories = await db.categories_materiel.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("ordre", 1).to_list(1000)
    
    return categories


@router.post("/{tenant_slug}/materiel/categories")
async def create_categorie_materiel(
    tenant_slug: str,
    categorie: CategorieMaterielCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle catégorie (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "creer", "materiel")
    
    existing = await db.categories_materiel.find_one({
        "tenant_id": tenant.id,
        "nom": categorie.nom
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Une catégorie avec ce nom existe déjà")
    
    categorie_obj = CategorieMateriel(
        tenant_id=tenant.id,
        **categorie.dict()
    )
    
    await db.categories_materiel.insert_one(categorie_obj.dict())
    
    return {"message": "Catégorie créée avec succès", "id": categorie_obj.id}


@router.put("/{tenant_slug}/materiel/categories/{categorie_id}")
async def update_categorie_materiel(
    tenant_slug: str,
    categorie_id: str,
    categorie: CategorieMaterielUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier une catégorie (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "modifier", "materiel")
    
    update_data = {k: v for k, v in categorie.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    result = await db.categories_materiel.update_one(
        {"id": categorie_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    return {"message": "Catégorie mise à jour avec succès"}


@router.delete("/{tenant_slug}/materiel/categories/{categorie_id}")
async def delete_categorie_materiel(
    tenant_slug: str,
    categorie_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une catégorie (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "materiel")
    
    count = await db.materiel.count_documents({
        "tenant_id": tenant.id,
        "categorie_id": categorie_id
    })
    
    if count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer - {count} item(s) utilisent cette catégorie"
        )
    
    result = await db.categories_materiel.delete_one({
        "id": categorie_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    return {"message": "Catégorie supprimée avec succès"}


# ==================== ROUTES MATÉRIEL ====================

@router.get("/{tenant_slug}/materiel")
async def get_materiel(
    tenant_slug: str,
    categorie_id: Optional[str] = None,
    etat: Optional[str] = None,
    localisation_type: Optional[str] = None,
    alerte_stock: bool = False,
    alerte_expiration: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le matériel avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    
    if categorie_id:
        query["categorie_id"] = categorie_id
    if etat:
        query["etat"] = etat
    if localisation_type:
        query["localisation_type"] = localisation_type
    if alerte_stock:
        query["$expr"] = {"$lte": ["$quantite_stock", "$quantite_minimum"]}
    if alerte_expiration:
        date_limite = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        query["date_expiration"] = {"$lte": date_limite, "$ne": None}
    
    items = await db.materiel.find(query, {"_id": 0}).sort("nom", 1).to_list(5000)
    
    # Enrichir avec les noms de catégories
    categories = await db.categories_materiel.find(
        {"tenant_id": tenant.id}, {"_id": 0, "id": 1, "nom": 1}
    ).to_list(100)
    cat_map = {c["id"]: c["nom"] for c in categories}
    
    for item in items:
        item["categorie_nom"] = cat_map.get(item.get("categorie_id"), "Non catégorisé")
    
    return items


@router.get("/{tenant_slug}/materiel/{materiel_id}")
async def get_materiel_detail(
    tenant_slug: str,
    materiel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les détails d'un item"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    item = await db.materiel.find_one(
        {"id": materiel_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not item:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    return item


@router.post("/{tenant_slug}/materiel")
async def create_materiel(
    tenant_slug: str,
    materiel: MaterielCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau matériel (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "creer", "materiel")
    
    categorie = await db.categories_materiel.find_one({
        "id": materiel.categorie_id,
        "tenant_id": tenant.id
    })
    
    if not categorie:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")
    
    existing = await db.materiel.find_one({
        "tenant_id": tenant.id,
        "numero_identification": materiel.numero_identification
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Un matériel avec le numéro {materiel.numero_identification} existe déjà"
        )
    
    cout_total = materiel.quantite_stock * materiel.cout_unitaire
    
    materiel_obj = Materiel(
        tenant_id=tenant.id,
        created_by=current_user.id,
        cout_total=cout_total,
        **materiel.dict()
    )
    
    await db.materiel.insert_one(materiel_obj.dict())
    
    if materiel.quantite_stock > 0:
        mouvement = MouvementStock(
            tenant_id=tenant.id,
            materiel_id=materiel_obj.id,
            type_mouvement="entree",
            quantite=materiel.quantite_stock,
            quantite_avant=0,
            quantite_apres=materiel.quantite_stock,
            raison="stock_initial",
            reference="Création initiale",
            effectue_par=f"{current_user.prenom} {current_user.nom}",
            effectue_par_id=current_user.id
        )
        await db.mouvements_stock.insert_one(mouvement.dict())
    
    logger.info(f"📦 Matériel créé: {materiel.nom} par {current_user.email}")
    
    return {"message": "Matériel créé avec succès", "id": materiel_obj.id}


@router.put("/{tenant_slug}/materiel/{materiel_id}")
async def update_materiel(
    tenant_slug: str,
    materiel_id: str,
    materiel: MaterielUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un matériel (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "modifier", "materiel")
    
    item_actuel = await db.materiel.find_one({
        "id": materiel_id,
        "tenant_id": tenant.id
    })
    
    if not item_actuel:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    ancien_etat = item_actuel.get("etat")
    
    update_data = {k: v for k, v in materiel.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    if 'quantite_stock' in update_data or 'cout_unitaire' in update_data:
        new_quantite = update_data.get('quantite_stock', item_actuel['quantite_stock'])
        new_cout = update_data.get('cout_unitaire', item_actuel['cout_unitaire'])
        update_data['cout_total'] = new_quantite * new_cout
    
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    result = await db.materiel.update_one(
        {"id": materiel_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    # Notifier tout le monde si matériel mis hors service
    nouvel_etat = update_data.get("etat")
    etats_hors_service = ["hors_service", "en_maintenance", "hors service", "a_reparer"]
    
    if nouvel_etat and nouvel_etat.lower() in etats_hors_service and ancien_etat != nouvel_etat:
        nom_materiel = item_actuel.get("nom", "Matériel")
        await notifier_materiel_hors_service(
            tenant_id=tenant.id,
            nom_materiel=nom_materiel,
            statut=nouvel_etat,
            raison=materiel.notes if materiel.notes else None,
            modifie_par=f"{current_user.prenom} {current_user.nom}"
        )
    
    return {"message": "Matériel mis à jour avec succès"}


@router.delete("/{tenant_slug}/materiel/{materiel_id}")
async def delete_materiel(
    tenant_slug: str,
    materiel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un matériel (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "supprimer", "materiel")
    
    result = await db.materiel.delete_one({
        "id": materiel_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    # Supprimer aussi les mouvements et maintenances associés
    await db.mouvements_stock.delete_many({"materiel_id": materiel_id})
    await db.maintenances_materiel.delete_many({"materiel_id": materiel_id})
    await db.inspections_materiel.delete_many({"materiel_id": materiel_id})
    
    logger.info(f"🗑️ Matériel supprimé: {materiel_id} par {current_user.email}")
    
    return {"message": "Matériel supprimé avec succès"}


# ==================== ROUTES MOUVEMENTS DE STOCK ====================

@router.post("/{tenant_slug}/materiel/{materiel_id}/mouvement")
async def create_mouvement_stock(
    tenant_slug: str,
    materiel_id: str,
    mouvement: MouvementStockCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un mouvement de stock"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "modifier", "materiel")
    
    item = await db.materiel.find_one({
        "id": materiel_id,
        "tenant_id": tenant.id
    })
    
    if not item:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    quantite_avant = item['quantite_stock']
    
    if mouvement.type_mouvement == "sortie":
        quantite_apres = quantite_avant - mouvement.quantite
        if quantite_apres < 0:
            raise HTTPException(status_code=400, detail="Stock insuffisant")
    elif mouvement.type_mouvement == "entree":
        quantite_apres = quantite_avant + mouvement.quantite
    else:
        quantite_apres = mouvement.quantite
    
    mouvement_obj = MouvementStock(
        tenant_id=tenant.id,
        materiel_id=materiel_id,
        type_mouvement=mouvement.type_mouvement,
        quantite=mouvement.quantite if mouvement.type_mouvement == "entree" else -mouvement.quantite,
        quantite_avant=quantite_avant,
        quantite_apres=quantite_apres,
        raison=mouvement.raison,
        reference=mouvement.reference,
        effectue_par=f"{current_user.prenom} {current_user.nom}",
        effectue_par_id=current_user.id,
        notes=mouvement.notes
    )
    
    await db.mouvements_stock.insert_one(mouvement_obj.dict())
    
    await db.materiel.update_one(
        {"id": materiel_id, "tenant_id": tenant.id},
        {
            "$set": {
                "quantite_stock": quantite_apres,
                "cout_total": quantite_apres * item['cout_unitaire'],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {
        "message": "Mouvement enregistré",
        "quantite_avant": quantite_avant,
        "quantite_apres": quantite_apres
    }


@router.get("/{tenant_slug}/materiel/{materiel_id}/mouvements")
async def get_mouvements_stock(
    tenant_slug: str,
    materiel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des mouvements"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    mouvements = await db.mouvements_stock.find(
        {"materiel_id": materiel_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return mouvements


# ==================== ROUTES MAINTENANCE ====================

@router.get("/{tenant_slug}/materiel/maintenances")
async def get_maintenances(
    tenant_slug: str,
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les maintenances"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if statut:
        query["statut"] = statut
    
    maintenances = await db.maintenances_materiel.find(
        query, {"_id": 0}
    ).sort("date_prevue", 1).to_list(1000)
    
    return maintenances


@router.post("/{tenant_slug}/materiel/{materiel_id}/maintenance")
async def create_maintenance(
    tenant_slug: str,
    materiel_id: str,
    maintenance: MaintenanceMaterielCreate,
    current_user: User = Depends(get_current_user)
):
    """Planifier une maintenance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "creer", "materiel")
    
    item = await db.materiel.find_one({
        "id": materiel_id,
        "tenant_id": tenant.id
    })
    
    if not item:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    maintenance_obj = MaintenanceMateriel(
        tenant_id=tenant.id,
        materiel_id=materiel_id,
        statut="planifiee",
        **maintenance.dict()
    )
    
    await db.maintenances_materiel.insert_one(maintenance_obj.dict())
    
    await db.materiel.update_one(
        {"id": materiel_id, "tenant_id": tenant.id},
        {"$set": {"date_prochaine_maintenance": maintenance.date_prevue}}
    )
    
    return {"message": "Maintenance planifiée", "id": maintenance_obj.id}


@router.put("/{tenant_slug}/materiel/maintenances/{maintenance_id}")
async def update_maintenance(
    tenant_slug: str,
    maintenance_id: str,
    maintenance: MaintenanceMaterielUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier une maintenance"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module actifs/materiel
    await require_permission(tenant.id, current_user, "actifs", "modifier", "materiel")
    
    update_data = {k: v for k, v in maintenance.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    maint = await db.maintenances_materiel.find_one({
        "id": maintenance_id,
        "tenant_id": tenant.id
    })
    
    if not maint:
        raise HTTPException(status_code=404, detail="Maintenance non trouvée")
    
    result = await db.maintenances_materiel.update_one(
        {"id": maintenance_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if maintenance.statut == "terminee":
        await db.materiel.update_one(
            {"id": maint["materiel_id"], "tenant_id": tenant.id},
            {
                "$set": {
                    "derniere_maintenance": maintenance.date_realisation or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "etat": "bon"
                }
            }
        )
    
    return {"message": "Maintenance mise à jour"}


# ==================== ROUTES INSPECTION ====================

@router.post("/{tenant_slug}/materiel/{materiel_id}/inspection")
async def create_inspection(
    tenant_slug: str,
    materiel_id: str,
    inspection: InspectionMaterielCreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistrer une inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    item = await db.materiel.find_one({
        "id": materiel_id,
        "tenant_id": tenant.id
    })
    
    if not item:
        raise HTTPException(status_code=404, detail="Matériel non trouvé")
    
    inspection_obj = InspectionMateriel(
        tenant_id=tenant.id,
        materiel_id=materiel_id,
        inspecteur=f"{current_user.prenom} {current_user.nom}",
        inspecteur_id=current_user.id,
        **inspection.dict()
    )
    
    await db.inspections_materiel.insert_one(inspection_obj.dict())
    
    if inspection.resultat == "non_conforme" and inspection.anomalies:
        await db.materiel.update_one(
            {"id": materiel_id, "tenant_id": tenant.id},
            {"$set": {"etat": "a_reparer"}}
        )
    
    return {"message": "Inspection enregistrée", "id": inspection_obj.id}


@router.get("/{tenant_slug}/materiel/{materiel_id}/inspections")
async def get_inspections(
    tenant_slug: str,
    materiel_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_materiel.find(
        {"materiel_id": materiel_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(1000)
    
    return inspections


# ==================== ROUTES STATISTIQUES ====================

@router.get("/{tenant_slug}/materiel/statistiques")
async def get_statistiques_materiel(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les statistiques du matériel"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    total = await db.materiel.count_documents({"tenant_id": tenant.id})
    bon = await db.materiel.count_documents({"tenant_id": tenant.id, "etat": "bon"})
    a_reparer = await db.materiel.count_documents({"tenant_id": tenant.id, "etat": "a_reparer"})
    hors_service = await db.materiel.count_documents({"tenant_id": tenant.id, "etat": "hors_service"})
    en_maintenance = await db.materiel.count_documents({"tenant_id": tenant.id, "etat": "en_maintenance"})
    
    alertes_stock = await db.materiel.count_documents({
        "tenant_id": tenant.id,
        "$expr": {"$lte": ["$quantite_stock", "$quantite_minimum"]}
    })
    
    pipeline = [
        {"$match": {"tenant_id": tenant.id}},
        {"$group": {"_id": None, "valeur_totale": {"$sum": "$cout_total"}}}
    ]
    result = await db.materiel.aggregate(pipeline).to_list(1)
    valeur_totale = result[0]['valeur_totale'] if result else 0
    
    date_limite = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%d")
    maintenances_a_venir = await db.maintenances_materiel.count_documents({
        "tenant_id": tenant.id,
        "statut": "planifiee",
        "date_prevue": {"$lte": date_limite}
    })
    
    return {
        "total": total,
        "par_etat": {
            "bon": bon,
            "a_reparer": a_reparer,
            "hors_service": hors_service,
            "en_maintenance": en_maintenance
        },
        "alertes_stock": alertes_stock,
        "valeur_totale": round(valeur_totale, 2),
        "maintenances_a_venir": maintenances_a_venir
    }
