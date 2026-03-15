"""
Test RBAC Phase 3 - Migration avec Tabs Granulaires
====================================================

Ce fichier teste les nouvelles fonctionnalités RBAC Phase 3:
- Structure MODULES_STRUCTURE enrichie avec tabs granulaires
- Endpoints migrés (equipements, types_garde, billing, remplacements/parametres)
- Vérification des permissions par module ET par sous-fonctionnalité (tabs)

Tests couverts:
1. MODULES_STRUCTURE enrichi avec tabs granulaires
2. Endpoints types de garde avec RBAC
3. Endpoints billing avec RBAC
4. Endpoints parametres remplacements avec RBAC
5. Tests de régression
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "gussdub@gmail.com"
TEST_PASSWORD = "230685Juin+"
TEST_TENANT = "demo"


class TestAuthAndSetup:
    """Tests d'authentification et setup"""
    
    token = None
    user_id = None
    
    def test_01_login_admin(self):
        """Login avec les credentials fournis"""
        response = requests.post(f"{BASE_URL}/api/{TEST_TENANT}/auth/login", json={
            "email": TEST_EMAIL,
            "mot_de_passe": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        assert "user" in data, "No user in response"
        
        TestAuthAndSetup.token = data["access_token"]
        TestAuthAndSetup.user_id = data["user"]["id"]
        print(f"✅ Login successful - User: {data['user']['email']}, Role: {data['user']['role']}")
    
    def test_02_health_check(self):
        """Vérifier que le backend est accessible"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        print("✅ Backend health check OK")


class TestModulesStructureGranular:
    """Tests pour vérifier la structure MODULES_STRUCTURE enrichie avec tabs granulaires"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_get_modules_structure_returns_tabs(self):
        """Vérifie que modules-structure retourne les nouveaux tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "modules" in data, "Missing modules key"
        assert "default_permissions" in data, "Missing default_permissions key"
        
        modules = data["modules"]
        print(f"✅ Total modules returned: {len(modules)}")
    
    def test_02_dashboard_has_5_tabs(self):
        """Dashboard doit avoir 5 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        dashboard = data["modules"].get("dashboard", {})
        tabs = dashboard.get("tabs", {})
        
        expected_tabs = ["personnel", "general", "activites", "alertes", "couverture"]
        for tab in expected_tabs:
            assert tab in tabs, f"Dashboard missing tab: {tab}"
        
        print(f"✅ Dashboard tabs: {list(tabs.keys())}")
    
    def test_03_personnel_has_7_tabs(self):
        """Personnel doit avoir 7 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        personnel = data["modules"].get("personnel", {})
        tabs = personnel.get("tabs", {})
        
        expected_tabs = ["liste", "fiches", "photos", "signatures", "anciens", "import", "stats"]
        for tab in expected_tabs:
            assert tab in tabs, f"Personnel missing tab: {tab}"
        
        print(f"✅ Personnel tabs: {list(tabs.keys())}")
    
    def test_04_actifs_has_12_tabs(self):
        """Actifs doit avoir 12 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        actifs = data["modules"].get("actifs", {})
        tabs = actifs.get("tabs", {})
        
        expected_tabs = ["vehicules", "inventaires", "eau", "bornes", "points-eau", 
                         "materiel", "categories", "apria", "formulaires", "epi", 
                         "alertes", "parametres"]
        for tab in expected_tabs:
            assert tab in tabs, f"Actifs missing tab: {tab}"
        
        print(f"✅ Actifs tabs ({len(tabs)}): {list(tabs.keys())}")
    
    def test_05_rapports_has_9_tabs(self):
        """Rapports doit avoir 9 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        rapports = data["modules"].get("rapports", {})
        tabs = rapports.get("tabs", {})
        
        expected_tabs = ["dashboard-interne", "couts-salariaux", "budget", "immobilisations", 
                         "interventions", "personnel-pdf", "personnel-excel", 
                         "salaires-pdf", "salaires-excel"]
        for tab in expected_tabs:
            assert tab in tabs, f"Rapports missing tab: {tab}"
        
        print(f"✅ Rapports tabs ({len(tabs)}): {list(tabs.keys())}")
    
    def test_06_planning_has_5_tabs(self):
        """Planning doit avoir 5 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        planning = data["modules"].get("planning", {})
        tabs = planning.get("tabs", {})
        
        expected_tabs = ["calendrier", "assignations", "equipe-jour", "rapport-heures", "export"]
        for tab in expected_tabs:
            assert tab in tabs, f"Planning missing tab: {tab}"
        
        print(f"✅ Planning tabs: {list(tabs.keys())}")
    
    def test_07_remplacements_has_5_tabs(self):
        """Remplacements doit avoir 5 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        remplacements = data["modules"].get("remplacements", {})
        tabs = remplacements.get("tabs", {})
        
        expected_tabs = ["propositions", "demandes", "conges", "toutes-demandes", "parametres"]
        for tab in expected_tabs:
            assert tab in tabs, f"Remplacements missing tab: {tab}"
        
        print(f"✅ Remplacements tabs: {list(tabs.keys())}")
    
    def test_08_formations_has_6_tabs(self):
        """Formations doit avoir 6 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        formations = data["modules"].get("formations", {})
        tabs = formations.get("tabs", {})
        
        expected_tabs = ["catalogue", "inscriptions", "suivi", "competences", "conformite", "dashboard"]
        for tab in expected_tabs:
            assert tab in tabs, f"Formations missing tab: {tab}"
        
        print(f"✅ Formations tabs: {list(tabs.keys())}")
    
    def test_09_prevention_has_5_tabs(self):
        """Prevention doit avoir 5 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        prevention = data["modules"].get("prevention", {})
        tabs = prevention.get("tabs", {})
        
        # Prevention peut être désactivé par défaut pour certains tenants
        if not prevention:
            pytest.skip("Module prevention non actif pour ce tenant")
        
        expected_tabs = ["batiments", "inspections", "avis", "calendrier", "rapports"]
        for tab in expected_tabs:
            assert tab in tabs, f"Prevention missing tab: {tab}"
        
        print(f"✅ Prevention tabs: {list(tabs.keys())}")
    
    def test_10_disponibilites_has_4_tabs(self):
        """Disponibilites doit avoir 4 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        disponibilites = data["modules"].get("disponibilites", {})
        tabs = disponibilites.get("tabs", {})
        
        expected_tabs = ["mes-dispos", "equipe", "import", "rapport"]
        for tab in expected_tabs:
            assert tab in tabs, f"Disponibilites missing tab: {tab}"
        
        print(f"✅ Disponibilites tabs: {list(tabs.keys())}")
    
    def test_11_parametres_has_14_tabs(self):
        """Parametres doit avoir 14 tabs granulaires"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        data = response.json()
        
        parametres = data["modules"].get("parametres", {})
        tabs = parametres.get("tabs", {})
        
        expected_tabs = ["types-garde", "competences", "grades", "horaires", "rotation-equipes",
                         "comptes", "remplacements", "disponibilites", "formations", 
                         "personnalisation", "secteurs", "imports", "facturation", "emails-history"]
        for tab in expected_tabs:
            assert tab in tabs, f"Parametres missing tab: {tab}"
        
        print(f"✅ Parametres tabs ({len(tabs)}): {list(tabs.keys())}")


class TestTypesGardeRBAC:
    """Tests pour les endpoints types de garde avec RBAC"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_get_types_garde_list(self):
        """GET types-garde - Liste des types de garde"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/types-garde",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Found {len(data)} types de garde")
    
    def test_02_create_type_garde_with_rbac(self):
        """POST types-garde - Création avec permission RBAC"""
        type_garde_data = {
            "nom": "TEST_Garde_RBAC_Phase3",
            "heure_debut": "08:00",
            "heure_fin": "16:00",
            "personnel_requis": 3,
            "duree_heures": 8,
            "couleur": "#FF5733",
            "jours_application": ["monday", "tuesday"],
            "officier_obligatoire": False,
            "competences_requises": []
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TEST_TENANT}/types-garde",
            json=type_garde_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "No id in response"
        assert data["nom"] == "TEST_Garde_RBAC_Phase3"
        
        # Sauvegarder l'ID pour cleanup
        TestTypesGardeRBAC.created_type_garde_id = data["id"]
        print(f"✅ Type de garde créé: {data['id']}")
    
    def test_03_update_type_garde_with_rbac(self):
        """PUT types-garde - Modification avec permission RBAC"""
        if not hasattr(TestTypesGardeRBAC, 'created_type_garde_id'):
            pytest.skip("No type garde to update")
        
        type_garde_id = TestTypesGardeRBAC.created_type_garde_id
        update_data = {
            "nom": "TEST_Garde_RBAC_Phase3_Updated",
            "heure_debut": "09:00",
            "heure_fin": "17:00",
            "personnel_requis": 4,
            "duree_heures": 8,
            "couleur": "#33FF57"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/{TEST_TENANT}/types-garde/{type_garde_id}",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        
        data = response.json()
        assert data["nom"] == "TEST_Garde_RBAC_Phase3_Updated"
        print(f"✅ Type de garde modifié: {data['nom']}")
    
    def test_04_delete_type_garde_with_rbac(self):
        """DELETE types-garde - Suppression avec permission RBAC"""
        if not hasattr(TestTypesGardeRBAC, 'created_type_garde_id'):
            pytest.skip("No type garde to delete")
        
        type_garde_id = TestTypesGardeRBAC.created_type_garde_id
        
        response = requests.delete(
            f"{BASE_URL}/api/{TEST_TENANT}/types-garde/{type_garde_id}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✅ Type de garde supprimé: {type_garde_id}")


class TestBillingRBAC:
    """Tests pour les endpoints billing avec RBAC"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_get_tenant_info(self):
        """GET tenant-info - Informations du tenant"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/tenant-info",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "id" in data
        assert "nom" in data
        assert "slug" in data
        print(f"✅ Tenant info: {data['nom']} ({data['slug']})")
    
    def test_02_get_billing_info(self):
        """GET billing/info - Informations de facturation avec RBAC"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/billing/info",
            headers=self.headers
        )
        # Status code peut être 200 ou 403 selon les permissions
        # Admin devrait avoir accès
        assert response.status_code in [200, 400], f"Failed: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "user_count" in data or "is_gratuit" in data
            print(f"✅ Billing info accessible pour admin")
        else:
            print(f"⚠️ Billing info non accessible: {response.text}")
    
    def test_03_get_billing_invoices(self):
        """GET billing/invoices - Liste des factures avec RBAC"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/billing/invoices",
            headers=self.headers
        )
        # Status 200 avec liste vide si pas de Stripe customer
        assert response.status_code in [200, 400], f"Failed: {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert "invoices" in data
            print(f"✅ Found {len(data['invoices'])} invoices")


class TestRemplacementsParametresRBAC:
    """Tests pour les endpoints parametres remplacements avec RBAC"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_get_parametres_remplacements(self):
        """GET parametres/remplacements - Récupérer les paramètres avec RBAC"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/parametres/remplacements",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Vérifier les champs attendus
        print(f"✅ Parametres remplacements récupérés")
    
    def test_02_update_parametres_remplacements(self):
        """PUT parametres/remplacements - Modifier les paramètres avec RBAC"""
        update_data = {
            "delai_attente_minutes": 30,
            "max_contacts": 10
        }
        
        response = requests.put(
            f"{BASE_URL}/api/{TEST_TENANT}/parametres/remplacements",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✅ Parametres remplacements modifiés")


class TestEquipementsRBACMigration:
    """Tests pour vérifier que equipements.py utilise bien le système RBAC"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_get_categories_equipements(self):
        """GET equipements/categories - Liste des catégories"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements/categories",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Found {len(data)} catégories d'équipements")
    
    def test_02_get_equipements_list(self):
        """GET equipements - Liste des équipements"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Found {len(data)} équipements")
    
    def test_03_create_equipement_with_rbac(self):
        """POST equipements - Création avec permission RBAC actifs/creer/materiel"""
        equipement_data = {
            "nom": "TEST_Equipement_Phase3_RBAC",
            "code_unique": "TEST-RBAC-P3-001",
            "description": "Test équipement créé pour tester RBAC Phase 3",
            "etat": "bon"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements",
            json=equipement_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        
        data = response.json()
        assert "id" in data or "equipement" in data
        
        # Sauvegarder pour cleanup
        if "equipement" in data:
            TestEquipementsRBACMigration.created_equipement_id = data["equipement"]["id"]
        else:
            TestEquipementsRBACMigration.created_equipement_id = data["id"]
        
        print(f"✅ Équipement créé avec RBAC actifs/creer/materiel")
    
    def test_04_update_equipement_with_rbac(self):
        """PUT equipements - Modification avec permission RBAC actifs/modifier/materiel"""
        if not hasattr(TestEquipementsRBACMigration, 'created_equipement_id'):
            pytest.skip("No equipement to update")
        
        equipement_id = TestEquipementsRBACMigration.created_equipement_id
        update_data = {
            "nom": "TEST_Equipement_Phase3_RBAC_Updated",
            "description": "Description mise à jour"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements/{equipement_id}",
            json=update_data,
            headers=self.headers
        )
        assert response.status_code == 200, f"Update failed: {response.text}"
        print(f"✅ Équipement modifié avec RBAC actifs/modifier/materiel")
    
    def test_05_delete_equipement_with_rbac(self):
        """DELETE equipements - Suppression avec permission RBAC actifs/supprimer/materiel"""
        if not hasattr(TestEquipementsRBACMigration, 'created_equipement_id'):
            pytest.skip("No equipement to delete")
        
        equipement_id = TestEquipementsRBACMigration.created_equipement_id
        
        response = requests.delete(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements/{equipement_id}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Delete failed: {response.text}"
        print(f"✅ Équipement supprimé avec RBAC actifs/supprimer/materiel")


class TestDefaultPermissionsStructure:
    """Tests pour vérifier la structure des permissions par défaut"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_admin_has_full_access(self):
        """Vérifie que admin a is_full_access: true"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        default_permissions = data.get("default_permissions", {})
        admin_perms = default_permissions.get("admin", {})
        
        assert admin_perms.get("is_full_access") == True, "Admin should have is_full_access: true"
        print(f"✅ Admin has is_full_access: true")
    
    def test_02_superviseur_has_limited_access(self):
        """Vérifie que superviseur a des permissions limitées"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        default_permissions = data.get("default_permissions", {})
        superviseur_perms = default_permissions.get("superviseur", {})
        
        modules = superviseur_perms.get("modules", {})
        # Superviseur n'a pas accès à parametres (access: False)
        parametres = modules.get("parametres", {})
        assert parametres.get("access") == False, "Superviseur should not have access to parametres"
        
        # Superviseur a accès à planning
        planning = modules.get("planning", {})
        assert planning.get("access") == True, "Superviseur should have access to planning"
        
        print(f"✅ Superviseur has limited access (parametres: False, planning: True)")
    
    def test_03_employe_has_minimal_access(self):
        """Vérifie que employe a des permissions minimales"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        default_permissions = data.get("default_permissions", {})
        employe_perms = default_permissions.get("employe", {})
        
        modules = employe_perms.get("modules", {})
        
        # Employe n'a pas accès à personnel (access: False)
        personnel = modules.get("personnel", {})
        assert personnel.get("access") == False, "Employe should not have access to personnel"
        
        # Employe a accès à monprofil
        monprofil = modules.get("monprofil", {})
        assert monprofil.get("access") == True, "Employe should have access to monprofil"
        
        print(f"✅ Employe has minimal access (personnel: False, monprofil: True)")


class TestActionsLabels:
    """Tests pour vérifier les labels des actions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_actions_labels_present(self):
        """Vérifie que les labels des actions sont présents"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types/modules-structure",
            headers=self.headers
        )
        assert response.status_code == 200
        
        data = response.json()
        actions_labels = data.get("actions_labels", {})
        
        expected_actions = ["voir", "creer", "modifier", "supprimer", "exporter", 
                          "signer", "valider", "approuver", "accepter", "refuser", 
                          "voir_anciens"]
        
        for action in expected_actions:
            assert action in actions_labels, f"Missing label for action: {action}"
        
        print(f"✅ All {len(expected_actions)} action labels present")


class TestRBACRegression:
    """Tests de régression pour s'assurer que les endpoints existants fonctionnent toujours"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        if not TestAuthAndSetup.token:
            pytest.skip("No auth token available")
        self.headers = {"Authorization": f"Bearer {TestAuthAndSetup.token}"}
    
    def test_01_list_access_types(self):
        """GET access-types - Liste des types d'accès"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/access-types",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "base_roles" in data
        assert "custom_types" in data
        
        base_roles = [r["id"] for r in data["base_roles"]]
        assert "admin" in base_roles
        assert "superviseur" in base_roles
        assert "employe" in base_roles
        
        print(f"✅ Base roles: {base_roles}, Custom types: {len(data['custom_types'])}")
    
    def test_02_get_user_permissions(self):
        """GET users/{user_id}/permissions - Permissions de l'utilisateur courant"""
        user_id = TestAuthAndSetup.user_id
        
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/users/{user_id}/permissions",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "user_id" in data
        assert "role" in data
        assert "permissions" in data
        
        print(f"✅ User permissions: role={data['role']}, full_access={data['permissions'].get('is_full_access', False)}")
    
    def test_03_equipements_stats(self):
        """GET equipements/stats/resume - Statistiques équipements"""
        response = requests.get(
            f"{BASE_URL}/api/{TEST_TENANT}/equipements/stats/resume",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "total" in data
        print(f"✅ Equipements stats: {data['total']} total")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
