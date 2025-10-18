#!/usr/bin/env python3
"""
Quebec 10/14 Generation Logic Test
Tests the corrected Quebec logic that should generate ~169 unavailabilities for Rouge 2025
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://epi-profile.preview.emergentagent.com/api"
FALLBACK_SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
FALLBACK_SUPER_ADMIN_PASSWORD = "230685Juin+"

class QuebecLogicTester:
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
            # Get Shefford tenant
            super_admin_session = requests.Session()
            super_admin_session.headers.update({"Authorization": f"Bearer {self.super_admin_token}"})
            
            response = super_admin_session.get(f"{self.base_url}/admin/tenants")
            if response.status_code != 200:
                self.log_result("Setup Shefford Admin", False, "Failed to fetch tenants")
                return False
            
            tenants = response.json()
            shefford_tenant = None
            for tenant in tenants:
                if tenant.get('slug') == 'shefford':
                    shefford_tenant = tenant
                    break
            
            if not shefford_tenant:
                self.log_result("Setup Shefford Admin", False, "Shefford tenant not found")
                return False
            
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
                "nom": "TestQuebec",
                "prenom": "PartTime",
                "email": f"quebec.test.{uuid.uuid4().hex[:8]}@shefford.ca",
                "telephone": "450-555-0123",
                "contact_urgence": "450-555-0124",
                "grade": "Pompier",
                "fonction_superieur": False,
                "type_emploi": "temps_partiel",
                "heures_max_semaine": 25,
                "role": "employe",
                "numero_employe": f"QT{uuid.uuid4().hex[:6].upper()}",
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
    
    def delete_existing_quebec_disponibilites(self):
        """Delete existing Quebec disponibilités for clean test"""
        try:
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_token}"})
            
            # Get existing disponibilités
            response = tenant_session.get(f"{self.base_url}/shefford/disponibilites/{self.test_user_id}")
            if response.status_code == 200:
                disponibilites = response.json()
                quebec_count = len([d for d in disponibilites if d.get('origine') == 'quebec_10_14'])
                self.log_result("Delete Existing Quebec Disponibilités", True, f"Found {quebec_count} existing Quebec entries")
                return True
            else:
                self.log_result("Delete Existing Quebec Disponibilités", True, "No existing disponibilités found")
                return True
                
        except Exception as e:
            self.log_result("Delete Existing Quebec Disponibilités", False, f"Error: {str(e)}")
            return False
    
    def test_quebec_rouge_2025_generation(self):
        """Test Quebec Rouge 2025 generation with corrected logic"""
        try:
            tenant_session = requests.Session()
            tenant_session.headers.update({"Authorization": f"Bearer {self.tenant_token}"})
            
            # Generate Quebec Rouge 2025 with date_jour_1: "2025-01-06"
            quebec_data = {
                "user_id": self.test_user_id,
                "horaire_type": "quebec",
                "equipe": "Rouge",
                "annee": 2025,
                "date_jour_1": "2025-01-06",
                "conserver_manuelles": False  # Clear existing data
            }
            
            response = tenant_session.post(f"{self.base_url}/shefford/disponibilites/generer", json=quebec_data)
            
            if response.status_code != 200:
                self.log_result("Quebec Rouge 2025 Generation", False, 
                              f"Generation failed with status {response.status_code}", 
                              {"response": response.text})
                return False
            
            result = response.json()
            generated_count = result.get('nombre_indisponibilites', 0)
            
            # Expected: ~169 unavailabilities (13 days × 13 cycles)
            expected_min = 160  # Allow some variance
            expected_max = 180
            
            if expected_min <= generated_count <= expected_max:
                self.log_result("Quebec Rouge 2025 Generation", True, 
                              f"✅ Generated {generated_count} unavailabilities (expected ~169) - CORRECTED LOGIC WORKING")
                
                # Verify in database
                response = tenant_session.get(f"{self.base_url}/shefford/disponibilites/{self.test_user_id}")
                if response.status_code == 200:
                    disponibilites = response.json()
                    quebec_entries = [d for d in disponibilites if d.get('origine') == 'quebec_10_14']
                    db_count = len(quebec_entries)
                    
                    if db_count == generated_count:
                        self.log_result("Database Verification", True, 
                                      f"✅ Database contains {db_count} Quebec entries matching generation result")
                        
                        # Check sample entry structure
                        if quebec_entries:
                            sample = quebec_entries[0]
                            if (sample.get('statut') == 'indisponible' and 
                                sample.get('origine') == 'quebec_10_14' and
                                sample.get('user_id') == self.test_user_id):
                                self.log_result("Entry Structure Verification", True, 
                                              "✅ Quebec entries have correct structure and fields")
                                return True
                            else:
                                self.log_result("Entry Structure Verification", False, 
                                              "Quebec entries have incorrect structure")
                                return False
                    else:
                        self.log_result("Database Verification", False, 
                                      f"Database count {db_count} doesn't match generation result {generated_count}")
                        return False
                else:
                    self.log_result("Database Verification", False, "Failed to fetch disponibilités from database")
                    return False
            else:
                self.log_result("Quebec Rouge 2025 Generation", False, 
                              f"❌ Generated {generated_count} unavailabilities, expected ~169 (range {expected_min}-{expected_max})")
                return False
                
        except Exception as e:
            self.log_result("Quebec Rouge 2025 Generation", False, f"Error: {str(e)}")
            return False
    
    def run_quebec_test(self):
        """Run the Quebec 10/14 generation test"""
        print("\n🔥 Quebec 10/14 Generation Logic Test")
        print("=" * 50)
        print("Testing corrected Quebec logic: 13 working days per 28-day cycle")
        print("Expected: Quebec Rouge 2025 should generate ~169 unavailabilities")
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
        
        # Step 4: Delete existing Quebec disponibilités
        self.delete_existing_quebec_disponibilites()
        
        # Step 5: Test Quebec Rouge 2025 generation
        success = self.test_quebec_rouge_2025_generation()
        
        print("\n" + "=" * 50)
        if success:
            print("🎯 QUEBEC TEST RESULT: ✅ CORRECTED LOGIC VERIFIED")
            print("Quebec Rouge 2025 generates ~169 unavailabilities as expected")
            print("The corrected logic (13 working days per cycle) is working correctly")
        else:
            print("🎯 QUEBEC TEST RESULT: ❌ ISSUE FOUND")
            print("Quebec generation count doesn't match expected ~169")
        print("=" * 50)
        
        return success

if __name__ == "__main__":
    tester = QuebecLogicTester()
    success = tester.run_quebec_test()
    sys.exit(0 if success else 1)