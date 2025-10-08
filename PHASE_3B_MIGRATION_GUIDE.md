# Phase 3B : Guide de migration des API calls

## 🎯 Objectif

Remplacer tous les appels `axios` par les helpers `apiGet/apiPost/apiPut/apiDelete` avec le `tenantSlug`.

## 📊 Analyse

- **Total API calls à migrer** : 70
- **Fichier** : `/app/frontend/src/App.js`
- **Composants concernés** : Personnel, Planning, Formations, Remplacements, etc.

## 🔧 Pattern de migration

### Avant (exemple)
```javascript
const Personnel = () => {
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    axios.get(`${API}/users`)
      .then(response => setUsers(response.data))
      .catch(error => console.error(error));
  }, []);
  
  const handleCreateUser = async (userData) => {
    await axios.post(`${API}/users`, userData);
  };
};
```

### Après
```javascript
const Personnel = () => {
  const { tenantSlug } = useTenant();
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    if (!tenantSlug) return;
    
    apiGet(tenantSlug, '/users')
      .then(data => setUsers(data))
      .catch(error => console.error(error));
  }, [tenantSlug]);
  
  const handleCreateUser = async (userData) => {
    await apiPost(tenantSlug, '/users', userData);
  };
};
```

## 📝 Checklist par composant

### Personnel
- [ ] GET /users
- [ ] POST /users
- [ ] PUT /users/{id}
- [ ] DELETE /users/{id}
- [ ] GET /users/{id}

### Planning
- [ ] GET /planning/{semaine_debut}
- [ ] POST /planning/assignation
- [ ] DELETE /planning/assignation/{id}
- [ ] GET /planning/assignations/{semaine_debut}
- [ ] POST /planning/attribution-auto

### Formations
- [ ] GET /formations
- [ ] POST /formations
- [ ] PUT /formations/{id}
- [ ] DELETE /formations/{id}

### Remplacements
- [ ] GET /remplacements
- [ ] POST /remplacements
- [ ] PUT /remplacements/{id}/accepter
- [ ] PUT /remplacements/{id}/refuser

### Disponibilités
- [ ] GET /disponibilites/{user_id}
- [ ] POST /disponibilites
- [ ] PUT /disponibilites/{user_id}
- [ ] DELETE /disponibilites/{id}

### EPI
- [ ] GET /epi/employe/{employe_id}
- [ ] POST /epi
- [ ] PUT /epi/{id}
- [ ] DELETE /epi/{id}
- [ ] POST /epi/{id}/inspection

### Notifications
- [ ] GET /notifications
- [ ] GET /notifications/non-lues/count
- [ ] PUT /notifications/{id}/marquer-lu

## ⚠️ Points d'attention

1. **Ajouter useTenant dans CHAQUE composant qui fait des API calls**
   ```javascript
   const { tenantSlug } = useTenant();
   ```

2. **Vérifier tenantSlug avant les appels**
   ```javascript
   if (!tenantSlug) return;
   ```

3. **Ajouter tenantSlug dans les dépendances useEffect**
   ```javascript
   useEffect(() => {
     // API call
   }, [tenantSlug]);
   ```

4. **Gérer les erreurs de tenant non trouvé**
   ```javascript
   .catch(error => {
     if (error.message.includes('Caserne')) {
       // Redirection ou message d'erreur
     }
   });
   ```

## 🚀 Stratégie d'exécution

### Option A : Migration complète (recommandé)
Migrer tous les 70 appels en une session (~2-3h)

### Option B : Migration progressive
1. Session 1 : Personnel + Planning (20 appels)
2. Session 2 : Formations + Remplacements (15 appels)
3. Session 3 : Reste (35 appels)

## 🧪 Tests après migration

Pour chaque composant migré :
1. Ouvrir `http://localhost:3000/shefford`
2. Vérifier que les données se chargent
3. Tester les actions CRUD
4. Vérifier les logs console (pas d'erreurs)

## 📊 Progression

- ✅ Infrastructure (Phase 3A) : 100%
- ⏳ Migration API calls (Phase 3B) : 0%

---

**Prêt pour la migration !**
