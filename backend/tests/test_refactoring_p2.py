"""
Test suite for P2 Refactoring - Regression Testing
===================================================
Tests to verify no regressions after:
1. planning.py split into 4 files (planning.py, planning_exports.py, planning_auto.py, planning_audit.py)
2. Parametres.js extraction of ParametresTypesGarde.jsx
3. Audit bug fix in Planning.jsx (user_id-based matching instead of index-based)

Test credentials:
- Email: gussdub@icloud.com
- Password: 230685Juin+
- Tenant: demo
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://pfm-transfer-import.preview.emergentagent.com').rstrip('/')
TENANT = "demo"

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(
        f"{BASE_URL}/api/{TENANT}/auth/login",
        json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestHealthAndBasics:
    """Basic health checks"""
    
    def test_health_endpoint(self):
        """Test API health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print(f"✅ Health check passed: {data}")
    
    def test_root_health(self):
        """Test root health endpoint"""
        response = requests.get(f"{BASE_URL}/")
        assert response.status_code == 200
        print("✅ Root health check passed")


class TestTypesGardeCRUD:
    """Test types-garde CRUD operations (Parametres refactoring)"""
    
    def test_get_types_garde(self, api_client):
        """Test GET /api/{tenant}/types-garde"""
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET types-garde: {len(data)} types found")
        
        # Verify structure of types
        if data:
            first_type = data[0]
            assert "id" in first_type
            assert "nom" in first_type
            print(f"   First type: {first_type.get('nom')}")


class TestPlanningMainRoutes:
    """Test main planning routes (from planning.py)"""
    
    def test_get_planning_semaine(self, api_client):
        """Test GET /api/{tenant}/planning/{semaine_debut}"""
        # Use a date in current month
        from datetime import datetime, timedelta
        today = datetime.now()
        # Get Monday of current week
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/planning/{semaine_debut}")
        assert response.status_code == 200
        data = response.json()
        assert "assignations" in data
        assert "types_garde" in data
        print(f"✅ GET planning semaine: {len(data.get('assignations', []))} assignations")
    
    def test_get_assignations_periode(self, api_client):
        """Test GET /api/{tenant}/planning/assignations/{date_debut}"""
        from datetime import datetime
        date_debut = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/assignations/{date_debut}",
            params={"mode": "mois"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET assignations periode: {len(data)} assignations")
    
    def test_get_mes_heures(self, api_client):
        """Test GET /api/{tenant}/planning/mes-heures"""
        from datetime import datetime
        mois = datetime.now().strftime("%Y-%m")
        
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/mes-heures",
            params={"mois": mois}
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_heures" in data
        assert "nombre_gardes" in data
        print(f"✅ GET mes-heures: {data.get('total_heures')}h, {data.get('nombre_gardes')} gardes")
    
    def test_get_rapport_heures(self, api_client):
        """Test GET /api/{tenant}/planning/rapport-heures"""
        from datetime import datetime
        mois = datetime.now().strftime("%Y-%m")
        
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/rapport-heures",
            params={"mois": mois}
        )
        assert response.status_code == 200
        data = response.json()
        assert "employes" in data
        assert "statistiques" in data
        print(f"✅ GET rapport-heures: {len(data.get('employes', []))} employes")


class TestPlanningExportsRoutes:
    """Test planning exports routes (from planning_exports.py)"""
    
    def test_export_pdf(self, api_client):
        """Test GET /api/{tenant}/planning/exports/pdf"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/exports/pdf",
            params={"periode": "2026-03", "type": "mois"}
        )
        # Should return PDF or 200
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        print(f"✅ GET exports/pdf: PDF generated ({len(response.content)} bytes)")
    
    def test_export_excel(self, api_client):
        """Test GET /api/{tenant}/planning/exports/excel"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/exports/excel",
            params={"periode": "2026-03", "type": "mois"}
        )
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
        print(f"✅ GET exports/excel: Excel generated ({len(response.content)} bytes)")


class TestPlanningAutoRoutes:
    """Test planning auto-attribution routes (from planning_auto.py)"""
    
    def test_attribution_auto_demo_exists(self, api_client):
        """Test POST /api/{tenant}/planning/attribution-auto-demo route exists"""
        from datetime import datetime, timedelta
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        semaine_debut = monday.strftime("%Y-%m-%d")
        
        # Just verify the route exists (may return 422 for missing params, that's OK)
        response = api_client.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto-demo",
            params={"semaine_debut": semaine_debut}
        )
        # Route should exist (not 404)
        assert response.status_code != 404, f"Route not found: {response.status_code}"
        print(f"✅ POST attribution-auto-demo: Route exists (status: {response.status_code})")
    
    def test_check_periode(self, api_client):
        """Test GET /api/{tenant}/planning/assignations/check-periode"""
        from datetime import datetime
        debut = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        fin = datetime.now().replace(day=28).strftime("%Y-%m-%d")
        
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/assignations/check-periode",
            params={"debut": debut, "fin": fin}
        )
        assert response.status_code == 200
        data = response.json()
        assert "existing_count" in data
        print(f"✅ GET check-periode: {data.get('existing_count')} existing assignations")


class TestQuartsOuverts:
    """Test quarts ouverts (no regression from previous iteration)"""
    
    def test_get_quarts_ouverts(self, api_client):
        """Test GET /api/{tenant}/remplacements/quarts-ouverts"""
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/remplacements/quarts-ouverts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET quarts-ouverts: {len(data)} quarts ouverts")


class TestParametresEndpoints:
    """Test parametres endpoints (Parametres.js refactoring)"""
    
    def test_get_competences(self, api_client):
        """Test GET /api/{tenant}/competences"""
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/competences")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET competences: {len(data)} competences")
    
    def test_get_grades(self, api_client):
        """Test GET /api/{tenant}/grades"""
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/grades")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET grades: {len(data)} grades")
    
    def test_get_formations(self, api_client):
        """Test GET /api/{tenant}/formations"""
        response = api_client.get(f"{BASE_URL}/api/{TENANT}/formations")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET formations: {len(data)} formations")


class TestPlanningMonthlyView:
    """Test planning monthly view (used by Planning.jsx)"""
    
    def test_get_planning_monthly(self, api_client):
        """Test GET /api/{tenant}/planning/assignations/{date} with mode=mois"""
        from datetime import datetime
        date_debut = datetime.now().replace(day=1).strftime("%Y-%m-%d")
        
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT}/planning/assignations/{date_debut}",
            params={"mode": "mois"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify assignation structure if any exist
        if data:
            first = data[0]
            assert "user_id" in first, "Assignation should have user_id"
            assert "type_garde_id" in first, "Assignation should have type_garde_id"
            assert "date" in first, "Assignation should have date"
        
        print(f"✅ GET planning monthly: {len(data)} assignations")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
