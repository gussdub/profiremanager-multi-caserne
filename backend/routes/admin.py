"""
Routes API pour le module Super Admin - Centrales 911
=====================================================

Ce module gère les centrales 911 (CAUCA, etc.) qui sont configurées au niveau global
et associées aux tenants pour la réception des cartes d'appel.
"""

from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
import uuid
import logging

from routes.dependencies import (
    db,
    get_super_admin,
    log_super_admin_action,
    SuperAdmin,
    clean_mongo_doc
)

router = APIRouter(tags=["Super Admin - Centrales 911"])
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
