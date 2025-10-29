// Helper pour construire les URLs API avec le tenant

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Construit une URL API avec le préfixe tenant
 * @param {string} tenantSlug - Le slug du tenant (ex: 'shefford', 'bromont')
 * @param {string} endpoint - L'endpoint API (ex: '/users', '/types-garde')
 * @returns {string} URL complète
 */
export const buildApiUrl = (tenantSlug, endpoint) => {
  // Pour super-admin
  if (tenantSlug === 'admin') {
    return `${BACKEND_URL}/api${endpoint}`;
  }
  
  // Pour les tenants
  // Retirer le / initial de l'endpoint s'il existe
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${BACKEND_URL}/api/${tenantSlug}${cleanEndpoint}`;
};

/**
 * Effectue une requête API avec gestion automatique du tenant
 * @param {string} tenantSlug - Le slug du tenant
 * @param {string} endpoint - L'endpoint API
 * @param {object} options - Options fetch (method, headers, body, etc.)
 * @returns {Promise} Résultat de la requête
 */
export const apiCall = async (tenantSlug, endpoint, options = {}) => {
  const url = buildApiUrl(tenantSlug, endpoint);
  
  // Ajouter le token d'authentification si présent
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const config = {
    ...options,
    headers,
  };
  
  try {
    const response = await fetch(url, config);
    
    // Si 401 ou 403, le token est invalide - nettoyer et rediriger vers login
    if (response.status === 401 || response.status === 403) {
      console.log('Token invalide ou expiré, nettoyage et redirection...');
      localStorage.clear(); // Nettoyer TOUT le localStorage
      sessionStorage.clear(); // Nettoyer aussi sessionStorage
      
      // Attendre un peu pour éviter les boucles de redirection
      setTimeout(() => {
        window.location.href = `/${tenantSlug}`;
      }, 100);
      return;
    }
    
    // Si 404 sur le tenant, rediriger vers erreur
    if (response.status === 404 && response.statusText.includes('Caserne')) {
      window.location.href = '/tenant-not-found';
      return;
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Erreur API');
    }
    
    return data;
  } catch (error) {
    // Si erreur réseau ou parsing JSON
    if (error.name === 'TypeError' || error.message.includes('JSON')) {
      console.error('Erreur réseau ou parsing:', error);
    }
    throw error;
  }
};

/**
 * Helper pour les requêtes GET
 */
export const apiGet = (tenantSlug, endpoint) => {
  return apiCall(tenantSlug, endpoint, { method: 'GET' });
};

/**
 * Helper pour les requêtes POST
 */
export const apiPost = (tenantSlug, endpoint, data) => {
  return apiCall(tenantSlug, endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
};

/**
 * Helper pour les requêtes PUT
 */
export const apiPut = (tenantSlug, endpoint, data) => {
  return apiCall(tenantSlug, endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
};

/**
 * Helper pour les requêtes PATCH
 */
export const apiPatch = (tenantSlug, endpoint, data) => {
  return apiCall(tenantSlug, endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
};

/**
 * Helper pour les requêtes DELETE
 */
export const apiDelete = (tenantSlug, endpoint) => {
  return apiCall(tenantSlug, endpoint, { method: 'DELETE' });
};

export default {
  buildApiUrl,
  apiCall,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
};
