import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const InventairesTab = ({ tenantSlug }) => {
  const [viewMode, setViewMode] = useState('modeles'); // 'modeles' ou 'inspections'
  const [showModeleModal, setShowModeleModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedModele, setSelectedModele] = useState(null);
  const [selectedInspection, setSelectedInspection] = useState(null);
  
  // États pour les données
  const [modeles, setModeles] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [vehicules, setVehicules] = useState([]);
  const [loading, setLoading] = useState(false);

  // Charger les données au montage
  useEffect(() => {
    if (viewMode === 'modeles') {
      fetchModeles();
    } else {
      fetchInspections();
    }
  }, [viewMode]);

  useEffect(() => {
    fetchVehicules();
  }, []);

  const fetchModeles = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/inventaire/modeles');
      setModeles(data || []);
    } catch (error) {
      console.error('Erreur chargement modèles:', error);
      setModeles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchInspections = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/inventaire/inspections');
      setInspections(data || []);
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
      setInspections([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicules = async () => {
    try {
      const data = await apiGet(tenantSlug, '/actifs/vehicules');
      setVehicules(data || []);
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
      setVehicules([]);
    }
  };
  
  // Modal pour créer/éditer un modèle
  const openModeleModal = (modele = null) => {
    setSelectedModele(modele);
    setShowModeleModal(true);
  };

  // Modal pour démarrer une inspection
  const openInspectionModal = () => {
    setShowInspectionModal(true);
  };

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <button
          onClick={() => setViewMode('modeles')}
          style={{
            padding: '8px 16px',
            backgroundColor: viewMode === 'modeles' ? '#3498db' : '#ecf0f1',
            color: viewMode === 'modeles' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📝 Modèles d'inventaire
        </button>
        <button
          onClick={() => setViewMode('inspections')}
          style={{
            padding: '8px 16px',
            backgroundColor: viewMode === 'inspections' ? '#3498db' : '#ecf0f1',
            color: viewMode === 'inspections' ? 'white' : '#333',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          ✅ Historique des inspections
        </button>
      </div>

      {/* Action button */}
      <div style={{ marginBottom: '20px' }}>
        {viewMode === 'modeles' ? (
          <button
            onClick={() => openModeleModal()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            + Créer un modèle d'inventaire
          </button>
        ) : (
          <button
            onClick={openInspectionModal}
            style={{
              padding: '10px 20px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            + Démarrer une inspection
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Chargement...
        </div>
      ) : viewMode === 'modeles' ? (
        <ModelesView 
          modeles={modeles}
          onEdit={openModeleModal}
          tenantSlug={tenantSlug}
          fetchModeles={fetchModeles}
        />
      ) : (
        <InspectionsView 
          inspections={inspections}
          vehicules={vehicules}
          tenantSlug={tenantSlug}
          fetchInspections={fetchInspections}
        />
      )}

      {/* Modals */}
      {showModeleModal && (
        <ModeleModal
          modele={selectedModele}
          onClose={() => {
            setShowModeleModal(false);
            setSelectedModele(null);
          }}
          tenantSlug={tenantSlug}
          fetchModeles={fetchModeles}
        />
      )}

      {showInspectionModal && (
        <InspectionModal
          vehicules={vehicules}
          modeles={modeles}
          onClose={() => setShowInspectionModal(false)}
          backendUrl={backendUrl}
          token={token}
          tenantSlug={tenantSlug}
          fetchInspections={fetchInspections}
        />
      )}
    </div>
  );
};

// Vue des modèles d'inventaire
const ModelesView = ({ modeles, onEdit, tenantSlug, fetchModeles }) => {
  const handleDelete = async (modeleId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce modèle ?')) return;

    try {
      await apiDelete(tenantSlug, `/inventaire/modeles/${modeleId}`);
      alert('✅ Modèle supprimé avec succès');
      fetchModeles();
    } catch (error) {
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors de la suppression: ' + errorMessage);
    }
  };

  if (modeles.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
        <p>Aucun modèle d'inventaire créé</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
      {modeles.map(modele => (
        <div key={modele.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{modele.nom}</h3>
          {modele.description && <p style={{ color: '#7f8c8d', fontSize: '14px', marginBottom: '10px' }}>{modele.description}</p>}
          {modele.type_vehicule && (
            <span style={{
              display: 'inline-block',
              padding: '4px 8px',
              backgroundColor: '#3498db',
              color: 'white',
              borderRadius: '12px',
              fontSize: '12px',
              marginBottom: '10px'
            }}>
              {modele.type_vehicule}
            </span>
          )}
          
          <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              <strong>{modele.sections?.length || 0}</strong> section(s)
            </p>
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              <strong>{modele.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0}</strong> item(s) total
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={() => onEdit(modele)}
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
              onClick={() => handleDelete(modele.id)}
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

// Vue des inspections
const InspectionsView = ({ inspections, vehicules, tenantSlug, fetchInspections }) => {
  const getVehiculeNom = (vehiculeId) => {
    const v = vehicules.find(veh => veh.id === vehiculeId);
    return v ? v.nom : 'Véhicule inconnu';
  };

  const handleDelete = async (inspectionId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette inspection ?')) return;

    try {
      await axios.delete(
        `${backendUrl}/api/${tenantSlug}/actifs/inventaires/inspections/${inspectionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Inspection supprimée avec succès');
      fetchInspections();
    } catch (error) {
      alert('Erreur lors de la suppression');
    }
  };

  if (inspections.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
        <p>Aucune inspection effectuée</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
      {inspections.map(inspection => (
        <div key={inspection.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '20px',
          backgroundColor: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
            <h4 style={{ margin: 0 }}>{getVehiculeNom(inspection.vehicule_id)}</h4>
            <span style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '12px',
              backgroundColor: inspection.statut === 'complete' ? '#27ae60' : '#f39c12',
              color: 'white'
            }}>
              {inspection.statut === 'complete' ? 'Complétée' : 'En cours'}
            </span>
          </div>

          <p style={{ color: '#666', fontSize: '14px', margin: '5px 0' }}>
            <strong>Inspecteur:</strong> {inspection.inspecteur_nom || 'N/A'}
          </p>
          <p style={{ color: '#666', fontSize: '14px', margin: '5px 0' }}>
            <strong>Date:</strong> {new Date(inspection.date_inspection).toLocaleString('fr-CA')}
          </p>
          <p style={{ color: '#666', fontSize: '14px', margin: '5px 0' }}>
            <strong>Résultats:</strong> {inspection.resultats?.length || 0} item(s) vérifiés
          </p>

          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={() => alert('Fonctionnalité à venir')}
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
              👁️ Voir détails
            </button>
            <button
              onClick={() => handleDelete(inspection.id)}
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

// Modal pour créer/éditer un modèle d'inventaire
const ModeleModal = ({ modele, onClose, tenantSlug, fetchModeles }) => {
  const [formData, setFormData] = useState(modele || {
    nom: '',
    description: '',
    type_vehicule: '',
    sections: []
  });

  const [newSection, setNewSection] = useState({ nom: '', items: [] });
  const [newItem, setNewItem] = useState('');

  const handleAddItem = () => {
    if (!newItem.trim()) return;
    
    setNewSection({
      ...newSection,
      items: [...newSection.items, { nom: newItem, type_item: 'checkbox', ordre: newSection.items.length + 1 }]
    });
    setNewItem('');
  };

  const handleAddSection = () => {
    if (!newSection.nom.trim() || newSection.items.length === 0) {
      alert('La section doit avoir un nom et au moins un item');
      return;
    }

    setFormData({
      ...formData,
      sections: [...formData.sections, { ...newSection, ordre: formData.sections.length + 1, id: Date.now().toString() }]
    });
    setNewSection({ nom: '', items: [] });
  };

  const handleRemoveSection = (index) => {
    const newSections = formData.sections.filter((_, i) => i !== index);
    setFormData({ ...formData, sections: newSections });
  };

  const handleRemoveItem = (itemIndex) => {
    const newItems = newSection.items.filter((_, i) => i !== itemIndex);
    setNewSection({ ...newSection, items: newItems });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.sections.length === 0) {
      alert('Vous devez ajouter au moins une section');
      return;
    }

    try {
      if (modele) {
        await axios.put(
          `${backendUrl}/api/${tenantSlug}/actifs/inventaires/modeles/${modele.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `${backendUrl}/api/${tenantSlug}/actifs/inventaires/modeles`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      alert('Modèle sauvegardé avec succès');
      fetchModeles();
      onClose();
    } catch (error) {
      alert('Erreur lors de la sauvegarde');
      console.error(error);
    }
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
      zIndex: 1000,
      overflow: 'auto',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '30px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2>{modele ? 'Modifier' : 'Créer'} un modèle d'inventaire</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Nom du modèle *</label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              required
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows="2"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Type de véhicule</label>
            <input
              type="text"
              value={formData.type_vehicule}
              onChange={(e) => setFormData({ ...formData, type_vehicule: e.target.value })}
              placeholder="Ex: Autopompe, Citerne"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>

          <hr style={{ margin: '20px 0' }} />

          <h3>Sections ajoutées ({formData.sections.length})</h3>
          {formData.sections.map((section, index) => (
            <div key={index} style={{
              border: '1px solid #ddd',
              borderRadius: '5px',
              padding: '10px',
              marginBottom: '10px',
              backgroundColor: '#f8f9fa'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{section.nom}</strong>
                <button
                  type="button"
                  onClick={() => handleRemoveSection(index)}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Supprimer
                </button>
              </div>
              <p style={{ margin: '5px 0', fontSize: '14px', color: '#666' }}>
                {section.items.length} item(s): {section.items.map(i => i.nom).join(', ')}
              </p>
            </div>
          ))}

          <hr style={{ margin: '20px 0' }} />

          <h3>Nouvelle section</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Nom de la section</label>
            <input
              type="text"
              value={newSection.nom}
              onChange={(e) => setNewSection({ ...newSection, nom: e.target.value })}
              placeholder="Ex: Cabine, Coffre arrière"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Items de la section</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Ex: Masque bleu chirurgical"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem())}
                style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
              <button
                type="button"
                onClick={handleAddItem}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                + Ajouter
              </button>
            </div>
            
            {newSection.items.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                {newSection.items.map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '5px 10px',
                    backgroundColor: '#ecf0f1',
                    borderRadius: '3px',
                    marginBottom: '5px'
                  }}>
                    <span>{item.nom}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleAddSection}
            disabled={!newSection.nom || newSection.items.length === 0}
            style={{
              padding: '10px 20px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: newSection.nom && newSection.items.length > 0 ? 'pointer' : 'not-allowed',
              marginBottom: '20px',
              opacity: newSection.nom && newSection.items.length > 0 ? 1 : 0.5
            }}
          >
            ✅ Ajouter cette section au modèle
          </button>

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #ddd' }}>
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
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={formData.sections.length === 0}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: formData.sections.length > 0 ? 'pointer' : 'not-allowed',
                opacity: formData.sections.length > 0 ? 1 : 0.5
              }}
            >
              {modele ? 'Enregistrer' : 'Créer le modèle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal pour démarrer une inspection
const InspectionModal = ({ vehicules, modeles, onClose, backendUrl, token, tenantSlug, fetchInspections }) => {
  const [selectedVehicule, setSelectedVehicule] = useState('');
  const [selectedModele, setSelectedModele] = useState('');
  const currentUserId = localStorage.getItem('userId');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedVehicule || !selectedModele) {
      alert('Veuillez sélectionner un véhicule et un modèle');
      return;
    }

    try {
      const response = await axios.post(
        `${backendUrl}/api/${tenantSlug}/actifs/inventaires/inspections`,
        {
          vehicule_id: selectedVehicule,
          modele_inventaire_id: selectedModele,
          inspecteur_id: currentUserId
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert('Inspection créée avec succès');
      fetchInspections();
      onClose();
    } catch (error) {
      alert('Erreur lors de la création de l\'inspection');
      console.error(error);
    }
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
        maxWidth: '500px',
        width: '100%'
      }}>
        <h2>Démarrer une inspection d'inventaire</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Véhicule *</label>
            <select
              value={selectedVehicule}
              onChange={(e) => setSelectedVehicule(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            >
              <option value="">Sélectionner un véhicule</option>
              {vehicules.map(v => (
                <option key={v.id} value={v.id}>{v.nom}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Modèle d'inventaire *</label>
            <select
              value={selectedModele}
              onChange={(e) => setSelectedModele(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            >
              <option value="">Sélectionner un modèle</option>
              {modeles.map(m => (
                <option key={m.id} value={m.id}>{m.nom}</option>
              ))}
            </select>
          </div>

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
                cursor: 'pointer'
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
                cursor: 'pointer'
              }}
            >
              Démarrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventairesTab;
