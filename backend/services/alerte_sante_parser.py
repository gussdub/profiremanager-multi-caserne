"""
Parser XML pour les cartes d'appel Alerte Santé
===============================================

Format: Fichier XML contenant une ou plusieurs cartes dans <Cartes><Carte>...</Carte></Cartes>

Champs importants:
- pec_vil_info: Municipalité de prise en charge (NE PAS utiliser Service_Municipality de Donnee911!)
- pec_adr_info: Adresse de prise en charge
- RessourcePRs: Ressources Alerte Santé assignées
"""

import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import uuid
import logging

logger = logging.getLogger(__name__)


def parse_pr_timestamp(timestamp_str: str) -> Optional[datetime]:
    """Parse un timestamp PR (format: 2026-02-01 09:52:08)"""
    if not timestamp_str or timestamp_str.strip() == "":
        return None
    try:
        dt = datetime.strptime(timestamp_str.strip(), "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except Exception as e:
        logger.warning(f"Erreur parsing timestamp PR '{timestamp_str}': {e}")
        return None


def get_text(element: ET.Element, tag: str, default: str = "") -> str:
    """Extrait le texte d'un élément XML de façon sécurisée"""
    if element is None:
        return default
    el = element.find(tag)
    if el is not None and el.text:
        return el.text.strip()
    return default


def get_int(element: ET.Element, tag: str, default: int = 0) -> int:
    """Extrait un entier d'un élément XML"""
    text = get_text(element, tag)
    try:
        return int(text) if text else default
    except (ValueError, TypeError):
        return default


def parse_ressource_pr(ressource_el: ET.Element) -> Dict[str, Any]:
    """Parse une ressource Alerte Santé (Premier Répondant)"""
    return {
        "no_sequentiel_affectation": get_int(ressource_el, "NoSequentielAffectation"),
        "no_equipe": get_text(ressource_el, "no_equipe"),
        "vehicule_no": get_text(ressource_el, "vehicule_no"),
        "hr_emis": parse_pr_timestamp(get_text(ressource_el, "hr_emis")),
        "hr_enrou": parse_pr_timestamp(get_text(ressource_el, "hr_enrou")),
        "hr_lieux": parse_pr_timestamp(get_text(ressource_el, "hr_lieux")),
        "hr_aupres_patient": parse_pr_timestamp(get_text(ressource_el, "hr_AupresPatient")),
        "hr_vers_des": parse_pr_timestamp(get_text(ressource_el, "hr_vers_des")),
        "hr_a_des": parse_pr_timestamp(get_text(ressource_el, "hr_a_des")),
        "hr_libre": parse_pr_timestamp(get_text(ressource_el, "hr_libre")),
        "hr_fin_affectation": parse_pr_timestamp(get_text(ressource_el, "hr_FinAffectation")),
        "hr_vers_zone": parse_pr_timestamp(get_text(ressource_el, "hr_vers_zone")),
        "hr_a_zone": parse_pr_timestamp(get_text(ressource_el, "hr_a_zone")),
        "hr_retour": parse_pr_timestamp(get_text(ressource_el, "hr_retour")),
        "sta_car": get_text(ressource_el, "sta_car"),
        "raison_fin_affectation": get_text(ressource_el, "Raison_FinAffectation")
    }


def parse_ressource_ambulanciere(ressource_el: ET.Element) -> Dict[str, Any]:
    """Parse une ressource ambulancière (pour contexte)"""
    return {
        "no_sequentiel_affectation": get_int(ressource_el, "NoSequentielAffectation"),
        "no_equipe": get_text(ressource_el, "no_equipe"),
        "vehicule_no": get_text(ressource_el, "vehicule_no"),
        "mat_empl_1": get_text(ressource_el, "mat_empl_1"),
        "mat_empl_2": get_text(ressource_el, "mat_empl_2"),
        "hr_emis": parse_pr_timestamp(get_text(ressource_el, "hr_emis")),
        "hr_confirm_ta1": parse_pr_timestamp(get_text(ressource_el, "hr_ConfirmTA1")),
        "hr_confirm_ta2": parse_pr_timestamp(get_text(ressource_el, "hr_ConfirmTA2")),
        "hr_enrou": parse_pr_timestamp(get_text(ressource_el, "hr_enrou")),
        "hr_lieux": parse_pr_timestamp(get_text(ressource_el, "hr_lieux")),
        "hr_aupres_patient": parse_pr_timestamp(get_text(ressource_el, "hr_AupresPatient")),
        "hr_vers_des": parse_pr_timestamp(get_text(ressource_el, "hr_vers_des")),
        "hr_a_des": parse_pr_timestamp(get_text(ressource_el, "hr_a_des")),
        "hr_libre": parse_pr_timestamp(get_text(ressource_el, "hr_libre")),
        "hr_fin_affectation": parse_pr_timestamp(get_text(ressource_el, "hr_FinAffectation")),
        "hr_dispatch": parse_pr_timestamp(get_text(ressource_el, "Hr_dispatch")),
        "secteur_veh": get_text(ressource_el, "Secteur_veh"),
        "raison_fin_affectation": get_text(ressource_el, "Raison_FinAffectation"),
        "raison_fin_affectation_txt": get_text(ressource_el, "Raison_FinAffectationTxt")
    }


def parse_donnee_911(donnee_el: ET.Element) -> Dict[str, Any]:
    """Parse les données 911 brutes (pour référence uniquement)"""
    if donnee_el is None:
        return {}
    
    return {
        "cad_position": get_text(donnee_el, "Cad_position"),
        "call_sequence": get_text(donnee_el, "Call_sequence"),
        "time_of_call": get_text(donnee_el, "Time_of_call"),
        "date_of_call": get_text(donnee_el, "Date_of_call"),
        "telephone_number": get_text(donnee_el, "Telephone_number"),
        "area_code": get_text(donnee_el, "Area_code"),
        "service_class": get_text(donnee_el, "Service_Class"),
        "municipality_code": get_text(donnee_el, "Municipality_code"),
        "name": get_text(donnee_el, "Name"),
        "additional_location_info": get_text(donnee_el, "Additional_location_information"),
        # Note: Service_Municipality est la municipalité du SERVICE 911, pas la municipalité de prise en charge!
        # Utiliser pec_vil_info pour la municipalité de prise en charge
        "service_community_911": get_text(donnee_el, "Service_Community"),
        "service_municipality_911": get_text(donnee_el, "Service_Municipality"),
        "carrier_company": get_text(donnee_el, "Carrier_Company"),
        "call_back_number": get_text(donnee_el, "Call_back_number"),
        "province": get_text(donnee_el, "Province")
    }


def parse_carte_pr(carte_el: ET.Element) -> Dict[str, Any]:
    """
    Parse une carte d'appel Alerte Santé
    
    IMPORTANT: La municipalité de prise en charge est dans pec_vil_info,
    PAS dans Donnee911/Service_Municipality!
    """
    
    # Identifiants
    no_carte = get_text(carte_el, "no_carte")
    no_carte_mere = get_text(carte_el, "No_CarteMere")
    
    # Adresse de prise en charge (PEC = Prise En Charge)
    # C'est ICI qu'on trouve la vraie municipalité!
    pec_adresse = get_text(carte_el, "pec_adr_info")
    pec_ville = get_text(carte_el, "pec_vil_info")  # MUNICIPALITÉ DE PRISE EN CHARGE
    pec_no_civique = get_text(carte_el, "no_civique_de").strip()
    pec_appartement = get_text(carte_el, "no_appartement_de")
    pec_localisation = get_text(carte_el, "Loc_Adr_de")
    pec_telephone = get_text(carte_el, "tel_de")
    pec_code_geo = get_text(carte_el, "CodeGeoPEC")
    pec_zone = get_text(carte_el, "ZonePEC")
    pec_intersection = get_text(carte_el, "pec_trans_info")
    
    # Destination (hôpital, etc.)
    dest_adresse = get_text(carte_el, "dest_adr_info")
    dest_ville = get_text(carte_el, "dest_vil_info")
    dest_code_eta = get_text(carte_el, "code_eta_a")
    dest_code_msss = get_text(carte_el, "Code_Eta_MSSS_DEST")
    dest_code_geo = get_text(carte_el, "CodeGeoDest")
    dest_zone = get_text(carte_el, "ZoneDest")
    
    # État du patient
    conscient = get_text(carte_el, "conscient") == "O"
    respire = get_text(carte_el, "respire") == "O"
    age = get_int(carte_el, "age")
    unite_age = get_text(carte_el, "Unite_Age")  # A = années, M = mois
    sexe = get_text(carte_el, "sexe")
    
    # Nature et priorité de l'appel
    nature = get_text(carte_el, "nature")  # Ex: 30-D-5
    priorite = get_int(carte_el, "priorite")
    raison = get_text(carte_el, "raison")
    nb_blesses = get_int(carte_el, "nb_blesses")
    info_mpds = get_text(carte_el, "Info_MPDS")
    
    # Chronologie
    hr_appel = parse_pr_timestamp(get_text(carte_el, "hr_appel"))
    hr_avis_repartiteur = parse_pr_timestamp(get_text(carte_el, "hr_avisrepartiteur"))
    
    # Annulation
    raison_annul = get_text(carte_el, "raison_annul")
    raison_annul_txt = get_text(carte_el, "Raison_AnnulTxt")
    
    # Données 911 brutes (pour référence)
    donnee_911 = parse_donnee_911(carte_el.find("Donnee911"))
    
    # Ressources Alerte Santé (Premier Répondant)
    ressources_pr = []
    ressources_pr_el = carte_el.find("RessourcePRs")
    if ressources_pr_el is not None:
        for res_el in ressources_pr_el.findall("RessourcePR"):
            ressources_pr.append(parse_ressource_pr(res_el))
    
    # Ressources Ambulancières (pour contexte)
    ressources_ambulancieres = []
    ressources_amb_el = carte_el.find("RessourceAmbulancieres")
    if ressources_amb_el is not None:
        for res_el in ressources_amb_el.findall("RessourceAmbulanciere"):
            ressources_ambulancieres.append(parse_ressource_ambulanciere(res_el))
    
    # Construire l'adresse complète
    # pec_adr_info contient généralement déjà le numéro civique, donc on l'utilise directement
    address_full = pec_adresse
    if pec_ville:
        address_full = f"{address_full}, {pec_ville}"
    
    # Calculer les temps de réponse PR si disponibles
    temps_reponse_pr = None
    if ressources_pr and hr_appel:
        for res in ressources_pr:
            if res.get("hr_lieux"):
                delta = res["hr_lieux"] - hr_appel
                temps_reponse_pr = int(delta.total_seconds() / 60)  # en minutes
                break
    
    return {
        "id": str(uuid.uuid4()),
        "type_carte": "alerte_sante",
        
        # Identifiants
        "external_call_id": no_carte,
        "no_carte_mere": no_carte_mere,
        
        # Adresse de prise en charge - IMPORTANT: pec_vil_info est la vraie municipalité!
        "address_full": address_full,
        "address_civic": pec_no_civique,
        "address_street": pec_adresse,
        "address_apartment": pec_appartement,
        "address_city": pec_ville,  # pec_vil_info - Municipalité de prise en charge!
        "address_location": pec_localisation,
        "caller_phone": pec_telephone,
        "code_geo_pec": pec_code_geo,
        "zone_pec": pec_zone,
        "intersection": pec_intersection,
        
        # Destination
        "destination_address": dest_adresse,
        "destination_city": dest_ville,
        "destination_code_eta": dest_code_eta,
        "destination_code_msss": dest_code_msss,
        "destination_code_geo": dest_code_geo,
        "destination_zone": dest_zone,
        
        # État du patient
        "patient_conscient": conscient,
        "patient_respire": respire,
        "patient_age": age,
        "patient_age_unite": unite_age,
        "patient_sexe": sexe,
        
        # Nature et priorité
        "nature": nature,
        "priorite": priorite,
        "raison": raison,
        "nb_blesses": nb_blesses,
        "info_mpds": info_mpds,
        
        # Type d'intervention dérivé de la nature
        "type_intervention": get_type_intervention_from_nature(nature),
        
        # Chronologie
        "xml_time_call_received": hr_appel,
        "xml_time_dispatch": hr_avis_repartiteur,
        
        # Annulation
        "raison_annulation": raison_annul,
        "raison_annulation_txt": raison_annul_txt,
        "status": "cancelled" if raison_annul else "new",
        
        # Données 911 brutes (pour référence/debug)
        "donnee_911_raw": donnee_911,
        
        # Ressources
        "ressources_pr": ressources_pr,
        "ressources_ambulancieres": ressources_ambulancieres,
        
        # Temps de réponse
        "temps_reponse_pr_minutes": temps_reponse_pr
    }


def get_type_intervention_from_nature(nature: str) -> str:
    """
    Détermine le type d'intervention à partir du code nature MPDS
    
    Format: XX-Y-Z où XX est le code principal
    """
    if not nature:
        return "Alerte Santé"
    
    # Extraire le code principal (les deux premiers chiffres)
    code_principal = nature.split("-")[0] if "-" in nature else nature[:2]
    
    # Codes MPDS courants
    mpds_types = {
        "01": "Douleur abdominale",
        "02": "Allergie / Réaction allergique",
        "03": "Morsure animale",
        "04": "Agression / Voies de fait",
        "05": "Douleur dorsale",
        "06": "Problème respiratoire",
        "07": "Brûlure / Explosion",
        "08": "Intoxication CO / Inhalation",
        "09": "Arrêt cardiaque / Mort",
        "10": "Douleur thoracique",
        "11": "Étouffement",
        "12": "Convulsions / Épilepsie",
        "13": "Problème diabétique",
        "14": "Noyade",
        "15": "Électrocution",
        "16": "Problème oculaire",
        "17": "Chute",
        "18": "Céphalée",
        "19": "Problème cardiaque / AICD",
        "20": "Exposition chaleur / froid",
        "21": "Hémorragie / Lacération",
        "22": "Inaccessible",
        "23": "Surdose / Empoisonnement",
        "24": "Grossesse / Accouchement",
        "25": "Psychiatrique / Suicide",
        "26": "Personne malade",
        "27": "Blessure par arme blanche / arme à feu",
        "28": "AVC / AIT",
        "29": "Collision véhicule",
        "30": "Traumatisme",
        "31": "Inconscient / Syncope",
        "32": "Inconnu / Homme par terre",
        "33": "Transfert / Interfacilité"
    }
    
    return mpds_types.get(code_principal, f"Alerte Santé ({nature})")


def parse_pr_xml_file(xml_content: str) -> List[Dict[str, Any]]:
    """
    Parse un fichier XML contenant des cartes Alerte Santé
    
    Args:
        xml_content: Contenu XML du fichier
        
    Returns:
        Liste des cartes parsées
    """
    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        logger.error(f"Erreur parsing XML PR: {e}")
        return []
    
    cartes = []
    
    # Le fichier peut contenir plusieurs cartes
    for carte_el in root.findall("Carte"):
        try:
            carte = parse_carte_pr(carte_el)
            cartes.append(carte)
            logger.info(f"Carte PR parsée: {carte['external_call_id']} - {carte['address_city']}")
        except Exception as e:
            logger.error(f"Erreur parsing carte PR: {e}")
            continue
    
    return cartes


def parse_pr_intervention(files_content: Dict[str, str]) -> Dict[str, Any]:
    """
    Parse une intervention PR à partir du contenu des fichiers
    
    Pour PR, on n'a généralement qu'un seul fichier XML contenant toutes les infos.
    Cette fonction est compatible avec l'interface de sftp_service.
    """
    # Le fichier principal est généralement dans 'details' ou le premier fichier disponible
    xml_content = files_content.get("details") or list(files_content.values())[0]
    
    cartes = parse_pr_xml_file(xml_content)
    
    if not cartes:
        return {}
    
    # Retourner la première carte (généralement une seule par fichier)
    return cartes[0]
