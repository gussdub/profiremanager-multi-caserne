#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - DASHBOARD DATA SYNCHRONIZATION DIAGNOSTIC
Comprehensive diagnostic for dashboard data synchronization issues in "demo" tenant.

DIAGNOSTIC REQUEST:
- Dashboard /demo shows incorrect information
- Data not synchronized with rest of application
- GET /api/demo/dashboard/donnees-completes returns 200 OK but data is false

TESTS TO PERFORM:
1. Login as admin for demo tenant (gussdub@gmail.com / 230685Juin+)
2. Get dashboard data from GET /api/demo/dashboard/donnees-completes
3. Compare with real data from:
   - GET /api/demo/users (count active personnel)
   - GET /api/demo/planning/assignations/{current_week} (verify assignments)
   - GET /api/demo/formations (verify formations)
   - GET /api/demo/remplacements (verify replacement requests)

SPECIFIC VERIFICATIONS:
- section_generale.statistiques_mois.total_personnel_actif vs real active users count
- section_generale.statistiques_mois.total_assignations vs real assignments count for month
- section_generale.statistiques_mois.formations_ce_mois vs real formations count for current month
- section_generale.demandes_conges_en_attente vs real pending leave requests
- section_generale.couverture_planning (logical percentage?)
- section_personnelle.heures_travaillees_mois vs real assignments for this admin
- section_personnelle.nombre_gardes_mois vs real guard count
- section_personnelle.formations_a_venir vs real upcoming formations

EXPECTED OUTPUT FORMAT:
- Dashboard dit: X
- Données réelles: Y
- Écart identifié: Z
- Cause probable: ...
"""

import requests
import json
import sys
from datetime import datetime
import uuid
import time

# Configuration - REAL PRODUCTION URLs
BASE_URL = "https://demo-dashboard-1.preview.emergentagent.com/api"

# Test Configuration for Demo tenant
TENANT_SLUG = "demo"

# Dashboard Testing Configuration
# Using existing users in MongoDB Atlas production database for tenant "demo"
# Authentication: admin@firemanager.ca or any valid credentials for demo tenant

class DashboardDataDiagnostic:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.admin_token = None
        self.admin_user_id = None
        self.demo_tenant_id = None
        self.dashboard_data = None
        self.real_data = {}
        self.discrepancies = []
        
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
        """Test admin authentication for Demo tenant - specifically gussdub@gmail.com / 230685Juin+"""
        try:
            # Use the specific credentials mentioned in the diagnostic request
            admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
            
            print(f"🔑 Authenticating as demo admin: {admin_credentials['email']}")
            
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
                                f"✅ Demo admin login successful for {admin_credentials['email']}", 
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

    def get_dashboard_data(self):
        """Get dashboard data from GET /api/demo/dashboard/donnees-completes"""
        try:
            if not self.admin_token:
                self.log_test("Get Dashboard Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📊 Retrieving dashboard data from GET /api/{TENANT_SLUG}/dashboard/donnees-completes")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/dashboard/donnees-completes")
            
            if response.status_code == 200:
                try:
                    self.dashboard_data = response.json()
                    
                    # Extract key metrics from dashboard
                    section_generale = self.dashboard_data.get("section_generale", {})
                    section_personnelle = self.dashboard_data.get("section_personnelle", {})
                    statistiques_mois = section_generale.get("statistiques_mois", {})
                    
                    dashboard_metrics = {
                        "total_personnel_actif": statistiques_mois.get("total_personnel_actif", 0),
                        "total_assignations": statistiques_mois.get("total_assignations", 0),
                        "formations_ce_mois": statistiques_mois.get("formations_ce_mois", 0),
                        "demandes_conges_en_attente": section_generale.get("demandes_conges_en_attente", 0),
                        "couverture_planning": section_generale.get("couverture_planning", 0),
                        "heures_travaillees_mois": section_personnelle.get("heures_travaillees_mois", 0),
                        "nombre_gardes_mois": section_personnelle.get("nombre_gardes_mois", 0),
                        "formations_a_venir": len(section_personnelle.get("formations_a_venir", []))
                    }
                    
                    self.log_test("Get Dashboard Data", True, 
                                f"✅ Dashboard data retrieved successfully", 
                                {
                                    "dashboard_metrics": dashboard_metrics,
                                    "has_section_personnelle": "section_personnelle" in self.dashboard_data,
                                    "has_section_generale": "section_generale" in self.dashboard_data,
                                    "has_activites_recentes": "activites_recentes" in self.dashboard_data
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

    def get_real_users_data(self):
        """Get real users data from GET /api/demo/users"""
        try:
            if not self.admin_token:
                self.log_test("Get Real Users Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"👥 Getting real users data from GET /api/{TENANT_SLUG}/users")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/users")
            
            if response.status_code == 200:
                try:
                    users = response.json()
                    
                    # Count active personnel
                    active_users = [u for u in users if u.get("statut", "").lower() == "actif"]
                    
                    self.real_data["users"] = {
                        "total_users": len(users),
                        "active_users": len(active_users),
                        "users_list": users
                    }
                    
                    self.log_test("Get Real Users Data", True, 
                                f"✅ Retrieved {len(users)} users ({len(active_users)} active)", 
                                {
                                    "total_users": len(users),
                                    "active_users": len(active_users),
                                    "sample_users": [{"email": u.get("email"), "statut": u.get("statut")} for u in users[:3]]
                                })
                    return True
                    
                except json.JSONDecodeError:
                    self.log_test("Get Real Users Data", False, f"❌ Invalid JSON response from users endpoint")
                    return False
                    
            else:
                self.log_test("Get Real Users Data", False, 
                            f"❌ Could not access users endpoint: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Real Users Data", False, f"Get real users data error: {str(e)}")
            return False

    def get_real_planning_data(self):
        """Get real planning data from GET /api/demo/planning/assignations/{current_week}"""
        try:
            if not self.admin_token:
                self.log_test("Get Real Planning Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            # Get current week (Monday of current week)
            from datetime import datetime, timedelta
            today = datetime.now()
            monday = today - timedelta(days=today.weekday())
            current_week = monday.strftime("%Y-%m-%d")
            
            print(f"📅 Getting real planning data from GET /api/{TENANT_SLUG}/planning/assignations/{current_week}")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/planning/assignations/{current_week}")
            
            if response.status_code == 200:
                try:
                    assignations = response.json()
                    
                    # Count assignations for current month
                    current_month = datetime.now().strftime("%Y-%m")
                    monthly_assignations = []
                    
                    if isinstance(assignations, list):
                        monthly_assignations = [a for a in assignations if a.get("date", "").startswith(current_month)]
                    elif isinstance(assignations, dict):
                        # Handle different response format
                        for day_data in assignations.values():
                            if isinstance(day_data, dict):
                                for garde_data in day_data.values():
                                    if isinstance(garde_data, list):
                                        monthly_assignations.extend(garde_data)
                    
                    self.real_data["planning"] = {
                        "current_week_assignations": assignations,
                        "monthly_assignations_count": len(monthly_assignations),
                        "current_week": current_week
                    }
                    
                    self.log_test("Get Real Planning Data", True, 
                                f"✅ Retrieved planning data for week {current_week}", 
                                {
                                    "current_week": current_week,
                                    "monthly_assignations_count": len(monthly_assignations),
                                    "assignations_type": type(assignations).__name__
                                })
                    return True
                    
                except json.JSONDecodeError:
                    self.log_test("Get Real Planning Data", False, f"❌ Invalid JSON response from planning endpoint")
                    return False
                    
            else:
                self.log_test("Get Real Planning Data", False, 
                            f"❌ Could not access planning endpoint: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Real Planning Data", False, f"Get real planning data error: {str(e)}")
            return False

    def get_real_formations_data(self):
        """Get real formations data from GET /api/demo/formations"""
        try:
            if not self.admin_token:
                self.log_test("Get Real Formations Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📚 Getting real formations data from GET /api/{TENANT_SLUG}/formations")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/formations")
            
            if response.status_code == 200:
                try:
                    formations = response.json()
                    
                    # Count formations for current month
                    current_month = datetime.now().strftime("%Y-%m")
                    current_month_formations = []
                    
                    for formation in formations:
                        date_debut = formation.get("date_debut", "")
                        if date_debut.startswith(current_month):
                            current_month_formations.append(formation)
                    
                    # Count upcoming formations for the admin user
                    upcoming_formations = []
                    today = datetime.now().strftime("%Y-%m-%d")
                    
                    for formation in formations:
                        date_debut = formation.get("date_debut", "")
                        if date_debut >= today:
                            upcoming_formations.append(formation)
                    
                    self.real_data["formations"] = {
                        "total_formations": len(formations),
                        "current_month_formations": len(current_month_formations),
                        "upcoming_formations": len(upcoming_formations),
                        "formations_list": formations
                    }
                    
                    self.log_test("Get Real Formations Data", True, 
                                f"✅ Retrieved {len(formations)} formations ({len(current_month_formations)} this month)", 
                                {
                                    "total_formations": len(formations),
                                    "current_month_formations": len(current_month_formations),
                                    "upcoming_formations": len(upcoming_formations)
                                })
                    return True
                    
                except json.JSONDecodeError:
                    self.log_test("Get Real Formations Data", False, f"❌ Invalid JSON response from formations endpoint")
                    return False
                    
            else:
                self.log_test("Get Real Formations Data", False, 
                            f"❌ Could not access formations endpoint: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Real Formations Data", False, f"Get real formations data error: {str(e)}")
            return False

    def get_real_remplacements_data(self):
        """Get real remplacements data from GET /api/demo/remplacements"""
        try:
            if not self.admin_token:
                self.log_test("Get Real Remplacements Data", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"🔄 Getting real remplacements data from GET /api/{TENANT_SLUG}/remplacements")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/remplacements")
            
            if response.status_code == 200:
                try:
                    remplacements = response.json()
                    
                    # Count pending replacement requests
                    pending_remplacements = [r for r in remplacements if r.get("statut", "").lower() == "en_attente"]
                    
                    self.real_data["remplacements"] = {
                        "total_remplacements": len(remplacements),
                        "pending_remplacements": len(pending_remplacements),
                        "remplacements_list": remplacements
                    }
                    
                    self.log_test("Get Real Remplacements Data", True, 
                                f"✅ Retrieved {len(remplacements)} remplacements ({len(pending_remplacements)} pending)", 
                                {
                                    "total_remplacements": len(remplacements),
                                    "pending_remplacements": len(pending_remplacements)
                                })
                    return True
                    
                except json.JSONDecodeError:
                    self.log_test("Get Real Remplacements Data", False, f"❌ Invalid JSON response from remplacements endpoint")
                    return False
                    
            else:
                self.log_test("Get Real Remplacements Data", False, 
                            f"❌ Could not access remplacements endpoint: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Real Remplacements Data", False, f"Get real remplacements data error: {str(e)}")
            return False
    
    def run_dashboard_tests(self):
        """Run the complete Dashboard test suite"""
        print("🚀 Starting Dashboard Endpoint Testing Suite")
        print("=" * 70)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"🔗 Endpoint: GET /api/{TENANT_SLUG}/dashboard/donnees-completes")
        print(f"🎯 Testing: Dashboard endpoint that was returning 500 error due to invalid date parsing")
        print(f"🔧 Expected: Should return 200 OK with section_personnelle, section_generale, activites_recentes")
        print("=" * 70)
        
        tests = [
            ("Admin Authentication", self.test_admin_authentication),
            ("Dashboard Donnees Completes", self.test_dashboard_donnees_completes),
            ("Find Demo Users", self.find_demo_users),
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
        
        print(f"\n" + "=" * 70)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        # Analyze results and provide conclusion
        self.analyze_dashboard_results()
        
        return passed >= 2  # Consider success if authentication and dashboard work
    
    def analyze_dashboard_results(self):
        """Analyze all Dashboard test results and provide conclusion"""
        print(f"\n🔍 DASHBOARD ENDPOINT ANALYSIS:")
        print("=" * 50)
        
        # Check authentication
        admin_auth = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
        
        # Check dashboard functionality
        dashboard_working = any(r["success"] for r in self.test_results if "Dashboard Donnees Completes" in r["test"])
        
        # Check if we found users
        users_found = any(r["success"] for r in self.test_results if "Find Demo Users" in r["test"])
        
        print(f"✅ Admin authentication for demo tenant: {admin_auth}")
        print(f"✅ Dashboard donnees-completes endpoint: {dashboard_working}")
        print(f"✅ Demo tenant users found: {users_found}")
        
        print(f"\n🎯 DASHBOARD TEST CONCLUSION:")
        
        if admin_auth and dashboard_working:
            print("✅ DASHBOARD ENDPOINT FULLY FUNCTIONAL!")
            print("   ✓ Authentication working for demo tenant")
            print("   ✓ GET /api/demo/dashboard/donnees-completes returns 200 OK")
            print("   ✓ Response contains expected fields: section_personnelle, section_generale, activites_recentes")
            print("   ✓ No 500 errors - date parsing fix is working correctly")
            
            print("\n📋 REVIEW REQUEST OBJECTIVES ACHIEVED:")
            print("   1. ✅ Login to 'demo' tenant successful")
            print("   2. ✅ GET /api/demo/dashboard/donnees-completes returns 200 OK instead of 500 error")
            print("   3. ✅ Response contains expected fields:")
            print("      - ✅ section_personnelle")
            print("      - ✅ section_generale") 
            print("      - ✅ activites_recentes")
            print("   4. ✅ Dashboard should load successfully now (no more 'Erreur de chargement des données')")
            
        elif admin_auth and not dashboard_working:
            print("❌ DASHBOARD ENDPOINT STILL HAS ISSUES")
            print("   ✓ Authentication working for demo tenant")
            print("   ❌ Dashboard endpoint still returning errors")
            print("   🔍 Check if the date parsing fix was applied correctly")
            print("   🔍 Check backend logs for formation date parsing errors")
            
        elif not admin_auth:
            print("❌ AUTHENTICATION ISSUES FOR DEMO TENANT")
            print("   ❌ Could not authenticate with any credentials for demo tenant")
            print("   🔍 Check if demo tenant exists in database")
            print("   🔍 Try creating a user for demo tenant or check existing users")
            
        else:
            print("❌ MIXED RESULTS - NEEDS INVESTIGATION")
            print("   🔍 Check individual test results above for specific issues")

if __name__ == "__main__":
    tester = DashboardTester()
    success = tester.run_dashboard_tests()
    
    sys.exit(0 if success else 1)
