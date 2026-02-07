# ProFireManager - Document de Référence Produit (PRD)

## Problème Original
Application de gestion complète pour les services d'incendie au Québec, incluant :
- Gestion des interventions et de la paie des pompiers
- Module de génération d'avis de non-conformité
- Éditeur de grilles d'interventions
- Gestion des bâtiments et de la prévention
- Conformité légale avec le MSP du Québec

## Fonctionnalités Implémentées

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

### 3. Gestion des Actifs - Équipements
- Liste déroulante pour la fréquence d'inspection
- Champ date de dernière inspection
- Alertes automatiques sur le tableau de bord quand inspection due
- Statistiques enrichies avec compteurs d'alertes
- Affichage "Stock bas" uniquement pour consommables

### 4. Module Prévention
- Interface harmonisée avec onglets horizontaux rouges
- Gestion des bâtiments et inspections
- Affichage stable corrigé (problème de condition de course résolu)

### 5. Module Interventions - Conformité MSP ✅ NOUVEAU
- **Section RCCI (Enquête)** : Point d'origine, cause probable, source de chaleur, détecteur de fumée, officier enquêteur, narratif, photos d'enquête
- **Alerte transfert police** : Si cause indéterminée ou intentionnelle
- **Section Sinistré & Assurance** : Données propriétaire, compagnie d'assurance, estimation des pertes
- **Photos des dommages avant départ** : Protection contre réclamations abusives
- **Données DSI initialisées** : 10 causes, 26 sources de chaleur, 24 matériaux, 19 facteurs d'allumage, 28 usages de bâtiment, 31 natures de sinistre
- **UX améliorée** : Bouton "Enregistrer" apparaît seulement si modifications

### 6. Approvisionnement en Eau
- Création de bornes fontaines corrigée (conversion champs numériques)

### 7. UI/UX Améliorations
- Toasts repositionnés en bas à droite avec z-index élevé (999999)
- Modal SFTP z-index corrigé (100001)
- Vue Planning mensuelle : grille CSS corrigée (plus de débordement)
- Bouton "Enregistrer" au lieu de "Modifier" dans les formulaires

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
│   │   ├── interventions.py   # RCCI, sinistré, photos dommages, seed DSI
│   │   ├── paie_complet.py    # Logique paie + export PDF
│   │   ├── points_eau.py      # Bornes fontaines
│   │   └── ...
│   └── services/
│       └── sftp_service.py    # Détection source d'appel
└── frontend/
    └── src/
        ├── components/
        │   ├── interventions/
        │   │   ├── SectionRCCI.jsx        # Enquête incendie
        │   │   ├── SectionSinistre.jsx    # Données propriétaire/assurance
        │   │   └── SectionRemisePropriete.jsx  # + Photos dommages
        │   ├── GestionInterventions.jsx
        │   ├── Sidebar.jsx         # Affichage modules corrigé
        │   └── ...
        ├── contexts/
        │   └── AuthContext.js      # Restauration tenant localStorage
        └── components/ui/
            └── toast.jsx           # Position bottom-right, z-index 999999
```

## Base de Données (MongoDB Atlas)

### Collections Principales
- `interventions` : source_appel (cauca/urgence_sante)
- `rcci` : Rapports d'enquête incendie
- `donnees_sinistres` : Infos propriétaire et assurance
- `photos_dommages` : Photos avant départ
- `dsi_causes`, `dsi_sources_chaleur`, `dsi_materiaux`, etc. : Données de référence MSP
- `parametres_paie` : minimum_heures_cauca, minimum_heures_urgence_sante
- `actifs` : pnbv, type_vehicule, vignette d'inspection
- `reparations_vehicules` : historique réparations
- `equipements` : frequence_inspection, date_derniere_inspection

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
- [x] Centraliser logique d'envoi d'e-mails backend (service créé)
- [x] Créer hooks personnalisés pour Module Paie
- [x] Créer hooks personnalisés pour Interventions
- [x] Créer hooks personnalisés pour Actifs
- [x] Créer sous-composants Dashboard (StatCards, AlertCards, ActivitesRecentes)
- [x] Créer utilitaires Actifs et Paie
- [x] Intégrer imports des utilitaires dans composants existants
- [ ] Migration progressive du JSX vers nouveaux composants (en cours)

### P2 - Fonctionnalités
- [ ] Finaliser transmission DSI réelle
- [ ] Module de gestion des jours fériés
- [ ] Module de facturation pour l'entraide
- [ ] Module "Schéma de couverture de risque"

### P3 - Améliorations
- [ ] Gestion véhiculaire (codes radio 10-07, 10-17, 10-90)
- [ ] Export automatique rapport RCCI vers MSP
- [ ] Notifications par courriel aux propriétaires après remise

## Architecture Refactorisée

```
/app/frontend/src/components/
├── dashboard/
│   ├── index.js              # Exports centralisés
│   ├── useDashboardData.js   # Hook de chargement données
│   ├── StatCards.jsx         # Cartes statistiques (Admin/Employé)
│   ├── AlertCards.jsx        # Alertes équipements/véhicules
│   └── ActivitesRecentes.jsx # Liste activités récentes
├── paie/
│   ├── index.js              # Exports centralisés
│   ├── hooks.js              # usePaieParametres, usePaieConfig, etc.
│   └── utils.js              # Formatage, constantes
├── interventions/
│   ├── index.js              # Exports centralisés  
│   ├── hooks.js              # useInterventions, useInterventionDetail, etc.
│   └── ... (12+ sections)
├── actifs/
│   ├── index.js              # Exports centralisés
│   ├── hooks.js              # useVehicules, useEquipements, etc.
│   └── utils.js              # États, formatage, validation
└── ...
```

## Sécurité - Configuration Infrastructure ✅
- **MongoDB Atlas** : 0.0.0.0/0 rétabli pour dev (production Render sécurisée)
  - IPs Render (Oregon) : 74.220.48.0/24, 74.220.56.0/24
- **Resend API** : Nouvelle clé configurée
- **Backend Production** : Hébergé sur Render
- **Frontend Production** : Hébergé sur Vercel

## Dernière mise à jour
Date : 2026-02-06
Session : Résolution problème déploiement Vercel/Render - Diagnostic et correction des permissions GitHub Apps pour dépôt privé

### Historique des sessions récentes
- **2026-02-06** : Résolution problème déploiement automatique (webhook GitHub → Vercel/Render)
- **2026-02-06** : Refactorisation avancée - Dashboard, Actifs, Import équipements avec mapping

