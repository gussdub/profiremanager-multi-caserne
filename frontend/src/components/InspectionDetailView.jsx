import React from 'react';
import { Button } from './ui/button';

const InspectionDetailView = ({ inspection, batiment, onBack }) => {
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatutLabel = (statut) => {
    const labels = {
      'valide': { label: '✅ Validée', color: '#22c55e', bg: '#dcfce7' },
      'brouillon': { label: '📝 Brouillon', color: '#6b7280', bg: '#f3f4f6' },
      'absent': { label: '🟠 Absent', color: '#f97316', bg: '#ffedd5' },
      'non_disponible': { label: '🟠 Non disponible', color: '#f97316', bg: '#ffedd5' },
      'personne_mineure': { label: '🟠 Personne mineure', color: '#f97316', bg: '#ffedd5' },
    };
    return labels[statut] || { label: statut, color: '#6b7280', bg: '#f3f4f6' };
  };

  const statutInfo = getStatutLabel(inspection.statut);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Button variant="outline" onClick={onBack}>
            ← Retour à l'historique
          </Button>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, marginBottom: '0.5rem' }}>
              📋 Rapport d'inspection
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
              {batiment.nom_etablissement || batiment.adresse_civique}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              📅 {formatDate(inspection.date_inspection)}
            </p>
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            backgroundColor: statutInfo.bg,
            color: statutInfo.color,
            fontSize: '1rem',
            fontWeight: '600'
          }}>
            {statutInfo.label}
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Informations générales */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              ℹ️ Informations générales
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem'
            }}>
              <InfoField label="Date d'inspection" value={formatDate(inspection.date_inspection)} />
              <InfoField label="Statut" value={statutInfo.label} />
              {inspection.preventionniste_id && (
                <InfoField label="Préventionniste" value="Assigné" />
              )}
            </div>
          </section>

          {/* Observations */}
          {inspection.observations && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                📝 Observations
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap'
              }}>
                {inspection.observations}
              </div>
            </section>
          )}

          {/* Grille d'inspection (si disponible) */}
          {inspection.grille_data && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                ✓ Éléments inspectés
              </h3>
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                {/* Affichage de la grille d'inspection si disponible */}
                <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                  Détails de la grille d'inspection
                </div>
              </div>
            </section>
          )}

          {/* Informations supplémentaires */}
          <section>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              📌 Détails supplémentaires
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem'
            }}>
              <InfoField 
                label="ID Inspection" 
                value={inspection.id?.substring(0, 8) + '...'} 
              />
              <InfoField 
                label="ID Bâtiment" 
                value={batiment.id?.substring(0, 8) + '...'} 
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

// Composant helper pour afficher un champ
const InfoField = ({ label, value }) => (
  <div style={{
    padding: '0.75rem',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px'
  }}>
    <div style={{
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
      marginBottom: '0.25rem',
      letterSpacing: '0.05em'
    }}>
      {label}
    </div>
    <div style={{
      fontSize: '0.875rem',
      color: '#111827',
      fontWeight: '500'
    }}>
      {value || '—'}
    </div>
  </div>
);

export default InspectionDetailView;
