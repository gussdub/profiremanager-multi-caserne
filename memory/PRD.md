# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage fichiers**: Azure Blob Storage (compte: profiremanagerdata, conteneur: fichiers-clients)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`
- **Maps**: Leaflet + Nominatim (OpenStreetMap)
- **Weather**: Open-Meteo API

## Architecture Hybride Azure Blob Storage
- **Fichiers lourds** (photos, PDFs) → Azure Blob Storage (accès privé)
- **Métadonnées** (ID client, blob_name, date, type, taille) → MongoDB
- **Accès lecture** → SAS URL temporaire (15 minutes) générée à la demande
- **Service central** → `services/azure_storage.py` (put_object, get_object, delete_object, generate_sas_url)
- **Rétrocompatibilité** → `utils/object_storage.py` redirige vers Azure, anciennes photos base64 legacy toujours servies

### Endpoints stockage
- `POST /api/{tenant}/files/upload` — Upload fichier → Azure, retourne SAS URL
- `GET /api/{tenant}/files/{id}/sas-url` — Génère SAS URL temporaire (15 min)
- `GET /api/{tenant}/files/{id}/download?auth=token` — Redirige (302) vers Azure SAS URL
- `POST /api/{tenant}/prevention/upload-photo` — Upload photo prévention → Azure
- `POST /api/{tenant}/inventaires/upload-photo` — Upload photo inventaire → Azure

### Migration photos
| Module | Avant | Après |
|--------|-------|-------|
| Photos bâtiments | base64 dans MongoDB | Azure + blob_name dans MongoDB |
| Photos galerie | Emergent Object Storage | Azure + blob_name dans photos[] |
| Photos inspections SAAQ | base64 dans photo_urls | Azure + photo_metadata[] |
| Photos bornes/points d'eau | base64 inline | Azure + blob_name |
| QR codes véhicules | base64 dans MongoDB | Azure + qr_code_blob_name |
| Photos prévention | base64 dans photos_prevention | Azure + blob_name |
| Photos inventaires | base64 dans photos_inventaires | Azure + blob_name |
| Fichiers généraux | Emergent Object Storage | Azure (stored_files collection) |

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé (10 templates)
- Fix bug audit modal, Fix bug notifications planning (brouillon)
- Drag & drop photos + légendes, Export PDF fiche bâtiment
- Fix QR code deep linking PWA iOS
- Fix logique couleurs inspections bornes
- **Migration Azure Blob Storage** — 12/12 tests passés. Service central, SAS URLs 15 min, rétrocompatibilité legacy, tous les modules migrés

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin
