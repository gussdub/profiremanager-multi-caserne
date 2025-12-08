#!/usr/bin/env python3
"""
Script d'initialisation des 21 bornes sèches pour le tenant Shefford
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from uuid import uuid4
from dotenv import load_dotenv
from pathlib import Path

# Charger les variables d'environnement
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.environ.get("DB_NAME", "profiremanager")

# Liste des 21 bornes sèches à créer
BORNES_SECHES = [
    {"nom": "11 Allard", "adresse_proximite": "11 chemin Allard", "transversale": "Route 243"},
    {"nom": "Saxby", "adresse_proximite": "Chemin Saxby", "transversale": ""},
    {"nom": "Érablière", "adresse_proximite": "Chemin de l'Érablière", "transversale": ""},
    {"nom": "Borne Sèche 4", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 5", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 6", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 7", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 8", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 9", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 10", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 11", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 12", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 13", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 14", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 15", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 16", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 17", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 18", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 19", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 20", "adresse_proximite": "", "transversale": ""},
    {"nom": "Borne Sèche 21", "adresse_proximite": "", "transversale": ""},
]

async def init_bornes_seches():
    print("\n" + "="*60)
    print("🟠 Initialisation des bornes sèches pour Shefford")
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
    
    # Supprimer les bornes sèches existantes (pour éviter les doublons)
    deleted = await db.bornes_seches_templates.delete_many({"tenant_id": shefford['id']})
    print(f"🗑️  {deleted.deleted_count} bornes sèches existantes supprimées")
    
    # Créer les 21 bornes sèches
    count_created = 0
    
    for borne_data in BORNES_SECHES:
        borne_template = {
            "id": str(uuid4()),
            "tenant_id": shefford['id'],
            "nom_borne": borne_data['nom'],
            "municipalite": "Canton de Shefford",
            "adresse_proximite": borne_data['adresse_proximite'],
            "transversale": borne_data['transversale'],
            "lien_itineraire": "",
            "notes_importantes": "À compléter via l'interface admin",
            # Caractéristiques techniques par défaut
            "type_borne": "PVC",
            "angle": "90°",
            "diametre_tuyau": '6"',
            "diametre_raccordement": '6"',
            "type_branchement": "Fileté",
            # Photos et schémas vides (à compléter plus tard)
            "photo_localisation": "",
            "photo_borne": "",
            "schema_1": "",
            "schema_2": "",
            "schema_3": "",
            "schema_4": "",
            "schema_5": "",
            # Métadonnées
            "date_derniere_inspection": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        await db.bornes_seches_templates.insert_one(borne_template)
        count_created += 1
        print(f"  ✅ {borne_data['nom']}")
    
    print(f"\n🎉 {count_created} bornes sèches créées avec succès!")
    print("\n📝 Note: Les bornes peuvent être complétées via l'interface admin")
    print("="*60 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_bornes_seches())
