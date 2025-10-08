#!/usr/bin/env python3
"""
Script d'initialisation des données de démonstration pour ProFireManager Multi-Tenant
"""

import asyncio
import sys
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime
import uuid

# Configuration
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DATABASE_NAME = "profiremanager"

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

async def init_data():
    """Initialiser toutes les données de démonstration"""
    
    print("🔧 Connexion à MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DATABASE_NAME]
    
    print("📋 Vérification des données existantes...")
    
    # 1. Créer le Super-Admin
    super_admin_exists = await db.super_admins.find_one({"email": "gussdub@icloud.com"})
    
    if not super_admin_exists:
        super_admin = {
            "id": str(uuid.uuid4()),
            "email": "gussdub@icloud.com",
            "nom": "Super Admin",
            "mot_de_passe_hash": get_password_hash("230685Juin+"),
            "created_at": datetime.utcnow().isoformat()
        }
        await db.super_admins.insert_one(super_admin)
        print(f"✅ Super admin créé: {super_admin['email']}")
    else:
        print(f"ℹ️  Super admin existe déjà: {super_admin_exists['email']}")
    
    # 2. Créer le tenant Shefford
    shefford_exists = await db.tenants.find_one({"slug": "shefford"})
    
    if not shefford_exists:
        shefford_id = str(uuid.uuid4())
        shefford_tenant = {
            "id": shefford_id,
            "slug": "shefford",
            "nom": "Service Incendie de Shefford",
            "ville": "Shefford",
            "province": "QC",
            "contact_email": "contact@shefford.ca",
            "contact_telephone": "(450) 555-1234",
            "is_active": True,
            "created_at": datetime.utcnow().isoformat()
        }
        await db.tenants.insert_one(shefford_tenant)
        print(f"✅ Tenant Shefford créé: {shefford_id}")
    else:
        shefford_id = shefford_exists["id"]
        print(f"ℹ️  Tenant Shefford existe déjà: {shefford_id}")
    
    # 3. Créer les utilisateurs de test pour Shefford
    users_to_create = [
        {
            "email": "admin@firemanager.ca",
            "mot_de_passe": "admin123",
            "nom": "Admin",
            "prenom": "Système",
            "role": "admin",
            "grade": "Directeur",
            "type_emploi": "temps_plein"
        },
        {
            "email": "superviseur@firemanager.ca",
            "mot_de_passe": "superviseur123",
            "nom": "Dupont",
            "prenom": "Jean",
            "role": "superviseur",
            "grade": "Capitaine",
            "type_emploi": "temps_plein"
        },
        {
            "email": "employe@firemanager.ca",
            "mot_de_passe": "employe123",
            "nom": "Martin",
            "prenom": "Pierre",
            "role": "employe",
            "grade": "Pompier",
            "type_emploi": "temps_partiel"
        }
    ]
    
    for user_data in users_to_create:
        user_exists = await db.users.find_one({"email": user_data["email"]})
        
        if not user_exists:
            user = {
                "id": str(uuid.uuid4()),
                "tenant_id": shefford_id,
                "email": user_data["email"],
                "mot_de_passe_hash": get_password_hash(user_data["mot_de_passe"]),
                "nom": user_data["nom"],
                "prenom": user_data["prenom"],
                "role": user_data["role"],
                "grade": user_data["grade"],
                "type_emploi": user_data["type_emploi"],
                "telephone": "",
                "contact_urgence": "",
                "numero_employe": f"POM{str(uuid.uuid4())[:5]}",
                "date_embauche": datetime.utcnow().isoformat().split('T')[0],
                "formations": [],
                "statut": "actif",
                "fonction_superieur": False,
                "created_at": datetime.utcnow().isoformat()
            }
            await db.users.insert_one(user)
            print(f"✅ Utilisateur créé: {user['email']} (role: {user['role']})")
        else:
            # Mettre à jour le mot de passe si l'utilisateur existe
            await db.users.update_one(
                {"email": user_data["email"]},
                {"$set": {
                    "mot_de_passe_hash": get_password_hash(user_data["mot_de_passe"]),
                    "tenant_id": shefford_id  # S'assurer que le tenant_id est correct
                }}
            )
            print(f"ℹ️  Utilisateur existe déjà (mot de passe mis à jour): {user_data['email']}")
    
    # 4. Migrer toutes les données existantes vers Shefford
    print("\n🔄 Migration des données existantes vers Shefford...")
    collections_to_migrate = [
        "types_garde", "assignations", "demandes_remplacement",
        "formations", "disponibilites", "sessions_formation", 
        "inscriptions_formation", "demandes_conge", "notifications",
        "notifications_remplacement", "employee_epis", "parametres_remplacements"
    ]
    
    for collection_name in collections_to_migrate:
        collection = db[collection_name]
        result = await collection.update_many(
            {"tenant_id": {"$exists": False}},
            {"$set": {"tenant_id": shefford_id}}
        )
        if result.modified_count > 0:
            print(f"✅ {result.modified_count} documents migrés dans {collection_name}")
    
    print("\n🎉 Initialisation terminée avec succès!")
    print("\n" + "="*60)
    print("📋 COMPTES DISPONIBLES:")
    print("="*60)
    print("\n🔧 SUPER-ADMIN:")
    print("   Email: gussdub@icloud.com")
    print("   Mot de passe: 230685Juin+")
    print("   Accès: Page d'accueil (sera redirigé vers dashboard super-admin)")
    print("\n🏢 CASERNE SHEFFORD (/shefford):")
    print("\n   👤 Admin:")
    print("      Email: admin@firemanager.ca")
    print("      Mot de passe: admin123")
    print("\n   👤 Superviseur:")
    print("      Email: superviseur@firemanager.ca")
    print("      Mot de passe: superviseur123")
    print("\n   👤 Employé:")
    print("      Email: employe@firemanager.ca")
    print("      Mot de passe: employe123")
    print("\n" + "="*60)
    print("\n💡 IMPORTANT:")
    print("   - Pour tester la caserne Shefford, accédez à: /shefford")
    print("   - Pour le super-admin, connectez-vous directement")
    print("="*60 + "\n")
    
    client.close()

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 ProFireManager - Initialisation des données de test")
    print("="*60 + "\n")
    
    try:
        asyncio.run(init_data())
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
