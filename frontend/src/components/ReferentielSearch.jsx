import React, { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { apiGet } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';

/**
 * Composant de recherche intelligente dans les référentiels de violation
 * Affiche les articles de loi triés par fréquence d'utilisation
 */
const ReferentielSearch = ({ value, onChange, questionType }) => {
  const { tenantSlug } = useTenant();
  const [search, setSearch] = useState('');
  const [referentiels, setReferentiels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const fetchReferentiels = async () => {
      if (search.length < 2) {
        setReferentiels([]);
        return;
      }

      try {
        setLoading(true);
        const results = await apiGet(tenantSlug, `/prevention/referentiels?search=${encodeURIComponent(search)}`);
        setReferentiels(results || []);
        setShowResults(true);
      } catch (error) {
        console.error('Erreur recherche référentiels:', error);
        setReferentiels([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchReferentiels, 300);
    return () => clearTimeout(timeoutId);
  }, [search, tenantSlug]);

  const handleSelect = (ref) => {
    onChange(ref);
    setShowResults(false);
    setSearch('');
  };

  const selectedRef = value;

  return (
    <div style={{ 
      border: '1px solid #d1d5db', 
      borderRadius: '6px', 
      padding: '0.75rem',
      backgroundColor: '#f9fafb'
    }}>
      <Label style={{ fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
        Article de violation (optionnel)
      </Label>

      {selectedRef ? (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#dbeafe',
          border: '1px solid #3b82f6',
          borderRadius: '6px',
          marginBottom: '0.5rem'
        }}>
          <div style={{ fontWeight: '600', color: '#1e40af', marginBottom: '0.25rem' }}>
            {selectedRef.article}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#1e3a8a' }}>
            {selectedRef.titre}
          </div>
          {selectedRef.gravite && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Gravité: {selectedRef.gravite} • Délai: {selectedRef.delai_correction} jours
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange(null)}
            style={{ marginTop: '0.5rem' }}
          >
            ✕ Retirer
          </Button>
        </div>
      ) : (
        <>
          <Input
            placeholder="Rechercher un article (ex: extincteur, sortie, alarme...)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setShowResults(true)}
            style={{ marginBottom: '0.5rem' }}
          />

          {loading && (
            <div style={{ textAlign: 'center', padding: '0.5rem', color: '#6b7280' }}>
              ⏳ Recherche en cours...
            </div>
          )}

          {showResults && referentiels.length > 0 && (
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: 'white'
            }}>
              {referentiels.map(ref => (
                <div
                  key={ref.id}
                  onClick={() => handleSelect(ref)}
                  style={{
                    padding: '0.75rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f3f4f6',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                >
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937' }}>
                    {ref.article}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.125rem' }}>
                    {ref.titre}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem', display: 'flex', gap: '1rem' }}>
                    <span>
                      {ref.gravite && `⚠️ ${ref.gravite}`}
                    </span>
                    <span>
                      📊 Utilisé {ref.frequence_utilisation || 0} fois
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showResults && search.length >= 2 && referentiels.length === 0 && !loading && (
            <div style={{
              textAlign: 'center',
              padding: '1rem',
              color: '#6b7280',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '6px'
            }}>
              Aucun article trouvé pour "{search}"
            </div>
          )}

          {search.length < 2 && (
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              💡 Tapez au moins 2 caractères pour rechercher
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReferentielSearch;
