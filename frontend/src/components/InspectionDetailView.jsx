import React, { useState } from 'react';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, AlertTriangle, FileText, Tag, List, Calendar } from 'lucide-react';

// ─── Utilitaires ────────────────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
};

const formatDateShort = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return dateStr; }
};

/** Nettoie les noms PFM : retire * et (123) */
const cleanName = (s) => {
  if (!s) return '';
  return s
    .replace(/\*/g, '')          // retire les astérisques
    .replace(/\(\d+\)\s*$/,'')   // retire "(411)" en fin
    .replace(/\s+/g, ' ')
    .trim();
};

/** Nettoie un label d'anomalie PFM : "*P- Propane" → "Propane" */
const cleanAnomalieLabel = (s) => {
  if (!s) return '';
  return s
    .replace(/^\*[A-Z]+-?\s*/i, '')  // retire "*P- " ou "*A- "
    .replace(/\*/g, '')
    .trim() || s;
};

/** Convertit snake_case en label lisible : absent → Absent, acces_a_un_responsable → Acces a un responsable */
const snakeToLabel = (key) =>
  key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

/** Extrait les champs depuis n'importe quelle structure PFM :
 *  - {"champ_perso": {"absent": "Oui", ...}}  ← structure réelle PFM Transfer
 *  - {"champ_personnalise": [{id_type_champ_personnalise: "...", valeur: "..."}]}
 *  - [{id_type_champ_personnalise: "...", valeur: "..."}]
 */
const extractChamps = (raw) => {
  if (!raw) return [];

  // Structure réelle PFM Transfer : {"champ_perso": {"absent": "Oui", ...}}
  const flatDict = raw.champ_perso || raw.champs_perso;
  if (flatDict && typeof flatDict === 'object' && !Array.isArray(flatDict)) {
    return Object.entries(flatDict).map(([key, value]) => ({
      id_type_champ_personnalise: snakeToLabel(key),
      valeur: value,
    }));
  }

  // Structure tableau : [{id_type_champ_personnalise: "...", valeur: "..."}]
  if (Array.isArray(raw)) return raw;

  // Structure dict avec clé tableau : {"champ_personnalise": [...]}
  const arr = toArray(raw);
  return arr;
};

/** Résolution d'une anomalie PFM Transfer : utilise le champ `corrige` */
const getAnomalieStatut = (anomalie) => {
  const corrige = (anomalie.corrige || '').toLowerCase();
  const reinspection = (anomalie.reinspection || '').toLowerCase();
  if (corrige === 'oui' || corrige === 'true' || corrige === '1') {
    return { label: 'Résolu', color: '#16a34a', bg: '#dcfce7', icon: '✓' };
  }
  if (reinspection === 'oui') {
    return { label: 'Réinspection requise', color: '#d97706', bg: '#fef3c7', icon: '↻' };
  }
  return { label: 'Non résolu', color: '#dc2626', bg: '#fee2e2', icon: '!' };
};

const getStatutPrevention = (insp) => {
  const s = (insp.statut || insp.status || insp.resultat || '').toLowerCase();
  if (s === 'valide' || s === 'validé' || s.includes('complet')) return { label: 'Complétée', color: '#16a34a', bg: '#dcfce7' };
  if (s === 'brouillon') return { label: 'Brouillon', color: '#6b7280', bg: '#f3f4f6' };
  if (s === 'absent') return { label: 'Absent', color: '#f97316', bg: '#ffedd5' };
  if (s) return { label: s, color: '#6b7280', bg: '#f3f4f6' };
  return { label: 'Importée', color: '#2563eb', bg: '#eff6ff' };
};

// ─── Composants UI ──────────────────────────────────────────────────────────

const InfoField = ({ label, value }) => (
  <div style={{
    padding: '10px 14px', backgroundColor: 'white',
    border: '1px solid #e5e7eb', borderRadius: '8px'
  }}>
    <div style={{
      fontSize: '11px', fontWeight: '700', color: '#9ca3af',
      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px'
    }}>
      {label}
    </div>
    <div style={{ fontSize: '14px', color: '#111827', fontWeight: '500', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {value || '—'}
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, count }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: '8px',
    fontSize: '15px', fontWeight: '700', color: '#1f2937',
    marginBottom: '14px', paddingBottom: '10px',
    borderBottom: '2px solid #e5e7eb'
  }}>
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

// ─── Champs personnalisés (tableau PFM) ─────────────────────────────────────

const isNumericId = (s) => /^\d{6,}$/.test(String(s || '').trim());

const ValeurBadge = ({ value }) => {
  const v = String(value || '').trim();
  if (!v || v === '—') return <span style={{ color: '#9ca3af' }}>—</span>;
  if (v.toLowerCase() === 'oui') return (
    <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#16a34a' }}>Oui</span>
  );
  if (v.toLowerCase() === 'non') return (
    <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700', backgroundColor: '#fee2e2', color: '#dc2626' }}>Non</span>
  );
  return <span style={{ fontSize: '13px', color: '#111827' }}>{v}</span>;
};

const ChampsPersonnalisesSection = ({ champsPerso }) => {
  const [showEmpty, setShowEmpty] = useState(false);

  const withValue = champsPerso.filter(c => {
    const v = String(c.valeur || c.value || c.val || '').trim();
    return v !== '' && v !== '—';
  });
  const empty = champsPerso.filter(c => {
    const v = String(c.valeur || c.value || c.val || '').trim();
    return v === '' || v === '—';
  });

  const displayed = showEmpty ? champsPerso : withValue;

  return (
    <CollapsibleSection icon={Tag} title="Champs personnalisés" count={champsPerso.length} defaultOpen={true}>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
        {/* En-tête */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 180px',
          backgroundColor: '#f8fafc', padding: '8px 16px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type de champ</span>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Valeur</span>
        </div>

        {/* Lignes */}
        {displayed.map((champ, idx) => {
          const label = champ.id_type_champ_personnalise || champ.libelle || champ.nom || champ.label || champ.code || `Champ ${idx + 1}`;
          const value = champ.valeur || champ.value || champ.val;
          const isEmpty = !value || String(value).trim() === '';
          return (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: '1fr 180px',
              padding: '10px 16px', alignItems: 'center',
              borderBottom: idx < displayed.length - 1 ? '1px solid #f1f5f9' : 'none',
              backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa'
            }}>
              <span style={{ fontSize: '13px', fontWeight: '500', color: isEmpty ? '#9ca3af' : '#374151' }}>
                {label}
              </span>
              <div style={{ textAlign: 'right' }}>
                <ValeurBadge value={isEmpty ? '—' : value} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Toggle afficher vides */}
      {empty.length > 0 && (
        <button
          onClick={() => setShowEmpty(!showEmpty)}
          style={{
            marginTop: '8px', width: '100%', padding: '8px',
            background: 'none', border: '1px dashed #d1d5db', borderRadius: '8px',
            fontSize: '12px', color: '#9ca3af', cursor: 'pointer'
          }}
        >
          {showEmpty
            ? `Masquer les ${empty.length} champs vides`
            : `Afficher les ${empty.length} champs vides`}
        </button>
      )}
    </CollapsibleSection>
  );
};

// ─── Étapes (liste_etape PFM) ────────────────────────────────────────────────

const statutEtapeStyle = (statut) => {
  const s = (statut || '').toLowerCase();
  if (isNumericId(statut)) return { label: '—', color: '#9ca3af', bg: '#f3f4f6' };
  if (s.includes('complet') || s === 'complété') return { label: statut, color: '#16a34a', bg: '#dcfce7' };
  if (s.includes('cours')) return { label: statut, color: '#d97706', bg: '#fef3c7' };
  if (s.includes('annul') || s.includes('refus')) return { label: statut, color: '#dc2626', bg: '#fee2e2' };
  return { label: statut, color: '#6b7280', bg: '#f3f4f6' };
};

const EtapesSection = ({ etapes }) => (
  <CollapsibleSection icon={List} title="Étapes" count={etapes.length} defaultOpen={false}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {etapes.map((etape, idx) => {
        const date = etape.date_note || etape.date || '';
        const employe = cleanName(etape.employe || etape.id_employe || etape.nom_employe || '');
        const typeNote = isNumericId(etape.type_note) ? null : (etape.type_note || '');
        const operation = isNumericId(etape.operation) ? null : (etape.operation || '');
        const statutInfo = statutEtapeStyle(etape.statut);
        const mobile = etape.mobile || '';
        const dejaLu = etape.deja_lu;

        return (
          <div key={idx} style={{
            backgroundColor: 'white', border: '1px solid #e5e7eb',
            borderRadius: '8px', padding: '12px 16px',
            display: 'grid', gridTemplateColumns: 'auto 1fr auto',
            gap: '12px', alignItems: 'start'
          }}>
            {/* Numéro */}
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%',
              backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px', fontWeight: '700',
              color: '#6b7280', flexShrink: 0, marginTop: '2px'
            }}>
              {idx + 1}
            </div>

            {/* Contenu */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {operation && (
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#111827' }}>{operation}</span>
                )}
                {typeNote && (
                  <span style={{
                    fontSize: '11px', fontWeight: '600', padding: '2px 8px',
                    borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb'
                  }}>{typeNote}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {date && (
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    📅 {formatDate(date)}
                  </span>
                )}
                {employe && (
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>
                    👤 {employe}
                  </span>
                )}
                {mobile && (
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                    📱 {mobile}
                  </span>
                )}
                {dejaLu !== undefined && dejaLu !== null && !isNumericId(String(dejaLu)) && (
                  <span style={{ fontSize: '12px', color: dejaLu === 'Oui' || dejaLu === true ? '#16a34a' : '#9ca3af' }}>
                    {dejaLu === 'Oui' || dejaLu === true ? '✓ Lu' : '○ Non lu'}
                  </span>
                )}
              </div>
            </div>

            {/* Statut */}
            {statutInfo.label && statutInfo.label !== '—' && (
              <span style={{
                padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                backgroundColor: statutInfo.bg, color: statutInfo.color, whiteSpace: 'nowrap'
              }}>
                {statutInfo.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  </CollapsibleSection>
);

// ─── Composant principal ─────────────────────────────────────────────────────

const InspectionDetailView = ({ inspection, batiment, onBack }) => {
  const [showRaw, setShowRaw] = useState(false);

  const pfm = inspection.pfm_record || {};

  // Anomalies — structure PFM: liste_anomalie → { anomalie: [...] }
  const anomalies = toArray(inspection.anomalies);

  // Champs personnalisés — structure réelle PFM: {"champ_perso": {"absent": "Oui", ...}}
  const champsPerso = extractChamps(inspection.champs_personnalises);

  // Étapes
  const etapes = toArray(inspection.etapes);

  // Reports
  const reports = toArray(inspection.reports);

  // Inspecteur nettoyé
  const inspecteur = cleanName(
    inspection.inspecteur || inspection.inspecteur_nom ||
    inspection.inspection_realisee_par || pfm.id_auteur || ''
  );

  // Type nettoyé
  const typeInspection = cleanName(
    inspection.type_inspection || pfm.type_prev || pfm.id_type_prev || ''
  );

  // Numéro PFM
  const pfmNumero = inspection.external_id || inspection.premligne_id || pfm.numero || '';

  // Statut badge
  const statut = getStatutPrevention(inspection);

  // Résumé anomalies
  const anomaliesNonResolues = anomalies.filter(a => getAnomalieStatut(a).label !== 'Résolu').length;
  const anomaliesResolues = anomalies.filter(a => getAnomalieStatut(a).label === 'Résolu').length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 0,  /* clé pour que flex scroll fonctionne */
      backgroundColor: '#f9fafb'
    }}>

      {/* ── Header fixe ── */}
      <div style={{
        flexShrink: 0,
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <Button variant="outline" onClick={onBack} style={{ fontSize: '13px', marginBottom: '12px' }}>
          ← Retour à l'historique
        </Button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', margin: '0 0 4px', color: '#111827' }}>
              Rapport de prévention
            </h2>
            <p style={{ margin: '0 0 2px', color: '#4b5563', fontSize: '14px', fontWeight: '500' }}>
              {batiment?.nom_etablissement || batiment?.adresse_civique || ''}
              {batiment?.ville ? ` — ${batiment.ville}` : ''}
            </p>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '13px' }}>
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

      {/* ── Corps scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', minHeight: 0 }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>

          {/* Informations générales */}
          <section style={{ marginBottom: '24px' }}>
            <SectionTitle icon={FileText} title="Informations générales" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {typeInspection && <InfoField label="Type de prévention" value={typeInspection} />}
              <InfoField label="Date d'inspection" value={formatDate(inspection.date_inspection)} />
              {inspection.date_completee && (
                <InfoField label="Date complétée" value={formatDate(inspection.date_completee)} />
              )}
              {inspecteur && <InfoField label="Réalisée par" value={inspecteur} />}
              {(inspection.resultat || pfm.statut) && (
                <InfoField label="Résultat" value={cleanName(inspection.resultat || pfm.statut)} />
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

          {/* Avis */}
          {(inspection.avis_emis === true || inspection.avis_emis === false || inspection.texte_avis) && (
            <section style={{ marginBottom: '24px' }}>
              <SectionTitle icon={AlertTriangle} title="Avis" />
              <div style={{
                padding: '14px 16px', borderRadius: '8px',
                backgroundColor: inspection.avis_emis ? '#fef3c7' : '#f0fdf4',
                border: `1px solid ${inspection.avis_emis ? '#fbbf24' : '#86efac'}`
              }}>
                <div style={{ fontWeight: '700', fontSize: '14px', color: inspection.avis_emis ? '#92400e' : '#16a34a', marginBottom: inspection.texte_avis ? '8px' : 0 }}>
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
              defaultOpen={true}
            >
              {/* Résumé */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {anomaliesNonResolues > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>
                    ● {anomaliesNonResolues} non résolu{anomaliesNonResolues > 1 ? 'es' : 'e'}
                  </span>
                )}
                {anomaliesResolues > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>
                    ● {anomaliesResolues} résolu{anomaliesResolues > 1 ? 'es' : 'e'}
                  </span>
                )}
                {anomalies.filter(a => getAnomalieStatut(a).label === 'Réinspection requise').length > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#d97706' }}>
                    ● {anomalies.filter(a => getAnomalieStatut(a).label === 'Réinspection requise').length} réinspection requise
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {anomalies.map((anomalie, idx) => {
                  const s = getAnomalieStatut(anomalie);
                  // Description : id_type_anomalie ou libelle ou description
                  const description = cleanAnomalieLabel(
                    anomalie.id_type_anomalie || anomalie.description ||
                    anomalie.libelle || anomalie.nom || anomalie.texte ||
                    (typeof anomalie === 'string' ? anomalie : '')
                  );
                  const dateCorrige = anomalie.date_corrige || anomalie.date_resolution;
                  const delai = parseInt(anomalie.delai_nbr_jour) || 0;

                  return (
                    <div key={idx} style={{
                      borderRadius: '8px', backgroundColor: 'white',
                      border: `1px solid ${s.color}30`,
                      borderLeft: `4px solid ${s.color}`,
                      overflow: 'hidden'
                    }}>
                      <div style={{ padding: '14px 16px' }}>
                        {/* En-tête anomalie */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', flex: 1 }}>
                            {description || `Anomalie ${idx + 1}`}
                          </div>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '700',
                            backgroundColor: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0
                          }}>
                            {s.icon} {s.label}
                          </span>
                        </div>

                        {/* Détails */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                          {/* Corrigé */}
                          <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Corrigé</div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: s.color }}>
                              {anomalie.corrige === 'Oui' ? '✓ Oui' : anomalie.corrige === 'Non' ? '✗ Non' : anomalie.corrige || '—'}
                            </div>
                          </div>

                          {/* Réinspection */}
                          <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Réinspection</div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: anomalie.reinspection === 'Oui' ? '#d97706' : '#6b7280' }}>
                              {anomalie.reinspection || '—'}
                            </div>
                          </div>

                          {/* Délai */}
                          {delai > 0 && (
                            <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                              <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Délai</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                                {delai} jour{delai > 1 ? 's' : ''}
                              </div>
                            </div>
                          )}

                          {/* Date correction */}
                          {dateCorrige && (
                            <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                              <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Date correction</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                                {formatDateShort(dateCorrige)}
                              </div>
                            </div>
                          )}

                          {/* Compteur réinspection */}
                          {anomalie.cmpt_reinspect_lors_ajout && parseInt(anomalie.cmpt_reinspect_lors_ajout) > 0 && (
                            <div style={{ backgroundColor: '#f8fafc', borderRadius: '6px', padding: '8px 10px' }}>
                              <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginBottom: '3px' }}>Nb réinspections</div>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
                                {anomalie.cmpt_reinspect_lors_ajout}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Commentaire */}
                        {(anomalie.commentaire || anomalie.notes || anomalie.observation) && (
                          <div style={{ marginTop: '10px', padding: '8px 10px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '13px', color: '#4b5563' }}>
                            {anomalie.commentaire || anomalie.notes || anomalie.observation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>
          )}

          {/* Champs personnalisés */}
          {champsPerso.length > 0 && (
            <ChampsPersonnalisesSection champsPerso={champsPerso} />
          )}

          {/* Étapes */}
          {etapes.length > 0 && (
            <EtapesSection etapes={etapes} />
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
                    {report.description || report.motif || report.raison || ''}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Données brutes PFM */}
          <section style={{ marginBottom: '24px' }}>
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
              {showRaw ? 'Masquer les données brutes PFM' : 'Voir les données brutes PFM Transfer'}
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
