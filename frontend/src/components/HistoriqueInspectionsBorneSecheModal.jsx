import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';

const HistoriqueInspectionsBorneSecheModal = ({ borne, tenantSlug, onClose }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [formulairesCache, setFormulairesCache] = useState({}); // Cache des formulaires chargés

  useEffect(() => {
    fetchHistorique();
  }, [borne.id]);

  // Charger un formulaire pour avoir les labels des champs
  const loadFormulaire = async (formulaireId) => {
    if (!formulaireId || formulairesCache[formulaireId]) return formulairesCache[formulaireId];
    try {
      const formulaire = await apiGet(tenantSlug, `/formulaires-inspection/${formulaireId}`);
      setFormulairesCache(prev => ({ ...prev, [formulaireId]: formulaire }));
      return formulaire;
    } catch (e) {
      console.log('Formulaire non trouvé:', formulaireId);
      return null;
    }
  };

  const fetchHistorique = async () => {
    try {
      setLoading(true);
      
      // Charger les inspections des deux systèmes
      let allInspections = [];
      
      // 1. Charger les inspections de l'ancien système (bornes sèches)
      try {
        const oldData = await apiGet(tenantSlug, `/bornes-seches/inspections?borne_seche_id=${borne.id}`);
        if (oldData && Array.isArray(oldData)) {
          allInspections = [...allInspections, ...oldData.map(i => ({ ...i, source: 'ancien' }))];
        }
      } catch (e) {
        console.log('Ancien système non disponible:', e);
      }
      
      // 2. Charger les inspections du nouveau système unifié
      try {
        const newData = await apiGet(tenantSlug, `/inspections-unifiees/borne_seche/${borne.id}`);
        if (newData && Array.isArray(newData)) {
          // Convertir vers le format d'affichage
          const converted = newData.map(i => ({
            ...i,
            source: 'unifie',
            inspecteur: i.inspecteur_nom || i.inspecteur_email || 'Non spécifié',
            date_inspection: i.date_inspection || i.created_at,
            pompage_continu_5min: i.conforme ? 'Conforme' : 'Non conforme'
          }));
          allInspections = [...allInspections, ...converted];
        }
      } catch (e) {
        console.log('Nouveau système unifié non disponible:', e);
      }
      
      // Trier par date décroissante
      allInspections.sort((a, b) => new Date(b.date_inspection || b.created_at) - new Date(a.date_inspection || a.created_at));
      
      setInspections(allInspections);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    
    // Si c'est une date au format YYYY-MM-DD (sans heure), l'afficher telle quelle sans conversion UTC
    if (typeof dateStr === 'string' && dateStr.length === 10 && dateStr[4] === '-' && dateStr[7] === '-') {
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    }
    
    // Si c'est une date ISO avec heure, convertir en heure locale
    const date = new Date(dateStr);
    // Vérifier si la date est valide
    if (isNaN(date.getTime())) return dateStr;
    
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Formater une date sans conversion UTC (pour les dates saisies comme YYYY-MM-DD)
  const formatDateOnly = (dateStr) => {
    if (!dateStr) return 'N/A';
    
    // Si c'est déjà au format YYYY-MM-DD, convertir simplement
    if (typeof dateStr === 'string' && dateStr.length >= 10 && dateStr[4] === '-' && dateStr[7] === '-') {
      const [year, month, day] = dateStr.substring(0, 10).split('-');
      return `${day}/${month}/${year}`;
    }
    
    return dateStr;
  };

  const getResultatColor = (inspection) => {
    // Vérifier si conforme
    if (inspection.conforme === true || inspection.pompage_continu_5min === 'Conforme') {
      return '#10b981'; // Vert
    }
    return '#ef4444'; // Rouge
  };

  const getResultatLabel = (inspection) => {
    if (inspection.conforme === true || inspection.pompage_continu_5min === 'Conforme') {
      return '✓ Conforme';
    }
    return '✗ Non conforme';
  };

  // Formater une valeur de réponse pour l'affichage
  const formatReponseValue = (valeur) => {
    if (valeur === null || valeur === undefined) return 'N/A';
    if (typeof valeur === 'boolean') return valeur ? 'Oui' : 'Non';
    if (typeof valeur === 'object') {
      // Météo
      if (valeur.temperature !== undefined) {
        return `${valeur.icon || '🌤️'} ${valeur.temperature}°C - ${valeur.condition || ''}`;
      }
      // Géolocalisation
      if (valeur.latitude && valeur.longitude) {
        return `📍 ${valeur.latitude.toFixed(4)}, ${valeur.longitude.toFixed(4)}`;
      }
      // Chronomètre
      if (valeur.formattedTime) {
        return `⏱️ ${valeur.formattedTime}`;
      }
      return JSON.stringify(valeur);
    }
    if (Array.isArray(valeur)) return valeur.join(', ');
    return String(valeur);
  };

  // Extraire la date depuis les réponses du formulaire si elle existe
  const getInspectionDate = (inspection) => {
    // D'abord, chercher une date dans les réponses du formulaire
    const reponses = inspection.reponses || {};
    for (const [, data] of Object.entries(reponses)) {
      const valeur = typeof data === 'object' && data.valeur !== undefined ? data.valeur : data;
      // Vérifier si c'est une date au format YYYY-MM-DD
      if (typeof valeur === 'string' && valeur.length >= 10 && valeur[4] === '-' && valeur[7] === '-') {
        return valeur;
      }
    }
    // Sinon, utiliser la date_inspection ou created_at
    return inspection.date_inspection || inspection.created_at;
  };

  // Rendu des données d'une inspection unifiée (avec formulaire personnalisé)
  const renderUnifiedInspectionDetails = (inspection) => {
    const formulaire = formulairesCache[inspection.formulaire_id];
    const reponses = inspection.reponses || {};
    const dateAffichage = getInspectionDate(inspection);

    // Organiser les réponses par section
    const sectionMap = {};
    Object.entries(reponses).forEach(([itemId, data]) => {
      const sectionName = typeof data === 'object' && data.section ? data.section : 'Réponses';
      const valeur = typeof data === 'object' && data.valeur !== undefined ? data.valeur : data;
      if (!sectionMap[sectionName]) sectionMap[sectionName] = [];
      
      // Trouver le label du champ dans le formulaire
      let label = itemId;
      if (formulaire?.sections) {
        for (const section of formulaire.sections) {
          const item = section.items?.find(i => i.id === itemId);
          if (item) {
            label = item.nom || item.label || itemId;
            break;
          }
        }
      }
      
      sectionMap[sectionName].push({ id: itemId, label, valeur });
    });

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
                Inspection du {formatDate(dateAffichage)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Par: {inspection.inspecteur_nom || 'Non spécifié'}
              </div>
              {formulaire?.nom && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                  📋 {formulaire.nom}
                </div>
              )}
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

        {/* Sections et réponses */}
        {Object.entries(sectionMap).map(([sectionName, items], sIdx) => (
          <div key={sIdx} style={{ 
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
              📋 {sectionName}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {items.map((item, iIdx) => (
                <div key={iIdx} style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  padding: '0.75rem',
                  background: '#f9fafb',
                  borderRadius: '6px'
                }}>
                  <span style={{ color: '#6b7280', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{item.label}</span>
                  <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{formatReponseValue(item.valeur)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Notes */}
        {inspection.notes_generales && (
          <div style={{ 
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#374151' }}>
              💬 Notes
            </h4>
            <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
              {inspection.notes_generales}
            </p>
          </div>
        )}

        {/* Alertes */}
        {inspection.alertes && inspection.alertes.length > 0 && (
          <div style={{ 
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#dc2626' }}>
              ⚠️ Alertes déclenchées
            </h4>
            {inspection.alertes.map((alerte, aIdx) => (
              <div key={aIdx} style={{ 
                padding: '0.5rem',
                background: 'white',
                borderRadius: '4px',
                marginBottom: '0.25rem',
                fontSize: '0.875rem'
              }}>
                {alerte.message || alerte}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderInspectionDetails = (inspection) => {
    // Si c'est une inspection unifiée (avec reponses), utiliser le nouveau rendu
    if (inspection.source === 'unifie' || inspection.reponses) {
      return renderUnifiedInspectionDetails(inspection);
    }
    
    // Sinon, utiliser l'ancien format (rétrocompatibilité)
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
                ⏱️ Temps d&apos;amorçage
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
                  onClick={async () => {
                    // Charger le formulaire si c'est une inspection unifiée
                    if (inspection.formulaire_id && !formulairesCache[inspection.formulaire_id]) {
                      await loadFormulaire(inspection.formulaire_id);
                    }
                    setSelectedInspection(inspection);
                  }}
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
