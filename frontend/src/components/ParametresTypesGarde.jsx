import React from "react";
import { Button } from "./ui/button";

const ParametresTypesGarde = ({
  typesGarde,
  competences,
  editForm,
  setEditForm,
  createForm,
  setCreateForm,
  showEditTypeModal,
  setShowEditTypeModal,
  showCreateTypeModal,
  setShowCreateTypeModal,
  editingItem,
  handleEditType,
  handleDeleteType,
  handleUpdateType,
  handleCreateType,
  handleCreateJourChange,
  handleCreateCompetenceChange,
  handleEditCompetenceChange,
  confirm,
  joursOptions
}) => {
  return (
    <>
          <div className="types-garde-tab">
            <div className="tab-header">
              <div>
                <h2>Paramétrage des gardes</h2>
                <p>Créez et modifiez les types de gardes disponibles</p>
              </div>
              <Button 
                variant="default" 
                onClick={() => setShowCreateTypeModal(true)}
                data-testid="create-type-garde-btn"
              >
                + Nouveau Type de Garde
              </Button>
            </div>

            <div className="types-garde-grid">
              {typesGarde.map(type => (
                <div key={type.id} className="type-garde-card" data-testid={`type-garde-${type.id}`}>
                  <div className="type-garde-header">
                    <div className="type-info">
                      <h3>{type.nom}</h3>
                      <div className="type-schedule">
                        <span>⏰ {type.heure_debut} - {type.heure_fin}</span>
                        <span>👥 {type.personnel_requis} personnel</span>
                        {type.officier_obligatoire && <span>🎖️ Officier requis</span>}
                        {type.est_garde_externe && <span className="badge-externe">Garde Externe</span>}
                        {type.mode_caserne === 'par_caserne' && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>Par caserne</span>}
                      </div>
                    </div>
                    <div className="type-actions">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleEditType(type)}
                        data-testid={`edit-type-${type.id}`}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="danger" 
                        onClick={() => handleDeleteType(type.id)}
                        data-testid={`delete-type-${type.id}`}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                  <div className="type-details">
                    <span className="color-preview" style={{ backgroundColor: type.couleur }}></span>
                    <span>Couleur: {type.couleur}</span>
                    {type.jours_application?.length > 0 && (
                      <div className="type-days">
                        <span>📅 Jours: {type.jours_application.join(', ')}</span>
                      </div>
                    )}
                    {type.est_garde_externe && type.taux_horaire_externe && (
                      <div className="type-taux">
                        <span>💰 Taux externe: {type.taux_horaire_externe}$/h</span>
                      </div>
                    )}
                    {type.montant_garde && (
                      <div className="type-montant">
                        <span>💵 Prime de garde: {type.montant_garde}$</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal d'édition de type de garde */}
        {showEditTypeModal && editingItem && (
          <div className="modal-overlay" onClick={() => setShowEditTypeModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header">
                <h3>Modifier le type de garde</h3>
                <button className="close-btn" onClick={() => setShowEditTypeModal(false)}>×</button>
              </div>
              <div className="modal-body" style={{ display: 'grid', gap: '16px', overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom du type *</label>
                  <input
                    type="text"
                    value={editForm.nom || ''}
                    onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                    placeholder="Ex: Garde interne jour"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heure début *</label>
                    <input
                      type="time"
                      value={editForm.heure_debut || ''}
                      onChange={(e) => setEditForm({ ...editForm, heure_debut: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heure fin *</label>
                    <input
                      type="time"
                      value={editForm.heure_fin || ''}
                      onChange={(e) => setEditForm({ ...editForm, heure_fin: e.target.value })}
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Personnel requis</label>
                    <input
                      type="number"
                      value={editForm.personnel_requis || 1}
                      onChange={(e) => setEditForm({ ...editForm, personnel_requis: parseInt(e.target.value) || 1 })}
                      min="1"
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Couleur</label>
                    <input
                      type="color"
                      value={editForm.couleur || '#3b82f6'}
                      onChange={(e) => setEditForm({ ...editForm, couleur: e.target.value })}
                      style={{ width: '100%', height: '40px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                    />
                  </div>
                </div>
                
                {/* Section Jours d'application */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>📅 Jours d'application</label>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                    Si aucun jour n'est sélectionné, la garde s'applique tous les jours
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {joursOptions.map(jour => (
                      <label
                        key={jour.value}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          background: (editForm.jours_application || []).includes(jour.value) ? '#dbeafe' : '#f9fafb',
                          border: (editForm.jours_application || []).includes(jour.value) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(editForm.jours_application || []).includes(jour.value)}
                          onChange={() => handleJourChange(jour.value)}
                          style={{ accentColor: '#3b82f6' }}
                        />
                        <span style={{ fontSize: '0.9rem' }}>{jour.label}</span>
                      </label>
                    ))}
                  </div>
                  {(editForm.jours_application || []).length > 0 && (
                    <p style={{ marginTop: '8px', fontSize: '0.875rem', color: '#3b82f6', fontWeight: '500' }}>
                      📅 {(editForm.jours_application || []).length} jour(s) sélectionné(s)
                    </p>
                  )}
                </div>
                
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editForm.officier_obligatoire || false}
                      onChange={(e) => setEditForm({ ...editForm, officier_obligatoire: e.target.checked })}
                    />
                    <span>🎖️ Officier obligatoire</span>
                  </label>
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editForm.est_garde_externe || false}
                      onChange={(e) => setEditForm({ ...editForm, est_garde_externe: e.target.checked })}
                    />
                    <span>🏠 Garde externe (astreinte)</span>
                  </label>
                </div>
                {editForm.est_garde_externe && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px', background: '#fef3c7', borderRadius: '6px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Taux horaire externe ($/h)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.taux_horaire_externe || ''}
                        onChange={(e) => setEditForm({ ...editForm, taux_horaire_externe: parseFloat(e.target.value) || null })}
                        placeholder="Ex: 5.50"
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Prime de garde ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.montant_garde || ''}
                        onChange={(e) => setEditForm({ ...editForm, montant_garde: parseFloat(e.target.value) || null })}
                        placeholder="Ex: 50.00"
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                    </div>
                  </div>
                )}
                
                {/* Section Mode Caserne (Multi-Casernes) */}
                <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Mode caserne</label>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                    Visible uniquement si le multi-casernes est actif dans les param&egrave;tres.
                  </p>
                  <select
                    data-testid="mode-caserne-select"
                    value={editForm.mode_caserne || 'global'}
                    onChange={(e) => setEditForm({ ...editForm, mode_caserne: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white' }}
                  >
                    <option value="global">Global - Tous les employ&eacute;s ensemble (comportement standard)</option>
                    <option value="par_caserne">Par caserne - Planning s&eacute;par&eacute; par caserne</option>
                  </select>
                </div>

                {/* Section Compétences Requises */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>📜 Compétences requises pour cette garde</label>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                    Les candidats doivent posséder toutes les compétences sélectionnées pour être assignés
                  </p>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', 
                    gap: '8px',
                    padding: '12px',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                    maxHeight: '150px',
                    overflowY: 'auto'
                  }}>
                    {competences.length > 0 ? competences.map(comp => (
                      <label 
                        key={comp.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          cursor: 'pointer',
                          padding: '6px 10px',
                          background: (editForm.competences_requises || []).includes(comp.id) ? '#dcfce7' : 'white',
                          border: (editForm.competences_requises || []).includes(comp.id) ? '2px solid #22c55e' : '1px solid #e5e7eb',
                          borderRadius: '6px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(editForm.competences_requises || []).includes(comp.id)}
                          onChange={() => handleEditCompetenceChange(comp.id)}
                          style={{ accentColor: '#22c55e' }}
                        />
                        <span style={{ fontSize: '0.85rem' }}>{comp.nom}</span>
                      </label>
                    )) : (
                      <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>Aucune compétence définie</p>
                    )}
                  </div>
                  {(editForm.competences_requises || []).length > 0 && (
                    <p style={{ marginTop: '8px', fontSize: '0.875rem', color: '#22c55e', fontWeight: '500' }}>
                      ✅ {(editForm.competences_requises || []).length} compétence(s) sélectionnée(s)
                    </p>
                  )}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                <Button variant="outline" onClick={() => setShowEditTypeModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleUpdateType}>
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        )}

      {showCreateTypeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateTypeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3>Créer un nouveau type de garde</h3>
              <button className="close-btn" onClick={() => setShowCreateTypeModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '16px', overflowY: 'auto', flex: 1, paddingRight: '8px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Nom du type *</label>
                <input
                  type="text"
                  value={createForm.nom || ''}
                  onChange={(e) => setCreateForm({ ...createForm, nom: e.target.value })}
                  placeholder="Ex: Garde interne jour"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heure début *</label>
                  <input
                    type="time"
                    value={createForm.heure_debut || '08:00'}
                    onChange={(e) => setCreateForm({ ...createForm, heure_debut: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Heure fin *</label>
                  <input
                    type="time"
                    value={createForm.heure_fin || '16:00'}
                    onChange={(e) => setCreateForm({ ...createForm, heure_fin: e.target.value })}
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Personnel requis</label>
                  <input
                    type="number"
                    value={createForm.personnel_requis || 1}
                    onChange={(e) => setCreateForm({ ...createForm, personnel_requis: parseInt(e.target.value) || 1 })}
                    min="1"
                    style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Couleur</label>
                  <input
                    type="color"
                    value={createForm.couleur || '#3b82f6'}
                    onChange={(e) => setCreateForm({ ...createForm, couleur: e.target.value })}
                    style={{ width: '100%', height: '40px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}
                  />
                </div>
              </div>
              
              {/* Section Jours d'application */}
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>📅 Jours d'application</label>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                  Sélectionnez les jours où cette garde est active. Si aucun jour n'est sélectionné, la garde s'applique tous les jours.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {joursOptions.map(jour => (
                    <label
                      key={jour.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: (createForm.jours_application || []).includes(jour.value) ? '#dbeafe' : 'white',
                        border: (createForm.jours_application || []).includes(jour.value) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={(createForm.jours_application || []).includes(jour.value)}
                        onChange={() => handleCreateJourChange(jour.value)}
                        style={{ accentColor: '#3b82f6' }}
                      />
                      <span style={{ fontSize: '0.9rem' }}>{jour.label}</span>
                    </label>
                  ))}
                </div>
                {(createForm.jours_application || []).length > 0 && (
                  <p style={{ marginTop: '8px', fontSize: '0.875rem', color: '#3b82f6', fontWeight: '500' }}>
                    📅 {(createForm.jours_application || []).length} jour(s) sélectionné(s)
                  </p>
                )}
              </div>
              
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createForm.officier_obligatoire || false}
                    onChange={(e) => setCreateForm({ ...createForm, officier_obligatoire: e.target.checked })}
                  />
                  <span>🎖️ Officier obligatoire</span>
                </label>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={createForm.est_garde_externe || false}
                    onChange={(e) => setCreateForm({ ...createForm, est_garde_externe: e.target.checked })}
                  />
                  <span>🏠 Garde externe (astreinte)</span>
                </label>
              </div>
              {createForm.est_garde_externe && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px', background: '#fef3c7', borderRadius: '6px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Taux horaire externe ($/h)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={createForm.taux_horaire_externe || ''}
                      onChange={(e) => setCreateForm({ ...createForm, taux_horaire_externe: parseFloat(e.target.value) || null })}
                      placeholder="Ex: 5.50"
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>Prime de garde ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={createForm.montant_garde || ''}
                      onChange={(e) => setCreateForm({ ...createForm, montant_garde: parseFloat(e.target.value) || null })}
                      placeholder="Ex: 50.00"
                      style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                </div>
              )}
              
              {/* Section Mode Caserne */}
              <div style={{ padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500' }}>Mode caserne</label>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                  D&eacute;finit si cette garde est g&eacute;r&eacute;e globalement ou par caserne (si multi-casernes actif).
                </p>
                <select
                  value={createForm.mode_caserne || 'global'}
                  onChange={(e) => setCreateForm({ ...createForm, mode_caserne: e.target.value })}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px', background: 'white' }}
                >
                  <option value="global">Global - Tous les employ&eacute;s ensemble</option>
                  <option value="par_caserne">Par caserne - Planning s&eacute;par&eacute; par caserne</option>
                </select>
              </div>

              {/* Section Compétences requises */}
              <div style={{ padding: '12px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>📜 Compétences requises</label>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '8px' }}>
                  Les candidats doivent posséder toutes les compétences sélectionnées pour être assignés à cette garde.
                </p>
                <div style={{ 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  background: 'white',
                  borderRadius: '6px', 
                  padding: '8px'
                }}>
                  {competences.length === 0 ? (
                    <p style={{ color: '#6b7280', fontSize: '14px', margin: 0, fontStyle: 'italic' }}>Aucune compétence disponible</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px' }}>
                      {competences.map(comp => (
                        <label 
                          key={comp.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '6px 8px', 
                            cursor: 'pointer',
                            background: (createForm.competences_requises || []).includes(comp.id) ? '#dcfce7' : '#f9fafb',
                            border: (createForm.competences_requises || []).includes(comp.id) ? '2px solid #22c55e' : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={(createForm.competences_requises || []).includes(comp.id)}
                            onChange={() => handleCreateCompetenceChange(comp.id)}
                            style={{ accentColor: '#22c55e' }}
                          />
                          <span style={{ fontSize: '0.85rem' }}>{comp.nom}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {(createForm.competences_requises || []).length > 0 && (
                  <p style={{ marginTop: '8px', fontSize: '0.875rem', color: '#22c55e', fontWeight: '500' }}>
                    ✅ {(createForm.competences_requises || []).length} compétence(s) sélectionnée(s)
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <Button variant="outline" onClick={() => setShowCreateTypeModal(false)}>
                Annuler
              </Button>
              <Button variant="default" onClick={handleCreateType}>
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ParametresTypesGarde;
