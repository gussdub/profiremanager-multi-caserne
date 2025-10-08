# 🔑 Identifiants de Connexion - ProFireManager Multi-Tenant

## ✅ Problème Résolu!

Les données de test ont été initialisées avec succès. Vous pouvez maintenant vous connecter!

---

## 🌐 Accès à l'Application

### URL Préférentielle
Pour éviter les problèmes de détection du tenant, **accédez directement à:**

```
/shefford
```

Si vous accédez à la racine `/`, vous serez automatiquement redirigé vers `/shefford`.

---

## 👥 Comptes Disponibles

### 1. 🔧 SUPER-ADMIN (Gestion Multi-Tenant)

**Pour gérer toutes les casernes:**

```
Email: gussdub@icloud.com
Mot de passe: 230685Juin+
```

**Accès:**
- Connectez-vous depuis n'importe quelle page
- Vous serez automatiquement redirigé vers le dashboard super-admin
- Vous verrez toutes les casernes et pourrez les gérer

**Fonctionnalités:**
- ✅ Voir toutes les casernes
- ✅ Créer de nouvelles casernes
- ✅ Modifier les casernes existantes
- ✅ Supprimer des casernes
- ✅ Accéder à chaque caserne individuellement
- ✅ Voir les statistiques globales

---

### 2. 🏢 CASERNE SHEFFORD

**URL d'accès:** `/shefford`

#### 👤 Administrateur (Accès Complet)

```
Email: admin@firemanager.ca
Mot de passe: admin123
```

**Rôle:** Admin  
**Permissions:**
- ✅ Gestion complète du personnel
- ✅ Configuration du planning
- ✅ Gestion des formations
- ✅ Gestion des EPI
- ✅ Paramètres de la caserne
- ✅ Rapports et statistiques
- ✅ Tous les modules

---

#### 👤 Superviseur

```
Email: superviseur@firemanager.ca
Mot de passe: superviseur123
```

**Rôle:** Superviseur  
**Permissions:**
- ✅ Voir le personnel
- ✅ Gérer le planning
- ✅ Voir les formations
- ✅ Gérer les remplacements
- ❌ Pas d'accès aux paramètres

---

#### 👤 Employé

```
Email: employe@firemanager.ca
Mot de passe: employe123
```

**Rôle:** Employé (Temps Partiel)  
**Permissions:**
- ✅ Voir son profil
- ✅ Gérer ses disponibilités
- ✅ Voir le planning (lecture seule)
- ✅ Voir les formations
- ✅ Voir ses EPI
- ❌ Pas de gestion du personnel
- ❌ Pas de modifications du planning

---

## 🧪 Comment Tester

### Test 1: Connexion Simple (Caserne Shefford)

1. **Accédez à** `/shefford`
2. **Connectez-vous** avec: `admin@firemanager.ca` / `admin123`
3. **Explorez:**
   - Dashboard avec statistiques
   - Personnel (créer/modifier des pompiers)
   - Planning (assigner des gardes)
   - Formations
   - EPI
   - Etc.

### Test 2: Super-Admin

1. **Accédez à** n'importe quelle page
2. **Connectez-vous** avec: `gussdub@icloud.com` / `230685Juin+`
3. **Vous verrez:**
   - Dashboard super-admin
   - Statistiques globales (1 caserne, 3 utilisateurs, etc.)
   - Liste de la caserne Shefford
   - Boutons pour créer/modifier/supprimer

### Test 3: Créer une Nouvelle Caserne

1. **Connectez-vous en super-admin**
2. **Cliquez** sur "➕ Créer une caserne"
3. **Remplissez:**
   ```
   Nom: Caserne de Bromont
   Slug: bromont
   Email: contact@bromont.ca
   Téléphone: (450) 555-5678
   ```
4. **Validez**
5. **Accédez** à `/bromont`
6. **Vérifiez** que la caserne est isolée (pas de données de Shefford)

### Test 4: Test d'Isolation

1. **Dans Shefford** (`/shefford`):
   - Créez des utilisateurs
   - Créez des gardes dans le planning
   - Ajoutez des formations

2. **Créez une nouvelle caserne** (ex: `test`)

3. **Accédez à** `/test`:
   - Vérifiez qu'aucune donnée de Shefford n'apparaît
   - Les listes sont vides (sauf types de garde par défaut)

### Test 5: Navigation Multi-Tenant

1. **En super-admin:**
   - Cliquez sur "🔗 Accéder" pour Shefford
   - Vous êtes redirigé vers `/shefford`
   - Connectez-vous avec un compte Shefford

2. **Testez les URLs directement:**
   - `/shefford/dashboard`
   - `/shefford/personnel`
   - `/shefford/planning`

---

## 🔍 Vérifications

### Si la connexion ne fonctionne pas:

1. **Vérifiez l'URL:**
   ```
   ❌ Mauvais: /
   ✅ Bon: /shefford
   ```

2. **Vérifiez les logs backend:**
   ```bash
   tail -f /var/log/supervisor/backend.out.log
   ```

3. **Vérifiez que les données existent:**
   ```bash
   cd /app/backend && python init_demo_data.py
   ```

4. **Redémarrez les services:**
   ```bash
   sudo supervisorctl restart all
   ```

### En cas d'erreur "tenant not found":

- Assurez-vous d'utiliser `/shefford` et non `/`
- Vérifiez que le tenant existe en vous connectant en super-admin

---

## 📱 Utilisation Quotidienne

### Pour un utilisateur normal (pompier):

1. Accès direct à l'URL de sa caserne: `/shefford`
2. Connexion avec son email
3. Utilisation normale de l'application

### Pour un administrateur de caserne:

1. Accès à `/shefford`
2. Connexion avec compte admin
3. Gestion complète de sa caserne
4. Aucune visibilité sur les autres casernes

### Pour le super-admin:

1. Connexion depuis n'importe où
2. Vue d'ensemble de toutes les casernes
3. Peut créer/gérer des casernes
4. Doit accéder individuellement à chaque caserne pour voir les détails

---

## 🛠️ Commandes Utiles

### Réinitialiser les données de test:
```bash
cd /app/backend && python init_demo_data.py
```

### Voir les logs en temps réel:
```bash
# Backend
tail -f /var/log/supervisor/backend.out.log

# Frontend
tail -f /var/log/supervisor/frontend.out.log
```

### Redémarrer les services:
```bash
sudo supervisorctl restart all
```

### Vérifier les données en DB:
```bash
# Compter les utilisateurs
mongosh profiremanager --quiet --eval "db.users.countDocuments()"

# Voir les tenants
mongosh profiremanager --quiet --eval "db.tenants.find().pretty()"

# Voir les super-admins
mongosh profiremanager --quiet --eval "db.super_admins.find().pretty()"
```

---

## ⚠️ Notes Importantes

1. **Mots de passe de démo:**
   - Ces mots de passe sont pour la DÉMO uniquement
   - En production, utilisez des mots de passe forts
   - Changez le mot de passe super-admin immédiatement

2. **Accès par URL:**
   - Toujours utiliser `/shefford` ou `/nom-de-votre-caserne`
   - Ne pas utiliser la racine `/` pour la connexion tenant

3. **Isolation des données:**
   - Chaque caserne voit uniquement ses propres données
   - Le super-admin voit la liste des casernes mais pas les détails
   - Aucun partage de données entre casernes

4. **Création de nouvelles casernes:**
   - Seul le super-admin peut créer des casernes
   - Chaque caserne doit avoir un slug unique
   - Le slug est immuable après création

---

## 🎯 Résumé Rapide

### Pour tester rapidement:

```
1. Allez sur /shefford
2. Connectez-vous: admin@firemanager.ca / admin123
3. Explorez l'application!
```

### Pour tester le super-admin:

```
1. Connectez-vous: gussdub@icloud.com / 230685Juin+
2. Créez une nouvelle caserne
3. Testez l'isolation des données
```

---

## 📚 Documentation Complète

Pour plus de détails, consultez:
- `GUIDE_DEMARRAGE_MULTI_TENANT.md` - Guide utilisateur complet
- `MULTI_TENANT_MIGRATION_COMPLETE.md` - Architecture technique
- `PHASE_3C_COMPLETE.md` - Interface super-admin

---

## 🎉 Bon Test!

**ProFireManager v2.0 Multi-Tenant est prêt!**

Tous les comptes fonctionnent maintenant. Amusez-vous bien à explorer l'application! 🚀🔥

---

**Dernière mise à jour:** Aujourd'hui  
**Version:** 2.0 Multi-Tenant  
**Statut:** ✅ Opérationnel
