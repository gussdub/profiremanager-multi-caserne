import React, { useState, useEffect } from 'react';
import axios from 'axios';
import InventairesTab from './GestionInventaires';
import RondeSecurite from './RondeSecurite';
import HistoriqueRondesSecurite from './HistoriqueRondesSecurite';
import ContreSignatureModal from './ContreSignatureModal';
import ConfigurationEmailsRondes from './ConfigurationEmailsRondes';
import ConfigurationEmailsBornesSeches from './ConfigurationEmailsBornesSeches';
import ConfigurationEmailsEPI from './ConfigurationEmailsEPI';
import CarteApprovisionnementEau from './CarteApprovisionnementEau';
import InspectionsBornesSeches from './InspectionsBornesSeches';
import InventaireVehiculeModal from './InventaireVehiculeModal';
import HistoriqueInventairesVehicule from './HistoriqueInventairesVehicule';
import ParametresInventairesVehicules from './ParametresInventairesVehicules';
import ParametresInspectionsBornesSeches from './ParametresInspectionsBornesSeches';
import ParametresInspectionsAPRIA from './ParametresInspectionsAPRIA';
import MaterielEquipementsModule from './MaterielEquipementsModule';
import ConfigurationEmailsEquipements from './ConfigurationEmailsEquipements';
import ImportCSVEquipements from './ImportCSVEquipements';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { Label } from './ui/label';
import { Input } from './ui/input';

const GestionActifs = ({ user, ModuleEPI }) => {
  const [activeTab, setActiveTab] = useState('vehicules');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
  const [showHistoriqueRondesModal, setShowHistoriqueRondesModal] = useState(false);
  const [showContreSignatureModal, setShowContreSignatureModal] = useState(false);
  const [selectedRondeForCounterSign, setSelectedRondeForCounterSign] = useState(null);
  const [showImportCSVModal, setShowImportCSVModal] = useState(false);
  const [showParametresModal, setShowParametresModal] = useState(false);
  const [bornesSeches, setBornesSeches] = useState([]);
  const [showBorneSecheModal, setShowBorneSecheModal] = useState(false);
  const [showInspectionBorneSecheModal, setShowInspectionBorneSecheModal] = useState(false);
  const [selectedBorneSeche, setSelectedBorneSeche] = useState(null);
  const [eauSubTab, setEauSubTab] = useState('carte');
  
  // États pour inventaire véhicules
  const [showInventaireModal, setShowInventaireModal] = useState(false);
  const [selectedVehiculeForInventaire, setSelectedVehiculeForInventaire] = useState(null);
  const [showHistoriqueInventairesModal, setShowHistoriqueInventairesModal] = useState(false);

  const { tenantSlug } = useTenant();

  useEffect(() => {
    if (activeTab === 'vehicules') {
      fetchVehicules();
    }
  }, [activeTab]);

  // Détecter si l'utilisateur vient d'un QR code
  useEffect(() => {
    // Petit délai pour s'assurer que le composant est monté
    const timer = setTimeout(() => {
      const qrActionData = localStorage.getItem('qr_action');
      console.log('🔍 Vérification qr_action:', qrActionData);
      
      if (qrActionData) {
        try {
          const qrAction = JSON.parse(qrActionData);
          console.log('✅ QR Action trouvée:', qrAction);
          
          if (qrAction.action === 'ronde_securite' && qrAction.vehicule) {
            console.log('🚀 Ouverture du modal Ronde de Sécurité avec véhicule:', qrAction.vehicule);
            
            // S'assurer que l'onglet véhicules est actif
            setActiveTab('vehicules');
            
            // Ouvrir automatiquement la ronde de sécurité avec le véhicule
            setSelectedVehiculeForRonde(qrAction.vehicule);
            setShowRondeSecuriteModal(true);
            
            // Supprimer l'action du localStorage
            localStorage.removeItem('qr_action');
          } else if (qrAction.action === 'inventaire_vehicule' && qrAction.vehicule) {
            console.log('📦 Ouverture du modal Inventaire Véhicule avec véhicule:', qrAction.vehicule);
            
            // S'assurer que l'onglet véhicules est actif
            setActiveTab('vehicules');
            
            // Ouvrir automatiquement le modal d'inventaire avec le véhicule
            setSelectedVehiculeForInventaire(qrAction.vehicule);
            setShowInventaireModal(true);
            
            // Supprimer l'action du localStorage
            localStorage.removeItem('qr_action');
          }
        } catch (err) {
          console.error('❌ Erreur parsing qr_action:', err);
          localStorage.removeItem('qr_action');
        }
      } else {
        console.log('ℹ️ Pas de qr_action dans localStorage');
      }
    }, 500); // Délai de 500ms
    
    return () => clearTimeout(timer);
  }, []);

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


  const fetchBornesSeches = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/bornes-seches/templates');
      setBornesSeches(data);
    } catch (error) {
      console.error('Erreur lors du chargement des bornes sèches:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors du chargement des bornes sèches: ' + errorMessage);
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
        // Si annee est vide ou invalide, le supprimer pour éviter l'erreur de validation
        if (preparedData.annee && preparedData.annee !== '') {
          const parsedAnnee = parseInt(preparedData.annee, 10);
          if (!isNaN(parsedAnnee)) {
            preparedData.annee = parsedAnnee;
          } else {
            delete preparedData.annee;
          }
        } else {
          delete preparedData.annee;
        }
        
        // Même logique pour kilometrage
        if (preparedData.kilometrage && preparedData.kilometrage !== '') {
          const parsedKm = parseFloat(preparedData.kilometrage);
          if (!isNaN(parsedKm)) {
            preparedData.kilometrage = parsedKm;
          } else {
            delete preparedData.kilometrage;
          }
        } else {
          delete preparedData.kilometrage;
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
    setSelectedItem(vehicle);
    setShowHistoriqueRondesModal(true);
  };

  const handleCreateInspection = (vehicle) => {
    setSelectedVehiculeForRonde(vehicle);
    setShowRondeSecuriteModal(true);
  };

  const handleContreSignerClick = (ronde) => {
    setSelectedRondeForCounterSign(ronde);
    setShowHistoriqueRondesModal(false);
    setShowContreSignatureModal(true);
  };

  const handleRefuserRonde = (raison) => {
    console.log('Ronde refusée:', raison);
    // Ouvrir le formulaire de nouvelle ronde
    setShowContreSignatureModal(false);
    setShowRondeSecuriteModal(true);
  };

  // Fonctions inventaire véhicules
  const handleCreateInventaire = (vehicle) => {
    setSelectedVehiculeForInventaire(vehicle);
    setShowInventaireModal(true);
  };

  const handleViewHistoriqueInventaires = (vehicle) => {
    setSelectedItem(vehicle);
    setShowHistoriqueInventairesModal(true);
  };

  return (
    <div className="gestion-actifs" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>🚒 Gestion des Actifs</h1>
        
        {/* Bouton Ajouter à droite - Caché pour les employés */}
        {activeTab === 'vehicules' && user?.role !== 'employe' && (
          <button 
            onClick={openCreateModal}
            style={{
              padding: '10px 16px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap'
            }}
          >
            + Ajouter un véhicule
          </button>
        )}
      </div>

      {/* Mobile Menu Toggle */}
      <div className="mobile-tab-toggle" style={{ display: 'none' }}>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            width: '100%',
            padding: '12px 16px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            fontWeight: 'bold',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>
            {activeTab === 'vehicules' && '🚗 Véhicules'}
            {activeTab === 'eau' && '💧 Approvisionnement en Eau'}
            {activeTab === 'materiel' && '🔧 Matériel & Équipements'}
            {activeTab === 'epi' && '🛡️ Gestion EPI'}
            {activeTab === 'parametres' && '⚙️ Paramètres'}
          </span>
          <span style={{ transform: mobileMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
        </button>
        
        {/* Dropdown Menu for Mobile */}
        {mobileMenuOpen && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 100,
            marginTop: '4px',
            overflow: 'hidden'
          }}>
            <MobileTabButton
              label="🚗 Véhicules"
              active={activeTab === 'vehicules'}
              onClick={() => { setActiveTab('vehicules'); setMobileMenuOpen(false); }}
            />
            <MobileTabButton
              label="💧 Approvisionnement en Eau"
              active={activeTab === 'eau'}
              onClick={() => { setActiveTab('eau'); setMobileMenuOpen(false); }}
            />
            <MobileTabButton
              label="🔧 Matériel & Équipements"
              active={activeTab === 'materiel'}
              onClick={() => { setActiveTab('materiel'); setMobileMenuOpen(false); }}
            />
            <MobileTabButton
              label="🛡️ Gestion EPI"
              active={activeTab === 'epi'}
              onClick={() => { setActiveTab('epi'); setMobileMenuOpen(false); }}
            />
            <MobileTabButton
              label="⚙️ Paramètres"
              active={activeTab === 'parametres'}
              onClick={() => { setActiveTab('parametres'); setMobileMenuOpen(false); }}
            />
          </div>
        )}
      </div>

      {/* Desktop Tabs - Horizontal scrollable on tablet */}
      <div className="desktop-tabs" style={{ 
        display: 'flex', 
        gap: '4px', 
        marginBottom: '20px', 
        borderBottom: '2px solid #ddd',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        <TabButton
          label="🚗 Véhicules"
          active={activeTab === 'vehicules'}
          onClick={() => setActiveTab('vehicules')}
        />
        <TabButton
          label="💧 Approvisionnement en Eau"
          active={activeTab === 'eau'}
          onClick={() => setActiveTab('eau')}
        />
        <TabButton
          label="🔧 Matériel & Équipements"
          active={activeTab === 'materiel'}
          onClick={() => setActiveTab('materiel')}
        />
        <TabButton
          label="🛡️ Gestion EPI"
          active={activeTab === 'epi'}
          onClick={() => setActiveTab('epi')}
        />
        <TabButton
          label="⚙️ Paramètres"
          active={activeTab === 'parametres'}
          onClick={() => setActiveTab('parametres')}
        />
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-tab-toggle {
            display: block !important;
            position: relative;
            margin-bottom: 16px;
          }
          .desktop-tabs {
            display: none !important;
          }
          .gestion-actifs {
            padding: 12px !important;
          }
        }
        .desktop-tabs::-webkit-scrollbar {
          display: none;
        }
      `}</style>

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
              onCreateInventaire={handleCreateInventaire}
              onViewHistoriqueInventaires={handleViewHistoriqueInventaires}
            />
          ) : activeTab === 'eau' ? (
            <div>
              {/* Sous-onglets pour Approvisionnement en Eau */}
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '16px',
                borderBottom: '2px solid #e0e0e0',
                paddingBottom: '10px',
                flexWrap: 'wrap'
              }}>
                <button
                  onClick={() => setEauSubTab('carte')}
                  style={{
                    padding: '8px 14px',
                    background: eauSubTab === 'carte' ? '#3498db' : 'transparent',
                    color: eauSubTab === 'carte' ? 'white' : '#555',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    flex: '1 1 auto',
                    minWidth: '140px'
                  }}
                >
                  🗺️ Carte Points d'Eau
                </button>
                <button
                  onClick={() => setEauSubTab('inspections')}
                  style={{
                    padding: '8px 14px',
                    background: eauSubTab === 'inspections' ? '#e74c3c' : 'transparent',
                    color: eauSubTab === 'inspections' ? 'white' : '#555',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    flex: '1 1 auto',
                    minWidth: '140px'
                  }}
                >
                  🔥 Bornes Sèches
                </button>
              </div>

              {/* Contenu selon le sous-onglet */}
              {eauSubTab === 'carte' ? (
                <CarteApprovisionnementEau user={user} />
              ) : (
                <InspectionsBornesSeches user={user} />
              )}
            </div>
          ) : activeTab === 'epi' ? (
            ModuleEPI ? <ModuleEPI user={user} /> : <div>Module EPI non disponible</div>
          ) : activeTab === 'parametres' ? (
            <ParametresActifsTab tenantSlug={tenantSlug} user={user} />
          ) : activeTab === 'materiel' ? (
            <MaterielEquipementsModule user={user} />
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

      {showRondeSecuriteModal && selectedVehiculeForRonde && (
        <RondeSecurite
          vehicule={selectedVehiculeForRonde}
          user={user}
          onClose={() => {
            setShowRondeSecuriteModal(false);
            setSelectedVehiculeForRonde(null);
          }}
          onSuccess={() => {
            fetchVehicules();
          }}
        />
      )}

      {showHistoriqueRondesModal && selectedItem && (
        <HistoriqueRondesSecurite
          vehicule={selectedItem}
          onClose={() => {
            setShowHistoriqueRondesModal(false);
            setSelectedItem(null);
          }}
          onContreSignerClick={handleContreSignerClick}
        />
      )}

      {showContreSignatureModal && selectedRondeForCounterSign && selectedItem && (
        <ContreSignatureModal
          ronde={selectedRondeForCounterSign}
          vehicule={selectedItem}
          user={user}
          onClose={() => {
            setShowContreSignatureModal(false);
            setSelectedRondeForCounterSign(null);
          }}
          onSuccess={() => {
            setShowHistoriqueRondesModal(true);
            setShowContreSignatureModal(false);
            setSelectedRondeForCounterSign(null);
          }}
          onRefuser={handleRefuserRonde}
        />
      )}

      {showImportCSVModal && (
        <ImportCSVModal
          tenantSlug={tenantSlug}
          onClose={() => setShowImportCSVModal(false)}
          onSuccess={() => {
            fetchBornes();
            setShowImportCSVModal(false);
          }}
        />
      )}

      {showBorneSecheModal && (
        <BorneSecheModal
          borne={selectedBorneSeche}
          tenantSlug={tenantSlug}
          onClose={() => {
            setShowBorneSecheModal(false);
            setSelectedBorneSeche(null);
          }}
          onSuccess={() => {
            fetchBornesSeches();
            setShowBorneSecheModal(false);
            setSelectedBorneSeche(null);
          }}
        />
      )}

      {showInspectionBorneSecheModal && selectedBorneSeche && (
        <InspectionBorneSecheModal
          borne={selectedBorneSeche}
          tenantSlug={tenantSlug}
          user={user}
          onClose={() => {
            setShowInspectionBorneSecheModal(false);
            setSelectedBorneSeche(null);
          }}
          onSuccess={() => {
            fetchBornesSeches();
            setShowInspectionBorneSecheModal(false);
            setSelectedBorneSeche(null);
          }}
        />
      )}

      {showInventaireModal && selectedVehiculeForInventaire && (
        <InventaireVehiculeModal
          vehicule={selectedVehiculeForInventaire}
          user={user}
          onClose={() => {
            setShowInventaireModal(false);
            setSelectedVehiculeForInventaire(null);
          }}
          onSuccess={() => {
            fetchVehicules();
          }}
        />
      )}

      {showHistoriqueInventairesModal && selectedItem && (
        <HistoriqueInventairesVehicule
          vehicule={selectedItem}
          onClose={() => {
            setShowHistoriqueInventairesModal(false);
            setSelectedItem(null);
          }}
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
      padding: '10px 14px',
      backgroundColor: active ? '#e74c3c' : 'transparent',
      color: active ? 'white' : '#333',
      border: 'none',
      borderBottom: active ? '3px solid #e74c3c' : 'none',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: active ? 'bold' : 'normal',
      transition: 'all 0.3s',
      whiteSpace: 'nowrap',
      flexShrink: 0
    }}
  >
    {label}
  </button>
);

const MobileTabButton = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      width: '100%',
      padding: '14px 16px',
      backgroundColor: active ? '#fee2e2' : 'white',
      color: active ? '#e74c3c' : '#333',
      border: 'none',
      borderBottom: '1px solid #eee',
      cursor: 'pointer',
      fontSize: '15px',
      fontWeight: active ? 'bold' : 'normal',
      textAlign: 'left',
      transition: 'all 0.2s'
    }}
  >
    {label}
  </button>
);

const VehiculesTab = ({ vehicules, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection, onCreateInventaire, onViewHistoriqueInventaires }) => {
  if (vehicules.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666', backgroundColor: '#f8f9fa', borderRadius: '12px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚗</div>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Aucun véhicule enregistré</h3>
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Commencez par ajouter votre premier véhicule</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
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
          onCreateInventaire={onCreateInventaire}
          onViewHistoriqueInventaires={onViewHistoriqueInventaires}
        />
      ))}
    </div>
  );
};

const VehiculeCard = ({ vehicule, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection, onCreateInventaire, onViewHistoriqueInventaires }) => {
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
          label="📝 Historique rondes de sécurité"
          color="#16a085"
          onClick={() => onViewInspections(vehicule)}
          small
        />
        <ActionButton
          label="✅ Nouvelle ronde de sécurité"
          color="#27ae60"
          onClick={() => onCreateInspection(vehicule)}
          small
        />
      </div>

      {/* Actions inventaire */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <ActionButton
          label="📦 Inventaire"
          color="#8e44ad"
          onClick={() => onCreateInventaire(vehicule)}
          small
        />
        <ActionButton
          label="📋 Historique inventaires"
          color="#9b59b6"
          onClick={() => onViewHistoriqueInventaires(vehicule)}
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
        <p><strong>Type:</strong> {
          borne.type_borne === 'seche' ? 'Borne sèche' : 
          borne.type_borne === 'fontaine' ? 'Borne fontaine' : 
          'Point d\'eau statique'
        }</p>
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





// ==================== ONGLET BORNES SÈCHES ====================
const BornesSechesTab = ({ bornesSeches, onEdit, onDelete, onInspect, onCreate, user }) => {

  return (
    <div>
      {/* Bouton Ajouter */}
      {(user?.role === 'admin' || user?.role === 'superviseur') && (
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCreate}
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
            + Ajouter une borne sèche
          </button>
        </div>
      )}

      {/* Liste des bornes */}
      {bornesSeches.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          background: '#f8f9fa', 
          borderRadius: '12px',
          color: '#6c757d'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔥</div>
          <h3 style={{ marginBottom: '10px' }}>Aucune borne sèche</h3>
          <p>Ajoutez votre première borne sèche pour commencer</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {bornesSeches.map(borne => (
            <div key={borne.id} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              {/* Photo de la borne */}
              {borne.photo_borne && (
                <div style={{ marginBottom: '15px', borderRadius: '8px', overflow: 'hidden' }}>
                  <img 
                    src={borne.photo_borne} 
                    alt={borne.nom_borne}
                    style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Titre */}
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#2c3e50' }}>
                🔥 {borne.nom_borne}
              </h3>

              {/* Infos */}
              <div style={{ marginBottom: '15px', color: '#555', fontSize: '14px' }}>
                <p style={{ marginBottom: '5px' }}><strong>Municipalité:</strong> {borne.municipalite}</p>
                {borne.adresse_proximite && (
                  <p style={{ marginBottom: '5px' }}><strong>Adresse:</strong> {borne.adresse_proximite}</p>
                )}
                {borne.transversale && (
                  <p style={{ marginBottom: '5px' }}><strong>Transversale:</strong> {borne.transversale}</p>
                )}
                <p style={{ marginBottom: '5px' }}>
                  <strong>Type:</strong> {borne.type_borne} - {borne.angle} - {borne.diametre_tuyau}
                </p>
              </div>

              {/* Boutons d'action */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onInspect(borne)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  📋 Inspecter
                </button>
                {(user?.role === 'admin' || user?.role === 'superviseur') && (
                  <>
                    <button
                      onClick={() => onEdit(borne)}
                      style={{
                        padding: '10px',
                        background: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => onDelete(borne.id)}
                        style={{
                          padding: '10px',
                          background: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Modal pour créer/modifier une borne sèche
const BorneSecheModal = ({ borne, tenantSlug, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom_borne: borne?.nom_borne || '',
    municipalite: borne?.municipalite || 'Canton de Shefford',
    adresse_proximite: borne?.adresse_proximite || '',
    transversale: borne?.transversale || '',
    lien_itineraire: borne?.lien_itineraire || '',
    notes_importantes: borne?.notes_importantes || '',
    type_borne: borne?.type_borne || 'PVC',
    angle: borne?.angle || '90°',
    diametre_tuyau: borne?.diametre_tuyau || '6"',
    diametre_raccordement: borne?.diametre_raccordement || '6"',
    type_branchement: borne?.type_branchement || 'Fileté',
    photo_localisation: borne?.photo_localisation || '',
    photo_borne: borne?.photo_borne || '',
    schema_1: borne?.schema_1 || '',
    schema_2: borne?.schema_2 || '',
    schema_3: borne?.schema_3 || '',
    schema_4: borne?.schema_4 || '',
    schema_5: borne?.schema_5 || ''
  });

  const handleFileUpload = (field, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (borne?.id) {
        await apiPut(tenantSlug, `/bornes-seches/templates/${borne.id}`, formData);
        alert('✅ Borne sèche modifiée avec succès');
      } else {
        await apiPost(tenantSlug, '/bornes-seches/templates', formData);
        alert('✅ Borne sèche créée avec succès');
      }
      onSuccess();
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur: ' + (error.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overflowY: 'auto'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '30px',
        margin: '20px 0'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '20px' }}>
          {borne ? 'Modifier' : 'Ajouter'} une Borne Sèche
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Informations générales */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              📋 Informations Générales
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Nom de la borne *
                </label>
                <input
                  type="text"
                  value={formData.nom_borne}
                  onChange={(e) => setFormData({...formData, nom_borne: e.target.value})}
                  required
                  placeholder="Ex: 11 Allard"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Municipalité
                </label>
                <input
                  type="text"
                  value={formData.municipalite}
                  onChange={(e) => setFormData({...formData, municipalite: e.target.value})}
                  placeholder="Canton de Shefford"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                Adresse à proximité
              </label>
              <input
                type="text"
                value={formData.adresse_proximite}
                onChange={(e) => setFormData({...formData, adresse_proximite: e.target.value})}
                placeholder="Ex: 11 chemin Allard"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Transversale
                </label>
                <input
                  type="text"
                  value={formData.transversale}
                  onChange={(e) => setFormData({...formData, transversale: e.target.value})}
                  placeholder="Ex: Route 243"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Lien Itinéraire Google Maps
                </label>
                <input
                  type="url"
                  value={formData.lien_itineraire}
                  onChange={(e) => setFormData({...formData, lien_itineraire: e.target.value})}
                  placeholder="https://maps.app.goo.gl/..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                Notes Importantes
              </label>
              <textarea
                value={formData.notes_importantes}
                onChange={(e) => setFormData({...formData, notes_importantes: e.target.value})}
                placeholder="Ex: Allumer vos gyrophares..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          {/* Caractéristiques techniques */}
          <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              🔧 Caractéristiques Techniques
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Type de borne
                </label>
                <input
                  type="text"
                  value={formData.type_borne}
                  onChange={(e) => setFormData({...formData, type_borne: e.target.value})}
                  placeholder="PVC"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Angle
                </label>
                <input
                  type="text"
                  value={formData.angle}
                  onChange={(e) => setFormData({...formData, angle: e.target.value})}
                  placeholder="90°"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Type branchement
                </label>
                <input
                  type="text"
                  value={formData.type_branchement}
                  onChange={(e) => setFormData({...formData, type_branchement: e.target.value})}
                  placeholder="Fileté"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Diamètre tuyau
                </label>
                <input
                  type="text"
                  value={formData.diametre_tuyau}
                  onChange={(e) => setFormData({...formData, diametre_tuyau: e.target.value})}
                  placeholder='6"'
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Diamètre raccordement
                </label>
                <input
                  type="text"
                  value={formData.diametre_raccordement}
                  onChange={(e) => setFormData({...formData, diametre_raccordement: e.target.value})}
                  placeholder='6"'
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Photos et Schémas */}
          <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              📸 Photos et Schémas
            </h3>
            <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '15px' }}>
              Uploadez les images (JPG/PNG). Les images seront stockées en Base64.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {['photo_localisation', 'photo_borne', 'schema_1', 'schema_2', 'schema_3', 'schema_4', 'schema_5'].map((field, idx) => {
                const labels = {
                  photo_localisation: 'Photo de localisation',
                  photo_borne: 'Photo de la borne',
                  schema_1: 'Schéma 1 (Centre borne)',
                  schema_2: 'Schéma 2 (Centre entrée pompe)',
                  schema_3: 'Schéma 3 (Centre sortie borne)',
                  schema_4: 'Schéma 4 (Distance borne-berge)',
                  schema_5: 'Schéma 5 (Sortie-entrée)'
                };

                return (
                  <div key={field} style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '13px' }}>
                      {labels[field]}
                    </label>
                    {formData[field] && (
                      <img 
                        src={formData[field]} 
                        alt={labels[field]}
                        style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '5px' }}
                      />
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) handleFileUpload(field, file);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #ced4da',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// ==================== ONGLET PARAMÈTRES ====================
const ParametresActifsTab = ({ tenantSlug, user }) => {
  const [loading, setLoading] = useState(false);
  const [parametres, setParametres] = useState({
    dates_tests_bornes_seches: []  // [{date: '2024-06-15', description: 'Test printemps'}]
  });
  const [nouvelleDate, setNouvelleDate] = useState('');
  const [nouvelleDescription, setNouvelleDescription] = useState('');
  
  // États pour la configuration EPI
  const [epiSettings, setEpiSettings] = useState({
    epi_jours_avance_expiration: 30,
    epi_jour_alerte_inspection_mensuelle: 20
  });

  useEffect(() => {
    fetchParametres();
    fetchEpiSettings();
  }, [tenantSlug]);

  const fetchParametres = async () => {
    try {
      const data = await apiGet(tenantSlug, '/actifs/parametres');
      if (data) {
        setParametres({
          dates_tests_bornes_seches: data.dates_tests_bornes_seches || []
        });
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  };

  const fetchEpiSettings = async () => {
    try {
      const data = await apiGet(tenantSlug, '/epi/parametres');
      if (data) {
        setEpiSettings({
          epi_jours_avance_expiration: data.epi_jours_avance_expiration || 30,
          epi_jour_alerte_inspection_mensuelle: data.epi_jour_alerte_inspection_mensuelle || 20
        });
      }
    } catch (error) {
      console.error('Erreur chargement paramètres EPI:', error);
    }
  };

  const handleEpiSettingChange = async (field, value) => {
    setEpiSettings(prev => ({ ...prev, [field]: value }));
    
    try {
      const data = await apiGet(tenantSlug, '/epi/parametres');
      await apiPut(tenantSlug, '/epi/parametres', {
        ...data,
        [field]: value
      });
    } catch (error) {
      console.error('Erreur sauvegarde paramètre EPI:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  const ajouterDateTest = async () => {
    if (!nouvelleDate) {
      alert('Veuillez sélectionner une date');
      return;
    }

    setLoading(true);
    try {
      const nouvelleDateObj = {
        date: nouvelleDate,
        description: nouvelleDescription || 'Test planifié',
        created_at: new Date().toISOString(),
        created_by: user?.id
      };

      const nouvellesParam = {
        ...parametres,
        dates_tests_bornes_seches: [...(parametres.dates_tests_bornes_seches || []), nouvelleDateObj]
      };

      await apiPut(tenantSlug, '/actifs/parametres', nouvellesParam);
      setParametres(nouvellesParam);
      setNouvelleDate('');
      setNouvelleDescription('');
      alert('✅ Date de test ajoutée avec succès');
    } catch (error) {
      console.error('Erreur ajout date:', error);
      alert('❌ Erreur lors de l\'ajout de la date');
    } finally {
      setLoading(false);
    }
  };

  const supprimerDateTest = async (index) => {
    if (!confirm('Supprimer cette date de test ?')) return;

    setLoading(true);
    try {
      const nouvellesParam = {
        ...parametres,
        dates_tests_bornes_seches: parametres.dates_tests_bornes_seches.filter((_, i) => i !== index)
      };

      await apiPut(tenantSlug, '/actifs/parametres', nouvellesParam);
      setParametres(nouvellesParam);
      alert('✅ Date de test supprimée');
    } catch (error) {
      console.error('Erreur suppression date:', error);
      alert('❌ Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  };

  const [selectedModule, setSelectedModule] = useState('vehicules'); // Par défaut, sélectionner Véhicules

  const modules = [
    {
      id: 'vehicules',
      icon: '🚗',
      title: 'Véhicules',
      description: 'Rondes de sécurité et inventaires'
    },
    {
      id: 'eau',
      icon: '💧',
      title: 'Approvisionnement en Eau',
      description: 'Bornes sèches et tests'
    },
    {
      id: 'equipements',
      icon: '🔧',
      title: 'Matériel & Équipements',
      description: 'Alertes et notifications'
    },
    {
      id: 'epi',
      icon: '🛡️',
      title: 'Gestion EPI',
      description: 'Équipements de protection'
    }
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: '700', marginBottom: '10px', color: '#2c3e50' }}>
        ⚙️ Paramètres - Gestion des Actifs
      </h1>
      <p style={{ color: '#6B7280', marginBottom: '20px', fontSize: '14px' }}>
        Configurez les paramètres et notifications pour chaque module
      </p>
      
      {/* Cartes fixes toujours visibles - RESPONSIVE */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
        gap: '10px',
        marginBottom: '24px'
      }}>
        {modules.map(module => {
          const isActive = selectedModule === module.id;
          return (
            <div
              key={module.id}
              onClick={() => setSelectedModule(module.id)}
              style={{
                background: isActive ? '#DC2626' : 'white',
                padding: '12px',
                borderRadius: '10px',
                boxShadow: isActive ? '0 4px 12px rgba(220, 38, 38, 0.3)' : '0 2px 6px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: isActive ? '2px solid #DC2626' : '1px solid #e0e0e0',
                textAlign: 'center',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                minWidth: '0'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.12)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
                }
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>
                {module.icon}
              </div>
              <h3 style={{ 
                fontSize: '13px', 
                fontWeight: '600', 
                marginBottom: '2px', 
                color: isActive ? 'white' : '#2c3e50',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {module.title}
              </h3>
              <p style={{ 
                fontSize: '11px', 
                color: isActive ? 'rgba(255,255,255,0.9)' : '#6B7280', 
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {module.description}
              </p>
            </div>
          );
        })}
      </div>

      
      {/* Contenu du module sélectionné */}
      {selectedModule === 'vehicules' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🚗</span>
            Véhicules
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des rondes de sécurité et inventaires
          </p>
        </div>

        {/* Sous-section: Notifications Rondes */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '16px'
        }}>
          <ConfigurationEmailsRondes tenantSlug={tenantSlug} />
        </div>

        {/* Sous-section: Modèles d'Inventaires */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📦</span> Modèles d'Inventaires
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Créez et gérez les modèles d'inventaire pour vos véhicules
          </p>
          <ParametresInventairesVehicules tenantSlug={tenantSlug} user={user} />
        </div>
      </div>
      )}

      {/* ========== MODULE APPROVISIONNEMENT EN EAU ========== */}
      {selectedModule === 'eau' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>💧</span>
            Approvisionnement en Eau
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des dates de tests et notifications pour les bornes sèches
          </p>
        </div>

        {/* Sous-section: Dates de Tests */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔥</span> Dates de Tests - Bornes Sèches
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Configurez les dates auxquelles les tests des bornes sèches doivent être effectués
          </p>

          {/* Formulaire d'ajout - RESPONSIVE */}
          <div style={{ 
            background: '#f8f9fa', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '15px',
            border: '1px solid #dee2e6'
          }}>
            <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: '#34495e' }}>
              Ajouter une nouvelle date
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#555' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    value={nouvelleDate}
                    onChange={(e) => setNouvelleDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #ced4da',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ flex: '2 1 180px', minWidth: '150px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#555' }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={nouvelleDescription}
                    onChange={(e) => setNouvelleDescription(e.target.value)}
                    placeholder="Ex: Test printemps..."
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #ced4da',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <button
                onClick={ajouterDateTest}
                disabled={loading || !nouvelleDate}
                style={{
                  padding: '10px 16px',
                  background: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || !nouvelleDate ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  opacity: loading || !nouvelleDate ? 0.6 : 1,
                  width: '100%'
                }}
              >
                {loading ? 'Ajout...' : '+ Ajouter la date'}
              </button>
            </div>
          </div>

          {/* Liste des dates configurées */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#34495e' }}>
              Dates planifiées
            </h4>
            {!parametres.dates_tests_bornes_seches || parametres.dates_tests_bornes_seches.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '25px', 
                background: '#f8f9fa', 
                borderRadius: '6px',
                color: '#7f8c8d'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📅</div>
                <p style={{ margin: 0, fontSize: '12px' }}>Aucune date configurée</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {parametres.dates_tests_bornes_seches
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((dateTest, index) => {
                    const dateObj = new Date(dateTest.date);
                    const estPasse = dateObj < new Date();
                    const estProche = !estPasse && (dateObj - new Date()) < (30 * 24 * 60 * 60 * 1000);

                    return (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          gap: '8px',
                          background: estPasse ? '#fff3cd' : estProche ? '#d1ecf1' : 'white',
                          border: `1px solid ${estPasse ? '#ffc107' : estProche ? '#0dcaf0' : '#dee2e6'}`,
                          borderRadius: '6px'
                        }}
                      >
                        <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '2px', color: '#2c3e50' }}>
                            📅 {new Date(dateTest.date).toLocaleDateString('fr-FR', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6c757d' }}>
                            {dateTest.description}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {estPasse && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#ffc107',
                              color: '#000',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              Passé
                            </span>
                          )}
                          {estProche && !estPasse && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#0dcaf0',
                              color: '#000',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              Proche
                            </span>
                          )}
                          <button
                            onClick={() => supprimerDateTest(index)}
                            disabled={loading}
                            style={{
                              padding: '6px 10px',
                              background: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              opacity: loading ? 0.6 : 1
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Sous-section: Notifications Défauts */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 25px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <ConfigurationEmailsBornesSeches tenantSlug={tenantSlug} />
        </div>

        {/* Sous-section: Formulaires d'Inspection Personnalisables */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 25px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋</span> Formulaires d'Inspection
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '15px', fontSize: '13px' }}>
            Créez et personnalisez les formulaires d'inspection pour les bornes sèches
          </p>
          <ParametresInspectionsBornesSeches tenantSlug={tenantSlug} />
        </div>
      </div>
      )}

      {/* ========== MODULE MATÉRIEL & ÉQUIPEMENTS ========== */}
      {selectedModule === 'equipements' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🔧</span>
            Matériel & Équipements
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des alertes et notifications pour les équipements
          </p>
        </div>
        
        {/* Sous-section: Notifications - Sans titre dupliqué */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <ConfigurationEmailsEquipements tenantSlug={tenantSlug} />
        </div>

        {/* Sous-section: Configuration des alertes */}
        <ParametresAlertesEquipements tenantSlug={tenantSlug} user={user} />

        {/* Sous-section: Gestion APRIA */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginTop: '15px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📝</span> Gestion APRIA
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Configurez les formulaires d'inspection et les personnes à contacter pour les APRIA
          </p>
          <ParametresInspectionsAPRIA tenantSlug={tenantSlug} />
        </div>

        {/* Sous-section: Import CSV */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginTop: '15px'
        }}>
          <ImportCSVEquipements 
            tenantSlug={tenantSlug} 
            onImportComplete={(results) => {
              console.log('Import terminé:', results);
            }}
          />
        </div>
      </div>
      )}

      {/* ========== MODULE GESTION EPI ========== */}
      {selectedModule === 'epi' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            Gestion EPI
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des alertes et notifications pour les équipements de protection
          </p>
        </div>

        {/* Sous-section: Configuration des Alertes */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔔</span> Configuration des Alertes EPI
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Définir les délais pour les alertes automatiques
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Alerte expiration pour admins/superviseurs */}
            <div style={{ 
              padding: 'clamp(10px, 2vw, 15px)',
              background: '#fff3cd',
              borderRadius: '8px',
              border: '1px solid #ffc107'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>👑</span>
                <Label style={{ fontSize: '14px', fontWeight: '600', color: '#856404', margin: 0 }}>
                  Alerte expiration EPI (Admins)
                </Label>
              </div>
              <p style={{ fontSize: '11px', color: '#856404', marginBottom: '10px' }}>
                Notification X jours avant l&apos;expiration d&apos;un EPI
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Input
                  type="number"
                  min="1"
                  max="180"
                  value={epiSettings.epi_jours_avance_expiration}
                  onChange={(e) => handleEpiSettingChange('epi_jours_avance_expiration', parseInt(e.target.value))}
                  style={{ 
                    width: '80px',
                    padding: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#856404' }}>
                  jours avant échéance
                </span>
              </div>
              <small style={{ fontSize: '10px', color: '#856404', display: 'block', marginTop: '8px', fontStyle: 'italic' }}>
                💡 Ex: 30 jours = notif le 1er mars pour expiration le 31 mars
              </small>
            </div>

            {/* Alerte inspection mensuelle pour tous les utilisateurs */}
            <div style={{ 
              padding: 'clamp(10px, 2vw, 15px)',
              background: '#d1ecf1',
              borderRadius: '8px',
              border: '1px solid #0dcaf0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>👥</span>
                <Label style={{ fontSize: '14px', fontWeight: '600', color: '#055160', margin: 0 }}>
                  Alerte inspection mensuelle (Tous)
                </Label>
              </div>
              <p style={{ fontSize: '11px', color: '#055160', marginBottom: '10px' }}>
                Tous les utilisateurs seront notifiés le X du mois s&apos;ils n&apos;ont pas effectué leur inspection mensuelle
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#055160' }}>
                  Le
                </span>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={epiSettings.epi_jour_alerte_inspection_mensuelle}
                  onChange={(e) => handleEpiSettingChange('epi_jour_alerte_inspection_mensuelle', parseInt(e.target.value))}
                  style={{ 
                    width: '70px',
                    padding: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#055160' }}>
                  de chaque mois
                </span>
              </div>
              <small style={{ fontSize: '10px', color: '#055160', display: 'block', marginTop: '8px', fontStyle: 'italic' }}>
                💡 Si non fait avant ce jour, notification envoyée
              </small>
            </div>
          </div>
        </div>

        {/* Sous-section: Notifications Destinataires */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 25px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <ConfigurationEmailsEPI tenantSlug={tenantSlug} />
        </div>
      </div>
      )}
    </div>
  );
};

// Modal d'import CSV pour inspections de bornes fontaines
const ImportCSVModal = ({ onClose, onSuccess, tenantSlug }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        alert('Veuillez sélectionner un fichier CSV');
        return;
      }
      setFile(selectedFile);
      
      // Prévisualiser les premières lignes
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').slice(0, 4); // Header + 3 premières lignes
        setPreviewData(lines.join('\n'));
      };
      reader.readAsText(selectedFile);
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert('Veuillez sélectionner un fichier');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/actifs/bornes/import-inspections`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de l\'import');
      }

      const result = await response.json();
      alert(`✅ Import réussi!\n\n${result.imported || 0} inspection(s) importée(s)\n${result.errors || 0} erreur(s)`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Erreur import:', error);
      alert(`❌ Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const template = `numero_borne,date_inspection,debit_gpm,etat,observations
BF-001,2024-01-15,1000,conforme,Borne en bon état
BF-002,2024-01-16,950,conforme,RAS
BF-003,2024-01-17,800,non_conforme,Débit faible`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_import_inspections.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '700px',
        width: '100%',
        padding: '30px',
        maxHeight: '90vh',
        overflow: 'auto'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '10px' }}>
          📥 Importer des Inspections (CSV)
        </h2>
        <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '14px' }}>
          Importez les données d'inspection des bornes fontaines réalisées par un service externe
        </p>

        {/* Instructions */}
        <div style={{ 
          background: '#e8f4f8', 
          padding: '15px', 
          borderRadius: '8px', 
          marginBottom: '20px',
          border: '1px solid #bee5eb'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px', color: '#0c5460' }}>
            📋 Format requis
          </h3>
          <p style={{ fontSize: '13px', color: '#0c5460', marginBottom: '10px' }}>
            Le fichier CSV doit contenir les colonnes suivantes:
          </p>
          <ul style={{ fontSize: '13px', color: '#0c5460', paddingLeft: '20px' }}>
            <li><strong>numero_borne</strong> - Numéro d'identification de la borne</li>
            <li><strong>date_inspection</strong> - Date au format YYYY-MM-DD</li>
            <li><strong>debit_gpm</strong> - Débit mesuré en GPM</li>
            <li><strong>etat</strong> - conforme, non_conforme ou defectueux</li>
            <li><strong>observations</strong> - Notes additionnelles (optionnel)</li>
          </ul>
        </div>

        {/* Bouton télécharger template */}
        <button
          onClick={downloadTemplate}
          style={{
            width: '100%',
            padding: '12px',
            background: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '20px'
          }}
        >
          📄 Télécharger le modèle CSV
        </button>

        {/* Sélection de fichier */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '10px', 
            fontSize: '14px', 
            fontWeight: '600',
            color: '#555'
          }}>
            Fichier CSV *
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{
              width: '100%',
              padding: '10px',
              border: '2px dashed #ced4da',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          />
        </div>

        {/* Prévisualisation */}
        {previewData && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              marginBottom: '10px', 
              fontSize: '14px', 
              fontWeight: '600',
              color: '#555'
            }}>
              Prévisualisation
            </label>
            <pre style={{
              background: '#f8f9fa',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '12px',
              overflowX: 'auto',
              border: '1px solid #dee2e6'
            }}>
              {previewData}
            </pre>
          </div>
        )}

        {/* Boutons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px' }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '12px 24px',
              background: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !file}
            style={{
              padding: '12px 24px',
              background: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: loading || !file ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              opacity: loading || !file ? 0.6 : 1
            }}
          >
            {loading ? 'Import en cours...' : 'Importer'}
          </button>
        </div>
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

  const handleBackdropClick = (e) => {
    // Cliquer sur le backdrop (fond) soumet le formulaire
    if (e.target === e.currentTarget) {
      // Créer un événement de soumission factice
      const fakeEvent = { preventDefault: () => {} };
      onSubmit(fakeEvent);
    }
  };

  return (
    <div 
      onClick={handleBackdropClick}
      style={{
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
      }}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '30px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto'
        }}
      >
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
        { value: 'fontaine', label: 'Borne fontaine' },
        { value: 'point_eau_statique', label: 'Point d\'eau statique' }
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


// ==================== PARAMÈTRES ALERTES ÉQUIPEMENTS ====================
const ParametresAlertesEquipements = ({ tenantSlug, user }) => {
  const [parametres, setParametres] = useState({
    jours_alerte_maintenance: 30,
    jours_alerte_expiration: 30,
    jours_alerte_fin_vie: 90,
    activer_alertes_email: true,
    activer_alertes_dashboard: true
  });
  const [alertes, setAlertes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadParametres();
    loadAlertes();
    // eslint-disable-next-line
  }, [tenantSlug]);

  const loadParametres = async () => {
    try {
      const data = await apiGet(tenantSlug, '/equipements/parametres');
      setParametres({
        jours_alerte_maintenance: data.jours_alerte_maintenance || 30,
        jours_alerte_expiration: data.jours_alerte_expiration || 30,
        jours_alerte_fin_vie: data.jours_alerte_fin_vie || 90,
        activer_alertes_email: data.activer_alertes_email !== false,
        activer_alertes_dashboard: data.activer_alertes_dashboard !== false
      });
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAlertes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/equipements/alertes');
      setAlertes(data);
    } catch (error) {
      console.error('Erreur chargement alertes:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiPut(tenantSlug, '/equipements/parametres', parametres);
      alert('✅ Paramètres sauvegardés avec succès');
      loadAlertes(); // Recharger les alertes avec les nouveaux paramètres
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('❌ Erreur: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculer = async () => {
    try {
      setSaving(true);
      await apiPost(tenantSlug, '/equipements/alertes/recalculer');
      await loadAlertes();
      alert('✅ Alertes recalculées avec succès');
    } catch (error) {
      console.error('Erreur recalcul:', error);
      alert('❌ Erreur: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '1rem', color: '#6b7280' }}>Chargement...</div>;
  }

  return (
    <div style={{ 
      background: 'white', 
      padding: '20px', 
      borderRadius: '10px', 
      boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
      border: '1px solid #e0e0e0'
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🔔</span> Configuration des Alertes
      </h3>
      <p style={{ color: '#7f8c8d', marginBottom: '20px', fontSize: '13px' }}>
        Définissez les délais d'alerte pour les maintenances et expirations
      </p>

      {/* Résumé des alertes actives */}
      {alertes && alertes.totaux && (
        <div style={{
          background: alertes.totaux.total > 0 ? '#fef3c7' : '#d1fae5',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: alertes.totaux.total > 0 ? '1px solid #fbbf24' : '1px solid #10b981'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px' }}>{alertes.totaux.total > 0 ? '⚠️' : '✅'}</span>
            <span style={{ fontWeight: '600', color: alertes.totaux.total > 0 ? '#92400e' : '#065f46' }}>
              {alertes.totaux.total > 0 
                ? `${alertes.totaux.total} alerte(s) active(s)`
                : 'Aucune alerte active'
              }
            </span>
          </div>
          {alertes.totaux.total > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {alertes.totaux.maintenance > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#fbbf24', color: '#78350f', borderRadius: '9999px', fontSize: '12px' }}>
                  🔧 {alertes.totaux.maintenance} maintenance(s)
                </span>
              )}
              {alertes.totaux.expiration > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#ef4444', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  📅 {alertes.totaux.expiration} expiration(s)
                </span>
              )}
              {alertes.totaux.fin_vie > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#dc2626', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  ⏰ {alertes.totaux.fin_vie} fin(s) de vie
                </span>
              )}
              {alertes.totaux.reparation > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#f97316', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  🔧 {alertes.totaux.reparation} réparation(s)
                </span>
              )}
              {alertes.totaux.stock_bas > 0 && (
                <span style={{ padding: '0.25rem 0.75rem', background: '#8b5cf6', color: 'white', borderRadius: '9999px', fontSize: '12px' }}>
                  📦 {alertes.totaux.stock_bas} stock bas
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Paramètres des délais - Responsive */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            🔧 Alerte maintenance
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_maintenance}
              onChange={(e) => setParametres({...parametres, jours_alerte_maintenance: parseInt(e.target.value) || 30})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            📅 Alerte expiration
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_expiration}
              onChange={(e) => setParametres({...parametres, jours_alerte_expiration: parseInt(e.target.value) || 30})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '6px',
          padding: '10px',
          background: '#f9fafb',
          borderRadius: '8px'
        }}>
          <Label style={{ fontSize: '13px', fontWeight: '600', color: '#374151' }}>
            ⏰ Alerte fin de vie
          </Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Input
              type="number"
              min="1"
              max="365"
              value={parametres.jours_alerte_fin_vie}
              onChange={(e) => setParametres({...parametres, jours_alerte_fin_vie: parseInt(e.target.value) || 90})}
              style={{ width: '70px', padding: '6px 8px', fontSize: '14px' }}
            />
            <span style={{ fontSize: '12px', color: '#6b7280' }}>jours avant</span>
          </div>
        </div>
      </div>

      {/* Options d'activation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={parametres.activer_alertes_email}
            onChange={(e) => setParametres({...parametres, activer_alertes_email: e.target.checked})}
          />
          <span style={{ fontSize: '14px' }}>📧 Activer les alertes par email</span>
        </label>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={parametres.activer_alertes_dashboard}
            onChange={(e) => setParametres({...parametres, activer_alertes_dashboard: e.target.checked})}
          />
          <span style={{ fontSize: '14px' }}>📊 Afficher les alertes sur le tableau de bord</span>
        </label>
      </div>

      {/* Boutons d'action */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            opacity: saving ? 0.6 : 1
          }}
        >
          {saving ? 'Enregistrement...' : '💾 Enregistrer'}
        </button>
        
        {user?.role === 'admin' && (
          <button
            onClick={handleRecalculer}
            disabled={saving}
            style={{
              padding: '12px 20px',
              background: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              opacity: saving ? 0.6 : 1
            }}
          >
            🔄 Recalculer
          </button>
        )}
      </div>
    </div>
  );
};


export default GestionActifs;
