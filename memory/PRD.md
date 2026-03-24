# PRD.md — ProFireManager

## Énoncé original
Application SaaS multi-tenant de gestion de caserne de pompiers (ProFireManager). Modules : Planning, Interventions, Prévention incendie, Bâtiments, Remplacements, Paie, etc.

## Architecture
- **Frontend** : React + Shadcn/UI + Leaflet (cartes)
- **Backend** : FastAPI + Motor (MongoDB Atlas)
- **Base de données** : MongoDB Atlas (`profiremanager-dev` en preview, `profiremanager` en prod)
- **Intégrations** : Nominatim (géocodage), Resend (emails), Firebase (push), Twilio (SMS)

## Fonctionnalités implémentées

### Session précédente
- Import CSV & XML (CEFX) des bâtiments avec géolocalisation et détection de conflits
- Module Prévention expurgé de la gestion des bâtiments
- Modal bâtiment unifié et conditionnel (Prévention vs Base)
- Backend historique des modifications (collection `batiments_historique`)
- Polygones des secteurs géographiques sur la carte
- Nettoyage Pydantic dans prevention.py

### Session actuelle (24 mars 2026)
- **Bug fix** : Temps dépassé dans les remplacements (SMS + in-app)
  - Backend : Vérification 3 niveaux (contactés, tentative expired, date_prochaine_tentative)
  - Frontend : Page "Temps dépassé, impossible de choisir"
  - Ajout du décorateur `@router.get` manquant sur `action_remplacement_via_email`
  - Nouveau endpoint `GET /api/remplacement-check-token/{token}`
  - Filtrage des propositions expirées dans `get_propositions_remplacement`

- **Bug fix** : Double-clic / doublons de remplacements
  - Frontend : Bouton désactivé + "Création en cours..."
  - Backend : Anti-doublon (erreur 409 si demande identique existe)
  - Backend : Notifications superviseurs en arrière-plan (non bloquant)

- **Amélioration** : Priorité automatique des remplacements
  - 4 niveaux : urgente (<24h), haute (24-48h), normale (48h-7j), faible (>7j)
  - Affichage auto dans le modal de création avec délais configurés
  - Badge 4 couleurs dans les cartes de demande

- **Bug fix** : Modal notification fermeture en 1 clic
  - z-index de l'overlay notifications (10000) > hamburger menu (999)
  - Handler ferme notifications ET menu hamburger simultanément

- **P1 : Historique complet unifié des bâtiments**
  - Backend : Endpoint `/api/{tenant}/batiments/{id}/historique` agrège 4 sources
    - `batiments_historique` (modifications manuelles + imports)
    - `inspections` (visites de prévention)
    - `non_conformites` (inspections + manuelles)
    - `interventions` (reliées par adresse civique)
  - Frontend : Composant `HistoriqueModifications.jsx`
    - Timeline chronologique unifiée
    - 4 filtres cliquables avec compteurs
    - Cartes expandables pour les modifications

- **Responsive mobile/tablette du module Bâtiments**
  - Mobile (<768px) : Cartes compactes, modal bottom-sheet, boutons scrollables
  - Tablette (768px+) : Table complète, modal centré
  - Desktop : Layout original inchangé
  - `BatimentDetailModalNew.jsx` : 6x left:'280px' → dynamique
  - `Batiments.jsx` : Vue cartes mobile
  - `HistoriqueModifications.jsx` : Filtres compacts mobile

- **P2 : Refactorisation prevention.py**
  - Extraction de 48 modèles Pydantic + 3 constantes dans `prevention_models.py` (937 lignes)
  - `prevention.py` réduit de 6226 → 5315 lignes
  - Tous les 111 endpoints fonctionnels

## Tests
- `iteration_14.json` : Backend 93% (13/14, 1 skipped), Frontend 100%
- Aucun bug critique, aucune régression

## Backlog priorité
- **P2** : Découpage supplémentaire de `prevention.py` (séparer routes par domaine : plans, rapports, etc.)
- **P3** : Améliorations UX de la carte des secteurs
- **P3** : Tests de régression automatisés complets

## Fichiers clés
- `/app/backend/routes/prevention.py` (5315 lignes, routes prévention)
- `/app/backend/routes/prevention_models.py` (937 lignes, modèles Pydantic)
- `/app/backend/routes/remplacements_routes.py` (routes remplacements)
- `/app/backend/routes/batiments.py` (routes bâtiments + historique unifié)
- `/app/frontend/src/components/Batiments.jsx` (liste + responsive)
- `/app/frontend/src/components/BatimentDetailModalNew.jsx` (modal unifié responsive)
- `/app/frontend/src/components/HistoriqueModifications.jsx` (timeline unifiée)
- `/app/frontend/src/components/RemplacementChoix.jsx` (page choix SMS)
- `/app/frontend/src/components/remplacements/CreateRemplacementModal.jsx` (priorité auto)
