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

## Backlog
- P1: Tester rigoureusement l'import d'historique d'interventions (CSV/XML/ZIP)
- P2: Refactorisation de `planning.py` (~5300 lignes) et `Parametres.js` (~2600 lignes)
- P2: Drag & drop pour réassigner les photos entre bâtiments après import
