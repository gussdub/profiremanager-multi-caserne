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
SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key-here")  # Même clé que server.py et dependencies.py
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
    """
    Connexion d'un utilisateur à un tenant spécifique.
    Supporte aussi les super-admins qui peuvent se connecter à n'importe quel tenant.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # D'abord chercher l'utilisateur dans le tenant
    user = await db.users.find_one({
        "tenant_id": tenant.id,
        "email": login.email.lower().strip()
    })
    
    # Si pas trouvé, vérifier si c'est un super-admin
    if not user:
        super_admin = await db.super_admins.find_one({
            "email": login.email.lower().strip()
        })
        
        if super_admin:
            # Vérifier le mot de passe du super-admin
            stored_hash = super_admin.get("mot_de_passe_hash", "")
            if verify_password(login.mot_de_passe, stored_hash):
                # Créer un token spécial pour super-admin accédant à un tenant
                access_token = create_access_token(
                    data={
                        "sub": super_admin["id"],
                        "tenant_id": tenant.id,
                        "role": "admin",  # Accès admin sur le tenant
                        "is_super_admin": True  # Flag pour identifier
                    }
                )
                
                logger.info(f"🔑 Super-admin {login.email} connecté au tenant {tenant_slug}")
                
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "user": {
                        "id": super_admin["id"],
                        "email": super_admin["email"],
                        "nom": super_admin.get("nom", "Super"),
                        "prenom": "Admin",
                        "role": "admin",
                        "is_super_admin": True
                    }
                }
        
        # Ni utilisateur ni super-admin trouvé
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
            "role": user.get("role", "employe"),
            "grade": user.get("grade"),
            "type_emploi": user.get("type_emploi")
        }
    }


@router.get("/{tenant_slug}/auth/me")
async def get_current_user_info(
    tenant_slug: str,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())
):
    """
    Récupère les informations de l'utilisateur connecté.
    Supporte les utilisateurs normaux ET les super-admins.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        is_super_admin = payload.get("is_super_admin", False)
        token_tenant_id = payload.get("tenant_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        
        # Vérifier que le token est pour ce tenant
        if token_tenant_id != tenant.id:
            raise HTTPException(status_code=403, detail="Token non valide pour ce tenant")
        
        if is_super_admin:
            # C'est un super-admin connecté à un tenant
            super_admin = await db.super_admins.find_one({"id": user_id})
            if not super_admin:
                raise HTTPException(status_code=401, detail="Super admin non trouvé")
            
            return {
                "id": super_admin["id"],
                "email": super_admin["email"],
                "nom": super_admin.get("nom", "Super"),
                "prenom": "Admin",
                "role": "admin",
                "tenant_id": tenant.id,
                "is_super_admin": True
            }
        else:
            # Utilisateur normal
            user = await db.users.find_one({"id": user_id})
            if not user:
                raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
            
            return {
                "id": user["id"],
                "email": user["email"],
                "nom": user.get("nom", ""),
                "prenom": user.get("prenom", ""),
                "role": user.get("role", "employe"),
                "tenant_id": user.get("tenant_id"),
                "grade": user.get("grade"),
                "type_emploi": user.get("type_emploi"),
                "telephone": user.get("telephone"),
                "photo_profil": user.get("photo_profil"),
                "numero_employe": user.get("numero_employe"),
                "statut": user.get("statut", "Actif")
            }
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide: {str(e)}")


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
    
    # Envoyer l'email avec le lien de réinitialisation
    try:
        import resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        
        if resend_api_key:
            resend.api_key = resend_api_key
            
            # Construire le lien de réinitialisation
            frontend_url = os.environ.get('FRONTEND_URL', 'https://profiremanager.com')
            reset_link = f"{frontend_url}/{tenant_slug}/reset-password?token={reset_token}"
            
            user_name = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or "Utilisateur"
            
            html_content = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1e40af;">Réinitialisation de mot de passe</h2>
                <p>Bonjour {user_name},</p>
                <p>Vous avez demandé la réinitialisation de votre mot de passe pour ProFireManager.</p>
                <p>Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
                <p style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" style="background-color: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Réinitialiser mon mot de passe
                    </a>
                </p>
                <p style="color: #666; font-size: 14px;">Ce lien expire dans 24 heures.</p>
                <p style="color: #666; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px;">ProFireManager - Gestion des services d'incendie</p>
            </div>
            """
            
            resend.Emails.send({
                "from": "ProFireManager <noreply@profiremanager.com>",
                "to": [user["email"]],
                "subject": "Réinitialisation de votre mot de passe - ProFireManager",
                "html": html_content
            })
            
            logger.info(f"✅ Email de réinitialisation envoyé à {request.email}")
        else:
            logger.warning(f"⚠️ RESEND_API_KEY non configuré - email non envoyé pour {request.email}")
            logger.info(f"Token de reset (debug): {reset_token}")
    except Exception as e:
        logger.error(f"❌ Erreur envoi email reset password: {str(e)}")
        # On ne fait pas échouer la requête, l'utilisateur ne doit pas savoir
    
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
