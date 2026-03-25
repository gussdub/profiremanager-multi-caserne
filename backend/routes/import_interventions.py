"""
Routes pour l'import d'historique d'interventions.
Supporte CSV, XML et ZIP (contenant des fichiers CSV/XML).
"""
import csv
import uuid
import re
import zipfile
import json
import os
import xml.etree.ElementTree as ET
from io import StringIO, BytesIO
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    require_permission,
)

router = APIRouter(tags=["Import Interventions Historique"])
import logging
logger = logging.getLogger(__name__)


# Sessions d'import en mémoire
import_sessions: Dict[str, dict] = {}


def parse_csv_interventions(csv_text: str) -> List[Dict[str, Any]]:
    """Parse un CSV d'historique d'interventions."""
    reader = csv.DictReader(StringIO(csv_text))
    interventions = []

    for row in reader:
        # Détection des colonnes possibles (ProFireManager ou format générique)
        intervention = {
            "type_intervention": "",
            "address_full": "",
            "municipality": "",
            "status": "signed",
        }

        # Mapper les colonnes connues
        col_map = {
            # Numéro d'intervention
            "no intervention": "external_call_id",
            "no_intervention": "external_call_id",
            "numero": "external_call_id",
            "no carte": "external_call_id",
            "no_carte": "external_call_id",
            "id": "pfm_id",
            # Type
            "type": "type_intervention",
            "type intervention": "type_intervention",
            "type_intervention": "type_intervention",
            "nature": "type_intervention",
            "code feu": "code_feu",
            "code_feu": "code_feu",
            # Adresse
            "adresse": "address_full",
            "address": "address_full",
            "lieu": "address_full",
            "no porte": "address_civic",
            "rue": "address_street",
            # Ville
            "ville": "municipality",
            "municipalite": "municipality",
            "municipalité": "municipality",
            "municipality": "municipality",
            # Date
            "date": "date_str",
            "date appel": "date_str",
            "date_appel": "date_str",
            "date intervention": "date_str",
            # Heure
            "heure": "time_str",
            "heure appel": "time_str",
            "heure_appel": "time_str",
            # Description / notes
            "description": "notes",
            "note": "notes",
            "notes": "notes",
            "commentaire": "notes",
            "remarque": "notes",
            # Niveau de risque
            "niveau risque": "niveau_risque",
            "niveau_risque": "niveau_risque",
            "risque": "niveau_risque",
            # Officier en charge
            "officier": "officer_in_charge_xml",
            "officier en charge": "officer_in_charge_xml",
        }

        for csv_col, field in col_map.items():
            for key in row.keys():
                if key.strip().lower() == csv_col:
                    val = row[key].strip()
                    if val:
                        intervention[field] = val
                    break

        # Construire la date
        date_str = intervention.pop("date_str", "")
        time_str = intervention.pop("time_str", "")
        if date_str:
            try:
                for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M"]:
                    try:
                        dt = datetime.strptime(date_str, fmt)
                        if time_str:
                            for tf in ["%H:%M:%S", "%H:%M"]:
                                try:
                                    t = datetime.strptime(time_str, tf)
                                    dt = dt.replace(hour=t.hour, minute=t.minute, second=t.second)
                                    break
                                except ValueError:
                                    pass
                        intervention["xml_time_call_received"] = dt.isoformat()
                        break
                    except ValueError:
                        continue
            except Exception:
                pass

        # Construire l'adresse si nécessaire
        if not intervention.get("address_full"):
            parts = []
            if intervention.get("address_civic"):
                parts.append(intervention["address_civic"])
            if intervention.get("address_street"):
                parts.append(intervention["address_street"])
            if parts:
                intervention["address_full"] = " ".join(parts)

        # Ignorer les lignes vides
        if not intervention.get("address_full") and not intervention.get("external_call_id") and not intervention.get("type_intervention"):
            continue

        interventions.append(intervention)

    return interventions


def parse_xml_interventions_batch(xml_bytes: bytes) -> List[Dict[str, Any]]:
    """Parse un fichier XML contenant des interventions (format carte d'appel 911)."""
    interventions = []
    try:
        root = ET.fromstring(xml_bytes)
        for table in root.findall('.//Table'):
            intervention = {
                "external_call_id": table.findtext('noCarteAppel') or table.findtext('idCarteAppel') or "",
                "address_civic": table.findtext('noPorte') or "",
                "address_street": table.findtext('rue') or "",
                "municipality": (table.findtext('villePourQui') or "").title(),
                "type_intervention": table.findtext('typeIntervention') or "",
                "code_feu": table.findtext('codeFeu') or "",
                "niveau_risque": table.findtext('niveauRisque') or "",
                "officer_in_charge_xml": table.findtext('officierCharge') or "",
                "caller_name": table.findtext('deQui') or "",
                "caller_phone": table.findtext('telDeQui') or "",
                "status": "signed",
            }

            # Construire l'adresse
            parts = []
            if intervention.get("address_civic"):
                parts.append(intervention["address_civic"])
            if intervention.get("address_street"):
                parts.append(intervention["address_street"])
            intervention["address_full"] = " ".join(parts)

            # Date
            date_str = table.findtext('dateAppel') or ""
            time_str = table.findtext('heureAppel') or ""
            if date_str:
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    if time_str and time_str != "00:00:00":
                        t = datetime.strptime(time_str, "%H:%M:%S")
                        dt = dt.replace(hour=t.hour, minute=t.minute, second=t.second)
                    intervention["xml_time_call_received"] = dt.isoformat()
                except ValueError:
                    pass

            if intervention.get("address_full") or intervention.get("external_call_id"):
                interventions.append(intervention)
    except ET.ParseError:
        pass
    return interventions


@router.post("/{tenant_slug}/interventions/import-history/preview")
async def preview_intervention_import(
    tenant_slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Prévisualise un import d'historique d'interventions (CSV, XML ou ZIP)."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "creer", "rapports")

    contents = await file.read()
    filename = file.filename.lower()
    all_interventions = []
    file_count = 0

    if filename.endswith(".zip"):
        try:
            zf = zipfile.ZipFile(BytesIO(contents))
            for name in zf.namelist():
                lower_name = name.lower()
                if lower_name.endswith(".csv"):
                    try:
                        csv_text = zf.read(name).decode("utf-8")
                    except UnicodeDecodeError:
                        csv_text = zf.read(name).decode("latin-1")
                    all_interventions.extend(parse_csv_interventions(csv_text))
                    file_count += 1
                elif lower_name.endswith(".xml"):
                    all_interventions.extend(parse_xml_interventions_batch(zf.read(name)))
                    file_count += 1
            zf.close()
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Fichier ZIP invalide")
    elif filename.endswith(".csv"):
        try:
            csv_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            csv_text = contents.decode("latin-1")
        all_interventions = parse_csv_interventions(csv_text)
        file_count = 1
    elif filename.endswith(".xml"):
        all_interventions = parse_xml_interventions_batch(contents)
        file_count = 1
    else:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez CSV, XML ou ZIP.")

    if not all_interventions:
        raise HTTPException(status_code=400, detail="Aucune intervention trouvée dans le fichier")

    # Vérifier les doublons
    existing_call_ids = set()
    ext_ids = [i.get("external_call_id") for i in all_interventions if i.get("external_call_id")]
    if ext_ids:
        existing = await db.interventions.find(
            {"tenant_id": tenant.id, "external_call_id": {"$in": ext_ids}},
            {"_id": 0, "external_call_id": 1},
        ).to_list(length=None)
        existing_call_ids = {e["external_call_id"] for e in existing}

    new_items = []
    duplicates = []
    for idx, intv in enumerate(all_interventions):
        if intv.get("external_call_id") in existing_call_ids:
            duplicates.append({"index": idx, "data": intv})
        else:
            new_items.append({"index": idx, "data": intv})

    session_id = str(uuid.uuid4())
    import_sessions[session_id] = {
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "interventions": all_interventions,
        "new_items": new_items,
        "duplicates": duplicates,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Aperçu des premières interventions
    preview_items = [
        {
            "index": item["index"],
            "external_call_id": item["data"].get("external_call_id", ""),
            "type_intervention": item["data"].get("type_intervention", ""),
            "address_full": item["data"].get("address_full", ""),
            "municipality": item["data"].get("municipality", ""),
            "date": item["data"].get("xml_time_call_received", ""),
        }
        for item in new_items[:20]
    ]

    return {
        "session_id": session_id,
        "total": len(all_interventions),
        "new_count": len(new_items),
        "duplicate_count": len(duplicates),
        "files_processed": file_count,
        "preview": preview_items,
    }


@router.post("/{tenant_slug}/interventions/import-history/execute")
async def execute_intervention_import(
    tenant_slug: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Exécute l'import d'historique d'interventions."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "creer", "rapports")

    session_id = body.get("session_id")
    skip_duplicates = body.get("skip_duplicates", True)

    session = import_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session d'import expirée ou invalide")
    if session["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    items_to_import = session["new_items"]
    if not skip_duplicates:
        items_to_import = items_to_import + session["duplicates"]

    created = 0
    errors = []

    for item in items_to_import:
        try:
            data = dict(item["data"])
            data["id"] = str(uuid.uuid4())
            data["tenant_id"] = tenant.id
            data["status"] = data.get("status", "signed")
            data["created_at"] = datetime.now(timezone.utc).isoformat()
            data["imported_at"] = datetime.now(timezone.utc).isoformat()
            data["imported_by"] = current_user.id
            data["import_source"] = "history_import"
            data["audit_log"] = [{
                "action": "imported_history",
                "by": current_user.id,
                "at": datetime.now(timezone.utc).isoformat(),
            }]
            data["assigned_reporters"] = []

            # Nettoyer pfm_id s'il existe
            data.pop("pfm_id", None)

            await db.interventions.insert_one(data)
            created += 1
        except Exception as e:
            errors.append({
                "index": item["index"],
                "error": str(e),
            })

    # Nettoyer la session
    del import_sessions[session_id]

    return {
        "success": True,
        "created": created,
        "errors": errors,
        "message": f"{created} intervention(s) importée(s) avec succès",
    }
