import React from 'react';
import { Button } from './ui/button';
import { AlertCircle, Trash2, Plus, X } from 'lucide-react';

const ConflictResolutionModal = ({ 
  isOpen, 
  onClose, 
  conflicts, 
  newItem, 
  itemType, 
  onResolve 
}) => {
  if (!isOpen) return null;

  const handleAction = (action) => {
    onResolve(action);
  };

  const getItemTypeLabel = (type) => {
    if (type === 'disponibilite') return 'disponibilité';
    if (type === 'indisponibilite') return 'indisponibilité';
    return type;
  };

  const getConflictTypeLabel = (statut) => {
    if (statut === 'disponible') return 'Disponibilité';
    if (statut === 'preference') return 'Préférence';
    if (statut === 'indisponible') return 'Indisponibilité';
    return statut;
  };

  return (
    <div 
      className="modal-overlay" 
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
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div 
        className="modal-content" 
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '2px solid #fee2e2'
        }}>
          <div style={{
            backgroundColor: '#fee2e2',
            padding: '8px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <AlertCircle size={24} style={{ color: '#dc2626' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ 
              fontSize: '20px', 
              fontWeight: '600',
              margin: 0,
              color: '#1f2937'
            }}>
              ⚠️ Conflits détectés
            </h2>
            <p style={{ 
              fontSize: '14px', 
              color: '#6b7280', 
              margin: '4px 0 0 0' 
            }}>
              {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} avec votre nouvelle {getItemTypeLabel(itemType)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: '#6b7280'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nouvelle entrée */}
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '16px'
        }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: '600',
            marginBottom: '8px',
            color: '#15803d'
          }}>
            📅 Nouvelle {getItemTypeLabel(itemType)} à créer
          </h3>
          <div style={{ fontSize: '13px', color: '#166534' }}>
            <strong>Date:</strong> {newItem.date}<br />
            <strong>Heures:</strong> {newItem.heure_debut} - {newItem.heure_fin}<br />
            {newItem.type_garde_nom && (
              <><strong>Type de garde:</strong> {newItem.type_garde_nom}</>
            )}
          </div>
        </div>

        {/* Liste des conflits */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ 
            fontSize: '14px', 
            fontWeight: '600',
            marginBottom: '12px',
            color: '#1f2937'
          }}>
            Conflits avec les entrées existantes :
          </h3>
          
          <div style={{ 
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '6px'
          }}>
            {conflicts.map((conflict, index) => (
              <div
                key={conflict.conflict_id}
                style={{
                  padding: '12px',
                  borderBottom: index < conflicts.length - 1 ? '1px solid #e5e7eb' : 'none',
                  backgroundColor: index % 2 === 0 ? '#f9fafb' : 'white'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: '600',
                    color: conflict.statut === 'indisponible' ? '#dc2626' : '#2563eb'
                  }}>
                    {getConflictTypeLabel(conflict.statut)}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    {conflict.date}
                  </span>
                </div>
                
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  <div>
                    <strong>Heures:</strong> {conflict.heure_debut} - {conflict.heure_fin}
                  </div>
                  {conflict.type_garde_nom && (
                    <div>
                      <strong>Type de garde:</strong> {conflict.type_garde_nom}
                    </div>
                  )}
                  <div style={{ 
                    marginTop: '6px',
                    padding: '6px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    ⚡ <strong>Chevauchement:</strong> {conflict.overlap_start} - {conflict.overlap_end}
                  </div>
                  {conflict.origine && conflict.origine !== 'manuelle' && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                      <em>Origine: {conflict.origine}</em>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{
          backgroundColor: '#f9fafb',
          padding: '16px',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          <h4 style={{ 
            fontSize: '14px', 
            fontWeight: '600',
            marginBottom: '12px',
            color: '#1f2937'
          }}>
            Que souhaitez-vous faire ?
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button
              onClick={() => handleAction('supprimer_conflits')}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'center',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <Trash2 size={16} />
              Supprimer les {conflicts.length} conflit{conflicts.length > 1 ? 's' : ''} et créer la {getItemTypeLabel(itemType)}
            </Button>
            
            <Button
              onClick={() => handleAction('creer_quand_meme')}
              variant="outline"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'center',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <Plus size={16} />
              Créer quand même (garder les deux)
            </Button>
            
            <Button
              onClick={() => handleAction('annuler')}
              variant="ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'center',
                padding: '12px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <X size={16} />
              Annuler
            </Button>
          </div>
        </div>

        {/* Info message */}
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '6px',
          padding: '12px',
          fontSize: '12px',
          color: '#1e40af'
        }}>
          <strong>💡 Note :</strong> Si vous choisissez "Créer quand même", les deux entrées coexisteront. 
          Dans le calendrier, un ⚠️ indiquera la présence d'un conflit.
        </div>
      </div>
    </div>
  );
};

export default ConflictResolutionModal;
