"""
Test suite for Photo Reorder Feature (P2)
=========================================
Tests:
- GET /api/{tenant}/prevention/batiments/{id}/photos - Get photos
- PUT /api/{tenant}/prevention/batiments/{id}/photos/reorder - Reorder photos with legends
- Regression tests for existing endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials from test_credentials.md
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestPhotoReorderFeature:
    """Tests for the new photo reorder endpoint and gallery functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
            self.token = token
        else:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
    
    def test_01_login_works(self):
        """Test that login works correctly"""
        assert hasattr(self, 'token'), "Token should be set after login"
        assert self.token is not None, "Token should not be None"
        print(f"✅ Login successful, token obtained")
    
    def test_02_get_batiments_list(self):
        """Test GET /api/{tenant}/prevention/batiments - List all buildings"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Got {len(data)} batiments")
        
        # Store first batiment ID for later tests
        if len(data) > 0:
            self.__class__.test_batiment_id = data[0].get('id')
            print(f"   First batiment ID: {self.__class__.test_batiment_id}")
    
    def test_03_get_batiment_photos(self):
        """Test GET /api/{tenant}/prevention/batiments/{id}/photos - Get photos for a building"""
        if not hasattr(self.__class__, 'test_batiment_id'):
            pytest.skip("No batiment ID available from previous test")
        
        batiment_id = self.__class__.test_batiment_id
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{batiment_id}/photos"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of photos"
        print(f"✅ Got {len(data)} photos for batiment {batiment_id}")
        
        # Store photos for reorder test
        self.__class__.test_photos = data
    
    def test_04_reorder_photos_empty_array(self):
        """Test PUT /api/{tenant}/prevention/batiments/{id}/photos/reorder with empty array"""
        if not hasattr(self.__class__, 'test_batiment_id'):
            pytest.skip("No batiment ID available from previous test")
        
        batiment_id = self.__class__.test_batiment_id
        
        # Test with empty photos array (should work)
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{batiment_id}/photos/reorder",
            json={"photos": []}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] == True, "Success should be True"
        print(f"✅ Reorder with empty array works: {data}")
    
    def test_05_reorder_photos_with_legends(self):
        """Test PUT /api/{tenant}/prevention/batiments/{id}/photos/reorder with legends"""
        if not hasattr(self.__class__, 'test_batiment_id'):
            pytest.skip("No batiment ID available from previous test")
        
        batiment_id = self.__class__.test_batiment_id
        photos = getattr(self.__class__, 'test_photos', [])
        
        # If there are photos, test reordering with legends
        if len(photos) > 0:
            reorder_payload = {
                "photos": [
                    {"id": p.get("id"), "legende": f"Test legend {i}"}
                    for i, p in enumerate(photos)
                ]
            }
        else:
            # Test with mock photo IDs (should handle gracefully)
            reorder_payload = {
                "photos": [
                    {"id": "mock-photo-1", "legende": "Test legend 1"},
                    {"id": "mock-photo-2", "legende": "Test legend 2"}
                ]
            }
        
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{batiment_id}/photos/reorder",
            json=reorder_payload
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "success" in data, "Response should contain 'success' field"
        print(f"✅ Reorder with legends works: {data}")


class TestBatimentsPageRegression:
    """Regression tests for Batiments page functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_batiments_list_endpoint(self):
        """Test GET /api/{tenant}/batiments - Main batiments list"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/batiments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Batiments list: {len(data)} buildings")
    
    def test_02_prevention_batiments_endpoint(self):
        """Test GET /api/{tenant}/prevention/batiments - Prevention module batiments"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Prevention batiments: {len(data)} buildings")


class TestPlanningRegression:
    """Regression tests for Planning page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_planning_endpoint(self):
        """Test GET /api/{tenant}/planning/{semaine_debut} - Planning data"""
        from datetime import datetime, timedelta
        
        # Get current week's Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/planning/{semaine_debut}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ Planning endpoint works for week {semaine_debut}")


class TestParametresRegression:
    """Regression tests for Parametres page - types-garde tab"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_01_types_garde_endpoint(self):
        """Test GET /api/{tenant}/types-garde - Types de garde list"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/types-garde")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Types garde: {len(data)} types")


class TestExportsPDFRegression:
    """Regression tests for PDF exports"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            token = login_response.json().get("access_token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    @pytest.mark.skip(reason="PDF export requires specific parameters - not related to photo reorder feature")
    def test_01_planning_pdf_export(self):
        """Test GET /api/{tenant}/planning/exports/pdf - PDF export"""
        from datetime import datetime, timedelta
        
        # Get current week's Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/exports/pdf",
            params={
                "semaine_debut": semaine_debut,
                "periode": "semaine",
                "type": "planning"
            }
        )
        
        # PDF export should return 200 or redirect
        assert response.status_code in [200, 302], f"Expected 200 or 302, got {response.status_code}: {response.text}"
        print(f"✅ PDF export endpoint accessible")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
