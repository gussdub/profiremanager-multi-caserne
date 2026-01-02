import React, { useState, useEffect, Suspense, lazy } from 'react';
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
import InspectionBorneSecheModal from './InspectionBorneSecheModal';
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
import { Button } from './ui/button';

// Lazy load extracted components
const BornesSechesTab = lazy(() => import('./BornesSeches').then(m => ({ default: m.BornesSechesTab })));
const BorneSecheModal = lazy(() => import('./BornesSeches').then(m => ({ default: m.BorneSecheModal })));
const ParametresActifsTab = lazy(() => import('./ParametresActifs'));
const ImportCSVModal = lazy(() => import('./ImportCSVActifs'));
const ParametresAlertesEquipements = lazy(() => import('./ParametresAlertesEquipements'));
const Modal = lazy(() => import('./ActifsModals').then(m => ({ default: m.Modal })));
const VehiculeForm = lazy(() => import('./ActifsModals').then(m => ({ default: m.VehiculeForm })));
const BorneForm = lazy(() => import('./ActifsModals').then(m => ({ default: m.BorneForm })));
const QRCodeModal = lazy(() => import('./ActifsModals').then(m => ({ default: m.QRCodeModal })));
const FicheVieModal = lazy(() => import('./ActifsModals').then(m => ({ default: m.FicheVieModal })));
const InspectionHistoryModal = lazy(() => import('./ActifsModals').then(m => ({ default: m.InspectionHistoryModal })));

// Loading component
const LoadingSpinner = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
    <div className="loading-spinner"></div>
  </div>
);

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
  
  // Permissions basées sur le rôle de l'utilisateur
  const isAdmin = user?.role === 'admin';
  const isSuperviseur = user?.role === 'superviseur';
  const canManageActifs = isAdmin || isSuperviseur; // Peut modifier, supprimer, créer, voir fiche de vie, etc.
  
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
    <div className="gestion-actifs" style={{ padding: '20px', position: 'relative', zIndex: 1, isolation: 'isolate' }}>
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
            zIndex: 1050,
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
            {canManageActifs && (
              <MobileTabButton
                label="🛡️ Gestion EPI"
                active={activeTab === 'epi'}
                onClick={() => { setActiveTab('epi'); setMobileMenuOpen(false); }}
              />
            )}
            {canManageActifs && (
              <MobileTabButton
                label="⚙️ Paramètres"
                active={activeTab === 'parametres'}
                onClick={() => { setActiveTab('parametres'); setMobileMenuOpen(false); }}
              />
            )}
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
        {canManageActifs && (
          <TabButton
            label="🛡️ Gestion EPI"
            active={activeTab === 'epi'}
            onClick={() => setActiveTab('epi')}
          />
        )}
        {canManageActifs && (
          <TabButton
            label="⚙️ Paramètres"
            active={activeTab === 'parametres'}
            onClick={() => setActiveTab('parametres')}
          />
        )}
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
              canManageActifs={canManageActifs}
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

const VehiculesTab = ({ vehicules, onEdit, onDelete, onGenerateQR, onViewFicheVie, onViewInspections, onCreateInspection, onCreateInventaire, onViewHistoriqueInventaires, canManageActifs }) => {
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
          canManageActifs={canManageActifs}
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






export default GestionActifs;
