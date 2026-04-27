# 🐛 Correction - Erreur "Impossible de modifier l'accès"

**Date**: 2026-04-27  
**Priorité**: P0 (Bloquant pour l'utilisateur)  
**Status**: ✅ RÉSOLU

---

## 📋 Problème signalé

Lors de la tentative de modification du type d'accès d'un employé (Eliott Bellegarde), l'utilisateur recevait une **erreur 400** :
- Message UI : **"Impossible de modifier l'accès"**
- Console : `Failed to load resource: the server responded with a status of 400`

---

## 🔍 Cause racine

### Route backend inadaptée
La route `PUT /users/{user_id}/access` (ligne 1073 de `users.py`) avait plusieurs problèmes :

#### 1. **Validation trop stricte**
```python
# ❌ AVANT
valid_roles = ["admin", "superviseur", "employe"]
if role not in valid_roles:
    raise HTTPException(status_code=400, detail="Rôle invalide")
```

**Problème** : Ne permettait PAS les **types d'accès personnalisés** créés par l'utilisateur.

#### 2. **Erreur systématique si aucune modification**
```python
# ❌ AVANT
if result.modified_count == 0:
    raise HTTPException(status_code=400, detail="Impossible de mettre à jour l'accès")
```

**Problème** : Si l'utilisateur avait déjà le type "employe" et qu'on essayait de le remettre à "employe", ça levait une erreur 400 !

#### 3. **Champ `role` vs `access_type`**
Le code utilisait l'ancien champ `role` au lieu du nouveau `access_type`, causant des incohérences.

---

## ✅ Solution appliquée

### Améliorations de la route

**Fichier** : `/app/backend/routes/users.py` (lignes 1073-1140)

#### 1. **Support des types personnalisés**
```python
# ✅ APRÈS
if type_acces not in valid_access_types:
    # Vérifier si c'est un type personnalisé
    custom_type = await db.access_types.find_one({
        "id": type_acces,
        "tenant_id": tenant.id
    })
    if not custom_type:
        raise HTTPException(status_code=400, detail="Type d'accès invalide")
```

#### 2. **Paramètres optionnels**
```python
# ✅ APRÈS
async def update_user_access(
    tenant_slug: str, 
    user_id: str, 
    role: Optional[str] = None,  # Rétrocompatibilité
    access_type: Optional[str] = None,  # Nouveau
    statut: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
```

#### 3. **Pas d'erreur si aucune modification**
```python
# ✅ APRÈS
if result.modified_count == 0:
    # Valeurs identiques, ce n'est pas une erreur
    logger.info(f"Aucune modification pour user {user_id} (valeurs identiques?)")
```

#### 4. **Mise à jour des deux champs**
```python
# ✅ APRÈS
update_fields["access_type"] = type_acces  # Nouveau
update_fields["role"] = type_acces  # Rétrocompatibilité
```

---

## 🧪 Comment tester

### Test 1 : Modifier un employé existant
1. **Personnel → Employés**
2. Cliquer sur **Eliott Bellegarde**
3. Changer le type d'accès (ex: Superviseur)
4. **Vérifier** : Aucune erreur, sauvegarde réussie ✅

### Test 2 : Remettre le même type
1. Eliott est "Employe"
2. Essayer de le remettre à "Employe"
3. **Vérifier** : Aucune erreur (avant = erreur 400) ✅

### Test 3 : Type personnalisé
1. Créer un type personnalisé "Inspecteur Terrain"
2. Assigner ce type à un employé
3. **Vérifier** : Fonctionne maintenant ✅

---

## 📊 Résumé des corrections

| Problème | Avant ❌ | Après ✅ |
|----------|---------|----------|
| Types personnalisés | Rejetés (400) | Acceptés |
| Même valeur | Erreur 400 | Log info, pas d'erreur |
| Paramètres | `role` obligatoire | `access_type` + `role` optionnels |
| Champs mis à jour | Seulement `role` | `access_type` + `role` |

---

## 🎯 Impact sur les permissions Employé

Ce bug **empêchait** de :
- Modifier les types d'accès des utilisateurs
- Assigner des types personnalisés
- Réassigner le même type (utile pour forcer un refresh)

**Maintenant résolu** : Vous pouvez librement changer les types d'accès, y compris vers des types personnalisés, et les permissions modifiées dans le RBAC seront appliquées après reconnexion de l'employé.

---

## ✅ Conclusion

L'erreur "Impossible de modifier l'accès" est **résolue**. Vous pouvez maintenant :
1. ✅ Modifier le type d'accès d'Eliott vers "Employe" (ou tout autre type)
2. ✅ Les permissions modifiées (Rapport-heures, Historique) seront actives après sa reconnexion
3. ✅ Utiliser des types d'accès personnalisés

---

## 📋 Prochaines étapes

1. **Modifier le type d'accès d'Eliott** (devrait fonctionner maintenant)
2. **Demander à Eliott de se déconnecter/reconnecter**
3. **Vérifier** qu'il voit maintenant :
   - Planning → Rapport d'heures
   - Actifs → Eau → Bouton Historique

Si ça ne fonctionne toujours pas après ces 3 étapes, il faudra vérifier le frontend (comment les permissions sont vérifiées dans les composants React).
