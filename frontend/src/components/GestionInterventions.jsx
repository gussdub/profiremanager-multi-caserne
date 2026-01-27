import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import useModalScrollLock from '../hooks/useModalScrollLock';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Composants extraits
import SectionBatiment from './interventions/SectionBatiment';
import SectionIdentification from './interventions/SectionIdentification';
import SectionRessources from './interventions/SectionRessources';
import SectionDSI from './interventions/SectionDSI';
import SectionProtection from './interventions/SectionProtection';
import SectionMateriel from './interventions/SectionMateriel';
import SectionPertes from './interventions/SectionPertes';
import SectionNarratif from './interventions/SectionNarratif';
import SectionRemisePropriete from './interventions/SectionRemisePropriete';
import SectionFacturation from './interventions/SectionFacturation';
import ConfigurationSFTP from './ConfigurationSFTP';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Composant draggable pour les sections du template narratif
const SortableNarratifSection = ({ section, index, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id || `section-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className={`bg-gray-50 p-3 rounded-lg border flex items-start gap-3 ${isDragging ? 'border-blue-500 border-dashed border-2' : ''}`}>
        {/* Handle de drag */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded mt-2"
          title="Glisser pour réorganiser"
        >
          ⠿
        </button>
        {children}
      </div>
    </div>
  );
};

// ==================== COMPOSANT PRINCIPAL ====================

const GestionInterventions = ({ user, tenantSlug }) => {
  const [activeTab, setActiveTab] = useState('rapports');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  // Charger les paramètres du module
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API}/interventions/settings`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
        }
      } catch (error) {
        console.error('Erreur chargement paramètres:', error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [API, user]);

  if (loading) {
    return <div className="p-6 text-center">Chargement...</div>;
  }

  // Déterminer les permissions
  const isAdmin = user?.role === 'admin';
  const isSuperviseur = user?.role === 'superviseur';
  const isAdminOrSupervisor = isAdmin || isSuperviseur;
  const isEmployee = ['employe', 'pompier'].includes(user?.role);
  const isDesignatedPerson = (settings?.personnes_ressources || []).includes(user?.id);
  const isValidateur = (settings?.validateurs || []).includes(user?.id);
  
  // Les employés ont accès en lecture seule aux cartes d'appel
  // L'accès à l'historique dépend du paramètre acces_employes_historique
  const employeeCanAccessHistory = settings?.acces_employes_historique || false;
  
  // Mode lecture seule pour les employés (sauf s'ils sont personnes ressources)
  const isReadOnlyMode = isEmployee && !isDesignatedPerson;

  const tabs = [
    { id: 'rapports', label: 'Rapports d\'intervention', icon: '📋' },
    { id: 'conformite-dsi', label: 'Conformité DSI', icon: '📊', validatorsOnly: true },
    { id: 'historique', label: 'Historique', icon: '📚', hideForEmployee: !employeeCanAccessHistory },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', adminOnly: true },
  ];

  // Filtrer les onglets selon le rôle
  const visibleTabs = tabs.filter(tab => {
    if (tab.adminOnly && !isAdmin) return false;
    if (tab.validatorsOnly && !isAdmin && !isValidateur) return false;
    if (tab.hideForEmployee && isEmployee && !isDesignatedPerson) return false;
    return true;
  });

  return (
    <div className="p-6" data-testid="gestion-interventions">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Interventions</h1>
        <p className="text-gray-600">
          {isReadOnlyMode 
            ? "Consultation des cartes d'appel (lecture seule)" 
            : "Gérez vos rapports d'intervention et importez les données du 911"
          }
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'rapports' && (
        <TabRapports user={user} tenantSlug={tenantSlug} toast={toast} readOnly={isReadOnlyMode} />
      )}
      {activeTab === 'historique' && (
        <TabHistorique user={user} tenantSlug={tenantSlug} toast={toast} readOnly={isReadOnlyMode} />
      )}
      {activeTab === 'conformite-dsi' && (isAdmin || isValidateur) && (
        <TabConformiteDSI user={user} tenantSlug={tenantSlug} toast={toast} />
      )}
      {activeTab === 'parametres' && user?.role === 'admin' && (
        <TabParametres user={user} tenantSlug={tenantSlug} toast={toast} />
      )}
    </div>
  );
};


// ==================== ONGLET RAPPORTS ====================

const TabRapports = ({ user, tenantSlug, toast, readOnly = false }) => {
  const [dashboard, setDashboard] = useState({ counts: {}, new: [], drafts: [], review: [] });
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState(null);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await fetch(`${API}/interventions/dashboard`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDashboard(data);
      }
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-CA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      new: { bg: '#dbeafe', color: '#1e40af', label: 'Nouveau' },
      draft: { bg: '#fef3c7', color: '#92400e', label: 'Brouillon' },
      revision: { bg: '#fee2e2', color: '#991b1b', label: 'À réviser' },
      review: { bg: '#e0e7ff', color: '#3730a3', label: 'À valider' },
      signed: { bg: '#d1fae5', color: '#065f46', label: 'Signé' },
      archived: { bg: '#f3f4f6', color: '#4b5563', label: 'Archivé' },
    };
    const style = styles[status] || styles.new;
    return (
      <span style={{
        padding: '4px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
        backgroundColor: style.bg,
        color: style.color
      }}>
        {style.label}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  const canImport = ['admin', 'superviseur'].includes(user?.role) && !readOnly;

  return (
    <div>
      {/* En-tête avec bouton import */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex gap-4 flex-wrap">
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <span className="text-blue-800 font-medium">
              📥 Nouveaux: {dashboard.counts.new || 0}
            </span>
          </div>
          <div className="bg-yellow-50 px-4 py-2 rounded-lg">
            <span className="text-yellow-800 font-medium">
              ✏️ Brouillons: {(dashboard.counts.draft || 0) + (dashboard.counts.revision || 0)}
            </span>
          </div>
          <div className="bg-purple-50 px-4 py-2 rounded-lg">
            <span className="text-purple-800 font-medium">
              🔍 À valider: {dashboard.counts.review || 0}
            </span>
          </div>
        </div>
        
        {canImport && (
          <Button 
            onClick={() => setShowImportModal(true)}
            className="bg-green-600 hover:bg-green-700"
            data-testid="import-xml-btn"
          >
            📤 Importer XML
          </Button>
        )}
      </div>

      {/* Colonnes Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* File d'attente (Nouveaux) */}
        <Card>
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-blue-800 text-lg">
              📥 File d'attente ({dashboard.new.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {dashboard.new.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucune intervention en attente</p>
            ) : (
              dashboard.new.map(intervention => (
                <InterventionCard 
                  key={intervention.id} 
                  intervention={intervention}
                  formatDate={formatDate}
                  getStatusBadge={getStatusBadge}
                  onSelect={() => setSelectedIntervention(intervention)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Brouillons */}
        <Card>
          <CardHeader className="bg-yellow-50">
            <CardTitle className="text-yellow-800 text-lg">
              ✏️ Brouillons ({dashboard.drafts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {dashboard.drafts.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucun brouillon</p>
            ) : (
              dashboard.drafts.map(intervention => (
                <InterventionCard 
                  key={intervention.id} 
                  intervention={intervention}
                  formatDate={formatDate}
                  getStatusBadge={getStatusBadge}
                  onSelect={() => setSelectedIntervention(intervention)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* À valider */}
        <Card>
          <CardHeader className="bg-purple-50">
            <CardTitle className="text-purple-800 text-lg">
              🔍 À valider ({dashboard.review.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
            {dashboard.review.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucune intervention à valider</p>
            ) : (
              dashboard.review.map(intervention => (
                <InterventionCard 
                  key={intervention.id} 
                  intervention={intervention}
                  formatDate={formatDate}
                  getStatusBadge={getStatusBadge}
                  onSelect={() => setSelectedIntervention(intervention)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Import XML */}
      {showImportModal && (
        <ImportXMLModal
          tenantSlug={tenantSlug}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            setShowImportModal(false);
            fetchDashboard();
            toast({ title: "Import réussi", description: "Les fichiers XML ont été importés" });
          }}
          toast={toast}
        />
      )}

      {/* Modal Détail Intervention */}
      {selectedIntervention && (
        <InterventionDetailModal
          intervention={selectedIntervention}
          tenantSlug={tenantSlug}
          user={user}
          onClose={() => setSelectedIntervention(null)}
          onUpdate={() => {
            setSelectedIntervention(null);
            fetchDashboard();
          }}
          toast={toast}
          readOnly={readOnly}
        />
      )}
    </div>
  );
};


// ==================== CARTE INTERVENTION ====================

const InterventionCard = ({ intervention, formatDate, getStatusBadge, onSelect }) => {
  return (
    <div 
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onSelect}
      data-testid={`intervention-card-${intervention.id}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-mono text-sm text-gray-500">
          #{intervention.external_call_id}
        </span>
        {getStatusBadge(intervention.status)}
      </div>
      
      <div className="text-sm font-medium text-gray-900 mb-1">
        {intervention.type_intervention || 'Type non défini'}
      </div>
      
      <div className="text-sm text-gray-600 mb-2">
        📍 {intervention.address_full || intervention.address_street || 'Adresse non disponible'}
      </div>
      
      <div className="text-xs text-gray-500">
        📅 {formatDate(intervention.xml_time_call_received || intervention.created_at)}
      </div>
    </div>
  );
};


// ==================== MODAL IMPORT XML ====================

const ImportXMLModal = ({ tenantSlug, onClose, onSuccess, toast }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  // Bloquer le scroll du body
  useModalScrollLock(true);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({ title: "Erreur", description: "Sélectionnez des fichiers XML", variant: "destructive" });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    try {
      const response = await fetch(`${API}/interventions/import-xml`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data);
        
        if (data.imported.length > 0 || data.updated.length > 0) {
          setTimeout(() => onSuccess(), 2000);
        }
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail || "Erreur d'import", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="modal-content max-w-lg w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📤 Importer fichiers XML</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg mb-4 text-sm">
            <p className="text-blue-800">
              <strong>ℹ️ Note:</strong> Actuellement, les fichiers XML sont déposés sur un serveur SFTP. 
              Une future API permettra la réception directe dans l'application.
            </p>
          </div>

          {!results ? (
            <>
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4 cursor-pointer hover:border-blue-500 transition-colors"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById('xml-file-input').click()}
              >
                <div className="text-4xl mb-2">📁</div>
                <p className="text-gray-600 mb-2">
                  Glissez-déposez vos fichiers XML ici
                </p>
                <p className="text-gray-400 text-sm">ou cliquez pour sélectionner</p>
                <input
                  id="xml-file-input"
                  type="file"
                  multiple
                  accept=".xml"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {files.length > 0 && (
                <div className="mb-4">
                  <p className="font-medium mb-2">{files.length} fichier(s) sélectionné(s):</p>
                  <ul className="text-sm text-gray-600 max-h-32 overflow-y-auto">
                    {files.map((file, i) => (
                      <li key={i} className="flex justify-between items-center py-1">
                        <span>📄 {file.name}</span>
                        <button 
                          onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                          className="text-red-500 hover:text-red-700"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  onClick={handleUpload} 
                  disabled={uploading || files.length === 0}
                  className="flex-1"
                >
                  {uploading ? '⏳ Import en cours...' : '📤 Importer'}
                </Button>
                <Button variant="outline" onClick={onClose}>Annuler</Button>
              </div>
            </>
          ) : (
            <div>
              <div className="space-y-3 mb-4">
                {results.imported.length > 0 && (
                  <div className="bg-green-50 p-3 rounded-lg">
                    <span className="text-green-800">
                      ✅ {results.imported.length} intervention(s) importée(s)
                    </span>
                  </div>
                )}
                {results.updated.length > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <span className="text-blue-800">
                      🔄 {results.updated.length} intervention(s) mise(s) à jour
                    </span>
                  </div>
                )}
                {results.errors.length > 0 && (
                  <div className="bg-red-50 p-3 rounded-lg">
                    <span className="text-red-800">
                      ❌ {results.errors.length} erreur(s)
                    </span>
                    <ul className="text-sm mt-1">
                      {results.errors.map((err, i) => (
                        <li key={i}>{err.call_number}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {results.unmapped_codes.length > 0 && (
                  <div className="bg-yellow-50 p-3 rounded-lg">
                    <span className="text-yellow-800">
                      ⚠️ {results.unmapped_codes.length} code(s) non mappé(s)
                    </span>
                  </div>
                )}
              </div>
              <Button onClick={onClose} className="w-full">Fermer</Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};


// ==================== MODAL DÉTAIL INTERVENTION (DSI COMPLET) ====================

const InterventionDetailModal = ({ intervention, tenantSlug, user, onClose, onUpdate, toast, readOnly = false }) => {
  const [activeSection, setActiveSection] = useState('identification');
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({ ...intervention });
  const [referenceData, setReferenceData] = useState({ 
    natures: [], causes: [], sources_chaleur: [], materiaux: [], facteurs_allumage: [], usages_batiment: [], categories_batiment: [] 
  });
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState([]);
  const [resources, setResources] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [interventionSettings, setInterventionSettings] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitReason, setSubmitReason] = useState('');
  const [submitAction, setSubmitAction] = useState(null);

  // Bloquer le scroll du body
  useModalScrollLock(true);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  // Charger les settings du module interventions (pour le template narratif)
  const fetchInterventionSettings = async () => {
    try {
      const response = await fetch(`${API}/interventions/settings`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInterventionSettings(data.settings);
      }
    } catch (error) {
      console.error('Erreur chargement settings:', error);
    }
  };

  useEffect(() => {
    fetchDetails();
    fetchReferenceData();
    fetchInterventionSettings();
  }, []);

  const fetchDetails = async () => {
    try {
      const response = await fetch(`${API}/interventions/detail/${intervention.id}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setVehicles(data.vehicles || []);
        setResources(data.resources || []);
        setFormData(data.intervention);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const fetchReferenceData = async () => {
    try {
      const response = await fetch(`${API}/interventions/reference-data`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReferenceData(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // Déterminer si c'est un incendie (pour afficher les champs DSI)
  // Inclut les alarmes incendie pour permettre de remplir les DSI si nécessaire
  const isFireIncident = () => {
    const nature = (formData.type_intervention || '').toLowerCase();
    // Afficher DSI pour tout ce qui contient "incendie" (y compris alarmes)
    return nature.includes('incendie');
  };
  
  // Vrai incendie (pas une alarme) - pour la validation obligatoire
  const isRealFire = () => {
    const nature = (formData.type_intervention || '').toLowerCase();
    return nature.includes('incendie') && !nature.includes('alarme');
  };

  // Déterminer si ça touche un bâtiment
  const isBuildingFire = () => {
    const nature = (formData.type_intervention || '').toLowerCase();
    return nature.includes('bâtiment') || nature.includes('batiment') || 
           nature.includes('structure') || nature.includes('résidentiel');
  };

  // Validation DSI avant signature
  const validateDSI = () => {
    const errors = [];
    
    // Validation obligatoire uniquement pour les vrais incendies (pas les alarmes)
    if (isRealFire()) {
      if (!formData.cause_id) {
        errors.push("Cause probable obligatoire pour les incendies");
      }
      if (!formData.smoke_detector_presence) {
        errors.push("Présence d'avertisseur de fumée obligatoire");
      }
      if (!formData.source_heat_id) {
        errors.push("Source de chaleur obligatoire pour les incendies");
      }
      if (!formData.material_first_ignited_id) {
        errors.push("Matériau premier enflammé obligatoire");
      }
      
      // Si cause indéterminée, exiger une justification
      const selectedCause = referenceData.causes.find(c => c.id === formData.cause_id);
      if (selectedCause?.libelle?.toLowerCase().includes('indéterminée') && !formData.cause_indeterminee_justification) {
        errors.push("Justification obligatoire si cause indéterminée");
      }
    }
    
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Si le statut est "new", le passer en "draft" lors de la première modification
      const dataToSave = { ...formData };
      if (dataToSave.status === 'new') {
        dataToSave.status = 'draft';
      }
      
      const response = await fetch(`${API}/interventions/${intervention.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSave)
      });

      if (response.ok) {
        toast({ title: "Succès", description: "Intervention mise à jour" });
        setEditMode(false);
        setFormData(dataToSave); // Mettre à jour le formData local avec le nouveau statut
        fetchDetails();
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de sauvegarde", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Ouvrir le modal de soumission
  const openSubmitModal = (action) => {
    setSubmitAction(action);
    setSubmitReason('');
    setShowSubmitModal(true);
  };

  // Confirmer la soumission avec raison
  const confirmSubmit = async () => {
    setShowSubmitModal(false);
    await handleValidate(submitAction, submitReason);
  };

  const handleValidate = async (action, reason = '') => {
    // Validation avant signature
    if (action === 'sign' && !validateDSI()) {
      toast({ 
        title: "Validation impossible", 
        description: "Veuillez compléter tous les champs obligatoires DSI", 
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, comment: reason })
      });

      if (response.ok) {
        const messages = {
          'submit': "Intervention soumise pour validation",
          'sign': "Intervention signée",
          'return_for_revision': "Intervention retournée pour révision"
        };
        toast({ title: "Succès", description: messages[action] || "Statut mis à jour" });
        fetchDetails(); // Rafraîchir les données
        onUpdate();
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de validation", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('fr-CA');
    } catch {
      return dateStr;
    }
  };

  const isAdmin = user.role === 'admin';
  const isSuperviseur = user.role === 'superviseur';
  const isReporter = (formData.assigned_reporters || []).includes(user.id);
  const isEmployee = user.role === 'pompier' || user.role === 'employe';
  
  // Les employés (non admin/superviseur) ne peuvent voir que certaines sections
  // Sauf s'ils sont assignés comme rédacteurs de rapport
  const employeeLimitedAccess = isEmployee && !isReporter;
  
  const sections = [
    { id: 'identification', label: 'Identification & Chrono', icon: '📋', employeeAccess: true },
    { id: 'batiment', label: 'Bâtiment', icon: '🏠', showIf: isBuildingFire, employeeAccess: true },
    { id: 'ressources', label: 'Ressources', icon: '👥', employeeAccess: false },
    { id: 'materiel', label: 'Matériel utilisé', icon: '🧰', employeeAccess: false },
    { id: 'dsi', label: 'Détails DSI', icon: '🔥', showIf: isFireIncident, employeeAccess: false },
    { id: 'protection', label: 'Protection incendie', icon: '🚨', showIf: isFireIncident, employeeAccess: false },
    { id: 'pertes', label: 'Pertes & Victimes', icon: '💰', employeeAccess: false },
    { id: 'narratif', label: 'Narratif', icon: '📝', employeeAccess: false },
    { id: 'remise', label: 'Remise de propriété', icon: '📋', employeeAccess: false },
    { id: 'facturation', label: 'Facturation', icon: '🧾', showIf: () => isAdmin, employeeAccess: false },
  ];

  // Filtrer les sections selon le rôle
  const visibleSections = sections.filter(s => {
    // Vérifier d'abord les conditions showIf
    if (s.showIf && !s.showIf()) return false;
    // Si accès limité employé, ne montrer que les sections autorisées
    if (employeeLimitedAccess && !s.employeeAccess) return false;
    return true;
  });

  const canEdit = (isAdmin || isSuperviseur || isReporter) && !employeeLimitedAccess;
  const canValidate = isAdmin || isSuperviseur;
  const isLocked = formData.status === 'signed';
  
  // Forcer le mode lecture seule pour les employés avec accès limité
  const forceReadOnly = readOnly || employeeLimitedAccess;

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100000 }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">
                Intervention #{formData.external_call_id}
              </h2>
              <p className="text-red-100">
                {formData.type_intervention || 'Type non défini'} - {formData.address_full || 'Adresse non disponible'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isLocked && (
                <span className="bg-green-500 px-3 py-1 rounded-full text-sm">
                  ✅ Signé
                </span>
              )}
              <button onClick={onClose} className="text-white hover:text-red-200 text-2xl">&times;</button>
            </div>
          </div>
        </div>

        {/* Erreurs de validation */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border-b border-red-200 p-3">
            <p className="text-red-800 font-medium">⚠️ Champs obligatoires manquants:</p>
            <ul className="text-red-700 text-sm list-disc list-inside">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Navigation - Style bien visible, flex wrap pour éviter le scroll */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-300">
          <div className="flex flex-wrap gap-2">
            {visibleSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-3 py-2 rounded-lg font-medium transition-all text-sm border ${
                  activeSection === section.id
                    ? 'bg-red-600 text-white border-red-700 shadow-lg'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                {section.icon} {section.label}
              </button>
            ))}
          </div>
        </div>

        {/* Contenu - scroll interne avec overscroll-behavior */}
        <div className="flex-1 overflow-y-auto p-6" style={{ overscrollBehavior: 'contain' }}>
          {activeSection === 'identification' && (
            <SectionIdentification 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              formatDateTime={formatDateTime}
              tenantSlug={tenantSlug}
              getToken={getToken}
              toast={toast}
            />
          )}
          {activeSection === 'batiment' && (
            <SectionBatiment 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              referenceData={referenceData}
              tenantSlug={tenantSlug}
              getToken={getToken}
            />
          )}
          {activeSection === 'ressources' && (
            <SectionRessources 
              vehicles={vehicles}
              resources={resources}
              formData={formData}
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              tenantSlug={tenantSlug}
              interventionId={formData.id}
              onRefresh={fetchDetails}
            />
          )}
          {activeSection === 'materiel' && (
            <SectionMateriel 
              formData={formData}
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              tenantSlug={tenantSlug}
              getToken={getToken}
            />
          )}
          {activeSection === 'dsi' && (
            <SectionDSI 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              referenceData={referenceData}
              tenantSlug={tenantSlug}
              vehicles={vehicles}
              resources={resources}
            />
          )}
          {activeSection === 'protection' && (
            <SectionProtection 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
            />
          )}
          {activeSection === 'pertes' && (
            <SectionPertes 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
            />
          )}
          {activeSection === 'narratif' && (
            <SectionNarratif 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !forceReadOnly}
              settings={interventionSettings}
            />
          )}
          
          {activeSection === 'remise' && (
            <SectionRemisePropriete
              intervention={formData}
              tenantSlug={tenantSlug}
              user={user}
              getToken={getToken}
              toast={toast}
              canEdit={canEdit && !isLocked && !readOnly}
            />
          )}
          
          {activeSection === 'facturation' && (
            <SectionFacturation 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked && !readOnly}
              tenantSlug={tenantSlug}
              getToken={getToken}
              toast={toast}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-between flex-wrap gap-2">
          <div className="flex gap-2">
            {canEdit && !isLocked && !readOnly && (
              <Button
                variant={editMode ? "default" : "outline"}
                onClick={() => editMode ? handleSave() : setEditMode(true)}
                disabled={loading}
              >
                {editMode ? '💾 Enregistrer' : '✏️ Modifier'}
              </Button>
            )}
            {/* Bouton d'impression */}
            <Button
              variant="outline"
              onClick={() => {
                // Construire le contenu HTML pour l'impression
                const getMunicipality = () => {
                  return formData.municipality || formData.xml_municipality || formData.address_city || '-';
                };
                
                const getDuration = () => {
                  if (formData.xml_time_call_received && formData.xml_time_call_closed) {
                    const start = new Date(formData.xml_time_call_received);
                    const end = new Date(formData.xml_time_call_closed);
                    const diff = Math.floor((end - start) / 60000);
                    const hours = Math.floor(diff / 60);
                    const mins = diff % 60;
                    return hours > 0 ? hours + 'h ' + mins + 'min' : mins + ' min';
                  }
                  return '-';
                };
                
                const formatDate = (dateStr) => {
                  if (!dateStr) return '-';
                  try {
                    return new Date(dateStr).toLocaleString('fr-CA', {timeZone: 'America/Montreal'});
                  } catch { return dateStr; }
                };
                
                const getVehicles = () => {
                  const vehicles = formData.assigned_vehicles || [];
                  if (vehicles.length === 0) return '<p><em>Aucun véhicule assigné</em></p>';
                  return '<p><strong>Véhicules:</strong> ' + vehicles.map(v => v.numero_unite || v.numero || v.nom || v.id).join(', ') + '</p>';
                };
                
                const getPersonnel = () => {
                  const personnel = formData.personnel_present || [];
                  if (personnel.length === 0) return '<p><em>Aucun personnel</em></p>';
                  let html = '<table><tr><th>Nom</th><th>Matricule</th><th>Statut</th><th>Prime repas</th></tr>';
                  personnel.forEach(p => {
                    const primes = [p.prime_dejeuner && 'Déjeuner', p.prime_diner && 'Dîner', p.prime_souper && 'Souper'].filter(Boolean).join(', ') || '-';
                    const statut = (p.statut_presence || 'Présent') + (p.remplace_par_nom ? ' (par ' + p.remplace_par_nom + ')' : '');
                    html += '<tr><td>' + (p.prenom || '') + ' ' + (p.nom || '') + '</td><td>' + (p.matricule || '-') + '</td><td>' + statut + '</td><td>' + primes + '</td></tr>';
                  });
                  html += '</table>';
                  return html;
                };
                
                const getMateriel = () => {
                  const materiel = formData.materiel_utilise || [];
                  if (materiel.length === 0) return '';
                  let html = '<h2>🧰 Matériel utilisé</h2><div class="section"><table><tr><th>Matériel</th><th>Type</th><th>Quantité</th><th>Notes</th></tr>';
                  materiel.forEach(m => {
                    html += '<tr><td>' + (m.nom || '-') + '</td><td>' + (m.type || '-') + '</td><td>' + (m.quantite || 1) + '</td><td>' + (m.notes || '-') + '</td></tr>';
                  });
                  html += '</table></div>';
                  return html;
                };
                
                const getMeteo = () => {
                  if (!formData.meteo) return '';
                  const m = formData.meteo;
                  return '<h2>🌤️ Conditions météo</h2><div class="section"><div class="two-cols">' +
                    '<div class="field"><span class="label">Température:</span><span class="value">' + (m.temperature != null ? m.temperature + '°C' : '-') + '</span></div>' +
                    '<div class="field"><span class="label">Humidité:</span><span class="value">' + (m.humidity != null ? m.humidity + '%' : '-') + '</span></div>' +
                    '</div><div class="two-cols">' +
                    '<div class="field"><span class="label">Vent:</span><span class="value">' + (m.wind_speed != null ? m.wind_speed + ' km/h' : '-') + '</span></div>' +
                    '<div class="field"><span class="label">Conditions:</span><span class="value">' + (m.conditions || m.description || '-') + '</span></div>' +
                    '</div></div>';
                };
                
                const getSignature = () => {
                  if (!formData.signed_at) return '';
                  return '<div style="margin-top: 30px; padding: 15px; background: #d1fae5; border-radius: 8px;"><strong>✅ Rapport signé le:</strong> ' + formatDate(formData.signed_at) + '</div>';
                };

                const printWindow = window.open('', '_blank');
                printWindow.document.write(
                  '<html><head><title>Rapport d\'intervention #' + formData.external_call_id + '</title>' +
                  '<style>' +
                  'body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }' +
                  'h1 { color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; }' +
                  'h2 { color: #374151; border-bottom: 1px solid #d1d5db; padding-bottom: 5px; margin-top: 20px; }' +
                  '.section { margin-bottom: 20px; }' +
                  '.field { margin: 8px 0; }' +
                  '.label { font-weight: bold; color: #6b7280; }' +
                  '.value { margin-left: 10px; }' +
                  'table { width: 100%; border-collapse: collapse; margin: 10px 0; }' +
                  'th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }' +
                  'th { background: #f3f4f6; }' +
                  '.header-info { display: flex; justify-content: space-between; margin-bottom: 20px; }' +
                  '.status { padding: 4px 12px; border-radius: 4px; background: #d1fae5; color: #065f46; }' +
                  '.two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }' +
                  '@media print { body { padding: 0; } }' +
                  '</style></head><body>' +
                  '<h1>📋 Rapport d\'intervention #' + formData.external_call_id + '</h1>' +
                  '<div class="header-info"><div><strong>Type:</strong> ' + (formData.type_intervention || 'Non défini') + '</div>' +
                  '<div class="status">' + (formData.status === 'signed' ? '✅ Signé' : formData.status) + '</div></div>' +
                  '<h2>📍 Identification</h2><div class="section">' +
                  '<div class="two-cols">' +
                  '<div class="field"><span class="label">Adresse:</span><span class="value">' + (formData.address_full || '-') + '</span></div>' +
                  '<div class="field"><span class="label">Municipalité:</span><span class="value">' + getMunicipality() + '</span></div>' +
                  '</div><div class="two-cols">' +
                  '<div class="field"><span class="label">No carte appel:</span><span class="value">' + (formData.external_call_id || '-') + '</span></div>' +
                  '<div class="field"><span class="label">Niveau risque:</span><span class="value">' + (formData.niveau_risque || '-') + '</span></div>' +
                  '</div><div class="two-cols">' +
                  '<div class="field"><span class="label">Date/Heure appel:</span><span class="value">' + formatDate(formData.xml_time_call_received) + '</span></div>' +
                  '<div class="field"><span class="label">Arrivée sur les lieux:</span><span class="value">' + formatDate(formData.xml_time_arrival_1st) + '</span></div>' +
                  '</div><div class="two-cols">' +
                  '<div class="field"><span class="label">Fin intervention:</span><span class="value">' + formatDate(formData.xml_time_terminated || formData.xml_time_departure) + '</span></div>' +
                  '<div class="field"><span class="label">Durée totale:</span><span class="value">' + getDuration() + '</span></div>' +
                  '</div></div>' +
                  getMeteo() +
                  '<h2>👥 Ressources</h2><div class="section">' + getVehicles() + getPersonnel() + '</div>' +
                  getMateriel() +
                  '<h2>📝 Narratif</h2><div class="section"><p style="white-space: pre-wrap; background: #f9fafb; padding: 15px; border-radius: 8px;">' + (formData.narratif || 'Aucun narratif') + '</p></div>' +
                  getSignature() +
                  '<hr style="margin-top: 30px;" />' +
                  '<p style="color: #6b7280; font-size: 12px;">Imprimé le ' + new Date().toLocaleString('fr-CA') + ' | ProFireManager</p>' +
                  '</body></html>'
                );
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => printWindow.print(), 500);
              }}
            >
              🖨️ Imprimer
            </Button>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {canValidate && !isLocked && !readOnly && (
              <>
                {(formData.status === 'draft' || formData.status === 'new' || formData.status === 'revision') ? (
                  <Button 
                    onClick={() => handleValidate('submit')}
                    disabled={loading}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    📤 Soumettre pour validation
                  </Button>
                ) : formData.status === 'review' ? (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => openSubmitModal('return_for_revision')}
                      disabled={loading}
                    >
                      ↩️ Retourner pour révision
                    </Button>
                    <Button 
                      onClick={() => handleValidate('sign')}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      ✅ Signer le rapport
                    </Button>
                  </>
                ) : null}
              </>
            )}
            <Button variant="outline" onClick={onClose}>Fermer</Button>
          </div>
        </div>

        {/* Historique des commentaires de révision */}
        {formData.audit_log && formData.audit_log.length > 0 && (
          <div className="bg-yellow-50 border-t border-yellow-200 p-3">
            <p className="font-medium text-yellow-800 mb-2">📋 Historique des révisions:</p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {formData.audit_log
                .filter(log => log.action === 'return_for_revision')
                .map((log, i) => {
                  // Formater la date en fuseau horaire local (Eastern Canada)
                  let formattedDate = log.timestamp;
                  try {
                    const date = new Date(log.timestamp);
                    formattedDate = date.toLocaleString('fr-CA', { 
                      timeZone: 'America/Montreal',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } catch (e) {}
                  
                  return (
                    <div key={i} className="text-sm bg-white p-2 rounded border border-yellow-200">
                      <span className="text-gray-500">{formattedDate}</span>
                      <span className="mx-2">-</span>
                      <span className="font-medium">{log.user_name}:</span>
                      <span className="ml-1">{log.comment}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Modal pour retourner pour révision */}
        {showSubmitModal && createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100002 }}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-bold mb-4">↩️ Retourner pour révision</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Raison du retour *</label>
                <textarea
                  value={submitReason}
                  onChange={(e) => setSubmitReason(e.target.value)}
                  placeholder="Expliquez pourquoi le rapport doit être révisé..."
                  className="w-full border border-gray-300 rounded-lg p-3 min-h-[100px] resize-y"
                />
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowSubmitModal(false)} 
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button 
                  onClick={confirmSubmit}
                  disabled={!submitReason.trim()}
                  className="flex-1"
                >
                  Confirmer
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>,
    document.body
  );
};



// ==================== ONGLET HISTORIQUE ====================

const TabHistorique = ({ user, tenantSlug, toast, readOnly = false }) => {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'signed', dateFrom: '', dateTo: '' });
  const [selectedIntervention, setSelectedIntervention] = useState(null);
  const [unlocking, setUnlocking] = useState(null);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  const fetchInterventions = async () => {
    setLoading(true);
    try {
      let url = `${API}/interventions?status=${filters.status}&limit=100`;
      if (filters.dateFrom) url += `&date_from=${filters.dateFrom}`;
      if (filters.dateTo) url += `&date_to=${filters.dateTo}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInterventions(data.interventions);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  // Déverrouiller une intervention (admin seulement)
  const handleUnlock = async (interventionId) => {
    if (readOnly) return; // Pas d'action en lecture seule
    
    if (!window.confirm('Êtes-vous sûr de vouloir déverrouiller cette intervention pour modification ?')) {
      return;
    }
    
    setUnlocking(interventionId);
    try {
      const response = await fetch(`${API}/interventions/${interventionId}/unlock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        toast({ title: "Succès", description: "Intervention déverrouillée. Elle est maintenant en brouillon." });
        fetchInterventions();
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail || "Impossible de déverrouiller", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    } finally {
      setUnlocking(null);
    }
  };

  useEffect(() => {
    fetchInterventions();
  }, [filters]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fr-CA');
    } catch {
      return dateStr;
    }
  };

  // Traduction des statuts en français
  const getStatusLabel = (status) => {
    const labels = {
      'new': 'Nouveau',
      'draft': 'Brouillon',
      'revision': 'À réviser',
      'review': 'À valider',
      'signed': 'Signé',
      'archived': 'Archivé'
    };
    return labels[status] || status;
  };

  const isAdmin = user.role === 'admin';

  return (
    <div>
      <div className="flex gap-4 mb-6 flex-wrap">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="border border-gray-300 rounded-lg p-2"
        >
          <option value="">Tous les statuts</option>
          <option value="signed">Signés</option>
          <option value="archived">Archivés</option>
        </select>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          className="border border-gray-300 rounded-lg p-2"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          className="border border-gray-300 rounded-lg p-2"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">Chargement...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-3 border-b">No Carte</th>
                <th className="text-left p-3 border-b">Date</th>
                <th className="text-left p-3 border-b">Type</th>
                <th className="text-left p-3 border-b">Adresse</th>
                <th className="text-left p-3 border-b">Statut</th>
                <th className="text-left p-3 border-b">Actions</th>
              </tr>
            </thead>
            <tbody>
              {interventions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    Aucune intervention trouvée
                  </td>
                </tr>
              ) : (
                interventions.map(intervention => (
                  <tr key={intervention.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedIntervention(intervention)}>
                    <td className="p-3 border-b font-mono">{intervention.external_call_id}</td>
                    <td className="p-3 border-b">{formatDate(intervention.xml_time_call_received || intervention.created_at)}</td>
                    <td className="p-3 border-b">{intervention.type_intervention || '-'}</td>
                    <td className="p-3 border-b">{intervention.address_full || '-'}</td>
                    <td className="p-3 border-b">
                      <span className={`px-2 py-1 rounded text-sm ${
                        intervention.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {getStatusLabel(intervention.status)}
                      </span>
                    </td>
                    <td className="p-3 border-b">
                      <div className="flex gap-2">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedIntervention(intervention); }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          👁️ Consulter
                        </button>
                        {isAdmin && intervention.status === 'signed' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleUnlock(intervention.id); }}
                            disabled={unlocking === intervention.id}
                            className="text-orange-600 hover:text-orange-800 text-sm font-medium disabled:opacity-50"
                          >
                            {unlocking === intervention.id ? '⏳' : '🔓'} Déverrouiller
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de consultation (lecture seule) */}
      {selectedIntervention && (
        <InterventionDetailModal
          intervention={selectedIntervention}
          tenantSlug={tenantSlug}
          user={user}
          onClose={() => setSelectedIntervention(null)}
          onUpdate={() => setSelectedIntervention(null)}
          toast={toast}
          readOnly={true}
        />
      )}
    </div>
  );
};


// ==================== ONGLET CONFORMITÉ DSI ====================

const TabConformiteDSI = ({ user, tenantSlug, toast }) => {
  const [stats, setStats] = useState(null);
  const [transmissions, setTransmissions] = useState([]);
  const [retards, setRetards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [selectedIntervention, setSelectedIntervention] = useState(null);
  const [erreurDetails, setErreurDetails] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [sending, setSending] = useState({});

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  const getTenantId = () => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.tenant_id;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const tenantId = getTenantId();

  useEffect(() => {
    if (!tenantId) return;
    fetchData();
  }, [tenantId, filtreStatut]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, listRes, retardsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/dsi/transmissions/stats/${tenantId}`),
        fetch(`${BACKEND_URL}/api/dsi/transmissions/list/${tenantId}?limit=50${filtreStatut ? `&statut=${filtreStatut}` : ''}`),
        fetch(`${BACKEND_URL}/api/dsi/transmissions/retards/${tenantId}`)
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (listRes.ok) setTransmissions(await listRes.json());
      if (retardsRes.ok) setRetards(await retardsRes.json());
    } catch (error) {
      console.error('Erreur chargement données DSI:', error);
    } finally {
      setLoading(false);
    }
  };

  const voirErreurs = async (intervention) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/dsi/transmissions/erreurs/${intervention.id}?tenant_id=${tenantId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIntervention({ ...intervention, tenant_slug: tenantSlug });
        setErreurDetails(data.erreurs);
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('Erreur chargement erreurs:', error);
    }
  };

  const envoyerRapport = async (interventionId) => {
    setSending(prev => ({ ...prev, [interventionId]: true }));
    try {
      const res = await fetch(`${BACKEND_URL}/api/dsi/transmissions/envoyer/${interventionId}?tenant_id=${tenantId}`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        toast?.({ title: '✅ Succès', description: `Rapport accepté! Confirmation: ${data.numero_confirmation}` });
      } else {
        toast?.({ title: '❌ Erreur', description: 'Rapport rejeté par le MSP', variant: 'destructive' });
      }
      fetchData();
    } catch (error) {
      console.error('Erreur envoi:', error);
      toast?.({ title: 'Erreur', description: 'Erreur lors de l\'envoi', variant: 'destructive' });
    } finally {
      setSending(prev => ({ ...prev, [interventionId]: false }));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fr-CA');
    } catch {
      return dateStr;
    }
  };

  const StatusBadge = ({ statut }) => {
    const config = {
      brouillon: { icon: '🔵', label: 'En brouillon', bg: 'bg-blue-100', text: 'text-blue-800' },
      pret_envoi: { icon: '🟡', label: 'Prêt pour envoi', bg: 'bg-yellow-100', text: 'text-yellow-800' },
      envoye: { icon: '🟡', label: 'En attente', bg: 'bg-yellow-100', text: 'text-yellow-800' },
      accepte: { icon: '🟢', label: 'Accepté MSP', bg: 'bg-green-100', text: 'text-green-800' },
      erreur: { icon: '🔴', label: 'Erreur', bg: 'bg-red-100', text: 'text-red-800' }
    };
    const s = config[statut] || config.brouillon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.icon} {s.label}
      </span>
    );
  };

  const ConformityGauge = ({ taux }) => {
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (taux / 100) * circumference;
    const color = taux >= 90 ? '#22c55e' : taux >= 70 ? '#f59e0b' : '#ef4444';
    return (
      <div className="relative w-28 h-28">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="56" cy="56" r="45" stroke="#e5e7eb" strokeWidth="8" fill="none" />
          <circle cx="56" cy="56" r="45" stroke={color} strokeWidth="8" fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{taux}%</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      {/* Alerte retards */}
      {retards.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <div>
              <p className="font-bold text-red-800">Attention : {retards.length} rapport(s) de plus de 48h non transmis au MSP</p>
              <p className="text-sm text-red-600">{retards.map(r => r.numero_rapport).join(', ')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Widgets statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 flex flex-col items-center">
          <ConformityGauge taux={stats?.taux_conformite || 100} />
          <p className="text-sm font-medium text-gray-600 mt-2">Taux conformité</p>
        </div>
        <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-3xl font-bold text-blue-600">{stats?.brouillon || 0}</p>
          <p className="text-sm text-gray-500">🔵 En brouillon</p>
        </div>
        <div className="bg-white rounded-lg p-4 border-l-4 border-yellow-500">
          <p className="text-3xl font-bold text-yellow-600">{stats?.pret_envoi || 0}</p>
          <p className="text-sm text-gray-500">🟡 Prêts pour envoi</p>
        </div>
        <div className="bg-white rounded-lg p-4 border-l-4 border-green-500">
          <p className="text-3xl font-bold text-green-600">{stats?.accepte || 0}</p>
          <p className="text-sm text-gray-500">🟢 Acceptés MSP</p>
        </div>
        <div className="bg-white rounded-lg p-4 border-l-4 border-red-500">
          <p className="text-3xl font-bold text-red-600">{stats?.erreur || 0}</p>
          <p className="text-sm text-gray-500">🔴 Erreurs</p>
        </div>
      </div>

      {/* Tableau des transmissions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-4">
          <h3 className="text-lg font-semibold">📋 Suivi des Transmissions DSI</h3>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Filtrer:</label>
            <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="border rounded px-3 py-1 text-sm">
              <option value="">Tous</option>
              <option value="brouillon">🔵 En brouillon</option>
              <option value="pret_envoi">🟡 Prêt pour envoi</option>
              <option value="accepte">🟢 Accepté</option>
              <option value="erreur">🔴 Erreur</option>
            </select>
            <button onClick={fetchData} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 text-sm">🔄</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">No. Rapport</th>
                <th className="p-3">Adresse</th>
                <th className="p-3">Statut</th>
                <th className="p-3">No. Confirmation MSP</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {transmissions.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Aucune intervention trouvée</td></tr>
              ) : (
                transmissions.map((trans) => (
                  <tr key={trans.id} className="border-b hover:bg-gray-50">
                    <td className="p-3">{formatDate(trans.date)}</td>
                    <td className="p-3 font-medium">{trans.numero_rapport}</td>
                    <td className="p-3 max-w-xs truncate" title={trans.adresse}>{trans.adresse || '-'}</td>
                    <td className="p-3"><StatusBadge statut={trans.statut} /></td>
                    <td className="p-3 font-mono text-sm">{trans.numero_confirmation_msp || '--'}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {trans.statut === 'accepte' && (
                          <button onClick={() => window.location.href = `/${tenantSlug}/interventions/${trans.id}`} className="text-blue-600 hover:text-blue-800 text-sm">👁️ Voir</button>
                        )}
                        {trans.statut === 'erreur' && (
                          <button onClick={() => voirErreurs(trans)} className="text-red-600 hover:text-red-800 text-sm">🛠️ Réparer</button>
                        )}
                        {(trans.statut === 'pret_envoi' || trans.statut === 'envoye') && (
                          <button onClick={() => envoyerRapport(trans.id)} disabled={sending[trans.id]} className="text-blue-600 hover:text-blue-800 text-sm">{sending[trans.id] ? '⏳' : '🚀'} Envoyer</button>
                        )}
                        {trans.statut === 'brouillon' && trans.requiert_dsi && (
                          <button onClick={() => window.location.href = `/${tenantSlug}/interventions/${trans.id}`} className="text-gray-600 hover:text-gray-800 text-sm">✏️ Compléter</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal d'erreur */}
      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-4 border-b bg-red-50">
              <h3 className="text-lg font-bold text-red-800">⚠️ Erreur de transmission MSP</h3>
              <p className="text-sm text-red-600 mt-1">Rapport #{selectedIntervention?.numero_rapport}</p>
            </div>
            <div className="p-4 space-y-4">
              {erreurDetails && erreurDetails.length > 0 ? (
                erreurDetails.map((err, idx) => (
                  <div key={idx} className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <p className="font-medium text-red-800">❌ {err.message_utilisateur}</p>
                    <p className="text-sm text-red-600 mt-1">Code: {err.code}</p>
                    <div className="mt-3 bg-white p-3 rounded border">
                      <p className="text-sm font-medium text-gray-700">💡 Suggestion:</p>
                      <p className="text-sm text-gray-600">{err.suggestion}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">Aucune erreur détaillée disponible.</p>
              )}
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button onClick={() => setShowErrorModal(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Fermer</button>
              <button onClick={() => window.location.href = `/${tenantSlug}/interventions/${selectedIntervention?.id}`} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">🛠️ Corriger le rapport</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ==================== ONGLET PARAMETRES ====================

const TabParametres = ({ user, tenantSlug, toast }) => {
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  useEffect(() => {
    fetchSettings();
    fetchUsers();
    fetchGrades();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API}/interventions/settings`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API}/users`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || data || []);
      }
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const fetchGrades = async () => {
    try {
      const response = await fetch(`${API}/grades`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setGrades(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement grades:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/interventions/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        toast({ title: "Succès", description: "Paramètres enregistrés" });
      } else {
        toast({ title: "Erreur", description: "Erreur de sauvegarde", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const togglePersonneRessource = (userId) => {
    const current = settings?.personnes_ressources || [];
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    setSettings({ ...settings, personnes_ressources: updated });
  };

  const toggleValidateur = (userId) => {
    const current = settings?.validateurs || [];
    const updated = current.includes(userId)
      ? current.filter(id => id !== userId)
      : [...current, userId];
    setSettings({ ...settings, validateurs: updated });
  };

  // Configuration des capteurs pour drag & drop (souris + touch)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Gestion du drag & drop des sections du template narratif
  const handleNarratifDragEnd = (event) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const currentTemplate = settings.template_narratif || [];
      const oldIndex = currentTemplate.findIndex((s, i) => (s.id || `section-${i}`) === active.id);
      const newIndex = currentTemplate.findIndex((s, i) => (s.id || `section-${i}`) === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        setSettings({
          ...settings,
          template_narratif: arrayMove(currentTemplate, oldIndex, newIndex)
        });
      }
    }
  };

  if (loading) {
    return <div className="text-center py-8">Chargement...</div>;
  }

  if (!settings) {
    return <div className="text-center py-8 text-red-600">Erreur de chargement</div>;
  }

  // Grouper les utilisateurs par rôle
  const usersByRole = {
    admin: users.filter(u => u.role === 'admin'),
    superviseur: users.filter(u => u.role === 'superviseur'),
    employe: users.filter(u => u.role === 'employe' || u.role === 'pompier'),
  };

  return (
    <div className="space-y-6">
      {/* Paramètres généraux */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ Paramètres du module</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.supervisors_can_validate}
              onChange={(e) => setSettings({ ...settings, supervisors_can_validate: e.target.checked })}
              className="w-5 h-5"
            />
            <span>Les superviseurs peuvent valider et signer les rapports</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.require_dsi_for_fire}
              onChange={(e) => setSettings({ ...settings, require_dsi_for_fire: e.target.checked })}
              className="w-5 h-5"
            />
            <span>Exiger les champs DSI complets pour les incendies</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.require_narrative}
              onChange={(e) => setSettings({ ...settings, require_narrative: e.target.checked })}
              className="w-5 h-5"
            />
            <span>Exiger un narratif avant signature</span>
          </label>

          <div>
            <label className="block text-sm font-medium mb-1">
              Seuil d'alerte temps de réponse (secondes)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={settings.alert_response_time_threshold || 480}
                onChange={(e) => setSettings({ ...settings, alert_response_time_threshold: parseInt(e.target.value) || 480 })}
                className="border border-gray-300 rounded-lg p-2 w-32"
              />
              <span className="text-sm text-gray-500">
                ({Math.floor((settings.alert_response_time_threshold || 480) / 60)} min {(settings.alert_response_time_threshold || 480) % 60} sec)
              </span>
            </div>
          </div>

          {/* Accès des employés */}
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium text-gray-700 mb-3">👥 Accès des employés</h4>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.acces_employes_historique || false}
                onChange={(e) => setSettings({ ...settings, acces_employes_historique: e.target.checked })}
                className="w-5 h-5"
              />
              <div>
                <span className="font-medium">Permettre aux employés de consulter l'historique des interventions</span>
                <p className="text-sm text-gray-500 mt-1">
                  Si activé, les employés pourront voir les cartes d'appel ET l'historique complet. 
                  Sinon, ils n'auront accès qu'aux cartes d'appel actuelles (lecture seule).
                </p>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Template du narratif */}
      <Card>
        <CardHeader className="bg-green-50">
          <CardTitle className="text-green-800">
            📝 Template du narratif
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-gray-600 mb-4">
            Définissez les sections qui apparaîtront dans tous les rapports d'intervention. 
            Glissez-déposez pour réorganiser les sections.
          </p>
          
          {/* Liste des sections du template avec drag & drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleNarratifDragEnd}
          >
            <SortableContext
              items={(settings.template_narratif || []).map((s, i) => s.id || `section-${i}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3 mb-4">
                {(settings.template_narratif || [
                  { id: 'arrivee', label: 'Arrivée sur les lieux (360)', placeholder: 'Décrivez la situation à votre arrivée...' },
                  { id: 'actions', label: 'Actions entreprises', placeholder: 'Décrivez les actions effectuées...' },
                  { id: 'observations', label: 'Observations', placeholder: 'Notez vos observations...' },
                  { id: 'conclusion', label: 'Conclusion', placeholder: 'Résumez la conclusion...' },
                ]).map((section, index) => (
                  <SortableNarratifSection key={section.id || `section-${index}`} section={section} index={index}>
                    <span className="text-gray-400 font-mono mt-2">{index + 1}.</span>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={section.label}
                        onChange={(e) => {
                          const updated = [...(settings.template_narratif || [])];
                          updated[index] = { ...section, label: e.target.value };
                          setSettings({ ...settings, template_narratif: updated });
                        }}
                        className="font-medium w-full bg-white border border-gray-200 rounded p-2"
                        placeholder="Titre de la section"
                      />
                      <input
                        type="text"
                        value={section.placeholder || ''}
                        onChange={(e) => {
                          const updated = [...(settings.template_narratif || [])];
                          updated[index] = { ...section, placeholder: e.target.value };
                          setSettings({ ...settings, template_narratif: updated });
                        }}
                        className="w-full text-sm text-gray-600 bg-white border border-gray-200 rounded p-2"
                        placeholder="Texte indicatif (placeholder)"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const updated = (settings.template_narratif || []).filter((_, i) => i !== index);
                        setSettings({ ...settings, template_narratif: updated });
                      }}
                      className="text-red-500 hover:text-red-700 p-2"
                    >
                      🗑️
                    </button>
                  </SortableNarratifSection>
                ))}
              </div>
            </SortableContext>
          </DndContext>
          
          {/* Bouton ajouter */}
          <Button
            variant="outline"
            onClick={() => {
              const currentTemplate = settings.template_narratif || [
                { id: 'arrivee', label: 'Arrivée sur les lieux (360)', placeholder: 'Décrivez la situation à votre arrivée...' },
                { id: 'actions', label: 'Actions entreprises', placeholder: 'Décrivez les actions effectuées...' },
                { id: 'observations', label: 'Observations', placeholder: 'Notez vos observations...' },
                { id: 'conclusion', label: 'Conclusion', placeholder: 'Résumez la conclusion...' },
              ];
              const newSection = {
                id: `section_${Date.now()}`,
                label: 'Nouvelle section',
                placeholder: ''
              };
              setSettings({
                ...settings,
                template_narratif: [...currentTemplate, newSection]
              });
            }}
            className="w-full"
          >
            + Ajouter une section au template
          </Button>
        </CardContent>
      </Card>

      {/* Validateurs de rapports */}
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-blue-800">
            ✅ Validateurs de rapports
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-gray-600 mb-4">
            Sélectionnez les administrateurs et superviseurs autorisés à <strong>valider et signer</strong> les rapports d'intervention.
          </p>

          <div className="space-y-6">
            {/* Administrateurs */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                <span>👑</span> Administrateurs
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {usersByRole.admin.length === 0 ? (
                  <p className="text-gray-500 italic">Aucun administrateur</p>
                ) : usersByRole.admin.map(u => (
                  <label key={u.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={(settings.validateurs || []).includes(u.id)}
                      onChange={() => toggleValidateur(u.id)}
                      className="w-5 h-5 rounded"
                    />
                    <span className="font-medium">{u.prenom} {u.nom}</span>
                    <span className="text-gray-500 text-sm">({u.email})</span>
                    {(settings.validateurs || []).includes(u.id) && (
                      <span className="ml-auto text-green-600 text-sm">✓ Validateur</span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Superviseurs */}
            {usersByRole.superviseur.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <span>⭐</span> Superviseurs
                </h4>
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  {usersByRole.superviseur.map(u => (
                    <label key={u.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={(settings.validateurs || []).includes(u.id)}
                        onChange={() => toggleValidateur(u.id)}
                        className="w-5 h-5 rounded"
                      />
                      <span className="font-medium">{u.prenom} {u.nom}</span>
                      <span className="text-gray-500 text-sm">({u.email})</span>
                      {(settings.validateurs || []).includes(u.id) && (
                        <span className="ml-auto text-green-600 text-sm">✓ Validateur</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Résumé */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>{(settings.validateurs || []).length}</strong> validateur(s) désigné(s)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Personnes ressources (accès au module) */}
      <Card>
        <CardHeader className="bg-yellow-50">
          <CardTitle className="text-yellow-800">
            👥 Personnes ressources (accès au module)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-gray-600 mb-4">
            Ces employés auront accès au module Interventions pour <strong>rédiger les rapports</strong>.
            Les administrateurs et superviseurs y ont accès automatiquement.
          </p>

          {usersByRole.employe.length > 0 ? (
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 max-h-64 overflow-y-auto">
              {usersByRole.employe.map(u => (
                <label key={u.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 p-2 rounded">
                  <input
                    type="checkbox"
                    checked={(settings.personnes_ressources || []).includes(u.id)}
                    onChange={() => togglePersonneRessource(u.id)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="font-medium">{u.prenom} {u.nom}</span>
                  <span className="text-gray-500 text-sm">({u.email})</span>
                  {(settings.personnes_ressources || []).includes(u.id) && (
                    <span className="ml-auto text-yellow-600 text-sm">✓ Accès</span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">Aucun employé/pompier dans le système</p>
          )}

          {/* Résumé - Ne compter que les employés sélectionnés */}
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>{(settings.personnes_ressources || []).filter(id => usersByRole.employe.some(u => u.id === id)).length}</strong> personne(s) ressource(s) désignée(s)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Paramètres Primes de repas */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-orange-800">
            🍽️ Primes de repas
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-gray-600 mb-4">
            Configurez les règles pour le paiement automatique des primes de repas sur les feuilles de temps.
          </p>
          
          <div className="space-y-6">
            {/* Déjeuner */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={settings.repas_dejeuner?.actif ?? false}
                  onChange={(e) => setSettings({
                    ...settings,
                    repas_dejeuner: { ...settings.repas_dejeuner, actif: e.target.checked }
                  })}
                  className="w-5 h-5"
                />
                <h4 className="font-medium text-gray-700">🌅 Déjeuner</h4>
              </div>
              {(settings.repas_dejeuner?.actif) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-8">
                  <div>
                    <label className="text-xs text-gray-500">Montant ($)</label>
                    <input
                      type="number"
                      value={settings.repas_dejeuner?.montant ?? 15}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_dejeuner: { ...settings.repas_dejeuner, montant: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure début</label>
                    <input
                      type="time"
                      value={settings.repas_dejeuner?.heure_debut ?? '06:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_dejeuner: { ...settings.repas_dejeuner, heure_debut: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure fin</label>
                    <input
                      type="time"
                      value={settings.repas_dejeuner?.heure_fin ?? '09:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_dejeuner: { ...settings.repas_dejeuner, heure_fin: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Durée min. (h)</label>
                    <input
                      type="number"
                      value={settings.repas_dejeuner?.duree_minimum ?? 2}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_dejeuner: { ...settings.repas_dejeuner, duree_minimum: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                      min="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Dîner */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={settings.repas_diner?.actif ?? false}
                  onChange={(e) => setSettings({
                    ...settings,
                    repas_diner: { ...settings.repas_diner, actif: e.target.checked }
                  })}
                  className="w-5 h-5"
                />
                <h4 className="font-medium text-gray-700">☀️ Dîner</h4>
              </div>
              {(settings.repas_diner?.actif) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-8">
                  <div>
                    <label className="text-xs text-gray-500">Montant ($)</label>
                    <input
                      type="number"
                      value={settings.repas_diner?.montant ?? 18}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_diner: { ...settings.repas_diner, montant: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure début</label>
                    <input
                      type="time"
                      value={settings.repas_diner?.heure_debut ?? '11:30'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_diner: { ...settings.repas_diner, heure_debut: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure fin</label>
                    <input
                      type="time"
                      value={settings.repas_diner?.heure_fin ?? '14:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_diner: { ...settings.repas_diner, heure_fin: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Durée min. (h)</label>
                    <input
                      type="number"
                      value={settings.repas_diner?.duree_minimum ?? 3}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_diner: { ...settings.repas_diner, duree_minimum: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                      min="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Souper */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={settings.repas_souper?.actif ?? false}
                  onChange={(e) => setSettings({
                    ...settings,
                    repas_souper: { ...settings.repas_souper, actif: e.target.checked }
                  })}
                  className="w-5 h-5"
                />
                <h4 className="font-medium text-gray-700">🌙 Souper</h4>
              </div>
              {(settings.repas_souper?.actif) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ml-8">
                  <div>
                    <label className="text-xs text-gray-500">Montant ($)</label>
                    <input
                      type="number"
                      value={settings.repas_souper?.montant ?? 20}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_souper: { ...settings.repas_souper, montant: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure début</label>
                    <input
                      type="time"
                      value={settings.repas_souper?.heure_debut ?? '17:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_souper: { ...settings.repas_souper, heure_debut: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Heure fin</label>
                    <input
                      type="time"
                      value={settings.repas_souper?.heure_fin ?? '20:00'}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_souper: { ...settings.repas_souper, heure_fin: e.target.value }
                      })}
                      className="w-full border rounded p-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Durée min. (h)</label>
                    <input
                      type="number"
                      value={settings.repas_souper?.duree_minimum ?? 3}
                      onChange={(e) => setSettings({
                        ...settings,
                        repas_souper: { ...settings.repas_souper, duree_minimum: parseFloat(e.target.value) }
                      })}
                      className="w-full border rounded p-2"
                      step="0.5"
                      min="0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facturation Entraide */}
      <Card>
        <CardHeader className="bg-purple-50">
          <CardTitle className="text-purple-800">
            💰 Facturation Entraide
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-gray-600 mb-4">
            Configurez les municipalités desservies par votre service, les ententes tarifaires, et les tarifs par défaut.
          </p>
          
          <div className="space-y-6">
            {/* 1. Municipalités couvertes par le tenant (PAS de facturation) */}
            <div className="border rounded-lg p-4 bg-blue-50">
              <h4 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                🏠 Municipalités desservies par notre service (pas de facturation)
              </h4>
              <p className="text-sm text-blue-600 mb-3">
                Ajoutez toutes les municipalités que votre service incendie couvre. Aucune facture ne sera générée pour ces municipalités.
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {(settings.municipalites_couvertes || []).map((mun, idx) => (
                  <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    {mun}
                    <button
                      onClick={() => {
                        const updated = (settings.municipalites_couvertes || []).filter((_, i) => i !== idx);
                        setSettings({ ...settings, municipalites_couvertes: updated });
                      }}
                      className="text-blue-600 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="nouvelle_mun_couverte"
                  placeholder="Nom de la municipalité"
                  className="flex-1 border rounded p-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      const newMun = e.target.value.trim();
                      if (!(settings.municipalites_couvertes || []).includes(newMun)) {
                        setSettings({
                          ...settings,
                          municipalites_couvertes: [...(settings.municipalites_couvertes || []), newMun]
                        });
                      }
                      e.target.value = '';
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById('nouvelle_mun_couverte');
                    if (input.value.trim()) {
                      const newMun = input.value.trim();
                      if (!(settings.municipalites_couvertes || []).includes(newMun)) {
                        setSettings({
                          ...settings,
                          municipalites_couvertes: [...(settings.municipalites_couvertes || []), newMun]
                        });
                      }
                      input.value = '';
                    }
                  }}
                >
                  + Ajouter
                </Button>
              </div>
            </div>

            {/* 2. Tarifs par défaut (types de véhicules) */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-3">🚒 Tarifs par défaut - Types de véhicules ($/heure)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'autopompe', label: 'Autopompe', default: 150 },
                  { key: 'citerne', label: 'Citerne', default: 125 },
                  { key: 'echelle', label: 'Échelle/Plateforme', default: 200 },
                  { key: 'vehicule_chef', label: 'Véhicule chef', default: 75 },
                  { key: 'unite_secours', label: 'Unité de secours', default: 100 },
                  { key: 'vtt_motoneige', label: 'VTT/Motoneige', default: 50 },
                  { key: 'bateau', label: 'Bateau', default: 100 },
                  { key: 'autre_vehicule', label: 'Autre véhicule', default: 100 },
                ].map(item => (
                  <div key={item.key}>
                    <label className="text-xs text-gray-500">{item.label}</label>
                    <input
                      type="number"
                      value={settings.tarifs_vehicules?.[item.key] ?? item.default}
                      onChange={(e) => setSettings({
                        ...settings,
                        tarifs_vehicules: {
                          ...settings.tarifs_vehicules,
                          [item.key]: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full border rounded p-2"
                      step="5"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Tarifs par défaut (grades personnel) - Dynamique */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-3">👥 Tarifs par défaut - Personnel ($/heure)</h4>
              {grades.length === 0 ? (
                <p className="text-gray-500 italic text-sm">Aucun grade configuré. Allez dans Paramètres → Grades pour en créer.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {grades.sort((a, b) => (a.niveau_hierarchique || 0) - (b.niveau_hierarchique || 0)).map(grade => (
                    <div key={grade.id}>
                      <label className="text-xs text-gray-500">{grade.nom}</label>
                      <input
                        type="number"
                        value={settings.tarifs_grades?.[grade.id] ?? settings.tarifs_grades?.[grade.nom] ?? 30}
                        onChange={(e) => setSettings({
                          ...settings,
                          tarifs_grades: {
                            ...settings.tarifs_grades,
                            [grade.id]: parseFloat(e.target.value) || 0
                          }
                        })}
                        className="w-full border rounded p-2"
                        step="1"
                        min="0"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Tarifs par défaut (spécialités & autres) */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-3">⭐ Tarifs par défaut - Spécialités & Autres</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  { key: 'sauvetage_hauteur', label: 'Sauvetage en hauteur ($/interv.)', default: 500 },
                  { key: 'espace_clos', label: 'Espace clos ($/interv.)', default: 500 },
                  { key: 'nautique', label: 'Sauvetage nautique ($/interv.)', default: 400 },
                  { key: 'sumi', label: 'SUMI - Mat. dangereuses ($/interv.)', default: 750 },
                  { key: 'autre_specialite', label: 'Autre spécialité ($/interv.)', default: 300 },
                  { key: 'remplissage_cylindre', label: 'Remplissage cylindre ($/unité)', default: 25 },
                  { key: 'frais_admin', label: 'Frais d\'administration ($)', default: 50 },
                ].map(item => (
                  <div key={item.key}>
                    <label className="text-xs text-gray-500">{item.label}</label>
                    <input
                      type="number"
                      value={settings.tarifs_specialites?.[item.key] ?? item.default}
                      onChange={(e) => setSettings({
                        ...settings,
                        tarifs_specialites: {
                          ...settings.tarifs_specialites,
                          [item.key]: parseFloat(e.target.value) || 0
                        }
                      })}
                      className="w-full border rounded p-2"
                      step="5"
                      min="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Ententes avec municipalités */}
            <div className="border-t pt-4">
              <h4 className="font-medium text-gray-700 mb-3">📝 Ententes d'entraide municipales</h4>
              <p className="text-sm text-gray-500 mb-4">
                Pour chaque entente, définissez la municipalité à facturer, les municipalités couvertes par cette entente, 
                les coordonnées de facturation et les tarifs spécifiques (si différents des tarifs par défaut).
              </p>
              
              <div className="space-y-4">
                {(settings.ententes_entraide || []).map((entente, index) => (
                  <div key={index} className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <label className="text-xs text-purple-600 font-medium">Municipalité à facturer</label>
                        <input
                          type="text"
                          value={entente.municipalite_facturation || ''}
                          onChange={(e) => {
                            const updated = [...(settings.ententes_entraide || [])];
                            updated[index] = { ...entente, municipalite_facturation: e.target.value };
                            setSettings({ ...settings, ententes_entraide: updated });
                          }}
                          className="font-medium text-lg border rounded p-2 w-full bg-white"
                          placeholder="Ex: Ville de Waterloo"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const updated = (settings.ententes_entraide || []).filter((_, i) => i !== index);
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="text-red-500 hover:text-red-700 ml-3 p-2"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    {/* Municipalités couvertes par cette entente */}
                    <div className="mb-4">
                      <label className="text-xs text-purple-600 font-medium">Municipalités couvertes par cette entente</label>
                      <p className="text-xs text-gray-500 mb-2">Si l'adresse de l'intervention est dans une de ces municipalités, facturer à "{entente.municipalite_facturation || '...'}"</p>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {(entente.municipalites_couvertes || []).map((mun, idx) => (
                          <span key={idx} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                            {mun}
                            <button
                              onClick={() => {
                                const updated = [...(settings.ententes_entraide || [])];
                                updated[index] = {
                                  ...entente,
                                  municipalites_couvertes: (entente.municipalites_couvertes || []).filter((_, i) => i !== idx)
                                };
                                setSettings({ ...settings, ententes_entraide: updated });
                              }}
                              className="text-purple-600 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          id={`mun_couverte_${index}`}
                          placeholder="Ajouter une municipalité"
                          className="flex-1 border rounded p-1 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value.trim()) {
                              const updated = [...(settings.ententes_entraide || [])];
                              const newMun = e.target.value.trim();
                              if (!(entente.municipalites_couvertes || []).includes(newMun)) {
                                updated[index] = {
                                  ...entente,
                                  municipalites_couvertes: [...(entente.municipalites_couvertes || []), newMun]
                                };
                                setSettings({ ...settings, ententes_entraide: updated });
                              }
                              e.target.value = '';
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            const input = document.getElementById(`mun_couverte_${index}`);
                            if (input.value.trim()) {
                              const updated = [...(settings.ententes_entraide || [])];
                              const newMun = input.value.trim();
                              if (!(entente.municipalites_couvertes || []).includes(newMun)) {
                                updated[index] = {
                                  ...entente,
                                  municipalites_couvertes: [...(entente.municipalites_couvertes || []), newMun]
                                };
                                setSettings({ ...settings, ententes_entraide: updated });
                              }
                              input.value = '';
                            }
                          }}
                          className="text-purple-600 hover:text-purple-800 text-sm px-2"
                        >
                          + Ajouter
                        </button>
                      </div>
                    </div>
                    
                    {/* Coordonnées de facturation */}
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">Contact facturation</label>
                        <input
                          type="text"
                          value={entente.contact_nom || ''}
                          onChange={(e) => {
                            const updated = [...(settings.ententes_entraide || [])];
                            updated[index] = { ...entente, contact_nom: e.target.value };
                            setSettings({ ...settings, ententes_entraide: updated });
                          }}
                          className="w-full border rounded p-2 text-sm"
                          placeholder="Nom du contact"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Courriel facturation</label>
                        <input
                          type="email"
                          value={entente.contact_email || ''}
                          onChange={(e) => {
                            const updated = [...(settings.ententes_entraide || [])];
                            updated[index] = { ...entente, contact_email: e.target.value };
                            setSettings({ ...settings, ententes_entraide: updated });
                          }}
                          className="w-full border rounded p-2 text-sm"
                          placeholder="facturation@ville.ca"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-xs text-gray-500">Adresse de facturation</label>
                        <input
                          type="text"
                          value={entente.adresse_facturation || ''}
                          onChange={(e) => {
                            const updated = [...(settings.ententes_entraide || [])];
                            updated[index] = { ...entente, adresse_facturation: e.target.value };
                            setSettings({ ...settings, ententes_entraide: updated });
                          }}
                          className="w-full border rounded p-2 text-sm"
                          placeholder="123, rue Principale, Ville, QC J0E 1X0"
                        />
                      </div>
                    </div>
                    
                    {/* Éléments facturables (ce qui est inclus dans l'entente) */}
                    <div className="mb-4">
                      <label className="text-xs text-purple-600 font-medium mb-2 block">Éléments à facturer selon cette entente</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { key: 'facturer_vehicules', label: '🚒 Véhicules', default: true },
                          { key: 'facturer_personnel', label: '👥 Personnel', default: true },
                          { key: 'facturer_cylindres', label: '🫁 Cylindres', default: true },
                          { key: 'facturer_consommables', label: '🧰 Consommables', default: true },
                          { key: 'facturer_specialites', label: '⭐ Spécialités', default: true },
                          { key: 'facturer_frais_admin', label: '📋 Frais admin', default: true },
                        ].map(item => (
                          <label key={item.key} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={entente[item.key] ?? item.default}
                              onChange={(e) => {
                                const updated = [...(settings.ententes_entraide || [])];
                                updated[index] = { ...entente, [item.key]: e.target.checked };
                                setSettings({ ...settings, ententes_entraide: updated });
                              }}
                              className="w-4 h-4"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </div>
                    
                    {/* Tarifs spécifiques (accordéon) */}
                    <details className="bg-white rounded p-3">
                      <summary className="cursor-pointer text-sm font-medium text-purple-700">
                        ⚙️ Tarifs spécifiques à cette entente (optionnel - laisser vide pour utiliser les tarifs par défaut)
                      </summary>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Autopompe ($/h)</label>
                          <input
                            type="number"
                            value={entente.tarifs?.autopompe || ''}
                            onChange={(e) => {
                              const updated = [...(settings.ententes_entraide || [])];
                              updated[index] = { 
                                ...entente, 
                                tarifs: { ...entente.tarifs, autopompe: e.target.value ? parseFloat(e.target.value) : null }
                              };
                              setSettings({ ...settings, ententes_entraide: updated });
                            }}
                            className="w-full border rounded p-1 text-sm"
                            placeholder="Défaut"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Citerne ($/h)</label>
                          <input
                            type="number"
                            value={entente.tarifs?.citerne || ''}
                            onChange={(e) => {
                              const updated = [...(settings.ententes_entraide || [])];
                              updated[index] = { 
                                ...entente, 
                                tarifs: { ...entente.tarifs, citerne: e.target.value ? parseFloat(e.target.value) : null }
                              };
                              setSettings({ ...settings, ententes_entraide: updated });
                            }}
                            className="w-full border rounded p-1 text-sm"
                            placeholder="Défaut"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Pompier ($/h)</label>
                          <input
                            type="number"
                            value={entente.tarifs?.pompier || ''}
                            onChange={(e) => {
                              const updated = [...(settings.ententes_entraide || [])];
                              updated[index] = { 
                                ...entente, 
                                tarifs: { ...entente.tarifs, pompier: e.target.value ? parseFloat(e.target.value) : null }
                              };
                              setSettings({ ...settings, ententes_entraide: updated });
                            }}
                            className="w-full border rounded p-1 text-sm"
                            placeholder="Défaut"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Remplissage cylindre ($)</label>
                          <input
                            type="number"
                            value={entente.tarifs?.remplissage_cylindre || ''}
                            onChange={(e) => {
                              const updated = [...(settings.ententes_entraide || [])];
                              updated[index] = { 
                                ...entente, 
                                tarifs: { ...entente.tarifs, remplissage_cylindre: e.target.value ? parseFloat(e.target.value) : null }
                              };
                              setSettings({ ...settings, ententes_entraide: updated });
                            }}
                            className="w-full border rounded p-1 text-sm"
                            placeholder="Défaut"
                          />
                        </div>
                      </div>
                    </details>
                    
                    {/* Notes */}
                    <div className="mt-3">
                      <label className="text-xs text-gray-500">Notes sur l'entente</label>
                      <textarea
                        value={entente.notes || ''}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, notes: e.target.value };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-full border rounded p-2 text-sm"
                        rows="2"
                        placeholder="Conditions particulières, dates de validité, etc."
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  const nouvelle = {
                    municipalite_facturation: '',
                    municipalites_couvertes: [],
                    contact_nom: '',
                    contact_email: '',
                    adresse_facturation: '',
                    facturer_vehicules: true,
                    facturer_personnel: true,
                    facturer_cylindres: true,
                    facturer_consommables: true,
                    facturer_specialites: true,
                    facturer_frais_admin: true,
                    tarifs: {},
                    notes: ''
                  };
                  setSettings({
                    ...settings,
                    ententes_entraide: [...(settings.ententes_entraide || []), nouvelle]
                  });
                }}
                className="w-full mt-4"
              >
                + Ajouter une nouvelle entente d'entraide
              </Button>
            </div>

            {/* Numérotation des factures */}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-gray-700 mb-3">🔢 Numérotation des factures</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Préfixe (année)</label>
                  <input
                    type="text"
                    value={settings.facture_prefixe ?? new Date().getFullYear().toString()}
                    onChange={(e) => setSettings({ ...settings, facture_prefixe: e.target.value })}
                    className="w-full border rounded p-2"
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Prochain numéro</label>
                  <input
                    type="number"
                    value={settings.facture_prochain_numero ?? 1}
                    onChange={(e) => setSettings({ ...settings, facture_prochain_numero: parseInt(e.target.value) || 1 })}
                    className="w-full border rounded p-2"
                    min="1"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Prochaine facture: <strong>{settings.facture_prefixe || new Date().getFullYear()}-{String(settings.facture_prochain_numero || 1).padStart(3, '0')}</strong>
              </p>
            </div>
            
            <div className="p-3 bg-purple-50 rounded-lg text-sm">
              <p className="text-purple-800">
                <strong>💡 Logique de facturation :</strong><br/>
                1. Si la municipalité de l'intervention est dans "Municipalités desservies" → Pas de facture<br/>
                2. Si la municipalité est couverte par une entente → Facturer selon les termes de l'entente<br/>
                3. Sinon → Facturer tout selon les tarifs par défaut
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
        {saving ? '⏳ Enregistrement...' : '💾 Enregistrer les paramètres'}
      </Button>
    </div>
  );
};


export default GestionInterventions;
