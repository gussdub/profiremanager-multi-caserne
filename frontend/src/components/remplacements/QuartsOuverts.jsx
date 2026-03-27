/**
 * Composant Quarts Ouverts pour le module Remplacements
 * Affiche les quarts disponibles (après échec de l'algorithme) que n'importe qui peut prendre
 */

import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const QuartsOuverts = ({
  quarts,
  getTypeGardeName,
  parseDateLocal,
  onPrendreQuart,
  currentUserId
}) => {
  const [loadingId, setLoadingId] = useState(null);

  if (!quarts || quarts.length === 0) {
    return null;
  }

  const handlePrendre = async (quartId) => {
    setLoadingId(quartId);
    try {
      await onPrendreQuart(quartId);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div data-testid="quarts-ouverts-section">
      <div style={{
        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ color: '#92400e', margin: 0, marginBottom: '0.5rem' }}>
          Quarts disponibles
        </h3>
        <p style={{ color: '#a16207', margin: 0, fontSize: '0.9rem' }}>
          Ces quarts n'ont pas trouvé preneur via le processus automatique. 
          N'importe quel employé peut se porter volontaire.
        </p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {quarts.map(quart => {
          const isOwnRequest = quart.demandeur_id === currentUserId;
          const dateFormatted = parseDateLocal(quart.date).toLocaleDateString('fr-FR', { 
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
          });
          const typeGardeNom = quart.type_garde_nom || getTypeGardeName(quart.type_garde_id);
          const horaire = quart.type_garde_heure_debut && quart.type_garde_heure_fin
            ? `${quart.type_garde_heure_debut} - ${quart.type_garde_heure_fin}`
            : null;

          return (
            <Card key={quart.id} data-testid={`quart-ouvert-${quart.id}`} style={{ 
              border: '2px solid #f59e0b',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
            }}>
              <CardContent style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h4 style={{ margin: 0, marginBottom: '0.5rem', color: '#1e3a5f', fontSize: '1.1rem' }}>
                      {typeGardeNom}
                    </h4>
                    <p style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.05rem', fontWeight: 'bold' }}>
                      {dateFormatted}
                    </p>
                    {horaire && (
                      <p style={{ margin: 0, marginBottom: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                        Horaire : {horaire}
                      </p>
                    )}
                    <p style={{ margin: 0, marginBottom: '0.5rem', color: '#666' }}>
                      Demandeur : <strong>{quart.demandeur_nom || 'Inconnu'}</strong>
                    </p>
                    {quart.raison && (
                      <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                        Raison : {quart.raison}
                      </p>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '220px' }}>
                    {isOwnRequest ? (
                      <div style={{ 
                        padding: '0.75rem 1.5rem', 
                        backgroundColor: '#f3f4f6', 
                        borderRadius: '8px',
                        color: '#6b7280',
                        textAlign: 'center',
                        fontSize: '0.9rem'
                      }}>
                        Votre demande — en attente d'un volontaire
                      </div>
                    ) : (
                      <Button 
                        style={{ 
                          backgroundColor: '#f59e0b', 
                          color: 'white',
                          padding: '1rem 2rem',
                          fontSize: '1rem',
                          fontWeight: '600'
                        }}
                        disabled={loadingId === quart.id}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePrendre(quart.id);
                        }}
                        data-testid={`prendre-quart-${quart.id}`}
                      >
                        {loadingId === quart.id ? 'En cours...' : 'Je prends ce quart'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default QuartsOuverts;
