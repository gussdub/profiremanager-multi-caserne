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
    city = record.get("ville") or record.get("municipalite") or ""
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
    }

    # Référentiels (petites tables — stockage générique)
    referentiels = {
        "Caserne", "Grade", "Equipe", "Vehicule", "CodeAppel",
        "TypePrevention", "TypeBatiment", "TypeEquipement",
        "ModeleBorne", "TypeValve", "UsageBorne", "Raccord",
        "Classification", "ReferenceCode",
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


# ======================== GESTION DES DOUBLONS ========================

async def _queue_duplicate(tenant_id: str, entity_type: str, collection: str,
                           existing_id: str, new_record: dict, user_id: str) -> dict:
    """
    Met un doublon en file d'attente pour résolution par l'utilisateur.
    Retourne status=pending_review (le record est accepté mais pas encore intégré).
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
        "status": "pending_review",
        "entity_type": entity_type,
        "existing_id": existing_id,
        "duplicate_id": dup_id,
        "message": "Doublon détecté — en attente de résolution dans ProFireManager",
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
        "chronologie.depart_caserne",
        "chronologie.depart",
        "carte_appel.carte_appel.heure_depart",
        "carte_appel.heure_depart")
    date_arrivee = deep_get(r,
        "chronologie.interv_chronologie.arrivee_prem_veh",
        "chronologie.arrivee_prem_vehicule",
        "carte_appel.carte_appel.heure_arrivee",
        "carte_appel.heure_arrivee")
    date_force_frappe = deep_get(r,
        "chronologie.interv_chronologie.arrivee_force_frappe",
        "chronologie.arrivee_force_frappe")
    date_maitrise = deep_get(r,
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
        "intervenant.interv_intervenant.info_interv_employe.info_histo_employe.vect_info_employe.info_employe",
        "intervenant.info_interv_employe.info_employe",
        "intervenant.info_interv_employe")
    if isinstance(employes_raw, list):
        for emp in employes_raw:
            if isinstance(emp, dict):
                personnel.append({
                    "nom": emp.get("id_employe") or f"{emp.get('prenom', '')} {emp.get('nom', '')}".strip(),
                    "vehicule": emp.get("id_vehicule") or "",
                    "arrivee": emp.get("date_partiel_debut") or "",
                    "depart": emp.get("date_partiel_fin") or emp.get("heure_depart") or "",
                    "presence": emp.get("presence") or "",
                    "libere": emp.get("libere") or "",
                })
    elif isinstance(employes_raw, dict):
        personnel.append({
            "nom": employes_raw.get("id_employe") or "",
            "arrivee": employes_raw.get("date_partiel_debut") or "",
            "depart": employes_raw.get("date_partiel_fin") or "",
            "presence": employes_raw.get("presence") or "",
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
    cause_probable = deep_get(r,
        "cause_incendie.interv_cause_incendie.id_cause_probable",
        "cause_incendie.id_cause_probable")
    source_chaleur = deep_get(r,
        "cause_incendie.interv_cause_incendie.id_source_chaleur",
        "cause_incendie.id_source_chaleur")

    return {
        "address_full": str(addr) if addr else "",
        "municipality": str(city) if city else "",
        "type_intervention": str(type_intv) if type_intv else "",
        "code_feu": str(code_feu) if code_feu else "",
        "officer_in_charge_xml": str(officier) if officier else "",
        "caserne": str(caserne) if caserne else "",
        "notes": str(notes) if notes else "",
        "caller_name": str(caller_name) if caller_name else "",
        "caller_phone": str(caller_phone) if caller_phone else "",
        "caller_pour": str(caller_pour) if caller_pour else "",
        "caller_phone_pour": str(caller_phone_pour) if caller_phone_pour else "",
        "vehicules": vehicules,
        "personnel": personnel,
        "xml_time_call_received": str(date_appel) if date_appel else "",
        "xml_time_alert": str(date_alerte) if date_alerte else "",
        "xml_time_departure": str(date_depart) if date_depart else "",
        "xml_time_arrival": str(date_arrivee) if date_arrivee else "",
        "xml_time_force_frappe": str(date_force_frappe) if date_force_frappe else "",
        "xml_time_maitrise": str(date_maitrise) if date_maitrise else "",
        "xml_time_return": str(date_retour) if date_retour else "",
        "xml_time_end": str(date_fin) if date_fin else "",
        "statut_premligne": deep_get(r, "statut") or "",
        "perte_batiment": str(perte_batiment) if perte_batiment else "",
        "perte_contenu": str(perte_contenu) if perte_contenu else "",
        "perte_exterieur": str(perte_ext) if perte_ext else "",
        "cause_probable": str(cause_probable) if cause_probable else "",
        "source_chaleur": str(source_chaleur) if source_chaleur else "",
        "cout_total": deep_get(r, "cout_total") or "",
    }



# ======================== INTERVENTION ========================

async def _handle_intervention(record: dict, tenant, user, source: str) -> dict:
    """Crée ou REMPLACE une intervention depuis un record PremLigne."""
    ext_id = _get_ext_id(record)
    fields = _extract_intervention_fields(record)

    # Si doublon → REMPLACER (mettre à jour avec les nouvelles données)
    if ext_id:
        existing = await db.interventions.find_one(
            {"tenant_id": tenant.id, "external_call_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Intervention", "interventions", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
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

    bat_id = await _match_address(fields.get("address_full", ""), fields.get("municipality", ""), tenant.id)
    if bat_id:
        doc["batiment_id"] = bat_id
        doc["match_method"] = "auto_address"

    await db.interventions.insert_one(doc)
    return {"status": "created", "entity_type": "Intervention", "id": doc_id, "batiment_id": doc.get("batiment_id")}


# ======================== DOSSIER ADRESSE (BÂTIMENT) ========================

async def _handle_dossier_adresse(record: dict, tenant, user, source: str) -> dict:
    addr, city = _extract_address_city(record)
    if not addr:
        return {"status": "error", "entity_type": "DossierAdresse", "message": "Adresse manquante"}

    # Doublon par adresse → REMPLACER
    existing = await db.batiments.find_one(
        {"tenant_id": tenant.id, "adresse_civique": addr, "ville": city}, {"_id": 0, "id": 1}
    )
    if existing:
        return await _queue_duplicate(tenant.id, "DossierAdresse", "batiments", existing["id"], record, user.id)

    def safe_int(v):
        if not v or v == "-1":
            return None
        try:
            return int(float(str(v).replace(" ", "")))
        except (ValueError, TypeError):
            return None

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "adresse_civique": addr,
        "ville": city,
        "code_postal": record.get("code_postal") or "",
        "province": record.get("province") or "Québec",
        "pays": "Canada",
        "nom_etablissement": record.get("proprietaire_nom") or "",
        "nombre_etages": safe_int(record.get("nombre_etages")),
        "annee_construction": safe_int(record.get("annee_construction")),
        "niveau_risque": record.get("categorie_risque") or "Faible",
        "sous_type_batiment": record.get("type_batiment") or "",
        "notes": record.get("notes") or "",
        "contact_nom": record.get("proprietaire_nom") or "",
        "contact_telephone": record.get("telephone") or "",
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
        "external_id": ext_id,
        "type_inspection": record.get("type_prev") or "Prévention",
        "adresse": addr,
        "ville": city,
        "date_inspection": record.get("date_activite") or "",
        "inspecteur": record.get("auteur") or record.get("responsable") or "",
        "resultat": record.get("statut") or "",
        "notes": record.get("narratif") or "",
        "anomalies": record.get("anomalies") or [],
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
    if ext_id:
        existing = await db.rcci.find_one(
            {"tenant_id": tenant.id, "external_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "RCCI", "rcci", existing["id"], record, user.id)

    addr, city = _extract_address_city(record)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "external_id": ext_id,
        "adresse": addr,
        "ville": city,
        "date": record.get("date_activite") or "",
        "auteur": record.get("auteur") or "",
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
    matricule = record.get("matricule") or ""
    nom = record.get("nom") or ""
    prenom = record.get("prenom") or ""

    if matricule:
        existing = await db.imported_personnel.find_one(
            {"tenant_id": tenant.id, "matricule": matricule}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, "Employe", "imported_personnel", existing["id"], record, user.id)

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "nom": nom,
        "prenom": prenom,
        "matricule": matricule,
        "email": record.get("couriel") or record.get("courriel") or "",
        "telephone": record.get("cell") or record.get("tel_bureau") or "",
        "caserne": record.get("caserne") or "",
        "type_employe": record.get("type_employe") or "",
        "date_embauche": record.get("date_embauche") or "",
        "actif": record.get("inactif") != "Oui",
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.imported_personnel.insert_one(doc)
    return {"status": "created", "entity_type": "Employe", "id": doc_id}


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
        "type": "borne_seche",
        "nom": nom,
        "adresse": record.get("adresse") or "",
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
        "type": record.get("type_point_eau") or "point_eau",
        "nom": nom,
        "adresse": record.get("adresse") or "",
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
        "external_id": ext_id,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.travaux.insert_one(doc)
    return {"status": "created", "entity_type": "Travail", "id": doc_id}


# ======================== RÉFÉRENTIELS (générique) ========================

async def _handle_referentiel(entity_type: str, record: dict, tenant, user, source: str) -> dict:
    """Handler générique pour les petites tables de référence."""
    collection_name = f"ref_{entity_type.lower()}"
    nom = record.get("nom") or record.get("code") or record.get("description") or ""

    if nom:
        existing = await db[collection_name].find_one(
            {"tenant_id": tenant.id, "nom": nom}, {"_id": 0, "id": 1}
        )
        if existing:
            return await _queue_duplicate(tenant.id, entity_type, collection_name, existing["id"], record, "system")

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "nom": nom,
        "pfm_record": record,
        "import_source": source,
        "imported_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db[collection_name].insert_one(doc)
    return {"status": "created", "entity_type": entity_type, "id": doc_id}
