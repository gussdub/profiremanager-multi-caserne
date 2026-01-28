import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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

const PlanInterventionViewer = ({ planId, tenantSlug, onClose }) => {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadPlan();
  }, [planId]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${planId}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPlan(response.data);
    } catch (err) {
      console.error('Erreur chargement plan:', err);
      setError('Impossible de charger le plan d\'intervention');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${planId}/export-pdf`),
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      // Générer le nom du fichier avec l'adresse ou le nom du bâtiment
      const batimentInfo = batiment?.adresse_civique || batiment?.nom_etablissement || batiment?.nom || 'batiment';
      const villeInfo = batiment?.ville || '';
      const batimentSafe = `${batimentInfo}${villeInfo ? '_' + villeInfo : ''}`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      const numeroPlan = plan?.numero_plan || new Date().toISOString().slice(0, 10).replace(/-/g, '');
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `plan_intervention_${numeroPlan}_${batimentSafe}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF');
    }
  };

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Chargement du plan...</p>
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <p style={{ marginBottom: '1.5rem' }}>{error || 'Plan introuvable'}</p>
          <Button onClick={onClose}>Fermer</Button>
        </div>
      </div>
    );
  }

  // Fonction pour créer les marqueurs depuis les layers
  const renderMarkers = () => {
    if (!plan.layers || plan.layers.length === 0) return null;

    return plan.layers.map(layer => {
      if (layer.type !== 'symbol') return null;

      const props = layer.properties || {};
      const [lng, lat] = layer.geometry.coordinates;

      // Créer l'icône
      let icon;
      if (props.image) {
        icon = L.divIcon({
          html: `<img src="${props.image}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5));" />`,
          className: 'custom-image-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
      } else if (props.symbol) {
        icon = L.divIcon({
          html: `<div style="font-size: 32px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${props.symbol}</div>`,
          className: 'custom-emoji-marker',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });
      }

      return (
        <Marker key={layer.id} position={[lat, lng]} icon={icon}>
          <Popup>
            <div>
              <strong>{props.label || 'Symbole'}</strong>
              {props.note && <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>{props.note}</p>}
            </div>
          </Popup>
        </Marker>
      );
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: '160px',
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      zIndex: 10000,
      overflow: 'auto'
    }}>
      <div style={{
        minHeight: '100vh',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
      }}>
        {/* En-tête */}
        <Card>
          <CardHeader style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <CardTitle>Plan d'Intervention - {plan.numero_plan || plan.id}</CardTitle>
              <div style={{ fontSize: '0.9rem', color: '#6B7280', marginTop: '0.5rem' }}>
                Statut: <span style={{
                  padding: '0.25rem 0.5rem',
                  background: plan.statut === 'valide' ? '#D1FAE5' : '#FEF3C7',
                  color: plan.statut === 'valide' ? '#065F46' : '#92400E',
                  borderRadius: '4px',
                  fontWeight: 'bold'
                }}>
                  {plan.statut?.toUpperCase() || 'BROUILLON'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button onClick={handleExportPDF}>
                📄 Export PDF
              </Button>
              <Button variant="outline" onClick={onClose}>
                ✕ Fermer
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Carte */}
        <Card>
          <CardHeader>
            <CardTitle>🗺️ Carte Interactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: '500px', borderRadius: '8px', overflow: 'hidden' }}>
              <MapContainer
                center={[plan.centre_lat || 45.5, plan.centre_lng || -73.5]}
                zoom={18}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  url="https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                  subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                  attribution='&copy; Google'
                />
                {renderMarkers()}
              </MapContainer>
            </div>
          </CardContent>
        </Card>

        {/* Informations */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {/* Points d'accès */}
          {plan.points_acces && plan.points_acces.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>📍 Points d'Accès</CardTitle>
              </CardHeader>
              <CardContent>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {plan.points_acces.map((point, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      {point.description}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Zones dangereuses */}
          {plan.zones_dangereuses && plan.zones_dangereuses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>⚠️ Zones Dangereuses</CardTitle>
              </CardHeader>
              <CardContent>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {plan.zones_dangereuses.map((zone, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      {zone.description}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Équipements */}
          {plan.equipements && plan.equipements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>🔧 Équipements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  {plan.equipements.map((equip, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                      {equip.description}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Photos */}
        {plan.photos && plan.photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>📷 Galerie Photos ({plan.photos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '1rem'
              }}>
                {plan.photos.map((photo, idx) => (
                  <div key={idx} style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'white'
                  }}>
                    <img
                      src={photo.url}
                      alt={photo.titre}
                      style={{
                        width: '100%',
                        height: '200px',
                        objectFit: 'cover'
                      }}
                    />
                    <div style={{ padding: '1rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold' }}>
                        {photo.titre}
                      </h4>
                      {photo.description && (
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6B7280' }}>
                          {photo.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PlanInterventionViewer;
