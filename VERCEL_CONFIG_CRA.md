# ⚡ Configuration Vercel pour Create React App (CRA)

## Votre Projet Utilise Create React App

Le frontend ProFireManager utilise **Create React App** avec **CRACO**, pas Vite.

---

## Configuration Vercel Correcte

### Dashboard Vercel

**Import Git Repository** → Sélectionner ProFireManager

**Configure Project**:

```
Framework Preset: Create React App
Root Directory: frontend
Build Command: yarn build
Output Directory: build
Install Command: yarn install
```

### Variables d'Environnement

```
REACT_APP_BACKEND_URL = https://VOTRE-BACKEND.onrender.com
```

⚠️ Remplacer par votre vraie URL Render!

---

## Fichier vercel.json

À la racine `/app/vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

---

## Problèmes Spécifiques CRA

### Problème: "react-scripts not found"

**Solution**: Vérifier que `react-scripts` est dans `dependencies` pas `devDependencies`

Dans `/app/frontend/package.json`:
```json
{
  "dependencies": {
    "react-scripts": "5.0.1"
  }
}
```

### Problème: "craco: command not found"

**Solution**: 

Option 1 - Installer craco:
```bash
cd /app/frontend
yarn add @craco/craco
```

Option 2 - Utiliser react-scripts directement:

Modifier `/app/frontend/package.json`:
```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  }
}
```

---

## Déploiement via CLI

```bash
cd /app/frontend
vercel --prod
```

**Questions**:
```
Set up and deploy? Y
Which scope? Votre compte
Link to existing project? N
Project name? profiremanager
Directory? ./
Override build command? N (Vercel détectera CRA)
```

**Ajouter variable**:
```bash
vercel env add REACT_APP_BACKEND_URL production
# Entrer: https://votre-backend.onrender.com
```

**Redéployer**:
```bash
vercel --prod
```

---

## Vérifications

### 1. Package.json

```json
{
  "scripts": {
    "build": "craco build"  // ou "react-scripts build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1"
  }
}
```

### 2. Output Directory

Pour CRA, c'est **`build`** pas `dist`:
- Vite → `dist`
- CRA → `build`

### 3. Environment Variables

Dans le code:
```javascript
const API_URL = process.env.REACT_APP_BACKEND_URL;
```

---

## Configuration Complète Vercel

### Via Dashboard

1. **New Project**
2. **Import** repo ProFireManager
3. **Configure**:
   - Framework: **Create React App**
   - Root Directory: **frontend** (cliquer Edit)
   - Build Command: **yarn build** (ou laisser auto)
   - Output Directory: **build** (ou laisser auto)
4. **Environment Variables**:
   - Add: `REACT_APP_BACKEND_URL` = `https://votre-backend.onrender.com`
5. **Deploy**

---

## Résumé des Différences

| Aspect | Vite | CRA (Votre Projet) |
|--------|------|-------------------|
| Framework | Vite | Create React App |
| Build Tool | Vite | webpack + craco |
| Output Dir | `dist` | `build` |
| Config File | `vite.config.js` | `craco.config.js` |
| Build Command | `vite build` | `craco build` |

---

**Utilisez la configuration CRA pour déployer sur Vercel! 🚀**
