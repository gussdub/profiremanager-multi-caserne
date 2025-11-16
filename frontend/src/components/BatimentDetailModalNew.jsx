import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import axios from 'axios';
import { buildApiUrl } from '../utils/api';

// Mini-carte Leaflet pour l'aperçu dans le modal
const MiniMapPreview = ({ latitude, longitude, address }) => {
  const [mapReady, setMapReady] = useState(false);
  
  useEffect(() => {
    // Charger le CSS de Leaflet si pas déjà fait
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    setMapReady(true);
  }, []);
  
  if (!mapReady) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f0f0f0'
      }}>
        <span>Chargement de la carte...</span>
      </div>
    );
  }
  
  try {
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');
    const L = require('leaflet');
    
    // Fix pour les icônes Leaflet
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    
    return (
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]}>
          <Popup>{address || 'Bâtiment'}</Popup>
        </Marker>
      </MapContainer>
    );
  } catch (err) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f0f0f0',
        color: '#666'
      }}>
        <span>📍 Carte non disponible</span>
      </div>
    );
  }
};

// Composant principal du formulaire de bâtiment
const BatimentForm = ({ 
  batiment, 
  onClose, 
  onUpdate, 
  onCreate,
  onInspect,
  onCreatePlan,
  onViewHistory,
  onGenerateReport,
  onDelete,
  canEdit,
  tenantSlug 
}) => {
  const isCreating = !batiment;
  const [isEditing, setIsEditing] = useState(isCreating);
  const [editData, setEditData] = useState(isCreating ? {
    adresse_civique: '',
    ville: '',
    province: 'QC',
    code_postal: '',
    latitude: null,
    longitude: null,
    type_batiment: '',
    sous_type_batiment: '',
    proprietaire_nom: '',
    proprietaire_prenom: '',
    proprietaire_telephone: '',
    proprietaire_courriel: '',
    locataire_nom: '',
    locataire_prenom: '',
    locataire_telephone: '',
    locataire_courriel: '',
    gestionnaire_nom: '',
    gestionnaire_prenom: '',
    gestionnaire_telephone: '',
    gestionnaire_courriel: '',
    niveau_risque: 'Moyen',
    risques_identifies: [],
    cadastre_matricule: '',
    valeur_fonciere: '',
    nombre_etages: '',
    annee_construction: '',
    superficie_totale_m2: '',
    description_activite: '',
    notes: ''
  } : {});
  
  const [streetViewUrl, setStreetViewUrl] = useState('');
  const [buildingPhoto, setBuildingPhoto] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [addressValidated, setAddressValidated] = useState(false);
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inspections, setInspections] = useState([]);
  const autocompleteInputRef = useRef(null);
  const autocompleteRef = useRef(null);

  // Types de bâtiment avec sous-catégories
  const typesBatiment = {
    'Résidentiel': ['Unifamiliale', 'Bifamiliale', 'Multifamiliale (3-8 logements)', 'Multifamiliale (9+ logements)', 'Copropriété', 'Maison mobile'],
    'Industriel': ['Manufacture légère', 'Manufacture lourde', 'Entrepôt', 'Usine', 'Atelier'],
    'Agricole': ['Ferme', 'Grange', 'Serre', 'Écurie', 'Silo'],
    'Commercial': ['Bureau', 'Magasin', 'Restaurant', 'Hôtel', 'Centre commercial'],
    'Institutionnel': ['École', 'Hôpital', 'CHSLD', 'Centre communautaire', 'Église', 'Bibliothèque']
  };

  const niveauxRisque = ['Faible', 'Moyen', 'Élevé', 'Très élevé'];

  const riskColors = {
    'Faible': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    'Moyen': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    'Élevé': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    'Très élevé': { bg: '#fecaca', border: '#dc2626', text: '#7f1d1d' }
  };

  const riskColor = riskColors[editData.niveau_risque] || riskColors['Moyen'];

  useEffect(() => {
    if (batiment) {
      setEditData({ ...batiment });
      fetchInspections();
    }
  }, [batiment]);

  // Autocomplétion d'adresse avec API Adresse Québec (gratuite et fiable)
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressJustSelected = useRef(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setIsSearching(true);
    try {
      // Utiliser l'API Adresse Québec (gratuite)
      const response = await fetch(
        `https://geogratis.gc.ca/services/geolocation/en/locate?q=${encodeURIComponent(query)}&maxResultCount=5`
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        setSuggestions(data);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Erreur recherche adresse:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleAddressSelect = async (suggestion) => {
    const { title, geometry } = suggestion;
    
    // Marquer qu'on vient de sélectionner une adresse pour éviter de relancer la recherche
    addressJustSelected.current = true;
    
    // Parser l'adresse - Format: "Numéro Rue, Ville, Province" (PAS de code postal dans cette API)
    const addressParts = title.split(',').map(p => p.trim());
    const streetAddress = addressParts[0] || '';
    const city = addressParts[1] || '';
    const provinceName = addressParts[2] || 'Quebec';
    
    // Convertir le nom de la province en code
    const provinceMap = {
      'Quebec': 'QC',
      'Québec': 'QC',
      'Ontario': 'ON',
      'Alberta': 'AB',
      'British Columbia': 'BC',
      'Manitoba': 'MB',
      'New Brunswick': 'NB',
      'Newfoundland and Labrador': 'NL',
      'Nova Scotia': 'NS',
      'Prince Edward Island': 'PE',
      'Saskatchewan': 'SK'
    };
    const province = provinceMap[provinceName] || 'QC';
    
    const lat = geometry?.coordinates?.[1] || null;
    const lng = geometry?.coordinates?.[0] || null;
    
    // Obtenir le code postal via reverse geocoding Nominatim (OpenStreetMap)
    let postalCode = '';
    if (lat && lng) {
      try {
        // Utiliser Nominatim API (gratuite, sans clé)
        const geocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
        const response = await fetch(geocodeUrl, {
          headers: {
            'User-Agent': 'ProFireManager/1.0'
          }
        });
        const data = await response.json();
        
        if (data && data.address && data.address.postcode) {
          postalCode = data.address.postcode;
        }
      } catch (error) {
        console.error('Erreur récupération code postal:', error);
      }
    }
    
    setEditData(prev => ({
      ...prev,
      adresse_civique: streetAddress,
      ville: city,
      province: province,
      code_postal: postalCode,
      latitude: lat,
      longitude: lng
    }));
    
    setAddressValidated(true);
    setShowSuggestions(false);
    
    // Générer carte statique OpenStreetMap si on a les coordonnées
    if (lat && lng) {
      // Utiliser l'API de carte statique OpenStreetMap
      const zoom = 16;
      const width = 400;
      const height = 250;
      const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},red-pushpin`;
      setStreetViewUrl(url);
    }
  };
  
  useEffect(() => {
    // Ne pas rechercher si on vient de sélectionner une adresse
    if (addressJustSelected.current) {
      addressJustSelected.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (isEditing && editData.adresse_civique) {
        searchAddress(editData.adresse_civique);
      }
    }, 500); // Debounce de 500ms
    
    return () => clearTimeout(timeoutId);
  }, [editData.adresse_civique, isEditing]);

  // Générer URL de carte statique quand l'adresse change ou au chargement initial
  useEffect(() => {
    if (editData.adresse_civique && editData.ville) {
      generateStreetViewUrl();
    }
  }, [editData.latitude, editData.longitude, editData.adresse_civique, editData.ville]);

  const generateStreetViewUrl = async () => {
    // Chercher une photo réelle du bâtiment via Mapillary
    if (editData.latitude && editData.longitude) {
      await fetchMapillaryPhoto(editData.latitude, editData.longitude);
    } else if (editData.adresse_civique && editData.ville) {
      // Si pas de coordonnées, tenter un geocoding pour obtenir les coordonnées
      const address = encodeURIComponent(`${editData.adresse_civique}, ${editData.ville}, ${editData.province || 'QC'}, Canada`);
      
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${address}&format=json&limit=1`, {
          headers: {
            'User-Agent': 'ProFireManager/1.0'
          }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          // Mettre à jour les coordonnées dans editData
          setEditData(prev => ({
            ...prev,
            latitude: lat,
            longitude: lon
          }));
          await fetchMapillaryPhoto(lat, lon);
        }
      } catch (err) {
        console.log('Erreur geocoding:', err);
      }
    }
  };
  
  const fetchMapillaryPhoto = async (lat, lng) => {
    setPhotoLoading(true);
    try {
      // Chercher des images Mapillary dans un rayon de 50m
      const radius = 50;
      const url = `https://graph.mapillary.com/images?access_token=MLY|5824985657540538|2ca5e88149fc6be2e9edeae0c17a24e2&fields=id,thumb_2048_url,captured_at&bbox=${lng-0.001},${lat-0.001},${lng+0.001},${lat+0.001}&limit=1`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Photo trouvée !
        setBuildingPhoto({
          url: data.data[0].thumb_2048_url,
          source: 'mapillary',
          capturedAt: data.data[0].captured_at
        });
      } else {
        // Pas de photo Mapillary, afficher le placeholder
        setBuildingPhoto(null);
      }
    } catch (error) {
      console.log('Erreur Mapillary:', error);
      setBuildingPhoto(null);
    } finally {
      setPhotoLoading(false);
    }
  };
  
  const handlePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }
    
    // Convertir en base64 pour stockage
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Image = e.target.result;
      
      try {
        // Sauvegarder la photo dans le bâtiment
        await axios.put(buildApiUrl(`${tenantSlug}/prevention/batiments/${batiment.id}`), {
          ...editData,
          photo_url: base64Image
        });
        
        setBuildingPhoto({
          url: base64Image,
          source: 'uploaded',
          capturedAt: new Date().toISOString()
        });
        
        alert('Photo enregistrée avec succès !');
      } catch (error) {
        console.error('Erreur upload photo:', error);
        alert('Erreur lors de l\'enregistrement de la photo');
      }
    };
    reader.readAsDataURL(file);
  };

  const validateAddress = () => {
    // Fonction simplifiée - l'autocomplétion gère tout automatiquement
    if (!editData.adresse_civique || !editData.ville) {
      alert('⚠️ Veuillez utiliser l\'autocomplétion d\'adresse ci-dessus ou saisir manuellement tous les champs.');
      return;
    }
    
    if (editData.latitude && editData.longitude) {
      alert(`✅ Adresse déjà validée!\n\nLat: ${editData.latitude.toFixed(6)}\nLng: ${editData.longitude.toFixed(6)}`);
    } else {
      alert('ℹ️ Utilisez l\'autocomplétion d\'adresse en tapant dans le champ ci-dessus pour obtenir les coordonnées GPS automatiquement.');
    }
  };

  const fetchInspections = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        buildApiUrl(`/${tenantSlug}/prevention/inspections?batiment_id=${batiment.id}&limit=5`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInspections(response.data.slice(0, 5));
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
    }
  };

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    if (['adresse_civique', 'ville', 'code_postal'].includes(field)) {
      setAddressValidated(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Préparer les données à envoyer (nettoyer les champs non nécessaires)
      const dataToSave = { ...editData };
      
      // Si on a une photo uploadée, s'assurer que photo_url est une string
      if (buildingPhoto && buildingPhoto.url) {
        dataToSave.photo_url = buildingPhoto.url;
      } else if (!dataToSave.photo_url) {
        dataToSave.photo_url = '';
      }
      
      // Supprimer les champs qui ne doivent pas être envoyés
      delete dataToSave._id;
      delete dataToSave.__v;
      
      if (isCreating) {
        await onCreate(dataToSave);
      } else {
        await onUpdate(dataToSave);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde du bâtiment. Vérifiez les champs requis.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Style global pour les suggestions Google Places */}
      <style>{`
        .pac-container {
          z-index: 10000 !important;
          font-family: system-ui, -apple-system, sans-serif;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          margin-top: 4px;
        }
        .pac-item {
          padding: 10px 14px;
          cursor: pointer;
          font-size: 14px;
        }
        .pac-item:hover {
          background-color: #f3f4f6;
        }
        .pac-item-query {
          font-weight: 600;
          color: #1f2937;
        }
      `}</style>
      
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}
        onClick={onClose}
      >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec Street View */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '2rem'
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ 
              fontSize: '1.875rem', 
              fontWeight: '700', 
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              {isCreating ? '✚ Nouveau Bâtiment' : `🏢 ${editData.adresse_civique || 'Bâtiment'}`}
            </h2>
            {!isCreating && editData.ville && (
              <p style={{ opacity: 0.9, fontSize: '1rem' }}>
                {editData.ville}, {editData.province} {editData.code_postal}
              </p>
            )}
          </div>
          
          {/* Photo du Bâtiment */}
          <div style={{
            width: '400px',
            height: '250px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            background: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            {photoLoading ? (
              <div style={{ textAlign: 'center', color: 'white' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📷</div>
                <div>Recherche d'une photo...</div>
              </div>
            ) : buildingPhoto ? (
              <>
                <img 
                  src={buildingPhoto.url} 
                  alt="Photo du bâtiment" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '5px',
                  right: '5px',
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}>
                  {buildingPhoto.source === 'mapillary' ? '© Mapillary' : 'Photo uploadée'}
                </div>
                <button
                  onClick={() => setShowPhotoUpload(true)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(255,255,255,0.9)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  📷 Changer
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '15px' }}>🏢</div>
                <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                  Aucune photo disponible pour ce bâtiment
                </div>
                <label style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-block',
                  fontSize: '14px'
                }}>
                  📷 Ajouter une photo
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            )}
            
            {showPhotoUpload && buildingPhoto && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <div style={{ color: 'white', marginBottom: '15px' }}>
                  Remplacer la photo actuelle ?
                </div>
                <label style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginBottom: '10px'
                }}>
                  📷 Choisir une nouvelle photo
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => {
                      handlePhotoUpload(e);
                      setShowPhotoUpload(false);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                <button
                  onClick={() => setShowPhotoUpload(false)}
                  style={{
                    background: 'transparent',
                    color: 'white',
                    border: '1px solid white',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            onClick={onClose}
            style={{
              color: 'white',
              fontSize: '1.5rem',
              padding: '0.5rem',
              minWidth: 'auto'
            }}
          >
            ✕
          </Button>
        </div>

        {/* Actions Bar */}
        {!isCreating && (
          <div style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            backgroundColor: '#f9fafb'
          }}>
            {isEditing ? (
              <>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? '⏳ Enregistrement...' : '✅ Enregistrer'}
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Annuler
                </Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button onClick={() => setIsEditing(true)}>
                    ✏️ Modifier
                  </Button>
                )}
                {onInspect && (
                  <Button variant="outline" onClick={() => onInspect(batiment)}>
                    📋 Inspecter
                  </Button>
                )}
                {onCreatePlan && (
                  <Button variant="outline" onClick={() => onCreatePlan(batiment)}>
                    🗺️ Plan d'intervention
                  </Button>
                )}
                {onViewHistory && (
                  <Button variant="outline" onClick={() => onViewHistory(batiment)}>
                    📜 Historique
                  </Button>
                )}
                {onGenerateReport && (
                  <Button variant="outline" onClick={() => onGenerateReport(batiment)}>
                    📄 Rapport
                  </Button>
                )}
                {canEdit && onDelete && (
                  <Button 
                    variant="destructive" 
                    onClick={() => onDelete(batiment)}
                    style={{ marginLeft: 'auto' }}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Actions pour création */}
        {isCreating && (
          <div style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '0.75rem',
            backgroundColor: '#f9fafb'
          }}>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Création...' : '✅ Créer le bâtiment'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        )}

        {/* Content scrollable */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '2rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
            
            {/* Section 1 - LOCALISATION */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e0e7ff' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📍 Localisation
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Adresse civique * {isEditing && <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>(Commencez à taper pour l'autocomplétion)</span>}
                  </label>
                  <div style={{ width: '100%', position: 'relative' }}>
                    <input
                      ref={autocompleteInputRef}
                      type="text"
                      value={editData.adresse_civique || ''}
                      onChange={(e) => {
                        handleChange('adresse_civique', e.target.value);
                        setAddressValidated(false);
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                      }}
                      placeholder="Commencez à taper votre adresse..."
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        paddingRight: isSearching ? '2.5rem' : '0.75rem',
                        border: addressValidated ? '2px solid #10b981' : '2px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                        backgroundColor: addressValidated ? '#d1fae5' : 'white'
                      }}
                    />
                    {isSearching && (
                      <div style={{ 
                        position: 'absolute', 
                        right: '0.75rem', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        color: '#6b7280'
                      }}>
                        ⏳
                      </div>
                    )}
                    
                    {/* Suggestions dropdown */}
                    {isEditing && showSuggestions && suggestions.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        marginTop: '0.25rem',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000,
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {suggestions.map((suggestion, index) => (
                          <div
                            key={index}
                            onClick={() => handleAddressSelect(suggestion)}
                            style={{
                              padding: '0.75rem',
                              cursor: 'pointer',
                              borderBottom: index < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                              transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                          >
                            <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>
                              {suggestion.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      💡 Conseil: Commencez à taper et sélectionnez une suggestion pour remplir automatiquement tous les champs
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Ville *
                  </label>
                  <input
                    type="text"
                    value={editData.ville || ''}
                    onChange={(e) => handleChange('ville', e.target.value)}
                    onBlur={validateAddress}
                    placeholder="Montréal"
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Province
                  </label>
                  <select
                    value={editData.province || 'QC'}
                    onChange={(e) => handleChange('province', e.target.value)}
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="QC">Québec</option>
                    <option value="ON">Ontario</option>
                    <option value="AB">Alberta</option>
                    <option value="BC">Colombie-Britannique</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={editData.code_postal || ''}
                    onChange={(e) => handleChange('code_postal', e.target.value)}
                    placeholder="J0J 0J0"
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                {addressValidated && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.75rem', backgroundColor: '#d1fae5', borderRadius: '8px', color: '#065f46', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>✅</span>
                    <div>
                      <strong>Adresse validée et géolocalisée</strong>
                      {editData.latitude && editData.longitude && (
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>
                          📍 {editData.latitude.toFixed(6)}, {editData.longitude.toFixed(6)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {isEditing && !addressValidated && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#92400e', fontSize: '0.875rem' }}>
                    ⚠️ Utilisez l'autocomplétion ci-dessus pour valider automatiquement l'adresse et obtenir les coordonnées GPS
                  </div>
                )}
              </div>
            </Card>

            {/* Section 3 - CONTACTS (avant Type) */}
            <Card style={{ padding: '1.5rem', border: '2px solid #fef3c7' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                👥 Contacts
              </h3>
              
              {/* Propriétaire */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#374151', fontSize: '1rem' }}>
                  Propriétaire
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Nom
                    </label>
                    <input
                      type="text"
                      value={editData.proprietaire_nom || ''}
                      onChange={(e) => handleChange('proprietaire_nom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Prénom
                    </label>
                    <input
                      type="text"
                      value={editData.proprietaire_prenom || ''}
                      onChange={(e) => handleChange('proprietaire_prenom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={editData.proprietaire_telephone || ''}
                      onChange={(e) => handleChange('proprietaire_telephone', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Courriel
                    </label>
                    <input
                      type="email"
                      value={editData.proprietaire_courriel || ''}
                      onChange={(e) => handleChange('proprietaire_courriel', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Locataire */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#374151', fontSize: '1rem' }}>
                  Locataire
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Nom
                    </label>
                    <input
                      type="text"
                      value={editData.locataire_nom || ''}
                      onChange={(e) => handleChange('locataire_nom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Prénom
                    </label>
                    <input
                      type="text"
                      value={editData.locataire_prenom || ''}
                      onChange={(e) => handleChange('locataire_prenom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={editData.locataire_telephone || ''}
                      onChange={(e) => handleChange('locataire_telephone', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Courriel
                    </label>
                    <input
                      type="email"
                      value={editData.locataire_courriel || ''}
                      onChange={(e) => handleChange('locataire_courriel', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Gestionnaire */}
              <div>
                <h4 style={{ fontWeight: '600', marginBottom: '0.75rem', color: '#374151', fontSize: '1rem' }}>
                  Gestionnaire
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Nom
                    </label>
                    <input
                      type="text"
                      value={editData.gestionnaire_nom || ''}
                      onChange={(e) => handleChange('gestionnaire_nom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Prénom
                    </label>
                    <input
                      type="text"
                      value={editData.gestionnaire_prenom || ''}
                      onChange={(e) => handleChange('gestionnaire_prenom', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={editData.gestionnaire_telephone || ''}
                      onChange={(e) => handleChange('gestionnaire_telephone', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                      Courriel
                    </label>
                    <input
                      type="email"
                      value={editData.gestionnaire_courriel || ''}
                      onChange={(e) => handleChange('gestionnaire_courriel', e.target.value)}
                      disabled={!isEditing}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Section 2 - TYPE DE BÂTIMENT */}
            <Card style={{ padding: '1.5rem', border: '2px solid #dbeafe' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🏗️ Type de bâtiment
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Type principal *
                  </label>
                  <select
                    value={editData.type_batiment || ''}
                    onChange={(e) => {
                      handleChange('type_batiment', e.target.value);
                      handleChange('sous_type_batiment', ''); // Reset sous-type
                    }}
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    {Object.keys(typesBatiment).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Sous-type
                  </label>
                  <select
                    value={editData.sous_type_batiment || ''}
                    onChange={(e) => handleChange('sous_type_batiment', e.target.value)}
                    disabled={!isEditing || !editData.type_batiment}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    {editData.type_batiment && typesBatiment[editData.type_batiment]?.map(sousType => (
                      <option key={sousType} value={sousType}>{sousType}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            {/* Section 4 - ÉVALUATION DES RISQUES */}
            <Card style={{ padding: '1.5rem', border: `2px solid ${riskColor.border}`, backgroundColor: riskColor.bg }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: riskColor.text,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                ⚠️ Évaluation des risques
              </h3>
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                  Niveau de risque *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  {niveauxRisque.map(niveau => {
                    const color = riskColors[niveau];
                    const isSelected = editData.niveau_risque === niveau;
                    return (
                      <button
                        key={niveau}
                        type="button"
                        onClick={() => isEditing && handleChange('niveau_risque', niveau)}
                        disabled={!isEditing}
                        style={{
                          padding: '1rem 0.75rem',
                          border: `3px solid ${isSelected ? color.border : '#d1d5db'}`,
                          borderRadius: '8px',
                          backgroundColor: isSelected ? color.bg : 'white',
                          color: isSelected ? color.text : '#6b7280',
                          fontWeight: isSelected ? '700' : '500',
                          cursor: isEditing ? 'pointer' : 'not-allowed',
                          transition: 'all 0.2s',
                          fontSize: '0.875rem',
                          textAlign: 'center'
                        }}
                      >
                        {niveau}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Section 5 - INFORMATIONS CADASTRALES */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e5e7eb' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📋 Informations cadastrales
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Cadastre / Matricule
                  </label>
                  <input
                    type="text"
                    value={editData.cadastre_matricule || ''}
                    onChange={(e) => handleChange('cadastre_matricule', e.target.value)}
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Valeur foncière
                  </label>
                  <input
                    type="text"
                    value={editData.valeur_fonciere || ''}
                    onChange={(e) => handleChange('valeur_fonciere', e.target.value)}
                    disabled={!isEditing}
                    placeholder="$"
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Année de construction
                  </label>
                  <input
                    type="number"
                    value={editData.annee_construction || ''}
                    onChange={(e) => handleChange('annee_construction', e.target.value)}
                    disabled={!isEditing}
                    placeholder="2020"
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Nombre d'étages
                  </label>
                  <input
                    type="number"
                    value={editData.nombre_etages || ''}
                    onChange={(e) => handleChange('nombre_etages', e.target.value)}
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Superficie (m²)
                  </label>
                  <input
                    type="number"
                    value={editData.superficie_totale_m2 || ''}
                    onChange={(e) => handleChange('superficie_totale_m2', e.target.value)}
                    disabled={!isEditing}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Section 6 - NOTES ET COMPLÉMENTS */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e5e7eb' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📝 Notes et compléments
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Description de l'activité
                  </label>
                  <textarea
                    value={editData.description_activite || ''}
                    onChange={(e) => handleChange('description_activite', e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    placeholder="Décrivez l'activité principale du bâtiment..."
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Notes générales
                  </label>
                  <textarea
                    value={editData.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    placeholder="Notes additionnelles, particularités, etc..."
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Historique des inspections (pour les bâtiments existants) */}
            {inspections.length > 0 && !isEditing && (
              <Card style={{ padding: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📋 Dernières inspections ({inspections.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {inspections.map(insp => (
                    <div 
                      key={insp.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: '600' }}>
                            📅 {new Date(insp.date_inspection).toLocaleDateString('fr-CA')}
                          </p>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            Type: {insp.type_inspection}
                          </p>
                        </div>
                        <span style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '1rem',
                          fontSize: '0.75rem',
                          backgroundColor: insp.conformite === 'conforme' ? '#d1fae5' : '#fee2e2',
                          color: insp.conformite === 'conforme' ? '#065f46' : '#991b1b'
                        }}>
                          {insp.conformite === 'conforme' ? '✅ Conforme' : '❌ Non-conforme'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
    </>
  );
};

// Export direct du composant - APIProvider est maintenant au niveau racine dans index.js
export default BatimentForm;
