"""
Routes API pour le module Authentication
========================================

Gestion de l'authentification des utilisateurs par tenant.
Note: Les routes super-admin restent dans server.py car elles ont des dépendances spécifiques.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import secrets
import hashlib
import jwt
import os

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)

# Configuration JWT
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "profiremanager-secret-key-2024-ultra-secure")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480


# ==================== MODÈLES ====================

class LoginRequest(BaseModel):
    email: str
    mot_de_passe: str  # Cohérent avec le frontend français

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ==================== HELPERS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash"""
    if hashed_password.startswith("$2"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
        except:
            pass
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password

def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt si disponible, sinon SHA256"""
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    except:
        return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Crée un token JWT"""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ==================== ROUTES TENANT AUTH ====================

@router.post("/{tenant_slug}/auth/login")
async def tenant_login(tenant_slug: str, login: LoginRequest):
    """Connexion d'un utilisateur à un tenant spécifique"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    user = await db.users.find_one({
        "tenant_id": tenant.id,
        "email": login.email.lower().strip()
    })
    
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    if not user.get("actif", True):
        raise HTTPException(status_code=401, detail="Compte désactivé")
    
    stored_hash = user.get("mot_de_passe_hash", "")
    if not verify_password(login.mot_de_passe, stored_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    # Créer le token
    access_token = create_access_token(
        data={
            "sub": user["id"],
            "tenant_id": tenant.id,
            "role": user.get("role", "employe")
        }
    )
    
    # Mettre à jour la dernière connexion
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"derniere_connexion": datetime.now(timezone.utc)}}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "nom": user.get("nom", ""),
            "prenom": user.get("prenom", ""),
            "role": user.get("role", "employe")
        }
    }


@router.get("/{tenant_slug}/auth/me")
async def get_current_user_info(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les informations de l'utilisateur connecté"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur appartient bien à ce tenant
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès non autorisé à ce tenant")
    
    return {
        "id": current_user.id,
        "email": current_user.email,
        "nom": current_user.nom,
        "prenom": current_user.prenom,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id
    }


@router.post("/{tenant_slug}/auth/forgot-password")
async def forgot_password(tenant_slug: str, request: ForgotPasswordRequest):
    """Demande de réinitialisation de mot de passe"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    user = await db.users.find_one({
        "tenant_id": tenant.id,
        "email": request.email.lower().strip()
    })
    
    # Ne pas révéler si l'email existe ou non
    if not user:
        return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé"}
    
    # Générer un token unique
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # Sauvegarder le token
    await db.password_reset_tokens.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "tenant_id": tenant.id,
        "token": reset_token,
        "expires_at": expires_at,
        "used": False,
        "created_at": datetime.now(timezone.utc)
    })
    
    # TODO: Envoyer l'email avec le lien de réinitialisation
    logger.info(f"Password reset token generated for {request.email}: {reset_token}")
    
    return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé"}


@router.get("/{tenant_slug}/auth/verify-reset-token/{token}")
async def verify_reset_token(tenant_slug: str, token: str):
    """Vérifie si un token de réinitialisation est valide"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    token_data = await db.password_reset_tokens.find_one({
        "tenant_id": tenant.id,
        "token": token,
        "used": False
    })
    
    if not token_data:
        raise HTTPException(status_code=400, detail="Token invalide ou expiré")
    
    if token_data["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expiré")
    
    return {"valid": True}


@router.post("/{tenant_slug}/auth/reset-password")
async def reset_password(tenant_slug: str, request: ResetPasswordRequest):
    """Réinitialise le mot de passe avec un token valide"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    token_data = await db.password_reset_tokens.find_one({
        "tenant_id": tenant.id,
        "token": request.token,
        "used": False
    })
    
    if not token_data:
        raise HTTPException(status_code=400, detail="Token invalide")
    
    if token_data["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expiré")
    
    # Hasher le nouveau mot de passe
    new_hash = hash_password(request.new_password)
    
    # Mettre à jour le mot de passe
    await db.users.update_one(
        {"id": token_data["user_id"]},
        {"$set": {"mot_de_passe_hash": new_hash}}
    )
    
    # Marquer le token comme utilisé
    await db.password_reset_tokens.update_one(
        {"id": token_data["id"]},
        {"$set": {"used": True}}
    )
    
    return {"message": "Mot de passe réinitialisé avec succès"}
