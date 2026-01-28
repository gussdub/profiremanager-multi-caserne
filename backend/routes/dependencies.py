"""
Dépendances partagées pour les routes API
==========================================

Ce fichier centralise les dépendances communes utilisées par tous les modules de routes :
- Connexion MongoDB
- Authentification (get_current_user, get_super_admin)
- Fonctions utilitaires (get_tenant_from_slug, clean_mongo_doc, password utils)
- Modèles Pydantic de base

Usage dans un module de routes:
    from routes.dependencies import db, get_current_user, get_tenant_from_slug, clean_mongo_doc, User
"""

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import os
import jwt
import uuid
import logging
import re
import bcrypt
from functools import lru_cache

logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager')  # Même défaut que server.py
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')  # Même valeur que server.py
JWT_ALGORITHM = "HS256"

# Connexion MongoDB asynchrone (réutilisée par tous les modules)
_client = None
_db = None

def get_db():
    """Retourne la connexion à la base de données MongoDB"""
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(MONGO_URL)
        _db = _client[DB_NAME]
    return _db

# Instance directe pour import simple
db = get_db()

# Security
security = HTTPBearer()


# ==================== MODÈLES DE BASE ====================

class User(BaseModel):
    """Modèle utilisateur de base"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    nom: str
    prenom: str
    role: str = "employe"  # admin, superviseur, employe
    tenant_id: str
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
    mot_de_passe_hash: Optional[str] = None
    photo_profil: Optional[str] = None
    tailles_epi: Optional[Dict[str, str]] = {}  # Tailles EPI de l'employé
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None
    
    class Config:
        extra = "allow"


class Tenant(BaseModel):
    """Modèle tenant (caserne)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    slug: str
    adresse: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        extra = "allow"


# ==================== CACHE TENANT ====================

# Cache simple pour les tenants (évite les requêtes répétées)
_tenant_cache: Dict[str, Tenant] = {}
_tenant_cache_ttl: Dict[str, float] = {}
TENANT_CACHE_DURATION = 300  # 5 minutes


# ==================== FONCTIONS UTILITAIRES ====================

def clean_mongo_doc(doc: dict) -> dict:
    """
    Nettoie un document MongoDB pour la sérialisation JSON.
    Supprime _id et convertit les ObjectId en strings.
    """
    if doc is None:
        return None
    
    cleaned = {}
    for key, value in doc.items():
        if key == '_id':
            continue
        elif hasattr(value, '__str__') and type(value).__name__ == 'ObjectId':
            cleaned[key] = str(value)
        elif isinstance(value, dict):
            cleaned[key] = clean_mongo_doc(value)
        elif isinstance(value, list):
            cleaned[key] = [
                clean_mongo_doc(item) if isinstance(item, dict) else item 
                for item in value
            ]
        else:
            cleaned[key] = value
    
    return cleaned


async def get_tenant_from_slug(tenant_slug: str) -> Tenant:
    """
    Récupère un tenant par son slug avec mise en cache.
    Lève une HTTPException 404 si non trouvé.
    """
    import time
    
    # Vérifier le cache
    now = time.time()
    if tenant_slug in _tenant_cache:
        if now - _tenant_cache_ttl.get(tenant_slug, 0) < TENANT_CACHE_DURATION:
            return _tenant_cache[tenant_slug]
    
    # Requête DB
    tenant_doc = await db.tenants.find_one({"slug": tenant_slug})
    
    if not tenant_doc:
        raise HTTPException(status_code=404, detail=f"Caserne '{tenant_slug}' non trouvée")
    
    tenant = Tenant(**clean_mongo_doc(tenant_doc))
    
    # Mettre en cache
    _tenant_cache[tenant_slug] = tenant
    _tenant_cache_ttl[tenant_slug] = now
    
    return tenant


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    Dépendance FastAPI pour récupérer l'utilisateur courant depuis le token JWT.
    Lève une HTTPException 401 si le token est invalide.
    """
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub") or payload.get("user_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        
        # Récupérer l'utilisateur depuis la DB
        user_doc = await db.users.find_one({"id": user_id})
        
        if not user_doc:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        
        return User(**clean_mongo_doc(user_doc))
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide: {str(e)}")


class SuperAdmin(BaseModel):
    """Modèle Super Admin - identique à celui de server.py"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    nom: str
    mot_de_passe_hash: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    class Config:
        extra = "allow"


async def get_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> SuperAdmin:
    """
    Authentifie et retourne le super admin.
    Identique à la fonction dans server.py pour assurer la cohérence.
    Utilisée pour les routes SFTP accessibles uniquement aux super-admins.
    """
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        admin_id: str = payload.get("sub")
        role: str = payload.get("role")
        
        if role != "super_admin":
            raise HTTPException(status_code=403, detail="Accès super admin requis")
            
        admin = await db.super_admins.find_one({"id": admin_id})
        if not admin:
            raise HTTPException(status_code=401, detail="Super admin non trouvé")
        
        return SuperAdmin(**clean_mongo_doc(admin))
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")


# ==================== MODÈLES SUPER ADMIN ====================

class TenantCreate(BaseModel):
    """Modèle pour créer un tenant"""
    slug: str
    nom: str
    adresse: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    telephone: str = ""
    email_contact: str = ""
    date_creation: Optional[str] = None
    centrale_911_id: Optional[str] = None


class SuperAdminLogin(BaseModel):
    """Modèle pour login super admin"""
    email: str
    mot_de_passe: str


class AuditLog(BaseModel):
    """Journal d'audit pour les actions super-admin"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str
    admin_email: str
    admin_nom: str
    action: str
    details: Dict[str, Any] = {}
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    tenant_nom: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def log_super_admin_action(
    admin: SuperAdmin,
    action: str,
    details: Dict[str, Any] = None,
    tenant_id: str = None,
    tenant_slug: str = None,
    tenant_nom: str = None,
    ip_address: str = None,
    user_agent: str = None
):
    """
    Enregistre une action super-admin dans le journal d'audit
    """
    try:
        audit_entry = AuditLog(
            admin_id=admin.id,
            admin_email=admin.email,
            admin_nom=admin.nom,
            action=action,
            details=details or {},
            tenant_id=tenant_id,
            tenant_slug=tenant_slug,
            tenant_nom=tenant_nom,
            ip_address=ip_address,
            user_agent=user_agent
        )
        await db.audit_logs.insert_one(audit_entry.dict())
        logger.info(f"📝 [AUDIT] {admin.email} - {action}" + (f" - Tenant: {tenant_slug}" if tenant_slug else ""))
    except Exception as e:
        logger.error(f"Erreur log audit: {e}")


async def verify_tenant_access(user: User, tenant_slug: str) -> Tenant:
    """
    Vérifie que l'utilisateur a accès au tenant demandé.
    Retourne le tenant si l'accès est autorisé.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    return tenant


def require_role(*roles: str):
    """
    Décorateur/dépendance pour vérifier le rôle de l'utilisateur.
    Usage: @router.get("/...", dependencies=[Depends(require_role("admin"))])
    """
    async def check_role(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Accès réservé aux rôles: {', '.join(roles)}"
            )
        return current_user
    return check_role


# ==================== FONCTIONS D'ACTIVITÉ ====================

async def creer_activite(
    tenant_id: str,
    type_activite: str,
    description: str,
    user_id: Optional[str] = None,
    user_nom: Optional[str] = None,
    metadata: Optional[Dict] = None
):
    """Crée une entrée d'activité/notification"""
    activite = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "type": type_activite,
        "description": description,
        "user_id": user_id,
        "user_nom": user_nom,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc),
        "lu": False
    }
    
    await db.notifications.insert_one(activite)
    return activite
