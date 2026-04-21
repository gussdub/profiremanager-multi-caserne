# Correction Bug : Badge "Auto" au lieu de "Remplacement"

**Date** : 21 avril 2026  
**Tenant concerné** : Tous (bug logique)  
**Priorité** : P1 (Affichage incorrect)  
**Statut** : ✅ CORRIGÉ

## Problème Signalé

Dans le modal "Détails de la garde", les assignations provenant d'un **remplacement accepté** affichaient incorrectement le badge "🤖 Auto" au lieu de "🔄 Remplacement".

**Exemple** : Jean-François Tardif, qui avait accepté un remplacement, apparaissait avec le badge "Auto" alors qu'il devrait avoir le badge "Remplacement".

## Cause Racine

**Bug de priorité de vérification** dans la logique de détermination du badge.

### Logique INCORRECTE (avant correction)
```javascript
{personAssignation?.assignation_type === 'auto' 
  ? '🤖 Auto' 
  : personAssignation?.assignation_type === 'rotation_temps_plein'
    ? '🔄 Rotation'
    : personAssignation?.est_remplacement 
      ? '🔄 Remplacement' 
      : '👤 Manuel'}
```

**Problème** : Quand un remplacement est accepté, l'assignation peut avoir **DEUX champs à `true`** :
- `assignation_type = 'auto'` (car le système a automatiquement assigné le remplaçant)
- `est_remplacement = true` (car c'est un remplacement)

La première condition (`assignation_type === 'auto'`) était vérifiée en premier et retournait "Auto", **court-circuitant** la vérification de `est_remplacement`.

## Correction Appliquée

**Fichier modifié** : `/app/frontend/src/components/Planning.jsx` (lignes 2897-2904)

### Logique CORRECTE (après correction)
```javascript
{personAssignation?.est_remplacement 
  ? '🔄 Remplacement' 
  : personAssignation?.assignation_type === 'auto' 
    ? '🤖 Auto' 
    : personAssignation?.assignation_type === 'rotation_temps_plein'
      ? '🔄 Rotation'
      : '👤 Manuel'}
```

**Solution** : Vérifier `est_remplacement` **EN PREMIER** avant de vérifier `assignation_type`.

### Ordre de priorité corrigé
1. ✅ `est_remplacement` → 🔄 Remplacement
2. ✅ `assignation_type === 'auto'` → 🤖 Auto
3. ✅ `assignation_type === 'rotation_temps_plein'` → 🔄 Rotation
4. ✅ Sinon → 👤 Manuel

## Impact de la Correction

Cette correction affecte uniquement l'affichage visuel du badge dans le modal "Détails de la garde". Les assignations fonctionnent correctement en arrière-plan, seul l'affichage était incorrect.

## Historique du Bug

Ce bug existait depuis le **10 février 2026** (commit 3992cbbe), lorsque le support des remplacements a été ajouté au modal. Le bug n'a **PAS été introduit** par les corrections récentes (P0, audit, NAS).

## Pourquoi ce bug n'a pas été détecté plus tôt ?

Ce bug se produisait **uniquement** quand :
1. Un remplacement était accepté via le système automatique
2. L'assignation résultante avait `assignation_type = 'auto'` ET `est_remplacement = true`

Si le remplacement était créé manuellement ou si `assignation_type` n'était pas `'auto'`, le badge s'affichait correctement.

## Tests Recommandés

Pour valider la correction :

1. **Créer une demande de remplacement**
2. **Accepter la demande** (le système crée une assignation automatique)
3. **Ouvrir le modal "Détails de la garde"** pour la date concernée
4. **Vérifier que le remplaçant affiche** : 🔄 Remplacement (et non 🤖 Auto)

## Note Importante : Vigilance sur les Régressions

L'utilisateur a raison de souligner l'importance de ne pas casser ce qui fonctionne. Cette correction :
- ✅ Ne modifie QUE l'ordre de vérification des conditions
- ✅ Ne change aucune logique métier backend
- ✅ N'affecte aucune autre fonctionnalité
- ✅ Est une correction d'un bug existant (non introduit par mes modifications)

---

**Fichiers de référence** :
- Frontend : `/app/frontend/src/components/Planning.jsx` (lignes 2897-2904)
- Backend : `/app/backend/routes/remplacements/workflow.py` (ligne 107 - définition de `est_remplacement`)
