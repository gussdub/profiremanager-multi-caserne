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
│   │   ├── planning.py                # Core planning + notifs email (~5300 lines)
│   │   ├── remplacements_routes.py    # Quarts ouverts + remplacements
│   │   └── remplacements/
│   │       ├── notifications.py       # Email notifs for replacements
│   │       └── workflow.py            # Replacement workflow logic
│   ├── services/
│   │   └── email_builder.py           # Centralized email template builder
│   └── server.py                      # Main FastAPI app + auth + jobs
└── frontend/
    └── src/
        ├── components/
        │   ├── Batiments.jsx          # Buildings + lazy loading
        │   ├── SecteursMap.jsx        # Sector map (Leaflet)
        │   ├── Sidebar.jsx            # Navigation + notifications
        │   ├── Parametres.js          # Settings (~2600 lines)
        │   ├── ParametresRemplacements.jsx # Replacement settings
        │   └── remplacements/
        │       └── QuartsOuverts.jsx  # Open shift UI
```

## Key DB Schema
- `demandes_remplacement`: {pris_via_quart_ouvert (bool), volontaire_id, volontaire_nom}
- `parametres_remplacements`: {quart_ouvert_approbation_requise (bool)}

## Key API Endpoints
- `GET /api/{tenant_slug}/quarts-ouverts`
- `PUT /api/{tenant_slug}/remplacements/{demande_id}/prendre`
- `PUT /api/{tenant_slug}/remplacements/{demande_id}/approuver-quart`

## Completed Features (as of 2026-03-27)
- ✅ Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- ✅ Fix notifications `destinataire_id` (bug MongoDB)
- ✅ Fix overlay click propagation (Sidebar.jsx)
- ✅ Feature "Quarts Ouverts" + toggle approbation admin
- ✅ `email_builder.py` centralized email template system
- ✅ **ALL email templates migrated** to email_builder.py (10 templates total):
  - server.py: send_welcome_email, send_temporary_password_email, send_password_reset_email, send_super_admin_welcome_email, send_gardes_notification_email, send_debogage_notification_email + job templates (alertes_equipements, inspections PR, rappel EPI, rappel disponibilites)
  - planning.py: send_planning_notification_email
  - remplacements/notifications.py: envoyer_email_remplacement, envoyer_email_remplacement_trouve, envoyer_email_remplacement_non_trouve
- ✅ Lazy loading bâtiments + carte secteurs améliorée
- ✅ **Fix bug audit modal** : le bouton Audit affichait le mauvais audit car `assignations[index]` ne correspondait pas à `personnelAssigne[index]`. Remplacé par `assignations.find(a => a.user_id === person.id)` pour un matching fiable.
- ✅ **Drag & drop photos + légendes** dans la fiche bâtiment : réordonnancement des photos par glisser-déposer + légende éditable sur chaque photo + sauvegarde via PUT endpoint
- ✅ **Refactorisation planning.py** : 5361 → 2131 lignes, éclaté en 4 fichiers (planning.py, planning_exports.py, planning_auto.py, planning_audit.py)
- ✅ **Refactorisation Parametres.js** : 2639 → 2138 lignes, extraction ParametresTypesGarde.jsx

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)

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
