# Phase 2 - Progression

## ✅ Routes migrées et testées

### Module Users (5 routes) - COMPLET ✅
- `POST /{tenant_slug}/users` - Créer utilisateur
- `GET /{tenant_slug}/users` - Liste utilisateurs  
- `GET /{tenant_slug}/users/{user_id}` - Détails utilisateur
- `PUT /{tenant_slug}/users/{user_id}` - Modifier utilisateur
- `DELETE /{tenant_slug}/users/{user_id}` - Supprimer utilisateur

### Module Types de Garde (4 routes) - COMPLET ✅
- `POST /{tenant_slug}/types-garde` - Créer type de garde
- `GET /{tenant_slug}/types-garde` - Liste types de garde
- `PUT /{tenant_slug}/types-garde/{id}` - Modifier type de garde
- `DELETE /{tenant_slug}/types-garde/{id}` - Supprimer type de garde

### Module Planning & Assignations (4 routes) - COMPLET ✅
- `GET /{tenant_slug}/planning/{semaine_debut}` - Récupérer planning
- `DELETE /{tenant_slug}/planning/assignation/{id}` - Retirer assignation
- `POST /{tenant_slug}/planning/assignation` - Créer assignation
- `GET /{tenant_slug}/planning/assignations/{semaine_debut}` - Liste assignations

### Module Formations (4 routes) - COMPLET ✅
- `POST /{tenant_slug}/formations` - Créer formation
- `GET /{tenant_slug}/formations` - Liste formations
- `PUT /{tenant_slug}/formations/{id}` - Modifier formation
- `DELETE /{tenant_slug}/formations/{id}` - Supprimer formation

### Module Remplacements (2 routes) - COMPLET ✅
- `POST /{tenant_slug}/remplacements` - Créer demande de remplacement
- `GET /{tenant_slug}/remplacements` - Liste demandes

### Module Disponibilités (4 routes) - COMPLET ✅
- `POST /{tenant_slug}/disponibilites` - Créer disponibilité
- `GET /{tenant_slug}/disponibilites/{user_id}` - Liste disponibilités utilisateur
- `PUT /{tenant_slug}/disponibilites/{user_id}` - Mettre à jour disponibilités
- `DELETE /{tenant_slug}/disponibilites/{id}` - Supprimer disponibilité

### Module Sessions de formation (4 routes) - COMPLET ✅
- `POST /{tenant_slug}/sessions-formation` - Créer session
- `GET /{tenant_slug}/sessions-formation` - Liste sessions
- `POST /{tenant_slug}/sessions-formation/{id}/inscription` - S'inscrire
- `DELETE /{tenant_slug}/sessions-formation/{id}/desinscription` - Se désinscrire

### Module Demandes de congé (3 routes) - COMPLET ✅
- `POST /{tenant_slug}/demandes-conge` - Créer demande
- `GET /{tenant_slug}/demandes-conge` - Liste demandes
- `PUT /{tenant_slug}/demandes-conge/{id}/approuver` - Approuver/refuser

### Module Notifications (4 routes) - COMPLET ✅
- `GET /{tenant_slug}/notifications` - Liste notifications
- `GET /{tenant_slug}/notifications/non-lues/count` - Compteur non lues
- `PUT /{tenant_slug}/notifications/{id}/marquer-lu` - Marquer lue
- `PUT /{tenant_slug}/notifications/marquer-toutes-lues` - Marquer toutes lues

### Module Auth/Me & Profil (2 routes) - COMPLET ✅
- `GET /{tenant_slug}/auth/me` - Informations utilisateur connecté
- `PUT /{tenant_slug}/users/mon-profil` - Modifier son profil

### Module EPI (6 routes) - COMPLET ✅
- `POST /{tenant_slug}/epi` - Créer EPI
- `GET /{tenant_slug}/epi/employe/{employe_id}` - Liste EPI employé
- `GET /{tenant_slug}/epi/{epi_id}` - Détails EPI
- `PUT /{tenant_slug}/epi/{epi_id}` - Modifier EPI
- `DELETE /{tenant_slug}/epi/{epi_id}` - Supprimer EPI
- `POST /{tenant_slug}/epi/{epi_id}/inspection` - Ajouter inspection

**Total : 42/55 routes migrées (76%)**

---

## 📋 Routes restantes à migrer (46 routes)

### Planning & Assignations (6 routes)
```python
@api_router.get("/{tenant_slug}/planning/{semaine_debut}")
@api_router.post("/{tenant_slug}/planning/assignation")
@api_router.delete("/{tenant_slug}/planning/assignation/{id}")
@api_router.get("/{tenant_slug}/planning/assignations/{semaine_debut}")
@api_router.post("/{tenant_slug}/planning/attribution-automatique")
@api_router.get("/{tenant_slug}/planning/statistiques")
```

### Formations (6 routes)
```python
@api_router.post("/{tenant_slug}/formations")
@api_router.get("/{tenant_slug}/formations")
@api_router.put("/{tenant_slug}/formations/{id}")
@api_router.delete("/{tenant_slug}/formations/{id}")
@api_router.get("/{tenant_slug}/formations/{id}/participants")
@api_router.post("/{tenant_slug}/formations/{id}/inscrire")
```

### Sessions de formation (5 routes)
```python
@api_router.post("/{tenant_slug}/sessions-formation")
@api_router.get("/{tenant_slug}/sessions-formation")
@api_router.put("/{tenant_slug}/sessions-formation/{id}")
@api_router.post("/{tenant_slug}/sessions-formation/{id}/inscrire")
@api_router.delete("/{tenant_slug}/sessions-formation/{id}")
```

### Remplacements (5 routes)
```python
@api_router.post("/{tenant_slug}/remplacements")
@api_router.get("/{tenant_slug}/remplacements")
@api_router.put("/{tenant_slug}/remplacements/{id}/accepter")
@api_router.put("/{tenant_slug}/remplacements/{id}/refuser")
@api_router.post("/{tenant_slug}/remplacements/{id}/recherche-automatique")
```

### Demandes de congé (4 routes)
```python
@api_router.post("/{tenant_slug}/demandes-conge")
@api_router.get("/{tenant_slug}/demandes-conge")
@api_router.put("/{tenant_slug}/demandes-conge/{id}/approuver")
@api_router.put("/{tenant_slug}/demandes-conge/{id}/refuser")
```

### Disponibilités (5 routes)
```python
@api_router.post("/{tenant_slug}/disponibilites")
@api_router.get("/{tenant_slug}/disponibilites/{user_id}")
@api_router.put("/{tenant_slug}/disponibilites/{id}")
@api_router.delete("/{tenant_slug}/disponibilites/{id}")
@api_router.post("/{tenant_slug}/disponibilites/bulk")
```

### Notifications (3 routes)
```python
@api_router.get("/{tenant_slug}/notifications")
@api_router.put("/{tenant_slug}/notifications/{id}/lire")
@api_router.get("/{tenant_slug}/notifications/non-lues/count")
```

### EPI (8 routes)
```python
@api_router.post("/{tenant_slug}/employee-epis")
@api_router.get("/{tenant_slug}/employee-epis")
@api_router.get("/{tenant_slug}/employee-epis/{employee_id}")
@api_router.PUT("/{tenant_slug}/employee-epis/{id}")
@api_router.delete("/{tenant_slug}/employee-epis/{id}")
@api_router.post("/{tenant_slug}/employee-epis/{id}/inspection")
@api_router.get("/{tenant_slug}/epi-stats")
@api_router.get("/{tenant_slug}/epi-expirations")
```

### Rapports (3 routes)
```python
@api_router.get("/{tenant_slug}/rapports/pdf")
@api_router.get("/{tenant_slug}/rapports/excel")
@api_router.get("/{tenant_slug}/rapports/stats")
```

### Paramètres (4 routes)
```python
@api_router.get("/{tenant_slug}/parametres/remplacements")
@api_router.put("/{tenant_slug}/parametres/remplacements")
@api_router.get("/{tenant_slug}/parametres/disponibilites")
@api_router.put("/{tenant_slug}/parametres/disponibilites")
```

---

## 🎯 Comment continuer

Pour chaque route, suivre ce template :

### 1. Ajouter tenant_slug au path et paramètres
```python
# AVANT
@api_router.get("/resource")
async def get_resource(current_user: User = Depends(get_current_user)):

# APRÈS  
@api_router.get("/{tenant_slug}/resource")
async def get_resource(tenant_slug: str, current_user: User = Depends(get_current_user)):
```

### 2. Vérifier le tenant
```python
tenant = await get_tenant_from_slug(tenant_slug)
```

### 3. Filtrer TOUTES les requêtes DB par tenant_id
```python
# FIND
resources = await db.resources.find({"tenant_id": tenant.id}).to_list(1000)

# FIND_ONE  
resource = await db.resources.find_one({"id": resource_id, "tenant_id": tenant.id})

# INSERT
data = resource.dict()
data["tenant_id"] = tenant.id
await db.resources.insert_one(data)

# UPDATE
await db.resources.update_one(
    {"id": resource_id, "tenant_id": tenant.id},
    {"$set": updates}
)

# DELETE
await db.resources.delete_one({"id": resource_id, "tenant_id": tenant.id})
```

---

## 🧪 Tests après migration

```bash
# 1. Login Shefford
TOKEN=$(curl -s -X POST http://localhost:8001/api/shefford/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@firemanager.ca","mot_de_passe":"admin123"}' \
  | jq -r '.access_token')

# 2. Tester la route migrée
curl -X GET http://localhost:8001/api/shefford/users \
  -H "Authorization: Bearer $TOKEN"

# 3. Vérifier isolation (si Bromont existe)
curl -X GET http://localhost:8001/api/bromont/users \
  -H "Authorization: Bearer $BROMONT_TOKEN"  # Doit être vide ou erreur 404
```

---

## ⚠️ Points critiques

1. **Ne JAMAIS oublier** `{"tenant_id": tenant.id}` dans les requêtes DB
2. **Toujours filtrer** par tenant_id dans les find_one, update_one, delete_one
3. **Assigner tenant_id** dans tous les insert_one
4. **Vérifier les relations** : si une ressource référence une autre, les deux doivent être du même tenant

---

## 📊 Estimation

- ✅ Complété : 9 routes (16%)
- ⏳ Restant : 46 routes (84%)
- ⏱️ Temps estimé restant : 3-4 heures

---

## 🚀 Prochaine session

Session 2 recommandée pour :
1. Migrations & Assignations (priorité haute)
2. Formations (priorité haute)
3. Remplacements (priorité haute)

Cela représentera environ 17 routes supplémentaires (total : 26/55 = 47%).
