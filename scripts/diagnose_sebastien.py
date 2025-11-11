#!/usr/bin/env python3
"""
Script pour diagnostiquer le cas spécifique de Sébastien Charest et le rôle Préventionniste
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

async def diagnose():
    """Diagnostique le cas de Sébastien Charest"""
    
    print("=" * 80)
    print("DIAGNOSTIC - SÉBASTIEN CHAREST & PRÉVENTIONNISTE")
    print("=" * 80)
    print()
    
    # 1. Chercher Sébastien Charest
    print("1. RECHERCHE DE SÉBASTIEN CHAREST")
    print("-" * 80)
    
    # Chercher par nom
    sebastien_users = await db.users.find({
        "$or": [
            {"nom": {"$regex": "Charest", "$options": "i"}},
            {"prenom": {"$regex": "Sébastien", "$options": "i"}},
            {"prenom": {"$regex": "Sebastien", "$options": "i"}}
        ]
    }).to_list(None)
    
    if sebastien_users:
        print(f"✓ {len(sebastien_users)} utilisateur(s) trouvé(s):")
        for user in sebastien_users:
            print(f"\n  ID:           {user.get('id')}")
            print(f"  Nom complet:  {user.get('prenom')} {user.get('nom')}")
            print(f"  Email:        {user.get('email')}")
            print(f"  Grade:        {user.get('grade')}")
            print(f"  Tenant ID:    {user.get('tenant_id')}")
            print(f"  \n  Formations ({len(user.get('formations', []))}):")
            for formation in user.get('formations', []):
                print(f"    - {formation}")
            
            if 'competences' in user:
                print(f"  \n  Compétences ({len(user.get('competences', []))}):")
                for comp in user.get('competences', []):
                    print(f"    - {comp}")
            else:
                print(f"  \n  ⚠️  Champ 'competences': N'EXISTE PAS")
    else:
        print("❌ Aucun utilisateur 'Sébastien Charest' trouvé")
    
    print("\n")
    
    # 2. Chercher les types de garde "Préventionniste"
    print("2. TYPES DE GARDE 'PRÉVENTIONNISTE'")
    print("-" * 80)
    
    preventionniste_types = await db.types_garde.find({
        "nom": {"$regex": "Préventionniste", "$options": "i"}
    }).to_list(None)
    
    if preventionniste_types:
        print(f"✓ {len(preventionniste_types)} type(s) de garde trouvé(s):")
        for type_garde in preventionniste_types:
            print(f"\n  ID:                      {type_garde.get('id')}")
            print(f"  Nom:                     {type_garde.get('nom')}")
            print(f"  Tenant ID:               {type_garde.get('tenant_id')}")
            print(f"  Personnel requis:        {type_garde.get('personnel_requis', 0)}")
            print(f"  Est garde externe:       {type_garde.get('est_garde_externe', False)}")
            
            competences_req = type_garde.get('competences_requises', [])
            print(f"  \n  Compétences requises ({len(competences_req)}):")
            if competences_req:
                for comp in competences_req:
                    print(f"    - {comp}")
            else:
                print("    (Aucune compétence requise)")
    else:
        print("❌ Aucun type de garde 'Préventionniste' trouvé")
    
    print("\n")
    
    # 3. Vérifier tous les utilisateurs avec "TPI" dans leurs formations
    print("3. UTILISATEURS AVEC 'TPI' DANS LEURS FORMATIONS")
    print("-" * 80)
    
    users_with_tpi = await db.users.find({
        "formations": {"$regex": "TPI", "$options": "i"}
    }).to_list(None)
    
    if users_with_tpi:
        print(f"✓ {len(users_with_tpi)} utilisateur(s) avec TPI trouvé(s):")
        for user in users_with_tpi:
            print(f"\n  {user.get('prenom')} {user.get('nom')} ({user.get('email')})")
            print(f"    Formations: {user.get('formations', [])}")
    else:
        print("❌ Aucun utilisateur avec 'TPI' trouvé")
    
    print("\n")
    
    # 4. Lister toutes les formations distinctes dans le système
    print("4. TOUTES LES FORMATIONS DISTINCTES DANS LE SYSTÈME")
    print("-" * 80)
    
    all_formations = await db.users.distinct("formations")
    if all_formations:
        print(f"✓ {len(all_formations)} formation(s) distincte(s) trouvée(s):")
        for formation in sorted(all_formations):
            if formation:  # Ignorer les chaînes vides
                print(f"  - {formation}")
    else:
        print("❌ Aucune formation trouvée")
    
    print("\n")
    print("=" * 80)
    print("FIN DU DIAGNOSTIC")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(diagnose())
