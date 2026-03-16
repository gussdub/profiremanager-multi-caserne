import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const typesConge = [
  { value: 'maladie', label: '🏥 Maladie', description: 'Arrêt maladie avec justificatif' },
  { value: 'vacances', label: '🏖️ Vacances', description: 'Congés payés annuels' },
  { value: 'parental', label: '👶 Parental', description: 'Congé maternité/paternité' },
  { value: 'personnel', label: '👤 Personnel', description: 'Congé exceptionnel sans solde' }
];

const niveauxPriorite = [
  { value: 'urgente', label: '🚨 Urgente', color: '#EF4444', description: 'Traitement immédiat requis' },
  { value: 'haute', label: '🔥 Haute', color: '#F59E0B', description: 'Traitement prioritaire dans 24h' },
  { value: 'normale', label: '📋 Normale', color: '#3B82F6', description: 'Traitement dans délai standard' },
  { value: 'faible', label: '📝 Faible', color: '#6B7280', description: 'Traitement différé possible' }
];

const CreateCongeModal = ({
  show,
  onClose,
  newConge,
  setNewConge,
  onSubmit,
  // Nouveaux props pour la création admin
  canCreateForOthers = false,
  users = [],
  currentUserId = null
}) => {
  if (!show) return null;

  // Filtrer les utilisateurs actifs (exclure l'utilisateur courant si on veut créer pour quelqu'un d'autre)
  const activeUsers = users.filter(u => u.actif !== false && u.id !== currentUserId);

  // Vérifier si on crée pour quelqu'un d'autre
  const isCreatingForOther = newConge.target_user_id && newConge.target_user_id !== currentUserId;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="create-conge-modal">
        <div className="modal-header">
          <h3>🏖️ Nouvelle demande de congé</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">
          {/* Sélecteur d'employé (visible uniquement pour les admins) */}
          {canCreateForOthers && activeUsers.length > 0 && (
            <div className="form-field" style={{ 
              backgroundColor: '#DCFCE7', 
              padding: '12px', 
              borderRadius: '8px', 
              marginBottom: '16px',
              border: '1px solid #22C55E'
            }}>
              <Label htmlFor="target-user-conge" style={{ color: '#166534', fontWeight: '600' }}>
                👤 Créer pour un autre employé (optionnel)
              </Label>
              <select
                id="target-user-conge"
                value={newConge.target_user_id || ''}
                onChange={(e) => setNewConge({...newConge, target_user_id: e.target.value || null})}
                className="form-select"
                data-testid="select-target-user-conge"
                style={{ marginTop: '8px' }}
              >
                <option value="">-- Pour moi-même --</option>
                {activeUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.prenom} {user.nom} ({user.grade || 'N/A'})
                  </option>
                ))}
              </select>
              {isCreatingForOther && (
                <p style={{ fontSize: '12px', color: '#166534', marginTop: '6px', marginBottom: 0, fontWeight: '500' }}>
                  ✅ Le congé sera automatiquement approuvé et les assignations seront supprimées.
                </p>
              )}
            </div>
          )}

          <div className="form-field">
            <Label htmlFor="type-conge">Type de congé *</Label>
            <select
              id="type-conge"
              value={newConge.type_conge}
              onChange={(e) => setNewConge({...newConge, type_conge: e.target.value})}
              className="form-select"
              data-testid="select-conge-type"
            >
              <option value="">Sélectionner un type de congé</option>
              {typesConge.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label} - {type.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-field">
              <Label htmlFor="date-debut">Date de début *</Label>
              <Input
                id="date-debut"
                type="date"
                value={newConge.date_debut}
                onChange={(e) => setNewConge({...newConge, date_debut: e.target.value})}
                min={new Date().toISOString().split('T')[0]}
                data-testid="select-date-debut"
              />
            </div>
            <div className="form-field">
              <Label htmlFor="date-fin">Date de fin *</Label>
              <Input
                id="date-fin"
                type="date"
                value={newConge.date_fin}
                onChange={(e) => setNewConge({...newConge, date_fin: e.target.value})}
                min={newConge.date_debut || new Date().toISOString().split('T')[0]}
                data-testid="select-date-fin"
              />
            </div>
          </div>

          <div className="form-field">
            <Label htmlFor="priorite-conge">Priorité</Label>
            <select
              id="priorite-conge"
              value={newConge.priorite}
              onChange={(e) => setNewConge({...newConge, priorite: e.target.value})}
              className="form-select"
              data-testid="select-conge-priority"
            >
              {niveauxPriorite.map(niveau => (
                <option key={niveau.value} value={niveau.value}>
                  {niveau.label} - {niveau.description}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <Label htmlFor="raison-conge">Raison du congé *</Label>
            <textarea
              id="raison-conge"
              value={newConge.raison}
              onChange={(e) => setNewConge({...newConge, raison: e.target.value})}
              placeholder="Expliquez la raison de votre demande de congé..."
              rows="4"
              className="form-textarea"
              data-testid="conge-reason"
            />
          </div>

          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button variant="default" onClick={onSubmit} data-testid="submit-conge-btn">
              {isCreatingForOther ? 'Créer et approuver' : 'Créer la demande'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCongeModal;
