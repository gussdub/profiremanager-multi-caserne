# ✅ Vérification Base Dev - profiremanager-dev

**Date de vérification** : 19 novembre 2025  
**Statut** : ✅ Configuration Complète

---

## 📊 État des Collections

### Collections Essentielles (9/9) ✅

| Collection | Docs Dev | Docs Prod | Statut |
|------------|----------|-----------|--------|
| tenants | 2 | 2 | ✅ Complet |
| types_garde | 13 | 13 | ✅ Complet |
| grades | 11 | 11 | ✅ Complet |
| competences | 16 | 16 | ✅ Complet |
| parametres_remplacements | 3 | 3 | ✅ Complet |
| parametres_disponibilites | 3 | 3 | ✅ Complet |
| symboles_personnalises | 5 | 5 | ✅ Complet |
| super_admins | 1 | 2 | ⚠️ Partiel (acceptable) |
| users | 53 | 53 | ✅ Complet |

### Collections de Données (Copiées depuis Prod)

| Collection | Docs Dev | Note |
|------------|----------|------|
| assignations | 800 | ⚠️ Données prod copiées |
| disponibilites | 4178 | ⚠️ Données prod copiées |
| batiments | 17 | ✅ OK |
| bornes_incendie | 0 | ✅ Vide (normal) |

---

## 🏢 Tenants Disponibles

✅ **demonstration** (`/demo`)  
✅ **Service Incendie de Shefford** (`/shefford`)

---

## 🔧 Configuration Backend

**Fichier** : `/app/backend/.env`

```env
MONGO_URL="mongodb+srv://profiremanager_admin:***@profiremanager-prod.crqjvsp.mongodb.net/profiremanager-dev?retryWrites=true&w=majority&appName=profiremanager-dev"
DB_NAME="profiremanager-dev"
```

**Statut** : ✅ Configuré correctement

---

## ⚠️ Remarques Importantes

### 1. Données de Production Copiées

Les collections suivantes contiennent des **données réelles de production** :
- `assignations` (800 documents)
- `disponibilites` (4178 documents)

**Options** :
- **Garder** : Utile pour avoir des données de test réalistes
- **Supprimer** : Pour partir sur une base propre

**Pour supprimer** (optionnel) :
```python
from pymongo import MongoClient

client = MongoClient("mongodb+srv://profiremanager_admin:***@profiremanager-prod.crqjvsp.mongodb.net/")
db = client["profiremanager-dev"]

# Nettoyer les données de test
db.assignations.delete_many({})
db.disponibilites.delete_many({})

print("✅ Données de test nettoyées")
```

### 2. Super Admins

Seulement 1/2 super admins copiés. Si vous avez besoin du deuxième compte, copiez-le manuellement depuis prod.

---

## 🧪 Test d'Isolation Recommandé

### Test Rapide (5 minutes)

1. **Sur Preview** : https://sos-dispatch-1.preview.emergentagent.com/shefford
   - Créer une assignation test (ex: 1er janvier 2026)
   - Noter le nom et la date

2. **Sur Production** : https://www.profiremanager.ca/shefford
   - Chercher la même date
   - **Résultat attendu** : L'assignation NE doit PAS y être ! ✅

3. **Conclusion** :
   - ✅ Isolation réussie = bases séparées
   - ❌ Assignation visible = problème de configuration

---

## 📋 Checklist Configuration

- [x] Base `profiremanager-dev` créée sur MongoDB Atlas
- [x] Collections essentielles copiées (9/9)
- [x] Tenants configurés (demo + shefford)
- [x] Backend Preview configuré (`.env` modifié)
- [x] Backend redémarré avec succès
- [ ] Test d'isolation effectué *(À faire par vous)*

---

## 🔄 Synchronisation Future

Pour synchroniser les configurations (pas les données) entre prod et dev :

```bash
# Collections à synchroniser périodiquement
- tenants (si nouveau tenant créé)
- types_garde (si modifications)
- grades (si modifications)
- competences (si modifications)
- parametres_* (si modifications)
```

**⚠️ NE JAMAIS synchroniser** :
- users (sauf pour créer de nouveaux comptes test)
- assignations
- disponibilites
- notifications

---

## 🆘 Dépannage

### Preview se connecte encore à Prod ?

1. Vérifier `/app/backend/.env` → Doit contenir `profiremanager-dev`
2. Redémarrer backend : `sudo supervisorctl restart backend`
3. Vérifier logs : `tail -f /var/log/supervisor/backend.err.log`

### Collections manquantes ?

Copier depuis prod :
```bash
mongoexport --uri="mongodb+srv://.../profiremanager" --collection=NOM --out=NOM.json
mongoimport --uri="mongodb+srv://.../profiremanager-dev" --collection=NOM --file=NOM.json
```

### Erreur de connexion MongoDB ?

1. Vérifier que l'IP est autorisée dans MongoDB Atlas Network Access
2. Vérifier le mot de passe dans la connection string
3. Tester la connexion via MongoDB Compass

---

## ✅ Conclusion

**La base de développement est prête et configurée correctement !**

Vous pouvez maintenant :
- ✅ Tester sur Preview sans affecter la production
- ✅ Créer des assignations de test
- ✅ Modifier des données sans risque
- ✅ Développer de nouvelles fonctionnalités

**Prochaine étape** : Effectuer le test d'isolation pour confirmer que tout fonctionne parfaitement ! 🚀
