import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const PlanInterventionBuilder = ({ tenantSlug, batiment, existingPlan, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    titre: existingPlan?.titre || `Plan d'intervention - ${batiment?.nom_etablissement || batiment?.adresse_civique}`,
    description: existingPlan?.description || '',
    statut: existingPlan?.statut || 'brouillon',
    risques_identifies: existingPlan?.risques_identifies || [],
    points_acces: existingPlan?.points_acces || [],
    zones_dangereuses: existingPlan?.zones_dangereuses || [],
    equipements: existingPlan?.equipements || [],
    notes_tactiques: existingPlan?.notes_tactiques || '',
  });

  const [layers, setLayers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [map, setMap] = useState(null);
  const [mapType, setMapType] = useState('street'); // 'street' ou 'satellite'

  // Centre la carte sur le bâtiment
  const center = batiment?.latitude && batiment?.longitude 
    ? [batiment.latitude, batiment.longitude]
    : [45.4042, -71.8929]; // Défaut

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCreated = (e) => {
    const { layerType, layer } = e;
    const geojson = layer.toGeoJSON();
    
    // Demander le type et la description de l'élément
    const type = prompt('Type d\'élément:\n1. Point d\'accès\n2. Zone dangereuse\n3. Équipement\n4. Route d\'accès', '1');
    const description = prompt('Description de cet élément:');
    
    if (!description) {
      map.removeLayer(layer);
      return;
    }

    const layerData = {
      id: Date.now().toString(),
      type: layerType,
      geometry: geojson.geometry,
      properties: {
        type: type === '1' ? 'acces' : type === '2' ? 'danger' : type === '3' ? 'equipement' : 'route',
        description
      }
    };

    setLayers(prev => [...prev, layerData]);

    // Ajouter la couche à la catégorie appropriée
    if (type === '1') {
      setFormData(prev => ({
        ...prev,
        points_acces: [...prev.points_acces, { description, geometry: geojson.geometry }]
      }));
    } else if (type === '2') {
      setFormData(prev => ({
        ...prev,
        zones_dangereuses: [...prev.zones_dangereuses, { description, geometry: geojson.geometry }]
      }));
    } else if (type === '3') {
      setFormData(prev => ({
        ...prev,
        equipements: [...prev.equipements, { description, type: 'autre', geometry: geojson.geometry }]
      }));
    }
  };

  const handleEdited = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      const geojson = layer.toGeoJSON();
      console.log('Layer edited:', geojson);
    });
  };

  const handleDeleted = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      console.log('Layer deleted');
    });
  };

  const handleSavePlan = async () => {
    try {
      setSaving(true);
      const token = getTenantToken();

      const planData = {
        ...formData,
        batiment_id: batiment.id,
        layers: layers
      };

      let response;
      if (existingPlan) {
        // Mise à jour
        response = await axios.put(
          buildApiUrl(tenantSlug, `/prevention/plans-intervention/${existingPlan.id}`),
          planData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // Création
        response = await axios.post(
          buildApiUrl(tenantSlug, '/prevention/plans-intervention'),
          planData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      alert('Plan d\'intervention sauvegardé avec succès!');
      if (onSave) onSave(response.data);
      if (onClose) onClose();
    } catch (error) {
      console.error('Erreur sauvegarde plan:', error);
      alert('Erreur lors de la sauvegarde du plan');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForValidation = async () => {
    if (!window.confirm('Soumettre ce plan pour validation?')) return;
    
    try {
      setSaving(true);
      const token = getTenantToken();

      await axios.post(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${existingPlan.id}/soumettre`),
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Plan soumis pour validation!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Erreur soumission plan:', error);
      alert('Erreur lors de la soumission');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#fff',
      zIndex: 10000,
      overflow: 'auto',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px',
          paddingBottom: '15px',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '5px' }}>
              🗺️ {existingPlan ? 'Modifier' : 'Créer'} un Plan d'Intervention
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              🏢 {batiment?.nom_etablissement || batiment?.adresse_civique}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <Button variant="outline" onClick={onClose}>
              ❌ Annuler
            </Button>
            <Button onClick={handleSavePlan} disabled={saving}>
              {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
            </Button>
            {existingPlan && existingPlan.statut === 'brouillon' && (
              <Button onClick={handleSubmitForValidation} disabled={saving}>
                ✅ Soumettre pour validation
              </Button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '20px' }}>
          {/* Carte */}
          <Card>
            <CardHeader>
              <CardTitle>🗺️ Carte Interactive</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <div style={{ 
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: '#1e40af', marginBottom: '8px' }}>
                    📝 Instructions :
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#1e40af' }}>
                    <li>Utilisez les outils à droite pour dessiner sur la carte</li>
                    <li>📍 Marqueur = Point d'accès ou équipement</li>
                    <li>🔴 Cercle = Zone dangereuse</li>
                    <li>🟦 Polygone = Bâtiment ou zone</li>
                    <li>➡️ Ligne = Itinéraire d'accès</li>
                  </ul>
                </div>
                
                {/* Toggle Vue Carte / Satellite */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <button
                    onClick={() => setMapType('street')}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: mapType === 'street' ? '#2563eb' : '#fff',
                      color: mapType === 'street' ? '#fff' : '#333',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: mapType === 'street' ? 'bold' : 'normal'
                    }}
                  >
                    🗺️ Carte
                  </button>
                  <button
                    onClick={() => setMapType('satellite')}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: mapType === 'satellite' ? '#2563eb' : '#fff',
                      color: mapType === 'satellite' ? '#fff' : '#333',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: mapType === 'satellite' ? 'bold' : 'normal'
                    }}
                  >
                    🛰️ Satellite
                  </button>
                </div>
              </div>

              <div style={{ height: '600px', borderRadius: '8px', overflow: 'hidden' }}>
                <MapContainer
                  center={center}
                  zoom={19}
                  maxZoom={21}
                  style={{ width: '100%', height: '100%' }}
                  whenCreated={setMap}
                >
                  {mapType === 'street' ? (
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxZoom={19}
                    />
                  ) : (
                    <TileLayer
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={21}
                    />
                  )}

                  {/* Marqueur du bâtiment */}
                  {batiment?.latitude && batiment?.longitude && (
                    <Marker position={[batiment.latitude, batiment.longitude]}>
                      <Popup>
                        <div style={{ padding: '5px' }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>
                            🏢 {batiment.nom_etablissement || 'Bâtiment'}
                          </h3>
                          <p style={{ margin: '3px 0', fontSize: '12px' }}>
                            {batiment.adresse_civique}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Outils de dessin */}
                  <FeatureGroup>
                    <EditControl
                      position="topright"
                      onCreated={handleCreated}
                      onEdited={handleEdited}
                      onDeleted={handleDeleted}
                      draw={{
                        rectangle: false,
                        circle: true,
                        circlemarker: false,
                        marker: true,
                        polyline: true,
                        polygon: true
                      }}
                      edit={{
                        remove: true,
                        edit: true
                      }}
                    />
                  </FeatureGroup>
                </MapContainer>
              </div>
            </CardContent>
          </Card>

          {/* Formulaire */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>📋 Informations du Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Titre
                    </label>
                    <input
                      type="text"
                      name="titre"
                      value={formData.titre}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Notes Tactiques
                    </label>
                    <textarea
                      name="notes_tactiques"
                      value={formData.notes_tactiques}
                      onChange={handleChange}
                      placeholder="Consignes particulières, dangers, accès..."
                      rows="5"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Résumé des éléments */}
            <Card>
              <CardHeader>
                <CardTitle>📊 Éléments du Plan</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ padding: '10px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e40af' }}>
                      📍 Points d'accès
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>
                      {formData.points_acces.length}
                    </div>
                  </div>

                  <div style={{ padding: '10px', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#92400e' }}>
                      ⚠️ Zones dangereuses
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#92400e' }}>
                      {formData.zones_dangereuses.length}
                    </div>
                  </div>

                  <div style={{ padding: '10px', backgroundColor: '#d1fae5', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#065f46' }}>
                      🔧 Équipements
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>
                      {formData.equipements.length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanInterventionBuilder;
