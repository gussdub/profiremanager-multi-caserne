/**
 * Service de gestion du cache Service Worker
 * Permet d'invalider le cache et de détecter les mises à jour
 */

class CacheManager {
  static listeners = [];

  /**
   * Initialise l'écoute des messages du Service Worker
   */
  static init() {
    if (!('serviceWorker' in navigator)) {
      console.log('[CacheManager] Service Worker non supporté');
      return;
    }

    // Écouter les messages du Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, ...data } = event.data || {};
      
      switch (type) {
        case 'SW_UPDATED':
          console.log('[CacheManager] Service Worker mis à jour:', data.version);
          this.notifyListeners('update', data);
          break;
          
        case 'CACHE_CLEARED':
          console.log('[CacheManager] Cache invalidé:', data.cache);
          this.notifyListeners('cleared', data);
          break;
          
        case 'CACHE_STATUS':
          console.log('[CacheManager] Statut cache:', data);
          this.notifyListeners('status', data);
          break;
          
        case 'NAVIGATE':
          // Le SW demande de naviguer vers une URL
          if (data.url && window.location.pathname !== data.url) {
            window.location.href = data.url;
          }
          break;
      }
    });

    // Détecter les nouvelles versions du Service Worker
    navigator.serviceWorker.ready.then((registration) => {
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // Nouvelle version disponible
            console.log('[CacheManager] Nouvelle version SW disponible');
            this.notifyListeners('newVersion', {});
          }
        });
      });
    });
  }

  /**
   * Ajoute un écouteur d'événements
   * @param {Function} callback - Fonction appelée avec (eventType, data)
   * @returns {Function} - Fonction pour se désabonner
   */
  static addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notifie tous les écouteurs
   */
  static notifyListeners(eventType, data) {
    this.listeners.forEach(callback => {
      try {
        callback(eventType, data);
      } catch (e) {
        console.error('[CacheManager] Erreur listener:', e);
      }
    });
  }

  /**
   * Invalide le cache API (données)
   * À appeler après des actions importantes (login, import, etc.)
   */
  static async clearApiCache() {
    if (!navigator.serviceWorker?.controller) {
      console.log('[CacheManager] Pas de SW actif');
      return false;
    }

    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === 'CACHE_CLEARED' && event.data?.cache === 'api') {
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve(true);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handler);
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_API_CACHE' });
      
      // Timeout de sécurité
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Invalide tous les caches (données + assets)
   * À utiliser avec prudence - force le rechargement complet
   */
  static async clearAllCache() {
    if (!navigator.serviceWorker?.controller) {
      return false;
    }

    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === 'CACHE_CLEARED' && event.data?.cache === 'all') {
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve(true);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handler);
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_ALL_CACHE' });
      
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Force la mise à jour du Service Worker
   */
  static async forceUpdate() {
    if (!('serviceWorker' in navigator)) {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
      
      // Si une nouvelle version est en attente, l'activer
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[CacheManager] Erreur mise à jour:', error);
      return false;
    }
  }

  /**
   * Récupère le statut du cache
   */
  static async getCacheStatus() {
    if (!navigator.serviceWorker?.controller) {
      return null;
    }

    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === 'CACHE_STATUS') {
          navigator.serviceWorker.removeEventListener('message', handler);
          resolve(event.data);
        }
      };
      
      navigator.serviceWorker.addEventListener('message', handler);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_CACHE_STATUS' });
      
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve(null);
      }, 3000);
    });
  }

  /**
   * Recharge la page après invalidation du cache
   */
  static async clearAndReload() {
    await this.clearAllCache();
    window.location.reload(true);
  }
}

export default CacheManager;
