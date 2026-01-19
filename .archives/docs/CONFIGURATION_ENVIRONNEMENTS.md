# Configuration des Environnements - ProFireManager

## 📋 Vue d'Ensemble

Ce document décrit la configuration des différents environnements pour ProFireManager.

---

## 🌍 Environnements

### **1. Production**
- **URL Frontend** : https://www.profiremanager.ca
- **URL Backend** : https://www.profiremanager.ca/api
- **Base de Données** : `profiremanager` (MongoDB Atlas - Cluster: profiremanager-prod)
- **Connection String** :
  ```
  mongodb+srv://profiremanager_admin:***@profiremanager-prod.crqjvsp.mongodb.net/profiremanager
  ```

### **2. Preview / Development**
- **URL Frontend** : https://payment-hub-136.preview.emergentagent.com
- **URL Backend** : https://payment-hub-136.preview.emergentagent.com/api
- **Base de Données** : `profiremanager-dev` (MongoDB Atlas - Cluster: profiremanager-prod)
- **Connection String** :
  ```
  mongodb+srv://profiremanager_admin:***@profiremanager-prod.crqjvsp.mongodb.net/profiremanager-dev
  ```

### **3. Local**
- **URL Frontend** : http://localhost:3000
- **URL Backend** : http://localhost:8001
- **Base de Données** : `profiremanager-dev` (Partagée avec Preview pour tests)

---

## ⚠️ Important : Isolation des Données

### ✅ AVANT (PROBLÈME)
```
Preview → profiremanager (PROD) ❌
Production → profiremanager (PROD) ❌
└─ Même base de données = modifications en temps réel !
```

### ✅ APRÈS (SOLUTION)
```
Preview → profiremanager-dev ✅
Production → profiremanager ✅
└─ Bases séparées = isolation complète !
```

---

## 🔧 Configuration Fichiers

### **Backend `.env` (Preview/Dev)**
```env
MONGO_URL="mongodb+srv://profiremanager_admin:BsqKibVAy6FTiTxg@profiremanager-prod.crqjvsp.mongodb.net/profiremanager-dev?retryWrites=true&w=majority&appName=profiremanager-dev"
DB_NAME="profiremanager-dev"
CORS_ORIGINS="*"
SENDGRID_API_KEY="your-sendgrid-key-here"
RESEND_API_KEY="re_6BuFZ8Ut_PNXyQuTA3m9jrCLdmaKRa51A"
SENDER_EMAIL="noreply@profiremanager.ca"
FRONTEND_URL="https://payment-hub-136.preview.emergentagent.com"
```

### **Backend `.env` (Production)**
```env
MONGO_URL="mongodb+srv://profiremanager_admin:***@profiremanager-prod.crqjvsp.mongodb.net/profiremanager?retryWrites=true&w=majority&appName=profiremanager-prod"
DB_NAME="profiremanager"
CORS_ORIGINS="https://www.profiremanager.ca"
SENDGRID_API_KEY="your-sendgrid-key-here"
RESEND_API_KEY="re_6BuFZ8Ut_PNXyQuTA3m9jrCLdmaKRa51A"
SENDER_EMAIL="noreply@profiremanager.ca"
FRONTEND_URL="https://www.profiremanager.ca"
```

---

## 📊 Collections MongoDB Importantes

### Collections Partagées (Dev/Prod)
Ces collections doivent être synchronisées entre dev et prod :
- `tenants` - Configuration des tenants
- `grades` - Grades des pompiers
- `competences` - Compétences requises
- `types_garde` - Types de gardes
- `parametres_remplacements` - Paramètres globaux
- `parametres_validation_planning` - Paramètres de validation

### Collections Spécifiques à l'Environnement
Ces collections sont différentes entre dev et prod :
- `users` - Utilisateurs (ne pas synchroniser prod → dev pour sécurité)
- `assignations` - Assignations de gardes
- `disponibilites` - Disponibilités des pompiers
- `formations` - Formations
- `notifications` - Notifications

---

## 🔄 Synchronisation Dev ↔ Prod

### Copier Structure de Prod vers Dev (Safe)
```bash
# Collections de configuration uniquement
mongodump --uri="mongodb+srv://..../profiremanager" \
  --collection=tenants \
  --collection=grades \
  --collection=competences \
  --collection=types_garde \
  --out=./config-backup

mongorestore --uri="mongodb+srv://..../profiremanager-dev" \
  --drop \
  ./config-backup/profiremanager
```

### ⚠️ NE JAMAIS faire l'inverse (Dev → Prod)
Les données de test ne doivent JAMAIS écraser la production !

---

## 🧪 Tests Recommandés

### Après Configuration
1. ✅ Se connecter sur Preview → Vérifier que les tenants existent
2. ✅ Créer une assignation de test sur Preview
3. ✅ Vérifier sur Production → L'assignation NE doit PAS apparaître
4. ✅ Vérifier dans MongoDB Atlas → 2 bases distinctes

### Tests Réguliers
- Vérifier que les modifications Preview n'affectent pas Production
- Synchroniser périodiquement les configurations (tenants, types de garde, etc.)
- Créer des utilisateurs de test spécifiques pour Preview

---

## 📝 Notes Importantes

1. **Mot de Passe MongoDB** : Le mot de passe est partagé entre les deux bases car elles sont sur le même cluster. Considérez de créer un utilisateur séparé pour dev si nécessaire.

2. **Coût** : Les deux bases sont sur le même cluster gratuit M0, donc pas de coût supplémentaire tant que la taille totale reste < 512 MB.

3. **Backup** : Configurez des backups automatiques pour la base de production uniquement.

4. **Monitoring** : Utilisez MongoDB Atlas monitoring pour surveiller l'utilisation des deux bases.

---

## 🆘 Dépannage

### Preview se connecte toujours à Prod
- Vérifier que `backend/.env` contient bien `profiremanager-dev`
- Redémarrer le backend : `sudo supervisorctl restart backend`
- Vérifier les logs : `tail -f /var/log/supervisor/backend.err.log`

### Base de données vide sur Dev
- Importer les collections de configuration depuis Prod (voir section Synchronisation)
- Créer des utilisateurs de test manuellement

### Erreurs de connexion MongoDB
- Vérifier que l'IP de Preview est autorisée dans MongoDB Atlas Network Access
- Vérifier que le mot de passe est correct dans la connection string

---

**Date de configuration** : 19 novembre 2025
**Configuré par** : Assistant IA
**Environnement cible** : Preview/Dev isolé de Production
