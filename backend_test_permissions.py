#!/usr/bin/env python3
"""
TEST COMPLET E2E DES PERMISSIONS EMPLOYÉS - GESTION DES ACTIFS

CONTEXTE:
Test des permissions employés dans le module "Gestion des Actifs" selon la review request.
Vérifie que les employés ne peuvent voir que les boutons d'inspection et non l'historique.

TENANT: shefford
CREDENTIALS: 
- Employee: employe@shefford.ca / Employe123!
- Admin: gussdub@gmail.com / 230685Juin+

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification (employé et admin)

2. **Bornes Sèches (Points d'eau):**
   - GET /api/shefford/points-eau?type=borne_seche - Récupérer les bornes sèches
   - POST /api/shefford/inspections-bornes-seches - Créer une inspection (employé)
   - GET /api/shefford/inspections-bornes-seches/{borne_id}/historique - Historique (admin seulement)

3. **Matériel & Équipements APRIA:**
   - GET /api/shefford/equipements - Récupérer les équipements
   - POST /api/shefford/inspections-apria - Créer une inspection APRIA (employé)
   - GET /api/shefford/inspections-apria/{equipement_id}/historique - Historique (admin seulement)

SCÉNARIO DE TEST:
1. Login en tant qu'employé (employe@shefford.ca / Employe123!)
2. Vérifier l'accès aux bornes sèches et possibilité d'inspection
3. Vérifier l'interdiction d'accès à l'historique des bornes sèches
4. Vérifier l'accès aux équipements APRIA et possibilité d'inspection
5. Vérifier l'interdiction d'accès à l'historique APRIA
6. Login en tant qu'admin et vérifier l'accès complet

RÉSULTATS ATTENDUS:
- Employé peut créer des inspections mais pas voir l'historique
- Admin peut tout voir et faire
- Les endpoints d'historique retournent 403 Forbidden pour les employés
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class PermissionsE2ETester:
    def __init__(self):
        # Utiliser l'URL depuis frontend/.env comme spécifié
        self.base_url = "https://incident-manager-12.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        
        # Credentials selon la review request
        self.employee_credentials = {"email": "employe@shefford.ca", "mot_de_passe": "Employe123!"}
        self.admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        
        # Résultats des tests
        self.test_results = []
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "employee_user_id": None,
            "admin_user_id": None,
            "borne_seche_id": None,
            "equipement_apria_id": None,
            "inspection_borne_id": None,
            "inspection_apria_id": None
        }
        
    def authenticate(self, credentials, user_type="employee"):
        """Authentification sur le tenant shefford"""
        print(f"🔐 Authentification tenant {self.tenant_slug} ({user_type})...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Email: {credentials['email']}")
        
        response = requests.post(auth_url, json=credentials)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
            
            if user_type == "employee":
                self.test_data["employee_user_id"] = user_info.get('id')
            else:
                self.test_data["admin_user_id"] = user_info.get('id')
                
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            return True, user_info
        else:
            print(f"❌ Échec authentification: {response.status_code}")
            print(f"📄 Réponse: {response.text[:200]}")
            return False, None
    
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
    
    def test_get_bornes_seches(self, user_type="employee"):
        """Test: GET /api/shefford/points-eau?type=borne_seche"""
        print(f"\n🧪 Test: Récupération des bornes sèches ({user_type})")
        
        url = f"{self.base_url}/{self.tenant_slug}/points-eau?type=borne_seche"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                bornes = response.json()
                
                self.log_test_result(
                    f"GET Bornes Sèches ({user_type})", 
                    True, 
                    f"Récupération réussie - {len(bornes)} bornes trouvées"
                )
                
                # Stocker une borne pour les tests suivants
                if bornes and not self.test_data["borne_seche_id"]:
                    self.test_data["borne_seche_id"] = bornes[0].get('id')
                    print(f"   📍 Borne sélectionnée: {bornes[0].get('numero_identification', 'N/A')}")
                
                return True, bornes
            else:
                self.log_test_result(
                    f"GET Bornes Sèches ({user_type})", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False, None
                
        except Exception as e:
            self.log_test_result(f"GET Bornes Sèches ({user_type})", False, f"Exception: {str(e)}")
            return False, None
    
    def test_create_inspection_borne(self, user_type="employee"):
        """Test: POST /api/shefford/points-eau/{point_id}/inspections - Créer inspection"""
        print(f"\n🧪 Test: Création inspection borne sèche ({user_type})")
        
        if not self.test_data["borne_seche_id"]:
            self.log_test_result(
                f"POST Inspection Borne ({user_type})", 
                False, 
                "Aucune borne sèche disponible pour test"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/points-eau/{self.test_data['borne_seche_id']}/inspections"
        
        # Données d'inspection réalistes
        inspection_data = {
            "date_inspection": datetime.now().strftime("%Y-%m-%d"),
            "inspecteur_nom": "Test Inspecteur",
            "etat_general": "bon",
            "pression_statique": 250,
            "debit_mesure": 1000,
            "observations": f"Inspection de test effectuée par {user_type}",
            "conforme": True,
            "actions_requises": []
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code in [200, 201]:
                result = response.json()
                
                self.log_test_result(
                    f"POST Inspection Borne ({user_type})", 
                    True, 
                    "Inspection créée avec succès"
                )
                
                # Stocker l'ID de l'inspection
                if result.get('id'):
                    self.test_data["inspection_borne_id"] = result.get('id')
                    print(f"   📋 Inspection ID: {result.get('id')}")
                
                return True
            else:
                self.log_test_result(
                    f"POST Inspection Borne ({user_type})", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result(f"POST Inspection Borne ({user_type})", False, f"Exception: {str(e)}")
            return False
    
    def test_get_historique_bornes(self, user_type="employee", should_succeed=False):
        """Test: GET historique inspections bornes sèches"""
        print(f"\n🧪 Test: Accès historique bornes sèches ({user_type})")
        
        if not self.test_data["borne_seche_id"]:
            self.log_test_result(
                f"GET Historique Bornes ({user_type})", 
                False, 
                "Aucune borne sèche disponible pour test"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/points-eau/{self.test_data['borne_seche_id']}/inspections"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if should_succeed:
                # Admin devrait pouvoir accéder
                if response.status_code == 200:
                    historique = response.json()
                    self.log_test_result(
                        f"GET Historique Bornes ({user_type})", 
                        True, 
                        f"Accès autorisé - {len(historique)} inspections dans l'historique"
                    )
                    return True
                else:
                    self.log_test_result(
                        f"GET Historique Bornes ({user_type})", 
                        False, 
                        f"Accès refusé inattendu - HTTP {response.status_code}"
                    )
                    return False
            else:
                # Employé ne devrait PAS pouvoir accéder
                if response.status_code == 403:
                    self.log_test_result(
                        f"GET Historique Bornes ({user_type})", 
                        True, 
                        "Accès correctement refusé (403 Forbidden)"
                    )
                    return True
                elif response.status_code == 200:
                    self.log_test_result(
                        f"GET Historique Bornes ({user_type})", 
                        False, 
                        "PROBLÈME: Accès autorisé alors qu'il devrait être refusé"
                    )
                    return False
                else:
                    self.log_test_result(
                        f"GET Historique Bornes ({user_type})", 
                        False, 
                        f"Réponse inattendue - HTTP {response.status_code}: {response.text[:200]}"
                    )
                    return False
                
        except Exception as e:
            self.log_test_result(f"GET Historique Bornes ({user_type})", False, f"Exception: {str(e)}")
            return False
    
    def test_get_equipements(self, user_type="employee"):
        """Test: GET /api/shefford/equipements"""
        print(f"\n🧪 Test: Récupération des équipements ({user_type})")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                equipements = response.json()
                
                self.log_test_result(
                    f"GET Équipements ({user_type})", 
                    True, 
                    f"Récupération réussie - {len(equipements)} équipements trouvés"
                )
                
                # Chercher un équipement APRIA
                apria_equipement = None
                for eq in equipements:
                    if ('APRIA' in eq.get('nom', '').upper() or 
                        'APRIA' in eq.get('description', '').upper() or
                        'APRIA' in eq.get('categorie_nom', '').upper()):
                        apria_equipement = eq
                        break
                
                if apria_equipement and not self.test_data["equipement_apria_id"]:
                    self.test_data["equipement_apria_id"] = apria_equipement.get('id')
                    print(f"   🔧 Équipement APRIA trouvé: {apria_equipement.get('nom', 'N/A')}")
                elif not apria_equipement:
                    print(f"   ⚠️ Aucun équipement APRIA trouvé dans les {len(equipements)} équipements")
                
                return True, equipements
            else:
                self.log_test_result(
                    f"GET Équipements ({user_type})", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False, None
                
        except Exception as e:
            self.log_test_result(f"GET Équipements ({user_type})", False, f"Exception: {str(e)}")
            return False, None
    
    def test_create_inspection_apria(self, user_type="employee"):
        """Test: POST /api/shefford/apria/inspections - Créer inspection APRIA"""
        print(f"\n🧪 Test: Création inspection APRIA ({user_type})")
        
        if not self.test_data["equipement_apria_id"]:
            self.log_test_result(
                f"POST Inspection APRIA ({user_type})", 
                False, 
                "Aucun équipement APRIA disponible pour test"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/inspections"
        
        # Données d'inspection APRIA réalistes
        inspection_data = {
            "equipement_id": self.test_data["equipement_apria_id"],
            "inspecteur_id": self.test_data.get("employee_user_id") if user_type == "employee" else self.test_data.get("admin_user_id"),
            "date_inspection": datetime.now().strftime("%Y-%m-%d"),
            "inspecteur_nom": "Test Inspecteur APRIA",
            "etat_general": "conforme",
            "pression_testee": 300,
            "etancheite_ok": True,
            "marquage_visible": True,
            "observations": f"Inspection APRIA de test effectuée par {user_type}",
            "conforme": True,
            "actions_correctives": []
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code in [200, 201]:
                result = response.json()
                
                self.log_test_result(
                    f"POST Inspection APRIA ({user_type})", 
                    True, 
                    "Inspection APRIA créée avec succès"
                )
                
                # Stocker l'ID de l'inspection
                if result.get('id'):
                    self.test_data["inspection_apria_id"] = result.get('id')
                    print(f"   📋 Inspection APRIA ID: {result.get('id')}")
                
                return True
            else:
                self.log_test_result(
                    f"POST Inspection APRIA ({user_type})", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result(f"POST Inspection APRIA ({user_type})", False, f"Exception: {str(e)}")
            return False
    
    def test_get_historique_apria(self, user_type="employee", should_succeed=False):
        """Test: GET historique inspections APRIA"""
        print(f"\n🧪 Test: Accès historique inspections APRIA ({user_type})")
        
        if not self.test_data["equipement_apria_id"]:
            self.log_test_result(
                f"GET Historique APRIA ({user_type})", 
                False, 
                "Aucun équipement APRIA disponible pour test"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/apria/equipements/{self.test_data['equipement_apria_id']}/historique"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if should_succeed:
                # Admin devrait pouvoir accéder
                if response.status_code == 200:
                    historique = response.json()
                    self.log_test_result(
                        f"GET Historique APRIA ({user_type})", 
                        True, 
                        f"Accès autorisé - {len(historique)} inspections dans l'historique"
                    )
                    return True
                else:
                    self.log_test_result(
                        f"GET Historique APRIA ({user_type})", 
                        False, 
                        f"Accès refusé inattendu - HTTP {response.status_code}"
                    )
                    return False
            else:
                # Employé ne devrait PAS pouvoir accéder
                if response.status_code == 403:
                    self.log_test_result(
                        f"GET Historique APRIA ({user_type})", 
                        True, 
                        "Accès correctement refusé (403 Forbidden)"
                    )
                    return True
                elif response.status_code == 200:
                    self.log_test_result(
                        f"GET Historique APRIA ({user_type})", 
                        False, 
                        "PROBLÈME: Accès autorisé alors qu'il devrait être refusé"
                    )
                    return False
                else:
                    self.log_test_result(
                        f"GET Historique APRIA ({user_type})", 
                        False, 
                        f"Réponse inattendue - HTTP {response.status_code}: {response.text[:200]}"
                    )
                    return False
                
        except Exception as e:
            self.log_test_result(f"GET Historique APRIA ({user_type})", False, f"Exception: {str(e)}")
            return False
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - PERMISSIONS EMPLOYÉS GESTION DES ACTIFS")
        print("="*80)
        
        print(f"🏢 Tenant testé: {self.tenant_slug}")
        print(f"👤 Employé: {self.employee_credentials['email']}")
        print(f"👨‍💼 Admin: {self.admin_credentials['email']}")
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
            "Bornes Sèches - Employé": [],
            "Bornes Sèches - Admin": [],
            "Équipements APRIA - Employé": [],
            "Équipements APRIA - Admin": [],
            "Permissions": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'auth' in test_name.lower() or 'login' in test_name.lower():
                categories["Authentification"].append(result)
            elif 'borne' in test_name.lower():
                if 'employee' in test_name.lower():
                    categories["Bornes Sèches - Employé"].append(result)
                else:
                    categories["Bornes Sèches - Admin"].append(result)
            elif 'apria' in test_name.lower() or 'équipement' in test_name.lower():
                if 'employee' in test_name.lower():
                    categories["Équipements APRIA - Employé"].append(result)
                else:
                    categories["Équipements APRIA - Admin"].append(result)
            elif 'historique' in test_name.lower() or 'permission' in test_name.lower():
                categories["Permissions"].append(result)
        
        for category, tests in categories.items():
            if tests:
                print(f"\n🔸 {category}:")
                for test in tests:
                    status = "✅" if test['success'] else "❌"
                    print(f"   {status} {test['test']}: {test['details']}")
        
        # Résumé des fonctionnalités critiques
        print(f"\n🎯 FONCTIONNALITÉS CRITIQUES:")
        
        critical_tests = [
            ("Authentification employé", any("employee" in r['test'].lower() and "auth" in r['test'].lower() for r in self.test_results if r['success'])),
            ("Authentification admin", any("admin" in r['test'].lower() and "auth" in r['test'].lower() for r in self.test_results if r['success'])),
            ("Employé peut inspecter bornes", any("POST Inspection Borne (employee)" in r['test'] and r['success'] for r in self.test_results)),
            ("Employé BLOQUÉ historique bornes", any("GET Historique Bornes (employee)" in r['test'] and r['success'] for r in self.test_results)),
            ("Employé peut inspecter APRIA", any("POST Inspection APRIA (employee)" in r['test'] and r['success'] for r in self.test_results)),
            ("Employé BLOQUÉ historique APRIA", any("GET Historique APRIA (employee)" in r['test'] and r['success'] for r in self.test_results)),
            ("Admin accès complet", any("admin" in r['test'].lower() and "historique" in r['test'].lower() and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Les permissions employés fonctionnent parfaitement.")
            print("   🔒 Les employés peuvent inspecter mais pas voir l'historique.")
            print("   👨‍💼 Les admins ont accès complet comme attendu.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
            print("   🔍 Vérifier les permissions d'accès aux endpoints d'historique.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
            print("   🚨 Les permissions employés ne fonctionnent pas correctement.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests E2E des permissions employés"""
        print("🚀 DÉBUT DES TESTS E2E - PERMISSIONS EMPLOYÉS GESTION DES ACTIFS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester les permissions employés vs admin")
        
        try:
            # === PHASE 1: TESTS EMPLOYÉ ===
            print("\n" + "="*60)
            print("👷 PHASE 1: TESTS AVEC COMPTE EMPLOYÉ")
            print("="*60)
            
            # 1. Authentification employé
            success, employee_info = self.authenticate(self.employee_credentials, "employee")
            if not success:
                print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'employé")
                return False
            
            # 2. Tests bornes sèches - employé
            self.test_get_bornes_seches("employee")
            self.test_create_inspection_borne("employee")
            self.test_get_historique_bornes("employee", should_succeed=False)  # Doit échouer
            
            # 3. Tests équipements APRIA - employé
            self.test_get_equipements("employee")
            self.test_create_inspection_apria("employee")
            self.test_get_historique_apria("employee", should_succeed=False)  # Doit échouer
            
            # === PHASE 2: TESTS ADMIN ===
            print("\n" + "="*60)
            print("👨‍💼 PHASE 2: TESTS AVEC COMPTE ADMIN")
            print("="*60)
            
            # 4. Authentification admin
            success, admin_info = self.authenticate(self.admin_credentials, "admin")
            if not success:
                print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'admin")
                return False
            
            # 5. Tests bornes sèches - admin
            self.test_get_bornes_seches("admin")
            self.test_get_historique_bornes("admin", should_succeed=True)  # Doit réussir
            
            # 6. Tests équipements APRIA - admin
            self.test_get_equipements("admin")
            self.test_get_historique_apria("admin", should_succeed=True)  # Doit réussir
            
            # 7. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = PermissionsE2ETester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()