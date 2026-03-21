"""
Routes pour l'import intelligent de bâtiments avec détection de conflits
et rétro-liaison des interventions
"""
import csv
import uuid
from io import StringIO
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Body
from pydantic import BaseModel, Field

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    require_permission
)
from utils.address_utils import (
    normalize_address,
    calculate_address_similarity,
    find_matching_address,
    compare_building_fields,
    extract_civic_number,
    extract_postal_code,
    generate_address_key,
    is_same_address
)

router = APIRouter()


# ==================== MODÈLES ====================

class ImportConflict(BaseModel):
    """Représente un conflit détecté lors de l'import"""
    import_index: int
    new_data: Dict[str, Any]
    existing_batiment: Dict[str, Any]
    similarity_score: float
    differences: Dict[str, Dict[str, Any]]
    suggested_action: str = "review"  # "review", "replace", "merge", "skip"


class ImportPreviewResponse(BaseModel):
    """Réponse de prévisualisation d'import"""
    total_rows: int
    new_batiments: int
    conflicts: List[ImportConflict]
    duplicates_in_file: int
    errors: List[Dict[str, Any]]


class ConflictResolution(BaseModel):
    """Résolution d'un conflit d'import"""
    import_index: int
    action: str  # "replace", "merge", "skip", "create_new"
    existing_batiment_id: Optional[str] = None
    merge_preferences: Optional[Dict[str, str]] = None  # {field: "new" | "existing"}


class ImportExecuteRequest(BaseModel):
    """Requête d'exécution d'import avec résolutions"""
    session_id: str
    resolutions: List[ConflictResolution]
    create_new_buildings: bool = True  # Créer les nouveaux bâtiments sans conflit


# ==================== STOCKAGE TEMPORAIRE DES SESSIONS D'IMPORT ====================
# En production, utiliser Redis ou MongoDB pour les sessions
import_sessions = {}


# ==================== ROUTES ====================

@router.post("/{tenant_slug}/batiments/import/preview")
async def preview_import_batiments(
    tenant_slug: str,
    file: UploadFile = File(...),
    similarity_threshold: float = 0.92,  # Augmenté pour éviter les faux positifs
    current_user: User = Depends(get_current_user)
):
    """
    Prévisualise un import de bâtiments et détecte les conflits.
    Retourne les conflits à résoudre avant l'import final.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    # Lire le fichier CSV
    contents = await file.read()
    try:
        csv_text = contents.decode('utf-8')
    except UnicodeDecodeError:
        csv_text = contents.decode('latin-1')
    
    csv_reader = csv.DictReader(StringIO(csv_text))
    rows = list(csv_reader)
    
    # Charger tous les bâtiments existants
    existing_batiments = await db.batiments.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)
    
    conflicts = []
    new_batiments = []
    errors = []
    seen_addresses = {}  # Pour détecter les doublons dans le fichier
    duplicates_in_file = 0
    
    for idx, row in enumerate(rows):
        try:
            # Extraire l'adresse
            address = row.get('adresse_civique') or row.get('adresse') or row.get('adresse_complete', '')
            
            if not address:
                errors.append({
                    "row": idx + 2,  # +2 car header + index 0
                    "error": "Adresse manquante",
                    "data": row
                })
                continue
            
            # Vérifier les doublons dans le fichier
            address_key = generate_address_key(address, row.get('code_postal'))
            if address_key in seen_addresses:
                duplicates_in_file += 1
                errors.append({
                    "row": idx + 2,
                    "error": f"Doublon dans le fichier (même adresse que ligne {seen_addresses[address_key] + 2})",
                    "data": row
                })
                continue
            seen_addresses[address_key] = idx
            
            # Préparer les données du nouveau bâtiment
            new_data = {
                "nom_etablissement": row.get('nom_etablissement', row.get('nom', '')),
                "adresse_civique": address,
                "ville": row.get('ville', ''),
                "code_postal": row.get('code_postal', ''),
                "proprietaire": row.get('proprietaire', ''),
                "type_batiment": row.get('type_batiment', ''),
                "usage_principal": row.get('usage_principal', row.get('usage', '')),
                "groupe_occupation": row.get('groupe_occupation', ''),
                "nombre_etages": row.get('nombre_etages', ''),
                "nombre_logements": row.get('nombre_logements', ''),
                "superficie": row.get('superficie', ''),
                "annee_construction": row.get('annee_construction', ''),
                "type_construction": row.get('type_construction', ''),
                "gicleurs": row.get('gicleurs', ''),
                "alarme_incendie": row.get('alarme_incendie', ''),
                "niveau_risque": row.get('niveau_risque', ''),
                "matricule": row.get('matricule', row.get('numero_matricule', '')),
                "numero_lot": row.get('numero_lot', ''),
                "latitude": row.get('latitude', ''),
                "longitude": row.get('longitude', ''),
                "notes": row.get('notes', '')
            }
            
            # Chercher les correspondances avec la nouvelle logique stricte
            # (même numéro + même rue + même ville = doublon)
            city = row.get('ville', '')
            matches = find_matching_address(address, city, existing_batiments, similarity_threshold)
            
            if matches:
                # Conflit trouvé - prendre la meilleure correspondance
                best_match, score = matches[0]
                differences = compare_building_fields(new_data, best_match)
                
                conflicts.append(ImportConflict(
                    import_index=idx,
                    new_data=new_data,
                    existing_batiment=best_match,
                    similarity_score=score,
                    differences=differences,
                    suggested_action="replace" if score >= 0.95 else "review"
                ))
            else:
                # Nouveau bâtiment
                new_batiments.append({
                    "import_index": idx,
                    "data": new_data
                })
                
        except Exception as e:
            errors.append({
                "row": idx + 2,
                "error": str(e),
                "data": row
            })
    
    # Créer une session d'import
    session_id = str(uuid.uuid4())
    import_sessions[session_id] = {
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "rows": rows,
        "new_batiments": new_batiments,
        "conflicts": [c.dict() for c in conflicts],
        "errors": errors
    }
    
    return {
        "session_id": session_id,
        "total_rows": len(rows),
        "new_batiments": len(new_batiments),
        "conflicts": conflicts,
        "duplicates_in_file": duplicates_in_file,
        "errors": errors[:20]  # Limiter les erreurs retournées
    }


@router.post("/{tenant_slug}/batiments/import/execute")
async def execute_import_batiments(
    tenant_slug: str,
    request: ImportExecuteRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Exécute l'import avec les résolutions de conflits fournies.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    # Récupérer la session
    session = import_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session d'import expirée ou invalide")
    
    if session["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Session non autorisée pour ce tenant")
    
    results = {
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "archived": 0,
        "interventions_linked": 0,
        "errors": []
    }
    
    # Créer un index des résolutions par import_index
    resolutions_map = {r.import_index: r for r in request.resolutions}
    
    # Traiter les nouveaux bâtiments (sans conflit)
    if request.create_new_buildings:
        for new_bat in session["new_batiments"]:
            try:
                batiment_data = new_bat["data"]
                batiment_data["id"] = str(uuid.uuid4())
                batiment_data["tenant_id"] = tenant.id
                batiment_data["created_at"] = datetime.now(timezone.utc).isoformat()
                batiment_data["created_by"] = current_user.id
                
                await db.batiments.insert_one(batiment_data)
                results["created"] += 1
                
                # Rétro-liaison des interventions
                linked = await link_interventions_to_batiment(
                    tenant.id, 
                    batiment_data["id"], 
                    batiment_data["adresse_civique"]
                )
                results["interventions_linked"] += linked
                
            except Exception as e:
                results["errors"].append({
                    "type": "create",
                    "index": new_bat["import_index"],
                    "error": str(e)
                })
    
    # Traiter les conflits avec résolutions
    for conflict in session["conflicts"]:
        idx = conflict["import_index"]
        resolution = resolutions_map.get(idx)
        
        if not resolution:
            results["skipped"] += 1
            continue
        
        try:
            if resolution.action == "skip":
                results["skipped"] += 1
                
            elif resolution.action == "replace":
                # Archiver l'ancien bâtiment
                existing = conflict["existing_batiment"]
                await archive_batiment(existing, current_user.id, "replaced_by_import")
                results["archived"] += 1
                
                # Mettre à jour avec les nouvelles données
                new_data = conflict["new_data"]
                new_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                new_data["updated_by"] = current_user.id
                
                await db.batiments.update_one(
                    {"id": existing["id"], "tenant_id": tenant.id},
                    {"$set": new_data}
                )
                results["updated"] += 1
                
                # Rétro-liaison des interventions
                linked = await link_interventions_to_batiment(
                    tenant.id, 
                    existing["id"], 
                    new_data["adresse_civique"]
                )
                results["interventions_linked"] += linked
                
            elif resolution.action == "merge":
                # Fusionner les données selon les préférences
                existing = conflict["existing_batiment"]
                new_data = conflict["new_data"]
                merged_data = {}
                
                # Pour chaque champ, utiliser la préférence ou garder l'existant
                for field, diff in conflict.get("differences", {}).items():
                    pref = resolution.merge_preferences.get(field, "existing") if resolution.merge_preferences else "existing"
                    if pref == "new":
                        merged_data[field] = new_data.get(field)
                    # Si "existing", on ne change rien
                
                if merged_data:
                    # Archiver avant modification
                    await archive_batiment(existing, current_user.id, "merged_by_import")
                    results["archived"] += 1
                    
                    merged_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                    merged_data["updated_by"] = current_user.id
                    
                    await db.batiments.update_one(
                        {"id": existing["id"], "tenant_id": tenant.id},
                        {"$set": merged_data}
                    )
                    results["updated"] += 1
                
            elif resolution.action == "create_new":
                # Créer comme nouveau bâtiment malgré le conflit
                new_data = conflict["new_data"]
                new_data["id"] = str(uuid.uuid4())
                new_data["tenant_id"] = tenant.id
                new_data["created_at"] = datetime.now(timezone.utc).isoformat()
                new_data["created_by"] = current_user.id
                
                await db.batiments.insert_one(new_data)
                results["created"] += 1
                
        except Exception as e:
            results["errors"].append({
                "type": resolution.action,
                "index": idx,
                "error": str(e)
            })
    
    # Nettoyer la session
    del import_sessions[request.session_id]
    
    return {
        "success": True,
        "results": results,
        "message": f"Import terminé: {results['created']} créés, {results['updated']} mis à jour, {results['skipped']} ignorés, {results['interventions_linked']} interventions liées"
    }


@router.get("/{tenant_slug}/batiments/{batiment_id}/history")
async def get_batiment_history(
    tenant_slug: str,
    batiment_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Récupère l'historique des versions archivées d'un bâtiment.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "voir", "batiments")
    
    history = await db.batiments_historique.find(
        {"batiment_id": batiment_id, "tenant_id": tenant.id},
        {"_id": 0}
    ).sort("archived_at", -1).to_list(length=50)
    
    return {"history": history}


@router.post("/{tenant_slug}/batiments/link-interventions")
async def link_all_interventions_to_batiments(
    tenant_slug: str,
    current_user: User = Depends(get_current_user)
):
    """
    Lance la rétro-liaison de toutes les interventions aux bâtiments existants.
    Utile après un import en masse.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "modifier", "rapports")
    
    # Charger tous les bâtiments
    batiments = await db.batiments.find(
        {"tenant_id": tenant.id},
        {"_id": 0, "id": 1, "adresse_civique": 1}
    ).to_list(length=None)
    
    total_linked = 0
    
    for batiment in batiments:
        linked = await link_interventions_to_batiment(
            tenant.id,
            batiment["id"],
            batiment["adresse_civique"]
        )
        total_linked += linked
    
    return {
        "success": True,
        "batiments_processed": len(batiments),
        "interventions_linked": total_linked
    }


# ==================== FONCTIONS UTILITAIRES ====================

async def archive_batiment(batiment: Dict, user_id: str, reason: str):
    """
    Archive une version du bâtiment dans l'historique.
    """
    archive_record = {
        "id": str(uuid.uuid4()),
        "batiment_id": batiment.get("id"),
        "tenant_id": batiment.get("tenant_id"),
        "archived_at": datetime.now(timezone.utc).isoformat(),
        "archived_by": user_id,
        "reason": reason,
        "data": batiment
    }
    
    await db.batiments_historique.insert_one(archive_record)


async def link_interventions_to_batiment(
    tenant_id: str, 
    batiment_id: str, 
    batiment_address: str,
    similarity_threshold: float = 0.85
) -> int:
    """
    Lie les interventions sans batiment_id à un bâtiment basé sur l'adresse.
    Retourne le nombre d'interventions liées.
    """
    if not batiment_address:
        return 0
    
    linked_count = 0
    
    # Trouver les interventions sans batiment_id ou avec un batiment_id vide
    interventions = await db.interventions.find({
        "tenant_id": tenant_id,
        "$or": [
            {"batiment_id": {"$exists": False}},
            {"batiment_id": None},
            {"batiment_id": ""}
        ]
    }).to_list(length=None)
    
    for intervention in interventions:
        # Essayer de trouver l'adresse de l'intervention
        intervention_addr = (
            intervention.get("adresse") or
            intervention.get("adresse_incident") or
            intervention.get("localisation", {}).get("adresse") or
            ""
        )
        
        if not intervention_addr:
            continue
        
        # Calculer la similarité
        similarity = calculate_address_similarity(intervention_addr, batiment_address)
        
        if similarity >= similarity_threshold:
            # Lier l'intervention au bâtiment
            await db.interventions.update_one(
                {"id": intervention.get("id"), "tenant_id": tenant_id},
                {"$set": {
                    "batiment_id": batiment_id,
                    "batiment_linked_at": datetime.now(timezone.utc).isoformat(),
                    "batiment_link_similarity": similarity
                }}
            )
            linked_count += 1
    
    return linked_count
