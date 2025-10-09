#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite
Tests all core backend functionality including authentication, settings, and CRUD operations.
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://tenant-admin-1.preview.emergentagent.com/api"
TEST_ADMIN_EMAIL = "admin@firefighter.com"
TEST_ADMIN_PASSWORD = "Admin123!"

class ProFireManagerTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
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
    
    def test_server_health(self):
        """Test if the server is responding"""
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                self.log_test("Server Health Check", True, f"Server is running: {data.get('message', 'OK')}")
                return True
            else:
                self.log_test("Server Health Check", False, f"Server returned status {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Server Health Check", False, f"Server connection failed: {str(e)}")
            return False
    
    def test_admin_authentication(self):
        """Test admin login with provided credentials"""
        try:
            login_data = {
                "email": TEST_ADMIN_EMAIL,
                "mot_de_passe": TEST_ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.auth_token = data["access_token"]
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    user_info = data.get("user", {})
                    self.log_test("Admin Authentication", True, 
                                f"Login successful for {user_info.get('email', 'admin')} (Role: {user_info.get('role', 'unknown')})")
                    return True
                else:
                    self.log_test("Admin Authentication", False, "No access token in response", data)
                    return False
            elif response.status_code == 401:
                # Check if admin user exists by trying to create it first
                self.log_test("Admin Authentication", False, "Authentication failed - admin user may not exist", 
                            {"status_code": response.status_code, "response": response.text})
                return False
            else:
                self.log_test("Admin Authentication", False, f"Login failed with status {response.status_code}", 
                            {"response": response.text})
                return False
                
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Authentication error: {str(e)}")
            return False
    
    def test_jwt_validation(self):
        """Test JWT token validation"""
        if not self.auth_token:
            self.log_test("JWT Token Validation", False, "No auth token available")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/auth/me")
            if response.status_code == 200:
                user_data = response.json()
                self.log_test("JWT Token Validation", True, 
                            f"Token valid - User: {user_data.get('email', 'unknown')}")
                return True
            else:
                self.log_test("JWT Token Validation", False, f"Token validation failed: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("JWT Token Validation", False, f"JWT validation error: {str(e)}")
            return False
    
    def test_database_connectivity(self):
        """Test MongoDB connectivity by trying to fetch users"""
        if not self.auth_token:
            self.log_test("Database Connectivity", False, "No authentication token")
            return False
            
        try:
            response = self.session.get(f"{self.base_url}/users")
            if response.status_code == 200:
                users = response.json()
                self.log_test("Database Connectivity", True, f"Database accessible - Found {len(users)} users")
                return True
            else:
                self.log_test("Database Connectivity", False, f"Database query failed: {response.status_code}")
                return False
        except Exception as e:
            self.log_test("Database Connectivity", False, f"Database connectivity error: {str(e)}")
            return False
    
    def test_types_garde_crud(self):
        """Test Types-Garde CRUD operations"""
        if not self.auth_token:
            self.log_test("Types-Garde CRUD", False, "No authentication token")
            return False
        
        try:
            # Test GET - List types garde
            response = self.session.get(f"{self.base_url}/types-garde")
            if response.status_code != 200:
                self.log_test("Types-Garde CRUD", False, f"Failed to fetch types-garde: {response.status_code}")
                return False
            
            initial_types = response.json()
            
            # Test POST - Create new type garde
            test_type_garde = {
                "nom": f"Test Garde {uuid.uuid4().hex[:8]}",
                "heure_debut": "08:00",
                "heure_fin": "16:00",
                "personnel_requis": 3,
                "duree_heures": 8,
                "couleur": "#FF5733",
                "jours_application": ["monday", "tuesday", "wednesday"],
                "officier_obligatoire": True
            }
            
            response = self.session.post(f"{self.base_url}/types-garde", json=test_type_garde)
            if response.status_code != 200:
                self.log_test("Types-Garde CRUD", False, f"Failed to create type-garde: {response.status_code}")
                return False
            
            created_type = response.json()
            type_garde_id = created_type["id"]
            
            # Test PUT - Update type garde
            updated_data = test_type_garde.copy()
            updated_data["nom"] = f"Updated {updated_data['nom']}"
            
            response = self.session.put(f"{self.base_url}/types-garde/{type_garde_id}", json=updated_data)
            if response.status_code != 200:
                self.log_test("Types-Garde CRUD", False, f"Failed to update type-garde: {response.status_code}")
                return False
            
            # Test DELETE - Remove type garde
            response = self.session.delete(f"{self.base_url}/types-garde/{type_garde_id}")
            if response.status_code != 200:
                self.log_test("Types-Garde CRUD", False, f"Failed to delete type-garde: {response.status_code}")
                return False
            
            self.log_test("Types-Garde CRUD", True, "All CRUD operations successful")
            return True
            
        except Exception as e:
            self.log_test("Types-Garde CRUD", False, f"Types-garde CRUD error: {str(e)}")
            return False
    
    def test_formations_api(self):
        """Test Formations API endpoints"""
        if not self.auth_token:
            self.log_test("Formations API", False, "No authentication token")
            return False
        
        try:
            # Test GET - List formations
            response = self.session.get(f"{self.base_url}/formations")
            if response.status_code != 200:
                self.log_test("Formations API", False, f"Failed to fetch formations: {response.status_code}")
                return False
            
            formations = response.json()
            
            # Test POST - Create formation
            test_formation = {
                "nom": f"Test Formation {uuid.uuid4().hex[:8]}",
                "description": "Formation de test pour l'API",
                "duree_heures": 4,
                "validite_mois": 12,
                "obligatoire": False
            }
            
            response = self.session.post(f"{self.base_url}/formations", json=test_formation)
            if response.status_code != 200:
                self.log_test("Formations API", False, f"Failed to create formation: {response.status_code}")
                return False
            
            created_formation = response.json()
            formation_id = created_formation["id"]
            
            # Test PUT - Update formation
            updated_formation = test_formation.copy()
            updated_formation["nom"] = f"Updated {updated_formation['nom']}"
            
            response = self.session.put(f"{self.base_url}/formations/{formation_id}", json=updated_formation)
            if response.status_code != 200:
                self.log_test("Formations API", False, f"Failed to update formation: {response.status_code}")
                return False
            
            # Test DELETE - Remove formation
            response = self.session.delete(f"{self.base_url}/formations/{formation_id}")
            if response.status_code != 200:
                self.log_test("Formations API", False, f"Failed to delete formation: {response.status_code}")
                return False
            
            self.log_test("Formations API", True, f"All formation operations successful - Found {len(formations)} existing formations")
            return True
            
        except Exception as e:
            self.log_test("Formations API", False, f"Formations API error: {str(e)}")
            return False
    
    def test_users_management(self):
        """Test Users Management API"""
        if not self.auth_token:
            self.log_test("Users Management", False, "No authentication token")
            return False
        
        try:
            # Test GET - List users
            response = self.session.get(f"{self.base_url}/users")
            if response.status_code != 200:
                self.log_test("Users Management", False, f"Failed to fetch users: {response.status_code}")
                return False
            
            users = response.json()
            
            # Test POST - Create user (with complex password)
            test_user = {
                "nom": "TestUser",
                "prenom": "API",
                "email": f"test.user.{uuid.uuid4().hex[:8]}@firefighter.com",
                "telephone": "555-0123",
                "contact_urgence": "555-0124",
                "grade": "Pompier",
                "fonction_superieur": False,
                "type_emploi": "temps_plein",
                "heures_max_semaine": 40,
                "role": "employe",
                "numero_employe": f"EMP{uuid.uuid4().hex[:6].upper()}",
                "date_embauche": "2024-01-15",
                "formations": [],
                "mot_de_passe": "TestPass123!"
            }
            
            response = self.session.post(f"{self.base_url}/users", json=test_user)
            if response.status_code != 200:
                self.log_test("Users Management", False, f"Failed to create user: {response.status_code}", 
                            {"response": response.text})
                return False
            
            created_user = response.json()
            user_id = created_user["id"]
            
            # Test GET - Get specific user
            response = self.session.get(f"{self.base_url}/users/{user_id}")
            if response.status_code != 200:
                self.log_test("Users Management", False, f"Failed to fetch specific user: {response.status_code}")
                return False
            
            # Test DELETE - Remove test user
            response = self.session.delete(f"{self.base_url}/users/{user_id}")
            if response.status_code != 200:
                self.log_test("Users Management", False, f"Failed to delete user: {response.status_code}")
                return False
            
            self.log_test("Users Management", True, f"All user operations successful - Found {len(users)} existing users")
            return True
            
        except Exception as e:
            self.log_test("Users Management", False, f"Users management error: {str(e)}")
            return False
    
    def test_settings_api(self):
        """Test Settings API endpoints"""
        if not self.auth_token:
            self.log_test("Settings API", False, "No authentication token")
            return False
        
        try:
            # Test GET - Retrieve replacement parameters
            response = self.session.get(f"{self.base_url}/parametres/remplacements")
            if response.status_code != 200:
                self.log_test("Settings API", False, f"Failed to fetch replacement parameters: {response.status_code}")
                return False
            
            current_params = response.json()
            
            # Test PUT - Update replacement parameters
            updated_params = {
                "mode_notification": "sequentiel",
                "taille_groupe": 5,
                "delai_attente_heures": 48,
                "max_contacts": 8,
                "priorite_grade": True,
                "priorite_competences": False
            }
            
            response = self.session.put(f"{self.base_url}/parametres/remplacements", json=updated_params)
            if response.status_code != 200:
                self.log_test("Settings API", False, f"Failed to update replacement parameters: {response.status_code}")
                return False
            
            # Verify the update
            response = self.session.get(f"{self.base_url}/parametres/remplacements")
            if response.status_code != 200:
                self.log_test("Settings API", False, f"Failed to verify updated parameters: {response.status_code}")
                return False
            
            updated_result = response.json()
            
            # Check if the update was successful
            if updated_result.get("mode_notification") == "sequentiel" and updated_result.get("delai_attente_heures") == 48:
                self.log_test("Settings API", True, "Replacement parameters retrieved and updated successfully")
                
                # Restore original parameters
                self.session.put(f"{self.base_url}/parametres/remplacements", json=current_params)
                return True
            else:
                self.log_test("Settings API", False, "Parameter update verification failed")
                return False
            
        except Exception as e:
            self.log_test("Settings API", False, f"Settings API error: {str(e)}")
            return False
    
    def test_notification_system(self):
        """Test notification system endpoints"""
        if not self.auth_token:
            self.log_test("Notification System", False, "No authentication token")
            return False
        
        try:
            # Test notification-related endpoints
            endpoints_to_test = [
                "/notifications",
                "/demandes-remplacement",  # This creates notifications
                "/remplacements"
            ]
            
            working_endpoints = []
            for endpoint in endpoints_to_test:
                try:
                    response = self.session.get(f"{self.base_url}{endpoint}")
                    if response.status_code == 200:
                        working_endpoints.append(endpoint)
                    elif response.status_code == 403:
                        # Forbidden - endpoint exists but access denied
                        working_endpoints.append(f"{endpoint} (access restricted)")
                except:
                    continue
            
            if working_endpoints:
                self.log_test("Notification System", True, f"Found notification endpoints: {', '.join(working_endpoints)}")
                return True
            else:
                self.log_test("Notification System", False, "No notification endpoints accessible")
                return False
            
        except Exception as e:
            self.log_test("Notification System", False, f"Notification system error: {str(e)}")
            return False
    
    def test_planning_endpoints(self):
        """Test Planning-related endpoints"""
        if not self.auth_token:
            self.log_test("Planning Endpoints", False, "No authentication token")
            return False
        
        try:
            # Test planning for current week
            from datetime import datetime, timedelta
            today = datetime.now()
            monday = today - timedelta(days=today.weekday())
            week_start = monday.strftime("%Y-%m-%d")
            
            # Test GET planning
            response = self.session.get(f"{self.base_url}/planning/{week_start}")
            if response.status_code != 200:
                self.log_test("Planning Endpoints", False, f"Failed to fetch planning: {response.status_code}")
                return False
            
            planning_data = response.json()
            
            # Test GET assignations
            response = self.session.get(f"{self.base_url}/planning/assignations/{week_start}")
            if response.status_code != 200:
                self.log_test("Planning Endpoints", False, f"Failed to fetch assignations: {response.status_code}")
                return False
            
            assignations = response.json()
            
            self.log_test("Planning Endpoints", True, f"Planning endpoints working - Found {len(assignations)} assignations for week {week_start}")
            return True
            
        except Exception as e:
            self.log_test("Planning Endpoints", False, f"Planning endpoints error: {str(e)}")
            return False
    
    def test_replacement_system(self):
        """Test Replacement system functionality"""
        if not self.auth_token:
            self.log_test("Replacement System", False, "No authentication token")
            return False
        
        try:
            # Test GET replacement requests
            response = self.session.get(f"{self.base_url}/remplacements")
            if response.status_code != 200:
                self.log_test("Replacement System", False, f"Failed to fetch replacement requests: {response.status_code}")
                return False
            
            replacements = response.json()
            
            # Test GET leave requests (demandes-conge)
            response = self.session.get(f"{self.base_url}/demandes-conge")
            if response.status_code != 200:
                self.log_test("Replacement System", False, f"Failed to fetch leave requests: {response.status_code}")
                return False
            
            leave_requests = response.json()
            
            self.log_test("Replacement System", True, f"Replacement system working - Found {len(replacements)} replacement requests and {len(leave_requests)} leave requests")
            return True
            
        except Exception as e:
            self.log_test("Replacement System", False, f"Replacement system error: {str(e)}")
            return False
    
    def create_admin_user_if_needed(self):
        """Create admin user if it doesn't exist"""
        try:
            # Try to create admin user with the expected credentials
            admin_user = {
                "nom": "Administrator",
                "prenom": "System",
                "email": TEST_ADMIN_EMAIL,
                "telephone": "555-0001",
                "contact_urgence": "555-0002",
                "grade": "Directeur",
                "fonction_superieur": True,
                "type_emploi": "temps_plein",
                "heures_max_semaine": 40,
                "role": "admin",
                "numero_employe": "ADMIN001",
                "date_embauche": "2024-01-01",
                "formations": [],
                "mot_de_passe": TEST_ADMIN_PASSWORD
            }
            
            # This will fail if we're not authenticated, but that's expected
            response = self.session.post(f"{self.base_url}/users", json=admin_user)
            if response.status_code == 200:
                self.log_test("Admin User Creation", True, "Admin user created successfully")
                return True
            else:
                self.log_test("Admin User Creation", False, f"Could not create admin user: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Admin User Creation", False, f"Admin user creation error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("\n🔥 ProFireManager Backend API Testing Suite")
        print("=" * 50)
        print(f"Testing against: {self.base_url}")
        print(f"Admin credentials: {TEST_ADMIN_EMAIL}")
        print("=" * 50)
        
        # Test 1: Server Health
        if not self.test_server_health():
            print("\n❌ Server is not responding. Cannot continue with tests.")
            return False
        
        # Test 2: Authentication
        auth_success = self.test_admin_authentication()
        if not auth_success:
            print("\n⚠️  Authentication failed. Trying to create admin user...")
            # This will likely fail without auth, but worth trying
            self.create_admin_user_if_needed()
            print("\n❌ Cannot proceed with authenticated tests without valid credentials.")
            print("\n💡 Please ensure admin user exists with credentials:")
            print(f"   Email: {TEST_ADMIN_EMAIL}")
            print(f"   Password: {TEST_ADMIN_PASSWORD}")
            return False
        
        # Test 3: JWT Validation
        self.test_jwt_validation()
        
        # Test 4: Database Connectivity
        self.test_database_connectivity()
        
        # Test 5: Core API Endpoints
        self.test_types_garde_crud()
        self.test_formations_api()
        self.test_users_management()
        
        # Test 6: Settings and Notifications
        self.test_settings_api()
        self.test_notification_system()
        
        # Test 7: Additional Core Functionality
        self.test_planning_endpoints()
        self.test_replacement_system()
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
        
        return passed == total

if __name__ == "__main__":
    tester = ProFireManagerTester()
    success = tester.run_all_tests()
    
    # Save detailed results to file
    with open("/app/backend_test_results.json", "w") as f:
        json.dump(tester.test_results, f, indent=2)
    
    print(f"\n📄 Detailed results saved to: /app/backend_test_results.json")
    
    sys.exit(0 if success else 1)
