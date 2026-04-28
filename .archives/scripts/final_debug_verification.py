#!/usr/bin/env python3
"""
Final verification test for Module Débogage as per review request
Verification finale du module de débogage selon la demande de révision
"""

import requests
import json
import base64
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/backend/.env')
load_dotenv('/app/frontend/.env')

# Configuration
BACKEND_URL = os.getenv('REACT_APP_BACKEND_URL', 'https://prevention-module-qa.preview.emergentagent.com')
API_BASE = f"{BACKEND_URL}/api"

# Credentials from review request
SUPER_ADMIN_EMAIL = "gussdub@icloud.com"
SUPER_ADMIN_PASSWORD = "230685Juin+"

def test_exact_review_requirements():
    """Test exact requirements from review request"""
    print("🎯 FINAL VERIFICATION - EXACT REVIEW REQUIREMENTS")
    print("=" * 70)
    print("Testing exactly what was requested in the review:")
    print("1. Login avec gussdub@icloud.com / 230685Juin+")
    print("2. POST /api/admin/bugs avec body minimal spécifique")
    print("3. GET /api/admin/bugs pour vérifier le bug créé")
    print("4. POST /api/admin/upload-image avec fichier image")
    print("5. Vérifier que pas d'erreur 500")
    print("=" * 70)
    
    session = requests.Session()
    results = []
    
    # Test 1: Login Super Admin
    print("\n🔐 TEST 1: Login Super Admin")
    login_data = {
        "email": SUPER_ADMIN_EMAIL,
        "mot_de_passe": SUPER_ADMIN_PASSWORD
    }
    
    try:
        response = session.post(f"{API_BASE}/admin/auth/login", json=login_data)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            if token:
                session.headers.update({"Authorization": f"Bearer {token}"})
                print("✅ Login successful - Token received")
                results.append(("Login Super Admin", True, "Token received"))
            else:
                print("❌ No token in response")
                results.append(("Login Super Admin", False, "No token"))
                return results
        else:
            print(f"❌ Login failed: {response.status_code}")
            results.append(("Login Super Admin", False, f"Status {response.status_code}"))
            return results
    except Exception as e:
        print(f"❌ Login error: {e}")
        results.append(("Login Super Admin", False, str(e)))
        return results
    
    # Test 2: Create bug with EXACT body from review request
    print("\n🐛 TEST 2: Créer un bug avec le body exact de la demande")
    exact_bug_data = {
        "titre": "Test Bug via API",
        "description": "Ceci est un test de création de bug",
        "module": "Dashboard",
        "priorite": "moyenne",
        "etapes_reproduction": "1. Ouvrir l'app\n2. Observer le bug",
        "resultat_attendu": "Devrait fonctionner",
        "resultat_observe": "Ne fonctionne pas"
    }
    
    print("Body utilisé (exact de la demande):")
    print(json.dumps(exact_bug_data, indent=2, ensure_ascii=False))
    
    try:
        response = session.post(f"{API_BASE}/admin/bugs", json=exact_bug_data)
        print(f"Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            bug_id = data.get("id")
            statut = data.get("statut")
            created_by = data.get("created_by")
            
            print(f"✅ Bug créé avec succès!")
            print(f"   ID: {bug_id}")
            print(f"   Statut: {statut}")
            print(f"   Created by: {created_by}")
            
            # Verify required fields from review
            required_fields = ["id", "statut", "created_by"]
            has_all_fields = all(field in data for field in required_fields)
            
            if has_all_fields and statut == "nouveau":
                results.append(("Create Bug Exact Body", True, f"ID: {bug_id}, Status: {statut}"))
                created_bug_id = bug_id
            else:
                results.append(("Create Bug Exact Body", False, "Missing required fields or wrong status"))
                created_bug_id = None
        elif response.status_code == 500:
            print("❌ ERREUR 500 - Le problème original persiste!")
            results.append(("Create Bug Exact Body", False, "500 Internal Server Error - Original problem still exists"))
            created_bug_id = None
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            results.append(("Create Bug Exact Body", False, f"Status {response.status_code}"))
            created_bug_id = None
    except Exception as e:
        print(f"❌ Request error: {e}")
        results.append(("Create Bug Exact Body", False, str(e)))
        created_bug_id = None
    
    # Test 3: Get bugs list and verify created bug appears
    print("\n📋 TEST 3: Récupérer la liste des bugs")
    try:
        response = session.get(f"{API_BASE}/admin/bugs")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            bugs_count = len(data)
            print(f"✅ Liste récupérée: {bugs_count} bugs trouvés")
            
            # Check if our created bug appears
            if created_bug_id:
                bug_found = any(bug.get("id") == created_bug_id for bug in data)
                if bug_found:
                    print(f"✅ Bug créé trouvé dans la liste")
                    results.append(("Get Bugs List", True, f"{bugs_count} bugs, created bug found"))
                else:
                    print(f"❌ Bug créé non trouvé dans la liste")
                    results.append(("Get Bugs List", False, "Created bug not found in list"))
            else:
                results.append(("Get Bugs List", True, f"{bugs_count} bugs retrieved"))
        else:
            print(f"❌ Failed to get bugs: {response.status_code}")
            results.append(("Get Bugs List", False, f"Status {response.status_code}"))
    except Exception as e:
        print(f"❌ Request error: {e}")
        results.append(("Get Bugs List", False, str(e)))
    
    # Test 4: Upload image
    print("\n🖼️ TEST 4: Upload d'image")
    # Create a simple test image (1x1 pixel PNG)
    test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg=="
    test_image_bytes = base64.b64decode(test_image_base64)
    
    try:
        files = {
            'file': ('test_image.png', test_image_bytes, 'image/png')
        }
        
        response = session.post(f"{API_BASE}/admin/upload-image", files=files)
        print(f"Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            if "url" in data:
                url = data["url"]
                print(f"✅ Image uploadée avec succès!")
                print(f"   URL retournée: {url[:50]}...")
                results.append(("Upload Image", True, "Image uploaded, URL returned"))
            else:
                print(f"❌ Pas d'URL dans la réponse: {data}")
                results.append(("Upload Image", False, "No URL in response"))
        else:
            print(f"❌ Upload failed: {response.status_code}")
            results.append(("Upload Image", False, f"Status {response.status_code}"))
    except Exception as e:
        print(f"❌ Request error: {e}")
        results.append(("Upload Image", False, str(e)))
    
    # Test 5: Verify no 500 errors occurred
    print("\n✅ TEST 5: Vérification - Pas d'erreur 500")
    has_500_errors = any("500" in result[2] for result in results if not result[1])
    
    if not has_500_errors:
        print("✅ Aucune erreur 500 détectée - Le problème original est résolu!")
        results.append(("No 500 Errors", True, "No 500 errors detected"))
    else:
        print("❌ Des erreurs 500 ont été détectées - Le problème persiste")
        results.append(("No 500 Errors", False, "500 errors detected"))
    
    return results

def main():
    """Main verification"""
    print("🔥 ProFireManager - Vérification Finale Module Débogage")
    print("Selon la demande de révision exacte")
    
    results = test_exact_review_requirements()
    
    print("\n" + "=" * 70)
    print("📊 RÉSULTATS FINAUX")
    print("=" * 70)
    
    total_tests = len(results)
    passed_tests = sum(1 for _, success, _ in results if success)
    failed_tests = total_tests - passed_tests
    
    print(f"Total des tests: {total_tests}")
    print(f"Réussis: {passed_tests} ✅")
    print(f"Échoués: {failed_tests} ❌")
    print(f"Taux de réussite: {(passed_tests/total_tests)*100:.1f}%")
    
    print("\n🔍 DÉTAIL DES RÉSULTATS:")
    for test_name, success, details in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if details:
            print(f"    → {details}")
    
    print("\n🎯 ÉVALUATION FINALE:")
    print("=" * 50)
    
    if failed_tests == 0:
        print("✅ TOUS LES TESTS RÉUSSIS!")
        print("→ Module Débogage entièrement fonctionnel")
        print("→ L'erreur 500 originale a été corrigée")
        print("→ Création de bugs fonctionne correctement")
        print("→ Upload d'images fonctionne")
        print("→ Récupération de la liste des bugs fonctionne")
        print("→ Authentification Super Admin fonctionne")
        
        print("\n✅ CONFIRMATION:")
        print("Le backend a été redémarré et fonctionne maintenant correctement.")
        print("Le problème d'import UploadFile a été résolu.")
        
    else:
        print(f"❌ {failed_tests} PROBLÈME(S) DÉTECTÉ(S)")
        
        # Check for specific issues
        auth_failed = any("Login" in result[0] and not result[1] for result in results)
        bug_creation_failed = any("Create Bug" in result[0] and not result[1] for result in results)
        has_500_errors = any("500" in result[2] for result in results if not result[1])
        
        if auth_failed:
            print("→ Problème d'authentification Super Admin")
        if bug_creation_failed:
            print("→ Problème de création de bugs")
        if has_500_errors:
            print("→ L'erreur 500 originale persiste")
            print("→ Le redémarrage du backend n'a pas résolu le problème")
        
        print("\nDétails des échecs:")
        for test_name, success, details in results:
            if not success:
                print(f"  ❌ {test_name}: {details}")
    
    return failed_tests == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)