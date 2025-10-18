#!/usr/bin/env python3
"""
Check existing users and reset admin password if needed
"""

import requests
import json

# Configuration
BASE_URL = "https://epi-profile.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

def main():
    # Login as Super Admin
    super_admin_login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/admin/auth/login", json=super_admin_login_data)
    if response.status_code != 200:
        print(f"❌ Super Admin login failed: {response.status_code}")
        return
    
    super_admin_result = response.json()
    super_admin_token = super_admin_result["access_token"]
    
    # Create Super Admin session
    super_admin_session = requests.Session()
    super_admin_session.headers.update({"Authorization": f"Bearer {super_admin_token}"})
    
    print("✅ Super Admin authenticated")
    
    # Get Shefford tenant
    response = super_admin_session.get(f"{BASE_URL}/admin/tenants")
    tenants = response.json()
    shefford_tenant = None
    for tenant in tenants:
        if tenant.get('slug') == 'shefford':
            shefford_tenant = tenant
            break
    
    if not shefford_tenant:
        print("❌ Shefford tenant not found")
        return
    
    tenant_id = shefford_tenant['id']
    print(f"✅ Found Shefford tenant: {tenant_id}")
    
    # Try to delete existing admin user first
    print("🗑️ Attempting to delete existing admin user...")
    
    # We need to find the admin user ID first
    # Let's try to create a new admin user with a different email first
    admin_user_data = {
        "email": "test.admin.reset@firemanager.ca",
        "prenom": "TestAdmin",
        "nom": "Reset",
        "mot_de_passe": "TestAdmin123!"
    }
    
    response = super_admin_session.post(f"{BASE_URL}/admin/tenants/{tenant_id}/create-admin", json=admin_user_data)
    if response.status_code == 200:
        print("✅ Created new test admin user")
        created_admin = response.json()
        print(f"Admin user: {created_admin}")
        
        # Now try to login with this user
        test_login_data = {
            "email": "test.admin.reset@firemanager.ca",
            "mot_de_passe": "TestAdmin123!"
        }
        
        response = requests.post(f"{BASE_URL}/shefford/auth/login", json=test_login_data)
        if response.status_code != 200:
            response = requests.post(f"{BASE_URL}/auth/login", json=test_login_data)
        
        if response.status_code == 200:
            print("✅ Test admin login successful!")
            login_result = response.json()
            admin_token = login_result["access_token"]
            
            # Create admin session
            admin_session = requests.Session()
            admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
            
            # List users to see what exists
            response = admin_session.get(f"{BASE_URL}/shefford/users")
            if response.status_code == 200:
                users = response.json()
                print(f"\n📋 Found {len(users)} users in Shefford tenant:")
                for user in users:
                    print(f"  - {user.get('email')} ({user.get('role')}) - {user.get('nom')} {user.get('prenom')}")
                    
                    # If this is the old admin user, let's try to reset their password
                    if user.get('email') == 'admin@firemanager.ca':
                        print(f"\n🔄 Attempting to reset password for admin@firemanager.ca...")
                        reset_data = {
                            "mot_de_passe": "admin123",
                            "ancien_mot_de_passe": ""
                        }
                        
                        response = admin_session.put(f"{BASE_URL}/shefford/users/{user['id']}/password", json=reset_data)
                        if response.status_code == 200:
                            print("✅ Password reset successful for admin@firemanager.ca")
                            reset_result = response.json()
                            print(f"Reset result: {reset_result}")
                        else:
                            print(f"❌ Password reset failed: {response.status_code} - {response.text}")
            else:
                print(f"❌ Failed to list users: {response.status_code}")
        else:
            print(f"❌ Test admin login failed: {response.status_code} - {response.text}")
    else:
        print(f"❌ Failed to create test admin: {response.status_code} - {response.text}")

if __name__ == "__main__":
    main()