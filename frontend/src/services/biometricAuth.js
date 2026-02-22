/**
 * Service d'authentification biométrique (Touch ID / Face ID)
 * Utilise Capacitor pour accéder aux fonctionnalités natives
 */

import { Capacitor } from '@capacitor/core';

// Import dynamique pour éviter les erreurs sur le web
let BiometricAuth = null;
let SecureStorage = null;

// Initialiser les plugins si on est sur mobile
const initPlugins = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const biometricModule = await import('@aparajita/capacitor-biometric-auth');
      BiometricAuth = biometricModule.BiometricAuth;
      
      const storageModule = await import('@aparajita/capacitor-secure-storage');
      SecureStorage = storageModule.SecureStorage;
      
      console.log('[Biometric] ✅ Plugins chargés avec succès');
      return true;
    } catch (error) {
      console.log('[Biometric] ⚠️ Plugins non disponibles:', error.message);
      return false;
    }
  }
  return false;
};

// Vérifier si l'authentification biométrique est disponible
export const checkBiometricAvailability = async () => {
  // Sur le web, pas de biométrie
  if (!Capacitor.isNativePlatform()) {
    return { available: false, biometryType: null };
  }

  await initPlugins();
  
  if (!BiometricAuth) {
    return { available: false, biometryType: null };
  }

  try {
    const result = await BiometricAuth.checkBiometry();
    console.log('[Biometric] Vérification biométrie:', result);
    
    return {
      available: result.isAvailable,
      biometryType: getBiometryTypeName(result.biometryType),
      strongBiometryIsAvailable: result.strongBiometryIsAvailable
    };
  } catch (error) {
    console.error('[Biometric] Erreur vérification:', error);
    return { available: false, biometryType: null };
  }
};

// Convertir le type de biométrie en nom lisible
const getBiometryTypeName = (type) => {
  // Types possibles: 'none', 'touchId', 'faceId', 'fingerprintAuthentication', 'faceAuthentication', 'irisAuthentication'
  switch (type) {
    case 'touchId':
    case 'fingerprintAuthentication':
      return 'Touch ID';
    case 'faceId':
    case 'faceAuthentication':
      return 'Face ID';
    case 'irisAuthentication':
      return 'Iris';
    default:
      return null;
  }
};

// Authentifier avec biométrie
export const authenticateWithBiometric = async (reason = 'Authentifiez-vous pour vous connecter') => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Biométrie non disponible sur le web');
  }

  await initPlugins();
  
  if (!BiometricAuth) {
    throw new Error('Plugin biométrique non disponible');
  }

  try {
    await BiometricAuth.authenticate({
      reason,
      cancelTitle: 'Annuler',
      allowDeviceCredential: true, // Permet le code PIN en fallback
      iosFallbackTitle: 'Utiliser le code',
      androidTitle: 'Authentification',
      androidSubtitle: 'Utilisez votre empreinte ou Face ID',
      androidConfirmationRequired: false
    });
    
    console.log('[Biometric] ✅ Authentification réussie');
    return true;
  } catch (error) {
    console.error('[Biometric] ❌ Authentification échouée:', error);
    throw error;
  }
};

// Stocker les identifiants de manière sécurisée
export const storeCredentials = async (tenantSlug, email, password) => {
  if (!Capacitor.isNativePlatform()) {
    // Sur le web, utiliser le stockage existant
    return false;
  }

  await initPlugins();
  
  if (!SecureStorage) {
    console.log('[Biometric] SecureStorage non disponible');
    return false;
  }

  try {
    const credentials = {
      email,
      password,
      tenantSlug,
      storedAt: new Date().toISOString()
    };
    
    // Stocker avec le tenant comme partie de la clé
    await SecureStorage.set(`biometric_credentials_${tenantSlug}`, JSON.stringify(credentials));
    console.log('[Biometric] ✅ Identifiants stockés de manière sécurisée');
    return true;
  } catch (error) {
    console.error('[Biometric] ❌ Erreur stockage identifiants:', error);
    return false;
  }
};

// Récupérer les identifiants stockés
export const getStoredCredentials = async (tenantSlug) => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  await initPlugins();
  
  if (!SecureStorage) {
    return null;
  }

  try {
    const result = await SecureStorage.get(`biometric_credentials_${tenantSlug}`);
    
    if (result) {
      const credentials = JSON.parse(result);
      console.log('[Biometric] ✅ Identifiants récupérés pour', tenantSlug);
      return credentials;
    }
    return null;
  } catch (error) {
    console.error('[Biometric] ❌ Erreur récupération identifiants:', error);
    return null;
  }
};

// Supprimer les identifiants stockés
export const clearStoredCredentials = async (tenantSlug) => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  await initPlugins();
  
  if (!SecureStorage) {
    return false;
  }

  try {
    await SecureStorage.remove(`biometric_credentials_${tenantSlug}`);
    console.log('[Biometric] ✅ Identifiants supprimés pour', tenantSlug);
    return true;
  } catch (error) {
    console.error('[Biometric] ❌ Erreur suppression identifiants:', error);
    return false;
  }
};

// Vérifier si des identifiants biométriques sont enregistrés pour ce tenant
export const hasBiometricCredentials = async (tenantSlug) => {
  const credentials = await getStoredCredentials(tenantSlug);
  return credentials !== null;
};

// Connexion complète avec biométrie
export const loginWithBiometric = async (tenantSlug) => {
  // Vérifier si la biométrie est disponible
  const { available } = await checkBiometricAvailability();
  if (!available) {
    throw new Error('Authentification biométrique non disponible');
  }

  // Vérifier si des identifiants sont stockés
  const credentials = await getStoredCredentials(tenantSlug);
  if (!credentials) {
    throw new Error('Aucun identifiant enregistré. Connectez-vous d\'abord avec votre email et mot de passe.');
  }

  // Authentifier avec biométrie
  await authenticateWithBiometric('Authentifiez-vous pour vous connecter');

  // Retourner les identifiants pour la connexion
  return {
    email: credentials.email,
    password: credentials.password
  };
};

export default {
  checkBiometricAvailability,
  authenticateWithBiometric,
  storeCredentials,
  getStoredCredentials,
  clearStoredCredentials,
  hasBiometricCredentials,
  loginWithBiometric
};
