/* eslint-disable no-restricted-globals */
/**
 * Service Worker pour ProFireManager PWA
 * Gère le cache offline et permet le fonctionnement sans connexion
 * 
 * Stratégie de cache:
 * - Assets statiques: Cache First (CSS, JS, images)
 * - API: Network First avec TTL court (données fraîches prioritaires)
 * - Navigation: Network First avec fallback offline
 */

// Version du cache - incrémenter pour forcer la mise à jour
const CACHE_VERSION = 'v2';
const STATIC_CACHE_NAME = `profiremanager-static-${CACHE_VERSION}`;
const API_CACHE_NAME = `profiremanager-api-${CACHE_VERSION}`;

// TTL pour le cache API (en millisecondes)
const API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Assets à pré-cacher (fichiers critiques pour le mode offline)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo192.png'
];

// Patterns pour identifier les requêtes API (à ne pas cacher longtemps)
const API_PATTERNS = [
  /\/api\//,
  /\/users/,
  /\/personnel/,
  /\/inspections/,
  /\/batiments/,
  /\/interventions/,
  /\/planning/,
  /\/notifications/
];

/**
 * Vérifie si une URL correspond à une requête API
 */
function isApiRequest(url) {
  return API_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Vérifie si une réponse cachée est encore valide (non expirée)
 */
function isCacheValid(cachedResponse) {
  if (!cachedResponse) return false;
  
  const cachedTime = cachedResponse.headers.get('sw-cache-time');
  if (!cachedTime) return true; // Pas de timestamp = toujours valide (assets statiques)
  
  const age = Date.now() - parseInt(cachedTime, 10);
  return age < API_CACHE_TTL;
}

/**
 * Ajoute un timestamp à une réponse pour le TTL
 */
function addCacheTimestamp(response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cache-time', Date.now().toString());
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pré-cache des assets statiques');
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => console.log(`[SW] Échec cache ${url}:`, err))
          )
        );
      })
      .then(() => self.skipWaiting()) // Activer immédiatement
  );
});

// Activation du Service Worker - Nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation...', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Supprimer tous les caches qui ne correspondent pas à la version actuelle
          if (!cacheName.includes(CACHE_VERSION)) {
            console.log('[Service Worker] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Prendre le contrôle immédiatement de toutes les pages
      return self.clients.claim();
    }).then(() => {
      // Notifier les clients que le SW est mis à jour
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

// Gestion des requêtes fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorer les requêtes externes (sauf Azure Blob pour les images)
  if (url.origin !== self.location.origin && 
      !url.hostname.includes('blob.core.windows.net')) {
    return;
  }
  
  // Stratégie différente selon le type de requête
  if (isApiRequest(url.pathname)) {
    // API: Network First avec cache TTL court
    event.respondWith(networkFirstWithTTL(request));
  } else {
    // Assets statiques: Network First avec fallback cache
    event.respondWith(networkFirstWithCache(request));
  }
});

/**
 * Stratégie Network First avec TTL pour les API
 * - Essaie le réseau en premier
 * - Cache la réponse avec un timestamp
 * - Utilise le cache seulement si réseau indisponible ET cache non expiré
 */
async function networkFirstWithTTL(request) {
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      const cache = await caches.open(API_CACHE_NAME);
      const responseToCache = addCacheTimestamp(response.clone());
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    // Réseau indisponible - vérifier le cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse && isCacheValid(cachedResponse)) {
      console.log('[SW] API depuis cache (TTL valide):', request.url);
      return cachedResponse;
    }
    
    // Cache expiré ou absent - retourner erreur
    console.log('[SW] Requête API échouée, pas de cache valide:', request.url);
    return new Response(JSON.stringify({ 
      error: 'offline', 
      message: 'Données non disponibles hors ligne' 
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Stratégie Network First avec fallback cache pour les assets
 */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Asset depuis cache:', request.url);
      return cachedResponse;
    }
    
    // Si c'est une navigation, retourner la page d'accueil
    if (request.mode === 'navigate') {
      return caches.match('/');
    }
    
    return new Response('Contenu non disponible hors ligne', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Écouter les messages du client
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_API_CACHE':
      // Invalider tout le cache API
      caches.delete(API_CACHE_NAME).then(() => {
        console.log('[SW] Cache API invalidé');
        event.source.postMessage({ type: 'CACHE_CLEARED', cache: 'api' });
      });
      break;
      
    case 'CLEAR_ALL_CACHE':
      // Invalider tous les caches
      caches.keys().then(names => {
        return Promise.all(names.map(name => caches.delete(name)));
      }).then(() => {
        console.log('[SW] Tous les caches invalidés');
        event.source.postMessage({ type: 'CACHE_CLEARED', cache: 'all' });
      });
      break;
      
    case 'GET_CACHE_STATUS':
      // Retourner le statut du cache
      Promise.all([
        caches.open(STATIC_CACHE_NAME).then(c => c.keys()),
        caches.open(API_CACHE_NAME).then(c => c.keys())
      ]).then(([staticKeys, apiKeys]) => {
        event.source.postMessage({
          type: 'CACHE_STATUS',
          version: CACHE_VERSION,
          static: staticKeys.length,
          api: apiKeys.length
        });
      });
      break;
  }
});

// ============================================
// NOTIFICATIONS PUSH WEB
// ============================================

// Écouter les notifications push du serveur
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push reçu:', event);
  
  let notificationData = {
    title: 'ProFireManager',
    body: 'Nouvelle notification',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: 'profiremanager-notification',
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200], // Vibration pattern
    data: {}
  };
  
  // Parser les données du push si présentes
  if (event.data) {
    try {
      const pushData = event.data.json();
      notificationData = {
        ...notificationData,
        title: pushData.title || notificationData.title,
        body: pushData.body || pushData.message || notificationData.body,
        icon: pushData.icon || notificationData.icon,
        tag: pushData.tag || notificationData.tag,
        data: pushData.data || {}
      };
    } catch (e) {
      // Si ce n'est pas du JSON, utiliser le texte brut
      notificationData.body = event.data.text();
    }
  }
  
  // Afficher la notification
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      vibrate: notificationData.vibrate,
      data: notificationData.data,
      actions: [
        { action: 'open', title: 'Ouvrir' },
        { action: 'close', title: 'Fermer' }
      ]
    })
  );
});

// Gérer le clic sur une notification
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification cliquée:', event.notification.tag);
  console.log('[Service Worker] Notification data:', event.notification.data);
  
  event.notification.close();
  
  // Déterminer l'URL à ouvrir
  let urlToOpen = '/';
  const data = event.notification.data || {};
  
  // Priorité: url > lien > tenant/dashboard
  if (data.url) {
    urlToOpen = data.url;
  } else if (data.lien) {
    // Construire l'URL complète avec le tenant
    const tenant = data.tenant || '';
    if (data.lien.startsWith('/')) {
      urlToOpen = tenant ? `/${tenant}${data.lien}` : data.lien;
    } else {
      urlToOpen = data.lien;
    }
  } else if (data.tenant) {
    urlToOpen = `/${data.tenant}/dashboard`;
  }
  
  // Ajouter les paramètres de navigation si présents
  if (data.type === 'remplacement_demande' || data.type === 'remplacement_epi') {
    // Rediriger vers la section remplacements
    const tenant = data.tenant || '';
    urlToOpen = tenant ? `/${tenant}/remplacements` : '/remplacements';
    if (data.demande_id) {
      urlToOpen += `?demande=${data.demande_id}`;
    }
  } else if (data.type === 'inspection_alerte' || data.type === 'equipement_alerte') {
    // Rediriger vers la gestion des actifs
    const tenant = data.tenant || '';
    urlToOpen = tenant ? `/${tenant}/actifs` : '/actifs';
  } else if (data.type === 'borne_seche' || data.type === 'point_eau') {
    // Rediriger vers les points d'eau
    const tenant = data.tenant || '';
    urlToOpen = tenant ? `/${tenant}/actifs?tab=eau` : '/actifs?tab=eau';
  } else if (data.type === 'epi_inspection' || data.type === 'epi_remplacement') {
    // Rediriger vers les EPI
    const tenant = data.tenant || '';
    urlToOpen = tenant ? `/${tenant}/epi` : '/epi';
  }
  
  console.log('[Service Worker] URL à ouvrir:', urlToOpen);
  
  // Ouvrir ou focus la fenêtre
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Chercher une fenêtre déjà ouverte sur le même tenant
        for (const client of windowClients) {
          // Vérifier si une fenêtre existe déjà
          const clientUrl = new URL(client.url);
          const targetUrl = new URL(urlToOpen, self.location.origin);
          
          if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
            // Naviguer vers la bonne section si nécessaire
            client.postMessage({
              type: 'NAVIGATE',
              url: urlToOpen,
              data: data
            });
            return client.focus();
          }
        }
        
        // Chercher n'importe quelle fenêtre de l'app
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NAVIGATE',
              url: urlToOpen,
              data: data
            });
            return client.focus();
          }
        }
        
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Gérer la fermeture d'une notification
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification fermée:', event.notification.tag);
});
