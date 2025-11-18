import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { MapContainer, TileLayer, Marker, Popup, Polygon, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SecteursMap = ({ 
  batiments = [], 
  secteurs = [],
  center = [45.4042, -71.8929],
  onBatimentClick,
  onSecteurCreate,
  onSecteurUpdate,
  onSecteurDelete,
  onSecteurClick,
  editMode = false
}) => {
  const [map, setMap] = useState(null);
  const [mapType, setMapType] = useState('street'); // 'street' ou 'satellite'

  // Composant pour ajuster la vue aux marqueurs
  const FitBounds = ({ batiments }) => {
    const map = useMap();
    
    useEffect(() => {
      if (batiments && batiments.length > 0) {
        const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
        if (batimentsAvecCoords.length > 0) {
          const bounds = batimentsAvecCoords.map(b => [b.latitude, b.longitude]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }
    }, [batiments, map]);
    
    return null;
  };

  // Gestion des événements de dessin
  const handleCreated = (e) => {
    const { layerType, layer } = e;
    
    if (layerType === 'polygon') {
      const geojson = layer.toGeoJSON();
      console.log('Polygon created:', geojson);
      
      if (onSecteurCreate) {
        onSecteurCreate(geojson.geometry);
      }
      
      // Supprimer le layer temporaire car on va le recréer depuis le backend
      map.removeLayer(layer);
    }
  };

  const handleEdited = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      const geojson = layer.toGeoJSON();
      const secteurId = layer.options.secteurId;
      
      console.log('Polygon edited:', secteurId, geojson);
      
      if (onSecteurUpdate && secteurId) {
        onSecteurUpdate(secteurId, geojson.geometry);
      }
    });
  };

  const handleDeleted = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      const secteurId = layer.options.secteurId;
      
      console.log('Polygon deleted:', secteurId);
      
      if (onSecteurDelete && secteurId) {
        onSecteurDelete(secteurId);
      }
    });
  };

  // Convertir les coordonnées GeoJSON en format Leaflet
  const convertGeoJSONToLeaflet = (geometry) => {
    if (!geometry || !geometry.coordinates) return [];
    
    // GeoJSON utilise [longitude, latitude], Leaflet utilise [latitude, longitude]
    return geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
        scrollWheelZoom={true}
        whenCreated={setMap}
      >
        {/* OpenStreetMap tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Secteurs géographiques existants */}
        {secteurs && secteurs.map(secteur => {
          const positions = convertGeoJSONToLeaflet(secteur.geometry);
          if (positions.length === 0) return null;
          
          return (
            <Polygon
              key={secteur.id}
              positions={positions}
              pathOptions={{
                color: secteur.couleur || '#3b82f6',
                fillColor: secteur.couleur || '#3b82f6',
                fillOpacity: 0.2,
                weight: 2
              }}
              secteurId={secteur.id}
              eventHandlers={{
                click: () => {
                  if (onSecteurClick) {
                    onSecteurClick(secteur);
                  }
                }
              }}
            >
              <Popup>
                <div style={{ padding: '5px', maxWidth: '250px' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 'bold' }}>
                    📍 {secteur.nom}
                  </h3>
                  {secteur.description && (
                    <p style={{ margin: '5px 0', fontSize: '13px' }}>
                      {secteur.description}
                    </p>
                  )}
                  {secteur.preventionniste_assigne_nom ? (
                    <p style={{ margin: '5px 0', fontSize: '13px', color: 'green' }}>
                      <strong>👨‍🚒 {secteur.preventionniste_assigne_nom}</strong>
                    </p>
                  ) : (
                    <p style={{ margin: '5px 0', fontSize: '13px', color: 'orange' }}>
                      <strong>⚠ Sans préventionniste</strong>
                    </p>
                  )}
                </div>
              </Popup>
            </Polygon>
          );
        })}
        
        {/* Outils de dessin (mode édition uniquement) */}
        {editMode && (
          <FeatureGroup>
            <EditControl
              position="topright"
              onCreated={handleCreated}
              onEdited={handleEdited}
              onDeleted={handleDeleted}
              draw={{
                rectangle: false,
                circle: false,
                circlemarker: false,
                marker: false,
                polyline: false,
                polygon: {
                  allowIntersection: false,
                  showArea: true,
                  shapeOptions: {
                    color: '#3b82f6',
                    fillOpacity: 0.2
                  }
                }
              }}
              edit={{
                remove: true,
                edit: true
              }}
            />
          </FeatureGroup>
        )}
        
        {/* Marqueurs pour chaque bâtiment */}
        {batiments && batiments.filter(b => b.latitude && b.longitude).map(batiment => (
          <Marker 
            key={batiment.id}
            position={[batiment.latitude, batiment.longitude]}
            eventHandlers={{
              click: () => {
                if (onBatimentClick) {
                  onBatimentClick(batiment);
                }
              }
            }}
          >
            <Popup>
              <div style={{ padding: '5px', maxWidth: '250px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 'bold' }}>
                  {batiment.nom_etablissement || 'Sans nom'}
                </h3>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Adresse:</strong> {batiment.adresse_civique || 'N/A'}
                </p>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Ville:</strong> {batiment.ville || 'N/A'}
                </p>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Groupe:</strong> {batiment.groupe_occupation || 'N/A'}
                </p>
                {batiment.preventionniste_assigne_id ? (
                  <p style={{ margin: '5px 0', fontSize: '13px', color: 'green' }}>
                    <strong>✓ Préventionniste assigné</strong>
                  </p>
                ) : (
                  <p style={{ margin: '5px 0', fontSize: '13px', color: 'orange' }}>
                    <strong>⚠ Sans préventionniste</strong>
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        
        <FitBounds batiments={batiments} />
      </MapContainer>
    </div>
  );
};

export default SecteursMap;
