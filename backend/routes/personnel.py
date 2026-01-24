"""
Routes API pour le module Personnel (Users)
============================================

Ce fichier contient les routes pour la gestion des utilisateurs/pompiers.

STATUT: PRÊT POUR ACTIVATION
Les routes sont dans server.py lignes 5817-6900 environ.

Pour activer ce module:
1. Dans server.py, importer: from routes.personnel import router as personnel_router
2. Inclure: api_router.include_router(personnel_router)
3. Supprimer les routes correspondantes de server.py
4. Tester exhaustivement

Routes incluses:
- POST   /{tenant_slug}/users                     - Créer un utilisateur
- POST   /{tenant_slug}/users/import-csv          - Import CSV
- GET    /{tenant_slug}/users                     - Liste des utilisateurs
- GET    /{tenant_slug}/users/{user_id}           - Détail utilisateur
- PUT    /{tenant_slug}/users/mon-profil          - Modifier mon profil
- POST   /{tenant_slug}/users/photo-profil        - Upload photo profil (moi)
- POST   /{tenant_slug}/users/{user_id}/photo-profil - Upload photo profil (admin)
- DELETE /{tenant_slug}/users/photo-profil        - Supprimer ma photo
- DELETE /{tenant_slug}/users/{user_id}/photo-profil - Supprimer photo (admin)
- PUT    /{tenant_slug}/users/{user_id}           - Modifier utilisateur
- DELETE /{tenant_slug}/users/{user_id}           - Supprimer utilisateur
- GET    /{tenant_slug}/users/{user_id}/statistiques-interventions
- PUT    /{tenant_slug}/users/{user_id}/password  - Modifier mot de passe
- PUT    /{tenant_slug}/users/{user_id}/access    - Modifier accès
- DELETE /{tenant_slug}/users/{user_id}/revoke    - Révoquer accès
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
from PIL import Image as PILImage

# Ces imports seront résolus quand le module sera activé
# from server import (
#     db, 
#     get_current_user, 
#     get_tenant_from_slug, 
#     clean_mongo_doc,
#     get_password_hash,
#     validate_complex_password,
#     send_welcome_email,
#     creer_activite,
#     User,
#     UserCreate,
#     UserUpdate
# )

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


# ==================== ROUTES ====================
# Note: Ces routes sont commentées car elles ne sont pas encore activées.
# Décommenter quand prêt à migrer depuis server.py

"""
@router.post("/{tenant_slug}/users", response_model=User)
async def create_user(
    tenant_slug: str, 
    user_create: UserCreate, 
    current_user: User = Depends(get_current_user)
):
    '''Créer un nouvel utilisateur'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier la limite du palier
    current_count = await db.users.count_documents({"tenant_id": tenant.id})
    
    if current_count < 30:
        palier, limite, prix = "Basic (1-30)", 30, "12$"
    elif current_count < 50:
        palier, limite, prix = "Standard (31-50)", 50, "20$"
    else:
        palier, limite, prix = "Premium (51+)", None, "27$"
    
    if limite and current_count >= limite:
        raise HTTPException(
            status_code=403, 
            detail=f"Limite du palier {palier} atteinte ({current_count}/{limite})"
        )
    
    # Validation mot de passe
    if not validate_complex_password(user_create.mot_de_passe):
        raise HTTPException(
            status_code=400, 
            detail="Mot de passe non conforme aux exigences de sécurité"
        )
    
    # Vérifier email unique dans ce tenant
    existing_user = await db.users.find_one({
        "email": user_create.email, 
        "tenant_id": tenant.id
    })
    if existing_user:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")
    
    # Créer l'utilisateur
    user_dict = user_create.dict()
    temp_password = user_dict["mot_de_passe"]
    user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
    user_dict["tenant_id"] = tenant.id
    user_dict["id"] = str(uuid.uuid4())
    
    # Synchroniser formations vers competences
    if "formations" in user_dict:
        user_dict["competences"] = user_dict["formations"]
    
    await db.users.insert_one(user_dict)
    
    # Créer activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_creation",
        description=f"👤 Ajout de {user_create.prenom} {user_create.nom}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Envoyer email de bienvenue
    try:
        send_welcome_email(
            user_create.email, 
            f"{user_create.prenom} {user_create.nom}", 
            user_create.role, 
            temp_password, 
            tenant_slug
        )
    except Exception as e:
        logging.error(f"Erreur envoi email: {e}")
    
    return User(**user_dict)


@router.get("/{tenant_slug}/users", response_model=List[User])
async def get_users(
    tenant_slug: str, 
    current_user: User = Depends(get_current_user)
):
    '''Liste tous les utilisateurs du tenant'''
    tenant = await get_tenant_from_slug(tenant_slug)
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_users = [clean_mongo_doc(user) for user in users]
    return [User(**user) for user in cleaned_users]


@router.get("/{tenant_slug}/users/{user_id}", response_model=User)
async def get_user(
    tenant_slug: str, 
    user_id: str, 
    current_user: User = Depends(get_current_user)
):
    '''Récupère un utilisateur par son ID'''
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return User(**clean_mongo_doc(user))


@router.put("/{tenant_slug}/users/{user_id}", response_model=User)
async def update_user(
    tenant_slug: str, 
    user_id: str, 
    user_update: UserUpdate, 
    current_user: User = Depends(get_current_user)
):
    '''Met à jour un utilisateur'''
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in user_update.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # Synchroniser formations vers competences
    if "formations" in update_data:
        update_data["competences"] = update_data["formations"]
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    return User(**clean_mongo_doc(user))


@router.delete("/{tenant_slug}/users/{user_id}")
async def delete_user(
    tenant_slug: str, 
    user_id: str, 
    current_user: User = Depends(get_current_user)
):
    '''Supprime un utilisateur'''
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.users.delete_one({"id": user_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return {"message": "Utilisateur supprimé avec succès"}
"""


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


def compress_image_for_storage(image_data: bytes, max_size_kb: int = 100) -> str:
    """Compresse une image pour le stockage en base64"""
    try:
        img = PILImage.open(BytesIO(image_data))
        
        # Convertir en RGB si nécessaire
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        # Redimensionner si trop grande
        max_dimension = 400
        if img.width > max_dimension or img.height > max_dimension:
            img.thumbnail((max_dimension, max_dimension), PILImage.LANCZOS)
        
        # Compresser en JPEG
        output = BytesIO()
        quality = 85
        
        while quality > 20:
            output.seek(0)
            output.truncate()
            img.save(output, format='JPEG', quality=quality, optimize=True)
            
            if output.tell() <= max_size_kb * 1024:
                break
            quality -= 10
        
        output.seek(0)
        return f"data:image/jpeg;base64,{base64.b64encode(output.read()).decode()}"
        
    except Exception as e:
        logging.error(f"Erreur compression image: {e}")
        raise
