import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const ParametresAttribution = ({ tenantSlug, typesGarde, competences, setCompetences, grades, setGrades }) => {
  const { toast } = useToast();
  
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
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '10px',
                    backgroundColor: '#f8fafc',
                    cursor: 'not-allowed',
                    opacity: 0.7
                  }}>
                    <input
                      type="checkbox"
                      checked={true}
                      disabled={true}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'not-allowed'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#94a3b8',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N0</span>
                        <strong style={{ fontSize: '1rem' }}>🔒 Priorisation Types de Garde</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>(INCHANGÉ)</span>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Priorité intrinsèque des types de gardes (configuration fixe)
                      </p>
                    </div>
                  </label>

                  {/* Niveau 1 - Toujours actif (non modifiable) */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '10px',
                    backgroundColor: '#f8fafc',
                    cursor: 'not-allowed',
                    opacity: 0.7
                  }}>
                    <input
                      type="checkbox"
                      checked={true}
                      disabled={true}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'not-allowed'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#94a3b8',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N1</span>
                        <strong style={{ fontSize: '1rem' }}>🔒 Assignations Manuelles</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>(INCHANGÉ)</span>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Les assignations manuelles ne sont jamais écrasées (priorité maximale)
                      </p>
                    </div>
                  </label>

                  {/* Niveau 2 - Temps Partiel DISPONIBLES */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: `2px solid ${systemSettings.niveau_2_actif ? '#10b981' : '#e5e7eb'}`,
                    borderRadius: '10px',
                    backgroundColor: systemSettings.niveau_2_actif ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={systemSettings.niveau_2_actif !== false}
                      onChange={(e) => handleSettingChange('niveau_2_actif', e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N2</span>
                        <strong style={{ fontSize: '1rem' }}>🟢 Temps Partiel DISPONIBLES</strong>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Employés à temps partiel ayant déclaré leur disponibilité. Tri par équité puis ancienneté.
                      </p>
                    </div>
                  </label>

                  {/* Niveau 3 - Temps Partiel STAND-BY */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: `2px solid ${systemSettings.niveau_3_actif ? '#f59e0b' : '#e5e7eb'}`,
                    borderRadius: '10px',
                    backgroundColor: systemSettings.niveau_3_actif ? '#fffbeb' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={systemSettings.niveau_3_actif !== false}
                      onChange={(e) => handleSettingChange('niveau_3_actif', e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N3</span>
                        <strong style={{ fontSize: '1rem' }}>🟡 Temps Partiel STAND-BY</strong>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Employés à temps partiel n'ayant rien déclaré (ni dispo, ni indispo). Tri par équité puis ancienneté.
                      </p>
                    </div>
                  </label>

                  {/* Niveau 4 - Temps Plein INCOMPLETS */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: `2px solid ${systemSettings.niveau_4_actif ? '#3b82f6' : '#e5e7eb'}`,
                    borderRadius: '10px',
                    backgroundColor: systemSettings.niveau_4_actif ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={systemSettings.niveau_4_actif !== false}
                      onChange={(e) => handleSettingChange('niveau_4_actif', e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N4</span>
                        <strong style={{ fontSize: '1rem' }}>🔵 Temps Plein INCOMPLETS</strong>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Employés à temps plein avec heures &lt; max hebdomadaires. Tri par heures manquantes, équité, ancienneté.
                      </p>
                    </div>
                  </label>

                  {/* Niveau 5 - Temps Plein COMPLETS */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '16px',
                    padding: '16px',
                    border: `2px solid ${systemSettings.niveau_5_actif ? '#a855f7' : '#e5e7eb'}`,
                    borderRadius: '10px',
                    backgroundColor: systemSettings.niveau_5_actif ? '#faf5ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}>
                    <input
                      type="checkbox"
                      checked={systemSettings.niveau_5_actif !== false}
                      onChange={(e) => handleSettingChange('niveau_5_actif', e.target.checked)}
                      style={{
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        cursor: 'pointer'
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          backgroundColor: '#a855f7',
                          color: 'white',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 'bold'
                        }}>N5</span>
                        <strong style={{ fontSize: '1rem' }}>🟣 Temps Plein COMPLETS</strong>
                        <span style={{ fontSize: '0.75rem', color: '#f59e0b' }}>(Heures sup requises)</span>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                        Employés à temps plein ayant atteint le max hebdomadaire (uniquement si heures sup activées). Tri par équité, ancienneté.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="algorithm-details">
                <h3>Détails de l'algorithme</h3>
                <div className="details-grid">
                  <div className="detail-card">
                    <h4>🎯 Temps partiel</h4>
                    <p>Doit déclarer disponibilité</p>
                    <small>Vérification obligatoire des créneaux disponibles</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>🏢 Temps plein</h4>
                    <p>Éligible automatiquement</p>
                    <small>Agit comme backup si pas assez de temps partiel</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>📊 Calcul équitable</h4>
                    <p>Cumul mensuel des heures</p>
                    <small>Priorité à ceux avec moins d'heures assignées</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>📅 Ancienneté</h4>
                    <p>Basée sur date d'embauche</p>
                    <small>Plus ancien = priorité en cas d'égalité d'heures</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>⚙️ Déclenchement</h4>
                    <p>Bouton "Attribution auto"</p>
                    <small>Processus sur demande dans le module Planning</small>
                  </div>
                  
                  <div className="detail-card">
                    <h4>🔍 Audit</h4>
                    <p>Traçabilité complète</p>
                    <small>Cliquez sur une garde pour voir le détail de sélection</small>
                  </div>
                </div>
              </div>

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
                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Fréquence
                    </label>
                    <select 
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.frequence || 'mensuel'}
                      onChange={(e) => handleValidationChange('frequence', e.target.value)}
                    >
                      <option value="mensuel">Mensuel</option>
                      <option value="hebdomadaire">Hebdomadaire</option>
                      <option value="personnalise">Personnalisé</option>
                    </select>
                    <small style={{ color: '#64748b' }}>Fréquence d'envoi automatique</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      {validationParams.frequence === 'mensuel' ? 'Jour du mois' : 'Jour de la semaine'}
                    </label>
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
                    <small style={{ color: '#64748b' }}>Jour d'envoi des notifications</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Heure d'envoi
                    </label>
                    <input 
                      type="time"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.heure_envoi || '17:00'}
                      onChange={(e) => handleValidationChange('heure_envoi', e.target.value)}
                    />
                    <small style={{ color: '#64748b' }}>Heure d'envoi automatique</small>
                  </div>

                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Période couverte
                    </label>
                    <select 
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.periode_couverte || 'mois_suivant'}
                      onChange={(e) => handleValidationChange('periode_couverte', e.target.value)}
                    >
                      <option value="mois_suivant">Mois suivant</option>
                      <option value="2_semaines">2 semaines</option>
                      <option value="4_semaines">4 semaines</option>
                    </select>
                    <small style={{ color: '#64748b' }}>Gardes à inclure dans l'email</small>
                  </div>
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
                
                <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                    Période d'équité
                  </label>
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
                  <small style={{ color: '#64748b' }}>Période sur laquelle calculer l'équité de distribution des gardes</small>
                </div>

                {validationParams.periode_equite === 'personnalise' && (
                  <div className="param-card" style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#1e293b' }}>
                      Nombre de jours
                    </label>
                    <input 
                      type="number"
                      min="1"
                      max="365"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                      value={validationParams.periode_equite_jours || 30}
                      onChange={(e) => handleValidationChange('periode_equite_jours', parseInt(e.target.value))}
                    />
                    <small style={{ color: '#64748b' }}>Période glissante en jours (ex: 30 = dernier mois)</small>
                  </div>
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
        )}
  );
};

export default ParametresAttribution;
