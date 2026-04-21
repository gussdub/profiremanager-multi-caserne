# Correction P0 : Statut Actif/Inactif des Employés PFM Transfer

**Date** : 21 avril 2026  
**Priorité** : P0 (Bloquant)  
**Statut** : ✅ CORRIGÉ

## Problème Initial

Les employés importés depuis PFM Transfer étaient incorrectement marqués comme "Inactif" alors qu'ils étaient actifs dans PFM Transfer, s'ils possédaient :
- Une date de fin d'embauche (`date_fin`)
- Pas d'adresse courriel

Cela entraînait leur apparition dans la section "Anciens employés" au lieu de "Personnel actif".

## Cause Racine

Dans `/app/backend/routes/import_batch.py` ligne 2406, la logique était :

```python
pfm_actif = record.get("inactif") != "Oui" and not date_fin
```

Cette condition était **INCORRECTE** car elle considérait qu'un employé avec une `date_fin` devait être marqué inactif, même si le champ PFM `inactif` indiquait "Non" (actif).

## Correction Appliquée

La logique a été corrigée pour ne se baser **UNIQUEMENT** sur le champ `inactif` de PFM Transfer :

```python
pfm_actif = record.get("inactif") != "Oui"
```

### Fichier modifié
- **Fichier** : `/app/backend/routes/import_batch.py`
- **Lignes** : 2404-2407

### Changements effectués

**AVANT** :
```python
# Statut actif : inactif=Oui OU date_fin présente
date_fin = (record.get("date_fin") or "").strip()
pfm_actif = record.get("inactif") != "Oui" and not date_fin
```

**APRÈS** :
```python
# Statut actif : déterminé UNIQUEMENT par le champ "inactif" de PFM Transfer
# La date_fin ne doit PAS influencer le statut actif/inactif
date_fin = (record.get("date_fin") or "").strip()
pfm_actif = record.get("inactif") != "Oui"
```

## Impact de la Correction

Cette correction affecte :

1. **Imports PFM Transfer** : Lors de l'import d'un employé depuis PFM Transfer
2. **Création de comptes utilisateurs** : Les comptes sont créés avec le bon statut (ligne 2577 et 2610)
3. **Champ `actif`** : Stocké correctement dans `imported_personnel` (ligne 2473)
4. **Résolution de doublons** : Les doublons futurs utiliseront la bonne valeur `actif` stockée

## Tests de Validation

### Test unitaire de la logique
```
✅ Employé actif sans date de fin → Actif
✅ Employé actif avec date de fin → Actif (CAS CORRIGÉ)
✅ Employé inactif sans date de fin → Inactif
✅ Employé inactif avec date de fin → Inactif
✅ Pas de champ inactif → Actif (par défaut)
✅ Champ inactif vide avec date de fin → Actif (CAS CORRIGÉ)
```

### Test API
- ✅ Backend démarré sans erreur
- ✅ Login fonctionnel
- ✅ Dashboard accessible

## Correction Secondaire

Un bug de clé dupliquée a été corrigé dans le même fichier :
- **Ligne 2497** : Clé `"nominations"` dupliquée
- **Solution** : Renommage en `"pfm_nominations"` pour distinguer les données brutes PFM des nominations converties

## Prochaines Étapes

1. **Test utilisateur requis** : L'utilisateur doit effectuer un nouvel import PFM Transfer avec ses données réelles
2. **Validation** : Vérifier que les employés actifs avec `date_fin` apparaissent bien comme "Actif"
3. **Nettoyage des anciennes données** (optionnel) : Si nécessaire, corriger manuellement les employés déjà importés avec le mauvais statut

## Notes Importantes

- Cette correction s'applique **UNIQUEMENT** aux imports PFM Transfer
- Les employés déjà importés avec le mauvais statut ne seront PAS automatiquement corrigés
- Pour corriger les données existantes, un nouvel import ou une mise à jour manuelle sera nécessaire
- Le champ `date_fin` est toujours stocké dans la base de données, mais n'influence plus le statut actif/inactif

---

**Fichiers de référence** :
- `/app/backend/routes/import_batch.py` (ligne 2404-2407)
- `/app/memory/test_credentials.md` (comptes de test)
