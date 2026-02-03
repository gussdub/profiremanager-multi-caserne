# ProFireManager - Product Requirements Document

## Description
Application de gestion complète pour les services de pompiers. Gère le personnel, les interventions, les formations, les EPI, les équipements, les remplacements, la paie et la prévention incendie.

## Architecture
- **Frontend**: React avec Shadcn/UI
- **Backend**: FastAPI (Python)
- **Base de données**: MongoDB
- **Intégrations**: Resend (emails), Stripe (paiements), Twilio (SMS), ReportLab (PDF)

---

## Fonctionnalités Implémentées

### Module Prévention - Avis de Non-Conformité (Février 2026)
- ✅ Référentiel des infractions (`ref_violations`) avec codes, descriptions, délais
- ✅ Workflow de validation des inspections (en_attente_validation → validé/rejeté)
- ✅ Génération de PDF d'avis de non-conformité avec ReportLab
- ✅ Envoi de courriels aux contacts/propriétaires
- ✅ Vue "À valider" pour les préventionnistes
- ✅ Adressage intelligent (adresses postales différentes du bâtiment)
- ✅ Permissions d'édition granulaires sur la fiche bâtiment :
  - Préventionnistes/admins : modification complète
  - Autres utilisateurs : modification contacts et notes uniquement
- ✅ Bouton "Inspecter" retiré de la liste des bâtiments (disponible dans fiche détail)
- ✅ Grilles d'inspection dans les paramètres du module

### Module de Gestion des Secteurs (Février 2026)
- ✅ Définition de secteurs par municipalités, codes postaux ou polygones
- ✅ Carte interactive avec Leaflet pour dessiner les secteurs
- ✅ Intégration dans les paramètres généraux

### Module Horaires Personnalisés (Février 2026)
- ✅ Création d'horaires de rotation personnalisés (cycles 7-56 jours)
- ✅ Support des quarts 24h et Jour/Nuit (12h)
- ✅ Configuration des heures de travail (ex: 7h-18h jour, 18h-7h nuit)
- ✅ Calendrier visuel interactif pour "peindre" les jours de chaque équipe
- ✅ Aperçu du calendrier avec dates réelles
- ✅ Duplication d'horaires (prédéfinis ou personnalisés)
- ✅ Intégration dans le module "Mes disponibilités"
- ✅ Génération automatique des indisponibilités selon les heures configurées

### Module EPI (Janvier-Février 2026)
- ✅ Importation CSV/XLS/XLSX/TXT des EPI
- ✅ Correspondance intelligente des employés (fuzzy matching)
- ✅ Création automatique des types d'EPI manquants

### Autres Modules
- ✅ Gestion du personnel (temps plein/partiel)
- ✅ Gestion des interventions
- ✅ Gestion des formations (NFPA 1500)
- ✅ Gestion des remplacements
- ✅ Module de disponibilités/indisponibilités
- ✅ Alertes équipements sur le tableau de bord

---

## En Cours (P1)
- [ ] Module de rapport d'interventions (squelettes existants)

---

## Backlog (P2-P3)

### P2 - Priorité Moyenne
- Refactorisation des composants volumineux (ModuleEPI.jsx, GestionInterventions.jsx)
- Finaliser la transmission DSI réelle (actuellement **MOCK**)
- Module de gestion des jours fériés
- Module de facturation pour l'entraide
- Module "Schéma de couverture de risque"

### P3 - Priorité Basse
- Gestion véhiculaire (codes radio 10-07, 10-17, 10-90)

---

## Informations Techniques

### Collections MongoDB Prévention
- `ref_violations`: Référentiel des infractions (code_article, description, délai, sévérité)
- `inspections_visuelles`: Inspections avec statuts (brouillon, en_attente_validation, validé, rejeté)
- `avis_non_conformite`: Avis générés avec PDF et historique d'envoi
- `batiments`: Bâtiments avec adresses postales propriétaire/gestionnaire

### APIs Clés Prévention
- `GET/POST /api/{tenant}/ref-violations` - CRUD référentiel infractions
- `POST /api/{tenant}/inspections-visuelles/{id}/soumettre` - Soumettre pour validation
- `POST /api/{tenant}/inspections-visuelles/{id}/valider` - Valider inspection
- `POST /api/{tenant}/inspections/{id}/generer-avis` - Générer PDF avis
- `POST /api/{tenant}/avis-non-conformite/{id}/envoyer-courriel` - Envoyer par email

---

## Dernière mise à jour
3 février 2026
