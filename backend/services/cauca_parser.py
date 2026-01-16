"""
Parser XML pour les fichiers CAUCA (Centre d'appels d'urgence Chaudière-Appalaches)
Format: 5 fichiers XML par intervention
"""

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import re
import uuid


def parse_cauca_time(date_str: str, time_str: str) -> Optional[datetime]:
    """Combine date et heure CAUCA en datetime UTC"""
    if not date_str or not time_str or time_str == "00:00:00":
        return None
    try:
        # Format: "2024-10-11" + "12:23:52"
        dt_str = f"{date_str} {time_str}"
        dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except:
        return None


def parse_cauca_timestamp(timestamp_str: str) -> Optional[datetime]:
    """Parse un timestamp CAUCA complet"""
    if not timestamp_str:
        return None
    try:
        # Format: "2024-10-11 12:23:52"
        dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except:
        return None


def get_text(element: ET.Element, tag: str, default: str = "") -> str:
    """Extrait le texte d'un élément XML de façon sécurisée"""
    el = element.find(tag)
    if el is not None and el.text:
        return el.text.strip()
    return default


def get_int(element: ET.Element, tag: str, default: int = 0) -> int:
    """Extrait un entier d'un élément XML"""
    text = get_text(element, tag)
    try:
        return int(text) if text else default
    except:
        return default


def parse_details_xml(xml_content: str) -> Dict[str, Any]:
    """Parse le fichier _Details.xml (informations principales)"""
    root = ET.fromstring(xml_content)
    table = root.find("Table")
    
    if table is None:
        return {}
    
    # Date de base pour les heures
    date_appel = get_text(table, "dateAppel")
    
    return {
        # Identifiants
        "external_call_id": get_text(table, "codeAppel"),
        "guid_carte": get_text(table, "idCarteAppel"),
        "guid_municipalite": get_text(table, "guidMun"),
        "no_sequentiel": get_int(table, "noSequentiel"),
        
        # Adresse
        "address_civic": get_text(table, "noPorte"),
        "address_street": get_text(table, "rue"),
        "address_apartment": get_text(table, "noAppart"),
        "address_city": get_text(table, "villePourQui"),
        
        # Appelant
        "caller_name": get_text(table, "deQui"),
        "caller_phone": get_text(table, "telDeQui"),
        "for_whom": get_text(table, "pourQui"),
        "for_whom_phone": get_text(table, "telPourQui"),
        
        # Type intervention
        "type_intervention": get_text(table, "typeIntervention"),
        "code_feu": get_text(table, "codeFeu"),
        "niveau_risque": get_text(table, "niveauRisque"),
        "service": get_text(table, "service"),
        
        # Officier
        "officer_in_charge_xml": get_text(table, "officierCharge"),
        
        # Chronologie
        "xml_time_call_received": parse_cauca_time(date_appel, get_text(table, "heureAppel")),
        "xml_time_911": parse_cauca_time(get_text(table, "dateHeure911"), get_text(table, "heure911")),
        "xml_time_dispatch": parse_cauca_time(get_text(table, "dateAlerte"), get_text(table, "heureAlerte")),
        "xml_time_en_route": parse_cauca_time(get_text(table, "date1016_1"), get_text(table, "depCaserne")),
        "xml_time_arrival_1st": parse_cauca_time(get_text(table, "date1018"), get_text(table, "hre1018")),
        "xml_time_force_frappe": parse_cauca_time(get_text(table, "dateForceFrappe"), get_text(table, "forceFrappe")),
        "xml_time_under_control": parse_cauca_time(get_text(table, "dateSousControle"), get_text(table, "sousControle")),
        "xml_time_1022": parse_cauca_time(get_text(table, "date1022"), get_text(table, "heure1022")),
        "xml_time_departure": parse_cauca_time(get_text(table, "dateDepLieux"), get_text(table, "depLieux")),
        "xml_time_terminated": parse_cauca_time(get_text(table, "dateDispFinale"), get_text(table, "dispFinale")),
        
        # Services externes
        "police_time": parse_cauca_time(get_text(table, "datePolice"), get_text(table, "police")),
        "ambulance_time": parse_cauca_time(get_text(table, "dateAmbulance"), get_text(table, "ambulance")),
        "hydro_time": parse_cauca_time(get_text(table, "dateHydro"), get_text(table, "hydro")),
        
        # Véhicules (jusqu'à 12)
        "vehicles_from_details": [
            {"number": get_text(table, f"camion{i}"), "status": get_text(table, f"statutCamion{i}"), "crew": get_int(table, f"nbrePompier{i}")}
            for i in range(1, 13) if get_text(table, f"camion{i}")
        ],
        
        # Métadonnées
        "is_closed": get_text(table, "ferme") == "VRAI",
        "repartiteur": get_text(table, "repartiteur"),
    }


def parse_ressources_xml(xml_content: str) -> List[Dict[str, Any]]:
    """Parse le fichier _Ressources.xml (véhicules déployés)"""
    root = ET.fromstring(xml_content)
    resources = []
    
    # Grouper par ressource pour avoir le dernier statut
    resource_map = {}
    
    for table in root.findall("Table"):
        no_ressource = get_text(table, "noRessource")
        if not no_ressource:
            continue
        
        resource_data = {
            "xml_resource_id": get_text(table, "idRessource"),
            "xml_resource_number": no_ressource,
            "crew_count": get_int(table, "nbPompier"),
            "type": get_text(table, "typeRessource"),
            "status": get_text(table, "statut"),
            "disponibilite": get_text(table, "disponibilite"),
            "timestamp": parse_cauca_timestamp(get_text(table, "heureStatut")),
        }
        
        # Garder le dernier statut pour chaque ressource
        if no_ressource not in resource_map or (resource_data["timestamp"] and 
            (not resource_map[no_ressource].get("timestamp") or 
             resource_data["timestamp"] > resource_map[no_ressource]["timestamp"])):
            resource_map[no_ressource] = resource_data
    
    return list(resource_map.values())


def parse_commentaires_xml(xml_content: str) -> List[Dict[str, Any]]:
    """Parse le fichier _Commentaires.xml"""
    root = ET.fromstring(xml_content)
    comments = []
    
    for table in root.findall("Table"):
        if get_text(table, "Actif") != "1":
            continue
        
        comments.append({
            "id": get_text(table, "idCommentaire"),
            "timestamp": parse_cauca_timestamp(get_text(table, "timestampDetail")),
            "detail": get_text(table, "detail"),
            "type": get_text(table, "type"),
            "repartiteur": get_text(table, "repartiteur"),
        })
    
    # Trier par timestamp
    comments.sort(key=lambda x: x["timestamp"] or datetime.min.replace(tzinfo=timezone.utc))
    return comments


def parse_prise_appel_xml(xml_content: str) -> List[Dict[str, Any]]:
    """Parse le fichier _PriseAppel.xml (infos additionnelles)"""
    root = ET.fromstring(xml_content)
    infos = []
    
    for table in root.findall("Table"):
        infos.append({
            "libelle": get_text(table, "libelle"),
            "timestamp": parse_cauca_timestamp(get_text(table, "dateRep")),
        })
    
    return infos


def parse_assistance_xml(xml_content: str) -> List[Dict[str, Any]]:
    """Parse le fichier _assistance.xml (entraide)"""
    root = ET.fromstring(xml_content)
    assistances = []
    
    for table in root.findall("Table"):
        if get_text(table, "Actif") != "1":
            continue
        
        assistances.append({
            "id": get_text(table, "idAssistance"),
            "municipalite": get_text(table, "municipalite"),
            "no_carte_entraide": get_text(table, "noCarteEntraide"),
            "equipement": get_text(table, "typeEquipement"),
            "time_called": parse_cauca_time(get_text(table, "dateAppel"), get_text(table, "heureAppel")),
            "time_en_route": parse_cauca_time(get_text(table, "dateDirection"), get_text(table, "heureDirection")),
            "time_arrival": parse_cauca_time(get_text(table, "dateLieux"), get_text(table, "heureLieux")),
            "time_released": parse_cauca_time(get_text(table, "dateLiberee"), get_text(table, "heureLiberee")),
        })
    
    return assistances


def parse_cauca_intervention(files: Dict[str, str]) -> Dict[str, Any]:
    """
    Parse un ensemble de fichiers CAUCA pour une intervention.
    
    Args:
        files: Dict avec les clés "details", "ressources", "commentaires", "prise_appel", "assistance"
               contenant le contenu XML de chaque fichier
    
    Returns:
        Dict avec toutes les données de l'intervention
    """
    result = {
        "id": str(uuid.uuid4()),
        "status": "new",
        "xml_raw_data": {},
    }
    
    # Parser Details (obligatoire)
    if "details" in files and files["details"]:
        details = parse_details_xml(files["details"])
        result.update(details)
        result["xml_raw_data"]["details"] = True
    
    # Parser Ressources
    if "ressources" in files and files["ressources"]:
        result["resources"] = parse_ressources_xml(files["ressources"])
        result["xml_raw_data"]["ressources"] = True
    
    # Parser Commentaires
    if "commentaires" in files and files["commentaires"]:
        result["xml_comments"] = parse_commentaires_xml(files["commentaires"])
        result["xml_raw_data"]["commentaires"] = True
    
    # Parser PriseAppel
    if "prise_appel" in files and files["prise_appel"]:
        result["prise_appel_info"] = parse_prise_appel_xml(files["prise_appel"])
        result["xml_raw_data"]["prise_appel"] = True
    
    # Parser Assistance (entraide)
    if "assistance" in files and files["assistance"]:
        result["entraide"] = parse_assistance_xml(files["assistance"])
        result["xml_raw_data"]["assistance"] = True
    
    # Construire l'adresse complète
    address_parts = []
    if result.get("address_civic"):
        address_parts.append(result["address_civic"])
    if result.get("address_street"):
        address_parts.append(result["address_street"])
    if result.get("address_apartment"):
        address_parts.append(f"app. {result['address_apartment']}")
    if result.get("address_city"):
        address_parts.append(result["address_city"])
    
    result["address_full"] = ", ".join(address_parts) if address_parts else None
    
    return result


def identify_cauca_file_type(filename: str) -> Optional[str]:
    """Identifie le type de fichier CAUCA basé sur le nom"""
    filename_lower = filename.lower()
    
    if "_details" in filename_lower:
        return "details"
    elif "_ressources" in filename_lower:
        return "ressources"
    elif "_commentaires" in filename_lower:
        return "commentaires"
    elif "_priseappel" in filename_lower:
        return "prise_appel"
    elif "_assistance" in filename_lower:
        return "assistance"
    
    return None


def group_cauca_files(filenames: List[str]) -> Dict[str, List[str]]:
    """
    Groupe les fichiers CAUCA par intervention (basé sur le numéro de carte).
    
    Returns:
        Dict avec le numéro de carte comme clé et la liste des fichiers comme valeur
    """
    groups = {}
    
    # Pattern: XXXX_CAUCA..._NUMERO_type.xml
    pattern = r"_(\d+)_[^_]+\.xml$"
    
    for filename in filenames:
        match = re.search(pattern, filename, re.IGNORECASE)
        if match:
            card_number = match.group(1)
            if card_number not in groups:
                groups[card_number] = []
            groups[card_number].append(filename)
    
    return groups
