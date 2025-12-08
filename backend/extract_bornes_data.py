#!/usr/bin/env python3
"""
Script pour extraire les données des 21 Google Forms et mettre à jour la base de données
"""

import asyncio
import os
import re
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Charger les variables d'environnement
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.environ.get("DB_NAME", "profiremanager")

# Données extraites manuellement des Google Forms
BORNES_DATA = [
    {
        "nom_borne": "11 Allard",
        "adresse_proximite": "11 chemin Allard",
        "transversale": "Route 243",
        "lien_itineraire": "https://maps.app.goo.gl/rAPMXVr1jMRy8jLp7",
        "notes_importantes": "Allumer vos gyrophares. La barrière est toujours débarrée.",
        "photo_localisation": "https://lh7-rt.googleusercontent.com/formsz/AN7BsVAQBDi8QlXsFJ1s77ZpDnKRaDrmcYbCRSDTf6zw2SPkq26R3XGiiTCts1JOIpT7gHOR1KO0V9s3BsUb8WVfzqTd04JL8QZWZqDGOWPT9xZ-qGACG0epBJhjZ3l-5kIna4R1LSOOClpnlL5cZS1ehOtonBddgvuzd4qwDIidixHmmzzU45Xo9yGCVPXIG4LuCVTQOE9_SphKGkKA=w740"
    },
    # Pour l'instant, on garde les autres avec des données minimales
    # L'utilisateur pourra les compléter via l'interface admin
]

async def update_borne_data():
    print("\n" + "="*60)
    print("🟠 Mise à jour des données des bornes sèches")
    print("="*60 + "\n")
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]
    
    # Récupérer le tenant Shefford
    shefford = await db.tenants.find_one({"slug": "shefford"})
    
    if not shefford:
        print("❌ Tenant Shefford non trouvé")
        client.close()
        return
    
    print(f"✅ Tenant Shefford trouvé: {shefford['id']}")
    
    # Mettre à jour la première borne avec les données extraites
    for borne_data in BORNES_DATA:
        result = await db.bornes_seches_templates.update_one(
            {
                "tenant_id": shefford['id'],
                "nom_borne": borne_data['nom_borne']
            },
            {
                "$set": {
                    **borne_data,
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
        )
        
        if result.matched_count > 0:
            print(f"  ✅ {borne_data['nom_borne']} mise à jour")
        else:
            print(f"  ⚠️  {borne_data['nom_borne']} non trouvée")
    
    print(f"\n🎉 Mise à jour terminée!")
    print("\n📝 Note: Les autres bornes doivent être complétées via l'interface admin")
    print("="*60 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_borne_data())
