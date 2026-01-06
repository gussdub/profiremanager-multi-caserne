import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import MesEPI from "./MesEPI";
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import InspectionUnifieeModal from './InspectionUnifieeModal';

const ModuleEPI = ({ user }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventaire');
  
  // États inventaire
  const [epis, setEpis] = useState([]);
  const [selectedEPI, setSelectedEPI] = useState(null);
  const [showEPIModal, setShowEPIModal] = useState(false);
  const [selectedDemandeRemplacement, setSelectedDemandeRemplacement] = useState(null);
  const [showRemplacementModal, setShowRemplacementModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [users, setUsers] = useState([]);
  
  const [epiForm, setEpiForm] = useState({
    numero_serie: '',
    type_epi: 'casque',
    marque: '',
    modele: '',
    numero_serie_fabricant: '',
    date_fabrication: '',
    date_mise_en_service: new Date().toISOString().split('T')[0],
    norme_certification: 'NFPA 1971',
    cout_achat: 0,
    couleur: '',
    taille: '',
    user_id: '',
    statut: 'En service',
    notes: ''
  });
  
  // États inspections
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [typeInspection, setTypeInspection] = useState('apres_utilisation');
  const [inspections, setInspections] = useState([]);
  const [inspectionForm, setInspectionForm] = useState({
    date_inspection: new Date().toISOString().split('T')[0],
    inspecteur_nom: '',
    inspecteur_id: '',
    isp_id: '',
    isp_nom: '',
    isp_accreditations: '',
    statut_global: 'conforme',
    checklist: {},
    commentaires: ''
  });
  
  // États ISP
  const [isps, setIsps] = useState([]);
  const [showISPModal, setShowISPModal] = useState(false);
  const [selectedISP, setSelectedISP] = useState(null);
  const [ispForm, setIspForm] = useState({
    nom: '',
    contact: '',
    telephone: '',
    email: '',
    accreditations: '',
    notes: ''
  });
  
  // États demandes de remplacement EPI
  const [demandesRemplacementEPI, setDemandesRemplacementEPI] = useState([]);
  
  // États rapports
  const [rapportConformite, setRapportConformite] = useState(null);
  const [rapportEcheances, setRapportEcheances] = useState(null);
  
  // États Phase 2 - Nettoyages
  const [nettoyages, setNettoyages] = useState([]);
  const [showNettoyageModal, setShowNettoyageModal] = useState(false);
  const [nettoyageForm, setNettoyageForm] = useState({
    type_nettoyage: 'routine',
    date_nettoyage: new Date().toISOString().split('T')[0],
    methode: 'laveuse_extractrice',
    effectue_par: '',
    effectue_par_id: user?.id || '',
    isp_id: '',
    nombre_cycles: 1,
    temperature: '',
    produits_utilises: '',
    notes: ''
  });
  
  // États Phase 2 - Réparations
  const [reparations, setReparations] = useState([]);
  const [showReparationModal, setShowReparationModal] = useState(false);
  const [selectedReparation, setSelectedReparation] = useState(null);
  const [reparationForm, setReparationForm] = useState({
    statut: 'demandee',
    date_demande: new Date().toISOString().split('T')[0],
    demandeur: user ? `${user.prenom} ${user.nom}` : '',
    demandeur_id: user?.id || '',
    reparateur_type: 'interne',
    reparateur_nom: '',
    isp_id: '',
    probleme_description: '',
    notes: ''
  });
  
  // États Phase 2 - Retrait
  const [showRetraitModal, setShowRetraitModal] = useState(false);
  const [retraitForm, setRetraitForm] = useState({
    date_retrait: new Date().toISOString().split('T')[0],
    raison: 'age_limite',
    description_raison: '',
    methode_disposition: 'coupe_detruit',
    preuve_disposition: [],
    certificat_disposition_url: '',
    cout_disposition: 0,
    retire_par: user ? `${user.prenom} ${user.nom}` : '',
    retire_par_id: user?.id || '',
    notes: ''
  });
  
  // États Phase 2 - Rapports avancés
  const [rapportRetraits, setRapportRetraits] = useState(null);
  const [rapportTCO, setRapportTCO] = useState(null);
  
  // États pour l'inspection unifiée (nouveau système de formulaires)
  const [showUnifiedInspectionModal, setShowUnifiedInspectionModal] = useState(false);
  const [formulairesEPI, setFormulairesEPI] = useState([]);
  const [selectedFormulaireEPI, setSelectedFormulaireEPI] = useState(null);
  
  // Types EPI - chargés dynamiquement depuis l'API
  const [typesEPI, setTypesEPI] = useState([
    { id: 'casque', nom: 'Casque', icone: '⛑️' },
    { id: 'bottes', nom: 'Bottes', icone: '🥾' },
    { id: 'veste_bunker', nom: 'Manteau Habit de Combat', icone: '🧥' },
    { id: 'pantalon_bunker', nom: 'Pantalon Habit de Combat', icone: '👖' },
    { id: 'gants', nom: 'Gants', icone: '🧤' },
    { id: 'cagoule', nom: 'Cagoule Anti-Particules', icone: '🎭' }
  ]);
  
  // Charger les types EPI depuis l'API
  useEffect(() => {
    const fetchTypesEPI = async () => {
      try {
        const data = await apiGet(tenantSlug, '/types-epi');
        if (data && data.length > 0) {
          // Mapper les données pour utiliser le nom comme ID (pour compatibilité)
          setTypesEPI(data.map(t => ({
            id: t.nom,  // Utiliser le nom comme ID pour compatibilité
            nom: t.nom,
            icone: t.icone
          })));
        }
      } catch (error) {
        console.log('Types EPI par défaut utilisés');
      }
    };
    if (tenantSlug) {
      fetchTypesEPI();
    }
  }, [tenantSlug]);
  
  // Charger les formulaires d'inspection EPI (système unifié)
  useEffect(() => {
    const loadFormulairesEPI = async () => {
      try {
        const formulaires = await apiGet(tenantSlug, '/formulaires-inspection');
        // Filtrer les formulaires applicables aux EPI
        const epiFormulaires = (formulaires || []).filter(f => 
          f.categories_cibles?.some(c => c.startsWith('epi_')) ||
          f.type === 'inspection_epi'
        );
        setFormulairesEPI(epiFormulaires);
      } catch (error) {
        console.log('Formulaires EPI non chargés:', error);
      }
    };
    if (tenantSlug) {
      loadFormulairesEPI();
    }
  }, [tenantSlug]);
  
  // Checklists NFPA 1851
  const getChecklistTemplate = (type) => {
    if (type === 'apres_utilisation') {
      return {
        propre: 'oui',
        degradation_visible: 'non',
        fermetures_fonctionnelles: 'oui',
        bandes_reflechissantes_intactes: 'oui'
      };
    } else if (type === 'routine_mensuelle') {
      return {
        etat_coutures: 'bon',
        fermetures_eclair: 'bon',
        bandes_reflechissantes: 'bon',
        usure_generale: 'bon',
        dommages_thermiques: 'non',
        dommages_chimiques: 'non',
        dommages_mecaniques: 'non',
        integrite_coque: 'bon',
        etat_doublure: 'bon',
        barriere_humidite: 'bon',
        quincaillerie: 'bon',
        ajustement_mobilite: 'bon'
      };
    } else {
      return {
        etat_coutures: 'bon',
        fermetures_eclair: 'bon',
        bandes_reflechissantes: 'bon',
        usure_generale: 'bon',
        dommages_thermiques: 'non',
        dommages_chimiques: 'non',
        dommages_mecaniques: 'non',
        integrite_coque: 'bon',
        etat_doublure: 'bon',
        barriere_humidite: 'bon',
        quincaillerie: 'bon',
        ajustement_mobilite: 'bon',
        inspection_detaillee_doublure: 'bon',
        separation_doublure: 'non',
        bulles_delamination: 'non',
        coutures_cachees: 'bon',
        test_ajustement_complet: 'bon',
        condition_etiquettes: 'bon'
      };
    }
  };
  
  useEffect(() => {
    if (tenantSlug && user) {
      loadData();
      setInspectionForm(prev => ({
        ...prev,
        inspecteur_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
        inspecteur_id: user?.id || ''
      }));
    }
  }, [tenantSlug, user]);
  
  useEffect(() => {
    if (activeTab === 'rapports' && tenantSlug) {
      loadRapports();
    }
  }, [activeTab, tenantSlug]);
  
  useEffect(() => {
    if (activeTab === 'demandes') {
      loadDemandesRemplacementEPI();
    }
  }, [activeTab]);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const [episData, ispsData, usersData] = await Promise.all([
        apiGet(tenantSlug, '/epi'),
        apiGet(tenantSlug, '/isp'),
        apiGet(tenantSlug, '/users')
      ]);
      setEpis(episData || []);
      setIsps(ispsData || []);
      setUsers(usersData || []);
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    }
    setLoading(false);
  };
  
  const loadRapports = async () => {
    try {
      const [conformite, echeances, retraits, tco] = await Promise.all([
        apiGet(tenantSlug, '/epi/rapports/conformite'),
        apiGet(tenantSlug, '/epi/rapports/echeances?jours=30'),
        apiGet(tenantSlug, '/epi/rapports/retraits-prevus?mois=12'),
        apiGet(tenantSlug, '/epi/rapports/cout-total')
      ]);
      setRapportConformite(conformite);
      setRapportEcheances(echeances);
      setRapportRetraits(retraits);
      setRapportTCO(tco);
    } catch (error) {
      console.error('Erreur rapports:', error);
    }
  };
  
  const loadDemandesRemplacementEPI = async () => {
    try {
      const data = await apiGet(tenantSlug, '/epi/demandes-remplacement');
      setDemandesRemplacementEPI(data || []);
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    }
  };
  
  const loadInspections = async (epiId) => {
    try {
      const data = await apiGet(tenantSlug, `/epi/${epiId}/inspections`);
      setInspections(data || []);
    } catch (error) {
      console.error('Erreur inspections:', error);
    }
  };
  
  // Phase 2 - Charger nettoyages
  const loadNettoyages = async (epiId) => {
    try {
      const data = await apiGet(tenantSlug, `/epi/${epiId}/nettoyages`);
      setNettoyages(data || []);
    } catch (error) {
      console.error('Erreur nettoyages:', error);
    }
  };
  
  // Phase 2 - Charger réparations
  const loadReparations = async (epiId) => {
    try {
      const data = await apiGet(tenantSlug, `/epi/${epiId}/reparations`);
      setReparations(data || []);
    } catch (error) {
      console.error('Erreur réparations:', error);
    }
  };
  
  // CRUD EPI
  const handleSaveEPI = async () => {
    try {
      if (selectedEPI) {
        await apiPut(tenantSlug, `/epi/${selectedEPI.id}`, epiForm);
        toast({ title: "Succès", description: "EPI modifié" });
      } else {
        await apiPost(tenantSlug, '/epi', epiForm);
        toast({ title: "Succès", description: "EPI créé" });
      }
      setShowEPIModal(false);
      loadData();
      resetEPIForm();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteEPI = async (epiId) => {
    if (!window.confirm('Supprimer cet EPI ?')) return;
    try {
      await apiDelete(tenantSlug, `/epi/${epiId}`);
      toast({ title: "Succès", description: "EPI supprimé" });
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const resetEPIForm = () => {
    setEpiForm({
      numero_serie: '',
      type_epi: 'casque',
      marque: '',
      modele: '',
      numero_serie_fabricant: '',
      date_fabrication: '',
      date_mise_en_service: new Date().toISOString().split('T')[0],
      norme_certification: 'NFPA 1971',
      cout_achat: 0,
      couleur: '',
      taille: '',
      user_id: '',
      statut: 'En service',
      notes: ''
    });
    setSelectedEPI(null);
  };
  
  const openEditEPI = (epi) => {
    setSelectedEPI(epi);
    setEpiForm({
      numero_serie: epi.numero_serie,
      type_epi: epi.type_epi,
      marque: epi.marque,
      modele: epi.modele,
      numero_serie_fabricant: epi.numero_serie_fabricant || '',
      date_fabrication: epi.date_fabrication || '',
      date_mise_en_service: epi.date_mise_en_service,
      norme_certification: epi.norme_certification || 'NFPA 1971',
      cout_achat: epi.cout_achat || 0,
      couleur: epi.couleur || '',
      taille: epi.taille || '',
      user_id: epi.user_id || '',
      statut: epi.statut,
      notes: epi.notes || ''
    });
    setShowEPIModal(true);
  };
  
  const openDetailEPI = async (epi) => {
    setSelectedEPI(epi);
    await Promise.all([
      loadInspections(epi.id),
      loadNettoyages(epi.id),
      loadReparations(epi.id)
    ]);
    setShowDetailModal(true);
  };
  
  // Inspections
  const handleSaveInspection = async () => {
    try {
      const data = {
        ...inspectionForm,
        type_inspection: typeInspection,
        checklist: getChecklistTemplate(typeInspection)
      };
      await apiPost(tenantSlug, `/epi/${selectedEPI.id}/inspection`, data);
      toast({ title: "Succès", description: "Inspection enregistrée" });
      setShowInspectionModal(false);
      loadInspections(selectedEPI.id);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  // ISP
  const handleSaveISP = async () => {
    try {
      if (selectedISP) {
        await apiPut(tenantSlug, `/isp/${selectedISP.id}`, ispForm);
        toast({ title: "Succès", description: "Fournisseur modifié" });
      } else {
        await apiPost(tenantSlug, '/isp', ispForm);
        toast({ title: "Succès", description: "Fournisseur ajouté" });
      }
      setShowISPModal(false);
      loadData();
      resetISPForm();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const handleDeleteISP = async (ispId) => {
    if (!window.confirm('Supprimer ce fournisseur ?')) return;
    try {
      await apiDelete(tenantSlug, `/isp/${ispId}`);
      toast({ title: "Succès", description: "Fournisseur supprimé" });
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const resetISPForm = () => {
    setIspForm({
      nom: '',
      contact: '',
      telephone: '',
      email: '',
      accreditations: '',
      notes: ''
    });
    setSelectedISP(null);
  };
  
  const openEditISP = (isp) => {
    setSelectedISP(isp);
    setIspForm({
      nom: isp.nom,
      contact: isp.contact || '',
      telephone: isp.telephone || '',
      email: isp.email || '',
      accreditations: isp.accreditations || '',
      notes: isp.notes || ''
    });
    setShowISPModal(true);
  };

  // Phase 2 - Handlers Nettoyage
  const handleSaveNettoyage = async () => {
    try {
      const data = {
        ...nettoyageForm,
        effectue_par: nettoyageForm.effectue_par || `${user?.prenom || ''} ${user?.nom || ''}`
      };
      await apiPost(tenantSlug, `/epi/${selectedEPI.id}/nettoyage`, data);
      toast({ title: "Succès", description: "Nettoyage enregistré" });
      setShowNettoyageModal(false);
      loadNettoyages(selectedEPI.id);
      setNettoyageForm({
        type_nettoyage: 'routine',
        date_nettoyage: new Date().toISOString().split('T')[0],
        methode: 'laveuse_extractrice',
        effectue_par: '',
        effectue_par_id: user?.id || '',
        isp_id: '',
        nombre_cycles: 1,
        temperature: '',
        produits_utilises: '',
        notes: ''
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  // Phase 2 - Handlers Réparation
  const handleSaveReparation = async () => {
    try {
      if (selectedReparation) {
        await apiPut(tenantSlug, `/epi/${selectedEPI.id}/reparation/${selectedReparation.id}`, reparationForm);
        toast({ title: "Succès", description: "Réparation mise à jour" });
      } else {
        const data = {
          ...reparationForm,
          demandeur: reparationForm.demandeur || `${user?.prenom || ''} ${user?.nom || ''}`
        };
        await apiPost(tenantSlug, `/epi/${selectedEPI.id}/reparation`, data);
        toast({ title: "Succès", description: "Réparation créée" });
      }
      setShowReparationModal(false);
      loadReparations(selectedEPI.id);
      setSelectedReparation(null);
      setReparationForm({
        statut: 'demandee',
        date_demande: new Date().toISOString().split('T')[0],
        demandeur: `${user?.prenom} ${user?.nom}` || '',
        demandeur_id: user?.id || '',
        reparateur_type: 'interne',
        reparateur_nom: '',
        isp_id: '',
        probleme_description: '',
        notes: ''
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const openEditReparation = (reparation) => {
    setSelectedReparation(reparation);
    setReparationForm({
      statut: reparation.statut,
      date_demande: reparation.date_demande,
      demandeur: reparation.demandeur,
      demandeur_id: reparation.demandeur_id || '',
      reparateur_type: reparation.reparateur_type,
      reparateur_nom: reparation.reparateur_nom || '',
      isp_id: reparation.isp_id || '',
      probleme_description: reparation.probleme_description,
      notes: reparation.notes || ''
    });
    setShowReparationModal(true);
  };
  
  // Phase 2 - Handlers Retrait
  const handleSaveRetrait = async () => {
    try {
      await apiPost(tenantSlug, `/epi/${selectedEPI.id}/retrait`, retraitForm);
      toast({ title: "Succès", description: "EPI retiré avec succès" });
      setShowRetraitModal(false);
      setShowDetailModal(false);
      loadData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Erreur",
        variant: "destructive"
      });
    }
  };
  
  const getTypeIcon = (type) => typesEPI.find(t => t.id === type)?.icone || '🛡️';
  const getTypeName = (type) => typesEPI.find(t => t.id === type)?.nom || type;
  const getStatutColor = (statut) => {
    const colors = {
      'En service': '#10B981',
      'En inspection': '#F59E0B',
      'En réparation': '#EF4444',
      'Hors service': '#DC2626',
      'Retiré': '#6B7280'
    };
    return colors[statut] || '#6B7280';
  };
  
  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.prenom} ${user.nom}` : 'Non assigné';
  };
  
  if (loading) {
    return (
      <div className="module-container">
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    );
  }
  
  return (
    <div className="module-epi-nfpa">
      <div className="module-header">
        <div>
          <h1>🛡️ Gestion EPI - NFPA 1851</h1>
          <p>Système complet de gestion des équipements de protection</p>
        </div>
      </div>
      
      {/* Onglets */}
      <div className="epi-tabs">
        <button 
          className={activeTab === 'inventaire' ? 'active' : ''}
          onClick={() => setActiveTab('inventaire')}
        >
          📦 Inventaire ({epis.length})
        </button>
        <button 
          className={activeTab === 'demandes' ? 'active' : ''}
          onClick={() => setActiveTab('demandes')}
        >
          🔄 Demandes de remplacement
        </button>
        <button 
          className={activeTab === 'nettoyage' ? 'active' : ''}
          onClick={() => setActiveTab('nettoyage')}
        >
          🧼 Nettoyage & Entretien
        </button>
        <button 
          className={activeTab === 'reparations' ? 'active' : ''}
          onClick={() => setActiveTab('reparations')}
        >
          🔧 Réparations
        </button>
        <button 
          className={activeTab === 'isp' ? 'active' : ''}
          onClick={() => setActiveTab('isp')}
        >
          🏢 Fournisseurs ISP ({isps.length})
        </button>
        <button 
          className={activeTab === 'rapports' ? 'active' : ''}
          onClick={() => setActiveTab('rapports')}
        >
          📊 Rapports
        </button>
      </div>
      
      {/* ONGLET INVENTAIRE */}
      {activeTab === 'inventaire' && (
        <div className="epi-inventaire">
          <div className="inventaire-actions">
            <Button onClick={() => { resetEPIForm(); setShowEPIModal(true); }}>
              ➕ Nouvel EPI
            </Button>
          </div>
          
          <div className="epi-grid">
            {epis.map(epi => (
              <div key={epi.id} className="epi-card">
                <div className="epi-card-header">
                  <span className="epi-icon">{getTypeIcon(epi.type_epi)}</span>
                  <div>
                    <h3>{getTypeName(epi.type_epi)}</h3>
                    <p className="epi-numero">#{epi.numero_serie}</p>
                  </div>
                  <span 
                    className="epi-statut-badge" 
                    style={{ backgroundColor: getStatutColor(epi.statut) }}
                  >
                    {epi.statut}
                  </span>
                </div>
                <div className="epi-card-body">
                  <p><strong>Marque:</strong> {epi.marque}</p>
                  <p><strong>Modèle:</strong> {epi.modele}</p>
                  <p><strong>Assigné à:</strong> {getUserName(epi.user_id)}</p>
                  <p><strong>Mise en service:</strong> {new Date(epi.date_mise_en_service).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="epi-card-actions">
                  <Button size="sm" variant="outline" onClick={() => openDetailEPI(epi)}>
                    📋 Détails
                  </Button>
                  <Button size="sm" onClick={() => openEditEPI(epi)}>
                    ✏️ Modifier
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteEPI(epi.id)}>
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          {epis.length === 0 && (
            <div className="empty-state">
              <p>Aucun EPI enregistré</p>
              <Button onClick={() => { resetEPIForm(); setShowEPIModal(true); }}>
                Créer le premier EPI
              </Button>
            </div>
          )}
        </div>
      )}
      
      {/* ONGLET DEMANDES DE REMPLACEMENT */}
      {activeTab === 'demandes' && (
        <div className="epi-demandes">
          <div className="demandes-header">
            <h2>🔄 Demandes de remplacement EPI</h2>
            <p>Gérer les demandes de remplacement des employés</p>
          </div>
          
          {/* Statistiques */}
          <div className="demandes-stats">
            <div className="stat-card">
              <h3>{demandesRemplacementEPI.filter(d => d.statut === 'En attente').length}</h3>
              <p>En attente</p>
            </div>
            <div className="stat-card">
              <h3>{demandesRemplacementEPI.filter(d => d.statut === 'Approuvée').length}</h3>
              <p>Approuvées</p>
            </div>
            <div className="stat-card">
              <h3>{demandesRemplacementEPI.filter(d => d.statut === 'Refusée').length}</h3>
              <p>Refusées</p>
            </div>
          </div>

          {/* Liste des demandes */}
          <div className="demandes-list">
            {demandesRemplacementEPI.length === 0 ? (
              <div className="empty-state">
                <p>Aucune demande de remplacement</p>
              </div>
            ) : (
              demandesRemplacementEPI.map(demande => {
                const epi = epis.find(e => e.id === demande.epi_id);
                const employe = users.find(u => u.id === demande.user_id);
                
                return (
                  <div key={demande.id} className="demande-card">
                    <div className="demande-header">
                      <div className="demande-info">
                        <h4>{epi ? `${getTypeIcon(epi.type_epi)} ${getTypeName(epi.type_epi)} - #${epi.numero_serie}` : 'EPI inconnu'}</h4>
                        <p>Demandé par: <strong>{employe ? `${employe.prenom} ${employe.nom}` : 'Inconnu'}</strong></p>
                        <p>Date: {new Date(demande.date_demande).toLocaleDateString('fr-FR')} à {new Date(demande.date_demande).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <span 
                        className="demande-statut-badge" 
                        style={{
                          backgroundColor: 
                            demande.statut === 'En attente' ? '#F59E0B' :
                            demande.statut === 'Approuvée' ? '#10B981' :
                            '#EF4444'
                        }}
                      >
                        {demande.statut}
                      </span>
                    </div>
                    
                    <div className="demande-body">
                      <p><strong>Raison:</strong> {demande.raison}</p>
                      {demande.notes_employe && (
                        <p><strong>Détails:</strong> {demande.notes_employe}</p>
                      )}
                      {demande.notes_admin && (
                        <p><strong>Notes admin:</strong> {demande.notes_admin}</p>
                      )}
                    </div>

                    {demande.statut === 'En attente' && (
                      <div className="demande-actions">
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedDemandeRemplacement(demande);
                            setShowRemplacementModal(true);
                          }}
                        >
                          ✅ Approuver & Remplacer
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={async () => {
                            try {
                              await apiPost(tenantSlug, `/epi/demandes-remplacement/${demande.id}/refuser`, {
                                notes_admin: 'Demande refusée'
                              });
                              toast({ title: "Succès", description: "Demande refusée" });
                              loadDemandesRemplacementEPI();
                            } catch (error) {
                              toast({ title: "Erreur", description: "Impossible de refuser la demande", variant: "destructive" });
                            }
                          }}
                        >
                          ❌ Refuser
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ONGLET ISP */}
      {activeTab === 'isp' && (
        <div className="epi-isp">
          <div className="isp-actions">
            <Button onClick={() => { resetISPForm(); setShowISPModal(true); }}>
              ➕ Nouveau Fournisseur
            </Button>
          </div>
          
          <div className="isp-list">
            {isps.map(isp => (
              <div key={isp.id} className="isp-card">
                <div className="isp-header">
                  <h3>🏢 {isp.nom}</h3>
                </div>
                <div className="isp-body">
                  <p><strong>Contact:</strong> {isp.contact}</p>
                  <p><strong>Téléphone:</strong> {isp.telephone}</p>
                  <p><strong>Email:</strong> {isp.email}</p>
                  <p><strong>Accréditations:</strong> {isp.accreditations || 'Aucune'}</p>
                </div>
                <div className="isp-actions">
                  <Button size="sm" onClick={() => openEditISP(isp)}>
                    ✏️ Modifier
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDeleteISP(isp.id)}>
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </div>
          
          {isps.length === 0 && (
            <div className="empty-state">
              <p>Aucun fournisseur enregistré</p>
              <Button onClick={() => { resetISPForm(); setShowISPModal(true); }}>
                Ajouter un fournisseur
              </Button>
            </div>
          )}
        </div>
      )}
      

      {/* ONGLET NETTOYAGE & ENTRETIEN */}
      {activeTab === 'nettoyage' && (
        <div className="epi-nettoyage">
          <div className="nettoyage-header">
            <h2>🧼 Nettoyage & Entretien</h2>
            <p>Suivi des nettoyages routines et avancés selon NFPA 1851</p>
          </div>
          
          <div className="nettoyage-info-card">
            <h3>📋 Exigences NFPA 1851</h3>
            <ul>
              <li><strong>Nettoyage Routine:</strong> Après chaque utilisation ou contamination visible</li>
              <li><strong>Nettoyage Avancé:</strong> Au moins 2 fois par an minimum</li>
              <li><strong>Méthode recommandée:</strong> Laveuse extractrice avec cycle programmable</li>
              <li><strong>Température:</strong> Eau tiède maximum 40°C</li>
              <li><strong>Séchage:</strong> À l'abri des UV</li>
            </ul>
          </div>
          
          <div className="nettoyage-list">
            <h3>EPIs en nettoyage ({epis.filter(e => e.statut === 'En nettoyage' || e.statut === 'En maintenance').length})</h3>
            {epis.filter(e => e.statut === 'En nettoyage' || e.statut === 'En maintenance').length === 0 ? (
              <div className="empty-state">
                <p>Aucun EPI en nettoyage actuellement</p>
              </div>
            ) : (
              epis.filter(e => e.statut === 'En nettoyage' || e.statut === 'En maintenance').map(epi => (
                <div key={epi.id} className="nettoyage-epi-card">
                  <div className="nettoyage-epi-header">
                    <span>{getTypeIcon(epi.type_epi)} {getTypeName(epi.type_epi)}</span>
                    <span>#{epi.numero_serie}</span>
                    <Button 
                      size="sm"
                      onClick={async () => {
                        setSelectedEPI(epi);
                        await loadNettoyages(epi.id);
                        setShowNettoyageModal(true);
                      }}
                    >
                      ➕ Ajouter nettoyage
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      
      {/* ONGLET RÉPARATIONS */}
      {activeTab === 'reparations' && (
        <div className="epi-reparations">
          <div className="reparations-header">
            <h2>🔧 Gestion des Réparations</h2>
            <p>Suivi des tickets de réparation et interventions</p>
          </div>
          
          <div className="reparations-stats">
            <div className="stat-card">
              <h3>{epis.filter(e => e.statut === 'En réparation').length}</h3>
              <p>En cours</p>
            </div>
          </div>
          
          <div className="reparations-list">
            <h3>EPIs en réparation ({epis.filter(e => e.statut === 'En réparation').length})</h3>
            {epis.filter(e => e.statut === 'En réparation').length === 0 ? (
              <div className="empty-state">
                <p>Aucun EPI en réparation actuellement</p>
              </div>
            ) : (
              epis.filter(e => e.statut === 'En réparation').map(epi => (
                <div key={epi.id} className="reparation-epi-card">
                  <div className="reparation-epi-header">
                    <span>{getTypeIcon(epi.type_epi)} {getTypeName(epi.type_epi)} - #{epi.numero_serie}</span>
                    <span className="epi-statut-badge" style={{backgroundColor: getStatutColor(epi.statut)}}>
                      {epi.statut}
                    </span>
                    <Button 
                      size="sm"
                      onClick={async () => {
                        setSelectedEPI(epi);
                        await loadReparations(epi.id);
                        setSelectedReparation(null);
                        setShowReparationModal(true);
                      }}
                    >
                      ➕ Nouvelle réparation
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ONGLET RAPPORTS */}
      {activeTab === 'rapports' && !rapportConformite && (
        <div className="epi-rapports">
          <div className="loading-state" style={{textAlign: 'center', padding: '3rem'}}>
            <p>Chargement des rapports...</p>
          </div>
        </div>
      )}
      
      {activeTab === 'rapports' && rapportConformite && (
        <div className="epi-rapports">
          {/* Filtres et Exports */}
          <div className="rapports-controls">
            <div className="filtres-section">
                  <h3>🔍 Filtres</h3>
                  <div className="filtres-grid">
                    <div>
                      <Label>Employé</Label>
                      <select className="form-select">
                        <option value="">Tous les employés</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <Label>Type d'EPI</Label>
                      <select className="form-select">
                        <option value="">Tous les types</option>
                        {typesEPI.map(t => (
                          <option key={t.id} value={t.id}>{t.icone} {t.nom}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <Label>Date début</Label>
                      <Input type="date" />
                    </div>
                    
                    <div>
                      <Label>Date fin</Label>
                      <Input type="date" />
                    </div>
                  </div>
                </div>
                
                <div className="exports-section">
                  <h3>📥 Exporter</h3>
                  <div className="exports-buttons">
                    <Button variant="outline">
                      📄 Export PDF
                    </Button>
                    <Button variant="outline">
                      📊 Export Excel
                    </Button>
                  </div>
                </div>
              </div>
              
              <h2>📊 Rapport de Conformité Générale</h2>
              <div className="rapport-stats">
            <div className="stat-card">
              <h3>{rapportConformite.total}</h3>
              <p>Total EPI</p>
            </div>
            <div className="stat-card" style={{background: '#D1FAE5'}}>
              <h3>{rapportConformite.en_service}</h3>
              <p>En service</p>
            </div>
            <div className="stat-card" style={{background: '#FEF3C7'}}>
              <h3>{rapportConformite.en_inspection}</h3>
              <p>En inspection</p>
            </div>
            <div className="stat-card" style={{background: '#FEE2E2'}}>
              <h3>{rapportConformite.en_reparation}</h3>
              <p>En réparation</p>
            </div>
          </div>
          
          <h2 style={{marginTop: '2rem'}}>📅 Échéances d'Inspection (30 jours)</h2>
          {rapportEcheances && rapportEcheances.echeances.length > 0 ? (
            <div className="echeances-list">
              {rapportEcheances.echeances.map(epi => (
                <div key={epi.id} className="echeance-card">
                  <div>
                    <strong>{getTypeIcon(epi.type_epi)} {getTypeName(epi.type_epi)}</strong>
                    <p>#{epi.numero_serie}</p>
                  </div>
                  <div>
                    <span className={`jours-badge ${epi.jours_restants <= 7 ? 'urgent' : ''}`}>
                      {epi.jours_restants} jours restants
                    </span>
                    <p>Type: {epi.type_inspection_requise.replace('_', ' ')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Aucune échéance dans les 30 prochains jours</p>
          )}
          
          {/* Rapport Retraits Prévus - Phase 2 */}
          <h2 style={{marginTop: '3rem'}}>⏰ EPI à Retirer Prochainement (12 mois)</h2>
          {rapportRetraits && rapportRetraits.epis && rapportRetraits.epis.length > 0 ? (
            <div className="retraits-list">
              {rapportRetraits.epis.map(epi => (
                <div key={epi.id} className="retrait-card">
                  <div>
                    <strong>{getTypeIcon(epi.type_epi)} {getTypeName(epi.type_epi)}</strong>
                    <p>#{epi.numero_serie} - {epi.marque} {epi.modele}</p>
                  </div>
                  <div>
                    <span className="age-badge">
                      Âge: {epi.age_annees} ans
                    </span>
                    <span className={`jours-badge ${epi.jours_avant_limite <= 90 ? 'urgent' : ''}`}>
                      {epi.jours_avant_limite} jours avant limite
                    </span>
                    <p style={{fontSize: '0.85rem', color: '#666', marginTop: '0.5rem'}}>
                      Limite: {new Date(epi.date_limite_prevue).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Aucun EPI à retirer dans les 12 prochains mois</p>
          )}
          
          {/* Rapport TCO - Phase 2 */}
          <h2 style={{marginTop: '3rem'}}>💰 Coût Total de Possession (TCO)</h2>
          {rapportTCO && rapportTCO.epis && (
            <>
              <div className="tco-summary" style={{marginBottom: '1.5rem'}}>
                <div className="stat-card">
                  <h3>{rapportTCO.total_epis}</h3>
                  <p>Total EPI</p>
                </div>
                <div className="stat-card">
                  <h3>{rapportTCO.cout_total_flotte.toFixed(2)} $</h3>
                  <p>Coût Total Flotte</p>
                </div>
                <div className="stat-card">
                  <h3>{rapportTCO.cout_moyen_par_epi.toFixed(2)} $</h3>
                  <p>Coût Moyen/EPI</p>
                </div>
              </div>
              
              <div className="tco-list">
                {rapportTCO.epis.slice(0, 10).map(epi => (
                  <div key={epi.id} className="tco-card">
                    <div>
                      <strong>{getTypeIcon(epi.type_epi)} {getTypeName(epi.type_epi)}</strong>
                      <p>#{epi.numero_serie}</p>
                    </div>
                    <div className="tco-details">
                      <p><strong>Achat:</strong> {epi.cout_achat} $</p>
                      <p><strong>Nettoyages:</strong> {epi.cout_nettoyages} $ ({epi.nombre_nettoyages}x)</p>
                      <p><strong>Réparations:</strong> {epi.cout_reparations} $ ({epi.nombre_reparations}x)</p>
                      <p style={{fontWeight: 'bold', color: '#1F2937', marginTop: '0.5rem'}}>
                        Total: {epi.cout_total.toFixed(2)} $
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      
      {/* MODAL EPI */}
      {showEPIModal && (
        <div className="modal-overlay" onClick={() => setShowEPIModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedEPI ? 'Modifier EPI' : 'Nouvel EPI'}</h2>
              <Button variant="ghost" onClick={() => setShowEPIModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Numéro de série interne (optionnel)</Label>
                  <Input 
                    value={epiForm.numero_serie}
                    onChange={e => setEpiForm({...epiForm, numero_serie: e.target.value})}
                    placeholder="Généré automatiquement si vide (Ex: EPI-2025-0001)"
                  />
                  <small style={{display: 'block', marginTop: '4px', color: '#666'}}>
                    Laissez vide pour génération automatique
                  </small>
                </div>
                
                <div>
                  <Label>Type d'EPI *</Label>
                  <select 
                    className="form-select"
                    value={epiForm.type_epi}
                    onChange={e => setEpiForm({...epiForm, type_epi: e.target.value})}
                  >
                    {typesEPI.map(t => (
                      <option key={t.id} value={t.id}>{t.icone} {t.nom}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label>Marque *</Label>
                  <Input 
                    value={epiForm.marque}
                    onChange={e => setEpiForm({...epiForm, marque: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Modèle *</Label>
                  <Input 
                    value={epiForm.modele}
                    onChange={e => setEpiForm({...epiForm, modele: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>N° série fabricant</Label>
                  <Input 
                    value={epiForm.numero_serie_fabricant}
                    onChange={e => setEpiForm({...epiForm, numero_serie_fabricant: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Date fabrication</Label>
                  <Input 
                    type="date"
                    value={epiForm.date_fabrication}
                    onChange={e => setEpiForm({...epiForm, date_fabrication: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Date mise en service *</Label>
                  <Input 
                    type="date"
                    value={epiForm.date_mise_en_service}
                    onChange={e => setEpiForm({...epiForm, date_mise_en_service: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Norme certification</Label>
                  <Input 
                    value={epiForm.norme_certification}
                    onChange={e => setEpiForm({...epiForm, norme_certification: e.target.value})}
                    placeholder="Ex: NFPA 1971, édition 2018"
                  />
                </div>
                
                <div>
                  <Label>Coût d'achat</Label>
                  <Input 
                    type="number"
                    value={epiForm.cout_achat}
                    onChange={e => setEpiForm({...epiForm, cout_achat: parseFloat(e.target.value) || 0})}
                  />
                </div>
                
                <div>
                  <Label>Couleur</Label>
                  <Input 
                    value={epiForm.couleur}
                    onChange={e => setEpiForm({...epiForm, couleur: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Taille</Label>
                  <Input 
                    value={epiForm.taille}
                    onChange={e => setEpiForm({...epiForm, taille: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Assigné à</Label>
                  <select 
                    className="form-select"
                    value={epiForm.user_id}
                    onChange={e => setEpiForm({...epiForm, user_id: e.target.value})}
                  >
                    <option value="">Non assigné</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label>Statut *</Label>
                  <select 
                    className="form-select"
                    value={epiForm.statut}
                    onChange={e => setEpiForm({...epiForm, statut: e.target.value})}
                  >
                    <option>En service</option>
                    <option>En inspection</option>
                    <option>En réparation</option>
                    <option>Hors service</option>
                    <option>Retiré</option>
                  </select>
                </div>
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Notes</Label>
                <textarea 
                  className="form-textarea"
                  rows="3"
                  value={epiForm.notes}
                  onChange={e => setEpiForm({...epiForm, notes: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowEPIModal(false)}>Annuler</Button>
              <Button onClick={handleSaveEPI}>
                {selectedEPI ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL APPROBATION REMPLACEMENT EPI */}
      {showRemplacementModal && selectedDemandeRemplacement && (
        <div className="modal-overlay" onClick={() => setShowRemplacementModal(false)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✅ Approuver & Remplacer l'EPI</h3>
              <Button variant="ghost" onClick={() => setShowRemplacementModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              {(() => {
                const epi = epis.find(e => e.id === selectedDemandeRemplacement.epi_id);
                const employe = users.find(u => u.id === selectedDemandeRemplacement.user_id);
                
                return (
                  <>
                    <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                      <strong>📋 Demande de remplacement :</strong>
                      <p style={{ marginTop: '0.5rem' }}>
                        <strong>EPI actuel :</strong> {epi ? `${getTypeName(epi.type_epi)} - #${epi.numero_serie}` : 'Inconnu'}<br/>
                        <strong>Employé :</strong> {employe ? `${employe.prenom} ${employe.nom}` : 'Inconnu'}<br/>
                        <strong>Raison :</strong> {selectedDemandeRemplacement.raison}
                      </p>
                    </div>

                    <h4 style={{ marginBottom: '1rem' }}>🆕 Informations du nouvel EPI</h4>
                    
                    <div className="form-group">
                      <Label>Numéro de série *</Label>
                      <Input 
                        id="nouveau-numero-serie"
                        placeholder="Ex: NS-2025-001"
                      />
                    </div>

                    <div className="form-group">
                      <Label>Marque</Label>
                      <Input 
                        id="nouvelle-marque"
                        placeholder="Ex: MSA, Honeywell..."
                      />
                    </div>

                    <div className="form-group">
                      <Label>Modèle</Label>
                      <Input 
                        id="nouveau-modele"
                        placeholder="Ex: G1 SCBA, Cairns 1010..."
                      />
                    </div>

                    <div className="form-group">
                      <Label>Taille</Label>
                      <Input 
                        id="nouvelle-taille"
                        defaultValue={epi?.taille || ''}
                        placeholder="Ex: M, L, XL..."
                      />
                    </div>

                    <div className="form-group">
                      <Label>Date de mise en service *</Label>
                      <Input 
                        type="date"
                        id="nouvelle-date-service"
                        defaultValue={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="form-group">
                      <Label>Notes admin</Label>
                      <textarea 
                        id="notes-admin-remplacement"
                        className="form-control"
                        rows="3"
                        placeholder="Notes sur le remplacement..."
                        defaultValue="Remplacement approuvé et nouvel EPI attribué"
                      />
                    </div>

                    <div className="form-group">
                      <Label>Que faire avec l'ancien EPI ? *</Label>
                      <div style={{ marginTop: '0.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="action-ancien-epi" 
                            value="garder"
                            defaultChecked
                            style={{ marginRight: '0.5rem' }}
                          />
                          Garder en historique (statut "Retiré")
                        </label>
                        <label style={{ display: 'block', cursor: 'pointer' }}>
                          <input 
                            type="radio" 
                            name="action-ancien-epi" 
                            value="supprimer"
                            style={{ marginRight: '0.5rem' }}
                          />
                          Supprimer complètement de la base de données
                        </label>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowRemplacementModal(false)}>Annuler</Button>
              <Button onClick={async () => {
                try {
                  const nouveauNumeroSerie = document.getElementById('nouveau-numero-serie').value;
                  const nouvelleMarque = document.getElementById('nouvelle-marque').value;
                  const nouveauModele = document.getElementById('nouveau-modele').value;
                  const nouvelleTaille = document.getElementById('nouvelle-taille').value;
                  const nouvelleDateService = document.getElementById('nouvelle-date-service').value;
                  const notesAdmin = document.getElementById('notes-admin-remplacement').value;
                  const actionAncienEPI = document.querySelector('input[name="action-ancien-epi"]:checked').value;

                  if (!nouveauNumeroSerie || !nouvelleDateService) {
                    toast({ title: "Erreur", description: "Le numéro de série et la date de mise en service sont obligatoires", variant: "destructive" });
                    return;
                  }

                  const epi = epis.find(e => e.id === selectedDemandeRemplacement.epi_id);

                  // 1. Traiter l'ancien EPI selon le choix
                  if (actionAncienEPI === 'garder') {
                    // Marquer l'ancien EPI comme retiré
                    await apiPut(tenantSlug, `/epi/${selectedDemandeRemplacement.epi_id}`, {
                      ...epi,
                      statut: 'Retiré',
                      notes: (epi.notes || '') + ` [Retiré le ${new Date().toLocaleDateString('fr-FR')} - Remplacé par ${nouveauNumeroSerie}]`
                    });
                  } else if (actionAncienEPI === 'supprimer') {
                    // Supprimer complètement l'ancien EPI
                    await apiDelete(tenantSlug, `/epi/${selectedDemandeRemplacement.epi_id}`);
                  }

                  // 2. Créer le nouvel EPI
                  const nouvelEPI = {
                    type_epi: epi.type_epi,
                    numero_serie: nouveauNumeroSerie,
                    marque: nouvelleMarque,
                    modele: nouveauModele,
                    taille: nouvelleTaille,
                    date_mise_en_service: nouvelleDateService,
                    date_attribution: new Date().toISOString().split('T')[0],
                    statut: 'En service',
                    user_id: selectedDemandeRemplacement.user_id,
                    notes: `Attribué suite à remplacement de ${epi.numero_serie}`
                  };

                  await apiPost(tenantSlug, '/epi', nouvelEPI);

                  // 3. Approuver la demande
                  await apiPost(tenantSlug, `/epi/demandes-remplacement/${selectedDemandeRemplacement.id}/approuver`, {
                    notes_admin: notesAdmin
                  });

                  toast({ title: "Succès", description: `Remplacement effectué avec succès. Ancien EPI: ${actionAncienEPI === 'garder' ? 'conservé en historique' : 'supprimé'}` });
                  setShowRemplacementModal(false);
                  loadDemandesRemplacementEPI();
                  loadEPIs();
                } catch (error) {
                  console.error('Erreur remplacement:', error);
                  toast({ title: "Erreur", description: "Impossible d'effectuer le remplacement", variant: "destructive" });
                }
              }}>
                ✅ Approuver & Remplacer
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL DÉTAIL EPI */}
      {showDetailModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content extra-large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{getTypeIcon(selectedEPI.type_epi)} Détails EPI - #{selectedEPI.numero_serie}</h2>
              <Button variant="ghost" onClick={() => setShowDetailModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="epi-detail-grid">
                <div className="detail-section">
                  <h3>Informations générales</h3>
                  <p><strong>Type:</strong> {getTypeName(selectedEPI.type_epi)}</p>
                  <p><strong>Marque:</strong> {selectedEPI.marque}</p>
                  <p><strong>Modèle:</strong> {selectedEPI.modele}</p>
                  <p><strong>N° série fabricant:</strong> {selectedEPI.numero_serie_fabricant || 'N/A'}</p>
                  <p><strong>Norme:</strong> {selectedEPI.norme_certification}</p>
                  <p><strong>Statut:</strong> <span style={{color: getStatutColor(selectedEPI.statut)}}>{selectedEPI.statut}</span></p>
                </div>
                
                <div className="detail-section">
                  <h3>Dates & Coûts</h3>
                  <p><strong>Fabrication:</strong> {selectedEPI.date_fabrication ? new Date(selectedEPI.date_fabrication).toLocaleDateString('fr-FR') : 'N/A'}</p>
                  <p><strong>Mise en service:</strong> {new Date(selectedEPI.date_mise_en_service).toLocaleDateString('fr-FR')}</p>
                  <p><strong>Coût d'achat:</strong> {selectedEPI.cout_achat} $</p>
                </div>
                
                <div className="detail-section">
                  <h3>Affectation</h3>
                  <p><strong>Assigné à:</strong> {getUserName(selectedEPI.user_id)}</p>
                  <p><strong>Taille:</strong> {selectedEPI.taille || 'N/A'}</p>
                  <p><strong>Couleur:</strong> {selectedEPI.couleur || 'N/A'}</p>
                </div>
              </div>
              
              <div className="inspections-section" style={{marginTop: '2rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem'}}>
                  <h3>📋 Historique des inspections ({inspections.length})</h3>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {formulairesEPI.length > 0 && (
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setSelectedFormulaireEPI(formulairesEPI[0]);
                          setShowUnifiedInspectionModal(true);
                        }}
                        style={{ borderColor: '#3B82F6', color: '#3B82F6' }}
                      >
                        📝 Inspection formulaire
                      </Button>
                    )}
                    <Button onClick={() => setShowInspectionModal(true)}>
                      ➕ Inspection NFPA 1851
                    </Button>
                  </div>
                </div>
                
                {inspections.length > 0 ? (
                  <div className="inspections-list">
                    {inspections.map(insp => (
                      <div key={insp.id} className="inspection-card">
                        <div className="inspection-header">
                          <span className="inspection-type-badge">
                            {insp.type_inspection === 'apres_utilisation' ? '🔍 Après utilisation' :
                             insp.type_inspection === 'routine_mensuelle' ? '📅 Routine mensuelle' :
                             '🔬 Avancée annuelle'}
                          </span>
                          <span className={`statut-badge ${insp.statut_global}`}>
                            {insp.statut_global}
                          </span>
                        </div>
                        <p><strong>Date:</strong> {new Date(insp.date_inspection).toLocaleDateString('fr-FR')}</p>
                        <p><strong>Inspecteur:</strong> {insp.inspecteur_nom}</p>
                        {insp.isp_nom && <p><strong>ISP:</strong> {insp.isp_nom}</p>}
                        {insp.commentaires && <p><strong>Commentaires:</strong> {insp.commentaires}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Aucune inspection enregistrée</p>
                )}
              </div>
              
              {/* Section Nettoyages - Phase 2 */}
              <div className="nettoyages-section" style={{marginTop: '2rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                  <h3>🧼 Historique des nettoyages ({nettoyages.length})</h3>
                  <Button onClick={() => setShowNettoyageModal(true)}>
                    ➕ Nouveau nettoyage
                  </Button>
                </div>
                
                {nettoyages.length > 0 ? (
                  <div className="nettoyages-list">
                    {nettoyages.map(nett => (
                      <div key={nett.id} className="nettoyage-card">
                        <div className="nettoyage-header">
                          <span className={`type-badge ${nett.type_nettoyage}`}>
                            {nett.type_nettoyage === 'routine' ? '🧽 Routine' : '🧼 Avancé'}
                          </span>
                          <span>{nett.methode}</span>
                        </div>
                        <p><strong>Date:</strong> {new Date(nett.date_nettoyage).toLocaleDateString('fr-FR')}</p>
                        <p><strong>Effectué par:</strong> {nett.effectue_par}</p>
                        <p><strong>Cycles:</strong> {nett.nombre_cycles}</p>
                        {nett.notes && <p><strong>Notes:</strong> {nett.notes}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Aucun nettoyage enregistré</p>
                )}
              </div>
              
              {/* Section Réparations - Phase 2 */}
              <div className="reparations-section" style={{marginTop: '2rem'}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                  <h3>🔧 Historique des réparations ({reparations.length})</h3>
                  <Button onClick={() => {
                    setSelectedReparation(null);
                    setShowReparationModal(true);
                  }}>
                    ➕ Nouvelle réparation
                  </Button>
                </div>
                
                {reparations.length > 0 ? (
                  <div className="reparations-list">
                    {reparations.map(rep => (
                      <div key={rep.id} className="reparation-card">
                        <div className="reparation-header">
                          <span className={`statut-badge ${rep.statut}`}>
                            {rep.statut === 'demandee' ? '📝 Demandée' :
                             rep.statut === 'en_cours' ? '⚙️ En cours' :
                             rep.statut === 'terminee' ? '✅ Terminée' :
                             '❌ Impossible'}
                          </span>
                          <span>{rep.reparateur_type === 'interne' ? '🏠 Interne' : '🏢 Externe'}</span>
                        </div>
                        <p><strong>Demande:</strong> {new Date(rep.date_demande).toLocaleDateString('fr-FR')}</p>
                        <p><strong>Problème:</strong> {rep.probleme_description}</p>
                        <p><strong>Coût:</strong> {rep.cout_reparation} $</p>
                        <Button 
                          size="sm" 
                          onClick={() => openEditReparation(rep)}
                          style={{marginTop: '0.5rem'}}
                        >
                          ✏️ Mettre à jour
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Aucune réparation enregistrée</p>
                )}
              </div>
              
              {/* Section Retrait - Phase 2 */}
              {selectedEPI.statut !== 'Retiré' && (
                <div className="retrait-section" style={{marginTop: '2rem', padding: '1.5rem', background: '#FEF3C7', borderRadius: '12px'}}>
                  <h3 style={{color: '#92400E'}}>⚠️ Retrait de l'EPI</h3>
                  <p style={{fontSize: '0.9rem', color: '#78350F'}}>
                    Cet EPI doit être retiré du service de manière définitive ? (âge limite, dommage irréparable, etc.)
                  </p>
                  <Button 
                    variant="destructive"
                    onClick={() => setShowRetraitModal(true)}
                    style={{marginTop: '1rem'}}
                  >
                    🚫 Retirer cet EPI
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL INSPECTION */}
      {showInspectionModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowInspectionModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📋 Nouvelle Inspection - {getTypeName(selectedEPI.type_epi)} #{selectedEPI.numero_serie}</h2>
              <Button variant="ghost" onClick={() => setShowInspectionModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Type d'inspection *</Label>
                  <select 
                    className="form-select"
                    value={typeInspection}
                    onChange={e => setTypeInspection(e.target.value)}
                  >
                    <option value="apres_utilisation">🔍 Après utilisation</option>
                    <option value="routine_mensuelle">📅 Routine mensuelle</option>
                    <option value="avancee_annuelle">🔬 Avancée annuelle</option>
                  </select>
                </div>
                
                <div>
                  <Label>Date inspection *</Label>
                  <Input 
                    type="date"
                    value={inspectionForm.date_inspection}
                    onChange={e => setInspectionForm({...inspectionForm, date_inspection: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Inspecteur *</Label>
                  <Input 
                    value={inspectionForm.inspecteur_nom}
                    onChange={e => setInspectionForm({...inspectionForm, inspecteur_nom: e.target.value})}
                  />
                </div>
                
                {typeInspection === 'avancee_annuelle' && (
                  <>
                    <div>
                      <Label>ISP (Fournisseur)</Label>
                      <select 
                        className="form-select"
                        value={inspectionForm.isp_id}
                        onChange={e => {
                          const isp = isps.find(i => i.id === e.target.value);
                          setInspectionForm({
                            ...inspectionForm,
                            isp_id: e.target.value,
                            isp_nom: isp?.nom || '',
                            isp_accreditations: isp?.accreditations || ''
                          });
                        }}
                      >
                        <option value="">Interne</option>
                        {isps.map(isp => (
                          <option key={isp.id} value={isp.id}>{isp.nom}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                
                <div>
                  <Label>Statut global *</Label>
                  <select 
                    className="form-select"
                    value={inspectionForm.statut_global}
                    onChange={e => setInspectionForm({...inspectionForm, statut_global: e.target.value})}
                  >
                    <option value="conforme">✅ Conforme</option>
                    <option value="non_conforme">❌ Non conforme</option>
                    <option value="necessite_reparation">🔧 Nécessite réparation</option>
                    <option value="hors_service">🚫 Hors service</option>
                  </select>
                </div>
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Commentaires</Label>
                <textarea 
                  className="form-textarea"
                  rows="4"
                  value={inspectionForm.commentaires}
                  onChange={e => setInspectionForm({...inspectionForm, commentaires: e.target.value})}
                  placeholder="Observations, détails des points vérifiés..."
                />
              </div>
              
              <div style={{marginTop: '1rem', padding: '1rem', background: '#f0f9ff', borderRadius: '8px'}}>
                <p style={{fontSize: '0.875rem', color: '#1e40af'}}>
                  💡 <strong>Checklist NFPA 1851</strong> sera automatiquement générée selon le type d'inspection sélectionné.
                </p>
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowInspectionModal(false)}>Annuler</Button>
              <Button onClick={handleSaveInspection}>Enregistrer l'inspection</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL ISP */}
      {showISPModal && (
        <div className="modal-overlay" onClick={() => setShowISPModal(false)}>
          <div className="modal-content medium-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedISP ? 'Modifier Fournisseur' : 'Nouveau Fournisseur'}</h2>
              <Button variant="ghost" onClick={() => setShowISPModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Nom *</Label>
                  <Input 
                    value={ispForm.nom}
                    onChange={e => setIspForm({...ispForm, nom: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Contact</Label>
                  <Input 
                    value={ispForm.contact}
                    onChange={e => setIspForm({...ispForm, contact: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Téléphone</Label>
                  <Input 
                    value={ispForm.telephone}
                    onChange={e => setIspForm({...ispForm, telephone: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={ispForm.email}
                    onChange={e => setIspForm({...ispForm, email: e.target.value})}
                  />
                </div>
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Accréditations</Label>
                <Input 
                  value={ispForm.accreditations}
                  onChange={e => setIspForm({...ispForm, accreditations: e.target.value})}
                  placeholder="Ex: NFPA 1851, ISO 9001..."
                />
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Notes</Label>
                <textarea 
                  className="form-textarea"
                  rows="3"
                  value={ispForm.notes}
                  onChange={e => setIspForm({...ispForm, notes: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowISPModal(false)}>Annuler</Button>
              <Button onClick={handleSaveISP}>
                {selectedISP ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}

      
      {/* MODAL NETTOYAGE - Phase 2 */}
      {showNettoyageModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowNettoyageModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🧼 Nouveau Nettoyage - {getTypeName(selectedEPI.type_epi)} #{selectedEPI.numero_serie}</h2>
              <Button variant="ghost" onClick={() => setShowNettoyageModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Type de nettoyage *</Label>
                  <select 
                    className="form-select"
                    value={nettoyageForm.type_nettoyage}
                    onChange={e => setNettoyageForm({...nettoyageForm, type_nettoyage: e.target.value})}
                  >
                    <option value="routine">🧽 Routine (après utilisation)</option>
                    <option value="avance">🧼 Avancé (2x par an minimum)</option>
                  </select>
                </div>
                
                <div>
                  <Label>Date nettoyage *</Label>
                  <Input 
                    type="date"
                    value={nettoyageForm.date_nettoyage}
                    onChange={e => setNettoyageForm({...nettoyageForm, date_nettoyage: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Méthode *</Label>
                  <select 
                    className="form-select"
                    value={nettoyageForm.methode}
                    onChange={e => setNettoyageForm({...nettoyageForm, methode: e.target.value})}
                  >
                    <option value="laveuse_extractrice">🌀 Laveuse extractrice</option>
                    <option value="manuel">✋ Manuel</option>
                    <option value="externe">🏢 Externe (ISP)</option>
                  </select>
                </div>
                
                <div>
                  <Label>Effectué par</Label>
                  <Input 
                    value={nettoyageForm.effectue_par || `${user?.prenom || ''} ${user?.nom || ''}`}
                    onChange={e => setNettoyageForm({...nettoyageForm, effectue_par: e.target.value})}
                  />
                </div>
                
                {nettoyageForm.methode === 'externe' && (
                  <div>
                    <Label>Fournisseur ISP</Label>
                    <select 
                      className="form-select"
                      value={nettoyageForm.isp_id}
                      onChange={e => setNettoyageForm({...nettoyageForm, isp_id: e.target.value})}
                    >
                      <option value="">Sélectionner...</option>
                      {isps.map(isp => (
                        <option key={isp.id} value={isp.id}>{isp.nom}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <Label>Nombre de cycles</Label>
                  <Input 
                    type="number"
                    value={nettoyageForm.nombre_cycles}
                    onChange={e => setNettoyageForm({...nettoyageForm, nombre_cycles: parseInt(e.target.value) || 1})}
                  />
                </div>
                
                <div>
                  <Label>Température</Label>
                  <Input 
                    value={nettoyageForm.temperature}
                    onChange={e => setNettoyageForm({...nettoyageForm, temperature: e.target.value})}
                    placeholder="Ex: Eau tiède max 40°C"
                  />
                </div>
                
                <div>
                  <Label>Produits utilisés</Label>
                  <Input 
                    value={nettoyageForm.produits_utilises}
                    onChange={e => setNettoyageForm({...nettoyageForm, produits_utilises: e.target.value})}
                  />
                </div>
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Notes</Label>
                <textarea 
                  className="form-textarea"
                  rows="3"
                  value={nettoyageForm.notes}
                  onChange={e => setNettoyageForm({...nettoyageForm, notes: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowNettoyageModal(false)}>Annuler</Button>
              <Button onClick={handleSaveNettoyage}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL RÉPARATION - Phase 2 */}
      {showReparationModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowReparationModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔧 {selectedReparation ? 'Mise à jour Réparation' : 'Nouvelle Réparation'} - {getTypeName(selectedEPI.type_epi)} #{selectedEPI.numero_serie}</h2>
              <Button variant="ghost" onClick={() => setShowReparationModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Statut *</Label>
                  <select 
                    className="form-select"
                    value={reparationForm.statut}
                    onChange={e => setReparationForm({...reparationForm, statut: e.target.value})}
                  >
                    <option value="demandee">📝 Demandée</option>
                    <option value="en_cours">⚙️ En cours</option>
                    <option value="terminee">✅ Terminée</option>
                    <option value="impossible">❌ Impossible</option>
                  </select>
                </div>
                
                <div>
                  <Label>Date demande *</Label>
                  <Input 
                    type="date"
                    value={reparationForm.date_demande}
                    onChange={e => setReparationForm({...reparationForm, date_demande: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Type de réparateur *</Label>
                  <select 
                    className="form-select"
                    value={reparationForm.reparateur_type}
                    onChange={e => setReparationForm({...reparationForm, reparateur_type: e.target.value})}
                  >
                    <option value="interne">🏠 Interne</option>
                    <option value="externe">🏢 Externe (ISP)</option>
                  </select>
                </div>
                
                {reparationForm.reparateur_type === 'externe' && (
                  <div>
                    <Label>Fournisseur ISP</Label>
                    <select 
                      className="form-select"
                      value={reparationForm.isp_id}
                      onChange={e => {
                        const isp = isps.find(i => i.id === e.target.value);
                        setReparationForm({
                          ...reparationForm,
                          isp_id: e.target.value,
                          reparateur_nom: isp?.nom || ''
                        });
                      }}
                    >
                      <option value="">Sélectionner...</option>
                      {isps.map(isp => (
                        <option key={isp.id} value={isp.id}>{isp.nom}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {reparationForm.reparateur_type === 'interne' && (
                  <div>
                    <Label>Nom du réparateur</Label>
                    <Input 
                      value={reparationForm.reparateur_nom}
                      onChange={e => setReparationForm({...reparationForm, reparateur_nom: e.target.value})}
                    />
                  </div>
                )}
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Description du problème *</Label>
                <textarea 
                  className="form-textarea"
                  rows="3"
                  value={reparationForm.probleme_description}
                  onChange={e => setReparationForm({...reparationForm, probleme_description: e.target.value})}
                  placeholder="Décrivez le problème nécessitant réparation..."
                />
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Notes</Label>
                <textarea 
                  className="form-textarea"
                  rows="2"
                  value={reparationForm.notes}
                  onChange={e => setReparationForm({...reparationForm, notes: e.target.value})}
                />
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowReparationModal(false)}>Annuler</Button>
              <Button onClick={handleSaveReparation}>
                {selectedReparation ? 'Mettre à jour' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* MODAL RETRAIT - Phase 2 */}
      {showRetraitModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowRetraitModal(false)}>
          <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{background: '#DC2626', color: 'white'}}>
              <h2>🚫 Retrait Définitif EPI - {getTypeName(selectedEPI.type_epi)} #{selectedEPI.numero_serie}</h2>
              <Button variant="ghost" onClick={() => setShowRetraitModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              <div className="alert-warning" style={{marginBottom: '1.5rem', padding: '1rem', background: '#FEF3C7', borderRadius: '8px'}}>
                <p style={{margin: 0, color: '#92400E'}}>
                  ⚠️ <strong>ATTENTION:</strong> Cette action est définitive. L'EPI sera marqué comme retiré et ne pourra plus être utilisé.
                </p>
              </div>
              
              <div className="form-grid">
                <div>
                  <Label>Date de retrait *</Label>
                  <Input 
                    type="date"
                    value={retraitForm.date_retrait}
                    onChange={e => setRetraitForm({...retraitForm, date_retrait: e.target.value})}
                  />
                </div>
                
                <div>
                  <Label>Raison du retrait *</Label>
                  <select 
                    className="form-select"
                    value={retraitForm.raison}
                    onChange={e => setRetraitForm({...retraitForm, raison: e.target.value})}
                  >
                    <option value="age_limite">⏰ Âge limite atteinte (10 ans)</option>
                    <option value="dommage_irreparable">💔 Dommage irréparable</option>
                    <option value="echec_inspection">❌ Échec inspection avancée</option>
                    <option value="autre">📝 Autre raison</option>
                  </select>
                </div>
                
                <div>
                  <Label>Méthode de disposition *</Label>
                  <select 
                    className="form-select"
                    value={retraitForm.methode_disposition}
                    onChange={e => setRetraitForm({...retraitForm, methode_disposition: e.target.value})}
                  >
                    <option value="coupe_detruit">✂️ Coupé/Détruit</option>
                    <option value="recyclage">♻️ Recyclage</option>
                    <option value="don">🎁 Don</option>
                    <option value="autre">📝 Autre</option>
                  </select>
                </div>
                
                <div>
                  <Label>Coût de disposition</Label>
                  <Input 
                    type="number"
                    value={retraitForm.cout_disposition}
                    onChange={e => setRetraitForm({...retraitForm, cout_disposition: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Description détaillée *</Label>
                <textarea 
                  className="form-textarea"
                  rows="4"
                  value={retraitForm.description_raison}
                  onChange={e => setRetraitForm({...retraitForm, description_raison: e.target.value})}
                  placeholder="Expliquez en détail pourquoi cet EPI doit être retiré..."
                />
              </div>
              
              <div style={{marginTop: '1rem'}}>
                <Label>Notes complémentaires</Label>
                <textarea 
                  className="form-textarea"
                  rows="2"
                  value={retraitForm.notes}
                  onChange={e => setRetraitForm({...retraitForm, notes: e.target.value})}
                />
              </div>
              
              <div style={{marginTop: '1rem', padding: '1rem', background: '#FEE2E2', borderRadius: '8px'}}>
                <p style={{margin: 0, fontSize: '0.875rem', color: '#991B1B'}}>
                  📸 <strong>Preuve de disposition:</strong> Après validation, prenez des photos de l'EPI coupé/détruit comme preuve de mise au rebut selon NFPA 1851.
                </p>
              </div>
            </div>
            
            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowRetraitModal(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleSaveRetrait}>
                🚫 Confirmer le retrait
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const Dashboard = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showActivitesEtendues, setShowActivitesEtendues] = useState(false);
  const [messageForm, setMessageForm] = useState({
    titre: '',
    contenu: '',
    priorite: 'info',
    date_expiration: ''
  });

  useEffect(() => {
    if (tenantSlug) {
      loadDashboardData();
      loadMessages();
    }
  }, [tenantSlug]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/dashboard/donnees-completes');
      setDashboardData(data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    }
    setLoading(false);
  };

  const loadMessages = async () => {
    try {
      const messagesData = await apiGet(tenantSlug, '/dashboard/messages');
      setMessages(messagesData);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
    }
  };

  const handleCreateMessage = async () => {
    try {
      await apiPost(tenantSlug, '/dashboard/messages', messageForm);
      toast({ title: "Succès", description: "Message publié" });
      setShowMessageModal(false);
      setMessageForm({ titre: '', contenu: '', priorite: 'info', date_expiration: '' });
      loadMessages();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de publier le message", variant: "destructive" });
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      await apiDelete(tenantSlug, `/dashboard/messages/${messageId}`);
      toast({ title: "Succès", description: "Message supprimé" });
      loadMessages();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer le message", variant: "destructive" });
    }
  };

  if (loading) return <div className="loading">Chargement du dashboard...</div>;
  if (!dashboardData) return <div className="error">Erreur de chargement des données</div>;

  const { section_personnelle, section_generale, activites_recentes } = dashboardData;

  return (
    <div className="dashboard-refonte">
      <div className="module-header">
        <div>
          <h1>📊 Tableau de Bord</h1>
          <p>Vue d'ensemble de votre activité et du service</p>
        </div>
      </div>

      {/* MESSAGES IMPORTANTS */}
      {messages.length > 0 && (
        <div className="messages-importants-section">
          {messages.map(msg => (
            <div key={msg.id} className={`message-banner priorite-${msg.priorite}`}>
              <div className="message-icon">
                {msg.priorite === 'urgent' && '🚨'}
                {msg.priorite === 'important' && '⚠️'}
                {msg.priorite === 'info' && 'ℹ️'}
              </div>
              <div className="message-content">
                <h4>{msg.titre}</h4>
                <p>{msg.contenu}</p>
                <small>Par {msg.auteur_nom} • {new Date(msg.created_at).toLocaleDateString('fr-FR')}</small>
              </div>
              {user?.role !== 'employe' && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleDeleteMessage(msg.id)}
                  style={{marginLeft: 'auto'}}
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* BOUTON CRÉER MESSAGE (Admin/Superviseur) */}
      {user?.role !== 'employe' && (
        <div style={{marginBottom: '2rem'}}>
          <Button onClick={() => setShowMessageModal(true)}>
            ➕ Publier un message important
          </Button>
        </div>
      )}

      {/* SECTION PERSONNELLE */}
      <div className="dashboard-section">
        <h2>👤 Ma Section Personnelle</h2>
        <div className="kpi-grid">
          {!section_personnelle.has_garde_externe ? (
            // Affichage simple si pas de garde externe
            <div className="kpi-card" style={{background: '#FEF3C7'}}>
              <h3>{section_personnelle.heures_travaillees_mois}h</h3>
              <p>Heures travaillées ce mois</p>
            </div>
          ) : (
            // Affichage séparé si garde externe existe
            <>
              <div className="kpi-card" style={{background: '#FEF3C7'}}>
                <h3>{section_personnelle.heures_internes_mois}h</h3>
                <p>🏢 Heures Internes</p>
              </div>
              <div className="kpi-card" style={{background: '#E0E7FF'}}>
                <h3>{section_personnelle.heures_externes_mois}h</h3>
                <p>🏠 Heures Externes</p>
              </div>
            </>
          )}
          <div className="kpi-card" style={{background: '#FCA5A5'}}>
            <h3>{section_personnelle.nombre_gardes_mois}</h3>
            <p>Nombre de gardes</p>
          </div>
          <div className="kpi-card" style={{background: '#D1FAE5'}}>
            <h3>{section_personnelle.pourcentage_presence_formations}%</h3>
            <p>Présence formations</p>
          </div>
          <div className="kpi-card" style={{background: '#DBEAFE'}}>
            <h3>{section_personnelle.formations_a_venir.length}</h3>
            <p>Formations à venir</p>
          </div>
        </div>

        {/* Formations à venir */}
        {section_personnelle.formations_a_venir.length > 0 && (
          <div className="formations-a-venir">
            <h3>🎓 Formations à Venir</h3>
            <div className="formations-list-compact">
              {section_personnelle.formations_a_venir.map(formation => (
                <div key={formation.id} className="formation-item-compact">
                  <div className="formation-info">
                    <h4>{formation.nom}</h4>
                    <p>{(() => {
                      // Parser les dates comme locales sans conversion timezone
                      const [y1, m1, d1] = formation.date_debut.split('-');
                      const date1 = new Date(y1, m1 - 1, d1);
                      const [y2, m2, d2] = formation.date_fin.split('-');
                      const date2 = new Date(y2, m2 - 1, d2);
                      return `${date1.toLocaleDateString('fr-FR')} - ${date2.toLocaleDateString('fr-FR')}`;
                    })()}</p>
                  </div>
                  {formation.est_inscrit ? (
                    <span className="badge-inscrit">✓ Inscrit</span>
                  ) : (
                    <span className="badge-non-inscrit">Non inscrit</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION GÉNÉRALE (Admin/Superviseur uniquement) */}
      {section_generale && (
        <>
          <div className="dashboard-section">
            <h2>🏢 Vue Générale du Service</h2>
            <div className="kpi-grid">
              <div className="kpi-card" style={{background: '#E0E7FF'}}>
                <h3>{section_generale.couverture_planning}%</h3>
                <p>Couverture planning</p>
              </div>
              <div className="kpi-card" style={{background: (section_generale.postes_a_pourvoir || section_generale.gardes_manquantes || 0) > 0 ? '#FEE2E2' : '#D1FAE5'}}>
                <h3>{section_generale.postes_a_pourvoir || section_generale.gardes_manquantes || 0}</h3>
                <p>Postes à pourvoir ce mois</p>
              </div>
              <div className="kpi-card" style={{background: '#FED7AA'}}>
                <h3>{section_generale.demandes_conges_en_attente}</h3>
                <p>Demandes à approuver</p>
              </div>
              <div className="kpi-card" style={{background: '#E9D5FF'}}>
                <h3>{section_generale.statistiques_mois.total_assignations}</h3>
                <p>Assignations ce mois</p>
              </div>
            </div>

            {/* Statistiques mois */}
            <div className="stats-mois-grid">
              <div className="stat-item">
                <span className="stat-label">Personnel actif</span>
                <span className="stat-value">{section_generale.statistiques_mois.total_personnel_actif}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Formations ce mois</span>
                <span className="stat-value">{section_generale.statistiques_mois.formations_ce_mois}</span>
              </div>
            </div>
          </div>

          {/* ACTIVITÉS RÉCENTES */}
          <div className="dashboard-section">
            <h2>📋 Actualité Récente du Service</h2>
            <div className="activites-liste">
              {activites_recentes.slice(0, showActivitesEtendues ? activites_recentes.length : 10).map((activite, idx) => (
                <div key={idx} className="activite-item">
                  <div className="activite-icon">
                    {activite.type_activite === 'creation_personnel' && '👤'}
                    {activite.type_activite === 'assignation' && '📅'}
                    {activite.type_activite === 'formation' && '🎓'}
                    {activite.type_activite === 'remplacement' && '🔄'}
                    {!['creation_personnel', 'assignation', 'formation', 'remplacement'].includes(activite.type_activite) && '📌'}
                  </div>
                  <div className="activite-content">
                    <p>{activite.description}</p>
                    <small>{new Date(activite.created_at).toLocaleString('fr-FR')}</small>
                  </div>
                </div>
              ))}
            </div>
            
            {activites_recentes.length > 10 && (
              <div style={{textAlign: 'center', marginTop: '1rem'}}>
                <Button 
                  variant="outline" 
                  onClick={() => setShowActivitesEtendues(!showActivitesEtendues)}
                >
                  {showActivitesEtendues ? '▲ Voir moins' : '▼ Voir plus'}
                </Button>
              </div>
            )}
            
            {activites_recentes.length === 0 && (
              <div className="empty-state">
                <p>Aucune activité récente</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal Créer Message */}
      {showMessageModal && (
        <div className="modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📢 Publier un Message Important</h2>
              <Button variant="ghost" onClick={() => setShowMessageModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div style={{gridColumn: 'span 2'}}>
                  <Label>Titre</Label>
                  <Input 
                    value={messageForm.titre} 
                    onChange={e => setMessageForm({...messageForm, titre: e.target.value})}
                    placeholder="Ex: Maintenance système prévue"
                  />
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <Label>Contenu</Label>
                  <textarea
                    className="form-textarea"
                    value={messageForm.contenu}
                    onChange={e => setMessageForm({...messageForm, contenu: e.target.value})}
                    placeholder="Détails du message..."
                    rows={4}
                  />
                </div>
                <div>
                  <Label>Priorité</Label>
                  <select 
                    className="form-select" 
                    value={messageForm.priorite} 
                    onChange={e => setMessageForm({...messageForm, priorite: e.target.value})}
                  >
                    <option value="info">Information</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <Label>Date d'expiration (optionnel)</Label>
                  <Input 
                    type="date"
                    value={messageForm.date_expiration} 
                    onChange={e => setMessageForm({...messageForm, date_expiration: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowMessageModal(false)}>Annuler</Button>
              <Button onClick={handleCreateMessage}>Publier</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default ModuleEPI;
