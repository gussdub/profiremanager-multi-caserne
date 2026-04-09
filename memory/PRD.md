# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`
- **Storage**: Emergent Object Storage
- **Maps**: Leaflet + Nominatim (OpenStreetMap)
- **Weather**: Open-Meteo API

## Completed Features (chronological)
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé (10 templates)
- Fix bug audit modal (matching par user_id)
- Drag & drop photos + légendes dans fiche bâtiment
- Refactorisation planning.py (4 fichiers) + Parametres.js
- Export PDF fiche bâtiment avec galerie photos annotées
- Fix bug notifications planning (brouillon) — modèle Assignation default "brouillon"
- Fix QR code deep linking PWA iOS — tenant_slug + timestamp dans qr_action, TenantContext auto-redirige
- **Fix logique couleurs inspections bornes** : La couleur dans l'onglet inspections dépend maintenant des dates de tests configurées. Date passée → toutes bornes rouges SAUF celles inspectées conformes après la date. L'ancien bug court-circuitait via `etat === 'fonctionnelle'`.

## Key Files Modified This Session
- `/app/frontend/src/components/InspectionsBornesSeches.jsx` — getInspectionColor + getInspectionLabel
- `/app/frontend/src/components/VehiculeQRAction.jsx` — tenant_slug + timestamp dans qr_action
- `/app/frontend/src/contexts/TenantContext.js` — QR deep link detection
- `/app/backend/routes/planning.py` — publication_status brouillon + logique notification

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin
