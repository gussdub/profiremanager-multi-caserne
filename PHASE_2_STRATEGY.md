# Phase 2 : Stratégie de migration des routes

## ✅ Routes déjà migrées (Module Users)

- `POST /{tenant_slug}/users` - Créer utilisateur
- `GET /{tenant_slug}/users` - Liste utilisateurs
- `GET /{tenant_slug}/users/{user_id}` - Détails utilisateur
- `PUT /{tenant_slug}/users/{user_id}` - Modifier utilisateur
- `DELETE /{tenant_slug}/users/{user_id}` - Supprimer utilisateur

## 📋 Routes à migrer (par priorité)

### Priorité 1 : Modules critiques (15 routes)

#### Types de Garde (4 routes)
- [ ] `POST /{tenant_slug}/types-garde`
- [ ] `GET /{tenant_slug}/types-garde`
- [ ] `PUT /{tenant_slug}/types-garde/{id}`
- [ ] `DELETE /{tenant_slug}/types-garde/{id}`

#### Planning & Assignations (5 routes)
- [ ] `GET /{tenant_slug}/planning/{semaine_debut}`
- [ ] `POST /{tenant_slug}/planning/assignation`
- [ ] `DELETE /{tenant_slug}/planning/assignation/{id}`
- [ ] `GET /{tenant_slug}/planning/assignations/{semaine_debut}`
- [ ] `POST /{tenant_slug}/planning/attribution-automatique`

#### Formations (4 routes)
- [ ] `POST /{tenant_slug}/formations`
- [ ] `GET /{tenant_slug}/formations`
- [ ] `PUT /{tenant_slug}/formations/{id}`
- [ ] `DELETE /{tenant_slug}/formations/{id}`

#### Demandes de remplacement (2 routes)
- [ ] `POST /{tenant_slug}/remplacements`
- [ ] `GET /{tenant_slug}/remplacements`

### Priorité 2 : Modules secondaires (20 routes)

#### Disponibilités (5 routes)
- [ ] `POST /{tenant_slug}/disponibilites`
- [ ] `GET /{tenant_slug}/disponibilites/{user_id}`
- [ ] `PUT /{tenant_slug}/disponibilites/{id}`
- [ ] `DELETE /{tenant_slug}/disponibilites/{id}`
- [ ] `POST /{tenant_slug}/disponibilites/bulk`

#### Sessions de formation (5 routes)
- [ ] `POST /{tenant_slug}/sessions-formation`
- [ ] `GET /{tenant_slug}/sessions-formation`
- [ ] `PUT /{tenant_slug}/sessions-formation/{id}`
- [ ] `POST /{tenant_slug}/sessions-formation/{id}/inscrire`
- [ ] `DELETE /{tenant_slug}/sessions-formation/{id}`

#### Demandes de congé (4 routes)
- [ ] `POST /{tenant_slug}/demandes-conge`
- [ ] `GET /{tenant_slug}/demandes-conge`
- [ ] `PUT /{tenant_slug}/demandes-conge/{id}/approuver`
- [ ] `PUT /{tenant_slug}/demandes-conge/{id}/refuser`

#### Notifications (3 routes)
- [ ] `GET /{tenant_slug}/notifications`
- [ ] `PUT /{tenant_slug}/notifications/{id}/lire`
- [ ] `GET /{tenant_slug}/notifications/non-lues/count`

#### Rapports (3 routes)
- [ ] `GET /{tenant_slug}/rapports/pdf`
- [ ] `GET /{tenant_slug}/rapports/excel`
- [ ] `GET /{tenant_slug}/rapports/stats`

### Priorité 3 : Modules EPI & paramètres (15 routes)

#### EPI (8 routes)
- [ ] `POST /{tenant_slug}/employee-epis`
- [ ] `GET /{tenant_slug}/employee-epis`
- [ ] `GET /{tenant_slug}/employee-epis/{employee_id}`
- [ ] `PUT /{tenant_slug}/employee-epis/{id}`
- [ ] `DELETE /{tenant_slug}/employee-epis/{id}`
- [ ] `POST /{tenant_slug}/employee-epis/{id}/inspection`
- [ ] `GET /{tenant_slug}/epi-stats`
- [ ] `GET /{tenant_slug}/epi-expirations`

#### Paramètres (4 routes)
- [ ] `GET /{tenant_slug}/parametres/remplacements`
- [ ] `PUT /{tenant_slug}/parametres/remplacements`
- [ ] `GET /{tenant_slug}/parametres/disponibilites`
- [ ] `PUT /{tenant_slug}/parametres/disponibilites`

#### Stats & Dashboard (3 routes)
- [ ] `GET /{tenant_slug}/stats/mensuelles`
- [ ] `GET /{tenant_slug}/stats/utilisateur/{user_id}`
- [ ] `GET /{tenant_slug}/dashboard`

---

## 🔧 Template de migration

Pour chaque route, appliquer ce pattern :

### AVANT :
```python
@api_router.get("/resource")
async def get_resource(current_user: User = Depends(get_current_user)):
    resources = await db.resources.find().to_list(1000)
    return resources
```

### APRÈS :
```python
@api_router.get("/{tenant_slug}/resource")
async def get_resource(tenant_slug: str, current_user: User = Depends(get_current_user)):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # Filtrer par tenant_id
    resources = await db.resources.find({"tenant_id": tenant.id}).to_list(1000)
    return resources
```

### Points clés :
1. Ajouter `tenant_slug: str` dans les paramètres
2. Appeler `tenant = await get_tenant_from_slug(tenant_slug)`
3. Ajouter `{"tenant_id": tenant.id}` dans TOUTES les requêtes DB
4. Pour les INSERT, ajouter `"tenant_id": tenant.id` dans le dict

---

## 🧪 Tests requis après chaque module migré

```bash
# Exemple pour types-garde
curl -X GET http://localhost:8001/api/shefford/types-garde \
  -H "Authorization: Bearer {TOKEN}"

# Vérifier isolation
curl -X GET http://localhost:8001/api/bromont/types-garde \
  -H "Authorization: Bearer {TOKEN}"  # Doit retourner liste vide si bromont existe
```

---

## ⚠️ Pièges à éviter

1. **Oublier de filtrer les relations** :
   ```python
   # ❌ MAUVAIS
   user = await db.users.find_one({"id": user_id})
   
   # ✅ BON
   user = await db.users.find_one({"id": user_id, "tenant_id": tenant.id})
   ```

2. **Oublier tenant_id dans les INSERT** :
   ```python
   # ❌ MAUVAIS
   await db.assignations.insert_one(assignation.dict())
   
   # ✅ BON
   data = assignation.dict()
   data["tenant_id"] = tenant.id
   await db.assignations.insert_one(data)
   ```

3. **Ne pas vérifier le tenant dans les updates/deletes** :
   ```python
   # ❌ MAUVAIS
   await db.users.update_one({"id": user_id}, {"$set": updates})
   
   # ✅ BON  
   await db.users.update_one(
       {"id": user_id, "tenant_id": tenant.id},
       {"$set": updates}
   )
   ```

---

## 📊 Progression

- ✅ Module Users : 5/5 routes
- ⏳ Modules restants : 0/50 routes

**Total : 5/55 routes migrées (9%)**
