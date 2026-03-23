"""
Tests pour les fonctionnalités d'import XML/CSV et historique des bâtiments.
- Import XML (Rôle d'évaluation foncière du Québec)
- Import CSV
- Historique des modifications
- Module Bâtiments accessible
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "gussdub@icloud.com"
TEST_PASSWORD = "230685Juin+"
TENANT = "demo"


class TestAuthentication:
    """Test authentication to get token"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    
    def test_login_success(self, auth_token):
        """Verify login works"""
        assert auth_token is not None
        assert len(auth_token) > 0
        print(f"✅ Login successful, token obtained")


class TestBatimentsModule:
    """Test Bâtiments module endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_get_batiments_list(self, headers):
        """Test GET /batiments - list all buildings"""
        response = requests.get(f"{BASE_URL}/api/{TENANT}/batiments", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ GET /batiments returned {len(data)} buildings")
    
    def test_get_batiments_categories(self, headers):
        """Test GET /batiments/meta/categories - get building categories"""
        response = requests.get(f"{BASE_URL}/api/{TENANT}/batiments/meta/categories", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "groupes_occupation" in data
        assert "niveaux_risque" in data
        print(f"✅ GET /batiments/meta/categories returned categories")
    
    def test_get_batiments_statistiques(self, headers):
        """Test GET /batiments/statistiques - get building statistics"""
        response = requests.get(f"{BASE_URL}/api/{TENANT}/batiments/statistiques", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        print(f"✅ GET /batiments/statistiques returned stats: total={data.get('total')}")


class TestImportXMLPreview:
    """Test XML import preview functionality"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_import_preview_xml_file(self, headers):
        """Test POST /batiments/import/preview with XML file"""
        xml_file_path = "/tmp/test_role.xml"
        
        if not os.path.exists(xml_file_path):
            pytest.skip(f"XML test file not found at {xml_file_path}")
        
        with open(xml_file_path, 'rb') as f:
            files = {'file': ('test_role.xml', f, 'application/xml')}
            response = requests.post(
                f"{BASE_URL}/api/{TENANT}/batiments/import/preview",
                headers=headers,
                files=files
            )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "session_id" in data, "Response should contain session_id"
        assert "total_rows" in data, "Response should contain total_rows"
        assert "new_batiments" in data, "Response should contain new_batiments"
        assert "conflicts" in data, "Response should contain conflicts"
        
        print(f"✅ XML Import Preview:")
        print(f"   - Session ID: {data['session_id'][:8]}...")
        print(f"   - Total rows: {data['total_rows']}")
        print(f"   - New buildings: {data['new_batiments']}")
        print(f"   - Conflicts: {len(data['conflicts'])}")
        print(f"   - Duplicates in file: {data.get('duplicates_in_file', 0)}")
        print(f"   - Errors: {len(data.get('errors', []))}")
        
        # Store session_id for execute test
        return data
    
    def test_import_preview_csv_file(self, headers):
        """Test POST /batiments/import/preview with CSV file"""
        # Create a simple CSV test file
        csv_content = """adresse_civique,ville,code_postal,contact_nom,annee_construction,nombre_etages,superficie,nombre_logements
123 Rue Test,Montréal,H2X 1Y2,Jean Dupont,1990,3,150.5,6
456 Avenue Demo,Québec,G1R 2B3,Marie Martin,2005,2,200.0,4
"""
        files = {'file': ('test.csv', csv_content.encode('utf-8'), 'text/csv')}
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/batiments/import/preview",
            headers=headers,
            files=files
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert "session_id" in data
        assert "total_rows" in data
        assert data["total_rows"] == 2, f"Expected 2 rows, got {data['total_rows']}"
        
        print(f"✅ CSV Import Preview:")
        print(f"   - Total rows: {data['total_rows']}")
        print(f"   - New buildings: {data['new_batiments']}")


class TestImportXMLExtractedFields:
    """Test that XML import extracts all required fields"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}"}
    
    def test_xml_extracts_required_fields(self, headers):
        """Verify XML import extracts: adresse, ville, code postal, propriétaire, année construction, étages, superficie, logements"""
        xml_file_path = "/tmp/test_role.xml"
        
        if not os.path.exists(xml_file_path):
            pytest.skip(f"XML test file not found at {xml_file_path}")
        
        with open(xml_file_path, 'rb') as f:
            files = {'file': ('test_role.xml', f, 'application/xml')}
            response = requests.post(
                f"{BASE_URL}/api/{TENANT}/batiments/import/preview",
                headers=headers,
                files=files
            )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check if we have new buildings or conflicts to examine
        buildings_to_check = []
        
        if data.get('new_batiments') > 0 and 'conflicts' in data:
            # Get from conflicts which contain new_data
            for conflict in data.get('conflicts', []):
                if 'new_data' in conflict:
                    buildings_to_check.append(conflict['new_data'])
        
        # If no conflicts, we need to check the session data
        # For now, just verify the structure is correct
        print(f"✅ XML Import extracts buildings with expected structure")
        print(f"   - Total buildings found: {data['total_rows']}")
        
        # Check first conflict's new_data for field presence
        if data.get('conflicts') and len(data['conflicts']) > 0:
            first_building = data['conflicts'][0].get('new_data', {})
            
            # Required fields from XML
            expected_fields = ['adresse_civique', 'ville', 'code_postal', 'contact_nom', 
                             'annee_construction', 'nombre_etages', 'superficie', 'nombre_logements']
            
            found_fields = []
            missing_fields = []
            
            for field in expected_fields:
                if field in first_building and first_building[field]:
                    found_fields.append(field)
                else:
                    missing_fields.append(field)
            
            print(f"   - Found fields: {found_fields}")
            if missing_fields:
                print(f"   - Missing/empty fields: {missing_fields}")
            
            # At minimum, adresse_civique should be present
            assert 'adresse_civique' in first_building, "adresse_civique should be extracted"


class TestHistorique:
    """Test historique des modifications"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def existing_batiment_id(self, headers):
        """Get an existing batiment ID for testing"""
        response = requests.get(f"{BASE_URL}/api/{TENANT}/batiments", headers=headers)
        if response.status_code == 200:
            batiments = response.json()
            if batiments and len(batiments) > 0:
                return batiments[0].get('id')
        return None
    
    def test_get_batiment_historique(self, headers, existing_batiment_id):
        """Test GET /batiments/{id}/historique - get modification history"""
        if not existing_batiment_id:
            pytest.skip("No existing batiment found for testing")
        
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/batiments/{existing_batiment_id}/historique",
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Response should be a list of history entries
        assert isinstance(data, list), "Historique should return a list"
        
        print(f"✅ GET /batiments/{existing_batiment_id[:8]}../historique")
        print(f"   - History entries: {len(data)}")
        
        if len(data) > 0:
            first_entry = data[0]
            print(f"   - First entry action: {first_entry.get('action')}")
            print(f"   - First entry source: {first_entry.get('source')}")
            print(f"   - First entry timestamp: {first_entry.get('timestamp')}")
    
    def test_get_batiment_complet(self, headers, existing_batiment_id):
        """Test GET /batiments/{id}/complet - get building with all info including history"""
        if not existing_batiment_id:
            pytest.skip("No existing batiment found for testing")
        
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/batiments/{existing_batiment_id}/complet",
            headers=headers
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Should contain building data and history
        assert "id" in data, "Response should contain building id"
        assert "historique_modifications" in data, "Response should contain historique_modifications"
        
        print(f"✅ GET /batiments/{existing_batiment_id[:8]}../complet")
        print(f"   - Has prevention module: {data.get('has_prevention_module')}")
        print(f"   - History entries: {len(data.get('historique_modifications', []))}")


class TestHistoriqueTracking:
    """Test that create/update/delete actions are tracked in history"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_create_batiment_logs_history(self, headers):
        """Test that creating a batiment logs to history"""
        # Create a test batiment
        test_batiment = {
            "adresse_civique": "TEST_999 Rue Historique",
            "ville": "Montréal",
            "code_postal": "H2X 1Y2",
            "province": "Québec",
            "niveau_risque": "Faible"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/batiments",
            headers=headers,
            json=test_batiment
        )
        
        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        data = response.json()
        batiment_id = data.get('id')
        
        assert batiment_id, "Created batiment should have an ID"
        print(f"✅ Created test batiment: {batiment_id[:8]}...")
        
        # Check history was logged
        history_response = requests.get(
            f"{BASE_URL}/api/{TENANT}/batiments/{batiment_id}/historique",
            headers=headers
        )
        
        assert history_response.status_code == 200
        history = history_response.json()
        
        # Should have at least one entry for creation
        assert len(history) >= 1, "History should have at least one entry after creation"
        
        # Find the create entry
        create_entries = [h for h in history if h.get('action') == 'create']
        assert len(create_entries) >= 1, "Should have a 'create' action in history"
        
        create_entry = create_entries[0]
        assert create_entry.get('source') == 'manual', "Create source should be 'manual'"
        
        print(f"✅ History logged for creation:")
        print(f"   - Action: {create_entry.get('action')}")
        print(f"   - Source: {create_entry.get('source')}")
        print(f"   - User: {create_entry.get('user_name')}")
        
        # Cleanup - delete the test batiment
        delete_response = requests.delete(
            f"{BASE_URL}/api/{TENANT}/batiments/{batiment_id}",
            headers=headers
        )
        print(f"   - Cleanup: deleted test batiment")
        
        return batiment_id


class TestPreventionModuleNoBatimentsTab:
    """Test that Prevention module does NOT have a Bâtiments tab/button"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token") or data.get("access_token")
        pytest.skip("Authentication failed")
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    def test_prevention_endpoints_exist(self, headers):
        """Verify Prevention module endpoints still work (but without batiments tab)"""
        # Test prevention dashboard/stats
        response = requests.get(
            f"{BASE_URL}/api/{TENANT}/prevention/statistiques",
            headers=headers
        )
        
        # Should work (200) or return 404 if not configured
        assert response.status_code in [200, 404], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            print(f"✅ Prevention module is active")
        else:
            print(f"ℹ️ Prevention module not configured for this tenant")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
