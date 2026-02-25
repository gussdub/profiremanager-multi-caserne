import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { apiPost } from '../utils/api';

/**
 * Service de gestion des notifications push
 * Gère l'enregistrement des tokens et la réception des notifications
 */

export class PushNotificationService {
  static isInitialized = false;

  /**
   * Initialise le service de notifications push
   * @param {string} tenantSlug - Slug du tenant
   * @param {string} userId - ID de l'utilisateur
   */
  static async initialize(tenantSlug, userId) {
    console.log('[PushNotifications] Initialize called - Platform:', Capacitor.getPlatform(), 'isNative:', Capacitor.isNativePlatform());
    
    // Vérifier si on est sur une plateforme mobile
    if (!Capacitor.isNativePlatform()) {
      console.log('[PushNotifications] Not on native platform, skipping initialization');
      return false;
    }

    if (this.isInitialized) {
      console.log('[PushNotifications] Already initialized');
      return true;
    }

    try {
      // IMPORTANT: Ajouter les listeners AVANT d'appeler register()
      console.log('[PushNotifications] Setting up listeners...');
      
      // Listener pour le token FCM - doit être ajouté AVANT register()
      await PushNotifications.addListener('registration', async (token) => {
        let deviceToken = token.value;
        
        // Décoder le token si c'est du hexadécimal (iOS avec Firebase)
        // Le token FCM contient toujours ":" mais le hex n'en contient pas directement
        if (deviceToken && !deviceToken.includes(':') && /^[0-9a-fA-F]+$/.test(deviceToken)) {
          try {
            // Convertir hex en string
            const hexString = deviceToken;
            let decodedToken = '';
            for (let i = 0; i < hexString.length; i += 2) {
              decodedToken += String.fromCharCode(parseInt(hexString.substr(i, 2), 16));
            }
            console.log('[PushNotifications] Token décodé du hex:', decodedToken.substring(0, 50) + '...');
            deviceToken = decodedToken;
          } catch (e) {
            console.log('[PushNotifications] Pas besoin de décoder le token');
          }
        }
        
        console.log('[PushNotifications] ✅ Registration success, token:', deviceToken?.substring(0, 50) + '...');
        
        // Envoyer le token au backend
        try {
          const response = await apiPost(tenantSlug, '/notifications/register-device', {
            user_id: userId,
            device_token: deviceToken,
            platform: Capacitor.getPlatform()
          });
          console.log('[PushNotifications] ✅ Device token saved to backend:', response);
        } catch (error) {
          console.error('[PushNotifications] ❌ Error saving device token:', error);
        }
      });

      // Listener pour les erreurs d'enregistrement
      await PushNotifications.addListener('registrationError', (error) => {
        console.error('[PushNotifications] ❌ Registration error:', JSON.stringify(error));
      });

      // Listener pour les notifications reçues (app au premier plan)
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('[PushNotifications] 📬 Notification received:', notification);
      });

      // Listener pour les actions sur les notifications (app en arrière-plan)
      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[PushNotifications] 👆 Action performed:', notification.actionId, notification.notification);
      });

      console.log('[PushNotifications] Listeners ready, requesting permissions...');
      
      // Demander la permission
      const permResult = await PushNotifications.requestPermissions();
      console.log('[PushNotifications] Permission result:', permResult);
      
      if (permResult.receive === 'granted') {
        // Enregistrer l'appareil pour recevoir des notifications
        console.log('[PushNotifications] Registering device with APNs/FCM...');
        await PushNotifications.register();
        console.log('[PushNotifications] Register called, waiting for token...');

        this.isInitialized = true;
        console.log('[PushNotifications] ✅ Initialized successfully');
        return true;
      } else {
        console.log('[PushNotifications] ❌ Permission not granted:', permResult.receive);
        return false;
      }
    } catch (error) {
      console.error('[PushNotifications] ❌ Initialization error:', error);
      return false;
    }
  }

  /**
   * Désenregistre l'appareil (logout)
   */
  static async unregister() {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      await PushNotifications.removeAllListeners();
      this.isInitialized = false;
      console.log('[PushNotifications] Unregistered');
    } catch (error) {
      console.error('[PushNotifications] Error unregistering:', error);
    }
  }
}

export default PushNotificationService;
