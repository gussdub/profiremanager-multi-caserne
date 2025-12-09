#!/usr/bin/env python3
"""
Script pour créer des points d'eau de test pour visualiser les icônes
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

# Points d'eau de test pour Shefford (coordonnées réelles)
POINTS_TEST = [
    {
        "type": "borne_fontaine",
        "numero_identification": "BF-001",
        "latitude": 45.3778,
        "longitude": -72.6839,
        "adresse": "123 Rue Principale",
        "ville": "Shefford",
        "debit_gpm": "1500",
        "pression_statique_psi": "65",
        "pression_dynamique_psi": "50",
        "diametre_raccordement": '6"',
        "etat": "fonctionnelle",
        "notes": "Borne fontaine de test - À proximité de la caserne"
    },
    {
        "type": "borne_seche",
        "numero_identification": "BS-001",
        "latitude": 45.3800,
        "longitude": -72.6850,
        "adresse": "456 Chemin du Lac",
        "ville": "Shefford",
        "notes": "Borne sèche de test - Accès au lac"
    },
    {
        "type": "point_eau_statique",
        "numero_identification": "PE-001",
        "latitude": 45.3750,
        "longitude": -72.6820,
        "adresse": "789 Route des Montagnes",
        "ville": "Shefford",
        "capacite_litres": "50000",
        "accessibilite": "facile",
        "notes": "Réservoir municipal - Point d'eau statique de test"
    },
    {
        "type": "borne_fontaine",
        "numero_identification": "BF-002",
        "latitude": 45.3820,
        "longitude": -72.6800,
        "adresse": "321 Avenue du Parc",
        "ville": "Shefford",
        "debit_gpm": "1800",
        "pression_statique_psi": "70",
        "diametre_raccordement": '8"',
        "etat": "fonctionnelle",
        "notes": "Borne fontaine haute capacité"
    },
    {
        "type": "borne_seche",
        "numero_identification": "BS-002",
        "latitude": 45.3760,
        "longitude": -72.6870,
        "adresse": "11 Chemin Allard",
        "ville": "Shefford",
        "notes": "Borne sèche - Même emplacement que template existant"
    }
]

async def init_points_test():
    print("\n" + "="*60)
    print("💧 Création de points d'eau de test pour Shefford")
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
    
    # Récupérer un utilisateur admin pour created_by_id
    admin = await db.users.find_one({"tenant_id": shefford['id'], "role": "admin"})
    
    if not admin:
        print("❌ Aucun admin trouvé")
        client.close()
        return
    
    print(f"✅ Admin trouvé: {admin['email']}")
    
    # Supprimer les points existants (pour éviter les doublons en cas de ré-exécution)
    deleted = await db.points_eau.delete_many({"tenant_id": shefford['id']})
    print(f"🗑️  {deleted.deleted_count} point(s) d'eau existant(s) supprimé(s)")
    
    # Créer les points de test
    count_created = 0
    
    for point_data in POINTS_TEST:
        point = {
            "id": str(uuid4()),
            "tenant_id": shefford['id'],
            "created_by_id": admin['id'],
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
            **point_data
        }
        
        await db.points_eau.insert_one(point)
        count_created += 1
        
        icon = "🔴" if point_data['type'] == 'borne_fontaine' else "🟠" if point_data['type'] == 'borne_seche' else "💧"
        print(f"  {icon} {point_data['numero_identification']} - {point_data['type']}")
    
    print(f"\n🎉 {count_created} points d'eau créés avec succès!")
    print("\n📍 Les icônes personnalisées seront visibles sur la carte:")
    print("   - Bornes fontaines: Icône rouge (borne d'incendie)")
    print("   - Bornes sèches: Icône orange (borne sèche)")
    print("   - Points d'eau statiques: Icône bleue (vagues)")
    print("="*60 + "\n")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(init_points_test())
