import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      alert('Permissions de notification refusées!');
      return;
    }

    token = (await Notifications.getExpoPushTokenAsync()).data;
    console.log('Push token:', token);

    // Sauvegarder le token localement
    await AsyncStorage.setItem('pushToken', token);

    // Envoyer le token au backend
    try {
      const userData = await AsyncStorage.getItem('userData');
      const tenantData = await AsyncStorage.getItem('tenantData');
      
      if (userData && tenantData) {
        const user = JSON.parse(userData);
        const tenant = JSON.parse(tenantData);
        
        await api.post(`/api/${tenant.slug}/notifications/register-device`, {
          user_id: user.id,
          device_token: token,
          platform: Device.osName.toLowerCase(),
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du token:', error);
    }
  } else {
    alert('Notifications push ne fonctionnent que sur un appareil physique');
  }

  // Configuration Android
  if (Device.osName === 'Android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D9072B',
      sound: true,
      enableVibrate: true,
      showBadge: true,
    });

    // Canal pour les notifications importantes (demandes de remplacement)
    await Notifications.setNotificationChannelAsync('urgent', {
      name: 'Urgent',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#D9072B',
      sound: true,
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  return token;
}

export function setupNotificationListeners(navigation) {
  // Notification reçue quand l'app est au premier plan
  const notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('Notification reçue:', notification);
  });

  // Notification cliquée
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('Notification cliquée:', response);
    const data = response.notification.request.content.data;
    
    // Navigation selon le type de notification
    if (data.type === 'remplacement') {
      navigation.navigate('Remplacements');
    } else if (data.type === 'planning') {
      navigation.navigate('Planning');
    } else if (data.type === 'prevention') {
      navigation.navigate('Prevention');
    }
  });

  return () => {
    Notifications.removeNotificationSubscription(notificationListener);
    Notifications.removeNotificationSubscription(responseListener);
  };
}

export async function scheduleLocalNotification(title, body, data = {}) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: null, // Immédiat
  });
}
