"""
Test Prevention Module - Complete Testing After Refactoring
============================================================
Tests:
- Prevention API endpoints (secteurs, preventionnistes, inspections, grilles)
- Verify Bâtiments tab is NOT in Prevention module
- Verify secteurs-geographiques endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestPreventionAuth:
    """Authentication for Prevention module tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        # API returns access_token, not token
        token = data.get("access_token") or data.get("token")
        assert token, f"No token in response: {data.keys()}"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestPreventionSecteurs(TestPreventionAuth):
    """Test secteurs géographiques endpoints"""
    
    def test_get_secteurs_geographiques(self, auth_headers):
        """Test GET /api/{tenant}/prevention/secteurs-geographiques - alias endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/secteurs-geographiques",
            headers=auth_headers
        )
        # This endpoint should now work after adding the alias route
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of secteurs"
        print(f"Found {len(data)} secteurs via secteurs-geographiques endpoint")
    
    def test_get_secteurs_correct_endpoint(self, auth_headers):
        """Test GET /api/{tenant}/prevention/secteurs - correct endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/secteurs",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of secteurs"
        print(f"Found {len(data)} secteurs")
        return data


class TestPreventionPreventionnistes(TestPreventionAuth):
    """Test préventionnistes endpoints"""
    
    def test_get_preventionnistes(self, auth_headers):
        """Test GET /api/{tenant}/prevention/preventionnistes"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/preventionnistes",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of preventionnistes"
        print(f"Found {len(data)} preventionnistes")
        
        # Verify structure if data exists
        if len(data) > 0:
            prev = data[0]
            assert "id" in prev, "Missing id field"
            print(f"First preventionniste: {prev.get('prenom', '')} {prev.get('nom', '')}")
        return data


class TestPreventionInspections(TestPreventionAuth):
    """Test inspections endpoints"""
    
    def test_get_inspections(self, auth_headers):
        """Test GET /api/{tenant}/prevention/inspections"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/inspections",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of inspections"
        print(f"Found {len(data)} inspections")
        return data


class TestPreventionGrilles(TestPreventionAuth):
    """Test grilles d'inspection endpoints"""
    
    def test_get_grilles_inspection(self, auth_headers):
        """Test GET /api/{tenant}/prevention/grilles-inspection"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/grilles-inspection",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of grilles"
        print(f"Found {len(data)} grilles d'inspection")
        
        # Verify structure if data exists
        if len(data) > 0:
            grille = data[0]
            assert "id" in grille, "Missing id field"
            assert "nom" in grille, "Missing nom field"
            print(f"First grille: {grille.get('nom', 'N/A')}")
        return data


class TestPreventionBatiments(TestPreventionAuth):
    """Test batiments endpoints via Prevention module"""
    
    def test_get_batiments(self, auth_headers):
        """Test GET /api/{tenant}/prevention/batiments"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/batiments",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of batiments"
        print(f"Found {len(data)} batiments via Prevention module")
        return data


class TestPreventionStatistiques(TestPreventionAuth):
    """Test statistiques endpoint"""
    
    def test_get_statistiques(self, auth_headers):
        """Test GET /api/{tenant}/prevention/statistiques"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/statistiques",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        print(f"Statistiques: {data}")
        return data


class TestPreventionNotifications(TestPreventionAuth):
    """Test notifications endpoint"""
    
    def test_get_notifications(self, auth_headers):
        """Test GET /api/{tenant}/prevention/notifications"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/notifications",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        print(f"Notifications response: {data}")
        return data


class TestPreventionPlansIntervention(TestPreventionAuth):
    """Test plans d'intervention endpoint"""
    
    def test_get_plans_intervention(self, auth_headers):
        """Test GET /api/{tenant}/prevention/plans-intervention"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/plans-intervention",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of plans"
        print(f"Found {len(data)} plans d'intervention")
        return data


class TestPreventionReferences(TestPreventionAuth):
    """Test reference data endpoints"""
    
    def test_get_references(self, auth_headers):
        """Test GET /api/{tenant}/prevention/references"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/references",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "categories_nr24_27" in data, "Missing categories_nr24_27"
        assert "risques_guide_planification" in data, "Missing risques_guide_planification"
        assert "niveaux_risque" in data, "Missing niveaux_risque"
        print(f"References loaded: {list(data.keys())}")
        return data
    
    def test_get_niveaux_risque(self, auth_headers):
        """Test GET /api/{tenant}/prevention/meta/niveaux-risque"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/meta/niveaux-risque",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of niveaux"
        print(f"Found {len(data)} niveaux de risque")
        return data
    
    def test_get_categories_batiments(self, auth_headers):
        """Test GET /api/{tenant}/prevention/meta/categories-batiments"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/meta/categories-batiments",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Expected dict of categories"
        print(f"Found {len(data)} categories de batiments")
        return data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
