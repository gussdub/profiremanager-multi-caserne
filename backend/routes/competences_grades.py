"""
Routes API pour les modules Compétences et Grades
=================================================

STATUT: ACTIF
Ce module gère les compétences et grades des pompiers.

Routes Compétences:
- POST   /{tenant_slug}/competences                    - Créer une compétence
- GET    /{tenant_slug}/competences                    - Liste des compétences
- PUT    /{tenant_slug}/competences/{competence_id}   - Modifier une compétence
- DELETE /{tenant_slug}/competences/{competence_id}   - Supprimer une compétence
- POST   /{tenant_slug}/competences/clean-invalid     - Nettoyer compétences invalides

Routes Grades:
- POST   /{tenant_slug}/grades                - Créer un grade
- GET    /{tenant_slug}/grades                - Liste des grades
- PUT    /{tenant_slug}/grades/{grade_id}     - Modifier un grade
- DELETE /{tenant_slug}/grades/{grade_id}     - Supprimer un grade
"""

from fastapi import APIRouter, Depends, HTTPException
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
    User,
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Compétences & Grades"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES COMPÉTENCES ====================

class Competence(BaseModel):
    """Compétence avec exigences NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CompetenceCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    description: str = ""
    heures_requises_annuelles: float = 0.0
    obligatoire: bool = False


class CompetenceUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    heures_requises_annuelles: Optional[float] = None
    obligatoire: Optional[bool] = None


# ==================== MODÈLES GRADES ====================

class Grade(BaseModel):
    """Grade hiérarchique pour les pompiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    niveau_hierarchique: int  # 1 = niveau le plus bas, 10 = niveau le plus haut
    est_officier: bool = False  # True si ce grade est considéré comme un officier
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GradeCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    niveau_hierarchique: int
    est_officier: bool = False


class GradeUpdate(BaseModel):
    nom: Optional[str] = None
    niveau_hierarchique: Optional[int] = None
    est_officier: Optional[bool] = None


# ==================== ROUTES COMPÉTENCES ====================

@router.post("/{tenant_slug}/competences", response_model=Competence)
async def create_competence(
    tenant_slug: str,
    competence: CompetenceCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "creer", "competences")
    
    competence_dict = competence.dict()
    competence_dict["tenant_id"] = tenant.id
    competence_obj = Competence(**competence_dict)
    
    comp_data = competence_obj.dict()
    comp_data["created_at"] = competence_obj.created_at.isoformat()
    
    await db.competences.insert_one(comp_data)
    return competence_obj


@router.get("/{tenant_slug}/competences", response_model=List[Competence])
async def get_competences(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère toutes les compétences"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    competences = await db.competences.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned = [clean_mongo_doc(c) for c in competences]
    
    for c in cleaned:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"].replace('Z', '+00:00'))
    
    return [Competence(**c) for c in cleaned]


@router.put("/{tenant_slug}/competences/{competence_id}", response_model=Competence)
async def update_competence(
    tenant_slug: str,
    competence_id: str,
    competence_update: CompetenceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "modifier", "competences")
    
    update_data = {k: v for k, v in competence_update.dict().items() if v is not None}
    
    result = await db.competences.update_one(
        {"id": competence_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    updated = await db.competences.find_one({"id": competence_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    
    return Competence(**cleaned)


@router.delete("/{tenant_slug}/competences/{competence_id}")
async def delete_competence(
    tenant_slug: str,
    competence_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime une compétence"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "supprimer", "competences")
    
    result = await db.competences.delete_one({"id": competence_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    return {"message": "Compétence supprimée"}


@router.post("/{tenant_slug}/competences/clean-invalid")
async def clean_invalid_competences(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Nettoie les compétences invalides/obsolètes des utilisateurs
    
    Supprime des profils utilisateurs toutes les compétences qui n'existent plus 
    dans la collection competences.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module formations/competences
    await require_permission(tenant.id, current_user, "formations", "modifier", "competences")
    
    # Récupérer tous les IDs de compétences valides
    valid_competences = await db.competences.find({"tenant_id": tenant.id}, {"id": 1, "_id": 0}).to_list(1000)
    valid_competence_ids = {c["id"] for c in valid_competences}
    
    # Récupérer tous les utilisateurs avec des compétences
    users = await db.users.find(
        {"tenant_id": tenant.id, "competences": {"$exists": True, "$ne": []}},
        {"id": 1, "competences": 1, "prenom": 1, "nom": 1, "_id": 0}
    ).to_list(1000)
    
    cleaned_count = 0
    invalid_removed = 0
    
    for user in users:
        original_competences = user.get("competences", [])
        # Filtrer pour ne garder que les compétences valides
        valid_user_competences = [c_id for c_id in original_competences if c_id in valid_competence_ids]
        
        if len(valid_user_competences) < len(original_competences):
            # Il y avait des compétences invalides
            removed = len(original_competences) - len(valid_user_competences)
            invalid_removed += removed
            cleaned_count += 1
            
            # Mettre à jour l'utilisateur
            await db.users.update_one(
                {"id": user["id"], "tenant_id": tenant.id},
                {"$set": {"competences": valid_user_competences}}
            )
            
            logger.info(f"🧹 Nettoyage: {user['prenom']} {user['nom']} - {removed} compétence(s) invalide(s) supprimée(s)")
    
    return {
        "message": f"Nettoyage terminé",
        "users_cleaned": cleaned_count,
        "invalid_competences_removed": invalid_removed
    }


# ==================== ROUTES GRADES ====================

@router.post("/{tenant_slug}/grades", response_model=Grade)
async def create_grade(
    tenant_slug: str,
    grade: GradeCreate,
    current_user: User = Depends(get_current_user)
):
    """Crée un grade"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module parametres/grades
    await require_permission(tenant.id, current_user, "parametres", "creer")
    
    # Vérifier si le grade existe déjà
    existing = await db.grades.find_one({"nom": grade.nom, "tenant_id": tenant.id})
    if existing:
        raise HTTPException(status_code=400, detail="Ce grade existe déjà")
    
    grade_dict = grade.dict()
    grade_dict["tenant_id"] = tenant.id
    grade_obj = Grade(**grade_dict)
    
    grade_data = grade_obj.dict()
    grade_data["created_at"] = grade_obj.created_at.isoformat()
    grade_data["updated_at"] = grade_obj.updated_at.isoformat()
    
    await db.grades.insert_one(grade_data)
    return grade_obj


@router.get("/{tenant_slug}/grades", response_model=List[Grade])
async def get_grades(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère tous les grades triés par niveau hiérarchique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    grades = await db.grades.find({"tenant_id": tenant.id}).sort("niveau_hierarchique", 1).to_list(1000)
    cleaned = [clean_mongo_doc(g) for g in grades]
    
    for g in cleaned:
        if isinstance(g.get("created_at"), str):
            g["created_at"] = datetime.fromisoformat(g["created_at"].replace('Z', '+00:00'))
        if isinstance(g.get("updated_at"), str):
            g["updated_at"] = datetime.fromisoformat(g["updated_at"].replace('Z', '+00:00'))
    
    return [Grade(**g) for g in cleaned]


@router.put("/{tenant_slug}/grades/{grade_id}", response_model=Grade)
async def update_grade(
    tenant_slug: str,
    grade_id: str,
    grade_update: GradeUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un grade"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "modifier")
    
    update_data = {k: v for k, v in grade_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.grades.update_one(
        {"id": grade_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    updated = await db.grades.find_one({"id": grade_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return Grade(**cleaned)


@router.delete("/{tenant_slug}/grades/{grade_id}")
async def delete_grade(
    tenant_slug: str,
    grade_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un grade si aucun employé ne l'utilise"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module parametres
    await require_permission(tenant.id, current_user, "parametres", "supprimer")
    
    # Vérifier si le grade existe
    existing_grade = await db.grades.find_one({"id": grade_id, "tenant_id": tenant.id})
    if not existing_grade:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    # Vérifier si des employés utilisent ce grade
    users_count = await db.users.count_documents({"grade": existing_grade["nom"], "tenant_id": tenant.id})
    
    if users_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer ce grade. {users_count} employé(s) l'utilisent actuellement. Veuillez d'abord réassigner ces employés à un autre grade."
        )
    
    result = await db.grades.delete_one({"id": grade_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Grade non trouvé")
    
    return {"message": "Grade supprimé avec succès"}
