#!/usr/bin/env python3
"""
Script de test pour corriger les permissions Employé
"""
import requests
import json

# Configuration
API_URL = "https://employee-access-ui.preview.emergentagent.com/api"
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
print(f"✅ Token obtenu: {token[:30]}...")

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

# S'assurer que planning existe
if "planning" not in modules:
    modules["planning"] = {"access": True, "actions": ["voir"], "tabs": {}}
if "tabs" not in modules["planning"]:
    modules["planning"]["tabs"] = {}

# Ajouter horaire avec voir + exporter
modules["planning"]["tabs"]["horaire"] = {
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

print(f"   Planning > Horaire: {modules['planning']['tabs']['horaire']}")
print(f"   Actifs > Eau: {modules['actifs']['tabs']['eau']}")

# 4. Sauvegarder
print("\n4️⃣  Sauvegarde...")
payload = {
    "nom": employe["nom"],
    "description": employe.get("description", ""),
    "permissions": {"modules": modules}
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

horaire = modules_updated.get("planning", {}).get("tabs", {}).get("horaire", {})
eau = modules_updated.get("actifs", {}).get("tabs", {}).get("eau", {})

print(f"   Horaire actions: {horaire.get('actions', [])}")
print(f"   Eau actions: {eau.get('actions', [])}")

if "exporter" in horaire.get("actions", []) and "historique" in eau.get("actions", []):
    print("\n🎉 ✅ SUCCÈS ! Les permissions sont correctement sauvegardées !")
else:
    print("\n❌ ÉCHEC ! Les permissions n'ont pas été sauvegardées correctement.")
    exit(1)
