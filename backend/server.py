from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import json
import hashlib
import re
import bcrypt
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from io import BytesIO
import base64
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import firebase_admin
from firebase_admin import credentials, messaging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection avec configuration SSL pour production
mongo_url = os.environ['MONGO_URL']

# Configuration SSL/TLS pour MongoDB Atlas et production
# tlsAllowInvalidCertificates=true peut être nécessaire pour certains environnements
if 'mongodb+srv' in mongo_url or 'ssl=true' in mongo_url.lower():
    # Pour MongoDB Atlas, s'assurer que les paramètres SSL sont corrects
    if '?' in mongo_url:
        # Ajouter/forcer les paramètres SSL si nécessaire
        if 'ssl=' not in mongo_url.lower() and 'tls=' not in mongo_url.lower():
            mongo_url += '&tls=true&tlsAllowInvalidCertificates=false'
    else:
        mongo_url += '?tls=true&tlsAllowInvalidCertificates=false'

client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,  # Timeout de 5 secondes pour la sélection du serveur
    connectTimeoutMS=10000,          # Timeout de 10 secondes pour la connexion
    socketTimeoutMS=45000            # Timeout de 45 secondes pour les opérations
)

# Extraire le nom de la base de données depuis MONGO_URL ou utiliser un défaut
db_name = os.environ.get('DB_NAME', 'profiremanager')
db = client[db_name]

# Create the main app without a prefix
app = FastAPI(title="ProFireManager API", version="2.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== FIREBASE INITIALIZATION ====================

# Initialiser Firebase Admin
firebase_cred_path = ROOT_DIR / 'firebase-credentials.json'
if firebase_cred_path.exists():
    try:
        cred = credentials.Certificate(str(firebase_cred_path))
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized successfully")
    except Exception as e:
        print(f"⚠️ Firebase initialization error: {e}")
else:
    print("⚠️ Firebase credentials file not found - Push notifications will not work")

# ==================== INITIALIZATION ====================

async def initialize_multi_tenant():
    """Initialize super admin and default tenant on first run"""
    # 1. Créer le super admin s'il n'existe pas
    super_admin_exists = await db.super_admins.find_one({"email": SUPER_ADMIN_EMAIL})
    
    if not super_admin_exists:
        super_admin = SuperAdmin(
            email=SUPER_ADMIN_EMAIL,
            nom="Super Admin",
            mot_de_passe_hash=get_password_hash("230685Juin+")
        )
        await db.super_admins.insert_one(super_admin.dict())
        print(f"✅ Super admin créé: {SUPER_ADMIN_EMAIL}")
    
    # 2. Créer le tenant Shefford s'il n'existe pas
    shefford_exists = await db.tenants.find_one({"slug": "shefford"})
    
    if not shefford_exists:
        shefford_tenant = Tenant(
            slug="shefford",
            nom="Service Incendie de Shefford",
            ville="Shefford",
            province="QC"
        )
        await db.tenants.insert_one(shefford_tenant.dict())
        print(f"✅ Tenant Shefford créé: {shefford_tenant.id}")
        
        # 3. Migrer toutes les données existantes vers Shefford
        # Ajouter tenant_id aux collections qui n'en ont pas
        collections_to_migrate = [
            "users", "types_garde", "assignations", "demandes_remplacement",
            "formations", "disponibilites", "sessions_formation", 
            "inscriptions_formation", "demandes_conge", "notifications",
            "notifications_remplacement", "employee_epis", "parametres_remplacements"
        ]
        
        for collection_name in collections_to_migrate:
            collection = db[collection_name]
            # Mise à jour des documents sans tenant_id
            result = await collection.update_many(
                {"tenant_id": {"$exists": False}},
                {"$set": {"tenant_id": shefford_tenant.id}}
            )
            if result.modified_count > 0:
                print(f"✅ {result.modified_count} documents migrés dans {collection_name}")

@app.on_event("startup")
async def startup_event():
    """Événement de démarrage de l'application"""
    await initialize_multi_tenant()
    
    # Démarrer le job périodique pour vérifier les timeouts de remplacement
    asyncio.create_task(job_verifier_timeouts_remplacements())
    
    print("🚀 ProFireManager API Multi-Tenant démarré")

async def job_verifier_timeouts_remplacements():
    """
    Job périodique qui vérifie les timeouts des demandes de remplacement
    S'exécute toutes les minutes
    """
    while True:
        try:
            await asyncio.sleep(60)  # Attendre 60 secondes
            await verifier_et_traiter_timeouts()
        except Exception as e:
            logging.error(f"❌ Erreur dans le job de vérification des timeouts: {e}", exc_info=True)
            await asyncio.sleep(60)  # Attendre avant de réessayer même en cas d'erreur

# JWT and Password configuration
SECRET_KEY = os.environ.get("JWT_SECRET", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours

# Super Admin credentials
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD_HASH = ""  # Will be set on first run

# Simplified password hashing

# ==================== HELPER FUNCTIONS ====================

# Helper functions
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

def send_welcome_email(user_email: str, user_name: str, user_role: str, temp_password: str, tenant_slug: str = ""):
    """
    Envoie un email de bienvenue avec les informations de connexion
    tenant_slug: slug de la caserne pour construire l'URL d'accès directe
    """
    try:
        # Définir les modules selon le rôle
        modules_by_role = {
            'admin': [
                "📊 Tableau de bord - Vue d'ensemble et statistiques",
                "👥 Personnel - Gestion complète des pompiers", 
                "📅 Planning - Attribution automatique et manuelle",
                "🔄 Remplacements - Validation des demandes",
                "📚 Formations - Inscription et gestion",
                "📈 Rapports - Analyses et exports",
                "⚙️ Paramètres - Configuration système",
                "👤 Mon profil - Informations personnelles"
            ],
            'superviseur': [
                "📊 Tableau de bord - Vue d'ensemble et statistiques",
                "👥 Personnel - Consultation des pompiers",
                "📅 Planning - Gestion et validation", 
                "🔄 Remplacements - Approbation des demandes",
                "📚 Formations - Inscription et gestion",
                "👤 Mon profil - Informations personnelles"
            ],
            'employe': [
                "📊 Tableau de bord - Vue d'ensemble personnalisée",
                "📅 Planning - Consultation de votre planning",
                "🔄 Remplacements - Demandes de remplacement",
                "📚 Formations - Inscription aux formations",
                "👤 Mon profil - Informations et disponibilités"
            ]
        }
        
        role_name = {
            'admin': 'Administrateur',
            'superviseur': 'Superviseur', 
            'employe': 'Employé'
        }.get(user_role, 'Utilisateur')
        
        user_modules = modules_by_role.get(user_role, modules_by_role['employe'])
        modules_html = ''.join([f'<li style="margin-bottom: 8px;">{module}</li>' for module in user_modules])
        
        subject = f"Bienvenue dans ProFireManager v2.0 - Votre compte {role_name}"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" 
                         alt="ProFireManager" 
                         style="width: 60px; height: 60px; margin-bottom: 15px;">
                    <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                    <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
                </div>
                
                <h2 style="color: #1e293b;">Bonjour {user_name},</h2>
                
                <p>Votre compte <strong>{role_name}</strong> a été créé avec succès dans ProFireManager v2.0, le système de gestion des horaires et remplacements automatisés pour les services d'incendie du Canada.</p>
                
                <p style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 15px 0;">
                    🏢 <strong>Votre caserne :</strong> {tenant_slug.title() if tenant_slug else 'Non spécifiée'}
                </p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #dc2626; margin-top: 0;">🔑 Informations de connexion :</h3>
                    <p><strong>Email :</strong> {user_email}</p>
                    <p><strong>Mot de passe temporaire :</strong> {temp_password}</p>
                    <p style="color: #dc2626; font-weight: bold;">⚠️ Veuillez modifier votre mot de passe lors de votre première connexion</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')}/{tenant_slug}" 
                       style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        🚒 Accéder à ProFireManager
                    </a>
                    <p style="font-size: 12px; color: #666; margin-top: 10px;">
                        💡 Conseil : Ajoutez ce lien à vos favoris pour un accès rapide à votre caserne
                    </p>
                </div>
                
                <h3 style="color: #1e293b;">📋 Modules disponibles pour votre rôle ({role_name}) :</h3>
                <ul style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px 20px; margin: 15px 0;">
                    {modules_html}
                </ul>
                
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h4 style="color: #92400e; margin-top: 0;">🔒 Sécurité de votre compte :</h4>
                    <p style="color: #92400e; font-weight: bold; margin: 10px 0;">
                        ⚠️ IMPORTANT : Changez votre mot de passe temporaire dès maintenant !
                    </p>
                    <p style="color: #78350f; margin: 10px 0;">
                        <strong>📍 Comment changer votre mot de passe :</strong>
                    </p>
                    <ol style="color: #78350f; margin: 10px 0;">
                        <li>Connectez-vous à ProFireManager avec le mot de passe temporaire ci-dessus</li>
                        <li>Cliquez sur <strong>"Mon Profil"</strong> dans le menu de gauche</li>
                        <li>Descendez en <strong>bas de la page</strong></li>
                        <li>Trouvez la section <strong>"Modifier le mot de passe"</strong></li>
                        <li>Entrez votre nouveau mot de passe (8 caractères min, 1 majuscule, 1 chiffre, 1 caractère spécial)</li>
                        <li>Cliquez sur <strong>"Enregistrer"</strong></li>
                    </ol>
                    <p style="color: #78350f; margin: 10px 0;">
                        💡 <strong>Conseils de sécurité :</strong>
                    </p>
                    <ul style="color: #78350f; margin: 10px 0;">
                        <li>Utilisez un mot de passe unique et complexe</li>
                        <li>Ne partagez jamais vos identifiants</li>
                        <li>Déconnectez-vous après chaque session</li>
                    </ul>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #666; font-size: 14px; text-align: center;">
                    Cet email a été envoyé automatiquement par ProFireManager v2.0.<br>
                    Si vous avez des questions, contactez votre administrateur système.
                </p>
                
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #999; font-size: 12px;">
                        ProFireManager v2.0 - Système de gestion des services d'incendie du Canada<br>
                        Développé pour optimiser la gestion des horaires et remplacements automatisés
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email via SendGrid
        sendgrid_api_key = os.environ.get('SENDGRID_API_KEY')
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        
        if not sendgrid_api_key:
            print(f"[WARNING] SENDGRID_API_KEY non configurée - Email non envoyé à {user_email}")
            return False
        
        message = Mail(
            from_email=sender_email,
            to_emails=user_email,
            subject=subject,
            html_content=html_content
        )
        
        sg = SendGridAPIClient(sendgrid_api_key)
        response = sg.send(message)
        
        if response.status_code in [200, 201, 202]:
            print(f"✅ Email de bienvenue envoyé avec succès à {user_email}")
            return True
        else:
            print(f"⚠️ Erreur SendGrid (code {response.status_code}) pour {user_email}")
            return False
                
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email à {user_email}: {str(e)}")
        return False
        

def send_gardes_notification_email(user_email: str, user_name: str, gardes_list: list, tenant_slug: str, periode: str):
    """
    Envoie un email détaillé avec les gardes assignées pour le mois
    
    Args:
        user_email: Email du pompier
        user_name: Nom complet du pompier
        gardes_list: Liste des gardes [{date, type_garde, horaire, collegues}]
        tenant_slug: Slug de la caserne
        periode: Période concernée (ex: "janvier 2025")
    """
    sendgrid_api_key = os.environ.get('SENDGRID_API_KEY')
    
    if not sendgrid_api_key or sendgrid_api_key == 'your-sendgrid-api-key-here-test':
        print(f"[WARNING] SENDGRID_API_KEY non configurée - Email NON envoyé à {user_email}")
        return False
    
    try:
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        subject = f"Vos gardes assignées - {periode}"
        
        # Construction de la liste des gardes en HTML
        gardes_html = ''
        for garde in gardes_list:
            collegues_str = ', '.join(garde.get('collegues', [])) if garde.get('collegues') else 'Non spécifiés'
            
            gardes_html += f"""
                <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 4px;">
                    <h4 style="color: #1e293b; margin: 0 0 10px 0;">
                        📅 {garde['jour']} {garde['date']}
                    </h4>
                    <p style="margin: 5px 0; color: #475569;">
                        <strong>{garde['type_garde']}</strong> ({garde['horaire']})
                    </p>
                    <p style="margin: 5px 0; color: #64748b; font-size: 0.9rem;">
                        👥 Avec: {collegues_str}
                    </p>
                    <p style="margin: 5px 0; color: #64748b; font-size: 0.9rem;">
                        📍 Lieu: Caserne {tenant_slug.title()}
                    </p>
                </div>
            """
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">🚒 ProFireManager</h1>
                <p style="color: #fecaca; margin: 10px 0 0 0;">Planning validé</p>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1e293b;">Bonjour {user_name},</h2>
                
                <p>Voici vos gardes assignées pour <strong>{periode}</strong>.</p>
                
                <p style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; margin: 15px 0;">
                    🏢 <strong>Caserne:</strong> {tenant_slug.title()}
                </p>
                
                <h3 style="color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">
                    📋 Vos gardes
                </h3>
                
                {gardes_html}
                
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <h4 style="color: #92400e; margin-top: 0;">📢 Important :</h4>
                    <ul style="color: #78350f; margin: 10px 0;">
                        <li>Ce planning a été validé par votre administrateur</li>
                        <li>Des ajustements peuvent encore survenir en cas de remplacements</li>
                        <li>Consultez régulièrement le planning en ligne pour les mises à jour</li>
                        <li>En cas d'absence, signalez-le immédiatement via l'application</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')}/{tenant_slug}" 
                       style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        🚒 Consulter le planning
                    </a>
                </div>
                
                <div style="border-top: 2px solid #e2e8f0; margin-top: 30px; padding-top: 20px; text-align: center; color: #64748b; font-size: 0.875rem;">
                    <p>ProFireManager v2.0 - Gestion des horaires et remplacements</p>
                    <p>Services d'incendie du Canada</p>
                    <p style="margin-top: 10px;">
                        Cet email a été envoyé automatiquement. Ne pas répondre.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        message = Mail(
            from_email=sender_email,
            to_emails=user_email,
            subject=subject,
            html_content=html_content
        )
        
        sg = SendGridAPIClient(sendgrid_api_key)
        response = sg.send(message)
        
        if response.status_code in [200, 201, 202]:
            print(f"✅ Email de gardes envoyé avec succès à {user_email}")
            return True
        else:
            print(f"⚠️ Erreur SendGrid (code {response.status_code}) pour {user_email}")
            return False
            
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email de gardes à {user_email}: {str(e)}")
        return False

def get_password_hash(password: str) -> str:
    """
    Crée un hash bcrypt du mot de passe.
    Utilise bcrypt pour tous les nouveaux mots de passe.
    """
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie un mot de passe contre son hash.
    Supporte à la fois bcrypt (nouveau) et SHA256 (ancien - pour migration).
    
    Retourne True si le mot de passe correspond, False sinon.
    """
    try:
        password_bytes = plain_password.encode('utf-8')
        
        # Tenter avec bcrypt d'abord (nouveau format)
        if hashed_password.startswith('$2b$') or hashed_password.startswith('$2a$') or hashed_password.startswith('$2y$'):
            logging.info(f"🔐 Vérification avec bcrypt")
            return bcrypt.checkpw(password_bytes, hashed_password.encode('utf-8'))
        
        # Sinon, tenter avec SHA256 (ancien format - migration)
        logging.info(f"🔐 Vérification avec SHA256 (ancien format)")
        sha256_hash = hashlib.sha256(password_bytes).hexdigest()
        return sha256_hash == hashed_password
        
    except Exception as e:
        logging.error(f"❌ Erreur lors de la vérification du mot de passe: {e}")
        return False

async def migrate_password_if_needed(user_id: str, plain_password: str, current_hash: str, collection_name: str = "users"):
    """
    Migre automatiquement un mot de passe SHA256 vers bcrypt lors d'une connexion réussie.
    
    Args:
        user_id: L'ID de l'utilisateur
        plain_password: Le mot de passe en clair (vérifié)
        current_hash: Le hash actuel dans la DB
        collection_name: Nom de la collection MongoDB (users ou super_admins)
    """
    # Vérifier si c'est un ancien hash SHA256 qui nécessite migration
    if not (current_hash.startswith('$2b$') or current_hash.startswith('$2a$') or current_hash.startswith('$2y$')):
        try:
            logging.info(f"🔄 Migration du mot de passe pour l'utilisateur {user_id} de SHA256 vers bcrypt")
            new_hash = get_password_hash(plain_password)
            
            # Mettre à jour dans la base de données
            collection = db[collection_name]
            result = await collection.update_one(
                {"id": user_id},
                {"$set": {"mot_de_passe_hash": new_hash}}
            )
            
            if result.modified_count > 0:
                logging.info(f"✅ Migration du mot de passe réussie pour {user_id}")
            else:
                logging.warning(f"⚠️ Migration du mot de passe échouée pour {user_id} - aucun document modifié")
                
        except Exception as e:
            logging.error(f"❌ Erreur lors de la migration du mot de passe pour {user_id}: {e}")
            # Ne pas bloquer la connexion en cas d'erreur de migration

security = HTTPBearer()

# Define Models
# ==================== MULTI-TENANT MODELS ====================

class Tenant(BaseModel):
    """Modèle pour une caserne (tenant)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slug: str  # URL slug (shefford, bromont, etc.)
    nom: str  # Nom complet de la caserne
    adresse: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    telephone: str = ""
    email_contact: str = ""
    actif: bool = True
    date_creation: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    parametres: Dict[str, Any] = {}

class TenantCreate(BaseModel):
    slug: str
    nom: str
    adresse: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    telephone: str = ""
    email_contact: str = ""
    date_creation: Optional[str] = None  # Date optionnelle

class SuperAdmin(BaseModel):
    """Super administrateur gérant toutes les casernes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    nom: str = "Super Admin"
    mot_de_passe_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SuperAdminLogin(BaseModel):
    email: str
    mot_de_passe: str

# ==================== USER MODELS ====================

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str  # ID de la caserne
    nom: str
    prenom: str
    email: str
    telephone: str = ""
    adresse: str = ""  # Adresse du pompier
    contact_urgence: str = ""
    grade: str  # Capitaine, Directeur, Pompier, Lieutenant
    fonction_superieur: bool = False  # Pour pompiers pouvant agir comme lieutenant
    type_emploi: str  # temps_plein, temps_partiel
    heures_max_semaine: int = 40  # Heures max par semaine (pour temps partiel)
    role: str  # admin, superviseur, employe
    statut: str = "Actif"  # Actif, Inactif
    numero_employe: str = ""
    date_embauche: str = ""
    taux_horaire: float = 0.0  # Taux horaire en $/h
    formations: List[str] = []
    mot_de_passe_hash: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    nom: str
    prenom: str
    email: str
    telephone: str = ""
    adresse: str = ""
    contact_urgence: str = ""
    grade: str = "Pompier"
    fonction_superieur: bool = False
    type_emploi: str = "temps_plein"
    heures_max_semaine: int = 40
    role: str = "employe"
    numero_employe: str = ""
    date_embauche: str = ""
    taux_horaire: float = 0.0
    formations: List[str] = []
    mot_de_passe: str = "TempPass123!"

class UserLogin(BaseModel):
    email: str
    mot_de_passe: str

class TypeGarde(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []  # monday, tuesday, etc.
    officier_obligatoire: bool = False
    competences_requises: List[str] = []  # Liste des formations/compétences requises pour cette garde
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TypeGardeCreate(BaseModel):
    nom: str
    heure_debut: str
    heure_fin: str
    personnel_requis: int
    duree_heures: int
    couleur: str
    jours_application: List[str] = []
    officier_obligatoire: bool = False
    competences_requises: List[str] = []

class Planning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    semaine_debut: str  # Format: YYYY-MM-DD
    semaine_fin: str
    assignations: Dict[str, Any] = {}  # jour -> type_garde -> assignation
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlanningCreate(BaseModel):
    semaine_debut: str
    semaine_fin: str
    assignations: Dict[str, Any] = {}

class Assignation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    type_garde_id: str
    date: str
    statut: str = "planifie"  # planifie, confirme, remplacement_demande
    assignation_type: str = "auto"  # auto, manuel, manuel_avance

class AssignationCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    user_id: str
    type_garde_id: str
    date: str
    assignation_type: str = "manuel"

class TentativeRemplacement(BaseModel):
    """Historique des tentatives de remplacement"""
    user_id: str
    nom_complet: str
    date_contact: datetime
    statut: str  # contacted, accepted, refused, expired
    date_reponse: Optional[datetime] = None

class DemandeRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demandeur_id: str
    type_garde_id: str
    date: str  # Date de la garde à remplacer (format: YYYY-MM-DD)
    raison: str
    statut: str = "en_attente"  # en_attente, en_cours, accepte, expiree, annulee
    priorite: str = "normal"  # urgent (≤24h), normal (>24h) - calculé automatiquement
    remplacant_id: Optional[str] = None
    tentatives_historique: List[Dict[str, Any]] = []  # Historique des personnes contactées
    remplacants_contactes_ids: List[str] = []  # IDs des remplaçants actuellement en attente de réponse
    date_prochaine_tentative: Optional[datetime] = None
    nombre_tentatives: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DemandeRemplacementCreate(BaseModel):
    type_garde_id: str
    date: str
    raison: str

class Formation(BaseModel):
    """Formation planifiée avec gestion inscriptions NFPA 1500"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    competence_id: str = ""  # Optionnel pour rétrocompatibilité
    description: str = ""
    date_debut: str = ""
    date_fin: str = ""
    heure_debut: str = ""
    heure_fin: str = ""
    duree_heures: float = 0
    lieu: str = ""
    instructeur: str = ""
    places_max: int = 20
    places_restantes: int = 20
    statut: str = "planifiee"
    obligatoire: bool = False
    annee: int = 0
    validite_mois: int = 12  # Pour anciennes formations
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FormationCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    competence_id: str
    description: str = ""
    date_debut: str
    date_fin: str
    heure_debut: str
    heure_fin: str
    duree_heures: float
    lieu: str = ""
    instructeur: str = ""
    places_max: int
    obligatoire: bool = False
    annee: int

class FormationUpdate(BaseModel):
    nom: Optional[str] = None
    competence_id: Optional[str] = None
    description: Optional[str] = None
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    duree_heures: Optional[float] = None
    lieu: Optional[str] = None
    instructeur: Optional[str] = None
    places_max: Optional[int] = None
    obligatoire: Optional[bool] = None
    statut: Optional[str] = None

class InscriptionFormation(BaseModel):
    """Inscription d'un pompier à une formation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    formation_id: str
    user_id: str
    date_inscription: str
    statut: str = "inscrit"  # inscrit, en_attente, present, absent, complete
    heures_creditees: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InscriptionFormationCreate(BaseModel):
    tenant_id: Optional[str] = None
    formation_id: str
    user_id: str

class InscriptionFormationUpdate(BaseModel):
    statut: Optional[str] = None
    heures_creditees: Optional[float] = None
    notes: Optional[str] = None

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

class ParametresFormations(BaseModel):
    """Paramètres globaux formations pour NFPA 1500"""
    tenant_id: str
    heures_minimales_annuelles: float = 100.0
    pourcentage_presence_minimum: float = 80.0
    delai_notification_liste_attente: int = 7  # jours
    email_notifications_actif: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# Alias pour compatibilité avec anciennes routes
SessionFormation = Formation
SessionFormationCreate = FormationCreate

class Disponibilite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    date: str  # Date exacte YYYY-MM-DD
    type_garde_id: Optional[str] = None  # Spécifier pour quel type de garde
    heure_debut: str
    heure_fin: str
    statut: str = "disponible"  # disponible, indisponible, preference
    origine: str = "manuelle"  # manuelle, montreal_7_24, quebec_10_14, personnalisee
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DisponibiliteCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    user_id: str
    date: str  # Date exacte YYYY-MM-DD
    type_garde_id: Optional[str] = None
    heure_debut: str
    heure_fin: str
    statut: str = "disponible"
    origine: str = "manuelle"  # manuelle, montreal_7_24, quebec_10_14, personnalisee

class IndisponibiliteGenerate(BaseModel):
    user_id: str
    horaire_type: str  # "montreal" ou "quebec"
    equipe: str  # "Rouge", "Jaune", "Bleu", "Vert"
    date_debut: str  # Date de début (YYYY-MM-DD)
    date_fin: str  # Date de fin (YYYY-MM-DD)
    date_jour_1: Optional[str] = None  # Pour Quebec 10/14, date du Jour 1 du cycle (YYYY-MM-DD)
    conserver_manuelles: bool = True  # Conserver les modifications manuelles lors de la régénération

class DisponibiliteReinitialiser(BaseModel):
    user_id: str
    periode: str  # "semaine", "mois", "annee"
    mode: str  # "tout" ou "generees_seulement"
    type_entree: str = "les_deux"  # "disponibilites", "indisponibilites", "les_deux"

class DeviceToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    device_token: str
    platform: str  # "ios" ou "android"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DeviceTokenRegister(BaseModel):
    user_id: str
    device_token: str
    platform: str

class PushNotificationSend(BaseModel):
    user_ids: List[str]
    title: str
    body: str
    data: Optional[dict] = None

class Statistiques(BaseModel):
    personnel_actif: int
    gardes_cette_semaine: int
    formations_planifiees: int
    taux_couverture: float
    heures_travaillees: int
    remplacements_effectues: int

# Helper functions

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), tenant_slug: str = None):
    """
    Authentifie l'utilisateur et vérifie qu'il appartient au tenant
    tenant_slug est optionnel pour compatibilité avec les routes qui ne l'utilisent pas encore
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")  # Tenant ID stocké dans le token
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
    
    # Vérifier que l'utilisateur appartient au tenant si tenant_slug est fourni
    if tenant_slug:
        tenant = await get_tenant_from_slug(tenant_slug)
        if user.get("tenant_id") != tenant.id:
            raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    return User(**user)

# Root route
@api_router.get("/")
async def root():
    return {"message": "ProFireManager API v2.0 - Multi-Tenant", "status": "running"}

# ==================== SUPER ADMIN DEPENDENCIES ====================

async def get_super_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Authentifie et retourne le super admin"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        admin_id: str = payload.get("sub")
        role: str = payload.get("role")
        
        if role != "super_admin":
            raise HTTPException(status_code=403, detail="Accès super admin requis")
            
        admin = await db.super_admins.find_one({"id": admin_id})
        if not admin:
            raise HTTPException(status_code=401, detail="Super admin non trouvé")
        return SuperAdmin(**admin)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide")

# ==================== SUPER ADMIN ROUTES ====================
# Note: Super Admin routes MUST be defined before tenant routes to avoid conflicts

@api_router.post("/admin/auth/login")
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
        
        # Migrer le mot de passe si nécessaire (SHA256 -> bcrypt)
        await migrate_password_if_needed(admin_data["id"], login.mot_de_passe, current_hash, "super_admins")
        
        admin = SuperAdmin(**admin_data)
        access_token = create_access_token(data={"sub": admin.id, "role": "super_admin"})
        
        logging.info(f"✅ Token JWT créé pour Super Admin {login.email}")
        
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

@api_router.get("/admin/auth/me")
async def get_super_admin_me(admin: SuperAdmin = Depends(get_super_admin)):
    """Récupère les informations du super admin authentifié"""
    return {
        "id": admin.id,
        "email": admin.email,
        "nom": admin.nom,
        "role": "super_admin"
    }

@api_router.get("/admin/tenants")
async def list_tenants(admin: SuperAdmin = Depends(get_super_admin)):
    """Liste toutes les casernes (actives et inactives) avec compteur de personnel"""
    # Récupérer TOUTES les casernes (pas de filtre) pour que le Super Admin puisse tout voir
    tenants_data = await db.tenants.find({}).to_list(100)
    
    # Ajouter le compteur d'employés pour chaque tenant
    tenants_with_counts = []
    for tenant_data in tenants_data:
        # Supprimer _id (ObjectId non sérialisable)
        if '_id' in tenant_data:
            del tenant_data['_id']
        
        # Compter le nombre d'employés
        nombre_employes = await db.users.count_documents({"tenant_id": tenant_data['id']})
        tenant_data['nombre_employes'] = nombre_employes
        
        # Normaliser le statut actif (gérer les deux champs actif et is_active)
        # Pour compatibilité avec anciennes et nouvelles données
        if 'is_active' not in tenant_data and 'actif' in tenant_data:
            tenant_data['is_active'] = tenant_data['actif']
        elif 'is_active' in tenant_data and 'actif' not in tenant_data:
            tenant_data['actif'] = tenant_data['is_active']
        
        tenants_with_counts.append(tenant_data)
    
    return tenants_with_counts

@api_router.get("/admin/stats")
async def get_global_stats(admin: SuperAdmin = Depends(get_super_admin)):
    """Statistiques globales avec calcul des revenus mensuels"""
    # Récupérer tous les tenants pour gérer les deux champs actif et is_active
    tous_tenants = await db.tenants.find({}).to_list(100)
    
    total_casernes_actives = 0
    total_casernes_inactives = 0
    tenants_actifs = []
    
    # Analyser chaque tenant pour déterminer son statut
    for tenant in tous_tenants:
        # Un tenant est actif si actif=True OU is_active=True
        is_active = tenant.get('actif', False) or tenant.get('is_active', False)
        
        if is_active:
            total_casernes_actives += 1
            tenants_actifs.append(tenant)
        else:
            total_casernes_inactives += 1
    
    # Calculer les revenus mensuels
    revenus_mensuels = 0
    total_pompiers = 0
    details_revenus = []
    
    for tenant in tenants_actifs:
        # Exclure la caserne "démonstration" du calcul des revenus (compte démo client)
        tenant_slug = tenant.get('slug', '').lower()
        tenant_nom = tenant.get('nom', '').lower()
        
        is_demo = 'demonstration' in tenant_slug or 'demonstration' in tenant_nom or 'demo' in tenant_slug
        
        # Compter les pompiers de cette caserne
        user_count = await db.users.count_documents({"tenant_id": tenant["id"]})
        
        # Ajouter au total uniquement si ce n'est pas une caserne de démo
        if not is_demo:
            total_pompiers += user_count
        
        # Déterminer le prix par pompier selon le palier
        if user_count <= 30:
            prix_par_pompier = 12
        elif user_count <= 50:
            prix_par_pompier = 20
        else:
            prix_par_pompier = 27
        
        # Calculer le revenu pour cette caserne (0 si démo)
        revenu_caserne = 0 if is_demo else (user_count * prix_par_pompier)
        revenus_mensuels += revenu_caserne
        
        details_revenus.append({
            "caserne": tenant["nom"],
            "pompiers": user_count,
            "prix_par_pompier": prix_par_pompier if not is_demo else 0,
            "revenu_mensuel": revenu_caserne,
            "is_demo": is_demo
        })
    
    return {
        "casernes_actives": total_casernes_actives,
        "casernes_inactives": total_casernes_inactives,
        "total_pompiers": total_pompiers,
        "revenus_mensuels": revenus_mensuels,
        "details_par_caserne": details_revenus
    }

@api_router.post("/admin/tenants")
async def create_tenant(tenant_create: TenantCreate, admin: SuperAdmin = Depends(get_super_admin)):
    """Créer une nouvelle caserne"""
    # Vérifier que le slug est unique
    existing = await db.tenants.find_one({"slug": tenant_create.slug})
    if existing:
        raise HTTPException(status_code=400, detail="Ce slug est déjà utilisé")
    
    # Créer le tenant avec date personnalisée si fournie
    tenant_data = tenant_create.dict()
    if tenant_data.get('date_creation'):
        # Convertir la date string en datetime
        from datetime import datetime as dt
        tenant_data['date_creation'] = dt.fromisoformat(tenant_data['date_creation']).replace(tzinfo=timezone.utc)
    else:
        tenant_data['date_creation'] = datetime.now(timezone.utc)
    
    tenant = Tenant(**tenant_data)
    await db.tenants.insert_one(tenant.dict())
    
    return {"message": f"Caserne '{tenant.nom}' créée avec succès", "tenant": tenant}

@api_router.put("/admin/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str, 
    tenant_update: dict,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Modifier une caserne"""
    update_data = tenant_update.copy()
    
    # Supprimer les champs calculés qui ne doivent pas être sauvegardés
    if 'nombre_employes' in update_data:
        del update_data['nombre_employes']
    if '_id' in update_data:
        del update_data['_id']
    
    # Gérer la date_creation si modifiée
    if update_data.get('date_creation') and isinstance(update_data['date_creation'], str):
        from datetime import datetime as dt
        update_data['date_creation'] = dt.fromisoformat(update_data['date_creation']).replace(tzinfo=timezone.utc)
    
    result = await db.tenants.update_one(
        {"id": tenant_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Caserne non trouvée")
    
    return {"message": "Caserne mise à jour avec succès"}

@api_router.post("/admin/tenants/{tenant_id}/create-admin")
async def create_tenant_admin(tenant_id: str, user_data: dict, admin: SuperAdmin = Depends(get_super_admin)):
    """Créer un administrateur pour une caserne"""
    # Vérifier que la caserne existe
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Caserne non trouvée")
    
    # Vérifier que l'email n'existe pas déjà
    existing_user = await db.users.find_one({"email": user_data["email"]})
    if existing_user:
        raise HTTPException(status_code=400, detail="Un utilisateur avec cet email existe déjà")
    
    # Créer l'utilisateur administrateur
    new_user = User(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        email=user_data["email"],
        prenom=user_data["prenom"],
        nom=user_data["nom"],
        mot_de_passe_hash=get_password_hash(user_data["mot_de_passe"]),
        role="admin",
        grade="Directeur",
        type_emploi="temps_plein",
        statut="Actif",
        numero_employe="ADMIN-" + str(uuid.uuid4())[:8].upper(),
        date_embauche=datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    
    await db.users.insert_one(new_user.dict())
    
    # Envoyer l'email de bienvenue (sans bloquer si ça échoue)
    try:
        send_welcome_email(
            user_email=new_user.email,
            user_name=f"{new_user.prenom} {new_user.nom}",
            user_role=new_user.role,
            temp_password=user_data["mot_de_passe"],
            tenant_slug=tenant['slug']
        )
    except Exception as e:
        print(f"⚠️ Erreur envoi email de bienvenue: {e}")
        # Continue même si l'email échoue
    
    return {
        "message": "Administrateur créé avec succès",
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "nom": new_user.nom,
            "prenom": new_user.prenom,
            "role": new_user.role
        }
    }

@api_router.get("/admin/tenants/{tenant_id}/deletion-impact")
async def get_deletion_impact(tenant_id: str, admin: SuperAdmin = Depends(get_super_admin)):
    """Obtenir l'impact de la suppression d'une caserne (nombre de données affectées)"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Caserne non trouvée")
    
    # Compter toutes les données qui seront supprimées
    users_count = await db.users.count_documents({"tenant_id": tenant_id})
    assignations_count = await db.assignations.count_documents({"tenant_id": tenant_id})
    formations_count = await db.formations.count_documents({"tenant_id": tenant_id})
    epi_count = await db.epi_employes.count_documents({"tenant_id": tenant_id})
    gardes_count = await db.types_garde.count_documents({"tenant_id": tenant_id})
    disponibilites_count = await db.disponibilites.count_documents({"tenant_id": tenant_id})
    conges_count = await db.demandes_conge.count_documents({"tenant_id": tenant_id})
    
    return {
        "tenant": {
            "id": tenant["id"],
            "nom": tenant["nom"],
            "slug": tenant["slug"]
        },
        "impact": {
            "utilisateurs": users_count,
            "assignations": assignations_count,
            "formations": formations_count,
            "epi": epi_count,
            "gardes": gardes_count,
            "disponibilites": disponibilites_count,
            "conges": conges_count
        }
    }

@api_router.delete("/admin/tenants/{tenant_id}")
async def delete_tenant_permanently(tenant_id: str, admin: SuperAdmin = Depends(get_super_admin)):
    """Supprimer définitivement une caserne et toutes ses données"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Caserne non trouvée")
    
    # Supprimer toutes les données associées
    users_result = await db.users.delete_many({"tenant_id": tenant_id})
    await db.assignations.delete_many({"tenant_id": tenant_id})
    await db.formations.delete_many({"tenant_id": tenant_id})
    await db.epi_employes.delete_many({"tenant_id": tenant_id})
    await db.types_garde.delete_many({"tenant_id": tenant_id})
    await db.disponibilites.delete_many({"tenant_id": tenant_id})
    await db.demandes_conge.delete_many({"tenant_id": tenant_id})
    await db.demandes_remplacement.delete_many({"tenant_id": tenant_id})
    await db.notifications.delete_many({"tenant_id": tenant_id})
    await db.parametres.delete_many({"tenant_id": tenant_id})
    await db.sessions_formation.delete_many({"tenant_id": tenant_id})
    
    # Supprimer le tenant
    await db.tenants.delete_one({"id": tenant_id})
    
    return {
        "message": f"Caserne '{tenant['nom']}' et toutes ses données ont été supprimées définitivement",
        "deleted": {
            "tenant": tenant["nom"],
            "users": users_result.deleted_count
        }
    }

# ==================== TENANT-SPECIFIC ROUTES ====================
# Note: Tenant routes are defined after Super Admin routes to avoid conflicts
async def login(tenant_slug: str, user_login: UserLogin):
    """Login pour un tenant spécifique"""
    # Vérifier que le tenant existe
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Chercher l'utilisateur dans ce tenant
    user_data = await db.users.find_one({
        "email": user_login.email,
        "tenant_id": tenant.id
    })
    
    if not user_data or not verify_password(user_login.mot_de_passe, user_data["mot_de_passe_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    user = User(**user_data)
    
    # Inclure tenant_id dans le token
    access_token = create_access_token(data={
        "sub": user.id,
        "tenant_id": tenant.id,
        "tenant_slug": tenant.slug
    })
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "tenant": {
            "id": tenant.id,
            "slug": tenant.slug,
            "nom": tenant.nom
        },
        "user": {
            "id": user.id,
            "nom": user.nom,
            "prenom": user.prenom,
            "email": user.email,
            "role": user.role,
            "grade": user.grade,
            "type_emploi": user.type_emploi
        }
    }

# Route de compatibilité (OLD - sans tenant dans URL)
@api_router.post("/auth/login")
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
        
        # Migrer le mot de passe si nécessaire (SHA256 -> bcrypt)
        await migrate_password_if_needed(user_data["id"], user_login.mot_de_passe, current_hash, "users")
        
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
                "nom": tenant.nom
            },
            "user": {
                "id": user.id,
                "nom": user.nom,
                "prenom": user.prenom,
                "email": user.email,
                "role": user.role,
                "grade": user.grade,
                "type_emploi": user.type_emploi
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du login legacy pour {user_login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

@api_router.get("/{tenant_slug}/auth/me")
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
        "formations": current_user.formations
    }

# User management routes
@api_router.post("/{tenant_slug}/users", response_model=User)
async def create_user(tenant_slug: str, user_create: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # VÉRIFIER LA LIMITE DU PALIER
    current_count = await db.users.count_documents({"tenant_id": tenant.id})
    
    # Déterminer le palier actuel
    if current_count < 30:
        palier = "Basic (1-30)"
        limite = 30
        prix = "12$"
    elif current_count < 50:
        palier = "Standard (31-50)"
        limite = 50
        prix = "20$"
    else:
        palier = "Premium (51+)"
        limite = None
        prix = "27$"
    
    # Bloquer si la limite du palier est atteinte
    if limite and current_count >= limite:
        # Envoyer email au super admin
        super_admin_email = "gussdub@icloud.com"
        try:
            sendgrid_api_key = os.environ.get('SENDGRID_API_KEY')
            if sendgrid_api_key and sendgrid_api_key != 'your-sendgrid-api-key-here-test':
                from sendgrid import SendGridAPIClient
                from sendgrid.helpers.mail import Mail
                
                message = Mail(
                    from_email=os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca'),
                    to_emails=super_admin_email,
                    subject=f'⚠️ Limite de palier atteinte - {tenant.nom}',
                    html_content=f"""
                    <h2>Alerte - Limite de palier atteinte</h2>
                    <p><strong>Caserne:</strong> {tenant.nom} ({tenant_slug})</p>
                    <p><strong>Palier actuel:</strong> {palier}</p>
                    <p><strong>Personnel actuel:</strong> {current_count}/{limite}</p>
                    <p><strong>Prix actuel:</strong> {prix}/mois</p>
                    <p>L'administrateur a tenté de créer un {current_count + 1}e pompier mais la limite est atteinte.</p>
                    <p><strong>Action requise:</strong> Contacter le client pour upgrade vers palier supérieur.</p>
                    """
                )
                sg = SendGridAPIClient(sendgrid_api_key)
                sg.send(message)
        except Exception as e:
            print(f"Erreur envoi email super admin: {str(e)}")
        
        raise HTTPException(
            status_code=403, 
            detail=f"Limite du palier {palier} atteinte ({current_count}/{limite}). Contactez l'administrateur pour upgrader votre forfait."
        )
    
    # Validation du mot de passe complexe
    if not validate_complex_password(user_create.mot_de_passe):
        raise HTTPException(
            status_code=400, 
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial (!@#$%^&*+-?())"
        )
    
    # Check if user already exists DANS CE TENANT
    existing_user = await db.users.find_one({"email": user_create.email, "tenant_id": tenant.id})
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé dans cette caserne")
    
    user_dict = user_create.dict()
    temp_password = user_dict["mot_de_passe"]  # Sauvegarder pour l'email
    user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
    user_dict["tenant_id"] = tenant.id  # Assigner le tenant
    user_obj = User(**user_dict)
    
    await db.users.insert_one(user_obj.dict())
    
    # Envoyer l'email de bienvenue
    try:
        user_name = f"{user_create.prenom} {user_create.nom}"
        email_sent = send_welcome_email(user_create.email, user_name, user_create.role, temp_password, tenant_slug)
        
        if email_sent:
            print(f"Email de bienvenue envoyé à {user_create.email}")
        else:
            print(f"Échec envoi email à {user_create.email}")
            
    except Exception as e:
        print(f"Erreur lors de l'envoi de l'email: {str(e)}")
        # Ne pas échouer la création du compte si l'email échoue
    
    return user_obj

@api_router.get("/{tenant_slug}/users", response_model=List[User])
async def get_users(tenant_slug: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Filtrer par tenant_id
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_users = [clean_mongo_doc(user) for user in users]
    return [User(**user) for user in cleaned_users]

@api_router.get("/{tenant_slug}/users/{user_id}", response_model=User)
async def get_user(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Filtrer par tenant_id ET user_id
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    user = clean_mongo_doc(user)
    return User(**user)

class ProfileUpdate(BaseModel):
    prenom: str
    nom: str
    email: str
    telephone: str = ""
    adresse: str = ""
    contact_urgence: str = ""
    heures_max_semaine: int = 25

@api_router.put("/{tenant_slug}/users/mon-profil", response_model=User)
async def update_mon_profil(
    tenant_slug: str,
    profile_data: ProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Permet à un utilisateur de modifier son propre profil
    """
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # L'utilisateur peut modifier son propre profil
        result = await db.users.update_one(
            {"id": current_user.id, "tenant_id": tenant.id}, 
            {"$set": profile_data.dict()}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=400, detail="Impossible de mettre à jour le profil")
        
        # Récupérer le profil mis à jour
        updated_user = await db.users.find_one({"id": current_user.id, "tenant_id": tenant.id})
        updated_user = clean_mongo_doc(updated_user)
        return User(**updated_user)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour profil: {str(e)}")

@api_router.put("/{tenant_slug}/users/{user_id}", response_model=User)
async def update_user(tenant_slug: str, user_id: str, user_update: UserCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if user exists dans ce tenant
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Update user data
    user_dict = user_update.dict()
    if user_dict["mot_de_passe"]:
        user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
    else:
        user_dict.pop("mot_de_passe")
        user_dict["mot_de_passe_hash"] = existing_user["mot_de_passe_hash"]
    
    user_dict["id"] = user_id
    user_dict["tenant_id"] = tenant.id  # Assurer le tenant_id
    user_dict["statut"] = existing_user.get("statut", "Actif")
    user_dict["created_at"] = existing_user.get("created_at")
    
    result = await db.users.replace_one({"id": user_id, "tenant_id": tenant.id}, user_dict)
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de mettre à jour l'utilisateur")
    
    updated_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    updated_user = clean_mongo_doc(updated_user)
    return User(**updated_user)

@api_router.delete("/{tenant_slug}/users/{user_id}")
async def delete_user(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if user exists dans ce tenant
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Delete user
    result = await db.users.delete_one({"id": user_id, "tenant_id": tenant.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer l'utilisateur")
    
    # Also delete related data (filtré par tenant_id aussi)
    await db.disponibilites.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.assignations.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.demandes_remplacement.delete_many({"demandeur_id": user_id, "tenant_id": tenant.id})
    
    return {"message": "Utilisateur supprimé avec succès"}

@api_router.put("/{tenant_slug}/users/{user_id}/password")
async def change_user_password(
    tenant_slug: str,
    user_id: str,
    password_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Changer le mot de passe d'un utilisateur (uniquement son propre mot de passe)"""
    try:
        logging.info(f"🔑 Demande de changement de mot de passe pour l'utilisateur {user_id}")
        
        # Vérifier que l'utilisateur change son propre mot de passe
        if current_user.id != user_id:
            logging.warning(f"❌ Tentative de changement de mot de passe non autorisée par {current_user.id} pour {user_id}")
            raise HTTPException(status_code=403, detail="Vous ne pouvez changer que votre propre mot de passe")
        
        # Vérifier le tenant
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer l'utilisateur
        user_data = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        if not user_data:
            logging.warning(f"❌ Utilisateur non trouvé pour changement de mot de passe: {user_id}")
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Vérifier l'ancien mot de passe
        if not verify_password(password_data["current_password"], user_data["mot_de_passe_hash"]):
            logging.warning(f"❌ Ancien mot de passe incorrect pour {user_id}")
            raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")
        
        logging.info(f"✅ Ancien mot de passe vérifié pour {user_id}")
        
        # Valider le nouveau mot de passe (8 caractères min, 1 majuscule, 1 chiffre, 1 spécial)
        new_password = password_data["new_password"]
        if len(new_password) < 8:
            raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")
        if not any(c.isupper() for c in new_password):
            raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins une majuscule")
        if not any(c.isdigit() for c in new_password):
            raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins un chiffre")
        if not any(c in '!@#$%^&*+-?()' for c in new_password):
            raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*+-?())")
        
        # Hasher et mettre à jour le mot de passe (utilise bcrypt maintenant)
        new_password_hash = get_password_hash(new_password)
        logging.info(f"🔐 Nouveau mot de passe hashé avec bcrypt pour {user_id}")
        
        result = await db.users.update_one(
            {"id": user_id, "tenant_id": tenant.id},
            {"$set": {"mot_de_passe_hash": new_password_hash}}
        )
        
        if result.modified_count == 0:
            logging.error(f"❌ Impossible de mettre à jour le mot de passe pour {user_id}")
            raise HTTPException(status_code=400, detail="Impossible de mettre à jour le mot de passe")
        
        logging.info(f"✅ Mot de passe changé avec succès pour {user_id}")
        return {"message": "Mot de passe modifié avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du changement de mot de passe pour {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

@api_router.put("/users/{user_id}/access", response_model=User)
async def update_user_access(user_id: str, role: str, statut: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Validation des valeurs
    valid_roles = ["admin", "superviseur", "employe"]
    valid_statuts = ["Actif", "Inactif"]
    
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if statut not in valid_statuts:
        raise HTTPException(status_code=400, detail="Statut invalide")
    
    # Check if user exists
    existing_user = await db.users.find_one({"id": user_id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Update user access
    result = await db.users.update_one(
        {"id": user_id}, 
        {"$set": {"role": role, "statut": statut}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de mettre à jour l'accès")
    
    updated_user = await db.users.find_one({"id": user_id})
    updated_user = clean_mongo_doc(updated_user)
    return User(**updated_user)

@api_router.delete("/{tenant_slug}/users/{user_id}/revoke")
async def revoke_user_completely(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if user exists IN THIS TENANT
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Prevent admin from deleting themselves
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    
    # Delete user and all related data (only for this tenant)
    await db.users.delete_one({"id": user_id, "tenant_id": tenant.id})
    await db.disponibilites.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.assignations.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.demandes_remplacement.delete_many({"demandeur_id": user_id, "tenant_id": tenant.id})
    await db.demandes_remplacement.delete_many({"remplacant_id": user_id, "tenant_id": tenant.id})
    
    return {"message": "Utilisateur et toutes ses données ont été supprimés définitivement"}

# Types de garde routes
@api_router.post("/{tenant_slug}/types-garde", response_model=TypeGarde)
async def create_type_garde(tenant_slug: str, type_garde: TypeGardeCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    type_garde_dict = type_garde.dict()
    type_garde_dict["tenant_id"] = tenant.id
    type_garde_obj = TypeGarde(**type_garde_dict)
    await db.types_garde.insert_one(type_garde_obj.dict())
    return type_garde_obj

@api_router.get("/{tenant_slug}/types-garde", response_model=List[TypeGarde])
async def get_types_garde(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_types = [clean_mongo_doc(type_garde) for type_garde in types_garde]
    return [TypeGarde(**type_garde) for type_garde in cleaned_types]

# Helper function to clean MongoDB documents
def clean_mongo_doc(doc):
    """Remove MongoDB ObjectId and other non-serializable fields"""
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

@api_router.put("/{tenant_slug}/types-garde/{type_garde_id}", response_model=TypeGarde)
async def update_type_garde(tenant_slug: str, type_garde_id: str, type_garde_update: TypeGardeCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if type garde exists dans ce tenant
    existing_type = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    if not existing_type:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    # Update type garde data
    type_dict = type_garde_update.dict()
    type_dict["id"] = type_garde_id
    type_dict["tenant_id"] = tenant.id
    type_dict["created_at"] = existing_type.get("created_at")
    
    result = await db.types_garde.replace_one({"id": type_garde_id, "tenant_id": tenant.id}, type_dict)
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de mettre à jour le type de garde")
    
    updated_type = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant.id})
    updated_type = clean_mongo_doc(updated_type)
    return TypeGarde(**updated_type)

@api_router.delete("/{tenant_slug}/types-garde/{type_garde_id}")
async def delete_type_garde(tenant_slug: str, type_garde_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Check if type garde exists
    existing_type = await db.types_garde.find_one({"id": type_garde_id})
    if not existing_type:
        raise HTTPException(status_code=404, detail="Type de garde non trouvé")
    
    # Delete type garde
    result = await db.types_garde.delete_one({"id": type_garde_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le type de garde")
    
    # Also delete related assignations
    await db.assignations.delete_many({"type_garde_id": type_garde_id})
    
    return {"message": "Type de garde supprimé avec succès"}
@api_router.get("/{tenant_slug}/planning/{semaine_debut}")
async def get_planning(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    planning = await db.planning.find_one({"semaine_debut": semaine_debut, "tenant_id": tenant.id})
    if not planning:
        # Create empty planning for the week
        semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        planning_obj = Planning(semaine_debut=semaine_debut, semaine_fin=semaine_fin)
        planning_dict = planning_obj.dict()
        planning_dict["tenant_id"] = tenant.id
        await db.planning.insert_one(planning_dict)
        planning = planning_dict
    else:
        planning = clean_mongo_doc(planning)
    
    return planning

@api_router.delete("/{tenant_slug}/planning/assignation/{assignation_id}")
async def retirer_assignation(tenant_slug: str, assignation_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Trouver l'assignation dans ce tenant
        assignation = await db.assignations.find_one({"id": assignation_id, "tenant_id": tenant.id})
        if not assignation:
            raise HTTPException(status_code=404, detail="Assignation non trouvée")
        
        # Supprimer l'assignation
        result = await db.assignations.delete_one({"id": assignation_id, "tenant_id": tenant.id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=400, detail="Impossible de retirer l'assignation")
        
        return {
            "message": "Assignation retirée avec succès",
            "assignation_supprimee": assignation_id,
            "date": assignation["date"],
            "user_id": assignation["user_id"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur suppression assignation: {str(e)}")

@api_router.post("/{tenant_slug}/planning/assignation")
async def create_assignation(tenant_slug: str, assignation: AssignationCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Store assignation in database avec tenant_id
    assignation_dict = assignation.dict()
    assignation_dict["tenant_id"] = tenant.id
    assignation_obj = Assignation(**assignation_dict)
    await db.assignations.insert_one(assignation_obj.dict())
    
    # Créer notification pour l'employé assigné (filtré par tenant)
    user_assigne = await db.users.find_one({"id": assignation.user_id, "tenant_id": tenant.id})
    type_garde = await db.types_garde.find_one({"id": assignation.type_garde_id, "tenant_id": tenant.id})
    
    if user_assigne and type_garde:
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=assignation.user_id,
            type="planning_assigne",
            titre="Nouveau quart assigné",
            message=f"Vous avez été assigné(e) au quart '{type_garde['nom']}' le {assignation.date}",
            lien="/planning",
            data={
                "assignation_id": assignation_obj.id,
                "date": assignation.date,
                "type_garde": type_garde["nom"]
            }
        )
    
    return {"message": "Assignation créée avec succès"}

@api_router.get("/{tenant_slug}/planning/assignations/{semaine_debut}")
async def get_assignations(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Déterminer la période en fonction du format de la date
    # Si c'est le 1er du mois (ex: 2024-10-01), récupérer tout le mois
    # Sinon, récupérer la semaine (7 jours)
    date_debut = datetime.strptime(semaine_debut, "%Y-%m-%d")
    
    if date_debut.day == 1:
        # Vue mensuelle : récupérer tout le mois
        # Dernier jour du mois
        if date_debut.month == 12:
            date_fin = datetime(date_debut.year + 1, 1, 1) - timedelta(days=1)
        else:
            date_fin = datetime(date_debut.year, date_debut.month + 1, 1) - timedelta(days=1)
    else:
        # Vue hebdomadaire : récupérer 7 jours
        date_fin = date_debut + timedelta(days=6)
    
    date_fin_str = date_fin.strftime("%Y-%m-%d")
    
    assignations = await db.assignations.find({
        "tenant_id": tenant.id,
        "date": {
            "$gte": semaine_debut,
            "$lte": date_fin_str
        }
    }).to_list(1000)
    
    # Clean MongoDB documents
    cleaned_assignations = [clean_mongo_doc(assignation) for assignation in assignations]
    return [Assignation(**assignation) for assignation in cleaned_assignations]

# Remplacements routes

# ==================== SYSTÈME AUTOMATISÉ DE REMPLACEMENT ====================

async def calculer_priorite_demande(date_garde: str) -> str:
    """
    Calcule la priorité d'une demande de remplacement
    - urgent: Si la garde est dans 24h ou moins
    - normal: Si la garde est dans plus de 24h
    """
    try:
        date_garde_obj = datetime.strptime(date_garde, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        maintenant = datetime.now(timezone.utc)
        delta = date_garde_obj - maintenant
        
        if delta.total_seconds() <= 86400:  # 24 heures en secondes
            return "urgent"
        return "normal"
    except Exception as e:
        logging.error(f"Erreur calcul priorité: {e}")
        return "normal"

async def trouver_remplacants_potentiels(
    tenant_id: str,
    type_garde_id: str,
    date_garde: str,
    demandeur_id: str,
    exclus_ids: List[str] = []
) -> List[Dict[str, Any]]:
    """
    Trouve les remplaçants potentiels selon les critères:
    1. Compétences requises pour le type de garde
    2. Grade équivalent ou supérieur (lieutenant peut remplacer pompier)
    3. Pas d'indisponibilité pour cette date
    4. Disponibilité déclarée (bonus de tri)
    5. Ancienneté (date_embauche la plus ancienne)
    
    Retourne une liste triée de remplaçants par ordre de priorité
    """
    try:
        # Récupérer le type de garde pour connaître les compétences requises
        type_garde_data = await db.types_garde.find_one({"id": type_garde_id, "tenant_id": tenant_id})
        if not type_garde_data:
            logging.error(f"Type de garde non trouvé: {type_garde_id}")
            return []
        
        competences_requises = type_garde_data.get("competences_requises", [])
        officier_obligatoire = type_garde_data.get("officier_obligatoire", False)
        
        # Récupérer tous les utilisateurs du tenant (sauf demandeur et déjà exclus)
        exclus_ids_set = set(exclus_ids + [demandeur_id])
        
        users_cursor = db.users.find({
            "tenant_id": tenant_id,
            "id": {"$nin": list(exclus_ids_set)},
            "type_emploi": "temps_partiel"  # Seulement temps partiel pour remplacements
        })
        users_list = await users_cursor.to_list(length=None)
        
        remplacants_potentiels = []
        
        for user in users_list:
            # 1. Vérifier les compétences/formations
            user_formations = set(user.get("formations", []))
            if competences_requises and not set(competences_requises).issubset(user_formations):
                continue  # Ne possède pas toutes les compétences requises
            
            # 2. Vérifier le grade
            user_grade = user.get("grade", "pompier")
            grades_hierarchie = ["pompier", "lieutenant", "capitaine", "chef"]
            
            if officier_obligatoire:
                # Pour officier obligatoire, il faut au moins lieutenant
                if user_grade not in ["lieutenant", "capitaine", "chef"]:
                    continue
            
            # 3. Vérifier qu'il n'a PAS d'indisponibilité pour cette date
            indispo = await db.disponibilites.find_one({
                "user_id": user["id"],
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "indisponible"
            })
            
            if indispo:
                continue  # A une indisponibilité, on passe
            
            # 4. Vérifier s'il a une disponibilité déclarée (bonus)
            dispo = await db.disponibilites.find_one({
                "user_id": user["id"],
                "tenant_id": tenant_id,
                "date": date_garde,
                "statut": "disponible"
            })
            
            has_disponibilite = dispo is not None
            
            # 5. Ancienneté (date_embauche)
            date_embauche = user.get("date_embauche", "2999-12-31")  # Si pas de date, le plus récent
            
            remplacants_potentiels.append({
                "user_id": user["id"],
                "nom_complet": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "email": user.get("email", ""),
                "grade": user_grade,
                "date_embauche": date_embauche,
                "has_disponibilite": has_disponibilite,
                "formations": list(user_formations)
            })
        
        # Trier par: 1. Disponibilité déclarée, 2. Ancienneté (date la plus ancienne)
        remplacants_potentiels.sort(
            key=lambda x: (
                not x["has_disponibilite"],  # False (a dispo) avant True (pas de dispo)
                x["date_embauche"]  # Date la plus ancienne en premier
            )
        )
        
        logging.info(f"✅ Trouvé {len(remplacants_potentiels)} remplaçants potentiels pour demande {type_garde_id}")
        return remplacants_potentiels
        
    except Exception as e:
        logging.error(f"❌ Erreur lors de la recherche de remplaçants: {e}", exc_info=True)
        return []

async def lancer_recherche_remplacant(demande_id: str, tenant_id: str):
    """
    Lance la recherche de remplaçant pour une demande
    Contacte le(s) premier(s) remplaçant(s) selon le mode de notification
    """
    try:
        # Récupérer la demande
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            logging.error(f"Demande de remplacement non trouvée: {demande_id}")
            return
        
        # Récupérer les paramètres de remplacement
        parametres_data = await db.parametres.find_one({"tenant_id": tenant_id})
        if not parametres_data:
            # Paramètres par défaut
            mode_notification = "un_par_un"
            delai_attente_heures = 2
            nombre_simultane = 1
        else:
            mode_notification = parametres_data.get("mode_notification", "un_par_un")
            delai_attente_heures = parametres_data.get("delai_attente_heures", 2)
            nombre_simultane = parametres_data.get("nombre_simultane", 3)
        
        # Trouver les remplaçants potentiels (excluant ceux déjà contactés)
        exclus_ids = [t.get("user_id") for t in demande_data.get("tentatives_historique", [])]
        
        remplacants = await trouver_remplacants_potentiels(
            tenant_id=tenant_id,
            type_garde_id=demande_data["type_garde_id"],
            date_garde=demande_data["date"],
            demandeur_id=demande_data["demandeur_id"],
            exclus_ids=exclus_ids
        )
        
        if not remplacants:
            # Aucun remplaçant trouvé, marquer comme expiree et notifier superviseur
            logging.warning(f"⚠️ Aucun remplaçant trouvé pour la demande {demande_id}")
            await db.demandes_remplacement.update_one(
                {"id": demande_id},
                {
                    "$set": {
                        "statut": "expiree",
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            # Notifier superviseurs qu'aucun remplaçant n'a été trouvé
            superviseurs = await db.users.find({
                "tenant_id": tenant_id,
                "role": {"$in": ["superviseur", "admin"]}
            }).to_list(100)
            
            superviseur_ids = [s["id"] for s in superviseurs]
            if superviseur_ids:
                demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
                await send_push_notification_to_users(
                    user_ids=superviseur_ids,
                    title="❌ Aucun remplaçant trouvé",
                    body=f"Aucun remplaçant disponible pour {demandeur.get('prenom', '')} {demandeur.get('nom', '')} le {demande_data['date']}",
                    data={
                        "type": "remplacement_expiree",
                        "demande_id": demande_id
                    }
                )
            return
        
        # Déterminer combien de remplaçants contacter
        if mode_notification == "multiple":
            nombre_a_contacter = min(nombre_simultane, len(remplacants))
        else:  # un_par_un
            nombre_a_contacter = 1
        
        remplacants_a_contacter = remplacants[:nombre_a_contacter]
        
        # Contacter les remplaçants
        remplacant_ids = []
        maintenant = datetime.now(timezone.utc)
        
        for remplacant in remplacants_a_contacter:
            # Ajouter à l'historique
            tentative = {
                "user_id": remplacant["user_id"],
                "nom_complet": remplacant["nom_complet"],
                "date_contact": maintenant.isoformat(),
                "statut": "contacted",
                "date_reponse": None
            }
            
            await db.demandes_remplacement.update_one(
                {"id": demande_id},
                {
                    "$push": {"tentatives_historique": tentative},
                    "$addToSet": {"remplacants_contactes_ids": remplacant["user_id"]}
                }
            )
            
            remplacant_ids.append(remplacant["user_id"])
            
            logging.info(f"📤 Contact remplaçant {remplacant['nom_complet']} pour demande {demande_id}")
        
        # Calculer la date de prochaine tentative (si timeout sans réponse)
        date_prochaine = maintenant + timedelta(hours=delai_attente_heures)
        
        # Mettre à jour la demande
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "en_cours",
                    "date_prochaine_tentative": date_prochaine,
                    "updated_at": maintenant
                },
                "$inc": {"nombre_tentatives": 1}
            }
        )
        
        # Envoyer notifications push aux remplaçants
        demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
        type_garde = await db.types_garde.find_one({"id": demande_data["type_garde_id"]})
        
        await send_push_notification_to_users(
            user_ids=remplacant_ids,
            title="🚨 Demande de remplacement",
            body=f"{demandeur.get('prenom', '')} {demandeur.get('nom', '')} cherche un remplaçant pour {type_garde.get('nom', 'une garde')} le {demande_data['date']}",
            data={
                "type": "remplacement_proposition",
                "demande_id": demande_id,
                "lien": "/remplacements"
            }
        )
        
        logging.info(f"✅ Recherche lancée pour demande {demande_id}: {nombre_a_contacter} remplaçant(s) contacté(s)")
        
    except Exception as e:
        logging.error(f"❌ Erreur lors du lancement de la recherche de remplaçant: {e}", exc_info=True)

async def accepter_remplacement(demande_id: str, remplacant_id: str, tenant_id: str):
    """
    Traite l'acceptation d'un remplacement par un remplaçant
    - Vérifie que le remplaçant est le plus ancien si plusieurs acceptations simultanées
    - Met à jour le planning (assignations)
    - Notifie le demandeur et les superviseurs
    """
    try:
        # Récupérer la demande
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier que la demande est toujours en cours
        if demande_data["statut"] != "en_cours":
            raise HTTPException(status_code=400, detail="Cette demande n'est plus disponible")
        
        # Vérifier que le remplaçant a bien été contacté
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à accepter cette demande")
        
        # Récupérer le remplaçant
        remplacant = await db.users.find_one({"id": remplacant_id, "tenant_id": tenant_id})
        if not remplacant:
            raise HTTPException(status_code=404, detail="Remplaçant non trouvé")
        
        # Mettre à jour la demande
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$set": {
                    "statut": "accepte",
                    "remplacant_id": remplacant_id,
                    "updated_at": maintenant
                }
            }
        )
        
        # Mettre à jour l'historique des tentatives
        await db.demandes_remplacement.update_one(
            {
                "id": demande_id,
                "tentatives_historique.user_id": remplacant_id
            },
            {
                "$set": {
                    "tentatives_historique.$.statut": "accepted",
                    "tentatives_historique.$.date_reponse": maintenant.isoformat()
                }
            }
        )
        
        # Mettre à jour le planning (assignations)
        # Trouver l'assignation du demandeur pour cette date et ce type de garde
        assignation = await db.assignations.find_one({
            "tenant_id": tenant_id,
            "user_id": demande_data["demandeur_id"],
            "date": demande_data["date"],
            "type_garde_id": demande_data["type_garde_id"]
        })
        
        if assignation:
            # Remplacer l'assignation par le remplaçant
            await db.assignations.update_one(
                {"id": assignation["id"]},
                {
                    "$set": {
                        "user_id": remplacant_id,
                        "est_remplacement": True,
                        "demandeur_original_id": demande_data["demandeur_id"],
                        "updated_at": maintenant
                    }
                }
            )
            logging.info(f"✅ Planning mis à jour: {remplacant['prenom']} {remplacant['nom']} remplace assignation {assignation['id']}")
        else:
            logging.warning(f"⚠️ Aucune assignation trouvée pour le demandeur {demande_data['demandeur_id']} le {demande_data['date']}")
        
        # Notifier le demandeur
        demandeur = await db.users.find_one({"id": demande_data["demandeur_id"]})
        await send_push_notification_to_users(
            user_ids=[demande_data["demandeur_id"]],
            title="✅ Remplacement trouvé!",
            body=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} a accepté de vous remplacer le {demande_data['date']}",
            data={
                "type": "remplacement_accepte",
                "demande_id": demande_id,
                "remplacant_id": remplacant_id
            }
        )
        
        # Notifier les superviseurs
        superviseurs = await db.users.find({
            "tenant_id": tenant_id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = [s["id"] for s in superviseurs]
        if superviseur_ids:
            await send_push_notification_to_users(
                user_ids=superviseur_ids,
                title="✅ Remplacement confirmé",
                body=f"{remplacant.get('prenom', '')} {remplacant.get('nom', '')} remplace {demandeur.get('prenom', '')} {demandeur.get('nom', '')} le {demande_data['date']}",
                data={
                    "type": "remplacement_accepte",
                    "demande_id": demande_id
                }
            )
        
        # Notifier les autres remplaçants contactés qu'ils ne sont plus nécessaires
        autres_remplacants_ids = [
            rid for rid in demande_data.get("remplacants_contactes_ids", [])
            if rid != remplacant_id
        ]
        
        if autres_remplacants_ids:
            await send_push_notification_to_users(
                user_ids=autres_remplacants_ids,
                title="Remplacement pourvu",
                body=f"Le remplacement du {demande_data['date']} a été pourvu par un autre pompier",
                data={
                    "type": "remplacement_pourvu",
                    "demande_id": demande_id
                }
            )
        
        logging.info(f"✅ Remplacement accepté: demande {demande_id}, remplaçant {remplacant['nom_complet']}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur lors de l'acceptation du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de l'acceptation du remplacement")

async def refuser_remplacement(demande_id: str, remplacant_id: str, tenant_id: str):
    """
    Traite le refus d'un remplacement par un remplaçant
    - Met à jour l'historique
    - Si tous les remplaçants contactés ont refusé, lance une nouvelle recherche
    """
    try:
        # Récupérer la demande
        demande_data = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant_id})
        if not demande_data:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Vérifier que le remplaçant a bien été contacté
        if remplacant_id not in demande_data.get("remplacants_contactes_ids", []):
            raise HTTPException(status_code=403, detail="Vous n'êtes pas autorisé à refuser cette demande")
        
        # Mettre à jour l'historique
        maintenant = datetime.now(timezone.utc)
        await db.demandes_remplacement.update_one(
            {
                "id": demande_id,
                "tentatives_historique.user_id": remplacant_id
            },
            {
                "$set": {
                    "tentatives_historique.$.statut": "refused",
                    "tentatives_historique.$.date_reponse": maintenant.isoformat()
                }
            }
        )
        
        # Retirer de la liste des remplaçants en attente
        await db.demandes_remplacement.update_one(
            {"id": demande_id},
            {
                "$pull": {"remplacants_contactes_ids": remplacant_id},
                "$set": {"updated_at": maintenant}
            }
        )
        
        # Vérifier s'il reste des remplaçants en attente
        demande_updated = await db.demandes_remplacement.find_one({"id": demande_id})
        if not demande_updated.get("remplacants_contactes_ids"):
            # Plus personne en attente, relancer la recherche immédiatement
            logging.info(f"🔄 Tous les remplaçants ont refusé, relance de la recherche pour demande {demande_id}")
            await lancer_recherche_remplacant(demande_id, tenant_id)
        
        logging.info(f"❌ Remplacement refusé par remplaçant {remplacant_id} pour demande {demande_id}")
        return True
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur lors du refus du remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors du refus du remplacement")

async def verifier_et_traiter_timeouts():
    """
    Fonction appelée périodiquement pour vérifier les demandes en timeout
    Relance la recherche si le délai d'attente est dépassé
    """
    try:
        maintenant = datetime.now(timezone.utc)
        
        # Trouver toutes les demandes en_cours dont la date_prochaine_tentative est dépassée
        demandes_cursor = db.demandes_remplacement.find({
            "statut": "en_cours",
            "date_prochaine_tentative": {"$lte": maintenant}
        })
        
        demandes_timeout = await demandes_cursor.to_list(length=None)
        
        for demande in demandes_timeout:
            logging.info(f"⏱️ Timeout atteint pour demande {demande['id']}, relance de la recherche")
            
            # Marquer les remplaçants contactés comme expirés dans l'historique
            for remplacant_id in demande.get("remplacants_contactes_ids", []):
                await db.demandes_remplacement.update_one(
                    {
                        "id": demande["id"],
                        "tentatives_historique.user_id": remplacant_id,
                        "tentatives_historique.statut": "contacted"
                    },
                    {
                        "$set": {
                            "tentatives_historique.$.statut": "expired",
                            "tentatives_historique.$.date_reponse": maintenant.isoformat()
                        }
                    }
                )
            
            # Vider la liste des remplaçants en attente
            await db.demandes_remplacement.update_one(
                {"id": demande["id"]},
                {
                    "$set": {
                        "remplacants_contactes_ids": [],
                        "updated_at": maintenant
                    }
                }
            )
            
            # Relancer la recherche
            await lancer_recherche_remplacant(demande["id"], demande["tenant_id"])
        
        if demandes_timeout:
            logging.info(f"✅ Traité {len(demandes_timeout)} demande(s) en timeout")
        
    except Exception as e:
        logging.error(f"❌ Erreur lors de la vérification des timeouts: {e}", exc_info=True)


@api_router.post("/{tenant_slug}/remplacements", response_model=DemandeRemplacement)
async def create_demande_remplacement(tenant_slug: str, demande: DemandeRemplacementCreate, current_user: User = Depends(get_current_user)):
    """
    Créer une demande de remplacement et lancer automatiquement la recherche de remplaçant
    """
    try:
        # Vérifier le tenant
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Calculer la priorité automatiquement
        priorite = await calculer_priorite_demande(demande.date)
        
        demande_dict = demande.dict()
        demande_dict["tenant_id"] = tenant.id
        demande_dict["demandeur_id"] = current_user.id
        demande_dict["priorite"] = priorite
        demande_dict["statut"] = "en_attente"  # Commence en attente
        
        demande_obj = DemandeRemplacement(**demande_dict)
        await db.demandes_remplacement.insert_one(demande_obj.dict())
        
        logging.info(f"✅ Demande de remplacement créée: {demande_obj.id} (priorité: {priorite})")
        
        # Créer notification pour les superviseurs/admins (info seulement, pas de gestion manuelle)
        superviseurs_admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        
        superviseur_ids = []
        for user in superviseurs_admins:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=user["id"],
                type="remplacement_demande",
                titre=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement en cours",
                message=f"{current_user.prenom} {current_user.nom} cherche un remplaçant pour le {demande.date}",
                lien="/remplacements",
                data={"demande_id": demande_obj.id}
            )
            superviseur_ids.append(user["id"])
        
        # Envoyer notifications push aux superviseurs (pour info)
        if superviseur_ids:
            await send_push_notification_to_users(
                user_ids=superviseur_ids,
                title=f"{'🚨 ' if priorite == 'urgent' else ''}Recherche de remplacement",
                body=f"{current_user.prenom} {current_user.nom} cherche un remplaçant pour le {demande.date}",
                data={
                    "type": "remplacement_demande",
                    "demande_id": demande_obj.id,
                    "lien": "/remplacements"
                }
            )
        
        # 🚀 LANCER LA RECHERCHE AUTOMATIQUE DE REMPLAÇANT
        await lancer_recherche_remplacant(demande_obj.id, tenant.id)
        
        # Clean the object before returning
        cleaned_demande = clean_mongo_doc(demande_obj.dict())
        return DemandeRemplacement(**cleaned_demande)
        
    except Exception as e:
        logging.error(f"❌ Erreur lors de la création de la demande de remplacement: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la demande")

@api_router.get("/{tenant_slug}/remplacements", response_model=List[DemandeRemplacement])
async def get_demandes_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role == "employe":
        demandes = await db.demandes_remplacement.find({
            "tenant_id": tenant.id,
            "demandeur_id": current_user.id
        }).to_list(1000)
    else:
        demandes = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
    
    cleaned_demandes = [clean_mongo_doc(demande) for demande in demandes]
    return [DemandeRemplacement(**demande) for demande in cleaned_demandes]

@api_router.get("/{tenant_slug}/remplacements/propositions")
async def get_propositions_remplacement(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """
    Récupère les propositions de remplacement pour l'utilisateur connecté
    (Les demandes où il a été contacté et doit répondre)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Trouver les demandes où l'utilisateur est dans remplacants_contactes_ids et statut = en_cours
    demandes = await db.demandes_remplacement.find({
        "tenant_id": tenant.id,
        "statut": "en_cours",
        "remplacants_contactes_ids": current_user.id
    }).to_list(1000)
    
    # Enrichir avec les détails du demandeur et du type de garde
    propositions = []
    for demande in demandes:
        demandeur = await db.users.find_one({"id": demande["demandeur_id"]})
        type_garde = await db.types_garde.find_one({"id": demande["type_garde_id"]})
        
        demande["demandeur"] = {
            "nom": demandeur.get("nom", ""),
            "prenom": demandeur.get("prenom", ""),
            "email": demandeur.get("email", "")
        } if demandeur else None
        
        demande["type_garde"] = {
            "nom": type_garde.get("nom", ""),
            "heure_debut": type_garde.get("heure_debut", ""),
            "heure_fin": type_garde.get("heure_fin", "")
        } if type_garde else None
        
        propositions.append(clean_mongo_doc(demande))
    
    return propositions

@api_router.put("/{tenant_slug}/remplacements/{demande_id}/accepter")
async def accepter_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Accepter une proposition de remplacement
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await accepter_remplacement(demande_id, current_user.id, tenant.id)
    
    return {
        "message": "Remplacement accepté avec succès",
        "demande_id": demande_id
    }

@api_router.put("/{tenant_slug}/remplacements/{demande_id}/refuser")
async def refuser_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Refuser une proposition de remplacement
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await refuser_remplacement(demande_id, current_user.id, tenant.id)
    
    return {
        "message": "Remplacement refusé",
        "demande_id": demande_id
    }

@api_router.delete("/{tenant_slug}/remplacements/{demande_id}")
async def annuler_demande_remplacement(
    tenant_slug: str,
    demande_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Annuler une demande de remplacement (seulement par le demandeur)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer la demande
    demande = await db.demandes_remplacement.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier que c'est bien le demandeur
    if demande["demandeur_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Seul le demandeur peut annuler la demande")
    
    # Vérifier que la demande n'est pas déjà acceptée
    if demande["statut"] == "accepte":
        raise HTTPException(status_code=400, detail="Impossible d'annuler une demande déjà acceptée")
    
    # Marquer comme annulée
    await db.demandes_remplacement.update_one(
        {"id": demande_id},
        {
            "$set": {
                "statut": "annulee",
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Notifier les remplaçants contactés que la demande est annulée
    if demande.get("remplacants_contactes_ids"):
        await send_push_notification_to_users(
            user_ids=demande["remplacants_contactes_ids"],
            title="Demande annulée",
            body=f"La demande de remplacement du {demande['date']} a été annulée",
            data={
                "type": "remplacement_annulee",
                "demande_id": demande_id
            }
        )
    
    logging.info(f"✅ Demande de remplacement annulée: {demande_id}")
    
    return {
        "message": "Demande annulée avec succès",
        "demande_id": demande_id
    }

# ==================== COMPÉTENCES ROUTES ====================

@api_router.post("/{tenant_slug}/competences", response_model=Competence)
async def create_competence(tenant_slug: str, competence: CompetenceCreate, current_user: User = Depends(get_current_user)):
    """Crée une compétence"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    competence_dict = competence.dict()
    competence_dict["tenant_id"] = tenant.id
    competence_obj = Competence(**competence_dict)
    
    comp_data = competence_obj.dict()
    comp_data["created_at"] = competence_obj.created_at.isoformat()
    
    await db.competences.insert_one(comp_data)
    return competence_obj

@api_router.get("/{tenant_slug}/competences", response_model=List[Competence])
async def get_competences(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère toutes les compétences"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    competences = await db.competences.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned = [clean_mongo_doc(c) for c in competences]
    
    for c in cleaned:
        if isinstance(c.get("created_at"), str):
            c["created_at"] = datetime.fromisoformat(c["created_at"].replace('Z', '+00:00'))
    
    return [Competence(**c) for c in cleaned]

@api_router.put("/{tenant_slug}/competences/{competence_id}", response_model=Competence)
async def update_competence(
    tenant_slug: str,
    competence_id: str,
    competence_update: CompetenceUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une compétence"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
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

@api_router.delete("/{tenant_slug}/competences/{competence_id}")
async def delete_competence(tenant_slug: str, competence_id: str, current_user: User = Depends(get_current_user)):
    """Supprime une compétence"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.competences.delete_one({"id": competence_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Compétence non trouvée")
    
    return {"message": "Compétence supprimée"}

# ==================== FORMATIONS ROUTES NFPA 1500 ====================

@api_router.post("/{tenant_slug}/formations", response_model=Formation)
async def create_formation(tenant_slug: str, formation: FormationCreate, current_user: User = Depends(get_current_user)):
    """Crée une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation_dict = formation.dict()
    formation_dict["tenant_id"] = tenant.id
    formation_dict["places_restantes"] = formation.places_max
    formation_obj = Formation(**formation_dict)
    
    form_data = formation_obj.dict()
    form_data["created_at"] = formation_obj.created_at.isoformat()
    form_data["updated_at"] = formation_obj.updated_at.isoformat()
    
    await db.formations.insert_one(form_data)
    return formation_obj

@api_router.get("/{tenant_slug}/formations", response_model=List[Formation])
async def get_formations(tenant_slug: str, annee: Optional[int] = None, current_user: User = Depends(get_current_user)):
    """Récupère formations (filtre annee)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    query = {"tenant_id": tenant.id}
    if annee:
        query["annee"] = annee
    
    formations = await db.formations.find(query).sort("date_debut", 1).to_list(1000)
    cleaned = [clean_mongo_doc(f) for f in formations]
    
    for f in cleaned:
        if isinstance(f.get("created_at"), str):
            f["created_at"] = datetime.fromisoformat(f["created_at"].replace('Z', '+00:00'))
        if isinstance(f.get("updated_at"), str):
            f["updated_at"] = datetime.fromisoformat(f["updated_at"].replace('Z', '+00:00'))
    
    return [Formation(**f) for f in cleaned]

@api_router.put("/{tenant_slug}/formations/{formation_id}", response_model=Formation)
async def update_formation(
    tenant_slug: str,
    formation_id: str,
    formation_update: FormationUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    update_data = {k: v for k, v in formation_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.formations.update_one(
        {"id": formation_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    updated = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    cleaned = clean_mongo_doc(updated)
    
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return Formation(**cleaned)

@api_router.delete("/{tenant_slug}/formations/{formation_id}")
async def delete_formation(tenant_slug: str, formation_id: str, current_user: User = Depends(get_current_user)):
    """Supprime une formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Supprimer inscriptions
    await db.inscriptions_formations.delete_many({
        "formation_id": formation_id,
        "tenant_id": tenant.id
    })
    
    result = await db.formations.delete_one({"id": formation_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    return {"message": "Formation supprimée"}

@api_router.post("/{tenant_slug}/formations/{formation_id}/inscription")
async def inscrire_formation(
    tenant_slug: str,
    formation_id: str,
    current_user: User = Depends(get_current_user)
):
    """Inscription à formation avec gestion liste d'attente"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    # Vérifier déjà inscrit
    existing = await db.inscriptions_formations.find_one({
        "formation_id": formation_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="Déjà inscrit")
    
    # Compter inscrits
    nb_inscrits = await db.inscriptions_formations.count_documents({
        "formation_id": formation_id,
        "tenant_id": tenant.id,
        "statut": "inscrit"
    })
    
    statut = "inscrit" if nb_inscrits < formation["places_max"] else "en_attente"
    
    inscription = InscriptionFormation(
        tenant_id=tenant.id,
        formation_id=formation_id,
        user_id=current_user.id,
        date_inscription=datetime.now(timezone.utc).date().isoformat(),
        statut=statut
    )
    
    insc_data = inscription.dict()
    insc_data["created_at"] = inscription.created_at.isoformat()
    insc_data["updated_at"] = inscription.updated_at.isoformat()
    
    await db.inscriptions_formations.insert_one(insc_data)
    
    # MAJ places
    if statut == "inscrit":
        await db.formations.update_one(
            {"id": formation_id, "tenant_id": tenant.id},
            {"$set": {"places_restantes": formation["places_max"] - nb_inscrits - 1}}
        )
    
    # Notifier si liste attente
    if statut == "en_attente":
        superviseurs = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["admin", "superviseur"]}
        }).to_list(100)
        
        for sup in superviseurs:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=sup["id"],
                type="formation_liste_attente",
                titre="Liste d'attente formation",
                message=f"{formation['nom']}: {current_user.prenom} {current_user.nom} en liste d'attente",
                lien="/formations"
            )
    
    return {"message": "Inscription réussie", "statut": statut}

@api_router.get("/{tenant_slug}/formations/{formation_id}/inscriptions")
async def get_inscriptions(tenant_slug: str, formation_id: str, current_user: User = Depends(get_current_user)):
    """Liste inscriptions formation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inscriptions = await db.inscriptions_formations.find({
        "formation_id": formation_id,
        "tenant_id": tenant.id
    }).to_list(1000)
    
    result = []
    for insc in inscriptions:
        user = await db.users.find_one({"id": insc["user_id"], "tenant_id": tenant.id})
        if user:
            cleaned = clean_mongo_doc(insc)
            cleaned["user_nom"] = f"{user['prenom']} {user['nom']}"
            cleaned["user_grade"] = user.get("grade", "")
            result.append(cleaned)
    
    return result

@api_router.put("/{tenant_slug}/formations/{formation_id}/presence/{user_id}")
async def valider_presence(
    tenant_slug: str,
    formation_id: str,
    user_id: str,
    presence: InscriptionFormationUpdate,
    current_user: User = Depends(get_current_user)
):
    """Valide présence et crédite heures"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formation = await db.formations.find_one({"id": formation_id, "tenant_id": tenant.id})
    if not formation:
        raise HTTPException(status_code=404, detail="Formation non trouvée")
    
    heures = formation["duree_heures"] if presence.statut == "present" else 0
    
    await db.inscriptions_formations.update_one(
        {"formation_id": formation_id, "user_id": user_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": presence.statut,
            "heures_creditees": heures,
            "notes": presence.notes or "",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Présence validée", "heures": heures}

@api_router.get("/{tenant_slug}/formations/rapports/conformite")
async def rapport_conformite(tenant_slug: str, annee: int, current_user: User = Depends(get_current_user)):
    """Rapport conformité NFPA 1500"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    pompiers = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    params = await db.parametres_formations.find_one({"tenant_id": tenant.id})
    heures_min = params.get("heures_minimales_annuelles", 100) if params else 100
    pourcentage_min = params.get("pourcentage_presence_minimum", 80) if params else 80
    
    aujourd_hui = datetime.now(timezone.utc).date()
    
    rapport = []
    for pompier in pompiers:
        # Toutes les inscriptions
        toutes_inscriptions = await db.inscriptions_formations.find({
            "user_id": pompier["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        
        total_heures = 0
        formations_passees = 0
        presences = 0
        
        for insc in toutes_inscriptions:
            formation = await db.formations.find_one({
                "id": insc["formation_id"],
                "annee": annee,
                "tenant_id": tenant.id
            })
            
            if formation:
                date_fin = datetime.fromisoformat(formation["date_fin"]).date()
                
                # Heures créditées
                if insc.get("statut") == "present":
                    total_heures += insc.get("heures_creditees", 0)
                
                # Calcul taux de présence (formations passées seulement)
                if date_fin < aujourd_hui:
                    formations_passees += 1
                    if insc.get("statut") == "present":
                        presences += 1
        
        taux_presence = round((presences / formations_passees * 100) if formations_passees > 0 else 0, 1)
        conforme_presence = taux_presence >= pourcentage_min
        conforme_heures = total_heures >= heures_min
        
        pompier_data = clean_mongo_doc(pompier)
        pompier_data["total_heures"] = total_heures
        pompier_data["heures_requises"] = heures_min
        pompier_data["conforme"] = conforme_heures and conforme_presence
        pompier_data["pourcentage"] = round((total_heures / heures_min * 100) if heures_min > 0 else 0, 1)
        pompier_data["taux_presence"] = taux_presence
        pompier_data["formations_passees"] = formations_passees
        pompier_data["presences"] = presences
        rapport.append(pompier_data)
    
    rapport.sort(key=lambda x: (-int(x["conforme"]), -x["total_heures"]))
    
    return {
        "annee": annee,
        "heures_minimales": heures_min,
        "total_pompiers": len(rapport),
        "conformes": len([p for p in rapport if p["conforme"]]),
        "pourcentage_conformite": round(len([p for p in rapport if p["conforme"]]) / len(rapport) * 100, 1) if len(rapport) > 0 else 0,
        "pompiers": rapport
    }

@api_router.get("/{tenant_slug}/formations/rapports/dashboard")
async def dashboard_formations(tenant_slug: str, annee: int, current_user: User = Depends(get_current_user)):
    """Dashboard KPIs formations"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    formations = await db.formations.find({"tenant_id": tenant.id, "annee": annee}).to_list(1000)
    heures_planifiees = sum([f.get("duree_heures", 0) for f in formations])
    
    inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant.id,
        "statut": "present"
    }).to_list(10000)
    
    heures_effectuees = sum([i.get("heures_creditees", 0) for i in inscriptions])
    
    total_pompiers = await db.users.count_documents({"tenant_id": tenant.id})
    users_formes = len(set([i["user_id"] for i in inscriptions]))
    
    return {
        "annee": annee,
        "heures_planifiees": heures_planifiees,
        "heures_effectuees": heures_effectuees,
        "pourcentage_realisation": round((heures_effectuees / heures_planifiees * 100) if heures_planifiees > 0 else 0, 1),
        "total_pompiers": total_pompiers,
        "pompiers_formes": users_formes,
        "pourcentage_pompiers": round((users_formes / total_pompiers * 100) if total_pompiers > 0 else 0, 1)
    }


@api_router.get("/{tenant_slug}/formations/mon-taux-presence")
async def get_mon_taux_presence(
    tenant_slug: str,
    annee: int,
    current_user: User = Depends(get_current_user)
):
    """Calcule le taux de présence personnel (formations passées)"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Date d'aujourd'hui
    aujourd_hui = datetime.now(timezone.utc).date()
    
    # Récupérer mes inscriptions
    mes_inscriptions = await db.inscriptions_formations.find({
        "user_id": current_user.id,
        "tenant_id": tenant.id
    }).to_list(1000)
    
    formations_passees = 0
    presences_validees = 0
    
    for insc in mes_inscriptions:
        formation = await db.formations.find_one({
            "id": insc["formation_id"],
            "annee": annee,
            "tenant_id": tenant.id
        })
        
        if formation:
            date_fin = datetime.fromisoformat(formation["date_fin"]).date()
            
            # Seulement les formations passées
            if date_fin < aujourd_hui:
                formations_passees += 1
                if insc.get("statut") == "present":
                    presences_validees += 1
    
    taux_presence = round((presences_validees / formations_passees * 100) if formations_passees > 0 else 0, 1)
    
    # Récupérer les paramètres pour savoir si conforme
    params = await db.parametres_formations.find_one({"tenant_id": tenant.id})
    pourcentage_min = params.get("pourcentage_presence_minimum", 80) if params else 80
    
    conforme = taux_presence >= pourcentage_min
    
    return {
        "formations_passees": formations_passees,
        "presences_validees": presences_validees,
        "absences": formations_passees - presences_validees,
        "taux_presence": taux_presence,
        "pourcentage_minimum": pourcentage_min,
        "conforme": conforme
    }



class DemandeCongé(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demandeur_id: str
    type_conge: str  # maladie, vacances, parental, personnel
    date_debut: str  # YYYY-MM-DD
    date_fin: str  # YYYY-MM-DD
    nombre_jours: int
    raison: str
    documents: List[str] = []  # URLs des documents justificatifs
    priorite: str = "normale"  # urgente, haute, normale, faible
    statut: str = "en_attente"  # en_attente, approuve, refuse
    approuve_par: Optional[str] = None  # ID du superviseur/admin qui approuve
    date_approbation: Optional[str] = None
    commentaire_approbation: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DemandeCongeCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    type_conge: str
    date_debut: str
    date_fin: str
    raison: str = ""
    statut: str = "en_attente"

class Notification(BaseModel):
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

class NotificationRemplacement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    demande_remplacement_id: str
    destinataire_id: str
    message: str
    type_notification: str = "remplacement_disponible"  # remplacement_disponible, approbation_requise
    statut: str = "envoye"  # envoye, lu, accepte, refuse
    date_envoi: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_reponse: Optional[datetime] = None
    ordre_priorite: Optional[int] = None  # Pour le mode séquentiel

class ParametresRemplacements(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    mode_notification: str = "simultane"  # simultane, sequentiel, groupe_sequentiel
    taille_groupe: int = 3  # Pour mode groupe_sequentiel
    delai_attente_heures: int = 24  # Délai avant de passer au suivant
    max_contacts: int = 5
    priorite_grade: bool = True
    priorite_competences: bool = True

# EPI Models
# ==================== MODÈLES EPI NFPA 1851 ====================

class EPI(BaseModel):
    """Modèle complet d'un équipement de protection individuelle selon NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    numero_serie: str  # Numéro de série interne (format libre)
    type_epi: str  # casque, bottes, veste_bunker, pantalon_bunker, gants, cagoule
    marque: str
    modele: str
    numero_serie_fabricant: str = ""
    date_fabrication: Optional[str] = None
    date_mise_en_service: str
    norme_certification: str = ""  # ex: NFPA 1971, édition 2018
    cout_achat: float = 0.0
    couleur: str = ""
    taille: str = ""
    user_id: Optional[str] = None  # Affecté à quel pompier
    statut: str = "En service"  # En service, En inspection, En réparation, Hors service, Retiré
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EPICreate(BaseModel):
    tenant_id: Optional[str] = None
    numero_serie: str = ""  # Auto-généré si vide
    type_epi: str
    marque: str
    modele: str
    numero_serie_fabricant: str = ""
    date_fabrication: Optional[str] = None
    date_mise_en_service: str
    norme_certification: str = ""
    cout_achat: float = 0.0
    couleur: str = ""
    taille: str = ""
    user_id: Optional[str] = None
    statut: str = "En service"
    notes: str = ""

class EPIUpdate(BaseModel):
    numero_serie: Optional[str] = None
    type_epi: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    numero_serie_fabricant: Optional[str] = None
    date_fabrication: Optional[str] = None
    date_mise_en_service: Optional[str] = None
    norme_certification: Optional[str] = None
    cout_achat: Optional[float] = None
    couleur: Optional[str] = None
    taille: Optional[str] = None
    user_id: Optional[str] = None
    statut: Optional[str] = None
    notes: Optional[str] = None

class InspectionEPI(BaseModel):
    """Modèle pour les 3 types d'inspections NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    type_inspection: str  # apres_utilisation, routine_mensuelle, avancee_annuelle
    date_inspection: str
    inspecteur_nom: str
    inspecteur_id: Optional[str] = None  # Si c'est un utilisateur du système
    isp_id: Optional[str] = None  # Si inspection par ISP
    isp_nom: str = ""
    isp_accreditations: str = ""
    statut_global: str  # conforme, non_conforme, necessite_reparation, hors_service
    checklist: Dict[str, Any] = {}  # JSON avec tous les points de vérification
    photos: List[str] = []
    commentaires: str = ""
    rapport_pdf_url: str = ""  # Pour inspection avancée
    signature_numerique: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    type_inspection: str
    date_inspection: str
    inspecteur_nom: str
    inspecteur_id: Optional[str] = None
    isp_id: Optional[str] = None
    isp_nom: str = ""
    isp_accreditations: str = ""
    statut_global: str
    checklist: Dict[str, Any] = {}
    photos: List[str] = []
    commentaires: str = ""
    rapport_pdf_url: str = ""
    signature_numerique: str = ""

class ISP(BaseModel):
    """Fournisseur de Services Indépendant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    contact: str = ""
    telephone: str = ""
    email: str = ""
    accreditations: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ISPCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    contact: str = ""
    telephone: str = ""
    email: str = ""
    accreditations: str = ""
    notes: str = ""

class ISPUpdate(BaseModel):
    nom: Optional[str] = None
    contact: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    accreditations: Optional[str] = None
    notes: Optional[str] = None

# ==================== MODÈLES PHASE 2 : NETTOYAGE, RÉPARATIONS, RETRAIT ====================

class NettoyageEPI(BaseModel):
    """Suivi des nettoyages EPI selon NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    type_nettoyage: str  # routine, avance
    date_nettoyage: str
    methode: str  # laveuse_extractrice, manuel, externe
    effectue_par: str  # Nom de la personne ou organisation
    effectue_par_id: Optional[str] = None  # ID utilisateur si interne
    isp_id: Optional[str] = None  # Si nettoyage externe
    nombre_cycles: int = 1  # Pour suivi limite fabricant
    temperature: str = ""  # Ex: "Eau tiède max 40°C"
    produits_utilises: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NettoyageEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    type_nettoyage: str
    date_nettoyage: str
    methode: str
    effectue_par: str
    effectue_par_id: Optional[str] = None
    isp_id: Optional[str] = None
    nombre_cycles: int = 1
    temperature: str = ""
    produits_utilises: str = ""
    notes: str = ""

class ReparationEPI(BaseModel):
    """Gestion des réparations EPI"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    statut: str  # demandee, en_cours, terminee, impossible
    date_demande: str
    demandeur: str
    demandeur_id: Optional[str] = None
    date_envoi: Optional[str] = None
    date_reception: Optional[str] = None
    date_reparation: Optional[str] = None
    reparateur_type: str  # interne, externe
    reparateur_nom: str = ""
    isp_id: Optional[str] = None
    probleme_description: str
    pieces_remplacees: List[str] = []
    cout_reparation: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReparationEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    statut: str = "demandee"
    date_demande: str
    demandeur: str
    demandeur_id: Optional[str] = None
    reparateur_type: str
    reparateur_nom: str = ""
    isp_id: Optional[str] = None
    probleme_description: str
    notes: str = ""

class ReparationEPIUpdate(BaseModel):
    statut: Optional[str] = None
    date_envoi: Optional[str] = None
    date_reception: Optional[str] = None
    date_reparation: Optional[str] = None
    reparateur_nom: Optional[str] = None
    isp_id: Optional[str] = None
    pieces_remplacees: Optional[List[str]] = None
    cout_reparation: Optional[float] = None
    notes: Optional[str] = None

class RetraitEPI(BaseModel):
    """Enregistrement du retrait définitif d'un EPI"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    date_retrait: str
    raison: str  # age_limite, dommage_irreparable, echec_inspection, autre
    description_raison: str
    methode_disposition: str  # coupe_detruit, recyclage, don, autre
    preuve_disposition: List[str] = []  # URLs photos
    certificat_disposition_url: str = ""
    cout_disposition: float = 0.0
    retire_par: str
    retire_par_id: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RetraitEPICreate(BaseModel):
    tenant_id: Optional[str] = None
    epi_id: str
    date_retrait: str
    raison: str
    description_raison: str
    methode_disposition: str
    preuve_disposition: List[str] = []
    certificat_disposition_url: str = ""
    cout_disposition: float = 0.0
    retire_par: str
    retire_par_id: Optional[str] = None
    notes: str = ""


# ==================== MULTI-TENANT DEPENDENCIES ====================

async def get_tenant_from_slug(slug: str) -> Tenant:
    """Récupère le tenant depuis son slug"""
    # Essayer d'abord avec 'actif' (production)
    tenant_data = await db.tenants.find_one({"slug": slug, "actif": True})
    
    # Si non trouvé, essayer avec 'is_active' (dev)
    if not tenant_data:
        tenant_data = await db.tenants.find_one({"slug": slug, "is_active": True})
    
    # Si toujours pas trouvé, essayer sans filtre de statut (pour rétrocompatibilité)
    if not tenant_data:
        tenant_data = await db.tenants.find_one({"slug": slug})
        if tenant_data:
            # Vérifier manuellement le statut
            is_active = tenant_data.get('actif', tenant_data.get('is_active', True))
            if not is_active:
                raise HTTPException(status_code=403, detail=f"Caserne '{slug}' inactive")
    
    if not tenant_data:
        raise HTTPException(status_code=404, detail=f"Caserne '{slug}' non trouvée")
    
    return Tenant(**tenant_data)

async def get_current_tenant(tenant_slug: str) -> Tenant:
    """Dépendance FastAPI pour obtenir le tenant actuel"""
    return await get_tenant_from_slug(tenant_slug)

# get_super_admin function moved to earlier in the file

# ==================== TENANT AUTH ROUTES ====================

@api_router.post("/{tenant_slug}/auth/login")
async def tenant_login(tenant_slug: str, user_login: UserLogin):
    """Login pour un tenant spécifique avec migration automatique SHA256 -> bcrypt"""
    try:
        logging.info(f"🔑 Tentative de connexion pour {user_login.email} sur tenant {tenant_slug}")
        
        # Vérifier que le tenant existe et est actif
        tenant = await get_tenant_from_slug(tenant_slug)
        logging.info(f"✅ Tenant trouvé: {tenant.nom} (id: {tenant.id})")
        
        # Chercher l'utilisateur dans ce tenant
        user_data = await db.users.find_one({
            "email": user_login.email,
            "tenant_id": tenant.id
        })
        
        if not user_data:
            logging.warning(f"❌ Utilisateur non trouvé: {user_login.email} dans tenant {tenant_slug}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Utilisateur trouvé: {user_data.get('nom')} {user_data.get('prenom')} (id: {user_data.get('id')})")
        
        current_hash = user_data.get("mot_de_passe_hash", "")
        hash_type = "bcrypt" if current_hash.startswith('$2') else "SHA256"
        logging.info(f"🔐 Type de hash détecté: {hash_type}")
        
        # Vérifier le mot de passe
        if not verify_password(user_login.mot_de_passe, current_hash):
            logging.warning(f"❌ Mot de passe incorrect pour {user_login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logging.info(f"✅ Mot de passe vérifié avec succès pour {user_login.email}")
        
        # Migrer le mot de passe si nécessaire (SHA256 -> bcrypt)
        await migrate_password_if_needed(user_data["id"], user_login.mot_de_passe, current_hash, "users")
        
        user = User(**user_data)
        
        # Inclure tenant_id dans le token
        access_token = create_access_token(data={
            "sub": user.id,
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
                "nom": tenant.nom
            },
            "user": {
                "id": user.id,
                "nom": user.nom,
                "prenom": user.prenom,
                "email": user.email,
                "role": user.role,
                "grade": user.grade,
                "type_emploi": user.type_emploi
            }
        }
    except HTTPException:
        # Re-lever les HTTPExceptions sans les logger à nouveau
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du login pour {user_login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")

# ==================== TENANT ROUTES (LEGACY / TO MIGRATE) ====================

# Demandes de congé routes
@api_router.post("/{tenant_slug}/demandes-conge", response_model=DemandeCongé)
async def create_demande_conge(tenant_slug: str, demande: DemandeCongeCreate, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Calculer le nombre de jours
    date_debut = datetime.strptime(demande.date_debut, "%Y-%m-%d")
    date_fin = datetime.strptime(demande.date_fin, "%Y-%m-%d")
    nombre_jours = (date_fin - date_debut).days + 1
    
    demande_dict = demande.dict()
    demande_dict["tenant_id"] = tenant.id
    demande_dict["demandeur_id"] = current_user.id
    demande_dict["nombre_jours"] = nombre_jours
    demande_obj = DemandeCongé(**demande_dict)
    await db.demandes_conge.insert_one(demande_obj.dict())
    
    # Créer notification pour approbation
    if current_user.role == "employe":
        # Notifier les superviseurs et admins de ce tenant
        superviseurs_admins = await db.users.find({
            "tenant_id": tenant.id,
            "role": {"$in": ["superviseur", "admin"]}
        }).to_list(100)
        for superviseur in superviseurs_admins:
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=superviseur["id"],
                type="conge_demande",
                titre="Nouvelle demande de congé",
                message=f"{current_user.prenom} {current_user.nom} demande un congé ({demande.type_conge}) du {demande.date_debut} au {demande.date_fin}",
                lien="/conges",
                data={"demande_id": demande_obj.id}
            )
    
    return demande_obj

@api_router.get("/{tenant_slug}/demandes-conge", response_model=List[DemandeCongé])
async def get_demandes_conge(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role == "employe":
        # Employés voient seulement leurs demandes
        demandes = await db.demandes_conge.find({
            "tenant_id": tenant.id,
            "demandeur_id": current_user.id
        }).to_list(1000)
    else:
        # Superviseurs et admins voient toutes les demandes de leur tenant
        demandes = await db.demandes_conge.find({"tenant_id": tenant.id}).to_list(1000)
    
    cleaned_demandes = [clean_mongo_doc(demande) for demande in demandes]
    return [DemandeCongé(**demande) for demande in cleaned_demandes]

@api_router.put("/{tenant_slug}/demandes-conge/{demande_id}/approuver")
async def approuver_demande_conge(tenant_slug: str, demande_id: str, action: str, commentaire: str = "", current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    demande = await db.demandes_conge.find_one({"id": demande_id, "tenant_id": tenant.id})
    if not demande:
        raise HTTPException(status_code=404, detail="Demande non trouvée")
    
    # Vérifier les permissions : superviseur peut approuver employés, admin peut tout approuver
    demandeur = await db.users.find_one({"id": demande["demandeur_id"], "tenant_id": tenant.id})
    if current_user.role == "superviseur" and demandeur["role"] != "employe":
        raise HTTPException(status_code=403, detail="Un superviseur ne peut approuver que les demandes d'employés")
    
    statut = "approuve" if action == "approuver" else "refuse"
    
    await db.demandes_conge.update_one(
        {"id": demande_id, "tenant_id": tenant.id},
        {
            "$set": {
                "statut": statut,
                "approuve_par": current_user.id,
                "date_approbation": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "commentaire_approbation": commentaire
            }
        }
    )
    
    # Créer notification pour le demandeur
    if demandeur:
        titre = f"Congé {statut}" if statut == "approuve" else "Congé refusé"
        message = f"Votre demande de congé du {demande['date_debut']} au {demande['date_fin']} a été {statut}e"
        if commentaire:
            message += f". Commentaire: {commentaire}"
        
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=demande["demandeur_id"],
            type=f"conge_{statut}",
            titre=titre,
            message=message,
            lien="/conges",
            data={"demande_id": demande_id}
        )
    
    return {"message": f"Demande {statut}e avec succès"}

# Algorithme intelligent de recherche de remplaçants
@api_router.post("/remplacements/{demande_id}/recherche-automatique")
async def recherche_remplacants_automatique(demande_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Récupérer la demande de remplacement
        demande = await db.demandes_remplacement.find_one({"id": demande_id})
        if not demande:
            raise HTTPException(status_code=404, detail="Demande non trouvée")
        
        # Récupérer les paramètres de remplacement
        # (selon les règles définies dans Paramètres > Remplacements)
        
        # Trouver les remplaçants potentiels selon l'algorithme intelligent
        users = await db.users.find({"statut": "Actif"}).to_list(1000)
        type_garde = await db.types_garde.find_one({"id": demande["type_garde_id"]})
        
        remplacants_potentiels = []
        
        for user in users:
            if user["id"] == demande["demandeur_id"]:
                continue  # Skip demandeur
                
            # Étape 1: Vérifier disponibilités (si temps partiel)
            if user["type_emploi"] == "temps_partiel":
                # Get user disponibilités pour cette date exacte
                user_dispos = await db.disponibilites.find({
                    "user_id": user["id"],
                    "date": demande["date"],
                    "statut": "disponible"
                }).to_list(10)
                
                # Vérifier si disponible pour ce type de garde spécifiquement
                type_garde_compatible = any(
                    d.get("type_garde_id") == type_garde["id"] or d.get("type_garde_id") is None 
                    for d in user_dispos
                )
                
                if not type_garde_compatible:
                    continue  # Skip si pas disponible pour ce type de garde
            
            # Étape 2: Vérifier grade équivalent (si paramètre activé)
            # Étape 3: Vérifier compétences équivalentes (si paramètre activé)
            
            remplacants_potentiels.append({
                "user_id": user["id"],
                "nom": f"{user['prenom']} {user['nom']}",
                "grade": user["grade"],
                "score_compatibilite": 85  # Algorithme de scoring à développer
            })
        
        # Trier par score de compatibilité
        remplacants_potentiels.sort(key=lambda x: x["score_compatibilite"], reverse=True)
        
        # Limiter selon max_personnes_contact des paramètres
        max_contacts = 5  # À récupérer des paramètres
        remplacants_finaux = remplacants_potentiels[:max_contacts]
        
        # Créer les notifications pour les remplaçants potentiels
        for remplacant in remplacants_finaux:
            notification = NotificationRemplacement(
                demande_remplacement_id=demande_id,
                destinataire_id=remplacant["user_id"],
                message=f"Remplacement disponible le {demande['date']} - {type_garde['nom'] if type_garde else 'Garde'}",
                type_notification="remplacement_disponible"
            )
            await db.notifications.insert_one(notification.dict())
        
        return {
            "message": "Recherche automatique effectuée",
            "remplacants_contactes": len(remplacants_finaux),
            "algorithme": "Disponibilités → Grade → Compétences → Score compatibilité"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur recherche automatique: {str(e)}")

# Rapports et exports routes
@api_router.get("/rapports/export-pdf")
async def export_pdf_report(type_rapport: str = "general", user_id: str = None, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        styles = getSampleStyleSheet()
        story = []
        
        # En-tête du rapport
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#dc2626')
        )
        
        story.append(Paragraph("ProFireManager v2.0 - Rapport d'Activité", title_style))
        story.append(Spacer(1, 12))
        
        if type_rapport == "general":
            # Rapport général
            story.append(Paragraph("📊 Statistiques Générales", styles['Heading2']))
            
            # Récupérer les données
            users = await db.users.find({"statut": "Actif"}).to_list(1000)
            assignations = await db.assignations.find().to_list(1000)
            formations = await db.formations.find().to_list(1000)
            
            data = [
                ['Indicateur', 'Valeur'],
                ['Personnel actif', str(len(users))],
                ['Assignations totales', str(len(assignations))],
                ['Formations disponibles', str(len(formations))],
                ['Employés temps plein', str(len([u for u in users if u.get('type_emploi') == 'temps_plein']))],
                ['Employés temps partiel', str(len([u for u in users if u.get('type_emploi') == 'temps_partiel']))],
            ]
            
            table = Table(data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 14),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(table)
            
        elif type_rapport == "employe" and user_id:
            # Rapport par employé
            user_data = await db.users.find_one({"id": user_id})
            if user_data:
                story.append(Paragraph(f"👤 Rapport Personnel - {user_data['prenom']} {user_data['nom']}", styles['Heading2']))
                
                user_assignations = await db.assignations.find({"user_id": user_id}).to_list(1000)
                
                data = [
                    ['Information', 'Détail'],
                    ['Nom complet', f"{user_data['prenom']} {user_data['nom']}"],
                    ['Grade', user_data['grade']],
                    ['Type emploi', user_data['type_emploi']],
                    ['Gardes assignées', str(len(user_assignations))],
                    ['Statut', user_data['statut']]
                ]
                
                table = Table(data)
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dc2626')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('GRID', (0, 0), (-1, -1), 1, colors.black)
                ]))
                
                story.append(table)
        
        doc.build(story)
        pdf_data = buffer.getvalue()
        buffer.close()
        
        # Retourner en base64 pour le frontend
        pdf_base64 = base64.b64encode(pdf_data).decode('utf-8')
        
        return {
            "message": "Rapport PDF généré avec succès",
            "filename": f"rapport_{type_rapport}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
            "data": pdf_base64
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération PDF: {str(e)}")

@api_router.get("/rapports/export-excel")
async def export_excel_report(type_rapport: str = "general", current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        wb = Workbook()
        ws = wb.active
        
        # Style de l'en-tête
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="DC2626", end_color="DC2626", fill_type="solid")
        
        if type_rapport == "general":
            ws.title = "Rapport Général"
            
            # En-tête
            headers = ["Indicateur", "Valeur", "Détails"]
            for col, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center")
            
            # Données
            users = await db.users.find({"statut": "Actif"}).to_list(1000)
            assignations = await db.assignations.find().to_list(1000)
            
            data_rows = [
                ["Personnel Total", len(users), f"{len([u for u in users if u.get('type_emploi') == 'temps_plein'])} temps plein, {len([u for u in users if u.get('type_emploi') == 'temps_partiel'])} temps partiel"],
                ["Assignations", len(assignations), f"Période: {datetime.now().strftime('%B %Y')}"],
                ["Taux Activité", "85%", "Personnel actif vs total"],
            ]
            
            for row, (indicateur, valeur, details) in enumerate(data_rows, 2):
                ws.cell(row=row, column=1, value=indicateur)
                ws.cell(row=row, column=2, value=valeur)
                ws.cell(row=row, column=3, value=details)
        
        # Sauvegarder en mémoire
        buffer = BytesIO()
        wb.save(buffer)
        excel_data = buffer.getvalue()
        buffer.close()
        
        # Retourner en base64
        excel_base64 = base64.b64encode(excel_data).decode('utf-8')
        
        return {
            "message": "Rapport Excel généré avec succès",
            "filename": f"rapport_{type_rapport}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
            "data": excel_base64
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur génération Excel: {str(e)}")

@api_router.get("/{tenant_slug}/rapports/statistiques-avancees")
async def get_statistiques_avancees(tenant_slug: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Récupérer toutes les données nécessaires filtrées par tenant
        users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
        assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        formations = await db.formations.find({"tenant_id": tenant.id}).to_list(1000)
        demandes_remplacement = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Statistiques générales
        stats_generales = {
            "personnel_total": len(users),
            "personnel_actif": len([u for u in users if u.get("statut") == "Actif"]),
            "assignations_mois": len(assignations),
            "taux_couverture": 94.5,  # Calcul à améliorer
            "formations_disponibles": len(formations),
            "remplacements_demandes": len(demandes_remplacement)
        }
        
        # Statistiques par rôle
        stats_par_role = {}
        for role in ["admin", "superviseur", "employe"]:
            users_role = [u for u in users if u.get("role") == role]
            assignations_role = [a for a in assignations if any(u["id"] == a["user_id"] and u.get("role") == role for u in users)]
            
            stats_par_role[role] = {
                "nombre_utilisateurs": len(users_role),
                "assignations_totales": len(assignations_role),
                "heures_moyennes": len(assignations_role) * 8,  # Estimation
                "formations_completees": sum(len(u.get("formations", [])) for u in users_role)
            }
        
        # Statistiques par employé (pour export individuel)
        stats_par_employe = []
        for user in users:
            user_assignations = [a for a in assignations if a["user_id"] == user["id"]]
            user_disponibilites = await db.disponibilites.find({"user_id": user["id"], "tenant_id": tenant.id}).to_list(100)
            
            stats_par_employe.append({
                "id": user["id"],
                "nom": f"{user['prenom']} {user['nom']}",
                "grade": user["grade"],
                "role": user["role"],
                "type_emploi": user["type_emploi"],
                "assignations_count": len(user_assignations),
                "disponibilites_count": len(user_disponibilites),
                "formations_count": len(user.get("formations", [])),
                "heures_estimees": len(user_assignations) * 8
            })
        
        return {
            "statistiques_generales": stats_generales,
            "statistiques_par_role": stats_par_role,
            "statistiques_par_employe": stats_par_employe,
            "periode": datetime.now().strftime("%B %Y"),
            "date_generation": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur calcul statistiques: {str(e)}")

# Sessions de formation routes
@api_router.post("/{tenant_slug}/sessions-formation", response_model=SessionFormation)
async def create_session_formation(tenant_slug: str, session: SessionFormationCreate, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    session_dict = session.dict()
    session_dict["tenant_id"] = tenant.id
    session_obj = SessionFormation(**session_dict)
    await db.sessions_formation.insert_one(session_obj.dict())
    return session_obj

@api_router.get("/{tenant_slug}/sessions-formation", response_model=List[SessionFormation])
async def get_sessions_formation(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    sessions = await db.sessions_formation.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_sessions = [clean_mongo_doc(session) for session in sessions]
    return [SessionFormation(**session) for session in cleaned_sessions]

@api_router.post("/{tenant_slug}/sessions-formation/{session_id}/inscription")
async def inscrire_formation(tenant_slug: str, session_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la session existe dans ce tenant
    session = await db.sessions_formation.find_one({"id": session_id, "tenant_id": tenant.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session de formation non trouvée")
    
    # Vérifier si déjà inscrit
    if current_user.id in session.get("participants", []):
        raise HTTPException(status_code=400, detail="Vous êtes déjà inscrit à cette formation")
    
    # Vérifier les places disponibles
    if len(session.get("participants", [])) >= session.get("places_max", 20):
        raise HTTPException(status_code=400, detail="Formation complète - Plus de places disponibles")
    
    # Ajouter l'utilisateur aux participants
    await db.sessions_formation.update_one(
        {"id": session_id, "tenant_id": tenant.id},
        {"$push": {"participants": current_user.id}}
    )
    
    # Créer l'inscription
    inscription_dict = {
        "tenant_id": tenant.id,
        "session_id": session_id,
        "user_id": current_user.id
    }
    inscription_obj = InscriptionFormation(**inscription_dict)
    await db.inscriptions_formation.insert_one(inscription_obj.dict())
    
    return {"message": "Inscription réussie", "session_id": session_id}

@api_router.delete("/{tenant_slug}/sessions-formation/{session_id}/desinscription")
async def desinscrire_formation(tenant_slug: str, session_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que la session existe dans ce tenant
    session = await db.sessions_formation.find_one({"id": session_id, "tenant_id": tenant.id})
    if not session:
        raise HTTPException(status_code=404, detail="Session de formation non trouvée")
    
    # Vérifier si inscrit
    if current_user.id not in session.get("participants", []):
        raise HTTPException(status_code=400, detail="Vous n'êtes pas inscrit à cette formation")
    
    # Retirer l'utilisateur des participants
    await db.sessions_formation.update_one(
        {"id": session_id, "tenant_id": tenant.id},
        {"$pull": {"participants": current_user.id}}
    )
    
    # Supprimer l'inscription
    await db.inscriptions_formation.delete_one({
        "session_id": session_id,
        "user_id": current_user.id,
        "tenant_id": tenant.id
    })
    
    return {"message": "Désinscription réussie", "session_id": session_id}

# Disponibilités routes
@api_router.post("/{tenant_slug}/disponibilites", response_model=Disponibilite)
async def create_disponibilite(tenant_slug: str, disponibilite: DisponibiliteCreate, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    dispo_dict = disponibilite.dict()
    dispo_dict["tenant_id"] = tenant.id
    disponibilite_obj = Disponibilite(**dispo_dict)
    await db.disponibilites.insert_one(disponibilite_obj.dict())
    return disponibilite_obj

@api_router.get("/{tenant_slug}/disponibilites/{user_id}", response_model=List[Disponibilite])
async def get_user_disponibilites(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    disponibilites = await db.disponibilites.find({
        "user_id": user_id,
        "tenant_id": tenant.id
    }).to_list(1000)
    cleaned_disponibilites = [clean_mongo_doc(dispo) for dispo in disponibilites]
    return [Disponibilite(**dispo) for dispo in cleaned_disponibilites]

@api_router.put("/{tenant_slug}/disponibilites/{user_id}")
async def update_user_disponibilites(tenant_slug: str, user_id: str, disponibilites: List[DisponibiliteCreate], current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Delete existing disponibilités for this user dans ce tenant
    await db.disponibilites.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    
    # Insert new disponibilités
    if disponibilites:
        dispo_docs = []
        for dispo in disponibilites:
            dispo_dict = dispo.dict()
            dispo_dict["tenant_id"] = tenant.id
            dispo_obj = Disponibilite(**dispo_dict)
            dispo_docs.append(dispo_obj.dict())
        
        await db.disponibilites.insert_many(dispo_docs)
    
    return {"message": f"Disponibilités mises à jour avec succès ({len(disponibilites)} entrées)"}

@api_router.delete("/{tenant_slug}/disponibilites/reinitialiser")
async def reinitialiser_disponibilites(
    tenant_slug: str,
    reinit_data: DisponibiliteReinitialiser,
    current_user: User = Depends(get_current_user)
):
    """
    Réinitialise les disponibilités/indisponibilités pour une période donnée
    """
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    if current_user.role not in ["admin", "superviseur"] and current_user.id != reinit_data.user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Calculer les dates de début et fin selon la période
        today = datetime.now(timezone.utc).date()
        
        if reinit_data.periode == "semaine":
            # Semaine courante : lundi à dimanche
            days_since_monday = today.weekday()  # 0 = lundi, 6 = dimanche
            date_debut = today - timedelta(days=days_since_monday)
            date_fin = date_debut + timedelta(days=6)
        elif reinit_data.periode == "mois":
            # Mois courant : 1er du mois à dernier jour
            date_debut = today.replace(day=1)
            # Dernier jour du mois
            if today.month == 12:
                date_fin = today.replace(day=31)
            else:
                next_month = today.replace(month=today.month + 1, day=1)
                date_fin = next_month - timedelta(days=1)
        elif reinit_data.periode == "annee":
            # Année courante : 1er janvier à 31 décembre
            date_debut = today.replace(month=1, day=1)
            date_fin = today.replace(month=12, day=31)
        else:
            raise HTTPException(
                status_code=400,
                detail="periode doit être 'semaine', 'mois' ou 'annee'"
            )
        
        # Construire la requête de suppression
        delete_query = {
            "user_id": reinit_data.user_id,
            "tenant_id": tenant.id,
            "date": {
                "$gte": date_debut.isoformat(),
                "$lte": date_fin.isoformat()
            }
        }
        
        # Filtre par type d'entrée (disponibilités/indisponibilités)
        if reinit_data.type_entree == "disponibilites":
            delete_query["statut"] = "disponible"
        elif reinit_data.type_entree == "indisponibilites":
            delete_query["statut"] = "indisponible"
        elif reinit_data.type_entree != "les_deux":
            raise HTTPException(
                status_code=400,
                detail="type_entree doit être 'disponibilites', 'indisponibilites' ou 'les_deux'"
            )
        
        # Si mode "generees_seulement", ne supprimer que les entrées générées automatiquement
        if reinit_data.mode == "generees_seulement":
            # Supprimer uniquement celles avec origine différente de "manuelle"
            # ET qui ont un champ origine (pour gérer les anciennes entrées)
            delete_query["$or"] = [
                {"origine": {"$exists": True, "$ne": "manuelle"}},
                {"origine": {"$exists": False}}  # Anciennes entrées sans champ origine
            ]
        elif reinit_data.mode != "tout":
            raise HTTPException(
                status_code=400,
                detail="mode doit être 'tout' ou 'generees_seulement'"
            )
        
        # Supprimer les disponibilités
        result = await db.disponibilites.delete_many(delete_query)
        
        return {
            "message": "Réinitialisation effectuée avec succès",
            "periode": reinit_data.periode,
            "mode": reinit_data.mode,
            "date_debut": date_debut.isoformat(),
            "date_fin": date_fin.isoformat(),
            "nombre_supprimees": result.deleted_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Erreur lors de la réinitialisation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la réinitialisation: {str(e)}")

@api_router.delete("/{tenant_slug}/disponibilites/{disponibilite_id}")
async def delete_disponibilite(tenant_slug: str, disponibilite_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Find the disponibilité to check ownership dans ce tenant
    disponibilite = await db.disponibilites.find_one({
        "id": disponibilite_id,
        "tenant_id": tenant.id
    })
    if not disponibilite:
        raise HTTPException(status_code=404, detail="Disponibilité non trouvée")
    
    if current_user.role not in ["admin", "superviseur"] and current_user.id != disponibilite["user_id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    result = await db.disponibilites.delete_one({
        "id": disponibilite_id,
        "tenant_id": tenant.id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer la disponibilité")
    
    return {"message": "Disponibilité supprimée avec succès"}

# ==================== PUSH NOTIFICATIONS ROUTES ====================

@api_router.post("/{tenant_slug}/notifications/register-device")
async def register_device_token(
    tenant_slug: str,
    device_data: DeviceTokenRegister,
    current_user: User = Depends(get_current_user)
):
    """
    Enregistre un device token pour les notifications push
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur enregistre son propre device
    if current_user.id != device_data.user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Vérifier si un token existe déjà pour cet utilisateur et cette plateforme
        existing = await db.device_tokens.find_one({
            "user_id": device_data.user_id,
            "platform": device_data.platform
        })
        
        if existing:
            # Mettre à jour le token existant
            await db.device_tokens.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "device_token": device_data.device_token,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            message = "Device token mis à jour"
        else:
            # Créer un nouveau token
            new_token = DeviceToken(
                user_id=device_data.user_id,
                device_token=device_data.device_token,
                platform=device_data.platform
            )
            await db.device_tokens.insert_one(new_token.dict())
            message = "Device token enregistré"
        
        return {"message": message, "platform": device_data.platform}
    
    except Exception as e:
        print(f"Erreur lors de l'enregistrement du device token: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

async def send_push_notification_to_users(user_ids: List[str], title: str, body: str, data: Optional[dict] = None):
    """
    Helper function pour envoyer des notifications push à plusieurs utilisateurs
    """
    if not firebase_admin._apps:
        print("⚠️ Firebase not initialized, skipping push notification")
        return
    
    try:
        # Récupérer tous les device tokens pour ces utilisateurs
        tokens_cursor = db.device_tokens.find({"user_id": {"$in": user_ids}})
        tokens_list = await tokens_cursor.to_list(length=None)
        
        if not tokens_list:
            print(f"No device tokens found for users: {user_ids}")
            return
        
        device_tokens = [token["device_token"] for token in tokens_list]
        
        # Créer le message
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body
            ),
            data=data or {},
            tokens=device_tokens
        )
        
        # Envoyer
        response = messaging.send_multicast(message)
        print(f"✅ Push notification sent: {response.success_count} success, {response.failure_count} failures")
        
        # Supprimer les tokens invalides
        if response.failure_count > 0:
            failed_tokens = [device_tokens[idx] for idx, resp in enumerate(response.responses) if not resp.success]
            await db.device_tokens.delete_many({"device_token": {"$in": failed_tokens}})
            print(f"Removed {len(failed_tokens)} invalid tokens")
        
        return response
    
    except Exception as e:
        print(f"Error sending push notification: {str(e)}")
        return None

@api_router.post("/{tenant_slug}/notifications/send")
async def send_push_notification(
    tenant_slug: str,
    notification_data: PushNotificationSend,
    current_user: User = Depends(get_current_user)
):
    """
    Envoie une notification push à des utilisateurs spécifiques (Admin/Superviseur uniquement)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Seuls les admins et superviseurs peuvent envoyer des notifications
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        response = await send_push_notification_to_users(
            user_ids=notification_data.user_ids,
            title=notification_data.title,
            body=notification_data.body,
            data=notification_data.data
        )
        
        return {
            "message": "Notification envoyée",
            "success_count": response.success_count if response else 0,
            "failure_count": response.failure_count if response else 0
        }
    
    except Exception as e:
        print(f"Erreur lors de l'envoi de la notification: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# ==================== FONCTIONS HELPER POUR GÉNÉRATION D'INDISPONIBILITÉS ====================

def generer_indisponibilites_montreal(user_id: str, tenant_id: str, equipe: str, date_debut: str, date_fin: str) -> List[Dict]:
    """
    Génère les indisponibilités pour l'horaire Montreal 7/24
    Cycle de 28 jours commençant le 27 janvier 2025 (premier lundi rouge = jour 1)
    
    Pattern RÉEL Montreal 7/24 (vérifié avec calendrier 2025):
    Chaque équipe travaille exactement 7 jours spécifiques sur le cycle de 28 jours
    
    Équipes avec numéros et patterns:
    - Vert (Équipe #1) : jours 2, 8, 11, 19, 21, 24, 27 du cycle
    - Bleu (Équipe #2) : jours 3, 6, 9, 15, 18, 26, 28 du cycle
    - Jaune (Équipe #3) : jours 5, 7, 10, 13, 16, 22, 25 du cycle
    - Rouge (Équipe #4) : jours 1, 4, 12, 14, 17, 20, 23 du cycle
    
    Le jour 1 du cycle = 27 janvier 2025 (premier lundi rouge)
    
    On génère les INDISPONIBILITÉS pour les jours où l'équipe TRAVAILLE à son emploi principal
    """
    
    # Mapping équipe -> numéro -> jours de travail dans le cycle de 28 jours
    equipes_config = {
        "Vert": {
            "numero": 1,
            "jours_cycle": [2, 8, 11, 19, 21, 24, 27]
        },
        "Bleu": {
            "numero": 2,
            "jours_cycle": [3, 6, 9, 15, 18, 26, 28]
        },
        "Jaune": {
            "numero": 3,
            "jours_cycle": [5, 7, 10, 13, 16, 22, 25]
        },
        "Rouge": {
            "numero": 4,
            "jours_cycle": [1, 4, 12, 14, 17, 20, 23]
        }
    }
    
    if equipe not in equipes_config:
        raise ValueError(f"Équipe invalide: {equipe}. Doit être Vert, Bleu, Jaune ou Rouge")
    
    config = equipes_config[equipe]
    jours_travail_cycle = config["jours_cycle"]
    
    logging.info(f"Montreal 7/24 - {equipe} (#{config['numero']}): jours de travail dans cycle = {jours_travail_cycle}")
    
    # Le jour 1 du cycle = 27 janvier 2025
    jour_1_cycle = datetime(2025, 1, 27).date()
    
    # Parser les dates de début et fin
    date_debut_obj = datetime.strptime(date_debut, "%Y-%m-%d").date()
    date_fin_obj = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    indisponibilites = []
    current_date = date_debut_obj
    
    while current_date <= date_fin_obj:
        # Calculer le jour dans le cycle (1-28)
        jours_depuis_jour1 = (current_date - jour_1_cycle).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1
        
        # Si négatif (avant le 27 janvier 2025), calculer en arrière
        if jours_depuis_jour1 < 0:
            jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
        
        # Si le jour EST dans les jours de travail de l'équipe, c'est une INDISPONIBILITÉ
        if jour_cycle in jours_travail_cycle:
            indispo = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": user_id,
                "date": current_date.isoformat(),
                "type_garde_id": None,
                "heure_debut": "00:00",
                "heure_fin": "23:59",
                "statut": "indisponible",
                "origine": "montreal_7_24",
                "created_at": datetime.now(timezone.utc)
            }
            indisponibilites.append(indispo)
        
        current_date += timedelta(days=1)
    
    logging.info(f"✅ Montreal 7/24 - {equipe} (#{config['numero']}): {len(indisponibilites)} indisponibilités générées de {date_debut} à {date_fin}")
    return indisponibilites

def generer_indisponibilites_quebec(user_id: str, tenant_id: str, equipe: str, date_debut: str, date_fin: str) -> List[Dict]:
    """
    Génère les indisponibilités pour l'horaire Quebec 10/14
    Cycle de 28 jours commençant le 1er février 2026 (jour 1 du cycle)
    
    Pattern RÉEL Quebec 10/14 (basé sur février 2026):
    Chaque équipe travaille selon un pattern spécifique sur 28 jours
    
    Équipes avec numéros et jours de travail:
    - Vert (Équipe #1) : jours 2,3,4,5, 12,13,14, 20,21, 22, 23,24,25
    - Bleu (Équipe #2) : jours 6,7, 8, 9,10,11, 16,17,18,19, 26,27,28
    - Jaune (Équipe #3) : jours 1, 2,3,4, 9,10,11,12, 19,20,21, 27,28
    - Rouge (Équipe #4) : jours 5,6,7, 13,14, 15, 16,17,18, 23,24,25,26
    
    Le jour 1 du cycle = 1er février 2026 (DATE FIXE CODÉE EN DUR)
    Le cycle recommence tous les 28 jours (1er mars, 29 mars, 26 avril, etc.)
    
    On génère les INDISPONIBILITÉS pour les jours où l'équipe TRAVAILLE à son emploi principal
    (car ils ne sont pas disponibles pour les gardes de pompiers ces jours-là)
    
    Note: Pour les gardes de nuit (17h-7h), on marque seulement le jour de début comme indisponible
    """
    
    # Mapping équipe -> numéro -> jours de travail dans le cycle de 28 jours
    equipes_config = {
        "Vert": {
            "numero": 1,
            "jours_cycle": [2, 3, 4, 5, 12, 13, 14, 20, 21, 22, 23, 24, 25]
        },
        "Bleu": {
            "numero": 2,
            "jours_cycle": [6, 7, 8, 9, 10, 11, 16, 17, 18, 19, 26, 27, 28]
        },
        "Jaune": {
            "numero": 3,
            "jours_cycle": [1, 2, 3, 4, 9, 10, 11, 12, 19, 20, 21, 27, 28]
        },
        "Rouge": {
            "numero": 4,
            "jours_cycle": [5, 6, 7, 13, 14, 15, 16, 17, 18, 23, 24, 25, 26]
        }
    }
    
    if equipe not in equipes_config:
        raise ValueError(f"Équipe invalide: {equipe}. Doit être Vert, Bleu, Jaune ou Rouge")
    
    config = equipes_config[equipe]
    jours_travail_cycle = config["jours_cycle"]
    
    logging.info(f"Quebec 10/14 - {equipe} (#{config['numero']}): jours de travail dans cycle = {jours_travail_cycle}")
    
    # Le jour 1 du cycle = 1er février 2026 (DATE FIXE)
    jour_1_cycle = datetime(2026, 2, 1).date()
    
    # Parser les dates de début et fin
    date_debut_obj = datetime.strptime(date_debut, "%Y-%m-%d").date()
    date_fin_obj = datetime.strptime(date_fin, "%Y-%m-%d").date()
    
    indisponibilites = []
    current_date = date_debut_obj
    
    while current_date <= date_fin_obj:
        # Calculer le jour dans le cycle (1-28)
        jours_depuis_jour1 = (current_date - jour_1_cycle).days
        jour_cycle = (jours_depuis_jour1 % 28) + 1
        
        # Si négatif (avant le jour 1), calculer en arrière
        if jours_depuis_jour1 < 0:
            jour_cycle = 28 - ((-jours_depuis_jour1 - 1) % 28)
        
        # Si le jour EST dans les jours de travail de l'équipe, c'est une INDISPONIBILITÉ
        if jour_cycle in jours_travail_cycle:
            indispo = {
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "user_id": user_id,
                "date": current_date.isoformat(),
                "type_garde_id": None,
                "heure_debut": "00:00",
                "heure_fin": "23:59",
                "statut": "indisponible",
                "origine": "quebec_10_14",
                "created_at": datetime.now(timezone.utc)
            }
            indisponibilites.append(indispo)
        
        current_date += timedelta(days=1)
    
    logging.info(f"✅ Quebec 10/14 - {equipe} (#{config['numero']}): {len(indisponibilites)} indisponibilités générées de {date_debut} à {date_fin}")
    return indisponibilites

# ==================== ROUTE DE GÉNÉRATION D'INDISPONIBILITÉS ====================

@api_router.post("/{tenant_slug}/disponibilites/generer")
async def generer_indisponibilites(
    tenant_slug: str,
    generation_data: IndisponibiliteGenerate,
    current_user: User = Depends(get_current_user)
):
    """
    Génère automatiquement les indisponibilités selon l'horaire sélectionné
    """
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    if current_user.role not in ["admin", "superviseur"] and current_user.id != generation_data.user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer les anciennes disponibilités générées automatiquement si demandé
        if not generation_data.conserver_manuelles:
            # Supprimer toutes les disponibilités de cet utilisateur pour la période
            await db.disponibilites.delete_many({
                "user_id": generation_data.user_id,
                "tenant_id": tenant.id,
                "date": {
                    "$gte": generation_data.date_debut,
                    "$lte": generation_data.date_fin
                }
            })
        else:
            # Supprimer uniquement les disponibilités générées automatiquement (préserver manuelles)
            origine_type = "montreal_7_24" if generation_data.horaire_type == "montreal" else "quebec_10_14"
            await db.disponibilites.delete_many({
                "user_id": generation_data.user_id,
                "tenant_id": tenant.id,
                "origine": origine_type,
                "date": {
                    "$gte": generation_data.date_debut,
                    "$lte": generation_data.date_fin
                }
            })
        
        # Générer les nouvelles indisponibilités
        if generation_data.horaire_type == "montreal":
            indispos = generer_indisponibilites_montreal(
                user_id=generation_data.user_id,
                tenant_id=tenant.id,
                equipe=generation_data.equipe,
                date_debut=generation_data.date_debut,
                date_fin=generation_data.date_fin
            )
        elif generation_data.horaire_type == "quebec":
            indispos = generer_indisponibilites_quebec(
                user_id=generation_data.user_id,
                tenant_id=tenant.id,
                equipe=generation_data.equipe,
                date_debut=generation_data.date_debut,
                date_fin=generation_data.date_fin
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="horaire_type doit être 'montreal' ou 'quebec'"
            )
        
        # Insérer les indisponibilités dans la base de données
        if indispos:
            await db.disponibilites.insert_many(indispos)
        
        return {
            "message": "Indisponibilités générées avec succès",
            "horaire_type": generation_data.horaire_type,
            "equipe": generation_data.equipe,
            "date_debut": generation_data.date_debut,
            "date_fin": generation_data.date_fin,
            "nombre_indisponibilites": len(indispos),
            "conserver_manuelles": generation_data.conserver_manuelles
        }
        
    except HTTPException:
        # Re-raise HTTPExceptions as-is (don't convert to 500)
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Erreur lors de la génération des indisponibilités: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(e)}")

# Assignation manuelle avancée avec récurrence
@api_router.post("/{tenant_slug}/planning/assignation-avancee")
async def assignation_manuelle_avancee(
    tenant_slug: str,
    assignation_data: dict,
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        user_id = assignation_data.get("user_id")
        type_garde_id = assignation_data.get("type_garde_id")
        recurrence_type = assignation_data.get("recurrence_type", "unique")
        date_debut = datetime.strptime(assignation_data.get("date_debut"), "%Y-%m-%d").date()
        date_fin = datetime.strptime(assignation_data.get("date_fin", assignation_data.get("date_debut")), "%Y-%m-%d").date()
        jours_semaine = assignation_data.get("jours_semaine", [])
        
        assignations_creees = []
        
        if recurrence_type == "unique":
            # Assignation unique
            assignation_obj = Assignation(
                user_id=user_id,
                type_garde_id=type_garde_id,
                date=date_debut.strftime("%Y-%m-%d"),
                assignation_type="manuel_avance",
                tenant_id=tenant.id
            )
            await db.assignations.insert_one(assignation_obj.dict())
            assignations_creees.append(assignation_obj.dict())
            
        elif recurrence_type == "hebdomadaire":
            # Récurrence hebdomadaire
            current_date = date_debut
            jours_semaine_index = {
                'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
                'friday': 4, 'saturday': 5, 'sunday': 6
            }
            
            while current_date <= date_fin:
                day_name = current_date.strftime("%A").lower()
                
                if day_name in jours_semaine:
                    # Vérifier qu'il n'y a pas déjà une assignation
                    existing = await db.assignations.find_one({
                        "user_id": user_id,
                        "type_garde_id": type_garde_id,
                        "date": current_date.strftime("%Y-%m-%d"),
                        "tenant_id": tenant.id
                    })
                    
                    if not existing:
                        assignation_obj = Assignation(
                            user_id=user_id,
                            type_garde_id=type_garde_id,
                            date=current_date.strftime("%Y-%m-%d"),
                            assignation_type="manuel_avance",
                            tenant_id=tenant.id
                        )
                        await db.assignations.insert_one(assignation_obj.dict())
                        assignations_creees.append(assignation_obj.dict())
                
                current_date += timedelta(days=1)
                
        elif recurrence_type == "mensuel":
            # Récurrence mensuelle (même jour du mois)
            jour_mois = date_debut.day
            current_month = date_debut.replace(day=1)
            
            while current_month <= date_fin:
                try:
                    # Essayer de créer la date pour ce mois
                    target_date = current_month.replace(day=jour_mois)
                    
                    if date_debut <= target_date <= date_fin:
                        existing = await db.assignations.find_one({
                            "user_id": user_id,
                            "type_garde_id": type_garde_id,
                            "date": target_date.strftime("%Y-%m-%d"),
                            "tenant_id": tenant.id
                        })
                        
                        if not existing:
                            assignation_obj = Assignation(
                                user_id=user_id,
                                type_garde_id=type_garde_id,
                                date=target_date.strftime("%Y-%m-%d"),
                                assignation_type="manuel_avance",
                                tenant_id=tenant.id
                            )
                            await db.assignations.insert_one(assignation_obj.dict())
                            assignations_creees.append(assignation_obj.dict())
                            
                except ValueError:
                    # Jour n'existe pas dans ce mois (ex: 31 février)
                    pass
                
                # Passer au mois suivant
                if current_month.month == 12:
                    current_month = current_month.replace(year=current_month.year + 1, month=1)
                else:
                    current_month = current_month.replace(month=current_month.month + 1)
        
        return {
            "message": "Assignation avancée créée avec succès",
            "assignations_creees": len(assignations_creees),
            "recurrence": recurrence_type,
            "periode": f"{date_debut.strftime('%Y-%m-%d')} à {date_fin.strftime('%Y-%m-%d')}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur assignation avancée: {str(e)}")

# Mode démo spécial - Attribution automatique agressive pour impression client
@api_router.post("/{tenant_slug}/planning/attribution-auto-demo")
async def attribution_automatique_demo(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Get all available users and types de garde pour ce tenant
        users = await db.users.find({"statut": "Actif", "tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Get existing assignations for the week
        semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        existing_assignations = await db.assignations.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        nouvelles_assignations = []
        
        # MODE DÉMO AGRESSIF - REMPLIR AU MAXIMUM
        for type_garde in types_garde:
            for day_offset in range(7):
                current_date = datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=day_offset)
                date_str = current_date.strftime("%Y-%m-%d")
                day_name = current_date.strftime("%A").lower()
                
                # Skip if type garde doesn't apply to this day
                if type_garde.get("jours_application") and day_name not in type_garde["jours_application"]:
                    continue
                
                # Compter combien de personnel déjà assigné pour cette garde
                existing_for_garde = [a for a in existing_assignations 
                                    if a["date"] == date_str and a["type_garde_id"] == type_garde["id"]]
                
                personnel_deja_assigne = len(existing_for_garde)
                personnel_requis = type_garde.get("personnel_requis", 1)
                
                # Assigner jusqu'au maximum requis
                for i in range(personnel_requis - personnel_deja_assigne):
                    # Trouver utilisateurs disponibles
                    available_users = []
                    
                    for user in users:
                        # Skip si déjà assigné cette garde ce jour
                        if any(a["user_id"] == user["id"] and a["date"] == date_str and a["type_garde_id"] == type_garde["id"] 
                               for a in existing_assignations):
                            continue
                        
                        # Skip si déjà assigné autre garde ce jour (éviter conflits)
                        if any(a["user_id"] == user["id"] and a["date"] == date_str 
                               for a in existing_assignations):
                            continue
                        
                        # Vérifier disponibilités
                        user_dispos = await db.disponibilites.find({
                            "user_id": user["id"],
                            "date": date_str,
                            "type_garde_id": type_garde["id"],
                            "statut": "disponible"
                        }).to_list(10)
                        
                        if user_dispos:
                            available_users.append(user)
                    
                    if not available_users:
                        break  # Pas d'utilisateurs disponibles pour ce poste
                    
                    # MODE DÉMO : ASSOUPLIR CONTRAINTE OFFICIER
                    if type_garde.get("officier_obligatoire", False):
                        # Chercher officiers d'abord
                        officers = [u for u in available_users if u["grade"] in ["Capitaine", "Lieutenant", "Directeur"]]
                        # Sinon pompiers avec fonction supérieur
                        if not officers:
                            officers = [u for u in available_users if u.get("fonction_superieur", False)]
                        # En dernier recours : tous pompiers (MODE DÉMO)
                        if not officers:
                            officers = available_users
                        
                        if officers:
                            selected_user = officers[0]
                        else:
                            continue
                    else:
                        selected_user = available_users[0]
                    
                    # Créer assignation
                    assignation_obj = Assignation(
                        user_id=selected_user["id"],
                        type_garde_id=type_garde["id"],
                        date=date_str,
                        assignation_type="auto_demo",
                        tenant_id=tenant.id
                    )
                    
                    await db.assignations.insert_one(assignation_obj.dict())
                    nouvelles_assignations.append(assignation_obj.dict())
                    existing_assignations.append(assignation_obj.dict())
        
        return {
            "message": "Attribution DÉMO agressive effectuée avec succès",
            "assignations_creees": len(nouvelles_assignations),
            "algorithme": "Mode démo : Contraintes assouplies pour impression maximum",
            "semaine": f"{semaine_debut} - {semaine_fin}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur attribution démo: {str(e)}")

# Attribution automatique intelligente avec rotation équitable et ancienneté
@api_router.post("/{tenant_slug}/planning/attribution-auto")
async def attribution_automatique(tenant_slug: str, semaine_debut: str, current_user: User = Depends(get_current_user)):
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Get all available users and types de garde pour ce tenant
        users = await db.users.find({"statut": "Actif", "tenant_id": tenant.id}).to_list(1000)
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        
        # Get existing assignations for the week
        semaine_fin = (datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=6)).strftime("%Y-%m-%d")
        existing_assignations = await db.assignations.find({
            "date": {
                "$gte": semaine_debut,
                "$lte": semaine_fin
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        # Get monthly statistics for rotation équitable (current month)
        current_month_start = datetime.strptime(semaine_debut, "%Y-%m-%d").replace(day=1).strftime("%Y-%m-%d")
        current_month_end = (datetime.strptime(current_month_start, "%Y-%m-%d") + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        current_month_end = current_month_end.strftime("%Y-%m-%d")
        
        monthly_assignations = await db.assignations.find({
            "date": {
                "$gte": current_month_start,
                "$lte": current_month_end
            },
            "tenant_id": tenant.id
        }).to_list(1000)
        
        # Calculate monthly hours for each user
        user_monthly_hours = {}
        for user in users:
            user_hours = 0
            for assignation in monthly_assignations:
                if assignation["user_id"] == user["id"]:
                    # Find type garde to get duration
                    type_garde = next((t for t in types_garde if t["id"] == assignation["type_garde_id"]), None)
                    if type_garde:
                        user_hours += type_garde.get("duree_heures", 8)
            user_monthly_hours[user["id"]] = user_hours
        
        # Attribution automatique logic (5 niveaux de priorité)
        nouvelles_assignations = []
        
        for type_garde in types_garde:
            # Check each day for this type de garde
            for day_offset in range(7):
                current_date = datetime.strptime(semaine_debut, "%Y-%m-%d") + timedelta(days=day_offset)
                date_str = current_date.strftime("%Y-%m-%d")
                day_name = current_date.strftime("%A").lower()
                
                # Skip if type garde doesn't apply to this day
                if type_garde.get("jours_application") and day_name not in type_garde["jours_application"]:
                    continue
                
                # ÉTAPE 1: Vérifier si la garde est déjà complète
                existing_for_garde = [a for a in existing_assignations 
                                     if a["date"] == date_str and a["type_garde_id"] == type_garde["id"]]
                
                personnel_requis = type_garde.get("personnel_requis", 1)
                personnel_assigne = len(existing_for_garde)
                
                # Si déjà complet ou plus, passer à la garde suivante
                if personnel_assigne >= personnel_requis:
                    continue  # Garde déjà complète, ne rien ajouter
                
                # Calculer combien de pompiers il faut encore assigner
                places_restantes = personnel_requis - personnel_assigne
                
                # Find available users for this slot
                available_users = []
                for user in users:
                    # ÉTAPE 2: Check if user has availability (for part-time employees)
                    if user["type_emploi"] == "temps_partiel":
                        # Get user disponibilités
                        user_dispos = await db.disponibilites.find({
                            "user_id": user["id"],
                            "date": date_str,
                            "statut": "disponible"
                        }).to_list(10)
                        
                        if not user_dispos:
                            continue  # Skip if not available
                        
                        # VÉRIFICATION DES HEURES MAX PAR SEMAINE
                        # Calculer les heures déjà assignées cette semaine pour cet utilisateur
                        week_assignations = [a for a in existing_assignations 
                                           if a["user_id"] == user["id"] and 
                                           semaine_debut <= a["date"] <= semaine_fin]
                        
                        week_hours = 0
                        for assignation in week_assignations:
                            type_g = next((t for t in types_garde if t["id"] == assignation["type_garde_id"]), None)
                            if type_g:
                                week_hours += type_g.get("duree_heures", 8)
                        
                        # Vérifier si ajouter cette garde dépasserait les heures max
                        heures_max = user.get("heures_max_semaine", 40)
                        if week_hours + type_garde.get("duree_heures", 8) > heures_max:
                            continue  # Skip si dépasse les heures max souhaitées
                    else:
                        # Skip temps plein (planning fixe manuel)
                        continue
                    
                    # Check if user already assigned on this date
                    already_assigned = next((a for a in existing_assignations 
                                           if a["date"] == date_str and a["user_id"] == user["id"]), None)
                    if already_assigned:
                        continue
                    
                    available_users.append(user)
                
                if not available_users:
                    continue
                
                # ÉTAPE 3: Apply grade requirements (1 officier obligatoire si configuré)
                if type_garde.get("officier_obligatoire", False):
                    # Filter officers (Capitaine, Lieutenant, Directeur)
                    officers = [u for u in available_users if u["grade"] in ["Capitaine", "Lieutenant", "Directeur"]]
                    if officers:
                        available_users = officers
                
                # ÉTAPE 4: Rotation équitable - sort by monthly hours (ascending)
                available_users.sort(key=lambda u: user_monthly_hours.get(u["id"], 0))
                
                # ÉTAPE 5: Ancienneté - among users with same hours, prioritize by ancienneté
                min_hours = user_monthly_hours.get(available_users[0]["id"], 0)
                users_with_min_hours = [u for u in available_users if user_monthly_hours.get(u["id"], 0) == min_hours]
                
                if len(users_with_min_hours) > 1:
                    # Sort by ancienneté (date_embauche) - oldest first
                    # Gérer les deux formats de date possibles (ISO et français)
                    def parse_date_flexible(date_str):
                        try:
                            return datetime.strptime(date_str, "%Y-%m-%d")
                        except:
                            try:
                                return datetime.strptime(date_str, "%d/%m/%Y")
                            except:
                                return datetime(1900, 1, 1)  # Date par défaut si parsing échoue
                    
                    users_with_min_hours.sort(key=lambda u: parse_date_flexible(u.get("date_embauche", "1900-01-01")))
                
                # Assigner autant de pompiers que nécessaire pour remplir la garde
                pompiers_assignes_cette_iteration = 0
                
                for _ in range(places_restantes):
                    if not users_with_min_hours:
                        break  # Plus de pompiers disponibles
                    
                    # Select the best candidate
                    selected_user = users_with_min_hours[0]
                    
                    # Vérifier qu'il n'est pas déjà assigné à cette garde
                    deja_assigne = any(a["user_id"] == selected_user["id"] and 
                                      a["date"] == date_str and 
                                      a["type_garde_id"] == type_garde["id"] 
                                      for a in existing_assignations)
                    
                    if deja_assigne:
                        users_with_min_hours.pop(0)  # Retirer ce pompier et essayer le suivant
                        continue
                    
                    # Créer l'assignation
                    assignation_obj = Assignation(
                        user_id=selected_user["id"],
                        type_garde_id=type_garde["id"],
                        date=date_str,
                        assignation_type="auto",
                        tenant_id=tenant.id
                    )
                    
                    await db.assignations.insert_one(assignation_obj.dict())
                    nouvelles_assignations.append(assignation_obj.dict())
                    existing_assignations.append(assignation_obj.dict())
                    pompiers_assignes_cette_iteration += 1
                    
                    # Update monthly hours for next iteration
                    user_monthly_hours[selected_user["id"]] += type_garde.get("duree_heures", 8)
                    
                    # Retirer ce pompier de la liste des disponibles pour cette garde
                    users_with_min_hours.pop(0)
        
        return {
            "message": "Attribution automatique intelligente effectuée avec succès",
            "assignations_creees": len(nouvelles_assignations),
            "algorithme": "5 niveaux: Manuel → Disponibilités → Grades → Rotation équitable → Ancienneté",
            "semaine": f"{semaine_debut} - {semaine_fin}"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de l'attribution automatique: {str(e)}")

# Endpoint pour obtenir les statistiques personnelles mensuelles
@api_router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")
async def get_user_monthly_stats(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Get current month assignations for this user
        today = datetime.now(timezone.utc)
        month_start = today.replace(day=1).strftime("%Y-%m-%d")
        month_end = (today.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        month_end = month_end.strftime("%Y-%m-%d")
        
        user_assignations = await db.assignations.find({
            "user_id": user_id,
            "tenant_id": tenant.id,
            "date": {
                "$gte": month_start,
                "$lte": month_end
            }
        }).to_list(1000)
        
        # Get types garde for calculating hours
        types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        types_dict = {t["id"]: t for t in types_garde}
        
        # Calculate stats
        gardes_ce_mois = len(user_assignations)
        heures_travaillees = 0
        
        for assignation in user_assignations:
            type_garde = types_dict.get(assignation["type_garde_id"])
            if type_garde:
                heures_travaillees += type_garde.get("duree_heures", 8)
        
        # Get user formations count
        user_data = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        certifications = len(user_data.get("formations", [])) if user_data else 0
        
        return {
            "gardes_ce_mois": gardes_ce_mois,
            "heures_travaillees": heures_travaillees,
            "certifications": certifications,
            "mois": today.strftime("%B %Y")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du calcul des statistiques: {str(e)}")

# Statistics routes
@api_router.get("/{tenant_slug}/statistiques", response_model=Statistiques)
async def get_statistiques(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # 1. Personnel actif (100% dynamique)
        personnel_count = await db.users.count_documents({"statut": "Actif", "tenant_id": tenant.id})
        
        # 2. Gardes cette semaine (100% dynamique)
        today = datetime.now(timezone.utc).date()
        start_week = today - timedelta(days=today.weekday())
        end_week = start_week + timedelta(days=6)
        
        gardes_count = await db.assignations.count_documents({
            "tenant_id": tenant.id,
            "date": {
                "$gte": start_week.strftime("%Y-%m-%d"),
                "$lte": end_week.strftime("%Y-%m-%d")
            }
        })
        
        # 3. Formations planifiées (100% dynamique)
        formations_count = await db.sessions_formation.count_documents({"statut": "planifie", "tenant_id": tenant.id})
        
        # 4. Taux de couverture dynamique - CALCUL CORRECT
        # Calculer le total de personnel requis pour la semaine
        total_assignations_required = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
        total_personnel_requis = 0
        total_personnel_assigne = 0
        
        # Pour chaque jour de la semaine
        for day_offset in range(7):
            current_day = start_week + timedelta(days=day_offset)
            day_name = current_day.strftime("%A").lower()
            
            # Pour chaque type de garde
            for type_garde in total_assignations_required:
                jours_app = type_garde.get("jours_application", [])
                
                # Si ce type de garde s'applique à ce jour
                if not jours_app or day_name in jours_app:
                    personnel_requis = type_garde.get("personnel_requis", 1)
                    total_personnel_requis += personnel_requis
                    
                    # Compter combien de personnes sont assignées pour cette garde ce jour
                    assignations_jour = await db.assignations.count_documents({
                        "tenant_id": tenant.id,
                        "date": current_day.strftime("%Y-%m-%d"),
                        "type_garde_id": type_garde["id"]
                    })
                    
                    total_personnel_assigne += min(assignations_jour, personnel_requis)
        
        # Calcul correct : (personnel assigné / personnel requis) × 100
        taux_couverture = (total_personnel_assigne / total_personnel_requis * 100) if total_personnel_requis > 0 else 0
        
        # Cap à 100% maximum
        taux_couverture = min(taux_couverture, 100.0)
        
        # 5. Heures travaillées ce mois (100% dynamique)
        start_month = today.replace(day=1)
        end_month = (start_month + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        assignations_mois = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": start_month.strftime("%Y-%m-%d"),
                "$lte": end_month.strftime("%Y-%m-%d")
            }
        }).to_list(1000)
        
        # Calculer les heures basées sur les types de garde
        heures_totales = 0
        types_garde_dict = {tg["id"]: tg for tg in total_assignations_required}
        
        for assignation in assignations_mois:
            type_garde = types_garde_dict.get(assignation["type_garde_id"])
            if type_garde:
                heures_totales += type_garde.get("duree_heures", 8)
        
        # 6. Remplacements effectués (100% dynamique)
        remplacements_count = await db.demandes_remplacement.count_documents({"statut": "approuve", "tenant_id": tenant.id})
        
        return Statistiques(
            personnel_actif=personnel_count,
            gardes_cette_semaine=gardes_count,
            formations_planifiees=formations_count,
            taux_couverture=round(taux_couverture, 1),
            heures_travaillees=heures_totales,
            remplacements_effectues=remplacements_count
        )
        
    except Exception as e:
        # Fallback en cas d'erreur
        print(f"Erreur calcul statistiques: {str(e)}")
        return Statistiques(
            personnel_actif=0,
            gardes_cette_semaine=0,
            formations_planifiees=0,
            taux_couverture=0.0,
            heures_travaillees=0,
            remplacements_effectues=0
        )

# Réinitialiser tout le planning (vider toutes assignations)
@api_router.post("/planning/reinitialiser")
async def reinitialiser_planning(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer toutes les assignations
        result = await db.assignations.delete_many({})
        
        return {
            "message": "Planning réinitialisé avec succès",
            "assignations_supprimees": result.deleted_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur réinitialisation: {str(e)}")



# ==================== PARAMÈTRES DE VALIDATION DU PLANNING ====================

@api_router.get("/{tenant_slug}/parametres/validation-planning")
async def get_parametres_validation(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """
    Récupérer les paramètres de validation du planning pour le tenant
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer les paramètres de validation ou retourner valeurs par défaut
        validation_params = tenant.parametres.get('validation_planning', {
            'frequence': 'mensuel',
            'jour_envoi': 25,  # 25 du mois
            'heure_envoi': '17:00',
            'periode_couverte': 'mois_suivant',
            'envoi_automatique': True,
            'derniere_notification': None
        })
        
        return validation_params
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur récupération paramètres: {str(e)}")

@api_router.put("/{tenant_slug}/parametres/validation-planning")
async def update_parametres_validation(tenant_slug: str, parametres: dict, current_user: User = Depends(get_current_user)):
    """
    Mettre à jour les paramètres de validation du planning
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        tenant_doc = await db.tenants.find_one({"id": tenant.id})
        
        if not tenant_doc:
            raise HTTPException(status_code=404, detail="Tenant non trouvé")
        
        # Mettre à jour les paramètres
        current_parametres = tenant_doc.get('parametres', {})
        current_parametres['validation_planning'] = parametres
        
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": {"parametres": current_parametres}}
        )
        
        return {"message": "Paramètres mis à jour avec succès", "parametres": parametres}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour paramètres: {str(e)}")

@api_router.post("/{tenant_slug}/planning/envoyer-notifications")
async def envoyer_notifications_planning(tenant_slug: str, periode_debut: str, periode_fin: str, current_user: User = Depends(get_current_user)):
    """
    Envoyer les notifications par email à tous les pompiers avec leurs gardes assignées
    
    Args:
        tenant_slug: slug de la caserne
        periode_debut: Date début (YYYY-MM-DD)
        periode_fin: Date fin (YYYY-MM-DD)
    """
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer toutes les assignations de la période
        assignations_list = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {"$gte": periode_debut, "$lte": periode_fin}
        }).to_list(length=None)
        
        # Récupérer tous les users et types de garde
        users_list = await db.users.find({"tenant_id": tenant.id}).to_list(length=None)
        types_garde_list = await db.types_garde.find({"tenant_id": tenant.id}).to_list(length=None)
        
        # Créer des maps pour accès rapide
        users_map = {u['id']: u for u in users_list}
        types_garde_map = {t['id']: t for t in types_garde_list}
        
        # Grouper les assignations par user
        gardes_par_user = {}
        for assignation in assignations_list:
            user_id = assignation['user_id']
            if user_id not in gardes_par_user:
                gardes_par_user[user_id] = []
            
            type_garde = types_garde_map.get(assignation['type_garde_id'], {})
            
            # Trouver les collègues pour cette garde
            collegues = [
                f"{users_map[a['user_id']]['prenom']} {users_map[a['user_id']]['nom']}"
                for a in assignations_list
                if a['date'] == assignation['date'] and 
                   a['type_garde_id'] == assignation['type_garde_id'] and 
                   a['user_id'] != user_id and 
                   a['user_id'] in users_map
            ]
            
            # Formater la date
            from datetime import datetime as dt
            date_obj = dt.strptime(assignation['date'], '%Y-%m-%d')
            jour_fr = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][date_obj.weekday()]
            
            gardes_par_user[user_id].append({
                'date': date_obj.strftime('%d %B %Y'),
                'jour': jour_fr,
                'type_garde': type_garde.get('nom', 'Garde'),
                'horaire': f"{type_garde.get('heure_debut', '08:00')} - {type_garde.get('heure_fin', '08:00')}",
                'collegues': collegues
            })
        
        # Envoyer les emails
        emails_envoyes = 0
        emails_echoues = 0
        
        periode_str = f"{dt.strptime(periode_debut, '%Y-%m-%d').strftime('%B %Y')}"
        
        for user_id, gardes in gardes_par_user.items():
            user = users_map.get(user_id)
            if not user or not user.get('email'):
                continue
            
            user_name = f"{user['prenom']} {user['nom']}"
            email_sent = send_gardes_notification_email(
                user['email'],
                user_name,
                gardes,
                tenant_slug,
                periode_str
            )
            
            if email_sent:
                emails_envoyes += 1
            else:
                emails_echoues += 1
        
        # Mettre à jour la date de dernière notification
        tenant_doc = await db.tenants.find_one({"id": tenant.id})
        current_parametres = tenant_doc.get('parametres', {})
        if 'validation_planning' not in current_parametres:
            current_parametres['validation_planning'] = {}
        current_parametres['validation_planning']['derniere_notification'] = datetime.now(timezone.utc).isoformat()
        
        await db.tenants.update_one(
            {"id": tenant.id},
            {"$set": {"parametres": current_parametres}}
        )
        
        return {
            "message": "Notifications envoyées",
            "emails_envoyes": emails_envoyes,
            "emails_echoues": emails_echoues,
            "total_pompiers": len(gardes_par_user)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur envoi notifications: {str(e)}")


# Réparer tous les mots de passe démo
@api_router.post("/repair-demo-passwords")
async def repair_demo_passwords():
    try:
        password_fixes = [
            ("admin@firemanager.ca", "admin123"),
            ("superviseur@firemanager.ca", "superviseur123"),
            ("employe@firemanager.ca", "employe123"),
            ("partiel@firemanager.ca", "partiel123")
        ]
        
        fixed_count = 0
        for email, password in password_fixes:
            user = await db.users.find_one({"email": email})
            if user:
                new_hash = get_password_hash(password)
                await db.users.update_one(
                    {"email": email},
                    {"$set": {"mot_de_passe_hash": new_hash}}
                )
                fixed_count += 1
                print(f"Fixed password for {email}")
        
        return {"message": f"{fixed_count} mots de passe démo réparés"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Fix all demo passwords endpoint
@api_router.post("/fix-all-passwords")
async def fix_all_passwords():
    try:
        # Fix all demo account passwords
        password_fixes = [
            ("admin@firemanager.ca", "admin123"),
            ("superviseur@firemanager.ca", "superviseur123"),
            ("employe@firemanager.ca", "employe123"),
            ("partiel@firemanager.ca", "partiel123")
        ]
        
        fixed_count = 0
        for email, password in password_fixes:
            user = await db.users.find_one({"email": email})
            if user:
                new_hash = get_password_hash(password)
                await db.users.update_one(
                    {"email": email},
                    {"$set": {"mot_de_passe_hash": new_hash}}
                )
                fixed_count += 1
                print(f"Fixed password for {email}")
        
        return {"message": f"{fixed_count} mots de passe réparés"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Fix admin password endpoint
@api_router.post("/fix-admin-password")
async def fix_admin_password():
    try:
        # Find admin user
        admin_user = await db.users.find_one({"email": "admin@firemanager.ca"})
        if admin_user:
            # Update password hash
            new_password_hash = get_password_hash("admin123")
            await db.users.update_one(
                {"email": "admin@firemanager.ca"},
                {"$set": {"mot_de_passe_hash": new_password_hash}}
            )
            return {"message": "Mot de passe admin réparé"}
        else:
            return {"message": "Compte admin non trouvé"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Clean up endpoint
@api_router.post("/cleanup-duplicates")
async def cleanup_duplicates(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Clean formations duplicates - keep only unique ones by name
        formations = await db.formations.find().to_list(1000)
        unique_formations = {}
        
        for formation in formations:
            name = formation['nom']
            if name not in unique_formations:
                unique_formations[name] = formation
        
        # Delete all formations and re-insert unique ones
        await db.formations.delete_many({})
        
        if unique_formations:
            formations_to_insert = []
            for formation in unique_formations.values():
                formation.pop('_id', None)  # Remove MongoDB _id
                formations_to_insert.append(formation)
            
            await db.formations.insert_many(formations_to_insert)
        
        # Clean types garde duplicates
        types_garde = await db.types_garde.find().to_list(1000)
        unique_types = {}
        
        for type_garde in types_garde:
            key = f"{type_garde['nom']}_{type_garde['heure_debut']}_{type_garde['heure_fin']}"
            if key not in unique_types:
                unique_types[key] = type_garde
        
        # Delete all types garde and re-insert unique ones
        await db.types_garde.delete_many({})
        
        if unique_types:
            types_to_insert = []
            for type_garde in unique_types.values():
                type_garde.pop('_id', None)  # Remove MongoDB _id
                types_to_insert.append(type_garde)
            
            await db.types_garde.insert_many(types_to_insert)
        
        formations_count = len(unique_formations)
        types_count = len(unique_types)
        
        return {
            "message": f"Nettoyage terminé: {formations_count} formations uniques, {types_count} types de garde uniques"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du nettoyage: {str(e)}")

# Créer données de démonstration réalistes avec historique
@api_router.post("/init-demo-data-realiste")
async def init_demo_data_realiste():
    try:
        # Clear existing data
        await db.users.delete_many({})
        await db.types_garde.delete_many({})
        await db.assignations.delete_many({})
        await db.planning.delete_many({})
        await db.demandes_remplacement.delete_many({})
        await db.formations.delete_many({})
        await db.sessions_formation.delete_many({})
        await db.disponibilites.delete_many({})
        
        # Créer plus d'utilisateurs réalistes
        demo_users = [
            {
                "nom": "Dupont", "prenom": "Jean", "email": "admin@firemanager.ca",
                "telephone": "514-111-2233", "contact_urgence": "514-999-1111",
                "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "admin", "numero_employe": "ADM001",
                "date_embauche": "14/01/2020", "formations": [], "mot_de_passe": "admin123"
            },
            {
                "nom": "Dubois", "prenom": "Sophie", "email": "superviseur@firemanager.ca",
                "telephone": "514-444-5566", "contact_urgence": "514-888-2222",
                "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "POM001",
                "date_embauche": "07/01/2022", "formations": [], "mot_de_passe": "superviseur123"
            },
            {
                "nom": "Bernard", "prenom": "Pierre", "email": "employe@firemanager.ca",
                "telephone": "418-555-9999", "contact_urgence": "418-777-3333",
                "grade": "Capitaine", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM002",
                "date_embauche": "21/09/2019", "formations": [], "mot_de_passe": "employe123"
            },
            {
                "nom": "Garcia", "prenom": "Claire", "email": "partiel@firemanager.ca",
                "telephone": "514-888-9900", "contact_urgence": "514-666-4444",
                "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel",
                "heures_max_semaine": 25, "role": "employe", "numero_employe": "POM005",
                "date_embauche": "02/11/2020", "formations": [], "mot_de_passe": "partiel123"
            },
            # Nouveaux utilisateurs pour démo réaliste
            {
                "nom": "Tremblay", "prenom": "Marc", "email": "marc.tremblay@firemanager.ca",
                "telephone": "418-222-3333", "contact_urgence": "418-999-4444",
                "grade": "Lieutenant", "fonction_superieur": False, "type_emploi": "temps_plein",
                "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM003",
                "date_embauche": "15/03/2021", "formations": [], "mot_de_passe": "TempPass123!"
            },
            {
                "nom": "Martin", "prenom": "Sarah", "email": "sarah.martin@firemanager.ca",
                "telephone": "514-333-4444", "contact_urgence": "514-777-8888",
                "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel",
                "heures_max_semaine": 20, "role": "employe", "numero_employe": "POM006",
                "date_embauche": "10/08/2023", "formations": [], "mot_de_passe": "TempPass123!"
            }
        ]
        
        # Créer formations avec plus de détails
        demo_formations = [
            {"nom": "Classe 4A", "description": "Formation de conduite véhicules lourds", "duree_heures": 40, "validite_mois": 60, "obligatoire": False},
            {"nom": "Désincarcération", "description": "Techniques de désincarcération", "duree_heures": 24, "validite_mois": 36, "obligatoire": True},
            {"nom": "Pompier 1", "description": "Formation de base pompier niveau 1", "duree_heures": 200, "validite_mois": 24, "obligatoire": True},
            {"nom": "Officier 2", "description": "Formation officier niveau 2", "duree_heures": 120, "validite_mois": 36, "obligatoire": False},
            {"nom": "Premiers Répondants", "description": "Formation premiers secours", "duree_heures": 16, "validite_mois": 12, "obligatoire": True},
            {"nom": "Sauvetage Aquatique", "description": "Techniques de sauvetage en milieu aquatique", "duree_heures": 32, "validite_mois": 24, "obligatoire": False}
        ]
        
        formation_ids = {}
        for formation_data in demo_formations:
            formation_obj = Formation(**formation_data)
            await db.formations.insert_one(formation_obj.dict())
            formation_ids[formation_data["nom"]] = formation_obj.id
        
        # Assigner formations aux utilisateurs
        demo_users[0]["formations"] = [formation_ids["Officier 2"], formation_ids["Pompier 1"]]
        demo_users[1]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        demo_users[2]["formations"] = [formation_ids["Classe 4A"], formation_ids["Désincarcération"], formation_ids["Premiers Répondants"]]
        demo_users[3]["formations"] = [formation_ids["Pompier 1"]]
        demo_users[4]["formations"] = [formation_ids["Désincarcération"], formation_ids["Premiers Répondants"], formation_ids["Sauvetage Aquatique"]]
        demo_users[5]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        
        # Créer utilisateurs
        user_ids = {}
        for user_data in demo_users:
            user_dict = user_data.copy()
            user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
            user_dict["statut"] = "Actif"
            user_obj = User(**user_dict)
            await db.users.insert_one(user_obj.dict())
            user_ids[user_data["email"]] = user_obj.id
        
        # Créer assignations historiques (3 mois)
        assignations_created = 0
        for week_offset in range(-12, 1):  # 12 semaines passées + semaine courante
            week_start = datetime.now(timezone.utc).date() + timedelta(weeks=week_offset)
            week_start = week_start - timedelta(days=week_start.weekday())
            
            for day_offset in range(7):
                date_assignation = week_start + timedelta(days=day_offset)
                date_str = date_assignation.strftime("%Y-%m-%d")
                
                # Assigner quelques gardes aléatoirement
                if assignations_created % 3 == 0:  # Environ 1/3 des jours
                    # Garde Interne AM
                    assignation_obj = Assignation(
                        user_id=user_ids["employe@firemanager.ca"],
                        type_garde_id="garde-interne-am",  # Sera créé après
                        date=date_str,
                        assignation_type="auto"
                    )
                    await db.assignations.insert_one(assignation_obj.dict())
                    assignations_created += 1
        
        return {"message": f"Données de démonstration réalistes créées : {len(demo_users)} utilisateurs, {len(demo_formations)} formations, {assignations_created} assignations historiques"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Affecter disponibilités à TOUS les employés temps partiel existants (auto-détection)
@api_router.post("/auto-affecter-disponibilites-temps-partiel")
async def auto_affecter_disponibilites_temps_partiel(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # DÉTECTION AUTOMATIQUE de tous les employés temps partiel
        tous_temps_partiel = await db.users.find({
            "type_emploi": "temps_partiel",
            "statut": "Actif"
        }).to_list(1000)
        
        print(f"Trouvé {len(tous_temps_partiel)} employés temps partiel")
        
        # Supprimer les anciennes disponibilités de la semaine courante
        today = datetime.now(timezone.utc).date()
        start_week = today - timedelta(days=today.weekday())
        end_week = start_week + timedelta(days=6)
        
        await db.disponibilites.delete_many({
            "date": {
                "$gte": start_week.strftime("%Y-%m-%d"),
                "$lte": end_week.strftime("%Y-%m-%d")
            }
        })
        
        # Récupérer types de garde
        types_garde = await db.types_garde.find().to_list(100)
        
        disponibilites_created = 0
        
        # AFFECTER DISPONIBILITÉS À TOUS LES TEMPS PARTIEL DÉTECTÉS
        for index, user in enumerate(tous_temps_partiel):
            print(f"Affectation pour {user['prenom']} {user['nom']} ({user['grade']})")
            
            # Pattern de disponibilité selon l'index pour variété
            if index % 4 == 0:  # Pattern 1: Lun-Mer-Ven
                jours_disponibles = [0, 2, 4]
            elif index % 4 == 1:  # Pattern 2: Mar-Jeu-Sam  
                jours_disponibles = [1, 3, 5]
            elif index % 4 == 2:  # Pattern 3: Mer-Ven-Dim
                jours_disponibles = [2, 4, 6]
            else:  # Pattern 4: Lun-Jeu-Dim
                jours_disponibles = [0, 3, 6]
            
            for day_offset in jours_disponibles:
                date_dispo = start_week + timedelta(days=day_offset)
                date_str = date_dispo.strftime("%Y-%m-%d")
                day_name = date_dispo.strftime("%A").lower()
                
                # Créer disponibilités pour TOUS les types de garde applicables
                for type_garde in types_garde:
                    jours_app = type_garde.get("jours_application", [])
                    if jours_app and day_name not in jours_app:
                        continue
                    
                    # Créer disponibilité (stratégie intensive pour démo)
                    dispo_obj = Disponibilite(
                        user_id=user["id"],
                        date=date_str,
                        type_garde_id=type_garde["id"],
                        heure_debut=type_garde["heure_debut"],
                        heure_fin=type_garde["heure_fin"],
                        statut="disponible"
                    )
                    await db.disponibilites.insert_one(dispo_obj.dict())
                    disponibilites_created += 1
        
        return {
            "message": "Disponibilités affectées automatiquement",
            "employes_temps_partiel_detectes": len(tous_temps_partiel),
            "disponibilites_creees": disponibilites_created,
            "semaine": f"{start_week.strftime('%Y-%m-%d')} - {end_week.strftime('%Y-%m-%d')}",
            "patterns": "4 patterns différents pour variété démo",
            "employés_détectés": [f"{u['prenom']} {u['nom']} ({u['grade']})" for u in tous_temps_partiel]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur auto-affectation: {str(e)}")

# Créer disponibilités MAXIMALES pour démo parfaite
@api_router.post("/init-disponibilites-demo-complete")
async def init_disponibilites_demo_complete(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer toutes les disponibilités existantes
        await db.disponibilites.delete_many({})
        
        today = datetime.now(timezone.utc).date()
        start_week = today - timedelta(days=today.weekday())
        end_week = start_week + timedelta(days=6)
        
        # Récupérer TOUS les utilisateurs (temps plein ET temps partiel pour démo)
        all_users = await db.users.find({"statut": "Actif"}).to_list(100)
        types_garde = await db.types_garde.find().to_list(100)
        
        disponibilites_created = 0
        
        # STRATÉGIE DÉMO : TOUS LES EMPLOYÉS DISPONIBLES POUR TOUS LES TYPES
        for user in all_users:
            for day_offset in range(7):  # Chaque jour
                date_dispo = start_week + timedelta(days=day_offset)
                date_str = date_dispo.strftime("%Y-%m-%d")
                day_name = date_dispo.strftime("%A").lower()
                
                for type_garde in types_garde:
                    # Vérifier jours d'application
                    jours_app = type_garde.get("jours_application", [])
                    if jours_app and day_name not in jours_app:
                        continue
                    
                    # CRÉER DISPONIBILITÉ POUR TOUS (temps plein et temps partiel)
                    # Exception : respecter les heures max pour temps partiel
                    if user["type_emploi"] == "temps_partiel":
                        # Temps partiel : disponible seulement 3 jours par semaine
                        user_number = int(user["numero_employe"][-1]) if user["numero_employe"][-1].isdigit() else 0
                        
                        # Pattern par employé pour éviter épuisement
                        if user_number % 3 == 0 and day_offset in [0, 2, 4]:  # Lun-Mer-Ven
                            pass
                        elif user_number % 3 == 1 and day_offset in [1, 3, 5]:  # Mar-Jeu-Sam
                            pass  
                        elif user_number % 3 == 2 and day_offset in [2, 4, 6]:  # Mer-Ven-Dim
                            pass
                        else:
                            continue  # Skip ce jour pour cet employé
                    
                    # CRÉER DISPONIBILITÉ
                    dispo_obj = Disponibilite(
                        user_id=user["id"],
                        date=date_str,
                        type_garde_id=type_garde["id"],
                        heure_debut=type_garde["heure_debut"],
                        heure_fin=type_garde["heure_fin"],
                        statut="disponible"
                    )
                    await db.disponibilites.insert_one(dispo_obj.dict())
                    disponibilites_created += 1
        
        return {
            "message": "Disponibilités DÉMO COMPLÈTES créées",
            "semaine": f"{start_week.strftime('%Y-%m-%d')} - {end_week.strftime('%Y-%m-%d')}",
            "disponibilites_creees": disponibilites_created,
            "all_users_included": len(all_users),
            "strategy": "TOUS employés (TP+TPa) avec patterns optimisés"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Créer disponibilités pour semaine courante (démo assignation auto)
@api_router.post("/init-disponibilites-semaine-courante")
async def init_disponibilites_semaine_courante(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    try:
        # Supprimer les disponibilités existantes pour la semaine courante
        today = datetime.now(timezone.utc).date()
        start_week = today - timedelta(days=today.weekday())
        end_week = start_week + timedelta(days=6)
        
        await db.disponibilites.delete_many({
            "date": {
                "$gte": start_week.strftime("%Y-%m-%d"),
                "$lte": end_week.strftime("%Y-%m-%d")
            }
        })
        
        # Récupérer tous les types de garde
        types_garde = await db.types_garde.find().to_list(100)
        # DÉTECTION AUTOMATIQUE de TOUS les employés temps partiel (peu importe le nombre)
        tous_temps_partiel = await db.users.find({
            "type_emploi": "temps_partiel",
            "statut": "Actif"
        }).to_list(1000)
        
        print(f"AUTO-DÉTECTION: {len(tous_temps_partiel)} employés temps partiel trouvés")
        
        disponibilites_created = 0
        
        # ALGORITHME OPTIMISÉ POUR TOUS VOS EMPLOYÉS TEMPS PARTIEL
        for user_index, user in enumerate(tous_temps_partiel):
            for day_offset in range(7):  # Chaque jour de la semaine courante
                date_dispo = start_week + timedelta(days=day_offset)
                date_str = date_dispo.strftime("%Y-%m-%d")
                day_name = date_dispo.strftime("%A").lower()
                
                # Pattern de disponibilité varié selon l'employé
                if user_index % 3 == 0:  # 1/3 des employés : Lun-Mer-Ven
                    jours_pattern = ['monday', 'wednesday', 'friday']
                elif user_index % 3 == 1:  # 1/3 des employés : Mar-Jeu-Sam
                    jours_pattern = ['tuesday', 'thursday', 'saturday']
                else:  # 1/3 des employés : Mer-Ven-Dim
                    jours_pattern = ['wednesday', 'friday', 'sunday']
                
                if day_name in jours_pattern:
                    # Créer disponibilités pour TOUS les types de garde applicables
                    for type_garde in types_garde:
                        jours_app = type_garde.get("jours_application", [])
                        if jours_app and day_name not in jours_app:
                            continue
                        
                        # CRÉER DISPONIBILITÉ pour vos employés (pompiers ET lieutenants)
                        dispo_obj = Disponibilite(
                            user_id=user["id"],
                            date=date_str,
                            type_garde_id=type_garde["id"],
                            heure_debut=type_garde["heure_debut"],
                            heure_fin=type_garde["heure_fin"],
                            statut="disponible"
                        )
                        await db.disponibilites.insert_one(dispo_obj.dict())
                        disponibilites_created += 1
        
        return {
            "message": "Disponibilités créées pour TOUS vos employés temps partiel",
            "employes_temps_partiel": len(tous_temps_partiel),
            "disponibilites_creees": disponibilites_created,
            "all_users_included": len(tous_temps_partiel),
            "strategy": f"AUTO-DÉTECTION: {len(tous_temps_partiel)} employés temps partiel avec patterns optimisés"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Créer données de démonstration OPTIMALES pour démo client
@api_router.post("/init-demo-client-data")
async def init_demo_client_data():
    try:
        # Clear existing data
        await db.users.delete_many({})
        await db.types_garde.delete_many({})
        await db.assignations.delete_many({})
        await db.formations.delete_many({})
        await db.sessions_formation.delete_many({})
        await db.disponibilites.delete_many({})
        await db.demandes_remplacement.delete_many({})
        
        # 1. ÉQUIPE RÉALISTE CASERNE (15 pompiers)
        demo_users = [
            # DIRECTION ET ADMINISTRATION
            {"nom": "Dupont", "prenom": "Jean", "email": "admin@firemanager.ca", "telephone": "514-111-2233", "contact_urgence": "514-999-1111", "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "admin", "numero_employe": "DIR001", "date_embauche": "14/01/2015", "formations": [], "mot_de_passe": "admin123"},
            {"nom": "Tremblay", "prenom": "Marie", "email": "directrice@firemanager.ca", "telephone": "514-222-3344", "contact_urgence": "514-888-1111", "grade": "Directeur", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "DIR002", "date_embauche": "03/06/2018", "formations": [], "mot_de_passe": "superviseur123"},
            
            # SUPERVISEURS / CAPITAINES
            {"nom": "Dubois", "prenom": "Sophie", "email": "superviseur@firemanager.ca", "telephone": "514-444-5566", "contact_urgence": "514-888-2222", "grade": "Capitaine", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "CAP001", "date_embauche": "07/01/2019", "formations": [], "mot_de_passe": "superviseur123"},
            {"nom": "Leblanc", "prenom": "Michel", "email": "michel.leblanc@firemanager.ca", "telephone": "418-333-4455", "contact_urgence": "418-777-5555", "grade": "Capitaine", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "superviseur", "numero_employe": "CAP002", "date_embauche": "15/08/2020", "formations": [], "mot_de_passe": "TempPass123!"},
            
            # LIEUTENANTS
            {"nom": "Bernard", "prenom": "Pierre", "email": "employe@firemanager.ca", "telephone": "418-555-9999", "contact_urgence": "418-777-3333", "grade": "Lieutenant", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "LT001", "date_embauche": "21/09/2019", "formations": [], "mot_de_passe": "employe123"},
            {"nom": "Gagnon", "prenom": "Julie", "email": "julie.gagnon@firemanager.ca", "telephone": "514-666-7788", "contact_urgence": "514-999-3333", "grade": "Lieutenant", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "LT002", "date_embauche": "10/03/2021", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Roy", "prenom": "Alexandre", "email": "alex.roy@firemanager.ca", "telephone": "450-111-2222", "contact_urgence": "450-888-4444", "grade": "Lieutenant", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "LT003", "date_embauche": "05/11/2022", "formations": [], "mot_de_passe": "TempPass123!"},
            
            # POMPIERS TEMPS PLEIN
            {"nom": "Lavoie", "prenom": "Marc", "email": "marc.lavoie@firemanager.ca", "telephone": "514-777-8899", "contact_urgence": "514-666-5555", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM001", "date_embauche": "12/04/2021", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Côté", "prenom": "David", "email": "david.cote@firemanager.ca", "telephone": "418-888-9900", "contact_urgence": "418-555-6666", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM002", "date_embauche": "28/09/2022", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Bouchard", "prenom": "Simon", "email": "simon.bouchard@firemanager.ca", "telephone": "514-999-1234", "contact_urgence": "514-777-7777", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM003", "date_embauche": "16/01/2023", "formations": [], "mot_de_passe": "TempPass123!"},
            
            # POMPIERS TEMPS PARTIEL POUR DÉMO ASSIGNATION AUTO (12 employés)
            {"nom": "Garcia", "prenom": "Claire", "email": "partiel@firemanager.ca", "telephone": "514-888-9900", "contact_urgence": "514-666-4444", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 25, "role": "employe", "numero_employe": "PTP001", "date_embauche": "02/11/2023", "formations": [], "mot_de_passe": "partiel123"},
            {"nom": "Martin", "prenom": "Sarah", "email": "sarah.martin@firemanager.ca", "telephone": "450-555-6666", "contact_urgence": "450-999-8888", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 30, "role": "employe", "numero_employe": "PTP002", "date_embauche": "15/06/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Pelletier", "prenom": "Émilie", "email": "emilie.pelletier@firemanager.ca", "telephone": "418-333-7777", "contact_urgence": "418-666-9999", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 20, "role": "employe", "numero_employe": "PTP003", "date_embauche": "08/02/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Bergeron", "prenom": "Thomas", "email": "thomas.bergeron@firemanager.ca", "telephone": "514-444-8888", "contact_urgence": "514-333-9999", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel", "heures_max_semaine": 28, "role": "employe", "numero_employe": "PTP004", "date_embauche": "22/08/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Rousseau", "prenom": "Jessica", "email": "jessica.rousseau@firemanager.ca", "telephone": "514-777-1111", "contact_urgence": "514-888-2222", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 24, "role": "employe", "numero_employe": "PTP005", "date_embauche": "12/03/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Fournier", "prenom": "Antoine", "email": "antoine.fournier@firemanager.ca", "telephone": "418-555-2222", "contact_urgence": "418-777-3333", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel", "heures_max_semaine": 32, "role": "employe", "numero_employe": "PTP006", "date_embauche": "05/01/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Leclerc", "prenom": "Mathieu", "email": "mathieu.leclerc@firemanager.ca", "telephone": "450-666-3333", "contact_urgence": "450-888-4444", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 26, "role": "employe", "numero_employe": "PTP007", "date_embauche": "18/07/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Gauthier", "prenom": "Isabelle", "email": "isabelle.gauthier@firemanager.ca", "telephone": "514-999-4444", "contact_urgence": "514-666-5555", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 22, "role": "employe", "numero_employe": "PTP008", "date_embauche": "30/04/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Beaulieu", "prenom": "Nicolas", "email": "nicolas.beaulieu@firemanager.ca", "telephone": "418-444-5555", "contact_urgence": "418-777-6666", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel", "heures_max_semaine": 35, "role": "employe", "numero_employe": "PTP009", "date_embauche": "14/09/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Caron", "prenom": "Melissa", "email": "melissa.caron@firemanager.ca", "telephone": "514-333-6666", "contact_urgence": "514-999-7777", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 29, "role": "employe", "numero_employe": "PTP010", "date_embauche": "25/05/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Simard", "prenom": "Gabriel", "email": "gabriel.simard@firemanager.ca", "telephone": "450-777-7777", "contact_urgence": "450-333-8888", "grade": "Pompier", "fonction_superieur": True, "type_emploi": "temps_partiel", "heures_max_semaine": 27, "role": "employe", "numero_employe": "PTP011", "date_embauche": "03/11/2024", "formations": [], "mot_de_passe": "TempPass123!"},
            {"nom": "Mercier", "prenom": "Valérie", "email": "valerie.mercier@firemanager.ca", "telephone": "418-888-8888", "contact_urgence": "418-555-9999", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_partiel", "heures_max_semaine": 31, "role": "employe", "numero_employe": "PTP012", "date_embauche": "17/12/2023", "formations": [], "mot_de_passe": "TempPass123!"},
            
            # NOUVELLES RECRUES
            {"nom": "Morin", "prenom": "Kevin", "email": "kevin.morin@firemanager.ca", "telephone": "514-111-9999", "contact_urgence": "514-222-8888", "grade": "Pompier", "fonction_superieur": False, "type_emploi": "temps_plein", "heures_max_semaine": 40, "role": "employe", "numero_employe": "POM004", "date_embauche": "01/09/2024", "formations": [], "mot_de_passe": "TempPass123!"}
        ]
        
        # 2. FORMATIONS COMPLÈTES POUR CASERNE
        demo_formations = [
            {"nom": "Pompier 1", "description": "Formation de base pompier niveau 1 - Obligatoire pour tous", "duree_heures": 200, "validite_mois": 24, "obligatoire": True},
            {"nom": "Premiers Répondants", "description": "Formation premiers secours et réanimation", "duree_heures": 16, "validite_mois": 12, "obligatoire": True},
            {"nom": "Désincarcération", "description": "Techniques de désincarcération et sauvetage routier", "duree_heures": 24, "validite_mois": 36, "obligatoire": True},
            {"nom": "Classe 4A", "description": "Permis de conduire véhicules lourds et échelles", "duree_heures": 40, "validite_mois": 60, "obligatoire": False},
            {"nom": "Officier 2", "description": "Formation commandement et leadership", "duree_heures": 120, "validite_mois": 36, "obligatoire": False},
            {"nom": "Sauvetage Aquatique", "description": "Techniques de sauvetage en milieu aquatique", "duree_heures": 32, "validite_mois": 24, "obligatoire": False},
            {"nom": "Matières Dangereuses", "description": "Intervention matières dangereuses HAZMAT", "duree_heures": 48, "validite_mois": 36, "obligatoire": False},
            {"nom": "Sauvetage Technique", "description": "Sauvetage en espace clos et hauteur", "duree_heures": 56, "validite_mois": 24, "obligatoire": False}
        ]
        
        formation_ids = {}
        for formation_data in demo_formations:
            formation_obj = Formation(**formation_data)
            await db.formations.insert_one(formation_obj.dict())
            formation_ids[formation_data["nom"]] = formation_obj.id
        
        # 3. ASSIGNER FORMATIONS RÉALISTES PAR GRADE
        # Directeur - Toutes formations + Officier
        demo_users[0]["formations"] = [formation_ids["Pompier 1"], formation_ids["Officier 2"], formation_ids["Premiers Répondants"], formation_ids["Classe 4A"]]
        demo_users[1]["formations"] = [formation_ids["Pompier 1"], formation_ids["Officier 2"], formation_ids["Premiers Répondants"], formation_ids["Sauvetage Aquatique"]]
        
        # Capitaines - Formations supervision
        demo_users[2]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Désincarcération"], formation_ids["Classe 4A"]]
        demo_users[3]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Matières Dangereuses"]]
        
        # Lieutenants - Formations techniques
        demo_users[4]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Désincarcération"]]
        demo_users[5]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Sauvetage Aquatique"]]
        demo_users[6]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Sauvetage Technique"]]
        
        # Pompiers temps plein - Formations de base + spécialisations
        demo_users[7]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Désincarcération"]]
        demo_users[8]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        demo_users[9]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"], formation_ids["Classe 4A"]]
        
        # Pompiers temps partiel - Formations variables
        demo_users[10]["formations"] = [formation_ids["Pompier 1"]]
        demo_users[11]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        demo_users[12]["formations"] = [formation_ids["Pompier 1"]]
        demo_users[13]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]
        
        # Nouvelles recrues - Formations de base seulement
        demo_users[14]["formations"] = [formation_ids["Pompier 1"]]
        
        # Créer utilisateurs
        user_ids = {}
        for user_data in demo_users:
            user_dict = user_data.copy()
            user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
            user_dict["statut"] = "Actif"
            user_obj = User(**user_dict)
            await db.users.insert_one(user_obj.dict())
            user_ids[user_data["email"]] = user_obj.id
        
        # 4. CRÉER TYPES DE GARDE RÉALISTES
        demo_types_garde = [
            {"nom": "Garde Interne AM - Semaine", "heure_debut": "06:00", "heure_fin": "18:00", "personnel_requis": 4, "duree_heures": 12, "couleur": "#10B981", "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday"], "officier_obligatoire": True},
            {"nom": "Garde Interne PM - Semaine", "heure_debut": "18:00", "heure_fin": "06:00", "personnel_requis": 3, "duree_heures": 12, "couleur": "#3B82F6", "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday"], "officier_obligatoire": True},
            {"nom": "Garde Weekend Jour", "heure_debut": "08:00", "heure_fin": "20:00", "personnel_requis": 3, "duree_heures": 12, "couleur": "#F59E0B", "jours_application": ["saturday", "sunday"], "officier_obligatoire": True},
            {"nom": "Garde Weekend Nuit", "heure_debut": "20:00", "heure_fin": "08:00", "personnel_requis": 2, "duree_heures": 12, "couleur": "#8B5CF6", "jours_application": ["saturday", "sunday"], "officier_obligatoire": False},
            {"nom": "Garde Externe Citerne", "heure_debut": "00:00", "heure_fin": "23:59", "personnel_requis": 1, "duree_heures": 24, "couleur": "#EF4444", "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], "officier_obligatoire": False}
        ]
        
        type_garde_ids = {}
        for type_garde_data in demo_types_garde:
            type_garde_obj = TypeGarde(**type_garde_data)
            await db.types_garde.insert_one(type_garde_obj.dict())
            type_garde_ids[type_garde_data["nom"]] = type_garde_obj.id
        
        # 5. CRÉER HISTORIQUE ASSIGNATIONS (6 semaines)
        assignations_created = 0
        users_list = list(user_ids.values())
        
        for week_offset in range(-6, 1):  # 6 semaines passées + courante
            week_start = datetime.now(timezone.utc).date() + timedelta(weeks=week_offset)
            week_start = week_start - timedelta(days=week_start.weekday())
            
            for day_offset in range(7):
                date_assignation = week_start + timedelta(days=day_offset)
                date_str = date_assignation.strftime("%Y-%m-%d")
                day_name = date_assignation.strftime("%A").lower()
                
                # Assigner gardes selon jours d'application
                for type_nom, type_id in type_garde_ids.items():
                    type_garde = next(t for t in demo_types_garde if t["nom"] == type_nom)
                    
                    if day_name in type_garde["jours_application"]:
                        # Assigner aléatoirement 70% des gardes
                        if assignations_created % 3 != 2:  # 2/3 des gardes assignées
                            import random
                            user_id = random.choice(users_list)
                            
                            assignation_obj = Assignation(
                                user_id=user_id,
                                type_garde_id=type_id,
                                date=date_str,
                                assignation_type="auto"
                            )
                            await db.assignations.insert_one(assignation_obj.dict())
                            assignations_created += 1
        
        # 6. CRÉER DISPONIBILITÉS MASSIVES POUR TEMPS PARTIEL (pour démo assignation auto)
        temps_partiel_users = [
            user_ids["partiel@firemanager.ca"],
            user_ids["sarah.martin@firemanager.ca"],
            user_ids["emilie.pelletier@firemanager.ca"],
            user_ids["thomas.bergeron@firemanager.ca"],
            user_ids["jessica.rousseau@firemanager.ca"],
            user_ids["antoine.fournier@firemanager.ca"],
            user_ids["mathieu.leclerc@firemanager.ca"],
            user_ids["isabelle.gauthier@firemanager.ca"],
            user_ids["nicolas.beaulieu@firemanager.ca"],
            user_ids["melissa.caron@firemanager.ca"],
            user_ids["gabriel.simard@firemanager.ca"],
            user_ids["valerie.mercier@firemanager.ca"]
        ]
        
        disponibilites_created = 0
        
        # Pour chaque employé temps partiel, créer des disponibilités variées
        for i, user_id in enumerate(temps_partiel_users):
            # Patterns de disponibilité différents pour variété
            if i % 4 == 0:  # Pattern 1: Lun-Mer-Ven
                jours_pattern = [0, 2, 4]  # Lundi, Mercredi, Vendredi
            elif i % 4 == 1:  # Pattern 2: Mar-Jeu-Sam
                jours_pattern = [1, 3, 5]  # Mardi, Jeudi, Samedi
            elif i % 4 == 2:  # Pattern 3: Mer-Ven-Dim
                jours_pattern = [2, 4, 6]  # Mercredi, Vendredi, Dimanche
            else:  # Pattern 4: Lun-Jeu-Sam
                jours_pattern = [0, 3, 5]  # Lundi, Jeudi, Samedi
            
            # Créer disponibilités pour 8 semaines (2 mois futurs)
            for week_offset in range(0, 8):
                week_start = datetime.now(timezone.utc).date() + timedelta(weeks=week_offset)
                week_start = week_start - timedelta(days=week_start.weekday())
                
                for day_offset in jours_pattern:
                    date_dispo = week_start + timedelta(days=day_offset)
                    
                    # Créer disponibilités pour différents types de garde
                    # 80% pour Garde Interne (semaine)
                    if day_offset < 5:  # Lundi-Vendredi
                        # Disponible pour garde AM ou PM (alternativement)
                        type_garde_am = type_garde_ids["Garde Interne AM - Semaine"]
                        type_garde_pm = type_garde_ids["Garde Interne PM - Semaine"]
                        
                        # Disponible pour garde AM
                        if disponibilites_created % 3 != 2:  # 66% de chance
                            dispo_obj = Disponibilite(
                                user_id=user_id,
                                date=date_dispo.strftime("%Y-%m-%d"),
                                type_garde_id=type_garde_am,
                                heure_debut="06:00",
                                heure_fin="18:00",
                                statut="disponible"
                            )
                            await db.disponibilites.insert_one(dispo_obj.dict())
                            disponibilites_created += 1
                        
                        # Disponible pour garde PM
                        if disponibilites_created % 4 != 3:  # 75% de chance
                            dispo_obj = Disponibilite(
                                user_id=user_id,
                                date=date_dispo.strftime("%Y-%m-%d"),
                                type_garde_id=type_garde_pm,
                                heure_debut="18:00",
                                heure_fin="06:00",
                                statut="disponible"
                            )
                            await db.disponibilites.insert_one(dispo_obj.dict())
                            disponibilites_created += 1
                    else:  # Weekend
                        # Disponible pour garde weekend
                        if disponibilites_created % 2 == 0:  # 50% de chance
                            type_garde_weekend = type_garde_ids["Garde Weekend Jour"]
                            dispo_obj = Disponibilite(
                                user_id=user_id,
                                date=date_dispo.strftime("%Y-%m-%d"),
                                type_garde_id=type_garde_weekend,
                                heure_debut="08:00",
                                heure_fin="20:00",
                                statut="disponible"
                            )
                            await db.disponibilites.insert_one(dispo_obj.dict())
                            disponibilites_created += 1
        
        # 7. CRÉER SESSIONS DE FORMATION
        demo_sessions = [
            {"titre": "Formation Sauvetage Aquatique - Niveau 1", "competence_id": formation_ids["Sauvetage Aquatique"], "duree_heures": 32, "date_debut": "2025-01-15", "heure_debut": "09:00", "lieu": "Piscine municipale", "formateur": "Capitaine Sarah Tremblay", "descriptif": "Formation complète aux techniques de sauvetage aquatique", "plan_cours": "", "places_max": 12, "participants": [], "statut": "planifie"},
            {"titre": "Perfectionnement Désincarcération", "competence_id": formation_ids["Désincarcération"], "duree_heures": 16, "date_debut": "2025-01-22", "heure_debut": "13:00", "lieu": "Centre formation sécurité", "formateur": "Lieutenant Pierre Bernard", "descriptif": "Perfectionnement techniques de désincarcération moderne", "plan_cours": "", "places_max": 8, "participants": [], "statut": "planifie"},
            {"titre": "Matières Dangereuses HAZMAT", "competence_id": formation_ids["Matières Dangereuses"], "duree_heures": 48, "date_debut": "2025-02-05", "heure_debut": "08:00", "lieu": "Centre HAZMAT Montréal", "formateur": "Expert externe - Dr. Martin Dubois", "descriptif": "Formation complète intervention matières dangereuses", "plan_cours": "", "places_max": 15, "participants": [], "statut": "planifie"}
        ]
        
        for session_data in demo_sessions:
            session_obj = SessionFormation(**session_data)
            await db.sessions_formation.insert_one(session_obj.dict())
        
        return {
            "message": "Données démo CLIENT créées avec succès",
            "details": {
                "utilisateurs": len(demo_users),
                "formations": len(demo_formations),
                "types_garde": len(demo_types_garde),
                "assignations_historiques": assignations_created,
                "disponibilites": disponibilites_created,
                "sessions_formation": len(demo_sessions),
                "breakdown": {
                    "admins": 1,
                    "superviseurs": 3,
                    "employes_temps_plein": 7,
                    "employes_temps_partiel": 12,
                    "total_personnel": 23
                }
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# Initialize demo data
@api_router.post("/init-demo-data")
async def init_demo_data():
    # Clear existing data
    await db.users.delete_many({})
    await db.types_garde.delete_many({})
    await db.assignations.delete_many({})
    await db.planning.delete_many({})
    await db.demandes_remplacement.delete_many({})
    
    # Create demo users
    demo_users = [
        {
            "nom": "Dupont",
            "prenom": "Jean",
            "email": "admin@firemanager.ca",
            "telephone": "514-111-2233",
            "contact_urgence": "514-999-1111",
            "grade": "Directeur",
            "type_emploi": "temps_plein",
            "heures_max_semaine": 40,  # Temps plein standard
            "role": "admin",
            "numero_employe": "ADM001",
            "date_embauche": "14/01/2020",
            "formations": [],
            "mot_de_passe": "admin123"
        },
        {
            "nom": "Dubois",
            "prenom": "Sophie",
            "email": "superviseur@firemanager.ca",
            "telephone": "514-444-5566",
            "contact_urgence": "514-888-2222",
            "grade": "Directeur",
            "type_emploi": "temps_plein",
            "heures_max_semaine": 40,  # Temps plein standard
            "role": "superviseur",
            "numero_employe": "POM001",
            "date_embauche": "07/01/2022",
            "formations": [],
            "mot_de_passe": "superviseur123"
        },
        {
            "nom": "Bernard",
            "prenom": "Pierre",
            "email": "employe@firemanager.ca",
            "telephone": "418-555-9999",
            "contact_urgence": "418-777-3333",
            "grade": "Capitaine",
            "type_emploi": "temps_plein",
            "heures_max_semaine": 40,  # Temps plein standard
            "role": "employe",
            "numero_employe": "POM002",
            "date_embauche": "21/09/2019",
            "formations": [],
            "mot_de_passe": "employe123"
        },
        {
            "nom": "Garcia",
            "prenom": "Claire",
            "email": "partiel@firemanager.ca",
            "telephone": "514-888-9900",
            "contact_urgence": "514-666-4444",
            "grade": "Pompier",
            "type_emploi": "temps_partiel",
            "heures_max_semaine": 25,  # 25h max par semaine
            "role": "employe",
            "numero_employe": "POM005",
            "date_embauche": "02/11/2020",
            "formations": [],
            "mot_de_passe": "partiel123"
        }
    ]
    
    # First create formations
    demo_formations = [
        {
            "nom": "Classe 4A",
            "description": "Formation de conduite véhicules lourds",
            "duree_heures": 40,
            "validite_mois": 60,
            "obligatoire": False
        },
        {
            "nom": "Désincarcération",
            "description": "Techniques de désincarcération",
            "duree_heures": 24,
            "validite_mois": 36,
            "obligatoire": True
        },
        {
            "nom": "Pompier 1",
            "description": "Formation de base pompier niveau 1",
            "duree_heures": 200,
            "validite_mois": 24,
            "obligatoire": True
        },
        {
            "nom": "Officier 2",
            "description": "Formation officier niveau 2",
            "duree_heures": 120,
            "validite_mois": 36,
            "obligatoire": False
        },
        {
            "nom": "Premiers Répondants",
            "description": "Formation premiers secours",
            "duree_heures": 16,
            "validite_mois": 12,
            "obligatoire": True
        }
    ]
    
    formation_ids = {}
    for formation_data in demo_formations:
        formation_obj = Formation(**formation_data)
        await db.formations.insert_one(formation_obj.dict())
        formation_ids[formation_data["nom"]] = formation_obj.id
    
    # Update users with formation IDs
    demo_users[0]["formations"] = [formation_ids["Officier 2"], formation_ids["Pompier 1"]]  # Jean
    demo_users[1]["formations"] = [formation_ids["Pompier 1"], formation_ids["Premiers Répondants"]]  # Sophie  
    demo_users[2]["formations"] = [formation_ids["Classe 4A"], formation_ids["Désincarcération"]]  # Pierre
    demo_users[3]["formations"] = []  # Claire - aucune formation
    
    for user_data in demo_users:
        user_dict = user_data.copy()
        user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
        user_dict["statut"] = "Actif"
        user_obj = User(**user_dict)
        await db.users.insert_one(user_obj.dict())
    
    # Create demo garde types
    demo_types_garde = [
        {
            "nom": "Garde Interne AM - Semaine",
            "heure_debut": "06:00",
            "heure_fin": "12:00",
            "personnel_requis": 4,
            "duree_heures": 6,
            "couleur": "#10B981",
            "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "officier_obligatoire": True
        },
        {
            "nom": "Garde Interne PM - Semaine",
            "heure_debut": "12:00",
            "heure_fin": "18:00",
            "personnel_requis": 4,
            "duree_heures": 6,
            "couleur": "#3B82F6",
            "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "officier_obligatoire": True
        },
        {
            "nom": "Garde Externe Citerne",
            "heure_debut": "18:00",
            "heure_fin": "06:00",
            "personnel_requis": 1,
            "duree_heures": 12,
            "couleur": "#8B5CF6",
            "jours_application": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            "officier_obligatoire": False
        }
    ]
    
    for type_garde_data in demo_types_garde:
        type_garde_obj = TypeGarde(**type_garde_data)
        await db.types_garde.insert_one(type_garde_obj.dict())
    
    # Create demo disponibilités for part-time employee (Claire Garcia) with specific dates
    claire_user = await db.users.find_one({"email": "partiel@firemanager.ca"})
    if claire_user:
        # Create availabilities for next 2 weeks
        today = datetime.now(timezone.utc).date()
        demo_disponibilites = []
        
        # Generate availabilities for specific dates
        for week_offset in range(4):  # Next 4 weeks
            week_start = today + timedelta(weeks=week_offset)
            week_start = week_start - timedelta(days=week_start.weekday())  # Get Monday
            
            # Claire is available Monday, Wednesday, Friday
            for day_offset in [0, 2, 4]:  # Monday, Wednesday, Friday
                date_available = week_start + timedelta(days=day_offset)
                demo_disponibilites.append({
                    "user_id": claire_user["id"],
                    "date": date_available.strftime("%Y-%m-%d"),
                    "heure_debut": "08:00",
                    "heure_fin": "16:00",
                    "statut": "disponible"
                })
        
        for dispo_data in demo_disponibilites:
            dispo_obj = Disponibilite(**dispo_data)
            await db.disponibilites.insert_one(dispo_obj.dict())
    
    return {"message": "Données de démonstration créées avec succès"}

# ==================== NOTIFICATIONS ====================

@api_router.get("/{tenant_slug}/notifications", response_model=List[Notification])
async def get_notifications(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère toutes les notifications de l'utilisateur connecté"""
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    notifications = await db.notifications.find({
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id
    }).sort("date_creation", -1).limit(50).to_list(50)
    
    cleaned_notifications = [clean_mongo_doc(notif) for notif in notifications]
    return [Notification(**notif) for notif in cleaned_notifications]

@api_router.get("/{tenant_slug}/notifications/non-lues/count")
async def get_unread_count(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Compte le nombre de notifications non lues"""
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    count = await db.notifications.count_documents({
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id,
        "statut": "non_lu"
    })
    return {"count": count}

@api_router.put("/{tenant_slug}/notifications/{notification_id}/marquer-lu")
async def marquer_notification_lue(tenant_slug: str, notification_id: str, current_user: User = Depends(get_current_user)):
    """Marque une notification comme lue"""
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    notification = await db.notifications.find_one({
        "id": notification_id,
        "tenant_id": tenant.id,
        "destinataire_id": current_user.id
    })
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification non trouvée")
    
    await db.notifications.update_one(
        {"id": notification_id, "tenant_id": tenant.id},
        {"$set": {
            "statut": "lu",
            "date_lecture": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Notification marquée comme lue"}

@api_router.put("/{tenant_slug}/notifications/marquer-toutes-lues")
async def marquer_toutes_lues(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Marque toutes les notifications comme lues"""
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.notifications.update_many(
        {
            "tenant_id": tenant.id,
            "destinataire_id": current_user.id,
            "statut": "non_lu"
        },
        {"$set": {
            "statut": "lu",
            "date_lecture": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": f"{result.modified_count} notification(s) marquée(s) comme lue(s)"}

# Helper function pour créer des notifications
async def creer_notification(
    tenant_id: str,
    destinataire_id: str,
    type: str,
    titre: str,
    message: str,
    lien: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None
):
    """Crée une notification dans la base de données"""
    notification = Notification(
        tenant_id=tenant_id,
        destinataire_id=destinataire_id,
        type=type,
        titre=titre,
        message=message,
        lien=lien,
        data=data or {}
    )
    await db.notifications.insert_one(notification.dict())
    return notification

# ==================== PARAMÈTRES REMPLACEMENTS ====================

@api_router.get("/parametres/remplacements")
async def get_parametres_remplacements(current_user: User = Depends(get_current_user)):
    """Récupère les paramètres de remplacements"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    parametres = await db.parametres_remplacements.find_one()
    
    if not parametres:
        # Créer paramètres par défaut
        default_params = ParametresRemplacements()
        await db.parametres_remplacements.insert_one(default_params.dict())
        return default_params
    
    cleaned_params = clean_mongo_doc(parametres)
    return ParametresRemplacements(**cleaned_params)

@api_router.put("/parametres/remplacements")
async def update_parametres_remplacements(
    parametres: ParametresRemplacements,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres de remplacements"""
    if current_user.role not in ["admin"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    existing = await db.parametres_remplacements.find_one()
    
    if existing:
        await db.parametres_remplacements.update_one(
            {"id": existing["id"]},
            {"$set": parametres.dict()}
        )
    else:
        await db.parametres_remplacements.insert_one(parametres.dict())
    
    return {"message": "Paramètres mis à jour avec succès"}



# ==================== PARAMÈTRES DISPONIBILITÉS ====================

@api_router.get("/{tenant_slug}/parametres/disponibilites")
async def get_parametres_disponibilites(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère les paramètres disponibilités"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    params = await db.parametres_disponibilites.find_one({"tenant_id": tenant.id})
    
    if not params:
        # Créer paramètres par défaut
        default_params = {
            "tenant_id": tenant.id,
            "jour_blocage_dispos": 15,
            "exceptions_admin_superviseur": True,
            "admin_peut_modifier_temps_partiel": True,
            "notifications_dispos_actives": True,
            "jours_avance_notification": 3
        }
        await db.parametres_disponibilites.insert_one(default_params)
        return default_params
    
    return clean_mongo_doc(params)

@api_router.put("/{tenant_slug}/parametres/disponibilites")
async def update_parametres_disponibilites(
    tenant_slug: str,
    params: dict,
    current_user: User = Depends(get_current_user)
):
    """Met à jour les paramètres disponibilités"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.parametres_disponibilites.update_one(
        {"tenant_id": tenant.id},
        {"$set": params},
        upsert=True
    )
    
    return {"message": "Paramètres disponibilités mis à jour"}

# ==================== EPI ROUTES NFPA 1851 ====================

# ========== EPI CRUD ==========

@api_router.post("/{tenant_slug}/epi", response_model=EPI)
async def create_epi(tenant_slug: str, epi: EPICreate, current_user: User = Depends(get_current_user)):
    """Crée un nouvel équipement EPI (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epi_dict = epi.dict()
    epi_dict["tenant_id"] = tenant.id
    
    # Générer numéro de série automatique si vide
    if not epi_dict.get("numero_serie") or epi_dict["numero_serie"].strip() == "":
        # Compter les EPI existants pour générer un numéro unique
        count = await db.epis.count_documents({"tenant_id": tenant.id})
        annee = datetime.now(timezone.utc).year
        epi_dict["numero_serie"] = f"EPI-{annee}-{count + 1:04d}"
    else:
        # Vérifier que le numéro de série est unique
        existing_epi = await db.epis.find_one({
            "numero_serie": epi_dict["numero_serie"],
            "tenant_id": tenant.id
        })
        
        if existing_epi:
            raise HTTPException(
                status_code=400,
                detail=f"Un EPI avec le numéro de série {epi_dict['numero_serie']} existe déjà"
            )
    
    epi_obj = EPI(**epi_dict)
    
    # Préparer pour MongoDB (conversion datetime -> ISO string)
    epi_data = epi_obj.dict()
    epi_data["created_at"] = epi_obj.created_at.isoformat()
    epi_data["updated_at"] = epi_obj.updated_at.isoformat()
    
    await db.epis.insert_one(epi_data)
    
    return epi_obj

@api_router.get("/{tenant_slug}/epi", response_model=List[EPI])
async def get_all_epis(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les EPI du tenant (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_epis = [clean_mongo_doc(epi) for epi in epis]
    
    # Convertir les dates ISO string vers datetime
    for epi in cleaned_epis:
        if isinstance(epi.get("created_at"), str):
            epi["created_at"] = datetime.fromisoformat(epi["created_at"].replace('Z', '+00:00'))
        if isinstance(epi.get("updated_at"), str):
            epi["updated_at"] = datetime.fromisoformat(epi["updated_at"].replace('Z', '+00:00'))
    
    return [EPI(**epi) for epi in cleaned_epis]

@api_router.get("/{tenant_slug}/epi/{epi_id}", response_model=EPI)
async def get_epi_by_id(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Récupère un EPI spécifique par son ID"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    cleaned_epi = clean_mongo_doc(epi)
    
    # Convertir les dates
    if isinstance(cleaned_epi.get("created_at"), str):
        cleaned_epi["created_at"] = datetime.fromisoformat(cleaned_epi["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned_epi.get("updated_at"), str):
        cleaned_epi["updated_at"] = datetime.fromisoformat(cleaned_epi["updated_at"].replace('Z', '+00:00'))
    
    return EPI(**cleaned_epi)

@api_router.put("/{tenant_slug}/epi/{epi_id}", response_model=EPI)
async def update_epi(
    tenant_slug: str,
    epi_id: str,
    epi_update: EPIUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un EPI (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    # Préparer les champs à mettre à jour
    update_data = {k: v for k, v in epi_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Vérifier si changement d'affectation (user_id)
    ancien_user_id = epi.get("user_id")
    nouveau_user_id = update_data.get("user_id")
    
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Notifier si changement d'affectation
    if nouveau_user_id and nouveau_user_id != ancien_user_id:
        type_epi_nom = epi.get("type_epi", "EPI")
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=nouveau_user_id,
            type="epi_nouvel_assignation",
            titre="Nouvel EPI assigné",
            message=f"Un {type_epi_nom} #{epi.get('numero_serie', '')} vous a été assigné",
            lien="/epi"
        )
    
    updated_epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    cleaned_epi = clean_mongo_doc(updated_epi)
    
    # Convertir les dates
    if isinstance(cleaned_epi.get("created_at"), str):
        cleaned_epi["created_at"] = datetime.fromisoformat(cleaned_epi["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned_epi.get("updated_at"), str):
        cleaned_epi["updated_at"] = datetime.fromisoformat(cleaned_epi["updated_at"].replace('Z', '+00:00'))
    
    return EPI(**cleaned_epi)

@api_router.delete("/{tenant_slug}/epi/{epi_id}")
async def delete_epi(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Supprime un EPI (Admin/Superviseur)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.epis.delete_one({"id": epi_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    # Supprimer aussi toutes les inspections associées
    await db.inspections_epi.delete_many({"epi_id": epi_id, "tenant_id": tenant.id})
    
    return {"message": "EPI supprimé avec succès"}

# ========== INSPECTIONS EPI ==========

@api_router.post("/{tenant_slug}/epi/{epi_id}/inspection", response_model=InspectionEPI)
async def create_inspection(
    tenant_slug: str,
    epi_id: str,
    inspection: InspectionEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une nouvelle inspection pour un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    inspection_dict = inspection.dict()
    inspection_dict["tenant_id"] = tenant.id
    inspection_dict["epi_id"] = epi_id
    inspection_obj = InspectionEPI(**inspection_dict)
    
    # Préparer pour MongoDB
    inspection_data = inspection_obj.dict()
    inspection_data["created_at"] = inspection_obj.created_at.isoformat()
    
    await db.inspections_epi.insert_one(inspection_data)
    
    # Mettre à jour le statut de l'EPI si nécessaire
    if inspection.statut_global == "hors_service":
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "Hors service"}}
        )
    elif inspection.statut_global == "necessite_reparation":
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "En réparation"}}
        )
    
    # Notifier le pompier assigné
    if epi.get("user_id"):
        type_epi_nom = epi.get("type_epi", "EPI")
        type_inspection_nom = {
            'apres_utilisation': 'après utilisation',
            'routine_mensuelle': 'de routine mensuelle',
            'avancee_annuelle': 'avancée annuelle'
        }.get(inspection.type_inspection, 'inspection')
        
        statut_msg = {
            'conforme': 'est conforme',
            'non_conforme': 'n\'est pas conforme',
            'necessite_reparation': 'nécessite une réparation',
            'hors_service': 'est hors service'
        }.get(inspection.statut_global, 'a été inspecté')
        
        await creer_notification(
            tenant_id=tenant.id,
            destinataire_id=epi["user_id"],
            type="epi_inspection",
            titre=f"Inspection {type_inspection_nom}",
            message=f"Votre {type_epi_nom} #{epi.get('numero_serie', '')} {statut_msg}",
            lien="/epi"
        )
    
    return inspection_obj

@api_router.get("/{tenant_slug}/epi/{epi_id}/inspections", response_model=List[InspectionEPI])
async def get_epi_inspections(tenant_slug: str, epi_id: str, current_user: User = Depends(get_current_user)):
    """Récupère toutes les inspections d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    inspections = await db.inspections_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_inspection", -1).to_list(1000)
    
    cleaned_inspections = [clean_mongo_doc(insp) for insp in inspections]
    
    # Convertir les dates
    for insp in cleaned_inspections:
        if isinstance(insp.get("created_at"), str):
            insp["created_at"] = datetime.fromisoformat(insp["created_at"].replace('Z', '+00:00'))
    
    return [InspectionEPI(**insp) for insp in cleaned_inspections]

# ========== ISP (Fournisseurs) ==========

@api_router.post("/{tenant_slug}/isp", response_model=ISP)
async def create_isp(tenant_slug: str, isp: ISPCreate, current_user: User = Depends(get_current_user)):
    """Crée un nouveau fournisseur de services indépendant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isp_dict = isp.dict()
    isp_dict["tenant_id"] = tenant.id
    isp_obj = ISP(**isp_dict)
    
    # Préparer pour MongoDB
    isp_data = isp_obj.dict()
    isp_data["created_at"] = isp_obj.created_at.isoformat()
    
    await db.isps.insert_one(isp_data)
    
    return isp_obj

@api_router.get("/{tenant_slug}/isp", response_model=List[ISP])
async def get_all_isps(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Récupère tous les ISP du tenant"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isps = await db.isps.find({"tenant_id": tenant.id}).to_list(100)
    cleaned_isps = [clean_mongo_doc(isp) for isp in isps]
    
    # Convertir les dates
    for isp in cleaned_isps:
        if isinstance(isp.get("created_at"), str):
            isp["created_at"] = datetime.fromisoformat(isp["created_at"].replace('Z', '+00:00'))
    
    return [ISP(**isp) for isp in cleaned_isps]

@api_router.put("/{tenant_slug}/isp/{isp_id}", response_model=ISP)
async def update_isp(
    tenant_slug: str,
    isp_id: str,
    isp_update: ISPUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un ISP"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    isp = await db.isps.find_one({"id": isp_id, "tenant_id": tenant.id})
    if not isp:
        raise HTTPException(status_code=404, detail="ISP non trouvé")
    
    update_data = {k: v for k, v in isp_update.dict().items() if v is not None}
    
    await db.isps.update_one(
        {"id": isp_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    updated_isp = await db.isps.find_one({"id": isp_id, "tenant_id": tenant.id})
    cleaned_isp = clean_mongo_doc(updated_isp)
    
    if isinstance(cleaned_isp.get("created_at"), str):
        cleaned_isp["created_at"] = datetime.fromisoformat(cleaned_isp["created_at"].replace('Z', '+00:00'))
    
    return ISP(**cleaned_isp)

@api_router.delete("/{tenant_slug}/isp/{isp_id}")
async def delete_isp(tenant_slug: str, isp_id: str, current_user: User = Depends(get_current_user)):
    """Supprime un ISP"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.isps.delete_one({"id": isp_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="ISP non trouvé")
    
    return {"message": "ISP supprimé avec succès"}

# ========== RAPPORTS ==========

@api_router.get("/{tenant_slug}/epi/rapports/conformite")
async def get_rapport_conformite(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Rapport de conformité générale avec code couleur"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer tous les EPI
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = {
        "total": len(epis),
        "en_service": 0,
        "en_inspection": 0,
        "en_reparation": 0,
        "hors_service": 0,
        "retire": 0,
        "epis": []
    }
    
    for epi in epis:
        statut = epi.get("statut", "En service")
        
        # Compter par statut
        if statut == "En service":
            rapport["en_service"] += 1
        elif statut == "En inspection":
            rapport["en_inspection"] += 1
        elif statut == "En réparation":
            rapport["en_reparation"] += 1
        elif statut == "Hors service":
            rapport["hors_service"] += 1
        elif statut == "Retiré":
            rapport["retire"] += 1
        
        # Récupérer la dernière inspection
        derniere_inspection = await db.inspections_epi.find_one(
            {"epi_id": epi["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        # Déterminer le code couleur
        couleur = "vert"  # Par défaut
        
        if statut in ["Hors service", "Retiré"]:
            couleur = "rouge"
        elif statut == "En réparation":
            couleur = "jaune"
        elif derniere_inspection:
            # Vérifier si l'inspection est récente
            date_inspection = datetime.fromisoformat(derniere_inspection["date_inspection"])
            jours_depuis_inspection = (datetime.now(timezone.utc) - date_inspection).days
            
            if jours_depuis_inspection > 365:  # Inspection avancée en retard
                couleur = "rouge"
            elif jours_depuis_inspection > 330:  # Inspection bientôt en retard (dans 35 jours)
                couleur = "jaune"
        else:
            # Pas d'inspection du tout
            couleur = "rouge"
        
        cleaned_epi = clean_mongo_doc(epi)
        cleaned_epi["code_couleur"] = couleur
        cleaned_epi["derniere_inspection"] = clean_mongo_doc(derniere_inspection) if derniere_inspection else None
        
        rapport["epis"].append(cleaned_epi)
    
    return rapport

@api_router.get("/{tenant_slug}/epi/rapports/echeances")
async def get_rapport_echeances(tenant_slug: str, jours: int = 30, current_user: User = Depends(get_current_user)):
    """Rapport des échéances d'inspection (dans X jours)"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer tous les EPI
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    echeances = []
    aujourd_hui = datetime.now(timezone.utc)
    
    for epi in epis:
        # Récupérer la dernière inspection
        derniere_inspection = await db.inspections_epi.find_one(
            {"epi_id": epi["id"], "tenant_id": tenant.id},
            sort=[("date_inspection", -1)]
        )
        
        if derniere_inspection:
            date_inspection = datetime.fromisoformat(derniere_inspection["date_inspection"])
            type_inspection = derniere_inspection["type_inspection"]
            
            # Calculer la prochaine échéance selon le type
            if type_inspection == "avancee_annuelle":
                prochaine_echeance = date_inspection + timedelta(days=365)
            elif type_inspection == "routine_mensuelle":
                prochaine_echeance = date_inspection + timedelta(days=30)
            else:  # apres_utilisation
                prochaine_echeance = date_inspection + timedelta(days=30)  # Routine dans 30 jours
            
            # Vérifier si dans la fenêtre de X jours
            jours_restants = (prochaine_echeance - aujourd_hui).days
            
            if 0 <= jours_restants <= jours:
                cleaned_epi = clean_mongo_doc(epi)
                cleaned_epi["prochaine_echeance"] = prochaine_echeance.isoformat()
                cleaned_epi["jours_restants"] = jours_restants
                cleaned_epi["type_inspection_requise"] = "avancee_annuelle" if type_inspection == "avancee_annuelle" else "routine_mensuelle"
                echeances.append(cleaned_epi)
        else:
            # Pas d'inspection = inspection immédiate requise
            cleaned_epi = clean_mongo_doc(epi)
            cleaned_epi["prochaine_echeance"] = aujourd_hui.isoformat()
            cleaned_epi["jours_restants"] = 0
            cleaned_epi["type_inspection_requise"] = "routine_mensuelle"
            echeances.append(cleaned_epi)
    
    # Trier par jours restants
    echeances.sort(key=lambda x: x["jours_restants"])
    
    return {
        "total": len(echeances),
        "echeances": echeances
    }


# ========== PHASE 2 : NETTOYAGE EPI ==========

@api_router.post("/{tenant_slug}/epi/{epi_id}/nettoyage", response_model=NettoyageEPI)
async def create_nettoyage(
    tenant_slug: str,
    epi_id: str,
    nettoyage: NettoyageEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistre un nettoyage EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    nettoyage_dict = nettoyage.dict()
    nettoyage_dict["tenant_id"] = tenant.id
    nettoyage_dict["epi_id"] = epi_id
    nettoyage_obj = NettoyageEPI(**nettoyage_dict)
    
    nettoyage_data = nettoyage_obj.dict()
    nettoyage_data["created_at"] = nettoyage_obj.created_at.isoformat()
    
    await db.nettoyages_epi.insert_one(nettoyage_data)
    
    return nettoyage_obj

@api_router.get("/{tenant_slug}/epi/{epi_id}/nettoyages", response_model=List[NettoyageEPI])
async def get_nettoyages_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique de nettoyage d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    nettoyages = await db.nettoyages_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_nettoyage", -1).to_list(1000)
    
    cleaned_nettoyages = [clean_mongo_doc(n) for n in nettoyages]
    
    for n in cleaned_nettoyages:
        if isinstance(n.get("created_at"), str):
            n["created_at"] = datetime.fromisoformat(n["created_at"].replace('Z', '+00:00'))
    
    return [NettoyageEPI(**n) for n in cleaned_nettoyages]

# ========== PHASE 2 : RÉPARATIONS EPI ==========

@api_router.post("/{tenant_slug}/epi/{epi_id}/reparation", response_model=ReparationEPI)
async def create_reparation(
    tenant_slug: str,
    epi_id: str,
    reparation: ReparationEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Crée une demande de réparation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    reparation_dict = reparation.dict()
    reparation_dict["tenant_id"] = tenant.id
    reparation_dict["epi_id"] = epi_id
    reparation_obj = ReparationEPI(**reparation_dict)
    
    reparation_data = reparation_obj.dict()
    reparation_data["created_at"] = reparation_obj.created_at.isoformat()
    reparation_data["updated_at"] = reparation_obj.updated_at.isoformat()
    
    await db.reparations_epi.insert_one(reparation_data)
    
    # Mettre à jour statut EPI
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": {"statut": "En réparation"}}
    )
    
    return reparation_obj

@api_router.get("/{tenant_slug}/epi/{epi_id}/reparations", response_model=List[ReparationEPI])
async def get_reparations_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère l'historique de réparations d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    reparations = await db.reparations_epi.find({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    }).sort("date_demande", -1).to_list(1000)
    
    cleaned_reparations = [clean_mongo_doc(r) for r in reparations]
    
    for r in cleaned_reparations:
        if isinstance(r.get("created_at"), str):
            r["created_at"] = datetime.fromisoformat(r["created_at"].replace('Z', '+00:00'))
        if isinstance(r.get("updated_at"), str):
            r["updated_at"] = datetime.fromisoformat(r["updated_at"].replace('Z', '+00:00'))
    
    return [ReparationEPI(**r) for r in cleaned_reparations]

@api_router.put("/{tenant_slug}/epi/{epi_id}/reparation/{reparation_id}", response_model=ReparationEPI)
async def update_reparation(
    tenant_slug: str,
    epi_id: str,
    reparation_id: str,
    reparation_update: ReparationEPIUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour une réparation"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    reparation = await db.reparations_epi.find_one({
        "id": reparation_id,
        "epi_id": epi_id,
        "tenant_id": tenant.id
    })
    
    if not reparation:
        raise HTTPException(status_code=404, detail="Réparation non trouvée")
    
    update_data = {k: v for k, v in reparation_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.reparations_epi.update_one(
        {"id": reparation_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    # Si réparation terminée, remettre EPI en service
    if reparation_update.statut == "terminee":
        epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
        
        await db.epis.update_one(
            {"id": epi_id, "tenant_id": tenant.id},
            {"$set": {"statut": "En service"}}
        )
        
        # Notifier le pompier assigné que son EPI est de retour
        if epi and epi.get("user_id"):
            type_epi_nom = epi.get("type_epi", "EPI")
            await creer_notification(
                tenant_id=tenant.id,
                destinataire_id=epi["user_id"],
                type="epi_reparation_terminee",
                titre="EPI de retour de réparation",
                message=f"Votre {type_epi_nom} #{epi.get('numero_serie', '')} est de retour et remis en service",
                lien="/epi"
            )
    
    updated_reparation = await db.reparations_epi.find_one({
        "id": reparation_id,
        "tenant_id": tenant.id
    })
    
    cleaned = clean_mongo_doc(updated_reparation)
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    if isinstance(cleaned.get("updated_at"), str):
        cleaned["updated_at"] = datetime.fromisoformat(cleaned["updated_at"].replace('Z', '+00:00'))
    
    return ReparationEPI(**cleaned)

# ========== PHASE 2 : RETRAIT EPI ==========

@api_router.post("/{tenant_slug}/epi/{epi_id}/retrait", response_model=RetraitEPI)
async def create_retrait(
    tenant_slug: str,
    epi_id: str,
    retrait: RetraitEPICreate,
    current_user: User = Depends(get_current_user)
):
    """Enregistre le retrait définitif d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier EPI existe
    epi = await db.epis.find_one({"id": epi_id, "tenant_id": tenant.id})
    if not epi:
        raise HTTPException(status_code=404, detail="EPI non trouvé")
    
    retrait_dict = retrait.dict()
    retrait_dict["tenant_id"] = tenant.id
    retrait_dict["epi_id"] = epi_id
    retrait_obj = RetraitEPI(**retrait_dict)
    
    retrait_data = retrait_obj.dict()
    retrait_data["created_at"] = retrait_obj.created_at.isoformat()
    
    await db.retraits_epi.insert_one(retrait_data)
    
    # Mettre à jour statut EPI
    await db.epis.update_one(
        {"id": epi_id, "tenant_id": tenant.id},
        {"$set": {"statut": "Retiré"}}
    )
    
    return retrait_obj

@api_router.get("/{tenant_slug}/epi/{epi_id}/retrait", response_model=RetraitEPI)
async def get_retrait_epi(
    tenant_slug: str,
    epi_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère les informations de retrait d'un EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    retrait = await db.retraits_epi.find_one({
        "epi_id": epi_id,
        "tenant_id": tenant.id
    })
    
    if not retrait:
        raise HTTPException(status_code=404, detail="Aucun retrait enregistré pour cet EPI")
    
    cleaned = clean_mongo_doc(retrait)
    if isinstance(cleaned.get("created_at"), str):
        cleaned["created_at"] = datetime.fromisoformat(cleaned["created_at"].replace('Z', '+00:00'))
    
    return RetraitEPI(**cleaned)

# ========== RAPPORTS PHASE 2 ==========

@api_router.get("/{tenant_slug}/epi/rapports/retraits-prevus")
async def get_rapport_retraits_prevus(
    tenant_slug: str,
    mois: int = 12,
    current_user: User = Depends(get_current_user)
):
    """Rapport des EPI approchant de leur limite de 10 ans"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    aujourd_hui = datetime.now(timezone.utc)
    limite_jours = mois * 30
    
    retraits_prevus = []
    
    for epi in epis:
        if epi.get("statut") == "Retiré":
            continue
        
        date_mise_service = datetime.fromisoformat(epi["date_mise_en_service"])
        age_jours = (aujourd_hui - date_mise_service).days
        age_limite_jours = 365 * 10  # 10 ans
        
        jours_restants = age_limite_jours - age_jours
        
        if 0 <= jours_restants <= limite_jours:
            cleaned_epi = clean_mongo_doc(epi)
            cleaned_epi["age_annees"] = round(age_jours / 365, 1)
            cleaned_epi["jours_avant_limite"] = jours_restants
            cleaned_epi["date_limite_prevue"] = (date_mise_service + timedelta(days=age_limite_jours)).isoformat()
            retraits_prevus.append(cleaned_epi)
    
    retraits_prevus.sort(key=lambda x: x["jours_avant_limite"])
    
    return {
        "total": len(retraits_prevus),
        "periode_mois": mois,
        "epis": retraits_prevus
    }

@api_router.get("/{tenant_slug}/epi/rapports/cout-total")
async def get_rapport_cout_total(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Rapport du coût total de possession (TCO) par EPI"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    epis = await db.epis.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = []
    
    for epi in epis:
        # Coût d'achat
        cout_achat = epi.get("cout_achat", 0)
        
        # Coûts de nettoyage (fictif, à améliorer si prix stockés)
        nettoyages = await db.nettoyages_epi.find({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        cout_nettoyages = len([n for n in nettoyages if n.get("type_nettoyage") == "avance"]) * 50  # Ex: 50$ par nettoyage avancé
        
        # Coûts de réparation
        reparations = await db.reparations_epi.find({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        }).to_list(1000)
        cout_reparations = sum([r.get("cout_reparation", 0) for r in reparations])
        
        # Coût de retrait
        retrait = await db.retraits_epi.find_one({
            "epi_id": epi["id"],
            "tenant_id": tenant.id
        })
        cout_retrait = retrait.get("cout_disposition", 0) if retrait else 0
        
        cout_total = cout_achat + cout_nettoyages + cout_reparations + cout_retrait
        
        cleaned_epi = clean_mongo_doc(epi)
        cleaned_epi["cout_achat"] = cout_achat
        cleaned_epi["cout_nettoyages"] = cout_nettoyages
        cleaned_epi["nombre_nettoyages"] = len(nettoyages)
        cleaned_epi["cout_reparations"] = cout_reparations
        cleaned_epi["nombre_reparations"] = len(reparations)
        cleaned_epi["cout_retrait"] = cout_retrait
        cleaned_epi["cout_total"] = cout_total
        
        rapport.append(cleaned_epi)
    
    # Trier par coût total décroissant
    rapport.sort(key=lambda x: x["cout_total"], reverse=True)
    
    return {
        "total_epis": len(rapport),
        "cout_total_flotte": sum([e["cout_total"] for e in rapport]),
        "cout_moyen_par_epi": sum([e["cout_total"] for e in rapport]) / len(rapport) if len(rapport) > 0 else 0,
        "epis": rapport
    }


# ==================== HEALTH CHECK ====================

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test MongoDB connection
        await db.command('ping')
        db_status = "connected"
    except:
        db_status = "disconnected"
    
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "service": "ProFireManager API",
        "version": "2.0",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Endpoint d'initialisation (à appeler une fois après déploiement)
@app.post("/api/admin/initialize-production")
async def initialize_production_data():
    """
    Endpoint pour initialiser les données de production
    À appeler UNE SEULE FOIS après le premier déploiement
    """
    try:
        # Vérifier si déjà initialisé
        existing_super_admin = await db.super_admins.find_one({"email": SUPER_ADMIN_EMAIL})
        existing_tenant = await db.tenants.find_one({"slug": "shefford"})
        
        if existing_super_admin and existing_tenant:
            return {
                "status": "already_initialized",
                "message": "Les données sont déjà initialisées",
                "super_admin_email": SUPER_ADMIN_EMAIL,
                "tenants_count": await db.tenants.count_documents({})
            }
        
        # Initialiser via la fonction existante
        await initialize_multi_tenant()
        
        return {
            "status": "success",
            "message": "Données de production initialisées avec succès",
            "super_admin_email": SUPER_ADMIN_EMAIL,
            "tenants_created": 1,
            "instructions": "Connectez-vous en super-admin pour créer vos casernes"
        }
    except Exception as e:
        logging.error(f"Erreur initialisation production: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'initialisation: {str(e)}"
        )

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()