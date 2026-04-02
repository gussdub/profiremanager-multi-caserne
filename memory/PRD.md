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
- `POST /api/{tenant_slug}/planning/assignation-avancee` — Assignation récurrente (brouillon/publie par mois)
- `GET /api/{tenant_slug}/prevention/batiments/{id}/rapport-pdf` — Export PDF bâtiment

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé (10 templates)
- Fix bug audit modal (matching par user_id)
- Drag & drop photos + légendes dans fiche bâtiment
- Refactorisation planning.py (4 fichiers) + Parametres.js
- Export PDF fiche bâtiment avec galerie photos annotées
- **Fix bug notifications planning (brouillon)** : Le modèle Assignation default maintenant à "brouillon". Les endpoints de création manuelle ET avancée déterminent dynamiquement le statut (publie si le mois est déjà publié, brouillon sinon). Les notifications ne sont envoyées que pour les assignations publiées. Le bandeau "Mode Brouillon Actif" s'affiche maintenant aussi lors des assignations manuelles.

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin
