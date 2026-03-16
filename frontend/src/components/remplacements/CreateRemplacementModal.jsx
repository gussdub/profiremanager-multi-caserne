import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const niveauxPriorite = [
  { value: 'urgente', label: '🚨 Urgente', color: '#EF4444', description: 'Traitement immédiat requis' },
  { value: 'haute', label: '🔥 Haute', color: '#F59E0B', description: 'Traitement prioritaire dans 24h' },
  { value: 'normale', label: '📋 Normale', color: '#3B82F6', description: 'Traitement dans délai standard' },
  { value: 'faible', label: '📝 Faible', color: '#6B7280', description: 'Traitement différé possible' }
];

const CreateRemplacementModal = ({
  show,
  onClose,
  newDemande,
  setNewDemande,
  typesGarde,
  onSubmit,
  // Nouveaux props pour la création admin
  canCreateForOthers = false,
  users = [],
  currentUserId = null
}) => {
  if (!show) return null;

  // Filtrer les utilisateurs actifs (exclure l'utilisateur courant si on veut créer pour quelqu'un d'autre)
  const activeUsers = users.filter(u => u.actif !== false && u.id !== currentUserId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-replacement-modal">
        <div className="modal-header">
          <h3>🔄 Nouvelle demande de remplacement</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">
          {/* Sélecteur d'employé (visible uniquement pour les admins) */}
          {canCreateForOthers && activeUsers.length > 0 && (
            <div className="form-field" style={{ 
              backgroundColor: '#FEF3C7', 
              padding: '12px', 
              borderRadius: '8px', 
              marginBottom: '16px',
              border: '1px solid #F59E0B'
            }}>
              <Label htmlFor="target-user" style={{ color: '#92400E', fontWeight: '600' }}>
                👤 Créer pour un autre employé (optionnel)
              </Label>
              <select
                id="target-user"
                value={newDemande.target_user_id || ''}
                onChange={(e) => setNewDemande({...newDemande, target_user_id: e.target.value || null})}
                className="form-select"
                data-testid="select-target-user"
                style={{ marginTop: '8px' }}
              >
                <option value="">-- Pour moi-même --</option>
                {activeUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.prenom} {user.nom} ({user.grade || 'N/A'})
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: '#92400E', marginTop: '6px', marginBottom: 0 }}>
                ⚠️ L'employé sélectionné doit être planifié sur le type de garde choisi à la date indiquée.
              </p>
            </div>
          )}

          <div className="form-field">
            <Label htmlFor="type-garde">Type de garde *</Label>
            <select
              id="type-garde"
              value={newDemande.type_garde_id}
              onChange={(e) => setNewDemande({...newDemande, type_garde_id: e.target.value})}
              className="form-select"
              data-testid="select-garde-type"
            >
              <option value="">Sélectionner un type de garde</option>
              {typesGarde.map(type => (
                <option key={type.id} value={type.id}>
                  {type.nom} ({type.heure_debut} - {type.heure_fin})
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <Label htmlFor="date">Date de la garde *</Label>
            <Input
              id="date"
              type="date"
              value={newDemande.date}
              onChange={(e) => setNewDemande({...newDemande, date: e.target.value})}
              min={new Date().toISOString().split('T')[0]}
              data-testid="select-date"
            />
          </div>

          <div className="form-field">
            <Label htmlFor="priorite">Priorité</Label>
            <select
              id="priorite"
              value={newDemande.priorite}
              onChange={(e) => setNewDemande({...newDemande, priorite: e.target.value})}
              className="form-select"
              data-testid="select-priority"
            >
              {niveauxPriorite.map(niveau => (
                <option key={niveau.value} value={niveau.value}>
                  {niveau.label} - {niveau.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <Label htmlFor="raison">Raison du remplacement *</Label>
            <textarea
              id="raison"
              value={newDemande.raison}
              onChange={(e) => setNewDemande({...newDemande, raison: e.target.value})}
              placeholder="Expliquez la raison de votre demande de remplacement (ex: maladie, congé personnel, urgence familiale...)"
              rows="4"
              className="form-textarea"
              data-testid="replacement-reason"
            />
          </div>

          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="default" onClick={onSubmit} data-testid="submit-replacement-btn">
              Créer la demande
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateRemplacementModal;
