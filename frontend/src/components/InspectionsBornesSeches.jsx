import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import InspectionBorneSecheModal from './InspectionBorneSecheModal';
import HistoriqueInspectionsBorneSecheModal from './HistoriqueInspectionsBorneSecheModal';

const InspectionsBornesSeches = ({ user }) => {
  const { tenantSlug } = useTenant();
  const [pointsEau, setPointsEau] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBorne, setSelectedBorne] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showHistoriqueModal, setShowHistoriqueModal] = useState(false);
  const [currentView, setCurrentView] = useState('carte');
  const [mapCenter, setMapCenter] = useState([45.5017, -73.5673]);
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLayer, setMapLayer] = useState('plan');
  const [datesTests, setDatesTests] = useState([]);
  const [filterType, setFilterType] = useState('all'); // Filtre par type

  // Icônes selon le type de point d'eau
  const typeIcons = {
    borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
    borne_fontaine: '🚰',
    borne_incendie: '🔴',
    piscine: '🏊',
    lac: '🌊',
    riviere: '🏞️',
    point_statique: '💧',
    autre: '💧'
  };

  const getTypeIcon = (type) => typeIcons[type] || '💧';
  const getTypeLabel = (type) => {
    const labels = {
      borne_seche: 'Borne sèche',
      borne_fontaine: 'Borne fontaine',
      borne_incendie: 'Borne incendie',
      piscine: 'Piscine',
      lac: 'Lac',
      riviere: 'Rivière',
      point_statique: 'Point statique',
      autre: 'Autre'
    };
    return labels[type] || type;
  };

  // Charger tous les points d'eau
  const fetchPointsEau = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/points-eau');
      setPointsEau(data || []);
      
      // Calculer le centre de la carte basé sur tous les points
      if (data && data.length > 0) {
        const validPoints = data.filter(b => b.latitude && b.longitude);
        if (validPoints.length > 0) {
          const avgLat = validPoints.reduce((sum, b) => sum + b.latitude, 0) / validPoints.length;
          const avgLng = validPoints.reduce((sum, b) => sum + b.longitude, 0) / validPoints.length;
          setMapCenter([avgLat, avgLng]);
          setMapZoom(13);
        }
      }
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger les dates de tests configurées
  const fetchDatesTests = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parametres/dates-tests-bornes-seches');
      setDatesTests(data.dates || []);
    } catch (error) {
      console.error('Erreur chargement dates tests:', error);
      setDatesTests([]);
    }
  };

  useEffect(() => {
    fetchPointsEau();
    fetchDatesTests();
  }, [tenantSlug]);

  // Filtrer les points d'eau selon le type sélectionné
  const filteredPointsEau = filterType === 'all' 
    ? pointsEau 
    : pointsEau.filter(p => p.type === filterType);

  // Calculer la couleur selon le STATUT D'INSPECTION (pas l'état du point)
  const getInspectionColor = (point) => {
    // PRIORITÉ 1 : Vérifier l'état explicite du point (hors_service, fonctionnelle, en_inspection)
    if (point.etat === 'hors_service') {
      return '#ef4444'; // Rouge - Hors service
    }
    if (point.etat === 'fonctionnelle') {
      return '#10b981'; // Vert - Fonctionnel
    }
    if (point.etat === 'en_inspection') {
      return '#f59e0b'; // Orange - En inspection
    }

    // PRIORITÉ 2 : Si statut manuel "à refaire" par admin
    if (point.statut_inspection === 'a_refaire') {
      return '#f59e0b'; // Orange - À refaire
    }

    // PRIORITÉ 3 : Vérifier si une date de test bi-annuelle est dépassée
    const today = new Date();
    const hasPassedTestDate = datesTests.some(dateTest => {
      const testDate = new Date(dateTest.date);
      return today > testDate;
    });

    if (hasPassedTestDate) {
      return '#ef4444'; // Rouge - Date de test dépassée
    }

    // PRIORITÉ 4 : Si pas d'inspection = pas encore inspectée
    if (!point.derniere_inspection_date) {
      return '#ef4444'; // Rouge - Non inspectée
    }

    // PRIORITÉ 5 : Si inspection il y a plus de 6 mois
    const derniereInspection = new Date(point.derniere_inspection_date);
    const sixMoisEnMs = 6 * 30 * 24 * 60 * 60 * 1000;
    const tempsPasse = today - derniereInspection;

    if (tempsPasse < sixMoisEnMs) {
      return '#10b981'; // Vert - Inspectée récemment
    }

    return '#ef4444'; // Rouge - Inspection trop ancienne
  };
  
  // Obtenir le label du statut d'inspection
  const getInspectionLabel = (point) => {
    const color = getInspectionColor(point);
    if (color === '#10b981') return '✓ Inspectée';
    if (color === '#f59e0b') return '⚠ À refaire';
    if (!point.derniere_inspection_date) return '✗ Non inspectée';
    return '✗ Inspection expirée';
  };

  // Créer l'icône Leaflet avec badge coloré
  const getLeafletIcon = (point) => {
    const badgeColor = getInspectionColor(point);
    const icon = getTypeIcon(point.type);
    const isImageUrl = icon.startsWith('http');

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          ${isImageUrl 
            ? `<img src="${icon}" style="width: 40px; height: 40px;" />`
            : `<div style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 28px; background: white; border-radius: 50%; border: 2px solid #d1d5db;">${icon}</div>`
          }
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

  // Ouvrir le modal d'inspection
  const openInspectionModal = (point) => {
    setSelectedBorne(point);
    setShowInspectionModal(true);
  };

  // Ouvrir le modal d'historique
  const openHistoriqueModal = (point) => {
    setSelectedBorne(point);
    setShowHistoriqueModal(true);
  };

  // Changer le statut d'un point d'eau (admin/superviseur uniquement)
  const changeStatutPoint = async (pointId, nouveauStatut) => {
    try {
      const payload = {
        statut_inspection: nouveauStatut,
        etat: nouveauStatut === 'a_refaire' ? 'hors_service' : 'fonctionnelle'
      };
      
      await apiPut(tenantSlug, `/points-eau/${pointId}`, payload);
      
      // Rafraîchir la liste
      fetchPointsEau();
      
      const message = nouveauStatut === 'a_refaire' 
        ? '⚠️ Point d\'eau marqué "À refaire" et mis hors service' 
        : '✅ Statut réinitialisé - Point d\'eau remis en service';
      alert(message);
    } catch (error) {
      console.error('Erreur changement statut:', error);
      alert('❌ Erreur lors du changement de statut');
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1f2937' }}>
          💧 Inspections des Points d'eau
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          Suivi des inspections et tests des points d'eau (bornes, piscines, lacs, etc.)
        </p>
      </div>

      {/* Filtre par type + Toggle Carte/Liste */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        {/* Filtre par type */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '0.875rem',
            background: 'white'
          }}
        >
          <option value="all">Tous les types</option>
          <option value="borne_seche">🔥 Bornes sèches</option>
          <option value="borne_fontaine">🚰 Bornes fontaines</option>
          <option value="borne_incendie">🔴 Bornes incendie</option>
          <option value="piscine">🏊 Piscines</option>
          <option value="lac">🌊 Lacs</option>
          <option value="riviere">🏞️ Rivières</option>
          <option value="point_statique">💧 Points statiques</option>
        </select>

        {/* Toggle Vue */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'white', borderRadius: '8px', padding: '0.25rem', border: '1px solid #e5e7eb' }}>
          <button
            onClick={() => setCurrentView('carte')}
            style={{
              padding: '0.5rem 1rem',
              background: currentView === 'carte' ? '#3b82f6' : 'transparent',
              color: currentView === 'carte' ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            🗺️ Carte
          </button>
          <button
            onClick={() => setCurrentView('liste')}
            style={{
              padding: '0.5rem 1rem',
              background: currentView === 'liste' ? '#3b82f6' : 'transparent',
              color: currentView === 'liste' ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
              transition: 'all 0.2s'
            }}
          >
            📋 Liste
          </button>
        </div>
      </div>

      {/* Statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
            {filteredPointsEau.filter(b => getInspectionColor(b) === '#10b981').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✓ Inspectées</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b', marginBottom: '0.25rem' }}>
            {filteredPointsEau.filter(b => getInspectionColor(b) === '#f59e0b').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>⚠ À refaire</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ef4444', marginBottom: '0.25rem' }}>
            {filteredPointsEau.filter(b => getInspectionColor(b) === '#ef4444').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✗ Non/Expirées</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
            {filteredPointsEau.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total points d'eau</div>
        </div>
      </div>

      {/* Contenu selon la vue */}
      {currentView === 'carte' ? (
        <div style={{ height: 'calc(100vh - 400px)', minHeight: '500px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
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
          key={`${mapCenter[0]}-${mapCenter[1]}`}
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url={mapLayer === 'plan' 
              ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"}
            attribution={mapLayer === 'plan'
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              : '&copy; Esri'}
            maxZoom={mapLayer === 'satellite' ? 19 : 19}
          />

          {filteredPointsEau.filter(p => p.latitude && p.longitude).map(point => (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={getLeafletIcon(point)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{getTypeIcon(point.type).startsWith('http') ? '' : getTypeIcon(point.type)}</span>
                    {point.nom || point.numero_identification}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.5rem' }}>
                    {getTypeLabel(point.type)}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    {point.adresse && <p><strong>Adresse:</strong> {point.adresse}</p>}
                    {point.ville && <p><strong>Ville:</strong> {point.ville}</p>}
                    <p><strong>Dernière inspection:</strong> {point.derniere_inspection_date 
                      ? new Date(point.derniere_inspection_date).toLocaleDateString('fr-FR')
                      : 'Jamais'}</p>
                    <p><strong>Statut:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getInspectionColor(point) + '20',
                      color: getInspectionColor(point)
                    }}>
                      {getInspectionLabel(point)}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    {/* Bouton Inspecter - Visible par tous */}
                    <button
                      onClick={() => openInspectionModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      📋 Inspecter
                    </button>
                    
                    {/* Boutons Admin/Superviseur */}
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <>
                        <button
                          onClick={() => openHistoriqueModal(point)}
                          style={{
                            padding: '0.5rem',
                            background: '#6366f1',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500'
                          }}
                        >
                          📜 Historique des inspections
                        </button>
                        
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => changeStatutPoint(point.id, 'a_refaire')}
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              background: '#f59e0b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}
                          >
                            ⚠ À refaire
                          </button>
                          <button
                            onClick={() => changeStatutPoint(point.id, null)}
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}
                          >
                            ✓ Réinitialiser
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      ) : (
        /* Vue Liste */
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Icône</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>N° Identification</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Nom</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Adresse</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Dernière Inspection</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Prochaine Due</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Nb Inspections</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Statut Inspection</th>
                  <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPointsEau.map(point => (
                  <tr key={point.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '1rem' }}>
                      {getTypeIcon(point.type).startsWith('http') 
                        ? <img src={getTypeIcon(point.type)} alt="icon" style={{ width: '40px', height: '40px' }} />
                        : <span style={{ fontSize: '2rem' }}>{getTypeIcon(point.type)}</span>
                      }
                    </td>
                    <td style={{ padding: '1rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      {point.numero_identification}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {point.nom}
                      <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>{getTypeLabel(point.type)}</div>
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {point.adresse || 'Non défini'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {point.derniere_inspection_date 
                        ? new Date(point.derniere_inspection_date).toLocaleDateString('fr-FR')
                        : 'Jamais'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {point.derniere_inspection_date 
                        ? new Date(new Date(point.derniere_inspection_date).getTime() + 6 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
                        : 'À déterminer'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '600', textAlign: 'center' }}>
                      {point.nombre_inspections || 0}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        background: getInspectionColor(point) + '20',
                        color: getInspectionColor(point)
                      }}>
                        {getInspectionLabel(point)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openInspectionModal(point)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500'
                          }}
                        >
                          📋 Inspecter
                        </button>
                        {(user?.role === 'admin' || user?.role === 'superviseur') && (
                          <>
                            <button
                              onClick={() => openHistoriqueModal(point)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: '#6366f1',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              📜 Historique
                            </button>
                            <button
                              onClick={() => changeStatutPoint(point.id, 'a_refaire')}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: '#f59e0b',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              ⚠ À refaire
                            </button>
                            <button
                              onClick={() => changeStatutPoint(point.id, null)}
                              style={{
                                padding: '0.5rem 0.75rem',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              ✓ Réinitialiser
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredPointsEau.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
              Aucun point d'eau trouvé
            </div>
          )}
        </div>
      )}

      {/* Modal d'inspection personnalisable */}
      {showInspectionModal && selectedBorne && (
        <InspectionBorneSecheModal
          borne={selectedBorne}
          tenantSlug={tenantSlug}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedBorne(null);
          }}
          onSuccess={() => {
            fetchPointsEau();
          }}
        />
      )}

      {/* Modal d'historique des inspections */}
      {showHistoriqueModal && selectedBorne && (
        <HistoriqueInspectionsBorneSecheModal
          borne={selectedBorne}
          tenantSlug={tenantSlug}
          onClose={() => {
            setShowHistoriqueModal(false);
            setSelectedBorne(null);
          }}
        />
      )}
    </div>
  );
};

export default InspectionsBornesSeches;
