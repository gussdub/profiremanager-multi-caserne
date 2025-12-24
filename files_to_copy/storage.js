/**
 * Utilitaire de stockage robuste pour iOS/Android
 * Utilise Capacitor Preferences sur les appareils natifs (plus fiable)
 * Fallback sur localStorage pour le web
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// Détecter si on est sur une plateforme native ou webview
const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
};

// Détecter si on est sur iOS (Safari webview a des restrictions localStorage)
const isIOSWebview = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && 
    (window.navigator.standalone === true || 
     window.matchMedia('(display-mode: standalone)').matches);
};

// Utiliser le stockage natif si disponible
const useNativeStorage = () => isNativePlatform() || isIOSWebview();

/**
 * Sauvegarder une valeur de manière persistante
 */
export const setStorageItem = async (key, value) => {
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  
  try {
    if (useNativeStorage()) {
      // Utiliser Capacitor Preferences (stockage natif iOS/Android)
      await Preferences.set({ key, value: stringValue });
      console.log(`[Storage] ✅ Saved to native storage: ${key}`);
    } else {
      // Utiliser localStorage sur le web
      localStorage.setItem(key, stringValue);
      console.log(`[Storage] ✅ Saved to localStorage: ${key}`);
    }
    
    // Double sauvegarde pour redondance sur mobile
    if (isIOSWebview() || isNativePlatform()) {
      try {
        localStorage.setItem(key, stringValue);
        sessionStorage.setItem(key, stringValue);
      } catch (e) {
        // Ignorer si localStorage échoue
      }
    }
    
    return true;
  } catch (error) {
    console.error(`[Storage] ❌ Error saving ${key}:`, error);
    // Fallback localStorage
    try {
      localStorage.setItem(key, stringValue);
      return true;
    } catch (e) {
      return false;
    }
  }
};

/**
 * Récupérer une valeur
 */
export const getStorageItem = async (key) => {
  try {
    if (useNativeStorage()) {
      // Essayer Capacitor Preferences d'abord
      const { value } = await Preferences.get({ key });
      if (value) {
        console.log(`[Storage] ✅ Retrieved from native storage: ${key}`);
        return value;
      }
    }
    
    // Fallback: localStorage
    let value = localStorage.getItem(key);
    if (value) {
      console.log(`[Storage] ✅ Retrieved from localStorage: ${key}`);
      return value;
    }
    
    // Fallback: sessionStorage
    value = sessionStorage.getItem(key);
    if (value) {
      console.log(`[Storage] ⚠️ Retrieved from sessionStorage: ${key}`);
      return value;
    }
    
    return null;
  } catch (error) {
    console.error(`[Storage] ❌ Error retrieving ${key}:`, error);
    // Fallback localStorage
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
};

/**
 * Supprimer une valeur
 */
export const removeStorageItem = async (key) => {
  try {
    if (useNativeStorage()) {
      await Preferences.remove({ key });
    }
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    console.log(`[Storage] ✅ Removed: ${key}`);
    return true;
  } catch (error) {
    console.error(`[Storage] ❌ Error removing ${key}:`, error);
    return false;
  }
};

// ============================================
// CREDENTIALS MANAGEMENT (pour multi-tenant)
// ============================================

const SAVED_CREDENTIALS_KEY = 'profiremanager_saved_credentials';

/**
 * Sauvegarder les identifiants pour un tenant
 */
export const saveCredentials = async (tenantSlug, email, password) => {
  try {
    const existingData = await getStorageItem(SAVED_CREDENTIALS_KEY);
    const allCreds = existingData ? JSON.parse(existingData) : {};
    
    allCreds[tenantSlug] = {
      email,
      password,
      savedAt: new Date().toISOString()
    };
    
    await setStorageItem(SAVED_CREDENTIALS_KEY, JSON.stringify(allCreds));
    console.log(`[Credentials] ✅ Saved for tenant: ${tenantSlug}`);
    return true;
  } catch (error) {
    console.error(`[Credentials] ❌ Error saving:`, error);
    return false;
  }
};

/**
 * Récupérer les identifiants pour un tenant
 */
export const getCredentials = async (tenantSlug) => {
  try {
    const existingData = await getStorageItem(SAVED_CREDENTIALS_KEY);
    if (!existingData) {
      console.log(`[Credentials] No saved credentials found`);
      return null;
    }
    
    const allCreds = JSON.parse(existingData);
    const tenantCreds = allCreds[tenantSlug];
    
    if (tenantCreds) {
      console.log(`[Credentials] ✅ Found for tenant: ${tenantSlug}`);
      return tenantCreds;
    }
    
    console.log(`[Credentials] No credentials for tenant: ${tenantSlug}`);
    return null;
  } catch (error) {
    console.error(`[Credentials] ❌ Error retrieving:`, error);
    return null;
  }
};

/**
 * Supprimer les identifiants pour un tenant
 */
export const clearCredentials = async (tenantSlug) => {
  try {
    const existingData = await getStorageItem(SAVED_CREDENTIALS_KEY);
    if (!existingData) return true;
    
    const allCreds = JSON.parse(existingData);
    delete allCreds[tenantSlug];
    
    await setStorageItem(SAVED_CREDENTIALS_KEY, JSON.stringify(allCreds));
    console.log(`[Credentials] ✅ Cleared for tenant: ${tenantSlug}`);
    return true;
  } catch (error) {
    console.error(`[Credentials] ❌ Error clearing:`, error);
    return false;
  }
};

/**
 * Obtenir tous les identifiants sauvegardés (pour debug)
 */
export const getAllCredentials = async () => {
  try {
    const existingData = await getStorageItem(SAVED_CREDENTIALS_KEY);
    return existingData ? JSON.parse(existingData) : {};
  } catch (error) {
    return {};
  }
};

// ============================================
// DEBUG PANEL (pour diagnostic)
// ============================================

/**
 * Afficher un résumé du stockage pour debug
 */
export const getStorageDebugInfo = async () => {
  const info = {
    platform: Capacitor.getPlatform(),
    isNative: isNativePlatform(),
    isIOSWebview: isIOSWebview(),
    useNativeStorage: useNativeStorage(),
    credentials: {},
    localStorage: {},
    capacitorPrefs: {}
  };
  
  // Vérifier localStorage
  try {
    info.localStorage.available = true;
    info.localStorage.credentials = localStorage.getItem(SAVED_CREDENTIALS_KEY);
  } catch (e) {
    info.localStorage.available = false;
    info.localStorage.error = e.message;
  }
  
  // Vérifier Capacitor Preferences
  if (isNativePlatform() || isIOSWebview()) {
    try {
      const { value } = await Preferences.get({ key: SAVED_CREDENTIALS_KEY });
      info.capacitorPrefs.available = true;
      info.capacitorPrefs.credentials = value;
    } catch (e) {
      info.capacitorPrefs.available = false;
      info.capacitorPrefs.error = e.message;
    }
  }
  
  // Résumé des credentials
  const allCreds = await getAllCredentials();
  info.credentials = Object.keys(allCreds).map(tenant => ({
    tenant,
    email: allCreds[tenant]?.email || 'N/A',
    savedAt: allCreds[tenant]?.savedAt || 'N/A'
  }));
  
  return info;
};
