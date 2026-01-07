#!/usr/bin/env python3
"""
Debug script to check categories structure
"""

import requests
import json

# Configuration
base_url = "https://smart-unified-forms.preview.emergentagent.com/api"
tenant_slug = "shefford"
admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}

def authenticate():
    """Authenticate and get token"""
    auth_url = f"{base_url}/{tenant_slug}/auth/login"
    response = requests.post(auth_url, json=admin_credentials)
    
    if response.status_code == 200:
        data = response.json()
        token = data.get('access_token')
        return {'Authorization': f'Bearer {token}'}
    else:
        print(f"Auth failed: {response.status_code}")
        return None

def check_categories():
    """Check categories structure"""
    headers = authenticate()
    if not headers:
        return
    
    url = f"{base_url}/{tenant_slug}/equipements/categories"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        categories = response.json()
        print(f"Found {len(categories)} categories")
        
        # Check first category structure
        if categories:
            first_cat = categories[0]
            print(f"\nFirst category structure:")
            print(json.dumps(first_cat, indent=2))
            
            # Check if personne_ressource fields exist
            has_id = "personne_ressource_id" in first_cat
            has_email = "personne_ressource_email" in first_cat
            print(f"\nPersonne ressource fields:")
            print(f"  personne_ressource_id: {has_id}")
            print(f"  personne_ressource_email: {has_email}")
    else:
        print(f"Failed to get categories: {response.status_code}")
        print(response.text)

def test_update_category():
    """Test updating a category with personne_ressource fields"""
    headers = authenticate()
    if not headers:
        return
    
    # Get categories first
    url = f"{base_url}/{tenant_slug}/equipements/categories"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        categories = response.json()
        if categories:
            category_id = categories[0]["id"]
            category_name = categories[0]["nom"]
            
            print(f"\nTesting update for category: {category_name} (ID: {category_id})")
            
            # Update with personne_ressource fields
            update_url = f"{base_url}/{tenant_slug}/equipements/categories/{category_id}"
            update_data = {
                "personne_ressource_id": "test-user-id-123",
                "personne_ressource_email": "test@profiremanager.ca"
            }
            
            response = requests.put(update_url, headers=headers, json=update_data)
            print(f"Update response: {response.status_code}")
            
            if response.status_code == 200:
                print("Update successful!")
                result = response.json()
                print(json.dumps(result, indent=2))
                
                # Verify the update
                verify_response = requests.get(update_url, headers=headers)
                if verify_response.status_code == 200:
                    updated_cat = verify_response.json()
                    print(f"\nVerification:")
                    print(f"  personne_ressource_id: {updated_cat.get('personne_ressource_id')}")
                    print(f"  personne_ressource_email: {updated_cat.get('personne_ressource_email')}")
            else:
                print(f"Update failed: {response.text}")

if __name__ == "__main__":
    check_categories()
    test_update_category()