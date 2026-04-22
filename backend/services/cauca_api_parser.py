"""
Parser pour les cartes d'appel CAUCA API CAD Transfert (format JSON)
====================================================================

Convertit le format JSON de l'API CAUCA en format interne ProFireManager.
Ce parser est différent du parser XML SMTP (cauca_parser.py).

Structure JSON CAUCA (voir documentation officielle):
{
    "callingCardNumber": "...",
    "fireSafetyDepartment": "...",
    "fileNumber": "...",
    "interventionCode": "10",
    "interventionCodeName": "ALARME INCENDIE",
    "globalInterventionMode": "A",  // A=Urgent, B=Non urgent
    ...
}
"""

from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import uuid
import logging

logger = logging.getLogger(__name__)


def parse_iso_datetime(iso_str: Optional[str]) -> Optional[datetime]:
    """Parse une date ISO 8601 en datetime UTC"""
    if not iso_str or iso_str == "":
        return None
    try:
        # Format CAUCA: "2026-04-13T14:06:07.971Z"
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt
    except Exception as e:
        logger.warning(f"Erreur parsing date CAUCA '{iso_str}': {e}")
        return None


def parse_cauca_calling_card(card_data: Dict, tenant_id: str) -> Dict[str, Any]:
    """
    Parse une carte d'appel CAUCA API et la convertit au format interne.
    
    Args:
        card_data: JSON de la carte CAUCA
        tenant_id: ID du tenant
    
    Returns:
        Document intervention au format ProFireManager
    """
    
    # ==================== IDENTIFIANTS ====================
    
    intervention_id = str(uuid.uuid4())
    calling_card_number = card_data.get("callingCardNumber", "")
    file_number = card_data.get("fileNumber", "")
    fire_department = card_data.get("fireSafetyDepartment", "")
    
    # ==================== TYPE D'INTERVENTION ====================
    
    intervention_code = card_data.get("interventionCode", "")
    intervention_code_name = card_data.get("interventionCodeName", "")
    global_mode = card_data.get("globalInterventionMode", "")  # A=Urgent, B=Non urgent
    
    # ==================== ADRESSE ====================
    
    subject = card_data.get("subject", {})
    location = subject.get("location", {})
    
    address_civic = location.get("civicInferior", "")
    address_extension = location.get("extensionCivicInferior", "")
    if address_extension:
        address_civic = f"{address_civic}-{address_extension}"
    
    address_street = location.get("laneFullName", "")  # "RUE DES MÉSANGES"
    address_city = location.get("city", "")
    address_apartment = ""  # CAUCA ne semble pas avoir ce champ séparé
    
    # Construire l'adresse complète
    address_parts = []
    if address_civic:
        address_parts.append(address_civic)
    if address_street:
        address_parts.append(address_street)
    address_full = " ".join(address_parts)
    
    # Secteurs
    fire_sector = location.get("fireSector", "")
    fire_sub_sector = location.get("fireSubSector", "")
    risk_level = location.get("riskLevel", "")
    
    # Coordonnées géographiques (si disponibles dans une version future)
    geo_lat = None
    geo_long = None
    
    # ==================== APPELANT ====================
    
    caller = card_data.get("caller", {})
    caller_name = caller.get("name", "")
    caller_phone = caller.get("phone", "")
    caller_address = caller.get("address", "")
    
    subject_name = subject.get("name", "")  # Raison sociale du lieu
    subject_phone = subject.get("phone", "")
    
    # ==================== CHRONOLOGIE ====================
    
    time_call = parse_iso_datetime(card_data.get("call"))
    time_alert = parse_iso_datetime(card_data.get("alert"))
    time_alert_confirmation = parse_iso_datetime(card_data.get("alertConfirmation"))
    
    # Niveaux d'alerte
    alert_levels = card_data.get("alertLevels", {})
    time_first_alert = parse_iso_datetime(alert_levels.get("firstAlertDeclaredOn"))
    time_code_1012 = parse_iso_datetime(alert_levels.get("code1012DeclaredOn"))  # 2e alerte
    time_code_1013 = parse_iso_datetime(alert_levels.get("code1013DeclaredOn"))  # 3e alerte
    time_code_1014 = parse_iso_datetime(alert_levels.get("code1014DeclaredOn"))  # 4e alerte
    time_code_1015 = parse_iso_datetime(alert_levels.get("code1015DeclaredOn"))  # Alerte générale
    
    # Statuts opérationnels (codes 10-XX)
    op_statuses = card_data.get("operationalStatuses", {})
    time_1003 = parse_iso_datetime(op_statuses.get("code1003DeclaredOn"))  # Mission annulée
    time_1006 = parse_iso_datetime(op_statuses.get("code1006DeclaredOn"))  # Rappel sélectif
    time_1007 = parse_iso_datetime(op_statuses.get("code1007DeclaredOn"))  # Intervention nécessaire
    time_1008 = parse_iso_datetime(op_statuses.get("code1008DeclaredOn"))  # Effectifs insuffisants
    time_1009 = parse_iso_datetime(op_statuses.get("code1009DeclaredOn"))  # Effectifs engagés
    time_1010 = parse_iso_datetime(op_statuses.get("code1010DeclaredOn"))  # Sous contrôle
    time_1011 = parse_iso_datetime(op_statuses.get("code1011DeclaredOn"))  # Force de frappe complète
    time_1018 = parse_iso_datetime(op_statuses.get("code1018DeclaredOn"))  # En reconnaissance
    time_1022 = parse_iso_datetime(op_statuses.get("code1022DeclaredOn"))  # Service non requis
    time_1090 = parse_iso_datetime(op_statuses.get("code1090DeclaredOn"))  # Intervention terminée
    
    # ==================== VÉHICULES ====================
    
    vehicles_raw = card_data.get("vehicules", [])
    vehicles = []
    
    for veh in vehicles_raw:
        vehicle = {
            "xml_vehicle_number": veh.get("number", ""),
            "xml_vehicle_type": veh.get("type", ""),
            "intervention_mode": veh.get("interventionMode", ""),  # A=Urgent, B=Non urgent
            "crew_count": veh.get("firemenCount", 0),
            "time_assigned": parse_iso_datetime(veh.get("assignedOn")),
            "time_departed": parse_iso_datetime(veh.get("departedForSiteOn")),
            "time_arrived": parse_iso_datetime(veh.get("arrivedOn")),
            "time_available": parse_iso_datetime(veh.get("availableOn")),
            "time_not_available": parse_iso_datetime(veh.get("notAvailableOn")),
            "time_available_at_station": parse_iso_datetime(veh.get("availableAtFireStationOn"))
        }
        vehicles.append(vehicle)
    
    # ==================== MATRICULES (POMPIERS) ====================
    
    matricules_raw = card_data.get("matricules", [])
    matricules = []
    
    for mat in matricules_raw:
        matricule = {
            "number": mat.get("number", ""),
            "name": mat.get("name", ""),
            "time_departed": parse_iso_datetime(mat.get("departedForSiteOn")),
            "time_arrived": parse_iso_datetime(mat.get("arrivedOn")),
            "time_available": parse_iso_datetime(mat.get("availableOn")),
            "time_not_available": parse_iso_datetime(mat.get("notAvailableOn")),
            "time_available_at_station": parse_iso_datetime(mat.get("availableAtFireStationOn"))
        }
        matricules.append(matricule)
    
    # ==================== RESSOURCES EXTERNES ====================
    
    external_resources_raw = card_data.get("externalResources", [])
    external_resources = []
    
    for res in external_resources_raw:
        resource = {
            "name": res.get("name", ""),  # Police, ambulance, croix-rouge, etc.
            "identification": res.get("identification", ""),
            "file_number": res.get("fileNumber", ""),
            "time_assigned": parse_iso_datetime(res.get("assignedOn")),
            "time_departed": parse_iso_datetime(res.get("departedForSiteOn")),
            "time_arrived": parse_iso_datetime(res.get("arrivedOn")),
            "time_available": parse_iso_datetime(res.get("availableOn"))
        }
        external_resources.append(resource)
    
    # ==================== COMMENTAIRES ====================
    
    comments_raw = card_data.get("comments", [])
    comments = []
    
    for comm in comments_raw:
        comment = {
            "text": comm.get("comment", ""),
            "timestamp": parse_iso_datetime(comm.get("commentedOn")),
            "type": comm.get("type", 0)  # 0=Commentaire, 1=Rapport de situation
        }
        comments.append(comment)
    
    # ==================== ENTRAIDE ====================
    
    mutual_aids_raw = card_data.get("mutualAids", [])
    mutual_aids = []
    
    for aid in mutual_aids_raw:
        mutual_aid = {
            "fire_department": aid.get("fireSafetyDepartment", ""),
            "time_called": parse_iso_datetime(aid.get("calledOn")),
            "time_first_departed": parse_iso_datetime(aid.get("firstDepartedForSiteOn")),
            "time_first_arrived": parse_iso_datetime(aid.get("firstArrivedOn")),
            "time_last_available": parse_iso_datetime(aid.get("lastAvailableOn")),
            "time_last_at_station": parse_iso_datetime(aid.get("lastavailableAtFireStationOn")),
            "assistance_items": aid.get("assistanceItems", [])
        }
        mutual_aids.append(mutual_aid)
    
    # ==================== OFFICIERS ====================
    
    officers = card_data.get("officiers", {})
    officer_intervention = officers.get("intervention", "")
    officer_communication = officers.get("communication", "")
    
    # ==================== RÉPONSE DE PRISE D'APPEL ====================
    
    call_handling = card_data.get("callHandling", {})
    call_answer = call_handling.get("answer", "")
    call_answered_on = parse_iso_datetime(call_handling.get("answeredOn"))
    
    # ==================== CONSTRUIRE LE DOCUMENT ====================
    
    intervention = {
        "id": intervention_id,
        "tenant_id": tenant_id,
        
        # Source
        "import_source": "cauca_api",
        "imported_at": datetime.now(timezone.utc),
        
        # Identifiants
        "external_call_id": calling_card_number,
        "file_number": file_number,
        "fire_department": fire_department,
        
        # Type d'intervention
        "type_intervention": intervention_code_name or f"Code {intervention_code}",
        "intervention_code_cauca": intervention_code,
        "global_intervention_mode": global_mode,
        "code_feu": intervention_code,  # Mapping vers l'ancien champ
        
        # Statut
        "status": "cancelled" if time_1003 else "new",  # Annulée si code 10-3
        
        # Adresse
        "address_full": address_full,
        "address_civic": address_civic,
        "address_street": address_street,
        "address_apartment": address_apartment,
        "address_city": address_city,
        "geo_lat": geo_lat,
        "geo_long": geo_long,
        
        # Secteurs et risque
        "fire_sector": fire_sector,
        "fire_sub_sector": fire_sub_sector,
        "niveau_risque": risk_level,
        
        # Appelant
        "caller_name": caller_name,
        "caller_phone": caller_phone,
        "caller_address": caller_address,
        
        # Sujet (lieu)
        "for_whom": subject_name,
        "for_whom_phone": subject_phone,
        
        # Chronologie principale
        "xml_time_call_received": time_call,
        "xml_time_dispatch": time_alert,
        "xml_time_alert_confirmation": time_alert_confirmation,
        
        # Niveaux d'alerte
        "xml_time_first_alert": time_first_alert,
        "xml_time_code_1012": time_code_1012,
        "xml_time_code_1013": time_code_1013,
        "xml_time_code_1014": time_code_1014,
        "xml_time_code_1015": time_code_1015,
        
        # Statuts opérationnels
        "xml_time_1003_cancelled": time_1003,
        "xml_time_1007_intervention_required": time_1007,
        "xml_time_1010_under_control": time_1010,
        "xml_time_1011_force_frappe": time_1011,
        "xml_time_1018_reconnaissance": time_1018,
        "xml_time_1022": time_1022,
        "xml_time_1090_terminated": time_1090,
        
        # Officiers
        "officer_in_charge_xml": officer_intervention,
        "officer_communication_xml": officer_communication,
        
        # Données structurées
        "cauca_vehicles": vehicles,
        "cauca_matricules": matricules,
        "cauca_external_resources": external_resources,
        "cauca_mutual_aids": mutual_aids,
        
        # Commentaires
        "xml_comments": comments,
        "call_handling_answer": call_answer,
        "call_handling_timestamp": call_answered_on,
        
        # Données brutes pour audit
        "xml_raw_data": card_data,
        
        # Timestamps
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
        "cancelled_at": time_1003,
        "closed_at": time_1090
    }
    
    # Calculer le temps de première arrivée (premier véhicule ou premier matricule)
    first_arrival_times = []
    for veh in vehicles:
        if veh.get("time_arrived"):
            first_arrival_times.append(veh["time_arrived"])
    for mat in matricules:
        if mat.get("time_arrived"):
            first_arrival_times.append(mat["time_arrived"])
    
    if first_arrival_times:
        intervention["xml_time_arrival_1st"] = min(first_arrival_times)
    
    return intervention
