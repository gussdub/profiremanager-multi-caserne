#!/usr/bin/env python3
"""
TEST MIGRATION P1 - SYSTÈME DE FORMULAIRES UNIFIÉS POUR VÉHICULES ET BORNES SÈCHES

CONTEXTE:
Test de la migration des composants InventaireVehiculeModal et InspectionBorneSecheModal 
pour utiliser le système de formulaires unifiés (/formulaires-inspection et /inspections-unifiees).

TENANT: shefford
CREDENTIALS: 
- Admin: gussdub@gmail.com / 230685Juin+

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification

2. **Formulaires unifiés:**
   - GET /api/shefford/formulaires-inspection - Vérifier formulaires type "inventaire"

3. **Inspections unifiées:**
   - POST /api/shefford/inspections-unifiees - Créer inspection véhicule
   - POST /api/shefford/inspections-unifiees - Créer inspection borne sèche
   - GET /api/shefford/inspections-unifiees/vehicule/{vehicule_id} - Récupérer inspections par asset

4. **Endpoints fallback (anciens):**
   - GET /api/shefford/parametres/modeles-inventaires-vehicules
   - GET /api/shefford/bornes-seches/modeles-inspection

SCÉNARIO DE TEST:
1. Login admin sur tenant "shefford"
2. Vérifier formulaires type "inventaire" disponibles
3. Créer inspection unifiée pour véhicule
4. Créer inspection unifiée pour borne sèche
5. Récupérer inspections par asset
6. Vérifier endpoints fallback fonctionnels
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import uuid

class UnifiedInspectionTester:
    def __init__(self):
        # URL depuis frontend/.env
        self.base_url = "https://fire-respond.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        
        # Credentials de production
        self.admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        
        # Résultats des tests
        self.test_results = []
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "user_id": None,
            "formulaires_inventaire": [],
            "vehicule_id": None,
            "borne_id": None,
            "inspection_vehicule_id": None,
            "inspection_borne_id": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant shefford"""
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
    
    def test_formulaires_inventaire_disponibles(self):
        """Test 1: Vérifier que les formulaires de type "inventaire" sont disponibles"""
        print(f"\n🧪 Test 1: Vérification des formulaires type 'inventaire'")
        
        url = f"{self.base_url}/{self.tenant_slug}/formulaires-inspection"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                formulaires = response.json()
                
                # Filtrer les formulaires de type "inventaire"
                formulaires_inventaire = [f for f in formulaires if f.get("type") == "inventaire"]
                self.test_data["formulaires_inventaire"] = formulaires_inventaire
                
                if formulaires_inventaire:
                    self.log_test_result(
                        "Formulaires Inventaire Disponibles", 
                        True, 
                        f"✅ {len(formulaires_inventaire)} formulaires type 'inventaire' trouvés"
                    )
                    
                    for form in formulaires_inventaire[:3]:  # Afficher les 3 premiers
                        print(f"   📋 {form.get('nom')} (ID: {form.get('id')})")
                    
                    return True
                else:
                    self.log_test_result(
                        "Formulaires Inventaire Disponibles", 
                        False, 
                        f"❌ Aucun formulaire type 'inventaire' trouvé sur {len(formulaires)} formulaires"
                    )
                    return False
            else:
                self.log_test_result(
                    "Formulaires Inventaire Disponibles", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Formulaires Inventaire Disponibles", False, f"Exception: {str(e)}")
            return False
    
    def get_test_vehicule_id(self):
        """Récupérer un ID de véhicule pour les tests"""
        print(f"🚗 Récupération d'un véhicule pour les tests...")
        
        url = f"{self.base_url}/{self.tenant_slug}/vehicules"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                vehicules = response.json()
                if vehicules:
                    vehicule = vehicules[0]
                    self.test_data["vehicule_id"] = vehicule.get("id")
                    print(f"   ✅ Véhicule trouvé: {vehicule.get('nom', 'N/A')} (ID: {vehicule.get('id')})")
                    return True
                else:
                    print(f"   ⚠️ Aucun véhicule trouvé")
                    # Créer un ID de test
                    self.test_data["vehicule_id"] = "test-vehicule-" + str(uuid.uuid4())[:8]
                    print(f"   📝 Utilisation d'un ID de test: {self.test_data['vehicule_id']}")
                    return True
            else:
                print(f"   ⚠️ Erreur récupération véhicules: {response.status_code}")
                # Créer un ID de test
                self.test_data["vehicule_id"] = "test-vehicule-" + str(uuid.uuid4())[:8]
                print(f"   📝 Utilisation d'un ID de test: {self.test_data['vehicule_id']}")
                return True
                
        except Exception as e:
            print(f"   ⚠️ Exception: {str(e)}")
            # Créer un ID de test
            self.test_data["vehicule_id"] = "test-vehicule-" + str(uuid.uuid4())[:8]
            print(f"   📝 Utilisation d'un ID de test: {self.test_data['vehicule_id']}")
            return True
    
    def get_test_borne_id(self):
        """Récupérer un ID de borne sèche pour les tests"""
        print(f"🚰 Récupération d'une borne sèche pour les tests...")
        
        url = f"{self.base_url}/{self.tenant_slug}/points-eau"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                bornes = response.json()
                if bornes:
                    borne = bornes[0]
                    self.test_data["borne_id"] = borne.get("id")
                    print(f"   ✅ Borne trouvée: {borne.get('nom', 'N/A')} (ID: {borne.get('id')})")
                    return True
                else:
                    print(f"   ⚠️ Aucune borne trouvée")
                    # Créer un ID de test
                    self.test_data["borne_id"] = "test-borne-" + str(uuid.uuid4())[:8]
                    print(f"   📝 Utilisation d'un ID de test: {self.test_data['borne_id']}")
                    return True
            else:
                print(f"   ⚠️ Erreur récupération bornes: {response.status_code}")
                # Créer un ID de test
                self.test_data["borne_id"] = "test-borne-" + str(uuid.uuid4())[:8]
                print(f"   📝 Utilisation d'un ID de test: {self.test_data['borne_id']}")
                return True
                
        except Exception as e:
            print(f"   ⚠️ Exception: {str(e)}")
            # Créer un ID de test
            self.test_data["borne_id"] = "test-borne-" + str(uuid.uuid4())[:8]
            print(f"   📝 Utilisation d'un ID de test: {self.test_data['borne_id']}")
            return True
    
    def test_create_inspection_vehicule(self):
        """Test 2: Créer une inspection unifiée pour un véhicule"""
        print(f"\n🧪 Test 2: Création d'inspection unifiée pour véhicule")
        
        # S'assurer qu'on a un formulaire et un véhicule
        if not self.test_data.get("formulaires_inventaire"):
            print("   ⚠️ Aucun formulaire inventaire disponible, création d'un ID de test")
            formulaire_id = "test-formulaire-" + str(uuid.uuid4())[:8]
        else:
            formulaire_id = self.test_data["formulaires_inventaire"][0].get("id")
        
        if not self.test_data.get("vehicule_id"):
            self.get_test_vehicule_id()
        
        vehicule_id = self.test_data["vehicule_id"]
        
        url = f"{self.base_url}/{self.tenant_slug}/inspections-unifiees"
        
        inspection_data = {
            "formulaire_id": formulaire_id,
            "asset_id": vehicule_id,
            "asset_type": "vehicule",
            "reponses": {
                "section1": {
                    "item1": "ok"
                }
            },
            "conforme": True,
            "metadata": {
                "vehicule_nom": "391"
            }
        }
        
        print(f"   🚗 Véhicule ID: {vehicule_id}")
        print(f"   📋 Formulaire ID: {formulaire_id}")
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code == 200:
                result = response.json()
                inspection_id = result.get("id") or result.get("inspection_id")
                self.test_data["inspection_vehicule_id"] = inspection_id
                
                self.log_test_result(
                    "Création Inspection Véhicule", 
                    True, 
                    f"✅ Inspection véhicule créée avec succès (ID: {inspection_id})"
                )
                
                print(f"   🆔 Inspection ID: {inspection_id}")
                print(f"   ✅ Conforme: {result.get('conforme')}")
                print(f"   📅 Créée: {result.get('created_at', 'N/A')}")
                
                return True
            else:
                self.log_test_result(
                    "Création Inspection Véhicule", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Création Inspection Véhicule", False, f"Exception: {str(e)}")
            return False
    
    def test_create_inspection_borne_seche(self):
        """Test 3: Créer une inspection unifiée pour une borne sèche"""
        print(f"\n🧪 Test 3: Création d'inspection unifiée pour borne sèche")
        
        # S'assurer qu'on a un formulaire et une borne
        if not self.test_data.get("formulaires_inventaire"):
            print("   ⚠️ Aucun formulaire inventaire disponible, création d'un ID de test")
            formulaire_id = "test-formulaire-" + str(uuid.uuid4())[:8]
        else:
            formulaire_id = self.test_data["formulaires_inventaire"][0].get("id")
        
        if not self.test_data.get("borne_id"):
            self.get_test_borne_id()
        
        borne_id = self.test_data["borne_id"]
        
        url = f"{self.base_url}/{self.tenant_slug}/inspections-unifiees"
        
        inspection_data = {
            "formulaire_id": formulaire_id,
            "asset_id": borne_id,
            "asset_type": "borne_seche",
            "reponses": {
                "section1": {
                    "item1": "ok"
                }
            },
            "conforme": True,
            "metadata": {
                "borne_nom": "Borne Test"
            }
        }
        
        print(f"   🚰 Borne ID: {borne_id}")
        print(f"   📋 Formulaire ID: {formulaire_id}")
        
        try:
            response = requests.post(url, headers=self.headers, json=inspection_data)
            
            if response.status_code == 200:
                result = response.json()
                inspection_id = result.get("id") or result.get("inspection_id")
                self.test_data["inspection_borne_id"] = inspection_id
                
                self.log_test_result(
                    "Création Inspection Borne Sèche", 
                    True, 
                    f"✅ Inspection borne sèche créée avec succès (ID: {inspection_id})"
                )
                
                print(f"   🆔 Inspection ID: {inspection_id}")
                print(f"   ✅ Conforme: {result.get('conforme')}")
                print(f"   📅 Créée: {result.get('created_at', 'N/A')}")
                
                return True
            else:
                self.log_test_result(
                    "Création Inspection Borne Sèche", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Création Inspection Borne Sèche", False, f"Exception: {str(e)}")
            return False
    
    def test_get_inspections_by_vehicule(self):
        """Test 4: Récupérer les inspections par véhicule"""
        print(f"\n🧪 Test 4: Récupération des inspections par véhicule")
        
        if not self.test_data.get("vehicule_id"):
            self.log_test_result(
                "Récupération Inspections Véhicule", 
                False, 
                "Aucun véhicule ID disponible"
            )
            return False
        
        vehicule_id = self.test_data["vehicule_id"]
        url = f"{self.base_url}/{self.tenant_slug}/inspections-unifiees/vehicule/{vehicule_id}"
        
        print(f"   🚗 Véhicule ID: {vehicule_id}")
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                inspections = response.json()
                
                self.log_test_result(
                    "Récupération Inspections Véhicule", 
                    True, 
                    f"✅ {len(inspections)} inspection(s) récupérée(s) pour le véhicule"
                )
                
                for i, inspection in enumerate(inspections[:3]):  # Afficher les 3 premières
                    print(f"   📋 {i+1}. ID: {inspection.get('id')} - Conforme: {inspection.get('conforme')} - Date: {inspection.get('created_at', 'N/A')[:10]}")
                
                return True
            else:
                self.log_test_result(
                    "Récupération Inspections Véhicule", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Récupération Inspections Véhicule", False, f"Exception: {str(e)}")
            return False
    
    def test_fallback_endpoints(self):
        """Test 5: Vérifier que les anciens endpoints sont toujours fonctionnels"""
        print(f"\n🧪 Test 5: Vérification des endpoints fallback (anciens)")
        
        # Test endpoint véhicules (peut être vide)
        print(f"   📋 Test endpoint modèles inventaires véhicules...")
        url_vehicules = f"{self.base_url}/{self.tenant_slug}/parametres/modeles-inventaires-vehicules"
        
        try:
            response = requests.get(url_vehicules, headers=self.headers)
            
            if response.status_code in [200, 404]:  # 404 acceptable si vide
                if response.status_code == 200:
                    data = response.json()
                    print(f"      ✅ Endpoint accessible - {len(data) if isinstance(data, list) else 'N/A'} modèles")
                else:
                    print(f"      ✅ Endpoint accessible (vide) - 404 attendu")
                
                vehicules_success = True
            else:
                print(f"      ❌ Erreur: {response.status_code}")
                vehicules_success = False
                
        except Exception as e:
            print(f"      ❌ Exception: {str(e)}")
            vehicules_success = False
        
        # Test endpoint bornes sèches
        print(f"   🚰 Test endpoint modèles inspection bornes sèches...")
        url_bornes = f"{self.base_url}/{self.tenant_slug}/bornes-seches/modeles-inspection"
        
        try:
            response = requests.get(url_bornes, headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                print(f"      ✅ Endpoint accessible - {len(data) if isinstance(data, list) else 'N/A'} modèles")
                bornes_success = True
            else:
                print(f"      ❌ Erreur: {response.status_code}")
                bornes_success = False
                
        except Exception as e:
            print(f"      ❌ Exception: {str(e)}")
            bornes_success = False
        
        # Résultat global
        overall_success = vehicules_success and bornes_success
        
        self.log_test_result(
            "Endpoints Fallback Fonctionnels", 
            overall_success, 
            f"✅ Endpoints fallback {'fonctionnels' if overall_success else 'partiellement fonctionnels'}"
        )
        
        return overall_success
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - MIGRATION SYSTÈME FORMULAIRES UNIFIÉS")
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
        for result in self.test_results:
            status = "✅" if result['success'] else "❌"
            print(f"   {status} {result['test']}: {result['details']}")
        
        # Fonctionnalités critiques
        print(f"\n🎯 FONCTIONNALITÉS CRITIQUES MIGRATION P1:")
        
        critical_features = [
            ("Formulaires type 'inventaire' disponibles", any("Inventaire Disponibles" in r['test'] and r['success'] for r in self.test_results)),
            ("Création inspection véhicule unifiée", any("Inspection Véhicule" in r['test'] and r['success'] for r in self.test_results)),
            ("Création inspection borne sèche unifiée", any("Inspection Borne" in r['test'] and r['success'] for r in self.test_results)),
            ("Récupération inspections par asset", any("Inspections Véhicule" in r['test'] and r['success'] for r in self.test_results)),
            ("Endpoints fallback fonctionnels", any("Fallback" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_features:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Données spécifiques
        print(f"\n📊 DONNÉES MIGRATION:")
        print(f"   📋 Formulaires inventaire trouvés: {len(self.test_data.get('formulaires_inventaire', []))}")
        print(f"   🚗 Véhicule testé: {self.test_data.get('vehicule_id', 'N/A')}")
        print(f"   🚰 Borne testée: {self.test_data.get('borne_id', 'N/A')}")
        print(f"   📝 Inspection véhicule créée: {self.test_data.get('inspection_vehicule_id', 'N/A')}")
        print(f"   📝 Inspection borne créée: {self.test_data.get('inspection_borne_id', 'N/A')}")
        
        # Recommandations
        print(f"\n💡 STATUT MIGRATION P1:")
        if success_rate >= 90:
            print("   🎉 MIGRATION RÉUSSIE! Le système de formulaires unifiés fonctionne parfaitement.")
            print("   📋 Les composants InventaireVehiculeModal et InspectionBorneSecheModal peuvent utiliser les nouveaux endpoints.")
        elif success_rate >= 75:
            print("   ✅ Migration largement réussie. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Migration partiellement réussie. Des corrections sont nécessaires.")
        else:
            print("   ❌ MIGRATION ÉCHOUÉE. Révision complète du système unifié nécessaire.")
        
        return success_rate >= 75
    
    def run_unified_inspection_tests(self):
        """Exécuter tous les tests de migration du système unifié"""
        print("🚀 DÉBUT DES TESTS - MIGRATION SYSTÈME FORMULAIRES UNIFIÉS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester la migration P1 - Formulaires unifiés véhicules/bornes sèches")
        
        # 1. Authentification admin
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'admin")
            return False
        
        try:
            # 2. Récupérer les IDs de test
            self.get_test_vehicule_id()
            self.get_test_borne_id()
            
            # 3. Test formulaires inventaire disponibles
            self.test_formulaires_inventaire_disponibles()
            
            # 4. Test création inspection véhicule
            self.test_create_inspection_vehicule()
            
            # 5. Test création inspection borne sèche
            self.test_create_inspection_borne_seche()
            
            # 6. Test récupération inspections par asset
            self.test_get_inspections_by_vehicule()
            
            # 7. Test endpoints fallback
            self.test_fallback_endpoints()
            
            # 8. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = UnifiedInspectionTester()
    success = tester.run_unified_inspection_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()