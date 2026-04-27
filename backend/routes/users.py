"""
Routes API pour le module Users
===============================

Gestion des utilisateurs : création, modification, photos de profil, statistiques.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid
import logging
import base64
import csv
from io import StringIO

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    User,
    SECRET_KEY,
    ALGORITHM,
    validate_complex_password,
    get_password_hash,
    verify_password,
    creer_activite,
    require_permission,
    user_has_module_action
)

router = APIRouter(tags=["Users"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

class UserCreate(BaseModel):
    tenant_id: Optional[str] = None
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
    competences: List[str] = []
    accepte_gardes_externes: bool = True
    est_preventionniste: bool = False
    equipe_garde: Optional[int] = None
    caserne_ids: List[str] = []
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
    equipe_garde: Optional[int] = None
    caserne_ids: Optional[List[str]] = None
    photo_profil: Optional[str] = None
    tailles_epi: Optional[Dict[str, str]] = None
    mot_de_passe: Optional[str] = None
    preferences_notifications: Optional[Dict[str, bool]] = None

class ProfileUpdate(BaseModel):
    prenom: Optional[str] = None
    nom: Optional[str] = None
    email: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    contact_urgence: Optional[str] = None
    heures_max_semaine: Optional[int] = None
    tailles_epi: Optional[Dict[str, str]] = None
    preferences_notifications: Optional[Dict[str, bool]] = None

class PhotoProfilUpload(BaseModel):
    photo_base64: str

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class AccessUpdate(BaseModel):
    role: str


# Helper function pour redimensionner les images
from io import BytesIO
from PIL import Image as PILImage

def resize_and_compress_image_bytes(base64_string: str, max_size: int = 200) -> bytes:
    """Redimensionne et compresse une image base64, retourne les bytes JPEG."""
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        image_data = base64.b64decode(base64_string)
        
        if len(image_data) > 10 * 1024 * 1024:
            raise ValueError("Image trop volumineuse (max 10MB)")
        
        img = PILImage.open(BytesIO(image_data))
        
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
        
        width, height = img.size
        min_dim = min(width, height)
        
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim
        img = img.crop((left, top, right, bottom))
        
        img = img.resize((max_size, max_size), PILImage.Resampling.LANCZOS)
        
        buffer = BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        buffer.seek(0)
        
        return buffer.read()
    except Exception as e:
        logger.error(f"Erreur resize image: {e}")
        raise ValueError(f"Erreur traitement image: {str(e)}")


# ==================== ROUTES MIGRÉES DE SERVER.PY ====================

# POST users
@router.post("/{tenant_slug}/users", response_model=User)
async def create_user(tenant_slug: str, user_create: UserCreate, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module personnel
    await require_permission(tenant.id, current_user, "personnel", "creer")
    
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
        # Envoyer email au super admin via Resend
        super_admin_email = "gussdub@icloud.com"
        try:
            resend_api_key = os.environ.get('RESEND_API_KEY')
            if resend_api_key:
                resend.api_key = resend_api_key
                
                params = {
                    "from": os.environ.get('SENDER_EMAIL', 'noreply@profiremanager.ca'),
                    "to": [super_admin_email],
                    "subject": f'⚠️ Limite de palier atteinte - {tenant.nom}',
                    "html": f"""
                    <h2>Alerte - Limite de palier atteinte</h2>
                    <p><strong>Caserne:</strong> {tenant.nom} ({tenant_slug})</p>
                    <p><strong>Palier actuel:</strong> {palier}</p>
                    <p><strong>Personnel actuel:</strong> {current_count}/{limite}</p>
                    <p><strong>Prix actuel:</strong> {prix}/mois</p>
                    <p>L'administrateur a tenté de créer un {current_count + 1}e pompier mais la limite est atteinte.</p>
                    <p><strong>Action requise:</strong> Contacter le client pour upgrade vers palier supérieur.</p>
                    """
                }
                resend.Emails.send(params)
                # Log email
                try:
                    from routes.emails_history import log_email_sent
                    import asyncio
                    asyncio.create_task(log_email_sent(
                        type_email="alerte_limite_palier",
                        destinataire_email=super_admin_email,
                        sujet=f"⚠️ Limite palier atteinte - {tenant.nom}",
                        tenant_id=tenant.id,
                        tenant_slug=tenant_slug
                    ))
                except:
                    pass
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
    
    # CORRECTION CRITIQUE: Synchroniser formations vers competences
    # Le frontend utilise "formations" mais l'algorithme cherche dans "competences"
    if "formations" in user_dict:
        user_dict["competences"] = user_dict["formations"]
        logging.info(f"🔄 [SYNC CREATE] Copie formations → competences: {user_dict['formations']}")
    
    user_obj = User(**user_dict)
    
    await db.users.insert_one(user_obj.dict())
    
    # Créer une activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_creation",
        description=f"👤 {current_user.prenom} {current_user.nom} a ajouté {user_create.prenom} {user_create.nom} ({user_create.grade}) au personnel",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Envoyer l'email de bienvenue
    try:
        from server import send_welcome_email
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


# POST users/import-csv
@router.post("/{tenant_slug}/users/import-csv")
async def import_users_csv(
    tenant_slug: str,
    users_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Import en masse d'utilisateurs/personnel depuis un CSV"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de création sur le module personnel
    await require_permission(tenant.id, current_user, "personnel", "creer")
    
    users = users_data.get("users", [])
    if not users:
        raise HTTPException(status_code=400, detail="Aucun utilisateur à importer")
    
    # Vérifier la limite du palier
    current_count = await db.users.count_documents({"tenant_id": tenant.id})
    total_to_import = len(users)
    
    if current_count < 30:
        limite = 30
        palier = "Basic (1-30)"
    elif current_count < 50:
        limite = 50
        palier = "Standard (31-50)"
    else:
        limite = None
        palier = "Premium (51+)"
    
    if limite and (current_count + total_to_import) > limite:
        raise HTTPException(
            status_code=403,
            detail=f"Import refusé: dépassement du palier {palier}. Vous avez {current_count} utilisateurs, tentative d'import de {total_to_import}. Limite: {limite}."
        )
    
    results = {
        "total": total_to_import,
        "created": 0,
        "updated": 0,
        "errors": [],
        "duplicates": [],
        "password_reset_emails": []
    }
    
    # Précharger tous les utilisateurs pour matching intelligent
    existing_users_list = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    users_by_email = {u.get("email", "").lower(): u for u in existing_users_list if u.get("email")}
    users_by_name = create_user_matching_index(existing_users_list)
    users_by_num = {u.get("numero_employe"): u for u in existing_users_list if u.get("numero_employe")}
    
    for index, user_data in enumerate(users):
        try:
            # Validation des champs obligatoires
            if not user_data.get("prenom") or not user_data.get("nom") or not user_data.get("email"):
                results["errors"].append({
                    "line": index + 1,
                    "error": "Prénom, Nom et Email sont requis",
                    "data": user_data
                })
                continue
            
            # Vérifier si l'utilisateur existe déjà (stratégie multi-niveaux)
            existing_user = None
            
            # Niveau 1 : Par email (priorité haute - identifiant unique)
            if user_data.get("email"):
                email_normalized = user_data["email"].lower().strip()
                existing_user = users_by_email.get(email_normalized)
            
            # Niveau 2 : Par numéro d'employé (si email absent ou pas trouvé)
            if not existing_user and user_data.get("numero_employe"):
                num_employe = user_data["numero_employe"].strip()
                existing_user = users_by_num.get(num_employe)
            
            # Niveau 3 : Par nom complet avec matching intelligent (fallback)
            if not existing_user and user_data.get("prenom") and user_data.get("nom"):
                # Construire la chaîne de recherche
                search_string = f"{user_data['prenom']} {user_data['nom']}"
                if user_data.get("numero_employe"):
                    search_string += f" ({user_data['numero_employe']})"
                
                existing_user = find_user_intelligent(
                    search_string=search_string,
                    users_by_name=users_by_name,
                    users_by_num=users_by_num,
                    numero_field="numero_employe"
                )
            
            if existing_user:
                results["duplicates"].append({
                    "line": index + 1,
                    "email": user_data["email"],
                    "action": user_data.get("action_doublon", "skip"),
                    "data": user_data
                })
                
                # Si action_doublon = update, mettre à jour
                if user_data.get("action_doublon") == "update":
                    update_data = {
                        "prenom": user_data["prenom"],
                        "nom": user_data["nom"],
                        "numero_employe": user_data.get("numero_employe", ""),
                        "grade": user_data.get("grade", ""),
                        "type_emploi": user_data.get("type_emploi", "temps_plein"),
                        "telephone": user_data.get("telephone", ""),
                        "adresse": user_data.get("adresse", ""),
                        "role": user_data.get("role", "employe"),
                        "accepte_gardes_externes": user_data.get("accepte_gardes_externes", False)
                    }
                    
                    # Champs optionnels
                    if user_data.get("date_embauche"):
                        update_data["date_embauche"] = user_data["date_embauche"]
                    if user_data.get("taux_horaire"):
                        update_data["taux_horaire"] = float(user_data["taux_horaire"])
                    if user_data.get("competences"):
                        update_data["competences"] = user_data["competences"].split(",") if isinstance(user_data["competences"], str) else user_data["competences"]
                    
                    # Contact d'urgence
                    if user_data.get("contact_urgence_nom"):
                        update_data["contact_urgence"] = {
                            "nom": user_data.get("contact_urgence_nom", ""),
                            "telephone": user_data.get("contact_urgence_telephone", ""),
                            "relation": user_data.get("contact_urgence_relation", "")
                        }
                    
                    await db.users.update_one(
                        {"id": existing_user["id"], "tenant_id": tenant.id},
                        {"$set": update_data}
                    )
                    results["updated"] += 1
                else:
                    # skip par défaut
                    continue
            
            # Créer l'utilisateur s'il n'existe pas
            if not existing_user:
                # Générer un mot de passe temporaire
                temp_password = f"Temp{str(uuid.uuid4())[:8]}!"
                
                new_user = {
                    "id": str(uuid.uuid4()),
                    "tenant_id": tenant.id,
                    "email": user_data["email"],
                    "prenom": user_data["prenom"],
                    "nom": user_data["nom"],
                    "numero_employe": user_data.get("numero_employe", ""),
                    "grade": user_data.get("grade", ""),
                    "type_emploi": user_data.get("type_emploi", "temps_plein"),
                    "telephone": user_data.get("telephone", ""),
                    "adresse": user_data.get("adresse", ""),
                    "role": user_data.get("role", "employe"),
                    "accepte_gardes_externes": user_data.get("accepte_gardes_externes", False),
                    "mot_de_passe_hash": get_password_hash(temp_password),
                    "heures_internes": 0,
                    "heures_externes": 0,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                
                # Champs optionnels
                if user_data.get("date_embauche"):
                    new_user["date_embauche"] = user_data["date_embauche"]
                if user_data.get("taux_horaire"):
                    new_user["taux_horaire"] = float(user_data["taux_horaire"])
                if user_data.get("competences"):
                    new_user["competences"] = user_data["competences"].split(",") if isinstance(user_data["competences"], str) else user_data["competences"]
                
                # Contact d'urgence
                if user_data.get("contact_urgence_nom"):
                    new_user["contact_urgence"] = {
                        "nom": user_data.get("contact_urgence_nom", ""),
                        "telephone": user_data.get("contact_urgence_telephone", ""),
                        "relation": user_data.get("contact_urgence_relation", "")
                    }
                
                await db.users.insert_one(new_user)
                results["created"] += 1
                
                # Envoyer email de réinitialisation de mot de passe
                try:
                    # Créer un token de réinitialisation
                    reset_token = str(uuid.uuid4())
                    await db.password_resets.insert_one({
                        "email": user_data["email"],
                        "tenant_id": tenant.id,
                        "token": reset_token,
                        "created_at": datetime.now(timezone.utc),
                        "expires_at": datetime.now(timezone.utc) + timedelta(days=7)
                    })
                    
                    # Envoyer l'email (fonction à implémenter selon votre système d'emails)
                    reset_url = f"{os.environ.get('FRONTEND_URL')}/reset-password?token={reset_token}"
                    # send_password_reset_email(user_data["email"], reset_url)
                    
                    results["password_reset_emails"].append({
                        "email": user_data["email"],
                        "reset_url": reset_url
                    })
                except Exception as e:
                    results["errors"].append({
                        "line": index + 1,
                        "error": f"Utilisateur créé mais email non envoyé: {str(e)}",
                        "data": user_data
                    })
        
        except Exception as e:
            results["errors"].append({
                "line": index + 1,
                "error": str(e),
                "data": user_data
            })
    
    return results


# PUT users/mon-profil
@router.put("/{tenant_slug}/users/mon-profil", response_model=User)
async def update_mon_profil(
    tenant_slug: str,
    profile_data: ProfileUpdate,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())
):
    """
    Permet à un utilisateur de modifier son propre profil
    Supporte les utilisateurs normaux ET les super-admins
    """
    import jwt
    
    logger.info(f"=== UPDATE MON PROFIL START === tenant_slug={tenant_slug}")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    tenant_id = tenant.id if hasattr(tenant, 'id') else tenant.get('id')
    logger.info(f"Tenant trouvé: {tenant_id}")
    
    try:
        # Décoder le token pour obtenir l'ID et le type d'utilisateur
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        is_super_admin = payload.get("is_super_admin", False)
        token_tenant_id = payload.get("tenant_id")
        
        logger.info(f"Token decoded: user_id={user_id}, is_super_admin={is_super_admin}, token_tenant_id={token_tenant_id}")
        
        if not user_id:
            raise HTTPException(status_code=400, detail="ID utilisateur non trouvé dans le token")
        
        update_data = profile_data.dict(exclude_unset=True)
        
        if is_super_admin:
            # C'est un super-admin - chercher dans super_admins
            existing_user = await db.super_admins.find_one({"id": user_id})
            
            if not existing_user:
                raise HTTPException(status_code=404, detail="Super admin non trouvé")
            
            if update_data:
                # Mapper les champs du profil vers les champs super_admin
                sa_update = {}
                if "prenom" in update_data or "nom" in update_data:
                    prenom = update_data.get("prenom", existing_user.get("prenom", ""))
                    nom = update_data.get("nom", existing_user.get("nom", ""))
                    sa_update["nom"] = f"{prenom} {nom}".strip()
                if "email" in update_data:
                    sa_update["email"] = update_data["email"]
                if "telephone" in update_data:
                    sa_update["telephone"] = update_data["telephone"]
                
                if sa_update:
                    await db.super_admins.update_one({"id": user_id}, {"$set": sa_update})
            
            # Retourner un objet User compatible
            updated = await db.super_admins.find_one({"id": user_id})
            nom_parts = updated.get("nom", "Admin").split(" ", 1)
            return User(
                id=updated["id"],
                tenant_id=tenant.id if hasattr(tenant, 'id') else tenant.get('id'),
                email=updated["email"],
                prenom=nom_parts[0] if nom_parts else "Admin",
                nom=nom_parts[1] if len(nom_parts) > 1 else "",
                role="admin",
                grade="Super Admin",
                type_emploi="temps_plein",
                statut="Actif",
                telephone=updated.get("telephone", "")
            )
        else:
            # Utilisateur normal - chercher dans users
            existing_user = await db.users.find_one({"id": user_id})
            
            if not existing_user:
                raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
            
            if update_data:
                await db.users.update_one({"id": user_id}, {"$set": update_data})
            
            updated_user = await db.users.find_one({"id": user_id})
            return User(**clean_mongo_doc(updated_user))
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erreur mise à jour profil: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erreur mise à jour profil: {str(e)}")


# POST users/photo-profil
@router.post("/{tenant_slug}/users/photo-profil")
async def upload_photo_profil(
    tenant_slug: str,
    photo_data: PhotoProfilUpload,
    current_user: User = Depends(get_current_user)
):
    """
    Upload une photo de profil pour l'utilisateur connecté
    Redimensionne automatiquement à 200x200 pixels → Azure Blob Storage
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        from services.azure_storage import put_object, generate_sas_url, generate_storage_path
        
        image_bytes = resize_and_compress_image_bytes(photo_data.photo_base64)
        blob_path = generate_storage_path(tenant.id, "profils", f"user_{current_user.id}.jpg")
        put_object(blob_path, image_bytes, "image/jpeg")
        sas_url = generate_sas_url(blob_path)
        
        result = await db.users.update_one(
            {"id": current_user.id, "tenant_id": tenant.id},
            {"$set": {"photo_profil_blob_name": blob_path, "photo_profil": None}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        return {"message": "Photo de profil mise à jour", "photo_profil": sas_url}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")


# PUT users/{user_id} - Modifier un utilisateur (par un admin)
@router.put("/{tenant_slug}/users/{user_id}")
async def update_user(
    tenant_slug: str,
    user_id: str,
    user_data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    Permet à un admin de modifier les informations d'un utilisateur
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions
    await require_permission(tenant.id, current_user, "personnel", "modifier")
    
    # Vérifier que l'utilisateur existe
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Construire les données de mise à jour
    update_data = {}
    
    # Champs texte simples
    text_fields = [
        "nom", "prenom", "email", "telephone", "adresse", "grade",
        "type_emploi", "numero_employe", "date_embauche", "date_fin_embauche",
        "motif_fin_emploi", "equipe_garde", "contact_urgence",
        # Documents sensibles
        "nas", "numero_passeport", "code_permanent",
        # Permis de conduire
        "permis_numero", "permis_classe", "permis_expiration",
        # Note
        "note"
    ]
    for field in text_fields:
        if field in user_data and user_data[field] is not None:
            update_data[field] = user_data[field]
    
    # Champs numériques
    if "taux_horaire" in user_data:
        update_data["taux_horaire"] = float(user_data["taux_horaire"]) if user_data["taux_horaire"] else 0
    if "heures_max_semaine" in user_data:
        update_data["heures_max_semaine"] = int(user_data["heures_max_semaine"]) if user_data["heures_max_semaine"] else 40
    if "echelon_embauche" in user_data:
        update_data["echelon_embauche"] = int(user_data["echelon_embauche"]) if user_data["echelon_embauche"] else 1
    
    # Champs booléens
    bool_fields = ["fonction_superieur", "est_preventionniste", "accepte_gardes_externes"]
    for field in bool_fields:
        if field in user_data:
            update_data[field] = bool(user_data[field])
    
    # Champs complexes
    if "formations" in user_data:
        update_data["formations"] = user_data["formations"] if isinstance(user_data["formations"], list) else []
    if "tailles_epi" in user_data:
        update_data["tailles_epi"] = user_data["tailles_epi"] if isinstance(user_data["tailles_epi"], dict) else {}
    
    # Mot de passe (si fourni et différent de 'unchanged')
    if user_data.get("mot_de_passe") and user_data["mot_de_passe"] != "unchanged":
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        update_data["mot_de_passe_hash"] = pwd_context.hash(user_data["mot_de_passe"])
    
    # Mettre à jour
    if update_data:
        await db.users.update_one(
            {"id": user_id, "tenant_id": tenant.id},
            {"$set": update_data}
        )
    
    # Retourner l'utilisateur mis à jour
    updated_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    return clean_mongo_doc(updated_user)


# POST users/{user_id}/photo-profil
@router.post("/{tenant_slug}/users/{user_id}/photo-profil")
async def upload_photo_profil_admin(
    tenant_slug: str,
    user_id: str,
    photo_data: PhotoProfilUpload,
    current_user: User = Depends(get_current_user)
):
    """
    Upload une photo de profil pour un utilisateur (Admin uniquement)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module personnel
    await require_permission(tenant.id, current_user, "personnel", "modifier")
    
    try:
        # Vérifier que l'utilisateur existe
        user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        from services.azure_storage import put_object, generate_sas_url, generate_storage_path
        
        image_bytes = resize_and_compress_image_bytes(photo_data.photo_base64)
        blob_path = generate_storage_path(tenant.id, "profils", f"user_{user_id}.jpg")
        put_object(blob_path, image_bytes, "image/jpeg")
        sas_url = generate_sas_url(blob_path)
        
        await db.users.update_one(
            {"id": user_id, "tenant_id": tenant.id},
            {"$set": {"photo_profil_blob_name": blob_path, "photo_profil": None}}
        )
        
        return {"message": "Photo de profil mise à jour", "photo_profil": sas_url}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")


# DELETE users/photo-profil
@router.delete("/{tenant_slug}/users/photo-profil")
async def delete_photo_profil(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime la photo de profil de l'utilisateur connecté
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    user = await db.users.find_one({"id": current_user.id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    blob_name = user.get("photo_profil_blob_name")
    if blob_name:
        from services.azure_storage import delete_object
        delete_object(blob_name)
    
    await db.users.update_one(
        {"id": current_user.id, "tenant_id": tenant.id},
        {"$set": {"photo_profil": None}, "$unset": {"photo_profil_blob_name": ""}}
    )
    
    return {"message": "Photo de profil supprimée"}


# DELETE users/{user_id}/photo-profil
@router.delete("/{tenant_slug}/users/{user_id}/photo-profil")
async def delete_photo_profil_admin(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Supprime la photo de profil d'un utilisateur (Admin uniquement)
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    await require_permission(tenant.id, current_user, "personnel", "modifier")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    blob_name = user.get("photo_profil_blob_name")
    if blob_name:
        from services.azure_storage import delete_object
        delete_object(blob_name)
    
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"photo_profil": None}, "$unset": {"photo_profil_blob_name": ""}}
    )
    
    return {"message": "Photo de profil supprimée"}

# Route legacy commentée - migrée vers routes/personnel.py


# GET users/{user_id}/statistiques-interventions
@router.get("/{tenant_slug}/users/{user_id}/statistiques-interventions")
async def get_user_intervention_stats(
    tenant_slug: str,
    user_id: str,
    annee: int = None,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère les statistiques d'interventions d'un employé :
    - Nombre total d'interventions
    - Taux de présence
    - Primes de repas
    - Détail par mois
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier que l'utilisateur existe
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Année par défaut = année courante
    if not annee:
        annee = datetime.now().year
    
    # Définir la période
    date_debut = datetime(annee, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    date_fin = datetime(annee, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    
    # Récupérer toutes les interventions de l'année
    interventions = await db.interventions.find({
        "tenant_id": tenant.id,
        "status": "signed",
        "xml_time_call_received": {"$gte": date_debut.isoformat(), "$lte": date_fin.isoformat()}
    }, {"_id": 0}).to_list(10000)
    
    # Statistiques
    total_interventions = 0
    total_present = 0
    total_absent = 0
    total_dejeuner = 0
    total_diner = 0
    total_souper = 0
    duree_totale_heures = 0
    
    # Par mois
    stats_par_mois = {i: {"interventions": 0, "present": 0, "absent": 0} for i in range(1, 13)}
    
    for intervention in interventions:
        personnel = intervention.get("personnel_present", [])
        
        # Chercher l'employé dans le personnel
        for p in personnel:
            p_id = p.get("id") or p.get("user_id")
            if p_id == user_id:
                total_interventions += 1
                
                # Déterminer le mois
                date_str = intervention.get("xml_time_call_received")
                if date_str:
                    try:
                        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        mois = dt.month
                        stats_par_mois[mois]["interventions"] += 1
                    except:
                        mois = None
                
                # Statut de présence
                statut = p.get("statut_presence", "present")
                if statut in ["present", "rappele"]:
                    total_present += 1
                    if mois:
                        stats_par_mois[mois]["present"] += 1
                elif statut in ["absent", "absent_non_paye", "non_disponible"]:
                    total_absent += 1
                    if mois:
                        stats_par_mois[mois]["absent"] += 1
                else:
                    # remplace, absent_paye comptent comme présent pour le calcul
                    total_present += 1
                    if mois:
                        stats_par_mois[mois]["present"] += 1
                
                # Primes de repas
                if p.get("prime_dejeuner"):
                    total_dejeuner += 1
                if p.get("prime_diner"):
                    total_diner += 1
                if p.get("prime_souper"):
                    total_souper += 1
                
                # Durée
                time_start = intervention.get("xml_time_call_received")
                time_end = intervention.get("xml_time_call_closed") or intervention.get("xml_time_terminated")
                if time_start and time_end:
                    try:
                        start_dt = datetime.fromisoformat(time_start.replace('Z', '+00:00'))
                        end_dt = datetime.fromisoformat(time_end.replace('Z', '+00:00'))
                        duree = (end_dt - start_dt).total_seconds() / 3600
                        duree_totale_heures += duree
                    except:
                        pass
                
                break  # Employé trouvé, passer à l'intervention suivante
    
    # Calculer le taux de présence
    taux_presence = 0
    if total_interventions > 0:
        taux_presence = round((total_present / total_interventions) * 100, 1)
    
    # Charger les tarifs pour calculer les montants
    settings = await db.intervention_settings.find_one({"tenant_id": tenant.id})
    montant_dejeuner = settings.get("repas_dejeuner", {}).get("montant", 15) if settings else 15
    montant_diner = settings.get("repas_diner", {}).get("montant", 18) if settings else 18
    montant_souper = settings.get("repas_souper", {}).get("montant", 20) if settings else 20
    
    total_primes = (total_dejeuner * montant_dejeuner) + (total_diner * montant_diner) + (total_souper * montant_souper)
    
    return {
        "user_id": user_id,
        "user_name": f"{user.get('prenom', '')} {user.get('nom', '')}",
        "annee": annee,
        "statistiques": {
            "total_interventions": total_interventions,
            "total_present": total_present,
            "total_absent": total_absent,
            "taux_presence": taux_presence,
            "duree_totale_heures": round(duree_totale_heures, 1),
            "primes_repas": {
                "dejeuner": {"count": total_dejeuner, "montant": total_dejeuner * montant_dejeuner},
                "diner": {"count": total_diner, "montant": total_diner * montant_diner},
                "souper": {"count": total_souper, "montant": total_souper * montant_souper},
                "total": total_primes
            }
        },
        "par_mois": stats_par_mois
    }


# PUT users/{user_id}/password
@router.put("/{tenant_slug}/users/{user_id}/password")
async def change_user_password(
    tenant_slug: str,
    user_id: str,
    password_data: dict,
    current_user: User = Depends(get_current_user)
):
    """Changer le mot de passe d'un utilisateur (propre mot de passe ou admin reset)"""
    try:
        logging.info(f"🔑 Demande de changement de mot de passe pour l'utilisateur {user_id}")
        
        # Vérifier le tenant
        tenant = await get_tenant_from_slug(tenant_slug)
        
        # Récupérer l'utilisateur cible
        user_data = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        if not user_data:
            logging.warning(f"❌ Utilisateur non trouvé pour changement de mot de passe: {user_id}")
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Cas 1: Utilisateur avec permission de modifier qui réinitialise le mot de passe d'un autre utilisateur
        can_modify_others = await user_has_module_action(tenant.id, current_user, "personnel", "modifier")
        is_admin_reset = can_modify_others and current_user.id != user_id
        
        # Cas 2: Utilisateur qui change son propre mot de passe
        is_self_change = current_user.id == user_id
        
        if not is_admin_reset and not is_self_change:
            logging.warning(f"❌ Tentative de changement de mot de passe non autorisée par {current_user.id} pour {user_id}")
            raise HTTPException(status_code=403, detail="Vous ne pouvez changer que votre propre mot de passe")
        
        # Si c'est un changement personnel, vérifier l'ancien mot de passe
        if is_self_change and not is_admin_reset:
            if "current_password" not in password_data:
                raise HTTPException(status_code=400, detail="Le mot de passe actuel est requis")
            
            if not verify_password(password_data["current_password"], user_data["mot_de_passe_hash"]):
                logging.warning(f"❌ Ancien mot de passe incorrect pour {user_id}")
                raise HTTPException(status_code=401, detail="Mot de passe actuel incorrect")
            
            logging.info(f"✅ Ancien mot de passe vérifié pour {user_id}")
            new_password = password_data["new_password"]
        else:
            # Admin reset - pas besoin de l'ancien mot de passe
            logging.info(f"👑 Reset administrateur du mot de passe pour {user_id} par {current_user.id}")
            new_password = password_data.get("mot_de_passe") or password_data.get("new_password")
            if not new_password:
                raise HTTPException(status_code=400, detail="Le nouveau mot de passe est requis")
        
        # Valider le nouveau mot de passe (8 caractères min, 1 majuscule, 1 chiffre, 1 spécial)
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
        
        # Si c'est un admin reset, envoyer un email au utilisateur
        email_sent = False
        if is_admin_reset:
            user_name = f"{user_data.get('prenom', '')} {user_data.get('nom', '')}".strip()
            user_email = user_data.get('email')
            
            if user_email:
                logging.info(f"📧 Envoi de l'email de réinitialisation à {user_email}")
                email_sent = send_temporary_password_email(
                    user_email=user_email,
                    user_name=user_name,
                    temp_password=new_password,
                    tenant_slug=tenant_slug
                )
                
                if email_sent:
                    logging.info(f"✅ Email de réinitialisation envoyé avec succès à {user_email}")
                    return {
                        "message": "Mot de passe modifié avec succès",
                        "email_sent": True,
                        "email_address": user_email
                    }
                else:
                    logging.warning(f"⚠️ Échec de l'envoi de l'email à {user_email}")
                    return {
                        "message": "Mot de passe modifié avec succès, mais l'email n'a pas pu être envoyé",
                        "email_sent": False,
                        "error": "L'envoi de l'email a échoué. Veuillez informer l'utilisateur manuellement."
                    }
            else:
                logging.warning(f"⚠️ Aucun email trouvé pour l'utilisateur {user_id}")
                return {
                    "message": "Mot de passe modifié avec succès, mais aucun email configuré pour cet utilisateur",
                    "email_sent": False,
                    "error": "Aucune adresse email trouvée"
                }
        
        return {"message": "Mot de passe modifié avec succès"}
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"❌ Erreur inattendue lors du changement de mot de passe pour {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


# PUT users/{user_id}/access
@router.put("/{tenant_slug}/users/{user_id}/access", response_model=User)
async def update_user_access(
    tenant_slug: str, 
    user_id: str, 
    role: Optional[str] = None,  # Accepter "role" pour rétrocompatibilité
    access_type: Optional[str] = None,  # Nouveau paramètre
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de modification sur le module personnel
    await require_permission(tenant.id, current_user, "personnel", "modifier")
    
    # Le nouveau paramètre est access_type, mais on accepte aussi role pour rétrocompatibilité
    type_acces = access_type or role
    
    # Validation des valeurs
    valid_access_types = ["admin", "superviseur", "employe"]
    valid_statuts = ["Actif", "Inactif"]
    
    # Check if user exists in this tenant
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Préparer les champs à mettre à jour
    update_fields = {}
    
    if type_acces:
        if type_acces not in valid_access_types:
            # Vérifier si c'est un type personnalisé
            custom_type = await db.access_types.find_one({
                "id": type_acces,
                "tenant_id": tenant.id
            })
            if not custom_type and type_acces not in valid_access_types:
                raise HTTPException(status_code=400, detail=f"Type d'accès invalide: {type_acces}")
        
        # Mettre à jour access_type (nouveau) et role (ancien) pour compatibilité
        update_fields["access_type"] = type_acces
        update_fields["role"] = type_acces  # Pour rétrocompatibilité
    
    if statut:
        if statut not in valid_statuts:
            raise HTTPException(status_code=400, detail="Statut invalide")
        update_fields["statut"] = statut
        update_fields["actif"] = (statut == "Actif")  # Synchroniser actif avec statut
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Aucune modification fournie")
    
    # Update user access
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id}, 
        {"$set": update_fields}
    )
    
    if result.modified_count == 0:
        # Peut-être que les valeurs sont identiques, ce n'est pas forcément une erreur
        logger.info(f"Aucune modification pour user {user_id} (valeurs identiques?)")
    
    updated_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    updated_user = clean_mongo_doc(updated_user)
    
    logger.info(f"Type d'accès de {updated_user.get('email')} modifié vers {type_acces} par {current_user.email}")
    
    return User(**updated_user)


# POST users/{user_id}/signature - Upload signature numérique
@router.post("/{tenant_slug}/users/{user_id}/signature")
async def upload_signature(
    tenant_slug: str,
    user_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload une signature numérique (JPEG ou PNG) pour un utilisateur.
    Utilisée dans les avis de non-conformité et autres documents officiels.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions via RBAC (soi-même ou permission de modifier)
    can_modify_others = await user_has_module_action(tenant.id, current_user, "personnel", "modifier")
    if current_user.id != user_id and not can_modify_others:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier que l'utilisateur existe
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Vérifier le type de fichier
    if not file.content_type in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Seuls les fichiers JPEG et PNG sont acceptés")
    
    # Lire le contenu du fichier
    content = await file.read()
    
    # Vérifier la taille (max 500KB)
    if len(content) > 500 * 1024:
        raise HTTPException(status_code=400, detail="Le fichier ne doit pas dépasser 500KB")
    
    # Upload vers Azure
    from services.azure_storage import put_object, generate_sas_url, generate_storage_path
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "png"
    blob_path = generate_storage_path(tenant.id, "signatures", f"sig_{user_id}.{ext}")
    put_object(blob_path, content, file.content_type or "image/png")
    sas_url = generate_sas_url(blob_path)
    
    # Stocker le blob_name dans MongoDB
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"signature_blob_name": blob_path, "signature_url": None, "updated_at": datetime.now(timezone.utc)}}
    )
    
    logger.info(f"Signature uploadée vers Azure pour {user_id} par {current_user.email}")
    
    return {"message": "Signature enregistrée avec succès", "signature_url": sas_url}


# DELETE users/{user_id}/signature - Supprimer signature
@router.delete("/{tenant_slug}/users/{user_id}/signature")
async def delete_signature(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprimer la signature numérique d'un utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    can_modify_others = await user_has_module_action(tenant.id, current_user, "personnel", "modifier")
    if current_user.id != user_id and not can_modify_others:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if user and user.get("signature_blob_name"):
        from services.azure_storage import delete_object
        delete_object(user["signature_blob_name"])
    
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"signature_url": None, "updated_at": datetime.now(timezone.utc)}, "$unset": {"signature_blob_name": ""}}
    )
    
    return {"message": "Signature supprimée"}


# DELETE users/{user_id}/revoke
@router.delete("/{tenant_slug}/users/{user_id}/revoke")
async def revoke_user_completely(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # RBAC: Vérifier permission de suppression sur le module personnel
    await require_permission(tenant.id, current_user, "personnel", "supprimer")
    
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


# GET users/{user_id}/stats-mensuelles
@router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")
async def get_user_monthly_stats(tenant_slug: str, user_id: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier les permissions via RBAC (soi-même ou permission de voir)
    can_view_others = await user_has_module_action(tenant.id, current_user, "personnel", "voir")
    if not can_view_others and current_user.id != user_id:
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
