#!/usr/bin/env python3
"""
Script pour insérer les grilles d'inspection pré-définies dans MongoDB
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from uuid import uuid4

# Tronc commun - À répéter dans chaque grille
TRONC_COMMUN = [
    {
        "titre": "1. Extérieur et Accès",
        "description": "Vérification de l'accessibilité et signalisation extérieure",
        "questions": [
            {"question": "Adresse civique bien visible de la rue?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
            {"question": "Voies d'accès pompiers dégagées (déneigement, obstacles)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Raccord siamois: signalisé, dégagé, bouchons en place?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Poteau d'incendie: dégagé (1,5m), accessible?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Photos de l'extérieur", "type": "photos"}
        ]
    },
    {
        "titre": "2. Moyens d'Évacuation",
        "description": "Vérification des sorties et voies d'évacuation",
        "questions": [
            {"question": "Éclairage d'urgence fonctionnel (Test 30 sec)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Enseignes de sortie éclairées et visibles?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Portes de sortie: fonctionnelles, non barrées, bon sens d'ouverture?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Corridors et escaliers: libres de tout entreposage?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Photos des voies d'évacuation", "type": "photos"}
        ]
    },
    {
        "titre": "3. Protection Incendie",
        "description": "Vérification des équipements de protection",
        "questions": [
            {"question": "Extincteurs: présents, bonne classe, inspectés (<1 an), accrochés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Système d'alarme: panneau sans trouble, inspection à jour?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Registre de sécurité: présent et à jour?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
            {"question": "Photos des équipements", "type": "photos"}
        ]
    },
    {
        "titre": "4. Électricité et Chauffage",
        "description": "Vérification des installations électriques",
        "questions": [
            {"question": "Salle électrique: aucun entreposage (dégagement 1m)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Pas de rallonges comme câblage permanent?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Panneaux électriques fermés (pas de fils à nu)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
            {"question": "Photos des installations électriques", "type": "photos"}
        ]
    }
]

# Grilles complètes par groupe
GRILLES = [
    # GROUPE A - Établissements de Réunion
    {
        "nom": "Groupe A - Établissements de Réunion",
        "groupe_occupation": "A",
        "description": "Salles de spectacles, écoles, restaurants, lieux de culte",
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Capacité et Occupation (Groupe A)",
                "description": "Vérifications spécifiques aux établissements de réunion",
                "questions": [
                    {"question": "Capacité maximale affichée bien en vue?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Nombre actuel d'occupants", "type": "texte"},
                    {"question": "Dispositifs anti-panique (barres) fonctionnels?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Rideaux/tentures: ignifugés (certificat)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False}
                ]
            },
            {
                "titre": "6. Cuisine Commerciale (si applicable)",
                "description": "Selon NFPA 96",
                "questions": [
                    {"question": "Hotte propre (pas de graisse)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Système d'extinction fixe inspecté (6 mois)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Extincteur classe K présent?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Photos de la cuisine", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE B - Soins ou Détention (avec questions conditionnelles)
    {
        "nom": "Groupe B - Soins ou Détention",
        "groupe_occupation": "B",
        "description": "Hôpitaux, CHSLD, RPA, centres de détention",
        "sous_types": ["ecole", "hopital", "chsld", "centre_communautaire", "eglise", "bibliotheque"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. PNAP - Personnes Nécessitant Attention Particulière",
                "description": "Recensement et procédures pour PNAP",
                "questions": [
                    {"question": "Y a-t-il présence de PNAP dans le bâtiment?", "type": "choix", "options": ["Oui", "Non"], "photo_requise_si_non_conforme": False},
                    {"question": "Nombre approximatif de PNAP", "type": "texte"},
                    {"question": "Type de limitations (mobilité, cognitive, auditive)", "type": "texte"},
                    {"question": "Localisation principale (étage, aile)", "type": "texte"},
                    {"question": "PSI inclut procédure évacuation PNAP?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Personnel formé pour évacuation PNAP?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Zones de refuge identifiées et conformes?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True}
                ]
            },
            {
                "titre": "6. Compartimentation (Groupe B)",
                "description": "Défense sur place et séparation coupe-feu",
                "questions": [
                    {"question": "Portes coupe-feu se ferment hermétiquement?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Verrouillage électromagnétique: déverrouille sur alarme?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Exercices d'évacuation: fréquence respectée?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Largeur corridors adéquate (lits/civières)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "hopital || chsld"},
                    {"question": "Classes/salles: capacité affichée, sorties dégagées?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "ecole"},
                    {"question": "Équipements religieux: pas d'obstruction des sorties?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "eglise"},
                    {"question": "Photos compartimentation", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE C - Habitation (avec questions conditionnelles selon sous-type)
    {
        "nom": "Groupe C - Habitation",
        "groupe_occupation": "C",
        "description": "Immeubles à logements, condos, hôtels",
        "sous_types": ["unifamiliale", "bifamiliale", "multi_3_8", "multi_9", "copropriete", "maison_mobile"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. PNAP - Si Applicable (Groupe C)",
                "description": "Recensement pour résidences avec PNAP",
                "questions": [
                    {"question": "Y a-t-il présence de PNAP?", "type": "choix", "options": ["Oui", "Non"], "photo_requise_si_non_conforme": False},
                    {"question": "Si oui, nombre approximatif", "type": "texte"},
                    {"question": "Procédures d'évacuation adaptées?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False}
                ]
            },
            {
                "titre": "6. Détection et Logements (Groupe C)",
                "description": "Avertisseurs et séparation entre suites",
                "questions": [
                    {"question": "Avertisseurs de fumée dans logements: fonctionnels, <10 ans?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Détecteurs CO (si garage/combustion)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Portes logements: ferme-porte automatique?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "bifamiliale || multi_3_8 || multi_9 || copropriete"},
                    {"question": "Vide-ordures: gicleur, porte fermée?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "multi_3_8 || multi_9 || copropriete"},
                    {"question": "Corridors communs: largeur adéquate, éclairés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "multi_3_8 || multi_9 || copropriete"},
                    {"question": "Système gicleurs: opérationnel, inspecté?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "multi_9"},
                    {"question": "Distance entre maisons mobiles respectée (3m minimum)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "maison_mobile"},
                    {"question": "Ancrage et stabilité de la maison mobile?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "maison_mobile"},
                    {"question": "Photos logements/détecteurs", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE D - Affaires
    {
        "nom": "Groupe D - Affaires et Services Personnels",
        "groupe_occupation": "D",
        "description": "Bureaux, services professionnels",
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Charge Combustible (Groupe D)",
                "description": "Gestion du stockage et encombrement",
                "questions": [
                    {"question": "Allées de circulation dégagées (largeur min. respectée)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Entreposage stable et sécuritaire?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Dégagement 18 pouces sous gicleurs respecté?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Sous-sol: pas d'accumulation de déchets?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Photos entreposage", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE E - Commercial (avec questions conditionnelles)
    {
        "nom": "Groupe E - Commercial",
        "groupe_occupation": "E",
        "description": "Magasins, centres commerciaux",
        "sous_types": ["bureau", "magasin", "restaurant", "hotel", "centre_commercial"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Charge Combustible (Groupe E)",
                "description": "Gestion du stockage commercial",
                "questions": [
                    {"question": "Allées principales dégagées (largeur min.)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Entreposage en hauteur: stable?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Dégagement 450mm sous gicleurs?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Aires de vente: pas d'obstruction sorties?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "magasin || centre_commercial"},
                    {"question": "Cuisine commerciale: hotte propre, système extinction inspecté?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "restaurant || hotel"},
                    {"question": "Chambres: détecteurs de fumée fonctionnels?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "hotel"},
                    {"question": "Photos stockage et circulation", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE F - Industriel (avec questions conditionnelles)
    {
        "nom": "Groupe F - Industriel",
        "groupe_occupation": "F",
        "description": "Usines, ateliers, entrepôts (F1, F2, F3)",
        "sous_types": ["manufacture_legere", "manufacture_lourde", "entrepot", "usine", "atelier"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Matières Dangereuses (Groupe F)",
                "description": "Gestion des matières dangereuses (SIMDUT)",
                "questions": [
                    {"question": "Matières dangereuses: armoires ventilées conformes?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Fiches de données (FDS/SIMDUT) accessibles?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Travaux point chaud: permis utilisé?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Chiffons huileux: contenants métalliques fermés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Système ventilation poussières fonctionnel?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "manufacture_legere || manufacture_lourde || usine"},
                    {"question": "Équipements de production: protections incendie adéquates?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "manufacture_legere || manufacture_lourde || usine"},
                    {"question": "Zones de stockage: séparation coupe-feu respectée?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "entrepot"},
                    {"question": "Photos matières dangereuses et installations", "type": "photos"}
                ]
            }
        ]
    }
]

async def insert_grilles():
    """Insère les grilles dans MongoDB"""
    # Connexion MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.profiremanager
    
    print("🔗 Connexion à MongoDB...")
    print(f"   URL: {mongo_url}")
    
    # Vérifier la connexion
    try:
        await client.server_info()
        print("✅ Connexion réussie\n")
    except Exception as e:
        print(f"❌ Erreur connexion: {e}")
        return
    
    # Insérer chaque grille
    inserted_count = 0
    for grille in GRILLES:
        # Ajouter un ID unique
        grille['id'] = str(uuid4())
        grille['actif'] = True
        grille['version'] = '1.0'
        
        # Vérifier si la grille existe déjà
        existing = await db.grilles_inspection.find_one({
            "groupe_occupation": grille['groupe_occupation']
        })
        
        if existing:
            print(f"⚠️  Grille {grille['groupe_occupation']} existe déjà - Mise à jour...")
            await db.grilles_inspection.replace_one(
                {"_id": existing['_id']},
                grille
            )
            print(f"   ✅ Mise à jour: {grille['nom']}")
        else:
            print(f"➕ Insertion: {grille['nom']}")
            await db.grilles_inspection.insert_one(grille)
            print(f"   ✅ {len(grille['sections'])} sections, " + 
                  f"{sum(len(s['questions']) for s in grille['sections'])} questions")
            inserted_count += 1
    
    print(f"\n🎉 Terminé! {inserted_count} grilles insérées")
    
    # Afficher le résumé
    total = await db.grilles_inspection.count_documents({})
    print(f"📊 Total grilles dans la base: {total}")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(insert_grilles())
