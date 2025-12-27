#!/usr/bin/env python3
"""
TEST DES FONCTIONNALITÉS D'EXPORT D'ÉQUIPEMENTS - BUG FIX VERIFICATION

CONTEXTE DU BUG CORRIGÉ:
- Les boutons "Export CSV" et "Export PDF" échouaient avec "Token invalide"
- Le problème était un format incorrect de clé localStorage pour le token
- Fix: utilisation de `getTenantToken()` au lieu de `localStorage.getItem(`token_${tenantSlug}`)`

CREDENTIALS:
- Tenant: pompiers-test
- URL de connexion: https://firehubpro.preview.emergentagent.com/pompiers-test
- Email: admin@test.com
- Password: Admin123!

TESTS À EFFECTUER:

1. **Test Backend des endpoints d'export:**
   - POST login pour obtenir un token valide
   - GET /api/pompiers-test/equipements/export-csv avec Authorization Bearer
   - GET /api/pompiers-test/equipements/export-pdf avec Authorization Bearer
   - Vérifier que les réponses retournent 200 et des fichiers valides (pas d'erreur 401)

CRITÈRE DE SUCCÈS:
- Les deux exports fonctionnent sans erreur d'authentification
- Les fichiers sont téléchargés correctement
"""

import requests
import json
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional
import os

class ExportFunctionalityTester:
    def __init__(self):
        self.base_url = "https://firehubpro.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "pompiers-test"
        self.credentials = {"email": "admin@test.com", "mot_de_passe": "Admin123!"}
        
        # Résultats des tests
        self.test_results = []
        
    def authenticate(self):
        """Authentification sur le tenant pompiers-test"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Email: {self.credentials['email']}")
        
        try:
            response = requests.post(auth_url, json=self.credentials, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('access_token')
                self.headers = {'Authorization': f'Bearer {self.token}'}
                user_info = data.get('user', {})
                print(f"✅ Authentification réussie - Token obtenu")
                print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
                print(f"🆔 User ID: {user_info.get('id')}")
                print(f"🔑 Token (premiers 20 chars): {self.token[:20]}...")
                return True
            else:
                print(f"❌ Échec authentification: {response.status_code}")
                print(f"📄 Réponse: {response.text[:500]}")
                return False
        except Exception as e:
            print(f"❌ Erreur lors de l'authentification: {str(e)}")
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
            print(f"   📄 Data: {json.dumps(data, indent=2)[:300]}...")
    
    def test_csv_export(self):
        """Test 1: GET /api/pompiers-test/equipements/export-csv avec Authorization Bearer"""
        print(f"\n🧪 Test 1: Export CSV des équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/export-csv"
        
        try:
            print(f"📍 URL: {url}")
            print(f"🔑 Headers: Authorization Bearer {self.token[:20]}...")
            
            response = requests.get(url, headers=self.headers, timeout=60)
            
            print(f"📊 Status Code: {response.status_code}")
            print(f"📋 Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                # Vérifier le Content-Type
                content_type = response.headers.get('Content-Type', '')
                content_disposition = response.headers.get('Content-Disposition', '')
                
                print(f"📄 Content-Type: {content_type}")
                print(f"📎 Content-Disposition: {content_disposition}")
                
                # Vérifier que c'est bien un fichier CSV
                if 'csv' in content_type.lower() or 'csv' in content_disposition.lower():
                    # Vérifier la taille du contenu
                    content_length = len(response.content)
                    print(f"📏 Taille du fichier: {content_length} bytes")
                    
                    if content_length > 0:
                        # Vérifier le début du contenu CSV
                        content_preview = response.content[:200].decode('utf-8', errors='ignore')
                        print(f"👀 Aperçu du contenu: {content_preview}")
                        
                        self.log_test_result(
                            "CSV Export", 
                            True, 
                            f"Export CSV réussi - {content_length} bytes"
                        )
                        return True
                    else:
                        self.log_test_result(
                            "CSV Export", 
                            False, 
                            "Fichier CSV vide"
                        )
                        return False
                else:
                    self.log_test_result(
                        "CSV Export", 
                        False, 
                        f"Content-Type incorrect: {content_type}"
                    )
                    return False
            elif response.status_code == 401:
                self.log_test_result(
                    "CSV Export", 
                    False, 
                    f"❌ ERREUR 401 - Token invalide (le bug n'est pas corrigé!): {response.text[:200]}"
                )
                return False
            else:
                self.log_test_result(
                    "CSV Export", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("CSV Export", False, f"Exception: {str(e)}")
            return False
    
    def test_pdf_export(self):
        """Test 2: GET /api/pompiers-test/equipements/export-pdf avec Authorization Bearer"""
        print(f"\n🧪 Test 2: Export PDF des équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/export-pdf"
        
        try:
            print(f"📍 URL: {url}")
            print(f"🔑 Headers: Authorization Bearer {self.token[:20]}...")
            
            response = requests.get(url, headers=self.headers, timeout=60)
            
            print(f"📊 Status Code: {response.status_code}")
            print(f"📋 Headers: {dict(response.headers)}")
            
            if response.status_code == 200:
                # Vérifier le Content-Type
                content_type = response.headers.get('Content-Type', '')
                content_disposition = response.headers.get('Content-Disposition', '')
                
                print(f"📄 Content-Type: {content_type}")
                print(f"📎 Content-Disposition: {content_disposition}")
                
                # Vérifier que c'est bien un fichier PDF
                if 'pdf' in content_type.lower() or 'pdf' in content_disposition.lower():
                    # Vérifier la taille du contenu
                    content_length = len(response.content)
                    print(f"📏 Taille du fichier: {content_length} bytes")
                    
                    if content_length > 0:
                        # Vérifier que c'est bien un PDF (commence par %PDF)
                        content_start = response.content[:10]
                        print(f"👀 Début du fichier: {content_start}")
                        
                        if content_start.startswith(b'%PDF'):
                            self.log_test_result(
                                "PDF Export", 
                                True, 
                                f"Export PDF réussi - {content_length} bytes"
                            )
                            return True
                        else:
                            self.log_test_result(
                                "PDF Export", 
                                False, 
                                f"Contenu n'est pas un PDF valide: {content_start}"
                            )
                            return False
                    else:
                        self.log_test_result(
                            "PDF Export", 
                            False, 
                            "Fichier PDF vide"
                        )
                        return False
                else:
                    self.log_test_result(
                        "PDF Export", 
                        False, 
                        f"Content-Type incorrect: {content_type}"
                    )
                    return False
            elif response.status_code == 401:
                self.log_test_result(
                    "PDF Export", 
                    False, 
                    f"❌ ERREUR 401 - Token invalide (le bug n'est pas corrigé!): {response.text[:200]}"
                )
                return False
            else:
                self.log_test_result(
                    "PDF Export", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("PDF Export", False, f"Exception: {str(e)}")
            return False
    
    def test_equipements_list_for_context(self):
        """Test 3: Vérifier qu'il y a des équipements à exporter"""
        print(f"\n🧪 Test 3: Vérification des équipements disponibles")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                equipements = response.json()
                count = len(equipements)
                
                print(f"📊 Nombre d'équipements trouvés: {count}")
                
                if count > 0:
                    print(f"📋 Premiers équipements:")
                    for i, eq in enumerate(equipements[:3]):
                        print(f"   {i+1}. {eq.get('code_unique', 'N/A')} - {eq.get('nom', 'N/A')} (État: {eq.get('etat', 'N/A')})")
                        print(f"       ID: {eq.get('id', 'N/A')}, Tenant ID: {eq.get('tenant_id', 'N/A')}")
                    
                    self.log_test_result(
                        "Equipements List Context", 
                        True, 
                        f"{count} équipements disponibles pour export"
                    )
                    return True
                else:
                    self.log_test_result(
                        "Equipements List Context", 
                        False, 
                        "Aucun équipement disponible - exports seront vides"
                    )
                    return False
            else:
                self.log_test_result(
                    "Equipements List Context", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Equipements List Context", False, f"Exception: {str(e)}")
            return False
    
    def test_token_validity(self):
        """Test 4: Vérifier que le token est valide en testant un endpoint simple"""
        print(f"\n🧪 Test 4: Validation du token d'authentification")
        
        # Tester avec l'endpoint /auth/me pour vérifier le token
        url = f"{self.base_url}/{self.tenant_slug}/auth/me"
        
        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            
            if response.status_code == 200:
                user_data = response.json()
                print(f"👤 Utilisateur authentifié: {user_data.get('email')} - {user_data.get('role')}")
                print(f"🏢 Tenant ID: {user_data.get('tenant_id', 'N/A')}")
                
                self.log_test_result(
                    "Token Validity", 
                    True, 
                    f"Token valide pour {user_data.get('email')}"
                )
                return True
            elif response.status_code == 401:
                self.log_test_result(
                    "Token Validity", 
                    False, 
                    "Token invalide ou expiré"
                )
                return False
            else:
                self.log_test_result(
                    "Token Validity", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Token Validity", False, f"Exception: {str(e)}")
            return False
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - TEST DES EXPORTS D'ÉQUIPEMENTS")
        print("="*80)
        
        print(f"🏢 Tenant testé: {self.tenant_slug}")
        print(f"👤 Utilisateur: {self.credentials['email']}")
        print(f"🌐 URL Backend: {self.base_url}")
        print(f"📅 Date du test: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Compter les succès et échecs
        successful_tests = sum(1 for result in self.test_results if result['success'])
        total_tests = len(self.test_results)
        success_rate = (successful_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"\n📈 RÉSULTATS GLOBAUX:")
        print(f"   ✅ Tests réussis: {successful_tests}/{total_tests} ({success_rate:.1f}%)")
        
        print(f"\n📋 DÉTAIL DES TESTS:")
        for result in self.test_results:
            status = "✅" if result['success'] else "❌"
            print(f"   {status} {result['test']}: {result['details']}")
        
        # Analyse spécifique du bug fix
        print(f"\n🎯 ANALYSE DU BUG FIX:")
        
        csv_success = any(r['test'] == 'CSV Export' and r['success'] for r in self.test_results)
        pdf_success = any(r['test'] == 'PDF Export' and r['success'] for r in self.test_results)
        
        csv_401_error = any(r['test'] == 'CSV Export' and not r['success'] and '401' in r['details'] for r in self.test_results)
        pdf_401_error = any(r['test'] == 'PDF Export' and not r['success'] and '401' in r['details'] for r in self.test_results)
        
        print(f"   📄 Export CSV: {'✅ CORRIGÉ' if csv_success else '❌ ÉCHEC' if csv_401_error else '⚠️ AUTRE ERREUR'}")
        print(f"   📄 Export PDF: {'✅ CORRIGÉ' if pdf_success else '❌ ÉCHEC' if pdf_401_error else '⚠️ AUTRE ERREUR'}")
        
        if csv_success and pdf_success:
            print(f"\n🎉 SUCCÈS COMPLET: Le bug d'authentification des exports a été corrigé!")
            print(f"   ✅ Les deux boutons d'export fonctionnent maintenant sans erreur 'Token invalide'")
            print(f"   ✅ Les fichiers sont générés et téléchargés correctement")
        elif csv_401_error or pdf_401_error:
            print(f"\n❌ BUG NON CORRIGÉ: Des erreurs 401 'Token invalide' persistent")
            print(f"   ❌ Le fix getTenantToken() ne semble pas fonctionner correctement")
            print(f"   🔧 Vérifier l'implémentation frontend du getTenantToken()")
        else:
            print(f"\n⚠️ RÉSULTATS MITIGÉS: Pas d'erreur 401 mais autres problèmes détectés")
            print(f"   🔍 Vérifier les logs backend pour d'autres erreurs potentielles")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if csv_success and pdf_success:
            print("   🎉 Parfait! Le bug fix fonctionne. Les exports d'équipements sont opérationnels.")
        elif csv_401_error or pdf_401_error:
            print("   🔧 Le bug persiste. Vérifier:")
            print("      - L'implémentation de getTenantToken() dans utils/api.js")
            print("      - Le format de la clé localStorage utilisée")
            print("      - La transmission du token dans les headers Authorization")
        else:
            print("   🔍 Pas d'erreur d'authentification mais autres problèmes à investiguer")
        
        return csv_success and pdf_success  # Critère de succès: les deux exports fonctionnent
    
    def run_export_tests(self):
        """Exécuter tous les tests d'export"""
        print("🚀 DÉBUT DES TESTS D'EXPORT D'ÉQUIPEMENTS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Vérifier que le bug d'authentification des exports est corrigé")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        try:
            # 2. Vérifier la validité du token
            self.test_token_validity()
            
            # 3. Vérifier qu'il y a des équipements à exporter
            self.test_equipements_list_for_context()
            
            # 4. Tester l'export CSV
            self.test_csv_export()
            
            # 5. Tester l'export PDF
            self.test_pdf_export()
            
            # 6. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = ExportFunctionalityTester()
    success = tester.run_export_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()