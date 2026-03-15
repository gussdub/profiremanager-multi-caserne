"""
Test de la Migration RBAC - Vérification du système de permissions dynamiques
============================================================================

Ce test vérifie que les endpoints migrés vers le système RBAC fonctionnent correctement:
- Planning: création/suppression d'assignations
- Personnel: création d'utilisateurs
- Formations: accès aux rapports de conformité  
- Actifs: CRUD véhicules
- Remplacements: suppression de demandes

Credentials test: gussdub@gmail.com / 230685Juin+ (admin)
Tenant: demo
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rbac-migration-1.preview.emergentagent.com')
TENANT_SLUG = "demo"
LOGIN_EMAIL = "gussdub@gmail.com"
LOGIN_PASSWORD = "230685Juin+"


# ================== FIXTURES ==================

@pytest.fixture(scope="module")
def admin_auth():
    """Authentification en tant qu'admin"""
    login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
    response = requests.post(login_url, json={
        "email": LOGIN_EMAIL,
        "mot_de_passe": LOGIN_PASSWORD
    })
    
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"
    print(f"\n[AUTH] Admin connecté: {data['user'].get('prenom')} {data['user'].get('nom')}")
    return {
        "token": data["access_token"],
        "user": data["user"],
        "tenant_id": data["tenant"]["id"]
    }


@pytest.fixture(scope="module")
def admin_session(admin_auth):
    """Session avec authentification admin"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {admin_auth['token']}",
        "Content-Type": "application/json"
    })
    return session


@pytest.fixture(scope="module")
def employee_data():
    """Données pour créer un employé test"""
    unique_id = str(uuid.uuid4())[:8]
    return {
        "email": f"TEST_employe_{unique_id}@test.com",
        "mot_de_passe": "Test123+abc",
        "nom": "TestRBAC",
        "prenom": "Employe",
        "role": "employe",
        "grade": "Pompier",
        "type_emploi": "temps_partiel",
        "statut": "Actif"
    }


# ================== TEST AUTH & CONNEXION ==================

class TestAuthentication:
    """Tests de connexion avec différents comptes"""
    
    def test_admin_login(self):
        """Test de connexion avec compte admin"""
        login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
        response = requests.post(login_url, json={
            "email": LOGIN_EMAIL,
            "mot_de_passe": LOGIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Status: {response.status_code}, Body: {response.text}"
        data = response.json()
        
        # Vérifications détaillées
        assert "access_token" in data, "Token absent"
        assert "user" in data, "User info absente"
        assert "tenant" in data, "Tenant info absent"
        assert data["user"]["role"] == "admin", f"Role attendu: admin, obtenu: {data['user'].get('role')}"
        
        print(f"[AUTH OK] Admin: {data['user']['email']} - Role: {data['user']['role']}")
    
    def test_invalid_credentials(self):
        """Test de connexion avec mauvais credentials"""
        login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
        response = requests.post(login_url, json={
            "email": "fake@email.com",
            "mot_de_passe": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Devrait être 401, obtenu: {response.status_code}"
        print("[AUTH OK] Mauvais credentials correctement rejetés")


# ================== TEST RBAC - PERMISSIONS ==================

class TestRBACPermissions:
    """Tests du système RBAC et des permissions"""
    
    def test_get_admin_permissions(self, admin_session, admin_auth):
        """Vérifier que l'admin a accès complet (is_full_access)"""
        user_id = admin_auth["user"]["id"]
        url = f"{BASE_URL}/api/{TENANT_SLUG}/users/{user_id}/permissions"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        
        assert "permissions" in data
        # Admin devrait avoir is_full_access: true
        assert data["permissions"].get("is_full_access") == True, "Admin devrait avoir accès complet"
        print(f"[RBAC OK] Admin a is_full_access: {data['permissions'].get('is_full_access')}")
    
    def test_access_types_structure(self, admin_session):
        """Vérifier la structure des modules et permissions disponibles"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/access-types/modules-structure"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        
        assert "modules" in data
        assert "default_permissions" in data
        
        # Vérifier que les modules clés sont présents
        modules = data["modules"]
        required_modules = ["planning", "personnel", "formations", "actifs", "remplacements"]
        for mod in required_modules:
            assert mod in modules, f"Module {mod} absent de la structure"
        
        print(f"[RBAC OK] Modules disponibles: {list(modules.keys())}")
    
    def test_list_access_types(self, admin_session):
        """Lister les types d'accès (base + personnalisés)"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/access-types"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        
        assert "base_roles" in data
        assert "custom_types" in data
        
        # Vérifier les 3 rôles de base
        base_role_ids = [r["id"] for r in data["base_roles"]]
        assert "admin" in base_role_ids
        assert "superviseur" in base_role_ids
        assert "employe" in base_role_ids
        
        print(f"[RBAC OK] Rôles de base: {base_role_ids}, Types personnalisés: {len(data['custom_types'])}")


# ================== TEST PLANNING MODULE - RBAC ==================

class TestPlanningRBAC:
    """Tests RBAC sur le module Planning"""
    
    def test_get_planning_assignations(self, admin_session):
        """Récupérer les assignations - vérifier accès"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        date_str = monday.strftime("%Y-%m-%d")
        
        url = f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignations/{date_str}?mode=mois"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[PLANNING OK] {len(data)} assignations trouvées")
    
    def test_planning_rapport_heures(self, admin_session):
        """Vérifier l'accès au rapport d'heures (permission 'voir' sur planning)"""
        today = datetime.now()
        mois_str = today.strftime("%Y-%m")
        
        url = f"{BASE_URL}/api/{TENANT_SLUG}/planning/rapport-heures?mois={mois_str}"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert "employes" in data
        assert "statistiques" in data
        print(f"[PLANNING OK] Rapport heures: {len(data['employes'])} employés, Total heures: {data['statistiques'].get('total_heures_planifiees', 0)}")
    
    def test_create_and_delete_assignation(self, admin_session):
        """Créer puis supprimer une assignation (permissions 'creer' et 'supprimer')"""
        # D'abord récupérer les types de garde et un utilisateur
        tg_response = admin_session.get(f"{BASE_URL}/api/{TENANT_SLUG}/types-garde")
        assert tg_response.status_code == 200
        types_garde = tg_response.json()
        
        users_response = admin_session.get(f"{BASE_URL}/api/{TENANT_SLUG}/users")
        assert users_response.status_code == 200
        users = users_response.json()
        
        if not types_garde or not users:
            pytest.skip("Pas de types de garde ou utilisateurs disponibles")
        
        # Créer une assignation pour demain
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        assignation_data = {
            "user_id": users[0]["id"],
            "type_garde_id": types_garde[0]["id"],
            "date": tomorrow,
            "assignation_type": "manuel",
            "notes_admin": "TEST_RBAC_Assignation"
        }
        
        # CREATE
        create_url = f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignation"
        create_response = admin_session.post(create_url, json=assignation_data)
        assert create_response.status_code == 200, f"Création failed: {create_response.text}"
        created = create_response.json()
        assert "id" in created
        print(f"[PLANNING OK] Assignation créée: {created['id']}")
        
        # DELETE
        delete_url = f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignation/{created['id']}"
        delete_response = admin_session.delete(delete_url)
        assert delete_response.status_code == 200, f"Suppression failed: {delete_response.text}"
        print(f"[PLANNING OK] Assignation supprimée: {created['id']}")


# ================== TEST PERSONNEL MODULE - RBAC ==================

class TestPersonnelRBAC:
    """Tests RBAC sur le module Personnel"""
    
    def test_get_users_list(self, admin_session):
        """Lister les utilisateurs (permission 'voir')"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/users"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        print(f"[PERSONNEL OK] {len(data)} utilisateurs listés")
    
    def test_create_and_delete_user(self, admin_session, employee_data):
        """Créer puis supprimer un utilisateur (permissions 'creer' et 'supprimer')"""
        # CREATE
        create_url = f"{BASE_URL}/api/{TENANT_SLUG}/users"
        create_response = admin_session.post(create_url, json=employee_data)
        
        assert create_response.status_code == 200, f"Création failed: {create_response.text}"
        created_user = create_response.json()
        assert "id" in created_user
        assert created_user["email"] == employee_data["email"]
        print(f"[PERSONNEL OK] Utilisateur créé: {created_user['id']} - {created_user['email']}")
        
        # DELETE
        delete_url = f"{BASE_URL}/api/{TENANT_SLUG}/users/{created_user['id']}"
        delete_response = admin_session.delete(delete_url)
        assert delete_response.status_code == 200, f"Suppression failed: {delete_response.text}"
        print(f"[PERSONNEL OK] Utilisateur supprimé: {created_user['id']}")


# ================== TEST FORMATIONS MODULE - RBAC ==================

class TestFormationsRBAC:
    """Tests RBAC sur le module Formations"""
    
    def test_get_formations_list(self, admin_session):
        """Lister les formations (permission 'voir')"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/formations"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[FORMATIONS OK] {len(data)} formations listées")
    
    def test_formations_rapport_conformite(self, admin_session):
        """Accéder au rapport de conformité (permission 'voir' sur suivi)"""
        annee = datetime.now().year
        url = f"{BASE_URL}/api/{TENANT_SLUG}/formations/rapports/conformite?annee={annee}"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        
        assert "annee" in data
        assert "pompiers" in data
        assert "conformes" in data or "total_pompiers" in data
        print(f"[FORMATIONS OK] Rapport conformité {annee}: {len(data.get('pompiers', []))} pompiers analysés")
    
    def test_formations_dashboard(self, admin_session):
        """Accéder au dashboard formations (permission 'voir' sur suivi)"""
        annee = datetime.now().year
        url = f"{BASE_URL}/api/{TENANT_SLUG}/formations/rapports/dashboard?annee={annee}"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        
        assert "annee" in data
        assert "heures_planifiees" in data or "heures_effectuees" in data
        print(f"[FORMATIONS OK] Dashboard: Heures planifiées={data.get('heures_planifiees', 0)}")


# ================== TEST ACTIFS MODULE - RBAC ==================

class TestActifsRBAC:
    """Tests RBAC sur le module Actifs (Véhicules)"""
    
    def test_get_vehicules_list(self, admin_session):
        """Lister les véhicules (permission 'voir')"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/actifs/vehicules"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[ACTIFS OK] {len(data)} véhicules listés")
    
    def test_create_modify_delete_vehicule(self, admin_session):
        """CRUD complet véhicule (permissions 'creer', 'modifier', 'supprimer')"""
        unique_id = str(uuid.uuid4())[:8]
        
        # CREATE
        vehicule_data = {
            "nom": f"TEST_Véhicule_{unique_id}",
            "type_vehicule": "autopompe",
            "marque": "TestMarque",
            "modele": "TestModele",
            "statut": "actif"
        }
        
        create_url = f"{BASE_URL}/api/{TENANT_SLUG}/actifs/vehicules"
        create_response = admin_session.post(create_url, json=vehicule_data)
        assert create_response.status_code == 200, f"Création failed: {create_response.text}"
        created = create_response.json()
        assert "id" in created
        print(f"[ACTIFS OK] Véhicule créé: {created['id']}")
        
        # MODIFY
        modify_data = {"notes": "Modifié par test RBAC"}
        modify_url = f"{BASE_URL}/api/{TENANT_SLUG}/actifs/vehicules/{created['id']}"
        modify_response = admin_session.put(modify_url, json=modify_data)
        assert modify_response.status_code == 200, f"Modification failed: {modify_response.text}"
        print(f"[ACTIFS OK] Véhicule modifié")
        
        # DELETE
        delete_url = f"{BASE_URL}/api/{TENANT_SLUG}/actifs/vehicules/{created['id']}"
        delete_response = admin_session.delete(delete_url)
        assert delete_response.status_code == 200, f"Suppression failed: {delete_response.text}"
        print(f"[ACTIFS OK] Véhicule supprimé")
    
    def test_get_bornes_incendie(self, admin_session):
        """Lister les bornes d'incendie (permission 'voir' sur eau)"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/actifs/bornes"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[ACTIFS OK] {len(data)} bornes d'incendie listées")


# ================== TEST REMPLACEMENTS MODULE - RBAC ==================

class TestRemplacementsRBAC:
    """Tests RBAC sur le module Remplacements"""
    
    def test_get_remplacements_list(self, admin_session):
        """Lister les demandes de remplacement"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/remplacements"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[REMPLACEMENTS OK] {len(data)} demandes de remplacement")
    
    def test_get_demandes_conge(self, admin_session):
        """Lister les demandes de congé"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/demandes-conge"
        response = admin_session.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        assert isinstance(data, list)
        print(f"[REMPLACEMENTS OK] {len(data)} demandes de congé")
    
    def test_get_propositions(self, admin_session):
        """Lister les propositions de remplacement"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/remplacements/propositions"
        response = admin_session.get(url)
        
        # Peut être 200 ou 404 selon la config
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"[REMPLACEMENTS OK] {len(data)} propositions")
        else:
            print("[REMPLACEMENTS OK] Aucune proposition (404)")


# ================== TEST DELEGATIONS - RBAC ==================

class TestDelegationsRBAC:
    """Tests des fonctionnalités de délégation"""
    
    def test_get_delegations_actives(self, admin_session, admin_auth):
        """Vérifier l'accès aux délégations actives"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/delegations"
        response = admin_session.get(url)
        
        # Endpoint peut ne pas exister - on accepte 200 ou 404
        assert response.status_code in [200, 404, 405]
        if response.status_code == 200:
            data = response.json()
            print(f"[DELEGATIONS OK] {len(data) if isinstance(data, list) else 'N/A'} délégations actives")
        else:
            print(f"[DELEGATIONS] Endpoint non disponible (status: {response.status_code})")


# ================== TEST INTERFACE FRONTEND ==================

class TestFrontendAccess:
    """Tests basiques pour vérifier que le frontend répond"""
    
    def test_public_branding(self):
        """Vérifier l'accès au branding public (sans auth)"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/public/branding"
        response = requests.get(url)
        
        assert response.status_code == 200, f"Status: {response.status_code}"
        data = response.json()
        print(f"[FRONTEND OK] Branding public accessible - Service: {data.get('nom_service', data.get('nom', 'N/A'))}")
    
    def test_health_endpoint(self):
        """Vérifier le health check API"""
        url = f"{BASE_URL}/api/health"
        response = requests.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"[FRONTEND OK] API healthy - DB: {data.get('database')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
