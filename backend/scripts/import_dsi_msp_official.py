#!/usr/bin/env python3
"""
Script d'importation des données de référence DSI - CODES MSP OFFICIELS
Mise à jour avec les codes XML exacts fournis par le MSP
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]


def import_sources_chaleur_msp():
    """Sources de Chaleur - Codes MSP officiels"""
    print("🌡️ Import des sources de chaleur MSP (codes officiels)...")
    
    sources = [
        {'code': '10', 'libelle': 'Tabagisme', 'description': 'Cigarette, cigare, pipe, allumette'},
        {'code': '20', 'libelle': 'Flamme nue / Chaleur vive', 'description': 'Bougie, briquet, chalumeau'},
        {'code': '30', 'libelle': 'Appareillage électrique', 'description': 'Court-circuit, panneau, filage fixe'},
        {'code': '40', 'libelle': 'Appareil de chauffage', 'description': 'Poêle à bois, plinthe, chauffage au diesel'},
        {'code': '50', 'libelle': 'Appareil de cuisson', 'description': 'Cuisinière, friteuse, barbecue'},
        {'code': '60', 'libelle': 'Friction / Étincelle mécanique', 'description': 'Meuleuse (grinder), étincelle de moteur'},
        {'code': '70', 'libelle': 'Réaction chimique', 'description': 'Combustion spontanée (linges huileux)'},
        {'code': '99', 'libelle': 'Autre / Indéterminée', 'description': 'Cause impossible à identifier précisément'},
    ]
    
    for s in sources:
        s['updated_at'] = datetime.utcnow()
    
    db.dsi_sources_chaleur.drop()
    db.dsi_sources_chaleur.insert_many(sources)
    db.dsi_sources_chaleur.create_index('code', unique=True)
    print(f"✅ {len(sources)} sources de chaleur MSP importées")


def import_facteurs_allumage_msp():
    """Facteurs d'Allumage (Causes) - Codes MSP officiels"""
    print("⚡ Import des facteurs d'allumage MSP (codes officiels)...")
    
    facteurs = [
        {'code': '1', 'libelle': 'Défaillance mécanique / Électrique', 'description': "Bris d'une pièce ou arc électrique"},
        {'code': '2', 'libelle': 'Erreur humaine (Inattention)', 'description': "Oubli d'un poêle, chandelle sans surveillance"},
        {'code': '3', 'libelle': 'Utilisation inappropriée', 'description': "Utiliser un chalumeau près d'isolant"},
        {'code': '7', 'libelle': 'Acte volontaire (Criminel)', 'description': 'Incendie suspect ou intentionnel'},
        {'code': '8', 'libelle': 'Cause naturelle', 'description': 'Foudre'},
        {'code': '9', 'libelle': "Travaux d'entretien", 'description': 'Soudure, décapage à la chaleur'},
        {'code': '10', 'libelle': 'Cause indéterminée', 'description': 'Preuves insuffisantes'},
    ]
    
    for f in facteurs:
        f['updated_at'] = datetime.utcnow()
    
    db.dsi_facteurs_allumage.drop()
    db.dsi_facteurs_allumage.insert_many(facteurs)
    db.dsi_facteurs_allumage.create_index('code', unique=True)
    print(f"✅ {len(facteurs)} facteurs d'allumage MSP importés")


def import_objets_origine_msp():
    """Objet à l'Origine (Premier combustible) - Codes MSP officiels"""
    print("🔥 Import des objets à l'origine MSP (codes officiels)...")
    
    objets = [
        {'code': '10', 'libelle': 'Meubles / Matelas', 'description': 'Mobilier, literie'},
        {'code': '20', 'libelle': 'Matière décorative', 'description': 'Rideaux, tentures, décorations'},
        {'code': '30', 'libelle': 'Liquides / Gaz inflammables', 'description': 'Essence, propane, solvants'},
        {'code': '40', 'libelle': 'Structure du bâtiment', 'description': 'Murs, planchers, charpente'},
        {'code': '50', 'libelle': 'Déchets / Ordures', 'description': 'Poubelles, rebuts'},
    ]
    
    for o in objets:
        o['updated_at'] = datetime.utcnow()
    
    db.dsi_materiaux.drop()
    db.dsi_materiaux.insert_many(objets)
    db.dsi_materiaux.create_index('code', unique=True)
    print(f"✅ {len(objets)} objets à l'origine MSP importés")


def import_usages_batiment_cnb():
    """Classification des Occupations CNB - Codes officiels"""
    print("🏢 Import des usages de bâtiment CNB (codes officiels)...")
    
    usages = [
        {'code': 'A', 'libelle': 'Assemblée', 'description': 'Églises, restaurants, cinémas', 'groupe': 'A'},
        {'code': 'B', 'libelle': 'Soins/Détention', 'description': 'Hôpitaux, CHSLD, prisons', 'groupe': 'B'},
        {'code': 'C', 'libelle': 'Habitation', 'description': 'Maisons, appartements, hôtels', 'groupe': 'C'},
        {'code': 'D', 'libelle': 'Affaires', 'description': 'Bureaux, banques, cliniques', 'groupe': 'D'},
        {'code': 'E', 'libelle': 'Commerce', 'description': 'Magasins, centres commerciaux', 'groupe': 'E'},
        {'code': 'F', 'libelle': 'Industrielle', 'description': 'Usines, garages, entrepôts', 'groupe': 'F'},
    ]
    
    for u in usages:
        u['updated_at'] = datetime.utcnow()
    
    db.dsi_usages_batiment.drop()
    db.dsi_usages_batiment.insert_many(usages)
    db.dsi_usages_batiment.create_index('code', unique=True)
    print(f"✅ {len(usages)} usages de bâtiment CNB importés")


def import_causes_msp():
    """Causes probables - Codes MSP"""
    print("🔥 Import des causes MSP...")
    
    causes = [
        {'code': '1', 'libelle': 'Intentionnelle (confirmée)', 'categorie': 'criminelle'},
        {'code': '2', 'libelle': 'Accidentelle', 'categorie': 'accidentelle'},
        {'code': '3', 'libelle': 'Naturelle', 'categorie': 'naturelle'},
        {'code': '4', 'libelle': 'Négligence', 'categorie': 'accidentelle'},
        {'code': '5', 'libelle': 'Défaillance mécanique/électrique', 'categorie': 'accidentelle'},
        {'code': '6', 'libelle': 'Conception/Installation déficiente', 'categorie': 'accidentelle'},
        {'code': '7', 'libelle': 'Intentionnelle (suspectée)', 'categorie': 'criminelle'},
        {'code': '8', 'libelle': 'Acte de vandalisme', 'categorie': 'criminelle'},
        {'code': '9', 'libelle': "Jeu d'enfant", 'categorie': 'accidentelle'},
        {'code': '10', 'libelle': 'Indéterminée', 'categorie': 'indeterminee'},
        {'code': '11', 'libelle': 'Sous enquête', 'categorie': 'indeterminee'},
        {'code': '99', 'libelle': 'Autre', 'categorie': 'autre'},
    ]
    
    for c in causes:
        c['updated_at'] = datetime.utcnow()
    
    db.dsi_causes.drop()
    db.dsi_causes.insert_many(causes)
    db.dsi_causes.create_index('code', unique=True)
    print(f"✅ {len(causes)} causes importées")


def import_etats_victimes():
    """États des victimes - Codes MSP officiels"""
    print("🚑 Import des états de victimes MSP...")
    
    etats = [
        {'code': '0', 'libelle': 'Aucune victime', 'description': 'Valeur par défaut si personne n\'est touché'},
        {'code': '1', 'libelle': 'Blessé léger', 'description': 'Soins sur place ou transport mineur'},
        {'code': '2', 'libelle': 'Blessé grave', 'description': 'Hospitalisation requise, vie non menacée'},
        {'code': '3', 'libelle': 'Décès', 'description': 'Constaté sur place ou à l\'hôpital'},
    ]
    
    for e in etats:
        e['updated_at'] = datetime.utcnow()
    
    db.dsi_etats_victimes.drop()
    db.dsi_etats_victimes.insert_many(etats)
    db.dsi_etats_victimes.create_index('code', unique=True)
    print(f"✅ {len(etats)} états de victimes importés")


def import_systemes_protection():
    """Systèmes de Protection Incendie - Codes MSP officiels"""
    print("🔔 Import des systèmes de protection MSP...")
    
    systemes = [
        {'code': 'GIC', 'libelle': 'Gicleurs', 'type': 'sprinkler'},
        {'code': 'ALA', 'libelle': 'Alarme Incendie', 'type': 'alarm'},
        {'code': 'DET', 'libelle': 'Avertisseur fumée', 'type': 'detector'},
    ]
    
    etats_systeme = [
        {'code': '1', 'libelle': 'Fonctionné'},
        {'code': '2', 'libelle': 'Non-fonctionné'},
        {'code': '3', 'libelle': 'Absent'},
    ]
    
    # Pour les avertisseurs de fumée, état spécial
    etats_detecteur = [
        {'code': '1', 'libelle': 'Fonctionné'},
        {'code': '2', 'libelle': 'Pile absente'},
        {'code': '3', 'libelle': 'Absent'},
    ]
    
    for s in systemes:
        s['updated_at'] = datetime.utcnow()
        s['etats'] = etats_detecteur if s['code'] == 'DET' else etats_systeme
    
    db.dsi_systemes_protection.drop()
    db.dsi_systemes_protection.insert_many(systemes)
    db.dsi_systemes_protection.create_index('code', unique=True)
    print(f"✅ {len(systemes)} systèmes de protection importés")


def import_categories_pertes():
    """Catégories de Pertes - Codes MSP officiels"""
    print("💰 Import des catégories de pertes MSP...")
    
    categories = [
        {'code': 'BAT', 'libelle': 'Pertes Bâtiment', 'description': 'Dommages à la structure, murs, toit, électricité fixe'},
        {'code': 'CON', 'libelle': 'Pertes Contenu', 'description': 'Meubles, vêtements, équipements, stocks commerciaux'},
    ]
    
    for c in categories:
        c['updated_at'] = datetime.utcnow()
    
    db.dsi_categories_pertes.drop()
    db.dsi_categories_pertes.insert_many(categories)
    db.dsi_categories_pertes.create_index('code', unique=True)
    print(f"✅ {len(categories)} catégories de pertes importées")


def main():
    print("=" * 60)
    print("🚒 MISE À JOUR DES CODES MSP OFFICIELS")
    print("=" * 60)
    print(f"Base de données: {DB_NAME}")
    print()
    
    import_sources_chaleur_msp()
    import_facteurs_allumage_msp()
    import_objets_origine_msp()
    import_usages_batiment_cnb()
    import_causes_msp()
    import_etats_victimes()
    import_systemes_protection()
    import_categories_pertes()
    
    print()
    print("=" * 60)
    print("✅ MISE À JOUR TERMINÉE - CODES MSP OFFICIELS")
    print("=" * 60)
    
    # Résumé
    print("\n📊 Résumé des collections mises à jour:")
    print(f"   - dsi_sources_chaleur: {db.dsi_sources_chaleur.count_documents({})} documents")
    print(f"   - dsi_facteurs_allumage: {db.dsi_facteurs_allumage.count_documents({})} documents")
    print(f"   - dsi_materiaux (objets origine): {db.dsi_materiaux.count_documents({})} documents")
    print(f"   - dsi_usages_batiment: {db.dsi_usages_batiment.count_documents({})} documents")
    print(f"   - dsi_causes: {db.dsi_causes.count_documents({})} documents")
    print(f"   - dsi_etats_victimes: {db.dsi_etats_victimes.count_documents({})} documents")
    print(f"   - dsi_systemes_protection: {db.dsi_systemes_protection.count_documents({})} documents")
    print(f"   - dsi_categories_pertes: {db.dsi_categories_pertes.count_documents({})} documents")
    print(f"   - dsi_municipalites: {db.dsi_municipalites.count_documents({})} documents (inchangé)")
    print(f"   - dsi_natures_sinistre: {db.dsi_natures_sinistre.count_documents({})} documents (inchangé)")


if __name__ == '__main__':
    main()
