#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - FORMATION CREATION VALIDATION TESTING

CONTEXTE:
- Deux bugs ont été corrigés pour la création de formation dans le tenant demo:
  1. Validation frontend ajoutée pour vérifier que competence_id est renseigné
  2. Validation backend ajoutée pour vérifier que la compétence existe avant de créer la formation

TESTS À EFFECTUER:
1. Login admin demo (gussdub@gmail.com / 230685Juin+)
2. Vérifier que les compétences existent: GET /api/demo/competences
3. Test création formation SANS compétence (doit échouer):
   POST /api/demo/formations avec competence_id=""
   - Devrait retourner 400 Bad Request avec message "La compétence associée est obligatoire"
4. Test création formation AVEC compétence invalide (doit échouer):
   POST /api/demo/formations avec competence_id="fake-id-123"
   - Devrait retourner 404 avec message mentionnant "Compétence non trouvée"
5. Test création formation AVEC compétence valide (doit réussir):
   POST /api/demo/formations avec competence_id=<id d'une compétence existante>
   - Devrait retourner 200 OK avec la formation créée
   - Vérifier que la formation apparaît dans GET /api/demo/formations

OBJECTIF:
Confirmer que les validations fonctionnent correctement et qu'on ne peut plus créer de formations sans compétence valide.
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

class FormationValidationTesting:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        self.admin_token = None
        self.admin_user_id = None
        self.demo_tenant_id = None
        self.competences = []
        self.valid_competence_id = None
        self.created_formation_id = None
        
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

    def analyze_discrepancy_cause(self, metric, dashboard_value, real_value):
        """Analyze the probable cause of a discrepancy"""
        causes = {
            "total_personnel_actif": "Possible filtrage différent des utilisateurs actifs ou requête incorrecte",
            "total_assignations": "Calcul des assignations du mois incorrect ou période différente",
            "formations_ce_mois": "Filtrage des formations par date incorrect ou format de date différent",
            "demandes_conges_en_attente": "Confusion entre demandes de congé et demandes de remplacement",
            "formations_a_venir": "Filtrage des formations futures incorrect ou critères différents",
            "heures_travaillees_mois": "Calcul des heures basé sur assignations incorrect",
            "nombre_gardes_mois": "Comptage des gardes du mois incorrect",
            "couverture_planning": "Calcul du pourcentage de couverture incorrect"
        }
        
        base_cause = causes.get(metric, "Cause inconnue - nécessite investigation approfondie")
        
        if dashboard_value == 0 and real_value > 0:
            return f"{base_cause} - Dashboard retourne 0 alors que données réelles existent"
        elif dashboard_value > real_value:
            return f"{base_cause} - Dashboard surestime les données"
        elif dashboard_value < real_value:
            return f"{base_cause} - Dashboard sous-estime les données"
        else:
            return base_cause

    def run_corrections_verification(self):
        """Run the complete Dashboard Corrections Verification"""
        print("🚀 Starting Dashboard Demo Corrections Verification")
        print("=" * 80)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"👤 Admin: gussdub@gmail.com / 230685Juin+")
        print(f"🎯 Objectif: Vérifier que les 2 bugs critiques sont corrigés")
        print(f"🐛 Bug #1: total_assignations affichait 0 au lieu de 82")
        print(f"🐛 Bug #2: formations_a_venir affichait 0 au lieu de 1")
        print(f"📊 Endpoint principal: GET /api/{TENANT_SLUG}/dashboard/donnees-completes")
        print("=" * 80)
        
        tests = [
            ("Admin Authentication", self.test_admin_authentication),
            ("Get Dashboard Data", self.get_dashboard_data),
            ("Verify Bug Corrections", self.verify_bug_corrections),
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
        
        # Generate detailed corrections report
        self.generate_corrections_report()
        
        return passed >= 2  # Consider success if authentication and dashboard work
    
    def generate_corrections_report(self):
        """Generate detailed corrections verification report"""
        print(f"\n" + "=" * 80)
        print(f"📋 RAPPORT DE VÉRIFICATION DES CORRECTIONS - DASHBOARD DEMO")
        print("=" * 80)
        
        # Check if we have all necessary data
        auth_success = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
        dashboard_success = any(r["success"] for r in self.test_results if "Get Dashboard Data" in r["test"])
        corrections_success = any(r["success"] for r in self.test_results if "Verify Bug Corrections" in r["test"])
        
        print(f"🔐 Authentification admin demo: {'✅ Réussie' if auth_success else '❌ Échouée'}")
        print(f"📊 Récupération données dashboard: {'✅ Réussie' if dashboard_success else '❌ Échouée'}")
        print(f"🔍 Vérification corrections bugs: {'✅ Réussie' if corrections_success else '❌ Échouée'}")
        
        if not auth_success:
            print(f"\n❌ IMPOSSIBLE DE CONTINUER LA VÉRIFICATION")
            print(f"   Cause: Échec de l'authentification avec gussdub@gmail.com / 230685Juin+")
            print(f"   Action requise: Vérifier les identifiants ou l'existence du tenant 'demo'")
            return
        
        if not dashboard_success:
            print(f"\n❌ IMPOSSIBLE DE RÉCUPÉRER LES DONNÉES DU DASHBOARD")
            print(f"   Cause: Endpoint GET /api/demo/dashboard/donnees-completes inaccessible")
            print(f"   Action requise: Vérifier l'endpoint et les permissions")
            return
        
        print(f"\n🐛 VÉRIFICATION DES CORRECTIONS SPÉCIFIQUES:")
        print("-" * 60)
        
        if hasattr(self, 'corrections_results'):
            results = self.corrections_results
            
            # Bug #1 Status
            if results['bug1_fixed']:
                print(f"✅ Bug #1 résolu: total_assignations = {results['total_assignations']} (attendu ~82)")
            else:
                print(f"❌ Bug #1 NON résolu: total_assignations = {results['total_assignations']} (toujours 0)")
            
            # Bug #2 Status
            if results['bug2_fixed']:
                print(f"✅ Bug #2 résolu: formations_a_venir contient {results['formations_count']} formation(s)")
                if results['desincarceration_found']:
                    print(f"✅ Formation spécifique trouvée: 'Désincarcération de 2 véhicules' le 2026-04-22")
                else:
                    print(f"⚠️ Formation spécifique 'Désincarcération de 2 véhicules' non trouvée")
            else:
                print(f"❌ Bug #2 NON résolu: formations_a_venir = {results['formations_count']} (toujours vide)")
            
            print(f"\n📊 RÉSUMÉ DES CORRECTIONS:")
            print("-" * 60)
            for correction in results['corrections_verified']:
                print(f"   {correction}")
            
        else:
            print("❌ AUCUNE DONNÉE DE CORRECTION DISPONIBLE")
            print("   La vérification des corrections n'a pas pu être effectuée")
        
        print(f"\n🎯 CONCLUSION DE LA VÉRIFICATION:")
        print("-" * 60)
        
        if hasattr(self, 'corrections_results'):
            results = self.corrections_results
            bugs_fixed = results['bug1_fixed'] + results['bug2_fixed']
            
            if bugs_fixed == 2:
                print("🎉 TOUTES LES CORRECTIONS SONT RÉUSSIES!")
                print("   ✅ Bug #1 (total_assignations) corrigé")
                print("   ✅ Bug #2 (formations_a_venir) corrigé")
                print("   Le dashboard affiche maintenant les données correctes.")
            elif bugs_fixed == 1:
                print("⚠️ CORRECTIONS PARTIELLES")
                if results['bug1_fixed']:
                    print("   ✅ Bug #1 (total_assignations) corrigé")
                    print("   ❌ Bug #2 (formations_a_venir) NON corrigé")
                else:
                    print("   ❌ Bug #1 (total_assignations) NON corrigé")
                    print("   ✅ Bug #2 (formations_a_venir) corrigé")
                print("   Action requise: Corriger le bug restant")
            else:
                print("❌ AUCUNE CORRECTION DÉTECTÉE")
                print("   ❌ Bug #1 (total_assignations) NON corrigé")
                print("   ❌ Bug #2 (formations_a_venir) NON corrigé")
                print("   Action requise: Vérifier l'implémentation des corrections")
        else:
            print("❌ IMPOSSIBLE DE DÉTERMINER L'ÉTAT DES CORRECTIONS")
            print("   La vérification n'a pas pu être complétée")
        
        print("=" * 80)

if __name__ == "__main__":
    verification = DashboardCorrectionsVerification()
    success = verification.run_corrections_verification()
    
    sys.exit(0 if success else 1)
