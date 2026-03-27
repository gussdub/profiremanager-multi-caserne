/**
 * Composant Quarts Ouverts pour le module Remplacements
 * Affiche les quarts disponibles (après échec de l'algorithme) que n'importe qui peut prendre.
 * Supporte deux modes : automatique (premier arrivé) ou avec approbation admin.
 */

import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const QuartsOuverts = ({
  quarts,
  getTypeGardeName,
  parseDateLocal,
  onPrendreQuart,
  onApprouverQuart,
  onRefuserQuart,
  currentUserId,
  currentUserRole
}) => {
  const [loadingId, setLoadingId] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const isAdmin = ['admin', 'superviseur'].includes(currentUserRole);

  if (!quarts || quarts.length === 0) {
    return null;
  }

  const handleAction = async (id, action) => {
    setLoadingId(id);
    setLoadingAction(action);
    try {
      if (action === 'prendre') await onPrendreQuart(id);
      else if (action === 'approuver') await onApprouverQuart(id);
      else if (action === 'refuser') await onRefuserQuart(id);
    } finally {
      setLoadingId(null);
      setLoadingAction(null);
    }
  };

  const quartsOuverts = quarts.filter(q => q.statut === 'ouvert');
  const quartsAttente = quarts.filter(q => q.statut === 'en_attente_approbation');

  return (
    <div data-testid="quarts-ouverts-section">
      {/* Section Quarts Ouverts */}
      {quartsOuverts.length > 0 && (
        <>
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ color: '#92400e', margin: 0, marginBottom: '0.25rem', fontSize: '1.1rem' }}>
              Quarts disponibles ({quartsOuverts.length})
            </h3>
            <p style={{ color: '#a16207', margin: 0, fontSize: '0.9rem' }}>
              Ces quarts n'ont pas trouve preneur via le processus automatique.
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {quartsOuverts.map(quart => (
              <QuartCard
                key={quart.id}
                quart={quart}
                getTypeGardeName={getTypeGardeName}
                parseDateLocal={parseDateLocal}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                loadingId={loadingId}
                loadingAction={loadingAction}
                onAction={handleAction}
                mode="ouvert"
              />
            ))}
          </div>
        </>
      )}

      {/* Section Attente Approbation */}
      {quartsAttente.length > 0 && (
        <>
          <div style={{
            background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ color: '#5b21b6', margin: 0, marginBottom: '0.25rem', fontSize: '1.1rem' }}>
              En attente d'approbation ({quartsAttente.length})
            </h3>
            <p style={{ color: '#6d28d9', margin: 0, fontSize: '0.9rem' }}>
              {isAdmin 
                ? "Des employes se sont portes volontaires. Approuvez ou refusez leurs candidatures."
                : "Un volontaire attend l'approbation d'un superviseur."}
            </p>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {quartsAttente.map(quart => (
              <QuartCard
                key={quart.id}
                quart={quart}
                getTypeGardeName={getTypeGardeName}
                parseDateLocal={parseDateLocal}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                loadingId={loadingId}
                loadingAction={loadingAction}
                onAction={handleAction}
                mode="attente"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const QuartCard = ({
  quart,
  getTypeGardeName,
  parseDateLocal,
  currentUserId,
  isAdmin,
  loadingId,
  loadingAction,
  onAction,
  mode
}) => {
  const isOwnRequest = quart.demandeur_id === currentUserId;
  const isOwnVolunteer = quart.volontaire_id === currentUserId;
  const dateFormatted = parseDateLocal(quart.date).toLocaleDateString('fr-FR', { 
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
  });
  const typeGardeNom = quart.type_garde_nom || getTypeGardeName(quart.type_garde_id);
  const horaire = quart.type_garde_heure_debut && quart.type_garde_heure_fin
    ? `${quart.type_garde_heure_debut} - ${quart.type_garde_heure_fin}`
    : null;

  const borderColor = mode === 'attente' ? '#8b5cf6' : '#f59e0b';
  const shadowColor = mode === 'attente' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)';

  return (
    <Card data-testid={`quart-ouvert-${quart.id}`} style={{ 
      border: `2px solid ${borderColor}`,
      boxShadow: `0 4px 12px ${shadowColor}`
    }}>
      <CardContent style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <h4 style={{ margin: 0, marginBottom: '0.4rem', color: '#1e3a5f', fontSize: '1.05rem' }}>
              {typeGardeNom}
            </h4>
            <p style={{ margin: 0, marginBottom: '0.4rem', fontSize: '1rem', fontWeight: 'bold' }}>
              {dateFormatted}
            </p>
            {horaire && (
              <p style={{ margin: 0, marginBottom: '0.4rem', color: '#666', fontSize: '0.9rem' }}>
                Horaire : {horaire}
              </p>
            )}
            <p style={{ margin: 0, marginBottom: '0.3rem', color: '#666' }}>
              Demandeur : <strong>{quart.demandeur_nom || 'Inconnu'}</strong>
            </p>
            {quart.raison && (
              <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>
                Raison : {quart.raison}
              </p>
            )}
            {mode === 'attente' && quart.volontaire_nom && (
              <p style={{ margin: '0.5rem 0 0', color: '#5b21b6', fontWeight: '600', fontSize: '0.95rem' }}>
                Volontaire : {quart.volontaire_nom}
              </p>
            )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '220px' }}>
            {mode === 'ouvert' && (
              <>
                {isOwnRequest ? (
                  <StatusBadge text="Votre demande — en attente d'un volontaire" color="#f3f4f6" textColor="#6b7280" />
                ) : (
                  <Button 
                    style={{ backgroundColor: '#f59e0b', color: 'white', padding: '0.75rem 1.5rem', fontWeight: '600' }}
                    disabled={loadingId === quart.id}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction(quart.id, 'prendre'); }}
                    data-testid={`prendre-quart-${quart.id}`}
                  >
                    {loadingId === quart.id && loadingAction === 'prendre' ? 'En cours...' : 'Je prends ce quart'}
                  </Button>
                )}
              </>
            )}
            
            {mode === 'attente' && (
              <>
                {isOwnVolunteer && (
                  <StatusBadge text="Votre candidature — en attente d'approbation" color="#ede9fe" textColor="#5b21b6" />
                )}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      style={{ backgroundColor: '#10b981', color: 'white', flex: 1, fontWeight: '600' }}
                      disabled={loadingId === quart.id}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction(quart.id, 'approuver'); }}
                      data-testid={`approuver-quart-${quart.id}`}
                    >
                      {loadingId === quart.id && loadingAction === 'approuver' ? '...' : 'Approuver'}
                    </Button>
                    <Button
                      variant="outline"
                      style={{ borderColor: '#ef4444', color: '#ef4444', flex: 1, fontWeight: '600' }}
                      disabled={loadingId === quart.id}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction(quart.id, 'refuser'); }}
                      data-testid={`refuser-quart-${quart.id}`}
                    >
                      {loadingId === quart.id && loadingAction === 'refuser' ? '...' : 'Refuser'}
                    </Button>
                  </div>
                )}
                {!isAdmin && !isOwnVolunteer && (
                  <StatusBadge text="Un volontaire attend l'approbation" color="#f3f4f6" textColor="#6b7280" />
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatusBadge = ({ text, color, textColor }) => (
  <div style={{ 
    padding: '0.75rem 1.25rem', 
    backgroundColor: color, 
    borderRadius: '8px',
    color: textColor,
    textAlign: 'center',
    fontSize: '0.9rem'
  }}>
    {text}
  </div>
);

export default QuartsOuverts;
