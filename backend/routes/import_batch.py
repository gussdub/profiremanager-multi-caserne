"""
Endpoint générique d'import batch pour ProFireManager Transfer.
Reçoit des records un par un depuis PremLigne et les stocke selon entity_type.

Le record est stocké TEL QUEL (déjà résolu par _fullResolveNode côté Transfer).
On extrait seulement les champs nécessaires pour le matching et l'indexation.

POST /api/{tenant}/import/batch
{
  "entity_type": "Intervention" | "DossierAdresse" | "Prevention" | ...,
  "source_system": "PremLigne",
  "record": { ... }
}
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
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

        chrono = record.get("chronologie") or {}
        if isinstance(chrono, str):
            chrono = {}
        carte = record.get("carte_appel") or {}
        if isinstance(carte, str):
            carte = {}
        lieu = record.get("lieu_interv") or {}
        if isinstance(lieu, str):
            lieu = {}
        cr = record.get("compte_rendu") or {}
        if isinstance(cr, str):
            cr = {"description": cr}

        # === ADRESSE ===
        # Format résolu: id_dossier_adresse = "500 chemin VALLEY, Brome"
        # Format brut: lieu_interv.desc_lieu = "de 1500, SCENIC (CHEMIN), SUTTON"
        addr = (record.get("id_dossier_adresse") or record.get("dossier_adresse") or "")
        city = ""
        if not addr:
            raw_lieu = lieu.get("desc_lieu") or ""
            if raw_lieu:
                # Parser "de 1500, SCENIC (CHEMIN), SUTTON" → "1500 SCENIC, SUTTON"
                addr = raw_lieu.lstrip("de ").strip()
            city = lieu.get("ville") or ""
        if not city and addr and "," in addr:
            parts = addr.split(",")
            city = parts[-1].strip().lstrip("*").strip()
            addr = ",".join(parts[:-1]).strip()

        # === TYPE / NATURE ===
        type_intv = (record.get("id_code_appel") or record.get("code_appel")
                     or record.get("type_intervention") or "")

        # === OFFICIER / RESPONSABLE ===
        officier = (record.get("id_responsable") or record.get("responsable")
                    or record.get("id_auteur") or record.get("auteur") or "")

        # === NOTES / COMPTE RENDU ===
        notes = cr.get("description") or cr.get("narratif") or ""
        if not notes:
            notes = record.get("notes") or record.get("narratif") or ""

        # === CASERNE ===
        caserne = record.get("id_caserne") or record.get("caserne") or ""

        # === VÉHICULES ===
        vehicules = record.get("vehicules") or record.get("ressources") or []

        # === CALLER (peut être dans carte_appel ou parsé des notes) ===
        caller_name = carte.get("nom_demandeur") or carte.get("de_qui") or ""
        caller_phone = carte.get("tel_demandeur") or carte.get("tel_de_qui") or ""
        # Parser depuis les notes si pas trouvé directement
        if not caller_name and notes:
            import re
            m = re.search(r"Nom du demandeur\s*:\s*(.+?)(?:\n|$)", notes)
            if m:
                caller_name = m.group(1).strip().rstrip("-").strip()
        if not caller_phone and notes:
            m = re.search(r"Tel du demandeur\s*:\s*(\S+)", notes)
            if m:
                caller_phone = m.group(1).strip()

        update = {
            "address_full": addr or doc.get("address_full") or "",
            "municipality": city or doc.get("municipality") or "",
            "type_intervention": type_intv or doc.get("type_intervention") or "",
            "officer_in_charge_xml": officier or doc.get("officer_in_charge_xml") or "",
            "caserne": caserne or doc.get("caserne") or "",
            "notes": notes or doc.get("notes") or "",
            "vehicules": vehicules if vehicules else doc.get("vehicules") or [],
            "caller_name": caller_name,
            "caller_phone": caller_phone,
            "code_feu": record.get("code_feu") or doc.get("code_feu") or "",
            # Chronologie — format brut: "appel", format résolu: "date_appel"
            "xml_time_call_received": chrono.get("appel") or chrono.get("date_appel") or carte.get("heure_appel") or record.get("date_activite") or doc.get("xml_time_call_received") or "",
            "xml_time_alert": chrono.get("transmission") or chrono.get("alerte") or carte.get("heure_alerte") or "",
            "xml_time_departure": chrono.get("depart_caserne") or chrono.get("depart") or carte.get("heure_depart") or "",
            "xml_time_arrival": chrono.get("arrivee_prem_vehicule") or carte.get("heure_arrivee") or "",
            "xml_time_force_frappe": chrono.get("arrivee_force_frappe") or "",
            "xml_time_maitrise": chrono.get("maitrise") or "",
            "xml_time_return": chrono.get("retour") or carte.get("heure_retour") or "",
            "xml_time_end": chrono.get("fin_intervention") or chrono.get("disponible") or carte.get("heure_disp_caserne") or "",
            "statut_premligne": record.get("statut") or "",
        }

        # Auto-match bâtiment si pas encore fait
        if not doc.get("batiment_id") and update["address_full"]:
            bat_id = await _match_address(update["address_full"], update["municipality"], tenant.id)
            if bat_id:
                update["batiment_id"] = bat_id
                update["match_method"] = "auto_address"

        await db.interventions.update_one(
            {"tenant_id": tenant.id, "id": doc["id"]},
            {"$set": update}
        )
        fixed += 1

    return {"fixed": fixed, "message": f"{fixed} intervention(s) corrigée(s)"}



# ======================== INTERVENTION ========================

async def _handle_intervention(record: dict, tenant, user, source: str) -> dict:
    """Crée une intervention depuis un record PremLigne. Extraction exhaustive."""
    ext_id = _get_ext_id(record)
    if ext_id:
        existing = await db.interventions.find_one(
            {"tenant_id": tenant.id, "external_call_id": ext_id}, {"_id": 0, "id": 1}
        )
        if existing:
            return {"status": "duplicate", "entity_type": "Intervention", "id": existing["id"]}

    # Adresse — Format résolu: id_dossier_adresse = "500 chemin VALLEY, Brome"
    #           Format brut: lieu_interv.desc_lieu = "de 1500, SCENIC (CHEMIN), SUTTON"
    lieu = record.get("lieu_interv") or {}
    if isinstance(lieu, str):
        lieu = {}
    addr = (record.get("id_dossier_adresse") or record.get("dossier_adresse") or "")
    city = ""
    if not addr:
        raw_lieu = lieu.get("desc_lieu") or record.get("adresse") or record.get("adresse_appel") or ""
        if raw_lieu:
            addr = raw_lieu.lstrip("de ").strip()
        city = lieu.get("ville") or ""
    if not city:
        city = record.get("ville") or record.get("municipalite") or ""
    if not city and addr and "," in addr:
        parts = addr.split(",")
        city = parts[-1].strip().lstrip("*").strip()
        addr = ",".join(parts[:-1]).strip()

    # Type (résolu: id_code_appel / brut: peut être absent)
    type_intv = (record.get("id_code_appel") or record.get("code_appel")
                 or record.get("type_intervention") or record.get("nature") or "")

    # Chronologie — brut: "appel" / résolu: "date_appel"
    chrono = record.get("chronologie") or {}
    if isinstance(chrono, str):
        chrono = {}
    carte = record.get("carte_appel") or {}
    if isinstance(carte, str):
        carte = {}

    date_appel = (chrono.get("appel") or chrono.get("date_appel") or carte.get("heure_appel")
                  or record.get("date_activite") or record.get("date_ident") or "")
    date_alerte = chrono.get("transmission") or chrono.get("alerte") or carte.get("heure_alerte") or ""
    date_depart = chrono.get("depart_caserne") or chrono.get("depart") or carte.get("heure_depart") or ""
    date_arrivee = chrono.get("arrivee_prem_vehicule") or carte.get("heure_arrivee") or ""
    date_force_frappe = chrono.get("arrivee_force_frappe") or ""
    date_maitrise = chrono.get("maitrise") or ""
    date_retour = chrono.get("retour") or carte.get("heure_retour") or ""
    date_fin = chrono.get("fin_intervention") or chrono.get("disponible") or carte.get("heure_disp_caserne") or ""

    # Officier / Auteur
    officier = (record.get("id_responsable") or record.get("responsable")
                or record.get("id_auteur") or record.get("auteur") or "")

    # Compte rendu
    cr = record.get("compte_rendu") or {}
    if isinstance(cr, str):
        cr = {"description": cr}
    notes = cr.get("description") or cr.get("narratif") or ""
    if not notes:
        notes = record.get("notes") or record.get("narratif") or ""

    # Parser appelant depuis les notes si pas dans carte_appel
    import re as _re
    caller_name = carte.get("nom_demandeur") or carte.get("de_qui") or ""
    caller_phone = carte.get("tel_demandeur") or carte.get("tel_de_qui") or ""
    if not caller_name and notes:
        m = _re.search(r"Nom du demandeur\s*:\s*(.+?)(?:\n|$|-{3,})", notes)
        if m:
            caller_name = m.group(1).strip()
    if not caller_phone and notes:
        m = _re.search(r"Tel du demandeur\s*:\s*(\S+)", notes)
        if m:
            caller_phone = m.group(1).strip()

    caserne = record.get("id_caserne") or record.get("caserne") or ""
    vehicules = record.get("vehicules") or record.get("ressources") or []
    cause = record.get("cause_incendie") or {}
    if isinstance(cause, str):
        cause = {}

    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "tenant_id": tenant.id,
        "external_call_id": ext_id,
        "type_intervention": type_intv,
        "address_full": addr,
        "municipality": city,
        "code_feu": record.get("code_feu") or carte.get("code_feu") or "",
        "niveau_risque": record.get("niveau_risque") or "",
        "caserne": caserne,
        # Chronologie complète
        "xml_time_call_received": date_appel,
        "xml_time_alert": date_alerte,
        "xml_time_departure": date_depart,
        "xml_time_arrival": date_arrivee,
        "xml_time_force_frappe": date_force_frappe,
        "xml_time_maitrise": date_maitrise,
        "xml_time_return": date_retour,
        "xml_time_end": date_fin,
        # Rapport
        "notes": notes,
        "officer_in_charge_xml": officier,
        "caller_name": caller_name,
        "caller_phone": caller_phone,
        # Véhicules
        "vehicules": vehicules,
        # Cause incendie
        "cause_incendie": cause if cause else None,
        # Méta
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

    # Auto-match bâtiment
    bat_id = await _match_address(addr, city, tenant.id)
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

    # Doublon par adresse exacte
    existing = await db.batiments.find_one(
        {"tenant_id": tenant.id, "adresse_civique": addr, "ville": city}, {"_id": 0, "id": 1}
    )
    if existing:
        return {"status": "duplicate", "entity_type": "DossierAdresse", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "Prevention", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "RCCI", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "PlanIntervention", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "Employe", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "BorneIncendie", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "BorneSeche", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "PointEau", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "MaintenanceBorne", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": "Travail", "id": existing["id"]}

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
            return {"status": "duplicate", "entity_type": entity_type, "id": existing["id"]}

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
