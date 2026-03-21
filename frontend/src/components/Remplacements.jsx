import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet } from '../utils/api';
import usePermissions from '../hooks/usePermissions';

// Hooks personnalisés extraits
import useRemplacementsData from '../hooks/useRemplacementsData';
import useRemplacementsHandlers from '../hooks/useRemplacementsHandlers';
import useRemplacementsFilters from '../hooks/useRemplacementsFilters';

// Sous-composants
import KPICards from './remplacements/KPICards';
import TabsBar from './remplacements/TabsBar';
import PropositionsRecues from './remplacements/PropositionsRecues';
import RemplacementsList from './remplacements/RemplacementsList';
import CongesList from './remplacements/CongesList';
import CreateRemplacementModal from './remplacements/CreateRemplacementModal';
import CreateCongeModal from './remplacements/CreateCongeModal';
import ImpactPlanningModal from './remplacements/ImpactPlanningModal';
import SuiviRemplacementModal from './SuiviRemplacementModal';
import FilterBar from './remplacements/FilterBar';
import { ActionButtons, ExportButtons } from './remplacements/ActionButtons';

// Constantes
const TYPES_CONGE = [
  { value: 'maladie', label: '🏥 Maladie', description: 'Arrêt maladie avec justificatif' },
  { value: 'vacances', label: '🏖️ Vacances', description: 'Congés payés annuels' },
  { value: 'parental', label: '👶 Parental', description: 'Congé maternité/paternité' },
  { value: 'personnel', label: '👤 Personnel', description: 'Congé exceptionnel sans solde' }
];

const NIVEAUX_PRIORITE = [
  { value: 'urgente', label: '🚨 Urgente', color: '#EF4444', description: 'Traitement immédiat requis' },
  { value: 'haute', label: '🔥 Haute', color: '#F59E0B', description: 'Traitement prioritaire dans 24h' },
  { value: 'normale', label: '📋 Normale', color: '#3B82F6', description: 'Traitement dans délai standard' },
  { value: 'faible', label: '📝 Faible', color: '#6B7280', description: 'Traitement différé possible' }
];

// Helpers
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getLocalDateString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getStatutColor = (statut) => {
  const colors = {
    'en_cours': '#F59E0B', 'en_attente': '#F59E0B',
    'approuve': '#10B981', 'accepte': '#10B981', 'approuve_manuellement': '#10B981',
    'refuse': '#EF4444', 'refusee': '#EF4444', 'annulee': '#EF4444',
    'expiree': '#9CA3AF'
  };
  return colors[statut] || '#6B7280';
};

const getStatutLabel = (statut) => {
  const labels = {
    'en_cours': 'En cours', 'en_attente': 'En attente',
    'approuve': 'Acceptée', 'accepte': 'Acceptée', 'approuve_manuellement': 'Approuvée manuellement',
    'refuse': 'Refusée', 'refusee': 'Refusée', 'annulee': 'Annulée', 'expiree': 'Expirée'
  };
  return labels[statut] || statut;
};

const getPrioriteColor = (priorite) => {
  const prioriteObj = NIVEAUX_PRIORITE.find(p => p.value === priorite);
  return prioriteObj ? prioriteObj.color : '#6B7280';
};

const Remplacements = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  // Hook RBAC pour les permissions
  const { hasModuleAction } = usePermissions(tenantSlug, user);
  const permissions = {
    canCreateRemplacement: hasModuleAction('remplacements', 'creer'),
    canEditRemplacement: hasModuleAction('remplacements', 'modifier'),
    canDeleteRemplacement: hasModuleAction('remplacements', 'supprimer'),
    canApproveRemplacement: hasModuleAction('remplacements', 'approuver'),
    // Permission pour créer des demandes pour d'autres employés
    canCreateForOthers: hasModuleAction('remplacements', 'modifier')
  };

  // Hooks personnalisés
  const {
    demandes, demandesConge, users, typesGarde, loading, propositionsRecues,
    refetch, getTypeGardeName, getUserName
  } = useRemplacementsData(tenantSlug, user, toast);

  const handlers = useRemplacementsHandlers(tenantSlug, toast, refetch, permissions);

  const filters = useRemplacementsFilters();

  // États locaux pour les modals et formulaires
  const [activeTab, setActiveTab] = useState('remplacements');
  const [showCreateRemplacementModal, setShowCreateRemplacementModal] = useState(false);
  const [showCreateCongeModal, setShowCreateCongeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [selectedDemandeForSuivi, setSelectedDemandeForSuivi] = useState(null);
  const [exportType, setExportType] = useState('');
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactData, setImpactData] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  const [newDemande, setNewDemande] = useState({
    type_garde_id: '', date: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null
  });
  const [newConge, setNewConge] = useState({
    type_conge: '', date_debut: getLocalDateString(), date_fin: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null
  });

  // Événements de navigation (depuis notifications)
  useEffect(() => {
    const handleOpenDemandeConge = async (event) => {
      const { demandeId } = event.detail || {};
      if (demandeId) {
        setActiveTab('conges');
        if (demandesConge.length === 0) {
          try {
            const data = await apiGet(tenantSlug, '/demandes-conges');
            // Les données seront rechargées via refetch
          } catch (error) {
            console.error('Erreur chargement congés:', error);
          }
        }
      }
    };

    const handleOpenDemandeRemplacement = async (event) => {
      const { demandeId } = event.detail || {};
      if (demandeId) {
        setActiveTab('remplacements');
        if (demandes.length === 0) {
          try {
            const data = await apiGet(tenantSlug, '/demandes-remplacement');
            // Les données seront rechargées via refetch
          } catch (error) {
            console.error('Erreur chargement remplacements:', error);
          }
        }
      }
    };

    window.addEventListener('openDemandeConge', handleOpenDemandeConge);
    window.addEventListener('openDemandeRemplacementQuart', handleOpenDemandeRemplacement);
    
    return () => {
      window.removeEventListener('openDemandeConge', handleOpenDemandeConge);
      window.removeEventListener('openDemandeRemplacementQuart', handleOpenDemandeRemplacement);
    };
  }, [tenantSlug, demandesConge.length, demandes.length]);

  // Basculer vers l'onglet propositions s'il y en a
  useEffect(() => {
    if (propositionsRecues.length > 0 && activeTab === 'remplacements') {
      setActiveTab('propositions');
    }
  }, [propositionsRecues, activeTab]);

  // Calculs dérivés
  const canViewAllDemandes = hasModuleAction('remplacements', 'voir_tous') || user?.role === 'admin';
  const isAdminOrSuperviseur = !['employe', 'pompier'].includes(user?.role);

  const mesDemandes = canViewAllDemandes ? demandes : demandes.filter(d => d.demandeur_id === user.id);
  const mesConges = canViewAllDemandes ? demandesConge : demandesConge.filter(c => c.demandeur_id === user.id);

  // KPIs
  const totalDemandes = mesDemandes.length;
  const enAttente = mesDemandes.filter(d => ['en_cours', 'en_attente'].includes(d.statut)).length;
  const acceptees = mesDemandes.filter(d => ['approuve', 'accepte', 'approuve_manuellement'].includes(d.statut)).length;
  const refusees = mesDemandes.filter(d => ['refuse', 'refusee', 'annulee', 'expiree'].includes(d.statut)).length;
  const remplacementsTrouves = mesDemandes.filter(d => ['approuve', 'accepte', 'approuve_manuellement'].includes(d.statut) && d.remplacant_id).length;
  const tauxSucces = totalDemandes > 0 ? Math.round((remplacementsTrouves / totalDemandes) * 100) : 0;
  const congesDuMois = mesConges.length;

  // Filtrage
  const filteredDemandes = filters.createFilteredDemandes(mesDemandes);
  const filteredConges = filters.createFilteredConges(mesConges);

  // Handlers de création
  const onCreateRemplacement = async () => {
    const success = await handlers.handleCreateRemplacement(newDemande, () => {
      setShowCreateRemplacementModal(false);
      setNewDemande({ type_garde_id: '', date: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null });
    });
  };

  const onCreateConge = async () => {
    const success = await handlers.handleCreateConge(newConge, () => {
      setShowCreateCongeModal(false);
      setNewConge({ type_conge: '', date_debut: getLocalDateString(), date_fin: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null });
    });
  };

  // Handler pour l'export
  const handleExport = async (type) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      const endpoint = type === 'pdf' ? 'export-pdf' : 'export-excel';
      const url = `${backendUrl}/api/${tenantSlug}/remplacements/${endpoint}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      
      if (type === 'pdf') {
        const pdfUrl = window.URL.createObjectURL(blob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = pdfUrl;
        document.body.appendChild(iframe);
        iframe.onload = function() {
          iframe.contentWindow.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            window.URL.revokeObjectURL(pdfUrl);
          }, 100);
        };
      } else {
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `remplacements_tous.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      }
      
      toast({ title: "Succès", description: `Export ${type.toUpperCase()} téléchargé` });
      setShowExportModal(false);
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exporter", variant: "destructive" });
    }
  };

  // Handler pour congés urgents
  const handleFilterUrgentConges = () => {
    const congesUrgents = demandesConge.filter(d => d.priorite === 'urgente' && d.statut === 'en_attente');
    toast({
      title: congesUrgents.length > 0 ? "Congés urgents" : "Aucun congé urgent",
      description: congesUrgents.length > 0 
        ? `${congesUrgents.length} demande(s) urgente(s) nécessite(nt) un traitement immédiat`
        : "Aucune demande urgente en attente",
      variant: congesUrgents.length > 0 ? "destructive" : "default"
    });
  };

  // Handler pour export congés
  const handleExportConges = () => {
    const exportData = demandesConge.map(conge => ({
      Demandeur: getUserName(conge.demandeur_id),
      Type: conge.type_conge,
      'Date début': conge.date_debut,
      'Date fin': conge.date_fin,
      'Nombre jours': conge.nombre_jours,
      Priorité: conge.priorite,
      Statut: conge.statut,
      Raison: conge.raison
    }));
    console.log('Export data:', exportData);
    toast({
      title: "Export réussi",
      description: `${demandesConge.length} demande(s) de congé exportée(s)`,
      variant: "success"
    });
  };

  // Handler pour impact planning
  const handleShowImpact = async (congeId) => {
    await handlers.handleShowImpact(congeId, setImpactData, setShowImpactModal, setLoadingImpact);
  };

  if (loading) return <div className="loading" data-testid="replacements-loading">Chargement...</div>;

  return (
    <div className="remplacements-refonte">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 data-testid="replacements-title">🔄 Remplacements & Congés</h1>
          <p>Gestion des demandes de remplacement avec recherche automatique et suivi des congés</p>
        </div>
      </div>

      {/* KPIs - Visible uniquement pour admin/superviseur */}
      {canViewAllDemandes && (
        <KPICards
          totalDemandes={totalDemandes}
          enAttente={enAttente}
          acceptees={acceptees}
          refusees={refusees}
          remplacementsTrouves={remplacementsTrouves}
          tauxSucces={tauxSucces}
          congesDuMois={congesDuMois}
        />
      )}

      {/* Barre de Contrôles */}
      <div className="personnel-controls" style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          {/* Boutons d'action */}
          <ActionButtons
            onCreateRemplacement={() => setShowCreateRemplacementModal(true)}
            onCreateConge={() => setShowCreateCongeModal(true)}
          />

          {/* Barre de filtres */}
          <FilterBar
            filterStatut={filters.filterStatut}
            setFilterStatut={filters.setFilterStatut}
            filterPeriode={filters.filterPeriode}
            setFilterPeriode={filters.setFilterPeriode}
            filterDateDebut={filters.filterDateDebut}
            setFilterDateDebut={filters.setFilterDateDebut}
            filterDateFin={filters.filterDateFin}
            setFilterDateFin={filters.setFilterDateFin}
            onResetFilters={filters.resetFilters}
            resultsCount={activeTab === 'remplacements' ? filteredDemandes.length : filteredConges.length}
            activeTab={activeTab}
          />

          {/* Exports */}
          <ExportButtons
            onExportPdf={() => { setExportType('pdf'); setShowExportModal(true); }}
            onExportExcel={() => { setExportType('excel'); setShowExportModal(true); }}
          />
        </div>
      </div>

      {/* Onglets */}
      <TabsBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        propositionsCount={propositionsRecues.length}
        remplacementsCount={filteredDemandes.length}
        congesCount={filteredConges.length}
      />

      {/* Contenu des onglets */}
      <div className="tab-content">
        {activeTab === 'propositions' && (
          <PropositionsRecues
            propositions={propositionsRecues}
            getTypeGardeName={getTypeGardeName}
            getUserName={getUserName}
            parseDateLocal={parseDateLocal}
            onAccept={(id) => handlers.handleRepondreProposition(id, 'accepter')}
            onRefuse={(id) => handlers.handleRepondreProposition(id, 'refuser')}
          />
        )}

        {activeTab === 'remplacements' && (
          <RemplacementsList
            demandes={demandes}
            user={user}
            getTypeGardeName={getTypeGardeName}
            getUserName={getUserName}
            getStatutColor={getStatutColor}
            getStatutLabel={getStatutLabel}
            parseDateLocal={parseDateLocal}
            onArreterProcessus={handlers.handleArreterProcessus}
            onRelancerDemande={handlers.handleRelancerDemande}
            onSupprimerDemande={handlers.handleSupprimerDemande}
            onAnnulerDemande={handlers.handleAnnulerDemande}
            canDeleteRemplacement={permissions.canDeleteRemplacement}
            canEditRemplacement={permissions.canEditRemplacement}
            onShowSuivi={(demande) => {
              setSelectedDemandeForSuivi(demande);
              setShowSuiviModal(true);
            }}
            filterStatut={filters.filterStatut}
            filterPeriode={filters.filterPeriode}
          />
        )}

        {activeTab === 'conges' && (
          <CongesList
            conges={mesConges}
            filteredConges={filteredConges}
            user={user}
            users={users}
            isAdminOrSuperviseur={isAdminOrSuperviseur}
            loadingImpact={loadingImpact}
            filterStatut={filters.filterStatut}
            filterPeriode={filters.filterPeriode}
            getUserName={getUserName}
            getStatutColor={getStatutColor}
            getStatutLabel={getStatutLabel}
            getPrioriteColor={getPrioriteColor}
            parseDateLocal={parseDateLocal}
            onFilterUrgent={handleFilterUrgentConges}
            onExportConges={handleExportConges}
            onShowImpact={handleShowImpact}
            onApprouverConge={handlers.handleApprouverConge}
          />
        )}
      </div>

      {/* Modals */}
      <CreateRemplacementModal
        show={showCreateRemplacementModal}
        onClose={() => {
          setShowCreateRemplacementModal(false);
          setNewDemande({ type_garde_id: '', date: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null });
        }}
        newDemande={newDemande}
        setNewDemande={setNewDemande}
        typesGarde={typesGarde}
        onSubmit={onCreateRemplacement}
        canCreateForOthers={permissions.canCreateForOthers}
        users={users}
        currentUserId={user?.id}
      />

      <CreateCongeModal
        show={showCreateCongeModal}
        onClose={() => {
          setShowCreateCongeModal(false);
          setNewConge({ type_conge: '', date_debut: getLocalDateString(), date_fin: getLocalDateString(), raison: '', priorite: 'normale', target_user_id: null });
        }}
        newConge={newConge}
        setNewConge={setNewConge}
        onSubmit={onCreateConge}
        canCreateForOthers={permissions.canCreateForOthers}
        users={users}
        currentUserId={user?.id}
      />

      {/* Modal d'export */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h3>📊 Export Remplacements {exportType === 'pdf' ? 'PDF' : 'Excel'}</h3>
              <Button variant="ghost" onClick={() => setShowExportModal(false)}>✕</Button>
            </div>
            <div className="modal-body" style={{padding: '2rem'}}>
              <p style={{marginBottom: '1.5rem', color: '#64748b'}}>
                Que souhaitez-vous exporter ?
              </p>
              <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                <Button 
                  onClick={() => handleExport(exportType)}
                  style={{ padding: '1.5rem', justifyContent: 'flex-start', gap: '1rem', fontSize: '1rem' }}
                >
                  <span style={{fontSize: '1.5rem'}}>📋</span>
                  <div style={{textAlign: 'left'}}>
                    <div style={{fontWeight: '600'}}>Toutes les demandes</div>
                    <div style={{fontSize: '0.875rem', opacity: 0.8}}>
                      Exporter toutes les demandes de remplacement ({demandes.length} demandes)
                    </div>
                  </div>
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => toast({ title: "Info", description: "Sélectionnez un pompier depuis le module Personnel pour exporter ses demandes" })}
                  style={{ padding: '1.5rem', justifyContent: 'flex-start', gap: '1rem', fontSize: '1rem' }}
                >
                  <span style={{fontSize: '1.5rem'}}>👤</span>
                  <div style={{textAlign: 'left'}}>
                    <div style={{fontWeight: '600'}}>Une personne spécifique</div>
                    <div style={{fontSize: '0.875rem', opacity: 0.8}}>
                      Disponible depuis le module Personnel
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de suivi */}
      {showSuiviModal && selectedDemandeForSuivi && (
        <SuiviRemplacementModal
          demande={selectedDemandeForSuivi}
          tenantSlug={tenantSlug}
          onClose={() => {
            setShowSuiviModal(false);
            setSelectedDemandeForSuivi(null);
          }}
          users={users}
        />
      )}

      {/* Modal d'impact planning */}
      <ImpactPlanningModal
        show={showImpactModal}
        onClose={() => setShowImpactModal(false)}
        impactData={impactData}
      />
    </div>
  );
};

export default Remplacements;
