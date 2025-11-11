#!/usr/bin/env python3
"""
Script de diagnostic pour un utilisateur spécifique
Vérifie le hash, teste le mot de passe, etc.
"""

import asyncio
import bcrypt
import os
from motor.motor_asyncio import AsyncIOMotorClient

# Configuration MongoDB
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager')

async def diagnose_user(email: str, password_to_test: str):
    """Diagnostic complet pour un utilisateur"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        print("=" * 80)
        print(f"🔍 DIAGNOSTIC POUR: {email}")
        print("=" * 80)
        print()
        
        # Trouver l'utilisateur
        users = await db.users.find({"email": email}).to_list(length=None)
        
        if not users:
            print(f"❌ Aucun utilisateur trouvé avec l'email: {email}")
            return
        
        if len(users) > 1:
            print(f"⚠️  ATTENTION: {len(users)} utilisateurs trouvés avec cet email!")
            print()
        
        for idx, user in enumerate(users, 1):
            print(f"--- Utilisateur #{idx} ---")
            print(f"ID: {user.get('id', 'N/A')}")
            print(f"Email: {user.get('email', 'N/A')}")
            print(f"Nom: {user.get('prenom', '')} {user.get('nom', '')}")
            print(f"Tenant ID: {user.get('tenant_id', 'N/A')}")
            print(f"Role: {user.get('role', 'N/A')}")
            
            # Vérifier le hash
            hash_value = user.get('mot_de_passe_hash', '')
            print(f"\nHash stocké: {hash_value[:50]}..." if len(hash_value) > 50 else f"\nHash stocké: {hash_value}")
            
            if not hash_value:
                print("❌ PROBLÈME: Aucun hash de mot de passe!")
                continue
            
            # Vérifier le type de hash
            if hash_value.startswith('$2'):
                print("✅ Type: bcrypt (correct)")
            else:
                print(f"❌ Type: Autre ({hash_value[:10]}...) - DEVRAIT ÊTRE bcrypt!")
                continue
            
            # Tester le mot de passe
            print(f"\n🔐 Test du mot de passe: {password_to_test}")
            try:
                password_bytes = password_to_test.encode('utf-8')
                hash_bytes = hash_value.encode('utf-8')
                result = bcrypt.checkpw(password_bytes, hash_bytes)
                
                if result:
                    print("✅ SUCCÈS: Le mot de passe correspond!")
                else:
                    print("❌ ÉCHEC: Le mot de passe ne correspond PAS")
                    print("\n💡 Possibilités:")
                    print("   1. Mauvais mot de passe temporaire utilisé")
                    print("   2. Hash corrompu dans la base de données")
                    print("   3. Problème d'encodage")
                
            except Exception as e:
                print(f"❌ ERREUR lors de la vérification: {e}")
            
            print()
        
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
    finally:
        client.close()

if __name__ == "__main__":
    # Utilisez comme: python diagnose_user.py
    email = input("Email de l'utilisateur: ")
    password = input("Mot de passe à tester: ")
    asyncio.run(diagnose_user(email, password))
