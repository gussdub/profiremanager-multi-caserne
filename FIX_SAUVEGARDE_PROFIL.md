# 🔧 Correctif - Sauvegarde du Profil

## Date: Aujourd'hui

## Problème Identifié

L'utilisateur signalait que:
1. ✅ Il remplissait les champs dans "Mon Profil" (dont l'adresse)
2. ✅ Il sauvegardait
3. ❌ Dans "Personnel", les infos apparaissaient SAUF l'adresse
4. ❌ En revenant dans "Mon Profil", tous les champs étaient vides

---

## Causes Racines

### 1. ❌ Modèle `ProfileUpdate` incomplet (Backend)

Le modèle Pydantic `ProfileUpdate` ne contenait pas le champ `adresse`:

```python
# AVANT (incomplet)
class ProfileUpdate(BaseModel):
    prenom: str
    nom: str
    email: str
    telephone: str = ""
    contact_urgence: str = ""
    heures_max_semaine: int = 25
```

**Résultat**: L'adresse n'était pas sauvegardée dans la base de données.

---

### 2. ❌ `profileData` non mis à jour après sauvegarde (Frontend)

Après la sauvegarde, seul `userProfile` était mis à jour, mais pas `profileData` qui contient les valeurs affichées dans les champs du formulaire:

```javascript
// AVANT (incomplet)
const updatedData = await apiPut(tenantSlug, '/users/mon-profil', updateData);
setUserProfile(updatedData); // ✅ Mis à jour
// profileData pas mis à jour ❌
```

**Résultat**: Les champs du formulaire restaient vides car `profileData` conservait les anciennes valeurs.

---

### 3. ❌ Route `/users/{id}/stats-mensuelles` non tenant-aware

La route pour les statistiques mensuelles n'avait pas le préfixe `/{tenant_slug}`:

```python
# AVANT
@api_router.get("/users/{user_id}/stats-mensuelles")
```

**Résultat**: Erreur 404 lors du chargement du profil, perturbant le flux de données.

---

## Solutions Appliquées

### 1. ✅ Ajout du champ `adresse` dans `ProfileUpdate`

**Fichier**: `/app/backend/server.py` (ligne 703)

```python
# APRÈS (complet)
class ProfileUpdate(BaseModel):
    prenom: str
    nom: str
    email: str
    telephone: str = ""
    adresse: str = ""       # ✅ AJOUTÉ
    contact_urgence: str = ""
    heures_max_semaine: int = 25
```

**Impact**: L'adresse est maintenant sauvegardée correctement dans la base de données.

---

### 2. ✅ Mise à jour de `profileData` après sauvegarde

**Fichier**: `/app/frontend/src/App.js` (ligne 6043)

```javascript
// APRÈS (complet)
const updatedData = await apiPut(tenantSlug, '/users/mon-profil', updateData);

// Mettre à jour le profil local avec la réponse
setUserProfile(updatedData);

// ✅ AJOUTÉ: Mettre à jour aussi profileData
setProfileData({
  nom: updatedData.nom,
  prenom: updatedData.prenom,
  email: updatedData.email,
  telephone: updatedData.telephone,
  adresse: updatedData.adresse || '',
  contact_urgence: updatedData.contact_urgence || '',
  heures_max_semaine: updatedData.heures_max_semaine || 25
});

toast({...});
setIsEditing(false);
```

**Impact**: Les champs du formulaire affichent maintenant les valeurs sauvegardées après la sauvegarde.

---

### 3. ✅ Route stats-mensuelles tenant-aware

**Fichier**: `/app/backend/server.py` (ligne 2430)

```python
# APRÈS (tenant-aware)
@api_router.get("/{tenant_slug}/users/{user_id}/stats-mensuelles")
async def get_user_monthly_stats(
    tenant_slug: str, 
    user_id: str, 
    current_user: User = Depends(get_current_user)
):
    # Vérifier le tenant
    tenant = await get_tenant_from_slug(tenant_slug)
    
    # ... reste du code avec filtrage par tenant.id
```

**Modifications supplémentaires**:
- Ligne 2445: Ajout `"tenant_id": tenant.id` dans la requête assignations
- Ligne 2454: Ajout `{"tenant_id": tenant.id}` dans la requête types_garde
- Ligne 2467: Ajout `"tenant_id": tenant.id` dans la requête users

**Impact**: Plus d'erreur 404, chargement correct des statistiques du profil.

---

## Flux Corrigé

### Avant (Problématique)
```
1. User remplit le profil
2. Clique "Sauvegarder"
3. API envoie les données → Backend
4. Backend sauvegarde sans "adresse" ❌
5. Frontend ne met pas à jour profileData ❌
6. User voit les champs vides ❌
```

### Après (Fonctionnel)
```
1. User remplit le profil (incluant adresse)
2. Clique "Sauvegarder"
3. API envoie toutes les données → Backend
4. Backend sauvegarde avec "adresse" ✅
5. Backend retourne les données complètes
6. Frontend met à jour userProfile ET profileData ✅
7. User voit tous les champs remplis ✅
8. Données visibles aussi dans "Personnel" ✅
```

---

## Tests de Vérification

### Test 1: Sauvegarde avec Adresse
1. Se connecter avec `employe@firemanager.ca` / `employe123`
2. Aller dans "Mon Profil"
3. Cliquer sur "Modifier"
4. Remplir tous les champs:
   ```
   Prénom: Pierre
   Nom: Martin
   Email: employe@firemanager.ca
   Téléphone: 450-555-1234
   Adresse: 123 Rue Test, Shefford, QC
   Contact d'urgence: Marie Martin - 450-555-9999
   ```
5. Cliquer "Sauvegarder"
6. **Vérifier**: Toast de succès apparaît
7. **Vérifier**: Tous les champs restent remplis (pas vides)
8. Rafraîchir la page
9. **Vérifier**: Les données sont toujours là

### Test 2: Visibilité dans Personnel
1. Rester connecté avec le même compte
2. Aller dans "Personnel"
3. Trouver "Pierre Martin" dans la liste
4. Cliquer sur "Voir"
5. **Vérifier**: L'adresse "123 Rue Test, Shefford, QC" apparaît
6. **Vérifier**: Le contact d'urgence apparaît
7. **Vérifier**: Le téléphone apparaît

### Test 3: Modification de l'Adresse
1. Dans "Mon Profil" → "Modifier"
2. Changer l'adresse: "456 Nouvelle Rue, Bromont, QC"
3. Sauvegarder
4. **Vérifier**: La nouvelle adresse est affichée
5. Aller dans "Personnel" → Voir
6. **Vérifier**: La nouvelle adresse apparaît

### Test 4: Statistiques Mensuelles
1. Dans "Mon Profil"
2. **Vérifier**: Aucune erreur 404 dans la console
3. **Vérifier**: Les statistiques (gardes ce mois, heures, certifications) s'affichent
4. Pas d'erreur dans les logs backend

---

## Fichiers Modifiés

### Backend
1. **`/app/backend/server.py`**
   - Ligne 703-709: Ajout `adresse` dans `ProfileUpdate`
   - Ligne 2430: Ajout `/{tenant_slug}` dans la route stats-mensuelles
   - Ligne 2435: Ajout validation du tenant
   - Ligne 2445-2467: Ajout filtrage par `tenant_id`

### Frontend
2. **`/app/frontend/src/App.js`**
   - Ligne 6043-6062: Mise à jour de `profileData` après sauvegarde

---

## Logs à Surveiller

### Backend Logs (Succès)
```bash
INFO: PUT /api/shefford/users/mon-profil HTTP/1.1 200 OK
INFO: GET /api/shefford/users/{id}/stats-mensuelles HTTP/1.1 200 OK
```

### Backend Logs (Avant le fix - Erreurs)
```bash
INFO: GET /api/shefford/users/{id}/stats-mensuelles HTTP/1.1 404 Not Found ❌
```

---

## Données en Base

### Document User (après sauvegarde)
```json
{
  "id": "4105ce9d-c7b1-4352-9916-6111c8216588",
  "tenant_id": "uuid-shefford",
  "nom": "Martin",
  "prenom": "Pierre",
  "email": "employe@firemanager.ca",
  "telephone": "450-555-1234",
  "adresse": "123 Rue Test, Shefford, QC",
  "contact_urgence": "Marie Martin - 450-555-9999",
  "grade": "Pompier",
  "type_emploi": "temps_partiel",
  "role": "employe",
  "heures_max_semaine": 25,
  ...
}
```

**Vérification MongoDB**:
```bash
mongosh profiremanager --quiet --eval "db.users.findOne({email: 'employe@firemanager.ca'}, {adresse: 1, telephone: 1, contact_urgence: 1})"
```

---

## Compatibilité

### Utilisateurs Existants
- ✅ Les utilisateurs sans adresse auront `adresse: ""`
- ✅ Peuvent ajouter leur adresse via "Mon Profil"
- ✅ Aucune migration manuelle requise

### Multi-Tenant
- ✅ Route stats-mensuelles filtre correctement par tenant
- ✅ Pas de fuite de données entre tenants
- ✅ Isolation complète maintenue

---

## Services

Après redémarrage:
- ✅ Backend: RUNNING
- ✅ Frontend: RUNNING
- ✅ MongoDB: RUNNING

---

## Résumé

### Problème
❌ Sauvegarde du profil ne fonctionnait pas correctement
❌ Adresse non sauvegardée
❌ Champs vides après sauvegarde
❌ Erreur 404 sur stats-mensuelles

### Solution
✅ Champ `adresse` ajouté dans `ProfileUpdate`
✅ `profileData` mis à jour après sauvegarde
✅ Route stats-mensuelles tenant-aware
✅ Filtrage par `tenant_id` ajouté

### Résultat
✅ Sauvegarde fonctionne correctement
✅ Adresse sauvegardée et visible
✅ Champs restent remplis après sauvegarde
✅ Données visibles dans "Personnel"
✅ Aucune erreur 404

---

**Le profil fonctionne maintenant parfaitement! 🎉**
