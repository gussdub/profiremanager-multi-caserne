#!/usr/bin/env python3
"""
TEST DU SYSTÈME D'ALERTES EMAIL POUR LES INVENTAIRES VÉHICULES

CONTEXTE:
Le bug critique a été corrigé dans `/app/backend/server.py` ligne ~20344. 
Le code lisait incorrectement `parametres.get('emails_notifications_inventaires_vehicules')` 
alors qu'il devait lire `parametres.get('actifs', {}).get('emails_notifications_inventaires_vehicules')`.

ENVIRONNEMENT DE TEST:
- Tenant: demo
- Backend URL: https://personnel-mgmt-11.preview.emergentagent.com
- Credentials: gussdub@gmail.com / 230685Juin+
- User ID de Guillaume Dubeau: f4bdfa76-a2a2-4a01-9734-2cf534d04d31

TESTS À EFFECTUER:
1. Authentification avec les credentials fournis
2. Vérifier la configuration des emails dans parametres
3. Récupérer un véhicule pour test
4. Récupérer un modèle d'inventaire
5. Créer un inventaire avec alertes (TEST PRINCIPAL)
6. Vérifier les logs backend

CRITÈRES DE SUCCÈS:
✅ La création d'inventaire retourne 200 OK
✅ Les logs montrent "🔍 DEBUG: Alertes détectées" avec user_ids_ou_emails NON VIDE
✅ Les logs montrent "✅ DEBUG: Email d'alertes inventaire envoyé"
✅ Aucune erreur "❌ DEBUG: Erreur envoi email" dans les logs
✅ Le message indique "Email d'alertes inventaire envoyé pour véhicule {id} ({n} alertes)"
"""

import requests
import json
import sys
import time
from datetime import datetime, date
from typing import Dict, List, Optional
import subprocess
import os

class VehicleInventoryEmailTester:
    def __init__(self):
        self.base_url = "https://personnel-mgmt-11.preview.emergentagent.com/api"
        self.headers = {}
        self.token = None
        self.tenant_slug = "demo"
        self.credentials = {
            "email": "gussdub@gmail.com",
            "mot_de_passe": "230685Juin+"
        }
        self.guillaume_user_id = "f4bdfa76-a2a2-4a01-9734-2cf534d04d31"
        
        # Données de test
        self.test_data = {
            "vehicule_id": None,
            "modele_id": None,
            "inventaire_id": None
        }
        
    def authenticate(self):
        """Authentification sur le tenant demo"""
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
            print(f"✅ Authentification réussie")
            print(f"🔍 User: {user_info.get('email')} - Role: {user_info.get('role')}")
            print(f"🆔 User ID: {user_info.get('id')}")
            return True
        else:
            print(f"❌ Échec authentification: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def verify_email_configuration(self):
        """Vérifier la configuration des emails dans parametres"""
        print(f"\n📧 Vérification configuration emails...")
        
        url = f"{self.base_url}/{self.tenant_slug}/actifs/parametres"
        print(f"📍 URL: {url}")
        
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            parametres = response.json()
            print(f"✅ Paramètres récupérés")
            
            # Vérifier la structure actifs.emails_notifications_inventaires_vehicules
            actifs = parametres.get('actifs', {})
            emails_config = actifs.get('emails_notifications_inventaires_vehicules', [])
            
            print(f"🔍 Structure parametres.actifs: {list(actifs.keys()) if actifs else 'Vide'}")
            print(f"📧 emails_notifications_inventaires_vehicules: {emails_config}")
            
            if emails_config:
                print(f"✅ Configuration emails trouvée: {len(emails_config)} user ID(s)")
                for user_id in emails_config:
                    print(f"   - User ID: {user_id}")
                return True
            else:
                print(f"⚠️ Configuration emails vide ou manquante - Configuration automatique...")
                return self.configure_email_notifications()
        else:
            print(f"❌ Erreur récupération paramètres: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def configure_email_notifications(self):
        """Configurer les notifications email pour les inventaires véhicules"""
        print(f"\n⚙️ Configuration des notifications email...")
        
        url = f"{self.base_url}/{self.tenant_slug}/actifs/parametres"
        
        # Configurer les paramètres avec Guillaume Dubeau comme destinataire
        payload = {
            "actifs": {
                "emails_notifications_inventaires_vehicules": [self.guillaume_user_id]
            }
        }
        
        print(f"📍 URL: {url}")
        print(f"📋 Configuration: {payload}")
        
        response = requests.put(url, json=payload, headers=self.headers)
        
        if response.status_code == 200:
            print(f"✅ Configuration email mise à jour avec succès")
            print(f"📧 Guillaume Dubeau ({self.guillaume_user_id}) configuré comme destinataire")
            return True
        else:
            print(f"❌ Erreur configuration email: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def get_test_vehicle(self):
        """Récupérer un véhicule pour test"""
        print(f"\n🚗 Récupération véhicule pour test...")
        
        url = f"{self.base_url}/{self.tenant_slug}/actifs/vehicules"
        print(f"📍 URL: {url}")
        
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            vehicules = response.json()
            print(f"✅ {len(vehicules)} véhicule(s) trouvé(s)")
            
            if vehicules:
                vehicule = vehicules[0]
                self.test_data["vehicule_id"] = vehicule.get('id')
                print(f"🚗 Véhicule sélectionné: {vehicule.get('nom', 'N/A')} (ID: {self.test_data['vehicule_id']})")
                return True
            else:
                print(f"❌ Aucun véhicule disponible")
                return False
        else:
            print(f"❌ Erreur récupération véhicules: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def get_inventory_model(self):
        """Récupérer un modèle d'inventaire"""
        print(f"\n📋 Récupération modèle d'inventaire...")
        
        url = f"{self.base_url}/{self.tenant_slug}/parametres/modeles-inventaires-vehicules"
        print(f"📍 URL: {url}")
        
        response = requests.get(url, headers=self.headers)
        
        if response.status_code == 200:
            modeles = response.json()
            print(f"✅ {len(modeles)} modèle(s) d'inventaire trouvé(s)")
            
            if modeles:
                modele = modeles[0]
                self.test_data["modele_id"] = modele.get('id')
                print(f"📋 Modèle sélectionné: {modele.get('nom', 'N/A')} (ID: {self.test_data['modele_id']})")
                
                # Afficher la structure du modèle
                sections = modele.get('sections', [])
                print(f"🔍 Structure du modèle:")
                print(f"   - {len(sections)} section(s)")
                
                total_items = 0
                for i, section in enumerate(sections):
                    items = section.get('items', [])
                    total_items += len(items)
                    print(f"   - Section {i+1}: {section.get('nom', 'N/A')} ({len(items)} items)")
                    
                    # Afficher quelques items pour comprendre la structure
                    for j, item in enumerate(items[:2]):  # Afficher les 2 premiers items
                        options = item.get('options', [])
                        print(f"     - Item {j+1}: {item.get('nom', 'N/A')} ({len(options)} options)")
                        for option in options:
                            print(f"       * {option.get('nom', 'N/A')} (alerte: {option.get('alerte', False)})")
                
                print(f"📊 Total: {total_items} items dans le modèle")
                return True
            else:
                print(f"❌ Aucun modèle d'inventaire disponible")
                return False
        else:
            print(f"❌ Erreur récupération modèles: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def create_inventory_with_alerts(self):
        """Créer un inventaire avec alertes (TEST PRINCIPAL)"""
        print(f"\n🚨 Création inventaire avec alertes (TEST PRINCIPAL)...")
        
        if not self.test_data["vehicule_id"] or not self.test_data["modele_id"]:
            print(f"❌ Données manquantes: vehicule_id={self.test_data['vehicule_id']}, modele_id={self.test_data['modele_id']}")
            return False
        
        url = f"{self.base_url}/{self.tenant_slug}/vehicules/{self.test_data['vehicule_id']}/inventaire"
        print(f"📍 URL: {url}")
        
        # Construire le payload avec des alertes
        payload = {
            "vehicule_id": self.test_data["vehicule_id"],
            "vehicule_nom": "Test Vehicle",
            "modele_id": self.test_data["modele_id"],
            "date_inventaire": date.today().isoformat(),
            "heure_debut": "08:00",
            "heure_fin": "09:00",
            "effectue_par": "Guillaume Dubeau",
            "effectue_par_id": self.guillaume_user_id,
            "items_coches": [
                {
                    "item_id": "item_1",
                    "section": "section_1",
                    "nom": "Test Item 1",
                    "type_champ": "select",
                    "valeur": "Absent",
                    "notes": "Item manquant - test alerte email",
                    "photo_prise": "non"
                },
                {
                    "item_id": "item_2",
                    "section": "section_1", 
                    "nom": "Test Item 2",
                    "type_champ": "select",
                    "valeur": "Défectueux",
                    "notes": "Item défectueux - test alerte email",
                    "photo_prise": "non"
                }
            ],
            "notes_generales": "Test d'inventaire avec alertes pour vérifier le système d'email",
            "alertes": [
                {
                    "section": "section_1",
                    "item": "item_1",
                    "valeur": "Absent",
                    "notes": "Item manquant - test alerte email",
                    "photo": None
                },
                {
                    "section": "section_1",
                    "item": "item_2", 
                    "valeur": "Défectueux",
                    "notes": "Item défectueux - test alerte email",
                    "photo": None
                }
            ]
        }
        
        print(f"📋 Payload:")
        print(f"   - Modèle ID: {payload['modele_id']}")
        print(f"   - Date: {payload['date_inventaire']}")
        print(f"   - Items cochés: {len(payload['items_coches'])}")
        print(f"   - Alertes: {len(payload['alertes'])}")
        
        response = requests.post(url, json=payload, headers=self.headers)
        
        print(f"📊 Réponse HTTP: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            self.test_data["inventaire_id"] = data.get('id')
            print(f"✅ Inventaire créé avec succès")
            print(f"🆔 Inventaire ID: {self.test_data['inventaire_id']}")
            print(f"📄 Réponse: {json.dumps(data, indent=2)}")
            return True
        else:
            print(f"❌ Erreur création inventaire: {response.status_code}")
            print(f"📄 Réponse: {response.text}")
            return False
    
    def check_backend_logs(self):
        """Vérifier les logs backend pour les messages de debug"""
        print(f"\n📋 Vérification logs backend...")
        
        try:
            # Lire les 200 dernières lignes des logs backend
            log_command = "tail -n 200 /var/log/supervisor/backend.*.log"
            result = subprocess.run(log_command, shell=True, capture_output=True, text=True)
            
            if result.returncode == 0:
                logs = result.stdout
                print(f"✅ Logs récupérés ({len(logs.splitlines())} lignes)")
                
                # Chercher les messages de debug spécifiques
                debug_messages = {
                    "alertes_detectees": "🔍 DEBUG: Alertes détectées",
                    "email_envoye": "✅ DEBUG: Email d'alertes inventaire envoyé",
                    "erreur_email": "❌ DEBUG: Erreur envoi email",
                    "user_ids_recuperes": "user_ids_ou_emails récupérés"
                }
                
                found_messages = {}
                
                for line in logs.splitlines():
                    for key, message in debug_messages.items():
                        if message in line:
                            found_messages[key] = line.strip()
                            print(f"✅ Trouvé: {line.strip()}")
                
                # Vérifier les critères de succès
                success_criteria = {
                    "alertes_detectees": "alertes_detectees" in found_messages,
                    "email_envoye": "email_envoye" in found_messages,
                    "no_error": "erreur_email" not in found_messages,
                    "user_ids_non_vide": False
                }
                
                # Vérifier si user_ids_ou_emails est non vide
                if "user_ids_recuperes" in found_messages:
                    user_ids_line = found_messages["user_ids_recuperes"]
                    if "[]" not in user_ids_line and "vide" not in user_ids_line.lower():
                        success_criteria["user_ids_non_vide"] = True
                        print(f"✅ user_ids_ou_emails NON VIDE détecté")
                    else:
                        print(f"❌ user_ids_ou_emails VIDE détecté")
                
                # Résumé des critères
                print(f"\n📊 CRITÈRES DE SUCCÈS:")
                for criterion, passed in success_criteria.items():
                    status = "✅" if passed else "❌"
                    print(f"   {status} {criterion}: {passed}")
                
                all_passed = all(success_criteria.values())
                print(f"\n🎯 RÉSULTAT GLOBAL: {'✅ SUCCÈS' if all_passed else '❌ ÉCHEC'}")
                
                return all_passed
                
            else:
                print(f"❌ Erreur lecture logs: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Exception lecture logs: {str(e)}")
            return False
    
    def run_complete_test(self):
        """Exécuter le test complet du système d'alertes email"""
        print("🚀 DÉBUT DU TEST - SYSTÈME D'ALERTES EMAIL INVENTAIRES VÉHICULES")
        print(f"🏢 Tenant: {self.tenant_slug}")
        print(f"🌐 URL: {self.base_url}")
        print(f"👤 User: {self.credentials['email']}")
        print(f"🎯 Objectif: Tester le système d'alertes email après correction du bug")
        
        # Étape 1: Authentification
        print(f"\n{'='*60}")
        print(f"ÉTAPE 1: AUTHENTIFICATION")
        print(f"{'='*60}")
        if not self.authenticate():
            print("❌ ÉCHEC CRITIQUE: Impossible de s'authentifier")
            return False
        
        # Étape 2: Vérifier configuration emails
        print(f"\n{'='*60}")
        print(f"ÉTAPE 2: VÉRIFICATION CONFIGURATION EMAILS")
        print(f"{'='*60}")
        if not self.verify_email_configuration():
            print("⚠️ Configuration emails problématique, mais on continue...")
        
        # Étape 3: Récupérer véhicule
        print(f"\n{'='*60}")
        print(f"ÉTAPE 3: RÉCUPÉRATION VÉHICULE")
        print(f"{'='*60}")
        if not self.get_test_vehicle():
            print("❌ ÉCHEC: Impossible de récupérer un véhicule")
            return False
        
        # Étape 4: Récupérer modèle d'inventaire
        print(f"\n{'='*60}")
        print(f"ÉTAPE 4: RÉCUPÉRATION MODÈLE D'INVENTAIRE")
        print(f"{'='*60}")
        if not self.get_inventory_model():
            print("❌ ÉCHEC: Impossible de récupérer un modèle d'inventaire")
            return False
        
        # Étape 5: Créer inventaire avec alertes (TEST PRINCIPAL)
        print(f"\n{'='*60}")
        print(f"ÉTAPE 5: CRÉATION INVENTAIRE AVEC ALERTES (TEST PRINCIPAL)")
        print(f"{'='*60}")
        if not self.create_inventory_with_alerts():
            print("❌ ÉCHEC CRITIQUE: Impossible de créer l'inventaire avec alertes")
            return False
        
        # Attendre un peu pour que les logs soient écrits
        print(f"\n⏳ Attente 3 secondes pour l'écriture des logs...")
        time.sleep(3)
        
        # Étape 6: Vérifier logs backend
        print(f"\n{'='*60}")
        print(f"ÉTAPE 6: VÉRIFICATION LOGS BACKEND")
        print(f"{'='*60}")
        logs_success = self.check_backend_logs()
        
        # Résultat final
        print(f"\n{'='*80}")
        print(f"🎯 RÉSULTAT FINAL DU TEST")
        print(f"{'='*80}")
        
        if logs_success:
            print(f"🎉 SUCCÈS COMPLET!")
            print(f"✅ Le système d'alertes email fonctionne correctement")
            print(f"✅ Le bug a été corrigé avec succès")
            print(f"✅ La lecture depuis parametres.actifs.emails_notifications_inventaires_vehicules fonctionne")
        else:
            print(f"❌ ÉCHEC DU TEST")
            print(f"❌ Le système d'alertes email ne fonctionne pas comme attendu")
            print(f"❌ Vérifier les logs pour plus de détails")
        
        return logs_success

def main():
    """Point d'entrée principal"""
    tester = VehicleInventoryEmailTester()
    success = tester.run_complete_test()
    
    # Code de sortie
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()