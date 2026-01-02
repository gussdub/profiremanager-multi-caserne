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
      
      // Verify token and get user info
      axios.get(meUrl)
        .then(async response => {
          setUser(response.data);
          setLoading(false);
          
          // Récupérer les informations du tenant si ce n'est pas un super admin
          if (!isSuperAdmin && tenantSlug) {
            try {
              const tenantResponse = await axios.get(`${API}/admin/tenants/by-slug/${tenantSlug}`);
              setTenant(tenantResponse.data);
            } catch (error) {
              console.error('Erreur récupération tenant:', error);
            }
          }
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
      // Nettoyer complètement avant une nouvelle connexion (au cas où) - uniquement pour ce tenant
      removeItem('token');
      removeItem('tenant');
      removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      // Utiliser l'endpoint tenant-spécifique
      const loginUrl = isSuperAdmin
        ? `${API}/admin/auth/login`
        : `${API}/${tenantSlug}/auth/login`;
      
      const response = await axios.post(loginUrl, {
        email,
        mot_de_passe
      });
      
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
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erreur de connexion' 
      };
    }
  };

  const logout = async () => {
    // Désenregistrer les notifications push
    PushNotificationService.unregister().catch(err => 
      console.error('Error unregistering push notifications:', err)
    );
    
    // Effacer les credentials sauvegardés ("Se souvenir de moi")
    try {
      const { clearCredentials } = await import('../utils/storage');
      if (tenantSlug) {
        await clearCredentials(tenantSlug);
        console.log('[Logout] Credentials cleared for tenant:', tenantSlug);
      }
    } catch (err) {
      console.error('Error clearing saved credentials:', err);
    }
    
    // Nettoyer uniquement les données du tenant actuel (pas tous les tenants)
    removeItem('token');
    removeItem('tenant');
    removeItem('user');
    removeItem('current_inspection_id');
    removeItem('detail_inspection_id');
    
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
