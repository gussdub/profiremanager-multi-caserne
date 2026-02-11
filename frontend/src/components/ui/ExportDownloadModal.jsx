import React from 'react';
import { Button } from './button';
import { useToast } from './use-toast';

/**
 * Modal de téléchargement d'export PDF/Excel
 * Compatible avec les environnements iframe sandbox
 * 
 * Usage:
 * <ExportDownloadModal
 *   isOpen={showModal}
 *   onClose={() => setShowModal(false)}
 *   downloadUrl={url}
 *   filename="document.pdf"
 *   type="pdf" // ou "excel"
 * />
 */
export const ExportDownloadModal = ({ 
  isOpen, 
  onClose, 
  downloadUrl, 
  filename, 
  type = 'pdf' 
}) => {
  const { toast } = useToast();
  
  if (!isOpen || !downloadUrl) return null;
  
  const isPdf = type === 'pdf';
  const icon = isPdf ? '📄' : '📊';
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(downloadUrl).then(() => {
      toast({
        title: "✅ Lien copié !",
        description: "Collez-le dans un nouvel onglet pour télécharger",
        variant: "success"
      });
    }).catch(() => {
      toast({
        title: "Erreur",
        description: "Impossible de copier le lien",
        variant: "destructive"
      });
    });
  };
  
  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{ zIndex: 100001 }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: '450px', 
          width: '95%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3>{icon} Export prêt</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div style={{ 
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
            {icon}
          </div>
          
          <h4 style={{ 
            fontSize: '1.1rem', 
            color: '#1f2937', 
            marginBottom: '0.5rem',
            fontWeight: '600'
          }}>
            {filename}
          </h4>
          
          <p style={{ 
            fontSize: '0.9rem', 
            color: '#6b7280',
            marginBottom: '1.5rem'
          }}>
            Votre fichier {isPdf ? 'PDF' : 'Excel'} est prêt !
          </p>
          
          <button
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '1rem 2rem',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              width: '100%',
              maxWidth: '300px'
            }}
          >
            📋 Copier le lien de téléchargement
          </button>
          
          <p style={{ 
            marginTop: '1rem', 
            fontSize: '0.85rem', 
            color: '#6b7280'
          }}>
            Puis ouvrez un <strong>nouvel onglet</strong> et collez le lien
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook pour gérer facilement les exports
 * 
 * Usage:
 * const { exportModal, triggerExport } = useExportDownload();
 * 
 * // Dans le JSX:
 * {exportModal}
 * 
 * // Pour déclencher:
 * await triggerExport('/api/tenant/export-pdf', 'document.pdf', 'pdf', token);
 */
export const useExportDownload = () => {
  const [modalState, setModalState] = React.useState({
    isOpen: false,
    downloadUrl: '',
    filename: '',
    type: 'pdf'
  });
  const { toast } = useToast();
  
  const triggerExport = async (apiUrl, filename, type = 'pdf', token = null) => {
    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Erreur lors de la génération');
      }
      
      const data = await response.json();
      
      if (data.success && data.download_url) {
        setModalState({
          isOpen: true,
          downloadUrl: data.download_url,
          filename: data.filename || filename,
          type
        });
      } else {
        throw new Error('URL de téléchargement non disponible');
      }
    } catch (error) {
      console.error('Erreur export:', error);
      toast({
        title: "Erreur",
        description: `Impossible de générer l'export ${type.toUpperCase()}`,
        variant: "destructive"
      });
    }
  };
  
  const closeModal = () => {
    setModalState(prev => ({ ...prev, isOpen: false }));
  };
  
  const exportModal = (
    <ExportDownloadModal
      isOpen={modalState.isOpen}
      onClose={closeModal}
      downloadUrl={modalState.downloadUrl}
      filename={modalState.filename}
      type={modalState.type}
    />
  );
  
  return { exportModal, triggerExport, closeModal };
};

export default ExportDownloadModal;
