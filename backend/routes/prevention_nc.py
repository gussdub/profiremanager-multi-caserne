"""
Routes API pour les Non-Conformités (Module Prévention)
========================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.

Routes:
- POST   /{tenant_slug}/prevention/non-conformites                    - Créer NC
- GET    /{tenant_slug}/prevention/non-conformites                    - Liste NC
- GET    /{tenant_slug}/prevention/non-conformites/{nc_id}            - Détail NC
- PUT    /{tenant_slug}/prevention/non-conformites/{nc_id}            - Modifier NC
- PATCH  /{tenant_slug}/prevention/non-conformites/{nc_id}/statut     - Changer statut
- DELETE /{tenant_slug}/prevention/non-conformites/{nc_id}            - Supprimer NC
- GET    /{tenant_slug}/prevention/non-conformites-en-retard          - NC en retard
- POST   /{tenant_slug}/prevention/relancer-non-conformites           - Relancer NC
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    creer_notification,
    require_permission,
)

from routes.prevention_models import (
    NonConformite,
    NonConformiteCreate,
)

router = APIRouter(tags=["Prévention - Non-conformités"])
logger = logging.getLogger(__name__)


# ==================== NON-CONFORMITÉS ====================

@router.post("/{tenant_slug}/prevention/non-conformites")
async def create_non_conformite(
    tenant_slug: str,
    non_conformite: NonConformiteCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle non-conformité (manuelle ou liée à une inspection)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "non_conformites")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc_dict = non_conformite.dict()
    nc_dict["tenant_id"] = tenant.id
    nc_dict["createur_id"] = current_user.id
    
    if not nc_dict.get("inspection_id"):
        nc_dict["est_manuel"] = True
        nc_dict["inspection_id"] = None
    
    if nc_dict.get("priorite"):
        priorite_map = {"haute": "eleve", "moyenne": "moyen", "faible": "faible"}
        nc_dict["gravite"] = priorite_map.get(nc_dict["priorite"], nc_dict["priorite"])
    
    nc_obj = NonConformite(**nc_dict)
    
    await db.non_conformites.insert_one(nc_obj.dict())
    
    return clean_mongo_doc(nc_obj.dict())

@router.get("/{tenant_slug}/prevention/non-conformites")
async def get_non_conformites(
    tenant_slug: str,
    inspection_id: Optional[str] = None,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer toutes les non-conformités avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    if inspection_id:
        query["inspection_id"] = inspection_id
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    
    non_conformites = await db.non_conformites.find(query).sort("created_at", -1).to_list(1000)
    return [clean_mongo_doc(nc) for nc in non_conformites]

@router.get("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def get_non_conformite(
    tenant_slug: str,
    nc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une non-conformité spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc = await db.non_conformites.find_one({"id": nc_id, "tenant_id": tenant.id})
    
    if not nc:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    return clean_mongo_doc(nc)

@router.put("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def update_non_conformite(
    tenant_slug: str,
    nc_id: str,
    nc_data: NonConformiteCreate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "non_conformites")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_dict = nc_data.dict()
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.non_conformites.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated_nc = await db.non_conformites.find_one({"id": nc_id})
    return clean_mongo_doc(updated_nc)

@router.patch("/{tenant_slug}/prevention/non-conformites/{nc_id}/statut")
async def update_non_conformite_statut(
    tenant_slug: str,
    nc_id: str,
    statut: str = Body(..., embed=True),
    notes_correction: str = Body("", embed=True),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour le statut d'une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "modifier", "non_conformites")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_data = {
        "statut": statut,
        "notes_correction": notes_correction,
        "updated_at": datetime.now(timezone.utc)
    }
    
    if statut == "corrigee" or statut == "fermee":
        update_data["date_correction"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    result = await db.non_conformites.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated_nc = await db.non_conformites.find_one({"id": nc_id})
    return clean_mongo_doc(updated_nc)

@router.delete("/{tenant_slug}/prevention/non-conformites/{nc_id}")
async def delete_non_conformite(
    tenant_slug: str,
    nc_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "supprimer", "non_conformites")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    result = await db.non_conformites.delete_one({"id": nc_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    return {"message": "Non-conformité supprimée avec succès"}


@router.get("/{tenant_slug}/prevention/non-conformites-en-retard")
async def get_non_conformites_en_retard(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les non-conformités dont le délai de correction est dépassé ou arrive à échéance."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    non_conformites = await db.non_conformites.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["ouverte", "en_cours", "a_corriger"]},
        "delai_correction": {"$ne": None, "$lte": today}
    }).sort("delai_correction", 1).to_list(500)
    
    result = []
    for nc in non_conformites:
        nc_clean = clean_mongo_doc(nc)
        
        batiment = await db.batiments.find_one({"id": nc.get("batiment_id"), "tenant_id": tenant.id})
        if batiment:
            nc_clean["batiment"] = {
                "id": batiment.get("id"),
                "nom_etablissement": batiment.get("nom_etablissement"),
                "adresse_civique": batiment.get("adresse_civique"),
                "ville": batiment.get("ville"),
                "preventionniste_assigne_id": batiment.get("preventionniste_assigne_id")
            }
        
        if nc.get("delai_correction"):
            try:
                delai_date = datetime.strptime(nc["delai_correction"], "%Y-%m-%d").date()
                today_date = datetime.now(timezone.utc).date()
                nc_clean["jours_retard"] = (today_date - delai_date).days
            except Exception:
                nc_clean["jours_retard"] = 0
        
        result.append(nc_clean)
    
    return result


@router.post("/{tenant_slug}/prevention/relancer-non-conformites")
async def relancer_non_conformites(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Envoyer des notifications de relance pour les NC en retard."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "non_conformites")
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    non_conformites = await db.non_conformites.find({
        "tenant_id": tenant.id,
        "statut": {"$in": ["ouverte", "en_cours", "a_corriger"]},
        "delai_correction": {"$ne": None, "$lte": today},
        "$or": [
            {"derniere_relance": {"$ne": today}},
            {"derniere_relance": {"$exists": False}}
        ]
    }).to_list(500)
    
    relances_envoyees = 0
    
    for nc in non_conformites:
        batiment = await db.batiments.find_one({"id": nc.get("batiment_id"), "tenant_id": tenant.id})
        
        destinataires_ids = set()
        
        if nc.get("createur_id"):
            destinataires_ids.add(nc["createur_id"])
        
        if batiment and batiment.get("preventionniste_assigne_id"):
            destinataires_ids.add(batiment["preventionniste_assigne_id"])
        
        responsables = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["admin", "superviseur"]},
            "$or": [
                {"est_preventionniste": True},
                {"est_responsable_prevention": True}
            ]
        }).to_list(50)
        for resp in responsables:
            destinataires_ids.add(resp["id"])
        
        jours_retard = 0
        if nc.get("delai_correction"):
            try:
                delai_date = datetime.strptime(nc["delai_correction"], "%Y-%m-%d").date()
                today_date = datetime.now(timezone.utc).date()
                jours_retard = (today_date - delai_date).days
            except Exception:
                pass
        
        titre_nc = nc.get("titre") or nc.get("section_grille") or "Non-conformité"
        batiment_nom = batiment.get("nom_etablissement") or batiment.get("adresse_civique") if batiment else "Bâtiment inconnu"
        
        for dest_id in destinataires_ids:
            try:
                await creer_notification(
                    tenant_id=tenant.id,
                    destinataire_id=dest_id,
                    type="relance_nc",
                    titre=f"NC en retard: {titre_nc}",
                    message=f"Non-conformité au {batiment_nom} - {jours_retard} jour(s) de retard",
                    lien=f"/prevention/non-conformites",
                    data={"nc_id": nc.get("id"), "jours_retard": jours_retard, "batiment_id": nc.get("batiment_id")}
                )
                relances_envoyees += 1
            except Exception as e:
                logger.error(f"Erreur envoi notification relance NC: {e}")
        
        await db.non_conformites.update_one(
            {"id": nc.get("id"), "tenant_id": tenant.id},
            {"$set": {
                "derniere_relance": today,
                "nb_relances": nc.get("nb_relances", 0) + 1,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
    
    return {
        "message": f"Relances envoyées avec succès",
        "nc_traitees": len(non_conformites),
        "notifications_envoyees": relances_envoyees
    }
