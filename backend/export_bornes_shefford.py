#!/usr/bin/env python3
"""
Script pour exporter les bornes sèches de Shefford vers un fichier JSON
À utiliser pour transférer les données vers la production
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
from dotenv import load_dotenv
from datetime import datetime

load_dotenv('.env')

async def export_bornes():
    """Exporter les bornes sèches de Shefford"""
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client['profiremanager']
    
    print("\n" + "="*70)
    print("📦 EXPORT DES BORNES SÈCHES DE SHEFFORD")
    print("="*70 + "\n")
    
    # Trouver le tenant Shefford
    tenant = await db.tenants.find_one({'slug': 'shefford'}, {'_id': 0})
    if not tenant:
        print("❌ Tenant Shefford non trouvé")
        client.close()
        return
    
    # Récupérer toutes les bornes sèches
    bornes = await db.points_eau.find(
        {'tenant_id': tenant['id'], 'type': 'borne_seche'},
        {'_id': 0}  # Exclure le _id MongoDB
    ).to_list(100)
    
    if not bornes:
        print("⚠️  Aucune borne sèche trouvée")
        client.close()
        return
    
    # Préparer les données d'export
    export_data = {
        'tenant_slug': 'shefford',
        'export_date': datetime.utcnow().isoformat(),
        'total_bornes': len(bornes),
        'bornes': bornes
    }
    
    # Sauvegarder dans un fichier JSON
    filename = f'bornes_seches_shefford_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
    filepath = f'/app/backend/{filename}'
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(export_data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ {len(bornes)} bornes sèches exportées")
    print(f"📁 Fichier créé: {filename}")
    print("\n📋 Résumé:")
    for borne in bornes[:5]:
        print(f"  - {borne['numero_identification']}: {borne['nom']}")
    if len(bornes) > 5:
        print(f"  ... et {len(bornes) - 5} autres")
    
    print("\n" + "="*70)
    print("💡 INSTRUCTIONS POUR IMPORTER EN PRODUCTION:")
    print("="*70)
    print("1. Téléchargez le fichier:", filename)
    print("2. Uploadez-le sur votre serveur de production")
    print("3. Exécutez: python3 import_bornes_shefford.py")
    print("="*70 + "\n")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(export_bornes())
