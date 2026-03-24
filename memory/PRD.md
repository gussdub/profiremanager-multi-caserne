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
- Nettoyage Pydantic dans prevention.py

### Session 24 mars 2026
- Bug fix : Temps dépassé dans les remplacements (SMS + in-app)
- Bug fix : Double-clic / doublons de remplacements
- Amélioration : Priorité automatique des remplacements (4 niveaux)
- Bug fix : Modal notification fermeture en 1 clic (z-index)
- P1 : Historique complet unifié des bâtiments (4 sources de données)
- Responsive mobile/tablette du module Bâtiments
- P2 : Extraction des 48 modèles Pydantic → `prevention_models.py` (937 lignes)

### Session actuelle (24 mars 2026 - continuation)
- **P2 : Refactorisation prevention.py — Phase 2 & 3 TERMINÉE**
  - Extraction des routes Plans d'intervention → `prevention_plans.py` (1122 lignes, 15 routes)
  - Extraction des routes Rapports/Stats/Excel/Notifications → `prevention_reports.py` (940 lignes, 6 routes)
  - `prevention.py` réduit de 5315 → 3303 lignes (réduction de 38%)
  - Total 111 endpoints toujours fonctionnels (90 + 15 + 6)
  - Tests passés : 100% (11/11 — iteration_15.json)

## Tests
- `iteration_14.json` : Backend 93% (13/14, 1 skipped), Frontend 100%
- `iteration_15.json` : Backend 100% (11/11) — vérification refactorisation

## Backlog priorité
- **P2** : Tests de régression automatisés complets (tests unitaires backend)
- **P3** : Améliorations UX de la carte des secteurs
- **P3** : Optimisations de performance (lazy loading bâtiments)

## Fichiers clés
- `/app/backend/routes/prevention.py` (3303 lignes, routes prévention principales)
- `/app/backend/routes/prevention_plans.py` (1122 lignes, plans d'intervention)
- `/app/backend/routes/prevention_reports.py` (940 lignes, rapports/stats/exports/notifications)
- `/app/backend/routes/prevention_models.py` (937 lignes, modèles Pydantic)
- `/app/backend/routes/remplacements_routes.py` (routes remplacements)
- `/app/backend/routes/batiments.py` (routes bâtiments + historique unifié)
- `/app/frontend/src/components/Batiments.jsx` (liste + responsive)
- `/app/frontend/src/components/BatimentDetailModalNew.jsx` (modal unifié responsive)
- `/app/frontend/src/components/HistoriqueModifications.jsx` (timeline unifiée)
