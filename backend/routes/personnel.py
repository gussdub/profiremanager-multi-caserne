"""
Routes API pour le module Personnel (Users)
============================================

STATUT: ACTIF
Ce module gère la création, modification et suppression des utilisateurs.

Routes:
- GET    /{tenant_slug}/users                     - Liste des utilisateurs
- GET    /{tenant_slug}/users/{user_id}           - Détail utilisateur
- POST   /{tenant_slug}/users                     - Créer un utilisateur
- PUT    /{tenant_slug}/users/{user_id}           - Modifier utilisateur
- DELETE /{tenant_slug}/users/{user_id}           - Supprimer utilisateur
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import os
import re
import bcrypt
import base64
from io import BytesIO

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    creer_activite,
    User
)

router = APIRouter(tags=["Personnel"])


# ==================== MODÈLES ====================

class UserCreate(BaseModel):
    """Modèle pour la création d'un utilisateur"""
    email: str
    mot_de_passe: str
    nom: str
    prenom: str
    role: str = "employe"
    grade: Optional[str] = None
    type_emploi: Optional[str] = "temps_partiel"
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    date_embauche: Optional[str] = None
    date_naissance: Optional[str] = None
    numero_employe: Optional[str] = None
    formations: Optional[List[str]] = []
    competences: Optional[List[str]] = []
    statut: str = "Actif"


class UserUpdate(BaseModel):
    """Modèle pour la mise à jour d'un utilisateur"""
    email: Optional[str] = None
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: Optional[str] = None
    grade: Optional[str] = None
    type_emploi: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    date_embauche: Optional[str] = None
    date_naissance: Optional[str] = None
    numero_employe: Optional[str] = None
    formations: Optional[List[str]] = None
    competences: Optional[List[str]] = None
    statut: Optional[str] = None
    tailles_epi: Optional[Dict[str, str]] = None  # Tailles EPI de l'employé
    
    class Config:
        extra = "allow"  # Permet les champs supplémentaires non définis


# ==================== FONCTIONS UTILITAIRES ====================

def validate_complex_password(password: str) -> bool:
    """Valide qu'un mot de passe respecte les exigences de sécurité"""
    if len(password) < 8:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    if not re.search(r'[!@#$%^&*+\-?()]', password):
        return False
    return True


def get_password_hash(password: str) -> str:
    """Hash un mot de passe avec bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/users", response_model=List[User])
async def get_users(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste tous les utilisateurs du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès au tenant
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_users = [clean_mongo_doc(user) for user in users]
    return [User(**user) for user in cleaned_users]


@router.get("/{tenant_slug}/users/{user_id}", response_model=User)
async def get_user(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un utilisateur par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return User(**clean_mongo_doc(user))


@router.post("/{tenant_slug}/users", response_model=User)
async def create_user(
    tenant_slug: str,
    user_create: UserCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouvel utilisateur"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès au tenant
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    # Vérifier la limite du palier
    current_count = await db.users.count_documents({"tenant_id": tenant.id})
    
    if current_count < 30:
        palier, limite = "Basic (1-30)", 30
    elif current_count < 50:
        palier, limite = "Standard (31-50)", 50
    else:
        palier, limite = "Premium (51+)", None
    
    if limite and current_count >= limite:
        raise HTTPException(
            status_code=403,
            detail=f"Limite du palier {palier} atteinte ({current_count}/{limite}). Contactez l'administrateur pour upgrader."
        )
    
    # Validation mot de passe
    if not validate_complex_password(user_create.mot_de_passe):
        raise HTTPException(
            status_code=400,
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial"
        )
    
    # Vérifier email unique dans ce tenant
    existing_user = await db.users.find_one({
        "email": user_create.email,
        "tenant_id": tenant.id
    })
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé dans cette caserne")
    
    # Créer l'utilisateur
    user_dict = user_create.dict()
    user_dict["id"] = str(uuid.uuid4())
    user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
    user_dict["tenant_id"] = tenant.id
    user_dict["created_at"] = datetime.now(timezone.utc)
    
    # Synchroniser formations vers competences
    if "formations" in user_dict and user_dict["formations"]:
        user_dict["competences"] = user_dict["formations"]
    
    await db.users.insert_one(user_dict)
    
    # Créer activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_creation",
        description=f"👤 {current_user.prenom} {current_user.nom} a ajouté {user_create.prenom} {user_create.nom} ({user_create.grade or 'N/A'}) au personnel",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    logging.info(f"✅ Utilisateur créé: {user_create.email} dans tenant {tenant_slug}")
    
    return User(**user_dict)


@router.put("/{tenant_slug}/users/{user_id}", response_model=User)
async def update_user(
    tenant_slug: str,
    user_id: str,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Préparer les données de mise à jour (seulement les champs fournis)
    update_data = {k: v for k, v in user_update.dict(exclude_unset=True).items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # SYNCHRONISATION BIDIRECTIONNELLE formations/competences
    if "formations" in update_data:
        update_data["competences"] = update_data["formations"]
        logging.info(f"🔄 [SYNC] Copie formations → competences: {update_data['formations']}")
    elif "competences" in update_data:
        update_data["formations"] = update_data["competences"]
        logging.info(f"🔄 [SYNC] Copie competences → formations: {update_data['competences']}")
    
    # Gestion du mot de passe si fourni
    if "mot_de_passe" in update_data and update_data["mot_de_passe"]:
        update_data["mot_de_passe_hash"] = get_password_hash(update_data.pop("mot_de_passe"))
    elif "mot_de_passe" in update_data:
        update_data.pop("mot_de_passe")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Récupérer l'utilisateur mis à jour
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    user_cleaned = clean_mongo_doc(user)
    
    # Créer une activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_modification",
        description=f"✏️ {current_user.prenom} {current_user.nom} a modifié le profil de {user_cleaned.get('prenom')} {user_cleaned.get('nom')}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    return User(**user_cleaned)


@router.delete("/{tenant_slug}/users/{user_id}")
async def delete_user(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un utilisateur"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    
    # Récupérer l'utilisateur avant suppression pour le log
    user_to_delete = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    result = await db.users.delete_one({"id": user_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Créer activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_suppression",
        description=f"🗑️ {current_user.prenom} {current_user.nom} a supprimé {user_to_delete.get('prenom')} {user_to_delete.get('nom')} du personnel",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    logging.info(f"✅ Utilisateur supprimé: {user_id} dans tenant {tenant_slug}")
    
    return {"message": "Utilisateur supprimé avec succès"}
