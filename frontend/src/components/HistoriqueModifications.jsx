import React, { useState, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { buildApiUrl, getTenantToken } from '../utils/api';

const typeConfig = {
  modification: { label: 'Modification', color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  inspection:   { label: 'Inspection',   color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE' },
  non_conformite: { label: 'Non-conformité', color: '#EF4444', bg: '#FEF2F2', border: '#FECACA' },
  intervention: { label: 'Intervention', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' }
};

const actionIcons = {
  create: '➕', update: '✏️', delete: '🗑️',
  import_xml: '📥', import_csv: '📥', import_sftp: '📡'
};

const graviteColors = {
  faible: '#6B7280', moyen: '#F59E0B', eleve: '#EF4444', critique: '#991B1B'
};

const statutNCColors = {
  ouverte: '#EF4444', en_cours: '#F59E0B', corrigee: '#22C55E', fermee: '#6B7280'
};

const fieldLabels = {
  nom_etablissement: 'Nom', adresse_civique: 'Adresse', ville: 'Ville',
  code_postal: 'Code postal', nombre_etages: "Nb étages", nombre_logements: 'Nb logements',
  annee_construction: 'Année construction', usage_batiment: 'Usage',
  classification_risque: 'Risque', matricule_evaluation: 'Matricule',
  telephone_contact: 'Téléphone', email_contact: 'Email', notes: 'Notes',
  latitude: 'Lat.', longitude: 'Lng.', secteur: 'Secteur', categorie: 'Catégorie',
  sprinkleur: 'Sprinkleur', gicleur: 'Gicleur', type_construction: 'Type construction'
};

const formatDate = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
};

const formatDateShort = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ts; }
};

const HistoriqueModifications = ({ batiment, tenantSlug, onBack }) => {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState(null);
  const [filters, setFilters] = useState({
    modification: true,
    inspection: true,
    non_conformite: true,
    intervention: true
  });

  useEffect(() => {
    const fetchHistorique = async () => {
      if (!batiment?.id || !tenantSlug) return;
      setLoading(true);
      try {
        const token = getTenantToken(tenantSlug);
        const url = buildApiUrl(tenantSlug, `/batiments/${batiment.id}/historique`);
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setTimeline(data);
        }
      } catch (err) {
        console.error('Erreur chargement historique:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistorique();
  }, [batiment?.id, tenantSlug]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter(item => filters[item.type]);
  }, [timeline, filters]);

  const counts = useMemo(() => {
    const c = { modification: 0, inspection: 0, non_conformite: 0, intervention: 0 };
    timeline.forEach(item => { if (c[item.type] !== undefined) c[item.type]++; });
    return c;
  }, [timeline]);

  const toggleFilter = (type) => {
    setFilters(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const renderModification = (item, isExpanded) => {
    const icon = actionIcons[item.action] || '📝';
    const sourceLabel = { manual: 'Manuel', xml: 'XML', csv: 'CSV', sftp: 'SFTP', api: 'API' }[item.source] || item.source;
    const actionLabel = { create: 'Création', update: 'Modification', delete: 'Suppression', import_xml: 'Import XML', import_csv: 'Import CSV' }[item.action] || item.action;
    
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <strong style={{ fontSize: '13px' }}>{actionLabel}</strong>
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: '#F3F4F6', color: '#6B7280' }}>{sourceLabel}</span>
          {item.user_name && <span style={{ fontSize: '12px', color: '#6B7280' }}>par {item.user_name}</span>}
        </div>
        {item.description && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{item.description}</div>}
        {isExpanded && item.changes && Object.keys(item.changes).length > 0 && (
          <div style={{ marginTop: '8px', fontSize: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '8px' }}>
            {Object.entries(item.changes).map(([field, vals]) => (
              <div key={field} style={{ display: 'flex', alignItems: 'baseline', gap: '6px', padding: '3px 0' }}>
                <span style={{ fontWeight: '600', color: '#374151', minWidth: '120px' }}>{fieldLabels[field] || field}</span>
                <span style={{ color: '#9CA3AF', textDecoration: 'line-through', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(vals?.old ?? '—')}</span>
                <span style={{ color: '#9CA3AF' }}>→</span>
                <span style={{ color: '#059669', fontWeight: '500' }}>{String(vals?.new ?? '—')}</span>
              </div>
            ))}
          </div>
        )}
        {!isExpanded && item.changes && Object.keys(item.changes).length > 0 && (
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>
            {Object.keys(item.changes).length} champ{Object.keys(item.changes).length > 1 ? 's' : ''} modifié{Object.keys(item.changes).length > 1 ? 's' : ''} — cliquer pour voir
          </div>
        )}
      </>
    );
  };

  const renderInspection = (item) => {
    const typeLabel = { reguliere: 'Régulière', plainte: 'Plainte', suivi: 'Suivi', reinspection: 'Réinspection' }[item.type_inspection] || item.type_inspection;
    const statutLabel = { en_cours: 'En cours', validee: 'Validée', en_attente_validation: 'En attente', non_conforme: 'Non conforme', suivi_requis: 'Suivi requis' }[item.statut] || item.statut;
    const conformiteColor = { conforme: '#22C55E', non_conforme: '#EF4444', partiellement_conforme: '#F59E0B' }[item.statut_conformite] || '#6B7280';
    
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>🔍</span>
          <strong style={{ fontSize: '13px' }}>Visite {typeLabel}</strong>
          {item.statut && (
            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: '#F3F4F6', color: '#6B7280' }}>{statutLabel}</span>
          )}
          {item.statut_conformite && (
            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: conformiteColor + '20', color: conformiteColor, fontWeight: '600' }}>
              {item.statut_conformite === 'conforme' ? 'Conforme' : item.statut_conformite === 'non_conforme' ? 'Non conforme' : 'Partiel'}
            </span>
          )}
        </div>
        {item.inspecteur && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Inspecteur : {item.inspecteur}</div>}
        {item.observations && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px', fontStyle: 'italic' }}>"{item.observations.substring(0, 120)}{item.observations.length > 120 ? '...' : ''}"</div>}
      </>
    );
  };

  const renderNonConformite = (item) => {
    const gColor = graviteColors[item.gravite] || '#6B7280';
    const sColor = statutNCColors[item.statut] || '#6B7280';
    const statutLabel = { ouverte: 'Ouverte', en_cours: 'En cours', corrigee: 'Corrigée', fermee: 'Fermée' }[item.statut] || item.statut;
    
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <strong style={{ fontSize: '13px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.titre || 'Non-conformité'}</strong>
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: gColor + '20', color: gColor, fontWeight: '600' }}>
            {item.gravite}
          </span>
          <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: sColor + '20', color: sColor, fontWeight: '600' }}>
            {statutLabel}
          </span>
          {item.est_manuel && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: '#F3F4F6', color: '#9CA3AF' }}>manuelle</span>}
        </div>
        {item.description && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{item.description.substring(0, 150)}{item.description.length > 150 ? '...' : ''}</div>}
        {item.articles_codes?.length > 0 && (
          <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
            Articles : {item.articles_codes.join(', ')}
          </div>
        )}
        {item.delai_correction && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>Délai : {formatDateShort(item.delai_correction)}</div>}
      </>
    );
  };

  const renderIntervention = (item) => {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '16px' }}>🚒</span>
          <strong style={{ fontSize: '13px' }}>{item.type_intervention || 'Intervention'}</strong>
          {item.code_feu && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: '#FEF3C7', color: '#92400E', fontWeight: '600' }}>{item.code_feu}</span>}
          {item.niveau_risque && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: '#FEE2E2', color: '#991B1B' }}>{item.niveau_risque}</span>}
          {item.no_sequentiel && <span style={{ fontSize: '11px', color: '#9CA3AF' }}>#{item.no_sequentiel}</span>}
        </div>
        {item.adresse && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>{item.adresse}</div>}
        {item.officer_in_charge && <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>Officier : {item.officer_in_charge}</div>}
      </>
    );
  };

  const renderItem = (item, isExpanded) => {
    switch (item.type) {
      case 'modification': return renderModification(item, isExpanded);
      case 'inspection': return renderInspection(item);
      case 'non_conformite': return renderNonConformite(item);
      case 'intervention': return renderIntervention(item);
      default: return <span>{item.type}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '90vh' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid #E5E7EB',
        background: '#F8FAFC',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Button variant="ghost" size="sm" onClick={onBack} data-testid="back-from-history">
              ← Retour
            </Button>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1E3A5F' }}>
              Historique complet
            </h3>
          </div>
          <span style={{ fontSize: '13px', color: '#6B7280' }}>
            {filteredTimeline.length} / {timeline.length}
          </span>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} data-testid="history-filters">
          {Object.entries(typeConfig).map(([key, cfg]) => {
            const active = filters[key];
            const count = counts[key];
            return (
              <button
                key={key}
                onClick={() => toggleFilter(key)}
                data-testid={`filter-${key}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: `1.5px solid ${active ? cfg.color : '#D1D5DB'}`,
                  background: active ? cfg.bg : '#F9FAFB',
                  color: active ? cfg.color : '#9CA3AF',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  opacity: active ? 1 : 0.6
                }}
              >
                {cfg.label}
                <span style={{
                  background: active ? cfg.color : '#D1D5DB',
                  color: 'white',
                  borderRadius: '8px',
                  padding: '0 5px',
                  fontSize: '10px',
                  minWidth: '18px',
                  textAlign: 'center'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>Chargement...</div>
        ) : filteredTimeline.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.4 }}>📋</div>
            <p>{timeline.length === 0 ? 'Aucun historique enregistré' : 'Aucun résultat avec ces filtres'}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '28px' }}>
            {/* Timeline vertical line */}
            <div style={{
              position: 'absolute', left: '10px', top: '4px', bottom: '4px',
              width: '2px', background: '#E5E7EB'
            }} />

            {filteredTimeline.map((item, idx) => {
              const cfg = typeConfig[item.type] || typeConfig.modification;
              const isExpanded = expandedItem === idx;
              const hasExpandable = item.type === 'modification' && item.changes && Object.keys(item.changes).length > 0;

              return (
                <div
                  key={`${item.type}-${item.id || idx}`}
                  data-testid={`history-item-${idx}`}
                  style={{
                    position: 'relative',
                    marginBottom: '12px',
                    cursor: hasExpandable ? 'pointer' : 'default'
                  }}
                  onClick={() => hasExpandable && setExpandedItem(isExpanded ? null : idx)}
                >
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', left: '-24px', top: '8px',
                    width: '12px', height: '12px', borderRadius: '50%',
                    background: cfg.color, border: '2px solid white',
                    boxShadow: `0 0 0 2px ${cfg.color}30`, zIndex: 1
                  }} />

                  {/* Card */}
                  <div style={{
                    background: isExpanded ? cfg.bg : 'white',
                    border: `1px solid ${isExpanded ? cfg.border : '#E5E7EB'}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    borderLeft: `3px solid ${cfg.color}`,
                    transition: 'all 0.15s ease'
                  }}>
                    {/* Type badge + date */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '700', textTransform: 'uppercase',
                        letterSpacing: '0.5px', color: cfg.color
                      }}>
                        {cfg.label}
                      </span>
                      <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                        {formatDate(item.timestamp)}
                      </span>
                    </div>

                    {renderItem(item, isExpanded)}
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

export default HistoriqueModifications;
