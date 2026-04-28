"""
Script de seed pour les référentiels de violation
Insère des articles de loi NFPA et CNPI pour les tests
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from uuid import uuid4
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Récupérer l'URL MongoDB depuis les variables d'environnement
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')

# Articles de référence NFPA et CNPI
REFERENTIELS_EXEMPLE = [
    {
        "article": "NFPA 10 - 5.2.1",
        "titre": "Entretien des extincteurs",
        "description": "Les extincteurs portatifs doivent être inspectés mensuellement et entretenus annuellement par un technicien qualifié",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 72 - 10.4.3",
        "titre": "Test des alarmes incendie",
        "description": "Les systèmes d'alarme incendie doivent être testés annuellement conformément aux normes en vigueur",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 3.2.4.2",
        "titre": "Dégagement des sorties",
        "description": "Les sorties de secours et les voies d'évacuation doivent être dégagées en tout temps",
        "gravite": "Majeure",
        "delai_correction": 7,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 3.2.5.3",
        "titre": "Éclairage de secours",
        "description": "L'éclairage de secours doit être fonctionnel et testé mensuellement",
        "gravite": "Majeure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 25 - 5.2.1",
        "titre": "Inspection des gicleurs",
        "description": "Les gicleurs automatiques doivent être inspectés trimestriellement pour détecter les dommages ou obstructions",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 3.2.7.1",
        "titre": "Signalisation des sorties",
        "description": "Les panneaux de sortie doivent être illuminés et visibles en tout temps",
        "gravite": "Mineure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 101 - 7.10.8",
        "titre": "Portes coupe-feu",
        "description": "Les portes coupe-feu doivent être maintenues fermées ou équipées de dispositifs de fermeture automatique",
        "gravite": "Majeure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 10 - 4.1.1",
        "titre": "Emplacement des extincteurs",
        "description": "Les extincteurs doivent être facilement accessibles et visibles à une distance de 23 mètres maximum",
        "gravite": "Mineure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 3.3.1.4",
        "titre": "Plan d'évacuation",
        "description": "Un plan d'évacuation à jour doit être affiché à chaque étage et facilement accessible",
        "gravite": "Mineure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 96 - 11.4",
        "titre": "Nettoyage des hottes de cuisine",
        "description": "Les systèmes d'extraction des cuisines commerciales doivent être nettoyés selon la fréquence prescrite",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 13 - 8.17.1",
        "titre": "Accès aux vannes de gicleurs",
        "description": "Les vannes de contrôle des systèmes de gicleurs doivent être accessibles et identifiées",
        "gravite": "Majeure",
        "delai_correction": 7,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 2.2.2.5",
        "titre": "Résistance au feu des cloisons",
        "description": "Les cloisons coupe-feu doivent maintenir leur intégrité structurale sans pénétrations non protégées",
        "gravite": "Majeure",
        "delai_correction": 90,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 72 - 14.4.5",
        "titre": "Détecteurs de fumée",
        "description": "Les détecteurs de fumée doivent être testés annuellement et remplacés selon les recommandations du fabricant",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 3.2.3.1",
        "titre": "Largeur des corridors",
        "description": "Les corridors servant de voies d'évacuation doivent respecter la largeur minimale réglementaire",
        "gravite": "Mineure",
        "delai_correction": 180,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 1 - 10.11.2",
        "titre": "Entreposage de matières dangereuses",
        "description": "Les liquides inflammables et matières dangereuses doivent être entreposés dans des armoires conformes",
        "gravite": "Majeure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    }
]

async def seed_referentiels():
    """Seed les référentiels de violation dans la base de données"""
    
    # Connexion à MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db_instance = client[DB_NAME]
    
    print(f"📡 Connexion à MongoDB: {MONGO_URL[:50]}...")
    print(f"🗄️  Base de données: {DB_NAME}")
    
    # Récupérer tous les tenants
    tenants = await db_instance.tenants.find({}, {"_id": 0}).to_list(100)
    
    if not tenants:
        print("⚠️  Aucun tenant trouvé dans la base de données")
        return
    
    print(f"✅ {len(tenants)} tenant(s) trouvé(s)")
    
    for tenant in tenants:
        tenant_id = tenant.get("id")
        tenant_nom = tenant.get("nom", "Inconnu")
        
        print(f"\n🏢 Traitement du tenant: {tenant_nom} (ID: {tenant_id})")
        
        # Vérifier si le tenant a déjà des référentiels
        existing_count = await db_instance.referentiels_violation.count_documents({
            "tenant_id": tenant_id
        })
        
        if existing_count > 0:
            print(f"   ℹ️  Ce tenant a déjà {existing_count} référentiel(s). Passage au suivant.")
            continue
        
        # Insérer les référentiels
        referentiels_to_insert = []
        for ref_data in REFERENTIELS_EXEMPLE:
            referentiel = {
                "id": str(uuid4()),
                "tenant_id": tenant_id,
                **ref_data,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            referentiels_to_insert.append(referentiel)
        
        result = await db_instance.referentiels_violation.insert_many(referentiels_to_insert)
        print(f"   ✅ {len(result.inserted_ids)} référentiels insérés")
    
    print("\n🎉 Seed des référentiels de violation terminé!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_referentiels())
