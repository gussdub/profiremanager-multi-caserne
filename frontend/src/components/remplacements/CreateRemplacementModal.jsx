import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const API = process.env.REACT_APP_BACKEND_URL;

const prioriteConfig = {
  urgent:  { label: 'Urgente',  color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', icon: '🚨', desc: 'Moins de 24h', delaiKey: 'delai_attente_urgente', delaiDefault: 5 },
  haute:   { label: 'Haute',    color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', icon: '🔥', desc: '24h à 48h',    delaiKey: 'delai_attente_haute',   delaiDefault: 15 },
  normal:  { label: 'Normale',  color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', icon: '📋', desc: '48h à 7 jours', delaiKey: 'delai_attente_normale', delaiDefault: 60 },
  faible:  { label: 'Faible',   color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB', icon: '📝', desc: 'Plus de 7 jours', delaiKey: 'delai_attente_faible', delaiDefault: 120 }
};

const formatDelai = (minutes) => {
  if (!minutes && minutes !== 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
};

const calculerPriorite = (dateStr) => {
  if (!dateStr) return null;
  try {
    const dateGarde = new Date(dateStr + 'T00:00:00Z');
    const now = new Date();
    const heures = (dateGarde - now) / (1000 * 60 * 60);
    if (heures <= 24) return 'urgent';
    if (heures <= 48) return 'haute';
    if (heures <= 168) return 'normal';
    return 'faible';
  } catch {
    return null;
  }
};

const CreateRemplacementModal = ({
  show,
  onClose,
  newDemande,
  setNewDemande,
  typesGarde,
  onSubmit,
  isSubmitting = false,
  tenantSlug,
  canCreateForOthers = false,
  users = [],
  currentUserId = null
}) => {
  const [parametres, setParametres] = useState(null);

  useEffect(() => {
    if (show && tenantSlug) {
      const token = localStorage.getItem(`${tenantSlug}_token`);
      fetch(`${API}/api/${tenantSlug}/parametres/remplacements`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setParametres(data); })
        .catch(() => {});
    }
  }, [show, tenantSlug]);

  const prioriteCalculee = useMemo(() => calculerPriorite(newDemande.date), [newDemande.date]);
  const config = prioriteCalculee ? prioriteConfig[prioriteCalculee] : null;

  const getDelai = (key, defaut) => {
    if (parametres && parametres[key] !== undefined) return parametres[key];
    return defaut;
  };

  if (!show) return null;

  const activeUsers = users.filter(u => u.actif !== false && u.id !== currentUserId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-replacement-modal">
        <div className="modal-header">
          <h3>Nouvelle demande de remplacement</h3>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>&#10005;</Button>
        </div>
        <div className="modal-body">
          {canCreateForOthers && activeUsers.length > 0 && (
            <div className="form-field" style={{ 
              backgroundColor: '#FEF3C7', 
              padding: '12px', 
              borderRadius: '8px', 
              marginBottom: '16px',
              border: '1px solid #F59E0B'
            }}>
              <Label htmlFor="target-user" style={{ color: '#92400E', fontWeight: '600' }}>
                Créer pour un autre employé (optionnel)
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
                L'employé sélectionné doit être planifié sur le type de garde choisi à la date indiquée.
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

          {/* Priorité auto-calculée */}
          {config && (
            <div className="form-field" data-testid="priority-indicator">
              <Label>Priorité (automatique)</Label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginTop: '6px',
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: config.bg,
                border: `1.5px solid ${config.border}`
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: config.color,
                  color: 'white',
                  fontSize: '18px',
                  flexShrink: 0
                }}>
                  {config.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: config.color, fontSize: '15px' }}>
                    {config.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '1px' }}>
                    {config.desc} — Délai de réponse : <strong>{formatDelai(getDelai(config.delaiKey, config.delaiDefault))}</strong> par contact
                  </div>
                </div>
              </div>
            </div>
          )}

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
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button 
              variant="default" 
              onClick={onSubmit} 
              disabled={isSubmitting}
              data-testid="submit-replacement-btn"
              style={isSubmitting ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
            >
              {isSubmitting ? 'Création en cours...' : 'Créer la demande'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateRemplacementModal;
