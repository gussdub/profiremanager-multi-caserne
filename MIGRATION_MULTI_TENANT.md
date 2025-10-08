# Migration Multi-Tenant - ProFireManager

## 📋 Vue d'ensemble

Cette migration transforme ProFireManager d'une application single-tenant en une application multi-tenant (SaaS) permettant de gérer plusieurs casernes indépendantes.

## 🏗️ Architecture

### URLs
- `/shefford/*` → Caserne de Shefford
- `/bromont/*` → Caserne de Bromont  
- `/admin/*` → Interface Super-Admin

### Structure Base de Données
- **Une seule base de données MongoDB**
- Toutes les collections contiennent `tenant_id`
- Isolation des données par filtrage automatique

## ✅ Modifications effectuées

### Backend (server.py)

#### 1. Nouveaux modèles créés
- [x] `Tenant` - Représente une caserne
- [x] `TenantCreate` - Création de caserne
- [x] `SuperAdmin` - Super administrateur
- [x] `SuperAdminLogin` - Login super admin

#### 2. Modèles modifiés (ajout tenant_id)
- [x] `User`, `UserCreate`
- [x] `TypeGarde`
- [x] `Assignation`, `AssignationCreate`
- [x] `DemandeRemplacement`
- [x] `Formation`, `FormationCreate`
- [x] `Disponibilite`, `DisponibiliteCreate`
- [ ] `SessionFormation` (à faire)
- [ ] `InscriptionFormation` (à faire)
- [ ] `DemandeCongé` (à faire)
- [ ] `Notification` (à faire)
- [ ] `ParametresRemplacements` (à faire)
- [ ] `EPIEmploye` (à faire)
- [ ] `InspectionEPI` (à faire)

#### 3. Middleware et dépendances
- [ ] Créer `get_tenant_from_path()` - Extrait le tenant du path
- [ ] Créer `get_current_tenant()` - Dépendance FastAPI pour le tenant
- [ ] Modifier `get_current_user()` - Ajouter vérification tenant
- [ ] Créer `get_super_admin()` - Authentification super admin

#### 4. Routes à modifier
Toutes les routes doivent :
1. Accepter `{tenant_slug}` dans le path
2. Utiliser `get_current_tenant()` en dépendance
3. Filtrer par `tenant_id` dans toutes les requêtes DB

##### Routes prioritaires :
- [ ] `/auth/login` → `/{tenant_slug}/api/auth/login`
- [ ] `/users` → `/{tenant_slug}/api/users`
- [ ] `/types-garde` → `/{tenant_slug}/api/types-garde`
- [ ] `/assignations` → `/{tenant_slug}/api/assignations`

#### 5. Routes Super-Admin à créer
- [ ] `POST /admin/api/auth/login` - Login super admin
- [ ] `POST /admin/api/tenants` - Créer caserne
- [ ] `GET /admin/api/tenants` - Lister casernes
- [ ] `PUT /admin/api/tenants/{id}` - Modifier caserne
- [ ] `DELETE /admin/api/tenants/{id}` - Désactiver caserne
- [ ] `GET /admin/api/stats` - Statistiques globales

### Frontend (App.js)

#### 1. Détection et routing
- [ ] Extraire tenant depuis `window.location.pathname`
- [ ] Créer `TenantContext` pour stocker le tenant
- [ ] Router :
  - `/{tenant}/` → Application tenant
  - `/admin/*` → Interface super-admin

#### 2. API calls
- [ ] Modifier toutes les calls pour inclure `/${tenant}/api/...`
- [ ] Gérer les erreurs tenant non trouvé

#### 3. Interface Super-Admin
- [ ] Page login super-admin
- [ ] Dashboard super-admin
- [ ] Liste des casernes
- [ ] Formulaire création/modification caserne
- [ ] Statistiques globales

## 📝 Script de migration pour production

```javascript
// À exécuter dans MongoDB Shell de production

// 1. Créer le tenant Shefford
db.tenants.insertOne({
  id: "shefford-001",
  slug: "shefford",
  nom: "Service Incendie de Shefford",
  adresse: "",
  ville: "Shefford",
  province: "QC",
  actif: true,
  date_creation: new Date()
});

// 2. Ajouter tenant_id à toutes les collections existantes
db.users.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.assignations.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.types_garde.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.formations.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.disponibilites.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.demandes_remplacement.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.sessions_formation.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.inscriptions_formation.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.demandes_conge.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.notifications.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.employee_epis.updateMany({}, {$set: {tenant_id: "shefford-001"}});
db.inspections_epi.updateMany({}, {$set: {tenant_id: "shefford-001"}});

// 3. Créer le super admin
db.super_admins.insertOne({
  id: "superadmin-001",
  email: "gussdub@icloud.com",
  nom: "Super Admin",
  mot_de_passe_hash: "$2b$12$...",  // Hash de 230685Juin+
  created_at: new Date()
});

// 4. Vérification
print("Users avec tenant_id:", db.users.countDocuments({tenant_id: {$exists: true}}));
print("Assignations avec tenant_id:", db.assignations.countDocuments({tenant_id: {$exists: true}}));
```

## 🚀 Plan d'exécution

### Phase 1 : Backend Core (En cours)
1. ✅ Créer modèles Tenant et SuperAdmin
2. ✅ Ajouter tenant_id aux principaux modèles
3. ⏳ Terminer l'ajout de tenant_id à tous les modèles
4. ⏳ Créer middleware et dépendances
5. ⏳ Modifier routes auth et users

### Phase 2 : Backend Routes
6. Modifier toutes les autres routes
7. Créer routes Super-Admin
8. Tests d'isolation des données

### Phase 3 : Frontend
9. Détection tenant et routing
10. Modification des API calls
11. Interface Super-Admin

### Phase 4 : Déploiement
12. Tests locaux complets
13. Documentation migration production
14. Script de migration production
15. Déploiement et migration

## ⚠️ Points critiques de sécurité

1. **Isolation des données** : Chaque requête DOIT filtrer par tenant_id
2. **Validation tenant** : Vérifier que l'utilisateur appartient bien au tenant
3. **Super-admin séparé** : Ne peut pas être utilisateur d'une caserne
4. **Token JWT** : Inclure tenant_id dans les tokens

## 📊 Estimation temps

- Phase 1 : 2-3 heures (en cours)
- Phase 2 : 3-4 heures  
- Phase 3 : 2-3 heures
- Phase 4 : 1-2 heures

**Total estimé : 8-12 heures de développement**

## 🧪 Tests requis

- [ ] Isolation complète des données entre tenants
- [ ] Login tenant A ne doit pas voir données tenant B
- [ ] Super-admin peut gérer tous les tenants
- [ ] Création/suppression de tenant
- [ ] Migration des données existantes

## 📞 Support

Pour toute question : gussdub@icloud.com
