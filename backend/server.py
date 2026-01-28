from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Body, UploadFile, File, Request
from fastapi.responses import Response, StreamingResponse, RedirectResponse
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
from datetime import datetime, timezone, timedelta, date
import jwt
import json
import hashlib
import re
import bcrypt
import time
import stripe
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
import base64
from io import BytesIO as IOBytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from io import BytesIO
import base64
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import resend
import firebase_admin
from firebase_admin import credentials, messaging
import qrcode
from pwa_manifest import pwa_router
from routes.dsi import router as dsi_router
from routes.dsi_transmissions import router as dsi_transmissions_router
from routes.personnel import router as personnel_router
from routes.actifs import router as actifs_router
from routes.formations import router as formations_router
from routes.equipements import router as equipements_router
from routes.prevention import router as prevention_router
from routes.planning import router as planning_router
from routes.sftp import router as sftp_router
from routes.billing import router as billing_router
from routes.admin import router as admin_router
from routes.debogage import router as debogage_router
from routes.paie_complet import router as paie_complet_router
from routes.interventions import router as interventions_router
from routes.apria import router as apria_router
from routes.epi import router as epi_router
from routes.competences_grades import router as competences_grades_router
from routes.types_garde import router as types_garde_router
from routes.dashboard_messages import router as dashboard_messages_router
from routes.conges import router as conges_router
from routes.notifications import router as notifications_router
from routes.personnalisation import router as personnalisation_router
from routes.materiel import router as materiel_router
from routes.bornes_seches import router as bornes_seches_router
from routes.points_eau import router as points_eau_router
from routes.remplacements import router as remplacements_router
from routes.equipes_garde import router as equipes_garde_router
from routes.inventaires_vehicules import router as inventaires_vehicules_router
from routes.rondes_securite import router as rondes_securite_router
from routes.parametres_disponibilites import router as parametres_disponibilites_router
from routes.generation_indisponibilites import router as generation_indisponibilites_router
from routes.equipements_exports import router as equipements_exports_router
from routes.users import router as users_router
from routes.disponibilites import router as disponibilites_router
from routes.auth import router as auth_router
from routes.approvisionnement_eau import router as approvisionnement_eau_router
from routes.validations_competences import router as validations_competences_router
from routes.parametres import router as parametres_router
from routes.statistiques import router as statistiques_router
from io import BytesIO
import base64
from PIL import Image as PILImage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configuration Stripe
stripe.api_key = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')

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
    serverSelectionTimeoutMS=30000,  # 30 secondes pour sélection serveur (distance Oregon-Virginie)
    connectTimeoutMS=30000,          # 30 secondes pour connexion initiale
    socketTimeoutMS=60000,           # 60 secondes pour opérations (documents avec photos base64)
    maxPoolSize=50,                  # Pool de connexions pour réutilisation
    minPoolSize=10,                  # Connexions permanentes
    maxIdleTimeMS=45000,             # Garder connexions inactives 45s
    retryWrites=True,                # Retry automatique en cas d'échec
    retryReads=True                  # Retry automatique en lecture
)

# Extraire le nom de la base de données depuis MONGO_URL ou utiliser un défaut
db_name = os.environ.get('DB_NAME', 'profiremanager')
db = client[db_name]

# Create the main app without a prefix
app = FastAPI(title="ProFireManager API", version="2.0")

# Health check endpoint pour Render (root path)
@app.get("/")
@app.head("/")
async def root_health_check():
    """Health check endpoint pour les services de monitoring (Render, etc.)"""
    return {"status": "healthy", "service": "ProFireManager API", "version": "2.0"}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== HELPERS ====================

def clean_mongo_doc(doc):
    """Remove MongoDB ObjectId and other non-serializable fields"""
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc

def is_temps_partiel(user: dict) -> bool:
    """Vérifie si un employé est temps partiel ou temporaire (traités de la même façon)"""
    type_emploi = user.get("type_emploi", "temps_plein")
    return type_emploi in ("temps_partiel", "temporaire")

def is_temps_plein(user: dict) -> bool:
    """Vérifie si un employé est temps plein"""
    return user.get("type_emploi", "temps_plein") == "temps_plein"

# ==================== FIREBASE INITIALIZATION ====================

# Initialiser Firebase Admin
# Option 1: Via variable d'environnement FIREBASE_CREDENTIALS (JSON en base64)
# Option 2: Via fichier firebase-credentials.json (pour développement local)
firebase_credentials_env = os.environ.get('FIREBASE_CREDENTIALS')
firebase_cred_path = ROOT_DIR / 'firebase-credentials.json'

if firebase_credentials_env:
    try:
        import base64
        import json
        # Décoder les credentials depuis la variable d'environnement (base64)
        cred_json = base64.b64decode(firebase_credentials_env).decode('utf-8')
        cred_dict = json.loads(cred_json)
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized from environment variable")
    except Exception as e:
        print(f"⚠️ Firebase initialization error (env): {e}")
elif firebase_cred_path.exists():
    try:
        cred = credentials.Certificate(str(firebase_cred_path))
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized from file")
    except Exception as e:
        print(f"⚠️ Firebase initialization error (file): {e}")
else:
    print("ℹ️ Firebase credentials not configured - Push notifications disabled (optional feature)")

# ==================== INITIALIZATION ====================

async def create_database_indexes():
    """Créer les index MongoDB pour optimiser les performances"""
    async def safe_create_index(collection, keys, **kwargs):
        """Créer un index en ignorant les erreurs si l'index existe déjà"""
        try:
            await collection.create_index(keys, background=True, **kwargs)
        except Exception as e:
            # Ignorer l'erreur si l'index existe déjà (code 85 ou 86)
            if "IndexKeySpecsConflict" not in str(e) and "index already exists" not in str(e).lower():
                print(f"⚠️ Index creation warning: {e}")
    
    try:
        # Index pour les tenants (CRITIQUE - appelé à chaque requête)
        await safe_create_index(db.tenants, [("slug", 1)])
        await safe_create_index(db.tenants, [("slug", 1), ("actif", 1)])
        
        # Index pour les notifications (CRITIQUE pour la performance)
        await safe_create_index(db.notifications, [
            ("tenant_id", 1),
            ("destinataire_id", 1),
            ("statut", 1)
        ])
        await safe_create_index(db.notifications, [("date_creation", -1)])
        
        # Index pour les utilisateurs (CRITIQUE - chargement dashboard)
        await safe_create_index(db.users, [("tenant_id", 1)])
        await safe_create_index(db.users, [("tenant_id", 1), ("email", 1)])
        await safe_create_index(db.users, [("tenant_id", 1), ("statut", 1)])
        
        # Index pour les types de garde (chargement dashboard)
        await safe_create_index(db.types_garde, [("tenant_id", 1)])
        
        # Index pour les assignations (planning)
        await safe_create_index(db.assignations, [("tenant_id", 1), ("user_id", 1)])
        await safe_create_index(db.assignations, [("tenant_id", 1), ("semaine_debut", 1)])
        await safe_create_index(db.assignations, [("semaine_debut", 1)])
        
        # Index pour le planning
        await safe_create_index(db.planning, [("tenant_id", 1), ("semaine_debut", 1)])
        
        # Index pour les disponibilités
        await safe_create_index(db.disponibilites, [("tenant_id", 1), ("user_id", 1)])
        await safe_create_index(db.disponibilites, [("tenant_id", 1), ("date", 1)])
        
        # Index pour les bâtiments (prévention)
        await safe_create_index(db.batiments, [("tenant_id", 1)])
        await safe_create_index(db.batiments, [("tenant_id", 1), ("niveau_risque", 1)])
        
        # Index pour les formations
        await safe_create_index(db.formations, [("tenant_id", 1)])
        
        # Index pour prévention - préventionnistes
        await safe_create_index(db.batiments, [("tenant_id", 1), ("preventionniste_assigne_id", 1)])
        await safe_create_index(db.secteurs_geographiques, [("tenant_id", 1), ("preventionniste_assigne_id", 1)])
        await safe_create_index(db.inspections, [("tenant_id", 1), ("preventionniste_id", 1)])
        await safe_create_index(db.inspections, [("tenant_id", 1), ("date_inspection", 1)])
        await safe_create_index(db.plans_intervention, [("tenant_id", 1), ("created_by", 1)])
        
        # Index pour rapports externes - budgets
        await safe_create_index(db.budgets, [("tenant_id", 1), ("annee", 1)])
        await safe_create_index(db.immobilisations, [("tenant_id", 1)])
        await safe_create_index(db.immobilisations, [("tenant_id", 1), ("type", 1)])
        
        # Index pour dashboard - CRITIQUE pour performance
        await safe_create_index(db.assignations, [("tenant_id", 1), ("user_id", 1), ("date", 1)])
        await safe_create_index(db.inscriptions_formations, [("tenant_id", 1), ("user_id", 1)])
        await safe_create_index(db.inscriptions_formations, [("formation_id", 1)])
        await safe_create_index(db.formations, [("tenant_id", 1), ("date_debut", 1)])
        await safe_create_index(db.activites, [("tenant_id", 1), ("created_at", -1)])
        await safe_create_index(db.activites, [("tenant_id", 1), ("user_id", 1)])
        await safe_create_index(db.activites, [("tenant_id", 1), ("type_activite", 1)])
        
        print("✅ Index MongoDB créés avec succès (optimisations complètes)")
    except Exception as e:
        print(f"⚠️ Erreur création index: {e}")

async def initialize_multi_tenant():
    """Initialize super admin and default tenant on first run"""
    # Créer les index MongoDB pour les performances
    await create_database_indexes()
    
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

async def initialize_default_grades():
    """Initialise les grades par défaut pour chaque tenant s'ils n'existent pas"""
    try:
        tenants = await db.tenants.find({}).to_list(1000)
        
        default_grades = [
            {"nom": "Pompier", "niveau_hierarchique": 1},
            {"nom": "Lieutenant", "niveau_hierarchique": 2},
            {"nom": "Capitaine", "niveau_hierarchique": 3},
            {"nom": "Directeur", "niveau_hierarchique": 4}
        ]
        
        for tenant in tenants:
            tenant_id = tenant.get('id')
            if not tenant_id:
                continue
            
            # Vérifier si des grades existent déjà pour ce tenant
            existing_count = await db.grades.count_documents({"tenant_id": tenant_id})
            
            if existing_count == 0:
                # Créer les grades par défaut
                for grade_data in default_grades:
                    grade = Grade(
                        tenant_id=tenant_id,
                        nom=grade_data["nom"],
                        niveau_hierarchique=grade_data["niveau_hierarchique"]
                    )
                    grade_dict = grade.dict()
                    grade_dict["created_at"] = grade.created_at.isoformat()
                    grade_dict["updated_at"] = grade.updated_at.isoformat()
                    await db.grades.insert_one(grade_dict)
                
                print(f"✅ {len(default_grades)} grades par défaut créés pour le tenant {tenant.get('nom', tenant_id)}")
    except Exception as e:
        print(f"⚠️ Erreur lors de l'initialisation des grades: {str(e)}")

@app.on_event("startup")
async def startup_event():
    """Événement de démarrage de l'application"""
    await initialize_multi_tenant()
    
    # Initialiser les grades par défaut
    await initialize_default_grades()
    
    # Initialiser le service SFTP
    from services.sftp_service import init_sftp_service
    from services.websocket_manager import get_websocket_manager
    ws_manager = get_websocket_manager()
    init_sftp_service(db, ws_manager)
    logger.info("Service SFTP initialisé")
    
    # Démarrer le polling SFTP pour les tenants actifs
    asyncio.create_task(start_sftp_polling_for_active_tenants())
    
    # Démarrer le job périodique pour vérifier les timeouts de remplacement
    asyncio.create_task(job_verifier_timeouts_remplacements())
    
    # Démarrer le nettoyage périodique des tâches SSE expirées
    asyncio.create_task(cleanup_expired_tasks())


async def start_sftp_polling_for_active_tenants():
    """Démarre le polling SFTP pour tous les tenants avec une config active"""
    await asyncio.sleep(5)  # Attendre que l'app soit prête
    
    from services.sftp_service import get_sftp_service
    sftp_service = get_sftp_service()
    
    # Récupérer tous les configs SFTP actives
    configs = await db.sftp_configs.find({"actif": True}, {"_id": 0}).to_list(100)
    
    for config in configs:
        tenant_id = config["tenant_id"]
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if tenant:
            await sftp_service.start_polling(
                tenant_id,
                tenant.get("slug", tenant_id),
                interval=config.get("polling_interval", 30)
            )
            logger.info(f"Polling SFTP démarré pour tenant {tenant.get('slug', tenant_id)}")

# ==================== SYSTÈME DE PROGRESSION TEMPS RÉEL ====================
# Dictionnaire global pour stocker les progressions des attributions auto
attribution_progress_store: Dict[str, Dict[str, Any]] = {}

class AttributionProgress:
    """Classe pour gérer la progression d'une attribution automatique"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.start_time = time.time()
        self.current_step = ""
        self.progress_percentage = 0
        self.total_gardes = 0
        self.gardes_traitees = 0
        self.assignations_creees = 0
        self.status = "en_cours"  # en_cours, termine, erreur
        self.error_message = None
        self.expires_at = time.time() + 3600  # Expire après 1 heure
        
    def update(self, step: str, progress: int, gardes_traitees: int = 0, assignations: int = 0):
        """Met à jour la progression"""
        self.current_step = step
        self.progress_percentage = min(progress, 100)
        self.gardes_traitees = gardes_traitees
        if assignations > 0:
            self.assignations_creees = assignations
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def complete(self, assignations_totales: int):
        """Marque la tâche comme terminée"""
        self.status = "termine"
        self.progress_percentage = 100
        self.assignations_creees = assignations_totales
        elapsed_time = time.time() - self.start_time
        self.current_step = f"✅ Terminé en {elapsed_time:.1f}s - {assignations_totales} assignations créées"
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def error(self, message: str):
        """Marque la tâche en erreur"""
        self.status = "erreur"
        self.error_message = message
        self.current_step = f"❌ Erreur: {message}"
        attribution_progress_store[self.task_id] = self.to_dict()
    
    def to_dict(self):
        """Convertit en dictionnaire pour JSON"""
        elapsed = time.time() - self.start_time
        return {
            "task_id": self.task_id,
            "status": self.status,
            "current_step": self.current_step,
            "progress_percentage": self.progress_percentage,
            "total_gardes": self.total_gardes,
            "gardes_traitees": self.gardes_traitees,
            "assignations_creees": self.assignations_creees,
            "elapsed_time": f"{elapsed:.1f}s",
            "error_message": self.error_message
        }

async def progress_event_generator(task_id: str):
    """Générateur SSE pour streamer les mises à jour de progression"""
    try:
        # Attendre que la tâche soit créée
        for _ in range(50):  # Attendre max 5 secondes
            if task_id in attribution_progress_store:
                break
            await asyncio.sleep(0.1)
        
        # Streamer les mises à jour
        last_data = None
        while True:
            if task_id in attribution_progress_store:
                current_data = attribution_progress_store[task_id]
                
                # Envoyer seulement si les données ont changé
                if current_data != last_data:
                    yield f"data: {json.dumps(current_data)}\n\n"
                    last_data = current_data.copy()
                
                # Si terminé ou en erreur, arrêter le stream
                if current_data.get("status") in ["termine", "erreur"]:
                    break
            
            await asyncio.sleep(0.5)  # Mise à jour toutes les 500ms
            
    except asyncio.CancelledError:
        pass

async def cleanup_expired_tasks():
    """Nettoie périodiquement les tâches expirées du store"""
    while True:
        try:
            current_time = time.time()
            expired_keys = []
            
            for task_id, data in list(attribution_progress_store.items()):
                # Supprimer les tâches terminées depuis plus de 5 minutes
                if data.get("status") in ["termine", "erreur"]:
                    # Vérifier si la tâche est vieille de plus de 5 minutes
                    if "elapsed_time" in data:
                        try:
                            elapsed_seconds = float(data["elapsed_time"].replace("s", ""))
                            task_age = current_time - (data.get("start_time", current_time) - elapsed_seconds)
                            if task_age > 300:  # 5 minutes
                                expired_keys.append(task_id)
                        except:
                            pass
            
            # Supprimer les tâches expirées
            for key in expired_keys:
                del attribution_progress_store[key]
            
            if expired_keys:
                logging.info(f"🧹 Nettoyage: {len(expired_keys)} tâches expirées supprimées")
            
        except Exception as e:
            logging.error(f"Erreur nettoyage tâches: {e}")
        
        await asyncio.sleep(300)  # Nettoyer toutes les 5 minutes
    
    # Démarrer le scheduler APScheduler pour les notifications automatiques
    asyncio.create_task(start_notification_scheduler())
    
    print("🚀 ProFireManager API Multi-Tenant démarré")

# ==================== SCHEDULER NOTIFICATIONS AUTOMATIQUES ====================

async def start_notification_scheduler():
    """Démarre le scheduler pour les notifications automatiques de planning, équipements et disponibilités"""
    scheduler = AsyncIOScheduler()
    
    # Créer un job qui vérifie toutes les heures si une notification doit être envoyée
    # On vérifie à chaque heure au lieu de programmer des jobs dynamiques
    scheduler.add_job(
        job_verifier_notifications_planning,
        CronTrigger(minute=0),  # Toutes les heures à la minute 0
        id='check_planning_notifications',
        replace_existing=True
    )
    
    # Job pour vérifier les alertes d'équipements (une fois par jour à 8h00 du matin)
    scheduler.add_job(
        job_verifier_alertes_equipements,
        CronTrigger(hour=8, minute=0),  # Tous les jours à 8h00
        id='check_equipment_alerts',
        replace_existing=True
    )
    
    # Job pour vérifier les rappels de disponibilités (une fois par jour à 9h00 du matin)
    scheduler.add_job(
        job_verifier_rappels_disponibilites,
        CronTrigger(hour=9, minute=0),  # Tous les jours à 9h00
        id='check_availability_reminders',
        replace_existing=True
    )
    
    # Job pour vérifier les paiements en retard et suspendre après 5 jours
    scheduler.add_job(
        job_check_overdue_payments,
        CronTrigger(hour=8, minute=0),  # Tous les jours à 8h00
        id='check_overdue_payments',
        replace_existing=True
    )
    
    scheduler.start()
    logging.info("✅ Scheduler de notifications automatiques démarré (planning + équipements + disponibilités + paiements)")


async def job_check_overdue_payments():
    """
    Job qui vérifie les paiements en retard et suspend les tenants après 5 jours d'impayé.
    S'exécute tous les jours à 8h00.
    """
    try:
        logging.info("💰 Vérification des paiements en retard...")
        
        # Récupérer tous les tenants avec paiement en retard
        tenants_past_due = await db.tenants.find({
            "billing_status": "past_due",
            "is_gratuit": {"$ne": True},
            "payment_failed_date": {"$ne": None}
        }).to_list(None)
        
        suspended_count = 0
        reminder_count = 0
        
        for tenant in tenants_past_due:
            try:
                payment_failed_date = datetime.strptime(
                    tenant["payment_failed_date"], "%Y-%m-%d"
                ).replace(tzinfo=timezone.utc)
                
                days_overdue = (datetime.now(timezone.utc) - payment_failed_date).days
                
                if days_overdue >= 5:
                    # Suspendre le tenant après 5 jours
                    await db.tenants.update_one(
                        {"id": tenant["id"]},
                        {"$set": {"actif": False, "billing_status": "suspended"}}
                    )
                    logging.warning(f"⛔ Tenant {tenant['slug']} suspendu (impayé depuis {days_overdue} jours)")
                    suspended_count += 1
                    
                    # Envoyer email de suspension
                    if tenant.get("email_contact") and os.environ.get("RESEND_API_KEY"):
                        try:
                            resend.api_key = os.environ.get("RESEND_API_KEY")
                            resend.Emails.send({
                                "from": "ProFireManager <noreply@profiremanager.com>",
                                "to": [tenant["email_contact"]],
                                "subject": "⚠️ Compte suspendu - ProFireManager",
                                "html": f"""
                                <h2>Votre compte a été suspendu</h2>
                                <p>Bonjour,</p>
                                <p>Suite à un paiement non reçu depuis plus de 5 jours, votre compte ProFireManager pour <strong>{tenant.get('nom')}</strong> a été temporairement suspendu.</p>
                                <p>Pour réactiver votre compte, veuillez régulariser votre paiement dans votre espace de facturation.</p>
                                <p>Cordialement,<br>L'équipe ProFireManager</p>
                                """
                            })
                        except Exception as e:
                            logging.error(f"Erreur envoi email suspension: {e}")
                            
                elif days_overdue >= 3:
                    # Envoyer rappel après 3 jours
                    if tenant.get("email_contact") and os.environ.get("RESEND_API_KEY"):
                        try:
                            resend.api_key = os.environ.get("RESEND_API_KEY")
                            resend.Emails.send({
                                "from": "ProFireManager <noreply@profiremanager.com>",
                                "to": [tenant["email_contact"]],
                                "subject": "Dernier rappel de paiement - ProFireManager",
                                "html": f"""
                                <h2>Dernier rappel avant suspension</h2>
                                <p>Bonjour,</p>
                                <p>Votre paiement pour ProFireManager ({tenant.get('nom')}) est en retard depuis {days_overdue} jours.</p>
                                <p><strong>Attention:</strong> Sans règlement dans les 2 prochains jours, votre compte sera automatiquement suspendu.</p>
                                <p>Cordialement,<br>L'équipe ProFireManager</p>
                                """
                            })
                            reminder_count += 1
                        except Exception as e:
                            logging.error(f"Erreur envoi rappel: {e}")
                            
            except Exception as e:
                logging.error(f"Erreur traitement tenant {tenant.get('slug')}: {e}")
                continue
        
        logging.info(f"💰 Vérification terminée: {suspended_count} suspendus, {reminder_count} rappels envoyés")
        
    except Exception as e:
        logging.error(f"❌ Erreur job_check_overdue_payments: {e}")


async def job_verifier_notifications_planning():
    """
    Job qui vérifie si des notifications de planning doivent être envoyées
    S'exécute toutes les heures
    """
    try:
        now = datetime.now(timezone.utc)
        current_hour = now.hour
        current_day = now.day
        
        logging.info(f"🔍 Vérification des notifications planning - Jour {current_day}, Heure {current_hour}h")
        
        # Récupérer tous les tenants
        tenants = await db.tenants.find().to_list(None)
        
        for tenant in tenants:
            try:
                # Récupérer les paramètres de notification de ce tenant
                params = await db.parametres_validation_planning.find_one({"tenant_id": tenant["id"]})
                
                if not params:
                    continue
                
                # Vérifier si notifications automatiques activées
                if not params.get("envoi_automatique", False):
                    continue
                
                # Vérifier si c'est le bon jour
                jour_envoi = params.get("jour_envoi", 25)
                if current_day != jour_envoi:
                    continue
                
                # Vérifier si c'est la bonne heure
                heure_envoi = params.get("heure_envoi", "17:00")
                heure_cible = int(heure_envoi.split(":")[0])
                
                if current_hour != heure_cible:
                    continue
                
                # Vérifier si déjà envoyé aujourd'hui
                derniere_notif = params.get("derniere_notification")
                if derniere_notif:
                    derniere_date = datetime.fromisoformat(derniere_notif).date()
                    if derniere_date == now.date():
                        logging.info(f"⏭️ Notifications déjà envoyées aujourd'hui pour {tenant['nom']}")
                        continue
                
                # C'est le moment d'envoyer !
                logging.info(f"📧 Envoi des notifications automatiques pour {tenant['nom']}")
                
                # Calculer la période à notifier
                periode_couverte = params.get("periode_couverte", "mois_suivant")
                
                if periode_couverte == "mois_suivant":
                    # Mois suivant
                    next_month = now + timedelta(days=30)
                    periode_debut = next_month.replace(day=1).strftime("%Y-%m-%d")
                    
                    # Dernier jour du mois suivant
                    if next_month.month == 12:
                        last_day = next_month.replace(year=next_month.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = next_month.replace(month=next_month.month + 1, day=1) - timedelta(days=1)
                    periode_fin = last_day.strftime("%Y-%m-%d")
                else:
                    # Mois en cours
                    periode_debut = now.replace(day=1).strftime("%Y-%m-%d")
                    if now.month == 12:
                        last_day = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
                    else:
                        last_day = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
                    periode_fin = last_day.strftime("%Y-%m-%d")
                
                # Envoyer les notifications
                await envoyer_notifications_planning_automatique(
                    tenant=tenant,
                    periode_debut=periode_debut,
                    periode_fin=periode_fin
                )
                
                # Mettre à jour la date de dernière notification
                await db.parametres_validation_planning.update_one(
                    {"tenant_id": tenant["id"]},
                    {"$set": {"derniere_notification": now.isoformat()}}
                )
                
                logging.info(f"✅ Notifications envoyées avec succès pour {tenant['nom']}")
                
            except Exception as e:
                logging.error(f"❌ Erreur envoi notifications pour {tenant.get('nom', 'Unknown')}: {str(e)}", exc_info=True)
        
    except Exception as e:
        logging.error(f"❌ Erreur dans job_verifier_notifications_planning: {str(e)}", exc_info=True)


def parse_frequence_inspection_to_days(frequence: str) -> int:
    """
    Convertit une fréquence d'inspection en nombre de jours
    Ex: "1 an" -> 365, "6 mois" -> 180, "5 ans" -> 1825
    """
    if not frequence:
        return 365  # Par défaut: 1 an
    
    frequence = frequence.lower().strip()
    
    # Extraire le nombre
    import re
    match = re.search(r'(\d+)', frequence)
    if not match:
        return 365
    
    nombre = int(match.group(1))
    
    # Déterminer l'unité
    if 'an' in frequence or 'year' in frequence:
        return nombre * 365
    elif 'mois' in frequence or 'month' in frequence:
        return nombre * 30
    elif 'semaine' in frequence or 'week' in frequence:
        return nombre * 7
    elif 'jour' in frequence or 'day' in frequence:
        return nombre
    else:
        return nombre * 365  # Par défaut en années


async def job_verifier_alertes_equipements():
    """
    Job qui vérifie les alertes d'équipements et envoie des notifications par email
    S'exécute tous les jours à 8h00 du matin
    """
    try:
        logging.info("🔍 Vérification des alertes d'équipements pour tous les tenants")
        
        # Récupérer tous les tenants
        tenants = await db.tenants.find({"actif": True}).to_list(None)
        
        for tenant in tenants:
            try:
                tenant_id = tenant.get("id")
                tenant_nom = tenant.get("nom", "Unknown")
                
                # Récupérer les paramètres d'alertes pour ce tenant
                parametres = await db.parametres_equipements.find_one(
                    {"tenant_id": tenant_id},
                    {"_id": 0}
                )
                
                # Si pas de paramètres ou alertes email désactivées, passer au suivant
                if not parametres or not parametres.get("activer_alertes_email", True):
                    logging.info(f"⏭️ Alertes email désactivées pour {tenant_nom}")
                    continue
                
                # Récupérer la liste des emails destinataires
                emails_destinataires = parametres.get("emails_notifications_equipements", [])
                if not emails_destinataires:
                    logging.info(f"⏭️ Aucun destinataire configuré pour {tenant_nom}")
                    continue
                
                # Récupérer les seuils d'alertes
                jours_maintenance = parametres.get("jours_alerte_maintenance", 30)
                jours_expiration = parametres.get("jours_alerte_expiration", 30)
                jours_fin_vie = parametres.get("jours_alerte_fin_vie", 90)
                
                today = datetime.now(timezone.utc).date()
                date_limite_maintenance = (today + timedelta(days=jours_maintenance)).isoformat()
                date_limite_expiration = (today + timedelta(days=jours_expiration)).isoformat()
                date_limite_fin_vie = (today + timedelta(days=jours_fin_vie)).isoformat()
                
                # Compter les alertes
                alertes_count = {
                    "maintenance": 0,
                    "expiration": 0,
                    "fin_vie": 0,
                    "reparation": 0
                }
                
                # Alertes maintenance
                equipements_maintenance = await db.equipements.find({
                    "tenant_id": tenant_id,
                    "date_prochaine_maintenance": {"$lte": date_limite_maintenance, "$ne": ""}
                }).to_list(1000)
                alertes_count["maintenance"] = len(equipements_maintenance)
                
                # Alertes fin de vie
                equipements_fin_vie = await db.equipements.find({
                    "tenant_id": tenant_id,
                    "date_fin_vie": {"$lte": date_limite_fin_vie, "$ne": ""}
                }).to_list(1000)
                alertes_count["fin_vie"] = len(equipements_fin_vie)
                
                # Alertes réparation
                equipements_reparation = await db.equipements.find({
                    "tenant_id": tenant_id,
                    "etat": {"$in": ["a_reparer", "en_reparation"]}
                }).to_list(1000)
                alertes_count["reparation"] = len(equipements_reparation)
                
                # Alertes expiration (champs personnalisés)
                all_equipements = await db.equipements.find(
                    {"tenant_id": tenant_id}
                ).to_list(10000)
                
                expiration_count = 0
                for eq in all_equipements:
                    champs = eq.get("champs_personnalises", {})
                    for key, value in champs.items():
                        if value and ("expiration" in key.lower() or "expir" in key.lower()):
                            try:
                                date_exp = datetime.fromisoformat(str(value)).date()
                                if date_exp <= (today + timedelta(days=jours_expiration)):
                                    expiration_count += 1
                                    break  # Compter chaque équipement une seule fois
                            except:
                                pass
                
                alertes_count["expiration"] = expiration_count
                
                # =============================================
                # NOUVEAU: Alertes inspections dues par catégorie
                # =============================================
                alertes_count["inspections_dues"] = 0
                alertes_par_categorie = {}  # {categorie_id: {nom, count, personne_ressource_email, equipements}}
                
                # Récupérer toutes les catégories avec leur fréquence d'inspection
                categories = await db.categories_equipements.find(
                    {"tenant_id": tenant_id},
                    {"_id": 0}
                ).to_list(1000)
                
                categories_map = {cat.get("id"): cat for cat in categories}
                
                for eq in all_equipements:
                    categorie_id = eq.get("categorie_id")
                    if not categorie_id or categorie_id not in categories_map:
                        continue
                    
                    categorie = categories_map[categorie_id]
                    frequence = categorie.get("frequence_inspection", "")
                    if not frequence:
                        continue  # Pas de fréquence définie, pas d'alerte
                    
                    jours_frequence = parse_frequence_inspection_to_days(frequence)
                    
                    # Trouver la dernière inspection unifiée pour cet équipement
                    derniere_inspection = await db.inspections_unifiees.find_one(
                        {
                            "tenant_id": tenant_id,
                            "asset_id": eq.get("id"),
                            "asset_type": "equipement"
                        },
                        {"_id": 0},
                        sort=[("date_inspection", -1)]
                    )
                    
                    # Si pas d'inspection unifiée, chercher dans les anciennes collections
                    if not derniere_inspection:
                        derniere_inspection = await db.inspections_equipements.find_one(
                            {
                                "tenant_id": tenant_id,
                                "equipement_id": eq.get("id")
                            },
                            {"_id": 0},
                            sort=[("date_inspection", -1)]
                        )
                    
                    # Calculer si l'inspection est due
                    inspection_due = False
                    jours_depuis_derniere = None
                    
                    if derniere_inspection:
                        date_derniere = derniere_inspection.get("date_inspection") or derniere_inspection.get("created_at")
                        if date_derniere:
                            try:
                                if isinstance(date_derniere, str):
                                    date_derniere = datetime.fromisoformat(date_derniere.replace("Z", "+00:00"))
                                elif isinstance(date_derniere, datetime):
                                    pass
                                else:
                                    date_derniere = None
                                
                                if date_derniere:
                                    jours_depuis_derniere = (datetime.now(timezone.utc) - date_derniere).days
                                    if jours_depuis_derniere >= jours_frequence:
                                        inspection_due = True
                            except:
                                pass
                    else:
                        # Aucune inspection jamais faite - vérifier la date de création de l'équipement
                        date_creation = eq.get("created_at") or eq.get("date_ajout")
                        if date_creation:
                            try:
                                if isinstance(date_creation, str):
                                    date_creation = datetime.fromisoformat(date_creation.replace("Z", "+00:00"))
                                if isinstance(date_creation, datetime):
                                    jours_depuis_creation = (datetime.now(timezone.utc) - date_creation).days
                                    if jours_depuis_creation >= jours_frequence:
                                        inspection_due = True
                                        jours_depuis_derniere = jours_depuis_creation
                            except:
                                pass
                    
                    if inspection_due:
                        alertes_count["inspections_dues"] += 1
                        
                        if categorie_id not in alertes_par_categorie:
                            alertes_par_categorie[categorie_id] = {
                                "nom": categorie.get("nom", "Catégorie inconnue"),
                                "icone": categorie.get("icone", "📦"),
                                "frequence": frequence,
                                "count": 0,
                                # Support pour plusieurs personnes ressources
                                "personnes_ressources": categorie.get("personnes_ressources", []),
                                # Anciens champs pour compatibilité
                                "personne_ressource_email": categorie.get("personne_ressource_email", ""),
                                "personne_ressource_id": categorie.get("personne_ressource_id", ""),
                                "equipements": []
                            }
                        
                        alertes_par_categorie[categorie_id]["count"] += 1
                        alertes_par_categorie[categorie_id]["equipements"].append({
                            "nom": eq.get("nom", eq.get("numero_serie", "Équipement")),
                            "jours_retard": jours_depuis_derniere
                        })
                
                # Calculer le total des alertes
                total_alertes = sum(alertes_count.values())
                
                # Si aucune alerte, ne pas envoyer d'email
                if total_alertes == 0:
                    logging.info(f"✅ Aucune alerte pour {tenant_nom}")
                    continue
                
                logging.info(f"📊 {tenant_nom}: {total_alertes} alertes trouvées - Maintenance: {alertes_count['maintenance']}, Expiration: {alertes_count['expiration']}, Fin de vie: {alertes_count['fin_vie']}, Réparation: {alertes_count['reparation']}, Inspections dues: {alertes_count['inspections_dues']}")
                
                # Générer le HTML pour les inspections dues par catégorie
                inspections_dues_html = ""
                if alertes_count["inspections_dues"] > 0:
                    inspections_dues_html = f'''
                        <div class="alert-box" style="border-left-color: #F59E0B; background-color: #FEF3C7;">
                            <div class="alert-title" style="color: #B45309;">📋 Inspections à effectuer</div>
                            <div class="alert-count" style="color: #92400E;">{alertes_count["inspections_dues"]} équipement(s)</div>
                            <p>Selon la fréquence d'inspection de leur catégorie</p>
                            <div style="margin-top: 15px;">
                    '''
                    for cat_id, cat_data in alertes_par_categorie.items():
                        inspections_dues_html += f'''
                                <div style="background: white; padding: 10px; border-radius: 8px; margin: 8px 0;">
                                    <strong>{cat_data["icone"]} {cat_data["nom"]}</strong> - {cat_data["count"]} équipement(s)
                                    <br><small style="color: #666;">Fréquence: {cat_data["frequence"]}</small>
                                    <ul style="margin: 5px 0; padding-left: 20px; font-size: 0.9em;">
                        '''
                        for eq in cat_data["equipements"][:5]:  # Limiter à 5 équipements par catégorie
                            retard_text = f" ({eq['jours_retard']} jours de retard)" if eq.get('jours_retard') else ""
                            inspections_dues_html += f"<li>{eq['nom']}{retard_text}</li>"
                        if len(cat_data["equipements"]) > 5:
                            inspections_dues_html += f"<li><em>... et {len(cat_data['equipements']) - 5} autre(s)</em></li>"
                        inspections_dues_html += "</ul></div>"
                    inspections_dues_html += "</div></div>"
                
                # Préparer le contenu de l'email
                subject = f"⚠️ Alertes Équipements - {tenant_nom}"
                
                html_content = f"""
                <html>
                <head>
                    <style>
                        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                        .header {{ background-color: #EF4444; color: white; padding: 20px; text-align: center; }}
                        .content {{ padding: 20px; }}
                        .alert-box {{ 
                            border-left: 4px solid #EF4444;
                            background-color: #FEE2E2;
                            padding: 15px;
                            margin: 15px 0;
                        }}
                        .alert-title {{ font-weight: bold; color: #DC2626; margin-bottom: 10px; }}
                        .alert-count {{ font-size: 24px; font-weight: bold; color: #991B1B; }}
                        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }}
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>⚠️ Rapport d'Alertes Équipements</h1>
                        <p>{tenant_nom}</p>
                        <p>{today.strftime("%d/%m/%Y")}</p>
                    </div>
                    <div class="content">
                        <p>Bonjour,</p>
                        <p>Voici le rapport quotidien des alertes pour vos équipements :</p>
                        
                        {f'''
                        <div class="alert-box">
                            <div class="alert-title">🔧 Maintenance à venir</div>
                            <div class="alert-count">{alertes_count["maintenance"]} équipement(s)</div>
                            <p>Maintenance requise dans les {jours_maintenance} prochains jours</p>
                        </div>
                        ''' if alertes_count["maintenance"] > 0 else ''}
                        
                        {f'''
                        <div class="alert-box">
                            <div class="alert-title">⏰ Expirations à venir</div>
                            <div class="alert-count">{alertes_count["expiration"]} équipement(s)</div>
                            <p>Expiration dans les {jours_expiration} prochains jours</p>
                        </div>
                        ''' if alertes_count["expiration"] > 0 else ''}
                        
                        {f'''
                        <div class="alert-box">
                            <div class="alert-title">🚨 Fin de vie approche</div>
                            <div class="alert-count">{alertes_count["fin_vie"]} équipement(s)</div>
                            <p>Fin de vie dans les {jours_fin_vie} prochains jours</p>
                        </div>
                        ''' if alertes_count["fin_vie"] > 0 else ''}
                        
                        {f'''
                        <div class="alert-box">
                            <div class="alert-title">🔨 Réparations nécessaires</div>
                            <div class="alert-count">{alertes_count["reparation"]} équipement(s)</div>
                            <p>Équipements en attente de réparation</p>
                        </div>
                        ''' if alertes_count["reparation"] > 0 else ''}
                        
                        {inspections_dues_html}
                        
                        <p style="margin-top: 30px;">
                            <strong>Total des alertes : {total_alertes}</strong>
                        </p>
                        
                        <p style="margin-top: 20px;">
                            Connectez-vous à votre tableau de bord pour plus de détails et pour gérer ces équipements.
                        </p>
                    </div>
                    <div class="footer">
                        <p>Cet email a été envoyé automatiquement par le système ProFireManager.</p>
                        <p>Pour modifier vos préférences de notifications, accédez aux paramètres du module Matériel & Équipements.</p>
                    </div>
                </body>
                </html>
                """
                
                # Envoyer l'email au résumé général (si des destinataires configurés)
                resend.api_key = os.environ.get("RESEND_API_KEY")
                sender_email = os.environ.get("SENDER_EMAIL", "noreply@profiremanager.ca")
                
                for email in emails_destinataires:
                    try:
                        params = {
                            "from": sender_email,
                            "to": [email],
                            "subject": subject,
                            "html": html_content
                        }
                        
                        email_response = resend.Emails.send(params)
                        logging.info(f"📧 Email envoyé à {email} pour {tenant_nom} - ID: {email_response.get('id', 'N/A')}")
                    
                    except Exception as e:
                        logging.error(f"❌ Erreur envoi email à {email} pour {tenant_nom}: {str(e)}")
                
                # =============================================
                # Envoyer emails à TOUTES les personnes ressources de chaque catégorie
                # =============================================
                emails_deja_envoyes = set(emails_destinataires)  # Éviter les doublons
                
                for cat_id, cat_data in alertes_par_categorie.items():
                    # Collecter tous les emails des personnes ressources
                    emails_pr = []
                    
                    # Nouveau format: tableau personnes_ressources
                    for pr in cat_data.get("personnes_ressources", []):
                        if pr.get("email") and pr.get("email") not in emails_deja_envoyes:
                            emails_pr.append(pr.get("email"))
                    
                    # Ancien format: personne_ressource_email (pour compatibilité)
                    ancien_email = cat_data.get("personne_ressource_email", "")
                    if ancien_email and ancien_email not in emails_deja_envoyes and ancien_email not in emails_pr:
                        emails_pr.append(ancien_email)
                    
                    if not emails_pr:
                        continue
                    
                    # Préparer l'email pour les personnes ressources
                    subject_pr = f"📋 Inspections dues - {cat_data['nom']} - {tenant_nom}"
                    
                    equipements_list_html = "".join([
                        f"<li><strong>{eq['nom']}</strong> - {eq.get('jours_retard', 'N/A')} jours depuis dernière inspection</li>"
                        for eq in cat_data["equipements"]
                    ])
                    
                    html_pr = f"""
                    <html>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                        <div style="background: linear-gradient(135deg, #F59E0B, #D97706); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                            <h2>{cat_data['icone']} Inspections dues - {cat_data['nom']}</h2>
                        </div>
                        <div style="padding: 20px; background: #FFFBEB; border: 1px solid #F59E0B; border-radius: 0 0 8px 8px;">
                            <p>Bonjour,</p>
                            <p>En tant que personne ressource pour la catégorie <strong>{cat_data['nom']}</strong>, vous êtes notifié(e) que <strong>{cat_data['count']} équipement(s)</strong> nécessitent une inspection.</p>
                            
                            <p><strong>Fréquence d'inspection :</strong> {cat_data['frequence']}</p>
                            
                            <h4>Équipements concernés :</h4>
                            <ul style="background: white; padding: 15px 30px; border-radius: 8px; border: 1px solid #E5E7EB;">
                                {equipements_list_html}
                            </ul>
                            
                            <p style="margin-top: 20px;">
                                Connectez-vous à ProFireManager pour effectuer ces inspections.
                            </p>
                        </div>
                        <p style="color: #666; font-size: 12px; margin-top: 20px;">
                            Cet email a été envoyé automatiquement. Vous recevez ce message car vous êtes désigné comme personne ressource.
                        </p>
                    </body>
                    </html>
                    """
                    
                    # Envoyer à chaque personne ressource
                    for email_pr in emails_pr:
                        try:
                            params_pr = {
                                "from": sender_email,
                                "to": [email_pr],
                                "subject": subject_pr,
                                "html": html_pr
                            }
                            
                            email_response_pr = resend.Emails.send(params_pr)
                            logging.info(f"📧 Email personne ressource envoyé à {email_pr} pour {cat_data['nom']} - ID: {email_response_pr.get('id', 'N/A')}")
                            emails_deja_envoyes.add(email_pr)  # Marquer comme envoyé
                        
                        except Exception as e:
                            logging.error(f"❌ Erreur envoi email personne ressource {email_pr}: {str(e)}")
                
                logging.info(f"✅ Notifications d'alertes envoyées pour {tenant_nom}")
                
            except Exception as e:
                logging.error(f"❌ Erreur traitement alertes pour {tenant.get('nom', 'Unknown')}: {str(e)}", exc_info=True)
        
        logging.info("✅ Vérification des alertes d'équipements terminée")
        
    except Exception as e:
        logging.error(f"❌ Erreur dans job_verifier_alertes_equipements: {str(e)}", exc_info=True)


async def job_verifier_rappels_disponibilites():
    """
    Job qui vérifie les rappels de disponibilités pour les employés temps partiel
    S'exécute tous les jours à 9h00 du matin
    
    Logique:
    - Pour chaque tenant, lire les paramètres de disponibilités
    - Si notifications actives, vérifier si on est X jours avant la date de blocage
    - Identifier les employés temps partiel qui n'ont pas soumis leurs disponibilités pour le mois suivant
    - Envoyer des notifications (in-app, push, email) de rappel
    """
    try:
        logging.info("🔍 Vérification des rappels de disponibilités pour tous les tenants")
        
        # Date du jour
        today = datetime.now(timezone.utc).date()
        current_day = today.day
        current_month = today.month
        current_year = today.year
        
        # Calculer le mois suivant
        if current_month == 12:
            next_month = 1
            next_month_year = current_year + 1
        else:
            next_month = current_month + 1
            next_month_year = current_year
        
        # Récupérer tous les tenants actifs
        tenants = await db.tenants.find({"actif": True}).to_list(None)
        
        for tenant in tenants:
            try:
                tenant_id = tenant.get("id")
                tenant_nom = tenant.get("nom", "Unknown")
                
                # Récupérer les paramètres de disponibilités
                params = await db.parametres_disponibilites.find_one({"tenant_id": tenant_id})
                
                if not params:
                    logging.info(f"⏭️ Pas de paramètres de disponibilités pour {tenant_nom}")
                    continue
                
                # Vérifier si le blocage et les notifications sont actifs
                blocage_actif = params.get("blocage_dispos_active", False)
                notifications_actives = params.get("notifications_dispos_actives", True)
                
                if not blocage_actif:
                    logging.info(f"⏭️ Blocage des disponibilités désactivé pour {tenant_nom}")
                    continue
                
                if not notifications_actives:
                    logging.info(f"⏭️ Notifications de disponibilités désactivées pour {tenant_nom}")
                    continue
                
                # Récupérer les seuils
                jour_blocage = params.get("jour_blocage_dispos", 15)
                jours_avance = params.get("jours_avance_notification", 3)
                
                # Calculer la date de blocage (jour X du mois courant pour le mois suivant)
                date_blocage = date(current_year, current_month, jour_blocage)
                
                # Calculer si on est dans la période de rappel (X jours avant le blocage)
                jours_restants = (date_blocage - today).days
                
                if jours_restants > jours_avance or jours_restants < 0:
                    logging.info(f"⏭️ Pas dans la période de rappel pour {tenant_nom} (jours restants: {jours_restants})")
                    continue
                
                logging.info(f"📧 Période de rappel active pour {tenant_nom} - {jours_restants} jour(s) avant blocage")
                
                # Vérifier si un rappel a déjà été envoyé aujourd'hui
                dernier_rappel = params.get("dernier_rappel_disponibilites")
                if dernier_rappel:
                    try:
                        derniere_date = datetime.fromisoformat(dernier_rappel).date()
                        if derniere_date == today:
                            logging.info(f"⏭️ Rappel déjà envoyé aujourd'hui pour {tenant_nom}")
                            continue
                    except:
                        pass
                
                # Récupérer les employés temps partiel actifs
                users_temps_partiel = await db.users.find({
                    "tenant_id": tenant_id,
                    "type_emploi": "temps_partiel",
                    "statut": "actif"
                }).to_list(None)
                
                if not users_temps_partiel:
                    logging.info(f"⏭️ Aucun employé temps partiel pour {tenant_nom}")
                    continue
                
                # Période du mois suivant pour vérifier les disponibilités
                periode_debut = f"{next_month_year}-{str(next_month).zfill(2)}-01"
                # Dernier jour du mois suivant
                if next_month == 12:
                    dernier_jour = date(next_month_year + 1, 1, 1) - timedelta(days=1)
                else:
                    dernier_jour = date(next_month_year, next_month + 1, 1) - timedelta(days=1)
                periode_fin = dernier_jour.isoformat()
                
                # Identifier les employés qui n'ont pas soumis de disponibilités pour le mois suivant
                users_a_notifier = []
                
                for user in users_temps_partiel:
                    user_id = user.get("id")
                    
                    # Vérifier s'il a des disponibilités pour le mois suivant
                    disponibilites_count = await db.disponibilites.count_documents({
                        "user_id": user_id,
                        "tenant_id": tenant_id,
                        "date": {
                            "$gte": periode_debut,
                            "$lte": periode_fin
                        }
                    })
                    
                    if disponibilites_count == 0:
                        users_a_notifier.append(user)
                
                if not users_a_notifier:
                    logging.info(f"✅ Tous les employés de {tenant_nom} ont soumis leurs disponibilités")
                    # Mettre à jour la date du dernier rappel
                    await db.parametres_disponibilites.update_one(
                        {"tenant_id": tenant_id},
                        {"$set": {"dernier_rappel_disponibilites": datetime.now(timezone.utc).isoformat()}}
                    )
                    continue
                
                logging.info(f"📤 {len(users_a_notifier)} employé(s) à notifier pour {tenant_nom}")
                
                # Préparer le message de rappel
                mois_suivant_texte = ["janvier", "février", "mars", "avril", "mai", "juin", 
                                      "juillet", "août", "septembre", "octobre", "novembre", "décembre"][next_month - 1]
                
                titre_notification = "📅 Rappel: Saisissez vos disponibilités"
                message_notification = f"Vous avez jusqu'au {jour_blocage} {['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][current_month - 1]} pour saisir vos disponibilités de {mois_suivant_texte}. Il vous reste {jours_restants} jour(s)."
                
                # Récupérer la config Resend pour les emails
                resend_api_key = os.environ.get("RESEND_API_KEY")
                sender_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@resend.dev")
                app_url = os.environ.get("FRONTEND_URL", os.environ.get("REACT_APP_BACKEND_URL", ""))
                
                for user in users_a_notifier:
                    user_id = user.get("id")
                    user_email = user.get("email")
                    user_prenom = user.get("prenom", "")
                    user_nom = user.get("nom", "")
                    
                    # 1. Créer notification in-app
                    await db.notifications.insert_one({
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant_id,
                        "user_id": user_id,
                        "type": "rappel_disponibilites",
                        "titre": titre_notification,
                        "message": message_notification,
                        "lu": False,
                        "urgent": jours_restants <= 1,  # Urgent si dernier jour
                        "data": {
                            "lien": "/disponibilites",
                            "mois_cible": f"{next_month_year}-{str(next_month).zfill(2)}"
                        },
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                    
                    # 2. Envoyer notification push
                    try:
                        await send_push_notification_to_users(
                            user_ids=[user_id],
                            title=titre_notification,
                            body=message_notification,
                            data={
                                "type": "rappel_disponibilites",
                                "lien": "/disponibilites",
                                "sound": "default" if jours_restants > 1 else "urgent"
                            }
                        )
                    except Exception as e:
                        logging.warning(f"⚠️ Erreur push pour {user_prenom} {user_nom}: {str(e)}")
                    
                    # 3. Envoyer email si configuré
                    if resend_api_key and user_email:
                        try:
                            resend.api_key = resend_api_key
                            
                            html_content = f"""
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <style>
                                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                                    .header {{ background-color: #1E40AF; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                                    .content {{ background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
                                    .alert {{ background-color: {'#FEF3C7' if jours_restants > 1 else '#FEE2E2'}; border-left: 4px solid {'#F59E0B' if jours_restants > 1 else '#EF4444'}; padding: 15px; margin: 20px 0; }}
                                    .btn {{ display: inline-block; background-color: #1E40AF; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }}
                                    .footer {{ text-align: center; padding: 20px; color: #666; font-size: 12px; }}
                                </style>
                            </head>
                            <body>
                                <div class="container">
                                    <div class="header">
                                        <h1>📅 Rappel Disponibilités</h1>
                                    </div>
                                    <div class="content">
                                        <p>Bonjour {user_prenom},</p>
                                        
                                        <div class="alert">
                                            <strong>{'⚠️ Attention' if jours_restants <= 1 else '📢 Rappel'}</strong><br>
                                            Vous n'avez pas encore saisi vos disponibilités pour le mois de <strong>{mois_suivant_texte} {next_month_year}</strong>.
                                        </div>
                                        
                                        <p>La date limite de saisie est le <strong>{jour_blocage} {['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][current_month - 1]}</strong>.</p>
                                        
                                        <p>Il vous reste <strong>{jours_restants} jour(s)</strong> pour soumettre vos disponibilités. Passé cette date, vous ne pourrez plus modifier vos disponibilités pour {mois_suivant_texte}.</p>
                                        
                                        <center>
                                            <a href="{app_url}/disponibilites" class="btn">Saisir mes disponibilités</a>
                                        </center>
                                        
                                        <p style="margin-top: 30px;">Cordialement,<br>L'équipe {tenant_nom}</p>
                                    </div>
                                    <div class="footer">
                                        <p>Ceci est un message automatique. Merci de ne pas y répondre.</p>
                                    </div>
                                </div>
                            </body>
                            </html>
                            """
                            
                            params = {
                                "from": f"{tenant_nom} <{sender_email}>",
                                "to": [user_email],
                                "subject": f"{'⚠️ URGENT: ' if jours_restants <= 1 else ''}Rappel - Saisissez vos disponibilités pour {mois_suivant_texte}",
                                "html": html_content
                            }
                            
                            resend.Emails.send(params)
                            logging.info(f"✅ Email de rappel envoyé à {user_email}")
                            
                        except Exception as e:
                            logging.warning(f"⚠️ Erreur email pour {user_email}: {str(e)}")
                
                # Mettre à jour la date du dernier rappel
                await db.parametres_disponibilites.update_one(
                    {"tenant_id": tenant_id},
                    {"$set": {"dernier_rappel_disponibilites": datetime.now(timezone.utc).isoformat()}}
                )
                
                logging.info(f"✅ Rappels de disponibilités envoyés pour {tenant_nom} ({len(users_a_notifier)} employé(s))")
                
            except Exception as e:
                logging.error(f"❌ Erreur traitement rappels pour {tenant.get('nom', 'Unknown')}: {str(e)}", exc_info=True)
        
        logging.info("✅ Vérification des rappels de disponibilités terminée")
        
    except Exception as e:
        logging.error(f"❌ Erreur dans job_verifier_rappels_disponibilites: {str(e)}", exc_info=True)


async def envoyer_notifications_planning_automatique(tenant: dict, periode_debut: str, periode_fin: str):
    """Envoie les notifications de planning (version automatique sans auth)"""
    try:
        # Récupérer les assignations de la période
        assignations = await db.assignations.find({
            "tenant_id": tenant["id"],
            "date": {
                "$gte": periode_debut,
                "$lte": periode_fin
            }
        }).to_list(None)
        
        if not assignations:
            logging.info(f"Aucune assignation trouvée pour {tenant['nom']} période {periode_debut} - {periode_fin}")
            return
        
        # Grouper par pompier
        gardes_par_pompier = {}
        for assignation in assignations:
            user_id = assignation["user_id"]
            if user_id not in gardes_par_pompier:
                gardes_par_pompier[user_id] = []
            gardes_par_pompier[user_id].append(assignation)
        
        # Récupérer infos users et types garde
        users = await db.users.find({"tenant_id": tenant["id"]}).to_list(None)
        types_garde = await db.types_garde.find({"tenant_id": tenant["id"]}).to_list(None)
        
        user_map = {u["id"]: u for u in users}
        type_garde_map = {t["id"]: t for t in types_garde}
        
        # Envoyer email à chaque pompier
        emails_envoyes = 0
        for user_id, gardes in gardes_par_pompier.items():
            user = user_map.get(user_id)
            if not user or not user.get("email"):
                continue
            
            # Préparer liste des gardes avec détails
            gardes_list = []
            for garde in gardes:
                type_g = type_garde_map.get(garde["type_garde_id"], {})
                
                # Trouver collègues sur même garde
                collegues_meme_garde = [
                    a for a in assignations 
                    if a["date"] == garde["date"] 
                    and a["type_garde_id"] == garde["type_garde_id"]
                    and a["user_id"] != user_id
                ]
                
                collegues_noms = []
                for coll in collegues_meme_garde:
                    coll_user = user_map.get(coll["user_id"])
                    if coll_user:
                        collegues_noms.append(f"{coll_user.get('prenom', '')} {coll_user.get('nom', '')}")
                
                gardes_list.append({
                    "date": garde["date"],
                    "type_garde": type_g.get("nom", "Garde"),
                    "collegues": collegues_noms
                })
            
            # Trier par date
            gardes_list.sort(key=lambda x: x["date"])
            
            # Envoyer email
            try:
                send_gardes_notification_email(
                    user_email=user["email"],
                    user_name=f"{user.get('prenom', '')} {user.get('nom', '')}",
                    gardes_list=gardes_list,
                    tenant_slug=tenant["slug"],
                    periode=f"{periode_debut} au {periode_fin}"
                )
                emails_envoyes += 1
            except Exception as e:
                logging.error(f"Erreur envoi email à {user.get('email')}: {str(e)}")
        
        logging.info(f"✅ {emails_envoyes} emails envoyés pour {tenant['nom']}")
        
    except Exception as e:
        logging.error(f"Erreur dans envoyer_notifications_planning_automatique: {str(e)}", exc_info=True)
        raise

async def job_verifier_timeouts_remplacements():
    """
    Job périodique qui vérifie les timeouts des demandes de remplacement
    S'exécute toutes les minutes
    """
    from routes.remplacements import verifier_et_traiter_timeouts
    
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
ACCESS_TOKEN_EXPIRE_MINUTES = 24 * 60  # 24 hours pour utilisateurs normaux
SUPER_ADMIN_TOKEN_EXPIRE_MINUTES = 2 * 60  # 2 heures pour super-admins (sécurité)

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


def normalize_string_for_matching(s: str) -> str:
    """
    Normalise une chaîne pour le matching intelligent :
    - Enlève les accents (é → e, à → a, etc.)
    - Convertit en minuscules
    - Strip les espaces
    - Remplace les tirets par des espaces (Jean-Pierre → Jean Pierre)
    - Normalise les espaces multiples en un seul espace
    
    Utilisé pour matcher des noms/prénoms de façon flexible dans les imports CSV.
    
    Exemple:
        "Sébastien BERNARD" → "sebastien bernard"
        "Dupont Jean-Pierre" → "dupont jean pierre"
        "Jean  François" → "jean francois"
    """
    import unicodedata
    import re
    
    # Enlever les accents (NFD = décompose, puis filtre les marques diacritiques)
    s = ''.join(c for c in unicodedata.normalize('NFD', s) 
                if unicodedata.category(c) != 'Mn')
    
    # Minuscules
    s = s.lower()
    
    # Remplacer les tirets par des espaces pour le matching flexible
    s = s.replace('-', ' ')
    
    # Normaliser les espaces multiples en un seul espace
    s = re.sub(r'\s+', ' ', s)
    
    # Strip
    return s.strip()


def create_user_matching_index(users_list: list) -> dict:
    """
    Crée un index de matching pour recherche rapide d'utilisateurs.
    
    Gère automatiquement :
    - Ordre normal (Prénom Nom)
    - Ordre inversé (Nom Prénom)
    - Normalisation (accents, casse)
    
    Args:
        users_list: Liste d'utilisateurs avec 'prenom' et 'nom'
    
    Returns:
        dict: Index {nom_normalisé: user_object}
        
    Exemple:
        users = [{"prenom": "Sébastien", "nom": "Bernard"}]
        index = create_user_matching_index(users)
        # index["sebastien bernard"] → user
        # index["bernard sebastien"] → user (ordre inversé aussi)
    """
    index = {}
    for user in users_list:
        prenom = user.get('prenom', '').strip()
        nom = user.get('nom', '').strip()
        
        if prenom and nom:
            # Index 1: Prénom Nom (ordre normal)
            key1 = normalize_string_for_matching(f"{prenom} {nom}")
            index[key1] = user
            
            # Index 2: Nom Prénom (ordre inversé)
            key2 = normalize_string_for_matching(f"{nom} {prenom}")
            index[key2] = user
    
    return index


def calculate_name_similarity(str1: str, str2: str) -> float:
    """
    Calcule un score de similarité entre deux chaînes normalisées.
    Retourne un score entre 0 (pas de correspondance) et 1 (match parfait).
    
    Prend en compte :
    - Mots en commun
    - Ordre des mots
    - Longueur relative
    """
    words1 = set(str1.split())
    words2 = set(str2.split())
    
    if not words1 or not words2:
        return 0.0
    
    # Intersection : mots en commun
    common_words = words1.intersection(words2)
    
    # Score basé sur le ratio de mots en commun
    score = len(common_words) / max(len(words1), len(words2))
    
    # Bonus si tous les mots de la recherche sont dans le nom DB
    if words1.issubset(words2):
        score += 0.3
    elif words2.issubset(words1):
        score += 0.2
    
    return min(score, 1.0)


def find_user_intelligent(
    search_string: str, 
    users_by_name: dict, 
    users_by_num: dict = None,
    numero_field: str = "numero_employe"
) -> dict:
    """
    Recherche intelligente d'un utilisateur avec matching flexible et "best fit".
    
    Stratégie de recherche (par ordre de priorité) :
    1. Par numéro d'employé (si présent entre parenthèses et fiable)
    2. Par nom normalisé exact (ordre normal ou inversé)
    3. Par parsing approfondi (noms composés)
    4. Par similarité (best fit) si aucun match exact
    
    Args:
        search_string: Chaîne de recherche (ex: "Bernard Sébastien (981)")
        users_by_name: Index créé par create_user_matching_index()
        users_by_num: Index optionnel {numero: user}
        numero_field: Nom du champ contenant le numéro (défaut: "numero_employe")
    
    Returns:
        dict: User object si trouvé, None sinon
        
    Exemples:
        find_user_intelligent("Bernard Sébastien (981)", index)
        find_user_intelligent("BERNARD Sebastien", index)
        find_user_intelligent("Jean-Pierre Dubois", index)
        find_user_intelligent("William Falardeau Roy", index) → trouve "William Falardeau-Roy"
    """
    if not search_string:
        return None
    
    # Extraire le nom sans le numéro entre parenthèses
    nom_complet = search_string.split("(")[0].strip()
    
    # Tentative 1: Par numéro d'employé
    if users_by_num and "(" in search_string and ")" in search_string:
        try:
            num = search_string.split("(")[1].split(")")[0].strip()
            if num and num in users_by_num:
                return users_by_num[num]
        except:
            pass
    
    # Tentative 2: Matching flexible par nom normalisé EXACT
    if nom_complet:
        normalized = normalize_string_for_matching(nom_complet)
        if normalized in users_by_name:
            return users_by_name[normalized]
    
    # Tentative 3: Parsing approfondi pour noms composés (essayer toutes les combinaisons)
    if nom_complet:
        parts = nom_complet.split()
        if len(parts) >= 2:
            # Essayer toutes les combinaisons de découpage
            for i in range(len(parts)):
                possible_prenom = " ".join(parts[:i+1])
                possible_nom = " ".join(parts[i+1:])
                
                if possible_nom:
                    # Ordre normal
                    test_key = normalize_string_for_matching(f"{possible_prenom} {possible_nom}")
                    if test_key in users_by_name:
                        return users_by_name[test_key]
                    
                    # Ordre inversé
                    test_key2 = normalize_string_for_matching(f"{possible_nom} {possible_prenom}")
                    if test_key2 in users_by_name:
                        return users_by_name[test_key2]
    
    # Tentative 4: BEST FIT - Recherche par similarité si aucun match exact
    # Calculer la similarité avec tous les utilisateurs et prendre le meilleur
    normalized = normalize_string_for_matching(nom_complet)
    
    best_match = None
    best_score = 0.6  # Seuil minimum de similarité (60%)
    
    for db_name_normalized, user in users_by_name.items():
        similarity = calculate_name_similarity(normalized, db_name_normalized)
        
        if similarity > best_score:
            best_score = similarity
            best_match = user
    
    if best_match:
        # Log pour debugging
        logging.info(f"✨ Best fit trouvé pour '{nom_complet}': {best_match.get('prenom')} {best_match.get('nom')} (score: {best_score:.2f})")
        return best_match
    
    return None


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
                         width="60" 
                         height="60"
                         style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
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
                    <a href="https://www.profiremanager.ca/{tenant_slug}" 
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
        
        # Envoyer l'email via Resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        
        if not resend_api_key:
            print(f"[WARNING] RESEND_API_KEY non configurée - Email non envoyé à {user_email}")
            return False
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        try:
            params = {
                "from": f"ProFireManager <{sender_email}>",
                "to": [user_email],
                "subject": subject,
                "html": html_content
            }
            
            response = resend.Emails.send(params)
            print(f"✅ Email de bienvenue envoyé avec succès à {user_email} via Resend (ID: {response.get('id', 'N/A')})")
            return True
        except Exception as resend_error:
            print(f"⚠️ Erreur Resend pour {user_email}: {str(resend_error)}")
            return False
                
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email à {user_email}: {str(e)}")
        return False


def send_temporary_password_email(user_email: str, user_name: str, temp_password: str, tenant_slug: str = ""):
    """
    Envoie un email avec le mot de passe temporaire suite à une réinitialisation par l'administrateur
    """
    try:
        subject = "Réinitialisation de votre mot de passe - ProFireManager"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" 
                         alt="ProFireManager" 
                         width="60" 
                         height="60"
                         style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
                    <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                    <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
                </div>
                
                <h2 style="color: #1e293b;">Bonjour {user_name},</h2>
                
                <p>Suite à votre demande, votre mot de passe a été réinitialisé par un administrateur.</p>
                
                <div style="background: #fef3c7; border: 2px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #92400e; margin-top: 0;">⚠️ IMPORTANT - Sécurité de votre compte</h3>
                    <p style="color: #92400e; font-weight: bold; margin: 10px 0;">
                        Si vous n'avez jamais demandé ce changement, veuillez communiquer avec votre administrateur le plus rapidement possible.
                    </p>
                </div>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #dc2626; margin-top: 0;">🔑 Votre nouveau mot de passe temporaire :</h3>
                    <p style="background: white; padding: 12px; border: 2px dashed #dc2626; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; text-align: center;">
                        {temp_password}
                    </p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://www.profiremanager.ca/{tenant_slug}" 
                       style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                        🚒 Se connecter à ProFireManager
                    </a>
                </div>
                
                <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                    <h4 style="color: #1e3a8a; margin-top: 0;">📍 Procédure pour changer votre mot de passe :</h4>
                    <ol style="color: #1e3a8a; margin: 10px 0;">
                        <li>Connectez-vous à ProFireManager avec le mot de passe temporaire ci-dessus</li>
                        <li>Cliquez sur <strong>"Mon Profil"</strong> dans le menu de gauche</li>
                        <li>Descendez en <strong>bas de la page</strong></li>
                        <li>Trouvez la section <strong>"Modifier le mot de passe"</strong></li>
                        <li>Entrez votre <strong>mot de passe actuel</strong> (le mot de passe temporaire)</li>
                        <li>Entrez votre <strong>nouveau mot de passe</strong> (8 caractères min, 1 majuscule, 1 chiffre, 1 caractère spécial)</li>
                        <li>Confirmez votre nouveau mot de passe</li>
                        <li>Cliquez sur <strong>"Enregistrer les modifications"</strong></li>
                    </ol>
                    <p style="color: #1e3a8a; margin: 10px 0;">
                        💡 <strong>Conseils de sécurité :</strong>
                    </p>
                    <ul style="color: #1e3a8a; margin: 10px 0;">
                        <li>Utilisez un mot de passe unique et complexe</li>
                        <li>Ne partagez jamais vos identifiants</li>
                        <li>Déconnectez-vous après chaque session</li>
                        <li>Changez votre mot de passe immédiatement</li>
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
        
        # Envoyer l'email via Resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        
        if not resend_api_key:
            print(f"[WARNING] RESEND_API_KEY non configurée - Email non envoyé à {user_email}")
            return False
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        try:
            params = {
                "from": f"ProFireManager <{sender_email}>",
                "to": [user_email],
                "subject": subject,
                "html": html_content
            }
            
            response = resend.Emails.send(params)
            print(f"✅ Email de réinitialisation envoyé avec succès à {user_email} via Resend (ID: {response.get('id', 'N/A')})")
            return True
        except Exception as resend_error:
            print(f"⚠️ Erreur Resend pour {user_email}: {str(resend_error)}")
            return False
                
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email de réinitialisation à {user_email}: {str(e)}")
        return False


def send_password_reset_email(user_email: str, user_name: str, reset_token: str, tenant_slug: str = ""):
    """
    Envoie un email avec un lien pour réinitialiser le mot de passe
    """
    try:
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        reset_link = f"{frontend_url}/{tenant_slug}/reset-password?token={reset_token}"
        
        subject = "Réinitialisation de votre mot de passe - ProFireManager"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" 
                         alt="ProFireManager" 
                         width="60" 
                         height="60"
                         style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
                    <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                    <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
                </div>
                
                <h2 style="color: #1e293b;">Bonjour {user_name},</h2>
                
                <p>Nous avons reçu une demande de réinitialisation de mot de passe pour votre compte ProFireManager.</p>
                
                <div style="background: #fef3c7; border: 2px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #92400e; margin-top: 0;">⚠️ IMPORTANT - Sécurité</h3>
                    <p style="color: #92400e; font-weight: bold; margin: 10px 0;">
                        Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste inchangé.
                    </p>
                    <p style="color: #78350f; margin: 10px 0;">
                        Ce lien est valide pendant <strong>1 heure</strong> seulement.
                    </p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_link}" 
                       style="background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                        🔐 Réinitialiser mon mot de passe
                    </a>
                </div>
                
                <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                    <p style="color: #1e3a8a; margin: 0; font-size: 14px;">
                        💡 <strong>Le lien ne fonctionne pas?</strong><br>
                        Copiez et collez cette adresse dans votre navigateur :<br>
                        <span style="font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all;">{reset_link}</span>
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #666; font-size: 14px; text-align: center;">
                    Cet email a été envoyé automatiquement par ProFireManager v2.0.<br>
                    Pour des questions de sécurité, contactez votre administrateur.
                </p>
                
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #999; font-size: 12px;">
                        ProFireManager v2.0 - Système de gestion des services d'incendie du Canada
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email via Resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        
        if not resend_api_key:
            print(f"[WARNING] RESEND_API_KEY non configurée - Email non envoyé à {user_email}")
            return False
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        try:
            params = {
                "from": f"ProFireManager <{sender_email}>",
                "to": [user_email],
                "subject": subject,
                "html": html_content
            }
            
            response = resend.Emails.send(params)
            print(f"✅ Email de réinitialisation de mot de passe envoyé avec succès à {user_email} via Resend (ID: {response.get('id', 'N/A')})")
            return True
        except Exception as resend_error:
            print(f"⚠️ Erreur Resend pour {user_email}: {str(resend_error)}")
            return False
                
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email de réinitialisation à {user_email}: {str(e)}")
        return False
        

def send_super_admin_welcome_email(user_email: str, user_name: str, temp_password: str):
    """
    Envoie un email de bienvenue à un nouveau super admin
    """
    try:
        frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
        admin_url = f"{frontend_url}/admin"
        
        subject = "Bienvenue en tant que Super Admin - ProFireManager"
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="https://customer-assets.emergentagent.com/job_fireshift-manager/artifacts/6vh2i9cz_05_Icone_Flamme_Rouge_Bordure_D9072B_VISIBLE.png" 
                         alt="ProFireManager" 
                         width="60" 
                         height="60"
                         style="width: 60px; height: 60px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">
                    <h1 style="color: #dc2626; margin: 0;">ProFireManager v2.0</h1>
                    <p style="color: #666; margin: 5px 0;">Système de gestion des services d'incendie</p>
                </div>
                
                <h2 style="color: #1e293b;">Bonjour {user_name},</h2>
                
                <p>Votre compte <strong>Super Administrateur</strong> a été créé avec succès dans ProFireManager v2.0.</p>
                
                <div style="background: #fef3c7; border: 2px solid #fcd34d; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #92400e; margin-top: 0;">👑 Privilèges de Super Admin</h3>
                    <p style="color: #92400e; margin: 10px 0;">
                        En tant que Super Admin, vous avez accès à:
                    </p>
                    <ul style="color: #78350f; margin: 10px 0;">
                        <li><strong>Tous les tenants/casernes</strong> de la plateforme</li>
                        <li><strong>Interface d'administration</strong> globale</li>
                        <li><strong>Gestion des autres super admins</strong></li>
                        <li><strong>Création et configuration</strong> des tenants</li>
                        <li><strong>Statistiques</strong> multi-tenant</li>
                    </ul>
                </div>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h3 style="color: #dc2626; margin-top: 0;">🔑 Informations de connexion :</h3>
                    <p><strong>Email :</strong> {user_email}</p>
                    <p><strong>Mot de passe temporaire :</strong> {temp_password}</p>
                    <p style="color: #dc2626; font-weight: bold;">⚠️ Veuillez modifier votre mot de passe lors de votre première connexion</p>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{admin_url}" 
                       style="background: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                        👑 Accéder à l'interface Super Admin
                    </a>
                    <p style="font-size: 12px; color: #666; margin-top: 10px;">
                        💡 Ajoutez ce lien à vos favoris pour un accès rapide
                    </p>
                </div>
                
                <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                    <h4 style="color: #1e40af; margin-top: 0;">📋 Fonctionnalités disponibles :</h4>
                    <ul style="color: #1e40af; margin: 0;">
                        <li>Gestion multi-tenant (création, édition, suppression)</li>
                        <li>Statistiques globales de la plateforme</li>
                        <li>Gestion des super administrateurs</li>
                        <li>Configuration des tenants</li>
                        <li>Surveillance des performances</li>
                    </ul>
                </div>
                
                <div style="background: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <h4 style="color: #991b1b; margin-top: 0;">🔒 IMPORTANT - Sécurité :</h4>
                    <p style="color: #991b1b; font-weight: bold; margin: 10px 0;">
                        ⚠️ Changez votre mot de passe temporaire IMMÉDIATEMENT !
                    </p>
                    <p style="color: #7f1d1d; margin: 10px 0;">
                        En tant que Super Admin, vous avez un accès complet au système. Utilisez des mots de passe forts et ne partagez jamais vos identifiants.
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
                
                <p style="color: #666; font-size: 14px; text-align: center;">
                    Cet email a été envoyé automatiquement par ProFireManager v2.0.<br>
                    Si vous n'avez pas demandé ce compte, contactez immédiatement l'administrateur système.
                </p>
                
                <div style="text-align: center; margin-top: 20px;">
                    <p style="color: #999; font-size: 12px;">
                        ProFireManager v2.0 - Système de gestion des services d'incendie du Canada
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        # Envoyer l'email via Resend
        resend_api_key = os.environ.get('RESEND_API_KEY')
        sender_email = os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca')
        
        if not resend_api_key:
            print(f"[WARNING] RESEND_API_KEY non configurée - Email non envoyé à {user_email}")
            return False
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        try:
            params = {
                "from": f"ProFireManager <{sender_email}>",
                "to": [user_email],
                "subject": subject,
                "html": html_content
            }
            
            response = resend.Emails.send(params)
            print(f"✅ Email de bienvenue super admin envoyé avec succès à {user_email} via Resend (ID: {response.get('id', 'N/A')})")
            return True
        except Exception as resend_error:
            print(f"⚠️ Erreur Resend pour {user_email}: {str(resend_error)}")
            return False
                
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email super admin à {user_email}: {str(e)}")
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
    resend_api_key = os.environ.get('RESEND_API_KEY')
    
    if not resend_api_key:
        print(f"[WARNING] RESEND_API_KEY non configurée - Email NON envoyé à {user_email}")
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
                    <a href="https://www.profiremanager.ca/{tenant_slug}" 
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
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        params = {
            "from": f"ProFireManager <{sender_email}>",
            "to": [user_email],
            "subject": subject,
            "html": html_content
        }
        
        response = resend.Emails.send(params)
        print(f"✅ Email de gardes envoyé avec succès à {user_email} via Resend (ID: {response.get('id', 'N/A')})")
        return True
            
    except Exception as e:
        print(f"❌ Erreur lors de l'envoi de l'email de gardes à {user_email}: {str(e)}")
        return False

# ==================== HELPERS PDF PERSONNALISÉS ====================

def create_pdf_header_elements(tenant, styles):
    """
    Crée les éléments de header personnalisés pour les PDFs
    Retourne une liste d'éléments à ajouter au document
    """
    elements = []
    
    # Logo (si présent)
    if hasattr(tenant, 'logo_url') and tenant.logo_url:
        try:
            if tenant.logo_url.startswith('data:image/'):
                # Extraire les données base64
                header, encoded = tenant.logo_url.split(',', 1)
                logo_data = base64.b64decode(encoded)
                logo_buffer = IOBytesIO(logo_data)
                
                # Utiliser PIL pour obtenir les dimensions de l'image
                from PIL import Image as PILImage
                pil_image = PILImage.open(logo_buffer)
                img_width, img_height = pil_image.size
                
                # Calculer les dimensions avec limites max pour éviter le dépassement
                max_width = 1.2 * inch
                max_height = 1.0 * inch  # Limite maximale de hauteur
                
                aspect_ratio = img_height / img_width
                
                # Calculer en fonction de la largeur
                target_width = max_width
                target_height = target_width * aspect_ratio
                
                # Si la hauteur dépasse la limite, recalculer en fonction de la hauteur
                if target_height > max_height:
                    target_height = max_height
                    target_width = target_height / aspect_ratio
                
                # Réinitialiser le buffer pour ReportLab
                logo_buffer.seek(0)
                
                # Ajouter le logo avec largeur et hauteur explicites
                logo = Image(logo_buffer, width=target_width, height=target_height)
                logo.hAlign = 'LEFT'
                elements.append(logo)
                elements.append(Spacer(1, 0.1 * inch))
        except Exception as e:
            print(f"Erreur chargement logo PDF: {e}")
    
    # Nom du service
    nom_service = tenant.nom_service if hasattr(tenant, 'nom_service') and tenant.nom_service else tenant.nom
    
    header_style = ParagraphStyle(
        'ServiceHeader',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    elements.append(Paragraph(nom_service, header_style))
    elements.append(Spacer(1, 0.2 * inch))
    
    return elements

def create_pdf_footer_text(tenant):
    """
    Crée le texte du footer pour les PDFs
    """
    footer_parts = []
    
    # Toujours afficher ProFireManager (sauf si explicitement désactivé)
    if not hasattr(tenant, 'afficher_profiremanager') or tenant.afficher_profiremanager:
        footer_parts.append("Généré par ProFireManager • www.profiremanager.com")
    
    return " | ".join(footer_parts) if footer_parts else ""

# Classe CustomDocTemplate avec branding automatique
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame
from reportlab.pdfgen import canvas as pdf_canvas

class BrandedDocTemplate(SimpleDocTemplate):
    """
    Template de document PDF personnalisé avec branding tenant automatique
    Hérite de SimpleDocTemplate pour la simplicité
    """
    def __init__(self, filename, tenant=None, **kwargs):
        self.tenant = tenant
        # Appeler le constructeur de SimpleDocTemplate
        SimpleDocTemplate.__init__(self, filename, **kwargs)
    
    def afterPage(self, canvas=None, doc=None):
        """
        Méthode appelée après chaque page pour ajouter le branding
        Compatible avec ReportLab 4.x - peut être appelée avec ou sans arguments
        Args:
            canvas: Le canvas de la page (optionnel)
            doc: Le document (optionnel)
        """
        # Cette méthode peut être étendue pour ajouter des éléments de branding
        # comme des footers, logos, etc.
        pass



def create_branded_pdf(tenant, pagesize=A4, **kwargs):
    """
    Fonction helper pour créer un PDF brandé avec logo et footer
    
    Args:
        tenant: L'objet tenant
        pagesize: Taille de la page (A4, letter, etc.)
        **kwargs: Arguments additionnels pour SimpleDocTemplate
        
    Returns:
        tuple: (buffer, doc, elements_with_header)
        - buffer: BytesIO object
        - doc: SimpleDocTemplate instance avec branding
        - elements_with_header: Liste avec logo et header déjà ajoutés
    """
    from io import BytesIO
    from reportlab.lib.styles import getSampleStyleSheet
    
    buffer = BytesIO()
    
    # Utiliser les marges par défaut si non spécifiées
    if 'topMargin' not in kwargs:
        kwargs['topMargin'] = 0.75 * inch
    if 'bottomMargin' not in kwargs:
        kwargs['bottomMargin'] = 0.75 * inch
    
    # Utiliser SimpleDocTemplate directement pour la simplicité
    doc = SimpleDocTemplate(buffer, pagesize=pagesize, **kwargs)
    styles = getSampleStyleSheet()
    
    # Créer les éléments de base avec logo et header
    elements = create_pdf_header_elements(tenant, styles)
    
    # Ajouter le footer à la fin du document
    footer_text = create_pdf_footer_text(tenant)
    if footer_text:
        from reportlab.platypus import Paragraph
        from reportlab.lib.enums import TA_CENTER
        from reportlab.lib.styles import ParagraphStyle
        
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=TA_CENTER,
            spaceAfter=0
        )
        # Note: Le footer sera ajouté à la fin du document par l'appelant si nécessaire
    
    return buffer, doc, elements


def get_modern_pdf_styles(styles):
    """
    Retourne les styles modernes standardisés pour tous les PDFs
    Basé sur le design du rapport d'inspection (Ronde de sécurité)
    """
    title_style = ParagraphStyle(
        'ModernTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading_style = ParagraphStyle(
        'ModernHeading',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#374151'),
        spaceAfter=12,
        spaceBefore=20
    )
    
    subheading_style = ParagraphStyle(
        'ModernSubheading',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#374151'),
        spaceAfter=10,
        alignment=TA_CENTER
    )
    
    return {
        'title': title_style,
        'heading': heading_style,
        'subheading': subheading_style,
        'primary_color': colors.HexColor('#1f2937'),
        'secondary_color': colors.HexColor('#374151'),
        'bg_light': colors.HexColor('#f3f4f6'),
        'success': colors.HexColor('#10b981'),
        'error': colors.HexColor('#ef4444'),
        'grid': colors.HexColor('#e5e7eb'),
        'warning_bg': colors.HexColor('#fef2f2')
    }

# ==================== FIN HELPERS PDF ====================

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
            logging.error(f"❌ Hash invalide ou non-bcrypt détecté")
            return False
        
        if isinstance(hashed_password, str):
            hash_bytes = hashed_password.encode('utf-8')
        else:
            hash_bytes = hashed_password
        
        result = bcrypt.checkpw(password_bytes, hash_bytes)
        logging.info(f"✅ Vérification bcrypt: {result}")
        return result
        
    except Exception as e:
        logging.error(f"❌ Erreur vérification mot de passe: {e}")
        return False



def send_debogage_notification_email(super_admins_emails: List[str], type_notification: str, titre: str, description: str, priorite: str, created_by: str, item_id: str):
    """
    Envoie un email aux super-admins pour les notifier d'un nouveau bug ou feature request
    
    Args:
        super_admins_emails: Liste des emails des super-admins
        type_notification: "bug" ou "feature"
        titre: Titre du bug/feature
        description: Description
        priorite: Priorité (critique, haute, moyenne, basse)
        created_by: Nom de la personne qui a créé
        item_id: ID du bug/feature
    """
    try:
        resend_api_key = os.environ.get('RESEND_API_KEY')
        
        if not resend_api_key:
            print(f"[WARNING] RESEND_API_KEY non configurée - Email NON envoyé")
            return
        
        # Configurer Resend
        resend.api_key = resend_api_key
        
        # Déterminer le type et l'emoji
        if type_notification == "bug":
            type_label = "🐛 Nouveau Bug Signalé"
            color = "#dc2626"  # rouge
        else:
            type_label = "✨ Nouvelle Fonctionnalité Demandée"
            color = "#2563eb"  # bleu
        
        # Déterminer la couleur de priorité
        priorite_colors = {
            "critique": "#dc2626",
            "haute": "#f97316",
            "moyenne": "#eab308",
            "basse": "#22c55e"
        }
        priorite_color = priorite_colors.get(priorite, "#6b7280")
        
        # Créer l'URL de l'interface admin
        admin_url = f"{os.environ.get('FRONTEND_URL', 'http://localhost:3000')}/admin"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8fafc;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, {color} 0%, {color}dd 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">
                {type_label}
            </h1>
        </div>
        
        <!-- Content -->
        <div style="background-color: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <!-- Titre -->
            <div style="margin-bottom: 20px;">
                <h2 style="margin: 0 0 10px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                    {titre}
                </h2>
                <div style="display: inline-block; padding: 4px 12px; background-color: {priorite_color}; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    Priorité: {priorite}
                </div>
            </div>
            
            <!-- Description -->
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid {color};">
                <p style="margin: 0; color: #475569; line-height: 1.6;">
                    {description[:200]}{'...' if len(description) > 200 else ''}
                </p>
            </div>
            
            <!-- Info supplémentaires -->
            <div style="margin-bottom: 25px; padding: 15px; background-color: #eff6ff; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
                    <strong>Créé par:</strong> {created_by}
                </p>
                <p style="margin: 0; color: #64748b; font-size: 14px;">
                    <strong>ID:</strong> {item_id[:8]}...
                </p>
            </div>
            
            <!-- Call to Action -->
            <div style="text-align: center; margin-top: 30px;">
                <a href="{admin_url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, {color} 0%, {color}dd 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    Voir dans l'Interface Admin
                </a>
            </div>
        </div>
        
        <!-- Footer -->
        <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">ProFireManager - Système de Gestion de Sécurité Incendie</p>
            <p style="margin: 5px 0 0 0;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
    </div>
</body>
</html>
"""
        
        # Envoyer l'email à tous les super-admins avec Resend
        for admin_email in super_admins_emails:
            try:
                params = {
                    "from": "ProFireManager <noreply@profiremanager.ca>",
                    "to": [admin_email],
                    "subject": f"{type_label}: {titre}",
                    "html": html_content
                }
                
                response = resend.Emails.send(params)
                print(f"[INFO] Email de notification envoyé à {admin_email} via Resend (ID: {response.get('id', 'N/A')})")
            except Exception as e:
                print(f"[ERROR] Erreur lors de l'envoi de l'email à {admin_email}: {e}")
                
    except Exception as e:
        print(f"[ERROR] Erreur générale lors de l'envoi des emails de débogage: {e}")

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
    # Personnalisation
    logo_url: str = ""  # URL ou base64 du logo
    nom_service: str = ""  # Nom complet du service (ex: "Service Incendie de Ville-X")
    afficher_profiremanager: bool = True  # Afficher le branding ProFireManager
    # Centrale 911 associée
    centrale_911_id: Optional[str] = None  # FK vers centrales_911
    # Facturation Stripe
    is_gratuit: bool = False  # Tenant gratuit (pas de facturation)
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    billing_status: str = "inactive"  # inactive, active, past_due, cancelled, trial
    billing_cycle: str = "monthly"  # monthly ou annual
    last_payment_date: Optional[str] = None
    last_payment_amount: Optional[float] = None
    next_billing_date: Optional[str] = None
    payment_failed_date: Optional[str] = None  # Date du premier échec de paiement
    launch_offer_applied: bool = False  # Offre de lancement appliquée

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
    centrale_911_id: Optional[str] = None  # Centrale 911 associée

class SuperAdmin(BaseModel):
    """Super administrateur gérant toutes les casernes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    nom: str = "Super Admin"
    mot_de_passe_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SuperAdminLogin(BaseModel):
    email: str
    mot_de_passe: str  # Cohérent avec le frontend français

# ==================== AUDIT LOG MODELS ====================

class AuditLog(BaseModel):
    """Journal d'audit pour les actions super-admin"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    admin_id: str  # ID du super-admin
    admin_email: str  # Email du super-admin
    admin_nom: str  # Nom du super-admin
    action: str  # Type d'action (login, tenant_access, tenant_create, etc.)
    details: Dict[str, Any] = {}  # Détails spécifiques à l'action
    tenant_id: Optional[str] = None  # Tenant concerné (si applicable)
    tenant_slug: Optional[str] = None  # Slug du tenant (si applicable)
    tenant_nom: Optional[str] = None  # Nom du tenant (si applicable)
    ip_address: Optional[str] = None  # Adresse IP (si disponible)
    user_agent: Optional[str] = None  # User agent (si disponible)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


async def log_super_admin_action(
    admin: "SuperAdmin",
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
    
    Actions possibles:
    - login: Connexion au dashboard super-admin
    - tenant_access: Connexion à un tenant spécifique
    - tenant_create: Création d'un nouveau tenant
    - tenant_update: Modification d'un tenant
    - tenant_delete: Suppression d'un tenant
    - admin_create: Création d'un admin pour un tenant
    - view_stats: Consultation des statistiques globales
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
        logging.info(f"📝 [AUDIT] {admin.email} - {action}" + (f" - Tenant: {tenant_slug}" if tenant_slug else ""))
    except Exception as e:
        logging.error(f"❌ Erreur enregistrement audit: {e}")
        # Ne pas bloquer l'action principale si l'audit échoue

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
    grade: str = "Pompier"  # Capitaine, Directeur, Pompier, Lieutenant (default pour anciens users)
    fonction_superieur: bool = False  # Pour pompiers pouvant agir comme lieutenant
    type_emploi: str = "temps_plein"  # temps_plein, temps_partiel (default pour anciens users)
    heures_max_semaine: int = 40  # Heures max par semaine (pour temps partiel)
    role: str = "employe"  # admin, superviseur, employe (default pour anciens users)
    statut: str = "Actif"  # Actif, Inactif
    numero_employe: str = ""
    date_embauche: str = ""
    taux_horaire: float = 0.0  # Taux horaire en $/h
    heures_internes: float = 0.0  # Heures de garde internes (travail physique)
    heures_externes: float = 0.0  # Heures de garde externes (astreinte à domicile)
    formations: List[str] = []  # Liste des UUIDs de formations suivies (pour module Formation)
    competences: List[str] = []  # Liste des UUIDs de compétences acquises/certifiées (pour auto-attribution)
    accepte_gardes_externes: bool = True  # Accepte d'être assigné aux gardes externes
    est_preventionniste: bool = False  # Désigné comme préventionniste (module Prévention)
    equipe_garde: Optional[int] = None  # Équipe de garde (1, 2, 3, 4, 5 selon config du tenant)
    photo_profil: Optional[str] = None  # Photo de profil en base64 (redimensionnée 200x200)
    tailles_epi: Dict[str, str] = {}  # Tailles EPI de l'employé {type_epi: taille}
    mot_de_passe_hash: str = ""
    is_super_admin: bool = False  # Flag pour identifier les super-admins connectés sur un tenant
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
    formations: List[str] = []  # Liste des formations suivies
    competences: List[str] = []  # Liste des compétences acquises
    accepte_gardes_externes: bool = True  # Accepte d'être assigné aux gardes externes
    est_preventionniste: bool = False  # Désigné comme préventionniste
    equipe_garde: Optional[int] = None  # Équipe de garde (1, 2, 3, 4, 5 selon config)
    mot_de_passe: str = "TempPass123!"

class UserUpdate(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    contact_urgence: Optional[str] = None
    grade: Optional[str] = None
    fonction_superieur: Optional[bool] = None
    type_emploi: Optional[str] = None
    heures_max_semaine: Optional[int] = None
    role: Optional[str] = None
    numero_employe: Optional[str] = None
    date_embauche: Optional[str] = None
    taux_horaire: Optional[float] = None
    formations: Optional[List[str]] = None
    competences: Optional[List[str]] = None
    accepte_gardes_externes: Optional[bool] = None
    est_preventionniste: Optional[bool] = None
    equipe_garde: Optional[int] = None  # Équipe de garde (1, 2, 3, 4, 5 selon config)
    photo_profil: Optional[str] = None  # Photo de profil en base64
    tailles_epi: Optional[Dict[str, str]] = None  # Tailles EPI de l'employé
    mot_de_passe: Optional[str] = None  # Optionnel pour les mises à jour

class UserLogin(BaseModel):
    email: str
    mot_de_passe: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    nouveau_mot_de_passe: str

class BillingRequest(BaseModel):
    return_url: str

class PasswordResetToken(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    email: str
    token: str
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

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
    est_garde_externe: bool = False  # True si c'est une garde externe (astreinte à domicile)
    taux_horaire_externe: Optional[float] = None  # Taux horaire spécifique pour garde externe
    montant_garde: Optional[float] = None  # Montant fixe de la garde (prime)
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
    est_garde_externe: bool = False
    taux_horaire_externe: Optional[float] = None
    montant_garde: Optional[float] = None  # Montant fixe de la garde (prime)

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
    justification: Optional[Dict[str, Any]] = None  # Justification détaillée pour assignations auto
    notes_admin: Optional[str] = None  # Notes manuelles de l'admin
    justification_historique: Optional[List[Dict[str, Any]]] = None  # Historique des justifications

class AssignationCreate(BaseModel):
    tenant_id: Optional[str] = None  # Sera fourni automatiquement par l'endpoint
    user_id: str
    type_garde_id: str
    date: str
    assignation_type: str = "manuel"

# ==================== MODÈLES REMPLACEMENT MIGRÉS VERS routes/remplacements.py ====================
# TentativeRemplacement, DemandeRemplacement, DemandeRemplacementCreate
# ont été déplacés vers routes/remplacements.py
# ============================================================================

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
    user_inscrit: bool = False  # Si l'utilisateur actuel est inscrit
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

class Grade(BaseModel):
    """Grade hiérarchique pour les pompiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    niveau_hierarchique: int  # 1 = niveau le plus bas, 10 = niveau le plus haut
    est_officier: bool = False  # True si ce grade est considéré comme un officier
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GradeCreate(BaseModel):
    tenant_id: Optional[str] = None
    nom: str
    niveau_hierarchique: int
    est_officier: bool = False

class GradeUpdate(BaseModel):
    nom: Optional[str] = None
    niveau_hierarchique: Optional[int] = None
    est_officier: Optional[bool] = None

class ParametresFormations(BaseModel):
    """Paramètres globaux formations pour NFPA 1500"""
    tenant_id: str
    heures_minimales_annuelles: float = 100.0
    pourcentage_presence_minimum: float = 80.0
    delai_notification_liste_attente: int = 7  # jours
    email_notifications_actif: bool = True
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ValidationCompetence(BaseModel):
    """Validation manuelle d'une compétence pour un employé"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str
    competence_id: str
    justification: str
    date_validation: str  # Date au format ISO
    validee_par: str  # ID de l'administrateur qui a validé
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ValidationCompetenceCreate(BaseModel):
    user_id: str
    competence_id: str
    justification: str
    date_validation: str

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
    origine: str = "manuelle"  # manuelle, montreal_7_24, quebec_10_14, longueuil_7_24, personnalisee

class IndisponibiliteGenerate(BaseModel):
    user_id: str
    horaire_type: str  # "montreal", "quebec" ou "longueuil"
    equipe: str  # "Rouge", "Jaune", "Bleu", "Vert"
    date_debut: str  # Date de début (YYYY-MM-DD)
    date_fin: str  # Date de fin (YYYY-MM-DD)
    date_jour_1: Optional[str] = None  # Pour Quebec 10/14, date du Jour 1 du cycle (YYYY-MM-DD)
    conserver_manuelles: bool = True  # Conserver les modifications manuelles lors de la régénération

class DisponibiliteReinitialiser(BaseModel):
    user_id: str
    periode: str  # "semaine", "mois", "annee", "personnalisee"
    mode: str  # "tout" ou "generees_seulement"
    type_entree: str = "les_deux"  # "disponibilites", "indisponibilites", "les_deux"
    date_debut: Optional[str] = None  # Pour période personnalisée (YYYY-MM-DD)
    date_fin: Optional[str] = None  # Pour période personnalisée (YYYY-MM-DD)

class ConflictResolution(BaseModel):
    """Historique des résolutions de conflits disponibilité/indisponibilité"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    user_id: str  # Utilisateur qui a créé et résolu le conflit
    affected_user_id: str  # Utilisateur dont les dispos/indispos sont affectées
    action: str  # "supprimer_conflits", "creer_quand_meme", "annuler"
    type_created: str  # "disponibilite" ou "indisponibilite"
    conflicts_deleted: List[Dict[str, Any]] = []  # Liste des éléments supprimés
    created_item: Optional[Dict[str, Any]] = None  # L'élément créé
    resolved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConflictDetail(BaseModel):
    """Détails d'un conflit détecté"""
    conflict_id: str
    conflict_type: str  # "disponibilite" ou "indisponibilite"
    date: str
    heure_debut: str
    heure_fin: str
    type_garde_id: Optional[str] = None
    type_garde_nom: Optional[str] = None
    statut: str
    overlap_start: str  # Début du chevauchement
    overlap_end: str  # Fin du chevauchement

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

# ==================== GESTION DES ACTIFS MODELS ====================

class LocalisationGPS(BaseModel):
    lat: float
    lng: float

class Vehicule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Nom/Identifiant du véhicule (ex: "391", "Autopompe 1")
    type_vehicule: Optional[str] = None  # ex: Autopompe, Citerne, Pick-up, Échelle
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None  # Numéro d'identification du véhicule
    statut: str = "actif"  # actif, maintenance, retraite
    date_mise_service: Optional[str] = None  # Date format YYYY-MM-DD
    modele_inventaire_id: Optional[str] = None  # Modèle d'inventaire assigné
    photos: List[str] = []  # URLs ou base64 des photos
    documents: List[Dict[str, str]] = []  # [{nom: "doc.pdf", url: "..."}]
    notes: Optional[str] = None
    # Inspection SAAQ
    derniere_inspection_id: Optional[str] = None
    derniere_inspection_date: Optional[str] = None
    # QR Code
    qr_code: Optional[str] = None  # QR code en base64
    qr_code_url: Optional[str] = None  # URL encodée dans le QR code
    # Fiche de vie (audit trail)
    logs: List[Dict[str, Any]] = []  # Historique complet des actions
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class VehiculeCreate(BaseModel):
    nom: str
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: str = "actif"
    date_mise_service: Optional[str] = None
    photos: List[str] = []
    documents: List[Dict[str, str]] = []
    notes: Optional[str] = None

class VehiculeUpdate(BaseModel):
    nom: Optional[str] = None
    type_vehicule: Optional[str] = None
    marque: Optional[str] = None
    modele: Optional[str] = None
    annee: Optional[int] = None
    kilometrage: Optional[float] = None
    vin: Optional[str] = None
    statut: Optional[str] = None
    date_mise_service: Optional[str] = None
    modele_inventaire_id: Optional[str] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[Dict[str, str]]] = None
    notes: Optional[str] = None

class BorneIncendie(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Nom de la borne (ex: "Allen", "Borne Wallace")
    type_borne: str  # "seche" ou "fontaine"
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None  # Chemin transversal
    municipalite: Optional[str] = None
    debit: Optional[str] = None  # Débit en GPM ou autre
    statut: str = "operationnelle"  # operationnelle, hors_service, a_verifier
    date_derniere_inspection: Optional[str] = None  # Date format YYYY-MM-DD
    lien_maps: Optional[str] = None  # Lien Google Maps
    photos: List[str] = []  # URLs ou base64 des photos
    schemas: List[str] = []  # Schémas techniques
    notes_importantes: Optional[str] = None
    # QR Code
    qr_code: Optional[str] = None  # QR code en base64
    qr_code_url: Optional[str] = None  # URL encodée dans le QR code
    # Fiche de vie (audit trail)
    logs: List[Dict[str, Any]] = []  # Historique complet des actions
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BorneIncendieCreate(BaseModel):
    nom: str
    type_borne: str  # "seche" ou "fontaine"
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: str = "operationnelle"
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: List[str] = []
    schemas: List[str] = []
    notes_importantes: Optional[str] = None

class BorneIncendieUpdate(BaseModel):
    nom: Optional[str] = None
    type_borne: Optional[str] = None
    localisation_gps: Optional[LocalisationGPS] = None
    adresse: Optional[str] = None
    transversale: Optional[str] = None
    municipalite: Optional[str] = None
    debit: Optional[str] = None
    statut: Optional[str] = None
    date_derniere_inspection: Optional[str] = None
    lien_maps: Optional[str] = None
    photos: Optional[List[str]] = None
    schemas: Optional[List[str]] = None
    notes_importantes: Optional[str] = None

# ==================== INVENTAIRES VÉHICULES MODELS ====================

class ItemInventaire(BaseModel):
    """Un item dans une section d'inventaire"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str  # Ex: "Masque bleu chirurgical"
    type_item: str = "checkbox"  # checkbox, text, number
    obligatoire: bool = False
    ordre: int = 0  # Pour l'affichage

class SectionInventaire(BaseModel):
    """Une section dans un modèle d'inventaire"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str  # Ex: "Cabine"
    description: Optional[str] = None
    photos_reference: List[str] = []  # Photos du compartiment pour guider
    items: List[ItemInventaire] = []
    ordre: int = 0

class ModeleInventaire(BaseModel):
    """Template d'inventaire pour un type de véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Inventaire Autopompe 391"
    description: Optional[str] = None
    type_vehicule: Optional[str] = None  # Pour filtrer
    sections: List[SectionInventaire] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModeleInventaireCreate(BaseModel):
    nom: str
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: List[SectionInventaire] = []

class ModeleInventaireUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    type_vehicule: Optional[str] = None
    sections: Optional[List[SectionInventaire]] = None

class ResultatItemInspection(BaseModel):
    """Résultat pour un item lors d'une inspection"""
    item_id: str
    section_id: str
    statut: str  # "present", "absent", "non_applicable"
    notes: Optional[str] = None
    photo_url: Optional[str] = None  # Photo de l'item si problème

class InspectionInventaire(BaseModel):
    """Inspection d'inventaire d'un véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str  # User qui fait l'inspection
    inspecteur_nom: Optional[str] = None
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str = "en_cours"  # en_cours, complete
    resultats: List[ResultatItemInspection] = []
    notes_generales: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

class InspectionInventaireCreate(BaseModel):
    vehicule_id: str
    modele_inventaire_id: str
    inspecteur_id: str

class InspectionInventaireUpdate(BaseModel):
    statut: Optional[str] = None
    resultats: Optional[List[ResultatItemInspection]] = None
    notes_generales: Optional[str] = None

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
    Supporte aussi les super-admins qui peuvent accéder à tous les tenants
    """
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")  # Tenant ID stocké dans le token
        is_super_admin: bool = payload.get("is_super_admin", False)  # Flag super-admin
        
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token invalide")
    
    # Si c'est un super-admin, créer un User virtuel avec droits admin
    if is_super_admin:
        super_admin_data = await db.super_admins.find_one({"id": user_id})
        if super_admin_data is None:
            raise HTTPException(status_code=401, detail="Super-admin non trouvé")
        
        # Créer un User virtuel pour le super-admin avec le tenant_id du token
        virtual_user = {
            "id": super_admin_data["id"],
            "tenant_id": tenant_id,
            "email": super_admin_data["email"],
            "nom": super_admin_data["nom"],
            "prenom": "Super-Admin",
            "role": "admin",  # Super-admin a tous les droits admin
            "grade": "Super-Administrateur",
            "type_emploi": "temps_plein",
            "statut": "Actif",
            "numero_employe": "SUPER-ADMIN",
            "telephone": "",
            "date_embauche": "",
            "photo_profil": None,
            "est_preventionniste": True,  # Accès à tous les modules
            "is_super_admin": True  # Flag pour identifier
        }
        return User(**virtual_user)
    
    # Sinon, chercher l'utilisateur normal
    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
    
    # Vérifier que l'utilisateur appartient au tenant si tenant_slug est fourni
    if tenant_slug:
        tenant = await get_tenant_from_slug(tenant_slug)
        user_tenant_id = user.get("tenant_id")
        if user_tenant_id != tenant.id:
            logging.warning(f"❌ Accès refusé - User tenant_id={user_tenant_id} != tenant.id={tenant.id}")
            raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    return User(**user)

# Version optionnelle qui retourne None au lieu de lever une exception
security_optional = HTTPBearer(auto_error=False)

async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security_optional), tenant_slug: str = None):
    """
    Version optionnelle de get_current_user - retourne None si pas de token valide.
    Utilisé pour les endpoints qui supportent aussi l'authentification via paramètre URL (mobile).
    Supporte aussi les super-admins.
    """
    if credentials is None:
        return None
    
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        tenant_id: str = payload.get("tenant_id")
        is_super_admin: bool = payload.get("is_super_admin", False)
        
        if user_id is None:
            return None
    except jwt.PyJWTError:
        return None
    
    # Si c'est un super-admin, créer un User virtuel
    if is_super_admin:
        super_admin_data = await db.super_admins.find_one({"id": user_id})
        if super_admin_data is None:
            return None
        
        virtual_user = {
            "id": super_admin_data["id"],
            "tenant_id": tenant_id,
            "email": super_admin_data["email"],
            "nom": super_admin_data["nom"],
            "prenom": "Super-Admin",
            "role": "admin",
            "grade": "Super-Administrateur",
            "type_emploi": "temps_plein",
            "statut": "Actif",
            "numero_employe": "SUPER-ADMIN",
            "telephone": "",
            "date_embauche": "",
            "photo_profil": None,
            "est_preventionniste": True,
            "is_super_admin": True
        }
        return User(**virtual_user)
    
    user = await db.users.find_one({"id": user_id})
    if user is None:
        return None
    
    return User(**user)

async def trouver_opportunites_regroupement(
    date_str: str,
    types_garde: list,
    existing_assignations: list,
    duree_max: int,
    tenant_id: str
):
    """
    Trouve les opportunités de regroupement de gardes pour une date donnée
    
    Returns:
        List de tuples (type_garde_1, type_garde_2_or_None, date_2_or_None) représentant les regroupements possibles
    """
    opportunites = []
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    date_suivante_str = (date_obj + timedelta(days=1)).strftime("%Y-%m-%d")
    
    # 1. MÊME JOURNÉE: Chercher des gardes qui peuvent se regrouper dans la même journée
    gardes_date = [tg for tg in types_garde]
    
    for i, tg1 in enumerate(gardes_date):
        # Chercher dans les gardes suivantes
        for tg2 in gardes_date[i+1:]:
            duree_totale = tg1.get("duree_heures", 8) + tg2.get("duree_heures", 8)
            
            if duree_totale <= duree_max:
                # Vérifier qu'elles ne sont pas déjà assignées
                assignations_tg1 = [a for a in existing_assignations 
                                   if a["date"] == date_str and a["type_garde_id"] == tg1["id"]]
                assignations_tg2 = [a for a in existing_assignations 
                                   if a["date"] == date_str and a["type_garde_id"] == tg2["id"]]
                
                places_tg1 = tg1.get("nombre_pompiers_requis", 1) - len(assignations_tg1)
                places_tg2 = tg2.get("nombre_pompiers_requis", 1) - len(assignations_tg2)
                
                if places_tg1 > 0 and places_tg2 > 0:
                    # Opportunité de regroupement même journée
                    opportunites.append({
                        "type": "meme_journee",
                        "garde1": tg1,
                        "garde2": tg2,
                        "date1": date_str,
                        "date2": date_str,
                        "duree_totale": duree_totale
                    })
    
    # 2. JOURS CONSÉCUTIFS: Chercher des gardes sur jour J et J+1
    for tg1 in types_garde:
        for tg2 in types_garde:
            duree_totale = tg1.get("duree_heures", 8) + tg2.get("duree_heures", 8)
            
            if duree_totale <= duree_max:
                # Vérifier qu'elles ne sont pas déjà assignées
                assignations_tg1 = [a for a in existing_assignations 
                                   if a["date"] == date_str and a["type_garde_id"] == tg1["id"]]
                assignations_tg2 = [a for a in existing_assignations 
                                   if a["date"] == date_suivante_str and a["type_garde_id"] == tg2["id"]]
                
                places_tg1 = tg1.get("nombre_pompiers_requis", 1) - len(assignations_tg1)
                places_tg2 = tg2.get("nombre_pompiers_requis", 1) - len(assignations_tg2)
                
                if places_tg1 > 0 and places_tg2 > 0:
                    # Opportunité de regroupement jours consécutifs
                    opportunites.append({
                        "type": "jours_consecutifs",
                        "garde1": tg1,
                        "garde2": tg2,
                        "date1": date_str,
                        "date2": date_suivante_str,
                        "duree_totale": duree_totale
                    })
    
    return opportunites

async def calculer_heures_employe_periode(user_id: str, tenant_id: str, date_reference: str, periode: str, jours_personnalises: int = 7):
    """
    Calcule les heures travaillées par un employé sur une période donnée
    
    Args:
        user_id: ID de l'employé
        tenant_id: ID du tenant
        date_reference: Date de référence (format YYYY-MM-DD)
        periode: Type de période ("semaine", "mois", "personnalise")
        jours_personnalises: Nombre de jours si période personnalisée
    
    Returns:
        Nombre d'heures travaillées sur la période
    """
    date_ref = datetime.strptime(date_reference, "%Y-%m-%d")
    
    # Calculer date_debut et date_fin selon la période
    if periode == "semaine":
        # Du lundi au dimanche de la semaine en cours
        date_debut = date_ref - timedelta(days=date_ref.weekday())
        date_fin = date_debut + timedelta(days=6)
    elif periode == "mois":
        # Du 1er au dernier jour du mois
        date_debut = date_ref.replace(day=1)
        # Dernier jour du mois
        if date_ref.month == 12:
            date_fin = date_ref.replace(day=31)
        else:
            date_fin = (date_ref.replace(month=date_ref.month + 1, day=1) - timedelta(days=1))
    else:  # personnalise
        # X jours glissants avant la date de référence
        date_debut = date_ref - timedelta(days=jours_personnalises - 1)
        date_fin = date_ref
    
    date_debut_str = date_debut.strftime("%Y-%m-%d")
    date_fin_str = date_fin.strftime("%Y-%m-%d")
    
    # Récupérer toutes les assignations de l'employé sur cette période
    assignations = await db.assignations.find({
        "user_id": user_id,
        "tenant_id": tenant_id,
        "date": {
            "$gte": date_debut_str,
            "$lte": date_fin_str
        }
    }).to_list(1000)
    
    # Calculer le total des heures
    total_heures = 0
    for assignation in assignations:
        # Récupérer le type de garde pour obtenir la durée
        type_garde = await db.types_garde.find_one({"id": assignation["type_garde_id"]})
        if type_garde:
            total_heures += type_garde.get("duree_heures", 8)
    
    return total_heures

# Root route
@api_router.get("/")
async def root():
    return {"message": "ProFireManager API v2.0 - Multi-Tenant", "status": "running"}


# ==================== DÉBOGAGE MODELS ====================

class CommentaireDebogage(BaseModel):
    user_id: str
    user_name: str
    texte: str
    date: datetime

class HistoriqueStatut(BaseModel):
    ancien_statut: str
    nouveau_statut: str
    user_id: str
    user_name: str
    date: datetime

class BugReport(BaseModel):
    id: str
    titre: str
    description: str
    module: str  # Planning, Mes Disponibilités, Personnel, etc.
    priorite: str  # critique, haute, moyenne, basse
    etapes_reproduction: str
    resultat_attendu: str
    resultat_observe: str
    navigateur: Optional[str] = None
    os: Optional[str] = None
    role_utilisateur: Optional[str] = None
    console_logs: Optional[str] = None
    infos_supplementaires: Optional[str] = None
    images: Optional[List[str]] = []  # URLs des images
    statut: str = "nouveau"  # nouveau, en_cours, test, resolu, ferme
    commentaires: Optional[List[dict]] = []
    historique_statuts: Optional[List[dict]] = []
    created_by: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    tenant_slug: Optional[str] = None  # Si bug lié à un tenant spécifique

class BugReportCreate(BaseModel):
    titre: str
    description: str
    module: str
    priorite: str
    etapes_reproduction: str
    resultat_attendu: str
    resultat_observe: str
    navigateur: Optional[str] = None
    os: Optional[str] = None
    role_utilisateur: Optional[str] = None
    console_logs: Optional[str] = None
    infos_supplementaires: Optional[str] = None
    images: Optional[List[str]] = []
    tenant_slug: Optional[str] = None

class FeatureRequest(BaseModel):
    id: str
    titre: str
    description: str
    probleme_a_resoudre: str
    solution_proposee: str
    alternatives: Optional[str] = None
    module: str
    priorite: str
    utilisateurs_concernes: List[str] = []  # admin, superviseur, employe, tous
    cas_usage: str
    dependances: Optional[str] = None
    infos_supplementaires: Optional[str] = None
    images: Optional[List[str]] = []
    statut: str = "nouveau"
    commentaires: Optional[List[dict]] = []
    historique_statuts: Optional[List[dict]] = []
    created_by: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime

class FeatureRequestCreate(BaseModel):
    titre: str
    description: str
    probleme_a_resoudre: str
    solution_proposee: str
    alternatives: Optional[str] = None
    module: str
    priorite: str
    utilisateurs_concernes: List[str] = []
    cas_usage: str
    dependances: Optional[str] = None
    infos_supplementaires: Optional[str] = None
    images: Optional[List[str]] = []

class CommentaireDeDebogageCreate(BaseModel):
    texte: str

class ChangementStatut(BaseModel):
    nouveau_statut: str

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


@api_router.get("/admin/tenants/by-slug/{tenant_slug}")
async def get_tenant_by_slug(tenant_slug: str):
    """Récupérer un tenant par son slug (pour récupérer les paramètres)"""
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    return clean_mongo_doc(tenant)

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
    
    # Enregistrer l'action dans le journal d'audit
    await log_super_admin_action(
        admin=admin,
        action="tenant_create",
        details={"tenant_slug": tenant.slug, "tenant_nom": tenant.nom},
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        tenant_nom=tenant.nom
    )
    
    return {"message": f"Caserne '{tenant.nom}' créée avec succès", "tenant": tenant}

@api_router.put("/admin/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: str, 
    tenant_update: dict,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Modifier une caserne"""
    update_data = tenant_update.copy()
    
    # Récupérer le tenant avant modification pour l'audit
    tenant_before = await db.tenants.find_one({"id": tenant_id})
    
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
    
    # Enregistrer l'action dans le journal d'audit
    if tenant_before:
        await log_super_admin_action(
            admin=admin,
            action="tenant_update",
            details={"fields_updated": list(update_data.keys())},
            tenant_id=tenant_id,
            tenant_slug=tenant_before.get("slug"),
            tenant_nom=tenant_before.get("nom")
        )
    
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

# Route de compatibilité (OLD - sans tenant dans URL)



# ==================== SUPER ADMIN MANAGEMENT ROUTES ====================

@api_router.get("/admin/super-admins")
async def list_super_admins(admin: SuperAdmin = Depends(get_super_admin)):
    """Liste tous les super admins"""
    super_admins = await db.super_admins.find().to_list(1000)
    return [clean_mongo_doc(sa) for sa in super_admins]

@api_router.post("/admin/super-admins")
async def create_super_admin(
    super_admin_data: dict,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer un nouveau super admin"""
    # Valider les données
    if not all(key in super_admin_data for key in ['email', 'prenom', 'nom', 'mot_de_passe']):
        raise HTTPException(status_code=400, detail="Tous les champs sont obligatoires")
    
    # Vérifier si l'email existe déjà
    existing = await db.super_admins.find_one({"email": super_admin_data['email']})
    if existing:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    
    # Valider la complexité du mot de passe
    if not validate_complex_password(super_admin_data['mot_de_passe']):
        raise HTTPException(
            status_code=400,
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial"
        )
    
    # Créer le super admin
    temp_password = super_admin_data['mot_de_passe']  # Garder le mot de passe temporaire pour l'email
    full_name = f"{super_admin_data['prenom']} {super_admin_data['nom']}"
    new_super_admin = SuperAdmin(
        email=super_admin_data['email'],
        nom=full_name,
        mot_de_passe_hash=get_password_hash(temp_password)
    )
    
    await db.super_admins.insert_one(new_super_admin.dict())
    
    logging.info(f"✅ Super admin créé: {new_super_admin.email}")
    
    # Envoyer l'email de bienvenue
    user_name = new_super_admin.nom
    email_sent = send_super_admin_welcome_email(
        new_super_admin.email,
        user_name,
        temp_password
    )
    
    if email_sent:
        logging.info(f"✅ Email de bienvenue super admin envoyé à {new_super_admin.email}")
    else:
        logging.warning(f"⚠️ Email non envoyé à {new_super_admin.email} (Resend non configuré ou erreur)")
    
    return {"message": "Super admin créé avec succès", "id": new_super_admin.id, "email_sent": email_sent}

@api_router.delete("/admin/super-admins/{super_admin_id}")
async def delete_super_admin(
    super_admin_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer un super admin"""
    # Empêcher la suppression de soi-même
    if super_admin_id == admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    
    # Vérifier qu'il reste au moins un autre super admin
    count = await db.super_admins.count_documents({})
    if count <= 1:
        raise HTTPException(status_code=400, detail="Impossible de supprimer le dernier super admin")
    
    # Supprimer
    result = await db.super_admins.delete_one({"id": super_admin_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Super admin non trouvé")
    
    logging.info(f"✅ Super admin supprimé: {super_admin_id}")
    
    return {"message": "Super admin supprimé avec succès"}

@api_router.put("/admin/super-admins/{super_admin_id}")
async def update_super_admin(
    super_admin_id: str,
    update_data: dict,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Modifier les informations d'un super admin"""
    # Vérifier que le super admin existe
    existing = await db.super_admins.find_one({"id": super_admin_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Super admin non trouvé")
    
    # Préparer les données à mettre à jour
    update_fields = {}
    if "prenom" in update_data and update_data["prenom"]:
        update_fields["prenom"] = update_data["prenom"]
    if "nom" in update_data and update_data["nom"]:
        update_fields["nom"] = update_data["nom"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # Mettre à jour
    await db.super_admins.update_one(
        {"id": super_admin_id},
        {"$set": update_fields}
    )
    
    logging.info(f"✅ Super admin modifié: {super_admin_id}")
    
    return {"message": "Super admin modifié avec succès"}

# User management routes



# ============== ROUTES MIGRÉES VERS routes/personnel.py ==============
# Les routes suivantes sont maintenant gérées par le module routes/personnel.py
# GET  /{tenant_slug}/users - Liste utilisateurs
# GET  /{tenant_slug}/users/{user_id} - Détail utilisateur  
# POST /{tenant_slug}/users - Créer utilisateur
# PUT  /{tenant_slug}/users/{user_id} - Modifier utilisateur
# DELETE /{tenant_slug}/users/{user_id} - Supprimer utilisateur
# =====================================================================

# Route legacy commentée - migrée vers routes/personnel.py
# @api_router.get("/{tenant_slug}/users", response_model=List[User])
# async def get_users(tenant_slug: str, current_user: User = Depends(get_current_user)):
#     tenant = await get_tenant_from_slug(tenant_slug)
#     users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
#     cleaned_users = [clean_mongo_doc(user) for user in users]
#     return [User(**user) for user in cleaned_users]

# Route legacy commentée - migrée vers routes/personnel.py
# @api_router.get("/{tenant_slug}/users/{user_id}", response_model=User)
# async def get_user(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
#     if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
#         raise HTTPException(status_code=403, detail="Accès refusé")
#     tenant = await get_tenant_from_slug(tenant_slug)
#     user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
#     if not user:
#         raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
#     user = clean_mongo_doc(user)
#     return User(**user)

class ProfileUpdate(BaseModel):
    prenom: str
    nom: str
    email: str
    telephone: str = ""
    adresse: str = ""
    contact_urgence: str = ""
    heures_max_semaine: int = 25
    tailles_epi: Optional[Dict[str, str]] = None  # Tailles EPI de l'employé


# ==================== PHOTO DE PROFIL ====================

class PhotoProfilUpload(BaseModel):
    photo_base64: str  # Image en base64 (data:image/jpeg;base64,... ou juste le base64)

def resize_and_compress_image(base64_string: str, max_size: int = 200) -> str:
    """
    Redimensionne et compresse une image base64 à max_size x max_size pixels
    Retourne une image JPEG en base64
    """
    try:
        # Nettoyer le préfixe data:image si présent
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Décoder le base64
        image_data = base64.b64decode(base64_string)
        
        # Vérifier la taille (max 10MB - sera compressée)
        if len(image_data) > 10 * 1024 * 1024:
            raise ValueError("Image trop volumineuse (max 10MB)")
        
        # Ouvrir l'image avec PIL
        img = PILImage.open(BytesIO(image_data))
        
        # Convertir en RGB si nécessaire (pour les PNG avec transparence)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        # Redimensionner en carré (crop au centre puis resize)
        width, height = img.size
        min_dim = min(width, height)
        
        # Crop au centre
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim
        img = img.crop((left, top, right, bottom))
        
        # Redimensionner à max_size x max_size
        img = img.resize((max_size, max_size), PILImage.Resampling.LANCZOS)
        
        # Sauvegarder en JPEG avec compression
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        buffer.seek(0)
        
        # Encoder en base64
        result_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        return f"data:image/jpeg;base64,{result_base64}"
        
    except Exception as e:
        raise ValueError(f"Erreur traitement image: {str(e)}")




# @api_router.put("/{tenant_slug}/users/{user_id}", response_model=User)
# async def update_user(tenant_slug: str, user_id: str, user_update: UserUpdate, current_user: User = Depends(get_current_user)):
#     ... (voir routes/personnel.py pour l'implémentation complète)

# Route legacy commentée - migrée vers routes/personnel.py
# @api_router.delete("/{tenant_slug}/users/{user_id}")
# async def delete_user(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
#     ... (voir routes/personnel.py pour l'implémentation complète)





# ==================== PERSONNALISATION ROUTES MIGRÉES VERS routes/personnalisation.py ====================
# Routes migrées:
# - GET  /{tenant_slug}/public/branding           - Branding public (sans auth)
# - GET  /{tenant_slug}/personnalisation          - Paramètres de personnalisation
# - PUT  /{tenant_slug}/personnalisation          - Modifier la personnalisation
# - POST /{tenant_slug}/personnalisation/upload-logo - Uploader un logo (base64)
# ============================================================================



# ==================== TYPES DE GARDE ROUTES MIGRÉES VERS routes/types_garde.py ====================
# Routes migrées:
# - POST   /{tenant_slug}/types-garde                  - Créer un type de garde
# - GET    /{tenant_slug}/types-garde                  - Liste des types de garde
# - PUT    /{tenant_slug}/types-garde/{type_garde_id} - Modifier un type de garde
# - DELETE /{tenant_slug}/types-garde/{type_garde_id} - Supprimer un type de garde
# ============================================================================



# ===== FORMATAGE PLANNING (DEMO UNIQUEMENT) =====


# ===== EXPORTS PLANNING (doivent être AVANT les routes avec paramètres dynamiques) =====

# ===== RAPPORT D'HEURES =====










# ===== FIN EXPORTS PLANNING =====





# ==================== REMPLACEMENTS ROUTES MIGRÉES VERS routes/remplacements.py ====================
# Toutes les routes et fonctions du système automatisé de remplacement ont été déplacées :
# - POST   /{tenant_slug}/remplacements                        - Créer une demande de remplacement
# - GET    /{tenant_slug}/remplacements                        - Liste des demandes
# - GET    /{tenant_slug}/remplacements/propositions           - Propositions pour l'utilisateur
# - GET    /{tenant_slug}/remplacements/export-pdf             - Export PDF
# - GET    /{tenant_slug}/remplacements/export-excel           - Export Excel
# - PUT    /{tenant_slug}/remplacements/{id}/accepter          - Accepter une demande
# - PUT    /{tenant_slug}/remplacements/{id}/refuser           - Refuser une demande
# - DELETE /{tenant_slug}/remplacements/{id}                   - Annuler une demande
# - GET    /remplacement-action/{token}/{action}               - Action via lien email
# - GET    /{tenant_slug}/parametres/remplacements             - Paramètres remplacements
# - PUT    /{tenant_slug}/parametres/remplacements             - Modifier paramètres
# Fonctions helper: calculer_priorite_demande, trouver_remplacants_potentiels, 
#                   generer_token_remplacement, envoyer_email_remplacement,
#                   lancer_recherche_remplacant, accepter_remplacement, refuser_remplacement,
#                   verifier_et_traiter_timeouts
# ============================================================================

# ==================== COMPÉTENCES ROUTES MIGRÉES VERS routes/competences_grades.py ====================
# Les routes compétences et grades ont été extraites vers routes/competences_grades.py
# POST   /{tenant_slug}/competences
# GET    /{tenant_slug}/competences
# PUT    /{tenant_slug}/competences/{competence_id}
# DELETE /{tenant_slug}/competences/{competence_id}
# POST   /{tenant_slug}/competences/clean-invalid
# POST   /{tenant_slug}/grades
# GET    /{tenant_slug}/grades
# PUT    /{tenant_slug}/grades/{grade_id}
# DELETE /{tenant_slug}/grades/{grade_id}
# ============================================================================

# ==================== FORMATIONS ROUTES MIGRÉES VERS routes/formations.py ====================
# Routes migrées:
# - POST   /{tenant_slug}/formations                              - Créer formation
# - GET    /{tenant_slug}/formations                              - Liste formations
# - PUT    /{tenant_slug}/formations/{formation_id}               - Modifier formation
# - DELETE /{tenant_slug}/formations/{formation_id}               - Supprimer formation
# - POST   /{tenant_slug}/formations/corriger-durees              - Corriger durées
# - POST   /{tenant_slug}/formations/{formation_id}/inscription   - S'inscrire
# - DELETE /{tenant_slug}/formations/{formation_id}/inscription   - Se désinscrire
# - GET    /{tenant_slug}/formations/{formation_id}/inscriptions  - Liste inscrits
# - PUT    /{tenant_slug}/formations/{formation_id}/presence/{user_id} - Valider présence
# - GET    /{tenant_slug}/formations/mon-taux-presence            - Taux présence

# Les rapports et exports restent ici car ils ont des dépendances complexes




# ====================================================================
# RAPPORTS AVANCÉS - EXPORTS PDF/EXCEL ET RAPPORTS PAR COMPÉTENCES
# ====================================================================

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import PieChart as ExcelPieChart, BarChart as ExcelBarChart, Reference
import io
from fastapi.responses import StreamingResponse
import matplotlib
matplotlib.use('Agg')  # Backend non-GUI
import matplotlib.pyplot as plt








# ==================== VALIDATIONS MANUELLES COMPETENCES - MIGRÉ ====================
# Routes migrées vers routes/validations_competences.py:
# - POST   /{tenant_slug}/validations-competences                    - Créer une validation
# - GET    /{tenant_slug}/validations-competences/{user_id}          - Obtenir validations
# - DELETE /{tenant_slug}/validations-competences/{validation_id}    - Supprimer validation
# ===================================================================================

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

# ==================== MODÈLES REMPLACEMENTS MIGRÉS VERS routes/remplacements.py ====================
# NotificationRemplacement, ParametresRemplacements déplacés vers routes/remplacements.py
# ============================================================================

class ParametresValidationPlanning(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    frequence: str = "mensuel"  # mensuel, hebdomadaire
    jour_envoi: int = 25  # Jour du mois (1-28)
    heure_envoi: str = "17:00"  # Heure d'envoi (HH:MM)
    periode_couverte: str = "mois_suivant"  # mois_suivant, mois_en_cours
    envoi_automatique: bool = True  # Activer/désactiver l'envoi automatique
    derniere_notification: Optional[str] = None  # Dernière exécution (ISO datetime)
    
    # Paramètres d'équité des gardes
    periode_equite: str = "mensuel"  # hebdomadaire, bi-hebdomadaire, mensuel, personnalise
    periode_equite_jours: int = 30  # Nombre de jours pour période personnalisée
    
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== PARAMÈTRES ÉQUIPES DE GARDE ====================

class ConfigEquipePersonnalisee(BaseModel):
    """Configuration pour une équipe personnalisée"""
    numero: int  # 1, 2, 3, 4, 5
    nom: str = ""  # Nom personnalisé (ex: "Alpha", "Bravo")
    couleur: str = "#3B82F6"  # Couleur hex pour l'affichage

class ConfigRotation(BaseModel):
    """Configuration de rotation pour temps plein ou temps partiel"""
    rotation_active: bool = False
    type_rotation: str = "aucun"  # "aucun", "montreal", "quebec", "longueuil", "personnalisee"
    date_reference: Optional[str] = None  # Date du jour 1 du cycle (YYYY-MM-DD)
    nombre_equipes: int = 4  # 2, 3, 4, 5 équipes
    duree_cycle: int = 28  # Durée du cycle en jours
    pattern_mode: str = "hebdomadaire"  # "hebdomadaire", "quotidien", "deux_jours", "avance"
    pattern_personnalise: List[int] = []  # Pattern avancé: [1,1,1,1,1,1,1,2,2,2,2,2,2,2...]
    equipes_config: List[ConfigEquipePersonnalisee] = []  # Config des équipes personnalisées
    pre_remplissage_auto: bool = False  # Pré-remplir automatiquement le planning (temps plein)
    privilegier_equipe_garde: bool = True  # Privilégier l'équipe de garde (temps partiel)

class ParametresEquipesGarde(BaseModel):
    """Paramètres du système d'équipes de garde pour un tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    actif: bool = False  # Système activé ou non
    
    # Configuration pour les temps plein
    temps_plein: ConfigRotation = Field(default_factory=ConfigRotation)
    
    # Configuration pour les temps partiel
    temps_partiel: ConfigRotation = Field(default_factory=ConfigRotation)
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ParametresEquipesGardeUpdate(BaseModel):
    """Mise à jour des paramètres d'équipes de garde"""
    actif: Optional[bool] = None
    temps_plein: Optional[ConfigRotation] = None
    temps_partiel: Optional[ConfigRotation] = None

# ==================== CONFIGURATION IMPORTS CSV ====================

class ImportFieldConfig(BaseModel):
    """Configuration d'un champ pour l'import CSV"""
    key: str
    label: str
    required: bool = False

class ImportSettings(BaseModel):
    """Configuration des imports CSV pour un tenant"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_fields: List[ImportFieldConfig] = []
    personnel_fields: List[ImportFieldConfig] = []
    rapports_fields: List[ImportFieldConfig] = []
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ImportSettingsUpdate(BaseModel):
    """Mise à jour des configurations d'import"""
    epi_fields: Optional[List[ImportFieldConfig]] = None
    personnel_fields: Optional[List[ImportFieldConfig]] = None
    rapports_fields: Optional[List[ImportFieldConfig]] = None

# EPI Models
# ==================== MODÈLES EPI NFPA 1851 ====================

class EPI(BaseModel):
    """Modèle complet d'un équipement de protection individuelle selon NFPA 1851"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    numero_serie: str  # Numéro de série interne (format libre)
    type_epi: str  # ID du type d'EPI personnalisé
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
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: str = ""  # Formulaire pour inspection après utilisation
    formulaire_routine_id: str = ""  # Formulaire pour inspection routine mensuelle
    formulaire_avancee_id: str = ""  # Formulaire pour inspection avancée annuelle
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== TYPES D'EPI PERSONNALISÉS ====================
class TypeEPI(BaseModel):
    """Type/Catégorie d'EPI personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Casque", "Harnais", "Bottes"
    icone: str = "🛡️"  # Emoji pour l'affichage
    description: str = ""
    ordre: int = 0  # Pour trier l'affichage
    est_defaut: bool = False  # Types par défaut non supprimables
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TypeEPICreate(BaseModel):
    nom: str
    icone: str = "🛡️"
    description: str = ""
    ordre: int = 0

class TypeEPIUpdate(BaseModel):
    nom: Optional[str] = None
    icone: Optional[str] = None
    description: Optional[str] = None
    ordre: Optional[int] = None
    actif: Optional[bool] = None

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
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: str = ""
    formulaire_routine_id: str = ""
    formulaire_avancee_id: str = ""

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
    # Formulaires d'inspection assignés (3 types)
    formulaire_apres_usage_id: Optional[str] = None
    formulaire_routine_id: Optional[str] = None
    formulaire_avancee_id: Optional[str] = None

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

# Nouveaux modèles pour "Mes EPI"
class InspectionApresUsage(BaseModel):
    """Inspection simple après utilisation par l'employé"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    user_id: str  # Employé qui fait l'inspection
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    statut: str  # "ok" ou "defaut"
    defauts_constates: str = ""  # Description des défauts si statut = "defaut"
    notes: str = ""
    photo_url: str = ""  # URL de la photo du défaut (optionnel)
    criteres_inspection: Optional[Dict[str, bool]] = {}  # Critères cochés/décochés

class InspectionApresUsageCreate(BaseModel):
    statut: str  # "ok" ou "defaut"
    defauts_constates: Optional[str] = ""
    notes: Optional[str] = ""
    photo_url: Optional[str] = ""
    criteres_inspection: Optional[Dict[str, bool]] = {}

class DemandeRemplacementEPI(BaseModel):
    """Demande de remplacement d'EPI par un employé"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    epi_id: str
    user_id: str  # Employé qui fait la demande
    raison: str  # "Usé", "Perdu", "Défectueux", "Taille inadaptée"
    notes_employe: str = ""
    statut: str = "En attente"  # "En attente", "Approuvée", "Refusée"
    date_demande: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    date_traitement: Optional[datetime] = None
    traite_par: Optional[str] = None  # ID admin/superviseur qui traite
    notes_admin: str = ""  # Notes de l'admin lors du traitement

class DemandeRemplacementEPICreate(BaseModel):
    raison: str
    notes_employe: Optional[str] = ""

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
    cout_nettoyage: float = 0.0  # Coût du nettoyage (pour les externes)
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
    cout_nettoyage: float = 0.0
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



# ==================== MATÉRIEL & ÉQUIPEMENTS MODELS ====================

class CategorieMateriel(BaseModel):
    """Catégorie de matériel personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    icone: str = "📦"  # Emoji pour l'affichage
    couleur: str = "#3b82f6"  # Couleur hex pour l'UI
    ordre: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategorieMaterielCreate(BaseModel):
    nom: str
    description: str = ""
    icone: str = "📦"
    couleur: str = "#3b82f6"
    ordre: int = 0

class CategorieMaterielUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    icone: Optional[str] = None
    couleur: Optional[str] = None
    ordre: Optional[int] = None

class Materiel(BaseModel):
    """Item de matériel avec gestion complète"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Identification
    numero_identification: str  # Code unique (ex: "COMP-001", "LANCE-042")
    nom: str  # Nom descriptif (ex: "Compresse stérile 10x10")
    categorie_id: str  # Référence à CategorieMateriel
    
    # Quantités et stock
    quantite_stock: int = 0
    quantite_minimum: int = 0  # Seuil d'alerte
    unite_mesure: str = "unité"  # unité, paquet, boîte, etc.
    
    # Dates
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    
    # État et localisation
    etat: str = "bon"  # bon, a_reparer, hors_service, en_maintenance
    localisation_type: str = "stock"  # stock, vehicule, caserne, personne
    localisation_id: Optional[str] = None  # ID du véhicule, caserne, ou personne
    localisation_details: str = ""  # Description textuelle (ex: "Entrepôt A, Étagère 3")
    
    # Fournisseur et coûts
    fournisseur: str = ""
    numero_modele: str = ""
    cout_unitaire: float = 0.0
    cout_total: float = 0.0  # quantite * cout_unitaire
    
    # Photos et documents
    photos: List[str] = []  # URLs des photos
    documents: List[str] = []  # URLs des documents (manuels, certificats, etc.)
    
    # Maintenance
    frequence_maintenance: Optional[str] = None  # mensuelle, trimestrielle, annuelle, personnalisee
    frequence_maintenance_jours: Optional[int] = None  # Pour fréquence personnalisée
    derniere_maintenance: Optional[str] = None
    
    # Métadonnées
    notes: str = ""
    code_barre: Optional[str] = None
    qr_code: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MaterielCreate(BaseModel):
    numero_identification: str
    nom: str
    categorie_id: str
    quantite_stock: int = 0
    quantite_minimum: int = 0
    unite_mesure: str = "unité"
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    etat: str = "bon"
    localisation_type: str = "stock"
    localisation_id: Optional[str] = None
    localisation_details: str = ""
    fournisseur: str = ""
    numero_modele: str = ""
    cout_unitaire: float = 0.0
    photos: List[str] = []
    documents: List[str] = []
    frequence_maintenance: Optional[str] = None
    frequence_maintenance_jours: Optional[int] = None
    notes: str = ""

class MaterielUpdate(BaseModel):
    numero_identification: Optional[str] = None
    nom: Optional[str] = None
    categorie_id: Optional[str] = None
    quantite_stock: Optional[int] = None
    quantite_minimum: Optional[int] = None
    unite_mesure: Optional[str] = None
    date_acquisition: Optional[str] = None
    date_expiration: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    etat: Optional[str] = None
    localisation_type: Optional[str] = None
    localisation_id: Optional[str] = None
    localisation_details: Optional[str] = None
    fournisseur: Optional[str] = None
    numero_modele: Optional[str] = None
    cout_unitaire: Optional[float] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[str]] = None
    frequence_maintenance: Optional[str] = None
    frequence_maintenance_jours: Optional[int] = None
    derniere_maintenance: Optional[str] = None
    notes: Optional[str] = None

class MouvementStock(BaseModel):
    """Historique des mouvements de stock"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    type_mouvement: str  # entree, sortie, ajustement, inventaire
    quantite: int  # Positif pour entrée, négatif pour sortie
    quantite_avant: int
    quantite_apres: int
    raison: str  # reception_commande, utilisation, perte, casse, inventaire, correction, etc.
    reference: str = ""  # Numéro de commande, bon de sortie, etc.
    effectue_par: str
    effectue_par_id: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MouvementStockCreate(BaseModel):
    materiel_id: str
    type_mouvement: str
    quantite: int
    raison: str
    reference: str = ""
    notes: str = ""

class MaintenanceMateriel(BaseModel):
    """Maintenance préventive ou corrective"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    type_maintenance: str  # preventive, corrective
    statut: str  # planifiee, en_cours, terminee, annulee
    
    # Dates
    date_prevue: str
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    
    # Responsable
    responsable_type: str = "interne"  # interne, externe
    responsable_nom: str = ""
    responsable_id: Optional[str] = None  # Si interne
    fournisseur_externe: str = ""  # Si externe
    
    # Détails
    description_travaux: str = ""
    pieces_remplacees: List[str] = []
    cout: float = 0.0
    temps_hors_service_heures: float = 0.0
    
    # Résultat
    resultat: str = ""  # conforme, non_conforme, a_surveiller
    prochaine_maintenance: Optional[str] = None
    notes: str = ""
    
    # Photos et documents
    photos_avant: List[str] = []
    photos_apres: List[str] = []
    documents: List[str] = []  # Rapports, factures, etc.
    
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MaintenanceMaterielCreate(BaseModel):
    materiel_id: str
    type_maintenance: str
    statut: str = "planifiee"
    date_prevue: str
    responsable_type: str = "interne"
    responsable_nom: str = ""
    responsable_id: Optional[str] = None
    fournisseur_externe: str = ""
    description_travaux: str = ""
    notes: str = ""

class MaintenanceMaterielUpdate(BaseModel):
    statut: Optional[str] = None
    date_debut: Optional[str] = None
    date_fin: Optional[str] = None
    responsable_type: Optional[str] = None
    responsable_nom: Optional[str] = None
    responsable_id: Optional[str] = None
    fournisseur_externe: Optional[str] = None
    description_travaux: Optional[str] = None
    pieces_remplacees: Optional[List[str]] = None
    cout: Optional[float] = None
    temps_hors_service_heures: Optional[float] = None
    resultat: Optional[str] = None
    prochaine_maintenance: Optional[str] = None
    notes: Optional[str] = None
    photos_avant: Optional[List[str]] = None
    photos_apres: Optional[List[str]] = None
    documents: Optional[List[str]] = None

class InspectionMateriel(BaseModel):
    """Inspection rapide de l'état du matériel"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    materiel_id: str
    date_inspection: str
    inspecteur: str
    inspecteur_id: Optional[str] = None
    etat_constate: str  # bon, endommage, defectueux, manquant
    fonctionnel: bool = True
    defauts: List[str] = []  # Liste des défauts constatés
    action_requise: str = "aucune"  # aucune, nettoyage, reparation, remplacement
    notes: str = ""
    photos: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionMaterielCreate(BaseModel):
    materiel_id: str
    date_inspection: str
    etat_constate: str
    fonctionnel: bool = True
    defauts: List[str] = []
    action_requise: str = "aucune"
    notes: str = ""
    photos: List[str] = []



# ==================== INVENTAIRES VÉHICULES MODELS ====================

class ItemInventaireVehicule(BaseModel):
    """Item individuel dans un modèle d'inventaire véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    photo_url: str = ""  # Photo de référence de l'item
    obligatoire: bool = False
    photo_requise: bool = False
    ordre: int = 0

# ==================== MODÈLES INSPECTION BORNES SÈCHES PERSONNALISABLES ====================

class ItemInspectionBorneSeche(BaseModel):
    """Item individuel dans une section d'inspection de borne sèche"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    description: str = ""
    photo_url: str = ""  # Photo de référence de l'item
    obligatoire: bool = False
    photo_requise: bool = False
    ordre: int = 0

class SectionInspectionBorneSeche(BaseModel):
    """Section dans un modèle d'inspection de borne sèche"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    titre: str
    description: str = ""
    type_champ: str = "checkbox"  # Types: checkbox, radio, text, number, select, photo, timer, geolocation, signature, rating, toggle, date, multiselect, sketch
    options: List[dict] = []  # Options pour checkbox/radio/select: [{label, declencherAlerte, couleur}]
    photo_url: str = ""  # Photo de référence de la section
    items: List[ItemInspectionBorneSeche] = []
    ordre: int = 0
    # Paramètres spécifiques selon le type
    unite: str = ""  # Unité pour number (ex: "L/min", "PSI", "secondes")
    min_value: Optional[float] = None  # Valeur minimale pour number
    max_value: Optional[float] = None  # Valeur maximale pour number
    seuil_alerte: Optional[float] = None  # Seuil déclenchant une alerte pour number

class ModeleInspectionBorneSeche(BaseModel):
    """Modèle d'inspection personnalisable pour les bornes sèches"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Inspection standard", "Inspection complète"
    description: str = ""
    est_actif: bool = True  # Si ce modèle est le modèle actif
    sections: List[SectionInspectionBorneSeche] = []
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModeleInspectionBorneSecheCreate(BaseModel):
    nom: str
    description: str = ""
    sections: List[dict] = []  # [{titre, type_champ, options, items}]

class ModeleInspectionBorneSecheUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    est_actif: Optional[bool] = None
    sections: Optional[List[dict]] = None

class InspectionBorneSecheRemplie(BaseModel):
    """Inspection effectuée sur une borne sèche avec formulaire personnalisable"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    borne_seche_id: str
    borne_nom: str
    modele_id: str
    modele_nom: str
    inspecteur_id: str
    inspecteur_nom: str
    date_inspection: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Réponses aux sections du formulaire
    reponses: List[dict] = []  # [{section_id, section_titre, type_champ, valeur, notes, photos, alertes}]
    # Géolocalisation
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Alertes générées
    alertes: List[dict] = []  # [{section_titre, item_nom, message, severite}]
    has_anomalie: bool = False  # Si une anomalie a été signalée
    commentaire_anomalie: str = ""
    photos_anomalie: List[str] = []
    # Signature
    signature_inspecteur: str = ""  # Base64 de la signature
    # Statut
    statut: str = "complete"  # complete, en_cours, anomalie
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ==================== FIN MODÈLES INSPECTION BORNES SÈCHES ====================

class SectionInventaireVehicule(BaseModel):
    """Section dans un modèle d'inventaire véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    titre: str
    type_champ: str = "checkbox"  # Type de réponse: checkbox, radio, text, number, select, photo
    options: List[dict] = []  # Options pour checkbox/radio/select: [{label, declencherAlerte}]
    photo_url: str = ""  # Photo de référence de la section
    items: List[ItemInventaireVehicule] = []
    ordre: int = 0

class ModeleInventaireVehicule(BaseModel):
    """Modèle d'inventaire pour un type de véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Inventaire Autopompe", "Inventaire Échelle"
    type_vehicule: str  # autopompe, echelle_aerienne, camion_citerne, etc.
    description: str = ""
    sections: List[SectionInventaireVehicule] = []
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ModeleInventaireVehiculeCreate(BaseModel):
    nom: str
    type_vehicule: str
    description: str = ""
    sections: List[dict] = []  # [{titre, items: [{nom, obligatoire, photo_requise}]}]

class ModeleInventaireVehiculeUpdate(BaseModel):
    nom: Optional[str] = None
    type_vehicule: Optional[str] = None
    description: Optional[str] = None
    sections: Optional[List[dict]] = None

class ItemInventaireVehiculeRempli(BaseModel):
    """Item rempli lors d'un inventaire"""
    item_id: str
    section: str
    nom: str
    type_champ: str  # checkbox, radio, text, number, select, photo
    valeur: Any  # Peut être str, list, number selon type_champ
    notes: str = ""
    photo_prise: str = ""  # Photo prise pendant l'inventaire

class InventaireVehicule(BaseModel):
    """Inventaire hebdomadaire effectué sur un véhicule"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    vehicule_id: str
    vehicule_nom: str  # Pour affichage
    modele_id: str
    modele_nom: str
    date_inventaire: str
    effectue_par: str
    effectue_par_id: str
    items_coches: List[ItemInventaireVehiculeRempli] = []
    statut_global: str = "conforme"  # conforme, non_conforme
    items_manquants: int = 0
    items_defectueux: int = 0
    notes_generales: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventaireVehiculeCreate(BaseModel):
    vehicule_id: str
    vehicule_nom: str = ""
    modele_id: str
    date_inventaire: str
    heure_debut: str = ""
    heure_fin: str = ""
    effectue_par: str = ""
    effectue_par_id: str = ""
    items_coches: List[dict]  # [{item_id, section, nom, type_champ, valeur, notes, photo_prise}]
    notes_generales: str = ""
    alertes: List[dict] = []  # [{section, item, valeur, notes, photo}]


# ==================== MATÉRIEL & ÉQUIPEMENTS ====================

class Fournisseur(BaseModel):
    """Fournisseur d'équipements"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    contact_nom: str = ""
    telephone: str = ""
    email: str = ""
    adresse: str = ""
    ville: str = ""
    province: str = ""
    code_postal: str = ""
    site_web: str = ""
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FournisseurCreate(BaseModel):
    nom: str
    contact_nom: str = ""
    telephone: str = ""
    email: str = ""
    adresse: str = ""
    ville: str = ""
    province: str = ""
    code_postal: str = ""
    site_web: str = ""
    notes: str = ""

class FournisseurUpdate(BaseModel):
    nom: Optional[str] = None
    contact_nom: Optional[str] = None
    telephone: Optional[str] = None
    email: Optional[str] = None
    adresse: Optional[str] = None
    ville: Optional[str] = None
    province: Optional[str] = None
    code_postal: Optional[str] = None
    site_web: Optional[str] = None
    notes: Optional[str] = None

class CategorieEquipement(BaseModel):
    """Catégorie d'équipement (prédéfinie ou personnalisée)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str = ""
    norme_reference: str = ""  # NFPA 1962, NFPA 1852, etc.
    frequence_inspection: str = ""  # "1 an", "6 mois", etc.
    couleur: str = "#6366F1"  # Couleur pour l'interface
    icone: str = "📦"  # Emoji ou icône
    est_predefinit: bool = False  # True pour catégories système
    permet_assignation_employe: bool = False  # Si True, équipements peuvent être assignés à des employés
    champs_supplementaires: List[dict] = []  # Champs spécifiques à la catégorie [{nom, type, options, obligatoire}]
    # Support pour plusieurs personnes ressources
    personnes_ressources: List[dict] = []  # [{id: str, email: str}]
    # Anciens champs gardés pour compatibilité
    personne_ressource_id: str = ""  # ID de l'utilisateur responsable des inspections
    personne_ressource_email: str = ""  # Email pour notifications directes
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategorieEquipementCreate(BaseModel):
    nom: str
    description: str = ""
    norme_reference: str = ""
    frequence_inspection: str = ""
    couleur: str = "#6366F1"
    icone: str = "📦"
    permet_assignation_employe: bool = False
    champs_supplementaires: List[dict] = []
    personnes_ressources: List[dict] = []
    personne_ressource_id: str = ""
    personne_ressource_email: str = ""

class CategorieEquipementUpdate(BaseModel):
    nom: Optional[str] = None
    description: Optional[str] = None
    norme_reference: Optional[str] = None
    frequence_inspection: Optional[str] = None
    couleur: Optional[str] = None
    icone: Optional[str] = None
    permet_assignation_employe: Optional[bool] = None
    champs_supplementaires: Optional[List[dict]] = None
    personnes_ressources: Optional[List[dict]] = None
    personne_ressource_id: Optional[str] = None
    personne_ressource_email: Optional[str] = None

class HistoriqueMaintenance(BaseModel):
    """Historique de maintenance/réparation d'un équipement"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    equipement_id: str
    type_intervention: str  # "maintenance", "reparation", "test", "inspection"
    date_intervention: str
    description: str
    cout: float = 0.0
    effectue_par: str = ""
    effectue_par_id: str = ""
    pieces_remplacees: List[str] = []
    resultats: str = ""  # Résultats de tests (ex: pression testée)
    prochaine_intervention: str = ""  # Date suggérée
    documents: List[str] = []  # URLs de documents/photos
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HistoriqueMaintenanceCreate(BaseModel):
    equipement_id: str = ""  # Optionnel car fourni via URL
    type_intervention: str
    date_intervention: str
    description: str
    cout: float = 0.0
    effectue_par: str = ""
    effectue_par_id: str = ""
    pieces_remplacees: List[str] = []
    resultats: str = ""
    prochaine_intervention: str = ""
    documents: List[str] = []
    notes: str = ""

class Equipement(BaseModel):
    """Équipement de pompiers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Informations de base
    nom: str
    code_unique: str  # Numéro de série, code interne
    categorie_id: str = ""  # Référence à CategorieEquipement
    categorie_nom: str = ""  # Pour affichage rapide
    description: str = ""
    
    # État et quantité
    etat: str = "bon"  # neuf, bon, a_reparer, en_reparation, hors_service
    quantite: int = 1
    quantite_minimum: int = 1  # Seuil d'alerte stock bas
    gerer_quantite: bool = False  # Si True, déduire du stock lors des interventions (consommable)
    
    # Informations fournisseur
    fournisseur_id: str = ""
    fournisseur_nom: str = ""
    
    # Informations financières
    date_achat: str = ""
    prix_achat: float = 0.0
    garantie_fin: str = ""
    
    # Emplacement - peut être assigné à véhicule ET/OU emplacement ET/OU employé
    emplacement_type: str = ""  # "vehicule", "caserne", "entrepot", "stock", "autre"
    emplacement_id: str = ""  # ID du véhicule si applicable
    emplacement_nom: str = ""  # Nom lisible
    
    # Assignation à un véhicule (optionnel)
    vehicule_id: str = ""
    vehicule_nom: str = ""
    
    # Assignation à un employé (pour parties faciales, radios, etc.)
    employe_id: str = ""
    employe_nom: str = ""
    
    # Maintenance et conformité
    norme_reference: str = ""  # NFPA 1962, NFPA 1852, etc.
    frequence_maintenance: str = ""  # "1 an", "6 mois", etc.
    date_derniere_maintenance: str = ""
    date_prochaine_maintenance: str = ""
    date_fin_vie: str = ""  # Date de mise au rancart prévue
    
    # Alertes actives
    alerte_maintenance: bool = False
    alerte_stock_bas: bool = False
    alerte_reparation: bool = False
    alerte_fin_vie: bool = False
    alerte_expiration: bool = False
    
    # Documents et photos
    photos: List[str] = []  # URLs
    documents: List[str] = []  # URLs
    
    # Champs personnalisés (flexibilité maximale)
    champs_personnalises: Dict[str, Any] = {}  # {nom_champ: valeur}
    
    # Formulaire d'inspection assigné (optionnel)
    modele_inspection_id: str = ""  # ID du formulaire d'inspection assigné
    
    # Métadonnées
    notes: str = ""
    tags: List[str] = []
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EquipementCreate(BaseModel):
    nom: str
    code_unique: str
    categorie_id: str = ""
    categorie_nom: str = ""
    description: str = ""
    etat: str = "bon"
    quantite: int = 1
    quantite_minimum: int = 1
    gerer_quantite: bool = False  # Si True, déduire du stock lors des interventions (consommable)
    fournisseur_id: str = ""
    fournisseur_nom: str = ""
    date_achat: str = ""
    prix_achat: float = 0.0
    garantie_fin: str = ""
    emplacement_type: str = ""
    emplacement_id: str = ""
    emplacement_nom: str = ""
    vehicule_id: str = ""
    vehicule_nom: str = ""
    employe_id: str = ""
    employe_nom: str = ""
    norme_reference: str = ""
    frequence_maintenance: str = ""
    date_derniere_maintenance: str = ""
    date_prochaine_maintenance: str = ""
    date_fin_vie: str = ""
    photos: List[str] = []
    documents: List[str] = []
    champs_personnalises: Dict[str, Any] = {}
    modele_inspection_id: str = ""  # ID du formulaire d'inspection assigné
    notes: str = ""
    tags: List[str] = []

class EquipementUpdate(BaseModel):
    nom: Optional[str] = None
    code_unique: Optional[str] = None
    categorie_id: Optional[str] = None
    categorie_nom: Optional[str] = None
    description: Optional[str] = None
    etat: Optional[str] = None
    quantite: Optional[int] = None
    quantite_minimum: Optional[int] = None
    gerer_quantite: Optional[bool] = None  # Si True, déduire du stock lors des interventions (consommable)
    fournisseur_id: Optional[str] = None
    fournisseur_nom: Optional[str] = None
    date_achat: Optional[str] = None
    prix_achat: Optional[float] = None
    garantie_fin: Optional[str] = None
    emplacement_type: Optional[str] = None
    emplacement_id: Optional[str] = None
    emplacement_nom: Optional[str] = None
    vehicule_id: Optional[str] = None
    vehicule_nom: Optional[str] = None
    employe_id: Optional[str] = None
    employe_nom: Optional[str] = None
    norme_reference: Optional[str] = None
    frequence_maintenance: Optional[str] = None
    date_derniere_maintenance: Optional[str] = None
    date_prochaine_maintenance: Optional[str] = None
    date_fin_vie: Optional[str] = None
    photos: Optional[List[str]] = None
    documents: Optional[List[str]] = None
    champs_personnalises: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    alerte_maintenance: Optional[bool] = None
    alerte_stock_bas: Optional[bool] = None
    alerte_reparation: Optional[bool] = None
    alerte_fin_vie: Optional[bool] = None
    alerte_expiration: Optional[bool] = None
    modele_inspection_id: Optional[str] = None  # ID du formulaire d'inspection assigné


# ==================== MULTI-TENANT DEPENDENCIES ====================

# Cache simple pour les tenants (60 secondes)
_tenant_cache = {}
_tenant_cache_time = {}

async def get_tenant_from_slug(slug: str) -> Tenant:
    """Récupère le tenant depuis son slug avec cache"""
    # Vérifier le cache (60 secondes)
    cache_key = f"tenant_{slug}"
    now = time.time()
    if cache_key in _tenant_cache and (now - _tenant_cache_time.get(cache_key, 0)) < 60:
        logging.warning(f"🗄️ Cache hit pour tenant {slug}: {_tenant_cache[cache_key].id}")
        return _tenant_cache[cache_key]
    
    logging.warning(f"🔍 Cache miss pour tenant {slug}, requête DB...")
    
    # Requête simplifiée avec index
    tenant_data = await db.tenants.find_one({"slug": slug}, {"_id": 0})
    logging.warning(f"🔍 Résultat DB pour slug={slug}: id={tenant_data.get('id') if tenant_data else 'None'}, nom={tenant_data.get('nom') if tenant_data else 'None'}")
    
    # Fallback pour ancienne structure
    if not tenant_data:
        tenant_data = await db.tenants.find_one({"slug": slug, "actif": True}, {"_id": 0})
    
    if not tenant_data:
        tenant_data = await db.tenants.find_one({"slug": slug, "is_active": True}, {"_id": 0})
    
    # Si toujours pas trouvé
    if not tenant_data:
        tenant_data = await db.tenants.find_one({"slug": slug}, {"_id": 0})
        if tenant_data:
            # Vérifier manuellement le statut
            is_active = tenant_data.get('actif', tenant_data.get('is_active', True))
            if not is_active:
                raise HTTPException(status_code=403, detail=f"Caserne '{slug}' inactive")
    
    if not tenant_data:
        raise HTTPException(status_code=404, detail=f"Caserne '{slug}' non trouvée")
    
    logging.info(f"🔍 Tenant data for {slug}: {tenant_data}")
    tenant = Tenant(**tenant_data)
    
    # Mettre en cache
    _tenant_cache[cache_key] = tenant
    _tenant_cache_time[cache_key] = now
    
    return tenant

async def get_current_tenant(tenant_slug: str) -> Tenant:
    """Dépendance FastAPI pour obtenir le tenant actuel"""
    return await get_tenant_from_slug(tenant_slug)

# get_super_admin function moved to earlier in the file

# ==================== TENANT AUTH ROUTES ====================


# ==================== PASSWORD RESET ROUTES ====================






# ==================== DEMANDES DE CONGÉ ROUTES MIGRÉES VERS routes/conges.py ====================
# Routes migrées:
# - POST /{tenant_slug}/demandes-conge                    - Créer une demande de congé
# - GET  /{tenant_slug}/demandes-conge                    - Liste des demandes de congé
# - PUT  /{tenant_slug}/demandes-conge/{demande_id}/approuver - Approuver/Refuser une demande
# ============================================================================

# ==================== ANCIENNES ROUTES REMPLACEMENTS - SUPPRIMÉES ====================
# Ces routes ont été remplacées par le module routes/remplacements.py qui contient
# une logique plus avancée avec notifications push, emails, et système de timeout
# Les anciennes routes suivantes ont été supprimées:
# - POST /remplacements/{demande_id}/recherche-automatique
# - POST /{tenant_slug}/remplacements/{demande_id}/accepter (ancienne version)
# - POST /{tenant_slug}/remplacements/{demande_id}/refuser (ancienne version)
# ============================================================================

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
                    ['Nom complet', f"{user_data.get('prenom', '')} {user_data.get('nom', '')}"],
                    ['Grade', user_data.get('grade', 'N/A')],
                    ['Type emploi', user_data.get('type_emploi', 'N/A')],
                    ['Gardes assignées', str(len(user_assignations))],
                    ['Statut', user_data.get('statut', 'N/A')]
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
                "nom": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "grade": user.get("grade", "N/A"),
                "role": user.get("role", "pompier"),
                "type_emploi": user.get("type_emploi", "temps_plein"),
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


# ====================================================================
# MODULE RAPPORTS AVANCÉS - INTERNES ET EXTERNES
# ====================================================================

# Modèles pour les nouvelles données

class Budget(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    annee: int
    categorie: str  # salaires, formations, equipements, carburant, entretien, autres
    budget_alloue: float
    budget_consomme: float = 0.0
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BudgetCreate(BaseModel):
    annee: int
    categorie: str
    budget_alloue: float
    notes: str = ""

class Immobilisation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    type_immobilisation: str  # vehicule, equipement_majeur
    nom: str
    date_acquisition: str  # YYYY-MM-DD
    cout_acquisition: float
    cout_entretien_annuel: float = 0.0
    etat: str = "bon"  # bon, moyen, mauvais
    date_remplacement_prevue: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ImmobilisationCreate(BaseModel):
    type_immobilisation: str
    nom: str
    date_acquisition: str
    cout_acquisition: float
    cout_entretien_annuel: float = 0.0
    etat: str = "bon"
    date_remplacement_prevue: Optional[str] = None
    notes: str = ""

class ProjetTriennal(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    description: str
    type_projet: str  # acquisition, renovation, recrutement
    annee_prevue: int
    cout_estime: float
    statut: str = "prevu"  # prevu, en_cours, termine, annule
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProjetTriennalCreate(BaseModel):
    nom: str
    description: str
    type_projet: str
    annee_prevue: int
    cout_estime: float
    statut: str = "prevu"

class Intervention(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    date_intervention: str
    type_intervention: str  # incendie, medical, sauvetage, autre
    duree_minutes: int
    nombre_pompiers: int
    temps_reponse_minutes: Optional[int] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InterventionCreate(BaseModel):
    date_intervention: str
    type_intervention: str
    duree_minutes: int
    nombre_pompiers: int
    temps_reponse_minutes: Optional[int] = None
    notes: str = ""


# ====== MODÈLES POUR LE DASHBOARD ======

class MessageImportant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    titre: str
    contenu: str
    priorite: str  # info, important, urgent
    date_expiration: Optional[str] = None
    auteur_id: str
    auteur_nom: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class MessageImportantCreate(BaseModel):
    titre: str
    contenu: str
    priorite: str = "info"
    date_expiration: Optional[str] = None

class Activite(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    type_activite: str  # creation_personnel, assignation, formation, remplacement, etc.
    description: str
    user_id: Optional[str] = None
    user_nom: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== PRÉVENTION MODELS ====================

class Batiment(BaseModel):
    """Fiche d'établissement/bâtiment pour les inspections de prévention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Informations générales
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""  # Renommé de numero_lot_cadastre
    valeur_fonciere: Optional[str] = ""  # String car peut être vide
    
    # Informations sur le bâtiment
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    
    # Contacts - Propriétaire
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    
    # Contacts - Gérant/Gestionnaire
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""  # Alias pour compatibilité frontend
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    
    # Contacts - Locataire
    localaire_nom: str = ""  # Orthographe originale conservée
    localaire_prenom: str = ""
    localaire_telephone: str = ""
    localaire_courriel: str = ""
    locataire_nom: str = ""  # Alias pour compatibilité frontend
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    
    # Contacts - Responsable sécurité
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    
    # Classification selon Code national de prévention des incendies - Canada 2020
    groupe_occupation: str = ""  # A, B, C, D, E, F, G, I
    sous_groupe: str = ""  # A-1, A-2, B-1, F-1, F-2, F-3, etc.
    description_activite: str = ""
    niveau_risque: str = ""  # Faible, Moyen, Élevé, Très élevé (selon Tableau A1)
    
    # Risques
    risques: List[str] = []
    risques_identifes: List[str] = []  # Orthographe originale conservée
    risques_identifies: List[str] = []  # Alias pour compatibilité frontend
    
    # Géolocalisation
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # Photo
    photo_url: Optional[str] = ""  # URL ou base64 de la photo du bâtiment
    
    # Métadonnées
    statut: str = "actif"  # actif, inactif, demolition
    notes_generales: str = ""
    notes: str = ""  # Alias pour compatibilité frontend
    preventionniste_assigne_id: Optional[str] = None  # ID de l'employé préventionniste
    historique_assignations: List[Dict[str, Any]] = []  # Historique des changements de préventionniste
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BatimentCreate(BaseModel):
    nom_etablissement: str = ""
    adresse_civique: str = ""
    ville: str = ""
    province: str = "QC"
    code_postal: str = ""
    cadastre_matricule: str = ""
    valeur_fonciere: Optional[str] = ""  # String car peut être vide
    
    # Informations sur le bâtiment
    type_batiment: str = ""
    sous_type_batiment: str = ""
    annee_construction: str = ""
    nombre_etages: str = ""
    superficie_totale_m2: str = ""
    
    # Contacts - Propriétaire
    proprietaire_nom: str = ""
    proprietaire_prenom: str = ""
    proprietaire_telephone: str = ""
    proprietaire_courriel: str = ""
    
    # Contacts - Gérant/Gestionnaire
    gerant_nom: str = ""
    gerant_telephone: str = ""
    gerant_courriel: str = ""
    gestionnaire_nom: str = ""  # Alias pour compatibilité frontend
    gestionnaire_prenom: str = ""
    gestionnaire_telephone: str = ""
    gestionnaire_courriel: str = ""
    
    # Contacts - Locataire
    localaire_nom: str = ""  # Orthographe originale conservée
    localaire_prenom: str = ""
    localaire_telephone: str = ""
    localaire_courriel: str = ""
    locataire_nom: str = ""  # Alias pour compatibilité frontend
    locataire_prenom: str = ""
    locataire_telephone: str = ""
    locataire_courriel: str = ""
    
    # Contacts - Responsable sécurité
    responsable_securite_nom: str = ""
    responsable_securite_telephone: str = ""
    responsable_securite_courriel: str = ""
    
    # Classification
    groupe_occupation: str = ""
    sous_groupe: str = ""
    description_activite: str = ""
    niveau_risque: str = ""
    
    # Risques
    risques: List[str] = []
    risques_identifes: List[str] = []  # Orthographe originale conservée
    risques_identifies: List[str] = []  # Alias pour compatibilité frontend
    
    # Géolocalisation
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # Photo
    photo_url: Optional[str] = ""
    
    # Métadonnées
    statut: str = "actif"
    notes_generales: str = ""
    notes: str = ""  # Alias pour compatibilité frontend
    preventionniste_assigne_id: Optional[str] = None
    
    class Config:
        extra = "ignore"  # Ignorer les champs supplémentaires

class BatimentPhotoUpload(BaseModel):
    """Modèle pour l'upload de photo de bâtiment en base64"""
    photo_base64: str  # Data URL base64 (ex: data:image/jpeg;base64,...)

class SecteurGeographique(BaseModel):
    """Secteur géographique pour l'assignation des préventionnistes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    
    # Informations du secteur
    nom: str  # Ex: "Secteur Nord", "Zone industrielle Est"
    description: str = ""
    couleur: str = "#3b82f6"  # Couleur d'affichage sur la carte (hex)
    
    # Géométrie (polygone GeoJSON)
    geometry: Dict[str, Any]  # Format GeoJSON: {"type": "Polygon", "coordinates": [[[lng, lat], ...]]}
    
    # Assignation
    preventionniste_assigne_id: Optional[str] = None  # ID de l'employé préventionniste
    
    # Métadonnées
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SecteurGeographiqueCreate(BaseModel):
    """Modèle pour la création d'un secteur géographique"""
    nom: str
    description: str = ""
    couleur: str = "#3b82f6"
    geometry: Dict[str, Any]
    preventionniste_assigne_id: Optional[str] = None
    actif: bool = True
    
    class Config:
        extra = "ignore"

class SymbolePersonnalise(BaseModel):
    """Symbole personnalisé pour les plans d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Borne-fontaine personnalisée"
    categorie: str = "Personnalisé"  # Catégorie du symbole
    image_base64: str  # Image en base64
    couleur: str = "#3b82f6"  # Couleur de bordure dans la palette
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str  # ID de l'utilisateur qui a créé

class SymbolePersonnaliseCreate(BaseModel):
    """Modèle pour la création d'un symbole personnalisé"""
    nom: str
    categorie: str = "Personnalisé"
    image_base64: str
    couleur: str = "#3b82f6"
    
    class Config:
        extra = "ignore"


class GrilleInspection(BaseModel):
    """Template de grille d'inspection selon le groupe d'occupation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Grille Groupe C - Résidentiel"
    groupe_occupation: str  # C, E, F, I, etc.
    sections: List[Dict[str, Any]] = []  # Structure JSON des sections et questions
    actif: bool = True
    version: str = "1.0"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GrilleInspectionCreate(BaseModel):
    nom: str
    groupe_occupation: str
    sections: List[Dict[str, Any]] = []
    actif: bool = True
    version: str = "1.0"

class Inspection(BaseModel):
    """Inspection réalisée sur un bâtiment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    grille_inspection_id: str
    preventionniste_id: str  # ID de l'employé qui a fait l'inspection
    
    # Métadonnées inspection
    date_inspection: str = ""  # YYYY-MM-DD
    heure_debut: str = ""
    heure_fin: str = ""
    type_inspection: str = "reguliere"  # reguliere, suivi, urgence, plainte
    
    # Résultats
    resultats: Dict[str, Any] = {}  # Réponses JSON de la grille
    statut_global: str = "conforme"  # conforme, non_conforme, partiellement_conforme
    score_conformite: float = 100.0  # Pourcentage de conformité
    
    # Documentation
    photos: List[str] = []  # URLs des photos
    notes_inspection: str = ""
    recommandations: str = ""
    
    # Signature et validation
    signature_proprietaire: Optional[str] = None  # Signature numérique base64
    nom_representant: str = ""
    rapport_pdf_url: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionCreate(BaseModel):
    batiment_id: str
    grille_inspection_id: str
    preventionniste_id: str
    date_inspection: str
    heure_debut: str = ""
    heure_fin: str = ""
    type_inspection: str = "reguliere"
    resultats: Dict[str, Any] = {}
    statut_global: str = "conforme"
    score_conformite: float = 100.0
    photos: List[str] = []
    notes_inspection: str = ""
    recommandations: str = ""
    signature_proprietaire: Optional[str] = None
    nom_representant: str = ""

class NonConformite(BaseModel):
    """Non-conformité identifiée lors d'une inspection"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    inspection_id: str
    batiment_id: str
    
    # Description de la non-conformité
    titre: str = ""
    description: str = ""
    section_grille: str = ""  # Section de la grille où elle a été identifiée
    gravite: str = "moyen"  # faible, moyen, eleve, critique
    article_code: str = ""  # Article du code de sécurité
    
    # Suivi
    statut: str = "ouverte"  # ouverte, en_cours, corrigee, fermee
    delai_correction: Optional[str] = None  # Date limite YYYY-MM-DD
    date_correction: Optional[str] = None
    notes_correction: str = ""
    
    # Documentation
    photos_avant: List[str] = []
    photos_apres: List[str] = []
    
    # Responsabilité
    responsable_correction: str = ""  # Propriétaire/Gestionnaire
    preventionniste_suivi_id: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NonConformiteCreate(BaseModel):
    inspection_id: str
    batiment_id: str
    titre: str
    description: str = ""
    section_grille: str = ""
    gravite: str = "moyen"
    article_code: str = ""
    delai_correction: Optional[str] = None
    photos_avant: List[str] = []
    responsable_correction: str = ""
    preventionniste_suivi_id: Optional[str] = None


# ==================== MODÈLES ÉTENDUS POUR INSPECTIONS VISUELLES ====================

class PhotoInspection(BaseModel):
    """Photo prise lors d'une inspection"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str  # URL de stockage de la photo
    categorie: str = ""  # Ex: "Preuve accroche porte", "Adresse non visible", "Matières dangereuses"
    secteur: Optional[str] = None  # Secteur 1, 2, 3, 4, 5 selon schéma
    cadran: Optional[str] = None  # Cadran A, B, C, D (subdivision du Secteur 1)
    description: str = ""
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ParticipantInspection(BaseModel):
    """Participant à une inspection (pompier ou préventionniste)"""
    user_id: str
    nom_complet: str
    role: str  # "pompier" ou "preventionniste"
    est_principal: bool = False  # Le pompier connecté qui crée l'inspection

class InspectionVisuelle(BaseModel):
    """Inspection visuelle complète pour tablette/mobile"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    
    # Participants
    participants: List[ParticipantInspection] = []
    
    # Timing
    date_inspection: str = ""  # YYYY-MM-DD
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None
    duree_minutes: Optional[int] = None
    
    # Géolocalisation (capture automatique)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    
    # Photos catégorisées
    photos: List[PhotoInspection] = []
    
    # Non-conformités détaillées
    non_conformites_ids: List[str] = []  # Références aux NonConformite
    
    # Checklist dynamique selon type de bâtiment
    checklist_reponses: Dict[str, Any] = {}
    
    # Statuts
    statut: str = "en_cours"  # en_cours, validee, non_conforme, suivi_requis
    statut_conformite: str = "conforme"  # conforme, non_conforme, partiellement_conforme
    
    # Plan d'intervention
    plan_intervention_url: Optional[str] = None  # URL du PDF du plan
    
    # Notes
    notes_terrain: str = ""
    recommandations: str = ""
    
    # Validation (modifiable en tout temps)
    validee_par_id: Optional[str] = None
    date_validation: Optional[datetime] = None
    
    # Mode hors-ligne
    sync_status: str = "synced"  # synced, pending, offline
    
    # Métadonnées
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionVisuelleCreate(BaseModel):
    batiment_id: str
    participants: List[ParticipantInspection]
    date_inspection: str
    heure_debut: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    notes_terrain: str = ""

class InspectionVisuelleUpdate(BaseModel):
    participants: Optional[List[ParticipantInspection]] = None
    heure_fin: Optional[str] = None
    photos: Optional[List[PhotoInspection]] = None
    checklist_reponses: Optional[Dict[str, Any]] = None
    statut: Optional[str] = None
    statut_conformite: Optional[str] = None
    notes_terrain: Optional[str] = None
    recommandations: Optional[str] = None
    validee_par_id: Optional[str] = None

class NonConformiteVisuelle(BaseModel):
    """Non-conformité avec photos et gravité détaillée"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    inspection_id: str
    batiment_id: str
    
    # Description
    titre: str
    description: str = ""
    gravite: str = "mineur"  # mineur, majeur, critique
    
    # Articles et délais
    article_municipal: str = ""  # Ex: "Article 45.2"
    delai_correction_jours: Optional[int] = None
    date_limite: Optional[str] = None  # YYYY-MM-DD
    
    # Photos
    photos_nc: List[PhotoInspection] = []  # Photos de la non-conformité
    photos_resolution: List[PhotoInspection] = []  # Photos après correction
    
    # Statut
    statut: str = "nouvelle"  # nouvelle, en_cours, resolue
    date_resolution: Optional[datetime] = None
    notes_resolution: str = ""
    
    # Suivi
    responsable_correction: str = ""  # Nom propriétaire/gestionnaire
    preventionniste_suivi_id: Optional[str] = None
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class NonConformiteVisuelleCreate(BaseModel):
    inspection_id: str
    batiment_id: str
    titre: str
    description: str = ""
    gravite: str = "mineur"
    article_municipal: str = ""
    delai_correction_jours: Optional[int] = None
    photos_nc: List[PhotoInspection] = []
    responsable_correction: str = ""

class BatimentMapView(BaseModel):
    """Vue simplifiée pour affichage sur carte"""
    id: str
    nom_etablissement: str
    adresse_civique: str
    ville: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    niveau_risque: str
    statut_inspection: str  # "fait_conforme", "a_faire", "non_conforme", "en_cours"
    derniere_inspection: Optional[str] = None  # Date ISO
    groupe_occupation: str
    sous_groupe: str

class GeocodeRequest(BaseModel):
    """Requête de géocodage d'adresse"""
    adresse_complete: str

class GeocodeResponse(BaseModel):
    """Réponse de géocodage"""
    latitude: float
    longitude: float
    adresse_formatee: str
    precision: str  # "building", "street", "city"


# ==================== MODÈLES PLANS D'INTERVENTION ====================

class ElementPlanBase(BaseModel):
    """Classe de base pour tous les éléments d'un plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type_element: str  # hydrant, sortie, matiere_dangereuse, generatrice, gaz_naturel, reservoir_propane, vehicule
    latitude: float
    longitude: float
    numero: Optional[str] = None  # Ex: H1, S1, MD1 (auto-généré)
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HydrantElement(ElementPlanBase):
    """Hydrant sur le plan"""
    type_element: str = "hydrant"
    type_hydrant: str  # borne_fontaine, borne_seche, aspiration
    debit: float  # Débit
    unite_debit: str = "gal/min"  # gal/min ou L/min
    couleur_indicateur: Optional[str] = None  # Rouge, jaune, vert selon débit

class SortieElement(ElementPlanBase):
    """Sortie d'urgence sur le plan"""
    type_element: str = "sortie"
    type_sortie: str  # urgence, principale, secondaire
    largeur_m: Optional[float] = None
    acces_fauteuil: bool = False
    eclairage_secours: bool = False

class MatiereDangereuse(ElementPlanBase):
    """Matière dangereuse présente"""
    type_element: str = "matiere_dangereuse"
    nom_produit: str
    pictogramme_simdut: str  # URL ou code du pictogramme
    quantite: Optional[float] = None
    unite_quantite: str = "L"  # L, kg, m³
    classe_danger: str = ""  # Ex: "Inflammable", "Toxique", "Corrosif"

class GeneratriceElement(ElementPlanBase):
    """Génératrice d'urgence"""
    type_element: str = "generatrice"
    puissance_kw: Optional[float] = None
    emplacement_commutateur: str = ""
    type_carburant: str = ""  # diesel, essence, gaz naturel

class GazNaturelElement(ElementPlanBase):
    """Entrée de gaz naturel"""
    type_element: str = "gaz_naturel"
    emplacement_vanne_coupure: str
    accessible_exterieur: bool = True

class ReservoirPropaneElement(ElementPlanBase):
    """Réservoir de propane"""
    type_element: str = "reservoir_propane"
    capacite: float
    unite_capacite: str = "gallons"  # gallons ou litres
    emplacement_vanne: str
    type_reservoir: str = ""  # aerien, enterre

class VehiculeElement(ElementPlanBase):
    """Position recommandée pour véhicules d'intervention"""
    type_element: str = "vehicule"
    type_vehicule: str  # echelle, pompe, citerne
    position_recommandee: str  # Ex: "Face façade nord", "Cour arrière"
    notes_stationnement: str = ""

class RouteAcces(BaseModel):
    """Route d'accès au bâtiment"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str = "Route principale"
    chemin_polyline: List[Dict[str, float]] = []  # Liste de {lat, lng}
    largeur_m: Optional[float] = None
    pente: Optional[str] = None  # faible, moyenne, forte
    notes: str = ""
    est_principale: bool = True

class ZoneDanger(BaseModel):
    """Zone de danger ou périmètre d'évacuation"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nom: str
    type_zone: str  # perimetre_evacuation, zone_chaude, zone_tiede, zone_froide
    polygone: List[Dict[str, float]] = []  # Liste de {lat, lng}
    couleur: str = "#ff0000"  # Hex color
    opacite: float = 0.3
    rayon_m: Optional[float] = None
    description: str = ""

class SecteurPlan(BaseModel):
    """Secteur du bâtiment (même système que photos inspection)"""
    numero: int  # 1, 2, 3, 4, 5
    cadran: Optional[str] = None  # A, B, C, D (subdivision secteur 1)
    description: str = ""
    elements_ids: List[str] = []  # IDs des éléments dans ce secteur

class PlanEtage(BaseModel):
    """Plan d'un étage intérieur"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    numero_etage: int  # -1 (sous-sol), 0 (RDC), 1, 2, 3...
    nom: str  # "Rez-de-chaussée", "1er étage", "Sous-sol"
    image_url: Optional[str] = None  # Image du plan d'étage
    annotations: List[Dict[str, Any]] = []  # Annotations sur le plan
    elements_interieurs: List[Dict[str, Any]] = []  # Escaliers, ascenseurs, etc.

class PhotoPlanIntervention(BaseModel):
    """Photo attachée au plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    latitude: float = 0.0
    longitude: float = 0.0
    titre: str = ""
    description: str = ""
    localisation: str = ""  # Localisation textuelle dans le bâtiment (ex: "Entrée principale", "2e étage - côté est")
    categorie: str = ""  # facade, entree, systeme_alarme, points_eau, risques, autre
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IconePersonnalisee(BaseModel):
    """Icône personnalisée pour les plans d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str
    image_base64: str  # Image encodée en base64
    categorie: str  # hydrants, sorties, matieres_dangereuses, generateurs, gaz_naturel, propane, vehicules, autre
    created_by_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class IconePersonnaliseeCreate(BaseModel):
    """Création d'une icône personnalisée"""
    nom: str
    image_base64: str
    categorie: str

class PlanIntervention(BaseModel):
    """Plan d'intervention complet"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    batiment_id: str
    
    # Identification
    numero_plan: str  # Ex: "PI-2025-001"
    nom: str = ""
    
    # Versioning
    version: str = "1.0"
    version_precedente_id: Optional[str] = None
    
    # Statut et workflow
    statut: str = "brouillon"  # brouillon, en_attente_validation, valide, archive, rejete
    created_by_id: str  # ID du préventionniste créateur
    validated_by_id: Optional[str] = None  # ID admin/superviseur qui valide
    date_validation: Optional[datetime] = None
    commentaires_validation: str = ""
    commentaires_rejet: str = ""
    
    # Éléments du plan
    hydrants: List[HydrantElement] = []
    sorties: List[SortieElement] = []
    matieres_dangereuses: List[MatiereDangereuse] = []
    generatrices: List[GeneratriceElement] = []
    gaz_naturel: List[GazNaturelElement] = []
    reservoirs_propane: List[ReservoirPropaneElement] = []
    vehicules: List[VehiculeElement] = []
    
    # Structure spatiale
    routes_acces: List[RouteAcces] = []
    zones_danger: List[ZoneDanger] = []
    secteurs: List[SecteurPlan] = []
    plans_etages: List[PlanEtage] = []
    photos: List[PhotoPlanIntervention] = []
    
    # Layers GeoJSON pour le plan interactif (depuis le builder)
    layers: List[Dict[str, Any]] = []
    
    # Vue aérienne
    centre_lat: float
    centre_lng: float
    zoom_level: int = 18
    vue_aerienne_url: Optional[str] = None  # Google Static Map URL
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Dict[str, Any] = {}  # Modifications des icônes prédéfinies
    
    # Calculs automatiques
    distance_caserne_km: Optional[float] = None
    distance_caserne_unite: str = "km"  # km ou m
    temps_acces_minutes: Optional[int] = None
    
    # Documentation
    notes_generales: str = ""
    instructions_particulieres: str = ""
    
    # Export
    pdf_url: Optional[str] = None
    date_derniere_maj: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Métadonnées
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PlanInterventionCreate(BaseModel):
    batiment_id: str
    nom: str = ""
    centre_lat: float
    centre_lng: float
    notes_generales: str = ""
    
    # Champs optionnels pour permettre la sauvegarde depuis le builder
    layers: List[Dict[str, Any]] = Field(default_factory=list)
    hydrants: List[HydrantElement] = Field(default_factory=list)
    sorties: List[SortieElement] = Field(default_factory=list)
    matieres_dangereuses: List[MatiereDangereuse] = Field(default_factory=list)
    generatrices: List[GeneratriceElement] = Field(default_factory=list)
    gaz_naturel: List[GazNaturelElement] = Field(default_factory=list)
    reservoirs_propane: List[ReservoirPropaneElement] = Field(default_factory=list)
    vehicules: List[VehiculeElement] = Field(default_factory=list)
    routes_acces: List[RouteAcces] = Field(default_factory=list)
    zones_danger: List[ZoneDanger] = Field(default_factory=list)
    secteurs: List[SecteurPlan] = Field(default_factory=list)
    plans_etages: List[PlanEtage] = Field(default_factory=list)
    photos: List[PhotoPlanIntervention] = Field(default_factory=list)
    instructions_particulieres: str = ""
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Dict[str, Any] = Field(default_factory=dict)  # Modifications des icônes prédéfinies

class PlanInterventionUpdate(BaseModel):
    nom: Optional[str] = None
    statut: Optional[str] = None  # Permettre la mise à jour du statut (pour repasser rejete -> brouillon)
    layers: Optional[List[Dict[str, Any]]] = None  # Layers GeoJSON du builder
    hydrants: Optional[List[HydrantElement]] = None
    sorties: Optional[List[SortieElement]] = None
    matieres_dangereuses: Optional[List[MatiereDangereuse]] = None
    generatrices: Optional[List[GeneratriceElement]] = None
    gaz_naturel: Optional[List[GazNaturelElement]] = None
    reservoirs_propane: Optional[List[ReservoirPropaneElement]] = None
    vehicules: Optional[List[VehiculeElement]] = None
    routes_acces: Optional[List[RouteAcces]] = None
    zones_danger: Optional[List[ZoneDanger]] = None
    secteurs: Optional[List[SecteurPlan]] = None
    plans_etages: Optional[List[PlanEtage]] = None
    photos: Optional[List[PhotoPlanIntervention]] = None
    notes_generales: Optional[str] = None
    instructions_particulieres: Optional[str] = None
    carte_image: Optional[str] = None  # Capture d'écran de la carte en base64
    predefined_symbol_overrides: Optional[Dict[str, Any]] = None  # Modifications des icônes prédéfinies

class TemplatePlanIntervention(BaseModel):
    """Template pré-défini de plan d'intervention"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    nom: str  # Ex: "Résidentiel unifamilial", "Commercial petit", "Industriel F-1"
    type_batiment: str  # residentiel, commercial, industriel
    groupe_occupation: str  # A, B, C, D, E, F, G, I
    sous_groupe: Optional[str] = None  # F-1, F-2, F-3, etc.
    
    # Éléments pré-configurés (positions relatives)
    hydrants_defaut: List[Dict[str, Any]] = []
    sorties_defaut: List[Dict[str, Any]] = []
    vehicules_defaut: List[Dict[str, Any]] = []
    
    # Instructions
    instructions_utilisation: str = ""
    
    actif: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ValidationRequest(BaseModel):
    """Requête de validation de plan"""
    commentaires: str = ""

class RejectionRequest(BaseModel):
    """Requête de rejet de plan"""
    commentaires_rejet: str





# ====== ENDPOINTS CRUD POUR LES NOUVELLES DONNÉES ======

# BUDGETS
@api_router.post("/{tenant_slug}/rapports/budgets")
async def create_budget(tenant_slug: str, budget: BudgetCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin uniquement")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    budget_dict = budget.dict()
    budget_dict["tenant_id"] = tenant.id
    budget_obj = Budget(**budget_dict)
    await db.budgets.insert_one(budget_obj.dict())
    return clean_mongo_doc(budget_obj.dict())

@api_router.post("/{tenant_slug}/rapports/import-csv")
async def import_rapports_csv(
    tenant_slug: str,
    rapports_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Import en masse de budgets et dépenses depuis un CSV"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    items = rapports_data.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Aucun élément à importer")
    
    results = {
        "total": len(items),
        "created_budgets": 0,
        "created_depenses": 0,
        "updated": 0,
        "errors": [],
        "duplicates": []
    }
    
    for index, item_data in enumerate(items):
        try:
            # Validation des champs obligatoires
            if not item_data.get("date") or not item_data.get("description") or not item_data.get("montant"):
                results["errors"].append({
                    "line": index + 1,
                    "error": "Date, Description et Montant sont requis",
                    "data": item_data
                })
                continue
            
            # Déterminer le type (budget ou dépense)
            item_type = item_data.get("type", "depense").lower()
            if item_type not in ["budget", "depense", "dépense"]:
                results["errors"].append({
                    "line": index + 1,
                    "error": f"Type invalide: {item_type}. Doit être 'budget' ou 'depense'",
                    "data": item_data
                })
                continue
            
            # Normaliser le type
            if item_type in ["dépense", "depense"]:
                item_type = "depense"
            
            # Vérifier si l'élément existe déjà (par date + description + montant)
            collection = db.budgets if item_type == "budget" else db.depenses
            
            # Créer une date comparable
            date_str = item_data["date"]
            if isinstance(date_str, str):
                try:
                    # Essayer différents formats de date
                    from dateutil import parser
                    parsed_date = parser.parse(date_str)
                    date_comparable = parsed_date.strftime("%Y-%m-%d")
                except:
                    date_comparable = date_str
            else:
                date_comparable = date_str
            
            existing_item = await collection.find_one({
                "tenant_id": tenant.id,
                "date": date_comparable,
                "description": item_data["description"],
                "montant": float(item_data["montant"])
            })
            
            if existing_item:
                results["duplicates"].append({
                    "line": index + 1,
                    "type": item_type,
                    "date": date_comparable,
                    "description": item_data["description"],
                    "montant": item_data["montant"],
                    "action": item_data.get("action_doublon", "skip"),
                    "data": item_data
                })
                
                # Si action_doublon = update, mettre à jour
                if item_data.get("action_doublon") == "update":
                    update_data = {
                        "description": item_data["description"],
                        "montant": float(item_data["montant"]),
                        "categorie": item_data.get("categorie", ""),
                        "numero_reference": item_data.get("numero_reference", ""),
                        "fournisseur": item_data.get("fournisseur", ""),
                        "compte_budgetaire": item_data.get("compte_budgetaire", ""),
                        "projet_service": item_data.get("projet_service", ""),
                        "notes": item_data.get("notes", ""),
                        "piece_jointe_url": item_data.get("piece_jointe_url", ""),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    
                    await collection.update_one(
                        {"id": existing_item["id"], "tenant_id": tenant.id},
                        {"$set": update_data}
                    )
                    results["updated"] += 1
                else:
                    # skip par défaut
                    continue
            
            # Créer l'élément s'il n'existe pas
            if not existing_item:
                new_item = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant.id,
                    "date": date_comparable,
                    "description": item_data["description"],
                    "montant": float(item_data["montant"]),
                    "categorie": item_data.get("categorie", ""),
                    "numero_reference": item_data.get("numero_reference", ""),
                    "fournisseur": item_data.get("fournisseur", ""),
                    "compte_budgetaire": item_data.get("compte_budgetaire", ""),
                    "projet_service": item_data.get("projet_service", ""),
                    "notes": item_data.get("notes", ""),
                    "piece_jointe_url": item_data.get("piece_jointe_url", ""),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                # Champs spécifiques selon le type
                if item_type == "budget":
                    new_item["annee"] = item_data.get("annee", datetime.now(timezone.utc).year)
                    await db.budgets.insert_one(new_item)
                    results["created_budgets"] += 1
                else:
                    new_item["statut"] = item_data.get("statut", "approuve")
                    await db.depenses.insert_one(new_item)
                    results["created_depenses"] += 1
        
        except Exception as e:
            results["errors"].append({
                "line": index + 1,
                "error": str(e),
                "data": item_data
            })
    
    return results



@api_router.get("/{tenant_slug}/rapports/budgets")
async def get_budgets(tenant_slug: str, annee: Optional[int] = None, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    query = {"tenant_id": tenant.id}
    if annee:
        query["annee"] = annee
    
    budgets = await db.budgets.find(query).to_list(1000)
    return [clean_mongo_doc(b) for b in budgets]

@api_router.put("/{tenant_slug}/rapports/budgets/{budget_id}")
async def update_budget(tenant_slug: str, budget_id: str, budget: BudgetCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    budget_dict = budget.dict()
    budget_dict["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.budgets.update_one(
        {"id": budget_id, "tenant_id": tenant.id},
        {"$set": budget_dict}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Budget non trouvé")
    
    return {"message": "Budget mis à jour"}

@api_router.delete("/{tenant_slug}/rapports/budgets/{budget_id}")
async def delete_budget(tenant_slug: str, budget_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    result = await db.budgets.delete_one({"id": budget_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget non trouvé")
    
    return {"message": "Budget supprimé"}

# IMMOBILISATIONS
@api_router.post("/{tenant_slug}/rapports/immobilisations")
async def create_immobilisation(tenant_slug: str, immobilisation: ImmobilisationCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    immob_dict = immobilisation.dict()
    immob_dict["tenant_id"] = tenant.id
    immob_obj = Immobilisation(**immob_dict)
    await db.immobilisations.insert_one(immob_obj.dict())
    return clean_mongo_doc(immob_obj.dict())

@api_router.get("/{tenant_slug}/rapports/immobilisations")
async def get_immobilisations(tenant_slug: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    immobilisations = await db.immobilisations.find({"tenant_id": tenant.id}).to_list(1000)
    return [clean_mongo_doc(i) for i in immobilisations]

@api_router.delete("/{tenant_slug}/rapports/immobilisations/{immob_id}")
async def delete_immobilisation(tenant_slug: str, immob_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    result = await db.immobilisations.delete_one({"id": immob_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Immobilisation non trouvée")
    
    return {"message": "Immobilisation supprimée"}

# PROJETS TRIENNAUX
@api_router.post("/{tenant_slug}/rapports/projets-triennaux")
async def create_projet_triennal(tenant_slug: str, projet: ProjetTriennalCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    projet_dict = projet.dict()
    projet_dict["tenant_id"] = tenant.id
    projet_obj = ProjetTriennal(**projet_dict)
    await db.projets_triennaux.insert_one(projet_obj.dict())
    return clean_mongo_doc(projet_obj.dict())

@api_router.get("/{tenant_slug}/rapports/projets-triennaux")
async def get_projets_triennaux(tenant_slug: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    projets = await db.projets_triennaux.find({"tenant_id": tenant.id}).to_list(1000)
    return [clean_mongo_doc(p) for p in projets]

@api_router.delete("/{tenant_slug}/rapports/projets-triennaux/{projet_id}")
async def delete_projet_triennal(tenant_slug: str, projet_id: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    result = await db.projets_triennaux.delete_one({"id": projet_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Projet non trouvé")
    
    return {"message": "Projet supprimé"}

# INTERVENTIONS
@api_router.post("/{tenant_slug}/rapports/interventions")
async def create_intervention(tenant_slug: str, intervention: InterventionCreate, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    intervention_dict = intervention.dict()
    intervention_dict["tenant_id"] = tenant.id
    intervention_obj = Intervention(**intervention_dict)
    await db.interventions.insert_one(intervention_obj.dict())
    return clean_mongo_doc(intervention_obj.dict())

@api_router.get("/{tenant_slug}/rapports/interventions")
async def get_interventions(tenant_slug: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    interventions = await db.interventions.find({"tenant_id": tenant.id}).to_list(1000)
    return [clean_mongo_doc(i) for i in interventions]


# ====== RAPPORTS INTERNES ======

@api_router.get("/{tenant_slug}/rapports/dashboard-interne")
async def get_dashboard_interne(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Dashboard interne avec KPIs clés"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Date du mois en cours
    today = datetime.now(timezone.utc)
    debut_mois = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Récupérer les données
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Calculer heures travaillées ce mois
    heures_mois = 0
    for assignation in assignations:
        if "date" in assignation:
            try:
                date_assignation = datetime.fromisoformat(assignation["date"])
                if date_assignation >= debut_mois:
                    # Estimer 8h par assignation
                    heures_mois += 8
            except:
                pass
    
    # Calculer coûts salariaux du mois
    cout_salarial_mois = 0
    for user in users:
        taux_horaire = user.get("taux_horaire", 0)
        user_assignations = [a for a in assignations if a["user_id"] == user["id"]]
        user_heures = len(user_assignations) * 8
        cout_salarial_mois += user_heures * taux_horaire
    
    # Pompiers disponibles actuellement
    pompiers_disponibles = len([u for u in users if u.get("statut") == "Actif" and u.get("type_emploi") == "temps_plein"])
    
    return {
        "heures_travaillees_mois": heures_mois,
        "cout_salarial_mois": round(cout_salarial_mois, 2),
        "pompiers_disponibles": pompiers_disponibles,
        "total_pompiers": len(users),
        "periode": debut_mois.strftime("%B %Y")
    }


@api_router.get("/{tenant_slug}/rapports/couts-salariaux")
async def get_rapport_couts_salariaux(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    caserne: Optional[str] = None,
    type_personnel: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Rapport détaillé des coûts salariaux"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Convertir dates
    date_debut_dt = datetime.fromisoformat(date_debut)
    date_fin_dt = datetime.fromisoformat(date_fin)
    
    # Récupérer les données
    query_users = {"tenant_id": tenant.id}
    if type_personnel:
        query_users["type_emploi"] = type_personnel
    
    users = await db.users.find(query_users).to_list(1000)
    assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(10000)
    
    rapport = []
    cout_total = 0
    
    for user in users:
        # Filtrer assignations par période
        user_assignations = []
        for assignation in assignations:
            if assignation["user_id"] == user["id"] and "date" in assignation:
                try:
                    date_assign = datetime.fromisoformat(assignation["date"])
                    if date_debut_dt <= date_assign <= date_fin_dt:
                        user_assignations.append(assignation)
                except:
                    pass
        
        if len(user_assignations) > 0:
            heures_travaillees = len(user_assignations) * 8  # Estimation
            taux_horaire = user.get("taux_horaire", 0)
            cout_individuel = heures_travaillees * taux_horaire
            cout_total += cout_individuel
            
            rapport.append({
                "nom": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "matricule": user.get("numero_employe", "N/A"),
                "type_emploi": user.get("type_emploi", "N/A"),
                "heures_travaillees": heures_travaillees,
                "heures_supplementaires": 0,  # À implémenter
                "taux_horaire": taux_horaire,
                "cout_total": round(cout_individuel, 2)
            })
    
    return {
        "periode": {"debut": date_debut, "fin": date_fin},
        "employes": rapport,
        "cout_total": round(cout_total, 2),
        "nombre_employes": len(rapport)
    }






# ====== RAPPORTS EXTERNES ======

@api_router.get("/{tenant_slug}/rapports/tableau-bord-budgetaire")
async def get_tableau_bord_budgetaire(tenant_slug: str, annee: int, current_user: User = Depends(get_current_user)):
    """Tableau de bord budgétaire pour rapports externes"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les budgets de l'année
    budgets = await db.budgets.find({"tenant_id": tenant.id, "annee": annee}).to_list(1000)
    
    rapport_budgetaire = []
    total_alloue = 0
    total_consomme = 0
    
    for budget in budgets:
        alloue = budget.get("budget_alloue", 0)
        consomme = budget.get("budget_consomme", 0)
        total_alloue += alloue
        total_consomme += consomme
        
        rapport_budgetaire.append({
            "categorie": budget.get("categorie"),
            "budget_alloue": alloue,
            "budget_consomme": consomme,
            "pourcentage_utilise": round((consomme / alloue * 100) if alloue > 0 else 0, 1),
            "restant": alloue - consomme
        })
    
    return {
        "annee": annee,
        "budget_total_alloue": total_alloue,
        "budget_total_consomme": total_consomme,
        "pourcentage_global": round((total_consomme / total_alloue * 100) if total_alloue > 0 else 0, 1),
        "par_categorie": rapport_budgetaire
    }


@api_router.get("/{tenant_slug}/rapports/rapport-immobilisations")
async def get_rapport_immobilisations(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Rapport détaillé sur les immobilisations"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les immobilisations
    immobilisations = await db.immobilisations.find({"tenant_id": tenant.id}).to_list(1000)
    
    rapport = {
        "vehicules": [],
        "equipements": [],
        "statistiques": {
            "nombre_vehicules": 0,
            "nombre_equipements": 0,
            "cout_acquisition_total": 0,
            "cout_entretien_annuel_total": 0,
            "age_moyen_vehicules": 0,
            "age_moyen_equipements": 0
        }
    }
    
    today = datetime.now(timezone.utc).date()
    ages_vehicules = []
    ages_equipements = []
    
    for immob in immobilisations:
        # Calculer l'âge
        try:
            date_acquisition = datetime.fromisoformat(immob["date_acquisition"]).date()
            age_annees = (today - date_acquisition).days / 365.25
        except:
            age_annees = 0
        
        item = {
            "id": immob["id"],
            "nom": immob["nom"],
            "date_acquisition": immob["date_acquisition"],
            "age_annees": round(age_annees, 1),
            "cout_acquisition": immob["cout_acquisition"],
            "cout_entretien_annuel": immob["cout_entretien_annuel"],
            "etat": immob["etat"],
            "date_remplacement_prevue": immob.get("date_remplacement_prevue"),
            "notes": immob.get("notes", "")
        }
        
        if immob["type_immobilisation"] == "vehicule":
            rapport["vehicules"].append(item)
            rapport["statistiques"]["nombre_vehicules"] += 1
            ages_vehicules.append(age_annees)
        else:
            rapport["equipements"].append(item)
            rapport["statistiques"]["nombre_equipements"] += 1
            ages_equipements.append(age_annees)
        
        rapport["statistiques"]["cout_acquisition_total"] += immob["cout_acquisition"]
        rapport["statistiques"]["cout_entretien_annuel_total"] += immob["cout_entretien_annuel"]
    
    # Calculer âges moyens
    if ages_vehicules:
        rapport["statistiques"]["age_moyen_vehicules"] = round(sum(ages_vehicules) / len(ages_vehicules), 1)
    if ages_equipements:
        rapport["statistiques"]["age_moyen_equipements"] = round(sum(ages_equipements) / len(ages_equipements), 1)
    
    return rapport


# ====== EXPORTS PDF/EXCEL POUR LES RAPPORTS ======

@api_router.get("/{tenant_slug}/rapports/export-dashboard-pdf")
async def export_dashboard_pdf(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Export PDF du Dashboard interne"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données du dashboard
    today = datetime.now(timezone.utc)
    debut_mois = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(1000)
    
    heures_mois = 0
    for assignation in assignations:
        if "date" in assignation:
            try:
                date_assignation = datetime.fromisoformat(assignation["date"])
                if date_assignation >= debut_mois:
                    heures_mois += 8
            except:
                pass
    
    cout_salarial_mois = 0
    for user in users:
        taux_horaire = user.get("taux_horaire", 0)
        user_assignations = [a for a in assignations if a["user_id"] == user["id"]]
        user_heures = len(user_assignations) * 8
        cout_salarial_mois += user_heures * taux_horaire
    
    pompiers_disponibles = len([u for u in users if u.get("statut") == "Actif" and u.get("type_emploi") == "temps_plein"])
    
    # Générer le PDF
    buffer = io.BytesIO()
    doc = BrandedDocTemplate(buffer, tenant=tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Définir le page template avec frame
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')
    template = PageTemplate(id='branded', frames=frame)
    doc.addPageTemplates([template])
    
    story = []
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Header personnalisé (logo + nom service)
    header_elements = create_pdf_header_elements(tenant, styles)
    story.extend(header_elements)
    
    story.append(Paragraph("Dashboard Interne ProFireManager", modern_styles['title']))
    story.append(Paragraph(f"Période: {debut_mois.strftime('%B %Y')}", modern_styles['subheading']))
    story.append(Spacer(1, 0.2*inch))
    
    # KPIs
    kpi_data = [
        ["Indicateur", "Valeur"],
        ["Heures travaillées ce mois", f"{heures_mois}h"],
        ["Coût salarial du mois", f"${cout_salarial_mois:,.2f}"],
        ["Pompiers disponibles", str(pompiers_disponibles)],
        ["Total pompiers", str(len(users))]
    ]
    
    kpi_table = Table(kpi_data, colWidths=[3*inch, 2*inch])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(kpi_table)
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=dashboard_interne_{debut_mois.strftime('%Y%m')}.pdf"}
    )


@api_router.get("/{tenant_slug}/rapports/export-salaires-pdf")
async def export_salaires_pdf(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    """Export PDF du rapport coûts salariaux"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données
    date_debut_dt = datetime.fromisoformat(date_debut)
    date_fin_dt = datetime.fromisoformat(date_fin)
    
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(10000)
    
    rapport = []
    cout_total = 0
    
    for user in users:
        user_assignations = []
        for assignation in assignations:
            if assignation["user_id"] == user["id"] and "date" in assignation:
                try:
                    date_assign = datetime.fromisoformat(assignation["date"])
                    if date_debut_dt <= date_assign <= date_fin_dt:
                        user_assignations.append(assignation)
                except:
                    pass
        
        if len(user_assignations) > 0:
            heures_travaillees = len(user_assignations) * 8
            taux_horaire = user.get("taux_horaire", 0)
            cout_individuel = heures_travaillees * taux_horaire
            cout_total += cout_individuel
            
            rapport.append({
                "nom": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "matricule": user.get("numero_employe", "N/A"),
                "type_emploi": user.get("type_emploi", "N/A"),
                "heures_travaillees": heures_travaillees,
                "taux_horaire": taux_horaire,
                "cout_total": cout_individuel
            })
    
    # Générer PDF
    buffer = io.BytesIO()
    doc = BrandedDocTemplate(buffer, tenant=tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Définir le page template avec frame
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')
    template = PageTemplate(id='branded', frames=frame)
    doc.addPageTemplates([template])
    
    story = []
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Header personnalisé (logo + nom service)
    header_elements = create_pdf_header_elements(tenant, styles)
    story.extend(header_elements)
    
    story.append(Paragraph("Rapport de Coûts Salariaux Détaillés", modern_styles['title']))
    story.append(Paragraph(f"Période: {date_debut} au {date_fin}", modern_styles['subheading']))
    story.append(Spacer(1, 0.2*inch))
    
    # Résumé
    summary_data = [
        ["Résumé", ""],
        ["Coût total", f"${cout_total:,.2f}"],
        ["Nombre d'employés", str(len(rapport))],
        ["Total heures", f"{sum([r['heures_travaillees'] for r in rapport])}h"]
    ]
    
    summary_table = Table(summary_data, colWidths=[2.5*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(summary_table)
    story.append(Spacer(1, 0.3*inch))
    
    # Tableau détaillé
    table_data = [["Nom", "Matricule", "Type", "Heures", "Taux/h", "Coût"]]
    for emp in rapport:
        type_emploi = emp.get("type_emploi", "temps_plein")
        if type_emploi == "temps_plein":
            type_abbr = "TP"
        elif type_emploi == "temporaire":
            type_abbr = "Tempo"
        else:
            type_abbr = "TPart"
        table_data.append([
            emp.get("nom", ""),
            emp.get("matricule", ""),
            type_abbr,
            f"{emp.get('heures_travaillees', 0)}h",
            f"${emp.get('taux_horaire', 0)}",
            f"${emp.get('cout_total', 0):,.2f}"
        ])
    
    detail_table = Table(table_data, colWidths=[1.8*inch, 1*inch, 0.7*inch, 0.8*inch, 0.8*inch, 1.2*inch])
    detail_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
        ('TOPPADDING', (0, 0), (-1, 0), 10),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
    ]))
    
    story.append(detail_table)
    doc.build(story)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=rapport_salaires_{date_debut}_{date_fin}.pdf"}
    )


@api_router.get("/{tenant_slug}/rapports/export-salaires-excel")
async def export_salaires_excel(
    tenant_slug: str,
    date_debut: str,
    date_fin: str,
    current_user: User = Depends(get_current_user)
):
    """Export Excel du rapport coûts salariaux"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les données (même logique que PDF)
    date_debut_dt = datetime.fromisoformat(date_debut)
    date_fin_dt = datetime.fromisoformat(date_fin)
    
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    assignations = await db.assignations.find({"tenant_id": tenant.id}).to_list(10000)
    
    rapport = []
    cout_total = 0
    
    for user in users:
        user_assignations = []
        for assignation in assignations:
            if assignation["user_id"] == user["id"] and "date" in assignation:
                try:
                    date_assign = datetime.fromisoformat(assignation["date"])
                    if date_debut_dt <= date_assign <= date_fin_dt:
                        user_assignations.append(assignation)
                except:
                    pass
        
        if len(user_assignations) > 0:
            heures_travaillees = len(user_assignations) * 8
            taux_horaire = user.get("taux_horaire", 0)
            cout_individuel = heures_travaillees * taux_horaire
            cout_total += cout_individuel
            
            rapport.append({
                "nom": f"{user.get('prenom', '')} {user.get('nom', '')}",
                "matricule": user.get("numero_employe", "N/A"),
                "type_emploi": user.get("type_emploi", "N/A"),
                "heures_travaillees": heures_travaillees,
                "taux_horaire": taux_horaire,
                "cout_total": cout_individuel
            })
    
    # Générer Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Coûts Salariaux"
    
    # En-tête
    ws['A1'] = f"Rapport de Coûts Salariaux - {date_debut} au {date_fin}"
    ws['A1'].font = Font(size=14, bold=True, color="DC2626")
    ws.merge_cells('A1:F1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    # Résumé
    ws['A3'] = "Coût Total"
    ws['B3'] = f"${cout_total:,.2f}"
    ws['C3'] = "Employés"
    ws['D3'] = len(rapport)
    ws['E3'] = "Total Heures"
    ws['F3'] = f"{sum([r['heures_travaillees'] for r in rapport])}h"
    
    # Tableau
    headers = ["Nom", "Matricule", "Type", "Heures", "Taux/h", "Coût Total"]
    row = 5
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
        cell.alignment = Alignment(horizontal='center')
    
    for emp in rapport:
        row += 1
        ws.cell(row=row, column=1, value=emp.get("nom", ""))
        ws.cell(row=row, column=2, value=emp.get("matricule", ""))
        ws.cell(row=row, column=3, value=emp.get("type_emploi", "temps_plein"))
        ws.cell(row=row, column=4, value=emp.get("heures_travaillees", 0))
        ws.cell(row=row, column=5, value=emp.get("taux_horaire", 0))
        ws.cell(row=row, column=6, value=emp.get("cout_total", 0))
    
    # Ajuster largeurs
    for col in ['A', 'B', 'C', 'D', 'E', 'F']:
        ws.column_dimensions[col].width = 18
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=rapport_salaires_{date_debut}_{date_fin}.xlsx"}
    )


# ==================== DASHBOARD MESSAGES ROUTES MIGRÉES VERS routes/dashboard_messages.py ====================
# Routes migrées:
# - POST   /{tenant_slug}/dashboard/messages              - Créer un message important
# - GET    /{tenant_slug}/dashboard/messages              - Liste des messages importants
# - DELETE /{tenant_slug}/dashboard/messages/{message_id} - Supprimer un message
# ============================================================================


# DASHBOARD DONNÉES COMPLÈTES
@api_router.get("/{tenant_slug}/dashboard/donnees-completes")
async def get_dashboard_donnees_completes(tenant_slug: str, current_user: User = Depends(get_current_user)):
    """Endpoint central pour toutes les données du dashboard"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Date du mois en cours
    today = datetime.now(timezone.utc)
    debut_mois = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    fin_mois = (debut_mois + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    debut_mois_prochain = fin_mois + timedelta(days=1)
    fin_mois_prochain = (debut_mois_prochain + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    
    # Récupérer uniquement les données nécessaires avec filtres
    # Types de garde (petite collection, OK de tout charger)
    types_garde = await db.types_garde.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Assignations du mois en cours UNIQUEMENT pour l'utilisateur
    mes_assignations_mois = await db.assignations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "date": {
            "$gte": debut_mois.isoformat(),
            "$lte": fin_mois.isoformat()
        }
    }).to_list(1000)
    
    # Inscriptions de l'utilisateur uniquement
    mes_inscriptions = await db.inscriptions_formations.find({
        "tenant_id": tenant.id,
        "user_id": current_user.id
    }).to_list(1000)
    
    # Formations pour les inscriptions + futures
    formation_ids = [i["formation_id"] for i in mes_inscriptions]
    formations = await db.formations.find({
        "tenant_id": tenant.id,
        "$or": [
            {"id": {"$in": formation_ids}},
            {"date_debut": {"$gte": today.isoformat()}}
        ]
    }).to_list(1000)
    
    # Pour section admin : charger données agrégées uniquement si nécessaire
    if current_user.role in ["admin", "superviseur"]:
        users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
        assignations = await db.assignations.find({
            "tenant_id": tenant.id,
            "date": {
                "$gte": debut_mois.isoformat(),
                "$lte": fin_mois.isoformat()
            }
        }).to_list(5000)
        demandes_remplacement = await db.demandes_remplacement.find({"tenant_id": tenant.id}).to_list(1000)
    else:
        users = []
        assignations = mes_assignations_mois
        demandes_remplacement = []
    
    # Créer un mapping des types de garde pour accès rapide
    type_garde_map = {t["id"]: t for t in types_garde}
    
    # Vérifier si le tenant a au moins une garde externe
    has_garde_externe = any(t.get("est_garde_externe", False) for t in types_garde)
    
    # ===== SECTION PERSONNELLE =====
    # Heures travaillées ce mois (séparé interne/externe)
    logger.info(f"📊 Dashboard - User {current_user.email}: {len(mes_assignations_mois)} assignations trouvées")
    heures_mois_internes = 0
    heures_mois_externes = 0
    heures_mois_total = 0
    nombre_gardes_mois = 0
    for assignation in mes_assignations_mois:
        try:
            date_str = assignation["date"]
            logger.info(f"📊 Traitement assignation - date: {date_str}, type: {type(date_str)}")
            
            # Gérer les différents formats de date
            if isinstance(date_str, str):
                # Retirer le 'Z' et gérer le timezone
                date_str = date_str.replace('Z', '+00:00')
                if 'T' in date_str:
                    date_assign = datetime.fromisoformat(date_str)
                else:
                    # Format date simple YYYY-MM-DD
                    date_assign = datetime.fromisoformat(date_str + "T00:00:00").replace(tzinfo=timezone.utc)
            else:
                # Si c'est déjà un datetime
                date_assign = date_str
            
            logger.info(f"📊 Date parsée: {date_assign}, debut_mois: {debut_mois}, fin_mois: {fin_mois}")
            
            if debut_mois <= date_assign <= fin_mois:
                # Récupérer le type de garde pour calculer la durée exacte
                type_garde = type_garde_map.get(assignation.get("type_garde_id"))
                logger.info(f"📊 Type garde trouvé: {type_garde.get('nom') if type_garde else 'None'}")
                if type_garde:
                    duree = type_garde.get("duree_heures", 8)
                    if type_garde.get("est_garde_externe", False):
                        heures_mois_externes += duree
                    else:
                        heures_mois_internes += duree
                    heures_mois_total += duree
                    logger.info(f"📊 Heures ajoutées: {duree}h (total: {heures_mois_total}h)")
                else:
                    # Fallback si type garde non trouvé
                    heures_mois_internes += 8
                    heures_mois_total += 8
                    logger.info(f"📊 Heures ajoutées (fallback): 8h (total: {heures_mois_total}h)")
                nombre_gardes_mois += 1
            else:
                logger.info(f"📊 Date hors du mois en cours, ignorée")
        except Exception as e:
            logger.error(f"📊 Erreur traitement assignation: {e}, assignation: {assignation}")
            pass
    
    # Présence aux formations
    formations_passees = 0
    presences = 0
    for insc in mes_inscriptions:
        formation = next((f for f in formations if f["id"] == insc["formation_id"]), None)
        if formation:
            try:
                date_fin_formation = datetime.fromisoformat(formation["date_fin"]).date()
                if date_fin_formation < today.date():
                    formations_passees += 1
                    if insc.get("statut") == "present":
                        presences += 1
            except:
                pass
    
    pourcentage_presence_formations = round((presences / formations_passees * 100) if formations_passees > 0 else 0, 1)
    
    # Formations à venir (toutes les formations futures à partir d'aujourd'hui)
    formations_a_venir = []
    for formation in formations:
        try:
            if "date_debut" in formation and formation["date_debut"]:
                date_debut_formation = datetime.fromisoformat(formation["date_debut"].replace('Z', '+00:00'))
                # Inclure toutes les formations qui commencent aujourd'hui ou dans le futur
                if date_debut_formation.date() >= today.date():
                    # Vérifier si inscrit
                    est_inscrit = any(i for i in mes_inscriptions if i["formation_id"] == formation["id"])
                    formations_a_venir.append({
                        "id": formation["id"],
                        "nom": formation["nom"],
                        "date_debut": formation["date_debut"],
                        "date_fin": formation["date_fin"],
                        "est_inscrit": est_inscrit
                    })
        except (ValueError, TypeError, AttributeError):
            # Ignorer les formations avec des dates invalides
            pass
    
    formations_a_venir.sort(key=lambda x: x["date_debut"])
    
    section_personnelle = {
        "heures_travaillees_mois": heures_mois_total,  # Total pour compatibilité
        "heures_internes_mois": heures_mois_internes,
        "heures_externes_mois": heures_mois_externes,
        "has_garde_externe": has_garde_externe,  # Indicateur si garde externe existe
        "nombre_gardes_mois": nombre_gardes_mois,
        "pourcentage_presence_formations": pourcentage_presence_formations,
        "formations_a_venir": formations_a_venir
    }
    
    # ===== SECTION GÉNÉRALE (Admin/Superviseur uniquement) =====
    section_generale = None
    if current_user.role in ["admin", "superviseur"]:
        # OPTIMISATION : Calculs simplifiés pour dashboard rapide
        # Compter assignations et statistiques avec agrégation MongoDB
        
        # Nombre total d'assignations du mois
        nb_assignations_mois = len(assignations)
        
        # Estimation rapide de couverture (éviter boucles coûteuses)
        # Personnel requis estimé : types_garde × jours_mois × personnel moyen
        jours_mois = (fin_mois - debut_mois).days + 1
        personnel_moyen_par_garde = sum(t.get("personnel_requis", 1) for t in types_garde) / len(types_garde) if types_garde else 1
        total_personnel_requis_estime = len(types_garde) * jours_mois * personnel_moyen_par_garde * 0.7  # 70% des jours (moyenne)
        
        couverture_planning = round((nb_assignations_mois / total_personnel_requis_estime * 100), 1) if total_personnel_requis_estime > 0 else 0
        couverture_planning = min(couverture_planning, 100.0)  # Cap à 100%
        
        # Postes à pourvoir estimés
        postes_a_pourvoir = max(0, int(total_personnel_requis_estime - nb_assignations_mois))
        
        # Demandes de congé à approuver (déjà filtrées)
        demandes_en_attente = len([d for d in demandes_remplacement if d.get("statut") == "en_attente"])
        
        # Stats du mois - Utiliser les données déjà chargées
        nb_formations_mois = await db.formations.count_documents({
            "tenant_id": tenant.id,
            "date_debut": {
                "$gte": debut_mois.isoformat(),
                "$lte": fin_mois.isoformat()
            }
        })
        
        nb_personnel_actif = await db.users.count_documents({
            "tenant_id": tenant.id,
            "statut": "Actif"
        })
        
        stats_mois = {
            "total_assignations": nb_assignations_mois,
            "total_personnel_actif": nb_personnel_actif,
            "formations_ce_mois": nb_formations_mois
        }
        
        section_generale = {
            "couverture_planning": couverture_planning,
            "postes_a_pourvoir": postes_a_pourvoir,  # Renommé pour clarté
            "demandes_conges_en_attente": demandes_en_attente,
            "statistiques_mois": stats_mois
        }
    
    # ===== ACTIVITÉS RÉCENTES (Filtrage selon le rôle) =====
    activites_recentes = []
    
    # Filtrer selon le rôle
    if current_user.role == "admin":
        # Admins voient tout (sauf paramètres)
        activites = await db.activites.find({
            "tenant_id": tenant.id,
            "type_activite": {"$nin": ["parametres"]}  # Exclure les paramètres
        }).sort("created_at", -1).limit(50).to_list(50)
        activites_recentes = [clean_mongo_doc(a) for a in activites]
    
    elif current_user.role in ["superviseur", "employe"]:
        # Superviseurs et employés voient :
        # - Formations créées
        # - Planning validé/publié
        # - Activités les concernant directement
        # - Messages importants
        activites = await db.activites.find({
            "tenant_id": tenant.id,
            "$or": [
                {"type_activite": {"$in": ["formation_creation", "planning_publication", "message_important"]}},
                {"user_id": current_user.id},  # Leurs propres activités
                {"data.concerne_user_id": current_user.id}  # Activités qui les concernent
            ]
        }).sort("created_at", -1).limit(30).to_list(30)
        activites_recentes = [clean_mongo_doc(a) for a in activites]
    
    return {
        "section_personnelle": section_personnelle,
        "section_generale": section_generale,
        "activites_recentes": activites_recentes
    }


# Fonction helper pour créer des activités
async def creer_activite(
    tenant_id: str, 
    type_activite: str, 
    description: str, 
    user_id: Optional[str] = None, 
    user_nom: Optional[str] = None,
    data: Optional[dict] = None  # Données supplémentaires pour filtrage
):
    """Helper pour créer une activité dans le système avec auto-nettoyage après 30 jours"""
    activite = Activite(
        tenant_id=tenant_id,
        type_activite=type_activite,
        description=description,
        user_id=user_id,
        user_nom=user_nom
    )
    
    activite_dict = activite.dict()
    if data:
        activite_dict["data"] = data  # Ajouter les données supplémentaires
    
    await db.activites.insert_one(activite_dict)
    
    # Nettoyage automatique des activités > 30 jours
    date_limite = datetime.now(timezone.utc) - timedelta(days=30)
    await db.activites.delete_many({
        "tenant_id": tenant_id,
        "created_at": {"$lt": date_limite}
    })


# ====================================================================
# MODULE PERSONNEL - EXPORTS PDF/EXCEL
# ====================================================================

@api_router.get("/{tenant_slug}/personnel/export-pdf")
async def export_personnel_pdf(
    tenant_slug: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export PDF de la liste personnel ou d'un utilisateur individuel"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les utilisateurs
    if user_id:
        users_data = await db.users.find({"id": user_id, "tenant_id": tenant.id}).to_list(1)
    else:
        users_data = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Générer PDF
    buffer = io.BytesIO()
    doc = BrandedDocTemplate(buffer, tenant=tenant, pagesize=A4, topMargin=0.5*inch, bottomMargin=0.5*inch)
    
    # Définir le page template avec frame
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')
    template = PageTemplate(id='branded', frames=frame)
    doc.addPageTemplates([template])
    
    story = []
    styles = getSampleStyleSheet()
    modern_styles = get_modern_pdf_styles(styles)
    
    # Header personnalisé (logo + nom service)
    header_elements = create_pdf_header_elements(tenant, styles)
    story.extend(header_elements)
    
    titre = "Fiche Employé" if user_id else "Liste du Personnel"
    story.append(Paragraph(titre, modern_styles['title']))
    story.append(Spacer(1, 0.2*inch))
    
    if not user_id:
        # Statistiques globales
        total = len(users_data)
        actifs = len([u for u in users_data if u.get("statut") == "Actif"])
        temps_plein = len([u for u in users_data if u.get("type_emploi") == "temps_plein"])
        temps_partiel = len([u for u in users_data if u.get("type_emploi") == "temps_partiel"])
        
        stats_data = [
            ["Statistiques", ""],
            ["Total personnel", str(total)],
            ["Actifs", str(actifs)],
            ["Temps plein", str(temps_plein)],
            ["Temps partiel", str(temps_partiel)]
        ]
        
        stats_table = Table(stats_data, colWidths=[2.5*inch, 2*inch])
        stats_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
        ]))
        
        story.append(stats_table)
        story.append(Spacer(1, 0.3*inch))
    
    # Tableau ou fiche individuelle
    if user_id and users_data:
        # Fiche individuelle détaillée
        user = users_data[0]
        fiche_data = [
            ["Nom complet", f"{user.get('prenom', '')} {user.get('nom', '')}"],
            ["Email", user.get("email", "N/A")],
            ["Téléphone", user.get("telephone", "N/A")],
            ["Grade", user.get("grade", "N/A")],
            ["Rôle", user.get("role", "N/A")],
            ["Type emploi", user.get("type_emploi", "N/A")],
            ["Statut", user.get("statut", "N/A")],
            ["Taux horaire", f"${user.get('taux_horaire', 0)}/h"],
            ["Adresse", user.get("adresse", "N/A")]
        ]
        
        fiche_table = Table(fiche_data, colWidths=[2*inch, 4*inch])
        fiche_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), modern_styles['bg_light']),
            ('TEXTCOLOR', (0, 0), (0, -1), modern_styles['primary_color']),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('PADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (1, 0), (1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid'])
        ]))
        
        story.append(fiche_table)
    else:
        # Liste complète
        table_data = [["Nom", "Email", "Grade", "Rôle", "Type", "Statut"]]
        
        for user in users_data:
            type_emploi = user.get("type_emploi", "temps_plein")
            if type_emploi == "temps_plein":
                type_abbr = "TP"
            elif type_emploi == "temporaire":
                type_abbr = "Tempo"
            else:
                type_abbr = "TPart"
            table_data.append([
                f"{user.get('prenom', '')} {user.get('nom', '')}",
                user.get("email", "N/A"),
                user.get("grade", "N/A"),
                user.get("role", "N/A"),
                type_abbr,
                user.get("statut", "N/A")
            ])
        
        detail_table = Table(table_data, colWidths=[1.5*inch, 1.5*inch, 1.2*inch, 1*inch, 0.6*inch, 0.8*inch])
        detail_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), modern_styles['primary_color']),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, modern_styles['grid']),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, modern_styles['bg_light']])
        ]))
        
        story.append(detail_table)
    
    doc.build(story)
    buffer.seek(0)
    
    filename = f"fiche_employe_{user_id}.pdf" if user_id else "liste_personnel.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@api_router.get("/{tenant_slug}/personnel/export-excel")
async def export_personnel_excel(
    tenant_slug: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Export Excel de la liste personnel ou d'un utilisateur individuel"""
    if current_user.role == "employe":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Récupérer les utilisateurs
    if user_id:
        users_data = await db.users.find({"id": user_id, "tenant_id": tenant.id}).to_list(1)
    else:
        users_data = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    
    # Générer Excel
    wb = Workbook()
    ws = wb.active
    ws.title = "Personnel"
    
    # En-tête
    titre = "Fiche Employé" if user_id else "Liste du Personnel"
    ws['A1'] = titre
    ws['A1'].font = Font(size=14, bold=True, color="DC2626")
    ws.merge_cells('A1:F1')
    ws['A1'].alignment = Alignment(horizontal='center')
    
    if not user_id:
        # Stats
        total = len(users_data)
        actifs = len([u for u in users_data if u.get("statut") == "Actif"])
        
        ws['A3'] = "Total personnel"
        ws['B3'] = total
        ws['A4'] = "Personnel actif"
        ws['B4'] = actifs
        
        # Tableau
        headers = ["Nom", "Prénom", "Email", "Grade", "Rôle", "Type", "Statut", "Téléphone"]
        row = 6
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill(start_color="FCA5A5", end_color="FCA5A5", fill_type="solid")
            cell.alignment = Alignment(horizontal='center')
        
        for user in users_data:
            row += 1
            ws.cell(row=row, column=1, value=user.get("nom", ""))
            ws.cell(row=row, column=2, value=user.get("prenom", ""))
            ws.cell(row=row, column=3, value=user.get("email", ""))
            ws.cell(row=row, column=4, value=user.get("grade", ""))
            ws.cell(row=row, column=5, value=user.get("role", ""))
            ws.cell(row=row, column=6, value=user.get("type_emploi", ""))
            ws.cell(row=row, column=7, value=user.get("statut", ""))
            ws.cell(row=row, column=8, value=user.get("telephone", ""))
    else:
        # Fiche individuelle
        if users_data:
            user = users_data[0]
            row = 3
            fields = [
                ("Nom", user.get("nom", "")),
                ("Prénom", user.get("prenom", "")),
                ("Email", user.get("email", "")),
                ("Téléphone", user.get("telephone", "")),
                ("Grade", user.get("grade", "")),
                ("Rôle", user.get("role", "")),
                ("Type emploi", user.get("type_emploi", "")),
                ("Statut", user.get("statut", "")),
                ("Adresse", user.get("adresse", ""))
            ]
            
            for field, value in fields:
                ws.cell(row=row, column=1, value=field).font = Font(bold=True)
                ws.cell(row=row, column=2, value=value)
                row += 1
    
    # Ajuster largeurs
    for col in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']:
        ws.column_dimensions[col].width = 18
    
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    filename = f"fiche_employe_{user_id}.xlsx" if user_id else "liste_personnel.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# Sessions de formation routes




# ==================== GESTION DES CONFLITS DISPONIBILITÉS/INDISPONIBILITÉS ====================

async def detect_conflicts(tenant_id: str, user_id: str, date: str, heure_debut: str, 
                          heure_fin: str, type_garde_id: Optional[str], 
                          element_type: str) -> List[Dict[str, Any]]:
    """
    Détecte les conflits entre disponibilités/indisponibilités
    
    Détecte 3 types de conflits:
    1. Disponibilité ↔ Indisponibilité (incompatible)
    2. Disponibilité ↔ Disponibilité avec horaires différents (peut fusionner)
    3. Indisponibilité ↔ Indisponibilité (peut fusionner)
    
    Args:
        tenant_id: ID du tenant
        user_id: ID de l'utilisateur
        date: Date au format YYYY-MM-DD
        heure_debut: Heure de début (HH:MM)
        heure_fin: Heure de fin (HH:MM)
        type_garde_id: ID du type de garde (optionnel)
        element_type: "disponibilite" ou "indisponibilite"
        
    Returns:
        Liste des conflits avec détails et type (incompatible/mergeable)
    """
    from datetime import datetime
    
    conflicts = []
    
    # NOUVELLE LOGIQUE: Chercher TOUS les éléments du même jour (pas seulement l'opposé)
    # On filtrera après pour déterminer si c'est incompatible ou fusionnable
    existing_entries = await db.disponibilites.find({
        "tenant_id": tenant_id,
        "user_id": user_id,
        "date": date
    }).to_list(length=None)
    
    # Convertir les heures en minutes pour comparaison
    def time_to_minutes(time_str):
        h, m = map(int, time_str.split(':'))
        return h * 60 + m
    
    new_start = time_to_minutes(heure_debut)
    new_end = time_to_minutes(heure_fin)
    
    # Récupérer les types de garde pour affichage
    types_garde_map = {}
    types_garde_list = await db.types_garde.find({"tenant_id": tenant_id}).to_list(length=None)
    for tg in types_garde_list:
        types_garde_map[tg["id"]] = tg.get("nom", "N/A")
    
    for entry in existing_entries:
        existing_start = time_to_minutes(entry["heure_debut"])
        existing_end = time_to_minutes(entry["heure_fin"])
        
        # Vérifier le chevauchement
        if not (new_end <= existing_start or new_start >= existing_end):
            # Il y a chevauchement
            overlap_start = max(new_start, existing_start)
            overlap_end = min(new_end, existing_end)
            
            # Convertir retour en HH:MM
            def minutes_to_time(minutes):
                h = minutes // 60
                m = minutes % 60
                return f"{h:02d}:{m:02d}"
            
            # Déterminer le type de conflit
            is_same_type = entry["statut"] == element_type
            
            # Vérifier si c'est une couverture complète (fusionnable)
            is_covered = (existing_start <= new_start and existing_end >= new_end)
            
            conflict_detail = {
                "conflict_id": entry["id"],
                "conflict_type": entry["statut"],
                "date": entry["date"],
                "heure_debut": entry["heure_debut"],
                "heure_fin": entry["heure_fin"],
                "type_garde_id": entry.get("type_garde_id"),
                "type_garde_nom": types_garde_map.get(entry.get("type_garde_id"), "Tous types"),
                "statut": entry["statut"],
                "overlap_start": minutes_to_time(overlap_start),
                "overlap_end": minutes_to_time(overlap_end),
                "origine": entry.get("origine", "manuelle"),
                "conflict_severity": "compatible_covered" if (is_same_type and is_covered) else ("compatible_overlap" if is_same_type else "incompatible")
            }
            
            # Ajouter un message descriptif
            if is_same_type and is_covered:
                conflict_detail["message"] = "Cette plage horaire est déjà couverte par une entrée existante."
            elif is_same_type:
                conflict_detail["message"] = f"Chevauchement avec une autre {element_type}. Fusion automatique possible."
            else:
                action = "disponibilité" if element_type == "disponibilite" else "indisponibilité"
                conflict = "indisponibilité" if entry["statut"] == "indisponible" else "disponibilité"
                conflict_detail["message"] = f"Incompatible: Vous essayez d'ajouter une {action} alors qu'une {conflict} existe déjà."
            
            conflicts.append(conflict_detail)
    
    return conflicts

# Disponibilités routes

# ===== EXPORTS DISPONIBILITES =====












# ===== EXPORTS DISPONIBILITES =====



# ==================== PUSH NOTIFICATIONS ROUTES MIGRÉES ====================
# Routes et fonctions migrées vers routes/notifications.py:
# - POST /{tenant_slug}/notifications/register-device    - Enregistrer device FCM
# - POST /{tenant_slug}/notifications/send               - Envoyer push FCM
# - GET  /{tenant_slug}/notifications/vapid-key          - Obtenir clé VAPID
# - POST /{tenant_slug}/notifications/subscribe          - S'abonner Web Push
# - POST /{tenant_slug}/notifications/unsubscribe        - Se désabonner Web Push
# - POST /{tenant_slug}/notifications/send-web-push      - Envoyer Web Push
# - send_push_notification_to_users() (helper FCM)
# - send_web_push_to_users() (helper Web Push)
# ===========================================================================



# Assignation manuelle avancée avec récurrence

# ==================== SSE ENDPOINT POUR PROGRESSION ====================
@api_router.put("/{tenant_slug}/assignations/{assignation_id}/notes")
async def update_assignation_notes(
    tenant_slug: str,
    assignation_id: str,
    notes: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user)
):
    """Permet à un admin de mettre à jour les notes sur une assignation auto"""
    if current_user.role not in ["admin", "superviseur"]:
        raise HTTPException(status_code=403, detail="Accès refusé - Admin uniquement")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Trouver l'assignation
    assignation = await db.assignations.find_one({
        "id": assignation_id,
        "tenant_id": tenant.id
    })
    
    if not assignation:
        raise HTTPException(status_code=404, detail="Assignation non trouvée")
    
    # Mettre à jour les notes
    await db.assignations.update_one(
        {"id": assignation_id},
        {"$set": {"notes_admin": notes}}
    )
    
    return {"message": "Notes mises à jour avec succès", "notes": notes}

# Endpoint pour générer le rapport d'audit des assignations automatiques
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



# ==================== PARAMÈTRES DE VALIDATION DU PLANNING ====================





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

# ==================== NOTIFICATIONS ROUTES MIGRÉES VERS routes/notifications.py ====================
# Routes migrées:
# - GET /{tenant_slug}/notifications                            - Liste des notifications
# - GET /{tenant_slug}/notifications/non-lues/count            - Compteur non lues
# - PUT /{tenant_slug}/notifications/{notification_id}/marquer-lu - Marquer une notification lue
# - PUT /{tenant_slug}/notifications/marquer-toutes-lues       - Marquer toutes lues
# Note: La fonction creer_notification a été déplacée vers routes/dependencies.py
# ============================================================================

# ==================== PARAMÈTRES REMPLACEMENTS MIGRÉS VERS routes/remplacements.py ====================
# GET    /{tenant_slug}/parametres/remplacements             - Récupérer paramètres
# PUT    /{tenant_slug}/parametres/remplacements             - Modifier paramètres
# ============================================================================



# ==================== PARAMÈTRES NIVEAUX D'ATTRIBUTION - MIGRÉ ====================
# Routes migrées vers routes/parametres.py:
# - GET /{tenant_slug}/parametres/niveaux-attribution
# - PUT /{tenant_slug}/parametres/niveaux-attribution
# ==================================================================================



# ==================== PARAMÈTRES VALIDATION PLANNING ROUTES MIGRÉES VERS routes/parametres_disponibilites.py ====================
# Routes migrées:
# - GET    /{tenant_slug}/parametres/validation-planning         - Paramètres validation planning
# - PUT    /{tenant_slug}/parametres/validation-planning         - Modifier paramètres validation
# ============================================================================

# ==================== PARAMÈTRES DISPONIBILITÉS ROUTES MIGRÉES VERS routes/parametres_disponibilites.py ====================
# Routes migrées:
# - GET    /{tenant_slug}/parametres/disponibilites              - Récupérer les paramètres
# - PUT    /{tenant_slug}/parametres/disponibilites              - Modifier les paramètres
# - POST   /{tenant_slug}/disponibilites/envoyer-rappels         - Déclencher les rappels
# ============================================================================


# ==================== ÉQUIPES DE GARDE ROUTES MIGRÉES VERS routes/equipes_garde.py ====================
# Routes migrées:
# - GET    /{tenant_slug}/parametres/equipes-garde     - Récupérer les paramètres
# - PUT    /{tenant_slug}/parametres/equipes-garde     - Modifier les paramètres
# - GET    /{tenant_slug}/equipes-garde/equipe-du-jour - Équipe de garde pour une date
# - GET    /{tenant_slug}/equipes-garde/calendrier     - Calendrier des rotations
# - GET    /{tenant_slug}/equipes-garde/employes       - Employés par équipe
# Fonctions helper: get_equipe_garde_du_jour_sync, get_equipe_garde_rotation_standard
# ============================================================================


# ==================== MATÉRIEL ROUTES MIGRÉES VERS routes/materiel.py ====================
# Routes migrées (~20 routes):
# - GET/POST/PUT/DELETE /{tenant_slug}/materiel/categories - Catégories
# - GET/POST/PUT/DELETE /{tenant_slug}/materiel - Items de matériel
# - POST/GET /{tenant_slug}/materiel/{id}/mouvement - Mouvements de stock
# - GET/POST/PUT /{tenant_slug}/materiel/maintenances - Maintenances
# - POST/GET /{tenant_slug}/materiel/{id}/inspection - Inspections
# - GET /{tenant_slug}/materiel/statistiques - Statistiques
# ============================================================================


# ==================== ÉQUIPEMENTS EXPORTS/IMPORTS ROUTES MIGRÉES VERS routes/equipements_exports.py ====================
# Routes migrées:
# - GET    /{tenant_slug}/equipements/export-csv            - Export CSV
# - GET    /{tenant_slug}/equipements/export-pdf            - Export PDF
# - POST   /{tenant_slug}/equipements/import-csv            - Import CSV
# - POST   /{tenant_slug}/equipements/categories/initialiser - Initialiser catégories
# ============================================================================


# ==================== INVENTAIRES VÉHICULES ROUTES MIGRÉES VERS routes/inventaires_vehicules.py ====================
# Routes migrées:
# - GET    /{tenant_slug}/parametres/modeles-inventaires-vehicules           - Liste des modèles
# - POST   /{tenant_slug}/parametres/modeles-inventaires-vehicules           - Créer un modèle
# - PUT    /{tenant_slug}/parametres/modeles-inventaires-vehicules/{id}      - Modifier un modèle
# - DELETE /{tenant_slug}/parametres/modeles-inventaires-vehicules/{id}      - Supprimer un modèle
# - GET    /{tenant_slug}/vehicules/{id}/modele-inventaire                   - Modèle pour un véhicule
# - POST   /{tenant_slug}/vehicules/{id}/inventaire                          - Effectuer un inventaire
# - GET    /{tenant_slug}/vehicules/{id}/inventaires                         - Historique inventaires
# - GET    /{tenant_slug}/vehicules/{id}/inventaires/{inv_id}                - Détails inventaire
# ============================================================================

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


# ==================== ROUTES ACTIFS MIGRÉES VERS routes/actifs.py ====================
# Les routes CRUD véhicules, bornes, inventaires, matériels ont été extraites vers:
# /app/backend/routes/actifs.py
# Les modèles Pydantic ci-dessous restent ici car utilisés par d'autres fonctions


# ==================== GESTION DES ACTIFS - INSPECTIONS SAAQ MODELS ====================

class DefectDetail(BaseModel):
    """Détail d'une défectuosité identifiée"""
    item: str  # Ex: "Freins avant", "Pneu avant gauche"
    severity: str  # "mineure" ou "majeure"
    description: str
    photo_url: Optional[str] = None
    reported_by: str
    reported_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None

class InspectionSAAQ(BaseModel):
    """Inspection de sécurité SAAQ (Ronde pré-départ)"""
    id: str = Field(default_factory=lambda: f"insp_{str(uuid.uuid4())[:8]}")
    tenant_id: str
    vehicle_id: str
    
    # Inspecteur
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    
    # Signature électronique
    signature_certify: bool = False  # "Je certifie avoir effectué cette inspection"
    signature_timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signature_gps: Optional[List[float]] = None  # [longitude, latitude]
    
    # Date/Heure inspection
    inspection_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Checklist (Structure flexible pour différents types de véhicules)
    checklist: Dict[str, Any] = Field(default_factory=dict)
    
    # Défectuosités
    defects: List[DefectDetail] = []
    has_major_defect: bool = False  # Flag pour hors service
    
    # Photos
    photo_urls: List[str] = []
    
    # Résultat
    passed: bool = True
    comments: Optional[str] = None
    
    # Offline sync (pour Atlas Device Sync)
    synced: bool = False
    created_offline: bool = False
    device_id: Optional[str] = None
    
    # Métadonnées
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InspectionSAAQCreate(BaseModel):
    vehicle_id: str
    inspector_id: str
    inspector_name: str
    inspector_matricule: Optional[str] = None
    signature_certify: bool
    signature_gps: Optional[List[float]] = None
    checklist: Dict[str, Any]
    defects: List[DefectDetail] = []
    photo_urls: List[str] = []
    comments: Optional[str] = None
    device_id: Optional[str] = None

class AuditLogEntry(BaseModel):
    """Entrée dans la fiche de vie d'un actif"""
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    user_id: str
    user_name: str
    action: str  # Ex: "created", "updated", "inspected", "repaired", "status_changed"
    details: Optional[str] = None
    gps: Optional[List[float]] = None  # Position GPS si applicable

# ==================== ROUTES SAAQ, QR CODES, IMPORT BORNES, PARAMETRES ACTIFS ====================
# Ces routes ont été migrées vers /app/backend/routes/actifs.py
# - POST /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspection-saaq
# - GET  /{tenant_slug}/actifs/vehicules/{vehicle_id}/inspections
# - GET  /{tenant_slug}/actifs/vehicules/{vehicle_id}/fiche-vie
# - POST /{tenant_slug}/actifs/vehicules/{vehicle_id}/qr-code
# - POST /{tenant_slug}/actifs/bornes/{borne_id}/qr-code
# - POST /{tenant_slug}/actifs/bornes/import-inspections
# - GET/PUT /{tenant_slug}/actifs/parametres



# ==================== RONDES DE SÉCURITÉ ROUTES MIGRÉES VERS routes/rondes_securite.py ====================
# Routes migrées:
# - POST   /{tenant_slug}/actifs/rondes-securite                          - Créer une ronde
# - GET    /{tenant_slug}/actifs/rondes-securite                          - Liste des rondes
# - GET    /{tenant_slug}/actifs/rondes-securite/vehicule/{id}            - Rondes d'un véhicule
# - GET    /{tenant_slug}/actifs/rondes-securite/{id}/pdf                 - Export PDF d'une ronde
# ============================================================================

# Endpoint public pour lister les tenants (pour l'app mobile)
@app.get("/api/tenants")
async def get_all_tenants():
    """Récupère la liste de tous les tenants actifs (casernes) pour la sélection dans l'app mobile"""
    try:
        tenants = await db.tenants.find(
            {"actif": True},
            {"_id": 0, "id": 1, "slug": 1, "nom": 1}
        ).to_list(length=None)
        return tenants
    except Exception as e:
        return []



# ==================== MODULE BORNES SÈCHES - TEMPLATES & INSPECTIONS ====================

# Modèles Pydantic pour les templates de bornes sèches
class BorneSecheTemplateCreate(BaseModel):
    nom_borne: str
    municipalite: str = "Canton de Shefford"
    adresse_proximite: Optional[str] = None
    transversale: Optional[str] = None
    lien_itineraire: Optional[str] = None
    notes_importantes: Optional[str] = None
    # Caractéristiques techniques
    type_borne: Optional[str] = "PVC"
    angle: Optional[str] = "90°"
    diametre_tuyau: Optional[str] = '6"'
    diametre_raccordement: Optional[str] = '6"'
    type_branchement: Optional[str] = "Fileté"
    # Photos et schémas (URLs ou Base64)
    photo_localisation: Optional[str] = None
    photo_borne: Optional[str] = None
    schema_1: Optional[str] = None  # Centre borne
    schema_2: Optional[str] = None  # Centre entrée pompe
    schema_3: Optional[str] = None  # Centre sortie borne
    schema_4: Optional[str] = None  # Distance borne à berge
    schema_5: Optional[str] = None  # Centre sortie borne et entrée pompe

class BorneSecheTemplateUpdate(BaseModel):
    nom_borne: Optional[str] = None
    municipalite: Optional[str] = None
    adresse_proximite: Optional[str] = None
    transversale: Optional[str] = None
    lien_itineraire: Optional[str] = None
    notes_importantes: Optional[str] = None
    type_borne: Optional[str] = None
    angle: Optional[str] = None
    diametre_tuyau: Optional[str] = None
    diametre_raccordement: Optional[str] = None
    type_branchement: Optional[str] = None
    photo_localisation: Optional[str] = None
    photo_borne: Optional[str] = None
    schema_1: Optional[str] = None
    schema_2: Optional[str] = None
    schema_3: Optional[str] = None
    schema_4: Optional[str] = None
    schema_5: Optional[str] = None

# Modèle pour les inspections de bornes sèches
class InspectionBorneSecheCreate(BaseModel):
    borne_seche_id: str
    inspecteur_id: str
    date_inspection: str
    # Page 3 - Questions d'inspection
    accessibilite: List[str] = []  # ["Sécuritaire", "Facile", "Dangereuse", "Difficile"]
    conditions_atmospheriques: str  # "Nuageux", "Dégagé", "Froid", "Pluvieux", "Enneigé"
    temperature_exterieure: Optional[str] = None
    # Inspection visuelle (8 items)
    joint_present: str = "N/A"  # Conforme, Non conforme, Défectuosité, N/A
    joint_bon_etat: str = "N/A"
    site_accessible: str = "N/A"
    site_bien_deneige: str = "N/A"
    vanne_sortie_storz_4: str = "N/A"
    vanne_sortie_6_filetee: str = "N/A"
    vanne_sortie_4_filetee: str = "N/A"
    niveau_plan_eau: str = "N/A"
    # Essai de pompage
    pompage_continu_5min: str = "Non conforme"  # Conforme, Non conforme
    temps_amorcage_secondes: Optional[int] = None  # Chronomètre
    # Commentaires et signature
    commentaire: Optional[str] = None
    matricule_pompier: Optional[str] = None
    photos_defauts: Optional[List[str]] = []  # URLs ou Base64 des photos prises

# ==================== BORNES SÈCHES ROUTES MIGRÉES VERS routes/bornes_seches.py ====================
# Routes migrées (~20 routes):
# - GET/POST/PUT/DELETE /{tenant_slug}/bornes-seches/templates - Templates
# - GET/POST /{tenant_slug}/bornes-seches/inspections - Inspections
# - GET/POST/PUT/DELETE /{tenant_slug}/bornes-seches/modeles-inspection - Modèles d'inspection
# - POST /{tenant_slug}/bornes-seches/modeles-inspection/{id}/activer - Activer modèle
# - POST /{tenant_slug}/bornes-seches/modeles-inspection/{id}/dupliquer - Dupliquer modèle
# - GET/POST /{tenant_slug}/bornes-seches/inspections-personnalisees - Inspections personnalisées
# ============================================================================




# ==================== MODULE APPROVISIONNEMENT EN EAU - MIGRÉ ====================
# Routes migrées vers routes/approvisionnement_eau.py:
# - GET/POST /{tenant_slug}/approvisionnement-eau/points-eau
# - GET/PUT/DELETE /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}
# - POST /{tenant_slug}/approvisionnement-eau/inspections
# - GET /{tenant_slug}/approvisionnement-eau/points-eau/{point_id}/inspections
# - POST /{tenant_slug}/approvisionnement-eau/bornes-seches/{point_id}/programmer-test
# ===============================================================================






# Include routers in the main app
# IMPORTANT: L'ordre détermine la priorité des routes
# Module personnel extrait et prioritaire
app.include_router(personnel_router, prefix="/api")  # Module Personnel (GET/PUT/DELETE users)
app.include_router(actifs_router, prefix="/api")  # Module Actifs (véhicules, bornes, inventaires, rondes)
app.include_router(formations_router, prefix="/api")  # Module Formations (CRUD + inscriptions)
app.include_router(equipements_router, prefix="/api")  # Module Équipements (CRUD + maintenance + alertes)
app.include_router(prevention_router, prefix="/api")  # Module Prévention (bâtiments, inspections, grilles, secteurs)
app.include_router(planning_router, prefix="/api")  # Module Planning (assignations, rapports heures)
app.include_router(sftp_router, prefix="/api")  # Module SFTP (cartes d'appel 911, WebSocket)
app.include_router(billing_router, prefix="/api")  # Module Billing (Stripe, facturation)
app.include_router(admin_router, prefix="/api")  # Module Admin (centrales 911, audit logs)
app.include_router(debogage_router, prefix="/api")  # Module Débogage (bugs, features)
app.include_router(paie_complet_router, prefix="/api")  # Module Paie complet
app.include_router(interventions_router, prefix="/api")  # Module Interventions
app.include_router(apria_router, prefix="/api")  # Module APRIA - Inspections
app.include_router(epi_router, prefix="/api")  # Module EPI - Équipements protection
app.include_router(competences_grades_router, prefix="/api")  # Module Compétences & Grades
app.include_router(types_garde_router, prefix="/api")  # Module Types de Garde
app.include_router(dashboard_messages_router, prefix="/api")  # Module Messages Dashboard
app.include_router(conges_router, prefix="/api")  # Module Demandes de Congé
app.include_router(notifications_router, prefix="/api")  # Module Notifications (lecture)
app.include_router(personnalisation_router, prefix="/api")  # Module Personnalisation (logo, branding)
app.include_router(materiel_router, prefix="/api")  # Module Matériel & Stock
app.include_router(bornes_seches_router, prefix="/api")  # Module Bornes Sèches
app.include_router(points_eau_router, prefix="/api")  # Module Points d'Eau
app.include_router(remplacements_router, prefix="/api")  # Module Remplacements
app.include_router(equipes_garde_router, prefix="/api")  # Module Équipes de Garde
app.include_router(inventaires_vehicules_router, prefix="/api")  # Module Inventaires Véhicules
app.include_router(rondes_securite_router, prefix="/api")  # Module Rondes de Sécurité
app.include_router(parametres_disponibilites_router, prefix="/api")  # Module Paramètres Disponibilités
app.include_router(generation_indisponibilites_router, prefix="/api")  # Module Génération Indisponibilités
app.include_router(equipements_exports_router, prefix="/api")  # Module Équipements Exports/Imports
app.include_router(users_router, prefix="/api")  # Module Users
app.include_router(disponibilites_router, prefix="/api")  # Module Disponibilités
app.include_router(approvisionnement_eau_router, prefix="/api")  # Module Approvisionnement Eau
app.include_router(validations_competences_router, prefix="/api")  # Module Validations Compétences
app.include_router(parametres_router, prefix="/api")  # Module Paramètres Généraux
app.include_router(statistiques_router, prefix="/api")  # Module Statistiques Dashboard
app.include_router(api_router)  # Routes principales (server.py) - DOIT être avant auth_router pour que /admin/auth/login soit traité avant /{tenant_slug}/auth/login
app.include_router(auth_router, prefix="/api")  # Module Auth (tenant routes)
app.include_router(pwa_router, prefix="/api")
app.include_router(dsi_router, prefix="/api")
app.include_router(dsi_transmissions_router, prefix="/api")

# Add CORS middleware
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