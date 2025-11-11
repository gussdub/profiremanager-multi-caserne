#!/usr/bin/env python3
"""
Migration pour ajouter le champ accepte_gardes_externes aux utilisateurs existants
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

async def migrate_accepte_gardes_externes():
    """Migrer les utilisateurs existants avec le nouveau champ"""
    
    print("=" * 80)
    print("MIGRATION: CHAMP accepte_gardes_externes")
    print("=" * 80)
    print()
    
    # Récupérer tous les utilisateurs
    users = await db.users.find({}).to_list(None)
    
    print(f"📊 {len(users)} utilisateur(s) trouvé(s)")
    print()
    
    temps_plein_count = 0
    temps_partiel_count = 0
    updated_count = 0
    
    for user in users:
        user_id = user.get('id')
        nom_complet = f"{user.get('prenom', '')} {user.get('nom', '')}"
        type_emploi = user.get('type_emploi', 'temps_plein')
        
        # Vérifier si le champ existe déjà
        if 'accepte_gardes_externes' in user:
            print(f"  ⏭️  {nom_complet} ({type_emploi}): champ déjà présent ({user.get('accepte_gardes_externes')})")
            continue
        
        # Déterminer la valeur selon le type d'emploi
        if type_emploi == 'temps_partiel':
            accepte_gardes_externes = True
            temps_partiel_count += 1
            print(f"  ✅ {nom_complet} (temps_partiel): accepte_gardes_externes = True")
        else:
            accepte_gardes_externes = False
            temps_plein_count += 1
            print(f"  ❌ {nom_complet} (temps_plein): accepte_gardes_externes = False")
        
        # Mettre à jour l'utilisateur
        result = await db.users.update_one(
            {"id": user_id},
            {"$set": {"accepte_gardes_externes": accepte_gardes_externes}}
        )
        
        if result.modified_count > 0:
            updated_count += 1
    
    print()
    print("=" * 80)
    print("RÉSUMÉ DE LA MIGRATION")
    print("=" * 80)
    print(f"✅ Utilisateurs mis à jour: {updated_count}")
    print(f"  - Temps partiel (True):  {temps_partiel_count}")
    print(f"  - Temps plein (False):   {temps_plein_count}")
    print()
    print("COMPORTEMENTS ATTENDUS:")
    print("- Temps partiel: Doivent avoir disponibilités déclarées ET accepte_gardes_externes=True")
    print("- Temps plein: Ne seront plus assignés aux gardes externes automatiquement")
    print("- Nouveaux utilisateurs: accepte_gardes_externes=True par défaut")
    print()

if __name__ == "__main__":
    asyncio.run(migrate_accepte_gardes_externes())