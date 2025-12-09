import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';

// Créer les icônes personnalisées
const createCustomIcon = (iconUrl, iconSize = [32, 32]) => {
  return L.icon({
    iconUrl: iconUrl,
    iconSize: iconSize,
    iconAnchor: [iconSize[0] / 2, iconSize[1]],
    popupAnchor: [0, -iconSize[1]]
  });
};

// Icônes pour chaque type de borne
const ICONS = {
  borne_fontaine: createCustomIcon('https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png', [40, 40]),
  borne_seche: createCustomIcon('https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png', [40, 40]),
  point_eau_statique: createCustomIcon('https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png', [40, 40])
};

// Composant pour recentrer la carte
function MapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
}

const CarteApprovisionnementEau = ({ user }) => {
  const { tenantSlug } = useTenant();
  const [pointsEau, setPointsEau] = useState([]);
  const [filteredPoints, setFilteredPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('tous');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [mapCenter, setMapCenter] = useState([45.3778, -72.6839]); // Shefford, QC par défaut
  const [formData, setFormData] = useState({
    type: 'borne_fontaine',
    numero_identification: '',
    latitude: 45.3778,
    longitude: -72.6839,
    adresse: '',
    ville: 'Shefford',
    secteur_id: '',
    notes: '',
    // Champs spécifiques aux bornes fontaines
    debit_gpm: '',
    pression_statique_psi: '',
    pression_dynamique_psi: '',
    diametre_raccordement: '',
    etat: 'fonctionnelle',
    date_dernier_test: '',
    // Champs spécifiques aux points d'eau statiques
    capacite_litres: '',
    accessibilite: 'facile'
  });

  useEffect(() => {
    fetchPointsEau();
  }, []);

  useEffect(() => {
    filterPoints();
  }, [pointsEau, searchTerm, typeFilter]);

  const fetchPointsEau = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/points-eau');
      setPointsEau(data);
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPoints = () => {
    let filtered = pointsEau;

    // Filtre par type
    if (typeFilter !== 'tous') {
      filtered = filtered.filter(p => p.type === typeFilter);
    }

    // Filtre par recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.numero_identification?.toLowerCase().includes(term) ||
        p.adresse?.toLowerCase().includes(term) ||
        p.ville?.toLowerCase().includes(term) ||
        p.notes?.toLowerCase().includes(term)
      );
    }

    setFilteredPoints(filtered);
  };

  const openModal = (mode, point = null) => {
    setModalMode(mode);
    setSelectedPoint(point);
    if (point) {
      setFormData({
        type: point.type || 'borne_fontaine',
        numero_identification: point.numero_identification || '',
        latitude: point.latitude || 45.3778,
        longitude: point.longitude || -72.6839,
        adresse: point.adresse || '',
        ville: point.ville || 'Shefford',
        secteur_id: point.secteur_id || '',
        notes: point.notes || '',
        debit_gpm: point.debit_gpm || '',
        pression_statique_psi: point.pression_statique_psi || '',
        pression_dynamique_psi: point.pression_dynamique_psi || '',
        diametre_raccordement: point.diametre_raccordement || '',
        etat: point.etat || 'fonctionnelle',
        date_dernier_test: point.date_dernier_test || '',
        capacite_litres: point.capacite_litres || '',
        accessibilite: point.accessibilite || 'facile'
      });
    } else {
      setFormData({
        type: 'borne_fontaine',
        numero_identification: '',
        latitude: 45.3778,
        longitude: -72.6839,
        adresse: '',
        ville: 'Shefford',
        secteur_id: '',
        notes: '',
        debit_gpm: '',
        pression_statique_psi: '',
        pression_dynamique_psi: '',
        diametre_raccordement: '',
        etat: 'fonctionnelle',
        date_dernier_test: '',
        capacite_litres: '',
        accessibilite: 'facile'
      });
    }
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (modalMode === 'create') {
        await apiPost(tenantSlug, '/points-eau', formData);
      } else {
        await apiPut(tenantSlug, `/points-eau/${selectedPoint.id}`, formData);
      }
      setShowModal(false);
      fetchPointsEau();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (pointId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce point d\'eau ?')) return;
    
    setLoading(true);
    try {
      await apiDelete(tenantSlug, `/points-eau/${pointId}`);
      fetchPointsEau();
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  };

  const centerOnPoint = (point) => {
    setMapCenter([point.latitude, point.longitude]);
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 200px)', gap: '1rem' }}>
      {/* Panel latéral */}
      <div style={{ width: '350px', overflowY: 'auto', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Points d'eau</h3>
          <Button onClick={() => openModal('create')} size="sm">
            + Ajouter
          </Button>
        </div>

        {/* Filtres */}
        <div style={{ marginBottom: '1rem' }}>
          <Input
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ marginBottom: '0.5rem' }}
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}
          >
            <option value="tous">Tous les types</option>
            <option value="borne_fontaine">🔴 Bornes fontaines</option>
            <option value="borne_seche">🟠 Bornes sèches</option>
            <option value="point_eau_statique">💧 Points d'eau statiques</option>
          </select>
        </div>

        {/* Statistiques */}
        <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'white', borderRadius: '6px', fontSize: '0.875rem' }}>
          <div>Total: <strong>{filteredPoints.length}</strong></div>
          <div>Bornes fontaines: <strong>{pointsEau.filter(p => p.type === 'borne_fontaine').length}</strong></div>
          <div>Bornes sèches: <strong>{pointsEau.filter(p => p.type === 'borne_seche').length}</strong></div>
          <div>Points statiques: <strong>{pointsEau.filter(p => p.type === 'point_eau_statique').length}</strong></div>
        </div>

        {/* Liste des points */}
        <div>
          {filteredPoints.map(point => (
            <Card key={point.id} style={{ marginBottom: '0.75rem', padding: '0.75rem', cursor: 'pointer' }} onClick={() => centerOnPoint(point)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                    {point.type === 'borne_fontaine' && '🔴 '}
                    {point.type === 'borne_seche' && '🟠 '}
                    {point.type === 'point_eau_statique' && '💧 '}
                    {point.numero_identification}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    {point.adresse && <div>{point.adresse}</div>}
                    {point.ville && <div>{point.ville}</div>}
                    {point.debit_gpm && <div>Débit: {point.debit_gpm} GPM</div>}
                    {point.capacite_litres && <div>Capacité: {point.capacite_litres} L</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openModal('edit', point); }}>✏️</Button>
                  {user?.role === 'admin' && (
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(point.id); }}>🗑️</Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Carte */}
      <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden' }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapCenter center={mapCenter} />
          
          {filteredPoints.map(point => (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={ICONS[point.type]}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>{point.numero_identification}</h4>
                  <div style={{ fontSize: '0.875rem' }}>
                    {point.adresse && <div><strong>Adresse:</strong> {point.adresse}</div>}
                    {point.ville && <div><strong>Ville:</strong> {point.ville}</div>}
                    {point.debit_gpm && <div><strong>Débit:</strong> {point.debit_gpm} GPM</div>}
                    {point.pression_statique_psi && <div><strong>Pression statique:</strong> {point.pression_statique_psi} PSI</div>}
                    {point.capacite_litres && <div><strong>Capacité:</strong> {point.capacite_litres} L</div>}
                    {point.notes && <div style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>{point.notes}</div>}
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <Button size="sm" onClick={() => openModal('edit', point)}>Modifier</Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Modal de création/édition */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '1.5rem', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
              {modalMode === 'create' ? 'Ajouter un point d\'eau' : 'Modifier le point d\'eau'}
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Type *</label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                >
                  <option value="borne_fontaine">🔴 Borne fontaine</option>
                  <option value="borne_seche">🟠 Borne sèche</option>
                  <option value="point_eau_statique">💧 Point d'eau statique</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>N° d'identification *</label>
                <Input
                  required
                  value={formData.numero_identification}
                  onChange={(e) => setFormData({ ...formData, numero_identification: e.target.value })}
                  placeholder="Ex: BF-001, BS-001, PE-001"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Latitude *</label>
                  <Input
                    required
                    type="number"
                    step="0.000001"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Longitude *</label>
                  <Input
                    required
                    type="number"
                    step="0.000001"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Adresse</label>
                <Input
                  value={formData.adresse}
                  onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
                  placeholder="Ex: 123 rue principale"
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Ville</label>
                <Input
                  value={formData.ville}
                  onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
                />
              </div>

              {/* Champs spécifiques aux bornes fontaines */}
              {formData.type === 'borne_fontaine' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Débit (GPM)</label>
                      <Input
                        type="number"
                        value={formData.debit_gpm}
                        onChange={(e) => setFormData({ ...formData, debit_gpm: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Diamètre</label>
                      <Input
                        value={formData.diametre_raccordement}
                        onChange={(e) => setFormData({ ...formData, diametre_raccordement: e.target.value })}
                        placeholder='Ex: 6"'
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Pression statique (PSI)</label>
                      <Input
                        type="number"
                        value={formData.pression_statique_psi}
                        onChange={(e) => setFormData({ ...formData, pression_statique_psi: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Pression dynamique (PSI)</label>
                      <Input
                        type="number"
                        value={formData.pression_dynamique_psi}
                        onChange={(e) => setFormData({ ...formData, pression_dynamique_psi: e.target.value })}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Date dernier test</label>
                    <Input
                      type="date"
                      value={formData.date_dernier_test}
                      onChange={(e) => setFormData({ ...formData, date_dernier_test: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/* Champs spécifiques aux points d'eau statiques */}
              {formData.type === 'point_eau_statique' && (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Capacité (Litres)</label>
                    <Input
                      type="number"
                      value={formData.capacite_litres}
                      onChange={(e) => setFormData({ ...formData, capacite_litres: e.target.value })}
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Accessibilité</label>
                    <select
                      value={formData.accessibilite}
                      onChange={(e) => setFormData({ ...formData, accessibilite: e.target.value })}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                    >
                      <option value="facile">Facile</option>
                      <option value="moyenne">Moyenne</option>
                      <option value="difficile">Difficile</option>
                    </select>
                  </div>
                </>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #e5e7eb', minHeight: '80px' }}
                  placeholder="Notes importantes..."
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarteApprovisionnementEau;
