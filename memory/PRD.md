# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant, planning, remplacements, prévention, EPI, bâtiments, interventions, approvisionnement en eau.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage fichiers**: Azure Blob Storage (profiremanagerdata / fichiers-clients)
- **Emails**: Resend (RESEND_API_KEY) + `services/email_builder.py`

## Import Historique Interventions (Avr 2026)
### Fonctionnalités
- **Import par chunks (disque)** : Chunks de 50 Mo stockés sur disque (pas en RAM) pour gérer les fichiers > 1 Go
- **Retry automatique** : 3 tentatives par chunk avec backoff exponentiel
- **Parsing** : CSV/XML/ZIP ProFireManager (DossierAdresse.csv, Intervention.csv)
- **Mapping intelligent** : numéro civique + rue + ville normalisés, + dossier_adresse_id
- **Mapping rétroactif** : Quand un bâtiment est créé, les interventions orphelines sont auto-reliées
- **Badge "Importé"** uniquement pour les importées, pas de badge pour les normales
- **Fiche bâtiment** : Toutes les interventions (normales + importées) par batiment_id ou correspondance d'adresse
- **Upload fichiers** vers Azure Blob Storage

## Completed Features
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- Migration Azure Blob Storage 100%
- Import historique interventions avec mapping intelligent et rétroactif

## Backlog
- P2: Aperçu d'emails en temps réel dans les paramètres admin
