"""
Routes API pour le module Authentication
========================================

Gestion de l'authentification : login, logout, reset password.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import secrets
import hashlib

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User
)

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ==================== HELPERS ====================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash"""
    # Support bcrypt ou SHA256
    if hashed_password.startswith("$2"):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
        except:
            pass
    # Fallback SHA256
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password

def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt si disponible, sinon SHA256"""
    try:
        import bcrypt
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    except:
        return hashlib.sha256(password.encode()).hexdigest()


# ==================== ROUTES MIGRÉES DE SERVER.PY ====================

# POST admin/auth/login
@router.post("/admin/auth/login")
async def super_admin_login(login: SuperAdminLogin):
    """Authentification du super admin avec migration automatique SHA256 -> bcrypt"""
    try:
        logging.info(f"🔑 Tentative de connexion Super Admin: {login.email}")
        
        admin_data = await db.super_admins.find_one({"email": login.email})
        
        if not admin_data:
            logging.warning(f"❌ Super Admin non trouvé: {login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Super Admin trouvé: {admin_data.get('nom')} (id: {admin_data.get('id')})")
        
        current_hash = admin_data.get("mot_de_passe_hash", "")
        hash_type = "bcrypt" if current_hash.startswith('$2') else "SHA256"
        logging.info(f"🔐 Type de hash détecté: {hash_type}")
        
        if not verify_password(login.mot_de_passe, current_hash):
            logging.warning(f"❌ Mot de passe incorrect pour Super Admin {login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Mot de passe vérifié avec succès pour Super Admin {login.email}")
        
        admin = SuperAdmin(**admin_data)
        # Token avec expiration de 2h pour les super-admins (sécurité)
        access_token = create_access_token(
            data={"sub": admin.id, "role": "super_admin"},
            expires_delta=timedelta(minutes=SUPER_ADMIN_TOKEN_EXPIRE_MINUTES)
        )
        
        logging.info(f"✅ Token JWT créé pour Super Admin {login.email}")
        
        # Enregistrer l'action dans le journal d'audit
        await log_super_admin_action(
            admin=admin,
            action="login",
            details={"method": "password"}
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "admin": {
                "id": admin.id,
                "email": admin.email,
                "nom": admin.nom
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du login Super Admin pour {login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# GET admin/auth/me
@router.get("/admin/auth/me")
async def get_super_admin_me(admin: SuperAdmin = Depends(get_super_admin)):
    """Récupère les informations du super admin authentifié"""
    return {
        "id": admin.id,
        "email": admin.email,
        "nom": admin.nom,
        "role": "super_admin"
    }


# POST auth/login
@router.post("/auth/login")
async def login_legacy(user_login: UserLogin):
    """Login legacy - redirige automatiquement vers le tenant de l'utilisateur avec migration automatique SHA256 -> bcrypt"""
    try:
        logging.info(f"🔑 Tentative de connexion legacy pour {user_login.email}")
        
        user_data = await db.users.find_one({"email": user_login.email})
        
        if not user_data:
            logging.warning(f"❌ Utilisateur non trouvé (legacy): {user_login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Utilisateur trouvé (legacy): {user_data.get('nom')} {user_data.get('prenom')} (id: {user_data.get('id')})")
        
        current_hash = user_data.get("mot_de_passe_hash", "")
        hash_type = "bcrypt" if current_hash.startswith('$2') else "SHA256"
        logging.info(f"🔐 Type de hash détecté: {hash_type}")
        
        if not verify_password(user_login.mot_de_passe, current_hash):
            logging.warning(f"❌ Mot de passe incorrect (legacy) pour {user_login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Mot de passe vérifié avec succès (legacy) pour {user_login.email}")
        
        user = User(**user_data)
        tenant_data = await db.tenants.find_one({"id": user.tenant_id})
        
        if not tenant_data:
            logging.error(f"❌ Tenant non trouvé pour l'utilisateur {user_login.email}")
            raise HTTPException(status_code=404, detail="Caserne non trouvée")
        
        tenant = Tenant(**tenant_data)
        access_token = create_access_token(data={
            "sub": user.id,
            "tenant_id": tenant.id,
            "tenant_slug": tenant.slug
        })
        
        logging.info(f"✅ Token JWT créé (legacy) pour {user_login.email}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "tenant": {
                "id": tenant.id,
                "slug": tenant.slug,
                "nom": tenant.nom,
                "parametres": tenant.parametres  # Inclure les paramètres du tenant
            },
            "user": {
                "id": user.id,
                "nom": user.nom,
                "prenom": user.prenom,
                "email": user.email,
                "role": user.role,
                "grade": user.grade,
                "type_emploi": user.type_emploi,
                "photo_profil": user.photo_profil  # Ajouter la photo de profil
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du login legacy pour {user_login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# GET {tenant_slug}/auth/me
@router.get("/{tenant_slug}/auth/me")
async def get_current_user_info(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant (optionnel ici car déjà validé dans le token)
    tenant = await get_tenant_from_slug(tenant_slug)
    
    return {
        "id": current_user.id,
        "tenant_id": current_user.tenant_id,
        "nom": current_user.nom,
        "prenom": current_user.prenom,
        "email": current_user.email,
        "role": current_user.role,
        "grade": current_user.grade,
        "type_emploi": current_user.type_emploi,
        "formations": current_user.formations,
        "photo_profil": current_user.photo_profil
    }


# POST {tenant_slug}/auth/login
@router.post("/{tenant_slug}/auth/login")
async def tenant_login(tenant_slug: str, user_login: UserLogin):
    """Login pour un tenant spécifique avec migration automatique SHA256 -> bcrypt
    Les super-admins peuvent aussi se connecter sur n'importe quel tenant avec leurs identifiants"""
    try:
        logging.info(f"🔑 Tentative de connexion pour {user_login.email} sur tenant {tenant_slug}")
        
        # Vérifier que le tenant existe et est actif
        tenant = await get_tenant_from_slug(tenant_slug)
        logging.warning(f"✅ Tenant trouvé: {tenant.nom} (id: {tenant.id})")
        
        # D'abord, vérifier si c'est un super-admin qui essaie de se connecter
        super_admin_data = await db.super_admins.find_one({"email": user_login.email})
        if super_admin_data:
            logging.info(f"🔐 Super-Admin détecté: {user_login.email}")
            
            # Vérifier le mot de passe du super-admin
            current_hash = super_admin_data.get("mot_de_passe_hash", "")
            if verify_password(user_login.mot_de_passe, current_hash):
                logging.info(f"✅ Super-Admin {user_login.email} authentifié sur tenant {tenant_slug}")
                
                # Créer un token avec les droits admin sur ce tenant (expiration 2h pour super-admin)
                access_token = create_access_token(
                    data={
                        "sub": super_admin_data["id"],
                        "email": super_admin_data["email"],
                        "tenant_id": tenant.id,
                        "tenant_slug": tenant.slug,
                        "is_super_admin": True  # Flag pour identifier un super-admin
                    },
                    expires_delta=timedelta(minutes=SUPER_ADMIN_TOKEN_EXPIRE_MINUTES)
                )
                
                # Enregistrer l'action dans le journal d'audit
                await log_super_admin_action(
                    admin=SuperAdmin(**super_admin_data),
                    action="tenant_access",
                    details={"login_method": "password"},
                    tenant_id=tenant.id,
                    tenant_slug=tenant.slug,
                    tenant_nom=tenant.nom
                )
                
                return {
                    "access_token": access_token,
                    "token_type": "bearer",
                    "tenant": {
                        "id": tenant.id,
                        "slug": tenant.slug,
                        "nom": tenant.nom,
                        "parametres": tenant.parametres
                    },
                    "user": {
                        "id": super_admin_data["id"],
                        "nom": super_admin_data["nom"],
                        "prenom": "Super-Admin",
                        "email": super_admin_data["email"],
                        "role": "admin",  # Droits admin sur le tenant
                        "grade": "Super-Administrateur",
                        "type_emploi": "temps_plein",
                        "photo_profil": None,
                        "is_super_admin": True
                    }
                }
            else:
                logging.warning(f"❌ Mot de passe incorrect pour Super-Admin {user_login.email}")
                raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        # Sinon, chercher l'utilisateur dans ce tenant
        logging.warning(f"🔍 Recherche utilisateur avec email={user_login.email} et tenant_id={tenant.id}")
        user_data = await db.users.find_one({
            "email": user_login.email,
            "tenant_id": tenant.id
        })
        
        # Debug: chercher sans tenant_id
        if not user_data:
            user_any = await db.users.find_one({"email": user_login.email})
            if user_any:
                logging.warning(f"🔍 User existe mais avec tenant_id={user_any.get('tenant_id')} (attendu: {tenant.id})")
            logging.warning(f"❌ Utilisateur non trouvé: {user_login.email} dans tenant {tenant_slug}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Utilisateur trouvé: {user_data.get('nom')} {user_data.get('prenom')} (id: {user_data.get('id')})")
        
        # Vérifier que l'utilisateur est actif
        if user_data.get("statut") != "Actif":
            logging.warning(f"❌ Tentative de connexion d'un utilisateur inactif: {user_login.email}")
            raise HTTPException(
                status_code=403, 
                detail="Votre compte est désactivé. Veuillez contacter votre administrateur."
            )
        
        logging.info(f"✅ Statut de l'utilisateur vérifié: {user_data.get('statut')}")
        
        current_hash = user_data.get("mot_de_passe_hash", "")
        hash_type = "bcrypt" if current_hash.startswith('$2') else "SHA256"
        logging.info(f"🔐 Type de hash détecté: {hash_type}")
        
        # Vérifier le mot de passe
        if not verify_password(user_login.mot_de_passe, current_hash):
            logging.warning(f"❌ Mot de passe incorrect pour {user_login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Mot de passe vérifié avec succès pour {user_login.email}")
        
        user = User(**user_data)
        
        # Inclure tenant_id dans le token
        access_token = create_access_token(data={
            "sub": user.id,
            "email": user.email,  # Ajout de l'email pour le fallback d'authentification
            "tenant_id": tenant.id,
            "tenant_slug": tenant.slug
        })
        
        logging.info(f"✅ Token JWT créé pour {user_login.email}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "tenant": {
                "id": tenant.id,
                "slug": tenant.slug,
                "nom": tenant.nom,
                "parametres": tenant.parametres  # Inclure les paramètres du tenant
            },
            "user": {
                "id": user.id,
                "nom": user.nom,
                "prenom": user.prenom,
                "email": user.email,
                "role": user.role,
                "grade": user.grade,
                "type_emploi": user.type_emploi,
                "photo_profil": user.photo_profil  # Ajouter la photo de profil
            }
        }
    except HTTPException:
        # Re-lever les HTTPExceptions sans les logger à nouveau
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du login pour {user_login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# POST {tenant_slug}/auth/forgot-password
@router.post("/{tenant_slug}/auth/forgot-password")
async def forgot_password(tenant_slug: str, request: ForgotPasswordRequest):
    """
    Endpoint pour demander une réinitialisation de mot de passe.
    Envoie un email avec un lien contenant un token valide 1 heure.
    """
    try:
        logging.info(f"🔑 Demande de réinitialisation de mot de passe pour {request.email} sur tenant {tenant_slug}")
        
        # Vérifier que le tenant existe
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Chercher l'utilisateur dans ce tenant
        user_data = await db.users.find_one({
            "email": request.email,
            "tenant_id": tenant.id
        })
        
        # Même si l'utilisateur n'existe pas, on retourne un message générique pour la sécurité
        if not user_data:
            logging.warning(f"⚠️ Tentative de réinitialisation pour email inexistant: {request.email} dans tenant {tenant_slug}")
            # Ne pas révéler que l'email n'existe pas
            return {
                "message": "Si cet email existe dans notre système, vous recevrez un lien de réinitialisation.",
                "email_sent": False
            }
        
        # Générer un token unique
        reset_token = str(uuid.uuid4())
        
        # Calculer l'expiration (1 heure)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        
        # Créer l'objet token
        token_obj = PasswordResetToken(
            tenant_id=tenant.id,
            user_id=user_data["id"],
            email=request.email,
            token=reset_token,
            expires_at=expires_at
        )
        
        # Sauvegarder le token dans la base de données
        await db.password_reset_tokens.insert_one(token_obj.dict())
        
        logging.info(f"✅ Token de réinitialisation créé pour {request.email}, expire à {expires_at}")
        
        # Envoyer l'email
        user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
        email_sent = send_password_reset_email(
            user_email=request.email,
            user_name=user_name or request.email,
            reset_token=reset_token,
            tenant_slug=tenant_slug
        )
        
        if email_sent:
            logging.info(f"✅ Email de réinitialisation envoyé avec succès à {request.email}")
        else:
            logging.warning(f"⚠️ L'email n'a pas pu être envoyé à {request.email}")
        
        return {
            "message": "Si cet email existe dans notre système, vous recevrez un lien de réinitialisation.",
            "email_sent": email_sent
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur lors de la demande de réinitialisation pour {request.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# GET {tenant_slug}/auth/verify-reset-token/{token}
@router.get("/{tenant_slug}/auth/verify-reset-token/{token}")
async def verify_reset_token(tenant_slug: str, token: str):
    """
    Vérifie si un token de réinitialisation est valide et non expiré
    """
    try:
        # Vérifier que le tenant existe
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Chercher le token
        token_data = await db.password_reset_tokens.find_one({
            "token": token,
            "tenant_id": tenant.id,
            "used": False
        })
        
        if not token_data:
            raise HTTPException(status_code=404, detail="Token invalide ou déjà utilisé")
        
        # Vérifier l'expiration
        expires_at = token_data["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        elif expires_at.tzinfo is None:
            # Si c'est un datetime sans timezone, on assume UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            raise HTTPException(status_code=400, detail="Ce lien a expiré. Veuillez demander un nouveau lien de réinitialisation.")
        
        return {
            "valid": True,
            "email": token_data["email"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur lors de la vérification du token: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# POST {tenant_slug}/auth/reset-password
@router.post("/{tenant_slug}/auth/reset-password")
async def reset_password(tenant_slug: str, request: ResetPasswordRequest):
    """
    Réinitialise le mot de passe avec un token valide
    """
    try:
        logging.info(f"🔑 Tentative de réinitialisation de mot de passe avec token sur tenant {tenant_slug}")
        
        # Vérifier que le tenant existe
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Chercher le token
        token_data = await db.password_reset_tokens.find_one({
            "token": request.token,
            "tenant_id": tenant.id,
            "used": False
        })
        
        if not token_data:
            logging.warning(f"⚠️ Token invalide ou déjà utilisé: {request.token[:8]}...")
            raise HTTPException(status_code=404, detail="Token invalide ou déjà utilisé")
        
        # Vérifier l'expiration
        expires_at = token_data["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        elif expires_at.tzinfo is None:
            # Si c'est un datetime sans timezone, on assume UTC
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if datetime.now(timezone.utc) > expires_at:
            logging.warning(f"⚠️ Token expiré pour {token_data['email']}")
            raise HTTPException(status_code=400, detail="Ce lien a expiré. Veuillez demander un nouveau lien de réinitialisation.")
        
        # Valider le nouveau mot de passe
        if not validate_complex_password(request.nouveau_mot_de_passe):
            raise HTTPException(
                status_code=400,
                detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial"
            )
        
        # Hacher le nouveau mot de passe avec bcrypt
        nouveau_hash = get_password_hash(request.nouveau_mot_de_passe)
        logging.info(f"🔐 Nouveau mot de passe hashé avec bcrypt pour {token_data['email']}")
        
        # Mettre à jour le mot de passe de l'utilisateur
        result = await db.users.update_one(
            {"id": token_data["user_id"], "tenant_id": tenant.id},
            {"$set": {"mot_de_passe_hash": nouveau_hash}}
        )
        
        if result.modified_count == 0:
            logging.error(f"❌ Échec de la mise à jour du mot de passe pour user_id: {token_data['user_id']}")
            raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du mot de passe")
        
        # Marquer le token comme utilisé
        await db.password_reset_tokens.update_one(
            {"token": request.token},
            {"$set": {"used": True}}
        )
        
        logging.info(f"✅ Mot de passe réinitialisé avec succès pour {token_data['email']}")
        
        return {
            "message": "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.",
            "email": token_data["email"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur lors de la réinitialisation du mot de passe: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

