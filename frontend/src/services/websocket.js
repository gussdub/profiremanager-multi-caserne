/**
 * Service WebSocket pour la synchronisation temps réel
 * Se connecte au backend et écoute les mises à jour
 */

class WebSocketService {
  static instance = null;
  static ws = null;
  static reconnectAttempts = 0;
  static maxReconnectAttempts = 10;
  static reconnectDelay = 3000;
  static listeners = new Map();
  static isConnecting = false;
  static tenantSlug = null;
  static userId = null;
  static pingInterval = null;

  /**
   * Obtenir l'instance singleton
   */
  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Se connecter au WebSocket
   * @param {string} tenantSlug - Slug du tenant
   * @param {string} userId - ID de l'utilisateur
   */
  static connect(tenantSlug, userId) {
    if (WebSocketService.isConnecting) {
      console.log('[WebSocket] Connexion déjà en cours...');
      return;
    }

    if (WebSocketService.ws && WebSocketService.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Déjà connecté');
      return;
    }

    WebSocketService.tenantSlug = tenantSlug;
    WebSocketService.userId = userId;
    WebSocketService.isConnecting = true;

    // Construire l'URL WebSocket
    const backendUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    const wsProtocol = backendUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = backendUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}://${wsHost}/ws/${tenantSlug}/${userId}`;

    console.log('[WebSocket] Connexion à:', wsUrl);

    try {
      WebSocketService.ws = new WebSocket(wsUrl);

      WebSocketService.ws.onopen = () => {
        console.log('[WebSocket] ✅ Connecté');
        WebSocketService.isConnecting = false;
        WebSocketService.reconnectAttempts = 0;
        
        // Démarrer le ping pour garder la connexion active
        WebSocketService.startPing();
        
        // Notifier les listeners de la connexion
        WebSocketService.emit('connected', { tenantSlug, userId });
      };

      WebSocketService.ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') {
            return; // Réponse au ping, ignorer
          }
          
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message reçu:', message.type, message.action || '');
          
          // Émettre l'événement aux listeners
          WebSocketService.emit(message.type, message);
          
          // Émettre aussi un événement global "update" pour faciliter le refresh
          WebSocketService.emit('update', message);
        } catch (e) {
          console.log('[WebSocket] Message non-JSON reçu:', event.data);
        }
      };

      WebSocketService.ws.onclose = (event) => {
        console.log('[WebSocket] Déconnecté:', event.code, event.reason);
        WebSocketService.isConnecting = false;
        WebSocketService.stopPing();
        
        // Tenter une reconnexion si ce n'était pas une fermeture volontaire
        if (event.code !== 1000 && WebSocketService.reconnectAttempts < WebSocketService.maxReconnectAttempts) {
          WebSocketService.scheduleReconnect();
        }
        
        WebSocketService.emit('disconnected', { code: event.code, reason: event.reason });
      };

      WebSocketService.ws.onerror = (error) => {
        console.error('[WebSocket] Erreur:', error);
        WebSocketService.isConnecting = false;
        WebSocketService.emit('error', error);
      };

    } catch (error) {
      console.error('[WebSocket] Erreur création:', error);
      WebSocketService.isConnecting = false;
    }
  }

  /**
   * Planifier une reconnexion
   */
  static scheduleReconnect() {
    WebSocketService.reconnectAttempts++;
    const delay = WebSocketService.reconnectDelay * WebSocketService.reconnectAttempts;
    
    console.log(`[WebSocket] Reconnexion dans ${delay/1000}s (tentative ${WebSocketService.reconnectAttempts}/${WebSocketService.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (WebSocketService.tenantSlug && WebSocketService.userId) {
        WebSocketService.connect(WebSocketService.tenantSlug, WebSocketService.userId);
      }
    }, delay);
  }

  /**
   * Démarrer le ping périodique
   */
  static startPing() {
    WebSocketService.stopPing();
    WebSocketService.pingInterval = setInterval(() => {
      if (WebSocketService.ws && WebSocketService.ws.readyState === WebSocket.OPEN) {
        WebSocketService.ws.send('ping');
      }
    }, 30000); // Ping toutes les 30 secondes
  }

  /**
   * Arrêter le ping
   */
  static stopPing() {
    if (WebSocketService.pingInterval) {
      clearInterval(WebSocketService.pingInterval);
      WebSocketService.pingInterval = null;
    }
  }

  /**
   * Se déconnecter proprement
   */
  static disconnect() {
    console.log('[WebSocket] Déconnexion volontaire');
    WebSocketService.stopPing();
    
    if (WebSocketService.ws) {
      WebSocketService.ws.close(1000, 'Déconnexion volontaire');
      WebSocketService.ws = null;
    }
    
    WebSocketService.tenantSlug = null;
    WebSocketService.userId = null;
    WebSocketService.reconnectAttempts = 0;
  }

  /**
   * Ajouter un listener pour un type d'événement
   * @param {string} eventType - Type d'événement (planning_update, remplacement_update, etc.)
   * @param {function} callback - Fonction à appeler
   * @returns {function} Fonction pour supprimer le listener
   */
  static on(eventType, callback) {
    if (!WebSocketService.listeners.has(eventType)) {
      WebSocketService.listeners.set(eventType, new Set());
    }
    WebSocketService.listeners.get(eventType).add(callback);
    
    // Retourner une fonction de cleanup
    return () => {
      WebSocketService.off(eventType, callback);
    };
  }

  /**
   * Supprimer un listener
   */
  static off(eventType, callback) {
    if (WebSocketService.listeners.has(eventType)) {
      WebSocketService.listeners.get(eventType).delete(callback);
    }
  }

  /**
   * Émettre un événement à tous les listeners
   */
  static emit(eventType, data) {
    if (WebSocketService.listeners.has(eventType)) {
      WebSocketService.listeners.get(eventType).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error('[WebSocket] Erreur dans listener:', e);
        }
      });
    }
  }

  /**
   * Vérifier si connecté
   */
  static isConnected() {
    return WebSocketService.ws && WebSocketService.ws.readyState === WebSocket.OPEN;
  }
}

export default WebSocketService;
