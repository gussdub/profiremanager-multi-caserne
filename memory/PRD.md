# PRD.md — ProFire SaaS

## Problème original
Application SaaS de gestion pour services d'incendie. Modules : Planning, Prévention, Personnel, Types de garde, Équipes de garde, Horaires personnalisés.

## Fonctionnalités core
- Authentification multi-tenant
- Gestion du personnel (temps plein / temps partiel)
- Planning avec attribution automatique intelligente (N1 → N1.1 → N2-N5)
- Module prévention (Bâtiments, Grilles, Inspections, Non-conformités, Rapports)
- Rotation des équipes de garde (temps plein + temps partiel)
- Templates d'horaires personnalisés (24h, 12h, 6h segments AM/PM)
- Exports (PDF, Excel, iCal)

## Architecture
```
Backend: FastAPI + MongoDB
Frontend: React + Shadcn/UI
Intégrations: Resend (emails), Twilio (SMS)
```

## Dernière mise à jour : 2026-03-24

### Travail complété cette session

#### P0 COMPLÉTÉ — Intégration rotation temps plein dans le planning
- **Fichier modifié** : `/app/backend/routes/planning.py`
- **Logique N1.1** : Nouvelle étape dans `traiter_semaine_attribution_auto` qui insère automatiquement les employés temps plein de l'équipe de garde du jour dans les gardes internes
- **Hiérarchie** : `N1 (Manuel) → N1.1 (Rotation TP) → N2-N5 (Auto-comblement)`
- **Fonctionnalités** :
  - Respect de la date d'activation (pas de rotation avant)
  - Support templates standards (Montréal, Québec, Longueuil) et personnalisés (Shefford, etc.)
  - Matching segment ↔ type_garde par chevauchement horaire
  - Employés absents ignorés → trous comblés par N2-N5
  - Suppression/recréation lors du re-run (reset=true)
  - Frontend affiche badge "🔄 Rotation" pour les assignations N1.1
- **Tests** : 9/10 backend passés (1 skip - pas de garde externe), 100% frontend

### Travail complété sessions précédentes
- Refactorisation complète de `prevention.py` (5315→1630 lignes, 6 nouveaux fichiers)
- Fix UI rotation équipes (nombre dynamique selon template)
- Configuration heures de quart (AM/PM, 24h) dans templates
- Ajout date d'activation pour rotation temps plein

## Backlog

### P2 - Tests de régression
- Écrire des tests pytest pour le module `prevention` refactorisé

### P3 - Améliorations UX
- Améliorer l'UX de la carte des secteurs
- Lazy loading pour le tableau des bâtiments

### Refactorisation future
- `planning.py` (~5300 lignes) pourrait être découpé comme `prevention.py`
