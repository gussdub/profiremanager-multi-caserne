# 🚀 Guide Détaillé - Déploiement Vercel

## Vue d'Ensemble

Vercel va déployer le frontend React de ProFireManager avec Vite.

---

## Méthode 1: Déploiement via Dashboard (Recommandé)

### Étape 1: Préparer le Projet

**Important**: Vercel doit déployer uniquement le dossier `frontend/`

### Étape 2: Connexion Vercel

1. **Se connecter** à [Vercel](https://vercel.com/login)
2. **Connecter GitHub** si ce n'est pas déjà fait
3. **New Project**

### Étape 3: Configuration du Projet

1. **Import Git Repository**
   - Sélectionner votre dépôt ProFireManager
   - Cliquer **Import**

2. **Configure Project**:

   **Framework Preset**: 
   ```
   Vite
   ```

   **Root Directory**: 
   ```
   frontend
   ```
   ⚠️ **IMPORTANT**: Cliquer **Edit** et sélectionner `frontend/`

   **Build Command**:
   ```
   yarn build
   ```
   (Laisser par défaut si Vite est détecté)

   **Output Directory**:
   ```
   dist
   ```
   (Laisser par défaut)

   **Install Command**:
   ```
   yarn install
   ```
   (Laisser par défaut)

### Étape 4: Variables d'Environnement

**Cliquer sur "Environment Variables"**

Ajouter:
```
Name: REACT_APP_BACKEND_URL
Value: https://VOTRE-APP.onrender.com
```

⚠️ **Remplacer** `VOTRE-APP.onrender.com` par votre URL Render réelle!

**Example**:
```
REACT_APP_BACKEND_URL = https://profiremanager-backend.onrender.com
```

### Étape 5: Déployer

1. Cliquer **Deploy**
2. Attendre 2-4 minutes
3. Une fois terminé, vous aurez une URL: `https://votre-projet.vercel.app`

---

## Méthode 2: Déploiement via CLI

### Installation CLI

```bash
npm i -g vercel
```

### Connexion

```bash
vercel login
```

### Déploiement

```bash
cd /app/frontend
vercel --prod
```

**Répondre aux questions**:
```
Set up and deploy "~/frontend"? [Y/n] Y
Which scope? → Votre compte
Link to existing project? [y/N] N
What's your project's name? → profiremanager
In which directory is your code located? → ./
```

**Vercel détectera automatiquement**:
- Framework: Vite
- Build Command: yarn build
- Output Directory: dist

**Ajouter la variable d'environnement**:
```bash
vercel env add REACT_APP_BACKEND_URL production
# Entrer: https://votre-backend.onrender.com
```

**Redéployer**:
```bash
vercel --prod
```

---

## Problèmes Courants et Solutions

### Problème 1: "Build Failed"

**Erreur**: `Command "yarn build" exited with 1`

**Solutions**:

#### A. Vérifier package.json

Le fichier `/app/frontend/package.json` doit avoir:
```json
{
  "scripts": {
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### B. Vérifier les dépendances

Toutes les dépendances doivent être dans `dependencies` pas `devDependencies`:
```bash
cd /app/frontend
yarn add vite @vitejs/plugin-react
```

#### C. Vérifier vite.config.js

Le fichier doit exister à `/app/frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
```

---

### Problème 2: "Root Directory Not Found"

**Erreur**: `The specified Root Directory "frontend" does not exist`

**Solution**: 

Dans Vercel Dashboard → Settings → General → Root Directory
- Cliquer **Edit**
- Sélectionner `frontend` dans le dropdown
- **Save**
- **Redeploy**

---

### Problème 3: "404 sur toutes les routes"

**Erreur**: `/shefford` retourne 404

**Solution**: Le fichier `vercel.json` doit être à la racine du projet

**Vérifier**:
```bash
ls -la /app/vercel.json
```

**Contenu de vercel.json**:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

**Si manquant**, le créer et redéployer.

---

### Problème 4: "Backend API Not Reachable"

**Erreur**: `Failed to fetch` ou `Network Error` dans la console

**Solutions**:

#### A. Vérifier la variable d'environnement

**Vercel Dashboard** → Votre projet → **Settings** → **Environment Variables**

Vérifier:
```
REACT_APP_BACKEND_URL = https://votre-backend.onrender.com
```

⚠️ **Pas de `/` à la fin!**

#### B. Vérifier CORS Backend

Dans `/app/backend/server.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://votre-projet.vercel.app",  # Ajouter votre URL Vercel
        "https://votre-domaine.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Redéployer le backend** sur Render après modification.

#### C. Tester le backend

```bash
curl https://votre-backend.onrender.com/api/health
```

Doit retourner:
```json
{"status": "healthy"}
```

---

### Problème 5: "Environment Variable Not Working"

**Symptôme**: `REACT_APP_BACKEND_URL` est `undefined`

**Solutions**:

#### A. Vérifier le nom exact
- Doit être **exactement**: `REACT_APP_BACKEND_URL`
- Sensible à la casse
- Avec underscore `_` pas tiret `-`

#### B. Redéployer après ajout de variable
Les variables d'environnement nécessitent un nouveau déploiement:
1. **Vercel Dashboard** → **Deployments**
2. **Redeploy** (les 3 points → Redeploy)

#### C. Vérifier dans le code
Dans le code React, utiliser:
```javascript
const API_URL = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
```

---

### Problème 6: "Out of Memory"

**Erreur**: `JavaScript heap out of memory`

**Solution**: 

Augmenter la mémoire dans `package.json`:
```json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build"
  }
}
```

---

## Configuration Recommandée

### Structure de Fichiers

```
/app/
├── frontend/              ← Root Directory dans Vercel
│   ├── src/
│   ├── public/
│   ├── package.json       ← Scripts de build
│   ├── vite.config.js     ← Config Vite
│   └── .env.production    ← Variables locales (pas utilisé par Vercel)
├── backend/
└── vercel.json           ← Config rewrites (À LA RACINE)
```

### Package.json Minimal

```json
{
  "name": "profiremanager-frontend",
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "axios": "^1.6.2"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

### Vercel.json Minimal

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## Tests Post-Déploiement

### Test 1: Homepage

```
https://votre-projet.vercel.app
```

**Attendu**: Redirection automatique vers `/shefford`

### Test 2: Route Tenant

```
https://votre-projet.vercel.app/shefford
```

**Attendu**: Page de login Shefford

### Test 3: API Connection

Ouvrir la console (F12) et vérifier:
- Pas d'erreur CORS
- Pas d'erreur `Failed to fetch`
- API calls vers `https://votre-backend.onrender.com`

### Test 4: Login

Se connecter avec:
```
Email: admin@firemanager.ca
Password: admin123
```

**Attendu**: Dashboard s'affiche

---

## Commandes Utiles

### Vérifier les Logs

**Vercel Dashboard** → **Deployments** → Sélectionner un déploiement → **View Function Logs**

### Forcer un Redéploiement

```bash
vercel --prod --force
```

### Lister les Variables d'Environnement

```bash
vercel env ls
```

### Supprimer un Déploiement

**Vercel Dashboard** → **Deployments** → 3 points → **Delete**

---

## Checklist de Déploiement

### Avant le Déploiement
- [ ] Backend Render fonctionnel et testé
- [ ] URL backend notée
- [ ] Code frontend fonctionne en local
- [ ] `vercel.json` à la racine du projet
- [ ] Compte Vercel créé

### Configuration Vercel
- [ ] Root Directory = `frontend`
- [ ] Framework Preset = Vite
- [ ] Build Command = `yarn build`
- [ ] Output Directory = `dist`
- [ ] Variable `REACT_APP_BACKEND_URL` ajoutée

### Après Déploiement
- [ ] Build réussi (vert)
- [ ] Site accessible
- [ ] Routes fonctionnent (/shefford, /test, etc.)
- [ ] Login fonctionne
- [ ] API connectée (pas d'erreur CORS)

---

## Domaine Personnalisé

### Ajouter un Domaine

1. **Vercel Dashboard** → Votre projet
2. **Settings** → **Domains**
3. **Add Domain**: `app.profiremanager.com`
4. Suivre les instructions DNS

### Configuration DNS

Chez votre registrar:

**Option A - CNAME** (Recommandé):
```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

**Option B - A Record**:
```
Type: A
Name: app
Value: 76.76.21.21
```

### Mise à jour CORS

Après ajout du domaine, mettre à jour le backend:
```python
allow_origins=[
    "https://app.profiremanager.com",
    "https://profiremanager.vercel.app"
]
```

---

## Support

### Logs Vercel

**Dashboard** → **Deployments** → Cliquer sur un déploiement

Sections:
- **Build Logs**: Erreurs de compilation
- **Function Logs**: Erreurs runtime (si applicable)
- **Edge Logs**: Erreurs de routing

### Erreurs Fréquentes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `Command failed` | Build échoué | Vérifier package.json |
| `404` | Routing | Vérifier vercel.json |
| `CORS` | Backend | Ajouter origin Vercel |
| `ENV undefined` | Variable manquante | Ajouter et redéployer |

---

## Résumé Rapide

### Configuration Minimale

1. **Root Directory**: `frontend`
2. **Variable**: `REACT_APP_BACKEND_URL`
3. **Fichier**: `vercel.json` à la racine
4. **Deploy**

### URLs Finales

```
Frontend: https://profiremanager.vercel.app
Backend: https://profiremanager-backend.onrender.com
API Docs: https://profiremanager-backend.onrender.com/docs
```

---

**Votre frontend sera en ligne et connecté au backend! 🎉**
