"""
Endpoint générique d'import batch pour ProFireManager Transfer.
Reçoit des records un par un depuis PremLigne et les stocke selon entity_type.

Le record est stocké TEL QUEL. On extrait les champs nécessaires en essayant
TOUS les chemins possibles (format résolu, format imbriqué, format plat).

POST /api/{tenant}/import/batch
"""
import uuid
import re
import logging
from datetime import datetime, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
)
from utils.address_utils import normalize_address, extract_civic_number, is_same_address

router = APIRouter(tags=["Import Batch"])
logger = logging.getLogger(__name__)


def deep_get(obj: dict, *paths, default="") -> Any:
    """
    Essaie plusieurs chemins dans un dict imbriqué. Retourne la première valeur trouvée.
    Supporte la notation avec points: "a.b.c" → obj["a"]["b"]["c"]
    Supporte les listes: retourne le premier élément trouvé.
    """
    for path in paths:
        parts = path.split(".")
        current = obj
        found = True
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
                if current is None:
                    found = False
                    break
            elif isinstance(current, list):
                # Chercher dans le premier élément de la liste
                if current and isinstance(current[0], dict):
                    current = current[0].get(part)
                    if current is None:
                        found = False
                        break
                else:
                    found = False
                    break
            else:
                found = False
                break
        if found and current is not None and current != "" and not isinstance(current, (dict, list)):
            return current
        # Si c'est un dict ou list non-vide, le retourner aussi
        if found and current is not None and isinstance(current, (dict, list)) and current:
            return current
    return default


def deep_get_list(obj: dict, *paths) -> list:
    """Essaie plusieurs chemins et retourne une liste."""
    for path in paths:
        result = deep_get(obj, path, default=None)
        if isinstance(result, list) and result:
            return result
        if isinstance(result, dict) and result:
            return [result]  # Single item → wrap in list
    return []


# Cache bâtiments par tenant (évite de recharger à chaque requête)
_batiments_cache = {}
_cache_timestamp = {}
CACHE_TTL = 60  # secondes


async def _get_batiments_cached(tenant_id: str) -> list:
    """Charge les bâtiments avec cache de 60s."""
    now = datetime.now(timezone.utc).timestamp()
    if tenant_id in _batiments_cache and (now - _cache_timestamp.get(tenant_id, 0)) < CACHE_TTL:
        return _batiments_cache[tenant_id]
    batiments = await db.batiments.find(
        {"tenant_id": tenant_id, "$or": [{"actif": True}, {"actif": {"$exists": False}}, {"actif": None}]},
        {"_id": 0, "id": 1, "adresse_civique": 1, "ville": 1}
    ).to_list(length=None)
    _batiments_cache[tenant_id] = batiments
    _cache_timestamp[tenant_id] = now
    return batiments


async def _match_address(address: str, city: str, tenant_id: str) -> Optional[str]:
    """Match une adresse vers un batiment_id."""
    if not address:
        return None
    batiments = await _get_batiments_cached(tenant_id)
    for bat in batiments:
        bat_addr = bat.get("adresse_civique", "")
        bat_ville = bat.get("ville", "")
        clean_addr = bat_addr
        if "," in bat_addr:
            parts = bat_addr.split(",")
            clean_addr = ",".join(parts[:-1]).strip()
        match, _ = is_same_address(address, city, clean_addr, bat_ville)
        if match:
            return bat["id"]
    return None


def _extract_address_city(record: dict) -> tuple:
    """Extrait adresse et ville d'un record (plusieurs formats possibles)."""
    addr = record.get("dossier_adresse") or record.get("adresse") or record.get("adresse_appel") or ""
    # Sécuriser si addr est un objet PremLigne
    if isinstance(addr, dict):
        addr = _safe_address_str(addr)
    city = record.get("ville") or record.get("municipalite") or ""
    if isinstance(city, dict):
        city = ""
    if not city and "," in addr:
        parts = addr.split(",")
        city = parts[-1].strip().lstrip("*").strip()
        addr = ",".join(parts[:-1]).strip()
    # Reconstituer depuis les composants si disponibles
    if not addr and record.get("numero_civique"):
        parts = [record.get("numero_civique", "")]
        if record.get("type_rue"):
            parts.append(record["type_rue"])
        if record.get("rue"):
            parts.append(record["rue"])
        addr = " ".join(p for p in parts if p)
    return addr, city


def _get_ext_id(record: dict) -> str:
    """Extrait l'identifiant unique du record."""
    return str(
        record.get("num_activite")
        or record.get("external_call_id")
        or record.get("id")
        or ""
    )


def _get_file_refs(record: dict) -> list:
    """Extrait les références de fichiers d'un record."""
    refs = []
    for key in ("photo_saisie", "photos", "pieces_jointes"):
        val = record.get(key)
        if isinstance(val, dict) and "photos" in val:
            refs.extend(val["photos"])
        elif isinstance(val, list):
            refs.extend(val)
    return refs


def _get_premligne_id(record: dict) -> str:
    """Extrait l'ID PremLigne d'origine pour audit/traçabilité."""
    attrs = record.get("@attributes", {})
    if isinstance(attrs, dict):
        return str(attrs.get("id", ""))
    return ""


def _get_duplicate_match_field(entity_type: str) -> str:
    """Retourne le champ utilisé pour la détection de doublons."""
    match_fields = {
        "Intervention": "num_activite",
        "DossierAdresse": "adresse_civique+ville",
        "Prevention": "num_activite",
        "RCCI": "num_activite",
        "Employe": "matricule",
        "BorneIncendie": "nom",
        "BorneSeche": "nom",
        "PointEau": "nom",
        "MaintenanceBorne": "num_activite",
        "Travail": "num_activite",
        "PlanIntervention": "num_activite",
        "Vehicule": "numero",
        "EquipExist": "numero_serie",
        "MaintEquip": "num_activite",
    }
    return match_fields.get(entity_type, "nom")


def _parse_bool(value) -> Optional[bool]:
    """Convertit Oui/Non PremLigne en booléen."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    if s in ("oui", "true", "1", "yes"):
        return True
    if s in ("non", "false", "0", "no"):
        return False
    return None


def _parse_float(value) -> Optional[float]:
    """Parse un nombre avec unité potentielle (ex: '650 GPM')."""
    if value is None or value == "":
        return None
    try:
        return float(str(value).split(" ")[0].replace(",", ".").replace(" ", ""))
    except (ValueError, TypeError):
        return None


def _parse_int(value) -> Optional[int]:
    """Parse un entier depuis un string PremLigne."""
    if value is None or value == "" or value == "-1":
        return None
    try:
        return int(float(str(value).replace(" ", "")))
    except (ValueError, TypeError):
        return None


def _safe_address_str(value) -> str:
    """
    Convertit une adresse PremLigne en string propre.
    PremLigne peut envoyer un objet {adresse: {no_civ, type_rue, rue, ville}} au lieu d'un string.
    """
    if not value:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        # Format PremLigne: {adresse: {no_civ, type_rue, rue, ville}}
        inner = value.get("adresse", value)
        if isinstance(inner, dict):
            parts = [
                str(inner.get("no_civ", "") or ""),
                str(inner.get("type_rue", "") or ""),
                str(inner.get("rue", "") or ""),
            ]
            addr = " ".join(p for p in parts if p).strip()
            ville = str(inner.get("ville", "") or "")
            if addr and ville:
                return f"{addr}, {ville}"
            return addr or ville
        return str(inner)
    return str(value)


@router.post("/{tenant_slug}/import/batch")
async def import_batch(
    tenant_slug: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """
    Endpoint générique d'import. Route vers le bon handler selon entity_type.
    Stocke le record complet + extrait les champs clés pour l'indexation.
    """
    tenant = await get_tenant_from_slug(tenant_slug)

    entity_type = body.get("entity_type", "")
    source_system = body.get("source_system", "PremLigne")
    record = body.get("record")

    if not record:
        raise HTTPException(status_code=400, detail="Champ 'record' manquant")
    if not entity_type:
        raise HTTPException(status_code=400, detail="Champ 'entity_type' manquant")

    # Entités principales (stockage dédié)
    main_handlers = {
        "Intervention": _handle_intervention,
        "DossierAdresse": _handle_dossier_adresse,
        "Prevention": _handle_prevention,
        "RCCI": _handle_rcci,
        "PlanIntervention": _handle_plan_intervention,
        "Employe": _handle_employe,
        "BorneIncendie": _handle_borne_incendie,
        "BorneSeche": _handle_borne_seche,
        "PointEau": _handle_point_eau,
        "MaintenanceBorne": _handle_maintenance_borne,
        "Travail": _handle_travail,
        "Vehicule": _handle_vehicule,
        "EquipExist": _handle_equip_exist,
        "MaintEquip": _handle_maint_equip,
    }

    # Référentiels (petites tables — stockage générique)
    referentiels = {
        "Caserne", "Grade", "Equipe", "Groupe", "CodeAppel",
        "TypePrevention", "TypeBatiment", "TypeEquipement",
        "TypeChauffage", "TypeToit", "Parement", "Plancher",
        "TypeAnomalie", "TypeMaint",
        "ModeleBorne", "TypeValve", "UsageBorne", "Raccord",
        "Classification", "ReferenceCode",
        "Fournisseur", "Programme", "Cours", "TypeChampPerso",
    }

    handler = main_handlers.get(entity_type)
    if handler:
        return await handler(record, tenant, current_user, source_system)
    elif entity_type in referentiels:
        return await _handle_referentiel(entity_type, record, tenant, current_user, source_system)
    else:
        raise HTTPException(
            status_code=400,
            detail=f"entity_type '{entity_type}' non supporté. Types: {', '.join(list(main_handlers.keys()) + sorted(referentiels))}"
        )


@router.delete("/{tenant_slug}/import/purge-history")
async def purge_import_history(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """Supprime toutes les interventions importées (history_import) pour recommencer un import propre."""
    tenant = await get_tenant_from_slug(tenant_slug)
    result = await db.interventions.delete_many({"tenant_id": tenant.id, "import_source": "history_import"})
    # Nettoyer aussi les sessions et données temporaires
    await db.upload_sessions.delete_many({"tenant_id": tenant.id})
    await db.upload_chunks.delete_many({"upload_id": {"$exists": True}})
    await db.import_tasks.delete_many({"tenant_id": tenant.id})
    await db.import_task_data.delete_many({})
    await db.import_dossier_adresses.delete_many({"tenant_id": tenant.id})
    return {"deleted": result.deleted_count, "message": f"{result.deleted_count} intervention(s) importée(s) supprimée(s)"}


@router.post("/{tenant_slug}/import/fix-object-fields")
async def fix_object_fields(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Corrige les champs 'adresse' qui sont des objets au lieu de strings.
    À appeler après un import PFM Transfer pour nettoyer les données.
    Scanne: batiments, points_eau, interventions, inspections.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    fixed = 0

    # Collections à scanner
    collections_fields = [
        ("batiments", ["adresse", "adresse_civique"]),
        ("points_eau", ["adresse"]),
        ("interventions", ["address_full", "municipality"]),
        ("inspections", ["adresse"]),
        ("imported_personnel", ["adresse", "adresse_rue"]),
    ]

    for coll_name, fields in collections_fields:
        for field in fields:
            # Trouver les docs où le champ est un objet (pas un string)
            cursor = db[coll_name].find(
                {"tenant_id": tenant.id, field: {"$type": "object"}},
                {"_id": 0, "id": 1, field: 1}
            )
            async for doc in cursor:
                raw_val = doc.get(field)
                fixed_val = _safe_address_str(raw_val)
                await db[coll_name].update_one(
                    {"tenant_id": tenant.id, "id": doc["id"]},
                    {"$set": {field: fixed_val}}
                )
                fixed += 1
                logger.info(f"[FIX] {coll_name}.{field} id={doc['id']}: {type(raw_val).__name__} → '{fixed_val}'")

    return {"fixed": fixed, "message": f"{fixed} champ(s) objet converti(s) en string"}


# ======================== GESTION DES DOUBLONS ========================

async def _queue_duplicate(tenant_id: str, entity_type: str, collection: str,
                           existing_id: str, new_record: dict, user_id: str) -> dict:
    """
    Détecte un doublon. Retourne status=duplicate avec l'id existant.
    PFM Transfer utilise cet id pour uploader les fichiers sur le record existant.
    Met aussi le doublon en file d'attente pour résolution manuelle si nécessaire.
    """
    dup_id = str(uuid.uuid4())
    await db.import_duplicates.insert_one({
        "id": dup_id,
        "tenant_id": tenant_id,
        "entity_type": entity_type,
        "collection": collection,
        "existing_id": existing_id,
        "new_record": new_record,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user_id,
    })
    return {
        "status": "duplicate",
        "entity_type": entity_type,
        "id": existing_id,
        "duplicate_match": _get_duplicate_match_field(entity_type),
    }


@router.get("/{tenant_slug}/import/duplicates")
async def list_duplicates(
    tenant_slug: str,
    entity_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
):
    """Liste les doublons en attente de résolution."""
    tenant = await get_tenant_from_slug(tenant_slug)
    query = {"tenant_id": tenant.id, "status": "pending"}
    if entity_type:
        query["entity_type"] = entity_type

    total = await db.import_duplicates.count_documents(query)
    duplicates = await db.import_duplicates.find(
        query, {"_id": 0}
    ).sort("created_at", -1).skip(offset).limit(limit).to_list(limit)

    # Enrichir chaque doublon avec les données existantes
    for dup in duplicates:
        existing = await db[dup["collection"]].find_one(
            {"tenant_id": tenant.id, "id": dup["existing_id"]},
            {"_id": 0, "pfm_record": 0}
        )
        dup["existing_data"] = existing or {}

    return {"duplicates": duplicates, "total": total}


@router.post("/{tenant_slug}/import/duplicates/{duplicate_id}/resolve")
async def resolve_duplicate(
    tenant_slug: str,
    duplicate_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """
    Résoudre un doublon.
    action: "merge" | "replace" | "ignore"
    - merge: garde l'existant, ajoute les champs manquants du nouveau
    - replace: remplace l'existant par le nouveau
    - ignore: supprime le doublon sans modification
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    action = body.get("action")
    if action not in ("merge", "replace", "ignore"):
        raise HTTPException(status_code=400, detail="Action invalide. Utiliser: merge, replace, ignore")

    dup = await db.import_duplicates.find_one(
        {"id": duplicate_id, "tenant_id": tenant.id, "status": "pending"},
        {"_id": 0}
    )
    if not dup:
        raise HTTPException(status_code=404, detail="Doublon non trouvé")

    collection = dup["collection"]
    existing_id = dup["existing_id"]
    new_record = dup["new_record"]

    result_msg = ""

    if action == "ignore":
        result_msg = "Doublon ignoré"

    elif action == "replace":
        # Extraire les champs du nouveau record
        if dup["entity_type"] == "Intervention":
            fields = _extract_intervention_fields(new_record)
            fields["pfm_record"] = new_record
            fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        else:
            fields = {"pfm_record": new_record, "updated_at": datetime.now(timezone.utc).isoformat()}

        await db[collection].update_one(
            {"tenant_id": tenant.id, "id": existing_id},
            {"$set": fields}
        )
        result_msg = "Existant remplacé par le nouveau"

    elif action == "merge":
        # Fusionner : garder les champs existants, ajouter les nouveaux si absents
        existing = await db[collection].find_one(
            {"tenant_id": tenant.id, "id": existing_id},
            {"_id": 0}
        )
        if existing:
            if dup["entity_type"] == "Intervention":
                new_fields = _extract_intervention_fields(new_record)
            else:
                new_fields = {}

            merged = {}
            for key, val in new_fields.items():
                existing_val = existing.get(key)
                if val and (not existing_val or existing_val in ("", [], None, {}, "-")):
                    merged[key] = val
            # Toujours mettre à jour le pfm_record (dernière version)
            merged["pfm_record"] = new_record
            merged["updated_at"] = datetime.now(timezone.utc).isoformat()

            if merged:
                await db[collection].update_one(
                    {"tenant_id": tenant.id, "id": existing_id},
                    {"$set": merged}
                )
        result_msg = "Données fusionnées (anciennes conservées, nouvelles ajoutées si manquantes)"

    # Marquer le doublon comme résolu
    await db.import_duplicates.update_one(
        {"id": duplicate_id},
        {"$set": {"status": action, "resolved_at": datetime.now(timezone.utc).isoformat(), "resolved_by": current_user.id}}
    )

    return {"status": "resolved", "action": action, "message": result_msg}


@router.post("/{tenant_slug}/import/duplicates/resolve-all")
async def resolve_all_duplicates(
    tenant_slug: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Résoudre tous les doublons en attente avec la même action."""
    tenant = await get_tenant_from_slug(tenant_slug)
    action = body.get("action")
    if action not in ("merge", "replace", "ignore"):
        raise HTTPException(status_code=400, detail="Action invalide")

    pending = await db.import_duplicates.find(
        {"tenant_id": tenant.id, "status": "pending"}, {"_id": 0}
    ).to_list(length=None)

    resolved = 0
    for dup in pending:
        # Réutiliser la logique de résolution individuelle
        fake_body = {"action": action}
        try:
            await resolve_duplicate(tenant_slug, dup["id"], fake_body, current_user)
            resolved += 1
        except Exception:
            pass

    return {"resolved": resolved, "total": len(pending), "action": action}


# Table des codes d'intervention CAUCA
CAUCA_CODES = {
    "1": "Administration",
    "2": "Urgence municipale",
    "3": "Inondation",
    "5": "Mesures d'urgence",
    "10": "Alarme incendie",
    "11": "Alarme gaz",
    "12": "Véhicule motorisé & ferroviaire",
    "13": "Entraide",
    "15": "Assistance",
    "16": "Couverture caserne",
    "21": "Cheminée",
    "25": "RCCI",
    "30": "Déversement",
    "31": "Vérification",
    "32": "Débris, déchets",
    "33": "Fuite de gaz",
    "40": "Installation électrique",
    "50": "Forêt ou herbes",
    "80": "Bâtiment",
    "90": "Sauvetage",
    "91": "Écrasement d'aéronef",
    "92": "Sauvetage nautique",
    "93": "Incident ferroviaire",
    "95": "Intervention ascenseur",
    "97": "Sauvetage hors-route",
    "98": "Désincarcération",
    "99": "Alerte à la bombe",
    "105": "Accident de la route",
    "110": "Premiers répondants",
    "111": "Programme PAIR",
    "120": "PIABS",
    "130": "Entraide automatique",
    "140": "Installation électrique (AM)",
    "156": "Assistance désincarcération",
    "164": "Assistance hors-route",
    "888": "Couverture d'événements",
    "999": "Pratique / exercice",
}


@router.get("/{tenant_slug}/import/cauca-codes")
async def get_cauca_codes(tenant_slug: str):
    """Retourne la table des codes d'intervention CAUCA."""
    return {"codes": [{"code": k, "description": v} for k, v in CAUCA_CODES.items()]}




@router.post("/{tenant_slug}/import/fix-existing-interventions")
async def fix_existing_interventions(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Corrige les interventions déjà importées en re-extrayant les champs depuis pfm_record.
    Gère les deux formats : PremLigne brut (chronologie.appel, lieu_interv.desc_lieu)
    et PremLigne résolu (id_code_appel, id_dossier_adresse).
    """
    tenant = await get_tenant_from_slug(tenant_slug)

    cursor = db.interventions.find(
        {"tenant_id": tenant.id, "import_source": "history_import", "pfm_record": {"$exists": True, "$ne": None}},
        {"_id": 0}
    )

    fixed = 0
    async for doc in cursor:
        record = doc.get("pfm_record", {})
        if not record:
            continue

        update = _extract_intervention_fields(record)

        # Garder les valeurs existantes si l'extraction est vide
        for key, val in update.items():
            if not val and doc.get(key):
                update[key] = doc[key]

        # Auto-match bâtiment si pas encore fait
        if not doc.get("batiment_id") and update.get("address_full"):
            bat_id = await _match_address(update["address_full"], update.get("municipality", ""), tenant.id)
            if bat_id:
                update["batiment_id"] = bat_id
                update["match_method"] = "auto_address"

        await db.interventions.update_one(
            {"tenant_id": tenant.id, "id": doc["id"]},
            {"$set": update}
        )
        fixed += 1

    return {"fixed": fixed, "message": f"{fixed} intervention(s) corrigée(s)"}


def _extract_intervention_fields(record: dict) -> dict:
    """
    Extraction complète des champs d'une intervention PremLigne.
    Essaie tous les chemins possibles (résolu, imbriqué profond, plat).
    Basé sur MAPPING_PFM_TRANSFER.md.
    """
    r = record

    # === ADRESSE ===
    addr = deep_get(r, "id_dossier_adresse", "dossier_adresse")
    city = ""
    if not addr:
        raw_lieu = deep_get(r, "lieu_interv.desc_lieu", "lieu_interv.interv_lieu_interv.desc_lieu", "adresse")
        if raw_lieu:
            addr = str(raw_lieu).lstrip("de ").strip()
        city = deep_get(r, "lieu_interv.ville", "lieu_interv.interv_lieu_interv.ville", "ville", "municipalite")
    if not city and addr and "," in str(addr):
        parts = str(addr).split(",")
        city = parts[-1].strip().lstrip("*").strip()
        addr = ",".join(parts[:-1]).strip()

    # === TYPE / NATURE / CODE FEU ===
    type_intv = deep_get(r, "id_code_appel", "code_appel", "type_intervention", "nature")
    code_feu = ""
    if type_intv:
        parts = str(type_intv).split(" - ", 1)
        if len(parts) >= 1 and parts[0].strip().replace("-", "").isdigit():
            code_feu = parts[0].strip()
    if not code_feu:
        code_feu = deep_get(r, "code_feu")

    # === CHRONOLOGIE (essayer tous les formats) ===
    date_appel = deep_get(r,
        "chronologie.interv_chronologie.appel",
        "chronologie.appel",
        "carte_appel.carte_appel.heure_appel",
        "carte_appel.heure_appel",
        "date_activite", "date_ident")
    date_alerte = deep_get(r,
        "chronologie.interv_chronologie.transmission",
        "chronologie.transmission",
        "carte_appel.carte_appel.heure_alerte",
        "carte_appel.heure_alerte")
    date_depart = deep_get(r,
        "chronologie.interv_chronologie.depart_premier_veh",
        "chronologie.interv_chronologie.depart_caserne",
        "chronologie.depart_caserne",
        "chronologie.depart",
        "carte_appel.carte_appel.heure_depart",
        "carte_appel.heure_depart")
    date_arrivee = deep_get(r,
        "chronologie.interv_chronologie.arrivee_prem_vehicule",
        "chronologie.arrivee_prem_vehicule",
        "carte_appel.carte_appel.heure_arrivee",
        "carte_appel.heure_arrivee")
    date_force_frappe = deep_get(r,
        "chronologie.interv_chronologie.arrivee_force_frappe",
        "chronologie.arrivee_force_frappe")
    date_maitrise = deep_get(r,
        "chronologie.interv_chronologie.maitrise",
        "chronologie.interv_chronologie.sous_controle",
        "chronologie.maitrise",
        "chronologie.sous_controle")
    date_retour = deep_get(r,
        "chronologie.interv_chronologie.retour",
        "chronologie.retour",
        "carte_appel.carte_appel.heure_retour",
        "carte_appel.heure_retour")
    date_fin = deep_get(r,
        "chronologie.interv_chronologie.fin_interv",
        "chronologie.interv_chronologie.retour",
        "chronologie.fin_intervention",
        "chronologie.disponible",
        "carte_appel.carte_appel.heure_disp_caserne",
        "carte_appel.heure_disp_caserne")

    # === OFFICIER / AUTEUR ===
    officier = deep_get(r, "id_responsable", "responsable", "id_auteur", "auteur")

    # === CASERNE ===
    caserne = deep_get(r, "id_caserne", "caserne")

    # === NOTES / NARRATIF ===
    notes = deep_get(r,
        "compte_rendu.interv_compte_rendu.description",
        "compte_rendu.description",
        "compte_rendu.interv_compte_rendu._summary",
        "notes", "narratif", "description")

    # === APPELANT (essayer carte_appel puis parser des notes) ===
    caller_name = deep_get(r,
        "carte_appel.carte_appel.appelant_de",
        "carte_appel.carte_appel.nomDe",
        "carte_appel.nom_demandeur",
        "carte_appel.de_qui")
    caller_phone = deep_get(r,
        "carte_appel.carte_appel.telDe",
        "carte_appel.tel_demandeur",
        "carte_appel.tel_de_qui")
    caller_pour = deep_get(r,
        "carte_appel.carte_appel.appelant_pour",
        "carte_appel.carte_appel.nomPour")
    caller_phone_pour = deep_get(r,
        "carte_appel.carte_appel.telPour")

    # Parser depuis les notes si pas trouvé
    if notes and not caller_name:
        m = re.search(r"Nom du demandeur\s*:\s*(.+?)(?=\s*Tel du demandeur|\s*Adresse du demandeur|\s*-{3,}|\s*$)", str(notes))
        if m:
            caller_name = m.group(1).strip()
    if notes and not caller_phone:
        m = re.search(r"Tel du demandeur\s*:\s*(\S+)", str(notes))
        if m:
            caller_phone = m.group(1).strip()

    # === JOURNAL DES COMMUNICATIONS ===
    # Parser les lignes horodatées depuis les notes
    xml_comments = []
    clean_notes = str(notes) if notes else ""
    if clean_notes:
        comm_lines = re.findall(
            r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\s+(.+?)(?=\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|$)',
            clean_notes, re.DOTALL
        )
        if comm_lines:
            for timestamp, detail in comm_lines:
                detail_clean = detail.strip().rstrip("( ")
                # Filtrer les lignes qui sont des en-têtes, pas des communications
                if (detail_clean and len(detail_clean) > 5
                    and not detail_clean.startswith("Heure ")
                    and not detail_clean.startswith("Notes:")
                    and not detail_clean.startswith("---")):
                    xml_comments.append({
                        "timestamp": timestamp.replace("T", " "),
                        "detail": detail_clean,
                    })

    # === VÉHICULES ===
    vehicules = []
    equipes_raw = deep_get_list(r,
        "intervenant.interv_intervenant.vect_interv_equipe.interv_interv_equipe",
        "intervenant.vect_interv_equipe.interv_interv_equipe",
        "interv_interv_equipe",
        "vehicules", "ressources")
    for v in equipes_raw:
        if isinstance(v, dict):
            vehicules.append({
                "numero": v.get("id_vehicule") or v.get("vehicule") or v.get("nom") or v.get("numero") or "",
                "heure_appel": v.get("heure_appel") or "",
                "heure_en_route": v.get("heure_en_route") or "",
                "heure_lieu": v.get("heure_lieu") or "",
                "heure_retour": v.get("heure_retour") or "",
                "heure_disp_caserne": v.get("heure_disp_caserne") or "",
                "nb_intervenants": v.get("nbr_interv_dans_veh") or v.get("nb_pompier") or "",
            })

    # === PERSONNEL ===
    personnel = []
    employes_raw = deep_get_list(r,
        "intervenant.interv_intervenant.info_interv_employe.info_histo_employe.vect_info_employe.interv_interv_employe",
        "intervenant.interv_intervenant.info_interv_employe.info_employe",
        "intervenant.info_interv_employe.info_employe",
        "intervenant.info_interv_employe")
    for emp in employes_raw:
        if isinstance(emp, dict) and (emp.get("id_employe") or emp.get("nom")):
            personnel.append({
                "nom": emp.get("id_employe") or f"{emp.get('prenom', '')} {emp.get('nom', '')}".strip(),
                "vehicule": emp.get("id_vehicule") or "",
                "date_debut": emp.get("date_partiel_debut") or "",
                "date_fin": emp.get("date_partiel_fin") or "",
                "heure_depart": emp.get("heure_depart") or "",
                "presence": emp.get("presence") or "",
                "libere": emp.get("libere") or "",
            })

    # === PERTES ===
    perte_batiment = deep_get(r,
        "desc_batiment.interv_desc_batiment.perte.interv_perte.perte_batiment",
        "desc_batiment.perte.perte_batiment")
    perte_contenu = deep_get(r,
        "desc_batiment.interv_desc_batiment.perte.interv_perte.perte_contenu",
        "desc_batiment.perte.perte_contenu")
    perte_ext = deep_get(r, "feu_exterieur.perte", "feu_exterieur.interv_feu_exterieur.perte")

    # === CAUSE INCENDIE ===
    # === CAUSE INCENDIE / RCCI (chemins profonds) ===
    cause_data = deep_get(r, "cause_incendie.interv_cause_incendie", "cause_incendie", default={})
    if not isinstance(cause_data, dict):
        cause_data = {}
    
    cause_probable = cause_data.get("cause_probable") or deep_get(r, "cause_incendie.id_cause_probable") or ""
    source_chaleur = cause_data.get("source_chaleur") or cause_data.get("id_source_chaleur") or ""
    lieu_origine = cause_data.get("lieu_origine") or ""
    combustible = cause_data.get("combustible") or ""
    prem_mat = cause_data.get("prem_mat_enflamme") or ""
    ampleur = cause_data.get("ampleur_incendie") or ""
    propagation = cause_data.get("propagation") or ""
    dommage_rcci = cause_data.get("dommage") or ""
    mode_inflammation = cause_data.get("id_mode_inflammation") or ""
    energie = cause_data.get("id_energie") or ""

    # === RESSOURCES EXTERNES ===
    ressources_ext = []
    ress_raw = deep_get_list(r,
        "intervenant.interv_intervenant.vect_interv_ressource.interv_interv_ressource")
    for res in ress_raw:
        if isinstance(res, dict):
            ressources_ext.append({
                "id_ressource": res.get("id_ressource") or "",
                "heure_appel": res.get("heure_appel") or "",
                "heure_arrivee": res.get("heure_arrivee") or "",
                "heure_travail_fait": res.get("heure_travail_fait") or "",
            })

    # === MATÉRIEL UTILISÉ ===
    materiel_utilise = []
    mat_raw = deep_get_list(r,
        "equipement.interv_equipement.vect_interv_materiel.interv_materiel",
        "equipement.vect_interv_materiel.interv_materiel")
    for mat in mat_raw:
        if isinstance(mat, dict):
            materiel_utilise.append({
                "id": mat.get("id_type_equipement") or "",
                "nom": mat.get("id_type_equipement") or "",
                "quantite": mat.get("quantite") or "1",
                "imported": True,
            })

    # === REMISE DE PROPRIÉTÉ ===
    remise_prop = {}
    rp = deep_get(r, "remise_prop.interv_remise_prop", "remise_prop", default={})
    if isinstance(rp, dict) and (rp.get("date_libere") or rp.get("remis_a")):
        remise_prop = {
            "date_libere": rp.get("date_libere") or "",
            "remis_a": rp.get("remis_a") or "",
            "fichier_ref": rp.get("id_fichier") or "",
        }

    # === RÉPONDANT ===
    repondant = {}
    rep = deep_get(r, "repondant.interv_repondant", "repondant", default={})
    if isinstance(rep, dict) and (rep.get("nom") or rep.get("telephone")):
        rep_addr = rep.get("adresse", {})
        if isinstance(rep_addr, dict) and "adresse" in rep_addr:
            rep_addr = rep_addr["adresse"]
        repondant = {
            "nom": rep.get("nom") or "",
            "adresse_differente": rep.get("adresse_differente") or "",
            "adresse": rep_addr.get("rue", "") if isinstance(rep_addr, dict) else "",
            "ville": rep_addr.get("ville", "") if isinstance(rep_addr, dict) else "",
            "telephone": rep_addr.get("telephone", "") if isinstance(rep_addr, dict) else "",
            "tel_autre": rep_addr.get("tel_autre", "") if isinstance(rep_addr, dict) else "",
        }

    # === VIE HUMAINE / SAUVETAGE ===
    nbr_sauvetage = deep_get(r,
        "vie_humaine.interv_vie_humaine.vect_interv_sauvetage.interv_sauvetage.nbr_sauvetage",
        "vie_humaine.nbr_sauvetage", default="0")
    nbr_evacuation = deep_get(r,
        "vie_humaine.interv_vie_humaine.vect_interv_sauvetage.interv_sauvetage.nbr_evacuation",
        "vie_humaine.nbr_evacuation", default="0")
    adresse_sauvetage = deep_get(r,
        "vie_humaine.interv_vie_humaine.vect_interv_sauvetage.interv_sauvetage.id_dossier_adresse")

    # === ENQUÊTE ===
    enquete_police = deep_get(r,
        "enquete.interv_enquete.dossier_transmis_police",
        "enquete.dossier_transmis_police")
    enquete_date = deep_get(r,
        "enquete.interv_enquete.date_remis",
        "enquete.date_remis")
    enquete_num_dossier = deep_get(r,
        "enquete.interv_enquete.num_dossier_police",
        "enquete.num_dossier_police")

    # === PROTECTION INCENDIE ===
    prot = deep_get(r,
        "desc_batiment.interv_desc_batiment.protection.interv_protection",
        "desc_batiment.protection.interv_protection",
        "desc_batiment.protection", default={})
    if not isinstance(prot, dict):
        prot = {}
    # Codes PremLigne: 11=Oui+Fonctionnel, 88=Non, 99=Indéterminé
    def _prot_presence(val):
        if val in ("11", "88", "99"):
            return "yes" if val == "11" else "no" if val == "88" else ""
        return ""
    def _prot_functional(val):
        return "worked" if val == "11" else "not_worked" if val == "88" else ""
    avert = prot.get("id_avert_fonctionne", "")
    extinc = prot.get("id_extinction_fonctionne", "")
    alarme = prot.get("id_syst_alarme_fonctionne", "")



    # === DSI / Sinistre (propriétaire, assurance) ===
    rep_data = deep_get(r, "repondant.interv_repondant", "repondant", default={})
    if not isinstance(rep_data, dict):
        rep_data = {}
    rep_addr = rep_data.get("adresse", {})
    if isinstance(rep_addr, dict) and "adresse" in rep_addr:
        rep_addr = rep_addr["adresse"]
    if not isinstance(rep_addr, dict):
        rep_addr = {}

    owner_name = rep_data.get("nom") or ""
    owner_phone = rep_addr.get("telephone") or ""
    owner_address = ""
    if rep_addr.get("rue"):
        owner_address = f"{rep_addr.get('no_civique', '')} {rep_addr.get('rue', '')}, {rep_addr.get('ville', '')}".strip().strip(",").strip()

    # Assurance depuis les pertes
    perte_data = deep_get(r,
        "desc_batiment.interv_desc_batiment.perte.interv_perte",
        "desc_batiment.perte", default={})
    if not isinstance(perte_data, dict):
        perte_data = {}
    id_assurance = perte_data.get("id_assurance", "")
    # Code PremLigne: 1=Oui, 0=Non, 2=Indéterminé
    has_insurance = "yes" if id_assurance == "1" else "no" if id_assurance == "0" else ""

    # === PRÉVENTION (sur intervention) ===
    prev_dossier_remis = deep_get(r, "prevention.interv_prevention.dossier_remis")
    prev_avis_emis = deep_get(r, "prevention.interv_prevention.avis_emis")
    prev_type_avis = deep_get(r, "prevention.interv_prevention.type_avis")

    # === TEMPÉRATURE ===
    temperature = deep_get(r, "temperature.interv_temperature.temperature")
    velocite_vent = deep_get(r, "temperature.interv_temperature.velocite")

    # === COÛT TOTAL (nettoyer le emoji 📎) ===
    cout_raw = deep_get(r, "cout_total") or ""
    cout_total = str(cout_raw).replace("📎", "").strip() if cout_raw else ""

    # === PERTES INDIRECTES / EXTÉRIEURES (chemins profonds) ===
    perte_ext_deep = deep_get(r,
        "interv_feu_exterieur.interv_feu_exterieur.perte",
        "feu_exterieur.perte")
    perte_indirecte = deep_get(r,
        "interv_perte_indirecte.interv_perte_indirecte.perte",
        "perte_indirecte.perte")

    return {
        "address_full": str(addr) if addr else "",
        "municipality": str(city) if city else "",
        "type_intervention": str(type_intv) if type_intv else "",
        "code_feu": str(code_feu) if code_feu else "",
        "code_appel_initial": deep_get(r, "id_code_appel_initial") or "",
        "no_appel": deep_get(r, "carte_appel.carte_appel.no_appel") or "",
        "officer_in_charge_xml": str(officier) if officier else "",
        "caserne": str(caserne) if caserne else "",
        "notes": str(notes) if notes else "",
        "caller_name": str(caller_name) if caller_name else "",
        "caller_phone": str(caller_phone) if caller_phone else "",
        "caller_pour": str(caller_pour) if caller_pour else "",
        "caller_phone_pour": str(caller_phone_pour) if caller_phone_pour else "",
        "vehicules": vehicules,
        "personnel": personnel,
        "ressources_externes": ressources_ext,
        "materiel_utilise": materiel_utilise,
        "remise_propriete": remise_prop,
        "repondant": repondant,
        "xml_comments": xml_comments,
        # Chronologie
        "xml_time_call_received": str(date_appel) if date_appel else "",
        "xml_time_dispatch": str(date_alerte) if date_alerte else "",
        "xml_time_en_route": str(date_depart) if date_depart else "",
        "xml_time_arrival_1st": str(date_arrivee) if date_arrivee else "",
        "xml_time_force_frappe": str(date_force_frappe) if date_force_frappe else "",
        "xml_time_under_control": str(date_maitrise) if date_maitrise else "",
        "xml_time_1022": str(date_retour) if date_retour else "",
        "xml_time_terminated": str(date_fin) if date_fin else "",
        "moyen_transmission": deep_get(r, "chronologie.interv_chronologie.moyen_trans", "chronologie.moyen_trans") or "",
        "annule": deep_get(r, "chronologie.interv_chronologie.annule") or "",
        # Statut
        "statut_premligne": deep_get(r, "statut") or "",
        "date_completee": deep_get(r, "date_completee") or "",
        # Pertes — noms conformes au frontend PFM
        "estimated_loss_building": str(perte_batiment) if perte_batiment else "",
        "estimated_loss_content": str(perte_contenu) if perte_contenu else "",
        "perte_exterieur": str(perte_ext_deep or perte_ext) if (perte_ext_deep or perte_ext) else "",
        "perte_indirecte": str(perte_indirecte) if perte_indirecte else "",
        "cout_total": cout_total,
        # RCCI / Cause incendie — noms conformes au frontend PFM
        "probable_cause": str(cause_probable) if cause_probable else "",
        "ignition_source": str(source_chaleur) if source_chaleur else "",
        "origin_area": str(lieu_origine) if lieu_origine else "",
        "material_first_ignited": str(prem_mat) if prem_mat else "",
        "fire_combustible": str(combustible) if combustible else "",
        "fire_extent": str(ampleur) if ampleur else "",
        "fire_propagation": str(propagation) if propagation else "",
        "fire_dommage": str(dommage_rcci) if dommage_rcci else "",
        "fire_mode_inflammation": str(mode_inflammation) if mode_inflammation else "",
        "fire_energie": str(energie) if energie else "",
        # Vie humaine
        "nbr_sauvetage": str(nbr_sauvetage) if nbr_sauvetage and nbr_sauvetage != "0" else "",
        "nbr_evacuation": str(nbr_evacuation) if nbr_evacuation and nbr_evacuation != "0" else "",
        "adresse_sauvetage": str(adresse_sauvetage) if adresse_sauvetage else "",
        # Enquête
        "enquete_police": str(enquete_police) if enquete_police else "",
        "enquete_date": str(enquete_date) if enquete_date else "",
        "enquete_num_dossier": str(enquete_num_dossier) if enquete_num_dossier else "",
        # Prévention (sur intervention)
        "prevention_dossier_remis": str(prev_dossier_remis) if prev_dossier_remis else "",
        "prevention_avis_emis": str(prev_avis_emis) if prev_avis_emis else "",
        "prevention_type_avis": str(prev_type_avis) if prev_type_avis else "",
        # Météo
        "temperature": str(temperature) if temperature and temperature != "0" else "",
        "velocite_vent": str(velocite_vent) if velocite_vent and velocite_vent != "0" else "",
        # Protection incendie
        "smoke_detector_presence": _prot_presence(avert),
        "smoke_detector_functional": _prot_functional(avert),
        "sprinkler_present": extinc == "11",
        "sprinkler_functional": True if extinc == "11" else False if extinc == "88" else None,
        "alarm_system_presence": _prot_presence(alarme),
        "alarm_system_functional": _prot_functional(alarme),
        # DSI / Sinistre (propriétaire + assurance)
        "owner_name": owner_name,
        "owner_phone": owner_phone,
        "owner_address": owner_address,
        "has_insurance": has_insurance,
    }



# ======================== INTERVENTION ========================

async def _handle_intervention(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'une intervention depuis un record PremLigne."""
    ext_id = _get_ext_id(record)
    premligne_id = _get_premligne_id(record)
    fields = _extract_intervention_fields(record)

    # Log pour debug en production
    key_fields_status = {
        k: bool(v) for k, v in fields.items() 
        if k in ("probable_cause", "smoke_detector_presence", "owner_name", "code_feu", "estimated_loss_building")
    }
    logger.info(f"[IMPORT] Intervention {ext_id}: extraction key fields = {key_fields_status}")

    # Doublon → retourner l'id existant (Transfer uploadera les fichiers dessus)
    if ext_id:
        existing = await db.interventions.find_one(
            {"tenant_id": tenant.id, "external_call_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Intervention", "interventions", existing["id"], record, user.id)

    # FK matching
    matched_fks = {}
    bat_id = await _match_address(fields.get("address_full", ""), fields.get("municipality", ""), tenant.id)
    if bat_id:
        matched_fks["batiment_id"] = bat_id

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "external_call_id": ext_id,
        **fields,
        "status": "signed",
        "import_source": "history_import",
        "source_system": source,
        "pfm_record": record,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "imported_by": user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "audit_log": [{"action": "imported_batch", "by": user.id, "at": datetime.now(timezone.utc).isoformat()}],
        "assigned_reporters": [],
    }

    if bat_id:
        doc["batiment_id"] = bat_id
        doc["match_method"] = "auto_address"

    await db.interventions.insert_one(doc)
    return {"status": "created", "entity_type": "Intervention", "id": doc_id, "batiment_id": bat_id, "matched_fks": matched_fks}


# ======================== DOSSIER ADRESSE (BÂTIMENT) ========================

async def _handle_dossier_adresse(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'un bâtiment depuis un record PremLigne."""
    premligne_id = _get_premligne_id(record)

    # Extraire l'adresse — format Transfer: adresse.adresse.{no_civ, type_rue, rue, ville}
    addr_obj = record.get("adresse", {})
    if isinstance(addr_obj, dict) and "adresse" in addr_obj:
        addr_obj = addr_obj["adresse"]
    if isinstance(addr_obj, dict) and addr_obj.get("no_civ"):
        no_civ = addr_obj.get("no_civ", "")
        type_rue = addr_obj.get("type_rue", "")
        rue = addr_obj.get("rue", "")
        addr = f"{no_civ} {type_rue} {rue}".strip()
        city = addr_obj.get("ville", "")
        code_postal = addr_obj.get("code_post", "") or addr_obj.get("code_postal", "")
    else:
        addr, city = _extract_address_city(record)
        code_postal = record.get("code_postal") or ""

    if not addr:
        return {"status": "error", "entity_type": "DossierAdresse", "message": "Adresse manquante"}

    # Doublon par adresse + ville
    existing = await db.batiments.find_one(
        {"tenant_id": tenant.id, "adresse_civique": addr, "ville": city}, {"_id": 0, "id": 1}
    )
    if existing:
        return await _queue_duplicate(tenant.id, "DossierAdresse", "batiments", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "adresse_civique": addr,
        "ville": city,
        "code_postal": code_postal,
        "province": record.get("province") or "Québec",
        "pays": "Canada",
        "nom_etablissement": record.get("proprietaire_nom") or record.get("prop_nom") or "",
        "nombre_etages": _parse_int(record.get("nombre_etages")),
        "annee_construction": _parse_int(record.get("annee_construction")),
        "nombre_logements": _parse_int(record.get("nombre_logements") or record.get("nbr_logement")),
        "niveau_risque": record.get("categorie_risque") or record.get("id_categ_risque") or "Faible",
        "sous_type_batiment": record.get("type_batiment") or record.get("id_type_batiment") or "",
        "type_chauffage": record.get("id_type_chauffage") or "",
        "type_toit": record.get("id_type_toit") or "",
        "parement": record.get("id_parement") or "",
        "plancher": record.get("id_plancher") or "",
        "notes": record.get("note") or record.get("notes") or "",
        "contact_nom": record.get("proprietaire_nom") or record.get("prop_nom") or "",
        "contact_telephone": record.get("telephone") or "",
        "raison_sociale": record.get("raison_sociale") or "",
        "subdivision": record.get("subdivision") or "",
        # Sous-entités embarquées
        "personnes_ressources": record.get("vect_personne_ress"),
        "produits_dangereux": record.get("vect_prod_dang"),
        "protections": record.get("vect_protection"),
        "champs_personnalises": record.get("vect_champ_perso"),
        "actif": True,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "imported_by": user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user.id,
    }

    await db.batiments.insert_one(doc)

    # Invalider le cache bâtiments
    _batiments_cache.pop(tenant.id, None)

    # Mapping rétroactif
    from routes.import_interventions import auto_link_interventions_to_batiment
    linked = await auto_link_interventions_to_batiment(tenant.id, doc_id, addr, city)

    return {"status": "created", "entity_type": "DossierAdresse", "id": doc_id, "interventions_linked": linked}


# ======================== PREVENTION ========================

async def _handle_prevention(record: dict, tenant, user, source: str) -> dict:
    ext_id = _get_ext_id(record)
    premligne_id = _get_premligne_id(record)
    if ext_id:
        existing = await db.inspections.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Prevention", "inspections", existing["id"], record, user.id)

    addr, city = _extract_address_city(record)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "external_id": ext_id,
        "type_inspection": record.get("type_prev") or record.get("id_type_prev") or "Prévention",
        "adresse": addr,
        "ville": city,
        "date_inspection": record.get("date_activite") or "",
        "date_completee": record.get("date_completee") or "",
        "inspecteur": record.get("id_auteur") or record.get("auteur") or record.get("id_responsable") or "",
        "resultat": record.get("statut") or "",
        "notes": record.get("narratif") or "",
        "anomalies": record.get("liste_anomalie") or record.get("anomalies") or [],
        "avis_emis": _parse_bool(record.get("avis_emission")),
        "texte_avis": record.get("texte_avis") or "",
        "champs_personnalises": record.get("liste_champ_personnalise"),
        "etapes": record.get("liste_etape"),
        "reports": record.get("liste_report"),
        "status": record.get("statut") or "completed",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "imported_by": user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    bat_id = await _match_address(addr, city, tenant.id)
    if bat_id:
        doc["batiment_id"] = bat_id

    await db.inspections.insert_one(doc)
    return {"status": "created", "entity_type": "Prevention", "id": doc_id, "batiment_id": doc.get("batiment_id")}


# ======================== RCCI ========================

async def _handle_rcci(record: dict, tenant, user, source: str) -> dict:
    ext_id = _get_ext_id(record)
    premligne_id = _get_premligne_id(record)
    if ext_id:
        existing = await db.rcci.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "RCCI", "rcci", existing["id"], record, user.id)

    addr, city = _extract_address_city(record)

    # Extraire cause RCCI depuis les sous-sections
    cause = record.get("rci_cause", {}) or record.get("cause_incendie", {}).get("interv_cause_incendie", {}) or {}
    if not isinstance(cause, dict):
        cause = {}

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "external_id": ext_id,
        "adresse": addr,
        "ville": city,
        "date": record.get("date_activite") or "",
        "auteur": record.get("id_auteur") or record.get("auteur") or "",
        "responsable": record.get("id_responsable") or "",
        # Cause RCCI
        "source_chaleur": cause.get("source_chaleur") or "",
        "cause_probable": cause.get("cause_probable") or "",
        "combustible": cause.get("combustible") or "",
        "mode_inflammation": cause.get("mode_inflamation") or cause.get("mode_inflammation") or "",
        "lieu_origine": cause.get("lieu_origine") or "",
        "premier_materiau": cause.get("prem_mat_enflamme") or "",
        "propagation": cause.get("propagation") or "",
        "ampleur_incendie": cause.get("ampleur_incendie") or "",
        "energie": cause.get("energie") or "",
        "dommage": cause.get("dommage") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    bat_id = await _match_address(addr, city, tenant.id)
    if bat_id:
        doc["batiment_id"] = bat_id

    await db.rcci.insert_one(doc)
    return {"status": "created", "entity_type": "RCCI", "id": doc_id}


# ======================== PLAN INTERVENTION ========================

async def _handle_plan_intervention(record: dict, tenant, user, source: str) -> dict:
    ext_id = _get_ext_id(record)
    if ext_id:
        existing = await db.plans_intervention.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "PlanIntervention", "plans_intervention", existing["id"], record, user.id)

    addr, city = _extract_address_city(record)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "external_id": ext_id,
        "adresse": addr,
        "ville": city,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    bat_id = await _match_address(addr, city, tenant.id)
    if bat_id:
        doc["batiment_id"] = bat_id

    await db.plans_intervention.insert_one(doc)
    return {"status": "created", "entity_type": "PlanIntervention", "id": doc_id}


# ======================== EMPLOYE ========================

async def _handle_employe(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'un employé depuis un record PremLigne."""
    matricule = record.get("matricule") or ""
    nom = record.get("nom") or ""
    prenom = record.get("prenom") or ""
    premligne_id = _get_premligne_id(record)

    if matricule:
        existing = await db.imported_personnel.find_one(
            {"tenant_id": tenant.id, "matricule": matricule}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Employe", "imported_personnel", existing["id"], record, user.id)

    # FK matching
    matched_fks = {}
    caserne_label = record.get("id_caserne") or record.get("caserne") or ""
    if caserne_label:
        clean_caserne = str(caserne_label).lstrip("*").strip()
        cas = await db.ref_caserne.find_one(
            {"tenant_id": tenant.id, "nom": {"$regex": f"^{re.escape(clean_caserne)}$", "$options": "i"}},
            {"_id": 0, "id": 1}
        )
        if cas:
            matched_fks["caserne_id"] = cas["id"]

    # Adresse employé (peut être un sous-objet)
    adresse_data = record.get("adresse", {})
    if isinstance(adresse_data, dict) and "adresse" in adresse_data:
        adresse_data = adresse_data["adresse"]
    if not isinstance(adresse_data, dict):
        adresse_data = {}

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "nom": nom,
        "prenom": prenom,
        "matricule": matricule,
        "code_permanent": record.get("code_permanent") or "",
        "email": record.get("couriel") or record.get("courriel") or "",
        "telephone_cellulaire": record.get("cell") or "",
        "telephone_bureau": record.get("tel_bureau") or "",
        "telephone_domicile": record.get("tel_domicile") or "",
        "caserne": caserne_label,
        "type_employe": record.get("type_employe") or "",
        "date_embauche": record.get("date_embauche") or "",
        "date_naissance": record.get("date_nais") or "",
        "actif": record.get("inactif") != "Oui",
        # Documents sensibles
        "nas": record.get("nas") or record.get("NAS") or record.get("numero_assurance_sociale") or "",
        "numero_passeport": record.get("numero_passeport") or record.get("passeport") or "",
        "note": record.get("note") or record.get("notes") or "",
        # Permis de conduire
        "permis_conduire": _parse_bool(record.get("permis_conduire")),
        "permis_classe": record.get("permis_classe") or "",
        "permis_expiration": record.get("permis_expiration") or "",
        # Adresse postale
        "adresse_rue": adresse_data.get("rue") or adresse_data.get("no_civ", "") + " " + adresse_data.get("rue", "") if isinstance(adresse_data, dict) else "",
        "adresse_ville": adresse_data.get("ville") or "" if isinstance(adresse_data, dict) else "",
        "adresse_code_postal": adresse_data.get("code_post") or adresse_data.get("code_postal") or "" if isinstance(adresse_data, dict) else "",
        "adresse_province": adresse_data.get("province") or "" if isinstance(adresse_data, dict) else "",
        # Langue
        "langue": record.get("i_d_langue") or record.get("langue") or "",
        # Sous-entités embarquées
        "nominations": record.get("liste_nomination"),
        "contacts_urgence": record.get("liste_contact_urgence"),
        "taux_horaires": record.get("liste_employe_date_taux"),
        # FK
        **{k: v for k, v in matched_fks.items() if v},
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.imported_personnel.insert_one(doc)
    return {"status": "created", "entity_type": "Employe", "id": doc_id, "matched_fks": matched_fks}


# ======================== BORNE INCENDIE ========================

async def _handle_borne_incendie(record: dict, tenant, user, source: str) -> dict:
    nom = record.get("nom") or ""
    if nom:
        existing = await db.points_eau.find_one(
            {"tenant_id": tenant.id, "nom": nom, "type": "borne_fontaine"}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "BorneIncendie", "points_eau", existing["id"], record, user.id)

    def safe_float(v):
        if not v:
            return None
        try:
            return float(str(v).split(" ")[0].replace(",", "."))
        except (ValueError, TypeError):
            return None

    addr, city = _extract_address_city(record)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": _get_premligne_id(record),
        "type": "borne_fontaine",
        "nom": nom,
        "adresse": addr,
        "ville": city,
        "etat": record.get("etat") or "En service",
        "debit_gpm": safe_float(record.get("debit")),
        "pression_statique": safe_float(record.get("pression_statique")),
        "pression_residuelle": safe_float(record.get("pression_residuelle")),
        "diametre_conduite": record.get("diametre_conduite") or "",
        "modele": record.get("modele_borne") or "",
        "accessible_hiver": record.get("accessible_hiver") == "Oui",
        "date_installation": record.get("date_installation") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.points_eau.insert_one(doc)
    return {"status": "created", "entity_type": "BorneIncendie", "id": doc_id}


# ======================== BORNE SECHE ========================

async def _handle_borne_seche(record: dict, tenant, user, source: str) -> dict:
    nom = record.get("nom") or ""
    if nom:
        existing = await db.points_eau.find_one(
            {"tenant_id": tenant.id, "nom": nom, "type": "borne_seche"}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "BorneSeche", "points_eau", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": _get_premligne_id(record),
        "type": "borne_seche",
        "nom": nom,
        "adresse": _safe_address_str(record.get("adresse")),
        "ville": record.get("ville") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.points_eau.insert_one(doc)
    return {"status": "created", "entity_type": "BorneSeche", "id": doc_id}


# ======================== POINT D'EAU ========================

async def _handle_point_eau(record: dict, tenant, user, source: str) -> dict:
    nom = record.get("nom") or ""
    if nom:
        existing = await db.points_eau.find_one(
            {"tenant_id": tenant.id, "nom": nom, "type": {"$nin": ["borne_fontaine", "borne_seche"]}}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "PointEau", "points_eau", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": _get_premligne_id(record),
        "type": record.get("type_point_eau") or "point_eau",
        "nom": nom,
        "adresse": _safe_address_str(record.get("adresse")),
        "ville": record.get("ville") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.points_eau.insert_one(doc)
    return {"status": "created", "entity_type": "PointEau", "id": doc_id}


# ======================== MAINTENANCE BORNE ========================

async def _handle_maintenance_borne(record: dict, tenant, user, source: str) -> dict:
    ext_id = _get_ext_id(record)
    if ext_id:
        existing = await db.maintenance_bornes.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "MaintenanceBorne", "maintenance_bornes", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": _get_premligne_id(record),
        "external_id": ext_id,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.maintenance_bornes.insert_one(doc)
    return {"status": "created", "entity_type": "MaintenanceBorne", "id": doc_id}


# ======================== TRAVAIL ========================

async def _handle_travail(record: dict, tenant, user, source: str) -> dict:
    ext_id = _get_ext_id(record)
    if ext_id:
        existing = await db.travaux.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Travail", "travaux", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": _get_premligne_id(record),
        "external_id": ext_id,
        "date_activite": record.get("date_activite") or "",
        "auteur": record.get("id_auteur") or record.get("auteur") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.travaux.insert_one(doc)
    return {"status": "created", "entity_type": "Travail", "id": doc_id}


# ======================== VEHICULE ========================

async def _handle_vehicule(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'un véhicule depuis un record PremLigne."""
    premligne_id = _get_premligne_id(record)
    numero = record.get("numero") or record.get("nom") or ""

    if numero:
        existing = await db.ref_vehicule.find_one(
            {"tenant_id": tenant.id, "$or": [{"numero": numero}, {"nom": numero}]},
            {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Vehicule", "ref_vehicule", existing["id"], record, user.id)

    matched_fks = {}
    caserne_label = record.get("id_caserne") or ""
    if caserne_label:
        clean = str(caserne_label).lstrip("*").strip()
        cas = await db.ref_caserne.find_one(
            {"tenant_id": tenant.id, "nom": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
            {"_id": 0, "id": 1}
        )
        if cas:
            matched_fks["caserne_id"] = cas["id"]

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "numero": numero,
        "nom": record.get("nom") or numero,
        "type_vehicule": record.get("type_vehicule") or record.get("id_type_vehicule") or "",
        "marque": record.get("marque") or "",
        "modele": record.get("modele") or "",
        "annee": record.get("annee") or "",
        "plaque": record.get("plaque") or "",
        "vin": record.get("vin") or "",
        "capacite_eau": record.get("capacite_eau") or "",
        "capacite_mousse": record.get("capacite_mousse") or "",
        "pompe": record.get("pompe") or "",
        "etat": record.get("etat") or "En service",
        "date_achat": record.get("date_achat") or "",
        "note": record.get("note") or "",
        **{k: v for k, v in matched_fks.items() if v},
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.ref_vehicule.insert_one(doc)
    return {"status": "created", "entity_type": "Vehicule", "id": doc_id, "matched_fks": matched_fks}


# ======================== EQUIPEMENT EXISTANT ========================

async def _handle_equip_exist(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'un équipement depuis un record PremLigne."""
    premligne_id = _get_premligne_id(record)
    numero_serie = record.get("numero_serie") or record.get("no_serie") or ""
    nom = record.get("nom") or ""

    # Doublon par numéro de série ou nom
    if numero_serie:
        existing = await db.equipements.find_one(
            {"tenant_id": tenant.id, "numero_serie": numero_serie}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "EquipExist", "equipements", existing["id"], record, user.id)
    elif nom:
        existing = await db.equipements.find_one(
            {"tenant_id": tenant.id, "nom": nom}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "EquipExist", "equipements", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "nom": nom,
        "numero_serie": numero_serie,
        "type_equipement": record.get("id_type_equipement") or record.get("type_equipement") or "",
        "marque": record.get("marque") or "",
        "modele": record.get("modele") or "",
        "date_achat": record.get("date_achat") or "",
        "date_expiration": record.get("date_expiration") or "",
        "date_prochaine_inspection": record.get("date_prochaine_inspection") or "",
        "etat": record.get("etat") or "",
        "localisation": record.get("localisation") or record.get("id_caserne") or "",
        "note": record.get("note") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.equipements.insert_one(doc)
    return {"status": "created", "entity_type": "EquipExist", "id": doc_id}


# ======================== MAINTENANCE EQUIPEMENT ========================

async def _handle_maint_equip(record: dict, tenant, user, source: str) -> dict:
    """Crée ou détecte doublon d'une maintenance d'équipement depuis un record PremLigne."""
    premligne_id = _get_premligne_id(record)
    ext_id = _get_ext_id(record)

    if ext_id:
        existing = await db.maintenance_equipements.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "MaintEquip", "maintenance_equipements", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "external_id": ext_id,
        "type_maintenance": record.get("id_type_maint") or record.get("type_maintenance") or "",
        "equipement_ref": record.get("id_equip_exist") or "",
        "date_activite": record.get("date_activite") or "",
        "date_completee": record.get("date_completee") or "",
        "statut": record.get("statut") or "",
        "auteur": record.get("id_auteur") or record.get("auteur") or "",
        "note": record.get("note") or record.get("narratif") or "",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.maintenance_equipements.insert_one(doc)
    return {"status": "created", "entity_type": "MaintEquip", "id": doc_id}


# ======================== RÉFÉRENTIELS (générique) ========================

async def _handle_referentiel(entity_type: str, record: dict, tenant, user, source: str) -> dict:
    """Handler générique pour les petites tables de référence."""
    collection_name = f"ref_{entity_type.lower()}"
    premligne_id = _get_premligne_id(record)
    nom = record.get("nom") or record.get("description") or record.get("code") or ""

    if nom:
        existing = await db[collection_name].find_one(
            {"tenant_id": tenant.id, "nom": nom}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, entity_type, collection_name, existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "nom": nom,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # Copier tous les champs simples du record (pas dict/list)
    for key, value in record.items():
        if key not in doc and key != "@attributes" and not isinstance(value, (dict, list)):
            doc[key] = value

    await db[collection_name].insert_one(doc)
    return {"status": "created", "entity_type": entity_type, "id": doc_id}
