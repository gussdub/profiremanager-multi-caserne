import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const ParametresPersonnalisation = ({ tenantSlug, typesGarde, competences, grades }) => {
  const { toast } = useToast();
  
  // States for personnalisation
  const [postesGardes, setPostesGardes] = useState([]);
  const [showEditPosteModal, setShowEditPosteModal] = useState(false);
  const [editingPoste, setEditingPoste] = useState(null);
  const [posteForm, setPosteForm] = useState({
    nom: '',
    description: '',
    type_garde: '',
    competences_requises: [],
    grades_autorises: [],
    nombre_requis: 1,
    priorite: 1,
    actif: true
  });

  // Load postes on mount
  useEffect(() => {
    loadPostes();
  }, [tenantSlug]);

  const loadPostes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parametres/postes-gardes');
      setPostesGardes(data || []);
    } catch (error) {
      console.error('Erreur chargement postes:', error);
    }
  };

  return (
          <Personnalisation tenantSlug={tenantSlug} toast={toast} />
        )}

      </div>

      {/* Modal d'édition type de garde avec jours */}
      {showEditTypeModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditTypeModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-type-modal">
            <div className="modal-header">
              <h3>Modifier: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditTypeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du type de garde</Label>
                  <Input
                    value={editForm.nom}
                    onChange={(e) => setEditForm({...editForm, nom: e.target.value})}
                    data-testid="edit-nom-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Heure de début</Label>
                    <Input
                      type="time"
                      value={editForm.heure_debut}
                      onChange={(e) => setEditForm({...editForm, heure_debut: e.target.value})}
                      data-testid="edit-debut-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Heure de fin</Label>
                    <Input
                      type="time"
                      value={editForm.heure_fin}
                      onChange={(e) => setEditForm({...editForm, heure_fin: e.target.value})}
                      data-testid="edit-fin-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Personnel requis</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editForm.personnel_requis}
                      onChange={(e) => setEditForm({...editForm, personnel_requis: parseInt(e.target.value)})}
                      data-testid="edit-personnel-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Couleur</Label>
                  <Input
                    type="color"
                    value={editForm.couleur}
                    onChange={(e) => setEditForm({...editForm, couleur: e.target.value})}
                    data-testid="edit-couleur-input"
                  />
                </div>

                <div className="form-field">
                  <Label>Jours d'application (récurrence)</Label>
                  <div className="days-selection">
                    {joursOptions.map(jour => (
                      <label key={jour.value} className="day-checkbox">
                        <input
                          type="checkbox"
                          checked={editForm.jours_application.includes(jour.value)}
                          onChange={() => handleJourChange(jour.value)}
                          data-testid={`edit-day-${jour.value}`}
                        />
                        <span>{jour.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <Label style={{marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    🎯 Compétences requises
                  </Label>
                  
                  {competences.length > 0 ? (
                    <div className="competences-grid-modern">
                      {competences.map(comp => {
                        const isSelected = editForm.competences_requises.includes(comp.id);
                        return (
                          <div
                            key={comp.id}
                            className={`competence-card-modern ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleEditCompetenceChange(comp.id)}
                            data-testid={`edit-competence-${comp.id}`}
                          >
                            <div className="competence-icon">
                              {isSelected ? '✓' : '○'}
                            </div>
                            <div className="competence-info">
                              <span className="competence-nom">{comp.nom}</span>
                              {comp.description && (
                                <span className="competence-desc">{comp.description}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state-card">
                      <span className="empty-icon">📋</span>
                      <p>Aucune compétence disponible</p>
                      <small>Créez d'abord des compétences dans l'onglet Compétences</small>
                    </div>
                  )}
                  
                  {editForm.competences_requises.length > 0 && (
                    <div className="competences-selected-summary">
                      <strong>{editForm.competences_requises.length}</strong> compétence(s) sélectionnée(s)
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label className="setting-checkbox-modern">
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={editForm.officier_obligatoire}
                        onChange={(e) => setEditForm({...editForm, officier_obligatoire: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                    </div>
                    <div className="checkbox-content">
                      <span className="checkbox-title">👮 Officier obligatoire</span>
                      <span className="checkbox-description">Cette garde nécessite la présence d'un officier qualifié</span>
                    </div>
                  </label>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editForm.est_garde_externe}
                      onChange={(e) => setEditForm({...editForm, est_garde_externe: e.target.checked})}
                      data-testid="edit-garde-externe-checkbox"
                    />
                    <span>Garde Externe (astreinte à domicile)</span>
                  </label>
                </div>

                {editForm.est_garde_externe && (
                  <div className="form-field">
                    <Label>Taux horaire externe ($/h)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editForm.taux_horaire_externe || ''}
                      onChange={(e) => setEditForm({...editForm, taux_horaire_externe: e.target.value ? parseFloat(e.target.value) : null})}
                      placeholder="Ex: 25.00"
                      data-testid="edit-taux-horaire-externe-input"
                    />
                    <small className="text-muted">Pour les futures payes automatiques</small>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditTypeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateType} data-testid="save-changes-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition compétence */}
      {showEditFormationModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditFormationModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-competence-modal">
            <div className="modal-header">
              <h3>Modifier la compétence: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditFormationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom de la compétence *</Label>
                  <Input
                    value={editFormation.nom}
                    onChange={(e) => setEditFormation({...editFormation, nom: e.target.value})}
                    data-testid="edit-competence-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Description de la compétence</Label>
                  <textarea
                    value={editFormation.description}
                    onChange={(e) => setEditFormation({...editFormation, description: e.target.value})}
                    className="form-textarea"
                    rows="3"
                    placeholder="Décrivez cette compétence et ses exigences..."
                    data-testid="edit-competence-description"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Durée de formation requise (heures)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editFormation.duree_heures}
                      onChange={(e) => setEditFormation({...editFormation, duree_heures: parseInt(e.target.value)})}
                      data-testid="edit-competence-duree"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Renouvellement de la compétence</Label>
                    <select
                      value={editFormation.validite_mois}
                      onChange={(e) => setEditFormation({...editFormation, validite_mois: parseInt(e.target.value)})}
                      className="form-select"
                      data-testid="edit-competence-validite"
                    >
                      <option value="0">Pas de renouvellement</option>
                      <option value="6">6 mois</option>
                      <option value="12">12 mois</option>
                      <option value="24">24 mois</option>
                      <option value="36">36 mois</option>
                      <option value="60">60 mois</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editFormation.obligatoire}
                      onChange={(e) => setEditFormation({...editFormation, obligatoire: e.target.checked})}
                    />
                    <span>Compétence obligatoire pour tous les pompiers</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditFormationModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateCompetence} data-testid="save-competence-btn">
                  Sauvegarder la compétence
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de grade */}
      {showCreateGradeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="create-grade-modal">
            <div className="modal-header">
              <h3>Nouveau grade</h3>
              <Button variant="ghost" onClick={() => setShowCreateGradeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du grade *</Label>
                  <Input
                    value={newGrade.nom}
                    onChange={(e) => setNewGrade({...newGrade, nom: e.target.value})}
                    placeholder="Ex: Sergent, Chef de bataillon..."
                    data-testid="new-grade-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Niveau hiérarchique *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={newGrade.niveau_hierarchique}
                    onChange={(e) => setNewGrade({...newGrade, niveau_hierarchique: parseInt(e.target.value) || 1})}
                    data-testid="new-grade-niveau"
                  />
                  <small>1 = niveau le plus bas, 10 = niveau le plus haut</small>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={newGrade.est_officier}
                      onChange={(e) => setNewGrade({...newGrade, est_officier: e.target.checked})}
                      data-testid="new-grade-est-officier"
                    />
                    <span>👮 Est un grade d'officier</span>
                  </label>
                  <small className="text-muted">Les grades d'officiers incluent Capitaine, Lieutenant, Directeur, Chef de division, etc.</small>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateGradeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateGrade} data-testid="create-grade-submit-btn">
                  Créer le grade
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'édition de grade */}
      {showEditGradeModal && editingItem && (
        <div className="modal-overlay" onClick={() => setShowEditGradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="edit-grade-modal">
            <div className="modal-header">
              <h3>Modifier le grade: {editingItem.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditGradeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du grade *</Label>
                  <Input
                    value={editGrade.nom}
                    onChange={(e) => setEditGrade({...editGrade, nom: e.target.value})}
                    data-testid="edit-grade-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Niveau hiérarchique *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={editGrade.niveau_hierarchique}
                    onChange={(e) => setEditGrade({...editGrade, niveau_hierarchique: parseInt(e.target.value) || 1})}
                    data-testid="edit-grade-niveau"
                  />
                  <small>1 = niveau le plus bas, 10 = niveau le plus haut</small>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={editGrade.est_officier}
                      onChange={(e) => setEditGrade({...editGrade, est_officier: e.target.checked})}
                      data-testid="edit-grade-est-officier"
                    />
                    <span>👮 Est un grade d'officier</span>
                  </label>
                  <small className="text-muted">Les grades d'officiers incluent Capitaine, Lieutenant, Directeur, Chef de division, etc.</small>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditGradeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateGrade} data-testid="save-grade-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création d'utilisateur */}
      {showCreateUserModal && (
        <div className="modal-overlay" onClick={() => setShowCreateUserModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-user-modal">
            <div className="modal-header">
              <h3>Nouveau compte d'accès</h3>
              <Button variant="ghost" onClick={() => setShowCreateUserModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-row">
                  <div className="form-field">
                    <Label>Prénom *</Label>
                    <Input
                      value={newUser.prenom}
                      onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                      data-testid="new-user-prenom"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Nom *</Label>
                    <Input
                      value={newUser.nom}
                      onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                      data-testid="new-user-nom"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    data-testid="new-user-email"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Grade</Label>
                    <select
                      value={newUser.grade}
                      onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                      className="form-select"
                      data-testid="new-user-grade"
                    >
                      {grades.map(grade => (
                        <option key={grade.id} value={grade.nom}>{grade.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <Label>Rôle *</Label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      className="form-select"
                      data-testid="new-user-role"
                    >
                      <option value="employe">👤 Employé</option>
                      <option value="superviseur">🎖️ Superviseur</option>
                      <option value="admin">👑 Administrateur</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <Label>Type d'emploi</Label>
                  <select
                    value={newUser.type_emploi}
                    onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value})}
                    className="form-select"
                    data-testid="new-user-employment"
                  >
                    <option value="temps_plein">Temps plein</option>
                    <option value="temps_partiel">Temps partiel</option>
                  </select>
                </div>

                <div className="form-field">
                  <Label>Mot de passe temporaire *</Label>
                  <div style={{position: 'relative'}}>
                    <Input
                      type={showPasswordComptes ? "text" : "password"}
                      value={newUser.mot_de_passe}
                      onChange={(e) => setNewUser({...newUser, mot_de_passe: e.target.value})}
                      data-testid="new-user-password"
                      placeholder="Minimum 8 caractères complexes"
                      style={{paddingRight: '40px'}}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordComptes(!showPasswordComptes)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.2rem'
                      }}
                    >
                      {showPasswordComptes ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                  <div className="password-requirements">
                    <small className="requirement-title">Exigences du mot de passe :</small>
                    <div className="requirements-list">
                      <span className={`requirement ${newUser.mot_de_passe.length >= 8 ? 'valid' : 'invalid'}`}>
                        {newUser.mot_de_passe.length >= 8 ? '✅' : '❌'} 8 caractères minimum
                      </span>
                      <span className={`requirement ${/[A-Z]/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/[A-Z]/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 majuscule
                      </span>
                      <span className={`requirement ${/\d/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/\d/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 chiffre
                      </span>
                      <span className={`requirement ${/[!@#$%^&*+\-?()]/.test(newUser.mot_de_passe) ? 'valid' : 'invalid'}`}>
                        {/[!@#$%^&*+\-?()]/.test(newUser.mot_de_passe) ? '✅' : '❌'} 1 caractère spécial (!@#$%^&*+-?())
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateUserModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateUser} data-testid="create-account-btn">
                  Créer le compte
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de type de garde */}
      {showCreateTypeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateTypeModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-type-modal">
            <div className="modal-header">
              <h3>Nouveau type de garde</h3>
              <Button variant="ghost" onClick={() => setShowCreateTypeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom du type de garde *</Label>
                  <Input
                    value={createForm.nom}
                    onChange={(e) => setCreateForm({...createForm, nom: e.target.value})}
                    placeholder="Ex: Garde Interne Nuit"
                    data-testid="create-nom-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Heure de début *</Label>
                    <Input
                      type="time"
                      value={createForm.heure_debut}
                      onChange={(e) => setCreateForm({...createForm, heure_debut: e.target.value})}
                      data-testid="create-debut-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Heure de fin *</Label>
                    <Input
                      type="time"
                      value={createForm.heure_fin}
                      onChange={(e) => setCreateForm({...createForm, heure_fin: e.target.value})}
                      data-testid="create-fin-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Personnel requis</Label>
                    <Input
                      type="number"
                      min="1"
                      value={createForm.personnel_requis}
                      onChange={(e) => setCreateForm({...createForm, personnel_requis: parseInt(e.target.value)})}
                      data-testid="create-personnel-input"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Couleur</Label>
                    <Input
                      type="color"
                      value={createForm.couleur}
                      onChange={(e) => setCreateForm({...createForm, couleur: e.target.value})}
                      data-testid="create-couleur-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Jours d'application (récurrence)</Label>
                  <div className="days-selection">
                    {joursOptions.map(jour => (
                      <label key={jour.value} className="day-checkbox">
                        <input
                          type="checkbox"
                          checked={createForm.jours_application.includes(jour.value)}
                          onChange={() => handleCreateJourChange(jour.value)}
                          data-testid={`create-day-${jour.value}`}
                        />
                        <span>{jour.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-field">
                  <Label style={{marginBottom: '0.5rem', fontSize: '0.95rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                    🎯 Compétences requises
                  </Label>
                  
                  {competences.length > 0 ? (
                    <div className="competences-grid-modern">
                      {competences.map(comp => {
                        const isSelected = createForm.competences_requises.includes(comp.id);
                        return (
                          <div
                            key={comp.id}
                            className={`competence-card-modern ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleCreateCompetenceChange(comp.id)}
                            data-testid={`create-competence-${comp.id}`}
                          >
                            <div className="competence-icon">
                              {isSelected ? '✓' : '○'}
                            </div>
                            <div className="competence-info">
                              <span className="competence-nom">{comp.nom}</span>
                              {comp.description && (
                                <span className="competence-desc">{comp.description}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty-state-card">
                      <span className="empty-icon">📋</span>
                      <p>Aucune compétence disponible</p>
                      <small>Créez d'abord des compétences dans l'onglet Compétences</small>
                    </div>
                  )}
                  
                  {createForm.competences_requises.length > 0 && (
                    <div className="competences-selected-summary">
                      <strong>{createForm.competences_requises.length}</strong> compétence(s) sélectionnée(s)
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label className="setting-checkbox-modern">
                    <div className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={createForm.officier_obligatoire}
                        onChange={(e) => setCreateForm({...createForm, officier_obligatoire: e.target.checked})}
                      />
                      <span className="checkbox-custom"></span>
                    </div>
                    <div className="checkbox-content">
                      <span className="checkbox-title">👮 Officier obligatoire</span>
                      <span className="checkbox-description">Cette garde nécessite la présence d'un officier qualifié</span>
                    </div>
                  </label>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={createForm.est_garde_externe}
                      onChange={(e) => setCreateForm({...createForm, est_garde_externe: e.target.checked})}
                      data-testid="create-garde-externe-checkbox"
                    />
                    <span>Garde Externe (astreinte à domicile)</span>
                  </label>
                </div>

                {createForm.est_garde_externe && (
                  <div className="form-field">
                    <Label>Taux horaire externe ($/h)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={createForm.taux_horaire_externe || ''}
                      onChange={(e) => setCreateForm({...createForm, taux_horaire_externe: e.target.value ? parseFloat(e.target.value) : null})}
                      placeholder="Ex: 25.00"
                      data-testid="create-taux-horaire-externe-input"
                    />
                    <small className="text-muted">Pour les futures payes automatiques</small>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateTypeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateType} data-testid="create-type-btn">
                  Créer le type de garde
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de création de compétence */}
      {showCreateFormationModal && (
        <div className="modal-overlay" onClick={() => setShowCreateFormationModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-competence-modal">
            <div className="modal-header">
              <h3>Nouvelle compétence</h3>
              <Button variant="ghost" onClick={() => setShowCreateFormationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Nom de la compétence *</Label>
                  <Input
                    value={newFormation.nom}
                    onChange={(e) => setNewFormation({...newFormation, nom: e.target.value})}
                    placeholder="Ex: Conduite d'échelle, Sauvetage aquatique"
                    data-testid="create-competence-nom"
                  />
                </div>

                <div className="form-field">
                  <Label>Description de la compétence</Label>
                  <textarea
                    value={newFormation.description}
                    onChange={(e) => setNewFormation({...newFormation, description: e.target.value})}
                    placeholder="Décrivez cette compétence, les exigences et les critères d'évaluation..."
                    rows="3"
                    className="form-textarea"
                    data-testid="create-competence-description"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Durée de formation requise (heures)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newFormation.duree_heures}
                      onChange={(e) => setNewFormation({...newFormation, duree_heures: parseInt(e.target.value)})}
                      data-testid="create-competence-duree"
                    />
                  </div>
                  <div className="form-field">
                    <Label>Renouvellement de la compétence</Label>
                    <select
                      value={newFormation.validite_mois}
                      onChange={(e) => setNewFormation({...newFormation, validite_mois: parseInt(e.target.value)})}
                      className="form-select"
                      data-testid="create-competence-validite"
                    >
                      <option value="0">Pas de renouvellement</option>
                      <option value="6">6 mois</option>
                      <option value="12">12 mois</option>
                      <option value="24">24 mois</option>
                      <option value="36">36 mois</option>
                      <option value="60">60 mois</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label className="setting-checkbox">
                    <input
                      type="checkbox"
                      checked={newFormation.obligatoire}
                      onChange={(e) => setNewFormation({...newFormation, obligatoire: e.target.checked})}
                    />
                    <span>Compétence obligatoire pour tous les pompiers</span>
                  </label>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateFormationModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateCompetence} data-testid="create-competence-submit-btn">
                  Créer la compétence
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de modification d'accès utilisateur */}
      {showEditAccessModal && editingUser && (
        <div className="modal-overlay" onClick={() => setShowEditAccessModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="edit-access-modal">
            <div className="modal-header">
              <h3>Modifier l'accès - {editingUser.prenom} {editingUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditAccessModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="current-user-info">
                <div className="user-summary">
                  <div className="user-avatar">
                    <span className="avatar-icon">👤</span>
                  </div>
                  <div className="user-details">
                    <h4>{editingUser.prenom} {editingUser.nom}</h4>
                    <p>{editingUser.email}</p>
                    <p>Grade: {editingUser.grade} | {editingUser.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</p>
                  </div>
                </div>
              </div>

              <div className="access-form">
                <div className="form-field">
                  <Label>Rôle/Autorisation</Label>
                  <select
                    value={userAccess.role}
                    onChange={(e) => setUserAccess({...userAccess, role: e.target.value})}
                    className="form-select"
                    data-testid="edit-user-role-select"
                  >
                    <option value="employe">👤 Employé</option>
                    <option value="superviseur">🎖️ Superviseur</option>
                    <option value="admin">👑 Administrateur</option>
                  </select>
                  <small className="field-description">
                    Détermine les modules et fonctionnalités accessibles
                  </small>
                </div>

                <div className="form-field">
                  <Label>Statut du compte</Label>
                  <select
                    value={userAccess.statut}
                    onChange={(e) => setUserAccess({...userAccess, statut: e.target.value})}
                    className="form-select"
                    data-testid="edit-user-status-select"
                  >
                    <option value="Actif">✅ Actif - Peut se connecter</option>
                    <option value="Inactif">❌ Inactif - Connexion bloquée</option>
                  </select>
                  <small className="field-description">
                    Un compte inactif ne peut plus se connecter temporairement
                  </small>
                </div>

                <div className="permissions-preview">
                  <h4>Aperçu des permissions :</h4>
                  <div className="permissions-list">
                    {userAccess.role === 'admin' && (
                      <div className="permission-group">
                        <span className="permission-title">👑 Administrateur</span>
                        <ul>
                          <li>Accès complet à tous les modules</li>
                          <li>Gestion du personnel et création de comptes</li>
                          <li>Configuration système et paramètres</li>
                        </ul>
                      </div>
                    )}
                    {userAccess.role === 'superviseur' && (
                      <div className="permission-group">
                        <span className="permission-title">🎖️ Superviseur</span>
                        <ul>
                          <li>Gestion du personnel (consultation)</li>
                          <li>Validation du planning et remplacements</li>
                          <li>Accès aux formations</li>
                        </ul>
                      </div>
                    )}
                    {userAccess.role === 'employe' && (
                      <div className="permission-group">
                        <span className="permission-title">👤 Employé</span>
                        <ul>
                          <li>Consultation du planning personnel</li>
                          <li>Demandes de remplacement</li>
                          <li>Gestion des disponibilités</li>
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditAccessModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleUpdateAccess} data-testid="save-access-btn">
                  Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des EPI individuels sera dans le module Personnel */}
    </div>
  );
  );
};

export default ParametresPersonnalisation;
