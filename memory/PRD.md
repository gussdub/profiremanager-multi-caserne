# Crew Rotation App - PRD

## Application Overview
Application de gestion de planning pour services d'incendie avec support multi-tenant.

## Core Features Implemented

### Module Paie - Système Complet (Janvier 2026)

#### Gestion des feuilles de temps
- **Génération en lot**: Un clic génère les feuilles pour TOUS les employés actifs
- **Calcul automatique**: Agrège gardes planifiées, interventions, formations
- **Logique de rémunération**:
  - Garde interne (temps plein): Comptabilisé en stats, non payé en plus (déjà inclus dans salaire)
  - Garde externe: Payé avec heures minimum configurables + prime fixe (configurée par type de garde)
  - Rappel: Payé avec heures minimum configurables
  - Formation: Payé selon taux configurable
- **Workflow**: Brouillon → Validé → Exporté

#### Système d'export configurable (Super Admin + Tenant)
- **PayrollProvider** (Global): Définit les logiciels de paie (Nethris, Employeur D, Ceridian, My People Doc)
- **ProviderColumnDefinition** (Global): Structure des fichiers par fournisseur (colonnes, ordre, format)
- **ClientPayCodeMapping** (Tenant): Mapping des événements internes vers codes du logiciel de paie
- **TenantPayrollConfig** (Tenant): Sélection du fournisseur + credentials API

#### Intégration API Fournisseurs de Paie (Nouveau)
- **Fournisseurs supportés**:
  - **Nethris**: OAuth2 + Upload fichier (API complète)
  - **Employeur D**: OAuth2 + API User (en cours)
  - **Ceridian Dayforce**: SFTP uniquement (pas d'API REST directe)
- **Configuration Super Admin** (`PayrollProvidersAdmin.jsx`):
  - Templates pré-configurés (URLs, endpoints)
  - Champs requis pour les tenants (client_id, client_secret, business_id, etc.)
- **Configuration Tenant** (`ModulePaie.jsx > Export`):
  - Saisie des credentials API personnels
  - Bouton "Tester la connexion"
  - Bouton "Envoyer via API" (si connexion testée)
- **Endpoints API**:
  - `POST /{tenant}/paie/api/save-credentials` - Sauvegarder credentials
  - `POST /{tenant}/paie/api/test-connection` - Tester la connexion
  - `POST /{tenant}/paie/api/send` - Envoyer données via API
  - `GET /{tenant}/paie/api/fetch-codes` - Récupérer codes gains/déductions

#### Endpoints
- `POST /paie/feuilles-temps/generer-lot` - Génération pour tous les employés
- `POST /paie/export` - Export fichier vers le logiciel de paie
- `GET/PUT /{tenant}/paie/config` - Configuration fournisseur du tenant
- `GET/POST/DELETE /{tenant}/paie/code-mappings` - Mappings de codes
- `GET/POST/PUT/DELETE /super-admin/payroll-providers` - CRUD fournisseurs
- `GET/POST/PUT/DELETE /super-admin/payroll-providers/{id}/columns` - CRUD colonnes

#### Frontend (ModulePaie.jsx)
- **Onglet Feuilles de temps**: Génération en lot, liste, filtres, validation, détail, envoi API
- **Onglet Paramètres**: Période de paie, taux garde externe/rappel/formation, heures sup
- **Onglet Export**: Sélection fournisseur, credentials API, mapping des codes de paie

### Correction Calcul Primes de Repas (Janvier 2026)
- Calcul déplacé de `validate_intervention` vers `import-xml`
- Nouveau champ `primes_suggerees` calculé à l'import
- Permet la modification manuelle avant validation

### Système d'équipes de garde (Janvier 2026)
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

## Module Gestion des Interventions (Décembre 2025)

### Fonctionnalités Complétées
- **Import XML 911**: Parsing des fichiers XML CAUCA (Details, Ressources, Commentaires, Assistance)
- **Tableau Kanban**: File d'attente, Brouillon, À valider, À réviser, Signé
- **Météo automatique**: Via Open-Meteo + Geocoding si coordonnées GPS absentes
- **Gestion du Personnel**: Import équipes de garde, statuts de présence détaillés
- **Gestion du Matériel**: Suivi équipements, déduction automatique des stocks consommables à la signature
- **Module Facturation Entraide**: Paramètres avancés (tarifs par défaut, ententes spécifiques), détection automatique, génération PDF/Excel avec logo

### Calcul des Primes de Repas (Corrigé - Décembre 2025)
- **Avant**: Calcul à la signature (trop tard pour modification)
- **Après**: Calcul à l'import XML dans `primes_suggerees`
- **Champs**: `dejeuner`, `diner`, `souper`, `duree_heures`, `calculees_a_import`
- **Workflow**: Import → Primes suggérées calculées → Modification manuelle possible → Validation

### Schéma Base de Données (Interventions)
- `interventions`: + `primes_suggerees`, `primes_calculees`, `stock_deductions`, `facturation_details`, `facture_id`
- `intervention_settings`: + `repas_dejeuner`, `repas_diner`, `repas_souper`, `municipalites_desservies`, `tarifs_defaut_*`, `ententes_entraide`
- `factures_entraide`: Nouvelle collection pour les factures générées

### API Endpoints Clés
- `POST /api/{tenant}/interventions/import-xml` - Import avec calcul des primes
- `POST /api/{tenant}/interventions/{id}/validate` - Validation + déduction stock
- `POST /api/{tenant}/interventions/{id}/facture-entraide` - Génération facture
- `GET /api/users/{user_id}/statistiques-interventions` - Stats employé (backend prêt)

## Backlog / Future Tasks
- **P1**: Module Paie - Interface pour statistiques employés (backend prêt)
- **P1**: Pré-remplissage automatique temps plein selon équipe
- **P2**: Feuille de temps automatisée
- **P2**: Surveillance SFTP pour import XML automatique
- **P2**: Refactoring `server.py` en modules (dette technique importante)
- **P2**: Refactoring `GestionInterventions.jsx` (>4700 lignes)
- **P2**: Module Prévention (à développer)
- **P3**: Migration architecture native (hors ligne)
