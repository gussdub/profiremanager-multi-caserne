"""
Création de la base de référentiels GLOBAUX (communs à tous les tenants)
Basée sur les codes québécois et canadiens + NFPA
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

# Base de référentiels GLOBAUX organisés par code source
REFERENTIELS_GLOBAUX = [
    # ========== CNB 2005 (Code National du Bâtiment) ==========
    {
        "code_source": "CNB-2005",
        "article": "3.2.1.1",
        "titre": "Hauteur de bâtiment - Définition",
        "description": "Définit les espaces non considérés comme des étages pour le calcul de la hauteur de bâtiment",
        "gravite": "Mineure",
        "delai_correction": 0,
        "categorie": "Bâtiment"
    },
    {
        "code_source": "CNB-2005",
        "article": "3.2.2.1",
        "titre": "Murs coupe-feu entre bâtiments",
        "description": "Exigences pour les murs coupe-feu séparant des bâtiments adjacents",
        "gravite": "Majeure",
        "delai_correction": 90,
        "categorie": "Séparations coupe-feu"
    },
    {
        "code_source": "CNB-2005",
        "article": "3.2.4.2",
        "titre": "Dégagement des parcours d'évacuation",
        "description": "Les parcours d'évacuation doivent être libres d'obstacles en tout temps",
        "gravite": "Majeure",
        "delai_correction": 7,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "CNB-2005",
        "article": "3.2.7.1",
        "titre": "Éclairage des moyens d'évacuation",
        "description": "Les moyens d'évacuation doivent être éclairés en permanence",
        "gravite": "Majeure",
        "delai_correction": 14,
        "categorie": "Éclairage"
    },
    {
        "code_source": "CNB-2005",
        "article": "9.7.3.1",
        "titre": "Fenêtres d'évacuation",
        "description": "Dégagement minimal de 550 mm devant une fenêtre ouvrant sur un puits de lumière",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Sorties et évacuation"
    },
    
    # ========== CNPI 2005 (Code National Prévention Incendies) ==========
    {
        "code_source": "CNPI-2005",
        "article": "2.8.1",
        "titre": "Plans de sécurité incendie",
        "description": "Un plan de sécurité incendie conforme doit être établi et maintenu à jour",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Plans et procédures"
    },
    {
        "code_source": "CNPI-2005",
        "article": "3.2.4.4.(1)",
        "titre": "Extincteurs portatifs requis",
        "description": "Des extincteurs portatifs doivent être fournis comme mesure de protection contre l'incendie",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "CNPI-2005",
        "article": "2.7.1.1",
        "titre": "Installation de gicleurs - NFPA 13",
        "description": "Les systèmes de gicleurs automatiques doivent être installés conformément à la norme NFPA 13",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Gicleurs"
    },
    {
        "code_source": "CNPI-2005",
        "article": "2.7.2.1",
        "titre": "Entretien de gicleurs - NFPA 25",
        "description": "L'entretien des systèmes de gicleurs doit être effectué selon NFPA 25",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Gicleurs"
    },
    {
        "code_source": "CNPI-2005",
        "article": "2.13.1",
        "titre": "Systèmes d'alarme incendie - CAN/ULC-S524",
        "description": "Les systèmes d'alarme incendie doivent respecter la norme CAN/ULC-S524 pour l'installation",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Alarmes"
    },
    {
        "code_source": "CNPI-2005",
        "article": "2.13.2",
        "titre": "Télésurveillance des alarmes - CAN/ULC-S561",
        "description": "Les systèmes d'alarme surveillés doivent respecter CAN/ULC-S561",
        "gravite": "Mineure",
        "delai_correction": 60,
        "categorie": "Alarmes"
    },
    
    # ========== Code de l'électricité du Québec ==========
    {
        "code_source": "CEQ-2024",
        "article": "14-102",
        "titre": "Protection contre la fuite à la terre",
        "description": "Les installations doivent être protégées contre les fuites à la terre conformément aux normes CSA",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Électricité"
    },
    {
        "code_source": "CEQ-2024",
        "article": "26-724(a)",
        "titre": "Séparation des circuits entre logements",
        "description": "Une dérivation d'un panneau dans un logement ne peut alimenter un autre logement",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Électricité"
    },
    {
        "code_source": "CEQ-2024",
        "article": "2-024",
        "titre": "Panneaux électriques accessibles",
        "description": "Les panneaux électriques doivent être accessibles et dégagés en tout temps",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Électricité"
    },
    {
        "code_source": "CEQ-2024",
        "article": "12-3034",
        "titre": "Surcharge des circuits électriques",
        "description": "Les circuits ne doivent pas être surchargés; éviter multiprises en série",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Électricité"
    },
    
    # ========== NFPA 101 (Life Safety Code) ==========
    {
        "code_source": "NFPA-101",
        "article": "7.8.1",
        "titre": "Éclairage d'urgence - Intensité minimale",
        "description": "Intensité minimale de 1 pied-candle (10 lux) le long des chemins d'évacuation",
        "gravite": "Majeure",
        "delai_correction": 14,
        "categorie": "Éclairage"
    },
    {
        "code_source": "NFPA-101",
        "article": "7.8.1.3",
        "titre": "Durée d'éclairage d'urgence",
        "description": "L'éclairage d'urgence doit fonctionner au moins 30 minutes après panne",
        "gravite": "Majeure",
        "delai_correction": 14,
        "categorie": "Éclairage"
    },
    {
        "code_source": "NFPA-101",
        "article": "7.10.1",
        "titre": "Signalisation des sorties",
        "description": "Panneaux de sortie visibles à 30 mètres, caractères ≥15 cm de hauteur",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "NFPA-101",
        "article": "7.2.1",
        "titre": "Distance maximale à une sortie",
        "description": "Distance maximale de 45 m à une porte d'issue dans la plupart des bâtiments",
        "gravite": "Majeure",
        "delai_correction": 0,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "NFPA-101",
        "article": "7.4.1.2",
        "titre": "Largeur minimale des issues",
        "description": "Les issues doivent avoir une largeur minimale de 900 mm (36 pouces)",
        "gravite": "Majeure",
        "delai_correction": 90,
        "categorie": "Sorties et évacuation"
    },
    
    # ========== NFPA 10 (Extincteurs) ==========
    {
        "code_source": "NFPA-10",
        "article": "5.2.1",
        "titre": "Inspection mensuelle des extincteurs",
        "description": "Les extincteurs portatifs doivent être inspectés mensuellement",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "NFPA-10",
        "article": "7.2",
        "titre": "Entretien annuel des extincteurs",
        "description": "Entretien annuel par un technicien qualifié conformément aux normes",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "NFPA-10",
        "article": "6.1.3.1",
        "titre": "Distance maximale entre extincteurs",
        "description": "Distance de parcours maximale de 23 mètres (75 pieds) à un extincteur",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "NFPA-10",
        "article": "4.1.1",
        "titre": "Emplacement visible des extincteurs",
        "description": "Les extincteurs doivent être facilement accessibles et visibles",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Extincteurs"
    },
    
    # ========== NFPA 72 (Détecteurs et alarmes) ==========
    {
        "code_source": "NFPA-72",
        "article": "29.5.1",
        "titre": "Détecteurs de fumée dans chambres",
        "description": "Détecteurs de fumée requis dans chaque chambre à coucher et zones de sommeil",
        "gravite": "Majeure",
        "delai_correction": 7,
        "categorie": "Détecteurs"
    },
    {
        "code_source": "NFPA-72",
        "article": "14.4.5",
        "titre": "Test annuel des détecteurs",
        "description": "Les détecteurs de fumée doivent être testés annuellement",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Détecteurs"
    },
    {
        "code_source": "NFPA-72",
        "article": "10.4.3",
        "titre": "Test annuel des alarmes incendie",
        "description": "Les systèmes d'alarme incendie doivent être testés annuellement",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Alarmes"
    },
    
    # ========== NFPA 25 (Gicleurs - Inspection) ==========
    {
        "code_source": "NFPA-25",
        "article": "5.2.1",
        "titre": "Inspection trimestrielle des gicleurs",
        "description": "Les gicleurs automatiques doivent être inspectés trimestriellement",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Gicleurs"
    },
    {
        "code_source": "NFPA-25",
        "article": "5.2.4",
        "titre": "Inspection annuelle complète",
        "description": "Inspection annuelle complète du système de gicleurs par entrepreneur certifié",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Gicleurs"
    },
    
    # ========== NFPA 13 (Gicleurs - Installation) ==========
    {
        "code_source": "NFPA-13",
        "article": "8.17.1",
        "titre": "Accès aux vannes de contrôle",
        "description": "Les vannes de contrôle des gicleurs doivent être accessibles et identifiées",
        "gravite": "Majeure",
        "delai_correction": 7,
        "categorie": "Gicleurs"
    },
    {
        "code_source": "NFPA-13",
        "article": "8.16.1.1.2",
        "titre": "Dégagement sous gicleurs",
        "description": "Maintenir le dégagement requis sous les têtes de gicleurs (généralement 457 mm)",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Gicleurs"
    },
    
    # ========== NFPA 96 (Cuisines commerciales) ==========
    {
        "code_source": "NFPA-96",
        "article": "11.4",
        "titre": "Nettoyage des hottes de cuisine",
        "description": "Les systèmes d'extraction doivent être nettoyés selon la fréquence prescrite",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Cuisine commerciale"
    },
    {
        "code_source": "NFPA-96",
        "article": "10.1",
        "titre": "Système d'extinction automatique - Cuisine",
        "description": "Cuisines commerciales doivent être équipées d'un système d'extinction fonctionnel",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Cuisine commerciale"
    },
    
    # ========== S3-R4 (Édifices publics Québec) ==========
    {
        "code_source": "S3-R4",
        "article": "Art. 5",
        "titre": "Moyens d'évacuation libres d'obstructions",
        "description": "Les moyens d'évacuation doivent être maintenus libres d'obstructions en tout temps",
        "gravite": "Majeure",
        "delai_correction": 1,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "S3-R4",
        "article": "Art. 8",
        "titre": "Éclairage d'urgence - 10 lux",
        "description": "Éclairage d'urgence d'intensité ≥10 lux, fonctionnel 30 min sans électricité",
        "gravite": "Majeure",
        "delai_correction": 14,
        "categorie": "Éclairage"
    },
    {
        "code_source": "S3-R4",
        "article": "Art. 11",
        "titre": "Extincteur 3A-40BC par étage",
        "description": "Au moins un extincteur de catégorie minimale 3A-40BC par étage dans édifices publics",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "S3-R4",
        "article": "Art. 12",
        "titre": "Distance maximale 15 m entre extincteurs",
        "description": "Les extincteurs doivent être espacés d'au maximum 15 mètres",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    {
        "code_source": "S3-R4",
        "article": "Art. 7",
        "titre": "Portes d'issue non verrouillées",
        "description": "Les portes d'issue ne doivent pas être verrouillées empêchant l'évacuation",
        "gravite": "Majeure",
        "delai_correction": 1,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "S3-R4",
        "article": "Art. 9",
        "titre": "Signalisation des sorties visible",
        "description": "Les issues doivent être identifiées par affiches visibles",
        "gravite": "Mineure",
        "delai_correction": 14,
        "categorie": "Sorties et évacuation"
    },
    
    # ========== R.V.Q. 2241 (Règlement ville de Québec - Maisons/Chambres) ==========
    {
        "code_source": "RVQ-2241",
        "article": "Art. 15",
        "titre": "Avertisseur de fumée par étage",
        "description": "Au moins un avertisseur de fumée par étage dans chaque logement, y compris sous-sol",
        "gravite": "Majeure",
        "delai_correction": 7,
        "categorie": "Détecteurs"
    },
    {
        "code_source": "RVQ-2241",
        "article": "Art. 16",
        "titre": "Position des avertisseurs",
        "description": "Avertisseurs au plafond (≥10 cm du mur) ou mur (bord supérieur 10-30 cm du plafond)",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Détecteurs"
    },
    {
        "code_source": "RVQ-2241",
        "article": "Art. 20",
        "titre": "Conformité CAN/ULC-S531",
        "description": "Les avertisseurs doivent être conformes à la norme CAN/ULC-S531",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Détecteurs"
    },
    {
        "code_source": "RVQ-2241",
        "article": "Art. 25",
        "titre": "Portes de sortie sans clé",
        "description": "Les portes de sortie doivent s'ouvrir sans clé ni dispositif spécial",
        "gravite": "Majeure",
        "delai_correction": 1,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "RVQ-2241",
        "article": "Art. 27",
        "titre": "Distance maximale 30 m à une issue",
        "description": "Distance maximale de 30 mètres à une porte d'issue",
        "gravite": "Majeure",
        "delai_correction": 0,
        "categorie": "Sorties et évacuation"
    },
    {
        "code_source": "RVQ-2241",
        "article": "Art. 30",
        "titre": "Extincteur 3A-40BC par étage",
        "description": "Au moins un extincteur 3A-40BC par étage conformément au CNPI",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Extincteurs"
    },
    
    # ========== NFPA 1 (Code général incendie) ==========
    {
        "code_source": "NFPA-1",
        "article": "10.11.1",
        "titre": "Entreposage de matériaux combustibles",
        "description": "Les matériaux combustibles doivent être entreposés de manière ordonnée et à distance des sources de chaleur",
        "gravite": "Mineure",
        "delai_correction": 30,
        "categorie": "Entreposage"
    },
    {
        "code_source": "NFPA-1",
        "article": "10.11.2",
        "titre": "Entreposage de liquides inflammables",
        "description": "Les liquides inflammables doivent être entreposés dans des armoires conformes",
        "gravite": "Majeure",
        "delai_correction": 14,
        "categorie": "Entreposage"
    },
    
    # ========== NFPA 54 (Code du gaz naturel) ==========
    {
        "code_source": "NFPA-54",
        "article": "7.3.1",
        "titre": "Ventilation des salles mécaniques",
        "description": "Les salles contenant des appareils à combustion doivent être adéquatement ventilées",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Mécanique"
    },
    
    # ========== NFPA 58 (Code du propane) ==========
    {
        "code_source": "NFPA-58",
        "article": "5.2.4",
        "titre": "Réservoirs de propane - Dégagements",
        "description": "Les réservoirs de propane doivent respecter les dégagements minimaux et être sécurisés",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Gaz"
    },
    
    # ========== NFPA 110 (Génératrices) ==========
    {
        "code_source": "NFPA-110",
        "article": "8.3.2",
        "titre": "Test mensuel génératrice d'urgence",
        "description": "Les génératrices d'urgence doivent être testées mensuellement sous charge",
        "gravite": "Majeure",
        "delai_correction": 30,
        "categorie": "Électricité"
    },
    
    # ========== NFPA 30 (Liquides inflammables) ==========
    {
        "code_source": "NFPA-30",
        "article": "22.11.1",
        "titre": "Réservoirs de mazout",
        "description": "Les réservoirs de mazout doivent être inspectés et maintenus en bon état",
        "gravite": "Majeure",
        "delai_correction": 60,
        "categorie": "Mazout"
    },
]

async def seed_referentiels_globaux():
    """Créer la collection de référentiels globaux"""
    
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print(f"📡 Connexion à MongoDB Atlas...")
    print(f"🗄️  Base de données: {DB_NAME}")
    
    # Vérifier si la collection existe déjà
    existing_count = await db.referentiels_globaux.count_documents({})
    
    if existing_count > 0:
        print(f"\n⚠️  {existing_count} référentiels globaux existent déjà")
        response = input("Voulez-vous les supprimer et recommencer? (oui/non): ")
        if response.lower() == 'oui':
            await db.referentiels_globaux.delete_many({})
            print("✅ Anciens référentiels supprimés")
        else:
            print("❌ Annulé")
            client.close()
            return
    
    # Insérer les référentiels globaux
    referentiels_to_insert = []
    for ref_data in REFERENTIELS_GLOBAUX:
        referentiel = {
            "id": str(uuid4()),
            "global": True,
            **ref_data,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        referentiels_to_insert.append(referentiel)
    
    result = await db.referentiels_globaux.insert_many(referentiels_to_insert)
    print(f"\n✅ {len(result.inserted_ids)} référentiels globaux insérés")
    
    # Statistiques par code source
    print(f"\n📊 Répartition par code source:")
    pipeline = [
        {"$group": {"_id": "$code_source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    stats = await db.referentiels_globaux.aggregate(pipeline).to_list(100)
    for stat in stats:
        print(f"   • {stat['_id']}: {stat['count']} articles")
    
    # Statistiques par catégorie
    print(f"\n📊 Répartition par catégorie:")
    pipeline = [
        {"$group": {"_id": "$categorie", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]
    stats = await db.referentiels_globaux.aggregate(pipeline).to_list(100)
    for stat in stats:
        print(f"   • {stat['_id']}: {stat['count']} articles")
    
    print(f"\n🎉 Seed des référentiels globaux terminé!")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_referentiels_globaux())
