import React from 'react';
import { Button } from '../ui/button';

const ExportModal = ({
  show,
  onClose,
  exportType,
  demandes,
  activeTab,
  onExport,
  toast
}) => {
  if (!show) return null;

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
          maxWidth: '500px',
          width: '100%',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
        }}>
          <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: '600' }}>
            {exportType === 'pdf' ? '📄 Export PDF' : '📊 Export Excel'}
          </h2>
          <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem' }}>
            Choisissez les données à exporter
          </p>
        </div>

        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Button 
              variant="outline"
              onClick={async () => {
                try {
                  const endpoint = activeTab === 'conges' 
                    ? `/demandes-conge/export/${exportType}` 
                    : `/remplacements/export/${exportType}`;
                  await onExport(endpoint, exportType);
                  toast({ title: "Succès", description: `Export ${exportType.toUpperCase()} téléchargé` });
                  onClose();
                } catch (error) {
                  toast({ title: "Erreur", description: "Impossible d'exporter", variant: "destructive" });
                }
              }}
              style={{
                padding: '1.5rem',
                justifyContent: 'flex-start',
                gap: '1rem',
                fontSize: '1rem'
              }}
            >
              <span style={{fontSize: '1.5rem'}}>📋</span>
              <div style={{textAlign: 'left'}}>
                <div style={{fontWeight: '600'}}>Toutes les demandes</div>
                <div style={{fontSize: '0.875rem', opacity: 0.8}}>
                  Exporter toutes les demandes de remplacement ({demandes.length} demandes)
                </div>
              </div>
            </Button>

            <Button 
              variant="outline"
              onClick={() => {
                toast({ title: "Info", description: "Sélectionnez un pompier depuis le module Personnel pour exporter ses demandes" });
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
