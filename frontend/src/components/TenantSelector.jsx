import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

// Clés localStorage pour les casernes sauvegardées
const SAVED_TENANTS_KEY = 'profiremanager_saved_tenants';
const LAST_TENANT_KEY = 'profiremanager_last_tenant';

// Vérifier si on est sur une app native
const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch (e) {
    return false;
  }
};

// Récupérer les casernes sauvegardées
export const getSavedTenants = () => {
  try {
    const saved = localStorage.getItem(SAVED_TENANTS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
};

// Sauvegarder une caserne
export const saveTenant = (tenantSlug, tenantName = null) => {
  const tenants = getSavedTenants();
  const name = tenantName || tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1);
  
  // Ne pas ajouter si déjà présent
  if (!tenants.find(t => t.slug === tenantSlug)) {
    tenants.push({ 
      slug: tenantSlug, 
      name: name,
      addedAt: new Date().toISOString()
    });
    localStorage.setItem(SAVED_TENANTS_KEY, JSON.stringify(tenants));
  }
  
  // Définir comme dernier tenant utilisé
  localStorage.setItem(LAST_TENANT_KEY, tenantSlug);
  
  return tenants;
};

// Supprimer une caserne sauvegardée
export const removeSavedTenant = (tenantSlug) => {
  const tenants = getSavedTenants().filter(t => t.slug !== tenantSlug);
  localStorage.setItem(SAVED_TENANTS_KEY, JSON.stringify(tenants));
  return tenants;
};

// Composant principal de sélection de caserne
const TenantSelector = ({ onSelect, showAddOnly = false }) => {
  const [savedTenants, setSavedTenants] = useState([]);
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    setSavedTenants(getSavedTenants());
  }, []);

  // Valider et ajouter une nouvelle caserne
  const handleAddTenant = async () => {
    const slug = newTenantSlug.toLowerCase().trim().replace(/\s+/g, '-');
    
    if (!slug) {
      setError('Veuillez entrer le code de votre caserne');
      return;
    }
    
    if (!slug.match(/^[a-z0-9\-]+$/)) {
      setError('Le code ne doit contenir que des lettres minuscules, chiffres et tirets');
      return;
    }
    
    // Vérifier si déjà ajouté
    if (savedTenants.find(t => t.slug === slug)) {
      setError('Cette caserne est déjà dans votre liste');
      return;
    }
    
    setValidating(true);
    setError('');
    
    try {
      // URL du backend - utiliser la variable d'environnement ou l'URL de production
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'https://www.profiremanager.ca';
      console.log('[TenantSelector] Validation du tenant:', slug, 'via:', backendUrl);
      
      const response = await fetch(`${backendUrl}/api/${slug}/public/branding`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Caserne non trouvée');
      }
      
      const data = await response.json();
      const tenantName = data.nom_service || slug.charAt(0).toUpperCase() + slug.slice(1);
      
      // Sauvegarder la caserne
      const updated = saveTenant(slug, tenantName);
      setSavedTenants(updated);
      setNewTenantSlug('');
      setIsAdding(false);
      
      // Si c'est la première caserne ou showAddOnly, sélectionner automatiquement
      if (updated.length === 1 || showAddOnly) {
        onSelect(slug);
      }
      
    } catch (err) {
      console.error('[TenantSelector] Erreur validation:', err);
      
      // Sur app native, permettre d'ajouter quand même avec un avertissement
      // car la validation peut échouer à cause de problèmes réseau/CORS
      if (isNativeApp()) {
        const confirmAdd = window.confirm(
          `Impossible de vérifier la caserne "${slug}" (problème de connexion).\n\n` +
          `Voulez-vous l'ajouter quand même ?\n\n` +
          `Assurez-vous que le code est correct.`
        );
        if (confirmAdd) {
          const tenantName = slug.charAt(0).toUpperCase() + slug.slice(1);
          const updated = saveTenant(slug, tenantName);
          setSavedTenants(updated);
          setNewTenantSlug('');
          setIsAdding(false);
          if (updated.length === 1 || showAddOnly) {
            onSelect(slug);
          }
          setValidating(false);
          return;
        }
      }
      
      setError('Code de caserne invalide ou caserne introuvable. Vérifiez le code auprès de votre administrateur.');
    } finally {
      setValidating(false);
    }
  };

  // Sélectionner une caserne existante
  const handleSelectTenant = (slug) => {
    localStorage.setItem(LAST_TENANT_KEY, slug);
    onSelect(slug);
  };

  // Supprimer une caserne
  const handleRemoveTenant = (e, slug) => {
    e.stopPropagation();
    const updated = removeSavedTenant(slug);
    setSavedTenants(updated);
  };

  // Si mode "ajouter uniquement" (depuis le bouton changer de caserne)
  if (showAddOnly) {
    return (
      <div className="tenant-add-form">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code de la caserne
            </label>
            <Input
              type="text"
              value={newTenantSlug}
              onChange={(e) => {
                setNewTenantSlug(e.target.value);
                setError('');
              }}
              placeholder="ex: shefford, bromont..."
              className="w-full"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTenant()}
            />
            <p className="text-xs text-gray-500 mt-1">
              Demandez ce code à l&apos;administrateur de votre caserne
            </p>
          </div>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          
          <Button 
            onClick={handleAddTenant}
            disabled={validating || !newTenantSlug}
            className="w-full"
          >
            {validating ? 'Vérification...' : '➕ Ajouter cette caserne'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="tenant-selector-container" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #DC2626 0%, #991b1b 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <Card style={{ maxWidth: '400px', width: '100%' }}>
        <CardHeader className="text-center pb-2">
          <img 
            src="/logo192.png" 
            alt="ProFireManager" 
            style={{ 
              width: '80px', 
              height: '80px', 
              margin: '0 auto 0.5rem',
              display: 'block'
            }} 
          />
          <CardTitle style={{ color: '#DC2626', fontSize: '1.5rem' }}>
            ProFireManager
          </CardTitle>
          <p className="text-gray-500 text-sm">Sélectionnez votre caserne</p>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Liste des casernes sauvegardées */}
          {savedTenants.length > 0 && !isAdding && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Vos casernes
              </label>
              {savedTenants.map((tenant) => (
                <div
                  key={tenant.slug}
                  onClick={() => handleSelectTenant(tenant.slug)}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-red-500 hover:bg-red-50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: '#DC2626',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold'
                    }}>
                      {tenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{tenant.name}</p>
                      <p className="text-xs text-gray-400">{tenant.slug}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveTenant(e, tenant.slug)}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Retirer de la liste"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Formulaire d'ajout */}
          {(isAdding || savedTenants.length === 0) && (
            <div className="space-y-4">
              {savedTenants.length > 0 && (
                <div className="flex items-center">
                  <div className="flex-1 border-t border-gray-200"></div>
                  <span className="px-3 text-sm text-gray-500">ou</span>
                  <div className="flex-1 border-t border-gray-200"></div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {savedTenants.length === 0 ? 'Code de votre caserne' : 'Ajouter une autre caserne'}
                </label>
                <Input
                  type="text"
                  value={newTenantSlug}
                  onChange={(e) => {
                    setNewTenantSlug(e.target.value.toLowerCase());
                    setError('');
                  }}
                  placeholder="ex: shefford, bromont..."
                  className="w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTenant()}
                  autoFocus={savedTenants.length === 0}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Demandez ce code à l&apos;administrateur de votre caserne
                </p>
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
              
              <Button 
                onClick={handleAddTenant}
                disabled={validating || !newTenantSlug}
                className="w-full"
              >
                {validating ? 'Vérification...' : '✓ Valider'}
              </Button>
              
              {savedTenants.length > 0 && isAdding && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    setIsAdding(false);
                    setNewTenantSlug('');
                    setError('');
                  }}
                  className="w-full"
                >
                  Annuler
                </Button>
              )}
            </div>
          )}
          
          {/* Bouton pour ajouter une nouvelle caserne */}
          {savedTenants.length > 0 && !isAdding && (
            <Button 
              variant="outline"
              onClick={() => setIsAdding(true)}
              className="w-full"
            >
              ➕ Ajouter une autre caserne
            </Button>
          )}
          
          {/* Note d'information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-blue-700 text-xs">
              💡 <strong>Conseil:</strong> Vos casernes sont mémorisées. 
              Vous n&apos;aurez plus à entrer le code lors de vos prochaines connexions.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TenantSelector;
