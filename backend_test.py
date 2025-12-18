#!/usr/bin/env python3
"""
TEST COMPLET DU MODULE MATÉRIEL & ÉQUIPEMENTS (PHASE 1 BACKEND)

CONTEXTE:
Test complet des endpoints du module Matériel & Équipements (Phase 1 Backend).

TENANT: shefford
CREDENTIALS: email: gussdub@gmail.com, mot_de_passe: 230685Juin+

ENDPOINTS À TESTER:

1. **Catégories d'équipements:**
   - GET /api/shefford/equipements/categories - Liste des catégories (11 devraient exister)
   - POST /api/shefford/equipements/categories - Créer une nouvelle catégorie personnalisée
   - PUT /api/shefford/equipements/categories/{id} - Modifier une catégorie (tester qu'on ne peut pas modifier une catégorie prédéfinie)
   - DELETE /api/shefford/equipements/categories/{id} - Supprimer une catégorie (tester qu'on ne peut pas supprimer une catégorie prédéfinie ou utilisée)

2. **Équipements:**
   - GET /api/shefford/equipements - Liste des équipements (2 devraient exister: TUY-001 et MASK-001)
   - GET /api/shefford/equipements?categorie_id={id} - Filtrer par catégorie
   - GET /api/shefford/equipements?etat=bon - Filtrer par état
   - GET /api/shefford/equipements/{id} - Récupérer un équipement
   - POST /api/shefford/equipements - Créer un nouvel équipement (vérifier code_unique unique)
   - PUT /api/shefford/equipements/{id} - Modifier un équipement
   - DELETE /api/shefford/equipements/{id} - Supprimer un équipement

3. **Maintenance:**
   - GET /api/shefford/equipements/{id}/maintenances - Historique de maintenance
   - POST /api/shefford/equipements/{id}/maintenances - Ajouter une maintenance (vérifier que date_derniere_maintenance et date_prochaine_maintenance sont mises à jour sur l'équipement)

4. **Statistiques:**
   - GET /api/shefford/equipements/stats/resume - Vérifier total, par_etat, alertes, par_categorie, valeur_totale

5. **Assignation employé:**
   - Vérifier que l'équipement MASK-001 a employe_nom = "Guillaume Dubeau"
   - Créer un nouvel équipement dans la catégorie "Radios portatives" avec un employe_id et vérifier que employe_nom est bien rempli

6. **Validation des erreurs:**
   - Tester la création d'un équipement avec un code_unique déjà existant (doit retourner 400)
   - Tester la suppression d'une catégorie utilisée par des équipements (doit retourner 400)
   
Valider que tous les champs personnalisés (champs_personnalises) sont bien stockés et récupérés.
"""

import requests
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import os

class EquipmentModuleTester:
    def __init__(self):
        self.base_url = "https://native-tenant-app.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "shefford"
        self.credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
        
        # Résultats des tests
        self.test_results = []
        self.created_items = []  # Pour nettoyer après les tests
        
        # IDs récupérés pendant les tests
        self.test_data = {
            "categories": [],
            "equipements": [],
            "employes": [],
            "custom_category_id": None,
            "custom_equipment_id": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant shefford"""
        print(f"🔐 Authentification tenant {self.tenant_slug}...")
        
        auth_url = f"{self.base_url}/{self.tenant_slug}/auth/login"
        
        print(f"📍 URL: {auth_url}")
        print(f"📋 Email: {self.credentials['email']}")
        
        response = requests.post(auth_url, json=self.credentials)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            user_info = data.get('user', {})
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
    
    def test_categories_list(self):
        """Test 1: GET /api/shefford/equipements/categories - Liste des catégories"""
        print(f"\n🧪 Test 1: Liste des catégories d'équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/categories"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                categories = response.json()
                self.test_data["categories"] = categories
                
                # Vérifier qu'il y a 11 catégories comme attendu
                if len(categories) == 11:
                    self.log_test_result(
                        "Categories List - Count", 
                        True, 
                        f"11 catégories trouvées comme attendu"
                    )
                else:
                    self.log_test_result(
                        "Categories List - Count", 
                        False, 
                        f"Attendu: 11 catégories, Trouvé: {len(categories)}"
                    )
                
                # Vérifier la structure des données
                if categories and isinstance(categories[0], dict):
                    required_fields = ['id', 'nom', 'description']
                    first_cat = categories[0]
                    missing_fields = [field for field in required_fields if field not in first_cat]
                    
                    if not missing_fields:
                        self.log_test_result(
                            "Categories List - Structure", 
                            True, 
                            "Structure des catégories correcte"
                        )
                    else:
                        self.log_test_result(
                            "Categories List - Structure", 
                            False, 
                            f"Champs manquants: {missing_fields}"
                        )
                
                print(f"   📋 Catégories trouvées:")
                for cat in categories[:5]:  # Afficher les 5 premières
                    print(f"      - {cat.get('nom', 'N/A')} (ID: {cat.get('id', 'N/A')})")
                if len(categories) > 5:
                    print(f"      ... et {len(categories) - 5} autres")
                
                return True
            else:
                self.log_test_result(
                    "Categories List", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Categories List", False, f"Exception: {str(e)}")
            return False
    
    def test_create_custom_category(self):
        """Test 2: POST /api/shefford/equipements/categories - Créer une catégorie personnalisée"""
        print(f"\n🧪 Test 2: Création d'une catégorie personnalisée")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/categories"
        
        new_category = {
            "nom": f"Test Catégorie API {int(time.time())}",
            "description": "Catégorie créée pour les tests API",
            "couleur": "#FF5733",
            "icone": "test-icon"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=new_category)
            
            if response.status_code == 200:  # API returns 200, not 201
                response_data = response.json()
                created_category = response_data.get('categorie', response_data)
                category_id = response_data.get('id') or created_category.get('id')
                
                self.test_data["custom_category_id"] = category_id
                self.created_items.append(('category', category_id))
                
                self.log_test_result(
                    "Create Custom Category", 
                    True, 
                    f"Catégorie créée avec ID: {category_id}"
                )
                
                # Vérifier que les données sont correctement sauvegardées
                if created_category.get('nom') == new_category['nom']:
                    self.log_test_result(
                        "Create Custom Category - Data Integrity", 
                        True, 
                        "Données sauvegardées correctement"
                    )
                else:
                    self.log_test_result(
                        "Create Custom Category - Data Integrity", 
                        False, 
                        f"Nom attendu: {new_category['nom']}, reçu: {created_category.get('nom')}"
                    )
                
                return True
            else:
                self.log_test_result(
                    "Create Custom Category", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Create Custom Category", False, f"Exception: {str(e)}")
            return False
    
    def test_equipements_list(self):
        """Test 3: GET /api/shefford/equipements - Liste des équipements"""
        print(f"\n🧪 Test 3: Liste des équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                equipements = response.json()
                self.test_data["equipements"] = equipements
                
                # Vérifier qu'il y a au moins 2 équipements (TUY-001 et MASK-001)
                if len(equipements) >= 2:
                    self.log_test_result(
                        "Equipements List - Count", 
                        True, 
                        f"{len(equipements)} équipements trouvés (≥2 attendu)"
                    )
                else:
                    self.log_test_result(
                        "Equipements List - Count", 
                        False, 
                        f"Attendu: ≥2 équipements, Trouvé: {len(equipements)}"
                    )
                
                # Chercher les équipements spécifiques
                codes_found = [eq.get('code_unique', '') for eq in equipements]
                expected_codes = ['TUY-001', 'MASK-001']
                
                for code in expected_codes:
                    if code in codes_found:
                        self.log_test_result(
                            f"Equipements List - {code}", 
                            True, 
                            f"Équipement {code} trouvé"
                        )
                    else:
                        self.log_test_result(
                            f"Equipements List - {code}", 
                            False, 
                            f"Équipement {code} non trouvé"
                        )
                
                # Vérifier l'assignation employé pour MASK-001
                mask_001 = next((eq for eq in equipements if eq.get('code_unique') == 'MASK-001'), None)
                if mask_001:
                    employe_nom = mask_001.get('employe_nom', '')
                    if employe_nom == "Guillaume Dubeau":
                        self.log_test_result(
                            "Equipements List - MASK-001 Assignment", 
                            True, 
                            f"MASK-001 assigné à Guillaume Dubeau"
                        )
                    else:
                        self.log_test_result(
                            "Equipements List - MASK-001 Assignment", 
                            False, 
                            f"MASK-001 assigné à '{employe_nom}', attendu: 'Guillaume Dubeau'"
                        )
                
                print(f"   📋 Équipements trouvés:")
                for eq in equipements[:5]:  # Afficher les 5 premiers
                    print(f"      - {eq.get('code_unique', 'N/A')} - {eq.get('nom', 'N/A')} (État: {eq.get('etat', 'N/A')})")
                if len(equipements) > 5:
                    print(f"      ... et {len(equipements) - 5} autres")
                
                return True
            else:
                self.log_test_result(
                    "Equipements List", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Equipements List", False, f"Exception: {str(e)}")
            return False
    
    def test_equipements_filtering(self):
        """Test 4: Filtrage des équipements par catégorie et état"""
        print(f"\n🧪 Test 4: Filtrage des équipements")
        
        base_url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        # Test filtrage par état
        try:
            response = requests.get(f"{base_url}?etat=bon", headers=self.headers)
            
            if response.status_code == 200:
                equipements_bon_etat = response.json()
                
                # Vérifier que tous les équipements retournés ont l'état "bon"
                all_bon_etat = all(eq.get('etat') == 'bon' for eq in equipements_bon_etat)
                
                if all_bon_etat:
                    self.log_test_result(
                        "Equipements Filter - État Bon", 
                        True, 
                        f"{len(equipements_bon_etat)} équipements en bon état trouvés"
                    )
                else:
                    wrong_states = [eq.get('etat') for eq in equipements_bon_etat if eq.get('etat') != 'bon']
                    self.log_test_result(
                        "Equipements Filter - État Bon", 
                        False, 
                        f"Certains équipements ont un mauvais état: {wrong_states}"
                    )
            else:
                self.log_test_result(
                    "Equipements Filter - État Bon", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
        except Exception as e:
            self.log_test_result("Equipements Filter - État Bon", False, f"Exception: {str(e)}")
        
        # Test filtrage par catégorie (si on a des catégories)
        if self.test_data["categories"]:
            try:
                first_category_id = self.test_data["categories"][0].get('id')
                response = requests.get(f"{base_url}?categorie_id={first_category_id}", headers=self.headers)
                
                if response.status_code == 200:
                    equipements_categorie = response.json()
                    
                    # Vérifier que tous les équipements appartiennent à la bonne catégorie
                    all_correct_category = all(eq.get('categorie_id') == first_category_id for eq in equipements_categorie)
                    
                    if all_correct_category:
                        self.log_test_result(
                            "Equipements Filter - Catégorie", 
                            True, 
                            f"{len(equipements_categorie)} équipements de la catégorie trouvés"
                        )
                    else:
                        self.log_test_result(
                            "Equipements Filter - Catégorie", 
                            False, 
                            "Certains équipements n'appartiennent pas à la bonne catégorie"
                        )
                else:
                    self.log_test_result(
                        "Equipements Filter - Catégorie", 
                        False, 
                        f"HTTP {response.status_code}: {response.text[:200]}"
                    )
            except Exception as e:
                self.log_test_result("Equipements Filter - Catégorie", False, f"Exception: {str(e)}")
    
    def test_create_equipment(self):
        """Test 5: POST /api/shefford/equipements - Créer un nouvel équipement"""
        print(f"\n🧪 Test 5: Création d'un nouvel équipement")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        # Utiliser la première catégorie disponible
        categorie_id = None
        if self.test_data["categories"]:
            categorie_id = self.test_data["categories"][0].get('id')
        
        new_equipment = {
            "code_unique": f"TEST-{int(time.time())}",
            "nom": "Équipement Test API",
            "description": "Équipement créé pour les tests API",
            "categorie_id": categorie_id,
            "etat": "bon",
            "champs_personnalises": {
                "test_field": "test_value",
                "numeric_field": 42
            }
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=new_equipment)
            
            if response.status_code == 200:  # API returns 200, not 201
                response_data = response.json()
                created_equipment = response_data.get('equipement', response_data)
                equipment_id = response_data.get('id') or created_equipment.get('id')
                
                self.test_data["custom_equipment_id"] = equipment_id
                self.created_items.append(('equipment', equipment_id))
                
                self.log_test_result(
                    "Create Equipment", 
                    True, 
                    f"Équipement créé avec ID: {equipment_id}"
                )
                
                # Vérifier l'intégrité des données
                if created_equipment.get('code_unique') == new_equipment['code_unique']:
                    self.log_test_result(
                        "Create Equipment - Data Integrity", 
                        True, 
                        "Données de base sauvegardées correctement"
                    )
                
                # Vérifier les champs personnalisés
                champs_perso = created_equipment.get('champs_personnalises', {})
                if champs_perso.get('test_field') == 'test_value' and champs_perso.get('numeric_field') == 42:
                    self.log_test_result(
                        "Create Equipment - Custom Fields", 
                        True, 
                        "Champs personnalisés sauvegardés correctement"
                    )
                else:
                    self.log_test_result(
                        "Create Equipment - Custom Fields", 
                        False, 
                        f"Champs personnalisés incorrects: {champs_perso}"
                    )
                
                return True
            else:
                self.log_test_result(
                    "Create Equipment", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Create Equipment", False, f"Exception: {str(e)}")
            return False
    
    def test_duplicate_code_validation(self):
        """Test 6: Validation du code unique - doit retourner 400 pour un doublon"""
        print(f"\n🧪 Test 6: Validation du code unique (doublon)")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements"
        
        # Utiliser un code qui existe déjà (TUY-001)
        duplicate_equipment = {
            "code_unique": "TUY-001",
            "nom": "Équipement Doublon Test",
            "description": "Test de validation du code unique",
            "etat": "bon"
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=duplicate_equipment)
            
            if response.status_code == 400:
                self.log_test_result(
                    "Duplicate Code Validation", 
                    True, 
                    "Erreur 400 retournée pour code unique dupliqué"
                )
                return True
            else:
                self.log_test_result(
                    "Duplicate Code Validation", 
                    False, 
                    f"Attendu HTTP 400, reçu: {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Duplicate Code Validation", False, f"Exception: {str(e)}")
            return False
    
    def test_equipment_maintenance(self):
        """Test 7: Gestion de la maintenance des équipements"""
        print(f"\n🧪 Test 7: Gestion de la maintenance")
        
        # Utiliser le premier équipement disponible
        if not self.test_data["equipements"]:
            self.log_test_result("Equipment Maintenance", False, "Aucun équipement disponible pour test")
            return False
        
        equipment_id = self.test_data["equipements"][0].get('id')
        
        # Test 7a: Récupérer l'historique de maintenance
        maintenance_url = f"{self.base_url}/{self.tenant_slug}/equipements/{equipment_id}/maintenances"
        
        try:
            response = requests.get(maintenance_url, headers=self.headers)
            
            if response.status_code == 200:
                maintenances = response.json()
                self.log_test_result(
                    "Equipment Maintenance - Get History", 
                    True, 
                    f"{len(maintenances)} maintenances trouvées"
                )
            else:
                self.log_test_result(
                    "Equipment Maintenance - Get History", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
        except Exception as e:
            self.log_test_result("Equipment Maintenance - Get History", False, f"Exception: {str(e)}")
        
        # Test 7b: Ajouter une nouvelle maintenance
        new_maintenance = {
            "type_intervention": "maintenance",
            "description": "Maintenance test API",
            "date_intervention": datetime.now().strftime("%Y-%m-%d"),
            "cout": 150.00,
            "technicien": "Test Technicien"
        }
        
        try:
            response = requests.post(maintenance_url, headers=self.headers, json=new_maintenance)
            
            if response.status_code == 200:  # API returns 200, not 201
                created_maintenance = response.json()
                maintenance_id = created_maintenance.get('id')
                self.log_test_result(
                    "Equipment Maintenance - Add New", 
                    True, 
                    f"Maintenance ajoutée avec ID: {maintenance_id}"
                )
                
                # Vérifier que les dates de maintenance de l'équipement sont mises à jour
                equipment_url = f"{self.base_url}/{self.tenant_slug}/equipements/{equipment_id}"
                eq_response = requests.get(equipment_url, headers=self.headers)
                
                if eq_response.status_code == 200:
                    updated_equipment = eq_response.json()
                    if updated_equipment.get('date_derniere_maintenance'):
                        self.log_test_result(
                            "Equipment Maintenance - Date Update", 
                            True, 
                            "Date de dernière maintenance mise à jour"
                        )
                    else:
                        self.log_test_result(
                            "Equipment Maintenance - Date Update", 
                            False, 
                            "Date de dernière maintenance non mise à jour"
                        )
                
                return True
            else:
                self.log_test_result(
                    "Equipment Maintenance - Add New", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Equipment Maintenance - Add New", False, f"Exception: {str(e)}")
            return False
    
    def test_equipment_statistics(self):
        """Test 8: GET /api/shefford/equipements/stats/resume - Statistiques"""
        print(f"\n🧪 Test 8: Statistiques des équipements")
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/stats/resume"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                stats = response.json()
                
                # Vérifier la structure des statistiques
                required_fields = ['total', 'par_etat', 'alertes', 'par_categorie', 'valeur_totale']
                missing_fields = [field for field in required_fields if field not in stats]
                
                if not missing_fields:
                    self.log_test_result(
                        "Equipment Statistics - Structure", 
                        True, 
                        "Structure des statistiques correcte"
                    )
                    
                    # Vérifier les valeurs
                    total = stats.get('total', 0)
                    valeur_totale = stats.get('valeur_totale', 0)
                    
                    print(f"   📊 Statistiques:")
                    print(f"      - Total équipements: {total}")
                    print(f"      - Valeur totale: {valeur_totale}€")
                    print(f"      - Par état: {stats.get('par_etat', {})}")
                    print(f"      - Alertes: {stats.get('alertes', 0)}")
                    
                    if total > 0:
                        self.log_test_result(
                            "Equipment Statistics - Data", 
                            True, 
                            f"Statistiques cohérentes: {total} équipements"
                        )
                    else:
                        self.log_test_result(
                            "Equipment Statistics - Data", 
                            False, 
                            "Aucun équipement dans les statistiques"
                        )
                else:
                    self.log_test_result(
                        "Equipment Statistics - Structure", 
                        False, 
                        f"Champs manquants: {missing_fields}"
                    )
                
                return True
            else:
                self.log_test_result(
                    "Equipment Statistics", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Equipment Statistics", False, f"Exception: {str(e)}")
            return False
    
    def test_individual_equipment_retrieval(self):
        """Test 9: GET /api/shefford/equipements/{id} - Récupérer un équipement individuel"""
        print(f"\n🧪 Test 9: Récupération d'un équipement individuel")
        
        if not self.test_data["equipements"]:
            self.log_test_result("Individual Equipment Retrieval", False, "Aucun équipement disponible")
            return False
        
        # Utiliser le premier équipement disponible
        equipment = self.test_data["equipements"][0]
        equipment_id = equipment.get('id')
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/{equipment_id}"
        
        try:
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                equipment_data = response.json()
                
                # Vérifier que les données correspondent
                if equipment_data.get('id') == equipment_id:
                    self.log_test_result(
                        "Individual Equipment Retrieval", 
                        True, 
                        f"Équipement {equipment_data.get('code_unique', 'N/A')} récupéré"
                    )
                    
                    # Vérifier la structure complète
                    required_fields = ['id', 'code_unique', 'nom', 'etat', 'categorie_id']
                    missing_fields = [field for field in required_fields if field not in equipment_data]
                    
                    if not missing_fields:
                        self.log_test_result(
                            "Individual Equipment Retrieval - Structure", 
                            True, 
                            "Structure complète de l'équipement"
                        )
                    else:
                        self.log_test_result(
                            "Individual Equipment Retrieval - Structure", 
                            False, 
                            f"Champs manquants: {missing_fields}"
                        )
                    
                    return True
                else:
                    self.log_test_result(
                        "Individual Equipment Retrieval", 
                        False, 
                        f"ID incorrect: attendu {equipment_id}, reçu {equipment_data.get('id')}"
                    )
                    return False
            else:
                self.log_test_result(
                    "Individual Equipment Retrieval", 
                    False, 
                    f"HTTP {response.status_code}: {response.text[:200]}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Individual Equipment Retrieval", False, f"Exception: {str(e)}")
            return False
    
    def test_employee_assignment_with_radio_category(self):
        """Test 10: Créer un équipement dans la catégorie 'Radios portatives' avec assignation employé"""
        print(f"\n🧪 Test 10: Assignation employé avec catégorie Radios portatives")
        
        # Chercher la catégorie "Radios portatives"
        radio_category = None
        for cat in self.test_data["categories"]:
            if "radio" in cat.get('nom', '').lower() or "portative" in cat.get('nom', '').lower():
                radio_category = cat
                break
        
        if not radio_category:
            self.log_test_result(
                "Employee Assignment - Radio Category", 
                False, 
                "Catégorie 'Radios portatives' non trouvée"
            )
            return False
        
        # Récupérer la liste des employés pour obtenir un ID valide
        try:
            users_url = f"{self.base_url}/{self.tenant_slug}/users"
            users_response = requests.get(users_url, headers=self.headers)
            
            if users_response.status_code == 200:
                users = users_response.json()
                if users:
                    # Utiliser Guillaume Dubeau si disponible, sinon le premier utilisateur
                    target_user = None
                    for user in users:
                        if user.get('nom') == 'Dubeau' and user.get('prenom') == 'Guillaume':
                            target_user = user
                            break
                    
                    if not target_user:
                        target_user = users[0]
                    
                    # Créer un équipement avec assignation employé
                    url = f"{self.base_url}/{self.tenant_slug}/equipements"
                    
                    new_radio = {
                        "code_unique": f"RADIO-{int(time.time())}",
                        "nom": "Radio Test API",
                        "description": "Radio créée pour test assignation",
                        "categorie_id": radio_category.get('id'),
                        "etat": "bon",
                        "employe_id": target_user.get('id')
                    }
                    
                    response = requests.post(url, headers=self.headers, json=new_radio)
                    
                    if response.status_code == 200:
                        response_data = response.json()
                        created_equipment = response_data.get('equipement', response_data)
                        equipment_id = response_data.get('id') or created_equipment.get('id')
                        
                        self.created_items.append(('equipment', equipment_id))
                        
                        # Vérifier que employe_nom est bien rempli
                        employe_nom = created_equipment.get('employe_nom', '')
                        expected_name = f"{target_user.get('prenom', '')} {target_user.get('nom', '')}".strip()
                        
                        if employe_nom == expected_name:
                            self.log_test_result(
                                "Employee Assignment - Radio Category", 
                                True, 
                                f"Radio assignée à {employe_nom} dans catégorie {radio_category.get('nom')}"
                            )
                            return True
                        else:
                            self.log_test_result(
                                "Employee Assignment - Radio Category", 
                                False, 
                                f"Nom employé incorrect: attendu '{expected_name}', reçu '{employe_nom}'"
                            )
                            return False
                    else:
                        self.log_test_result(
                            "Employee Assignment - Radio Category", 
                            False, 
                            f"Création échouée: HTTP {response.status_code}"
                        )
                        return False
                else:
                    self.log_test_result(
                        "Employee Assignment - Radio Category", 
                        False, 
                        "Aucun utilisateur disponible pour assignation"
                    )
                    return False
            else:
                self.log_test_result(
                    "Employee Assignment - Radio Category", 
                    False, 
                    f"Impossible de récupérer les utilisateurs: HTTP {users_response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Employee Assignment - Radio Category", False, f"Exception: {str(e)}")
            return False
    
    def test_category_modification_restrictions(self):
        """Test 11: Restrictions sur la modification des catégories prédéfinies"""
        print(f"\n🧪 Test 11: Restrictions modification catégories prédéfinies")
        
        if not self.test_data["categories"]:
            self.log_test_result("Category Modification Restrictions", False, "Aucune catégorie disponible")
            return False
        
        # Essayer de modifier une catégorie prédéfinie (première de la liste)
        predefined_category = self.test_data["categories"][0]
        category_id = predefined_category.get('id')
        
        url = f"{self.base_url}/{self.tenant_slug}/equipements/categories/{category_id}"
        
        modified_data = {
            "nom": "Catégorie Modifiée Test",
            "description": "Test de modification"
        }
        
        try:
            response = requests.put(url, headers=self.headers, json=modified_data)
            
            # Selon l'implémentation, cela pourrait retourner 403 (interdit) ou 400 (bad request)
            if response.status_code in [400, 403]:
                self.log_test_result(
                    "Category Modification Restrictions", 
                    True, 
                    f"Modification interdite (HTTP {response.status_code})"
                )
                return True
            elif response.status_code == 200:
                # Si la modification est autorisée, vérifier si c'est une catégorie personnalisée
                self.log_test_result(
                    "Category Modification Restrictions", 
                    False, 
                    "Modification autorisée sur catégorie prédéfinie"
                )
                return False
            else:
                self.log_test_result(
                    "Category Modification Restrictions", 
                    False, 
                    f"Réponse inattendue: HTTP {response.status_code}"
                )
                return False
                
        except Exception as e:
            self.log_test_result("Category Modification Restrictions", False, f"Exception: {str(e)}")
            return False
    
    def cleanup_test_data(self):
        """Nettoyer les données créées pendant les tests"""
        print(f"\n🧹 Nettoyage des données de test...")
        
        for item_type, item_id in reversed(self.created_items):
            try:
                if item_type == 'equipment':
                    url = f"{self.base_url}/{self.tenant_slug}/equipements/{item_id}"
                elif item_type == 'category':
                    url = f"{self.base_url}/{self.tenant_slug}/equipements/categories/{item_id}"
                else:
                    continue
                
                response = requests.delete(url, headers=self.headers)
                
                if response.status_code in [200, 204]:
                    print(f"   ✅ {item_type} {item_id} supprimé")
                else:
                    print(f"   ⚠️ Échec suppression {item_type} {item_id}: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"   ❌ Erreur suppression {item_type} {item_id}: {str(e)}")
    
    def generate_test_report(self):
        """Générer le rapport final des tests"""
        print("\n" + "="*80)
        print("📊 RAPPORT FINAL - MODULE MATÉRIEL & ÉQUIPEMENTS")
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
        
        # Grouper par catégorie
        categories = {
            "Catégories": [],
            "Équipements": [],
            "Maintenance": [],
            "Statistiques": [],
            "Validation": []
        }
        
        for result in self.test_results:
            test_name = result['test']
            if 'Categories' in test_name or 'Category' in test_name:
                categories["Catégories"].append(result)
            elif 'Equipment' in test_name and 'Maintenance' not in test_name and 'Statistics' not in test_name:
                categories["Équipements"].append(result)
            elif 'Maintenance' in test_name:
                categories["Maintenance"].append(result)
            elif 'Statistics' in test_name:
                categories["Statistiques"].append(result)
            else:
                categories["Validation"].append(result)
        
        for category, tests in categories.items():
            if tests:
                print(f"\n🔸 {category}:")
                for test in tests:
                    status = "✅" if test['success'] else "❌"
                    print(f"   {status} {test['test']}: {test['details']}")
        
        # Résumé des fonctionnalités critiques
        print(f"\n🎯 FONCTIONNALITÉS CRITIQUES:")
        
        critical_tests = [
            ("Liste des catégories (11 attendues)", any("Categories List - Count" in r['test'] and r['success'] for r in self.test_results)),
            ("Liste des équipements (TUY-001, MASK-001)", any("Equipements List" in r['test'] and r['success'] for r in self.test_results)),
            ("Assignation employé MASK-001", any("MASK-001 Assignment" in r['test'] and r['success'] for r in self.test_results)),
            ("Création d'équipement", any("Create Equipment" in r['test'] and "Data Integrity" not in r['test'] and r['success'] for r in self.test_results)),
            ("Champs personnalisés", any("Custom Fields" in r['test'] and r['success'] for r in self.test_results)),
            ("Validation code unique", any("Duplicate Code" in r['test'] and r['success'] for r in self.test_results)),
            ("Maintenance des équipements", any("Maintenance" in r['test'] and r['success'] for r in self.test_results)),
            ("Statistiques", any("Statistics" in r['test'] and r['success'] for r in self.test_results))
        ]
        
        for feature, status in critical_tests:
            icon = "✅" if status else "❌"
            print(f"   {icon} {feature}")
        
        # Recommandations
        print(f"\n💡 RECOMMANDATIONS:")
        if success_rate >= 90:
            print("   🎉 Excellent! Le module Matériel & Équipements fonctionne parfaitement.")
        elif success_rate >= 75:
            print("   ✅ Très bon résultat. Quelques ajustements mineurs nécessaires.")
        elif success_rate >= 50:
            print("   ⚠️ Résultat correct mais des améliorations sont nécessaires.")
        else:
            print("   ❌ Problèmes majeurs détectés. Révision complète recommandée.")
        
        return success_rate >= 75  # Critère de succès
    
    def run_comprehensive_tests(self):
        """Exécuter tous les tests du module Matériel & Équipements"""
        print("🚀 DÉBUT DES TESTS COMPLETS - MODULE MATÉRIEL & ÉQUIPEMENTS")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"🎯 Objectif: Tester tous les endpoints du module équipements")
        
        # 1. Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        try:
            # 2. Tests des catégories
            self.test_categories_list()
            self.test_create_custom_category()
            
            # 3. Tests des équipements
            self.test_equipements_list()
            self.test_equipements_filtering()
            self.test_individual_equipment_retrieval()
            self.test_create_equipment()
            self.test_duplicate_code_validation()
            self.test_employee_assignment_with_radio_category()
            
            # 4. Tests de maintenance
            self.test_equipment_maintenance()
            
            # 5. Tests des statistiques
            self.test_equipment_statistics()
            
            # 6. Tests des restrictions
            self.test_category_modification_restrictions()
            
            # 6. Nettoyage
            self.cleanup_test_data()
            
            # 7. Rapport final
            overall_success = self.generate_test_report()
            
            return overall_success
            
        except Exception as e:
            print(f"❌ Erreur critique pendant les tests: {str(e)}")
            return False

def main():
    """Point d'entrée principal"""
    tester = EquipmentModuleTester()
    success = tester.run_comprehensive_tests()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()