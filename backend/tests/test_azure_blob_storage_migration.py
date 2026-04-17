"""
Test Azure Blob Storage Migration
=================================
Tests for the migration from Emergent Object Storage to Azure Blob Storage.

Features tested:
1. File upload via POST /api/demo/files/upload - returns Azure SAS URL
2. GET /api/demo/files/{file_id}/sas-url - returns valid SAS URL
3. GET /api/demo/files/{file_id}/download - redirects to Azure SAS URL (HTTP 302)
4. GET /api/demo/prevention/batiments - backward compatibility
5. GET /api/demo/prevention/batiments/{batiment_id} - detailed building with SAS URLs
6. Azure service handles different file types (text, image)
"""

import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://workflow-test-3.preview.emergentagent.com').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials
ADMIN_EMAIL = "gussdub@gmail.com"
ADMIN_PASSWORD = "230685Juin+"

# Test file ID from previous upload (mentioned in agent context)
EXISTING_FILE_ID = "bdb3a6dd-d75b-4f4b-8ede-a3aa46346d1d"


class TestAzureBlobStorageMigration:
    """Test suite for Azure Blob Storage migration"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        token = data.get("access_token")
        assert token, f"No access_token in response: {data}"
        return token
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    # ==================== TEST 1: File Upload ====================
    
    def test_01_file_upload_returns_azure_sas_url(self, auth_token):
        """
        Test: POST /api/demo/files/upload
        Expected: Response contains Azure SAS URL (https://profiremanagerdata.blob.core.windows.net/...)
        """
        # Create a simple test file
        test_content = b"Test file content for Azure Blob Storage migration test"
        files = {
            'file': ('test_azure_upload.txt', io.BytesIO(test_content), 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files,
            params={"category": "test"}
        )
        
        print(f"Upload response status: {response.status_code}")
        print(f"Upload response: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Upload failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response should contain 'id'"
        assert "url" in data, "Response should contain 'url'"
        assert "storage_path" in data, "Response should contain 'storage_path'"
        
        # Verify Azure URL format
        url = data.get("url", "")
        assert "profiremanagerdata.blob.core.windows.net" in url, \
            f"URL should be Azure Blob Storage URL, got: {url}"
        assert "fichiers-clients" in url, \
            f"URL should contain container name 'fichiers-clients', got: {url}"
        
        # Verify SAS token parameters
        assert "sv=" in url, "SAS URL should contain 'sv' (service version)"
        assert "sig=" in url, "SAS URL should contain 'sig' (signature)"
        assert "se=" in url, "SAS URL should contain 'se' (expiry)"
        
        print(f"✓ File uploaded successfully with ID: {data['id']}")
        print(f"✓ Azure SAS URL: {url[:100]}...")
        
        # Store file ID for subsequent tests
        self.__class__.uploaded_file_id = data["id"]
        self.__class__.uploaded_file_url = url
    
    def test_02_file_upload_image_type(self, auth_token):
        """
        Test: Upload image file type
        Expected: Azure handles image content type correctly
        """
        # Create a minimal PNG image (1x1 pixel)
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  # PNG signature
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  # IHDR chunk
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  # 1x1 dimensions
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  # IDAT chunk
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  # IEND chunk
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        
        files = {
            'file': ('test_image.png', io.BytesIO(png_data), 'image/png')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files,
            params={"category": "test-images"}
        )
        
        print(f"Image upload response status: {response.status_code}")
        
        assert response.status_code == 200, f"Image upload failed: {response.text}"
        
        data = response.json()
        assert "url" in data, "Response should contain 'url'"
        assert "profiremanagerdata.blob.core.windows.net" in data["url"], \
            "Image should be uploaded to Azure"
        
        # Verify content type is preserved
        assert data.get("content_type") == "image/png", \
            f"Content type should be image/png, got: {data.get('content_type')}"
        
        print(f"✓ Image uploaded successfully with ID: {data['id']}")
        
        # Store for cleanup
        self.__class__.uploaded_image_id = data["id"]
    
    # ==================== TEST 2: SAS URL Generation ====================
    
    def test_03_get_sas_url_for_existing_file(self, auth_headers):
        """
        Test: GET /api/demo/files/{file_id}/sas-url
        Expected: Returns valid SAS URL for existing file
        """
        file_id = getattr(self.__class__, 'uploaded_file_id', EXISTING_FILE_ID)
        
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/{file_id}/sas-url",
            headers=auth_headers
        )
        
        print(f"SAS URL response status: {response.status_code}")
        print(f"SAS URL response: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Get SAS URL failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "url" in data, "Response should contain 'url'"
        assert "expires_in_minutes" in data, "Response should contain 'expires_in_minutes'"
        
        url = data["url"]
        
        # Verify Azure SAS URL format
        assert "profiremanagerdata.blob.core.windows.net" in url, \
            f"URL should be Azure Blob Storage URL, got: {url}"
        
        # Verify SAS token parameters
        assert "sv=" in url, "SAS URL should contain 'sv' (service version)"
        assert "sig=" in url, "SAS URL should contain 'sig' (signature)"
        assert "se=" in url, "SAS URL should contain 'se' (expiry)"
        assert "sp=" in url, "SAS URL should contain 'sp' (permissions)"
        
        # Verify expiry is 15 minutes
        assert data["expires_in_minutes"] == 15, \
            f"Expiry should be 15 minutes, got: {data['expires_in_minutes']}"
        
        print(f"✓ SAS URL generated successfully")
        print(f"✓ Expires in: {data['expires_in_minutes']} minutes")
    
    def test_04_sas_url_not_found_for_invalid_file(self, auth_headers):
        """
        Test: GET /api/demo/files/{invalid_id}/sas-url
        Expected: Returns 404 for non-existent file
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/invalid-file-id-12345/sas-url",
            headers=auth_headers
        )
        
        assert response.status_code == 404, \
            f"Should return 404 for invalid file, got: {response.status_code}"
        
        print("✓ Correctly returns 404 for non-existent file")
    
    # ==================== TEST 3: Download Redirect ====================
    
    def test_05_download_redirects_to_azure_sas_url(self, auth_token):
        """
        Test: GET /api/demo/files/{file_id}/download
        Expected: Returns HTTP 302 redirect to Azure SAS URL
        """
        file_id = getattr(self.__class__, 'uploaded_file_id', EXISTING_FILE_ID)
        
        # Use allow_redirects=False to capture the redirect
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/{file_id}/download",
            params={"auth": auth_token},
            allow_redirects=False
        )
        
        print(f"Download response status: {response.status_code}")
        print(f"Download response headers: {dict(response.headers)}")
        
        assert response.status_code == 302, \
            f"Should return 302 redirect, got: {response.status_code}"
        
        # Verify redirect location is Azure SAS URL
        location = response.headers.get("Location", "")
        assert "profiremanagerdata.blob.core.windows.net" in location, \
            f"Redirect should be to Azure, got: {location}"
        assert "fichiers-clients" in location, \
            f"Redirect should contain container name, got: {location}"
        
        print(f"✓ Download correctly redirects to Azure SAS URL")
        print(f"✓ Redirect location: {location[:100]}...")
    
    def test_06_download_requires_auth_token(self):
        """
        Test: GET /api/demo/files/{file_id}/download without auth
        Expected: Returns 401 Unauthorized
        """
        file_id = getattr(self.__class__, 'uploaded_file_id', EXISTING_FILE_ID)
        
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/{file_id}/download",
            allow_redirects=False
        )
        
        assert response.status_code == 401, \
            f"Should return 401 without auth, got: {response.status_code}"
        
        print("✓ Download correctly requires authentication")
    
    # ==================== TEST 4: Batiments Backward Compatibility ====================
    
    def test_07_get_batiments_returns_list(self, auth_headers):
        """
        Test: GET /api/demo/prevention/batiments
        Expected: Returns list of buildings without error (backward compatibility)
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments",
            headers=auth_headers
        )
        
        print(f"Batiments response status: {response.status_code}")
        
        assert response.status_code == 200, f"Get batiments failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), f"Response should be a list, got: {type(data)}"
        
        print(f"✓ Batiments endpoint returns {len(data)} buildings")
        
        # Store first batiment ID for detail test
        if data:
            self.__class__.first_batiment_id = data[0].get("id")
            
            # Check if any batiment has Azure photos
            for bat in data:
                if bat.get("photo_storage") == "azure":
                    print(f"✓ Found batiment with Azure photo: {bat.get('nom_etablissement')}")
                    # Verify SAS URL is refreshed
                    if bat.get("photo_url"):
                        assert "profiremanagerdata.blob.core.windows.net" in bat["photo_url"], \
                            "Azure photo should have SAS URL"
                    break
    
    def test_08_get_batiment_detail_with_sas_urls(self, auth_headers):
        """
        Test: GET /api/demo/prevention/batiments/{batiment_id}
        Expected: Returns detailed building with refreshed SAS URLs for photos
        """
        batiment_id = getattr(self.__class__, 'first_batiment_id', None)
        
        if not batiment_id:
            pytest.skip("No batiment available for detail test")
        
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{batiment_id}",
            headers=auth_headers
        )
        
        print(f"Batiment detail response status: {response.status_code}")
        
        assert response.status_code == 200, f"Get batiment detail failed: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should contain 'id'"
        assert data["id"] == batiment_id, "Response ID should match requested ID"
        
        print(f"✓ Batiment detail returned for: {data.get('nom_etablissement', 'N/A')}")
        
        # Check photo URLs if present
        if data.get("photo_storage") == "azure" and data.get("photo_url"):
            assert "profiremanagerdata.blob.core.windows.net" in data["photo_url"], \
                "Azure photo should have SAS URL"
            print(f"✓ Main photo has Azure SAS URL")
        
        # Check gallery photos
        for photo in data.get("photos", []):
            if photo.get("blob_name"):
                assert "url" in photo, "Gallery photo should have 'url'"
                assert "profiremanagerdata.blob.core.windows.net" in photo["url"], \
                    "Gallery photo should have Azure SAS URL"
        
        if data.get("photos"):
            print(f"✓ Gallery has {len(data['photos'])} photos with SAS URLs")
    
    # ==================== TEST 5: Azure Service Handles Different Types ====================
    
    def test_09_azure_service_text_file(self, auth_token):
        """
        Test: Upload text file
        Expected: Azure correctly handles text/plain content type
        """
        test_content = b"This is a test text file for Azure Blob Storage"
        files = {
            'file': ('test_document.txt', io.BytesIO(test_content), 'text/plain')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files,
            params={"category": "test-documents"}
        )
        
        assert response.status_code == 200, f"Text file upload failed: {response.text}"
        
        data = response.json()
        assert data.get("content_type") == "text/plain", \
            f"Content type should be text/plain, got: {data.get('content_type')}"
        
        print(f"✓ Text file uploaded with correct content type")
        
        # Store for cleanup
        self.__class__.uploaded_text_id = data["id"]
    
    def test_10_azure_service_pdf_file(self, auth_token):
        """
        Test: Upload PDF file (simulated)
        Expected: Azure correctly handles application/pdf content type
        """
        # Minimal PDF content
        pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        files = {
            'file': ('test_document.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/upload",
            headers={"Authorization": f"Bearer {auth_token}"},
            files=files,
            params={"category": "test-pdfs"}
        )
        
        assert response.status_code == 200, f"PDF file upload failed: {response.text}"
        
        data = response.json()
        assert data.get("content_type") == "application/pdf", \
            f"Content type should be application/pdf, got: {data.get('content_type')}"
        
        print(f"✓ PDF file uploaded with correct content type")
        
        # Store for cleanup
        self.__class__.uploaded_pdf_id = data["id"]
    
    # ==================== TEST 6: SAS URL Accessibility ====================
    
    def test_11_sas_url_is_accessible(self, auth_headers):
        """
        Test: Verify SAS URL can be accessed directly
        Expected: Azure SAS URL returns the file content
        """
        file_id = getattr(self.__class__, 'uploaded_file_id', None)
        
        if not file_id:
            pytest.skip("No uploaded file available for accessibility test")
        
        # Get SAS URL
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/files/{file_id}/sas-url",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Get SAS URL failed: {response.text}"
        
        sas_url = response.json().get("url")
        
        # Try to access the SAS URL directly (no auth needed - SAS provides access)
        azure_response = requests.get(sas_url)
        
        print(f"Azure direct access status: {azure_response.status_code}")
        
        assert azure_response.status_code == 200, \
            f"SAS URL should be accessible, got: {azure_response.status_code}"
        
        print(f"✓ SAS URL is directly accessible from Azure")
        print(f"✓ Content length: {len(azure_response.content)} bytes")


class TestPreventionMediaAzure:
    """Test prevention media upload to Azure"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    @pytest.fixture(scope="class")
    def auth_headers(self, auth_token):
        """Get headers with auth token"""
        return {
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json"
        }
    
    def test_12_prevention_photo_upload_to_azure(self, auth_headers):
        """
        Test: POST /api/demo/prevention/upload-photo
        Expected: Photo uploaded to Azure with SAS URL returned
        """
        # Create a minimal base64 PNG image
        import base64
        png_data = bytes([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
            0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
            0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ])
        base64_image = f"data:image/png;base64,{base64.b64encode(png_data).decode()}"
        
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/upload-photo",
            headers=auth_headers,
            json={
                "photo_base64": base64_image,
                "filename": "test_prevention_photo.png"
            }
        )
        
        print(f"Prevention photo upload status: {response.status_code}")
        print(f"Prevention photo upload response: {response.text[:500] if response.text else 'empty'}")
        
        assert response.status_code == 200, f"Prevention photo upload failed: {response.text}"
        
        data = response.json()
        assert "photo_id" in data, "Response should contain 'photo_id'"
        assert "url" in data, "Response should contain 'url'"
        
        # Verify Azure URL
        assert "profiremanagerdata.blob.core.windows.net" in data["url"], \
            f"URL should be Azure Blob Storage URL, got: {data['url']}"
        
        print(f"✓ Prevention photo uploaded to Azure with ID: {data['photo_id']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
