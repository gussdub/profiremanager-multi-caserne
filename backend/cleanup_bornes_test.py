#!/usr/bin/env python3
"""
Script pour supprimer les bornes sèches de test du tenant Shefford
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('.env')

async def cleanup_test_bornes():
    """Supprimer les bornes de test"""
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client['profiremanager']
    
    print("\n" + "="*70)
    print("🗑️  NETTOYAGE DES BORNES SÈCHES DE TEST")
    print("="*70 + "\n")
    
    # Trouver le tenant Shefford
    tenant = await db.tenants.find_one({'slug': 'shefford'}, {'_id': 0})
    if not tenant:
        print("❌ Tenant Shefford non trouvé")
        client.close()
        return
    
    # Lister toutes les bornes sèches actuelles
    bornes = await db.points_eau.find(
        {'tenant_id': tenant['id'], 'type': 'borne_seche'},
        {'_id': 0, 'id': 1, 'numero_identification': 1, 'nom': 1}
    ).to_list(100)
    
    print(f"📊 Total de {len(bornes)} bornes sèches trouvées\n")
    
    # Identifier les bornes à garder (BS-001 à BS-021)
    official_numbers = [f'BS-{str(i).zfill(3)}' for i in range(1, 22)]
    
    to_delete = []
    to_keep = []
    
    for borne in bornes:
        if borne['numero_identification'] in official_numbers:
            to_keep.append(borne)
        else:
            to_delete.append(borne)
    
    print(f"✅ À garder: {len(to_keep)} bornes officielles (BS-001 à BS-021)")
    print(f"🗑️  À supprimer: {len(to_delete)} bornes de test\n")
    
    if to_delete:
        print("Bornes à supprimer:")
        for borne in to_delete:
            print(f"  - {borne['numero_identification']}: {borne['nom']}")
        
        # Confirmation
        print("\n⚠️  Ces bornes vont être supprimées définitivement.")
        
        # Supprimer
        for borne in to_delete:
            await db.points_eau.delete_one({'id': borne['id']})
            print(f"  ✓ Supprimée: {borne['numero_identification']}")
        
        print(f"\n✅ {len(to_delete)} bornes de test supprimées avec succès")
    else:
        print("✅ Aucune borne de test à supprimer")
    
    # Vérification finale
    final_count = await db.points_eau.count_documents({
        'tenant_id': tenant['id'],
        'type': 'borne_seche'
    })
    
    print("\n" + "="*70)
    print(f"✅ TERMINÉ ! {final_count} bornes sèches restantes")
    print("="*70 + "\n")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(cleanup_test_bornes())
