import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiPost } from '../utils/api';

// Modal d'import CSV pour inspections de bornes fontaines
const ImportCSVModal = ({ onClose, onSuccess, tenantSlug }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        alert('Veuillez sélectionner un fichier CSV');
        return;
      }
      setFile(selectedFile);
      
      // Prévisualiser les premières lignes
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').slice(0, 4); // Header + 3 premières lignes
        setPreviewData(lines.join('\n'));
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert('Veuillez sélectionner un fichier');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/actifs/bornes/import-inspections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de l\'import');
      }

      const result = await response.json();
      alert(`✅ Import réussi!\n\n${result.imported || 0} inspection(s) importée(s)\n${result.errors || 0} erreur(s)`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erreur import:', error);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = `numero_borne,date_inspection,debit_gpm,etat,observations
BF-001,2024-01-15,1000,conforme,Borne en bon état
BF-002,2024-01-16,950,conforme,RAS
BF-003,2024-01-17,800,non_conforme,Débit faible`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_inspections.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '700px',
        width: '100%',
        padding: '30px',
        maxHeight: '90vh',
        overflow: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '10px' }}>
          📥 Importer des Inspections (CSV)
        </h2>
        <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '14px' }}>
          Importez les données d'inspection des bornes fontaines réalisées par un service externe
        </p>

        {/* Instructions */}
        <div style={{ 
          background: '#e8f4f8', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #bee5eb'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', color: '#0c5460' }}>
            📋 Format requis
          </h3>
          <p style={{ fontSize: '13px', color: '#0c5460', marginBottom: '10px' }}>
            Le fichier CSV doit contenir les colonnes suivantes:
          </p>
          <ul style={{ fontSize: '13px', color: '#0c5460', paddingLeft: '20px' }}>
            <li><strong>numero_borne</strong> - Numéro d'identification de la borne</li>
            <li><strong>date_inspection</strong> - Date au format YYYY-MM-DD</li>
            <li><strong>debit_gpm</strong> - Débit mesuré en GPM</li>
            <li><strong>etat</strong> - conforme, non_conforme ou defectueux</li>
            <li><strong>observations</strong> - Notes additionnelles (optionnel)</li>
          </ul>
        </div>

        {/* Bouton télécharger template */}
        <button
          onClick={downloadTemplate}
          style={{
            width: '100%',
            padding: '12px',
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '20px'
          }}
        >
          📄 Télécharger le modèle CSV
        </button>

        {/* Sélection de fichier */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontSize: '14px', 
            fontWeight: '600',
            color: '#555'
          }}>
            Fichier CSV *
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{
              width: '100%',
              padding: '10px',
              border: '2px dashed #ced4da',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          />
        </div>

        {/* Prévisualisation */}
        {previewData && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontSize: '14px', 
              fontWeight: '600',
              color: '#555'
            }}>
              Prévisualisation
            </label>
            <pre style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              border: '1px solid #dee2e6'
            }}>
              {previewData}
            </pre>
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !file}
            style={{
              padding: '12px 24px',
              background: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: loading || !file ? 0.6 : 1
            }}
          >
            {loading ? 'Import en cours...' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
};



export default ImportCSVModal;
