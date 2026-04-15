# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage fichiers**: Azure Blob Storage (profiremanagerdata / fichiers-clients)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`

## Import PFM Transfer — `/api/{tenant}/import/batch`

### Flux
1. Transfer envoie record JSON → reçoit `{status, id}`
2. Transfer upload chaque fichier (photo/PDF) via `/files/upload?entity_id=uuid`
3. Frontend lit les fichiers depuis `stored_files` et les affiche

### Entity Types supportés (38 total)

**14 Entités principales** : Intervention, DossierAdresse, Prevention, RCCI, PlanIntervention, Employe, BorneIncendie, BorneSeche, PointEau, MaintenanceBorne, Travail, Vehicule, EquipExist, MaintEquip

**24 Référentiels** : Caserne, Grade, Equipe, Groupe, CodeAppel, TypePrevention, TypeBatiment, TypeEquipement, TypeChauffage, TypeToit, Parement, Plancher, TypeAnomalie, TypeMaint, ModeleBorne, TypeValve, UsageBorne, Raccord, Classification, ReferenceCode, Fournisseur, Programme, Cours, TypeChampPerso

### Fonctionnalités
- Extraction profonde (deep_get) des données PremLigne imbriquées
- Détection de doublons → retourne `status: "duplicate"` + `id` existant (Transfer peut uploader les fichiers)
- `premligne_id` stocké sur chaque record pour audit/traçabilité
- `matched_fks` dans la réponse pour confirmer les FK résolues
- Employé enrichi : NAS, passeport, notes, permis de conduire, langue, contacts urgence, nominations
- RCCI lazy : créé à la demande avec normalisation cause_probable/ignition_source
- Protection : valeurs "worked"/"not_worked" conformes au frontend
- PDF Remise de Propriété : fallback génération à la volée

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- Migration Azure Blob Storage 100%
- Import historique interventions avec mapping intelligent et rétroactif
- Import PFM Transfer complet (38 entity_types, avr 2026)
- Correction onglets RCCI/Protection/DSI vides (avr 2026)
- Correction PDF Remise de Propriété 404 (avr 2026)
- Format réponse compatible Transfer (avr 2026)
- Gestion doublons avec retour id existant (avr 2026)
- UI Gestion des Doublons (Paramètres > Imports CSV)

## Backlog
- P2: Aperçu d'emails en temps réel dans les paramètres admin
