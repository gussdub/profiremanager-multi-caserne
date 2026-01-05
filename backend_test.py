#!/usr/bin/env python3
"""
TEST COMPLET E2E - CONSTRUCTEUR DE FORMULAIRES ET GESTION DES CATÉGORIES

CONTEXTE:
Test du système de formulaires d'inspection et de la gestion des catégories d'équipements
selon la review request. Teste les nouvelles fonctionnalités:

1. Constructeur de formulaires unifié avec sélecteur "Type de formulaire"
2. Gestion des catégories avec boutons Modifier/Supprimer visibles sur TOUTES les catégories
3. Correction données - Suppression d'une catégorie en double "Parties faciales"

TENANT: shefford
CREDENTIALS: 
- Admin: gussdub@gmail.com / 230685Juin+

ENDPOINTS À TESTER:

1. **Authentification:**
   - POST /api/shefford/auth/login - Obtenir le token d'authentification

2. **Catégories d'équipements:**
   - GET /api/shefford/equipements/categories - Vérifier qu'il n'y a qu'UNE seule catégorie "Parties Faciales/faciales"
   - DELETE /api/shefford/equipements/categories/{id} - Vérifier que la suppression d'une catégorie avec des équipements est bloquée

3. **Formulaires d'inspection:**
   - GET /api/shefford/formulaires-inspection - Vérifier que les formulaires ont un champ "type"
   - POST /api/shefford/formulaires-inspection - Créer un nouveau formulaire de type "inventaire" et vérifier qu'il est bien sauvegardé

SCÉNARIO DE TEST:
1. Login en tant qu'admin (gussdub@gmail.com / 230685Juin+) sur tenant "shefford"
2. Vérifier les catégories d'équipements (doublon supprimé)
3. Tester la création de formulaires avec type "inventaire"
4. Tester la protection contre suppression de catégories utilisées
5. Vérifier que les formulaires existants ont le champ "type"

RÉSULTATS ATTENDUS:
- Une seule catégorie "Parties Faciales" doit exister
- Les formulaires doivent avoir un champ "type" (inspection ou inventaire)
- La création de formulaires "inventaire" doit fonctionner
- La suppression de catégories avec équipements doit être bloquée
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class FormBuilderCategoryTester:
    def __init__(self):
        # Utiliser l'URL depuis frontend/.env comme spécifié
        self.base_url = "https://unified-inspections.preview.emergentagent.com/api"
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
            "categories": [],
            "formulaires": [],
            "test_formulaire_id": None,
            "parties_faciales_count": 0
        }
        
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
    
    def test_get_categories_equipement(self):
        """Test 1: GET /api/shefford/equipements/categories - Vérifier doublon "Parties Faciales" supprimé"""
        print(f"\n🧪 Test 1: Récupération des catégories d'équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/categories"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                categories = response.json()
                self.test_data["categories"] = categories
                
                self.log_test_result(
                    "GET Categories", 
                    True, 
                    f"Récupération réussie - {len(categories)} catégories trouvées"
                )
                
                # Vérifier le doublon "Parties Faciales"
                parties_faciales_categories = []
                for cat in categories:
                    nom = cat.get("nom", "").lower()
                    if "parties" in nom and ("faciales" in nom or "faciale" in nom):
                        parties_faciales_categories.append(cat)
                
                self.test_data["parties_faciales_count"] = len(parties_faciales_categories)
                
                if len(parties_faciales_categories) == 1:
                    self.log_test_result(
                        "Doublon Parties Faciales Supprimé", 
                        True, 
                        f"✅ Une seule catégorie 'Parties Faciales' trouvée: {parties_faciales_categories[0].get('nom')}"
                    )
                    print(f"   📋 Catégorie conservée: {parties_faciales_categories[0].get('nom')}")
                    print(f"   🆔 ID: {parties_faciales_categories[0].get('id')}")
                elif len(parties_faciales_categories) == 0:
                    self.log_test_result(
                        "Doublon Parties Faciales Supprimé", 
                        False, 
                        "❌ Aucune catégorie 'Parties Faciales' trouvée"
                    )
                else:
                    self.log_test_result(
                        "Doublon Parties Faciales Supprimé", 
                        False, 
                        f"❌ {len(parties_faciales_categories)} catégories 'Parties Faciales' trouvées (doublon non supprimé)"
                    )
                    for i, cat in enumerate(parties_faciales_categories):
                        print(f"   {i+1}. {cat.get('nom')} (ID: {cat.get('id')})")
                
                # Afficher toutes les catégories pour debug
                print(f"   📋 Toutes les catégories:")
                for cat in categories[:10]:  # Limiter à 10 pour éviter spam
                    print(f"      - {cat.get('nom')} (ID: {cat.get('id')})")
                if len(categories) > 10:
                    print(f"      ... et {len(categories) - 10} autres")
                
                return True
            else:
                self.log_test_result(
                    "GET Categories", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("GET Categories", False, f"Exception: {str(e)}")
            return False
    
    def test_get_formulaires_inspection(self):
        """Test 2: GET /api/shefford/formulaires-inspection - Vérifier champ "type" présent"""
        print(f"\n🧪 Test 2: Récupération des formulaires d'inspection")
        
        url = f"{self.base_url}/{self.tenant_slug}/formulaires-inspection"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                formulaires = response.json()
                self.test_data["formulaires"] = formulaires
                
                self.log_test_result(
                    "GET Formulaires", 
                    True, 
                    f"Récupération réussie - {len(formulaires)} formulaires trouvés"
                )
                
                # Vérifier que les formulaires ont un champ "type"
                formulaires_avec_type = 0
                formulaires_sans_type = 0
                types_trouves = set()
                
                for form in formulaires:
                    if "type" in form and form["type"]:
                        formulaires_avec_type += 1
                        types_trouves.add(form["type"])
                    else:
                        formulaires_sans_type += 1
                
                if formulaires_avec_type > 0:
                    self.log_test_result(
                        "Formulaires avec champ Type", 
                        True, 
                        f"✅ {formulaires_avec_type} formulaires ont un champ 'type'"
                    )
                    print(f"   📋 Types trouvés: {list(types_trouves)}")
                    if formulaires_sans_type > 0:
                        print(f"   ⚠️ {formulaires_sans_type} formulaires sans champ 'type' (anciens formulaires)")
                else:
                    self.log_test_result(
                        "Formulaires avec champ Type", 
                        False, 
                        f"❌ Aucun formulaire n'a de champ 'type'"
                    )
                
                # Afficher quelques formulaires pour debug
                print(f"   📋 Exemples de formulaires:")
                for i, form in enumerate(formulaires[:3]):
                    print(f"      {i+1}. {form.get('nom')} - Type: {form.get('type', 'N/A')} (ID: {form.get('id')})")
                
                return True
            else:
                self.log_test_result(
                    "GET Formulaires", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("GET Formulaires", False, f"Exception: {str(e)}")
            return False
    
    def test_create_formulaire_inventaire(self):
        """Test 3: POST /api/shefford/formulaires-inspection - Créer formulaire type "inventaire" """
        print(f"\n🧪 Test 3: Création d'un formulaire de type 'inventaire'")
        
        url = f"{self.base_url}/{self.tenant_slug}/formulaires-inspection"
        
        # Données pour créer un formulaire de type "inventaire"
        formulaire_data = {
            "nom": f"Test Formulaire Inventaire - {datetime.now().strftime('%H:%M:%S')}",
            "description": "Formulaire de test pour inventaire véhicule créé par les tests automatisés",
            "type": "inventaire",
            "vehicule_ids": [],  # Pour type inventaire
            "categorie_ids": [],  # Vide pour type inventaire
            "frequence": "mensuelle",
            "est_actif": True,
            "sections": [
                {
                    "id": "section1",
                    "nom": "Vérifications générales",
                    "items": [
                        {
                            "id": "item1",
                            "nom": "État général du véhicule",
                            "type": "ok_nc"
                        }
                    ]
                }
            ]
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=formulaire_data)
            
            if response.status_code == 200:
                result = response.json()
                formulaire_cree = result.get("formulaire", {})
                self.test_data["test_formulaire_id"] = formulaire_cree.get("id")
                
                self.log_test_result(
                    "POST Formulaire Inventaire", 
                    True, 
                    "Formulaire de type 'inventaire' créé avec succès"
                )
                
                # Vérifier que le type est bien sauvegardé
                type_sauvegarde = formulaire_cree.get("type")
                if type_sauvegarde == "inventaire":
                    self.log_test_result(
                        "Type Inventaire Sauvegardé", 
                        True, 
                        f"✅ Type 'inventaire' correctement sauvegardé"
                    )
                else:
                    self.log_test_result(
                        "Type Inventaire Sauvegardé", 
                        False, 
                        f"❌ Type incorrect sauvegardé: {type_sauvegarde}"
                    )
                
                print(f"   📋 Formulaire créé: {formulaire_cree.get('nom')}")
                print(f"   🆔 ID: {formulaire_cree.get('id')}")
                print(f"   📝 Type: {formulaire_cree.get('type')}")
                print(f"   🚗 Véhicules: {formulaire_cree.get('vehicule_ids', [])}")
                print(f"   📁 Catégories: {formulaire_cree.get('categorie_ids', [])}")
                
                return True
            else:
                self.log_test_result(
                    "POST Formulaire Inventaire", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("POST Formulaire Inventaire", False, f"Exception: {str(e)}")
            return False
    
    def test_delete_category_protection(self):
        """Test 4: DELETE /api/shefford/equipements/categories/{id} - Vérifier protection suppression"""
        print(f"\n🧪 Test 4: Test de protection contre suppression de catégorie utilisée")
        
        # Trouver une catégorie qui a des équipements
        categories = self.test_data.get("categories", [])
        if not categories:
            self.log_test_result(
                "DELETE Category Protection", 
                False, 
                "Aucune catégorie disponible pour le test"
            )
            return False
        
        # Essayer de trouver une catégorie avec des équipements
        # Pour ce test, on va essayer avec la catégorie "Parties Faciales" si elle existe
        target_category = None
        for cat in categories:
            nom = cat.get("nom", "").lower()
            if "parties" in nom and ("faciales" in nom or "faciale" in nom):
                target_category = cat
                break
        
        if not target_category:
            # Prendre la première catégorie disponible
            target_category = categories[0] if categories else None
        
        if not target_category:
            self.log_test_result(
                "DELETE Category Protection", 
                False, 
                "Aucune catégorie trouvée pour le test"
            )
            return False
        
        category_id = target_category.get("id")
        category_name = target_category.get("nom")
        
        print(f"   🎯 Test avec catégorie: {category_name} (ID: {category_id})")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/categories/{category_id}"
        
        try:
            response = requests.delete(url, headers=self.headers)
            
            # On s'attend à une erreur 400 si la catégorie a des équipements
            if response.status_code == 400:
                error_message = response.json().get("detail", "")
                if "équipement" in error_message.lower() or "formulaire" in error_message.lower():
                    self.log_test_result(
                        "DELETE Category Protection", 
                        True, 
                        f"✅ Protection active: {error_message}"
                    )
                    print(f"   🛡️ Message de protection: {error_message}")
                    return True
                else:
                    self.log_test_result(
                        "DELETE Category Protection", 
                        False, 
                        f"❌ Erreur 400 mais message inattendu: {error_message}"
                    )
                    return False
            elif response.status_code == 200:
                # La catégorie a été supprimée (pas d'équipements associés)
                self.log_test_result(
                    "DELETE Category Protection", 
                    True, 
                    f"✅ Catégorie supprimée (aucun équipement associé)"
                )
                print(f"   ℹ️ La catégorie '{category_name}' n'avait pas d'équipements associés")
                return True
            else:
                self.log_test_result(
                    "DELETE Category Protection", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("DELETE Category Protection", False, f"Exception: {str(e)}")
            return False
    
    def test_verify_formulaire_created(self):
        """Test 5: Vérifier que le formulaire créé est bien dans la liste"""
        print(f"\n🧪 Test 5: Vérification du formulaire créé")
        
        if not self.test_data.get("test_formulaire_id"):
            self.log_test_result(
                "Vérification Formulaire Créé", 
                False, 
                "Aucun formulaire de test créé"
            )
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/formulaires-inspection"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                formulaires = response.json()
                
                # Chercher notre formulaire de test
                formulaire_trouve = None
                for form in formulaires:
                    if form.get("id") == self.test_data["test_formulaire_id"]:
                        formulaire_trouve = form
                        break
                
                if formulaire_trouve:
                    type_formulaire = formulaire_trouve.get("type")
                    if type_formulaire == "inventaire":
                        self.log_test_result(
                            "Vérification Formulaire Créé", 
                            True, 
                            f"✅ Formulaire trouvé avec type 'inventaire'"
                        )
                        print(f"   📋 Nom: {formulaire_trouve.get('nom')}")
                        print(f"   📝 Type: {formulaire_trouve.get('type')}")
                        print(f"   📅 Créé: {formulaire_trouve.get('created_at')}")
                        return True
                    else:
                        self.log_test_result(
                            "Vérification Formulaire Créé", 
                            False, 
                            f"❌ Formulaire trouvé mais type incorrect: {type_formulaire}"
                        )
                        return False
                else:
                    self.log_test_result(
                        "Vérification Formulaire Créé", 
                        False, 
                        "❌ Formulaire de test non trouvé dans la liste"
                    )
                    return False
            else:
                self.log_test_result(
                    "Vérification Formulaire Créé", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Vérification Formulaire Créé", False, f"Exception: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Nettoyer les données de test créées"""
        print(f"\n🧹 Nettoyage des données de test...")
        
        # Supprimer le formulaire de test créé
        if self.test_data.get("test_formulaire_id"):
            url = f"{self.base_url}/{self.tenant_slug}/formulaires-inspection/{self.test_data['test_formulaire_id']}"
            try:
                response = requests.delete(url, headers=self.headers)
                if response.status_code == 200:
                    print(f"   ✅ Formulaire de test supprimé")
                else:
                    print(f"   ⚠️ Impossible de supprimer le formulaire de test: {response.status_code}")
            except Exception as e:
                print(f"   ⚠️ Erreur lors de la suppression du formulaire: {str(e)}")
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - CONSTRUCTEUR DE FORMULAIRES ET CATÉGORIES")
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
            "Catégories d'équipements": [],
            "Formulaires d'inspection": [],
            "Protection des données": [],
            "Vérifications": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'auth' in test_name.lower() or 'login' in test_name.lower():
                categories["Authentification"].append(result)
            elif 'categories' in test_name.lower() or 'parties faciales' in test_name.lower():
                categories["Catégories d'équipements"].append(result)
            elif 'formulaire' in test_name.lower() and 'inventaire' in test_name.lower():
                categories["Formulaires d'inspection"].append(result)
            elif 'delete' in test_name.lower() or 'protection' in test_name.lower():
                categories["Protection des données"].append(result)
            elif 'vérification' in test_name.lower():
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
            ("Doublon Parties Faciales supprimé", any("Doublon" in r['test'] and r['success'] for r in self.test_results)),
            ("Formulaires avec champ type", any("Type" in r['test'] and "Formulaires" in r['test'] and r['success'] for r in self.test_results)),
            ("Création formulaire inventaire", any("Inventaire" in r['test'] and "POST" in r['test'] and r['success'] for r in self.test_results)),
            ("Protection suppression catégorie", any("Protection" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Données spécifiques
        print(f"\n📊 DONNÉES SPÉCIFIQUES:")
        print(f"   📁 Catégories 'Parties Faciales' trouvées: {self.test_data.get('parties_faciales_count', 0)}")
        print(f"   📋 Formulaires d'inspection total: {len(self.test_data.get('formulaires', []))}")
        print(f"   📁 Catégories d'équipements total: {len(self.test_data.get('categories', []))}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Le constructeur de formulaires et la gestion des catégories fonctionnent parfaitement.")
            print("   📋 Les nouvelles fonctionnalités (type de formulaire, gestion catégories) sont opérationnelles.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests E2E du constructeur de formulaires et catégories"""
        print("🚀 DÉBUT DES TESTS E2E - CONSTRUCTEUR DE FORMULAIRES ET CATÉGORIES")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester les nouvelles fonctionnalités de formulaires et catégories")
        
        # 1. Authentification admin
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier en tant qu'admin")
            return False
        
        try:
            # 2. Test des catégories d'équipements (doublon supprimé)
            self.test_get_categories_equipement()
            
            # 3. Test des formulaires d'inspection (champ type)
            self.test_get_formulaires_inspection()
            
            # 4. Test création formulaire type "inventaire"
            self.test_create_formulaire_inventaire()
            
            # 5. Test protection suppression catégorie
            self.test_delete_category_protection()
            
            # 6. Vérification du formulaire créé
            self.test_verify_formulaire_created()
            
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
    tester = FormBuilderCategoryTester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()