#!/usr/bin/env python3
"""
Corriger la durée incorrecte du Préventionniste 6H
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

# Charger les variables d'environnement
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Connexion MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'profiremanager')
db = client[db_name]

async def fix_preventionniste_6h_duration():
    """Corriger la durée du Préventionniste 6H"""
    
    print("🔧 CORRECTION DURÉE PRÉVENTIONNISTE 6H")
    print("=" * 50)
    
    # Trouver le Préventionniste 6H
    preventionniste_6h = await db.types_garde.find_one({
        "nom": "Préventionniste 6H"
    })
    
    if preventionniste_6h:
        print(f"✓ Type trouvé: {preventionniste_6h['nom']}")
        print(f"  Durée actuelle: {preventionniste_6h.get('duree_heures')}h")
        print(f"  Heure début: {preventionniste_6h.get('heure_debut')}")
        print(f"  Heure fin: {preventionniste_6h.get('heure_fin')}")
        
        # Corriger la durée à 6h
        result = await db.types_garde.update_one(
            {"id": preventionniste_6h["id"]},
            {"$set": {"duree_heures": 6}}
        )
        
        if result.modified_count > 0:
            print(f"✅ Durée corrigée: 8h → 6h")
        else:
            print(f"❌ Échec de la correction")
        
        # Vérification
        updated_type = await db.types_garde.find_one({"id": preventionniste_6h["id"]})
        print(f"  Durée après correction: {updated_type.get('duree_heures')}h")
    else:
        print("❌ Préventionniste 6H non trouvé")
    
    print("\n" + "=" * 50)

if __name__ == "__main__":
    asyncio.run(fix_preventionniste_6h_duration())