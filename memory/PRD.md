# ProFireManager - Product Requirements Document

## 📋 Description du Projet
Application de gestion des interventions et de la paie pour les services de pompiers du Québec, conforme aux standards MSP/DSI.

---

## ✅ Fonctionnalités Implémentées

### Module Interventions
- **Gestion complète des interventions** (CRUD, import XML)
- **Section Ressources refactorisée** (24 janvier 2026):
  - Tableau unifié "Personnel présent lors de l'intervention"
  - Dropdown véhicule par personne (Non assigné / 🚒 Véhicule / 🚗 Véhicule personnel)
  - Colonnes repas (Déj., Dîn., Soup.) avec cases à cocher individuelles
  - Cases globales dans l'en-tête pour cocher/décocher tous les repas par type
  - Compteur automatique de personnel par véhicule avec alerte si 0
  - Import automatique équipe de garde
  - Tri par véhicule
- **Logique des primes de repas** : pré-cochage basé sur durée minimum et horaires
- **Fonction supérieure** : calcul et affichage dans la paie

### Refactorisation Backend - 25 janvier 2026
- **Module Actifs extrait** (`routes/actifs.py` - 1593 lignes, ~30 routes)
  - Véhicules : CRUD, QR codes, inspections SAAQ, fiche de vie
  - Bornes d'incendie : CRUD, QR codes, import CSV
  - Inventaires : Modèles et inspections CRUD
  - Rondes de sécurité : Liste, détail, contre-signature, config emails
  - Matériels pour interventions : Liste
- **server.py réduit** de ~1200 lignes (41143 → 39946)
- **Bug corrigé** : Modal historique inventaires décalé sous la sidebar

### Dashboard Principal - Corrections 24 janvier 2026
- **Correction bug widgets** : Personnel actif (37), Véhicules (3) s'affichent correctement
- **Taux de couverture planning** : Calculé sur le mois complet (pas 7 jours)
- **Taux de présence formations** : 100% conforme par défaut si aucune formation passée
- **Prochaine garde** : Recherche étendue au mois courant + suivant
- **Mes formations à venir** : Recherche étendue à l'année courante + suivante
- **Correction fuseau horaire** : Les dates YYYY-MM-DD sont parsées en heure locale
- **Widget "Personnes absentes"** : Remplace "Demandes de congés en attente"
- **KPI supprimés de la page Horaire** : Allégement du design

### Module DSI (Déclaration de Sinistre Incendie) - 24 janvier 2026
- **Tables de référence MSP officielles** :
  - 1,281 municipalités MAMH (données ouvertes Québec)
  - Sources de chaleur (codes 10-99)
  - Facteurs d'allumage (codes 1-10)
  - Objets à l'origine (codes 10-50)
  - Usages de bâtiment CNB (codes A-F)
  - États des victimes (codes 0-3)
  - Systèmes de protection (GIC, ALA, DET)
  - Catégories de pertes (BAT, CON)
- **API DSI** (`/api/dsi/references/*`)
- **Section DSI enrichie** :
  - Recherche autocomplete municipalité MAMH
  - Résumé automatique (pompiers, véhicules, pertes, décès)
  - Tous les champs MSP obligatoires
  - Validation DSI avec liste d'erreurs par section
  - Champs conditionnels selon nature de l'intervention
- **Export XML GSI** (structure générique en attente du XSD officiel)

### Module Paie
- Calcul des feuilles de temps
- Primes de repas (déjeuner, dîner, souper)
- Fonction supérieure
- Export vers systèmes externes (Nethris, Employeur D, Ceridian)

### Module Paramètres
- Gestion des gardes, compétences, grades, comptes
- Tous les modaux fonctionnels

### Module Personnel
- Gestion des utilisateurs
- Tailles d'EPI synchronisées avec Mon Profil
- Boutons Enregistrer/Annuler dans le modal

### Authentification
- JWT avec bcrypt
- Multi-tenant (slug-based)

---

## 🗄️ Architecture Base de Données

### Collections DSI (MongoDB)
```
dsi_municipalites      - 1,281 docs (codes MAMH)
dsi_natures_sinistre   - 27 docs
dsi_causes             - 12 docs
dsi_sources_chaleur    - 8 docs (codes MSP officiels)
dsi_facteurs_allumage  - 7 docs (codes MSP officiels)
dsi_materiaux          - 5 docs (objets à l'origine)
dsi_usages_batiment    - 6 docs (codes CNB)
dsi_etats_victimes     - 4 docs
dsi_systemes_protection - 3 docs
dsi_categories_pertes  - 2 docs
```

---

## 📁 Structure des Fichiers Clés

```
/app
├── backend/
│   ├── routes/
│   │   ├── __init__.py           # Documentation modules
│   │   ├── dependencies.py       # Dépendances partagées (db, auth, helpers)
│   │   ├── dsi.py                # API DSI (ACTIF)
│   │   ├── dsi_transmissions.py  # Conformité DSI (ACTIF)
│   │   ├── personnel.py          # Gestion users (ACTIF - 5 routes migrées)
│   │   ├── actifs.py             # Véhicules, bornes, inventaires, rondes (ACTIF - ~30 routes migrées)
│   │   ├── formations.py         # Formations CRUD + inscriptions (ACTIF - ~12 routes migrées)
│   │   ├── disponibilites.py     # Disponibilités (INACTIF - routes server.py plus complètes)
│   │   ├── planning.py           # Planning (PRÊT - routes commentées)
│   │   └── paie.py               # Module Paie (PRÊT)
│   ├── scripts/
│   │   ├── import_dsi_references.py
│   │   └── import_dsi_msp_official.py
│   └── server.py                 # ~39,497 lignes (réduit de ~1650 lignes total)
└── frontend/
    └── src/components/
        ├── Dashboard.jsx           # Corrigé 24 janv 2026
        ├── interventions/
        │   ├── SectionRessources.jsx  # Refactorisé
        │   ├── SectionDSI.jsx         # Enrichi
        │   ├── SectionPertes.jsx
        │   └── ...
        └── GestionInterventions.jsx
```

---

## 🔜 Prochaines Étapes (Backlog)

### P1 - Court terme
- [ ] Ajouter section "Systèmes de protection" dans DSI (gicleurs, alarme, détecteur)
- [ ] Compléter section "Victimes" avec détail civil/pompier
- [ ] Téléchargement du fichier XML DSI généré

### P2 - Moyen terme (Refactorisation en cours)
- [x] Créer fichier dependencies.py avec dépendances partagées
- [x] Créer et activer module personnel.py (5 routes migrées)
- [x] Créer et activer module actifs.py (~30 routes migrées : véhicules, bornes, inventaires, rondes, QR codes)
- [x] Créer et activer module formations.py (~12 routes migrées : CRUD, inscriptions, taux présence)
- [x] Créer module disponibilites.py (désactivé - routes server.py plus complètes)
- [ ] Activer module planning.py (routes commentées, prêt à activer)
- [ ] Intégration XSD officiel du MSP (en attente de réception)
- [ ] Transmission SOAP au serveur MSP (certificat SSL requis)
- [ ] Tests dans la Sandbox MSP

### P3 - Long terme
- [ ] Module de gestion des jours fériés
- [ ] Module de facturation pour l'entraide
- [ ] Certification officielle DST

---

## 🔐 Credentials de Test (Preview)

| Tenant | Email | Mot de passe |
|--------|-------|--------------|
| demo | gussdub@gmail.com | 230685Juin+ |
| shefford | (production) | (production) |

---

## 📝 Notes Techniques

- **Backend** : FastAPI + Motor (MongoDB async)
- **Frontend** : React + Tailwind + Shadcn/UI
- **Hot reload** activé (pas besoin de restart sauf .env)
- **Authentification** : bcrypt uniquement (pas de migration SHA256)

---

*Dernière mise à jour : 25 janvier 2026*
