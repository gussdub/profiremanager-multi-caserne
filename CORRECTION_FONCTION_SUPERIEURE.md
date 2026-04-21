# Correction Règle Officier : Fallback Fonction Supérieure

**Date** : 21 avril 2026  
**Priorité** : P0 (Règle métier critique manquante)  
**Statut** : ✅ CORRIGÉ

## Problème Signalé

Lors de la recherche de remplaçants pour une garde nécessitant un officier (`officier_obligatoire = True`), le système **excluait tous les non-officiers** sans vérifier s'ils pouvaient agir en **fonction supérieure**.

**Règle métier oubliée** :
- ✅ **Priorité 1** : Chercher des officiers disponibles (lieutenant, capitaine, chef, directeur)
- ❌ **Priorité 2 manquante** : Si AUCUN officier disponible, chercher parmi les pompiers avec `fonction_superieur = True`

## Contexte

Dans les services d'incendie, certains pompiers peuvent être désignés pour agir en **fonction supérieure** (intérim officier) lorsqu'aucun officier n'est disponible. Cette information est stockée dans le champ `fonction_superieur` ou `fonction_superieure` du profil utilisateur.

## État de l'Implémentation

### ✅ Logique CORRECTE dans `search.py`
Le fichier `/app/backend/routes/remplacements/search.py` (lignes 127-348) **implémente correctement** cette règle :

```python
def est_eligible_fonction_superieure(user_data: dict) -> bool:
    """Vérifie si l'utilisateur peut opérer en fonction supérieure"""
    return user_data.get("fonction_superieur", False) == True

# Filtre règle officier
if besoin_officier_remplacement:
    user_est_officier = est_officier_grade(user_grade)
    user_est_eligible = est_eligible_fonction_superieure(user)
    
    if not user_est_officier and not user_est_eligible:
        logger.info(f"❌ {user_name} - N0: Règle officier - n'est pas officier ni éligible")
        continue
    else:
        officier_tag = "OFFICIER" if user_est_officier else "ÉLIGIBLE"
        logger.info(f"✅ {user_name} - Règle officier OK [{officier_tag}]")
```

### ❌ Logique MANQUANTE dans `parametres.py` (endpoint debug)
Le fichier `/app/backend/routes/remplacements/parametres.py` (endpoint `/api/{tenant}/remplacements/debug/{demande_id}`) **N'implémentait PAS** cette règle.

**Logique AVANT (incorrecte)** :
```python
if officier_obligatoire:
    grades_officier = ["lieutenant", "capitaine", "chef", "directeur"]
    user_grade = user.get("grade", "").lower()
    if user_grade not in grades_officier:
        user_info["eligible"] = False
        user_info["raisons_exclusion"].append(f"Officier requis, grade actuel: {user_grade}")
```

❌ **Problème** : Excluait tous les non-officiers, même ceux avec `fonction_superieur = True`.

## Correction Appliquée

**Fichier modifié** : `/app/backend/routes/remplacements/parametres.py` (lignes 223-236)

### Logique APRÈS (correcte)
```python
if officier_obligatoire:
    grades_officier = ["lieutenant", "capitaine", "chef", "directeur"]
    user_grade = user.get("grade", "").lower()
    user_fonction_superieure = user.get("fonction_superieur", False) or user.get("fonction_superieure", False)
    
    # Un utilisateur est éligible s'il est officier OU s'il peut agir en fonction supérieure
    if user_grade not in grades_officier and not user_fonction_superieure:
        user_info["eligible"] = False
        user_info["raisons_exclusion"].append(f"Officier requis, grade actuel: {user_grade or 'non défini'}")
    elif user_fonction_superieure and user_grade not in grades_officier:
        # Éligible via fonction supérieure (fallback)
        user_info["raisons_exclusion"].append(f"✅ Éligible fonction supérieure (grade: {user_grade})")
```

### Amélioration de l'explication
**Ligne 282** : Mise à jour de l'explication dans la section "Règle Officier" du frontend :

```python
"explication": "Un officier doit être présent sur cette garde. Si aucun officier n'est disponible, un pompier avec fonction supérieure peut remplacer."
```

## Matrice de Décision

| Grade Utilisateur | Fonction Supérieure | Résultat |
|-------------------|---------------------|----------|
| Pompier | ❌ Non | ❌ EXCLU |
| Pompier | ✅ Oui | ✅ ÉLIGIBLE (Fallback) |
| Lieutenant | ❌ Non | ✅ ÉLIGIBLE (Officier) |
| Lieutenant | ✅ Oui | ✅ ÉLIGIBLE (Officier) |
| Capitaine | ✅ Oui | ✅ ÉLIGIBLE (Officier) |

## Impact de la Correction

Cette correction affecte **uniquement** l'endpoint `/api/{tenant}/remplacements/debug/{demande_id}` utilisé pour l'audit dans le modal "Suivi de la demande".

- ✅ **Logique de recherche réelle** (`search.py`) : Déjà correcte, **aucun changement**
- ✅ **Endpoint debug** (`parametres.py`) : Maintenant aligné avec la logique réelle

## Champ Base de Données

Le champ utilisé est **`fonction_superieur`** (ou `fonction_superieure` pour compatibilité) dans la collection `users`.

**Type** : `Boolean`  
**Valeur par défaut** : `false`  
**Signification** : Si `true`, le pompier peut agir comme officier en intérim

## Tests Recommandés

Pour valider la correction (tenant shefford) :

1. **Identifier un pompier avec `fonction_superieur = true`**
   ```javascript
   // Dans MongoDB
   db.users.findOne({ "grade": "pompier", "fonction_superieur": true })
   ```

2. **Créer une demande de remplacement** :
   - Type de garde avec `officier_obligatoire = true`
   - Demandeur = officier (seul sur la garde)

3. **Vérifier l'audit** :
   - Ouvrir modal "Suivi de la demande"
   - Section "Audit"
   - Le pompier avec fonction supérieure doit apparaître dans "Éligibles" avec la mention "✅ Éligible fonction supérieure"

## Note Importante

Cette correction **répare un oubli dans l'endpoint debug**. La logique de recherche de remplaçants fonctionnait déjà correctement depuis le début. Seul l'affichage de l'audit était incorrect.

---

**Fichiers de référence** :
- `/app/backend/routes/remplacements/parametres.py` (lignes 223-236, 282)
- `/app/backend/routes/remplacements/search.py` (lignes 127-348) - Logique de référence correcte
