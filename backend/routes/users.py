"""
Routes API pour le module Users
===============================

Gestion des utilisateurs : création, modification, photos de profil, statistiques.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
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
    User
)

router = APIRouter(tags=["Users"])
logger = logging.getLogger(__name__)


# ==================== ROUTES MIGRÉES DE SERVER.PY ====================

# POST users
@router.post("/{tenant_slug}/users", response_model=User)
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
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
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
    current_user: User = Depends(get_current_user)
):
    """
    Permet à un utilisateur de modifier son propre profil
    """
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # L'utilisateur peut modifier son propre profil
        # Utiliser exclude_unset=True pour ne mettre à jour que les champs modifiés
        update_data = profile_data.dict(exclude_unset=True)
        
        if not update_data:
            # Aucune modification
            updated_user = await db.users.find_one({"id": current_user.id, "tenant_id": tenant.id})
            updated_user = clean_mongo_doc(updated_user)
            return User(**updated_user)
        
        result = await db.users.update_one(
            {"id": current_user.id, "tenant_id": tenant.id}, 
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Profil non trouvé")
        
        # Récupérer le profil mis à jour
        updated_user = await db.users.find_one({"id": current_user.id, "tenant_id": tenant.id})
        updated_user = clean_mongo_doc(updated_user)
        return User(**updated_user)
        
    except Exception as e:
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
    Redimensionne automatiquement à 200x200 pixels
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Traiter et redimensionner l'image
        processed_photo = resize_and_compress_image(photo_data.photo_base64)
        
        # Mettre à jour l'utilisateur
        result = await db.users.update_one(
            {"id": current_user.id, "tenant_id": tenant.id},
            {"$set": {"photo_profil": processed_photo}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        return {"message": "Photo de profil mise à jour", "photo_profil": processed_photo}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload photo: {str(e)}")


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
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    try:
        # Vérifier que l'utilisateur existe
        user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
        if not user:
            raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
        # Traiter et redimensionner l'image
        processed_photo = resize_and_compress_image(photo_data.photo_base64)
        
        # Mettre à jour l'utilisateur
        await db.users.update_one(
            {"id": user_id, "tenant_id": tenant.id},
            {"$set": {"photo_profil": processed_photo}}
        )
        
        return {"message": "Photo de profil mise à jour", "photo_profil": processed_photo}
        
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
    
    result = await db.users.update_one(
        {"id": current_user.id, "tenant_id": tenant.id},
        {"$set": {"photo_profil": None}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
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
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé - Admin requis")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {"photo_profil": None}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
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
        
        # Cas 1: Admin qui réinitialise le mot de passe d'un autre utilisateur
        is_admin_reset = current_user.role == "admin" and current_user.id != user_id
        
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
async def update_user_access(tenant_slug: str, user_id: str, role: str, statut: str, current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Validation des valeurs
    valid_roles = ["admin", "superviseur", "employe"]
    valid_statuts = ["Actif", "Inactif"]
    
    if role not in valid_roles:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if statut not in valid_statuts:
        raise HTTPException(status_code=400, detail="Statut invalide")
    
    # Check if user exists in this tenant
    existing_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not existing_user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Update user access
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id}, 
        {"$set": {"role": role, "statut": statut}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Impossible de mettre à jour l'accès")
    
    updated_user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    updated_user = clean_mongo_doc(updated_user)
    return User(**updated_user)


# DELETE users/{user_id}/revoke
@router.delete("/{tenant_slug}/users/{user_id}/revoke")
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


# GET users/{user_id}/stats-mensuelles
@router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")
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

