#!/usr/bin/env python3
"""
TEST COMPLET DU MODULE "MES EPI" AVEC INTÉGRATION MASQUE APRIA

CONTEXTE:
Test du module "Mes EPI" (My PPE - Personal Protective Equipment) qui affiche:
1. Les EPI réguliers assignés à l'utilisateur (collection db.epis)
2. Les masques APRIA assignés à l'utilisateur (collection db.equipements avec employe_id)

TENANT: shefford
CREDENTIALS: email: test@shefford.ca, mot_de_passe: Test123!

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification

2. **Module Mes EPI:**
   - GET /api/shefford/mes-epi/masque-apria - Retourne le masque APRIA assigné à l'utilisateur
   - GET /api/shefford/mes-epi - Retourne les EPI réguliers assignés

3. **Inspections APRIA:**
   - POST /api/shefford/apria/inspections - Créer une inspection APRIA
   - GET /api/shefford/apria/equipements/{equipement_id}/historique - Historique des inspections

SCÉNARIO DE TEST:
1. Login en tant qu'admin (test@shefford.ca / Test123!) sur tenant "shefford"
2. Test GET /api/shefford/mes-epi/masque-apria - devrait retourner 404 (pas de masque assigné)
3. Créer un équipement de test (masque APRIA) assigné à l'utilisateur admin
4. Test GET /api/shefford/mes-epi/masque-apria - devrait retourner le masque
5. Créer une inspection APRIA pour ce masque
6. Vérifier que l'inspection apparaît dans l'historique

RÉSULTATS ATTENDUS:
- Tous les endpoints doivent fonctionner correctement
- Le masque APRIA doit être correctement assigné et récupéré
- Les inspections doivent être créées et apparaître dans l'historique
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class MesEPIModuleTester:
    def __init__(self):
        self.base_url = "https://fire-inspector-5.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        self.credentials = {"email": "test@shefford.ca", "mot_de_passe": "Test123!"}
        
        # Résultats des tests
        self.test_results = []
        self.created_items = []  # Pour nettoyer après les tests
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "user_id": None,
            "masque_apria_id": None,
            "epis_reguliers": [],
            "inspections_creees": [],
            "equipement_cree": None
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
    
    def test_mes_epi_masque_apria_no_mask(self):
        """Test 1: GET /api/shefford/mes-epi/masque-apria - Aucun masque assigné (404 attendu)"""
        print(f"\n🧪 Test 1: Récupération masque APRIA (aucun assigné - 404 attendu)")
        
        url = f"{self.base_url}/{self.tenant_slug}/mes-epi/masque-apria"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 404:
                self.log_test_result(
                    "Mes EPI - Masque APRIA (No Mask)", 
                    True, 
                    "404 retourné correctement - aucun masque assigné"
                )
                return True
            else:
                self.log_test_result(
                    "Mes EPI - Masque APRIA (No Mask)", 
                    False, 
                    f"Attendu 404, reçu {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Mes EPI - Masque APRIA (No Mask)", False, f"Exception: {str(e)}")
            return False
    
    def test_create_test_apria_mask(self):
        """Test 2: Créer un équipement masque APRIA de test assigné à l'utilisateur"""
        print(f"\n🧪 Test 2: Création d'un masque APRIA de test")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        # Données pour créer un masque APRIA
        equipement_data = {
            "code_unique": f"MASK-TEST-{int(time.time())}",
            "nom": "Masque APRIA Test",
            "description": "Masque facial APRIA pour tests automatisés",
            "categorie_nom": "Masques APRIA",
            "etat": "en_service",
            "employe_id": self.test_data["user_id"],  # Assigner à l'utilisateur connecté
            "date_acquisition": "2024-01-01",
            "localisation": "Caserne Test"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=equipement_data)
            
            if response.status_code == 200:
                equipement_cree = response.json()
                equipement_id = equipement_cree.get('id')
                
                self.test_data["equipement_cree"] = equipement_cree
                self.test_data["masque_apria_id"] = equipement_id
                self.created_items.append(('equipement', equipement_id))
                
                self.log_test_result(
                    "Create Test APRIA Mask", 
                    True, 
                    f"Masque APRIA créé avec ID: {equipement_id}"
                )
                
                print(f"   📋 Masque créé: {equipement_data['code_unique']}")
                print(f"   👤 Assigné à l'utilisateur: {self.test_data['user_id']}")
                print(f"   🆔 ID équipement: {equipement_id}")
                
                return True
            else:
                self.log_test_result(
                    "Create Test APRIA Mask", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Create Test APRIA Mask", False, f"Exception: {str(e)}")
            return False
    
    def test_mes_epi_masque_apria_with_mask(self):
        """Test 3: GET /api/shefford/mes-epi/masque-apria - Avec masque assigné"""
        print(f"\n🧪 Test 3: Récupération masque APRIA (avec masque assigné)")
        
        url = f"{self.base_url}/{self.tenant_slug}/mes-epi/masque-apria"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                masque_data = response.json()
                
                # Vérifier que c'est bien notre masque de test
                if masque_data.get('id') == self.test_data["masque_apria_id"]:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA (With Mask)", 
                        True, 
                        "Masque APRIA récupéré correctement"
                    )
                else:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA (With Mask)", 
                        False, 
                        f"Masque incorrect: attendu {self.test_data['masque_apria_id']}, reçu {masque_data.get('id')}"
                    )
                
                # Vérifier la structure de la réponse
                required_fields = ['id', 'code_unique', 'nom', 'employe_id']
                missing_fields = [field for field in required_fields if field not in masque_data]
                
                if not missing_fields:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA Structure", 
                        True, 
                        "Structure de réponse correcte"
                    )
                else:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA Structure", 
                        False, 
                        f"Champs manquants: {missing_fields}"
                    )
                
                print(f"   📋 Masque trouvé: {masque_data.get('code_unique', 'N/A')}")
                print(f"   📝 Nom: {masque_data.get('nom', 'N/A')}")
                print(f"   👤 Assigné à: {masque_data.get('employe_id', 'N/A')}")
                print(f"   🔍 Dernière inspection: {masque_data.get('derniere_inspection_apria', 'Aucune')}")
                
                return True
            else:
                self.log_test_result(
                    "Mes EPI - Masque APRIA (With Mask)", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Mes EPI - Masque APRIA (With Mask)", False, f"Exception: {str(e)}")
            return False
    
    def test_mes_epi_reguliers(self):
        """Test 4: GET /api/shefford/mes-epi - EPI réguliers"""
        print(f"\n🧪 Test 4: Récupération des EPI réguliers")
        
        url = f"{self.base_url}/{self.tenant_slug}/mes-epi"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                epis = response.json()
                self.test_data["epis_reguliers"] = epis
                
                self.log_test_result(
                    "Mes EPI - EPI Réguliers", 
                    True, 
                    f"{len(epis)} EPI réguliers trouvés"
                )
                
                # Afficher les EPI trouvés
                if epis:
                    print(f"   📋 EPI réguliers trouvés:")
                    for epi in epis:
                        print(f"      - {epi.get('nom', 'N/A')} (ID: {epi.get('id', 'N/A')})")
                        if epi.get('derniere_inspection'):
                            print(f"        Dernière inspection: {epi['derniere_inspection'].get('date_inspection', 'N/A')}")
                else:
                    print(f"   📋 Aucun EPI régulier trouvé (normal si pas d'EPI assignés)")
                
                return True
            else:
                self.log_test_result(
                    "Mes EPI - EPI Réguliers", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Mes EPI - EPI Réguliers", False, f"Exception: {str(e)}")
            return False
    
    def test_create_apria_inspection(self):
        """Test 5: POST /api/shefford/apria/inspections - Créer une inspection APRIA"""
        print(f"\n🧪 Test 5: Création d'une inspection APRIA")
        
        if not self.test_data["masque_apria_id"]:
            self.log_test_result(
                "Create APRIA Inspection", 
                False, 
                "Aucun masque APRIA disponible pour créer une inspection"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/inspections"
        
        # Données d'inspection selon la spécification
        inspection_data = {
            "equipement_id": self.test_data["masque_apria_id"],
            "type_inspection": "mensuelle",
            "inspecteur_id": self.test_data["user_id"],
            "date_inspection": "2024-12-26T12:00:00Z",
            "elements": {
                "masque_facial": "Conforme",
                "soupapes": "Conforme",
                "sangles": "Conforme"
            },
            "pression_cylindre": 4500,
            "conforme": True,
            "remarques": "Inspection test automatisée - Mes EPI module"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code == 200:
                inspection_creee = response.json()
                inspection_id = inspection_creee.get('id')
                
                self.test_data["inspections_creees"].append(inspection_id)
                self.created_items.append(('inspection', inspection_id))
                
                self.log_test_result(
                    "Create APRIA Inspection", 
                    True, 
                    f"Inspection APRIA créée avec ID: {inspection_id}"
                )
                
                print(f"   📋 Inspection créée pour masque: {self.test_data['masque_apria_id']}")
                print(f"   📊 Type: mensuelle")
                print(f"   📅 Date: 2024-12-26T12:00:00Z")
                print(f"   ✅ Conforme: True")
                print(f"   🆔 ID inspection: {inspection_id}")
                
                return True
            else:
                self.log_test_result(
                    "Create APRIA Inspection", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Create APRIA Inspection", False, f"Exception: {str(e)}")
            return False
    
    def test_apria_inspection_history(self):
        """Test 6: GET /api/shefford/apria/equipements/{equipement_id}/historique - Historique des inspections"""
        print(f"\n🧪 Test 6: Récupération de l'historique des inspections APRIA")
        
        if not self.test_data["masque_apria_id"]:
            self.log_test_result(
                "APRIA Inspection History", 
                False, 
                "Aucun masque APRIA disponible pour récupérer l'historique"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/equipements/{self.test_data['masque_apria_id']}/historique"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                historique = response.json()
                
                self.log_test_result(
                    "APRIA Inspection History", 
                    True, 
                    f"{len(historique)} inspections dans l'historique"
                )
                
                # Vérifier qu'on retrouve l'inspection créée
                if self.test_data["inspections_creees"]:
                    inspection_id_creee = self.test_data["inspections_creees"][0]
                    inspection_trouvee = next((insp for insp in historique if insp.get('id') == inspection_id_creee), None)
                    
                    if inspection_trouvee:
                        self.log_test_result(
                            "APRIA Inspection History - Created Found", 
                            True, 
                            "Inspection créée trouvée dans l'historique"
                        )
                    else:
                        self.log_test_result(
                            "APRIA Inspection History - Created Found", 
                            False, 
                            "Inspection créée non trouvée dans l'historique"
                        )
                
                # Afficher l'historique
                if historique:
                    print(f"   📋 Historique des inspections:")
                    for insp in historique:
                        print(f"      - ID: {insp.get('id', 'N/A')} - Type: {insp.get('type_inspection', 'N/A')}")
                        print(f"        Date: {insp.get('date_inspection', 'N/A')} - Conforme: {insp.get('conforme', 'N/A')}")
                        print(f"        Inspecteur: {insp.get('inspecteur_nom', 'N/A')}")
                else:
                    print(f"   📋 Aucune inspection dans l'historique")
                
                return True
            else:
                self.log_test_result(
                    "APRIA Inspection History", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("APRIA Inspection History", False, f"Exception: {str(e)}")
            return False
    
    def test_mes_epi_masque_apria_with_inspection(self):
        """Test 7: GET /api/shefford/mes-epi/masque-apria - Vérifier que la dernière inspection apparaît"""
        print(f"\n🧪 Test 7: Récupération masque APRIA avec dernière inspection")
        
        url = f"{self.base_url}/{self.tenant_slug}/mes-epi/masque-apria"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                masque_data = response.json()
                
                # Vérifier que la dernière inspection est présente
                derniere_inspection = masque_data.get('derniere_inspection_apria')
                
                if derniere_inspection:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA With Inspection", 
                        True, 
                        "Dernière inspection APRIA présente dans la réponse"
                    )
                    
                    # Vérifier que c'est notre inspection
                    if self.test_data["inspections_creees"] and derniere_inspection.get('id') in self.test_data["inspections_creees"]:
                        self.log_test_result(
                            "Mes EPI - Masque APRIA Inspection Match", 
                            True, 
                            "L'inspection retournée correspond à celle créée"
                        )
                    else:
                        self.log_test_result(
                            "Mes EPI - Masque APRIA Inspection Match", 
                            False, 
                            "L'inspection retournée ne correspond pas à celle créée"
                        )
                    
                    print(f"   📋 Dernière inspection trouvée:")
                    print(f"      - ID: {derniere_inspection.get('id', 'N/A')}")
                    print(f"      - Date: {derniere_inspection.get('date_inspection', 'N/A')}")
                    print(f"      - Conforme: {derniere_inspection.get('conforme', 'N/A')}")
                    print(f"      - Inspecteur: {derniere_inspection.get('inspecteur_nom', 'N/A')}")
                else:
                    self.log_test_result(
                        "Mes EPI - Masque APRIA With Inspection", 
                        False, 
                        "Aucune dernière inspection trouvée dans la réponse"
                    )
                
                return True
            else:
                self.log_test_result(
                    "Mes EPI - Masque APRIA With Inspection", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Mes EPI - Masque APRIA With Inspection", False, f"Exception: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Nettoyer les données créées pendant les tests"""
        print(f"\n🧹 Nettoyage des données de test...")
        
        for item_type, item_id in reversed(self.created_items):
            try:
                if item_type == 'equipement':
                    # Supprimer l'équipement de test
                    url = f"{self.base_url}/{self.tenant_slug}/equipements/{item_id}"
                    response = requests.delete(url, headers=self.headers)
                    if response.status_code == 200:
                        print(f"   ✅ Équipement {item_id} supprimé")
                    else:
                        print(f"   ⚠️ Impossible de supprimer l'équipement {item_id}: {response.status_code}")
                elif item_type == 'inspection':
                    # Note: Il n'y a pas d'endpoint DELETE pour les inspections dans l'implémentation actuelle
                    # On laisse les inspections de test en place
                    print(f"   ℹ️ Inspection {item_id} laissée en place (pas d'endpoint DELETE)")
                    continue
                
            except Exception as e:
                print(f"   ❌ Erreur suppression {item_type} {item_id}: {str(e)}")
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - MODULE MES EPI AVEC MASQUE APRIA")
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
            "Mes EPI - Masque APRIA": [],
            "Mes EPI - EPI Réguliers": [],
            "Inspections APRIA": [],
            "Historique": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'auth' in test_name.lower() or 'login' in test_name.lower():
                categories["Authentification"].append(result)
            elif 'masque' in test_name.lower() and 'apria' in test_name.lower():
                categories["Mes EPI - Masque APRIA"].append(result)
            elif 'epi' in test_name.lower() and 'regulier' in test_name.lower():
                categories["Mes EPI - EPI Réguliers"].append(result)
            elif 'inspection' in test_name.lower():
                categories["Inspections APRIA"].append(result)
            elif 'history' in test_name.lower() or 'historique' in test_name.lower():
                categories["Historique"].append(result)
        
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
            ("Masque APRIA - 404 sans assignation", any("No Mask" in r['test'] and r['success'] for r in self.test_results)),
            ("Création masque APRIA test", any("Create Test APRIA Mask" in r['test'] and r['success'] for r in self.test_results)),
            ("Masque APRIA - récupération avec assignation", any("With Mask" in r['test'] and "Inspection" not in r['test'] and r['success'] for r in self.test_results)),
            ("EPI réguliers", any("EPI Réguliers" in r['test'] and r['success'] for r in self.test_results)),
            ("Création inspection APRIA", any("Create APRIA Inspection" in r['test'] and r['success'] for r in self.test_results)),
            ("Historique inspections", any("History" in r['test'] and r['success'] for r in self.test_results)),
            ("Masque avec dernière inspection", any("With Inspection" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Le module Mes EPI avec intégration APRIA fonctionne parfaitement.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests du module Mes EPI avec APRIA"""
        print("🚀 DÉBUT DES TESTS COMPLETS - MODULE MES EPI AVEC MASQUE APRIA")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester le module Mes EPI avec intégration masque APRIA")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        try:
            # 2. Test masque APRIA sans assignation (404 attendu)
            self.test_mes_epi_masque_apria_no_mask()
            
            # 3. Créer un masque APRIA de test
            self.test_create_test_apria_mask()
            
            # 4. Test masque APRIA avec assignation
            self.test_mes_epi_masque_apria_with_mask()
            
            # 5. Test EPI réguliers
            self.test_mes_epi_reguliers()
            
            # 6. Créer une inspection APRIA
            self.test_create_apria_inspection()
            
            # 7. Test historique des inspections
            self.test_apria_inspection_history()
            
            # 8. Test masque APRIA avec dernière inspection
            self.test_mes_epi_masque_apria_with_inspection()
            
            # 9. Nettoyage
            self.cleanup_test_data()
            
            # 10. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = MesEPIModuleTester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()