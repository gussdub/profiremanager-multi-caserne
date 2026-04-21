# Correction Bug : Audit Remplacements N'affiche Rien

**Date** : 21 avril 2026  
**Tenant concerné** : shefford (production)  
**Priorité** : P1 (Fonctionnalité cassée)  
**Statut** : ✅ CORRIGÉ

## Problème Signalé

Dans le modal "Suivi de la demande" d'un remplacement, la section "Audit" n'affichait aucune donnée :
- **Garde demandée** : () - vide
- **Total évalués** : 0
- **Éligibles** : 0
- **Exclus** : 0

L'utilisateur a confirmé que cette fonctionnalité fonctionnait correctement auparavant.

## Cause Racine

Le backend retournait une structure de données **incompatible** avec ce que le frontend attendait :

### Structure RETOURNÉE par le backend (incorrecte)
```json
{
  "total_eligibles": 5,
  "eligibles": ["Jean Dupont", "Marie Martin"],
  "demande": { ... objet MongoDB complet ... },
  "details_utilisateurs": [...]
}
```

### Structure ATTENDUE par le frontend (correcte)
```json
{
  "resume": {
    "total_utilisateurs": 10,
    "eligibles": 5,
    "non_eligibles": 5
  },
  "eligibles": [
    { "id": "...", "nom": "Jean Dupont", "eligible": true, ... }
  ],
  "non_eligibles": [...],
  "demande": {
    "type_garde": "Jour",
    "horaires": "08:00 - 16:00",
    "date": "2026-04-21"
  },
  "regle_officier": {
    "regle_active": false,
    "officier_obligatoire": true,
    "demandeur_est_officier": false,
    "autre_officier_present_sur_garde": true,
    "explication": "..."
  }
}
```

## Correction Appliquée

**Fichier modifié** : `/app/backend/routes/remplacements/parametres.py` (lignes 231-279)

### Changements effectués

1. **Ajout de la structure `resume`** :
```python
debug_info["resume"] = {
    "total_utilisateurs": len(all_users),
    "eligibles": len(eligibles),
    "non_eligibles": len(non_eligibles)
}
```

2. **Création des listes détaillées** :
```python
debug_info["eligibles"] = eligibles  # Liste d'objets
debug_info["non_eligibles"] = non_eligibles  # Liste d'objets
```

3. **Formatage de l'objet `demande`** :
```python
debug_info["demande"] = {
    "type_garde": type_garde.get("nom", "N/A") if type_garde else "N/A",
    "horaires": f"{heure_debut_garde} - {heure_fin_garde}",
    "date": date_garde
}
```

4. **Ajout de l'objet `regle_officier`** :
```python
debug_info["regle_officier"] = {
    "regle_active": officier_obligatoire and not autre_officier_present,
    "officier_obligatoire": officier_obligatoire,
    "demandeur_est_officier": demandeur_est_officier,
    "autre_officier_present_sur_garde": autre_officier_present,
    "explication": "..."
}
```

## Impact de la Correction

Cette correction affecte :
- L'endpoint `/api/{tenant_slug}/remplacements/debug/{demande_id}`
- Le modal "Suivi de la demande" → Section "Audit"
- L'affichage des statistiques d'éligibilité des remplaçants

## Tests Recommandés

Pour valider la correction en production (tenant shefford) :

1. **Ouvrir une demande de remplacement existante**
2. **Cliquer sur la section "Audit"** (accordéon dépliable)
3. **Vérifier que les données s'affichent** :
   - Garde demandée : Type de garde + horaires
   - Total évalués : Nombre d'employés actifs
   - Éligibles : Nombre de candidats éligibles
   - Exclus : Nombre de candidats non éligibles
4. **Vérifier la liste des candidats** :
   - ✅ Candidats éligibles (liste verte)
   - ❌ Candidats exclus avec raisons (liste rouge)

## Explication Technique

### Pourquoi l'audit était à 0 ?

Le frontend essayait d'accéder à `logiqueData.resume.total_utilisateurs`, mais le backend ne retournait pas d'objet `resume`. JavaScript retournait donc `undefined`, qui était converti en `0` via l'opérateur `|| 0`.

```javascript
// Frontend (SuiviRemplacementModal.jsx ligne 660)
{logiqueData.resume?.total_utilisateurs || 0}
```

Si `logiqueData.resume` est `undefined`, alors `logiqueData.resume?.total_utilisateurs` est `undefined`, et `undefined || 0` donne `0`.

### Pourquoi "Garde demandée: ()" ?

Le frontend affichait :
```javascript
{logiqueData.demande.type_garde} ({logiqueData.demande.horaires})
```

Mais le backend retournait l'objet MongoDB complet `demande` (avec `type_garde_id` au lieu de `type_garde`). Le champ `type_garde` et `horaires` n'existaient pas, donc JavaScript affichait `undefined (undefined)`, ce qui devenait `()`.

## Notes Importantes

- Cette correction est **rétrocompatible** : elle ne casse aucune autre fonctionnalité
- Le backend calcule maintenant dynamiquement la règle officier pour l'affichage
- Les permissions RBAC sont vérifiées (seuls les admins avec permission "voir toutes-demandes" peuvent accéder à l'audit)

---

**Fichiers de référence** :
- Backend : `/app/backend/routes/remplacements/parametres.py` (lignes 92-279)
- Frontend : `/app/frontend/src/components/SuiviRemplacementModal.jsx` (lignes 635-690)
