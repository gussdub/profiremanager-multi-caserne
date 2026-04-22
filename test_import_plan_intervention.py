#!/usr/bin/env python3
"""
Script de test pour l'import d'un plan d'intervention depuis PFM Transfer
Utilise le fichier PlanIntervention.json fourni par l'utilisateur
"""
import json
import sys
import requests

# Configuration
BACKEND_URL = "https://fire-alert-cauca.preview.emergentagent.com/api"
TENANT_SLUG = "demo"
EMAIL = "gussdub@gmail.com"
PASSWORD = "230685Juin+"

# ID du bâtiment de test (à créer ou utiliser un existant)
BATIMENT_ID_TEST = "batiment_test_plan_intervention"


def login():
    """Authentification pour récupérer le token"""
    print("🔐 Connexion...")
    response = requests.post(
        f"{BACKEND_URL}/{TENANT_SLUG}/auth/login",
        json={"email": EMAIL, "mot_de_passe": PASSWORD}
    )
    
    if response.status_code == 200:
        token = response.json().get("access_token")
        print("✅ Connexion réussie")
        return token
    else:
        print(f"❌ Erreur de connexion: {response.status_code}")
        print(response.text)
        sys.exit(1)


def create_test_batiment(token):
    """Crée un bâtiment de test si nécessaire"""
    print(f"\n🏢 Création du bâtiment de test...")
    
    batiment = {
        "id": BATIMENT_ID_TEST,
        "nom_etablissement": "28 PRINCIPALE SUD (Test Plan Intervention)",
        "adresse_civique": "28",
        "rue": "PRINCIPALE SUD",
        "ville": "Sutton",
        "code_postal": "J0E 2K0",
        "categorie": "Résidentiel",
        "actif": True
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Vérifier si existe déjà
    response = requests.get(
        f"{BACKEND_URL}/{TENANT_SLUG}/dossiers-adresses/{BATIMENT_ID_TEST}",
        headers=headers
    )
    
    if response.status_code == 200:
        print("✅ Bâtiment de test existe déjà")
        return BATIMENT_ID_TEST
    
    # Créer le bâtiment
    response = requests.post(
        f"{BACKEND_URL}/{TENANT_SLUG}/dossiers-adresses",
        json=batiment,
        headers=headers
    )
    
    if response.status_code in [200, 201]:
        print("✅ Bâtiment de test créé")
        return BATIMENT_ID_TEST
    else:
        print(f"⚠️ Erreur création bâtiment: {response.status_code}")
        print(response.text)
        return None


def import_plan_intervention(token, pfm_data):
    """Importe le plan d'intervention"""
    print("\n📋 Import du plan d'intervention...")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "batiment_id": BATIMENT_ID_TEST,
        "pfm_data": pfm_data
    }
    
    response = requests.post(
        f"{BACKEND_URL}/{TENANT_SLUG}/plan-intervention/import",
        json=payload,
        headers=headers
    )
    
    if response.status_code == 200:
        result = response.json()
        print("✅ Plan d'intervention importé avec succès")
        print(f"   - Plan ID: {result.get('plan_id')}")
        print(f"   - Photos: {result.get('photos_count')}")
        print(f"   - PDF disponible: {result.get('pdf_available')}")
        print(f"\n💡 {result.get('note')}")
        return result.get('plan_id')
    else:
        print(f"❌ Erreur import: {response.status_code}")
        print(response.text)
        return None


def get_plan_intervention(token, batiment_id):
    """Récupère le plan d'intervention d'un bâtiment"""
    print(f"\n📖 Récupération du plan pour le bâtiment {batiment_id}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    response = requests.get(
        f"{BACKEND_URL}/{TENANT_SLUG}/plan-intervention/batiment/{batiment_id}",
        headers=headers
    )
    
    if response.status_code == 200:
        data = response.json()
        if data.get("plan_disponible"):
            plan = data.get("plan")
            print("✅ Plan récupéré avec succès")
            print(f"\n📊 Résumé du plan:")
            print(f"   - Nom: {plan.get('nom')}")
            print(f"   - Adresse: {plan.get('adresse_complete')}")
            print(f"   - Propriétaire: {plan.get('proprietaire')}")
            print(f"   - Type occupation: {plan.get('type_occupation')}")
            print(f"   - Niveau risque: {plan.get('niveau_risque')}")
            
            if plan.get('alimentation_eau'):
                eau = plan['alimentation_eau']
                print(f"\n💧 Alimentation en eau:")
                print(f"   - Débit requis: {eau.get('debit_requis')}")
                print(f"   - Débit disponible: {eau.get('debit_disponible')}")
                print(f"   - Déficit: {eau.get('deficit_debit')}")
            
            print(f"\n📸 Photos: {len(plan.get('photos', []))}")
            for photo in plan.get('photos', []):
                print(f"   - {photo.get('nom')}")
            
            if plan.get('pdf_plan'):
                print(f"\n📄 PDF: {plan['pdf_plan'].get('nom')}")
            
            return plan
        else:
            print("⚠️ Aucun plan disponible pour ce bâtiment")
            return None
    else:
        print(f"❌ Erreur récupération: {response.status_code}")
        print(response.text)
        return None


def main():
    """Fonction principale"""
    print("=" * 60)
    print("🧪 TEST IMPORT PLAN D'INTERVENTION PFM TRANSFER")
    print("=" * 60)
    
    # Charger le JSON PFM
    print("\n📁 Chargement du fichier PlanIntervention.json...")
    try:
        # Le fichier devrait être dans le même répertoire
        with open('/tmp/PlanIntervention.json', 'r', encoding='utf-8') as f:
            pfm_data = json.load(f)
        print(f"✅ Fichier chargé ({len(json.dumps(pfm_data))} octets)")
    except FileNotFoundError:
        print("❌ Fichier PlanIntervention.json introuvable")
        print("💡 Téléchargez le fichier depuis le lien fourni et placez-le dans /tmp/")
        sys.exit(1)
    
    # Étapes de test
    token = login()
    
    # Créer ou récupérer le bâtiment de test
    batiment_id = create_test_batiment(token)
    if not batiment_id:
        print("❌ Impossible de créer le bâtiment de test")
        sys.exit(1)
    
    # Importer le plan
    plan_id = import_plan_intervention(token, pfm_data)
    if not plan_id:
        print("❌ Échec de l'import")
        sys.exit(1)
    
    # Récupérer et afficher le plan
    plan = get_plan_intervention(token, batiment_id)
    
    print("\n" + "=" * 60)
    if plan:
        print("✅ TEST RÉUSSI - Le plan d'intervention a été importé")
        print("\n🔗 Prochaines étapes:")
        print("1. Uploader les photos sectorielles via l'endpoint /upload-media")
        print("2. Uploader le PDF du plan complet")
        print("3. Tester l'affichage dans le frontend")
        print(f"\n💡 URL Frontend: {BACKEND_URL.replace('/api', '')}")
    else:
        print("⚠️ TEST INCOMPLET - Vérifiez les logs ci-dessus")
    print("=" * 60)


if __name__ == "__main__":
    main()
