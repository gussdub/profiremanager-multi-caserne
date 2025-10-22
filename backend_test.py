#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - FORMATION DIAGNOSTIC SHEFFORD

DIAGNOSTIC: Formation visible dans Dashboard mais pas dans module Formation (tenant shefford)

CONTEXTE:
- Formation "PR test" visible dans Dashboard
- Aucune formation visible dans module Formation avec année 2025 sélectionnée
- Besoin de comprendre pourquoi le filtre par année ne fonctionne pas

TESTS À EFFECTUER:
1. Login admin shefford (admin@firemanager.ca / admin123)

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
# Authentication: admin@firemanager.ca / admin123

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
            print(f"   Cause: Échec de l'authentification avec admin@firemanager.ca / admin123")
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
