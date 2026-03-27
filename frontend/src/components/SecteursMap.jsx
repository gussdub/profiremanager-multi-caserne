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

  // Composant pour ajuster la vue aux marqueurs (une seule fois au montage)
  const FitBounds = ({ batiments }) => {
    const map = useMap();
    const [hasAdjusted, setHasAdjusted] = useState(false);
    
    useEffect(() => {
      if (!hasAdjusted && batiments && batiments.length > 0) {
        const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
        if (batimentsAvecCoords.length > 0) {
          const bounds = batimentsAvecCoords.map(b => [b.latitude, b.longitude]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          setHasAdjusted(true);
        }
      }
    }, [batiments, map, hasAdjusted]);
    
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
      if (layer._map) {
        layer._map.removeLayer(layer);
      }
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
    <div style={{ width: '100%', height: '100%', minHeight: '500px', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
      {/* Toggle Vue Carte / Satellite */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        left: '10px', 
        zIndex: 100000,
        display: 'flex',
        gap: '2px',
        backgroundColor: 'white',
        padding: '3px',
        borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
      }}>
        <button
          onClick={() => setMapType('street')}
          style={{
            padding: '8px 14px',
            backgroundColor: mapType === 'street' ? '#1e293b' : '#fff',
            color: mapType === 'street' ? '#fff' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          Carte
        </button>
        <button
          onClick={() => setMapType('satellite')}
          style={{
            padding: '8px 14px',
            backgroundColor: mapType === 'satellite' ? '#1e293b' : '#fff',
            color: mapType === 'satellite' ? '#fff' : '#64748b',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          Satellite
        </button>
      </div>

      {/* Légende des secteurs */}
      {secteurs && secteurs.length > 0 && (
        <div style={{ 
          position: 'absolute', 
          bottom: '16px', 
          left: '16px', 
          zIndex: 100000,
          backgroundColor: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
          padding: '14px 18px',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxWidth: '260px',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#374151', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Secteurs
          </h4>
          {secteurs.map(s => {
            const count = batiments.filter(b => b.secteur_id === s.id).length;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', cursor: 'pointer' }}
                onClick={() => onSecteurClick && onSecteurClick(s)}
              >
                <div style={{ 
                  width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0,
                  backgroundColor: s.couleur || '#3b82f6',
                  border: '2px solid ' + (s.couleur || '#3b82f6'),
                  opacity: 0.8
                }} />
                <span style={{ fontSize: '13px', color: '#374151', flex: 1 }}>{s.nom}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600' }}>{count}</span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '4px', flexShrink: 0, backgroundColor: '#9ca3af', opacity: 0.5 }} />
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>Sans secteur</span>
            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: '600' }}>
              {batiments.filter(b => !b.secteur_id).length}
            </span>
          </div>
        </div>
      )}

      {/* Stats rapides */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 100000,
        backgroundColor: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        padding: '10px 16px',
        borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        display: 'flex',
        gap: '16px',
        fontSize: '13px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '16px' }}>{batiments.filter(b => b.latitude && b.longitude).length}</div>
          <div style={{ color: '#9ca3af', fontSize: '11px' }}>sur la carte</div>
        </div>
        <div style={{ width: '1px', backgroundColor: '#e5e7eb' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '16px' }}>{secteurs.length}</div>
          <div style={{ color: '#9ca3af', fontSize: '11px' }}>secteurs</div>
        </div>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        maxZoom={19}
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
        scrollWheelZoom={true}
        whenCreated={setMap}
      >
        {/* Tuiles de carte selon le type */}
        {mapType === 'street' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        ) : (
          <TileLayer
            attribution='Tiles &copy; Esri'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        
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
                fillOpacity: 0.25,
                weight: 3,
                dashArray: editMode ? '5, 10' : null
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
                <div style={{ padding: '4px', maxWidth: '260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: secteur.couleur || '#3b82f6' }} />
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>
                      {secteur.nom}
                    </h3>
                  </div>
                  {secteur.description && (
                    <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#6b7280', lineHeight: '1.4' }}>
                      {secteur.description}
                    </p>
                  )}
                  <div style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                    <strong>{batiments.filter(b => b.secteur_id === secteur.id).length}</strong> batiment(s)
                  </div>
                  {secteur.preventionniste_assigne_nom ? (
                    <div style={{ 
                      display: 'inline-block', padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
                      backgroundColor: '#ecfdf5', color: '#065f46', fontWeight: '600', marginTop: '4px'
                    }}>
                      {secteur.preventionniste_assigne_nom}
                    </div>
                  ) : (
                    <div style={{ 
                      display: 'inline-block', padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
                      backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '600', marginTop: '4px'
                    }}>
                      Sans preventionniste
                    </div>
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
              <div style={{ padding: '4px', maxWidth: '260px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>
                  {batiment.nom_etablissement || 'Sans nom'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                  <div style={{ color: '#374151' }}>
                    <span style={{ color: '#9ca3af' }}>Adresse : </span>{batiment.adresse_civique || 'N/A'}
                  </div>
                  <div style={{ color: '#374151' }}>
                    <span style={{ color: '#9ca3af' }}>Ville : </span>{batiment.ville || 'N/A'}
                  </div>
                  {batiment.groupe_occupation && (
                    <div style={{ color: '#374151' }}>
                      <span style={{ color: '#9ca3af' }}>Groupe : </span>{batiment.groupe_occupation}
                    </div>
                  )}
                </div>
                {batiment.preventionniste_assigne_id ? (
                  <div style={{ 
                    display: 'inline-block', padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
                    backgroundColor: '#ecfdf5', color: '#065f46', fontWeight: '600', marginTop: '8px'
                  }}>
                    Preventionniste assigne
                  </div>
                ) : (
                  <div style={{ 
                    display: 'inline-block', padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
                    backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '600', marginTop: '8px'
                  }}>
                    Sans preventionniste
                  </div>
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
