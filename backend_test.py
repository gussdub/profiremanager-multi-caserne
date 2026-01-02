#!/usr/bin/env python3
"""
TEST COMPLET E2E DES ENDPOINTS DE PHOTO DE PROFIL

CONTEXTE:
Test des endpoints de photo de profil selon la review request.
Teste l'upload, la récupération et la suppression des photos de profil.

TENANT: shefford
CREDENTIALS: 
- Admin: gussdub@gmail.com / 230685Juin+

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification (champ: mot_de_passe)

2. **Photo de profil:**
   - POST /api/shefford/users/photo-profil - Upload photo (utilisateur connecté)
   - GET /api/shefford/users/{user_id} - Vérifier que photo_profil est dans la réponse
   - DELETE /api/shefford/users/photo-profil - Supprimer la photo
   - Vérifier que la photo_profil est bien null après suppression

SCÉNARIO DE TEST:
1. Login en tant qu'admin (gussdub@gmail.com / 230685Juin+) sur tenant "shefford"
2. Créer une image de test en base64 (50x50 pixels rouge)
3. Upload de la photo de profil
4. Vérifier que l'image est redimensionnée et retournée
5. Récupérer les infos utilisateur et vérifier que photo_profil est présente
6. Supprimer la photo de profil
7. Vérifier que photo_profil est null après suppression

RÉSULTATS ATTENDUS:
- Tous les endpoints doivent fonctionner correctement
- L'image doit être redimensionnée à 200x200 pixels
- La photo doit être correctement sauvegardée et récupérée
- La suppression doit fonctionner correctement
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os
import base64
from PIL import Image
from io import BytesIO

class PhotoProfilE2ETester:
    def __init__(self):
        # Utiliser l'URL depuis frontend/.env comme spécifié
        self.base_url = "https://emergency-ui-fix.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        
        # Credentials de production selon la review request
        self.admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        
        # Résultats des tests
        self.test_results = []
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "user_id": None,
            "test_image_base64": None
        }
        
    def create_test_image(self):
        """Créer une image de test 50x50 pixels rouge en base64"""
        print(f"🎨 Création d'une image de test 50x50 pixels rouge...")
        
        try:
            # Créer une image rouge 50x50 pixels
            img = Image.new('RGB', (50, 50), color='red')
            
            # Convertir en base64
            buffer = BytesIO()
            img.save(buffer, format='JPEG')
            base64_img = base64.b64encode(buffer.getvalue()).decode()
            
            # Format avec préfixe data:image
            self.test_data["test_image_base64"] = f"data:image/jpeg;base64,{base64_img}"
            
            print(f"✅ Image de test créée: {len(base64_img)} caractères base64")
            print(f"   📏 Taille: 50x50 pixels")
            print(f"   🎨 Couleur: Rouge")
            print(f"   📄 Format: JPEG")
            
            return True
            
        except Exception as e:
            print(f"❌ Erreur création image de test: {str(e)}")
            return False
    
    def authenticate(self):
        """Authentification sur le tenant shefford avec les credentials de production"""
        print(f"🔐 Authentification tenant {self.tenant_slug} (admin)...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Email: {self.admin_credentials['email']}")
        
        response = requests.post(auth_url, json=self.admin_credentials)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
            self.test_data["user_id"] = user_info.get('id')
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code}")
            print(f"📄 Réponse: {response.text[:200]}")
            return False
    
    def log_test_result(self, test_name: str, success: bool, details: str = "", data: dict = None):
        """Enregistrer le résultat d'un test"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅" if success else "❌"
        print(f"{status} {test_name}: {details}")
        if data and not success:
            print(f"   📄 Data: {json.dumps(data, indent=2)[:200]}...")
    
    def test_upload_photo_profil(self):
        """Test 1: POST /api/shefford/users/photo-profil - Upload photo"""
        print(f"\n🧪 Test 1: Upload de la photo de profil")
        
        if not self.test_data["test_image_base64"]:
            self.log_test_result(
                "POST Upload Photo", 
                False, 
                "Aucune image de test disponible"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/users/photo-profil"
        
        # Données pour l'upload
        photo_data = {
            "photo_base64": self.test_data["test_image_base64"]
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=photo_data)
            
            if response.status_code == 200:
                result = response.json()
                
                self.log_test_result(
                    "POST Upload Photo", 
                    True, 
                    "Photo de profil uploadée avec succès"
                )
                
                # Vérifier que la réponse contient la photo redimensionnée
                if "photo_profil" in result:
                    photo_returned = result["photo_profil"]
                    if photo_returned and photo_returned.startswith("data:image/jpeg;base64,"):
                        self.log_test_result(
                            "POST Upload Photo - Format", 
                            True, 
                            "Photo retournée au format JPEG base64"
                        )
                        print(f"   📸 Photo redimensionnée retournée: {len(photo_returned)} caractères")
                    else:
                        self.log_test_result(
                            "POST Upload Photo - Format", 
                            False, 
                            "Format de photo retournée incorrect"
                        )
                else:
                    self.log_test_result(
                        "POST Upload Photo - Réponse", 
                        False, 
                        "Champ photo_profil manquant dans la réponse"
                    )
                
                print(f"   📋 Message: {result.get('message', 'N/A')}")
                
                return True
            else:
                self.log_test_result(
                    "POST Upload Photo", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("POST Upload Photo", False, f"Exception: {str(e)}")
            return False
    
    def test_get_user_with_photo(self):
        """Test 2: GET /api/shefford/users/{user_id} - Vérifier photo_profil dans réponse"""
        print(f"\n🧪 Test 2: Récupération des infos utilisateur avec photo")
        
        if not self.test_data["user_id"]:
            self.log_test_result(
                "GET User avec Photo", 
                False, 
                "Aucun user_id disponible"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/users/{self.test_data['user_id']}"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                user_data = response.json()
                
                self.log_test_result(
                    "GET User avec Photo", 
                    True, 
                    "Données utilisateur récupérées avec succès"
                )
                
                # Vérifier que photo_profil est présente
                if "photo_profil" in user_data:
                    photo_profil = user_data["photo_profil"]
                    if photo_profil and photo_profil.startswith("data:image/jpeg;base64,"):
                        self.log_test_result(
                            "GET User - Photo Présente", 
                            True, 
                            "Photo de profil présente et au bon format"
                        )
                        print(f"   📸 Photo de profil trouvée: {len(photo_profil)} caractères")
                        print(f"   👤 Utilisateur: {user_data.get('prenom', '')} {user_data.get('nom', '')}")
                        print(f"   📧 Email: {user_data.get('email', 'N/A')}")
                    elif photo_profil is None:
                        self.log_test_result(
                            "GET User - Photo Présente", 
                            False, 
                            "Photo de profil est null (pas uploadée ou supprimée)"
                        )
                    else:
                        self.log_test_result(
                            "GET User - Photo Présente", 
                            False, 
                            f"Format de photo incorrect: {str(photo_profil)[:50]}..."
                        )
                else:
                    self.log_test_result(
                        "GET User - Photo Présente", 
                        False, 
                        "Champ photo_profil manquant dans la réponse"
                    )
                
                return True
            else:
                self.log_test_result(
                    "GET User avec Photo", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("GET User avec Photo", False, f"Exception: {str(e)}")
            return False
    
    def test_delete_photo_profil(self):
        """Test 3: DELETE /api/shefford/users/photo-profil - Supprimer la photo"""
        print(f"\n🧪 Test 3: Suppression de la photo de profil")
        
        url = f"{self.base_url}/{self.tenant_slug}/users/photo-profil"
        
        try:
            response = requests.delete(url, headers=self.headers)
            
            if response.status_code == 200:
                result = response.json()
                
                self.log_test_result(
                    "DELETE Photo Profil", 
                    True, 
                    "Photo de profil supprimée avec succès"
                )
                
                print(f"   📋 Message: {result.get('message', 'N/A')}")
                
                return True
            else:
                self.log_test_result(
                    "DELETE Photo Profil", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("DELETE Photo Profil", False, f"Exception: {str(e)}")
            return False
    
    def test_verify_photo_deleted(self):
        """Test 4: Vérifier que photo_profil est null après suppression"""
        print(f"\n🧪 Test 4: Vérification que la photo est bien supprimée")
        
        if not self.test_data["user_id"]:
            self.log_test_result(
                "Vérification Suppression", 
                False, 
                "Aucun user_id disponible"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/users/{self.test_data['user_id']}"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                user_data = response.json()
                
                self.log_test_result(
                    "Vérification Suppression", 
                    True, 
                    "Données utilisateur récupérées pour vérification"
                )
                
                # Vérifier que photo_profil est null
                if "photo_profil" in user_data:
                    photo_profil = user_data["photo_profil"]
                    if photo_profil is None:
                        self.log_test_result(
                            "Vérification Photo Null", 
                            True, 
                            "Photo de profil est bien null après suppression"
                        )
                        print(f"   ✅ Photo de profil: null (supprimée correctement)")
                    else:
                        self.log_test_result(
                            "Vérification Photo Null", 
                            False, 
                            f"Photo de profil n'est pas null: {str(photo_profil)[:50]}..."
                        )
                else:
                    self.log_test_result(
                        "Vérification Photo Null", 
                        False, 
                        "Champ photo_profil manquant dans la réponse"
                    )
                
                return True
            else:
                self.log_test_result(
                    "Vérification Suppression", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Vérification Suppression", False, f"Exception: {str(e)}")
            return False
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - ENDPOINTS DE PHOTO DE PROFIL")
        print("="*80)
        
        print(f"🏢 Tenant testé: {self.tenant_slug}")
        print(f"👤 Utilisateur: {self.admin_credentials['email']}")
        print(f"🌐 URL Backend: {self.base_url}")
        print(f"📅 Date du test: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Compter les succès et échecs
        successful_tests = sum(1 for result in self.test_results if result['success'])
        total_tests = len(self.test_results)
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\n📈 RÉSULTATS GLOBAUX:")
        print(f"   ✅ Tests réussis: {successful_tests}/{total_tests} ({success_rate:.1f}%)")
        
        print(f"\n📋 DÉTAIL DES TESTS:")
        
        # Grouper par catégorie
        categories = {
            "Authentification": [],
            "Upload Photo": [],
            "Récupération Données": [],
            "Suppression Photo": [],
            "Vérifications": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'auth' in test_name.lower() or 'login' in test_name.lower():
                categories["Authentification"].append(result)
            elif 'upload' in test_name.lower() or 'post' in test_name.lower():
                categories["Upload Photo"].append(result)
            elif 'get' in test_name.lower() and 'user' in test_name.lower():
                categories["Récupération Données"].append(result)
            elif 'delete' in test_name.lower():
                categories["Suppression Photo"].append(result)
            elif 'vérification' in test_name.lower() or 'format' in test_name.lower():
                categories["Vérifications"].append(result)
        
        for category, tests in categories.items():
            if tests:
                print(f"\n🔸 {category}:")
                for test in tests:
                    status = "✅" if test['success'] else "❌"
                    print(f"   {status} {test['test']}: {test['details']}")
        
        # Résumé des fonctionnalités critiques
        print(f"\n🎯 FONCTIONNALITÉS CRITIQUES:")
        
        critical_tests = [
            ("Authentification admin", any("auth" in r['test'].lower() for r in self.test_results if r['success'])),
            ("Upload photo de profil", any("POST Upload Photo" in r['test'] and r['success'] for r in self.test_results)),
            ("Photo dans réponse GET user", any("GET User" in r['test'] and "Photo" in r['test'] and r['success'] for r in self.test_results)),
            ("Suppression photo", any("DELETE Photo" in r['test'] and r['success'] for r in self.test_results)),
            ("Vérification suppression", any("Vérification" in r['test'] and "Null" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Les endpoints de photo de profil fonctionnent parfaitement.")
            print("   📸 L'upload, le redimensionnement et la suppression sont opérationnels.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests E2E des endpoints de photo de profil"""
        print("🚀 DÉBUT DES TESTS E2E - ENDPOINTS DE PHOTO DE PROFIL")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester les endpoints de photo de profil")
        
        # 1. Créer l'image de test
        if not self.create_test_image():
            print("❌ ÉCHEC CRITIQUE: Impossible de créer l'image de test")
            return False
        
        # 2. Authentification admin
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'admin")
            return False
        
        try:
            # 3. Upload de la photo de profil
            self.test_upload_photo_profil()
            
            # 4. Vérifier que la photo est dans la réponse GET user
            self.test_get_user_with_photo()
            
            # 5. Supprimer la photo de profil
            self.test_delete_photo_profil()
            
            # 6. Vérifier que la photo est bien supprimée
            self.test_verify_photo_deleted()
            
            # 7. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = PhotoProfilE2ETester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()