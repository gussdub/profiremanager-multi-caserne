import React, { Suspense, lazy } from 'react';
import RondeSecurite from '../RondeSecurite';
import HistoriqueRondesSecurite from '../HistoriqueRondesSecurite';
import ContreSignatureModal from '../ContreSignatureModal';
import InspectionBorneSecheModal from '../InspectionBorneSecheModal';
import InventaireVehiculeModal from '../InventaireVehiculeModal';
import HistoriqueInventairesVehicule from '../HistoriqueInventairesVehicule';
import ReparationsVehicule from '../ReparationsVehicule';

const Modal = lazy(() => import('../ActifsModals').then(m => ({ default: m.Modal })));
const QRCodeModal = lazy(() => import('../ActifsModals').then(m => ({ default: m.QRCodeModal })));
const FicheVieModal = lazy(() => import('../ActifsModals').then(m => ({ default: m.FicheVieModal })));
const InspectionHistoryModal = lazy(() => import('../ActifsModals').then(m => ({ default: m.InspectionHistoryModal })));
const ImportCSVModal = lazy(() => import('../ImportCSVActifs'));
const BorneSecheModal = lazy(() => import('../BornesSeches').then(m => ({ default: m.BorneSecheModal })));

const LoadingSpinner = () => (
  <div style={{ textAlign: 'center', padding: '40px' }}>
    <p>Chargement...</p>
  </div>
);

const ActifsModalsContainer = ({ context }) => {
  const {
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
  } = context;

  return (
    <Suspense fallback={<LoadingSpinner />}>
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
          onSuccess={() => fetchVehicules()}
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
          onSuccess={() => fetchVehicules()}
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

      {showReparationsModal && selectedVehiculeForReparations && (
        <ReparationsVehicule
          vehicule={selectedVehiculeForReparations}
          tenant={tenantSlug}
          onClose={() => {
            setShowReparationsModal(false);
            setSelectedVehiculeForReparations(null);
          }}
          onUpdate={() => fetchVehicules()}
        />
      )}
    </Suspense>
  );
};

export default ActifsModalsContainer;
