#!/usr/bin/env python3
"""
Debug script to find non-predefined categories and test updates
"""

import requests
import json

# Configuration
base_url = "https://dutyswap.preview.emergentagent.com/api"
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

def find_non_predefined_categories():
    """Find categories that are not predefined"""
    headers = authenticate()
    if not headers:
        return
    
    url = f"{base_url}/{tenant_slug}/equipements/categories"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        categories = response.json()
        print(f"Found {len(categories)} categories")
        
        non_predefined = []
        for cat in categories:
            is_predefined = cat.get("est_predefinit", False)
            print(f"  {cat['nom']}: predefined={is_predefined}")
            if not is_predefined:
                non_predefined.append(cat)
        
        print(f"\nNon-predefined categories: {len(non_predefined)}")
        
        if non_predefined:
            # Test updating the first non-predefined category
            test_cat = non_predefined[0]
            print(f"\nTesting update for: {test_cat['nom']} (ID: {test_cat['id']})")
            
            update_url = f"{base_url}/{tenant_slug}/equipements/categories/{test_cat['id']}"
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
            else:
                print(f"Update failed: {response.text}")
        else:
            # Create a test category
            print("\nCreating a test category...")
            create_url = f"{base_url}/{tenant_slug}/equipements/categories"
            create_data = {
                "nom": "Test Category P1",
                "description": "Test category for P1 features",
                "frequence_inspection": "6 mois",
                "couleur": "#10B981",
                "icone": "🧪",
                "personne_ressource_id": "test-user-id-123",
                "personne_ressource_email": "test@profiremanager.ca"
            }
            
            response = requests.post(create_url, headers=headers, json=create_data)
            print(f"Create response: {response.status_code}")
            
            if response.status_code == 200:
                print("Category created successfully!")
                result = response.json()
                print(json.dumps(result, indent=2))
            else:
                print(f"Create failed: {response.text}")

if __name__ == "__main__":
    find_non_predefined_categories()