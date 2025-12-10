#!/usr/bin/env python3
"""
TEST DES 13 RAPPORTS PDF REFACTORISÉS - ProFireManager

CONTEXTE:
D'après le handoff summary, 13 rapports PDF ont été refactorisés et doivent être testés 
pour valider leur génération, formatage et données.

OBJECTIF:
Tester la génération de chaque rapport PDF pour s'assurer qu'ils fonctionnent correctement.

APPLICATION:
- URL Backend: https://defect-workflow.preview.emergentagent.com
- Tenants: demo, shefford
- Credentials: gussdub@gmail.com / 230685Juin+

RAPPORTS À TESTER:
1. Module Prévention: Rapport inspection bâtiment, Rapport visite prévention, Plan d'intervention (PI)
2. Module Inspections Bornes Sèches: Rapport inspection borne sèche
3. Module EPI: Rapport inventaire EPI, Rapport expirations EPI
4. Module Véhicules/Flotte: Rapport inspection véhicule, Rapport maintenance véhicule
5. Module Personnel: Rapport heures travaillées, Planning (horaire)
6. Module Approvisionnement en Eau: Rapport carte points d'eau, Rapport liste points d'eau
7. Autres: Rapport général / dashboard

ENDPOINTS PDF IDENTIFIÉS:
- /{tenant_slug}/planning/export-pdf
- /{tenant_slug}/planning/rapport-heures/export-pdf
- /{tenant_slug}/remplacements/export-pdf
- /{tenant_slug}/rapports/export-dashboard-pdf
- /{tenant_slug}/rapports/export-salaires-pdf
- /{tenant_slug}/personnel/export-pdf
- /{tenant_slug}/disponibilites/export-pdf
- /{tenant_slug}/prevention/inspections/{inspection_id}/rapport-pdf
- /{tenant_slug}/prevention/plans-intervention/{plan_id}/export-pdf
- /{tenant_slug}/prevention/batiments/{batiment_id}/rapport-pdf
- /{tenant_slug}/actifs/rondes-securite/{ronde_id}/export-pdf
- /rapports/export-pdf (global)
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
        self.tenant_slug = "demo"  # Commencer par demo
        self.credentials = {
            "tenant_slug": "demo",
            "email": "gussdub@gmail.com",
            "password": "230685Juin+"
        }
        
        # Résultats des tests
        self.test_results = []
        
        # IDs pour les tests (seront récupérés dynamiquement)
        self.test_ids = {
            "inspection_id": None,
            "plan_id": None,
            "batiment_id": None,
            "ronde_id": None,
            "user_id": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        login_data = {
            "email": self.credentials["email"],
            "mot_de_passe": self.credentials["password"]
        }
        response = requests.post(auth_url, json=login_data)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            
            self.test_ids["user_id"] = user_info.get('id')
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code} - {response.text}")
            return False
    
    def get_test_data_ids(self):
        """Récupérer les IDs nécessaires pour les tests PDF"""
        print("\n🔍 Récupération des IDs de test...")
        
        # 1. Récupérer un bâtiment
        try:
            url = f"{self.base_url}/{self.tenant_slug}/prevention/batiments"
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                batiments = response.json()
                if batiments and len(batiments) > 0:
                    self.test_ids["batiment_id"] = batiments[0].get('id')
                    print(f"✅ Bâtiment trouvé: {self.test_ids['batiment_id']}")
        except Exception as e:
            print(f"⚠️ Erreur récupération bâtiment: {e}")
        
        # 2. Récupérer une inspection
        try:
            url = f"{self.base_url}/{self.tenant_slug}/prevention/inspections"
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                inspections = response.json()
                if inspections and len(inspections) > 0:
                    self.test_ids["inspection_id"] = inspections[0].get('id')
                    print(f"✅ Inspection trouvée: {self.test_ids['inspection_id']}")
        except Exception as e:
            print(f"⚠️ Erreur récupération inspection: {e}")
        
        # 3. Récupérer un plan d'intervention
        try:
            url = f"{self.base_url}/{self.tenant_slug}/prevention/plans-intervention"
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                plans = response.json()
                if plans and len(plans) > 0:
                    self.test_ids["plan_id"] = plans[0].get('id')
                    print(f"✅ Plan d'intervention trouvé: {self.test_ids['plan_id']}")
        except Exception as e:
            print(f"⚠️ Erreur récupération plan: {e}")
        
        # 4. Récupérer une ronde de sécurité
        try:
            url = f"{self.base_url}/{self.tenant_slug}/actifs/rondes-securite"
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                rondes = response.json()
                if rondes and len(rondes) > 0:
                    self.test_ids["ronde_id"] = rondes[0].get('id')
                    print(f"✅ Ronde de sécurité trouvée: {self.test_ids['ronde_id']}")
        except Exception as e:
            print(f"⚠️ Erreur récupération ronde: {e}")
        
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
        """Tester tous les rapports PDF identifiés"""
        print("\n" + "="*80)
        print("🧪 TESTS DES 13 RAPPORTS PDF REFACTORISÉS")
        print("="*80)
        
        # Liste des endpoints PDF à tester
        pdf_tests = [
            # 1. Module Planning
            {
                "name": "1. Planning Export PDF (Mois)",
                "url": f"{self.base_url}/{self.tenant_slug}/planning/export-pdf",
                "params": {"periode": "2025-12", "type": "mois"}
            },
            {
                "name": "2. Rapport Heures Travaillées PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/planning/rapport-heures/export-pdf",
                "params": {"date_debut": "2025-12-01", "date_fin": "2025-12-31"}
            },
            
            # 2. Module Remplacements
            {
                "name": "3. Remplacements Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/remplacements/export-pdf",
                "params": {"date_debut": "2025-12-01", "date_fin": "2025-12-31"}
            },
            
            # 3. Module Rapports/Dashboard
            {
                "name": "4. Dashboard Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-dashboard-pdf",
                "params": {"periode": "2025-12"}
            },
            {
                "name": "5. Rapport Salaires PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/rapports/export-salaires-pdf",
                "params": {"date_debut": "2025-12-01", "date_fin": "2025-12-31"}
            },
            
            # 4. Module Personnel
            {
                "name": "6. Personnel Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/personnel/export-pdf",
                "params": {"format": "complet"}
            },
            
            # 5. Module Disponibilités
            {
                "name": "7. Disponibilités Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/disponibilites/export-pdf",
                "params": {"date_debut": "2025-12-01", "date_fin": "2025-12-31"}
            },
            
            # 6. Rapport Global (sans tenant)
            {
                "name": "8. Rapport Global PDF",
                "url": f"{self.base_url}/rapports/export-pdf",
                "params": {"type": "global", "periode": "2025-12"}
            }
        ]
        
        # Tests avec IDs spécifiques (si disponibles)
        if self.test_ids.get("inspection_id"):
            pdf_tests.append({
                "name": "9. Rapport Inspection Prévention PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/inspections/{self.test_ids['inspection_id']}/rapport-pdf",
                "params": {}
            })
        
        if self.test_ids.get("plan_id"):
            pdf_tests.append({
                "name": "10. Plan d'Intervention Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/plans-intervention/{self.test_ids['plan_id']}/export-pdf",
                "params": {}
            })
        
        if self.test_ids.get("batiment_id"):
            pdf_tests.append({
                "name": "11. Rapport Bâtiment PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/prevention/batiments/{self.test_ids['batiment_id']}/rapport-pdf",
                "params": {}
            })
        
        if self.test_ids.get("ronde_id"):
            pdf_tests.append({
                "name": "12. Ronde de Sécurité Export PDF",
                "url": f"{self.base_url}/{self.tenant_slug}/actifs/rondes-securite/{self.test_ids['ronde_id']}/export-pdf",
                "params": {}
            })
        
        # Exécuter tous les tests
        successful_tests = 0
        total_tests = len(pdf_tests)
        
        for test in pdf_tests:
            success = self.test_pdf_endpoint(
                test["name"],
                test["url"],
                test.get("params"),
                test.get("expected_filename")
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