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
      // Demander la permission
      console.log('[PushNotifications] Requesting permissions...');
      const permResult = await PushNotifications.requestPermissions();
      console.log('[PushNotifications] Permission result:', permResult);
      
      if (permResult.receive === 'granted') {
        // Enregistrer l'appareil pour recevoir des notifications
        console.log('[PushNotifications] Registering device...');
        await PushNotifications.register();

        // Listener pour le token FCM
        await PushNotifications.addListener('registration', async (token) => {
          console.log('[PushNotifications] Registration success, token:', token.value?.substring(0, 50) + '...');
          
          // Envoyer le token au backend
          try {
            const response = await apiPost(tenantSlug, '/notifications/register-device', {
              user_id: userId,
              device_token: token.value,
              platform: Capacitor.getPlatform()
            });
            console.log('[PushNotifications] Device token saved to backend:', response);
          } catch (error) {
            console.error('[PushNotifications] Error saving device token:', error);
          }
        });

        // Listener pour les erreurs d'enregistrement
        await PushNotifications.addListener('registrationError', (error) => {
          console.error('[PushNotifications] Registration error:', JSON.stringify(error));
        });

        // Listener pour les notifications reçues (app au premier plan)
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PushNotifications] Notification received:', notification);
        });

        // Listener pour les actions sur les notifications (app en arrière-plan)
        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('[PushNotifications] Action performed:', notification.actionId, notification.notification);
        });

        this.isInitialized = true;
        console.log('[PushNotifications] Initialized successfully');
        return true;
      } else {
        console.log('[PushNotifications] Permission not granted:', permResult.receive);
        return false;
      }
    } catch (error) {
      console.error('[PushNotifications] Initialization error:', error);
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
      console.log('Push notifications: Unregistered');
    } catch (error) {
      console.error('Error unregistering push notifications:', error);
    }
  }
}

export default PushNotificationService;
