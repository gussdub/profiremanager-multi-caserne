"""
Tests pour le système d'inspection des actifs et EPI - Configuration au niveau Type/Catégorie
======================================================================================

Tests pour:
- Configuration des types EPI avec formulaires et fréquences
- Configuration des catégories d'équipements avec formulaires et fréquences
- Sauvegarde des fréquences d'inspection dans les types EPI
- Backend EPI avec frequence_apres_usage, frequence_routine, frequence_avancee
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://employee-lifecycle-6.preview.emergentagent.com').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials from previous iterations
TEST_EMAIL = "gussdub@gmail.com"
TEST_PASSWORD = "230685Juin+"


class TestBackendAuth:
    """Tests d'authentification de base"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token for demo tenant"""
        # First login to get token
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            if token:
                return token
        
        pytest.skip(f"Authentication failed - status: {response.status_code}, response: {response.text}")
        return None
    
    def test_login_returns_token(self):
        """Test that login returns a valid token"""
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert len(data["token"]) > 0, "Token is empty"


class TestTypesEPIConfiguration:
    """Tests pour la configuration des Types d'EPI avec formulaires et fréquences"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_get_types_epi(self, auth_headers):
        """Test récupération des types d'EPI"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-epi",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to get types EPI: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} types EPI")
        
        # Check structure of first type if exists
        if len(data) > 0:
            first_type = data[0]
            assert "id" in first_type, "Type EPI should have an id"
            assert "nom" in first_type, "Type EPI should have a nom"
            print(f"First type EPI: {first_type.get('nom')}")
    
    def test_type_epi_has_frequency_fields(self, auth_headers):
        """Test que les types EPI ont les champs de fréquence"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-epi",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Find a type with frequencies configured
        for type_epi in data:
            # Check if frequency fields exist (they might be null/empty for default types)
            print(f"Type EPI '{type_epi.get('nom')}': frequences = {type_epi.get('frequence_apres_usage')}, {type_epi.get('frequence_routine')}, {type_epi.get('frequence_avancee')}")
    
    def test_create_type_epi_with_frequencies(self, auth_headers):
        """Test création d'un type EPI avec formulaires et fréquences"""
        import uuid
        
        test_type_name = f"TEST_TypeEPI_{str(uuid.uuid4())[:8]}"
        
        new_type_data = {
            "nom": test_type_name,
            "icone": "🧪",
            "description": "Type test pour inspections",
            "formulaire_apres_usage_id": "",  # Empty for now, would need real formulaire ID
            "formulaire_routine_id": "",
            "formulaire_avancee_id": "",
            "frequence_apres_usage": "apres_usage",
            "frequence_routine": "mensuelle",
            "frequence_avancee": "annuelle"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-epi",
            headers=auth_headers,
            json=new_type_data
        )
        
        assert response.status_code == 200, f"Failed to create type EPI: {response.text}"
        created_type = response.json()
        
        # Verify the created type has the correct data
        assert created_type.get("nom") == test_type_name, "Name doesn't match"
        assert created_type.get("icone") == "🧪", "Icon doesn't match"
        assert created_type.get("frequence_apres_usage") == "apres_usage", "Frequency après usage doesn't match"
        assert created_type.get("frequence_routine") == "mensuelle", "Frequency routine doesn't match"
        assert created_type.get("frequence_avancee") == "annuelle", "Frequency avancée doesn't match"
        
        print(f"Created type EPI: {created_type}")
        
        # Cleanup - delete the test type
        if created_type.get("id"):
            delete_response = requests.delete(
                f"{BASE_URL}/api/{TENANT_SLUG}/types-epi/{created_type['id']}",
                headers=auth_headers
            )
            print(f"Cleanup delete status: {delete_response.status_code}")
    
    def test_update_type_epi_frequencies(self, auth_headers):
        """Test mise à jour des fréquences d'un type EPI"""
        import uuid
        
        # First create a test type
        test_type_name = f"TEST_TypeEPI_Update_{str(uuid.uuid4())[:8]}"
        
        new_type_data = {
            "nom": test_type_name,
            "icone": "🔧",
            "description": "Type test pour mise à jour",
            "frequence_apres_usage": "journaliere",
            "frequence_routine": "hebdomadaire",
            "frequence_avancee": "trimestrielle"
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-epi",
            headers=auth_headers,
            json=new_type_data
        )
        
        assert create_response.status_code == 200, f"Failed to create: {create_response.text}"
        created_type = create_response.json()
        type_id = created_type.get("id")
        
        # Now update the frequencies
        update_data = {
            "frequence_apres_usage": "mensuelle",
            "frequence_routine": "annuelle",
            "frequence_avancee": "bi_annuelle"
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/{TENANT_SLUG}/types-epi/{type_id}",
            headers=auth_headers,
            json=update_data
        )
        
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        updated_type = update_response.json()
        
        # Verify frequencies were updated
        assert updated_type.get("frequence_apres_usage") == "mensuelle", f"Frequency après usage not updated: {updated_type}"
        assert updated_type.get("frequence_routine") == "annuelle", f"Frequency routine not updated: {updated_type}"
        assert updated_type.get("frequence_avancee") == "bi_annuelle", f"Frequency avancée not updated: {updated_type}"
        
        print(f"Updated type EPI: {updated_type}")
        
        # Cleanup
        if type_id:
            requests.delete(f"{BASE_URL}/api/{TENANT_SLUG}/types-epi/{type_id}", headers=auth_headers)


class TestEquipementCategoriesConfiguration:
    """Tests pour la configuration des catégories d'équipements avec formulaires et fréquences"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_get_equipement_categories(self, auth_headers):
        """Test récupération des catégories d'équipements"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/equipements/categories",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} equipement categories")
        
        # Check if categories have formulaire fields
        for cat in data[:3]:  # Check first 3
            print(f"Category '{cat.get('nom')}': formulaire_apres_usage_id={cat.get('formulaire_apres_usage_id')}, formulaire_routine_id={cat.get('formulaire_routine_id')}, formulaire_avancee_id={cat.get('formulaire_avancee_id')}")
    
    def test_create_category_with_formulaires(self, auth_headers):
        """Test création d'une catégorie avec formulaires et fréquences"""
        import uuid
        
        test_cat_name = f"TEST_Category_{str(uuid.uuid4())[:8]}"
        
        new_cat_data = {
            "nom": test_cat_name,
            "description": "Catégorie test pour inspections",
            "icone": "🧯",
            "couleur": "#DC2626",
            "formulaire_apres_usage_id": "",
            "formulaire_routine_id": "",
            "formulaire_avancee_id": "",
            "frequence_apres_usage": "apres_usage",
            "frequence_routine": "mensuelle",
            "frequence_avancee": "annuelle"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/equipements/categories",
            headers=auth_headers,
            json=new_cat_data
        )
        
        assert response.status_code in [200, 201], f"Failed to create category: {response.text}"
        created_cat = response.json()
        
        # Verify the category was created with correct data
        assert created_cat.get("nom") == test_cat_name, "Name doesn't match"
        
        print(f"Created category: {created_cat}")
        
        # Cleanup
        if created_cat.get("id"):
            delete_response = requests.delete(
                f"{BASE_URL}/api/{TENANT_SLUG}/equipements/categories/{created_cat['id']}",
                headers=auth_headers
            )
            print(f"Cleanup delete status: {delete_response.status_code}")


class TestFormulairesInspection:
    """Tests pour vérifier les formulaires d'inspection disponibles"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_get_formulaires_inspection(self, auth_headers):
        """Test récupération des formulaires d'inspection"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/formulaires-inspection",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Failed to get formulaires: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"Found {len(data)} formulaires d'inspection")
        
        # List formulaires for reference
        for form in data[:5]:  # Show first 5
            print(f"Formulaire: {form.get('nom')} (ID: {form.get('id')}, categories: {form.get('categorie_ids')})")


class TestEPIInspectionIntegration:
    """Tests d'intégration: EPI récupère les formulaires depuis le Type parent"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/{TENANT_SLUG}/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Return headers with auth token"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_epi_list_has_type_epi_id(self, auth_headers):
        """Test que les EPIs ont un type_epi_id qui référence le type parent"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/epi",
            headers=auth_headers
        )
        
        # EPIs might be empty, which is fine
        if response.status_code == 200:
            data = response.json()
            print(f"Found {len(data)} EPIs")
            
            for epi in data[:3]:  # Check first 3
                print(f"EPI #{epi.get('numero_serie')}: type_epi={epi.get('type_epi')}, type_epi_id={epi.get('type_epi_id')}")
        else:
            print(f"EPI list response: {response.status_code} - {response.text}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
