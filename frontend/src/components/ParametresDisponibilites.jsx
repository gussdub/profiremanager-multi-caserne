import React from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";

/**
 * ParametresDisponibilites - Onglet des paramètres de disponibilités
 * Extrait de Parametres.js pour améliorer la maintenabilité
 * 
 * Note: Les permissions d'accès (qui peut modifier, bypass le blocage, etc.) 
 * sont gérées via le système RBAC dans Paramètres > Rôles et Permissions
 */
const ParametresDisponibilites = ({
  systemSettings,
  handleSettingChange,
  handleSaveDisponibilitesParams
}) => {
  return (
    <div className="disponibilites-tab">
      <div className="tab-header">
        <div>
          <h2>Paramètres des Disponibilités</h2>
          <p>Configuration du système de blocage et des notifications pour les disponibilités</p>
        </div>
      </div>
      
      <div className="availability-settings">
        <div className="settings-row">
          <div className="settings-column">
            <h4 className="compact-title">🚫 Système de blocage</h4>
            <p>Bloquer la modification des disponibilités du mois suivant à une date déterminée</p>
            
            <div className="setting-inputs-compact">
              <label className="setting-toggle">
                <div className="toggle-info">
                  <span>Activer le système de blocage</span>
                  <small>Active la restriction des modifications de disponibilités</small>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.blocage_dispos_active}
                  onChange={(e) => handleSettingChange('blocage_dispos_active', e.target.checked)}
                  data-testid="toggle-blocage-dispos"
                />
              </label>

              {systemSettings.blocage_dispos_active && (
                <div className="input-group-compact">
                  <Label>Jour de blocage du mois</Label>
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={systemSettings.jour_blocage_dispos || 15}
                    onChange={(e) => handleSettingChange('jour_blocage_dispos', parseInt(e.target.value))}
                    data-testid="jour-blocage-input"
                  />
                  <small>Le {systemSettings.jour_blocage_dispos || 15} du mois, bloquer les modifications du mois suivant à minuit</small>
                </div>
              )}
            </div>
          </div>

          <div className="settings-column">
            <h4 className="compact-title">🔔 Notifications</h4>
            <p>Rappeler aux employés temps partiel de saisir leurs disponibilités</p>
            
            <div className="setting-inputs-compact">
              <label className="setting-toggle">
                <div className="toggle-info">
                  <span>Activer les notifications</span>
                  <small>Prévenir les employés avant la date limite</small>
                </div>
                <input
                  type="checkbox"
                  checked={systemSettings.notifications_dispos_actives}
                  onChange={(e) => handleSettingChange('notifications_dispos_actives', e.target.checked)}
                  data-testid="toggle-notifications-dispos"
                />
              </label>

              {systemSettings.notifications_dispos_actives && (
                <div className="input-group-compact">
                  <Label>Nombre de jours d'avance</Label>
                  <Input
                    type="number"
                    min="1"
                    max="14"
                    value={systemSettings.jours_avance_notification || 3}
                    onChange={(e) => handleSettingChange('jours_avance_notification', parseInt(e.target.value))}
                    data-testid="jours-avance-input"
                  />
                  <small>Notifier {systemSettings.jours_avance_notification || 3} jour(s) avant la date limite</small>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bouton Sauvegarder */}
        <div style={{marginTop: '2rem', textAlign: 'center'}}>
          <Button onClick={handleSaveDisponibilitesParams}>
            💾 Sauvegarder les paramètres de disponibilités
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ParametresDisponibilites;
