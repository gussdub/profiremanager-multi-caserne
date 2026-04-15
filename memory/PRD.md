# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage fichiers**: Azure Blob Storage (profiremanagerdata / fichiers-clients)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`

## Import Historique Interventions (Avr 2026)
### Fonctionnalités
- **Import par chunks (disque)** : Chunks de 50 Mo stockés sur disque (pas en RAM) pour gérer les fichiers > 1 Go
- **Retry automatique** : 3 tentatives par chunk avec backoff exponentiel
- **Parsing** : CSV/XML/ZIP ProFireManager (DossierAdresse.csv, Intervention.csv)
- **Mapping intelligent** : numéro civique + rue + ville normalisés, + dossier_adresse_id
- **Mapping rétroactif** : Quand un bâtiment est créé, les interventions orphelines sont auto-reliées
- **Badge "Importé"** uniquement pour les importées, pas de badge pour les normales
- **Fiche bâtiment** : Toutes les interventions (normales + importées) par batiment_id ou correspondance d'adresse
- **Upload fichiers** vers Azure Blob Storage

### Import PFM Transfer Direct
- `POST /api/{tenant}/import/batch` — Record JSON avec données PremLigne
- `POST /api/{tenant}/files/upload?category=import-history&entity_type=Intervention&entity_id=uuid` — Fichiers multipart séparés
- Extraction profonde (deep_get) des données PremLigne imbriquées
- Gestion des doublons via file d'attente UI
- Lazy evaluation : RCCI, Remise de Propriété créés à la demande
- Normalisation des valeurs RCCI (cause_probable, ignition_source) pour correspondre aux codes frontend
- Génération PDF Remise de Propriété à la volée quand pas de fichier Azure stocké
- Format réponse upload compatible Transfer (id, url, size_bytes, mime)

### Flux PFM Transfer
1. Transfer envoie le record JSON → reçoit l'UUID de l'intervention
2. Transfer upload chaque fichier (photo, PDF) via multipart avec entity_id=UUID
3. Les fichiers sont stockés sur Azure et liés dans `stored_files`
4. Le frontend lit les photos depuis `stored_files` et les affiche dans l'onglet Photos
5. Le PDF de remise cherche d'abord dans `stored_files`, sinon génère à la volée

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- Migration Azure Blob Storage 100%
- Import historique interventions avec mapping intelligent et rétroactif
- Import PFM Transfer avec extraction complète (RCCI, Protection, DSI, Remise, Véhicules, Personnel)
- Correction onglets RCCI/Protection/DSI vides (avr 2026)
- Correction PDF Remise de Propriété 404 → génération à la volée (avr 2026)
- Format réponse /files/upload compatible PFM Transfer (avr 2026)
- UI Gestion des Doublons (Paramètres > Imports CSV)

## Backlog
- P2: Aperçu d'emails en temps réel dans les paramètres admin
