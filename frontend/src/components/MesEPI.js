import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';

const MesEPI = ({ user }) => {
  const [epis, setEpis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEPI, setSelectedEPI] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showHistoriqueModal, setShowHistoriqueModal] = useState(false);
  const [showRemplacementModal, setShowRemplacementModal] = useState(false);
  const [historique, setHistorique] = useState([]);
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  const [inspectionForm, setInspectionForm] = useState({
    statut_inspection: 'ok',
    defauts_constates: '',
    notes: '',
    photo_url: ''
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const [remplacementForm, setRemplacementForm] = useState({
    raison: 'Usure normale',
    details: ''
  });

  const raisonsRemplacement = [
    'Usure normale',
    'Défaut',
    'Perte',
    'Taille inadaptée'
  ];

  useEffect(() => {
    loadEPIs();
  }, []);

  const loadEPIs = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/mes-epi');
      setEpis(data || []);
    } catch (error) {
      console.error('Erreur chargement EPIs:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger vos EPIs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHistorique = async (epiId) => {
    try {
      const data = await apiGet(tenantSlug, `/mes-epi/${epiId}/historique`);
      setHistorique(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'historique",
        variant: "destructive"
      });
    }
  };

  const handleInspection = async () => {
    if (!selectedEPI) return;

    try {
      // Si une photo a été sélectionnée, la convertir en base64
      let photoData = inspectionForm.photo_url;
      
      if (photoFile) {
        const reader = new FileReader();
        photoData = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(photoFile);
        });
      }

      await apiPost(tenantSlug, `/mes-epi/${selectedEPI.id}/inspection`, {
        ...inspectionForm,
        photo_url: photoData
      });
      
      toast({
        title: "Succès",
        description: inspectionForm.statut_inspection === 'ok' 
          ? "Inspection enregistrée avec succès" 
          : "Défaut signalé. Un administrateur sera notifié.",
      });

      setShowInspectionModal(false);
      setInspectionForm({
        statut_inspection: 'ok',
        defauts_constates: '',
        notes: '',
        photo_url: ''
      });
      setPhotoFile(null);
      setPhotoPreview(null);
      loadEPIs();
    } catch (error) {
      console.error('Erreur lors de l\'inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer l'inspection",
        variant: "destructive"
      });
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Vérifier la taille du fichier (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Erreur",
          description: "La photo ne doit pas dépasser 5 MB",
          variant: "destructive"
        });
        return;
      }

      setPhotoFile(file);
      
      // Créer une preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setInspectionForm({...inspectionForm, photo_url: ''});
  };

  const handleDemandeRemplacement = async () => {
    if (!selectedEPI) return;

    try {
      await apiPost(tenantSlug, `/mes-epi/${selectedEPI.id}/demander-remplacement`, remplacementForm);
      
      toast({
        title: "Succès",
        description: "Demande de remplacement envoyée. Un administrateur traitera votre demande.",
      });

      setShowRemplacementModal(false);
      setRemplacementForm({
        raison: 'Usure normale',
        details: ''
      });
      loadEPIs();
    } catch (error) {
      console.error('Erreur lors de la demande:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer la demande de remplacement",
        variant: "destructive"
      });
    }
  };

  const openInspectionModal = (epi) => {
    setSelectedEPI(epi);
    setInspectionForm({
      statut_inspection: 'ok',
      defauts_constates: '',
      notes: '',
      photo_url: ''
    });
    setPhotoFile(null);
    setPhotoPreview(null);
    setShowInspectionModal(true);
  };

  const openHistoriqueModal = async (epi) => {
    setSelectedEPI(epi);
    await loadHistorique(epi.id);
    setShowHistoriqueModal(true);
  };

  const openRemplacementModal = (epi) => {
    setSelectedEPI(epi);
    setShowRemplacementModal(true);
  };

  const getStatutBadge = (statut) => {
    const badges = {
      'En service': { class: 'badge-success', icon: '✅' },
      'En inspection': { class: 'badge-warning', icon: '🔍' },
      'En maintenance': { class: 'badge-info', icon: '🔧' },
      'Retiré': { class: 'badge-danger', icon: '🚫' },
      'À vérifier': { class: 'badge-warning', icon: '⚠️' }
    };
    const badge = badges[statut] || { class: 'badge-default', icon: '📦' };
    return (
      <span className={`badge ${badge.class}`}>
        {badge.icon} {statut}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="mes-epi-container">
        <div className="loading">Chargement de vos EPIs...</div>
      </div>
    );
  }

  return (
    <div className="mes-epi-container">
      <div className="mes-epi-header">
        <h1>🛡️ Mes EPI</h1>
        <p>Consultez vos équipements de protection individuelle, effectuez des inspections et signalez les défauts</p>
      </div>

      {epis.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-gray-500">Aucun EPI ne vous est assigné pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="epi-grid">
          {epis.map((epi) => (
            <Card key={epi.id} className="epi-card">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{epi.type_epi || 'EPI'}</span>
                  {getStatutBadge(epi.statut)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="epi-details">
                  {epi.marque && (
                    <div className="epi-detail-item">
                      <strong>Marque:</strong> {epi.marque}
                    </div>
                  )}
                  {epi.modele && (
                    <div className="epi-detail-item">
                      <strong>Modèle:</strong> {epi.modele}
                    </div>
                  )}
                  {epi.taille && (
                    <div className="epi-detail-item">
                      <strong>Taille:</strong> {epi.taille}
                    </div>
                  )}
                  {epi.numero_serie && (
                    <div className="epi-detail-item">
                      <strong>N° Série:</strong> {epi.numero_serie}
                    </div>
                  )}
                  {epi.date_mise_en_service && (
                    <div className="epi-detail-item">
                      <strong>Mise en service:</strong> {new Date(epi.date_mise_en_service).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                  {epi.prochaine_inspection && (
                    <div className="epi-detail-item">
                      <strong>Prochaine inspection:</strong> {new Date(epi.prochaine_inspection).toLocaleDateString('fr-FR')}
                    </div>
                  )}
                </div>

                <div className="epi-actions">
                  <Button 
                    onClick={() => openInspectionModal(epi)}
                    className="btn-primary"
                    disabled={epi.statut === 'Retiré'}
                  >
                    📋 Inspection
                  </Button>
                  <Button 
                    onClick={() => openHistoriqueModal(epi)}
                    className="btn-secondary"
                  >
                    📜 Historique
                  </Button>
                  <Button 
                    onClick={() => openRemplacementModal(epi)}
                    className="btn-warning"
                    disabled={epi.statut === 'Retiré'}
                  >
                    🔄 Demander remplacement
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Inspection */}
      {showInspectionModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowInspectionModal(false)}>
          <div className="modal-content inspection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Inspection après usage</h3>
              <button className="modal-close" onClick={() => setShowInspectionModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {/* EPI Info Card */}
              <div className="epi-info-card">
                <div className="epi-info-icon">🛡️</div>
                <div className="epi-info-details">
                  <h4>{selectedEPI.type_epi}</h4>
                  <p>{selectedEPI.marque} {selectedEPI.modele}</p>
                  <span className="epi-serial">N° {selectedEPI.numero_serie}</span>
                </div>
              </div>

              {/* État de l'EPI */}
              <div className="form-group">
                <Label className="form-label-bold">État de l'EPI après utilisation *</Label>
                <div className="status-cards">
                  <div 
                    className={`status-card ${inspectionForm.statut_inspection === 'ok' ? 'active' : ''}`}
                    onClick={() => setInspectionForm({...inspectionForm, statut_inspection: 'ok'})}
                  >
                    <div className="status-icon ok">✓</div>
                    <div className="status-text">
                      <strong>Conforme</strong>
                      <span>Aucun problème détecté</span>
                    </div>
                  </div>
                  
                  <div 
                    className={`status-card ${inspectionForm.statut_inspection === 'defaut' ? 'active' : ''}`}
                    onClick={() => setInspectionForm({...inspectionForm, statut_inspection: 'defaut'})}
                  >
                    <div className="status-icon defaut">⚠</div>
                    <div className="status-text">
                      <strong>Défaut constaté</strong>
                      <span>Nécessite une vérification</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Défauts constatés (si défaut) */}
              {inspectionForm.statut_inspection === 'defaut' && (
                <div className="form-group defaut-section">
                  <Label className="form-label-bold">Défauts constatés *</Label>
                  <textarea
                    value={inspectionForm.defauts_constates}
                    onChange={(e) => setInspectionForm({...inspectionForm, defauts_constates: e.target.value})}
                    placeholder="Décrivez précisément les défauts observés (déchirure, usure, casse, etc.)..."
                    rows="3"
                    className="form-control"
                  />
                </div>
              )}

              {/* Notes complémentaires */}
              <div className="form-group">
                <Label className="form-label-bold">Notes complémentaires</Label>
                <textarea
                  value={inspectionForm.notes}
                  onChange={(e) => setInspectionForm({...inspectionForm, notes: e.target.value})}
                  placeholder="Ajoutez des notes si nécessaire (optionnel)..."
                  rows="2"
                  className="form-control"
                />
              </div>

              {/* Photo */}
              <div className="form-group">
                <Label className="form-label-bold">Ajouter une photo</Label>
                
                {!photoPreview ? (
                  <div className="photo-upload-zone">
                    <input
                      type="file"
                      id="photo-input"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      className="photo-input-hidden"
                    />
                    <label htmlFor="photo-input" className="photo-upload-label">
                      <div className="photo-upload-icon">📷</div>
                      <div className="photo-upload-text">
                        <strong>Prendre ou choisir une photo</strong>
                        <span>Appuyez pour capturer ou sélectionner (max 5 MB)</span>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="photo-preview-container">
                    <img src={photoPreview} alt="Preview" className="photo-preview" />
                    <button className="photo-remove" onClick={removePhoto} type="button">
                      ✕ Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <Button onClick={() => setShowInspectionModal(false)} className="btn-secondary">
                Annuler
              </Button>
              <Button 
                onClick={handleInspection}
                className="btn-primary"
                disabled={inspectionForm.statut_inspection === 'defaut' && !inspectionForm.defauts_constates}
              >
                ✓ Enregistrer l'inspection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historique */}
      {showHistoriqueModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowHistoriqueModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 Historique des inspections</h3>
              <button className="modal-close" onClick={() => setShowHistoriqueModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="mb-4">
                <strong>EPI:</strong> {selectedEPI.type_epi} - {selectedEPI.numero_serie}
              </p>

              {historique.length === 0 ? (
                <p className="text-center text-gray-500">Aucune inspection enregistrée</p>
              ) : (
                <div className="historique-list">
                  {historique.map((inspection, index) => (
                    <div key={index} className="historique-item">
                      <div className="historique-header">
                        <span className="historique-date">
                          📅 {new Date(inspection.date_inspection).toLocaleDateString('fr-FR')} à {new Date(inspection.date_inspection).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`badge ${inspection.statut_inspection === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                          {inspection.statut_inspection === 'ok' ? '✅ OK' : '⚠️ Défaut'}
                        </span>
                      </div>
                      {inspection.defauts_constates && (
                        <div className="historique-defauts">
                          <strong>Défauts:</strong> {inspection.defauts_constates}
                        </div>
                      )}
                      {inspection.notes && (
                        <div className="historique-notes">
                          <strong>Notes:</strong> {inspection.notes}
                        </div>
                      )}
                      {inspection.photo_url && (
                        <div className="historique-photo">
                          <a href={inspection.photo_url} target="_blank" rel="noopener noreferrer">
                            📷 Voir la photo
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <Button onClick={() => setShowHistoriqueModal(false)} className="btn-secondary">
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Demande de Remplacement */}
      {showRemplacementModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowRemplacementModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔄 Demande de remplacement</h3>
              <button className="modal-close" onClick={() => setShowRemplacementModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p className="mb-4">
                <strong>EPI:</strong> {selectedEPI.type_epi} - {selectedEPI.numero_serie}
              </p>

              <div className="form-group">
                <Label>Raison du remplacement *</Label>
                <select
                  value={remplacementForm.raison}
                  onChange={(e) => setRemplacementForm({...remplacementForm, raison: e.target.value})}
                  className="form-control"
                >
                  {raisonsRemplacement.map((raison) => (
                    <option key={raison} value={raison}>{raison}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <Label>Détails complémentaires</Label>
                <textarea
                  value={remplacementForm.details}
                  onChange={(e) => setRemplacementForm({...remplacementForm, details: e.target.value})}
                  placeholder="Ajoutez des détails pour justifier votre demande..."
                  rows="4"
                  className="form-control"
                />
              </div>

              <div className="alert alert-info">
                ℹ️ Votre demande sera examinée par un administrateur. Vous serez notifié de la décision.
              </div>
            </div>
            <div className="modal-footer">
              <Button onClick={() => setShowRemplacementModal(false)} className="btn-secondary">
                Annuler
              </Button>
              <Button onClick={handleDemandeRemplacement} className="btn-primary">
                Envoyer la demande
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MesEPI;
