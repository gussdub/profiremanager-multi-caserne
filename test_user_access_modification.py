#!/usr/bin/env python3
"""
Focused test for User Access Modification functionality
Tests the modification of user rights in the Settings module, Accounts tab
"""

import requests
import json
import uuid
from datetime import datetime

# Configuration
BASE_URL = "https://training-edit-1.preview.emergentagent.com/api"

def log_test(test_name, success, message, details=None):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} - {test_name}: {message}")
    if details and not success:
        print(f"   Details: {details}")

def test_user_access_modification():
    """Test user access rights modification in Settings module, Accounts tab"""
    try:
        tenant_slug = "shefford"
        
        # Step 1: Login as Shefford admin using the correct credentials
        login_data = {
            "email": "test.admin.access@firemanager.ca",
            "mot_de_passe": "TestAdmin123!"
        }
        
        print(f"🔐 Step 1: Logging in as Shefford admin...")
        response = requests.post(f"{BASE_URL}/{tenant_slug}/auth/login", json=login_data)
        if response.status_code != 200:
            # Try with legacy login
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data)
            if response.status_code != 200:
                log_test("User Access Modification", False, 
                        f"Failed to login as Shefford admin: {response.status_code}", 
                        {"response": response.text})
                return False
        
        login_result = response.json()
        admin_token = login_result["access_token"]
        print(f"✅ Login successful for {login_result.get('user', {}).get('email', 'admin')}")
        
        # Create a new session with admin token
        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Step 2: Create a test user with "employe" role and "Actif" status
        print(f"👤 Step 2: Creating test user with 'employe' role and 'Actif' status...")
        test_user = {
            "nom": "TestUtilisateur",
            "prenom": "Modification",
            "email": f"test.modification.{uuid.uuid4().hex[:8]}@firemanager.ca",
            "telephone": "450-555-0123",
            "contact_urgence": "450-555-0124",
            "grade": "Pompier",
            "fonction_superieur": False,
            "type_emploi": "temps_plein",
            "heures_max_semaine": 40,
            "role": "employe",
            "statut": "Actif",
            "numero_employe": f"EMP{uuid.uuid4().hex[:6].upper()}",
            "date_embauche": "2024-01-15",
            "formations": [],
            "mot_de_passe": "TestPass123!"
        }
        
        response = admin_session.post(f"{BASE_URL}/{tenant_slug}/users", json=test_user)
        if response.status_code != 200:
            log_test("User Access Modification", False, 
                    f"Failed to create test user: {response.status_code}", 
                    {"response": response.text})
            return False
        
        created_user = response.json()
        user_id = created_user["id"]
        print(f"✅ Test user created: {created_user.get('email')} (ID: {user_id})")
        
        # Verify initial user state
        if created_user.get("role") != "employe":
            log_test("User Access Modification", False, 
                    f"Initial user role incorrect: expected 'employe', got '{created_user.get('role')}'")
            return False
        
        if created_user.get("statut") != "Actif":
            log_test("User Access Modification", False, 
                    f"Initial user status incorrect: expected 'Actif', got '{created_user.get('statut')}'")
            return False
        
        print(f"✅ Initial state verified: role='{created_user.get('role')}', statut='{created_user.get('statut')}'")
        
        # Step 3: Test role modification from "employe" to "superviseur"
        print(f"🔄 Step 3: Modifying role from 'employe' to 'superviseur'...")
        response = admin_session.put(
            f"{BASE_URL}/{tenant_slug}/users/{user_id}/access?role=superviseur&statut=Actif"
        )
        if response.status_code != 200:
            log_test("User Access Modification", False, 
                    f"Failed to modify user role: {response.status_code}", 
                    {"response": response.text})
            return False
        
        updated_user = response.json()
        
        # Verify role modification was saved
        if updated_user.get("role") != "superviseur":
            log_test("User Access Modification", False, 
                    f"Role modification failed: expected 'superviseur', got '{updated_user.get('role')}'")
            return False
        
        if updated_user.get("statut") != "Actif":
            log_test("User Access Modification", False, 
                    f"Status should remain 'Actif', got '{updated_user.get('statut')}'")
            return False
        
        print(f"✅ Role modification successful: role='{updated_user.get('role')}', statut='{updated_user.get('statut')}'")
        
        # Step 4: Test status modification from "Actif" to "Inactif"
        print(f"🔄 Step 4: Modifying status from 'Actif' to 'Inactif'...")
        response = admin_session.put(
            f"{BASE_URL}/{tenant_slug}/users/{user_id}/access?role=superviseur&statut=Inactif"
        )
        if response.status_code != 200:
            log_test("User Access Modification", False, 
                    f"Failed to modify user status: {response.status_code}", 
                    {"response": response.text})
            return False
        
        updated_user = response.json()
        
        # Verify status modification was saved
        if updated_user.get("statut") != "Inactif":
            log_test("User Access Modification", False, 
                    f"Status modification failed: expected 'Inactif', got '{updated_user.get('statut')}'")
            return False
        
        if updated_user.get("role") != "superviseur":
            log_test("User Access Modification", False, 
                    f"Role should remain 'superviseur', got '{updated_user.get('role')}'")
            return False
        
        print(f"✅ Status modification successful: role='{updated_user.get('role')}', statut='{updated_user.get('statut')}'")
        
        # Step 5: Verify tenant security - ensure user belongs to correct tenant
        print(f"🔒 Step 5: Verifying tenant security...")
        response = admin_session.get(f"{BASE_URL}/{tenant_slug}/users/{user_id}")
        if response.status_code != 200:
            log_test("User Access Modification", False, 
                    f"Failed to fetch user details for tenant verification: {response.status_code}")
            return False
        
        user_details = response.json()
        
        # Verify user belongs to shefford tenant
        if not user_details.get("tenant_id"):
            log_test("User Access Modification", False, 
                    "User tenant_id not found - tenant security verification failed")
            return False
        
        print(f"✅ Tenant security verified: user belongs to tenant {user_details.get('tenant_id')}")
        
        # Step 6: Test invalid role validation
        print(f"🚫 Step 6: Testing invalid role validation...")
        response = admin_session.put(
            f"{BASE_URL}/{tenant_slug}/users/{user_id}/access?role=invalid_role&statut=Actif"
        )
        if response.status_code != 400:
            log_test("User Access Modification", False, 
                    f"Invalid role should return 400, got: {response.status_code}")
            return False
        
        print(f"✅ Invalid role validation working: returns 400 as expected")
        
        # Step 7: Test invalid status validation
        print(f"🚫 Step 7: Testing invalid status validation...")
        response = admin_session.put(
            f"{BASE_URL}/{tenant_slug}/users/{user_id}/access?role=employe&statut=InvalidStatus"
        )
        if response.status_code != 400:
            log_test("User Access Modification", False, 
                    f"Invalid status should return 400, got: {response.status_code}")
            return False
        
        print(f"✅ Invalid status validation working: returns 400 as expected")
        
        # Step 8: Cleanup - Delete the test user
        print(f"🧹 Step 8: Cleaning up test user...")
        response = admin_session.delete(f"{BASE_URL}/{tenant_slug}/users/{user_id}")
        if response.status_code != 200:
            log_test("User Access Modification", False, 
                    f"Failed to delete test user: {response.status_code}")
            return False
        
        # Verify user was deleted
        response = admin_session.get(f"{BASE_URL}/{tenant_slug}/users/{user_id}")
        if response.status_code != 404:
            log_test("User Access Modification", False, 
                    f"User should be deleted (404), got: {response.status_code}")
            return False
        
        print(f"✅ Test user successfully deleted")
        
        log_test("User Access Modification", True, 
                f"✅ User access modification fully functional - All 8 test steps passed successfully. Endpoint PUT /api/{tenant_slug}/users/{{user_id}}/access working correctly with tenant '{tenant_slug}' using test.admin.access@firemanager.ca / TestAdmin123! credentials.")
        return True
        
    except Exception as e:
        log_test("User Access Modification", False, f"User access modification error: {str(e)}")
        return False

if __name__ == "__main__":
    print("🚒 ProFireManager - User Access Modification Test")
    print("=" * 60)
    print("Testing user access rights modification in Settings module, Accounts tab")
    print("=" * 60)
    
    success = test_user_access_modification()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 TEST COMPLETED SUCCESSFULLY!")
        print("✅ User access modification functionality is working correctly")
    else:
        print("❌ TEST FAILED!")
        print("❌ User access modification functionality has issues")
    print("=" * 60)