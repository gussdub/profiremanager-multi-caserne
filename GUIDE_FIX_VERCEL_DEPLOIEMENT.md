# Guide: Résoudre le problème de déploiement Vercel

## 🎯 Problème identifié
Vercel est connecté à GitHub mais ne déclenche aucun déploiement car il ne sait pas où trouver le code source React (qui est dans le sous-dossier `frontend/`).

## ✅ Solutions appliquées

### 1. Fichier vercel.json déplacé et configuré
- ✅ Déplacé de `/vercel.json` → `/frontend/vercel.json`
- ✅ Ajout des commandes de build pour Create React App

## 🔧 Configuration requise dans Vercel Dashboard

### Étape 1: Configurer le Root Directory
1. Allez sur **Vercel Dashboard** → Votre projet `profiremanager`
2. Cliquez sur **Settings** (en haut à droite)
3. Dans le menu latéral, cliquez sur **General**
4. Trouvez la section **"Build & Development Settings"**
5. Configurez les paramètres suivants:

```
Root Directory: frontend
   └─ Cliquez sur "Edit" et entrez: frontend
   └─ Cochez "Include source files outside of the Root Directory in the Build Step"

Build Command: yarn build
Install Command: yarn install
Output Directory: build
```

6. Cliquez sur **"Save"** pour chaque paramètre modifié

### Étape 2: Configurer les variables d'environnement
1. Toujours dans **Settings**, allez dans **"Environment Variables"**
2. Ajoutez la variable suivante:

```
Name: REACT_APP_BACKEND_URL
Value: https://profiremanager-backend.onrender.com
Environment: Production, Preview
```

3. Cliquez sur **"Save"**

### Étape 3: Déclencher un nouveau déploiement

**Méthode A: Via push Git** (Recommandé)
```bash
# Sur votre machine locale ou depuis cette session
cd /app
git add .
git commit -m "fix: configure vercel for frontend subfolder"
git push origin main
```

**Méthode B: Via Vercel Dashboard**
1. Allez dans l'onglet **"Deployments"**
2. Cliquez sur le bouton **"Redeploy"** (ou les 3 points "..." sur le dernier déploiement)
3. Sélectionnez **"Redeploy with existing Build Cache"**

**Méthode C: Via un commit vide (forcer)**
```bash
git commit --allow-empty -m "trigger vercel deployment"
git push origin main
```

## 📋 Checklist de vérification

Avant de déclencher le déploiement, vérifiez:

- [ ] Root Directory configuré à `frontend` dans Vercel
- [ ] Build Command = `yarn build`
- [ ] Output Directory = `build`
- [ ] Variable d'environnement `REACT_APP_BACKEND_URL` configurée
- [ ] Code poussé sur GitHub (branche `main`)
- [ ] Vercel connecté au bon dépôt GitHub

## 🚀 Prochaines étapes

1. Suivre les étapes 1 et 2 ci-dessus dans Vercel Dashboard
2. Pousser le code mis à jour sur GitHub
3. Vercel devrait automatiquement détecter le push et démarrer le build
4. Le déploiement prendra ~2-5 minutes

## 🔍 Vérification du déploiement

Une fois le déploiement lancé, vous verrez:
- Dans Vercel Dashboard → Deployments: Un nouveau build en cours (icône tournante)
- Le statut changera de "Building" → "Deploying" → "Ready"
- Le bouton "Visit" deviendra actif

## ⚠️ Problèmes courants

### Si le build échoue avec une erreur de dépendances:
```bash
# Dans les paramètres Vercel, changez Node.js Version:
Node.js Version: 18.x (recommandé) ou 20.x
```

### Si le build réussit mais l'app ne charge pas:
- Vérifiez que `REACT_APP_BACKEND_URL` est bien configuré
- Vérifiez les logs du navigateur (F12 → Console)
- Vérifiez que votre backend Render est bien en ligne

## 📞 Besoin d'aide?

Si après ces étapes, le déploiement ne se déclenche toujours pas:
1. Partagez une capture d'écran des "Build & Development Settings" dans Vercel
2. Partagez une capture d'écran de l'onglet "Deployments"
3. Vérifiez les webhooks GitHub: Settings → Webhooks (devrait y avoir un webhook Vercel actif)
