import React, { useState, useEffect } from 'react';
import axios from 'axios';
import InventairesTab from './GestionInventaires';
import RondeSecurite from './RondeSecurite';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const GestionActifs = ({ user, ModuleEPI }) => {
  const [activeTab, setActiveTab] = useState('vehicules');
  const [vehicules, setVehicules] = useState([]);
  const [bornes, setBornes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});
  
  // Nouveaux états pour Phase 1
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeData, setQRCodeData] = useState(null);
  const [showFicheVieModal, setShowFicheVieModal] = useState(false);
  const [ficheVieData, setFicheVieData] = useState(null);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [inspectionHistory, setInspectionHistory] = useState([]);
  const [showRondeSecuriteModal, setShowRondeSecuriteModal] = useState(false);
  const [selectedVehiculeForRonde, setSelectedVehiculeForRonde] = useState(null);

  const { tenantSlug } = useTenant();

  useEffect(() => {
    if (activeTab === 'vehicules') {
      fetchVehicules();
    } else if (activeTab === 'bornes') {
      fetchBornes();
    }
  }, [activeTab]);

  const fetchVehicules = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/actifs/vehicules');
      setVehicules(data);
    } catch (error) {
      console.error('Erreur lors du chargement des véhicules:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors du chargement des véhicules: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const fetchBornes = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/actifs/bornes');
      setBornes(data);
    } catch (error) {
      console.error('Erreur lors du chargement des bornes:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors du chargement des bornes: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData(activeTab === 'vehicules' ? {
      nom: '',
      type_vehicule: 'Autopompe',
      marque: '',
      modele: '',
      annee: '',
      vin: '',
      statut: 'actif',
      notes: ''
    } : {
      nom: '',
      type_borne: 'seche',
      adresse: '',
      municipalite: '',
      statut: 'operationnelle',
      notes_importantes: ''
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
      // Préparer les données en convertissant les types numériques
      const preparedData = { ...formData };
      
      if (activeTab === 'vehicules') {
        // Convertir les champs numériques pour véhicules
        if (preparedData.annee) {
          preparedData.annee = parseInt(preparedData.annee, 10);
        }
        if (preparedData.kilometrage) {
          preparedData.kilometrage = parseFloat(preparedData.kilometrage);
        }
      }
      
      if (modalMode === 'create') {
        await apiPost(tenantSlug, `/actifs/${activeTab}`, preparedData);
        alert('✅ Créé avec succès!');
      } else {
        await apiPut(tenantSlug, `/actifs/${activeTab}/${selectedItem.id}`, preparedData);
        alert('✅ Mis à jour avec succès!');
      }
      
      setShowModal(false);
      if (activeTab === 'vehicules') {
        fetchVehicules();
      } else {
        fetchBornes();
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors de la sauvegarde: ' + errorMessage);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/actifs/${activeTab}/${id}`);
      
      alert('✅ Supprimé avec succès!');
      if (activeTab === 'vehicules') {
        fetchVehicules();
      } else {
        fetchBornes();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      alert('❌ Erreur lors de la suppression');
    }
  };

  // Nouvelles fonctions Phase 1
  const handleGenerateQR = async (item) => {
    try {
      const type = activeTab === 'vehicules' ? 'vehicules' : 'bornes';
      const data = await apiPost(tenantSlug, `/actifs/${type}/${item.id}/qr-code`, {});
      setQRCodeData({
        qr_code: data.qr_code,
        qr_code_url: data.qr_code_url,
        item_name: item.nom
      });
      setShowQRModal(true);
      
      // Rafraîchir la liste
      if (activeTab === 'vehicules') {
        fetchVehicules();
      } else {
        fetchBornes();
      }
    } catch (error) {
      console.error('Erreur génération QR:', error);
      alert('❌ Erreur lors de la génération du QR code');
    }
  };

  const handleViewFicheVie = async (vehicle) => {
    try {
      const data = await apiGet(tenantSlug, `/actifs/vehicules/${vehicle.id}/fiche-vie`);
      setFicheVieData(data);
      setShowFicheVieModal(true);
    } catch (error) {
      console.error('Erreur fiche de vie:', error);
      alert('❌ Erreur lors du chargement de la fiche de vie');
    }
  };

  const handleViewInspections = async (vehicle) => {
    try {
      const data = await apiGet(tenantSlug, `/actifs/vehicules/${vehicle.id}/inspections`);
      setInspectionHistory(data);
      setSelectedItem(vehicle);
      setShowInspectionModal(true);
    } catch (error) {
      console.error('Erreur inspections:', error);
      alert('❌ Erreur lors du chargement des inspections');
    }
  };

  const handleCreateInspection = (vehicle) => {
    setSelectedVehiculeForRonde(vehicle);
    setShowRondeSecuriteModal(true);
  };

  return (
    <div className="gestion-actifs" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>🚒 Gestion des Actifs</h1>
        {activeTab !== 'inventaires' && activeTab !== 'epi' && (
          <button 
            onClick={openCreateModal}
            style={{
              padding: '12px 24px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            + Ajouter {activeTab === 'vehicules' ? 'un véhicule' : 'une borne'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #ddd' }}>
        <TabButton
          label="🚗 Véhicules"
          active={activeTab === 'vehicules'}
          onClick={() => setActiveTab('vehicules')}
        />
        <TabButton
          label="💧 Bornes d'incendie"
          active={activeTab === 'bornes'}
          onClick={() => setActiveTab('bornes')}
        />
        <TabButton
          label="📋 Inventaires"
          active={activeTab === 'inventaires'}
          onClick={() => setActiveTab('inventaires')}
        />
        <TabButton
          label="🛡️ Gestion EPI"
          active={activeTab === 'epi'}
          onClick={() => setActiveTab('epi')}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <p>Chargement...</p>
        </div>
      ) : (
        <div>
          {activeTab === 'vehicules' ? (
            <VehiculesTab 
              vehicules={vehicules} 
              onEdit={openEditModal} 
              onDelete={handleDelete}
              onGenerateQR={handleGenerateQR}
              onViewFicheVie={handleViewFicheVie}
              onViewInspections={handleViewInspections}
              onCreateInspection={handleCreateInspection}
            />
          ) : activeTab === 'bornes' ? (
            <BornesTab 
              bornes={bornes} 
              onEdit={openEditModal} 
              onDelete={handleDelete}
              onGenerateQR={handleGenerateQR}
            />
          ) : activeTab === 'epi' ? (
            ModuleEPI ? <ModuleEPI user={user} /> : <div>Module EPI non disponible</div>
          ) : (
            <InventairesTab 
              tenantSlug={tenantSlug}
            />
          )}
        </div>
      )}

      {/* Modals */}
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

      {showQRModal && qrCodeData && (
        <QRCodeModal
          qrCodeData={qrCodeData}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {showFicheVieModal && ficheVieData && (
        <FicheVieModal
          ficheVieData={ficheVieData}
          onClose={() => setShowFicheVieModal(false)}
        />
      )}

      {showInspectionModal && (
        <InspectionHistoryModal
          vehicle={selectedItem}
          inspections={inspectionHistory}
          onClose={() => setShowInspectionModal(false)}
        />
      )}
    </div>
  );
};

// ==================== COMPONENTS ====================

const TabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '12px 20px',
      backgroundColor: active ? '#e74c3c' : 'transparent',
      color: active ? 'white' : '#333',
      border: 'none',
      borderBottom: active ? '3px solid #e74c3c' : 'none',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: active ? 'bold' : 'normal',
      transition: 'all 0.3s'
    }}
  >
    {label}
  </button>
);

const VehiculesTab = ({ vehicules, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection }) => {
  if (vehicules.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>🚗</div>
        <h3>Aucun véhicule enregistré</h3>
        <p>Commencez par ajouter votre premier véhicule</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
      {vehicules.map(vehicule => (
        <VehiculeCard 
          key={vehicule.id}
          vehicule={vehicule}
          onEdit={onEdit}
          onDelete={onDelete}
          onGenerateQR={onGenerateQR}
          onViewFicheVie={onViewFicheVie}
          onViewInspections={onViewInspections}
          onCreateInspection={onCreateInspection}
        />
      ))}
    </div>
  );
};

const VehiculeCard = ({ vehicule, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection }) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'actif': return '#27ae60';
      case 'maintenance': return '#f39c12';
      case 'retraite': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusLabel = (status) => {
    switch(status) {
      case 'actif': return 'En service';
      case 'maintenance': return 'Maintenance';
      case 'retraite': return 'Retraité';
      default: return status;
    }
  };

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'pointer'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)';
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>{vehicule.nom}</h3>
        <span style={{
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: getStatusColor(vehicule.statut),
          color: 'white'
        }}>
          {getStatusLabel(vehicule.statut)}
        </span>
      </div>
      
      <div style={{ marginBottom: '15px', color: '#555', lineHeight: '1.8' }}>
        {vehicule.type_vehicule && (
          <p style={{ margin: '5px 0' }}>
            <strong>Type:</strong> {vehicule.type_vehicule}
          </p>
        )}
        {vehicule.marque && (
          <p style={{ margin: '5px 0' }}>
            <strong>Marque:</strong> {vehicule.marque} {vehicule.modele}
          </p>
        )}
        {vehicule.annee && (
          <p style={{ margin: '5px 0' }}>
            <strong>Année:</strong> {vehicule.annee}
          </p>
        )}
        {vehicule.vin && (
          <p style={{ margin: '5px 0', fontSize: '13px' }}>
            <strong>VIN:</strong> {vehicule.vin}
          </p>
        )}
        {vehicule.derniere_inspection_date && (
          <p style={{ margin: '5px 0', color: '#27ae60' }}>
            <strong>✅ Dernière inspection:</strong> {new Date(vehicule.derniere_inspection_date).toLocaleDateString('fr-CA')}
          </p>
        )}
      </div>

      {/* QR Code Display */}
      {vehicule.qr_code && (
        <div style={{ 
          textAlign: 'center', 
          padding: '10px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <img 
            src={vehicule.qr_code} 
            alt="QR Code" 
            style={{ width: '100px', height: '100px' }}
          />
          <p style={{ fontSize: '11px', color: '#666', margin: '5px 0 0 0' }}>
            Scanner pour accéder à la fiche
          </p>
        </div>
      )}

      {/* Actions principales */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <ActionButton
          label="✏️ Modifier"
          color="#3498db"
          onClick={() => onEdit(vehicule)}
        />
        <ActionButton
          label="📋 Fiche de vie"
          color="#9b59b6"
          onClick={() => onViewFicheVie(vehicule)}
        />
      </div>

      {/* Actions secondaires */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <ActionButton
          label="📝 Inspections"
          color="#16a085"
          onClick={() => onViewInspections(vehicule)}
          small
        />
        <ActionButton
          label="✅ Nouvelle inspection"
          color="#27ae60"
          onClick={() => onCreateInspection(vehicule)}
          small
        />
      </div>

      {/* Actions tertiaires */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <ActionButton
          label="📱 QR Code"
          color="#f39c12"
          onClick={() => onGenerateQR(vehicule)}
          small
        />
        <ActionButton
          label="🗑️ Supprimer"
          color="#e74c3c"
          onClick={() => onDelete(vehicule.id)}
          small
        />
      </div>
    </div>
  );
};

const ActionButton = ({ label, color, onClick, small = false }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      padding: small ? '6px' : '10px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: small ? '12px' : '14px',
      fontWeight: small ? 'normal' : 'bold',
      transition: 'opacity 0.2s'
    }}
    onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
    onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
  >
    {label}
  </button>
);

const BornesTab = ({ bornes, onEdit, onDelete, onGenerateQR }) => {
  if (bornes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>💧</div>
        <h3>Aucune borne d'incendie enregistrée</h3>
        <p>Commencez par ajouter votre première borne</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
      {bornes.map(borne => (
        <BorneCard
          key={borne.id}
          borne={borne}
          onEdit={onEdit}
          onDelete={onDelete}
          onGenerateQR={onGenerateQR}
        />
      ))}
    </div>
  );
};

const BorneCard = ({ borne, onEdit, onDelete, onGenerateQR }) => {
  const getStatusColor = (status) => {
    switch(status) {
      case 'operationnelle': return '#27ae60';
      case 'hors_service': return '#e74c3c';
      case 'a_verifier': return '#f39c12';
      default: return '#95a5a6';
    }
  };

  return (
    <div style={{
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      padding: '20px',
      backgroundColor: 'white',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50' }}>{borne.nom}</h3>
        <span style={{
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: getStatusColor(borne.statut),
          color: 'white'
        }}>
          {borne.statut}
        </span>
      </div>
      
      <div style={{ marginBottom: '15px', color: '#555' }}>
        <p><strong>Type:</strong> {borne.type_borne === 'seche' ? 'Borne sèche' : 'Borne fontaine'}</p>
        {borne.municipalite && <p><strong>Municipalité:</strong> {borne.municipalite}</p>}
        {borne.adresse && <p><strong>Adresse:</strong> {borne.adresse}</p>}
        {borne.transversale && <p><strong>Transversale:</strong> {borne.transversale}</p>}
        {borne.debit && <p><strong>Débit:</strong> {borne.debit}</p>}
        {borne.lien_maps && (
          <p>
            <a href={borne.lien_maps} target="_blank" rel="noopener noreferrer" style={{ color: '#3498db' }}>
              📍 Voir sur la carte
            </a>
          </p>
        )}
      </div>

      {borne.qr_code && (
        <div style={{ 
          textAlign: 'center', 
          padding: '10px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '8px',
          marginBottom: '15px'
        }}>
          <img 
            src={borne.qr_code} 
            alt="QR Code" 
            style={{ width: '100px', height: '100px' }}
          />
          <p style={{ fontSize: '11px', color: '#666', margin: '5px 0 0 0' }}>
            Scanner pour accéder à la fiche
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '15px' }}>
        <ActionButton label="✏️ Modifier" color="#3498db" onClick={() => onEdit(borne)} />
        <ActionButton label="📱 QR Code" color="#f39c12" onClick={() => onGenerateQR(borne)} small />
        <ActionButton label="🗑️ Supprimer" color="#e74c3c" onClick={() => onDelete(borne.id)} small />
      </div>
    </div>
  );
};

// ==================== MODALS ====================

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
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ marginTop: 0 }}>
          {mode === 'create' ? 'Ajouter' : 'Modifier'} {type === 'vehicules' ? 'un véhicule' : 'une borne'}
        </h2>
        
        <form onSubmit={onSubmit}>
          {type === 'vehicules' ? (
            <VehiculeForm formData={formData} handleChange={handleChange} />
          ) : (
            <BorneForm formData={formData} handleChange={handleChange} />
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#95a5a6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 'bold'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 'bold'
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

const VehiculeForm = ({ formData, handleChange }) => (
  <>
    <FormField
      label="Nom du véhicule *"
      name="nom"
      value={formData.nom || ''}
      onChange={handleChange}
      required
      placeholder="Ex: Autopompe 391, Citerne 301"
    />

    <FormField
      label="Type de véhicule"
      name="type_vehicule"
      type="select"
      value={formData.type_vehicule || 'Autopompe'}
      onChange={handleChange}
      options={[
        { value: 'Autopompe', label: 'Autopompe' },
        { value: 'Citerne', label: 'Citerne' },
        { value: 'Échelle', label: 'Échelle' },
        { value: 'Pick-up', label: 'Pick-up' },
        { value: 'VUS', label: 'VUS' },
        { value: 'Autre', label: 'Autre' }
      ]}
    />

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
      <FormField
        label="Marque"
        name="marque"
        value={formData.marque || ''}
        onChange={handleChange}
        placeholder="Ex: Freightliner, Ford"
      />
      <FormField
        label="Modèle"
        name="modele"
        value={formData.modele || ''}
        onChange={handleChange}
        placeholder="Ex: M2 106, F-550"
      />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
      <FormField
        label="Année"
        name="annee"
        type="number"
        value={formData.annee || ''}
        onChange={handleChange}
        placeholder="2020"
      />
      <FormField
        label="Statut"
        name="statut"
        type="select"
        value={formData.statut || 'actif'}
        onChange={handleChange}
        options={[
          { value: 'actif', label: 'En service' },
          { value: 'maintenance', label: 'En maintenance' },
          { value: 'retraite', label: 'Retraité' }
        ]}
      />
    </div>

    <FormField
      label="VIN (Numéro d'identification)"
      name="vin"
      value={formData.vin || ''}
      onChange={handleChange}
      placeholder="17 caractères"
    />

    <FormField
      label="Notes"
      name="notes"
      type="textarea"
      value={formData.notes || ''}
      onChange={handleChange}
      rows={3}
    />
  </>
);

const BorneForm = ({ formData, handleChange }) => (
  <>
    <FormField
      label="Nom de la borne *"
      name="nom"
      value={formData.nom || ''}
      onChange={handleChange}
      required
      placeholder="Ex: Allen, Borne Wallace"
    />

    <FormField
      label="Type de borne *"
      name="type_borne"
      type="select"
      value={formData.type_borne || 'seche'}
      onChange={handleChange}
      required
      options={[
        { value: 'seche', label: 'Borne sèche' },
        { value: 'fontaine', label: 'Borne fontaine' }
      ]}
    />

    <FormField
      label="Municipalité"
      name="municipalite"
      value={formData.municipalite || ''}
      onChange={handleChange}
      placeholder="Ex: Canton de Shefford"
    />

    <FormField
      label="Adresse"
      name="adresse"
      value={formData.adresse || ''}
      onChange={handleChange}
    />

    <FormField
      label="Transversale"
      name="transversale"
      value={formData.transversale || ''}
      onChange={handleChange}
      placeholder="Ex: Chemin Wallace"
    />

    <FormField
      label="Débit"
      name="debit"
      value={formData.debit || ''}
      onChange={handleChange}
      placeholder="Ex: 1000 GPM"
    />

    <FormField
      label="Lien Google Maps"
      name="lien_maps"
      value={formData.lien_maps || ''}
      onChange={handleChange}
      placeholder="https://maps.app.goo.gl/..."
    />

    <FormField
      label="Statut"
      name="statut"
      type="select"
      value={formData.statut || 'operationnelle'}
      onChange={handleChange}
      options={[
        { value: 'operationnelle', label: 'Opérationnelle' },
        { value: 'hors_service', label: 'Hors service' },
        { value: 'a_verifier', label: 'À vérifier' }
      ]}
    />

    <FormField
      label="Notes importantes"
      name="notes_importantes"
      type="textarea"
      value={formData.notes_importantes || ''}
      onChange={handleChange}
      rows={3}
      placeholder="Ex: Allumer vos gyrophares, attention aux petites roches..."
    />
  </>
);

const FormField = ({ label, name, value, onChange, type = 'text', required = false, placeholder = '', options = [], rows = 3 }) => (
  <div style={{ marginBottom: '20px' }}>
    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#2c3e50' }}>
      {label}
    </label>
    {type === 'textarea' ? (
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px',
          fontFamily: 'inherit'
        }}
      />
    ) : type === 'select' ? (
      <select
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px'
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    ) : (
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px',
          border: '1px solid #ddd',
          borderRadius: '6px',
          fontSize: '14px'
        }}
      />
    )}
  </div>
);

const QRCodeModal = ({ qrCodeData, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '40px',
      maxWidth: '500px',
      textAlign: 'center'
    }}>
      <h2 style={{ marginTop: 0 }}>📱 QR Code - {qrCodeData.item_name}</h2>
      <img 
        src={qrCodeData.qr_code} 
        alt="QR Code" 
        style={{ width: '300px', height: '300px', margin: '20px 0' }}
      />
      <p style={{ fontSize: '13px', color: '#666', wordBreak: 'break-all' }}>
        {qrCodeData.qr_code_url}
      </p>
      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px 30px',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);

const FicheVieModal = ({ ficheVieData, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '30px',
      maxWidth: '700px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <h2 style={{ marginTop: 0 }}>📋 Fiche de vie - {ficheVieData.vehicle_name}</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        {ficheVieData.vehicle_type} • Créé le {new Date(ficheVieData.created_at).toLocaleString('fr-CA')}
      </p>

      {ficheVieData.logs && ficheVieData.logs.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          {ficheVieData.logs.map((log, index) => (
            <div key={index} style={{
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderLeft: '4px solid #3498db',
              marginBottom: '10px',
              borderRadius: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <strong style={{ color: '#2c3e50' }}>{log.action}</strong>
                <span style={{ fontSize: '13px', color: '#7f8c8d' }}>
                  {new Date(log.date).toLocaleString('fr-CA')}
                </span>
              </div>
              <p style={{ margin: '5px 0', color: '#555' }}>{log.details}</p>
              <p style={{ margin: '5px 0', fontSize: '13px', color: '#7f8c8d' }}>
                Par: {log.user_name}
              </p>
              {log.gps && (
                <p style={{ margin: '5px 0', fontSize: '12px', color: '#95a5a6' }}>
                  📍 GPS: {log.gps[1]}, {log.gps[0]}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
          Aucune entrée dans la fiche de vie
        </p>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px',
          width: '100%',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);

const InspectionHistoryModal = ({ vehicle, inspections, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  }}>
    <div style={{
      backgroundColor: 'white',
      borderRadius: '12px',
      padding: '30px',
      maxWidth: '800px',
      width: '90%',
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <h2 style={{ marginTop: 0 }}>📝 Historique des inspections - {vehicle.nom}</h2>

      {inspections && inspections.length > 0 ? (
        <div style={{ marginTop: '20px' }}>
          {inspections.map((insp, index) => (
            <div key={index} style={{
              padding: '20px',
              backgroundColor: insp.passed ? '#f0fdf4' : '#fee2e2',
              borderLeft: `4px solid ${insp.passed ? '#27ae60' : '#e74c3c'}`,
              marginBottom: '15px',
              borderRadius: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong style={{ fontSize: '16px' }}>
                  {insp.passed ? '✅ Inspection réussie' : '❌ Défaut(s) détecté(s)'}
                </strong>
                <span style={{ fontSize: '13px', color: '#666' }}>
                  {new Date(insp.inspection_date).toLocaleString('fr-CA')}
                </span>
              </div>
              
              <p style={{ margin: '5px 0' }}>
                <strong>Inspecteur:</strong> {insp.inspector_name}
                {insp.inspector_matricule && ` (${insp.inspector_matricule})`}
              </p>
              
              {insp.comments && (
                <p style={{ margin: '10px 0', fontStyle: 'italic', color: '#555' }}>
                  "{insp.comments}"
                </p>
              )}

              {insp.defects && insp.defects.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <strong>Défectuosités:</strong>
                  <ul style={{ marginTop: '5px' }}>
                    {insp.defects.map((defect, i) => (
                      <li key={i} style={{ 
                        color: defect.severity === 'majeure' ? '#c0392b' : '#f39c12',
                        marginBottom: '5px'
                      }}>
                        <strong>{defect.item}</strong> ({defect.severity}): {defect.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>
          Aucune inspection enregistrée pour ce véhicule
        </p>
      )}

      <button
        onClick={onClose}
        style={{
          marginTop: '20px',
          padding: '12px',
          width: '100%',
          backgroundColor: '#3498db',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '15px',
          fontWeight: 'bold'
        }}
      >
        Fermer
      </button>
    </div>
  </div>
);

export default GestionActifs;
