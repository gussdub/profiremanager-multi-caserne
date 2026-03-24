# PRD.md — ProFireManager

## Énoncé original
Application SaaS multi-tenant de gestion de caserne de pompiers (ProFireManager). Modules : Planning, Interventions, Prévention incendie, Bâtiments, Remplacements, Paie, etc.

## Architecture
- **Frontend** : React + Shadcn/UI + Leaflet (cartes)
- **Backend** : FastAPI + Motor (MongoDB Atlas)
- **Base de données** : MongoDB Atlas
- **Intégrations** : Nominatim (géocodage), Resend (emails), Firebase (push), Twilio (SMS)

## Fonctionnalités implémentées

### Sessions précédentes
- Import CSV & XML (CEFX) des bâtiments
- Module Prévention complet (inspections, plans, non-conformités)
- Modal bâtiment unifié, historique modifications
- Polygones secteurs géographiques
- Remplacements (timeout, anti-doublon, priorité auto)
- Responsive mobile Bâtiments

### Session 24 mars 2026 — Refactorisation prevention.py
- `prevention.py` réduit de **5315 → 1630 lignes** (69%)
- 7 fichiers : prevention.py (51 routes), _plans (15), _reports (6), _nc (8), _media (8), _inspections_visuelles (12), _config (11) + _models (48 modèles)
- 111 endpoints intacts, tests 100% (iteration_16.json)

### Session 24 mars 2026 — Rotation des équipes (en cours)
- **Step 1 DONE** : Fix UI — équipes synchronisées depuis le template (ex: Shefford = 2 équipes au lieu de 4 hardcodées)
- **Step 2 DONE** : Heures AM/PM éditables dans le template de rotation (6h_demi_quarts) + heures début/fin pour le mode 24h
- **Step 3 DONE** : Champ "Date d'entrée en vigueur" ajouté pour la rotation temps plein
- **Step 4 TODO** : Logique N1.1 — insertion automatique des temps plein dans le planning selon la rotation

## Logique de rotation — conception validée par l'utilisateur

### Hiérarchie d'attribution des gardes
1. **N1 — Manuel** : Assignations faites à la main par le gestionnaire
2. **N1.1 — Rotation temps plein** : Les membres de l'équipe de garde du jour sont automatiquement insérés dans les types de garde correspondants
3. **N2 — Attribution obligatoire** : Comble les trous restants (temps partiel, équité, ancienneté)

### Règles métier
- Chaque template de rotation a des **heures de début/fin** par segment (AM: 6h-12h, PM: 12h-18h, 24h: 7h-7h, Jour: 7h-19h, Nuit: 19h-7h)
- La rotation s'applique **à partir de la date d'activation** — les gardes validées avant ne changent pas
- L'association employé ↔ équipe se fait par `equipe_garde` (1 → Dany, 2 → Pierre)
- L'insertion dans le planning prend une **place dans le type de garde existant** (ex: si 4 requis et 1 temps plein, il cherche 3 de plus)
- Si un membre est absent → trou comblé par temps partiel via N2
- Génération **en lot** lors de la génération du planning

## Tests
- `iteration_14.json` : Backend 93%, Frontend 100%
- `iteration_15.json` : Backend 100% (11/11) — refactorisation phases 2-3
- `iteration_16.json` : Backend 100% (17/17) — refactorisation phase 4

## Backlog priorité
- **P0** : Step 4 — Logique N1.1 (insertion automatique rotation dans le planning)
- **P2** : Tests de régression automatisés complets
- **P3** : Améliorations UX carte des secteurs
- **P3** : Optimisations de performance (lazy loading)

## Architecture des fichiers Prévention

| Fichier | Lignes | Routes |
|---|---|---|
| `prevention.py` | 1630 | 51 |
| `prevention_models.py` | 937 | — |
| `prevention_plans.py` | 1122 | 15 |
| `prevention_reports.py` | 940 | 6 |
| `prevention_nc.py` | 336 | 8 |
| `prevention_media.py` | 250 | 8 |
| `prevention_inspections_visuelles.py` | 484 | 12 |
| `prevention_config.py` | 630 | 11 |
| **Total** | **6329** | **111** |
