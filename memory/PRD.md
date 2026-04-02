# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py` (centralized HTML templates)
- **Storage**: Emergent Object Storage
- **Maps**: Leaflet + Nominatim (OpenStreetMap)
- **Weather**: Open-Meteo API

## Key Files
```
/app
├── backend/
│   ├── routes/
│   │   ├── planning.py                 # Core planning + notifs
│   │   ├── planning_exports.py         # Export PDF/Excel/iCal
│   │   ├── planning_auto.py            # Auto-attribution
│   │   ├── planning_audit.py           # Rapports d'audit
│   │   ├── prevention.py              # Module Prévention core
│   │   ├── prevention_reports.py      # Rapports PDF/Excel + Export PDF bâtiment
│   │   ├── remplacements_routes.py    # Quarts ouverts + remplacements
│   │   └── remplacements/
│   │       ├── notifications.py       # Email notifs for replacements
│   │       └── workflow.py            # Replacement workflow logic
│   ├── services/
│   │   └── email_builder.py           # Centralized email template builder
│   ├── utils/
│   │   └── pdf_helpers.py             # PDF branded templates utilities
│   └── server.py                      # Main FastAPI app + auth + jobs
└── frontend/
    └── src/
        ├── components/
        │   ├── Batiments.jsx
        │   ├── BatimentDetailModalNew.jsx  # + PDF export button
        │   ├── GaleriePhotosBatiment.jsx   # Drag & Drop photos + légendes
        │   ├── Planning.jsx
        │   ├── Parametres.js
        │   ├── ParametresTypesGarde.jsx
```

## Key API Endpoints
- `POST /api/{tenant_slug}/planning/assignation` — Crée une assignation (brouillon/publie selon état du mois)
- `DELETE /api/{tenant_slug}/planning/assignation/{id}` — Supprime une assignation
- `POST /api/{tenant_slug}/planning/publier` — Publie le planning brouillon
- `GET /api/{tenant_slug}/prevention/batiments/{id}/rapport-pdf` — Export PDF bâtiment
- `PUT /api/{tenant_slug}/prevention/batiments/{id}/photos/reorder` — Réordonner photos

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- email_builder.py centralisé (10 templates)
- Fix bug audit modal (matching par user_id)
- Drag & drop photos + légendes dans fiche bâtiment
- Refactorisation planning.py (4 fichiers) + Parametres.js
- Export PDF fiche bâtiment avec galerie photos annotées
- **Fix bug notifications planning** : les notifications d'attribution/suppression ne sont plus envoyées quand le planning est en brouillon. Modèle Assignation → défaut "brouillon". Logique pub_status basée sur l'état du mois.

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin
