# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`
- **Storage**: Emergent Object Storage
- **Maps**: Leaflet + Nominatim (OpenStreetMap)
- **Weather**: Open-Meteo API

## Key API Endpoints
- `POST /api/{tenant_slug}/planning/assignation` — Crée une assignation (brouillon/publie selon état du mois)
- `DELETE /api/{tenant_slug}/planning/assignation/{id}` — Supprime une assignation
- `POST /api/{tenant_slug}/planning/publier` — Publie le planning brouillon
- `POST /api/{tenant_slug}/planning/assignation-avancee` — Assignation récurrente
- `GET /api/{tenant_slug}/prevention/batiments/{id}/rapport-pdf` — Export PDF bâtiment
- `GET /api/{tenant_slug}/actifs/vehicules/{id}/public` — Info publique véhicule (QR)

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé (10 templates)
- Fix bug audit modal (matching par user_id)
- Drag & drop photos + légendes dans fiche bâtiment
- Refactorisation planning.py (4 fichiers) + Parametres.js
- Export PDF fiche bâtiment avec galerie photos annotées
- Fix bug notifications planning (brouillon) — modèle Assignation default "brouillon"
- **Fix QR code deep linking PWA iOS** : tenant_slug + timestamp ajoutés dans qr_action, TenantContext détecte auto le scan QR en attente et redirige vers le bon tenant sans sélection manuelle

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin
