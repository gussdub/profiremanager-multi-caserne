#!/usr/bin/env python3
"""
Vérifier l'assignation de Sébastien Charest et son type d'assignation
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

async def debug_sebastien_assignation():
    """Debug l'assignation de Sébastien"""
    
    print("=" * 80)
    print("DEBUG ASSIGNATION SÉBASTIEN CHAREST")
    print("=" * 80)
    
    # Récupérer Sébastien
    sebastien = await db.users.find_one({"email": "sebas.charest18@hotmail.com"})
    if not sebastien:
        print("❌ Sébastien non trouvé!")
        return
    
    print(f"✓ Sébastien trouvé: {sebastien['id']}")
    
    # Récupérer ses assignations récentes
    assignations = await db.assignations.find({
        "user_id": sebastien['id']
    }).sort("date", -1).limit(10).to_list(None)
    
    print(f"\n📋 {len(assignations)} ASSIGNATIONS RÉCENTES:")
    
    for i, assignation in enumerate(assignations, 1):
        # Récupérer le type de garde
        type_garde = await db.types_garde.find_one({"id": assignation.get('type_garde_id')})
        type_nom = type_garde.get('nom', 'Type inconnu') if type_garde else 'Type non trouvé'
        
        print(f"\n{i}. {assignation.get('date')} - {type_nom}")
        print(f"   ID: {assignation.get('id')}")
        print(f"   assignation_type: '{assignation.get('assignation_type', 'N/A')}'")
        print(f"   tenant_id: {assignation.get('tenant_id')}")
        
        # Highlight si c'est une garde Pr/Préventionniste
        if type_nom and ('Pr' in type_nom or 'Préventionniste' in type_nom):
            print(f"   ⚠️  GARDE PR/PRÉVENTIONNISTE DÉTECTÉE!")
    
    # Vérifier spécifiquement les assignations du 04/11/2025
    date_cible = "2025-11-04"
    assignations_date = await db.assignations.find({
        "user_id": sebastien['id'],
        "date": date_cible
    }).to_list(None)
    
    print(f"\n🎯 ASSIGNATIONS DU {date_cible}: {len(assignations_date)}")
    for assignation in assignations_date:
        type_garde = await db.types_garde.find_one({"id": assignation.get('type_garde_id')})
        type_nom = type_garde.get('nom', 'Type inconnu') if type_garde else 'Type non trouvé'
        
        print(f"   - {type_nom}")
        print(f"     assignation_type: '{assignation.get('assignation_type', 'N/A')}'")
        print(f"     ID assignation: {assignation.get('id')}")
    
    # Vérifier tous les types d'assignation existants
    print(f"\n📊 TOUS LES TYPES D'ASSIGNATION EXISTANTS:")
    distinct_types = await db.assignations.distinct("assignation_type", {"tenant_id": sebastien['tenant_id']})
    for assignation_type in distinct_types:
        count = await db.assignations.count_documents({
            "tenant_id": sebastien['tenant_id'],
            "assignation_type": assignation_type
        })
        print(f"   {assignation_type}: {count} assignations")
    
    print(f"\n{'=' * 80}")

if __name__ == "__main__":
    asyncio.run(debug_sebastien_assignation())