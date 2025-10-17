#!/usr/bin/env python3
"""
Debug script to check Super Admin JWT token
"""

import requests
import jwt
import json

# Configuration
BASE_URL = "https://training-edit-1.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"
SECRET_KEY = "your-secret-key-here"  # Default from server.py

def test_super_admin_token():
    """Test Super Admin token generation and validation"""
    
    # Step 1: Login and get token
    login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/admin/auth/login", json=login_data)
    print(f"Login response status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return
    
    login_result = response.json()
    token = login_result.get("access_token")
    
    if not token:
        print("No access token in response")
        return
    
    print(f"Token received: {token[:50]}...")
    
    # Step 2: Decode token to check payload
    try:
        # Try to decode without verification first to see the payload
        payload = jwt.decode(token, options={"verify_signature": False})
        print(f"Token payload: {json.dumps(payload, indent=2)}")
        
        # Check if role is set correctly
        if payload.get("role") == "super_admin":
            print("✅ Token has correct role: super_admin")
        else:
            print(f"❌ Token has wrong role: {payload.get('role')}")
        
        # Check admin ID
        admin_id = payload.get("sub")
        print(f"Admin ID in token: {admin_id}")
        
    except Exception as e:
        print(f"Error decoding token: {str(e)}")
    
    # Step 3: Test the /admin/auth/me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/admin/auth/me", headers=headers)
    
    print(f"\n/admin/auth/me response status: {response.status_code}")
    print(f"/admin/auth/me response: {response.text}")

if __name__ == "__main__":
    test_super_admin_token()