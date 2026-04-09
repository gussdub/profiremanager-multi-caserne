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
- Fichiers lourds (PDF, JPG) → Azure Blob Storage (accès privé)
- Métadonnées → MongoDB (blob_name, content_type, size, tenant_id)
- Accès lecture → SAS URL temporaire (15 min)
- Service central → `services/azure_storage.py`
- Script migration → `scripts/migrate_to_azure.py` (idempotent)

### Migration effectuée
| Collection | Avant | Après | Statut |
|---|---|---|---|
| photos_inventaires | base64 dans MongoDB | Azure + blob_name | ✅ 5/5 |
| batiments.photo_url | base64 data URL | Azure + photo_blob_name | ✅ 1/1 |
| vehicules.qr_code | base64 data URL | Azure + qr_code_blob_name | ✅ 3/3 |
| users.photo_profil | base64 data URL | Azure + photo_profil_blob_name | ✅ 1/1 |
| stored_files | Emergent Object Storage | Azure | ⚠️ 9/55 (46 Emergent inaccessible) |

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé, Fix audit/notifications/QR/inspections
- **Migration Azure Blob Storage** complète : service, SAS URLs 15 min, migration batch des données existantes

## Backlog
- P1: Tester l'import d'historique d'interventions (CSV/XML/ZIP)
- P2: Migrer les 46 stored_files Emergent restants en production
- Future: Aperçu d'emails en temps réel dans les paramètres admin
