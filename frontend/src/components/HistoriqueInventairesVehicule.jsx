import React, { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { apiGet } from '../utils/api';

const HistoriqueInventairesVehicule = ({ vehicule, onClose }) => {
  const { tenantSlug } = useTenant();
  const [inventaires, setInventaires] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInventaire, setSelectedInventaire] = useState(null);

  useEffect(() => {
    fetchInventaires();
  }, []);

  const fetchInventaires = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, `/vehicules/${vehicule.id}/inventaires`);
      setInventaires(data || []);
    } catch (error) {
      console.error('Erreur chargement inventaires:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatutStyle = (inv) => {
    if (inv.statut_global === 'conforme') {
      return { bg: '#e8f5e9', color: '#27ae60', text: '✅ Conforme' };
    } else {
      const total = (inv.items_manquants || 0) + (inv.items_defectueux || 0);
      return { bg: '#fff3cd', color: '#f39c12', text: `⚠️ ${total} problème(s)` };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: selectedInventaire ? '1000px' : '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '2px solid #e9ecef',
          backgroundColor: '#9b59b6'
        }}>
          <h2 style={{ margin: 0, color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
            📋 Historique des Inventaires
          </h2>
          <p style={{ margin: '8px 0 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
            {vehicule.nom}
          </p>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
              Chargement...
            </div>
          ) : inventaires.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#6c757d',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px'
            }}>
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>
                Aucun inventaire enregistré
              </p>
              <p style={{ fontSize: '14px' }}>
                Effectuez votre premier inventaire pour ce véhicule
              </p>
            </div>
          ) : !selectedInventaire ? (
            // Liste des inventaires
            <div style={{ display: 'grid', gap: '16px' }}>
              {inventaires.map(inv => {
                const statut = getStatutStyle(inv);
                return (
                  <div
                    key={inv.id}
                    onClick={() => setSelectedInventaire(inv)}
                    style={{
                      padding: '20px',
                      border: '2px solid #e9ecef',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: 'white'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#9b59b6';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(155,89,182,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e9ecef';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: 0, color: '#2c3e50', fontSize: '16px', marginBottom: '4px' }}>
                          {inv.modele_nom || 'Inventaire'}
                        </h4>
                        <p style={{ margin: 0, color: '#6c757d', fontSize: '13px' }}>
                          {formatDate(inv.date_inventaire || inv.created_at)}
                        </p>
                      </div>
                      <span style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        backgroundColor: statut.bg,
                        color: statut.color
                      }}>
                        {statut.text}
                      </span>
                    </div>
                    
                    <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e9ecef' }}>
                      <p style={{ margin: 0, color: '#6c757d', fontSize: '13px' }}>
                        <strong>Réalisé par:</strong> {inv.effectue_par || 'Inconnu'}
                      </p>
                      {inv.notes_generales && (
                        <p style={{ margin: '8px 0 0 0', color: '#6c757d', fontSize: '13px', fontStyle: 'italic' }}>
                          💬 {inv.notes_generales}
                        </p>
                      )}
                    </div>

                    <p style={{
                      margin: '12px 0 0 0',
                      color: '#9b59b6',
                      fontSize: '13px',
                      fontWeight: 'bold'
                    }}>
                      Cliquez pour voir les détails →
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            // Détails d'un inventaire
            <div>
              <button
                onClick={() => setSelectedInventaire(null)}
                style={{
                  marginBottom: '20px',
                  padding: '8px 16px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                ← Retour à la liste
              </button>

              <div style={{
                padding: '20px',
                backgroundColor: '#f8f4fc',
                borderRadius: '12px',
                marginBottom: '24px',
                border: '1px solid #e1d5f0'
              }}>
                <h3 style={{ margin: '0 0 12px 0', color: '#8e44ad', fontSize: '20px' }}>
                  {selectedInventaire.modele_nom || 'Inventaire'}
                </h3>
                <div style={{ display: 'grid', gap: '8px', fontSize: '14px' }}>
                  <p style={{ margin: 0, color: '#2c3e50' }}>
                    <strong>Date:</strong> {formatDate(selectedInventaire.date_inventaire || selectedInventaire.created_at)}
                  </p>
                  <p style={{ margin: 0, color: '#2c3e50' }}>
                    <strong>Réalisé par:</strong> {selectedInventaire.effectue_par || 'Inconnu'}
                  </p>
                  {selectedInventaire.notes_generales && (
                    <p style={{ margin: '8px 0 0 0', color: '#2c3e50', fontStyle: 'italic' }}>
                      <strong>Commentaire:</strong> {selectedInventaire.notes_generales}
                    </p>
                  )}
                </div>
              </div>

              {/* Items cochés */}
              {(() => {
                const itemsCoches = selectedInventaire.items_coches || [];

                return (
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{
                      margin: '0 0 12px 0',
                      color: '#2c3e50',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      paddingBottom: '8px',
                      borderBottom: '2px solid #8e44ad'
                    }}>
                      Items vérifiés
                    </h4>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {itemsCoches.map((item, idx) => {
                        const isPresent = item.statut === 'present';
                        const isDefectueux = item.statut === 'defectueux';
                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '12px',
                              border: `2px solid ${isPresent ? '#27ae60' : '#e74c3c'}`,
                              borderRadius: '8px',
                              backgroundColor: isPresent ? '#e8f5e9' : '#fdecea'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>
                                {isPresent ? '✅' : isDefectueux ? '⚠️' : '❌'}
                              </span>
                              <span style={{
                                flex: 1,
                                fontSize: '14px',
                                color: '#2c3e50',
                                fontWeight: isPresent ? 'normal' : 'bold'
                              }}>
                                {item.nom}
                              </span>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                backgroundColor: isPresent ? '#27ae60' : isDefectueux ? '#f39c12' : '#e74c3c',
                                color: 'white'
                              }}>
                                {isPresent ? 'Présent' : isDefectueux ? 'Défectueux' : 'Absent'}
                              </span>
                            </div>
                            {item.notes && (
                              <p style={{
                                margin: '8px 0 0 24px',
                                fontSize: '13px',
                                color: '#6c757d',
                                fontStyle: 'italic'
                              }}>
                                💬 {item.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid #dee2e6',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoriqueInventairesVehicule;
