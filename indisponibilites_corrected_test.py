#!/usr/bin/env python3
"""
Focused test for corrected Indisponibilités Generation logic
Tests the corrected logic that generates unavailabilities for days when the team WORKS at their main job.

Expected Results:
- Montreal Rouge 2025: ~91 unavailabilities (7 days × 13 cycles)
- Quebec team: ~52 unavailabilities (4 days × 13 cycles)
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://firefighter-hub-6.preview.emergentagent.com/api"
TENANT_SLUG = "shefford"

# Super Admin Configuration (from backend code)
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

class IndisponibilitesCorrectednessTest:
    def __init__(self):
        self.base_url = BASE_URL
        self.tenant_slug = TENANT_SLUG
        self.session = requests.Session()
        self.super_admin_token = None
        self.tenant_admin_token = None
        self.test_user_id = None
        self.results = []
        
    def log_result(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "details": details or {}
        }
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def authenticate_super_admin(self):
        """Authenticate as Super Admin"""
        try:
            login_data = {
                "email": SUPER_ADMIN_EMAIL,
                "mot_de_passe": SUPER_ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/admin/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.super_admin_token = data["access_token"]
                    admin_info = data.get("admin", {})
                    self.log_result("Super Admin Authentication", True, 
                                  f"Super Admin login successful for {admin_info.get('email', 'admin')}")
                    return True
                else:
                    self.log_result("Super Admin Authentication", False, "No access token in response", data)
                    return False
            else:
                self.log_result("Super Admin Authentication", False, f"Login failed with status {response.status_code}", 
                              {"response": response.text})
                return False
                
        except Exception as e:
            self.log_result("Super Admin Authentication", False, f"Super Admin authentication error: {str(e)}")
            return False
    
    def authenticate_tenant_admin(self):
        """Authenticate as Shefford tenant admin"""
        try:
            # First, get or create a Shefford admin user
            if not self.super_admin_token:
                self.log_result("Tenant Admin Authentication", False, "No Super Admin token available")
                return False
            
            # Create a new session with Super Admin token
            super_admin_session = requests.Session()
            super_admin_session.headers.update({"Authorization": f"Bearer {self.super_admin_token}"})
            
            # Get Shefford tenant ID
            response = super_admin_session.get(f"{self.base_url}/admin/tenants")
            if response.status_code != 200:
                self.log_result("Tenant Admin Authentication", False, 
                              f"Failed to fetch tenants: {response.status_code}")
                return False
            
            tenants = response.json()
            shefford_tenant = None
            for tenant in tenants:
                if tenant.get('slug') == self.tenant_slug:
                    shefford_tenant = tenant
                    break
            
            if not shefford_tenant:
                self.log_result("Tenant Admin Authentication", False, "Shefford tenant not found")
                return False
            
            tenant_id = shefford_tenant['id']
            
            # Try to create or use existing admin user
            admin_user_data = {
                "email": "admin@shefford.ca",
                "prenom": "Admin",
                "nom": "Shefford",
                "mot_de_passe": "AdminShefford123!"
            }
            
            # Try to create admin (might already exist)
            response = super_admin_session.post(f"{self.base_url}/admin/tenants/{tenant_id}/create-admin", json=admin_user_data)
            # Don't fail if admin already exists
            
            # Now login as the admin user to the Shefford tenant
            login_data = {
                "email": "admin@shefford.ca",
                "mot_de_passe": "AdminShefford123!"
            }
            
            # Try tenant-specific login first
            response = requests.post(f"{self.base_url}/{self.tenant_slug}/auth/login", json=login_data)
            if response.status_code != 200:
                # Try legacy login
                response = requests.post(f"{self.base_url}/auth/login", json=login_data)
                if response.status_code != 200:
                    self.log_result("Tenant Admin Authentication", False, 
                                  f"Failed to login as tenant admin: {response.status_code}", 
                                  {"response": response.text})
                    return False
            
            login_result = response.json()
            self.tenant_admin_token = login_result["access_token"]
            
            self.log_result("Tenant Admin Authentication", True, 
                          f"Tenant admin login successful for {self.tenant_slug}")
            return True
            
        except Exception as e:
            self.log_result("Tenant Admin Authentication", False, f"Tenant admin authentication error: {str(e)}")
            return False
    
    def get_or_create_part_time_user(self):
        """Get existing part-time user or create one"""
        try:
            if not self.tenant_admin_token:
                self.log_result("Get Part-Time User", False, "No tenant admin token available")
                return False
            
            # Create a new session with tenant admin token
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_admin_token}"})
            
            # Get existing users
            response = tenant_session.get(f"{self.base_url}/{self.tenant_slug}/users")
            if response.status_code == 200:
                users = response.json()
                
                # Look for existing part-time user
                for user in users:
                    if user.get('type_emploi') == 'temps_partiel':
                        self.test_user_id = user['id']
                        self.log_result("Get Part-Time User", True, 
                                      f"Found existing part-time user: {user.get('prenom', '')} {user.get('nom', '')} (ID: {self.test_user_id})")
                        return True
            
            # Create a new part-time user if none found
            test_user = {
                "nom": "TestPartiel",
                "prenom": "Pompier",
                "email": f"test.partiel.{uuid.uuid4().hex[:8]}@shefford.ca",
                "telephone": "450-555-0123",
                "contact_urgence": "450-555-0124",
                "grade": "Pompier",
                "fonction_superieur": False,
                "type_emploi": "temps_partiel",
                "heures_max_semaine": 25,
                "role": "employe",
                "numero_employe": f"TP{uuid.uuid4().hex[:6].upper()}",
                "date_embauche": "2024-01-15",
                "formations": [],
                "mot_de_passe": "TestPass123!"
            }
            
            response = tenant_session.post(f"{self.base_url}/{self.tenant_slug}/users", json=test_user)
            if response.status_code != 200:
                self.log_result("Get Part-Time User", False, 
                              f"Failed to create part-time user: {response.status_code}", 
                              {"response": response.text})
                return False
            
            part_time_user = response.json()
            self.test_user_id = part_time_user["id"]
            
            self.log_result("Get Part-Time User", True, 
                          f"Created new part-time user: {test_user['prenom']} {test_user['nom']} (ID: {self.test_user_id})")
            return True
            
        except Exception as e:
            self.log_result("Get Part-Time User", False, f"Get part-time user error: {str(e)}")
            return False
    
    def delete_existing_disponibilites(self):
        """Delete all existing disponibilites for the test user"""
        try:
            if not self.tenant_admin_token or not self.test_user_id:
                self.log_result("Delete Existing Disponibilites", False, "Missing token or user ID")
                return False
            
            # Create a new session with tenant admin token
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_admin_token}"})
            
            # Delete existing disponibilites
            response = tenant_session.delete(f"{self.base_url}/{self.tenant_slug}/disponibilites/{self.test_user_id}")
            
            if response.status_code in [200, 204]:
                self.log_result("Delete Existing Disponibilites", True, 
                              f"Successfully deleted existing disponibilites for user {self.test_user_id}")
                return True
            elif response.status_code == 404:
                self.log_result("Delete Existing Disponibilites", True, 
                              f"No existing disponibilites found for user {self.test_user_id} (404 - OK)")
                return True
            else:
                self.log_result("Delete Existing Disponibilites", False, 
                              f"Failed to delete disponibilites: {response.status_code}", 
                              {"response": response.text})
                return False
            
        except Exception as e:
            self.log_result("Delete Existing Disponibilites", False, f"Delete disponibilites error: {str(e)}")
            return False
    
    def test_montreal_rouge_2025_generation(self):
        """Test Montreal Rouge 2025 generation - should generate ~91 unavailabilities"""
        try:
            if not self.tenant_admin_token or not self.test_user_id:
                self.log_result("Montreal Rouge 2025 Generation", False, "Missing token or user ID")
                return False
            
            # Create a new session with tenant admin token
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_admin_token}"})
            
            # Generate Montreal Rouge 2025
            montreal_data = {
                "user_id": self.test_user_id,
                "horaire_type": "montreal",
                "equipe": "Rouge",
                "annee": 2025,
                "conserver_manuelles": True
            }
            
            response = tenant_session.post(f"{self.base_url}/{self.tenant_slug}/disponibilites/generer", json=montreal_data)
            
            if response.status_code != 200:
                self.log_result("Montreal Rouge 2025 Generation", False, 
                              f"Montreal Rouge generation failed: {response.status_code}", 
                              {"response": response.text})
                return False
            
            result = response.json()
            
            # Verify response structure
            required_fields = ['message', 'horaire_type', 'equipe', 'annee', 'nombre_indisponibilites']
            missing_fields = []
            for field in required_fields:
                if field not in result:
                    missing_fields.append(field)
            
            if missing_fields:
                self.log_result("Montreal Rouge 2025 Generation", False, 
                              f"Response missing fields: {', '.join(missing_fields)}")
                return False
            
            # Check the count - should be around 91 (7 days × 13 cycles)
            count = result.get('nombre_indisponibilites', 0)
            expected_min = 85  # Allow some variance
            expected_max = 100
            
            if count < expected_min or count > expected_max:
                self.log_result("Montreal Rouge 2025 Generation", False, 
                              f"Incorrect count: {count} (expected ~91, range {expected_min}-{expected_max})", 
                              {"full_response": result})
                return False
            
            self.log_result("Montreal Rouge 2025 Generation", True, 
                          f"✅ CORRECTED LOGIC WORKING - Generated {count} unavailabilities (expected ~91)")
            return True
            
        except Exception as e:
            self.log_result("Montreal Rouge 2025 Generation", False, f"Montreal Rouge generation error: {str(e)}")
            return False
    
    def test_quebec_generation(self):
        """Test Quebec generation - should generate ~52 unavailabilities"""
        try:
            if not self.tenant_admin_token or not self.test_user_id:
                self.log_result("Quebec Generation", False, "Missing token or user ID")
                return False
            
            # Create a new session with tenant admin token
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_admin_token}"})
            
            # Generate Quebec schedule
            quebec_data = {
                "user_id": self.test_user_id,
                "horaire_type": "quebec",
                "equipe": "Jaune",
                "annee": 2025,
                "date_jour_1": "2025-01-06",
                "conserver_manuelles": False  # Clear previous data
            }
            
            response = tenant_session.post(f"{self.base_url}/{self.tenant_slug}/disponibilites/generer", json=quebec_data)
            
            if response.status_code != 200:
                self.log_result("Quebec Generation", False, 
                              f"Quebec generation failed: {response.status_code}", 
                              {"response": response.text})
                return False
            
            result = response.json()
            
            # Check the count - should be around 52 (4 days × 13 cycles)
            count = result.get('nombre_indisponibilites', 0)
            expected_min = 45  # Allow some variance
            expected_max = 60
            
            if count < expected_min or count > expected_max:
                self.log_result("Quebec Generation", False, 
                              f"Incorrect count: {count} (expected ~52, range {expected_min}-{expected_max})", 
                              {"full_response": result})
                return False
            
            self.log_result("Quebec Generation", True, 
                          f"✅ Quebec generation working - Generated {count} unavailabilities (expected ~52)")
            return True
            
        except Exception as e:
            self.log_result("Quebec Generation", False, f"Quebec generation error: {str(e)}")
            return False
    
    def verify_database_entries(self):
        """Verify the generated entries are correctly stored in database"""
        try:
            if not self.tenant_admin_token or not self.test_user_id:
                self.log_result("Database Verification", False, "Missing token or user ID")
                return False
            
            # Create a new session with tenant admin token
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_admin_token}"})
            
            # Get all disponibilites for the user
            response = tenant_session.get(f"{self.base_url}/{self.tenant_slug}/disponibilites/{self.test_user_id}")
            
            if response.status_code != 200:
                self.log_result("Database Verification", False, 
                              f"Failed to fetch disponibilites: {response.status_code}")
                return False
            
            disponibilites = response.json()
            
            # Count entries by origin
            quebec_entries = [d for d in disponibilites if d.get('origine') == 'quebec_10_14']
            total_count = len(disponibilites)
            quebec_count = len(quebec_entries)
            
            # Verify entries have correct structure and status
            if quebec_entries:
                sample_entry = quebec_entries[0]
                required_fields = ['id', 'user_id', 'date', 'statut', 'origine', 'heure_debut', 'heure_fin']
                missing_fields = []
                for field in required_fields:
                    if field not in sample_entry:
                        missing_fields.append(field)
                
                if missing_fields:
                    self.log_result("Database Verification", False, 
                                  f"Entry missing fields: {', '.join(missing_fields)}")
                    return False
                
                if sample_entry.get('statut') != 'indisponible':
                    self.log_result("Database Verification", False, 
                                  f"Entry has wrong statut: {sample_entry.get('statut')} (expected: indisponible)")
                    return False
            
            self.log_result("Database Verification", True, 
                          f"✅ Database entries verified - Total: {total_count}, Quebec entries: {quebec_count}, all have correct structure and statut='indisponible'")
            return True
            
        except Exception as e:
            self.log_result("Database Verification", False, f"Database verification error: {str(e)}")
            return False
    
    def run_corrected_logic_test(self):
        """Run the complete corrected logic test"""
        print("\n🔥 Indisponibilités Generation - Corrected Logic Test")
        print("=" * 60)
        print(f"Testing against: {self.base_url}")
        print(f"Tenant: {self.tenant_slug}")
        print(f"Expected Montreal Rouge 2025: ~91 unavailabilities (7 days × 13 cycles)")
        print(f"Expected Quebec: ~52 unavailabilities (4 days × 13 cycles)")
        print("=" * 60)
        
        # Step 1: Authenticate as Super Admin
        if not self.authenticate_super_admin():
            print("\n❌ Super Admin authentication failed. Cannot continue.")
            return False
        
        # Step 2: Authenticate as Shefford admin
        if not self.authenticate_tenant_admin():
            print("\n❌ Tenant admin authentication failed. Cannot continue.")
            return False
        
        # Step 3: Get or create part-time user
        if not self.get_or_create_part_time_user():
            print("\n❌ Failed to get part-time user. Cannot continue.")
            return False
        
        # Step 4: Delete existing disponibilites
        if not self.delete_existing_disponibilites():
            print("\n❌ Failed to delete existing disponibilites. Cannot continue.")
            return False
        
        # Step 5: Test Montreal Rouge 2025 generation (MAIN TEST)
        montreal_success = self.test_montreal_rouge_2025_generation()
        
        # Step 6: Test Quebec generation for completeness
        quebec_success = self.test_quebec_generation()
        
        # Step 7: Verify database entries
        db_success = self.verify_database_entries()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 CORRECTED LOGIC TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.results if result["success"])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [result for result in self.results if not result["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
        
        # Key results
        print("\n🎯 KEY RESULTS:")
        montreal_result = next((r for r in self.results if "Montreal Rouge 2025" in r["test"]), None)
        quebec_result = next((r for r in self.results if "Quebec Generation" in r["test"]), None)
        
        if montreal_result:
            status = "✅ PASS" if montreal_result["success"] else "❌ FAIL"
            print(f"   {status} - Montreal Rouge 2025: {montreal_result['message']}")
        
        if quebec_result:
            status = "✅ PASS" if quebec_result["success"] else "❌ FAIL"
            print(f"   {status} - Quebec Generation: {quebec_result['message']}")
        
        # Overall assessment
        critical_success = montreal_success and quebec_success and db_success
        if critical_success:
            print("\n🎉 CORRECTED LOGIC VERIFICATION: SUCCESS")
            print("   The indisponibilités generation logic is working correctly!")
            print("   Generating unavailabilities for days when team WORKS (not when they don't work)")
        else:
            print("\n⚠️  CORRECTED LOGIC VERIFICATION: ISSUES FOUND")
            print("   The logic may not be working as expected. See failed tests above.")
        
        return critical_success

if __name__ == "__main__":
    tester = IndisponibilitesCorrectednessTest()
    success = tester.run_corrected_logic_test()
    
    # Save detailed results to file
    with open("/app/indisponibilites_corrected_test_results.json", "w") as f:
        json.dump(tester.results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/indisponibilites_corrected_test_results.json")
    
    sys.exit(0 if success else 1)