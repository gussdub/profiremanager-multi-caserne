#!/usr/bin/env python3
"""
Script de diagnostic pour identifier les utilisateurs ayant des compétences mal placées.
Vérifie si des compétences (TPI, classe 4a, pompier 1, premiers répondants, etc.)
sont stockées dans le champ 'formations' au lieu du champ 'competences'.
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

# Liste des compétences connues (examens, certifications) qui ne devraient PAS être dans 'formations'
# Ajoutez d'autres compétences si nécessaire
COMPETENCES_CONNUES = [
    "TPI",  # Technicien en Prévention Incendie
    "classe 4a",
    "classe 4A",
    "Classe 4a",
    "Classe 4A",
    "pompier 1",
    "Pompier 1",
    "Pompier I",
    "pompier I",
    "premiers répondants",
    "Premiers Répondants",
    "premiers repondants",
    "Premiers repondants",
    "PR",  # Abréviation pour premiers répondants
    "RCR",  # Réanimation CardioRespiratoire
    "DEA",  # Défibrillateur Externe Automatisé
    "SIMDUT",
    "Travail en hauteur",
    "travail en hauteur",
]

async def diagnose_users():
    """Diagnostique tous les utilisateurs et identifie ceux avec des compétences mal placées"""
    
    print("=" * 80)
    print("DIAGNOSTIC DES UTILISATEURS - COMPÉTENCES MAL PLACÉES")
    print("=" * 80)
    print()
    
    # Récupérer tous les utilisateurs
    users = await db.users.find({}).to_list(None)
    
    print(f"📊 Total d'utilisateurs trouvés: {len(users)}")
    print()
    
    # Compteurs
    users_with_issues = []
    total_misplaced = 0
    
    for user in users:
        user_id = user.get('id')
        nom = user.get('nom', 'N/A')
        prenom = user.get('prenom', 'N/A')
        email = user.get('email', 'N/A')
        formations = user.get('formations', [])
        competences_field = user.get('competences', [])  # Vérifier si le champ existe
        
        # Vérifier les formations pour des compétences mal placées
        misplaced_competences = []
        for formation in formations:
            # Chercher des correspondances partielles (case insensitive)
            for competence in COMPETENCES_CONNUES:
                if competence.lower() in formation.lower():
                    misplaced_competences.append(formation)
                    break
        
        if misplaced_competences:
            users_with_issues.append({
                'user_id': user_id,
                'nom': nom,
                'prenom': prenom,
                'email': email,
                'misplaced': misplaced_competences,
                'formations': formations,
                'has_competences_field': 'competences' in user,
                'competences': competences_field
            })
            total_misplaced += len(misplaced_competences)
    
    # Afficher les résultats
    if users_with_issues:
        print(f"⚠️  {len(users_with_issues)} utilisateur(s) avec des compétences mal placées trouvé(s):")
        print()
        
        for idx, user_info in enumerate(users_with_issues, 1):
            print(f"{'=' * 80}")
            print(f"Utilisateur #{idx}")
            print(f"{'=' * 80}")
            print(f"  ID:      {user_info['user_id']}")
            print(f"  Nom:     {user_info['prenom']} {user_info['nom']}")
            print(f"  Email:   {user_info['email']}")
            print(f"  Champ 'competences' existe: {'OUI' if user_info['has_competences_field'] else 'NON'}")
            
            if user_info['has_competences_field']:
                print(f"  Compétences actuelles: {user_info['competences']}")
            
            print(f"  \n  ❌ Compétences MAL PLACÉES dans 'formations':")
            for comp in user_info['misplaced']:
                print(f"     - {comp}")
            
            print(f"  \n  📋 Toutes les formations actuelles:")
            for form in user_info['formations']:
                is_misplaced = form in user_info['misplaced']
                marker = "❌" if is_misplaced else "✓"
                print(f"     {marker} {form}")
            print()
        
        print(f"{'=' * 80}")
        print(f"📊 RÉSUMÉ")
        print(f"{'=' * 80}")
        print(f"  Utilisateurs affectés:           {len(users_with_issues)}")
        print(f"  Total de compétences mal placées: {total_misplaced}")
        print()
        
    else:
        print("✅ Aucun utilisateur avec des compétences mal placées trouvé!")
        print()
    
    # Vérifier si le modèle User a un champ 'competences'
    print(f"{'=' * 80}")
    print("VÉRIFICATION DU MODÈLE")
    print(f"{'=' * 80}")
    
    # Échantillonner quelques utilisateurs pour voir la structure
    sample_users = users[:3] if users else []
    for user in sample_users:
        has_competences = 'competences' in user
        print(f"  Utilisateur: {user.get('prenom')} {user.get('nom')}")
        print(f"    - Champ 'formations': {len(user.get('formations', []))} entrées")
        print(f"    - Champ 'competences': {'EXISTE' if has_competences else 'N\'EXISTE PAS'}")
        if has_competences:
            print(f"      Contenu: {user.get('competences', [])}")
        print()
    
    print(f"{'=' * 80}")
    print("RECOMMANDATIONS")
    print(f"{'=' * 80}")
    
    if users_with_issues:
        print("1. Le modèle User doit avoir un champ 'competences' séparé de 'formations'")
        print("2. Créer un script de migration pour déplacer les compétences identifiées")
        print("3. Mettre à jour le backend pour utiliser le champ 'competences' dans les vérifications")
    else:
        print("✅ Aucune action requise - données correctes")
    
    print()

if __name__ == "__main__":
    asyncio.run(diagnose_users())
