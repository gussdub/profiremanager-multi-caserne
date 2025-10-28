#!/usr/bin/env python3
"""Script pour nettoyer TOUTES les assignations et recommencer"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def clean_all_assignations():
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.firemanager_db
    
    print("=" * 80)
    print("NETTOYAGE COMPLET DES ASSIGNATIONS")
    print("=" * 80)
    
    # Compter avant
    count_before = await db.assignations.count_documents({})
    print(f"\n📊 Assignations avant nettoyage: {count_before}")
    
    # Supprimer TOUTES les assignations
    result = await db.assignations.delete_many({})
    print(f"✅ {result.deleted_count} assignations supprimées")
    
    # Vérifier après
    count_after = await db.assignations.count_documents({})
    print(f"📊 Assignations après nettoyage: {count_after}")
    
    if count_after == 0:
        print("\n✅ Base de données nettoyée avec succès!")
        print("Vous pouvez maintenant relancer l'attribution automatique.")
    else:
        print(f"\n⚠️ Attention: Il reste {count_after} assignations")
    
    client.close()

if __name__ == "__main__":
    print("\n⚠️  CE SCRIPT VA SUPPRIMER TOUTES LES ASSIGNATIONS!")
    print("Appuyez sur Entrée pour continuer ou Ctrl+C pour annuler...")
    input()
    asyncio.run(clean_all_assignations())
