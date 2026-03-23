import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, LayersControl, Polygon, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const { BaseLayer, Overlay } = LayersControl;

// Fix pour les icônes par défaut de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Icônes personnalisées pour les marqueurs
const createIcon = (color, emoji = '🏢') => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
    ">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

// Icônes par statut
const icons = {
  a_inspecter: createIcon('#ef4444', '🔴'), // Rouge - à inspecter
  en_attente: createIcon('#f97316', '🟠'), // Orange - en attente validation
  valide: createIcon('#22c55e', '🟢'), // Vert - validé
  avec_plan: createIcon('#3b82f6', '📋'), // Bleu - avec plan d'intervention
  default: createIcon('#6b7280', '🏢') // Gris - par défaut
};

// Composant pour ajuster le zoom de la carte
const MapBounds = ({ batiments }) => {
  const map = useMap();
  
  useEffect(() => {
    if (batiments && batiments.length > 0) {
      const bounds = batiments
        .filter(b => b.latitude && b.longitude)
        .map(b => [b.latitude, b.longitude]);
      
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [batiments, map]);
  
  return null;
};

// Déterminer la couleur/icône d'un bâtiment
const getBatimentIcon = (batiment, batimentsAvecPlan) => {
  // Priorité 1: Plan d'intervention
  if ((batimentsAvecPlan && batimentsAvecPlan.has(batiment.id)) || batiment.plan_intervention_id || batiment.has_plan_intervention) {
    return icons.avec_plan;
  }
  
  // Priorité 2: Statut d'inspection
  const status = batiment.derniere_inspection_statut;
  if (status === 'en_attente_validation') {
    return icons.en_attente;
  }
  if (status === 'valide' || status === 'conforme') {
    return icons.valide;
  }
  
  // Par défaut: à inspecter
  if (!batiment.derniere_inspection_date) {
    return icons.a_inspecter;
  }
  
  return icons.default;
};

// Obtenir le label de statut
const getStatutLabel = (batiment, batimentsAvecPlan) => {
  if ((batimentsAvecPlan && batimentsAvecPlan.has(batiment.id)) || batiment.plan_intervention_id || batiment.has_plan_intervention) {
    return '📋 Plan d\'intervention';
  }
  
  const status = batiment.derniere_inspection_statut;
  if (status === 'en_attente_validation') {
    return '🟠 En attente de validation';
  }
  if (status === 'valide' || status === 'conforme') {
    return '🟢 Validé';
  }
  if (!batiment.derniere_inspection_date) {
    return '🔴 À inspecter';
  }
  
  return '⚪ Statut inconnu';
};

const CarteBatiments = ({ batiments, batimentsAvecPlan, onBatimentClick, secteurs = [], preventionnistes = [] }) => {
  const [stats, setStats] = useState({ rouge: 0, orange: 0, vert: 0, bleu: 0 });
  const [showSecteurs, setShowSecteurs] = useState(true);

  useEffect(() => {
    // Calculer les statistiques
    const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
    const rouge = batimentsAvecCoords.filter(b => !b.derniere_inspection_date && !(batimentsAvecPlan && batimentsAvecPlan.has(b.id)) && !b.plan_intervention_id).length;
    const orange = batimentsAvecCoords.filter(b => b.derniere_inspection_statut === 'en_attente_validation').length;
    const vert = batimentsAvecCoords.filter(b => b.derniere_inspection_statut === 'valide' || b.derniere_inspection_statut === 'conforme').length;
    const bleu = batimentsAvecCoords.filter(b => (batimentsAvecPlan && batimentsAvecPlan.has(b.id)) || b.plan_intervention_id || b.has_plan_intervention).length;
    setStats({ rouge, orange, vert, bleu });
  }, [batiments, batimentsAvecPlan]);

  // Trouver le préventionniste par ID
  const getPreventionniste = (id) => {
    return preventionnistes.find(p => p.id === id);
  };

  // Convertir la géométrie GeoJSON en coordonnées Leaflet
  const getPolygonCoords = (secteur) => {
    if (!secteur.geometry) return null;
    
    try {
      const geometry = secteur.geometry;
      if (geometry.type === 'Polygon' && geometry.coordinates) {
        // GeoJSON utilise [lng, lat], Leaflet utilise [lat, lng]
        return geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
      }
    } catch (e) {
      console.error('Erreur parsing géométrie secteur:', e);
    }
    return null;
  };

  // Centre par défaut (Québec)
  const defaultCenter = [45.5, -73.5];
  
  // Filtrer les bâtiments avec coordonnées
  const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);

  if (batimentsAvecCoords.length === 0) {
    return (
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '3rem',
        textAlign: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <p style={{ fontSize: '1.1rem', color: '#6b7280' }}>
          🗺️ Aucun bâtiment avec coordonnées GPS à afficher
        </p>
        <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Assurez-vous que les adresses ont été validées avec le géocodage
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {/* Légende */}
      <div style={{
        display: 'flex',
        gap: '1.5rem',
        padding: '0.75rem 1rem',
        background: '#f8fafc',
        borderBottom: '1px solid #e5e7eb',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontWeight: '600', color: '#374151' }}>Légende:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🔴</span>
          <span style={{ fontSize: '0.875rem' }}>À inspecter ({stats.rouge})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🟠</span>
          <span style={{ fontSize: '0.875rem' }}>En attente ({stats.orange})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '1.1rem' }}>🟢</span>
          <span style={{ fontSize: '0.875rem' }}>Validé ({stats.vert})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ fontSize: '1.1rem' }}>📋</span>
          <span style={{ fontSize: '0.875rem' }}>Avec plan ({stats.bleu})</span>
        </div>
        {secteurs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showSecteurs} 
                onChange={(e) => setShowSecteurs(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.875rem' }}>🗺️ Secteurs ({secteurs.length})</span>
            </label>
          </div>
        )}
      </div>

      {/* Légende des secteurs si activée */}
      {showSecteurs && secteurs.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          padding: '0.5rem 1rem',
          background: '#f0f9ff',
          borderBottom: '1px solid #e5e7eb',
          flexWrap: 'wrap',
          fontSize: '0.8rem'
        }}>
          <span style={{ fontWeight: '600', color: '#0369a1' }}>Secteurs:</span>
          {secteurs.map(secteur => {
            const prev = getPreventionniste(secteur.preventionniste_assigne_id);
            return (
              <div key={secteur.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: secteur.couleur || '#3b82f6',
                  border: '1px solid rgba(0,0,0,0.2)'
                }} />
                <span>{secteur.nom}</span>
                {prev && (
                  <span style={{ color: '#6b7280' }}>
                    ({prev.prenom} {prev.nom})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Carte */}
      <div style={{ height: '500px' }}>
        <MapContainer
          center={defaultCenter}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
        >
          <LayersControl position="topright">
            <BaseLayer checked name="OpenStreetMap">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </BaseLayer>
            <BaseLayer name="Satellite">
              <TileLayer
                attribution='&copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </BaseLayer>
          </LayersControl>

          <MapBounds batiments={batimentsAvecCoords} />

          {/* Affichage des secteurs géographiques (polygones) */}
          {showSecteurs && secteurs.map(secteur => {
            const coords = getPolygonCoords(secteur);
            if (!coords) return null;
            
            const prev = getPreventionniste(secteur.preventionniste_assigne_id);
            
            return (
              <Polygon
                key={secteur.id}
                positions={coords}
                pathOptions={{
                  color: secteur.couleur || '#3b82f6',
                  weight: 2,
                  opacity: 0.8,
                  fillColor: secteur.couleur || '#3b82f6',
                  fillOpacity: 0.15
                }}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ 
                      fontWeight: '600', 
                      fontSize: '1rem',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <span style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        background: secteur.couleur || '#3b82f6'
                      }} />
                      {secteur.nom}
                    </div>
                    {secteur.description && (
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        {secteur.description}
                      </p>
                    )}
                    <div style={{ 
                      borderTop: '1px solid #e5e7eb', 
                      paddingTop: '0.5rem',
                      marginTop: '0.5rem'
                    }}>
                      {prev ? (
                        <div style={{ fontSize: '0.875rem' }}>
                          <span style={{ fontWeight: '500' }}>👤 Préventionniste:</span>
                          <div style={{ color: '#374151' }}>
                            {prev.prenom} {prev.nom}
                          </div>
                          {prev.telephone && (
                            <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                              📞 {prev.telephone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: '#9ca3af',
                          fontStyle: 'italic'
                        }}>
                          Aucun préventionniste assigné
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {batimentsAvecCoords.map(batiment => (
            <Marker
              key={batiment.id}
              position={[batiment.latitude, batiment.longitude]}
              icon={getBatimentIcon(batiment, batimentsAvecPlan)}
              eventHandlers={{
                click: () => onBatimentClick && onBatimentClick(batiment)
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
                <div style={{ padding: '0.25rem', minWidth: '200px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {batiment.nom_etablissement || batiment.adresse_civique}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    {batiment.adresse_civique}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    {batiment.ville}
                  </div>
                  <div style={{ 
                    marginTop: '0.5rem', 
                    paddingTop: '0.5rem', 
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    gap: '0.5rem',
                    flexWrap: 'wrap'
                  }}>
                    {batiment.groupe_occupation && (
                      <span style={{
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem'
                      }}>
                        Groupe {batiment.groupe_occupation}
                      </span>
                    )}
                    {batiment.niveau_risque && (
                      <span style={{
                        background: batiment.niveau_risque === 'Faible' ? '#dcfce7' : 
                                   batiment.niveau_risque === 'Moyen' ? '#fef9c3' :
                                   batiment.niveau_risque === 'Élevé' ? '#fed7aa' : '#fecaca',
                        color: batiment.niveau_risque === 'Faible' ? '#166534' : 
                               batiment.niveau_risque === 'Moyen' ? '#854d0e' :
                               batiment.niveau_risque === 'Élevé' ? '#c2410c' : '#991b1b',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem'
                      }}>
                        {batiment.niveau_risque}
                      </span>
                    )}
                  </div>
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.8rem',
                    fontWeight: '500'
                  }}>
                    {getStatutLabel(batiment, batimentsAvecPlan)}
                  </div>
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default CarteBatiments;
