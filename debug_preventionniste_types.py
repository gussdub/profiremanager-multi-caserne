#!/usr/bin/env python3
"""
Vérification détaillée des types de garde Préventionniste dans la BD
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

# Charger les variables d'environnement
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Connexion MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db_name = os.environ.get('DB_NAME', 'profiremanager')
db = client[db_name]

def calculate_duration_hours(heure_debut, heure_fin):
    """Calculer la durée en heures entre deux heures"""
    try:
        debut = datetime.strptime(heure_debut, "%H:%M")
        fin = datetime.strptime(heure_fin, "%H:%M")
        
        # Gérer le cas où la fin est le lendemain (ex: 22:00 -> 06:00)
        if fin < debut:
            fin = fin.replace(day=debut.day + 1)
        
        duration = fin - debut
        return duration.total_seconds() / 3600  # Convertir en heures
    except Exception as e:
        return 0

async def debug_preventionniste_types():
    """Debug détaillé des types Préventionniste"""
    
    print("=" * 80)
    print("DEBUG TYPES GARDE PRÉVENTIONNISTE")
    print("=" * 80)
    
    # Récupérer les types Préventionniste
    preventionniste_types = await db.types_garde.find({
        "nom": {"$regex": "Préventionniste", "$options": "i"}
    }).to_list(None)
    
    for i, tg in enumerate(preventionniste_types, 1):
        print(f"\n{i}. {tg.get('nom', 'N/A')}")
        print(f"   ID: {tg.get('id')}")
        print(f"   Heure début: {tg.get('heure_debut', 'N/A')}")
        print(f"   Heure fin: {tg.get('heure_fin', 'N/A')}")
        print(f"   Durée stockée: {tg.get('duree_heures', 'N/A')}h")
        
        # Calculer la durée réelle
        if tg.get('heure_debut') and tg.get('heure_fin'):
            calculated_duration = calculate_duration_hours(tg.get('heure_debut'), tg.get('heure_fin'))
            print(f"   Durée calculée: {calculated_duration}h")
            
            if tg.get('duree_heures') != calculated_duration:
                print(f"   ⚠️  INCOHÉRENCE DÉTECTÉE! Stockée: {tg.get('duree_heures')}h vs Calculée: {calculated_duration}h")
        
        print(f"   Est garde externe: {tg.get('est_garde_externe', False)}")
        print(f"   Personnel requis: {tg.get('personnel_requis', 1)}")
        print(f"   Jours application: {tg.get('jours_application', [])}")
        print(f"   Compétences requises: {tg.get('competences_requises', [])}")
        
        # Vérifier si TPI est requis
        tpi_id = "8e4f0602-6da3-4fc8-aecc-4717bb45f06c"
        if tpi_id in tg.get('competences_requises', []):
            print(f"   ✅ TPI requis")
        else:
            print(f"   ❌ TPI non requis")
    
    # Calculer le total si Sébastien était assigné aux deux
    total_calculated_duration = 0
    total_stored_duration = 0
    
    for tg in preventionniste_types:
        if not tg.get('est_garde_externe', False):  # Seulement les internes
            if tg.get('heure_debut') and tg.get('heure_fin'):
                calculated = calculate_duration_hours(tg.get('heure_debut'), tg.get('heure_fin'))
                total_calculated_duration += calculated
            
            stored = tg.get('duree_heures', 0)
            total_stored_duration += stored
    
    print(f"\n{'='*80}")
    print(f"RÉSUMÉ POUR SÉBASTIEN CHAREST:")
    print(f"  Limite heures internes: 18h")
    print(f"  Heures internes actuelles: 12h") 
    print(f"  Espace disponible: 6h")
    print(f"  Total durée CALCULÉE Préventionniste: {total_calculated_duration}h")
    print(f"  Total durée STOCKÉE Préventionniste: {total_stored_duration}h")
    print(f"  Peut être assigné (calculé): {'✅ OUI' if 6 >= total_calculated_duration else '❌ NON'}")
    print(f"  Peut être assigné (stocké): {'✅ OUI' if 6 >= total_stored_duration else '❌ NON'}")
    
    if total_calculated_duration != total_stored_duration:
        print(f"\n⚠️  PROBLÈME: Incohérence entre durées calculées et stockées!")
        print(f"     Le système utilise les durées STOCKÉES qui sont incorrectes!")
    
    print(f"\n{'='*80}")

if __name__ == "__main__":
    asyncio.run(debug_preventionniste_types())