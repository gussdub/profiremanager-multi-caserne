import React from 'react';
import { Button } from '../ui/button';
import { ClipboardList } from 'lucide-react';

const RemplacementsList = ({
  demandes,
  user,
  getTypeGardeName,
  getUserName,
  getStatutColor,
  getStatutLabel,
  parseDateLocal,
  onArreterProcessus,
  onRelancerDemande,
  onSupprimerDemande,
  onShowSuivi,
  filterStatut,
  filterPeriode
}) => {
  return (
    <div className="remplacements-content">
      <div style={{ 
        background: '#dbeafe', 
        border: '1px solid #93c5fd', 
        borderRadius: '8px', 
        padding: '0.75rem', 
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'start',
        gap: '0.5rem',
        overflow: 'hidden'
      }}>
        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💡</span>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <strong style={{ color: '#1e40af', display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
            Actions manuelles disponibles
          </strong>
          <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0, lineHeight: '1.4' }}>
            Les demandes sont traitées automatiquement. Boutons disponibles :
          </p>
          <ul style={{ fontSize: '0.8rem', color: '#1e40af', margin: '0.25rem 0 0 1rem', lineHeight: '1.5', paddingLeft: '0.5rem' }}>
            <li><strong>🛑 Arrêter</strong> - Arrêter le processus en cours</li>
            <li><strong>🔄 Relancer</strong> - Relancer une demande expirée/annulée</li>
            <li><strong>👁️ Suivi</strong> - Voir l'historique des contacts et réponses</li>
            <li><strong>🗑️</strong> - Supprimer définitivement (admin uniquement)</li>
          </ul>
        </div>
      </div>

      {/* Liste des demandes de remplacement */}
      <div className="demandes-list">
        {demandes.length > 0 ? (
          demandes.map(demande => (
            <div key={demande.id} className="demande-card" data-testid={`replacement-${demande.id}`}>
              <div className="demande-header">
                <div className="demande-info">
                  {/* Badge de priorité en premier */}
                  <span 
                    style={{ 
                      backgroundColor: demande.priorite === 'urgent' ? '#EF4444' : '#3B82F6',
                      color: 'white',
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginBottom: '8px',
                      display: 'inline-block'
                    }}
                  >
                    {demande.priorite === 'urgent' ? '🚨 Urgent' : '📋 Normal'}
                  </span>
                  <h3>{getTypeGardeName(demande.type_garde_id)}</h3>
                  <span className="demande-date">{parseDateLocal(demande.date).toLocaleDateString('fr-FR')}</span>
                  {/* Raison juste après la date */}
                  <p style={{ margin: '4px 0 0 0', color: '#4B5563', fontSize: '0.95rem' }}>{demande.raison}</p>
                </div>
                <div className="demande-status" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Bouton de suivi - visible pour le demandeur et les admins/superviseurs */}
                  {(demande.demandeur_id === user.id || !['employe', 'pompier'].includes(user.role)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onShowSuivi(demande);
                      }}
                      data-testid={`suivi-replacement-${demande.id}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        color: '#6366F1',
                        borderColor: '#6366F1',
                        padding: '4px 10px',
                        fontSize: '12px'
                      }}
                    >
                      <ClipboardList size={14} />
                      Suivi
                    </Button>
                  )}
                  {/* Badge de statut */}
                  <span 
                    className="status-badge" 
                    style={{ backgroundColor: getStatutColor(demande.statut) }}
                  >
                    {getStatutLabel(demande.statut)}
                  </span>
                </div>
              </div>
              <div className="demande-details">
                <div className="demande-meta" style={{ marginTop: '12px' }}>
                  <span>Demandé par: {demande.demandeur_nom || getUserName(demande.demandeur_id)} </span>
                  <span>Le: {new Date(demande.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
                {/* Afficher qui a annulé si applicable */}
                {demande.statut === 'annulee' && demande.annule_par_nom && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#DC2626' }}>
                    Annulée par: {demande.annule_par_nom}
                  </div>
                )}
                {/* Afficher qui a approuvé manuellement si applicable */}
                {demande.statut === 'approuve_manuellement' && demande.approuve_par_nom && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#059669' }}>
                    Approuvée par: {demande.approuve_par_nom}
                  </div>
                )}
                {/* Afficher qui a relancé si applicable */}
                {demande.relance_par_nom && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#059669' }}>
                    Relancée par: {demande.relance_par_nom}
                  </div>
                )}
              </div>
              
              {/* Actions pour admin/superviseur sur demandes en cours */}
              {!['employe', 'pompier'].includes(user.role) && (demande.statut === 'en_cours' || demande.statut === 'en_attente') && (
                <div className="demande-actions">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="danger"
                    data-testid={`arreter-replacement-${demande.id}`}
                    title="Arrêter le processus de remplacement (annule la recherche)"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onArreterProcessus(demande.id);
                    }}
                    style={{ color: '#DC2626' }}
                  >
                    🛑 Arrêter
                  </Button>
                </div>
              )}
              
              {/* Bouton Relancer pour demandes expirées ou annulées */}
              {['expiree', 'annulee'].includes(demande.statut) && (
                <div className="demande-actions" style={{ marginTop: '10px' }}>
                  <Button 
                    variant="outline" 
                    size="sm"
                    data-testid={`relancer-replacement-${demande.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRelancerDemande(demande.id);
                    }}
                    style={{ color: '#059669', borderColor: '#059669' }}
                  >
                    🔄 Relancer
                  </Button>
                  
                  {/* Bouton supprimer pour admin uniquement */}
                  {user.role === 'admin' && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      data-testid={`delete-replacement-${demande.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSupprimerDemande(demande.id);
                      }}
                      style={{ color: '#DC2626' }}
                      title="Supprimer définitivement cette demande"
                    >
                      🗑️
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state">
            <h3>Aucune demande de remplacement</h3>
            <p>
              {filterStatut !== 'toutes' || filterPeriode !== 'toutes'
                ? 'Aucun résultat pour les filtres sélectionnés. Essayez de modifier vos critères.'
                : 'Les demandes apparaîtront ici.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemplacementsList;
