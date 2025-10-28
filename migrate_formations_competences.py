#!/usr/bin/env python3
"""
Script de migration pour séparer les formations et compétences dans les profils utilisateurs
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

async def migrate_formations_competences():
    """Migre les données formations/compétences existantes"""
    
    print("=" * 80)
    print("MIGRATION: SÉPARATION FORMATIONS ET COMPÉTENCES")
    print("=" * 80)
    print()
    
    # 1. Récupérer toutes les formations et compétences pour identifier les UUIDs
    print("1. RÉCUPÉRATION DES RÉFÉRENCES...")
    
    formations_collection = await db.formations.find({}).to_list(None)
    competences_collection = await db.competences.find({}).to_list(None)
    
    formations_ids = {f['id'] for f in formations_collection}
    competences_ids = {c['id'] for c in competences_collection}
    
    print(f"   ✓ {len(formations_ids)} formations dans la collection 'formations'")
    print(f"   ✓ {len(competences_ids)} compétences dans la collection 'competences'")
    print()
    
    # 2. Traiter tous les utilisateurs
    print("2. MIGRATION DES UTILISATEURS...")
    
    users = await db.users.find({}).to_list(None)
    migrated_users = 0
    
    for user in users:
        user_id = user.get('id')
        current_formations = user.get('formations', [])
        
        if not current_formations:
            continue  # Pas de données à migrer
        
        # Séparer les UUIDs selon qu'ils sont dans formations ou competences
        real_formations = []
        real_competences = []
        
        for uuid_item in current_formations:
            if uuid_item in formations_ids:
                real_formations.append(uuid_item)
            elif uuid_item in competences_ids:
                real_competences.append(uuid_item)
            else:
                print(f"   ⚠️  UUID non reconnu pour {user.get('prenom')} {user.get('nom')}: {uuid_item}")
        
        # Mettre à jour l'utilisateur avec les champs séparés
        if real_formations or real_competences:
            update_doc = {
                "formations": real_formations,
                "competences": real_competences
            }
            
            await db.users.update_one(
                {"id": user_id},
                {"$set": update_doc}
            )
            
            migrated_users += 1
            print(f"   ✓ {user.get('prenom')} {user.get('nom')}: {len(real_formations)} formations, {len(real_competences)} compétences")
    
    print(f"\n   📊 {migrated_users} utilisateurs migrés")
    print()
    
    # 3. Vérification post-migration
    print("3. VÉRIFICATION POST-MIGRATION...")
    
    # Échantillonner quelques utilisateurs pour vérifier
    sample_users = await db.users.find({}).limit(5).to_list(None)
    
    for user in sample_users:
        formations = user.get('formations', [])
        competences = user.get('competences', [])
        
        print(f"   {user.get('prenom')} {user.get('nom')}:")
        print(f"     Formations: {len(formations)} ({formations[:2]}{'...' if len(formations) > 2 else ''})")
        print(f"     Compétences: {len(competences)} ({competences[:2]}{'...' if len(competences) > 2 else ''})")
    
    print()
    
    # 4. Résumé
    print("=" * 80)
    print("RÉSUMÉ DE LA MIGRATION")
    print("=" * 80)
    print(f"✓ Utilisateurs traités: {len(users)}")
    print(f"✓ Utilisateurs migrés: {migrated_users}")
    print(f"✓ Collections référence:")
    print(f"    - Formations: {len(formations_ids)}")
    print(f"    - Compétences: {len(competences_ids)}")
    print()
    print("⚠️  ACTIONS REQUISES APRÈS CETTE MIGRATION:")
    print("1. Modifier la logique d'auto-attribution pour utiliser 'user.competences' au lieu de 'user.formations'")
    print("2. Vérifier que les endpoints API gèrent les deux champs séparément")
    print("3. Mettre à jour le frontend pour distinguer formations et compétences")
    print()

if __name__ == "__main__":
    print("ATTENTION: Cette migration va modifier la structure des données utilisateur!")
    print("Assurez-vous d'avoir une sauvegarde avant de continuer.")
    response = input("\nContinuer la migration? (oui/non): ")
    
    if response.lower() in ['oui', 'o', 'yes', 'y']:
        asyncio.run(migrate_formations_competences())
    else:
        print("Migration annulée.")