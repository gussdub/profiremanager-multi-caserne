import React from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";

/**
 * ParametresFormations - Onglet des paramètres de formations NFPA 1500
 * Extrait de Parametres.js pour améliorer la maintenabilité
 */
const ParametresFormations = ({
  parametresFormations,
  setParametresFormations,
  onSave
}) => {
  return (
    <div className="formations-tab">
      <div className="tab-header">
        <div>
          <h2>Paramètres Formations - NFPA 1500</h2>
          <p>Configuration des exigences de formation annuelles</p>
        </div>
      </div>
      
      <div className="formations-content">
        <div className="settings-row">
          <div className="settings-column">
            <h4 className="compact-title">⏱️ Exigences annuelles</h4>
            <div className="setting-inputs-compact">
              <div className="input-group">
                <Label>Heures minimales par année (NFPA 1500)</Label>
                <Input 
                  type="number"
                  value={parametresFormations.heures_minimales_annuelles}
                  onChange={e => setParametresFormations({
                    ...parametresFormations,
                    heures_minimales_annuelles: parseFloat(e.target.value) || 100
                  })}
                  placeholder="100"
                  data-testid="heures-min-input"
                />
                <small>Nombre minimum d'heures de formation requises par pompier par année</small>
              </div>
              
              <div className="input-group">
                <Label>Pourcentage minimum de présence (%)</Label>
                <Input 
                  type="number"
                  min="0"
                  max="100"
                  value={parametresFormations.pourcentage_presence_minimum || 80}
                  onChange={e => setParametresFormations({
                    ...parametresFormations,
                    pourcentage_presence_minimum: parseFloat(e.target.value) || 80
                  })}
                  placeholder="80"
                  data-testid="pourcentage-min-input"
                />
                <small>Pourcentage minimum de présence aux formations passées pour être conforme</small>
              </div>
              
              <div className="input-group">
                <Label>Délai notification liste d'attente (jours)</Label>
                <Input 
                  type="number"
                  value={parametresFormations.delai_notification_liste_attente}
                  onChange={e => setParametresFormations({
                    ...parametresFormations,
                    delai_notification_liste_attente: parseInt(e.target.value) || 7
                  })}
                  placeholder="7"
                  data-testid="delai-notification-input"
                />
                <small>Nombre de jours avant de notifier les personnes en liste d'attente</small>
              </div>
              
              <label className="setting-toggle">
                <div className="toggle-info">
                  <strong>Activer les notifications email</strong>
                  <span>Envoyer des emails pour inscriptions et listes d'attente</span>
                </div>
                <div className="toggle-switch">
                  <input 
                    type="checkbox"
                    checked={parametresFormations.email_notifications_actif}
                    onChange={e => setParametresFormations({
                      ...parametresFormations,
                      email_notifications_actif: e.target.checked
                    })}
                    data-testid="email-notifications-toggle"
                  />
                  <span className="slider"></span>
                </div>
              </label>
              
              <div style={{marginTop: '1.5rem'}}>
                <Button onClick={onSave}>
                  💾 Sauvegarder les paramètres
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="formations-info-section">
          <div className="info-card">
            <h4>💡 À propos de NFPA 1500</h4>
            <p>La norme NFPA 1500 établit les exigences minimales pour un programme de santé et sécurité au travail des services d'incendie.</p>
            <p><strong>Exigences de formation :</strong></p>
            <ul>
              <li>Formation continue obligatoire pour tous les pompiers</li>
              <li>Minimum d'heures de formation par année (configurable ci-dessus)</li>
              <li>Suivi et documentation de toutes les formations</li>
              <li>Validation des présences pour créditer les heures</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParametresFormations;
