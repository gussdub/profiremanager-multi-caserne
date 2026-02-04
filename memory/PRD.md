# ProFireManager - Document de Référence Produit (PRD)

## Problème Original
Application de gestion complète pour les services d'incendie, incluant :
- Gestion des interventions et de la paie des pompiers
- Module de génération d'avis de non-conformité
- Éditeur de grilles d'interventions
- Gestion des bâtiments et de la prévention

## Fonctionnalités Principales Implémentées

### 1. Gestion de la Paie (Avancée)
- Minimum d'heures payées configurable par source d'appel (CAUCA vs Urgence Santé)
- Détection automatique de la source via chemin SFTP
- Workflow de validation : Brouillon → Validé → Exporté
- Export PDF groupé des feuilles de temps

### 2. Gestion des Actifs - Véhicules
- Champs enrichis : PNBV, type (urgence/soutien), statut
- Suivi des vignettes d'inspection mécanique
- Carnet de réparations avec historique complet
- Alertes de maintenance sur le tableau de bord
- Fiche de vie du véhicule

### 3. Gestion des Actifs - Équipements ✅ NOUVEAU
- Liste déroulante pour la fréquence d'inspection (journalière, hebdomadaire, mensuelle, bi-annuelle, annuelle, 2 ans, après usage)
- Champ date de dernière inspection
- Alertes automatiques sur le tableau de bord quand inspection due
- Statistiques enrichies avec compteurs d'alertes

### 4. Module Prévention
- Interface harmonisée avec onglets horizontaux rouges
- Gestion des bâtiments et inspections

### 5. Rapports d'Interventions
- Route de seeding pour données de test (390 interventions)
- Filtres et exports

## Architecture Technique

```
/app
├── backend/
│   ├── models/
│   │   └── paie.py
│   ├── routes/
│   │   ├── actifs.py          # Véhicules, réparations
│   │   ├── auth.py
│   │   ├── dashboard.py       # Alertes véhicules et équipements
│   │   ├── equipements.py     # CRUD équipements + inspections
│   │   ├── paie_complet.py    # Logique paie + export PDF
│   │   └── ...
│   └── services/
│       └── sftp_service.py    # Détection source d'appel
└── frontend/
    └── src/
        ├── components/
        │   ├── ActifsModals.jsx
        │   ├── Dashboard.jsx
        │   ├── GestionActifs.jsx
        │   ├── MaterielEquipementsModule.jsx  # Suivi inspections
        │   ├── ModulePaie.jsx
        │   └── ...
        └── contexts/
```

## Base de Données (MongoDB Atlas)

### Collections Principales
- `interventions` : source_appel (cauca/urgence_sante)
- `parametres_paie` : minimum_heures_cauca, minimum_heures_urgence_sante
- `actifs` : pnbv, type_vehicule, vignette d'inspection
- `reparations_vehicules` : historique réparations
- `equipements` : frequence_inspection, date_derniere_inspection
- `categories_equipements` : avec personnes ressources
- `feuilles_temps` : statut (brouillon/validé/exporté)

## Intégrations Tierces
- **Resend** : E-mails
- **Stripe** : Paiements
- **Twilio** : SMS
- **ReportLab** : Génération PDF
- **react-leaflet** : Cartes
- **@dnd-kit** : Drag & drop

## Points Critiques
- **Base de données distante** : MongoDB Atlas (profiremanager-dev), pas local
- **Utilisateur test** : gussdub@gmail.com pour tenant `demo`
- **Transmission DSI** : Actuellement MOCKED

## Tâches Restantes

### P2 - Refactoring
- [ ] Décomposer ModulePaie.jsx en sous-composants
- [ ] Décomposer GestionActifs.jsx en sous-composants
- [ ] Décomposer Dashboard.jsx en sous-composants
- [ ] Centraliser logique d'envoi d'e-mails backend

### P2 - Fonctionnalités
- [ ] Finaliser transmission DSI réelle
- [ ] Module de gestion des jours fériés
- [ ] Module de facturation pour l'entraide
- [ ] Module "Schéma de couverture de risque"

### P3 - Améliorations
- [ ] Gestion véhiculaire (codes radio 10-07, 10-17, 10-90)

## Dernière mise à jour
Date : 2025-02-04
Session : Amélioration suivi inspections équipements
