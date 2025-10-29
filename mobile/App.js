import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotificationsAsync, setupNotificationListeners } from './src/services/notifications';

function AppContent() {
  const navigationRef = useRef();

  useEffect(() => {
    // Enregistrer pour les notifications push
    registerForPushNotificationsAsync();

    // Configurer les listeners de notifications
    let unsubscribe;
    if (navigationRef.current) {
      unsubscribe = setupNotificationListeners(navigationRef.current);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <AppNavigator ref={navigationRef} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
