import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Siren, ExternalLink } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const HistoriqueInterventionsBatiment = ({ tenantSlug, batimentId }) => {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const getToken = () => localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');

  useEffect(() => {
    const fetchHistorique = async () => {
      if (!batimentId) return;
      setLoading(true);
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/${tenantSlug}/batiments/${batimentId}/interventions-historique?limit=50`,
          { headers: { 'Authorization': `Bearer ${getToken()}` } }
        );
        if (response.ok) {
          const data = await response.json();
          setInterventions(data.interventions || []);
        }
      } catch (error) {
        console.error('Erreur chargement historique interventions:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchHistorique();
  }, [batimentId, tenantSlug]);

  if (loading) {
    return null;
  }

  if (interventions.length === 0) {
    return null;
  }

  const displayed = expanded ? interventions : interventions.slice(0, 5);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fr-CA', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card style={{ padding: '1.5rem' }} data-testid="historique-interventions-batiment">
      <h3 style={{ 
        fontSize: '1.25rem', 
        fontWeight: '600', 
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <Siren size={20} style={{ color: '#dc2626' }} />
        Interventions ({interventions.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {displayed.map(intv => (
          <div 
            key={intv.id}
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: intv.import_source === 'history_import' ? '#fffbeb' : '#f9fafb',
              borderRadius: '0.5rem',
              border: `1px solid ${intv.import_source === 'history_import' ? '#fde68a' : '#e5e7eb'}`,
            }}
            data-testid={`intervention-item-${intv.id}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                    {formatDate(intv.xml_time_call_received || intv.created_at)}
                  </p>
                  {intv.type_intervention && (
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      backgroundColor: '#e0e7ff',
                      color: '#3730a3'
                    }}>
                      {intv.type_intervention}
                    </span>
                  )}
                  {intv.import_source === 'history_import' && (
                    <span style={{
                      padding: '0.125rem 0.5rem',
                      borderRadius: '1rem',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      backgroundColor: '#fef3c7',
                      color: '#92400e'
                    }}
                    data-testid="imported-badge"
                    >
                      Importé
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {intv.address_full || '-'}
                  {intv.municipality && `, ${intv.municipality}`}
                </p>
                {intv.external_call_id && (
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                    #{intv.external_call_id}
                  </p>
                )}
              </div>
              <span style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: '600',
                backgroundColor: intv.status === 'signed' ? '#d1fae5' : '#f3f4f6',
                color: intv.status === 'signed' ? '#065f46' : '#374151'
              }}>
                {intv.status === 'signed' ? 'Signé' : intv.status}
              </span>
            </div>
            {intv.notes && (
              <p style={{ fontSize: '0.8rem', color: '#4b5563', marginTop: '0.5rem', fontStyle: 'italic' }}>
                {intv.notes.length > 120 ? intv.notes.substring(0, 120) + '...' : intv.notes}
              </p>
            )}
          </div>
        ))}
      </div>
      {interventions.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            background: 'white',
            color: '#4b5563',
            fontSize: '0.85rem',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'center'
          }}
          data-testid="toggle-interventions-list"
        >
          {expanded ? 'Voir moins' : `Voir toutes les ${interventions.length} interventions`}
        </button>
      )}
    </Card>
  );
};

export default HistoriqueInterventionsBatiment;
