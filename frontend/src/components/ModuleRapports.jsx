import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet } from '../utils/api';

const ModuleRapports = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [tendances, setTendances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchTendances = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/rapports/tendances');
        setTendances(data.tendances);
      } catch (error) {
        console.error('Erreur chargement tendances:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les tendances",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTendances();
  }, [tenantSlug]);

  const handleExport = async (type) => {
    try {
      setExporting(true);
      
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=${type}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Succès",
        description: "Export Excel téléchargé avec succès"
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

  if (loading) {
    return <div className="loading-spinner">Chargement des rapports...</div>;
  }

  return (
    <div className="rapports-container">
      <div className="page-header">
        <h2>📊 Rapports et Analyses</h2>
      </div>

      {/* Exports Excel */}
      <div className="rapport-section">
        <h3>📥 Exports Excel</h3>
        <p className="section-description">Téléchargez vos données en format Excel pour analyses approfondies</p>
        
        <div className="export-cards">
          <div className="export-card">
            <div className="export-icon">📋</div>
            <h4>Inspections</h4>
            <p>Toutes les inspections avec dates, statuts, scores et non-conformités</p>
            <Button 
              onClick={() => handleExport('inspections')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>

          <div className="export-card">
            <div className="export-icon">🏢</div>
            <h4>Bâtiments</h4>
            <p>Liste complète des bâtiments avec informations et historiques d'inspections</p>
            <Button 
              onClick={() => handleExport('batiments')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>

          <div className="export-card">
            <div className="export-icon">⚠️</div>
            <h4>Non-Conformités</h4>
            <p>Toutes les non-conformités détectées avec statuts et délais de correction</p>
            <Button 
              onClick={() => handleExport('non_conformites')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>
        </div>
      </div>

      {/* Graphiques de tendances */}
      {tendances && (
        <div className="rapport-section">
          <h3>📈 Tendances sur 6 mois</h3>
          <p className="section-description">Évolution des inspections et de la conformité</p>
          
          <div className="tendances-grid">
            {/* Graphique inspections */}
            <div className="tendance-card">
              <h4>Nombre d'Inspections</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar"
                        style={{ 
                          height: `${Math.max((month.inspections_total / Math.max(...tendances.map(m => m.inspections_total))) * 100, 5)}%` 
                        }}
                        title={`${month.inspections_total} inspections`}
                      >
                        <span className="bar-value">{month.inspections_total}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique taux conformité */}
            <div className="tendance-card">
              <h4>Taux de Conformité (%)</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar conformite-bar"
                        style={{ height: `${month.taux_conformite}%` }}
                        title={`${month.taux_conformite}% conforme`}
                      >
                        <span className="bar-value">{month.taux_conformite}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique NC */}
            <div className="tendance-card">
              <h4>Nouvelles Non-Conformités</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar nc-bar"
                        style={{ 
                          height: `${Math.max((month.non_conformites_nouvelles / Math.max(...tendances.map(m => m.non_conformites_nouvelles || 1))) * 100, 5)}%` 
                        }}
                        title={`${month.non_conformites_nouvelles} NC`}
                      >
                        <span className="bar-value">{month.non_conformites_nouvelles}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tableau récapitulatif */}
      {tendances && (
        <div className="rapport-section">
          <h3>📊 Tableau Récapitulatif</h3>
          <div className="recap-table-wrapper">
            <table className="recap-table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Inspections</th>
                  <th>Conformes</th>
                  <th>Taux Conformité</th>
                  <th>Nouvelles NC</th>
                </tr>
              </thead>
              <tbody>
                {tendances.map((month, idx) => (
                  <tr key={idx}>
                    <td>{month.mois}</td>
                    <td>{month.inspections_total}</td>
                    <td>{month.inspections_conformes}</td>
                    <td>
                      <span className={`taux-badge ${month.taux_conformite >= 80 ? 'good' : month.taux_conformite >= 50 ? 'medium' : 'bad'}`}>
                        {month.taux_conformite}%
                      </span>
                    </td>
                    <td>{month.non_conformites_nouvelles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Module Prévention - Gestion des inspections et bâtiments


// Modal pour ajout/modification de point d'eau

export default ModuleRapports;
