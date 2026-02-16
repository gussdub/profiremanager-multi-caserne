# ProFireManager - Product Requirements Document

## Application Overview
Full-stack fire services management application built with React (frontend) and FastAPI (backend) with MongoDB database.

## Core Modules
- **Personnel**: Employee management, grades, formations
- **Planning**: Shift scheduling, guard assignments, auto-attribution
- **Actifs**: Asset management, water points, inspections
- **EPI**: Personal protective equipment tracking
- **Interventions**: Emergency response logging
- **Prévention**: Building inspections, prevention tasks
- **Rapports**: Reports generation (PDF, Excel)
- **Paramètres**: System configuration

## Recent Implementation History

### 2026-02-16 - Fork Session
**Completed:**
1. **Export PDF avec carte (Points d'eau)**
   - Created backend endpoint `/api/{tenant}/export/map-image` using `staticmap` library
   - Generates static OpenStreetMap images with colored markers
   - Frontend calls this API to embed map in PDF export
   - File: `/app/backend/routes/export_map.py`
   - Modified: `/app/frontend/src/components/CarteApprovisionnementEau.jsx`

2. **Bug module Horaire (Équipes de garde)**
   - Fixed team rotation calculation for custom schedules
   - When `type_rotation` is a UUID, system now fetches from `horaires_personnalises` collection
   - Added `get_equipe_from_horaire_personnalise()` function
   - File: `/app/backend/routes/equipes_garde.py`

### Previous Sessions
- Excel export for water points with GPS coordinates
- PDF styling with service logo and color scheme
- Import inspections bornes sèches feature

## Pending Issues (Priority Order)

### P0 - Critical
- [ ] User validation: PDF export with map
- [ ] User validation: Schedule module team display fix

### P1 - High
- [ ] Adapt hydrant import for "Cavitation durant le pompage" field
- [ ] Import inspections hydrants - awaiting user testing

### P2 - Medium
- [ ] "Prévention" module visibility for "shefford" tenant
- [ ] "Prévention" notification audit

### P3 - Future
- [ ] SFTP "Check Now" button for manual trigger
- [ ] Remove preview mode limitation notes from export modals

## Technical Stack
- **Frontend**: React 18, TailwindCSS, Shadcn/UI, Leaflet maps
- **Backend**: FastAPI, Python 3.11, Motor (async MongoDB)
- **Database**: MongoDB
- **Libraries**: jspdf, react-csv, staticmap (for map generation)

## Key API Endpoints

### Export Map
```
POST /api/{tenant}/export/map-image
Body: {
  "points": [{"latitude": float, "longitude": float, "etat": string}],
  "width": int,
  "height": int
}
Response: {"success": true, "image_base64": "..."}
```

### Équipes de Garde
```
GET /api/{tenant}/equipes-garde/equipe-du-jour?date=YYYY-MM-DD&type_emploi=temps_plein
Response: {"equipe": int, "nom": string, "couleur": string}
```

## File Structure (Key Files)
```
/app
├── backend/
│   ├── routes/
│   │   ├── equipes_garde.py      # Team rotation logic
│   │   ├── export_map.py         # NEW: Static map generation
│   │   ├── horaires_personnalises.py
│   │   └── points_eau.py
│   └── server.py
├── frontend/
│   └── src/
│       └── components/
│           ├── CarteApprovisionnementEau.jsx  # Water supply map + export
│           ├── ParametresEquipesGarde.jsx     # Team settings
│           └── Planning.jsx                    # Schedule display
└── memory/
    └── PRD.md
```

## User Preferences
- **Language**: French
- **External guards schedule**: Monday 18h to Monday 06h (weekly)
- **Note**: User does not always configure start/end hours in custom guard creation
