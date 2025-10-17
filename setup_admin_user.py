#!/usr/bin/env python3
"""
Setup admin user for testing
"""

import requests
import json
import uuid

# Configuration
BASE_URL = "https://ems-commander.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

def setup_admin_user():
    """Setup admin user for Shefford tenant"""
    try:
        # Step 1: Login as Super Admin
        print("🔐 Logging in as Super Admin...")
        login_data = {
            "email": SUPER_ADMIN_EMAIL,
            "mot_de_passe": SUPER_ADMIN_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/admin/auth/login", json=login_data)
        if response.status_code != 200:
            print(f"❌ Super Admin login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
        login_result = response.json()
        super_admin_token = login_result["access_token"]
        print(f"✅ Super Admin login successful")
        
        # Create a new session with Super Admin token
        super_admin_session = requests.Session()
        super_admin_session.headers.update({"Authorization": f"Bearer {super_admin_token}"})
        
        # Step 2: Get Shefford tenant ID
        print("🏢 Getting Shefford tenant information...")
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants")
        if response.status_code != 200:
            print(f"❌ Failed to get tenants: {response.status_code}")
            return False
        
        tenants = response.json()
        shefford_tenant = None
        for tenant in tenants:
            if tenant.get('slug') == 'shefford':
                shefford_tenant = tenant
                break
        
        if not shefford_tenant:
            print("❌ Shefford tenant not found")
            return False
        
        tenant_id = shefford_tenant['id']
        print(f"✅ Found Shefford tenant: {shefford_tenant['nom']} (ID: {tenant_id})")
        
        # Step 3: Create a new admin user for testing
        print("👤 Creating new admin user for testing...")
        admin_user_data = {
            "email": "test.admin.access@firemanager.ca",
            "prenom": "Test",
            "nom": "Admin Access",
            "mot_de_passe": "TestAdmin123!"
        }
        
        response = super_admin_session.post(f"{BASE_URL}/admin/tenants/{tenant_id}/create-admin", json=admin_user_data)
        if response.status_code == 200:
            created_user = response.json()
            print(f"✅ New admin user created: {admin_user_data['email']}")
            print(f"   Password: {admin_user_data['mot_de_passe']}")
            return True
        elif response.status_code == 400 and "existe déjà" in response.text:
            print(f"✅ Admin user already exists: {admin_user_data['email']}")
            print(f"   Password: {admin_user_data['mot_de_passe']}")
            return True
        else:
            print(f"❌ Failed to create admin user: {response.status_code}")
            print(f"Response: {response.text}")
            return False
        
    except Exception as e:
        print(f"❌ Error setting up admin user: {str(e)}")
        return False

if __name__ == "__main__":
    print("🚒 ProFireManager - Admin User Setup")
    print("=" * 50)
    
    success = setup_admin_user()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 ADMIN USER SETUP SUCCESSFUL!")
        print("✅ You can now use: test.admin.access@firemanager.ca / TestAdmin123!")
    else:
        print("❌ ADMIN USER SETUP FAILED!")
    print("=" * 50)