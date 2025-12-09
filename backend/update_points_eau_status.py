#!/usr/bin/env python3
"""
Script pour mettre à jour les statuts des points d'eau de test
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from dotenv import load_dotenv
from pathlib import Path

# Charger les variables d'environnement
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.environ.get("DB_NAME", "profiremanager")

async def update_status():
    print("\n" + "="*60)
    print("🔄 Mise à jour des statuts des points d'eau")
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
    
    # Mettre à jour les statuts
    # BF-001: Fonctionnelle
    await db.points_eau.update_one(
        {"tenant_id": shefford['id'], "numero_identification": "BF-001"},
        {"$set": {"etat": "fonctionnelle", "statut_couleur": "vert"}}
    )
    print("  🟢 BF-001 → Fonctionnelle")
    
    # BF-002: Attention (pression faible)
    await db.points_eau.update_one(
        {"tenant_id": shefford['id'], "numero_identification": "BF-002"},
        {"$set": {"etat": "attention", "statut_couleur": "jaune"}}
    )
    print("  🟡 BF-002 → Attention")
    
    # BS-001: Hors service
    await db.points_eau.update_one(
        {"tenant_id": shefford['id'], "numero_identification": "BS-001"},
        {"$set": {"etat": "hors_service", "statut_couleur": "rouge"}}
    )
    print("  🔴 BS-001 → Hors service")
    
    # BS-002: Fonctionnelle
    await db.points_eau.update_one(
        {"tenant_id": shefford['id'], "numero_identification": "BS-002"},
        {"$set": {"etat": "fonctionnelle", "statut_couleur": "vert"}}
    )
    print("  🟢 BS-002 → Fonctionnelle")
    
    # PE-001: Fonctionnel
    await db.points_eau.update_one(
        {"tenant_id": shefford['id'], "numero_identification": "PE-001"},
        {"$set": {"etat": "fonctionnelle", "statut_couleur": "vert"}}
    )
    print("  🟢 PE-001 → Fonctionnel")
    
    print(f"\n🎉 Statuts mis à jour avec succès!")
    print("\n📍 Code couleur sur la carte:")
    print("   🟢 Vert = Fonctionnel")
    print("   🟡 Jaune = Attention / À vérifier")
    print("   🔴 Rouge = Hors service / Non conforme")
    print("="*60 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(update_status())
