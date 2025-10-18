#!/usr/bin/env python3
"""
DIAGNOSTIC TEST - Vérification de l'endpoint GET /users/{user_id} pour "Mon Profil"

PROBLÈME RAPPORTÉ:
Les champs (date_embauche, taux_horaire, numero_employe, grade) s'affichent dans le module "Personnel" 
mais PAS dans "Mon Profil".

OBJECTIF:
Confirmer si le problème vient du backend (API ne retourne pas les champs) ou du frontend (ne les affiche pas).

TENANT: shefford
USER: admin@firemanager.ca / Admin123!
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://competence-profile.preview.emergentagent.com/api"
TENANT_SLUG = "shefford"
ADMIN_EMAIL = "admin@firemanager.ca"
ADMIN_PASSWORD = "Admin123!"

# Super Admin credentials (fallback)
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

class DiagnosticTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.admin_user_id = None
        
    def log_result(self, message, data=None):
        """Log diagnostic results"""
        print(f"🔍 {message}")
        if data:
            print(f"   📊 Data: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    def authenticate_admin(self):
        """Authenticate as admin and get user ID"""
        try:
            # First try to authenticate with the expected admin credentials
            login_data = {
                "email": ADMIN_EMAIL,
                "mot_de_passe": ADMIN_PASSWORD
            }
            
            # Try tenant-specific login first
            response = self.session.post(f"{self.base_url}/{TENANT_SLUG}/auth/login", json=login_data)
            if response.status_code != 200:
                # Try legacy login
                response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "access_token" in data:
                    self.auth_token = data["access_token"]
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    
                    # Get admin user ID from login response
                    user_info = data.get("user", {})
                    self.admin_user_id = user_info.get("id")
                    
                    self.log_result(f"✅ Authentification réussie pour {user_info.get('email', 'admin')}")
                    self.log_result(f"📋 ID utilisateur admin: {self.admin_user_id}")
                    return True
            
            # If admin doesn't exist, try to create it using Super Admin
            self.log_result(f"⚠️ Admin {ADMIN_EMAIL} n'existe pas, tentative de création via Super Admin")
            
            # Authenticate as Super Admin
            super_admin_login = {
                "email": SUPER_ADMIN_EMAIL,
                "mot_de_passe": SUPER_ADMIN_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/admin/auth/login", json=super_admin_login)
            if response.status_code != 200:
                self.log_result(f"❌ Échec connexion Super Admin: {response.status_code}")
                return False
            
            super_admin_data = response.json()
            super_admin_token = super_admin_data["access_token"]
            
            # Create admin user for Shefford tenant
            # First get Shefford tenant ID
            super_admin_session = requests.Session()
            super_admin_session.headers.update({"Authorization": f"Bearer {super_admin_token}"})
            
            response = super_admin_session.get(f"{self.base_url}/admin/tenants")
            if response.status_code != 200:
                self.log_result(f"❌ Échec récupération tenants: {response.status_code}")
                return False
            
            tenants = response.json()
            shefford_tenant = None
            for tenant in tenants:
                if tenant.get("slug") == TENANT_SLUG:
                    shefford_tenant = tenant
                    break
            
            if not shefford_tenant:
                self.log_result(f"❌ Tenant {TENANT_SLUG} non trouvé")
                return False
            
            # Create admin user
            admin_user_data = {
                "email": ADMIN_EMAIL,
                "prenom": "Admin",
                "nom": "Shefford",
                "mot_de_passe": ADMIN_PASSWORD
            }
            
            response = super_admin_session.post(
                f"{self.base_url}/admin/tenants/{shefford_tenant['id']}/create-admin", 
                json=admin_user_data
            )
            
            if response.status_code == 200:
                self.log_result(f"✅ Admin {ADMIN_EMAIL} créé avec succès")
                # Now try to authenticate again
                return self.authenticate_admin()
            else:
                self.log_result(f"❌ Échec création admin: {response.status_code}", {"response": response.text})
                return False
                
        except Exception as e:
            self.log_result(f"❌ Erreur d'authentification: {str(e)}")
            return False
    
    def test_get_user_by_id(self):
        """Test GET /api/shefford/users/{user_id} endpoint"""
        if not self.auth_token or not self.admin_user_id:
            self.log_result("❌ Pas de token d'authentification ou d'ID utilisateur")
            return False
            
        try:
            # Call GET /api/shefford/users/{admin_id}
            response = self.session.get(f"{self.base_url}/{TENANT_SLUG}/users/{self.admin_user_id}")
            
            if response.status_code != 200:
                self.log_result(f"❌ Échec de récupération utilisateur: {response.status_code}", 
                              {"response": response.text})
                return False
            
            user_data = response.json()
            
            self.log_result("✅ Réponse de l'API GET /users/{user_id} reçue")
            
            # Check for required fields
            required_fields = [
                "date_embauche",
                "taux_horaire", 
                "numero_employe",
                "grade",
                "adresse",
                "telephone",
                "contact_urgence"
            ]
            
            present_fields = []
            missing_fields = []
            field_values = {}
            
            for field in required_fields:
                if field in user_data:
                    present_fields.append(field)
                    field_values[field] = user_data[field]
                else:
                    missing_fields.append(field)
            
            # Display complete JSON response
            self.log_result("📄 RÉPONSE JSON COMPLÈTE de GET /users/{user_id}:")
            print(json.dumps(user_data, indent=2, ensure_ascii=False))
            
            # Analysis
            print("\n" + "="*70)
            print("📊 ANALYSE DES CHAMPS REQUIS:")
            print("="*70)
            
            if present_fields:
                print(f"✅ CHAMPS PRÉSENTS ({len(present_fields)}):")
                for field in present_fields:
                    value = field_values[field]
                    value_type = type(value).__name__
                    print(f"   • {field}: {value} (type: {value_type})")
            
            if missing_fields:
                print(f"\n❌ CHAMPS MANQUANTS ({len(missing_fields)}):")
                for field in missing_fields:
                    print(f"   • {field}")
            
            # Determine if this is a backend or frontend issue
            print("\n" + "="*70)
            print("🎯 DIAGNOSTIC:")
            print("="*70)
            
            if missing_fields:
                print("❌ PROBLÈME BACKEND CONFIRMÉ!")
                print(f"   L'API GET /users/{{user_id}} ne retourne PAS les champs: {', '.join(missing_fields)}")
                print("   Le problème vient du backend, pas du frontend.")
            else:
                print("✅ BACKEND OK - Tous les champs sont présents dans l'API")
                print("   Le problème vient probablement du frontend qui n'affiche pas ces champs.")
            
            return len(missing_fields) == 0
            
        except Exception as e:
            self.log_result(f"❌ Erreur lors du test GET /users/{{user_id}}: {str(e)}")
            return False
    
    def compare_with_users_list(self):
        """Compare with GET /users endpoint (used by Personnel module)"""
        if not self.auth_token:
            self.log_result("❌ Pas de token d'authentification")
            return False
            
        try:
            # Call GET /api/shefford/users (list endpoint)
            response = self.session.get(f"{self.base_url}/{TENANT_SLUG}/users")
            
            if response.status_code != 200:
                self.log_result(f"❌ Échec de récupération liste utilisateurs: {response.status_code}")
                return False
            
            users_list = response.json()
            
            # Find admin user in the list
            admin_user_in_list = None
            for user in users_list:
                if user.get("id") == self.admin_user_id:
                    admin_user_in_list = user
                    break
            
            if not admin_user_in_list:
                self.log_result("❌ Utilisateur admin non trouvé dans la liste")
                return False
            
            # Check fields in list endpoint
            required_fields = [
                "date_embauche",
                "taux_horaire", 
                "numero_employe",
                "grade",
                "adresse",
                "telephone",
                "contact_urgence"
            ]
            
            list_present_fields = []
            list_missing_fields = []
            
            for field in required_fields:
                if field in admin_user_in_list:
                    list_present_fields.append(field)
                else:
                    list_missing_fields.append(field)
            
            print("\n" + "="*70)
            print("🔄 COMPARAISON AVEC L'ENDPOINT /users (Personnel):")
            print("="*70)
            
            if list_present_fields:
                print(f"✅ CHAMPS PRÉSENTS dans /users ({len(list_present_fields)}):")
                for field in list_present_fields:
                    value = admin_user_in_list[field]
                    print(f"   • {field}: {value}")
            
            if list_missing_fields:
                print(f"\n❌ CHAMPS MANQUANTS dans /users ({len(list_missing_fields)}):")
                for field in list_missing_fields:
                    print(f"   • {field}")
            
            return len(list_missing_fields) == 0
            
        except Exception as e:
            self.log_result(f"❌ Erreur lors de la comparaison avec /users: {str(e)}")
            return False
    
    def run_diagnostic(self):
        """Run complete diagnostic"""
        print("🚀 DIAGNOSTIC - Vérification endpoint GET /users/{user_id}")
        print("="*70)
        print(f"🏢 Tenant: {TENANT_SLUG}")
        print(f"👤 Utilisateur: {ADMIN_EMAIL}")
        print(f"🔗 URL de base: {self.base_url}")
        print("="*70)
        
        # Step 1: Authenticate
        if not self.authenticate_admin():
            print("\n❌ ÉCHEC: Impossible de s'authentifier")
            return False
        
        # Step 2: Test individual user endpoint
        print(f"\n🧪 TEST 1: GET /api/{TENANT_SLUG}/users/{self.admin_user_id}")
        individual_success = self.test_get_user_by_id()
        
        # Step 3: Compare with list endpoint
        print(f"\n🧪 TEST 2: Comparaison avec GET /api/{TENANT_SLUG}/users")
        list_success = self.compare_with_users_list()
        
        # Final conclusion
        print("\n" + "="*70)
        print("🎯 CONCLUSION FINALE:")
        print("="*70)
        
        if individual_success and list_success:
            print("✅ AUCUN PROBLÈME BACKEND DÉTECTÉ")
            print("   Tous les champs sont présents dans les deux endpoints.")
            print("   Le problème est probablement dans le frontend (affichage).")
        elif not individual_success and not list_success:
            print("❌ PROBLÈME BACKEND CONFIRMÉ - Les deux endpoints manquent des champs")
        elif not individual_success and list_success:
            print("❌ PROBLÈME SPÉCIFIQUE à GET /users/{user_id}")
            print("   L'endpoint individuel manque des champs que l'endpoint liste a.")
        else:
            print("⚠️ SITUATION INHABITUELLE")
            print("   L'endpoint individuel a des champs que l'endpoint liste n'a pas.")
        
        return individual_success

if __name__ == "__main__":
    tester = DiagnosticTester()
    success = tester.run_diagnostic()
    
    print(f"\n{'='*70}")
    print("📋 RÉSUMÉ:")
    print(f"{'='*70}")
    
    if success:
        print("✅ L'API backend retourne tous les champs requis")
        print("🔍 Vérifiez le frontend pour voir pourquoi ils ne s'affichent pas")
    else:
        print("❌ L'API backend ne retourne PAS tous les champs requis")
        print("🔧 Le problème doit être corrigé dans le backend")
    
    sys.exit(0 if success else 1)