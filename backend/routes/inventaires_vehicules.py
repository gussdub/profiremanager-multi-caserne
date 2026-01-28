"""
Routes API pour le module Inventaires Véhicules
===============================================

STATUT: ACTIF
Ce module gère les modèles d'inventaires et les inventaires effectués sur les véhicules.

Routes principales:
- GET    /{tenant_slug}/parametres/modeles-inventaires-vehicules           - Liste des modèles
- POST   /{tenant_slug}/parametres/modeles-inventaires-vehicules           - Créer un modèle
- PUT    /{tenant_slug}/parametres/modeles-inventaires-vehicules/{id}      - Modifier un modèle
- DELETE /{tenant_slug}/parametres/modeles-inventaires-vehicules/{id}      - Supprimer un modèle
- GET    /{tenant_slug}/vehicules/{id}/modele-inventaire                   - Modèle pour un véhicule
- POST   /{tenant_slug}/vehicules/{id}/inventaire                          - Effectuer un inventaire
- GET    /{tenant_slug}/vehicules/{id}/inventaires                         - Historique inventaires
- GET    /{tenant_slug}/vehicules/{id}/inventaires/{inv_id}                - Détails inventaire
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Any
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

router = APIRouter(tags=["Inventaires Véhicules"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES PYDANTIC ====================

class ItemInventaireVehicule(BaseModel):
    """Item individuel dans un modèle d'inventaire véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    photo_url: str = ""
    obligatoire: bool = False
    photo_requise: bool = False
    ordre: int = 0


class SectionInventaireVehicule(BaseModel):
    """Section dans un modèle d'inventaire véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    titre: str
    type_champ: str = "checkbox"
    options: List[dict] = []
    photo_url: str = ""
    items: List[ItemInventaireVehicule] = []
    ordre: int = 0


class ModeleInventaireVehicule(BaseModel):
    """Modèle d'inventaire pour un type de véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    type_vehicule: str
    description: str = ""
    sections: List[SectionInventaireVehicule] = []
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ModeleInventaireVehiculeCreate(BaseModel):
    nom: str
    type_vehicule: str
    description: str = ""
    sections: List[dict] = []


class ModeleInventaireVehiculeUpdate(BaseModel):
    nom: Optional[str] = None
    type_vehicule: Optional[str] = None
    description: Optional[str] = None
    sections: Optional[List[dict]] = None


class ItemInventaireVehiculeRempli(BaseModel):
    """Item rempli lors d'un inventaire"""
    item_id: str
    section: str
    nom: str
    type_champ: str
    valeur: Any
    notes: str = ""
    photo_prise: str = ""


class InventaireVehicule(BaseModel):
    """Inventaire hebdomadaire effectué sur un véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    vehicule_nom: str
    modele_id: str
    modele_nom: str
    date_inventaire: str
    effectue_par: str
    effectue_par_id: str
    items_coches: List[ItemInventaireVehiculeRempli] = []
    statut_global: str = "conforme"
    items_manquants: int = 0
    items_defectueux: int = 0
    notes_generales: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InventaireVehiculeCreate(BaseModel):
    vehicule_id: str
    vehicule_nom: str = ""
    modele_id: str
    date_inventaire: str
    heure_debut: str = ""
    heure_fin: str = ""
    effectue_par: str = ""
    effectue_par_id: str = ""
    items_coches: List[dict]
    notes_generales: str = ""
    alertes: List[dict] = []


# ==================== ROUTES API ====================

@router.get("/{tenant_slug}/parametres/modeles-inventaires-vehicules")
async def get_modeles_inventaires_vehicules(
    tenant_slug: str,
    type_vehicule: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les modèles d'inventaires véhicules"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if type_vehicule:
        query["type_vehicule"] = type_vehicule
    
    modeles = await db.modeles_inventaires_vehicules.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return modeles


@router.post("/{tenant_slug}/parametres/modeles-inventaires-vehicules")
async def create_modele_inventaire_vehicule(
    tenant_slug: str,
    modele: ModeleInventaireVehiculeCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un modèle d'inventaire véhicule (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    # Convertir les sections dict en objets
    sections_obj = []
    for section in modele.sections:
        items_obj = []
        for item in section.get('items', []):
            items_obj.append(ItemInventaireVehicule(
                nom=item['nom'],
                photo_url=item.get('photo_url', ''),
                obligatoire=item.get('obligatoire', False),
                photo_requise=item.get('photo_requise', False),
                ordre=item.get('ordre', 0)
            ))
        
        sections_obj.append(SectionInventaireVehicule(
            titre=section['titre'],
            type_champ=section.get('type_champ', 'checkbox'),
            options=section.get('options', []),
            photo_url=section.get('photo_url', ''),
            items=items_obj,
            ordre=section.get('ordre', 0)
        ))
    
    modele_obj = ModeleInventaireVehicule(
        tenant_id=tenant.id,
        nom=modele.nom,
        type_vehicule=modele.type_vehicule,
        description=modele.description,
        sections=sections_obj,
        created_by=current_user.id
    )
    
    await db.modeles_inventaires_vehicules.insert_one(modele_obj.dict())
    
    return {"message": "Modèle d'inventaire créé avec succès", "id": modele_obj.id}


@router.put("/{tenant_slug}/parametres/modeles-inventaires-vehicules/{modele_id}")
async def update_modele_inventaire_vehicule(
    tenant_slug: str,
    modele_id: str,
    modele: ModeleInventaireVehiculeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Modifier un modèle d'inventaire véhicule (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    update_data = {k: v for k, v in modele.dict().items() if v is not None}
    if not update_data:
        return {"message": "Aucune modification"}
    
    # Convertir sections si présentes
    if 'sections' in update_data:
        sections_obj = []
        for section in update_data['sections']:
            items_obj = []
            for item in section.get('items', []):
                items_obj.append(ItemInventaireVehicule(
                    nom=item['nom'],
                    photo_url=item.get('photo_url', ''),
                    obligatoire=item.get('obligatoire', False),
                    photo_requise=item.get('photo_requise', False),
                    ordre=item.get('ordre', 0)
                ))
            
            sections_obj.append(SectionInventaireVehicule(
                titre=section['titre'],
                type_champ=section.get('type_champ', 'checkbox'),
                options=section.get('options', []),
                photo_url=section.get('photo_url', ''),
                items=items_obj,
                ordre=section.get('ordre', 0)
            ))
        
        update_data['sections'] = [s.dict() for s in sections_obj]
    
    update_data['updated_at'] = datetime.now(timezone.utc)
    
    result = await db.modeles_inventaires_vehicules.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    return {"message": "Modèle d'inventaire mis à jour avec succès"}


@router.delete("/{tenant_slug}/parametres/modeles-inventaires-vehicules/{modele_id}")
async def delete_modele_inventaire_vehicule(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un modèle d'inventaire véhicule (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    result = await db.modeles_inventaires_vehicules.delete_one({
        "id": modele_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    return {"message": "Modèle d'inventaire supprimé avec succès"}


@router.get("/{tenant_slug}/vehicules/{vehicule_id}/modele-inventaire")
async def get_modele_inventaire_for_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le modèle d'inventaire pour un véhicule selon son type"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer le véhicule
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Chercher le modèle correspondant au type du véhicule
    modele = await db.modeles_inventaires_vehicules.find_one(
        {
            "tenant_id": tenant.id,
            "type_vehicule": vehicule.get('type', 'autopompe')
        },
        {"_id": 0}
    )
    
    if not modele:
        raise HTTPException(
            status_code=404,
            detail=f"Aucun modèle d'inventaire configuré pour ce type de véhicule ({vehicule.get('type', 'N/A')})"
        )
    
    return modele


@router.post("/{tenant_slug}/vehicules/{vehicule_id}/inventaire")
async def create_inventaire_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    inventaire: InventaireVehiculeCreate,
    current_user: User = Depends(get_current_user)
):
    """Effectuer un inventaire véhicule (tous les utilisateurs)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer le véhicule
    vehicule = await db.vehicules.find_one(
        {"id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not vehicule:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    
    # Récupérer le modèle
    modele = await db.modeles_inventaires_vehicules.find_one(
        {"id": inventaire.modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not modele:
        raise HTTPException(status_code=404, detail="Modèle d'inventaire non trouvé")
    
    # Convertir items cochés en objets
    items_coches_obj = []
    
    for item in inventaire.items_coches:
        items_coches_obj.append(ItemInventaireVehiculeRempli(
            item_id=item['item_id'],
            section=item.get('section', ''),
            nom=item['nom'],
            type_champ=item.get('type_champ', 'text'),
            valeur=item.get('valeur', ''),
            notes=item.get('notes', ''),
            photo_prise=item.get('photo_prise', '')
        ))
    
    # Déterminer statut global basé sur les alertes
    statut_global = "non_conforme" if (inventaire.alertes and len(inventaire.alertes) > 0) else "conforme"
    items_manquants = len([a for a in inventaire.alertes if 'absent' in str(a.get('valeur', '')).lower()]) if inventaire.alertes else 0
    items_defectueux = len([a for a in inventaire.alertes if 'défectueux' in str(a.get('valeur', '')).lower() or 'defectueux' in str(a.get('valeur', '')).lower()]) if inventaire.alertes else 0
    
    # Créer l'inventaire
    inventaire_obj = InventaireVehicule(
        tenant_id=tenant.id,
        vehicule_id=vehicule_id,
        vehicule_nom=vehicule.get('nom', 'N/A'),
        modele_id=inventaire.modele_id,
        modele_nom=modele['nom'],
        date_inventaire=inventaire.date_inventaire,
        effectue_par=f"{current_user.prenom} {current_user.nom}",
        effectue_par_id=current_user.id,
        items_coches=items_coches_obj,
        statut_global=statut_global,
        items_manquants=items_manquants,
        items_defectueux=items_defectueux,
        notes_generales=inventaire.notes_generales
    )
    
    await db.inventaires_vehicules.insert_one(inventaire_obj.dict())
    
    # Si des alertes existent, envoyer email de notification
    if inventaire.alertes and len(inventaire.alertes) > 0:
        # Récupérer les paramètres d'email depuis parametres.actifs
        parametres = tenant.parametres if hasattr(tenant, 'parametres') and tenant.parametres else {}
        actifs_params = parametres.get('actifs', {})
        user_ids_ou_emails = actifs_params.get('emails_notifications_inventaires_vehicules', [])
        
        logger.info(f"🔍 Alertes détectées ({len(inventaire.alertes)}), user_ids_ou_emails: {user_ids_ou_emails}")
        
        if user_ids_ou_emails:
            # Convertir user IDs en emails
            emails_notifications = []
            for item in user_ids_ou_emails:
                if '@' in str(item):
                    emails_notifications.append(item)
                else:
                    try:
                        user = await db.users.find_one(
                            {"id": item, "tenant_id": tenant.id},
                            {"_id": 0, "email": 1}
                        )
                        if user and user.get('email'):
                            emails_notifications.append(user['email'])
                    except Exception as e:
                        logger.error(f"❌ Erreur récupération user {item}: {e}")
            
            if emails_notifications:
                try:
                    from utils.emails import send_inventaire_vehicule_alertes_email
                    await send_inventaire_vehicule_alertes_email(
                        tenant_slug=tenant_slug,
                        vehicule=vehicule,
                        inventaire=inventaire.dict(),
                        alertes=inventaire.alertes,
                        emails=emails_notifications
                    )
                    logger.info(f"✅ Email d'alertes inventaire envoyé pour véhicule {vehicule_id} ({len(inventaire.alertes)} alertes)")
                except Exception as e:
                    logger.error(f"❌ Erreur envoi email inventaire véhicule: {e}")
    
    return {
        "message": "Inventaire enregistré avec succès",
        "id": inventaire_obj.id,
        "statut_global": statut_global,
        "items_manquants": items_manquants,
        "items_defectueux": items_defectueux
    }


@router.get("/{tenant_slug}/vehicules/{vehicule_id}/inventaires")
async def get_inventaires_vehicule(
    tenant_slug: str,
    vehicule_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inventaires d'un véhicule (admin/superviseur uniquement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin/Superviseur requis")
    
    inventaires = await db.inventaires_vehicules.find(
        {"vehicule_id": vehicule_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inventaire", -1).to_list(1000)
    
    return inventaires


@router.get("/{tenant_slug}/vehicules/{vehicule_id}/inventaires/{inventaire_id}")
async def get_inventaire_vehicule_details(
    tenant_slug: str,
    vehicule_id: str,
    inventaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les détails d'un inventaire spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inventaire = await db.inventaires_vehicules.find_one(
        {
            "id": inventaire_id,
            "vehicule_id": vehicule_id,
            "tenant_id": tenant.id
        },
        {"_id": 0}
    )
    
    if not inventaire:
        raise HTTPException(status_code=404, detail="Inventaire non trouvé")
    
    return inventaire
