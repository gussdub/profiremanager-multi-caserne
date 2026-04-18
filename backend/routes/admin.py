"""
Routes API pour le module Super Admin
=====================================

Ce module regroupe les routes administratives accessibles uniquement aux super-admins :
- Gestion des centrales 911 (CAUCA, etc.)
- Journal d'audit des actions
- (À venir) Gestion des tenants, bugs, features
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.dependencies import (
    db,
    get_super_admin,
    log_super_admin_action,
    SuperAdmin,
    clean_mongo_doc
)

router = APIRouter(tags=["Super Admin"])
logger = logging.getLogger(__name__)


# ==================== ROUTES CENTRALES 911 ====================

@router.get("/admin/centrales-911")
async def list_centrales_911(admin: SuperAdmin = Depends(get_super_admin)):
    """Liste toutes les centrales 911"""
    centrales = await db.centrales_911.find({}, {"_id": 0}).sort("nom", 1).to_list(100)
    return {"centrales": centrales}


@router.get("/admin/centrales-911/{centrale_id}")
async def get_centrale_911(centrale_id: str, admin: SuperAdmin = Depends(get_super_admin)):
    """Récupère une centrale 911 par ID"""
    centrale = await db.centrales_911.find_one({"id": centrale_id}, {"_id": 0})
    if not centrale:
        raise HTTPException(status_code=404, detail="Centrale non trouvée")
    return centrale


@router.post("/admin/centrales-911")
async def create_centrale_911(centrale_data: dict, admin: SuperAdmin = Depends(get_super_admin)):
    """Créer une nouvelle centrale 911"""
    # Vérifier que le code est unique
    existing = await db.centrales_911.find_one({"code": centrale_data.get("code")})
    if existing:
        raise HTTPException(status_code=400, detail="Ce code de centrale existe déjà")
    
    centrale = {
        "id": str(uuid.uuid4()),
        "code": centrale_data.get("code", "").upper(),
        "nom": centrale_data.get("nom", ""),
        "region": centrale_data.get("region", ""),
        "actif": centrale_data.get("actif", True),
        "xml_encoding": centrale_data.get("xml_encoding", "utf-8"),
        "xml_root_element": centrale_data.get("xml_root_element", "carteAppel"),
        "field_mapping": centrale_data.get("field_mapping", {}),
        "value_mapping": centrale_data.get("value_mapping", {}),
        "date_formats": centrale_data.get("date_formats", ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"]),
        "notes": centrale_data.get("notes", ""),
        "created_at": datetime.now(timezone.utc),
        "created_by": admin.id
    }
    
    await db.centrales_911.insert_one(centrale)
    centrale.pop("_id", None)
    
    await log_super_admin_action(
        admin=admin,
        action="centrale_911_create",
        details={"centrale_code": centrale["code"], "centrale_nom": centrale["nom"]}
    )
    
    return {"message": f"Centrale '{centrale['nom']}' créée avec succès", "centrale": centrale}


@router.put("/admin/centrales-911/{centrale_id}")
async def update_centrale_911(centrale_id: str, update_data: dict, admin: SuperAdmin = Depends(get_super_admin)):
    """Mettre à jour une centrale 911"""
    existing = await db.centrales_911.find_one({"id": centrale_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Centrale non trouvée")
    
    update_data.pop("_id", None)
    update_data.pop("id", None)
    update_data["updated_at"] = datetime.now(timezone.utc)
    
    await db.centrales_911.update_one(
        {"id": centrale_id},
        {"$set": update_data}
    )
    
    await log_super_admin_action(
        admin=admin,
        action="centrale_911_update",
        details={"centrale_id": centrale_id, "changes": list(update_data.keys())}
    )
    
    return {"message": "Centrale mise à jour avec succès"}


@router.delete("/admin/centrales-911/{centrale_id}")
async def delete_centrale_911(centrale_id: str, admin: SuperAdmin = Depends(get_super_admin)):
    """Supprimer une centrale 911"""
    # Vérifier si des tenants utilisent cette centrale
    tenants_using = await db.tenants.count_documents({"centrale_911_id": centrale_id})
    if tenants_using > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Impossible de supprimer: {tenants_using} caserne(s) utilise(nt) cette centrale"
        )
    
    result = await db.centrales_911.delete_one({"id": centrale_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Centrale non trouvée")
    
    await log_super_admin_action(
        admin=admin,
        action="centrale_911_delete",
        details={"centrale_id": centrale_id}
    )
    
    return {"message": "Centrale supprimée avec succès"}


# ==================== ROUTES AUDIT LOGS ====================

@router.get("/admin/audit-logs")
async def get_audit_logs(
    admin: SuperAdmin = Depends(get_super_admin),
    limit: int = 50,
    offset: int = 0,
    action: str = None,
    tenant_slug: str = None,
    admin_email: str = None
):
    """
    Récupère le journal d'audit des actions super-admin
    
    Paramètres de filtrage optionnels:
    - action: Filtrer par type d'action (login, tenant_access, tenant_create, etc.)
    - tenant_slug: Filtrer par tenant
    - admin_email: Filtrer par super-admin
    """
    query = {}
    
    if action:
        query["action"] = action
    if tenant_slug:
        query["tenant_slug"] = tenant_slug
    if admin_email:
        query["admin_email"] = admin_email
    
    # Récupérer les logs avec pagination (plus récents en premier)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)
    
    # Compter le total pour la pagination
    total = await db.audit_logs.count_documents(query)
    
    return {
        "logs": logs,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/admin/audit-logs/summary")
async def get_audit_logs_summary(admin: SuperAdmin = Depends(get_super_admin)):
    """
    Résumé des actions d'audit (dernières 24h, 7 jours, 30 jours)
    """
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)
    last_30d = now - timedelta(days=30)
    
    # Compteurs par période
    count_24h = await db.audit_logs.count_documents({"created_at": {"$gte": last_24h}})
    count_7d = await db.audit_logs.count_documents({"created_at": {"$gte": last_7d}})
    count_30d = await db.audit_logs.count_documents({"created_at": {"$gte": last_30d}})
    
    # Actions par type (30 derniers jours)
    pipeline = [
        {"$match": {"created_at": {"$gte": last_30d}}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    actions_by_type = await db.audit_logs.aggregate(pipeline).to_list(100)
    
    # Derniers accès par tenant (30 derniers jours)
    pipeline_tenants = [
        {"$match": {"created_at": {"$gte": last_30d}, "tenant_slug": {"$ne": None}}},
        {"$group": {
            "_id": "$tenant_slug",
            "tenant_nom": {"$first": "$tenant_nom"},
            "last_access": {"$max": "$created_at"},
            "access_count": {"$sum": 1}
        }},
        {"$sort": {"last_access": -1}},
        {"$limit": 10}
    ]
    tenants_accessed = await db.audit_logs.aggregate(pipeline_tenants).to_list(10)
    
    # Activité par super-admin (30 derniers jours)
    pipeline_admins = [
        {"$match": {"created_at": {"$gte": last_30d}}},
        {"$group": {
            "_id": "$admin_email",
            "admin_nom": {"$first": "$admin_nom"},
            "action_count": {"$sum": 1},
            "last_action": {"$max": "$created_at"}
        }},
        {"$sort": {"action_count": -1}}
    ]
    admins_activity = await db.audit_logs.aggregate(pipeline_admins).to_list(100)
    
    return {
        "counts": {
            "last_24h": count_24h,
            "last_7d": count_7d,
            "last_30d": count_30d
        },
        "actions_by_type": [{"action": a["_id"], "count": a["count"]} for a in actions_by_type],
        "tenants_accessed": [
            {
                "tenant_slug": t["_id"],
                "tenant_nom": t.get("tenant_nom"),
                "last_access": t["last_access"].isoformat() if t.get("last_access") else None,
                "access_count": t["access_count"]
            }
            for t in tenants_accessed
        ],
        "admins_activity": [
            {
                "admin_email": a["_id"],
                "admin_nom": a.get("admin_nom"),
                "action_count": a["action_count"],
                "last_action": a["last_action"].isoformat() if a.get("last_action") else None
            }
            for a in admins_activity
        ]
    }



# ==================== NETTOYAGE BASE DE DONNÉES ====================

@router.post("/admin/cleanup-database")
async def cleanup_database(
    confirm: bool = False,
    admin: SuperAdmin = Depends(get_super_admin)
):
    """
    Nettoie complètement la base de données (DANGER)
    - Supprime TOUS les bâtiments et inspections
    - Conserve uniquement les tenants: demo, shefford, magog
    - Supprime les données orphelines
    """
    if not confirm:
        raise HTTPException(
            status_code=400, 
            detail="Vous devez confirmer avec confirm=true"
        )
    
    logger.warning(f"🗑️  NETTOYAGE BASE DE DONNÉES déclenché par {admin.email}")
    
    # Tenants à conserver
    TENANTS_VOULUS = ["sutton", "demo", "demonstration", "shefford"]
    
    # 1. Récupérer tous les tenants
    tenants = await db.tenants.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
    tenants_valides = [t['id'] for t in tenants if t.get('slug', '').lower() in TENANTS_VOULUS]
    tenants_a_supprimer = [t for t in tenants if t.get('slug', '').lower() not in TENANTS_VOULUS]
    
    results = {
        "tenants_conserves": [t.get('slug') for t in tenants if t['id'] in tenants_valides],
        "tenants_supprimes": [],
        "batiments_supprimes": 0,
        "inspections_supprimees": 0,
        "orphelins_supprimes": {}
    }
    
    # 2. Supprimer les tenants indésirables
    for tenant in tenants_a_supprimer:
        await db.tenants.delete_one({"id": tenant['id']})
        results["tenants_supprimes"].append(tenant.get('slug'))
        
        # Supprimer toutes les données associées
        collections = await db.list_collection_names()
        for coll_name in collections:
            if coll_name not in ['super_admins', 'system.indexes', 'centrales_911']:
                result = await db[coll_name].delete_many({"tenant_id": tenant['id']})
                if result.deleted_count > 0:
                    results["orphelins_supprimes"][coll_name] = result.deleted_count
    
    # 3. Supprimer TOUS les bâtiments et inspections
    result_bat = await db.batiments.delete_many({})
    results["batiments_supprimes"] = result_bat.deleted_count
    
    result_insp = await db.inspections.delete_many({})
    results["inspections_supprimees"] = result_insp.deleted_count
    
    # 4. Nettoyer historiques et imports
    await db.batiments_historique.delete_many({})
    await db.import_dossier_adresses.delete_many({})
    
    # 5. Supprimer les données orphelines
    collections_to_clean = [
        "users", "types_garde", "assignations", "demandes_remplacement",
        "formations", "disponibilites", "interventions", "equipements", "stored_files"
    ]
    
    for coll_name in collections_to_clean:
        result = await db[coll_name].delete_many({"tenant_id": {"$nin": tenants_valides}})
        if result.deleted_count > 0:
            if "orphelins_supprimes" not in results:
                results["orphelins_supprimes"] = {}
            results["orphelins_supprimes"][coll_name] = result.deleted_count
    
    # Log de l'action
    await log_super_admin_action(
        admin=admin,
        action="cleanup_database",
        details=results
    )
    
    logger.warning(f"✅ Nettoyage terminé: {results}")
    
    return {
        "success": True,
        "message": "Base de données nettoyée avec succès",
        "results": results
    }
