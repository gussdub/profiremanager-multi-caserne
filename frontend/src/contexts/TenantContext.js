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
    if (path.startsWith('/admin')) {
      setIsSuperAdmin(true);
      setTenantSlug('admin');
      setLoading(false);
      return;
    }

    // Extraire le slug du tenant depuis l'URL
    // Format attendu : /shefford/... ou /bromont/...
    const pathParts = path.split('/').filter(Boolean);
    
    if (pathParts.length > 0) {
      const slug = pathParts[0];
      
      // Vérifier que le slug n'est pas une route React classique
      const validSlugs = ['shefford', 'bromont', 'granby', 'magog']; // Liste à étendre
      
      if (validSlugs.includes(slug) || slug.match(/^[a-z\-]+$/)) {
        setTenantSlug(slug);
        
        // On pourrait charger les infos du tenant depuis l'API si nécessaire
        setTenant({
          slug: slug,
          nom: slug.charAt(0).toUpperCase() + slug.slice(1)
        });
      }
    } else {
      // Pas de slug détecté - rediriger vers tenant par défaut pour la démo
      // En production, cela devrait afficher une page de sélection de tenant
      console.log('Aucun tenant détecté dans l\'URL, redirection vers /shefford');
      window.location.href = '/shefford';
      return;
    }
    
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
