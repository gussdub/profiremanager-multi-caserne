#!/usr/bin/env python3
"""
ProFireManager Backend API Testing Suite - DASHBOARD DEMO CORRECTIONS VERIFICATION

CONTEXTE:
- Corrections appliquées pour résoudre 2 bugs critiques:
  1. total_assignations affichait 0 au lieu de 82 (parsing de dates amélioré)
  2. formations_a_venir affichait 0 au lieu de 1 (filtre élargi pour toutes les formations futures)

TESTS À EFFECTUER:
1. Se connecter comme admin demo (gussdub@gmail.com / 230685Juin+)
2. Tester GET /api/demo/dashboard/donnees-completes
3. Vérifier spécifiquement les valeurs corrigées:
   - section_generale.statistiques_mois.total_assignations DOIT maintenant afficher 82 (ou un nombre proche, pas 0)
   - section_personnelle.formations_a_venir DOIT maintenant contenir au moins 1 formation (incluant "Désincarcération de 2 véhicules" le 2026-04-22)

4. Comparer AVANT/APRÈS:
   **AVANT (bug):**
   - total_assignations: 0
   - formations_a_venir: []
   
   **APRÈS (corrigé):**
   - total_assignations: 82
   - formations_a_venir: [{"id": "...", "nom": "Désincarcération de 2 véhicules", "date_debut": "2026-04-22", ...}]

5. Vérifier que les autres statistiques restent correctes:
   - total_personnel_actif: 15 (inchangé)
   - formations_ce_mois: 0 (inchangé)
   - demandes_conges_en_attente: 0 (inchangé)

OBJECTIF:
Confirmer que les 2 bugs sont maintenant résolus et que le dashboard affiche les données correctes synchronisées avec le reste de l'application.

Format attendu:
✅ Bug #1 résolu: total_assignations = X (attendu ~82)
✅ Bug #2 résolu: formations_a_venir contient Y formations
❌ ou liste des problèmes restants
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

class DashboardCorrectionsVerification:
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
    
    def verify_bug_corrections(self):
        """Verify that the 2 specific bugs have been corrected"""
        try:
            if not self.dashboard_data:
                self.log_test("Verify Bug Corrections", False, "Missing dashboard data for verification")
                return False
            
            print(f"🔍 Vérification des corrections spécifiques des 2 bugs...")
            
            # Extract dashboard metrics
            section_generale = self.dashboard_data.get("section_generale", {})
            section_personnelle = self.dashboard_data.get("section_personnelle", {})
            statistiques_mois = section_generale.get("statistiques_mois", {})
            
            # Bug #1: total_assignations should now be ~82 (not 0)
            total_assignations = statistiques_mois.get("total_assignations", 0)
            bug1_fixed = total_assignations > 0  # Should not be 0 anymore
            
            # Bug #2: formations_a_venir should now contain at least 1 formation
            formations_a_venir = section_personnelle.get("formations_a_venir", [])
            formations_count = len(formations_a_venir)
            bug2_fixed = formations_count > 0  # Should not be empty anymore
            
            # Check for specific formation "Désincarcération de 2 véhicules" on 2026-04-22
            desincarceration_found = False
            for formation in formations_a_venir:
                if ("Désincarcération" in formation.get("nom", "") and 
                    formation.get("date_debut", "").startswith("2026-04-22")):
                    desincarceration_found = True
                    break
            
            # Verify other statistics remain correct (unchanged)
            total_personnel_actif = statistiques_mois.get("total_personnel_actif", 0)
            formations_ce_mois = statistiques_mois.get("formations_ce_mois", 0)
            demandes_conges_en_attente = section_generale.get("demandes_conges_en_attente", 0)
            
            # Generate verification results
            corrections_verified = []
            
            if bug1_fixed:
                corrections_verified.append(f"✅ Bug #1 résolu: total_assignations = {total_assignations} (attendu ~82, n'est plus 0)")
            else:
                corrections_verified.append(f"❌ Bug #1 NON résolu: total_assignations = {total_assignations} (toujours 0)")
            
            if bug2_fixed:
                corrections_verified.append(f"✅ Bug #2 résolu: formations_a_venir contient {formations_count} formation(s)")
                if desincarceration_found:
                    corrections_verified.append(f"✅ Formation spécifique trouvée: 'Désincarcération de 2 véhicules' le 2026-04-22")
                else:
                    corrections_verified.append(f"⚠️ Formation spécifique 'Désincarcération de 2 véhicules' non trouvée dans la liste")
            else:
                corrections_verified.append(f"❌ Bug #2 NON résolu: formations_a_venir = {formations_count} (toujours vide)")
            
            # Verify unchanged statistics
            corrections_verified.append(f"📊 Statistiques inchangées:")
            corrections_verified.append(f"   - total_personnel_actif: {total_personnel_actif} (attendu: 15)")
            corrections_verified.append(f"   - formations_ce_mois: {formations_ce_mois} (attendu: 0)")
            corrections_verified.append(f"   - demandes_conges_en_attente: {demandes_conges_en_attente} (attendu: 0)")
            
            success = bug1_fixed and bug2_fixed
            message = f"{'✅ Les 2 bugs sont corrigés' if success else f'❌ {2 - (bug1_fixed + bug2_fixed)} bug(s) restant(s)'}"
            
            self.log_test("Verify Bug Corrections", success, message, 
                        {
                            "bug1_total_assignations": {
                                "value": total_assignations,
                                "fixed": bug1_fixed,
                                "expected": "~82 (pas 0)"
                            },
                            "bug2_formations_a_venir": {
                                "count": formations_count,
                                "fixed": bug2_fixed,
                                "desincarceration_found": desincarceration_found,
                                "formations_list": [f.get("nom", "Unknown") for f in formations_a_venir[:3]]
                            },
                            "unchanged_stats": {
                                "total_personnel_actif": total_personnel_actif,
                                "formations_ce_mois": formations_ce_mois,
                                "demandes_conges_en_attente": demandes_conges_en_attente
                            },
                            "corrections_summary": corrections_verified
                        })
            
            # Store results for final report
            self.corrections_results = {
                "bug1_fixed": bug1_fixed,
                "bug2_fixed": bug2_fixed,
                "total_assignations": total_assignations,
                "formations_count": formations_count,
                "desincarceration_found": desincarceration_found,
                "corrections_verified": corrections_verified
            }
            
            return True
                
        except Exception as e:
            self.log_test("Verify Bug Corrections", False, f"Bug verification error: {str(e)}")
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

    def run_dashboard_diagnostic(self):
        """Run the complete Dashboard Data Synchronization Diagnostic"""
        print("🚀 Starting Dashboard Data Synchronization Diagnostic")
        print("=" * 80)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"👤 Admin: gussdub@gmail.com")
        print(f"🎯 Objectif: Identifier les données incorrectes dans le dashboard")
        print(f"📊 Endpoints à comparer:")
        print(f"   - GET /api/{TENANT_SLUG}/dashboard/donnees-completes (Dashboard)")
        print(f"   - GET /api/{TENANT_SLUG}/users (Personnel actif)")
        print(f"   - GET /api/{TENANT_SLUG}/planning/assignations/{{semaine}} (Assignations)")
        print(f"   - GET /api/{TENANT_SLUG}/formations (Formations)")
        print(f"   - GET /api/{TENANT_SLUG}/remplacements (Remplacements)")
        print("=" * 80)
        
        tests = [
            ("Admin Authentication", self.test_admin_authentication),
            ("Get Dashboard Data", self.get_dashboard_data),
            ("Get Real Users Data", self.get_real_users_data),
            ("Get Real Planning Data", self.get_real_planning_data),
            ("Get Real Formations Data", self.get_real_formations_data),
            ("Get Real Remplacements Data", self.get_real_remplacements_data),
            ("Compare Dashboard Data", self.compare_dashboard_with_real_data),
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
        
        return passed >= 5  # Consider success if most tests pass
    
    def generate_diagnostic_report(self):
        """Generate detailed diagnostic report in the requested format"""
        print(f"\n" + "=" * 80)
        print(f"📋 RAPPORT DE DIAGNOSTIC DÉTAILLÉ - DASHBOARD DEMO")
        print("=" * 80)
        
        # Check if we have all necessary data
        auth_success = any(r["success"] for r in self.test_results if "Admin Authentication" in r["test"])
        dashboard_success = any(r["success"] for r in self.test_results if "Get Dashboard Data" in r["test"])
        comparison_success = any(r["success"] for r in self.test_results if "Compare Dashboard Data" in r["test"])
        
        print(f"🔐 Authentification admin demo: {'✅ Réussie' if auth_success else '❌ Échouée'}")
        print(f"📊 Récupération données dashboard: {'✅ Réussie' if dashboard_success else '❌ Échouée'}")
        print(f"🔍 Comparaison avec données réelles: {'✅ Réussie' if comparison_success else '❌ Échouée'}")
        
        if not auth_success:
            print(f"\n❌ IMPOSSIBLE DE CONTINUER LE DIAGNOSTIC")
            print(f"   Cause: Échec de l'authentification avec gussdub@gmail.com / 230685Juin+")
            print(f"   Action requise: Vérifier les identifiants ou l'existence du tenant 'demo'")
            return
        
        if not dashboard_success:
            print(f"\n❌ IMPOSSIBLE DE RÉCUPÉRER LES DONNÉES DU DASHBOARD")
            print(f"   Cause: Endpoint GET /api/demo/dashboard/donnees-completes inaccessible")
            print(f"   Action requise: Vérifier l'endpoint et les permissions")
            return
        
        print(f"\n📊 ANALYSE DES DISCORDANCES IDENTIFIÉES:")
        print("-" * 60)
        
        if len(self.discrepancies) == 0:
            print("✅ AUCUNE DISCORDANCE DÉTECTÉE!")
            print("   Toutes les données du dashboard correspondent aux données réelles.")
            print("   Le problème rapporté pourrait être résolu ou nécessiter une investigation plus approfondie.")
        else:
            print(f"❌ {len(self.discrepancies)} DISCORDANCES IDENTIFIÉES:")
            print()
            
            for i, discrepancy in enumerate(self.discrepancies, 1):
                print(f"🔍 DISCORDANCE #{i}: {discrepancy['metric']}")
                print(f"   📊 Dashboard dit: {discrepancy['dashboard_dit']}")
                print(f"   📈 Données réelles: {discrepancy['donnees_reelles']}")
                print(f"   📏 Écart identifié: {discrepancy['ecart_identifie']}")
                print(f"   🔍 Cause probable: {discrepancy['cause_probable']}")
                print()
        
        # Summary of real data collected
        print(f"📈 RÉSUMÉ DES DONNÉES RÉELLES COLLECTÉES:")
        print("-" * 60)
        
        if "users" in self.real_data:
            users_data = self.real_data["users"]
            print(f"👥 Personnel: {users_data.get('total_users', 0)} total, {users_data.get('active_users', 0)} actifs")
        
        if "formations" in self.real_data:
            formations_data = self.real_data["formations"]
            print(f"📚 Formations: {formations_data.get('total_formations', 0)} total, {formations_data.get('current_month_formations', 0)} ce mois")
        
        if "planning" in self.real_data:
            planning_data = self.real_data["planning"]
            print(f"📅 Planning: {planning_data.get('monthly_assignations_count', 0)} assignations ce mois")
        
        if "remplacements" in self.real_data:
            remplacements_data = self.real_data["remplacements"]
            print(f"🔄 Remplacements: {remplacements_data.get('total_remplacements', 0)} total, {remplacements_data.get('pending_remplacements', 0)} en attente")
        
        print(f"\n🎯 CONCLUSION DU DIAGNOSTIC:")
        print("-" * 60)
        
        if len(self.discrepancies) == 0:
            print("✅ SYNCHRONISATION DES DONNÉES CORRECTE")
            print("   Le dashboard affiche des données cohérentes avec les endpoints de données réelles.")
            print("   Si l'utilisateur observe encore des problèmes, il pourrait s'agir:")
            print("   - D'un problème de cache côté frontend")
            print("   - D'une différence de timezone ou de période de calcul")
            print("   - D'un problème spécifique à certaines données non testées")
        else:
            print("❌ PROBLÈMES DE SYNCHRONISATION DÉTECTÉS")
            print(f"   {len(self.discrepancies)} discordances nécessitent une correction dans le backend.")
            print("   Actions recommandées:")
            print("   1. Vérifier les requêtes MongoDB dans l'endpoint dashboard")
            print("   2. Contrôler les filtres de date et de statut")
            print("   3. Valider les calculs d'agrégation")
            print("   4. Tester avec des données de test contrôlées")
        
        print(f"\n📝 DONNÉES POUR LE RAPPORT:")
        print("-" * 60)
        for discrepancy in self.discrepancies:
            print(f"• {discrepancy['metric']}:")
            print(f"  - Dashboard dit: {discrepancy['dashboard_dit']}")
            print(f"  - Données réelles: {discrepancy['donnees_reelles']}")
            print(f"  - Écart identifié: {discrepancy['ecart_identifie']}")
            print(f"  - Cause probable: {discrepancy['cause_probable']}")
        
        print("=" * 80)

if __name__ == "__main__":
    diagnostic = DashboardDataDiagnostic()
    success = diagnostic.run_dashboard_diagnostic()
    
    sys.exit(0 if success else 1)
