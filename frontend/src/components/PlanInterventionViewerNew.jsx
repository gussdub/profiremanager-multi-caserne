import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, LayersControl, Polyline, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from './ui/button';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';

const { BaseLayer } = LayersControl;

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Palette de symboles par défaut (même que dans le Builder)
const DEFAULT_SYMBOLS = [
  { id: 'borne_fontaine', name: 'Borne-fontaine', emoji: '🚒', color: '#3B82F6' },
  { id: 'station_manuelle', name: 'Station manuelle', emoji: '🔴', color: '#EF4444' },
  { id: 'echelle_fixe', name: 'Échelle fixe', emoji: '🪜', color: '#F97316' },
  { id: 'robinet_incendie', name: 'Robinet d\'incendie', emoji: '🔧', color: '#06B6D4' },
  { id: 'telephone_secours', name: 'Téléphone de secours', emoji: '📞', color: '#8B5CF6' },
  { id: 'electricite', name: 'Électricité/Hydro-Québec', emoji: '⚡', color: '#EAB308' },
  { id: 'essence', name: 'Essence', emoji: '⛽', color: '#DC2626' },
  { id: 'diesel', name: 'Diesel', emoji: '🛢️', color: '#78716C' },
  { id: 'gaz_naturel', name: 'Gaz naturel', emoji: '🔥', color: '#F59E0B' },
  { id: 'propane', name: 'Propane', emoji: '💨', color: '#22C55E' },
  { id: 'entree_principale', name: 'Entrée principale', emoji: '🚪', color: '#10B981' },
  { id: 'sortie_secours', name: 'Sortie de secours', emoji: '🚨', color: '#EF4444' },
  { id: 'panneau_electrique', name: 'Panneau électrique', emoji: '🔌', color: '#6366F1' },
  { id: 'extincteur', name: 'Extincteur', emoji: '🧯', color: '#DC2626' },
  { id: 'alarme_incendie', name: 'Alarme incendie', emoji: '🔔', color: '#F59E0B' },
  { id: 'gicleurs', name: 'Gicleurs', emoji: '💦', color: '#0EA5E9' },
  { id: 'risque_chimique', name: 'Risque chimique', emoji: '☣️', color: '#A855F7' },
  { id: 'zone_dangereuse', name: 'Zone dangereuse', emoji: '⚠️', color: '#EF4444' },
  { id: 'point_rassemblement', name: 'Point de rassemblement', emoji: '🏁', color: '#22C55E' },
];

const PlanInterventionViewerNew = ({ planId, tenantSlug, onBack, batiment }) => {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

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
      console.log('📋 Plan chargé:', response.data);
      console.log('📋 Bâtiment prop:', batiment);
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
      link.download = `plan_intervention_${numeroPlan}_${batimentSafe}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur export PDF:', err);
    }
  };

  const openImageModal = (imageUrl) => {
    setSelectedImage(imageUrl);
    setShowImageModal(true);
  };

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Chargement du plan d'intervention...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>
        <Button onClick={onBack}>← Retour</Button>
      </div>
    );
  }

  const getStatutInfo = (statut) => {
    const infos = {
      'brouillon': { label: '📝 Brouillon', color: '#6b7280', bg: '#f3f4f6' },
      'en_revision': { label: '🔍 En révision', color: '#f59e0b', bg: '#fef3c7' },
      'valide': { label: '✅ Validé', color: '#22c55e', bg: '#dcfce7' },
      'rejete': { label: '❌ Rejeté', color: '#ef4444', bg: '#fee2e2' }
    };
    return infos[statut] || infos['brouillon'];
  };

  const statutInfo = getStatutInfo(plan.statut);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Button variant="outline" onClick={onBack}>
            ← Retour
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            📄 Exporter PDF
          </Button>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, marginBottom: '0.5rem' }}>
              🗺️ Plan d'intervention
            </h2>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
              {batiment?.nom_etablissement || batiment?.adresse_civique}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
              📅 Créé le {new Date(plan.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <div style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            backgroundColor: statutInfo.bg,
            color: statutInfo.color,
            fontSize: '1rem',
            fontWeight: '600'
          }}>
            {statutInfo.label}
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          
          {/* Photo du bâtiment */}
          {plan.photo_url && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                📸 Photo du bâtiment
              </h3>
              <div 
                style={{
                  width: '100%',
                  maxWidth: '600px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'zoom-in'
                }}
                onClick={() => openImageModal(plan.photo_url)}
              >
                <img 
                  src={plan.photo_url} 
                  alt="Bâtiment"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                />
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                Cliquez pour agrandir
              </p>
            </section>
          )}

          {/* Informations du plan */}
          <section style={{ marginBottom: '2rem' }}>
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              marginBottom: '1rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #e5e7eb'
            }}>
              ℹ️ Informations
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem'
            }}>
              <InfoField label="Statut" value={statutInfo.label} />
              <InfoField label="Date de création" value={new Date(plan.created_at).toLocaleDateString('fr-FR')} />
              {plan.validated_at && (
                <InfoField label="Date de validation" value={new Date(plan.validated_at).toLocaleDateString('fr-FR')} />
              )}
            </div>
          </section>

          {/* Carte avec points d'eau et risques */}
          {batiment && batiment.latitude && batiment.longitude && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                🗺️ Plan d'intervention
              </h3>
              <div style={{ height: '500px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <MapContainer
                  center={[batiment.latitude, batiment.longitude]}
                  zoom={18}
                  maxZoom={22}
                  style={{ height: '100%', width: '100%' }}
                >
                  <LayersControl position="topright">
                    <BaseLayer checked name="🗺️ Plan">
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        maxZoom={22}
                        maxNativeZoom={19}
                      />
                    </BaseLayer>
                    <BaseLayer name="🛰️ Satellite">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                        maxZoom={22}
                        maxNativeZoom={19}
                      />
                    </BaseLayer>
                  </LayersControl>
                  
                  {/* Marqueur du bâtiment */}
                  <Marker position={[batiment.latitude, batiment.longitude]}>
                    <Popup>
                      <strong>{batiment.nom_etablissement || 'Bâtiment'}</strong>
                      <br />
                      {batiment.adresse_civique}
                    </Popup>
                  </Marker>
                  
                  {/* LAYERS - Symboles, lignes, polygones du plan */}
                  {plan.layers && plan.layers.map((layer, idx) => {
                    // Symboles (markers)
                    if (layer.type === 'marker' && layer.geometry?.coordinates) {
                      const [lng, lat] = layer.geometry.coordinates;
                      const symbolId = layer.properties?.symbolId;
                      const symbolData = DEFAULT_SYMBOLS.find(s => s.id === symbolId) || {};
                      
                      // Vérifier si le symbole a une image personnalisée (override)
                      const override = plan.predefined_symbol_overrides?.[symbolId];
                      let iconHtml;
                      
                      if (override?.type === 'image' && override?.value) {
                        // Image personnalisée
                        iconHtml = `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"><img src="${override.value}" style="max-width: 100%; max-height: 100%; object-fit: contain;" /></div>`;
                      } else if (layer.properties?.image) {
                        // Image stockée dans le layer
                        iconHtml = `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"><img src="${layer.properties.image}" style="max-width: 100%; max-height: 100%; object-fit: contain;" /></div>`;
                      } else {
                        // Emoji par défaut
                        const emoji = override?.value || layer.properties?.emoji || symbolData.emoji || '📍';
                        const color = layer.properties?.color || symbolData.color || '#6B7280';
                        iconHtml = `<div style="background: ${color}; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); font-size: 16px;">${emoji}</div>`;
                      }
                      
                      return (
                        <Marker 
                          key={`layer-${layer.id || idx}`}
                          position={[lat, lng]}
                          icon={L.divIcon({
                            className: 'custom-symbol-marker',
                            html: iconHtml,
                            iconSize: [32, 32],
                            iconAnchor: [16, 16]
                          })}
                        >
                          <Popup>
                            <strong>{layer.properties?.name || symbolData.name || 'Symbole'}</strong>
                            {layer.properties?.description && (
                              <>
                                <br />
                                {layer.properties.description}
                              </>
                            )}
                          </Popup>
                        </Marker>
                      );
                    }
                    
                    // Lignes (polylines)
                    if (layer.type === 'polyline' && layer.geometry?.coordinates) {
                      const positions = layer.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                      const color = layer.properties?.color || '#3B82F6';
                      const weight = layer.properties?.weight || 3;
                      const dashArray = layer.properties?.dashArray;
                      
                      return (
                        <Polyline
                          key={`layer-${layer.id || idx}`}
                          positions={positions}
                          pathOptions={{
                            color: color,
                            weight: weight,
                            dashArray: dashArray
                          }}
                        >
                          {layer.properties?.name && (
                            <Popup>
                              <strong>{layer.properties.name}</strong>
                              {layer.properties?.description && (
                                <>
                                  <br />
                                  {layer.properties.description}
                                </>
                              )}
                            </Popup>
                          )}
                        </Polyline>
                      );
                    }
                    
                    // Polygones
                    if (layer.type === 'polygon' && layer.geometry?.coordinates) {
                      const positions = layer.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
                      const color = layer.properties?.color || '#EF4444';
                      const fillColor = layer.properties?.fillColor || color;
                      const fillOpacity = layer.properties?.fillOpacity || 0.3;
                      
                      return (
                        <Polygon
                          key={`layer-${layer.id || idx}`}
                          positions={positions}
                          pathOptions={{
                            color: color,
                            fillColor: fillColor,
                            fillOpacity: fillOpacity
                          }}
                        >
                          {layer.properties?.name && (
                            <Popup>
                              <strong>{layer.properties.name}</strong>
                              {layer.properties?.description && (
                                <>
                                  <br />
                                  {layer.properties.description}
                                </>
                              )}
                            </Popup>
                          )}
                        </Polygon>
                      );
                    }
                    
                    return null;
                  })}
                  
                  {/* Points d'eau (ancien format - rétrocompatibilité) */}
                  {plan.points_eau && plan.points_eau.map((point, idx) => (
                    <Marker 
                      key={`eau-${idx}`}
                      position={[point.latitude, point.longitude]}
                      icon={L.divIcon({
                        className: 'custom-marker',
                        html: '<div style="background: #3b82f6; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">💧</div>',
                        iconSize: [30, 30]
                      })}
                    >
                      <Popup>
                        <strong>💧 Point d'eau</strong>
                        <br />
                        {point.description || 'Point d\'eau'}
                      </Popup>
                    </Marker>
                  ))}
                  
                  {/* Zones à risque (ancien format - rétrocompatibilité) */}
                  {plan.zones_risque && plan.zones_risque.map((zone, idx) => (
                    <Marker 
                      key={`risque-${idx}`}
                      position={[zone.latitude, zone.longitude]}
                      icon={L.divIcon({
                        className: 'custom-marker',
                        html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">⚠️</div>',
                        iconSize: [30, 30]
                      })}
                    >
                      <Popup>
                        <strong>⚠️ Zone à risque</strong>
                        <br />
                        {zone.description || 'Zone à risque'}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              
              {/* Légende des symboles utilisés */}
              {plan.layers && plan.layers.filter(l => l.type === 'marker').length > 0 && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem', 
                  backgroundColor: '#f9fafb', 
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '600', color: '#374151' }}>
                    🏷️ Légende des symboles ({plan.layers.filter(l => l.type === 'marker').length})
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                    {/* Extraire les symboles uniques */}
                    {[...new Set(plan.layers.filter(l => l.type === 'marker').map(l => l.properties?.symbolId))].map(symbolId => {
                      const symbolData = DEFAULT_SYMBOLS.find(s => s.id === symbolId) || {};
                      const override = plan.predefined_symbol_overrides?.[symbolId];
                      const count = plan.layers.filter(l => l.type === 'marker' && l.properties?.symbolId === symbolId).length;
                      
                      return (
                        <div key={symbolId} style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem',
                          padding: '0.375rem 0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb',
                          fontSize: '0.85rem'
                        }}>
                          {override?.type === 'image' && override?.value ? (
                            <img src={override.value} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              width: '24px', 
                              height: '24px', 
                              borderRadius: '50%', 
                              backgroundColor: symbolData.color || '#6B7280',
                              fontSize: '12px'
                            }}>
                              {override?.value || symbolData.emoji || '📍'}
                            </span>
                          )}
                          <span style={{ color: '#374151' }}>{symbolData.name || symbolId}</span>
                          <span style={{ 
                            backgroundColor: '#E5E7EB', 
                            padding: '0.125rem 0.375rem', 
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            color: '#6B7280'
                          }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Description */}
          {plan.description && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                📋 Description
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap'
              }}>
                {plan.description}
              </div>
            </section>
          )}

          {/* Notes tactiques */}
          {plan.notes_tactiques && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb',
                color: '#dc2626'
              }}>
                🎯 Notes Tactiques
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#fef2f2',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                whiteSpace: 'pre-wrap',
                color: '#991b1b'
              }}>
                {plan.notes_tactiques}
              </div>
            </section>
          )}

          {/* Notes générales */}
          {plan.notes && (
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                marginBottom: '1rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                📝 Notes
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                whiteSpace: 'pre-wrap'
              }}>
                {plan.notes}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Modal zoom image */}
      {showImageModal && selectedImage && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem'
          }}
          onClick={() => setShowImageModal(false)}
        >
          <div style={{ 
            position: 'absolute', 
            top: '1rem', 
            right: '1rem',
            display: 'flex',
            gap: '0.5rem',
            zIndex: 10001
          }}>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setZoomLevel(Math.min(zoomLevel + 0.25, 3));
              }}
              style={{ backgroundColor: 'white' }}
            >
              🔍 +
            </Button>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setZoomLevel(Math.max(zoomLevel - 0.25, 0.5));
              }}
              style={{ backgroundColor: 'white' }}
            >
              🔍 -
            </Button>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation();
                setZoomLevel(1);
              }}
              style={{ backgroundColor: 'white' }}
            >
              ↺ Reset
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowImageModal(false)}
            >
              ✕ Fermer
            </Button>
          </div>
          <img 
            src={selectedImage}
            alt="Zoom"
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              transform: `scale(${zoomLevel})`,
              transition: 'transform 0.2s',
              cursor: 'zoom-in'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

const InfoField = ({ label, value }) => (
  <div style={{
    padding: '0.75rem',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '6px'
  }}>
    <div style={{
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
      marginBottom: '0.25rem',
      letterSpacing: '0.05em'
    }}>
      {label}
    </div>
    <div style={{
      fontSize: '0.875rem',
      color: '#111827',
      fontWeight: '500'
    }}>
      {value || '—'}
    </div>
  </div>
);

export default PlanInterventionViewerNew;
