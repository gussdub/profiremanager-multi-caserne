import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import useModalScrollLock from '../hooks/useModalScrollLock';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

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

  // Bloquer le scroll du body
  useModalScrollLock(true);

  const API = `${BACKEND_URL}/api/${tenantSlug}`;

  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  useEffect(() => {
    fetchDetails();
    fetchReferenceData();
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
  const isFireIncident = () => {
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
    
    if (isFireIncident()) {
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
      const response = await fetch(`${API}/interventions/${intervention.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast({ title: "Succès", description: "Intervention mise à jour" });
        setEditMode(false);
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

  const handleValidate = async (action) => {
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
        body: JSON.stringify({ action })
      });

      if (response.ok) {
        toast({ title: "Succès", description: action === 'sign' ? "Intervention signée" : "Statut mis à jour" });
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

        {/* Navigation - Style distinct du header */}
        <div className="flex gap-2 px-4 py-3 border-b border-gray-200 bg-white overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {visibleSections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap text-sm flex-shrink-0 ${
                activeSection === section.id
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {section.icon} {section.label}
            </button>
          ))}
        </div>

        {/* Contenu - scroll interne avec overscroll-behavior */}
        <div className="flex-1 overflow-y-auto p-6" style={{ overscrollBehavior: 'contain' }}>
          {activeSection === 'identification' && (
            <SectionIdentification 
              formData={formData} 
              setFormData={setFormData}
              editMode={editMode && !isLocked}
              formatDateTime={formatDateTime}
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
                {formData.status === 'draft' || formData.status === 'new' ? (
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
                      onClick={() => handleValidate('return_for_revision')}
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
      </div>
    </div>,
    document.body
  );
};


// ==================== SECTIONS DU FORMULAIRE DSI ====================

const SectionIdentification = ({ formData, setFormData, editMode, formatDateTime }) => {
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
              {formData.xml_comments.map((comment, i) => (
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

const SectionRessources = ({ vehicles, resources, formData }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">🚒 Véhicules déployés ({vehicles.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {vehicles.length === 0 ? (
            <p className="text-gray-500">Aucun véhicule enregistré</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {vehicles.map(vehicle => (
                <div key={vehicle.id} className="bg-gray-50 p-3 rounded-lg border">
                  <div className="font-bold text-lg">{vehicle.xml_vehicle_number}</div>
                  <div className="text-sm text-gray-600">
                    👥 {vehicle.crew_count} pompier(s)
                  </div>
                  <div className="text-xs text-gray-500">
                    {vehicle.xml_status || 'Statut inconnu'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">👥 Personnel sur les lieux ({resources.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {resources.length === 0 ? (
            <p className="text-gray-500">Aucune ressource humaine enregistrée</p>
          ) : (
            <div className="space-y-2">
              {resources.map(resource => (
                <div key={resource.id} className="flex justify-between items-center bg-gray-50 p-2 rounded">
                  <span>{resource.user_id || 'Non assigné'}</span>
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {resource.role_on_scene}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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


// ==================== SECTION PERTES ET VICTIMES ====================

const SectionPertes = ({ formData, setFormData, editMode }) => {
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
                value={formData.estimated_loss_building || 0}
                onChange={(e) => setFormData({ ...formData, estimated_loss_building: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dommages au contenu ($)
              </label>
              <input
                type="number"
                value={formData.estimated_loss_content || 0}
                onChange={(e) => setFormData({ ...formData, estimated_loss_content: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div className="md:col-span-2 bg-gray-50 p-3 rounded-lg">
              <p className="text-lg font-bold text-gray-800">
                Total des pertes: {((formData.estimated_loss_building || 0) + (formData.estimated_loss_content || 0)).toLocaleString('fr-CA')} $
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
                value={formData.evacuated_count || 0}
                onChange={(e) => setFormData({ ...formData, evacuated_count: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
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
                value={formData.civilian_injuries_minor || 0}
                onChange={(e) => setFormData({ ...formData, civilian_injuries_minor: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={formData.civilian_injuries_major || 0}
                onChange={(e) => setFormData({ ...formData, civilian_injuries_major: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={formData.civilian_deaths || 0}
                onChange={(e) => setFormData({ ...formData, civilian_deaths: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
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
                value={formData.firefighter_injuries_minor || 0}
                onChange={(e) => setFormData({ ...formData, firefighter_injuries_minor: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={formData.firefighter_injuries_major || 0}
                onChange={(e) => setFormData({ ...formData, firefighter_injuries_major: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={formData.firefighter_deaths || 0}
                onChange={(e) => setFormData({ ...formData, firefighter_deaths: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2 bg-red-50"
              />
            </div>
          </div>

          {(formData.civilian_deaths > 0 || formData.firefighter_deaths > 0) && (
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

const SectionNarratif = ({ formData, setFormData, editMode }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">📝 Rapport narratif</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <textarea
            value={formData.narrative || ''}
            onChange={(e) => setFormData({ ...formData, narrative: e.target.value })}
            disabled={!editMode}
            placeholder="Décrivez le déroulement de l'intervention..."
            className="w-full border border-gray-300 rounded-lg p-3 min-h-[300px]"
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

          {/* Résumé */}
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>{(settings.personnes_ressources || []).length}</strong> personne(s) ressource(s) désignée(s)
            </p>
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
