import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import PointEauModal from './PointEauModal';
import InspectionBorneSecheModal from './InspectionBorneSecheModal';

// Hook toast fallback
const useToast = () => {
  return {
    toast: ({ title, description, variant }) => {
      if (variant === 'destructive') {
        alert(`Erreur: ${description}`);
      } else {
        console.log(`${title}: ${description}`);
      }
    }
  };
};

const CarteApprovisionnementEau = ({ user }) => {
  // user passé en props
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [currentView, setCurrentView] = useState('carte');
  const [pointsEau, setPointsEau] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showPointModal, setShowPointModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
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

  // Écouter l'événement de sélection sur carte depuis le modal
  useEffect(() => {
    const handleSelectLocation = (event) => {
      const { callback } = event.detail;
      
      // Stocker la callback dans le state
      window._mapSelectionCallback = callback;
      
      // Afficher un message
      toast({
        title: "Mode sélection",
        description: "Cliquez sur la carte pour définir l'emplacement"
      });
    };
    
    window.addEventListener('selectLocationOnMap', handleSelectLocation);
    
    return () => {
      window.removeEventListener('selectLocationOnMap', handleSelectLocation);
      delete window._mapSelectionCallback;
    };
  }, []);

  // Filtrer les points selon la recherche
  const filteredPoints = pointsEau.filter(point => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      point.numero_identification?.toLowerCase().includes(term) ||
      point.adresse?.toLowerCase().includes(term) ||
      point.ville?.toLowerCase().includes(term)
    );
  });

  // Déterminer la couleur du marqueur selon l'état ET le statut
  const getMarkerColor = (point) => {
    // Priorité à l'état du point
    if (point.etat === 'fonctionnelle') return '#10b981'; // Vert
    if (point.etat === 'attention') return '#f59e0b'; // Orange
    if (point.etat === 'hors_service') return '#ef4444'; // Rouge
    
    // Sinon, utiliser statut_couleur (basé sur inspections)
    switch (point.statut_couleur) {
      case 'vert': return '#10b981';
      case 'orange': return '#f59e0b';
      case 'rouge': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  // URLs des icônes
  const iconUrls = {
    borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
    borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
    point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
  };

  // Déterminer l'icône selon le type
  const getTypeIcon = (type) => {
    return iconUrls[type] || iconUrls.point_eau_statique;
  };

  // Obtenir l'icône Leaflet personnalisée avec badge coloré
  const getLeafletIcon = (point) => {
    const iconUrls = {
      borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
      borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
      point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
    };

    const badgeColor = getMarkerColor(point);

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <img src="${iconUrls[point.type] || iconUrls.point_eau_statique}" style="width: 40px; height: 40px;" />
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
        // Si on est en mode sélection (callback définie)
        if (window._mapSelectionCallback) {
          window._mapSelectionCallback(e.latlng.lat, e.latlng.lng);
          delete window._mapSelectionCallback;
          
          // Réouvrir le modal avec les coordonnées
          openPointModal({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            type: 'borne_fontaine',
            ville: 'Shefford'
          });
          return;
        }
        
        // Sinon, comportement normal : ouvrir modal pour admin/superviseur
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
        maxZoom={19}
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
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        )}
        <MapClickHandler />
        {filteredPoints.map(point => (
          point.latitude && point.longitude && (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={getLeafletIcon(point)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <img src={getTypeIcon(point.type)} alt="icon" style={{ width: '32px', height: '32px' }} />
                    {point.numero_identification}
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
                      background: getMarkerColor(point) + '20',
                      color: getMarkerColor(point)
                    }}>
                      {point.etat || 'Non défini'}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        // Sur iOS, ouvrir Apple Plans
                        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                        if (isIOS) {
                          e.preventDefault();
                          window.location.href = `maps://maps.apple.com/?daddr=${point.latitude},${point.longitude}&dirflg=d`;
                        }
                      }}
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
                      🗺️ Navigation GPS
                    </a>
                    {/* Bouton Modifier - Admin/Superviseur seulement */}
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <button
                        onClick={() => {
                          openPointModal(point);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          marginTop: '0.5rem'
                        }}
                      >
                        ✏️ Modifier
                      </button>
                    )}
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
                <td style={{ padding: '1rem' }}>
                  <img src={getTypeIcon(point.type)} alt="icon" style={{ width: '40px', height: '40px' }} />
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
                    background: getMarkerColor(point) + '20',
                    color: getMarkerColor(point)
                  }}>
                    {point.etat === 'fonctionnelle' && '✓ Fonctionnelle'}
                    {point.etat === 'attention' && '⚠ Attention'}
                    {point.etat === 'hors_service' && '✗ Hors service'}
                    {!point.etat && '◯ Non défini'}
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

      {/* Barre d'outils - Responsive */}
      <div style={{ 
        background: 'white', 
        padding: 'clamp(0.75rem, 2vw, 1rem)', 
        borderRadius: '12px', 
        marginBottom: '1rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'center'
      }}>
        {/* Bouton Ajouter - Caché pour employés */}
        {!['employe', 'pompier'].includes(user?.role) && (
          <button
            onClick={() => openPointModal(null)}
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap'
            }}
          >
            ➕ Ajouter
          </button>
        )}

        {/* Filtre Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.6rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            minWidth: '120px',
            flex: '1 1 auto',
            maxWidth: '160px'
          }}
        >
          <option value="all">Tous types</option>
          <option value="borne_fontaine">Bornes-fontaines</option>
          <option value="borne_seche">Bornes sèches</option>
          <option value="point_eau_statique">Points statiques</option>
        </select>

        {/* Filtre Statut */}
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          style={{
            padding: '0.6rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem',
            minWidth: '110px',
            flex: '1 1 auto',
            maxWidth: '140px'
          }}
        >
          <option value="all">Tous états</option>
          <option value="fonctionnel">Fonctionnel</option>
          <option value="defectueux">Défectueux</option>
          <option value="inaccessible">Inaccessible</option>
        </select>

        {/* Recherche */}
        <input
          type="text"
          placeholder="🔍 Rechercher..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: '1 1 150px',
            minWidth: '120px',
            padding: '0.6rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.85rem'
          }}
        />

        {/* Toggle Vue */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setCurrentView('carte')}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              border: currentView === 'carte' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'carte' ? '#eff6ff' : 'white',
              color: currentView === 'carte' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap'
            }}
          >
            🗺️
          </button>
          <button
            onClick={() => setCurrentView('liste')}
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: '8px',
              border: currentView === 'liste' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'liste' ? '#eff6ff' : 'white',
              color: currentView === 'liste' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap'
            }}
          >
            📋
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

      {/* Modal Ajout/Modification Point d'Eau */}
      {showPointModal && (
        <PointEauModal
          point={selectedPoint}
          tenantSlug={tenantSlug}
          apiPost={apiPost}
          apiPut={apiPut}
          apiGet={apiGet}
          userRole={user?.role}
          onClose={() => {
            setShowPointModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            setShowPointModal(false);
            setSelectedPoint(null);
            fetchPointsEau();
            fetchStats();
            toast({
              title: "Succès",
              description: selectedPoint?.id ? "Point d'eau modifié avec succès" : "Point d'eau créé avec succès"
            });
          }}
        />
      )}

      {showInspectionModal && selectedPoint?.type === 'borne_seche' && (
        <InspectionBorneSecheModal
          borne={selectedPoint}
          tenantSlug={tenantSlug}
          userRole={user?.role}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
          onSuccess={() => {
            fetchPointsEau();
            fetchStats();
            setShowInspectionModal(false);
            setSelectedPoint(null);
            toast({
              title: "Succès",
              description: "Inspection enregistrée avec succès"
            });
          }}
        />
      )}
    </div>
  );
};


const Prevention = () => {
  // user passé en props
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState('dashboard');
  const [batiments, setBatiments] = useState([]);
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [filteredBatimentId, setFilteredBatimentId] = useState(null); // Pour filtrer inspections/plans par bâtiment
  const [showBatimentModal, setShowBatimentModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null); // Pour afficher le viewer de plan
  const [grilles, setGrilles] = useState([]);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [viewMode, setViewMode] = useState('liste'); // 'liste' ou 'carte'
  const [googleMap, setGoogleMap] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fonction pour ouvrir le modal d'un bâtiment
  const openBatimentModal = (batiment) => {
    setSelectedBatiment(batiment);
    setShowBatimentModal(true);
  };

  const fetchBatiments = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/batiments');
      setBatiments(data);
    } catch (error) {
      console.error('Erreur chargement bâtiments:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les bâtiments",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/notifications');
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    }
  };

  useEffect(() => {
    fetchBatiments();
    fetchStats();
    fetchNotifications();
    fetchGrilles();
  }, [tenantSlug]);

  const fetchGrilles = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
      setGrilles(data);
    } catch (error) {
      console.error('Erreur chargement grilles:', error);
    }
  };

  // Déterminer la grille par défaut selon le type de bâtiment
  const getDefaultGrille = (batiment) => {
    if (!grilles || grilles.length === 0) return null;
    
    // Si une seule grille, la retourner
    if (grilles.length === 1) return grilles[0];
    
    // Mapping type de bâtiment → grille
    const grilleMapping = {
      'C': 'residentiel',
      'A-1': 'residentiel',
      'A-2': 'soins',
      'B': 'soins',
      'D': 'commercial',
      'E': 'commercial',
      'F-1': 'industriel_elevé',
      'F-2': 'industriel_moyen',
      'F-3': 'industriel_faible',
      'I': 'assemblée'
    };
    
    const key = batiment.sous_groupe || batiment.groupe_occupation;
    const grilleType = grilleMapping[key];
    
    // Chercher une grille correspondante
    const grille = grilles.find(g => 
      g.nom.toLowerCase().includes(grilleType) ||
      g.type_batiment === grilleType
    );
    
    // Si pas trouvé, retourner la première grille générique
    return grille || grilles.find(g => g.nom.toLowerCase().includes('générique')) || grilles[0];
  };

  // Ouvrir le nouveau composant InspectionTerrain pour réaliser l'inspection
  const handleInspectBatiment = async (batiment) => {
    try {
      setLoading(true);
      
      // Déterminer la grille par défaut
      const grille = getDefaultGrille(batiment);
      
      if (!grille) {
        toast({
          title: "Erreur",
          description: "Aucune grille d'inspection disponible. Créez-en une dans les paramètres.",
          variant: "destructive"
        });
        return;
      }

      // Stocker les données dans localStorage pour InspectionTerrain
      localStorage.setItem('inspection_terrain_data', JSON.stringify({
        grille: grille,
        batiment: batiment,
        inspecteur_id: user.id,
        date_inspection: new Date().toISOString().split('T')[0]
      }));

      // Naviguer vers la vue inspection-terrain
      setCurrentView('inspection-terrain');

      toast({
        title: "Inspection démarrée",
        description: `Inspection pour ${batiment.nom_etablissement || batiment.adresse_civique}`
      });

    } catch (error) {
      console.error('Erreur démarrage inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de démarrer l'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch(currentView) {
      case 'dashboard':
        return (
          <div className="prevention-dashboard">
            {/* Notifications en haut */}
            {notifications.length > 0 && (
              <div className="notifications-section">
                <h3>🔔 Notifications ({notifications.length})</h3>
                <div className="notifications-list">
                  {notifications.slice(0, 5).map(notif => (
                    <div key={notif.id} className={`notification-item priority-${notif.priority}`}>
                      <div className="notif-icon">
                        {notif.priority === 'urgent' && '🚨'}
                        {notif.priority === 'high' && '⚠️'}
                        {notif.priority === 'medium' && '📌'}
                      </div>
                      <div className="notif-content">
                        <h4>{notif.titre}</h4>
                        <p>{notif.description}</p>
                        {notif.jours_retard && (
                          <span className="notif-badge retard">{notif.jours_retard} jours de retard</span>
                        )}
                        {notif.jours_restants !== undefined && (
                          <span className="notif-badge warning">{notif.jours_restants} jours restants</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {notifications.length > 5 && (
                    <div className="more-notifications">
                      +{notifications.length - 5} notification(s) supplémentaire(s)
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-icon">🏢</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.batiments?.total || batiments.length}</div>
                  <div className="stat-label">Bâtiments</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📋</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.inspections?.total || 0}</div>
                  <div className="stat-label">Inspections totales</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚠️</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.non_conformites?.ouvertes || 0}</div>
                  <div className="stat-label">Non-conformités ouvertes</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.inspections?.taux_conformite || 100}%</div>
                  <div className="stat-label">Taux conformité</div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'batiments':
        return (
          <div className="prevention-batiments">
            <div className="page-header">
              <h2>🏢 Gestion des Bâtiments</h2>
              <div className="batiments-header-controls">
                <div className="view-mode-toggle">
                  <button
                    onClick={() => setViewMode('carte')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      background: viewMode === 'carte' ? '#fff' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: viewMode === 'carte' ? '600' : 'normal',
                      boxShadow: viewMode === 'carte' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Vue carte"
                  >
                    🗺️
                  </button>
                  <button
                    onClick={() => setViewMode('liste')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      background: viewMode === 'liste' ? '#fff' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: viewMode === 'liste' ? '600' : 'normal',
                      boxShadow: viewMode === 'liste' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Vue liste"
                  >
                    📋
                  </button>
                </div>
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    try {
                      setExporting(true);
                      const token = localStorage.getItem(`${tenantSlug}_token`);
                      const response = await fetch(
                        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=batiments`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                      );
                      if (!response.ok) throw new Error('Erreur export');
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `batiments_${new Date().toISOString().split('T')[0]}.xlsx`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      toast({ title: "Export réussi", description: "Le fichier Excel a été téléchargé" });
                    } catch (error) {
                      console.error('Erreur export:', error);
                      toast({ title: "Erreur", description: "Impossible d'exporter les données", variant: "destructive" });
                    } finally {
                      setExporting(false);
                    }
                  }}
                  disabled={exporting}
                >
                  {exporting ? '⏳ Export...' : '📥 Exporter Excel'}
                </Button>
                <Button onClick={() => setCurrentView('nouveau-batiment')}>
                  ➕ Nouveau Bâtiment
                </Button>
              </div>
            </div>
            
            {(() => {
              // Filtrer les bâtiments selon le rôle de l'utilisateur
              const isPreventionnisteOrAdmin = user?.est_preventionniste || user?.role === 'admin' || user?.role === 'superviseur';
              const filteredBatiments = isPreventionnisteOrAdmin 
                ? batiments 
                : batiments.filter(b => b.niveau_risque === 'Faible');
              
              if (loading) {
                return <div className="loading">Chargement des bâtiments...</div>;
              }
              
              if (batiments.length === 0) {
                return (
                  <div className="empty-state">
                    <p>Aucun bâtiment enregistré</p>
                    {isPreventionnisteOrAdmin && (
                      <Button onClick={() => setCurrentView('nouveau-batiment')}>
                        Ajouter le premier bâtiment
                      </Button>
                    )}
                  </div>
                );
              }
              
              if (filteredBatiments.length === 0 && !isPreventionnisteOrAdmin) {
                return (
                  <div className="empty-state">
                    <p>Aucun bâtiment à risque faible à inspecter</p>
                  </div>
                );
              }
              
              return viewMode === 'liste' ? (
                <div className="batiments-table" style={{background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse'}}>
                    <thead>
                      <tr style={{background: '#f9fafb', borderBottom: '2px solid #e5e7eb'}}>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>📫 Adresse</th>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>🏢 Type</th>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>📅 Dernière inspection</th>
                        <th style={{padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem'}}>⚡ Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatiments.map(batiment => (
                      <tr key={batiment.id} style={{borderBottom: '1px solid #e5e7eb', transition: 'background 0.2s'}} onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                        <td style={{padding: '1rem'}}>
                          <div>
                            <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>{batiment.nom_etablissement || batiment.adresse_civique}</div>
                            <div style={{fontSize: '0.813rem', color: '#6b7280'}}>{batiment.ville}</div>
                          </div>
                        </td>
                        <td style={{padding: '1rem'}}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '12px',
                            fontSize: '0.813rem',
                            fontWeight: '500'
                          }}>
                            {batiment.groupe_occupation}
                          </span>
                        </td>
                        <td style={{padding: '1rem', fontSize: '0.875rem', color: '#6b7280'}}>
                          {batiment.derniere_inspection ? new Date(batiment.derniere_inspection).toLocaleDateString('fr-FR') : 'Aucune'}
                        </td>
                        <td style={{padding: '1rem'}}>
                          <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedBatiment(batiment);
                                setShowBatimentModal(true);
                              }}
                            >
                              👁️ Voir
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => {
                                setSelectedBatiment(batiment);
                                setCurrentView('nouvelle-inspection');
                              }}
                            >
                              📋 Inspecter
                            </Button>
                          </div>
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="batiments-list">
                    <div className="batiments-grid">
                      {filteredBatiments.map(batiment => (
                      <div key={batiment.id} className="batiment-card">
                        <div className="batiment-header">
                          <h4>{batiment.nom_etablissement || batiment.adresse_civique}</h4>
                          <span className="groupe-badge">{batiment.groupe_occupation}</span>
                        </div>
                        <div className="batiment-info">
                          <p>{batiment.adresse_civique}</p>
                          <p>{batiment.ville}</p>
                        </div>
                        <div className="batiment-actions">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedBatiment(batiment);
                              setShowBatimentModal(true);
                            }}
                          >
                            Voir
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => {
                              setSelectedBatiment(batiment);
                              setCurrentView('nouvelle-inspection');
                            }}
                          >
                            Inspecter
                          </Button>
                        </div>
                      </div>
                      ))}
                    </div>
                </div>
              );
            })()}
          </div>
        );
      
      case 'preventionnistes':
        return <GestionPreventionnistes />;
      
      case 'assigner-preventionniste':
        return (
          <div className="prevention-assigner">
            <div className="page-header">
              <h2>👤 Assigner un Préventionniste</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('preventionnistes')}
              >
                ← Retour
              </Button>
            </div>
            
            <AssignerPreventionniste onAssign={() => {
              setCurrentView('preventionnistes');
            }} />
          </div>
        );

      case 'grilles':
        return (
          <div className="prevention-grilles">
            <div className="page-header">
              <h2>📋 Grilles d'Inspection</h2>
              <Button onClick={() => setCurrentView('nouvelle-grille')}>
                ➕ Nouvelle Grille
              </Button>
            </div>
            
            <GrillesInspection />
          </div>
        );
      
      case 'nouvelle-grille':
        return (
          <div className="prevention-nouvelle-grille">
            <div className="page-header">
              <h2>📝 Créer une Grille d'Inspection</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('grilles')}
              >
                ← Retour aux grilles
              </Button>
            </div>
            
            <CreateGrilleInspection 
              onSave={() => setCurrentView('grilles')} 
              onViewTemplates={() => setCurrentView('grilles')}
            />
          </div>
        );

      case 'import':
        return (
          <div className="prevention-import">
            <div className="page-header">
              <h2>🏢 Importer des bâtiments</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('dashboard')}
              >
                ← Retour
              </Button>
            </div>
            
            <ImportBatiments onImportComplete={() => {
              setCurrentView('batiments');
              fetchBatiments();
            }} />
          </div>
        );
      
      case 'inspections':
        return <ListeInspections setCurrentView={setCurrentView} />;
      
      case 'detail-inspection':
        return <DetailInspection inspectionId={localStorage.getItem('detail_inspection_id')} setCurrentView={setCurrentView} />;
      
      case 'nouvelle-inspection':
        return (
          <NouvelleInspection 
            setCurrentView={setCurrentView}
            batiments={batiments}
            selectedBatiment={selectedBatiment}
            onBatimentSelected={setSelectedBatiment}
          />
        );
      
      case 'realiser-inspection':
        return (
          <RealiserInspection 
            setCurrentView={setCurrentView}
          />
        );

      case 'inspection-terrain':
        // Nouveau composant d'inspection terrain (mobile-friendly)
        const inspectionData = JSON.parse(localStorage.getItem('inspection_terrain_data') || '{}');
        return (
          <InspectionTerrain
            tenantSlug={tenantSlug}
            grille={inspectionData.grille}
            batiment={inspectionData.batiment}
            onComplete={() => {
              localStorage.removeItem('inspection_terrain_data');
              setCurrentView('calendrier');
              toast({
                title: "Inspection terminée",
                description: "Les données ont été enregistrées"
              });
            }}
            onCancel={() => {
              localStorage.removeItem('inspection_terrain_data');
              setCurrentView('calendrier');
            }}
          />
        );
      
      case 'calendrier':
        return <PlanificationView 
          tenantSlug={tenantSlug}
          setCurrentView={setCurrentView}
          batiments={batiments}
          filteredBatimentId={filteredBatimentId}
          setFilteredBatimentId={setFilteredBatimentId}
          openBatimentModal={openBatimentModal}
          parametres={tenant?.config?.prevention_settings}
          user={user}
        />;
      
      case 'non-conformites':
        return <NonConformites tenantSlug={tenantSlug} toast={toast} openBatimentModal={openBatimentModal} />;
      
      case 'plans-intervention':
        console.log('🎯 Prevention - Rendu PlansIntervention avec tenantSlug:', tenantSlug);
        return <PlansIntervention tenantSlug={tenantSlug} filteredBatimentId={filteredBatimentId} setFilteredBatimentId={setFilteredBatimentId} />;
      
      case 'rapports':
        return <ModuleRapports setCurrentView={setCurrentView} />;
      
      case 'nouveau-batiment':
        // Ouvrir le modal de création de bâtiment et retourner la vue batiments
        if (!showBatimentModal) {
          setShowBatimentModal(true);
          setSelectedBatiment(null); // null pour créer un nouveau
        }
        // Retourner la vue batiments (avec le modal ouvert)
        return (
          <div className="prevention-content">
            <div className="page-header">
              <div>
                <h2>🏢 Gestion des bâtiments</h2>
                <p>Cadastre des bâtiments à risque</p>
              </div>
            </div>
            <div className="batiments-grid">
              {batiments.map(batiment => (
                <div key={batiment.id} className="batiment-card" onClick={() => {
                  setSelectedBatiment(batiment);
                  setShowBatimentModal(true);
                }}>
                  <h3>{batiment.nom_etablissement || batiment.adresse_civique}</h3>
                  <p>{batiment.adresse_civique}, {batiment.ville}</p>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'parametres':
        return (
          <ParametresPrevention 
            tenantSlug={tenantSlug} 
            currentUser={user}
            onRefreshBatiments={fetchBatiments}
            ImportBatimentsComponent={ImportBatiments}
          />
        );
      
      default:
        return <div>Vue en développement...</div>;
    }
  };

  return (
    <div className="prevention-container">
      <div className="prevention-header">
        <div className="header-content">
          <h1>🔥 Module Prévention</h1>
          <p>Gestion des inspections et de la sécurité incendie</p>
        </div>
        
        <div className="prevention-nav">
          <Button 
            variant={currentView === 'dashboard' ? 'default' : 'outline'}
            onClick={() => setCurrentView('dashboard')}
          >
            📊 Tableau de bord
          </Button>
          <Button 
            variant={currentView === 'batiments' ? 'default' : 'outline'}
            onClick={() => setCurrentView('batiments')}
          >
            🏢 Bâtiments
          </Button>
          <Button 
            variant={currentView === 'preventionnistes' ? 'default' : 'outline'}
            onClick={() => setCurrentView('preventionnistes')}
          >
            👨‍🚒 Préventionnistes
          </Button>
          <Button 
            variant={currentView === 'calendrier' ? 'default' : 'outline'}
            onClick={() => setCurrentView('calendrier')}
          >
            📅 Planification
          </Button>
          <Button 
            variant={currentView === 'non-conformites' ? 'default' : 'outline'}
            onClick={() => setCurrentView('non-conformites')}
          >
            ⚠️ Non-conformités
          </Button>
          <Button 
            variant={currentView === 'grilles' ? 'default' : 'outline'}
            onClick={() => setCurrentView('grilles')}
          >
            📋 Grilles d'Inspection
          </Button>
          <Button 
            variant={currentView === 'rapports' ? 'default' : 'outline'}
            onClick={() => setCurrentView('rapports')}
          >
            📈 Rapports
          </Button>
          <Button 
            variant={currentView === 'plans-intervention' ? 'default' : 'outline'}
            onClick={() => setCurrentView('plans-intervention')}
          >
            🗺️ Plans d'Intervention
          </Button>
          <Button 
            variant={currentView === 'parametres' ? 'default' : 'outline'}
            onClick={() => setCurrentView('parametres')}
          >
            ⚙️ Paramètres
          </Button>
        </div>
      </div>
      
      <div className="prevention-content">
        {renderContent()}
      </div>

      {/* Modal détails bâtiment moderne */}
      {showBatimentModal && (
        <Suspense fallback={<div>Chargement...</div>}>
          <BatimentDetailModal
            batiment={selectedBatiment}
            onClose={() => {
              setShowBatimentModal(false);
              setSelectedBatiment(null);
              if (currentView === 'nouveau-batiment') {
                setCurrentView('batiments');
              }
            }}
            onCreate={async (newBatimentData) => {
              try {
                await apiPost(tenantSlug, `/prevention/batiments`, newBatimentData);
                await fetchBatiments();
                setShowBatimentModal(false);
                setSelectedBatiment(null);
                setCurrentView('batiments');
                toast({
                  title: "Succès",
                  description: "Bâtiment créé avec succès"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de créer le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            onUpdate={async (updatedData) => {
              try {
                await apiPut(tenantSlug, `/prevention/batiments/${selectedBatiment.id}`, updatedData);
                await fetchBatiments();
                setSelectedBatiment(updatedData);
                toast({
                  title: "Succès",
                  description: "Bâtiment mis à jour avec succès"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de mettre à jour le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            onInspect={() => {
              setShowBatimentModal(false);
              handleInspectBatiment(selectedBatiment);
            }}
            onCreatePlan={async () => {
              try {
                // Chercher un plan d'intervention validé pour ce bâtiment
                const plans = await apiGet(tenantSlug, `/prevention/plans-intervention?batiment_id=${selectedBatiment.id}`);
                
                // Filtrer les plans validés
                const planValide = plans.find(p => p.statut === 'valide');
                
                if (planValide) {
                  // Ouvrir le plan validé en visualisation
                  setShowBatimentModal(false);
                  setSelectedPlanId(planValide.id);
                  
                  toast({
                    title: "Plan d'intervention trouvé",
                    description: `Plan ${planValide.numero_plan || planValide.id} - Statut: Validé`
                  });
                } else {
                  // Aucun plan validé trouvé
                  toast({
                    title: "Aucun plan d'intervention",
                    description: "Aucun plan validé pour ce bâtiment",
                    variant: "destructive"
                  });
                }
              } catch (error) {
                console.error('Erreur récupération plan:', error);
                toast({
                  title: "Erreur",
                  description: "Impossible de récupérer les plans d'intervention",
                  variant: "destructive"
                });
              }
            }}
            onViewHistory={() => {
              setShowBatimentModal(false);
              setFilteredBatimentId(selectedBatiment.id); // Filtrer par ce bâtiment
              setCurrentView('calendrier'); // Vue calendrier dans planification
              
              toast({
                title: "Historique",
                description: `Affichage des inspections pour ${selectedBatiment.nom_etablissement || selectedBatiment.adresse_civique}`
              });
            }}
            onGenerateReport={async () => {
              try {
                toast({
                  title: "Génération en cours",
                  description: "Téléchargement du rapport PDF..."
                });
                
                const response = await fetch(
                  buildApiUrl(tenantSlug, `/prevention/batiments/${selectedBatiment.id}/rapport-pdf`),
                  {
                    headers: {
                      'Authorization': `Bearer ${getTenantToken()}`
                    }
                  }
                );
                
                if (!response.ok) throw new Error('Erreur génération rapport');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapport_${selectedBatiment.nom_etablissement || 'batiment'}_${new Date().toISOString().split('T')[0]}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                toast({
                  title: "Rapport généré",
                  description: "Le PDF a été téléchargé avec succès",
                  variant: "success"
                });
              } catch (error) {
                console.error('Erreur génération rapport:', error);
                toast({
                  title: "Erreur",
                  description: "Impossible de générer le rapport",
                  variant: "destructive"
                });
              }
            }}
            onDelete={async () => {
              if (!window.confirm(`Supprimer le bâtiment ${selectedBatiment.nom_etablissement || selectedBatiment.adresse_civique}?`)) {
                return;
              }
              try {
                await apiDelete(tenantSlug, `/prevention/batiments/${selectedBatiment.id}`);
                await fetchBatiments();
                setShowBatimentModal(false);
                setSelectedBatiment(null);
                toast({
                  title: "Succès",
                  description: "Bâtiment supprimé"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de supprimer le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            canEdit={['admin', 'superviseur', 'preventionniste'].includes(user?.role)}
            tenantSlug={tenantSlug}
          />
        </Suspense>
      )}

      {/* Viewer pour plan d'intervention */}
      {selectedPlanId && (
        <Suspense fallback={<div>Chargement...</div>}>
          <PlanInterventionViewer
            planId={selectedPlanId}
            tenantSlug={tenantSlug}
            onClose={() => setSelectedPlanId(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default CarteApprovisionnementEau;
