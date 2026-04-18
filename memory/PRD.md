# PRD.md — ProFireManager v2.0

## Problem Statement
Application de gestion complète pour les services d'incendie canadiens. Multi-tenant.

## Architecture
- **Frontend**: React (CRA) + Tailwind + Shadcn/UI
- **Backend**: FastAPI + MongoDB (via MONGO_URL)
- **Stockage**: Azure Blob Storage
- **Emails**: Resend

## Import PFM Transfer — `/api/{tenant}/import/batch`
- 38 entity_types (14 principaux + 24 référentiels)
- Doublons: retourne `status: "duplicate"` + `id` existant
- `premligne_id` pour audit
- Employe enrichi: NAS, passeport, notes, permis

### DossierAdresse → Bâtiment
- Adresse séparée (civique / ville / code_postal)
- cadastre_matricule, annee_construction/renovation, etages, logements, sous-sol
- valeur_fonciere = valeur_immeuble, superficie_totale_m2
- classification, type_batiment, toit, parement, usage
- Personnes ressources → contacts dynamiques multi-types
- Photos depuis stored_files (Upload Transfer)

### Contacts dynamiques bâtiment
- Remplacement des 3 sections fixes (Propriétaire/Locataire/Gestionnaire)
- Liste dynamique avec bouton "Ajouter un contact"
- Chaque contact: type (Propriétaire/Locataire/Gestionnaire/Autre) + nom/prénom/tel/courriel/adresse
- Rétro-compatibilité: mapping vers champs legacy proprietaire_*/locataire_*/gestionnaire_*

## Completed
- Multi-tenant auth, planning, remplacements, prévention, EPI, bâtiments
- Migration Azure Blob Storage 100%
- Import PFM Transfer complet (38 types, avr 2026)
- Fix RCCI/Protection/DSI/PDF Remise (avr 2026)
- Fix CORS pour Transfer (avr 2026)
- Fix page blanche adresse objet (avr 2026)
- Enrichissement DossierAdresse complet (avr 2026)
- Contacts dynamiques multi-types (avr 2026)
- Fix géolocalisation Android (maximumAge: 0) (avr 2026)
- Fix logique remplacements séquentiel/simultané/groupe (avr 2026)
- Import PFM: matching Préventions via references DossierAdresse (avr 2026)
- Outil nettoyage Super Admin (CleanupDataModal + API /admin/cleanup-collections) (avr 2026)
- Correction erreur syntaxe JSX CleanupDataModal.jsx (build Vercel réparé) (avr 2026)

## Backlog
- P1: Historique inspections/prévention sur fiche bâtiment
- P2: Aperçu d'emails en temps réel dans les paramètres admin
