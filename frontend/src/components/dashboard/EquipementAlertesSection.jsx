/**
 * Section d'alertes équipements pour le Dashboard
 */
import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const CompteurBadge = ({ count, label, icon, bgColor, borderColor }) => {
  if (!count || count <= 0) return null;
  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${borderColor}`,
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '0.85rem',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}>
      {icon} <strong>{count}</strong> {label}
    </div>
  );
};

const AlerteItem = ({ alerte, formatDate, onNavigate }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 12px',
      background: alerte.en_retard ? '#fef2f2' : '#f8fafc',
      border: `1px solid ${alerte.en_retard ? '#fecaca' : '#e2e8f0'}`,
      borderRadius: '8px',
      cursor: 'pointer',
      transition: 'all 0.15s ease'
    }}
    onClick={() => { if (onNavigate) onNavigate(alerte.lien); }}
    onMouseOver={(e) => { e.currentTarget.style.background = alerte.en_retard ? '#fee2e2' : '#f1f5f9'; }}
    onMouseOut={(e) => { e.currentTarget.style.background = alerte.en_retard ? '#fef2f2' : '#f8fafc'; }}
  >
    <span style={{ fontSize: '1.5rem' }}>{alerte.icone}</span>
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: '600', fontSize: '0.9rem', color: alerte.en_retard ? '#dc2626' : '#1e293b' }}>
        {alerte.titre}
        {alerte.en_retard && (
          <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
            EN RETARD
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
        {alerte.description}
        {alerte.categorie && <span style={{ marginLeft: '8px', color: '#94a3b8' }}>• {alerte.categorie}</span>}
      </div>
    </div>
    {alerte.date_echeance && (
      <div style={{ fontSize: '0.8rem', color: alerte.en_retard ? '#dc2626' : '#64748b', fontWeight: '500', whiteSpace: 'nowrap' }}>
        {formatDate(alerte.date_echeance)}
      </div>
    )}
  </div>
);

export const EquipementAlertesSection = ({ alertesEquipements, formatDate, onNavigate }) => {
  if (!alertesEquipements.actif || alertesEquipements.total <= 0) return null;

  const compteurs = alertesEquipements.compteurs || {};
  const epiTotal = (compteurs.epi_expiration || 0) + (compteurs.epi_fin_vie || 0) + (compteurs.epi_inspection_mensuelle || 0);

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        🔔 Alertes Équipements
        {alertesEquipements.en_retard > 0 && (
          <span style={{ background: '#ef4444', color: 'white', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {alertesEquipements.en_retard} en retard
          </span>
        )}
      </h2>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <CompteurBadge count={compteurs.maintenance} label="Maintenance" icon="🔧" bgColor="#fef3c7" borderColor="#f59e0b" />
        <CompteurBadge count={compteurs.inspection} label="Inspection" icon="🔍" bgColor="#dbeafe" borderColor="#3b82f6" />
        <CompteurBadge count={compteurs.fin_vie} label="Fin de vie" icon="⏰" bgColor="#fee2e2" borderColor="#ef4444" />
        <CompteurBadge count={compteurs.peremption} label="Péremption" icon="📅" bgColor="#fce7f3" borderColor="#ec4899" />
        {epiTotal > 0 && (
          <CompteurBadge count={epiTotal} label="EPI" icon="🦺" bgColor="#ecfdf5" borderColor="#10b981" />
        )}
      </div>

      <Card>
        <CardContent style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto' }}>
            {alertesEquipements.alertes.slice(0, 15).map((alerte, index) => (
              <AlerteItem key={index} alerte={alerte} formatDate={formatDate} onNavigate={onNavigate} />
            ))}
            {alertesEquipements.total > 15 && (
              <div style={{ textAlign: 'center', padding: '10px', color: '#64748b', fontSize: '0.85rem' }}>
                Et {alertesEquipements.total - 15} autres alertes...
                <Button variant="link" size="sm" onClick={() => window.location.href = '/actifs'} style={{ marginLeft: '8px' }}>
                  Voir tout →
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EquipementAlertesSection;
