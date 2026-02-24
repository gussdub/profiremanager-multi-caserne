import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import InventairesTab from './GestionInventaires';
import RondeSecurite from './RondeSecurite';
import HistoriqueRondesSecurite from './HistoriqueRondesSecurite';
import ContreSignatureModal from './ContreSignatureModal';
import CarteApprovisionnementEau from './CarteApprovisionnementEau';
import InspectionsBornesSeches from './InspectionsBornesSeches';
import InspectionBorneSecheModal from './InspectionBorneSecheModal';
import InventaireVehiculeModal from './InventaireVehiculeModal';
import HistoriqueInventairesVehicule from './HistoriqueInventairesVehicule';
import MaterielEquipementsModule from './MaterielEquipementsModule';
import ReparationsVehicule from './ReparationsVehicule';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { TabButton, MobileTabButton, VehiculesTab } from './actifs/ActifsTabComponents';
import ActifsModalsContainer from './actifs/ActifsModalsContainer';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { useWebSocketUpdate } from '../hooks/useWebSocketUpdate';

// Lazy load extracted components
const ParametresActifsTab = lazy(() => import('./ParametresActifs'));

const LoadingSpinner = () => (
  <div style={{ textAlign: 'center', padding: '40px' }}>
    <p>Chargement...</p>
  </div>
);

const GestionActifs = ({ user, ModuleEPI }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    // Vérifier d'abord le paramètre URL ?tab=xxx
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab) {
      return urlTab;
    }
    // Puis vérifier localStorage
    const targetTab = localStorage.getItem('actifs_target_tab');
    if (targetTab) {
      localStorage.removeItem('actifs_target_tab');
      return targetTab;
    }
    return 'vehicules';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [vehicules, setVehicules] = useState([]);
  const [bornes, setBornes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});

  const isAdmin = user?.role === 'admin';
  const isSuperviseur = user?.role === 'superviseur';
  const canManageActifs = isAdmin || isSuperviseur;

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
  const [bornesSeches, setBornesSeches] = useState([]);
  const [showBorneSecheModal, setShowBorneSecheModal] = useState(false);
  const [showInspectionBorneSecheModal, setShowInspectionBorneSecheModal] = useState(false);
  const [selectedBorneSeche, setSelectedBorneSeche] = useState(null);
  const [eauSubTab, setEauSubTab] = useState('carte');
  const [showInventaireModal, setShowInventaireModal] = useState(false);
  const [selectedVehiculeForInventaire, setSelectedVehiculeForInventaire] = useState(null);
  const [showHistoriqueInventairesModal, setShowHistoriqueInventairesModal] = useState(false);
  const [showReparationsModal, setShowReparationsModal] = useState(false);
  const [selectedVehiculeForReparations, setSelectedVehiculeForReparations] = useState(null);

  const { tenantSlug } = useTenant();
  const { confirm } = useConfirmDialog();
  const { toast } = useToast();
  
  // Ref pour éviter de traiter qr_action plusieurs fois
  const qrActionProcessedRef = useRef(false);

  useEffect(() => {
    if (activeTab === 'vehicules') {
      fetchVehicules();
    }
  }, [activeTab]);

  // WebSocket pour mise à jour temps réel des actifs
  useWebSocketUpdate('actif_update', (data) => {
    console.log('[GestionActifs] WebSocket: actif_update reçu', data);
    toast({
      title: "🚗 Mise à jour Actifs",
      description: "Les données des actifs ont été mises à jour.",
    });
    if (activeTab === 'vehicules') {
      fetchVehicules();
    }
  }, [activeTab, tenantSlug]);

  // Écouter les changements de tab via localStorage (navigation depuis Dashboard)
  useEffect(() => {
    const checkTargetTab = () => {
      const targetTab = localStorage.getItem('actifs_target_tab');
      if (targetTab) {
        localStorage.removeItem('actifs_target_tab');
        setActiveTab(targetTab);
      }
    };
    
    // Vérifier au montage et à chaque focus de la fenêtre
    checkTargetTab();
    window.addEventListener('focus', checkTargetTab);
    return () => window.removeEventListener('focus', checkTargetTab);
  }, []);

  // Traitement du QR code action - s'exécute une seule fois au montage
  useEffect(() => {
    // Vérifier immédiatement s'il y a une action QR à traiter
    const qrActionData = localStorage.getItem('qr_action');
    
    if (!qrActionData || qrActionProcessedRef.current) {
      return;
    }
    
    console.log('🔍 GestionActifs - QR Action détectée au montage:', qrActionData);
    
    try {
      const qrAction = JSON.parse(qrActionData);
      console.log('✅ GestionActifs - QR Action parsée:', qrAction);
      
      // Marquer comme traité IMMÉDIATEMENT pour éviter les doublons
      qrActionProcessedRef.current = true;
      localStorage.removeItem('qr_action');
      
      // Utiliser directement le véhicule stocké dans qr_action (il contient toutes les infos)
      const vehicule = qrAction.vehicule ? { ...qrAction.vehicule, id: qrAction.vehicule_id } : null;
      
      if (!vehicule) {
        console.warn('⚠️ Pas de véhicule dans qr_action');
        return;
      }
      
      // Petit délai pour s'assurer que le composant est bien monté
      setTimeout(() => {
        if (qrAction.action === 'ronde_securite') {
          console.log('🚀 GestionActifs - Ouverture modal Ronde pour:', vehicule.nom);
          setSelectedVehiculeForRonde(vehicule);
          setShowRondeSecuriteModal(true);
        } else if (qrAction.action === 'inventaire') {
          console.log('🚀 GestionActifs - Ouverture modal Inventaire pour:', vehicule.nom);
          setSelectedVehiculeForInventaire(vehicule);
          setShowInventaireModal(true);
        }
      }, 100);
      
    } catch (e) {
      console.error('❌ Erreur parsing QR action:', e);
      localStorage.removeItem('qr_action');
    }
  }, []); // Exécution une seule fois au montage

  useEffect(() => {
    const handleNavigateToTab = (event) => {
      const { tab } = event.detail || {};
      if (tab) {
        const tabMapping = {
          'vehicules': 'vehicules',
          'bornes': 'bornes',
          'eau': 'eau',
          'epi': 'epi',
          'materiel': 'materiel',
          'parametres': 'parametres',
          'equipements': 'materiel',
          'inventaires': 'inventaires'
        };
        const targetTab = tabMapping[tab.toLowerCase()] || tab;
        setActiveTab(targetTab);
      }
    };
    window.addEventListener('navigateToTab', handleNavigateToTab);
    return () => window.removeEventListener('navigateToTab', handleNavigateToTab);
  }, []);

  // ===== FETCH FUNCTIONS =====
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

  // ===== HANDLERS =====
  const openCreateModal = () => {
    setModalMode('create');
    setSelectedItem(null);
    setFormData(activeTab === 'vehicules' ? {
      nom: '', type_vehicule: 'Autopompe', marque: '', modele: '', annee: '', vin: '', statut: 'actif', notes: ''
    } : {
      nom: '', type_borne: 'seche', adresse: '', municipalite: '', statut: 'operationnelle', notes_importantes: ''
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
      const preparedData = { ...formData };
      if (activeTab === 'vehicules') {
        if (preparedData.annee && preparedData.annee !== '') {
          const parsedAnnee = parseInt(preparedData.annee, 10);
          if (!isNaN(parsedAnnee)) preparedData.annee = parsedAnnee;
          else delete preparedData.annee;
        } else delete preparedData.annee;
        if (preparedData.kilometrage && preparedData.kilometrage !== '') {
          const parsedKm = parseFloat(preparedData.kilometrage);
          if (!isNaN(parsedKm)) preparedData.kilometrage = parsedKm;
          else delete preparedData.kilometrage;
        } else delete preparedData.kilometrage;
      }
      if (modalMode === 'create') {
        await apiPost(tenantSlug, `/actifs/${activeTab}`, preparedData);
        alert('✅ Créé avec succès!');
      } else {
        await apiPut(tenantSlug, `/actifs/${activeTab}/${selectedItem.id}`, preparedData);
        alert('✅ Mis à jour avec succès!');
      }
      setShowModal(false);
      if (activeTab === 'vehicules') fetchVehicules();
      else fetchBornes();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ Erreur lors de la sauvegarde: ' + errorMessage);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Supprimer cet élément',
      message: 'Êtes-vous sûr de vouloir supprimer cet élément ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    try {
      await apiDelete(tenantSlug, `/actifs/${activeTab}/${id}`);
      if (activeTab === 'vehicules') fetchVehicules();
      else fetchBornes();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const handleGenerateQR = async (item) => {
    try {
      const type = activeTab === 'vehicules' ? 'vehicules' : 'bornes';
      const data = await apiPost(tenantSlug, `/actifs/${type}/${item.id}/qr-code`, {});
      setQRCodeData({ qr_code: data.qr_code, qr_code_url: data.qr_code_url, item_name: item.nom });
      setShowQRModal(true);
      if (activeTab === 'vehicules') fetchVehicules();
      else fetchBornes();
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

  const handleRefuserRonde = () => {
    setShowContreSignatureModal(false);
    setShowRondeSecuriteModal(true);
  };

  const handleCreateInventaire = (vehicle) => {
    setSelectedVehiculeForInventaire(vehicle);
    setShowInventaireModal(true);
  };

  const handleViewHistoriqueInventaires = (vehicle) => {
    setSelectedItem(vehicle);
    setShowHistoriqueInventairesModal(true);
  };

  // Context for modals
  const modalsContext = {
    showModal, modalMode, activeTab, formData, setFormData, handleSubmit,
    setShowModal, showQRModal, qrCodeData, setShowQRModal,
    showFicheVieModal, ficheVieData, setShowFicheVieModal,
    showInspectionModal, selectedItem, inspectionHistory, setShowInspectionModal,
    showRondeSecuriteModal, selectedVehiculeForRonde, setShowRondeSecuriteModal,
    setSelectedVehiculeForRonde, fetchVehicules,
    showHistoriqueRondesModal, setShowHistoriqueRondesModal, setSelectedItem,
    handleContreSignerClick,
    showContreSignatureModal, selectedRondeForCounterSign, setShowContreSignatureModal,
    setSelectedRondeForCounterSign, handleRefuserRonde, user,
    showImportCSVModal, setShowImportCSVModal, fetchBornes, tenantSlug,
    showBorneSecheModal, selectedBorneSeche, setShowBorneSecheModal,
    setSelectedBorneSeche, fetchBornesSeches,
    showInspectionBorneSecheModal, setShowInspectionBorneSecheModal,
    showInventaireModal, selectedVehiculeForInventaire, setShowInventaireModal,
    setSelectedVehiculeForInventaire,
    showHistoriqueInventairesModal, setShowHistoriqueInventairesModal,
    showReparationsModal, selectedVehiculeForReparations, setShowReparationsModal,
    setSelectedVehiculeForReparations
  };

  // Tab definitions
  const allTabs = [
    { id: 'vehicules', label: '🚗 Véhicules', alwaysVisible: true },
    { id: 'eau', label: '💧 Approvisionnement en Eau', alwaysVisible: true },
    { id: 'materiel', label: '🔧 Matériel & Équipements', alwaysVisible: true },
    { id: 'epi', label: '🛡️ Gestion EPI', alwaysVisible: false },
    { id: 'parametres', label: '⚙️ Paramètres', alwaysVisible: false },
  ];

  const visibleTabs = allTabs.filter(t => t.alwaysVisible || canManageActifs);

  return (
    <div className="gestion-actifs" style={{ padding: '12px', position: 'relative', zIndex: 1, isolation: 'isolate' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>🚒 Gestion des Actifs</h1>
        {activeTab === 'vehicules' && !['employe', 'pompier'].includes(user?.role) && (
          <button onClick={openCreateModal} style={{
            padding: '8px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none',
            borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap'
          }}>
            + Véhicule
          </button>
        )}
      </div>

      {/* Mobile Menu - Grid Cards */}
      <div className="mobile-menu-grid" style={{ display: 'none' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {visibleTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '16px 12px',
              backgroundColor: activeTab === tab.id ? '#fef2f2' : 'white',
              border: activeTab === tab.id ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
            }}>
              <span style={{ fontSize: '1.75rem' }}>{tab.label.split(' ')[0]}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: activeTab === tab.id ? '#dc2626' : '#374151' }}>{tab.label.substring(tab.label.indexOf(' ') + 1)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile dropdown toggle */}
      <div className="mobile-tab-toggle-old" style={{ display: 'none', position: 'relative', marginBottom: '16px' }}>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{
          width: '100%', padding: '14px 16px', backgroundColor: '#f8f9fa', border: '2px solid #e0e0e0',
          borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '600', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span>{visibleTabs.find(t => t.id === activeTab)?.label || activeTab}</span>
          <span style={{ transform: mobileMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {mobileMenuOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100000, marginTop: '4px', overflow: 'hidden'
          }}>
            {visibleTabs.map(tab => (
              <MobileTabButton key={tab.id} label={tab.label} active={activeTab === tab.id}
                onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop Tabs */}
      <div className="desktop-tabs flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap" style={{ 
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none'
      }}>
        {visibleTabs.map(tab => (
          <TabButton key={tab.id} label={tab.label} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />
        ))}
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-grid { display: block !important; }
          .mobile-tab-toggle-old { display: none !important; }
          .desktop-tabs { display: none !important; }
          .gestion-actifs { padding: 10px !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-grid { display: none !important; }
        }
        .desktop-tabs::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}><p>Chargement...</p></div>
      ) : (
        <div>
          {activeTab === 'vehicules' ? (
            <VehiculesTab 
              vehicules={vehicules} onEdit={openEditModal} onDelete={handleDelete}
              onGenerateQR={handleGenerateQR} onViewFicheVie={handleViewFicheVie}
              onViewInspections={handleViewInspections} onCreateInspection={handleCreateInspection}
              onCreateInventaire={handleCreateInventaire}
              onViewHistoriqueInventaires={handleViewHistoriqueInventaires}
              onViewReparations={(v) => { setSelectedVehiculeForReparations(v); setShowReparationsModal(true); }}
              canManageActifs={canManageActifs}
            />
          ) : activeTab === 'eau' ? (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid #e0e0e0', paddingBottom: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => setEauSubTab('carte')} style={{
                  padding: '8px 14px', background: eauSubTab === 'carte' ? '#3498db' : 'transparent',
                  color: eauSubTab === 'carte' ? 'white' : '#555', border: 'none', borderRadius: '8px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: 'all 0.2s', flex: '1 1 auto', minWidth: '140px'
                }}>
                  🗺️ Carte Points d&apos;Eau
                </button>
                <button onClick={() => setEauSubTab('inspections')} style={{
                  padding: '8px 14px', background: eauSubTab === 'inspections' ? '#e74c3c' : 'transparent',
                  color: eauSubTab === 'inspections' ? 'white' : '#555', border: 'none', borderRadius: '8px',
                  cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: 'all 0.2s', flex: '1 1 auto', minWidth: '140px'
                }}>
                  📋 Inspections
                </button>
              </div>
              {eauSubTab === 'carte' ? <CarteApprovisionnementEau user={user} /> : <InspectionsBornesSeches user={user} />}
            </div>
          ) : activeTab === 'epi' ? (
            ModuleEPI ? <ModuleEPI user={user} /> : <div>Module EPI non disponible</div>
          ) : activeTab === 'parametres' ? (
            <Suspense fallback={<LoadingSpinner />}>
              <ParametresActifsTab tenantSlug={tenantSlug} user={user} />
            </Suspense>
          ) : activeTab === 'materiel' ? (
            <MaterielEquipementsModule user={user} />
          ) : (
            <InventairesTab tenantSlug={tenantSlug} />
          )}
        </div>
      )}

      {/* Modals */}
      <ActifsModalsContainer context={modalsContext} />
    </div>
  );
};

export default GestionActifs;
