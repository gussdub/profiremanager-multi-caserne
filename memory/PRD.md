# ProFireManager - Product Requirements Document

## Original Problem Statement
Application de gestion pour les services d'incendie incluant :
- Gestion de profils utilisateurs avec signature
- Module de prévention avec gestion des non-conformités
- Système de prédiction d'articles CNPI basé sur l'analyse de texte
- Gestion des actifs (véhicules, équipements)

## Core Features Implemented

### Signature Feature
- Les utilisateurs peuvent dessiner et sauvegarder leur signature sur la page "Mon Profil"
- Utilisation de `fetch` API pour l'upload multipart/form-data (plus fiable que axios)

### UI Harmonization
- Section "Sécurité du compte" harmonisée avec le composant Card
- Interface cohérente sur la page Mon Profil

### CNPI Violation Repository
- Liste par défaut de 70+ articles CNPI initialisables
- Endpoint `/ref-violations/init` pour initialiser/réinitialiser
- Interface avec modale de confirmation personnalisée (évite window.confirm)

### Article Prediction System
- Algorithme de correspondance par mots-clés pondérés
- Endpoint `/ref-violations/predire` pour suggestions en temps réel
- Composant `ArticlePrediction.jsx` réutilisable avec autocomplete
- Support multi-sélection d'articles par non-conformité

---

## Changelog

### 2026-02-12
- **Notifications - Rapports d'intervention renvoyés pour révision**
  - Ajout de la notification automatique aux rédacteurs assignés quand un rapport est retourné pour révision
  - Fichier modifié: `backend/routes/interventions.py` - fonction `validate_intervention`
  
- **Notifications - Véhicules/Matériels hors service**
  - Création de la fonction `notifier_vehicule_ou_materiel_hors_service` dans `actifs.py`
  - Création de la fonction `notifier_materiel_hors_service` dans `materiel.py`
  - Notification push + email + in-app envoyée à TOUS les utilisateurs quand un véhicule ou matériel est mis hors service
  - Statuts déclencheurs: "hors_service", "maintenance", "en_maintenance", "a_reparer"

### 2026-02-11
- **Bug Fix**: Suppression des console.log de débogage dans App.js
  - Retiré `Vérification cr_action: null`
  - Retiré `Vérification paramètres URL: {page: null, vehicule_id: null}`

### Précédemment
- Correction signature saving (axios → fetch)
- Harmonisation UI Mon Profil
- Implémentation liste CNPI avec bouton d'initialisation
- Système de prédiction d'articles
- Correction erreur 404 `/alertes-maintenance` (ordre des routes FastAPI)
- Multiples corrections JSX et endpoints

---

## Architecture

```
/app
├── backend/
│   ├── routes/
│   │   ├── actifs.py
│   │   ├── avis_non_conformite.py  # CNPI + prédiction
│   │   └── users.py
│   ├── models.py
│   └── main.py
└── frontend/
    └── src/
        ├── App.js  # Navigation et layout principal
        ├── components/
        │   ├── ui/
        │   │   └── ArticlePrediction.jsx  # Autocomplete articles
        │   └── MonProfil.jsx
        └── pages/prevention/
            ├── NonConformites.jsx
            └── ParametresPrevention.jsx
```

---

## Backlog / Technical Debt

### P0 - Critical (from handoff)
- **Uniformiser les exports PDF/Excel** : Le système de téléchargement temporaire fonctionne pour le module Personnel mais doit être appliqué à tous les autres modules (~17 endpoints)

### P1 - Medium Priority
- **Refactoriser window.confirm/window.alert** : Ces appels sont bloqués dans les environnements iframe. Créer un système de modales centralisé pour les remplacer dans toute l'application.
- **Audit notifications complet** : Vérifier que tous les scénarios suivants ont leurs notifications:
  - ✅ Rapports d'intervention renvoyés pour révision
  - ✅ Véhicules/matériels hors service (notification à tous)
  - ✅ Demandes de remplacement EPI (existant)
  - ✅ Demandes de congés (existant)
  - ✅ Non-conformités en retard (existant)
  - Inspections à modifier (à vérifier)

### P2 - Low Priority
- Améliorer l'algorithme de prédiction (actuellement keyword-based, pourrait être ML-powered)
- Ajouter un bouton "Vérifier maintenant" pour le SFTP

---

## Key Technical Notes

1. **Ordre des routes FastAPI** : Routes statiques AVANT routes dynamiques
2. **File uploads** : Préférer `fetch` API pour multipart/form-data
3. **Environnement iframe** : Éviter `window.confirm`, `window.alert`
