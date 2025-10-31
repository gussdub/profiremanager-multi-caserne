#!/usr/bin/env python3
"""
Vérifier l'état du module prévention pour le tenant demo
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

async def check_tenant_demo():
    """Vérifier l'état du tenant demo"""
    
    print("=" * 80)
    print("VÉRIFICATION TENANT DEMO - MODULE PRÉVENTION")
    print("=" * 80)
    
    # Chercher le tenant demo
    tenant_demo = await db.tenants.find_one({"slug": "demo"})
    
    if not tenant_demo:
        print("❌ Tenant 'demo' non trouvé!")
        
        # Lister tous les tenants disponibles
        all_tenants = await db.tenants.find({}).to_list(None)
        print(f"\n📋 Tenants disponibles ({len(all_tenants)}):")
        for tenant in all_tenants:
            print(f"  - {tenant.get('nom')} (slug: {tenant.get('slug')})")
        return
    
    print(f"✓ Tenant demo trouvé:")
    print(f"  ID: {tenant_demo.get('id')}")
    print(f"  Nom: {tenant_demo.get('nom')}")
    print(f"  Slug: {tenant_demo.get('slug')}")
    print(f"  Is Active: {tenant_demo.get('is_active')}")
    
    # Vérifier les paramètres
    parametres = tenant_demo.get('parametres', {})
    print(f"\n📊 PARAMÈTRES TENANT:")
    if parametres:
        for key, value in parametres.items():
            print(f"  {key}: {value}")
    else:
        print("  (Aucun paramètre configuré)")
    
    module_prevention_active = parametres.get('module_prevention_active', False)
    print(f"\n🔥 MODULE PRÉVENTION:")
    print(f"  Status: {'✅ ACTIVÉ' if module_prevention_active else '❌ DÉSACTIVÉ'}")
    
    if not module_prevention_active:
        print(f"\n⚠️  PROBLÈME IDENTIFIÉ:")
        print(f"     Le module prévention n'est PAS activé pour le tenant demo")
        print(f"     Il faut l'activer via l'interface super-admin")
    
    print(f"\n{'=' * 80}")

if __name__ == "__main__":
    asyncio.run(check_tenant_demo())