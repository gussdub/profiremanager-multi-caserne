"""
Routes API pour le module Inspections APRIA
==========================================

Ce module gère les inspections d'Appareils de Protection Respiratoire Isolants Autonomes (APRIA) :
- Modèles d'inspection personnalisables
- Inspections mensuelles et après usage
- Alertes de non-conformité
- Historique des inspections
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import os

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["APRIA - Inspections"])
logger = logging.getLogger(__name__)


# Modèle pour les inspections APRIA
class InspectionAPRIACreate(BaseModel):
    equipement_id: str  # ID de l'équipement APRIA inspecté
    type_inspection: str = "mensuelle"  # "mensuelle" ou "apres_usage"
    inspecteur_id: str
    date_inspection: str
    # Éléments d'inspection (les 13 points)
    elements: dict = {}  # {"element_id": "conforme/non_conforme/na", ...}
    # Pression du cylindre
    pression_cylindre: Optional[int] = None
    # Résultat global
    conforme: bool = True
    # Remarques
    remarques: Optional[str] = None
    # Photos
    photos: Optional[List[str]] = []

# Modèle pour les paramètres APRIA
class ParametresAPRIA(BaseModel):
    contacts_alertes: List[str] = []  # Liste d'IDs d'utilisateurs à alerter
    pression_minimum: int = 4050  # Pression minimum PSI

# Endpoint pour récupérer les modèles d'inspection APRIA
@router.get("/{tenant_slug}/apria/modeles-inspection")
async def get_modeles_inspection_apria(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les modèles d'inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modeles = await db.modeles_inspection_apria.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return modeles

@router.get("/{tenant_slug}/apria/modeles-inspection/actif")
async def get_modele_inspection_apria_actif(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le modèle d'inspection actif pour les APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele = await db.modeles_inspection_apria.find_one(
        {"tenant_id": tenant.id, "est_actif": True},
        {"_id": 0}
    )
    
    if not modele:
        # Créer un modèle par défaut basé sur la photo fournie
        modele_defaut = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": "Inspection APRIA Standard",
            "description": "Modèle d'inspection par défaut pour les APRIA",
            "est_actif": True,
            "sections": [
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Vérifications visuelles",
                    "type_champ": "radio",
                    "options": [
                        {"label": "Conforme", "declencherAlerte": False},
                        {"label": "Non conforme", "declencherAlerte": True}
                    ],
                    "items": [
                        {"id": "item_1", "nom": "1. Sangle dorsale et boucles intactes", "ordre": 0},
                        {"id": "item_2", "nom": "2. Plastron et brides intacts", "ordre": 1},
                        {"id": "item_3", "nom": "3. Cylindre et robinet intacts", "ordre": 2},
                        {"id": "item_4", "nom": "4. Avertisseur de fin de service et purge", "ordre": 3},
                        {"id": "item_5", "nom": "5. Manomètre intact et lisible", "ordre": 4},
                        {"id": "item_6", "nom": "6. Détendeur moyenne pression et Tuyau MP", "ordre": 5},
                        {"id": "item_7", "nom": "7. Raccord rapide du masque et joint torique", "ordre": 6},
                        {"id": "item_8", "nom": "8. Ceinture (Sangle ventrale) et boucle", "ordre": 7},
                        {"id": "item_9", "nom": "9. Lunette intacte et propre (libre de dépôts)", "ordre": 8},
                        {"id": "item_10", "nom": "10. Serre-tête élastique en bonne condition", "ordre": 9},
                        {"id": "item_11", "nom": "11. Membrane vocale intacte", "ordre": 10},
                        {"id": "item_12", "nom": "12. Bord interne du masque intact (joint facial)", "ordre": 11},
                        {"id": "item_13", "nom": "13. Membrane d'inhalation et exhalation intactes", "ordre": 12}
                    ],
                    "ordre": 0
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Pression du cylindre",
                    "type_champ": "number",
                    "unite": "PSI",
                    "seuil_alerte": 4050,
                    "seuil_minimum": 4050,
                    "items": [],
                    "ordre": 1
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Résultat global",
                    "type_champ": "radio",
                    "options": [
                        {"label": "Conforme", "declencherAlerte": False},
                        {"label": "Non Conforme", "declencherAlerte": True}
                    ],
                    "items": [],
                    "ordre": 2
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Remarques",
                    "type_champ": "text",
                    "items": [],
                    "ordre": 3
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Photos",
                    "type_champ": "photo",
                    "items": [],
                    "ordre": 4
                }
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.modeles_inspection_apria.insert_one(modele_defaut)
        return modele_defaut
    
    return modele

@router.post("/{tenant_slug}/apria/modeles-inspection")
async def create_modele_inspection_apria(
    tenant_slug: str,
    modele_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau modèle d'inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    modele = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": modele_data.get("nom", "Nouveau modèle"),
        "description": modele_data.get("description", ""),
        "sections": modele_data.get("sections", []),
        "est_actif": modele_data.get("est_actif", False),
        "created_by_id": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.modeles_inspection_apria.insert_one(modele)
    
    return {"message": "Modèle créé avec succès", "id": modele["id"]}

@router.put("/{tenant_slug}/apria/modeles-inspection/{modele_id}")
async def update_modele_inspection_apria(
    tenant_slug: str,
    modele_id: str,
    modele_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un modèle d'inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    update_data = {k: v for k, v in modele_data.items() if k != 'id' and k != 'tenant_id'}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.modeles_inspection_apria.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle mis à jour avec succès"}

@router.delete("/{tenant_slug}/apria/modeles-inspection/{modele_id}")
async def delete_modele_inspection_apria(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un modèle d'inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Vérifier si le modèle est actif
    modele = await db.modeles_inspection_apria.find_one({"id": modele_id, "tenant_id": tenant.id})
    if modele and modele.get("est_actif"):
        raise HTTPException(status_code=400, detail="Impossible de supprimer un modèle actif")
    
    result = await db.modeles_inspection_apria.delete_one({"id": modele_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle supprimé avec succès"}

@router.post("/{tenant_slug}/apria/modeles-inspection/{modele_id}/activer")
async def activer_modele_inspection_apria(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Activer un modèle d'inspection APRIA (désactive les autres)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Désactiver tous les modèles
    await db.modeles_inspection_apria.update_many(
        {"tenant_id": tenant.id},
        {"$set": {"est_actif": False}}
    )
    
    # Activer le modèle sélectionné
    result = await db.modeles_inspection_apria.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": {"est_actif": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle activé avec succès"}

@router.post("/{tenant_slug}/apria/modeles-inspection/{modele_id}/dupliquer")
async def dupliquer_modele_inspection_apria(
    tenant_slug: str,
    modele_id: str,
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """Dupliquer un modèle d'inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Récupérer le modèle source
    modele_source = await db.modeles_inspection_apria.find_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not modele_source:
        raise HTTPException(status_code=404, detail="Modèle source non trouvé")
    
    # Créer une copie
    nouveau_modele = {
        **modele_source,
        "id": str(uuid.uuid4()),
        "nom": data.get("nouveau_nom", f"{modele_source['nom']} (copie)"),
        "est_actif": False,
        "created_by_id": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.modeles_inspection_apria.insert_one(nouveau_modele)
    
    return {"message": "Modèle dupliqué avec succès", "id": nouveau_modele["id"]}

# Endpoint pour récupérer les équipements APRIA
@router.get("/{tenant_slug}/apria/equipements")
async def get_equipements_apria(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les équipements APRIA de l'inventaire"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Chercher la catégorie APRIA
    categorie_apria = await db.categories_equipements.find_one(
        {"tenant_id": tenant.id, "nom": {"$regex": "APRIA", "$options": "i"}},
        {"_id": 0}
    )
    
    query = {"tenant_id": tenant.id}
    
    if categorie_apria:
        query["categorie_id"] = categorie_apria.get("id")
    else:
        # Chercher par nom contenant APRIA
        query["$or"] = [
            {"nom": {"$regex": "APRIA", "$options": "i"}},
            {"description": {"$regex": "APRIA", "$options": "i"}}
        ]
    
    equipements = await db.equipements.find(query, {"_id": 0}).to_list(length=None)
    
    # Enrichir avec les infos de dernière inspection
    for eq in equipements:
        derniere_inspection = await db.inspections_apria.find_one(
            {"equipement_id": eq["id"], "tenant_id": tenant.id},
            {"_id": 0},
            sort=[("date_inspection", -1)]
        )
        eq["derniere_inspection"] = derniere_inspection
    
    return equipements

# Endpoint pour créer une inspection APRIA
@router.post("/{tenant_slug}/apria/inspections")
async def create_inspection_apria(
    tenant_slug: str,
    inspection_data: InspectionAPRIACreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspection = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "equipement_id": inspection_data.equipement_id,
        "type_inspection": inspection_data.type_inspection,
        "inspecteur_id": inspection_data.inspecteur_id or current_user.id,
        "inspecteur_nom": current_user.prenom + " " + current_user.nom,
        "date_inspection": inspection_data.date_inspection,
        "elements": inspection_data.elements,
        "pression_cylindre": inspection_data.pression_cylindre,
        "conforme": inspection_data.conforme,
        "remarques": inspection_data.remarques,
        "photos": inspection_data.photos or [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inspections_apria.insert_one(inspection)
    
    # Si non conforme, marquer l'équipement comme hors service et envoyer alerte
    if not inspection_data.conforme:
        # Marquer l'équipement hors service
        await db.equipements.update_one(
            {"id": inspection_data.equipement_id, "tenant_id": tenant.id},
            {"$set": {"statut": "hors_service", "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        # TODO: Envoyer notification aux contacts configurés
    
    return {"message": "Inspection enregistrée avec succès", "id": inspection["id"]}

# Endpoint pour récupérer les inspections APRIA
@router.get("/{tenant_slug}/apria/inspections")
async def get_inspections_apria(
    tenant_slug: str,
    equipement_id: Optional[str] = None,
    inspecteur_id: Optional[str] = None,
    type_inspection: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les inspections APRIA avec filtres optionnels"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if equipement_id:
        query["equipement_id"] = equipement_id
    if inspecteur_id:
        query["inspecteur_id"] = inspecteur_id
    if type_inspection:
        query["type_inspection"] = type_inspection
    
    inspections = await db.inspections_apria.find(
        query, {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=None)
    
    return inspections

# Endpoint pour récupérer une inspection APRIA spécifique
@router.get("/{tenant_slug}/apria/inspections/{inspection_id}")
async def get_inspection_apria(
    tenant_slug: str,
    inspection_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer une inspection APRIA spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspection = await db.inspections_apria.find_one(
        {"id": inspection_id, "tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection non trouvée")
    
    return inspection

# Endpoint pour les paramètres APRIA
@router.get("/{tenant_slug}/apria/parametres")
async def get_parametres_apria(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les paramètres du module APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    parametres = await db.parametres_apria.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0}
    )
    
    if not parametres:
        # Créer des paramètres par défaut
        parametres = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "contacts_alertes": [],
            "pression_minimum": 4050,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.parametres_apria.insert_one(parametres)
    
    return parametres

@router.put("/{tenant_slug}/apria/parametres")
async def update_parametres_apria(
    tenant_slug: str,
    parametres_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour les paramètres du module APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    update_data = {k: v for k, v in parametres_data.items() if k not in ['id', 'tenant_id']}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    result = await db.parametres_apria.update_one(
        {"tenant_id": tenant.id},
        {"$set": update_data},
        upsert=True
    )
    
    return {"message": "Paramètres mis à jour avec succès"}

# Endpoint pour récupérer l'historique des inspections d'un équipement
@router.get("/{tenant_slug}/apria/equipements/{equipement_id}/historique")
async def get_historique_inspections_apria(
    tenant_slug: str,
    equipement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections d'un équipement APRIA"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_apria.find(
        {"equipement_id": equipement_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=None)
    
    return inspections

# ==================== MODULE INSPECTIONS PIÈCES FACIALES ====================

@router.get("/{tenant_slug}/parties-faciales/modeles-inspection")
async def get_modeles_inspection_parties_faciales(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les modèles d'inspection des parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modeles = await db.modeles_inspection_parties_faciales.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    return modeles

@router.get("/{tenant_slug}/parties-faciales/modeles-inspection/actif")
async def get_modele_inspection_parties_faciales_actif(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer le modèle d'inspection actif pour les parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    modele = await db.modeles_inspection_parties_faciales.find_one(
        {"tenant_id": tenant.id, "est_actif": True},
        {"_id": 0}
    )
    
    if not modele:
        # Créer un modèle par défaut
        modele_defaut = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": "Inspection Partie Faciale Standard",
            "description": "Modèle d'inspection par défaut pour les parties faciales",
            "est_actif": True,
            "frequence": "mensuelle",  # mensuelle, apres_usage, les_deux
            "sections": [
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Inspection visuelle du masque",
                    "icone": "🎭",
                    "type_champ": "radio",
                    "options": [
                        {"label": "Conforme", "declencherAlerte": False},
                        {"label": "Non conforme", "declencherAlerte": True}
                    ],
                    "items": [
                        {"id": "pf_1", "nom": "Masque complet - état général", "ordre": 0},
                        {"id": "pf_2", "nom": "Écran de vision - propreté et intégrité", "ordre": 1},
                        {"id": "pf_3", "nom": "Joint d'étanchéité facial", "ordre": 2},
                        {"id": "pf_4", "nom": "Sangles/harnais de fixation", "ordre": 3},
                        {"id": "pf_5", "nom": "Valve d'expiration", "ordre": 4},
                        {"id": "pf_6", "nom": "Valve d'inhalation", "ordre": 5},
                        {"id": "pf_7", "nom": "Membrane vocale", "ordre": 6},
                        {"id": "pf_8", "nom": "Raccord rapide", "ordre": 7}
                    ],
                    "ordre": 0
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Test d'étanchéité",
                    "icone": "💨",
                    "type_champ": "radio",
                    "options": [
                        {"label": "Réussi", "declencherAlerte": False},
                        {"label": "Échoué", "declencherAlerte": True}
                    ],
                    "items": [
                        {"id": "pf_test_1", "nom": "Test pression positive", "ordre": 0},
                        {"id": "pf_test_2", "nom": "Test pression négative", "ordre": 1}
                    ],
                    "ordre": 1
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Résultat global",
                    "icone": "✅",
                    "type_champ": "radio",
                    "options": [
                        {"label": "Conforme", "declencherAlerte": False},
                        {"label": "Non Conforme", "declencherAlerte": True}
                    ],
                    "items": [],
                    "ordre": 2
                },
                {
                    "id": str(uuid.uuid4()),
                    "titre": "Remarques",
                    "icone": "📝",
                    "type_champ": "text",
                    "items": [],
                    "ordre": 3
                }
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.modeles_inspection_parties_faciales.insert_one(modele_defaut)
        return modele_defaut
    
    return modele

@router.post("/{tenant_slug}/parties-faciales/modeles-inspection")
async def create_modele_inspection_parties_faciales(
    tenant_slug: str,
    modele_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau modèle d'inspection pour les parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    modele = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": modele_data.get("nom", "Nouveau modèle"),
        "description": modele_data.get("description", ""),
        "est_actif": modele_data.get("est_actif", False),
        "frequence": modele_data.get("frequence", "mensuelle"),
        "sections": modele_data.get("sections", []),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.modeles_inspection_parties_faciales.insert_one(modele)
    return modele

@router.put("/{tenant_slug}/parties-faciales/modeles-inspection/{modele_id}")
async def update_modele_inspection_parties_faciales(
    tenant_slug: str,
    modele_id: str,
    modele_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un modèle d'inspection des parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    existing = await db.modeles_inspection_parties_faciales.find_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    update_data = {k: v for k, v in modele_data.items() if k not in ['id', 'tenant_id', 'created_at']}
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Si on active ce modèle, désactiver les autres
    if update_data.get('est_actif'):
        await db.modeles_inspection_parties_faciales.update_many(
            {"tenant_id": tenant.id, "id": {"$ne": modele_id}},
            {"$set": {"est_actif": False}}
        )
    
    await db.modeles_inspection_parties_faciales.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    return {"message": "Modèle mis à jour", "id": modele_id}

@router.delete("/{tenant_slug}/parties-faciales/modeles-inspection/{modele_id}")
async def delete_modele_inspection_parties_faciales(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un modèle d'inspection des parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin']:
        raise HTTPException(status_code=403, detail="Permission refusée - Admin uniquement")
    
    result = await db.modeles_inspection_parties_faciales.delete_one(
        {"id": modele_id, "tenant_id": tenant.id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle supprimé"}

@router.post("/{tenant_slug}/parties-faciales/modeles-inspection/{modele_id}/activer")
async def activer_modele_inspection_parties_faciales(
    tenant_slug: str,
    modele_id: str,
    current_user: User = Depends(get_current_user)
):
    """Activer un modèle d'inspection (désactive les autres)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superviseur']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Désactiver tous les modèles
    await db.modeles_inspection_parties_faciales.update_many(
        {"tenant_id": tenant.id},
        {"$set": {"est_actif": False}}
    )
    
    # Activer le modèle sélectionné
    result = await db.modeles_inspection_parties_faciales.update_one(
        {"id": modele_id, "tenant_id": tenant.id},
        {"$set": {"est_actif": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    
    return {"message": "Modèle activé", "id": modele_id}

# Inspections des parties faciales (enregistrement)
@router.post("/{tenant_slug}/parties-faciales/inspections")
async def create_inspection_piece_faciale(
    tenant_slug: str,
    inspection_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer une nouvelle inspection de partie faciale"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspection = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "equipement_id": inspection_data.get("equipement_id"),
        "equipement_nom": inspection_data.get("equipement_nom", ""),
        "type_inspection": inspection_data.get("type_inspection", "mensuelle"),
        "modele_utilise_id": inspection_data.get("modele_utilise_id"),
        "reponses": inspection_data.get("reponses", {}),
        "conforme": inspection_data.get("conforme", True),
        "remarques": inspection_data.get("remarques", ""),
        "photos": inspection_data.get("photos", []),
        "inspecteur_id": current_user.id,
        "inspecteur_nom": f"{current_user.prenom} {current_user.nom}",
        "date_inspection": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inspections_parties_faciales.insert_one(inspection)
    
    # Si non conforme, créer automatiquement une demande de remplacement si demandé
    if not inspection_data.get("conforme") and inspection_data.get("creer_demande_remplacement"):
        demande = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "equipement_id": inspection_data.get("equipement_id"),
            "equipement_nom": inspection_data.get("equipement_nom"),
            "type": "remplacement",
            "raison": "Non conforme lors de l'inspection",
            "details": inspection_data.get("remarques", ""),
            "statut": "en_attente",
            "demandeur_id": current_user.id,
            "demandeur_nom": f"{current_user.prenom} {current_user.nom}",
            "inspection_id": inspection["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.demandes_remplacement_equipements.insert_one(demande)
        logger.info(f"Demande de remplacement créée automatiquement pour {inspection_data.get('equipement_nom')}")
    
    # Retourner l'inspection sans le _id MongoDB
    inspection.pop("_id", None)
    return inspection

@router.get("/{tenant_slug}/parties-faciales/inspections")
async def get_inspections_parties_faciales(
    tenant_slug: str,
    equipement_id: str = None,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les inspections des parties faciales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if equipement_id:
        query["equipement_id"] = equipement_id
    
    inspections = await db.inspections_parties_faciales.find(
        query,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(length=100)
    
    return inspections

# Endpoint pour récupérer les équipements assignés à un utilisateur
@router.get("/{tenant_slug}/mes-equipements")
async def get_mes_equipements(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les équipements assignés à l'utilisateur courant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les équipements du module Matériel assignés à l'utilisateur
    equipements = await db.equipements.find(
        {
            "tenant_id": tenant.id, 
            "employe_id": current_user.id
        },
        {"_id": 0}
    ).to_list(length=None)
    
    # Récupérer aussi les EPI assignés à l'utilisateur
    epis = await db.epis.find(
        {
            "tenant_id": tenant.id,
            "$or": [
                {"user_id": current_user.id},
                {"employe_id": current_user.id}
            ]
        },
        {"_id": 0}
    ).to_list(length=None)
    
    return {
        "equipements": equipements,
        "epis": epis,
        "total": len(equipements) + len(epis)
    }

@router.post("/{tenant_slug}/equipements/{equipement_id}/demander-remplacement")
async def demander_remplacement_equipement(
    tenant_slug: str,
    equipement_id: str,
    demande_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer une demande de remplacement pour un équipement assigné"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'équipement existe et est assigné à l'utilisateur
    equipement = await db.equipements.find_one({
        "id": equipement_id,
        "tenant_id": tenant.id,
        "employe_id": current_user.id
    })
    
    if not equipement:
        raise HTTPException(status_code=404, detail="Équipement non trouvé ou non assigné à vous")
    
    # Vérifier s'il y a déjà une demande en attente
    demande_existante = await db.demandes_remplacement_equipements.find_one({
        "equipement_id": equipement_id,
        "statut": "en_attente",
        "tenant_id": tenant.id
    })
    
    if demande_existante:
        raise HTTPException(status_code=400, detail="Une demande de remplacement est déjà en attente pour cet équipement")
    
    demande = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "equipement_id": equipement_id,
        "equipement_nom": equipement.get("nom", "Équipement"),
        "code_unique": equipement.get("code_unique", ""),
        "type": "remplacement",
        "raison": demande_data.get("raison", ""),
        "details": demande_data.get("notes_employe", ""),
        "statut": "en_attente",
        "demandeur_id": current_user.id,
        "demandeur_nom": f"{current_user.prenom} {current_user.nom}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.demandes_remplacement_equipements.insert_one(demande)
    logger.info(f"Demande de remplacement créée pour équipement {equipement.get('nom')} par {current_user.email}")
    
    return {"message": "Demande de remplacement envoyée", "demande_id": demande["id"]}

# ==================== FIN MODULE PIÈCES FACIALES ====================

# ==================== MODULE FORMULAIRES D'INSPECTION UNIFIÉS ====================

@router.get("/{tenant_slug}/formulaires-inspection")
async def get_formulaires_inspection(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer tous les formulaires d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formulaires = await db.formulaires_inspection.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return formulaires

@router.get("/{tenant_slug}/formulaires-inspection/{formulaire_id}")
async def get_formulaire_inspection(
    tenant_slug: str,
    formulaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer un formulaire d'inspection spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formulaire = await db.formulaires_inspection.find_one(
        {"tenant_id": tenant.id, "id": formulaire_id},
        {"_id": 0}
    )
    
    if not formulaire:
        raise HTTPException(status_code=404, detail="Formulaire non trouvé")
    
    return formulaire

@router.post("/{tenant_slug}/formulaires-inspection")
async def create_formulaire_inspection(
    tenant_slug: str,
    formulaire_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouveau formulaire d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions (admin seulement)
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    formulaire = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": formulaire_data.get("nom", "Nouveau formulaire"),
        "description": formulaire_data.get("description", ""),
        "type": formulaire_data.get("type", "inspection"),  # inspection, inventaire
        "categorie_ids": formulaire_data.get("categorie_ids", []),
        "frequence": formulaire_data.get("frequence", "mensuelle"),
        "est_actif": formulaire_data.get("est_actif", True),
        "sections": formulaire_data.get("sections", []),
        "vehicule_ids": formulaire_data.get("vehicule_ids", []),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.formulaires_inspection.insert_one(formulaire)
    formulaire.pop("_id", None)
    
    logger.info(f"Formulaire d'inspection '{formulaire['nom']}' créé par {current_user.email}")
    return {"message": "Formulaire créé avec succès", "formulaire": formulaire}

@router.put("/{tenant_slug}/formulaires-inspection/{formulaire_id}")
async def update_formulaire_inspection(
    tenant_slug: str,
    formulaire_id: str,
    formulaire_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Mettre à jour un formulaire d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    formulaire = await db.formulaires_inspection.find_one(
        {"tenant_id": tenant.id, "id": formulaire_id}
    )
    
    if not formulaire:
        raise HTTPException(status_code=404, detail="Formulaire non trouvé")
    
    update_data = {
        "nom": formulaire_data.get("nom", formulaire.get("nom")),
        "description": formulaire_data.get("description", formulaire.get("description")),
        "type": formulaire_data.get("type", formulaire.get("type")),
        "categorie_ids": formulaire_data.get("categorie_ids", formulaire.get("categorie_ids")),
        "vehicule_ids": formulaire_data.get("vehicule_ids", formulaire.get("vehicule_ids", [])),
        "frequence": formulaire_data.get("frequence", formulaire.get("frequence")),
        "est_actif": formulaire_data.get("est_actif", formulaire.get("est_actif")),
        "sections": formulaire_data.get("sections", formulaire.get("sections")),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.formulaires_inspection.update_one(
        {"tenant_id": tenant.id, "id": formulaire_id},
        {"$set": update_data}
    )
    
    updated = await db.formulaires_inspection.find_one(
        {"tenant_id": tenant.id, "id": formulaire_id},
        {"_id": 0}
    )
    
    logger.info(f"Formulaire '{formulaire_id}' mis à jour par {current_user.email}")
    return {"message": "Formulaire mis à jour avec succès", "formulaire": updated}

@router.delete("/{tenant_slug}/formulaires-inspection/{formulaire_id}")
async def delete_formulaire_inspection(
    tenant_slug: str,
    formulaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer un formulaire d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    result = await db.formulaires_inspection.delete_one(
        {"tenant_id": tenant.id, "id": formulaire_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formulaire non trouvé")
    
    logger.info(f"Formulaire '{formulaire_id}' supprimé par {current_user.email}")
    return {"message": "Formulaire supprimé avec succès"}

@router.post("/{tenant_slug}/formulaires-inspection/{formulaire_id}/dupliquer")
async def dupliquer_formulaire_inspection(
    tenant_slug: str,
    formulaire_id: str,
    current_user: User = Depends(get_current_user)
):
    """Dupliquer un formulaire d'inspection"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    original = await db.formulaires_inspection.find_one(
        {"tenant_id": tenant.id, "id": formulaire_id}
    )
    
    if not original:
        raise HTTPException(status_code=404, detail="Formulaire non trouvé")
    
    # Créer une copie avec un nouveau nom et ID
    copie = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "nom": f"Copie de {original['nom']}",
        "description": original.get("description", ""),
        "type": original.get("type", "inspection"),
        "categorie_ids": original.get("categorie_ids", []),
        "frequence": original.get("frequence", "mensuelle"),
        "est_actif": False,  # Désactivé par défaut pour éviter les conflits
        "sections": original.get("sections", []),
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.formulaires_inspection.insert_one(copie)
    copie.pop("_id", None)
    
    logger.info(f"Formulaire '{original['nom']}' dupliqué par {current_user.email}")
    return {"message": "Formulaire dupliqué avec succès", "formulaire": copie}

@router.get("/{tenant_slug}/formulaires-inspection/categorie/{categorie_id}")
async def get_formulaires_par_categorie(
    tenant_slug: str,
    categorie_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les formulaires d'inspection pour une catégorie donnée"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formulaires = await db.formulaires_inspection.find(
        {
            "tenant_id": tenant.id,
            "est_actif": True,
            "categorie_ids": categorie_id
        },
        {"_id": 0}
    ).to_list(100)
    
    return formulaires

@router.post("/{tenant_slug}/inspections-unifiees")
async def create_inspection_unifiee(
    tenant_slug: str,
    inspection_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Créer une inspection/inventaire en utilisant le système de formulaires unifiés
    
    Supporte plusieurs types d'assets:
    - equipement (EPI, matériel)
    - vehicule (inventaires de véhicules)
    - borne_seche (inspections de bornes sèches)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Support pour l'ancien format (equipement_id) et le nouveau format (asset_id/asset_type)
    asset_id = inspection_data.get("asset_id") or inspection_data.get("equipement_id")
    asset_type = inspection_data.get("asset_type", "equipement")
    
    # Récupérer le nom de l'asset selon son type
    asset_nom = inspection_data.get("metadata", {}).get("vehicule_nom") or \
                inspection_data.get("metadata", {}).get("borne_nom") or \
                inspection_data.get("metadata", {}).get("epi_nom") or \
                inspection_data.get("equipement_nom", "")
    
    # Si le nom n'est pas fourni, essayer de le récupérer depuis la DB
    if not asset_nom and asset_id:
        if asset_type == "epi":
            epi = await db.epi_employes.find_one({"id": asset_id}, {"_id": 0})
            if epi:
                asset_nom = f"{epi.get('type_epi', 'EPI')} - {epi.get('numero_serie', asset_id[:8])}"
        elif asset_type == "equipement":
            equip = await db.equipements.find_one({"id": asset_id}, {"_id": 0})
            if equip:
                asset_nom = equip.get('nom', asset_id[:8])
    
    # Extraire la date d'inspection depuis les réponses du formulaire si présente
    date_inspection = None
    reponses = inspection_data.get("reponses", {})
    for item_id, data in reponses.items():
        valeur = data.get("valeur") if isinstance(data, dict) else data
        # Vérifier si c'est une date (format YYYY-MM-DD ou ISO)
        if isinstance(valeur, str) and len(valeur) >= 10:
            try:
                # Essayer de parser comme date
                if valeur[4] == '-' and valeur[7] == '-':
                    date_inspection = valeur
                    break
            except (IndexError, TypeError):
                pass
    
    # Si pas de date trouvée dans le formulaire, utiliser la date actuelle
    if not date_inspection:
        date_inspection = datetime.now(timezone.utc).isoformat()
    
    inspection = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant.id,
        "asset_id": asset_id,
        "asset_type": asset_type,
        # Compatibilité avec l'ancien format
        "equipement_id": asset_id if asset_type == "equipement" else None,
        "epi_id": asset_id if asset_type == "epi" else None,
        "equipement_nom": asset_nom,
        "formulaire_id": inspection_data.get("formulaire_id"),
        "formulaire_nom": inspection_data.get("formulaire_nom", ""),
        "type_inspection": inspection_data.get("type_inspection", "inspection"),
        "reponses": reponses,
        "conforme": inspection_data.get("conforme", True),
        "remarques": inspection_data.get("remarques", "") or inspection_data.get("notes_generales", ""),
        "alertes": inspection_data.get("alertes", []),
        "metadata": inspection_data.get("metadata", {}),
        "inspecteur_id": inspection_data.get("user_id") or current_user.id,
        "inspecteur_nom": f"{current_user.prenom} {current_user.nom}",
        "date_inspection": date_inspection,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.inspections_unifiees.insert_one(inspection)
    
    # Si non conforme et demande de remplacement activée (pour équipements et EPI)
    if asset_type in ["equipement", "epi"] and not inspection_data.get("conforme") and inspection_data.get("creer_demande_remplacement"):
        demande = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "equipement_id": asset_id if asset_type == "equipement" else None,
            "epi_id": asset_id if asset_type == "epi" else None,
            "equipement_nom": asset_nom,
            "type": "remplacement",
            "raison": "Non conforme lors de l'inspection",
            "details": inspection_data.get("remarques", ""),
            "statut": "en_attente",
            "demandeur_id": current_user.id,
            "demandeur_nom": f"{current_user.prenom} {current_user.nom}",
            "inspection_id": inspection["id"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Utiliser la bonne collection selon le type
        if asset_type == "epi":
            await db.demandes_remplacement_epi.insert_one(demande)
        else:
            await db.demandes_remplacement_equipements.insert_one(demande)
        logger.info(f"Demande de remplacement créée pour {asset_type} {asset_nom}")
    
    # Envoyer des notifications et emails si des alertes sont détectées
    alertes = inspection_data.get("alertes", [])
    logger.info(f"🔍 Vérification alertes pour {asset_type} {asset_nom}: {len(alertes)} alerte(s)")
    
    if alertes:
        logger.warning(f"⚠️ {len(alertes)} alerte(s) détectée(s) pour {asset_type} {asset_nom}")
        
        # Construire le message d'alerte
        alertes_messages = []
        for alerte in alertes:
            if isinstance(alerte, dict):
                alertes_messages.append(alerte.get("message", str(alerte)))
            else:
                alertes_messages.append(str(alerte))
        
        alerte_texte = "\n".join([f"• {msg}" for msg in alertes_messages])
        logger.info(f"📝 Messages d'alerte construits: {alertes_messages}")
        
        # Récupérer les destinataires configurés selon le type d'asset
        # Pour les bornes sèches, utiliser la liste configurée dans les paramètres
        tenant_data = await db.tenants.find_one({"id": tenant.id}, {"_id": 0})
        parametres = tenant_data.get("parametres", {}) if tenant_data else {}
        actifs_params = parametres.get("actifs", {})
        
        destinataires_ids = []
        if asset_type == "borne_seche":
            # Utiliser les destinataires configurés pour les bornes sèches
            destinataires_ids = actifs_params.get("emails_notifications_bornes_seches", [])
            logger.info(f"📋 Destinataires configurés pour bornes sèches: {destinataires_ids}")
        elif asset_type == "vehicule":
            # Utiliser les destinataires configurés pour les véhicules
            destinataires_ids = actifs_params.get("emails_notifications_vehicules", [])
            logger.info(f"📋 Destinataires configurés pour véhicules: {destinataires_ids}")
        
        # Si aucun destinataire configuré, fallback sur les admins/superviseurs
        if destinataires_ids:
            destinataires = await db.users.find({
                "tenant_id": tenant.id,
                "id": {"$in": destinataires_ids},
                "statut": "Actif"
            }, {"_id": 0}).to_list(100)
            logger.info(f"👥 Destinataires configurés trouvés: {len(destinataires)}")
        else:
            # Fallback: tous les admins/superviseurs
            destinataires = await db.users.find({
                "tenant_id": tenant.id,
                "role": {"$in": ["admin", "superviseur"]},
                "statut": "Actif"
            }, {"_id": 0}).to_list(100)
            logger.info(f"👥 Fallback: Admins/Superviseurs trouvés: {len(destinataires)}")
        
        # Créer une notification pour chaque destinataire
        notifications_creees = 0
        for dest in destinataires:
            try:
                notification = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant.id,
                    "destinataire_id": dest.get("id"),
                    "type": "alerte_inspection",
                    "titre": f"⚠️ Alerte inspection: {asset_nom}",
                    "message": f"L'inspection de {asset_nom} a déclenché {len(alertes)} alerte(s):\n{alerte_texte}",
                    "lien": f"/actifs",
                    "statut": "non_lu",
                    "date_creation": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.notifications.insert_one(notification)
                notifications_creees += 1
                logger.info(f"🔔 Notification créée pour {dest.get('email', 'N/A')} (ID: {notification['id'][:8]})")
            except Exception as notif_err:
                logger.error(f"❌ Erreur création notification pour {dest.get('email', 'N/A')}: {notif_err}")
        
        logger.info(f"✅ {notifications_creees}/{len(destinataires)} notification(s) créée(s)")
        
        # Envoyer un email aux destinataires configurés
        try:
            import resend
            resend_api_key = os.environ.get("RESEND_API_KEY")
            sender_email = os.environ.get("SENDER_EMAIL", "noreply@profiremanager.ca")
            
            logger.info(f"📧 Configuration email - API Key présente: {bool(resend_api_key)}, Sender: {sender_email}")
            
            if not resend_api_key:
                logger.error("❌ RESEND_API_KEY non configurée - Emails désactivés")
            else:
                resend.api_key = resend_api_key
                
                dest_emails = [d.get("email") for d in destinataires if d.get("email")]
                logger.info(f"📧 Emails destinataires trouvés: {dest_emails}")
                
                if dest_emails:
                    # Utiliser le nom du tenant déjà récupéré plus haut
                    tenant_nom = tenant_data.get("nom", tenant_slug) if tenant_data else tenant_slug
                    
                    email_html = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                            <h2 style="margin: 0;">⚠️ Alerte d'inspection</h2>
                        </div>
                        <div style="padding: 20px; background-color: #f9fafb; border-radius: 0 0 8px 8px;">
                            <p><strong>Type:</strong> {asset_type.replace('_', ' ').title()}</p>
                            <p><strong>Équipement:</strong> {asset_nom}</p>
                            <p><strong>Inspecté par:</strong> {current_user.prenom} {current_user.nom}</p>
                            <p><strong>Date:</strong> {date_inspection[:10] if date_inspection else 'N/A'}</p>
                            
                            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin-top: 15px;">
                                <h3 style="color: #dc2626; margin: 0 0 10px 0;">Alertes détectées:</h3>
                                <ul style="margin: 0; padding-left: 20px;">
                                    {''.join([f'<li>{msg}</li>' for msg in alertes_messages])}
                                </ul>
                            </div>
                            
                            <p style="margin-top: 20px; font-size: 0.875rem; color: #6b7280;">
                                Connectez-vous à ProFireManager pour plus de détails.
                            </p>
                        </div>
                    </div>
                    """
                    
                    logger.info(f"📧 Envoi email à: {dest_emails}")
                    sujet_email = f"⚠️ Alerte inspection: {asset_nom} - {tenant_nom}"
                    email_response = resend.Emails.send({
                        "from": f"ProFireManager <{sender_email}>",
                        "to": dest_emails,
                        "subject": sujet_email,
                        "html": email_html
                    })
                    logger.info(f"✅ Email d'alerte envoyé à {len(dest_emails)} destinataire(s) - Response: {email_response}")
                    
                    # Enregistrer dans l'historique des emails pour chaque destinataire
                    from routes.emails_history import log_email_sent
                    for dest in destinataires:
                        if dest.get("email"):
                            await log_email_sent(
                                type_email="alerte_inspection",
                                destinataire_email=dest.get("email"),
                                destinataire_nom=f"{dest.get('prenom', '')} {dest.get('nom', '')}".strip(),
                                sujet=sujet_email,
                                statut="sent",
                                tenant_id=tenant.id,
                                tenant_slug=tenant_slug,
                                metadata={
                                    "asset_type": asset_type,
                                    "asset_nom": asset_nom,
                                    "nb_alertes": len(alertes),
                                    "inspecteur": f"{current_user.prenom} {current_user.nom}"
                                }
                            )
                else:
                    logger.warning("⚠️ Aucune adresse email destinataire trouvée pour l'envoi")
        except Exception as e:
            logger.error(f"❌ Erreur envoi email d'alerte: {e}", exc_info=True)
    
    inspection.pop("_id", None)
    logger.info(f"Inspection unifiée créée pour {asset_type} '{asset_nom}' par {current_user.email}")
    return inspection

@router.get("/{tenant_slug}/inspections-unifiees/equipement/{equipement_id}")
async def get_inspections_equipement(
    tenant_slug: str,
    equipement_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections pour un équipement"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_unifiees.find(
        {"tenant_id": tenant.id, "equipement_id": equipement_id},
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(100)
    
    return inspections

@router.get("/{tenant_slug}/inspections-unifiees/{asset_type}/{asset_id}")
async def get_inspections_by_asset(
    tenant_slug: str,
    asset_type: str,
    asset_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer l'historique des inspections/inventaires pour un asset (véhicule, borne_seche, equipement)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Requête qui supporte l'ancien et le nouveau format
    query = {
        "tenant_id": tenant.id,
        "$or": [
            {"asset_id": asset_id, "asset_type": asset_type},
            {"equipement_id": asset_id} if asset_type == "equipement" else {"asset_id": asset_id}
        ]
    }
    
    inspections = await db.inspections_unifiees.find(
        query,
        {"_id": 0}
    ).sort("date_inspection", -1).to_list(100)
    
    return inspections

@router.post("/{tenant_slug}/formulaires-inspection/migrer-categories")
async def migrer_categories_formulaires(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Migrer les catégories des formulaires vers les 4 catégories principales"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    # Mapping des anciennes catégories vers les nouvelles
    category_mapping = {
        # EPI - toutes les sous-catégories EPI vers 'epi'
        'epi_bunker': 'epi',
        'epi_bottes': 'epi',
        'epi_casque': 'epi',
        'epi_gants': 'epi',
        'epi_cagoule': 'epi',
        # Tout ce qui commence par 'epi_' va vers 'epi'
        
        # Équipements - toutes les sous-catégories vers 'equipement'
        'APRIA': 'equipement',
        'Bouteilles APRIA': 'equipement',
        'Détecteurs': 'equipement',
        'Extincteurs': 'equipement',
        
        # Points d'eau
        'borne_seche': 'point_eau',
        'borne_fontaine': 'point_eau',
        'point_statique': 'point_eau',
    }
    
    # Récupérer tous les formulaires du tenant
    formulaires = await db.formulaires_inspection.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(1000)
    
    updated_count = 0
    
    for formulaire in formulaires:
        old_categories = formulaire.get('categorie_ids', [])
        new_categories = set()
        
        for cat in old_categories:
            # Vérifier si c'est une catégorie à mapper
            if cat in category_mapping:
                new_categories.add(category_mapping[cat])
            elif cat.startswith('epi_'):
                new_categories.add('epi')
            elif cat in ['vehicule', 'point_eau', 'equipement', 'epi']:
                # Déjà une catégorie principale, garder
                new_categories.add(cat)
            else:
                # Pour les autres catégories inconnues, essayer de deviner
                cat_lower = cat.lower()
                if 'epi' in cat_lower or 'bunker' in cat_lower or 'casque' in cat_lower or 'botte' in cat_lower or 'gant' in cat_lower or 'cagoule' in cat_lower:
                    new_categories.add('epi')
                elif 'apria' in cat_lower or 'detecteur' in cat_lower or 'extincteur' in cat_lower or 'bouteille' in cat_lower:
                    new_categories.add('equipement')
                elif 'borne' in cat_lower or 'eau' in cat_lower or 'piscine' in cat_lower or 'lac' in cat_lower:
                    new_categories.add('point_eau')
                elif 'vehicule' in cat_lower or 'camion' in cat_lower or 'auto' in cat_lower:
                    new_categories.add('vehicule')
                # Sinon, on ne garde pas la catégorie
        
        new_categories_list = list(new_categories)
        
        # Mettre à jour si les catégories ont changé
        if set(old_categories) != set(new_categories_list):
            await db.formulaires_inspection.update_one(
                {"id": formulaire['id'], "tenant_id": tenant.id},
                {"$set": {"categorie_ids": new_categories_list}}
            )
            updated_count += 1
    
    return {
        "message": f"Migration des catégories terminée",
        "formulaires_mis_a_jour": updated_count,
        "total_formulaires": len(formulaires)
    }

@router.post("/{tenant_slug}/formulaires-inspection/migrer-existants")
async def migrer_formulaires_existants(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Migrer les formulaires existants (APRIA, Bornes Sèches, Parties Faciales) vers le système unifié"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ['admin', 'superadmin']:
        raise HTTPException(status_code=403, detail="Permission refusée")
    
    migrated = []
    
    # 1. Migrer les modèles APRIA
    modeles_apria = await db.modeles_inspection_apria.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(100)
    
    for modele in modeles_apria:
        # Vérifier si déjà migré
        existing = await db.formulaires_inspection.find_one({
            "tenant_id": tenant.id,
            "source_migration": f"apria_{modele.get('id')}"
        })
        if existing:
            continue
            
        # Convertir les sections au nouveau format
        sections = []
        for section in modele.get("sections", []):
            items = []
            for item in section.get("items", []):
                items.append({
                    "id": item.get("id"),
                    "nom": item.get("nom"),
                    "type": "conforme_nc",
                    "ordre": item.get("ordre", 0)
                })
            sections.append({
                "id": section.get("id"),
                "titre": section.get("titre"),
                "icone": "🫁",
                "items": items
            })
        
        # Trouver les catégories APRIA
        cat_apria = await db.categories_equipements.find_one(
            {"tenant_id": tenant.id, "nom": {"$regex": "APRIA", "$options": "i"}}
        )
        
        formulaire = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": modele.get("nom"),
            "description": modele.get("description", "Formulaire migré depuis APRIA"),
            "type": "inspection",
            "categorie_ids": [cat_apria["id"]] if cat_apria else [],
            "frequence": "apres_usage",
            "est_actif": modele.get("est_actif", True),
            "sections": sections,
            "source_migration": f"apria_{modele.get('id')}",
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.formulaires_inspection.insert_one(formulaire)
        migrated.append({"type": "APRIA", "nom": modele.get("nom")})
    
    # 2. Migrer les modèles Bornes Sèches
    modeles_bs = await db.modeles_inspection_bornes_seches.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(100)
    
    for modele in modeles_bs:
        existing = await db.formulaires_inspection.find_one({
            "tenant_id": tenant.id,
            "source_migration": f"borne_seche_{modele.get('id')}"
        })
        if existing:
            continue
            
        sections = []
        for section in modele.get("sections", []):
            items = []
            for item in section.get("items", []):
                items.append({
                    "id": item.get("id"),
                    "nom": item.get("nom"),
                    "type": "conforme_nc",
                    "ordre": item.get("ordre", 0)
                })
            sections.append({
                "id": section.get("id"),
                "titre": section.get("titre"),
                "icone": "🔥",
                "items": items
            })
        
        formulaire = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": modele.get("nom"),
            "description": modele.get("description", "Formulaire migré depuis Bornes Sèches"),
            "type": "inspection",
            "categorie_ids": ["borne_seche"],  # Catégorie spéciale pour les bornes sèches
            "frequence": "annuelle",
            "est_actif": modele.get("est_actif", True),
            "sections": sections,
            "source_migration": f"borne_seche_{modele.get('id')}",
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.formulaires_inspection.insert_one(formulaire)
        migrated.append({"type": "Borne Sèche", "nom": modele.get("nom")})
    
    # 3. Migrer les modèles Parties Faciales
    modeles_pf = await db.modeles_inspection_parties_faciales.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(100)
    
    for modele in modeles_pf:
        existing = await db.formulaires_inspection.find_one({
            "tenant_id": tenant.id,
            "source_migration": f"partie_faciale_{modele.get('id')}"
        })
        if existing:
            continue
            
        sections = []
        for section in modele.get("sections", []):
            items = []
            for item in section.get("items", []):
                items.append({
                    "id": item.get("id"),
                    "nom": item.get("nom"),
                    "type": "conforme_nc",
                    "ordre": item.get("ordre", 0)
                })
            sections.append({
                "id": section.get("id"),
                "titre": section.get("titre"),
                "icone": "🎭",
                "items": items
            })
        
        # Trouver les catégories Parties Faciales
        cat_pf = await db.categories_equipements.find_one(
            {"tenant_id": tenant.id, "nom": {"$regex": "faciale", "$options": "i"}}
        )
        
        formulaire = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": modele.get("nom"),
            "description": modele.get("description", "Formulaire migré depuis Parties Faciales"),
            "type": "inspection",
            "categorie_ids": [cat_pf["id"]] if cat_pf else [],
            "frequence": modele.get("frequence", "mensuelle"),
            "est_actif": modele.get("est_actif", True),
            "sections": sections,
            "source_migration": f"partie_faciale_{modele.get('id')}",
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.formulaires_inspection.insert_one(formulaire)
        migrated.append({"type": "Partie Faciale", "nom": modele.get("nom")})
    
    # 4. Créer un formulaire par défaut pour les EPI (habits de combat)
    existing_epi = await db.formulaires_inspection.find_one({
        "tenant_id": tenant.id,
        "source_migration": "epi_default"
    })
    
    if not existing_epi:
        formulaire_epi = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": "Inspection Habits de Combat",
            "description": "Formulaire d'inspection annuelle des équipements de protection individuelle (Bunker, Bottes, Casque, Gants, Cagoule)",
            "type": "inspection",
            "categorie_ids": ["epi_bunker", "epi_bottes", "epi_casque", "epi_gants", "epi_cagoule"],
            "frequence": "annuelle",
            "est_actif": True,
            "sections": [
                {
                    "id": "section_visual",
                    "titre": "Inspection visuelle",
                    "icone": "👁️",
                    "items": [
                        {"id": "epi_1", "nom": "État général de l'équipement", "type": "conforme_nc", "ordre": 0},
                        {"id": "epi_2", "nom": "Absence de déchirures ou trous", "type": "conforme_nc", "ordre": 1},
                        {"id": "epi_3", "nom": "Coutures intactes", "type": "conforme_nc", "ordre": 2},
                        {"id": "epi_4", "nom": "Bandes réfléchissantes en bon état", "type": "conforme_nc", "ordre": 3},
                        {"id": "epi_5", "nom": "Étiquettes lisibles", "type": "conforme_nc", "ordre": 4}
                    ]
                },
                {
                    "id": "section_fermetures",
                    "titre": "Fermetures et attaches",
                    "icone": "🔒",
                    "items": [
                        {"id": "epi_6", "nom": "Fermetures éclair fonctionnelles", "type": "conforme_nc", "ordre": 0},
                        {"id": "epi_7", "nom": "Velcros adhèrent correctement", "type": "conforme_nc", "ordre": 1},
                        {"id": "epi_8", "nom": "Boutons-pression fonctionnels", "type": "conforme_nc", "ordre": 2},
                        {"id": "epi_9", "nom": "Sangles d'ajustement en bon état", "type": "conforme_nc", "ordre": 3}
                    ]
                },
                {
                    "id": "section_protection",
                    "titre": "Protection thermique",
                    "icone": "🔥",
                    "items": [
                        {"id": "epi_10", "nom": "Doublure thermique intacte", "type": "conforme_nc", "ordre": 0},
                        {"id": "epi_11", "nom": "Barrière d'humidité fonctionnelle", "type": "conforme_nc", "ordre": 1},
                        {"id": "epi_12", "nom": "Absence de contamination", "type": "conforme_nc", "ordre": 2}
                    ]
                },
                {
                    "id": "section_remarques",
                    "titre": "Remarques",
                    "icone": "📝",
                    "items": [
                        {"id": "epi_13", "nom": "Observations / Commentaires", "type": "texte", "ordre": 0}
                    ]
                }
            ],
            "source_migration": "epi_default",
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.formulaires_inspection.insert_one(formulaire_epi)
        migrated.append({"type": "EPI", "nom": "Inspection Habits de Combat"})
    
    # 5. Créer un formulaire par défaut pour les inventaires véhicules
    existing_inv = await db.formulaires_inspection.find_one({
        "tenant_id": tenant.id,
        "source_migration": "inventaire_vehicule_default"
    })
    
    if not existing_inv:
        formulaire_inv = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "nom": "Inventaire Véhicule Standard",
            "description": "Formulaire d'inventaire pour les véhicules d'intervention",
            "type": "inventaire",
            "categorie_ids": ["vehicule"],
            "frequence": "hebdomadaire",
            "est_actif": True,
            "sections": [
                {
                    "id": "section_equipement",
                    "titre": "Équipements de base",
                    "icone": "🧰",
                    "items": [
                        {"id": "inv_1", "nom": "Extincteur", "type": "oui_non", "ordre": 0},
                        {"id": "inv_2", "nom": "Trousse de premiers soins", "type": "oui_non", "ordre": 1},
                        {"id": "inv_3", "nom": "Triangle de signalisation", "type": "oui_non", "ordre": 2},
                        {"id": "inv_4", "nom": "Lampe de poche", "type": "oui_non", "ordre": 3}
                    ]
                },
                {
                    "id": "section_intervention",
                    "titre": "Équipements d'intervention",
                    "icone": "🚒",
                    "items": [
                        {"id": "inv_5", "nom": "Tuyaux", "type": "nombre", "ordre": 0},
                        {"id": "inv_6", "nom": "Lances", "type": "nombre", "ordre": 1},
                        {"id": "inv_7", "nom": "Échelles", "type": "oui_non", "ordre": 2}
                    ]
                }
            ],
            "source_migration": "inventaire_vehicule_default",
            "created_by": current_user.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.formulaires_inspection.insert_one(formulaire_inv)
        migrated.append({"type": "Inventaire", "nom": "Inventaire Véhicule Standard"})
    
    logger.info(f"Migration des formulaires terminée par {current_user.email}: {len(migrated)} formulaires migrés")
    return {
        "message": f"Migration terminée: {len(migrated)} formulaires créés",
        "formulaires_migres": migrated
    }

# ==================== FIN MODULE FORMULAIRES D'INSPECTION ====================

