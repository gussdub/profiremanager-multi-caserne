"""
Routes pour l'import intelligent de bâtiments avec détection de conflits
et rétro-liaison des interventions.
Supporte les formats CSV, XML (Rôle d'évaluation foncière du Québec) et ZIP (ProFireManager).
"""
import csv
import uuid
import httpx
import asyncio
import xml.etree.ElementTree as ET
import re
import zipfile
import json
import os
import tempfile
from io import StringIO, BytesIO
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Body
from pydantic import BaseModel, Field

from routes.dependencies import (
    db,
    get_current_user,
    get_tenant_from_slug,
    User,
    require_permission
)
from routes.batiments import log_batiment_history, compute_changes
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
from utils.object_storage import put_object, get_content_type, generate_storage_path

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

# ==================== PARSEUR XML - RÔLE D'ÉVALUATION FONCIÈRE ====================

# Mapping des types de rue pour reconstruire l'adresse
TYPE_RUE_MAPPING = {
    'RU': 'Rue',
    'RUE': 'Rue',
    'CH': 'Chemin',
    'CHEM': 'Chemin',
    'AV': 'Avenue',
    'AVE': 'Avenue',
    'BOUL': 'Boulevard',
    'BD': 'Boulevard',
    'RT': 'Route',
    'RTE': 'Route',
    'PL': 'Place',
    'RG': 'Rang',
    'RANG': 'Rang',
    'MT': 'Montée',
    'MONT': 'Montée',
    'CRS': 'Cours',
    'ALL': 'Allée',
    'IMP': 'Impasse',
    'PARC': 'Parc',
    'PRIV': 'Privé',
    'TERR': 'Terrasse',
    'PASS': 'Passage',
    'COTE': 'Côte',
    'PTE': 'Pointe',
    'CR': 'Croissant',
    'CIR': 'Cercle',
    '': ''
}


def parse_xml_role_evaluation(xml_content: bytes) -> List[Dict[str, Any]]:
    """
    Parse un fichier XML du Rôle d'évaluation foncière du Québec (format CEFX).
    Extrait les informations d'adresse, propriétaire et bâtiment.
    
    Structure XML réelle:
    <CEx>
      <CE02>
        <CE0201>
          <CE0201x>
            <CE0201Ax>322</CE0201Ax>       # Numéro civique
            <CE0201Gx>3E AVENUE</CE0201Gx> # Nom de rue
          </CE0201x>
        </CE0201>
        <CE0208>
          <CE0208x>
            <CE0208Ax>NOM</CE0208Ax>       # Nom propriétaire
            <CE0208Bx>PRENOM</CE0208Bx>    # Prénom propriétaire
            <CE0208Dx>VILLE</CE0208Dx>     # Ville
            <CE0208Ex>CODE_POSTAL</CE0208Ex>
          </CE0208x>
        </CE0208>
        <CE0211A>2</CE0211A>               # Logements
        <CE0215A>1980</CE0215A>            # Année construction
        <CE0216A>83.2</CE0216A>            # Superficie
        <CE0219A>1</CE0219A>               # Étages
      </CE02>
    </CEx>
    """
    batiments = []
    
    try:
        # Nettoyer le XML si nécessaire (BOM, encoding)
        if xml_content.startswith(b'\xef\xbb\xbf'):
            xml_content = xml_content[3:]
        
        # Parser avec gestion de l'encodage ISO-8859-1
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError:
            # Essayer avec décodage explicite
            xml_text = xml_content.decode('iso-8859-1', errors='replace')
            root = ET.fromstring(xml_text.encode('utf-8'))
        
        # Chercher tous les éléments CEx (unités d'évaluation)
        for cex in root.iter('CEx'):
            # Chercher les blocs CE02 ou CE03 (données d'unité)
            for ce_block in list(cex.findall('.//CE02')) + list(cex.findall('.//CE03')):
                batiment_data = extract_batiment_from_ce_block(ce_block)
                if batiment_data and batiment_data.get('adresse_civique'):
                    batiments.append(batiment_data)
        
        # Si aucun bâtiment trouvé avec CEx, essayer une approche directe
        if not batiments:
            for ce_block in list(root.findall('.//CE02')) + list(root.findall('.//CE03')):
                batiment_data = extract_batiment_from_ce_block(ce_block)
                if batiment_data and batiment_data.get('adresse_civique'):
                    batiments.append(batiment_data)
        
        print(f"✅ XML parsé: {len(batiments)} bâtiment(s) extrait(s)")
        
    except ET.ParseError as e:
        print(f"Erreur parsing XML: {e}")
        raise HTTPException(status_code=400, detail=f"Fichier XML invalide: {str(e)}")
    except Exception as e:
        print(f"Erreur extraction XML: {e}")
        raise HTTPException(status_code=400, detail=f"Erreur lors du traitement du XML: {str(e)}")
    
    return batiments


def extract_batiment_from_ce_block(ce_block) -> Optional[Dict[str, Any]]:
    """
    Extrait les données d'un bâtiment depuis un bloc CE02 ou CE03.
    """
    data = {}
    
    # Helper pour trouver un texte dans l'arbre
    def find_text(element, *paths):
        for path in paths:
            found = element.find(path)
            if found is not None and found.text:
                return found.text.strip()
        return ''
    
    # Numéro civique - dans CE0201/CE0201x/CE0201Ax ou CE0301/...
    numero_civique = (
        find_text(ce_block, './/CE0201x/CE0201Ax', './/CE0301x/CE0301Ax') or
        find_text(ce_block, './/CE0201Ax', './/CE0301Ax')
    )
    
    # Type de rue - CE0201Ex/CE0301Ex (optionnel dans certains fichiers)
    type_rue_code = (
        find_text(ce_block, './/CE0201x/CE0201Ex', './/CE0301x/CE0301Ex') or
        find_text(ce_block, './/CE0201Ex', './/CE0301Ex')
    ).upper()
    type_rue = TYPE_RUE_MAPPING.get(type_rue_code, type_rue_code)
    
    # Nom de rue - CE0201Gx/CE0301Gx
    nom_rue = (
        find_text(ce_block, './/CE0201x/CE0201Gx', './/CE0301x/CE0301Gx') or
        find_text(ce_block, './/CE0201Gx', './/CE0301Gx')
    ).strip()
    
    # Construire l'adresse complète
    if numero_civique and nom_rue:
        if type_rue:
            adresse = f"{numero_civique} {type_rue} {nom_rue}"
        else:
            adresse = f"{numero_civique} {nom_rue}"
        data['adresse_civique'] = adresse.strip()
    else:
        return None  # Pas d'adresse valide
    
    # Ville - CE0208Dx ou CE0308Dx
    data['ville'] = (
        find_text(ce_block, './/CE0208x/CE0208Dx', './/CE0308x/CE0308Dx') or
        find_text(ce_block, './/CE0208Dx', './/CE0308Dx')
    ).strip()
    
    # Code postal - CE0208Ex ou CE0308Ex
    data['code_postal'] = (
        find_text(ce_block, './/CE0208x/CE0208Ex', './/CE0308x/CE0308Ex') or
        find_text(ce_block, './/CE0208Ex', './/CE0308Ex')
    ).strip()
    
    # Propriétaire (contact) - CE0208Ax (nom) + CE0208Bx (prénom)
    nom_proprio = (
        find_text(ce_block, './/CE0208x/CE0208Ax', './/CE0308x/CE0308Ax') or
        find_text(ce_block, './/CE0208Ax', './/CE0308Ax')
    ).strip()
    prenom_proprio = (
        find_text(ce_block, './/CE0208x/CE0208Bx', './/CE0308x/CE0308Bx') or
        find_text(ce_block, './/CE0208Bx', './/CE0308Bx')
    ).strip()
    
    if nom_proprio or prenom_proprio:
        data['contact_nom'] = f"{prenom_proprio} {nom_proprio}".strip()
    
    # Année de construction - CE0215A ou CE0315A
    annee = find_text(ce_block, './/CE0215A', './/CE0315A')
    if annee and annee.isdigit() and len(annee) == 4:
        data['annee_construction'] = int(annee)
    
    # Nombre d'étages - CE0219A ou CE0319A
    etages = find_text(ce_block, './/CE0219A', './/CE0319A')
    if etages:
        try:
            data['nombre_etages'] = int(float(etages))
        except ValueError:
            pass
    
    # Superficie (m²) - CE0216A ou CE0316A
    superficie = find_text(ce_block, './/CE0216A', './/CE0316A')
    if superficie:
        try:
            data['superficie'] = float(superficie.replace(',', '.'))
        except ValueError:
            pass
    
    # Nombre de logements - CE0211A ou CE0311A
    logements = find_text(ce_block, './/CE0211A', './/CE0311A')
    if logements:
        try:
            data['nombre_logements'] = int(logements)
        except ValueError:
            pass
    
    # Générer le nom d'établissement (adresse + ville)
    if data.get('adresse_civique') and data.get('ville'):
        data['nom_etablissement'] = f"{data['adresse_civique']}, {data['ville']}"
    
    data['province'] = 'Québec'
    
    return data


# ==================== GÉOLOCALISATION ====================

async def geocode_address(address: str, city: str, province: str = "Québec", country: str = "Canada") -> Tuple[Optional[float], Optional[float]]:
    """
    Géolocalise une adresse en utilisant l'API Nominatim (OpenStreetMap).
    Retourne (latitude, longitude) ou (None, None) si non trouvé.
    """
    if not address or not city:
        return None, None
    
    try:
        full_address = f"{address}, {city}, {province}, {country}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": full_address,
                    "format": "json",
                    "limit": 1
                },
                headers={
                    "User-Agent": "ProFireManager/1.0"
                },
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and len(data) > 0:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    return lat, lon
    except Exception as e:
        print(f"Erreur géocodage pour '{address}, {city}': {e}")
    
    return None, None


async def geocode_batch(addresses: List[Dict[str, str]], delay: float = 1.0) -> List[Tuple[Optional[float], Optional[float]]]:
    """
    Géolocalise un lot d'adresses avec un délai entre chaque requête
    pour respecter les limites de l'API Nominatim (1 req/sec).
    """
    results = []
    for addr_data in addresses:
        lat, lon = await geocode_address(
            addr_data.get("address", ""),
            addr_data.get("city", ""),
            addr_data.get("province", "Québec"),
            addr_data.get("country", "Canada")
        )
        results.append((lat, lon))
        
        # Respecter la limite de rate de Nominatim
        if delay > 0:
            await asyncio.sleep(delay)
    
    return results


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
    Supporte les formats CSV et XML (Rôle d'évaluation foncière).
    Retourne les conflits à résoudre avant l'import final.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")
    
    # Lire le fichier
    contents = await file.read()
    filename = file.filename.lower() if file.filename else ''
    
    # Détecter le format (CSV ou XML)
    is_xml = filename.endswith('.xml') or contents.strip().startswith(b'<?xml') or contents.strip().startswith(b'<')
    
    rows = []
    
    if is_xml:
        # Parser le XML du Rôle d'évaluation
        try:
            xml_batiments = parse_xml_role_evaluation(contents)
            # Convertir en format compatible avec le traitement CSV
            rows = xml_batiments
            print(f"📄 Import XML: {len(rows)} bâtiments extraits du fichier")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erreur parsing XML: {str(e)}")
    else:
        # Parser le CSV
        try:
            csv_text = contents.decode('utf-8')
        except UnicodeDecodeError:
            csv_text = contents.decode('latin-1')
        
        csv_reader = csv.DictReader(StringIO(csv_text))
        rows = list(csv_reader)
        print(f"📄 Import CSV: {len(rows)} lignes dans le fichier")
    
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
                    "row": idx + 2 if not is_xml else idx + 1,  # XML: pas de header
                    "error": "Adresse manquante",
                    "data": row
                })
                continue
            
            # Vérifier les doublons dans le fichier
            address_key = generate_address_key(address, row.get('code_postal'))
            if address_key in seen_addresses:
                duplicates_in_file += 1
                errors.append({
                    "row": idx + 2 if not is_xml else idx + 1,
                    "error": f"Doublon dans le fichier (même adresse que ligne {seen_addresses[address_key] + (2 if not is_xml else 1)})",
                    "data": row
                })
                continue
            seen_addresses[address_key] = idx
            
            # Préparer les données du nouveau bâtiment
            # Pour XML, les champs sont déjà formatés correctement par le parseur
            new_data = {
                "nom_etablissement": row.get('nom_etablissement', row.get('nom', '')),
                "adresse_civique": address,
                "ville": row.get('ville', ''),
                "code_postal": row.get('code_postal', ''),
                "province": row.get('province', 'Québec'),
                # Coordonnées GPS (si présentes)
                "latitude": row.get('latitude', ''),
                "longitude": row.get('longitude', ''),
                # Contact (propriétaire pour XML)
                "contact_nom": row.get('contact_nom', row.get('proprietaire', row.get('contact', ''))),
                "contact_telephone": row.get('contact_telephone', row.get('telephone', '')),
                "contact_email": row.get('contact_email', row.get('email', '')),
                # Infos supplémentaires
                "notes": row.get('notes', row.get('description', '')),
                # Photo (URL si fournie)
                "photo_url": row.get('photo_url', row.get('photo', '')),
                # Champs spécifiques XML (Rôle d'évaluation)
                "annee_construction": row.get('annee_construction'),
                "nombre_etages": row.get('nombre_etages'),
                "superficie": row.get('superficie'),
                "nombre_logements": row.get('nombre_logements'),
            }
            
            # Nettoyer les valeurs None ou vides
            new_data = {k: v for k, v in new_data.items() if v is not None and v != ''}
            
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
        "is_xml": is_xml,  # Sauvegarder le format pour l'historique
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
    
    # Récupérer le format d'import (XML ou CSV)
    is_xml = session.get("is_xml", False)
    
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
        # Collecter les bâtiments qui ont besoin de géolocalisation
        batiments_to_geocode = []
        
        for new_bat in session["new_batiments"]:
            try:
                batiment_data = new_bat["data"]
                batiment_data["id"] = str(uuid.uuid4())
                batiment_data["tenant_id"] = tenant.id
                batiment_data["created_at"] = datetime.now(timezone.utc).isoformat()
                batiment_data["created_by"] = current_user.id
                
                # Si pas de coordonnées, les géolocaliser automatiquement
                if not batiment_data.get("latitude") or not batiment_data.get("longitude"):
                    batiments_to_geocode.append({
                        "index": len(batiments_to_geocode),
                        "data": batiment_data,
                        "address": batiment_data.get("adresse_civique", ""),
                        "city": batiment_data.get("ville", ""),
                        "province": batiment_data.get("province", "Québec")
                    })
                else:
                    # Insérer directement si coordonnées déjà présentes
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
        
        # Géolocaliser en batch les adresses sans coordonnées
        if batiments_to_geocode:
            geocode_results = await geocode_batch(
                [{"address": b["address"], "city": b["city"], "province": b["province"]} 
                 for b in batiments_to_geocode],
                delay=1.0  # 1 seconde entre chaque requête (limite Nominatim)
            )
            
            # Insérer les bâtiments avec leurs coordonnées
            for i, bat_info in enumerate(batiments_to_geocode):
                try:
                    batiment_data = bat_info["data"]
                    lat, lon = geocode_results[i]
                    
                    if lat and lon:
                        batiment_data["latitude"] = round(lat, 6)
                        batiment_data["longitude"] = round(lon, 6)
                        batiment_data["geocoded_auto"] = True
                    
                    await db.batiments.insert_one(batiment_data)
                    results["created"] += 1
                    
                    # Enregistrer dans l'historique (import XML ou CSV)
                    source = "xml" if is_xml else "csv"
                    user_name = f"{current_user.prenom} {current_user.nom}" if hasattr(current_user, 'prenom') else current_user.email
                    await log_batiment_history(
                        db=db,
                        tenant_id=tenant.id,
                        batiment_id=batiment_data["id"],
                        action=f"import_{source}",
                        source=source,
                        user_id=current_user.id,
                        user_name=user_name,
                        description=f"Import {source.upper()}: {batiment_data.get('adresse_civique', '')}, {batiment_data.get('ville', '')}"
                    )
                    
                    # Rétro-liaison des interventions
                    linked = await link_interventions_to_batiment(
                        tenant.id, 
                        batiment_data["id"], 
                        batiment_data["adresse_civique"]
                    )
                    results["interventions_linked"] += linked
                    
                except Exception as e:
                    results["errors"].append({
                        "type": "create_geocode",
                        "address": bat_info["address"],
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


# ==================== IMPORT ZIP (ProFireManager) ====================

def parse_profiremanager_csv(csv_text: str) -> List[Dict[str, Any]]:
    """Parse un CSV exporté de ProFireManager et convertit en format bâtiment."""
    reader = csv.DictReader(StringIO(csv_text))
    rows = list(reader)
    batiments = []

    for row in rows:
        adresse = row.get("Adresse", "").strip()
        if not adresse:
            continue

        bat = {
            "adresse_civique": adresse,
            "cadastre_matricule": row.get("Matricule", ""),
            "annee_construction": None,
            "nombre_etages": None,
            "nombre_logements": None,
            "notes": row.get("Note", ""),
            "raison_sociale": row.get("Raison sociale", ""),
            "pfm_id": row.get("ID", ""),
        }

        # Année construction
        annee = row.get("Année construction", "")
        if annee and annee.isdigit() and len(annee) == 4:
            bat["annee_construction"] = int(annee)

        # Nombre d'étages
        etages = row.get("Nbr etage", "")
        if etages:
            try:
                val = int(etages)
                if val > 0:
                    bat["nombre_etages"] = val
            except ValueError:
                pass

        # Nombre de logements
        logements = row.get("Nbr logement", "")
        if logements:
            try:
                val = int(logements)
                if val > 0:
                    bat["nombre_logements"] = val
            except ValueError:
                pass

        # Nombre de sous-sols
        sous_sols = row.get("Nbr sous sol", "")
        if sous_sols:
            try:
                val = int(sous_sols)
                if val > 0:
                    bat["nombre_sous_sols"] = val
            except ValueError:
                pass

        # Valeur
        valeur = row.get("Valeur", "")
        if valeur:
            try:
                bat["valeur_fonciere"] = float(valeur)
            except ValueError:
                pass

        # Extraire la ville de l'adresse si format "123 rue NOM, Ville"
        if "," in adresse:
            parts = adresse.rsplit(",", 1)
            bat["ville"] = parts[1].strip().lstrip("*")

        # Nom d'établissement
        if bat.get("raison_sociale"):
            bat["nom_etablissement"] = f"{bat['raison_sociale']} - {adresse}"
        else:
            bat["nom_etablissement"] = adresse

        batiments.append(bat)

    return batiments


@router.post("/{tenant_slug}/batiments/import/zip/preview")
async def preview_zip_import(
    tenant_slug: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Prévisualise un import ZIP de ProFireManager.
    Extrait le CSV, parse les bâtiments et liste les fichiers média.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")

    contents = await file.read()
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers .zip sont acceptés")

    try:
        zf = zipfile.ZipFile(BytesIO(contents))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Fichier ZIP invalide")

    # Trouver le CSV/XML de données
    csv_content = None
    manifest = None
    media_files = []

    for name in zf.namelist():
        lower = name.lower()
        if lower.endswith(".csv"):
            csv_content = zf.read(name)
        elif lower == "manifest.json":
            manifest = json.loads(zf.read(name))
        elif lower.startswith("files/") and not lower.endswith("/"):
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            is_image = ext in ("jpg", "jpeg", "png", "gif", "webp")
            media_files.append({
                "zip_path": name,
                "filename": os.path.basename(name),
                "file_id": os.path.basename(name).rsplit(".", 1)[0],
                "extension": ext,
                "is_image": is_image,
                "size": zf.getinfo(name).file_size,
            })

    if not csv_content:
        raise HTTPException(status_code=400, detail="Aucun fichier CSV trouvé dans l'archive")

    # Parser le CSV
    try:
        csv_text = csv_content.decode("utf-8")
    except UnicodeDecodeError:
        csv_text = csv_content.decode("latin-1")

    batiments = parse_profiremanager_csv(csv_text)

    # Charger les bâtiments existants pour détecter les conflits
    existing_batiments = await db.batiments.find(
        {"tenant_id": tenant.id}, {"_id": 0}
    ).to_list(length=None)

    conflicts = []
    new_batiments = []
    errors = []

    for idx, bat in enumerate(batiments):
        address = bat.get("adresse_civique", "")
        city = bat.get("ville", "")
        matches = find_matching_address(address, city, existing_batiments, 0.85)

        if matches:
            best_match, score = matches[0]
            differences = compare_building_fields(bat, best_match)
            conflicts.append({
                "import_index": idx,
                "new_data": bat,
                "existing_batiment": best_match,
                "similarity_score": score,
                "differences": differences,
                "suggested_action": "replace" if score >= 0.95 else "review",
            })
        else:
            new_batiments.append({"import_index": idx, "data": bat})

    # Stocker la session
    session_id = str(uuid.uuid4())
    import_sessions[session_id] = {
        "tenant_id": tenant.id,
        "user_id": current_user.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_zip": True,
        "rows": batiments,
        "new_batiments": new_batiments,
        "conflicts": conflicts,
        "errors": errors,
        "zip_data": contents,
        "media_files": media_files,
    }

    return {
        "session_id": session_id,
        "total_rows": len(batiments),
        "new_batiments": len(new_batiments),
        "conflicts": conflicts,
        "media_files_count": len(media_files),
        "media_files_images": len([m for m in media_files if m["is_image"]]),
        "media_files_documents": len([m for m in media_files if not m["is_image"]]),
        "manifest": manifest,
        "errors": errors[:20],
    }


@router.post("/{tenant_slug}/batiments/import/zip/execute")
async def execute_zip_import(
    tenant_slug: str,
    request: ImportExecuteRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Exécute l'import ZIP : crée les bâtiments et upload les médias vers Object Storage.
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    await require_permission(tenant.id, current_user, "prevention", "creer", "batiments")

    session = import_sessions.get(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session d'import expirée ou invalide")
    if session["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Session non autorisée")

    results = {
        "created": 0,
        "updated": 0,
        "skipped": 0,
        "archived": 0,
        "photos_uploaded": 0,
        "documents_uploaded": 0,
        "interventions_linked": 0,
        "errors": [],
    }

    resolutions_map = {r.import_index: r for r in request.resolutions}
    created_batiment_ids = {}  # pfm_id -> batiment_id

    # 1. Créer les bâtiments nouveaux
    if request.create_new_buildings:
        batiments_to_geocode = []
        for new_bat in session["new_batiments"]:
            try:
                batiment_data = dict(new_bat["data"])
                bat_id = str(uuid.uuid4())
                batiment_data["id"] = bat_id
                batiment_data["tenant_id"] = tenant.id
                batiment_data["created_at"] = datetime.now(timezone.utc).isoformat()
                batiment_data["created_by"] = current_user.id
                pfm_id = batiment_data.pop("pfm_id", "")

                batiments_to_geocode.append({
                    "data": batiment_data,
                    "address": batiment_data.get("adresse_civique", ""),
                    "city": batiment_data.get("ville", ""),
                    "province": "Québec",
                    "pfm_id": pfm_id,
                })
            except Exception as e:
                results["errors"].append({"type": "prepare", "error": str(e)})

        # Géolocaliser et insérer
        if batiments_to_geocode:
            geocode_results = await geocode_batch(
                [{"address": b["address"], "city": b["city"], "province": b["province"]}
                 for b in batiments_to_geocode],
                delay=1.0,
            )
            for i, bat_info in enumerate(batiments_to_geocode):
                try:
                    batiment_data = bat_info["data"]
                    lat, lon = geocode_results[i]
                    if lat and lon:
                        batiment_data["latitude"] = round(lat, 6)
                        batiment_data["longitude"] = round(lon, 6)
                        batiment_data["geocoded_auto"] = True

                    await db.batiments.insert_one(batiment_data)
                    results["created"] += 1
                    if bat_info["pfm_id"]:
                        created_batiment_ids[bat_info["pfm_id"]] = batiment_data["id"]

                    linked = await link_interventions_to_batiment(
                        tenant.id, batiment_data["id"], batiment_data["adresse_civique"]
                    )
                    results["interventions_linked"] += linked
                except Exception as e:
                    results["errors"].append({"type": "create", "error": str(e)})

    # 2. Traiter les conflits
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
                existing = conflict["existing_batiment"]
                await archive_batiment(existing, current_user.id, "replaced_by_zip_import")
                results["archived"] += 1
                new_data = dict(conflict["new_data"])
                pfm_id = new_data.pop("pfm_id", "")
                new_data["updated_at"] = datetime.now(timezone.utc).isoformat()
                new_data["updated_by"] = current_user.id
                await db.batiments.update_one(
                    {"id": existing["id"], "tenant_id": tenant.id},
                    {"$set": new_data},
                )
                results["updated"] += 1
                if pfm_id:
                    created_batiment_ids[pfm_id] = existing["id"]
            elif resolution.action == "create_new":
                new_data = dict(conflict["new_data"])
                pfm_id = new_data.pop("pfm_id", "")
                new_data["id"] = str(uuid.uuid4())
                new_data["tenant_id"] = tenant.id
                new_data["created_at"] = datetime.now(timezone.utc).isoformat()
                new_data["created_by"] = current_user.id
                await db.batiments.insert_one(new_data)
                results["created"] += 1
                if pfm_id:
                    created_batiment_ids[pfm_id] = new_data["id"]
        except Exception as e:
            results["errors"].append({"type": resolution.action, "error": str(e)})

    # 3. Upload des médias depuis le ZIP
    zip_data = session.get("zip_data")
    media_files = session.get("media_files", [])

    if zip_data and media_files:
        try:
            zf = zipfile.ZipFile(BytesIO(zip_data))

            # Associer les fichiers aux bâtiments par proximité d'ID
            pfm_ids_sorted = sorted(
                [(pfm_id, bat_id) for pfm_id, bat_id in created_batiment_ids.items() if pfm_id],
                key=lambda x: int(x[0]) if x[0].isdigit() else 0,
            )

            def find_closest_batiment(file_id_str):
                """Trouve le bâtiment le plus proche par ID numérique."""
                if not file_id_str.isdigit() or not pfm_ids_sorted:
                    return None
                file_num = int(file_id_str)
                best = None
                for pfm_id, bat_id in pfm_ids_sorted:
                    if not pfm_id.isdigit():
                        continue
                    pfm_num = int(pfm_id)
                    if pfm_num <= file_num:
                        best = bat_id
                    else:
                        break
                return best

            for mf in media_files:
                try:
                    file_data = zf.read(mf["zip_path"])
                    content_type = get_content_type(mf["filename"])
                    storage_path = generate_storage_path(tenant.id, "batiments", mf["filename"])
                    result = put_object(storage_path, file_data, content_type)

                    # Trouver le bâtiment associé
                    associated_bat_id = find_closest_batiment(mf["file_id"])

                    file_doc = {
                        "id": str(uuid.uuid4()),
                        "tenant_id": tenant.id,
                        "storage_path": result["path"],
                        "original_filename": mf["filename"],
                        "content_type": content_type,
                        "size": result.get("size", len(file_data)),
                        "category": "batiments",
                        "entity_type": "batiment",
                        "entity_id": associated_bat_id,
                        "pfm_file_id": mf["file_id"],
                        "uploaded_by": current_user.id,
                        "uploaded_at": datetime.now(timezone.utc).isoformat(),
                        "is_deleted": False,
                        "import_session_id": request.session_id,
                    }
                    await db.stored_files.insert_one(file_doc)

                    if mf["is_image"]:
                        results["photos_uploaded"] += 1
                    else:
                        results["documents_uploaded"] += 1
                except Exception as e:
                    results["errors"].append({
                        "type": "media_upload",
                        "file": mf["filename"],
                        "error": str(e),
                    })

            zf.close()
        except Exception as e:
            results["errors"].append({"type": "zip_processing", "error": str(e)})

    # Nettoyer la session (enlever les données volumineuses)
    del import_sessions[request.session_id]

    return {
        "success": True,
        "results": results,
        "message": (
            f"Import terminé: {results['created']} créés, {results['updated']} mis à jour, "
            f"{results['skipped']} ignorés, {results['photos_uploaded']} photos, "
            f"{results['documents_uploaded']} documents"
        ),
    }

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
