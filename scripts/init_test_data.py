#!/usr/bin/env python3
"""
Script pour initialiser les données de test pour ProFireManager
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
from datetime import datetime

async def init_test_data():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client['profiremanager']
    
    # Créer un tenant de test
    tenant_id = str(uuid.uuid4())
    tenant_slug = "demo"
    
    tenant = {
        "id": tenant_id,
        "slug": tenant_slug,
        "nom": "Caserne Demo",
        "parametres": {
            "module_prevention_active": True
        },
        "created_at": datetime.utcnow().isoformat()
    }
    
    await db.tenants.delete_many({"slug": tenant_slug})
    await db.tenants.insert_one(tenant)
    print(f"✓ Tenant créé: {tenant_slug}")
    
    # Créer des utilisateurs de test
    users = [
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "email": "admin@demo.ca",
            "password": "$2b$10$YourHashedPasswordHere",  # password123
            "prenom": "Jean",
            "nom": "Dupont",
            "role": "admin",
            "grade": "Direct",
            "type_emploi": "temps_plein",
            "competences": ["TPI", "Sauveteur"],
            "accepte_gardes_externes": True,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "email": "gussdub@gmail.com",
            "password": "$2b$10$YourHashedPasswordHere",
            "prenom": "Guillaume",
            "nom": "Dubeau",
            "role": "admin",
            "grade": "Capitaine",
            "type_emploi": "temps_plein",
            "competences": ["TPI"],
            "accepte_gardes_externes": True,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "email": "felix_dozois@hotmail.com",
            "password": "$2b$10$YourHashedPasswordHere",
            "prenom": "Felix",
            "nom": "Dozois",
            "role": "admin",
            "grade": "Lieutenant",
            "type_emploi": "temps_plein",
            "competences": ["TPI"],
            "accepte_gardes_externes": False,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "email": "administrateur@demo.ca",
            "password": "$2b$10$YourHashedPasswordHere",
            "prenom": "Admin",
            "nom": "Test",
            "role": "admin",
            "grade": "Capitaine",
            "type_emploi": "temps_plein",
            "competences": [],
            "accepte_gardes_externes": True,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "email": "superviseur@demo.ca",
            "password": "$2b$10$YourHashedPasswordHere",
            "prenom": "Test",
            "nom": "Superviseur",
            "role": "superviseur",
            "grade": "Capitaine",
            "type_emploi": "temps_plein",
            "competences": [],
            "accepte_gardes_externes": True,
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    await db.users.delete_many({"tenant_slug": tenant_slug})
    await db.users.insert_many(users)
    print(f"✓ {len(users)} utilisateurs créés")
    
    # Créer quelques bâtiments de test
    batiments = [
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "nom_etablissement": "Bâtiment Municipal",
            "adresse_civique": "123 Rue Principale",
            "ville": "Montréal",
            "code_postal": "H1A 1A1",
            "groupe_occupation": "A",
            "preventionniste_assigne_id": None,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "tenant_slug": tenant_slug,
            "nom_etablissement": "Centre Commercial",
            "adresse_civique": "456 Avenue du Commerce",
            "ville": "Montréal",
            "code_postal": "H2B 2B2",
            "groupe_occupation": "B",
            "preventionniste_assigne_id": None,
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    await db.batiments.delete_many({"tenant_slug": tenant_slug})
    await db.batiments.insert_many(batiments)
    print(f"✓ {len(batiments)} bâtiments créés")
    
    client.close()
    print("\n✓ Données de test initialisées avec succès!")
    print(f"Tenant: {tenant_slug}")
    print(f"URL: http://localhost:3000/{tenant_slug}")

if __name__ == "__main__":
    asyncio.run(init_test_data())
