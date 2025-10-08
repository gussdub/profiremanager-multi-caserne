# 🚀 Guide de Démarrage - ProFireManager Multi-Tenant

## Introduction

ProFireManager v2.0 supporte maintenant **plusieurs casernes indépendantes** dans une seule installation. Chaque caserne a ses propres données, utilisateurs et configuration.

---

## 🔑 Connexion Super-Admin

### Accès initial

**URL**: Votre domaine principal (ex: `app.profiremanager.com`)

**Identifiants par défaut**:
```
Email: gussdub@icloud.com
Mot de passe: 230685Juin+
```

⚠️ **IMPORTANT**: Changez ce mot de passe après la première connexion en production!

### Interface Super-Admin

Après connexion, vous verrez:
- **Statistiques globales**: Nombre de casernes, utilisateurs, gardes
- **Liste des casernes**: Toutes les casernes avec leurs infos
- **Boutons d'action**: Créer, Modifier, Supprimer, Accéder

---

## 🏢 Créer une Nouvelle Caserne

### Étape 1: Ouvrir le formulaire
1. Connectez-vous en super-admin
2. Cliquez sur **"➕ Créer une caserne"**

### Étape 2: Remplir les informations

**Champs obligatoires** (marqués d'un *):

- **Nom de la caserne**: Le nom complet
  - Exemple: `Caserne de Shefford`
  
- **Slug (URL)**: Identifiant unique dans l'URL
  - Exemple: `shefford`
  - ⚠️ Règles:
    - Uniquement lettres minuscules (a-z)
    - Chiffres (0-9)
    - Tirets (-)
    - Pas d'espaces
  - 💡 Résultat: La caserne sera accessible via `/shefford`
  
- **Email de contact**: Email principal de la caserne
  - Exemple: `contact@shefford.ca`

**Champs optionnels**:

- **Téléphone**: Numéro de contact
- **Adresse**: Adresse complète de la caserne

### Étape 3: Créer
1. Cliquez sur **"Créer la caserne"**
2. Vérification: Message de succès
3. La caserne apparaît dans la liste

### Étape 4: Configuration initiale

Maintenant que la caserne existe, il faut créer le premier utilisateur admin:

1. Cliquez sur **"🔗 Accéder"** pour la nouvelle caserne
2. Vous serez redirigé vers `/shefford` (exemple)
3. Créez un compte admin pour cette caserne:
   - Utiliser la fonction "Paramètres > Comptes d'Accès" (depuis un compte existant)
   - OU créer directement via l'endpoint API

**Recommandation**: Créez d'abord un utilisateur admin avec le rôle `admin` pour chaque nouvelle caserne.

---

## ✏️ Modifier une Caserne

### Ce que vous pouvez modifier
- Nom de la caserne
- Email de contact
- Téléphone
- Adresse

### Ce que vous NE pouvez PAS modifier
- **Slug (URL)**: Immuable après création
  - Raison: Préserver l'intégrité des liens et URLs

### Procédure
1. Cliquez sur **"✏️ Modifier"**
2. Modifiez les champs souhaités
3. Cliquez sur **"Enregistrer les modifications"**

---

## 🗑️ Supprimer une Caserne

### ⚠️ ATTENTION - Action irréversible!

La suppression d'une caserne supprime **définitivement**:
- ❌ Tous les utilisateurs
- ❌ Tout le planning et les gardes
- ❌ Toutes les formations
- ❌ Tous les EPI
- ❌ Toutes les disponibilités
- ❌ Tous les remplacements
- ❌ Toutes les notifications
- ❌ Tous les rapports

**Il n'y a aucun moyen de récupérer ces données!**

### Procédure
1. Cliquez sur **"🗑️ Supprimer"**
2. Lisez l'avertissement
3. Confirmez si vous êtes sûr
4. La caserne et toutes ses données sont supprimées

### Recommandation
🔒 Avant suppression:
1. Exportez les données importantes
2. Prévenez les utilisateurs
3. Vérifiez que c'est vraiment nécessaire

---

## 🔗 Accéder à une Caserne

### En tant que Super-Admin

1. Dans la liste des casernes
2. Cliquez sur **"🔗 Accéder"**
3. Vous êtes redirigé vers `/slug-de-la-caserne`
4. Page de connexion de cette caserne

### En tant qu'utilisateur de caserne

Accédez directement à l'URL de votre caserne:
```
https://app.profiremanager.com/shefford
```

Ou simplement:
```
/shefford
```

---

## 👥 Gestion des Utilisateurs par Caserne

### Création du premier admin

Après avoir créé une caserne, il faut créer un premier utilisateur admin:

**Option 1: Via API (recommandé pour setup initial)**
```bash
POST /api/{slug}/users
{
  "email": "admin@shefford.ca",
  "mot_de_passe": "VotreMotDePasseSecurise123!",
  "nom": "Admin",
  "prenom": "Caserne",
  "role": "admin",
  "grade": "Directeur",
  "type_emploi": "temps_plein",
  ...
}
```

**Option 2: Via interface (nécessite un compte admin existant)**
1. Se connecter à `/shefford` avec un compte admin
2. Aller dans "Personnel"
3. Créer un nouveau pompier
4. Dans "Paramètres > Comptes d'Accès", activer le compte avec rôle `admin`

### Rôles disponibles par caserne

- **Admin**: Gestion complète de la caserne
- **Superviseur**: Gestion du personnel et planning
- **Employé**: Consultation et gestion de son profil

---

## 📊 Comprendre les Statistiques

### Dashboard Super-Admin

**Total Casernes**: Nombre de casernes créées
- Inclut les actives et inactives

**Total Utilisateurs**: Somme de tous les utilisateurs de toutes les casernes

**Casernes Actives**: Casernes avec le statut `is_active = true`

**Total Gardes (ce mois)**: Total des assignations de toutes les casernes ce mois

---

## 🔐 Sécurité et Isolation

### Isolation des données

Chaque caserne est **complètement isolée**:

✅ Les utilisateurs de Shefford ne voient pas les données de Bromont
✅ Les plannings sont séparés
✅ Les formations sont séparées
✅ Les EPI sont séparés

### Niveaux de sécurité

**Super-Admin**:
- ✅ Voit toutes les casernes
- ✅ Peut créer/modifier/supprimer des casernes
- ❌ Ne voit pas les données détaillées (users, planning, etc.)
- ⚠️ Doit accéder individuellement à chaque caserne pour voir les détails

**Admin de caserne**:
- ✅ Gestion complète de SA caserne
- ❌ Aucune visibilité sur les autres casernes
- ❌ Aucun accès aux fonctions super-admin

---

## 🌐 Structure des URLs

### Pour les casernes
```
/shefford              → Login Shefford
/shefford/dashboard    → Dashboard Shefford
/shefford/personnel    → Personnel Shefford
/shefford/planning     → Planning Shefford
...
```

### Pour les autres casernes
```
/bromont/...
/granby/...
/magog/...
```

### Pour le super-admin
```
/admin                 → Dashboard Super-Admin (automatique après login)
```

---

## 🛠️ Dépannage

### Problème: "Caserne non trouvée"

**Causes possibles**:
1. Le slug est mal orthographié dans l'URL
2. La caserne a été supprimée
3. La caserne est inactive

**Solutions**:
1. Vérifier l'orthographe du slug
2. Vérifier dans le dashboard super-admin si la caserne existe
3. Réactiver la caserne si nécessaire

### Problème: "Impossible de créer une caserne"

**Causes possibles**:
1. Le slug existe déjà
2. Le slug contient des caractères invalides
3. Champs obligatoires manquants

**Solutions**:
1. Choisir un slug unique
2. Utiliser uniquement: a-z, 0-9, tirets (-)
3. Remplir tous les champs marqués *

### Problème: "Accès refusé"

**Causes possibles**:
1. Token JWT expiré
2. Pas de compte dans cette caserne
3. Permissions insuffisantes

**Solutions**:
1. Se reconnecter
2. Demander un compte à l'admin de la caserne
3. Vérifier les permissions avec l'admin

---

## 📋 Checklist de Setup

### Pour une nouvelle installation

- [ ] Accéder à l'application
- [ ] Se connecter en super-admin
- [ ] Changer le mot de passe super-admin
- [ ] Créer la première caserne
- [ ] Créer un admin pour cette caserne
- [ ] Tester l'accès à la caserne
- [ ] Vérifier l'isolation des données

### Pour ajouter une caserne

- [ ] Se connecter en super-admin
- [ ] Créer la nouvelle caserne
- [ ] Vérifier le slug et les infos
- [ ] Créer un admin pour la caserne
- [ ] Tester l'accès
- [ ] Former l'admin de la caserne

### Pour supprimer une caserne

- [ ] Exporter les données si nécessaire
- [ ] Prévenir les utilisateurs
- [ ] Se connecter en super-admin
- [ ] Supprimer la caserne
- [ ] Vérifier la suppression

---

## 💡 Bonnes Pratiques

### Nommage des slugs

✅ **Bon**:
- `shefford`
- `caserne-bromont`
- `granby-centre`

❌ **Mauvais**:
- `Shefford` (majuscules)
- `caserne bromont` (espaces)
- `granby_centre` (underscores)

### Organisation

1. **Un admin par caserne minimum**
2. **Email unique par caserne** (contact@...)
3. **Documentation** des slugs utilisés
4. **Backup régulier** des données

### Sécurité

1. ✅ Changer le mot de passe super-admin
2. ✅ Utiliser des mots de passe forts
3. ✅ Limiter l'accès super-admin
4. ✅ Vérifier régulièrement les accès
5. ✅ Sauvegarder avant toute suppression

---

## 📞 Support

### Logs système

Pour diagnostiquer des problèmes:

**Backend**:
```bash
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/backend.err.log
```

**Frontend**:
```bash
tail -f /var/log/supervisor/frontend.out.log
```

### Commandes utiles

**Redémarrer les services**:
```bash
sudo supervisorctl restart all
```

**Vérifier le statut**:
```bash
sudo supervisorctl status
```

---

## 📚 Ressources

### Documentation technique
- `MULTI_TENANT_MIGRATION_COMPLETE.md` - Architecture complète
- `PHASE_3C_COMPLETE.md` - Interface super-admin détaillée
- `PHASE_3B_COMPLETE.md` - Migration frontend

### Points d'entrée API

**Super-Admin**:
```
POST /api/admin/auth/login
GET  /api/admin/tenants
POST /api/admin/tenants
PUT  /api/admin/tenants/{id}
DELETE /api/admin/tenants/{id}
GET  /api/admin/stats
```

**Caserne**:
```
POST /api/{slug}/auth/login
GET  /api/{slug}/users
GET  /api/{slug}/planning/assignations/{date}
...
```

---

## ✅ Résumé Rapide

### En 5 étapes

1. **Connexion super-admin**: Utilisez les identifiants par défaut
2. **Créer caserne**: Nom + slug + email
3. **Créer admin caserne**: Premier utilisateur avec rôle admin
4. **Accéder**: Via le bouton "Accéder" ou l'URL directe
5. **Utiliser**: Interface normale pour chaque caserne

### En résumé

🏢 **ProFireManager Multi-Tenant** = 
- Une application
- Plusieurs casernes indépendantes
- Une gestion centralisée
- Des données isolées
- Une scalabilité infinie

---

🔥 **Bienvenue dans ProFireManager v2.0 Multi-Tenant!** 🔥

*Questions? Consultez la documentation technique complète ou les logs système.*
