"""
Test Multi-Casernes Module
==========================
Tests for:
- CRUD Casernes: GET, POST, PUT, DELETE /api/demo/casernes
- Config multi-casernes: GET/PUT /api/demo/casernes/config
- Types de garde mode_caserne field
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"
API_BASE = f"{BASE_URL}/api/{TENANT}"

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestMultiCasernesModule:
    """Tests for Multi-Casernes feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token before each test"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{API_BASE}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
    
    # ==================== CONFIG TESTS ====================
    
    def test_01_get_multi_casernes_config(self):
        """GET /api/demo/casernes/config - Should return multi_casernes_actif status"""
        response = self.session.get(f"{API_BASE}/casernes/config")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "multi_casernes_actif" in data, "Response should contain multi_casernes_actif"
        assert isinstance(data["multi_casernes_actif"], bool), "multi_casernes_actif should be boolean"
        print(f"✅ Config GET: multi_casernes_actif = {data['multi_casernes_actif']}")
    
    def test_02_update_multi_casernes_config(self):
        """PUT /api/demo/casernes/config - Should toggle multi_casernes_actif"""
        # First get current state
        get_response = self.session.get(f"{API_BASE}/casernes/config")
        assert get_response.status_code == 200
        current_state = get_response.json().get("multi_casernes_actif", False)
        
        # Toggle to opposite
        new_state = not current_state
        put_response = self.session.put(
            f"{API_BASE}/casernes/config",
            json={"multi_casernes_actif": new_state}
        )
        
        assert put_response.status_code == 200, f"Expected 200, got {put_response.status_code}: {put_response.text}"
        
        data = put_response.json()
        assert data.get("multi_casernes_actif") == new_state, "Config should be updated"
        
        # Restore original state
        restore_response = self.session.put(
            f"{API_BASE}/casernes/config",
            json={"multi_casernes_actif": current_state}
        )
        assert restore_response.status_code == 200
        print(f"✅ Config PUT: toggled {current_state} -> {new_state} -> {current_state}")
    
    # ==================== CASERNES CRUD TESTS ====================
    
    def test_03_get_casernes_list(self):
        """GET /api/demo/casernes - Should return list of casernes"""
        response = self.session.get(f"{API_BASE}/casernes")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Check existing casernes (created during smoke test)
        if len(data) > 0:
            caserne = data[0]
            assert "id" in caserne, "Caserne should have id"
            assert "nom" in caserne, "Caserne should have nom"
            assert "tenant_id" in caserne, "Caserne should have tenant_id"
            print(f"✅ GET casernes: Found {len(data)} caserne(s)")
            for c in data:
                print(f"   - {c.get('nom')} ({c.get('code', 'no code')})")
        else:
            print("✅ GET casernes: Empty list (no casernes yet)")
    
    def test_04_create_caserne(self):
        """POST /api/demo/casernes - Should create a new caserne"""
        unique_id = str(uuid.uuid4())[:8]
        caserne_data = {
            "nom": f"TEST_Caserne_{unique_id}",
            "code": f"T{unique_id[:3].upper()}",
            "adresse": "123 Test Street",
            "telephone": "555-TEST-001",
            "couleur": "#FF5733"
        }
        
        response = self.session.post(f"{API_BASE}/casernes", json=caserne_data)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("nom") == caserne_data["nom"], "Nom should match"
        assert data.get("code") == caserne_data["code"], "Code should match"
        assert data.get("adresse") == caserne_data["adresse"], "Adresse should match"
        assert data.get("telephone") == caserne_data["telephone"], "Telephone should match"
        assert data.get("couleur") == caserne_data["couleur"], "Couleur should match"
        assert "id" in data, "Response should contain id"
        
        # Store for cleanup
        self.created_caserne_id = data["id"]
        print(f"✅ POST caserne: Created '{caserne_data['nom']}' with id {data['id']}")
        
        # Verify persistence with GET
        get_response = self.session.get(f"{API_BASE}/casernes")
        assert get_response.status_code == 200
        casernes = get_response.json()
        found = any(c.get("id") == data["id"] for c in casernes)
        assert found, "Created caserne should be in list"
        print(f"✅ Verified caserne persisted in database")
    
    def test_05_create_caserne_duplicate_name_fails(self):
        """POST /api/demo/casernes - Should fail with duplicate name"""
        # First create a caserne
        unique_id = str(uuid.uuid4())[:8]
        caserne_data = {
            "nom": f"TEST_Duplicate_{unique_id}",
            "code": "DUP"
        }
        
        response1 = self.session.post(f"{API_BASE}/casernes", json=caserne_data)
        assert response1.status_code == 200
        created_id = response1.json().get("id")
        
        # Try to create another with same name
        response2 = self.session.post(f"{API_BASE}/casernes", json=caserne_data)
        assert response2.status_code == 400, f"Expected 400 for duplicate, got {response2.status_code}"
        print(f"✅ Duplicate name correctly rejected with 400")
        
        # Cleanup
        self.session.delete(f"{API_BASE}/casernes/{created_id}")
    
    def test_06_update_caserne(self):
        """PUT /api/demo/casernes/{id} - Should update caserne"""
        # First create a caserne to update
        unique_id = str(uuid.uuid4())[:8]
        create_data = {
            "nom": f"TEST_Update_{unique_id}",
            "code": "UPD",
            "couleur": "#000000"
        }
        
        create_response = self.session.post(f"{API_BASE}/casernes", json=create_data)
        assert create_response.status_code == 200
        caserne_id = create_response.json().get("id")
        
        # Update the caserne
        update_data = {
            "nom": f"TEST_Updated_{unique_id}",
            "code": "UPD2",
            "adresse": "456 Updated Ave",
            "couleur": "#00FF00"
        }
        
        update_response = self.session.put(f"{API_BASE}/casernes/{caserne_id}", json=update_data)
        
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}: {update_response.text}"
        
        data = update_response.json()
        assert data.get("nom") == update_data["nom"], "Nom should be updated"
        assert data.get("code") == update_data["code"], "Code should be updated"
        assert data.get("adresse") == update_data["adresse"], "Adresse should be updated"
        assert data.get("couleur") == update_data["couleur"], "Couleur should be updated"
        print(f"✅ PUT caserne: Updated successfully")
        
        # Verify persistence
        get_response = self.session.get(f"{API_BASE}/casernes")
        casernes = get_response.json()
        updated = next((c for c in casernes if c.get("id") == caserne_id), None)
        assert updated is not None, "Updated caserne should exist"
        assert updated.get("nom") == update_data["nom"], "Update should persist"
        print(f"✅ Verified update persisted in database")
        
        # Cleanup
        self.session.delete(f"{API_BASE}/casernes/{caserne_id}")
    
    def test_07_update_nonexistent_caserne_fails(self):
        """PUT /api/demo/casernes/{id} - Should return 404 for non-existent"""
        fake_id = str(uuid.uuid4())
        response = self.session.put(
            f"{API_BASE}/casernes/{fake_id}",
            json={"nom": "Test"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Non-existent caserne correctly returns 404")
    
    def test_08_delete_caserne(self):
        """DELETE /api/demo/casernes/{id} - Should delete caserne"""
        # First create a caserne to delete
        unique_id = str(uuid.uuid4())[:8]
        create_data = {
            "nom": f"TEST_Delete_{unique_id}",
            "code": "DEL"
        }
        
        create_response = self.session.post(f"{API_BASE}/casernes", json=create_data)
        assert create_response.status_code == 200
        caserne_id = create_response.json().get("id")
        
        # Delete the caserne
        delete_response = self.session.delete(f"{API_BASE}/casernes/{caserne_id}")
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        print(f"✅ DELETE caserne: Deleted successfully")
        
        # Verify deletion
        get_response = self.session.get(f"{API_BASE}/casernes")
        casernes = get_response.json()
        found = any(c.get("id") == caserne_id for c in casernes)
        assert not found, "Deleted caserne should not be in list"
        print(f"✅ Verified caserne removed from database")
    
    def test_09_delete_nonexistent_caserne_fails(self):
        """DELETE /api/demo/casernes/{id} - Should return 404 for non-existent"""
        fake_id = str(uuid.uuid4())
        response = self.session.delete(f"{API_BASE}/casernes/{fake_id}")
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"✅ Non-existent caserne delete correctly returns 404")
    
    # ==================== TYPES DE GARDE MODE_CASERNE TESTS ====================
    
    def test_10_types_garde_have_mode_caserne(self):
        """GET /api/demo/types-garde - Should return mode_caserne field"""
        response = self.session.get(f"{API_BASE}/types-garde")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        if len(data) > 0:
            for type_garde in data:
                assert "mode_caserne" in type_garde, f"Type garde '{type_garde.get('nom')}' should have mode_caserne"
                assert type_garde["mode_caserne"] in ["global", "par_caserne"], f"mode_caserne should be 'global' or 'par_caserne'"
                print(f"   - {type_garde.get('nom')}: mode_caserne = {type_garde.get('mode_caserne')}")
            print(f"✅ GET types-garde: All {len(data)} types have mode_caserne field")
        else:
            print("✅ GET types-garde: No types found (empty list)")
    
    def test_11_types_garde_default_mode_caserne_is_global(self):
        """Verify existing types de garde have mode_caserne='global' by default"""
        response = self.session.get(f"{API_BASE}/types-garde")
        assert response.status_code == 200
        
        data = response.json()
        
        # Check that existing types have global as default
        for type_garde in data:
            mode = type_garde.get("mode_caserne", "global")
            # Default should be global unless explicitly set to par_caserne
            assert mode in ["global", "par_caserne"], f"Invalid mode_caserne value: {mode}"
        
        print(f"✅ Types de garde mode_caserne values are valid")
    
    # ==================== CLEANUP ====================
    
    def test_99_cleanup_test_casernes(self):
        """Cleanup: Delete all TEST_ prefixed casernes"""
        response = self.session.get(f"{API_BASE}/casernes")
        if response.status_code == 200:
            casernes = response.json()
            deleted_count = 0
            for caserne in casernes:
                if caserne.get("nom", "").startswith("TEST_"):
                    delete_response = self.session.delete(f"{API_BASE}/casernes/{caserne['id']}")
                    if delete_response.status_code == 200:
                        deleted_count += 1
            print(f"✅ Cleanup: Deleted {deleted_count} test caserne(s)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
