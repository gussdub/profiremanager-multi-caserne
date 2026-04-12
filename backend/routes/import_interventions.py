"""
Routes pour l'import d'historique d'interventions.
Supporte CSV, XML et ZIP (contenant des fichiers CSV/XML + dossier files/).
Gère l'import ProFireManager avec mapping intelligent d'adresses.
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
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    require_permission,
)
from utils.address_utils import normalize_address, extract_civic_number, extract_street_name, is_same_address
from services.azure_storage import put_object, MIME_TYPES

router = APIRouter(tags=["Import Interventions Historique"])
import logging
logger = logging.getLogger(__name__)

# Sessions d'import en mémoire
import_sessions: Dict[str, dict] = {}

# Chunks d'upload en mémoire
upload_chunks: Dict[str, dict] = {}


# ======================== PARSEURS CSV ========================

def parse_pfm_csv_dossier_adresse(csv_text: str) -> List[Dict[str, Any]]:
    """Parse un CSV DossierAdresse au format ProFireManager Transfer."""
    reader = csv.DictReader(StringIO(csv_text))
    records = []
    for row in reader:
        record = {}
        for key in row:
            clean_key = key.strip()
            val = row[key].strip() if row[key] else ""
            record[clean_key] = val
        records.append(record)
    return records


def parse_pfm_csv_intervention(csv_text: str) -> List[Dict[str, Any]]:
    """Parse un CSV Intervention au format ProFireManager Transfer."""
    reader = csv.DictReader(StringIO(csv_text))
    records = []
    for row in reader:
        record = {}
        for key in row:
            clean_key = key.strip()
            val = row[key].strip() if row[key] else ""
            record[clean_key] = val
        records.append(record)
    return records


def normalize_pfm_dossier(raw: dict) -> dict:
    """Normalise un enregistrement DossierAdresse PFM en format interne."""
    adresse = raw.get("Adresse", "")
    # Format: "93 chemin BOULANGER, Sutton" ou "11 rue MAPLE app. 1, *Sutton"
    ville = ""
    adresse_parts = adresse.split(",")
    if len(adresse_parts) >= 2:
        ville = adresse_parts[-1].strip().lstrip("*").strip()
        adresse_civique = ",".join(adresse_parts[:-1]).strip()
    else:
        adresse_civique = adresse.strip()

    # Année construction
    annee = raw.get("Année construction", "")
    try:
        annee = int(annee) if annee and annee != "-1" else None
    except (ValueError, TypeError):
        annee = None

    # Nombre d'étages
    nbr_etages = raw.get("Nbr etage", "")
    try:
        nbr_etages = int(float(nbr_etages)) if nbr_etages and nbr_etages != "-1" else None
    except (ValueError, TypeError):
        nbr_etages = None

    # Nombre logements
    nbr_logements = raw.get("Nbr logement", "")
    try:
        nbr_logements = int(nbr_logements) if nbr_logements and nbr_logements != "-1" and nbr_logements != "0" else None
    except (ValueError, TypeError):
        nbr_logements = None

    # Catégorie de risque
    risque_map = {"1": "Faible", "2": "Moyen", "3": "Élevé", "4": "Très élevé"}
    risque_id = raw.get("I d categ risque", "")
    niveau_risque = risque_map.get(risque_id, "Faible")

    # Notes
    note = raw.get("Note", "")

    return {
        "pfm_id": raw.get("ID", ""),
        "matricule": raw.get("Matricule", ""),
        "adresse_civique": adresse_civique,
        "ville": ville,
        "code_postal": "",
        "annee_construction": annee,
        "nombre_etages": nbr_etages,
        "nombre_logements": nbr_logements,
        "niveau_risque": niveau_risque,
        "notes": note if note else None,
        "raison_sociale": raw.get("Raison sociale", "") or None,
        "subdivision": raw.get("Subdivision", "") or None,
        "photos": [],
    }


def normalize_pfm_intervention(raw: dict) -> dict:
    """Normalise un enregistrement Intervention PFM en format interne."""
    # Map columns - the CSV may have various column names
    col_map = {
        "no intervention": "external_call_id",
        "no_intervention": "external_call_id",
        "numero": "external_call_id",
        "no carte": "external_call_id",
        "no_carte": "external_call_id",
        "id": "pfm_id",
        "type": "type_intervention",
        "type intervention": "type_intervention",
        "type_intervention": "type_intervention",
        "nature": "type_intervention",
        "code feu": "code_feu",
        "code_feu": "code_feu",
        "adresse": "address_full",
        "address": "address_full",
        "lieu": "address_full",
        "no porte": "address_civic",
        "rue": "address_street",
        "ville": "municipality",
        "municipalite": "municipality",
        "municipalité": "municipality",
        "municipality": "municipality",
        "date": "date_str",
        "date appel": "date_str",
        "date_appel": "date_str",
        "date intervention": "date_str",
        "heure": "time_str",
        "heure appel": "time_str",
        "heure_appel": "time_str",
        "description": "notes",
        "note": "notes",
        "notes": "notes",
        "commentaire": "notes",
        "remarque": "notes",
        "niveau risque": "niveau_risque",
        "niveau_risque": "niveau_risque",
        "risque": "niveau_risque",
        "officier": "officer_in_charge_xml",
        "officier en charge": "officer_in_charge_xml",
        "dossier adresse id": "dossier_adresse_id",
        "dossier_adresse_id": "dossier_adresse_id",
        "id dossier adresse": "dossier_adresse_id",
        "statut": "statut_source",
    }

    intervention = {
        "type_intervention": "",
        "address_full": "",
        "municipality": "",
        "status": "signed",
    }

    for csv_col, field in col_map.items():
        for key in raw.keys():
            if key.strip().lower() == csv_col:
                val = raw[key].strip()
                if val:
                    intervention[field] = val
                break

    # Build date
    date_str = intervention.pop("date_str", "")
    time_str = intervention.pop("time_str", "")
    if date_str:
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S"]:
            try:
                dt = datetime.strptime(date_str.split(".")[0], fmt)
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

    # Build address if needed
    if not intervention.get("address_full"):
        parts = []
        if intervention.get("address_civic"):
            parts.append(intervention["address_civic"])
        if intervention.get("address_street"):
            parts.append(intervention["address_street"])
        if parts:
            intervention["address_full"] = " ".join(parts)

    # Parse municipality from address if not set
    if not intervention.get("municipality") and intervention.get("address_full"):
        addr = intervention["address_full"]
        addr_parts = addr.split(",")
        if len(addr_parts) >= 2:
            ville = addr_parts[-1].strip().lstrip("*").strip()
            if ville and not any(c.isdigit() for c in ville):
                intervention["municipality"] = ville

    # Remove temp fields
    intervention.pop("statut_source", None)

    return intervention


def parse_csv_interventions(csv_text: str) -> List[Dict[str, Any]]:
    """Parse un CSV d'historique d'interventions (format générique)."""
    reader = csv.DictReader(StringIO(csv_text))
    interventions = []

    for row in reader:
        intervention = normalize_pfm_intervention(row)
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

            parts = []
            if intervention.get("address_civic"):
                parts.append(intervention["address_civic"])
            if intervention.get("address_street"):
                parts.append(intervention["address_street"])
            intervention["address_full"] = " ".join(parts)

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


# ======================== MAPPING INTELLIGENT ========================

async def match_interventions_to_batiments(
    interventions: List[Dict],
    tenant_id: str,
    dossier_adresses: Optional[List[Dict]] = None
) -> List[Dict]:
    """
    Match intelligent des interventions aux bâtiments existants.
    
    Logique:
    1. Si dossier_adresse_id est fourni et qu'on a un mapping DossierAdresse, utiliser le lien direct
    2. Sinon, match par adresse normalisée (numéro civique + rue + ville)
    """
    # Charger tous les bâtiments du tenant
    batiments = await db.batiments.find(
        {"tenant_id": tenant_id, "$or": [{"actif": True}, {"actif": {"$exists": False}}, {"actif": None}]},
        {"_id": 0, "id": 1, "adresse_civique": 1, "ville": 1, "nom_etablissement": 1}
    ).to_list(length=None)

    # Pré-traiter les bâtiments: séparer l'adresse de la ville si elle est dans adresse_civique
    for bat in batiments:
        addr = bat.get("adresse_civique", "")
        ville = bat.get("ville", "")
        # Si l'adresse contient une virgule, la ville est peut-être dedans
        if "," in addr:
            parts = addr.split(",")
            possible_ville = parts[-1].strip().lstrip("*").strip()
            # Si la ville n'est pas déjà définie, ou correspond
            if possible_ville and (not ville or normalize_address(possible_ville) == normalize_address(ville)):
                bat["_clean_addr"] = ",".join(parts[:-1]).strip()
                if not ville:
                    bat["_clean_ville"] = possible_ville
                else:
                    bat["_clean_ville"] = ville
            else:
                bat["_clean_addr"] = addr
                bat["_clean_ville"] = ville
        else:
            bat["_clean_addr"] = addr
            bat["_clean_ville"] = ville

    # Construire un index des dossiers adresse si fourni
    dossier_index = {}
    if dossier_adresses:
        for da in dossier_adresses:
            pfm_id = da.get("pfm_id", "")
            if pfm_id:
                dossier_index[str(pfm_id)] = da

    # Aussi charger les dossiers adresse importés précédemment
    stored_das = await db.import_dossier_adresses.find(
        {"tenant_id": tenant_id},
        {"_id": 0, "pfm_id": 1, "adresse_civique": 1, "ville": 1}
    ).to_list(length=None)
    for da in stored_das:
        pfm_id = da.get("pfm_id", "")
        if pfm_id and str(pfm_id) not in dossier_index:
            dossier_index[str(pfm_id)] = da

    matched_interventions = []
    for intv in interventions:
        match_info = {
            "batiment_id": None,
            "batiment_adresse": None,
            "match_method": None,
            "match_score": 0,
        }

        # Méthode 1: Lien direct via dossier_adresse_id
        da_id = intv.get("dossier_adresse_id")
        if da_id and str(da_id) in dossier_index:
            da = dossier_index[str(da_id)]
            da_addr = da.get("adresse_civique", "")
            da_ville = da.get("ville", "")
            for bat in batiments:
                bat_addr = bat.get("_clean_addr", bat.get("adresse_civique", ""))
                bat_ville = bat.get("_clean_ville", bat.get("ville", ""))
                is_match, _ = is_same_address(da_addr, da_ville, bat_addr, bat_ville)
                if is_match:
                    match_info["batiment_id"] = bat["id"]
                    match_info["batiment_adresse"] = bat.get("adresse_civique", "")
                    match_info["match_method"] = "dossier_adresse"
                    match_info["match_score"] = 1.0
                    break

        # Méthode 2: Match par adresse de l'intervention
        if not match_info["batiment_id"]:
            intv_addr = intv.get("address_full", "")
            intv_city = intv.get("municipality", "")
            if intv_addr:
                for bat in batiments:
                    bat_addr = bat.get("_clean_addr", bat.get("adresse_civique", ""))
                    bat_ville = bat.get("_clean_ville", bat.get("ville", ""))
                    is_match, details = is_same_address(intv_addr, intv_city, bat_addr, bat_ville)
                    if is_match:
                        match_info["batiment_id"] = bat["id"]
                        match_info["batiment_adresse"] = bat.get("adresse_civique", "")
                        match_info["match_method"] = "address_match"
                        match_info["match_score"] = 1.0
                        break

        intv["_match"] = match_info
        matched_interventions.append(intv)

    return matched_interventions


# ======================== CHUNKED UPLOAD ========================

@router.post("/{tenant_slug}/interventions/import-history/init-upload")
async def init_chunked_upload(
    tenant_slug: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Initialise un upload par chunks pour les gros fichiers."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "creer", "rapports")

    filename = body.get("filename", "")
    total_size = body.get("total_size", 0)
    total_chunks = body.get("total_chunks", 0)

    upload_id = str(uuid.uuid4())
    upload_chunks[upload_id] = {
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "filename": filename,
        "total_size": total_size,
        "total_chunks": total_chunks,
        "received_chunks": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {"upload_id": upload_id, "status": "ready"}


@router.post("/{tenant_slug}/interventions/import-history/upload-chunk")
async def upload_chunk(
    tenant_slug: str,
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload un chunk individuel."""
    tenant = await get_tenant_from_slug(tenant_slug)

    session = upload_chunks.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session d'upload non trouvée")
    if session["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    chunk_data = await file.read()
    session["received_chunks"][chunk_index] = chunk_data

    received = len(session["received_chunks"])
    total = session["total_chunks"]

    return {
        "status": "received",
        "chunk_index": chunk_index,
        "received": received,
        "total": total,
        "complete": received >= total,
    }


@router.post("/{tenant_slug}/interventions/import-history/finalize-upload")
async def finalize_chunked_upload(
    tenant_slug: str,
    body: dict,
    current_user: User = Depends(get_current_user),
):
    """Assemble les chunks et lance le preview."""
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "interventions", "creer", "rapports")

    upload_id = body.get("upload_id")
    session = upload_chunks.get(upload_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session d'upload non trouvée")
    if session["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    # Assembler les chunks dans l'ordre
    total = session["total_chunks"]
    if len(session["received_chunks"]) < total:
        raise HTTPException(status_code=400, detail=f"Chunks manquants: {len(session['received_chunks'])}/{total}")

    contents = b""
    for i in range(total):
        if i not in session["received_chunks"]:
            raise HTTPException(status_code=400, detail=f"Chunk {i} manquant")
        contents += session["received_chunks"][i]

    # Nettoyer les chunks de la mémoire
    del upload_chunks[upload_id]

    # Traiter le fichier assemblé
    filename = session["filename"].lower()
    return await _process_import_file(contents, filename, tenant, current_user)


# ======================== ROUTES EXISTANTES (AMÉLIORÉES) ========================

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
    return await _process_import_file(contents, filename, tenant, current_user)


async def _process_import_file(contents: bytes, filename: str, tenant, current_user) -> dict:
    """Logique commune pour traiter un fichier d'import (direct ou chunked)."""
    all_interventions = []
    dossier_adresses = []
    file_count = 0
    files_in_zip = {}
    manifest_data = {}

    if filename.endswith(".zip"):
        try:
            zf = zipfile.ZipFile(BytesIO(contents))
            namelist = zf.namelist()

            # Lire le manifest si présent
            if "manifest.json" in namelist:
                try:
                    manifest_data = json.loads(zf.read("manifest.json").decode("utf-8"))
                except Exception:
                    pass

            # Détecter le type de bundle
            entity_type = manifest_data.get("entityType", "")

            # Collecter les fichiers binaires (photos/PDFs)
            for name in namelist:
                if name.startswith("files/") and not name.endswith("/"):
                    files_in_zip[name] = True

            # Parser les CSV/XML
            for name in namelist:
                lower_name = name.lower()
                basename = os.path.basename(name).lower()

                if basename == "dossieradresse.csv" or (entity_type == "DossierAdresse" and lower_name.endswith(".csv")):
                    try:
                        csv_text = zf.read(name).decode("utf-8")
                    except UnicodeDecodeError:
                        csv_text = zf.read(name).decode("latin-1")
                    dossier_adresses = [normalize_pfm_dossier(r) for r in parse_pfm_csv_dossier_adresse(csv_text)]
                    file_count += 1

                elif basename == "intervention.csv" or (entity_type == "Intervention" and lower_name.endswith(".csv")):
                    try:
                        csv_text = zf.read(name).decode("utf-8")
                    except UnicodeDecodeError:
                        csv_text = zf.read(name).decode("latin-1")
                    all_interventions.extend(parse_csv_interventions(csv_text))
                    file_count += 1

                elif lower_name.endswith(".csv") and not lower_name.startswith("files/"):
                    try:
                        csv_text = zf.read(name).decode("utf-8")
                    except UnicodeDecodeError:
                        csv_text = zf.read(name).decode("latin-1")
                    # Detect type from first line
                    first_line = csv_text.split("\n")[0].lower()
                    if "dossier" in first_line or "matricule" in first_line:
                        dossier_adresses = [normalize_pfm_dossier(r) for r in parse_pfm_csv_dossier_adresse(csv_text)]
                    else:
                        all_interventions.extend(parse_csv_interventions(csv_text))
                    file_count += 1

                elif lower_name.endswith(".xml") and not lower_name.startswith("files/"):
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

    # Si c'est un ZIP DossierAdresse sans interventions, on le stocke comme données de référence
    if not all_interventions and dossier_adresses:
        session_id = str(uuid.uuid4())
        import_sessions[session_id] = {
            "tenant_id": tenant.id,
            "user_id": current_user.id,
            "type": "dossier_adresse",
            "dossier_adresses": dossier_adresses,
            "files_in_zip": list(files_in_zip.keys()),
            "zip_contents": contents,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return {
            "session_id": session_id,
            "type": "dossier_adresse",
            "total": len(dossier_adresses),
            "new_count": len(dossier_adresses),
            "duplicate_count": 0,
            "files_count": len(files_in_zip),
            "files_processed": file_count,
            "preview": [
                {
                    "index": i,
                    "pfm_id": da.get("pfm_id", ""),
                    "adresse_civique": da.get("adresse_civique", ""),
                    "ville": da.get("ville", ""),
                    "notes": (da.get("notes", "") or "")[:80],
                }
                for i, da in enumerate(dossier_adresses[:20])
            ],
            "message": f"{len(dossier_adresses)} dossier(s) d'adresse trouvé(s). Ces données seront utilisées pour le mapping lors de l'import des interventions."
        }

    if not all_interventions:
        raise HTTPException(status_code=400, detail="Aucune intervention trouvée dans le fichier")

    # Mapping intelligent avec les bâtiments
    matched = await match_interventions_to_batiments(all_interventions, tenant.id, dossier_adresses)

    # Vérifier les doublons
    existing_call_ids = set()
    ext_ids = [i.get("external_call_id") for i in matched if i.get("external_call_id")]
    pfm_ids = [i.get("pfm_id") for i in matched if i.get("pfm_id")]
    if ext_ids:
        existing = await db.interventions.find(
            {"tenant_id": tenant.id, "external_call_id": {"$in": ext_ids}},
            {"_id": 0, "external_call_id": 1},
        ).to_list(length=None)
        existing_call_ids = {e["external_call_id"] for e in existing}
    if pfm_ids:
        existing_pfm = await db.interventions.find(
            {"tenant_id": tenant.id, "pfm_id": {"$in": pfm_ids}},
            {"_id": 0, "pfm_id": 1},
        ).to_list(length=None)
        existing_call_ids.update({e["pfm_id"] for e in existing_pfm})

    new_items = []
    duplicates = []
    for idx, intv in enumerate(matched):
        is_dup = False
        if intv.get("external_call_id") in existing_call_ids:
            is_dup = True
        if intv.get("pfm_id") and intv["pfm_id"] in existing_call_ids:
            is_dup = True
        if is_dup:
            duplicates.append({"index": idx, "data": intv})
        else:
            new_items.append({"index": idx, "data": intv})

    # Stats de matching
    matched_count = sum(1 for item in new_items if item["data"].get("_match", {}).get("batiment_id"))
    unmatched_count = len(new_items) - matched_count

    session_id = str(uuid.uuid4())
    import_sessions[session_id] = {
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "type": "intervention",
        "interventions": matched,
        "new_items": new_items,
        "duplicates": duplicates,
        "dossier_adresses": dossier_adresses,
        "files_in_zip": list(files_in_zip.keys()),
        "zip_contents": contents if files_in_zip else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    preview_items = [
        {
            "index": item["index"],
            "external_call_id": item["data"].get("external_call_id", ""),
            "pfm_id": item["data"].get("pfm_id", ""),
            "type_intervention": item["data"].get("type_intervention", ""),
            "address_full": item["data"].get("address_full", ""),
            "municipality": item["data"].get("municipality", ""),
            "date": item["data"].get("xml_time_call_received", ""),
            "batiment_id": item["data"].get("_match", {}).get("batiment_id"),
            "batiment_adresse": item["data"].get("_match", {}).get("batiment_adresse"),
            "match_method": item["data"].get("_match", {}).get("match_method"),
        }
        for item in new_items[:30]
    ]

    return {
        "session_id": session_id,
        "type": "intervention",
        "total": len(matched),
        "new_count": len(new_items),
        "duplicate_count": len(duplicates),
        "matched_count": matched_count,
        "unmatched_count": unmatched_count,
        "files_count": len(files_in_zip),
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

    # Handle DossierAdresse import (stockage comme référence)
    if session.get("type") == "dossier_adresse":
        return await _execute_dossier_adresse_import(session, tenant, current_user, session_id)

    # Handle Intervention import
    items_to_import = session["new_items"]
    if not skip_duplicates:
        items_to_import = items_to_import + session["duplicates"]

    created = 0
    errors = []
    files_uploaded = 0

    # Upload des fichiers joints si disponibles
    zip_contents = session.get("zip_contents")
    file_blob_map = {}
    if zip_contents:
        try:
            zf = zipfile.ZipFile(BytesIO(zip_contents))
            for file_path in session.get("files_in_zip", []):
                try:
                    file_data = zf.read(file_path)
                    file_name = os.path.basename(file_path)
                    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
                    content_type = MIME_TYPES.get(ext, "application/octet-stream")
                    blob_path = f"profiremanager/{tenant.id}/import-history/{uuid.uuid4()}.{ext}"
                    put_object(blob_path, file_data, content_type)
                    # Map le nom de fichier (sans extension parfois) au blob
                    file_id = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
                    file_blob_map[file_id] = {
                        "blob_name": blob_path,
                        "original_name": file_name,
                        "content_type": content_type,
                        "size": len(file_data),
                    }
                    files_uploaded += 1
                except Exception as e:
                    logger.warning("Erreur upload fichier %s: %s", file_path, e)
            zf.close()
        except Exception as e:
            logger.error("Erreur lecture ZIP pour fichiers: %s", e)

    for item in items_to_import:
        try:
            data = dict(item["data"])
            match_info = data.pop("_match", {})

            data["id"] = str(uuid.uuid4())
            data["tenant_id"] = tenant.id
            data["status"] = data.get("status", "signed")
            data["created_at"] = datetime.now(timezone.utc).isoformat()
            data["imported_at"] = datetime.now(timezone.utc).isoformat()
            data["imported_by"] = current_user.id
            data["import_source"] = "history_import"

            # Lien avec le bâtiment
            if match_info.get("batiment_id"):
                data["batiment_id"] = match_info["batiment_id"]
                data["match_method"] = match_info.get("match_method")

            data["audit_log"] = [{
                "action": "imported_history",
                "by": current_user.id,
                "at": datetime.now(timezone.utc).isoformat(),
            }]
            data["assigned_reporters"] = []

            # Associer les fichiers uploadés
            if file_blob_map:
                pfm_id = data.get("pfm_id", "")
                if pfm_id and pfm_id in file_blob_map:
                    data["imported_files"] = [file_blob_map[pfm_id]]

            # Nettoyer les champs temporaires
            data.pop("pfm_id", None)
            data.pop("dossier_adresse_id", None)

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
        "files_uploaded": files_uploaded,
        "errors": errors,
        "message": f"{created} intervention(s) importée(s) avec succès" + (f", {files_uploaded} fichier(s) uploadé(s)" if files_uploaded else ""),
    }


async def _execute_dossier_adresse_import(session, tenant, current_user, session_id):
    """Exécute l'import des DossierAdresse comme référence et enregistre dans la session."""
    dossier_adresses = session.get("dossier_adresses", [])
    files_in_zip = session.get("files_in_zip", [])
    zip_contents = session.get("zip_contents")
    files_uploaded = 0

    # Upload des fichiers
    file_blob_map = {}
    if zip_contents and files_in_zip:
        try:
            zf = zipfile.ZipFile(BytesIO(zip_contents))
            for file_path in files_in_zip:
                try:
                    file_data = zf.read(file_path)
                    file_name = os.path.basename(file_path)
                    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
                    content_type = MIME_TYPES.get(ext, "application/octet-stream")
                    blob_path = f"profiremanager/{tenant.id}/dossier-adresse/{uuid.uuid4()}.{ext}"
                    put_object(blob_path, file_data, content_type)
                    file_id = file_name.rsplit(".", 1)[0] if "." in file_name else file_name
                    file_blob_map[file_id] = {
                        "blob_name": blob_path,
                        "original_name": file_name,
                        "content_type": content_type,
                        "size": len(file_data),
                    }
                    files_uploaded += 1
                except Exception as e:
                    logger.warning("Erreur upload fichier DA %s: %s", file_path, e)
            zf.close()
        except Exception as e:
            logger.error("Erreur lecture ZIP DA: %s", e)

    # Stocker les dossiers d'adresse comme référence pour le mapping futur
    stored = 0
    for da in dossier_adresses:
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant.id,
            "pfm_id": da.get("pfm_id", ""),
            "adresse_civique": da.get("adresse_civique", ""),
            "ville": da.get("ville", ""),
            "code_postal": da.get("code_postal", ""),
            "annee_construction": da.get("annee_construction"),
            "nombre_etages": da.get("nombre_etages"),
            "nombre_logements": da.get("nombre_logements"),
            "niveau_risque": da.get("niveau_risque", "Faible"),
            "notes": da.get("notes"),
            "raison_sociale": da.get("raison_sociale"),
            "matricule": da.get("matricule", ""),
            "imported_at": datetime.now(timezone.utc).isoformat(),
            "imported_by": current_user.id,
            "import_source": "pfm_dossier_adresse",
            "files": [],
        }
        # Associer les fichiers
        pfm_id = da.get("pfm_id", "")
        if pfm_id and pfm_id in file_blob_map:
            doc["files"].append(file_blob_map[pfm_id])
        await db.import_dossier_adresses.insert_one(doc)
        stored += 1

    del import_sessions[session_id]

    return {
        "success": True,
        "created": stored,
        "files_uploaded": files_uploaded,
        "errors": [],
        "message": f"{stored} dossier(s) d'adresse importé(s) comme référence, {files_uploaded} fichier(s) uploadé(s). Ces données seront utilisées pour le mapping intelligent lors de l'import des interventions.",
    }


# ======================== ENDPOINT HISTORIQUE ========================

@router.get("/{tenant_slug}/interventions/historique-import")
async def get_imported_interventions(
    tenant_slug: str,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    municipality: Optional[str] = None,
    batiment_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
):
    """Récupère les interventions importées (historique) avec filtres."""
    tenant = await get_tenant_from_slug(tenant_slug)

    query = {
        "tenant_id": tenant.id,
        "import_source": "history_import",
    }

    if date_from:
        try:
            query["xml_time_call_received"] = {"$gte": date_from}
        except Exception:
            pass
    if date_to:
        try:
            if "xml_time_call_received" in query:
                query["xml_time_call_received"]["$lte"] = date_to
            else:
                query["xml_time_call_received"] = {"$lte": date_to}
        except Exception:
            pass
    if municipality:
        query["municipality"] = {"$regex": municipality, "$options": "i"}
    if batiment_id:
        query["batiment_id"] = batiment_id

    total = await db.interventions.count_documents(query)
    interventions = await db.interventions.find(
        query, {"_id": 0}
    ).sort("xml_time_call_received", -1).skip(offset).limit(limit).to_list(limit)

    return {
        "interventions": interventions,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/{tenant_slug}/batiments/{batiment_id}/interventions-historique")
async def get_batiment_interventions_historique(
    tenant_slug: str,
    batiment_id: str,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
):
    """Récupère toutes les interventions (importées et normales) liées à un bâtiment."""
    tenant = await get_tenant_from_slug(tenant_slug)

    # Chercher par batiment_id direct
    query = {
        "tenant_id": tenant.id,
        "batiment_id": batiment_id,
    }

    # Récupérer les interventions liées par batiment_id
    linked_interventions = await db.interventions.find(
        query, {"_id": 0}
    ).sort("xml_time_call_received", -1).limit(limit).to_list(limit)
    linked_ids = {i["id"] for i in linked_interventions}

    # Aussi chercher par correspondance d'adresse (pour les interventions normales sans batiment_id)
    batiment = await db.batiments.find_one(
        {"tenant_id": tenant.id, "id": batiment_id},
        {"_id": 0, "adresse_civique": 1, "ville": 1}
    )
    address_matched = []
    if batiment:
        addr = batiment.get("adresse_civique", "")
        ville = batiment.get("ville", "")
        if addr:
            # Nettoyer l'adresse (retirer ville si incluse)
            clean_addr = addr
            if "," in addr:
                parts = addr.split(",")
                possible_ville = parts[-1].strip().lstrip("*").strip()
                if possible_ville:
                    clean_addr = ",".join(parts[:-1]).strip()

            civic = extract_civic_number(clean_addr)
            if civic:
                street = extract_street_name(clean_addr)
                # Chercher les interventions sans batiment_id qui correspondent par adresse
                addr_regex = re.escape(civic) + ".*"
                addr_query = {
                    "tenant_id": tenant.id,
                    "$or": [
                        {"batiment_id": {"$exists": False}},
                        {"batiment_id": None},
                    ],
                    "address_full": {"$regex": addr_regex, "$options": "i"},
                }
                candidates = await db.interventions.find(
                    addr_query, {"_id": 0}
                ).sort("xml_time_call_received", -1).limit(limit).to_list(limit)

                for intv in candidates:
                    if intv["id"] not in linked_ids:
                        intv_addr = intv.get("address_full", "")
                        intv_city = intv.get("municipality", "")
                        is_match, _ = is_same_address(intv_addr, intv_city, clean_addr, ville or "")
                        if is_match:
                            address_matched.append(intv)

    # Combiner et trier
    all_interventions = linked_interventions + address_matched
    all_interventions.sort(key=lambda x: x.get("xml_time_call_received", x.get("created_at", "")), reverse=True)
    all_interventions = all_interventions[:limit]

    return {
        "interventions": all_interventions,
        "total": len(all_interventions),
    }


@router.get("/{tenant_slug}/import-history/dossier-adresses")
async def get_imported_dossier_adresses(
    tenant_slug: str,
    current_user: User = Depends(get_current_user),
):
    """Récupère les dossiers d'adresse importés (pour référence/mapping)."""
    tenant = await get_tenant_from_slug(tenant_slug)
    
    docs = await db.import_dossier_adresses.find(
        {"tenant_id": tenant.id},
        {"_id": 0}
    ).to_list(length=None)

    return {"dossier_adresses": docs, "total": len(docs)}


# ======================== MAPPING RÉTROACTIF ========================

async def auto_link_interventions_to_batiment(tenant_id: str, batiment_id: str, adresse_civique: str, ville: str):
    """
    Appelée automatiquement quand un bâtiment est créé ou importé.
    Relie les interventions orphelines (sans batiment_id) qui correspondent à cette adresse.
    Couvre les interventions importées (address_full) ET les interventions normales (adresse, adresse_incident).
    """
    if not adresse_civique:
        return 0

    # Nettoyer l'adresse du bâtiment (retirer la ville si elle est dans l'adresse)
    clean_addr = adresse_civique
    clean_ville = ville or ""
    if "," in adresse_civique:
        parts = adresse_civique.split(",")
        possible_ville = parts[-1].strip().lstrip("*").strip()
        if possible_ville and (not ville or normalize_address(possible_ville) == normalize_address(ville)):
            clean_addr = ",".join(parts[:-1]).strip()
            if not clean_ville:
                clean_ville = possible_ville

    civic = extract_civic_number(clean_addr)
    if not civic:
        return 0

    # Chercher les interventions orphelines (pas de batiment_id) du même tenant
    addr_regex = re.escape(civic) + ".*"
    orphan_query = {
        "tenant_id": tenant_id,
        "$or": [
            {"batiment_id": {"$exists": False}},
            {"batiment_id": None},
            {"batiment_id": ""},
        ],
        "$or": [
            {"batiment_id": {"$exists": False}},
            {"batiment_id": None},
            {"batiment_id": ""},
        ],
    }
    # Requête séparée pour chaque champ d'adresse
    addr_fields_query = {
        "$or": [
            {"address_full": {"$regex": addr_regex, "$options": "i"}},
            {"adresse": {"$regex": addr_regex, "$options": "i"}},
            {"adresse_incident": {"$regex": addr_regex, "$options": "i"}},
        ]
    }
    # Combiner: orphelines ET correspondant à l'adresse
    combined_query = {
        "tenant_id": tenant_id,
        "$and": [
            {"$or": [
                {"batiment_id": {"$exists": False}},
                {"batiment_id": None},
                {"batiment_id": ""},
            ]},
            addr_fields_query,
        ]
    }

    orphans = await db.interventions.find(
        combined_query,
        {"_id": 0, "id": 1, "address_full": 1, "municipality": 1, "adresse": 1, "adresse_incident": 1}
    ).to_list(length=None)

    linked = 0
    for intv in orphans:
        # Essayer avec address_full (interventions importées)
        intv_addr = intv.get("address_full") or intv.get("adresse") or intv.get("adresse_incident") or ""
        intv_city = intv.get("municipality", "")
        if not intv_addr:
            continue
        is_match, _ = is_same_address(intv_addr, intv_city, clean_addr, clean_ville)
        if is_match:
            await db.interventions.update_one(
                {"tenant_id": tenant_id, "id": intv["id"]},
                {"$set": {
                    "batiment_id": batiment_id,
                    "match_method": "auto_retroactive",
                }}
            )
            linked += 1

    if linked > 0:
        logger.info("Mapping rétroactif: %d intervention(s) reliée(s) au bâtiment %s (%s)", linked, batiment_id, adresse_civique)

    return linked
