import React from 'react';
import { Button } from '../ui/button';

/**
 * Composant de boutons d'action pour les remplacements et congés
 * Boutons de création de remplacement et congé
 */
const ActionButtons = ({
  onCreateRemplacement,
  onCreateConge
}) => {
  return (
    <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', width: '100%'}}>
      <Button 
        onClick={onCreateRemplacement}
        data-testid="create-replacement-btn"
        style={{
          background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
          color: 'white',
          padding: '0.75rem 1rem',
          fontSize: '0.95rem',
          fontWeight: '600',
          borderRadius: '10px',
          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
          border: 'none',
          transition: 'all 0.2s ease',
          flex: '1 1 auto',
          minWidth: '140px',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        🔄 Remplacement
      </Button>
      <Button 
        onClick={onCreateConge}
        data-testid="create-conge-btn"
        style={{
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          color: 'white',
          padding: '0.75rem 1rem',
          fontSize: '0.95rem',
          fontWeight: '600',
          borderRadius: '10px',
          boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
          border: 'none',
          transition: 'all 0.2s ease',
          flex: '1 1 auto',
          minWidth: '140px',
          maxWidth: '100%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        🏖️ Congé
      </Button>
    </div>
  );
};

/**
 * Composant de boutons d'export
 */
const ExportButtons = ({
  onExportPdf,
  onExportExcel
}) => {
  return (
    <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
      <Button variant="outline" onClick={onExportPdf} data-testid="export-pdf-btn">
        📄 Export PDF
      </Button>
      <Button variant="outline" onClick={onExportExcel} data-testid="export-excel-btn">
        📊 Export Excel
      </Button>
    </div>
  );
};

export { ActionButtons, ExportButtons };
