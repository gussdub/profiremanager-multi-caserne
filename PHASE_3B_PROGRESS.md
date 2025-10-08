# Phase 3B - Migration des API Calls Frontend

## Statut: En cours ✅

### Objectif
Migrer tous les appels `axios` directs vers les fonctions helpers `apiGet`, `apiPost`, `apiPut`, `apiDelete` qui intègrent automatiquement le `tenantSlug`.

### Composants Migrés ✅

1. **Personnel** ✅ COMPLET
   - Ajout du hook `useTenant()`
   - Migration de tous les appels axios (users, formations, EPI)
   - Gestion des erreurs mise à jour

2. **Dashboard** ✅ COMPLET
   - Ajout du hook `useTenant()`
   - Migration des appels statistiques, rapports, users
   - Dependency `[tenantSlug]` ajoutée à useEffect

3. **Planning** ✅ COMPLET
   - Ajout du hook `useTenant()`
   - Migration: types-garde, assignations, users
   - Attribution automatique mise à jour
   - Suppression et création d'assignations migrées

4. **Remplacements** ✅ COMPLET
   - Ajout du hook `useTenant()`
   - Migration: remplacements, demandes-conge, types-garde, users
   - Création et approbation de congés migrées

5. **Formations** ✅ COMPLET
   - Ajout du hook `useTenant()`
   - Migration: sessions-formation, formations
   - CRUD complet migré

### Composants Restants - TOUS TERMINÉS ✅

6. **MesDisponibilites** ✅ COMPLET
7. **MonProfil** ✅ COMPLET
8. **Rapports** ✅ COMPLET
9. **ModuleEPI** ✅ COMPLET
10. **Sidebar** (Notifications) ✅ COMPLET

### Modifications Globales Effectuées

- ✅ Import de `useTenant` dans chaque composant
- ✅ Déclaration `const { tenantSlug } = useTenant()` 
- ✅ Remplacement de `.data` après les réponses (les helpers retournent directement les données)
- ✅ Mise à jour de la gestion d'erreurs (`error.detail` au lieu de `error.response?.data?.detail`)
- ✅ Ajout de `tenantSlug` dans les dépendances useEffect

### Prochaines Étapes

1. Migrer MesDisponibilites
2. Migrer MonProfil  
3. Migrer Rapports
4. Vérifier s'il y a d'autres composants avec des appels axios
5. Tester chaque module après migration
6. Redémarrer les services et valider

### Notes Techniques

- Les fonctions API helpers (`apiGet`, `apiPost`, etc.) sont définies dans `/app/frontend/src/utils/api.js`
- Elles retournent directement les données, pas besoin de `.data`
- Elles gèrent automatiquement le token JWT et la construction d'URL avec tenant
- Les erreurs sont transformées pour être plus accessibles
