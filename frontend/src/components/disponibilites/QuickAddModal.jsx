import React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * QuickAddModal - Modal d'ajout rapide de disponibilité/indisponibilité
 */
const QuickAddModal = ({
  show,
  type, // 'disponibilite' ou 'indisponibilite'
  config,
  setConfig,
  typesGarde,
  onClose,
  onSave
}) => {
  if (!show) return null;

  const isDisponibilite = type === 'disponibilite';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>
            {isDisponibilite ? '✅ Ajouter disponibilité' : '❌ Ajouter indisponibilité'}
          </h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="modal-body">
          {/* Date fixe - non modifiable */}
          <div className="config-section" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <Label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#64748b' }}>📅 Date</Label>
            <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#0f172a', marginTop: '0.5rem' }}>
              {new Date(config.date + 'T00:00:00').toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>

          {/* Sélection du type de garde */}
          <div className="config-section">
            <Label>🚒 Type de garde</Label>
            <select
              value={config.type_garde_id}
              onChange={(e) => {
                const selectedType = typesGarde.find(t => t.id === e.target.value);
                setConfig({
                  ...config,
                  type_garde_id: e.target.value,
                  heure_debut: selectedType ? selectedType.heure_debut : config.heure_debut,
                  heure_fin: selectedType ? selectedType.heure_fin : config.heure_fin
                });
              }}
              className="form-select"
              style={{ marginTop: '0.5rem' }}
            >
              <option value="">
                {isDisponibilite ? 'Tous les types de garde' : 'Toute la journée'}
              </option>
              {typesGarde.map(t => (
                <option key={t.id} value={t.id}>
                  {t.nom} ({t.heure_debut} - {t.heure_fin})
                </option>
              ))}
            </select>
            <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
              {config.type_garde_id 
                ? 'Les horaires du type de garde sont appliqués automatiquement'
                : isDisponibilite
                  ? 'Vous êtes disponible pour tous les types de garde avec les horaires ci-dessous'
                  : 'Vous êtes indisponible toute la journée'
              }
            </small>
          </div>

          {/* Horaires personnalisés */}
          <div className="config-section">
            <Label>⏰ Horaires</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '0.5rem' }}>
              <div>
                <Label style={{ fontSize: '0.85rem', color: '#64748b' }}>Heure de début</Label>
                <Input 
                  type="time" 
                  value={config.heure_debut}
                  onChange={(e) => setConfig({...config, heure_debut: e.target.value})}
                  disabled={!!config.type_garde_id}
                />
              </div>
              <div>
                <Label style={{ fontSize: '0.85rem', color: '#64748b' }}>Heure de fin</Label>
                <Input 
                  type="time" 
                  value={config.heure_fin}
                  onChange={(e) => setConfig({...config, heure_fin: e.target.value})}
                  disabled={!!config.type_garde_id}
                />
              </div>
            </div>
          </div>

          {/* Résumé */}
          <div style={{ 
            background: isDisponibilite ? '#f0fdf4' : '#fef2f2', 
            padding: '1rem', 
            borderRadius: '8px', 
            border: isDisponibilite ? '2px solid #16a34a' : '2px solid #dc2626',
            marginTop: '1.5rem'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: isDisponibilite ? '#16a34a' : '#dc2626' }}>
              📋 Résumé
            </div>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#0f172a' }}>
              {isDisponibilite ? '✅ Vous serez disponible' : '❌ Vous serez indisponible'}<br/>
              📅 Le {new Date(config.date + 'T00:00:00').toLocaleDateString('fr-FR')}<br/>
              ⏰ De {config.heure_debut} à {config.heure_fin}<br/>
              🚒 {config.type_garde_id 
                ? `Pour ${typesGarde.find(t => t.id === config.type_garde_id)?.nom}`
                : isDisponibilite ? 'Pour tous les types de garde' : 'Toute la journée'
              }
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            variant="default" 
            onClick={onSave}
            style={{ 
              background: isDisponibilite ? '#16a34a' : '#dc2626',
              borderColor: isDisponibilite ? '#16a34a' : '#dc2626'
            }}
          >
            {isDisponibilite ? '✅ Ajouter disponibilité' : '❌ Ajouter indisponibilité'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuickAddModal;
