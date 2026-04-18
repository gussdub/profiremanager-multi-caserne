#!/usr/bin/env python3
"""
Script de nettoyage complet de la base de données ProFireManager
Supprime tous les bâtiments, inspections et données orphelines
Conserve uniquement les tenants: demo, shefford, magog
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = "profiremanager-dev"

TENANTS_VOULUS = ["demo", "shefford", "magog"]

async def cleanup():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("=" * 70)
    print("🧹 NETTOYAGE COMPLET DE LA BASE DE DONNÉES")
    print("=" * 70)
    
    # 1. Récupérer tous les tenants
    tenants = await db.tenants.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
    tenants_valides = [t['id'] for t in tenants if t.get('slug', '').lower() in TENANTS_VOULUS]
    tenants_a_supprimer = [t for t in tenants if t.get('slug', '').lower() not in TENANTS_VOULUS]
    
    print(f"\n✅ Tenants à conserver: {[t.get('slug') for t in tenants if t['id'] in tenants_valides]}")
    print(f"❌ Tenants à supprimer: {[t.get('slug') for t in tenants_a_supprimer]}")
    
    # 2. Supprimer les tenants indésirables
    for tenant in tenants_a_supprimer:
        result = await db.tenants.delete_one({"id": tenant['id']})
        print(f"\n🗑️  Tenant '{tenant.get('slug')}' supprimé")
        
        # Supprimer toutes les données associées
        collections = await db.list_collection_names()
        for coll_name in collections:
            if coll_name not in ['super_admins', 'system.indexes']:
                result = await db[coll_name].delete_many({"tenant_id": tenant['id']})
                if result.deleted_count > 0:
                    print(f"   - {coll_name}: {result.deleted_count} documents supprimés")
    
    # 3. Supprimer TOUS les bâtiments et inspections (même des tenants valides)
    print("\n" + "=" * 70)
    print("🗑️  SUPPRESSION DE TOUS LES BÂTIMENTS ET INSPECTIONS")
    print("=" * 70)
    
    result_bat = await db.batiments.delete_many({})
    print(f"✅ Bâtiments supprimés: {result_bat.deleted_count}")
    
    result_insp = await db.inspections.delete_many({})
    print(f"✅ Inspections supprimées: {result_insp.deleted_count}")
    
    result_hist = await db.batiments_historique.delete_many({})
    if result_hist.deleted_count > 0:
        print(f"✅ Historique bâtiments supprimé: {result_hist.deleted_count}")
    
    result_import = await db.import_dossier_adresses.delete_many({})
    if result_import.deleted_count > 0:
        print(f"✅ Dossiers d'adresses importés supprimés: {result_import.deleted_count}")
    
    # 4. Supprimer les données orphelines (tenant_id inexistant)
    print("\n" + "=" * 70)
    print("👻 SUPPRESSION DES DONNÉES ORPHELINES")
    print("=" * 70)
    
    collections_to_clean = [
        "users", "types_garde", "assignations", "demandes_remplacement",
        "formations", "disponibilites", "sessions_formation",
        "inscriptions_formation", "demandes_conge", "notifications",
        "interventions", "equipements", "stored_files"
    ]
    
    for coll_name in collections_to_clean:
        result = await db[coll_name].delete_many({"tenant_id": {"$nin": tenants_valides}})
        if result.deleted_count > 0:
            print(f"   - {coll_name}: {result.deleted_count} documents orphelins supprimés")
    
    # 5. Vérification finale
    print("\n" + "=" * 70)
    print("📊 ÉTAT FINAL")
    print("=" * 70)
    
    final_tenants = await db.tenants.find({}, {"_id": 0, "slug": 1}).to_list(100)
    print(f"\n✅ Tenants: {[t['slug'] for t in final_tenants]}")
    
    for tenant_slug in TENANTS_VOULUS:
        tenant = await db.tenants.find_one({"slug": tenant_slug}, {"_id": 0, "id": 1})
        if tenant:
            bat_count = await db.batiments.count_documents({"tenant_id": tenant['id']})
            insp_count = await db.inspections.count_documents({"tenant_id": tenant['id']})
            print(f"\n{tenant_slug}:")
            print(f"   Bâtiments: {bat_count}")
            print(f"   Inspections: {insp_count}")
    
    print("\n✅ NETTOYAGE TERMINÉ !")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(cleanup())
