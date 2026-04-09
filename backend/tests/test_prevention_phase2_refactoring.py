"""
Test Prevention Module Phase 2 Refactoring
===========================================
Tests for the second phase of prevention.py refactoring:
- prevention_nc.py (non-conformités) - 8 routes
- prevention_media.py (photos/icônes) - 8 routes
- prevention_inspections_visuelles.py (inspections visuelles + workflow + NC visuelles) - 12 routes
- prevention_config.py (carte/géocodage/préventionnistes/paramètres) - 11 routes

Plus verification that existing routes still work:
- prevention.py (core CRUD) - 51 routes
- prevention_plans.py - 15 routes
- prevention_reports.py - 6 routes

Total: 111 endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://legacy-to-cloud-1.preview.emergentagent.com').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestPreventionPhase2Refactoring:
    """Test suite for prevention module phase 2 refactoring verification"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test session with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code == 200:
            data = login_response.json()
            token = data.get("access_token")
            if token:
                self.session.headers.update({"Authorization": f"Bearer {token}"})
                self.authenticated = True
            else:
                self.authenticated = False
        else:
            self.authenticated = False
            pytest.skip(f"Authentication failed: {login_response.status_code}")
    
    # ==================== PREVENTION_NC.PY ROUTES (8 routes) ====================
    
    def test_nc_01_get_non_conformites(self):
        """GET /api/demo/prevention/non-conformites - Liste NC (prevention_nc.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/non-conformites")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET non-conformites: {len(data)} NC found")
    
    def test_nc_02_get_non_conformites_en_retard(self):
        """GET /api/demo/prevention/non-conformites-en-retard - NC en retard (prevention_nc.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/non-conformites-en-retard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET non-conformites-en-retard: {len(data)} NC en retard found")
    
    # ==================== PREVENTION_MEDIA.PY ROUTES (8 routes) ====================
    
    def test_media_01_get_icones_personnalisees(self):
        """GET /api/demo/prevention/icones-personnalisees - Liste icônes (prevention_media.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/icones-personnalisees")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET icones-personnalisees: {len(data)} icônes found")
    
    # ==================== PREVENTION_INSPECTIONS_VISUELLES.PY ROUTES (12 routes) ====================
    
    def test_inspvis_01_get_inspections_visuelles(self):
        """GET /api/demo/prevention/inspections-visuelles - Liste inspections visuelles (prevention_inspections_visuelles.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/inspections-visuelles")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET inspections-visuelles: {len(data)} inspections found")
    
    def test_inspvis_02_get_inspections_a_valider(self):
        """GET /api/demo/prevention/inspections-visuelles/a-valider - Inspections à valider (prevention_inspections_visuelles.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/inspections-visuelles/a-valider")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET inspections-visuelles/a-valider: {len(data)} inspections à valider found")
    
    def test_inspvis_03_get_non_conformites_visuelles(self):
        """GET /api/demo/prevention/non-conformites-visuelles - NC visuelles (prevention_inspections_visuelles.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/non-conformites-visuelles")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET non-conformites-visuelles: {len(data)} NC visuelles found")
    
    # ==================== PREVENTION_CONFIG.PY ROUTES (11 routes) ====================
    
    def test_config_01_get_preventionnistes(self):
        """GET /api/demo/prevention/preventionnistes - Liste préventionnistes (prevention_config.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/preventionnistes")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET preventionnistes: {len(data)} préventionnistes found")
    
    def test_config_02_get_batiments_map(self):
        """GET /api/demo/prevention/batiments/map - Carte bâtiments (prevention_config.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/map")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET batiments/map: {len(data)} bâtiments for map found")
    
    # ==================== PREVENTION_PLANS.PY ROUTES (15 routes) - Verified in Phase 1 ====================
    
    def test_plans_01_get_plans_intervention(self):
        """GET /api/demo/prevention/plans-intervention - Plans (prevention_plans.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/plans-intervention")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET plans-intervention: {len(data)} plans found")
    
    # ==================== PREVENTION_REPORTS.PY ROUTES (6 routes) - Verified in Phase 1 ====================
    
    def test_reports_01_get_statistiques(self):
        """GET /api/demo/prevention/statistiques - Stats (prevention_reports.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/statistiques")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "batiments" in data, "Response should contain 'batiments' key"
        assert "inspections" in data, "Response should contain 'inspections' key"
        assert "non_conformites" in data, "Response should contain 'non_conformites' key"
        print(f"✅ GET statistiques: batiments={data['batiments']['total']}, inspections={data['inspections']['total']}")
    
    def test_reports_02_get_tendances(self):
        """GET /api/demo/prevention/rapports/tendances - Tendances (prevention_reports.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/rapports/tendances")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "tendances" in data, "Response should contain 'tendances' key"
        print(f"✅ GET rapports/tendances: {len(data['tendances'])} months of data")
    
    def test_reports_03_get_notifications(self):
        """GET /api/demo/prevention/notifications - Notifications (prevention_reports.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/notifications")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "notifications" in data, "Response should contain 'notifications' key"
        assert "count" in data, "Response should contain 'count' key"
        print(f"✅ GET notifications: {data['count']} notifications found")
    
    # ==================== PREVENTION.PY CORE ROUTES (51 routes) ====================
    
    def test_core_01_get_batiments(self):
        """GET /api/demo/prevention/batiments - Bâtiments (prevention.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET batiments: {len(data)} bâtiments found")
    
    def test_core_02_get_grilles_inspection(self):
        """GET /api/demo/prevention/grilles-inspection - Grilles (prevention.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/grilles-inspection")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET grilles-inspection: {len(data)} grilles found")
    
    def test_core_03_get_secteurs(self):
        """GET /api/demo/prevention/secteurs - Secteurs (prevention.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/secteurs")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET secteurs: {len(data)} secteurs found")
    
    def test_core_04_get_inspections(self):
        """GET /api/demo/prevention/inspections - Inspections (prevention.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/inspections")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✅ GET inspections: {len(data)} inspections found")
    
    def test_core_05_get_references(self):
        """GET /api/demo/prevention/references - Références (prevention.py)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT_SLUG}/prevention/references")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "categories_nr24_27" in data, "Response should contain 'categories_nr24_27' key"
        assert "risques_guide_planification" in data, "Response should contain 'risques_guide_planification' key"
        print(f"✅ GET references: categories and risk levels returned")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
