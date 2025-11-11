#!/usr/bin/env python3
"""Script de diagnostic pour vérifier les compétences TPI de Sébastien Charest"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def check_competences():
    # Connexion MongoDB
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.firemanager_db
    
    print("=" * 80)
    print("DIAGNOSTIC DES COMPÉTENCES TPI")
    print("=" * 80)
    
    # 1. Trouver Sébastien Charest
    print("\n1. Recherche de Sébastien Charest...")
    sebastien = await db.users.find_one({
        "prenom": "Sébastien",
        "nom": "Charest"
    })
    
    if sebastien:
        print(f"   ✅ Trouvé: {sebastien['prenom']} {sebastien['nom']}")
        print(f"   - ID: {sebastien.get('id')}")
        print(f"   - Type emploi: {sebastien.get('type_emploi')}")
        print(f"   - Compétences: {sebastien.get('competences', [])}")
        sebastien_id = sebastien.get('id')
    else:
        print("   ❌ Sébastien Charest non trouvé dans la base!")
        return
    
    # 2. Trouver la compétence TPI
    print("\n2. Recherche de la compétence TPI...")
    tpi_comp = await db.competences.find_one({"nom": "TPI"})
    
    if tpi_comp:
        print(f"   ✅ Trouvée: {tpi_comp['nom']}")
        print(f"   - ID: {tpi_comp.get('id')}")
        print(f"   - Description: {tpi_comp.get('description', 'N/A')}")
        tpi_id = tpi_comp.get('id')
    else:
        print("   ❌ Compétence TPI non trouvée!")
        return
    
    # 3. Vérifier si Sébastien a TPI
    print("\n3. Vérification: Sébastien a-t-il TPI ?")
    has_tpi = tpi_id in sebastien.get('competences', [])
    if has_tpi:
        print(f"   ✅ OUI - TPI ({tpi_id}) est dans ses compétences")
    else:
        print(f"   ❌ NON - TPI ({tpi_id}) N'EST PAS dans ses compétences")
        print(f"   Compétences actuelles: {sebastien.get('competences', [])}")
    
    # 4. Trouver la garde Préventionniste
    print("\n4. Recherche de la garde Préventionniste...")
    gardes_prev = await db.types_garde.find({
        "nom": {"$regex": "Préventionniste", "$options": "i"}
    }).to_list(10)
    
    if gardes_prev:
        for garde in gardes_prev:
            print(f"   ✅ Trouvée: {garde['nom']}")
            print(f"   - ID: {garde.get('id')}")
            print(f"   - Personnel requis: {garde.get('personnel_requis', 1)}")
            print(f"   - Compétences requises: {garde.get('competences_requises', [])}")
            
            # Vérifier si TPI est requis
            if tpi_id in garde.get('competences_requises', []):
                print(f"   ✅ TPI est bien requis pour cette garde")
            else:
                print(f"   ❌ TPI n'est PAS requis pour cette garde")
    else:
        print("   ❌ Aucune garde Préventionniste trouvée!")
    
    # 5. Vérifier les assignations existantes de Sébastien
    print("\n5. Assignations actuelles de Sébastien Charest...")
    assignations = await db.assignations.find({
        "user_id": sebastien_id,
        "date": {"$gte": "2025-11-04", "$lte": "2025-11-10"}
    }).to_list(100)
    
    if assignations:
        print(f"   Trouvées: {len(assignations)} assignation(s)")
        for assign in assignations:
            type_garde = await db.types_garde.find_one({"id": assign.get('type_garde_id')})
            print(f"   - Date: {assign.get('date')}")
            print(f"     Type: {type_garde.get('nom') if type_garde else 'Inconnu'}")
            print(f"     Assignation: {assign.get('assignation_type', 'N/A')}")
    else:
        print("   Aucune assignation trouvée pour cette semaine")
    
    # 6. Compter combien d'users ont TPI
    print("\n6. Nombre d'employés avec compétence TPI...")
    users_with_tpi = await db.users.count_documents({
        "competences": tpi_id
    })
    print(f"   Total: {users_with_tpi} employé(s)")
    
    if users_with_tpi == 0:
        print("   ⚠️ PROBLÈME: Aucun employé n'a TPI dans ses compétences!")
        print("   La compétence doit être assignée à Sébastien dans son profil")
    elif users_with_tpi == 1:
        print("   ✅ Parfait: 1 seul employé (devrait être Sébastien)")
    else:
        users = await db.users.find({"competences": tpi_id}).to_list(10)
        print(f"   Employés avec TPI:")
        for u in users:
            print(f"   - {u.get('prenom')} {u.get('nom')}")
    
    print("\n" + "=" * 80)
    print("FIN DU DIAGNOSTIC")
    print("=" * 80)
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_competences())
