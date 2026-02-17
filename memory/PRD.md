# ProFireManager - Product Requirements Document

## Application Overview
Application de gestion des services d'incendie multi-tenant avec modules de planning, personnel, actifs, prévention et interventions.

## Core Features Implemented

### Module Planning
- Gestion des gardes et assignations
- Rotation des équipes (temps plein / temps partiel)
- Configuration personnalisée du jour et heure de rotation
- Affichage de l'équipe de garde du jour
- Export PDF du planning (vue semaine et mois)

### Module Points d'Eau / Approvisionnement
- Gestion des bornes fontaines, bornes sèches et points d'eau statiques
- Carte interactive avec Leaflet
- Export PDF avec carte statique et icônes personnalisées
- Export Excel

### Module Personnel
- Gestion des employés par tenant
- Attribution des équipes de garde

## Recent Fixes (February 2026)

### P0 - Export PDF Planning Vue Mois - Semaines commençant le dimanche (FIXED - 17 Feb 2026)
- **Problème**: En vue mois, l'export PDF commençait les semaines le 1er du mois (ex: dimanche 1er février 2026) au lieu du lundi
- **Cause**: Le code utilisait `date_debut` (1er du mois) comme début de la première semaine sans chercher le lundi précédent
- **Solution**: 
  - Calcul du lundi de la semaine contenant le 1er du mois: `current = date_debut - timedelta(days=date_debut.weekday())`
  - Chaque semaine affiche exactement 7 jours (lundi à dimanche)
  - Les jours hors du mois sont affichés en gris avec "-"
- **Fichier**: `/app/backend/routes/planning.py` (lignes ~1358-1510)

### P0 - Bug Équipe de Garde (FIXED)
- **Problème**: L'équipe affichée était incorrecte car `toISOString()` convertissait la date en UTC
- **Solution**: Utilisation de la date locale avec `getFullYear()`, `getMonth()`, `getDate()`
- **Fichier**: `/app/frontend/src/components/Planning.jsx`

### P0 - Export PDF avec Carte et Icônes (FIXED)
- **Problème**: La carte ne s'affichait pas dans le PDF, puis les icônes manquaient
- **Solution**: 
  - Backend génère une carte statique avec `staticmap` library
  - Téléchargement et mise en cache des icônes personnalisées
  - Positionnement icône + badge de statut (style viewer)
- **Fichier**: `/app/backend/routes/export_map.py`

## Technical Architecture

### Frontend
- React 18 avec Vite
- Shadcn/UI components
- Leaflet pour les cartes interactives
- jsPDF pour l'export PDF

### Backend
- FastAPI (Python)
- MongoDB avec Motor (async)
- staticmap pour génération de cartes statiques
- Pillow pour manipulation d'images
- ReportLab pour génération de PDF backend

### Database
- MongoDB
- Collections principales: users, tenants, points_eau, parametres_equipes_garde, assignations, types_garde

## Pending Tasks

### P1
- Adapter l'import d'inspections d'hydrants pour le nouveau champ "Cavitation durant le pompage"

### P3
- Réactivation de l'intégration Firebase pour les notifications push (quand les apps mobiles seront prêtes)

### Refactoring recommandé
- Le fichier `backend/routes/planning.py` dépasse 5000 lignes et devrait être découpé en modules plus petits

## API Endpoints

### Planning Export
- `GET /{tenant}/planning/exports/pdf?periode=YYYY-MM-DD&type=semaine` - Export PDF vue semaine
- `GET /{tenant}/planning/exports/pdf?periode=YYYY-MM&type=mois` - Export PDF vue mois
- `GET /{tenant}/planning/exports/excel?periode=...&type=...` - Export Excel

### Équipes de Garde
- `GET /{tenant}/parametres/equipes-garde` - Récupérer les paramètres
- `PUT /{tenant}/parametres/equipes-garde` - Modifier les paramètres
- `GET /{tenant}/equipes-garde/equipe-du-jour` - Équipe de garde pour une date

### Export Carte
- `POST /{tenant}/export/map-image` - Générer image carte statique avec icônes

## Icon URLs
- Borne fontaine: `https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png`
- Borne sèche: `https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png`
- Point d'eau: `https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png`
