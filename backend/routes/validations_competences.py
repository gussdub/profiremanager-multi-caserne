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
    """Créer une validation manuelle de compétence (rattrapage de formation)"""
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
    
    if user:
        # Ajouter la compétence à l'utilisateur si elle n'y est pas déjà
        user_competences = user.get("competences", [])
        if validation.competence_id not in user_competences:
            user_competences.append(validation.competence_id)
            await db.users.update_one(
                {"id": validation.user_id, "tenant_id": tenant.id},
                {"$set": {"competences": user_competences}}
            )
            logger.info(f"✅ Compétence '{competence['nom']}' ajoutée à {user['prenom']} {user['nom']}")
        
        # Créer une présence fictive pour comptabiliser les heures de formation
        if validation.duree_heures > 0:
            import uuid as uuid_module
            presence_rattrapage = {
                "id": str(uuid_module.uuid4()),
                "tenant_id": tenant.id,
                "formation_id": f"rattrapage_{validation_obj.id}",  # ID spécial pour rattrapage
                "user_id": validation.user_id,
                "statut": "present",
                "date": validation.date_validation,
                "heures_validees": validation.duree_heures,
                "est_rattrapage": True,
                "validation_id": validation_obj.id,
                "competence_id": validation.competence_id,
                "justification": validation.justification,
                "created_at": validation_obj.created_at.isoformat()
            }
            await db.presences_formations.insert_one(presence_rattrapage)
            logger.info(f"✅ {validation.duree_heures}h de formation comptabilisées pour {user['prenom']} {user['nom']} (rattrapage)")
        
        # Créer une activité
        await creer_activite(
            tenant_id=tenant.id,
            type_activite="validation_competence",
            description=f"✅ {current_user.prenom} {current_user.nom} a validé la compétence '{competence['nom']}' pour {user['prenom']} {user['nom']}" + (f" ({validation.duree_heures}h)" if validation.duree_heures > 0 else ""),
            user_id=current_user.id,
            user_nom=f"{current_user.prenom} {current_user.nom}",
            data={"concerne_user_id": validation.user_id, "duree_heures": validation.duree_heures}
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
