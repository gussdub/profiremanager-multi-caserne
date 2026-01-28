"""
Routes API pour le module Validations Compétences
=================================================

STATUT: ACTIF
Ce module gère les validations manuelles de compétences pour les employés.

Routes:
- POST   /{tenant_slug}/validations-competences                    - Créer une validation
- GET    /{tenant_slug}/validations-competences/{user_id}          - Obtenir validations d'un employé
- DELETE /{tenant_slug}/validations-competences/{validation_id}    - Supprimer une validation
"""

from fastapi import APIRouter, Depends, HTTPException
import logging

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    creer_activite,
    User,
    ValidationCompetence,
    ValidationCompetenceCreate
)

router = APIRouter(tags=["Validations Compétences"])
logger = logging.getLogger(__name__)


@router.post("/{tenant_slug}/validations-competences")
async def creer_validation_competence(
    tenant_slug: str,
    validation: ValidationCompetenceCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer une validation manuelle de compétence"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la compétence existe
    competence = await db.competences.find_one({
        "id": validation.competence_id,
        "tenant_id": tenant.id
    })
    if not competence:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    # Créer la validation
    validation_obj = ValidationCompetence(
        **validation.dict(),
        tenant_id=tenant.id,
        validee_par=current_user.id
    )
    
    await db.validations_competences.insert_one(validation_obj.dict())
    
    # Récupérer l'employé concerné
    user = await db.users.find_one({"id": validation.user_id, "tenant_id": tenant.id})
    
    # Créer une activité
    if user:
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="validation_competence",
            description=f"✅ {current_user.prenom} {current_user.nom} a validé la compétence '{competence['nom']}' pour {user['prenom']} {user['nom']}",
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}",
            data={"concerne_user_id": validation.user_id}
        )
    
    return validation_obj


@router.get("/{tenant_slug}/validations-competences/{user_id}")
async def get_validations_competences(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupérer les validations manuelles d'un employé"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    validations = await db.validations_competences.find({
        "user_id": user_id,
        "tenant_id": tenant.id
    }).to_list(1000)
    
    return [clean_mongo_doc(v) for v in validations]


@router.delete("/{tenant_slug}/validations-competences/{validation_id}")
async def supprimer_validation_competence(
    tenant_slug: str,
    validation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer une validation manuelle"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.validations_competences.delete_one({
        "id": validation_id,
        "tenant_id": tenant.id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Validation non trouvée")
    
    return {"message": "Validation supprimée"}
