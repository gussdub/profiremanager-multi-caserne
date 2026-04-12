"""
Routes pour le module Bâtiments (indépendant de Prévention)
Ce module permet de gérer les bâtiments/adresses de manière centralisée,
utilisable par Prévention, Interventions, et autres modules.

Endpoints:
- GET    /{tenant_slug}/batiments                    - Liste bâtiments
- GET    /{tenant_slug}/batiments/search             - Recherche bâtiments
- GET    /{tenant_slug}/batiments/{id}               - Détail bâtiment
- POST   /{tenant_slug}/batiments                    - Créer bâtiment
- PUT    /{tenant_slug}/batiments/{id}               - Modifier bâtiment
- DELETE /{tenant_slug}/batiments/{id}               - Supprimer bâtiment
- GET    /{tenant_slug}/batiments/meta/categories    - Catégories bâtiments
- GET    /{tenant_slug}/batiments/statistiques       - Statistiques
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid

from .dependencies import (
    get_db, 
    get_tenant_from_slug, 
    get_current_user, 
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Bâtiments"])


# ======================== MODÈLES ========================

class BatimentBase(BaseModel):
    adresse_civique: str
    ville: str
    code_postal: Optional[str] = None
    province: Optional[str] = "Québec"
    pays: Optional[str] = "Canada"
    nom_etablissement: Optional[str] = None
    groupe_occupation: Optional[str] = None  # A, B, C, D, E, F, I
    sous_type_batiment: Optional[str] = None
    nombre_etages: Optional[int] = None
    nombre_logements: Optional[int] = None  # Nombre de logements/unités
    superficie: Optional[float] = None
    annee_construction: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: Optional[str] = "Faible"  # Faible, Moyen, Élevé, Très élevé
    description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_telephone: Optional[str] = None
    contact_email: Optional[str] = None
    actif: bool = True


class BatimentCreate(BatimentBase):
    pass


class BatimentUpdate(BaseModel):
    adresse_civique: Optional[str] = None
    ville: Optional[str] = None
    code_postal: Optional[str] = None
    province: Optional[str] = None
    pays: Optional[str] = None
    nom_etablissement: Optional[str] = None
    groupe_occupation: Optional[str] = None
    sous_type_batiment: Optional[str] = None
    nombre_etages: Optional[int] = None
    nombre_logements: Optional[int] = None
    superficie: Optional[float] = None
    annee_construction: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    photo_url: Optional[str] = None
    contact_nom: Optional[str] = None
    contact_telephone: Optional[str] = None
    contact_email: Optional[str] = None
    actif: Optional[bool] = None


class Batiment(BatimentBase):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None


class BatimentHistorique(BaseModel):
    """Historique des modifications d'un bâtiment"""
    id: str
    tenant_id: str
    batiment_id: str
    action: str  # create, update, delete, import_xml, import_csv
    source: str  # manual, xml, csv, sftp, api
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    changes: Optional[dict] = None  # Champs modifiés avec anciennes/nouvelles valeurs
    description: Optional[str] = None


# ======================== FONCTIONS UTILITAIRES ========================

async def log_batiment_history(
    db,
    tenant_id: str,
    batiment_id: str,
    action: str,
    source: str,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    changes: Optional[dict] = None,
    description: Optional[str] = None
):
    """
    Enregistre une entrée dans l'historique des modifications d'un bâtiment.
    
    Args:
        db: Instance de la base de données
        tenant_id: ID du tenant
        batiment_id: ID du bâtiment
        action: Type d'action (create, update, delete, import_xml, import_csv)
        source: Source de la modification (manual, xml, csv, sftp, api)
        user_id: ID de l'utilisateur (optionnel)
        user_name: Nom de l'utilisateur (optionnel)
        changes: Dictionnaire des changements {field: {old: x, new: y}}
        description: Description textuelle du changement
    """
    history_entry = BatimentHistorique(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        batiment_id=batiment_id,
        action=action,
        source=source,
        user_id=user_id,
        user_name=user_name,
        timestamp=datetime.now(timezone.utc),
        changes=changes,
        description=description
    )
    
    await db.batiments_historique.insert_one(history_entry.dict())
    return history_entry


def compute_changes(old_data: dict, new_data: dict) -> dict:
    """
    Compare deux dictionnaires et retourne les différences.
    
    Returns:
        dict: {field_name: {"old": old_value, "new": new_value}}
    """
    changes = {}
    
    # Champs à comparer (exclure les champs système)
    exclude_fields = {'id', 'tenant_id', 'created_at', 'created_by', 'updated_at', '_id'}
    
    all_keys = set(old_data.keys()) | set(new_data.keys())
    
    for key in all_keys:
        if key in exclude_fields:
            continue
            
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        
        # Ignorer si les deux sont None/vides
        if (old_val is None or old_val == '') and (new_val is None or new_val == ''):
            continue
            
        if old_val != new_val:
            changes[key] = {
                "old": old_val,
                "new": new_val
            }
    
    return changes


# ======================== ROUTES ========================

@router.get("/{tenant_slug}/batiments/meta/categories")
async def get_categories_batiments(tenant_slug: str):
    """Retourne les catégories/groupes d'occupation des bâtiments"""
    return {
        "groupes_occupation": [
            {"code": "A", "nom": "Groupe A - Établissements de Réunion", "description": "Théâtres, salles de spectacles, églises, restaurants"},
            {"code": "B", "nom": "Groupe B - Soins et Détention", "description": "Hôpitaux, CHSLD, prisons"},
            {"code": "C", "nom": "Groupe C - Habitations", "description": "Maisons, appartements, condos"},
            {"code": "D", "nom": "Groupe D - Établissements d'Affaires", "description": "Bureaux, banques, cliniques"},
            {"code": "E", "nom": "Groupe E - Établissements Commerciaux", "description": "Magasins, centres commerciaux"},
            {"code": "F", "nom": "Groupe F - Établissements Industriels", "description": "Usines, ateliers, entrepôts"},
            {"code": "I", "nom": "Groupe I - Établissements Industriels à risques", "description": "Industries à risques élevés"}
        ],
        "niveaux_risque": ["Faible", "Moyen", "Élevé", "Très élevé"]
    }


@router.get("/{tenant_slug}/batiments/statistiques")
async def get_batiments_statistiques(
    tenant_slug: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Statistiques des bâtiments"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    pipeline = [
        {"$match": {"tenant_id": tenant.id}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "par_risque": {
                "$push": "$niveau_risque"
            },
            "par_groupe": {
                "$push": "$groupe_occupation"
            }
        }}
    ]
    
    result = await db.batiments.aggregate(pipeline).to_list(1)
    
    if not result:
        return {
            "total": 0,
            "par_niveau_risque": {},
            "par_groupe_occupation": {}
        }
    
    stats = result[0]
    
    # Compter par niveau de risque
    risques = {}
    for r in stats.get("par_risque", []):
        if r:
            risques[r] = risques.get(r, 0) + 1
    
    # Compter par groupe d'occupation
    groupes = {}
    for g in stats.get("par_groupe", []):
        if g:
            groupes[g] = groupes.get(g, 0) + 1
    
    return {
        "total": stats.get("total", 0),
        "par_niveau_risque": risques,
        "par_groupe_occupation": groupes
    }


@router.get("/{tenant_slug}/batiments")
async def get_batiments(
    tenant_slug: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    actif: Optional[bool] = None,
    niveau_risque: Optional[str] = None,
    groupe_occupation: Optional[str] = None
):
    """Liste tous les bâtiments du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    query = {"tenant_id": tenant.id}
    
    if actif is not None:
        query["actif"] = actif
    
    if niveau_risque:
        query["niveau_risque"] = niveau_risque
    
    if groupe_occupation:
        query["groupe_occupation"] = groupe_occupation
    
    batiments = await db.batiments.find(
        query, 
        {"_id": 0}
    ).sort("nom_etablissement", 1).to_list(5000)
    
    return batiments


@router.get("/{tenant_slug}/batiments/search")
async def search_batiments(
    tenant_slug: str,
    q: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
    limit: int = 50
):
    """Recherche de bâtiments par texte"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    if not q or len(q) < 2:
        return []
    
    # Recherche sur plusieurs champs
    query = {
        "tenant_id": tenant.id,
        "$or": [
            {"adresse_civique": {"$regex": q, "$options": "i"}},
            {"ville": {"$regex": q, "$options": "i"}},
            {"nom_etablissement": {"$regex": q, "$options": "i"}},
            {"code_postal": {"$regex": q, "$options": "i"}}
        ]
    }
    
    batiments = await db.batiments.find(
        query, 
        {"_id": 0}
    ).sort("nom_etablissement", 1).limit(limit).to_list(limit)
    
    return batiments


@router.get("/{tenant_slug}/batiments/{batiment_id}")
async def get_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Détail d'un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    batiment = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    return batiment


@router.post("/{tenant_slug}/batiments")
async def create_batiment(
    tenant_slug: str,
    batiment: BatimentCreate,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Créer un nouveau bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "creer", "liste")
    
    batiment_obj = Batiment(
        id=str(uuid.uuid4()),
        tenant_id=tenant.id,
        created_at=datetime.now(timezone.utc),
        created_by=current_user.id,
        **batiment.dict()
    )
    
    await db.batiments.insert_one(batiment_obj.dict())
    
    # Enregistrer dans l'historique
    user_name = f"{current_user.prenom} {current_user.nom}" if hasattr(current_user, 'prenom') else current_user.email
    await log_batiment_history(
        db=db,
        tenant_id=tenant.id,
        batiment_id=batiment_obj.id,
        action="create",
        source="manual",
        user_id=current_user.id,
        user_name=user_name,
        description=f"Création du bâtiment: {batiment.adresse_civique}, {batiment.ville}"
    )
    
    # Mapping rétroactif: relier automatiquement les interventions orphelines
    try:
        from routes.import_interventions import auto_link_interventions_to_batiment
        linked = await auto_link_interventions_to_batiment(
            tenant.id, batiment_obj.id, batiment.adresse_civique, batiment.ville
        )
        if linked > 0:
            return {"message": f"Bâtiment créé. {linked} intervention(s) historique(s) reliée(s) automatiquement.", "id": batiment_obj.id, "interventions_linked": linked}
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Erreur mapping rétroactif: %s", e)
    
    return {"message": "Bâtiment créé", "id": batiment_obj.id}


@router.put("/{tenant_slug}/batiments/{batiment_id}")
async def update_batiment(
    tenant_slug: str,
    batiment_id: str,
    data: BatimentUpdate,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Modifier un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    # Calculer les changements pour l'historique
    changes = compute_changes(existing, update_data)
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id}, 
        {"_id": 0}
    )
    
    # Enregistrer dans l'historique si des changements ont été faits
    if changes:
        user_name = f"{current_user.prenom} {current_user.nom}" if hasattr(current_user, 'prenom') else current_user.email
        changed_fields = list(changes.keys())
        await log_batiment_history(
            db=db,
            tenant_id=tenant.id,
            batiment_id=batiment_id,
            action="update",
            source="manual",
            user_id=current_user.id,
            user_name=user_name,
            changes=changes,
            description=f"Modification des champs: {', '.join(changed_fields)}"
        )
    
    return updated


@router.delete("/{tenant_slug}/batiments/{batiment_id}")
async def delete_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Supprimer un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "supprimer", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Enregistrer dans l'historique AVANT la suppression
    user_name = f"{current_user.prenom} {current_user.nom}" if hasattr(current_user, 'prenom') else current_user.email
    adresse = existing.get('adresse_civique', '')
    ville = existing.get('ville', '')
    await log_batiment_history(
        db=db,
        tenant_id=tenant.id,
        batiment_id=batiment_id,
        action="delete",
        source="manual",
        user_id=current_user.id,
        user_name=user_name,
        description=f"Suppression du bâtiment: {adresse}, {ville}"
    )
    
    await db.batiments.delete_one({"id": batiment_id, "tenant_id": tenant.id})
    
    return {"message": "Bâtiment supprimé", "id": batiment_id}


@router.post("/{tenant_slug}/batiments/{batiment_id}/photo")
async def upload_batiment_photo(
    tenant_slug: str,
    batiment_id: str,
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """Upload une photo pour un bâtiment"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Upload vers Azure Blob Storage
    from services.azure_storage import put_object, generate_sas_url, generate_storage_path
    content = await file.read()
    content_type = file.content_type or "image/jpeg"
    
    # Limiter la taille (5MB max)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 5MB)")
    
    blob_path = generate_storage_path(tenant.id, "batiments-photos", f"batiment_{batiment_id}.jpg")
    put_object(blob_path, content, content_type)
    sas_url = generate_sas_url(blob_path)
    
    await db.batiments.update_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"$set": {"photo_blob_name": blob_path, "photo_url": None, "photo_storage": "azure", "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"message": "Photo uploadée", "photo_url": sas_url}



@router.get("/{tenant_slug}/batiments/{batiment_id}/historique")
async def get_batiment_historique(
    tenant_slug: str,
    batiment_id: str,
    limit: int = 100,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Récupère l'historique unifié d'un bâtiment :
    - Modifications manuelles et imports (batiments_historique)
    - Inspections de prévention (inspections)
    - Non-conformités (non_conformites)
    - Interventions reliées par adresse (interventions)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    existing = await db.batiments.find_one({"id": batiment_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    timeline = []
    
    # 1. Modifications (batiments_historique)
    historique = await db.batiments_historique.find(
        {"batiment_id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)
    
    for h in historique:
        ts = h.get("timestamp")
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        timeline.append({
            "type": "modification",
            "timestamp": ts or "",
            "action": h.get("action", "update"),
            "source": h.get("source", "manual"),
            "user_name": h.get("user_name"),
            "description": h.get("description"),
            "changes": h.get("changes"),
            "id": h.get("id")
        })
    
    # 2. Inspections de prévention
    inspections = await db.inspections.find(
        {"batiment_id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_creation", -1).limit(limit).to_list(limit)
    
    for insp in inspections:
        inspecteur = None
        if insp.get("inspecteur_id"):
            user_doc = await db.users.find_one({"id": insp["inspecteur_id"]}, {"_id": 0, "prenom": 1, "nom": 1})
            if user_doc:
                inspecteur = f"{user_doc.get('prenom', '')} {user_doc.get('nom', '')}".strip()
        
        ts = insp.get("date_creation") or insp.get("date_inspection") or ""
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        
        statut = insp.get("statut", "")
        statut_conformite = insp.get("statut_conformite", "")
        
        timeline.append({
            "type": "inspection",
            "timestamp": ts,
            "id": insp.get("id"),
            "statut": statut,
            "statut_conformite": statut_conformite,
            "inspecteur": inspecteur,
            "date_inspection": insp.get("date_inspection", ""),
            "type_inspection": insp.get("type_inspection", "reguliere"),
            "observations": insp.get("observations", ""),
            "grille_utilisee": insp.get("grille_utilisee", "")
        })
    
    # 3. Non-conformités
    non_conformites = await db.non_conformites.find(
        {"batiment_id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for nc in non_conformites:
        ts = nc.get("created_at") or nc.get("date_identification") or ""
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        
        timeline.append({
            "type": "non_conformite",
            "timestamp": ts,
            "id": nc.get("id"),
            "titre": nc.get("titre", ""),
            "description": nc.get("description", ""),
            "gravite": nc.get("gravite", "moyen"),
            "statut": nc.get("statut", "ouverte"),
            "categorie": nc.get("categorie", ""),
            "est_manuel": nc.get("est_manuel", False),
            "inspection_id": nc.get("inspection_id"),
            "delai_correction": nc.get("delai_correction"),
            "articles_codes": nc.get("articles_codes", [])
        })
    
    # 4. Interventions reliées par adresse
    adresse_civique = existing.get("adresse_civique", "")
    if adresse_civique:
        import re
        # Extraire le numéro civique et le début du nom de rue
        parts = adresse_civique.strip().split()
        if len(parts) >= 2:
            numero = parts[0]
            rue = " ".join(parts[1:3])  # Premiers mots de la rue
            
            interventions = await db.interventions.find({
                "tenant_id": tenant.id,
                "$or": [
                    {"address_civic": {"$regex": f"^{re.escape(numero)}$", "$options": "i"},
                     "address_street": {"$regex": re.escape(rue), "$options": "i"}},
                    {"adresse": {"$regex": re.escape(adresse_civique[:20]), "$options": "i"}}
                ]
            }, {"_id": 0}).sort("xml_time_call_received", -1).limit(50).to_list(50)
            
            for inter in interventions:
                ts = inter.get("xml_time_call_received") or inter.get("created_at") or ""
                if isinstance(ts, datetime):
                    ts = ts.isoformat()
                
                adresse_inter = f"{inter.get('address_civic', '')} {inter.get('address_street', '')}".strip()
                
                timeline.append({
                    "type": "intervention",
                    "timestamp": ts,
                    "id": inter.get("id") or inter.get("external_call_id"),
                    "type_intervention": inter.get("type_intervention", ""),
                    "code_feu": inter.get("code_feu", ""),
                    "niveau_risque": inter.get("niveau_risque", ""),
                    "adresse": adresse_inter or inter.get("adresse", ""),
                    "no_sequentiel": inter.get("no_sequentiel", ""),
                    "officer_in_charge": inter.get("officer_in_charge_xml", "")
                })
    
    # Trier toute la timeline par date (plus récent en premier)
    def sort_key(item):
        ts = item.get("timestamp", "")
        if not ts:
            return ""
        return ts
    
    timeline.sort(key=sort_key, reverse=True)
    
    return timeline


@router.get("/{tenant_slug}/batiments/{batiment_id}/complet")
async def get_batiment_complet(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db)
):
    """
    Récupère un bâtiment avec toutes ses informations associées:
    - Données de base du bâtiment
    - Historique des modifications
    - Si module Prévention actif: inspections, plans d'intervention, préventionniste assigné
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "liste")
    
    # Récupérer le bâtiment
    batiment = await db.batiments.find_one(
        {"id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    # Récupérer l'historique des modifications (les 10 plus récentes)
    historique = await db.batiments_historique.find(
        {"batiment_id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("timestamp", -1).limit(10).to_list(10)
    
    result = {
        **batiment,
        "historique_modifications": historique
    }
    
    # Vérifier si le tenant a le module Prévention actif
    tenant_data = await db.tenants.find_one({"id": tenant.id}, {"_id": 0})
    modules_actifs = tenant_data.get("modules_actifs", []) if tenant_data else []
    
    has_prevention = "prevention" in modules_actifs
    
    if has_prevention:
        # Récupérer les inspections liées à ce bâtiment
        inspections = await db.inspections.find(
            {"batiment_id": batiment_id, "tenant_id": tenant.id},
            {"_id": 0}
        ).sort("date_planifiee", -1).limit(10).to_list(10)
        
        # Récupérer les plans d'intervention
        plans = await db.plans_intervention.find(
            {"batiment_id": batiment_id, "tenant_id": tenant.id},
            {"_id": 0}
        ).sort("date_creation", -1).limit(5).to_list(5)
        
        # Récupérer le préventionniste assigné (depuis le bâtiment ou les affectations)
        preventionniste_id = batiment.get("preventionniste_id")
        preventionniste = None
        if preventionniste_id:
            preventionniste = await db.utilisateurs.find_one(
                {"id": preventionniste_id},
                {"_id": 0, "id": 1, "nom": 1, "prenom": 1, "email": 1}
            )
        
        result["prevention"] = {
            "inspections": inspections,
            "plans_intervention": plans,
            "preventionniste": preventionniste,
            "derniere_inspection": inspections[0] if inspections else None,
            "nb_inspections": len(inspections),
            "nb_plans": len(plans)
        }
    
    result["has_prevention_module"] = has_prevention
    
    return result
