# DIRECTIVES POUR CLAUDE CODE — Script de Migration ProFireManager
# ================================================================
# Contexte : Créer un script Python CLI qui tourne sur le Mac de l'utilisateur
# pour importer les données exportées depuis ProFireManager Transfer
# vers ProFireManager (API REST sur profiremanager-backend.onrender.com).

## OBJECTIF
Créer un script Python `migration_pfm.py` qui :
1. Prend en entrée un fichier `.pfmtransfer.zip` (peut faire 1-5 Go)
2. Le décompresse localement (pas de limite RAM/disque)
3. Parse le CSV contenu (Intervention.csv, DossierAdresse.csv, etc.)
4. Fait le mapping d'adresses avec les bâtiments existants via l'API
5. Envoie les données par petits lots à l'API ProFireManager
6. Upload les fichiers joints (photos/PDFs) un par un
7. Affiche une barre de progression et peut reprendre si interrompu

## FORMAT DES FICHIERS D'ENTRÉE

### Structure d'un .pfmtransfer.zip :
```
manifest.json          → {"entityType": "Intervention" ou "DossierAdresse", "exportDate": "...", "filesCount": N}
Intervention.csv       → CSV avec colonnes variables (voir mapping ci-dessous)
DossierAdresse.csv     → CSV avec colonnes: ID, Matricule, Adresse, Année construction, etc.
files/                 → Dossier contenant les fichiers joints (PDFs, JPGs, PNGs)
  12345.pdf
  12345.jpg
  67890_1.jpg
  ...
```

### Colonnes CSV Intervention (noms variables, faire un mapping souple) :
- Identifiant : "No Intervention", "No_Intervention", "ID", "No Carte"
- Type : "Type", "Type Intervention", "Nature"
- Adresse : "Adresse", "Lieu", "Address" (format: "93 chemin BOULANGER, Sutton")
- Ville : "Ville", "Municipalité", "Municipality" (peut aussi être extraite de l'adresse après la virgule)
- Date : "Date", "Date Appel", "Date Intervention" (formats: YYYY-MM-DD, DD/MM/YYYY)
- Heure : "Heure", "Heure Appel" (format: HH:MM ou HH:MM:SS)
- Notes : "Description", "Note", "Notes", "Commentaire"
- Officier : "Officier", "Officier en charge"
- Lien bâtiment : "Dossier Adresse ID", "ID Dossier Adresse" (ID PFM du bâtiment)

### Colonnes CSV DossierAdresse :
- ID, Matricule, Adresse (format: "93 chemin BOULANGER, Sutton")
- Année construction, Nbr etage, Nbr logement
- Note, Raison sociale, Subdivision
- I d categ risque (1=Faible, 2=Moyen, 3=Élevé, 4=Très élevé)

## API PROFIREMANAGER

### Base URL : https://profiremanager-backend.onrender.com/api/{tenant_slug}
### Tenant : "demo" (ou passé en paramètre)

### 1. Authentification
```
POST /api/{tenant}/auth/login
Body: {"email": "...", "mot_de_passe": "..."}
Response: {"access_token": "eyJ..."}
→ Utiliser Header: Authorization: Bearer {token}
```

### 2. Lister les bâtiments existants (pour le mapping d'adresses)
```
GET /api/{tenant}/batiments?limit=1000
Response: {"batiments": [{"id": "...", "adresse_civique": "108 rue WESTERN, Sutton", "ville": "Sutton", ...}]}
```

### 3. Créer une intervention importée
```
POST /api/{tenant}/interventions/import-direct
Body: {
  "external_call_id": "INT-001",
  "type_intervention": "Feu de cheminée",
  "address_full": "108 rue WESTERN",
  "municipality": "Sutton",
  "xml_time_call_received": "2024-11-15T14:30:00",
  "notes": "...",
  "officer_in_charge_xml": "...",
  "status": "signed",
  "import_source": "history_import",
  "batiment_id": "uuid-du-batiment-si-match" (optionnel)
}
```

### 4. Upload un fichier joint
```
POST /api/{tenant}/files/upload?category=import-history&entity_type=intervention&entity_id={intervention_id}
Body: multipart/form-data avec file=@photo.jpg
```

## LOGIQUE DE MAPPING D'ADRESSES

Pour relier une intervention à un bâtiment existant :
1. Normaliser les adresses : minuscules, retirer les accents, espaces multiples → un seul
2. Extraire le numéro civique (premier nombre dans l'adresse)
3. Extraire le nom de rue (après le numéro, avant la virgule)
4. Comparer : même numéro civique + nom de rue similaire (> 85%) + même ville
5. Attention aux variations : "app. 1", "suite 2", "app 1" sont des unités différentes
6. Si "Dossier Adresse ID" est fourni dans le CSV, utiliser la table DossierAdresse pour trouver l'adresse exacte

## FONCTIONNALITÉS DU SCRIPT

### Usage :
```bash
python3 migration_pfm.py \
  --file Intervention.pfmtransfer.zip \
  --tenant demo \
  --email admin@example.com \
  --password "..." \
  --api-url https://profiremanager-backend.onrender.com \
  --batch-size 50 \
  --resume  # reprendre là où on s'est arrêté
```

### Fonctionnalités requises :
- [ ] Barre de progression (tqdm ou print simple)
- [ ] Mode dry-run (--dry-run) pour tester sans rien créer
- [ ] Reprise : stocker les IDs déjà importés dans un fichier local `migration_state.json`
- [ ] Rapport final : X créés, X doublons ignorés, X matchés à un bâtiment, X erreurs
- [ ] Logs détaillés dans un fichier `migration.log`
- [ ] Gestion des erreurs : retry 3x sur les erreurs réseau, continuer sur les erreurs individuelles
- [ ] Mode verbose (--verbose) pour voir chaque opération
- [ ] Upload des fichiers joints avec association à l'intervention

### Dépendances Python (pip install) :
- requests
- tqdm (optionnel, pour la barre de progression)

## ENDPOINT À CRÉER CÔTÉ PROFIREMANAGER (je m'en occupe)

Je vais créer un endpoint `POST /api/{tenant}/interventions/import-direct` qui accepte
une intervention individuelle et la crée directement en base. C'est plus simple et plus
fiable que le flow preview/execute actuel.

## NOTES IMPORTANTES
- Le fichier ZIP peut contenir des milliers de fichiers dans /files/ (photos, PDFs)
- Chaque fichier dans /files/ est nommé par l'ID PFM de l'entité (ex: 12345.pdf, 12345.jpg)
- Un même ID peut avoir plusieurs fichiers (12345.pdf + 12345.jpg + 12345_1.jpg)
- Le script doit pouvoir gérer des ZIP de 1 à 5+ Go
- La connexion internet peut être lente — les uploads doivent être résilients
- Le script sera réutilisé pour les DossierAdresse (bâtiments) aussi
