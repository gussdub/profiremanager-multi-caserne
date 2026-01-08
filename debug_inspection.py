#!/usr/bin/env python3
"""
Debug inspection creation
"""

import requests
import json
import uuid

# Configuration
base_url = "https://epi-inspect.preview.emergentagent.com/api"
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

def test_inspection_creation():
    """Test creating unified inspection with EPI"""
    headers = authenticate()
    if not headers:
        return
    
    url = f"{base_url}/{tenant_slug}/inspections-unifiees"
    
    # Generate unique ID
    test_epi_id = f"test-epi-{uuid.uuid4().hex[:8]}"
    
    inspection_data = {
        "asset_id": test_epi_id,
        "asset_type": "epi",
        "formulaire_id": "test-form-epi",
        "formulaire_nom": "Test Formulaire EPI",
        "reponses": {"test": "value", "etat_general": "bon"},
        "conforme": True,
        "metadata": {"epi_nom": "Casque Test"}
    }
    
    print(f"Creating inspection for EPI: {test_epi_id}")
    print(f"Request data: {json.dumps(inspection_data, indent=2)}")
    
    response = requests.post(url, headers=headers, json=inspection_data)
    print(f"\nResponse status: {response.status_code}")
    print(f"Response headers: {dict(response.headers)}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Response data: {json.dumps(result, indent=2)}")
        
        # Check if inspection was created
        inspection = result.get("inspection", {})
        if inspection:
            print(f"\n✅ Inspection created:")
            print(f"  ID: {inspection.get('id')}")
            print(f"  Asset ID: {inspection.get('asset_id')}")
            print(f"  Asset Type: {inspection.get('asset_type')}")
            print(f"  Conforme: {inspection.get('conforme')}")
        else:
            print(f"\n❌ No inspection object in response")
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    test_inspection_creation()