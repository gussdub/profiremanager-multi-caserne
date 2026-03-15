import React from 'react';
import { Button } from '../ui/button';

const ImpactPlanningModal = ({
  show,
  onClose,
  impactData
}) => {
  if (!show || !impactData) return null;

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div 
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)'
        }}>
          <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: '600' }}>
            📊 Impact sur le Planning
          </h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>
            Congé de {impactData.demandeur_nom}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {/* Résumé */}
          <div style={{
            background: impactData.total_assignations > 0 ? '#FEF3C7' : '#D1FAE5',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: impactData.total_assignations > 0 ? '#F59E0B' : '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '1.5rem'
            }}>
              {impactData.total_assignations > 0 ? '⚠️' : '✅'}
            </div>
            <div>
              <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>
                {impactData.total_assignations > 0 
                  ? `${impactData.total_assignations} garde(s) impactée(s)`
                  : 'Aucune garde impactée'
                }
              </div>
              <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                Du {new Date(impactData.date_debut).toLocaleDateString('fr-FR')} au {new Date(impactData.date_fin).toLocaleDateString('fr-FR')} ({impactData.nombre_jours} jour{impactData.nombre_jours > 1 ? 's' : ''})
              </div>
            </div>
          </div>

          {/* Liste des assignations impactées */}
          {impactData.assignations_impactees.length > 0 ? (
            <div>
              <h4 style={{ marginBottom: '12px', color: '#374151' }}>
                Gardes qui seront retirées du planning :
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {impactData.assignations_impactees.map((assignation, index) => (
                  <div 
                    key={index}
                    style={{
                      background: '#F9FAFB',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: '1px solid #E5E7EB'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '500', color: '#111827' }}>
                        {new Date(assignation.date).toLocaleDateString('fr-FR', { 
                          weekday: 'long', 
                          day: 'numeric', 
                          month: 'long' 
                        })}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
                        {assignation.type_garde_nom}
                      </div>
                    </div>
                    <div style={{
                      background: '#FEE2E2',
                      color: '#991B1B',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: '500'
                    }}>
                      À retirer
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '32px',
              color: '#6B7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '12px' }}>✨</div>
              <p>Cet employé n'a aucune garde planifiée pendant cette période.</p>
              <p style={{ fontSize: '0.9rem' }}>Vous pouvez approuver ce congé sans impact sur le planning.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImpactPlanningModal;
