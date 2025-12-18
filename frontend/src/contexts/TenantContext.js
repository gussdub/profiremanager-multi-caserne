import React, { createContext, useContext, useState, useEffect } from 'react';

const TenantContext = createContext();

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

export const TenantProvider = ({ children }) => {
  const [tenant, setTenant] = useState(null);
  const [tenantSlug, setTenantSlug] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

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
    const specialRoutes = ['qr', 'reset-password', 'api'];
    
    if (pathParts.length > 0 && !specialRoutes.includes(pathParts[0])) {
      const slug = pathParts[0];
      
      // Vérifier que le slug est valide (format tenant)
      if (slug.match(/^[a-z0-9\-]+$/) && slug !== 'null' && slug !== 'undefined') {
        setTenantSlug(slug);
        
        // IMPORTANT: Sauvegarder ce tenant comme "dernier utilisé" pour les raccourcis PWA
        localStorage.setItem('profiremanager_last_tenant', slug);
        
        // On pourrait charger les infos du tenant depuis l'API si nécessaire
        setTenant({
          slug: slug,
          nom: slug.charAt(0).toUpperCase() + slug.slice(1)
        });
        
        setLoading(false);
        return;
      }
    }
    
    // Pas de slug valide détecté - vérifier si on a un dernier tenant en mémoire
    const lastTenant = localStorage.getItem('profiremanager_last_tenant');
    
    if (lastTenant && lastTenant !== 'null' && lastTenant !== 'undefined') {
      // Rediriger vers le dernier tenant utilisé (utile pour les raccourcis PWA iOS)
      console.log(`Redirection vers le dernier tenant utilisé: ${lastTenant}`);
      window.location.href = `/${lastTenant}/dashboard`;
      return;
    }
    
    // Aucun tenant en mémoire - l'utilisateur doit choisir
    console.log('Aucun tenant détecté, affichage de la page de sélection');
    setLoading(false);
  }, []);

  const value = {
    tenant,
    tenantSlug,
    isSuperAdmin,
    loading,
    setTenant,
    setTenantSlug
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
