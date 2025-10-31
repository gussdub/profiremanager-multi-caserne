#!/usr/bin/env python3
"""Diagnostic complet : Pourquoi Sébastien n'est pas assigné à Préventionniste ?"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

async def diagnose_preventionniste():
    MONGO_URL = os.environ.get('MONGO_URL')
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.profiremanager
    
    print("=" * 80)
    print("DIAGNOSTIC: Sébastien Charest & Préventionniste")
    print("=" * 80)
    
    # 1. Trouver Sébastien
    sebastien = await db.users.find_one({
        "$or": [
            {"nom": {"$regex": "Charest", "$options": "i"}},
            {"nom": {"$regex": "Sebastien", "$options": "i"}}
        ]
    })
    
    if not sebastien:
        print("\n❌ Sébastien Charest NOT FOUND dans users!")
        # Lister tous les users
        all_users = await db.users.find({}).to_list(100)
        print(f"\nUtilisateurs dans la base ({len(all_users)}):")
        for u in all_users[:10]:
            print(f"  - {u.get('prenom', 'N/A')} {u.get('nom', 'N/A')}")
        client.close()
        return
    
    print(f"\n✅ Trouvé: {sebastien['prenom']} {sebastien['nom']}")
    print(f"   ID: {sebastien.get('id')}")
    print(f"   Email: {sebastien.get('email')}")
    print(f"   Type emploi: {sebastien.get('type_emploi')}")
    print(f"   Formations: {sebastien.get('formations', [])}")
    print(f"   Compétences: {sebastien.get('competences', [])}")
    
    # 2. Trouver la compétence TPI
    tpi = await db.competences.find_one({"nom": {"$regex": "TPI", "$options": "i"}})
    if not tpi:
        print("\n❌ Compétence TPI NOT FOUND!")
        # Lister toutes les compétences
        all_comp = await db.competences.find({}).to_list(100)
        print(f"\nCompétences disponibles ({len(all_comp)}):")
        for c in all_comp:
            print(f"  - {c.get('nom')} (ID: {c.get('id')})")
    else:
        print(f"\n✅ Compétence TPI trouvée:")
        print(f"   ID: {tpi.get('id')}")
        print(f"   Nom: {tpi.get('nom')}")
        tpi_id = tpi.get('id')
        
        # Vérifier si Sébastien a TPI
        has_tpi_competence = tpi_id in sebastien.get('competences', [])
        has_tpi_formation = tpi_id in sebastien.get('formations', [])
        
        print(f"\n🔍 Sébastien a TPI dans 'competences': {has_tpi_competence}")
        print(f"🔍 Sébastien a TPI dans 'formations': {has_tpi_formation}")
    
    # 3. Trouver la garde Préventionniste
    prev_gardes = await db.types_garde.find({
        "nom": {"$regex": "Prévent", "$options": "i"}
    }).to_list(10)
    
    if not prev_gardes:
        print("\n❌ Aucune garde Préventionniste trouvée!")
        # Lister toutes les gardes
        all_gardes = await db.types_garde.find({}).to_list(100)
        print(f"\nTypes de garde disponibles ({len(all_gardes)}):")
        for g in all_gardes[:20]:
            print(f"  - {g.get('nom')} (ID: {g.get('id')})")
    else:
        print(f"\n✅ Garde(s) Préventionniste trouvée(s):")
        for garde in prev_gardes:
            print(f"\n   Nom: {garde.get('nom')}")
            print(f"   ID: {garde.get('id')}")
            print(f"   Personnel requis: {garde.get('personnel_requis')}")
            print(f"   Compétences requises: {garde.get('competences_requises', [])}")
            print(f"   Formations requises: {garde.get('formations_requises', [])}")
            
            if tpi:
                tpi_id = tpi.get('id')
                requires_tpi_comp = tpi_id in garde.get('competences_requises', [])
                requires_tpi_form = tpi_id in garde.get('formations_requises', [])
                print(f"   🔍 Requiert TPI (competences): {requires_tpi_comp}")
                print(f"   🔍 Requiert TPI (formations): {requires_tpi_form}")
            
            # Vérifier assignations existantes
            assignations = await db.assignations.find({
                "type_garde_id": garde.get('id'),
                "date": {"$gte": "2025-11-01"}
            }).to_list(100)
            
            print(f"   📊 Assignations existantes: {len(assignations)}")
            if assignations:
                for a in assignations[:5]:
                    user = await db.users.find_one({"id": a.get('user_id')})
                    user_name = f"{user.get('prenom')} {user.get('nom')}" if user else "Inconnu"
                    print(f"      - {user_name} le {a.get('date')} ({a.get('assignation_type')})")
    
    print("\n" + "=" * 80)
    client.close()

if __name__ == "__main__":
    asyncio.run(diagnose_preventionniste())
