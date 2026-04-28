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
- Refonte InspectionDetailView: anomalies, workflow étapes, champs personnalisés PFM (avr 2026)
- Fix défilement bloqué modale historique (minHeight: 0) (avr 2026)
- Fix tri chronologique inspections (avr 2026)
- Fix pfm_photo_titles: noms descriptifs des photos conservés (avr 2026)
- Ajout filtres Année + Avec avis dans HistoriqueInspections (avr 2026)
- Import PFM personnel : création automatique de comptes utilisateurs (actif/inactif), liaison si compte existant. Mot de passe par défaut : Pompier@2024 (avr 2026)
- Section "Données PFM" dans modal Personnel : NAS, passeport, nominations, contacts urgence, photos, statut PFM (avr 2026)
- Badge "PFM" dans la liste et modal personnel pour le personnel importé (avr 2026)
- isFormerEmployee mis à jour pour gérer statut "Inactif" PFM (avr 2026)
- Fix bug "Champs requis" modale Personnel : email rendu optionnel pour employés importés PFM sans courriel (avr 2026)
- Fix extraction du grade lors de resolve_duplicate (import_batch.py) — grade PFM correctement mappé (avr 2026)
- Fix avis_emis stocké comme texte (pas booléen) + affichage du contenu dans InspectionDetailView (avr 2026)
- Fix hasAvis() dans HistoriqueInspections pour supporter booléen ET string (rétrocompatibilité) (avr 2026)
- Refonte complète du Service Worker (cache versionné, TTL 5min pour API, invalidation automatique) (avr 2026)
- CacheManager: service client pour invalider le cache après login/logout/import (avr 2026)
- Hook useCacheInvalidation pour faciliter l'invalidation après mutations (avr 2026)
- Prévisualisation fusion/remplacement des doublons avec tableau comparatif côte-à-côte (avr 2026)
- Badge persistant sur menu Paramètres pour signaler les doublons non résolus (avr 2026)
- Notification toast in-app avec détail par type d'entité lors de détection de doublons (avr 2026)
- Endpoint backend GET /import/duplicates/count-by-type pour agrégation par type (avr 2026)
- Option nettoyage "PFM uniquement" dans CleanupDataModal pour supprimer seulement le personnel importé PFM (avr 2026)
- **FIX CRITIQUE** : Correction logique statut actif/inactif PFM Transfer — Suppression condition date_fin. Seul le champ `inactif` de PFM détermine désormais le statut (import_batch.py ligne 2407) (avr 2026)
- Refonte complète Module Prévention — grilles avec 23 types de champs, auto-save 10s, auto-fill intelligent, bibliothèque globale 51 articles québécois (avr 2026)
- **FIX P0** : Seed 51 référentiels québécois exécuté sur DB production `profiremanager` (avr 2026)
- **FIX P0** : Bouton "Inspecter" sur fiche bâtiment ouvre maintenant DIRECTEMENT la grille appropriée selon `groupe_occupation` du bâtiment (auto-création de l'inspection) (avr 2026)
- **FIX** : App.js détecte maintenant le chemin URL pour router vers le bon module (ex: `/tenant/prevention?action=...`) (avr 2026)
- **FIX** : Bouton "Inspecter" masqué quand `module_prevention_active=false` sur le tenant (Batiments.jsx) (avr 2026)

## Backlog
- P1: Mettre à jour PDF rapport intervention avec nouvelles données RCCI
- P2: Aperçu d'emails en temps réel dans les paramètres admin
- P2: Audit complet du module Prévention
- P3: Refactoring `import_batch.py` (>2800 lignes), `planning_auto.py` (>2000 lignes), `GrillesInspectionComponents.jsx` (>1500 lignes)
- BLOQUÉ: Intégration CAUCA CAD (en attente certificats SSL utilisateur)
