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
- Script migration → `scripts/migrate_to_azure.py` (idempotent)

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
| Photo bâtiment (prévention) | `routes/prevention.py` | Déjà Azure | Azure ✅ |
| Photos inventaires | `routes/prevention_media.py` | Déjà Azure | Azure ✅ |
| QR Codes véhicules | `routes/actifs.py` | Déjà Azure | Azure ✅ |
| Fichiers généraux | `routes/file_storage.py` | Déjà Azure | Azure ✅ |
| Import bâtiments (ZIP) | `routes/batiments_import.py` | Déjà Azure (via proxy) | Azure direct ✅ |

### Données existantes migrées
| Collection | Avant | Après | Statut |
|---|---|---|---|
| photos_inventaires | base64 dans MongoDB | Azure + blob_name | ✅ 5/5 |
| batiments.photo_url | base64 data URL | Azure + photo_blob_name | ✅ 1/1 |
| vehicules.qr_code | base64 data URL | Azure + qr_code_blob_name | ✅ 3/3 |
| users.photo_profil | base64 data URL | Azure + photo_profil_blob_name | ✅ 1/1 |
| users.signature_url | base64 data URL | Azure + signature_blob_name | ✅ 1/1 |
| tenants.logo_url | base64 data URL | Azure + logo_blob_name | ✅ 2/2 |
| stored_files | Emergent Object Storage | Azure | ✅ 55/55 |

### Résolution SAS URLs côté lecture
| Endpoint | Fichier | Champs résolus |
|---|---|---|
| POST /auth/login | `routes/auth.py` | photo_profil_blob_name → photo_profil |
| GET /auth/me | `routes/auth.py` | photo_profil_blob_name → photo_profil |
| GET /users | `routes/personnel.py` | photo_profil_blob_name, signature_blob_name |
| GET /users/{id} | `routes/personnel.py` | photo_profil_blob_name, signature_blob_name |
| GET /personnalisation | `routes/personnalisation.py` | logo_blob_name → logo_url |
| GET /public/branding | `routes/personnalisation.py` | logo_blob_name → logo_url |
| GET /prevention/batiments | `routes/prevention.py` | photo_blob_name, photos[].blob_name |
| GET /interventions/{id}/rcci | `routes/interventions.py` | photos[].blob_name → photo_url |
| GET /interventions/{id}/photos-dommages | `routes/interventions.py` | blob_name → photo_url |
| GET /epi/demandes-remplacement | `routes/epi.py` | photo_defaut_blob_name → photo_defaut |

### PDF Generation (Azure logo)
| Fichier | Fonction |
|---|---|
| `server.py` | `create_pdf_header_elements()` via `get_logo_bytes()` |
| `routes/rondes_securite.py` | Rapport rondes via `get_logo_bytes()` |
| `routes/interventions.py` | Remise propriété via `get_logo_bytes()` |
| `routes/prevention_reports.py` | Rapport bâtiment via `get_object()` |
| `routes/avis_non_conformite.py` | Signature via `get_object()` (Azure) ou base64 (legacy) |

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé, Fix audit/notifications/QR/inspections
- Export PDF de la fiche bâtiment avec photos annotées
- Blocage des notifications de planning en mode brouillon
- Deep linking des QR codes sur iPhone (PWA iOS) via localStorage
- Correction logique couleurs bornes d'incendie
- **Migration Azure Blob Storage complète** : service, SAS URLs 15 min, migration batch
- **Migration 100% routes vers Azure** : users, logo, interventions, EPI, débogage (Avr 2026)

## Backlog
- P1: Tester l'import d'historique d'interventions (CSV/XML/ZIP) avec fichiers réels
- Future: Aperçu d'emails en temps réel dans les paramètres admin
- Refactoring: Supprimer `utils/object_storage.py` (proxy legacy)
