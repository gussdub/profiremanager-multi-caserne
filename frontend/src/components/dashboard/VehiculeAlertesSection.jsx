/**
 * Section d'alertes maintenance véhicules pour le Dashboard
 */
import React from 'react';
import { Card, CardContent } from '../ui/card';

const getNiveauStyle = (niveau) => {
  if (niveau === 'critique') return { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' };
  if (niveau === 'urgent') return { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c' };
  return { bg: '#f8fafc', border: '#e2e8f0', color: '#1e293b' };
};

const getTypeIcon = (type) => {
  if (type?.includes('vignette')) return '📋';
  if (type?.includes('entretien')) return '🔧';
  if (type?.includes('defectuosite')) return '⚠️';
  return '🚗';
};

const VehiculeAlerteItem = ({ alerte, onNavigate }) => {
  const style = getNiveauStyle(alerte.niveau);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 12px', background: style.bg,
        border: `1px solid ${style.border}`, borderRadius: '8px', cursor: 'pointer'
      }}
      onClick={() => { if (onNavigate) onNavigate('/actifs'); }}
    >
      <span style={{ fontSize: '1.5rem' }}>{getTypeIcon(alerte.type)}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '600', fontSize: '0.9rem', color: style.color }}>
          {alerte.vehicule_nom}
          {alerte.niveau === 'critique' && (
            <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#dc2626', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>CRITIQUE</span>
          )}
          {alerte.niveau === 'urgent' && (
            <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#f97316', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>URGENT</span>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{alerte.message}</div>
      </div>
      {alerte.jours_restants !== undefined && (
        <div style={{
          fontSize: '0.8rem', fontWeight: '500', whiteSpace: 'nowrap',
          color: alerte.jours_restants < 0 ? '#dc2626' : alerte.jours_restants <= 7 ? '#ea580c' : '#64748b'
        }}>
          {alerte.jours_restants < 0 ? `${Math.abs(alerte.jours_restants)}j retard` : `${alerte.jours_restants}j`}
        </div>
      )}
    </div>
  );
};

export const VehiculeAlertesSection = ({ alertesVehicules, isVisible, onNavigate }) => {
  if (!isVisible || alertesVehicules.count <= 0) return null;

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        🚗 Alertes Maintenance Véhicules
        {alertesVehicules.critiques > 0 && (
          <span style={{ background: '#dc2626', color: 'white', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {alertesVehicules.critiques} critique(s)
          </span>
        )}
        {alertesVehicules.urgentes > 0 && (
          <span style={{ background: '#f97316', color: 'white', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
            {alertesVehicules.urgentes} urgente(s)
          </span>
        )}
      </h2>
      <Card>
        <CardContent style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
            {alertesVehicules.alertes.slice(0, 10).map((alerte, index) => (
              <VehiculeAlerteItem key={index} alerte={alerte} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VehiculeAlertesSection;
