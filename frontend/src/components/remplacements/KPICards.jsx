/**
 * Composant KPI Cards pour le module Remplacements
 * Affiche les statistiques principales (demandes, acceptées, refusées, taux de succès)
 */

import React from 'react';

const KPICards = ({
  totalDemandes,
  enAttente,
  acceptees,
  refusees,
  remplacementsTrouves,
  tauxSucces,
  congesDuMois
}) => {
  return (
    <div className="kpi-grid" style={{marginBottom: '2rem'}}>
      <div className="kpi-card" style={{background: '#FCA5A5'}}>
        <h3>{totalDemandes}</h3>
        <p>Total Demandes</p>
      </div>
      <div className="kpi-card kpi-card-triple" style={{background: '#FEF3C7'}}>
        <div className="kpi-triple-container">
          <div className="kpi-triple-item">
            <h3>{enAttente}</h3>
            <p>En Attente</p>
          </div>
          <div className="kpi-triple-item">
            <h3>{acceptees}</h3>
            <p>Acceptées</p>
          </div>
          <div className="kpi-triple-item">
            <h3>{refusees}</h3>
            <p>Refusées</p>
          </div>
        </div>
      </div>
      <div className="kpi-card" style={{background: '#D1FAE5'}}>
        <h3>{remplacementsTrouves}</h3>
        <p>Remplacements Trouvés</p>
      </div>
      <div className="kpi-card" style={{background: '#DBEAFE'}}>
        <h3>{tauxSucces}%</h3>
        <p>Taux de Succès</p>
      </div>
      <div className="kpi-card" style={{background: '#E9D5FF'}}>
        <h3>{congesDuMois}</h3>
        <p>Congés du Mois</p>
      </div>
    </div>
  );
};

export default KPICards;
