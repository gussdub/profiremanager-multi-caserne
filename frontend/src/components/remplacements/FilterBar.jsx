/**
 * Composant Barre de filtres pour le module Remplacements
 * Permet de filtrer par statut, période et dates personnalisées
 */

import React from 'react';
import { Button } from '../ui/button';

const FilterBar = ({
  filterStatut,
  setFilterStatut,
  filterPeriode,
  setFilterPeriode,
  filterDateDebut,
  setFilterDateDebut,
  filterDateFin,
  setFilterDateFin,
  resetFilters,
  resultCount,
  onExportPDF,
  onExportExcel
}) => {
  return (
    <>
      {/* Barre de filtres compacte */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center',
        padding: '1rem',
        backgroundColor: '#F9FAFB',
        borderRadius: '12px',
        border: '1px solid #E5E7EB',
        marginTop: '1rem'
      }}>
        <span style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>🔍 Filtres:</span>
        
        {/* Filtre par statut */}
        <select 
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          data-testid="filter-statut"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid #D1D5DB',
            cursor: 'pointer',
            backgroundColor: 'white',
            fontSize: '0.9rem'
          }}
        >
          <option value="non_traitees">⏳ Non traitées</option>
          <option value="acceptees">✅ Acceptées</option>
          <option value="refusees">❌ Refusées/Annulées</option>
          <option value="toutes">📋 Toutes</option>
        </select>

        {/* Filtre par période */}
        <select 
          value={filterPeriode}
          onChange={(e) => setFilterPeriode(e.target.value)}
          data-testid="filter-periode"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            border: '1px solid #D1D5DB',
            cursor: 'pointer',
            backgroundColor: 'white',
            fontSize: '0.9rem'
          }}
        >
          <option value="toutes">📅 Toutes périodes</option>
          <option value="ce_mois">📅 Ce mois-ci</option>
          <option value="mois_precedent">📅 Mois précédent</option>
          <option value="3_mois">📅 3 derniers mois</option>
          <option value="cette_annee">📅 Cette année</option>
          <option value="personnalise">🔧 Période personnalisée</option>
        </select>

        {/* Dates personnalisées */}
        {filterPeriode === 'personnalise' && (
          <>
            <input
              type="date"
              value={filterDateDebut}
              onChange={(e) => setFilterDateDebut(e.target.value)}
              data-testid="filter-date-debut"
              style={{
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem'
              }}
              placeholder="Date début"
            />
            <span style={{ color: '#6B7280' }}>→</span>
            <input
              type="date"
              value={filterDateFin}
              onChange={(e) => setFilterDateFin(e.target.value)}
              data-testid="filter-date-fin"
              style={{
                padding: '0.5rem',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem'
              }}
              placeholder="Date fin"
            />
          </>
        )}

        {/* Bouton réinitialiser */}
        <Button
          variant="outline"
          size="sm"
          onClick={resetFilters}
          data-testid="reset-filters-btn"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.85rem',
            borderRadius: '8px'
          }}
        >
          🔄 Réinitialiser
        </Button>

        {/* Compteur de résultats */}
        <span style={{ 
          marginLeft: 'auto', 
          fontSize: '0.85rem', 
          color: '#6B7280',
          backgroundColor: '#E5E7EB',
          padding: '0.4rem 0.8rem',
          borderRadius: '20px'
        }}>
          {resultCount} résultat(s)
        </span>
      </div>

      {/* Exports */}
      <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
        <Button variant="outline" onClick={onExportPDF} data-testid="export-pdf-btn">
          📄 Export PDF
        </Button>
        <Button variant="outline" onClick={onExportExcel} data-testid="export-excel-btn">
          📊 Export Excel
        </Button>
      </div>
    </>
  );
};

export default FilterBar;
