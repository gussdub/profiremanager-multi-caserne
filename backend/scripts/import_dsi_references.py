#!/usr/bin/env python3
"""
Script d'importation des données de référence DSI pour ProFireManager
- Municipalités MAMH (depuis CSV officiel)
- Codes de causes (MSP)
- Sources de chaleur (MSP)
- Facteurs d'allumage (MSP)
- Usages de bâtiment (CNB)
- Natures de sinistre (MSP)
"""

import csv
import os
import sys
from datetime import datetime

# Ajouter le chemin du backend pour les imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'profiremanager-dev')

client = MongoClient(MONGO_URL)
db = client[DB_NAME]


def import_municipalites():
    """Importer les municipalités depuis le CSV MAMH"""
    print("📍 Import des municipalités MAMH...")
    
    csv_path = '/tmp/municipalites.csv'
    if not os.path.exists(csv_path):
        print("❌ Fichier CSV non trouvé. Téléchargez-le d'abord.")
        return
    
    municipalites = []
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            mcode = row.get('mcode', '').strip()
            if not mcode:
                continue
            
            # Extraire le code de région depuis regadm (ex: "Estrie (05)" -> "05")
            regadm = row.get('regadm', '')
            code_region = ''
            if '(' in regadm and ')' in regadm:
                code_region = regadm.split('(')[-1].replace(')', '').strip()
            
            # Extraire le code MRC depuis mrc (ex: "MRC Brome-Missisquoi (460)" -> "460")
            mrc = row.get('mrc', '')
            code_mrc = ''
            nom_mrc = mrc
            if '(' in mrc and ')' in mrc:
                code_mrc = mrc.split('(')[-1].replace(')', '').strip()
                nom_mrc = mrc.split('(')[0].replace('MRC', '').strip()
            
            municipalites.append({
                'code_mamh': mcode,
                'nom': row.get('munnom', ''),
                'designation': row.get('mdes', ''),
                'region_administrative': regadm.split('(')[0].strip() if '(' in regadm else regadm,
                'code_region': code_region,
                'mrc': nom_mrc,
                'code_mrc': code_mrc,
                'population': int(row.get('mpopul', 0) or 0),
                'superficie_km2': float(row.get('msuperf', 0) or 0),
                'code_postal': row.get('mcodpos', ''),
                'updated_at': datetime.utcnow()
            })
    
    if municipalites:
        # Supprimer et recréer la collection
        db.dsi_municipalites.drop()
        db.dsi_municipalites.insert_many(municipalites)
        db.dsi_municipalites.create_index('code_mamh', unique=True)
        db.dsi_municipalites.create_index('nom')
        print(f"✅ {len(municipalites)} municipalités importées")
    else:
        print("❌ Aucune municipalité trouvée dans le CSV")


def import_causes():
    """Importer les codes de causes MSP"""
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
        {'code': '9', 'libelle': 'Jeu d\'enfant', 'categorie': 'accidentelle'},
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


def import_sources_chaleur():
    """Importer les sources de chaleur MSP"""
    print("🌡️ Import des sources de chaleur MSP...")
    
    sources = [
        {'code': '10', 'libelle': 'Chaleur d\'un feu ouvert/allumette/briquet', 'groupe': 'Flamme nue'},
        {'code': '11', 'libelle': 'Mégot de cigarette', 'groupe': 'Matériaux fumeur'},
        {'code': '12', 'libelle': 'Pipe/cigare', 'groupe': 'Matériaux fumeur'},
        {'code': '13', 'libelle': 'Chandelle/bougie', 'groupe': 'Flamme nue'},
        {'code': '14', 'libelle': 'Lampe à l\'huile', 'groupe': 'Flamme nue'},
        {'code': '20', 'libelle': 'Cuisinière (élément)', 'groupe': 'Appareil de cuisson'},
        {'code': '21', 'libelle': 'Four/fourneau', 'groupe': 'Appareil de cuisson'},
        {'code': '22', 'libelle': 'Friteuse', 'groupe': 'Appareil de cuisson'},
        {'code': '23', 'libelle': 'Micro-ondes', 'groupe': 'Appareil de cuisson'},
        {'code': '24', 'libelle': 'Barbecue', 'groupe': 'Appareil de cuisson'},
        {'code': '30', 'libelle': 'Panneau électrique/disjoncteur', 'groupe': 'Équipement électrique'},
        {'code': '31', 'libelle': 'Câblage/filage électrique', 'groupe': 'Équipement électrique'},
        {'code': '32', 'libelle': 'Rallonge électrique', 'groupe': 'Équipement électrique'},
        {'code': '33', 'libelle': 'Prise de courant', 'groupe': 'Équipement électrique'},
        {'code': '34', 'libelle': 'Luminaire/lampe', 'groupe': 'Équipement électrique'},
        {'code': '35', 'libelle': 'Appareil électronique', 'groupe': 'Équipement électrique'},
        {'code': '40', 'libelle': 'Système de chauffage central', 'groupe': 'Système de chauffage'},
        {'code': '41', 'libelle': 'Poêle à bois/granules', 'groupe': 'Système de chauffage'},
        {'code': '42', 'libelle': 'Cheminée/foyer', 'groupe': 'Système de chauffage'},
        {'code': '43', 'libelle': 'Chaufferette portative', 'groupe': 'Système de chauffage'},
        {'code': '44', 'libelle': 'Plinthe électrique', 'groupe': 'Système de chauffage'},
        {'code': '50', 'libelle': 'Sécheuse', 'groupe': 'Électroménager'},
        {'code': '51', 'libelle': 'Laveuse', 'groupe': 'Électroménager'},
        {'code': '52', 'libelle': 'Lave-vaisselle', 'groupe': 'Électroménager'},
        {'code': '53', 'libelle': 'Réfrigérateur/congélateur', 'groupe': 'Électroménager'},
        {'code': '60', 'libelle': 'Véhicule motorisé', 'groupe': 'Véhicule'},
        {'code': '61', 'libelle': 'Équipement motorisé (tondeuse, etc.)', 'groupe': 'Véhicule'},
        {'code': '70', 'libelle': 'Feux d\'artifice/pièces pyrotechniques', 'groupe': 'Explosif'},
        {'code': '71', 'libelle': 'Liquide inflammable', 'groupe': 'Produit chimique'},
        {'code': '72', 'libelle': 'Gaz propane/naturel', 'groupe': 'Produit chimique'},
        {'code': '80', 'libelle': 'Foudre', 'groupe': 'Naturel'},
        {'code': '81', 'libelle': 'Soleil/chaleur radiante', 'groupe': 'Naturel'},
        {'code': '90', 'libelle': 'Indéterminée', 'groupe': 'Indéterminé'},
        {'code': '99', 'libelle': 'Autre', 'groupe': 'Autre'},
    ]
    
    for s in sources:
        s['updated_at'] = datetime.utcnow()
    
    db.dsi_sources_chaleur.drop()
    db.dsi_sources_chaleur.insert_many(sources)
    db.dsi_sources_chaleur.create_index('code', unique=True)
    print(f"✅ {len(sources)} sources de chaleur importées")


def import_facteurs_allumage():
    """Importer les facteurs d'allumage MSP"""
    print("⚡ Import des facteurs d'allumage MSP...")
    
    facteurs = [
        {'code': '1', 'libelle': 'Défaillance mécanique', 'description': 'Bris ou usure d\'un équipement'},
        {'code': '2', 'libelle': 'Défaillance électrique', 'description': 'Court-circuit, surcharge'},
        {'code': '3', 'libelle': 'Erreur humaine - cuisson', 'description': 'Aliments laissés sans surveillance'},
        {'code': '4', 'libelle': 'Erreur humaine - autre', 'description': 'Autre négligence'},
        {'code': '5', 'libelle': 'Mauvais usage équipement', 'description': 'Utilisation non conforme'},
        {'code': '6', 'libelle': 'Installation déficiente', 'description': 'Non-respect des codes'},
        {'code': '7', 'libelle': 'Entretien déficient', 'description': 'Manque de maintenance'},
        {'code': '8', 'libelle': 'Conception déficiente', 'description': 'Défaut de fabrication'},
        {'code': '9', 'libelle': 'Acte volontaire', 'description': 'Incendie criminel'},
        {'code': '10', 'libelle': 'Phénomène naturel', 'description': 'Foudre, etc.'},
        {'code': '11', 'libelle': 'Exposition à chaleur', 'description': 'Matériau trop près source chaleur'},
        {'code': '12', 'libelle': 'Combustion spontanée', 'description': 'Auto-inflammation'},
        {'code': '99', 'libelle': 'Indéterminé', 'description': 'Cause inconnue'},
    ]
    
    for f in facteurs:
        f['updated_at'] = datetime.utcnow()
    
    db.dsi_facteurs_allumage.drop()
    db.dsi_facteurs_allumage.insert_many(facteurs)
    db.dsi_facteurs_allumage.create_index('code', unique=True)
    print(f"✅ {len(facteurs)} facteurs d'allumage importés")


def import_usages_batiment():
    """Importer les usages de bâtiment CNB"""
    print("🏢 Import des usages de bâtiment CNB...")
    
    usages = [
        # Groupe A - Réunion
        {'code': 'A1', 'libelle': 'Réunion - Théâtre/Cinéma', 'groupe': 'A', 'description': 'Sièges fixes'},
        {'code': 'A2', 'libelle': 'Réunion - Salle avec scène', 'groupe': 'A', 'description': 'Restaurants, bars, salles de réception'},
        {'code': 'A3', 'libelle': 'Réunion - Aréna/Gymnase', 'groupe': 'A', 'description': 'Arènes, gymnases'},
        {'code': 'A4', 'libelle': 'Réunion - Autre', 'groupe': 'A', 'description': 'Autres usages de réunion'},
        
        # Groupe B - Soins
        {'code': 'B1', 'libelle': 'Soins - Détention', 'groupe': 'B', 'description': 'Prisons, établissements de détention'},
        {'code': 'B2', 'libelle': 'Soins - Traitement', 'groupe': 'B', 'description': 'Hôpitaux, CHSLD'},
        {'code': 'B3', 'libelle': 'Soins - Résidentiel', 'groupe': 'B', 'description': 'Résidences personnes âgées avec soins'},
        
        # Groupe C - Habitation
        {'code': 'C', 'libelle': 'Habitation', 'groupe': 'C', 'description': 'Maisons, appartements, condos'},
        
        # Groupe D - Affaires
        {'code': 'D', 'libelle': 'Affaires', 'groupe': 'D', 'description': 'Bureaux, cliniques médicales, banques'},
        
        # Groupe E - Commerce
        {'code': 'E', 'libelle': 'Commerce', 'groupe': 'E', 'description': 'Magasins, centres commerciaux'},
        
        # Groupe F - Industrie
        {'code': 'F1', 'libelle': 'Industrie - Risque élevé', 'groupe': 'F', 'description': 'Matières dangereuses'},
        {'code': 'F2', 'libelle': 'Industrie - Risque moyen', 'groupe': 'F', 'description': 'Ateliers, entrepôts'},
        {'code': 'F3', 'libelle': 'Industrie - Risque faible', 'groupe': 'F', 'description': 'Faible charge combustible'},
    ]
    
    for u in usages:
        u['updated_at'] = datetime.utcnow()
    
    db.dsi_usages_batiment.drop()
    db.dsi_usages_batiment.insert_many(usages)
    db.dsi_usages_batiment.create_index('code', unique=True)
    print(f"✅ {len(usages)} usages de bâtiment importés")


def import_natures_sinistre():
    """Importer les natures/types de sinistre MSP"""
    print("📋 Import des natures de sinistre MSP...")
    
    natures = [
        # Incendies
        {'code': '10', 'libelle': 'Incendie de bâtiment', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '11', 'libelle': 'Incendie de bâtiment - résidentiel', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '12', 'libelle': 'Incendie de bâtiment - commercial', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '13', 'libelle': 'Incendie de bâtiment - industriel', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '14', 'libelle': 'Incendie de bâtiment - institutionnel', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '20', 'libelle': 'Incendie de véhicule', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '30', 'libelle': 'Incendie de végétation/forêt', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '31', 'libelle': 'Feu de broussailles', 'categorie': 'incendie', 'requiert_dsi': True},
        {'code': '40', 'libelle': 'Incendie de poubelle/conteneur', 'categorie': 'incendie', 'requiert_dsi': False},
        {'code': '50', 'libelle': 'Autre incendie', 'categorie': 'incendie', 'requiert_dsi': True},
        
        # Alarmes
        {'code': '60', 'libelle': 'Alarme - non fondée', 'categorie': 'alarme', 'requiert_dsi': False},
        {'code': '61', 'libelle': 'Alarme - système défectueux', 'categorie': 'alarme', 'requiert_dsi': False},
        {'code': '62', 'libelle': 'Alarme - volontaire', 'categorie': 'alarme', 'requiert_dsi': False},
        {'code': '63', 'libelle': 'Alarme - conditions climatiques', 'categorie': 'alarme', 'requiert_dsi': False},
        
        # Sauvetages
        {'code': '70', 'libelle': 'Sauvetage - accident routier', 'categorie': 'sauvetage', 'requiert_dsi': False},
        {'code': '71', 'libelle': 'Sauvetage - nautique', 'categorie': 'sauvetage', 'requiert_dsi': False},
        {'code': '72', 'libelle': 'Sauvetage - hauteur', 'categorie': 'sauvetage', 'requiert_dsi': False},
        {'code': '73', 'libelle': 'Sauvetage - espace clos', 'categorie': 'sauvetage', 'requiert_dsi': False},
        {'code': '74', 'libelle': 'Sauvetage - ascenseur', 'categorie': 'sauvetage', 'requiert_dsi': False},
        {'code': '75', 'libelle': 'Assistance premiers répondants', 'categorie': 'sauvetage', 'requiert_dsi': False},
        
        # Matières dangereuses
        {'code': '80', 'libelle': 'Fuite de gaz', 'categorie': 'matdang', 'requiert_dsi': False},
        {'code': '81', 'libelle': 'Déversement produit chimique', 'categorie': 'matdang', 'requiert_dsi': False},
        {'code': '82', 'libelle': 'Monoxyde de carbone', 'categorie': 'matdang', 'requiert_dsi': False},
        
        # Autres
        {'code': '90', 'libelle': 'Inondation', 'categorie': 'autre', 'requiert_dsi': False},
        {'code': '91', 'libelle': 'Assistance publique', 'categorie': 'autre', 'requiert_dsi': False},
        {'code': '92', 'libelle': 'Entraide', 'categorie': 'autre', 'requiert_dsi': False},
        {'code': '99', 'libelle': 'Autre intervention', 'categorie': 'autre', 'requiert_dsi': False},
    ]
    
    for n in natures:
        n['updated_at'] = datetime.utcnow()
    
    db.dsi_natures_sinistre.drop()
    db.dsi_natures_sinistre.insert_many(natures)
    db.dsi_natures_sinistre.create_index('code', unique=True)
    print(f"✅ {len(natures)} natures de sinistre importées")


def import_materiaux():
    """Importer les matériaux premiers enflammés"""
    print("🔥 Import des matériaux premiers enflammés...")
    
    materiaux = [
        {'code': '10', 'libelle': 'Tissu/textile - vêtements'},
        {'code': '11', 'libelle': 'Tissu/textile - literie'},
        {'code': '12', 'libelle': 'Tissu/textile - rideaux'},
        {'code': '13', 'libelle': 'Tissu/textile - mobilier'},
        {'code': '20', 'libelle': 'Bois - structure'},
        {'code': '21', 'libelle': 'Bois - finition'},
        {'code': '22', 'libelle': 'Bois - mobilier'},
        {'code': '30', 'libelle': 'Papier/carton'},
        {'code': '40', 'libelle': 'Plastique/caoutchouc'},
        {'code': '50', 'libelle': 'Liquide inflammable'},
        {'code': '51', 'libelle': 'Gaz combustible'},
        {'code': '60', 'libelle': 'Huile/graisse de cuisson'},
        {'code': '70', 'libelle': 'Isolant'},
        {'code': '80', 'libelle': 'Câblage électrique'},
        {'code': '90', 'libelle': 'Végétation'},
        {'code': '99', 'libelle': 'Indéterminé/Autre'},
    ]
    
    for m in materiaux:
        m['updated_at'] = datetime.utcnow()
    
    db.dsi_materiaux.drop()
    db.dsi_materiaux.insert_many(materiaux)
    db.dsi_materiaux.create_index('code', unique=True)
    print(f"✅ {len(materiaux)} matériaux importés")


def main():
    print("=" * 50)
    print("🚒 IMPORT DES DONNÉES DE RÉFÉRENCE DSI")
    print("=" * 50)
    print(f"Base de données: {DB_NAME}")
    print()
    
    import_municipalites()
    import_causes()
    import_sources_chaleur()
    import_facteurs_allumage()
    import_usages_batiment()
    import_natures_sinistre()
    import_materiaux()
    
    print()
    print("=" * 50)
    print("✅ IMPORT TERMINÉ AVEC SUCCÈS")
    print("=" * 50)
    
    # Résumé
    print("\n📊 Résumé des collections créées:")
    print(f"   - dsi_municipalites: {db.dsi_municipalites.count_documents({})} documents")
    print(f"   - dsi_causes: {db.dsi_causes.count_documents({})} documents")
    print(f"   - dsi_sources_chaleur: {db.dsi_sources_chaleur.count_documents({})} documents")
    print(f"   - dsi_facteurs_allumage: {db.dsi_facteurs_allumage.count_documents({})} documents")
    print(f"   - dsi_usages_batiment: {db.dsi_usages_batiment.count_documents({})} documents")
    print(f"   - dsi_natures_sinistre: {db.dsi_natures_sinistre.count_documents({})} documents")
    print(f"   - dsi_materiaux: {db.dsi_materiaux.count_documents({})} documents")


if __name__ == '__main__':
    main()
