"""
Routes API pour le module Personnel (Users)
============================================

STATUT: ACTIF
Ce module gère la création, modification et suppression des utilisateurs.

Routes:
- GET    /{tenant_slug}/users                     - Liste des utilisateurs
- GET    /{tenant_slug}/users/{user_id}           - Détail utilisateur
- POST   /{tenant_slug}/users                     - Créer un utilisateur
- PUT    /{tenant_slug}/users/{user_id}           - Modifier utilisateur
- DELETE /{tenant_slug}/users/{user_id}           - Supprimer utilisateur
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import os
import re
import bcrypt
import base64
import asyncio
from io import BytesIO

# Import des dépendances partagées
from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    clean_mongo_doc,
    creer_activite,
    User
)

# Import WebSocket pour synchronisation temps réel
from routes.websocket import broadcast_user_update

router = APIRouter(tags=["Personnel"])


# ==================== MODÈLES ====================

class UserCreate(BaseModel):
    """Modèle pour la création d'un utilisateur"""
    email: str
    mot_de_passe: str
    nom: str
    prenom: str
    role: str = "employe"
    grade: Optional[str] = None
    type_emploi: Optional[str] = "temps_partiel"
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    date_embauche: Optional[str] = None
    date_fin_embauche: Optional[str] = None
    motif_fin_emploi: Optional[str] = None
    date_naissance: Optional[str] = None
    numero_employe: Optional[str] = None
    formations: Optional[List[str]] = []
    competences: Optional[List[str]] = []
    statut: str = "Actif"


class UserUpdate(BaseModel):
    """Modèle pour la mise à jour d'un utilisateur"""
    email: Optional[str] = None
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: Optional[str] = None
    grade: Optional[str] = None
    type_emploi: Optional[str] = None
    telephone: Optional[str] = None
    adresse: Optional[str] = None
    date_embauche: Optional[str] = None
    date_fin_embauche: Optional[str] = None
    motif_fin_emploi: Optional[str] = None
    date_naissance: Optional[str] = None
    numero_employe: Optional[str] = None
    formations: Optional[List[str]] = None
    competences: Optional[List[str]] = None
    statut: Optional[str] = None
    tailles_epi: Optional[Dict[str, str]] = None
    mot_de_passe: Optional[str] = None  # Pour changement de mot de passe
    
    class Config:
        extra = "allow"


# ==================== FONCTIONS UTILITAIRES ====================

def validate_complex_password(password: str) -> bool:
    """Valide qu'un mot de passe respecte les exigences de sécurité"""
    if len(password) < 8:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    if not re.search(r'[!@#$%^&*+\-?()]', password):
        return False
    return True


# Utiliser get_password_hash de dependencies.py
from routes.dependencies import get_password_hash


# ==================== ROUTES ====================

@router.get("/{tenant_slug}/users", response_model=List[User])
async def get_users(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """Liste tous les utilisateurs du tenant"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès au tenant
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    users = await db.users.find({"tenant_id": tenant.id}).to_list(1000)
    cleaned_users = [clean_mongo_doc(user) for user in users]
    return [User(**user) for user in cleaned_users]


@router.get("/{tenant_slug}/users/{user_id}", response_model=User)
async def get_user(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Récupère un utilisateur par son ID"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.role not in ["admin", "superviseur"] and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return User(**clean_mongo_doc(user))


@router.post("/{tenant_slug}/users", response_model=User)
async def create_user(
    tenant_slug: str,
    user_create: UserCreate,
    current_user: User = Depends(get_current_user)
):
    """Créer un nouvel utilisateur"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès au tenant
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    # Vérifier la limite du palier
    current_count = await db.users.count_documents({"tenant_id": tenant.id})
    
    if current_count < 30:
        palier, limite = "Basic (1-30)", 30
    elif current_count < 50:
        palier, limite = "Standard (31-50)", 50
    else:
        palier, limite = "Premium (51+)", None
    
    if limite and current_count >= limite:
        raise HTTPException(
            status_code=403,
            detail=f"Limite du palier {palier} atteinte ({current_count}/{limite}). Contactez l'administrateur pour upgrader."
        )
    
    # Validation mot de passe
    if not validate_complex_password(user_create.mot_de_passe):
        raise HTTPException(
            status_code=400,
            detail="Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial"
        )
    
    # Vérifier email unique dans ce tenant
    existing_user = await db.users.find_one({
        "email": user_create.email,
        "tenant_id": tenant.id
    })
    if existing_user:
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé dans cette caserne")
    
    # Créer l'utilisateur
    user_dict = user_create.dict()
    user_dict["id"] = str(uuid.uuid4())
    user_dict["mot_de_passe_hash"] = get_password_hash(user_dict.pop("mot_de_passe"))
    user_dict["tenant_id"] = tenant.id
    user_dict["created_at"] = datetime.now(timezone.utc)
    
    # Synchroniser formations vers competences
    if "formations" in user_dict and user_dict["formations"]:
        user_dict["competences"] = user_dict["formations"]
    
    await db.users.insert_one(user_dict)
    
    # Créer activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_creation",
        description=f"👤 {current_user.prenom} {current_user.nom} a ajouté {user_create.prenom} {user_create.nom} ({user_create.grade or 'N/A'}) au personnel",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_user_update(tenant_slug, "create", {
        "user_id": user_dict["id"],
        "nom": f"{user_create.prenom} {user_create.nom}"
    }))
    
    logging.info(f"✅ Utilisateur créé: {user_create.email} dans tenant {tenant_slug}")
    
    return User(**user_dict)


@router.put("/{tenant_slug}/users/{user_id}", response_model=User)
async def update_user(
    tenant_slug: str,
    user_id: str,
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """Met à jour un utilisateur"""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    # Préparer les données de mise à jour (seulement les champs fournis)
    update_data = {k: v for k, v in user_update.dict(exclude_unset=True).items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # SYNCHRONISATION BIDIRECTIONNELLE formations/competences
    if "formations" in update_data:
        update_data["competences"] = update_data["formations"]
        logging.info(f"🔄 [SYNC] Copie formations → competences: {update_data['formations']}")
    elif "competences" in update_data:
        update_data["formations"] = update_data["competences"]
        logging.info(f"🔄 [SYNC] Copie competences → formations: {update_data['competences']}")
    
    # Gestion du mot de passe si fourni
    if "mot_de_passe" in update_data and update_data["mot_de_passe"]:
        update_data["mot_de_passe_hash"] = get_password_hash(update_data.pop("mot_de_passe"))
    elif "mot_de_passe" in update_data:
        update_data.pop("mot_de_passe")
    
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    result = await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Récupérer l'utilisateur mis à jour
    user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    user_cleaned = clean_mongo_doc(user)
    
    # Créer une activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_modification",
        description=f"✏️ {current_user.prenom} {current_user.nom} a modifié le profil de {user_cleaned.get('prenom')} {user_cleaned.get('nom')}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_user_update(tenant_slug, "update", {
        "user_id": user_id,
        "nom": f"{user_cleaned.get('prenom')} {user_cleaned.get('nom')}"
    }))
    
    return User(**user_cleaned)


@router.delete("/{tenant_slug}/users/{user_id}")
async def delete_user(
    tenant_slug: str,
    user_id: str,
    current_user: User = Depends(get_current_user)
):
    """Supprime un utilisateur et ses données associées"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès refusé")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Vérifier l'accès
    if current_user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Accès interdit à cette caserne")
    
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    
    # Récupérer l'utilisateur avant suppression pour le log
    user_to_delete = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Supprimer l'utilisateur
    result = await db.users.delete_one({"id": user_id, "tenant_id": tenant.id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Supprimer les données associées
    await db.disponibilites.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.assignations.delete_many({"user_id": user_id, "tenant_id": tenant.id})
    await db.demandes_remplacement.delete_many({"demandeur_id": user_id, "tenant_id": tenant.id})
    
    # Créer activité
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="personnel_suppression",
        description=f"🗑️ {current_user.prenom} {current_user.nom} a supprimé {user_to_delete.get('prenom')} {user_to_delete.get('nom')} du personnel",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Broadcast WebSocket pour mise à jour temps réel
    asyncio.create_task(broadcast_user_update(tenant_slug, "delete", {"user_id": user_id}))
    
    logging.info(f"✅ Utilisateur supprimé: {user_id} dans tenant {tenant_slug}")
    
    return {"message": "Utilisateur supprimé avec succès"}



class EndEmploymentRequest(BaseModel):
    """Modèle pour la fin d'emploi"""
    date_fin_embauche: str
    motif_fin_emploi: Optional[str] = None


@router.post("/{tenant_slug}/personnel/{user_id}/end-employment")
async def end_employment(
    tenant_slug: str,
    user_id: str,
    data: EndEmploymentRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Met fin à l'emploi d'un utilisateur.
    - Archive l'employé (conserve la fiche pour historique)
    - Supprime toutes les données actives (planning, remplacements, dispo, EPI, formations)
    - Bloque la connexion
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier que l'utilisateur existe
    user_to_end = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user_to_end:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Ne pas permettre de mettre fin à un admin
    if user_to_end.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Impossible de mettre fin à l'emploi d'un administrateur")
    
    user_name = f"{user_to_end.get('prenom')} {user_to_end.get('nom')}"
    
    # 1. Mettre à jour la fiche employé avec la date et motif de fin
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {
            "date_fin_embauche": data.date_fin_embauche,
            "motif_fin_emploi": data.motif_fin_emploi,
            "actif": False,
            "statut": "Ancien"
        }}
    )
    
    # 2. Supprimer les assignations de planning (gardes)
    deleted_assignations = await db.assignations.delete_many({
        "tenant_id": tenant.id,
        "user_id": user_id
    })
    
    # 3. Supprimer les demandes de remplacement
    deleted_remplacements = await db.remplacements.delete_many({
        "tenant_id": tenant.id,
        "$or": [
            {"demandeur_id": user_id},
            {"remplacant_id": user_id}
        ]
    })
    
    # 4. Supprimer les disponibilités
    deleted_disponibilites = await db.disponibilites.delete_many({
        "tenant_id": tenant.id,
        "user_id": user_id
    })
    
    # 5. Retourner les EPI assignés (marquer comme retournés)
    await db.epi_assignations.update_many(
        {"tenant_id": tenant.id, "user_id": user_id, "date_retour": None},
        {"$set": {
            "date_retour": data.date_fin_embauche,
            "note_retour": f"Retour automatique - Fin d'emploi ({data.motif_fin_emploi or 'Non spécifié'})"
        }}
    )
    
    # 6. Supprimer les inscriptions aux formations futures
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    deleted_formations = await db.formation_inscriptions.delete_many({
        "tenant_id": tenant.id,
        "user_id": user_id,
        "date_formation": {"$gte": today}
    })
    
    # 7. Créer une activité pour tracer cette action
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="fin_emploi",
        description=f"🚫 {current_user.prenom} {current_user.nom} a mis fin à l'emploi de {user_name} (Motif: {data.motif_fin_emploi or 'Non spécifié'})",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Broadcast WebSocket
    asyncio.create_task(broadcast_user_update(tenant_slug, "end_employment", {"user_id": user_id}))
    
    logging.info(f"✅ Fin d'emploi confirmée pour {user_name} (ID: {user_id})")
    
    return {
        "success": True,
        "message": f"Fin d'emploi confirmée pour {user_name}",
        "deleted": {
            "assignations": deleted_assignations.deleted_count,
            "remplacements": deleted_remplacements.deleted_count,
            "disponibilites": deleted_disponibilites.deleted_count,
            "formations": deleted_formations.deleted_count
        }
    }


class ReactivateEmployeeRequest(BaseModel):
    """Modèle pour la réactivation d'un employé"""
    nouvelle_date_embauche: str


@router.post("/{tenant_slug}/personnel/{user_id}/reactivate")
async def reactivate_employee(
    tenant_slug: str,
    user_id: str,
    data: ReactivateEmployeeRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Réactive un ancien employé.
    - Archive la période d'emploi précédente dans employment_history
    - Remet l'employé en statut Actif avec la nouvelle date d'embauche
    - Efface date_fin_embauche et motif_fin_emploi
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    
    tenant = await get_tenant_from_slug(tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant non trouvé")
    
    # Vérifier que l'utilisateur existe
    user_to_reactivate = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
    if not user_to_reactivate:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # Vérifier que c'est bien un ancien employé
    if not user_to_reactivate.get("date_fin_embauche"):
        raise HTTPException(status_code=400, detail="Cet employé n'est pas un ancien employé")
    
    user_name = f"{user_to_reactivate.get('prenom')} {user_to_reactivate.get('nom')}"
    
    # Préparer l'entrée d'historique pour la période précédente
    history_entry = {
        "date_embauche": user_to_reactivate.get("date_embauche"),
        "date_fin_embauche": user_to_reactivate.get("date_fin_embauche"),
        "motif_fin_emploi": user_to_reactivate.get("motif_fin_emploi"),
        "archived_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Récupérer l'historique existant ou créer un nouveau tableau
    existing_history = user_to_reactivate.get("employment_history", [])
    if not isinstance(existing_history, list):
        existing_history = []
    
    # Ajouter la nouvelle entrée à l'historique
    existing_history.append(history_entry)
    
    # Mettre à jour l'utilisateur
    await db.users.update_one(
        {"id": user_id, "tenant_id": tenant.id},
        {"$set": {
            "date_embauche": data.nouvelle_date_embauche,
            "date_fin_embauche": None,
            "motif_fin_emploi": None,
            "actif": True,
            "statut": "Actif",
            "employment_history": existing_history,
            "updated_at": datetime.now(timezone.utc)
        }}
    )
    
    # Créer une activité pour tracer cette action
    await creer_activite(
        tenant_id=tenant.id,
        type_activite="reactivation_emploi",
        description=f"🔄 {current_user.prenom} {current_user.nom} a réactivé {user_name}",
        user_id=current_user.id,
        user_nom=f"{current_user.prenom} {current_user.nom}"
    )
    
    # Broadcast WebSocket
    asyncio.create_task(broadcast_user_update(tenant_slug, "reactivate", {"user_id": user_id}))
    
    logging.info(f"✅ Réactivation confirmée pour {user_name} (ID: {user_id})")
    
    return {
        "success": True,
        "message": f"{user_name} a été réactivé avec succès",
        "employment_history": existing_history
    }
