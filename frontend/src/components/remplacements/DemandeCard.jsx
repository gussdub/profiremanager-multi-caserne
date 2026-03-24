/**
 * Composant Carte de Demande de Remplacement
 * Affiche une demande individuelle avec ses actions
 */

import React from 'react';
import { Button } from '../ui/button';
import { ClipboardList } from 'lucide-react';

const prioriteConfig = {
  urgent:  { label: 'Urgente',  color: '#EF4444', bg: '#FEF2F2', icon: '🚨' },
  haute:   { label: 'Haute',    color: '#F59E0B', bg: '#FFFBEB', icon: '🔥' },
  normal:  { label: 'Normale',  color: '#3B82F6', bg: '#EFF6FF', icon: '📋' },
  faible:  { label: 'Faible',   color: '#6B7280', bg: '#F9FAFB', icon: '📝' }
};

const DemandeCard = ({
  demande,
  user,
  getTypeGardeName,
  getUserName,
  parseDateLocal,
  getStatutColor,
  getStatutLabel,
  onSuivi,
  onArreter,
  onRelancer,
  onDelete,
  canApproveRemplacement
}) => {
  const isAdminOrSuperviseur = canApproveRemplacement || !['employe', 'pompier'].includes(user?.role);
  const pConfig = prioriteConfig[demande.priorite] || prioriteConfig.normal;
  
  return (
    <div className="demande-card" data-testid={`replacement-${demande.id}`}>
      <div className="demande-header">
        <div className="demande-info">
          {/* Badge de priorité */}
          <span 
            data-testid={`priority-badge-${demande.id}`}
            style={{ 
              backgroundColor: pConfig.color,
              color: 'white',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              marginBottom: '8px',
              display: 'inline-block'
            }}
          >
            {pConfig.icon} {pConfig.label}
          </span>
          <h3>{getTypeGardeName(demande.type_garde_id)}</h3>
          <span className="demande-date">{parseDateLocal(demande.date).toLocaleDateString('fr-FR')}</span>
          <p style={{ margin: '4px 0 0 0', color: '#4B5563', fontSize: '0.95rem' }}>{demande.raison}</p>
        </div>
        
        <div className="demande-status" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Bouton de suivi */}
          {(demande.demandeur_id === user?.id || isAdminOrSuperviseur) && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSuivi(demande);
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
        
        {/* Infos d'annulation */}
        {demande.statut === 'annulee' && demande.annule_par_nom && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#DC2626' }}>
            Annulée par: {demande.annule_par_nom}
          </div>
        )}
        
        {/* Infos d'approbation manuelle */}
        {demande.statut === 'approuve_manuellement' && demande.approuve_par_nom && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#059669' }}>
            Approuvée par: {demande.approuve_par_nom}
          </div>
        )}
        
        {/* Infos de relance */}
        {demande.relance_par_nom && (
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#059669' }}>
            Relancée par: {demande.relance_par_nom}
          </div>
        )}
      </div>
      
      {/* Actions pour admin/superviseur sur demandes en cours */}
      {isAdminOrSuperviseur && (demande.statut === 'en_cours' || demande.statut === 'en_attente') && (
        <div className="demande-actions">
          <Button 
            variant="ghost" 
            size="sm" 
            className="danger"
            data-testid={`arreter-replacement-${demande.id}`}
            title="Arrêter le processus de remplacement"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onArreter(demande.id);
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
              onRelancer(demande.id);
            }}
            style={{ color: '#059669', borderColor: '#059669' }}
          >
            🔄 Relancer
          </Button>
          
          {/* Bouton supprimer pour admin uniquement */}
          {user?.role === 'admin' && (
            <Button 
              variant="ghost" 
              size="sm"
              data-testid={`delete-replacement-${demande.id}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(demande.id);
              }}
              style={{ color: '#DC2626', marginLeft: '8px' }}
            >
              🗑️
            </Button>
          )}
        </div>
      )}
      
      {/* Remplaçant trouvé */}
      {demande.statut === 'accepte' && demande.remplacant_id && (
        <div style={{ 
          marginTop: '12px', 
          padding: '12px', 
          backgroundColor: '#D1FAE5', 
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '1.25rem' }}>✅</span>
          <span style={{ color: '#065F46', fontWeight: '500' }}>
            Remplaçant: {demande.remplacant_nom || getUserName(demande.remplacant_id)}
          </span>
        </div>
      )}
    </div>
  );
};

export default DemandeCard;
