/**
 * Composant Propositions Reçues pour le module Remplacements
 * Affiche les demandes de remplacement pour lesquelles l'utilisateur est sollicité
 */

import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const PropositionsRecues = ({
  propositions,
  getTypeGardeName,
  getUserName,
  parseDateLocal,
  onAccept,
  onRefuse
}) => {
  if (!propositions || propositions.length === 0) {
    return null;
  }

  return (
    <div className="propositions-recues">
      <div style={{
        background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem'
      }}>
        <h3 style={{ color: '#166534', margin: 0, marginBottom: '0.5rem' }}>
          🚨 Demandes de remplacement pour vous
        </h3>
        <p style={{ color: '#15803d', margin: 0, fontSize: '0.9rem' }}>
          Un collègue a besoin d'être remplacé et vous avez été identifié comme disponible. 
          Répondez ci-dessous pour accepter ou refuser.
        </p>
      </div>
      
      <div className="propositions-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {propositions.map(proposition => (
          <Card key={proposition.id} style={{ 
            border: '2px solid #22c55e',
            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)'
          }}>
            <CardContent style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h4 style={{ margin: 0, marginBottom: '0.5rem', color: '#1e3a5f' }}>
                    {getTypeGardeName(proposition.type_garde_id)}
                  </h4>
                  <p style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                    📅 {parseDateLocal(proposition.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p style={{ margin: 0, marginBottom: '0.5rem', color: '#666' }}>
                    👤 Demandeur : <strong>{getUserName(proposition.demandeur_id)}</strong>
                  </p>
                  {proposition.raison && (
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                      💬 Raison : {proposition.raison}
                    </p>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '200px' }}>
                  <Button 
                    style={{ 
                      backgroundColor: '#22c55e', 
                      color: 'white',
                      padding: '1rem 2rem',
                      fontSize: '1rem'
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAccept(proposition.id);
                    }}
                    data-testid={`accept-proposition-${proposition.id}`}
                  >
                    ✅ J'accepte ce remplacement
                  </Button>
                  <Button 
                    variant="outline"
                    style={{ 
                      borderColor: '#ef4444', 
                      color: '#ef4444',
                      padding: '0.75rem 2rem'
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRefuse(proposition.id);
                    }}
                    data-testid={`refuse-proposition-${proposition.id}`}
                  >
                    ❌ Je refuse
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PropositionsRecues;
