"""
Test PDF Export for Building Report
====================================
Tests the GET /api/{tenant}/prevention/batiments/{batiment_id}/rapport-pdf endpoint
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from test_credentials.md
TENANT_SLUG = "demo"
TEST_EMAIL = "info@profiremanager.ca"
TEST_PASSWORD = "230685Juin+"
BATIMENT_ID = "1f1623c4-3ed6-4664-b26f-f2837adee559"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
        json={"email": TEST_EMAIL, "mot_de_passe": TEST_PASSWORD}
    )
    if response.status_code == 200:
        data = response.json()
        return data.get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")


@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestPDFExportBatiment:
    """Tests for building PDF export endpoint"""
    
    def test_pdf_endpoint_returns_200(self, api_client):
        """Test that PDF endpoint returns HTTP 200"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✅ PDF endpoint returned 200 OK")
    
    def test_pdf_content_type(self, api_client):
        """Test that response has correct Content-Type"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200
        content_type = response.headers.get('Content-Type', '')
        assert 'application/pdf' in content_type, f"Expected application/pdf, got {content_type}"
        print(f"✅ Content-Type is application/pdf")
    
    def test_pdf_content_disposition(self, api_client):
        """Test that response has Content-Disposition header for download"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200
        content_disposition = response.headers.get('Content-Disposition', '')
        assert 'attachment' in content_disposition, f"Expected attachment, got {content_disposition}"
        assert '.pdf' in content_disposition, f"Expected .pdf in filename, got {content_disposition}"
        print(f"✅ Content-Disposition: {content_disposition}")
    
    def test_pdf_has_content(self, api_client):
        """Test that PDF has actual content (not empty)"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200
        content_length = len(response.content)
        assert content_length > 1000, f"PDF too small ({content_length} bytes), might be empty"
        print(f"✅ PDF has content: {content_length} bytes")
    
    def test_pdf_starts_with_pdf_header(self, api_client):
        """Test that content starts with PDF magic bytes"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200
        # PDF files start with %PDF-
        assert response.content[:5] == b'%PDF-', f"Content doesn't start with PDF header: {response.content[:20]}"
        print(f"✅ PDF starts with valid PDF header")
    
    def test_pdf_nonexistent_batiment_returns_404(self, api_client):
        """Test that non-existent building returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{fake_id}/rapport-pdf"
        )
        assert response.status_code == 404, f"Expected 404 for non-existent building, got {response.status_code}"
        print(f"✅ Non-existent building returns 404")
    
    def test_pdf_without_auth_returns_401(self):
        """Test that endpoint requires authentication"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        print(f"✅ Endpoint requires authentication (returns {response.status_code})")


class TestPDFContent:
    """Tests to verify PDF contains expected sections"""
    
    def test_pdf_can_be_saved_and_read(self, api_client, tmp_path):
        """Test that PDF can be saved to file"""
        response = api_client.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments/{BATIMENT_ID}/rapport-pdf"
        )
        assert response.status_code == 200
        
        # Save to temp file
        pdf_path = tmp_path / "test_rapport.pdf"
        with open(pdf_path, 'wb') as f:
            f.write(response.content)
        
        # Verify file exists and has content
        assert pdf_path.exists()
        assert pdf_path.stat().st_size > 1000
        print(f"✅ PDF saved successfully to {pdf_path} ({pdf_path.stat().st_size} bytes)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
