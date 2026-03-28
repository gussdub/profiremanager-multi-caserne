"""
Test Photo Reassignment Feature (P2)
=====================================
Tests for the new drag & drop photo reassignment feature between buildings.

Endpoints tested:
- GET /api/{tenant}/files/by-entity/batiment/{id} - List files for a building
- PUT /api/{tenant}/files/{file_id}/reassign - Reassign imported file to new building
- PUT /api/{tenant}/prevention/batiments/photos/{photo_id}/reassign - Reassign legacy photo
- GET /api/{tenant}/batiments - List all buildings (for selector)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"

# Test credentials from test_credentials.md
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestPhotoReassignment:
    """Tests for photo reassignment endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                self.token = token
            else:
                pytest.skip("No token in login response")
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    # ==================== BATIMENTS LIST ====================
    
    def test_get_batiments_list(self):
        """Test GET /api/{tenant}/batiments - should return list of buildings"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # According to the request, there should be 71 buildings
        print(f"Found {len(data)} batiments")
        assert len(data) > 0, "Should have at least some buildings"
        
        # Check structure of first building
        if len(data) > 0:
            bat = data[0]
            assert "id" in bat, "Building should have id"
    
    # ==================== FILES BY ENTITY ====================
    
    def test_get_files_by_entity_batiment(self):
        """Test GET /api/{tenant}/files/by-entity/batiment/{id} - list files for a building"""
        # First get a building ID
        batiments_response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert batiments_response.status_code == 200
        
        batiments = batiments_response.json()
        if len(batiments) == 0:
            pytest.skip("No buildings available")
        
        batiment_id = batiments[0]["id"]
        
        # Get files for this building
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT}/files/by-entity/batiment/{batiment_id}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "files" in data, "Response should have 'files' key"
        assert isinstance(data["files"], list), "files should be a list"
        
        print(f"Building {batiment_id} has {len(data['files'])} files")
    
    def test_get_files_by_entity_nonexistent_building(self):
        """Test GET /api/{tenant}/files/by-entity/batiment/{id} with non-existent building"""
        fake_id = "nonexistent-building-id-12345"
        
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT}/files/by-entity/batiment/{fake_id}"
        )
        
        # Should return 200 with empty files list (not 404)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "files" in data
        assert len(data["files"]) == 0, "Should have no files for non-existent building"
    
    # ==================== FILE REASSIGNMENT ====================
    
    def test_reassign_file_nonexistent(self):
        """Test PUT /api/{tenant}/files/{file_id}/reassign - 404 for non-existent file"""
        fake_file_id = "nonexistent-file-id-12345"
        
        # Get a valid building ID for target
        batiments_response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert batiments_response.status_code == 200
        
        batiments = batiments_response.json()
        if len(batiments) == 0:
            pytest.skip("No buildings available")
        
        target_batiment_id = batiments[0]["id"]
        
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT}/files/{fake_file_id}/reassign",
            json={"new_entity_id": target_batiment_id}
        )
        
        # Should return 404 for non-existent file
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
    
    def test_reassign_file_missing_body(self):
        """Test PUT /api/{tenant}/files/{file_id}/reassign - 422 for missing body"""
        fake_file_id = "some-file-id"
        
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT}/files/{fake_file_id}/reassign",
            json={}  # Missing new_entity_id
        )
        
        # Should return 422 for validation error
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
    
    # ==================== LEGACY PHOTO REASSIGNMENT ====================
    
    def test_reassign_legacy_photo_nonexistent(self):
        """Test PUT /api/{tenant}/prevention/batiments/photos/{photo_id}/reassign - 404 for non-existent"""
        fake_photo_id = "nonexistent-photo-id-12345"
        
        # Get two valid building IDs
        batiments_response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert batiments_response.status_code == 200
        
        batiments = batiments_response.json()
        if len(batiments) < 2:
            pytest.skip("Need at least 2 buildings")
        
        source_id = batiments[0]["id"]
        target_id = batiments[1]["id"]
        
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT}/prevention/batiments/photos/{fake_photo_id}/reassign",
            json={
                "source_batiment_id": source_id,
                "target_batiment_id": target_id
            }
        )
        
        # Should return 404 for non-existent photo
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
    
    def test_reassign_legacy_photo_missing_source(self):
        """Test PUT /api/{tenant}/prevention/batiments/photos/{photo_id}/reassign - 400 for missing source"""
        fake_photo_id = "some-photo-id"
        
        # Get a valid building ID
        batiments_response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert batiments_response.status_code == 200
        
        batiments = batiments_response.json()
        if len(batiments) == 0:
            pytest.skip("No buildings available")
        
        target_id = batiments[0]["id"]
        
        response = self.session.put(
            f"{BASE_URL}/api/{TENANT}/prevention/batiments/photos/{fake_photo_id}/reassign",
            json={
                "target_batiment_id": target_id
                # Missing source_batiment_id
            }
        )
        
        # Should return 400 for missing required field
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    # ==================== LEGACY PHOTOS LIST ====================
    
    def test_get_legacy_photos_batiment(self):
        """Test GET /api/{tenant}/prevention/batiments/{id}/photos - list legacy photos"""
        # First get a building ID
        batiments_response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert batiments_response.status_code == 200
        
        batiments = batiments_response.json()
        if len(batiments) == 0:
            pytest.skip("No buildings available")
        
        batiment_id = batiments[0]["id"]
        
        # Get legacy photos for this building
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT}/prevention/batiments/{batiment_id}/photos"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        print(f"Building {batiment_id} has {len(data)} legacy photos")


class TestRegressionParametres:
    """Regression tests for Parametres page (ParametresTypesGarde.jsx)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_get_types_garde(self):
        """Test GET /api/{tenant}/types-garde - regression for ParametresTypesGarde"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} types de garde")
    
    def test_get_competences(self):
        """Test GET /api/{tenant}/competences - regression for Parametres"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/competences")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"


class TestRegressionPlanning:
    """Regression tests for Planning page"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip(f"Login failed: {login_response.status_code}")
    
    def test_get_planning_current_week(self):
        """Test GET /api/{tenant}/planning/{semaine_debut} - regression for Planning"""
        from datetime import datetime, timedelta
        
        # Get current week's Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/{semaine_debut}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, dict), "Response should be a dict"
        print(f"Planning data keys: {list(data.keys())}")
    
    def test_get_planning_exports_pdf(self):
        """Test GET /api/{tenant}/planning/exports/pdf - regression for PDF export"""
        from datetime import datetime, timedelta
        
        # Get current week's Monday
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        # First get a type_garde_id
        types_response = self.session.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        if types_response.status_code != 200 or len(types_response.json()) == 0:
            pytest.skip("No types de garde available for PDF export test")
        
        type_garde_id = types_response.json()[0]["id"]
        
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT}/planning/exports/pdf",
            params={
                "semaine_debut": semaine_debut,
                "type_garde_id": type_garde_id,
                "periode": "semaine",
                "type": "planning"
            }
        )
        
        # PDF export should return 200 with PDF content
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text[:500] if response.status_code != 200 else ''}"
        
        # Check content type
        content_type = response.headers.get("content-type", "")
        assert "pdf" in content_type.lower() or "octet-stream" in content_type.lower(), \
            f"Expected PDF content type, got {content_type}"
        
        print(f"PDF export successful, size: {len(response.content)} bytes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
