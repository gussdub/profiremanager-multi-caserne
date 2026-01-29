"""
Module Historique des E-mails
Gère l'enregistrement et la consultation des e-mails envoyés par l'application
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

router = APIRouter(tags=["Emails History"])

logger = logging.getLogger(__name__)


def get_db():
    """Import db from server to avoid circular imports"""
    from server import db
    return db


def get_current_user():
    """Import get_current_user from server"""
    from server import get_current_user as _get_current_user
    return _get_current_user


# ==================== MODÈLES ====================

class EmailLogCreate(BaseModel):
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    type_email: str  # welcome, password_reset, temp_password, gardes_notification, super_admin_welcome, debogage
    destinataire_email: str
    destinataire_nom: Optional[str] = None
    sujet: str
    statut: str = "sent"  # sent, failed
    erreur: Optional[str] = None
    metadata: Optional[dict] = None  # Données additionnelles (ex: nombre de gardes, role, etc.)


class EmailLogResponse(BaseModel):
    id: str
    tenant_id: Optional[str] = None
    tenant_slug: Optional[str] = None
    type_email: str
    destinataire_email: str
    destinataire_nom: Optional[str] = None
    sujet: str
    statut: str
    erreur: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: datetime


# ==================== FONCTION HELPER ====================

async def log_email_sent(
    type_email: str,
    destinataire_email: str,
    sujet: str,
    statut: str = "sent",
    destinataire_nom: Optional[str] = None,
    tenant_id: Optional[str] = None,
    tenant_slug: Optional[str] = None,
    erreur: Optional[str] = None,
    metadata: Optional[dict] = None
):
    """
    Enregistre un e-mail envoyé dans l'historique.
    À appeler après chaque envoi d'e-mail.
    """
    try:
        from server import db
        
        email_log = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "tenant_slug": tenant_slug,
            "type_email": type_email,
            "destinataire_email": destinataire_email,
            "destinataire_nom": destinataire_nom,
            "sujet": sujet,
            "statut": statut,
            "erreur": erreur,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.emails_history.insert_one(email_log)
        logger.info(f"Email logged: {type_email} to {destinataire_email} - {statut}")
        
    except Exception as e:
        logger.error(f"Erreur lors de l'enregistrement de l'email: {str(e)}")


# ==================== ROUTES ADMIN ====================

@router.get("/{tenant_slug}/admin/emails-history")
async def get_emails_history(
    tenant_slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type_email: Optional[str] = None,
    destinataire: Optional[str] = None,
    statut: Optional[str] = None,
    date_debut: Optional[str] = None,
    date_fin: Optional[str] = None
):
    """
    Récupère l'historique des e-mails envoyés pour un tenant.
    Accessible uniquement aux admins.
    """
    db = get_db()
    
    # Construire le filtre
    query = {"tenant_slug": tenant_slug}
    
    if type_email:
        query["type_email"] = type_email
    
    if destinataire:
        query["destinataire_email"] = {"$regex": destinataire, "$options": "i"}
    
    if statut:
        query["statut"] = statut
    
    if date_debut:
        try:
            date_debut_dt = datetime.fromisoformat(date_debut.replace('Z', '+00:00'))
            query["created_at"] = {"$gte": date_debut_dt}
        except:
            pass
    
    if date_fin:
        try:
            date_fin_dt = datetime.fromisoformat(date_fin.replace('Z', '+00:00'))
            if "created_at" in query:
                query["created_at"]["$lte"] = date_fin_dt
            else:
                query["created_at"] = {"$lte": date_fin_dt}
        except:
            pass
    
    # Compter le total
    total = await db.emails_history.count_documents(query)
    
    # Récupérer les e-mails avec pagination
    skip = (page - 1) * limit
    emails_cursor = db.emails_history.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    emails = await emails_cursor.to_list(length=limit)
    
    # Convertir les dates en ISO format
    for email in emails:
        if isinstance(email.get("created_at"), datetime):
            email["created_at"] = email["created_at"].isoformat()
    
    return {
        "emails": emails,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@router.get("/{tenant_slug}/admin/emails-history/stats")
async def get_emails_stats(
    tenant_slug: str,
    periode: str = Query("7d", description="Période: 24h, 7d, 30d, 90d")
):
    """
    Récupère les statistiques des e-mails envoyés.
    """
    db = get_db()
    
    # Calculer la date de début selon la période
    now = datetime.now(timezone.utc)
    if periode == "24h":
        date_debut = now - timedelta(hours=24)
    elif periode == "7d":
        date_debut = now - timedelta(days=7)
    elif periode == "30d":
        date_debut = now - timedelta(days=30)
    elif periode == "90d":
        date_debut = now - timedelta(days=90)
    else:
        date_debut = now - timedelta(days=7)
    
    query = {
        "tenant_slug": tenant_slug,
        "created_at": {"$gte": date_debut}
    }
    
    # Total e-mails
    total_emails = await db.emails_history.count_documents(query)
    
    # E-mails réussis
    query_success = {**query, "statut": "sent"}
    emails_success = await db.emails_history.count_documents(query_success)
    
    # E-mails échoués
    query_failed = {**query, "statut": "failed"}
    emails_failed = await db.emails_history.count_documents(query_failed)
    
    # Stats par type
    pipeline = [
        {"$match": query},
        {"$group": {"_id": "$type_email", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    stats_by_type = await db.emails_history.aggregate(pipeline).to_list(length=20)
    
    # Derniers destinataires uniques
    pipeline_destinataires = [
        {"$match": query},
        {"$group": {"_id": "$destinataire_email", "last_sent": {"$max": "$created_at"}, "count": {"$sum": 1}}},
        {"$sort": {"last_sent": -1}},
        {"$limit": 10}
    ]
    top_destinataires = await db.emails_history.aggregate(pipeline_destinataires).to_list(length=10)
    
    return {
        "periode": periode,
        "total_emails": total_emails,
        "emails_success": emails_success,
        "emails_failed": emails_failed,
        "taux_succes": round((emails_success / total_emails * 100) if total_emails > 0 else 0, 1),
        "stats_par_type": [{"type": s["_id"], "count": s["count"]} for s in stats_by_type],
        "top_destinataires": [
            {
                "email": d["_id"],
                "count": d["count"],
                "last_sent": d["last_sent"].isoformat() if isinstance(d["last_sent"], datetime) else d["last_sent"]
            }
            for d in top_destinataires
        ]
    }


@router.get("/{tenant_slug}/admin/emails-history/{email_id}")
async def get_email_detail(
    tenant_slug: str,
    email_id: str
):
    """
    Récupère les détails d'un e-mail spécifique.
    """
    db = get_db()
    
    email = await db.emails_history.find_one(
        {"id": email_id, "tenant_slug": tenant_slug},
        {"_id": 0}
    )
    
    if not email:
        raise HTTPException(status_code=404, detail="E-mail non trouvé")
    
    if isinstance(email.get("created_at"), datetime):
        email["created_at"] = email["created_at"].isoformat()
    
    return email


# ==================== ROUTES SUPER ADMIN ====================

@router.get("/admin/emails-history/global")
async def get_global_emails_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    tenant_slug: Optional[str] = None,
    type_email: Optional[str] = None,
    statut: Optional[str] = None
):
    """
    Récupère l'historique global des e-mails (Super Admin uniquement).
    """
    db = get_db()
    
    query = {}
    
    if tenant_slug:
        query["tenant_slug"] = tenant_slug
    
    if type_email:
        query["type_email"] = type_email
    
    if statut:
        query["statut"] = statut
    
    total = await db.emails_history.count_documents(query)
    
    skip = (page - 1) * limit
    emails_cursor = db.emails_history.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    emails = await emails_cursor.to_list(length=limit)
    
    for email in emails:
        if isinstance(email.get("created_at"), datetime):
            email["created_at"] = email["created_at"].isoformat()
    
    return {
        "emails": emails,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@router.get("/admin/emails-history/global/stats")
async def get_global_emails_stats():
    """
    Récupère les statistiques globales des e-mails (Super Admin).
    """
    db = get_db()
    
    now = datetime.now(timezone.utc)
    date_30d = now - timedelta(days=30)
    
    # Total global
    total_global = await db.emails_history.count_documents({})
    
    # Total 30 derniers jours
    total_30d = await db.emails_history.count_documents({"created_at": {"$gte": date_30d}})
    
    # Stats par tenant
    pipeline_tenants = [
        {"$match": {"created_at": {"$gte": date_30d}}},
        {"$group": {"_id": "$tenant_slug", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    stats_by_tenant = await db.emails_history.aggregate(pipeline_tenants).to_list(length=10)
    
    # Stats par type
    pipeline_types = [
        {"$match": {"created_at": {"$gte": date_30d}}},
        {"$group": {"_id": "$type_email", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    stats_by_type = await db.emails_history.aggregate(pipeline_types).to_list(length=20)
    
    return {
        "total_global": total_global,
        "total_30_jours": total_30d,
        "stats_par_tenant": [{"tenant": s["_id"] or "global", "count": s["count"]} for s in stats_by_tenant],
        "stats_par_type": [{"type": s["_id"], "count": s["count"]} for s in stats_by_type]
    }
