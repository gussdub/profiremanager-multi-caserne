# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage fichiers**: Azure Blob Storage (profiremanagerdata / fichiers-clients)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`
- **Maps**: Leaflet + Nominatim (OpenStreetMap)
- **Weather**: Open-Meteo API

## Architecture Hybride Azure Blob Storage
- Fichiers lourds (PDF, JPG, PNG) → Azure Blob Storage (accès privé)
- Métadonnées → MongoDB (blob_name, content_type, size, tenant_id)
- Accès lecture → SAS URL temporaire (15 min) générée à chaque requête
- Service central → `services/azure_storage.py`

### Routes migrées vers Azure (100%)
| Route | Fichier | Avant | Après |
|---|---|---|---|
| Photo profil utilisateur | `routes/users.py` | base64 dans `photo_profil` | Azure → `photo_profil_blob_name` |
| Signature numérique | `routes/users.py` | base64 dans `signature_url` | Azure → `signature_blob_name` |
| Photo bâtiment (upload direct) | `routes/batiments.py` | base64 dans `photo_url` | Azure → `photo_blob_name` |
| Logo caserne | `routes/personnalisation.py` | base64 dans `logo_url` | Azure → `logo_blob_name` |
| Photos RCCI | `routes/interventions.py` | base64 dans `photo_base64` | Azure → `blob_name` |
| Photos dommages | `routes/interventions.py` | base64 dans `photo_base64` | Azure → `blob_name` |
| Photo défaut EPI | `routes/epi.py` | base64 dans `photo_defaut` | Azure → `photo_defaut_blob_name` |
| Images débogage | `routes/debogage.py` | base64 retourné | Azure → SAS URL |
| Import fichiers historique | `routes/import_interventions.py` | N/A | Azure → blob_name |

## Import Historique Interventions (Avr 2026)
### Fonctionnalités implémentées
- **Import par chunks** pour fichiers > 5 Mo (init → upload chunks → finalize)
- **Parsing CSV** formats ProFireManager (DossierAdresse.csv, Intervention.csv)
- **Parsing ZIP** avec manifest.json + fichiers CSV + dossier files/
- **Mapping intelligent d'adresses** : numéro civique + rue normalisée + ville (via `address_utils.py`)
- **Upload fichiers joints** (PDFs, JPGs) vers Azure Blob Storage
- **Collection unique** `interventions` avec flag `import_source: "history_import"`
- **Badge visuel "Importé"** dans l'onglet Historique des interventions
- **Section "Interventions"** dans la fiche bâtiment (via `HistoriqueInterventionsBatiment.jsx`)
- **Collection `import_dossier_adresses`** pour stocker les références de mapping

### Endpoints
| Endpoint | Méthode | Description |
|---|---|---|
| `/{tenant}/interventions/import-history/preview` | POST | Prévisualisation import (CSV/XML/ZIP) |
| `/{tenant}/interventions/import-history/execute` | POST | Exécution de l'import |
| `/{tenant}/interventions/import-history/init-upload` | POST | Init upload par chunks |
| `/{tenant}/interventions/import-history/upload-chunk` | POST | Upload d'un chunk |
| `/{tenant}/interventions/import-history/finalize-upload` | POST | Finalisation chunked upload |
| `/{tenant}/interventions/historique-import` | GET | Liste des interventions importées (filtres date/ville/bâtiment) |
| `/{tenant}/batiments/{id}/interventions-historique` | GET | Interventions liées à un bâtiment |
| `/{tenant}/import-history/dossier-adresses` | GET | Dossiers d'adresse importés |

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé, Fix audit/notifications/QR/inspections
- Export PDF de la fiche bâtiment avec photos annotées
- Blocage des notifications de planning en mode brouillon
- Deep linking des QR codes sur iPhone (PWA iOS) via localStorage
- Correction logique couleurs bornes d'incendie
- **Migration Azure Blob Storage complète** : service, SAS URLs 15 min, migration batch
- **Migration 100% routes vers Azure** : users, logo, interventions, EPI, débogage (Avr 2026)
- **Import historique interventions** : CSV/ZIP, mapping intelligent, chunks, badge visuel (Avr 2026)

## Backlog
- P2: Aperçu d'emails en temps réel dans les paramètres admin
- Future: Import complet format .pfmbundle.zip (JSONL, multi-entités, FK resolution)
