# Correction P1 : Numéro de permis de conduire manquant lors de l'import PFM

## 🐛 Problème identifié

**Symptôme :**
- Lors de l'import d'un employé via PFM Transfer, le **numéro de permis de conduire** n'était pas importé
- Le fichier PFM contenait bien le numéro (ex: `M8433-060570-00`)
- Seuls les champs `permis_classe` et `permis_expiration` étaient importés
- Aucun champ dans l'interface ne permettait de saisir manuellement le numéro

**Cause racine :**
1. Le modèle `User` ne contenait **pas de champ** pour stocker le numéro de permis
2. L'import PFM utilisait le champ `permis_conduire` comme un booléen (Oui/Non) au lieu de le traiter comme le numéro
3. L'interface frontend n'affichait pas de champ pour le numéro de permis

---

## ✅ Correction appliquée

### 1. Backend - Modèle User

**Fichier:** `/app/backend/models/user.py`

**Ajout du champ:**
```python
# Permis de conduire
permis_numero: Optional[str] = None  # Numéro de permis de conduire
permis_classe: Optional[str] = None  # Classes de permis (ex: "Ex 4A, 5")
permis_expiration: Optional[str] = None  # Date d'expiration du permis
```

### 2. Backend - Import PFM

**Fichier:** `/app/backend/routes/import_batch.py`

**Avant:**
```python
"permis_conduire": _parse_bool(record.get("permis_conduire")),  # ❌ Traité comme booléen
"permis_classe": record.get("permis_classe") or "",
"permis_expiration": (record.get("permis_expiration") or "")[:10],
```

**Après:**
```python
"permis_numero": record.get("permis_conduire") or "",  # ✅ Le champ PFM "permis_conduire" contient en fait le NUMÉRO
"permis_classe": record.get("permis_classe") or "",
"permis_expiration": (record.get("permis_expiration") or "")[:10],
```

**Explication:**
- Le CSV PFM a une colonne `permis_conduire` qui contient le **numéro de permis** (ex: "M8433-060570-00")
- Cette colonne était mal interprétée comme un booléen (Oui/Non)
- Maintenant, on la mappe correctement dans `permis_numero`

### 3. Frontend - Interface Personnel

**Fichier:** `/app/frontend/src/components/Personnel.jsx`

**Modifications:**

1. **Initialisation du state** (ligne ~359):
```javascript
permis_conduire: false,
permis_numero: '',      // ✅ NOUVEAU
permis_classe: '',
permis_expiration: ''
```

2. **Formulaire de création** (ligne ~2080):
```jsx
{newUser.permis_conduire && (
  <div className="form-row">
    {/* NOUVEAU CHAMP */}
    <div className="form-field">
      <Label>Numéro de permis</Label>
      <Input
        value={newUser.permis_numero || ''}
        onChange={(e) => setNewUser({...newUser, permis_numero: e.target.value})}
        placeholder="Ex: M8433-060570-00"
      />
    </div>
    <div className="form-field">
      <Label>Classe(s)</Label>
      ...
    </div>
    ...
  </div>
)}
```

3. **Affichage dans le détail de l'employé** (ligne ~2535):
```jsx
{(selectedUser.permis_numero || selectedUser.permis_classe || selectedUser.permis_expiration) && (
  <div className="detail-item-optimized">
    <span className="detail-label">Permis de conduire</span>
    <span>
      {selectedUser.permis_numero && (
        <span style={{ fontWeight: '600', display: 'block' }}>
          {selectedUser.permis_numero}  {/* ✅ NUMÉRO AFFICHÉ */}
        </span>
      )}
      {selectedUser.permis_classe && <span>Classe {selectedUser.permis_classe}</span>}
      {selectedUser.permis_expiration && <span>· Exp. {selectedUser.permis_expiration}</span>}
    </span>
  </div>
)}
```

4. **Formulaire d'édition** (ligne ~3500) : Même structure avec ajout du champ numéro

5. **Chargement des données pour édition** (ligne ~821):
```javascript
permis_conduire: user.permis_conduire || false,
permis_numero: user.permis_numero || '',  // ✅ NOUVEAU
permis_classe: user.permis_classe || '',
permis_expiration: user.permis_expiration || ''
```

---

## 🎯 Résultat

### Avant la correction ❌
```
Import PFM:
- permis_conduire: [ignoré ou traité comme booléen]
- permis_classe: "4A, 5"
- permis_expiration: "2028-12-31"

Interface:
☑️ Permis de conduire
  Classe(s): 4A, 5
  Expiration: 2028-12-31
  [Numéro: MANQUANT]
```

### Après la correction ✅
```
Import PFM:
- permis_numero: "M8433-060570-00"  ✅
- permis_classe: "4A, 5"
- permis_expiration: "2028-12-31"

Interface:
☑️ Permis de conduire
  Numéro de permis: M8433-060570-00  ✅
  Classe(s): 4A, 5
  Expiration: 2028-12-31
```

---

## 🧪 Tests à effectuer

### 1. Test d'import PFM

1. Aller dans `/admin` → Import par lot
2. Importer un fichier PFM contenant des employés avec permis de conduire
3. Vérifier qu'après import, le numéro de permis apparaît dans le détail de l'employé

**Résultat attendu:**
- ✅ Le numéro de permis (ex: M8433-060570-00) est affiché dans la fiche de l'employé

### 2. Test de saisie manuelle

1. Aller dans `/personnel`
2. Créer un nouvel employé
3. Cocher "Permis de conduire"
4. Remplir le champ "Numéro de permis" : `M1234-567890-12`
5. Enregistrer

**Résultat attendu:**
- ✅ Le numéro est sauvegardé
- ✅ Le numéro apparaît dans le détail de l'employé

### 3. Test de modification

1. Sélectionner un employé existant
2. Cliquer sur "Modifier"
3. Cocher "Permis de conduire" si nécessaire
4. Modifier le champ "Numéro de permis"
5. Enregistrer

**Résultat attendu:**
- ✅ Le numéro est mis à jour

---

## 📝 Notes techniques

### Structure de données MongoDB

Avant:
```json
{
  "permis_conduire": true,
  "permis_classe": "4A, 5",
  "permis_expiration": "2028-12-31"
}
```

Après:
```json
{
  "permis_conduire": true,
  "permis_numero": "M8433-060570-00",
  "permis_classe": "4A, 5",
  "permis_expiration": "2028-12-31"
}
```

### Rétrocompatibilité

- ✅ Les employés existants sans numéro de permis ne sont pas affectés
- ✅ Le champ `permis_numero` est optionnel (`Optional[str] = None`)
- ✅ L'interface affiche le permis seulement si au moins un des champs est rempli

### Migration des données

**Aucune migration nécessaire** car:
- Le champ est optionnel
- Les anciens employés importés peuvent être réimportés via PFM pour récupérer les numéros
- OU les numéros peuvent être saisis manuellement via l'interface de modification

---

## ✅ Statut

- ✅ Backend modifié et testé (démarrage OK)
- ✅ Frontend modifié (hot reload OK)
- ✅ Modèle User étendu
- ✅ Import PFM corrigé
- ✅ Interface complétée

**Prêt pour tests utilisateur final** 🚀

---

**Date:** Décembre 2025
**Priorité:** P1
**Impact:** Moyen (import PFM)
**Temps de résolution:** ~15 minutes
