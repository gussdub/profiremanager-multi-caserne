"""
Initialisation des données de référence DSI (Déclaration de sinistre incendie)
Standards du Ministère de la Sécurité publique du Québec
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager')


# ==================== NATURES D'INTERVENTION ====================

NATURES_INTERVENTION = [
    # Incendies
    {"code": "10", "libelle": "Incendie de bâtiment", "categorie": "Incendie"},
    {"code": "11", "libelle": "Incendie de véhicule", "categorie": "Incendie"},
    {"code": "12", "libelle": "Incendie de végétation/forêt", "categorie": "Incendie"},
    {"code": "13", "libelle": "Feu de cheminée", "categorie": "Incendie"},
    {"code": "14", "libelle": "Incendie de poubelle/conteneur", "categorie": "Incendie"},
    {"code": "15", "libelle": "Autre incendie", "categorie": "Incendie"},
    
    # Alarmes
    {"code": "20", "libelle": "Alarme incendie", "categorie": "Alarme"},
    {"code": "21", "libelle": "Alarme CO (monoxyde de carbone)", "categorie": "Alarme"},
    {"code": "22", "libelle": "Alarme automatique - défectuosité", "categorie": "Alarme"},
    {"code": "23", "libelle": "Fausse alarme", "categorie": "Alarme"},
    
    # Sauvetage
    {"code": "30", "libelle": "Accident de la route", "categorie": "Sauvetage"},
    {"code": "31", "libelle": "Sauvetage nautique", "categorie": "Sauvetage"},
    {"code": "32", "libelle": "Sauvetage en hauteur", "categorie": "Sauvetage"},
    {"code": "33", "libelle": "Sauvetage en espace clos", "categorie": "Sauvetage"},
    {"code": "34", "libelle": "Personne coincée", "categorie": "Sauvetage"},
    {"code": "35", "libelle": "Recherche de personne", "categorie": "Sauvetage"},
    
    # Matières dangereuses
    {"code": "40", "libelle": "Fuite de gaz", "categorie": "Matières dangereuses"},
    {"code": "41", "libelle": "Déversement de produits chimiques", "categorie": "Matières dangereuses"},
    {"code": "42", "libelle": "Odeur suspecte", "categorie": "Matières dangereuses"},
    
    # Premiers soins
    {"code": "50", "libelle": "Premiers soins/Assistance médicale", "categorie": "Premiers soins"},
    {"code": "51", "libelle": "Réanimation", "categorie": "Premiers soins"},
    
    # Autres
    {"code": "60", "libelle": "Inondation", "categorie": "Autre"},
    {"code": "61", "libelle": "Effondrement de structure", "categorie": "Autre"},
    {"code": "62", "libelle": "Fils électriques au sol", "categorie": "Autre"},
    {"code": "63", "libelle": "Assistance publique", "categorie": "Autre"},
    {"code": "64", "libelle": "Vérification", "categorie": "Autre"},
    {"code": "99", "libelle": "À classifier", "categorie": "Autre"},
]


# ==================== CAUSES PROBABLES ====================

CAUSES_PROBABLES = [
    {"code": "0", "libelle": "Sans objet (Non-incendie)", "description": "L'intervention n'était pas un incendie"},
    {"code": "1", "libelle": "Accidentelle - Défaillance mécanique/électrique", "description": "Défaut de fonctionnement d'un appareil ou système"},
    {"code": "2", "libelle": "Accidentelle - Erreur humaine (Cuisson)", "description": "Aliments laissés sans surveillance, surchauffe"},
    {"code": "3", "libelle": "Accidentelle - Erreur humaine (Autre)", "description": "Autre erreur non intentionnelle"},
    {"code": "4", "libelle": "Négligence - Article de fumeur", "description": "Cigarette, cigare mal éteint"},
    {"code": "5", "libelle": "Négligence - Travaux à chaud", "description": "Soudure, découpage, meulage"},
    {"code": "6", "libelle": "Négligence - Feu extérieur non surveillé", "description": "Feu de camp, brûlage de déchets"},
    {"code": "7", "libelle": "Intentionnelle - Incendiaire/Criminel", "description": "Acte volontaire de mettre le feu"},
    {"code": "8", "libelle": "Naturelle - Foudre", "description": "Impact de foudre"},
    {"code": "9", "libelle": "Naturelle - Combustion spontanée", "description": "Auto-inflammation de matières"},
    {"code": "10", "libelle": "Indéterminée", "description": "Cause ne pouvant être établie"},
]


# ==================== SOURCES DE CHALEUR ====================

SOURCES_CHALEUR = [
    # Appareils de cuisson
    {"code": "10", "libelle": "Cuisinière électrique", "categorie": "Cuisson"},
    {"code": "11", "libelle": "Cuisinière au gaz", "categorie": "Cuisson"},
    {"code": "12", "libelle": "Four", "categorie": "Cuisson"},
    {"code": "13", "libelle": "Friteuse", "categorie": "Cuisson"},
    {"code": "14", "libelle": "Micro-ondes", "categorie": "Cuisson"},
    {"code": "15", "libelle": "BBQ/Grill", "categorie": "Cuisson"},
    {"code": "19", "libelle": "Autre appareil de cuisson", "categorie": "Cuisson"},
    
    # Chauffage
    {"code": "20", "libelle": "Poêle à bois", "categorie": "Chauffage"},
    {"code": "21", "libelle": "Foyer/Cheminée", "categorie": "Chauffage"},
    {"code": "22", "libelle": "Fournaise au mazout", "categorie": "Chauffage"},
    {"code": "23", "libelle": "Fournaise au gaz", "categorie": "Chauffage"},
    {"code": "24", "libelle": "Plinthe électrique", "categorie": "Chauffage"},
    {"code": "25", "libelle": "Chaufferette portative", "categorie": "Chauffage"},
    {"code": "26", "libelle": "Chauffe-eau", "categorie": "Chauffage"},
    {"code": "29", "libelle": "Autre appareil de chauffage", "categorie": "Chauffage"},
    
    # Électrique
    {"code": "30", "libelle": "Panneau électrique", "categorie": "Électrique"},
    {"code": "31", "libelle": "Câblage/Filage défectueux", "categorie": "Électrique"},
    {"code": "32", "libelle": "Rallonge/Multiprise surchargée", "categorie": "Électrique"},
    {"code": "33", "libelle": "Arc électrique", "categorie": "Électrique"},
    {"code": "34", "libelle": "Transformateur", "categorie": "Électrique"},
    {"code": "39", "libelle": "Autre cause électrique", "categorie": "Électrique"},
    
    # Flamme nue
    {"code": "40", "libelle": "Chandelle/Bougie", "categorie": "Flamme nue"},
    {"code": "41", "libelle": "Allumette/Briquet", "categorie": "Flamme nue"},
    {"code": "42", "libelle": "Lampe à huile", "categorie": "Flamme nue"},
    {"code": "43", "libelle": "Torche/Chalumeau", "categorie": "Flamme nue"},
    {"code": "49", "libelle": "Autre flamme nue", "categorie": "Flamme nue"},
    
    # Fumeur
    {"code": "50", "libelle": "Cigarette", "categorie": "Fumeur"},
    {"code": "51", "libelle": "Cigare/Pipe", "categorie": "Fumeur"},
    {"code": "52", "libelle": "Cannabis/Joint", "categorie": "Fumeur"},
    
    # Travaux à chaud
    {"code": "60", "libelle": "Soudure à l'arc", "categorie": "Travaux à chaud"},
    {"code": "61", "libelle": "Soudure au gaz", "categorie": "Travaux à chaud"},
    {"code": "62", "libelle": "Découpage/Meulage", "categorie": "Travaux à chaud"},
    {"code": "63", "libelle": "Couverture de toiture (Torche)", "categorie": "Travaux à chaud"},
    
    # Autres
    {"code": "70", "libelle": "Foudre", "categorie": "Naturelle"},
    {"code": "71", "libelle": "Soleil (concentration)", "categorie": "Naturelle"},
    {"code": "80", "libelle": "Véhicule moteur", "categorie": "Véhicule"},
    {"code": "90", "libelle": "Inconnue", "categorie": "Autre"},
    {"code": "99", "libelle": "Autre", "categorie": "Autre"},
]


# ==================== MATÉRIAUX PREMIERS ENFLAMMÉS ====================

MATERIAUX_ENFLAMMES = [
    # Structure
    {"code": "10", "libelle": "Bois de structure", "categorie": "Structure"},
    {"code": "11", "libelle": "Isolant", "categorie": "Structure"},
    {"code": "12", "libelle": "Revêtement extérieur (vinyle, aluminium)", "categorie": "Structure"},
    {"code": "13", "libelle": "Toiture/Bardeaux", "categorie": "Structure"},
    {"code": "14", "libelle": "Plancher", "categorie": "Structure"},
    
    # Contenu - Mobilier
    {"code": "20", "libelle": "Matelas/Literie", "categorie": "Contenu"},
    {"code": "21", "libelle": "Meuble rembourré (sofa, fauteuil)", "categorie": "Contenu"},
    {"code": "22", "libelle": "Meuble en bois", "categorie": "Contenu"},
    {"code": "23", "libelle": "Rideaux/Tentures", "categorie": "Contenu"},
    {"code": "24", "libelle": "Tapis/Moquette", "categorie": "Contenu"},
    {"code": "25", "libelle": "Vêtements", "categorie": "Contenu"},
    {"code": "26", "libelle": "Papier/Carton", "categorie": "Contenu"},
    {"code": "27", "libelle": "Ordures/Déchets", "categorie": "Contenu"},
    
    # Liquides
    {"code": "30", "libelle": "Huile de cuisson", "categorie": "Liquides"},
    {"code": "31", "libelle": "Essence/Carburant", "categorie": "Liquides"},
    {"code": "32", "libelle": "Propane/Gaz naturel", "categorie": "Liquides"},
    {"code": "33", "libelle": "Alcool/Spiritueux", "categorie": "Liquides"},
    {"code": "34", "libelle": "Peinture/Solvant", "categorie": "Liquides"},
    
    # Végétation
    {"code": "40", "libelle": "Herbe/Gazon", "categorie": "Végétation"},
    {"code": "41", "libelle": "Feuilles/Branches", "categorie": "Végétation"},
    {"code": "42", "libelle": "Arbre", "categorie": "Végétation"},
    {"code": "43", "libelle": "Haie/Arbuste", "categorie": "Végétation"},
    
    # Véhicule
    {"code": "50", "libelle": "Siège de véhicule", "categorie": "Véhicule"},
    {"code": "51", "libelle": "Câblage de véhicule", "categorie": "Véhicule"},
    {"code": "52", "libelle": "Compartiment moteur", "categorie": "Véhicule"},
    
    # Autres
    {"code": "60", "libelle": "Aliments", "categorie": "Autre"},
    {"code": "61", "libelle": "Plastique", "categorie": "Autre"},
    {"code": "90", "libelle": "Inconnu", "categorie": "Autre"},
    {"code": "99", "libelle": "Autre", "categorie": "Autre"},
]


# ==================== CATÉGORIES DE BÂTIMENT ====================

CATEGORIES_BATIMENT = [
    {"code": "1", "libelle": "Résidence unifamiliale isolée", "description": "Maison détachée"},
    {"code": "2", "libelle": "Résidence unifamiliale jumelée", "description": "Maison jumelée"},
    {"code": "3", "libelle": "Résidence en rangée", "description": "Maison en rangée, townhouse"},
    {"code": "4", "libelle": "Duplex", "description": "Bâtiment 2 logements"},
    {"code": "5", "libelle": "Triplex", "description": "Bâtiment 3 logements"},
    {"code": "6", "libelle": "Immeuble à logements (4-8)", "description": "Petit immeuble résidentiel"},
    {"code": "7", "libelle": "Immeuble à logements (9+)", "description": "Grand immeuble résidentiel"},
    {"code": "8", "libelle": "Maison mobile/Roulotte", "description": "Habitation mobile"},
    {"code": "10", "libelle": "Commerce de détail", "description": "Magasin, boutique"},
    {"code": "11", "libelle": "Restaurant/Bar", "description": "Établissement de restauration"},
    {"code": "12", "libelle": "Bureau", "description": "Immeuble de bureaux"},
    {"code": "13", "libelle": "Hôtel/Motel", "description": "Hébergement touristique"},
    {"code": "14", "libelle": "Centre commercial", "description": "Mall, plaza"},
    {"code": "20", "libelle": "Usine/Manufacture", "description": "Bâtiment industriel"},
    {"code": "21", "libelle": "Entrepôt", "description": "Stockage"},
    {"code": "22", "libelle": "Garage/Atelier mécanique", "description": "Réparation automobile"},
    {"code": "30", "libelle": "École", "description": "Établissement d'enseignement"},
    {"code": "31", "libelle": "Hôpital/Clinique", "description": "Établissement de santé"},
    {"code": "32", "libelle": "CHSLD/Résidence personnes âgées", "description": "Soins de longue durée"},
    {"code": "33", "libelle": "Garderie/CPE", "description": "Service de garde"},
    {"code": "34", "libelle": "Église/Lieu de culte", "description": "Bâtiment religieux"},
    {"code": "35", "libelle": "Centre communautaire", "description": "Salle communautaire"},
    {"code": "40", "libelle": "Ferme/Bâtiment agricole", "description": "Exploitation agricole"},
    {"code": "41", "libelle": "Garage résidentiel détaché", "description": "Remise, cabanon"},
    {"code": "50", "libelle": "Construction/Chantier", "description": "Bâtiment en construction"},
    {"code": "51", "libelle": "Bâtiment abandonné/Vacant", "description": "Non occupé"},
    {"code": "99", "libelle": "Autre/Non classifié", "description": "Autre type de bâtiment"},
]


async def init_reference_data():
    """Initialise les données de référence DSI"""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    print("🔥 Initialisation des données de référence DSI...")
    
    # Natures d'intervention
    existing_natures = await db.intervention_natures.count_documents({})
    if existing_natures == 0:
        docs = [{"id": str(uuid.uuid4()), "actif": True, **n} for n in NATURES_INTERVENTION]
        await db.intervention_natures.insert_many(docs)
        print(f"  ✅ {len(docs)} natures d'intervention insérées")
    else:
        print(f"  ℹ️ {existing_natures} natures déjà présentes")
    
    # Causes probables
    existing_causes = await db.intervention_causes.count_documents({})
    if existing_causes == 0:
        docs = [{"id": str(uuid.uuid4()), "actif": True, **c} for c in CAUSES_PROBABLES]
        await db.intervention_causes.insert_many(docs)
        print(f"  ✅ {len(docs)} causes probables insérées")
    else:
        print(f"  ℹ️ {existing_causes} causes déjà présentes")
    
    # Sources de chaleur
    existing_sources = await db.intervention_sources_chaleur.count_documents({})
    if existing_sources == 0:
        docs = [{"id": str(uuid.uuid4()), "actif": True, **s} for s in SOURCES_CHALEUR]
        await db.intervention_sources_chaleur.insert_many(docs)
        print(f"  ✅ {len(docs)} sources de chaleur insérées")
    else:
        print(f"  ℹ️ {existing_sources} sources déjà présentes")
    
    # Matériaux enflammés
    existing_materiaux = await db.intervention_materiaux.count_documents({})
    if existing_materiaux == 0:
        docs = [{"id": str(uuid.uuid4()), "actif": True, **m} for m in MATERIAUX_ENFLAMMES]
        await db.intervention_materiaux.insert_many(docs)
        print(f"  ✅ {len(docs)} matériaux insérés")
    else:
        print(f"  ℹ️ {existing_materiaux} matériaux déjà présents")
    
    # Catégories de bâtiment
    existing_categories = await db.intervention_categories_batiment.count_documents({})
    if existing_categories == 0:
        docs = [{"id": str(uuid.uuid4()), "actif": True, **c} for c in CATEGORIES_BATIMENT]
        await db.intervention_categories_batiment.insert_many(docs)
        print(f"  ✅ {len(docs)} catégories de bâtiment insérées")
    else:
        print(f"  ℹ️ {existing_categories} catégories déjà présentes")
    
    # Créer les index
    print("\n📇 Création des index...")
    await db.interventions.create_index([("tenant_id", 1), ("external_call_id", 1)], unique=True)
    await db.interventions.create_index([("tenant_id", 1), ("status", 1)])
    await db.interventions.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.intervention_resources.create_index([("intervention_id", 1)])
    await db.intervention_vehicles.create_index([("intervention_id", 1)])
    await db.intervention_assistance.create_index([("intervention_id", 1)])
    await db.intervention_code_mappings.create_index([("tenant_id", 1), ("type_mapping", 1), ("code_externe", 1)])
    print("  ✅ Index créés")
    
    print("\n✅ Initialisation terminée!")
    client.close()


if __name__ == "__main__":
    asyncio.run(init_reference_data())
