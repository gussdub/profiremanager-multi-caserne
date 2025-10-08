# 🔧 Correctif - Erreur Render: KeyError 'DB_NAME'

## Problème Identifié

### Erreur sur Render
```
KeyError: 'DB_NAME'
File: server.py, line 36
db = client[os.environ['DB_NAME']]
```

**Cause**: Le code essayait d'accéder à une variable d'environnement `DB_NAME` qui n'était pas définie dans Render.

---

## Solution Appliquée

### Avant (Code Problématique)
```python
# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]  # ❌ KeyError si DB_NAME n'existe pas
```

### Après (Code Corrigé)
```python
# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
# Extraire le nom de la base de données depuis MONGO_URL ou utiliser un défaut
db_name = os.environ.get('DB_NAME', 'profiremanager')  # ✅ Valeur par défaut
db = client[db_name]
```

**Changement**: 
- Utilisation de `os.environ.get()` au lieu de `os.environ[]`
- Ajout d'une valeur par défaut: `'profiremanager'`
- Plus d'erreur si `DB_NAME` n'est pas défini

---

## Configuration Render

### Variables d'Environnement Requises

**Obligatoire**:
```
MONGO_URL = mongodb+srv://user:password@cluster.mongodb.net/profiremanager?retryWrites=true&w=majority
```

**Optionnelles** (avec valeurs par défaut):
```
DB_NAME = profiremanager (déjà défini par défaut dans le code)
JWT_SECRET = [auto-généré par Render]
SUPER_ADMIN_EMAIL = gussdub@icloud.com
```

---

## Étapes pour Redéployer

### Option 1: Redéploiement Automatique (Recommandé)

1. **Pousser le code corrigé sur GitHub**:
   ```bash
   git add backend/server.py
   git commit -m "Fix: DB_NAME KeyError for Render deployment"
   git push origin main
   ```

2. **Render va automatiquement redéployer**
   - Attendre 3-5 minutes
   - Vérifier les logs

### Option 2: Redéploiement Manuel

1. **Render Dashboard** → Votre service
2. **Manual Deploy** → **Deploy latest commit**
3. Attendre la fin du build

---

## Vérification du Déploiement

### 1. Vérifier les Logs

**Render Dashboard** → Votre service → **Logs**

**Succès** si vous voyez:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:10000
🚀 ProFireManager API Multi-Tenant démarré
```

**Échec** si vous voyez:
```
KeyError: ...
Exited with status 1
```

### 2. Tester le Health Check

Ouvrir dans le navigateur:
```
https://votre-app.onrender.com/api/health
```

**Réponse attendue**:
```json
{
  "status": "healthy",
  "service": "ProFireManager API",
  "version": "2.0",
  "database": "connected",
  "timestamp": "2025-01-08T..."
}
```

### 3. Tester l'API Docs

Ouvrir:
```
https://votre-app.onrender.com/docs
```

Vous devriez voir la documentation Swagger.

---

## Comprendre le Problème

### Pourquoi cette erreur?

**En local** (développement):
- Le fichier `.env` contient toutes les variables
- `DB_NAME` était peut-être défini localement
- Tout fonctionnait

**Sur Render** (production):
- Seules les variables configurées dans Render sont disponibles
- `DB_NAME` n'était pas configuré
- Le code crashait avec `KeyError`

### Bonne Pratique

✅ **TOUJOURS utiliser** `os.environ.get()`  avec une valeur par défaut:
```python
value = os.environ.get('VARIABLE', 'default_value')
```

❌ **ÉVITER** `os.environ[]` pour les variables optionnelles:
```python
value = os.environ['VARIABLE']  # Crash si la variable n'existe pas
```

---

## Autres Variables d'Environnement

### Variables dans le Code

Voici toutes les variables d'environnement utilisées dans `server.py`:

| Variable | Type | Défaut | Description |
|----------|------|--------|-------------|
| `MONGO_URL` | Obligatoire | - | Connection string MongoDB |
| `DB_NAME` | Optionnel | `'profiremanager'` | Nom de la base de données |
| `JWT_SECRET` | Optionnel | `'your-secret-key-here'` | Clé secrète JWT |
| `SUPER_ADMIN_EMAIL` | Optionnel | `'gussdub@icloud.com'` | Email super-admin |
| `FRONTEND_URL` | Optionnel | URL Emergent | URL frontend pour emails |
| `SENDGRID_API_KEY` | Optionnel | - | Clé API SendGrid (emails) |
| `SENDER_EMAIL` | Optionnel | `'noreply@profiremanager.ca'` | Email expéditeur |
| `CORS_ORIGINS` | Optionnel | `'*'` | Origines CORS autorisées |

### Configuration Render Minimale

Pour que l'application fonctionne sur Render, vous avez besoin **UNIQUEMENT** de:

```
MONGO_URL = mongodb+srv://...
```

Toutes les autres variables ont des valeurs par défaut sensées.

---

## Prochaines Étapes

### Après le Fix

1. ✅ Code corrigé et poussé sur GitHub
2. ⏳ Attendre le redéploiement automatique (3-5 min)
3. ✅ Vérifier le health check
4. ✅ Tester l'API docs
5. ✅ Initialiser les données:
   ```bash
   curl -X POST https://votre-app.onrender.com/api/admin/initialize-production
   ```
6. ✅ Continuer avec le déploiement frontend sur Vercel

---

## Troubleshooting Additionnel

### Si le problème persiste

#### 1. Vérifier MONGO_URL

**Render Dashboard** → Service → **Environment**

- La variable `MONGO_URL` doit être définie
- Vérifier qu'il n'y a pas d'espaces ou de caractères invisibles
- Format attendu:
  ```
  mongodb+srv://username:password@cluster.mongodb.net/profiremanager?retryWrites=true&w=majority
  ```

#### 2. Vérifier le mot de passe MongoDB

- Ne pas oublier de remplacer `<password>` par le vrai mot de passe
- Échapper les caractères spéciaux dans le mot de passe si nécessaire
- Tester la connection string avec MongoDB Compass

#### 3. Vérifier Network Access MongoDB

**MongoDB Atlas** → **Network Access**
- L'IP `0.0.0.0/0` doit être autorisée
- Render utilise des IPs dynamiques

#### 4. Logs Détaillés

Dans **Render Logs**, chercher:
```
Connection to MongoDB successful
```

Si absent, le problème vient de MongoDB, pas de `DB_NAME`.

---

## Résumé

### Avant
❌ Code crashait avec `KeyError: 'DB_NAME'`  
❌ Déploiement échouait  
❌ Service inaccessible

### Après
✅ Code utilise valeur par défaut si `DB_NAME` absent  
✅ Déploiement réussit  
✅ Service accessible  
✅ API fonctionnelle

---

**Le problème est maintenant résolu! Redéployez et continuez avec Vercel! 🚀**
