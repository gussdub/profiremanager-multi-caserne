import React from "react";
import { Button } from "../ui/button";

/**
 * BatchConflictModal - Modal de résolution des conflits en batch
 * Permet de sélectionner quels conflits remplacer lors d'un ajout multiple
 */
const BatchConflictModal = ({
  show,
  conflicts,
  selections,
  setSelections,
  onClose,
  onConfirm
}) => {
  if (!show || !conflicts || conflicts.length === 0) return null;

  const selectedCount = Object.values(selections).filter(Boolean).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content large-modal" 
        onClick={(e) => e.stopPropagation()} 
        style={{maxWidth: '800px', maxHeight: '80vh', overflow: 'auto'}}
      >
        <div className="modal-header">
          <h3>⚠️ Conflits Détectés ({conflicts.length})</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="modal-body" style={{padding: '1.5rem'}}>
          <p style={{marginBottom: '1rem', color: '#64748b'}}>
            Les disponibilités suivantes sont en conflit avec des entrées existantes. 
            Sélectionnez les conflits que vous souhaitez remplacer :
          </p>
          
          {/* Boutons tout sélectionner / désélectionner */}
          <div style={{marginBottom: '1rem', display: 'flex', gap: '0.5rem'}}>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                const allSelected = {};
                conflicts.forEach((_, idx) => allSelected[idx] = true);
                setSelections(allSelected);
              }}
            >
              ✅ Tout sélectionner
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelections({})}
            >
              ❌ Tout désélectionner
            </Button>
          </div>
          
          {/* Liste des conflits */}
          <div style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            {conflicts.map((conflict, index) => {
              const isSelected = selections[index] || false;
              return (
                <div 
                  key={index}
                  style={{
                    padding: '1rem',
                    borderBottom: index < conflicts.length - 1 ? '1px solid #e5e7eb' : 'none',
                    background: isSelected ? '#fef3c7' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => {
                    setSelections(prev => ({
                      ...prev,
                      [index]: !prev[index]
                    }));
                  }}
                >
                  <div style={{display: 'flex', alignItems: 'flex-start', gap: '1rem'}}>
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelections(prev => ({
                          ...prev,
                          [index]: e.target.checked
                        }));
                      }}
                      style={{marginTop: '0.25rem', cursor: 'pointer'}}
                    />
                    <div style={{flex: 1}}>
                      <div style={{fontWeight: '600', marginBottom: '0.5rem'}}>
                        📅 {conflict.newItem?.date}
                      </div>
                      <div style={{fontSize: '0.875rem', color: '#64748b'}}>
                        <div style={{marginBottom: '0.25rem'}}>
                          <strong>Existant:</strong> {conflict.existingType} {conflict.existingHours}
                          {conflict.existingOrigine && (
                            <span style={{
                              marginLeft: '0.5rem', 
                              fontSize: '0.75rem', 
                              padding: '0.125rem 0.5rem', 
                              background: '#e5e7eb', 
                              borderRadius: '4px'
                            }}>
                              {conflict.existingOrigine}
                            </span>
                          )}
                        </div>
                        <div>
                          <strong>Nouveau:</strong> {conflict.newType} {conflict.newItem?.heure_debut}-{conflict.newItem?.heure_fin}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Résumé */}
          <div style={{
            marginTop: '1rem', 
            padding: '1rem', 
            background: '#f3f4f6', 
            borderRadius: '8px', 
            fontSize: '0.875rem'
          }}>
            <div style={{marginBottom: '0.5rem'}}>
              <strong>Résumé:</strong>
            </div>
            <div>
              • {selectedCount} conflit(s) sélectionné(s) pour remplacement
            </div>
            <div>
              • {conflicts.length - selectedCount} conflit(s) seront ignorés (existant conservé)
            </div>
          </div>
        </div>
        
        <div className="modal-actions">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            variant="default"
            onClick={onConfirm}
          >
            ✅ Confirmer ({selectedCount} remplacements)
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BatchConflictModal;
