"""
Test suite for Prevention Module Refactoring
=============================================
Tests the endpoints extracted from prevention.py into:
- prevention_plans.py (Plans d'intervention routes)
- prevention_reports.py (Rapports, Stats, Notifications routes)

Also verifies that routes remaining in prevention.py still work.
"""

import pytest
import requests
import os

# Get BASE_URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"
TENANT_SLUG = "demo"


class TestPreventionRefactoring:
    """Test suite for prevention module refactoring verification"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.token = None
        
        # Authenticate
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            self.token = data.get("access_token")
            if self.token:
                self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        self.session.close()
    
    # ==================== ROUTES FROM prevention_plans.py ====================
    
    def test_plans_intervention_list(self):
        """Test GET /api/demo/prevention/plans-intervention - Liste des plans"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/plans-intervention")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Plans d'intervention: {len(data)} plans found")
    
    # ==================== ROUTES FROM prevention_reports.py ====================
    
    def test_statistiques(self):
        """Test GET /api/demo/prevention/statistiques - Statistiques module"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/statistiques")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify expected structure
        assert "batiments" in data, "Response should contain 'batiments'"
        assert "inspections" in data, "Response should contain 'inspections'"
        assert "non_conformites" in data, "Response should contain 'non_conformites'"
        
        print(f"✅ Statistiques: batiments={data['batiments']['total']}, inspections={data['inspections']['total']}")
    
    def test_rapports_tendances(self):
        """Test GET /api/demo/prevention/rapports/tendances - Tendances 6 mois"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/rapports/tendances")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify expected structure
        assert "tendances" in data, "Response should contain 'tendances'"
        assert isinstance(data["tendances"], list), "tendances should be a list"
        
        print(f"✅ Tendances: {len(data['tendances'])} mois de données")
    
    def test_notifications(self):
        """Test GET /api/demo/prevention/notifications - Notifications prévention"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/notifications")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify expected structure
        assert "notifications" in data, "Response should contain 'notifications'"
        assert "count" in data, "Response should contain 'count'"
        assert "urgent_count" in data, "Response should contain 'urgent_count'"
        assert "high_count" in data, "Response should contain 'high_count'"
        
        print(f"✅ Notifications: count={data['count']}, urgent={data['urgent_count']}, high={data['high_count']}")
    
    # ==================== ROUTES REMAINING IN prevention.py ====================
    
    def test_batiments_list(self):
        """Test GET /api/demo/prevention/batiments - Liste bâtiments (route restée dans prevention.py)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Bâtiments: {len(data)} bâtiments found")
    
    def test_grilles_inspection_list(self):
        """Test GET /api/demo/prevention/grilles-inspection - Liste grilles (route restée dans prevention.py)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/grilles-inspection")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Grilles d'inspection: {len(data)} grilles found")
    
    def test_secteurs_list(self):
        """Test GET /api/demo/prevention/secteurs - Liste secteurs (route restée dans prevention.py)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/secteurs")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Secteurs: {len(data)} secteurs found")
    
    def test_non_conformites_list(self):
        """Test GET /api/demo/prevention/non-conformites - Liste non-conformités (route restée dans prevention.py)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/non-conformites")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Non-conformités: {len(data)} non-conformités found")
    
    def test_inspections_list(self):
        """Test GET /api/demo/prevention/inspections - Liste inspections (route restée dans prevention.py)"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/inspections")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ Inspections: {len(data)} inspections found")
    
    # ==================== ADDITIONAL VERIFICATION ====================
    
    def test_references(self):
        """Test GET /api/demo/prevention/references - Catégories et risques"""
        if not self.token:
            pytest.skip("Authentication failed")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/references")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify expected structure
        assert "categories_nr24_27" in data, "Response should contain 'categories_nr24_27'"
        assert "risques_guide_planification" in data, "Response should contain 'risques_guide_planification'"
        assert "niveaux_risque" in data, "Response should contain 'niveaux_risque'"
        
        print(f"✅ References: categories={len(data['categories_nr24_27'])}, risques={len(data['risques_guide_planification'])}")


class TestAuthentication:
    """Test authentication works correctly"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        response = session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        assert response.status_code == 200, f"Login failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "access_token" in data, "Response should contain 'access_token'"
        print(f"✅ Login successful, token received")
        
        session.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
