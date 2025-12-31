import React from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Calendar } from "../ui/calendar";

/**
 * AvailabilityCalendarModal - Modal de gestion des disponibilités
 * Permet de créer des disponibilités via calendrier ou récurrence
 */
const AvailabilityCalendarModal = ({
  show,
  onClose,
  availabilityConfig,
  setAvailabilityConfig,
  typesGarde,
  selectedDates,
  setSelectedDates,
  userDisponibilites,
  onSave,
  onTypeGardeChange,
  getTypeGardeName
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="availability-config-modal">
        <div className="modal-header">
          <h3>✅ Gérer disponibilités</h3>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="modal-body">
          <div className="availability-config-advanced">
            {/* Sélecteur de mode */}
            <div className="config-section" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'calendrier'})}
                  style={{
                    padding: '10px 20px',
                    border: availabilityConfig.mode === 'calendrier' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                    borderRadius: '8px',
                    background: availabilityConfig.mode === 'calendrier' ? '#f0fdf4' : 'white',
                    cursor: 'pointer',
                    fontWeight: availabilityConfig.mode === 'calendrier' ? 'bold' : 'normal',
                    color: availabilityConfig.mode === 'calendrier' ? '#16a34a' : '#64748b'
                  }}
                >
                  📅 Calendrier (Clics multiples)
                </button>
                <button
                  onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'recurrence'})}
                  style={{
                    padding: '10px 20px',
                    border: availabilityConfig.mode === 'recurrence' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                    borderRadius: '8px',
                    background: availabilityConfig.mode === 'recurrence' ? '#f0fdf4' : 'white',
                    cursor: 'pointer',
                    fontWeight: availabilityConfig.mode === 'recurrence' ? 'bold' : 'normal',
                    color: availabilityConfig.mode === 'recurrence' ? '#16a34a' : '#64748b'
                  }}
                >
                  🔄 Avec récurrence
                </button>
              </div>
            </div>

            {/* Configuration du type de garde */}
            <div className="config-section">
              <h4>🚒 Type de garde spécifique</h4>
              <div className="type-garde-selection">
                <Label>Pour quel type de garde êtes-vous disponible ?</Label>
                <select
                  value={availabilityConfig.type_garde_id}
                  onChange={(e) => onTypeGardeChange(e.target.value)}
                  className="form-select"
                  data-testid="availability-type-garde-select"
                >
                  <option value="">Tous les types de garde</option>
                  {typesGarde.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.nom} ({type.heure_debut} - {type.heure_fin})
                    </option>
                  ))}
                </select>
                <small>
                  Sélectionnez un type spécifique ou laissez "Tous les types" pour une disponibilité générale
                </small>
              </div>
            </div>

            {/* Configuration des horaires - Seulement si "Tous les types" */}
            {!availabilityConfig.type_garde_id && (
              <div className="config-section">
                <h4>⏰ Créneaux horaires personnalisés</h4>
                <p className="section-note">Définissez vos horaires de disponibilité générale</p>
                <div className="time-config-row">
                  <div className="time-field">
                    <Label>Heure de début</Label>
                    <Input 
                      type="time" 
                      value={availabilityConfig.heure_debut}
                      onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_debut: e.target.value})}
                      data-testid="availability-start-time"
                    />
                  </div>
                  <div className="time-field">
                    <Label>Heure de fin</Label>
                    <Input 
                      type="time" 
                      value={availabilityConfig.heure_fin}
                      onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_fin: e.target.value})}
                      data-testid="availability-end-time"
                    />
                  </div>
                </div>
                <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                  ℹ️ Les entrées créées ici seront automatiquement marquées comme "Disponible"
                </small>
              </div>
            )}

            {/* Horaires automatiques si type spécifique sélectionné */}
            {availabilityConfig.type_garde_id && (
              <div className="config-section">
                <h4>⏰ Horaires du type de garde</h4>
                <div className="automatic-hours">
                  <div className="hours-display">
                    <span className="hours-label">Horaires automatiques :</span>
                    <span className="hours-value">
                      {(() => {
                        const selectedType = typesGarde.find(t => t.id === availabilityConfig.type_garde_id);
                        return selectedType ? `${selectedType.heure_debut} - ${selectedType.heure_fin}` : 'Non défini';
                      })()}
                    </span>
                  </div>
                  <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                    ℹ️ Les disponibilités seront automatiquement enregistrées avec ces horaires
                  </small>
                </div>
              </div>
            )}

            {/* MODE CALENDRIER - Sélection des dates */}
            {availabilityConfig.mode === 'calendrier' && (
              <div className="config-section">
                <h4>📆 Sélection des dates</h4>
                <div className="calendar-instructions">
                  <p>Cliquez sur les dates où vous êtes disponible :</p>
                  <small style={{color: '#ef4444', marginTop: '0.5rem', display: 'block'}}>
                    ❌ Les dates barrées en rouge indiquent des indisponibilités existantes
                  </small>
                </div>
                
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={setSelectedDates}
                  className="interactive-calendar"
                  disabled={(date) => date < new Date().setHours(0,0,0,0)}
                  indisponibilites={userDisponibilites?.filter(d => d.statut === 'indisponible')}
                />
                
                <div className="selection-summary-advanced">
                  <div className="summary-item">
                    <strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}
                  </div>
                  <div className="summary-item">
                    <strong>Dates sélectionnées :</strong> {selectedDates?.length || 0} jour(s)
                  </div>
                  <div className="summary-item">
                    <strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}
                  </div>
                </div>
              </div>
            )}

            {/* MODE RÉCURRENCE - Période avec récurrence */}
            {availabilityConfig.mode === 'recurrence' && (
              <>
                <div className="config-section">
                  <h4>📅 Période</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <Label>Date de début</Label>
                      <Input
                        type="date"
                        value={availabilityConfig.date_debut}
                        onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_debut: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Date de fin</Label>
                      <Input
                        type="date"
                        value={availabilityConfig.date_fin}
                        onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_fin: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="config-section">
                  <h4>🔄 Récurrence</h4>
                  <Label>Type de récurrence</Label>
                  <select
                    value={availabilityConfig.recurrence_type}
                    onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_type: e.target.value})}
                    className="form-select"
                  >
                    <option value="hebdomadaire">Toutes les semaines (hebdomadaire)</option>
                    <option value="bihebdomadaire">Toutes les deux semaines (bihebdomadaire)</option>
                    <option value="mensuelle">Tous les mois (mensuelle)</option>
                    <option value="annuelle">Tous les ans (annuelle)</option>
                    <option value="personnalisee">Personnalisée</option>
                  </select>

                  {availabilityConfig.recurrence_type === 'personnalisee' && (
                    <div style={{ marginTop: '15px', padding: '15px', background: '#f0fdf4', borderRadius: '8px' }}>
                      <h5 style={{ marginTop: 0, marginBottom: '10px' }}>⚙️ Configuration personnalisée</h5>
                      <Label>Fréquence</Label>
                      <select
                        value={availabilityConfig.recurrence_frequence}
                        onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_frequence: e.target.value})}
                        className="form-select"
                        style={{ marginBottom: '10px' }}
                      >
                        <option value="jours">Jours</option>
                        <option value="semaines">Semaines</option>
                        <option value="mois">Mois</option>
                        <option value="ans">Ans</option>
                      </select>

                      <Label>Intervalle : Tous les</Label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <Input
                          type="number"
                          min="1"
                          max="365"
                          value={availabilityConfig.recurrence_intervalle}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                          style={{ width: '100px' }}
                        />
                        <span>{availabilityConfig.recurrence_frequence}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Sélection des jours de la semaine pour hebdomadaire/bihebdomadaire */}
                  {(availabilityConfig.recurrence_type === 'hebdomadaire' || availabilityConfig.recurrence_type === 'bihebdomadaire') && (
                    <div style={{ marginTop: '15px', padding: '15px', background: '#f0fdf4', borderRadius: '8px' }}>
                      <h5 style={{ marginTop: 0, marginBottom: '10px' }}>📅 Sélectionnez les jours de la semaine</h5>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                        {[
                          { label: 'Lun', value: 'monday' },
                          { label: 'Mar', value: 'tuesday' },
                          { label: 'Mer', value: 'wednesday' },
                          { label: 'Jeu', value: 'thursday' },
                          { label: 'Ven', value: 'friday' },
                          { label: 'Sam', value: 'saturday' },
                          { label: 'Dim', value: 'sunday' }
                        ].map(jour => (
                          <label
                            key={jour.value}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px',
                              borderRadius: '8px',
                              border: `2px solid ${availabilityConfig.jours_semaine?.includes(jour.value) ? '#16a34a' : '#cbd5e1'}`,
                              background: availabilityConfig.jours_semaine?.includes(jour.value) ? '#dcfce7' : 'white',
                              cursor: 'pointer',
                              fontWeight: availabilityConfig.jours_semaine?.includes(jour.value) ? '600' : '400'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={availabilityConfig.jours_semaine?.includes(jour.value) || false}
                              onChange={(e) => {
                                const currentJours = availabilityConfig.jours_semaine || [];
                                const newJours = e.target.checked
                                  ? [...currentJours, jour.value]
                                  : currentJours.filter(j => j !== jour.value);
                                setAvailabilityConfig({...availabilityConfig, jours_semaine: newJours});
                              }}
                              style={{ marginRight: '6px' }}
                            />
                            {jour.label}
                          </label>
                        ))}
                      </div>
                      {availabilityConfig.jours_semaine && availabilityConfig.jours_semaine.length > 0 && (
                        <p style={{ marginTop: '10px', color: '#16a34a', fontSize: '0.9rem' }}>
                          ✓ {availabilityConfig.jours_semaine.length} jour(s) sélectionné(s)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Résumé pour le mode récurrence */}
                <div className="config-section" style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <h4 style={{ color: '#15803d', marginTop: 0 }}>📊 Résumé</h4>
                  <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#15803d' }}>
                    <li><strong>Mode :</strong> Récurrence</li>
                    <li><strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}</li>
                    <li><strong>Période :</strong> Du {availabilityConfig.date_debut ? new Date(availabilityConfig.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au {availabilityConfig.date_fin ? new Date(availabilityConfig.date_fin).toLocaleDateString('fr-FR') : 'N/A'}</li>
                    <li><strong>Récurrence :</strong> {
                      availabilityConfig.recurrence_type === 'hebdomadaire' ? 'Toutes les semaines' :
                      availabilityConfig.recurrence_type === 'bihebdomadaire' ? 'Toutes les 2 semaines' :
                      availabilityConfig.recurrence_type === 'mensuelle' ? 'Tous les mois' :
                      availabilityConfig.recurrence_type === 'annuelle' ? 'Tous les ans' :
                      `Tous les ${availabilityConfig.recurrence_intervalle} ${availabilityConfig.recurrence_frequence}`
                    }</li>
                    <li><strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          <div className="modal-actions">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button 
              variant="default" 
              onClick={onSave}
              data-testid="save-availability-btn"
              disabled={availabilityConfig.mode === 'calendrier' && (!selectedDates || selectedDates.length === 0)}
            >
              {availabilityConfig.mode === 'calendrier' 
                ? `✅ Sauvegarder (${selectedDates?.length || 0} jour${selectedDates?.length > 1 ? 's' : ''})`
                : '✅ Générer les disponibilités'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityCalendarModal;
