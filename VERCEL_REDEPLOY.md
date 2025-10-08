# 🔄 Forcer un Redéploiement sur Vercel

## Méthode 1: Via Dashboard (Plus Simple)

### Option A: Redéployer un déploiement existant

1. **Vercel Dashboard** → Votre projet
2. **Deployments** (onglet en haut)
3. **Trouver le dernier déploiement** (en haut de la liste)
4. Cliquer sur les **3 points** `⋯` à droite
5. Cliquer **Redeploy**
6. Confirmer **Redeploy**

### Option B: Nouveau déploiement depuis une branche

1. **Vercel Dashboard** → Votre projet
2. En haut à droite, cliquer **"..."** ou **"Visit"** dropdown
3. Sélectionner **"Redeploy"**
4. Ou cliquer directement sur le bouton **"Redeploy"** si visible

---

## Méthode 2: Via Git Push (Recommandé si changements)

### Si vous avez modifié le code

```bash
cd /app

# Ajouter les changements
git add .

# Commit
git commit -m "Force redeploy"

# Push
git push origin main
```

Vercel redéploiera automatiquement.

### Si vous n'avez PAS modifié le code (commit vide)

```bash
git commit --allow-empty -m "Force redeploy"
git push origin main
```

---

## Méthode 3: Via CLI Vercel

### Installation (si pas déjà fait)

```bash
npm i -g vercel
```

### Se connecter

```bash
vercel login
```

### Forcer le redéploiement

```bash
cd /app/frontend
vercel --prod --force
```

**Options utiles**:
- `--force`: Force le redéploiement même sans changements
- `--prod`: Déploie en production (pas preview)
- `--yes`: Skip les confirmations

---

## Méthode 4: Via Hooks Vercel

### Créer un Deploy Hook

1. **Vercel Dashboard** → Votre projet
2. **Settings** → **Git**
3. Scroll vers **Deploy Hooks**
4. **Create Hook**
   - Name: `Manual Deploy`
   - Branch: `main`
5. Copier l'URL générée

### Utiliser le Hook

```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/VOTRE_HOOK_URL"
```

Ou simplement ouvrir l'URL dans le navigateur.

---

## Après Changement de Configuration

### Si vous avez modifié:
- Variables d'environnement
- Root Directory
- Build Command
- Output Directory

**Vous DEVEZ redéployer** pour que les changements prennent effet.

### Étapes:

1. **Sauvegarder** les changements dans Settings
2. **Deployments** → Dernier déploiement
3. **3 points** → **Redeploy**
4. **Attendre** 2-4 minutes

---

## Vérifier le Build en Cours

### Dashboard Vercel

1. Aller dans **Deployments**
2. Le déploiement en cours a un statut:
   - 🔵 **Building** - En cours
   - ✅ **Ready** - Réussi
   - ❌ **Failed** - Échoué

### Voir les Logs en Temps Réel

1. Cliquer sur le déploiement en cours
2. Les logs s'affichent automatiquement
3. Vous verrez:
   ```
   Installing dependencies...
   Running build command...
   Build completed
   Deployment ready
   ```

---

## En Cas d'Erreur

### Si le Build Échoue

1. **Cliquer** sur le déploiement qui a échoué
2. **Lire les logs** pour trouver l'erreur
3. **Erreurs communes**:
   - `Module not found` → Dépendance manquante
   - `Command failed` → Problème de build
   - `Root directory not found` → Mauvaise config

### Comment Debugger

1. **Copier le message d'erreur exact**
2. **Vérifier localement**:
   ```bash
   cd /app/frontend
   yarn install
   yarn build
   ```
3. Si ça fonctionne localement mais pas sur Vercel:
   - Vérifier les variables d'environnement
   - Vérifier Root Directory
   - Vérifier Node version

---

## Forcer une Reconstruction Complète

### Nettoyer le Cache Vercel

1. **Vercel Dashboard** → Projet → **Settings**
2. Scroll vers **Build & Development Settings**
3. Activer **"Automatically expose System Environment Variables"**
4. **Save**
5. Redéployer

### Ou via Environment Variable

Ajouter une variable temporaire pour casser le cache:
```
FORCE_REBUILD = true
```

Puis redéployer et supprimer la variable après.

---

## Vérifier que le Redéploiement a Fonctionné

### 1. Check le Timestamp

- **Deployments** → Le dernier doit avoir l'heure actuelle

### 2. Test le Site

```
https://votre-projet.vercel.app
```

- Actualiser avec **Ctrl+F5** (hard refresh)
- Ouvrir en **navigation privée**

### 3. Check les Variables d'Environnement

Dans la console du site (F12):
```javascript
console.log(process.env.REACT_APP_BACKEND_URL)
```

---

## Résumé Rapide

### Pour redéployer rapidement:

**Via Dashboard**:
1. Deployments → 3 points → Redeploy

**Via Git**:
```bash
git commit --allow-empty -m "redeploy"
git push
```

**Via CLI**:
```bash
vercel --prod --force
```

---

## Temps de Déploiement

**Normal**:
- Installation: 30-60 secondes
- Build: 1-3 minutes
- Total: 2-4 minutes

**Si plus long**:
- Vérifier les logs
- Peut être un problème de dépendances

---

## Erreurs Communes Après Redéploiement

### Site Montre Toujours l'Ancienne Version

**Solution**: Hard refresh
- **Chrome/Edge**: Ctrl+Shift+R ou Ctrl+F5
- **Firefox**: Ctrl+Shift+R
- **Safari**: Cmd+Shift+R

### Les Variables d'Environnement ne Sont Pas Prises

**Solution**: 
1. Vérifier qu'elles sont bien dans **Production**
2. Redéployer après ajout de variables
3. Attendre la fin du build

### Build Réussit Mais Site Blanc

**Solution**:
1. Vérifier Output Directory (`build` pour CRA)
2. Vérifier `vercel.json` pour les rewrites
3. Check la console browser (F12) pour erreurs

---

**Avec l'une de ces méthodes, votre site devrait se redéployer! 🚀**
