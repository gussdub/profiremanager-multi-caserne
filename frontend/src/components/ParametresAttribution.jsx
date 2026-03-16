import React from "react";
import { Button } from "./ui/button.jsx";

/**
 * ParametresAttribution - Onglet de configuration du planning
 * Extrait de Parametres.js pour améliorer la maintenabilité
 */
const ParametresAttribution = ({
  systemSettings,
  heuresSupParams,
  regroupementParams,
  handleSettingChange,
  handleSaveHeuresSupParams,
  setHeuresSupParams,
  setRegroupementParams,
  validationParams,
  setValidationParams,
  handleSaveValidationParams
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
            <DetailCard icon="⚙️" title="Déclenchement" description='Bouton "Attribution auto"' detail="Processus sur demande dans le module Planning" />
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

        {/* CARTE 4: Période d'équité */}
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
            ⚖️ Période d'équité
            <span 
              title="Détermine sur quelle période les heures sont comptabilisées pour assurer une répartition équitable des gardes entre les employés."
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
            backgroundColor: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.875rem',
            color: '#92400e'
          }}>
            ℹ️ L'équité détermine comment les heures sont comptabilisées lors de l'attribution automatique. 
            Par exemple, avec "Mensuel", les heures du mois calendaire complet sont considérées pour prioriser les employés avec moins d'heures.
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
              Type de période d'équité
            </label>
            <select
              value={validationParams?.periode_equite || 'mensuel'}
              onChange={(e) => setValidationParams({...validationParams, periode_equite: e.target.value})}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '1rem',
                background: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="hebdomadaire">Hebdomadaire (lundi au dimanche)</option>
              <option value="bi-hebdomadaire">Bi-hebdomadaire (14 jours)</option>
              <option value="mensuel">Mensuel (mois calendaire)</option>
              <option value="personnalise">Personnalisé (nombre de jours)</option>
            </select>
          </div>

          {validationParams?.periode_equite === 'personnalise' && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                Nombre de jours
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={validationParams?.periode_equite_jours || 30}
                onChange={(e) => setValidationParams({...validationParams, periode_equite_jours: parseInt(e.target.value) || 30})}
                style={{
                  width: '150px',
                  padding: '10px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
              <small style={{ display: 'block', marginTop: '4px', color: '#64748b' }}>
                Période personnalisée de {validationParams?.periode_equite_jours || 30} jours
              </small>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button 
              variant="default"
              onClick={handleSaveValidationParams}
              style={{ background: '#10b981' }}
            >
              💾 Enregistrer la période d'équité
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
