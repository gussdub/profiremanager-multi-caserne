#!/usr/bin/env python3
"""
TEST COMPLET DU MODULE APRIA INSPECTION

CONTEXTE:
Test complet des endpoints du module APRIA Inspection nouvellement implémenté.

TENANT: shefford
CREDENTIALS: email: test@shefford.ca, mot_de_passe: Test123!

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification

2. **Modèles d'inspection APRIA:**
   - GET /api/shefford/apria/modeles-inspection - Liste des modèles (devrait être vide ou créer par défaut)
   - GET /api/shefford/apria/modeles-inspection/actif - Modèle actif (devrait créer un modèle par défaut avec 13 éléments)

3. **Équipements APRIA:**
   - GET /api/shefford/apria/equipements - Liste des équipements APRIA

4. **Inspections APRIA:**
   - POST /api/shefford/apria/inspections - Créer une nouvelle inspection
   - GET /api/shefford/apria/inspections - Récupérer les inspections créées

5. **Paramètres APRIA:**
   - GET /api/shefford/apria/parametres - Récupérer les paramètres (contacts_alertes)

RÉSULTATS ATTENDUS:
- Tous les endpoints doivent retourner 200
- Le modèle par défaut doit avoir 13 éléments d'inspection
- Les inspections doivent être correctement stockées et récupérées
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class APRIAModuleTester:
    def __init__(self):
        self.base_url = "https://firemanager-1.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        self.credentials = {"email": "test@shefford.ca", "password": "Test123!"}
        
        # Résultats des tests
        self.test_results = []
        self.created_items = []  # Pour nettoyer après les tests
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "user_id": None,
            "modeles_inspection": [],
            "equipements_apria": [],
            "inspections_creees": [],
            "modele_actif": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant shefford avec les nouvelles credentials"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Email: {self.credentials['email']}")
        
        response = requests.post(auth_url, json=self.credentials)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
            self.test_data["user_id"] = user_info.get('id')
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code}")
            print(f"📄 Réponse: {response.text[:200]}")
            return False
    
    def log_test_result(self, test_name: str, success: bool, details: str = "", data: dict = None):
        """Enregistrer le résultat d'un test"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅" if success else "❌"
        print(f"{status} {test_name}: {details}")
        if data and not success:
            print(f"   📄 Data: {json.dumps(data, indent=2)[:200]}...")
    
    def test_get_modeles_inspection(self):
        """Test 1: GET /api/shefford/apria/modeles-inspection - Liste des modèles"""
        print(f"\n🧪 Test 1: Récupération des modèles d'inspection APRIA")
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/modeles-inspection"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                modeles = response.json()
                self.test_data["modeles_inspection"] = modeles
                
                self.log_test_result(
                    "Get Modeles Inspection", 
                    True, 
                    f"{len(modeles)} modèles trouvés"
                )
                
                # Afficher les modèles trouvés
                if modeles:
                    print(f"   📋 Modèles trouvés:")
                    for modele in modeles:
                        print(f"      - {modele.get('nom', 'N/A')} (ID: {modele.get('id', 'N/A')}) - Actif: {modele.get('actif', False)}")
                else:
                    print(f"   📋 Aucun modèle trouvé (normal pour première utilisation)")
                
                return True
            else:
                self.log_test_result(
                    "Get Modeles Inspection", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Get Modeles Inspection", False, f"Exception: {str(e)}")
            return False
    
    def test_get_modele_actif(self):
        """Test 2: GET /api/shefford/apria/modeles-inspection/actif - Modèle actif"""
        print(f"\n🧪 Test 2: Récupération du modèle d'inspection actif")
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/modeles-inspection/actif"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                modele_actif = response.json()
                self.test_data["modele_actif"] = modele_actif
                
                # Vérifier que le modèle a 13 éléments d'inspection
                elements = modele_actif.get('elements_inspection', [])
                
                if len(elements) == 13:
                    self.log_test_result(
                        "Get Modele Actif - Elements Count", 
                        True, 
                        f"Modèle actif avec 13 éléments d'inspection comme attendu"
                    )
                else:
                    self.log_test_result(
                        "Get Modele Actif - Elements Count", 
                        False, 
                        f"Attendu: 13 éléments, Trouvé: {len(elements)}"
                    )
                
                # Vérifier la structure du modèle
                required_fields = ['id', 'nom', 'elements_inspection', 'actif']
                missing_fields = [field for field in required_fields if field not in modele_actif]
                
                if not missing_fields:
                    self.log_test_result(
                        "Get Modele Actif - Structure", 
                        True, 
                        "Structure du modèle correcte"
                    )
                else:
                    self.log_test_result(
                        "Get Modele Actif - Structure", 
                        False, 
                        f"Champs manquants: {missing_fields}"
                    )
                
                print(f"   📋 Modèle actif: {modele_actif.get('nom', 'N/A')}")
                print(f"   📊 Éléments d'inspection: {len(elements)}")
                if elements:
                    print(f"   📝 Premiers éléments:")
                    for i, element in enumerate(elements[:5]):
                        print(f"      {i+1}. {element.get('nom', 'N/A')} - {element.get('description', 'N/A')}")
                    if len(elements) > 5:
                        print(f"      ... et {len(elements) - 5} autres")
                
                return True
            else:
                self.log_test_result(
                    "Get Modele Actif", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Get Modele Actif", False, f"Exception: {str(e)}")
            return False
    
    def test_get_equipements_apria(self):
        """Test 3: GET /api/shefford/apria/equipements - Équipements APRIA"""
        print(f"\n🧪 Test 3: Récupération des équipements APRIA")
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/equipements"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                equipements = response.json()
                self.test_data["equipements_apria"] = equipements
                
                self.log_test_result(
                    "Get Equipements APRIA", 
                    True, 
                    f"{len(equipements)} équipements APRIA trouvés"
                )
                
                # Afficher les équipements trouvés
                if equipements:
                    print(f"   📋 Équipements APRIA trouvés:")
                    for eq in equipements:
                        print(f"      - {eq.get('code_unique', 'N/A')} - {eq.get('nom', 'N/A')} (État: {eq.get('etat', 'N/A')})")
                        if eq.get('employe_nom'):
                            print(f"        Assigné à: {eq.get('employe_nom')}")
                else:
                    print(f"   📋 Aucun équipement APRIA trouvé")
                
                return True
            else:
                self.log_test_result(
                    "Get Equipements APRIA", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Get Equipements APRIA", False, f"Exception: {str(e)}")
            return False
    
    def test_create_inspection_apria(self):
        """Test 4: POST /api/shefford/apria/inspections - Créer une inspection"""
        print(f"\n🧪 Test 4: Création d'une inspection APRIA")
        
        # Vérifier qu'on a des équipements APRIA
        if not self.test_data["equipements_apria"]:
            self.log_test_result(
                "Create Inspection APRIA", 
                False, 
                "Aucun équipement APRIA disponible pour créer une inspection"
            )
            return False
        
        # Utiliser le premier équipement APRIA
        equipement = self.test_data["equipements_apria"][0]
        equipement_id = equipement.get('id')
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/inspections"
        
        # Données d'inspection selon la spécification
        inspection_data = {
            "equipement_id": equipement_id,
            "type_inspection": "mensuelle",
            "inspecteur_id": self.test_data["user_id"],
            "date_inspection": "2024-12-26T12:00:00Z",
            "elements": {
                "item_1": "Conforme",
                "item_2": "Conforme"
            },
            "pression_cylindre": 4500,
            "conforme": True,
            "remarques": "Test inspection"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code == 200:
                inspection_creee = response.json()
                inspection_id = inspection_creee.get('id')
                
                self.test_data["inspections_creees"].append(inspection_id)
                self.created_items.append(('inspection', inspection_id))
                
                self.log_test_result(
                    "Create Inspection APRIA", 
                    True, 
                    f"Inspection créée avec ID: {inspection_id}"
                )
                
                # Vérifier l'intégrité des données
                if inspection_creee.get('equipement_id') == equipement_id:
                    self.log_test_result(
                        "Create Inspection APRIA - Data Integrity", 
                        True, 
                        "Données d'inspection sauvegardées correctement"
                    )
                else:
                    self.log_test_result(
                        "Create Inspection APRIA - Data Integrity", 
                        False, 
                        f"Équipement ID incorrect: attendu {equipement_id}, reçu {inspection_creee.get('equipement_id')}"
                    )
                
                # Vérifier les éléments d'inspection
                elements_sauvegardes = inspection_creee.get('elements', {})
                if elements_sauvegardes.get('item_1') == 'Conforme' and elements_sauvegardes.get('item_2') == 'Conforme':
                    self.log_test_result(
                        "Create Inspection APRIA - Elements", 
                        True, 
                        "Éléments d'inspection sauvegardés correctement"
                    )
                else:
                    self.log_test_result(
                        "Create Inspection APRIA - Elements", 
                        False, 
                        f"Éléments incorrects: {elements_sauvegardes}"
                    )
                
                print(f"   📋 Inspection créée pour équipement: {equipement.get('code_unique', 'N/A')}")
                print(f"   📊 Type: {inspection_creee.get('type_inspection', 'N/A')}")
                print(f"   📅 Date: {inspection_creee.get('date_inspection', 'N/A')}")
                print(f"   ✅ Conforme: {inspection_creee.get('conforme', 'N/A')}")
                
                return True
            else:
                self.log_test_result(
                    "Create Inspection APRIA", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Create Inspection APRIA", False, f"Exception: {str(e)}")
            return False
    
    def test_get_inspections_apria(self):
        """Test 5: GET /api/shefford/apria/inspections - Récupérer les inspections"""
        print(f"\n🧪 Test 5: Récupération des inspections APRIA")
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/inspections"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                inspections = response.json()
                
                self.log_test_result(
                    "Get Inspections APRIA", 
                    True, 
                    f"{len(inspections)} inspections trouvées"
                )
                
                # Vérifier qu'on retrouve l'inspection créée
                if self.test_data["inspections_creees"]:
                    inspection_id_creee = self.test_data["inspections_creees"][0]
                    inspection_trouvee = next((insp for insp in inspections if insp.get('id') == inspection_id_creee), None)
                    
                    if inspection_trouvee:
                        self.log_test_result(
                            "Get Inspections APRIA - Created Found", 
                            True, 
                            "Inspection créée retrouvée dans la liste"
                        )
                    else:
                        self.log_test_result(
                            "Get Inspections APRIA - Created Found", 
                            False, 
                            "Inspection créée non trouvée dans la liste"
                        )
                
                # Afficher les inspections trouvées
                if inspections:
                    print(f"   📋 Inspections trouvées:")
                    for insp in inspections[:5]:  # Afficher les 5 premières
                        print(f"      - ID: {insp.get('id', 'N/A')} - Type: {insp.get('type_inspection', 'N/A')} - Date: {insp.get('date_inspection', 'N/A')}")
                        print(f"        Conforme: {insp.get('conforme', 'N/A')} - Équipement: {insp.get('equipement_id', 'N/A')}")
                    if len(inspections) > 5:
                        print(f"      ... et {len(inspections) - 5} autres")
                else:
                    print(f"   📋 Aucune inspection trouvée")
                
                return True
            else:
                self.log_test_result(
                    "Get Inspections APRIA", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Get Inspections APRIA", False, f"Exception: {str(e)}")
            return False
    
    def test_get_parametres_apria(self):
        """Test 6: GET /api/shefford/apria/parametres - Paramètres APRIA"""
        print(f"\n🧪 Test 6: Récupération des paramètres APRIA")
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/parametres"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                parametres = response.json()
                
                self.log_test_result(
                    "Get Parametres APRIA", 
                    True, 
                    "Paramètres APRIA récupérés avec succès"
                )
                
                # Vérifier la structure des paramètres
                if 'contacts_alertes' in parametres:
                    self.log_test_result(
                        "Get Parametres APRIA - Structure", 
                        True, 
                        "Structure des paramètres correcte (contacts_alertes présent)"
                    )
                else:
                    self.log_test_result(
                        "Get Parametres APRIA - Structure", 
                        False, 
                        "Champ contacts_alertes manquant"
                    )
                
                print(f"   📋 Paramètres APRIA:")
                print(f"      - Contacts alertes: {parametres.get('contacts_alertes', [])}")
                
                return True
            else:
                self.log_test_result(
                    "Get Parametres APRIA", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Get Parametres APRIA", False, f"Exception: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Nettoyer les données créées pendant les tests"""
        print(f"\n🧹 Nettoyage des données de test...")
        
        for item_type, item_id in reversed(self.created_items):
            try:
                if item_type == 'inspection':
                    # Note: Il n'y a pas d'endpoint DELETE pour les inspections dans l'implémentation actuelle
                    # On laisse les inspections de test en place
                    print(f"   ℹ️ Inspection {item_id} laissée en place (pas d'endpoint DELETE)")
                    continue
                
            except Exception as e:
                print(f"   ❌ Erreur suppression {item_type} {item_id}: {str(e)}")
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - MODULE APRIA INSPECTION")
        print("="*80)
        
        print(f"🏢 Tenant testé: {self.tenant_slug}")
        print(f"👤 Utilisateur: {self.credentials['email']}")
        print(f"🌐 URL Backend: {self.base_url}")
        print(f"📅 Date du test: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Compter les succès et échecs
        successful_tests = sum(1 for result in self.test_results if result['success'])
        total_tests = len(self.test_results)
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\n📈 RÉSULTATS GLOBAUX:")
        print(f"   ✅ Tests réussis: {successful_tests}/{total_tests} ({success_rate:.1f}%)")
        
        print(f"\n📋 DÉTAIL DES TESTS:")
        
        # Grouper par catégorie
        categories = {
            "Authentification": [],
            "Modèles d'inspection": [],
            "Équipements APRIA": [],
            "Inspections": [],
            "Paramètres": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'auth' in test_name.lower() or 'login' in test_name.lower():
                categories["Authentification"].append(result)
            elif 'modele' in test_name.lower():
                categories["Modèles d'inspection"].append(result)
            elif 'equipement' in test_name.lower():
                categories["Équipements APRIA"].append(result)
            elif 'inspection' in test_name.lower():
                categories["Inspections"].append(result)
            elif 'parametre' in test_name.lower():
                categories["Paramètres"].append(result)
        
        for category, tests in categories.items():
            if tests:
                print(f"\n🔸 {category}:")
                for test in tests:
                    status = "✅" if test['success'] else "❌"
                    print(f"   {status} {test['test']}: {test['details']}")
        
        # Résumé des fonctionnalités critiques
        print(f"\n🎯 FONCTIONNALITÉS CRITIQUES:")
        
        critical_tests = [
            ("Authentification", any("auth" in r['test'].lower() for r in self.test_results if r['success'])),
            ("Modèles d'inspection (récupération)", any("Get Modeles" in r['test'] and r['success'] for r in self.test_results)),
            ("Modèle actif avec 13 éléments", any("Elements Count" in r['test'] and r['success'] for r in self.test_results)),
            ("Équipements APRIA", any("Get Equipements APRIA" in r['test'] and r['success'] for r in self.test_results)),
            ("Création d'inspection", any("Create Inspection" in r['test'] and "Data Integrity" not in r['test'] and r['success'] for r in self.test_results)),
            ("Récupération des inspections", any("Get Inspections APRIA" in r['test'] and "Created Found" not in r['test'] and r['success'] for r in self.test_results)),
            ("Paramètres APRIA", any("Get Parametres" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Le module APRIA Inspection fonctionne parfaitement.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests du module APRIA Inspection"""
        print("🚀 DÉBUT DES TESTS COMPLETS - MODULE APRIA INSPECTION")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester tous les endpoints du module APRIA")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        try:
            # 2. Tests des modèles d'inspection
            self.test_get_modeles_inspection()
            self.test_get_modele_actif()
            
            # 3. Tests des équipements APRIA
            self.test_get_equipements_apria()
            
            # 4. Tests des inspections
            self.test_create_inspection_apria()
            self.test_get_inspections_apria()
            
            # 5. Tests des paramètres
            self.test_get_parametres_apria()
            
            # 6. Nettoyage
            self.cleanup_test_data()
            
            # 7. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = APRIAModuleTester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()