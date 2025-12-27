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
  const [bornesSeches, setBornesSeches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBorne, setSelectedBorne] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showHistoriqueModal, setShowHistoriqueModal] = useState(false);
  const [currentView, setCurrentView] = useState('carte');
  const [mapCenter, setMapCenter] = useState([45.5017, -73.5673]);
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLayer, setMapLayer] = useState('plan');
  const [datesTests, setDatesTests] = useState([]);

  // URL de l'icône borne sèche
  const borneSecheIcon = 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png';

  // Charger les bornes sèches
  const fetchBornesSeches = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/points-eau?type=borne_seche');
      setBornesSeches(data);
      
      // Calculer le centre de la carte basé sur toutes les bornes
      if (data.length > 0) {
        const validBornes = data.filter(b => b.latitude && b.longitude);
        if (validBornes.length > 0) {
          // Calculer le centre moyen de toutes les bornes
          const avgLat = validBornes.reduce((sum, b) => sum + b.latitude, 0) / validBornes.length;
          const avgLng = validBornes.reduce((sum, b) => sum + b.longitude, 0) / validBornes.length;
          setMapCenter([avgLat, avgLng]);
          setMapZoom(13); // Zoom approprié pour voir toutes les bornes
        }
      }
    } catch (error) {
      console.error('Erreur chargement bornes sèches:', error);
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
    fetchBornesSeches();
    fetchDatesTests();
  }, [tenantSlug]);

  // Calculer la couleur selon le STATUT D'INSPECTION (pas l'état de la borne)
  const getInspectionColor = (borne) => {
    // PRIORITÉ 1 : Vérifier l'état explicite de la borne (hors_service, fonctionnelle, en_inspection)
    // Ceci permet aux boutons "À refaire" et "Réinitialiser" de fonctionner correctement
    if (borne.etat === 'hors_service') {
      return '#ef4444'; // Rouge - Hors service
    }
    if (borne.etat === 'fonctionnelle') {
      return '#10b981'; // Vert - Fonctionnelle
    }
    if (borne.etat === 'en_inspection') {
      return '#f59e0b'; // Orange - En inspection
    }

    // PRIORITÉ 2 : Si statut manuel "à refaire" par admin
    if (borne.statut_inspection === 'a_refaire') {
      return '#f59e0b'; // Orange - À refaire
    }

    // PRIORITÉ 3 : Vérifier si une date de test bi-annuelle est dépassée
    const today = new Date();
    const hasPassedTestDate = datesTests.some(dateTest => {
      const testDate = new Date(dateTest.date);
      return today > testDate;
    });

    if (hasPassedTestDate) {
      return '#ef4444'; // Rouge - Date de test dépassée, toutes repassent en rouge
    }

    // PRIORITÉ 4 : Si pas d'inspection = pas encore inspectée
    if (!borne.derniere_inspection_date) {
      return '#ef4444'; // Rouge - Non inspectée
    }

    // PRIORITÉ 5 : Si inspection il y a plus de 6 mois
    const derniereInspection = new Date(borne.derniere_inspection_date);
    const sixMoisEnMs = 6 * 30 * 24 * 60 * 60 * 1000;
    const tempsPasse = today - derniereInspection;

    if (tempsPasse < sixMoisEnMs) {
      return '#10b981'; // Vert - Inspectée récemment (< 6 mois)
    }

    return '#ef4444'; // Rouge - Inspection trop ancienne (> 6 mois)
  };
  
  // Obtenir le label du statut d'inspection
  const getInspectionLabel = (borne) => {
    const color = getInspectionColor(borne);
    if (color === '#10b981') return '✓ Inspectée';
    if (color === '#f59e0b') return '⚠ À refaire';
    if (!borne.derniere_inspection_date) return '✗ Non inspectée';
    return '✗ Inspection expirée';
  };

  // Créer l'icône Leaflet avec badge coloré
  const getLeafletIcon = (borne) => {
    const badgeColor = getInspectionColor(borne);

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <img src="${borneSecheIcon}" style="width: 40px; height: 40px;" />
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
  const openInspectionModal = (borne) => {
    setSelectedBorne(borne);
    setShowInspectionModal(true);
  };

  // Ouvrir le modal d'historique
  const openHistoriqueModal = (borne) => {
    setSelectedBorne(borne);
    setShowHistoriqueModal(true);
  };

  // Changer le statut d'une borne (admin/superviseur uniquement)
  const changeStatutBorne = async (borneId, nouveauStatut) => {
    try {
      const payload = {
        statut_inspection: nouveauStatut,
        // Mettre à jour aussi l'état de la borne
        etat: nouveauStatut === 'a_refaire' ? 'hors_service' : 'fonctionnelle'
      };
      
      await apiPut(tenantSlug, `/points-eau/${borneId}`, payload);
      
      // Rafraîchir la liste
      fetchBornesSeches();
      
      const message = nouveauStatut === 'a_refaire' 
        ? '⚠️ Borne marquée "À refaire" et mise hors service' 
        : '✅ Statut réinitialisé - Borne remise en service';
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
          🔥 Inspections Bornes Sèches
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          Suivi des inspections et tests des bornes sèches
        </p>
      </div>

      {/* Toggle Carte/Liste */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', background: 'white', borderRadius: '8px', padding: '0.25rem', width: 'fit-content', border: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setCurrentView('carte')}
          style={{
            padding: '0.5rem 1rem',
            background: currentView === 'carte' ? '#dc2626' : 'transparent',
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
            background: currentView === 'liste' ? '#dc2626' : 'transparent',
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

      {/* Statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
            {bornesSeches.filter(b => getInspectionColor(b) === '#10b981').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✓ Inspectées</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f59e0b', marginBottom: '0.25rem' }}>
            {bornesSeches.filter(b => getInspectionColor(b) === '#f59e0b').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>⚠ À refaire</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#ef4444', marginBottom: '0.25rem' }}>
            {bornesSeches.filter(b => getInspectionColor(b) === '#ef4444').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✗ Non/Expirées</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
            {bornesSeches.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total bornes</div>
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

          {bornesSeches.map(borne => (
            <Marker
              key={borne.id}
              position={[borne.latitude, borne.longitude]}
              icon={getLeafletIcon(borne)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <img src={borneSecheIcon} alt="icon" style={{ width: '32px', height: '32px' }} />
                    {borne.numero_identification}
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    {borne.adresse && <p><strong>Adresse:</strong> {borne.adresse}</p>}
                    {borne.ville && <p><strong>Ville:</strong> {borne.ville}</p>}
                    <p><strong>Dernière inspection:</strong> {borne.derniere_inspection_date 
                      ? new Date(borne.derniere_inspection_date).toLocaleDateString('fr-FR')
                      : 'Jamais'}</p>
                    <p><strong>Statut inspection:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getInspectionColor(borne) + '20',
                      color: getInspectionColor(borne)
                    }}>
                      {getInspectionLabel(borne)}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      onClick={() => openInspectionModal(borne)}
                      style={{
                        padding: '0.5rem',
                        background: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      📋 Effectuer une inspection
                    </button>
                    
                    <button
                      onClick={() => openHistoriqueModal(borne)}
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
                      📜 Historique des inspections
                    </button>
                    
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => changeStatutBorne(borne.id, 'a_refaire')}
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
                          onClick={() => changeStatutBorne(borne.id, null)}
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
                {bornesSeches.map(borne => (
                  <tr key={borne.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '1rem' }}>
                      <img src={borneSecheIcon} alt="icon" style={{ width: '40px', height: '40px' }} />
                    </td>
                    <td style={{ padding: '1rem', fontWeight: '600', fontSize: '0.875rem' }}>
                      {borne.numero_identification}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {borne.nom}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {borne.adresse || 'Non défini'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                      {borne.derniere_inspection_date 
                        ? new Date(borne.derniere_inspection_date).toLocaleDateString('fr-FR')
                        : 'Jamais'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      {borne.derniere_inspection_date 
                        ? new Date(new Date(borne.derniere_inspection_date).getTime() + 6 * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR')
                        : 'À déterminer'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '600', textAlign: 'center' }}>
                      {borne.nombre_inspections || 0}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        background: getInspectionColor(borne) + '20',
                        color: getInspectionColor(borne)
                      }}>
                        {getInspectionLabel(borne)}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => openInspectionModal(borne)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: '#dc2626',
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
                        <button
                          onClick={() => openInspectionModal(borne)}
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
                          ✏️ Modifier
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bornesSeches.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#6b7280' }}>
              Aucune borne sèche trouvée
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
            fetchBornesSeches();
          }}
        />
      )}
    </div>
  );
};

export default InspectionsBornesSeches;
