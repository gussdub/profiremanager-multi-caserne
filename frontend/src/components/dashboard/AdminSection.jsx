/**
 * Section admin du Dashboard : KPIs + Personnes absentes
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ActivitesRecentesCard } from './ActivitesRecentes';

const KPICard = ({ value, label, icon, gradient }) => (
  <Card style={{ background: gradient }}>
    <CardContent style={{ padding: '1.25rem', color: 'white' }}>
      <div style={{ fontSize: '2rem', fontWeight: '700' }}>{value}</div>
      <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{icon} {label}</div>
    </CardContent>
  </Card>
);

export const AdminKPIGrid = ({ stats, tauxCouverture, personnesAbsentes }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
    <KPICard value={stats.personnel} label="Personnel actif" icon="👥" gradient="linear-gradient(135deg, #3b82f6, #1d4ed8)" />
    <KPICard value={`${tauxCouverture}%`} label="Couverture planning" icon="📅" gradient="linear-gradient(135deg, #10b981, #059669)" />
    <KPICard value={personnesAbsentes.length} label="Absents" icon="🏥" gradient="linear-gradient(135deg, #f59e0b, #d97706)" />
    <KPICard value={stats.vehicules} label="Véhicules" icon="🚒" gradient="linear-gradient(135deg, #8b5cf6, #7c3aed)" />
  </div>
);

export const PersonnesAbsentesCard = ({ absences, formatDate }) => (
  <Card>
    <CardHeader>
      <CardTitle style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>🏥 Personnes absentes</span>
        {absences.length > 0 && (
          <span style={{ background: '#fef3c7', color: '#d97706', padding: '0.25rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' }}>
            {absences.length}
          </span>
        )}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {absences.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {absences.map((absence, idx) => (
            <div key={idx} style={{
              padding: '0.75rem', background: '#fefce8', borderRadius: '8px',
              borderLeft: `3px solid ${absence.type_conge === 'maladie' ? '#ef4444' : '#f59e0b'}`
            }}>
              <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                {absence.user_nom || absence.nom_employe || 'Employé'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {formatDate(absence.date_debut)} → {formatDate(absence.date_fin)}
              </div>
              <div style={{
                fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: '500',
                color: absence.type_conge === 'maladie' ? '#dc2626' : '#d97706'
              }}>
                {absence.type_conge === 'maladie' ? '🤒 Maladie' :
                 absence.type_conge === 'vacances' ? '🌴 Vacances' :
                 absence.type_conge || absence.motif || 'Congé'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
          Tout le monde est présent
        </div>
      )}
    </CardContent>
  </Card>
);

export const AdminSection = ({ statsGenerales, tauxCouverture, personnesAbsentes, activitesRecentes, formatDate }) => (
  <div>
    <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#374151', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      🏢 Vue Générale du Service
    </h2>
    <AdminKPIGrid stats={statsGenerales} tauxCouverture={tauxCouverture} personnesAbsentes={personnesAbsentes} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1rem' }}>
      <PersonnesAbsentesCard absences={personnesAbsentes} formatDate={formatDate} />
      <ActivitesRecentesCard activites={activitesRecentes} maxItems={5} />
    </div>
  </div>
);

export default AdminSection;
