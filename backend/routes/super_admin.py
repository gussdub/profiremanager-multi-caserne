"""
Routes API pour le module Super Admin - Gestion des Tenants
===========================================================

STATUT: ACTIF
Ce module gère l'authentification super-admin et la gestion des tenants/casernes.

Routes:
- POST   /admin/auth/login - Connexion super admin
- GET    /admin/auth/me - Infos super admin connecté
- GET    /admin/tenants - Liste des casernes
- POST   /admin/tenants - Créer une caserne
- PUT    /admin/tenants/{tenant_id} - Modifier une caserne
- DELETE /admin/tenants/{tenant_id} - Supprimer une caserne
- GET    /admin/tenants/by-slug/{tenant_slug} - Récupérer tenant par slug
- GET    /admin/tenants/{tenant_id}/deletion-impact - Impact suppression
- POST   /admin/tenants/{tenant_id}/create-admin - Créer admin caserne
- GET    /admin/stats - Statistiques globales
- GET    /admin/super-admins - Liste des super admins
- POST   /admin/super-admins - Créer super admin
- PUT    /admin/super-admins/{super_admin_id} - Modifier super admin
- DELETE /admin/super-admins/{super_admin_id} - Supprimer super admin
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
from typing import Optional
import uuid
import logging
import jwt

from routes.dependencies import (
    db,
    get_super_admin,
    log_super_admin_action,
    SuperAdmin,
    SuperAdminLogin,
    clean_mongo_doc,
    verify_password,
    get_password_hash,
    create_access_token,
    SECRET_KEY,
    ALGORITHM,
    SUPER_ADMIN_TOKEN_EXPIRE_MINUTES,
    Tenant,
    TenantCreate,
    User,
    validate_complex_password,
    send_welcome_email,
    send_super_admin_welcome_email
)

router = APIRouter(tags=["Super Admin - Tenants"])
logger = logging.getLogger(__name__)
security = HTTPBearer()


# ==================== AUTHENTIFICATION SUPER ADMIN ====================

@router.post("/admin/auth/login")
async def super_admin_login(login: SuperAdminLogin):
    """Authentification du super admin avec migration automatique SHA256 -> bcrypt"""
    try:
        logger.info(f"🔑 Tentative de connexion Super Admin: {login.email}")
        
        admin_data = await db.super_admins.find_one({"email": login.email})
        
        if not admin_data:
            logger.warning(f"❌ Super Admin non trouvé: {login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logger.info(f"✅ Super Admin trouvé: {admin_data.get('nom')} (id: {admin_data.get('id')})")
        
        current_hash = admin_data.get("mot_de_passe_hash", "")
        hash_type = "bcrypt" if current_hash.startswith('$2') else "SHA256"
        logger.info(f"🔐 Type de hash détecté: {hash_type}")
        
        if not verify_password(login.mot_de_passe, current_hash):
            logger.warning(f"❌ Mot de passe incorrect pour Super Admin {login.email}")
            raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
        
        logger.info(f"✅ Mot de passe vérifié avec succès pour Super Admin {login.email}")
        
        admin = SuperAdmin(**admin_data)
        # Token avec expiration de 2h pour les super-admins (sécurité)
        access_token = create_access_token(
            data={"sub": admin.id, "role": "super_admin"},
            expires_delta=timedelta(minutes=SUPER_ADMIN_TOKEN_EXPIRE_MINUTES)
        )
        
        logger.info(f"✅ Token JWT créé pour Super Admin {login.email}")
        
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
        logger.error(f"❌ Erreur inattendue lors du login Super Admin pour {login.email}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Erreur interne du serveur")


@router.get("/admin/auth/me")
async def get_super_admin_me(admin: SuperAdmin = Depends(get_super_admin)):
    """Récupère les informations du super admin authentifié"""
    return {
        "id": admin.id,
        "email": admin.email,
        "nom": admin.nom,
        "role": "super_admin"
    }


# ==================== GESTION DES TENANTS ====================

@router.get("/admin/tenants")
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


@router.get("/admin/stats")
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


@router.get("/admin/tenants/by-slug/{tenant_slug}")
async def get_tenant_by_slug(tenant_slug: str):
    """Récupérer un tenant par son slug (pour récupérer les paramètres)"""
    tenant = await db.tenants.find_one({"slug": tenant_slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    return clean_mongo_doc(tenant)


@router.post("/admin/tenants")
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
        tenant_data['date_creation'] = datetime.fromisoformat(tenant_data['date_creation']).replace(tzinfo=timezone.utc)
    else:
        tenant_data['date_creation'] = datetime.now(timezone.utc)
    
    tenant = Tenant(**tenant_data)
    await db.tenants.insert_one(tenant.dict())
    
    # Initialiser les catégories d'équipements par défaut
    categories_creees = await initialiser_categories_equipements_defaut(tenant.id)
    
    # Enregistrer l'action dans le journal d'audit
    await log_super_admin_action(
        admin=admin,
        action="tenant_create",
        details={"tenant_slug": tenant.slug, "tenant_nom": tenant.nom, "categories_equipements_creees": categories_creees},
        tenant_id=tenant.id,
        tenant_slug=tenant.slug,
        tenant_nom=tenant.nom
    )
    
    return {"message": f"Caserne '{tenant.nom}' créée avec succès", "tenant": tenant, "categories_creees": categories_creees}


@router.put("/admin/tenants/{tenant_id}")
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
        update_data['date_creation'] = datetime.fromisoformat(update_data['date_creation']).replace(tzinfo=timezone.utc)
    
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


@router.post("/admin/tenants/{tenant_id}/create-admin")
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
        logger.warning(f"⚠️ Erreur envoi email de bienvenue: {e}")
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


@router.get("/admin/tenants/{tenant_id}/deletion-impact")
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


@router.delete("/admin/tenants/{tenant_id}")
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


# ==================== GESTION DES SUPER ADMINS ====================

@router.get("/admin/super-admins")
async def list_super_admins(admin: SuperAdmin = Depends(get_super_admin)):
    """Liste tous les super admins"""
    super_admins = await db.super_admins.find().to_list(1000)
    return [clean_mongo_doc(sa) for sa in super_admins]


@router.post("/admin/super-admins")
async def create_super_admin_route(
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
    
    logger.info(f"✅ Super admin créé: {new_super_admin.email}")
    
    # Envoyer l'email de bienvenue
    user_name = new_super_admin.nom
    email_sent = send_super_admin_welcome_email(
        new_super_admin.email,
        user_name,
        temp_password
    )
    
    if email_sent:
        logger.info(f"✅ Email de bienvenue super admin envoyé à {new_super_admin.email}")
    else:
        logger.warning(f"⚠️ Email non envoyé à {new_super_admin.email} (Resend non configuré ou erreur)")
    
    return {"message": "Super admin créé avec succès", "id": new_super_admin.id, "email_sent": email_sent}


@router.delete("/admin/super-admins/{super_admin_id}")
async def delete_super_admin_route(
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
    
    logger.info(f"✅ Super admin supprimé: {super_admin_id}")
    
    return {"message": "Super admin supprimé avec succès"}


@router.put("/admin/super-admins/{super_admin_id}")
async def update_super_admin_route(
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
    
    logger.info(f"✅ Super admin modifié: {super_admin_id}")
    
    return {"message": "Super admin modifié avec succès"}
