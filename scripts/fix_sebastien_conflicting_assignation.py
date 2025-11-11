#!/usr/bin/env python3
"""
Supprimer l'assignation automatique problématique de Sébastien Charest
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

async def remove_conflicting_auto_assignation():
    """Supprimer l'assignation automatique qui entre en conflit"""
    
    print("🔧 SUPPRESSION ASSIGNATION AUTOMATIQUE CONFLICTUELLE")
    print("=" * 60)
    
    # Récupérer Sébastien
    sebastien = await db.users.find_one({"email": "sebas.charest18@hotmail.com"})
    
    # Date cible
    date_cible = "2025-11-04"
    
    # Trouver l'assignation automatique "Garde Pr 1 nuit"
    assignation_auto = await db.assignations.find_one({
        "user_id": sebastien['id'],
        "date": date_cible,
        "assignation_type": "auto"
    })
    
    if assignation_auto:
        # Récupérer le nom du type de garde
        type_garde = await db.types_garde.find_one({"id": assignation_auto.get('type_garde_id')})
        type_nom = type_garde.get('nom', 'Type inconnu') if type_garde else 'Type non trouvé'
        
        print(f"✓ Assignation automatique trouvée:")
        print(f"  Date: {assignation_auto['date']}")
        print(f"  Type garde: {type_nom}")
        print(f"  ID: {assignation_auto['id']}")
        print(f"  assignation_type: {assignation_auto['assignation_type']}")
        
        # Supprimer cette assignation
        result = await db.assignations.delete_one({"id": assignation_auto['id']})
        
        if result.deleted_count > 0:
            print(f"\n✅ Assignation automatique supprimée avec succès!")
        else:
            print(f"\n❌ Échec de la suppression")
            
        # Vérifier qu'elle est bien supprimée
        check = await db.assignations.find_one({"id": assignation_auto['id']})
        if not check:
            print(f"✓ Vérification: assignation bien supprimée de la base")
        else:
            print(f"❌ Vérification: assignation encore présente!")
    
    else:
        print("❌ Aucune assignation automatique trouvée pour cette date")
    
    # Afficher le résumé final
    assignations_restantes = await db.assignations.find({
        "user_id": sebastien['id'],
        "date": date_cible
    }).to_list(None)
    
    print(f"\n📊 ASSIGNATIONS RESTANTES POUR LE {date_cible}: {len(assignations_restantes)}")
    for assignation in assignations_restantes:
        type_garde = await db.types_garde.find_one({"id": assignation.get('type_garde_id')})
        type_nom = type_garde.get('nom', 'Type inconnu') if type_garde else 'Type non trouvé'
        print(f"  - {type_nom} ({assignation.get('assignation_type')})")
    
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(remove_conflicting_auto_assignation())