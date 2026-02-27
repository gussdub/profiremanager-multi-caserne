import React from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";

/**
 * ParametresRemplacements - Onglet des paramètres de remplacements
 * Extrait de Parametres.js pour améliorer la maintenabilité
 */
const ParametresRemplacements = ({
  systemSettings,
  handleSettingChange
}) => {
  return (
    <div className="remplacements-tab">
      <div className="tab-header">
        <div>
          <h2>Paramètres des Remplacements</h2>
          <p>Configuration des règles de validation et délais de traitement automatique</p>
        </div>
      </div>
      
      <div className="replacement-settings-compact">
        <div className="settings-row">
          <div className="settings-column">
            <h4 className="compact-title">🔔 Mode de notification</h4>
            <p>Définissez comment les employés sont contactés pour les remplacements</p>
            
            <div className="setting-inputs-compact">
              <div className="input-group-compact">
                <Label>Stratégie de contact</Label>
                <select 
                  className="form-select"
                  value={systemSettings.mode_notification || 'simultane'}
                  onChange={(e) => handleSettingChange('mode_notification', e.target.value)}
                  data-testid="mode-notification-select"
                >
                  <option value="simultane">⚡ Simultané - Tous en même temps</option>
                  <option value="sequentiel">🎯 Séquentiel - Un par un</option>
                  <option value="groupe_sequentiel">🔀 Groupes séquentiels - Par groupes</option>
                </select>
              </div>

              {systemSettings.mode_notification === 'groupe_sequentiel' && (
                <div className="input-group-compact">
                  <Label>Taille du groupe</Label>
                  <Input
                    type="number"
                    min="2"
                    max="10"
                    value={systemSettings.taille_groupe || 3}
                    onChange={(e) => handleSettingChange('taille_groupe', parseInt(e.target.value))}
                    data-testid="taille-groupe-input"
                  />
                  <small>Nombre de personnes contactées simultanément par groupe</small>
                </div>
              )}

              {(systemSettings.mode_notification === 'sequentiel' || systemSettings.mode_notification === 'groupe_sequentiel') && (
                <div className="input-group-compact">
                  <Label>Délai d'attente (minutes)</Label>
                  <Input
                    type="number"
                    min="5"
                    max="4320"
                    step="5"
                    value={systemSettings.delai_attente_minutes || 1440}
                    onChange={(e) => handleSettingChange('delai_attente_minutes', parseInt(e.target.value))}
                    data-testid="delai-attente-input"
                  />
                  <small>Temps d'attente avant de passer au suivant (en cas de non-réponse). Par défaut: 24h (1440 min)</small>
                </div>
              )}

              <div className="input-group-compact">
                <Label>Max personnes à contacter</Label>
                <div className="input-with-reset">
                  <Input
                    type="number"
                    min="1"
                    max="200"
                    value={systemSettings.max_personnes_contact || 5}
                    onChange={(e) => handleSettingChange('max_personnes_contact', parseInt(e.target.value))}
                    data-testid="max-contact-input"
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => handleSettingChange('max_personnes_contact', 5)}
                    data-testid="reset-contact-btn"
                  >
                    🔄
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-column">
            <h4 className="compact-title">Règles de validation automatique</h4>
            <div className="validation-rules-compact">
              <label className="validation-rule-compact">
                <input
                  type="checkbox"
                  checked={systemSettings.privilegier_disponibles}
                  onChange={(e) => handleSettingChange('privilegier_disponibles', e.target.checked)}
                  data-testid="toggle-privilegier-disponibles"
                />
                <div className="rule-content-compact">
                  <span className="rule-title">Privilégier les personnes disponibles</span>
                  <span className="rule-description">Priorité aux employés ayant renseigné leur disponibilité</span>
                </div>
              </label>
              
              <label className="validation-rule-compact">
                <input
                  type="checkbox"
                  checked={systemSettings.competences_egales}
                  onChange={(e) => handleSettingChange('competences_egales', e.target.checked)}
                  data-testid="toggle-competences-egales"
                />
                <div className="rule-content-compact">
                  <span className="rule-title">Compétences équivalentes</span>
                  <span className="rule-description">Mêmes compétences que le demandeur</span>
                </div>
              </label>
            </div>
          </div>
        </div>
        
        {/* Section Archivage */}
        <div className="settings-row" style={{ marginTop: '24px' }}>
          <div className="settings-column">
            <h4 className="compact-title">🗑️ Archivage automatique</h4>
            <p>Nettoyage automatique des anciennes demandes de remplacement terminées</p>
            
            <div className="setting-inputs-compact">
              <label className="validation-rule-compact" style={{ marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  checked={systemSettings.archivage_auto_actif !== false}
                  onChange={(e) => handleSettingChange('archivage_auto_actif', e.target.checked)}
                  data-testid="toggle-archivage-auto"
                />
                <div className="rule-content-compact">
                  <span className="rule-title">Activer l'archivage automatique</span>
                  <span className="rule-description">Supprime automatiquement les demandes terminées selon le délai configuré</span>
                </div>
              </label>
              
              <div className="input-group-compact">
                <Label>Délai avant archivage</Label>
                <select 
                  className="form-select"
                  value={systemSettings.delai_archivage_jours || 365}
                  onChange={(e) => handleSettingChange('delai_archivage_jours', parseInt(e.target.value))}
                  data-testid="delai-archivage-select"
                  disabled={!systemSettings.archivage_auto_actif}
                >
                  <option value={30}>1 mois</option>
                  <option value={90}>3 mois</option>
                  <option value={180}>6 mois</option>
                  <option value={365}>1 an</option>
                  <option value={730}>2 ans</option>
                </select>
                <span className="input-description">
                  Les demandes acceptées, expirées ou annulées plus anciennes seront supprimées automatiquement
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Section Heures Silencieuses */}
        <div className="settings-row" style={{ marginTop: '24px' }}>
          <div className="settings-column">
            <h4 className="compact-title">🌙 Heures silencieuses</h4>
            <p>Pause des contacts pour les demandes de priorité Normale et Faible</p>
            
            <div className="setting-inputs-compact">
              <label className="validation-rule-compact" style={{ marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  checked={systemSettings.heures_silencieuses_actif !== false}
                  onChange={(e) => handleSettingChange('heures_silencieuses_actif', e.target.checked)}
                  data-testid="toggle-heures-silencieuses"
                />
                <div className="rule-content-compact">
                  <span className="rule-title">Activer les heures silencieuses</span>
                  <span className="rule-description">Ne pas contacter les remplaçants pendant la nuit (priorité Normale/Faible uniquement)</span>
                </div>
              </label>
              
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="input-group-compact" style={{ flex: 1, minWidth: '140px' }}>
                  <Label>Pause de</Label>
                  <select 
                    className="form-select"
                    value={systemSettings.heure_debut_silence || "21:00"}
                    onChange={(e) => handleSettingChange('heure_debut_silence', e.target.value)}
                    data-testid="heure-debut-silence"
                    disabled={!systemSettings.heures_silencieuses_actif}
                  >
                    <option value="19:00">19:00</option>
                    <option value="20:00">20:00</option>
                    <option value="21:00">21:00</option>
                    <option value="22:00">22:00</option>
                    <option value="23:00">23:00</option>
                  </select>
                </div>
                
                <div className="input-group-compact" style={{ flex: 1, minWidth: '140px' }}>
                  <Label>à</Label>
                  <select 
                    className="form-select"
                    value={systemSettings.heure_fin_silence || "07:00"}
                    onChange={(e) => handleSettingChange('heure_fin_silence', e.target.value)}
                    data-testid="heure-fin-silence"
                    disabled={!systemSettings.heures_silencieuses_actif}
                  >
                    <option value="05:00">05:00</option>
                    <option value="06:00">06:00</option>
                    <option value="07:00">07:00</option>
                    <option value="08:00">08:00</option>
                    <option value="09:00">09:00</option>
                  </select>
                </div>
              </div>
              
              <div style={{ 
                marginTop: '12px', 
                padding: '10px 14px', 
                background: '#FEF3C7', 
                borderRadius: '8px',
                border: '1px solid #FCD34D',
                fontSize: '0.85rem',
                color: '#92400E'
              }}>
                <strong>ℹ️ Note:</strong> Les demandes Urgentes et Hautes ne sont pas affectées par les heures silencieuses et seront traitées immédiatement.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParametresRemplacements;
