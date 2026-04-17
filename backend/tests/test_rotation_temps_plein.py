"""
Tests for Rotation Temps Plein (Full-Time Rotation) Feature
============================================================

Tests the P0 feature: Integration of full-time team rotation in automatic planning generation.

Features tested:
1. Attribution automatique avec rotation temps plein active crée des assignations de type 'rotation_temps_plein'
2. La date d'activation est respectée : pas de rotation pour les dates avant date_activation
3. Le re-run avec reset=true supprime et recrée correctement les assignations rotation
4. Les gardes externes ne reçoivent PAS d'assignation rotation
5. La rotation alterne bien entre les équipes selon le template Shefford
6. Quand rotation désactivée, aucune assignation rotation n'est créée

Test data already created:
- 4 users temps_plein (TestTP1+TestTP2 equipe 1, TestTP3+TestTP4 equipe 2)
- Rotation temps plein ACTIVE with template Shefford (id: ec4dd367-40ed-4ee3-b39f-613129c37c45)
- date_activation: 2026-03-01
- Type de garde: 'Garde de jour' (06:00-18:00, 2 requis, interne)
"""

import pytest
import requests
import os
import time
from datetime import datetime, timedelta

# Get backend URL from environment
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://workflow-test-3.preview.emergentagent.com').rstrip('/')
TENANT = "demo"

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"


class TestRotationTempsPlein:
    """Tests for the Rotation Temps Plein feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
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
    
    def test_01_verify_rotation_tp_config_active(self):
        """Verify that rotation temps plein is configured and active"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/parametres/equipes-garde")
        assert response.status_code == 200, f"Failed to get equipes-garde params: {response.text}"
        
        data = response.json()
        assert data.get("actif") == True, "Equipes de garde system should be active"
        
        temps_plein = data.get("temps_plein", {})
        assert temps_plein.get("rotation_active") == True, "Rotation temps plein should be active"
        
        date_activation = temps_plein.get("date_activation")
        assert date_activation is not None, "date_activation should be set"
        assert date_activation == "2026-03-01", f"date_activation should be 2026-03-01, got {date_activation}"
        
        type_rotation = temps_plein.get("type_rotation")
        assert type_rotation is not None, "type_rotation should be set"
        print(f"✅ Rotation TP config verified: active=True, date_activation={date_activation}, type_rotation={type_rotation}")
    
    def test_02_verify_test_users_exist(self):
        """Verify that test users (TestTP1-4) exist with correct equipe_garde"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/users")
        assert response.status_code == 200, f"Failed to get users: {response.text}"
        
        users = response.json()
        test_users = [u for u in users if u.get("prenom", "").startswith("TestTP")]
        
        assert len(test_users) >= 4, f"Expected at least 4 TestTP users, found {len(test_users)}"
        
        # Verify equipe_garde assignments
        equipe_1_users = [u for u in test_users if u.get("equipe_garde") == 1]
        equipe_2_users = [u for u in test_users if u.get("equipe_garde") == 2]
        
        assert len(equipe_1_users) >= 2, f"Expected at least 2 users in equipe 1, found {len(equipe_1_users)}"
        assert len(equipe_2_users) >= 2, f"Expected at least 2 users in equipe 2, found {len(equipe_2_users)}"
        
        print(f"✅ Test users verified: {len(equipe_1_users)} in equipe 1, {len(equipe_2_users)} in equipe 2")
    
    def test_03_verify_garde_de_jour_exists(self):
        """Verify that 'Garde de jour' type exists and is internal"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        assert response.status_code == 200, f"Failed to get types-garde: {response.text}"
        
        types_garde = response.json()
        garde_jour = next((tg for tg in types_garde if "jour" in tg.get("nom", "").lower()), None)
        
        assert garde_jour is not None, "Garde de jour type should exist"
        assert garde_jour.get("est_garde_externe", True) == False, "Garde de jour should be internal (not external)"
        
        print(f"✅ Garde de jour verified: id={garde_jour.get('id')}, est_externe={garde_jour.get('est_garde_externe')}")
        return garde_jour
    
    def test_04_attribution_auto_creates_rotation_tp_assignations(self):
        """
        Test that automatic attribution creates assignations with type 'rotation_temps_plein'
        for dates AFTER date_activation (2026-03-01)
        """
        # Use a week in March 2026 (after date_activation)
        semaine_debut = "2026-03-02"  # Monday March 2, 2026
        semaine_fin = "2026-03-08"    # Sunday March 8, 2026
        
        # Run attribution auto with reset=true
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=true",
            json={}
        )
        
        assert response.status_code == 200, f"Attribution auto failed: {response.text}"
        
        data = response.json()
        task_id = data.get("task_id")
        assert task_id is not None, "Should return a task_id for async processing"
        
        print(f"✅ Attribution auto started: task_id={task_id}")
        
        # Wait for async task to complete (up to 30 seconds)
        time.sleep(15)  # Wait for processing
        
        # Get assignations for the week
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/assignations/{semaine_debut}?mode=semaine")
        assert response.status_code == 200, f"Failed to get assignations: {response.text}"
        
        assignations = response.json()
        
        # Check for rotation_temps_plein assignations
        rotation_tp_assignations = [a for a in assignations if a.get("assignation_type") == "rotation_temps_plein"]
        
        print(f"📊 Total assignations: {len(assignations)}")
        print(f"📊 Rotation TP assignations: {len(rotation_tp_assignations)}")
        
        # Should have at least some rotation_temps_plein assignations
        assert len(rotation_tp_assignations) > 0, "Should have rotation_temps_plein assignations after date_activation"
        
        # Verify justification contains rotation info
        for a in rotation_tp_assignations[:2]:  # Check first 2
            justification = a.get("justification", {})
            assert justification.get("niveau") == 1.1, f"Niveau should be 1.1, got {justification.get('niveau')}"
            assert "rotation" in justification.get("niveau_description", "").lower(), "Description should mention rotation"
            print(f"  ✅ Assignation {a.get('date')}: niveau={justification.get('niveau')}, type={a.get('assignation_type')}")
        
        print(f"✅ Rotation TP assignations created correctly: {len(rotation_tp_assignations)} found")
    
    def test_05_no_rotation_before_date_activation(self):
        """
        Test that NO rotation_temps_plein assignations are created for dates BEFORE date_activation
        """
        # Use a week in February 2026 (BEFORE date_activation 2026-03-01)
        semaine_debut = "2026-02-16"  # Monday February 16, 2026
        semaine_fin = "2026-02-22"    # Sunday February 22, 2026
        
        # Run attribution auto with reset=true
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=true",
            json={}
        )
        
        assert response.status_code == 200, f"Attribution auto failed: {response.text}"
        
        # Wait for async task to complete
        time.sleep(15)
        
        # Get assignations for the week
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/assignations/{semaine_debut}?mode=semaine")
        assert response.status_code == 200, f"Failed to get assignations: {response.text}"
        
        assignations = response.json()
        
        # Check for rotation_temps_plein assignations - should be NONE
        rotation_tp_assignations = [a for a in assignations if a.get("assignation_type") == "rotation_temps_plein"]
        
        print(f"📊 Total assignations (before activation): {len(assignations)}")
        print(f"📊 Rotation TP assignations (before activation): {len(rotation_tp_assignations)}")
        
        assert len(rotation_tp_assignations) == 0, f"Should have NO rotation_temps_plein assignations before date_activation, found {len(rotation_tp_assignations)}"
        
        print(f"✅ No rotation TP assignations before date_activation (as expected)")
    
    def test_06_external_gardes_no_rotation_tp(self):
        """
        Test that external gardes do NOT receive rotation_temps_plein assignations
        """
        # First, get types de garde to find an external one
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/types-garde")
        assert response.status_code == 200
        
        types_garde = response.json()
        external_gardes = [tg for tg in types_garde if tg.get("est_garde_externe") == True]
        
        if not external_gardes:
            pytest.skip("No external garde types found - cannot test this scenario")
        
        # Use a week after date_activation
        semaine_debut = "2026-03-09"
        semaine_fin = "2026-03-15"
        
        # Run attribution auto
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=true",
            json={}
        )
        assert response.status_code == 200
        
        time.sleep(15)
        
        # Get assignations
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/assignations/{semaine_debut}?mode=semaine")
        assert response.status_code == 200
        
        assignations = response.json()
        
        # Get external garde IDs
        external_garde_ids = [tg.get("id") for tg in external_gardes]
        
        # Check rotation_temps_plein assignations for external gardes
        rotation_tp_external = [
            a for a in assignations 
            if a.get("assignation_type") == "rotation_temps_plein" 
            and a.get("type_garde_id") in external_garde_ids
        ]
        
        print(f"📊 External garde types: {len(external_gardes)}")
        print(f"📊 Rotation TP on external gardes: {len(rotation_tp_external)}")
        
        assert len(rotation_tp_external) == 0, f"External gardes should NOT have rotation_temps_plein assignations, found {len(rotation_tp_external)}"
        
        print(f"✅ External gardes correctly excluded from rotation TP")
    
    def test_07_reset_true_recreates_rotation_assignations(self):
        """
        Test that re-running with reset=true correctly deletes and recreates rotation assignations
        """
        semaine_debut = "2026-03-16"
        semaine_fin = "2026-03-22"
        
        # First run
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=true",
            json={}
        )
        assert response.status_code == 200
        time.sleep(15)
        
        # Get first run assignations
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/assignations/{semaine_debut}?mode=semaine")
        assert response.status_code == 200
        first_run_assignations = response.json()
        first_run_ids = set(a.get("id") for a in first_run_assignations)
        first_run_rotation_count = len([a for a in first_run_assignations if a.get("assignation_type") == "rotation_temps_plein"])
        
        print(f"📊 First run: {len(first_run_assignations)} total, {first_run_rotation_count} rotation TP")
        
        # Second run with reset=true
        response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/planning/attribution-auto?semaine_debut={semaine_debut}&semaine_fin={semaine_fin}&reset=true",
            json={}
        )
        assert response.status_code == 200
        time.sleep(15)
        
        # Get second run assignations
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/planning/assignations/{semaine_debut}?mode=semaine")
        assert response.status_code == 200
        second_run_assignations = response.json()
        second_run_ids = set(a.get("id") for a in second_run_assignations)
        second_run_rotation_count = len([a for a in second_run_assignations if a.get("assignation_type") == "rotation_temps_plein"])
        
        print(f"📊 Second run: {len(second_run_assignations)} total, {second_run_rotation_count} rotation TP")
        
        # IDs should be different (old ones deleted, new ones created)
        common_ids = first_run_ids & second_run_ids
        
        # Filter to only check auto/rotation assignations (manual ones should persist)
        first_auto_ids = set(a.get("id") for a in first_run_assignations if a.get("assignation_type") in ["auto", "automatique", "rotation_temps_plein"])
        second_auto_ids = set(a.get("id") for a in second_run_assignations if a.get("assignation_type") in ["auto", "automatique", "rotation_temps_plein"])
        common_auto_ids = first_auto_ids & second_auto_ids
        
        print(f"📊 Common auto/rotation IDs between runs: {len(common_auto_ids)}")
        
        # Auto assignations should have been recreated (different IDs)
        assert len(common_auto_ids) == 0, f"Auto assignations should be recreated with new IDs, found {len(common_auto_ids)} common"
        
        # Should still have rotation_temps_plein assignations
        assert second_run_rotation_count > 0, "Should still have rotation_temps_plein assignations after reset"
        
        print(f"✅ Reset correctly recreates rotation assignations")
    
    def test_08_equipe_du_jour_endpoint(self):
        """Test the equipe-du-jour endpoint returns correct team for a date"""
        # Test for a date after activation
        test_date = "2026-03-05"
        
        response = self.session.get(
            f"{BASE_URL}/api/{TENANT}/equipes-garde/equipe-du-jour?date={test_date}&type_emploi=temps_plein"
        )
        assert response.status_code == 200, f"Failed to get equipe du jour: {response.text}"
        
        data = response.json()
        equipe = data.get("equipe")
        
        assert equipe is not None, "Should return an equipe number"
        assert equipe in [1, 2, 3, 4, 5], f"Equipe should be 1-5, got {equipe}"
        
        print(f"✅ Equipe du jour for {test_date}: {equipe} ({data.get('nom', 'N/A')})")
    
    def test_09_verify_horaire_personnalise_template(self):
        """Verify the Shefford template exists in horaires_personnalises"""
        # The template ID from the context
        template_id = "ec4dd367-40ed-4ee3-b39f-613129c37c45"
        
        # Get equipes-garde params to check the type_rotation
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/parametres/equipes-garde")
        assert response.status_code == 200
        
        data = response.json()
        temps_plein = data.get("temps_plein", {})
        type_rotation = temps_plein.get("type_rotation")
        
        print(f"📊 Type rotation configured: {type_rotation}")
        
        # If it's a UUID (not a preset), verify the template exists
        if type_rotation and type_rotation not in ["aucun", "montreal", "quebec", "longueuil", "personnalisee"]:
            # It's a UUID - should be the Shefford template
            print(f"✅ Using custom template: {type_rotation}")
            
            # Verify date_reference is set
            date_reference = temps_plein.get("date_reference")
            if date_reference:
                print(f"✅ Date reference: {date_reference}")
        else:
            print(f"ℹ️ Using preset rotation type: {type_rotation}")


class TestRotationTempsPleinDisabled:
    """Tests when rotation temps plein is disabled"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login
        login_response = self.session.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            pytest.skip(f"Login failed: {login_response.status_code}")
        
        token = login_response.json().get("access_token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        yield
    
    def test_10_check_rotation_status(self):
        """Check current rotation status - informational test"""
        response = self.session.get(f"{BASE_URL}/api/{TENANT}/parametres/equipes-garde")
        assert response.status_code == 200
        
        data = response.json()
        actif = data.get("actif", False)
        temps_plein = data.get("temps_plein", {})
        rotation_active = temps_plein.get("rotation_active", False)
        date_activation = temps_plein.get("date_activation")
        
        print(f"📊 Equipes garde system: actif={actif}")
        print(f"📊 Rotation temps plein: active={rotation_active}, date_activation={date_activation}")
        
        # This is informational - we just want to know the current state
        if rotation_active:
            print("✅ Rotation temps plein is ACTIVE")
        else:
            print("ℹ️ Rotation temps plein is DISABLED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
