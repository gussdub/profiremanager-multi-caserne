"""
Script d'initialisation des codes d'intervention CAUCA
=======================================================

Importe les 42 codes d'intervention officiels de CAUCA dans la base de données.
Ces codes seront utilisés pour parser et catégoriser les alertes reçues via l'API CAD Transfert.
"""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

# Liste complète des codes d'intervention CAUCA
CODES_CAUCA = [
    # Code abrégé | Type | Description complète
    {"code": "1", "type": "Administration", "description": "Appel nécessitant de rejoindre un officier ou l'état-major."},
    {"code": "2", "type": "Urgence municipale", "description": "Appel nécessitant l'intervention du service des travaux publics."},
    {"code": "3", "type": "Inondation", "description": "Pluie diluvienne, fonte des neiges, embâcles nécessitant intervention."},
    {"code": "5", "type": "Mesures d'urgence", "description": "Protection civile pour compléter les mesures d'urgence de la municipalité."},
    {"code": "10", "type": "Alarme incendie", "description": "Système d'alarme automatique sans confirmation d'incendie."},
    {"code": "11", "type": "Alarme GAZ", "description": "Alarme automatique de détection de gaz."},
    {"code": "12", "type": "Véhicule motorisé", "description": "Incendie de véhicules motorisés (sauf ferroviaire)."},
    {"code": "13", "type": "Entraide", "description": "Service incendie demandé en entraide non automatique."},
    {"code": "15", "type": "Assistance", "description": "Assistance aux services externes (police, ambulance, travaux publics)."},
    {"code": "16", "type": "Couverture caserne", "description": "Couverture caserne pour futurs appels sur territoire externe."},
    {"code": "21", "type": "Cheminée", "description": "Incendie de cheminée."},
    {"code": "25", "type": "RCCI", "description": "Recherche et cause incendie."},
    {"code": "30", "type": "Déversement", "description": "Déversement liquide ou matières dangereuses."},
    {"code": "31", "type": "Vérification", "description": "Vérification diverse, feu à ciel ouvert, odeur de fumée/gaz."},
    {"code": "32", "type": "Débris, déchets", "description": "Reprise de flammes, incendie de conteneur ou cabanon."},
    {"code": "33", "type": "Fuite de gaz", "description": "Fuite de gaz naturel ou propane audible/visible."},
    {"code": "40", "type": "Installations électrique", "description": "Incendie ou étincelles dans poteau/transformateur électrique."},
    {"code": "50", "type": "Forêt, herbes", "description": "Incendie de forêt ou feux d'herbe hors contrôle."},
    {"code": "80", "type": "Bâtiment", "description": "Incendie de bâtiment (commercial, industriel, agricole, résidentiel)."},
    {"code": "90", "type": "Sauvetage", "description": "Tout type de sauvetage effectué par le service incendie."},
    {"code": "91", "type": "Aéronef", "description": "Extinction/sauvetage lors d'un écrasement d'aéronef."},
    {"code": "92", "type": "Sauvetage nautique/sur glace", "description": "Intervention de sauvetage sur l'eau ou glace."},
    {"code": "93", "type": "Feu de véhicule ferroviaire", "description": "Incendie de train, wagon ou locomotive."},
    {"code": "95", "type": "Sauvetage en ascenceur", "description": "Sauvetage dans un ascenseur ou monte-charge."},
    {"code": "97", "type": "Sauvetage hors-route", "description": "Sauvetage nécessitant équipement spécifique (traineau d'évacuation)."},
    {"code": "98", "type": "Désincarcération", "description": "Décarcération pour victime coincée nécessitant outils spécialisés."},
    {"code": "99", "type": "Alerte à la bombe", "description": "Soutien aux policiers lors d'alerte à la bombe."},
    {"code": "105", "type": "Accident de la route", "description": "Intervention sur accident sans désincarcération ni flammes."},
    {"code": "110", "type": "Premiers répondants médicaux", "description": "Intervention premiers répondants médicaux."},
    {"code": "111", "type": "Programme Pair", "description": "Programme Pair pour municipalités offrant ce service."},
    {"code": "120", "type": "PIABS", "description": "Programme PIABS (Région Chaudière-Appalaches seulement)."},
    {"code": "130", "type": "Entraide automatique", "description": "Demande d'entraide prévue à l'avance par SSI voisin."},
    {"code": "140", "type": "Installation électrique (AM)", "description": "Installation électrique - code alternatif."},
    {"code": "156", "type": "Assistance désincarcération", "description": "Assistance désincarcération à un SSI avec équipement spécialisé."},
    {"code": "164", "type": "Assistance hors route", "description": "Assistance hors route à un SSI avec équipement spécialisé."},
    {"code": "888", "type": "Couverture d'évènements", "description": "Couverture d'événement non urgent (festival, parade)."},
    {"code": "999", "type": "Pratique / exercice", "description": "Pratique ou exercice du service incendie."},
]


async def init_codes_cauca():
    """Initialise les codes d'intervention CAUCA dans la base de données"""
    client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
    db = client[os.environ.get('DB_NAME', 'profiremanager')]
    
    print("🚨 Initialisation des codes d'intervention CAUCA...")
    
    created = 0
    updated = 0
    
    for code_data in CODES_CAUCA:
        existing = await db.codes_intervention_cauca.find_one({"code": code_data["code"]})
        
        if existing:
            # Mettre à jour si la description a changé
            await db.codes_intervention_cauca.update_one(
                {"code": code_data["code"]},
                {"$set": {
                    "type": code_data["type"],
                    "description": code_data["description"],
                    "updated_at": datetime.now(timezone.utc)
                }}
            )
            print(f"  ⏭️  Code {code_data['code']} - {code_data['type']} (mis à jour)")
            updated += 1
            continue
        
        code_doc = {
            "id": str(uuid.uuid4()),
            "code": code_data["code"],
            "type": code_data["type"],
            "description": code_data["description"],
            "actif": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": None
        }
        
        await db.codes_intervention_cauca.insert_one(code_doc)
        print(f"  ✅ Code {code_data['code']} - {code_data['type']}")
        created += 1
    
    # Créer un index sur le code pour recherche rapide
    await db.codes_intervention_cauca.create_index("code", unique=True)
    
    print(f"\n📊 Résumé: {created} créés, {updated} mis à jour")
    print(f"✅ {len(CODES_CAUCA)} codes d'intervention CAUCA disponibles!")


if __name__ == "__main__":
    asyncio.run(init_codes_cauca())
