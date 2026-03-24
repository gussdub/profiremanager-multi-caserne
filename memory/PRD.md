# PRD.md — ProFireManager

## Énoncé original
Application SaaS multi-tenant de gestion de caserne de pompiers (ProFireManager). Modules : Planning, Interventions, Prévention incendie, Bâtiments, Remplacements, Paie, etc.

## Architecture
- **Frontend** : React + Shadcn/UI + Leaflet (cartes)
- **Backend** : FastAPI + Motor (MongoDB Atlas)
- **Base de données** : MongoDB Atlas (`profiremanager-dev` en preview, `profiremanager` en prod)
- **Intégrations** : Nominatim (géocodage), Resend (emails), Firebase (push), Twilio (SMS)

## Fonctionnalités implémentées

### Sessions précédentes
- Import CSV & XML (CEFX) des bâtiments avec géolocalisation et détection de conflits
- Module Prévention expurgé de la gestion des bâtiments
- Modal bâtiment unifié et conditionnel (Prévention vs Base)
- Backend historique des modifications (collection `batiments_historique`)
- Polygones des secteurs géographiques sur la carte

### Session 24 mars 2026 — partie 1
- Bug fix : Temps dépassé dans les remplacements (SMS + in-app)
- Bug fix : Double-clic / doublons de remplacements
- Amélioration : Priorité automatique des remplacements (4 niveaux)
- Bug fix : Modal notification fermeture en 1 clic (z-index)
- P1 : Historique complet unifié des bâtiments (4 sources de données)
- Responsive mobile/tablette du module Bâtiments

### Session 24 mars 2026 — partie 2 (Refactorisation complète)
- **Phase 1** : Extraction de 48 modèles Pydantic → `prevention_models.py` (937 lignes)
- **Phase 2** : Extraction des Plans d'intervention → `prevention_plans.py` (1122 lignes, 15 routes)
- **Phase 3** : Extraction des Rapports/Stats/Exports → `prevention_reports.py` (940 lignes, 6 routes)
- **Phase 4** : Extraction finale
  - Non-conformités → `prevention_nc.py` (336 lignes, 8 routes)
  - Photos & Icônes → `prevention_media.py` (250 lignes, 8 routes)
  - Inspections visuelles → `prevention_inspections_visuelles.py` (484 lignes, 12 routes)
  - Carte/Préventionnistes/Paramètres → `prevention_config.py` (630 lignes, 11 routes)
- **Résultat** : `prevention.py` réduit de **5315 → 1630 lignes** (réduction de 69%)
- 111 endpoints toujours fonctionnels répartis sur 7 fichiers + 1 fichier de modèles
- Tests passés : 100% (17/17 — iteration_16.json)

## Tests
- `iteration_14.json` : Backend 93% (13/14), Frontend 100%
- `iteration_15.json` : Backend 100% (11/11) — vérification phases 2-3
- `iteration_16.json` : Backend 100% (17/17) — vérification phase 4 complète

## Architecture des fichiers Prévention

| Fichier | Lignes | Routes | Responsabilité |
|---|---|---|---|
| `prevention.py` | 1630 | 51 | Bâtiments, inspections, grilles, secteurs, dépendances |
| `prevention_models.py` | 937 | — | 48 modèles Pydantic + constantes |
| `prevention_plans.py` | 1122 | 15 | Plans d'intervention CRUD + PDF |
| `prevention_reports.py` | 940 | 6 | Statistiques, PDF, Excel, notifications, tendances |
| `prevention_nc.py` | 336 | 8 | Non-conformités CRUD + relances |
| `prevention_media.py` | 250 | 8 | Upload photos, icônes personnalisées |
| `prevention_inspections_visuelles.py` | 484 | 12 | Inspections visuelles + workflow + NC visuelles |
| `prevention_config.py` | 630 | 11 | Carte/map, géocodage, préventionnistes, paramètres |
| **Total** | **6329** | **111** | |

## Backlog priorité
- **P2** : Tests de régression automatisés complets (tests unitaires backend)
- **P3** : Améliorations UX de la carte des secteurs
- **P3** : Optimisations de performance (lazy loading bâtiments)

## Fichiers clés (non-prévention)
- `/app/backend/routes/remplacements_routes.py` (routes remplacements)
- `/app/backend/routes/batiments.py` (routes bâtiments + historique unifié)
- `/app/frontend/src/components/Batiments.jsx` (liste + responsive)
- `/app/frontend/src/components/BatimentDetailModalNew.jsx` (modal unifié responsive)
- `/app/frontend/src/components/HistoriqueModifications.jsx` (timeline unifiée)
