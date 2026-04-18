#!/usr/bin/env python3
"""
Script de nettoyage direct de la base de données production
À exécuter manuellement si l'endpoint admin ne fonctionne pas
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime

# ATTENTION : Remplacez par l'URL MongoDB de PRODUCTION
MONGO_URL_PROD = "mongodb://profiremanager_admin:BsqKibVAy6FTiTxg@ac-mwksu0n-shard-00-00.crqjvsp.mongodb.net:27017,ac-mwksu0n-shard-00-01.crqjvsp.mongodb.net:27017,ac-mwksu0n-shard-00-02.crqjvsp.mongodb.net:27017/profiremanager-prod?ssl=true&authSource=admin&retryWrites=true&w=majority&directConnection=false"

DB_NAME = "profiremanager-prod"  # Base de production
TENANTS_VOULUS = ["sutton", "demo", "demonstration", "shefford"]

async def cleanup_production():
    print("=" * 70)
    print("🧹 NETTOYAGE BASE DE DONNÉES PRODUCTION")
    print("=" * 70)
    print("\n⚠️  ATTENTION : Cette action est IRRÉVERSIBLE")
    print(f"📋 Tenants à conserver : {', '.join(TENANTS_VOULUS)}")
    
    confirmation = input("\n❓ Tapez 'OUI' pour confirmer : ")
    if confirmation != "OUI":
        print("❌ Annulé")
        return
    
    client = AsyncIOMotorClient(MONGO_URL_PROD)
    db = client[DB_NAME]
    
    try:
        # 1. Récupérer tous les tenants
        tenants = await db.tenants.find({}, {"_id": 0, "id": 1, "slug": 1}).to_list(100)
        tenants_valides = [t['id'] for t in tenants if t.get('slug', '').lower() in TENANTS_VOULUS]
        tenants_a_supprimer = [t for t in tenants if t.get('slug', '').lower() not in TENANTS_VOULUS]
        
        print(f"\n✅ Tenants à conserver : {[t.get('slug') for t in tenants if t['id'] in tenants_valides]}")
        print(f"❌ Tenants à supprimer : {[t.get('slug') for t in tenants_a_supprimer]}")
        
        results = {
            "tenants_conserves": [t.get('slug') for t in tenants if t['id'] in tenants_valides],
            "tenants_supprimes": [],
            "batiments_supprimes": 0,
            "inspections_supprimees": 0,
            "orphelins_supprimes": {}
        }
        
        # 2. Supprimer les tenants indésirables
        for tenant in tenants_a_supprimer:
            await db.tenants.delete_one({"id": tenant['id']})
            results["tenants_supprimes"].append(tenant.get('slug'))
            print(f"\n🗑️  Tenant '{tenant.get('slug')}' supprimé")
            
            # Supprimer toutes les données associées
            collections = await db.list_collection_names()
            for coll_name in collections:
                if coll_name not in ['super_admins', 'system.indexes', 'centrales_911']:
                    result = await db[coll_name].delete_many({"tenant_id": tenant['id']})
                    if result.deleted_count > 0:
                        print(f"   - {coll_name}: {result.deleted_count} documents")
        
        # 3. Supprimer TOUS les bâtiments et inspections
        print("\n" + "=" * 70)
        print("🗑️  SUPPRESSION BÂTIMENTS ET INSPECTIONS")
        print("=" * 70)
        
        result_bat = await db.batiments.delete_many({})
        results["batiments_supprimes"] = result_bat.deleted_count
        print(f"✅ Bâtiments supprimés: {result_bat.deleted_count}")
        
        result_insp = await db.inspections.delete_many({})
        results["inspections_supprimees"] = result_insp.deleted_count
        print(f"✅ Inspections supprimées: {result_insp.deleted_count}")
        
        # 4. Nettoyer historiques
        await db.batiments_historique.delete_many({})
        await db.import_dossier_adresses.delete_many({})
        print(f"✅ Historiques nettoyés")
        
        # 5. Supprimer les données orphelines
        print("\n" + "=" * 70)
        print("👻 NETTOYAGE DES DONNÉES ORPHELINES")
        print("=" * 70)
        
        collections_to_clean = [
            "users", "types_garde", "assignations", "demandes_remplacement",
            "formations", "disponibilites", "interventions", "equipements", "stored_files"
        ]
        
        for coll_name in collections_to_clean:
            result = await db[coll_name].delete_many({"tenant_id": {"$nin": tenants_valides}})
            if result.deleted_count > 0:
                results["orphelins_supprimes"][coll_name] = result.deleted_count
                print(f"   - {coll_name}: {result.deleted_count} documents")
        
        # 6. Résumé
        print("\n" + "=" * 70)
        print("✅ NETTOYAGE TERMINÉ")
        print("=" * 70)
        print(f"\nRésultats :")
        print(f"  - Tenants conservés : {', '.join(results['tenants_conserves'])}")
        print(f"  - Bâtiments supprimés : {results['batiments_supprimes']}")
        print(f"  - Inspections supprimées : {results['inspections_supprimees']}")
        
        if results['tenants_supprimes']:
            print(f"  - Tenants supprimés : {', '.join(results['tenants_supprimes'])}")
        
    except Exception as e:
        print(f"\n❌ ERREUR : {e}")
        import traceback
        traceback.print_exc()
    finally:
        client.close()

if __name__ == "__main__":
    print("\n🔧 Script de Nettoyage Production ProFireManager")
    print("=" * 70)
    asyncio.run(cleanup_production())
