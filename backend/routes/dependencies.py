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
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os
import jwt
import uuid
import logging
import re
import bcrypt
from functools import lru_cache

# Charger les variables d'environnement AVANT toute autre configuration
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# ==================== CONFIGURATION ====================

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager')  # Défaut pour compatibilité
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-here')  # Même valeur que server.py
JWT_ALGORITHM = "HS256"
SECRET_KEY = JWT_SECRET  # Alias pour compatibilité
ALGORITHM = JWT_ALGORITHM  # Alias pour compatibilité
SUPER_ADMIN_TOKEN_EXPIRE_MINUTES = 2 * 60  # 2 heures pour super-admins (sécurité)
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 heures pour utilisateurs normaux

# Connexion MongoDB asynchrone (réutilisée par tous les modules)
_client = None
_db = None

def get_db():
    """Retourne la connexion à la base de données MongoDB avec reconnexion automatique"""
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=10000,  # 10 secondes timeout
            connectTimeoutMS=10000,
            socketTimeoutMS=30000,
            maxPoolSize=50,
            minPoolSize=5,
            maxIdleTimeMS=60000,  # Fermer les connexions inactives après 60s
            retryWrites=True,
            retryReads=True,
            readPreference='primary'  # Forcer lecture depuis le primaire
        )
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
    signature_url: Optional[str] = None  # URL de la signature numérique (JPEG/PNG)
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


class Notification(BaseModel):
    """Modèle notification pour alertes utilisateurs"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    destinataire_id: str
    type: str  # remplacement_disponible, conge_approuve, conge_refuse, conge_demande, planning_assigne
    titre: str
    message: str
    lien: Optional[str] = None  # Lien vers la page concernée
    statut: str = "non_lu"  # non_lu, lu
    data: Optional[Dict[str, Any]] = {}  # Données supplémentaires (demande_id, etc.)
    date_creation: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date_lecture: Optional[str] = None


class Activite(BaseModel):
    """Modèle activité pour le journal d'activités"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    type_activite: str
    description: str
    user_id: Optional[str] = None
    user_nom: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ValidationCompetence(BaseModel):
    """Validation manuelle d'une compétence pour un employé (rattrapage)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    competence_id: str
    justification: str
    date_validation: str
    duree_heures: float = 0  # Durée de la formation en heures
    validee_par: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ValidationCompetenceCreate(BaseModel):
    user_id: str
    competence_id: str
    justification: str
    date_validation: str
    duree_heures: float = 0  # Durée de la formation en heures


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
    Supporte les utilisateurs normaux ET les super-admins connectés à un tenant.
    Lève une HTTPException 401 si le token est invalide.
    """
    token = credentials.credentials
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub") or payload.get("user_id")
        is_super_admin = payload.get("is_super_admin", False)
        tenant_id = payload.get("tenant_id")
        
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
        
        if is_super_admin:
            # Super-admin connecté à un tenant - créer un User virtuel
            super_admin_doc = await db.super_admins.find_one({"id": user_id})
            if not super_admin_doc:
                raise HTTPException(status_code=401, detail="Super admin non trouvé")
            
            # Retourner un User avec les infos du super-admin
            return User(
                id=super_admin_doc["id"],
                email=super_admin_doc["email"],
                nom=super_admin_doc.get("nom", "Super"),
                prenom="Admin",
                role="admin",
                tenant_id=tenant_id or "",
                statut="Actif"
            )
        
        # Utilisateur normal - récupérer depuis la DB
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


# ==================== FONCTIONS MOT DE PASSE ====================

def validate_complex_password(password: str) -> bool:
    """
    Valide qu'un mot de passe respecte les critères de complexité :
    - 8 caractères minimum
    - 1 majuscule
    - 1 chiffre  
    - 1 caractère spécial (!@#$%^&*+-?())
    """
    if len(password) < 8:
        return False
    
    has_uppercase = bool(re.search(r'[A-Z]', password))
    has_digit = bool(re.search(r'\d', password))
    has_special = bool(re.search(r'[!@#$%^&*+\-?()]', password))
    
    return has_uppercase and has_digit and has_special


def get_password_hash(password: str) -> str:
    """
    Crée un hash bcrypt du mot de passe (sécurisé et standard).
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie un mot de passe contre son hash bcrypt.
    Système simplifié: UNIQUEMENT bcrypt pour stabilité maximale.
    
    Retourne True si le mot de passe correspond, False sinon.
    """
    try:
        password_bytes = plain_password.encode('utf-8')
        
        # Vérifier si c'est un hash bcrypt valide
        if not hashed_password or not hashed_password.startswith('$2'):
            logger.error("Hash invalide ou non-bcrypt détecté")
            return False
        
        if isinstance(hashed_password, str):
            hash_bytes = hashed_password.encode('utf-8')
        else:
            hash_bytes = hashed_password
        
        result = bcrypt.checkpw(password_bytes, hash_bytes)
        return result
        
    except Exception as e:
        logger.error(f"Erreur vérification mot de passe: {e}")
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Crée un token JWT avec expiration"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt


# ==================== EMAIL FUNCTIONS ====================

def send_welcome_email(user_email: str, user_name: str, user_role: str, temp_password: str, tenant_slug: str = ""):
    """Envoie un email de bienvenue à un nouvel utilisateur"""
    try:
        import resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning("RESEND_API_KEY non configuré - email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        login_url = f"https://profiremanager.com/{tenant_slug}/login" if tenant_slug else "https://profiremanager.com/login"
        
        html_content = f"""
        <h1>Bienvenue sur ProFireManager</h1>
        <p>Bonjour {user_name},</p>
        <p>Votre compte a été créé avec le rôle: <strong>{user_role}</strong></p>
        <p>Voici vos identifiants temporaires:</p>
        <ul>
            <li>Email: {user_email}</li>
            <li>Mot de passe: {temp_password}</li>
        </ul>
        <p><a href="{login_url}">Se connecter</a></p>
        <p>Nous vous recommandons de changer votre mot de passe après la première connexion.</p>
        """
        
        resend.Emails.send({
            "from": "ProFireManager <noreply@profiremanager.ca>",
            "to": [user_email],
            "subject": "Bienvenue sur ProFireManager",
            "html": html_content
        })
        return True
    except Exception as e:
        logger.error(f"Erreur envoi email de bienvenue: {e}")
        return False


def send_super_admin_welcome_email(user_email: str, user_name: str, temp_password: str):
    """Envoie un email de bienvenue à un nouveau super admin"""
    try:
        import resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        if not resend_api_key:
            logger.warning("RESEND_API_KEY non configuré - email non envoyé")
            return False
        
        resend.api_key = resend_api_key
        
        html_content = f"""
        <h1>Bienvenue - Accès Super Admin ProFireManager</h1>
        <p>Bonjour {user_name},</p>
        <p>Vous avez été ajouté comme <strong>Super Administrateur</strong> de ProFireManager.</p>
        <p>Voici vos identifiants:</p>
        <ul>
            <li>Email: {user_email}</li>
            <li>Mot de passe: {temp_password}</li>
        </ul>
        <p><a href="https://profiremanager.com/super-admin">Accéder au panneau Super Admin</a></p>
        <p><strong>Important:</strong> Changez votre mot de passe dès votre première connexion.</p>
        """
        
        resend.Emails.send({
            "from": "ProFireManager <noreply@profiremanager.ca>",
            "to": [user_email],
            "subject": "Accès Super Admin - ProFireManager",
            "html": html_content
        })
        return True
    except Exception as e:
        logger.error(f"Erreur envoi email super admin: {e}")
        return False


# ==================== NOTIFICATIONS ====================

async def creer_notification(
    tenant_id: str,
    user_id: str = None,  # Nouveau paramètre
    type_notification: str = None,
    titre: str = "",
    message: str = "",
    lien: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    envoyer_email: bool = True,
    destinataires_multiples: Optional[List[str]] = None,
    # Rétrocompatibilité avec l'ancien format
    destinataire_id: str = None,
    type: str = None
):
    """
    Crée une notification dans la base de données et envoie un email si activé.
    Respecte les préférences de notification de l'utilisateur.
    
    Args:
        tenant_id: ID du tenant
        user_id: ID du destinataire principal (ou destinataire_id pour rétrocompatibilité)
        type_notification: Type de notification (ou type pour rétrocompatibilité)
        titre: Titre de la notification
        message: Message de la notification
        lien: Lien vers la page concernée
        data: Données supplémentaires
        envoyer_email: Si True, envoie aussi un email (selon préférences)
        destinataires_multiples: Liste d'IDs pour notifier plusieurs personnes
    """
    from services.email_service import send_notification_email
    
    # Rétrocompatibilité
    actual_user_id = user_id or destinataire_id
    actual_type = type_notification or type
    
    if not actual_user_id and not destinataires_multiples:
        logger.warning("creer_notification appelé sans destinataire")
        return None
    
    destinataires = destinataires_multiples if destinataires_multiples else [actual_user_id]
    notifications_creees = []
    
    for dest_id in destinataires:
        if not dest_id:
            continue
            
        # Récupérer les préférences de l'utilisateur
        user = await db.users.find_one({"id": dest_id, "tenant_id": tenant_id})
        if not user:
            continue
        
        preferences = user.get("preferences_notifications", {})
        email_actif = preferences.get("email_actif", True)
        
        # Créer la notification interne (toujours)
        notification = Notification(
            tenant_id=tenant_id,
            destinataire_id=dest_id,
            type=actual_type,
            titre=titre,
            message=message,
            lien=lien,
            data=data or {}
        )
        await db.notifications.insert_one(notification.dict())
        notifications_creees.append(notification)
        
        # Envoyer email si activé dans les préférences
        if envoyer_email and email_actif and user.get("email"):
            try:
                # Récupérer le tenant pour le branding
                tenant = await db.tenants.find_one({"id": tenant_id})
                tenant_nom = tenant.get("nom", "ProFireManager") if tenant else "ProFireManager"
                
                await send_notification_email(
                    to_email=user["email"],
                    subject=f"[{tenant_nom}] {titre}",
                    notification_titre=titre,
                    notification_message=message,
                    notification_lien=lien,
                    user_prenom=user.get("prenom", "")
                )
            except Exception as e:
                logger.warning(f"Erreur envoi email notification à {user.get('email')}: {e}")
    
    return notifications_creees[0] if len(notifications_creees) == 1 else notifications_creees


async def notifier_admins_superviseurs(
    tenant_id: str,
    type_notification: str,
    titre: str,
    message: str,
    lien: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
    roles: List[str] = ["admin", "superviseur"]
):
    """
    Notifie tous les admins et/ou superviseurs d'un tenant.
    Utilisé pour les demandes qui nécessitent une approbation.
    """
    # Récupérer tous les admins/superviseurs
    admins = await db.users.find({
        "tenant_id": tenant_id,
        "role": {"$in": roles},
        "statut": "Actif"
    }).to_list(100)
    
    if not admins:
        return []
    
    destinataires = [admin["id"] for admin in admins]
    
    return await creer_notification(
        tenant_id=tenant_id,
        user_id=destinataires[0],  # Sera ignoré car on utilise destinataires_multiples
        type_notification=type_notification,
        titre=titre,
        message=message,
        lien=lien,
        data=data,
        destinataires_multiples=destinataires
    )



# ==================== ACTIVITÉS ====================

async def creer_activite(
    tenant_id: str, 
    type_activite: str, 
    description: str, 
    user_id: Optional[str] = None, 
    user_nom: Optional[str] = None,
    data: Optional[dict] = None
):
    """Helper pour créer une activité dans le système avec auto-nettoyage après 30 jours"""
    from datetime import timedelta
    
    activite = Activite(
        tenant_id=tenant_id,
        type_activite=type_activite,
        description=description,
        user_id=user_id,
        user_nom=user_nom
    )
    
    activite_dict = activite.dict()
    if data:
        activite_dict["data"] = data
    
    await db.activites.insert_one(activite_dict)
    
    # Nettoyage automatique des activités > 30 jours
    date_limite = datetime.now(timezone.utc) - timedelta(days=30)
    await db.activites.delete_many({
        "tenant_id": tenant_id,
        "created_at": {"$lt": date_limite}
    })
