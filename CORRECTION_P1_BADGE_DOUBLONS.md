# Correction P1 : Badge "Doublons" reste affiché après résolution

## 🐛 Problème identifié

**Symptôme :**
- Le badge rouge "Doublons" (avec le chiffre) reste affiché dans le menu Paramètres/Admin même après avoir géré tous les doublons
- L'interface affiche correctement "Aucun doublon en attente" avec une icône verte ✅
- **Contradiction** : Badge = "1 doublon" mais contenu = "0 doublon"

**Capture d'écran du problème :**
```
Menu Paramètres: [Doublons 🔴 1]
↓
Page Doublons:
  ✅ Aucun doublon en attente
  Tous les imports sont à jour
```

---

## 🔍 Cause racine

Le compteur de doublons (badge) n'était **pas mis à jour en temps réel** après la résolution d'un doublon.

**Architecture du problème :**

1. **Sidebar.jsx** (menu latéral) :
   - Charge le compteur de doublons au démarrage
   - Recharge automatiquement toutes les 60 secondes
   - ❌ Ne rechargeait PAS immédiatement après résolution

2. **ImportDuplicatesManager.jsx** (page de gestion) :
   - Résout les doublons via API
   - Met à jour sa liste locale
   - ❌ Ne notifiait PAS le Sidebar

**Résultat :** L'utilisateur devait attendre jusqu'à 60 secondes pour voir le badge se mettre à jour.

---

## ✅ Solution appliquée

### Architecture de la solution : Event-driven

```
ImportDuplicatesManager
    ↓ (Doublon résolu)
    ↓ window.dispatchEvent('duplicateResolved')
    ↓
Sidebar
    ↓ window.addEventListener('duplicateResolved')
    ↓ loadDuplicatesCount() (immédiat)
    ↓
Badge mis à jour ✅
```

### 1. ImportDuplicatesManager.jsx

**Fonction `resolveDuplicate` (ligne ~41) :**

```javascript
// AVANT (❌)
if (res.ok) {
  const data = await res.json();
  toast({ title: actionLabel(action), description: data.message });
  setDuplicates(prev => prev.filter(d => d.id !== dupId));
  setTotal(prev => prev - 1);
  setPreviewMode(prev => ({ ...prev, [dupId]: null }));
  // ❌ Pas de notification au Sidebar
}

// APRÈS (✅)
if (res.ok) {
  const data = await res.json();
  toast({ title: actionLabel(action), description: data.message });
  setDuplicates(prev => prev.filter(d => d.id !== dupId));
  setTotal(prev => prev - 1);
  setPreviewMode(prev => ({ ...prev, [dupId]: null }));
  
  // ✅ Émettre un événement personnalisé
  window.dispatchEvent(new CustomEvent('duplicateResolved'));
}
```

**Fonction `resolveAll` (ligne ~63) :**

Même ajout d'événement après résolution de tous les doublons en masse.

---

### 2. Sidebar.jsx

**Écouteur d'événements (ligne ~202) :**

```javascript
// AVANT (❌)
useEffect(() => {
  if (user && ['admin', 'super_admin', 'directeur'].includes(user.role)) {
    loadDuplicatesCount();
    const interval = setInterval(loadDuplicatesCount, 60000); // Toutes les 60s
    return () => clearInterval(interval);
  }
}, [user, tenantSlug]);

// APRÈS (✅)
useEffect(() => {
  if (user && ['admin', 'super_admin', 'directeur'].includes(user.role)) {
    loadDuplicatesCount();
    const interval = setInterval(loadDuplicatesCount, 60000);
    
    // ✅ Écouter l'événement de résolution
    const handleDuplicateResolved = () => {
      loadDuplicatesCount(); // Recharge immédiat!
    };
    window.addEventListener('duplicateResolved', handleDuplicateResolved);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('duplicateResolved', handleDuplicateResolved);
    };
  }
}, [user, tenantSlug]);
```

---

## 🎯 Résultat

| Avant ❌ | Après ✅ |
|---------|---------|
| Badge reste affiché pendant 60s | ✅ Badge mis à jour **immédiatement** |
| Utilisateur confus (contradiction) | ✅ Badge cohérent avec le contenu |
| Délai de rafraîchissement | ✅ Temps réel |

---

## 🧪 Tests effectués

✅ Frontend compile sans erreur  
✅ Hot reload fonctionne  
✅ Événement `duplicateResolved` émis correctement  
✅ Sidebar écoute l'événement  

---

## 📝 À tester par l'utilisateur

### Scénario de test :

1. **Importer un fichier avec des doublons**
   - Aller dans `/admin` → Import par lot
   - Importer un fichier contenant des doublons
   - Vérifier que le badge "Doublons" apparaît dans le menu latéral (ex: 🔴 3)

2. **Résoudre UN doublon**
   - Cliquer sur l'onglet "Doublons"
   - Choisir une action (Fusionner / Remplacer / Ignorer)
   - **Vérifier immédiatement** : Le badge doit passer de 🔴 3 à 🔴 2

3. **Résoudre TOUS les doublons**
   - Utiliser le bouton "Résoudre tout" ou résoudre un par un
   - **Vérifier immédiatement** : Le badge doit disparaître complètement
   - Le message "Aucun doublon en attente" ✅ doit s'afficher
   - **Cohérence** : Badge = 0, Contenu = "Aucun doublon"

4. **Test de persistance**
   - Rafraîchir la page (F5)
   - Vérifier que le badge reste à 0 (pas de réapparition fantôme)

---

## 🔧 Détails techniques

### Événement personnalisé `duplicateResolved`

- **Type** : CustomEvent (standard Web API)
- **Portée** : Window (global)
- **Déclencheurs** :
  - Résolution d'un doublon individuel
  - Résolution en masse de tous les doublons
- **Écouteurs** :
  - Sidebar.jsx (menu latéral)

### Pourquoi cette approche ?

**Alternatives envisagées :**

1. ❌ **Polling plus fréquent** (toutes les 10s) : Charge inutile sur le serveur
2. ❌ **State partagé global** (Context API) : Trop complexe pour ce besoin simple
3. ✅ **Événement personnalisé** : Simple, léger, découplé, standard Web

**Avantages :**
- ✅ Mise à jour instantanée
- ✅ Pas de couplage direct entre composants
- ✅ Pas de prop drilling
- ✅ Extensible (autres composants peuvent écouter)
- ✅ Nettoyage automatique (`removeEventListener`)

---

## 📊 Impact

**Performance :**
- ✅ Aucun impact négatif
- ✅ Réduction du temps d'attente utilisateur (60s → 0s)

**UX :**
- ✅ Feedback immédiat
- ✅ Interface cohérente
- ✅ Moins de confusion

**Maintenabilité :**
- ✅ Code découplé
- ✅ Facile à déboguer
- ✅ Réutilisable pour d'autres événements

---

## 🗂️ Fichiers modifiés

1. `/app/frontend/src/components/ImportDuplicatesManager.jsx`
   - Ajout de `window.dispatchEvent('duplicateResolved')` dans `resolveDuplicate()` (ligne ~56)
   - Ajout de `window.dispatchEvent('duplicateResolved')` dans `resolveAll()` (ligne ~76)

2. `/app/frontend/src/components/Sidebar.jsx`
   - Ajout de l'écouteur `window.addEventListener('duplicateResolved')` (ligne ~207)
   - Nettoyage de l'écouteur dans le `return` du `useEffect` (ligne ~213)

---

## 🚀 Déploiement

- ✅ Correction appliquée et testée
- ✅ Aucune migration backend nécessaire
- ✅ Changement uniquement frontend (hot reload)
- ✅ Rétrocompatible (pas de breaking change)

---

## 📝 Notes additionnelles

### Cas d'usage futurs

Ce pattern d'événement personnalisé peut être réutilisé pour :
- Notification de nouveaux remplacements → Badge "Remplacements"
- Notification de nouvelles formations → Badge "Formations"
- Notification de disponibilités → Badge "Disponibilités"

### Débogage

Si le badge ne se met pas à jour :
1. Ouvrir la console du navigateur (F12)
2. Vérifier que l'événement est émis : 
   ```javascript
   window.addEventListener('duplicateResolved', () => console.log('✅ Event fired'));
   ```
3. Vérifier les erreurs dans `loadDuplicatesCount()`

---

**Date:** Décembre 2025  
**Priorité:** P1  
**Impact:** Moyen (UX)  
**Temps de résolution:** ~10 minutes  
**Type:** Bug UX (notification/badge)
