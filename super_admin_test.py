#!/usr/bin/env python3
"""
Super Admin Dashboard API Test - Focused test for review request
"""

import requests
import json
import sys

# Configuration
BASE_URL = "https://training-edit-1.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "admin@profiremanager.ca"
SUPER_ADMIN_PASSWORD = "Admin123!"
FALLBACK_SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
FALLBACK_SUPER_ADMIN_PASSWORD = "230685Juin+"

def test_super_admin_tenants():
    """Test Super Admin tenants API with detailed field checking"""
    session = requests.Session()
    
    print("🎯 Super Admin Dashboard API Test")
    print("=" * 50)
    
    # Step 1: Try to authenticate with expected credentials
    print(f"1. Attempting Super Admin login with: {SUPER_ADMIN_EMAIL}")
    
    login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    response = session.post(f"{BASE_URL}/admin/auth/login", json=login_data)
    
    if response.status_code != 200:
        print(f"   ❌ Expected credentials failed (status: {response.status_code})")
        print(f"   🔄 Trying fallback credentials: {FALLBACK_SUPER_ADMIN_EMAIL}")
        
        fallback_login_data = {
            "email": FALLBACK_SUPER_ADMIN_EMAIL,
            "mot_de_passe": FALLBACK_SUPER_ADMIN_PASSWORD
        }
        
        response = session.post(f"{BASE_URL}/admin/auth/login", json=fallback_login_data)
        
        if response.status_code != 200:
            print(f"   ❌ Fallback credentials also failed (status: {response.status_code})")
            print(f"   Response: {response.text}")
            return False
        else:
            print(f"   ✅ Fallback credentials successful!")
    else:
        print(f"   ✅ Expected credentials successful!")
    
    # Extract token
    auth_data = response.json()
    token = auth_data.get("access_token")
    admin_info = auth_data.get("admin", {})
    
    print(f"   📋 Logged in as: {admin_info.get('email')} ({admin_info.get('nom')})")
    
    # Step 2: Test GET /api/admin/tenants
    print("\n2. Testing GET /api/admin/tenants endpoint")
    
    session.headers.update({"Authorization": f"Bearer {token}"})
    response = session.get(f"{BASE_URL}/admin/tenants")
    
    if response.status_code != 200:
        print(f"   ❌ Tenants API failed (status: {response.status_code})")
        print(f"   Response: {response.text}")
        return False
    
    tenants = response.json()
    print(f"   ✅ Tenants API successful - Found {len(tenants)} tenant(s)")
    
    if not tenants:
        print("   ⚠️  No tenants found in response")
        return False
    
    # Step 3: Analyze tenant data structure
    print("\n3. Analyzing tenant data structure")
    
    first_tenant = tenants[0]
    print(f"   📊 First tenant data:")
    print(f"   {json.dumps(first_tenant, indent=6, default=str)}")
    
    # Step 4: Check required fields from review request
    print("\n4. Checking required fields from review request")
    
    expected_fields = {
        'created_at': 'string',
        'is_active': 'boolean', 
        'nombre_employes': 'number',
        'contact_email': 'string',
        'contact_telephone': 'string',
        'nom': 'string',
        'slug': 'string'
    }
    
    # Map backend field names to expected field names
    field_mapping = {
        'date_creation': 'created_at',
        'actif': 'is_active',
        'email_contact': 'contact_email',
        'telephone': 'contact_telephone'
    }
    
    results = {}
    issues = []
    
    for expected_field, expected_type in expected_fields.items():
        # Check if field exists directly or via mapping
        actual_field = expected_field
        if expected_field not in first_tenant:
            # Try mapped field name
            for backend_field, frontend_field in field_mapping.items():
                if frontend_field == expected_field and backend_field in first_tenant:
                    actual_field = backend_field
                    break
        
        if actual_field in first_tenant:
            value = first_tenant[actual_field]
            actual_type = type(value).__name__
            
            # Type validation
            type_ok = False
            if expected_type == 'string' and isinstance(value, str):
                type_ok = True
            elif expected_type == 'boolean' and isinstance(value, bool):
                type_ok = True
            elif expected_type == 'number' and isinstance(value, (int, float)):
                type_ok = True
            
            results[expected_field] = {
                'found': True,
                'backend_field': actual_field,
                'value': value,
                'expected_type': expected_type,
                'actual_type': actual_type,
                'type_ok': type_ok
            }
            
            status = "✅" if type_ok else "⚠️"
            print(f"   {status} {expected_field}: {value} ({actual_type}) - Backend field: '{actual_field}'")
            
            if not type_ok:
                issues.append(f"{expected_field} should be {expected_type}, got {actual_type}")
        else:
            results[expected_field] = {
                'found': False,
                'backend_field': None,
                'value': None,
                'expected_type': expected_type,
                'actual_type': None,
                'type_ok': False
            }
            print(f"   ❌ {expected_field}: NOT FOUND")
            issues.append(f"{expected_field} field is missing")
    
    # Step 5: Final assessment
    print("\n5. Final Assessment")
    
    all_fields_found = all(result['found'] for result in results.values())
    all_types_correct = all(result['type_ok'] for result in results.values() if result['found'])
    
    if all_fields_found and all_types_correct:
        print("   ✅ SUCCESS: All required fields found with correct types!")
        print("   🎉 Super Admin tenants API is working correctly")
        return True
    else:
        print("   ❌ ISSUES FOUND:")
        for issue in issues:
            print(f"      - {issue}")
        
        if all_fields_found:
            print("   ℹ️  All fields are present but some have incorrect types")
        else:
            print("   ℹ️  Some required fields are missing")
        
        return False

if __name__ == "__main__":
    success = test_super_admin_tenants()
    print(f"\n{'='*50}")
    print(f"🏁 Test Result: {'PASS' if success else 'FAIL'}")
    sys.exit(0 if success else 1)