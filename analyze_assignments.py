#!/usr/bin/env python3
"""
ANALYSE DÉTAILLÉE DES ASSIGNATIONS
Comprendre pourquoi Guillaume n'est pas assigné alors que d'autres le sont
"""

import requests
import json

def analyze_assignments():
    # Authentification
    auth_url = "https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/auth/login"
    credentials = {"email": "gussdub@gmail.com", "mot_de_passe": "230685Juin+"}
    
    response = requests.post(auth_url, json=credentials)
    token = response.json().get('access_token')
    headers = {'Authorization': f'Bearer {token}'}
    
    print("🔍 ANALYSE DÉTAILLÉE DES ASSIGNATIONS")
    print("="*60)
    
    # 1. Récupérer les assignations existantes
    assignations_url = "https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/planning/assignations/2025-12-01"
    response = requests.get(assignations_url, headers=headers)
    assignations = response.json()
    
    print(f"📅 Assignations pour 2025-12-01: {len(assignations)}")
    
    # 2. Récupérer tous les utilisateurs
    users_url = "https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/users"
    response = requests.get(users_url, headers=headers)
    users = response.json()
    
    user_map = {u['id']: u for u in users}
    
    # 3. Récupérer les types de garde
    types_url = "https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/types-garde"
    response = requests.get(types_url, headers=headers)
    types_garde = response.json()
    
    type_map = {t['id']: t for t in types_garde}
    
    # 4. Analyser les utilisateurs assignés
    print(f"\n👥 UTILISATEURS ASSIGNÉS:")
    guillaume_id = "f4bdfa76-a2a2-4a01-9734-2cf534d04d31"
    
    for i, assignation in enumerate(assignations):
        user_id = assignation.get('user_id')
        user = user_map.get(user_id, {})
        type_garde_id = assignation.get('type_garde_id')
        type_garde = type_map.get(type_garde_id, {})
        
        nom = f"{user.get('prenom', '')} {user.get('nom', '')}"
        email = user.get('email', 'N/A')
        type_emploi = user.get('type_emploi', 'N/A')
        grade = user.get('grade', 'N/A')
        heures_max = user.get('heures_max_semaine', 'N/A')
        actif = user.get('actif', 'N/A')
        
        garde_nom = type_garde.get('nom', 'N/A')
        garde_heures = f"{type_garde.get('heure_debut', 'N/A')}-{type_garde.get('heure_fin', 'N/A')}"
        
        print(f"\n   {i+1}. {nom} ({email})")
        print(f"      - Type emploi: {type_emploi}")
        print(f"      - Grade: {grade}")
        print(f"      - Heures max/sem: {heures_max}")
        print(f"      - Actif: {actif}")
        print(f"      - Garde assignée: {garde_nom} ({garde_heures})")
        print(f"      - Date: {assignation.get('date')}")
    
    # 5. Analyser Guillaume spécifiquement
    guillaume = user_map.get(guillaume_id, {})
    
    print(f"\n🎯 PROFIL GUILLAUME DUBEAU:")
    print(f"   - Nom: {guillaume.get('prenom', '')} {guillaume.get('nom', '')}")
    print(f"   - Email: {guillaume.get('email', 'N/A')}")
    print(f"   - Type emploi: {guillaume.get('type_emploi', 'N/A')}")
    print(f"   - Grade: {guillaume.get('grade', 'N/A')}")
    print(f"   - Heures max/sem: {guillaume.get('heures_max_semaine', 'N/A')}")
    print(f"   - Actif: {guillaume.get('actif', 'N/A')}")
    
    # 6. Vérifier les disponibilités de Guillaume pour le 2025-12-01
    dispo_url = f"https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/disponibilites/{guillaume_id}"
    params = {"date_debut": "2025-12-01", "date_fin": "2025-12-01"}
    response = requests.get(dispo_url, headers=headers, params=params)
    
    if response.status_code == 200:
        disponibilites = response.json()
        print(f"\n📅 DISPONIBILITÉS GUILLAUME POUR 2025-12-01:")
        
        if disponibilites:
            for dispo in disponibilites:
                statut = dispo.get('statut', 'N/A')
                heures = f"{dispo.get('heure_debut', 'N/A')}-{dispo.get('heure_fin', 'N/A')}"
                origine = dispo.get('origine', 'manuelle')
                print(f"   - {statut}: {heures} (origine: {origine})")
        else:
            print(f"   ❌ Aucune disponibilité déclarée pour cette date")
    else:
        print(f"   ❌ Erreur récupération disponibilités: {response.status_code}")
    
    # 7. Comparer avec les utilisateurs assignés
    print(f"\n🔍 COMPARAISON GUILLAUME VS UTILISATEURS ASSIGNÉS:")
    
    for assignation in assignations:
        user_id = assignation.get('user_id')
        user = user_map.get(user_id, {})
        
        print(f"\n   Utilisateur assigné: {user.get('prenom', '')} {user.get('nom', '')}")
        print(f"   Guillaume vs Assigné:")
        print(f"   - Type emploi: {guillaume.get('type_emploi')} vs {user.get('type_emploi')}")
        print(f"   - Grade: {guillaume.get('grade')} vs {user.get('grade')}")
        print(f"   - Heures max: {guillaume.get('heures_max_semaine')} vs {user.get('heures_max_semaine')}")
        print(f"   - Actif: {guillaume.get('actif')} vs {user.get('actif')}")
        
        # Vérifier les disponibilités de cet utilisateur
        dispo_url = f"https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/disponibilites/{user_id}"
        params = {"date_debut": "2025-12-01", "date_fin": "2025-12-01"}
        response = requests.get(dispo_url, headers=headers, params=params)
        
        if response.status_code == 200:
            user_dispos = response.json()
            disponibles = [d for d in user_dispos if d.get('statut') == 'disponible']
            print(f"   - Disponibilités: {len(disponibles)} disponibles")
            
            if disponibles:
                for dispo in disponibles[:2]:  # Afficher les 2 premières
                    heures = f"{dispo.get('heure_debut', 'N/A')}-{dispo.get('heure_fin', 'N/A')}"
                    print(f"     * {heures}")
        else:
            print(f"   - Disponibilités: Erreur {response.status_code}")
    
    # 8. Vérifier les paramètres d'attribution
    print(f"\n⚙️ PARAMÈTRES D'ATTRIBUTION:")
    
    params_url = "https://pdf-fiche-batiment.preview.emergentagent.com/api/demo/parametres/remplacements"
    response = requests.get(params_url, headers=headers)
    
    if response.status_code == 200:
        params = response.json()
        
        cles_importantes = [
            'attribution_automatique_activee',
            'heures_supplementaires_activees',
            'mode_notification',
            'delai_attente_heures'
        ]
        
        for cle in cles_importantes:
            valeur = params.get(cle, 'NON DÉFINI')
            print(f"   - {cle}: {valeur}")
    
    print(f"\n" + "="*60)
    print(f"🎯 CONCLUSION PRÉLIMINAIRE:")
    print(f"   - L'attribution automatique FONCTIONNE (2 assignations créées)")
    print(f"   - Guillaume n'est PAS sélectionné par l'algorithme")
    print(f"   - Besoin d'analyser les critères de sélection spécifiques")

if __name__ == "__main__":
    analyze_assignments()