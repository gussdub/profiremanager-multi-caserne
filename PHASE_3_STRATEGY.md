# Phase 3 : Frontend Multi-Tenant - Stratégie

## ✅ Fichiers créés

1. `/app/frontend/src/contexts/TenantContext.js` - Contexte React pour le tenant
2. `/app/frontend/src/utils/api.js` - Helpers pour les API calls multi-tenant
3. `index.js` modifié pour inclure TenantProvider

## 🎯 Modifications à faire dans App.js

### 1. Importer useTenant
```javascript
import { useTenant } from './contexts/TenantContext';
```

### 2. Modifier AuthProvider pour utiliser le tenant
```javascript
const AuthProvider = ({ children }) => {
  const { tenantSlug } = useTenant();
  
  // Modifier login pour inclure tenantSlug
  const login = async (email, mot_de_passe) => {
    const response = await axios.post(
      `${API}/${tenantSlug}/auth/login`,
      { email, mot_de_passe }
    );
    // ...
  };
  
  // Modifier auth/me
  axios.get(`${API}/${tenantSlug}/auth/me`)
  // ...
};
```

### 3. Modifier TOUS les API calls dans App.js

**Pattern actuel :**
```javascript
axios.get(`${API}/users`)
axios.post(`${API}/types-garde`, data)
```

**Nouveau pattern :**
```javascript
import { apiGet, apiPost } from './utils/api';
const { tenantSlug } = useTenant();

apiGet(tenantSlug, '/users')
apiPost(tenantSlug, '/types-garde', data)
```

### 4. Composants à modifier

Tous les composants qui font des appels API :
- Personnel
- Planning
- Formations
- Remplacements
- Disponibilites
- MonProfil
- Parametres
- Rapports
- ModuleEPI

**Stratégie :**
1. Importer `useTenant` dans chaque composant
2. Récupérer `tenantSlug` avec le hook
3. Remplacer tous les `axios` par les helpers `api.js`

## 📊 Estimation

- **Nombre de composants à modifier** : ~10
- **Nombre d'API calls à migrer** : ~150-200
- **Temps estimé** : 4-6 heures

## 🚀 Plan d'exécution

### Phase 3A : Core (2-3h)
1. ✅ Créer TenantContext
2. ✅ Créer API helpers
3. ✅ Modifier index.js
4. ⏳ Modifier AuthProvider dans App.js
5. ⏳ Modifier le composant Login
6. ⏳ Modifier les API calls principaux dans App.js

### Phase 3B : Composants (2-3h)
7. Modifier Personnel
8. Modifier Planning
9. Modifier Formations
10. Modifier autres composants

### Phase 3C : Super-Admin (1-2h)
11. Créer interface Super-Admin
12. Login super-admin
13. Gestion des tenants

## 🧪 Tests après Phase 3

1. Login Shefford → `http://localhost:3000/shefford`
2. Voir que les données sont filtrées par tenant
3. Login Bromont (après création) → `http://localhost:3000/bromont`
4. Vérifier isolation complète
5. Super-admin → `http://localhost:3000/admin`

## ⚠️ Points critiques

1. **Tous les API calls DOIVENT** inclure le tenantSlug
2. **Le token JWT** contient déjà le tenant_id
3. **Les routes** doivent correspondre au tenant de l'URL
4. **Navigation** doit préserver le tenant dans l'URL

## 🎯 Objectif Phase 3

**Frontend complètement multi-tenant avec :**
- ✅ Détection automatique du tenant
- ✅ API calls tenant-aware
- ✅ Isolation visuelle des données
- ✅ Interface Super-Admin
- ✅ Support de multiples casernes

---

**Phase 3A en cours...**
