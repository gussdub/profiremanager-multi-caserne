# ⚡ Démarrage Rapide - Déploiement en 30 Minutes

## 🎯 Vue d'Ensemble

```
1. MongoDB Atlas (10 min) → Base de données
2. Render (10 min)        → Backend API
3. Vercel (10 min)        → Frontend
```

---

## ÉTAPE 1: MongoDB Atlas (10 min)

### Actions Rapides

1. **Créer compte** → [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. **Build Database** → M0 (Free) → AWS → Region proche
3. **Database Access** → Add User:
   - Username: `profiremanager_admin`
   - Password: [Générer et NOTER]
4. **Network Access** → Add IP: `0.0.0.0/0`
5. **Connect** → Drivers → Python → Copier la string:
   ```
   mongodb+srv://profiremanager_admin:MOT_DE_PASSE@cluster.xxxxx.mongodb.net/profiremanager?retryWrites=true&w=majority
   ```

✅ **Connection String prête!**

---

## ÉTAPE 2: Render (10 min)

### Actions Rapides

1. **Créer compte** → [Render](https://render.com)
2. **New** → **Web Service**
3. **Connect GitHub** → Sélectionner repo ProFireManager
4. **Configuration**:
   ```
   Name: profiremanager-backend
   Build Command: pip install -r backend/requirements.txt
   Start Command: cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT
   ```
5. **Environment Variables** (Advanced):
   ```
   MONGO_URL = [Votre connection string MongoDB]
   JWT_SECRET = [Générer: openssl rand -hex 32]
   SUPER_ADMIN_EMAIL = gussdub@icloud.com
   ```
6. **Create Web Service**

⏳ Attendre 3-5 minutes...

✅ **Backend déployé**: `https://profiremanager-backend.onrender.com`

### Test Rapide
```
https://profiremanager-backend.onrender.com/docs
```
→ Devrait afficher Swagger UI

---

## ÉTAPE 3: Vercel (10 min)

### Actions Rapides

1. **Créer compte** → [Vercel](https://vercel.com)
2. **Import Project** → Sélectionner repo ProFireManager
3. **Configuration**:
   ```
   Framework Preset: Vite
   Root Directory: frontend
   Build Command: yarn build
   Output Directory: dist
   ```
4. **Environment Variables**:
   ```
   REACT_APP_BACKEND_URL = https://profiremanager-backend.onrender.com
   ```
   ⚠️ Remplacer par VOTRE URL Render!

5. **Deploy**

⏳ Attendre 2-3 minutes...

✅ **Frontend déployé**: `https://profiremanager.vercel.app`

---

## ÉTAPE 4: Initialisation (5 min)

### Via Postman ou curl

```bash
curl -X POST https://profiremanager-backend.onrender.com/api/admin/initialize-demo-data
```

OU créer l'endpoint temporairement dans `server.py`:
```python
@api_router.post("/admin/initialize-demo-data")
async def initialize_demo():
    await initialize_multi_tenant()
    return {"status": "success"}
```

---

## ÉTAPE 5: Test Final (5 min)

### 1. Super-Admin

URL: `https://profiremanager.vercel.app`

```
Email: gussdub@icloud.com
Mot de passe: 230685Juin+
```

✅ Dashboard super-admin devrait s'afficher

### 2. Caserne Shefford

URL: `https://profiremanager.vercel.app/shefford`

```
Email: admin@firemanager.ca
Mot de passe: admin123
```

✅ Dashboard Shefford devrait s'afficher

---

## 🚨 Dépannage Rapide

### Backend ne démarre pas
```bash
# Check logs Render Dashboard
# Vérifier requirements.txt complet
```

### Frontend 404 partout
```bash
# Vérifier vercel.json présent à la racine
# Redéployer: vercel --prod
```

### Cannot connect to MongoDB
```bash
# Vérifier mot de passe dans connection string
# Vérifier Network Access: 0.0.0.0/0
# Tester avec MongoDB Compass
```

### CORS Error
```python
# Dans server.py, ajouter dans allow_origins:
"https://profiremanager.vercel.app",
"https://votre-domaine.com"
```

---

## 📋 Checklist Finale

- [ ] MongoDB Atlas créé et accessible
- [ ] Backend Render déployé et /docs fonctionne
- [ ] Frontend Vercel déployé et accessible
- [ ] Variables d'environnement configurées
- [ ] Données initialisées
- [ ] Login super-admin OK
- [ ] Login caserne OK
- [ ] Tous les modules fonctionnent

---

## 🎉 C'est Terminé!

Votre application est maintenant en ligne et accessible mondialement!

**URLs**:
- Frontend: `https://profiremanager.vercel.app`
- Backend: `https://profiremanager-backend.onrender.com`
- API Docs: `https://profiremanager-backend.onrender.com/docs`

**Prochaines étapes** (optionnel):
1. Configurer un domaine personnalisé
2. Mettre à jour le mot de passe super-admin
3. Créer vos vraies casernes
4. Inviter vos utilisateurs

---

## 💡 Conseils Production

### Performance
- Les services Render Free s'endorment après 15min
- Temps de réveil: ~30 secondes
- Considérer Render Starter ($7/mois) pour production

### Sécurité
✅ HTTPS activé automatiquement (Vercel & Render)
✅ JWT pour authentification
⚠️ Changer le mot de passe super-admin!
⚠️ Générer un JWT_SECRET fort unique

### Monitoring
- Render: Logs en temps réel dans dashboard
- Vercel: Analytics disponible
- MongoDB Atlas: Metrics de performance

---

**Besoin d'aide?**  
Consultez `GUIDE_DEPLOIEMENT_PRODUCTION.md` pour le guide complet détaillé.
