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
- **Object Storage**: Stockage de fichiers (photos, PDFs) via Emergent Object Storage (`/app/backend/utils/object_storage.py`).
- **Onglet Photos**: Bouton "Photos" dans le modal bâtiment affichant les photos importées depuis Object Storage + photos legacy.
- **Import Historique Interventions**: Nouvel onglet dans Paramètres/Import CSV supportant CSV, XML et ZIP.
- **File Storage API**: Upload, download (avec auth query param pour img tags), liste par entité, suppression soft.

## Endpoints Clés Ajoutés
- `POST /{tenant}/batiments/import/zip/preview` - Prévisualise import ZIP
- `POST /{tenant}/batiments/import/zip/execute` - Exécute import ZIP + upload médias
- `POST /{tenant}/files/upload` - Upload fichier vers Object Storage
- `GET /{tenant}/files/{id}/download?auth=TOKEN` - Télécharge fichier
- `GET /{tenant}/files/by-entity/{type}/{id}` - Liste fichiers par entité
- `DELETE /{tenant}/files/{id}` - Suppression soft
- `POST /{tenant}/interventions/import-history/preview` - Prévisualise import interventions
- `POST /{tenant}/interventions/import-history/execute` - Exécute import interventions

## Fichiers Clés Modifiés/Créés
- `/app/backend/utils/object_storage.py` (NOUVEAU)
- `/app/backend/routes/file_storage.py` (NOUVEAU)
- `/app/backend/routes/import_interventions.py` (NOUVEAU)
- `/app/backend/routes/batiments_import.py` (MODIFIÉ - ajout ZIP)
- `/app/frontend/src/components/ImportBatimentsIntelligent.jsx` (MODIFIÉ - .zip)
- `/app/frontend/src/components/ImportInterventions.jsx` (NOUVEAU)
- `/app/frontend/src/components/ParametresImports.jsx` (MODIFIÉ - 8 onglets)
- `/app/frontend/src/components/BatimentDetailModalNew.jsx` (MODIFIÉ - Photos)
- `/app/frontend/src/components/GaleriePhotosBatiment.jsx` (MODIFIÉ - Object Storage)

## Backlog
- P3: Améliorer UX carte des secteurs
- P3: Lazy loading tableau bâtiments
- Refactorisation: planning.py (~5300 lignes), Parametres.js (~2600 lignes)
- Historique modifications permissions
