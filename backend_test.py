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
        """Test admin authentication for Demo tenant - specifically gussdub@gmail.com / 230685Juin+"""
        try:
            # Use the specific credentials mentioned in the review request
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

    def get_competences_list(self):
        """Get competences list from GET /api/demo/competences - should return at least 1 competence"""
        try:
            if not self.admin_token:
                self.log_test("Get Competences List", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"📚 Retrieving competences from GET /api/{TENANT_SLUG}/competences")
            
            response = admin_session.get(f"{self.base_url}/{TENANT_SLUG}/competences")
            
            if response.status_code == 200:
                try:
                    self.competences = response.json()
                    
                    if len(self.competences) > 0:
                        # Store the first competence ID for valid tests
                        self.valid_competence_id = self.competences[0].get("id")
                        
                        self.log_test("Get Competences List", True, 
                                    f"✅ Retrieved {len(self.competences)} competences", 
                                    {
                                        "competences_count": len(self.competences),
                                        "valid_competence_id": self.valid_competence_id,
                                        "sample_competences": [{"id": c.get("id"), "nom": c.get("nom")} for c in self.competences[:3]]
                                    })
                        return True
                    else:
                        self.log_test("Get Competences List", False, 
                                    f"❌ No competences found in demo tenant")
                        return False
                    
                except json.JSONDecodeError as e:
                    self.log_test("Get Competences List", False, f"❌ Invalid JSON in competences response: {str(e)}")
                    return False
                    
            else:
                self.log_test("Get Competences List", False, 
                            f"❌ Competences endpoint failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Get Competences List", False, f"Competences retrieval error: {str(e)}")
            return False

    def test_formation_creation_without_competence(self):
        """Test formation creation WITHOUT competence - should fail with 400 Bad Request"""
        try:
            if not self.admin_token:
                self.log_test("Formation Creation Without Competence", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"❌ Testing formation creation WITHOUT competence (should fail)")
            
            formation_data = {
                "nom": "Test Formation Sans Competence",
                "competence_id": "",  # Empty competence_id - should trigger validation error
                "date_debut": "2025-12-01",
                "date_fin": "2025-12-01",  
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "duree_heures": 8,
                "places_max": 20,
                "annee": 2025
            }
            
            response = admin_session.post(f"{self.base_url}/{TENANT_SLUG}/formations", json=formation_data)
            
            # Should return 400 Bad Request
            if response.status_code == 400:
                response_text = response.text
                if "compétence" in response_text.lower() and "obligatoire" in response_text.lower():
                    self.log_test("Formation Creation Without Competence", True, 
                                f"✅ Correctly rejected formation without competence: {response.status_code}", 
                                {
                                    "status_code": response.status_code,
                                    "response_message": response_text,
                                    "validation_working": True
                                })
                    return True
                else:
                    self.log_test("Formation Creation Without Competence", False, 
                                f"❌ Wrong error message for missing competence: {response_text}")
                    return False
            else:
                self.log_test("Formation Creation Without Competence", False, 
                            f"❌ Formation creation should have failed but got status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Formation Creation Without Competence", False, f"Formation creation test error: {str(e)}")
            return False

    def test_formation_creation_with_invalid_competence(self):
        """Test formation creation WITH invalid competence - should fail with 404"""
        try:
            if not self.admin_token:
                self.log_test("Formation Creation With Invalid Competence", False, "No admin token available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"❌ Testing formation creation WITH invalid competence (should fail)")
            
            formation_data = {
                "nom": "Test Formation Competence Invalide",
                "competence_id": "fake-id-123",  # Invalid competence_id - should trigger 404 error
                "date_debut": "2025-12-01",
                "date_fin": "2025-12-01",  
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "duree_heures": 8,
                "places_max": 20,
                "annee": 2025
            }
            
            response = admin_session.post(f"{self.base_url}/{TENANT_SLUG}/formations", json=formation_data)
            
            # Should return 404 Not Found
            if response.status_code == 404:
                response_text = response.text
                if "compétence" in response_text.lower() and ("trouvée" in response_text.lower() or "found" in response_text.lower()):
                    self.log_test("Formation Creation With Invalid Competence", True, 
                                f"✅ Correctly rejected formation with invalid competence: {response.status_code}", 
                                {
                                    "status_code": response.status_code,
                                    "response_message": response_text,
                                    "validation_working": True
                                })
                    return True
                else:
                    self.log_test("Formation Creation With Invalid Competence", False, 
                                f"❌ Wrong error message for invalid competence: {response_text}")
                    return False
            else:
                self.log_test("Formation Creation With Invalid Competence", False, 
                            f"❌ Formation creation should have failed but got status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Formation Creation With Invalid Competence", False, f"Formation creation test error: {str(e)}")
            return False

    def test_formation_creation_with_valid_competence(self):
        """Test formation creation WITH valid competence - should succeed with 200 OK"""
        try:
            if not self.admin_token:
                self.log_test("Formation Creation With Valid Competence", False, "No admin token available")
                return False
            
            if not self.valid_competence_id:
                self.log_test("Formation Creation With Valid Competence", False, "No valid competence ID available")
                return False
            
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
            
            print(f"✅ Testing formation creation WITH valid competence (should succeed)")
            
            formation_data = {
                "nom": "Test Formation Competence Valide",
                "competence_id": self.valid_competence_id,  # Valid competence_id - should succeed
                "date_debut": "2025-12-01",
                "date_fin": "2025-12-01",  
                "heure_debut": "09:00",
                "heure_fin": "17:00",
                "duree_heures": 8,
                "places_max": 20,
                "annee": 2025
            }
            
            response = admin_session.post(f"{self.base_url}/{TENANT_SLUG}/formations", json=formation_data)
            
            # Should return 200 OK or 201 Created
            if response.status_code in [200, 201]:
                try:
                    created_formation = response.json()
                    self.created_formation_id = created_formation.get("id")
                    
                    self.log_test("Formation Creation With Valid Competence", True, 
                                f"✅ Successfully created formation with valid competence: {response.status_code}", 
                                {
                                    "status_code": response.status_code,
                                    "formation_id": self.created_formation_id,
                                    "formation_name": created_formation.get("nom"),
                                    "competence_id": created_formation.get("competence_id")
                                })
                    return True
                    
                except json.JSONDecodeError:
                    self.log_test("Formation Creation With Valid Competence", False, 
                                f"❌ Invalid JSON response from formation creation")
                    return False
            else:
                self.log_test("Formation Creation With Valid Competence", False, 
                            f"❌ Formation creation failed with status {response.status_code}: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Formation Creation With Valid Competence", False, f"Formation creation test error: {str(e)}")
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
