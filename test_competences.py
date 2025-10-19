#!/usr/bin/env python3
"""
Specific test for Compétences CRUD operations as requested in review
Tests the competences endpoints for Shefford tenant with admin@firemanager.ca / admin123
"""

import requests
import json
import sys
from datetime import datetime
import uuid

# Configuration
BASE_URL = "https://emergency-portal.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"
TENANT_SLUG = "shefford"
ADMIN_EMAIL = "admin@firemanager.ca"
ADMIN_PASSWORD = "admin123"

def log_test(test_name, success, message, details=None):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} - {test_name}: {message}")
    if details and not success:
        print(f"   Details: {details}")

def test_competences_crud():
    """Test Compétences CRUD operations as requested in review"""
    print("🎯 Testing Compétences CRUD Operations")
    print("=" * 50)
    
    try:
        # Step 1: Login as Super Admin to ensure Shefford admin exists
        print("Step 1: Super Admin authentication...")
        super_admin_login = {
            "email": SUPER_ADMIN_EMAIL,
            "mot_de_passe": SUPER_ADMIN_PASSWORD
        }
        
        response = requests.post(f"{BASE_URL}/admin/auth/login", json=super_admin_login)
        if response.status_code != 200:
            log_test("Super Admin Login", False, f"Failed: {response.status_code}", {"response": response.text})
            return False
        
        super_admin_data = response.json()
        super_admin_token = super_admin_data["access_token"]
        log_test("Super Admin Login", True, "Super Admin authenticated successfully")
        
        # Step 2: Get Shefford tenant info
        print("\nStep 2: Getting Shefford tenant info...")
        super_admin_session = requests.Session()
        super_admin_session.headers.update({"Authorization": f"Bearer {super_admin_token}"})
        
        response = super_admin_session.get(f"{BASE_URL}/admin/tenants")
        if response.status_code != 200:
            log_test("Get Tenants", False, f"Failed: {response.status_code}")
            return False
        
        tenants = response.json()
        shefford_tenant = None
        for tenant in tenants:
            if tenant.get('slug') == TENANT_SLUG:
                shefford_tenant = tenant
                break
        
        if not shefford_tenant:
            log_test("Find Shefford Tenant", False, "Shefford tenant not found")
            return False
        
        tenant_id = shefford_tenant['id']
        log_test("Find Shefford Tenant", True, f"Found Shefford tenant: {tenant_id}")
        
        # Step 3: Create admin user for Shefford if needed
        print("\nStep 3: Ensuring Shefford admin exists...")
        admin_user_data = {
            "email": ADMIN_EMAIL,
            "prenom": "Admin",
            "nom": "Shefford",
            "mot_de_passe": ADMIN_PASSWORD
        }
        
        response = super_admin_session.post(f"{BASE_URL}/admin/tenants/{tenant_id}/create-admin", json=admin_user_data)
        if response.status_code == 200:
            log_test("Create Shefford Admin", True, "Admin user created successfully")
        elif response.status_code == 400 and "existe déjà" in response.text:
            log_test("Create Shefford Admin", True, "Admin user already exists")
        else:
            log_test("Create Shefford Admin", False, f"Failed: {response.status_code}", {"response": response.text})
            # Continue anyway - user might exist
        
        # Step 4: Login as Shefford admin
        print("\nStep 4: Logging in as Shefford admin...")
        admin_login = {
            "email": ADMIN_EMAIL,
            "mot_de_passe": ADMIN_PASSWORD
        }
        
        # Try tenant-specific login first
        response = requests.post(f"{BASE_URL}/{TENANT_SLUG}/auth/login", json=admin_login)
        if response.status_code != 200:
            # Try legacy login
            response = requests.post(f"{BASE_URL}/auth/login", json=admin_login)
            if response.status_code != 200:
                log_test("Shefford Admin Login", False, f"Failed: {response.status_code}", {"response": response.text})
                return False
        
        admin_data = response.json()
        admin_token = admin_data["access_token"]
        log_test("Shefford Admin Login", True, f"Logged in as {ADMIN_EMAIL}")
        
        # Step 5: Create session for admin
        admin_session = requests.Session()
        admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        # Step 6: Test CREATE competence (POST /api/{tenant}/competences)
        print("\nStep 6: Testing CREATE competence...")
        test_competence = {
            "nom": "Test Compétence",
            "description": "Test description",
            "heures_requises_annuelles": 10,
            "obligatoire": False
        }
        
        response = admin_session.post(f"{BASE_URL}/{TENANT_SLUG}/competences", json=test_competence)
        if response.status_code != 200:
            log_test("Create Competence", False, f"Failed: {response.status_code}", {"response": response.text})
            return False
        
        created_competence = response.json()
        competence_id = created_competence["id"]
        
        # Verify created competence data
        if created_competence.get("nom") != "Test Compétence":
            log_test("Create Competence", False, f"Name mismatch: expected 'Test Compétence', got '{created_competence.get('nom')}'")
            return False
        
        if created_competence.get("heures_requises_annuelles") != 10:
            log_test("Create Competence", False, f"Hours mismatch: expected 10, got {created_competence.get('heures_requises_annuelles')}")
            return False
        
        log_test("Create Competence", True, f"Created competence '{created_competence.get('nom')}' with {created_competence.get('heures_requises_annuelles')}h")
        
        # Step 7: Test READ competences (GET /api/{tenant}/competences)
        print("\nStep 7: Testing READ competences...")
        response = admin_session.get(f"{BASE_URL}/{TENANT_SLUG}/competences")
        if response.status_code != 200:
            log_test("Read Competences", False, f"Failed: {response.status_code}", {"response": response.text})
            return False
        
        competences_list = response.json()
        
        # Verify the created competence is in the list
        found_competence = None
        for comp in competences_list:
            if comp.get("id") == competence_id:
                found_competence = comp
                break
        
        if not found_competence:
            log_test("Read Competences", False, "Created competence not found in list")
            return False
        
        log_test("Read Competences", True, f"Found {len(competences_list)} competences, including created one")
        
        # Step 8: Test UPDATE competence (PUT /api/{tenant}/competences/{competence_id})
        print("\nStep 8: Testing UPDATE competence...")
        update_data = {
            "nom": "Test Modifié",
            "heures_requises_annuelles": 20
        }
        
        response = admin_session.put(f"{BASE_URL}/{TENANT_SLUG}/competences/{competence_id}", json=update_data)
        if response.status_code != 200:
            log_test("Update Competence", False, f"Failed: {response.status_code}", {"response": response.text})
            return False
        
        updated_competence = response.json()
        
        # Verify the update was successful
        if updated_competence.get("nom") != "Test Modifié":
            log_test("Update Competence", False, f"Name not updated: expected 'Test Modifié', got '{updated_competence.get('nom')}'")
            return False
        
        if updated_competence.get("heures_requises_annuelles") != 20:
            log_test("Update Competence", False, f"Hours not updated: expected 20, got {updated_competence.get('heures_requises_annuelles')}")
            return False
        
        log_test("Update Competence", True, f"Updated to '{updated_competence.get('nom')}' with {updated_competence.get('heures_requises_annuelles')}h")
        
        # Step 9: Test DELETE competence (DELETE /api/{tenant}/competences/{competence_id})
        print("\nStep 9: Testing DELETE competence...")
        response = admin_session.delete(f"{BASE_URL}/{TENANT_SLUG}/competences/{competence_id}")
        if response.status_code != 200:
            log_test("Delete Competence", False, f"Failed: {response.status_code}", {"response": response.text})
            return False
        
        delete_result = response.json()
        
        # Verify delete response
        if "message" not in delete_result or "supprimée" not in delete_result["message"]:
            log_test("Delete Competence", False, f"Unexpected response: {delete_result}")
            return False
        
        log_test("Delete Competence", True, f"Deleted successfully: {delete_result['message']}")
        
        # Step 10: Verify competence was deleted
        print("\nStep 10: Verifying competence deletion...")
        response = admin_session.get(f"{BASE_URL}/{TENANT_SLUG}/competences")
        if response.status_code != 200:
            log_test("Verify Deletion", False, f"Failed to get competences: {response.status_code}")
            return False
        
        competences_after_delete = response.json()
        
        # Verify the competence is no longer in the list
        deleted_competence_found = False
        for comp in competences_after_delete:
            if comp.get("id") == competence_id:
                deleted_competence_found = True
                break
        
        if deleted_competence_found:
            log_test("Verify Deletion", False, "Deleted competence still found in list")
            return False
        
        log_test("Verify Deletion", True, "Competence successfully removed from list")
        
        print("\n" + "=" * 50)
        print("🎉 ALL COMPETENCES CRUD TESTS PASSED!")
        print("=" * 50)
        print("✅ CREATE: Created 'Test Compétence' with 10h, obligatoire=false")
        print("✅ READ: Retrieved competences list and found created competence")
        print("✅ UPDATE: Modified to 'Test Modifié' with 20h")
        print("✅ DELETE: Successfully deleted competence")
        print("✅ VERIFY: Confirmed competence removed from list")
        print(f"✅ TENANT: Used '{TENANT_SLUG}' tenant")
        print(f"✅ CREDENTIALS: Used {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        
        return True
        
    except Exception as e:
        log_test("Competences CRUD Test", False, f"Exception: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_competences_crud()
    sys.exit(0 if success else 1)