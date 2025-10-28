#!/usr/bin/env python3
"""
Script pour identifier ce qu'est la formation/compétence 8e4f0602-6da3-4fc8-aecc-4717bb45f06c
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

TARGET_ID = "8e4f0602-6da3-4fc8-aecc-4717bb45f06c"

async def identify():
    """Identifie ce qu'est cet UUID"""
    
    print("=" * 80)
    print(f"IDENTIFICATION DE: {TARGET_ID}")
    print("=" * 80)
    print()
    
    # Chercher dans la collection 'formations'
    print("1. RECHERCHE DANS LA COLLECTION 'formations'")
    print("-" * 80)
    formation = await db.formations.find_one({"id": TARGET_ID})
    if formation:
        print("✓ TROUVÉ dans 'formations':")
        print(f"  ID:                {formation.get('id')}")
        print(f"  Nom:               {formation.get('nom')}")
        print(f"  Description:       {formation.get('description', 'N/A')}")
        print(f"  Type:              {formation.get('type', 'N/A')}")
        print(f"  Heures requises:   {formation.get('heures_requises', 'N/A')}")
        print(f"  Tenant ID:         {formation.get('tenant_id')}")
    else:
        print("❌ NON trouvé dans 'formations'")
    
    print("\n")
    
    # Chercher dans la collection 'competences'
    print("2. RECHERCHE DANS LA COLLECTION 'competences'")
    print("-" * 80)
    competence = await db.competences.find_one({"id": TARGET_ID})
    if competence:
        print("✓ TROUVÉ dans 'competences':")
        print(f"  ID:                           {competence.get('id')}")
        print(f"  Nom:                          {competence.get('nom')}")
        print(f"  Description:                  {competence.get('description', 'N/A')}")
        print(f"  Heures requises annuelles:    {competence.get('heures_requises_annuelles', 'N/A')}")
        print(f"  Obligatoire:                  {competence.get('obligatoire', 'N/A')}")
        print(f"  Tenant ID:                    {competence.get('tenant_id')}")
    else:
        print("❌ NON trouvé dans 'competences'")
    
    print("\n")
    
    # Lister TOUTES les compétences pour référence
    print("3. LISTE DE TOUTES LES COMPÉTENCES DU SYSTÈME")
    print("-" * 80)
    all_competences = await db.competences.find({}).to_list(None)
    if all_competences:
        print(f"✓ {len(all_competences)} compétence(s) trouvée(s):")
        for comp in all_competences:
            marker = "👉" if comp.get('id') == TARGET_ID else "  "
            print(f"{marker} {comp.get('nom'):30s} (ID: {comp.get('id')})")
    else:
        print("❌ Aucune compétence trouvée")
    
    print("\n")
    
    # Lister TOUTES les formations pour référence
    print("4. LISTE DE TOUTES LES FORMATIONS DU SYSTÈME")
    print("-" * 80)
    all_formations = await db.formations.find({}).to_list(None)
    if all_formations:
        print(f"✓ {len(all_formations)} formation(s) trouvée(s):")
        for form in all_formations:
            marker = "👉" if form.get('id') == TARGET_ID else "  "
            print(f"{marker} {form.get('nom'):30s} (ID: {form.get('id')})")
    else:
        print("❌ Aucune formation trouvée")
    
    print("\n")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(identify())
