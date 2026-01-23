# ProFireManager - Product Requirements Document

## Original Problem Statement
Application de gestion complète pour les services d'incendie, incluant:
- Gestion des interventions 911 avec import XML des cartes d'appel
- Module de Paie avec calculs automatisés et export vers fournisseurs
- Module Prévention pour les bâtiments et inspections
- Gestion du personnel, formations, équipements, disponibilités
- Multi-tenant avec facturation Stripe

## User's Preferred Language
French (Français)

## Core Architecture
- **Frontend**: React 18 avec Shadcn/UI, TailwindCSS
- **Backend**: FastAPI (Python) - fichier monolithique server.py (~41000 lignes)
- **Database**: MongoDB Atlas
- **Auth**: JWT + Super-Admin system
- **Integrations**: Resend (emails), Stripe (paiements), Nethris/Employeur D/Ceridian (paie)

## What's Been Implemented

### January 2025
- **Module Interventions complet**:
  - Import XML 5 fichiers (Details, Ressources, Commentaires, Assistance/Entraide, PriseAppel)
  - Formulaire DSI complet avec onglets dynamiques
  - Remise de propriété avec signature numérique et envoi PDF par email
  - Accès lecture seule pour employés (configurable)
  - Onglet Bâtiment intégré au module Prévention

- **Module Paie amélioré**:
  - Calculs temps réel dans l'édition des feuilles de temps
  - Types d'heures personnalisés avec unités (heures, km, $)
  - Prime fonction supérieure
  - Export multi-statuts avec nom fournisseur dynamique
  - Filtre par mois

- **Corrections iOS**:
  - Bug reconnexion employés après déconnexion
  - Nettoyage credentials corrompus

- **Super-Admin**:
  - Connexion sur tous les tenants avec droits admin complets

## Known Technical Debt

### P0 - Critical
- `server.py` (~41000 lignes) - Monolithe backend à décomposer
- `GestionInterventions.jsx` (~6354 lignes) - À décomposer en sous-composants

### P1 - High
- Extraction routes Paie vers `/backend/routes/paie.py`
- Structure `/components/interventions/` créée mais composants non extraits

## API Endpoints - Module Interventions
- `GET /api/{tenant}/interventions/settings` - Paramètres du module
- `PUT /api/{tenant}/interventions/settings` - Mise à jour paramètres
- `GET /api/{tenant}/interventions/dashboard` - Dashboard cartes d'appel
- `POST /api/{tenant}/interventions/import-xml` - Import fichiers XML
- `GET /api/{tenant}/interventions/{id}` - Détail intervention
- `PUT /api/{tenant}/interventions/{id}` - Mise à jour intervention
- `POST /api/{tenant}/interventions/{id}/remise-propriete` - Créer remise
- `GET /api/{tenant}/tenant-info` - Infos tenant (module prévention actif, etc.)

## Database Collections
- `interventions` - Rapports d'intervention
- `intervention_settings` - Paramètres par tenant
- `intervention_assistance` - Données d'entraide
- `remises_propriete` - Formulaires de remise signés
- `paie_parametres` - Configuration paie
- `feuilles_temps` - Feuilles de temps employés

## Test Credentials
- **Tenant**: `demo`
- **Admin**: `admin@demo.ca` / `Test123!`
- **Super-Admin**: `gussdub@icloud.com` / `230685Juin+`
- **Employé test**: `testemploye@demo.ca` / `Test123!`

## Backlog / Future Tasks
1. Module de gestion des jours fériés
2. Module de facturation pour l'entraide inter-municipale
3. Refactorisation complète backend/frontend

## Files of Reference
- `/app/backend/server.py` - API principale
- `/app/frontend/src/components/GestionInterventions.jsx` - Module interventions
- `/app/frontend/src/components/ModulePaie.jsx` - Module paie
- `/app/frontend/src/contexts/AuthContext.js` - Authentification
- `/app/frontend/src/components/AuthComponents.jsx` - Login/Logout
