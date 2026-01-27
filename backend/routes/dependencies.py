"""
Dépendances partagées pour les routes API
==========================================

Ce fichier centralise les dépendances communes utilisées par tous les modules de routes :
- Connexion MongoDB
- Authentification (get_current_user)
- Fonctions utilitaires (get_tenant_from_slug, clean_mongo_doc)
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
from functools import lru_cache

# ==================== CONFIGURATION ====================

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')
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


class SuperAdminUser(BaseModel):
    """Modèle pour représenter un super-admin comme un User compatible"""
    id: str
    email: str
    nom: str
    prenom: str = ""
    role: str = "super_admin"
    tenant_id: str = ""  # Super-admins n'ont pas de tenant spécifique
    is_super_admin: bool = True
    
    class Config:
        extra = "allow"


async def get_current_user_or_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    Dépendance FastAPI qui authentifie à la fois les utilisateurs réguliers ET les super-administrateurs.
    
    Cette dépendance est nécessaire pour les routes qui doivent être accessibles par les deux types d'utilisateurs,
    comme la configuration SFTP qui peut être gérée depuis le tableau de bord super-admin.
    
    Retourne un objet User (ou SuperAdminUser compatible) avec le flag is_super_admin si applicable.
    """
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub") or payload.get("user_id")
        role = payload.get("role", "")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        
        # Vérifier si c'est un super-admin
        if role == "super_admin":
            super_admin_doc = await db.super_admins.find_one({"id": user_id})
            
            if not super_admin_doc:
                raise HTTPException(status_code=401, detail="Super administrateur non trouvé")
            
            # Retourner un objet compatible avec User
            cleaned = clean_mongo_doc(super_admin_doc)
            return SuperAdminUser(
                id=cleaned.get("id"),
                email=cleaned.get("email", ""),
                nom=cleaned.get("nom", ""),
                prenom=cleaned.get("prenom", ""),
                role="super_admin",
                is_super_admin=True
            )
        
        # Sinon, c'est un utilisateur régulier
        user_doc = await db.users.find_one({"id": user_id})
        
        if not user_doc:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        
        user = User(**clean_mongo_doc(user_doc))
        # Ajouter le flag is_super_admin = False pour cohérence
        user.is_super_admin = False
        return user
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide: {str(e)}")


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
