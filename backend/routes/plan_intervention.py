"""
Routes pour la gestion des plans d'intervention
Importation depuis PFM Transfer et affichage dans les fiches bâtiment
"""
import os
import logging
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from routes.dependencies import get_db, get_current_user, Tenant, get_tenant_from_slug, require_permission
from services.azure_storage import put_object, generate_sas_url, get_content_type

logger = logging.getLogger(__name__)
router = APIRouter()


class PlanInterventionPhoto(BaseModel):
    """Photo ou croquis du plan d'intervention"""
    id: str
    nom: str  # Ex: "SECT. 5", "Vue principale", "28.jpg"
    blob_name: Optional[str] = None
    url: Optional[str] = None  # URL SAS Azure
    date_creation: Optional[str] = None


class PlanInterventionPDF(BaseModel):
    """PDF du plan d'intervention complet"""
    nom: str
    blob_name: Optional[str] = None
    url: Optional[str] = None  # URL SAS Azure
    date_creation: Optional[str] = None


class PlanInterventionAcces(BaseModel):
    """Informations d'accès au bâtiment"""
    acces_principal: Optional[str] = None
    obstruction_echelle: Optional[str] = None
    porte_exterieur: Optional[str] = None


class PlanInterventionAlimentationEau(BaseModel):
    """Informations sur l'alimentation en eau"""
    debit_requis: Optional[str] = None  # GPM
    debit_disponible: Optional[str] = None  # GPM
    deficit_debit: Optional[str] = None  # Calculé
    superficie: Optional[str] = None  # m²
    type_construction: Optional[str] = None
    risque_danger: Optional[str] = None


class PlanInterventionConstruction(BaseModel):
    """Détails de construction"""
    mur_construction: Optional[str] = None
    plancher_construction: Optional[str] = None
    toit_construction: Optional[str] = None
    toit_couverture: Optional[str] = None
    usage_general: Optional[str] = None
    presence_entretoit: Optional[bool] = False


class PlanIntervention(BaseModel):
    """Modèle complet du plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: str
    batiment_id: str  # Lien vers dossiers_adresses
    
    # Identification
    nom: str  # Nom du bâtiment
    adresse_complete: Optional[str] = None
    proprietaire: Optional[str] = None
    type_occupation: Optional[str] = None
    
    # Construction et risques
    construction: Optional[PlanInterventionConstruction] = None
    niveau_risque: Optional[str] = None  # Faible, Moyen, Élevé
    
    # Accès
    acces: Optional[PlanInterventionAcces] = None
    
    # Alimentation en eau (CRITIQUE)
    alimentation_eau: Optional[PlanInterventionAlimentationEau] = None
    
    # Personnes nécessitant assistance
    personnes_assistance: Optional[str] = None  # OUI, NON, PROBABLE
    
    # Photos et croquis
    photos: list[PlanInterventionPhoto] = []
    
    # PDF du plan complet
    pdf_plan: Optional[PlanInterventionPDF] = None
    
    # Métadonnées PFM
    pfm_id: Optional[str] = None
    date_completee: Optional[str] = None
    date_creation: Optional[str] = None
    statut: Optional[str] = None  # Complété, En attente, etc.
    statut_rao: Optional[str] = None
    
    # Métadonnées système
    imported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    imported_by: Optional[str] = None
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlanInterventionImportRequest(BaseModel):
    """Requête d'import d'un plan d'intervention depuis PFM Transfer"""
    batiment_id: str  # ID du bâtiment dans dossiers_adresses
    pfm_data: dict  # JSON complet depuis PFM Transfer


@router.post("/{tenant_slug}/plan-intervention/import")
async def import_plan_intervention_from_pfm(
    tenant_slug: str,
    request: PlanInterventionImportRequest,
    current_user = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Importe un plan d'intervention depuis PFM Transfer.
    Parse le JSON, upload les photos/PDFs vers Azure, et stocke dans MongoDB.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "details")
    
    try:
        pfm = request.pfm_data
        
        # Vérifier que le bâtiment existe
        batiment = await db.dossiers_adresses.find_one(
            {"id": request.batiment_id, "tenant_id": tenant.id}
        )
        if not batiment:
            raise HTTPException(status_code=404, detail="Bâtiment introuvable")
        
        # Extraire les données PFM
        plan_adresse = pfm.get("plan_adresse_contact", {})
        plan_construction_data = pfm.get("plan_construction", {})
        plan_acces_data = pfm.get("plan_acces", {})
        plan_eau = pfm.get("plan_alimentation_eau", {})
        plan_securite = pfm.get("plan_securite", {})
        plan_croquis = pfm.get("plan_croquis", {})
        
        # Construction
        construction = PlanInterventionConstruction(
            mur_construction=plan_construction_data.get("mur_construction"),
            plancher_construction=plan_construction_data.get("plancher_construction"),
            toit_construction=plan_construction_data.get("toit_construction"),
            toit_couverture=plan_construction_data.get("toit_couverture"),
            usage_general=plan_construction_data.get("usage_general"),
            presence_entretoit=bool(
                plan_construction_data.get("vect_const_vide", {})
                .get("const_vide", {})
                .get("type") == "Entretoit"
            )
        )
        
        # Accès
        acces = PlanInterventionAcces(
            acces_principal=plan_acces_data.get("acces_principal"),
            obstruction_echelle=plan_acces_data.get("obstruction_echelle"),
            porte_exterieur=plan_acces_data.get("porte_exterieur"),
        )
        
        # Alimentation en eau
        bat_debit = (
            plan_eau.get("vect_bat_debit_necessaire", {})
            .get("bat_debit_necessaire", {})
        )
        alim_princ = plan_eau.get("vect_alim_princ", {}).get("alim_disp", {})
        
        debit_requis = bat_debit.get("debit_requis", "0")
        debit_disponible = alim_princ.get("debit", "0")
        
        # Calcul du déficit
        try:
            requis_num = float(debit_requis.replace(",", ".").replace(" GPM", "").strip())
            dispo_num = float(debit_disponible.replace(",", ".").replace(" GPM", "").strip())
            deficit = dispo_num - requis_num
            deficit_str = f"{deficit:.2f} GPM"
        except (ValueError, AttributeError):
            deficit_str = "N/A"
        
        alimentation_eau = PlanInterventionAlimentationEau(
            debit_requis=debit_requis,
            debit_disponible=debit_disponible,
            deficit_debit=deficit_str,
            superficie=bat_debit.get("superficie"),
            type_construction=bat_debit.get("type_construction"),
            risque_danger=bat_debit.get("risque_danger"),
        )
        
        # Photos et croquis (à uploader vers Azure)
        photos = []
        
        # Photo principale
        photo_fichier = pfm.get("photo_fichier", {}).get("piece_jointe", {})
        if photo_fichier and photo_fichier.get("nom"):
            photos.append(PlanInterventionPhoto(
                id=photo_fichier.get("id_fichier", str(uuid4())),
                nom=photo_fichier.get("nom", "Vue principale"),
                date_creation=photo_fichier.get("date_creation"),
            ))
        
        # Croquis sectoriels
        liste_croquis = (
            plan_croquis.get("plan_croquis", {})
            .get("liste_piece_jointe", {})
            .get("piece_jointe", [])
        )
        if isinstance(liste_croquis, dict):
            liste_croquis = [liste_croquis]
        
        for croquis in liste_croquis:
            if croquis.get("nom"):
                photos.append(PlanInterventionPhoto(
                    id=croquis.get("id_fichier", str(uuid4())),
                    nom=croquis.get("nom"),
                    date_creation=croquis.get("date_creation"),
                ))
        
        # PDF du plan (si disponible)
        pdf_plan = None
        dernier_plan_rao = pfm.get("dernier_plan_rao_nom")
        if dernier_plan_rao and dernier_plan_rao != "S/O":
            pdf_plan = PlanInterventionPDF(
                nom=dernier_plan_rao,
                date_creation=pfm.get("date_plan_last_envoi_au_rao"),
            )
        
        # Créer le plan d'intervention
        plan = PlanIntervention(
            tenant_id=tenant.id,
            batiment_id=request.batiment_id,
            nom=pfm.get("nom", ""),
            adresse_complete=plan_adresse.get("id_dossier_adresse"),
            proprietaire=plan_adresse.get("nom_prop_occup"),
            type_occupation=plan_adresse.get("type_occupation"),
            construction=construction,
            niveau_risque=alimentation_eau.risque_danger,
            acces=acces,
            alimentation_eau=alimentation_eau,
            personnes_assistance=plan_securite.get("personnes_necessitant_assistance"),
            photos=photos,
            pdf_plan=pdf_plan,
            pfm_id=pfm.get("id"),
            date_completee=pfm.get("date_completee"),
            date_creation=pfm.get("date_creation"),
            statut=pfm.get("statut"),
            statut_rao=pfm.get("statut_plan_rao"),
            imported_by=current_user.get("id"),
        )
        
        # Vérifier si un plan existe déjà pour ce bâtiment
        existing = await db.plans_intervention.find_one({
            "tenant_id": tenant.id,
            "batiment_id": request.batiment_id
        })
        
        if existing:
            # Mise à jour
            plan_dict = plan.dict(exclude={"id", "imported_at"})
            plan_dict["last_updated"] = datetime.now(timezone.utc)
            
            await db.plans_intervention.update_one(
                {"id": existing["id"]},
                {"$set": plan_dict}
            )
            plan_id = existing["id"]
            logger.info(f"Plan d'intervention mis à jour: {plan_id} pour bâtiment {request.batiment_id}")
        else:
            # Insertion
            await db.plans_intervention.insert_one(plan.dict())
            plan_id = plan.id
            logger.info(f"Nouveau plan d'intervention créé: {plan_id} pour bâtiment {request.batiment_id}")
        
        return {
            "success": True,
            "message": "Plan d'intervention importé avec succès",
            "plan_id": plan_id,
            "photos_count": len(photos),
            "pdf_available": pdf_plan is not None,
            "note": "Les photos et PDFs doivent être uploadés séparément via l'endpoint /upload-media"
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de l'import du plan d'intervention: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'import: {str(e)}")


@router.post("/{tenant_slug}/plan-intervention/{plan_id}/upload-media")
async def upload_plan_media(
    tenant_slug: str,
    plan_id: str,
    file: UploadFile = File(...),
    media_type: str = "photo",  # "photo" ou "pdf"
    media_id: Optional[str] = None,  # ID de la photo dans le plan
    current_user = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Upload une photo ou un PDF vers Azure et met à jour le plan d'intervention.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "modifier", "details")
    
    try:
        # Vérifier que le plan existe
        plan = await db.plans_intervention.find_one(
            {"id": plan_id, "tenant_id": tenant.id}
        )
        if not plan:
            raise HTTPException(status_code=404, detail="Plan d'intervention introuvable")
        
        # Lire le fichier
        file_data = await file.read()
        
        # Déterminer le content type
        filename = file.filename or "file"
        content_type = get_content_type(filename)
        
        # Générer le chemin Azure
        ext = filename.split(".")[-1] if "." in filename else "jpg"
        blob_path = f"profiremanager/{tenant.id}/plans-intervention/{plan_id}/{media_id or str(uuid4())}.{ext}"
        
        # Upload vers Azure
        result = put_object(blob_path, file_data, content_type)
        sas_url = generate_sas_url(blob_path)
        
        # Mettre à jour le plan dans MongoDB
        if media_type == "photo" and media_id:
            # Mettre à jour la photo spécifique
            await db.plans_intervention.update_one(
                {"id": plan_id, "photos.id": media_id},
                {
                    "$set": {
                        "photos.$.blob_name": blob_path,
                        "photos.$.url": sas_url,
                        "last_updated": datetime.now(timezone.utc)
                    }
                }
            )
        elif media_type == "pdf":
            # Mettre à jour le PDF
            await db.plans_intervention.update_one(
                {"id": plan_id},
                {
                    "$set": {
                        "pdf_plan.blob_name": blob_path,
                        "pdf_plan.url": sas_url,
                        "last_updated": datetime.now(timezone.utc)
                    }
                }
            )
        
        logger.info(f"Media uploadé pour plan {plan_id}: {blob_path}")
        
        return {
            "success": True,
            "blob_name": blob_path,
            "url": sas_url,
            "size": result.get("size")
        }
        
    except Exception as e:
        logger.error(f"Erreur lors de l'upload du media: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'upload: {str(e)}")


@router.get("/{tenant_slug}/plan-intervention/batiment/{batiment_id}")
async def get_plan_intervention_by_batiment(
    tenant_slug: str,
    batiment_id: str,
    current_user = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Récupère le plan d'intervention d'un bâtiment spécifique.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "voir", "details")
    
    plan = await db.plans_intervention.find_one(
        {"tenant_id": tenant.id, "batiment_id": batiment_id},
        {"_id": 0}
    )
    
    if not plan:
        return {"plan_disponible": False}
    
    # Régénérer les URLs SAS si nécessaire (expiration)
    for photo in plan.get("photos", []):
        if photo.get("blob_name"):
            photo["url"] = generate_sas_url(photo["blob_name"])
    
    if plan.get("pdf_plan") and plan["pdf_plan"].get("blob_name"):
        plan["pdf_plan"]["url"] = generate_sas_url(plan["pdf_plan"]["blob_name"])
    
    return {
        "plan_disponible": True,
        "plan": plan
    }


@router.delete("/{tenant_slug}/plan-intervention/{plan_id}")
async def delete_plan_intervention(
    tenant_slug: str,
    plan_id: str,
    current_user = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Supprime un plan d'intervention (soft delete).
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "batiments", "supprimer", "details")
    
    result = await db.plans_intervention.update_one(
        {"id": plan_id, "tenant_id": tenant.id},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc)}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Plan d'intervention introuvable")
    
    return {"success": True, "message": "Plan d'intervention supprimé"}
