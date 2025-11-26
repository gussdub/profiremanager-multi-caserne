import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet } from '../utils/api';

const HistoriqueInspections = ({ batiment, tenantSlug, onBack, onViewInspection }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('tous');

  useEffect(() => {
    fetchInspections();
  }, [batiment.id]);

  const fetchInspections = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/inspections');
      // Filtrer par bâtiment et trier par date décroissante
      const filtered = data
        .filter(insp => insp.batiment_id === batiment.id)
        .sort((a, b) => new Date(b.date_inspection) - new Date(a.date_inspection));
      setInspections(filtered);
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatutLabel = (statut) => {
    const labels = {
      'valide': { label: '✅ Validée', color: '#22c55e' },
      'brouillon': { label: '📝 Brouillon', color: '#6b7280' },
      'absent': { label: '🟠 Absent', color: '#f97316' },
      'non_disponible': { label: '🟠 Non disponible', color: '#f97316' },
      'personne_mineure': { label: '🟠 Personne mineure', color: '#f97316' },
    };
    return labels[statut] || { label: statut, color: '#6b7280' };
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Chargement de l'historique...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header avec bouton retour */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <Button variant="outline" onClick={onBack}>
          ← Retour
        </Button>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            📜 Historique des inspections
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280' }}>
            {batiment.nom_etablissement || batiment.adresse_civique}
          </p>
        </div>
      </div>

      {/* Liste des inspections */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        {inspections.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            color: '#6b7280'
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
              Aucune inspection trouvée
            </p>
            <p style={{ fontSize: '0.875rem' }}>
              Ce bâtiment n'a pas encore été inspecté
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {inspections.map((inspection) => {
              const statutInfo = getStatutLabel(inspection.statut);
              
              return (
                <div
                  key={inspection.id}
                  onClick={() => onViewInspection(inspection)}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                    e.currentTarget.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '1rem',
                        fontWeight: '600',
                        marginBottom: '0.25rem'
                      }}>
                        📅 {formatDate(inspection.date_inspection)}
                      </div>
                      {inspection.preventionniste_id && (
                        <div style={{
                          fontSize: '0.875rem',
                          color: '#6b7280'
                        }}>
                          👤 Préventionniste
                        </div>
                      )}
                    </div>
                    <div style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: `${statutInfo.color}20`,
                      color: statutInfo.color,
                      fontSize: '0.875rem',
                      fontWeight: '600'
                    }}>
                      {statutInfo.label}
                    </div>
                  </div>

                  {/* Résumé */}
                  {inspection.observations && (
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#374151',
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '6px'
                    }}>
                      <strong>Observations :</strong> {inspection.observations}
                    </div>
                  )}

                  {/* Indicateur cliquable */}
                  <div style={{
                    marginTop: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#3b82f6',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span>Voir le détail</span>
                    <span>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoriqueInspections;
