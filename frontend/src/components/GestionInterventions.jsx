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
  const [hasAccess, setHasAccess] = useState(false);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  // Vérifier l'accès au module
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const response = await fetch(`${API}/interventions/settings`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          setSettings(data.settings);
          
          // Vérifier si l'utilisateur a accès
          const isAdminOrSupervisor = ['admin', 'superviseur'].includes(user?.role);
          const isDesignatedPerson = (data.settings?.personnes_ressources || []).includes(user?.id);
          setHasAccess(isAdminOrSupervisor || isDesignatedPerson);
        }
      } catch (error) {
        console.error('Erreur vérification accès:', error);
      } finally {
        setLoading(false);
      }
    };
    checkAccess();
  }, [API, user]);

  if (loading) {
    return <div className="p-6 text-center">Chargement...</div>;
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-yellow-800 mb-2">Accès restreint</h2>
          <p className="text-yellow-700">
            Vous n'avez pas accès à ce module. Contactez un administrateur pour être ajouté aux personnes ressources.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'rapports', label: 'Rapports d\'intervention', icon: '📋' },
    { id: 'historique', label: 'Historique', icon: '📚' },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', adminOnly: true },
  ];

  const visibleTabs = tabs.filter(tab => !tab.adminOnly || user?.role === 'admin');

  return (
    <div className="p-6" data-testid="gestion-interventions">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Interventions</h1>
        <p className="text-gray-600">Gérez vos rapports d'intervention et importez les données du 911</p>
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
        <TabRapports user={user} tenantSlug={tenantSlug} toast={toast} />
      )}
      {activeTab === 'historique' && (
        <TabHistorique user={user} tenantSlug={tenantSlug} toast={toast} />
      )}
      {activeTab === 'parametres' && user?.role === 'admin' && (
        <TabParametres user={user} tenantSlug={tenantSlug} toast={toast} />
      )}
    </div>
  );
};


// ==================== ONGLET RAPPORTS ====================

const TabRapports = ({ user, tenantSlug, toast }) => {
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

  const canImport = ['admin', 'superviseur'].includes(user?.role);

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

const InterventionDetailModal = ({ intervention, tenantSlug, user, onClose, onUpdate, toast }) => {
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

  const sections = [
    { id: 'identification', label: 'Identification & Chrono', icon: '📋' },
    { id: 'batiment', label: 'Bâtiment', icon: '🏠', showIf: isBuildingFire },
    { id: 'ressources', label: 'Ressources', icon: '👥' },
    { id: 'materiel', label: 'Matériel utilisé', icon: '🧰' },
    { id: 'dsi', label: 'Détails DSI', icon: '🔥', showIf: isFireIncident },
    { id: 'protection', label: 'Protection incendie', icon: '🚨', showIf: isFireIncident },
    { id: 'pertes', label: 'Pertes & Victimes', icon: '💰' },
    { id: 'narratif', label: 'Narratif', icon: '📝' },
  ];

  const visibleSections = sections.filter(s => !s.showIf || s.showIf());

  const canEdit = user.role === 'admin' || user.role === 'superviseur' || 
                  (formData.assigned_reporters || []).includes(user.id);
  const canValidate = user.role === 'admin' || user.role === 'superviseur';
  const isLocked = formData.status === 'signed';

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

        {/* Navigation - Style bien visible */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-300">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {visibleSections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`px-4 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap text-sm flex-shrink-0 border ${
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
              editMode={editMode && !isLocked}
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
              editMode={editMode && !isLocked}
              referenceData={referenceData}
            />
          )}
          {activeSection === 'ressources' && (
            <SectionRessources 
              vehicles={vehicles}
              resources={resources}
              formData={formData}
              setFormData={setFormData}
              editMode={editMode && !isLocked}
              tenantSlug={tenantSlug}
              interventionId={formData.id}
              onRefresh={fetchDetails}
            />
          )}
          {activeSection === 'materiel' && (
            <SectionMateriel 
              formData={formData}
              setFormData={setFormData}
              editMode={editMode && !isLocked}
              tenantSlug={tenantSlug}
              getToken={getToken}
            />
          )}
          {activeSection === 'dsi' && (
            <SectionDSI 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked}
              referenceData={referenceData}
            />
          )}
          {activeSection === 'protection' && (
            <SectionProtection 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked}
            />
          )}
          {activeSection === 'pertes' && (
            <SectionPertes 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked}
            />
          )}
          {activeSection === 'narratif' && (
            <SectionNarratif 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked}
              settings={interventionSettings}
            />
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-between flex-wrap gap-2">
          <div>
            {canEdit && !isLocked && (
              <Button
                variant={editMode ? "default" : "outline"}
                onClick={() => editMode ? handleSave() : setEditMode(true)}
                disabled={loading}
              >
                {editMode ? '💾 Enregistrer' : '✏️ Modifier'}
              </Button>
            )}
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {canValidate && !isLocked && (
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


// ==================== SECTIONS DU FORMULAIRE DSI ====================

const SectionIdentification = ({ formData, setFormData, editMode, formatDateTime, tenantSlug, getToken, toast }) => {
  // Charger la météo automatiquement si pas encore chargée
  useEffect(() => {
    const loadWeatherAuto = async () => {
      // Ne charger que si on a les coordonnées et la date, et que la météo n'est pas déjà chargée
      if (formData.coordinates?.lat && formData.coordinates?.lon && formData.xml_time_call_received && !formData.meteo?.temperature) {
        try {
          const response = await fetch(
            `${BACKEND_URL}/api/${tenantSlug}/interventions/weather?lat=${formData.coordinates.lat}&lon=${formData.coordinates.lon}&datetime_str=${formData.xml_time_call_received}`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } }
          );
          if (response.ok) {
            const weather = await response.json();
            if (weather.temperature !== null) {
              setFormData(prev => ({
                ...prev,
                meteo: {
                  temperature: weather.temperature,
                  conditions: weather.conditions?.[0] || 'inconnu',
                  chaussee: weather.chaussee,
                  precipitation_mm: weather.precipitation_mm,
                  neige_cm: weather.neige_cm,
                  vent_kmh: weather.vent_kmh,
                  visibilite_m: weather.visibilite_m
                }
              }));
            }
          }
        } catch (e) {
          console.error('Erreur chargement météo:', e);
        }
      }
    };
    
    if (tenantSlug && getToken) {
      loadWeatherAuto();
    }
  }, [formData.coordinates, formData.xml_time_call_received, tenantSlug]);

  return (
    <div className="space-y-6">
      {/* Bloc Général (Obligatoire pour TOUS les appels) */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">📋 Bloc Général (Obligatoire)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-500">No Dossier</label>
              <p className="font-mono font-bold">{formData.external_call_id}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Nature de l'incident</label>
              <p className="font-medium">{formData.type_intervention || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Code Feu</label>
              <p>{formData.code_feu || '-'}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-500">Adresse complète</label>
              <p className="font-medium">{formData.address_full || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Niveau de risque</label>
              <p>{formData.niveau_risque || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chronologie */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">⏱️ Chronologie</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TimeField label="Appel reçu" value={formatDateTime(formData.xml_time_call_received)} />
            <TimeField label="Alerte" value={formatDateTime(formData.xml_time_dispatch)} />
            <TimeField label="Départ caserne" value={formatDateTime(formData.xml_time_en_route)} />
            <TimeField label="Arrivée sur les lieux" value={formatDateTime(formData.xml_time_arrival_1st)} highlight />
            <TimeField label="Force de frappe" value={formatDateTime(formData.xml_time_force_frappe)} />
            <TimeField label="Sous contrôle" value={formatDateTime(formData.xml_time_under_control)} />
            <TimeField label="Disponible (10-22)" value={formatDateTime(formData.xml_time_1022)} />
            <TimeField label="Fin intervention" value={formatDateTime(formData.xml_time_terminated)} />
          </div>
        </CardContent>
      </Card>

      {/* Météo - Chargée automatiquement */}
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">
            <span>🌤️ Conditions météo</span>
            {formData.meteo?.temperature != null && (
              <span className="text-sm font-normal ml-2 text-blue-600">(chargé automatiquement)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500">Température</label>
              {editMode ? (
                <input
                  type="number"
                  value={formData.meteo?.temperature ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, temperature: e.target.value ? parseFloat(e.target.value) : null }
                  })}
                  className="w-full border rounded p-2"
                  placeholder="°C"
                />
              ) : (
                <p className="font-medium">{formData.meteo?.temperature != null ? `${formData.meteo.temperature}°C` : '-'}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">Conditions</label>
              {editMode ? (
                <select
                  value={formData.meteo?.conditions || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, conditions: e.target.value }
                  })}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="soleil">☀️ Soleil</option>
                  <option value="nuageux">☁️ Nuageux</option>
                  <option value="pluie">🌧️ Pluie</option>
                  <option value="neige">🌨️ Neige</option>
                  <option value="brouillard">🌫️ Brouillard</option>
                  <option value="orage">⛈️ Orage</option>
                  <option value="verglas">🧊 Verglas</option>
                </select>
              ) : (
                <p className="font-medium">{
                  formData.meteo?.conditions === 'soleil' ? '☀️ Soleil' :
                  formData.meteo?.conditions === 'nuageux' ? '☁️ Nuageux' :
                  formData.meteo?.conditions === 'pluie' ? '🌧️ Pluie' :
                  formData.meteo?.conditions === 'neige' ? '🌨️ Neige' :
                  formData.meteo?.conditions === 'brouillard' ? '🌫️ Brouillard' :
                  formData.meteo?.conditions === 'orage' ? '⛈️ Orage' :
                  formData.meteo?.conditions === 'verglas' ? '🧊 Verglas' :
                  '-'
                }</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">État chaussée</label>
              {editMode ? (
                <select
                  value={formData.meteo?.chaussee || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, chaussee: e.target.value }
                  })}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="sec">🛣️ Sec</option>
                  <option value="mouillée">💧 Mouillée</option>
                  <option value="glissante">⚠️ Glissante</option>
                  <option value="enneigée">❄️ Enneigée</option>
                  <option value="glacée">🧊 Glacée</option>
                </select>
              ) : (
                <p className="font-medium">{
                  formData.meteo?.chaussee === 'sec' ? '🛣️ Sec' :
                  formData.meteo?.chaussee === 'mouillée' ? '💧 Mouillée' :
                  formData.meteo?.chaussee === 'glissante' ? '⚠️ Glissante' :
                  formData.meteo?.chaussee === 'enneigée' ? '❄️ Enneigée' :
                  formData.meteo?.chaussee === 'glacée' ? '🧊 Glacée' :
                  '-'
                }</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">Vent</label>
              {editMode ? (
                <input
                  type="number"
                  value={formData.meteo?.vent_kmh ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, vent_kmh: e.target.value ? parseFloat(e.target.value) : null }
                  })}
                  className="w-full border rounded p-2"
                  placeholder="km/h"
                />
              ) : (
                <p className="font-medium">{formData.meteo?.vent_kmh != null ? `${formData.meteo.vent_kmh} km/h` : '-'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appelant */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">📱 Informations appelant</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">De qui</label>
              <p>{formData.caller_name || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Téléphone</label>
              <p>{formData.caller_phone || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Pour qui</label>
              <p>{formData.for_whom || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Téléphone</label>
              <p>{formData.for_whom_phone || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commentaires du 911 */}
      {formData.xml_comments && formData.xml_comments.length > 0 && (
        <Card>
          <CardHeader className="bg-gray-50">
            <CardTitle className="text-lg">💬 Journal des communications</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...formData.xml_comments]
                .sort((a, b) => {
                  // Trier par timestamp chronologique
                  const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                  const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                  return dateA - dateB;
                })
                .map((comment, i) => (
                <div key={i} className="bg-gray-50 p-2 rounded text-sm">
                  <span className="text-gray-500">{comment.timestamp}</span>
                  <span className="mx-2">-</span>
                  <span>{comment.detail}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const TimeField = ({ label, value, highlight }) => (
  <div className={highlight ? "bg-yellow-50 p-2 rounded border border-yellow-200" : ""}>
    <label className="text-sm text-gray-500">{label}</label>
    <p className={`font-mono text-sm ${highlight ? "font-bold text-yellow-800" : ""}`}>{value}</p>
  </div>
);


// ==================== SECTION BÂTIMENT ====================

const SectionBatiment = ({ formData, setFormData, editMode, referenceData }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">🏠 Informations sur le bâtiment</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code d'usage du bâtiment *
              </label>
              <select
                value={formData.building_category_code || ''}
                onChange={(e) => setFormData({ ...formData, building_category_code: e.target.value })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.categories_batiment || []).map(cat => (
                  <option key={cat.id} value={cat.code}>
                    {cat.code} - {cat.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de logements
              </label>
              <input
                type="number"
                value={formData.building_units || ''}
                onChange={(e) => setFormData({ ...formData, building_units: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre d'étages
              </label>
              <input
                type="number"
                value={formData.building_floors || ''}
                onChange={(e) => setFormData({ ...formData, building_floors: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Année de construction
              </label>
              <input
                type="number"
                value={formData.building_year || ''}
                onChange={(e) => setFormData({ ...formData, building_year: parseInt(e.target.value) || null })}
                disabled={!editMode}
                placeholder="ex: 1985"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valeur du bâtiment ($)
              </label>
              <input
                type="number"
                value={formData.building_value || ''}
                onChange={(e) => setFormData({ ...formData, building_value: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valeur du contenu ($)
              </label>
              <input
                type="number"
                value={formData.content_value || ''}
                onChange={(e) => setFormData({ ...formData, content_value: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
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
                          {personnel.map(p => (
                            <span key={p.id} className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${p.is_manual ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                              {p.user_name || p.user_id}
                              {p.role_on_scene && <span className="opacity-75">({p.role_on_scene})</span>}
                              {editMode && p.is_manual && (
                                <button onClick={() => removePersonnel(p.id)} className="ml-1 text-red-500 hover:text-red-700">×</button>
                              )}
                            </span>
                          ))}
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
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded border flex-wrap">
                    <span className="font-medium flex-1 min-w-[150px]">
                      {p.user_name || p.prenom + ' ' + p.nom || p.user_id}
                      {p.grade && <span className="text-gray-500 text-sm ml-1">({p.grade})</span>}
                      {p.equipe_origine && <span className="text-purple-600 text-xs ml-2">[{p.equipe_origine}]</span>}
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
                    <th className="p-2 text-left">Prime</th>
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
                        <td className="p-2 text-center">
                          {editMode ? (
                            <input
                              type="checkbox"
                              checked={resource.prime_repas ?? true}
                              onChange={(e) => updatePrimeRepas(resource.id, e.target.checked)}
                              className="w-4 h-4"
                            />
                          ) : (
                            (resource.prime_repas ?? true) ? '🍽️' : '-'
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
        numero_serie: materiel.numero_serie,
        quantite: 1,
        est_consommable: materiel.est_consommable || false,
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


// ==================== ONGLET HISTORIQUE ====================

const TabHistorique = ({ user, tenantSlug, toast }) => {
  const [interventions, setInterventions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'signed', dateFrom: '', dateTo: '' });

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
              </tr>
            </thead>
            <tbody>
              {interventions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    Aucune intervention trouvée
                  </td>
                </tr>
              ) : (
                interventions.map(intervention => (
                  <tr key={intervention.id} className="hover:bg-gray-50">
                    <td className="p-3 border-b font-mono">{intervention.external_call_id}</td>
                    <td className="p-3 border-b">{formatDate(intervention.xml_time_call_received || intervention.created_at)}</td>
                    <td className="p-3 border-b">{intervention.type_intervention || '-'}</td>
                    <td className="p-3 border-b">{intervention.address_full || '-'}</td>
                    <td className="p-3 border-b">
                      <span className={`px-2 py-1 rounded text-sm ${
                        intervention.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {intervention.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


// ==================== ONGLET PARAMETRES ====================

const TabParametres = ({ user, tenantSlug, toast }) => {
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  useEffect(() => {
    fetchSettings();
    fetchUsers();
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
            Configurez les ententes tarifaires avec les municipalités voisines pour les services d'entraide.
          </p>
          
          <div className="space-y-4">
            {/* Liste des ententes */}
            <div className="space-y-3">
              {(settings.ententes_entraide || []).map((entente, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 border">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={entente.municipalite || ''}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, municipalite: e.target.value };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="font-medium text-lg border-b border-transparent hover:border-gray-300 focus:border-purple-500 bg-transparent outline-none w-full"
                        placeholder="Nom de la municipalité"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const updated = (settings.ententes_entraide || []).filter((_, i) => i !== index);
                        setSettings({ ...settings, ententes_entraide: updated });
                      }}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      🗑️
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_vehicules ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_vehicules: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">🚒 Véhicules</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_personnel ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_personnel: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">👥 Personnel</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_repas ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_repas: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">🍽️ Repas</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_apria ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_apria: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">🫁 APRIA</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_materiel ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_materiel: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">🧰 Matériel</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entente.facturer_specialites ?? true}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, facturer_specialites: e.target.checked };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">⭐ Spécialités</span>
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Tarif horaire véhicule ($)</label>
                      <input
                        type="number"
                        value={entente.tarif_vehicule ?? 150}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, tarif_vehicule: parseFloat(e.target.value) };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-full border rounded p-2"
                        step="5"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Tarif horaire pompier ($)</label>
                      <input
                        type="number"
                        value={entente.tarif_pompier ?? 35}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, tarif_pompier: parseFloat(e.target.value) };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-full border rounded p-2"
                        step="1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Tarif recharge APRIA ($)</label>
                      <input
                        type="number"
                        value={entente.tarif_apria ?? 25}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, tarif_apria: parseFloat(e.target.value) };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-full border rounded p-2"
                        step="1"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Minimum facturable (h)</label>
                      <input
                        type="number"
                        value={entente.minimum_heures ?? 1}
                        onChange={(e) => {
                          const updated = [...(settings.ententes_entraide || [])];
                          updated[index] = { ...entente, minimum_heures: parseFloat(e.target.value) };
                          setSettings({ ...settings, ententes_entraide: updated });
                        }}
                        className="w-full border rounded p-2"
                        step="0.5"
                        min="0"
                      />
                    </div>
                  </div>
                  
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
                  municipalite: '',
                  facturer_vehicules: true,
                  facturer_personnel: true,
                  facturer_repas: true,
                  facturer_apria: true,
                  facturer_materiel: true,
                  facturer_specialites: true,
                  tarif_vehicule: 150,
                  tarif_pompier: 35,
                  tarif_apria: 25,
                  minimum_heures: 1,
                  notes: ''
                };
                setSettings({
                  ...settings,
                  ententes_entraide: [...(settings.ententes_entraide || []), nouvelle]
                });
              }}
              className="w-full"
            >
              + Ajouter une entente avec une municipalité
            </Button>
            
            <div className="p-3 bg-purple-50 rounded-lg text-sm">
              <p className="text-purple-800">
                <strong>💡 Note :</strong> Si aucune entente n'existe pour une municipalité, tous les services seront facturés selon les tarifs par défaut.
              </p>
            </div>
            
            {/* Tarifs par défaut */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium text-gray-700 mb-3">📋 Tarifs par défaut (sans entente)</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Tarif véhicule/h ($)</label>
                  <input
                    type="number"
                    value={settings.tarif_defaut_vehicule ?? 200}
                    onChange={(e) => setSettings({ ...settings, tarif_defaut_vehicule: parseFloat(e.target.value) })}
                    className="w-full border rounded p-2"
                    step="5"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tarif pompier/h ($)</label>
                  <input
                    type="number"
                    value={settings.tarif_defaut_pompier ?? 45}
                    onChange={(e) => setSettings({ ...settings, tarif_defaut_pompier: parseFloat(e.target.value) })}
                    className="w-full border rounded p-2"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Tarif APRIA ($)</label>
                  <input
                    type="number"
                    value={settings.tarif_defaut_apria ?? 30}
                    onChange={(e) => setSettings({ ...settings, tarif_defaut_apria: parseFloat(e.target.value) })}
                    className="w-full border rounded p-2"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Minimum heures (h)</label>
                  <input
                    type="number"
                    value={settings.minimum_heures_defaut ?? 2}
                    onChange={(e) => setSettings({ ...settings, minimum_heures_defaut: parseFloat(e.target.value) })}
                    className="w-full border rounded p-2"
                    step="0.5"
                    min="0"
                  />
                </div>
              </div>
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
