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

### 2024-12-XX (Current Session)
- **Bug Fix: Fichiers PDF/Excel corrompus lors de l'export**
  - Cause: Double header `Content-Disposition` dans `FileResponse` (paramètre `filename=` + header personnalisé)
  - Solution: Suppression du header `Content-Disposition` redondant dans la fonction `download_temp_export`
  - Fichier modifié: `backend/routes/rapports.py` ligne ~1367-1405
  - Les exports PDF et Excel fonctionnent maintenant correctement

- **Amélioration: Algorithme de prédiction CNPI ML-powered**
  - Nouveau service: `backend/services/prediction_cnpi_service.py`
  - Utilise TF-IDF + similarité cosinus pour une prédiction plus précise
  - Mode hybride combinant ML (60%) et mots-clés (40%) pour les meilleurs résultats
  - L'endpoint `/prevention/ref-violations/predire` supporte maintenant le paramètre `methode` ("hybride", "ml", "keywords")
  - Installation de scikit-learn ajoutée aux dépendances

- **Refactoring: Remplacement de window.confirm par modales**
  - Nouveau composant: `frontend/src/components/ui/ConfirmDialog.jsx`
  - Provider `ConfirmDialogProvider` ajouté dans App.js
  - Hook `useConfirmDialog()` pour une utilisation facile
  - Migration effectuée pour (~85%): Personnel, Planning, Parametres, Formations, MonProfil, ModuleEPI, GestionInterventions, GestionActifs, GestionInventaires, MesDisponibilites, ParametresActifs, Prevention, MaterielEquipementsModule, ReparationsVehicule, PlansIntervention, InspectionComponents, ParametresInspectionsAPRIA, ParametresSecteurs, GestionPreventionnistes, CarteApprovisionnementEau
  - Les confirmations fonctionnent maintenant dans les environnements iframe/sandbox
  - ~23 occurrences restantes dans fichiers secondaires (GaleriePhotosBuilder, ModulePaie, Debogage, etc.)

- **Bug Fix: Erreur lors de l'ajout d'une personne au planning**
  - Cause: `assignation_data.type_garde` n'existait pas (attribut incorrect)
  - Solution: Utilisation de `type_garde.get('nom')` dans la notification
  - Fichier modifié: `backend/routes/planning.py` ligne ~333

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
- ~~**Uniformiser les exports PDF/Excel**~~ : ✅ CORRIGÉ - Le bug de corruption de fichiers a été résolu. Les modules Planning, Formations et Rapports utilisent déjà la méthode blob directe qui fonctionne. Le module Personnel utilise `generate-export` + `FileResponse` qui est maintenant corrigé.

### P1 - Medium Priority
- **Refactoriser window.confirm/window.alert** : ✅ PARTIELLEMENT FAIT - Composant `ConfirmDialog` créé et intégré. Migré dans Personnel.jsx et Planning.jsx. Reste à migrer: Parametres.js, Formations.jsx, ModuleEPI.jsx, MonProfil.jsx, GestionInterventions.jsx et autres (~40 occurrences restantes)
- **Audit notifications complet** : Vérifier que tous les scénarios suivants ont leurs notifications:
  - ✅ Rapports d'intervention renvoyés pour révision
  - ✅ Véhicules/matériels hors service (notification à tous)
  - ✅ Demandes de remplacement EPI (existant)
  - ✅ Demandes de congés (existant)
  - ✅ Non-conformités en retard (existant)
  - Inspections à modifier (à vérifier)

### P2 - Low Priority
- ~~Améliorer l'algorithme de prédiction (actuellement keyword-based, pourrait être ML-powered)~~ ✅ FAIT - Utilise maintenant TF-IDF + similarité cosinus
- ~~Ajouter un bouton "Vérifier maintenant" pour le SFTP~~ - Non requis par l'utilisateur
- **Continuer migration window.confirm** : Migrer les fichiers restants vers useConfirmDialog (Parametres.js, Formations.jsx, etc.)

---

## Key Technical Notes

1. **Ordre des routes FastAPI** : Routes statiques AVANT routes dynamiques
2. **File uploads** : Préférer `fetch` API pour multipart/form-data
3. **Environnement iframe** : Éviter `window.confirm`, `window.alert`
