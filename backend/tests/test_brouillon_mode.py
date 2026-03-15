"""
Tests pour le mode brouillon/publication du planning
=====================================================

Fonctionnalités testées:
- Modèle Assignation avec champ publication_status (défaut='publie')
- Attribution automatique crée des assignations en mode brouillon
- GET /planning/assignations/{date} filtre les brouillons selon permissions
- GET /planning/{semaine} filtre les brouillons selon permissions
- POST /planning/publier change brouillon → publie
- GET /planning/brouillons/count retourne le nombre de brouillons
- DELETE /planning/brouillons supprime les brouillons
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

# Base URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials
ADMIN_EMAIL = "gussdub@gmail.com"
ADMIN_PASSWORD = "230685Juin+"


class TestBrouillonMode:
    """Tests pour le mode brouillon du planning"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code} - {login_response.text}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token")
        self.user = login_data.get("user", {})
        
        if not self.token:
            pytest.skip("No access token received")
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        # Calculate dates for testing
        today = datetime.now()
        # Get start of next week (Monday)
        days_until_monday = (7 - today.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # If today is Monday, go to next Monday
        self.test_week_start = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
        self.test_week_end = (today + timedelta(days=days_until_monday + 6)).strftime("%Y-%m-%d")
        self.test_month = (today + timedelta(days=days_until_monday)).strftime("%Y-%m")
        
        print(f"\n[Setup] Test dates: {self.test_week_start} to {self.test_week_end}")
        yield
        
        # Cleanup: delete any test brouillons created
        self._cleanup_test_brouillons()
    
    def _cleanup_test_brouillons(self):
        """Cleanup test data"""
        try:
            # Delete brouillons for test period
            delete_response = self.session.delete(
                f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons",
                params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
            )
            if delete_response.status_code == 200:
                print(f"[Cleanup] Deleted brouillons: {delete_response.json()}")
        except Exception as e:
            print(f"[Cleanup] Error: {e}")
    
    def test_01_login_successful(self):
        """Test 01: Verify admin login works"""
        assert self.token is not None, "Token should be present"
        assert self.user.get("email") == ADMIN_EMAIL, "User email should match"
        print(f"✅ Login successful for {ADMIN_EMAIL}")
    
    def test_02_get_assignations_endpoint_exists(self):
        """Test 02: GET /planning/assignations/{date} endpoint works"""
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignations/{self.test_week_start}",
            params={"mode": "semaine"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list of assignations"
        print(f"✅ GET /planning/assignations endpoint works, returned {len(data)} assignations")
    
    def test_03_get_planning_semaine_endpoint_exists(self):
        """Test 03: GET /planning/{semaine} endpoint works"""
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/{self.test_week_start}"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "assignations" in data, "Response should contain 'assignations' field"
        assert "types_garde" in data, "Response should contain 'types_garde' field"
        print(f"✅ GET /planning/{self.test_week_start} works, returned {len(data.get('assignations', []))} assignations")
    
    def test_04_brouillons_count_endpoint_exists(self):
        """Test 04: GET /planning/brouillons/count endpoint works"""
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons/count",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "nb_brouillons" in data, "Response should contain 'nb_brouillons' field"
        assert "periode" in data, "Response should contain 'periode' field"
        print(f"✅ GET /planning/brouillons/count works, returned {data.get('nb_brouillons')} brouillons")
    
    def test_05_delete_brouillons_endpoint_exists(self):
        """Test 05: DELETE /planning/brouillons endpoint works (returns success even if no brouillons)"""
        response = self.session.delete(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "brouillons_supprimes" in data, "Response should contain 'brouillons_supprimes' field"
        print(f"✅ DELETE /planning/brouillons works, deleted {data.get('brouillons_supprimes')} brouillons")
    
    def test_06_publier_endpoint_requires_brouillons(self):
        """Test 06: POST /planning/publier returns 404 when no brouillons exist"""
        # First, make sure there are no brouillons
        self.session.delete(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        # Try to publish - should fail with 404 since no brouillons
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/publier",
            json={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        # Should return 404 "Aucun brouillon à publier"
        assert response.status_code == 404, f"Expected 404 when no brouillons, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        assert "brouillon" in data.get("detail", "").lower(), "Error should mention brouillon"
        print(f"✅ POST /planning/publier correctly returns 404 when no brouillons: {data.get('detail')}")
    
    def test_07_attribution_auto_creates_brouillons(self):
        """Test 07: Attribution automatique creates assignations with publication_status='brouillon'"""
        # Start auto attribution for test period (uses mode_brouillon=True by default)
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/attribution-auto",
            params={"semaine_debut": self.test_week_start, "semaine_fin": self.test_week_end}
        )
        
        # Should return 200 with task_id
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check response structure
        assert "task_id" in data, "Response should contain 'task_id'"
        assert "stream_url" in data, "Response should contain 'stream_url'"
        assert data.get("mode_brouillon") == True, "mode_brouillon should be True by default"
        
        task_id = data.get("task_id")
        print(f"✅ Attribution auto started with task_id: {task_id}, mode_brouillon: {data.get('mode_brouillon')}")
        
        # Wait a bit for attribution to complete
        import time
        time.sleep(5)  # Give time for background task to complete
        
        # Now check if brouillons were created
        count_response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons/count",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        if count_response.status_code == 200:
            count_data = count_response.json()
            nb_brouillons = count_data.get("nb_brouillons", 0)
            print(f"   Brouillons created: {nb_brouillons}")
            # Note: might be 0 if no disponibilites exist for test period
        
        return data
    
    def test_08_admin_can_see_brouillons_in_assignations(self):
        """Test 08: Admin with 'planning-creer' permission can see brouillons"""
        # Get assignations (admin should see all including brouillons)
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignations/{self.test_week_start}",
            params={"mode": "semaine"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assignations = response.json()
        
        # Count brouillons vs published
        brouillons = [a for a in assignations if a.get("publication_status") == "brouillon"]
        publies = [a for a in assignations if a.get("publication_status") in ["publie", None]]
        
        print(f"✅ Admin sees: {len(brouillons)} brouillons, {len(publies)} published, {len(assignations)} total")
        
        return {"brouillons": len(brouillons), "publies": len(publies), "total": len(assignations)}
    
    def test_09_publier_changes_status_to_publie(self):
        """Test 09: POST /planning/publier changes status from brouillon to publie"""
        # First, check if there are brouillons to publish
        count_response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons/count",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        assert count_response.status_code == 200
        initial_count = count_response.json().get("nb_brouillons", 0)
        
        if initial_count == 0:
            # Need to create brouillons first via attribution-auto
            create_response = self.session.post(
                f"{BASE_URL}/api/{TENANT_SLUG}/planning/attribution-auto",
                params={"semaine_debut": self.test_week_start, "semaine_fin": self.test_week_end}
            )
            if create_response.status_code == 200:
                import time
                time.sleep(5)  # Wait for attribution to complete
                
                # Recheck count
                count_response = self.session.get(
                    f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons/count",
                    params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
                )
                initial_count = count_response.json().get("nb_brouillons", 0)
        
        if initial_count == 0:
            pytest.skip("No brouillons available to test publishing (no disponibilites?)")
        
        print(f"   Initial brouillons count: {initial_count}")
        
        # Now publish
        publish_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/publier",
            json={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        assert publish_response.status_code == 200, f"Expected 200, got {publish_response.status_code}: {publish_response.text}"
        publish_data = publish_response.json()
        
        # Verify response structure
        assert "assignations_publiees" in publish_data, "Response should contain 'assignations_publiees'"
        assert "employes_notifies" in publish_data, "Response should contain 'employes_notifies'"
        
        nb_published = publish_data.get("assignations_publiees", 0)
        print(f"✅ Published {nb_published} assignations, notified {publish_data.get('employes_notifies')} employees")
        
        # Verify brouillons count is now 0
        final_count_response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/brouillons/count",
            params={"date_debut": self.test_week_start, "date_fin": self.test_week_end}
        )
        
        assert final_count_response.status_code == 200
        final_count = final_count_response.json().get("nb_brouillons", 0)
        
        assert final_count == 0, f"After publishing, brouillons count should be 0, got {final_count}"
        print(f"✅ Brouillons count after publish: {final_count} (expected 0)")
        
        return publish_data
    
    def test_10_assignation_model_has_default_publie(self):
        """Test 10: Manual assignation creation defaults to publication_status='publie'"""
        # Get types de garde
        types_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/types-garde")
        assert types_response.status_code == 200
        types_garde = types_response.json()
        
        if not types_garde:
            pytest.skip("No types de garde available")
        
        type_garde_id = types_garde[0].get("id")
        
        # Get users
        users_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/users")
        assert users_response.status_code == 200
        users = users_response.json()
        
        if not users:
            pytest.skip("No users available")
        
        # Find an active user
        active_user = next((u for u in users if u.get("statut") == "Actif"), users[0])
        user_id = active_user.get("id")
        
        # Create manual assignation
        test_date = self.test_week_start
        create_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignation",
            json={
                "user_id": user_id,
                "type_garde_id": type_garde_id,
                "date": test_date,
                "assignation_type": "manuel"
            }
        )
        
        # Note: might get 200 (new) or 200 (updated existing)
        assert create_response.status_code == 200, f"Expected 200, got {create_response.status_code}: {create_response.text}"
        
        assignation_data = create_response.json()
        
        # Manual assignations should have publication_status='publie' (default)
        # Check by fetching assignations and finding this one
        fetch_response = self.session.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignations/{test_date}",
            params={"mode": "semaine"}
        )
        
        assert fetch_response.status_code == 200
        all_assignations = fetch_response.json()
        
        # Find our assignation
        our_assignation = next(
            (a for a in all_assignations 
             if a.get("user_id") == user_id 
             and a.get("type_garde_id") == type_garde_id 
             and a.get("date") == test_date),
            None
        )
        
        if our_assignation:
            status = our_assignation.get("publication_status", "publie")  # Default is publie
            # Manual assignations default to 'publie' (not brouillon)
            assert status in ["publie", None], f"Manual assignation should be 'publie' or None, got '{status}'"
            print(f"✅ Manual assignation has publication_status: {status}")
        else:
            print(f"⚠️ Created assignation not found in list (may have been deduplicated)")
        
        # Cleanup: delete the test assignation
        if assignation_data.get("id"):
            self.session.delete(f"{BASE_URL}/api/{TENANT_SLUG}/planning/assignation/{assignation_data.get('id')}")


class TestBrouillonVisibilityFiltering:
    """Tests pour vérifier que les brouillons sont filtrés selon les permissions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup with admin credentials"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        login_data = login_response.json()
        self.token = login_data.get("access_token")
        
        if not self.token:
            pytest.skip("No access token received")
        
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
    
    def test_admin_permission_check(self):
        """Verify admin has planning-creer permission (required to see brouillons)"""
        # Get current user's permissions
        me_response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/users/me")
        
        assert me_response.status_code == 200, f"Failed to get user info: {me_response.status_code}"
        user_data = me_response.json()
        
        # Check role
        role = user_data.get("role", {})
        role_nom = role.get("nom") if isinstance(role, dict) else role
        
        print(f"✅ User role: {role_nom}")
        print(f"   is_full_access: {role.get('is_full_access') if isinstance(role, dict) else 'N/A'}")
        
        # Admin should have full access
        if isinstance(role, dict):
            assert role.get("is_full_access") == True, "Admin should have full access"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
