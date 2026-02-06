/**
 * Carte des formations à venir pour le Dashboard
 */
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const FormationsAVenirCard = ({ formations, formatDate }) => (
  <Card>
    <CardHeader style={{ paddingBottom: '0.5rem' }}>
      <CardTitle style={{ fontSize: '0.9rem', color: '#6b7280' }}>
        📚 Mes formations à venir
      </CardTitle>
    </CardHeader>
    <CardContent>
      {formations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {formations.map((f, idx) => (
            <div key={idx} style={{ fontSize: '0.85rem', padding: '0.5rem', background: '#f1f5f9', borderRadius: '6px' }}>
              <div style={{ fontWeight: '500' }}>{f.titre || f.nom}</div>
              <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                {formatDate(f.date_debut || f.date)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>Aucune formation inscrite</div>
      )}
    </CardContent>
  </Card>
);

export default FormationsAVenirCard;
