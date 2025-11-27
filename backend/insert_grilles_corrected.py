#!/usr/bin/env python3
"""
Script pour insérer les grilles d'inspection pré-définies dans MongoDB
CORRIGÉ selon la classification officielle du Code de sécurité du Québec
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

# Grilles complètes par groupe (CORRIGÉES)
GRILLES = [
    # GROUPE A - Établissements de Réunion (A-1, A-2, A-3, A-4)
    {
        "nom": "Groupe A - Établissements de Réunion",
        "groupe_occupation": "A",
        "description": "Théâtres, cinémas, écoles, églises, musées, restaurants, bibliothèques, arénas",
        "sous_types": ["a_1_theatre", "a_1_cinema", "a_1_opera", "a_2_ecole", "a_2_eglise", "a_2_musee", "a_2_restaurant", "a_2_bibliotheque", "a_2_terminal", "a_3_arena", "a_3_piscine", "a_4_stade"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Capacité et Occupation (Groupe A)",
                "description": "Vérifications spécifiques aux établissements de réunion",
                "questions": [
                    {"question": "Capacité maximale affichée bien en vue?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Nombre actuel d'occupants", "type": "texte"},
                    {"question": "Dispositifs anti-panique (barres) fonctionnels?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Rideaux/tentures: ignifugés (certificat)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False, "condition": "a_1_theatre || a_1_cinema || a_1_opera"},
                    {"question": "Gradins: solidité, accès dégagés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "a_3_arena || a_3_piscine || a_4_stade"}
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
    
    # GROUPE B - Soin, Traitement ou Détention (B-1, B-2, B-3)
    {
        "nom": "Groupe B - Soin, Traitement ou Détention",
        "groupe_occupation": "B",
        "description": "Prisons, hôpitaux, CHSLD, foyers de groupe, centres de réadaptation",
        "sous_types": ["b_1_prison", "b_1_penitencier", "b_1_reformatoire", "b_2_hopital", "b_2_chsld", "b_3_foyer_groupe", "b_3_readaptation"],
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
                    {"question": "Largeur corridors adéquate (lits/civières)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "b_2_hopital || b_2_chsld"},
                    {"question": "Cellules/chambres: sécurité et évacuation?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "b_1_prison || b_1_penitencier || b_1_reformatoire"},
                    {"question": "Photos compartimentation", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE C - Habitations (pas de sous-division officielle)
    {
        "nom": "Groupe C - Habitations",
        "groupe_occupation": "C",
        "description": "Maisons unifamiliales, immeubles à appartements, condos, hôtels, motels, pensions",
        "sous_types": ["unifamiliale", "appartements", "condos", "hotel", "motel", "pension"],
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
                    {"question": "Portes logements: ferme-porte automatique?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "appartements || condos"},
                    {"question": "Corridors communs: largeur adéquate, éclairés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "appartements || condos || hotel"},
                    {"question": "Système gicleurs: opérationnel, inspecté?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "hotel || appartements || condos"},
                    {"question": "Photos logements/détecteurs", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE D - Établissements d'Affaires et de Services Personnels
    {
        "nom": "Groupe D - Affaires et Services Personnels",
        "groupe_occupation": "D",
        "description": "Bureaux, banques, salons de coiffure, cabinets de dentiste, tours à bureaux",
        "sous_types": ["bureaux", "banques", "salons", "cabinets_professionnels", "tours_bureaux"],
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
    
    # GROUPE E - Établissements Commerciaux
    {
        "nom": "Groupe E - Commerciaux",
        "groupe_occupation": "E",
        "description": "Supermarchés, grands magasins, centres commerciaux, boutiques",
        "sous_types": ["supermarche", "grand_magasin", "centre_commercial", "boutique"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Charge Combustible (Groupe E)",
                "description": "Gestion du stockage commercial",
                "questions": [
                    {"question": "Allées principales dégagées (largeur min.)?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Entreposage en hauteur: stable?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Dégagement 450mm sous gicleurs?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Aires de vente: pas d'obstruction sorties?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Photos stockage et circulation", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE F - Établissements Industriels (F-1, F-2, F-3)
    {
        "nom": "Groupe F - Industriels",
        "groupe_occupation": "F",
        "description": "Usines, ateliers, entrepôts (F-1: risque élevé, F-2: moyen, F-3: faible)",
        "sous_types": ["f_1_explosifs", "f_1_produits_chimiques", "f_2_manufacture", "f_2_menuiserie", "f_2_garages", "f_2_imprimerie", "f_3_entrepot_incombustible", "f_3_energie", "f_3_transformation_aliments"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Matières Dangereuses (Groupe F)",
                "description": "Gestion des matières dangereuses (SIMDUT)",
                "questions": [
                    {"question": "Matières dangereuses: armoires ventilées conformes?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Fiches de données (FDS/SIMDUT) accessibles?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Travaux point chaud: permis utilisé?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": False},
                    {"question": "Chiffons huileux: contenants métalliques fermés?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Système ventilation poussières fonctionnel?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "f_2_manufacture || f_2_menuiserie"},
                    {"question": "Équipements de production: protections incendie adéquates?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "f_1_produits_chimiques || f_2_manufacture"},
                    {"question": "Zones de stockage: séparation coupe-feu respectée?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "f_3_entrepot_incombustible"},
                    {"question": "Photos matières dangereuses et installations", "type": "photos"}
                ]
            }
        ]
    },
    
    # GROUPE G - Agricole
    {
        "nom": "Groupe G - Agricole",
        "groupe_occupation": "G",
        "description": "Fermes, granges, serres, écuries, silos",
        "sous_types": ["ferme", "grange", "serre", "ecurie", "silo"],
        "sections": TRONC_COMMUN + [
            {
                "titre": "5. Spécifique Agricole",
                "description": "Vérifications pour bâtiments agricoles",
                "questions": [
                    {"question": "Entreposage de foin/paille: stable, éloigné des sources de chaleur?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "ferme || grange"},
                    {"question": "Machinerie agricole: entreposage sécuritaire, carburant?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "ferme || grange"},
                    {"question": "Animaux: accès aux sorties non bloqué?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "ecurie"},
                    {"question": "Système chauffage serre: entretenu, dégagé?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "serre"},
                    {"question": "Silo: système ventilation fonctionnel, pas d'accumulation?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True, "condition": "silo"},
                    {"question": "Produits chimiques agricoles: entreposage conforme?", "type": "choix", "options": ["Conforme", "Non-conforme", "S.O."], "photo_requise_si_non_conforme": True},
                    {"question": "Photos installations agricoles", "type": "photos"}
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
