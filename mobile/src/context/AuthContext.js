import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    loadStorageData();
  }, []);

  async function loadStorageData() {
    try {
      const storedUser = await AsyncStorage.getItem('userData');
      const storedToken = await AsyncStorage.getItem('userToken');
      const storedTenant = await AsyncStorage.getItem('tenantData');

      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        setTenant(storedTenant ? JSON.parse(storedTenant) : null);
      }
    } catch (error) {
      console.error('Erreur de chargement des données:', error);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email, password, tenantSlug) {
    try {
      const response = await api.post(`/api/${tenantSlug}/auth/login`, {
        email,
        mot_de_passe: password,
      });

      const { token, user: userData, tenant: tenantData } = response.data;

      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(userData));
      await AsyncStorage.setItem('tenantData', JSON.stringify(tenantData));

      setUser(userData);
      setTenant(tenantData);

      return { success: true };
    } catch (error) {
      console.error('Erreur de connexion:', error);
      return {
        success: false,
        message: error.response?.data?.detail || 'Erreur de connexion',
      };
    }
  }

  async function signOut() {
    try {
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('tenantData');
      await AsyncStorage.removeItem('pushToken');
      setUser(null);
      setTenant(null);
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}

export default AuthContext;
