#!/usr/bin/env python3
"""
Script de réinitialisation de mot de passe DIRECT dans MongoDB Atlas
À exécuter localement pour réinitialiser un mot de passe en production
"""

import hashlib
import sys
from pymongo import MongoClient

# CONFIGURATION - REMPLACEZ PAR VOS VRAIES VALEURS
MONGODB_ATLAS_URL = "VOTRE_URL_MONGODB_ATLAS_ICI"  # Ex: mongodb+srv://user:password@cluster.mongodb.net/
DATABASE_NAME = "profiremanager"  # Nom de votre base de données

def reset_user_password(user_email: str, new_password: str):
    """Réinitialise le mot de passe d'un utilisateur directement dans MongoDB"""
    try:
        # Connexion à MongoDB Atlas
        client = MongoClient(MONGODB_ATLAS_URL)
        db = client[DATABASE_NAME]
        
        # Trouver l'utilisateur
        user = db.users.find_one({"email": user_email})
        
        if not user:
            print(f"❌ Utilisateur non trouvé: {user_email}")
            return False
        
        print(f"✅ Utilisateur trouvé: {user['prenom']} {user['nom']}")
        print(f"   ID: {user['id']}")
        print(f"   Email: {user['email']}")
        
        # Hasher le nouveau mot de passe avec SHA256 (simple et fiable)
        password_hash = hashlib.sha256(new_password.encode('utf-8')).hexdigest()
        
        # Mettre à jour dans la base
        result = db.users.update_one(
            {"id": user['id']},
            {"$set": {"mot_de_passe_hash": password_hash}}
        )
        
        if result.modified_count > 0:
            print(f"✅ Mot de passe réinitialisé avec succès pour {user_email}")
            print(f"   Nouveau mot de passe: {new_password}")
            print(f"   L'utilisateur peut maintenant se connecter sur www.profiremanager.ca")
            return True
        else:
            print(f"❌ Échec de la mise à jour du mot de passe")
            return False
            
    except Exception as e:
        print(f"❌ Erreur: {str(e)}")
        return False

if __name__ == "__main__":
    print("="*80)
    print("RÉINITIALISATION DE MOT DE PASSE - PRODUCTION")
    print("="*80)
    
    # Demander l'email et le nouveau mot de passe
    user_email = input("\n📧 Email de l'utilisateur: ")
    new_password = input("🔑 Nouveau mot de passe temporaire: ")
    
    confirm = input(f"\n⚠️  Confirmer la réinitialisation pour {user_email}? (oui/non): ")
    
    if confirm.lower() == "oui":
        reset_user_password(user_email, new_password)
    else:
        print("❌ Opération annulée")
    
    print("\n" + "="*80)
