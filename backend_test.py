#!/usr/bin/env python3
"""
TEST COMPLET - VÉRIFIER TOUS LES 12 RAPPORTS PDF

CONTEXTE:
L'utilisateur signale une erreur 401 sur l'export PDF Personnel. Je dois tester les 12 rapports pour identifier tous les problèmes.

LISTE COMPLÈTE DES 12 RAPPORTS:
1. Planning PDF
2. Heures Travaillées PDF
3. Remplacements PDF
4. Inspections Bâtiment PDF
5. Rondes Sécurité PDF
6. Inspection Borne Sèche PDF
7. Dashboard PDF
8. Salaires PDF
9. Personnel PDF (❌ Signalé comme problématique)
10. Inventaire EPI PDF
11. Plan Intervention PDF
12. Rapport Général PDF

APPLICATION:
- URL Backend: https://defect-workflow.preview.emergentagent.com
- Tenant: demo
- Credentials: gussdub@gmail.com / 230685Juin+

ENDPOINTS À TESTER (avec URLs complètes):
- /api/demo/rapports/export-planning-pdf
- /api/demo/rapports/export-heures-pdf?mois=2024-12
- /api/demo/rapports/export-remplacements-pdf
- /api/demo/prevention/batiments/export-inspection-pdf?batiment_id=[ID]
- /api/demo/prevention/rondes/export-pdf?ronde_id=[ID]
- /api/demo/points-eau/export-inspection-pdf?borne_id=[ID]
- /api/demo/rapports/export-dashboard-pdf
- /api/demo/rapports/export-salaires-pdf?date_debut=2024-01-01&date_fin=2024-12-31
- /api/demo/personnel/export-pdf ⚠️ CELUI-CI ÉCHOUE
- /api/demo/epi/export-inventaire-pdf
- /api/demo/prevention/batiments/[ID]/export-pi-pdf
- /api/demo/rapports/export-rapport-pdf
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class PDFReportsTester:
    def __init__(self):
        self.base_url = "https://defect-workflow.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "demo"  # Tester demo comme spécifié
        self.credentials = {
            "email": "gussdub@gmail.com",
            "mot_de_passe": "230685Juin+"
        }
        
        # Résultats des tests
        self.test_results = []
        
        # IDs pour les tests (seront récupérés dynamiquement)
        self.test_ids = {
            "batiment_id": None,
            "ronde_id": None,
            "borne_id": None,
            "user_id": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant demo"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        login_data = self.credentials
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Données: {login_data}")
        
        response = requests.post(auth_url, json=login_data)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            print(f"🔑 Token: {self.token[:50]}...")
            
            self.test_ids["user_id"] = user_info.get('id')
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def get_test_data_ids(self):
        """Récupérer les IDs nécessaires pour les tests PDF"""
        print("\n🔍 Récupération des IDs de test...")
        
        # 1. Récupérer un bâtiment pour les tests prévention
        try:
            url = f"{self.base_url}/{self.tenant_slug}/prevention/batiments"
            response = requests.get(url, headers=self.headers)
            print(f"🏢 Bâtiments - Status: {response.status_code}")
            if response.status_code == 200:
                batiments = response.json()
                if batiments and len(batiments) > 0:
                    self.test_ids["batiment_id"] = batiments[0].get('id')
                    print(f"✅ Bâtiment trouvé: {self.test_ids['batiment_id']}")
                else:
                    print("⚠️ Aucun bâtiment trouvé")
            else:
                print(f"⚠️ Erreur récupération bâtiments: {response.text[:200]}")
        except Exception as e:
            print(f"⚠️ Exception récupération bâtiment: {e}")
        
        # 2. Récupérer une ronde de sécurité
        try:
            url = f"{self.base_url}/{self.tenant_slug}/prevention/rondes"
            response = requests.get(url, headers=self.headers)
            print(f"🔄 Rondes - Status: {response.status_code}")
            if response.status_code == 200:
                rondes = response.json()
                if rondes and len(rondes) > 0:
                    self.test_ids["ronde_id"] = rondes[0].get('id')
                    print(f"✅ Ronde trouvée: {self.test_ids['ronde_id']}")
                else:
                    print("⚠️ Aucune ronde trouvée")
            else:
                print(f"⚠️ Erreur récupération rondes: {response.text[:200]}")
        except Exception as e:
            print(f"⚠️ Exception récupération ronde: {e}")
        
        # 3. Récupérer une borne sèche
        try:
            url = f"{self.base_url}/{self.tenant_slug}/points-eau"
            response = requests.get(url, headers=self.headers)
            print(f"💧 Points d'eau - Status: {response.status_code}")
            if response.status_code == 200:
                bornes = response.json()
                if bornes and len(bornes) > 0:
                    self.test_ids["borne_id"] = bornes[0].get('id')
                    print(f"✅ Borne trouvée: {self.test_ids['borne_id']}")
                else:
                    print("⚠️ Aucune borne trouvée")
            else:
                print(f"⚠️ Erreur récupération bornes: {response.text[:200]}")
        except Exception as e:
            print(f"⚠️ Exception récupération borne: {e}")
        
        print(f"📊 IDs récupérés: {self.test_ids}")
    
    def test_pdf_endpoint(self, endpoint_name: str, url: str, params: dict = None, expected_filename: str = None):
        """Test générique d'un endpoint PDF"""
        print(f"\n🧪 Test: {endpoint_name}")
        print(f"📍 URL: {url}")
        if params:
            print(f"📋 Paramètres: {params}")
        
        try:
            response = requests.get(url, headers=self.headers, params=params or {})
            
            # Vérifier le status code
            if response.status_code == 200:
                # Vérifier le Content-Type
                content_type = response.headers.get('Content-Type', '')
                if 'application/pdf' in content_type:
                    # Vérifier la taille du PDF
                    pdf_size = len(response.content)
                    if pdf_size > 0:
                        print(f"✅ PDF généré avec succès")
                        print(f"   📏 Taille: {pdf_size} bytes")
                        print(f"   📄 Content-Type: {content_type}")
                        
                        # Vérifier le filename dans les headers
                        content_disposition = response.headers.get('Content-Disposition', '')
                        if content_disposition:
                            print(f"   📎 Disposition: {content_disposition}")
                        
                        self.test_results.append({
                            "endpoint": endpoint_name,
                            "status": "✅ SUCCÈS",
                            "size": pdf_size,
                            "content_type": content_type
                        })
                        return True
                    else:
                        print(f"❌ PDF vide (0 bytes)")
                        self.test_results.append({
                            "endpoint": endpoint_name,
                            "status": "❌ PDF VIDE",
                            "size": 0,
                            "error": "PDF généré mais vide"
                        })
                        return False
                else:
                    print(f"❌ Content-Type incorrect: {content_type}")
                    print(f"   📄 Contenu reçu: {response.text[:200]}...")
                    self.test_results.append({
                        "endpoint": endpoint_name,
                        "status": "❌ MAUVAIS TYPE",
                        "content_type": content_type,
                        "error": f"Content-Type attendu: application/pdf, reçu: {content_type}"
                    })
                    return False
            else:
                print(f"❌ Erreur HTTP {response.status_code}")
                print(f"   📄 Réponse: {response.text[:200]}...")
                self.test_results.append({
                    "endpoint": endpoint_name,
                    "status": f"❌ HTTP {response.status_code}",
                    "error": response.text[:200]
                })
                return False
                
        except Exception as e:
            print(f"❌ Exception: {str(e)}")
            self.test_results.append({
                "endpoint": endpoint_name,
                "status": "❌ EXCEPTION",
                "error": str(e)
            })
            return False
    
    def test_all_pdf_reports(self):
        """Tester tous les 12 rapports PDF spécifiés"""
        print("\n" + "="*80)
        print("🧪 TESTS DES 12 RAPPORTS PDF - TENANT DEMO")
        print("="*80)
        
        # Liste des 12 endpoints PDF à tester selon la spécification
        pdf_tests = [
            # 1. Planning PDF
            {
                "name": "1. Planning PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-planning-pdf",
                "params": {}
            },
            
            # 2. Heures Travaillées PDF
            {
                "name": "2. Heures Travaillées PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-heures-pdf",
                "params": {"mois": "2024-12"}
            },
            
            # 3. Remplacements PDF
            {
                "name": "3. Remplacements PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-remplacements-pdf",
                "params": {}
            },
            
            # 4. Inspections Bâtiment PDF (nécessite batiment_id)
            {
                "name": "4. Inspections Bâtiment PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/batiments/export-inspection-pdf",
                "params": {"batiment_id": self.test_ids.get("batiment_id", "test-id")},
                "requires_id": "batiment_id"
            },
            
            # 5. Rondes Sécurité PDF (nécessite ronde_id)
            {
                "name": "5. Rondes Sécurité PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/rondes/export-pdf",
                "params": {"ronde_id": self.test_ids.get("ronde_id", "test-id")},
                "requires_id": "ronde_id"
            },
            
            # 6. Inspection Borne Sèche PDF (nécessite borne_id)
            {
                "name": "6. Inspection Borne Sèche PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/points-eau/export-inspection-pdf",
                "params": {"borne_id": self.test_ids.get("borne_id", "test-id")},
                "requires_id": "borne_id"
            },
            
            # 7. Dashboard PDF
            {
                "name": "7. Dashboard PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-dashboard-pdf",
                "params": {}
            },
            
            # 8. Salaires PDF
            {
                "name": "8. Salaires PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-salaires-pdf",
                "params": {"date_debut": "2024-01-01", "date_fin": "2024-12-31"}
            },
            
            # 9. Personnel PDF (⚠️ CELUI-CI ÉCHOUE selon le rapport)
            {
                "name": "9. Personnel PDF (❌ Signalé problématique)",
                "url": f"{self.base_url}/{self.tenant_slug}/personnel/export-pdf",
                "params": {},
                "focus": True  # Marquer comme focus spécial
            },
            
            # 10. Inventaire EPI PDF
            {
                "name": "10. Inventaire EPI PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/epi/export-inventaire-pdf",
                "params": {}
            },
            
            # 11. Plan Intervention PDF (nécessite batiment_id)
            {
                "name": "11. Plan Intervention PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/batiments/{self.test_ids.get('batiment_id', 'test-id')}/export-pi-pdf",
                "params": {},
                "requires_id": "batiment_id"
            },
            
            # 12. Rapport Général PDF
            {
                "name": "12. Rapport Général PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-rapport-pdf",
                "params": {}
            }
        ]
        
        # Exécuter tous les tests
        successful_tests = 0
        total_tests = len(pdf_tests)
        
        for i, test in enumerate(pdf_tests, 1):
            print(f"\n{'='*60}")
            print(f"TEST {i}/12: {test['name']}")
            print(f"{'='*60}")
            
            # Vérifier si l'ID requis est disponible
            if test.get("requires_id"):
                required_id = test["requires_id"]
                if not self.test_ids.get(required_id):
                    print(f"⚠️ SKIP: {required_id} non disponible pour ce test")
                    self.test_results.append({
                        "endpoint": test["name"],
                        "status": "⚠️ SKIP - ID MANQUANT",
                        "error": f"{required_id} non trouvé dans la base de données"
                    })
                    continue
            
            # Marquer le test Personnel comme focus spécial
            if test.get("focus"):
                print("🎯 FOCUS SPÉCIAL: Ce rapport est signalé comme problématique")
            
            success = self.test_pdf_endpoint(
                test["name"],
                test["url"],
                test.get("params")
            )
            if success:
                successful_tests += 1
            
            # Petite pause entre les tests
            time.sleep(0.5)
        
        return successful_tests, total_tests
    
    def test_additional_pdf_endpoints(self):
        """Tester des endpoints PDF supplémentaires découverts"""
        print("\n" + "="*80)
        print("🔍 RECHERCHE D'ENDPOINTS PDF SUPPLÉMENTAIRES")
        print("="*80)
        
        # Tests supplémentaires basés sur les patterns trouvés dans le code
        additional_tests = []
        
        # Test avec différents paramètres pour voir les variations
        variations = [
            {
                "name": "13. Planning Export PDF (Semaine)",
                "url": f"{self.base_url}/{self.tenant_slug}/planning/export-pdf",
                "params": {"periode": "2025-12-09", "type": "semaine"}
            }
        ]
        
        successful_additional = 0
        for test in variations:
            success = self.test_pdf_endpoint(
                test["name"],
                test["url"],
                test.get("params")
            )
            if success:
                successful_additional += 1
        
        return successful_additional, len(variations)
    
    def generate_test_report(self, successful_tests: int, total_tests: int, additional_successful: int = 0, additional_total: int = 0):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - TESTS DES RAPPORTS PDF")
        print("="*80)
        
        print(f"🏢 Tenant testé: {self.tenant_slug}")
        print(f"👤 Utilisateur: {self.credentials['email']}")
        print(f"🌐 URL Backend: {self.base_url}")
        print(f"📅 Date du test: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"\n📈 RÉSULTATS GLOBAUX:")
        total_all = total_tests + additional_total
        successful_all = successful_tests + additional_successful
        success_rate = (successful_all / total_all * 100) if total_all > 0 else 0
        
        print(f"   ✅ Tests réussis: {successful_all}/{total_all} ({success_rate:.1f}%)")
        print(f"   📊 Tests principaux: {successful_tests}/{total_tests}")
        if additional_total > 0:
            print(f"   🔍 Tests supplémentaires: {additional_successful}/{additional_total}")
        
        print(f"\n📋 DÉTAIL DES RÉSULTATS:")
        for i, result in enumerate(self.test_results, 1):
            print(f"   {i:2d}. {result['endpoint']}")
            print(f"       Status: {result['status']}")
            if 'size' in result:
                print(f"       Taille: {result['size']} bytes")
            if 'content_type' in result:
                print(f"       Type: {result['content_type']}")
            if 'error' in result:
                print(f"       Erreur: {result['error']}")
        
        # Analyse des problèmes
        failed_tests = [r for r in self.test_results if not r['status'].startswith('✅')]
        if failed_tests:
            print(f"\n❌ TESTS EN ÉCHEC ({len(failed_tests)}):")
            for result in failed_tests:
                print(f"   • {result['endpoint']}: {result['status']}")
                if 'error' in result:
                    print(f"     Erreur: {result['error']}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! La plupart des rapports PDF fonctionnent correctement.")
        elif success_rate >= 75:
            print("   ✅ Bon résultat. Quelques corrections mineures nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat moyen. Plusieurs endpoints nécessitent des corrections.")
        else:
            print("   ❌ Résultat préoccupant. Révision majeure des endpoints PDF nécessaire.")
        
        if failed_tests:
            print("   🔧 Vérifier les endpoints en échec pour:")
            print("      - Permissions d'accès")
            print("      - Données de test disponibles")
            print("      - Configuration des paramètres")
            print("      - Implémentation des endpoints")
        
        return success_rate >= 75  # Critère de succès: 75% des tests réussis
    
    def run_comprehensive_pdf_tests(self):
        """Exécuter tous les tests PDF de manière complète"""
        print("🚀 DÉBUT DES TESTS COMPLETS - 13 RAPPORTS PDF REFACTORISÉS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"👤 Credentials: {self.credentials['email']}")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        # 2. Récupérer les IDs de test
        self.get_test_data_ids()
        
        # 3. Tester tous les rapports PDF principaux
        successful_main, total_main = self.test_all_pdf_reports()
        
        # 4. Tester les endpoints supplémentaires
        successful_additional, total_additional = self.test_additional_pdf_endpoints()
        
        # 5. Générer le rapport final
        overall_success = self.generate_test_report(
            successful_main, total_main,
            successful_additional, total_additional
        )
        
        return overall_success

def main():
    """Point d'entrée principal"""
    tester = PDFReportsTester()
    success = tester.run_comprehensive_pdf_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()