import React, { useState } from 'react';
import { Button } from './ui/button';
import CalendrierInspections from './CalendrierInspections';
import CartePlanification from './CartePlanification';
import { apiGet, apiPost, getTenantToken } from '../utils/api';
import { useToast } from '../hooks/use-toast';

const PlanificationView = ({ 
  tenantSlug, 
  setCurrentView, 
  batiments, 
  filteredBatimentId, 
  setFilteredBatimentId,
  openBatimentModal,
  parametres,
  user
}) => {
  const { toast } = useToast();
  const [vue, setVue] = useState('calendrier'); // 'calendrier' ou 'carte'
  const [exporting, setExporting] = useState(false);

  const handleBatimentClick = (batiment) => {
    // Ouvrir le modal du bâtiment
    if (openBatimentModal) {
      openBatimentModal(batiment);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      
      const token = getTenantToken();
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=inspections`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inspections_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export réussi",
        description: "Le fichier Excel a été téléchargé"
      });
    } catch (error) {
      console.error('Erreur export:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Toggle Vue */}
      <div style={{
        padding: '1rem',
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            variant={vue === 'calendrier' ? 'default' : 'outline'}
            onClick={() => setVue('calendrier')}
          >
            📅 Vue Calendrier
          </Button>
          <Button
            variant={vue === 'carte' ? 'default' : 'outline'}
            onClick={() => setVue('carte')}
          >
            🗺️ Vue Carte
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? '⏳ Export...' : '📥 Exporter Excel'}
        </Button>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {vue === 'calendrier' ? (
          <CalendrierInspections
            tenantSlug={tenantSlug}
            apiGet={apiGet}
            apiPost={apiPost}
            user={user}
            toast={toast}
            setCurrentView={setCurrentView}
            batiments={batiments}
            filteredBatimentId={filteredBatimentId}
            setFilteredBatimentId={setFilteredBatimentId}
            openBatimentModal={openBatimentModal}
          />
        ) : (
          <CartePlanification
            tenantSlug={tenantSlug}
            onBatimentClick={handleBatimentClick}
            parametres={parametres}
          />
        )}
      </div>
    </div>
  );
};

export default PlanificationView;
