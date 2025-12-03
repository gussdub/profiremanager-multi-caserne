import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import SignatureCanvas from 'react-signature-canvas';
import { useTenant } from '../contexts/TenantContext';
import { apiPost } from '../utils/api';

const RondeSecurite = ({ vehicule, onClose, onSuccess }) => {
  const { tenantSlug } = useTenant();
  const signatureInspecteurRef = useRef(null);
  const signatureConducteurRef = useRef(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    heure: new Date().toTimeString().slice(0, 5),
    lieu: '',
    position_gps: null,
    km: '',
    personne_mandatee: '',
    defectuosites: '',
    points_verification: {
      attelage: 'conforme',
      chassis_carrosserie: 'conforme',
      chauffage_degivrage: 'conforme',
      commandes_conducteur_sirene: 'conforme',
      direction: 'conforme',
      essuie_glaces_lave_glace: 'conforme',
      materiel_urgence: 'conforme',
      phares_feux_gyrophares: 'conforme',
      pneus: 'conforme',
      portieres_autres_issues: 'conforme',
      retroviseurs_vitrage: 'conforme',
      roues_moyeux_fixation: 'conforme',
      siege: 'conforme',
      suspension: 'conforme',
      systeme_alimentation_carburant: 'conforme',
      systeme_echappement: 'conforme',
      systeme_freins_hydrauliques: 'conforme',
      systeme_freins_pneumatiques: 'conforme'
    }
  });

  const [saving, setSaving] = useState(false);

  const pointsVerification = [
    { key: 'attelage', label: '1 - Attelage' },
    { key: 'chassis_carrosserie', label: '2 - Châssis et carrosserie' },
    { key: 'chauffage_degivrage', label: '3 - Chauffage et dégivrage' },
    { key: 'commandes_conducteur_sirene', label: '4 - Commandes du conducteur et sirène' },
    { key: 'direction', label: '5 - Direction' },
    { key: 'essuie_glaces_lave_glace', label: '6 - Essuie-glaces /lave-glace' },
    { key: 'materiel_urgence', label: '7 - Matériel d\'urgence' },
    { key: 'phares_feux_gyrophares', label: '8 - Phares, feux et gyrophares' },
    { key: 'pneus', label: '9 - Pneus' },
    { key: 'portieres_autres_issues', label: '10 - Portières et autres issues' },
    { key: 'retroviseurs_vitrage', label: '11 - Rétroviseurs/Vitrage' },
    { key: 'roues_moyeux_fixation', label: '12 - Roues, Moyeux et pièces de fixation' },
    { key: 'siege', label: '13 - Siège' },
    { key: 'suspension', label: '14 - Suspension' },
    { key: 'systeme_alimentation_carburant', label: '15 - Système d\'alimentation en carburant' },
    { key: 'systeme_echappement', label: '16 - Système d\'échappement' },
    { key: 'systeme_freins_hydrauliques', label: '18 - Système de freins hydrauliques' },
    { key: 'systeme_freins_pneumatiques', label: '19 - Système de freins pneumatiques' }
  ];

  const handlePointChange = (key, value) => {
    setFormData({
      ...formData,
      points_verification: {
        ...formData.points_verification,
        [key]: value
      }
    });
  };

  const clearSignature = (ref) => {
    if (ref.current) {
      ref.current.clear();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.lieu || !formData.km) {
      alert('⚠️ Veuillez remplir le lieu et le kilométrage');
      return;
    }

    if (!formData.nom_conducteur || !formData.prenom_conducteur) {
      alert('⚠️ Veuillez renseigner le nom du conducteur');
      return;
    }

    const signatureInspecteur = signatureInspecteurRef.current?.toDataURL();
    const signatureConducteur = signatureConducteurRef.current?.toDataURL();

    if (!signatureInspecteur || signatureInspecteurRef.current?.isEmpty()) {
      alert('⚠️ La signature de l\'inspecteur est requise');
      return;
    }

    if (!signatureConducteur || signatureConducteurRef.current?.isEmpty()) {
      alert('⚠️ La signature du conducteur est requise');
      return;
    }

    setSaving(true);

    try {
      const rondeData = {
        vehicule_id: vehicule.id,
        date: formData.date,
        heure: formData.heure,
        lieu: formData.lieu,
        km: parseInt(formData.km),
        nom_conducteur: formData.nom_conducteur,
        prenom_conducteur: formData.prenom_conducteur,
        defectuosites: formData.defectuosites,
        points_verification: formData.points_verification,
        signature_inspecteur: signatureInspecteur,
        signature_conducteur: signatureConducteur
      };

      await apiPost(tenantSlug, '/actifs/rondes-securite', rondeData);
      
      alert('✅ Ronde de sécurité enregistrée avec succès');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors de l\'enregistrement: ' + errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const nombreDefectueux = Object.values(formData.points_verification).filter(v => v === 'defectueux').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>🔧 Nouvelle ronde de sécurité - {vehicule.nom}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* Informations du véhicule */}
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px' }}>📋 Informations du véhicule</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                <div><strong>Type:</strong> {vehicule.type_vehicule}</div>
                <div><strong>N° plaque:</strong> {vehicule.nom}</div>
                <div><strong>Marque:</strong> {vehicule.marque}</div>
                <div><strong>Année:</strong> {vehicule.annee}</div>
                <div><strong>VIN:</strong> {vehicule.vin}</div>
              </div>
            </div>

            {/* Informations de la ronde */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Heure *</Label>
                <Input
                  type="time"
                  value={formData.heure}
                  onChange={(e) => setFormData({ ...formData, heure: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Lieu *</Label>
                <Input
                  type="text"
                  value={formData.lieu}
                  onChange={(e) => setFormData({ ...formData, lieu: e.target.value })}
                  placeholder="Ex: Caserne principale"
                  required
                />
              </div>
              <div>
                <Label>KM *</Label>
                <Input
                  type="number"
                  value={formData.km}
                  onChange={(e) => setFormData({ ...formData, km: e.target.value })}
                  placeholder="Kilométrage actuel"
                  required
                />
              </div>
            </div>

            {/* Points de vérification */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '16px' }}>✅ Points de vérification</h3>
              <div style={{ background: '#fff3cd', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontSize: '13px' }}>
                📊 <strong>Résumé:</strong> {19 - nombreDefectueux} conforme(s) • {nombreDefectueux} défectueux
              </div>
              
              <div style={{ display: 'grid', gap: '10px' }}>
                {pointsVerification.map((point) => (
                  <div key={point.key} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px', 
                    background: '#f8f9fa', 
                    borderRadius: '6px',
                    border: formData.points_verification[point.key] === 'defectueux' ? '2px solid #dc3545' : '1px solid #dee2e6'
                  }}>
                    <div style={{ flex: 1, fontWeight: '500', fontSize: '14px' }}>
                      {point.label}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={point.key}
                          value="conforme"
                          checked={formData.points_verification[point.key] === 'conforme'}
                          onChange={() => handlePointChange(point.key, 'conforme')}
                          style={{ marginRight: '5px' }}
                        />
                        <span style={{ color: '#28a745' }}>✅ Conforme</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={point.key}
                          value="defectueux"
                          checked={formData.points_verification[point.key] === 'defectueux'}
                          onChange={() => handlePointChange(point.key, 'defectueux')}
                          style={{ marginRight: '5px' }}
                        />
                        <span style={{ color: '#dc3545' }}>❌ Défectueux</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Défectuosités constatées */}
            <div style={{ marginBottom: '20px' }}>
              <Label>📝 Défectuosités constatées (si applicable)</Label>
              <Textarea
                value={formData.defectuosites}
                onChange={(e) => setFormData({ ...formData, defectuosites: e.target.value })}
                placeholder="Décrivez les défectuosités identifiées..."
                rows={4}
              />
              <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '5px' }}>
                💡 Référence: Voir livre Ronde de sécurité p146 à p150
              </p>
            </div>

            {/* Informations du conducteur */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '10px', fontSize: '16px' }}>👤 Conducteur</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <Label>Nom *</Label>
                  <Input
                    type="text"
                    value={formData.nom_conducteur}
                    onChange={(e) => setFormData({ ...formData, nom_conducteur: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Prénom *</Label>
                  <Input
                    type="text"
                    value={formData.prenom_conducteur}
                    onChange={(e) => setFormData({ ...formData, prenom_conducteur: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <Label>✍️ Signature de l'inspecteur *</Label>
                <div style={{ border: '2px solid #dee2e6', borderRadius: '8px', background: '#fff' }}>
                  <SignatureCanvas
                    ref={signatureInspecteurRef}
                    canvasProps={{
                      width: 400,
                      height: 150,
                      className: 'signature-canvas',
                      style: { width: '100%', height: '150px' }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => clearSignature(signatureInspecteurRef)}
                  style={{ marginTop: '5px', width: '100%' }}
                >
                  🗑️ Effacer
                </Button>
              </div>

              <div>
                <Label>✍️ Signature du conducteur *</Label>
                <div style={{ border: '2px solid #dee2e6', borderRadius: '8px', background: '#fff' }}>
                  <SignatureCanvas
                    ref={signatureConducteurRef}
                    canvasProps={{
                      width: 400,
                      height: 150,
                      className: 'signature-canvas',
                      style: { width: '100%', height: '150px' }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => clearSignature(signatureConducteurRef)}
                  style={{ marginTop: '5px', width: '100%' }}
                >
                  🗑️ Effacer
                </Button>
                <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px', lineHeight: '1.4' }}>
                  Le conducteur a toujours l'opportunité de refaire la vérification complète du véhicule et de remplir lui-même un rapport. J'ai pris connaissance du rapport de la ronde qui a été effectuée.
                </p>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '⏳ Enregistrement...' : '💾 Enregistrer la ronde'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RondeSecurite;
