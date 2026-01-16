"""
Script d'initialisation des centrales 911 du Québec
Basé sur la liste officielle des 26 CASP certifiés + 2 non certifiés
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# Configuration CAUCA (premier profil de parsing)
CAUCA_FIELD_MAPPING = {
    # Identifiants
    "external_call_id": "noCarteAppel",
    "guid_carte": "idCarteAppel", 
    "guid_municipalite": "guidMun",
    "no_sequentiel": "noSequentiel",
    
    # Adresse
    "address_civic": "noPorte",
    "address_street": "rue",
    "address_apartment": "noAppart",
    "address_city": "villePourQui",
    
    # Appelant
    "caller_name": "deQui",
    "caller_phone": "telDeQui",
    "for_whom": "pourQui",
    "for_whom_phone": "telPourQui",
    
    # Type intervention
    "type_intervention": "typeIntervention",
    "code_feu": "codeFeu",
    "niveau_risque": "niveauRisque",
    
    # Chronologie
    "xml_time_call_received": "heureAppel",
    "xml_time_911": "heure911",
    "xml_time_dispatch": "heureAlerte",
    "xml_time_en_route": "depCaserne",
    "xml_time_arrival_1st": "arrLieux",
    "xml_time_force_frappe": "forceFrappe",
    "xml_time_under_control": "sousControle",
    "xml_time_1022": "heure1022",
    "xml_time_departure": "depLieux",
    "xml_time_terminated": "dispFinale",
    
    # Ressources (dans liste)
    "vehicles_list": "ressources/ressource",
    "vehicle_number": "noRessource",
    "vehicle_status": "statutCamion",
    "vehicle_crew_count": "nbPompier",
    
    # Commentaires
    "comments_list": "commentaires/commentaire",
}

# Liste des 26 CASP certifiés + 2 non certifiés
CENTRALES_911 = [
    # Certifiés
    {"code": "CAUCA", "nom": "Centre d'appels d'urgence Chaudière-Appalaches", "region": "Chaudière-Appalaches", "has_profile": True},
    {"code": "CAUREQ", "nom": "Centre d'appels d'urgence de la région de Québec", "region": "Capitale-Nationale"},
    {"code": "CAUREL", "nom": "Centre d'appels d'urgence de la région de L'Érable et Lotbinière", "region": "Chaudière-Appalaches"},
    {"code": "COGECSTRE", "nom": "Corporation de gestion des centres de services des trois régions de l'Est", "region": "Bas-Saint-Laurent"},
    {"code": "CAUHSL", "nom": "Centre d'appels d'urgence du Haut-Saint-Laurent", "region": "Montérégie"},
    {"code": "CAU911BSL", "nom": "Centre d'appels d'urgence 911 du Bas-Saint-Laurent et Gaspésie–Îles-de-la-Madeleine", "region": "Bas-Saint-Laurent"},
    {"code": "CAUMCQ", "nom": "Centre d'appels d'urgence de la Mauricie-Centre-du-Québec", "region": "Mauricie"},
    {"code": "CAU9LANO", "nom": "Centre d'appels d'urgence 9-1-1 Lanaudière-Nord", "region": "Lanaudière"},
    {"code": "CAURM", "nom": "Centre d'appels d'urgence de la Rive-sud de Montréal", "region": "Montérégie"},
    {"code": "CAUSL", "nom": "Centre d'appels d'urgence du Suroît et des Laurentides", "region": "Laurentides"},
    {"code": "CAUSDL", "nom": "Centre d'appels d'urgence du sud des Laurentides", "region": "Laurentides"},
    {"code": "CAUNL", "nom": "Centre d'appels d'urgence du nord des Laurentides", "region": "Laurentides"},
    {"code": "LEVIS", "nom": "Ville de Lévis – Service de la sécurité incendie", "region": "Chaudière-Appalaches"},
    {"code": "LAVAL", "nom": "Ville de Laval – Service de sécurité incendie", "region": "Laval"},
    {"code": "LONGUEUIL", "nom": "Ville de Longueuil – Service de sécurité incendie", "region": "Montérégie"},
    {"code": "SHERBROOKE", "nom": "Ville de Sherbrooke – Service de sécurité incendie", "region": "Estrie"},
    {"code": "GATINEAU", "nom": "Ville de Gatineau – Service de sécurité incendie", "region": "Outaouais"},
    {"code": "SAGUENAY", "nom": "Ville de Saguenay – Service de sécurité incendie", "region": "Saguenay–Lac-Saint-Jean"},
    {"code": "SQUAT", "nom": "Sûreté du Québec – Section des appels et de la télécommunication", "region": "Provincial"},
    {"code": "MRC_HY", "nom": "MRC de la Haute-Yamaska", "region": "Montérégie"},
    {"code": "MRC_MEM", "nom": "MRC de Memphrémagog", "region": "Estrie"},
    {"code": "MRC_BROM", "nom": "MRC Brome-Missisquoi", "region": "Montérégie"},
    {"code": "MRC_GRAN", "nom": "MRC de La Haute-Côte-Nord et Manicouagan", "region": "Côte-Nord"},
    {"code": "BEAUCE", "nom": "MRC de Beauce-Sartigan", "region": "Chaudière-Appalaches"},
    {"code": "ARTHABASKA", "nom": "MRC d'Arthabaska", "region": "Centre-du-Québec"},
    {"code": "DRUMMOND", "nom": "MRC de Drummond", "region": "Centre-du-Québec"},
    # Non certifiés mais actifs
    {"code": "MONTREAL", "nom": "Ville de Montréal – Service de sécurité incendie", "region": "Montréal", "notes": "Non certifié CASP"},
    {"code": "TERREBONNE", "nom": "Régie intermunicipale de police Terrebonne–Sainte-Anne-des-Plaines–Bois-des-Filion", "region": "Lanaudière", "notes": "Non certifié CASP"},
]


async def init_centrales():
    """Initialise les centrales 911 dans la base de données"""
    client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
    db = client[os.environ.get('DB_NAME', 'profiremanager')]
    
    print("🚨 Initialisation des centrales 911 du Québec...")
    
    created = 0
    updated = 0
    
    for centrale_data in CENTRALES_911:
        existing = await db.centrales_911.find_one({"code": centrale_data["code"]})
        
        if existing:
            print(f"  ⏭️  {centrale_data['code']} existe déjà")
            updated += 1
            continue
        
        centrale = {
            "id": str(uuid.uuid4()),
            "code": centrale_data["code"],
            "nom": centrale_data["nom"],
            "region": centrale_data.get("region", ""),
            "actif": True,
            "xml_encoding": "utf-8",
            "xml_root_element": "carteAppel",
            "field_mapping": CAUCA_FIELD_MAPPING if centrale_data.get("has_profile") else {},
            "value_mapping": {},
            "date_formats": ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"],
            "notes": centrale_data.get("notes", ""),
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.centrales_911.insert_one(centrale)
        print(f"  ✅ {centrale_data['code']} - {centrale_data['nom']}")
        created += 1
    
    # Créer un index sur le code
    await db.centrales_911.create_index("code", unique=True)
    
    print(f"\n📊 Résumé: {created} créées, {updated} existantes")
    print("✅ Initialisation terminée!")


if __name__ == "__main__":
    asyncio.run(init_centrales())
