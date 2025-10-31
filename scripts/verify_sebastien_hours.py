#!/usr/bin/env python3
"""
Vérification des heures internes vs externes pour Sébastien Charest
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

async def verify_sebastien_hours():
    """Vérifier les heures internes de Sébastien cette semaine"""
    
    print("=" * 80)
    print("VÉRIFICATION HEURES INTERNES - SÉBASTIEN CHAREST")
    print("=" * 80)
    
    # 1. Récupérer Sébastien
    sebastien = await db.users.find_one({"email": "sebas.charest18@hotmail.com"})
    
    # 2. Récupérer les types de garde Préventionniste
    preventionniste_types = await db.types_garde.find({
        "nom": {"$regex": "Préventionniste", "$options": "i"}
    }).to_list(None)
    
    print("TYPES DE GARDE PRÉVENTIONNISTE:")
    for tg in preventionniste_types:
        print(f"  {tg['nom']}: {tg.get('duree_heures', 'N/A')}h, externe: {tg.get('est_garde_externe', False)}")
    
    # 3. Calculer semaine actuelle (lundi à dimanche)
    today = datetime.now()
    days_since_monday = today.weekday()
    monday = today - timedelta(days=days_since_monday)
    sunday = monday + timedelta(days=6)
    
    semaine_debut = monday.strftime("%Y-%m-%d")
    semaine_fin = sunday.strftime("%Y-%m-%d")
    
    print(f"\nSEMAINE ACTUELLE: {semaine_debut} à {semaine_fin}")
    
    # 4. Récupérer les assignations de Sébastien cette semaine
    assignations_semaine = await db.assignations.find({
        "user_id": sebastien['id'],
        "date": {
            "$gte": semaine_debut,
            "$lte": semaine_fin
        }
    }).to_list(None)
    
    # 5. Récupérer tous les types de garde
    types_garde = await db.types_garde.find({"tenant_id": sebastien['tenant_id']}).to_list(None)
    types_map = {t['id']: t for t in types_garde}
    
    print(f"\nASSIGNATIONS CETTE SEMAINE: {len(assignations_semaine)}")
    
    heures_internes_semaine = 0
    heures_externes_semaine = 0
    
    for assignation in assignations_semaine:
        tg = types_map.get(assignation['type_garde_id'])
        if tg:
            duree = tg.get('duree_heures', 0)
            if tg.get('est_garde_externe', False):
                heures_externes_semaine += duree
                print(f"  {assignation['date']}: {tg['nom']} - {duree}h EXTERNE")
            else:
                heures_internes_semaine += duree
                print(f"  {assignation['date']}: {tg['nom']} - {duree}h INTERNE")
    
    print(f"\n📊 RÉSUMÉ HEURES CETTE SEMAINE:")
    print(f"  Heures INTERNES: {heures_internes_semaine}h")
    print(f"  Heures EXTERNES: {heures_externes_semaine}h")
    print(f"  Limite Sébastien (internes seulement): {sebastien.get('heures_max_semaine', 40)}h")
    
    espace_disponible = sebastien.get('heures_max_semaine', 40) - heures_internes_semaine
    print(f"  Espace disponible pour heures internes: {espace_disponible}h")
    
    # 6. Vérifier si Préventionniste pourrait être assigné
    print(f"\n🔍 VÉRIFICATION PRÉVENTIONNISTE:")
    total_heures_preventionniste = sum(tg.get('duree_heures', 0) for tg in preventionniste_types if not tg.get('est_garde_externe', False))
    print(f"  Total heures Préventionniste (internes): {total_heures_preventionniste}h")
    print(f"  Peut être assigné: {'✅ OUI' if espace_disponible >= total_heures_preventionniste else '❌ NON'}")
    
    print(f"\n{'=' * 80}")

if __name__ == "__main__":
    asyncio.run(verify_sebastien_hours())