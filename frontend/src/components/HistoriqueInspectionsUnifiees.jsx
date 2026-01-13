import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';
import { Button } from './ui/button';

const HistoriqueInspectionsUnifiees = ({ isOpen, onClose, tenantSlug, assetId, assetType, assetName }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState(null);

  useEffect(() => {
    if (isOpen && assetId && assetType) {
      loadInspections();
    }
  }, [isOpen, assetId, assetType]);

  const loadInspections = async () => {
    setLoading(true);
    try {
      // Charger les inspections depuis le système unifié
      const data = await apiGet(tenantSlug, `/inspections-unifiees/${assetType}/${assetId}`);
      setInspections(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.75rem',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#8b5cf6',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
              📋 Historique des inspections
            </h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', opacity: 0.9 }}>
              {assetName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              <p>Chargement de l'historique...</p>
            </div>
          ) : inspections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
              <p>Aucune inspection enregistrée</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Les inspections effectuées sur cet équipement apparaîtront ici.
              </p>
            </div>
          ) : selectedInspection ? (
            // Détail d'une inspection
            <div>
              <button
                onClick={() => setSelectedInspection(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'none',
                  border: 'none',
                  color: '#3b82f6',
                  cursor: 'pointer',
                  marginBottom: '1rem',
                  fontSize: '0.875rem'
                }}
              >
                ← Retour à la liste
              </button>

              <div style={{
                backgroundColor: selectedInspection.conforme ? '#f0fdf4' : '#fef2f2',
                border: `2px solid ${selectedInspection.conforme ? '#22c55e' : '#ef4444'}`,
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: '600', color: selectedInspection.conforme ? '#16a34a' : '#dc2626' }}>
                    {selectedInspection.conforme ? '✅ Conforme' : '❌ Non conforme'}
                  </span>
                  <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                    {new Date(selectedInspection.date_inspection || selectedInspection.created_at).toLocaleString('fr-CA')}
                  </span>
                </div>
                {selectedInspection.metadata?.effectue_par && (
                  <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    Par: {selectedInspection.metadata.effectue_par}
                  </p>
                )}
              </div>

              {/* Réponses */}
              {selectedInspection.reponses && (
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>Réponses</h3>
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {Object.entries(selectedInspection.reponses).map(([key, value]) => (
                      <div key={key} style={{
                        padding: '0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.375rem',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontWeight: '500', marginBottom: '0.25rem', fontSize: '0.875rem' }}>{key}</div>
                        <div style={{ color: '#374151' }}>
                          {typeof value === 'object' ? (
                            <>
                              {value.valeur && <div>Valeur: {Array.isArray(value.valeur) ? value.valeur.join(', ') : String(value.valeur)}</div>}
                              {value.notes && <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Notes: {value.notes}</div>}
                            </>
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes générales */}
              {selectedInspection.notes_generales && (
                <div style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Notes générales</h3>
                  <p style={{ backgroundColor: '#f9fafb', padding: '0.75rem', borderRadius: '0.375rem' }}>
                    {selectedInspection.notes_generales}
                  </p>
                </div>
              )}

              {/* Alertes */}
              {selectedInspection.alertes && selectedInspection.alertes.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: '#dc2626' }}>
                    ⚠️ Alertes ({selectedInspection.alertes.length})
                  </h3>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {selectedInspection.alertes.map((alerte, idx) => (
                      <div key={idx} style={{
                        padding: '0.75rem',
                        backgroundColor: '#fef2f2',
                        borderRadius: '0.375rem',
                        border: '1px solid #fecaca'
                      }}>
                        <div style={{ fontWeight: '500', color: '#991b1b' }}>{alerte.item || alerte.section}</div>
                        <div style={{ fontSize: '0.875rem', color: '#b91c1c' }}>{alerte.valeur}</div>
                        {alerte.notes && <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{alerte.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Liste des inspections
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {inspections.map((inspection) => (
                <div
                  key={inspection.id}
                  onClick={() => setSelectedInspection(inspection)}
                  style={{
                    padding: '1rem',
                    backgroundColor: 'white',
                    borderRadius: '0.5rem',
                    border: `2px solid ${inspection.conforme ? '#22c55e' : '#ef4444'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>
                        {inspection.conforme ? '✅' : '❌'}
                      </span>
                      <span style={{ fontWeight: '600', color: inspection.conforme ? '#16a34a' : '#dc2626' }}>
                        {inspection.conforme ? 'Conforme' : 'Non conforme'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {new Date(inspection.date_inspection || inspection.created_at).toLocaleString('fr-CA')}
                    </div>
                    {inspection.metadata?.effectue_par && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                        Par: {inspection.metadata.effectue_par}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {inspection.alertes && inspection.alertes.length > 0 && (
                      <span style={{
                        backgroundColor: '#fef2f2',
                        color: '#dc2626',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '500'
                      }}>
                        ⚠️ {inspection.alertes.length} alerte(s)
                      </span>
                    )}
                    <span style={{ color: '#9ca3af' }}>→</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HistoriqueInspectionsUnifiees;
