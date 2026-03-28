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
│   │   ├── planning.py                 # Core planning + notifs email
│   │   ├── planning_exports.py         # Export PDF/Excel/iCal
│   │   ├── planning_auto.py            # Auto-attribution
│   │   ├── planning_audit.py           # Rapports d'audit
│   │   ├── prevention.py              # Module Prévention core (bâtiments, inspections, grilles, secteurs)
│   │   ├── prevention_reports.py      # Rapports PDF/Excel + Export PDF bâtiment avec photos
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
        │   ├── Batiments.jsx          # Buildings + lazy loading
        │   ├── BatimentDetailModalNew.jsx  # Building detail modal + PDF export button
        │   ├── GaleriePhotosBatiment.jsx   # Drag & Drop photos + légendes
        │   ├── SecteursMap.jsx        # Sector map (Leaflet)
        │   ├── Sidebar.jsx            # Navigation + notifications
        │   ├── Parametres.js          # Settings
        │   ├── ParametresTypesGarde.jsx # Types de garde settings
        │   ├── ParametresRemplacements.jsx # Replacement settings
        │   └── remplacements/
        │       └── QuartsOuverts.jsx  # Open shift UI
```

## Key DB Schema
- `demandes_remplacement`: {pris_via_quart_ouvert (bool), volontaire_id, volontaire_nom}
- `parametres_remplacements`: {quart_ouvert_approbation_requise (bool)}
- `batiments`: {..., `photos`: `[{id: str, url: str, source: str, date_ajout: str, legende: str}]`}

## Key API Endpoints
- `GET /api/{tenant_slug}/quarts-ouverts`
- `PUT /api/{tenant_slug}/remplacements/{demande_id}/prendre`
- `PUT /api/{tenant_slug}/remplacements/{demande_id}/approuver-quart`
- `PUT /api/{tenant_slug}/prevention/batiments/{batiment_id}/photos/reorder`
- `GET /api/{tenant_slug}/prevention/batiments/{batiment_id}/rapport-pdf`
- `GET /api/{tenant_slug}/planning/rapport-audit`

## Completed Features (as of 2026-03-28)
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- Fix notifications `destinataire_id` (bug MongoDB)
- Fix overlay click propagation (Sidebar.jsx)
- Feature "Quarts Ouverts" + toggle approbation admin
- `email_builder.py` centralized email template system
- **ALL email templates migrated** to email_builder.py (10 templates total)
- Lazy loading bâtiments + carte secteurs améliorée
- **Fix bug audit modal** : matching fiable par `user_id`
- **Drag & drop photos + légendes** dans la fiche bâtiment
- **Refactorisation planning.py** : 5361 → 2131 lignes, 4 fichiers
- **Refactorisation Parametres.js** : 2639 → 2138 lignes
- **Export PDF fiche bâtiment** : PDF complet avec infos bâtiment, galerie photos annotées (légendes), historique inspections, plan d'intervention, recommandations. Bouton "PDF" ajouté dans la barre d'actions du modal bâtiment.

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- Future: Aperçu d'emails en temps réel dans les paramètres admin

## Refactoring Status (completed 2026-03-27)
### Backend: planning.py split
- `planning.py`: 5361 → 2131 lignes (CRUD, publication, rapports heures)
- `planning_exports.py`: 1101 lignes (exports PDF/Excel/iCal)
- `planning_auto.py`: 1995 lignes (auto-attribution)
- `planning_audit.py`: 275 lignes (rapports d'audit)
- Router registration order in server.py: sub-routers BEFORE main (catch-all route)

### Frontend: Parametres.js split
- `Parametres.js`: 2639 → 2138 lignes
- `ParametresTypesGarde.jsx`: 554 lignes (types de garde tab + modals)
