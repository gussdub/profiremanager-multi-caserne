/* eslint-disable no-restricted-globals */
/**
 * Service Worker pour ProFireManager PWA
 * Gère le cache offline et permet le fonctionnement sans connexion
 */

const CACHE_NAME = 'profiremanager-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js',
  '/static/js/bundle.js'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installation...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cache ouvert');
        // Ne pas bloquer l'installation si certains fichiers échouent
        return Promise.allSettled(
          urlsToCache.map(url => 
            cache.add(url).catch(err => console.log(`[Service Worker] Échec cache ${url}:`, err))
          )
        );
      })
      .then(() => self.skipWaiting()) // Activer immédiatement
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activation...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de cache: Network First avec fallback sur Cache
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignorer les requêtes vers des domaines externes (sauf API)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse est valide, la mettre en cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // En cas d'échec réseau, essayer le cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Réponse depuis cache:', event.request.url);
            return cachedResponse;
          }
          
          // Si pas en cache et que c'est une navigation, retourner la page d'accueil cachée
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          
          // Sinon, réponse offline générique
          return new Response('Contenu non disponible hors ligne', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        });
      })
  );
});

// Écouter les messages du client (pour forcer la mise à jour)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
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
