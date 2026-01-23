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
  
  // Les employés ont accès en lecture seule aux cartes d'appel
  // L'accès à l'historique dépend du paramètre acces_employes_historique
  const employeeCanAccessHistory = settings?.acces_employes_historique || false;
  
  // Mode lecture seule pour les employés (sauf s'ils sont personnes ressources)
  const isReadOnlyMode = isEmployee && !isDesignatedPerson;

  const tabs = [
    { id: 'rapports', label: 'Rapports d\'intervention', icon: '📋' },
    { id: 'historique', label: 'Historique', icon: '📚', hideForEmployee: !employeeCanAccessHistory },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', adminOnly: true },
  ];

  // Filtrer les onglets selon le rôle
  const visibleTabs = tabs.filter(tab => {
    if (tab.adminOnly && !isAdmin) return false;
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
    natures: [], causes: [], sources_chaleur: [], materiaux: [], categories_batiment: [] 
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


// ==================== SECTION RESSOURCES ====================

const SectionRessources = ({ vehicles, resources, formData, setFormData, editMode, tenantSlug, interventionId, onRefresh }) => {
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddPersonnel, setShowAddPersonnel] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [users, setUsers] = useState([]);
  const [tenantVehicles, setTenantVehicles] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ number: '', crew_count: '' });
  const [selectedPersonnel, setSelectedPersonnel] = useState([]);
  const [searchPersonnel, setSearchPersonnel] = useState('');
  const [gardeInterneUsers, setGardeInterneUsers] = useState([]);
  const [equipesGarde, setEquipesGarde] = useState([]);
  const [showImportEquipe, setShowImportEquipe] = useState(false);
  const [primeRepasGlobale, setPrimeRepasGlobale] = useState(formData.prime_repas_globale ?? false);
  
  // Statuts de présence disponibles avec leur impact sur les statistiques
  const statutsPresence = [
    { value: 'present', label: 'Présent', color: 'bg-green-100 text-green-800', impact: '+1' },
    { value: 'absent_non_paye', label: 'Absent (non-payé)', color: 'bg-red-100 text-red-800', impact: '-1' },
    { value: 'absent_paye', label: 'Absent (payé/maladie)', color: 'bg-orange-100 text-orange-800', impact: '0' },
    { value: 'remplace', label: 'Remplacé par...', color: 'bg-yellow-100 text-yellow-800', impact: '0' },
    { value: 'rappele', label: 'Rappelé', color: 'bg-blue-100 text-blue-800', impact: '+1' },
    { value: 'non_disponible', label: 'Non-disponible', color: 'bg-gray-100 text-gray-800', impact: '-1' }
  ];
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };
  
  // Véhicules manuels ajoutés localement
  const [manualVehicles, setManualVehicles] = useState(formData.manual_vehicles || []);
  const [manualPersonnel, setManualPersonnel] = useState(formData.manual_personnel || []);
  
  // Charger les équipes de garde
  const loadEquipesGarde = async () => {
    try {
      const dateIntervention = formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0];
      const response = await fetch(`${API}/interventions/equipes-garde?date=${dateIntervention}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEquipesGarde(data.equipes || []);
      }
    } catch (error) {
      console.error('Erreur chargement équipes:', error);
    }
  };
  
  // Importer une équipe complète
  const importerEquipe = (equipe) => {
    const membresAImporter = equipe.membres.map(m => ({
      id: m.id,
      nom: m.nom,
      prenom: m.prenom,
      grade: m.grade,
      type_emploi: m.type_emploi,
      statut_presence: 'present',
      prime_repas: true,
      equipe_origine: equipe.equipe_nom
    }));
    
    // Fusionner avec le personnel existant (éviter les doublons)
    const personnelExistant = manualPersonnel.map(p => p.id);
    const nouveauxMembres = membresAImporter.filter(m => !personnelExistant.includes(m.id));
    
    const updated = [...manualPersonnel, ...nouveauxMembres];
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
    setShowImportEquipe(false);
  };
  
  // Mettre à jour le statut de présence d'un membre
  const updateStatutPresence = (personnelId, statut, remplacePar = null) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, statut_presence: statut, remplace_par: remplacePar } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour le remplaçant et son statut payé
  const updateRemplacant = (personnelId, remplacantId) => {
    const remplacant = users.find(u => u.id === remplacantId);
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { 
        ...p, 
        remplace_par: remplacantId,
        remplace_par_nom: remplacant ? `${remplacant.prenom} ${remplacant.nom}` : null,
        remplacant_paye: true // Par défaut payé
      } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour le statut payé du remplaçant
  const updateRemplacantPaye = (personnelId, paye) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, remplacant_paye: paye } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour la prime de repas d'un membre
  const updatePrimeRepas = (personnelId, checked) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, prime_repas: checked } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Mettre à jour si l'employé est utilisé en fonction supérieure
  const updateFonctionSuperieure = (personnelId, checked) => {
    const updated = manualPersonnel.map(p => 
      p.id === personnelId ? { ...p, utilise_fonction_superieure: checked } : p
    );
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Appliquer/retirer la prime de repas globale
  const togglePrimeRepasGlobale = (checked) => {
    setPrimeRepasGlobale(checked);
    const updated = manualPersonnel.map(p => ({ ...p, prime_repas: checked }));
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated, prime_repas_globale: checked });
  };
  
  // Charger la liste des utilisateurs et le planning
  const loadUsers = async () => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    try {
      const [usersResponse, planningResponse] = await Promise.all([
        fetch(`${API}/users`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
        fetch(`${API}/plannings?date=${formData.xml_time_call_received?.split('T')[0] || new Date().toISOString().split('T')[0]}`, { 
          headers: { 'Authorization': `Bearer ${getToken()}` } 
        }).catch(() => ({ ok: false }))
      ]);
      
      if (usersResponse.ok) {
        const data = await usersResponse.json();
        setUsers(data.users || data || []);
      }
      
      // Récupérer le personnel en garde interne
      if (planningResponse.ok) {
        const planningData = await planningResponse.json();
        const gardeInterne = (planningData.affectations || [])
          .filter(a => a.type_affectation === 'garde_interne' || a.type === 'garde_interne')
          .map(a => ({ id: a.user_id, ...a }));
        setGardeInterneUsers(gardeInterne);
        // Pré-sélectionner le personnel en garde
        if (gardeInterne.length > 0 && selectedPersonnel.length === 0) {
          setSelectedPersonnel(gardeInterne.map(g => g.id));
        }
      }
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoadingUsers(false);
    }
  };
  
  // Charger les véhicules du tenant (depuis Gestion des Actifs)
  const loadTenantVehicles = async () => {
    try {
      const response = await fetch(`${API}/actifs/vehicules`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTenantVehicles(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement véhicules:', error);
    }
  };
  
  const openAddPersonnel = (vehicle = null) => {
    setSelectedVehicle(vehicle);
    loadUsers();
    setSelectedPersonnel([]);
    setSearchPersonnel('');
    setShowAddPersonnel(true);
  };
  
  const addVehicle = () => {
    if (!newVehicle.number) return;
    const vehicle = {
      id: `manual_${Date.now()}`,
      xml_vehicle_number: newVehicle.number,
      crew_count: parseInt(newVehicle.crew_count) || 0,
      is_manual: true
    };
    const updated = [...manualVehicles, vehicle];
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
    setNewVehicle({ number: '', crew_count: '' });
    setShowAddVehicle(false);
  };
  
  const removeVehicle = (vehicleId) => {
    const updated = manualVehicles.filter(v => v.id !== vehicleId);
    setManualVehicles(updated);
    setFormData({ ...formData, manual_vehicles: updated });
  };
  
  const addPersonnelToVehicle = () => {
    if (selectedPersonnel.length === 0) return;
    
    const newPersonnel = selectedPersonnel.map(userId => {
      const user = users.find(u => u.id === userId);
      return {
        id: `manual_${Date.now()}_${userId}`,
        user_id: userId,
        user_name: user ? `${user.prenom} ${user.nom}` : userId,
        vehicle_number: selectedVehicle?.xml_vehicle_number || null,
        role_on_scene: 'Pompier',
        is_manual: true
      };
    });
    
    const updated = [...manualPersonnel, ...newPersonnel];
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
    setShowAddPersonnel(false);
    setSelectedPersonnel([]);
    setSearchPersonnel('');
  };
  
  const removePersonnel = (personnelId) => {
    const updated = manualPersonnel.filter(p => p.id !== personnelId);
    setManualPersonnel(updated);
    setFormData({ ...formData, manual_personnel: updated });
  };
  
  // Combiner véhicules XML et manuels
  const allVehicles = [...vehicles, ...manualVehicles];
  const allPersonnel = [...resources, ...manualPersonnel];
  
  // Obtenir le personnel assigné à un véhicule
  const getVehiclePersonnel = (vehicleNumber) => {
    return allPersonnel.filter(r => r.vehicle_number === vehicleNumber);
  };
  
  // Personnel supplémentaire
  const personnelSansVehicule = allPersonnel.filter(r => !r.vehicle_number);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800 flex justify-between items-center">
            <span>🚒 Véhicules déployés ({allVehicles.length})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => { loadTenantVehicles(); setShowAddVehicle(true); }}>
                + Ajouter véhicule
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allVehicles.length === 0 ? (
            <p className="text-gray-500">Aucun véhicule enregistré</p>
          ) : (
            <div className="space-y-4">
              {allVehicles.map(vehicle => {
                const personnel = getVehiclePersonnel(vehicle.xml_vehicle_number);
                return (
                  <div key={vehicle.id} className={`p-4 rounded-lg border ${vehicle.is_manual ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-xl flex items-center gap-2">
                          {vehicle.xml_vehicle_number}
                          {vehicle.is_manual && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded">Manuel</span>}
                        </div>
                        <div className="text-sm text-gray-600">
                          👥 {vehicle.crew_count || 0} pompier(s) {!vehicle.is_manual && 'selon la centrale'}
                        </div>
                        {vehicle.xml_status && (
                          <div className="text-xs text-gray-500">Statut: {vehicle.xml_status}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {editMode && (
                          <Button size="sm" variant="outline" onClick={() => openAddPersonnel(vehicle)}>
                            + Personnel
                          </Button>
                        )}
                        {editMode && vehicle.is_manual && (
                          <Button size="sm" variant="destructive" onClick={() => removeVehicle(vehicle.id)}>
                            🗑️
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {/* Personnel assigné */}
                    {personnel.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-2">Personnel assigné:</p>
                        <div className="flex flex-wrap gap-2">
                          {personnel.map(p => {
                            const employeData = users.find(u => u.id === p.id || u.id === p.user_id);
                            const estEligibleFonctionSup = employeData?.fonction_superieur === true || p.fonction_superieur === true;
                            
                            return (
                              <span key={p.id} className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${p.is_manual ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                {p.user_name || p.user_id}
                                {p.role_on_scene && <span className="opacity-75">({p.role_on_scene})</span>}
                                {p.utilise_fonction_superieure && <span className="text-orange-600 font-bold ml-1">⬆️</span>}
                                {editMode && estEligibleFonctionSup && (
                                  <label className="ml-1" title="Fonction supérieure">
                                    <input
                                      type="checkbox"
                                      checked={p.utilise_fonction_superieure ?? false}
                                      onChange={(e) => updateFonctionSuperieure(p.id, e.target.checked)}
                                      className="w-3 h-3"
                                    />
                                  </label>
                                )}
                                {editMode && p.is_manual && (
                                  <button onClick={() => removePersonnel(p.id)} className="ml-1 text-red-500 hover:text-red-700">×</button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personnel supplémentaire */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800 flex justify-between items-center">
            <span>🚶 Personnel supplémentaire ({personnelSansVehicule.length})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => openAddPersonnel(null)}>
                + Ajouter
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Bouton Import équipe de garde */}
          {editMode && (
            <div className="mb-4 flex gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => { loadEquipesGarde(); setShowImportEquipe(true); }}
                className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                📋 Importer équipe de garde
              </Button>
              <label className="flex items-center gap-2 ml-auto">
                <input
                  type="checkbox"
                  checked={primeRepasGlobale}
                  onChange={(e) => togglePrimeRepasGlobale(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">🍽️ Prime de repas pour tous</span>
              </label>
            </div>
          )}
          
          {personnelSansVehicule.length === 0 ? (
            <p className="text-gray-500 text-sm">Ajouter du personnel</p>
          ) : (
            <div className="space-y-2">
              {personnelSansVehicule.map(p => {
                const statut = statutsPresence.find(s => s.value === (p.statut_presence || 'present'));
                // Vérifier si l'employé est éligible à la fonction supérieure
                const employeData = users.find(u => u.id === p.id || u.id === p.user_id);
                const estEligibleFonctionSup = employeData?.fonction_superieur === true || p.fonction_superieur === true;
                
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded border flex-wrap">
                    <span className="font-medium flex-1 min-w-[150px]">
                      {p.user_name || p.prenom + ' ' + p.nom || p.user_id}
                      {p.grade && <span className="text-gray-500 text-sm ml-1">({p.grade})</span>}
                      {p.equipe_origine && <span className="text-purple-600 text-xs ml-2">[{p.equipe_origine}]</span>}
                      {p.utilise_fonction_superieure && <span className="text-orange-600 text-xs ml-2 font-bold">⬆️ Fct.Sup.</span>}
                    </span>
                    {editMode ? (
                      <>
                        <select
                          value={p.statut_presence || 'present'}
                          onChange={(e) => updateStatutPresence(p.id, e.target.value)}
                          className={`text-xs rounded px-2 py-1 border ${statut?.color || ''}`}
                        >
                          {statutsPresence.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {/* Sélecteur de remplaçant si statut = remplacé */}
                        {p.statut_presence === 'remplace' && (
                          <>
                            <select
                              value={p.remplace_par || ''}
                              onChange={(e) => updateRemplacant(p.id, e.target.value)}
                              className="text-xs rounded px-2 py-1 border bg-yellow-50"
                            >
                              <option value="">-- Choisir remplaçant --</option>
                              {users
                                .filter(u => (u.statut || '').toLowerCase() === 'actif' && u.id !== p.id)
                                .map(u => (
                                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                                ))
                              }
                            </select>
                            {p.remplace_par && (
                              <label className="flex items-center gap-1 text-xs bg-green-50 px-2 py-1 rounded border border-green-200">
                                <input
                                  type="checkbox"
                                  checked={p.remplacant_paye ?? true}
                                  onChange={(e) => updateRemplacantPaye(p.id, e.target.checked)}
                                  className="w-3 h-3"
                                />
                                <span>Payé</span>
                              </label>
                            )}
                          </>
                        )}
                        {/* Case à cocher Fonction Supérieure si éligible */}
                        {estEligibleFonctionSup && (
                          <label className="flex items-center gap-1 text-xs bg-orange-50 px-2 py-1 rounded border border-orange-200" title="Utilisé en fonction supérieure (payé comme Lieutenant)">
                            <input
                              type="checkbox"
                              checked={p.utilise_fonction_superieure ?? false}
                              onChange={(e) => updateFonctionSuperieure(p.id, e.target.checked)}
                              className="w-3 h-3"
                            />
                            <span className="text-orange-700">⬆️ Fct.Sup.</span>
                          </label>
                        )}
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={p.prime_repas ?? true}
                            onChange={(e) => updatePrimeRepas(p.id, e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs">🍽️</span>
                        </label>
                        {p.is_manual && (
                          <button onClick={() => removePersonnel(p.id)} className="text-red-500 hover:text-red-700">×</button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className={`text-xs px-2 py-1 rounded ${statut?.color || 'bg-gray-100'}`}>
                          {statut?.label || 'Présent'}
                          {p.statut_presence === 'remplace' && p.remplace_par_nom && (
                            <span className="ml-1">→ {p.remplace_par_nom}</span>
                          )}
                        </span>
                        {p.utilise_fonction_superieure && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">⬆️ Fct.Sup.</span>}
                        {(p.prime_repas ?? true) && <span className="text-xs">🍽️</span>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">👥 Récapitulatif du personnel ({allPersonnel.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {allPersonnel.length === 0 ? (
            <p className="text-gray-500">Aucune ressource humaine enregistrée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Véhicule</th>
                    <th className="p-2 text-left">Statut</th>
                    <th className="p-2 text-left">Remplaçant</th>
                    <th className="p-2 text-left">Primes repas</th>
                    <th className="p-2 text-left">Source</th>
                    {editMode && <th className="p-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {allPersonnel.map(resource => {
                    const statut = statutsPresence.find(s => s.value === (resource.statut_presence || 'present'));
                    return (
                      <tr key={resource.id} className="border-b">
                        <td className="p-2 font-medium">
                          {resource.user_name || resource.prenom + ' ' + resource.nom || resource.user_id || 'Non assigné'}
                          {resource.grade && <span className="text-gray-500 text-xs ml-1">({resource.grade})</span>}
                        </td>
                        <td className="p-2">{resource.vehicle_number || <span className="text-orange-600">Supplémentaire</span>}</td>
                        <td className="p-2">
                          {editMode ? (
                            <select
                              value={resource.statut_presence || 'present'}
                              onChange={(e) => updateStatutPresence(resource.id, e.target.value)}
                              className={`text-xs rounded px-2 py-1 border ${statut?.color || ''}`}
                            >
                              {statutsPresence.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-1 rounded text-xs ${statut?.color || 'bg-gray-100'}`}>
                              {statut?.label || 'Présent'}
                            </span>
                          )}
                        </td>
                        <td className="p-2">
                          {resource.statut_presence === 'remplace' ? (
                            editMode ? (
                              <select
                                value={resource.remplace_par || ''}
                                onChange={(e) => updateRemplacant(resource.id, e.target.value)}
                                className="text-xs rounded px-2 py-1 border bg-yellow-50 w-full"
                              >
                                <option value="">-- Choisir --</option>
                                {users
                                  .filter(u => (u.statut || '').toLowerCase() === 'actif' && u.id !== resource.id)
                                  .map(u => (
                                    <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                                  ))
                                }
                              </select>
                            ) : (
                              <span className="text-yellow-700 text-xs">{resource.remplace_par_nom || '-'}</span>
                            )
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="p-2">
                          {editMode ? (
                            <div className="flex gap-1 flex-wrap">
                              <label className="flex items-center gap-1 text-xs bg-orange-50 px-2 py-1 rounded cursor-pointer" title="Déjeuner">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_dejeuner ?? false}
                                  onChange={(e) => {
                                    const updated = allPersonnel.map(p => 
                                      p.id === resource.id ? { ...p, prime_dejeuner: e.target.checked } : p
                                    );
                                    setFormData({ ...formData, personnel_present: updated });
                                  }}
                                  className="w-3 h-3"
                                />
                                <span>🌅</span>
                              </label>
                              <label className="flex items-center gap-1 text-xs bg-yellow-50 px-2 py-1 rounded cursor-pointer" title="Dîner">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_diner ?? false}
                                  onChange={(e) => {
                                    const updated = allPersonnel.map(p => 
                                      p.id === resource.id ? { ...p, prime_diner: e.target.checked } : p
                                    );
                                    setFormData({ ...formData, personnel_present: updated });
                                  }}
                                  className="w-3 h-3"
                                />
                                <span>☀️</span>
                              </label>
                              <label className="flex items-center gap-1 text-xs bg-indigo-50 px-2 py-1 rounded cursor-pointer" title="Souper">
                                <input
                                  type="checkbox"
                                  checked={resource.prime_souper ?? false}
                                  onChange={(e) => {
                                    const updated = allPersonnel.map(p => 
                                      p.id === resource.id ? { ...p, prime_souper: e.target.checked } : p
                                    );
                                    setFormData({ ...formData, personnel_present: updated });
                                  }}
                                  className="w-3 h-3"
                                />
                                <span>🌙</span>
                              </label>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {resource.prime_dejeuner && <span title="Déjeuner" className="text-xs bg-orange-100 px-1 rounded">🌅</span>}
                              {resource.prime_diner && <span title="Dîner" className="text-xs bg-yellow-100 px-1 rounded">☀️</span>}
                              {resource.prime_souper && <span title="Souper" className="text-xs bg-indigo-100 px-1 rounded">🌙</span>}
                              {!resource.prime_dejeuner && !resource.prime_diner && !resource.prime_souper && <span className="text-gray-400">-</span>}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs ${resource.is_manual ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {resource.is_manual ? 'Manuel' : 'XML'}
                          </span>
                        </td>
                        {editMode && (
                          <td className="p-2">
                            {resource.is_manual && (
                              <button onClick={() => removePersonnel(resource.id)} className="text-red-500 hover:text-red-700">🗑️</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Import Équipe de garde */}
      {showImportEquipe && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-lg font-bold mb-4">📋 Importer équipe de garde</h3>
            
            {equipesGarde.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                Aucune équipe de garde trouvée pour cette date.<br/>
                <span className="text-sm">Vérifiez les paramètres d'équipes dans le module Planning.</span>
              </p>
            ) : (
              <div className="space-y-3">
                {equipesGarde.map(equipe => (
                  <div key={equipe.type_emploi} className="border rounded-lg p-4" style={{ borderColor: equipe.couleur }}>
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <span className="font-bold" style={{ color: equipe.couleur }}>{equipe.equipe_nom}</span>
                        <span className="text-gray-500 text-sm ml-2">
                          ({equipe.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'})
                        </span>
                      </div>
                      <Button size="sm" onClick={() => importerEquipe(equipe)}>
                        Importer ({equipe.membres.length})
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {equipe.membres.map(m => (
                        <span key={m.id} className="bg-gray-100 px-2 py-1 rounded text-xs">
                          {m.prenom} {m.nom} {m.grade && `(${m.grade})`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setShowImportEquipe(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Modal Ajout Véhicule */}
      {showAddVehicle && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">🚒 Ajouter un véhicule</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Sélectionner un véhicule du tenant *</label>
                <select 
                  value={newVehicle.number}
                  onChange={(e) => {
                    const v = tenantVehicles.find(tv => (tv.numero || tv.nom) === e.target.value);
                    setNewVehicle({ 
                      number: e.target.value, 
                      crew_count: v?.capacite || '' 
                    });
                  }}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner un véhicule --</option>
                  {tenantVehicles.map(v => (
                    <option key={v.id} value={v.numero || v.nom}>
                      {v.numero || v.nom} {v.type ? `(${v.type})` : ''}
                    </option>
                  ))}
                </select>
                {tenantVehicles.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">Aucun véhicule trouvé. Ajoutez des véhicules dans Gestion des Actifs.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de pompiers</label>
                <input
                  type="number"
                  value={newVehicle.crew_count}
                  onChange={(e) => setNewVehicle({ ...newVehicle, crew_count: e.target.value })}
                  className="w-full border rounded p-2"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowAddVehicle(false)} className="flex-1">
                Annuler
              </Button>
              <Button onClick={addVehicle} disabled={!newVehicle.number} className="flex-1">
                Ajouter
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Modal Ajout Personnel */}
      {showAddPersonnel && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold mb-4">
              👥 {selectedVehicle ? `Ajouter personnel au véhicule ${selectedVehicle.xml_vehicle_number}` : 'Ajouter du personnel'}
            </h3>
            
            {/* Barre de recherche */}
            <div className="mb-3">
              <input
                type="text"
                placeholder="🔍 Rechercher par nom..."
                value={searchPersonnel}
                onChange={(e) => setSearchPersonnel(e.target.value)}
                className="w-full border rounded-lg p-2"
              />
            </div>
            
            {/* Info garde interne */}
            {gardeInterneUsers.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3 text-sm text-blue-800">
                ℹ️ {gardeInterneUsers.length} personne(s) en garde interne pré-sélectionnée(s)
              </div>
            )}
            
            {loadingUsers ? (
              <p>Chargement...</p>
            ) : (
              <div className="space-y-1 overflow-y-auto flex-1" style={{ maxHeight: '300px' }}>
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Aucun utilisateur trouvé</p>
                ) : users
                  .filter(u => (u.statut || '').toLowerCase() === 'actif')
                  .filter(u => {
                    if (!searchPersonnel) return true;
                    const search = searchPersonnel.toLowerCase();
                    return `${u.prenom} ${u.nom}`.toLowerCase().includes(search);
                  })
                  .map(user => {
                    const isGardeInterne = gardeInterneUsers.some(g => g.id === user.id);
                    return (
                      <label key={user.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isGardeInterne ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <input 
                          type="checkbox"
                          checked={selectedPersonnel.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPersonnel([...selectedPersonnel, user.id]);
                            } else {
                              setSelectedPersonnel(selectedPersonnel.filter(id => id !== user.id));
                            }
                          }}
                          className="w-4 h-4" 
                        />
                        <span className="flex-1">{user.prenom} {user.nom}</span>
                        <span className="text-gray-500 text-sm">({user.grade || user.grade_nom || 'Pompier'})</span>
                        {isGardeInterne && <span className="text-xs bg-blue-200 text-blue-800 px-1 rounded">Garde</span>}
                      </label>
                    );
                  })}
              </div>
            )}
            <div className="flex gap-2 mt-4 pt-3 border-t">
              <Button variant="outline" onClick={() => { setShowAddPersonnel(false); setSearchPersonnel(''); }} className="flex-1">
                Annuler
              </Button>
              <Button onClick={addPersonnelToVehicle} disabled={selectedPersonnel.length === 0} className="flex-1">
                Ajouter ({selectedPersonnel.length})
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


// ==================== SECTION DSI (Détails de l'incendie) ====================

const SectionDSI = ({ formData, setFormData, editMode, referenceData }) => {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
        <p className="text-red-800 font-medium">
          🔥 Section obligatoire pour les incendies selon les standards MSP
        </p>
      </div>

      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg text-red-800">Détails de l'incendie</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cause probable * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.cause_id || ''}
                onChange={(e) => setFormData({ ...formData, cause_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.cause_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {referenceData.causes.map(cause => (
                  <option key={cause.id} value={cause.id}>
                    {cause.code} - {cause.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source de chaleur (Ignition) * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.source_heat_id || ''}
                onChange={(e) => setFormData({ ...formData, source_heat_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.source_heat_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {referenceData.sources_chaleur.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.code} - {source.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Matériau premier enflammé * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.material_first_ignited_id || ''}
                onChange={(e) => setFormData({ ...formData, material_first_ignited_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.material_first_ignited_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.materiaux || []).map(mat => (
                  <option key={mat.id} value={mat.id}>
                    {mat.code} - {mat.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Objet/Pièce d'origine
              </label>
              <input
                type="text"
                value={formData.fire_origin_location || ''}
                onChange={(e) => setFormData({ ...formData, fire_origin_location: e.target.value })}
                disabled={!editMode}
                placeholder="ex: Cuisine, Chambre à coucher"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Propagation du feu
              </label>
              <select
                value={formData.fire_spread || ''}
                onChange={(e) => setFormData({ ...formData, fire_spread: e.target.value })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                <option value="object">Confiné à l'objet d'origine</option>
                <option value="room">Confiné à la pièce d'origine</option>
                <option value="floor">Propagé à l'étage</option>
                <option value="building">Propagé au bâtiment entier</option>
                <option value="neighbor">Propagé aux bâtiments voisins</option>
              </select>
            </div>
          </div>

          {/* Justification si cause indéterminée */}
          {formData.cause_id && referenceData.causes.find(c => c.id === formData.cause_id)?.libelle?.toLowerCase().includes('indéterminée') && (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                ⚠️ Justification requise (cause indéterminée)
              </label>
              <textarea
                value={formData.cause_indeterminee_justification || ''}
                onChange={(e) => setFormData({ ...formData, cause_indeterminee_justification: e.target.value })}
                disabled={!editMode}
                placeholder="Expliquez pourquoi la cause n'a pu être déterminée..."
                className="w-full border border-yellow-300 rounded-lg p-2 min-h-[80px]"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


// ==================== SECTION PROTECTION INCENDIE ====================

const SectionProtection = ({ formData, setFormData, editMode }) => {
  return (
    <div className="space-y-6">
      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
        <p className="text-orange-800 font-medium">
          🚨 Ces données sont essentielles pour les statistiques du MSP et les campagnes de prévention
        </p>
      </div>

      {/* Avertisseur de fumée */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">🔔 Avertisseur de fumée</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Présence * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.smoke_detector_presence || ''}
                onChange={(e) => setFormData({ ...formData, smoke_detector_presence: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.smoke_detector_presence ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
                <option value="unknown">Indéterminé</option>
              </select>
            </div>

            {formData.smoke_detector_presence === 'yes' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fonctionnement
                  </label>
                  <select
                    value={formData.smoke_detector_functional || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_functional: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="worked">A fonctionné</option>
                    <option value="not_worked">N'a pas fonctionné</option>
                    <option value="unknown">Indéterminé</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type d'avertisseur
                  </label>
                  <select
                    value={formData.smoke_detector_type || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_type: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="battery">À pile</option>
                    <option value="electric">Électrique</option>
                    <option value="central">Relié à une centrale</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Impact sur l'évacuation
                  </label>
                  <select
                    value={formData.smoke_detector_impact || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_impact: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="helped">A permis l'évacuation</option>
                    <option value="no_impact">N'a pas été un facteur</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gicleurs */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">💧 Système de gicleurs</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Présence
              </label>
              <select
                value={formData.sprinkler_present ? 'yes' : formData.sprinkler_present === false ? 'no' : ''}
                onChange={(e) => setFormData({ ...formData, sprinkler_present: e.target.value === 'yes' })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </div>

            {formData.sprinkler_present && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fonctionnement
                </label>
                <select
                  value={formData.sprinkler_functional ? 'yes' : formData.sprinkler_functional === false ? 'no' : ''}
                  onChange={(e) => setFormData({ ...formData, sprinkler_functional: e.target.value === 'yes' })}
                  disabled={!editMode}
                  className="w-full border border-gray-300 rounded-lg p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="yes">A fonctionné</option>
                  <option value="no">N'a pas fonctionné</option>
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


// ==================== SECTION MATÉRIEL UTILISÉ ====================

const SectionMateriel = ({ formData, setFormData, editMode, tenantSlug, getToken }) => {
  const [materielDisponible, setMaterielDisponible] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddMateriel, setShowAddMateriel] = useState(false);
  const [searchMateriel, setSearchMateriel] = useState('');
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Matériel utilisé dans cette intervention
  const materielUtilise = formData.materiel_utilise || [];
  
  // Charger le matériel disponible depuis Gestion des Actifs
  const loadMaterielDisponible = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/actifs/materiels`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMaterielDisponible(data || []);
      }
    } catch (error) {
      console.error('Erreur chargement matériel:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (showAddMateriel && materielDisponible.length === 0) {
      loadMaterielDisponible();
    }
  }, [showAddMateriel]);
  
  // Ajouter du matériel
  const ajouterMateriel = (materiel) => {
    const existing = materielUtilise.find(m => m.id === materiel.id);
    if (existing) {
      // Incrémenter la quantité
      const updated = materielUtilise.map(m => 
        m.id === materiel.id ? { ...m, quantite: (m.quantite || 1) + 1 } : m
      );
      setFormData({ ...formData, materiel_utilise: updated });
    } else {
      // Ajouter nouveau
      const nouveau = {
        id: materiel.id,
        nom: materiel.nom || materiel.designation,
        type: materiel.type || materiel.categorie,
        numero_serie: materiel.numero_serie || materiel.code_unique,
        quantite: 1,
        gerer_quantite: materiel.gerer_quantite || materiel.est_consommable || false,
        stock_disponible: materiel.quantite || materiel.quantite_disponible,
        est_apria: (materiel.nom || materiel.designation || '').toLowerCase().includes('apria'),
        notes: ''
      };
      setFormData({ ...formData, materiel_utilise: [...materielUtilise, nouveau] });
    }
  };
  
  // Modifier quantité
  const modifierQuantite = (materielId, quantite) => {
    if (quantite < 1) {
      // Supprimer si quantité = 0
      const updated = materielUtilise.filter(m => m.id !== materielId);
      setFormData({ ...formData, materiel_utilise: updated });
    } else {
      const updated = materielUtilise.map(m => 
        m.id === materielId ? { ...m, quantite } : m
      );
      setFormData({ ...formData, materiel_utilise: updated });
    }
  };
  
  // Modifier notes
  const modifierNotes = (materielId, notes) => {
    const updated = materielUtilise.map(m => 
      m.id === materielId ? { ...m, notes } : m
    );
    setFormData({ ...formData, materiel_utilise: updated });
  };
  
  // Supprimer matériel
  const supprimerMateriel = (materielId) => {
    const updated = materielUtilise.filter(m => m.id !== materielId);
    setFormData({ ...formData, materiel_utilise: updated });
  };
  
  // Filtrer le matériel disponible
  const materielFiltre = materielDisponible.filter(m => {
    if (!searchMateriel) return true;
    const search = searchMateriel.toLowerCase();
    return (m.nom || m.designation || '').toLowerCase().includes(search) ||
           (m.type || m.categorie || '').toLowerCase().includes(search) ||
           (m.numero_serie || '').toLowerCase().includes(search);
  });
  
  // Stats
  const totalItems = materielUtilise.reduce((sum, m) => sum + (m.quantite || 1), 0);
  const bouteillesAPRIA = materielUtilise.filter(m => m.est_apria);
  const consommablesUtilises = materielUtilise.filter(m => m.gerer_quantite);
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-amber-50">
          <CardTitle className="text-lg text-amber-800 flex justify-between items-center">
            <span>🧰 Matériel utilisé ({totalItems} item{totalItems > 1 ? 's' : ''})</span>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => setShowAddMateriel(true)}>
                + Ajouter matériel
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {materielUtilise.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Aucun matériel enregistré pour cette intervention</p>
          ) : (
            <div className="space-y-3">
              {materielUtilise.map(mat => (
                <div key={mat.id} className={`p-3 rounded-lg border ${mat.est_apria ? 'bg-blue-50 border-blue-200' : mat.gerer_quantite ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-medium flex-1 min-w-[150px]">
                      {mat.nom}
                      {mat.est_apria && <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded">APRIA</span>}
                      {mat.gerer_quantite && <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded">📦 Stock géré</span>}
                    </span>
                    <span className="text-gray-500 text-sm">{mat.type}</span>
                    {mat.numero_serie && <span className="text-gray-400 text-xs">#{mat.numero_serie}</span>}
                    {mat.stock_disponible !== undefined && mat.gerer_quantite && (
                      <span className="text-xs text-gray-500">(Stock: {mat.stock_disponible})</span>
                    )}
                    
                    {editMode ? (
                      <>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => modifierQuantite(mat.id, (mat.quantite || 1) - 1)}
                            className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300"
                          >-</button>
                          <span className="w-8 text-center font-bold">{mat.quantite || 1}</span>
                          <button 
                            onClick={() => modifierQuantite(mat.id, (mat.quantite || 1) + 1)}
                            className="w-6 h-6 bg-gray-200 rounded hover:bg-gray-300"
                          >+</button>
                        </div>
                        <button 
                          onClick={() => supprimerMateriel(mat.id)}
                          className="text-red-500 hover:text-red-700"
                        >🗑️</button>
                      </>
                    ) : (
                      <span className="font-bold">x{mat.quantite || 1}</span>
                    )}
                  </div>
                  
                  {/* Notes */}
                  {editMode ? (
                    <input
                      type="text"
                      value={mat.notes || ''}
                      onChange={(e) => modifierNotes(mat.id, e.target.value)}
                      placeholder="Notes (état, remarques...)"
                      className="w-full mt-2 text-sm border rounded p-1"
                    />
                  ) : mat.notes && (
                    <p className="text-sm text-gray-600 mt-1">📝 {mat.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Résumé APRIA pour facturation */}
      {bouteillesAPRIA.length > 0 && (
        <Card>
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-lg text-blue-800">
              🫁 Bouteilles APRIA ({bouteillesAPRIA.reduce((s, b) => s + (b.quantite || 1), 0)} recharges à facturer)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-600 mb-3">
              Ces bouteilles seront incluses dans la facturation d'entraide si applicable.
            </p>
            <div className="space-y-1">
              {bouteillesAPRIA.map(b => (
                <div key={b.id} className="flex justify-between text-sm">
                  <span>{b.nom} {b.numero_serie && `(#${b.numero_serie})`}</span>
                  <span className="font-medium">{b.quantite || 1} recharge(s)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Modal Ajout Matériel */}
      {showAddMateriel && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 100001 }}>
          <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
            <h3 className="text-lg font-bold mb-4">🧰 Ajouter du matériel</h3>
            
            <input
              type="text"
              placeholder="🔍 Rechercher par nom, type, numéro de série..."
              value={searchMateriel}
              onChange={(e) => setSearchMateriel(e.target.value)}
              className="w-full border rounded p-2 mb-4"
            />
            
            {loading ? (
              <p className="text-center py-4">Chargement...</p>
            ) : materielFiltre.length === 0 ? (
              <p className="text-center py-4 text-gray-500">
                {materielDisponible.length === 0 
                  ? "Aucun matériel trouvé. Ajoutez du matériel dans Gestion des Actifs."
                  : "Aucun résultat pour cette recherche"
                }
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2">
                {materielFiltre.slice(0, 50).map(mat => {
                  const dejaAjoute = materielUtilise.find(m => m.id === mat.id);
                  return (
                    <div 
                      key={mat.id} 
                      className={`p-3 rounded border cursor-pointer hover:bg-gray-50 flex justify-between items-center ${dejaAjoute ? 'bg-green-50 border-green-200' : ''}`}
                      onClick={() => ajouterMateriel(mat)}
                    >
                      <div>
                        <span className="font-medium">{mat.nom || mat.designation}</span>
                        <span className="text-gray-500 text-sm ml-2">({mat.type || mat.categorie})</span>
                        {mat.numero_serie && <span className="text-gray-400 text-xs ml-2">#{mat.numero_serie}</span>}
                      </div>
                      {dejaAjoute ? (
                        <span className="text-green-600 text-sm">✓ Ajouté (x{dejaAjoute.quantite})</span>
                      ) : (
                        <span className="text-blue-600 text-sm">+ Ajouter</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="flex justify-end mt-4 pt-3 border-t">
              <Button variant="outline" onClick={() => setShowAddMateriel(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


// ==================== SECTION PERTES ET VICTIMES ====================

const SectionPertes = ({ formData, setFormData, editMode }) => {
  // Helper pour gérer les inputs numériques (permet d'effacer le 0)
  const handleNumberChange = (field, value) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setFormData({ ...formData, [field]: numValue });
  };
  
  const getNumberValue = (value) => {
    return value === '' || value === null || value === undefined ? '' : value;
  };

  return (
    <div className="space-y-6">
      {/* Pertes matérielles */}
      <Card>
        <CardHeader className="bg-yellow-50">
          <CardTitle className="text-lg text-yellow-800">💰 Pertes matérielles</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dommages au bâtiment ($)
              </label>
              <input
                type="number"
                value={getNumberValue(formData.estimated_loss_building)}
                onChange={(e) => handleNumberChange('estimated_loss_building', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dommages au contenu ($)
              </label>
              <input
                type="number"
                value={getNumberValue(formData.estimated_loss_content)}
                onChange={(e) => handleNumberChange('estimated_loss_content', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div className="md:col-span-2 bg-gray-50 p-3 rounded-lg">
              <p className="text-lg font-bold text-gray-800">
                Total des pertes: {((parseFloat(formData.estimated_loss_building) || 0) + (parseFloat(formData.estimated_loss_content) || 0)).toLocaleString('fr-CA')} $
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Évacuation */}
      <Card>
        <CardHeader className="bg-yellow-50">
          <CardTitle className="text-lg text-yellow-800">🚪 Évacuation</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de personnes évacuées
              </label>
              <input
                type="number"
                value={getNumberValue(formData.evacuated_count)}
                onChange={(e) => handleNumberChange('evacuated_count', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={formData.red_cross_involved || false}
                  onChange={(e) => setFormData({ ...formData, red_cross_involved: e.target.checked })}
                  disabled={!editMode}
                  className="w-5 h-5"
                />
                <span>Prise en charge par la Croix-Rouge</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Victimes */}
      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg text-red-800">🚑 Victimes</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-3">
              <p className="font-medium text-gray-700 mb-2">Civils</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés légers</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_injuries_minor)}
                onChange={(e) => handleNumberChange('civilian_injuries_minor', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_injuries_major)}
                onChange={(e) => handleNumberChange('civilian_injuries_major', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_deaths)}
                onChange={(e) => handleNumberChange('civilian_deaths', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2 bg-red-50"
              />
            </div>

            <div className="col-span-2 md:col-span-3 mt-4">
              <p className="font-medium text-gray-700 mb-2">Pompiers</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés légers</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_injuries_minor)}
                onChange={(e) => handleNumberChange('firefighter_injuries_minor', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_injuries_major)}
                onChange={(e) => handleNumberChange('firefighter_injuries_major', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_deaths)}
                onChange={(e) => handleNumberChange('firefighter_deaths', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2 bg-red-50"
              />
            </div>
          </div>

          {(parseFloat(formData.civilian_deaths) > 0 || parseFloat(formData.firefighter_deaths) > 0) && (
            <div className="mt-4 bg-red-100 p-4 rounded-lg border border-red-300">
              <p className="text-red-800 font-medium">
                ⚠️ En cas de décès, le rapport sera transmis à la SQ/Coroner pour enquête.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};


// ==================== SECTION NARRATIF ====================

const SectionNarratif = ({ formData, setFormData, editMode, settings }) => {
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);
  const baseTextRef = useRef(''); // Texte de base avant la dictée
  
  // Template - utiliser celui des settings s'il existe
  const template = settings?.template_narratif?.length > 0 
    ? settings.template_narratif 
    : [
        { id: 'arrivee', label: 'Arrivée sur les lieux (360)', placeholder: 'Décrivez la situation à votre arrivée...' },
        { id: 'actions', label: 'Actions entreprises', placeholder: 'Décrivez les actions effectuées...' },
        { id: 'observations', label: 'Observations', placeholder: 'Notez vos observations...' },
        { id: 'conclusion', label: 'Conclusion', placeholder: 'Résumez la conclusion de l\'intervention...' },
      ];
  
  // Récupérer les valeurs du narratif structuré
  const narratifData = formData.narratif_structure || {};
  
  const updateNarratifField = (fieldId, value) => {
    setFormData({
      ...formData,
      narratif_structure: {
        ...narratifData,
        [fieldId]: value
      }
    });
  };
  
  // Nettoyer la reconnaissance vocale au démontage du composant
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, []);
  
  const startDictation = (fieldId) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La dictée vocale n'est pas supportée par votre navigateur. Utilisez Chrome ou Edge.");
      return;
    }
    
    // Arrêter et nettoyer toute reconnaissance en cours
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    
    // Sauvegarder le texte actuel comme base
    baseTextRef.current = formData.narratif_structure?.[fieldId] || '';
    setInterimText('');
    
    // Petit délai pour s'assurer que l'ancienne instance est bien nettoyée
    setTimeout(() => {
      try {
        // Créer une nouvelle instance
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        
        recognition.lang = 'fr-CA';
        recognition.continuous = true;
        recognition.interimResults = true;
        
        setActiveField(fieldId);
        
        recognition.onstart = () => {
          setIsListening(true);
        };
        
        recognition.onend = () => {
          setIsListening(false);
          setActiveField(null);
          setInterimText('');
          recognitionRef.current = null;
        };
        
        recognition.onerror = (event) => {
          console.error('Erreur reconnaissance vocale:', event.error);
          setIsListening(false);
          setActiveField(null);
          setInterimText('');
          recognitionRef.current = null;
        };
        
        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Afficher le texte intermédiaire en temps réel
          setInterimText(interimTranscript);
          
          // Quand un segment est finalisé, l'ajouter au texte de base
          if (finalTranscript) {
            const newBase = (baseTextRef.current + ' ' + finalTranscript).trim();
            baseTextRef.current = newBase;
            updateNarratifField(fieldId, newBase);
          }
        };
        
        recognition.start();
      } catch (error) {
        console.error('Erreur démarrage dictée:', error);
        setIsListening(false);
        setActiveField(null);
      }
    }, 100);
  };
  
  const stopDictation = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop(); // Utiliser stop() au lieu de abort() pour finaliser le dernier segment
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setActiveField(null);
    setInterimText('');
  };
  
  // Obtenir le texte affiché (texte de base + texte intermédiaire en cours)
  const getDisplayText = (fieldId) => {
    if (activeField === fieldId && interimText) {
      return (narratifData[fieldId] || '') + ' ' + interimText;
    }
    return narratifData[fieldId] || '';
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          📝 Remplissez chaque section du rapport. Utilisez le bouton 🎤 pour dicter votre texte.
        </p>
      </div>
      
      {/* Champs structurés du template */}
      {template.map((field) => (
        <Card key={field.id}>
          <CardHeader className="bg-gray-50 py-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-medium">{field.label}</CardTitle>
              {editMode && (
                <Button
                  type="button"
                  variant={isListening && activeField === field.id ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => isListening && activeField === field.id ? stopDictation() : startDictation(field.id)}
                >
                  {isListening && activeField === field.id ? '🛑 Stop' : '🎤'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {isListening && activeField === field.id && (
              <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 flex items-center gap-2 text-sm">
                <span className="animate-pulse">🔴</span>
                <span className="text-red-800">Dictée en cours... {interimText && <span className="italic text-red-600">"{interimText}"</span>}</span>
              </div>
            )}
            <textarea
              value={getDisplayText(field.id)}
              onChange={(e) => updateNarratifField(field.id, e.target.value)}
              disabled={!editMode || (isListening && activeField === field.id)}
              placeholder={field.placeholder}
              className={`w-full border rounded-lg p-3 min-h-[100px] resize-y ${isListening && activeField === field.id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            />
          </CardContent>
        </Card>
      ))}
      
      {/* Notes additionnelles (libre) */}
      <Card>
        <CardHeader className="bg-gray-50 py-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base font-medium">📋 Notes additionnelles (optionnel)</CardTitle>
            {editMode && (
              <Button
                type="button"
                variant={isListening && activeField === 'notes' ? "destructive" : "outline"}
                size="sm"
                onClick={() => isListening && activeField === 'notes' ? stopDictation() : startDictation('notes')}
              >
                {isListening && activeField === 'notes' ? '🛑 Stop' : '🎤'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {isListening && activeField === 'notes' && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 flex items-center gap-2 text-sm">
              <span className="animate-pulse">🔴</span>
              <span className="text-red-800">Dictée en cours... {interimText && <span className="italic text-red-600">"{interimText}"</span>}</span>
            </div>
          )}
          <textarea
            value={getDisplayText('notes')}
            onChange={(e) => updateNarratifField('notes', e.target.value)}
            disabled={!editMode || (isListening && activeField === 'notes')}
            placeholder="Ajoutez toute information supplémentaire..."
            className={`w-full border rounded-lg p-3 min-h-[80px] resize-y ${isListening && activeField === 'notes' ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
          />
        </CardContent>
      </Card>
    </div>
  );
};


// ==================== SECTION REMISE DE PROPRIÉTÉ ====================

const SectionRemisePropriete = ({ intervention, tenantSlug, user, getToken, toast, canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [remises, setRemises] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [gpsCoords, setGpsCoords] = useState({ latitude: null, longitude: null });
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    electricite: 'en_fonction',
    gaz: 'en_fonction',
    eau: 'en_fonction',
    niveau_acces: 'vert',
    zone_interdite: '',
    proprietaire_nom: '',
    proprietaire_email: '',
    proprietaire_accepte_email: false,
    proprietaire_confirme_avertissements: true,
    proprietaire_comprend_interdiction: false,
    officier_nom: `${user?.prenom || ''} ${user?.nom || ''}`.trim(),
    officier_signature: null,
    proprietaire_signature: null,
    refus_de_signer: false,
    temoin_nom: ''
  });
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Récupérer GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setGpsCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, []);
  
  // Charger les remises existantes
  useEffect(() => {
    const fetchRemises = async () => {
      try {
        const response = await fetch(`${API}/interventions/${intervention.id}/remises-propriete`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          setRemises(data.remises || []);
        }
      } catch (error) {
        console.error('Erreur chargement remises:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRemises();
  }, [intervention.id, tenantSlug]);
  
  const handleDownloadPdf = async (remise) => {
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/remise-propriete/${remise.id}/pdf`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remise_propriete_${remise.id.slice(0, 8)}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast?.({ title: 'Erreur téléchargement PDF', variant: 'destructive' });
    }
  };
  
  const handleSubmit = async () => {
    if (!formData.officier_signature) {
      toast?.({ title: 'La signature de l\'officier est requise', variant: 'destructive' });
      return;
    }
    if (!formData.refus_de_signer && !formData.proprietaire_signature) {
      toast?.({ title: 'La signature du propriétaire est requise', variant: 'destructive' });
      return;
    }
    if (formData.refus_de_signer && !formData.temoin_nom) {
      toast?.({ title: 'Le nom du témoin est requis', variant: 'destructive' });
      return;
    }
    if (!formData.proprietaire_nom) {
      toast?.({ title: 'Le nom du propriétaire est requis', variant: 'destructive' });
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/remise-propriete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intervention_id: intervention.id,
          ...formData,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast?.({ title: result.email_envoye ? 'Remise enregistrée et email envoyé' : 'Remise enregistrée', variant: 'success' });
        
        if (result.pdf_base64) {
          const link = document.createElement('a');
          link.href = `data:application/pdf;base64,${result.pdf_base64}`;
          link.download = `remise_propriete_${intervention.external_call_id || 'NA'}.pdf`;
          link.click();
        }
        
        setShowForm(false);
        // Recharger les remises
        const refreshRes = await fetch(`${API}/interventions/${intervention.id}/remises-propriete`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setRemises(data.remises || []);
        }
      } else {
        const error = await response.json();
        toast?.({ title: error.detail || 'Erreur', variant: 'destructive' });
      }
    } catch (error) {
      toast?.({ title: 'Erreur de connexion', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };
  
  // Composant signature avec prévisualisation
  const SignaturePad = ({ onSave, label, existingSignature }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [savedSignature, setSavedSignature] = useState(existingSignature || null);
    const [isEditing, setIsEditing] = useState(!existingSignature);
    
    useEffect(() => {
      if (isEditing && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }, [isEditing]);
    
    const getCoords = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };
    
    const start = (e) => { 
      e.preventDefault(); 
      const {x, y} = getCoords(e); 
      canvasRef.current.getContext('2d').beginPath(); 
      canvasRef.current.getContext('2d').moveTo(x, y); 
      setIsDrawing(true); 
      setHasDrawn(true);
    };
    
    const draw = (e) => { 
      if (!isDrawing) return; 
      e.preventDefault(); 
      const {x, y} = getCoords(e); 
      canvasRef.current.getContext('2d').lineTo(x, y); 
      canvasRef.current.getContext('2d').stroke(); 
    };
    
    const stop = () => { 
      if (isDrawing && hasDrawn) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setSavedSignature(dataUrl);
        onSave(dataUrl);
      }
      setIsDrawing(false); 
    };
    
    const clear = () => { 
      const ctx = canvasRef.current.getContext('2d'); 
      ctx.fillStyle = 'white'; 
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); 
      setSavedSignature(null);
      setHasDrawn(false);
      onSave(null); 
    };
    
    const confirmSignature = () => {
      if (savedSignature) {
        setIsEditing(false);
      }
    };
    
    const editSignature = () => {
      setIsEditing(true);
      setHasDrawn(false);
    };
    
    // Afficher la prévisualisation si signature existante et pas en mode édition
    if (savedSignature && !isEditing) {
      return (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">{label}</label>
          <div className="border-2 border-green-300 rounded-lg bg-green-50 p-2">
            <img src={savedSignature} alt="Signature" className="max-h-24 mx-auto" />
          </div>
          <div className="flex gap-2">
            <span className="text-sm text-green-600">✅ Signature enregistrée</span>
            <button type="button" onClick={editSignature} className="text-sm text-blue-600 hover:text-blue-800 underline">
              Modifier
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="border-2 border-gray-300 rounded-lg bg-white">
          <canvas 
            ref={canvasRef} 
            width={350} 
            height={120} 
            className="w-full touch-none cursor-crosshair" 
            onMouseDown={start} 
            onMouseMove={draw} 
            onMouseUp={stop} 
            onMouseLeave={stop} 
            onTouchStart={start} 
            onTouchMove={draw} 
            onTouchEnd={stop} 
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={clear} className="text-sm text-gray-600 hover:text-gray-800">
            Effacer
          </button>
          {hasDrawn && savedSignature && (
            <button type="button" onClick={confirmSignature} className="text-sm text-green-600 hover:text-green-800 font-medium">
              ✅ Confirmer la signature
            </button>
          )}
        </div>
      </div>
    );
  };
  
  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div></div>;
  }
  
  return (
    <div className="space-y-6">
      {/* Liste des remises existantes */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">📋 Remises de propriété</h3>
          {canEdit && (
            <button onClick={() => setShowForm(!showForm)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {showForm ? '✕ Annuler' : '+ Nouvelle remise'}
            </button>
          )}
        </div>
        
        {remises.length === 0 && !showForm ? (
          <p className="text-gray-500 text-center py-8">Aucune remise de propriété enregistrée pour cette intervention.</p>
        ) : (
          <div className="space-y-3">
            {remises.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div>
                  <span className="font-medium">{r.proprietaire_nom}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(r.created_at).toLocaleString('fr-CA')}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    r.niveau_acces === 'rouge' ? 'bg-red-100 text-red-800' :
                    r.niveau_acces === 'jaune' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {r.niveau_acces === 'rouge' ? '🔴 Interdit' : r.niveau_acces === 'jaune' ? '🟡 Restreint' : '🟢 OK'}
                  </span>
                  {r.refus_de_signer && <span className="ml-2 text-xs text-red-600">⚠️ Refus de signer</span>}
                </div>
                <button onClick={() => handleDownloadPdf(r)} className="text-blue-600 hover:text-blue-800 text-sm">
                  📥 PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Formulaire nouvelle remise */}
      {showForm && (
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-6 space-y-6">
          <h4 className="font-semibold text-orange-800">Nouvelle remise de propriété</h4>
          
          {/* GPS */}
          {gpsCoords.latitude && (
            <div className="bg-green-100 text-green-800 text-sm p-2 rounded">
              📍 Position GPS: {gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}
            </div>
          )}
          
          {/* Énergies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">⚡ Électricité</label>
              <select value={formData.electricite} onChange={(e) => setFormData({...formData, electricite: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="coupee_panneau">Coupée au panneau</option>
                <option value="coupee_hydro">Coupée par Hydro-Québec</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">🔥 Gaz</label>
              <select value={formData.gaz} onChange={(e) => setFormData({...formData, gaz: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="ferme_valve">Fermé à la valve</option>
                <option value="verrouille">Compteur verrouillé</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">💧 Eau</label>
              <select value={formData.eau} onChange={(e) => setFormData({...formData, eau: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="fermee">Fermée</option>
              </select>
            </div>
          </div>
          
          {/* Niveau d'accès */}
          <div>
            <label className="block text-sm font-medium mb-2">🚧 Niveau d'accès</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'rouge', label: '🔴 INTERDIT', desc: 'Danger - Structure instable', color: 'border-red-500 bg-red-50' },
                { value: 'jaune', label: '🟡 RESTREINT', desc: 'Récupération limitée', color: 'border-yellow-500 bg-yellow-50' },
                { value: 'vert', label: '🟢 OK', desc: 'Réintégration possible', color: 'border-green-500 bg-green-50' }
              ].map(opt => (
                <label key={opt.value} className={`block p-3 rounded-lg border-2 cursor-pointer ${formData.niveau_acces === opt.value ? opt.color : 'border-gray-200'}`}>
                  <input type="radio" name="niveau_acces" value={opt.value} checked={formData.niveau_acces === opt.value} onChange={(e) => setFormData({...formData, niveau_acces: e.target.value})} className="sr-only" />
                  <span className="font-bold">{opt.label}</span>
                  <span className="block text-xs text-gray-600">{opt.desc}</span>
                </label>
              ))}
            </div>
            {formData.niveau_acces === 'jaune' && (
              <input type="text" value={formData.zone_interdite} onChange={(e) => setFormData({...formData, zone_interdite: e.target.value})} placeholder="Zones interdites (ex: sous-sol, 2e étage)" className="mt-2 w-full p-2 border rounded" />
            )}
          </div>
          
          {/* Propriétaire */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom du propriétaire *</label>
              <input type="text" value={formData.proprietaire_nom} onChange={(e) => setFormData({...formData, proprietaire_nom: e.target.value})} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Courriel</label>
              <input type="email" value={formData.proprietaire_email} onChange={(e) => setFormData({...formData, proprietaire_email: e.target.value})} className="w-full p-2 border rounded" />
            </div>
          </div>
          
          {formData.proprietaire_email && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.proprietaire_accepte_email} onChange={(e) => setFormData({...formData, proprietaire_accepte_email: e.target.checked})} />
              <span className="text-sm">Envoyer une copie par courriel</span>
            </label>
          )}
          
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.proprietaire_confirme_avertissements} onChange={(e) => setFormData({...formData, proprietaire_confirme_avertissements: e.target.checked})} />
            <span className="text-sm">Le propriétaire confirme avoir reçu les avertissements de sécurité</span>
          </label>
          
          {formData.niveau_acces === 'rouge' && (
            <label className="flex items-center gap-2 bg-red-100 p-2 rounded">
              <input type="checkbox" checked={formData.proprietaire_comprend_interdiction} onChange={(e) => setFormData({...formData, proprietaire_comprend_interdiction: e.target.checked})} />
              <span className="text-sm text-red-800 font-medium">⚠️ Le propriétaire comprend que l'accès est interdit</span>
            </label>
          )}
          
          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Officier: {formData.officier_nom}</label>
              <SignaturePad 
                label="Signature de l'officier *" 
                existingSignature={formData.officier_signature}
                onSave={(sig) => setFormData({...formData, officier_signature: sig})} 
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={formData.refus_de_signer} onChange={(e) => setFormData({...formData, refus_de_signer: e.target.checked, proprietaire_signature: null})} />
                <span className="text-sm text-red-600 font-medium">Refus de signer</span>
              </label>
              
              {formData.refus_de_signer ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Nom du témoin *</label>
                  <input type="text" value={formData.temoin_nom} onChange={(e) => setFormData({...formData, temoin_nom: e.target.value})} className="w-full p-2 border rounded" placeholder="Nom d'un autre pompier" />
                </div>
              ) : (
                <SignaturePad 
                  label="Signature du propriétaire *" 
                  existingSignature={formData.proprietaire_signature}
                  onSave={(sig) => setFormData({...formData, proprietaire_signature: sig})} 
                />
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Annuler</button>
            <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
              {submitting ? '⏳ Génération...' : '✅ Enregistrer et générer PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== SECTION FACTURATION ====================

const SectionFacturation = ({ formData, setFormData, editMode, tenantSlug, getToken, toast }) => {
  const [settings, setSettings] = useState(null);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [personnalisation, setPersonnalisation] = useState(null);
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Charger les paramètres, grades et infos du tenant
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, gradesRes, persoRes] = await Promise.all([
          fetch(`${API}/interventions/settings`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
          fetch(`${API}/grades`, { headers: { 'Authorization': `Bearer ${getToken()}` } }),
          fetch(`${API}/personnalisation`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        ]);
        
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.settings);
        }
        if (gradesRes.ok) {
          const data = await gradesRes.json();
          setGrades(data || []);
        }
        if (persoRes.ok) {
          const data = await persoRes.json();
          setPersonnalisation(data);
        }
      } catch (e) {
        console.error('Erreur chargement paramètres facturation:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [tenantSlug]);
  
  // Déterminer si l'intervention est facturable
  const determinerFacturation = () => {
    if (!settings || !formData.municipality) return null;
    
    const municipalite = (formData.municipality || formData.xml_municipality || '').toLowerCase().trim();
    
    // 1. Vérifier si c'est une municipalité couverte par notre service (pas de facturation)
    const munCouvertes = (settings.municipalites_couvertes || []).map(m => m.toLowerCase().trim());
    if (munCouvertes.includes(municipalite)) {
      return { facturable: false, raison: 'Municipalité desservie par notre service' };
    }
    
    // 2. Chercher une entente qui couvre cette municipalité
    for (const entente of (settings.ententes_entraide || [])) {
      const munEntente = (entente.municipalites_couvertes || []).map(m => m.toLowerCase().trim());
      if (munEntente.includes(municipalite)) {
        return {
          facturable: true,
          entente: entente,
          municipalite_facturation: entente.municipalite_facturation,
          raison: `Couvert par l'entente "${entente.municipalite_facturation}"`
        };
      }
    }
    
    // 3. Aucune entente → facturer tout par défaut
    return {
      facturable: true,
      entente: null,
      municipalite_facturation: formData.municipality,
      raison: 'Aucune entente - Tarifs par défaut'
    };
  };
  
  // Calculer le montant de la facture
  const calculerFacture = () => {
    if (!settings) return null;
    
    const facturationInfo = determinerFacturation();
    if (!facturationInfo || !facturationInfo.facturable) return null;
    
    const entente = facturationInfo.entente;
    const tarifVehicules = settings.tarifs_vehicules || {};
    const tarifGrades = settings.tarifs_grades || {};
    const tarifSpecialites = settings.tarifs_specialites || {};
    
    // Calculer la durée en heures
    let dureeHeures = 0;
    if (formData.xml_time_call_received && (formData.xml_time_call_closed || formData.xml_time_terminated)) {
      const debut = new Date(formData.xml_time_call_received);
      const fin = new Date(formData.xml_time_call_closed || formData.xml_time_terminated);
      dureeHeures = Math.max(1, Math.ceil((fin - debut) / (1000 * 60 * 60) * 2) / 2); // Arrondi à 0.5h
    }
    
    const lignes = [];
    let total = 0;
    
    // Véhicules
    const factVehicules = entente ? (entente.facturer_vehicules ?? true) : true;
    if (factVehicules && formData.assigned_vehicles?.length > 0) {
      formData.assigned_vehicles.forEach(v => {
        const typeVehicule = (v.type || 'autre_vehicule').toLowerCase().replace(/[éè]/g, 'e').replace(/\s+/g, '_');
        const tarif = entente?.tarifs?.[typeVehicule] || tarifVehicules[typeVehicule] || tarifVehicules.autre_vehicule || 100;
        const montant = tarif * dureeHeures;
        lignes.push({
          description: `Véhicule ${v.numero_unite || v.numero || v.nom || 'N/A'} (${v.type || 'Autre'})`,
          quantite: `${dureeHeures}h`,
          tarif: `${tarif}$/h`,
          montant
        });
        total += montant;
      });
    }
    
    // Personnel
    const factPersonnel = entente ? (entente.facturer_personnel ?? true) : true;
    if (factPersonnel && formData.personnel_present?.length > 0) {
      formData.personnel_present.forEach(p => {
        // Trouver le grade et son tarif
        const gradeId = p.grade_id || p.grade;
        let tarif = 30; // Défaut
        
        // Chercher par ID ou par nom
        if (gradeId && tarifGrades[gradeId]) {
          tarif = tarifGrades[gradeId];
        } else if (p.grade) {
          const gradeObj = grades.find(g => g.nom === p.grade || g.id === p.grade);
          if (gradeObj && tarifGrades[gradeObj.id]) {
            tarif = tarifGrades[gradeObj.id];
          }
        }
        
        // Tarif spécifique de l'entente si présent
        if (entente?.tarifs?.pompier) {
          tarif = entente.tarifs.pompier;
        }
        
        const montant = tarif * dureeHeures;
        lignes.push({
          description: `${p.prenom || ''} ${p.nom || ''} (${p.grade || 'Pompier'})`,
          quantite: `${dureeHeures}h`,
          tarif: `${tarif}$/h`,
          montant
        });
        total += montant;
      });
    }
    
    // Cylindres / APRIA
    const factCylindres = entente ? (entente.facturer_cylindres ?? true) : true;
    if (factCylindres) {
      const cylindresUtilises = (formData.materiel_utilise || []).filter(m => 
        (m.nom || '').toLowerCase().includes('cylindre') || 
        (m.nom || '').toLowerCase().includes('apria') ||
        (m.nom || '').toLowerCase().includes('bouteille')
      );
      cylindresUtilises.forEach(c => {
        const tarif = entente?.tarifs?.remplissage_cylindre || tarifSpecialites.remplissage_cylindre || 25;
        const qte = c.quantite || 1;
        const montant = tarif * qte;
        lignes.push({
          description: `Remplissage ${c.nom || 'cylindre'}`,
          quantite: qte,
          tarif: `${tarif}$/unité`,
          montant
        });
        total += montant;
      });
    }
    
    // Consommables
    const factConsommables = entente ? (entente.facturer_consommables ?? true) : true;
    if (factConsommables) {
      const consommables = (formData.materiel_utilise || []).filter(m => 
        m.gerer_quantite && 
        !(m.nom || '').toLowerCase().includes('cylindre') &&
        !(m.nom || '').toLowerCase().includes('apria')
      );
      consommables.forEach(c => {
        // TODO: Récupérer le prix du consommable depuis les équipements
        const tarif = 10; // Prix par défaut
        const qte = c.quantite || 1;
        const montant = tarif * qte;
        lignes.push({
          description: `Consommable: ${c.nom || 'N/A'}`,
          quantite: qte,
          tarif: `${tarif}$/unité`,
          montant
        });
        total += montant;
      });
    }
    
    // Spécialités
    const factSpecialites = entente ? (entente.facturer_specialites ?? true) : true;
    if (factSpecialites && formData.specialites_utilisees?.length > 0) {
      formData.specialites_utilisees.forEach(s => {
        const key = s.type?.toLowerCase().replace(/\s+/g, '_') || 'autre_specialite';
        const tarif = tarifSpecialites[key] || tarifSpecialites.autre_specialite || 300;
        lignes.push({
          description: `Spécialité: ${s.nom || s.type || 'Autre'}`,
          quantite: 1,
          tarif: `${tarif}$/interv.`,
          montant: tarif
        });
        total += tarif;
      });
    }
    
    // Frais d'administration
    const factAdmin = entente ? (entente.facturer_frais_admin ?? true) : true;
    if (factAdmin && lignes.length > 0) {
      const fraisAdmin = tarifSpecialites.frais_admin || 50;
      lignes.push({
        description: "Frais d'administration",
        quantite: 1,
        tarif: `${fraisAdmin}$`,
        montant: fraisAdmin
      });
      total += fraisAdmin;
    }
    
    return {
      info: facturationInfo,
      lignes,
      total,
      duree_heures: dureeHeures
    };
  };
  
  const facturation = calculerFacture();
  const facturationInfo = determinerFacturation();
  const [generatingFacture, setGeneratingFacture] = useState(false);
  
  // Sauvegarder les données de facturation
  const sauvegarderFacturation = () => {
    if (facturation) {
      setFormData({
        ...formData,
        facturation: {
          municipalite_facturation: facturation.info.municipalite_facturation,
          entente_utilisee: facturation.info.entente?.municipalite_facturation || null,
          lignes: facturation.lignes,
          total: facturation.total,
          duree_heures: facturation.duree_heures,
          calculee_le: new Date().toISOString()
        }
      });
      toast({ title: "Succès", description: "Données de facturation enregistrées" });
    }
  };
  
  // Générer et enregistrer la facture officielle
  const genererFactureOfficielle = async () => {
    if (!facturation) return;
    
    setGeneratingFacture(true);
    try {
      const response = await fetch(`${API}/interventions/${formData.id}/facture-entraide`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          municipalite_facturation: facturation.info.municipalite_facturation,
          entente_utilisee: facturation.info.entente?.municipalite_facturation || null,
          lignes: facturation.lignes,
          total: facturation.total,
          duree_heures: facturation.duree_heures,
          coordonnees_facturation: facturation.info.entente ? {
            contact_nom: facturation.info.entente.contact_nom,
            contact_email: facturation.info.entente.contact_email,
            adresse: facturation.info.entente.adresse_facturation
          } : {}
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setFormData({
          ...formData,
          facture_entraide_id: data.facture.id,
          facture_entraide_numero: data.facture.numero_facture
        });
        toast({ title: "Succès", description: `Facture ${data.facture.numero_facture} générée avec succès` });
        return data.facture;
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail || "Erreur lors de la génération", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    } finally {
      setGeneratingFacture(false);
    }
    return null;
  };
  
  // Générer le PDF de la facture
  const genererPDF = async () => {
    let facture = formData.facture_entraide_numero ? { numero_facture: formData.facture_entraide_numero } : null;
    
    // Si pas encore de facture officielle, en générer une
    if (!facture) {
      facture = await genererFactureOfficielle();
      if (!facture) return;
    }
    
    const numeroFacture = facture.numero_facture || formData.facture_entraide_numero;
    const nomService = personnalisation?.nom_service || 'Service de Sécurité Incendie';
    const logoUrl = personnalisation?.logo_url || '';
    const adresseService = personnalisation?.adresse || '';
    const telService = personnalisation?.telephone || '';
    const emailService = personnalisation?.email || '';
    
    // Générer le HTML de la facture avec logo et infos du tenant
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Facture ${numeroFacture}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 30px; max-width: 800px; margin: 0 auto; color: #333; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #dc2626; padding-bottom: 20px; }
          .header-left { display: flex; align-items: center; gap: 15px; }
          .logo-img { max-height: 70px; max-width: 150px; object-fit: contain; }
          .logo-placeholder { width: 60px; height: 60px; background: linear-gradient(135deg, #dc2626, #f97316); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 30px; }
          .service-info { }
          .service-name { font-size: 18px; font-weight: bold; color: #dc2626; margin-bottom: 3px; }
          .service-details { font-size: 10px; color: #666; line-height: 1.4; }
          .facture-info { text-align: right; }
          .facture-titre { font-size: 24px; font-weight: bold; color: #dc2626; }
          .facture-numero { font-size: 16px; color: #333; margin-top: 5px; }
          .facture-date { font-size: 11px; color: #666; margin-top: 3px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 11px; font-weight: bold; color: #666; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
          .client-box { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #dc2626; }
          .client-name { font-size: 14px; font-weight: bold; color: #333; margin-bottom: 5px; }
          .intervention-box { background: #fff8e1; padding: 15px; border-radius: 6px; border-left: 4px solid #f59e0b; }
          .intervention-title { font-weight: bold; color: #92400e; margin-bottom: 8px; }
          .intervention-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
          .intervention-item { font-size: 11px; }
          .intervention-label { color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #1f2937; color: white; padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; }
          th.text-center { text-align: center; }
          th.text-right { text-align: right; }
          td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          td.text-center { text-align: center; }
          td.text-right { text-align: right; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          .total-row { background: #dc2626 !important; color: white; font-weight: bold; }
          .total-row td { padding: 12px 8px; font-size: 14px; border: none; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #e5e7eb; }
          .footer-thanks { text-align: center; font-style: italic; color: #666; margin-bottom: 15px; }
          .footer-info { display: flex; justify-content: space-between; font-size: 10px; color: #999; }
          @media print { 
            body { padding: 15px; } 
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            ${logoUrl ? `<img src="${logoUrl}" class="logo-img" alt="Logo"/>` : '<div class="logo-placeholder">🚒</div>'}
            <div class="service-info">
              <div class="service-name">${nomService}</div>
              <div class="service-details">
                ${adresseService ? adresseService + '<br/>' : ''}
                ${telService ? 'Tél: ' + telService : ''} ${emailService ? ' | ' + emailService : ''}
              </div>
            </div>
          </div>
          <div class="facture-info">
            <div class="facture-titre">FACTURE</div>
            <div class="facture-numero">${numeroFacture}</div>
            <div class="facture-date">Date: ${new Date().toLocaleDateString('fr-CA')}</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Facturé à</div>
          <div class="client-box">
            <div class="client-name">${facturation.info.municipalite_facturation}</div>
            ${facturation.info.entente?.adresse_facturation ? `<div>${facturation.info.entente.adresse_facturation}</div>` : ''}
            ${facturation.info.entente?.contact_nom ? `<div>Att: ${facturation.info.entente.contact_nom}</div>` : ''}
            ${facturation.info.entente?.contact_email ? `<div>Courriel: ${facturation.info.entente.contact_email}</div>` : ''}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Détails de l'intervention</div>
          <div class="intervention-box">
            <div class="intervention-title">Dossier #${formData.external_call_id}</div>
            <div class="intervention-grid">
              <div class="intervention-item"><span class="intervention-label">Type:</span> ${formData.type_intervention || 'N/A'}</div>
              <div class="intervention-item"><span class="intervention-label">Durée:</span> ${facturation.duree_heures} heure(s)</div>
              <div class="intervention-item"><span class="intervention-label">Adresse:</span> ${formData.address_full || 'N/A'}</div>
              <div class="intervention-item"><span class="intervention-label">Municipalité:</span> ${formData.municipality || ''}</div>
              <div class="intervention-item" style="grid-column: span 2;"><span class="intervention-label">Date:</span> ${formData.xml_time_call_received ? new Date(formData.xml_time_call_received).toLocaleString('fr-CA') : 'N/A'}</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Détail des services rendus</div>
          <table>
            <thead>
              <tr>
                <th style="width: 50%;">Description</th>
                <th class="text-center" style="width: 15%;">Quantité</th>
                <th class="text-right" style="width: 17%;">Tarif</th>
                <th class="text-right" style="width: 18%;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${facturation.lignes.map(l => `
                <tr>
                  <td>${l.description}</td>
                  <td class="text-center">${l.quantite}</td>
                  <td class="text-right">${l.tarif}</td>
                  <td class="text-right">${l.montant.toFixed(2)} $</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3" class="text-right">TOTAL À PAYER</td>
                <td class="text-right">${facturation.total.toFixed(2)} $</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <div class="footer">
          <div class="footer-thanks">Merci pour votre collaboration dans le cadre de l'entraide municipale.</div>
          <div class="footer-info">
            <div>${nomService}</div>
            <div>Facture générée le ${new Date().toLocaleString('fr-CA')}</div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };
  
  // Exporter en Excel avec mise en page
  const exporterExcel = async () => {
    if (!facturation) return;
    
    let numeroFacture = formData.facture_entraide_numero;
    
    // Si pas encore de facture officielle, en générer une
    if (!numeroFacture) {
      const facture = await genererFactureOfficielle();
      if (!facture) return;
      numeroFacture = facture.numero_facture;
    }
    
    const nomService = personnalisation?.nom_service || 'Service de Sécurité Incendie';
    
    // Charger dynamiquement xlsx
    const XLSX = await import('xlsx');
    
    // Créer les données pour Excel avec meilleure mise en page
    const wsData = [
      [nomService],
      ['FACTURE D\'ENTRAIDE MUNICIPALE'],
      [],
      ['N° Facture:', numeroFacture, '', 'Date:', new Date().toLocaleDateString('fr-CA')],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['FACTURÉ À'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['Municipalité:', facturation.info.municipalite_facturation],
      ['Contact:', facturation.info.entente?.contact_nom || '-'],
      ['Courriel:', facturation.info.entente?.contact_email || '-'],
      ['Adresse:', facturation.info.entente?.adresse_facturation || '-'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['INTERVENTION'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['N° Dossier:', formData.external_call_id],
      ['Type:', formData.type_intervention || '-'],
      ['Adresse:', formData.address_full || '-'],
      ['Municipalité:', formData.municipality || '-'],
      ['Date/Heure:', formData.xml_time_call_received ? new Date(formData.xml_time_call_received).toLocaleString('fr-CA') : '-'],
      ['Durée totale:', facturation.duree_heures + ' heure(s)'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      ['DÉTAIL DES SERVICES RENDUS'],
      ['═══════════════════════════════════════════════════════════════════════════'],
      [],
      ['Description', 'Quantité', 'Tarif unitaire', 'Montant'],
      ['───────────────────────────────────────', '─────────', '─────────────', '─────────'],
      ...facturation.lignes.map(l => [l.description, l.quantite, l.tarif, l.montant.toFixed(2) + ' $']),
      ['───────────────────────────────────────', '─────────', '─────────────', '─────────'],
      [],
      ['', '', 'TOTAL À PAYER:', facturation.total.toFixed(2) + ' $'],
      [],
      ['═══════════════════════════════════════════════════════════════════════════'],
      [],
      ['Merci pour votre collaboration dans le cadre de l\'entraide municipale.'],
      [],
      ['Facture générée le ' + new Date().toLocaleString('fr-CA')],
      [nomService]
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Ajuster les largeurs de colonnes
    ws['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 18 }, { wch: 15 }];
    
    // Fusionner les cellules pour le titre
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, // Nom du service
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, // Titre facture
    ];
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facture');
    
    // Télécharger le fichier
    XLSX.writeFile(wb, `Facture_${numeroFacture}_${formData.external_call_id}.xlsx`);
    
    toast({ title: "Succès", description: "Fichier Excel téléchargé" });
  };
  
  if (loading) {
    return <div className="text-center py-8">Chargement des paramètres de facturation...</div>;
  }
  
  return (
    <div className="space-y-4">
      {/* Info sur la facturation */}
      <Card>
        <CardHeader className={facturationInfo?.facturable ? 'bg-green-50' : 'bg-gray-50'}>
          <CardTitle className="text-lg flex items-center gap-2">
            🧾 Facturation Entraide
            {facturationInfo?.facturable ? (
              <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">Facturable</span>
            ) : (
              <span className="text-sm bg-gray-100 text-gray-600 px-2 py-1 rounded">Non facturable</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              <strong>Municipalité de l'intervention:</strong> {formData.municipality || formData.xml_municipality || 'Non définie'}
            </p>
            <p className="text-sm text-gray-600">
              <strong>Statut:</strong> {facturationInfo?.raison || 'En attente de calcul'}
            </p>
            {facturationInfo?.facturable && facturationInfo?.municipalite_facturation && (
              <p className="text-sm font-medium text-green-700 mt-2">
                💰 À facturer à: <strong>{facturationInfo.municipalite_facturation}</strong>
              </p>
            )}
          </div>
          
          {/* Données de facturation sauvegardées */}
          {formData.facturation && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-sm text-blue-800">
                ✅ Facturation calculée le {new Date(formData.facturation.calculee_le).toLocaleString('fr-CA')}
              </p>
              <p className="text-sm text-blue-800">
                Total: <strong>{formData.facturation.total?.toFixed(2)} $</strong>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Détail de la facture */}
      {facturationInfo?.facturable && facturation && (
        <Card>
          <CardHeader className="bg-purple-50">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <CardTitle className="text-lg">📋 Détail de la facture</CardTitle>
              <div className="flex gap-2 flex-wrap">
                {editMode && (
                  <Button onClick={sauvegarderFacturation} size="sm" variant="outline">
                    💾 Sauvegarder
                  </Button>
                )}
                <Button onClick={genererPDF} size="sm" disabled={generatingFacture} className="bg-red-600 hover:bg-red-700">
                  {generatingFacture ? '⏳' : '📄'} PDF
                </Button>
                <Button onClick={exporterExcel} size="sm" disabled={generatingFacture} className="bg-green-600 hover:bg-green-700">
                  {generatingFacture ? '⏳' : '📊'} Excel
                </Button>
              </div>
            </div>
            {formData.facture_entraide_numero && (
              <p className="text-sm text-purple-700 mt-2">
                ✅ Facture officielle: <strong>{formData.facture_entraide_numero}</strong>
              </p>
            )}
          </CardHeader>
          <CardContent className="pt-4">
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm"><strong>Durée de l'intervention:</strong> {facturation.duree_heures}h</p>
              {facturation.info.entente && (
                <p className="text-sm"><strong>Entente appliquée:</strong> {facturation.info.entente.municipalite_facturation}</p>
              )}
            </div>
            
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 border">Description</th>
                  <th className="text-center p-2 border">Quantité</th>
                  <th className="text-right p-2 border">Tarif</th>
                  <th className="text-right p-2 border">Montant</th>
                </tr>
              </thead>
              <tbody>
                {facturation.lignes.map((ligne, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="p-2 border">{ligne.description}</td>
                    <td className="p-2 border text-center">{ligne.quantite}</td>
                    <td className="p-2 border text-right">{ligne.tarif}</td>
                    <td className="p-2 border text-right font-medium">{ligne.montant.toFixed(2)} $</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-purple-100 font-bold">
                  <td colSpan={3} className="p-2 border text-right">TOTAL</td>
                  <td className="p-2 border text-right text-lg">{facturation.total.toFixed(2)} $</td>
                </tr>
              </tfoot>
            </table>
            
            {/* Coordonnées de facturation */}
            {facturation.info.entente && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <h4 className="font-medium mb-2">📬 Coordonnées de facturation</h4>
                {facturation.info.entente.contact_nom && (
                  <p className="text-sm">Contact: {facturation.info.entente.contact_nom}</p>
                )}
                {facturation.info.entente.contact_email && (
                  <p className="text-sm">Courriel: {facturation.info.entente.contact_email}</p>
                )}
                {facturation.info.entente.adresse_facturation && (
                  <p className="text-sm">Adresse: {facturation.info.entente.adresse_facturation}</p>
                )}
              </div>
            )}
            
            {/* Spécialités (à ajouter si nécessaire) */}
            {editMode && (
              <div className="mt-4 border-t pt-4">
                <h4 className="font-medium mb-2">⭐ Ajouter une spécialité utilisée</h4>
                <div className="flex gap-2">
                  <select 
                    className="border rounded p-2 flex-1"
                    onChange={(e) => {
                      if (e.target.value) {
                        const specialites = formData.specialites_utilisees || [];
                        if (!specialites.find(s => s.type === e.target.value)) {
                          setFormData({
                            ...formData,
                            specialites_utilisees: [...specialites, { type: e.target.value, nom: e.target.value }]
                          });
                        }
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">-- Sélectionner une spécialité --</option>
                    <option value="sauvetage_hauteur">Sauvetage en hauteur</option>
                    <option value="espace_clos">Espace clos</option>
                    <option value="nautique">Sauvetage nautique</option>
                    <option value="sumi">SUMI - Matières dangereuses</option>
                    <option value="autre_specialite">Autre spécialité</option>
                  </select>
                </div>
                {(formData.specialites_utilisees || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.specialites_utilisees.map((s, idx) => (
                      <span key={idx} className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm flex items-center gap-1">
                        ⭐ {s.nom || s.type}
                        <button 
                          onClick={() => setFormData({
                            ...formData,
                            specialites_utilisees: formData.specialites_utilisees.filter((_, i) => i !== idx)
                          })}
                          className="text-yellow-600 hover:text-red-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Non facturable */}
      {!facturationInfo?.facturable && (
        <Card>
          <CardContent className="pt-4">
            <div className="text-center py-8 text-gray-500">
              <p className="text-4xl mb-2">🏠</p>
              <p>Cette intervention n'est pas facturable car elle concerne une municipalité desservie par votre service.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
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
