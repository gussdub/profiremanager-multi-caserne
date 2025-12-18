import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Composant pour gérer les clics sur la carte (sans changer le zoom)
const MapClickHandler = ({ onMapClick }) => {
  const map = useMap();
  useMapEvents({
    click: (e) => {
      // Appeler le callback avec les coordonnées, SANS changer le zoom
      onMapClick(e.latlng.lat, e.latlng.lng, map.getZoom());
    }
  });
  return null;
};

// Composant pour centrer la carte sur une position (avec zoom optionnel)
const MapCenterUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      // Si un zoom est spécifié, l'utiliser, sinon garder le zoom actuel
      const targetZoom = zoom || map.getZoom();
      map.setView(center, targetZoom);
    }
  }, [center, zoom, map]);
  return null;
};

// Composant pour la recherche d'adresse avec geocoding
const AddressSearch = ({ onLocationFound }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const searchAddress = async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      // Utiliser Nominatim pour le géocodage
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ca`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        setSuggestions(data);
      } else {
        setSuggestions([]);
        alert('Aucune adresse trouvée');
      }
    } catch (error) {
      console.error('Erreur geocoding:', error);
      alert('Erreur lors de la recherche d\'adresse');
    } finally {
      setSearching(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    onLocationFound(parseFloat(suggestion.lat), parseFloat(suggestion.lon), suggestion.display_name);
    setSuggestions([]);
    setSearchQuery('');
  };

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), searchAddress())}
          placeholder="Rechercher une adresse..."
          style={{
            flex: 1,
            padding: '0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.875rem'
          }}
        />
        <button
          type="button"
          onClick={searchAddress}
          disabled={searching}
          style={{
            padding: '0.5rem 1rem',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          {searching ? '...' : '🔍'}
        </button>
      </div>
      {suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          zIndex: 1000,
          background: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          marginTop: '0.25rem',
          maxHeight: '200px',
          overflowY: 'auto',
          width: 'calc(100% - 2rem)',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {suggestions.map((s, idx) => (
            <div
              key={idx}
              onClick={() => selectSuggestion(s)}
              style={{
                padding: '0.5rem',
                cursor: 'pointer',
                borderBottom: idx < suggestions.length - 1 ? '1px solid #e5e7eb' : 'none',
                fontSize: '0.8rem'
              }}
              onMouseOver={(e) => e.target.style.background = '#f3f4f6'}
              onMouseOut={(e) => e.target.style.background = 'white'}
            >
              {s.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PointEauModal = ({ 
  point, 
  onClose, 
  onSave, 
  tenantSlug, 
  apiPost, 
  apiPut,
  forcedType 
}) => {
  const [formData, setFormData] = useState({
    type: forcedType || 'borne_fontaine',
    numero_identification: '',
    latitude: '',
    longitude: '',
    adresse: '',
    ville: 'Shefford',
    notes: '',
    // Bornes fontaines
    debit_gpm: '',
    pression_dynamique_psi: '',
    diametre_raccordement: '',
    etat: 'fonctionnelle',
    date_dernier_test: '',
    // Bornes sèches
    debit_max_statique_gpm: '',
    // Points d'eau statiques
    capacite_litres: '',
    accessibilite: 'facile',
    // Photos
    photos: []
  });
  
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectingOnMap, setSelectingOnMap] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [mapCenter, setMapCenter] = useState([45.37, -72.57]); // Shefford par défaut
  const [mapZoom, setMapZoom] = useState(14); // Zoom par défaut
  const [mapLayer, setMapLayer] = useState('plan'); // 'plan' ou 'satellite'

  // Icône pour le marqueur sélectionné
  const selectedIcon = L.divIcon({
    html: `<div style="
      width: 30px;
      height: 30px;
      background: #ef4444;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });

  // URLs des icônes
  const iconUrls = {
    borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
    borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
    point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
  };

  // Charger les données du point si modification
  useEffect(() => {
    if (point) {
      setFormData({
        type: point.type || 'borne_fontaine',
        numero_identification: point.numero_identification || '',
        latitude: point.latitude || '',
        longitude: point.longitude || '',
        adresse: point.adresse || '',
        ville: point.ville || 'Shefford',
        notes: point.notes || '',
        debit_gpm: point.debit_gpm || '',
        pression_dynamique_psi: point.pression_dynamique_psi || '',
        diametre_raccordement: point.diametre_raccordement || '',
        etat: point.etat || 'fonctionnelle',
        date_dernier_test: point.date_dernier_test || '',
        debit_max_statique_gpm: point.debit_max_statique_gpm || '',
        capacite_litres: point.capacite_litres || '',
        accessibilite: point.accessibilite || 'facile',
        photos: point.photos || []
      });
    }
  }, [point]);

  // Parser les coordonnées Google Maps
  const parseGoogleMapsCoords = (input) => {
    if (!input) return null;
    
    // Format: "45.3778, -72.6839" ou "45.3778,-72.6839"
    const decimalPattern = /^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/;
    const match = input.match(decimalPattern);
    
    if (match) {
      return {
        latitude: parseFloat(match[1]),
        longitude: parseFloat(match[2])
      };
    }
    
    // Format DMS: "45°22'40.1\"N 72°41'02.0\"W"
    const dmsPattern = /(\d+)°(\d+)'([\d.]+)\"([NS])\s+(\d+)°(\d+)'([\d.]+)\"([EW])/;
    const dmsMatch = input.match(dmsPattern);
    
    if (dmsMatch) {
      const latDeg = parseInt(dmsMatch[1]);
      const latMin = parseInt(dmsMatch[2]);
      const latSec = parseFloat(dmsMatch[3]);
      const latDir = dmsMatch[4];
      
      const lonDeg = parseInt(dmsMatch[5]);
      const lonMin = parseInt(dmsMatch[6]);
      const lonSec = parseFloat(dmsMatch[7]);
      const lonDir = dmsMatch[8];
      
      let lat = latDeg + (latMin / 60) + (latSec / 3600);
      let lon = lonDeg + (lonMin / 60) + (lonSec / 3600);
      
      if (latDir === 'S') lat = -lat;
      if (lonDir === 'W') lon = -lon;
      
      return { latitude: lat, longitude: lon };
    }
    
    return null;
  };

  // Handler pour le changement de coordonnées
  const handleCoordChange = (field, value) => {
    // Si c'est la latitude et qu'on détecte un format Google Maps
    if (field === 'latitude' && value.includes(',')) {
      const parsed = parseGoogleMapsCoords(value);
      if (parsed) {
        setFormData(prev => ({
          ...prev,
          latitude: parsed.latitude.toString(),
          longitude: parsed.longitude.toString()
        }));
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [field]: value }));
  };

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
        // Mapper l'état à la couleur correcte
        statut_couleur: formData.etat === 'fonctionnelle' ? 'vert' : 
                        formData.etat === 'attention' ? 'orange' : 'rouge'
      };

      if (point?.id) {
        await apiPut(tenantSlug, `/points-eau/${point.id}`, payload);
      } else {
        await apiPost(tenantSlug, '/points-eau', payload);
      }

      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La photo est trop grande (max 5MB)');
      return;
    }

    setUploadingPhoto(true);
    try {
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

  // Handler pour la sélection sur la carte
  const handleSelectOnMap = () => {
    setSelectingOnMap(true);
    alert('Cliquez sur la carte pour sélectionner l\'emplacement. Le modal se rouvrira automatiquement.');
    onClose();
    
    // Émettre un événement personnalisé pour informer le parent
    window.dispatchEvent(new CustomEvent('selectLocationOnMap', {
      detail: {
        callback: (lat, lng) => {
          // Cette callback sera appelée par le parent
          setFormData(prev => ({
            ...prev,
            latitude: lat.toString(),
            longitude: lng.toString()
          }));
          setSelectingOnMap(false);
        }
      }
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
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>
            {point?.id ? '✏️ Modifier' : '➕ Ajouter'} un point d'eau
          </h2>
          <button
            onClick={onClose}
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
          {/* Type avec icônes */}
          {!forcedType && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Type de point d'eau <span style={{ color: 'red' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {Object.entries({
                  borne_fontaine: 'Borne fontaine',
                  borne_seche: 'Borne sèche',
                  point_eau_statique: 'Point statique'
                }).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: value })}
                    style={{
                      padding: '1rem',
                      border: formData.type === value ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      background: formData.type === value ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <img 
                      src={iconUrls[value]} 
                      alt={label}
                      style={{ width: '40px', height: '40px' }}
                    />
                    <span style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: formData.type === value ? '600' : '400',
                      color: formData.type === value ? '#3b82f6' : '#6b7280'
                    }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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

          {/* Coordonnées GPS avec mini-carte intégrée */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Coordonnées GPS <span style={{ color: 'red' }}>*</span>
            </label>
            
            {/* Bouton pour afficher/masquer la carte */}
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowMiniMap(!showMiniMap)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: showMiniMap ? '#6b7280' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {showMiniMap ? '🗺️ Masquer la carte' : '📍 Sélectionner sur la carte'}
              </button>
            </div>

            {/* Mini-carte intégrée */}
            {showMiniMap && (
              <div style={{ 
                marginBottom: '0.75rem',
                border: '2px solid #10b981',
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                {/* Barre de recherche d'adresse */}
                <div style={{ padding: '0.5rem', background: '#f3f4f6', position: 'relative' }}>
                  <AddressSearch 
                    onLocationFound={(lat, lng, address) => {
                      setFormData(prev => ({
                        ...prev,
                        latitude: lat.toFixed(6),
                        longitude: lng.toFixed(6),
                        adresse: address.split(',')[0] || prev.adresse
                      }));
                      setMapCenter([lat, lng]);
                    }}
                  />
                </div>
                
                <div style={{ height: '250px' }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; OpenStreetMap'
                    />
                    <MapClickHandler 
                      onMapClick={(lat, lng) => {
                        setFormData(prev => ({
                          ...prev,
                          latitude: lat.toFixed(6),
                          longitude: lng.toFixed(6)
                        }));
                        setMapCenter([lat, lng]);
                      }}
                    />
                    <MapCenterUpdater center={mapCenter} />
                    {formData.latitude && formData.longitude && (
                      <Marker 
                        position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]}
                        icon={selectedIcon}
                      />
                    )}
                  </MapContainer>
                </div>
                <div style={{ 
                  padding: '0.5rem', 
                  background: '#ecfdf5', 
                  fontSize: '0.75rem',
                  color: '#047857',
                  textAlign: 'center'
                }}>
                  👆 Cliquez sur la carte pour définir l'emplacement ou recherchez une adresse
                </div>
              </div>
            )}

            {/* Champs latitude/longitude */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  Latitude
                </label>
                <input
                  type="text"
                  required
                  value={formData.latitude}
                  onChange={(e) => {
                    handleCoordChange('latitude', e.target.value);
                    if (e.target.value && formData.longitude) {
                      setMapCenter([parseFloat(e.target.value), parseFloat(formData.longitude)]);
                    }
                  }}
                  placeholder="45.3778 ou collez Google Maps"
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
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  Longitude
                </label>
                <input
                  type="text"
                  required
                  value={formData.longitude}
                  onChange={(e) => {
                    setFormData({ ...formData, longitude: e.target.value });
                    if (formData.latitude && e.target.value) {
                      setMapCenter([parseFloat(formData.latitude), parseFloat(e.target.value)]);
                    }
                  }}
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
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              💡 Astuce : Copiez-collez les coordonnées depuis Google Maps (ex: 45.3778, -72.6839)
            </p>
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
              placeholder="Shefford"
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
                    Pression (PSI)
                  </label>
                  <input
                    type="number"
                    value={formData.pression_dynamique_psi}
                    onChange={(e) => setFormData({ ...formData, pression_dynamique_psi: e.target.value })}
                    placeholder="60"
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
              onClick={onClose}
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
              {loading ? 'Sauvegarde...' : (point?.id ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PointEauModal;
