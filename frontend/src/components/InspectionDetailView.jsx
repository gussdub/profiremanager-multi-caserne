import React, { useState } from 'react';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, User, Calendar, FileText, Tag, List } from 'lucide-react';

// ─── Utilitaires ────────────────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch { return dateStr; }
};

/** Normalise n'importe quelle structure PFM en tableau plat */
const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    // Chercher la première clé tableau
    for (const key of Object.keys(val)) {
      const v = val[key];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && !Array.isArray(v)) return [v];
    }
  }
  return [];
};

/** Statut d'une anomalie PFM Transfer */
const anomalieStatut = (anomalie) => {
  const s = (anomalie.statut || anomalie.etat || '').toLowerCase();
  if (s.includes('résol') || s.includes('resol') || s === 'fermé' || s === 'ferme' || s === 'corrigé') {
    return { label: 'Résolu', color: '#16a34a', bg: '#dcfce7', icon: '✓' };
  }
  if (s.includes('progress') || s.includes('cours')) {
    return { label: 'En cours', color: '#d97706', bg: '#fef3c7', icon: '↻' };
  }
  return { label: 'Non résolu', color: '#dc2626', bg: '#fee2e2', icon: '!' };
};

const statutPrevention = (insp) => {
  const s = (insp.statut || insp.status || insp.resultat || '').toLowerCase();
  if (s === 'valide' || s === 'validé' || s === 'complété' || s === 'complétée' || s.includes('complet')) {
    return { label: 'Complétée', color: '#16a34a', bg: '#dcfce7' };
  }
  if (s === 'brouillon') return { label: 'Brouillon', color: '#6b7280', bg: '#f3f4f6' };
  if (s === 'absent') return { label: 'Absent', color: '#f97316', bg: '#ffedd5' };
  if (s) return { label: s, color: '#6b7280', bg: '#f3f4f6' };
  return { label: 'Importée', color: '#2563eb', bg: '#eff6ff' };
};

// ─── Composants UI ──────────────────────────────────────────────────────────

const InfoField = ({ label, value, fullWidth }) => (
  <div style={{
    padding: '10px 14px',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    gridColumn: fullWidth ? '1 / -1' : undefined
  }}>
    <div style={{ fontSize: '11px', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', color: '#111827', fontWeight: '500', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {value || '—'}
    </div>
  </div>
);

const SectionHeader = ({ icon: Icon, title, count }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '15px', fontWeight: '700', color: '#1f2937',
    marginBottom: '14px', paddingBottom: '10px',
    borderBottom: '2px solid #e5e7eb'
  }}>
    {Icon && <Icon size={17} color="#6b7280" />}
    {title}
    {count !== undefined && (
      <span style={{
        marginLeft: 'auto', fontSize: '12px', fontWeight: '700',
        backgroundColor: '#f3f4f6', color: '#6b7280',
        padding: '2px 8px', borderRadius: '99px'
      }}>{count}</span>
    )}
  </div>
);

const CollapsibleSection = ({ icon: Icon, title, count, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ marginBottom: '24px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '15px', fontWeight: '700', color: '#1f2937',
          marginBottom: open ? '14px' : 0, paddingBottom: open ? '10px' : 0,
          borderBottom: open ? '2px solid #e5e7eb' : 'none',
          cursor: 'pointer', userSelect: 'none'
        }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {Icon && <Icon size={16} color="#6b7280" />}
        {title}
        {count !== undefined && (
          <span style={{
            marginLeft: 'auto', fontSize: '12px', fontWeight: '700',
            backgroundColor: '#f3f4f6', color: '#6b7280',
            padding: '2px 8px', borderRadius: '99px'
          }}>{count}</span>
        )}
      </div>
      {open && children}
    </section>
  );
};

// ─── Composant principal ─────────────────────────────────────────────────────

const InspectionDetailView = ({ inspection, batiment, onBack }) => {
  const [showRaw, setShowRaw] = useState(false);

  // Normaliser les anomalies
  const anomalies = (() => {
    const raw = inspection.anomalies;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    // dict avec clé "anomalie" ou "item"
    const arr = toArray(raw);
    return arr;
  })();

  // Normaliser les champs personnalisés
  const champsPerso = toArray(inspection.champs_personnalises);

  // Normaliser les étapes
  const etapes = toArray(inspection.etapes);

  // Normaliser les reports
  const reports = toArray(inspection.reports);

  // Statut badge
  const statut = statutPrevention(inspection);

  // Inspecteur — peut être un label "M. Dupont" ou un ID "*12345 - Dupont"
  const inspecteur = (() => {
    const raw = inspection.inspecteur || inspection.inspecteur_nom || inspection.inspection_realisee_par || '';
    // Nettoyer "*12345 - Nom Prenom" → "Nom Prenom"
    return raw.replace(/^\*?\d+\s*-\s*/, '').trim() || raw;
  })();

  // Extraire des champs supplémentaires depuis pfm_record si disponibles
  const pfm = inspection.pfm_record || {};
  const pfmType = pfm.type_prev || pfm.id_type_prev || inspection.type_inspection || '';
  const pfmNumero = pfm.numero || pfm.id || pfm.code || inspection.external_id || inspection.premligne_id || '';
  const pfmDateReport = inspection.reports?.[0]?.date || '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <Button variant="outline" onClick={onBack} style={{ fontSize: '13px' }}>
            ← Retour à l'historique
          </Button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0, marginBottom: '4px', color: '#111827' }}>
              Rapport de prévention
            </h2>
            <p style={{ margin: 0, color: '#4b5563', fontSize: '14px', fontWeight: '500' }}>
              {batiment?.nom_etablissement || batiment?.adresse_civique || ''}
              {batiment?.ville ? ` — ${batiment.ville}` : ''}
            </p>
            <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: '13px' }}>
              {formatDate(inspection.date_inspection)}
              {pfmNumero ? ` · #${pfmNumero}` : ''}
            </p>
          </div>
          <span style={{
            padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
            backgroundColor: statut.bg, color: statut.color, whiteSpace: 'nowrap', flexShrink: 0
          }}>
            {statut.label}
          </span>
        </div>
      </div>

      {/* ── Contenu ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0' }}>

          {/* Informations générales */}
          <section style={{ marginBottom: '24px' }}>
            <SectionHeader icon={FileText} title="Informations générales" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {pfmType && <InfoField label="Type de prévention" value={pfmType} />}
              <InfoField label="Date d'inspection" value={formatDate(inspection.date_inspection)} />
              {inspection.date_completee && (
                <InfoField label="Date complétée" value={formatDate(inspection.date_completee)} />
              )}
              {inspecteur && <InfoField label="Réalisée par" value={inspecteur} />}
              {(inspection.resultat || inspection.statut || inspection.status) && (
                <InfoField label="Résultat / Statut" value={inspection.resultat || inspection.statut || inspection.status} />
              )}
              {pfm.id_dossier_adresse && (
                <InfoField label="Dossier adresse (PFM)" value={pfm.id_dossier_adresse} />
              )}
            </div>
          </section>

          {/* Notes / Narratif */}
          {(inspection.notes || pfm.narratif) && (
            <CollapsibleSection icon={FileText} title="Notes / Narratif">
              <div style={{
                padding: '14px', backgroundColor: 'white', borderRadius: '8px',
                border: '1px solid #e5e7eb', fontSize: '14px', color: '#374151',
                whiteSpace: 'pre-wrap', lineHeight: '1.6'
              }}>
                {inspection.notes || pfm.narratif}
              </div>
            </CollapsibleSection>
          )}

          {/* Avis émis */}
          {(inspection.avis_emis !== null && inspection.avis_emis !== undefined) && (
            <section style={{ marginBottom: '24px' }}>
              <SectionHeader icon={AlertTriangle} title="Avis" />
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: inspection.avis_emis ? '#fef3c7' : '#f0fdf4',
                border: `1px solid ${inspection.avis_emis ? '#fbbf24' : '#86efac'}`,
                display: 'flex', flexDirection: 'column', gap: '8px'
              }}>
                <div style={{ fontWeight: '700', fontSize: '14px', color: inspection.avis_emis ? '#92400e' : '#16a34a' }}>
                  {inspection.avis_emis ? '⚠️ Avis émis' : '✓ Aucun avis émis'}
                </div>
                {inspection.texte_avis && (
                  <div style={{ fontSize: '13px', color: '#374151', whiteSpace: 'pre-wrap' }}>
                    {inspection.texte_avis}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <CollapsibleSection
              icon={AlertTriangle}
              title="Anomalies"
              count={anomalies.length}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Résumé résolution */}
                {anomalies.length > 1 && (
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '4px' }}>
                    {[
                      { label: 'Non résolues', color: '#dc2626', count: anomalies.filter(a => {
                        const s = anomalieStatut(a).label;
                        return s === 'Non résolu';
                      }).length },
                      { label: 'En cours', color: '#d97706', count: anomalies.filter(a => anomalieStatut(a).label === 'En cours').length },
                      { label: 'Résolues', color: '#16a34a', count: anomalies.filter(a => anomalieStatut(a).label === 'Résolu').length },
                    ].filter(x => x.count > 0).map(x => (
                      <span key={x.label} style={{ fontSize: '12px', fontWeight: '700', color: x.color }}>
                        {x.count} {x.label}
                      </span>
                    ))}
                  </div>
                )}

                {anomalies.map((anomalie, idx) => {
                  const s = anomalieStatut(anomalie);
                  const desc = anomalie.description || anomalie.libelle || anomalie.nom || anomalie.texte || (typeof anomalie === 'string' ? anomalie : JSON.stringify(anomalie));
                  return (
                    <div key={idx} style={{
                      border: `1px solid ${s.color}40`,
                      borderLeft: `4px solid ${s.color}`,
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      overflow: 'hidden'
                    }}>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
                              {desc}
                            </div>
                            {(anomalie.commentaire || anomalie.notes || anomalie.observation) && (
                              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                                {anomalie.commentaire || anomalie.notes || anomalie.observation}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
                              {(anomalie.date_anomalie || anomalie.date) && (
                                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                                  Signalée : {formatDateShort(anomalie.date_anomalie || anomalie.date)}
                                </span>
                              )}
                              {anomalie.date_resolution && (
                                <span style={{ fontSize: '12px', color: '#16a34a' }}>
                                  Résolue : {formatDateShort(anomalie.date_resolution)}
                                </span>
                              )}
                              {anomalie.type && (
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>Type : {anomalie.type}</span>
                              )}
                            </div>
                          </div>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                            backgroundColor: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0
                          }}>
                            {s.icon} {s.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Champs personnalisés */}
          {champsPerso.length > 0 && (
            <CollapsibleSection icon={Tag} title="Champs personnalisés" count={champsPerso.length} defaultOpen={false}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {champsPerso.map((champ, idx) => {
                  const label = champ.libelle || champ.nom || champ.label || champ.code || `Champ ${idx + 1}`;
                  const value = champ.valeur || champ.value || champ.val || '';
                  return <InfoField key={idx} label={label} value={String(value)} />;
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Étapes */}
          {etapes.length > 0 && (
            <CollapsibleSection icon={List} title="Étapes" count={etapes.length} defaultOpen={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {etapes.map((etape, idx) => (
                  <div key={idx} style={{
                    padding: '12px 14px', backgroundColor: 'white',
                    border: '1px solid #e5e7eb', borderRadius: '8px',
                    display: 'flex', alignItems: 'flex-start', gap: '12px'
                  }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: '700', color: '#6b7280', flexShrink: 0
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                        {etape.description || etape.libelle || etape.nom || etape.action || JSON.stringify(etape)}
                      </div>
                      {etape.date && (
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                          {formatDateShort(etape.date)}
                        </div>
                      )}
                      {etape.statut && (
                        <span style={{ fontSize: '11px', color: '#6b7280' }}>{etape.statut}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Reports */}
          {reports.length > 0 && (
            <CollapsibleSection icon={Calendar} title="Reports" count={reports.length} defaultOpen={false}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reports.map((report, idx) => (
                  <div key={idx} style={{
                    padding: '10px 14px', backgroundColor: 'white',
                    border: '1px solid #e5e7eb', borderRadius: '8px',
                    fontSize: '13px', color: '#374151'
                  }}>
                    {report.date && <span style={{ fontWeight: '600' }}>{formatDateShort(report.date)} — </span>}
                    {report.description || report.motif || report.raison || JSON.stringify(report)}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Données brutes PFM (pour débogage, masquées par défaut) */}
          <section style={{ marginBottom: '8px' }}>
            <button
              onClick={() => setShowRaw(!showRaw)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px',
                padding: '8px 14px', cursor: 'pointer', fontSize: '12px', color: '#9ca3af',
                width: '100%', justifyContent: 'center'
              }}
            >
              {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showRaw ? 'Masquer les données brutes PFM' : 'Voir toutes les données brutes PFM'}
            </button>
            {showRaw && (
              <div style={{
                marginTop: '10px', padding: '14px',
                backgroundColor: '#1e293b', borderRadius: '8px',
                maxHeight: '400px', overflow: 'auto'
              }}>
                <pre style={{ fontSize: '11px', color: '#94a3b8', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(pfm, null, 2)}
                </pre>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};

export default InspectionDetailView;
