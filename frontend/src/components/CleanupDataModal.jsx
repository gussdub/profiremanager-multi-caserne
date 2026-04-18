import React, { useState } from 'react';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CleanupDataModal = ({ isOpen, onClose }) => {
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(''); // '' = tous les tenants
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  // Charger la liste des tenants
  React.useEffect(() => {
    if (isOpen) {
      fetchTenants();
    }
  }, [isOpen]);

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      const response = await fetch(`${API}/admin/super-admin/tenants`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Tenants chargés:', data);
        // Le format peut être différent, essayons plusieurs possibilités
        setTenants(data.tenants || data.items || data || []);
      } else {
        console.error('Erreur chargement tenants:', response.status);
      }
    } catch (error) {
      console.error('Erreur chargement tenants:', error);
    }
  };

  const collections = [
    { id: 'batiments', label: '🏢 Bâtiments', description: 'Tous les bâtiments et dossiers d\'adresses' },
    { id: 'inspections', label: '📋 Préventions/Inspections', description: 'Toutes les inspections et préventions' },
    { id: 'users', label: '👤 Personnel', description: 'Tous les utilisateurs (sauf admins)' },
    { id: 'equipements', label: '🧯 EPI/Équipements', description: 'Tous les équipements et inventaire' },
    { id: 'interventions', label: '🚒 Interventions', description: 'Toutes les interventions' },
    { id: 'formations', label: '📚 Formations', description: 'Sessions et inscriptions de formation' },
    { id: 'disponibilites', label: '📅 Disponibilités', description: 'Disponibilités du personnel' },
    { id: 'remplacements', label: '🔄 Remplacements', description: 'Demandes de remplacement' },
    { id: 'files', label: '📎 Fichiers', description: 'Fichiers et documents stockés' },
  ];

  const toggleCollection = (id) => {
    setSelectedCollections(prev => 
      prev.includes(id) 
        ? prev.filter(c => c !== id)
        : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCollections(collections.map(c => c.id));
  };

  const deselectAll = () => {
    setSelectedCollections([]);
  };

  const handleCleanup = async () => {
    if (selectedCollections.length === 0) {
      alert('Veuillez sélectionner au moins une collection à nettoyer');
      return;
    }

    const tenantLabel = selectedTenant
      ? tenants.find(t => t.id === selectedTenant)?.slug || selectedTenant
      : '⚠️ TOUS LES TENANTS';

    const confirmed = window.confirm(
      `⚠️ ATTENTION : Vous allez supprimer DÉFINITIVEMENT :\n\n` +
      `Tenant : ${tenantLabel}\n\n` +
      selectedCollections.map(id => {
        const coll = collections.find(c => c.id === id);
        return `• ${coll.label}`;
      }).join('\n') +
      `\n\nCette action est IRRÉVERSIBLE. Confirmez-vous ?`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      
      const response = await fetch(`${API}/admin/cleanup-collections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          collections: selectedCollections,
          tenant_id: selectedTenant || null, // null = tous les tenants
          confirm: true
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResults(data.results);
        alert(`✅ Nettoyage terminé !\n\n${JSON.stringify(data.results, null, 2)}`);
      } else {
        alert(`❌ Erreur : ${data.detail || data.message}`);
      }
    } catch (error) {
      console.error('Erreur nettoyage:', error);
      alert(`❌ Erreur de connexion : ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px'
    }}>
      <Card style={{ 
        maxWidth: '700px', 
        width: '100%', 
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <CardHeader>
          <CardTitle style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🧹</span>
            Nettoyage des Données
          </CardTitle>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>
            ⚠️ Sélectionnez les collections à nettoyer. Cette action est irréversible.
          </p>
        </CardHeader>

        <CardContent>
          {/* Sélecteur de tenant - AJOUTÉ */}
          <div style={{ 
            marginBottom: '24px', 
            padding: '16px', 
            backgroundColor: '#fef3c7',
            border: '2px solid #fbbf24',
            borderRadius: '8px' 
          }}>
            <label style={{ 
              display: 'block', 
              fontWeight: '600', 
              marginBottom: '8px',
              color: '#92400e'
            }}>
              🏢 Tenant à nettoyer
            </label>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '2px solid #fbbf24',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="">⚠️ TOUS LES TENANTS (DANGER)</option>
              {tenants.length === 0 ? (
                <>
                  <option value="demo">demo - Démonstration</option>
                  <option value="shefford">shefford - Shefford</option>
                  <option value="sutton">sutton - Sutton</option>
                </>
              ) : (
                tenants.map(tenant => (
                  <option key={tenant.id || tenant.slug} value={tenant.id}>
                    {tenant.slug} - {tenant.nom || tenant.name || 'Service Incendie'}
                  </option>
                ))
              )}
            </select>
            {!selectedTenant && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '12px', 
                color: '#dc2626',
                fontWeight: '600'
              }}>
                ⚠️ Aucun tenant sélectionné = nettoyage de TOUS les tenants !
              </div>
            )}
          </div>

          {/* Boutons de sélection rapide */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <Button 
              onClick={selectAll}
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
            >
              ✓ Tout sélectionner
            </Button>
            <Button 
              onClick={deselectAll}
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
            >
              ✗ Tout désélectionner
            </Button>
          </div>

          {/* Liste des collections */}
          <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
            {collections.map(collection => (
              <div
                key={collection.id}
                onClick={() => toggleCollection(collection.id)}
                style={{
                  padding: '16px',
                  border: `2px solid ${selectedCollections.includes(collection.id) ? '#dc2626' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: selectedCollections.includes(collection.id) ? '#fef2f2' : 'white',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    checked={selectedCollections.includes(collection.id)}
                    onChange={() => {}}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                      {collection.label}
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      {collection.description}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Résultats */}
          {results && (
            <div style={{
              padding: '16px',
              backgroundColor: '#f0fdf4',
              border: '2px solid #86efac',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#16a34a' }}>
                ✅ Nettoyage terminé
              </div>
              <pre style={{ fontSize: '12px', margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(results, null, 2)}
              </pre>
            </div>
          )}

          {/* Boutons d'action */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button
              onClick={onClose}
              variant="outline"
              disabled={loading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCleanup}
              disabled={loading || selectedCollections.length === 0}
              style={{ 
                backgroundColor: '#dc2626',
                opacity: (loading || selectedCollections.length === 0) ? 0.5 : 1
              }}
            >
              {loading ? '⏳ Nettoyage...' : `🗑️ Nettoyer (${selectedCollections.length})`}
            </Button>
          </div>

          {selectedCollections.length > 0 && !loading && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#991b1b'
            }}>
              ⚠️ Vous allez supprimer <strong>{selectedCollections.length}</strong> type(s) de données. Cette action est irréversible.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CleanupDataModal;
