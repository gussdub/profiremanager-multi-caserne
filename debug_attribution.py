#!/usr/bin/env python3
"""
DEBUG ATTRIBUTION AUTOMATIQUE - Guillaume Dubeau
Test spécifique pour capturer les logs détaillés
"""

import requests
import json
import time

def test_attribution_with_logs():
    # Authentification
    auth_url = "https://intelligent-import-1.preview.emergentagent.com/api/demo/auth/login"
    credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
    
    print("🔐 Authentification...")
    response = requests.post(auth_url, json=credentials)
    if response.status_code != 200:
        print(f"❌ Échec authentification: {response.status_code}")
        return
    
    token = response.json().get('access_token')
    headers = {'Authorization': f'Bearer {token}'}
    print("✅ Authentification réussie")
    
    # Test attribution pour une semaine spécifique
    print("\n🚀 Test attribution automatique pour semaine 2025-12-01...")
    
    attribution_url = "https://intelligent-import-1.preview.emergentagent.com/api/demo/planning/attribution-auto"
    params = {
        "semaine_debut": "2025-12-01",
        "reset": True  # Reset existing assignments
    }
    
    start_time = time.time()
    response = requests.post(attribution_url, headers=headers, params=params)
    end_time = time.time()
    
    print(f"⏱️ Temps de réponse: {end_time - start_time:.2f}s")
    print(f"📊 Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"📋 Réponse: {json.dumps(result, indent=2)}")
        
        # Si c'est un processus en arrière-plan, attendre et vérifier
        task_id = result.get('task_id')
        if task_id:
            print(f"\n🔍 Suivi du processus (Task ID: {task_id})...")
            
            # Attendre quelques secondes pour que le processus se lance
            time.sleep(3)
            
            # Vérifier les assignations créées
            assignations_url = f"https://intelligent-import-1.preview.emergentagent.com/api/demo/planning/assignations/2025-12-01"
            response = requests.get(assignations_url, headers=headers)
            
            if response.status_code == 200:
                assignations = response.json()
                print(f"📅 Assignations trouvées pour 2025-12-01: {len(assignations)}")
                
                # Chercher Guillaume spécifiquement
                guillaume_id = "f4bdfa76-a2a2-4a01-9734-2cf534d04d31"
                guillaume_assignations = [a for a in assignations if a.get('user_id') == guillaume_id]
                
                print(f"👤 Assignations de Guillaume: {len(guillaume_assignations)}")
                
                if guillaume_assignations:
                    for i, assignation in enumerate(guillaume_assignations):
                        print(f"   {i+1}. Date: {assignation.get('date')}, Type: {assignation.get('type_garde_id')}")
                else:
                    print("❌ Aucune assignation pour Guillaume")
                
                # Afficher toutes les assignations pour debug
                print(f"\n📋 Toutes les assignations de la semaine:")
                for i, assignation in enumerate(assignations):
                    user_id = assignation.get('user_id', 'N/A')
                    date = assignation.get('date', 'N/A')
                    type_garde = assignation.get('type_garde_id', 'N/A')
                    print(f"   {i+1}. User: {user_id[:8]}..., Date: {date}, Type: {type_garde}")
            else:
                print(f"❌ Erreur récupération assignations: {response.status_code}")
    else:
        print(f"❌ Erreur attribution: {response.status_code} - {response.text}")
    
    # Test avec une période plus courte
    print(f"\n🧪 Test avec période plus courte (1 jour seulement)...")
    
    params_court = {
        "semaine_debut": "2025-12-02",
        "semaine_fin": "2025-12-02",
        "reset": True
    }
    
    response = requests.post(attribution_url, headers=headers, params=params_court)
    print(f"📊 Status test court: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"📋 Réponse test court: {json.dumps(result, indent=2)}")
    else:
        print(f"❌ Erreur test court: {response.text}")

if __name__ == "__main__":
    test_attribution_with_logs()