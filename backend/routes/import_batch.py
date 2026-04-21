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
    get_super_admin,
    get_tenant_from_slug,
    get_password_hash,
    User,
    SuperAdmin,
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

    # Nettoyer l'adresse PremLigne — retirer les préfixes (ex: "2 A + 1 E, 10 chemin JORDAN")
    clean_input = address
    # Format PremLigne id_dossier_adresse: "prefixe, NUM rue NOM, *Ville"
    # Extraire le numéro civique + rue en cherchant le pattern numéro+rue
    input_variants = [clean_input]
    if "," in clean_input:
        parts = [p.strip().lstrip("*") for p in clean_input.split(",")]
        input_variants.extend(parts)
        # Essayer aussi les parties qui commencent par un numéro (adresse civique)
        for p in parts:
            if p and p[0].isdigit():
                input_variants.append(p)

    for bat in batiments:
        bat_addr = bat.get("adresse_civique", "")
        bat_ville = bat.get("ville", "")
        clean_bat = bat_addr
        if "," in bat_addr:
            bat_parts = bat_addr.split(",")
            clean_bat = ",".join(bat_parts[:-1]).strip()

        for variant in input_variants:
            match, _ = is_same_address(variant, city, clean_bat, bat_ville)
            if match:
                return bat["id"]
            # Match partiel: si l'adresse bâtiment est contenue dans le variant ou vice versa
            v_lower = variant.lower().strip()
            b_lower = clean_bat.lower().strip()
            if b_lower and len(b_lower) > 5 and (b_lower in v_lower or v_lower in b_lower):
                return bat["id"]

    return None


def _extract_address_city(record: dict) -> tuple:
    """Extrait adresse et ville d'un record (plusieurs formats possibles)."""
    addr = record.get("id_dossier_adresse") or record.get("dossier_adresse") or record.get("adresse") or record.get("adresse_appel") or ""
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


def _classification_to_groupe(classification: str) -> str:
    """Convertit une classification PremLigne (*C - Habitations) en code groupe (C)."""
    if not classification:
        return ""
    c = classification.strip().lstrip("*").strip()
    # Extraire la lettre de code (premier caractère avant " - ")
    if " - " in c:
        code = c.split(" - ")[0].strip()
        if len(code) == 1 and code.isalpha():
            return code.upper()
    # Fallback: premier caractère alpha
    for ch in c:
        if ch.isalpha():
            return ch.upper()
    return ""


def _normalize_sous_type(label: str) -> str:
    """Convertit un label PremLigne (Unifamiliale, Chalet) en code frontend (unifamiliale, chalet)."""
    if not label:
        return ""
    # Valeurs invalides PremLigne
    if label.strip().startswith("-") or label.strip() == "0":
        return ""
    mapping = {
        "unifamiliale": "unifamiliale", "bifamiliale": "bifamiliale", "duplex": "bifamiliale",
        "triplex": "multi_3_8", "multifamiliale": "multi_3_8",
        "copropriété": "copropriete", "copropriete": "copropriete", "condo": "copropriete",
        "chalet": "chalet", "maison mobile": "maison_mobile", "roulotte": "maison_mobile",
        "bureau": "bureau", "magasin": "magasin", "restaurant": "restaurant",
        "hôtel": "hotel", "hotel": "hotel", "motel": "hotel",
        "école": "ecole", "ecole": "ecole", "hôpital": "hopital", "hopital": "hopital",
        "chsld": "chsld", "église": "eglise", "eglise": "eglise",
        "entrepôt": "entrepot", "entrepot": "entrepot", "usine": "usine",
        "atelier": "atelier", "ferme": "ferme", "grange": "grange",
        "résidence personnes agées": "residence_ainee",
        "résidence personnes âgées": "residence_ainee",
        "residence personnes agees": "residence_ainee",
        "rpa": "residence_ainee",
    }
    key = label.strip().lower()
    if key in mapping:
        return mapping[key]
    # Condo / unités
    if "condo" in key or "unité" in key or "unite" in key:
        return "copropriete"
    return key.replace(" ", "_").replace("-", "_")


def _normalize_niveau_risque(label: str) -> str:
    """Convertit un label PremLigne (Risques faibles) en code frontend (Faible)."""
    if not label:
        return "Moyen"
    mapping = {
        "risques faibles": "Faible", "risque faible": "Faible", "faible": "Faible",
        "risques moyens": "Moyen", "risque moyen": "Moyen", "moyen": "Moyen",
        "risques élevés": "Élevé", "risque élevé": "Élevé", "élevé": "Élevé", "eleve": "Élevé",
        "risques très élevés": "Très élevé", "très élevé": "Très élevé", "tres eleve": "Très élevé",
    }
    return mapping.get(label.strip().lower(), label)




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


def _extract_photo_titles(record: dict) -> dict:
    """
    Extrait depuis liste_piece_jointe un dict {num_fichier: titre}.
    Ex: {"40534": "DEVANT MAISON", "40535": "PROPANE SECTEUR 3"}
    """
    titles = {}
    lp = record.get("liste_piece_jointe", {})
    if not isinstance(lp, dict):
        return titles
    items = lp.get("piece_jointe", [])
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return titles
    for pj in items:
        if not isinstance(pj, dict):
            continue
        raw_id = str(pj.get("id_fichier", "") or "")
        nom = str(pj.get("nom", "") or "").strip()
        if nom:
            num = re.sub(r"[^\d]", "", raw_id)
            if num:
                titles[num] = nom
    return titles


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


@router.post("/{tenant_slug}/import/merge-duplicate-files")
async def merge_duplicate_files(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Détecte les bâtiments en doublon (même adresse+ville) et migre les stored_files
    du doublon vers le bâtiment le plus récent (celui qui a pfm_record le plus complet).
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Grouper les bâtiments par adresse+ville
    cursor = db.batiments.find(
        {"tenant_id": tenant.id},
        {"_id": 0, "id": 1, "adresse_civique": 1, "ville": 1, "created_at": 1, "pfm_record": 1}
    )
    by_addr = {}
    async for doc in cursor:
        key = f"{(doc.get('adresse_civique') or '').strip().lower()}|{(doc.get('ville') or '').strip().lower()}"
        if key not in by_addr:
            by_addr[key] = []
        by_addr[key].append(doc)
    
    migrated = 0
    duplicates_resolved = 0
    
    for key, docs in by_addr.items():
        if len(docs) < 2:
            continue
        
        # Trier : le plus récent en premier
        docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)
        target = docs[0]  # Le plus récent (celui affiché)
        
        for source_doc in docs[1:]:
            # Migrer les stored_files du doublon vers le target
            result = await db.stored_files.update_many(
                {"entity_id": source_doc["id"]},
                {"$set": {"entity_id": target["id"]}}
            )
            if result.modified_count > 0:
                migrated += result.modified_count
                logger.info(f"[MERGE] Migré {result.modified_count} fichiers de {source_doc['id']} vers {target['id']} ({key})")
            duplicates_resolved += 1
    
    return {
        "duplicates_found": duplicates_resolved,
        "files_migrated": migrated,
        "message": f"{migrated} fichier(s) migré(s) depuis {duplicates_resolved} doublon(s)"
    }


@router.post("/{tenant_slug}/import/fix-orphan-inspections")
async def fix_orphan_inspections(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Relie les inspections importées sans batiment_id au bon bâtiment par:
    1. Matching via références PFM Transfer (plus fiable)
    2. Matching d'adresse
    3. Matching par premligne_id du dossier_adresse
    """
    tenant = await get_tenant_from_slug(tenant_slug)

    # Invalider le cache des bâtiments
    _batiments_cache.pop(tenant.id, None)

    cursor = db.inspections.find(
        {"tenant_id": tenant.id, "batiment_id": {"$in": [None, ""]}},
        {"_id": 0, "id": 1, "adresse": 1, "ville": 1, "external_id": 1, "pfm_record": 1, "premligne_id": 1}
    )

    fixed = 0
    fixed_by_refs = 0
    async for doc in cursor:
        bat_id = None
        
        # 🔗 STRATÉGIE 1 : Matching par références (plus fiable)
        if doc.get("premligne_id"):
            bat = await db.batiments.find_one(
                {
                    "tenant_id": tenant.id,
                    "$or": [
                        {"references.item.id": doc["premligne_id"]},
                        {"references.item.num": doc["premligne_id"]},
                        {"references.prevention": doc["premligne_id"]},
                    ]
                },
                {"_id": 0, "id": 1}
            )
            if bat:
                bat_id = bat["id"]
                fixed_by_refs += 1
                logger.info(f"[FIX-REF] Inspection {doc.get('external_id', doc['id'])} → batiment {bat_id} via références")
        
        # STRATÉGIE 2 : Matching par adresse
        if not bat_id:
            addr = doc.get("adresse") or ""
            city = doc.get("ville") or ""

            # Essayer aussi depuis pfm_record.id_dossier_adresse
            if not addr and doc.get("pfm_record"):
                addr = doc["pfm_record"].get("id_dossier_adresse") or ""
                if isinstance(addr, dict):
                    addr = _safe_address_str(addr)
                if "," in addr:
                    parts = addr.split(",")
                    city_candidate = parts[-1].strip().lstrip("*").strip()
                    if city_candidate and not city:
                        city = city_candidate

            bat_id = await _match_address(addr, city, tenant.id)

        # STRATÉGIE 3 : Fallback par premligne_id du dossier_adresse
        if not bat_id and doc.get("pfm_record"):
            dossier_ref = doc["pfm_record"].get("id_dossier_adresse") or ""
            if isinstance(dossier_ref, str):
                num_match = re.match(r"\*?(\d+)", dossier_ref.strip())
                if num_match:
                    bat = await db.batiments.find_one(
                        {"tenant_id": tenant.id, "premligne_id": num_match.group(1)},
                        {"_id": 0, "id": 1}
                    )
                    if bat:
                        bat_id = bat["id"]

        if bat_id:
            await db.inspections.update_one(
                {"id": doc["id"]},
                {"$set": {"batiment_id": bat_id}}
            )
            fixed += 1
            logger.info(f"[FIX] Inspection {doc.get('external_id', doc['id'])} → batiment {bat_id}")

    return {
        "fixed": fixed, 
        "fixed_by_references": fixed_by_refs,
        "message": f"{fixed} inspection(s) reliée(s) à un bâtiment ({fixed_by_refs} via références PFM Transfer)"
    }


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


@router.get("/{tenant_slug}/import/duplicates/count-by-type")
async def count_duplicates_by_type(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """Compte les doublons en attente par type d'entité pour les notifications."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Aggregation pour compter par entity_type
    pipeline = [
        {"$match": {"tenant_id": tenant.id, "status": "pending"}},
        {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    
    results = await db.import_duplicates.aggregate(pipeline).to_list(None)
    
    # Formatter les résultats
    by_type = {}
    total = 0
    for r in results:
        entity_type = r["_id"]
        count = r["count"]
        by_type[entity_type] = count
        total += count
    
    # Labels français pour les types
    labels = {
        'Intervention': 'intervention(s)',
        'DossierAdresse': 'bâtiment(s)',
        'Prevention': 'prévention(s)',
        'RCCI': 'RCCI',
        'Employe': 'employé(s)',
        'BorneIncendie': 'borne(s) fontaine',
        'BorneSeche': 'borne(s) sèche(s)',
        'PointEau': "point(s) d'eau",
        'Vehicule': 'véhicule(s)',
        'EquipExist': 'équipement(s)',
    }
    
    # Construire le message de notification
    details = []
    for entity_type, count in by_type.items():
        label = labels.get(entity_type, entity_type.lower())
        details.append(f"{count} {label}")
    
    message = ", ".join(details) if details else "Aucun doublon"
    
    return {
        "total": total,
        "by_type": by_type,
        "message": message,
        "details": details
    }


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

    # ── Création de compte utilisateur si Employe sans compte ──────────────
    if dup["entity_type"] == "Employe" and action != "ignore":
        emp = await db.imported_personnel.find_one(
            {"tenant_id": tenant.id, "id": existing_id}, {"_id": 0}
        )
        if emp:
            already_has_account = await db.users.find_one(
                {"tenant_id": tenant.id, "imported_personnel_id": existing_id}, {"_id": 0, "id": 1}
            )
            if not already_has_account:
                pfm_actif = emp.get("actif", True)
                matricule = emp.get("matricule", "")
                email_pfm = (emp.get("email") or "").strip().lower()
                PFM_DEFAULT_PASSWORD = "Pompier@2024"

                pfm_fields = {
                    "imported_from_pfm": True, "imported_personnel_id": existing_id,
                    "nas": emp.get("nas", ""), "numero_passeport": emp.get("numero_passeport", ""),
                    "pfm_matricule": matricule, "pfm_caserne": emp.get("caserne", ""),
                    "pfm_nominations": emp.get("nominations"),
                    "pfm_contacts_urgence": emp.get("contacts_urgence"),
                    "pfm_actif": pfm_actif,
                }

                # Chercher un compte existant par email ou matricule
                existing_user = None
                if email_pfm:
                    existing_user = await db.users.find_one(
                        {"tenant_id": tenant.id, "email": email_pfm}, {"_id": 0, "id": 1}
                    )
                if not existing_user and matricule:
                    existing_user = await db.users.find_one(
                        {"tenant_id": tenant.id, "numero_employe": matricule}, {"_id": 0, "id": 1}
                    )

                if existing_user:
                    await db.users.update_one({"id": existing_user["id"]}, {"$set": pfm_fields})
                    logger.info(f"  ✅ Compte existant lié: {existing_user['id']}")
                else:
                    # Créer le compte pour TOUS les employés (actifs et inactifs)
                    adresse_str = " ".join(filter(None, [
                        emp.get("adresse_rue", ""), emp.get("adresse_ville", ""),
                        emp.get("adresse_province", ""), emp.get("adresse_code_postal", ""),
                    ])).strip()
                    # Extraire le grade depuis les nominations ou type_employe PFM
                    pfm_record = emp.get("pfm_record", {})
                    grade_pfm = pfm_record.get("type_employe") or pfm_record.get("grade") or pfm_record.get("titre") or ""
                    new_uid = str(uuid.uuid4())
                    
                    user_doc = {
                        "id": new_uid, "tenant_id": tenant.id,
                        "email": email_pfm or None,
                        "mot_de_passe_hash": get_password_hash(PFM_DEFAULT_PASSWORD),
                        "nom": emp.get("nom", ""), "prenom": emp.get("prenom", ""),
                        "role": "employe", "grade": grade_pfm,
                        "type_emploi": "temps_partiel",
                        "telephone": emp.get("telephone_cellulaire") or emp.get("telephone_bureau") or "",
                        "adresse": adresse_str,
                        "date_embauche": emp.get("date_embauche") or "",
                        "date_naissance": emp.get("date_naissance") or "",
                        "numero_employe": matricule or "",
                        "statut": "Actif" if pfm_actif else "Inactif",
                        "formations": [], "competences": [],
                        "created_at": datetime.now(timezone.utc),
                        **pfm_fields,
                    }
                    await db.users.insert_one(user_doc)
                    logger.info(f"  ✅ Compte créé via résolution doublon: {new_uid} ({emp.get('nom')} {emp.get('prenom')}) - Statut: {'Actif' if pfm_actif else 'Inactif'}")

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
    entity_type_filter = body.get("entity_type")  # Optionnel: filtrer par type
    
    if action not in ("merge", "replace", "ignore"):
        raise HTTPException(status_code=400, detail="Action invalide")

    query = {"tenant_id": tenant.id, "status": "pending"}
    if entity_type_filter:
        query["entity_type"] = entity_type_filter
        
    pending = await db.import_duplicates.find(query, {"_id": 0}).to_list(length=None)
    
    logger.info(f"[resolve_all] Tenant {tenant_slug}: {len(pending)} doublons pending à traiter avec action={action}")

    resolved = 0
    errors = []
    for dup in pending:
        try:
            # Appeler directement la logique au lieu de passer par l'endpoint
            dup_id = dup["id"]
            collection = dup["collection"]
            existing_id = dup["existing_id"]
            new_record = dup["new_record"]
            
            if action == "ignore":
                pass  # Ne rien faire
            elif action == "replace":
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
            elif action == "merge":
                existing = await db[collection].find_one(
                    {"tenant_id": tenant.id, "id": existing_id}, {"_id": 0}
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
                    merged["pfm_record"] = new_record
                    merged["updated_at"] = datetime.now(timezone.utc).isoformat()
                    if merged:
                        await db[collection].update_one(
                            {"tenant_id": tenant.id, "id": existing_id},
                            {"$set": merged}
                        )

            # Marquer comme résolu
            await db.import_duplicates.update_one(
                {"id": dup_id},
                {"$set": {"status": action, "resolved_at": datetime.now(timezone.utc).isoformat(), "resolved_by": current_user.id}}
            )
            
            # Créer le compte utilisateur si Employe
            if dup["entity_type"] == "Employe" and action != "ignore":
                emp = await db.imported_personnel.find_one(
                    {"tenant_id": tenant.id, "id": existing_id}, {"_id": 0}
                )
                if emp:
                    already_has_account = await db.users.find_one(
                        {"tenant_id": tenant.id, "imported_personnel_id": existing_id}, {"_id": 0, "id": 1}
                    )
                    if not already_has_account:
                        pfm_actif = emp.get("actif", True)
                        matricule = emp.get("matricule", "")
                        email_pfm = (emp.get("email") or "").strip().lower()
                        PFM_DEFAULT_PASSWORD = "Pompier@2024"

                        pfm_fields = {
                            "imported_from_pfm": True, "imported_personnel_id": existing_id,
                            "nas": emp.get("nas", ""), "numero_passeport": emp.get("numero_passeport", ""),
                            "pfm_matricule": matricule, "pfm_caserne": emp.get("caserne", ""),
                            "pfm_nominations": emp.get("nominations"),
                            "pfm_contacts_urgence": emp.get("contacts_urgence"),
                            "pfm_actif": pfm_actif,
                        }

                        # Chercher un compte existant
                        existing_user = None
                        if email_pfm:
                            existing_user = await db.users.find_one(
                                {"tenant_id": tenant.id, "email": email_pfm}, {"_id": 0, "id": 1}
                            )
                        if not existing_user and matricule:
                            existing_user = await db.users.find_one(
                                {"tenant_id": tenant.id, "numero_employe": matricule}, {"_id": 0, "id": 1}
                            )

                        if existing_user:
                            await db.users.update_one({"id": existing_user["id"]}, {"$set": pfm_fields})
                            logger.info(f"  [resolve_all] Compte existant lié: {existing_user['id']}")
                        else:
                            adresse_str = " ".join(filter(None, [
                                emp.get("adresse_rue", ""), emp.get("adresse_ville", ""),
                                emp.get("adresse_province", ""), emp.get("adresse_code_postal", ""),
                            ])).strip()
                            pfm_record = emp.get("pfm_record", {})
                            grade_pfm = pfm_record.get("type_employe") or pfm_record.get("grade") or pfm_record.get("titre") or ""
                            new_uid = str(uuid.uuid4())
                            
                            await db.users.insert_one({
                                "id": new_uid, "tenant_id": tenant.id,
                                "email": email_pfm or None,
                                "mot_de_passe_hash": get_password_hash(PFM_DEFAULT_PASSWORD),
                                "nom": emp.get("nom", ""), "prenom": emp.get("prenom", ""),
                                "role": "employe", "grade": grade_pfm,
                                "type_emploi": "temps_partiel",
                                "telephone": emp.get("telephone_cellulaire") or emp.get("telephone_bureau") or "",
                                "adresse": adresse_str,
                                "date_embauche": emp.get("date_embauche") or "",
                                "date_naissance": emp.get("date_naissance") or "",
                                "numero_employe": matricule or "",
                                "statut": "Actif" if pfm_actif else "Inactif",
                                "formations": [], "competences": [],
                                "created_at": datetime.now(timezone.utc),
                                **pfm_fields,
                            })
                            logger.info(f"  [resolve_all] ✅ Compte créé: {new_uid} ({emp.get('nom')} {emp.get('prenom')})")
            
            resolved += 1
        except Exception as e:
            error_msg = f"Doublon {dup.get('id', '?')}: {str(e)}"
            errors.append(error_msg)
            logger.error(f"  [resolve_all] ❌ Erreur: {error_msg}")

    logger.info(f"[resolve_all] Terminé: {resolved}/{len(pending)} résolus, {len(errors)} erreurs")
    
    return {
        "resolved": resolved, 
        "total": len(pending), 
        "action": action,
        "errors": errors[:10] if errors else []  # Max 10 erreurs retournées
    }


@router.post("/{tenant_slug}/import/fix-existing-batiments")
async def fix_existing_batiments(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """
    Re-extrait les champs depuis pfm_record pour tous les bâtiments importés.
    Corrige ville, code postal, étages, matricule, valeur foncière, etc.
    """
    tenant = await get_tenant_from_slug(tenant_slug)

    cursor = db.batiments.find(
        {"tenant_id": tenant.id, "pfm_record": {"$exists": True, "$ne": None}},
        {"_id": 0}
    )

    fixed = 0
    async for doc in cursor:
        record = doc.get("pfm_record", {})
        if not record:
            continue

        # Re-extraire l'adresse
        addr_obj = record.get("adresse", {})
        if isinstance(addr_obj, dict) and "adresse" in addr_obj:
            addr_obj = addr_obj["adresse"]

        update = {}
        if isinstance(addr_obj, dict) and (addr_obj.get("no_civ") or addr_obj.get("rue")):
            no_civ = str(addr_obj.get("no_civ", "") or "").strip()
            type_rue = str(addr_obj.get("type_rue", "") or "").strip()
            rue = str(addr_obj.get("rue", "") or "").strip()
            new_addr = f"{no_civ} {type_rue} {rue}".strip()
            new_city = str(addr_obj.get("ville", "") or "").strip()
            new_cp = str(addr_obj.get("code_post", "") or "").strip()

            if new_addr:
                update["adresse_civique"] = new_addr
            if new_city:
                update["ville"] = new_city
            if new_cp:
                update["code_postal"] = new_cp

        # Champs numériques
        for pfm_key, db_key in [
            ("nbr_etage", "nombre_etages"), ("nbr_logement", "nombre_logements"),
            ("nbr_sous_sol", "nombre_sous_sol"), ("nbr_attique", "nombre_attique"),
            ("nbr_autres_locaux", "nombre_autres_locaux"),
            ("annee_construction", "annee_construction"),
            ("annee_dern_renov", "annee_renovation"),
        ]:
            val = _parse_int(record.get(pfm_key))
            if val is not None and val > 0:
                update[db_key] = val

        # Valeur foncière = valeur_immeuble (priorité) ou valeur
        val_imm = _parse_float(record.get("valeur_immeuble"))
        val_total = _parse_float(record.get("valeur"))
        if val_imm and val_imm > 0:
            update["valeur_fonciere"] = val_imm
        elif val_total and val_total > 0:
            update["valeur_fonciere"] = val_total

        val_terrain = _parse_float(record.get("valeur_terrain"))
        if val_terrain and val_terrain > 0:
            update["valeur_terrain"] = val_terrain

        # Matricule → cadastre_matricule
        matricule = record.get("matricule")
        if matricule:
            update["cadastre_matricule"] = str(matricule)

        # Superficie : parser "148 m²" → 148
        superficie_raw = record.get("qte_aire_au_sol") or ""
        if superficie_raw:
            m = re.match(r"^([\d\s,.]+)", str(superficie_raw).replace("\xa0", " "))
            if m:
                update["superficie_totale_m2"] = m.group(1).replace(" ", "").replace(",", ".")

        # Champs texte
        for pfm_key, db_key in [
            ("id_classification", "classification"),
            ("id_type_construction", "type_construction"),
            ("id_type_toit", "type_toit"),
            ("id_parement_exterieur", "parement"),
            ("id_usage_principal", "usage_principal"),
            ("id_usage_du_local", "usage_local"),
            ("id_type_chauffage", "type_chauffage"),
            ("qte_aire_au_sol", "aire_au_sol"),
            ("qte_aire_au_sol_terrain", "aire_terrain"),
        ]:
            val = record.get(pfm_key)
            if val and isinstance(val, str) and val.strip():
                update[db_key] = val.strip()

        # Groupe d'occupation depuis classification
        classif = record.get("id_classification") or ""
        if classif:
            groupe = _classification_to_groupe(classif)
            if groupe:
                update["groupe_occupation"] = groupe

        # Normaliser sous_type_batiment (Unifamiliale → unifamiliale, Chalet → chalet)
        type_bat = record.get("id_type_batiment") or ""
        if type_bat:
            update["sous_type_batiment"] = _normalize_sous_type(type_bat)

        # Normaliser niveau_risque (Risques faibles → Faible)
        risque = record.get("id_categ_risque") or ""
        if risque:
            update["niveau_risque"] = _normalize_niveau_risque(risque)

        # Notes (ne pas écraser si déjà rempli manuellement)
        note = record.get("note") or record.get("notes") or ""
        if note and not doc.get("notes"):
            update["notes"] = note

        # Contacts depuis liste_personne_ressource → proprietaire
        pers_ress = record.get("liste_personne_ressource", {})
        if isinstance(pers_ress, dict) and not doc.get("proprietaire_nom"):
            # Format PremLigne: {personne_ress: [{nom: "NOM PRENOM", adresse: {...}}]}
            # OU: {item: [{personne_ressource: {nom: ..., prenom: ...}}]}
            items = pers_ress.get("personne_ress", []) or pers_ress.get("item", [])
            if isinstance(items, dict):
                items = [items]
            if isinstance(items, list) and items:
                first = items[0]
                if isinstance(first, dict):
                    pr = first.get("personne_ressource", first) if isinstance(first.get("personne_ressource"), dict) else first
                    full_name = pr.get("nom", "") or ""
                    prenom = pr.get("prenom", "") or ""
                    nom = full_name
                    # Si le nom contient prénom+nom combiné ("MILO FRANCOIS"), séparer
                    if full_name and not prenom and " " in full_name:
                        parts = full_name.strip().split(" ", 1)
                        nom = parts[0]
                        prenom = parts[1] if len(parts) > 1 else ""
                    if nom:
                        update["proprietaire_nom"] = nom
                        update["contact_nom"] = full_name or f"{prenom} {nom}".strip()
                    if prenom:
                        update["proprietaire_prenom"] = prenom
                    tel = pr.get("telephone", "") or pr.get("cell", "") or ""
                    if tel:
                        update["proprietaire_telephone"] = tel
                        update["contact_telephone"] = tel
                    if pr.get("courriel"):
                        update["proprietaire_courriel"] = pr["courriel"]
                    # Adresse
                    pr_addr = pr.get("adresse", {})
                    if isinstance(pr_addr, dict) and "adresse" in pr_addr:
                        pr_addr = pr_addr["adresse"]
                    if isinstance(pr_addr, dict):
                        pr_no = str(pr_addr.get("no_civ", "") or "").strip()
                        pr_rue = str(pr_addr.get("rue", "") or "").strip()
                        if pr_no or pr_rue:
                            update["proprietaire_adresse"] = f"{pr_no} {pr_rue}".strip()
                        if pr_addr.get("ville"):
                            update["proprietaire_ville"] = pr_addr["ville"]
                        if pr_addr.get("code_post"):
                            update["proprietaire_code_postal"] = pr_addr["code_post"]

            # Stocker TOUS les contacts dans un tableau pour le frontend multi-contacts
            all_contacts = []
            for item in items:
                if isinstance(item, dict):
                    pr = item.get("personne_ressource", item) if isinstance(item.get("personne_ressource"), dict) else item
                    c_name = pr.get("nom", "") or ""
                    c_prenom = pr.get("prenom", "") or ""
                    if c_name and not c_prenom and " " in c_name:
                        parts = c_name.strip().split(" ", 1)
                        c_name = parts[0]
                        c_prenom = parts[1] if len(parts) > 1 else ""
                    c_addr = pr.get("adresse", {})
                    if isinstance(c_addr, dict) and "adresse" in c_addr:
                        c_addr = c_addr["adresse"]
                    all_contacts.append({
                        "nom": c_name,
                        "prenom": c_prenom,
                        "telephone": pr.get("telephone", "") or pr.get("cell", "") or "",
                        "courriel": pr.get("courriel", "") or "",
                        "adresse": f"{c_addr.get('no_civ', '')} {c_addr.get('rue', '')}".strip() if isinstance(c_addr, dict) else "",
                        "ville": c_addr.get("ville", "") if isinstance(c_addr, dict) else "",
                        "code_postal": c_addr.get("code_post", "") if isinstance(c_addr, dict) else "",
                        "statut": pr.get("statut", "") or "",
                    })
            if all_contacts:
                update["contacts_ressources"] = all_contacts

        # Sous-entités
        for pfm_key, db_key in [
            ("liste_personne_ressource", "personnes_ressources"),
            ("liste_produit_dangereux", "produits_dangereux"),
            ("protection", "protections"),
            ("liste_code_reference", "codes_reference"),
        ]:
            val = record.get(pfm_key)
            if val and not doc.get(db_key):
                update[db_key] = val

        if update:
            await db.batiments.update_one(
                {"tenant_id": tenant.id, "id": doc["id"]},
                {"$set": update}
            )
            fixed += 1

        # Matcher les titres des photos depuis liste_piece_jointe → stored_files
        title_map = _extract_photo_titles(record)
        if title_map:
            # Sauvegarder sur le bâtiment pour les futurs uploads
            await db.batiments.update_one(
                {"tenant_id": tenant.id, "id": doc["id"]},
                {"$set": {"pfm_photo_titles": title_map}}
            )
            # Mettre à jour les stored_files déjà uploadés
            files = await db.stored_files.find(
                {"entity_id": doc["id"]},
                {"_id": 0, "id": 1, "original_filename": 1}
            ).to_list(100)
            for f in files:
                fname = f.get("original_filename", "")
                file_num = re.sub(r"\.[^.]+$", "", fname)
                if file_num in title_map:
                    await db.stored_files.update_one(
                        {"id": f["id"]},
                        {"$set": {"description": title_map[file_num]}}
                    )

    return {"fixed": fixed, "message": f"{fixed} bâtiment(s) enrichi(s) depuis pfm_record"}


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





@router.get("/{tenant_slug}/import/debug-champs")
async def debug_champs(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin),
):
    """Diagnostic : affiche la structure réelle des champs personnalisés pour déboguer."""
    tenant = await get_tenant_from_slug(tenant_slug)

    # 1. Compter les TypeChampPerso en base
    count_types = await db.ref_typechampperso.count_documents({"tenant_id": tenant.id})
    count_types_global = await db.ref_typechampperso.count_documents({})
    sample_types = await db.ref_typechampperso.find(
        {}, {"_id": 0, "nom": 1, "premligne_id": 1, "tenant_id": 1}
    ).limit(5).to_list(5)

    # 2. Trouver une inspection importée
    insp = await db.inspections.find_one(
        {"tenant_id": tenant.id},
        {"_id": 0, "id": 1, "champs_personnalises": 1, "pfm_record": 1}
    )

    result = {
        "ref_typechampperso": {
            "count_tenant": count_types,
            "count_global": count_types_global,
            "sample": sample_types,
        },
        "inspection_found": insp is not None,
    }

    if insp:
        # Montrer TOUS les champs de haut niveau du pfm_record
        pfm = insp.get("pfm_record") or {}
        result["pfm_record_all_keys"] = list(pfm.keys())
        result["pfm_champ_related_keys"] = [k for k in pfm.keys() if "champ" in k.lower() or "perso" in k.lower() or "anomal" in k.lower() or "defaut" in k.lower()]

        # Chercher liste_champ_personnalise et liste_anomalie
        result["pfm_liste_champ_perso_type"] = type(pfm.get("liste_champ_personnalise")).__name__
        result["pfm_liste_anomalie_type"] = type(pfm.get("liste_anomalie")).__name__

        # Champs stockés dans l'inspection
        result["champs_personnalises_type"] = type(insp.get("champs_personnalises")).__name__
        result["anomalies_type"] = type(insp.get("anomalies")).__name__
        result["anomalies_value"] = str(insp.get("anomalies"))[:200]

    # Chercher une inspection qui AURAIT des champs dans le pfm_record
    insp_with_champs = await db.inspections.find_one(
        {"tenant_id": tenant.id, "pfm_record.liste_champ_personnalise": {"$ne": None}},
        {"_id": 0, "id": 1, "pfm_record": 1}
    )
    result["inspection_with_champs_found"] = insp_with_champs is not None
    if insp_with_champs:
        pfm2 = insp_with_champs.get("pfm_record") or {}
        raw2 = pfm2.get("liste_champ_personnalise")
        result["sample_champs_type"] = type(raw2).__name__
        result["sample_champs_preview"] = str(raw2)[:800]

    # Lister les collections ref_* disponibles avec leur compte
    ref_collections = {}
    for coll_name in await db.list_collection_names():
        if coll_name.startswith("ref_"):
            count = await db[coll_name].count_documents({})
            if count > 0:
                ref_collections[coll_name] = count
    result["ref_collections_with_data"] = ref_collections

    # Compter les inspections totales
    result["inspections_total"] = await db.inspections.count_documents({"tenant_id": tenant.id})
    result["inspections_with_pfm_record"] = await db.inspections.count_documents({"tenant_id": tenant.id, "pfm_record": {"$exists": True, "$ne": None}})

    return result



@router.post("/{tenant_slug}/import/fix-existing-preventions")
async def fix_existing_preventions(
    tenant_slug: str,
    admin: SuperAdmin = Depends(get_super_admin),
):
    """
    Ré-enrichit les champs personnalisés des inspections déjà importées
    en faisant la correspondance positionnelle avec ref_typechampperso.
    """
    tenant = await get_tenant_from_slug(tenant_slug)

    # Charger tous les TypeChampPerso triés numériquement
    def _num_sort(d):
        try:
            return int(d.get("premligne_id") or 0)
        except Exception:
            return 0

    all_types = await db.ref_typechampperso.find(
        {"tenant_id": tenant.id}, {"_id": 0, "nom": 1, "premligne_id": 1}
    ).to_list(500)
    if not all_types:
        all_types = await db.ref_typechampperso.find(
            {}, {"_id": 0, "nom": 1, "premligne_id": 1}
        ).to_list(500)
    all_types.sort(key=_num_sort)

    if not all_types:
        return {"success": False, "message": "Aucun TypeChampPerso trouvé. Importez d'abord les référentiels."}

    inspections = await db.inspections.find(
        {"tenant_id": tenant.id, "pfm_record": {"$exists": True}},
        {"_id": 0, "id": 1, "pfm_record": 1}
    ).to_list(5000)

    updated = 0
    for insp in inspections:
        record = insp.get("pfm_record") or {}
        raw_champs = record.get("liste_champ_personnalise")
        if not raw_champs:
            continue
        items = raw_champs.get("champ_personnalise", []) if isinstance(raw_champs, dict) else []
        if isinstance(items, dict):
            items = [items]
        items = [c for c in (items or []) if isinstance(c, dict)]
        if not items:
            continue

        enriched = []
        for i, champ in enumerate(items):
            attrs = champ.get("@attributes") or {}
            type_id = str(
                champ.get("id_type_champ_personnalise") or
                attrs.get("id_type_champ_personnalise") or
                attrs.get("id") or ""
            ).strip()

            label = ""
            if type_id and not type_id.isdigit():
                label = type_id
            if not label and type_id:
                td = await db.ref_typechampperso.find_one(
                    {"premligne_id": type_id, "tenant_id": tenant.id},
                    {"_id": 0, "nom": 1}
                )
                if td:
                    label = td.get("nom", "")
            if not label and i < len(all_types):
                label = all_types[i].get("nom", "")

            enriched.append({
                "id_type_champ_personnalise": label or type_id,
                "valeur": champ.get("valeur") or "",
            })

        await db.inspections.update_one(
            {"id": insp["id"]},
            {"$set": {"champs_personnalises": enriched}}
        )
        updated += 1

    return {
        "success": True,
        "message": f"{updated} inspection(s) enrichie(s) avec {len(all_types)} types de champs.",
        "types_count": len(all_types),
        "inspections_updated": updated,
    }



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

    # Extraire l'adresse — format Transfer: adresse.adresse.{no_civ, type_rue, rue, ville, code_post}
    addr_obj = record.get("adresse", {})
    if isinstance(addr_obj, dict) and "adresse" in addr_obj:
        addr_obj = addr_obj["adresse"]

    code_postal = ""
    province = "Québec"
    if isinstance(addr_obj, dict) and (addr_obj.get("no_civ") or addr_obj.get("rue")):
        no_civ = str(addr_obj.get("no_civ", "") or "").strip()
        type_rue = str(addr_obj.get("type_rue", "") or "").strip()
        rue = str(addr_obj.get("rue", "") or "").strip()
        addr = f"{no_civ} {type_rue} {rue}".strip()
        city = str(addr_obj.get("ville", "") or "").strip()
        code_postal = str(addr_obj.get("code_post", "") or addr_obj.get("code_postal", "") or "").strip()
        province = str(addr_obj.get("province", "") or "Québec").strip()
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

    # Personnes ressources → propriétaire + tableau de contacts
    proprietaire_nom = ""
    proprietaire_prenom = ""
    proprietaire_telephone = ""
    proprietaire_courriel = ""
    proprietaire_adresse = ""
    proprietaire_ville = ""
    proprietaire_code_postal = ""
    all_contacts = []
    pers_ress = record.get("liste_personne_ressource", {})
    if isinstance(pers_ress, dict):
        items = pers_ress.get("personne_ress", []) or pers_ress.get("item", [])
        if isinstance(items, dict):
            items = [items]
        if isinstance(items, list):
            for idx, raw_item in enumerate(items):
                if not isinstance(raw_item, dict):
                    continue
                pr = raw_item.get("personne_ressource", raw_item) if isinstance(raw_item.get("personne_ressource"), dict) else raw_item
                full_name = pr.get("nom", "") or ""
                c_prenom = pr.get("prenom", "") or ""
                c_nom = full_name
                if full_name and not c_prenom and " " in full_name:
                    parts = full_name.strip().split(" ", 1)
                    c_nom = parts[0]
                    c_prenom = parts[1] if len(parts) > 1 else ""
                c_addr = pr.get("adresse", {})
                if isinstance(c_addr, dict) and "adresse" in c_addr:
                    c_addr = c_addr["adresse"]
                if not isinstance(c_addr, dict):
                    c_addr = {}
                contact = {
                    "nom": c_nom,
                    "prenom": c_prenom,
                    "telephone": pr.get("telephone", "") or pr.get("cell", "") or "",
                    "courriel": pr.get("courriel", "") or "",
                    "adresse": f"{c_addr.get('no_civ', '')} {c_addr.get('rue', '')}".strip(),
                    "ville": c_addr.get("ville", "") or "",
                    "code_postal": c_addr.get("code_post", "") or "",
                    "statut": pr.get("statut", "") or "",
                }
                all_contacts.append(contact)
                if idx == 0:
                    proprietaire_nom = c_nom
                    proprietaire_prenom = c_prenom
                    proprietaire_telephone = contact["telephone"]
                    proprietaire_courriel = contact["courriel"]
                    proprietaire_adresse = contact["adresse"]
                    proprietaire_ville = contact["ville"]
                    proprietaire_code_postal = contact["code_postal"]
    if not proprietaire_nom:
        proprietaire_nom = record.get("proprietaire_nom") or record.get("prop_nom") or ""

    # Superficie : parser "148 m²" → 148
    superficie_raw = record.get("qte_aire_au_sol") or ""
    superficie_m2 = ""
    if superficie_raw:
        m = re.match(r"^([\d\s,.]+)", str(superficie_raw).replace("\xa0", " "))
        if m:
            superficie_m2 = m.group(1).replace(" ", "").replace(",", ".")

    # Valeur foncière : priorité valeur_immeuble > valeur
    valeur_fonciere = _parse_float(record.get("valeur_immeuble")) or _parse_float(record.get("valeur"))

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "adresse_civique": addr,
        "ville": city,
        "code_postal": code_postal,
        "province": province,
        "pays": "Canada",
        # Identification
        "cadastre_matricule": str(record.get("matricule") or ""),
        "nom_etablissement": record.get("proprietaire_nom") or record.get("prop_nom") or record.get("raison_sociale") or "",
        "raison_sociale": record.get("raison_sociale") or "",
        "subdivision": record.get("subdivision") or "",
        # Caractéristiques du bâtiment
        "nombre_etages": _parse_int(record.get("nbr_etage") or record.get("nombre_etages")),
        "nombre_logements": _parse_int(record.get("nbr_logement") or record.get("nombre_logements")),
        "nombre_sous_sol": _parse_int(record.get("nbr_sous_sol")),
        "nombre_attique": _parse_int(record.get("nbr_attique")),
        "nombre_autres_locaux": _parse_int(record.get("nbr_autres_locaux")),
        "annee_construction": _parse_int(record.get("annee_construction")),
        "annee_renovation": _parse_int(record.get("annee_dern_renov") or record.get("annee_renovation")),
        "superficie_totale_m2": superficie_m2,
        "aire_terrain": record.get("qte_aire_au_sol_terrain") or "",
        # Valeurs foncières
        "valeur_fonciere": valeur_fonciere,
        "valeur_terrain": _parse_float(record.get("valeur_terrain")),
        # Classification / types (labels textuels de PremLigne)
        "niveau_risque": _normalize_niveau_risque(record.get("id_categ_risque") or record.get("categorie_risque") or ""),
        "sous_type_batiment": _normalize_sous_type(record.get("id_type_batiment") or record.get("type_batiment") or ""),
        "classification": record.get("id_classification") or "",
        "groupe_occupation": _classification_to_groupe(record.get("id_classification") or ""),
        "type_construction": record.get("id_type_construction") or "",
        "type_chauffage": record.get("id_type_chauffage") or "",
        "type_toit": record.get("id_type_toit") or "",
        "parement": record.get("id_parement_exterieur") or record.get("id_parement") or "",
        "plancher": record.get("id_plancher") or "",
        "usage_principal": record.get("id_usage_principal") or "",
        "usage_local": record.get("id_usage_du_local") or "",
        # Notes
        "notes": record.get("note") or record.get("notes") or "",
        # Propriétaire (depuis personnes ressources)
        "proprietaire_nom": proprietaire_nom,
        "proprietaire_prenom": proprietaire_prenom,
        "proprietaire_telephone": proprietaire_telephone,
        "proprietaire_courriel": proprietaire_courriel,
        "proprietaire_adresse": proprietaire_adresse,
        "proprietaire_ville": proprietaire_ville,
        "proprietaire_code_postal": proprietaire_code_postal,
        "contact_nom": f"{proprietaire_prenom} {proprietaire_nom}".strip() or proprietaire_nom,
        "contact_telephone": proprietaire_telephone,
        # Multi-contacts (tableau structuré)
        "contacts_ressources": all_contacts,
        # Sous-entités embarquées (JSONB)
        "personnes_ressources": record.get("liste_personne_ressource"),
        "produits_dangereux": record.get("liste_produit_dangereux"),
        "protections": record.get("protection"),
        "codes_reference": record.get("liste_code_reference"),
        "periodicites": record.get("liste_periodicite"),
        # 🔗 Références (pour linking automatique avec Préventions)
        "references": record.get("references"),  # Structure PFM Transfer contenant les liens prévention
        # 📸 Titres des photos PFM Transfer (id_fichier numérique → nom)
        "pfm_photo_titles": _extract_photo_titles(record),
        # État
        "etat": record.get("etat") or "Actif",
        "actif": record.get("etat") != "Inactif",
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

    # Match bâtiment par adresse
    bat_id = await _match_address(addr, city, tenant.id)

    # 🔗 NOUVELLE STRATÉGIE : Matching par références (plus fiable que l'adresse)
    # Si le bâtiment a importé des "references" depuis PFM Transfer qui pointent vers cette prévention
    if not bat_id and premligne_id:
        # Chercher un bâtiment dont les "references" contiennent ce premligne_id de prévention
        bat = await db.batiments.find_one(
            {
                "tenant_id": tenant.id,
                "$or": [
                    # Les références peuvent être sous forme de liste avec id/num
                    {"references.item.id": premligne_id},
                    {"references.item.num": premligne_id},
                    # Ou directement comme valeur de champ
                    {"references.prevention": premligne_id},
                ]
            },
            {"_id": 0, "id": 1}
        )
        if bat:
            bat_id = bat["id"]
            logger.info(f"✅ Prévention {ext_id} liée au bâtiment {bat_id} via références PFM Transfer")

    # Si pas de match par adresse, chercher par premligne_id du dossier_adresse
    if not bat_id:
        dossier_ref = record.get("id_dossier_adresse") or ""
        if dossier_ref and isinstance(dossier_ref, str):
            # Parfois c'est un label "*40428 - 10 chemin JORDAN" contenant un ID numérique
            num_match = re.match(r"\*?(\d+)", dossier_ref.strip())
            if num_match:
                bat = await db.batiments.find_one(
                    {"tenant_id": tenant.id, "premligne_id": num_match.group(1)},
                    {"_id": 0, "id": 1}
                )
                if bat:
                    bat_id = bat["id"]

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
        "avis_emis": record.get("avis_emission") or "",  # Garder le texte brut de l'avis
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

    matched_fks = {}
    if bat_id:
        doc["batiment_id"] = bat_id
        matched_fks["batiment_id"] = bat_id

    await db.inspections.insert_one(doc)
    return {"status": "created", "entity_type": "Prevention", "id": doc_id, "batiment_id": bat_id, "matched_fks": matched_fks}


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
    """Crée ou détecte doublon d'un employé depuis un record PremLigne.
    Crée ou lie automatiquement un compte utilisateur dans l'app.
    """
    matricule = record.get("matricule") or ""
    nom = record.get("nom") or ""
    prenom = record.get("prenom") or ""
    email_pfm = (record.get("couriel") or record.get("courriel") or "").strip().lower()
    premligne_id = _get_premligne_id(record)
    # Statut actif : déterminé UNIQUEMENT par le champ "inactif" de PFM Transfer
    # La date_fin ne doit PAS influencer le statut actif/inactif
    date_fin = (record.get("date_fin") or "").strip()
    pfm_actif = record.get("inactif") != "Oui"

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

    nas = record.get("n_as") or record.get("nas") or record.get("NAS") or ""
    numero_passeport = record.get("numero_passeport") or record.get("passeport") or ""

    # Nominations : liste_nomination.employe_nomination[]
    noms_raw = record.get("liste_nomination") or {}
    if isinstance(noms_raw, dict):
        noms_items = noms_raw.get("employe_nomination") or []
        if isinstance(noms_items, dict):
            noms_items = [noms_items]
    elif isinstance(noms_raw, list):
        noms_items = noms_raw
    else:
        noms_items = []
    nominations_app = [
        {
            "titre": str(n.get("id_grade") or n.get("grade") or ""),
            "date_obtention": (n.get("date_nomin") or "")[:10]
        }
        for n in noms_items if isinstance(n, dict)
    ]

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "premligne_id": premligne_id,
        "nom": nom,
        "prenom": prenom,
        "matricule": matricule,
        "code_permanent": record.get("code_permanent") or "",
        "email": email_pfm,
        "telephone_cellulaire": record.get("cell") or "",
        "telephone_bureau": record.get("tel_bureau") or "",
        "telephone_domicile": record.get("tel_domicile") or "",
        "caserne": caserne_label,
        "type_employe": record.get("type_employe") or "",
        "date_embauche": (record.get("date_embauche") or "")[:10],
        "date_naissance": (record.get("date_nais") or "")[:10],
        "date_fin_embauche": date_fin[:10] if date_fin else "",
        "actif": pfm_actif,
        # Documents sensibles
        "nas": nas,
        "numero_passeport": numero_passeport,
        "note": record.get("note") or record.get("notes") or "",
        # Permis de conduire
        "permis_conduire": _parse_bool(record.get("permis_conduire")),
        "permis_classe": record.get("permis_classe") or "",
        "permis_expiration": (record.get("permis_expiration") or "")[:10],
        # Nominations converties
        "nominations": nominations_app,
        # Adresse postale
        "adresse_rue": " ".join(filter(None, [
            str(adresse_data.get("no_civ", "") or "").strip(),
            str(adresse_data.get("type_rue", "") or "").strip(),
            str(adresse_data.get("rue", "") or "").strip(),
        ])).strip() if isinstance(adresse_data, dict) else "",
        "adresse_ville": adresse_data.get("ville") or "" if isinstance(adresse_data, dict) else "",
        "adresse_code_postal": adresse_data.get("code_post") or adresse_data.get("code_postal") or "" if isinstance(adresse_data, dict) else "",
        "adresse_province": adresse_data.get("province") or "" if isinstance(adresse_data, dict) else "",
        # Langue
        "langue": record.get("i_d_langue") or record.get("langue") or "",
        # Sous-entités embarquées (données brutes PFM)
        "pfm_nominations": record.get("liste_nomination"),
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

    # ─── Création / liaison automatique du compte utilisateur ───────────────
    account_status = "skipped"
    account_user_id = None
    PFM_DEFAULT_PASSWORD = "Pompier@2024"

    # Champs PFM à injecter dans le doc user (sans statut ni role — préservés pour fusion)
    pfm_user_fields = {
        "imported_from_pfm": True,
        "imported_personnel_id": doc_id,
        "nas": nas,
        "numero_passeport": numero_passeport,
        "code_permanent": doc.get("code_permanent", ""),
        "note": doc.get("note", ""),
        "permis_conduire": doc.get("permis_conduire", False),
        "permis_classe": doc.get("permis_classe", ""),
        "permis_expiration": doc.get("permis_expiration", ""),
        "nominations": nominations_app,
        "pfm_matricule": matricule,
        "pfm_caserne": caserne_label,
        "pfm_nominations": record.get("liste_nomination"),
        "pfm_contacts_urgence": record.get("liste_contact_urgence"),
        "pfm_actif": pfm_actif,
    }

    # Recherche d'un compte existant (email puis matricule)
    existing_user = None
    if email_pfm:
        existing_user = await db.users.find_one(
            {"tenant_id": tenant.id, "email": email_pfm}, {"_id": 0, "id": 1}
        )
    if not existing_user and matricule:
        existing_user = await db.users.find_one(
            {"tenant_id": tenant.id, "numero_employe": matricule}, {"_id": 0, "id": 1}
        )

    if existing_user:
        # Lier le compte existant aux données PFM — sans toucher au statut existant
        await db.users.update_one(
            {"id": existing_user["id"]},
            {"$set": pfm_user_fields}
        )
        account_status = "linked"
        account_user_id = existing_user["id"]
    elif pfm_actif:
        # Créer un compte uniquement pour le personnel ACTIF
        new_user_id = str(uuid.uuid4())
        adresse_str = " ".join(filter(None, [
            doc.get("adresse_rue", ""),
            doc.get("adresse_ville", ""),
            doc.get("adresse_province", ""),
            doc.get("adresse_code_postal", ""),
        ])).strip()
        new_user = {
            "id": new_user_id,
            "tenant_id": tenant.id,
            "email": email_pfm or None,
            "mot_de_passe_hash": get_password_hash(PFM_DEFAULT_PASSWORD),
            "nom": nom,
            "prenom": prenom,
            "role": "employe",
            "grade": record.get("type_employe") or record.get("grade") or record.get("titre") or "",
            "type_emploi": "temps_partiel",
            "telephone": doc.get("telephone_cellulaire") or doc.get("telephone_bureau") or "",
            "adresse": adresse_str,
            "date_embauche": doc.get("date_embauche") or "",
            "date_fin_embauche": date_fin[:10] if date_fin else "",
            "date_naissance": doc.get("date_naissance") or "",
            "numero_employe": matricule or "",
            "statut": "Actif",
            "formations": [],
            "competences": [],
            "created_at": datetime.now(timezone.utc),
            **pfm_user_fields,
        }
        await db.users.insert_one(new_user)
        account_status = "created"
        account_user_id = new_user_id
    else:
        # Personnel inactif PFM → compte créé avec statut Inactif (apparaît dans "Anciens employés")
        new_user_id = str(uuid.uuid4())
        adresse_str = " ".join(filter(None, [
            doc.get("adresse_rue", ""),
            doc.get("adresse_ville", ""),
            doc.get("adresse_province", ""),
            doc.get("adresse_code_postal", ""),
        ])).strip()
        await db.users.insert_one({
            "id": new_user_id,
            "tenant_id": tenant.id,
            "email": email_pfm or None,
            "mot_de_passe_hash": get_password_hash(PFM_DEFAULT_PASSWORD),
            "nom": nom, "prenom": prenom,
            "role": "employe",
            "grade": record.get("type_employe") or record.get("grade") or record.get("titre") or "",
            "type_emploi": "temps_partiel",
            "telephone": doc.get("telephone_cellulaire") or doc.get("telephone_bureau") or "",
            "adresse": adresse_str,
            "date_embauche": doc.get("date_embauche") or "",
            "date_fin_embauche": date_fin[:10] if date_fin else "",
            "date_naissance": doc.get("date_naissance") or "",
            "numero_employe": matricule or "",
            "statut": "Inactif",
            "formations": [], "competences": [],
            "created_at": datetime.now(timezone.utc),
            **pfm_user_fields,
        })
        account_status = "created_inactive"
        account_user_id = new_user_id

    return {
        "status": "created",
        "entity_type": "Employe",
        "id": doc_id,
        "matched_fks": matched_fks,
        "account_status": account_status,
        "account_user_id": account_user_id,
        "temp_password": PFM_DEFAULT_PASSWORD if account_status == "created" else None,
    }


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
