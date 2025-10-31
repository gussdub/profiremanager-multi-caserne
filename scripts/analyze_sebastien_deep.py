#!/usr/bin/env python3
"""
Script pour analyser en profondeur pourquoi Sébastien Charest n'est pas assigné au Préventionniste
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timedelta

# Charger les variables d'environnement
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Connexion MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'profiremanager')
db = client[db_name]

TARGET_COMPETENCE_ID = "8e4f0602-6da3-4fc8-aecc-4717bb45f06c"  # TPI

async def deep_analyze():
    """Analyse approfondie"""
    
    print("=" * 80)
    print("ANALYSE APPROFONDIE - SÉBASTIEN CHAREST & PRÉVENTIONNISTE")
    print("=" * 80)
    print()
    
    # 1. Récupérer Sébastien Charest
    sebastien = await db.users.find_one({"email": "sebas.charest18@hotmail.com"})
    
    if not sebastien:
        print("❌ Sébastien Charest non trouvé!")
        return
    
    print("✓ INFORMATIONS SUR SÉBASTIEN CHAREST")
    print("-" * 80)
    print(f"  ID:                 {sebastien.get('id')}")
    print(f"  Nom complet:        {sebastien.get('prenom')} {sebastien.get('nom')}")
    print(f"  Email:              {sebastien.get('email')}")
    print(f"  Statut:             {sebastien.get('statut')}")  # Doit être "Actif"
    print(f"  Type emploi:        {sebastien.get('type_emploi')}")  # Doit être "temps_partiel" pour auto-attribution
    print(f"  Grade:              {sebastien.get('grade')}")
    print(f"  Heures max/semaine: {sebastien.get('heures_max_semaine', 40)}")
    print(f"  Fonction supérieur: {sebastien.get('fonction_superieur', False)}")
    print()
    
    # Vérifier la compétence TPI
    has_tpi = TARGET_COMPETENCE_ID in sebastien.get('competences', [])
    print(f"  A la compétence TPI ({TARGET_COMPETENCE_ID}): {'✓ OUI' if has_tpi else '❌ NON'}")
    print()
    
    if not has_tpi:
        print("⚠️  PROBLÈME: Sébastien n'a pas TPI dans ses compétences!")
        print(f"    Compétences actuelles: {sebastien.get('competences', [])}")
        print(f"    Formations actuelles: {sebastien.get('formations', [])}")
        print()
    
    # 2. Vérifier si temp_partiel (requis pour auto-attribution)
    if sebastien.get('type_emploi') != 'temps_partiel':
        print("⚠️  PROBLÈME: Sébastien n'est pas temps_partiel!")
        print("    L'auto-attribution ne fonctionne que pour les employés temps_partiel")
        print()
    
    # 3. Vérifier si actif
    if sebastien.get('statut') != 'Actif':
        print("⚠️  PROBLÈME: Sébastien n'est pas Actif!")
        print()
    
    # 4. Vérifier les disponibilités déclarées pour Préventionniste
    print("✓ DISPONIBILITÉS DÉCLARÉES")
    print("-" * 80)
    
    # Récupérer les types de garde Préventionniste
    preventionniste_types = await db.types_garde.find({
        "nom": {"$regex": "Préventionniste", "$options": "i"}
    }).to_list(None)
    
    if preventionniste_types:
        for tg in preventionniste_types:
            print(f"\n  Type de garde: {tg['nom']} (ID: {tg['id']})")
            
            # Chercher les disponibilités pour ce type de garde (derniers 30 jours)
            date_debut = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            date_fin = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
            
            dispos = await db.disponibilites.find({
                "user_id": sebastien['id'],
                "type_garde_id": tg['id'],
                "statut": "disponible",
                "date": {
                    "$gte": date_debut,
                    "$lte": date_fin
                }
            }).to_list(1000)
            
            if dispos:
                print(f"    ✓ {len(dispos)} disponibilité(s) trouvée(s) (30 derniers/prochains jours)")
                for dispo in dispos[:5]:  # Montrer les 5 premières
                    print(f"      - Date: {dispo.get('date')}")
            else:
                print(f"    ❌ AUCUNE disponibilité déclarée pour ce type de garde!")
                print(f"       C'est probablement LA RAISON pour laquelle Sébastien n'est pas assigné")
                print(f"       Les employés temps_partiel DOIVENT déclarer leurs disponibilités")
    
    print("\n")
    
    # 5. Vérifier les assignations actuelles
    print("✓ ASSIGNATIONS ACTUELLES")
    print("-" * 80)
    
    # Compter les heures ce mois
    month_start = datetime.now().replace(day=1).strftime("%Y-%m-%d")
    next_month = (datetime.now().replace(day=1) + timedelta(days=32)).replace(day=1)
    month_end = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")
    
    assignations = await db.assignations.find({
        "user_id": sebastien['id'],
        "date": {
            "$gte": month_start,
            "$lte": month_end
        }
    }).to_list(1000)
    
    if assignations:
        print(f"  ✓ {len(assignations)} assignation(s) ce mois")
        
        # Calculer les heures
        types_garde = await db.types_garde.find({"tenant_id": sebastien['tenant_id']}).to_list(1000)
        types_map = {t['id']: t for t in types_garde}
        
        total_heures_internes = 0
        total_heures_externes = 0
        
        for assignation in assignations:
            tg = types_map.get(assignation['type_garde_id'])
            if tg:
                duree = tg.get('duree_heures', 0)
                if tg.get('est_garde_externe', False):
                    total_heures_externes += duree
                else:
                    total_heures_internes += duree
        
        print(f"  Total heures internes ce mois: {total_heures_internes}h")
        print(f"  Total heures externes ce mois: {total_heures_externes}h")
    else:
        print("  ❌ Aucune assignation ce mois")
    
    print("\n")
    
    # 6. Résumé des problèmes potentiels
    print("=" * 80)
    print("DIAGNOSTIC - RÉSUMÉ")
    print("=" * 80)
    
    problems = []
    
    if sebastien.get('statut') != 'Actif':
        problems.append("❌ Statut n'est pas 'Actif'")
    else:
        print("✓ Statut est 'Actif'")
    
    if sebastien.get('type_emploi') != 'temps_partiel':
        problems.append("❌ Type emploi n'est pas 'temps_partiel'")
    else:
        print("✓ Type emploi est 'temps_partiel'")
    
    if not has_tpi:
        problems.append("❌ N'a pas la compétence TPI")
    else:
        print("✓ A la compétence TPI")
    
    # Vérifier les dispos pour tous les types Préventionniste
    has_any_dispo = False
    for tg in preventionniste_types:
        date_debut = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        date_fin = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        dispos = await db.disponibilites.find({
            "user_id": sebastien['id'],
            "type_garde_id": tg['id'],
            "statut": "disponible",
            "date": {
                "$gte": date_debut,
                "$lte": date_fin
            }
        }).to_list(10)
        
        if dispos:
            has_any_dispo = True
            break
    
    if not has_any_dispo:
        problems.append("❌ AUCUNE disponibilité déclarée pour les gardes Préventionniste")
        print("❌ AUCUNE disponibilité déclarée pour les gardes Préventionniste")
    else:
        print("✓ A des disponibilités déclarées")
    
    print()
    
    if problems:
        print("PROBLÈMES IDENTIFIÉS:")
        for problem in problems:
            print(f"  {problem}")
    else:
        print("✓ Tous les critères sont remplis - Sébastien devrait être assigné!")
    
    print()
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(deep_analyze())
