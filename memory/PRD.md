# PRD.md — ProFireManager

## Vision
ProFireManager est un système de gestion de service incendie complet, couvrant le planning, la prévention, les interventions, les EPI, les équipements et la formation.

## Architecture
- **Backend**: FastAPI (Python), MongoDB
- **Frontend**: React
- **3rd-party**: Resend (emails), Twilio (SMS), Object Storage (Emergent)

## Fonctionnalités Complétées

### Phase 1 - Core
- Module Planning (gardes, remplacements, disponibilités)
- Module Prévention (bâtiments, inspections, conformités)
- Module Interventions (import XML 911, rapports, primes)
- Module EPI, Équipements, Formations
- RBAC avec types d'accès personnalisés
- Rotation temps plein N1.1

### Phase 2 - Imports et Object Storage (Mars 2026)
- **Import ZIP (ProFireManager)**: Import de fichiers .zip contenant CSV + photos/documents. Extraction automatique, parsing CSV, upload des médias vers Object Storage, association aux bâtiments par proximité d'ID.
- **Object Storage**: Stockage de fichiers (photos, PDFs) via Emergent Object Storage.
- **Onglet Photos**: Bouton "Photos" dans le modal bâtiment affichant les photos importées depuis Object Storage + photos legacy.
- **Import Historique Interventions**: Nouvel onglet (8e) dans Paramètres/Import CSV supportant CSV, XML et ZIP.
- **File Storage API**: Upload, download (avec auth query param pour img tags), liste par entité, suppression soft.

### Bug Fixes (Mars 2026)
- Corrigé JWT_SECRET mismatch dans file_storage.py (photos non visibles)
- Corrigé overflow des boutons du modal bâtiment (flexWrap: 'wrap' + sticky)
- Corrigé bug Personnalisation : le nom du service ne se sauvegardait pas (cache tenant non invalidé après PUT). Ajout de `invalidate_tenant_cache()` dans `dependencies.py`, appelé après chaque mise à jour dans `personnalisation.py`.
- Notifications planning conditionnelles : les notifications (in-app, push, email) ne sont plus envoyées lors d'assignations manuelles pré-publication. Elles ne sont déclenchées que si le planning du mois est déjà publié (existence d'assignations "publie").
- Corrigé bug "Load failed" rondes de sécurité : la sérialisation de la réponse pouvait échouer (datetime, _id) après que la ronde soit sauvegardée. Retour explicite d'un dict JSON propre + try/except sur les opérations post-save (véhicule, notifications).

## Endpoints Clés Ajoutés
- `POST /{tenant}/batiments/import/zip/preview` - Prévisualise import ZIP
- `POST /{tenant}/batiments/import/zip/execute` - Exécute import ZIP + upload médias
- `POST /{tenant}/files/upload` - Upload fichier vers Object Storage
- `GET /{tenant}/files/{id}/download?auth=TOKEN` - Télécharge fichier
- `GET /{tenant}/files/by-entity/{type}/{id}` - Liste fichiers par entité
- `DELETE /{tenant}/files/{id}` - Suppression soft
- `POST /{tenant}/interventions/import-history/preview` - Prévisualise import interventions
- `POST /{tenant}/interventions/import-history/execute` - Exécute import interventions

### Feature: Quarts Ouverts (Mars 2026)
- Quand l'algorithme de remplacement ne trouve personne, la demande passe en statut `ouvert` au lieu de `expiree`
- **Broadcast** : Tous les employés actifs reçoivent une notification push + in-app
- **Endpoint GET** `/remplacements/quarts-ouverts` : retourne les quarts ouverts (dates futures)
- **Endpoint PUT** `/remplacements/{id}/prendre` : premier arrivé, premier servi ou avec approbation admin
- **Endpoint PUT** `/remplacements/{id}/approuver-quart` : admin approuve un volontaire
- **Endpoint PUT** `/remplacements/{id}/refuser-quart` : admin refuse, remet en "ouvert"
- **Paramètre configurable** : `quart_ouvert_approbation_requise` (toggle dans Paramètres > Remplacements)
  - Désactivé : Premier arrivé, premier servi (automatique)
  - Activé : Le volontaire est en attente d'approbation, un admin approuve/refuse
- **Frontend** : Onglet "Quarts disponibles" (ambre) dans TabsBar, composant `QuartsOuverts.jsx` avec deux sections (ouverts + attente approbation)
- **Sécurités** : Bloque auto-prise, double-prise, dates passées
- **Statuts** : `ouvert`, `en_attente_approbation` (nouveaux)

### Bug Fix: Notifications in-app manquantes (Mars 2026)
- **Cause racine**: Les insertions directes dans `db.notifications` utilisaient `user_id` au lieu de `destinataire_id` et manquaient le champ `statut: "non_lu"`. L'endpoint GET filtre par `destinataire_id`, donc ces notifications étaient invisibles.
- **Fichiers corrigés**: `remplacements_routes.py`, `workflow.py`, `prevention_config.py`, `broadcast.py`, `disponibilites.py`, `parametres_disponibilites.py`
- **Migration**: 113 anciennes notifications en base corrigées (ajout `destinataire_id` depuis `user_id`)
- **Test**: `/app/backend/tests/test_notif_remplacements.py` — 6/6 tests OK

## Backlog
- P3: Améliorer UX carte des secteurs
- P3: Lazy loading tableau bâtiments
- Refactorisation: planning.py (~5300 lignes), Parametres.js (~2600 lignes)
- Historique modifications permissions
- Drag & drop pour réassigner les photos entre bâtiments

## Multi-Casernes (Phase 1-3 DONE - Mars 2026)
### Phase 1-2: Fondations + UI
- Collection `casernes` avec CRUD API complet
- Toggle `multi_casernes_actif` sur le tenant
- Champ `mode_caserne` ("global" / "par_caserne") sur les types de garde
- Champ `caserne_id` sur les assignations (optionnel)
- Champ `caserne_ids` sur les utilisateurs (rattachement multi-caserne)
- Onglet "Casernes" dans Paramètres avec gestion CRUD visuel
- Sélecteur mode_caserne dans les formulaires de types de garde
- Sélecteur casernes dans les formulaires employés

### Phase 3: Attribution automatique
- Types "par_caserne" expandés en copies virtuelles (une par caserne) avant attribution
- Pool de candidats filtré par `caserne_ids` de chaque utilisateur
- `caserne_id` automatiquement assigné à chaque assignation créée
- Types "global" : logique existante préservée intégralement

### Phase 4: Remplacements filtrés par caserne
- `trouver_remplacants_potentiels` dans `/app/backend/routes/remplacements/search.py` filtre les candidats par caserne
- Lookup du `caserne_id` depuis l'assignation originale
- Fallback sur `caserne_ids` du demandeur si pas d'assignation trouvée
- Types "global" : aucun filtrage caserne, logique inchangée

### Phase 5: Filtre caserne dans la vue planning
- Barre de filtres caserne (pills) dans la toolbar du planning (Toutes / C1 / C2 / ...)
- `filteredAssignations` memo qui filtre les assignations par caserne sélectionnée
- Types "global" toujours visibles quel que soit le filtre caserne sélectionné
- Types "par_caserne" filtrés par caserne_id de l'assignation
- Filtre visible uniquement si multi_casernes_actif et casernes configurées

### Phase 6: Tests de non-régression (DONE)
- Backend 17/17, Frontend 100% (iteration_21.json)
- Non-régression validée: login, types garde, users, assignations, suppression
- Multi-casernes API: CRUD complet, config toggle, unicité, protection suppression
- UI: onglet casernes, toggle, modal CRUD, filtres planning, mode_caserne selector
