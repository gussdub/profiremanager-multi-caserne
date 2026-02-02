# ProFireManager - Product Requirements Document

## Description
Application de gestion complète pour les services de pompiers. Gère le personnel, les interventions, les formations, les EPI, les équipements, les remplacements et la paie.

## Architecture
- **Frontend**: React avec Shadcn/UI
- **Backend**: FastAPI (Python)
- **Base de données**: MongoDB
- **Intégrations**: Resend (emails), Stripe (paiements), Twilio (SMS)

---

## Fonctionnalités Implémentées

### Module Horaires Personnalisés (Février 2026)
- ✅ Création d'horaires de rotation personnalisés (cycles 7-56 jours)
- ✅ Support des quarts 24h et Jour/Nuit (12h)
- ✅ Configuration des heures de travail (ex: 7h-18h jour, 18h-7h nuit)
- ✅ Calendrier visuel interactif pour "peindre" les jours de chaque équipe
- ✅ Aperçu du calendrier avec dates réelles
- ✅ Duplication d'horaires (prédéfinis ou personnalisés)
- ✅ Intégration dans le module "Mes disponibilités"
- ✅ Génération automatique des indisponibilités selon les heures configurées
- ✅ Équipes dynamiques selon l'horaire sélectionné

### Module EPI (Janvier-Février 2026)
- ✅ Importation CSV/XLS/XLSX/TXT des EPI
- ✅ Correspondance intelligente des employés (fuzzy matching)
- ✅ Création automatique des types d'EPI manquants
- ✅ Bouton "Supprimer tous les EPI" pour nettoyage
- ✅ Correction du type d'EPI dans le modal d'édition

### Autres Modules
- ✅ Gestion du personnel (temps plein/partiel)
- ✅ Gestion des interventions
- ✅ Gestion des formations (NFPA 1500)
- ✅ Gestion des remplacements
- ✅ Module de disponibilités/indisponibilités
- ✅ Alertes équipements sur le tableau de bord
- ✅ Catégories d'équipement par défaut

---

## Tâches en Attente de Validation
- [ ] Fonctionnalité de rappel d'inspection EPI mensuelle
- [ ] Alertes d'équipement sur le tableau de bord
- [ ] Initialisation des catégories d'équipement par défaut

---

## Backlog (P2-P3)

### P2 - Priorité Moyenne
- Refactorisation des composants volumineux (ModuleEPI.jsx >3k lignes, GestionInterventions.jsx >2.8k lignes)
- Finaliser la transmission DSI réelle (actuellement **MOCK**)
- Module de gestion des jours fériés
- Module de facturation pour l'entraide
- Module "Schéma de couverture de risque"

### P3 - Priorité Basse
- Gestion véhiculaire (codes radio 10-07, 10-17, 10-90)

---

## Informations Techniques

### Horaires Prédéfinis
- **Montréal 7/24**: Cycle 28 jours, 4 équipes, 7 jours/cycle
- **Québec 10/14**: Cycle 28 jours, 4 équipes, 13 jours/cycle
- **Longueuil 7/24**: Cycle 28 jours, 4 équipes, 7 jours/cycle

### Format des Horaires Personnalisés
```json
{
  "nom": "Granby",
  "duree_cycle": 28,
  "nombre_equipes": 4,
  "type_quart": "12h_jour_nuit",
  "heures_quart": {
    "jour_debut": "07:00",
    "jour_fin": "18:00",
    "nuit_debut": "18:00",
    "nuit_fin": "07:00"
  },
  "equipes": [
    {
      "numero": 1,
      "nom": "Vert",
      "couleur": "#22C55E",
      "jours_travail": [{"jour": 1, "segment": "jour"}, {"jour": 2, "segment": "nuit"}]
    }
  ]
}
```

### Collections MongoDB
- `horaires_personnalises`: Horaires créés par les utilisateurs
- `disponibilites`: Disponibilités/indisponibilités avec champ `origine` pour tracer la source
- `epis`: Équipements de protection individuelle
- `types_epi`: Types d'EPI disponibles

---

## Dernière mise à jour
2 février 2026
