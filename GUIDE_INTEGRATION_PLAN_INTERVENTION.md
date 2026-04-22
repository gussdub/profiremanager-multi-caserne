# Guide d'Intégration du Plan d'Intervention dans la Fiche Bâtiment

## 📋 Composant créé
**Fichier** : `/app/frontend/src/components/PlanInterventionTab.jsx`

Ce composant affiche le plan d'intervention d'un bâtiment avec :
- ✅ Informations critiques (identification, construction, accès, assistance)
- ✅ Alimentation en eau avec calcul déficit/surplus (PRIORITÉ POMPIERS)
- ✅ Galerie photos sectorielles avec noms ("Secteur 3", etc.)
- ✅ Modal zoom sur photos avec navigation (flèches gauche/droite)
- ✅ Téléchargement PDF du plan complet
- ✅ Design responsive adapté mobile/tablet/desktop

---

## 🔧 Intégration dans BatimentDetailModalNew.jsx

### Option 1 : Ajouter comme section dans le modal existant

Trouvez la section où vous affichez les détails du bâtiment et ajoutez :

```jsx
import PlanInterventionTab from './PlanInterventionTab';

// Dans le composant BatimentDetailModalNew
// Ajoutez un bouton pour afficher le plan

<button
  onClick={() => setShowPlanIntervention(true)}
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.875rem'
  }}
>
  <AlertTriangle size={18} />
  Plan d'Intervention
</button>

{/* Modal Plan d'Intervention */}
{showPlanIntervention && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  }}>
    <div style={{
      background: 'white',
      borderRadius: '12px',
      maxWidth: '1200px',
      width: '95%',
      maxHeight: '95vh',
      overflowY: 'auto',
      position: 'relative'
    }}>
      <button
        onClick={() => setShowPlanIntervention(false)}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        <X size={20} />
      </button>
      <PlanInterventionTab
        batimentId={batiment.id}
        tenantSlug={tenantSlug}
        onClose={() => setShowPlanIntervention(false)}
      />
    </div>
  </div>
)}
```

### Option 2 : Ajouter comme onglet dans un système d'onglets

Si vous avez déjà un système d'onglets, ajoutez :

```jsx
import PlanInterventionTab from './PlanInterventionTab';

// Dans la liste des onglets
const tabs = [
  { id: 'details', label: 'Détails', icon: <Home /> },
  { id: 'historique', label: 'Historique', icon: <History /> },
  { id: 'plan_intervention', label: 'Plan d\'Intervention', icon: <AlertTriangle />, badge: planDisponible }
];

// Dans le contenu des onglets
{activeTab === 'plan_intervention' && (
  <PlanInterventionTab
    batimentId={batiment.id}
    tenantSlug={tenantSlug}
  />
)}
```

---

## 🎨 Badge "Plan disponible"

Pour afficher un badge visuel indiquant qu'un plan est disponible :

```jsx
import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

const [planDisponible, setPlanDisponible] = useState(false);

useEffect(() => {
  const checkPlanDisponible = async () => {
    const token = localStorage.getItem('token');
    const backendUrl = process.env.REACT_APP_BACKEND_URL;
    
    const response = await fetch(
      `${backendUrl}/api/${tenantSlug}/plan-intervention/batiment/${batiment.id}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await response.json();
    setPlanDisponible(data.plan_disponible);
  };
  
  if (batiment?.id) {
    checkPlanDisponible();
  }
}, [batiment]);

// Badge à afficher
{planDisponible && (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.25rem 0.75rem',
    background: '#dcfce7',
    border: '1px solid #22c55e',
    borderRadius: '20px',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#16a34a'
  }}>
    <AlertTriangle size={14} />
    Plan disponible
  </span>
)}
```

---

## 📍 Exemple d'intégration complète dans Batiments.jsx (liste)

Si vous voulez ajouter une colonne "Plan" dans la liste des bâtiments :

```jsx
import { AlertTriangle } from 'lucide-react';

// Dans le tableau
<td>
  {batiment.has_plan_intervention ? (
    <button
      onClick={() => openPlanIntervention(batiment.id)}
      style={{
        padding: '0.5rem',
        background: '#dc2626',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.25rem'
      }}
    >
      <AlertTriangle size={16} />
      Voir
    </button>
  ) : (
    <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>N/A</span>
  )}
</td>
```

---

## 🚀 Test du composant

### 1. Avec données simulées (développement)

Créez un fichier de test `TestPlanIntervention.jsx` :

```jsx
import PlanInterventionTab from './PlanInterventionTab';

const TestPlanIntervention = () => {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Test Plan d'Intervention</h1>
      <PlanInterventionTab
        batimentId="ID_BATIMENT_TEST"
        tenantSlug="demo"
      />
    </div>
  );
};

export default TestPlanIntervention;
```

### 2. Avec données réelles (après import PFM)

1. Importer un plan via l'API backend
2. Ouvrir la fiche du bâtiment
3. Cliquer sur "Plan d'Intervention"
4. Vérifier l'affichage de toutes les sections

---

## 🎨 Personnalisation du style

Le composant utilise des styles inline pour être autonome. Pour personnaliser :

### Couleurs principales
- **Rouge pompiers** : `#dc2626` → Titre, badges critiques
- **Bleu** : `#3b82f6` → Icônes, boutons téléchargement
- **Vert** : `#22c55e` → Surplus d'eau
- **Rouge alerte** : `#ef4444` → Déficit d'eau, dangers

### Responsive
Le composant utilise CSS Grid avec `repeat(auto-fit, minmax(...))` pour s'adapter automatiquement.

---

## 📦 Dépendances requises

Le composant utilise **Lucide React** pour les icônes :

```bash
# Si pas déjà installé
yarn add lucide-react
```

Icônes utilisées :
- `AlertTriangle` (danger, plan)
- `Droplet` (eau)
- `Home` (identification, construction)
- `Map` (accès, croquis)
- `Users` (personnes)
- `FileText` (PDF, documents)
- `Download` (téléchargement)
- `ZoomIn` (zoom photo)
- `ChevronLeft`, `ChevronRight` (navigation photos)
- `X` (fermeture)

---

## 🔒 Permissions RBAC

Le backend vérifie déjà les permissions :
- **Voir plan** : Permission `batiments.voir.details`
- **Importer plan** : Permission `batiments.modifier.details`
- **Supprimer plan** : Permission `batiments.supprimer.details`

Aucune vérification supplémentaire n'est nécessaire côté frontend si l'utilisateur peut voir le bâtiment.

---

## 🐛 Gestion des erreurs

Le composant gère automatiquement :
- ✅ Plan non disponible → Message explicite
- ✅ Erreur réseau → Affichage erreur
- ✅ Photos sans URL → Icône placeholder
- ✅ Champs manquants → N/A ou masqué

---

## 📱 Support mobile

Le composant est **fully responsive** :
- Grilles auto-adaptatives (280px min par carte)
- Photos en grille flexible
- Modal plein écran sur mobile
- Navigation tactile dans galerie photos

---

## ✅ Checklist d'intégration

- [ ] Importer `PlanInterventionTab` dans le composant parent
- [ ] Ajouter un état `showPlanIntervention` (booléen)
- [ ] Créer un bouton pour ouvrir le plan
- [ ] Afficher le composant dans un modal ou onglet
- [ ] Tester avec un bâtiment ayant un plan
- [ ] Tester avec un bâtiment sans plan
- [ ] Vérifier responsive (mobile, tablet, desktop)
- [ ] Tester navigation photos (clavier flèches)
- [ ] Tester téléchargement PDF

---

**Le composant est prêt à l'emploi ! Intégrez-le selon l'architecture de votre application.**
