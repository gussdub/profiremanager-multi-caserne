#!/usr/bin/env python3
"""
Montreal 7/24 Generation Logic Test
Tests that Montreal logic still generates ~91 unavailabilities for Rouge 2025
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://demo-dashboard-1.preview.emergentagent.com/api"
FALLBACK_SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
FALLBACK_SUPER_ADMIN_PASSWORD = "230685Juin+"

class MontrealLogicTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.super_admin_token = None
        self.tenant_token = None
        self.test_user_id = None
        
    def log_result(self, test_name, success, message, details=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}: {message}")
        if details and not success:
            print(f"   Details: {details}")
    
    def authenticate_super_admin(self):
        """Authenticate as Super Admin"""
        try:
            login_data = {
                "email": FALLBACK_SUPER_ADMIN_EMAIL,
                "mot_de_passe": FALLBACK_SUPER_ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/admin/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                self.super_admin_token = data["access_token"]
                self.log_result("Super Admin Authentication", True, "Successfully authenticated")
                return True
            else:
                self.log_result("Super Admin Authentication", False, f"Failed with status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Super Admin Authentication", False, f"Error: {str(e)}")
            return False
    
    def setup_shefford_admin(self):
        """Setup Shefford admin user"""
        try:
            # Try to login with existing admin
            login_data = {
                "email": "admin@firemanager.ca",
                "mot_de_passe": "admin123"
            }
            
            response = requests.post(f"{self.base_url}/shefford/auth/login", json=login_data)
            if response.status_code == 200:
                login_result = response.json()
                self.tenant_token = login_result["access_token"]
                self.log_result("Setup Shefford Admin", True, "Successfully logged in as existing admin")
                return True
            
            # If login fails, try legacy login
            response = requests.post(f"{self.base_url}/auth/login", json=login_data)
            if response.status_code == 200:
                login_result = response.json()
                self.tenant_token = login_result["access_token"]
                self.log_result("Setup Shefford Admin", True, "Successfully logged in via legacy endpoint")
                return True
            
            self.log_result("Setup Shefford Admin", False, "Failed to login as admin")
            return False
            
        except Exception as e:
            self.log_result("Setup Shefford Admin", False, f"Error: {str(e)}")
            return False
    
    def create_part_time_user(self):
        """Create a part-time user for testing"""
        try:
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_token}"})
            
            test_user = {
                "nom": "TestMontreal",
                "prenom": "PartTime",
                "email": f"montreal.test.{uuid.uuid4().hex[:8]}@shefford.ca",
                "telephone": "450-555-0123",
                "contact_urgence": "450-555-0124",
                "grade": "Pompier",
                "fonction_superieur": False,
                "type_emploi": "temps_partiel",
                "heures_max_semaine": 25,
                "role": "employe",
                "numero_employe": f"MT{uuid.uuid4().hex[:6].upper()}",
                "date_embauche": "2024-01-15",
                "formations": [],
                "mot_de_passe": "TestPass123!"
            }
            
            response = tenant_session.post(f"{self.base_url}/shefford/users", json=test_user)
            if response.status_code == 200:
                user_data = response.json()
                self.test_user_id = user_data["id"]
                self.log_result("Create Part-time User", True, f"Created user: {test_user['email']}")
                return True
            else:
                self.log_result("Create Part-time User", False, f"Failed with status {response.status_code}")
                return False
                
        except Exception as e:
            self.log_result("Create Part-time User", False, f"Error: {str(e)}")
            return False
    
    def test_montreal_rouge_2025_generation(self):
        """Test Montreal Rouge 2025 generation"""
        try:
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_token}"})
            
            # Generate Montreal Rouge 2025
            montreal_data = {
                "user_id": self.test_user_id,
                "horaire_type": "montreal",
                "equipe": "Rouge",
                "annee": 2025,
                "conserver_manuelles": False  # Clear existing data
            }
            
            response = tenant_session.post(f"{self.base_url}/shefford/disponibilites/generer", json=montreal_data)
            
            if response.status_code != 200:
                self.log_result("Montreal Rouge 2025 Generation", False, 
                              f"Generation failed with status {response.status_code}", 
                              {"response": response.text})
                return False
            
            result = response.json()
            generated_count = result.get('nombre_indisponibilites', 0)
            
            # Expected: ~91 unavailabilities (7 days × 13 cycles)
            expected_min = 85  # Allow some variance
            expected_max = 95
            
            if expected_min <= generated_count <= expected_max:
                self.log_result("Montreal Rouge 2025 Generation", True, 
                              f"✅ Generated {generated_count} unavailabilities (expected ~91) - MONTREAL LOGIC WORKING")
                
                # Verify in database
                response = tenant_session.get(f"{self.base_url}/shefford/disponibilites/{self.test_user_id}")
                if response.status_code == 200:
                    disponibilites = response.json()
                    montreal_entries = [d for d in disponibilites if d.get('origine') == 'montreal_7_24']
                    db_count = len(montreal_entries)
                    
                    if db_count == generated_count:
                        self.log_result("Database Verification", True, 
                                      f"✅ Database contains {db_count} Montreal entries matching generation result")
                        return True
                    else:
                        self.log_result("Database Verification", False, 
                                      f"Database count {db_count} doesn't match generation result {generated_count}")
                        return False
                else:
                    self.log_result("Database Verification", False, "Failed to fetch disponibilités from database")
                    return False
            else:
                self.log_result("Montreal Rouge 2025 Generation", False, 
                              f"❌ Generated {generated_count} unavailabilities, expected ~91 (range {expected_min}-{expected_max})")
                return False
                
        except Exception as e:
            self.log_result("Montreal Rouge 2025 Generation", False, f"Error: {str(e)}")
            return False
    
    def run_montreal_test(self):
        """Run the Montreal 7/24 generation test"""
        print("\n🔥 Montreal 7/24 Generation Logic Test")
        print("=" * 50)
        print("Testing Montreal logic: 7 working days per 28-day cycle")
        print("Expected: Montreal Rouge 2025 should generate ~91 unavailabilities")
        print("=" * 50)
        
        # Step 1: Authenticate as Super Admin
        if not self.authenticate_super_admin():
            print("\n❌ Cannot proceed without Super Admin authentication")
            return False
        
        # Step 2: Setup Shefford admin
        if not self.setup_shefford_admin():
            print("\n❌ Cannot proceed without Shefford admin access")
            return False
        
        # Step 3: Create part-time user
        if not self.create_part_time_user():
            print("\n❌ Cannot proceed without test user")
            return False
        
        # Step 4: Test Montreal Rouge 2025 generation
        success = self.test_montreal_rouge_2025_generation()
        
        print("\n" + "=" * 50)
        if success:
            print("🎯 MONTREAL TEST RESULT: ✅ MONTREAL LOGIC VERIFIED")
            print("Montreal Rouge 2025 generates ~91 unavailabilities as expected")
        else:
            print("🎯 MONTREAL TEST RESULT: ❌ ISSUE FOUND")
            print("Montreal generation count doesn't match expected ~91")
        print("=" * 50)
        
        return success

if __name__ == "__main__":
    tester = MontrealLogicTester()
    success = tester.run_montreal_test()
    sys.exit(0 if success else 1)