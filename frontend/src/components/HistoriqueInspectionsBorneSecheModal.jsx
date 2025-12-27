import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';

const HistoriqueInspectionsBorneSecheModal = ({ borne, tenantSlug, onClose }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState(null);

  useEffect(() => {
    fetchHistorique();
  }, [borne.id]);

  const fetchHistorique = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, `/bornes-seches/inspections?borne_seche_id=${borne.id}`);
      setInspections(data);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getResultatColor = (inspection) => {
    // Vérifier si pompage conforme et pas de défectuosités majeures
    if (inspection.pompage_continu_5min === 'Conforme') {
      return '#10b981'; // Vert
    }
    return '#ef4444'; // Rouge
  };

  const getResultatLabel = (inspection) => {
    if (inspection.pompage_continu_5min === 'Conforme') {
      return '✓ Conforme';
    }
    return '✗ Non conforme';
  };

  const renderInspectionDetails = (inspection) => {
    return (
      <div style={{ marginTop: '1rem' }}>
        {/* Bouton retour */}
        <button
          onClick={() => setSelectedInspection(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: '#f3f4f6',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}
        >
          ← Retour à la liste
        </button>

        {/* En-tête */}
        <div style={{ 
          background: getResultatColor(inspection) + '15',
          border: `1px solid ${getResultatColor(inspection)}`,
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '1rem' }}>
                Inspection du {formatDate(inspection.date_inspection)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Par: {inspection.inspecteur_nom || inspection.inspecteur_id}
              </div>
            </div>
            <span style={{
              padding: '0.5rem 1rem',
              background: getResultatColor(inspection),
              color: 'white',
              borderRadius: '20px',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}>
              {getResultatLabel(inspection)}
            </span>
          </div>
        </div>

        {/* Conditions */}
        <div style={{ 
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
            📋 Conditions
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Accessibilité</span>
              <div style={{ fontWeight: '500' }}>{inspection.accessibilite?.join(', ') || 'N/A'}</div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Conditions atmosphériques</span>
              <div style={{ fontWeight: '500' }}>{inspection.conditions_atmospheriques || 'N/A'}</div>
            </div>
            <div>
              <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>Température extérieure</span>
              <div style={{ fontWeight: '500' }}>{inspection.temperature_exterieure ? `${inspection.temperature_exterieure}°C` : 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Inspection visuelle */}
        <div style={{ 
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
            👁️ Inspection visuelle
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {[
              { label: 'Joint présent', value: inspection.joint_present },
              { label: 'Joint en bon état', value: inspection.joint_bon_etat },
              { label: 'Site accessible', value: inspection.site_accessible },
              { label: 'Site bien déneigé', value: inspection.site_bien_deneige },
              { label: 'Vanne sortie Storz 4"', value: inspection.vanne_sortie_storz_4 },
              { label: 'Vanne sortie 6" filetée', value: inspection.vanne_sortie_6_filetee },
              { label: 'Vanne sortie 4" filetée', value: inspection.vanne_sortie_4_filetee },
              { label: 'Niveau plan d\'eau', value: inspection.niveau_plan_eau },
            ].map((item, idx) => (
              <div key={idx} style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '0.5rem',
                background: '#f9fafb',
                borderRadius: '4px'
              }}>
                <span style={{ fontSize: '0.8rem' }}>{item.label}</span>
                <span style={{ 
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  color: item.value === 'Conforme' ? '#10b981' : 
                         item.value === 'Non conforme' || item.value === 'Défectuosité' ? '#ef4444' : '#6b7280'
                }}>
                  {item.value || 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Essai de pompage */}
        <div style={{ 
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1rem'
        }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
            🚰 Essai de pompage
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div style={{ 
              padding: '1rem',
              background: inspection.pompage_continu_5min === 'Conforme' ? '#d1fae5' : '#fee2e2',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                Pompage continu 5 min
              </div>
              <div style={{ 
                fontWeight: '700',
                fontSize: '1rem',
                color: inspection.pompage_continu_5min === 'Conforme' ? '#059669' : '#dc2626'
              }}>
                {inspection.pompage_continu_5min || 'N/A'}
              </div>
            </div>
            <div style={{ 
              padding: '1rem',
              background: '#e0f2fe',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                ⏱️ Temps d'amorçage
              </div>
              <div style={{ 
                fontWeight: '700',
                fontSize: '1.25rem',
                color: '#0284c7'
              }}>
                {inspection.temps_amorcage_secondes ? `${inspection.temps_amorcage_secondes} sec` : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Commentaires */}
        {inspection.commentaire && (
          <div style={{ 
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
              💬 Commentaires
            </h4>
            <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
              {inspection.commentaire}
            </p>
          </div>
        )}

        {/* Matricule pompier */}
        {inspection.matricule_pompier && (
          <div style={{ 
            background: '#f3f4f6',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            <strong>Matricule pompier:</strong> {inspection.matricule_pompier}
          </div>
        )}

        {/* Photos */}
        {inspection.photos_defauts && inspection.photos_defauts.length > 0 && (
          <div style={{ 
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
              📷 Photos ({inspection.photos_defauts.length})
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {inspection.photos_defauts.map((photo, idx) => (
                <img 
                  key={idx}
                  src={photo}
                  alt={`Photo ${idx + 1}`}
                  style={{ 
                    width: '100px',
                    height: '100px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                  onClick={() => window.open(photo, '_blank')}
                />
              ))}
            </div>
          </div>
        )}

        {/* Données additionnelles du formulaire personnalisé */}
        {inspection.sections && inspection.sections.length > 0 && (
          <div style={{ 
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
              📝 Données du formulaire
            </h4>
            {inspection.sections.map((section, sIdx) => (
              <div key={sIdx} style={{ marginBottom: '1rem' }}>
                <h5 style={{ 
                  margin: '0 0 0.5rem 0', 
                  fontSize: '0.8rem', 
                  color: '#6b7280',
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: '0.25rem'
                }}>
                  {section.nom}
                </h5>
                <div style={{ display: 'grid', gap: '0.25rem' }}>
                  {section.items?.map((item, iIdx) => (
                    <div key={iIdx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      padding: '0.25rem 0.5rem',
                      background: '#f9fafb',
                      borderRadius: '4px',
                      fontSize: '0.8rem'
                    }}>
                      <span>{item.label || item.nom}</span>
                      <span style={{ fontWeight: '500' }}>{item.valeur || item.value || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f9fafb'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600' }}>
              📜 Historique des inspections
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {borne.numero_identification} - {borne.nom || borne.adresse}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '1rem 1.5rem',
          overflowY: 'auto',
          flex: 1
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Chargement...
            </div>
          ) : selectedInspection ? (
            renderInspectionDetails(selectedInspection)
          ) : inspections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
              <p>Aucune inspection enregistrée pour cette borne</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {inspections.map((inspection, index) => (
                <div 
                  key={inspection.id || index}
                  onClick={() => setSelectedInspection(inspection)}
                  style={{
                    padding: '1rem',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    ':hover': {
                      borderColor: '#dc2626'
                    }
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#dc2626'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                        {formatDate(inspection.date_inspection)}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        👤 {inspection.inspecteur_nom || 'Inspecteur inconnu'}
                      </div>
                      {inspection.temps_amorcage_secondes && (
                        <div style={{ fontSize: '0.8rem', color: '#0284c7', marginTop: '0.25rem' }}>
                          ⏱️ Amorçage: {inspection.temps_amorcage_secondes} sec
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        padding: '0.25rem 0.75rem',
                        background: getResultatColor(inspection) + '20',
                        color: getResultatColor(inspection),
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}>
                        {getResultatLabel(inspection)}
                      </span>
                      <span style={{ color: '#9ca3af', fontSize: '1.25rem' }}>→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          background: '#f9fafb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {inspections.length} inspection{inspections.length > 1 ? 's' : ''} trouvée{inspections.length > 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.5rem',
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoriqueInspectionsBorneSecheModal;
