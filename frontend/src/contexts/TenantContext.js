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
      
      // Sauvegarder dans les deux clés
      localStorage.setItem(LAST_TENANT_KEY, slug);
      
      // Aussi sauvegarder dans la liste des casernes
      const savedTenants = getSavedTenants();
      if (!savedTenants.find(t => t.slug === slug)) {
        savedTenants.push({
          slug: slug,
          name: slug.charAt(0).toUpperCase() + slug.slice(1),
          addedAt: new Date().toISOString()
        });
        localStorage.setItem(SAVED_TENANTS_KEY, JSON.stringify(savedTenants));
      }
      
      setShowTenantSelector(false);
      
      // Toujours rediriger vers l'URL du tenant (fonctionne sur web et app native chargeant le web)
      window.location.href = `/${slug}/dashboard`;
    }
  };

  // Fonction pour changer de caserne
  const switchTenant = () => {
    // Effacer le dernier tenant utilisé
    localStorage.removeItem(LAST_TENANT_KEY);
    
    // Forcer un rechargement complet vers la racine
    // Cela force le navigateur à recharger l'app et afficher le sélecteur
    window.location.replace('/');
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
    
    // Détecter si on est sur mobile/tablette/app native (incluant web mobile)
    const isMobileOrApp = () => {
      try {
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
          return true;
        }
      } catch (e) {}
      return window.navigator.standalone === true || 
        window.matchMedia('(display-mode: standalone)').matches ||
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    };
    
    const isMobile = isMobileOrApp();
    
    // Si on a un dernier tenant ET qu'on n'est PAS sur la racine (/)
    // OU si on est sur desktop web avec un dernier tenant
    if (lastTenant && lastTenant !== 'null' && lastTenant !== 'undefined') {
      const currentPath = window.location.pathname;
      
      // Sur mobile/app, si on est à la racine, NE PAS auto-rediriger
      // (permet d'afficher le sélecteur quand on clique "changer de caserne")
      if (isMobile && (currentPath === '/' || currentPath === '')) {
        // Afficher le sélecteur avec les casernes sauvegardées
        console.log('[Mobile] Affichage du sélecteur de caserne (plusieurs casernes disponibles)');
        setShowTenantSelector(true);
        setLoading(false);
        return;
      }
      
      // Sur desktop web, rediriger vers le dernier tenant
      if (!currentPath.startsWith(`/${lastTenant}`)) {
        console.log(`[Web] Redirection vers: ${lastTenant}`);
        window.location.href = `/${lastTenant}/dashboard`;
        return;
      }
    }
    
    // Si on a une seule caserne sauvegardée et pas de lastTenant
    if (!lastTenant && savedTenants.length === 1) {
      const onlyTenant = savedTenants[0];
      console.log(`Unique caserne sauvegardée: ${onlyTenant.slug}`);
      localStorage.setItem(LAST_TENANT_KEY, onlyTenant.slug);
      window.location.href = `/${onlyTenant.slug}/dashboard`;
      return;
    }
    
    // Aucun tenant ou plusieurs sans sélection - afficher le sélecteur
    console.log('Affichage de la page de sélection de caserne');
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

  // Afficher le sélecteur de tenant si nécessaire (surtout sur app native)
  if (showTenantSelector && !tenantSlug) {
    return (
      <TenantContext.Provider value={value}>
        <Suspense fallback={
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100vh',
            background: 'linear-gradient(135deg, #DC2626 0%, #991b1b 100%)'
          }}>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <p>Chargement...</p>
            </div>
          </div>
        }>
          <TenantSelector onSelect={selectTenant} />
        </Suspense>
      </TenantContext.Provider>
    );
  }

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export default TenantContext;
