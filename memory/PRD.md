# ProFireManager - Product Requirements Document

## Application Overview
ProFireManager est une application de gestion complète pour les services d'incendie, comprenant la gestion du personnel, des interventions, des EPI, de la prévention, et de la paie.

## Architecture
- **Frontend**: React avec Shadcn/UI (Radix UI), déployé sur Vercel
- **Backend**: FastAPI avec MongoDB, déployé sur Render
- **Base de données**: MongoDB

## Modules Principaux
1. **Planning** - Gestion des gardes et assignations
2. **Interventions** - Rapports DSI complets
3. **EPI** - Gestion des équipements de protection
4. **Prévention** - Inspections et non-conformités
5. **Paie** - Gestion des jours fériés et majorations
6. **Remplacements** - Système automatisé de demandes

---

## Changelog - Session 2026-02-10

### Corrections effectuées

1. **Bug dropdowns DSI** (P0)
   - Problème: Les listes déroulantes ne permettaient pas de remonter après défilement, puis ne s'ouvraient plus
   - Solution: Remplacement des `<select>` natifs par composants Radix UI Select, correction des valeurs vides (`|| undefined`), augmentation du z-index à 100001
   - Fichiers: `SectionDSI.jsx`, `select.jsx`

2. **Bug saisie majorations jours fériés**
   - Problème: Impossible de saisir un point ou une virgule dans les champs de majoration
   - Solution: Changement de `type="number"` vers `type="text"` avec `inputMode="decimal"`, conversion virgule→point automatique
   - Fichier: `TabJoursFeries.jsx`

3. **Affichage type d'assignation dans Planning**
   - Amélioration: Affichage "🔄 Remplacement" au lieu de "👤 Manuel" quand l'assignation provient d'un remplacement
   - Fichier: `Planning.jsx`

4. **Création manuelle de non-conformités** (Prévention)
   - Problème: Erreur 422 lors de la création manuelle (champ `inspection_id` obligatoire)
   - Solution: Rendu `inspection_id` optionnel, ajout des champs `categorie`, `priorite`, `date_identification`, `est_manuel`
   - Fichier: `prevention.py`

5. **Demande remplacement EPI** (P1 - Vérifié)
   - Statut: Fonctionnel

6. **Script migration statuts EPI** (Backlog - Vérifié)
   - Statut: Fonctionnel

---

## État Actuel

### Fonctionnel ✅
- Tous les modules principaux
- Système de remplacements automatisé
- Création manuelle de non-conformités
- Import/Export EPI
- Visualiseur de plans d'intervention
- Calcul dynamique des jours fériés

### Problèmes Connus
- Erreur persistante "Save to GitHub" (problème de plateforme Emergent)

---

## Prochaines Étapes Potentielles
- Améliorations UX selon retours utilisateur
- Optimisations de performance si nécessaire
