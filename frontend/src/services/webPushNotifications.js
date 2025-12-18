/**
 * Service de notifications push Web pour PWA
 * Fonctionne sur iOS 16.4+ (PWA installée) et tous les navigateurs modernes
 */

// Clé publique VAPID (à générer côté serveur et partager ici)
// Cette clé sera configurée via l'API
let VAPID_PUBLIC_KEY = null;

class WebPushNotificationService {
  static isInitialized = false;
  static subscription = null;

  /**
   * Vérifie si les notifications push sont supportées
   */
  static isSupported() {
    return 'serviceWorker' in navigator && 
           'PushManager' in window && 
           'Notification' in window;
  }

  /**
   * Vérifie si l'app est installée comme PWA (mode standalone)
   */
  static isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
  }

  /**
   * Récupère la clé VAPID publique depuis le serveur
   */
  static async getVapidKey(tenantSlug) {
    try {
      const API = process.env.REACT_APP_BACKEND_URL || '';
      const response = await fetch(`${API}/api/${tenantSlug}/notifications/vapid-key`);
      if (response.ok) {
        const data = await response.json();
        VAPID_PUBLIC_KEY = data.publicKey;
        return VAPID_PUBLIC_KEY;
      }
    } catch (error) {
      console.error('[WebPush] Erreur récupération clé VAPID:', error);
    }
    return null;
  }

  /**
   * Demande la permission de notifications
   */
  static async requestPermission() {
    if (!this.isSupported()) {
      console.log('[WebPush] Non supporté sur ce navigateur');
      return 'unsupported';
    }

    const permission = await Notification.requestPermission();
    console.log('[WebPush] Permission:', permission);
    return permission;
  }

  /**
   * Initialise les notifications push
   * @param {string} tenantSlug - Slug du tenant
   * @param {string} userId - ID de l'utilisateur
   * @param {string} token - Token d'authentification
   */
  static async initialize(tenantSlug, userId, token) {
    if (!this.isSupported()) {
      console.log('[WebPush] Notifications non supportées');
      return { success: false, reason: 'unsupported' };
    }

    if (this.isInitialized) {
      console.log('[WebPush] Déjà initialisé');
      return { success: true, reason: 'already_initialized' };
    }

    try {
      // 1. Vérifier/demander la permission
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.log('[WebPush] Permission refusée');
        return { success: false, reason: 'permission_denied' };
      }

      // 2. Récupérer la clé VAPID
      await this.getVapidKey(tenantSlug);
      if (!VAPID_PUBLIC_KEY) {
        console.log('[WebPush] Clé VAPID non disponible - notifications désactivées');
        return { success: false, reason: 'no_vapid_key' };
      }

      // 3. Enregistrer le service worker
      const registration = await navigator.serviceWorker.ready;
      console.log('[WebPush] Service Worker prêt');

      // 4. S'abonner aux notifications push
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      };

      this.subscription = await registration.pushManager.subscribe(subscribeOptions);
      console.log('[WebPush] Abonnement créé:', this.subscription.endpoint);

      // 5. Envoyer l'abonnement au serveur
      const API = process.env.REACT_APP_BACKEND_URL || '';
      const response = await fetch(`${API}/api/${tenantSlug}/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userId,
          subscription: this.subscription.toJSON(),
          platform: 'web',
          user_agent: navigator.userAgent
        })
      });

      if (response.ok) {
        this.isInitialized = true;
        console.log('[WebPush] Initialisé avec succès');
        return { success: true, reason: 'subscribed' };
      } else {
        console.error('[WebPush] Erreur enregistrement serveur');
        return { success: false, reason: 'server_error' };
      }

    } catch (error) {
      console.error('[WebPush] Erreur initialisation:', error);
      return { success: false, reason: 'error', error: error.message };
    }
  }

  /**
   * Affiche une notification locale (sans serveur push)
   */
  static async showLocalNotification(title, body, options = {}) {
    if (!this.isSupported()) return false;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    
    await registration.showNotification(title, {
      body,
      icon: '/logo192.png',
      badge: '/logo192.png',
      vibrate: [200, 100, 200],
      requireInteraction: true,
      ...options
    });

    return true;
  }

  /**
   * Désabonne des notifications
   */
  static async unsubscribe(tenantSlug, userId, token) {
    if (!this.subscription) return;

    try {
      await this.subscription.unsubscribe();
      
      // Notifier le serveur
      const API = process.env.REACT_APP_BACKEND_URL || '';
      await fetch(`${API}/api/${tenantSlug}/notifications/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: userId })
      });

      this.subscription = null;
      this.isInitialized = false;
      console.log('[WebPush] Désabonné');
    } catch (error) {
      console.error('[WebPush] Erreur désabonnement:', error);
    }
  }

  /**
   * Convertit une clé base64 en Uint8Array (requis pour VAPID)
   */
  static urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Vérifie l'état actuel des notifications
   */
  static async getStatus() {
    if (!this.isSupported()) {
      return {
        supported: false,
        permission: 'unsupported',
        subscribed: false,
        isPWA: this.isPWAInstalled()
      };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    return {
      supported: true,
      permission: Notification.permission,
      subscribed: !!subscription,
      isPWA: this.isPWAInstalled(),
      subscription: subscription ? subscription.toJSON() : null
    };
  }
}

export default WebPushNotificationService;
