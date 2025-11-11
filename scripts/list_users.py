#!/usr/bin/env python3
"""Script pour lister tous les utilisateurs et leurs compétences"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def list_users():
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.firemanager_db
    
    print("=" * 80)
    print("LISTE DE TOUS LES UTILISATEURS")
    print("=" * 80)
    
    # Lister tous les users avec Charest
    users = await db.users.find({"nom": {"$regex": "Charest", "$options": "i"}}).to_list(10)
    
    if users:
        print(f"\nTrouvé {len(users)} utilisateur(s) avec 'Charest':")
        for u in users:
            print(f"\n- {u.get('prenom', 'N/A')} {u.get('nom', 'N/A')}")
            print(f"  ID: {u.get('id')}")
            print(f"  Email: {u.get('email')}")
            print(f"  Type emploi: {u.get('type_emploi')}")
            print(f"  Compétences: {u.get('competences', [])}")
    else:
        print("\nAucun utilisateur trouvé avec 'Charest'")
        print("\nListe de TOUS les utilisateurs:")
        all_users = await db.users.find({}).to_list(100)
        for u in all_users:
            print(f"- {u.get('prenom', 'N/A')} {u.get('nom', 'N/A')} - Compétences: {u.get('competences', [])}")
    
    print("\n" + "=" * 80)
    print("LISTE DES COMPÉTENCES")
    print("=" * 80)
    
    comps = await db.competences.find({}).to_list(100)
    for c in comps:
        print(f"- {c.get('nom')} (ID: {c.get('id')})")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(list_users())
