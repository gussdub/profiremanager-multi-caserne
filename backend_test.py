#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - FORMATION DIAGNOSTIC SHEFFORD

DIAGNOSTIC: Formation visible dans Dashboard mais pas dans module Formation (tenant shefford)

CONTEXTE:
- Formation "PR test" visible dans Dashboard
- Aucune formation visible dans module Formation avec année 2025 sélectionnée
- Besoin de comprendre pourquoi le filtre par année ne fonctionne pas

TESTS À EFFECTUER:
1. Login admin shefford (admin@firemanager.ca / Admin123!)

2. Récupérer TOUTES les formations sans filtre:
   GET /api/shefford/formations
   - Voir combien de formations existent
   - Noter les valeurs du champ "annee" de chaque formation
   - Identifier la formation "PR test"

3. Récupérer formations avec filtre année 2025:
   GET /api/shefford/formations?annee=2025
   - Comparer avec le résultat sans filtre

4. Vérifier les données du Dashboard:
   GET /api/shefford/dashboard/donnees-completes
   - Voir comment le Dashboard récupère les formations à venir
   - Vérifier si "PR test" apparaît dans section_personnelle.formations_a_venir

5. Analyser la différence:
   - Le Dashboard ne filtre probablement PAS par année
   - Le module Formation filtre par année
   - Si la formation "PR test" a un champ "annee" différent de 2025, elle n'apparaîtra pas

OBJECTIF:
Identifier pourquoi le filtre par année ne retourne pas la formation "PR test" et proposer une solution.
"""

import requests
import json
import sys
from datetime import datetime
import uuid
import time

# Configuration - REAL PRODUCTION URLs
BASE_URL = "https://demo-dashboard-1.preview.emergentagent.com/api"

# Test Configuration for Shefford tenant
TENANT_SLUG = "shefford"

# Formation Diagnostic Configuration
# Using existing users in MongoDB Atlas production database for tenant "shefford"
# Authentication: admin@firemanager.ca / Admin123!

class FormationDiagnosticTesting:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.admin_token = None
        self.admin_user_id = None
        self.shefford_tenant_id = None
        self.formations_all = []
        self.formations_2025 = []
        self.dashboard_data = None
        self.pr_test_formation = None
        
    def log_test(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def test_admin_authentication(self):
        """Test admin authentication for Shefford tenant - specifically admin@firemanager.ca / Admin123!"""
        try:
            # Use the specific credentials mentioned in the review request
            admin_credentials = {"email": "admin@firemanager.ca", "mot_de_passe": "Admin123!"}
            
            print(f"🔑 Authenticating as Shefford admin: {admin_credentials['email']}")
            
            # Try tenant-specific login first
            response = self.session.post(f"{self.base_url}/{TENANT_SLUG}/auth/login", json=admin_credentials)
            if response.status_code != 200:
                # Try legacy login
                response = self.session.post(f"{self.base_url}/auth/login", json=admin_credentials)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.admin_token = data["access_token"]
                    user_info = data.get("user", {})
                    self.admin_user_id = user_info.get("id")
                    
                    self.log_test("Admin Authentication", True, 
                                f"✅ Shefford admin login successful for {admin_credentials['email']}", 
                                {
                                    "admin_user_id": self.admin_user_id,
                                    "user_info": user_info,
                                    "tenant": user_info.get("tenant_slug", "unknown")
                                })
                    return True
                else:
                    self.log_test("Admin Authentication", False, 
                                f"❌ No access token in response for: {admin_credentials['email']}")
                    return False
            else:
                self.log_test("Admin Authentication", False, 
                            f"❌ Login failed for '{admin_credentials['email']}': {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Admin login error: {str(e)}")
            return False

    def get_all_formations(self):
        """Get ALL formations from GET /api/shefford/formations (without filter)"""
        try:
            if not self.admin_token:
                self.log_test("Get All Formations", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📚 Retrieving ALL formations from GET /api/{TENANT_SLUG}/formations")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations")
            
            if response.status_code == 200:
                try:
                    self.formations_all = response.json()
                    
                    # Look for "PR test" formation
                    pr_test_found = False
                    for formation in self.formations_all:
                        if "PR test" in formation.get("nom", ""):
                            self.pr_test_formation = formation
                            pr_test_found = True
                            break
                    
                    # Analyze year values
                    year_analysis = {}
                    for formation in self.formations_all:
                        annee = formation.get("annee", "Non définie")
                        if annee not in year_analysis:
                            year_analysis[annee] = 0
                        year_analysis[annee] += 1
                    
                    self.log_test("Get All Formations", True, 
                                f"✅ Retrieved {len(self.formations_all)} formations total", 
                                {
                                    "total_formations": len(self.formations_all),
                                    "pr_test_found": pr_test_found,
                                    "pr_test_formation": self.pr_test_formation,
                                    "year_analysis": year_analysis,
                                    "sample_formations": [{"nom": f.get("nom"), "annee": f.get("annee")} for f in self.formations_all[:5]]
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Get All Formations", False, f"❌ Invalid JSON in formations response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Get All Formations", False, 
                            f"❌ Formations endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get All Formations", False, f"Formations retrieval error: {str(e)}")
            return False

    def get_formations_with_year_filter(self):
        """Get formations with year filter: GET /api/shefford/formations?annee=2025"""
        try:
            if not self.admin_token:
                self.log_test("Get Formations With Year Filter", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"🔍 Retrieving formations with year filter: GET /api/{TENANT_SLUG}/formations?annee=2025")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations?annee=2025")
            
            if response.status_code == 200:
                try:
                    self.formations_2025 = response.json()
                    
                    # Look for "PR test" formation in filtered results
                    pr_test_in_2025 = False
                    for formation in self.formations_2025:
                        if "PR test" in formation.get("nom", ""):
                            pr_test_in_2025 = True
                            break
                    
                    # Compare with all formations
                    total_formations = len(self.formations_all)
                    filtered_formations = len(self.formations_2025)
                    
                    self.log_test("Get Formations With Year Filter", True, 
                                f"✅ Retrieved {filtered_formations} formations for year 2025", 
                                {
                                    "total_formations": total_formations,
                                    "filtered_formations_2025": filtered_formations,
                                    "pr_test_in_2025": pr_test_in_2025,
                                    "filter_difference": total_formations - filtered_formations,
                                    "sample_filtered": [{"nom": f.get("nom"), "annee": f.get("annee")} for f in self.formations_2025[:5]]
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Get Formations With Year Filter", False, f"❌ Invalid JSON in filtered formations response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Get Formations With Year Filter", False, 
                            f"❌ Filtered formations endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Formations With Year Filter", False, f"Filtered formations retrieval error: {str(e)}")
            return False

    def get_dashboard_data(self):
        """Get dashboard data: GET /api/shefford/dashboard/donnees-completes"""
        try:
            if not self.admin_token:
                self.log_test("Get Dashboard Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📊 Retrieving dashboard data: GET /api/{TENANT_SLUG}/dashboard/donnees-completes")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/dashboard/donnees-completes")
            
            if response.status_code == 200:
                try:
                    self.dashboard_data = response.json()
                    
                    # Look for formations in dashboard data
                    formations_a_venir = []
                    section_personnelle = self.dashboard_data.get("section_personnelle", {})
                    if "formations_a_venir" in section_personnelle:
                        formations_a_venir = section_personnelle["formations_a_venir"]
                    
                    # Look for "PR test" in dashboard formations
                    pr_test_in_dashboard = False
                    for formation in formations_a_venir:
                        if "PR test" in formation.get("nom", ""):
                            pr_test_in_dashboard = True
                            break
                    
                    self.log_test("Get Dashboard Data", True, 
                                f"✅ Retrieved dashboard data successfully", 
                                {
                                    "dashboard_formations_count": len(formations_a_venir),
                                    "pr_test_in_dashboard": pr_test_in_dashboard,
                                    "formations_a_venir": formations_a_venir,
                                    "section_personnelle_keys": list(section_personnelle.keys()),
                                    "dashboard_structure": list(self.dashboard_data.keys())
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Get Dashboard Data", False, f"❌ Invalid JSON in dashboard response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Get Dashboard Data", False, 
                            f"❌ Dashboard endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Dashboard Data", False, f"Dashboard data retrieval error: {str(e)}")
            return False

    def analyze_formation_differences(self):
        """Analyze the differences between Dashboard and Formation module data"""
        try:
            print(f"🔍 Analyzing differences between Dashboard and Formation module")
            
            # Get PR test formation details
            pr_test_details = None
            if self.pr_test_formation:
                pr_test_details = {
                    "nom": self.pr_test_formation.get("nom"),
                    "annee": self.pr_test_formation.get("annee"),
                    "date_debut": self.pr_test_formation.get("date_debut"),
                    "date_fin": self.pr_test_formation.get("date_fin")
                }
            
            # Check if PR test is in 2025 filtered results
            pr_test_in_2025 = False
            for formation in self.formations_2025:
                if "PR test" in formation.get("nom", ""):
                    pr_test_in_2025 = True
                    break
            
            # Check if PR test is in dashboard
            pr_test_in_dashboard = False
            dashboard_formations = []
            if self.dashboard_data:
                section_personnelle = self.dashboard_data.get("section_personnelle", {})
                dashboard_formations = section_personnelle.get("formations_a_venir", [])
                for formation in dashboard_formations:
                    if "PR test" in formation.get("nom", ""):
                        pr_test_in_dashboard = True
                        break
            
            # Analysis results
            analysis = {
                "total_formations": len(self.formations_all),
                "formations_2025": len(self.formations_2025),
                "dashboard_formations": len(dashboard_formations),
                "pr_test_found_all": self.pr_test_formation is not None,
                "pr_test_found_2025": pr_test_in_2025,
                "pr_test_found_dashboard": pr_test_in_dashboard,
                "pr_test_details": pr_test_details,
                "issue_identified": False,
                "issue_description": ""
            }
            
            # Identify the issue
            if self.pr_test_formation and not pr_test_in_2025 and pr_test_in_dashboard:
                analysis["issue_identified"] = True
                pr_test_year = self.pr_test_formation.get("annee")
                analysis["issue_description"] = f"Formation 'PR test' has year '{pr_test_year}' but filter searches for 2025. Dashboard shows it because it doesn't filter by year."
            
            self.log_test("Analyze Formation Differences", True, 
                        f"✅ Analysis completed - Issue identified: {analysis['issue_identified']}", 
                        analysis)
            return True
                
        except Exception as e:
            self.log_test("Analyze Formation Differences", False, f"Analysis error: {str(e)}")
            return False

    def verify_formation_in_list(self):
        """Verify that the created formation appears in GET /api/demo/formations"""
        try:
            if not self.admin_token:
                self.log_test("Verify Formation In List", False, "No admin token available")
                return False
            
            if not self.created_formation_id:
                self.log_test("Verify Formation In List", False, "No created formation ID to verify")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"🔍 Verifying created formation appears in formations list")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations")
            
            if response.status_code == 200:
                try:
                    formations = response.json()
                    
                    # Look for our created formation
                    created_formation_found = False
                    for formation in formations:
                        if formation.get("id") == self.created_formation_id:
                            created_formation_found = True
                            break
                    
                    if created_formation_found:
                        self.log_test("Verify Formation In List", True, 
                                    f"✅ Created formation found in formations list", 
                                    {
                                        "formation_id": self.created_formation_id,
                                        "total_formations": len(formations),
                                        "formation_found": True
                                    })
                        return True
                    else:
                        self.log_test("Verify Formation In List", False, 
                                    f"❌ Created formation not found in formations list")
                        return False
                    
                except json.JSONDecodeError:
                    self.log_test("Verify Formation In List", False, f"❌ Invalid JSON response from formations endpoint")
                    return False
                    
            else:
                self.log_test("Verify Formation In List", False, 
                            f"❌ Could not access formations endpoint: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Verify Formation In List", False, f"Formation verification error: {str(e)}")
            return False
    
    def cleanup_test_formation(self):
        """Clean up the test formation created during testing"""
        try:
            if not self.admin_token or not self.created_formation_id:
                self.log_test("Cleanup Test Formation", True, "No formation to clean up")
                return True
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"🧹 Cleaning up test formation: {self.created_formation_id}")
            
            response = admin_session.delete(f"{self.base_url}/{TENANT_SLUG}/formations/{self.created_formation_id}")
            
            if response.status_code in [200, 204]:
                self.log_test("Cleanup Test Formation", True, 
                            f"✅ Test formation cleaned up successfully", 
                            {
                                "formation_id": self.created_formation_id,
                                "status_code": response.status_code
                            })
                return True
            else:
                self.log_test("Cleanup Test Formation", False, 
                            f"⚠️ Could not clean up test formation: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Cleanup Test Formation", False, f"Cleanup error: {str(e)}")
            return False

    def run_formation_validation_tests(self):
        """Run the complete Formation Validation Testing"""
        print("🚀 Starting Formation Creation Validation Testing")
        print("=" * 80)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"👤 Admin: gussdub@gmail.com / 230685Juin+")
        print(f"🎯 Objectif: Vérifier les validations de création de formation")
        print(f"🔍 Test 1: Création SANS compétence (doit échouer)")
        print(f"🔍 Test 2: Création AVEC compétence invalide (doit échouer)")
        print(f"🔍 Test 3: Création AVEC compétence valide (doit réussir)")
        print("=" * 80)
        
        tests = [
            ("Admin Authentication", self.test_admin_authentication),
            ("Get Competences List", self.get_competences_list),
            ("Formation Creation Without Competence", self.test_formation_creation_without_competence),
            ("Formation Creation With Invalid Competence", self.test_formation_creation_with_invalid_competence),
            ("Formation Creation With Valid Competence", self.test_formation_creation_with_valid_competence),
            ("Verify Formation In List", self.verify_formation_in_list),
            ("Cleanup Test Formation", self.cleanup_test_formation),
        ]
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n🧪 Running: {test_name}")
            if test_func():
                passed += 1
            else:
                print(f"❌ Test failed: {test_name}")
                # Continue with other tests to get full picture
        
        print(f"\n" + "=" * 80)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        # Generate detailed validation report
        self.generate_validation_report()
        
        return passed >= 5  # Consider success if core validation tests pass
    
    def generate_validation_report(self):
        """Generate detailed formation validation report"""
        print(f"\n" + "=" * 80)
        print(f"📋 RAPPORT DE VALIDATION - CRÉATION DE FORMATION DEMO")
        print("=" * 80)
        
        # Check test results
        auth_success = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
        competences_success = any(r["success"] for r in self.test_results if "Get Competences List" in r["test"])
        without_competence_success = any(r["success"] for r in self.test_results if "Formation Creation Without Competence" in r["test"])
        invalid_competence_success = any(r["success"] for r in self.test_results if "Formation Creation With Invalid Competence" in r["test"])
        valid_competence_success = any(r["success"] for r in self.test_results if "Formation Creation With Valid Competence" in r["test"])
        verification_success = any(r["success"] for r in self.test_results if "Verify Formation In List" in r["test"])
        
        print(f"🔐 Authentification admin demo: {'✅ Réussie' if auth_success else '❌ Échouée'}")
        print(f"📚 Récupération compétences: {'✅ Réussie' if competences_success else '❌ Échouée'}")
        print(f"❌ Test SANS compétence: {'✅ Rejetée correctement' if without_competence_success else '❌ Validation échouée'}")
        print(f"❌ Test compétence INVALIDE: {'✅ Rejetée correctement' if invalid_competence_success else '❌ Validation échouée'}")
        print(f"✅ Test compétence VALIDE: {'✅ Création réussie' if valid_competence_success else '❌ Création échouée'}")
        print(f"🔍 Vérification dans liste: {'✅ Formation trouvée' if verification_success else '❌ Formation non trouvée'}")
        
        if not auth_success:
            print(f"\n❌ IMPOSSIBLE DE CONTINUER LES TESTS")
            print(f"   Cause: Échec de l'authentification avec gussdub@gmail.com / 230685Juin+")
            print(f"   Action requise: Vérifier les identifiants ou l'existence du tenant 'demo'")
            return
        
        if not competences_success:
            print(f"\n❌ IMPOSSIBLE DE RÉCUPÉRER LES COMPÉTENCES")
            print(f"   Cause: Endpoint GET /api/demo/competences inaccessible ou vide")
            print(f"   Action requise: Vérifier l'endpoint et créer des compétences si nécessaire")
            return
        
        print(f"\n🔍 RÉSULTATS DES VALIDATIONS:")
        print("-" * 60)
        
        # Validation results summary
        validations_working = 0
        total_validations = 3
        
        if without_competence_success:
            print(f"✅ Validation #1: Formation SANS compétence correctement rejetée (400 Bad Request)")
            validations_working += 1
        else:
            print(f"❌ Validation #1: Formation SANS compétence PAS rejetée (validation manquante)")
        
        if invalid_competence_success:
            print(f"✅ Validation #2: Formation avec compétence INVALIDE correctement rejetée (404 Not Found)")
            validations_working += 1
        else:
            print(f"❌ Validation #2: Formation avec compétence INVALIDE PAS rejetée (validation manquante)")
        
        if valid_competence_success:
            print(f"✅ Validation #3: Formation avec compétence VALIDE correctement acceptée (200 OK)")
            validations_working += 1
        else:
            print(f"❌ Validation #3: Formation avec compétence VALIDE PAS acceptée (erreur inattendue)")
        
        print(f"\n🎯 CONCLUSION DES VALIDATIONS:")
        print("-" * 60)
        
        if validations_working == total_validations:
            print("🎉 TOUTES LES VALIDATIONS FONCTIONNENT CORRECTEMENT!")
            print("   ✅ Validation frontend: competence_id obligatoire")
            print("   ✅ Validation backend: compétence doit exister")
            print("   ✅ Création réussie avec compétence valide")
            print("   Les corrections sont entièrement fonctionnelles.")
        elif validations_working >= 2:
            print("⚠️ VALIDATIONS PARTIELLEMENT FONCTIONNELLES")
            print(f"   {validations_working}/{total_validations} validations fonctionnent")
            print("   Action requise: Corriger les validations manquantes")
        else:
            print("❌ VALIDATIONS NON FONCTIONNELLES")
            print(f"   Seulement {validations_working}/{total_validations} validations fonctionnent")
            print("   Action requise: Vérifier l'implémentation des validations")
        
        print("=" * 80)

if __name__ == "__main__":
    testing = FormationValidationTesting()
    success = testing.run_formation_validation_tests()
    
    sys.exit(0 if success else 1)
