#!/usr/bin/env python3
"""
Script FINAL pour corriger les permissions Employé
Utilise "rapport-heures" (le bon nom) au lieu de "horaire"
"""
import requests
import json

# Configuration
API_URL = "https://fire-inquiry-portal.preview.emergentagent.com/api"
TENANT = "shefford"
EMAIL = "gussdub@gmail.com"
PASSWORD = "230685Juin+"

# 1. Login
print("1️⃣  Connexion...")
response = requests.post(
    f"{API_URL}/{TENANT}/auth/login",
    json={"email": EMAIL, "mot_de_passe": PASSWORD}
)
token = response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}
print(f"✅ Token obtenu")

# 2. Récupérer les permissions actuelles d'Employé
print("\n2️⃣  Récupération permissions Employé...")
response = requests.get(
    f"{API_URL}/{TENANT}/access-types/employe",
    headers=headers
)
employe = response.json()
print(f"✅ Employé chargé: {employe.get('nom')}")

# 3. Modifier les permissions
print("\n3️⃣  Modification des permissions...")
permissions = employe.get("permissions", {})
modules = permissions.get("modules", {})

print(f"   Modules présents AVANT: {list(modules.keys())[:5]}...")

# S'assurer que planning existe
if "planning" not in modules:
    modules["planning"] = {"access": True, "actions": ["voir"], "tabs": {}}
if "tabs" not in modules["planning"]:
    modules["planning"]["tabs"] = {}

# ✅ CORRECTION: Utiliser "rapport-heures" et pas "horaire"
modules["planning"]["tabs"]["rapport-heures"] = {
    "access": True,
    "actions": ["voir", "exporter"]
}

# S'assurer que actifs existe
if "actifs" not in modules:
    modules["actifs"] = {"access": True, "actions": ["voir"], "tabs": {}}
if "tabs" not in modules["actifs"]:
    modules["actifs"]["tabs"] = {}

# Ajouter historique à eau
modules["actifs"]["tabs"]["eau"] = {
    "access": True,
    "actions": ["voir", "historique"]
}

print(f"   Planning > Rapport-heures: {modules['planning']['tabs']['rapport-heures']}")
print(f"   Actifs > Eau: {modules['actifs']['tabs']['eau']}")
print(f"   Total modules envoyés: {len(modules)}")

# 4. Sauvegarder LA STRUCTURE COMPLÈTE
print("\n4️⃣  Sauvegarde COMPLÈTE...")
payload = {
    "nom": employe["nom"],
    "description": employe.get("description", ""),
    "permissions": {"modules": modules}  # TOUTE la structure
}

response = requests.put(
    f"{API_URL}/{TENANT}/access-types/employe",
    headers=headers,
    json=payload
)

if response.status_code == 200:
    print(f"✅ {response.json().get('message')}")
else:
    print(f"❌ Erreur: {response.json()}")
    exit(1)

# 5. Vérifier
print("\n5️⃣  Vérification...")
response = requests.get(
    f"{API_URL}/{TENANT}/access-types/employe",
    headers=headers
)
employe_updated = response.json()
modules_updated = employe_updated.get("permissions", {}).get("modules", {})

rapport_heures = modules_updated.get("planning", {}).get("tabs", {}).get("rapport-heures", {})
eau = modules_updated.get("actifs", {}).get("tabs", {}).get("eau", {})

print(f"   Rapport-heures actions: {rapport_heures.get('actions', [])}")
print(f"   Eau actions: {eau.get('actions', [])}")

if "exporter" in rapport_heures.get("actions", []) and "historique" in eau.get("actions", []):
    print("\n🎉 ✅ SUCCÈS COMPLET ! Les permissions sont correctement sauvegardées et récupérées !")
    print("\n📋 Résumé:")
    print(f"   - Planning > Rapport-heures : Voir + Exporter ✅")
    print(f"   - Actifs > Eau : Voir + Historique ✅")
else:
    print("\n⚠️ ATTENTION ! Vérification:")
    print(f"   - Rapport-heures a 'exporter' ? {'OUI' if 'exporter' in rapport_heures.get('actions', []) else 'NON'}")
    print(f"   - Eau a 'historique' ? {'OUI' if 'historique' in eau.get('actions', []) else 'NON'}")
    exit(1)
