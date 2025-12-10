import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';

const InspectionsBornesSeches = ({ user }) => {
  const { tenantSlug } = useTenant();
  const [bornesSeches, setBornesSeches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBorne, setSelectedBorne] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
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
      
      if (data.length > 0 && data[0].latitude && data[0].longitude) {
        setMapCenter([data[0].latitude, data[0].longitude]);
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

  // Calculer la couleur selon l'état d'inspection
  const getInspectionColor = (borne) => {
    // Si statut manuel "à refaire"
    if (borne.statut_inspection === 'a_refaire') {
      return '#f59e0b'; // Orange
    }

    // Vérifier si une date de test est dépassée
    const today = new Date();
    const hasPassedTestDate = datesTests.some(dateTest => {
      const testDate = new Date(dateTest.date);
      return today > testDate;
    });

    if (hasPassedTestDate) {
      return '#ef4444'; // Rouge - Date de test dépassée
    }

    // Si pas d'inspection ou ancienne
    if (!borne.derniere_inspection_date) {
      return '#ef4444'; // Rouge
    }

    const derniereInspection = new Date(borne.derniere_inspection_date);
    const sixMoisEnMs = 6 * 30 * 24 * 60 * 60 * 1000;
    const tempsPasse = today - derniereInspection;

    // Inspection récente (moins de 6 mois)
    if (tempsPasse < sixMoisEnMs) {
      return '#10b981'; // Vert
    }

    return '#ef4444'; // Rouge - Plus de 6 mois
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

  // Changer le statut d'une borne (admin/superviseur uniquement)
  const changeStatutBorne = async (borneId, nouveauStatut) => {
    try {
      const payload = {
        statut_inspection: nouveauStatut
      };
      
      await apiPut(tenantSlug, `/points-eau/${borneId}`, payload);
      
      // Rafraîchir la liste
      fetchBornesSeches();
      
      const message = nouveauStatut === 'a_refaire' 
        ? 'Borne marquée "À refaire"' 
        : 'Statut réinitialisé';
      alert(message);
    } catch (error) {
      console.error('Erreur changement statut:', error);
      alert('Erreur lors du changement de statut');
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1f2937' }}>
            🔥 Inspections Bornes Sèches
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
            Suivi des inspections et tests des bornes sèches
          </p>
        </div>
        {(user?.role === 'admin' || user?.role === 'superviseur') && (
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Ajouter une borne sèche
          </button>
        )}
      </div>

      {/* Statistiques */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
            {bornesSeches.filter(b => getInspectionColor(b) === '#10b981').length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✓ Conformes</div>
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
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>✗ En défaut</div>
        </div>
        <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
            {bornesSeches.length}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total bornes</div>
        </div>
      </div>

      {/* Carte */}
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
                    <p><strong>État:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getInspectionColor(borne) + '20',
                      color: getInspectionColor(borne)
                    }}>
                      {getInspectionColor(borne) === '#10b981' && '✓ Conforme'}
                      {getInspectionColor(borne) === '#f59e0b' && '⚠ À refaire'}
                      {getInspectionColor(borne) === '#ef4444' && '✗ En défaut'}
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

      {/* Modal d'inspection */}
      {showInspectionModal && (
        <InspectionModal
          borne={selectedBorne}
          tenantSlug={tenantSlug}
          user={user}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedBorne(null);
          }}
          onSave={() => {
            setShowInspectionModal(false);
            setSelectedBorne(null);
            fetchBornesSeches();
          }}
        />
      )}
    </div>
  );
};

// Composant Modal d'inspection
const InspectionModal = ({ borne, tenantSlug, user, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    // Section 1: Conditions extérieures
    conditions_atmospheriques: '',
    temperature_exterieure: '',
    
    // Section 2: Inspection visuelle
    joint_present: '',
    joint_bon_etat: '',
    site_accessible: '',
    site_deneige: '',
    vanne_storz: '',
    vanne_6_pouces: '',
    vanne_4_pouces: '',
    niveau_eau: '',
    
    // Section 3: Essai de pompage
    pompage_continu: '',
    cavitation: '',
    temps_amorcage: '',
    
    // Section 4: Finalisation
    commentaire: '',
    date_inspection: new Date().toISOString().split('T')[0],
    nom_pompier: user?.nom || '',
    prenom_pompier: user?.prenom || '',
    accessibilite_borne: [],
    
    photos: []
  });
  
  // État du chronomètre
  const [chronometerRunning, setChronometerRunning] = useState(false);
  const [chronometerTime, setChronometerTime] = useState(0);
  const [amorcageTime, setAmorcageTime] = useState(null);
  const [pompageStarted, setPompageStarted] = useState(false);
  const chronometerInterval = React.useRef(null);
  const audioRef = React.useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [historique, setHistorique] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Charger l'historique des inspections
  useEffect(() => {
    const fetchHistorique = async () => {
      try {
        const data = await apiGet(tenantSlug, `/points-eau/${borne.id}/inspections`);
        setHistorique(data);
      } catch (error) {
        console.error('Erreur chargement historique:', error);
        setHistorique([]);
      }
    };
    fetchHistorique();
  }, [borne.id, tenantSlug]);

  // Gestion du chronomètre
  useEffect(() => {
    if (chronometerRunning) {
      chronometerInterval.current = setInterval(() => {
        setChronometerTime(prev => {
          const newTime = prev + 1;
          // Arrêt automatique à 5 minutes (300 secondes)
          if (newTime >= 300) {
            stopChronometer(true);
            playAlarm();
            return 300;
          }
          return newTime;
        });
      }, 1000);
    } else {
      if (chronometerInterval.current) {
        clearInterval(chronometerInterval.current);
      }
    }
    return () => {
      if (chronometerInterval.current) {
        clearInterval(chronometerInterval.current);
      }
    };
  }, [chronometerRunning]);

  // Support Ctrl+V pour coller des images
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            handlePhotoFromFile(blob);
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [formData.photos]);

  const startChronometer = () => {
    setChronometerRunning(true);
    setPompageStarted(false);
  };

  const stopChronometer = (isAutoStop = false) => {
    if (!pompageStarted && !isAutoStop) {
      // Premier stop = temps d'amorçage
      setAmorcageTime(chronometerTime);
      setFormData(prev => ({ ...prev, temps_amorcage: chronometerTime.toString() }));
      setPompageStarted(true);
      // Continue automatiquement pour le pompage continu
    } else {
      // Arrêt final
      setChronometerRunning(false);
    }
  };

  const resetChronometer = () => {
    setChronometerRunning(false);
    setChronometerTime(0);
    setAmorcageTime(null);
    setPompageStarted(false);
    setFormData(prev => ({ ...prev, temps_amorcage: '' }));
  };

  const playAlarm = () => {
    // Alarme sonore simple
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBi6Azfv');
    audio.play().catch(e => console.log('Alarm sound failed:', e));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation des champs obligatoires
    if (!formData.temperature_exterieure) {
      alert('Température extérieure est obligatoire');
      return;
    }
    if (!formData.temps_amorcage) {
      alert('Temps d\'amorçage est obligatoire');
      return;
    }
    if (!formData.nom_pompier || !formData.prenom_pompier) {
      alert('Nom et prénom du pompier sont obligatoires');
      return;
    }
    if (formData.accessibilite_borne.length === 0) {
      alert('Accessibilité de la borne est obligatoire');
      return;
    }

    setLoading(true);
    try {
      // Déterminer le statut global
      let etat_trouve = 'conforme';
      const inspectionFields = [
        formData.joint_present, formData.joint_bon_etat, formData.site_accessible,
        formData.site_deneige, formData.vanne_storz, formData.vanne_6_pouces,
        formData.vanne_4_pouces, formData.niveau_eau, formData.pompage_continu,
        formData.cavitation
      ];
      
      if (inspectionFields.some(f => f === 'non_conforme' || f === 'defectuosite')) {
        etat_trouve = 'a_refaire';
      }

      const payload = {
        ...formData,
        point_eau_id: borne.id,
        etat_trouve,
        statut_inspection: etat_trouve
      };

      await apiPost(tenantSlug, `/points-eau/${borne.id}/inspections`, payload);
      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la sauvegarde de l\'inspection');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoFromFile = async (file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La photo est trop grande (max 5MB)');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Format non supporté. Utilisez JPEG, PNG ou WEBP');
      return;
    }

    if (formData.photos.length >= 10) {
      alert('Maximum 10 photos autorisées');
      return;
    }

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result;
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, base64]
        }));
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur upload:', error);
      setUploadingPhoto(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await handlePhotoFromFile(file);
    }
  };

  const removePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 10
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>
            📋 Inspection - {borne.numero_identification}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '1.5rem' }}>
          {/* Photos de référence de la borne */}
          {borne.photo_url && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1f2937' }}>
                📷 Photo de référence
              </h3>
              <img 
                src={borne.photo_url} 
                alt={borne.nom}
                style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '6px' }}
              />
              {borne.notes && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  <strong>Notes importantes:</strong> {borne.notes}
                </div>
              )}
            </div>
          )}

          {/* Formulaire */}
          <form onSubmit={handleSubmit}>
            {/* Section 1: Conditions extérieures */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#1f2937' }}>
                🌤️ Section 1: Conditions extérieures
              </h3>
              
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Conditions atmosphériques
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['Pluvieux', 'Enneigé', 'Froid', 'Dégagé', 'Nuageux'].map(cond => (
                    <label key={cond} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="conditions_atmospheriques"
                        value={cond.toLowerCase()}
                        checked={formData.conditions_atmospheriques === cond.toLowerCase()}
                        onChange={(e) => setFormData({ ...formData, conditions_atmospheriques: e.target.value })}
                        style={{ marginRight: '0.5rem' }}
                      />
                      <span>{cond}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Température extérieure <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  required
                  value={formData.temperature_exterieure}
                  onChange={(e) => setFormData({ ...formData, temperature_exterieure: e.target.value })}
                  placeholder="Ex: -5, 20"
                  style={{
                    width: '200px',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
                <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>°C</span>
              </div>
            </div>

            {/* Section 2: Inspection visuelle */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#1f2937' }}>
                👁️ Section 2: Inspection visuelle <span style={{ color: 'red' }}>*</span>
              </h3>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Élément</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Conforme</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Non conforme</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Défectuosité</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>N/A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Joint présent', field: 'joint_present' },
                      { label: 'Joint en bon état', field: 'joint_bon_etat' },
                      { label: 'Site accessible', field: 'site_accessible' },
                      { label: 'Site bien déneigé', field: 'site_deneige' },
                      { label: 'Vanne de sortie Storz', field: 'vanne_storz' },
                      { label: 'Vanne de sortie 6"', field: 'vanne_6_pouces' },
                      { label: 'Vanne de sortie 4"', field: 'vanne_4_pouces' },
                      { label: 'Niveau du plan d\'eau', field: 'niveau_eau' }
                    ].map(item => (
                      <tr key={item.field} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem', fontWeight: '500' }}>{item.label}</td>
                        {['conforme', 'non_conforme', 'defectuosite', 'na'].map(val => (
                          <td key={val} style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={item.field}
                              value={val}
                              checked={formData[item.field] === val}
                              onChange={(e) => setFormData({ ...formData, [item.field]: e.target.value })}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3: Essai de pompage */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '2px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#1f2937' }}>
                🔥 Section 3: Essai de pompage <span style={{ color: 'red' }}>*</span>
              </h3>
              
              {/* Chronomètre */}
              <div style={{ 
                marginBottom: '1.5rem', 
                padding: '1.5rem', 
                background: chronometerTime >= 300 ? '#fef2f2' : '#f0f9ff', 
                borderRadius: '12px', 
                border: `2px solid ${chronometerTime >= 300 ? '#ef4444' : '#3b82f6'}` 
              }}>
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '3rem', fontWeight: '700', color: chronometerTime >= 300 ? '#ef4444' : '#1f2937', fontFamily: 'monospace' }}>
                    {formatTime(chronometerTime)}
                  </div>
                  {amorcageTime !== null && (
                    <div style={{ fontSize: '0.875rem', color: '#10b981', fontWeight: '600', marginTop: '0.5rem' }}>
                      ✓ Temps d'amorçage: {amorcageTime}s
                    </div>
                  )}
                  {pompageStarted && chronometerTime < 300 && (
                    <div style={{ fontSize: '0.875rem', color: '#f59e0b', fontWeight: '600', marginTop: '0.5rem' }}>
                      ⏱️ Pompage en continu en cours...
                    </div>
                  )}
                  {chronometerTime >= 300 && (
                    <div style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: '700', marginTop: '0.5rem' }}>
                      🔔 5 MINUTES ÉCOULÉES !
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  {!chronometerRunning && chronometerTime === 0 && (
                    <button
                      type="button"
                      onClick={startChronometer}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      ▶️ START
                    </button>
                  )}
                  {chronometerRunning && (
                    <button
                      type="button"
                      onClick={() => stopChronometer()}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: pompageStarted ? '#ef4444' : '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {pompageStarted ? '⏹️ ARRÊTER' : '⏸️ STOP (Amorçage)'}
                    </button>
                  )}
                  {chronometerTime > 0 && (
                    <button
                      type="button"
                      onClick={resetChronometer}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      🔄 RESET
                    </button>
                  )}
                </div>
                <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                  1️⃣ START → 2️⃣ STOP (eau arrive) → ⏱️ Continue auto → 🔔 Alarme à 5min
                </div>
              </div>

              <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Test</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Conforme</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: '600', borderBottom: '2px solid #d1d5db' }}>Non conforme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Pompage en continu (5 minutes)', field: 'pompage_continu' },
                      { label: 'Cavitation durant le pompage', field: 'cavitation' }
                    ].map(item => (
                      <tr key={item.field} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '0.75rem', fontWeight: '500' }}>{item.label}</td>
                        {['conforme', 'non_conforme'].map(val => (
                          <td key={val} style={{ padding: '0.75rem', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name={item.field}
                              value={val}
                              checked={formData[item.field] === val}
                              onChange={(e) => setFormData({ ...formData, [item.field]: e.target.value })}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Temps d'amorçage (en secondes) <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="number"
                  required
                  value={formData.temps_amorcage}
                  onChange={(e) => setFormData({ ...formData, temps_amorcage: e.target.value })}
                  placeholder="Ex: 30"
                  disabled={amorcageTime !== null}
                  style={{
                    width: '200px',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    background: amorcageTime !== null ? '#f3f4f6' : 'white'
                  }}
                />
                <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>secondes</span>
                {amorcageTime !== null && (
                  <span style={{ marginLeft: '0.5rem', color: '#10b981', fontSize: '0.875rem', fontWeight: '600' }}>
                    ✓ Enregistré automatiquement
                  </span>
                )}
              </div>
            </div>

            {/* Section 4: Finalisation */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', color: '#1f2937' }}>
                ✅ Section 4: Finalisation
              </h3>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Commentaire
                </label>
                <textarea
                  value={formData.commentaire}
                  onChange={(e) => setFormData({ ...formData, commentaire: e.target.value })}
                  placeholder="Notes additionnelles..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Date <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.date_inspection}
                  onChange={(e) => setFormData({ ...formData, date_inspection: e.target.value })}
                  style={{
                    width: '300px',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Prénom du pompier <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.prenom_pompier}
                    onChange={(e) => setFormData({ ...formData, prenom_pompier: e.target.value })}
                    placeholder="Prénom"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Nom du pompier <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nom_pompier}
                    onChange={(e) => setFormData({ ...formData, nom_pompier: e.target.value })}
                    placeholder="Nom"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Accessibilité de la borne <span style={{ color: 'red' }}>*</span>
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                  {['Sécuritaire', 'Facile', 'Dangereuse', 'Difficile'].map(acc => (
                    <label key={acc} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        value={acc.toLowerCase()}
                        checked={formData.accessibilite_borne.includes(acc.toLowerCase())}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newAcc = e.target.checked
                            ? [...formData.accessibilite_borne, val]
                            : formData.accessibilite_borne.filter(a => a !== val);
                          setFormData({ ...formData, accessibilite_borne: newAcc });
                        }}
                        style={{ marginRight: '0.5rem' }}
                      />
                      <span>{acc}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Photos ({formData.photos.length}/10)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto || formData.photos.length >= 10}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '0.875rem'
                }}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                💡 Astuce : Vous pouvez coller des images avec <strong>Ctrl+V</strong> (max 10 photos, 5MB chacune, JPEG/PNG/WEBP)
              </p>
              {uploadingPhoto && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>Téléchargement...</p>}
              
              {formData.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {formData.photos.map((photo, index) => (
                    <div key={index} style={{ position: 'relative' }}>
                      <img
                        src={photo}
                        alt={`Photo ${index + 1}`}
                        style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #e5e7eb' }}
                      />
                      {(user?.role === 'admin' || user?.role === 'superviseur') && (
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  color: '#374151'
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: loading ? '#9ca3af' : '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Sauvegarde...' : 'Enregistrer l\'inspection'}
              </button>
            </div>
          </form>

          {/* Historique */}
          {historique.length > 0 && (
            <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#1f2937' }}>
                📚 Historique des inspections
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {historique.map((inspection, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '1rem',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>
                          {new Date(inspection.date_inspection).toLocaleDateString('fr-FR')}
                        </span>
                        <span style={{
                          marginLeft: '0.5rem',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          background: inspection.etat_trouve === 'conforme' ? '#10b98120' : 
                                     inspection.etat_trouve === 'a_refaire' ? '#f59e0b20' : '#ef444420',
                          color: inspection.etat_trouve === 'conforme' ? '#10b981' : 
                                inspection.etat_trouve === 'a_refaire' ? '#f59e0b' : '#ef4444'
                        }}>
                          {inspection.etat_trouve === 'conforme' && '✓ Conforme'}
                          {inspection.etat_trouve === 'a_refaire' && '⚠ À refaire'}
                          {inspection.etat_trouve === 'en_defaut' && '✗ En défaut'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InspectionsBornesSeches;
