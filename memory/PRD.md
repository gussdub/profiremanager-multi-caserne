# Crew Rotation App - PRD

## Application Overview
Application de gestion de planning pour services d'incendie avec support multi-tenant.

## Core Features Implemented

### Système d'équipes de garde (Nouveau - Janvier 2026)
- **Backend**: Endpoints CRUD `/parametres/equipes-garde` et `/equipes-garde/equipe-du-jour`
- **Frontend Paramètres**: Composant `ParametresEquipesGarde.jsx` pour configurer les rotations temps plein/temps partiel
- **Frontend Personnel**: Champ "Équipe de garde" dans les fiches employés (visible selon configuration)
- **Frontend Planning**: Affichage des équipes de garde du jour (temps plein ET temps partiel)
- **Attribution automatique**: Bonus de priorité pour les temps partiels de l'équipe de garde

### Type d'emploi "Temporaire"
- Nouveau type d'emploi traité comme temps partiel
- Badge violet distinct
- Accès aux disponibilités comme les temps partiels
- Abréviations: TP (temps plein), TPart (temps partiel), Tempo (temporaire)

### Validation des conflits (Disponibilités/Indisponibilités)
- **Backend**: Règle "Premier arrivé, premier servi" - impossible d'ajouter dispo si indispo existe et vice-versa
- **Frontend**: Modal d'erreur centré avec détails explicites
- Affiche le nombre de succès ET le nombre de conflits lors des créations en lot

### Validation des assignations (Planning)
- **Backend**: Vérifie les jours d'application des types de garde
- Impossible d'assigner une "Garde WE" un jour de semaine
- **Frontend**: Modal d'erreur explicite avec message détaillé

### Super-Admin Multi-tenant
- Les super-admins peuvent se connecter sur n'importe quel tenant
- Obtiennent automatiquement les droits admin sur le tenant
- **Sécurité**: Déconnexion automatique après 2h d'inactivité
- Avertissement 5 minutes avant déconnexion

### Corrections diverses
- Export PDF du Planning: Noms complets affichés correctement
- Horaire "Longueuil 7/24" implémenté
- Module Maintenance supprimé (inutile)
- Correction du format d'erreur API (error.status/error.data au lieu de error.response)

## Tech Stack
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Shadcn/UI
- **Auth**: JWT avec expiration (24h users, 2h super-admins)

## Database Schema (Collections clés)
- `users`: + champ `equipe_garde: Optional[int]`
- `parametres_equipes_garde`: Configuration des rotations par tenant
- `disponibilites`: Disponibilités/indisponibilités des employés
- `assignations`: Assignations de planning
- `types_garde`: Types de garde avec `jours_application`

## API Endpoints (Nouveaux)
- `GET/PUT /api/{tenant}/parametres/equipes-garde`
- `GET /api/{tenant}/equipes-garde/equipe-du-jour?date=&type_emploi=`

## Files Modified (Session Jan 2026)
- `backend/server.py`: Équipes de garde, validation conflits, super-admin multi-tenant
- `frontend/src/components/ParametresEquipesGarde.jsx`: Nouveau composant
- `frontend/src/components/Parametres.js`: Ajout onglet Équipes
- `frontend/src/components/Personnel.jsx`: Champ équipe + type temporaire
- `frontend/src/components/Planning.jsx`: Affichage équipes + modal erreur
- `frontend/src/components/MesDisponibilites.jsx`: Modal erreur conflits
- `frontend/src/components/SuperAdminDashboard.js`: Timer inactivité 2h
- `frontend/src/components/Sidebar.jsx`: Menu temporaires + suppression maintenance

## Backlog / Future Tasks
- **P1**: Pré-remplissage automatique temps plein selon équipe
- **P1**: Phase 4 Planning - Intégration complète équipes de garde
- **P2**: Refactoring server.py en modules
- **P2**: Module Prévention (à développer)
- **P3**: Migration architecture native (hors ligne)
