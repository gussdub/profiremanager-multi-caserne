import React, { useState } from 'react';
import { Button } from './ui/button';
import CalendrierInspections from './CalendrierInspections';
import CartePlanification from './CartePlanification';
import { apiGet } from '../utils/api';
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

  const handleBatimentClick = (batiment) => {
    // Ouvrir le modal du bâtiment
    if (openBatimentModal) {
      openBatimentModal(batiment);
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
        gap: '0.5rem'
      }}>
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

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {vue === 'calendrier' ? (
          <CalendrierInspections
            tenantSlug={tenantSlug}
            apiGet={apiGet}
            user={user}
            toast={toast}
            setCurrentView={setCurrentView}
            batiments={batiments}
            filteredBatimentId={filteredBatimentId}
            setFilteredBatimentId={setFilteredBatimentId}
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
