import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost } from '../utils/api';

const ParametresDisponibilites = ({ tenantSlug }) => {
  const { toast } = useToast();
  const [dispoSettings, setDispoSettings] = useState({
    delai_soumission_jours: 7,
    rappel_auto: true,
    jours_rappel_avant: 3
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [tenantSlug]);

  const loadSettings = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parametres/disponibilites');
      if (data) setDispoSettings(data);
    } catch (error) {
      console.error('Erreur chargement paramètres disponibilités:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await apiPost(tenantSlug, '/parametres/disponibilites', dispoSettings);
      toast({ title: "✅ Paramètres sauvegardés" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de sauvegarder", variant: "destructive" });
    }
    setSaving(false);
  };

  return (
          <div className="disponibilites-tab">
            <div className="tab-header">
              <div>
                <h2>Paramètres des Disponibilités</h2>
                <p>Configuration du système de blocage des disponibilités par date limite</p>
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
                  <h4 className="compact-title">⚙️ Exceptions et permissions</h4>
                  <div className="validation-rules-compact">
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.exceptions_admin_superviseur}
                        onChange={(e) => handleSettingChange('exceptions_admin_superviseur', e.target.checked)}
                        data-testid="toggle-exceptions-admin"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Exceptions pour admin/superviseur</span>
                        <span className="rule-description">Les administrateurs et superviseurs peuvent modifier même après la date limite</span>
                      </div>
                    </label>
                    
                    <label className="validation-rule-compact">
                      <input
                        type="checkbox"
                        checked={systemSettings.admin_peut_modifier_temps_partiel}
                        onChange={(e) => handleSettingChange('admin_peut_modifier_temps_partiel', e.target.checked)}
                        data-testid="toggle-admin-modif-temps-partiel"
                      />
                      <div className="rule-content-compact">
                        <span className="rule-title">Admin peut modifier les temps partiel</span>
                        <span className="rule-description">Les admin/superviseurs peuvent modifier les disponibilités des employés temps partiel</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="settings-row">
                <div className="settings-column">
                  <h4 className="compact-title">🔔 Notifications</h4>
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

                {/* Bouton Sauvegarder */}
                <div style={{marginTop: '2rem', textAlign: 'center'}}>
                  <Button onClick={handleSaveDisponibilitesParams}>
                    💾 Sauvegarder les paramètres de disponibilités
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

  );
};

export default ParametresDisponibilites;
