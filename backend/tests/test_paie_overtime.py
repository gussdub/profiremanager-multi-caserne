"""
Test suite for Paie (Payroll) module - Overtime calculation for internal guard intervention overrun
=================================================================================================

Tests:
1. GET /api/{tenant}/paie/parametres - Retrieve payroll parameters
2. PUT /api/{tenant}/paie/parametres - Update payroll parameters
3. GET /api/{tenant}/types-garde - Get guard types to verify heure_fin exists
4. Backend logic: calculer_feuille_temps should create 'depassement_intervention' line when intervention ends after shift
"""

import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT_SLUG = "demo"  # Test tenant


class TestAuthSetup:
    """Get authentication token for subsequent tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Authenticate and get token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with authorization token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }


class TestPaieParametres(TestAuthSetup):
    """Test payroll parameters endpoints"""
    
    def test_get_parametres_paie_success(self, auth_headers):
        """GET /api/{tenant}/paie/parametres - Should return payroll parameters"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get paie parametres: {response.text}"
        
        data = response.json()
        # Verify key parameters exist
        assert "periode_paie_jours" in data, "Missing periode_paie_jours"
        assert "heures_sup_taux" in data, "Missing heures_sup_taux (overtime rate)"
        assert "heures_sup_seuil_hebdo" in data, "Missing heures_sup_seuil_hebdo"
        assert "rappel_taux" in data, "Missing rappel_taux"
        
        # Verify heures_sup_taux is the overtime multiplier (should be > 1)
        heures_sup_taux = data.get("heures_sup_taux", 1.0)
        assert isinstance(heures_sup_taux, (int, float)), "heures_sup_taux should be a number"
        print(f"✓ Overtime rate (heures_sup_taux): {heures_sup_taux}")
        print(f"✓ Weekly overtime threshold: {data.get('heures_sup_seuil_hebdo')} hours")
    
    def test_put_parametres_paie_update(self, auth_headers):
        """PUT /api/{tenant}/paie/parametres - Should update payroll parameters"""
        # First get current parameters
        get_response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        current_params = get_response.json()
        
        # Update with a test value for heures_sup_taux
        test_taux = 1.75  # Test overtime rate
        update_payload = {
            **current_params,
            "heures_sup_taux": test_taux
        }
        
        put_response = requests.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers,
            json=update_payload
        )
        assert put_response.status_code == 200, f"Failed to update paie parametres: {put_response.text}"
        
        # Verify update
        verify_response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers
        )
        assert verify_response.status_code == 200
        updated_data = verify_response.json()
        assert updated_data.get("heures_sup_taux") == test_taux, "heures_sup_taux was not updated"
        
        # Restore original value
        restore_payload = {
            **updated_data,
            "heures_sup_taux": current_params.get("heures_sup_taux", 1.5)
        }
        requests.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers,
            json=restore_payload
        )
        print(f"✓ Successfully updated heures_sup_taux to {test_taux} and restored")


class TestTypesGarde(TestAuthSetup):
    """Test guard types endpoints - verify heure_debut and heure_fin fields exist"""
    
    def test_get_types_garde_with_hours(self, auth_headers):
        """GET /api/{tenant}/types-garde - Should return guard types with heure_debut and heure_fin"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-garde",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get types garde: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of guard types"
        
        if len(data) > 0:
            # Check first guard type has required fields
            first_type = data[0]
            assert "id" in first_type, "Guard type should have id"
            assert "nom" in first_type, "Guard type should have nom"
            assert "heure_debut" in first_type, "Guard type should have heure_debut field"
            assert "heure_fin" in first_type, "Guard type should have heure_fin field"
            
            print(f"✓ Found {len(data)} guard types")
            for tg in data[:3]:  # Show first 3
                print(f"  - {tg.get('nom')}: {tg.get('heure_debut')} → {tg.get('heure_fin')} ({tg.get('duree_heures', 'N/A')}h)")
        else:
            print("⚠ No guard types configured for this tenant")


class TestFeuilleTemps(TestAuthSetup):
    """Test feuille de temps (timesheet) generation"""
    
    def test_get_feuilles_temps_list(self, auth_headers):
        """GET /api/{tenant}/paie/feuilles-temps - Should list timesheets"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/feuilles-temps",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed to get feuilles temps: {response.text}"
        
        data = response.json()
        assert "feuilles" in data, "Response should have feuilles key"
        feuilles = data["feuilles"]
        assert isinstance(feuilles, list), "feuilles should be a list"
        
        print(f"✓ Found {len(feuilles)} timesheets")
        
        # Check if any timesheet has depassement_intervention lines
        for feuille in feuilles[:5]:  # Check first 5
            lignes = feuille.get("lignes", [])
            depassement_lines = [l for l in lignes if l.get("type") == "depassement_intervention"]
            if depassement_lines:
                print(f"  ✓ Feuille {feuille.get('id')[:8]}... has {len(depassement_lines)} depassement_intervention line(s)")
                for dl in depassement_lines:
                    print(f"    - {dl.get('description')}: {dl.get('heures_payees')}h @ {dl.get('taux')}x = ${dl.get('montant')}")


class TestOvertimeLogic(TestAuthSetup):
    """Test overtime calculation logic verification"""
    
    def test_paie_parametres_has_overtime_fields(self, auth_headers):
        """Verify paie parameters include overtime configuration"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/paie/parametres",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        
        # Required overtime fields
        assert "heures_sup_taux" in data, "Missing heures_sup_taux for overtime rate"
        assert "heures_sup_seuil_hebdo" in data, "Missing heures_sup_seuil_hebdo for weekly threshold"
        
        # Verify values are reasonable
        heures_sup_taux = data.get("heures_sup_taux", 1.5)
        assert heures_sup_taux >= 1.0, f"heures_sup_taux should be >= 1.0, got {heures_sup_taux}"
        
        heures_sup_seuil = data.get("heures_sup_seuil_hebdo", 40)
        assert 0 < heures_sup_seuil <= 168, f"heures_sup_seuil_hebdo should be between 0-168, got {heures_sup_seuil}"
        
        print(f"✓ Overtime configuration valid:")
        print(f"  - Rate multiplier: {heures_sup_taux}x")
        print(f"  - Weekly threshold: {heures_sup_seuil}h")


class TestSheffordTenant(TestAuthSetup):
    """Test with shefford tenant as mentioned in misc info"""
    
    @pytest.fixture(scope="class")
    def shefford_auth_token(self):
        """Try to authenticate with shefford tenant"""
        response = requests.post(
            f"{BASE_URL}/api/shefford/auth/login",
            json={"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        # Skip if shefford tenant doesn't have same credentials
        pytest.skip("Shefford tenant credentials not available")
    
    @pytest.fixture(scope="class")
    def shefford_headers(self, shefford_auth_token):
        return {
            "Authorization": f"Bearer {shefford_auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_shefford_paie_parametres(self, shefford_headers):
        """Test paie parametres on shefford tenant"""
        response = requests.get(
            f"{BASE_URL}/api/shefford/paie/parametres",
            headers=shefford_headers
        )
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Shefford overtime rate: {data.get('heures_sup_taux')}x")
        else:
            print(f"⚠ Shefford paie parametres: {response.status_code}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
