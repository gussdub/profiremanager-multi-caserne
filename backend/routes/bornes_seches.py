"""
Routes API pour le module Bornes Sèches
=======================================

STATUT: ACTIF
Ce module gère les templates de bornes sèches, les inspections
et les modèles d'inspection personnalisables.

Routes Templates:
- GET    /{tenant_slug}/bornes-seches/templates                   - Liste des templates
- GET    /{tenant_slug}/bornes-seches/templates/{id}              - Détail d'un template
- POST   /{tenant_slug}/bornes-seches/templates                   - Créer un template
- PUT    /{tenant_slug}/bornes-seches/templates/{id}              - Modifier un template
- DELETE /{tenant_slug}/bornes-seches/templates/{id}              - Supprimer un template

Routes Inspections:
- POST   /{tenant_slug}/bornes-seches/inspections                 - Créer une inspection
- GET    /{tenant_slug}/bornes-seches/inspections                 - Liste des inspections
- GET    /{tenant_slug}/bornes-seches/inspections/{id}            - Détail d'une inspection

Routes Modèles d'inspection:
- GET    /{tenant_slug}/bornes-seches/modeles-inspection          - Liste des modèles
- GET    /{tenant_slug}/bornes-seches/modeles-inspection/actif    - Modèle actif
- GET    /{tenant_slug}/bornes-seches/modeles-inspection/{id}     - Détail d'un modèle
- POST   /{tenant_slug}/bornes-seches/modeles-inspection          - Créer un modèle
- PUT    /{tenant_slug}/bornes-seches/modeles-inspection/{id}     - Modifier un modèle
- DELETE /{tenant_slug}/bornes-seches/modeles-inspection/{id}     - Supprimer un modèle
- POST   /{tenant_slug}/bornes-seches/modeles-inspection/{id}/activer   - Activer un modèle
- POST   /{tenant_slug}/bornes-seches/modeles-inspection/{id}/dupliquer - Dupliquer un modèle

Routes Inspections personnalisées:
- POST   /{tenant_slug}/bornes-seches/inspections-personnalisees  - Créer une inspection
- GET    /{tenant_slug}/bornes-seches/inspections-personnalisees  - Liste des inspections
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional
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

router = APIRouter(tags=["Bornes Sèches"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class BorneSecheTemplateCreate(BaseModel):
    """Création d'un template de borne sèche"""
    numero_identification: str
    localisation: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    secteur_id: Optional[str] = None
    type_raccordement: Optional[str] = None
    diametre_conduite: Optional[str] = None
    pression_statique: Optional[str] = None
    notes: Optional[str] = None
    statut: str = "active"
    photos: List[str] = []


class BorneSecheTemplateUpdate(BaseModel):
    """Mise à jour d'un template de borne sèche"""
    numero_identification: Optional[str] = None
    localisation: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    secteur_id: Optional[str] = None
    type_raccordement: Optional[str] = None
    diametre_conduite: Optional[str] = None
    pression_statique: Optional[str] = None
    notes: Optional[str] = None
    statut: Optional[str] = None
    photos: Optional[List[str]] = None


class InspectionBorneSecheCreate(BaseModel):
    """Création d'une inspection de borne sèche"""
    template_id: str
    date_inspection: str
    inspecteur_nom: Optional[str] = None
    etat_general: str
    accessibilite: str
    signalisation: str
    capuchon_present: bool = True
    capuchon_etat: Optional[str] = None
    raccord_etat: Optional[str] = None
    obstruction: bool = False
    obstruction_details: Optional[str] = None
    vegetation_environnante: Optional[str] = None
    commentaire: Optional[str] = None
    matricule_pompier: Optional[str] = None
    photos_defauts: List[str] = []


class ItemInspectionBorneSeche(BaseModel):
    """Item d'inspection personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    type: str = "checkbox"
    obligatoire: bool = False
    options: List[str] = []


class SectionInspectionBorneSeche(BaseModel):
    """Section d'inspection personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    description: str = ""
    ordre: int = 0
    items: List[ItemInspectionBorneSeche] = []


class ModeleInspectionBorneSecheCreate(BaseModel):
    nom: str
    description: str = ""
    sections: List[SectionInspectionBorneSeche] = []


class ModeleInspectionBorneSecheUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    sections: Optional[List[SectionInspectionBorneSeche]] = None
    est_actif: Optional[bool] = None


# ==================== ROUTES TEMPLATES ====================

@router.get("/{tenant_slug}/bornes-seches/templates")
async def get_templates_bornes_seches(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les templates de bornes sèches"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    templates = await db.bornes_seches_templates.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return templates


@router.get("/{tenant_slug}/bornes-seches/templates/{template_id}")
async def get_template_borne_seche(
    tenant_slug: str,
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un template de borne sèche spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    template = await db.bornes_seches_templates.find_one(
        {"id": template_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not template:
        raise HTTPException(status_code=404, detail="Template de borne sèche non trouvé")
    
    return template


@router.post("/{tenant_slug}/bornes-seches/templates")
async def create_template_borne_seche(
    tenant_slug: str,
    template_data: BorneSecheTemplateCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau template de borne sèche (Admin/Superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    template_dict = template_data.dict()
    template_dict['id'] = str(uuid.uuid4())
    template_dict['tenant_id'] = tenant.id
    template_dict['created_by_id'] = current_user.id
    template_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    template_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.bornes_seches_templates.insert_one(template_dict)
    
    logger.info(f"🚰 Template borne sèche créé: {template_data.numero_identification} par {current_user.email}")
    
    return {"message": "Template de borne sèche créé avec succès", "id": template_dict['id']}


@router.put("/{tenant_slug}/bornes-seches/templates/{template_id}")
async def update_template_borne_seche(
    tenant_slug: str,
    template_id: str,
    template_data: BorneSecheTemplateUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un template de borne sèche (Admin/Superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    update_data = {k: v for k, v in template_data.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.bornes_seches_templates.update_one(
        {"id": template_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template de borne sèche non trouvé")
    
    return {"message": "Template de borne sèche mis à jour avec succès"}


@router.delete("/{tenant_slug}/bornes-seches/templates/{template_id}")
async def delete_template_borne_seche(
    tenant_slug: str,
    template_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un template de borne sèche (Admin/Superviseur)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin ou Superviseur requis")
    
    # Vérifier si des inspections utilisent ce template
    inspections_count = await db.inspections_bornes_seches.count_documents({
        "template_id": template_id,
        "tenant_id": tenant.id
    })
    
    if inspections_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossible de supprimer - {inspections_count} inspection(s) liée(s) à ce template"
        )
    
    result = await db.bornes_seches_templates.delete_one({
        "id": template_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template de borne sèche non trouvé")
    
    logger.info(f"🗑️ Template borne sèche supprimé: {template_id} par {current_user.email}")
    
    return {"message": "Template de borne sèche supprimé avec succès"}


# ==================== ROUTES INSPECTIONS ====================

@router.post("/{tenant_slug}/bornes-seches/inspections")
async def create_inspection_borne_seche(
    tenant_slug: str,
    inspection_data: InspectionBorneSecheCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection de borne sèche"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le template existe
    template = await db.bornes_seches_templates.find_one({
        "id": inspection_data.template_id,
        "tenant_id": tenant.id
    })
    
    if not template:
        raise HTTPException(status_code=404, detail="Template de borne sèche non trouvé")
    
    inspection_dict = inspection_data.dict()
    inspection_dict['id'] = str(uuid.uuid4())
    inspection_dict['tenant_id'] = tenant.id
    inspection_dict['inspecteur_id'] = current_user.id
    inspection_dict['inspecteur_nom'] = inspection_data.inspecteur_nom or f"{current_user.prenom} {current_user.nom}"
    inspection_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.inspections_bornes_seches.insert_one(inspection_dict)
    
    # Mettre à jour la date de dernière inspection sur le template
    await db.bornes_seches_templates.update_one(
        {"id": inspection_data.template_id, "tenant_id": tenant.id},
        {
            "$set": {
                "derniere_inspection_date": inspection_data.date_inspection,
                "derniere_inspection_id": inspection_dict['id'],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    logger.info(f"📋 Inspection borne sèche créée pour template {inspection_data.template_id} par {current_user.email}")
    
    return {"message": "Inspection enregistrée avec succès", "id": inspection_dict['id']}


@router.get("/{tenant_slug}/bornes-seches/inspections")
async def get_inspections_bornes_seches(
    tenant_slug: str,
    template_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les inspections de bornes sèches"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    filters = {"tenant_id": tenant.id}
    if template_id:
        filters["template_id"] = template_id
    
    inspections = await db.inspections_bornes_seches.find(
        filters,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=100)
    
    return inspections


@router.get("/{tenant_slug}/bornes-seches/inspections/{inspection_id}")
async def get_inspection_borne_seche(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une inspection spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspection = await db.inspections_bornes_seches.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    return inspection


# ==================== ROUTES MODÈLES D'INSPECTION ====================

@router.get("/{tenant_slug}/bornes-seches/modeles-inspection")
async def get_modeles_inspection_bornes_seches(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les modèles d'inspection de bornes sèches"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modeles = await db.modeles_inspection_bornes_seches.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)
    
    return modeles


@router.get("/{tenant_slug}/bornes-seches/modeles-inspection/actif")
async def get_modele_inspection_actif(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le modèle d'inspection actif"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele = await db.modeles_inspection_bornes_seches.find_one(
        {"tenant_id": tenant.id, "est_actif": True},
        {"_id": 0}
    )
    
    if not modele:
        # Retourner un modèle par défaut si aucun n'est actif
        modeles = await db.modeles_inspection_bornes_seches.find(
            {"tenant_id": tenant.id},
            {"_id": 0}
        ).to_list(length=1)
        
        if modeles:
            modele = modeles[0]
        else:
            return {
                "id": "default",
                "nom": "Formulaire standard",
                "description": "Formulaire d'inspection par défaut",
                "est_actif": True,
                "sections": [
                    {
                        "id": "section_1",
                        "nom": "État général",
                        "ordre": 1,
                        "items": [
                            {"id": "item_1", "nom": "Accessibilité", "type": "select", "options": ["Bon", "Moyen", "Mauvais"]},
                            {"id": "item_2", "nom": "Signalisation", "type": "select", "options": ["Présente", "Absente", "Détériorée"]},
                            {"id": "item_3", "nom": "Capuchon présent", "type": "checkbox", "options": []},
                        ]
                    }
                ]
            }
    
    return modele


@router.get("/{tenant_slug}/bornes-seches/modeles-inspection/{modele_id}")
async def get_modele_inspection_borne_seche(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un modèle d'inspection spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele = await db.modeles_inspection_bornes_seches.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inspection non trouvé")
    
    return modele


@router.post("/{tenant_slug}/bornes-seches/modeles-inspection")
async def create_modele_inspection_borne_seche(
    tenant_slug: str,
    modele_data: ModeleInspectionBorneSecheCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau modèle d'inspection (Admin/Superviseur uniquement)"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele_dict = modele_data.dict()
    modele_dict['id'] = str(uuid.uuid4())
    modele_dict['tenant_id'] = tenant.id
    modele_dict['est_actif'] = False
    modele_dict['created_by'] = current_user.id
    modele_dict['created_at'] = datetime.now(timezone.utc).isoformat()
    modele_dict['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Convertir les sections en dict si nécessaire
    if 'sections' in modele_dict:
        modele_dict['sections'] = [
            s.dict() if hasattr(s, 'dict') else s for s in modele_dict['sections']
        ]
    
    await db.modeles_inspection_bornes_seches.insert_one(modele_dict)
    
    logger.info(f"📝 Modèle d'inspection borne sèche créé: {modele_data.nom} par {current_user.email}")
    
    return {"message": "Modèle créé avec succès", "id": modele_dict['id']}


@router.put("/{tenant_slug}/bornes-seches/modeles-inspection/{modele_id}")
async def update_modele_inspection_borne_seche(
    tenant_slug: str,
    modele_id: str,
    modele_data: ModeleInspectionBorneSecheUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un modèle d'inspection (Admin/Superviseur uniquement)"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in modele_data.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Convertir les sections en dict si nécessaire
    if 'sections' in update_data and update_data['sections']:
        update_data['sections'] = [
            s.dict() if hasattr(s, 'dict') else s for s in update_data['sections']
        ]
    
    result = await db.modeles_inspection_bornes_seches.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle mis à jour avec succès"}


@router.delete("/{tenant_slug}/bornes-seches/modeles-inspection/{modele_id}")
async def delete_modele_inspection_borne_seche(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un modèle d'inspection (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé - Admin ou Superviseur requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que le modèle n'est pas actif
    modele = await db.modeles_inspection_bornes_seches.find_one({
        "id": modele_id, "tenant_id": tenant.id
    })
    
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    if modele.get("est_actif"):
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer le modèle actif. Activez d'abord un autre modèle."
        )
    
    await db.modeles_inspection_bornes_seches.delete_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    
    logger.info(f"🗑️ Modèle d'inspection supprimé: {modele_id} par {current_user.email}")
    
    return {"message": "Modèle supprimé avec succès"}


@router.post("/{tenant_slug}/bornes-seches/modeles-inspection/{modele_id}/activer")
async def activer_modele_inspection(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Activer un modèle d'inspection (désactive les autres)"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele = await db.modeles_inspection_bornes_seches.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    # Désactiver tous les autres modèles
    await db.modeles_inspection_bornes_seches.update_many(
        {"tenant_id": tenant.id},
        {"$set": {"est_actif": False}}
    )
    
    # Activer ce modèle
    await db.modeles_inspection_bornes_seches.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": {"est_actif": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    logger.info(f"✅ Modèle d'inspection activé: {modele_id} par {current_user.email}")
    
    return {"message": "Modèle activé avec succès"}


@router.post("/{tenant_slug}/bornes-seches/modeles-inspection/{modele_id}/dupliquer")
async def duplicate_modele_inspection_borne_seche(
    tenant_slug: str,
    modele_id: str,
    nouveau_nom: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Dupliquer un modèle d'inspection existant"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele_original = await db.modeles_inspection_bornes_seches.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    if not modele_original:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    nouveau_modele = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": nouveau_nom or f"{modele_original['nom']} (copie)",
        "description": modele_original.get("description", ""),
        "est_actif": False,
        "sections": modele_original.get("sections", []),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "copie_de": modele_id
    }
    
    await db.modeles_inspection_bornes_seches.insert_one(nouveau_modele)
    
    logger.info(f"📋 Modèle dupliqué: {nouveau_modele['nom']} par {current_user.email}")
    
    return {
        "message": "Modèle dupliqué avec succès",
        "id": nouveau_modele["id"],
        "nom": nouveau_modele["nom"]
    }


# ==================== ROUTES INSPECTIONS PERSONNALISÉES ====================

@router.post("/{tenant_slug}/bornes-seches/inspections-personnalisees")
async def create_inspection_personnalisee_borne_seche(
    tenant_slug: str,
    inspection_data: dict = Body(...),
    current_user: User = Depends(get_current_user)
):
    """Enregistrer une inspection de borne sèche avec formulaire personnalisable"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer la borne
    borne = await db.points_eau.find_one(
        {"id": inspection_data.get("borne_seche_id"), "tenant_id": tenant.id}
    )
    if not borne:
        raise HTTPException(status_code=404, detail="Borne sèche non trouvée")
    
    # Récupérer le modèle
    modele = await db.modeles_inspection_bornes_seches.find_one(
        {"id": inspection_data.get("modele_id"), "tenant_id": tenant.id}
    )
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inspection non trouvé")
    
    # Créer l'inspection
    inspection = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "borne_seche_id": borne["id"],
        "borne_nom": borne.get("nom") or borne.get("numero_identification"),
        "modele_id": modele["id"],
        "modele_nom": modele["nom"],
        "inspecteur_id": current_user.id,
        "inspecteur_nom": f"{current_user.prenom} {current_user.nom}",
        "date_inspection": datetime.now(timezone.utc).isoformat(),
        "reponses": inspection_data.get("reponses", []),
        "latitude": inspection_data.get("latitude"),
        "longitude": inspection_data.get("longitude"),
        "alertes": inspection_data.get("alertes", []),
        "has_anomalie": inspection_data.get("has_anomalie", False),
        "commentaire_anomalie": inspection_data.get("commentaire_anomalie", ""),
        "photos_anomalie": inspection_data.get("photos_anomalie", []),
        "signature_inspecteur": inspection_data.get("signature_inspecteur", ""),
        "statut": "anomalie" if inspection_data.get("has_anomalie") else "complete",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inspections_bornes_seches_personnalisees.insert_one(inspection)
    
    # Mettre à jour la borne sèche avec la dernière inspection
    update_borne = {
        "derniere_inspection_date": inspection["date_inspection"],
        "derniere_inspection_id": inspection["id"],
        "nombre_inspections": (borne.get("nombre_inspections") or 0) + 1
    }
    
    if inspection_data.get("has_anomalie"):
        update_borne["etat"] = "en_inspection"
        update_borne["statut_inspection"] = "anomalie"
    else:
        update_borne["etat"] = "fonctionnelle"
        update_borne["statut_inspection"] = "ok"
    
    await db.points_eau.update_one(
        {"id": borne["id"], "tenant_id": tenant.id},
        {"$set": update_borne}
    )
    
    logger.info(f"📋 Inspection personnalisée créée pour borne {borne.get('numero_identification')} par {current_user.email}")
    
    return {"message": "Inspection enregistrée avec succès", "id": inspection["id"]}


@router.get("/{tenant_slug}/bornes-seches/inspections-personnalisees")
async def get_inspections_personnalisees_bornes_seches(
    tenant_slug: str,
    borne_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les inspections personnalisées des bornes sèches"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    filters = {"tenant_id": tenant.id}
    if borne_id:
        filters["borne_seche_id"] = borne_id
    
    inspections = await db.inspections_bornes_seches_personnalisees.find(
        filters,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=100)
    
    return inspections
