import React, { useState } from 'react';
import { Button } from './button';

/**
 * Composant modal pour l'export de fichiers (PDF/Excel)
 * Compatible avec les environnements iframe sandbox
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Si la modale est ouverte
 * @param {Function} props.onClose - Callback de fermeture
 * @param {string} props.dataUrl - URL blob du fichier
 * @param {string} props.filename - Nom du fichier
 * @param {string} props.type - Type de fichier ('pdf' ou 'excel')
 * @param {Function} props.onDownloadSuccess - Callback après téléchargement
 */
export const ExportModal = ({ 
  isOpen, 
  onClose, 
  dataUrl, 
  filename, 
  type = 'pdf',
  onDownloadSuccess 
}) => {
  if (!isOpen || !dataUrl) return null;
  
  const handleClose = () => {
    if (dataUrl) {
      URL.revokeObjectURL(dataUrl);
    }
    onClose();
  };
  
  const handleDownload = () => {
    if (onDownloadSuccess) {
      onDownloadSuccess();
    }
  };
  
  const isPdf = type === 'pdf';
  
  return (
    <div 
      className="modal-overlay" 
      onClick={handleClose}
      style={{ zIndex: 100001 }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ 
          maxWidth: isPdf ? '900px' : '500px', 
          width: '95%', 
          height: isPdf ? '90vh' : 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <h3>{isPdf ? '📄' : '📊'} {filename}</h3>
          <Button variant="ghost" onClick={handleClose}>✕</Button>
        </div>
        <div style={{ 
          flex: 1, 
          overflow: 'hidden', 
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          {isPdf ? (
            <>
              <embed
                src={dataUrl}
                type="application/pdf"
                style={{
                  width: '100%',
                  height: '100%',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  minHeight: '500px'
                }}
              />
              <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Si le PDF ne s'affiche pas, utilisez le bouton ci-dessous pour le télécharger.
              </p>
            </>
          ) : (
            <>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📊</div>
              <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '1.5rem' }}>
                Votre fichier Excel est prêt !
              </p>
            </>
          )}
          
          <a 
            href={dataUrl} 
            download={filename}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: '#dc2626',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '1rem',
              fontWeight: '600'
            }}
            onClick={handleDownload}
          >
            📥 Télécharger {filename}
          </a>
          
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            Cliquez sur le bouton ci-dessus pour sauvegarder le fichier sur votre appareil
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook personnalisé pour gérer les exports de fichiers
 * @returns {Object} État et fonctions pour gérer les exports
 */
export const useExportModal = () => {
  const [showModal, setShowModal] = useState(false);
  const [exportData, setExportData] = useState({
    dataUrl: null,
    filename: '',
    type: 'pdf'
  });
  
  const openExport = (dataUrl, filename, type = 'pdf') => {
    setExportData({ dataUrl, filename, type });
    setShowModal(true);
  };
  
  const closeExport = () => {
    if (exportData.dataUrl) {
      URL.revokeObjectURL(exportData.dataUrl);
    }
    setExportData({ dataUrl: null, filename: '', type: 'pdf' });
    setShowModal(false);
  };
  
  return {
    showModal,
    exportData,
    openExport,
    closeExport
  };
};

/**
 * Fonction utilitaire pour télécharger un fichier depuis une API
 * et ouvrir la modale d'export
 * 
 * @param {string} url - URL de l'API
 * @param {string} token - Token d'authentification
 * @param {string} filename - Nom du fichier
 * @param {string} type - Type ('pdf' ou 'excel')
 * @param {Function} onSuccess - Callback avec le blob URL
 * @param {Function} onError - Callback d'erreur
 */
export const fetchAndExport = async (url, token, filename, type, onSuccess, onError) => {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    onSuccess(blobUrl, filename, type);
  } catch (error) {
    console.error('Erreur export:', error);
    if (onError) {
      onError(error);
    }
  }
};

export default ExportModal;
