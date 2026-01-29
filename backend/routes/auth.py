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
            frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
            reset_link = f"{frontend_url}/{tenant_slug}/reset-password?token={reset_token}"
            
            user_name = f"{user.get('prenom', '')} {user.get('nom', '')}".strip() or "Utilisateur"
            
            # Logo ProFireManager encodé en base64 (optimisé ~5.6KB)
            logo_base64 = "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"
            
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                                <!-- Header avec logo -->
                                <tr>
                                    <td align="center" style="padding: 40px 40px 20px 40px;">
                                        <img src="data:image/png;base64,{logo_base64}" alt="ProFireManager" style="width: 120px; height: auto;" />
                                        <p style="color: #666666; font-size: 14px; margin: 15px 0 0 0;">Système de gestion des services d'incendie</p>
                                    </td>
                                </tr>
                                
                                <!-- Contenu principal -->
                                <tr>
                                    <td style="padding: 20px 40px;">
                                        <h2 style="color: #1f2937; font-size: 20px; margin: 0 0 20px 0;">Bonjour {user_name},</h2>
                                        <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                                            Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte ProFireManager.
                                        </p>
                                        
                                        <!-- Avertissement sécurité -->
                                        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                                            <p style="color: #92400e; font-size: 14px; margin: 0 0 5px 0; font-weight: bold;">⚠️ IMPORTANT - Sécurité</p>
                                            <p style="color: #92400e; font-size: 13px; margin: 0 0 10px 0;">
                                                Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste inchangé.
                                            </p>
                                            <p style="color: #92400e; font-size: 13px; margin: 0;">
                                                Ce lien est valide pendant <strong>1 heure</strong> seulement.
                                            </p>
                                        </div>
                                        
                                        <!-- Bouton principal -->
                                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                                            <tr>
                                                <td align="center">
                                                    <a href="{reset_link}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 15px 40px; border-radius: 8px; font-size: 16px; font-weight: bold;">
                                                        🔐 Réinitialiser mon mot de passe
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Lien alternatif -->
                                        <div style="background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 15px 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                                            <p style="color: #1f2937; font-size: 13px; margin: 0 0 10px 0; font-weight: bold;">💡 Le lien ne fonctionne pas?</p>
                                            <p style="color: #6b7280; font-size: 12px; margin: 0;">
                                                Copiez et collez cette adresse dans votre navigateur :
                                            </p>
                                            <p style="color: #3b82f6; font-size: 11px; margin: 10px 0 0 0; word-break: break-all;">
                                                <a href="{reset_link}" style="color: #3b82f6;">{reset_link}</a>
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="padding: 30px 40px; border-top: 1px solid #e5e7eb;">
                                        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0 0 10px 0;">
                                            Cet email a été envoyé automatiquement par ProFireManager.<br>
                                            Pour des questions de sécurité, contactez votre administrateur.
                                        </p>
                                        <p style="color: #6b7280; font-size: 11px; text-align: center; margin: 0;">
                                            ProFireManager - Système de gestion des services d'incendie du Canada
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            """
            
            resend.Emails.send({
                "from": "ProFireManager <noreply@profiremanager.ca>",
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
    
    # Comparer les dates (gérer les datetime naive et aware)
    expires_at = token_data["expires_at"]
    now = datetime.now(timezone.utc)
    
    # Si expires_at n'a pas de timezone, le rendre aware en UTC
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < now:
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
    
    # Comparer les dates (gérer les datetime naive et aware)
    expires_at = token_data["expires_at"]
    now = datetime.now(timezone.utc)
    
    # Si expires_at n'a pas de timezone, le rendre aware en UTC
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < now:
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
