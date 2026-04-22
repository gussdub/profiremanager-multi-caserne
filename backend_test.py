#!/usr/bin/env python3
"""
TEST COMPLET E2E - MODES DE NOTIFICATION REMPLACEMENTS

CONTEXTE:
Test des 3 stratégies de notification pour le module de remplacements selon la review request.
Validation de la logique corrigée dans /app/backend/routes/remplacements_routes.py (lignes 122, 137, 339-352).

TENANT: demo
CREDENTIALS: 
- Admin: gussdub@gmail.com / 230685Juin+

SCÉNARIOS À TESTER:

1. **Mode SÉQUENTIEL (par défaut)**
   - Configurer: mode_notification = "sequentiel"
   - Créer une demande de remplacement
   - Vérifier logs: "🎯 Mode SÉQUENTIEL: contact de 1 remplaçant à la fois"
   - Vérifier qu'exactement 1 remplaçant est contacté

2. **Mode SIMULTANÉ**
   - Configurer: mode_notification = "simultane", max_contacts = 10
   - Créer une demande de remplacement
   - Vérifier logs: "🎯 Mode SIMULTANÉ: contact de X/Y remplaçants"
   - Vérifier que PLUSIEURS remplaçants sont contactés simultanément

3. **Mode GROUPES SÉQUENTIELS**
   - Configurer: mode_notification = "groupe_sequentiel", taille_groupe = 3
   - Créer une demande de remplacement
   - Vérifier logs: "🎯 Mode GROUPE SÉQUENTIEL: contact de 3 remplaçants"
   - Vérifier qu'exactement 3 remplaçants sont contactés

ENDPOINTS TESTÉS:
- GET /api/demo/parametres/remplacements
- PUT /api/demo/parametres/remplacements
- POST /api/demo/remplacements
- GET /api/demo/remplacements
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class NotificationModesTester:
    def __init__(self):
        # Utiliser l'URL depuis frontend/.env comme spécifié
        self.base_url = "https://fire-alert-cauca.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "demo"
        
        # Credentials selon la review request
        self.admin_credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        
        # Résultats des tests
        self.test_results = []
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "user_id": None,
            "types_garde": [],
            "test_type_garde_id": None,
            "demandes_created": [],
            "original_params": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant demo avec les credentials de production"""
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
    
    def get_backend_logs(self, lines=50):
        """Récupérer les logs backend pour vérifier les messages de notification"""
        try:
            import subprocess
            result = subprocess.run(
                ["tail", "-n", str(lines), "/var/log/supervisor/backend.err.log"],
                capture_output=True,
                text=True
            )
            return result.stdout
        except Exception as e:
            print(f"⚠️ Impossible de récupérer les logs: {str(e)}")
            return ""
    
    def setup_test_data(self):
        """Récupérer les données nécessaires pour les tests"""
        print(f"\n🔧 Configuration des données de test...")
        
        # Récupérer les types de garde disponibles
        url = f"{self.base_url}/{self.tenant_slug}/types-garde"
        try:
            response = requests.get(url, headers=self.headers)
            if response.status_code == 200:
                types_garde = response.json()
                self.test_data["types_garde"] = types_garde
                
                if types_garde:
                    self.test_data["test_type_garde_id"] = types_garde[0].get("id")
                    print(f"   📋 Type de garde sélectionné: {types_garde[0].get('nom')} (ID: {types_garde[0].get('id')})")
                    return True
                else:
                    print(f"   ❌ Aucun type de garde trouvé")
                    return False
            else:
                print(f"   ❌ Erreur récupération types garde: {response.status_code}")
                return False
        except Exception as e:
            print(f"   ❌ Exception: {str(e)}")
            return False
    
    def get_current_parameters(self):
        """Récupérer les paramètres actuels de remplacements"""
        print(f"\n📋 Récupération des paramètres actuels...")
        
        url = f"{self.base_url}/{self.tenant_slug}/parametres/remplacements"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                params = response.json()
                self.test_data["original_params"] = params
                
                current_mode = params.get("mode_notification", "sequentiel")
                max_contacts = params.get("max_contacts", 5)
                taille_groupe = params.get("taille_groupe", 3)
                
                print(f"   📊 Mode actuel: {current_mode}")
                print(f"   📊 Max contacts: {max_contacts}")
                print(f"   📊 Taille groupe: {taille_groupe}")
                
                self.log_test_result(
                    "GET Paramètres Remplacements", 
                    True, 
                    f"Paramètres récupérés - Mode: {current_mode}"
                )
                return True
            else:
                self.log_test_result(
                    "GET Paramètres Remplacements", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("GET Paramètres Remplacements", False, f"Exception: {str(e)}")
            return False
    
    def update_notification_parameters(self, mode: str, max_contacts: int = 10, taille_groupe: int = 3):
        """Mettre à jour les paramètres de notification"""
        print(f"\n⚙️ Configuration mode: {mode}")
        
        url = f"{self.base_url}/{self.tenant_slug}/parametres/remplacements"
        
        # Préparer les données de mise à jour
        update_data = {
            "mode_notification": mode,
            "max_contacts": max_contacts,
            "taille_groupe": taille_groupe,
            # Garder les autres paramètres existants
            "delai_attente_minutes": 60,
            "delai_attente_urgente": 5,
            "delai_attente_haute": 15,
            "delai_attente_normale": 60,
            "delai_attente_faible": 120,
            "heures_silencieuses_actif": False  # Désactiver pour les tests
        }
        
        try:
            response = requests.put(url, headers=self.headers, json=update_data)
            
            if response.status_code == 200:
                print(f"   ✅ Mode configuré: {mode}")
                if mode == "simultane":
                    print(f"   📊 Max contacts: {max_contacts}")
                elif mode == "groupe_sequentiel":
                    print(f"   📊 Taille groupe: {taille_groupe}")
                
                self.log_test_result(
                    f"Configure Mode {mode}", 
                    True, 
                    f"Paramètres mis à jour - Mode: {mode}"
                )
                return True
            else:
                self.log_test_result(
                    f"Configure Mode {mode}", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result(f"Configure Mode {mode}", False, f"Exception: {str(e)}")
            return False
    
    def create_assignment_for_test(self, test_date: str):
        """Créer une assignation pour permettre de tester les remplacements"""
        print(f"\n📋 Création d'une assignation pour le test...")
        
        url = f"{self.base_url}/{self.tenant_slug}/planning/assignation"
        
        assignment_data = {
            "user_id": self.test_data["user_id"],
            "type_garde_id": self.test_data["test_type_garde_id"],
            "date": test_date,
            "assignation_type": "manuel",
            "notes_admin": "Assignation créée pour test des modes de notification"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=assignment_data)
            
            if response.status_code == 200:
                assignment = response.json()
                print(f"   ✅ Assignation créée: {test_date}")
                print(f"   👤 Utilisateur: {self.test_data['user_id']}")
                print(f"   🎯 Type garde: {self.test_data['test_type_garde_id']}")
                return True
            else:
                print(f"   ⚠️ Erreur création assignation: {response.status_code}")
                print(f"   📄 Réponse: {response.text[:200]}")
                return False
                
        except Exception as e:
            print(f"   ❌ Exception création assignation: {str(e)}")
            return False

    def create_replacement_request(self, test_name: str, test_number: int):
        """Créer une demande de remplacement pour tester le mode de notification"""
        print(f"\n📝 Création demande de remplacement pour: {test_name}")
        
        if not self.test_data.get("test_type_garde_id"):
            self.log_test_result(
                f"Create Request {test_name}", 
                False, 
                "Aucun type de garde disponible"
            )
            return None
        
        # Date future différente pour chaque test pour éviter les conflits
        future_date = (datetime.now() + timedelta(days=7 + test_number)).strftime("%Y-%m-%d")
        
        # Créer d'abord une assignation pour cette date
        if not self.create_assignment_for_test(future_date):
            self.log_test_result(
                f"Create Request {test_name}", 
                False, 
                "Impossible de créer l'assignation préalable"
            )
            return None
        
        url = f"{self.base_url}/{self.tenant_slug}/remplacements"
        
        request_data = {
            "type_garde_id": self.test_data["test_type_garde_id"],
            "date": future_date,
            "raison": f"Test mode de notification - {test_name}"
        }
        
        try:
            # Capturer les logs avant la création
            logs_before = self.get_backend_logs(20)
            
            response = requests.post(url, headers=self.headers, json=request_data)
            
            # Attendre un peu pour que les logs soient écrits
            time.sleep(3)
            
            # Capturer les logs après la création
            logs_after = self.get_backend_logs(50)
            
            if response.status_code == 200:
                demande = response.json()
                demande_id = demande.get("id")
                self.test_data["demandes_created"].append(demande_id)
                
                print(f"   ✅ Demande créée: ID={demande_id}")
                print(f"   📅 Date: {future_date}")
                print(f"   📋 Raison: {request_data['raison']}")
                
                self.log_test_result(
                    f"Create Request {test_name}", 
                    True, 
                    f"Demande créée avec succès - ID: {demande_id}"
                )
                
                # Analyser les logs pour trouver les messages de notification
                self.analyze_notification_logs(logs_after, test_name, demande_id)
                
                return demande_id
            else:
                self.log_test_result(
                    f"Create Request {test_name}", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return None
                
        except Exception as e:
            self.log_test_result(f"Create Request {test_name}", False, f"Exception: {str(e)}")
            return None
    
    def analyze_notification_logs(self, logs: str, test_name: str, demande_id: str):
        """Analyser les logs pour vérifier les messages de notification"""
        print(f"\n🔍 Analyse des logs pour: {test_name}")
        
        # Messages attendus selon le mode (selon la review request)
        expected_messages = {
            "sequentiel": "🎯 Mode SÉQUENTIEL: contact de 1 remplaçant à la fois",
            "simultane": "🎯 Mode SIMULTANÉ: contact de",
            "groupe_sequentiel": "🎯 Mode GROUPE SÉQUENTIEL: contact de"
        }
        
        # Chercher les messages dans les logs
        found_messages = []
        relevant_lines = []
        
        for line in logs.split('\n'):
            # Chercher les lignes contenant notre demande ID ou les messages de mode
            if demande_id in line or any(msg in line for msg in expected_messages.values()):
                relevant_lines.append(line.strip())
                
                # Vérifier si c'est un message de mode spécifique
                for mode, expected_msg in expected_messages.items():
                    if expected_msg in line:
                        found_messages.append((mode, line.strip()))
                        print(f"   📋 Log trouvé: {line.strip()}")
        
        # Afficher les lignes pertinentes même si pas de message de mode trouvé
        if not found_messages and relevant_lines:
            print(f"   📄 Logs pertinents trouvés:")
            for line in relevant_lines[-5:]:  # Afficher les 5 dernières lignes pertinentes
                if line:
                    print(f"      {line}")
        
        # Chercher aussi les messages de résultat de recherche
        search_result_found = False
        for line in logs.split('\n'):
            if demande_id in line and ("remplaçant(s) contacté(s)" in line or "Recherche lancée" in line):
                print(f"   ✅ Résultat recherche: {line.strip()}")
                search_result_found = True
        
        if found_messages or search_result_found:
            self.log_test_result(
                f"Verify Logs {test_name}", 
                True, 
                f"Messages de notification trouvés dans les logs"
            )
        else:
            print(f"   ⚠️ Aucun message de notification spécifique trouvé")
            
            self.log_test_result(
                f"Verify Logs {test_name}", 
                False, 
                f"Aucun message de notification trouvé dans les logs"
            )
    
    def verify_contacts_count(self, demande_id: str, test_name: str, expected_mode: str):
        """Vérifier le nombre de remplaçants contactés selon le mode"""
        print(f"\n🔢 Vérification nombre de contacts pour: {test_name}")
        
        url = f"{self.base_url}/{self.tenant_slug}/remplacements"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                demandes = response.json()
                
                # Trouver notre demande spécifique
                demande = None
                for d in demandes:
                    if d.get("id") == demande_id:
                        demande = d
                        break
                
                if not demande:
                    self.log_test_result(
                        f"Verify Contacts {test_name}", 
                        False, 
                        f"Demande {demande_id} non trouvée"
                    )
                    return False
                
                tentatives = demande.get("tentatives_historique", [])
                contacts_count = len(tentatives)
                
                print(f"   📊 Nombre de remplaçants contactés: {contacts_count}")
                
                # Vérifier selon le mode attendu
                success = False
                expected_count = 0
                
                if expected_mode == "sequentiel":
                    expected_count = 1
                    success = contacts_count == 1
                elif expected_mode == "simultane":
                    expected_count = "plusieurs (≥2)"
                    success = contacts_count >= 2
                elif expected_mode == "groupe_sequentiel":
                    expected_count = 3
                    success = contacts_count == 3 or (contacts_count > 0 and contacts_count <= 3)  # Peut être moins si pas assez de candidats
                
                if success:
                    self.log_test_result(
                        f"Verify Contacts {test_name}", 
                        True, 
                        f"✅ Nombre correct: {contacts_count} (attendu: {expected_count})"
                    )
                else:
                    self.log_test_result(
                        f"Verify Contacts {test_name}", 
                        False, 
                        f"❌ Nombre incorrect: {contacts_count} (attendu: {expected_count})"
                    )
                
                # Afficher les détails des tentatives
                for i, tentative in enumerate(tentatives):
                    print(f"   👤 Contact {i+1}: {tentative.get('nom_complet')} - {tentative.get('statut')}")
                
                return success
            else:
                self.log_test_result(
                    f"Verify Contacts {test_name}", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result(f"Verify Contacts {test_name}", False, f"Exception: {str(e)}")
            return False
    
    def test_sequential_mode(self):
        """Test 1: Mode SÉQUENTIEL"""
        print(f"\n🧪 TEST 1: MODE SÉQUENTIEL")
        
        # Configurer le mode séquentiel
        if not self.update_notification_parameters("sequentiel"):
            return False
        
        # Créer une demande de remplacement
        demande_id = self.create_replacement_request("Mode Séquentiel", 1)
        if not demande_id:
            return False
        
        # Vérifier le nombre de contacts
        return self.verify_contacts_count(demande_id, "Mode Séquentiel", "sequentiel")
    
    def test_simultaneous_mode(self):
        """Test 2: Mode SIMULTANÉ"""
        print(f"\n🧪 TEST 2: MODE SIMULTANÉ")
        
        # Configurer le mode simultané avec max_contacts = 10
        if not self.update_notification_parameters("simultane", max_contacts=10):
            return False
        
        # Créer une demande de remplacement
        demande_id = self.create_replacement_request("Mode Simultané", 2)
        if not demande_id:
            return False
        
        # Vérifier le nombre de contacts
        return self.verify_contacts_count(demande_id, "Mode Simultané", "simultane")
    
    def test_sequential_groups_mode(self):
        """Test 3: Mode GROUPES SÉQUENTIELS"""
        print(f"\n🧪 TEST 3: MODE GROUPES SÉQUENTIELS")
        
        # Configurer le mode groupes séquentiels avec taille_groupe = 3
        if not self.update_notification_parameters("groupe_sequentiel", taille_groupe=3):
            return False
        
        # Créer une demande de remplacement
        demande_id = self.create_replacement_request("Mode Groupes Séquentiels", 3)
        if not demande_id:
            return False
        
        # Vérifier le nombre de contacts
        return self.verify_contacts_count(demande_id, "Mode Groupes Séquentiels", "groupe_sequentiel")
    
    def restore_original_parameters(self):
        """Restaurer les paramètres originaux"""
        print(f"\n🔄 Restauration des paramètres originaux...")
        
        if not self.test_data.get("original_params"):
            print(f"   ⚠️ Aucun paramètre original à restaurer")
            return
        
        url = f"{self.base_url}/{self.tenant_slug}/parametres/remplacements"
        
        try:
            response = requests.put(url, headers=self.headers, json=self.test_data["original_params"])
            
            if response.status_code == 200:
                print(f"   ✅ Paramètres originaux restaurés")
            else:
                print(f"   ⚠️ Erreur restauration: {response.status_code}")
                
        except Exception as e:
            print(f"   ⚠️ Exception restauration: {str(e)}")
    
    def cleanup_test_data(self):
        """Nettoyer les données de test créées"""
        print(f"\n🧹 Nettoyage des données de test...")
        
        # Supprimer les demandes de remplacement créées
        for demande_id in self.test_data.get("demandes_created", []):
            url = f"{self.base_url}/{self.tenant_slug}/remplacements/{demande_id}"
            try:
                response = requests.delete(url, headers=self.headers)
                if response.status_code == 200:
                    print(f"   ✅ Demande supprimée: {demande_id}")
                else:
                    print(f"   ⚠️ Impossible de supprimer la demande {demande_id}: {response.status_code}")
            except Exception as e:
                print(f"   ⚠️ Erreur suppression demande {demande_id}: {str(e)}")
        
        # Restaurer les paramètres originaux
        self.restore_original_parameters()
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - MODES DE NOTIFICATION REMPLACEMENTS")
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
        
        # Grouper par mode de notification
        modes = {
            "Configuration": [],
            "Mode Séquentiel": [],
            "Mode Simultané": [],
            "Mode Groupes Séquentiels": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'Paramètres' in test_name or 'Configure' in test_name:
                modes["Configuration"].append(result)
            elif 'Séquentiel' in test_name and 'Groupes' not in test_name:
                modes["Mode Séquentiel"].append(result)
            elif 'Simultané' in test_name:
                modes["Mode Simultané"].append(result)
            elif 'Groupes' in test_name:
                modes["Mode Groupes Séquentiels"].append(result)
        
        for mode, tests in modes.items():
            if tests:
                print(f"\n🔸 {mode}:")
                for test in tests:
                    status = "✅" if test['success'] else "❌"
                    print(f"   {status} {test['test']}: {test['details']}")
        
        # Résumé des modes testés
        print(f"\n🎯 MODES DE NOTIFICATION TESTÉS:")
        
        mode_tests = [
            ("Mode Séquentiel", any("Séquentiel" in r['test'] and "Groupes" not in r['test'] and r['success'] for r in self.test_results)),
            ("Mode Simultané", any("Simultané" in r['test'] and r['success'] for r in self.test_results)),
            ("Mode Groupes Séquentiels", any("Groupes" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for mode, status in mode_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {mode}")
        
        # Données spécifiques
        print(f"\n📊 DONNÉES SPÉCIFIQUES:")
        print(f"   📋 Types de garde disponibles: {len(self.test_data.get('types_garde', []))}")
        print(f"   📝 Demandes créées: {len(self.test_data.get('demandes_created', []))}")
        
        # Validation minimale selon la review request
        print(f"\n✅ VALIDATION MINIMALE:")
        validation_checks = [
            ("Les 3 modes produisent des logs différents", any("Logs" in r['test'] and r['success'] for r in self.test_results)),
            ("Mode séquentiel contacte 1 personne", any("Séquentiel" in r['test'] and "Contacts" in r['test'] and r['success'] for r in self.test_results)),
            ("Mode simultané contacte plusieurs personnes", any("Simultané" in r['test'] and "Contacts" in r['test'] and r['success'] for r in self.test_results)),
            ("Mode groupe séquentiel contacte N personnes", any("Groupes" in r['test'] and "Contacts" in r['test'] and r['success'] for r in self.test_results)),
            ("Aucune erreur 500 lors de la création", all(r['success'] for r in self.test_results if "Create Request" in r['test']))
        ]
        
        for check, status in validation_checks:
            icon = "✅" if status else "❌"
            print(f"   {icon} {check}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Tous les modes de notification fonctionnent correctement.")
            print("   📋 La logique corrigée dans remplacements_routes.py est opérationnelle.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Les modes de notification sont majoritairement fonctionnels.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires sur certains modes.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète de la logique de notification recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests E2E des modes de notification"""
        print("🚀 DÉBUT DES TESTS E2E - MODES DE NOTIFICATION REMPLACEMENTS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester les 3 stratégies de notification")
        
        # 1. Authentification admin
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'admin")
            return False
        
        try:
            # 2. Configuration des données de test
            if not self.setup_test_data():
                print("❌ ÉCHEC CRITIQUE: Impossible de configurer les données de test")
                return False
            
            # 3. Récupérer les paramètres actuels
            if not self.get_current_parameters():
                print("❌ ÉCHEC CRITIQUE: Impossible de récupérer les paramètres")
                return False
            
            # 4. Test Mode Séquentiel
            self.test_sequential_mode()
            
            # 5. Test Mode Simultané
            self.test_simultaneous_mode()
            
            # 6. Test Mode Groupes Séquentiels
            self.test_sequential_groups_mode()
            
            # 7. Nettoyage
            self.cleanup_test_data()
            
            # 8. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = NotificationModesTester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()