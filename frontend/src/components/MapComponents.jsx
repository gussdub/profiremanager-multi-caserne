import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Lazy load SecteursMap
const SecteursMap = lazy(() => import('./SecteursMap'));

// Loading component
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loading-spinner"></div>
    <p>Chargement...</p>
  </div>
);

const MapComponent = ({ batiments, onBatimentClick }) => {
  const [mapReady, setMapReady] = useState(false);
  
  // Importer Leaflet CSS
  React.useEffect(() => {
    // Ajouter le CSS de Leaflet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    
    setMapReady(true);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);
  
  if (!mapReady) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        minHeight: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #ddd'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🗺️</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6' }}>
          Chargement de la carte...
        </div>
      </div>
    );
  }
  
  // Calculer le centre basé sur les bâtiments
  let center = [45.4042, -71.8929]; // Shefford par défaut
  
  if (batiments && batiments.length > 0) {
    const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
    if (batimentsAvecCoords.length > 0) {
      const avgLat = batimentsAvecCoords.reduce((sum, b) => sum + b.latitude, 0) / batimentsAvecCoords.length;
      const avgLng = batimentsAvecCoords.reduce((sum, b) => sum + b.longitude, 0) / batimentsAvecCoords.length;
      center = [avgLat, avgLng];
    }
  }
  
  return (
    <LeafletMap 
      batiments={batiments}
      center={center}
      onBatimentClick={onBatimentClick}
    />
  );
};

// Composant Leaflet séparé
const LeafletMap = ({ batiments, center, onBatimentClick }) => {
  const { MapContainer, TileLayer, Marker, Popup, useMap } = require('react-leaflet');
  const L = require('leaflet');
  
  // Fix pour les icônes Leaflet
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
  
  // Composant pour ajuster la vue aux marqueurs
  const FitBounds = ({ batiments }) => {
    const map = useMap();
    
    React.useEffect(() => {
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
  
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
        scrollWheelZoom={true}
      >
        {/* OpenStreetMap tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
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

// Gestion des Préventionnistes
const SecteurForm = ({ secteur, users, onSave, onDelete, onCancel }) => {
  const [formData, setFormData] = useState({
    nom: secteur?.nom || '',
    description: secteur?.description || '',
    couleur: secteur?.couleur || '#3b82f6',
    preventionniste_assigne_id: secteur?.preventionniste_assigne_id || '',
    actif: secteur?.actif !== false
  });

  const couleursPredefinies = [
    { nom: 'Bleu', valeur: '#3b82f6' },
    { nom: 'Vert', valeur: '#10b981' },
    { nom: 'Rouge', valeur: '#ef4444' },
    { nom: 'Orange', valeur: '#f97316' },
    { nom: 'Violet', valeur: '#8b5cf6' },
    { nom: 'Rose', valeur: '#ec4899' },
    { nom: 'Jaune', valeur: '#eab308' },
    { nom: 'Cyan', valeur: '#06b6d4' }
  ];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.nom.trim()) {
      alert('Veuillez entrer un nom pour le secteur');
      return;
    }
    
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Nom du secteur *
        </label>
        <input
          type="text"
          name="nom"
          value={formData.nom}
          onChange={handleChange}
          placeholder="Ex: Secteur Nord, Zone industrielle..."
          required
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Description du secteur..."
          rows="3"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            resize: 'vertical'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Couleur
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {couleursPredefinies.map(c => (
            <button
              key={c.valeur}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, couleur: c.valeur }))}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: formData.couleur === c.valeur ? '3px solid #000' : '2px solid #d1d5db',
                backgroundColor: c.valeur,
                cursor: 'pointer',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              {c.nom}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Préventionniste assigné
        </label>
        <select
          name="preventionniste_assigne_id"
          value={formData.preventionniste_assigne_id}
          onChange={handleChange}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            backgroundColor: '#fff'
          }}
        >
          <option value="">-- Sélectionner un préventionniste --</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.prenom} {user.nom} ({user.grade})
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="actif"
            checked={formData.actif}
            onChange={handleChange}
            style={{ marginRight: '8px', cursor: 'pointer' }}
          />
          Secteur actif
        </label>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '30px' }}>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginRight: 'auto'
            }}
          >
            🗑️ Supprimer
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6b7280',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Annuler
        </button>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {secteur ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
};

const AssignerPreventionniste = ({ onAssign }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedBatiments, setSelectedBatiments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersData, batimentsData] = await Promise.all([
        apiGet(tenantSlug, '/users'),
        apiGet(tenantSlug, '/prevention/batiments')
      ]);
      
      setUsers(usersData.filter(u => u.role === 'admin' || u.role === 'superviseur'));
      setBatiments(batimentsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const handleBatimentToggle = (batimentId) => {
    setSelectedBatiments(prev => 
      prev.includes(batimentId) 
        ? prev.filter(id => id !== batimentId)
        : [...prev, batimentId]
    );
  };

  const handleAssign = async () => {
    if (!selectedUser || selectedBatiments.length === 0) {
      toast({
        title: "Validation",
        description: "Veuillez sélectionner un préventionniste et au moins un bâtiment",
        variant: "destructive"
      });
      return;
    }

    try {
      setAssigning(true);
      
      // Assigner le préventionniste à tous les bâtiments sélectionnés
      await Promise.all(
        selectedBatiments.map(batimentId =>
          apiPut(tenantSlug, `/prevention/batiments/${batimentId}`, {
            preventionniste_assigne_id: selectedUser
          })
        )
      );

      toast({
        title: "Succès",
        description: `${selectedBatiments.length} bâtiment(s) assigné(s) avec succès`
      });

      onAssign();
    } catch (error) {
      console.error('Erreur assignation:', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de l'assignation",
        variant: "destructive"
      });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  const selectedUserInfo = users.find(u => u.id === selectedUser);

  return (
    <div className="assigner-preventionniste">
      <div className="assignment-steps">
        {/* Étape 1: Sélectionner préventionniste */}
        <div className="step-section">
          <h3>👤 Étape 1: Sélectionner le préventionniste</h3>
          <div className="users-grid">
            {users.map(user => (
              <label key={user.id} className="user-option">
                <input
                  type="radio"
                  name="preventionniste"
                  value={user.id}
                  checked={selectedUser === user.id}
                  onChange={(e) => setSelectedUser(e.target.value)}
                />
                <div className="user-card">
                  <div className="user-info">
                    <h4>{user.prenom} {user.nom}</h4>
                    <p>{user.email}</p>
                    <div className="user-badges">
                      <span className={`role-badge ${user.role}`}>{user.role}</span>
                      {user.grade && <span className="grade-badge">{user.grade}</span>}
                    </div>
                  </div>
                  <div className="user-stats">
                    <span className="current-assignments">
                      {batiments.filter(b => b.preventionniste_assigne_id === user.id).length} bâtiments actuels
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Étape 2: Sélectionner bâtiments */}
        {selectedUser && (
          <div className="step-section">
            <h3>🏢 Étape 2: Sélectionner les bâtiments ({selectedBatiments.length} sélectionnés)</h3>
            <div className="batiments-selection">
              {batiments
                .filter(b => !b.preventionniste_assigne_id || b.preventionniste_assigne_id === selectedUser)
                .map(batiment => (
                <label key={batiment.id} className="batiment-option">
                  <input
                    type="checkbox"
                    checked={selectedBatiments.includes(batiment.id)}
                    onChange={() => handleBatimentToggle(batiment.id)}
                  />
                  <div className="batiment-card">
                    <div className="batiment-info">
                      <h4>{batiment.nom_etablissement}</h4>
                      <p>{batiment.adresse_civique}, {batiment.ville}</p>
                      <div className="batiment-meta">
                        <span className="groupe-badge">{batiment.groupe_occupation}</span>
                        {batiment.preventionniste_assigne_id === selectedUser && (
                          <span className="assigned-badge">Déjà assigné</span>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Résumé et confirmation */}
        {selectedUser && selectedBatiments.length > 0 && (
          <div className="step-section confirmation">
            <h3>✅ Confirmation de l'assignation</h3>
            <div className="assignment-summary">
              <div className="summary-item">
                <strong>Préventionniste:</strong> {selectedUserInfo?.prenom} {selectedUserInfo?.nom}
              </div>
              <div className="summary-item">
                <strong>Bâtiments à assigner:</strong> {selectedBatiments.length}
              </div>
            </div>

            <div className="confirmation-actions">
              <Button 
                variant="outline"
                onClick={() => {
                  setSelectedUser('');
                  setSelectedBatiments([]);
                }}
              >
                🔄 Recommencer
              </Button>
              <Button 
                onClick={handleAssign}
                disabled={assigning}
                className="confirm-btn"
              >
                {assigning ? '⏳ Assignation...' : '✅ Confirmer l\'assignation'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== COMPOSANTS INSPECTIONS ====================

// Composant d'upload de photos

export { MapComponent, LeafletMap, SecteurForm, AssignerPreventionniste };
export default AssignerPreventionniste;
