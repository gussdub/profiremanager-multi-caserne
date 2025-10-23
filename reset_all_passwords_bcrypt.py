#!/usr/bin/env python3
"""
Script de réinitialisation de tous les mots de passe en bcrypt
UTILISATION: python reset_all_passwords_bcrypt.py

Ce script:
1. Génère un mot de passe temporaire unique pour chaque utilisateur
2. Hash le mot de passe avec bcrypt
3. Met à jour la base de données
4. Affiche la liste des nouveaux mots de passe temporaires

IMPORTANT: Sauvegardez la liste des mots de passe temporaires et communiquez-les aux utilisateurs!
"""

import asyncio
import bcrypt
import os
from motor.motor_asyncio import AsyncIOMotorClient
import secrets
import string

# Configuration MongoDB
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager')

def generate_temp_password(length=12):
    """Génère un mot de passe temporaire sécurisé"""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def hash_password_bcrypt(password: str) -> str:
    """Hash un mot de passe avec bcrypt"""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')

async def reset_all_passwords():
    """Réinitialise tous les mots de passe des utilisateurs"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        print("=" * 80)
        print("🔐 RÉINITIALISATION DE TOUS LES MOTS DE PASSE EN BCRYPT")
        print("=" * 80)
        print()
        
        # Récupérer tous les utilisateurs
        users = await db.users.find({}).to_list(length=None)
        
        if not users:
            print("❌ Aucun utilisateur trouvé dans la base de données")
            return
        
        print(f"📊 {len(users)} utilisateur(s) trouvé(s)")
        print()
        
        # Demander confirmation
        response = input("⚠️  Voulez-vous vraiment réinitialiser TOUS les mots de passe? (oui/non): ")
        if response.lower() != 'oui':
            print("❌ Opération annulée")
            return
        
        print()
        print("=" * 80)
        print("📋 NOUVEAUX MOTS DE PASSE TEMPORAIRES - SAUVEGARDEZ CETTE LISTE!")
        print("=" * 80)
        print()
        
        results = []
        success_count = 0
        error_count = 0
        
        for user in users:
            user_id = user.get('id')
            email = user.get('email', 'N/A')
            nom = user.get('nom', '')
            prenom = user.get('prenom', '')
            tenant_id = user.get('tenant_id', 'N/A')
            
            # Générer nouveau mot de passe temporaire
            temp_password = generate_temp_password()
            
            # Hasher avec bcrypt
            new_hash = hash_password_bcrypt(temp_password)
            
            try:
                # Mettre à jour dans la base de données
                result = await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"mot_de_passe_hash": new_hash}}
                )
                
                if result.modified_count > 0:
                    success_count += 1
                    status = "✅"
                else:
                    error_count += 1
                    status = "⚠️"
                
                # Sauvegarder pour affichage
                results.append({
                    'status': status,
                    'tenant_id': tenant_id,
                    'email': email,
                    'nom_complet': f"{prenom} {nom}".strip(),
                    'temp_password': temp_password
                })
                
            except Exception as e:
                error_count += 1
                results.append({
                    'status': "❌",
                    'tenant_id': tenant_id,
                    'email': email,
                    'nom_complet': f"{prenom} {nom}".strip(),
                    'temp_password': f"ERREUR: {str(e)}"
                })
        
        # Afficher les résultats
        for res in results:
            print(f"{res['status']} {res['email']:40} | Mot de passe: {res['temp_password']:20} | {res['nom_complet']}")
        
        print()
        print("=" * 80)
        print(f"✅ Réussis: {success_count}")
        print(f"❌ Erreurs: {error_count}")
        print(f"📊 Total: {len(users)}")
        print("=" * 80)
        print()
        print("⚠️  IMPORTANT:")
        print("1. Sauvegardez cette liste de mots de passe temporaires")
        print("2. Communiquez les mots de passe aux utilisateurs de manière sécurisée")
        print("3. Demandez-leur de changer leur mot de passe après la première connexion")
        print()
        
        # Sauvegarder dans un fichier
        with open('/app/passwords_temp_bcrypt.txt', 'w') as f:
            f.write("=" * 80 + "\n")
            f.write("MOTS DE PASSE TEMPORAIRES - CONFIDENTIEL\n")
            f.write("=" * 80 + "\n\n")
            for res in results:
                f.write(f"{res['email']:40} | {res['temp_password']:20} | {res['nom_complet']}\n")
        
        print("💾 Liste sauvegardée dans: /app/passwords_temp_bcrypt.txt")
        print()
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(reset_all_passwords())
