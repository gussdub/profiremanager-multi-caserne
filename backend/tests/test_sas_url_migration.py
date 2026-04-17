"""
Test SAS URL Migration - Verify No Base64 Data in API Responses
================================================================
Tests to verify that all API endpoints return Azure SAS URLs instead of base64 data.

Features tested:
1. POST /api/demo/auth/login - photo_profil should be SAS URL (not base64)
2. GET /api/demo/auth/me - photo_profil should be SAS URL (not base64)
3. GET /api/demo/users - photo_profil should be SAS URL for all users (not base64)
4. GET /api/demo/personnalisation - logo_url should be SAS URL (not base64)
5. GET /api/demo/public/branding - logo_url should be SAS URL (not base64)
6. GET /api/demo/prevention/batiments - photo_url should be SAS URL for batiments with photos
7. Verify NO base64 data (data:image) in any response
"""

import pytest
import requests
import os
import re

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://workflow-test-3.preview.emergentagent.com').rstrip('/')
TENANT_SLUG = "demo"

# Test credentials
ADMIN_EMAIL = "gussdub@gmail.com"
ADMIN_PASSWORD = "230685Juin+"

# Azure URL pattern
AZURE_URL_PATTERN = r"https://profiremanagerdata\.blob\.core\.windows\.net/fichiers-clients/"
BASE64_PATTERN = r"data:image/[^;]+;base64,"


def is_azure_sas_url(url: str) -> bool:
    """Check if URL is a valid Azure SAS URL"""
    if not url:
        return False
    return (
        "profiremanagerdata.blob.core.windows.net" in url and
        "fichiers-clients" in url and
        "sig=" in url and
        "sv=" in url
    )


def is_base64_data(data: str) -> bool:
    """Check if data is base64 encoded image"""
    if not data:
        return False
    return data.startswith("data:image/")


class TestLoginSASUrl:
    """Test login endpoint returns SAS URL for photo_profil"""
    
    def test_01_login_returns_sas_url_for_photo_profil(self):
        """
        Test: POST /api/demo/auth/login
        Expected: photo_profil should be Azure SAS URL (not base64)
        """
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        
        print(f"Login response status: {response.status_code}")
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        
        # Verify access_token is present
        assert "access_token" in data, "Response should contain 'access_token'"
        
        # Check user object
        user = data.get("user", {})
        photo_profil = user.get("photo_profil")
        
        print(f"User photo_profil: {photo_profil[:100] if photo_profil else 'None'}...")
        
        # If photo_profil exists, verify it's NOT base64
        if photo_profil:
            assert not is_base64_data(photo_profil), \
                f"photo_profil should NOT be base64, got: {photo_profil[:50]}..."
            
            # If it's an Azure URL, verify SAS parameters
            if "profiremanagerdata.blob.core.windows.net" in photo_profil:
                assert is_azure_sas_url(photo_profil), \
                    f"photo_profil should be valid Azure SAS URL, got: {photo_profil[:100]}..."
                print(f"✓ photo_profil is Azure SAS URL")
            else:
                print(f"⚠ photo_profil is not Azure URL (may be empty or legacy): {photo_profil[:50] if photo_profil else 'None'}")
        else:
            print("⚠ photo_profil is None/empty (user may not have a profile photo)")
        
        # Store token for subsequent tests
        self.__class__.auth_token = data["access_token"]
        print(f"✓ Login successful, token obtained")


class TestAuthMeSASUrl:
    """Test /auth/me endpoint returns SAS URL for photo_profil"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_02_auth_me_returns_sas_url_for_photo_profil(self, auth_token):
        """
        Test: GET /api/demo/auth/me
        Expected: photo_profil should be Azure SAS URL (not base64)
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        print(f"Auth/me response status: {response.status_code}")
        
        assert response.status_code == 200, f"Auth/me failed: {response.text}"
        
        data = response.json()
        photo_profil = data.get("photo_profil")
        
        print(f"Auth/me photo_profil: {photo_profil[:100] if photo_profil else 'None'}...")
        
        # If photo_profil exists, verify it's NOT base64
        if photo_profil:
            assert not is_base64_data(photo_profil), \
                f"photo_profil should NOT be base64, got: {photo_profil[:50]}..."
            
            if "profiremanagerdata.blob.core.windows.net" in photo_profil:
                assert is_azure_sas_url(photo_profil), \
                    f"photo_profil should be valid Azure SAS URL"
                print(f"✓ /auth/me photo_profil is Azure SAS URL")
            else:
                print(f"⚠ photo_profil is not Azure URL: {photo_profil[:50] if photo_profil else 'None'}")
        else:
            print("⚠ photo_profil is None/empty")


class TestUserListSASUrl:
    """Test users list endpoint returns SAS URLs for photo_profil"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_03_users_list_returns_sas_urls_for_photo_profil(self, auth_token):
        """
        Test: GET /api/demo/users
        Expected: All users with photo_profil should have Azure SAS URL (not base64)
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        print(f"Users list response status: {response.status_code}")
        
        assert response.status_code == 200, f"Users list failed: {response.text}"
        
        users = response.json()
        assert isinstance(users, list), f"Response should be a list, got: {type(users)}"
        
        print(f"Total users: {len(users)}")
        
        users_with_photos = 0
        users_with_azure_photos = 0
        users_with_base64_photos = 0
        
        for user in users:
            photo_profil = user.get("photo_profil")
            
            if photo_profil:
                users_with_photos += 1
                
                # Check for base64 (should NOT exist)
                if is_base64_data(photo_profil):
                    users_with_base64_photos += 1
                    print(f"❌ User {user.get('email')} has BASE64 photo_profil!")
                
                # Check for Azure SAS URL
                elif is_azure_sas_url(photo_profil):
                    users_with_azure_photos += 1
        
        print(f"Users with photos: {users_with_photos}")
        print(f"Users with Azure SAS URLs: {users_with_azure_photos}")
        print(f"Users with base64 photos: {users_with_base64_photos}")
        
        # CRITICAL: No base64 photos should exist
        assert users_with_base64_photos == 0, \
            f"Found {users_with_base64_photos} users with base64 photo_profil - migration incomplete!"
        
        print(f"✓ No base64 photo_profil found in users list")


class TestPersonnalisationSASUrl:
    """Test personnalisation endpoint returns SAS URL for logo_url"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_04_personnalisation_returns_sas_url_for_logo(self, auth_token):
        """
        Test: GET /api/demo/personnalisation
        Expected: logo_url should be Azure SAS URL (not base64)
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/personnalisation",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        print(f"Personnalisation response status: {response.status_code}")
        
        assert response.status_code == 200, f"Personnalisation failed: {response.text}"
        
        data = response.json()
        logo_url = data.get("logo_url")
        
        print(f"Personnalisation logo_url: {logo_url[:100] if logo_url else 'None'}...")
        
        # If logo_url exists, verify it's NOT base64
        if logo_url:
            assert not is_base64_data(logo_url), \
                f"logo_url should NOT be base64, got: {logo_url[:50]}..."
            
            if "profiremanagerdata.blob.core.windows.net" in logo_url:
                assert is_azure_sas_url(logo_url), \
                    f"logo_url should be valid Azure SAS URL"
                print(f"✓ personnalisation logo_url is Azure SAS URL")
            else:
                print(f"⚠ logo_url is not Azure URL: {logo_url[:50] if logo_url else 'None'}")
        else:
            print("⚠ logo_url is None/empty (tenant may not have a logo)")


class TestPublicBrandingSASUrl:
    """Test public branding endpoint returns SAS URL for logo_url"""
    
    def test_05_public_branding_returns_sas_url_for_logo(self):
        """
        Test: GET /api/demo/public/branding
        Expected: logo_url should be Azure SAS URL (not base64)
        Note: This endpoint does NOT require authentication
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/public/branding"
        )
        
        print(f"Public branding response status: {response.status_code}")
        
        assert response.status_code == 200, f"Public branding failed: {response.text}"
        
        data = response.json()
        logo_url = data.get("logo_url")
        
        print(f"Public branding logo_url: {logo_url[:100] if logo_url else 'None'}...")
        
        # If logo_url exists, verify it's NOT base64
        if logo_url:
            assert not is_base64_data(logo_url), \
                f"logo_url should NOT be base64, got: {logo_url[:50]}..."
            
            if "profiremanagerdata.blob.core.windows.net" in logo_url:
                assert is_azure_sas_url(logo_url), \
                    f"logo_url should be valid Azure SAS URL"
                print(f"✓ public/branding logo_url is Azure SAS URL")
            else:
                print(f"⚠ logo_url is not Azure URL: {logo_url[:50] if logo_url else 'None'}")
        else:
            print("⚠ logo_url is None/empty")


class TestPreventionBatimentsSASUrl:
    """Test prevention batiments endpoint returns SAS URLs for photos"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_06_batiments_returns_sas_urls_for_photos(self, auth_token):
        """
        Test: GET /api/demo/prevention/batiments
        Expected: photo_url should be Azure SAS URL for batiments with photos (not base64)
        """
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        print(f"Batiments response status: {response.status_code}")
        
        assert response.status_code == 200, f"Batiments failed: {response.text}"
        
        batiments = response.json()
        assert isinstance(batiments, list), f"Response should be a list, got: {type(batiments)}"
        
        print(f"Total batiments: {len(batiments)}")
        
        batiments_with_photos = 0
        batiments_with_azure_photos = 0
        batiments_with_base64_photos = 0
        
        for bat in batiments:
            photo_url = bat.get("photo_url")
            
            if photo_url:
                batiments_with_photos += 1
                
                # Check for base64 (should NOT exist)
                if is_base64_data(photo_url):
                    batiments_with_base64_photos += 1
                    print(f"❌ Batiment {bat.get('nom_etablissement')} has BASE64 photo_url!")
                
                # Check for Azure SAS URL
                elif is_azure_sas_url(photo_url):
                    batiments_with_azure_photos += 1
            
            # Also check gallery photos
            for photo in bat.get("photos", []):
                url = photo.get("url")
                if url and is_base64_data(url):
                    print(f"❌ Batiment {bat.get('nom_etablissement')} has BASE64 gallery photo!")
                    batiments_with_base64_photos += 1
        
        print(f"Batiments with photos: {batiments_with_photos}")
        print(f"Batiments with Azure SAS URLs: {batiments_with_azure_photos}")
        print(f"Batiments with base64 photos: {batiments_with_base64_photos}")
        
        # CRITICAL: No base64 photos should exist
        assert batiments_with_base64_photos == 0, \
            f"Found {batiments_with_base64_photos} batiments with base64 photos - migration incomplete!"
        
        print(f"✓ No base64 photo_url found in batiments list")


class TestNoBase64InResponses:
    """Comprehensive test to verify NO base64 data in any API response"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json().get("access_token")
    
    def test_07_no_base64_in_login_response(self):
        """Verify login response contains no base64 data"""
        response = requests.post(
            f"{BASE_URL}/api/{TENANT_SLUG}/auth/login",
            json={"email": ADMIN_EMAIL, "mot_de_passe": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200
        
        # Check entire response text for base64 pattern
        response_text = response.text
        base64_matches = re.findall(BASE64_PATTERN, response_text)
        
        assert len(base64_matches) == 0, \
            f"Found {len(base64_matches)} base64 data patterns in login response!"
        
        print(f"✓ No base64 data in login response")
    
    def test_08_no_base64_in_users_response(self, auth_token):
        """Verify users list response contains no base64 data"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/users",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        
        # Check entire response text for base64 pattern
        response_text = response.text
        base64_matches = re.findall(BASE64_PATTERN, response_text)
        
        assert len(base64_matches) == 0, \
            f"Found {len(base64_matches)} base64 data patterns in users response!"
        
        print(f"✓ No base64 data in users response")
    
    def test_09_no_base64_in_personnalisation_response(self, auth_token):
        """Verify personnalisation response contains no base64 data"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/personnalisation",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        
        # Check entire response text for base64 pattern
        response_text = response.text
        base64_matches = re.findall(BASE64_PATTERN, response_text)
        
        assert len(base64_matches) == 0, \
            f"Found {len(base64_matches)} base64 data patterns in personnalisation response!"
        
        print(f"✓ No base64 data in personnalisation response")
    
    def test_10_no_base64_in_public_branding_response(self):
        """Verify public branding response contains no base64 data"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/public/branding"
        )
        
        assert response.status_code == 200
        
        # Check entire response text for base64 pattern
        response_text = response.text
        base64_matches = re.findall(BASE64_PATTERN, response_text)
        
        assert len(base64_matches) == 0, \
            f"Found {len(base64_matches)} base64 data patterns in public branding response!"
        
        print(f"✓ No base64 data in public branding response")
    
    def test_11_no_base64_in_batiments_response(self, auth_token):
        """Verify batiments response contains no base64 data"""
        response = requests.get(
            f"{BASE_URL}/api/{TENANT_SLUG}/prevention/batiments",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        assert response.status_code == 200
        
        # Check entire response text for base64 pattern
        response_text = response.text
        base64_matches = re.findall(BASE64_PATTERN, response_text)
        
        assert len(base64_matches) == 0, \
            f"Found {len(base64_matches)} base64 data patterns in batiments response!"
        
        print(f"✓ No base64 data in batiments response")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
