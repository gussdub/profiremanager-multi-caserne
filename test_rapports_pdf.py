#!/usr/bin/env python3
"""
TEST RAPIDE - Vérifier si les 3 rapports PDF fonctionnent réellement

CONTEXTE:
Le troubleshoot agent pense que les erreurs 500 sont dues à l'authentification dans les tests, 
pas au code PDF lui-même.

TEST À EFFECTUER:
1. Authentification avec tenant demo
2. Tester Dashboard PDF
3. Tester Salaires PDF  
4. Tester Personnel PDF

RÉSULTAT ATTENDU:
- Si les 3 PDF sont générés (taille > 1KB), les rapports FONCTIONNENT
- Si erreurs 500, investiguer les logs backend pour voir la vraie erreur

IMPORTANT:
Si les rapports fonctionnent, on passe directement à l'Option A (Inventaires Véhicules).
"""

import requests
import json
import sys
import time
from datetime import datetime

class RapportsPDFTester:
    def __init__(self):
        self.base_url = "https://prevention-cleanup.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        
        # Credentials pour tenant demo
        self.tenant_slug = "demo"
        self.credentials = {
            "tenant_slug": "demo",
            "email": "gussdub@gmail.com", 
            "password": "230685Juin+"
        }
        
        self.test_results = []
        
    def authenticate(self):
        """Authentification tenant demo"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        # Utiliser l'endpoint correct /{tenant_slug}/auth/login
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        login_data = {
            "email": self.credentials["email"],
            "mot_de_passe": self.credentials["password"]  # Le backend utilise "mot_de_passe"
        }
        
        try:
            response = requests.post(auth_url, json=login_data)
            print(f"📡 Requête auth: POST {auth_url}")
            print(f"📋 Données: {login_data}")
            print(f"📊 Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('access_token')  # Le backend retourne 'access_token'
                if self.token:
                    self.headers = {'Authorization': f'Bearer {self.token}'}
                    print(f"✅ Authentification réussie - Token obtenu")
                    print(f"🔑 Token: {self.token[:20]}...")
                    user_info = data.get('user', {})
                    print(f"👤 User: {user_info.get('email')} - Role: {user_info.get('role')}")
                    return True
                else:
                    print(f"❌ Token manquant dans la réponse: {data}")
                    return False
            else:
                print(f"❌ Échec authentification: {response.status_code}")
                print(f"📄 Réponse: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Exception lors de l'authentification: {e}")
            return False
    
    def test_pdf_endpoint(self, name: str, url: str, params: dict = None):
        """Test d'un endpoint PDF spécifique"""
        print(f"\n🧪 Test: {name}")
        print(f"📍 URL: {url}")
        if params:
            print(f"📋 Paramètres: {params}")
        
        try:
            response = requests.get(url, headers=self.headers, params=params or {})
            print(f"📊 Status Code: {response.status_code}")
            
            if response.status_code == 200:
                # Vérifier le Content-Type
                content_type = response.headers.get('Content-Type', '')
                print(f"📄 Content-Type: {content_type}")
                
                if 'application/pdf' in content_type:
                    # Vérifier la taille du PDF
                    pdf_size = len(response.content)
                    print(f"📏 Taille PDF: {pdf_size} bytes")
                    
                    if pdf_size > 1024:  # > 1KB comme demandé
                        print(f"✅ PDF généré avec succès (taille > 1KB)")
                        
                        # Sauvegarder le PDF pour vérification
                        filename = f"/tmp/test_{name.lower().replace(' ', '_')}.pdf"
                        with open(filename, 'wb') as f:
                            f.write(response.content)
                        print(f"💾 PDF sauvegardé: {filename}")
                        
                        self.test_results.append({
                            "name": name,
                            "status": "✅ SUCCÈS",
                            "size": pdf_size,
                            "file": filename
                        })
                        return True
                    else:
                        print(f"❌ PDF trop petit ({pdf_size} bytes < 1KB)")
                        self.test_results.append({
                            "name": name,
                            "status": "❌ PDF TROP PETIT",
                            "size": pdf_size
                        })
                        return False
                else:
                    print(f"❌ Content-Type incorrect: {content_type}")
                    print(f"📄 Début réponse: {response.text[:200]}...")
                    self.test_results.append({
                        "name": name,
                        "status": "❌ MAUVAIS TYPE",
                        "content_type": content_type,
                        "response_preview": response.text[:200]
                    })
                    return False
            else:
                print(f"❌ Erreur HTTP {response.status_code}")
                print(f"📄 Réponse: {response.text}")
                self.test_results.append({
                    "name": name,
                    "status": f"❌ HTTP {response.status_code}",
                    "error": response.text
                })
                return False
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
            self.test_results.append({
                "name": name,
                "status": "❌ EXCEPTION",
                "error": str(e)
            })
            return False
    
    def test_3_rapports_pdf(self):
        """Tester les 3 rapports PDF spécifiés"""
        print("\n" + "="*80)
        print("🧪 TEST DES 3 RAPPORTS PDF - DEMO TENANT")
        print("="*80)
        
        # Les 3 rapports à tester comme spécifié dans la requête
        rapports = [
            {
                "name": "Dashboard PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-dashboard-pdf",
                "params": {}
            },
            {
                "name": "Salaires PDF", 
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-salaires-pdf",
                "params": {
                    "date_debut": "2024-01-01",
                    "date_fin": "2024-12-31"
                }
            },
            {
                "name": "Personnel PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/personnel/export-pdf",
                "params": {}
            }
        ]
        
        successful_tests = 0
        total_tests = len(rapports)
        
        for rapport in rapports:
            success = self.test_pdf_endpoint(
                rapport["name"],
                rapport["url"], 
                rapport.get("params")
            )
            if success:
                successful_tests += 1
            
            # Pause entre les tests
            time.sleep(1)
        
        return successful_tests, total_tests
    
    def verify_pdf_files(self):
        """Vérifier les fichiers PDF générés"""
        print(f"\n🔍 VÉRIFICATION DES FICHIERS PDF GÉNÉRÉS")
        print("="*50)
        
        import os
        for result in self.test_results:
            if result["status"] == "✅ SUCCÈS" and "file" in result:
                filename = result["file"]
                if os.path.exists(filename):
                    file_size = os.path.getsize(filename)
                    print(f"📄 {result['name']}: {filename}")
                    print(f"   📏 Taille: {file_size} bytes")
                    
                    # Utiliser la commande file pour vérifier le type
                    try:
                        import subprocess
                        file_output = subprocess.check_output(['file', filename], text=True)
                        print(f"   🔍 Type: {file_output.strip()}")
                    except:
                        print(f"   🔍 Type: Vérification impossible")
    
    def generate_final_report(self, successful: int, total: int):
        """Générer le rapport final"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - TEST DES 3 RAPPORTS PDF")
        print("="*80)
        
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"👤 Email: {self.credentials['email']}")
        print(f"🌐 URL: {self.base_url}")
        print(f"📅 Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        success_rate = (successful / total * 100) if total > 0 else 0
        print(f"\n📈 RÉSULTATS:")
        print(f"   ✅ Tests réussis: {successful}/{total} ({success_rate:.1f}%)")
        
        print(f"\n📋 DÉTAIL:")
        for result in self.test_results:
            print(f"   • {result['name']}: {result['status']}")
            if 'size' in result:
                print(f"     📏 Taille: {result['size']} bytes")
            if 'error' in result:
                print(f"     ❌ Erreur: {result['error']}")
        
        # Conclusion selon les critères de la requête
        print(f"\n🎯 CONCLUSION:")
        if successful == total:
            print("   🎉 TOUS LES RAPPORTS FONCTIONNENT!")
            print("   ✅ Les erreurs 500 étaient bien dues aux tests, pas au code PDF")
            print("   ➡️ Passer directement à l'Option A (Inventaires Véhicules)")
            return True
        elif successful > 0:
            print(f"   ⚠️ {successful}/{total} rapports fonctionnent")
            print("   🔍 Investiguer les logs backend pour les rapports en échec")
            return False
        else:
            print("   ❌ AUCUN RAPPORT NE FONCTIONNE")
            print("   🔍 Investiguer les logs backend pour voir la vraie erreur")
            return False
    
    def run_test(self):
        """Exécuter le test complet"""
        print("🚀 DÉBUT DU TEST RAPIDE - 3 RAPPORTS PDF")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"👤 Credentials: {self.credentials['email']}")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        # 2. Tester les 3 rapports
        successful, total = self.test_3_rapports_pdf()
        
        # 3. Vérifier les fichiers générés
        self.verify_pdf_files()
        
        # 4. Rapport final
        overall_success = self.generate_final_report(successful, total)
        
        return overall_success

def main():
    """Point d'entrée principal"""
    tester = RapportsPDFTester()
    success = tester.run_test()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()