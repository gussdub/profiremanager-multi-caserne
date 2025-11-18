import React, { useState, useEffect } from 'react';
import axios from 'axios';

const GestionActifs = () => {
  const [activeTab, setActiveTab] = useState('vehicules'); // 'vehicules', 'bornes', ou 'inventaires'
  const [vehicules, setVehicules] = useState([]);
  const [bornes, setBornes] = useState([]);
  const [modeles, setModeles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});

  const backendUrl = process.env.REACT_APP_BACKEND_URL;
  const token = localStorage.getItem('token');
  const tenantSlug = localStorage.getItem('tenantSlug');

  useEffect(() => {
    if (activeTab === 'vehicules') {
      fetchVehicules();
    } else if (activeTab === 'bornes') {
      fetchBornes();
    } else if (activeTab === 'inventaires') {
      fetchModeles();
      fetchInspections();
    }
  }, [activeTab]);

  const fetchVehicules = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/${tenantSlug}/actifs/vehicules`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setVehicules(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des véhicules:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBornes = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/${tenantSlug}/actifs/bornes`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setBornes(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des bornes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModeles = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/${tenantSlug}/actifs/modeles`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setModeles(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des modèles:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInspections = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/${tenantSlug}/actifs/inspections`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInspections(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des inspections:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData(activeTab === 'vehicules' ? {
      nom: '',
      type_vehicule: '',
      marque: '',
      modele: '',
      annee: '',
      statut: 'actif',
      photos: []
    } : {
      nom: '',
      type_borne: 'seche',
      adresse: '',
      municipalite: '',
      statut: 'operationnelle',
      photos: [],
      schemas: []
    });
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setModalMode('edit');
    setSelectedItem(item);
    setFormData(item);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (modalMode === 'create') {
        await axios.post(
          `${backendUrl}/api/${tenantSlug}/actifs/${activeTab}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.put(
          `${backendUrl}/api/${tenantSlug}/actifs/${activeTab}/${selectedItem.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setShowModal(false);
      if (activeTab === 'vehicules') {
        fetchVehicules();
      } else {
        fetchBornes();
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      return;
    }

    try {
      await axios.delete(
        `${backendUrl}/api/${tenantSlug}/actifs/${activeTab}/${id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      if (activeTab === 'vehicules') {
        fetchVehicules();
      } else {
        fetchBornes();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  return (
    <div className="gestion-actifs" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🚒 Gestion des Actifs</h1>
        <button 
          onClick={openCreateModal}
          style={{
            padding: '10px 20px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          + Ajouter {activeTab === 'vehicules' ? 'un véhicule' : 'une borne'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('vehicules')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'vehicules' ? '#e74c3c' : 'transparent',
            color: activeTab === 'vehicules' ? 'white' : '#333',
            border: 'none',
            borderBottom: activeTab === 'vehicules' ? '3px solid #e74c3c' : 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          🚗 Véhicules
        </button>
        <button
          onClick={() => setActiveTab('bornes')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'bornes' ? '#e74c3c' : 'transparent',
            color: activeTab === 'bornes' ? 'white' : '#333',
            border: 'none',
            borderBottom: activeTab === 'bornes' ? '3px solid #e74c3c' : 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          💧 Bornes d'incendie
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div>Chargement...</div>
      ) : (
        <div>
          {activeTab === 'vehicules' ? (
            <VehiculesTab 
              vehicules={vehicules} 
              onEdit={openEditModal} 
              onDelete={handleDelete}
            />
          ) : (
            <BornesTab 
              bornes={bornes} 
              onEdit={openEditModal} 
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal
          mode={modalMode}
          type={activeTab}
          formData={formData}
          setFormData={setFormData}
          onSubmit={handleSubmit}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
};

// Composant pour l'onglet Véhicules
const VehiculesTab = ({ vehicules, onEdit, onDelete }) => {
  if (vehicules.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
        <p>Aucun véhicule enregistré</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
      {vehicules.map(vehicule => (
        <div key={vehicule.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '15px',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>{vehicule.nom}</h3>
            <span style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              backgroundColor: vehicule.statut === 'actif' ? '#27ae60' : '#95a5a6',
              color: 'white'
            }}>
              {vehicule.statut}
            </span>
          </div>
          
          <div style={{ marginBottom: '10px', color: '#666' }}>
            {vehicule.type_vehicule && <p><strong>Type:</strong> {vehicule.type_vehicule}</p>}
            {vehicule.marque && <p><strong>Marque:</strong> {vehicule.marque} {vehicule.modele}</p>}
            {vehicule.annee && <p><strong>Année:</strong> {vehicule.annee}</p>}
            {vehicule.vin && <p><strong>VIN:</strong> {vehicule.vin}</p>}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={() => onEdit(vehicule)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ✏️ Modifier
            </button>
            <button
              onClick={() => onDelete(vehicule.id)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🗑️ Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Composant pour l'onglet Bornes
const BornesTab = ({ bornes, onEdit, onDelete }) => {
  if (bornes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
        <p>Aucune borne d'incendie enregistrée</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
      {bornes.map(borne => (
        <div key={borne.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '15px',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>{borne.nom}</h3>
            <span style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              backgroundColor: borne.statut === 'operationnelle' ? '#27ae60' : '#e74c3c',
              color: 'white'
            }}>
              {borne.statut}
            </span>
          </div>
          
          <div style={{ marginBottom: '10px', color: '#666' }}>
            <p><strong>Type:</strong> {borne.type_borne === 'seche' ? 'Borne sèche' : 'Borne fontaine'}</p>
            {borne.municipalite && <p><strong>Municipalité:</strong> {borne.municipalite}</p>}
            {borne.adresse && <p><strong>Adresse:</strong> {borne.adresse}</p>}
            {borne.transversale && <p><strong>Transversale:</strong> {borne.transversale}</p>}
            {borne.lien_maps && (
              <p>
                <a href={borne.lien_maps} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db' }}>
                  📍 Voir sur la carte
                </a>
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={() => onEdit(borne)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              ✏️ Modifier
            </button>
            <button
              onClick={() => onDelete(borne.id)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🗑️ Supprimer
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Composant Modal pour créer/éditer
const Modal = ({ mode, type, formData, setFormData, onSubmit, onClose }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2>{mode === 'create' ? 'Ajouter' : 'Modifier'} {type === 'vehicules' ? 'un véhicule' : 'une borne'}</h2>
        
        <form onSubmit={onSubmit}>
          {type === 'vehicules' ? (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Nom du véhicule *
                </label>
                <input
                  type="text"
                  name="nom"
                  value={formData.nom || ''}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Type de véhicule</label>
                <input
                  type="text"
                  name="type_vehicule"
                  value={formData.type_vehicule || ''}
                  onChange={handleChange}
                  placeholder="Ex: Autopompe, Citerne, Pick-up"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Marque</label>
                  <input
                    type="text"
                    name="marque"
                    value={formData.marque || ''}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Modèle</label>
                  <input
                    type="text"
                    name="modele"
                    value={formData.modele || ''}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Année</label>
                  <input
                    type="number"
                    name="annee"
                    value={formData.annee || ''}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Kilométrage</label>
                  <input
                    type="number"
                    name="kilometrage"
                    value={formData.kilometrage || ''}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>VIN</label>
                <input
                  type="text"
                  name="vin"
                  value={formData.vin || ''}
                  onChange={handleChange}
                  placeholder="Numéro d'identification du véhicule"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Statut</label>
                <select
                  name="statut"
                  value={formData.statut || 'actif'}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="actif">Actif</option>
                  <option value="maintenance">En maintenance</option>
                  <option value="retraite">Retraité</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date de mise en service</label>
                <input
                  type="date"
                  name="date_mise_service"
                  value={formData.date_mise_service || ''}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={handleChange}
                  rows="3"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Nom de la borne *
                </label>
                <input
                  type="text"
                  name="nom"
                  value={formData.nom || ''}
                  onChange={handleChange}
                  required
                  placeholder="Ex: Allen, Borne Wallace"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Type de borne *</label>
                <select
                  name="type_borne"
                  value={formData.type_borne || 'seche'}
                  onChange={handleChange}
                  required
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="seche">Borne sèche</option>
                  <option value="fontaine">Borne fontaine</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Municipalité</label>
                <input
                  type="text"
                  name="municipalite"
                  value={formData.municipalite || ''}
                  onChange={handleChange}
                  placeholder="Ex: Canton de Shefford"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Adresse</label>
                <input
                  type="text"
                  name="adresse"
                  value={formData.adresse || ''}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Transversale</label>
                <input
                  type="text"
                  name="transversale"
                  value={formData.transversale || ''}
                  onChange={handleChange}
                  placeholder="Ex: Chemin Wallace"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Débit</label>
                <input
                  type="text"
                  name="debit"
                  value={formData.debit || ''}
                  onChange={handleChange}
                  placeholder="Ex: 1000 GPM"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Lien Google Maps</label>
                <input
                  type="url"
                  name="lien_maps"
                  value={formData.lien_maps || ''}
                  onChange={handleChange}
                  placeholder="https://maps.app.goo.gl/..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Statut</label>
                <select
                  name="statut"
                  value={formData.statut || 'operationnelle'}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                >
                  <option value="operationnelle">Opérationnelle</option>
                  <option value="hors_service">Hors service</option>
                  <option value="a_verifier">À vérifier</option>
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Notes importantes</label>
                <textarea
                  name="notes_importantes"
                  value={formData.notes_importantes || ''}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Allumer vos gyrophares, attention aux petites roches..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {mode === 'create' ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GestionActifs;
