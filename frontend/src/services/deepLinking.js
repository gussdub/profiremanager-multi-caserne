/**
 * Deep Linking Service pour ProFireManager
 * 
 * Gère les liens universels (iOS) et App Links (Android) pour ouvrir
 * l'application directement dans le bon module depuis les emails.
 * 
 * Note: Ce service utilise des imports dynamiques pour éviter les erreurs
 * de build sur Vercel où Capacitor n'est pas disponible.
 */

/**
 * Vérifie si on est sur une plateforme native (iOS/Android)
 */
const isNativePlatform = () => {
  try {
    // Vérifier si Capacitor est disponible via window
    return window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Initialise le gestionnaire de deep links
 * @param {Function} navigate - Fonction de navigation React Router
 * @param {string} tenantSlug - Slug du tenant actuel
 */
export const initDeepLinkHandler = (navigate, tenantSlug) => {
  // Ne rien faire sur le web
  if (!isNativePlatform()) {
    console.log('[DeepLink] Running on web, skipping native deep link handler');
    return;
  }

  console.log('[DeepLink] Initializing deep link handler for native platform');

  // Sur plateforme native, Capacitor est disponible via window
  const App = window.Capacitor?.Plugins?.App;
  
  if (!App) {
    console.log('[DeepLink] Capacitor App plugin not available');
    return;
  }

  // Gérer les liens ouverts quand l'app est déjà en cours d'exécution
  App.addListener('appUrlOpen', (event) => {
    console.log('[DeepLink] App URL opened:', event.url);
    handleDeepLink(event.url, navigate, tenantSlug);
  });

  // Vérifier si l'app a été lancée via un deep link
  App.getLaunchUrl().then((result) => {
    if (result && result.url) {
      console.log('[DeepLink] App launched with URL:', result.url);
      handleDeepLink(result.url, navigate, tenantSlug);
    }
  }).catch((err) => {
    console.log('[DeepLink] Error getting launch URL:', err);
  });
};

/**
 * Parse et navigue vers la bonne route basé sur l'URL
 * @param {string} url - URL du deep link
 * @param {Function} navigate - Fonction de navigation
 * @param {string} currentTenantSlug - Slug du tenant actuel
 */
const handleDeepLink = (url, navigate, currentTenantSlug) => {
  try {
    console.log('[DeepLink] Handling URL:', url);
    
    // Parser l'URL
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const searchParams = urlObj.searchParams;
    
    console.log('[DeepLink] Pathname:', pathname);
    console.log('[DeepLink] Search params:', Object.fromEntries(searchParams));
    
    // Extraire le tenant slug et le module du pathname
    // Format attendu: /{tenant_slug}/{module}
    const pathParts = pathname.split('/').filter(Boolean);
    
    if (pathParts.length < 2) {
      console.log('[DeepLink] Invalid path format, navigating to dashboard');
      navigate('/');
      return;
    }
    
    const tenantSlug = pathParts[0];
    const module = pathParts[1];
    
    // Vérifier si c'est le bon tenant
    if (currentTenantSlug && tenantSlug !== currentTenantSlug) {
      console.log(`[DeepLink] Tenant mismatch: expected ${currentTenantSlug}, got ${tenantSlug}`);
    }
    
    // Construire le chemin de navigation
    let targetPath = `/${module}`;
    
    // Ajouter les query params si présents
    const queryString = urlObj.search;
    if (queryString) {
      targetPath += queryString;
    }
    
    console.log('[DeepLink] Navigating to:', targetPath);
    navigate(targetPath);
    
    // Gérer les actions spécifiques selon le module
    handleModuleSpecificActions(module, searchParams);
    
  } catch (error) {
    console.error('[DeepLink] Error handling deep link:', error);
  }
};

/**
 * Gère les actions spécifiques à chaque module
 * @param {string} module - Nom du module
 * @param {URLSearchParams} params - Paramètres de l'URL
 */
const handleModuleSpecificActions = (module, params) => {
  const itemId = params.get('id');
  const highlight = params.get('highlight');
  
  switch (module) {
    case 'remplacements':
      if (itemId || highlight) {
        const event = new CustomEvent('deeplink:remplacement', {
          detail: { 
            demandeId: itemId || highlight,
            tab: params.get('tab') || 'mes-demandes'
          }
        });
        window.dispatchEvent(event);
      }
      break;
      
    case 'planning':
      if (params.get('date')) {
        const event = new CustomEvent('deeplink:planning', {
          detail: { date: params.get('date') }
        });
        window.dispatchEvent(event);
      }
      break;
      
    case 'epi':
      if (itemId) {
        const event = new CustomEvent('deeplink:epi', {
          detail: { epiId: itemId }
        });
        window.dispatchEvent(event);
      }
      break;
      
    case 'interventions':
      if (itemId) {
        const event = new CustomEvent('deeplink:intervention', {
          detail: { interventionId: itemId }
        });
        window.dispatchEvent(event);
      }
      break;
      
    default:
      console.log(`[DeepLink] No specific handler for module: ${module}`);
  }
};

/**
 * Génère un lien universel pour l'application
 * @param {string} tenantSlug - Slug du tenant
 * @param {string} module - Module cible
 * @param {Object} params - Paramètres additionnels
 * @returns {string} URL complète
 */
export const generateUniversalLink = (tenantSlug, module, params = {}) => {
  const baseUrl = 'https://www.profiremanager.ca';
  let url = `${baseUrl}/${tenantSlug}/${module}`;
  
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      queryParams.append(key, value);
    }
  });
  
  const queryString = queryParams.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  return url;
};

export default {
  initDeepLinkHandler,
  generateUniversalLink
};
