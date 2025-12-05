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
