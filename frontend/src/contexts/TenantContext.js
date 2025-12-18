import React, { createContext, useContext, useState, useEffect, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';

// Lazy load du TenantSelector pour éviter les dépendances circulaires
const TenantSelector = lazy(() => import('../components/TenantSelector'));

const TenantContext = createContext();

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

// Détecter si on est sur une app native (Capacitor)
export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
};

// Clés localStorage
const SAVED_TENANTS_KEY = 'profiremanager_saved_tenants';
const LAST_TENANT_KEY = 'profiremanager_last_tenant';

// Récupérer les casernes sauvegardées
export const getSavedTenants = () => {
  try {
    const saved = localStorage.getItem(SAVED_TENANTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

export const TenantProvider = ({ children }) => {
  const [tenant, setTenant] = useState(null);
  const [tenantSlug, setTenantSlug] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTenantSelector, setShowTenantSelector] = useState(false);

  // Fonction pour sélectionner un tenant (utilisée par le sélecteur)
  const selectTenant = (slug) => {
    if (slug && slug.match(/^[a-z0-9\-]+$/)) {
      setTenantSlug(slug);
      setTenant({
        slug: slug,
        nom: slug.charAt(0).toUpperCase() + slug.slice(1)
      });
      localStorage.setItem(LAST_TENANT_KEY, slug);
      setShowTenantSelector(false);
      
      // Sur le web, rediriger vers l'URL du tenant
      if (!isNativeApp()) {
        window.location.href = `/${slug}/dashboard`;
      }
    }
  };

  // Fonction pour changer de caserne (afficher le sélecteur)
  const switchTenant = () => {
    // Sur app native, afficher le sélecteur
    if (isNativeApp()) {
      setShowTenantSelector(true);
    } else {
      // Sur le web, rediriger vers la racine
      window.location.href = '/';
    }
  };

  // Fonction pour réinitialiser et afficher le sélecteur
  const resetTenantSelection = () => {
    setTenantSlug(null);
    setTenant(null);
    localStorage.removeItem(LAST_TENANT_KEY);
    setShowTenantSelector(true);
  };

  useEffect(() => {
    // Extraire le tenant depuis l'URL
    const path = window.location.pathname;
    
    // Vérifier si c'est l'interface super-admin
    if (path === '/admin' || path.startsWith('/admin/')) {
      setIsSuperAdmin(true);
      setTenantSlug('admin');
      setLoading(false);
      return;
    }

    // Extraire le slug du tenant depuis l'URL
    // Format attendu : /shefford/... ou /bromont/...
    const pathParts = path.split('/').filter(Boolean);
    
    // Routes spéciales qui ne sont pas des tenants
    const specialRoutes = ['qr', 'reset-password', 'api', 'pwa'];
    
    if (pathParts.length > 0 && !specialRoutes.includes(pathParts[0])) {
      const slug = pathParts[0];
      
      // Vérifier que le slug est valide (format tenant)
      if (slug.match(/^[a-z0-9\-]+$/) && slug !== 'null' && slug !== 'undefined') {
        setTenantSlug(slug);
        
        // IMPORTANT: Sauvegarder ce tenant comme "dernier utilisé"
        localStorage.setItem(LAST_TENANT_KEY, slug);
        
        // Aussi l'ajouter aux casernes sauvegardées pour l'app native
        const savedTenants = getSavedTenants();
        if (!savedTenants.find(t => t.slug === slug)) {
          savedTenants.push({
            slug: slug,
            name: slug.charAt(0).toUpperCase() + slug.slice(1),
            addedAt: new Date().toISOString()
          });
          localStorage.setItem(SAVED_TENANTS_KEY, JSON.stringify(savedTenants));
        }
        
        setTenant({
          slug: slug,
          nom: slug.charAt(0).toUpperCase() + slug.slice(1)
        });
        
        setLoading(false);
        return;
      }
    }
    
    // Pas de slug valide dans l'URL
    const lastTenant = localStorage.getItem(LAST_TENANT_KEY);
    const savedTenants = getSavedTenants();
    
    // Sur app native
    if (isNativeApp()) {
      // Si on a un dernier tenant, l'utiliser
      if (lastTenant && lastTenant !== 'null' && lastTenant !== 'undefined') {
        console.log(`[Native] Utilisation du dernier tenant: ${lastTenant}`);
        setTenantSlug(lastTenant);
        setTenant({
          slug: lastTenant,
          nom: lastTenant.charAt(0).toUpperCase() + lastTenant.slice(1)
        });
        setLoading(false);
        return;
      }
      
      // Si on a des casernes sauvegardées mais pas de dernier tenant
      if (savedTenants.length === 1) {
        // Une seule caserne: l'utiliser automatiquement
        const onlyTenant = savedTenants[0];
        console.log(`[Native] Une seule caserne sauvegardée: ${onlyTenant.slug}`);
        localStorage.setItem(LAST_TENANT_KEY, onlyTenant.slug);
        setTenantSlug(onlyTenant.slug);
        setTenant({
          slug: onlyTenant.slug,
          nom: onlyTenant.name
        });
        setLoading(false);
        return;
      }
      
      // Pas de tenant ou plusieurs: afficher le sélecteur
      console.log('[Native] Affichage du sélecteur de caserne');
      setShowTenantSelector(true);
      setLoading(false);
      return;
    }
    
    // Sur le web
    if (lastTenant && lastTenant !== 'null' && lastTenant !== 'undefined') {
      console.log(`[Web] Redirection vers: ${lastTenant}`);
      window.location.href = `/${lastTenant}/dashboard`;
      return;
    }
    
    // Aucun tenant - afficher le sélecteur (ou page d'accueil web)
    console.log('Aucun tenant détecté, affichage de la page de sélection');
    setShowTenantSelector(true);
    setLoading(false);
  }, []);

  const value = {
    tenant,
    tenantSlug,
    isSuperAdmin,
    loading,
    showTenantSelector,
    setTenant,
    setTenantSlug,
    selectTenant,
    switchTenant,
    resetTenantSelection,
    isNativeApp: isNativeApp()
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '50px', 
            height: '50px', 
            border: '4px solid #e2e8f0',
            borderTop: '4px solid #dc2626',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: '#64748b' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export default TenantContext;
