"""
Tests for Access Types Permission Modification (PUT/DELETE endpoints)
=====================================================================
Tests the ability to modify superviseur/employe role permissions and reset them.
- PUT /api/{tenant}/access-types/superviseur - modify superviseur permissions
- PUT /api/{tenant}/access-types/employe - modify employe permissions  
- PUT /api/{tenant}/access-types/admin - should be blocked (400)
- GET /api/{tenant}/access-types - verify has_overrides flag
- DELETE /api/{tenant}/access-types/role-override/{role} - reset to defaults
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestAccessTypesPermissions:
    """Test suite for access types permission modification"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: authenticate and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        token = login_response.json().get("access_token")
        if not token:
            pytest.skip("No access_token in login response")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        yield
        
        # Cleanup: reset any overrides we created
        try:
            self.session.delete(f"{BASE_URL}/api/{TENANT_SLUG}/access-types/role-override/superviseur")
            self.session.delete(f"{BASE_URL}/api/{TENANT_SLUG}/access-types/role-override/employe")
        except:
            pass

    def test_01_get_access_types_initial(self):
        """Test GET /access-types returns base roles and custom types"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "base_roles" in data, "Response should contain base_roles"
        assert "custom_types" in data, "Response should contain custom_types"
        
        # Verify base roles structure
        base_roles = data["base_roles"]
        assert len(base_roles) == 3, "Should have 3 base roles (admin, superviseur, employe)"
        
        role_ids = [r["id"] for r in base_roles]
        assert "admin" in role_ids
        assert "superviseur" in role_ids
        assert "employe" in role_ids
        
        # Check superviseur is editable
        superviseur = next(r for r in base_roles if r["id"] == "superviseur")
        assert superviseur["is_editable"] == True, "Superviseur should be editable"
        assert superviseur["is_system"] == True, "Superviseur should be system role"
        
        # Check employe is editable
        employe = next(r for r in base_roles if r["id"] == "employe")
        assert employe["is_editable"] == True, "Employe should be editable"
        
        # Check admin is NOT editable
        admin = next(r for r in base_roles if r["id"] == "admin")
        assert admin["is_editable"] == False, "Admin should NOT be editable"
        
        print("✓ GET /access-types returns correct structure with editable flags")

    def test_02_put_superviseur_permissions_success(self):
        """Test PUT /access-types/superviseur with modified permissions returns success"""
        # First get current permissions
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        assert get_response.status_code == 200
        
        base_roles = get_response.json()["base_roles"]
        superviseur = next(r for r in base_roles if r["id"] == "superviseur")
        current_permissions = superviseur["permissions"]
        
        # Modify permissions - enable rapports module for superviseur
        modified_permissions = current_permissions.copy()
        if "modules" not in modified_permissions:
            modified_permissions["modules"] = {}
        
        modified_permissions["modules"]["rapports"] = {
            "access": True,
            "actions": ["voir", "exporter"],
            "tabs": {
                "dashboard-interne": {"access": True, "actions": ["voir"]}
            }
        }
        
        # PUT the modified permissions
        put_response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/superviseur",
            json={"permissions": modified_permissions}
        )
        
        assert put_response.status_code == 200, f"Expected 200, got {put_response.status_code}: {put_response.text}"
        
        data = put_response.json()
        assert data.get("success") == True, "Response should indicate success"
        
        print("✓ PUT /access-types/superviseur successfully modified permissions")

    def test_03_get_access_types_has_overrides_true(self):
        """Test GET /access-types returns has_overrides:true after modification"""
        # First modify superviseur to ensure override exists
        modified_permissions = {
            "modules": {
                "rapports": {
                    "access": True,
                    "actions": ["voir"],
                    "tabs": {}
                }
            }
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/superviseur",
            json={"permissions": modified_permissions}
        )
        assert put_response.status_code == 200
        
        # Now check has_overrides flag
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        assert get_response.status_code == 200
        
        data = get_response.json()
        superviseur = next(r for r in data["base_roles"] if r["id"] == "superviseur")
        
        assert superviseur.get("has_overrides") == True, "Superviseur should have has_overrides=true after PUT"
        
        print("✓ GET /access-types shows has_overrides:true for superviseur after modification")

    def test_04_put_employe_permissions_success(self):
        """Test PUT /access-types/employe with modified permissions returns success"""
        # Modify employe permissions - give access to formations module
        modified_permissions = {
            "modules": {
                "formations": {
                    "access": True,
                    "actions": ["voir", "creer"],
                    "tabs": {
                        "catalogue": {"access": True, "actions": ["voir"]},
                        "inscriptions": {"access": True, "actions": ["voir", "creer"]}
                    }
                }
            }
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/employe",
            json={"permissions": modified_permissions}
        )
        
        assert put_response.status_code == 200, f"Expected 200, got {put_response.status_code}: {put_response.text}"
        
        data = put_response.json()
        assert data.get("success") == True, "Response should indicate success"
        
        # Verify has_overrides is now true for employe
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        assert get_response.status_code == 200
        
        employe = next(r for r in get_response.json()["base_roles"] if r["id"] == "employe")
        assert employe.get("has_overrides") == True, "Employe should have has_overrides=true"
        
        print("✓ PUT /access-types/employe successfully modified permissions")

    def test_05_put_admin_blocked(self):
        """Test PUT /access-types/admin is blocked with 400 error"""
        modified_permissions = {
            "modules": {
                "dashboard": {
                    "access": True,
                    "actions": ["voir"]
                }
            }
        }
        
        put_response = self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/admin",
            json={"permissions": modified_permissions}
        )
        
        assert put_response.status_code == 400, f"Expected 400 for admin modification, got {put_response.status_code}"
        
        # Verify error message
        data = put_response.json()
        assert "detail" in data, "Error response should contain detail"
        assert "admin" in data["detail"].lower() or "modifié" in data["detail"].lower(), \
            f"Error should mention admin cannot be modified: {data['detail']}"
        
        print("✓ PUT /access-types/admin correctly blocked with 400")

    def test_06_delete_role_override_superviseur(self):
        """Test DELETE /access-types/role-override/superviseur resets to defaults"""
        # First ensure there's an override
        modified_permissions = {
            "modules": {
                "rapports": {"access": True, "actions": ["voir"], "tabs": {}}
            }
        }
        self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/superviseur",
            json={"permissions": modified_permissions}
        )
        
        # Verify override exists
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        superviseur = next(r for r in get_response.json()["base_roles"] if r["id"] == "superviseur")
        assert superviseur.get("has_overrides") == True, "Should have override before delete"
        
        # Delete the override
        delete_response = self.session.delete(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/role-override/superviseur"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        data = delete_response.json()
        assert data.get("success") == True, "Response should indicate success"
        
        # Verify has_overrides is now false
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        superviseur = next(r for r in get_response.json()["base_roles"] if r["id"] == "superviseur")
        assert superviseur.get("has_overrides") == False or superviseur.get("has_overrides") is None, \
            "Superviseur should not have overrides after delete"
        
        print("✓ DELETE /access-types/role-override/superviseur successfully resets to defaults")

    def test_07_delete_role_override_employe(self):
        """Test DELETE /access-types/role-override/employe resets to defaults"""
        # First ensure there's an override
        modified_permissions = {
            "modules": {
                "formations": {"access": True, "actions": ["voir"], "tabs": {}}
            }
        }
        self.session.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/employe",
            json={"permissions": modified_permissions}
        )
        
        # Delete the override
        delete_response = self.session.delete(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/role-override/employe"
        )
        
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}: {delete_response.text}"
        
        # Verify has_overrides is now false
        get_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types")
        employe = next(r for r in get_response.json()["base_roles"] if r["id"] == "employe")
        assert employe.get("has_overrides") == False or employe.get("has_overrides") is None, \
            "Employe should not have overrides after delete"
        
        print("✓ DELETE /access-types/role-override/employe successfully resets to defaults")

    def test_08_delete_role_override_admin_blocked(self):
        """Test DELETE /access-types/role-override/admin is blocked"""
        delete_response = self.session.delete(
            f"{BASE_URL}/api/{TENANT_SLUG}/access-types/role-override/admin"
        )
        
        assert delete_response.status_code == 400, f"Expected 400 for admin reset, got {delete_response.status_code}"
        
        print("✓ DELETE /access-types/role-override/admin correctly blocked")

    def test_09_get_modules_structure(self):
        """Test GET /access-types/modules-structure returns module definitions"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/access-types/modules-structure")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "modules" in data, "Response should contain modules"
        assert "default_permissions" in data, "Response should contain default_permissions"
        
        # Verify some expected modules exist
        modules = data["modules"]
        assert "dashboard" in modules, "Should have dashboard module"
        assert "personnel" in modules, "Should have personnel module"
        assert "planning" in modules, "Should have planning module"
        
        print("✓ GET /access-types/modules-structure returns correct structure")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
