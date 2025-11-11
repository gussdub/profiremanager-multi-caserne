import React, { useState, useEffect, useCallback, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';
import { Card } from './ui/card';
import axios from 'axios';
import { buildApiUrl } from '../utils/api';

// Composant interne qui gère la carte avec les drawing tools
const MapComponent = ({ 
  mapCenter, 
  zoom, 
  selectedTool, 
  elements, 
  onMapClick, 
  onRouteComplete, 
  onZoneComplete 
}) => {
  const map = useMap();
  const drawingLibrary = useMapsLibrary('drawing');
  const [drawingManager, setDrawingManager] = useState(null);

  // Initialiser le Drawing Manager quand la bibliothèque est chargée
  useEffect(() => {
    if (!drawingLibrary || !map) return;

    const manager = new drawingLibrary.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polylineOptions: {
        strokeColor: '#6366f1',
        strokeWeight: 4,
        strokeOpacity: 0.8,
        editable: true
      },
      polygonOptions: {
        fillColor: '#f97316',
        fillOpacity: 0.3,
        strokeColor: '#f97316',
        strokeWeight: 3,
        editable: true
      }
    });

    manager.setMap(map);
    setDrawingManager(manager);

    // Écouter les événements de dessin
    window.google.maps.event.addListener(manager, 'polylinecomplete', (polyline) => {
      const path = polyline.getPath();
      const coordinates = [];
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push({ lat: point.lat(), lng: point.lng() });
      }
      onRouteComplete(coordinates);
      polyline.setMap(null); // Supprimer la polyline temporaire
    });

    window.google.maps.event.addListener(manager, 'polygoncomplete', (polygon) => {
      const path = polygon.getPath();
      const coordinates = [];
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        coordinates.push({ lat: point.lat(), lng: point.lng() });
      }
      onZoneComplete(coordinates);
      polygon.setMap(null); // Supprimer le polygon temporaire
    });

    return () => {
      if (manager) {
        manager.setMap(null);
      }
    };
  }, [drawingLibrary, map]);

  // Mettre à jour le mode de dessin selon l'outil sélectionné
  useEffect(() => {
    if (!drawingManager) return;

    if (selectedTool === 'route') {
      drawingManager.setDrawingMode(window.google.maps.drawing.OverlayType.POLYLINE);
    } else if (selectedTool === 'zone') {
      drawingManager.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON);
    } else {
      drawingManager.setDrawingMode(null);
    }
  }, [selectedTool, drawingManager]);

  return null;
};

const PlanInterventionBuilder = ({ batimentId, tenantSlug, onClose }) => {
  const [plan, setPlan] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const [elements, setElements] = useState({
    hydrants: [],
    sorties: [],
    matieres_dangereuses: [],
    generatrices: [],
    gaz_naturel: [],
    reservoirs_propane: [],
    vehicules: [],
    routes_acces: [],
    zones_danger: [],
    photos: []
  });
  const [batiment, setBatiment] = useState(null);
  const [showElementForm, setShowElementForm] = useState(false);
  const [currentElement, setCurrentElement] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 45.5017, lng: -73.5673 });
  const [zoom, setZoom] = useState(18);

  const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // Outils disponibles
  const tools = [
    { id: 'hydrant', icon: '💧', label: 'Hydrant', color: '#3b82f6' },
    { id: 'sortie', icon: '🚪', label: 'Sortie', color: '#10b981' },
    { id: 'matiere_dangereuse', icon: '⚠️', label: 'Matière dangereuse', color: '#ef4444' },
    { id: 'generatrice', icon: '⚡', label: 'Génératrice', color: '#f59e0b' },
    { id: 'gaz_naturel', icon: '🔥', label: 'Gaz naturel', color: '#8b5cf6' },
    { id: 'reservoir_propane', icon: '🛢️', label: 'Réservoir propane', color: '#ec4899' },
    { id: 'vehicule', icon: '🚒', label: 'Véhicule', color: '#dc2626' },
    { id: 'route', icon: '🛣️', label: 'Route d\'accès', color: '#6366f1' },
    { id: 'zone', icon: '⭕', label: 'Zone danger', color: '#f97316' },
    { id: 'photo', icon: '📷', label: 'Photo', color: '#14b8a6' }
  ];

  useEffect(() => {
    if (batimentId) {
      fetchBatiment();
    }
  }, [batimentId]);

  const fetchBatiment = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        buildApiUrl(`/${tenantSlug}/prevention/batiments/${batimentId}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBatiment(response.data);
      
      // Si le bâtiment a des coordonnées, centrer la carte dessus
      if (response.data.latitude && response.data.longitude) {
        setMapCenter({
          lat: response.data.latitude,
          lng: response.data.longitude
        });
      } else {
        // Sinon, géocoder l'adresse
        geocodeAddress(response.data);
      }
    } catch (error) {
      console.error('Erreur chargement bâtiment:', error);
    }
  };

  const geocodeAddress = async (bat) => {
    try {
      const token = localStorage.getItem('token');
      const adresse = `${bat.adresse_civique}, ${bat.ville}`;
      const response = await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/geocode`),
        { adresse_complete: adresse },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMapCenter({
        lat: response.data.latitude,
        lng: response.data.longitude
      });
      
      // Mettre à jour les coordonnées du bâtiment
      await axios.put(
        buildApiUrl(`/${tenantSlug}/prevention/batiments/${batimentId}/coordinates`),
        { 
          latitude: response.data.latitude, 
          longitude: response.data.longitude 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Erreur géocodage:', error);
    }
  };

  const handleMapClick = useCallback((event) => {
    // Ne pas gérer les clics si on est en mode dessin de route ou zone
    if (selectedTool === 'route' || selectedTool === 'zone') return;
    
    if (!selectedTool) return;

    const lat = event.detail.latLng.lat;
    const lng = event.detail.latLng.lng;

    // Créer un nouvel élément selon l'outil sélectionné
    const newElement = {
      id: `temp-${Date.now()}`,
      type_element: selectedTool,
      latitude: lat,
      longitude: lng,
      notes: ''
    };

    setCurrentElement(newElement);
    setShowElementForm(true);
  }, [selectedTool]);

  const handleRouteComplete = useCallback((coordinates) => {
    const newRoute = {
      id: `route-${Date.now()}`,
      type_element: 'route',
      coordinates: coordinates,
      nom: 'Route d\'accès',
      notes: ''
    };
    
    setElements(prev => ({
      ...prev,
      routes_acces: [...prev.routes_acces, newRoute]
    }));
    
    setSelectedTool(null);
  }, []);

  const handleZoneComplete = useCallback((coordinates) => {
    const newZone = {
      id: `zone-${Date.now()}`,
      type_element: 'zone',
      coordinates: coordinates,
      nom: 'Zone de danger',
      notes: ''
    };
    
    setElements(prev => ({
      ...prev,
      zones_danger: [...prev.zones_danger, newZone]
    }));
    
    setSelectedTool(null);
  }, []);

  const handleSaveElement = (elementData) => {
    const elementType = elementData.type_element;
    const pluralType = elementType + 's'; // Simple pluralization
    
    setElements(prev => ({
      ...prev,
      [pluralType]: [...prev[pluralType], elementData]
    }));

    setShowElementForm(false);
    setCurrentElement(null);
    setSelectedTool(null);
  };

  const handleCreatePlan = async () => {
    try {
      const token = localStorage.getItem('token');
      const planData = {
        batiment_id: batimentId,
        nom: `Plan ${batiment?.nom_etablissement || ''}`,
        centre_lat: mapCenter.lat,
        centre_lng: mapCenter.lng,
        notes_generales: ''
      };

      const response = await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention`),
        planData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPlan(response.data);
      alert('Plan créé avec succès!');
    } catch (error) {
      console.error('Erreur création plan:', error);
      alert('Erreur lors de la création du plan');
    }
  };

  const handleSavePlan = async () => {
    if (!plan) {
      await handleCreatePlan();
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const updateData = {
        ...elements,
        notes_generales: plan.notes_generales || ''
      };

      await axios.put(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention/${plan.id}`),
        updateData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Plan sauvegardé avec succès!');
    } catch (error) {
      console.error('Erreur sauvegarde plan:', error);
      alert('Erreur lors de la sauvegarde du plan');
    }
  };

  const handleSubmitValidation = async () => {
    if (!plan) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention/${plan.id}/valider`),
        { commentaires: '' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Plan soumis pour validation!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Erreur soumission validation:', error);
      alert('Erreur lors de la soumission');
    }
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '1rem', 
        backgroundColor: '#1f2937', 
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
          Plan d'Intervention - {batiment?.nom_etablissement || 'Nouveau'}
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button onClick={handleSavePlan} style={{ backgroundColor: '#3b82f6' }}>
            💾 Sauvegarder
          </Button>
          {plan && plan.statut === 'brouillon' && (
            <Button onClick={handleSubmitValidation} style={{ backgroundColor: '#10b981' }}>
              ✅ Soumettre validation
            </Button>
          )}
          {onClose && (
            <Button onClick={onClose} variant="outline">
              ✖️ Fermer
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ 
        padding: '0.75rem', 
        backgroundColor: '#f3f4f6',
        borderBottom: '2px solid #e5e7eb',
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <span style={{ fontWeight: '600', marginRight: '1rem' }}>Outils :</span>
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={() => setSelectedTool(tool.id)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: selectedTool === tool.id ? `3px solid ${tool.color}` : '2px solid #d1d5db',
              backgroundColor: selectedTool === tool.id ? tool.color : 'white',
              color: selectedTool === tool.id ? 'white' : '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            title={tool.label}
          >
            <span style={{ fontSize: '1.2rem' }}>{tool.icon}</span>
            {tool.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* Map */}
        <div style={{ flex: 1, position: 'relative' }}>
          <Map
            style={{ width: '100%', height: '100%' }}
            defaultCenter={mapCenter}
            center={mapCenter}
            defaultZoom={zoom}
            zoom={zoom}
            mapId="plan_intervention_map"
            onClick={handleMapClick}
            mapTypeId="satellite"
          >
            <MapComponent 
              mapCenter={mapCenter}
              zoom={zoom}
              selectedTool={selectedTool}
              elements={elements}
              onMapClick={handleMapClick}
              onRouteComplete={handleRouteComplete}
              onZoneComplete={handleZoneComplete}
            />
            
            {/* Afficher les éléments ponctuels (markers) */}
            {Object.entries(elements).map(([type, items]) => 
              items.filter(item => item.latitude && item.longitude).map(item => (
                <AdvancedMarker
                  key={item.id}
                  position={{ lat: item.latitude, lng: item.longitude }}
                >
                  <div style={{
                    backgroundColor: 'white',
                    padding: '0.5rem',
                    borderRadius: '50%',
                    border: '3px solid #3b82f6',
                    fontSize: '1.5rem',
                    cursor: 'pointer'
                  }}>
                    {getElementIcon(type)}
                  </div>
                </AdvancedMarker>
              ))
            )}
          </Map>

          {/* Instructions overlay */}
          {selectedTool && (
            <div style={{
              position: 'absolute',
              top: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              color: 'white',
              padding: '1rem 1.5rem',
              borderRadius: '0.75rem',
              zIndex: 10,
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
              fontSize: '0.95rem',
              fontWeight: '500'
            }}>
              {selectedTool === 'route' ? (
                <span>🛣️ Cliquez pour tracer la route d'accès (double-clic pour terminer)</span>
              ) : selectedTool === 'zone' ? (
                <span>⭕ Cliquez pour délimiter la zone de danger (double-clic pour terminer)</span>
              ) : (
                <span>📍 Cliquez sur la carte pour placer : {tools.find(t => t.id === selectedTool)?.label}</span>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ 
          width: '350px', 
          backgroundColor: 'white',
          borderLeft: '2px solid #e5e7eb',
          overflowY: 'auto',
          padding: '1rem'
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            📋 Éléments du plan
          </h2>
          
          {Object.entries(elements).map(([type, items]) => (
            items.length > 0 && (
              <div key={type} style={{ marginBottom: '1rem' }}>
                <h3 style={{ 
                  fontSize: '1rem', 
                  fontWeight: '600',
                  marginBottom: '0.5rem',
                  color: '#374151'
                }}>
                  {getElementIcon(type)} {formatElementType(type)} ({items.length})
                </h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {items.map((item, idx) => (
                    <li 
                      key={item.id}
                      style={{
                        padding: '0.5rem',
                        backgroundColor: '#f9fafb',
                        marginBottom: '0.25rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem'
                      }}
                    >
                      {item.numero || `#${idx + 1}`} - {item.notes || 'Sans nom'}
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}

          {Object.values(elements).every(arr => arr.length === 0) && (
            <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>
              Aucun élément ajouté. Utilisez les outils ci-dessus pour ajouter des éléments au plan.
            </p>
          )}
        </div>
      </div>

      {/* Element Form Modal */}
      {showElementForm && currentElement && (
        <ElementFormModal
          element={currentElement}
          onSave={handleSaveElement}
          onCancel={() => {
            setShowElementForm(false);
            setCurrentElement(null);
            setSelectedTool(null);
          }}
        />
      )}
    </div>
  );
};

// Helper functions
const getElementIcon = (type) => {
  const icons = {
    hydrants: '💧',
    sorties: '🚪',
    matieres_dangereuses: '⚠️',
    generatrices: '⚡',
    gaz_naturel: '🔥',
    reservoirs_propane: '🛢️',
    vehicules: '🚒',
    routes_acces: '🛣️',
    zones_danger: '⭕',
    photos: '📷'
  };
  return icons[type] || '📍';
};

const formatElementType = (type) => {
  const labels = {
    hydrants: 'Hydrants',
    sorties: 'Sorties',
    matieres_dangereuses: 'Matières dangereuses',
    generatrices: 'Génératrices',
    gaz_naturel: 'Gaz naturel',
    reservoirs_propane: 'Réservoirs propane',
    vehicules: 'Véhicules',
    routes_acces: 'Routes d\'accès',
    zones_danger: 'Zones danger',
    photos: 'Photos'
  };
  return labels[type] || type;
};

// Element Form Modal Component
const ElementFormModal = ({ element, onSave, onCancel }) => {
  const [formData, setFormData] = useState(element);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <Card style={{ 
        width: '500px', 
        maxHeight: '80vh',
        overflow: 'auto',
        padding: '1.5rem',
        backgroundColor: 'white'
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Ajouter {element.type_element}
        </h2>
        
        <form onSubmit={handleSubmit}>
          {/* Formulaire selon le type */}
          {element.type_element === 'hydrant' && (
            <HydrantForm data={formData} onChange={handleChange} />
          )}
          {element.type_element === 'sortie' && (
            <SortieForm data={formData} onChange={handleChange} />
          )}
          {element.type_element === 'matiere_dangereuse' && (
            <MatiereDangereeuseForm data={formData} onChange={handleChange} />
          )}
          
          {/* Generic fields */}
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
              Notes
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.25rem',
                minHeight: '60px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <Button type="submit" style={{ flex: 1, backgroundColor: '#3b82f6' }}>
              ✅ Ajouter
            </Button>
            <Button type="button" onClick={onCancel} variant="outline" style={{ flex: 1 }}>
              ❌ Annuler
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

// Specific form components
const HydrantForm = ({ data, onChange }) => (
  <>
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Type d'hydrant *
      </label>
      <select
        value={data.type_hydrant || ''}
        onChange={(e) => onChange('type_hydrant', e.target.value)}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        required
      >
        <option value="">Sélectionner...</option>
        <option value="borne_fontaine">Borne fontaine</option>
        <option value="borne_seche">Borne sèche</option>
        <option value="aspiration">Aspiration</option>
      </select>
    </div>

    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Débit *
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="number"
          value={data.debit || ''}
          onChange={(e) => onChange('debit', parseFloat(e.target.value))}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
          required
        />
        <select
          value={data.unite_debit || 'gal/min'}
          onChange={(e) => onChange('unite_debit', e.target.value)}
          style={{ width: '120px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        >
          <option value="gal/min">gal/min</option>
          <option value="L/min">L/min</option>
        </select>
      </div>
    </div>
  </>
);

const SortieForm = ({ data, onChange }) => (
  <>
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Type de sortie *
      </label>
      <select
        value={data.type_sortie || ''}
        onChange={(e) => onChange('type_sortie', e.target.value)}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        required
      >
        <option value="">Sélectionner...</option>
        <option value="urgence">Urgence</option>
        <option value="principale">Principale</option>
        <option value="secondaire">Secondaire</option>
      </select>
    </div>

    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Largeur (m)
      </label>
      <input
        type="number"
        step="0.1"
        value={data.largeur_m || ''}
        onChange={(e) => onChange('largeur_m', parseFloat(e.target.value))}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
      />
    </div>
  </>
);

const MatiereDangereeuseForm = ({ data, onChange }) => (
  <>
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Nom du produit *
      </label>
      <input
        type="text"
        value={data.nom_produit || ''}
        onChange={(e) => onChange('nom_produit', e.target.value)}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        required
      />
    </div>

    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Classe de danger
      </label>
      <select
        value={data.classe_danger || ''}
        onChange={(e) => onChange('classe_danger', e.target.value)}
        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
      >
        <option value="">Sélectionner...</option>
        <option value="Inflammable">Inflammable</option>
        <option value="Toxique">Toxique</option>
        <option value="Corrosif">Corrosif</option>
        <option value="Explosif">Explosif</option>
        <option value="Comburant">Comburant</option>
      </select>
    </div>

    <div style={{ marginBottom: '1rem' }}>
      <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: '500' }}>
        Quantité
      </label>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="number"
          value={data.quantite || ''}
          onChange={(e) => onChange('quantite', parseFloat(e.target.value))}
          style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        />
        <select
          value={data.unite_quantite || 'L'}
          onChange={(e) => onChange('unite_quantite', e.target.value)}
          style={{ width: '100px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
        >
          <option value="L">Litres</option>
          <option value="kg">kg</option>
          <option value="m³">m³</option>
        </select>
      </div>
    </div>
  </>
);

export default PlanInterventionBuilder;
