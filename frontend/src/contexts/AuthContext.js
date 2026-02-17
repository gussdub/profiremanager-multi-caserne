import React, { useState, useEffect, createContext, useContext } from "react";
import axios from "axios";
import { useTenant } from "./TenantContext";
import PushNotificationService from "../services/pushNotifications";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

// Auth Context
const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const { tenantSlug, isSuperAdmin } = useTenant();

  // Fonctions utilitaires pour le localStorage avec préfixe tenant
  const getStorageKey = (key) => {
    return tenantSlug ? `${tenantSlug}_${key}` : key;
  };
  
  const getItem = (key) => {
    return localStorage.getItem(getStorageKey(key));
  };
  
  const setItem = (key, value) => {
    localStorage.setItem(getStorageKey(key), value);
  };
  
  const removeItem = (key) => {
    localStorage.removeItem(getStorageKey(key));
  };

  // Restaurer le tenant depuis le localStorage au démarrage - PRIORITÉ HAUTE
  // Cette restauration doit se faire IMMÉDIATEMENT pour éviter le double refresh
  useEffect(() => {
    if (tenantSlug) {
      const storedTenant = getItem('tenant');
      if (storedTenant && !tenant) {
        try {
          const parsedTenant = JSON.parse(storedTenant);
          if (parsedTenant) {
            setTenant(parsedTenant);
          }
        } catch (e) {
          // Erreur silencieuse - le tenant sera rechargé depuis l'API
        }
      }
    }
  }, [tenantSlug]);
  
  // Synchroniser le tenant si le localStorage change (rafraîchissement externe)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (tenantSlug && e.key === getStorageKey('tenant') && e.newValue) {
        try {
          const updatedTenant = JSON.parse(e.newValue);
          setTenant(updatedTenant);
        } catch (err) {
          console.error('Erreur parsing tenant mis à jour:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [tenantSlug]);

  useEffect(() => {
    // Ne pas vérifier le token si pas de tenantSlug (en attente du slug)
    if (!tenantSlug) {
      setLoading(false);
      return;
    }
    
    const token = getItem('token');
    
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Construire l'URL correcte selon le type d'utilisateur
      const meUrl = isSuperAdmin 
        ? `${API}/admin/auth/me` 
        : `${API}/${tenantSlug}/auth/me`;
      
      // Charger le tenant en parallèle avec la vérification du token
      // pour éviter le délai d'affichage des modules
      const loadTenantPromise = (async () => {
        // Vérifier d'abord si le tenant est déjà en cache/state
        const cachedTenant = getItem('tenant');
        if (cachedTenant && !tenant) {
          try {
            const parsed = JSON.parse(cachedTenant);
            if (parsed) setTenant(parsed);
          } catch (e) { /* ignore */ }
        }
        
        // Puis rafraîchir depuis l'API en arrière-plan
        try {
          const tenantResponse = await axios.get(`${API}/admin/tenants/by-slug/${tenantSlug}`);
          setTenant(tenantResponse.data);
          setItem('tenant', JSON.stringify(tenantResponse.data));
        } catch (error) {
          console.error('Erreur récupération tenant:', error);
        }
      })();
      
      // Verify token and get user info
      axios.get(meUrl)
        .then(async response => {
          // Attendre que le tenant soit chargé avant de définir l'utilisateur
          await loadTenantPromise;
          setUser(response.data);
          setLoading(false);
        })
        .catch((error) => {
          console.log('Token invalide ou expiré, nettoyage...');
          // Nettoyer uniquement ce tenant
          removeItem('token');
          removeItem('user');
          removeItem('tenant');
          delete axios.defaults.headers.common['Authorization'];
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [tenantSlug, isSuperAdmin]);

  const login = async (email, mot_de_passe) => {
    try {
      console.log('[AuthContext] Tentative de connexion pour:', email);
      
      // Nettoyer complètement avant une nouvelle connexion (au cas où) - uniquement pour ce tenant
      removeItem('token');
      removeItem('tenant');
      removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      // Utiliser l'endpoint tenant-spécifique
      const loginUrl = isSuperAdmin
        ? `${API}/admin/auth/login`
        : `${API}/${tenantSlug}/auth/login`;
      
      console.log('[AuthContext] URL de login:', loginUrl);
      
      const response = await axios.post(loginUrl, {
        email,
        mot_de_passe
      });
      
      console.log('[AuthContext] Réponse login réussie');
      
      // Pour Super Admin, la réponse contient 'admin' au lieu de 'user'
      const { access_token, user: userData, admin: adminData, tenant } = response.data;
      const finalUserData = isSuperAdmin ? adminData : userData;
      
      setItem('token', access_token);
      
      // Stocker les infos du tenant si présentes
      if (tenant) {
        setItem('tenant', JSON.stringify(tenant));
        setTenant(tenant); // Mettre à jour le state React
      }
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setUser(finalUserData);
      
      // Initialiser les notifications push pour les utilisateurs non-super-admin
      if (!isSuperAdmin && tenantSlug && finalUserData?.id) {
        try {
          await PushNotificationService.initialize(tenantSlug, finalUserData.id);
          console.log('✅ Push notifications initialized');
        } catch (error) {
          console.error('⚠️ Push notifications initialization failed:', error);
          // Ne pas bloquer la connexion si les notifications échouent
        }
      }
      
      // Réinitialiser la page courante vers le dashboard après connexion
      localStorage.setItem('currentPage', 'dashboard');
      
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] Erreur de connexion:', error.response?.status, error.response?.data);
      
      // Ne pas laisser un token ou header invalide trainer
      removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erreur de connexion - Vérifiez vos identifiants' 
      };
    }
  };

  const logout = async () => {
    // Désenregistrer les notifications push
    PushNotificationService.unregister().catch(err => 
      console.error('Error unregistering push notifications:', err)
    );
    
    // NE PAS effacer les credentials sauvegardés ("Se souvenir de moi")
    // L'utilisateur pourra ainsi voir ses identifiants pré-remplis au prochain login
    // mais devra quand même cliquer sur "Se connecter"
    // Les credentials (email/mot de passe) sont conservés dans storage.js
    console.log('[Logout] Keeping saved credentials for convenience');
    
    // Nettoyer uniquement les données du tenant actuel (pas tous les tenants)
    removeItem('token');
    removeItem('tenant');
    removeItem('user');
    removeItem('current_inspection_id');
    removeItem('detail_inspection_id');
    
    // Nettoyage supplémentaire pour iOS - effacer les caches potentiellement corrompus
    try {
      // Nettoyer sessionStorage aussi (peut causer des problèmes sur iOS)
      if (tenantSlug) {
        sessionStorage.removeItem(`${tenantSlug}_token`);
        sessionStorage.removeItem(`${tenantSlug}_user`);
        sessionStorage.removeItem(`${tenantSlug}_tenant`);
      }
      // Nettoyer les anciens formats de stockage qui peuvent interférer
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    } catch (e) {
      console.log('[Logout] SessionStorage cleanup skipped:', e.message);
    }
    
    // Supprimer le header Authorization d'axios
    delete axios.defaults.headers.common['Authorization'];
    
    // Réinitialiser l'état utilisateur
    setUser(null);
    setTenant(null);
    
    // Forcer le rafraîchissement de la page pour éviter les problèmes de cache
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname;
    }, 100);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, tenant, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
