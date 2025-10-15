#!/usr/bin/env python3
"""
Super Admin Helper - Use Super Admin to create/manage Shefford tenant admin
"""

import requests
import json
import uuid

BASE_URL = "https://disponible-pro.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

def get_super_admin_token():
    """Get Super Admin authentication token"""
    login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/admin/auth/login", json=login_data)
    if response.status_code == 200:
        return response.json()["access_token"]
    else:
        print(f"Super Admin login failed: {response.status_code}")
        print(response.text)
        return None

def get_shefford_tenant_info(token):
    """Get Shefford tenant information"""
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(f"{BASE_URL}/admin/tenants", headers=headers)
    if response.status_code == 200:
        tenants = response.json()
        for tenant in tenants:
            if tenant.get('slug') == 'shefford':
                return tenant
    return None

def create_shefford_admin(token, tenant_id):
    """Create a new admin user for Shefford tenant"""
    headers = {"Authorization": f"Bearer {token}"}
    
    admin_data = {
        "email": "test.planning@shefford.ca",
        "prenom": "Planning",
        "nom": "Tester",
        "mot_de_passe": "PlanningTest123!"
    }
    
    response = requests.post(f"{BASE_URL}/admin/tenants/{tenant_id}/create-admin", 
                           json=admin_data, headers=headers)
    
    if response.status_code == 200:
        print("✅ New admin user created successfully")
        return admin_data
    elif response.status_code == 400:
        print("⚠️ Admin user might already exist")
        return admin_data  # Try to use existing credentials
    else:
        print(f"❌ Failed to create admin: {response.status_code}")
        print(response.text)
        return None

def test_shefford_login(email, password):
    """Test login with Shefford credentials"""
    login_data = {
        "email": email,
        "mot_de_passe": password
    }
    
    # Try tenant-specific login
    response = requests.post(f"{BASE_URL}/shefford/auth/login", json=login_data)
    if response.status_code == 200:
        print(f"✅ Shefford login successful: {email}")
        return response.json()["access_token"]
    
    # Try legacy login
    response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
    if response.status_code == 200:
        print(f"✅ Legacy login successful: {email}")
        return response.json()["access_token"]
    
    print(f"❌ Login failed for {email}: {response.status_code}")
    return None

def main():
    print("🔧 Super Admin Helper - Setting up Shefford tenant access")
    print("=" * 60)
    
    # Step 1: Get Super Admin token
    print("1. Authenticating as Super Admin...")
    token = get_super_admin_token()
    if not token:
        print("❌ Cannot proceed without Super Admin access")
        return
    
    print("✅ Super Admin authenticated")
    
    # Step 2: Get Shefford tenant info
    print("\n2. Getting Shefford tenant information...")
    tenant = get_shefford_tenant_info(token)
    if not tenant:
        print("❌ Shefford tenant not found")
        return
    
    print(f"✅ Found Shefford tenant: {tenant['nom']} (ID: {tenant['id']})")
    
    # Step 3: Try to create new admin
    print("\n3. Creating new admin user for testing...")
    admin_data = create_shefford_admin(token, tenant['id'])
    if not admin_data:
        print("❌ Cannot create admin user")
        return
    
    # Step 4: Test login with new credentials
    print("\n4. Testing login with new credentials...")
    test_token = test_shefford_login(admin_data['email'], admin_data['mot_de_passe'])
    
    if test_token:
        print(f"\n🎉 SUCCESS! Use these credentials for Planning Module testing:")
        print(f"   Email: {admin_data['email']}")
        print(f"   Password: {admin_data['mot_de_passe']}")
        print(f"   Token: {test_token[:50]}...")
    else:
        print("\n❌ Could not establish working credentials")

if __name__ == "__main__":
    main()