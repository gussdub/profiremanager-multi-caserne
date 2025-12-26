import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

const HistoriqueInspectionsAPRIA = ({ tenantSlug, equipementId = null, isOpen, onClose }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchInspections();
    }
  }, [isOpen, tenantSlug, equipementId]);

  const fetchInspections = async () => {
    try {
      setLoading(true);
      let url = '/apria/inspections';
      if (equipementId) {
        url = `/apria/equipements/${equipementId}/historique`;
      }
      const data = await apiGet(tenantSlug, url);
      setInspections(data);
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Si c'est un modal
  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📋 Historique des inspections APRIA
            </DialogTitle>
          </DialogHeader>
          
          <InspectionsContent 
            inspections={inspections}
            loading={loading}
            selectedInspection={selectedInspection}
            setSelectedInspection={setSelectedInspection}
            formatDate={formatDate}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Sinon c'est un composant intégré
  return (
    <InspectionsContent 
      inspections={inspections}
      loading={loading}
      selectedInspection={selectedInspection}
      setSelectedInspection={setSelectedInspection}
      formatDate={formatDate}
    />
  );
};

// Contenu principal (réutilisable)
const InspectionsContent = ({ inspections, loading, selectedInspection, setSelectedInspection, formatDate }) => {
  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        Chargement des inspections...
      </div>
    );
  }

  if (inspections.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
        <p>Aucune inspection enregistrée</p>
      </div>
    );
  }

  // Détail d'une inspection
  if (selectedInspection) {
    return (
      <div style={{ padding: '1rem' }}>
        <button
          onClick={() => setSelectedInspection(null)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          ← Retour à la liste
        </button>

        <div style={{ 
          padding: '1.5rem',
          backgroundColor: selectedInspection.conforme ? '#f0fdf4' : '#fef2f2',
          borderRadius: '0.75rem',
          border: selectedInspection.conforme ? '2px solid #22c55e' : '2px solid #ef4444'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
              Inspection du {formatDate(selectedInspection.date_inspection)}
            </h3>
            <span style={{
              padding: '0.5rem 1rem',
              backgroundColor: selectedInspection.conforme ? '#22c55e' : '#ef4444',
              color: 'white',
              borderRadius: '9999px',
              fontWeight: '600'
            }}>
              {selectedInspection.conforme ? '✅ Conforme' : '❌ Non Conforme'}
            </span>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
            <div><strong>Type:</strong> {selectedInspection.type_inspection === 'mensuelle' ? '📅 Mensuelle' : '🔄 Après usage'}</div>
            <div><strong>Inspecteur:</strong> {selectedInspection.inspecteur_nom || 'N/A'}</div>
            {selectedInspection.pression_cylindre && (
              <div>
                <strong>Pression du cylindre:</strong> {selectedInspection.pression_cylindre} PSI
                {selectedInspection.pression_cylindre < 4050 && (
                  <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>⚠️ Sous le minimum</span>
                )}
              </div>
            )}
          </div>

          {/* Éléments inspectés */}
          {selectedInspection.elements && Object.keys(selectedInspection.elements).length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.75rem', fontWeight: '600' }}>Éléments inspectés:</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {Object.entries(selectedInspection.elements).map(([key, value]) => (
                  <div 
                    key={key}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'white',
                      borderRadius: '0.375rem',
                      border: value === 'Non conforme' ? '1px solid #ef4444' : '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span style={{ fontSize: '0.875rem' }}>{key.replace('item_', 'Élément ')}</span>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: value === 'Conforme' ? '#dcfce7' : value === 'Non conforme' ? '#fef2f2' : '#f3f4f6',
                      color: value === 'Conforme' ? '#166534' : value === 'Non conforme' ? '#dc2626' : '#6b7280',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: '600'
                    }}>
                      {value || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Remarques */}
          {selectedInspection.remarques && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'white', borderRadius: '0.375rem' }}>
              <strong>Remarques:</strong>
              <p style={{ margin: '0.5rem 0 0', color: '#374151' }}>{selectedInspection.remarques}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Liste des inspections
  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {inspections.map((inspection, index) => (
          <div
            key={inspection.id || index}
            onClick={() => setSelectedInspection(inspection)}
            style={{
              padding: '1rem',
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              border: inspection.conforme ? '1px solid #e5e7eb' : '2px solid #ef4444',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
          >
            <div>
              <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                {formatDate(inspection.date_inspection)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {inspection.type_inspection === 'mensuelle' ? '📅 Mensuelle' : '🔄 Après usage'} 
                {' • '} 
                Par {inspection.inspecteur_nom || 'N/A'}
              </div>
              {inspection.pression_cylindre && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  Pression: {inspection.pression_cylindre} PSI
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                padding: '0.375rem 0.75rem',
                backgroundColor: inspection.conforme ? '#dcfce7' : '#fef2f2',
                color: inspection.conforme ? '#166534' : '#dc2626',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                {inspection.conforme ? '✅ Conforme' : '❌ Non Conforme'}
              </span>
              <span style={{ color: '#9ca3af' }}>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoriqueInspectionsAPRIA;
