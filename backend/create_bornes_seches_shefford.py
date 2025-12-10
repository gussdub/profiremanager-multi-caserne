#!/usr/bin/env python3
"""
Script pour créer les 21 bornes sèches pour le tenant Shefford
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from uuid import uuid4
from datetime import datetime, timezone

load_dotenv('.env')

# Données des 21 bornes sèches extraites des Google Forms
BORNES_SECHES_DATA = [
    {
        "numero": "BS-001",
        "nom": "11 Allard",
        "adresse": "11 chemin Allard",
        "transversale": "Route 243",
        "ville": "Shefford",
        "latitude": 45.3778,  # Coordonnées à ajuster
        "longitude": -72.6839,
        "itineraire_url": "https://maps.app.goo.gl/rAPMXVr1jMRy8jLp7",
        "photo_url": "https://lh7-rt.googleusercontent.com/formsz/AN7BsVAHWluQmVrvIOJhzjCLqIKUY55QmKBIeeNm8PUxqX7nK4t_B6raVxQ7f1aXCfrUD24x0gLOVBSk0pzkPwe5D0gXlvHI7SGalklOaDa_GfSrbcz4rkdwvjWLWv7K5RWCGqRn8hkOW6WIQFHGWnAp14M099-f4RmdkAwd1EWfauNdNARKKd22T8Fkdow1kFbOGJ62w3HXIv7BGwrz=w740",
        "notes": "Allumer vos gyrophares. La barrière est toujours débarrée."
    },
    # Les 20 autres bornes avec données minimales (à compléter par admin via l'interface)
    {"numero": "BS-002", "nom": "Borne sèche 2", "ville": "Shefford", "latitude": 45.378, "longitude": -72.684},
    {"numero": "BS-003", "nom": "Borne sèche 3", "ville": "Shefford", "latitude": 45.379, "longitude": -72.685},
    {"numero": "BS-004", "nom": "Borne sèche 4", "ville": "Shefford", "latitude": 45.380, "longitude": -72.686},
    {"numero": "BS-005", "nom": "Borne sèche 5", "ville": "Shefford", "latitude": 45.381, "longitude": -72.687},
    {"numero": "BS-006", "nom": "Borne sèche 6", "ville": "Shefford", "latitude": 45.382, "longitude": -72.688},
    {"numero": "BS-007", "nom": "Borne sèche 7", "ville": "Shefford", "latitude": 45.383, "longitude": -72.689},
    {"numero": "BS-008", "nom": "Borne sèche 8", "ville": "Shefford", "latitude": 45.384, "longitude": -72.690},
    {"numero": "BS-009", "nom": "Borne sèche 9", "ville": "Shefford", "latitude": 45.385, "longitude": -72.691},
    {"numero": "BS-010", "nom": "Borne sèche 10", "ville": "Shefford", "latitude": 45.386, "longitude": -72.692},
    {"numero": "BS-011", "nom": "Borne sèche 11", "ville": "Shefford", "latitude": 45.387, "longitude": -72.693},
    {"numero": "BS-012", "nom": "Borne sèche 12", "ville": "Shefford", "latitude": 45.388, "longitude": -72.694},
    {"numero": "BS-013", "nom": "Borne sèche 13", "ville": "Shefford", "latitude": 45.389, "longitude": -72.695},
    {"numero": "BS-014", "nom": "Borne sèche 14", "ville": "Shefford", "latitude": 45.390, "longitude": -72.696},
    {"numero": "BS-015", "nom": "Borne sèche 15", "ville": "Shefford", "latitude": 45.391, "longitude": -72.697},
    {"numero": "BS-016", "nom": "Borne sèche 16", "ville": "Shefford", "latitude": 45.392, "longitude": -72.698},
    {"numero": "BS-017", "nom": "Borne sèche 17", "ville": "Shefford", "latitude": 45.393, "longitude": -72.699},
    {"numero": "BS-018", "nom": "Borne sèche 18", "ville": "Shefford", "latitude": 45.394, "longitude": -72.700},
    {"numero": "BS-019", "nom": "Borne sèche 19", "ville": "Shefford", "latitude": 45.395, "longitude": -72.701},
    {"numero": "BS-020", "nom": "Borne sèche 20", "ville": "Shefford", "latitude": 45.396, "longitude": -72.702},
    {"numero": "BS-021", "nom": "Borne sèche 21", "ville": "Shefford", "latitude": 45.397, "longitude": -72.703},
]

async def create_bornes_seches():
    """Créer les 21 bornes sèches pour Shefford"""
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client['profiremanager']
    
    print("\n" + "="*70)
    print("🔥 CRÉATION DES 21 BORNES SÈCHES POUR SHEFFORD")
    print("="*70 + "\n")
    
    # Trouver le tenant Shefford
    tenant = await db.tenants.find_one({'slug': 'shefford'}, {'_id': 0})
    if not tenant:
        print("❌ Tenant Shefford non trouvé")
        client.close()
        return
    
    print(f"✓ Tenant trouvé: {tenant['nom']} (ID: {tenant['id']})\n")
    
    created_count = 0
    updated_count = 0
    
    # Créer ou mettre à jour chaque borne
    for borne_data in BORNES_SECHES_DATA:
        # Vérifier si la borne existe déjà
        existing = await db.points_eau.find_one({
            'tenant_id': tenant['id'],
            'numero_identification': borne_data['numero']
        }, {'_id': 0})
        
        if existing:
            print(f"⚠️  {borne_data['numero']} - {borne_data['nom']} existe déjà, mise à jour...")
            await db.points_eau.update_one(
                {'id': existing['id']},
                {'$set': {
                    'nom': borne_data['nom'],
                    'adresse': borne_data.get('adresse'),
                    'transversale': borne_data.get('transversale'),
                    'latitude': borne_data['latitude'],
                    'longitude': borne_data['longitude'],
                    'itineraire_url': borne_data.get('itineraire_url'),
                    'photo_url': borne_data.get('photo_url'),
                    'notes': borne_data.get('notes', ''),
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }}
            )
            updated_count += 1
        else:
            # Créer la nouvelle borne
            borne = {
                'id': str(uuid4()),
                'tenant_id': tenant['id'],
                'type': 'borne_seche',
                'numero_identification': borne_data['numero'],
                'nom': borne_data['nom'],
                'adresse': borne_data.get('adresse', ''),
                'ville': borne_data['ville'],
                'latitude': borne_data['latitude'],
                'longitude': borne_data['longitude'],
                'transversale': borne_data.get('transversale'),
                'itineraire_url': borne_data.get('itineraire_url'),
                'photo_url': borne_data.get('photo_url'),
                'notes': borne_data.get('notes', ''),
                'etat': 'fonctionnelle',
                'statut_inspection': None,
                'derniere_inspection_date': None,
                'created_at': datetime.now(timezone.utc).isoformat(),
                'updated_at': datetime.now(timezone.utc).isoformat()
            }
            
            await db.points_eau.insert_one(borne)
            print(f"✓ {borne_data['numero']} - {borne_data['nom']} créée")
            created_count += 1
    
    print("\n" + "="*70)
    print(f"✅ TERMINÉ !")
    print(f"   - {created_count} bornes créées")
    print(f"   - {updated_count} bornes mises à jour")
    print(f"   - Total: {len(BORNES_SECHES_DATA)} bornes")
    print("="*70)
    print("\n📝 Note: Les bornes 2-21 ont des données minimales.")
    print("   Les admins peuvent les compléter via l'onglet 'Carte des Points d'Eau'\n")
    
    client.close()

if __name__ == '__main__':
    asyncio.run(create_bornes_seches())
