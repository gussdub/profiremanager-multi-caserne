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
    // Vérifier si on est sur une plateforme mobile
    if (!Capacitor.isNativePlatform()) {
      console.log('Push notifications: Not on native platform, skipping initialization');
      return false;
    }

    if (this.isInitialized) {
      console.log('Push notifications: Already initialized');
      return true;
    }

    try {
      // Demander la permission
      const permResult = await PushNotifications.requestPermissions();
      
      if (permResult.receive === 'granted') {
        // Enregistrer l'appareil pour recevoir des notifications
        await PushNotifications.register();

        // Listener pour le token FCM
        await PushNotifications.addListener('registration', async (token) => {
          console.log('Push registration success, token: ' + token.value);
          
          // Envoyer le token au backend
          try {
            await apiPost(tenantSlug, '/notifications/register-device', {
              user_id: userId,
              device_token: token.value,
              platform: Capacitor.getPlatform()
            });
            console.log('Device token saved to backend');
          } catch (error) {
            console.error('Error saving device token:', error);
          }
        });

        // Listener pour les erreurs d'enregistrement
        await PushNotifications.addListener('registrationError', (error) => {
          console.error('Error on registration: ' + JSON.stringify(error));
        });

        // Listener pour les notifications reçues (app au premier plan)
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received: ', notification);
          // Vous pouvez afficher un toast ou une alerte ici
        });

        // Listener pour les actions sur les notifications (app en arrière-plan)
        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed', notification.actionId, notification.notification);
          // Vous pouvez naviguer vers une page spécifique ici
          // Par exemple, ouvrir le module remplacements si c'est une notification de remplacement
        });

        this.isInitialized = true;
        console.log('Push notifications: Initialized successfully');
        return true;
      } else {
        console.log('Push notifications: Permission not granted');
        return false;
      }
    } catch (error) {
      console.error('Push notifications: Initialization error', error);
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
