# PROFIREMANAGER — API D'IMPORT DIRECT
# =====================================
# Documentation pour intégrer ProFireManager Transfer
# afin qu'il envoie les données directement via API REST.

## CONFIGURATION REQUISE

```
API_URL = "https://profiremanager-backend.onrender.com"
TENANT = "demo"  # ou le slug du tenant cible
```

---

## ÉTAPE 1 : AUTHENTIFICATION

```
POST {API_URL}/api/{TENANT}/auth/login
Content-Type: application/json

Body:
{
  "email": "admin@example.com",
  "mot_de_passe": "motdepasse"
}

Réponse (200):
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "...", "nom": "...", "role": "admin" }
}
```

**Toutes les requêtes suivantes doivent inclure :**
```
Authorization: Bearer {access_token}
```

Le token expire après 24h. Si vous recevez un 401, refaites le login.

---

## ÉTAPE 2 : RÉCUPÉRER LES BÂTIMENTS (pour le mapping d'adresses)

```
GET {API_URL}/api/{TENANT}/batiments?limit=5000
Authorization: Bearer {token}

Réponse (200):
{
  "batiments": [
    {
      "id": "uuid-du-batiment",
      "adresse_civique": "108 rue WESTERN, Sutton",
      "ville": "Sutton",
      "nom_etablissement": "Résidence Tremblay",
      "actif": true
    },
    ...
  ]
}
```

Utilisez cette liste pour pré-matcher les adresses côté Transfer avant d'envoyer.

---

## ÉTAPE 3A : IMPORTER UNE INTERVENTION

```
POST {API_URL}/api/{TENANT}/interventions/import-direct
Content-Type: application/json
Authorization: Bearer {token}

Body:
{
  "external_call_id": "INT-2024-001",        // OBLIGATOIRE : identifiant unique (détection doublons)
  "type_intervention": "Feu de cheminée",     // Type/nature de l'intervention
  "address_full": "108 rue WESTERN",          // Adresse (sans la ville)
  "municipality": "Sutton",                   // Ville
  "xml_time_call_received": "2024-11-15T14:30:00",  // Date/heure ISO 8601
  "notes": "Commentaires...",                 // Notes/description (optionnel)
  "officer_in_charge_xml": "Capt. Tremblay",  // Officier en charge (optionnel)
  "code_feu": "211",                          // Code feu (optionnel)
  "niveau_risque": "Moyen",                   // Faible/Moyen/Élevé/Très élevé (optionnel)
  "status": "signed",                         // Statut : "signed" (défaut)
  "batiment_id": "uuid-du-batiment"           // Optionnel : si vous connaissez déjà le bâtiment
}
```

**Réponses possibles :**

```json
// Succès — intervention créée
{
  "status": "created",
  "id": "uuid-nouvelle-intervention",
  "batiment_id": "uuid-batiment-matché",     // null si aucun match
  "match_method": "auto_address"             // "auto_address", "script_migration", ou null
}

// Doublon — intervention déjà existante (même external_call_id)
{
  "status": "duplicate",
  "message": "Intervention INT-2024-001 déjà existante",
  "id": "uuid-existant"
}
```

**Notes :**
- Si `batiment_id` n'est pas fourni, l'API fait un **matching automatique** par adresse
- Le matching compare : numéro civique + nom de rue normalisé + ville
- Les doublons sont détectés par `external_call_id` — renvoyez le même sans risque

---

## ÉTAPE 3B : IMPORTER UN BÂTIMENT (DossierAdresse)

```
POST {API_URL}/api/{TENANT}/batiments
Content-Type: application/json
Authorization: Bearer {token}

Body:
{
  "adresse_civique": "93 chemin BOULANGER",   // OBLIGATOIRE
  "ville": "Sutton",                           // OBLIGATOIRE
  "code_postal": "J0E 2K0",                   // Optionnel
  "nom_etablissement": "Résidence Boulanger",  // Optionnel
  "annee_construction": 1985,                  // Optionnel (integer)
  "nombre_etages": 2,                          // Optionnel (integer)
  "nombre_logements": 4,                       // Optionnel (integer)
  "categorie_risque": "A",                     // A=Faible, B=Moyen, C=Élevé, D=Très élevé
  "notes_supplementaires": "Accès par côté...", // Optionnel
  "raison_sociale": "Nom entreprise",          // Optionnel
  "matricule_evaluation": "5014-25-1234"       // Optionnel (matricule du rôle foncier)
}

Réponse (200):
{
  "message": "Bâtiment créé. 3 intervention(s) historique(s) reliée(s) automatiquement.",
  "id": "uuid-nouveau-batiment",
  "interventions_linked": 3    // Nombre d'interventions orphelines auto-reliées
}
```

**Note importante :** Quand un bâtiment est créé, le système relie **automatiquement** toutes les interventions orphelines qui correspondent à cette adresse (mapping rétroactif).

---

## ÉTAPE 4 : UPLOAD D'UN FICHIER JOINT (photo, PDF)

```
POST {API_URL}/api/{TENANT}/files/upload?category=import-history&entity_type=intervention&entity_id={intervention_id}
Content-Type: multipart/form-data
Authorization: Bearer {token}

Body: file=@photo.jpg

Réponse (200):
{
  "id": "uuid-du-fichier",
  "blob_name": "profiremanager/.../uuid.jpg",
  "url": "https://...sas-url...",
  "original_filename": "photo.jpg",
  "size": 245678
}
```

**Types acceptés :** JPG, JPEG, PNG, GIF, WEBP, PDF
**Taille max par fichier :** ~10 Mo recommandé (passé via le serveur)

---

## ORDRE RECOMMANDÉ D'IMPORT

1. **Login** → obtenir le token
2. **Récupérer les bâtiments** → pour le pré-matching côté Transfer
3. **Importer les DossierAdresse** (bâtiments) en premier → crée les bâtiments
4. **Importer les Interventions** → le matching automatique trouvera les bâtiments créés en 3
5. **Upload des fichiers joints** → associés aux interventions/bâtiments créés

---

## GESTION DES ERREURS

| Code HTTP | Signification | Action |
|-----------|--------------|--------|
| 200 | Succès | Continuer |
| 401 | Token expiré | Refaire le login |
| 404 | Tenant/route non trouvé | Vérifier l'URL |
| 409/duplicate | Doublon détecté | Ignorer et continuer |
| 422 | Données invalides | Logger et continuer |
| 500 | Erreur serveur | Retry 3x avec backoff (2s, 4s, 8s) |
| 502/503 | Serveur indisponible | Attendre 30s et retry |

---

## DÉBIT RECOMMANDÉ

- **Interventions :** 1 requête à la fois, ~200ms par intervention → ~300/min
- **Fichiers :** 1 upload à la fois, vitesse dépend de la taille
- **Pas de parallélisme** nécessaire — le séquentiel est suffisant et plus fiable
- **Pause 100ms** entre chaque requête pour ne pas surcharger le serveur

---

## EXEMPLE COMPLET (Python)

```python
import requests
import time

API = "https://profiremanager-backend.onrender.com"
TENANT = "demo"

# 1. Login
r = requests.post(f"{API}/api/{TENANT}/auth/login", json={
    "email": "admin@email.com",
    "mot_de_passe": "password"
})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# 2. Importer une intervention
r = requests.post(f"{API}/api/{TENANT}/interventions/import-direct",
    headers={**headers, "Content-Type": "application/json"},
    json={
        "external_call_id": "INT-001",
        "type_intervention": "Feu de cheminée",
        "address_full": "108 rue WESTERN",
        "municipality": "Sutton",
        "xml_time_call_received": "2024-11-15T14:30:00",
    }
)
result = r.json()
print(f"Status: {result['status']}, ID: {result.get('id')}")

# 3. Upload une photo
if result["status"] == "created":
    with open("photo.jpg", "rb") as f:
        r = requests.post(
            f"{API}/api/{TENANT}/files/upload",
            headers=headers,
            params={"category": "import-history", "entity_type": "intervention", "entity_id": result["id"]},
            files={"file": ("photo.jpg", f, "image/jpeg")}
        )
    print(f"Photo uploadée: {r.json()['url']}")

time.sleep(0.1)  # Pause entre les requêtes
```
