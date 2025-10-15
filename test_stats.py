#!/usr/bin/env python3
"""
Test the /api/admin/stats endpoint specifically
"""

import requests
import json

# Configuration
BASE_URL = "https://disponible-pro.preview.emergentagent.com/api"
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

def test_stats_endpoint():
    """Test the /api/admin/stats endpoint"""
    
    # Step 1: Login and get token
    login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    response = requests.post(f"{BASE_URL}/admin/auth/login", json=login_data)
    if response.status_code != 200:
        print(f"Login failed: {response.text}")
        return
    
    login_result = response.json()
    token = login_result.get("access_token")
    
    # Step 2: Test the /admin/stats endpoint
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/admin/stats", headers=headers)
    
    print(f"Stats response status: {response.status_code}")
    
    if response.status_code == 200:
        stats = response.json()
        print(f"Stats response: {json.dumps(stats, indent=2)}")
        
        # Check details_par_caserne specifically
        details = stats.get('details_par_caserne', [])
        print(f"\nDetails par caserne ({len(details)} entries):")
        for i, detail in enumerate(details):
            print(f"  {i+1}. {detail}")
            
        # Look for Shefford
        shefford_found = False
        for detail in details:
            caserne_name = detail.get('caserne', '').lower()
            if 'shefford' in caserne_name:
                shefford_found = True
                print(f"\n✅ Found Shefford: {detail}")
                break
        
        if not shefford_found:
            print(f"\n❌ Shefford not found in details_par_caserne")
            print(f"Available casernes: {[d.get('caserne') for d in details]}")
    else:
        print(f"Stats request failed: {response.text}")

if __name__ == "__main__":
    test_stats_endpoint()