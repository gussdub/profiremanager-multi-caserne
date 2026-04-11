"""
Test suite for Import Interventions History feature.
Tests CSV/ZIP import, preview, execute, and retrieval endpoints.
"""
import pytest
import requests
import os
import json

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
TENANT = "demo"
API_URL = f"{BASE_URL}/api/{TENANT}"

# Test credentials
TEST_EMAIL = "gussdub@gmail.com"
TEST_PASSWORD = "230685Juin+"


class TestImportInterventionsHistory:
    """Test suite for import interventions history endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login to get token
        login_response = self.session.post(
            f"{API_URL}/auth/login",
            json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
        )
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        token = login_response.json().get("access_token")
        assert token, "No access_token in login response"
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        yield
    
    # ==================== PREVIEW TESTS ====================
    
    def test_01_preview_csv_file(self):
        """Test POST /api/demo/interventions/import-history/preview with CSV file"""
        csv_path = "/tmp/test_interventions.csv"
        if not os.path.exists(csv_path):
            pytest.skip("Test CSV file not found")
        
        with open(csv_path, 'rb') as f:
            files = {'file': ('test_interventions.csv', f, 'text/csv')}
            # Use requests directly without session to avoid Content-Type header conflict
            response = requests.post(
                f"{API_URL}/interventions/import-history/preview",
                files=files,
                headers={"Authorization": f"Bearer {self.token}"}
            )
        
        print(f"Preview CSV response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Preview failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "session_id" in data, "Missing session_id"
        assert "type" in data, "Missing type"
        assert data["type"] == "intervention", f"Expected type 'intervention', got '{data['type']}'"
        assert "total" in data, "Missing total"
        assert "new_count" in data, "Missing new_count"
        assert "duplicate_count" in data, "Missing duplicate_count"
        assert "preview" in data, "Missing preview"
        
        # Verify matched/unmatched counts
        assert "matched_count" in data, "Missing matched_count"
        assert "unmatched_count" in data, "Missing unmatched_count"
        
        print(f"CSV Preview: total={data['total']}, new={data['new_count']}, duplicates={data['duplicate_count']}")
        print(f"Matched: {data['matched_count']}, Unmatched: {data['unmatched_count']}")
        
        # Store session_id for execute test
        self.__class__.csv_session_id = data.get("session_id")
        self.__class__.csv_new_count = data.get("new_count", 0)
    
    def test_02_preview_zip_dossier_adresse(self):
        """Test POST /api/demo/interventions/import-history/preview with ZIP (DossierAdresse.zip)"""
        zip_path = "/tmp/DossierAdresse.zip"
        if not os.path.exists(zip_path):
            pytest.skip("DossierAdresse.zip not found")
        
        with open(zip_path, 'rb') as f:
            files = {'file': ('DossierAdresse.zip', f, 'application/zip')}
            # Use requests directly without session to avoid Content-Type header conflict
            response = requests.post(
                f"{API_URL}/interventions/import-history/preview",
                files=files,
                headers={"Authorization": f"Bearer {self.token}"}
            )
        
        print(f"Preview ZIP response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Preview ZIP failed: {response.text}"
        data = response.json()
        
        # Verify response structure for dossier_adresse type
        assert "session_id" in data, "Missing session_id"
        assert "type" in data, "Missing type"
        assert data["type"] == "dossier_adresse", f"Expected type 'dossier_adresse', got '{data['type']}'"
        assert "total" in data, "Missing total"
        assert data["total"] > 0, "Expected at least 1 dossier adresse"
        assert "files_count" in data, "Missing files_count"
        assert "preview" in data, "Missing preview"
        
        print(f"ZIP Preview: type={data['type']}, total={data['total']}, files={data['files_count']}")
        
        # Store session_id for execute test
        self.__class__.zip_session_id = data.get("session_id")
        self.__class__.zip_total = data.get("total", 0)
    
    # ==================== EXECUTE TESTS ====================
    
    def test_03_execute_csv_import(self):
        """Test POST /api/demo/interventions/import-history/execute for CSV"""
        # First do a fresh preview to get a valid session
        csv_path = "/tmp/test_interventions.csv"
        if not os.path.exists(csv_path):
            pytest.skip("Test CSV file not found")
        
        with open(csv_path, 'rb') as f:
            files = {'file': ('test_interventions.csv', f, 'text/csv')}
            preview_response = requests.post(
                f"{API_URL}/interventions/import-history/preview",
                files=files,
                headers={"Authorization": f"Bearer {self.token}"}
            )
        
        if preview_response.status_code != 200:
            pytest.skip(f"Preview failed: {preview_response.text}")
        
        preview_data = preview_response.json()
        session_id = preview_data.get("session_id")
        
        if preview_data.get("new_count", 0) == 0:
            print("No new interventions to import (all duplicates)")
            # Still test the execute endpoint
        
        # Execute import
        response = self.session.post(
            f"{API_URL}/interventions/import-history/execute",
            json={"session_id": session_id, "skip_duplicates": True}
        )
        
        print(f"Execute CSV response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Execute failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "success" in data, "Missing success field"
        assert data["success"] == True, "Import not successful"
        assert "created" in data, "Missing created count"
        assert "message" in data, "Missing message"
        
        print(f"Execute result: created={data['created']}, message={data['message']}")
    
    def test_04_execute_zip_import(self):
        """Test POST /api/demo/interventions/import-history/execute for ZIP (DossierAdresse)"""
        zip_path = "/tmp/DossierAdresse.zip"
        if not os.path.exists(zip_path):
            pytest.skip("DossierAdresse.zip not found")
        
        # First do a fresh preview
        with open(zip_path, 'rb') as f:
            files = {'file': ('DossierAdresse.zip', f, 'application/zip')}
            preview_response = requests.post(
                f"{API_URL}/interventions/import-history/preview",
                files=files,
                headers={"Authorization": f"Bearer {self.token}"}
            )
        
        if preview_response.status_code != 200:
            pytest.skip(f"Preview failed: {preview_response.text}")
        
        preview_data = preview_response.json()
        session_id = preview_data.get("session_id")
        
        # Execute import
        response = self.session.post(
            f"{API_URL}/interventions/import-history/execute",
            json={"session_id": session_id, "skip_duplicates": True}
        )
        
        print(f"Execute ZIP response: {response.status_code}")
        print(f"Response body: {response.text[:500]}")
        
        assert response.status_code == 200, f"Execute ZIP failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "success" in data, "Missing success field"
        assert data["success"] == True, "Import not successful"
        assert "created" in data, "Missing created count"
        
        print(f"Execute ZIP result: created={data['created']}, files_uploaded={data.get('files_uploaded', 0)}")
    
    # ==================== RETRIEVAL TESTS ====================
    
    def test_05_get_imported_interventions(self):
        """Test GET /api/demo/interventions/historique-import - returns only imported interventions"""
        response = self.session.get(f"{API_URL}/interventions/historique-import")
        
        print(f"Get imported interventions response: {response.status_code}")
        
        assert response.status_code == 200, f"Get imported failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "interventions" in data, "Missing interventions"
        assert "total" in data, "Missing total"
        assert isinstance(data["interventions"], list), "interventions should be a list"
        
        print(f"Imported interventions: total={data['total']}, returned={len(data['interventions'])}")
        
        # Verify all returned interventions have import_source=history_import
        for intv in data["interventions"]:
            assert intv.get("import_source") == "history_import", f"Intervention {intv.get('id')} missing import_source=history_import"
    
    def test_06_get_imported_interventions_with_filters(self):
        """Test GET /api/demo/interventions/historique-import with date and municipality filters"""
        # Test with municipality filter
        response = self.session.get(
            f"{API_URL}/interventions/historique-import",
            params={"municipality": "Sutton", "limit": 50}
        )
        
        print(f"Get imported with filter response: {response.status_code}")
        
        assert response.status_code == 200, f"Get with filter failed: {response.text}"
        data = response.json()
        
        assert "interventions" in data, "Missing interventions"
        print(f"Filtered interventions (Sutton): total={data['total']}")
        
        # Test with date filter
        response2 = self.session.get(
            f"{API_URL}/interventions/historique-import",
            params={"date_from": "2024-01-01", "date_to": "2025-12-31"}
        )
        
        assert response2.status_code == 200, f"Get with date filter failed: {response2.text}"
        data2 = response2.json()
        print(f"Filtered interventions (date range): total={data2['total']}")
    
    def test_07_get_batiment_interventions_historique(self):
        """Test GET /api/demo/batiments/{id}/interventions-historique"""
        # First get a batiment ID
        batiments_response = self.session.get(f"{API_URL}/prevention/batiments?limit=5")
        
        if batiments_response.status_code != 200:
            pytest.skip("Could not get batiments list")
        
        response_data = batiments_response.json()
        # Handle both list and dict response formats
        if isinstance(response_data, list):
            batiments = response_data
        else:
            batiments = response_data.get("batiments", [])
        if not batiments:
            pytest.skip("No batiments found")
        
        batiment_id = batiments[0].get("id")
        print(f"Testing with batiment_id: {batiment_id}")
        
        response = self.session.get(f"{API_URL}/batiments/{batiment_id}/interventions-historique")
        
        print(f"Get batiment interventions response: {response.status_code}")
        
        assert response.status_code == 200, f"Get batiment interventions failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "interventions" in data, "Missing interventions"
        assert "total" in data, "Missing total"
        
        print(f"Batiment interventions: total={data['total']}")
    
    def test_08_get_dossier_adresses(self):
        """Test GET /api/demo/import-history/dossier-adresses"""
        response = self.session.get(f"{API_URL}/import-history/dossier-adresses")
        
        print(f"Get dossier adresses response: {response.status_code}")
        
        assert response.status_code == 200, f"Get dossier adresses failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "dossier_adresses" in data, "Missing dossier_adresses"
        assert "total" in data, "Missing total"
        
        print(f"Dossier adresses: total={data['total']}")
        
        # Verify structure of dossier adresses if any exist
        if data["dossier_adresses"]:
            da = data["dossier_adresses"][0]
            assert "pfm_id" in da or "adresse_civique" in da, "Dossier adresse missing expected fields"
    
    # ==================== CHUNKED UPLOAD TESTS ====================
    
    def test_09_init_chunked_upload(self):
        """Test POST /api/demo/interventions/import-history/init-upload"""
        response = self.session.post(
            f"{API_URL}/interventions/import-history/init-upload",
            json={
                "filename": "test_large_file.zip",
                "total_size": 10000000,
                "total_chunks": 2
            }
        )
        
        print(f"Init chunked upload response: {response.status_code}")
        print(f"Response body: {response.text}")
        
        assert response.status_code == 200, f"Init upload failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "upload_id" in data, "Missing upload_id"
        assert "status" in data, "Missing status"
        assert data["status"] == "ready", f"Expected status 'ready', got '{data['status']}'"
        
        print(f"Chunked upload initialized: upload_id={data['upload_id']}")
        self.__class__.upload_id = data["upload_id"]
    
    def test_10_invalid_session_execute(self):
        """Test execute with invalid session_id returns 404"""
        response = self.session.post(
            f"{API_URL}/interventions/import-history/execute",
            json={"session_id": "invalid-session-id-12345", "skip_duplicates": True}
        )
        
        print(f"Invalid session execute response: {response.status_code}")
        
        assert response.status_code == 404, f"Expected 404 for invalid session, got {response.status_code}"
    
    def test_11_preview_invalid_file_format(self):
        """Test preview with unsupported file format returns 400"""
        # Create a temporary text file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.txt', delete=False) as f:
            f.write(b"This is not a valid CSV or ZIP file")
            temp_path = f.name
        
        try:
            with open(temp_path, 'rb') as f:
                files = {'file': ('test.txt', f, 'text/plain')}
                response = requests.post(
                    f"{API_URL}/interventions/import-history/preview",
                    files=files,
                    headers={"Authorization": f"Bearer {self.token}"}
                )
            
            print(f"Invalid format preview response: {response.status_code}")
            
            # 400 for invalid format or 422 for validation error are both acceptable
            assert response.status_code in [400, 422], f"Expected 400 or 422 for invalid format, got {response.status_code}"
        finally:
            os.unlink(temp_path)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
