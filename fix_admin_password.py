#!/usr/bin/env python3
"""
Fix admin password to meet complexity requirements
"""

import requests
import json

# Configuration
BASE_URL = "https://demo-dashboard-1.preview.emergentagent.com/api"

def main():
    # Login with the test admin we just created
    test_login_data = {
        "email": "test.admin.reset@firemanager.ca",
        "mot_de_passe": "TestAdmin123!"
    }
    
    response = requests.post(f"{BASE_URL}/shefford/auth/login", json=test_login_data)
    if response.status_code != 200:
        response = requests.post(f"{BASE_URL}/auth/login", json=test_login_data)
    
    if response.status_code != 200:
        print(f"❌ Test admin login failed: {response.status_code}")
        return
    
    login_result = response.json()
    admin_token = login_result["access_token"]
    
    # Create admin session
    admin_session = requests.Session()
    admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
    
    print("✅ Test admin authenticated")
    
    # Get users to find admin@firemanager.ca
    response = admin_session.get(f"{BASE_URL}/shefford/users")
    if response.status_code != 200:
        print(f"❌ Failed to get users: {response.status_code}")
        return
    
    users = response.json()
    admin_user = None
    for user in users:
        if user.get('email') == 'admin@firemanager.ca':
            admin_user = user
            break
    
    if not admin_user:
        print("❌ admin@firemanager.ca not found")
        return
    
    print(f"✅ Found admin@firemanager.ca: {admin_user['id']}")
    
    # Reset password with proper complexity
    reset_data = {
        "mot_de_passe": "Admin123!",  # Meets all requirements: 8+ chars, uppercase, digit, special
        "ancien_mot_de_passe": ""
    }
    
    response = admin_session.put(f"{BASE_URL}/shefford/users/{admin_user['id']}/password", json=reset_data)
    if response.status_code == 200:
        print("✅ Password reset successful for admin@firemanager.ca")
        reset_result = response.json()
        print(f"Reset result: {reset_result}")
        
        # Test login with new password
        new_login_data = {
            "email": "admin@firemanager.ca",
            "mot_de_passe": "Admin123!"
        }
        
        response = requests.post(f"{BASE_URL}/shefford/auth/login", json=new_login_data)
        if response.status_code != 200:
            response = requests.post(f"{BASE_URL}/auth/login", json=new_login_data)
        
        if response.status_code == 200:
            print("✅ Login test successful with new password!")
        else:
            print(f"❌ Login test failed: {response.status_code}")
    else:
        print(f"❌ Password reset failed: {response.status_code} - {response.text}")

if __name__ == "__main__":
    main()