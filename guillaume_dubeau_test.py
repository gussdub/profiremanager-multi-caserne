#!/usr/bin/env python3
"""
TEST CRITIQUE: Investigation attribution automatique - Guillaume Dubeau

CONTEXTE:
L'utilisateur signale que l'attribution automatique crée 0 assignations alors que 
Guillaume Dubeau a des disponibilités pour décembre 2025.

CREDENTIALS:
- Tenant: demo
- Email: gussdub@gmail.com
- Mot de passe: 230685Juin+
- User ID de Guillaume: f4bdfa76-a2a2-4a01-9734-2cf534d04d31

TESTS À EFFECTUER:
1. Se connecter et récupérer le token
2. Vérifier les disponibilités de Guillaume pour décembre 2025
3. Vérifier les types de garde
4. Vérifier les utilisateurs actifs temps partiel
5. Tester l'attribution automatique pour la période 2025-12-01 à 2026-01-04
6. Vérifier les logs détaillés pour comprendre pourquoi 0 assignations sont créées

Backend URL: https://building-deps.preview.emergentagent.com/api
"""

import requests
import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict
import time

class GuillaumeDubeauTester:
    def __init__(self):
        self.base_url = "https://building-deps.preview.emergentagent.com/api/demo"
        self.headers = {}
        self.token = None
        self.credentials = {
            "email": "gussdub@gmail.com",
            "mot_de_passe": "230685Juin+"
        }
        self.guillaume_user_id = "f4bdfa76-a2a2-4a01-9734-2cf534d04d31"
        self.test_period_start = "2025-12-01"
        self.test_period_end = "2026-01-04"
        
    def authenticate(self):
        """Authentification sur tenant demo"""
        print("🔐 Authentification sur tenant demo...")
        
        auth_url = f"{self.base_url}/auth/login"
        response = requests.post(auth_url, json=self.credentials)
        
        if response.status_code == 200:
            data = response.json()
            self.token = data.get('access_token')
            self.headers = {'Authorization': f'Bearer {self.token}'}
            print(f"✅ Authentification réussie - Token obtenu")
            print(f"🔍 User info: {data.get('user', {}).get('email')} - Role: {data.get('user', {}).get('role')}")
            
            # Test immédiat du token
            test_url = f"{self.base_url}/users"
            test_response = requests.get(test_url, headers=self.headers)
            print(f"🧪 Test token: {test_response.status_code}")
            if test_response.status_code != 200:
                print(f"⚠️ Token test failed: {test_response.text}")
            
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code} - {response.text}")
            return False
    
    def get_guillaume_disponibilites(self):
        """Récupère les disponibilités de Guillaume pour décembre 2025"""
        print(f"\n📅 Récupération des disponibilités de Guillaume ({self.guillaume_user_id}) pour décembre 2025...")
        
        url = f"{self.base_url}/disponibilites/{self.guillaume_user_id}"
        params = {
            "date_debut": "2025-12-01",
            "date_fin": "2025-12-31"
        }
        
        response = requests.get(url, headers=self.headers, params=params)
        
        if response.status_code == 200:
            disponibilites = response.json()
            print(f"✅ {len(disponibilites)} disponibilités récupérées pour Guillaume")
            
            # Analyser les disponibilités
            disponibles = [d for d in disponibilites if d.get('statut') == 'disponible']
            indisponibles = [d for d in disponibilites if d.get('statut') == 'indisponible']
            
            print(f"📊 Analyse des disponibilités:")
            print(f"   - Disponible: {len(disponibles)} entrées")
            print(f"   - Indisponible: {len(indisponibles)} entrées")
            
            # Afficher quelques exemples
            print(f"\n🔍 Exemples de disponibilités (5 premiers):")
            for i, dispo in enumerate(disponibilites[:5]):
                date = dispo.get('date', 'N/A')
                statut = dispo.get('statut', 'N/A')
                heure_debut = dispo.get('heure_debut', 'N/A')
                heure_fin = dispo.get('heure_fin', 'N/A')
                origine = dispo.get('origine', 'manuelle')
                print(f"   {i+1}. {date} - {statut}: {heure_debut}-{heure_fin} (origine: {origine})")
            
            return disponibilites
        else:
            print(f"❌ Erreur récupération disponibilités: {response.status_code} - {response.text}")
            return []
    
    def get_types_garde(self):
        """Récupère les types de garde"""
        print(f"\n🛡️ Récupération des types de garde...")
        
        url = f"{self.base_url}/types-garde"
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            types_garde = response.json()
            print(f"✅ {len(types_garde)} types de garde récupérés")
            
            # Analyser les types de garde
            print(f"\n📋 Types de garde disponibles:")
            for i, type_garde in enumerate(types_garde):
                nom = type_garde.get('nom', 'N/A')
                heure_debut = type_garde.get('heure_debut', 'N/A')
                heure_fin = type_garde.get('heure_fin', 'N/A')
                duree = type_garde.get('duree_heures', 'N/A')
                actif = type_garde.get('actif', True)
                est_externe = type_garde.get('est_garde_externe', False)
                
                status = "✅" if actif else "❌"
                externe_flag = " (EXTERNE)" if est_externe else ""
                
                print(f"   {i+1}. {status} {nom}: {heure_debut}-{heure_fin} ({duree}h){externe_flag}")
            
            return types_garde
        else:
            print(f"❌ Erreur récupération types garde: {response.status_code} - {response.text}")
            return []
    
    def get_users_actifs_temps_partiel(self):
        """Récupère les utilisateurs actifs temps partiel"""
        print(f"\n👥 Récupération des utilisateurs actifs temps partiel...")
        
        url = f"{self.base_url}/users"
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            users = response.json()
            print(f"✅ {len(users)} utilisateurs récupérés")
            
            # Filtrer les utilisateurs actifs temps partiel
            users_actifs = [u for u in users if u.get('actif', True)]
            users_temps_partiel = [u for u in users_actifs if u.get('type_emploi') == 'temps_partiel']
            
            print(f"📊 Analyse des utilisateurs:")
            print(f"   - Total: {len(users)}")
            print(f"   - Actifs: {len(users_actifs)}")
            print(f"   - Temps partiel actifs: {len(users_temps_partiel)}")
            
            # Vérifier Guillaume spécifiquement
            guillaume = next((u for u in users if u.get('id') == self.guillaume_user_id), None)
            
            if guillaume:
                print(f"\n🔍 Guillaume Dubeau trouvé:")
                print(f"   - ID: {guillaume.get('id')}")
                print(f"   - Nom: {guillaume.get('prenom', '')} {guillaume.get('nom', '')}")
                print(f"   - Email: {guillaume.get('email', 'N/A')}")
                print(f"   - Type emploi: {guillaume.get('type_emploi', 'N/A')}")
                print(f"   - Actif: {guillaume.get('actif', 'N/A')}")
                print(f"   - Grade: {guillaume.get('grade', 'N/A')}")
                print(f"   - Heures max/semaine: {guillaume.get('heures_max_semaine', 'N/A')}")
            else:
                print(f"❌ Guillaume Dubeau (ID: {self.guillaume_user_id}) non trouvé!")
            
            # Afficher quelques utilisateurs temps partiel
            print(f"\n📋 Utilisateurs temps partiel actifs (5 premiers):")
            for i, user in enumerate(users_temps_partiel[:5]):
                nom = f"{user.get('prenom', '')} {user.get('nom', '')}"
                email = user.get('email', 'N/A')
                grade = user.get('grade', 'N/A')
                heures_max = user.get('heures_max_semaine', 'N/A')
                print(f"   {i+1}. {nom} ({email}) - Grade: {grade}, Max: {heures_max}h/sem")
            
            return users, guillaume
        else:
            print(f"❌ Erreur récupération utilisateurs: {response.status_code} - {response.text}")
            return [], None
    
    def test_attribution_automatique(self):
        """Teste l'attribution automatique pour la période spécifiée"""
        print(f"\n🚀 Test attribution automatique pour période {self.test_period_start} à {self.test_period_end}...")
        
        url = f"{self.base_url}/planning/attribution-auto"
        params = {
            "semaine_debut": self.test_period_start,
            "semaine_fin": self.test_period_end
        }
        
        print(f"📡 Envoi requête POST: {url}")
        print(f"📋 Paramètres: {params}")
        
        start_time = time.time()
        response = requests.post(url, headers=self.headers, params=params)
        end_time = time.time()
        
        print(f"⏱️ Temps de réponse: {end_time - start_time:.2f}s")
        print(f"📊 Status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Attribution automatique terminée avec succès")
            
            # Analyser les résultats
            assignations_creees = result.get('assignations_creees', 0)
            message = result.get('message', 'N/A')
            
            print(f"\n📈 Résultats de l'attribution:")
            print(f"   - Assignations créées: {assignations_creees}")
            print(f"   - Message: {message}")
            
            # Afficher tous les champs de la réponse
            print(f"\n🔍 Détails complets de la réponse:")
            for key, value in result.items():
                print(f"   - {key}: {value}")
            
            # Diagnostic si 0 assignations
            if assignations_creees == 0:
                print(f"\n❌ PROBLÈME IDENTIFIÉ: 0 assignations créées!")
                print(f"🔍 Causes possibles:")
                print(f"   1. Aucun utilisateur disponible pour la période")
                print(f"   2. Aucun type de garde actif")
                print(f"   3. Problème de configuration des paramètres")
                print(f"   4. Conflit dans les disponibilités")
                print(f"   5. Erreur dans l'algorithme d'attribution")
            
            return result
        else:
            print(f"❌ Erreur attribution automatique: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return None
    
    def get_assignations_existantes(self):
        """Récupère les assignations existantes pour la période"""
        print(f"\n📅 Vérification des assignations existantes...")
        
        # Tester plusieurs semaines dans la période
        semaines_test = [
            "2025-12-01",
            "2025-12-08", 
            "2025-12-15",
            "2025-12-22",
            "2025-12-29"
        ]
        
        total_assignations = 0
        assignations_guillaume = 0
        
        for semaine in semaines_test:
            url = f"{self.base_url}/planning/assignations/{semaine}"
            response = requests.get(url, headers=self.headers)
            
            if response.status_code == 200:
                assignations = response.json()
                total_assignations += len(assignations)
                
                # Compter les assignations de Guillaume
                guillaume_assignations = [a for a in assignations if a.get('user_id') == self.guillaume_user_id]
                assignations_guillaume += len(guillaume_assignations)
                
                print(f"   Semaine {semaine}: {len(assignations)} assignations (Guillaume: {len(guillaume_assignations)})")
            else:
                print(f"   Semaine {semaine}: Erreur {response.status_code}")
        
        print(f"\n📊 Résumé des assignations existantes:")
        print(f"   - Total toutes semaines: {total_assignations}")
        print(f"   - Guillaume Dubeau: {assignations_guillaume}")
        
        return total_assignations, assignations_guillaume
    
    def analyze_attribution_logs(self):
        """Analyse les logs d'attribution (simulation)"""
        print(f"\n📋 Analyse des logs d'attribution...")
        
        print(f"🔍 Points à vérifier dans les logs backend:")
        print(f"   1. Messages '[ATTRIBUTION]' pour le processus global")
        print(f"   2. Messages '[USER_ELIGIBLE]' pour Guillaume Dubeau")
        print(f"   3. Messages '[DISPO_CHECK]' pour vérification des disponibilités")
        print(f"   4. Messages '[GARDE_ASSIGNMENT]' pour les tentatives d'assignation")
        print(f"   5. Messages d'erreur ou de conflit")
        
        print(f"\n⚠️ NOTE: Accès aux logs backend limité en environnement de test")
        print(f"📝 Les logs doivent être vérifiés manuellement par l'administrateur")
        
        return True
    
    def diagnostic_complet(self):
        """Effectue un diagnostic complet du problème"""
        print(f"\n🔬 DIAGNOSTIC COMPLET DU PROBLÈME")
        print(f"="*60)
        
        # 1. Vérifier les paramètres système
        print(f"\n1️⃣ Vérification des paramètres système...")
        
        # Paramètres de remplacement
        url_params = f"{self.base_url}/parametres/remplacements"
        response = requests.get(url_params, headers=self.headers)
        
        if response.status_code == 200:
            params = response.json()
            print(f"✅ Paramètres de remplacement récupérés:")
            
            # Afficher les paramètres clés
            cles_importantes = [
                'attribution_automatique_activee',
                'heures_supplementaires_activees', 
                'mode_notification',
                'delai_attente_heures',
                'nombre_simultane'
            ]
            
            for cle in cles_importantes:
                valeur = params.get(cle, 'NON DÉFINI')
                print(f"   - {cle}: {valeur}")
        else:
            print(f"❌ Erreur récupération paramètres: {response.status_code}")
        
        # 2. Vérifier les formations/compétences requises
        print(f"\n2️⃣ Vérification des formations/compétences...")
        
        url_formations = f"{self.base_url}/formations"
        response = requests.get(url_formations, headers=self.headers)
        
        if response.status_code == 200:
            formations = response.json()
            print(f"✅ {len(formations)} formations trouvées")
        else:
            print(f"❌ Erreur formations: {response.status_code}")
        
        # 3. Vérifier les grades
        print(f"\n3️⃣ Vérification des grades...")
        
        url_grades = f"{self.base_url}/grades"
        response = requests.get(url_grades, headers=self.headers)
        
        if response.status_code == 200:
            grades = response.json()
            print(f"✅ {len(grades)} grades trouvés")
            
            for grade in grades:
                nom = grade.get('nom', 'N/A')
                niveau = grade.get('niveau_hierarchique', 'N/A')
                print(f"   - {nom} (niveau {niveau})")
        else:
            print(f"❌ Erreur grades: {response.status_code}")
        
        return True
    
    def run_complete_investigation(self):
        """Exécute l'investigation complète"""
        print("🚀 DÉBUT DE L'INVESTIGATION - GUILLAUME DUBEAU ATTRIBUTION AUTOMATIQUE")
        print("🏢 Tenant: demo")
        print("🌐 URL: https://building-deps.preview.emergentagent.com/api/demo")
        print("👤 Credentials: gussdub@gmail.com / 230685Juin+")
        print("🎯 Guillaume User ID: f4bdfa76-a2a2-4a01-9734-2cf534d04d31")
        print("📅 Période de test: 2025-12-01 à 2026-01-04")
        
        # Authentification
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        # Exécuter les tests
        tests = [
            ("Test 1: Récupération disponibilités Guillaume", self.get_guillaume_disponibilites),
            ("Test 2: Récupération types de garde", self.get_types_garde),
            ("Test 3: Récupération utilisateurs actifs temps partiel", self.get_users_actifs_temps_partiel),
            ("Test 4: Vérification assignations existantes", self.get_assignations_existantes),
            ("Test 5: Test attribution automatique", self.test_attribution_automatique),
            ("Test 6: Diagnostic complet", self.diagnostic_complet),
            ("Test 7: Analyse logs attribution", self.analyze_attribution_logs)
        ]
        
        resultats = []
        donnees_collectees = {}
        
        for nom_test, test_func in tests:
            try:
                print(f"\n🔄 Exécution: {nom_test}")
                resultat = test_func()
                resultats.append((nom_test, resultat is not False))
                
                # Stocker les données importantes
                if nom_test.startswith("Test 1"):
                    donnees_collectees['disponibilites'] = resultat
                elif nom_test.startswith("Test 2"):
                    donnees_collectees['types_garde'] = resultat
                elif nom_test.startswith("Test 3"):
                    donnees_collectees['users'], donnees_collectees['guillaume'] = resultat
                elif nom_test.startswith("Test 5"):
                    donnees_collectees['attribution_result'] = resultat
                
                if resultat is not False:
                    print(f"✅ {nom_test}: RÉUSSI")
                else:
                    print(f"❌ {nom_test}: ÉCHEC")
                    
            except Exception as e:
                print(f"💥 {nom_test}: ERREUR - {str(e)}")
                resultats.append((nom_test, False))
        
        # Analyse finale
        self.generate_final_analysis(donnees_collectees, resultats)
        
        return True
    
    def generate_final_analysis(self, donnees, resultats):
        """Génère l'analyse finale du problème"""
        print("\n" + "="*80)
        print("📊 ANALYSE FINALE - PROBLÈME ATTRIBUTION AUTOMATIQUE GUILLAUME DUBEAU")
        print("="*80)
        
        # Résumé des tests
        succes = sum(1 for _, resultat in resultats if resultat)
        total = len(resultats)
        
        print(f"\n📈 RÉSUMÉ DES TESTS: {succes}/{total} tests réussis ({succes/total*100:.1f}%)")
        
        for nom_test, resultat in resultats:
            status = "✅ RÉUSSI" if resultat else "❌ ÉCHEC"
            print(f"{status}: {nom_test}")
        
        # Analyse des données collectées
        print(f"\n🔍 ANALYSE DES DONNÉES COLLECTÉES:")
        
        # Guillaume
        guillaume = donnees.get('guillaume')
        if guillaume:
            print(f"\n👤 GUILLAUME DUBEAU:")
            print(f"   ✅ Utilisateur trouvé et actif")
            print(f"   - Type emploi: {guillaume.get('type_emploi', 'N/A')}")
            print(f"   - Grade: {guillaume.get('grade', 'N/A')}")
            print(f"   - Heures max/semaine: {guillaume.get('heures_max_semaine', 'N/A')}")
        else:
            print(f"\n❌ GUILLAUME DUBEAU: Non trouvé ou inactif")
        
        # Disponibilités
        disponibilites = donnees.get('disponibilites', [])
        if disponibilites:
            disponibles = [d for d in disponibilites if d.get('statut') == 'disponible']
            print(f"\n📅 DISPONIBILITÉS GUILLAUME:")
            print(f"   ✅ {len(disponibles)} disponibilités trouvées pour décembre 2025")
            
            if disponibles:
                print(f"   📋 Exemples de disponibilités:")
                for dispo in disponibles[:3]:
                    date = dispo.get('date', 'N/A')
                    heures = f"{dispo.get('heure_debut', 'N/A')}-{dispo.get('heure_fin', 'N/A')}"
                    print(f"      - {date}: {heures}")
        else:
            print(f"\n❌ DISPONIBILITÉS: Aucune disponibilité trouvée")
        
        # Types de garde
        types_garde = donnees.get('types_garde', [])
        if types_garde:
            actifs = [t for t in types_garde if t.get('actif', True)]
            print(f"\n🛡️ TYPES DE GARDE:")
            print(f"   ✅ {len(actifs)} types de garde actifs sur {len(types_garde)} total")
        else:
            print(f"\n❌ TYPES DE GARDE: Aucun type de garde trouvé")
        
        # Résultat attribution
        attribution_result = donnees.get('attribution_result')
        if attribution_result:
            assignations = attribution_result.get('assignations_creees', 0)
            print(f"\n🚀 ATTRIBUTION AUTOMATIQUE:")
            if assignations == 0:
                print(f"   ❌ PROBLÈME CONFIRMÉ: 0 assignations créées")
                print(f"   📋 Message: {attribution_result.get('message', 'N/A')}")
            else:
                print(f"   ✅ {assignations} assignations créées")
        
        # Diagnostic final
        print(f"\n🎯 DIAGNOSTIC FINAL:")
        
        if guillaume and disponibilites and types_garde and attribution_result:
            if attribution_result.get('assignations_creees', 0) == 0:
                print(f"❌ PROBLÈME CONFIRMÉ:")
                print(f"   - Guillaume Dubeau existe et est actif")
                print(f"   - Guillaume a des disponibilités pour décembre 2025")
                print(f"   - Des types de garde sont disponibles")
                print(f"   - Mais l'attribution automatique crée 0 assignations")
                
                print(f"\n🔍 CAUSES POSSIBLES:")
                print(f"   1. Problème dans l'algorithme d'attribution")
                print(f"   2. Conflit dans les paramètres de configuration")
                print(f"   3. Problème de compatibilité grade/compétences")
                print(f"   4. Erreur dans la logique de vérification des disponibilités")
                print(f"   5. Problème de calcul des heures maximales")
                
                print(f"\n📝 RECOMMANDATIONS:")
                print(f"   1. Vérifier les logs backend pour l'algorithme d'attribution")
                print(f"   2. Tester avec un utilisateur différent")
                print(f"   3. Vérifier les paramètres de configuration système")
                print(f"   4. Analyser les règles de compatibilité grade/garde")
                print(f"   5. Déboguer l'algorithme d'attribution pas à pas")
            else:
                print(f"✅ PROBLÈME RÉSOLU: L'attribution automatique fonctionne maintenant")
        else:
            print(f"⚠️ DONNÉES INCOMPLÈTES: Impossible de diagnostiquer complètement")
        
        print(f"\n" + "="*80)

def main():
    """Point d'entrée principal"""
    tester = GuillaumeDubeauTester()
    success = tester.run_complete_investigation()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()