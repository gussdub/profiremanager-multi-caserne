# ProFireManager - Product Requirements Document

## Application Overview
Application de gestion des services d'incendie multi-tenant avec modules de planning, personnel, actifs, prévention et interventions.

## Core Features Implemented

### Module Planning
- Gestion des gardes et assignations
- Rotation des équipes (temps plein / temps partiel)
- Configuration personnalisée du jour et heure de rotation
- Affichage de l'équipe de garde du jour

### Module Points d'Eau / Approvisionnement
- Gestion des bornes fontaines, bornes sèches et points d'eau statiques
- Carte interactive avec Leaflet
- Export PDF avec carte statique et icônes personnalisées
- Export Excel

### Module Personnel
- Gestion des employés par tenant
- Attribution des équipes de garde

## Recent Fixes (February 2026)

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

### Database
- MongoDB
- Collections principales: users, tenants, points_eau, parametres_equipes_garde

## Pending Tasks

### P1
- Adapter l'import d'inspections d'hydrants pour le nouveau champ "Cavitation durant le pompage"

### Completed/Removed
- ~~Bouton "Vérifier maintenant" SFTP~~ - Non requis
- ~~Visibilité module "Prévention" pour tenant "shefford"~~ - Résolu

## API Endpoints

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
