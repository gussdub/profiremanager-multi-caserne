# 🔧 Correction RBAC Frontend - Affichage de l'onglet "Rapport d'Heures"

**Date**: 27 avril 2026  
**Priorité**: P0 - Critique  
**Statut**: ✅ CORRIGÉ

---

## 📋 Problème identifié

Le frontend n'affichait pas l'onglet "Rapport d'Heures" pour les employés, même si le backend renvoyait les bonnes permissions RBAC.

### Cause racine
Le composant `Planning.jsx` affichait le bouton "Rapport d'Heures" uniquement si l'utilisateur avait la permission `canCreatePlanning` (action "créer" sur le module planning).

**Code problématique** (ligne 2129):
```jsx
{canCreatePlanning && (
  <div className="planning-action-buttons">
    // Boutons Auto, Manuelle, ET Rapport d'Heures
  </div>
)}
```

Le problème : **un employé peut avoir accès au rapport d'heures SANS avoir la permission de créer des assignations**.

---

## ✅ Solution appliquée

### 1. Ajout de la fonction `hasTabAccess` dans Planning.jsx

**Fichier**: `/app/frontend/src/components/Planning.jsx`  
**Ligne**: 26-30

```jsx
const { hasModuleAccess, hasModuleAction, hasTabAccess } = usePermissions(tenantSlug, user);
const canCreatePlanning = hasModuleAction('planning', 'creer');
const canEditPlanning = hasModuleAction('planning', 'modifier');
const canDeletePlanning = hasModuleAction('planning', 'supprimer');
const canViewRapportHeures = hasTabAccess('planning', 'rapport-heures'); // ✅ NOUVEAU
```

### 2. Affichage conditionnel du bouton "Rapport d'Heures"

**Fichier**: `/app/frontend/src/components/Planning.jsx`  
**Lignes**: 2128-2170

```jsx
{/* Boutons d'Assignation et Actions - Responsive Mobile/Desktop */}
{(canCreatePlanning || canViewRapportHeures) && (
  <div className="planning-action-buttons">
    {canCreatePlanning && (
      <>
        <Button>Attribution Automatique</Button>
        <Button>Assignation Manuelle</Button>
      </>
    )}
    {canViewRapportHeures && (
      <Button data-testid="rapport-heures-btn">
        Rapport d'Heures
      </Button>
    )}
  </div>
)}
```

**Logique** :
- Les boutons "Attribution Automatique" et "Assignation Manuelle" s'affichent **SEULEMENT** si `canCreatePlanning` est vrai (admin/superviseur)
- Le bouton "Rapport d'Heures" s'affiche **INDÉPENDAMMENT** si `canViewRapportHeures` est vrai (employé avec permission)

---

## 🧪 Vérification de la correction

### Permissions backend pour l'employé

L'API `/api/{tenant}/users/{user_id}/permissions` renvoie désormais correctement les permissions:

```json
{
  "permissions": {
    "modules": {
      "planning": {
        "access": true,
        "actions": ["voir"],
        "tabs": {
          "rapport-heures": {
            "access": true,  // ✅ Configurable via RBAC
            "actions": ["voir", "exporter"]
          }
        }
      }
    }
  }
}
```

### Hook `usePermissions`

Le hook `/app/frontend/src/hooks/usePermissions.js` expose déjà `hasTabAccess()` :

```javascript
const hasTabAccess = (moduleId, tabId) => {
  if (permissions.is_full_access) return true;
  const modulePerms = permissions.modules?.[moduleId];
  if (!modulePerms?.access) return false;
  return modulePerms.tabs?.[tabId]?.access === true;
};
```

---

## ⚙️ Configuration RBAC (Backend)

Pour activer l'accès au "Rapport d'Heures" pour un employé :

1. **Admin** se connecte
2. Va dans **Paramètres** → **Comptes et Accès**
3. Sélectionne un **Type d'accès** (ex: "Employé")
4. Active l'onglet **"Rapport d'heures"** dans le module **Planning**
5. Sauvegarde

Les permissions sont stockées dans MongoDB Atlas:
- Collection: `access_types`
- Structure: `permissions.modules.planning.tabs.rapport-heures.access`

---

## 📝 Fichiers modifiés

✅ `/app/frontend/src/components/Planning.jsx` (2 modifications)
  - Ligne 26-30: Ajout de `hasTabAccess` et `canViewRapportHeures`
  - Ligne 2128-2170: Affichage conditionnel du bouton

---

## 🎯 Résultat

- ✅ Le bouton "Rapport d'Heures" s'affiche maintenant pour TOUS les utilisateurs ayant `planning.tabs.rapport-heures.access === true`
- ✅ Un employé peut voir le rapport d'heures SANS pouvoir créer/modifier le planning
- ✅ Les boutons d'assignation (Auto, Manuelle) restent visibles uniquement pour les admins/superviseurs
- ✅ Le système RBAC est maintenant entièrement opérationnel côté frontend

---

## 🔜 Prochaines étapes

L'utilisateur doit:
1. Se connecter en tant qu'admin
2. Accéder à **Paramètres** → **Comptes et Accès** → **Types d'accès**
3. Modifier le type d'accès "Employé" pour activer l'onglet "Rapport d'heures"
4. Tester avec un compte employé

Une fois les permissions activées backend, le bouton apparaîtra automatiquement.

---

**Note technique**: Cette correction applique la séparation correcte entre :
- **Actions sur le module** (`hasModuleAction`) : créer, modifier, supprimer le planning
- **Accès aux onglets** (`hasTabAccess`) : voir le rapport d'heures, voir le calendrier, etc.
