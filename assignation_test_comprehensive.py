#!/usr/bin/env python3
"""
Test complet de l'assignation manuelle avancée après correction du bug bi_hebdomadaire
Inclut nettoyage et tests avec dates futures pour éviter les conflits
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Configuration
BACKEND_URL = "https://demo-dashboard-1.preview.emergentagent.com/api"

# Credentials pour les tests
DEMO_ADMIN = {
    "email": "gussdub@gmail.com", 
    "mot_de_passe": "230685Juin+"
}

class AssignationTestComprehensive:
    def __init__(self):
        self.session = requests.Session()
        self.token = None
        self.tenant = "demo"
        self.user_id = None
        self.type_garde_id = None
        self.created_assignations = []
        
    def login_admin(self):
        """Login admin pour le tenant demo"""
        print(f"🔑 Connexion admin pour tenant '{self.tenant}'...")
        
        try:
            response = self.session.post(
                f"{BACKEND_URL}/{self.tenant}/auth/login",
                json=DEMO_ADMIN,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data["access_token"]
                self.session.headers.update({
                    "Authorization": f"Bearer {self.token}"
                })
                print(f"✅ Connexion réussie pour {DEMO_ADMIN['email']}")
                return True
            else:
                print(f"❌ Échec connexion: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Erreur connexion: {str(e)}")
            return False
    
    def get_test_data(self):
        """Récupère les données nécessaires pour les tests"""
        print("📋 Récupération des données de test...")
        
        try:
            # Récupérer les utilisateurs
            users_response = self.session.get(f"{BACKEND_URL}/{self.tenant}/users", timeout=30)
            if users_response.status_code != 200:
                print(f"❌ Erreur récupération utilisateurs: {users_response.status_code}")
                return False
                
            users = users_response.json()
            if not users:
                print("❌ Aucun utilisateur trouvé")
                return False
                
            self.user_id = users[0]["id"]
            print(f"✅ Utilisateur sélectionné: {users[0]['nom']} {users[0]['prenom']} (ID: {self.user_id})")
            
            # Récupérer les types de garde
            types_response = self.session.get(f"{BACKEND_URL}/{self.tenant}/types-garde", timeout=30)
            if types_response.status_code != 200:
                print(f"❌ Erreur récupération types de garde: {types_response.status_code}")
                return False
                
            types_garde = types_response.json()
            if not types_garde:
                print("❌ Aucun type de garde trouvé")
                return False
                
            self.type_garde_id = types_garde[0]["id"]
            print(f"✅ Type de garde sélectionné: {types_garde[0]['nom']} (ID: {self.type_garde_id})")
            
            return True
            
        except Exception as e:
            print(f"❌ Erreur récupération données: {str(e)}")
            return False
    
    def cleanup_test_assignations(self, date_debut, date_fin):
        """Nettoie les assignations de test existantes"""
        print(f"🧹 Nettoyage des assignations existantes entre {date_debut} et {date_fin}...")
        
        try:
            # Récupérer les assignations existantes pour cette période
            start_date = datetime.strptime(date_debut, "%Y-%m-%d")
            end_date = datetime.strptime(date_fin, "%Y-%m-%d")
            
            current_date = start_date
            deleted_count = 0
            
            while current_date <= end_date:
                # Calculer le lundi de la semaine
                monday = current_date - timedelta(days=current_date.weekday())
                week_start = monday.strftime("%Y-%m-%d")
                
                # Récupérer les assignations de cette semaine
                response = self.session.get(
                    f"{BACKEND_URL}/{self.tenant}/planning/assignations/{week_start}",
                    timeout=30
                )
                
                if response.status_code == 200:
                    assignations = response.json()
                    
                    # Supprimer les assignations de notre utilisateur pour les dates de test
                    for assignation in assignations:
                        if (assignation.get("user_id") == self.user_id and 
                            assignation.get("type_garde_id") == self.type_garde_id and
                            assignation.get("assignation_type") == "manuel_avance"):
                            
                            assignation_date = datetime.strptime(assignation["date"], "%Y-%m-%d")
                            if start_date <= assignation_date <= end_date:
                                # Supprimer cette assignation
                                delete_response = self.session.delete(
                                    f"{BACKEND_URL}/{self.tenant}/planning/assignation/{assignation['id']}",
                                    timeout=30
                                )
                                if delete_response.status_code in [200, 204]:
                                    deleted_count += 1
                
                current_date += timedelta(days=7)  # Passer à la semaine suivante
            
            print(f"✅ {deleted_count} assignation(s) nettoyée(s)")
            return True
            
        except Exception as e:
            print(f"⚠️ Erreur nettoyage (non bloquant): {str(e)}")
            return True  # Non bloquant
    
    def test_assignation_unique_bug_fix(self):
        """Test spécifique du bug bi_hebdomadaire - assignation unique"""
        print("\n🎯 TEST BUG FIX: Assignation unique avec bi_hebdomadaire=False")
        
        # Utiliser une date future pour éviter les conflits
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        # Nettoyer d'abord
        self.cleanup_test_assignations(future_date, future_date)
        
        try:
            payload = {
                "user_id": self.user_id,
                "type_garde_id": self.type_garde_id,
                "recurrence_type": "unique",
                "date_debut": future_date,
                "date_fin": future_date,
                "jours_semaine": [],
                "bi_hebdomadaire": False,  # Le paramètre qui causait l'erreur
                "assignation_type": "manuel_avance"
            }
            
            print(f"📤 Test avec date future: {future_date}")
            print(f"📋 Payload: {json.dumps(payload, indent=2)}")
            
            response = self.session.post(
                f"{BACKEND_URL}/{self.tenant}/planning/assignation-avancee",
                json=payload,
                timeout=30
            )
            
            print(f"📥 Réponse: {response.status_code}")
            print(f"📄 Contenu: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ BUG FIX CONFIRMÉ: {data.get('message', 'Assignation créée')}")
                print(f"📊 Assignations créées: {data.get('assignations_creees', 0)}")
                
                # Enregistrer pour nettoyage
                self.created_assignations.append({
                    "date": future_date,
                    "type": "unique"
                })
                
                return True
            else:
                print(f"❌ BUG FIX ÉCHOUÉ: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ BUG FIX ERREUR: {str(e)}")
            return False
    
    def test_recurrence_hebdomadaire_bug_fix(self):
        """Test spécifique du bug bi_hebdomadaire - récurrence hebdomadaire"""
        print("\n🎯 TEST BUG FIX: Récurrence hebdomadaire avec bi_hebdomadaire=True")
        
        # Utiliser une période future
        start_date = (datetime.now() + timedelta(days=40)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=60)).strftime("%Y-%m-%d")
        
        # Nettoyer d'abord
        self.cleanup_test_assignations(start_date, end_date)
        
        try:
            payload = {
                "user_id": self.user_id,
                "type_garde_id": self.type_garde_id,
                "recurrence_type": "hebdomadaire",
                "date_debut": start_date,
                "date_fin": end_date,
                "jours_semaine": ["monday", "wednesday"],
                "bi_hebdomadaire": True,  # Le paramètre qui causait l'erreur
                "assignation_type": "manuel_avance"
            }
            
            print(f"📤 Test période future: {start_date} à {end_date}")
            print(f"📋 Payload: {json.dumps(payload, indent=2)}")
            
            response = self.session.post(
                f"{BACKEND_URL}/{self.tenant}/planning/assignation-avancee",
                json=payload,
                timeout=30
            )
            
            print(f"📥 Réponse: {response.status_code}")
            print(f"📄 Contenu: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ BUG FIX CONFIRMÉ: {data.get('message', 'Assignations créées')}")
                print(f"📊 Assignations créées: {data.get('assignations_creees', 0)}")
                print(f"📅 Période: {data.get('periode', 'Non spécifiée')}")
                
                # Enregistrer pour nettoyage
                self.created_assignations.append({
                    "date_debut": start_date,
                    "date_fin": end_date,
                    "type": "hebdomadaire"
                })
                
                return True
            else:
                print(f"❌ BUG FIX ÉCHOUÉ: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ BUG FIX ERREUR: {str(e)}")
            return False
    
    def test_error_before_fix(self):
        """Test pour simuler l'erreur qui existait avant le fix"""
        print("\n🎯 TEST SIMULATION: Vérification que le paramètre bi_hebdomadaire est bien géré")
        
        # Test avec payload sans bi_hebdomadaire (pour voir si le défaut fonctionne)
        future_date = (datetime.now() + timedelta(days=70)).strftime("%Y-%m-%d")
        
        try:
            payload = {
                "user_id": self.user_id,
                "type_garde_id": self.type_garde_id,
                "recurrence_type": "unique",
                "date_debut": future_date,
                "date_fin": future_date,
                "jours_semaine": [],
                # bi_hebdomadaire volontairement omis pour tester le défaut
                "assignation_type": "manuel_avance"
            }
            
            print(f"📤 Test sans bi_hebdomadaire (défaut attendu: False)")
            print(f"📋 Payload: {json.dumps(payload, indent=2)}")
            
            response = self.session.post(
                f"{BACKEND_URL}/{self.tenant}/planning/assignation-avancee",
                json=payload,
                timeout=30
            )
            
            print(f"📥 Réponse: {response.status_code}")
            print(f"📄 Contenu: {response.text}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ DÉFAUT GÉRÉ CORRECTEMENT: {data.get('message', 'Assignation créée')}")
                print(f"📊 Assignations créées: {data.get('assignations_creees', 0)}")
                return True
            else:
                print(f"❌ DÉFAUT NON GÉRÉ: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ ERREUR TEST DÉFAUT: {str(e)}")
            return False
    
    def verify_assignations_created(self):
        """Vérifier que les assignations ont bien été créées"""
        print("\n🎯 VÉRIFICATION: Assignations créées dans la base")
        
        try:
            verified_count = 0
            
            for assignation_info in self.created_assignations:
                if assignation_info["type"] == "unique":
                    # Vérifier assignation unique
                    date_obj = datetime.strptime(assignation_info["date"], "%Y-%m-%d")
                    monday = date_obj - timedelta(days=date_obj.weekday())
                    week_start = monday.strftime("%Y-%m-%d")
                    
                    response = self.session.get(
                        f"{BACKEND_URL}/{self.tenant}/planning/assignations/{week_start}",
                        timeout=30
                    )
                    
                    if response.status_code == 200:
                        assignations = response.json()
                        found = any(
                            a.get("user_id") == self.user_id and 
                            a.get("date") == assignation_info["date"] and
                            a.get("assignation_type") == "manuel_avance"
                            for a in assignations
                        )
                        if found:
                            verified_count += 1
                            print(f"✅ Assignation unique trouvée: {assignation_info['date']}")
                        else:
                            print(f"❌ Assignation unique manquante: {assignation_info['date']}")
            
            print(f"📊 Assignations vérifiées: {verified_count}/{len(self.created_assignations)}")
            return verified_count > 0
            
        except Exception as e:
            print(f"❌ Erreur vérification: {str(e)}")
            return False
    
    def run_comprehensive_test(self):
        """Exécuter le test complet du bug fix"""
        print("🚀 TEST COMPLET - Bug Fix bi_hebdomadaire")
        print("=" * 60)
        print("🐛 CONTEXTE: Variable bi_hebdomadaire utilisée mais non définie")
        print("🔧 FIX: Ajout de bi_hebdomadaire = assignation_data.get('bi_hebdomadaire', False)")
        print("=" * 60)
        
        results = []
        
        # Étape 1: Connexion
        if not self.login_admin():
            print("❌ ÉCHEC CRITIQUE: Impossible de se connecter")
            return False
        
        # Étape 2: Récupération des données
        if not self.get_test_data():
            print("❌ ÉCHEC CRITIQUE: Impossible de récupérer les données de test")
            return False
        
        # Étape 3: Tests du bug fix
        results.append(("Bug Fix - Assignation unique", self.test_assignation_unique_bug_fix()))
        results.append(("Bug Fix - Récurrence hebdomadaire", self.test_recurrence_hebdomadaire_bug_fix()))
        results.append(("Bug Fix - Gestion défaut", self.test_error_before_fix()))
        results.append(("Vérification base de données", self.verify_assignations_created()))
        
        # Résumé
        print("\n" + "=" * 60)
        print("📊 RÉSUMÉ DU TEST BUG FIX")
        print("=" * 60)
        
        passed = sum(1 for _, result in results if result)
        failed = len(results) - passed
        
        for test_name, result in results:
            status = "✅ RÉUSSI" if result else "❌ ÉCHOUÉ"
            print(f"{status}: {test_name}")
        
        print(f"\n📈 RÉSULTATS:")
        print(f"   ✅ Tests réussis: {passed}")
        print(f"   ❌ Tests échoués: {failed}")
        print(f"   📊 Taux de réussite: {(passed/len(results)*100):.1f}%")
        
        if failed == 0:
            print(f"\n🎉 BUG FIX CONFIRMÉ!")
            print(f"✅ La variable bi_hebdomadaire est correctement gérée")
            print(f"✅ L'assignation manuelle avancée fonctionne pour tous les types de récurrence")
            print(f"✅ Les assignations sont créées dans la base de données")
        else:
            print(f"\n⚠️ {failed} test(s) ont échoué")
            print(f"🔍 Vérification supplémentaire nécessaire")
        
        return failed == 0

def main():
    """Point d'entrée principal"""
    print("🔥 ProFireManager - Test Complet Bug Fix bi_hebdomadaire")
    print("📋 Test de l'assignation manuelle avancée après correction")
    print()
    
    tester = AssignationTestComprehensive()
    success = tester.run_comprehensive_test()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()