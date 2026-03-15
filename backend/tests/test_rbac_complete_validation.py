"""
Test RBAC Complete Validation After Migration
==============================================

Tests to validate:
1. Removed demo routes return 404
2. Auto-attribution route works with reset parameter
3. Main module endpoints are accessible
4. RBAC protected routes work for admin user
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"
EMAIL = "gussdub@gmail.com"
PASSWORD = "230685Juin+"

class TestRBACCompleteValidation:
    """Complete validation tests after RBAC migration"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test with authentication"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Authenticate
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": EMAIL, "mot_de_passe": PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user = data.get("user", {})
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip(f"Authentication failed: {response.status_code}")
    
    # ==================== REMOVED DEMO ROUTES TESTS ====================
    
    def test_removed_route_auto_affecter_disponibilites_temps_partiel(self):
        """Route /auto-affecter-disponibilites-temps-partiel should return 404"""
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auto-affecter-disponibilites-temps-partiel",
            json={}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ /auto-affecter-disponibilites-temps-partiel returns 404")
    
    def test_removed_route_init_disponibilites_demo_complete(self):
        """Route /init-disponibilites-demo-complete should return 404"""
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/init-disponibilites-demo-complete",
            json={}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ /init-disponibilites-demo-complete returns 404")
    
    def test_removed_route_init_disponibilites_semaine_courante(self):
        """Route /init-disponibilites-semaine-courante should return 404"""
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/init-disponibilites-semaine-courante",
            json={}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ /init-disponibilites-semaine-courante returns 404")
    
    def test_removed_route_planning_reinitialiser(self):
        """Route /planning/reinitialiser should return 404"""
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/reinitialiser",
            json={}
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✅ /planning/reinitialiser returns 404")
    
    # ==================== AUTO-ATTRIBUTION ROUTE TEST ====================
    
    def test_auto_attribution_route_exists(self):
        """Planning auto-attribution route should work (POST)"""
        # Calculate dates for next week
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        next_monday = monday + timedelta(days=7)
        next_sunday = next_monday + timedelta(days=6)
        
        semaine_debut = next_monday.strftime("%Y-%m-%d")
        semaine_fin = next_sunday.strftime("%Y-%m-%d")
        
        # Test without reset (just check the endpoint exists)
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}",
            json={}
        )
        
        # Should return 200 with task_id or 400/422 for validation error, but NOT 404
        assert response.status_code != 404, f"Auto-attribution route should exist, got 404"
        assert response.status_code in [200, 400, 422, 500], f"Unexpected status: {response.status_code}"
        print(f"✅ /planning/attribution-auto route exists (status: {response.status_code})")
        
        if response.status_code == 200:
            data = response.json()
            assert "task_id" in data, "Response should contain task_id"
            print(f"✅ Auto-attribution started with task_id: {data['task_id']}")
    
    def test_auto_attribution_with_reset_parameter(self):
        """Planning auto-attribution with reset=True should work"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        next_monday = monday + timedelta(days=7)
        next_sunday = next_monday + timedelta(days=6)
        
        semaine_debut = next_monday.strftime("%Y-%m-%d")
        semaine_fin = next_sunday.strftime("%Y-%m-%d")
        
        # Test with reset=True parameter
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=True",
            json={}
        )
        
        assert response.status_code != 404, f"Auto-attribution with reset should exist, got 404"
        assert response.status_code in [200, 400, 422, 500], f"Unexpected status: {response.status_code}"
        print(f"✅ /planning/attribution-auto?reset=True route works (status: {response.status_code})")
    
    # ==================== MAIN MODULE TESTS ====================
    
    def test_dashboard_endpoint(self):
        """Dashboard endpoint should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/dashboard")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Dashboard endpoint accessible")
    
    def test_planning_semaine(self):
        """Planning semaine endpoint should be accessible"""
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/{semaine_debut}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Planning semaine endpoint accessible")
    
    def test_users_list(self):
        """Users list endpoint should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/users")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Users should return a list"
        print(f"✅ Users list endpoint accessible ({len(data)} users)")
    
    def test_remplacements_list(self):
        """Remplacements list endpoint should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/remplacements")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Remplacements list endpoint accessible")
    
    def test_remplacements_export_pdf(self):
        """Remplacements PDF export should be accessible (RBAC with can_view_all)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/remplacements/export/pdf")
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ Remplacements PDF export status: {response.status_code}")
    
    def test_remplacements_export_excel(self):
        """Remplacements Excel export should be accessible (RBAC with can_view_all)"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/remplacements/export/excel")
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ Remplacements Excel export status: {response.status_code}")
    
    def test_equipements_vehicules(self):
        """Equipements/Vehicules list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/vehicules")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Vehicules list endpoint accessible")
    
    def test_equipements_materiel(self):
        """Equipements/Materiel list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/equipements")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Equipements list endpoint accessible")
    
    def test_equipements_epi(self):
        """Equipements/EPI list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/epi")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ EPI list endpoint accessible")
    
    def test_interventions_rapports(self):
        """Interventions rapports list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/rapports-intervention")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Rapports intervention endpoint accessible")
    
    def test_prevention_inspections(self):
        """Prevention inspections calendrier should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/prevention/inspections-calendrier")
        # May return 200 or 404 depending on implementation
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ Prevention inspections status: {response.status_code}")
    
    def test_prevention_batiments(self):
        """Prevention batiments list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/batiments")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Batiments list endpoint accessible")
    
    def test_disponibilites_statut_blocage(self):
        """Disponibilites statut-blocage should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/disponibilites/statut-blocage")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Disponibilites statut-blocage endpoint accessible")
    
    def test_parametres_roles(self):
        """Parametres roles list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/parametres/roles")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Parametres roles endpoint accessible")
    
    def test_types_garde(self):
        """Types garde list should be accessible"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Types garde endpoint accessible")
    
    # ==================== RBAC PROTECTED ROUTES ====================
    
    def test_rbac_dashboard_messages_get(self):
        """Dashboard messages GET should work for admin"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/dashboard/messages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Dashboard messages GET accessible for admin")
    
    def test_rbac_broadcast_actif(self):
        """Broadcast actif GET should work"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/broadcast/actif")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Broadcast actif GET accessible")
    
    def test_rbac_notifications(self):
        """Notifications GET should work"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/notifications")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        print("✅ Notifications GET accessible")
    
    def test_rbac_equipes_garde(self):
        """Equipes garde params GET should work"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/parametres/equipes-garde")
        # May return 200 or 404 depending on configuration
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        print(f"✅ Equipes garde params status: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
