#!/usr/bin/env python3
"""
Vérification que toutes les compétences sont bien dans user.competences
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

async def verify_competences_migration():
    """Vérifier que toutes les compétences sont dans user.competences"""
    
    print("=" * 80)
    print("VÉRIFICATION MIGRATION COMPÉTENCES")
    print("=" * 80)
    
    # 1. Récupérer les compétences de référence
    competences_collection = await db.competences.find({}).to_list(None)
    competences_ids = {c['id'] for c in competences_collection}
    
    # 2. Vérifier les utilisateurs
    users = await db.users.find({}).to_list(None)
    
    problematic_users = []
    
    for user in users:
        formations = user.get('formations', [])
        competences = user.get('competences', [])
        
        # Chercher des compétences encore dans formations
        competences_in_formations = [f for f in formations if f in competences_ids]
        
        if competences_in_formations:
            problematic_users.append({
                'user': f"{user.get('prenom')} {user.get('nom')}",
                'email': user.get('email'),
                'competences_in_formations': competences_in_formations,
                'formations': formations,
                'competences': competences
            })
    
    if problematic_users:
        print(f"⚠️  {len(problematic_users)} utilisateur(s) ont encore des compétences dans 'formations':")
        for user_info in problematic_users[:5]:  # Montrer les 5 premiers
            print(f"\n  {user_info['user']} ({user_info['email']}):")
            print(f"    Compétences dans formations: {len(user_info['competences_in_formations'])}")
            print(f"    Total formations: {len(user_info['formations'])}")
            print(f"    Total compétences: {len(user_info['competences'])}")
    else:
        print("✅ Toutes les compétences sont correctement dans le champ 'competences'")
    
    # 3. Vérifier spécifiquement Sébastien Charest
    sebastien = await db.users.find_one({"email": "sebas.charest18@hotmail.com"})
    if sebastien:
        print(f"\n🔍 SÉBASTIEN CHAREST SPÉCIFIQUEMENT:")
        formations = sebastien.get('formations', [])
        competences = sebastien.get('competences', [])
        
        # Chercher TPI
        tpi_id = "8e4f0602-6da3-4fc8-aecc-4717bb45f06c"
        tpi_in_formations = tpi_id in formations
        tpi_in_competences = tpi_id in competences
        
        print(f"  Formations: {len(formations)} entrées")
        print(f"  Compétences: {len(competences)} entrées")
        print(f"  TPI dans formations: {'✓' if tpi_in_formations else '❌'}")
        print(f"  TPI dans compétences: {'✓' if tpi_in_competences else '❌'}")
        
        if tpi_in_formations and tpi_in_competences:
            print("  ⚠️  TPI est dans les DEUX champs - duplication!")
        elif tpi_in_competences:
            print("  ✅ TPI correctement dans compétences uniquement")
        else:
            print("  ❌ TPI manquant ou mal placé!")

if __name__ == "__main__":
    asyncio.run(verify_competences_migration())