# ProFireManager - Product Requirements Document

## Application Overview
Application de gestion de caserne de pompiers multi-tenant. Gère le personnel, les plannings, les remplacements, les disponibilités, les équipements (EPI), les formations et la prévention.

## User Preferences
- **Langue**: Français
- **Tests**: L'utilisateur effectue les tests lui-même. Ne PAS faire de tests manuels (curl, screenshots, etc.) - simplement implémenter et informer.

## Tech Stack
- **Backend**: FastAPI (Python) avec MongoDB
- **Frontend**: React avec Shadcn/UI
- **Notifications**: Firebase Cloud Messaging (FCM) + Resend (emails)
- **Scheduler**: APScheduler pour tâches planifiées

---

## Completed Features (This Session - Jan 2025)

### P0: Système de Rappel et Blocage des Disponibilités
**Status**: TERMINÉ

**Backend (`server.py`):**
- Nouvelle tâche planifiée `job_verifier_rappels_disponibilites` (tous les jours à 9h00)
  - Vérifie les paramètres de chaque tenant
  - Identifie les employés temps partiel sans disponibilités saisies pour le mois suivant
  - Envoie notifications (in-app, push, email) X jours avant la date de blocage
- Nouveau paramètre `blocage_dispos_active` ajouté aux valeurs par défaut
- Nouvel endpoint `GET /{tenant}/disponibilites/statut-blocage?mois=YYYY-MM`
  - Retourne l'état du blocage pour un mois donné
  - Gère les exceptions admin/superviseur
  - **CORRIGÉ (Jan 9, 2025)**: Déplacé AVANT l'endpoint `/{tenant}/disponibilites/{user_id}` pour éviter un conflit de routage FastAPI qui causait une erreur 403
- Nouvel endpoint `POST /{tenant}/disponibilites/envoyer-rappels`
  - Déclenche manuellement l'envoi des rappels (pour tests admin)

**Frontend (`MesDisponibilites.jsx`):**
- État `blocageInfo` pour stocker l'état du blocage
- Vérification automatique du blocage quand le mois du calendrier change
- Bannière d'alerte visuelle:
  - Jaune = avertissement (jours restants affichés)
  - Rouge = bloqué
  - Message d'exception pour admin/superviseur
- Boutons désactivés quand bloqué (sauf exception admin/superviseur)
- Vérification dans `handleSaveAllConfigurations` avant sauvegarde

### P1: Paramètres Remplacements - Cases à Cocher
**Status**: TERMINÉ

**Fonction `trouver_remplacants_potentiels` corrigée pour utiliser les paramètres:**
- `privilegier_disponibles`: Si activé, FILTRE les remplaçants sans disponibilité déclarée (avant: juste un bonus de tri)
- `grade_egal`: Si activé, exige un grade >= au demandeur (avant: ignoré)
- `competences_egales`: Si activé, exige les mêmes compétences que le demandeur (avant: toujours vérifié avec les compétences du type de garde)
- Les paramètres sont lus depuis `parametres_remplacements` collection

---

## Paramètres Disponibilités (Collection: `parametres_disponibilites`)
```json
{
  "tenant_id": "string",
  "blocage_dispos_active": false,
  "jour_blocage_dispos": 15,
  "exceptions_admin_superviseur": true,
  "admin_peut_modifier_temps_partiel": true,
  "notifications_dispos_actives": true,
  "jours_avance_notification": 3,
  "dernier_rappel_disponibilites": "ISO datetime"
}
```

## Paramètres Remplacements (Collection: `parametres_remplacements`)
```json
{
  "tenant_id": "string",
  "mode_notification": "simultane|sequentiel|groupe_sequentiel",
  "taille_groupe": 3,
  "delai_attente_minutes": 1440,
  "max_personnes_contact": 5,
  "privilegier_disponibles": false,
  "grade_egal": false,
  "competences_egales": false,
  "activer_gestion_heures_sup": false
}
```

---

## Scheduled Jobs (APScheduler)
1. `job_verifier_notifications_planning` - Toutes les heures (minute 0)
2. `job_verifier_alertes_equipements` - Tous les jours à 8h00
3. `job_verifier_rappels_disponibilites` - Tous les jours à 9h00 (NEW)

---

## Key Files Modified This Session
- `backend/server.py` - Scheduler, endpoints blocage, fonction trouver_remplacants_potentiels
- `frontend/src/components/MesDisponibilites.jsx` - Alerte blocage, vérification état
- `frontend/src/components/ParametresDisponibilites.jsx` - UI paramètres (existait déjà)
- `frontend/src/components/ParametresRemplacements.jsx` - UI paramètres (existait déjà)

---

## Backlog / Future Tasks
1. Test de bout en bout du module Remplacement (flux complet avec 2 comptes)
2. Migration vers architecture native (capacités hors ligne)
3. Module Prévention
4. Refactorisation du fichier monolithique `server.py`

---

## Known Issues
- Aucun issue bloquant connu après les corrections de cette session
