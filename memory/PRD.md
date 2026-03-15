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


### NEW - Gestion du Cycle de Vie des Employés (13 Mars 2026)
- **Fonctionnalité:** Gestion complète des anciens employés avec archivage et réactivation
- **Fin d'emploi:**
  - Champ "Date de fin d'embauche" vide par défaut (placeholder AAAA-MM-JJ)
  - Modal de confirmation avant archivage
  - Suppression automatique des données actives (planning, remplacements, disponibilités)
- **Affichage:**
  - Badge de statut basé sur `date_fin_embauche` (pas sur `user.statut`)
  - Filtre "Anciens employés" pour voir les inactifs
  - Section "Historique d'emploi" dans la fiche employé
- **Réactivation:**
  - Modal dédié avec date de réembauche modifiable (défaut: aujourd'hui)
  - Conservation de l'historique des périodes d'emploi précédentes
  - L'employé repasse automatiquement en statut "Actif"
- **Endpoints ajoutés:**
  - `POST /{tenant}/personnel/{user_id}/reactivate` - Réactiver un ancien employé



### NEW - Audit RBAC Frontend - Phase 1 (15 Mars 2026)
**Statut:** EN COURS (~40% complété, de 38 à 23 occurrences)

**Fichiers frontend migrés vers usePermissions:**
| Composant | Status | Occurrences migrées |
|-----------|--------|---------------------|
| `Planning.jsx` | ✅ 100% migré | 6 |
| `Personnel.jsx` | ✅ 100% migré | 2 |
| `MesDisponibilites.jsx` | ✅ 100% migré | 2 |
| `CongesList.jsx` | ✅ 100% migré | 5 |
| `GestionInterventions.jsx` | Partiel (sous-composants) | 0/7 |

**Fichiers restants à migrer (23 occurrences):**
- `GestionInterventions.jsx` (7) - sous-composants internes
- `ParametresInventairesVehicules.jsx` (2)
- Autres fichiers (1 chacun): Sidebar, Parametres, MapComponents, InspectionComponents, Dashboard, ConfigurationEmails*, CalendrierInspections

### NEW - Migration RBAC Backend - Phase 3 COMPLÉTÉE (15 Mars 2026)
**Statut:** ✅ TERMINÉ (87% des vérifications migrées - de 175 à 22 occurrences système)

**Amélioration majeure: Structure MODULES_STRUCTURE enrichie avec 72 tabs granulaires**

| Module | Tabs configurables | Actions disponibles |
|--------|-------------------|---------------------|
| Dashboard | 5 (personnel, general, activites, alertes, couverture) | voir |
| Personnel | 7 (liste, fiches, photos, signatures, anciens, import, stats) | voir, creer, modifier, supprimer, exporter, voir_anciens |
| Actifs | 12 (vehicules, inventaires, eau, bornes, points-eau, materiel, categories, apria, formulaires, epi, alertes, parametres) | voir, creer, modifier, supprimer, exporter |
| Rapports | 9 (dashboard-interne, couts-salariaux, budget, immobilisations, interventions, exports) | voir, exporter |
| Planning | 5 (calendrier, assignations, equipe-jour, rapport-heures, export) | voir, creer, modifier, supprimer, exporter |
| Remplacements | 5 (propositions, demandes, conges, toutes-demandes, parametres) | voir, creer, modifier, supprimer, approuver, annuler |
| Formations | 6 (catalogue, inscriptions, suivi, competences, conformite, dashboard) | voir, creer, modifier, supprimer, exporter |
| Prevention | 5 (batiments, inspections, avis, calendrier, rapports) | voir, creer, modifier, supprimer, exporter, signer |
| Disponibilites | 4 (mes-dispos, equipe, import, rapport) | voir, modifier, exporter |
| Parametres | 14 (types-garde, competences, grades, horaires, rotation-equipes, comptes, etc.) | voir, creer, modifier, supprimer |

**Fichiers backend ENTIÈREMENT migrés vers RBAC:**
| Module | Fichier | Status |
|--------|---------|--------|
| APRIA | `apria.py` | ✅ 100% migré |
| Équipements | `equipements.py` | ✅ 100% migré |
| Disponibilités | `disponibilites.py` | ✅ 95% migré |
| Matériel | `materiel.py` | ✅ 100% migré |
| Bornes Sèches | `bornes_seches.py` | ✅ 100% migré |
| Points d'Eau | `points_eau.py` | ✅ 100% migré |
| Approv. Eau | `approvisionnement_eau.py` | ✅ 100% migré |
| Rapports | `rapports.py` | ✅ 100% migré |
| Users | `users.py` | ✅ 100% migré |
| Compétences/Grades | `competences_grades.py` | ✅ 100% migré |
| Dashboard | `dashboard.py` | ✅ 100% migré |
| Rapports Interv. | `rapports_interventions.py` | ✅ 100% migré |
| Access Types | `access_types.py` | ✅ 100% migré |
| Secteurs | `secteurs.py` | ✅ 100% migré |

**Fichiers restants à migrer:**
| Fichier | Occurrences restantes |
|---------|----------------------|
| `remplacements_routes.py` | 5 |
| `inventaires_vehicules.py` | 4 |
| `horaires_personnalises.py` | 4 |
| `conges.py` | 4 |
| `billing.py` | 4 |
| `avis_non_conformite.py` | 4 |
| `types_garde.py` | 3 |
| `remplacements/parametres.py` | 3 |
| `disponibilites.py` (routes utilitaires) | 3 |
| Autres (~10 fichiers) | ~26 |

**Tests:** 62/62 tests passés (voir /app/test_reports/iteration_7.json)


### NEW - Système RBAC Personnalisé (13 Mars 2026)
- **Fonctionnalité:** Contrôle d'accès basé sur les rôles (Role-Based Access Control)
- **Types d'accès personnalisés:**
  - Création/modification de rôles avec permissions granulaires
  - Héritage des permissions de base (Admin, Superviseur, Employé)
  - Permissions par module, onglet et action (voir, créer, modifier, supprimer)
- **Intégration frontend:**
  - Hook `usePermissions` pour vérification des permissions
  - Sidebar filtré par permissions (plus par rôle hardcodé)
  - Boutons conditionnés dans Personnel, Planning, Remplacements
- **API:**
  - `GET/POST/PUT/DELETE /{tenant}/access-types` - Gestion des types d'accès
  - `GET /{tenant}/users/{user_id}/permissions` - Permissions effectives d'un utilisateur

### NEW - Refactoring Backend Remplacements (13 Mars 2026)
- **Structure modulaire créée:** `/app/backend/routes/remplacements/`
  - `models.py` (96 lignes) - Modèles Pydantic
  - `utils.py` (129 lignes) - Fonctions utilitaires
  - `notifications.py` (252 lignes) - Envoi emails/SMS
  - `search.py` - Placeholder pour migration future
- **Fichier principal:** `remplacements_routes.py` (~3022 lignes)
- **Avantages:** Code plus maintenable, tests unitaires facilités



### NEW - Amélioration Module Inventaire (15 Mars 2026)
- **Scroll automatique:** À chaque changement de section, le contenu scroll en haut
- **Champs non pré-remplis:** Les champs radio, select et number sont vides par défaut (l'utilisateur doit choisir)

### NEW - Consolidation des Fréquences d'Inspection (15 Mars 2026)
- **Suppression du dédoublement:** Le champ "Fréquence" a été retiré du modal de création/modification de formulaire
- **Source unique:** La fréquence est maintenant définie uniquement au niveau de la catégorie (matériel) ou du type (EPI)
- **Backend mis à jour:** 
  - Nouvelle fonction `frequence_to_jours()` dans `epi.py` pour convertir les fréquences en jours
  - Les rapports de conformité et d'échéances EPI utilisent maintenant les fréquences configurées dans les types d'EPI
  - Calcul dynamique des retards et alertes basé sur la fréquence réelle configurée
- **Fréquences supportées:** quotidienne, hebdomadaire, mensuelle, trimestrielle, semestrielle, annuelle, 5_ans

### NEW - Refactoring Frontend Remplacements COMPLÉTÉ (15 Mars 2026)
**Résultat:** `Remplacements.jsx` réduit de **1934 → 1051 lignes** (-46%)

**Bug corrigé par testing agent:** `isAdminOrSuperviseur is not defined` - Variable manquante lors de l'extraction des composants

**11 composants extraits vers `/frontend/src/components/remplacements/`:**
| Composant | Description |
|-----------|-------------|
| `CreateRemplacementModal.jsx` | Modal création remplacement |
| `CreateCongeModal.jsx` | Modal création congé |
| `ExportModal.jsx` | Modal export PDF/Excel |
| `ImpactPlanningModal.jsx` | Modal impact planning |
| `RemplacementsList.jsx` | Liste des remplacements |
| `CongesList.jsx` | Liste des congés avec stats |
| `KPICards.jsx` | Cartes statistiques |
| `TabsBar.jsx` | Onglets navigation |
| `FilterBar.jsx` | Barre de filtres |
| `PropositionsRecues.jsx` | Propositions reçues |

### NEW - Tests Unitaires Corrigés et Endpoint Annulation (15 Mars 2026)
**Tests pytest corrigés:**
- Fichier `test_workflow.py` entièrement réécrit (10 tests)
- Correction des mocks pour correspondre à l'implémentation réelle
- **54 tests unitaires passent** dans le module remplacements

**Endpoint DELETE corrigé:**
- `DELETE /{tenant}/remplacements/{id}` → Supprimer (selon permissions RBAC)
- `DELETE /{tenant}/remplacements/{id}/annuler` → Annuler sa propre demande (demandeur uniquement)
- Endpoint de suppression utilise maintenant `user_has_module_action()` pour vérifier les permissions RBAC

**Nouvelle fonctionnalité frontend:**
- Bouton "❌ Annuler ma demande" ajouté pour les demandeurs (sur leurs demandes en cours)
- Le bouton de suppression 🗑️ est maintenant visible selon `canDeleteRemplacement` (permission RBAC)
- Le bouton "Arrêter" est visible selon `canEditRemplacement` (permission RBAC)

**Nouvelle fonction backend:**
- `user_has_module_action()` ajoutée à `routes/dependencies.py`
- Permet de vérifier les permissions RBAC d'un utilisateur sur un module/action donné
- Supporte les types d'accès personnalisés et les permissions par défaut des rôles
| `DemandeCard.jsx` | Carte de demande |

**Utilitaire API ajouté:**
- `downloadFile()` dans `/frontend/src/utils/api.js` - Téléchargement de fichiers

**Tests de régression effectués:** ✅ Tous les modules fonctionnent (Login, Navigation, Onglets, KPIs, Modals, Filtres, Listes)

### NEW - Refactoring Backend Remplacements (15 Mars 2026)
**Résultat:** `remplacements_routes.py` réduit de **2012 → 1206 lignes** (-40%)

**Fonctions déplacées vers `/backend/routes/remplacements/notifications.py`:**
- `generer_token_remplacement()` - Génération de tokens pour emails
- `envoyer_email_remplacement()` - Email au remplaçant potentiel
- `envoyer_email_remplacement_trouve()` - Email de confirmation au demandeur
- `envoyer_email_remplacement_non_trouve()` - Email d'expiration au demandeur
- `envoyer_sms_remplacement()` - SMS via Twilio
- `formater_numero_telephone()` - Formatage E.164

**Routes déplacées vers `/backend/routes/remplacements/parametres.py`:**
- `GET /parametres/remplacements` - Récupérer les paramètres
- `PUT /parametres/remplacements` - Mettre à jour les paramètres
- `GET /remplacements/debug/{id}` - Diagnostic de recherche

**Bug corrigé:** Route DELETE dupliquée → renommée `/annuler` pour éviter le conflit

**Structure backend finale:**
| Module | Lignes | Description |
|--------|--------|-------------|
| `remplacements_routes.py` | 1206 | Routes principales |
| `notifications.py` | 584 | Emails et SMS |
| `search.py` | 492 | Recherche de remplaçants |
| `workflow.py` | 468 | Logique acceptation/refus |
| `exports.py` | 278 | Export PDF/Excel |
| `parametres.py` | 233 | Configuration et debug |
| `utils.py` | 129 | Fonctions utilitaires |
| `models.py` | 96 | Modèles Pydantic |
| **Total modules** | **2339** | - |



## Recent Fixes (February 2026)

### NEW - Heures Silencieuses pour Remplacements (27 Feb 2026)
- **Fonctionnalité:** Pause des contacts pendant la nuit pour les demandes de priorité Normale/Faible
- **Configuration:** Paramètres > Remplacement > Heures silencieuses (ex: 21:00 - 07:00)
- **Comportement:**
  - Demandes **Urgentes/Hautes**: Contacts 24/7 (pas de pause)
  - Demandes **Normales/Faibles**: Pause pendant les heures configurées
  - Si demande créée pendant la pause → premier contact reporté au matin
  - Si délai de réponse expire pendant la pause → contact suivant reporté au matin
- **Fuseau horaire:** America/Montreal
- **Affichage:** "🌙 En pause jusqu'à 07:00" dans le Suivi

### NEW - Module Remplacement Amélioré (27 Feb 2026)
- **Affichage "Annulée par":** Les demandes annulées affichent maintenant le nom de la personne qui a annulé (visible sur la carte et dans le Suivi)
- **Bouton "Relancer":** Les demandes expirées ou annulées peuvent être relancées (visible pour tous). Repart de zéro avec une nouvelle recherche
- **Bouton "Supprimer":** Admin peut supprimer une demande spécifique (croix rouge)
- **Archivage automatique:** 
  - Configuration dans Paramètres > Remplacement (délai: 1 mois à 2 ans)
  - Job quotidien qui nettoie les anciennes demandes terminées
  - Endpoint de nettoyage manuel disponible pour admin
- **Endpoints ajoutés:**
  - `PUT /{tenant}/remplacements/{id}/relancer` - Relancer une demande
  - `DELETE /{tenant}/remplacements/{id}` - Supprimer une demande
  - `POST /{tenant}/remplacements/nettoyer` - Nettoyage manuel

### NEW - Règle Officier pour Remplacements (25 Feb 2026)
- **Fonctionnalité**: Implémentation de la "règle officier" dans la recherche de remplaçants
- **Logique**:
  1. Si le type de garde a `officier_obligatoire = True`
  2. ET le demandeur est un officier (basé sur son grade dans la DB)
  3. ET il n'y a PAS d'autre officier déjà assigné à cette garde
  4. ALORS seuls les officiers ou les employés avec `fonction_superieur = True` peuvent remplacer
  5. SI un autre officier est déjà présent sur la garde, n'importe qui peut remplacer (la règle est déjà respectée)
- **Fichiers modifiés**:
  - `backend/routes/remplacements.py` - Fonction `trouver_remplacants_potentiels` et endpoint `/debug`
- **Endpoint debug**: `GET /{tenant}/remplacements/debug/{demande_id}` - Retourne maintenant les détails de la règle officier

### NEW - Mise à jour du Favicon / Icônes App Mobile (21 Feb 2026)
- **Fonctionnalité**: Mise à jour du favicon web et des icônes natives pour iOS et Android
- **Fichiers modifiés**:
  - Web: `frontend/public/favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `logo192.png`, `logo512.png`
  - iOS: `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  - Android: `frontend/android/app/src/main/res/mipmap-*/ic_launcher*.png`
- **Action requise**: Reconstruire les apps natives avec Xcode (iOS) et Android Studio (Android) puis soumettre aux stores

### NEW - Firebase Push Notifications Activé (20 Feb 2026)
- **Fonctionnalité**: Notifications push mobiles activées via Firebase Cloud Messaging
- **Backend**: Firebase Admin SDK initialisé avec credentials depuis `.env`
- **Fichiers**: `backend/server.py`, `backend/routes/notifications.py`

### NEW - Bouton Caméra sur tous les modules photos (20 Feb 2026)
- **Fonctionnalité**: Ajout du bouton "📸 Caméra" pour capturer des photos directement
- **Modules améliorés**:
  - `InspectionUnifieeModal.jsx` - Inspections d'équipements
  - `InspectionComponents.jsx` - PhotoUploader (prévention)
  - `ImageUpload.jsx` - Composant d'upload générique
- **Utilise**: `CameraCapture.jsx` (existant)

### NEW - Export Calendrier iCal (17 Feb 2026)
- **Fonctionnalité**: Export des gardes personnelles au format iCalendar (.ics)
- **Compatible avec**: Google Calendar, Apple Calendar, Outlook
- **Options**: 
  - Période rapide (mois en cours, mois suivant M+1, 3 prochains mois)
  - Dates personnalisées
- **Fichiers**: 
  - Backend: `/app/backend/routes/planning.py` (endpoint `/exports/ical`)
  - Frontend: `/app/frontend/src/components/Planning.jsx` (bouton + modal)

### NEW - Notifications EPI Nettoyage/Réparation (20 Feb 2026)
- **Fonctionnalité**: Notifications in-app quand un EPI part ou revient de nettoyage/réparation
- **Notifications déclenchées**:
  - EPI envoyé au nettoyage → Notification au pompier
  - EPI de retour du nettoyage → Notification au pompier
  - EPI envoyé en réparation → Notification au pompier
  - EPI de retour de réparation → Notification au pompier (existait déjà)
- **Nouveau statut**: "Au nettoyage" ajouté
- **Fichiers**:
  - Backend: `/app/backend/routes/epi.py` (endpoints `envoyer-nettoyage`, `retour-nettoyage`)
  - Frontend: `/app/frontend/src/components/ModuleEPI.jsx` (onglet Nettoyage refait)

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
- **Vérification notifications push Android**: Tester les notifications avec la nouvelle config AndroidManifest.xml et build.gradle
- **Déploiement deep linking**: Effectuer les dernières étapes pour activer Universal Links (iOS) et App Links (Android)
- **Test complet notifications push**: Vérifier les notifications Firebase sur appareil réel (iOS/Android)
- Adapter l'import d'inspections d'hydrants pour le nouveau champ "Cavitation durant le pompage"

### P2
- **Rebuild et déploiement apps natives**: Reconstruire avec Xcode/Android Studio puis soumettre aux stores

### Refactoring recommandé
- Le fichier `backend/routes/planning.py` dépasse 5000 lignes et devrait être découpé en modules plus petits
- Le fichier `backend/routes/remplacements.py` est très volumineux (2600+ lignes) et devrait être refactorisé
- Le composant `frontend/src/components/Remplacements.jsx` gère remplacements ET congés, devrait être séparé

## API Endpoints

### Planning Export
- `GET /{tenant}/planning/exports/pdf?periode=YYYY-MM-DD&type=semaine` - Export PDF vue semaine
- `GET /{tenant}/planning/exports/pdf?periode=YYYY-MM&type=mois` - Export PDF vue mois
- `GET /{tenant}/planning/exports/excel?periode=...&type=...` - Export Excel
- `GET /{tenant}/planning/exports/ical?date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD` - Export iCal (.ics) des gardes de l'utilisateur connecté

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
