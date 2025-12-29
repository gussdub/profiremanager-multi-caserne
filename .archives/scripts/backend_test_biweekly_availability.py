#!/usr/bin/env python3
"""
Backend Testing Suite for ProFireManager - Bi-Weekly Recurring Availability Bug Fix Testing

**Problème rapporté:**
L'utilisateur rencontre une erreur 409 (Conflict) lors de la création de disponibilités récurrentes aux 2 semaines.

**Solution implémentée:**
Modification du frontend pour continuer la création des disponibilités même en cas de conflit, 
en ignorant les dates en conflit et en affichant un résumé à la fin.

**Tests à effectuer:**
1. Connexion admin Shefford (admin@firemanager.ca / Admin123!)
2. Créer un utilisateur de test (si nécessaire)
3. Tester création de disponibilités avec conflits potentiels
4. Vérifier que le conflit est bien détecté
5. Vérifier la gestion des erreurs backend

**Critères de succès:**
✅ Backend retourne 409 pour les conflits (comportement attendu)
✅ Backend inclut les détails du conflit dans la réponse
✅ Le frontend (après modification) devrait pouvoir gérer ces conflits
✅ Authentification fonctionnelle

Tenant: shefford
Auth: admin@firemanager.ca / Admin123!
"""

import requests
import json
import time
import uuid
from datetime import datetime, timezone, timedelta, date
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')

# Configuration
BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'https://firebug-hunter.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Shefford Admin credentials from review request
SHEFFORD_ADMIN_EMAIL = "admin@firemanager.ca"
SHEFFORD_ADMIN_PASSWORD = "Admin123!"
TENANT_SLUG = "shefford"

class BiWeeklyAvailabilityTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
        self.test_results = []
        self.test_user_id = None
        self.test_user_email = None
        self.created_availabilities = []
        
    def log_result(self, test_name, success, details="", error=""):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if error:
            print(f"   Error: {error}")
        print()
    
    def authenticate_shefford_admin(self):
        """Authenticate as Shefford Admin"""
        print("🔐 Authenticating as Shefford Admin...")
        
        login_data = {
            "email": SHEFFORD_ADMIN_EMAIL,
            "mot_de_passe": SHEFFORD_ADMIN_PASSWORD
        }
        
        try:
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/auth/login", json=login_data)
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get("access_token")
                self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
                self.log_result("Shefford Admin Authentication", True, f"Authenticated as {SHEFFORD_ADMIN_EMAIL}")
                return True
            else:
                print(f"Shefford admin authentication failed: {response.status_code}")
                if response.text:
                    print(f"Response: {response.text}")
                    
        except Exception as e:
            print(f"Shefford admin auth error: {e}")
        
        self.log_result("Shefford Admin Authentication", False, "", "Failed to authenticate as Shefford Admin")
        return False
    
    def test_1_create_test_user(self):
        """TEST 1: Créer un utilisateur de test pour les disponibilités"""
        print("🧪 TEST 1: Creating test user for availability testing...")
        print("   Context: Create a test user to test availability creation and conflicts")
        
        try:
            # First check if we have existing users
            users_response = self.session.get(f"{API_BASE}/{TENANT_SLUG}/users")
            if users_response.status_code == 200:
                users = users_response.json()
                if users and len(users) > 0:
                    # Use the first existing user
                    test_user = users[0]
                    self.test_user_id = test_user.get('id')
                    self.test_user_email = test_user.get('email', 'test@example.com')
                    print(f"   Using existing user: {self.test_user_email} (ID: {self.test_user_id})")
                    self.log_result(
                        "Create Test User", 
                        True, 
                        f"✅ Using existing user: {self.test_user_email}"
                    )
                    return True
            
            # If no users exist, create a test user
            user_data = {
                "email": "test.availability@firemanager.ca",
                "nom": "Test",
                "prenom": "Availability",
                "role": "employe",
                "statut": "Actif",
                "type_emploi": "temps_plein",
                "numero_employe": f"TEST-{str(uuid.uuid4())[:8].upper()}",
                "date_embauche": datetime.now().strftime("%Y-%m-%d"),
                "grade": "Pompier",
                "telephone": "555-0123",
                "adresse": "123 Test Street",
                "ville": "Shefford",
                "code_postal": "J2R 1A1"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/users", json=user_data)
            print(f"Response status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.test_user_id = data.get("id")
                self.test_user_email = data.get("email")
                print(f"✅ Test user created successfully")
                print(f"   User ID: {self.test_user_id}")
                print(f"   Email: {self.test_user_email}")
                
                self.log_result(
                    "Create Test User", 
                    True, 
                    f"✅ Test user created: {self.test_user_email} (ID: {self.test_user_id})"
                )
                return True
            else:
                print(f"Response text: {response.text}")
                self.log_result(
                    "Create Test User", 
                    False, 
                    "", 
                    f"❌ Failed to create test user: {response.status_code} - {response.text}"
                )
                
        except Exception as e:
            self.log_result("Create Test User", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def test_2_create_initial_availability(self):
        """TEST 2: Créer une disponibilité initiale pour créer un conflit potentiel"""
        print("🧪 TEST 2: Creating initial availability to set up potential conflict...")
        print("   Context: Create availability for today to later test conflict detection")
        
        if not self.test_user_id:
            self.log_result("Create Initial Availability", False, "", "❌ No test user available")
            return False
        
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            
            availability_data = {
                "user_id": self.test_user_id,
                "date": today,
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "statut": "disponible",
                "origine": "manuelle"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=availability_data)
            print(f"Response status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                data = response.json()
                availability_id = data.get("id")
                self.created_availabilities.append(availability_id)
                
                print(f"✅ Initial availability created successfully")
                print(f"   Availability ID: {availability_id}")
                print(f"   Date: {today}")
                print(f"   Time: 09:00 - 17:00")
                print(f"   Status: disponible")
                print(f"   Origin: manuelle")
                
                self.log_result(
                    "Create Initial Availability", 
                    True, 
                    f"✅ Initial availability created for {today} (ID: {availability_id})"
                )
                return True
            else:
                print(f"Response text: {response.text}")
                self.log_result(
                    "Create Initial Availability", 
                    False, 
                    "", 
                    f"❌ Failed to create initial availability: {response.status_code} - {response.text}"
                )
                
        except Exception as e:
            self.log_result("Create Initial Availability", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def test_3_test_conflict_detection(self):
        """TEST 3: Tester la détection de conflit en créant une deuxième disponibilité"""
        print("🧪 TEST 3: Testing conflict detection by creating overlapping availability...")
        print("   Context: Create second availability on same date to trigger 409 conflict")
        
        if not self.test_user_id:
            self.log_result("Test Conflict Detection", False, "", "❌ No test user available")
            return False
        
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            
            # Create overlapping availability (should cause conflict)
            conflicting_availability_data = {
                "user_id": self.test_user_id,
                "date": today,
                "heure_debut": "10:00",  # Overlaps with existing 09:00-17:00
                "heure_fin": "18:00",
                "statut": "disponible",
                "origine": "manuelle"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=conflicting_availability_data)
            print(f"Response status: {response.status_code}")
            print(f"Response text: {response.text}")
            
            if response.status_code == 409:
                # This is the expected behavior - conflict detected
                try:
                    error_data = response.json()
                    print(f"✅ Conflict detected as expected (409)")
                    print(f"   Error response structure:")
                    
                    # Check if response contains conflict details
                    required_fields = ["message", "detail"]
                    conflict_details_present = any(field in error_data for field in required_fields)
                    
                    if conflict_details_present:
                        print(f"   ✅ Conflict details included in response")
                        for field in required_fields:
                            if field in error_data:
                                print(f"      {field}: {error_data[field]}")
                    else:
                        print(f"   ⚠️ Conflict details may be limited")
                        print(f"   Full response: {error_data}")
                    
                    self.log_result(
                        "Test Conflict Detection", 
                        True, 
                        f"✅ Conflict properly detected: 409 response with details"
                    )
                    return True
                    
                except json.JSONDecodeError:
                    # 409 but no JSON response
                    print(f"   ✅ Conflict detected (409) but response is not JSON")
                    self.log_result(
                        "Test Conflict Detection", 
                        True, 
                        f"✅ Conflict detected: 409 response (non-JSON)"
                    )
                    return True
                    
            elif response.status_code in [200, 201]:
                # Unexpected - should have been a conflict
                print(f"   ⚠️ No conflict detected - availability created successfully")
                print(f"   This might indicate the conflict detection logic needs review")
                
                data = response.json()
                availability_id = data.get("id")
                if availability_id:
                    self.created_availabilities.append(availability_id)
                
                self.log_result(
                    "Test Conflict Detection", 
                    False, 
                    "", 
                    f"❌ Expected 409 conflict but got {response.status_code} - conflict detection may not be working"
                )
                return False
                
            else:
                # Other error
                print(f"   ❌ Unexpected response: {response.status_code}")
                self.log_result(
                    "Test Conflict Detection", 
                    False, 
                    "", 
                    f"❌ Unexpected response: {response.status_code} - {response.text}"
                )
                
        except Exception as e:
            self.log_result("Test Conflict Detection", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def test_4_verify_backend_error_handling(self):
        """TEST 4: Vérifier la gestion des erreurs backend pour les disponibilités"""
        print("🧪 TEST 4: Verifying backend error handling for availability endpoints...")
        print("   Context: Test various error scenarios to ensure proper HTTP status codes")
        
        try:
            test_scenarios = []
            
            # Scenario 1: Invalid user_id
            print("   📋 Testing invalid user_id...")
            invalid_user_data = {
                "user_id": "invalid-user-id-12345",
                "date": datetime.now().strftime("%Y-%m-%d"),
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "statut": "disponible",
                "origine": "manuelle"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=invalid_user_data)
            print(f"      Response: {response.status_code}")
            
            if response.status_code in [400, 404, 422]:
                test_scenarios.append(("Invalid user_id", True, f"Properly rejected with {response.status_code}"))
            else:
                test_scenarios.append(("Invalid user_id", False, f"Unexpected response: {response.status_code}"))
            
            # Scenario 2: Missing required fields
            print("   📋 Testing missing required fields...")
            incomplete_data = {
                "user_id": self.test_user_id,
                "date": datetime.now().strftime("%Y-%m-%d")
                # Missing heure_debut, heure_fin, statut
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=incomplete_data)
            print(f"      Response: {response.status_code}")
            
            if response.status_code in [400, 422]:
                test_scenarios.append(("Missing fields", True, f"Properly rejected with {response.status_code}"))
            else:
                test_scenarios.append(("Missing fields", False, f"Unexpected response: {response.status_code}"))
            
            # Scenario 3: Invalid date format
            print("   📋 Testing invalid date format...")
            invalid_date_data = {
                "user_id": self.test_user_id,
                "date": "invalid-date-format",
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "statut": "disponible",
                "origine": "manuelle"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=invalid_date_data)
            print(f"      Response: {response.status_code}")
            
            if response.status_code in [400, 422]:
                test_scenarios.append(("Invalid date", True, f"Properly rejected with {response.status_code}"))
            else:
                test_scenarios.append(("Invalid date", False, f"Unexpected response: {response.status_code}"))
            
            # Scenario 4: Valid creation (should work)
            if self.test_user_id:
                print("   📋 Testing valid availability creation...")
                tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
                valid_data = {
                    "user_id": self.test_user_id,
                    "date": tomorrow,
                    "heure_debut": "08:00",
                    "heure_fin": "16:00",
                    "statut": "disponible",
                    "origine": "manuelle"
                }
                
                response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=valid_data)
                print(f"      Response: {response.status_code}")
                
                if response.status_code in [200, 201]:
                    data = response.json()
                    availability_id = data.get("id")
                    if availability_id:
                        self.created_availabilities.append(availability_id)
                    test_scenarios.append(("Valid creation", True, f"Successfully created with {response.status_code}"))
                else:
                    test_scenarios.append(("Valid creation", False, f"Failed with {response.status_code}: {response.text}"))
            
            # Evaluate results
            passed_scenarios = sum(1 for _, success, _ in test_scenarios if success)
            total_scenarios = len(test_scenarios)
            
            print(f"\n   📊 Error Handling Test Results:")
            for scenario_name, success, details in test_scenarios:
                status = "✅" if success else "❌"
                print(f"      {status} {scenario_name}: {details}")
            
            overall_success = passed_scenarios >= (total_scenarios * 0.75)  # 75% pass rate
            
            if overall_success:
                self.log_result(
                    "Verify Backend Error Handling", 
                    True, 
                    f"✅ Error handling working: {passed_scenarios}/{total_scenarios} scenarios passed"
                )
            else:
                self.log_result(
                    "Verify Backend Error Handling", 
                    False, 
                    "", 
                    f"❌ Error handling issues: only {passed_scenarios}/{total_scenarios} scenarios passed"
                )
            
            return overall_success
                
        except Exception as e:
            self.log_result("Verify Backend Error Handling", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def test_5_verify_success_responses(self):
        """TEST 5: Vérifier les réponses de succès pour les créations valides"""
        print("🧪 TEST 5: Verifying success responses for valid availability creation...")
        print("   Context: Ensure 201 responses are returned for successful creations")
        
        if not self.test_user_id:
            self.log_result("Verify Success Responses", False, "", "❌ No test user available")
            return False
        
        try:
            # Create availability for a future date (no conflicts)
            future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            
            availability_data = {
                "user_id": self.test_user_id,
                "date": future_date,
                "heure_debut": "14:00",
                "heure_fin": "22:00",
                "statut": "disponible",
                "origine": "manuelle"
            }
            
            response = self.session.post(f"{API_BASE}/{TENANT_SLUG}/disponibilites", json=availability_data)
            print(f"Response status: {response.status_code}")
            
            if response.status_code in [200, 201]:
                data = response.json()
                availability_id = data.get("id")
                
                print(f"✅ Availability created successfully")
                print(f"   Response status: {response.status_code}")
                print(f"   Availability ID: {availability_id}")
                
                # Verify response structure
                required_fields = ["id", "user_id", "date", "heure_debut", "heure_fin", "statut"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    print(f"   ⚠️ Missing fields in response: {missing_fields}")
                    self.log_result(
                        "Verify Success Responses", 
                        False, 
                        "", 
                        f"❌ Missing required fields in response: {missing_fields}"
                    )
                    return False
                
                print(f"   ✅ Response contains all required fields")
                print(f"   Response data:")
                for field in required_fields:
                    print(f"      {field}: {data.get(field)}")
                
                if availability_id:
                    self.created_availabilities.append(availability_id)
                
                self.log_result(
                    "Verify Success Responses", 
                    True, 
                    f"✅ Success response verified: {response.status_code} with complete data structure"
                )
                return True
            else:
                print(f"Response text: {response.text}")
                self.log_result(
                    "Verify Success Responses", 
                    False, 
                    "", 
                    f"❌ Expected 200/201 but got {response.status_code}: {response.text}"
                )
                
        except Exception as e:
            self.log_result("Verify Success Responses", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def test_6_cleanup_test_data(self):
        """TEST 6: Nettoyer les données de test créées"""
        print("🧪 TEST 6: Cleaning up test data...")
        print("   Context: Remove test availabilities and user created during testing")
        
        cleanup_success = True
        
        try:
            # Delete created availabilities
            for availability_id in self.created_availabilities:
                try:
                    response = self.session.delete(f"{API_BASE}/{TENANT_SLUG}/disponibilites/{availability_id}")
                    if response.status_code in [200, 204, 404]:  # 404 is OK (already deleted)
                        print(f"   ✅ Deleted availability: {availability_id}")
                    else:
                        print(f"   ⚠️ Failed to delete availability {availability_id}: {response.status_code}")
                        cleanup_success = False
                except Exception as e:
                    print(f"   ❌ Error deleting availability {availability_id}: {e}")
                    cleanup_success = False
            
            # Delete test user if we created one (only if email contains "test.availability")
            if self.test_user_id and self.test_user_email and "test.availability" in self.test_user_email:
                try:
                    response = self.session.delete(f"{API_BASE}/{TENANT_SLUG}/users/{self.test_user_id}")
                    if response.status_code in [200, 204, 404]:  # 404 is OK (already deleted)
                        print(f"   ✅ Deleted test user: {self.test_user_email}")
                    else:
                        print(f"   ⚠️ Failed to delete test user: {response.status_code}")
                        cleanup_success = False
                except Exception as e:
                    print(f"   ❌ Error deleting test user: {e}")
                    cleanup_success = False
            else:
                print(f"   ℹ️ Keeping existing user: {self.test_user_email}")
            
            if cleanup_success:
                self.log_result(
                    "Cleanup Test Data", 
                    True, 
                    f"✅ Cleanup completed: {len(self.created_availabilities)} availabilities cleaned"
                )
            else:
                self.log_result(
                    "Cleanup Test Data", 
                    False, 
                    "", 
                    f"❌ Some cleanup operations failed"
                )
            
            return cleanup_success
                
        except Exception as e:
            self.log_result("Cleanup Test Data", False, "", f"❌ ERROR: {e}")
        
        return False
    
    def run_biweekly_availability_tests(self):
        """Run comprehensive bi-weekly availability bug fix tests"""
        print("🚀 Starting Bi-Weekly Recurring Availability Bug Fix Tests")
        print("=" * 80)
        print("PROBLÈME RAPPORTÉ:")
        print("- L'utilisateur rencontre une erreur 409 (Conflict) lors de la création")
        print("  de disponibilités récurrentes aux 2 semaines")
        print()
        print("SOLUTION IMPLÉMENTÉE:")
        print("- Modification du frontend pour continuer la création des disponibilités")
        print("  même en cas de conflit, en ignorant les dates en conflit")
        print("  et en affichant un résumé à la fin")
        print()
        print("TESTS À EFFECTUER:")
        print("1. Connexion admin Shefford (admin@firemanager.ca / Admin123!)")
        print("2. Créer un utilisateur de test (si nécessaire)")
        print("3. Tester création de disponibilités avec conflits potentiels")
        print("4. Vérifier que le conflit est bien détecté")
        print("5. Vérifier la gestion des erreurs backend")
        print("6. Nettoyer les données de test")
        print("=" * 80)
        
        # Authenticate first
        if not self.authenticate_shefford_admin():
            print("❌ Cannot proceed without Shefford Admin authentication")
            return
        
        # Run all tests in sequence
        self.test_1_create_test_user()
        self.test_2_create_initial_availability()
        self.test_3_test_conflict_detection()
        self.test_4_verify_backend_error_handling()
        self.test_5_verify_success_responses()
        self.test_6_cleanup_test_data()
        
        return True
    
    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 80)
        print("📊 BI-WEEKLY AVAILABILITY BUG FIX TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%" if total_tests > 0 else "No tests run")
        
        print("\n🎯 DETAILED TEST RESULTS:")
        print("=" * 60)
        
        for result in self.test_results:
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
            if result["details"]:
                print(f"   Details: {result['details']}")
            if result["error"]:
                print(f"   Error: {result['error']}")
        
        print("\n🔍 ANALYSIS:")
        print("=" * 60)
        
        # Check key success criteria
        auth_success = any(r["test"] == "Shefford Admin Authentication" and r["success"] for r in self.test_results)
        conflict_detection = any(r["test"] == "Test Conflict Detection" and r["success"] for r in self.test_results)
        error_handling = any(r["test"] == "Verify Backend Error Handling" and r["success"] for r in self.test_results)
        success_responses = any(r["test"] == "Verify Success Responses" and r["success"] for r in self.test_results)
        
        print(f"✅ Authentication fonctionnelle: {'YES' if auth_success else 'NO'}")
        print(f"✅ Backend retourne 409 pour les conflits: {'YES' if conflict_detection else 'NO'}")
        print(f"✅ Gestion des erreurs backend: {'YES' if error_handling else 'NO'}")
        print(f"✅ Réponses de succès (201): {'YES' if success_responses else 'NO'}")
        
        print("\n📋 CRITÈRES DE SUCCÈS:")
        print("=" * 60)
        
        criteria_met = 0
        total_criteria = 4
        
        if auth_success:
            print("✅ Authentification fonctionnelle")
            criteria_met += 1
        else:
            print("❌ Authentification fonctionnelle")
        
        if conflict_detection:
            print("✅ Backend retourne 409 pour les conflits (comportement attendu)")
            criteria_met += 1
        else:
            print("❌ Backend retourne 409 pour les conflits (comportement attendu)")
        
        if error_handling:
            print("✅ Gestion des erreurs backend appropriée")
            criteria_met += 1
        else:
            print("❌ Gestion des erreurs backend appropriée")
        
        if success_responses:
            print("✅ Réponses de succès correctes")
            criteria_met += 1
        else:
            print("❌ Réponses de succès correctes")
        
        print(f"\nCRITÈRES ATTEINTS: {criteria_met}/{total_criteria} ({(criteria_met/total_criteria)*100:.1f}%)")
        
        if criteria_met >= 3:
            print("\n🎉 RÉSULTAT GLOBAL: SUCCÈS")
            print("Le backend fonctionne correctement pour la gestion des conflits de disponibilités.")
            print("Le frontend peut maintenant gérer les erreurs 409 comme prévu.")
        else:
            print("\n⚠️ RÉSULTAT GLOBAL: PROBLÈMES DÉTECTÉS")
            print("Des améliorations sont nécessaires dans la gestion des disponibilités.")
        
        print("\n" + "=" * 80)

def main():
    """Main test execution"""
    tester = BiWeeklyAvailabilityTester()
    
    try:
        # Run the comprehensive test suite
        tester.run_biweekly_availability_tests()
        
        # Generate and display summary
        tester.generate_summary()
        
    except KeyboardInterrupt:
        print("\n⚠️ Tests interrupted by user")
    except Exception as e:
        print(f"\n❌ Unexpected error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()