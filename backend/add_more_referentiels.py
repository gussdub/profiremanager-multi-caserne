"""
Script pour ajouter des articles de violation supplémentaires
Couvre plus de mots-clés courants
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from uuid import uuid4
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

load_dotenv()
MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')

# Articles supplémentaires couvrant plus de mots-clés
NOUVEAUX_REFERENTIELS = [
    # Détecteurs de fumée
    {
        "article": "NFPA 72 - 29.5.1",
        "titre": "Détecteurs de fumée photoélectriques",
        "description": "Les détecteurs de fumée doivent être installés dans chaque chambre à coucher et à l'extérieur de chaque zone de sommeil",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "CNBC 3.2.4.19",
        "titre": "Avertisseurs de fumée résidentiels",
        "description": "Des avertisseurs de fumée fonctionnels doivent être installés conformément aux exigences du code du bâtiment",
        "gravite": "Majeure",
        "delai_correction": 7,
        "frequence_utilisation": 0
    },
    # Escaliers et garde-corps
    {
        "article": "CNPI 3.4.6.3",
        "titre": "Escaliers de sortie",
        "description": "Les escaliers de sortie doivent être maintenus en bon état et libres de tout encombrement",
        "gravite": "Majeure",
        "delai_correction": 7,
        "frequence_utilisation": 0
    },
    {
        "article": "CNBC 9.8.8.2",
        "titre": "Garde-corps et mains courantes",
        "description": "Les garde-corps et mains courantes doivent être solidement fixés et en bon état",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Ventilation et fumée
    {
        "article": "CNPI 3.2.5.11",
        "titre": "Désenfumage des corridors",
        "description": "Les systèmes de désenfumage doivent être fonctionnels et testés régulièrement",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 92 - 4.2",
        "titre": "Évacuation de la fumée",
        "description": "Les systèmes d'évacuation de fumée doivent être maintenus en bon état de fonctionnement",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    # Éclairage
    {
        "article": "CNPI 3.2.7.3",
        "titre": "Éclairage des corridors",
        "description": "Les corridors servant d'issue doivent être éclairés en tout temps",
        "gravite": "Mineure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    {
        "article": "CNBC 3.2.7.2",
        "titre": "Luminaires d'urgence",
        "description": "Les luminaires d'urgence doivent fournir un éclairage d'au moins 10 lux",
        "gravite": "Majeure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    # Systèmes de chauffage
    {
        "article": "NFPA 211 - 3.1",
        "titre": "Cheminées et foyers",
        "description": "Les cheminées doivent être ramonées annuellement et inspectées pour détecter les fissures",
        "gravite": "Majeure",
        "delai_correction": 90,
        "frequence_utilisation": 0
    },
    {
        "article": "CNPI 2.6.3.1",
        "titre": "Appareils de chauffage",
        "description": "Les appareils de chauffage doivent respecter les dégagements requis des matériaux combustibles",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Entreposage
    {
        "article": "NFPA 1 - 10.11.1",
        "titre": "Entreposage de matériaux combustibles",
        "description": "Les matériaux combustibles doivent être entreposés de manière ordonnée et à distance des sources de chaleur",
        "gravite": "Mineure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 30 - 4.3.2",
        "titre": "Liquides inflammables - Entreposage",
        "description": "Les liquides inflammables doivent être entreposés dans des armoires conformes ou des locaux désignés",
        "gravite": "Majeure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    # Électricité
    {
        "article": "CE 2.24.1",
        "titre": "Installation électrique défectueuse",
        "description": "Les installations électriques défectueuses ou non conformes doivent être corrigées",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    {
        "article": "CE 4.8.14.5",
        "titre": "Panneaux électriques accessibles",
        "description": "Les panneaux électriques doivent être accessibles et dégagés en tout temps",
        "gravite": "Mineure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    # Chaufferie / Salle mécanique
    {
        "article": "CNBC 3.6.2.1",
        "titre": "Séparation coupe-feu - Chaufferie",
        "description": "La chaufferie doit être séparée du reste du bâtiment par un degré de résistance au feu approprié",
        "gravite": "Majeure",
        "delai_correction": 90,
        "frequence_utilisation": 0
    },
    {
        "article": "NFPA 54 - 7.3.1",
        "titre": "Ventilation des salles mécaniques",
        "description": "Les salles contenant des appareils à combustion doivent être adéquatement ventilées",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Ascenseurs
    {
        "article": "CNBC 3.2.6.1",
        "titre": "Ascenseurs et monte-charge",
        "description": "Les ascenseurs doivent être inspectés et entretenus conformément aux exigences réglementaires",
        "gravite": "Mineure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    # Stationnement intérieur
    {
        "article": "CNBC 3.3.1.8",
        "titre": "Stationnement souterrain - Fumée",
        "description": "Les stationnements intérieurs doivent être équipés de systèmes de ventilation fonctionnels",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    # Réservoirs / Cuves
    {
        "article": "NFPA 30 - 22.11.1",
        "titre": "Réservoirs de mazout",
        "description": "Les réservoirs de mazout doivent être inspectés et maintenus en bon état",
        "gravite": "Majeure",
        "delai_correction": 60,
        "frequence_utilisation": 0
    },
    # Génératrice
    {
        "article": "NFPA 110 - 8.3.2",
        "titre": "Génératrice d'urgence",
        "description": "Les génératrices d'urgence doivent être testées mensuellement sous charge",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Cloisons coupe-feu
    {
        "article": "CNBC 3.1.8.1",
        "titre": "Séparation coupe-feu compromise",
        "description": "Les séparations coupe-feu ne doivent pas être compromises par des pénétrations non protégées",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Stockage vertical
    {
        "article": "NFPA 230 - 4.5",
        "titre": "Hauteur d'entreposage",
        "description": "La hauteur d'entreposage doit respecter les dégagements minimaux par rapport au système de gicleurs",
        "gravite": "Mineure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Robinets d'incendie
    {
        "article": "CNPI 2.7.1.5",
        "titre": "Robinets d'incendie accessibles",
        "description": "Les robinets d'incendie armés (RIA) doivent être accessibles et dégagés",
        "gravite": "Majeure",
        "delai_correction": 7,
        "frequence_utilisation": 0
    },
    # Circuits électriques
    {
        "article": "CE 12-3034",
        "titre": "Surcharge des circuits",
        "description": "Les circuits électriques ne doivent pas être surchargés par des multiprises en série",
        "gravite": "Mineure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    # Plans d'urgence
    {
        "article": "CNPI 2.8.2.1",
        "titre": "Plan de mesures d'urgence",
        "description": "Un plan de mesures d'urgence à jour doit être disponible et affiché",
        "gravite": "Mineure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Portes de sortie
    {
        "article": "CNPI 3.4.6.16",
        "titre": "Portes de sortie verrouillées",
        "description": "Les portes de sortie ne doivent pas être verrouillées empêchant l'évacuation",
        "gravite": "Majeure",
        "delai_correction": 1,
        "frequence_utilisation": 0
    },
    # Gaz naturel / Propane
    {
        "article": "NFPA 58 - 5.2.4",
        "titre": "Réservoirs de propane",
        "description": "Les réservoirs de propane doivent respecter les dégagements minimaux et être sécurisés",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Matières dangereuses
    {
        "article": "SIMDUT 2015",
        "titre": "Fiches signalétiques disponibles",
        "description": "Les fiches signalétiques (FDS) doivent être disponibles pour tous les produits dangereux",
        "gravite": "Mineure",
        "delai_correction": 14,
        "frequence_utilisation": 0
    },
    # Système d'extinction cuisine
    {
        "article": "NFPA 96 - 10.1",
        "titre": "Système d'extinction automatique - Cuisine",
        "description": "Les cuisines commerciales doivent être équipées d'un système d'extinction automatique fonctionnel",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    },
    # Charges combustibles
    {
        "article": "CNPI 2.1.3.2",
        "titre": "Charge combustible excessive",
        "description": "La charge combustible ne doit pas dépasser les limites établies pour l'usage prévu",
        "gravite": "Majeure",
        "delai_correction": 30,
        "frequence_utilisation": 0
    }
]

async def add_more_referentiels():
    """Ajouter des articles supplémentaires"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db_instance = client[DB_NAME]
    
    print(f"📡 Connexion à MongoDB Atlas...")
    print(f"🗄️  Base de données: {DB_NAME}")
    
    # Récupérer tous les tenants
    tenants = await db_instance.tenants.find({}, {"_id": 0}).to_list(100)
    
    if not tenants:
        print("⚠️  Aucun tenant trouvé")
        return
    
    print(f"✅ {len(tenants)} tenant(s) trouvé(s)")
    
    total_added = 0
    
    for tenant in tenants:
        tenant_id = tenant.get("id")
        tenant_nom = tenant.get("nom", "Inconnu")
        
        print(f"\n🏢 Tenant: {tenant_nom}")
        
        # Vérifier si les articles existent déjà
        existing_articles = set()
        existing_refs = await db_instance.referentiels_violation.find(
            {"tenant_id": tenant_id},
            {"_id": 0, "article": 1}
        ).to_list(1000)
        
        existing_articles = {ref.get("article") for ref in existing_refs}
        print(f"   📊 Articles existants: {len(existing_articles)}")
        
        # Insérer uniquement les nouveaux articles
        referentiels_to_insert = []
        for ref_data in NOUVEAUX_REFERENTIELS:
            if ref_data["article"] not in existing_articles:
                referentiel = {
                    "id": str(uuid4()),
                    "tenant_id": tenant_id,
                    **ref_data,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc)
                }
                referentiels_to_insert.append(referentiel)
        
        if referentiels_to_insert:
            result = await db_instance.referentiels_violation.insert_many(referentiels_to_insert)
            print(f"   ✅ {len(result.inserted_ids)} nouveaux articles ajoutés")
            total_added += len(result.inserted_ids)
        else:
            print(f"   ℹ️  Aucun nouvel article à ajouter (tous existent déjà)")
    
    # Afficher le total final
    total_refs = await db_instance.referentiels_violation.count_documents({})
    print(f"\n🎉 Total final: {total_refs} articles dans la base de données")
    print(f"✨ {total_added} nouveaux articles ajoutés durant cette exécution")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(add_more_referentiels())
