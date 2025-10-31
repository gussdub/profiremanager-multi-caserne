#!/usr/bin/env python3
"""Migration: Déplacer les compétences de 'formations' vers 'competences' pour tous les users"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def migrate_competences():
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.profiremanager
    
    print("=" * 80)
    print("MIGRATION: formations → competences")
    print("=" * 80)
    
    # Récupérer tous les IDs de compétences (pas formations)
    competences = await db.competences.find({}).to_list(1000)
    competence_ids = {c['id'] for c in competences}
    print(f"\n📋 {len(competence_ids)} compétences trouvées dans la base")
    
    # Récupérer tous les users
    users = await db.users.find({}).to_list(1000)
    print(f"👥 {len(users)} utilisateurs à vérifier")
    
    users_to_fix = []
    
    for user in users:
        user_formations = user.get('formations', [])
        user_competences = user.get('competences', [])
        
        # Trouver les compétences qui sont dans 'formations' par erreur
        competences_in_formations = [f for f in user_formations if f in competence_ids]
        
        if competences_in_formations:
            users_to_fix.append({
                'user': user,
                'to_move': competences_in_formations,
                'current_competences': user_competences,
                'current_formations': user_formations
            })
    
    if not users_to_fix:
        print("\n✅ Aucune correction nécessaire! Tous les users sont corrects.")
        client.close()
        return
    
    print(f"\n⚠️  {len(users_to_fix)} utilisateur(s) à corriger:")
    for fix in users_to_fix:
        user = fix['user']
        print(f"\n   {user['prenom']} {user['nom']}:")
        print(f"      Compétences mal placées: {len(fix['to_move'])}")
        for comp_id in fix['to_move']:
            comp = next((c for c in competences if c['id'] == comp_id), None)
            if comp:
                print(f"         - {comp['nom']}")
    
    print("\n" + "=" * 80)
    print("Cette migration va:")
    print("1. Déplacer les compétences de 'formations' vers 'competences'")
    print("2. Laisser les vraies formations dans 'formations'")
    print("3. Éviter les doublons")
    print("=" * 80)
    print("\nAppuyez sur Entrée pour continuer ou Ctrl+C pour annuler...")
    input()
    
    # Appliquer les corrections
    for fix in users_to_fix:
        user = fix['user']
        
        # Créer les nouvelles listes
        new_competences = list(set(fix['current_competences'] + fix['to_move']))  # Ajouter + dédupliquer
        new_formations = [f for f in fix['current_formations'] if f not in competence_ids]  # Garder que les vraies formations
        
        # Mettre à jour dans la base
        result = await db.users.update_one(
            {"id": user['id']},
            {
                "$set": {
                    "competences": new_competences,
                    "formations": new_formations
                }
            }
        )
        
        if result.modified_count > 0:
            print(f"✅ {user['prenom']} {user['nom']}: migré")
            print(f"   competences: {len(fix['current_competences'])} → {len(new_competences)}")
            print(f"   formations: {len(fix['current_formations'])} → {len(new_formations)}")
    
    print(f"\n✅ Migration terminée! {len(users_to_fix)} utilisateur(s) corrigé(s)")
    print("\nVous pouvez maintenant relancer l'attribution automatique.")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(migrate_competences())
