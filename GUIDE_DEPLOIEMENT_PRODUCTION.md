# 🚀 Guide de Déploiement Production - ProFireManager

## Architecture de Déploiement

```
Production Stack:
├── MongoDB Atlas (Base de données cloud)
├── Render (Backend FastAPI + Python)
└── Vercel (Frontend React + Vite)
```

---

## 📋 Prérequis

Avant de commencer, créez des comptes sur:
1. ✅ [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) - Gratuit
2. ✅ [Render](https://render.com) - Gratuit pour démarrer
3. ✅ [Vercel](https://vercel.com) - Gratuit

**Important**: Ayez accès à votre dépôt GitHub pour ProFireManager.

---

## ÉTAPE 1: MongoDB Atlas (Base de Données)

### 1.1 Créer un Cluster MongoDB

1. **Se connecter** à [MongoDB Atlas](https://cloud.mongodb.com)
2. **Créer un nouveau projet**: "ProFireManager"
3. **Build a Database** → Choisir **M0 (Free)**
4. **Provider**: AWS
5. **Region**: Choisir la plus proche de vos utilisateurs
6. **Cluster Name**: `profiremanager-prod`
7. Cliquer **Create**

### 1.2 Configurer la Sécurité

#### A. Créer un utilisateur database

1. **Security** → **Database Access**
2. **Add New Database User**
   - Username: `profiremanager_admin`
   - Password: Générer un mot de passe fort (NOTEZ-LE!)
   - Database User Privileges: **Read and write to any database**
3. **Add User**

#### B. Configurer l'accès réseau

1. **Security** → **Network Access**
2. **Add IP Address**
3. **ALLOW ACCESS FROM ANYWHERE** → `0.0.0.0/0`
   - ⚠️ Nécessaire car Render utilise des IPs dynamiques
4. **Confirm**

### 1.3 Obtenir la Connection String

1. **Database** → **Connect**
2. **Connect your application**
3. **Driver**: Python, Version: 3.12 or later
4. Copier la connection string:
   ```
   mongodb+srv://profiremanager_admin:<password>@profiremanager-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **IMPORTANT**: Remplacer `<password>` par votre mot de passe
6. Ajouter le nom de la base: `/profiremanager` avant le `?`
   ```
   mongodb+srv://profiremanager_admin:VOTRE_MOT_DE_PASSE@profiremanager-prod.xxxxx.mongodb.net/profiremanager?retryWrites=true&w=majority
   ```

**Gardez cette URL précieusement!**

---

## ÉTAPE 2: Déploiement Backend sur Render

### 2.1 Préparer les Fichiers

#### A. Créer `render.yaml` (déjà fait normalement)

Créez `/app/render.yaml`:
```yaml
services:
  - type: web
    name: profiremanager-backend
    env: python
    region: oregon
    buildCommand: pip install -r backend/requirements.txt
    startCommand: cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
      - key: MONGO_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: SUPER_ADMIN_EMAIL
        value: gussdub@icloud.com
```

#### B. Vérifier `requirements.txt`

Assurez-vous que `/app/backend/requirements.txt` contient toutes les dépendances:
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
motor==3.3.2
pydantic==2.5.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
bcrypt==4.1.1
```

### 2.2 Déployer sur Render

1. **Se connecter** à [Render](https://dashboard.render.com)
2. **New** → **Web Service**
3. **Connect a repository**:
   - Si premier déploiement: Connecter votre compte GitHub
   - Sélectionner le dépôt ProFireManager
4. **Configuration**:
   - **Name**: `profiremanager-backend`
   - **Region**: Oregon (US West)
   - **Branch**: `main` (ou votre branche principale)
   - **Root Directory**: `.` (racine)
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT`
5. **Instance Type**: Free
6. **Advanced** → **Environment Variables**:
   - Cliquer **Add Environment Variable**
   
   Ajouter:
   ```
   Key: MONGO_URL
   Value: mongodb+srv://profiremanager_admin:VOTRE_MOT_DE_PASSE@profiremanager-prod.xxxxx.mongodb.net/profiremanager?retryWrites=true&w=majority
   ```
   
   ```
   Key: JWT_SECRET
   Value: [Générer une clé aléatoire longue, ex: openssl rand -hex 32]
   ```
   
   ```
   Key: SUPER_ADMIN_EMAIL
   Value: gussdub@icloud.com
   ```

7. **Create Web Service**

### 2.3 Attendre le Déploiement

- Le build prend 2-5 minutes
- Vous verrez les logs en temps réel
- Une fois terminé, vous aurez une URL: `https://profiremanager-backend.onrender.com`

### 2.4 Tester le Backend

Ouvrir dans le navigateur:
```
https://profiremanager-backend.onrender.com/docs
```

Vous devriez voir la documentation Swagger de l'API.

---

## ÉTAPE 3: Déploiement Frontend sur Vercel

### 3.1 Préparer la Configuration

#### A. Créer `vercel.json`

Créez `/app/vercel.json`:
```json
{
  "buildCommand": "cd frontend && yarn install && yarn build",
  "outputDirectory": "frontend/dist",
  "framework": "vite",
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

#### B. Mettre à jour `.env` Frontend

Créez `/app/frontend/.env.production`:
```env
REACT_APP_BACKEND_URL=https://profiremanager-backend.onrender.com
```

**⚠️ IMPORTANT**: Remplacez par VOTRE URL Render obtenue à l'étape 2.3

### 3.2 Déployer sur Vercel

#### Option A: Via Dashboard Vercel (Recommandé)

1. **Se connecter** à [Vercel](https://vercel.com/dashboard)
2. **Add New** → **Project**
3. **Import Git Repository**:
   - Connecter votre compte GitHub si nécessaire
   - Sélectionner le dépôt ProFireManager
4. **Configure Project**:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   - Cliquer **Add**
   ```
   Key: REACT_APP_BACKEND_URL
   Value: https://profiremanager-backend.onrender.com
   ```
   (Remplacez par VOTRE URL Render)

6. **Deploy**

#### Option B: Via CLI Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Se connecter
vercel login

# Déployer
cd /app/frontend
vercel --prod
```

Suivre les instructions:
- Set up: Yes
- Which scope: Votre compte
- Link to existing project: No
- Project name: profiremanager
- Directory: `./` (current)
- Override build command: `yarn build`
- Override output directory: `dist`

### 3.3 Obtenir l'URL de Production

Après déploiement réussi:
```
https://profiremanager.vercel.app
```

Ou votre domaine personnalisé si configuré.

---

## ÉTAPE 4: Configuration Finale

### 4.1 Configurer CORS sur le Backend

Le backend doit autoriser le frontend Vercel.

**Si nécessaire**, mettre à jour `/app/backend/server.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://profiremanager.vercel.app",  # Votre URL Vercel
        "https://votre-domaine.com"           # Si domaine personnalisé
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Redéployer le backend sur Render (automatique si GitHub connecté).

### 4.2 Initialiser les Données

#### A. Via Script (Recommandé)

Créez un endpoint temporaire dans `server.py`:

```python
@api_router.post("/admin/initialize-demo-data")
async def initialize_demo_data_endpoint():
    """Endpoint temporaire pour initialiser les données de démo"""
    try:
        await initialize_multi_tenant()
        return {"status": "success", "message": "Données initialisées"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Puis appelez-le via Postman ou curl:
```bash
curl -X POST https://profiremanager-backend.onrender.com/api/admin/initialize-demo-data
```

#### B. Via MongoDB Compass (Alternative)

1. Télécharger [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Se connecter avec votre connection string
3. Créer les collections manuellement
4. Importer les données depuis votre instance locale

---

## ÉTAPE 5: Tests Post-Déploiement

### 5.1 Vérifications Backend

✅ **API Docs accessible**:
```
https://profiremanager-backend.onrender.com/docs
```

✅ **Health Check**:
```bash
curl https://profiremanager-backend.onrender.com/api/health
```

✅ **Login Super-Admin**:
```bash
curl -X POST https://profiremanager-backend.onrender.com/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gussdub@icloud.com","password":"230685Juin+"}'
```

### 5.2 Vérifications Frontend

✅ **Site accessible**: `https://profiremanager.vercel.app`

✅ **Redirection vers /shefford**: Devrait fonctionner automatiquement

✅ **Login Shefford**:
1. Aller sur `/shefford`
2. Se connecter: `admin@firemanager.ca` / `admin123`
3. Vérifier que le dashboard s'affiche

✅ **Super-Admin**:
1. Se déconnecter
2. Se connecter: `gussdub@icloud.com` / `230685Juin+`
3. Vérifier le dashboard super-admin

### 5.3 Tests Multi-Tenant

✅ **Créer une nouvelle caserne**:
1. En super-admin, créer "Caserne de Test"
2. Slug: `test`
3. Accéder à `/test`
4. Vérifier l'isolation des données

---

## ÉTAPE 6: Domaine Personnalisé (Optionnel)

### 6.1 Configurer sur Vercel

1. **Vercel Dashboard** → Votre projet
2. **Settings** → **Domains**
3. **Add Domain**: `app.profiremanager.com`
4. Suivre les instructions DNS

### 6.2 Configurer les DNS

Chez votre registrar (ex: GoDaddy, Namecheap):

**Type A Record**:
```
Host: app
Value: 76.76.21.21 (IP Vercel)
```

**Type CNAME Record** (alternative):
```
Host: app
Value: cname.vercel-dns.com
```

### 6.3 Mettre à jour CORS

Ajouter votre domaine dans `allow_origins` du backend:
```python
allow_origins=[
    "https://app.profiremanager.com"
]
```

---

## ÉTAPE 7: Monitoring et Maintenance

### 7.1 Logs Backend (Render)

1. **Render Dashboard** → Votre service
2. **Logs** (en temps réel)
3. Surveiller les erreurs

### 7.2 Logs Frontend (Vercel)

1. **Vercel Dashboard** → Votre projet
2. **Deployments** → Sélectionner un déploiement
3. **View Function Logs**

### 7.3 Base de Données (MongoDB Atlas)

1. **MongoDB Atlas** → Votre cluster
2. **Metrics**: Utilisation, performance
3. **Backup**: Activé automatiquement (Free tier: daily)

---

## 📊 Checklist de Déploiement

### Avant le Déploiement
- [ ] MongoDB Atlas cluster créé
- [ ] Connection string obtenue
- [ ] Utilisateur database créé
- [ ] Accès réseau configuré (0.0.0.0/0)
- [ ] Code poussé sur GitHub

### Backend (Render)
- [ ] Service web créé
- [ ] Variables d'environnement configurées
- [ ] Build réussi
- [ ] API accessible (/docs)
- [ ] Données initialisées

### Frontend (Vercel)
- [ ] Projet déployé
- [ ] REACT_APP_BACKEND_URL configurée
- [ ] Build réussi
- [ ] Site accessible
- [ ] Routing fonctionne (/shefford, etc.)

### Tests
- [ ] Login super-admin fonctionne
- [ ] Login caserne fonctionne
- [ ] Dashboard affiche les données
- [ ] Multi-tenant isolé
- [ ] Création de caserne OK
- [ ] Tous les modules accessibles

---

## 🚨 Troubleshooting

### Erreur: Backend ne démarre pas sur Render

**Cause**: Dependencies manquantes

**Solution**:
1. Vérifier `requirements.txt` complet
2. Check logs Render
3. Tester localement: `pip install -r backend/requirements.txt`

### Erreur: Frontend ne se connecte pas au backend

**Cause**: CORS ou mauvaise URL

**Solutions**:
1. Vérifier `REACT_APP_BACKEND_URL` dans Vercel
2. Vérifier CORS dans `server.py`
3. Check console browser (F12) pour erreurs CORS

### Erreur: MongoDB connection failed

**Cause**: Connection string incorrecte

**Solutions**:
1. Vérifier le mot de passe (pas de <password>)
2. Vérifier le nom de la base: `/profiremanager`
3. Vérifier Network Access (0.0.0.0/0)
4. Tester la connection avec MongoDB Compass

### Erreur: 404 sur toutes les routes

**Cause**: Vercel routing mal configuré

**Solution**:
1. Vérifier `vercel.json` présent
2. Vérifier les rewrites configurés
3. Redéployer avec: `vercel --prod`

---

## 💰 Coûts Estimés

### Gratuit (Pour Démarrer)
- **MongoDB Atlas**: M0 (512MB) - GRATUIT
- **Render**: Free tier - GRATUIT (750h/mois)
- **Vercel**: Hobby plan - GRATUIT

**Limitations Free Tier**:
- Render: Services s'endorment après 15min inactivité (temps de réveil: 30s)
- Vercel: Limites de bande passante (100GB/mois)
- MongoDB: Limite de stockage (512MB)

### Plans Payants (Recommandés pour Production)
- **MongoDB Atlas**: M10 ($57/mois) - 10GB, pas de limite connexions
- **Render**: Starter ($7/mois) - Pas de sommeil, SSL inclus
- **Vercel**: Pro ($20/mois) - Analytics, domaines illimités

**Total estimé production**: ~$84/mois

---

## 🔒 Sécurité Production

### À Faire Immédiatement

1. **Changer le mot de passe super-admin**:
   ```python
   # Dans MongoDB Atlas ou via API
   # Changer de "230685Juin+" vers un mot de passe fort
   ```

2. **Générer un JWT_SECRET fort**:
   ```bash
   openssl rand -hex 32
   ```

3. **Activer HTTPS uniquement** (déjà fait par défaut sur Vercel/Render)

4. **Configurer les limites de rate**:
   ```python
   # Dans server.py
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   
   @app.post("/auth/login")
   @limiter.limit("5/minute")
   async def login(...):
   ```

5. **Backups MongoDB**:
   - Atlas Free: Daily automated
   - Configurer des exports manuels réguliers

---

## 📚 Ressources

### Documentation
- [Render Python Guide](https://render.com/docs/deploy-fastapi)
- [Vercel Vite Guide](https://vercel.com/docs/frameworks/vite)
- [MongoDB Atlas](https://docs.atlas.mongodb.com/)

### Support
- Render: support@render.com
- Vercel: support@vercel.com
- MongoDB: support@mongodb.com

---

## ✅ Déploiement Réussi!

Une fois tout complété, votre application sera:
- 🌍 **Accessible mondialement**
- 🔒 **Sécurisée** (HTTPS, JWT, isolation multi-tenant)
- ⚡ **Performante** (CDN Vercel)
- 💾 **Sauvegardée** (Backups Atlas)
- 📈 **Scalable** (Augmenter les tiers selon besoins)

**ProFireManager est maintenant en production! 🎉🚀**
