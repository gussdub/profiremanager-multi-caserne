#!/usr/bin/env python3
"""Script pour nettoyer UNIQUEMENT les assignations automatiques"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def clean_auto_assignations():
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.firemanager_db
    
    print("=" * 80)
    print("NETTOYAGE DES ASSIGNATIONS AUTOMATIQUES UNIQUEMENT")
    print("=" * 80)
    
    # Compter toutes les assignations
    count_total = await db.assignations.count_documents({})
    print(f"\n📊 Total assignations dans la base: {count_total}")
    
    # Compter par type
    types_assignations = await db.assignations.aggregate([
        {"$group": {"_id": "$assignation_type", "count": {"$sum": 1}}}
    ]).to_list(100)
    
    print("\n📊 Répartition par type:")
    for t in types_assignations:
        print(f"   - {t['_id']}: {t['count']}")
    
    # Compter celles qui seront supprimées
    count_auto = await db.assignations.count_documents({
        "assignation_type": {"$in": ["auto", "automatique", None]}
    })
    print(f"\n⚠️  Assignations AUTO à supprimer: {count_auto}")
    
    # Compter celles qui seront CONSERVÉES
    count_manual = await db.assignations.count_documents({
        "assignation_type": {"$nin": ["auto", "automatique", None]}
    })
    print(f"✅ Assignations MANUELLES conservées: {count_manual}")
    
    # Confirmation
    print("\n" + "=" * 80)
    if count_manual > 0:
        print(f"⚠️  ATTENTION: {count_manual} assignation(s) manuelle(s) seront CONSERVÉES")
    print(f"🗑️  {count_auto} assignation(s) automatique(s) seront SUPPRIMÉES")
    print("=" * 80)
    print("\nAppuyez sur Entrée pour continuer ou Ctrl+C pour annuler...")
    input()
    
    # Supprimer UNIQUEMENT les assignations auto
    result = await db.assignations.delete_many({
        "assignation_type": {"$in": ["auto", "automatique", None]}
    })
    print(f"\n✅ {result.deleted_count} assignations automatiques supprimées")
    
    # Vérifier après
    count_after = await db.assignations.count_documents({})
    print(f"📊 Assignations restantes: {count_after}")
    
    if count_after == count_manual:
        print("\n✅ Nettoyage réussi! Les assignations manuelles sont conservées.")
    else:
        print(f"\n⚠️ Attention: Nombre inattendu d'assignations restantes")
    
    print("\nVous pouvez maintenant relancer l'attribution automatique.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(clean_auto_assignations())

