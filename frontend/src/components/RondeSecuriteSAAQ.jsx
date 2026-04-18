import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import SignatureCanvas from 'react-signature-canvas';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';

/**
 * Composant de Ronde de Sécurité SAAQ (Loi 430)
 * 
 * Fonctionnalités:
 * - Points de vérification avec défauts prédéfinis SAAQ
 * - Filtrage points 18/19 selon type de freins du véhicule
 * - Gestion sévérité MAJEUR/MINEUR
 * - Bandeau d'alerte HORS SERVICE / RÉPARATION REQUISE
 */
const RondeSecuriteSAAQ = ({ vehicule, user, onClose, onSuccess }) => {
  const { tenantSlug } = useTenant();
  const signatureMandateeRef = useRef(null);

  // États
  const [pointsVerification, setPointsVerification] = useState({});
  const [brakeSystemType, setBrakeSystemType] = useState(vehicule?.brake_system_type || 'BOTH');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);

  // Fonctions helper pour les dates
  const getLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getLocalTime = () => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const [formData, setFormData] = useState({
    date: getLocalDate(),
    heure: getLocalTime(),
    lieu: '',
    position_gps: null,
    km: vehicule?.kilometrage || '',
    personne_mandatee: user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '',
    defectuosites: ''
  });

  // État des points (conforme/non-conforme) et défauts sélectionnés
  const [pointsStatus, setPointsStatus] = useState({});
  const [defautsSelectionnes, setDefautsSelectionnes] = useState([]);

  // Calculer la sévérité globale
  const severiteGlobale = React.useMemo(() => {
    const hasMajeur = defautsSelectionnes.some(d => d.severity === 'MAJEUR');
    const hasMineur = defautsSelectionnes.some(d => d.severity === 'MINEUR');
    
    if (hasMajeur) return 'MAJEUR';
    if (hasMineur) return 'MINEUR';
    return 'CONFORME';
  }, [defautsSelectionnes]);

  // Charger les points de vérification SAAQ
  useEffect(() => {
    const loadPointsVerification = async () => {
      try {
        setLoading(true);
        const response = await apiGet(tenantSlug, `/actifs/rondes-securite/points-verification?vehicule_id=${vehicule.id}`);
        setPointsVerification(response.points_verification || {});
        setBrakeSystemType(response.brake_system_type || 'BOTH');
        
        // Initialiser tous les points comme "conforme"
        const initialStatus = {};
        Object.keys(response.points_verification || {}).forEach(pointId => {
          initialStatus[pointId] = 'conforme';
        });
        setPointsStatus(initialStatus);
      } catch (error) {
        console.error('Erreur chargement points SAAQ:', error);
        // Fallback: utiliser les points par défaut
      } finally {
        setLoading(false);
      }
    };

    loadPointsVerification();
  }, [tenantSlug, vehicule.id]);

  // Reverse geocoding pour l'adresse
  const reverseGeocode = async (latitude, longitude) => {
    try {
      setAddressLoading(true);
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'fr',
            'User-Agent': 'ProFireManager/1.0'
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur reverse geocoding');
      
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        let addressParts = [];
        
        if (addr.house_number && addr.road) {
          addressParts.push(`${addr.house_number} ${addr.road}`);
        } else if (addr.road) {
          addressParts.push(addr.road);
        }
        
        const city = addr.city || addr.town || addr.village || addr.municipality;
        if (city) addressParts.push(city);
        if (addr.state) addressParts.push(addr.state);
        
        return addressParts.join(', ') || data.display_name;
      }
      
      return null;
    } catch (error) {
      console.error('Erreur reverse geocoding:', error);
      return null;
    } finally {
      setAddressLoading(false);
    }
  };

  // Détection GPS automatique
  useEffect(() => {
    if ('geolocation' in navigator) {
      setGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          setFormData(prev => ({ 
            ...prev, 
            position_gps: [latitude, longitude]
          }));
          
          const address = await reverseGeocode(latitude, longitude);
          if (address) {
            setFormData(prev => ({ 
              ...prev, 
              lieu: address
            }));
          }
          
          setGpsLoading(false);
        },
        (error) => {
          console.log('GPS non disponible:', error);
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
  }, []);

  // Gérer le changement de statut d'un point
  const handlePointStatusChange = (pointId, status) => {
    setPointsStatus(prev => ({
      ...prev,
      [pointId]: status
    }));

    // Si on passe en conforme, retirer les défauts de ce point
    if (status === 'conforme') {
      setDefautsSelectionnes(prev => 
        prev.filter(d => d.point_id !== pointId)
      );
    }
  };

  // Gérer la sélection/désélection d'un défaut
  const handleDefautToggle = (pointId, defect) => {
    setDefautsSelectionnes(prev => {
      const exists = prev.some(d => d.defect_id === defect.id);
      
      if (exists) {
        // Retirer le défaut
        return prev.filter(d => d.defect_id !== defect.id);
      } else {
        // Ajouter le défaut
        return [...prev, {
          point_id: pointId,
          defect_id: defect.id,
          description: defect.desc,
          severity: defect.severity
        }];
      }
    });
  };

  // Vérifier si un défaut est sélectionné
  const isDefautSelected = (defectId) => {
    return defautsSelectionnes.some(d => d.defect_id === defectId);
  };

  // Effacer la signature
  const clearSignature = () => {
    if (signatureMandateeRef.current) {
      signatureMandateeRef.current.clear();
    }
  };

  // Valider et soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validations
    if (!formData.lieu || !formData.km) {
      alert('Veuillez remplir le lieu et le kilométrage');
      return;
    }

    if (!formData.personne_mandatee) {
      alert('Veuillez renseigner le nom de la personne mandatée');
      return;
    }

    const signatureMandatee = signatureMandateeRef.current?.toDataURL();
    if (!signatureMandatee || signatureMandateeRef.current?.isEmpty()) {
      alert('La signature de la personne mandatée est requise');
      return;
    }

    // Vérifier que les points non-conformes ont des défauts sélectionnés
    const pointsNonConformes = Object.entries(pointsStatus).filter(([_, status]) => status === 'defectueux');
    for (const [pointId] of pointsNonConformes) {
      const defautsPourCePoint = defautsSelectionnes.filter(d => d.point_id === pointId);
      if (defautsPourCePoint.length === 0) {
        const point = pointsVerification[pointId];
        alert(`Veuillez sélectionner au moins un défaut pour le point ${pointId} (${point?.label || 'N/A'})`);
        return;
      }
    }

    setSaving(true);

    try {
      const rondeData = {
        vehicule_id: vehicule.id,
        date: formData.date,
        heure: formData.heure,
        lieu: formData.lieu,
        position_gps: formData.position_gps,
        km: parseInt(formData.km),
        personne_mandatee: formData.personne_mandatee,
        defectuosites: formData.defectuosites,
        points_verification: pointsStatus,
        signature_mandatee: signatureMandatee,
        defauts_selectionnes: defautsSelectionnes,
        severite_globale: severiteGlobale
      };

      const result = await apiPost(tenantSlug, '/actifs/rondes-securite', rondeData);
      
      // Message selon sévérité
      if (result.severite_globale === 'MAJEUR') {
        alert(`🚨 ATTENTION: Défaut MAJEUR détecté!\n\nLe véhicule ${vehicule.nom} est maintenant HORS SERVICE.\n\nLes gestionnaires ont été notifiés.`);
      } else if (result.severite_globale === 'MINEUR') {
        alert(`⚠️ Défaut mineur détecté.\n\nUne réparation est requise sous 48h.\n\nLes gestionnaires ont été notifiés.`);
      } else {
        alert('✅ Ronde de sécurité enregistrée avec succès');
      }
      
      if (onSuccess) onSuccess(result);
      onClose();
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors de l\'enregistrement: ' + errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Compteurs
  const nombreConformes = Object.values(pointsStatus).filter(v => v === 'conforme').length;
  const nombreDefectueux = Object.values(pointsStatus).filter(v => v === 'defectueux').length;
  const nombreDefautsMajeurs = defautsSelectionnes.filter(d => d.severity === 'MAJEUR').length;
  const nombreDefautsMineurs = defautsSelectionnes.filter(d => d.severity === 'MINEUR').length;

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '24px', marginBottom: '15px' }}>⏳</div>
          <p>Chargement des points de vérification SAAQ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '950px', maxHeight: '95vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
          <h2>🔧 Ronde de sécurité SAAQ - {vehicule.nom}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Bandeau d'alerte selon sévérité */}
        {severiteGlobale === 'MAJEUR' && (
          <div style={{
            background: '#DC2626',
            color: 'white',
            padding: '15px 20px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '16px',
            position: 'sticky',
            top: '60px',
            zIndex: 9
          }}>
            🚨 VÉHICULE HORS SERVICE - Défaut(s) MAJEUR(S) détecté(s)
          </div>
        )}
        
        {severiteGlobale === 'MINEUR' && (
          <div style={{
            background: '#F59E0B',
            color: 'white',
            padding: '12px 20px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
            position: 'sticky',
            top: '60px',
            zIndex: 9
          }}>
            ⚠️ RÉPARATION REQUISE - Défaut(s) mineur(s) détecté(s) - Délai: 48h
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '20px' }}>
            {/* Informations du véhicule */}
            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '16px' }}>📋 Informations du véhicule</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', fontSize: '14px' }}>
                <div><strong>Type:</strong> {vehicule.type_vehicule}</div>
                <div><strong>N° plaque:</strong> {vehicule.nom}</div>
                <div><strong>Marque:</strong> {vehicule.marque}</div>
                <div><strong>Année:</strong> {vehicule.annee}</div>
                <div><strong>VIN:</strong> {vehicule.vin}</div>
                <div>
                  <strong>Freins:</strong> {' '}
                  <span style={{ 
                    background: brakeSystemType === 'BOTH' ? '#3B82F6' : brakeSystemType === 'HYDRAULIC' ? '#10B981' : '#8B5CF6',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    display: 'inline-block'
                  }}>
                    {brakeSystemType === 'BOTH' ? 'Hydraul. + Pneum.' : brakeSystemType === 'HYDRAULIC' ? 'Hydrauliques' : 'Pneumatiques'}
                  </span>
                </div>
              </div>
            </div>

            {/* Informations de la ronde */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
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
                <Label>
                  Lieu * 
                  {gpsLoading && <span style={{ color: '#3498db', marginLeft: '5px' }}>📍 GPS...</span>}
                  {addressLoading && <span style={{ color: '#f39c12', marginLeft: '5px' }}>🔄 Adresse...</span>}
                </Label>
                <Input
                  type="text"
                  value={formData.lieu}
                  onChange={(e) => setFormData({ ...formData, lieu: e.target.value })}
                  placeholder="Ex: 123 Rue Principale, Ville"
                  required
                />
                {formData.position_gps && (
                  <p style={{ fontSize: '11px', color: '#6c757d', marginTop: '3px' }}>
                    📍 {formData.position_gps[0].toFixed(4)}, {formData.position_gps[1].toFixed(4)}
                  </p>
                )}
              </div>
              <div>
                <Label>Kilométrage *</Label>
                <Input
                  type="number"
                  value={formData.km}
                  onChange={(e) => setFormData({ ...formData, km: e.target.value })}
                  placeholder="KM actuel"
                  required
                />
              </div>
            </div>

            {/* Résumé des points */}
            <div style={{ 
              background: severiteGlobale === 'MAJEUR' ? '#FEE2E2' : severiteGlobale === 'MINEUR' ? '#FEF3C7' : '#D1FAE5', 
              padding: '12px 15px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              border: `2px solid ${severiteGlobale === 'MAJEUR' ? '#DC2626' : severiteGlobale === 'MINEUR' ? '#F59E0B' : '#10B981'}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <span>✅ <strong>{nombreConformes}</strong> conforme(s)</span>
                <span>❌ <strong>{nombreDefectueux}</strong> défectueux</span>
                {nombreDefautsMajeurs > 0 && (
                  <span style={{ color: '#DC2626' }}>🚨 <strong>{nombreDefautsMajeurs}</strong> MAJEUR(S)</span>
                )}
                {nombreDefautsMineurs > 0 && (
                  <span style={{ color: '#F59E0B' }}>⚠️ <strong>{nombreDefautsMineurs}</strong> mineur(s)</span>
                )}
              </div>
            </div>

            {/* Points de vérification SAAQ */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ marginBottom: '15px', fontSize: '16px' }}>🔍 Points de vérification SAAQ (Loi 430)</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Object.entries(pointsVerification).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([pointId, point]) => {
                  const status = pointsStatus[pointId] || 'conforme';
                  const isNonConforme = status === 'defectueux';
                  const defautsDuPoint = defautsSelectionnes.filter(d => d.point_id === pointId);
                  
                  return (
                    <div 
                      key={pointId}
                      style={{
                        border: isNonConforme ? '2px solid #DC2626' : '1px solid #E5E7EB',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: isNonConforme ? '#FEF2F2' : '#fff'
                      }}
                    >
                      {/* En-tête du point */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 15px',
                        background: isNonConforme ? '#FEE2E2' : '#F9FAFB'
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>
                          <span style={{ 
                            background: '#1F2937', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '4px',
                            marginRight: '10px',
                            fontSize: '12px'
                          }}>
                            {pointId}
                          </span>
                          {point.label}
                        </div>
                        <div style={{ display: 'flex', gap: '15px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={`point_${pointId}`}
                              checked={status === 'conforme'}
                              onChange={() => handlePointStatusChange(pointId, 'conforme')}
                              style={{ marginRight: '5px' }}
                            />
                            <span style={{ color: '#10B981', fontWeight: '500' }}>✅ Conforme</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={`point_${pointId}`}
                              checked={status === 'defectueux'}
                              onChange={() => handlePointStatusChange(pointId, 'defectueux')}
                              style={{ marginRight: '5px' }}
                            />
                            <span style={{ color: '#DC2626', fontWeight: '500' }}>❌ Défectueux</span>
                          </label>
                        </div>
                      </div>

                      {/* Liste des défauts (affiché si non-conforme) */}
                      {isNonConforme && point.defects && (
                        <div style={{ padding: '10px 15px', borderTop: '1px solid #FCA5A5' }}>
                          <p style={{ fontSize: '12px', color: '#DC2626', marginBottom: '10px', fontWeight: '500' }}>
                            ⚠️ Sélectionnez le(s) défaut(s) constaté(s):
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {point.defects.map((defect) => {
                              const isSelected = isDefautSelected(defect.id);
                              const isMajeur = defect.severity === 'MAJEUR';
                              
                              return (
                                <label 
                                  key={defect.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    padding: '10px 12px',
                                    background: isSelected ? (isMajeur ? '#FEE2E2' : '#FEF3C7') : '#fff',
                                    border: `1px solid ${isSelected ? (isMajeur ? '#DC2626' : '#F59E0B') : '#E5E7EB'}`,
                                    borderRadius: '6px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleDefautToggle(pointId, defect)}
                                    style={{ marginRight: '10px', marginTop: '2px' }}
                                  />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{
                                        background: isMajeur ? '#DC2626' : '#F59E0B',
                                        color: 'white',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 'bold'
                                      }}>
                                        {defect.id}
                                      </span>
                                      <span style={{
                                        background: isMajeur ? '#FEE2E2' : '#FEF3C7',
                                        color: isMajeur ? '#DC2626' : '#92400E',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '10px',
                                        fontWeight: 'bold'
                                      }}>
                                        {isMajeur ? '🚨 MAJEUR' : '⚠️ MINEUR'}
                                      </span>
                                    </div>
                                    <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#374151' }}>
                                      {defect.desc}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          
                          {defautsDuPoint.length === 0 && (
                            <p style={{ 
                              color: '#DC2626', 
                              fontSize: '12px', 
                              marginTop: '10px',
                              fontStyle: 'italic'
                            }}>
                              ⚠️ Veuillez sélectionner au moins un défaut
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes supplémentaires */}
            <div style={{ marginBottom: '20px' }}>
              <Label>📝 Notes supplémentaires (optionnel)</Label>
              <Textarea
                value={formData.defectuosites}
                onChange={(e) => setFormData({ ...formData, defectuosites: e.target.value })}
                placeholder="Décrivez toute information complémentaire..."
                rows={3}
              />
            </div>

            {/* Personne mandatée */}
            <div style={{ marginBottom: '20px' }}>
              <Label>👤 Personne mandatée *</Label>
              <Input
                type="text"
                value={formData.personne_mandatee}
                onChange={(e) => setFormData({ ...formData, personne_mandatee: e.target.value })}
                placeholder="Nom complet"
                required
              />
            </div>

            {/* Signature */}
            <div style={{ marginBottom: '20px' }}>
              <Label>✍️ Signature de la personne mandatée *</Label>
              <div style={{ border: '2px solid #dee2e6', borderRadius: '8px', background: '#fff', maxWidth: '100%' }}>
                <SignatureCanvas
                  ref={signatureMandateeRef}
                  canvasProps={{
                    width: 600,
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
                onClick={clearSignature}
                style={{ marginTop: '5px' }}
              >
                🗑️ Effacer
              </Button>
            </div>

            {/* Avertissement légal */}
            <div style={{ 
              background: '#EFF6FF', 
              padding: '12px 15px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              border: '1px solid #3B82F6',
              fontSize: '13px'
            }}>
              <p style={{ margin: 0 }}>
                📋 <strong>Conformité SAAQ (Loi 430):</strong> Cette ronde de sécurité est conforme aux exigences du Règlement sur les normes de sécurité des véhicules routiers. 
                Les codes de défectuosité suivent la nomenclature officielle SAAQ pour faciliter les inspections routières.
              </p>
            </div>
          </div>

          <div className="modal-footer" style={{ position: 'sticky', bottom: 0, background: 'white', borderTop: '1px solid #E5E7EB' }}>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button 
              type="submit" 
              disabled={saving}
              style={{
                background: severiteGlobale === 'MAJEUR' ? '#DC2626' : severiteGlobale === 'MINEUR' ? '#F59E0B' : undefined
              }}
            >
              {saving ? '⏳ Enregistrement...' : (
                severiteGlobale === 'MAJEUR' ? '🚨 Enregistrer (HORS SERVICE)' :
                severiteGlobale === 'MINEUR' ? '⚠️ Enregistrer (Réparation requise)' :
                '✅ Enregistrer la ronde'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RondeSecuriteSAAQ;
