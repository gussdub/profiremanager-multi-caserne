# 📝 Changelog - ProFireManager

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [Non publié]

### À venir
- Migration base de données pour anciennes assignations (ajout justification rétroactive)
- Traduction complète en français
- Amélioration performances page d'accueil

---

## [1.3.0] - 2025-01-25

### ✨ Ajouté

#### Système d'Audit des Affectations Automatiques
- **Modal d'Audit**: Interface complète pour analyser les décisions d'attribution automatique
  - Scores détaillés (Équité, Ancienneté, Disponibilité, Compétences)
  - Barres de progression visuelles colorées
  - Détails de l'employé (heures ce mois, moyenne équipe, années de service)
  - Liste des autres candidats évalués (top 10) avec raisons d'exclusion
  - Notes admin éditables
  - Statistiques globales
- **Bouton "🔍 Audit"**: Visible uniquement pour admins sur assignations automatiques
- **Rapports d'audit téléchargeables**: PDF et Excel du mois en cours
  - PDF: Rapport visuel détaillé (limite 50 assignations)
  - Excel: Tableau complet exportable (illimité)
- **Backend enrichi**:
  - Modèle `Assignation` avec champs `justification`, `notes_admin`, `justification_historique`
  - Fonction `generer_justification_attribution()` capture tous les détails de décision
  - Endpoint `PUT /assignations/{id}/notes` pour notes admin
  - Endpoint `GET /planning/rapport-audit` pour génération rapports

#### Animation de Chargement - Module "Mes Disponibilités"
- Overlay élégant lors de la création de disponibilités/indisponibilités en récurrence
- Messages progressifs détaillés
- Compteur en temps réel tous les 10 enregistrements
- Design cohérent avec l'attribution automatique (gradient violet)
- Empêche les actions utilisateur pendant le traitement

#### Sélection des Jours de la Semaine
- Cases à cocher visuelles pour récurrences hebdomadaires/bihebdomadaires
- Interface disponibilités (vert) et indisponibilités (rouge)
- Logique backend pour filtrer les dates selon les jours sélectionnés
- Compteur de jours sélectionnés

### 🔧 Modifié

#### Contrôle d'Accès
- Endpoint `/users` accessible en lecture seule pour tous les utilisateurs authentifiés
- Permet aux employés de voir les noms dans le Planning sans compromettre la sécurité

#### Interface Utilisateur
- Autocomplete activé sur formulaire de connexion (Face ID, Touch ID)
  - Email: `autoComplete="username email"`
  - Password: `autoComplete="current-password"`

### 🐛 Corrigé

- **Déconnexion "Mes Disponibilités"**: Employés temps partiel peuvent accéder sans déconnexion
- **Déconnexion "Planning"**: Employés peuvent accéder au Planning et voir les noms
- **Cases à cocher récurrence**: Affichage et fonctionnement corrects
- **Imports Backend**: Ajout `Body` et `Response` manquants (FastAPI)

### 🔒 Sécurité

- Validation rôle admin/superviseur pour endpoints sensibles
- Notes admin nécessitent authentification appropriée

### 📚 Documentation

- Création `BUGS.md` avec système de tracking structuré
- Templates GitHub Issues (bug report, feature request)
- Changelog pour suivi des versions

---

## [1.2.0] - 2025-01-XX (Version précédente)

### ✨ Ajouté
- Gestion des heures supplémentaires
- Regroupement des heures
- Paramètres avancés de planning

### 🔧 Modifié
- Interface Paramètres (grid de cards)
- Algorithme d'attribution automatique

---

## [1.1.0] - 2025-01-XX

### ✨ Ajouté
- Fonctionnalité "Mot de passe oublié"
- Multi-sélection types de garde (assignation manuelle avancée)
- Gestion super-admins

---

## [1.0.0] - 2024-XX-XX

### ✨ Ajouté
- Version initiale MVP
- Module Planning
- Module Mes Disponibilités
- Module Personnel
- Module Paramètres
- Authentification multi-tenant
- Base de données MongoDB

---

## Format des Versions

### Types de Changements
- **✨ Ajouté**: Nouvelles fonctionnalités
- **🔧 Modifié**: Changements dans fonctionnalités existantes
- **⚠️ Déprécié**: Fonctionnalités bientôt supprimées
- **🗑️ Supprimé**: Fonctionnalités retirées
- **🐛 Corrigé**: Corrections de bugs
- **🔒 Sécurité**: Corrections de vulnérabilités

### Versioning
- **MAJOR.MINOR.PATCH** (ex: 1.3.0)
  - **MAJOR**: Changements incompatibles avec versions précédentes
  - **MINOR**: Nouvelles fonctionnalités compatibles
  - **PATCH**: Corrections de bugs compatibles

---

**Maintenu par:** Équipe ProFireManager
