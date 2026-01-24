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
- **Backend**: FastAPI (Python) - fichier server.py (~41000 lignes)
- **Database**: MongoDB Atlas
- **Auth**: JWT + Super-Admin system (bcrypt uniquement)
- **Integrations**: Resend (emails), Stripe (paiements), Nethris/Employeur D/Ceridian (paie)

## What's Been Implemented

### January 23, 2025 - Session actuelle
- **Refactorisation Frontend GestionInterventions.jsx**:
  - ✅ Fichier réduit de 5651 à 2698 lignes (-52%)
  - ✅ 10 composants extraits dans `/components/interventions/`:
    - SectionIdentification.jsx (328 lignes)
    - SectionBatiment.jsx (537 lignes)
    - SectionRessources.jsx (824 lignes)
    - SectionDSI.jsx (133 lignes)
    - SectionProtection.jsx (141 lignes)
    - SectionMateriel.jsx (269 lignes)
    - SectionPertes.jsx (197 lignes)
    - SectionNarratif.jsx (233 lignes)
    - SectionRemisePropriete.jsx (458 lignes)
    - SectionFacturation.jsx (736 lignes)

- **Préparation Refactorisation Backend**:
  - ✅ Fichier `/backend/routes/paie.py` créé (template pour extraction future)
  - Module Paie identifié: lignes 38375-41039 (2665 lignes)

- **Corrections de bugs**:
  - ✅ Module Paie > Paramètres: correction erreur `editingEventType` null
  - ✅ Token dynamique avec `getToken()` au lieu de variable statique
  - ✅ Authentification bcrypt restaurée (pas de SHA256)
  - ✅ Modaux manquants dans module Paramètres (partiellement)
  - ✅ Boutons "Enregistrer/Annuler" dans modal Personnel
  - ✅ Tailles EPI synchronisées entre Mon Profil et Personnel

### January 2025 - Sessions précédentes
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

- **Corrections iOS**:
  - Bug reconnexion employés après déconnexion
  - Nettoyage credentials corrompus

- **Super-Admin**:
  - Connexion sur tous les tenants avec droits admin complets

## Technical Debt Status

### P0 - Critical (Partiellement résolu)
- ~~`GestionInterventions.jsx` (~6354 lignes)~~ → ✅ Réduit à 2698 lignes
- `server.py` (~41000 lignes) - Monolithe backend, extraction préparée mais non activée

### P1 - High (En attente)
- Extraction routes Paie vers `/backend/routes/paie.py` - Template créé
- Modaux d'édition dans module Paramètres - Partiellement corrigé

### P2 - Medium
- Tests unitaires à créer avant migration backend
- Documentation API à compléter

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
- **Tenant**: `shefford` (production), `pompiers-test` (dev)
- **Admin**: `admin@test.com` / `Test123!`
- **Super-Admin**: `gussdub@icloud.com` / `230685Juin+`

## Backlog / Future Tasks
1. Module de gestion des jours fériés
2. Module de facturation pour l'entraide inter-municipale
3. Extraction complète des routes backend (Paie, Prévention, Personnel, etc.)
4. Tests unitaires pour migration sécurisée

## Files of Reference
- `/app/backend/server.py` - API principale (41000 lignes)
- `/app/backend/routes/paie.py` - Template extraction module Paie
- `/app/frontend/src/components/GestionInterventions.jsx` - Module interventions (2698 lignes)
- `/app/frontend/src/components/interventions/` - Composants extraits (10 fichiers)
- `/app/frontend/src/components/ModulePaie.jsx` - Module paie
- `/app/frontend/src/contexts/AuthContext.js` - Authentification
- `/app/memory/REFACTORING_PLAN.md` - Plan de refactorisation
