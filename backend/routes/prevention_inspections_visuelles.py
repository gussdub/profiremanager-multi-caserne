"""
Routes API pour les Inspections Visuelles (Module Prévention)
==============================================================
Fichier extrait de prevention.py pour améliorer la maintenabilité.

Routes:
- POST   /{tenant_slug}/prevention/inspections-visuelles                             - Créer
- GET    /{tenant_slug}/prevention/inspections-visuelles                             - Liste
- GET    /{tenant_slug}/prevention/inspections-visuelles/a-valider                   - À valider
- GET    /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}              - Détail
- PUT    /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}              - Modifier
- DELETE /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}              - Supprimer
- POST   /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/soumettre   - Soumettre
- POST   /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/valider     - Valider
- POST   /{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/rejeter     - Rejeter
- POST   /{tenant_slug}/prevention/non-conformites-visuelles                         - Créer NC vis.
- GET    /{tenant_slug}/prevention/non-conformites-visuelles                         - Liste NC vis.
- PUT    /{tenant_slug}/prevention/non-conformites-visuelles/{nc_id}                 - Modifier NC vis.
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    user_has_module_action,
)

from routes.prevention_models import (
    InspectionVisuelle,
    InspectionVisuelleCreate,
    InspectionVisuelleUpdate,
    NonConformiteVisuelle,
    NonConformiteVisuelleCreate,
    PhotoInspection,
)

router = APIRouter(tags=["Prévention - Inspections visuelles"])
logger = logging.getLogger(__name__)


# ==================== INSPECTIONS VISUELLES (NOUVEAU SYSTÈME) ====================

@router.post("/{tenant_slug}/prevention/inspections-visuelles")
async def create_inspection_visuelle(
    tenant_slug: str,
    inspection: InspectionVisuelleCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection visuelle (pompiers + préventionnistes)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    batiment = await db.batiments.find_one({"id": inspection.batiment_id, "tenant_id": tenant.id})
    if not batiment:
        raise HTTPException(status_code=404, detail="Bâtiment non trouvé")
    
    inspection_dict = inspection.dict()
    inspection_dict["tenant_id"] = tenant.id
    
    inspection_obj = InspectionVisuelle(**inspection_dict)
    
    await db.inspections_visuelles.insert_one(inspection_obj.dict())
    
    return clean_mongo_doc(inspection_obj.dict())

@router.get("/{tenant_slug}/prevention/inspections-visuelles")
async def get_inspections_visuelles(
    tenant_slug: str,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer la liste des inspections visuelles avec filtres"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {"tenant_id": tenant.id}
    
    if batiment_id:
        query["batiment_id"] = batiment_id
    if statut:
        query["statut"] = statut
    if date_debut and date_fin:
        query["date_inspection"] = {"$gte": date_debut, "$lte": date_fin}
    
    inspections = await db.inspections_visuelles.find(query).sort("created_at", -1).to_list(length=None)
    
    return [clean_mongo_doc(insp) for insp in inspections]

@router.get("/{tenant_slug}/prevention/inspections-visuelles/a-valider")
async def get_inspections_a_valider(
    tenant_slug: str,
    secteur_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Liste des inspections en attente de validation."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    query = {
        "tenant_id": tenant.id,
        "statut": "en_attente_validation"
    }
    
    if secteur_id:
        batiments_secteur = await db.batiments.find(
            {"tenant_id": tenant.id, "secteur_id": secteur_id}
        ).to_list(1000)
        batiment_ids = [b.get("id") for b in batiments_secteur]
        query["batiment_id"] = {"$in": batiment_ids}
    
    inspections = await db.inspections_visuelles.find(query).sort("date_inspection", -1).to_list(100)
    
    result = []
    for insp in inspections:
        insp_clean = clean_mongo_doc(insp)
        
        batiment = await db.batiments.find_one({"id": insp.get("batiment_id"), "tenant_id": tenant.id})
        if batiment:
            insp_clean["batiment"] = {
                "id": batiment.get("id"),
                "nom_etablissement": batiment.get("nom_etablissement"),
                "adresse_civique": batiment.get("adresse_civique"),
                "ville": batiment.get("ville"),
                "secteur_id": batiment.get("secteur_id")
            }
        
        nb_nc = await db.non_conformites_visuelles.count_documents({
            "inspection_id": insp.get("id"),
            "tenant_id": tenant.id
        })
        insp_clean["nb_non_conformites"] = nb_nc
        
        result.append(insp_clean)
    
    return result

@router.get("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def get_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une inspection visuelle spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    inspection = await db.inspections_visuelles.find_one({"id": inspection_id, "tenant_id": tenant.id})
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    return clean_mongo_doc(inspection)

@router.put("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def update_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    inspection_update: InspectionVisuelleUpdate,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour une inspection visuelle (toujours modifiable)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    existing = await db.inspections_visuelles.find_one({"id": inspection_id, "tenant_id": tenant.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    update_dict = {k: v for k, v in inspection_update.dict(exclude_unset=True).items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc)
    
    if "heure_fin" in update_dict and existing.get("heure_debut"):
        try:
            debut = datetime.fromisoformat(f"{existing['date_inspection']}T{existing['heure_debut']}")
            fin = datetime.fromisoformat(f"{existing['date_inspection']}T{update_dict['heure_fin']}")
            update_dict["duree_minutes"] = int((fin - debut).total_seconds() / 60)
        except Exception:
            pass
    
    result = await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    updated = await db.inspections_visuelles.find_one({"id": inspection_id})
    return clean_mongo_doc(updated)

@router.delete("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}")
async def delete_inspection_visuelle(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une inspection visuelle (préventionnistes uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    can_delete = await user_has_module_action(tenant.id, current_user, "prevention", "supprimer", "inspections")
    if not can_delete and current_user.type_emploi != "preventionniste":
        raise HTTPException(status_code=403, detail="Seuls les préventionnistes peuvent supprimer des inspections")
    
    result = await db.inspections_visuelles.delete_one({"id": inspection_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    await db.non_conformites_visuelles.delete_many({"inspection_id": inspection_id, "tenant_id": tenant.id})
    
    return {"message": "Inspection supprimée avec succès"}


# ==================== WORKFLOW VALIDATION INSPECTION ====================

@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/soumettre")
async def soumettre_inspection_validation(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Soumettre une inspection pour validation par le préventionniste."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    if inspection.get("statut") not in ["en_cours", "brouillon"]:
        raise HTTPException(
            status_code=400,
            detail=f"L'inspection ne peut pas être soumise (statut actuel: {inspection.get('statut')})"
        )
    
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_attente_validation",
            "date_soumission": datetime.now(timezone.utc).isoformat(),
            "soumis_par_id": current_user.id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} soumise pour validation par {current_user.email}")
    
    updated = await db.inspections_visuelles.find_one({"id": inspection_id})
    return clean_mongo_doc(updated)


@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/valider")
async def valider_inspection(
    tenant_slug: str,
    inspection_id: str,
    commentaires: str = Body("", embed=True),
    current_user: User = Depends(get_current_user)
):
    """Valider une inspection. Réservé aux préventionnistes et admins."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    can_access = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if not can_access and not current_user.est_preventionniste:
        raise HTTPException(status_code=403, detail="Réservé aux préventionnistes")
    
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    non_conformites = await db.non_conformites_visuelles.find({
        "inspection_id": inspection_id,
        "tenant_id": tenant.id
    }).to_list(100)
    
    statut_conformite = "conforme" if len(non_conformites) == 0 else "non_conforme"
    
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "validee",
            "statut_conformite": statut_conformite,
            "validee_par_id": current_user.id,
            "date_validation": datetime.now(timezone.utc).isoformat(),
            "commentaires_validation": commentaires,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} validée par {current_user.email} - {len(non_conformites)} NC")
    
    return {
        "inspection_id": inspection_id,
        "statut": "validee",
        "statut_conformite": statut_conformite,
        "nb_non_conformites": len(non_conformites),
        "non_conformites": [clean_mongo_doc(nc) for nc in non_conformites],
        "avis_requis": len(non_conformites) > 0,
        "message": f"Inspection validée - {len(non_conformites)} non-conformité(s) détectée(s)"
    }


@router.post("/{tenant_slug}/prevention/inspections-visuelles/{inspection_id}/rejeter")
async def rejeter_inspection(
    tenant_slug: str,
    inspection_id: str,
    motif: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Rejeter une inspection et la renvoyer au pompier pour corrections."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    can_access = await user_has_module_action(tenant.id, current_user, "prevention", "modifier", "plans")
    if not can_access and not current_user.est_preventionniste:
        raise HTTPException(status_code=403, detail="Réservé aux préventionnistes")
    
    inspection = await db.inspections_visuelles.find_one({
        "id": inspection_id,
        "tenant_id": tenant.id
    })
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    await db.inspections_visuelles.update_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "en_cours",
            "rejete_par_id": current_user.id,
            "date_rejet": datetime.now(timezone.utc).isoformat(),
            "motif_rejet": motif,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"[INSPECTION] {inspection_id} rejetée par {current_user.email} - Motif: {motif}")
    
    return {
        "message": "Inspection rejetée",
        "motif": motif
    }


# ==================== NON-CONFORMITÉS VISUELLES ====================

@router.post("/{tenant_slug}/prevention/non-conformites-visuelles")
async def create_non_conformite_visuelle(
    tenant_slug: str,
    nc: NonConformiteVisuelleCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle non-conformité visuelle"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    nc_dict = nc.dict()
    nc_dict["tenant_id"] = tenant.id
    
    if nc_dict.get("delai_correction_jours"):
        inspection = await db.inspections_visuelles.find_one({"id": nc.inspection_id})
        if inspection:
            date_insp = datetime.fromisoformat(inspection["date_inspection"])
            date_limite = date_insp + timedelta(days=nc_dict["delai_correction_jours"])
            nc_dict["date_limite"] = date_limite.strftime("%Y-%m-%d")
    
    nc_obj = NonConformiteVisuelle(**nc_dict)
    
    await db.non_conformites_visuelles.insert_one(nc_obj.dict())
    
    await db.inspections_visuelles.update_one(
        {"id": nc.inspection_id, "tenant_id": tenant.id},
        {"$push": {"non_conformites_ids": nc_obj.id}}
    )
    
    return clean_mongo_doc(nc_obj.dict())

@router.get("/{tenant_slug}/prevention/non-conformites-visuelles")
async def get_non_conformites_visuelles(
    tenant_slug: str,
    inspection_id: Optional[str] = None,
    batiment_id: Optional[str] = None,
    statut: Optional[str] = None,
    gravite: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les non-conformités visuelles avec filtres"""
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
    if gravite:
        query["gravite"] = gravite
    
    ncs = await db.non_conformites_visuelles.find(query).sort("created_at", -1).to_list(length=None)
    
    return [clean_mongo_doc(nc) for nc in ncs]

@router.put("/{tenant_slug}/prevention/non-conformites-visuelles/{nc_id}")
async def update_non_conformite_visuelle(
    tenant_slug: str,
    nc_id: str,
    statut: Optional[str] = Body(None),
    photos_resolution: Optional[List[PhotoInspection]] = Body(None),
    notes_resolution: Optional[str] = Body(None),
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour le statut d'une non-conformité"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if not tenant.parametres.get('module_prevention_active', False):
        raise HTTPException(status_code=403, detail="Module prévention non activé")
    
    update_dict = {"updated_at": datetime.now(timezone.utc)}
    
    if statut:
        update_dict["statut"] = statut
        if statut == "resolue":
            update_dict["date_resolution"] = datetime.now(timezone.utc)
    
    if photos_resolution:
        update_dict["photos_resolution"] = [p.dict() for p in photos_resolution]
    
    if notes_resolution:
        update_dict["notes_resolution"] = notes_resolution
    
    result = await db.non_conformites_visuelles.update_one(
        {"id": nc_id, "tenant_id": tenant.id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Non-conformité non trouvée")
    
    updated = await db.non_conformites_visuelles.find_one({"id": nc_id})
    return clean_mongo_doc(updated)
