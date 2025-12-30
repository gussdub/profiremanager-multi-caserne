import React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * ReinitModal - Modal de réinitialisation des disponibilités
 * Extrait de MesDisponibilites.jsx
 */
const ReinitModal = ({
  show,
  onClose,
  reinitConfig,
  setReinitConfig,
  reinitWarning,
  setReinitWarning,
  isReinitializing,
  onReinitialiser
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>🗑️ Réinitialiser les disponibilités</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">
          <div className="reinit-config">
            {/* Sélection de la période */}
            <div className="config-section">
              <h4>📅 Période à réinitialiser</h4>
              <select
                value={reinitConfig.periode}
                onChange={(e) => {
                  setReinitConfig({...reinitConfig, periode: e.target.value});
                  setReinitWarning(null);
                }}
                className="form-select"
              >
                <option value="semaine">Semaine courante</option>
                <option value="mois">Mois courant</option>
                <option value="mois_prochain">Mois prochain</option>
                <option value="annee">Année courante</option>
                <option value="personnalisee">Période personnalisée</option>
              </select>
              <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                {reinitConfig.periode === 'semaine' && 'Du lundi au dimanche de la semaine en cours'}
                {reinitConfig.periode === 'mois' && 'Du 1er au dernier jour du mois en cours'}
                {reinitConfig.periode === 'mois_prochain' && 'Du 1er au dernier jour du mois prochain'}
                {reinitConfig.periode === 'annee' && "Du 1er janvier au 31 décembre de l'année en cours"}
                {reinitConfig.periode === 'personnalisee' && 'Sélectionnez une plage de dates personnalisée (max 1 an)'}
              </small>
              
              {/* Champs de dates pour période personnalisée */}
              {reinitConfig.periode === 'personnalisee' && (
                <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div>
                      <Label>Date de début</Label>
                      <Input
                        type="date"
                        value={reinitConfig.date_debut}
                        onChange={(e) => {
                          setReinitConfig({...reinitConfig, date_debut: e.target.value});
                          setReinitWarning(null);
                        }}
                      />
                    </div>
                    <div>
                      <Label>Date de fin</Label>
                      <Input
                        type="date"
                        value={reinitConfig.date_fin}
                        onChange={(e) => {
                          setReinitConfig({...reinitConfig, date_fin: e.target.value});
                          setReinitWarning(null);
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Avertissement pour dates bloquées */}
                  {reinitWarning && (
                    <div style={{
                      marginTop: '15px',
                      padding: '12px',
                      background: '#fef3c7',
                      border: '2px solid #f59e0b',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}>
                      <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ display: 'block', marginBottom: '5px', color: '#92400e' }}>
                          Attention - Dates bloquées
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: '#78350f' }}>
                          {reinitWarning}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sélection du type d'entrées */}
            <div className="config-section">
              <h4>📊 Type d'entrées à supprimer</h4>
              <select
                value={reinitConfig.type_entree}
                onChange={(e) => setReinitConfig({...reinitConfig, type_entree: e.target.value})}
                className="form-select"
              >
                <option value="les_deux">Disponibilités ET Indisponibilités</option>
                <option value="disponibilites">Disponibilités uniquement</option>
                <option value="indisponibilites">Indisponibilités uniquement</option>
              </select>
              <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                {reinitConfig.type_entree === 'disponibilites' && '✅ Supprime uniquement les jours disponibles'}
                {reinitConfig.type_entree === 'indisponibilites' && '❌ Supprime uniquement les jours indisponibles'}
                {reinitConfig.type_entree === 'les_deux' && "🔄 Supprime tous les types d'entrées"}
              </small>
            </div>

            {/* Sélection du mode */}
            <div className="config-section">
              <h4>🎯 Mode de suppression</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ 
                  padding: '15px', 
                  border: reinitConfig.mode === 'generees_seulement' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: reinitConfig.mode === 'generees_seulement' ? '#eff6ff' : 'white'
                }}>
                  <input
                    type="radio"
                    name="mode"
                    value="generees_seulement"
                    checked={reinitConfig.mode === 'generees_seulement'}
                    onChange={(e) => setReinitConfig({...reinitConfig, mode: e.target.value})}
                    style={{ marginRight: '10px' }}
                  />
                  <strong>Supprimer uniquement les entrées générées automatiquement</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '5px', marginLeft: '25px', color: '#64748b' }}>
                    ✅ Préserve vos modifications manuelles (origine: manuelle)
                  </div>
                </label>

                <label style={{ 
                  padding: '15px', 
                  border: reinitConfig.mode === 'tout' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: reinitConfig.mode === 'tout' ? '#fef2f2' : 'white'
                }}>
                  <input
                    type="radio"
                    name="mode"
                    value="tout"
                    checked={reinitConfig.mode === 'tout'}
                    onChange={(e) => setReinitConfig({...reinitConfig, mode: e.target.value})}
                    style={{ marginRight: '10px' }}
                  />
                  <strong>Supprimer TOUTES les entrées</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '5px', marginLeft: '25px', color: '#991b1b' }}>
                    ⚠️ Supprime tout (manuelles + générées automatiquement)
                  </div>
                </label>
              </div>
            </div>

            {/* Résumé et confirmation */}
            <div className="config-section" style={{ 
              background: reinitConfig.mode === 'tout' ? '#fef2f2' : '#eff6ff', 
              padding: '15px', 
              borderRadius: '8px', 
              border: `1px solid ${reinitConfig.mode === 'tout' ? '#dc2626' : '#3b82f6'}` 
            }}>
              <h4 style={{ color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af', marginTop: 0 }}>
                ⚠️ Confirmation requise
              </h4>
              <p style={{ margin: '10px 0', color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af' }}>
                Vous êtes sur le point de <strong>
                  {reinitConfig.mode === 'tout' 
                    ? 'SUPPRIMER TOUTES LES' 
                    : 'supprimer les entrées générées de'}
                </strong> {' '}
                <strong>
                  {reinitConfig.type_entree === 'disponibilites' && 'DISPONIBILITÉS'}
                  {reinitConfig.type_entree === 'indisponibilites' && 'INDISPONIBILITÉS'}
                  {reinitConfig.type_entree === 'les_deux' && 'DISPONIBILITÉS ET INDISPONIBILITÉS'}
                </strong> {' de '}
                {reinitConfig.periode === 'semaine' && 'la semaine courante'}
                {reinitConfig.periode === 'mois' && 'du mois courant'}
                {reinitConfig.periode === 'mois_prochain' && 'du mois prochain'}
                {reinitConfig.periode === 'annee' && "de l'année courante"}
                {reinitConfig.periode === 'personnalisee' && 'la période sélectionnée'}
              </p>
              <p style={{ margin: '10px 0', fontSize: '0.875rem', color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af' }}>
                {reinitConfig.mode === 'tout' 
                  ? `🚨 Cette action supprimera toutes les ${reinitConfig.type_entree === 'disponibilites' ? 'disponibilités' : reinitConfig.type_entree === 'indisponibilites' ? 'indisponibilités' : 'entrées'} (manuelles et automatiques).`
                  : '✅ Vos modifications manuelles seront préservées.'}
              </p>
            </div>
          </div>

          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button 
              variant={reinitConfig.mode === 'tout' ? 'destructive' : 'default'}
              onClick={onReinitialiser}
              disabled={isReinitializing}
            >
              {isReinitializing ? 'Suppression...' : '🗑️ Confirmer la suppression'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReinitModal;
