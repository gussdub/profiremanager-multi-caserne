"""
Routes API pour le module Débogage (Bugs & Features)
====================================================

Ce module gère le suivi des bugs et demandes de fonctionnalités
avec notifications par email aux super-admins.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import os
import base64
import logging
import resend

from routes.dependencies import (
    db,
    get_super_admin,
    SuperAdmin,
    clean_mongo_doc
)

router = APIRouter(tags=["Débogage - Bugs & Features"])
logger = logging.getLogger(__name__)


# ==================== MODÈLES ====================

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


class CommentaireCreate(BaseModel):
    texte: str


class ChangementStatut(BaseModel):
    nouveau_statut: str


# ==================== FONCTIONS UTILITAIRES ====================

def send_debogage_notification_email(
    super_admins_emails: List[str],
    type_notification: str,
    titre: str,
    description: str,
    priorite: str,
    created_by: str,
    item_id: str
):
    """
    Envoie un email aux super-admins pour les notifier d'un nouveau bug ou feature request
    """
    try:
        resend_api_key = os.environ.get('RESEND_API_KEY')
        
        if not resend_api_key:
            logger.warning("RESEND_API_KEY non configurée - Email NON envoyé")
            return
        
        resend.api_key = resend_api_key
        
        # Déterminer le type et l'emoji
        if type_notification == "bug":
            type_label = "🐛 Nouveau Bug Signalé"
            color = "#dc2626"
        elif type_notification == "feature":
            type_label = "✨ Nouvelle Fonctionnalité Demandée"
            color = "#2563eb"
        else:
            type_label = "📝 Mise à jour"
            color = "#6b7280"
        
        priorite_colors = {
            "critique": "#dc2626",
            "haute": "#f97316",
            "moyenne": "#eab308",
            "basse": "#22c55e"
        }
        priorite_color = priorite_colors.get(priorite, "#6b7280")
        
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
        <div style="background: linear-gradient(135deg, {color} 0%, {color}dd 100%); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">
                {type_label}
            </h1>
        </div>
        <div style="background-color: white; padding: 30px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 20px;">
                <h2 style="margin: 0 0 10px 0; color: #1e293b; font-size: 20px; font-weight: 600;">
                    {titre}
                </h2>
                <div style="display: inline-block; padding: 4px 12px; background-color: {priorite_color}; color: white; border-radius: 12px; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                    Priorité: {priorite}
                </div>
            </div>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid {color};">
                <p style="margin: 0; color: #475569; line-height: 1.6;">
                    {description[:200]}{'...' if len(description) > 200 else ''}
                </p>
            </div>
            <div style="margin-bottom: 25px; padding: 15px; background-color: #eff6ff; border-radius: 8px;">
                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
                    <strong>Créé par:</strong> {created_by}
                </p>
                <p style="margin: 0; color: #64748b; font-size: 14px;">
                    <strong>ID:</strong> {item_id[:8]}...
                </p>
            </div>
            <div style="text-align: center; margin-top: 30px;">
                <a href="{admin_url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, {color} 0%, {color}dd 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    Voir dans l'Interface Admin
                </a>
            </div>
        </div>
        <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">ProFireManager - Système de Gestion de Sécurité Incendie</p>
            <p style="margin: 5px 0 0 0;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
    </div>
</body>
</html>
"""
        
        for admin_email in super_admins_emails:
            try:
                params = {
                    "from": "ProFireManager <noreply@profiremanager.ca>",
                    "to": [admin_email],
                    "subject": f"{type_label}: {titre}",
                    "html": html_content
                }
                response = resend.Emails.send(params)
                logger.info(f"Email de notification envoyé à {admin_email} via Resend (ID: {response.get('id', 'N/A')})")
            except Exception as e:
                logger.error(f"Erreur lors de l'envoi de l'email à {admin_email}: {e}")
                
    except Exception as e:
        logger.error(f"Erreur générale lors de l'envoi des emails de débogage: {e}")


# ==================== ROUTES BUGS ====================

@router.get("/admin/bugs")
async def list_bugs(
    statut: Optional[str] = None,
    priorite: Optional[str] = None,
    module: Optional[str] = None,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Liste tous les bugs avec filtres optionnels"""
    query = {}
    if statut:
        query["statut"] = statut
    if priorite:
        query["priorite"] = priorite
    if module:
        query["module"] = module
    
    bugs = await db.bugs.find(query).sort("created_at", -1).to_list(1000)
    return [clean_mongo_doc(bug) for bug in bugs]


@router.post("/admin/bugs")
async def create_bug(
    bug_data: BugReportCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer un nouveau bug report"""
    bug_dict = bug_data.dict()
    bug_dict["id"] = str(uuid.uuid4())
    bug_dict["statut"] = "nouveau"
    bug_dict["commentaires"] = []
    bug_dict["historique_statuts"] = []
    bug_dict["created_by"] = admin.id
    bug_dict["created_by_name"] = admin.nom
    bug_dict["created_at"] = datetime.now(timezone.utc)
    bug_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.bugs.insert_one(bug_dict)
    
    # Envoyer email aux super-admins (sauf le créateur)
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="bug",
                titre=bug_data.titre,
                description=bug_data.description,
                priorite=bug_data.priorite,
                created_by=bug_dict["created_by_name"],
                item_id=bug_dict["id"]
            )
    except Exception as e:
        logger.error(f"Erreur envoi email notification bug: {e}")
    
    return clean_mongo_doc(bug_dict)


@router.get("/admin/bugs/{bug_id}")
async def get_bug(
    bug_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer un bug spécifique"""
    bug = await db.bugs.find_one({"id": bug_id})
    if not bug:
        raise HTTPException(status_code=404, detail="Bug non trouvé")
    return clean_mongo_doc(bug)


@router.put("/admin/bugs/{bug_id}/statut")
async def update_bug_statut(
    bug_id: str,
    statut_data: ChangementStatut,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Changer le statut d'un bug"""
    bug = await db.bugs.find_one({"id": bug_id})
    if not bug:
        raise HTTPException(status_code=404, detail="Bug non trouvé")
    
    historique = bug.get("historique_statuts", [])
    historique.append({
        "ancien_statut": bug["statut"],
        "nouveau_statut": statut_data.nouveau_statut,
        "user_id": admin.id,
        "user_name": admin.nom,
        "date_changement": datetime.now(timezone.utc).isoformat()
    })
    
    await db.bugs.update_one(
        {"id": bug_id},
        {
            "$set": {
                "statut": statut_data.nouveau_statut,
                "historique_statuts": historique,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Envoyer email pour changement de statut
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            status_labels = {
                "nouveau": "🆕 Nouveau",
                "en_cours": "⚙️ En cours",
                "test": "🧪 En test",
                "resolu": "✅ Résolu",
                "ferme": "🔒 Fermé"
            }
            status_label = status_labels.get(statut_data.nouveau_statut, statut_data.nouveau_statut)
            
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="bug_status",
                titre=f"{status_label}: {bug['titre']}",
                description=f"Le statut a été changé de '{bug['statut']}' à '{statut_data.nouveau_statut}' par {admin.nom}",
                priorite=bug["priorite"],
                created_by=bug["created_by_name"],
                item_id=bug_id
            )
    except Exception as e:
        logger.error(f"Erreur envoi email changement statut bug: {e}")
    
    updated_bug = await db.bugs.find_one({"id": bug_id})
    return clean_mongo_doc(updated_bug)


@router.post("/admin/bugs/{bug_id}/commentaires")
async def add_bug_comment(
    bug_id: str,
    comment_data: CommentaireCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Ajouter un commentaire à un bug"""
    bug = await db.bugs.find_one({"id": bug_id})
    if not bug:
        raise HTTPException(status_code=404, detail="Bug non trouvé")
    
    commentaires = bug.get("commentaires", [])
    commentaires.append({
        "user_id": admin.id,
        "user_name": admin.nom,
        "texte": comment_data.texte,
        "date": datetime.now(timezone.utc).isoformat()
    })
    
    await db.bugs.update_one(
        {"id": bug_id},
        {
            "$set": {
                "commentaires": commentaires,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Envoyer email aux super-admins
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="bug_comment",
                titre=f"💬 Nouveau commentaire sur: {bug['titre']}",
                description=comment_data.texte,
                priorite=bug.get("priorite", "moyenne"),
                created_by=admin.nom,
                item_id=bug_id
            )
    except Exception as e:
        logger.error(f"Erreur envoi email commentaire bug: {e}")
    
    updated_bug = await db.bugs.find_one({"id": bug_id})
    return clean_mongo_doc(updated_bug)


@router.put("/admin/bugs/{bug_id}")
async def update_bug(
    bug_id: str,
    bug_update: BugReportCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Modifier un bug existant"""
    bug = await db.bugs.find_one({"id": bug_id})
    if not bug:
        raise HTTPException(status_code=404, detail="Bug non trouvé")
    
    await db.bugs.update_one(
        {"id": bug_id},
        {
            "$set": {
                "titre": bug_update.titre,
                "description": bug_update.description,
                "module": bug_update.module,
                "priorite": bug_update.priorite,
                "etapes_reproduction": bug_update.etapes_reproduction,
                "resultat_attendu": bug_update.resultat_attendu,
                "resultat_observe": bug_update.resultat_observe,
                "navigateur": bug_update.navigateur,
                "os": bug_update.os,
                "role_utilisateur": bug_update.role_utilisateur,
                "console_logs": bug_update.console_logs,
                "infos_supplementaires": bug_update.infos_supplementaires,
                "images": bug_update.images,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    return {"message": "Bug modifié avec succès"}


@router.delete("/admin/bugs/{bug_id}")
async def delete_bug(
    bug_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer un bug report"""
    bug = await db.bugs.find_one({"id": bug_id})
    if not bug:
        raise HTTPException(status_code=404, detail="Bug non trouvé")
    
    result = await db.bugs.delete_one({"id": bug_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")
    
    return {"message": "Bug supprimé avec succès", "id": bug_id}


# ==================== ROUTES FEATURES ====================

@router.get("/admin/features")
async def list_features(
    statut: Optional[str] = None,
    priorite: Optional[str] = None,
    module: Optional[str] = None,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Liste toutes les feature requests avec filtres optionnels"""
    query = {}
    if statut:
        query["statut"] = statut
    if priorite:
        query["priorite"] = priorite
    if module:
        query["module"] = module
    
    features = await db.feature_requests.find(query).sort("created_at", -1).to_list(1000)
    return [clean_mongo_doc(feature) for feature in features]


@router.post("/admin/features")
async def create_feature(
    feature_data: FeatureRequestCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Créer une nouvelle feature request"""
    feature_dict = feature_data.dict()
    feature_dict["id"] = str(uuid.uuid4())
    feature_dict["statut"] = "nouveau"
    feature_dict["commentaires"] = []
    feature_dict["historique_statuts"] = []
    feature_dict["created_by"] = admin.id
    feature_dict["created_by_name"] = admin.nom
    feature_dict["created_at"] = datetime.now(timezone.utc)
    feature_dict["updated_at"] = datetime.now(timezone.utc)
    
    await db.feature_requests.insert_one(feature_dict)
    
    # Envoyer email aux super-admins
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="feature",
                titre=feature_data.titre,
                description=feature_data.description,
                priorite=feature_data.priorite,
                created_by=feature_dict["created_by_name"],
                item_id=feature_dict["id"]
            )
    except Exception as e:
        logger.error(f"Erreur envoi email notification feature: {e}")
    
    return clean_mongo_doc(feature_dict)


@router.get("/admin/features/{feature_id}")
async def get_feature(
    feature_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Récupérer une feature request spécifique"""
    feature = await db.feature_requests.find_one({"id": feature_id})
    if not feature:
        raise HTTPException(status_code=404, detail="Feature request non trouvée")
    return clean_mongo_doc(feature)


@router.put("/admin/features/{feature_id}/statut")
async def update_feature_statut(
    feature_id: str,
    statut_data: ChangementStatut,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Changer le statut d'une feature request"""
    feature = await db.feature_requests.find_one({"id": feature_id})
    if not feature:
        raise HTTPException(status_code=404, detail="Feature request non trouvée")
    
    historique = feature.get("historique_statuts", [])
    historique.append({
        "ancien_statut": feature["statut"],
        "nouveau_statut": statut_data.nouveau_statut,
        "user_id": admin.id,
        "user_name": admin.nom,
        "date_changement": datetime.now(timezone.utc).isoformat()
    })
    
    await db.feature_requests.update_one(
        {"id": feature_id},
        {
            "$set": {
                "statut": statut_data.nouveau_statut,
                "historique_statuts": historique,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Envoyer email pour changement de statut
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            status_labels = {
                "nouveau": "🆕 Nouveau",
                "en_cours": "⚙️ En cours",
                "test": "🧪 En test",
                "resolu": "✅ Résolu",
                "ferme": "🔒 Fermé"
            }
            status_label = status_labels.get(statut_data.nouveau_statut, statut_data.nouveau_statut)
            
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="feature_status",
                titre=f"{status_label}: {feature['titre']}",
                description=f"Le statut a été changé de '{feature['statut']}' à '{statut_data.nouveau_statut}' par {admin.nom}",
                priorite=feature.get("priorite", "moyenne"),
                created_by=feature["created_by_name"],
                item_id=feature_id
            )
    except Exception as e:
        logger.error(f"Erreur envoi email changement statut feature: {e}")
    
    updated_feature = await db.feature_requests.find_one({"id": feature_id})
    return clean_mongo_doc(updated_feature)


@router.post("/admin/features/{feature_id}/commentaires")
async def add_feature_comment(
    feature_id: str,
    comment_data: CommentaireCreate,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Ajouter un commentaire à une feature request"""
    feature = await db.feature_requests.find_one({"id": feature_id})
    if not feature:
        raise HTTPException(status_code=404, detail="Feature request non trouvée")
    
    commentaires = feature.get("commentaires", [])
    commentaires.append({
        "user_id": admin.id,
        "user_name": admin.nom,
        "texte": comment_data.texte,
        "date": datetime.now(timezone.utc).isoformat()
    })
    
    await db.feature_requests.update_one(
        {"id": feature_id},
        {
            "$set": {
                "commentaires": commentaires,
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Envoyer email aux super-admins
    try:
        super_admins = await db.super_admins.find().to_list(100)
        super_admins_emails = [sa["email"] for sa in super_admins if sa["id"] != admin.id]
        
        if super_admins_emails:
            send_debogage_notification_email(
                super_admins_emails=super_admins_emails,
                type_notification="feature_comment",
                titre=f"💬 Nouveau commentaire sur: {feature['titre']}",
                description=comment_data.texte,
                priorite=feature.get("priorite", "moyenne"),
                created_by=admin.nom,
                item_id=feature_id
            )
    except Exception as e:
        logger.error(f"Erreur envoi email commentaire feature: {e}")
    
    updated_feature = await db.feature_requests.find_one({"id": feature_id})
    return clean_mongo_doc(updated_feature)


@router.delete("/admin/features/{feature_id}")
async def delete_feature(
    feature_id: str,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Supprimer une feature request"""
    feature = await db.feature_requests.find_one({"id": feature_id})
    if not feature:
        raise HTTPException(status_code=404, detail="Feature request non trouvée")
    
    result = await db.feature_requests.delete_one({"id": feature_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=500, detail="Erreur lors de la suppression")
    
    return {"message": "Feature request supprimée avec succès", "id": feature_id}


# ==================== UPLOAD IMAGE ====================

@router.post("/admin/upload-image")
async def upload_debug_image(
    file: UploadFile,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """Upload une image pour un bug/feature (retourne une URL ou base64)"""
    try:
        contents = await file.read()
        encoded = base64.b64encode(contents).decode('utf-8')
        mime_type = file.content_type or 'image/png'
        data_url = f"data:{mime_type};base64,{encoded}"
        
        return {"url": data_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur upload image: {str(e)}")
