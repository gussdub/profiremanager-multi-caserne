import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet } from '../utils/api';

const HistoriqueInspections = ({ batiment, tenantSlug, onBack, onViewInspection }) => {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('tous');
  const [filtreAnnee, setFiltreAnnee] = useState('toutes');
  const [filtreAvis, setFiltreAvis] = useState(false);

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

  // Années disponibles dans les données
  const anneesDisponibles = [...new Set(
    inspections
      .map(i => i.date_inspection ? new Date(i.date_inspection).getFullYear() : null)
      .filter(Boolean)
  )].sort((a, b) => b - a);

  // Vérification si une inspection a un avis émis
  const hasAvis = (insp) => {
    return insp.avis_emis === true ||
      (insp.avis_emission_texte && insp.avis_emission_texte.trim() !== '') ||
      (insp.pfm_record?.avis_emission && insp.pfm_record.avis_emission !== '0' && insp.pfm_record.avis_emission !== 'false');
  };

  // Inspections filtrées (statut + année + avis)
  const inspectionsFiltrees = inspections.filter(i => {
    if (filtreStatut !== 'tous' && i.statut !== filtreStatut) return false;
    if (filtreAnnee !== 'toutes') {
      const annee = i.date_inspection ? new Date(i.date_inspection).getFullYear() : null;
      if (annee !== parseInt(filtreAnnee)) return false;
    }
    if (filtreAvis && !hasAvis(i)) return false;
    return true;
  });

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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
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

      {/* Filtres */}
      {inspections.length > 0 && (
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {/* Filtre Statut */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#6b7280', minWidth: '80px' }}>
              Statut :
            </span>
            {['tous', 'valide', 'brouillon', 'absent', 'non_disponible', 'personne_mineure'].map(statut => {
              const count = statut === 'tous'
                ? inspections.length
                : inspections.filter(i => i.statut === statut).length;
              if (count === 0 && statut !== 'tous') return null;
              const labels = {
                'tous': 'Tous',
                'valide': 'Validées',
                'brouillon': 'Brouillons',
                'absent': 'Absent',
                'non_disponible': 'Non disponible',
                'personne_mineure': 'Personne mineure'
              };
              const isActive = filtreStatut === statut;
              return (
                <button
                  key={statut}
                  data-testid={`filtre-statut-${statut}`}
                  onClick={() => setFiltreStatut(statut)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    border: isActive ? '2px solid #3b82f6' : '1px solid #d1d5db',
                    backgroundColor: isActive ? '#3b82f6' : 'white',
                    color: isActive ? 'white' : '#374151',
                    fontSize: '0.8rem',
                    fontWeight: isActive ? '600' : '500',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {labels[statut]} ({count})
                </button>
              );
            })}
          </div>

          {/* Filtre Année */}
          {anneesDisponibles.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#6b7280', minWidth: '80px' }}>
                Année :
              </span>
              {['toutes', ...anneesDisponibles.map(String)].map(annee => {
                const count = annee === 'toutes'
                  ? inspections.length
                  : inspections.filter(i => i.date_inspection && new Date(i.date_inspection).getFullYear() === parseInt(annee)).length;
                const isActive = filtreAnnee === annee;
                return (
                  <button
                    key={annee}
                    data-testid={`filtre-annee-${annee}`}
                    onClick={() => setFiltreAnnee(annee)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '20px',
                      border: isActive ? '2px solid #8b5cf6' : '1px solid #d1d5db',
                      backgroundColor: isActive ? '#8b5cf6' : 'white',
                      color: isActive ? 'white' : '#374151',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? '600' : '500',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {annee === 'toutes' ? `Toutes (${count})` : `${annee} (${count})`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Filtre Avis émis */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#6b7280', minWidth: '80px' }}>
              Avis :
            </span>
            <button
              data-testid="filtre-avec-avis"
              onClick={() => setFiltreAvis(!filtreAvis)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '20px',
                border: filtreAvis ? '2px solid #dc2626' : '1px solid #d1d5db',
                backgroundColor: filtreAvis ? '#dc2626' : 'white',
                color: filtreAvis ? 'white' : '#374151',
                fontSize: '0.8rem',
                fontWeight: filtreAvis ? '600' : '500',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              {filtreAvis ? '✓ ' : ''}Avec avis ({inspections.filter(i => hasAvis(i)).length})
            </button>
            {(filtreStatut !== 'tous' || filtreAnnee !== 'toutes' || filtreAvis) && (
              <button
                data-testid="filtre-reinitialiser"
                onClick={() => { setFiltreStatut('tous'); setFiltreAnnee('toutes'); setFiltreAvis(false); }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '20px',
                  border: '1px solid #d1d5db',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  marginLeft: '0.5rem'
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>

          {/* Compteur résultats */}
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {inspectionsFiltrees.length} résultat{inspectionsFiltrees.length !== 1 ? 's' : ''} sur {inspections.length} inspection{inspections.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Liste des inspections */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        {inspectionsFiltrees.length === 0 ? (
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
            {inspectionsFiltrees.map((inspection) => {
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
                      {/* Type de prévention */}
                      {(inspection.type_inspection || inspection.pfm_record?.type_prev) && (
                        <div style={{ fontSize: '0.8rem', color: '#4b5563', fontWeight: '500', marginBottom: '2px' }}>
                          {inspection.type_inspection || inspection.pfm_record?.type_prev}
                        </div>
                      )}
                      {/* Inspecteur */}
                      {(inspection.inspecteur || inspection.inspecteur_nom || inspection.pfm_record?.id_auteur) && (
                        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                          👤 {(inspection.inspecteur || inspection.inspecteur_nom || inspection.pfm_record?.id_auteur || '').replace(/^\*?\d+\s*-\s*/, '')}
                        </div>
                      )}
                      {/* Anomalies */}
                      {(() => {
                        const raw = inspection.anomalies;
                        if (!raw) return null;
                        const arr = Array.isArray(raw) ? raw : (raw.anomalie ? [].concat(raw.anomalie) : raw.item ? [].concat(raw.item) : []);
                        if (!arr.length) return null;
                        const nonRes = arr.filter(a => {
                          const s = (a.statut || a.etat || '').toLowerCase();
                          return !s.includes('résol') && !s.includes('resol') && s !== 'fermé';
                        }).length;
                        return (
                          <div style={{ fontSize: '0.8rem', marginTop: '4px', display: 'flex', gap: '8px' }}>
                            <span style={{ color: nonRes > 0 ? '#dc2626' : '#16a34a', fontWeight: '600' }}>
                              ⚠ {arr.length} anomalie{arr.length > 1 ? 's' : ''}{nonRes > 0 ? ` (${nonRes} non résolu${nonRes > 1 ? 'es' : 'e'})` : ' (toutes résolues)'}
                            </span>
                          </div>
                        );
                      })()}
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
