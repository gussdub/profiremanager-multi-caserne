# Phase 2 - Routes restantes à migrer

## ✅ Progression actuelle : 34/55 routes (62%)

### 🎉 Modules complétés
1. ✅ Users (5 routes)
2. ✅ Types de Garde (4 routes)
3. ✅ Planning & Assignations (4 routes)
4. ✅ Formations (4 routes)
5. ✅ Remplacements (2 routes)
6. ✅ Disponibilités (4 routes)
7. ✅ Sessions de formation (4 routes)
8. ✅ Demandes de congé (3 routes)
9. ✅ Notifications (4 routes)

---

## 📋 Routes restantes : 21 routes (38%)

### Module EPI (8 routes)
```python
@api_router.post("/{tenant_slug}/employee-epis")
@api_router.get("/{tenant_slug}/employee-epis")
@api_router.get("/{tenant_slug}/employee-epis/{employee_id}")
@api_router.get("/{tenant_slug}/employee-epis/{employee_id}/items/{item_id}")
@api_router.put("/{tenant_slug}/employee-epis/{employee_id}/items/{item_id}")
@api_router.delete("/{tenant_slug}/employee-epis/{employee_id}/items/{item_id}")
@api_router.post("/{tenant_slug}/employee-epis/{id}/inspection")
@api_router.get("/{tenant_slug}/epi-stats")
```

**Localisation dans le code :**
- Chercher : `@api_router.*employee-epi`
- Lignes estimées : 3200-3400

**Pattern à appliquer :**
```python
# AVANT
@api_router.get("/employee-epis")
async def get_epis(current_user: User = Depends(get_current_user)):
    epis = await db.employee_epis.find().to_list(1000)

# APRÈS
@api_router.get("/{tenant_slug}/employee-epis")
async def get_epis(tenant_slug: str, current_user: User = Depends(get_current_user)):
    tenant = await get_tenant_from_slug(tenant_slug)
    epis = await db.employee_epis.find({"tenant_id": tenant.id}).to_list(1000)
```

---

### Module Paramètres (4 routes)
```python
@api_router.get("/{tenant_slug}/parametres/remplacements")
@api_router.put("/{tenant_slug}/parametres/remplacements")
@api_router.get("/{tenant_slug}/parametres/disponibilites")
@api_router.put("/{tenant_slug}/parametres/disponibilites")
```

**Localisation :**
- Chercher : `@api_router.*parametres`
- Lignes estimées : 3560-3650

---

### Module Rapports & Stats (6 routes)
```python
@api_router.get("/{tenant_slug}/rapports/pdf")
@api_router.get("/{tenant_slug}/rapports/excel")
@api_router.get("/{tenant_slug}/rapports/stats")
@api_router.get("/{tenant_slug}/stats/mensuelles")
@api_router.get("/{tenant_slug}/stats/utilisateur/{user_id}")
@api_router.get("/{tenant_slug}/dashboard")
```

**Localisation :**
- Chercher : `@api_router.*rapport|@api_router.*stats|@api_router.get\("/dashboard"`
- Lignes estimées : 2650-2800

---

### Routes Auth/Profil (3 routes)
```python
@api_router.get("/{tenant_slug}/auth/me")
@api_router.post("/{tenant_slug}/auth/refresh")
@api_router.put("/{tenant_slug}/profil")
```

**Localisation :**
- Chercher : `@api_router.*auth/me|@api_router.*profil`
- Lignes estimées : 750-850

---

## 🎯 Stratégie pour terminer rapidement

### Option A : Migration complète (~1.5-2h)
Migrer toutes les 21 routes restantes en une session

### Option B : Migration essentielle seulement (~45min)
Migrer uniquement :
- Auth/Profil (3 routes) - CRITIQUE pour login
- EPI (8 routes) - Important pour votre application
- Total : 11 routes

Les Paramètres et Rapports peuvent être migrés plus tard car moins critiques pour le fonctionnement de base.

---

## 📊 Impact sur l'application

### Avec 34 routes migrées (62%) :
✅ Login multi-tenant fonctionnel
✅ Gestion complète des utilisateurs
✅ Planning et assignations
✅ Formations
✅ Remplacements
✅ Disponibilités
✅ Notifications

❌ Manque encore :
- EPI (important)
- Auth/Me (critique)
- Paramètres (moyen)
- Rapports (faible)

---

## 🚀 Prochaine action recommandée

**Je recommande Option B : Migration essentielle (11 routes)**

Cela nous amènera à **45/55 routes (82%)** et couvrira TOUS les besoins critiques pour commencer la Phase 3 (Frontend).

Les 10 routes restantes (Paramètres + Rapports) peuvent être migrées en parallèle du développement frontend.

---

## 📝 Commandes pour continuer

```bash
# Chercher les routes EPI
grep -n "@api_router.*employee-epi" /app/backend/server.py

# Chercher les routes Auth/Me
grep -n "@api_router.*auth/me\|@api_router.*profil" /app/backend/server.py

# Chercher les routes Paramètres
grep -n "@api_router.*parametres" /app/backend/server.py
```

---

**Voulez-vous que je continue avec l'Option B (routes essentielles) ou l'Option A (tout terminer) ?**
