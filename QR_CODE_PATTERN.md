# Pattern QR Code pour ProFireManager

## 📱 Architecture Standardisée des QR Codes

Ce document décrit le pattern standard à utiliser pour tous les QR codes dans l'application ProFireManager.

---

## 🎯 Principe de Base

**IMPORTANT:** Chaque QR code contient le `tenantSlug` dans l'URL, ce qui permet d'identifier automatiquement le tenant et de simplifier la connexion.

### Structure d'URL Standard

```
/qr/{tenantSlug}/{resourceType}/{resourceId}
```

**Exemples:**
- Véhicule: `/qr/shefford/vehicule/abc-123`
- Borne incendie: `/qr/shefford/borne/xyz-789`
- Bâtiment: `/qr/shefford/batiment/def-456`
- EPI: `/qr/shefford/epi/ghi-321`

---

## 🔐 Flux d'Authentification

### 1. Accès Initial (Sans Connexion)
- L'utilisateur scanne le QR code
- La page s'ouvre et affiche les informations publiques de la ressource
- Le `tenantSlug` est extrait de l'URL automatiquement

### 2. Connexion (Si Non Connecté)
Quand l'utilisateur clique sur une action:

```javascript
const handleAction = () => {
  if (!isAuthenticated) {
    setShowLogin(true);
    return;
  }
  // ... suite de l'action
};
```

### 3. Après Connexion
- Le token est sauvegardé avec le préfixe du tenant: `localStorage.setItem(`${tenantSlug}_token`, token)`
- L'action souhaitée est sauvegardée: `localStorage.setItem('qr_action', JSON.stringify({...}))`
- Redirection vers l'application: `window.location.href = `/${tenantSlug}/module``

### 4. Exécution de l'Action
Le module de destination détecte l'action QR:

```javascript
useEffect(() => {
  const qrActionData = localStorage.getItem('qr_action');
  if (qrActionData) {
    const qrAction = JSON.parse(qrActionData);
    // Exécuter l'action appropriée
    localStorage.removeItem('qr_action');
  }
}, []);
```

---

## 📋 Template de Composant QR

### Structure du Composant

```jsx
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const ResourceQRAction = () => {
  const { tenantSlug, resourceId } = useParams();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    checkAuthentication();
    loadResource();
  }, []);

  const checkAuthentication = () => {
    const token = localStorage.getItem(`${tenantSlug}_token`);
    setIsAuthenticated(!!token);
  };

  const loadResource = async () => {
    // Utiliser l'endpoint PUBLIC (sans authentification)
    const response = await fetch(
      `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/resources/${resourceId}/public`
    );
    const data = await response.json();
    setResource(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/auth/login`,
        { email, mot_de_passe: password }
      );

      // Sauvegarder avec le préfixe du tenant
      localStorage.setItem(`${tenantSlug}_token`, response.data.access_token);
      localStorage.setItem(`${tenantSlug}_user`, JSON.stringify(response.data.user));
      
      // Sauvegarder l'action QR
      localStorage.setItem('qr_action', JSON.stringify({
        action: 'action_name',
        resourceId: resourceId,
        resource: resource
      }));
      
      // Rediriger vers le module approprié
      window.location.href = `/${tenantSlug}/module`;
    } catch (err) {
      setLoginError('Email ou mot de passe incorrect');
    }
  };

  const handleAction = () => {
    if (!isAuthenticated) {
      setShowLogin(true);
      return;
    }
    
    localStorage.setItem('qr_action', JSON.stringify({
      action: 'action_name',
      resourceId: resourceId,
      resource: resource
    }));
    
    window.location.href = `/${tenantSlug}/module`;
  };

  // ... reste du composant
};
```

---

## 🔧 Backend: Endpoint Public

Pour chaque type de ressource, créer un endpoint public:

```python
@api_router.get("/{tenant_slug}/resources/{resource_id}/public")
async def get_resource_public(tenant_slug: str, resource_id: str):
    """
    Endpoint PUBLIC pour QR code - Sans authentification
    Retourne uniquement les informations essentielles
    """
    tenant = await get_tenant_from_slug(tenant_slug)
    
    resource = await db.resources.find_one(
        {"id": resource_id, "tenant_id": tenant.id},
        {
            "_id": 0,
            "id": 1,
            "nom": 1,
            "type": 1,
            # Uniquement les champs nécessaires pour l'affichage
        }
    )
    
    if not resource:
        raise HTTPException(status_code=404, detail="Ressource non trouvée")
    
    return resource
```

---

## 🔄 Génération de QR Code

### Backend: Fonction de Génération

```python
@api_router.post("/{tenant_slug}/resources/{resource_id}/generate-qr")
async def generate_qr_code(
    tenant_slug: str,
    resource_id: str,
    current_user: User = Depends(get_current_user)
):
    """Générer un QR code pour une ressource"""
    import qrcode
    import base64
    from io import BytesIO
    
    # URL avec tenant dans le path
    frontend_url = os.environ.get('FRONTEND_URL', 'https://www.profiremanager.ca')
    resource_url = f"{frontend_url}/qr/{tenant_slug}/resource/{resource_id}"
    
    # Générer le QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(resource_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    # Encoder en base64
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    qr_code_data_url = f"data:image/png;base64,{img_base64}"
    
    # Sauvegarder dans la ressource
    await db.resources.update_one(
        {"id": resource_id},
        {"$set": {
            "qr_code": qr_code_data_url,
            "qr_code_url": resource_url
        }}
    )
    
    return {"qr_code": qr_code_data_url, "qr_code_url": resource_url}
```

---

## ✅ Checklist d'Implémentation

Pour chaque nouveau type de QR code:

### Backend
- [ ] Créer l'endpoint public `/api/{tenant_slug}/{resource_type}/{resource_id}/public`
- [ ] Créer l'endpoint de génération de QR code
- [ ] S'assurer que l'URL contient le `tenantSlug`

### Frontend
- [ ] Créer le composant de page QR `/qr/{tenantSlug}/{resourceType}/{resourceId}`
- [ ] Implémenter la vérification d'authentification
- [ ] Ajouter le formulaire de connexion inline
- [ ] Sauvegarder l'action dans `localStorage` avec la clé `qr_action`
- [ ] Rediriger vers le module approprié après connexion

### Module de Destination
- [ ] Ajouter un `useEffect` pour détecter `qr_action` dans `localStorage`
- [ ] Extraire et exécuter l'action appropriée
- [ ] Supprimer `qr_action` du `localStorage` après exécution

### Route
- [ ] Ajouter la route dans `App.js`: `<Route path="/qr/:tenantSlug/:resourceType/:resourceId" element={<ResourceQRAction />} />`

---

## 🎨 Design Guidelines

- **Carte centrée** avec informations de la ressource
- **Icône distinctive** pour chaque type de ressource
- **Boutons d'action clairs** avec émojis
- **Formulaire de connexion inline** (pas de redirection vers page de login)
- **Messages d'état clairs** ("Connexion requise", "Chargement...", etc.)
- **Badge "Bientôt"** pour les actions futures

---

## 🔒 Sécurité

1. **Endpoint public** = Informations minimales uniquement
2. **Actions authentifiées** = Toujours vérifier le token
3. **Token avec préfixe tenant** = `${tenantSlug}_token`
4. **Traçabilité** = Toutes les actions enregistrées au nom de l'utilisateur connecté

---

## 📱 Types de QR Codes à Implémenter

- [x] Véhicules (Ronde de sécurité + Inventaire)
- [ ] Bornes incendie (Inspection + Maintenance)
- [ ] Bâtiments (Inspection + Plan d'intervention)
- [ ] EPI (Demande de remplacement + Historique)
- [ ] Équipements (Maintenance + Historique)

---

**Note:** Ce pattern garantit une expérience utilisateur fluide et cohérente à travers toute l'application, tout en maintenant un haut niveau de sécurité et de traçabilité.
