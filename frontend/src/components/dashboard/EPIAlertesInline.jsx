/**
 * Alerte EPI inline pour la section personnelle du Dashboard
 */
import React from 'react';
import { Card, CardContent } from '../ui/card';

export const EPIAlertesInline = ({ alertes, formatDate }) => {
  if (!alertes || alertes.length === 0) return null;

  return (
    <Card style={{ marginTop: '1rem', borderLeft: '4px solid #f59e0b' }}>
      <CardContent style={{ padding: '1rem' }}>
        <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
          ⚠️ EPI nécessitant attention ({alertes.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {alertes.map((epi, idx) => (
            <span key={idx} style={{
              background: '#fef3c7', color: '#92400e',
              padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.8rem'
            }}>
              {epi.type || epi.nom} - Exp. {formatDate(epi.date_expiration || epi.date_fin_vie)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default EPIAlertesInline;
