# 🧹 Guide de Nettoyage de la Base de Données Production

## 📋 Endpoint Admin Créé

**URL** : `POST /api/admin/cleanup-database?confirm=true`

**Authentification** : Requiert un token Super Admin

**Ce qu'il fait** :
- ✅ Supprime TOUS les bâtiments (0 restant)
- ✅ Supprime TOUTES les inspections (0 restant)
- ✅ Conserve uniquement 3 tenants : **demo**, **shefford**, **magog**
- ✅ Supprime tous les autres tenants et leurs données
- ✅ Nettoie toutes les données orphelines

---

## 🚀 Comment l'utiliser en Production

### Étape 1 : Se connecter en Super Admin

**URL** : `https://www.profiremanager.ca/admin`

**Credentials Super Admin** : (Vous devez les avoir)

### Étape 2 : Obtenir le Token

Après connexion, ouvrez la console (F12) et tapez :
```javascript
// Récupérer le token depuis localStorage
const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
console.log('Token:', token);
```

Copiez le token affiché.

### Étape 3 : Exécuter le Nettoyage

**Option A - Via Console (F12)** :
```javascript
fetch('https://www.profiremanager.ca/api/admin/cleanup-database?confirm=true', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer VOTRE_TOKEN_ICI',
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Nettoyage terminé:', data);
  alert('Base nettoyée avec succès !');
})
.catch(err => console.error('❌ Erreur:', err));
```

**Option B - Via Postman/Thunder Client** :
```
POST https://www.profiremanager.ca/api/admin/cleanup-database?confirm=true
Headers:
  Authorization: Bearer VOTRE_TOKEN
```

### Étape 4 : Vérifier

Après le nettoyage, rechargez la page et videz le cache :
```javascript
localStorage.clear();
sessionStorage.clear();
caches.keys().then(k => k.forEach(c => caches.delete(c)));
location.reload(true);
```

---

## 📊 Réponse Attendue

```json
{
  "success": true,
  "message": "Base de données nettoyée avec succès",
  "results": {
    "tenants_conserves": ["demo", "shefford", "magog"],
    "tenants_supprimes": [],
    "batiments_supprimes": 16,
    "inspections_supprimees": 14,
    "orphelins_supprimes": {
      "equipements": 2,
      "historiques": 5
    }
  }
}
```

---

## ⚠️ ATTENTION

- ⚠️ Cette action est **IRRÉVERSIBLE**
- ⚠️ Toutes les données seront supprimées (sauf tenants demo, shefford, magog)
- ⚠️ Un log est créé dans `audit_logs` pour traçabilité

---

## 🔍 Vérification Post-Nettoyage

Après le nettoyage, vérifiez dans l'interface :
1. Allez sur `https://www.profiremanager.ca/demo`
2. Section Bâtiments → Devrait afficher **0 Total**
3. Si vous voyez encore des bâtiments → Videz le cache navigateur (voir Étape 4)

---

## 🆘 En Cas de Problème

Si l'endpoint ne fonctionne pas :
1. Vérifiez que vous êtes bien connecté en Super Admin
2. Vérifiez le token dans la console
3. Regardez les logs backend pour l'erreur
4. Contactez le support

---

## 📦 Après le Nettoyage

Une fois la base propre, vous pouvez :
1. 📥 Importer les DossierAdresse depuis PFM Transfer
2. 📥 Importer les Préventions
3. 🧪 Tester le matching automatique via références

Tous les correctifs sont déjà en place :
- ✅ Matching via références PFM Transfer
- ✅ Géolocalisation Android (maximumAge: 0)
- ✅ Azure SAS tokens 4h
- ✅ Modes de remplacement (Simultané, Séquentiel, Groupes)
