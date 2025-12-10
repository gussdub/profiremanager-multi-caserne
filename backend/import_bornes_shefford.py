#!/usr/bin/env python3
"""
Script pour importer les bornes sèches de Shefford depuis un fichier JSON
À utiliser en production pour importer les données depuis le dev
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import glob
from dotenv import load_dotenv
from uuid import uuid4
from datetime import datetime, timezone

load_dotenv('.env')

async def import_bornes():
    """Importer les bornes sèches de Shefford"""
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client['profiremanager']
    
    print("\n" + "="*70)
    print("📥 IMPORT DES BORNES SÈCHES DE SHEFFORD")
    print("="*70 + "\n")
    
    # Chercher le fichier d'export le plus récent
    json_files = glob.glob('/app/backend/bornes_seches_shefford_*.json')
    if not json_files:
        print("❌ Aucun fichier d'export trouvé")
        print("   Assurez-vous d'avoir uploadé le fichier bornes_seches_shefford_*.json")
        client.close()
        return
    
    # Prendre le plus récent
    latest_file = max(json_files, key=os.path.getctime)
    print(f"📁 Fichier trouvé: {os.path.basename(latest_file)}\n")
    
    # Charger les données
    with open(latest_file, 'r', encoding='utf-8') as f:
        export_data = json.load(f)
    
    print(f"📊 {export_data['total_bornes']} bornes à importer")
    print(f"📅 Export du: {export_data['export_date']}\n")
    
    # Trouver le tenant Shefford en production
    tenant = await db.tenants.find_one({'slug': 'shefford'}, {'_id': 0})
    if not tenant:
        print("❌ Tenant Shefford non trouvé en production")
        print("   Créez d'abord le tenant Shefford")
        client.close()
        return
    
    print(f"✓ Tenant Shefford trouvé: {tenant['nom']}\n")
    
    # Importer chaque borne
    created_count = 0
    updated_count = 0
    skipped_count = 0
    
    for borne_data in export_data['bornes']:
        # Remplacer le tenant_id par celui de la production
        borne_data['tenant_id'] = tenant['id']
        
        # Vérifier si la borne existe déjà
        existing = await db.points_eau.find_one({
            'tenant_id': tenant['id'],
            'numero_identification': borne_data['numero_identification']
        })
        
        if existing:
            # Mettre à jour
            await db.points_eau.update_one(
                {'id': existing['id']},
                {'$set': {
                    **borne_data,
                    'id': existing['id'],  # Garder l'ID existant
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }}
            )
            print(f"  ↻ Mise à jour: {borne_data['numero_identification']}")
            updated_count += 1
        else:
            # Créer avec un nouvel ID
            borne_data['id'] = str(uuid4())
            borne_data['created_at'] = datetime.now(timezone.utc).isoformat()
            borne_data['updated_at'] = datetime.now(timezone.utc).isoformat()
            
            await db.points_eau.insert_one(borne_data)
            print(f"  ✓ Créée: {borne_data['numero_identification']}")
            created_count += 1
    
    print("\n" + "="*70)
    print("✅ IMPORT TERMINÉ !")
    print(f"   - {created_count} bornes créées")
    print(f"   - {updated_count} bornes mises à jour")
    print(f"   - Total: {export_data['total_bornes']} bornes")
    print("="*70 + "\n")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(import_bornes())
