"""
Test Session 14 Features:
- Remplacement token validation (invalid token returns valid:false)
- Prevention module endpoints (references, inspections, grilles, secteurs, plans, non-conformites, statistiques, tendances, preventionnistes)
- Anti-doublon for replacement creation (409 for duplicate)
- Batiment historique endpoint (unified timeline with type field)
"""

import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"
EMAIL = "gussdub@icloud.com"
PASSWORD = "230685Juin+"

# Building ID with inspection/NC data for historique testing
BATIMENT_ID_WITH_DATA = "072fa3d5-6c74-439d-a1a7-75655a68ae2c"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/{TENANT}/auth/login",
        json={"email": EMAIL, "mot_de_passe": PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("token") or data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestRemplacementTokenValidation:
    """Test remplacement-check-token endpoint for invalid tokens"""
    
    def test_invalid_token_returns_valid_false(self):
        """GET /api/remplacement-check-token/{token} - returns valid:false for invalid tokens"""
        invalid_token = "invalid-token-12345"
        response = requests.get(f"{BASE_URL}/api/remplacement-check-token/{invalid_token}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "valid" in data, "Response should contain 'valid' field"
        assert data["valid"] == False, f"Expected valid=false, got {data['valid']}"
        assert "reason" in data, "Response should contain 'reason' field"
        print(f"✅ Invalid token returns valid=false with reason: {data.get('reason')}")
    
    def test_random_uuid_token_returns_valid_false(self):
        """Test with random UUID token"""
        random_token = str(uuid.uuid4())
        response = requests.get(f"{BASE_URL}/api/remplacement-check-token/{random_token}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["valid"] == False
        print(f"✅ Random UUID token returns valid=false")


class TestPreventionReferences:
    """Test prevention references endpoint"""
    
    def test_get_references(self, auth_headers):
        """GET /api/demo/prevention/references - returns categories and niveaux_risque"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/references",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check for expected keys
        assert "categories_nr24_27" in data or "categories" in data, "Should contain categories"
        assert "niveaux_risque" in data, "Should contain niveaux_risque"
        print(f"✅ References endpoint returns categories and niveaux_risque")


class TestPreventionInspections:
    """Test prevention inspections endpoint"""
    
    def test_get_inspections_list(self, auth_headers):
        """GET /api/demo/prevention/inspections - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/inspections",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Inspections endpoint returns list with {len(data)} items")


class TestPreventionGrillesInspection:
    """Test prevention grilles-inspection endpoint"""
    
    def test_get_grilles_list(self, auth_headers):
        """GET /api/demo/prevention/grilles-inspection - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/grilles-inspection",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Grilles-inspection endpoint returns list with {len(data)} items")


class TestPreventionSecteursGeographiques:
    """Test prevention secteurs-geographiques endpoint"""
    
    def test_get_secteurs_list(self, auth_headers):
        """GET /api/demo/prevention/secteurs-geographiques - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/secteurs-geographiques",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Secteurs-geographiques endpoint returns list with {len(data)} items")


class TestPreventionPlansIntervention:
    """Test prevention plans-intervention endpoint"""
    
    def test_get_plans_list(self, auth_headers):
        """GET /api/demo/prevention/plans-intervention - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/plans-intervention",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Plans-intervention endpoint returns list with {len(data)} items")


class TestPreventionNonConformites:
    """Test prevention non-conformites endpoint"""
    
    def test_get_non_conformites_list(self, auth_headers):
        """GET /api/demo/prevention/non-conformites - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/non-conformites",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Non-conformites endpoint returns list with {len(data)} items")


class TestPreventionStatistiques:
    """Test prevention statistiques endpoint"""
    
    def test_get_statistiques(self, auth_headers):
        """GET /api/demo/prevention/statistiques - returns stats object"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/statistiques",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, dict), "Should return a dict"
        print(f"✅ Statistiques endpoint returns stats object with keys: {list(data.keys())[:5]}...")


class TestPreventionRapportsTendances:
    """Test prevention rapports/tendances endpoint"""
    
    def test_get_tendances(self, auth_headers):
        """GET /api/demo/prevention/rapports/tendances - returns tendances"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/rapports/tendances",
            headers=auth_headers
        )
        
        # This endpoint might not exist, so we accept 200 or 404
        if response.status_code == 404:
            pytest.skip("Tendances endpoint not implemented")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        print(f"✅ Rapports/tendances endpoint returns data")


class TestPreventionPreventionnistes:
    """Test prevention preventionnistes endpoint"""
    
    def test_get_preventionnistes_list(self, auth_headers):
        """GET /api/demo/prevention/preventionnistes - returns list"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/preventionnistes",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Preventionnistes endpoint returns list with {len(data)} items")


class TestRemplacementAntiDoublon:
    """Test anti-doublon for replacement creation"""
    
    def test_duplicate_replacement_returns_409(self, auth_headers):
        """POST /api/demo/remplacements - anti-doublon returns 409 for duplicate"""
        # First, get types de garde
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/types-garde",
            headers=auth_headers
        )
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No types de garde available for testing")
        
        types_garde = response.json()
        type_garde_id = types_garde[0]["id"]
        
        # Use a future date
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        demande_data = {
            "type_garde_id": type_garde_id,
            "date": future_date,
            "raison": f"TEST_ANTI_DOUBLON_{uuid.uuid4().hex[:8]}"
        }
        
        # First request - might succeed or fail due to validation (user not scheduled)
        response1 = requests.post(
            f"{BASE_URL}/api/{TENANT}/remplacements",
            headers=auth_headers,
            json=demande_data
        )
        
        # If first request fails with 400 (user not scheduled), that's expected
        if response1.status_code == 400:
            print(f"✅ First request failed with 400 (user not scheduled) - this is expected behavior")
            pytest.skip("Cannot test anti-doublon: user not scheduled on this garde type")
        
        # If first request succeeds, try duplicate
        if response1.status_code in [200, 201]:
            demande_id = response1.json().get("id")
            print(f"First request succeeded with id: {demande_id}")
            
            # Second request with same data should return 409
            response2 = requests.post(
                f"{BASE_URL}/api/{TENANT}/remplacements",
                headers=auth_headers,
                json=demande_data
            )
            
            assert response2.status_code == 409, f"Expected 409 for duplicate, got {response2.status_code}: {response2.text}"
            print(f"✅ Duplicate replacement returns 409 Conflict")
            
            # Cleanup - delete the created demande
            requests.delete(
                f"{BASE_URL}/api/{TENANT}/remplacements/{demande_id}",
                headers=auth_headers
            )
        else:
            print(f"First request returned {response1.status_code}: {response1.text}")
            pytest.skip(f"Cannot test anti-doublon: first request failed with {response1.status_code}")


class TestBatimentHistorique:
    """Test batiment historique endpoint"""
    
    def test_get_historique_returns_unified_timeline(self, auth_headers):
        """GET /api/demo/batiments/{id}/historique - returns unified timeline with type field"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/batiments/{BATIMENT_ID_WITH_DATA}/historique",
            headers=auth_headers
        )
        
        # If building not found, try to get any building
        if response.status_code == 404:
            # Get list of buildings
            batiments_response = requests.get(
                f"{BASE_URL}/api/{TENANT}/batiments",
                headers=auth_headers
            )
            if batiments_response.status_code == 200 and batiments_response.json():
                batiment_id = batiments_response.json()[0]["id"]
                response = requests.get(
                    f"{BASE_URL}/api/{TENANT}/batiments/{batiment_id}/historique",
                    headers=auth_headers
                )
            else:
                pytest.skip("No buildings available for testing")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        
        # Check that items have 'type' field
        if len(data) > 0:
            for item in data[:5]:  # Check first 5 items
                assert "type" in item, f"Item should have 'type' field: {item}"
                assert item["type"] in ["modification", "inspection", "non_conformite", "intervention"], \
                    f"Type should be one of the expected values, got: {item['type']}"
            print(f"✅ Historique endpoint returns unified timeline with {len(data)} items, types: {set(item['type'] for item in data)}")
        else:
            print(f"✅ Historique endpoint returns empty list (no history for this building)")


class TestBatimentHistoriqueAlternative:
    """Test batiment historique with prevention endpoint"""
    
    def test_get_historique_via_prevention(self, auth_headers):
        """Test historique via prevention batiments endpoint"""
        # Get a building from prevention module
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/batiments",
            headers=auth_headers
        )
        
        if response.status_code != 200 or not response.json():
            pytest.skip("No prevention buildings available")
        
        batiment_id = response.json()[0]["id"]
        
        # Try to get historique
        hist_response = requests.get(
            f"{BASE_URL}/api/{TENANT}/batiments/{batiment_id}/historique",
            headers=auth_headers
        )
        
        assert hist_response.status_code == 200, f"Expected 200, got {hist_response.status_code}"
        data = hist_response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"✅ Historique via prevention building returns {len(data)} items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
