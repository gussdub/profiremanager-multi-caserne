import React from "react";
import { Button } from "../ui/button";

/**
 * ExportModal - Modal d'export des disponibilités
 * Extrait de MesDisponibilites.jsx
 */
const ExportModal = ({
  show,
  onClose,
  exportType,
  onExportAll,
  toast
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '500px'}}>
        <div className="modal-header">
          <h3>📊 Export Disponibilités {exportType === 'pdf' ? 'PDF' : 'Excel'}</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body" style={{padding: '2rem'}}>
          <p style={{marginBottom: '1.5rem', color: '#64748b'}}>
            Que souhaitez-vous exporter ?
          </p>
          
          <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
            <Button 
              onClick={onExportAll}
              style={{
                padding: '1.5rem',
                justifyContent: 'flex-start',
                gap: '1rem',
                fontSize: '1rem'
              }}
            >
              <span style={{fontSize: '1.5rem'}}>📋</span>
              <div style={{textAlign: 'left'}}>
                <div style={{fontWeight: '600'}}>Toutes les disponibilités</div>
                <div style={{fontSize: '0.875rem', opacity: 0.8}}>
                  Exporter les disponibilités de tous les pompiers temps partiel
                </div>
              </div>
            </Button>

            <Button 
              variant="outline"
              onClick={() => {
                toast({ 
                  title: "Info", 
                  description: "Sélectionnez un pompier depuis le module Personnel pour exporter ses disponibilités" 
                });
              }}
              style={{
                padding: '1.5rem',
                justifyContent: 'flex-start',
                gap: '1rem',
                fontSize: '1rem'
              }}
            >
              <span style={{fontSize: '1.5rem'}}>👤</span>
              <div style={{textAlign: 'left'}}>
                <div style={{fontWeight: '600'}}>Une personne spécifique</div>
                <div style={{fontSize: '0.875rem', opacity: 0.8}}>
                  Disponible depuis le module Personnel
                </div>
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
