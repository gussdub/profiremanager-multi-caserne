"""
Test de régression pour le système RBAC et le module Remplacements
Tests des routes critiques après intégration du système RBAC et refactoring du backend
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://unit-test-validation.preview.emergentagent.com')
TENANT_SLUG = "demo"
LOGIN_EMAIL = "gussdub@gmail.com"
LOGIN_PASSWORD = "230685Juin+"

@pytest.fixture(scope="module")
def auth_token():
    """Obtenir le token d'authentification"""
    login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
    response = requests.post(login_url, json={
        "email": LOGIN_EMAIL,
        "mot_de_passe": LOGIN_PASSWORD
    })
    
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "access_token" in data, "No access_token in response"
    print(f"[TEST] Login successful - User: {data['user'].get('prenom', '')} {data['user'].get('nom', '')}")
    print(f"[TEST] Role: {data['user'].get('role', 'unknown')}")
    return data["access_token"]

@pytest.fixture(scope="module")
def authenticated_session(auth_token):
    """Session avec authentification"""
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    })
    return session


# ==== AUTH TESTS ====
class TestAuth:
    """Tests d'authentification"""
    
    def test_login_success(self):
        """Test de connexion avec identifiants valides"""
        login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
        response = requests.post(login_url, json={
            "email": LOGIN_EMAIL,
            "mot_de_passe": LOGIN_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert "tenant" in data
        assert data["user"]["role"] == "admin"
        print(f"[AUTH] Login successful for admin user")
    
    def test_login_invalid_credentials(self):
        """Test de connexion avec mauvais mot de passe"""
        login_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/login"
        response = requests.post(login_url, json={
            "email": LOGIN_EMAIL,
            "mot_de_passe": "wrong_password"
        })
        
        assert response.status_code == 401
        print(f"[AUTH] Invalid credentials correctly rejected")
    
    def test_get_current_user(self, authenticated_session):
        """Test de récupération de l'utilisateur connecté"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/me"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "email" in data
        assert "role" in data
        print(f"[AUTH] Current user: {data.get('prenom', '')} {data.get('nom', '')} - Role: {data.get('role')}")


# ==== RBAC / PERMISSIONS TESTS ====
class TestRBACPermissions:
    """Tests du système RBAC"""
    
    def test_get_user_permissions(self, authenticated_session, auth_token):
        """Test de récupération des permissions utilisateur"""
        # D'abord récupérer l'ID de l'utilisateur
        me_url = f"{BASE_URL}/api/{TENANT_SLUG}/auth/me"
        me_response = authenticated_session.get(me_url)
        assert me_response.status_code == 200
        user_id = me_response.json()["id"]
        
        # Récupérer les permissions
        url = f"{BASE_URL}/api/{TENANT_SLUG}/users/{user_id}/permissions"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert "permissions" in data
        print(f"[RBAC] Permissions retrieved - Full access: {data['permissions'].get('is_full_access', False)}")
    
    def test_types_acces_list(self, authenticated_session):
        """Test de récupération des types d'accès"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/types-acces"
        response = authenticated_session.get(url)
        
        # L'endpoint peut renvoyer 200 ou 404 si pas configuré
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"[RBAC] Types d'accès: {len(data)} trouvé(s)")


# ==== REMPLACEMENTS MODULE TESTS ====
class TestRemplacements:
    """Tests du module Remplacements (après refactoring)"""
    
    def test_get_remplacements_list(self, authenticated_session):
        """Test de récupération des demandes de remplacement"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/remplacements"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[REMPLACEMENTS] {len(data)} demande(s) de remplacement trouvée(s)")
    
    def test_get_demandes_conge(self, authenticated_session):
        """Test de récupération des demandes de congé"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/demandes-conge"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[REMPLACEMENTS] {len(data)} demande(s) de congé trouvée(s)")
    
    def test_get_types_garde(self, authenticated_session):
        """Test de récupération des types de garde"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/types-garde"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[REMPLACEMENTS] {len(data)} type(s) de garde trouvé(s)")
    
    def test_get_propositions(self, authenticated_session):
        """Test de récupération des propositions de remplacement"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/remplacements/propositions"
        response = authenticated_session.get(url)
        
        # Peut être 200 ou 404 selon le rôle
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)
            print(f"[REMPLACEMENTS] {len(data)} proposition(s) reçue(s)")


# ==== PERSONNEL MODULE TESTS ====
class TestPersonnel:
    """Tests du module Personnel"""
    
    def test_get_users_list(self, authenticated_session):
        """Test de récupération de la liste du personnel"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/users"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "Liste des utilisateurs vide"
        print(f"[PERSONNEL] {len(data)} membre(s) du personnel trouvé(s)")
        
        # Vérifier la structure d'un utilisateur
        if data:
            user = data[0]
            assert "id" in user
            assert "email" in user
            assert "nom" in user or "prenom" in user
    
    def test_get_grades(self, authenticated_session):
        """Test de récupération des grades"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/grades"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[PERSONNEL] {len(data)} grade(s) trouvé(s)")
    
    def test_get_competences(self, authenticated_session):
        """Test de récupération des compétences"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/competences"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[PERSONNEL] {len(data)} compétence(s) trouvée(s)")


# ==== PLANNING MODULE TESTS ====
class TestPlanning:
    """Tests du module Planning"""
    
    def test_get_assignations(self, authenticated_session):
        """Test de récupération des assignations du planning"""
        # Date de début de semaine courante
        from datetime import datetime, timedelta
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        date_str = monday.strftime("%Y-%m-%d")
        
        url = f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignations/{date_str}?mode=mois"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[PLANNING] {len(data)} assignation(s) trouvée(s)")
    
    def test_get_equipes_garde_params(self, authenticated_session):
        """Test de récupération des paramètres d'équipes de garde"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/parametres/equipes-garde"
        response = authenticated_session.get(url)
        
        # Peut être 200 ou 404 si pas configuré
        assert response.status_code in [200, 404]
        if response.status_code == 200:
            data = response.json()
            print(f"[PLANNING] Équipes de garde: actif = {data.get('actif', False)}")


# ==== NOTIFICATIONS TESTS ====
class TestNotifications:
    """Tests des notifications"""
    
    def test_get_notifications(self, authenticated_session):
        """Test de récupération des notifications"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/notifications"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"[NOTIFICATIONS] {len(data)} notification(s) trouvée(s)")
    
    def test_get_notifications_count(self, authenticated_session):
        """Test du compteur de notifications non lues"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/notifications/non-lues/count"
        response = authenticated_session.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        print(f"[NOTIFICATIONS] {data['count']} notification(s) non lue(s)")


# ==== TENANT / BRANDING TESTS ====
class TestTenant:
    """Tests du tenant et branding"""
    
    def test_get_public_branding(self):
        """Test de récupération du branding public (sans auth)"""
        url = f"{BASE_URL}/api/{TENANT_SLUG}/public/branding"
        response = requests.get(url)
        
        assert response.status_code == 200
        data = response.json()
        assert "nom_service" in data or "nom" in data or "id" in data
        print(f"[TENANT] Branding public accessible - Service: {data.get('nom_service', 'N/A')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
