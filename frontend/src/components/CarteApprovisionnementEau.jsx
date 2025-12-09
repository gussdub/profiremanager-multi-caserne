import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';

// Hook pour toast (fallback si pas disponible)
const useToast = () => {
  return {
    toast: ({ title, description, variant }) => {
      console.log(`[Toast ${variant || 'info'}] ${title}: ${description}`);
      if (variant === 'destructive') {
        alert(`Erreur: ${description}`);
      }
    }
  };
};

const CarteApprovisionnementEau = ({ user }) => {
  
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [currentView, setCurrentView] = useState('carte');
  const [pointsEau, setPointsEau] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showPointModal, setShowPointModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  
  // States pour le modal de point d'eau
  const [formData, setFormData] = useState({
    type: 'borne_fontaine',
    numero_identification: '',
    latitude: '',
    longitude: '',
    adresse: '',
    ville: 'Shefford',
    notes: '',
    debit_gpm: '',
    pression_dynamique_psi: '',
    diametre_raccordement: '',
    etat: 'fonctionnelle',
    date_dernier_test: '',
    debit_max_statique_gpm: '',
    capacite_litres: '',
    accessibilite: 'facile',
    photos: []
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statutFilter, setStatutFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState([45.5017, -73.5673]); // Montréal par défaut
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLayer, setMapLayer] = useState('plan'); // 'plan' ou 'satellite'

  // Charger les points d'eau
  const fetchPointsEau = async () => {
    try {
      setLoading(true);
      let url = '/points-eau';
      const params = new URLSearchParams();
      
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statutFilter !== 'all') params.append('etat', statutFilter);
      
      if (params.toString()) url += '?' + params.toString();
      
      const data = await apiGet(tenantSlug, url);
      setPointsEau(data);
      
      // Centrer la carte sur le premier point si disponible
      if (data.length > 0 && data[0].latitude && data[0].longitude) {
        setMapCenter([data[0].latitude, data[0].longitude]);
      }
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les points d'eau",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les statistiques
  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/points-eau-statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  useEffect(() => {
    fetchPointsEau();
    fetchStats();
  }, [tenantSlug, typeFilter, statutFilter]);

  // Filtrer les points selon la recherche
  const filteredPoints = pointsEau.filter(point => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();

  // Composant Modal pour créer/éditer un point d'eau
  const PointEauModal = () => {
    const [formData, setFormData] = useState({
      type: selectedPoint?.type || 'borne_fontaine',
      numero_identification: selectedPoint?.numero_identification || '',
      latitude: selectedPoint?.latitude || '',
      longitude: selectedPoint?.longitude || '',
      adresse: selectedPoint?.adresse || '',
      ville: selectedPoint?.ville || 'Shefford',
      notes: selectedPoint?.notes || '',
      // Bornes fontaines
      debit_gpm: selectedPoint?.debit_gpm || '',
      pression_dynamique_psi: selectedPoint?.pression_dynamique_psi || '',
      diametre_raccordement: selectedPoint?.diametre_raccordement || '',
      etat: selectedPoint?.etat || 'fonctionnelle',
      date_dernier_test: selectedPoint?.date_dernier_test || '',
      // Bornes sèches
      debit_max_statique_gpm: selectedPoint?.debit_max_statique_gpm || '',
      // Points d'eau statiques
      capacite_litres: selectedPoint?.capacite_litres || '',
      accessibilite: selectedPoint?.accessibilite || 'facile',
      // Photos
      photos: selectedPoint?.photos || []
    });
    
    const [loading, setLoading] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      
      // Validation
      if (!formData.type || !formData.latitude || !formData.longitude) {
        alert('Type et coordonnées GPS sont obligatoires');
        return;
      }

      setLoading(true);
      try {
        const payload = {
          ...formData,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          statut_couleur: formData.etat === 'fonctionnelle' ? 'vert' : formData.etat === 'attention' ? 'jaune' : 'rouge'
        };

        if (selectedPoint?.id) {
          // Modification
          await apiPut(tenantSlug, `/points-eau/${selectedPoint.id}`, payload);
          toast({ title: 'Succès', description: 'Point d\'eau modifié avec succès' });
        } else {
          // Création
          await apiPost(tenantSlug, '/points-eau', payload);
          toast({ title: 'Succès', description: 'Point d\'eau créé avec succès' });
        }

        fetchPointsEau();
        fetchStats();
        setShowPointModal(false);
        setSelectedPoint(null);
      } catch (error) {
        console.error('Erreur:', error);
        toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    const handlePhotoUpload = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Vérifier la taille (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('La photo est trop grande (max 5MB)');
        return;
      }

      setUploadingPhoto(true);
      try {
        // Convertir en base64
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result;
          setFormData(prev => ({
            ...prev,
            photos: [...prev.photos, base64]
          }));
          setUploadingPhoto(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Erreur upload:', error);
        setUploadingPhoto(false);
      }
    };

    const removePhoto = (index) => {
      setFormData(prev => ({
        ...prev,
        photos: prev.photos.filter((_, i) => i !== index)
      }));
    };

    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '700px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          {/* Header */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            background: 'white',
            zIndex: 10
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>
              {selectedPoint?.id ? '✏️ Modifier' : '➕ Ajouter'} un point d'eau
            </h2>
            <button
              onClick={() => {
                setShowPointModal(false);
                setSelectedPoint(null);
              }}
              style={{
                padding: '0.5rem',
                background: 'transparent',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ✕
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
            {/* Type */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Type de point d'eau <span style={{ color: 'red' }}>*</span>
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value="borne_fontaine">🔴 Borne fontaine</option>
                <option value="borne_seche">🟠 Borne sèche</option>
                <option value="point_eau_statique">💧 Point d'eau statique</option>
              </select>
            </div>

            {/* N° Identification */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                N° d'identification
              </label>
              <input
                type="text"
                value={formData.numero_identification}
                onChange={(e) => setFormData({ ...formData, numero_identification: e.target.value })}
                placeholder="Ex: BF-001, BS-001, PE-001"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Coordonnées GPS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Latitude <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  placeholder="45.3778"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Longitude <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  placeholder="-72.6839"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            {/* Adresse */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Adresse
              </label>
              <input
                type="text"
                value={formData.adresse}
                onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                placeholder="123 rue Principale"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Ville */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Ville
              </label>
              <input
                type="text"
                value={formData.ville}
                onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Champs spécifiques BORNE FONTAINE */}
            {formData.type === 'borne_fontaine' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      Débit (GPM)
                    </label>
                    <input
                      type="number"
                      value={formData.debit_gpm}
                      onChange={(e) => setFormData({ ...formData, debit_gpm: e.target.value })}
                      placeholder="1500"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      Pression dynamique (PSI)
                    </label>
                    <input
                      type="number"
                      value={formData.pression_dynamique_psi}
                      onChange={(e) => setFormData({ ...formData, pression_dynamique_psi: e.target.value })}
                      placeholder="50"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      Diamètre raccordement
                    </label>
                    <input
                      type="text"
                      value={formData.diametre_raccordement}
                      onChange={(e) => setFormData({ ...formData, diametre_raccordement: e.target.value })}
                      placeholder='6"'
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      État
                    </label>
                    <select
                      value={formData.etat}
                      onChange={(e) => setFormData({ ...formData, etat: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                    >
                      <option value="fonctionnelle">Fonctionnelle</option>
                      <option value="attention">Attention</option>
                      <option value="hors_service">Hors service</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Date dernier test
                  </label>
                  <input
                    type="date"
                    value={formData.date_dernier_test}
                    onChange={(e) => setFormData({ ...formData, date_dernier_test: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </>
            )}

            {/* Champs spécifiques BORNE SÈCHE */}
            {formData.type === 'borne_seche' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Débit maximum statique (GPM)
                </label>
                <input
                  type="number"
                  value={formData.debit_max_statique_gpm}
                  onChange={(e) => setFormData({ ...formData, debit_max_statique_gpm: e.target.value })}
                  placeholder="2000"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            )}

            {/* Champs spécifiques POINT D'EAU STATIQUE */}
            {formData.type === 'point_eau_statique' && (
              <>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Capacité (litres)
                  </label>
                  <input
                    type="number"
                    value={formData.capacite_litres}
                    onChange={(e) => setFormData({ ...formData, capacite_litres: e.target.value })}
                    placeholder="50000"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Accessibilité
                  </label>
                  <select
                    value={formData.accessibilite}
                    onChange={(e) => setFormData({ ...formData, accessibilite: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="facile">Facile</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="difficile">Difficile</option>
                  </select>
                </div>
              </>
            )}

            {/* Notes */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notes importantes..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Photos */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Photos
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
              {uploadingPhoto && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>Téléchargement...</p>}
              
              {/* Aperçu des photos */}
              {formData.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {formData.photos.map((photo, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #e5e7eb' }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-8px',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Boutons */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                onClick={() => {
                  setShowPointModal(false);
                  setSelectedPoint(null);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: '#374151'
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: loading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Sauvegarde...' : (selectedPoint?.id ? 'Modifier' : 'Créer')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };


    return (
      point.numero_identification?.toLowerCase().includes(term) ||
      point.adresse?.toLowerCase().includes(term) ||
      point.ville?.toLowerCase().includes(term)
    );
  });

  // Déterminer la couleur du marqueur selon le statut
  const getMarkerColor = (statutCouleur) => {
    switch (statutCouleur) {
      case 'vert': return '#10b981';
      case 'orange': return '#f59e0b';
      case 'rouge': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  // Déterminer l'icône selon le type (pour affichage dans la liste)
  const getTypeIcon = (type) => {
    const iconUrls = {
      borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
      borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
      point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
    };
    
    return <img src={iconUrls[type] || iconUrls.point_eau_statique} alt={type} style={{ width: '24px', height: '24px', verticalAlign: 'middle' }} />;
  };

  // Obtenir l'icône Leaflet personnalisée avec badge coloré
  const getLeafletIcon = (type, statutCouleur) => {
    const iconUrls = {
      borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
      borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
      point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
    };

    const badgeColor = statutCouleur === 'vert' ? '#10b981' : statutCouleur === 'jaune' ? '#f59e0b' : statutCouleur === 'rouge' ? '#ef4444' : '#6b7280';

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <img src="${iconUrls[type] || iconUrls.point_eau_statique}" style="width: 40px; height: 40px;" />
          <div style="
            position: absolute;
            bottom: 0px;
            right: 0px;
            width: 14px;
            height: 14px;
            background: ${badgeColor};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

  // Ouvrir le modal d'ajout/modification
  const openPointModal = (point = null) => {
    setSelectedPoint(point);
    setShowPointModal(true);
  };

  // Ouvrir le modal d'inspection
  const openInspectionModal = (point) => {
    setSelectedPoint(point);
    setShowInspectionModal(true);
  };

  // Supprimer un point
  const deletePoint = async (pointId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce point d\'eau ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/points-eau/${pointId}`);
      toast({
        title: "Succès",
        description: "Point d'eau supprimé avec succès"
      });
      fetchPointsEau();
      fetchStats();
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le point d'eau",
        variant: "destructive"
      });
    }
  };

  // Composant pour gérer le clic sur la carte
  const MapClickHandler = () => {
    const map = useMapEvents({
      click: (e) => {
        // Seulement pour admin/superviseur
        if (user?.role === 'admin' || user?.role === 'superviseur') {
          openPointModal({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            type: 'borne_fontaine',
            ville: 'Shefford'
          });
        }
      }
    });
    return null;
  };

  // Rendu de la carte
  const renderCarte = () => (
    <div style={{ height: 'calc(100vh - 300px)', minHeight: '500px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      {/* Toggle Plan/Satellite */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex'
      }}>
        <button
          onClick={() => setMapLayer('plan')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'plan' ? '#3b82f6' : 'white',
            color: mapLayer === 'plan' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '8px 0 0 8px',
            borderRight: '1px solid #e5e7eb'
          }}
        >
          🗺️ Plan
        </button>
        <button
          onClick={() => setMapLayer('satellite')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'satellite' ? '#3b82f6' : 'white',
            color: mapLayer === 'satellite' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '0 8px 8px 0'
          }}
        >
          🛰️ Satellite
        </button>
      </div>
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        maxZoom={20}
        style={{ height: '100%', width: '100%', background: '#d3d3d3' }}
        whenCreated={setMap}
      >
        {mapLayer === 'plan' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        ) : (
          <TileLayer
            attribution='&copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={20}
          />
        )}
        <MapClickHandler />
        {filteredPoints.map(point => (
          point.latitude && point.longitude && (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={getLeafletIcon(point.type, point.statut_couleur)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem' }}>
                    {getTypeIcon(point.type)} {point.numero_identification}
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    <p><strong>Type:</strong> {
                      point.type === 'borne_fontaine' ? 'Borne-fontaine' :
                      point.type === 'borne_seche' ? 'Borne sèche' :
                      'Point d\'eau statique'
                    }</p>
                    {point.adresse && <p><strong>Adresse:</strong> {point.adresse}</p>}
                    {point.ville && <p><strong>Ville:</strong> {point.ville}</p>}
                    {point.debit_gpm && <p><strong>Débit:</strong> {point.debit_gpm} GPM</p>}
                    <p><strong>État:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getMarkerColor(point.statut_couleur) + '20',
                      color: getMarkerColor(point.statut_couleur)
                    }}>
                      {point.etat || 'Non défini'}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '0.5rem',
                        background: '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        textDecoration: 'none',
                        fontWeight: '500'
                      }}
                    >
                      🗺️ Navigation (Google Maps)
                    </a>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          openPointModal(point);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Modifier
                      </button>
                      {point.type === 'borne_seche' && (
                        <button
                          onClick={() => openInspectionModal(point)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Inspecter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );

  // Rendu de la vue liste
  const renderListe = () => (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Type</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>N° Identification</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Adresse</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Débit</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>État</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Dernière Inspection</th>
            <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredPoints.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                Aucun point d'eau trouvé
              </td>
            </tr>
          ) : (
            filteredPoints.map(point => (
              <tr key={point.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', fontSize: '1.5rem' }}>
                  {getTypeIcon(point.type)}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  {point.numero_identification}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.adresse || '-'}<br/>
                  <span style={{ fontSize: '0.75rem' }}>{point.ville || ''}</span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {point.debit_gpm ? `${point.debit_gpm} GPM` : '-'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    background: getMarkerColor(point.statut_couleur) + '20',
                    color: getMarkerColor(point.statut_couleur)
                  }}>
                    {point.statut_couleur === 'vert' && '✓ Conforme'}
                    {point.statut_couleur === 'orange' && '⚠ À venir'}
                    {point.statut_couleur === 'rouge' && '✗ En défaut'}
                    {point.statut_couleur === 'gris' && '◯ Non inspecté'}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.date_derniere_inspection ? 
                    new Date(point.date_derniere_inspection).toLocaleDateString('fr-FR') : 
                    'Jamais'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => openPointModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => openInspectionModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Inspecter"
                    >
                      📋
                    </button>
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <button
                        onClick={() => deletePoint(point.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1f2937' }}>
          💧 Approvisionnement en Eau
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          Gestion des points d'eau et inspections
        </p>
      </div>

      {/* Statistiques */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⛲</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_fontaines || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes-fontaines</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_seches || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes sèches</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💧</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.points_statiques || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Points statiques</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
              {stats.par_etat?.fonctionnels || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Fonctionnels</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.25rem' }}>
              {stats.inspections_30_jours || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Inspections (30j)</div>
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ 
        background: 'white', 
        padding: '1rem', 
        borderRadius: '12px', 
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center'
      }}>
        {/* Bouton Ajouter */}
        {(user?.role === 'admin' || user?.role === 'superviseur') && (
          <button
            onClick={() => openPointModal(null)}
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Ajouter un point d'eau
          </button>
        )}

        {/* Filtre Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les types</option>
          <option value="borne_fontaine">Bornes-fontaines</option>
          <option value="borne_seche">Bornes sèches</option>
          <option value="point_eau_statique">Points statiques</option>
        </select>

        {/* Filtre Statut */}
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les états</option>
          <option value="fonctionnel">Fonctionnel</option>
          <option value="defectueux">Défectueux</option>
          <option value="inaccessible">Inaccessible</option>
        </select>

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher (n°, adresse, ville)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem'
          }}
        />

        {/* Spacer pour pousser le toggle à droite */}
        <div style={{ flex: 1, minWidth: '50px' }}></div>

        {/* Toggle Vue */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCurrentView('carte')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'carte' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'carte' ? '#eff6ff' : 'white',
              color: currentView === 'carte' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            🗺️ Carte
          </button>
          <button
            onClick={() => setCurrentView('liste')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'liste' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'liste' ? '#eff6ff' : 'white',
              color: currentView === 'liste' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            📋 Liste
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Chargement...
        </div>
      ) : (
        <>
          {currentView === 'carte' ? renderCarte() : renderListe()}
        </>
      )}

      {/* Modal de création/édition de point d'eau */}
      {showPointModal && (
        (() => {
          const [formData, setFormData] = useState({
            type: selectedPoint?.type || 'borne_fontaine',
            numero_identification: selectedPoint?.numero_identification || '',
            latitude: selectedPoint?.latitude || '',
            longitude: selectedPoint?.longitude || '',
            adresse: selectedPoint?.adresse || '',
            ville: selectedPoint?.ville || 'Shefford',
            notes: selectedPoint?.notes || '',
            debit_gpm: selectedPoint?.debit_gpm || '',
            pression_dynamique_psi: selectedPoint?.pression_dynamique_psi || '',
            diametre_raccordement: selectedPoint?.diametre_raccordement || '',
            etat: selectedPoint?.etat || 'fonctionnelle',
            date_dernier_test: selectedPoint?.date_dernier_test || '',
            debit_max_statique_gpm: selectedPoint?.debit_max_statique_gpm || '',
            capacite_litres: selectedPoint?.capacite_litres || '',
            accessibilite: selectedPoint?.accessibilite || 'facile',
            photos: selectedPoint?.photos || []
          });
          
          const [loading, setLoading] = useState(false);
          const [uploadingPhoto, setUploadingPhoto] = useState(false);

          return PointEauModal();
        })()
      )}

      {showInspectionModal && (
        <InspectionModal
          point={selectedPoint}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            fetchPointsEau();
            fetchStats();
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
        />
      )}
    </div>
  );
};

export default CarteApprovisionnementEau;
