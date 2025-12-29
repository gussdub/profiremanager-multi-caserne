import React from "react";
import { Button } from "./ui/button.jsx";

/**
 * ParametresAttribution - Onglet de configuration du planning
 * Extrait de Parametres.js pour améliorer la maintenabilité
 */
const ParametresAttribution = ({
  systemSettings,
  validationParams,
  heuresSupParams,
  regroupementParams,
  handleSettingChange,
  handleValidationChange,
  handleSaveValidationParams,
  handleSendNotificationsManually,
  handleSaveHeuresSupParams,
  setHeuresSupParams,
  setRegroupementParams
}) => {
  return (
    <div className="attribution-tab" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div className="tab-header" style={{ marginBottom: '30px' }}>
        <div>
          <h2>⚙️ Configuration du Planning</h2>
          <p style={{ color: '#64748b' }}>Paramétrez l'attribution automatique, les heures supplémentaires et le regroupement</p>
        </div>
      </div>
      
      {/* Grille de sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* CARTE 1: Niveaux d'attribution configurables */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '1.25rem',
            color: '#1e293b'
          }}>
            🤖 Niveaux d'Attribution Automatique
            <span 
              title="Configurez quels niveaux de priorité doivent être appliqués lors de l'attribution automatique. Les niveaux s'appliquent dans l'ordre."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                fontSize: '0.75rem',
                cursor: 'help',
                fontWeight: 'bold'
              }}
            >
              i
            </span>
          </h3>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.875rem',
            color: '#0369a1'
          }}>
            ℹ️ Les niveaux cochés seront appliqués dans l'ordre. Décochez un niveau pour le désactiver dans l'algorithme d'attribution.
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Niveau 0 - Toujours actif (non modifiable) */}
            <NiveauCard
              niveau="N0"
              titre="🔒 Priorisation Types de Garde"
              description="Priorité intrinsèque des types de gardes (configuration fixe)"
              couleur="#94a3b8"
              disabled={true}
              checked={true}
              mention="(INCHANGÉ)"
            />

            {/* Niveau 1 - Toujours actif (non modifiable) */}
            <NiveauCard
              niveau="N1"
              titre="🔒 Assignations Manuelles"
              description="Les assignations manuelles ne sont jamais écrasées (priorité maximale)"
              couleur="#94a3b8"
              disabled={true}
              checked={true}
              mention="(INCHANGÉ)"
            />

            {/* Niveau 2 - Temps Partiel DISPONIBLES */}
            <NiveauCard
              niveau="N2"
              titre="🟢 Temps Partiel DISPONIBLES"
              description="Employés à temps partiel ayant déclaré leur disponibilité. Tri par équité puis ancienneté."
              couleur="#10b981"
              checked={systemSettings.niveau_2_actif !== false}
              onChange={(e) => handleSettingChange('niveau_2_actif', e.target.checked)}
            />

            {/* Niveau 3 - Temps Partiel STAND-BY */}
            <NiveauCard
              niveau="N3"
              titre="🟡 Temps Partiel STAND-BY"
              description="Employés à temps partiel n'ayant rien déclaré (ni dispo, ni indispo). Tri par équité puis ancienneté."
              couleur="#f59e0b"
              checked={systemSettings.niveau_3_actif !== false}
              onChange={(e) => handleSettingChange('niveau_3_actif', e.target.checked)}
            />

            {/* Niveau 4 - Temps Plein INCOMPLETS */}
            <NiveauCard
              niveau="N4"
              titre="🔵 Temps Plein INCOMPLETS"
              description="Employés à temps plein avec heures < max hebdomadaires. Tri par heures manquantes, équité, ancienneté."
              couleur="#3b82f6"
              checked={systemSettings.niveau_4_actif !== false}
              onChange={(e) => handleSettingChange('niveau_4_actif', e.target.checked)}
            />

            {/* Niveau 5 - Temps Plein COMPLETS */}
            <NiveauCard
              niveau="N5"
              titre="🟣 Temps Plein COMPLETS"
              description="Employés à temps plein ayant atteint le max hebdomadaire (uniquement si heures sup activées). Tri par équité, ancienneté."
              couleur="#a855f7"
              checked={systemSettings.niveau_5_actif !== false}
              onChange={(e) => handleSettingChange('niveau_5_actif', e.target.checked)}
              mention="(Heures sup requises)"
              mentionColor="#f59e0b"
            />
          </div>
        </div>

        {/* Détails de l'algorithme */}
        <div className="algorithm-details">
          <h3>Détails de l'algorithme</h3>
          <div className="details-grid">
            <DetailCard icon="🎯" title="Temps partiel" description="Doit déclarer disponibilité" detail="Vérification obligatoire des créneaux disponibles" />
            <DetailCard icon="🏢" title="Temps plein" description="Éligible automatiquement" detail="Agit comme backup si pas assez de temps partiel" />
            <DetailCard icon="📊" title="Calcul équitable" description="Cumul mensuel des heures" detail="Priorité à ceux avec moins d'heures assignées" />
            <DetailCard icon="📅" title="Ancienneté" description="Basée sur date d'embauche" detail="Plus ancien = priorité en cas d'égalité d'heures" />
            <DetailCard icon="⚙️" title="Déclenchement" description="Bouton \"Attribution auto\"" detail="Processus sur demande dans le module Planning" />
            <DetailCard icon="🔍" title="Audit" description="Traçabilité complète" detail="Cliquez sur une garde pour voir le détail de sélection" />
          </div>
        </div>

        {/* Paramètres généraux */}
        <div className="settings-toggles">
          <h3>Paramètres généraux</h3>
          <div className="toggle-list">
            <label className="setting-toggle">
              <div className="toggle-info">
                <span>Attribution automatique activée</span>
                <small>Active l'algorithme intelligent à 5 niveaux</small>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.attribution_auto}
                onChange={(e) => handleSettingChange('attribution_auto', e.target.checked)}
              />
            </label>
            
            <label className="setting-toggle">
              <div className="toggle-info">
                <span>Notification par email</span>
                <small>Envoie un email pour chaque nouvelle assignation</small>
              </div>
              <input
                type="checkbox"
                checked={systemSettings.notification_email}
                onChange={(e) => handleSettingChange('notification_email', e.target.checked)}
              />
            </label>
          </div>
        </div>

        {/* CARTE 2: Validation du Planning */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '1.25rem',
            color: '#1e293b'
          }}>
            📅 Validation et Notification du Planning
            <span 
              title="Configure les emails automatiques envoyés aux employés pour les informer de leurs gardes assignées"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                fontSize: '0.75rem',
                cursor: 'help',
                fontWeight: 'bold'
              }}
            >
              i
            </span>
          </h3>
          
          <div className="validation-params-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' }}>
            <ParamCard label="Fréquence" detail="Fréquence d'envoi automatique">
              <select 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                value={validationParams.frequence || 'mensuel'}
                onChange={(e) => handleValidationChange('frequence', e.target.value)}
              >
                <option value="mensuel">Mensuel</option>
                <option value="hebdomadaire">Hebdomadaire</option>
                <option value="personnalise">Personnalisé</option>
              </select>
            </ParamCard>

            <ParamCard 
              label={validationParams.frequence === 'mensuel' ? 'Jour du mois' : 'Jour de la semaine'} 
              detail="Jour d'envoi des notifications"
            >
              {validationParams.frequence === 'mensuel' ? (
                <input 
                  type="number"
                  min="1"
                  max="31"
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={validationParams.jour_envoi || 25}
                  onChange={(e) => handleValidationChange('jour_envoi', parseInt(e.target.value))}
                />
              ) : (
                <select 
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  value={validationParams.jour_envoi || 'vendredi'}
                  onChange={(e) => handleValidationChange('jour_envoi', e.target.value)}
                >
                  <option value="lundi">Lundi</option>
                  <option value="mardi">Mardi</option>
                  <option value="mercredi">Mercredi</option>
                  <option value="jeudi">Jeudi</option>
                  <option value="vendredi">Vendredi</option>
                </select>
              )}
            </ParamCard>

            <ParamCard label="Heure d'envoi" detail="Heure d'envoi automatique">
              <input 
                type="time"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                value={validationParams.heure_envoi || '17:00'}
                onChange={(e) => handleValidationChange('heure_envoi', e.target.value)}
              />
            </ParamCard>

            <ParamCard label="Période couverte" detail="Gardes à inclure dans l'email">
              <select 
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                value={validationParams.periode_couverte || 'mois_suivant'}
                onChange={(e) => handleValidationChange('periode_couverte', e.target.value)}
              >
                <option value="mois_suivant">Mois suivant</option>
                <option value="2_semaines">2 semaines</option>
                <option value="4_semaines">4 semaines</option>
              </select>
            </ParamCard>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
            <label className="setting-toggle" style={{ marginBottom: 0 }}>
              <div className="toggle-info">
                <span>Envoi automatique</span>
                <small>Envoyer automatiquement selon la configuration</small>
              </div>
              <input
                type="checkbox"
                checked={validationParams.envoi_automatique !== false}
                onChange={(e) => handleValidationChange('envoi_automatique', e.target.checked)}
              />
            </label>
          </div>

          {validationParams.derniere_notification && (
            <div style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
              <small style={{ color: '#1e40af' }}>
                📧 Dernière notification envoyée: {new Date(validationParams.derniere_notification).toLocaleString('fr-FR')}
              </small>
            </div>
          )}

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

          <h3 style={{ marginBottom: '15px', color: '#1e293b', fontSize: '16px' }}>⚖️ Équité des Gardes</h3>
          
          <ParamCard label="Période d'équité" detail="Période sur laquelle calculer l'équité de distribution des gardes" style={{ marginBottom: '15px' }}>
            <select 
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              value={validationParams.periode_equite || 'mensuel'}
              onChange={(e) => handleValidationChange('periode_equite', e.target.value)}
            >
              <option value="hebdomadaire">Hebdomadaire (7 jours)</option>
              <option value="bi-hebdomadaire">Bi-hebdomadaire (14 jours)</option>
              <option value="mensuel">Mensuelle (mois en cours)</option>
              <option value="personnalise">Personnalisée</option>
            </select>
          </ParamCard>

          {validationParams.periode_equite === 'personnalise' && (
            <ParamCard label="Nombre de jours" detail="Période glissante en jours (ex: 30 = dernier mois)" style={{ marginBottom: '15px' }}>
              <input 
                type="number"
                min="1"
                max="365"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                value={validationParams.periode_equite_jours || 30}
                onChange={(e) => handleValidationChange('periode_equite_jours', parseInt(e.target.value))}
              />
            </ParamCard>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button 
              variant="outline"
              onClick={handleSaveValidationParams}
              data-testid="save-validation-params"
            >
              💾 Enregistrer la configuration
            </Button>
            
            <Button 
              variant="default"
              onClick={handleSendNotificationsManually}
              data-testid="send-notifications-manually"
              style={{ background: '#dc2626' }}
            >
              📧 Envoyer les notifications maintenant
            </Button>
          </div>
        </div>

        {/* CARTE 3: Autoriser heures supplémentaires */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <h3 style={{ 
            margin: '0 0 16px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '1.25rem',
            color: '#1e293b'
          }}>
            ⏰ Autoriser heures supplémentaires
            <span 
              title="Lorsqu'activé, l'auto-attribution peut dépasser les heures maximum hebdomadaires (lundi-dimanche) configurées dans le dossier personnel de chaque employé."
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                fontSize: '0.75rem',
                cursor: 'help',
                fontWeight: 'bold'
              }}
            >
              i
            </span>
          </h3>
        
          <div className="toggle-container" style={{ marginBottom: '20px', background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
            <label className="setting-toggle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="toggle-info">
                <span style={{ fontWeight: '600', color: '#1e293b' }}>Autoriser les heures supplémentaires</span>
                <small style={{ display: 'block', color: '#64748b', marginTop: '4px' }}>
                  Lorsqu'activé, l'auto-attribution peut dépasser les heures maximum hebdomadaires (lundi-dimanche) configurées dans le dossier personnel de chaque employé.
                </small>
              </div>
              <input
                type="checkbox"
                checked={heuresSupParams.activer_gestion_heures_sup}
                onChange={(e) => setHeuresSupParams({...heuresSupParams, activer_gestion_heures_sup: e.target.checked})}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <Button 
              variant="default"
              onClick={handleSaveHeuresSupParams}
              style={{ background: '#10b981' }}
            >
              💾 Enregistrer la configuration
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};

// Composant pour les cartes de niveau d'attribution
const NiveauCard = ({ niveau, titre, description, couleur, disabled, checked, onChange, mention, mentionColor }) => (
  <label style={{
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    padding: '16px',
    border: `2px solid ${disabled ? '#e5e7eb' : (checked ? couleur : '#e5e7eb')}`,
    borderRadius: '10px',
    backgroundColor: disabled ? '#f8fafc' : (checked ? `${couleur}10` : '#ffffff'),
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    transition: 'all 0.2s'
  }}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      style={{
        width: '20px',
        height: '20px',
        marginTop: '2px',
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
    />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <span style={{
          backgroundColor: couleur,
          color: 'white',
          padding: '2px 8px',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 'bold'
        }}>{niveau}</span>
        <strong style={{ fontSize: '1rem' }}>{titre}</strong>
        {mention && <span style={{ fontSize: '0.75rem', color: mentionColor || '#64748b' }}>{mention}</span>}
      </div>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
        {description}
      </p>
    </div>
  </label>
);

// Composant pour les cartes de détails
const DetailCard = ({ icon, title, description, detail }) => (
  <div className="detail-card">
    <h4>{icon} {title}</h4>
    <p>{description}</p>
    <small>{detail}</small>
  </div>
);

// Composant pour les paramètres
const ParamCard = ({ label, detail, children, style }) => (
  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', ...style }}>
    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
      {label}
    </label>
    {children}
    <small style={{ color: '#64748b' }}>{detail}</small>
  </div>
);

export default ParametresAttribution;
