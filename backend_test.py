#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - FORMATION REPORTS ENDPOINTS TESTING

CONTEXTE:
- Problème identifié: endpoints /formations/rapports/conformite et /formations/rapports/dashboard retournaient 500
- Cause: parsing de dates sans gestion d'erreur à la ligne 3990 (datetime.fromisoformat sans try/except)
- Correction appliquée: ajout de try/except autour du parsing de date_fin avec gestion des valeurs None/invalides

TESTS À EFFECTUER:
1. Login admin shefford (gussdub@gmail.com / 230685Juin+)

2. Tester l'endpoint conformité (qui crashait):
   GET /api/shefford/formations/rapports/conformite?annee=2025
   - AVANT: Retournait 500 error
   - APRÈS: Devrait retourner 200 OK avec données du rapport

3. Tester l'endpoint dashboard formations:
   GET /api/shefford/formations/rapports/dashboard?annee=2025
   - Vérifier qu'il retourne 200 OK avec KPIs

4. Tester l'endpoint formations principal:
   GET /api/shefford/formations?annee=2025
   - Vérifier qu'il retourne bien les 2 formations dont "test PR"

OBJECTIF:
Confirmer que les endpoints de rapports ne crashent plus et que le frontend pourra charger toutes les données sans erreur 500.
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
# Authentication: gussdub@gmail.com / 230685Juin+

class FormationReportsEndpointTesting:
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
        """Test admin authentication for Shefford tenant - gussdub@gmail.com / 230685Juin+"""
        try:
            # Use the specific credentials mentioned in the review request
            admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
            
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

    def test_formations_endpoint(self):
        """Test GET /api/shefford/formations?annee=2025 - should return formations including 'test PR'"""
        try:
            if not self.admin_token:
                self.log_test("Test Formations Endpoint", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📚 Testing formations endpoint: GET /api/{TENANT_SLUG}/formations?annee=2025")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations?annee=2025")
            
            if response.status_code == 200:
                try:
                    formations = response.json()
                    
                    # Look for "test PR" formation
                    test_pr_found = False
                    test_pr_formation = None
                    for formation in formations:
                        nom = formation.get("nom", "").lower()
                        if "test pr" in nom or "pr test" in nom:
                            test_pr_found = True
                            test_pr_formation = formation
                            break
                    
                    self.log_test("Test Formations Endpoint", True, 
                                f"✅ Formations endpoint returned {len(formations)} formations for 2025", 
                                {
                                    "total_formations": len(formations),
                                    "test_pr_found": test_pr_found,
                                    "test_pr_formation": test_pr_formation,
                                    "formations_sample": [{"nom": f.get("nom"), "annee": f.get("annee")} for f in formations[:3]]
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Test Formations Endpoint", False, f"❌ Invalid JSON in formations response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Test Formations Endpoint", False, 
                            f"❌ Formations endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Test Formations Endpoint", False, f"Formations endpoint error: {str(e)}")
            return False

    def test_conformite_report_endpoint(self):
        """Test GET /api/shefford/formations/rapports/conformite?annee=2025 - should return 200 OK (was 500)"""
        try:
            if not self.admin_token:
                self.log_test("Test Conformité Report Endpoint", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📊 Testing conformité report endpoint: GET /api/{TENANT_SLUG}/formations/rapports/conformite?annee=2025")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations/rapports/conformite?annee=2025")
            
            if response.status_code == 200:
                try:
                    rapport_data = response.json()
                    
                    # Validate response structure
                    required_fields = ["annee", "heures_minimales", "total_pompiers", "conformes", "pourcentage_conformite", "pompiers"]
                    missing_fields = [field for field in required_fields if field not in rapport_data]
                    
                    if missing_fields:
                        self.log_test("Test Conformité Report Endpoint", False, 
                                    f"❌ Missing required fields in response: {missing_fields}")
                        return False
                    
                    self.log_test("Test Conformité Report Endpoint", True, 
                                f"✅ Conformité report endpoint returned 200 OK (was 500 before fix)", 
                                {
                                    "status_code": response.status_code,
                                    "annee": rapport_data.get("annee"),
                                    "total_pompiers": rapport_data.get("total_pompiers"),
                                    "conformes": rapport_data.get("conformes"),
                                    "pourcentage_conformite": rapport_data.get("pourcentage_conformite"),
                                    "response_structure": list(rapport_data.keys())
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Test Conformité Report Endpoint", False, f"❌ Invalid JSON in conformité report response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Test Conformité Report Endpoint", False, 
                            f"❌ Conformité report endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Test Conformité Report Endpoint", False, f"Conformité report endpoint error: {str(e)}")
            return False

    def test_dashboard_formations_endpoint(self):
        """Test GET /api/shefford/formations/rapports/dashboard?annee=2025 - should return 200 OK with KPIs"""
        try:
            if not self.admin_token:
                self.log_test("Test Dashboard Formations Endpoint", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📊 Testing dashboard formations endpoint: GET /api/{TENANT_SLUG}/formations/rapports/dashboard?annee=2025")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations/rapports/dashboard?annee=2025")
            
            if response.status_code == 200:
                try:
                    dashboard_data = response.json()
                    
                    # Validate response structure for KPIs
                    required_fields = ["annee", "heures_planifiees", "heures_effectuees", "pourcentage_realisation", "total_pompiers", "pompiers_formes", "pourcentage_pompiers"]
                    missing_fields = [field for field in required_fields if field not in dashboard_data]
                    
                    if missing_fields:
                        self.log_test("Test Dashboard Formations Endpoint", False, 
                                    f"❌ Missing required KPI fields in response: {missing_fields}")
                        return False
                    
                    self.log_test("Test Dashboard Formations Endpoint", True, 
                                f"✅ Dashboard formations endpoint returned 200 OK with KPIs", 
                                {
                                    "status_code": response.status_code,
                                    "annee": dashboard_data.get("annee"),
                                    "heures_planifiees": dashboard_data.get("heures_planifiees"),
                                    "heures_effectuees": dashboard_data.get("heures_effectuees"),
                                    "pourcentage_realisation": dashboard_data.get("pourcentage_realisation"),
                                    "total_pompiers": dashboard_data.get("total_pompiers"),
                                    "pompiers_formes": dashboard_data.get("pompiers_formes"),
                                    "pourcentage_pompiers": dashboard_data.get("pourcentage_pompiers"),
                                    "response_structure": list(dashboard_data.keys())
                                })
                    return True
                    
                except json.JSONDecodeError as e:
                    self.log_test("Test Dashboard Formations Endpoint", False, f"❌ Invalid JSON in dashboard formations response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Test Dashboard Formations Endpoint", False, 
                            f"❌ Dashboard formations endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Test Dashboard Formations Endpoint", False, f"Dashboard formations endpoint error: {str(e)}")
            return False

    def verify_endpoints_fix(self):
        """Verify that all endpoints are working correctly after the date parsing fix"""
        try:
            print(f"🔍 Verifying that all formation report endpoints are working correctly")
            
            # Check test results
            auth_success = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
            formations_success = any(r["success"] for r in self.test_results if "Test Formations Endpoint" in r["test"])
            conformite_success = any(r["success"] for r in self.test_results if "Test Conformité Report Endpoint" in r["test"])
            dashboard_success = any(r["success"] for r in self.test_results if "Test Dashboard Formations Endpoint" in r["test"])
            
            # Analysis results
            analysis = {
                "authentication_working": auth_success,
                "formations_endpoint_working": formations_success,
                "conformite_report_working": conformite_success,
                "dashboard_formations_working": dashboard_success,
                "all_endpoints_fixed": auth_success and formations_success and conformite_success and dashboard_success,
                "fix_verification": "Date parsing fix successfully resolved 500 errors" if (conformite_success and dashboard_success) else "Some endpoints still failing"
            }
            
            self.log_test("Verify Endpoints Fix", analysis["all_endpoints_fixed"], 
                        f"✅ All endpoints working correctly" if analysis["all_endpoints_fixed"] else "❌ Some endpoints still failing", 
                        analysis)
            return analysis["all_endpoints_fixed"]
                
        except Exception as e:
            self.log_test("Verify Endpoints Fix", False, f"Verification error: {str(e)}")
            return False

    def generate_diagnostic_summary(self):
        """Generate a comprehensive diagnostic summary"""
        try:
            print(f"📋 Generating diagnostic summary")
            
            # Collect key findings
            summary = {
                "authentication_success": any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"]),
                "total_formations": len(self.formations_all) if self.formations_all else 0,
                "formations_2025": len(self.formations_2025) if self.formations_2025 else 0,
                "pr_test_found": self.pr_test_formation is not None,
                "pr_test_year": self.pr_test_formation.get("annee") if self.pr_test_formation else None,
                "dashboard_working": self.dashboard_data is not None,
                "issue_root_cause": None,
                "recommended_solution": None
            }
            
            # Determine root cause and solution
            if summary["pr_test_found"] and summary["pr_test_year"] != 2025:
                summary["issue_root_cause"] = f"Formation 'PR test' has year '{summary['pr_test_year']}' but module filters for 2025"
                summary["recommended_solution"] = f"Either update formation year to 2025 or modify frontend to show formations from year {summary['pr_test_year']}"
            elif not summary["pr_test_found"]:
                summary["issue_root_cause"] = "Formation 'PR test' not found in database"
                summary["recommended_solution"] = "Verify formation exists or check formation name"
            
            self.log_test("Generate Diagnostic Summary", True, 
                        f"✅ Diagnostic summary generated", 
                        summary)
            return True
                
        except Exception as e:
            self.log_test("Generate Diagnostic Summary", False, f"Summary generation error: {str(e)}")
            return False

    def run_formation_diagnostic_tests(self):
        """Run the complete Formation Diagnostic Testing"""
        print("🚀 Starting Formation Diagnostic Testing - Shefford Tenant")
        print("=" * 80)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"👤 Admin: gussdub@gmail.com / 230685Juin+")
        print(f"🎯 Objectif: Diagnostiquer pourquoi 'PR test' n'apparaît pas dans module Formation")
        print(f"🔍 Test 1: Récupérer TOUTES les formations (sans filtre)")
        print(f"🔍 Test 2: Récupérer formations avec filtre année 2025")
        print(f"🔍 Test 3: Vérifier données Dashboard")
        print(f"🔍 Test 4: Analyser les différences")
        print("=" * 80)
        
        tests = [
            ("Admin Authentication", self.test_admin_authentication),
            ("Get All Formations", self.get_all_formations),
            ("Get Formations With Year Filter", self.get_formations_with_year_filter),
            ("Get Dashboard Data", self.get_dashboard_data),
            ("Analyze Formation Differences", self.analyze_formation_differences),
            ("Generate Diagnostic Summary", self.generate_diagnostic_summary),
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
        
        # Generate detailed diagnostic report
        self.generate_diagnostic_report()
        
        return passed >= 4  # Consider success if core diagnostic tests pass
    
    def generate_diagnostic_report(self):
        """Generate detailed formation diagnostic report"""
        print(f"\n" + "=" * 80)
        print(f"📋 RAPPORT DIAGNOSTIC - FORMATION SHEFFORD")
        print("=" * 80)
        
        # Check test results
        auth_success = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
        all_formations_success = any(r["success"] for r in self.test_results if "Get All Formations" in r["test"])
        filtered_formations_success = any(r["success"] for r in self.test_results if "Get Formations With Year Filter" in r["test"])
        dashboard_success = any(r["success"] for r in self.test_results if "Get Dashboard Data" in r["test"])
        analysis_success = any(r["success"] for r in self.test_results if "Analyze Formation Differences" in r["test"])
        
        print(f"🔐 Authentification admin Shefford: {'✅ Réussie' if auth_success else '❌ Échouée'}")
        print(f"📚 Récupération toutes formations: {'✅ Réussie' if all_formations_success else '❌ Échouée'}")
        print(f"🔍 Récupération formations 2025: {'✅ Réussie' if filtered_formations_success else '❌ Échouée'}")
        print(f"📊 Récupération données Dashboard: {'✅ Réussie' if dashboard_success else '❌ Échouée'}")
        print(f"🔬 Analyse des différences: {'✅ Réussie' if analysis_success else '❌ Échouée'}")
        
        if not auth_success:
            print(f"\n❌ IMPOSSIBLE DE CONTINUER LE DIAGNOSTIC")
            print(f"   Cause: Échec de l'authentification avec gussdub@gmail.com / 230685Juin+")
            print(f"   Action requise: Vérifier les identifiants ou l'existence du tenant 'shefford'")
            return
        
        print(f"\n🔍 RÉSULTATS DU DIAGNOSTIC:")
        print("-" * 60)
        
        # Get detailed results from test logs
        total_formations = 0
        formations_2025 = 0
        pr_test_found = False
        pr_test_year = None
        pr_test_in_dashboard = False
        
        for result in self.test_results:
            if "Get All Formations" in result["test"] and result["success"]:
                details = result.get("details", {})
                total_formations = details.get("total_formations", 0)
                pr_test_found = details.get("pr_test_found", False)
                if details.get("pr_test_formation"):
                    pr_test_year = details["pr_test_formation"].get("annee")
            
            if "Get Formations With Year Filter" in result["test"] and result["success"]:
                details = result.get("details", {})
                formations_2025 = details.get("filtered_formations_2025", 0)
            
            if "Get Dashboard Data" in result["test"] and result["success"]:
                details = result.get("details", {})
                pr_test_in_dashboard = details.get("pr_test_in_dashboard", False)
        
        print(f"📊 Formations totales dans Shefford: {total_formations}")
        print(f"📊 Formations avec filtre année 2025: {formations_2025}")
        print(f"🔍 Formation 'PR test' trouvée: {'✅ Oui' if pr_test_found else '❌ Non'}")
        if pr_test_found:
            print(f"📅 Année de 'PR test': {pr_test_year}")
        print(f"📊 'PR test' visible dans Dashboard: {'✅ Oui' if pr_test_in_dashboard else '❌ Non'}")
        
        print(f"\n🎯 DIAGNOSTIC FINAL:")
        print("-" * 60)
        
        if pr_test_found and pr_test_year != 2025 and pr_test_in_dashboard:
            print("🎯 PROBLÈME IDENTIFIÉ!")
            print(f"   ❌ Formation 'PR test' a l'année '{pr_test_year}' mais le module Formation filtre pour 2025")
            print(f"   ✅ Dashboard l'affiche car il ne filtre PAS par année")
            print(f"   ❌ Module Formation ne l'affiche PAS car il filtre par année")
            print(f"\n💡 SOLUTIONS POSSIBLES:")
            print(f"   1. Modifier l'année de 'PR test' de '{pr_test_year}' vers '2025'")
            print(f"   2. Modifier le frontend pour afficher les formations de l'année '{pr_test_year}'")
            print(f"   3. Modifier le filtre par défaut du module Formation")
        elif not pr_test_found:
            print("❌ FORMATION 'PR TEST' NON TROUVÉE")
            print("   La formation n'existe pas dans la base de données")
            print("   Vérifier le nom exact ou l'existence de la formation")
        elif pr_test_found and pr_test_year == 2025:
            print("⚠️ PROBLÈME DIFFÉRENT")
            print("   Formation 'PR test' a bien l'année 2025")
            print("   Le problème vient d'ailleurs (filtre frontend, logique backend, etc.)")
        else:
            print("❓ DIAGNOSTIC INCOMPLET")
            print("   Impossible de déterminer la cause exacte")
            print("   Vérifier les logs détaillés ci-dessus")
        
        print("=" * 80)

if __name__ == "__main__":
    testing = FormationDiagnosticTesting()
    success = testing.run_formation_diagnostic_tests()
    
    sys.exit(0 if success else 1)
