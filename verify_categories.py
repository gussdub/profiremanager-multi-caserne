#!/usr/bin/env python3
"""
Verify that personne_ressource fields were saved
"""

import requests
import json

# Configuration
base_url = "https://emergency-911.preview.emergentagent.com/api"
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

def verify_personne_ressource_fields():
    """Verify personne_ressource fields in categories"""
    headers = authenticate()
    if not headers:
        return
    
    url = f"{base_url}/{tenant_slug}/equipements/categories"
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        categories = response.json()
        print(f"Found {len(categories)} categories")
        
        for cat in categories:
            has_id = "personne_ressource_id" in cat
            has_email = "personne_ressource_email" in cat
            
            if has_id or has_email:
                print(f"\n✅ {cat['nom']}:")
                print(f"  personne_ressource_id: {cat.get('personne_ressource_id', 'N/A')}")
                print(f"  personne_ressource_email: {cat.get('personne_ressource_email', 'N/A')}")
            else:
                print(f"❌ {cat['nom']}: No personne_ressource fields")

if __name__ == "__main__":
    verify_personne_ressource_fields()