import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { 
  DollarSign, 
  FileText, 
  Settings, 
  Calendar, 
  Download, 
  Check, 
  RefreshCw,
  Filter,
  Search,
  Trash2,
  Eye,
  Users,
  Link,
  Plus,
  Zap,
  Edit,
  CheckCircle,
  XCircle
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ModulePaie = ({ tenant }) => {
  const [activeTab, setActiveTab] = useState('feuilles');
  const [loading, setLoading] = useState(false);
  const [parametres, setParametres] = useState(null);
  const [feuilles, setFeuilles] = useState([]);
  const [employes, setEmployes] = useState([]);
  const [selectedFeuille, setSelectedFeuille] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Mode édition feuille
  const [editMode, setEditMode] = useState(false);
  const [editedLignes, setEditedLignes] = useState([]);
  const [newLigne, setNewLigne] = useState({ date: '', type: '', description: '', heures_payees: 0, montant: 0 });
  
  // Config export
  const [payrollConfig, setPayrollConfig] = useState(null);
  const [providersDisponibles, setProvidersDisponibles] = useState([]);
  const [codeMappings, setCodeMappings] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  
  // API Credentials
  const [apiCredentials, setApiCredentials] = useState({});
  const [testingConnection, setTestingConnection] = useState(false);
  
  // Filtres
  const [filtreAnnee, setFiltreAnnee] = useState(new Date().getFullYear());
  const [filtreMois, setFiltreMois] = useState('');
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  
  // Génération en lot
  const [genPeriodeDebut, setGenPeriodeDebut] = useState('');
  const [genPeriodeFin, setGenPeriodeFin] = useState('');
  
  // Nouveau mapping
  const [newMapping, setNewMapping] = useState({ internal_event_type: '', external_pay_code: '', description: '' });

  // Matricules employés pour Nethris
  const [matriculesEmployes, setMatriculesEmployes] = useState({});

  // Nouveau type d'heure
  const [newEventType, setNewEventType] = useState({ code: '', label: '', category: 'heures', unit: 'heures', default_rate: 0 });
  const [showEventTypeForm, setShowEventTypeForm] = useState(false);

  // Récupérer le token avec le bon préfixe tenant
  const token = localStorage.getItem(`${tenant}_token`);

  const fetchParametres = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/parametres`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setParametres(data);
      }
    } catch (error) {
      console.error('Erreur chargement paramètres paie:', error);
    }
  }, [tenant, token]);

  const fetchFeuilles = useCallback(async () => {
    try {
      let url = `${API_URL}/api/${tenant}/paie/feuilles-temps?`;
      if (filtreAnnee) url += `annee=${filtreAnnee}&`;
      if (filtreMois) url += `mois=${filtreMois}&`;
      if (filtreEmploye) url += `user_id=${filtreEmploye}&`;
      if (filtreStatut) url += `statut=${filtreStatut}&`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFeuilles(data.feuilles || []);
      }
    } catch (error) {
      console.error('Erreur chargement feuilles:', error);
    }
  }, [tenant, token, filtreAnnee, filtreMois, filtreEmploye, filtreStatut]);

  const fetchEmployes = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEmployes(data.filter(u => u.statut === 'Actif'));
      }
    } catch (error) {
      console.error('Erreur chargement employés:', error);
    }
  }, [tenant, token]);

  const fetchPayrollConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPayrollConfig(data.config);
        setProvidersDisponibles(data.providers_disponibles || []);
      }
    } catch (error) {
      console.error('Erreur chargement config paie:', error);
    }
  }, [tenant, token]);

  const fetchCodeMappings = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCodeMappings(data.mappings || []);
        setEventTypes(data.event_types || []);
      }
    } catch (error) {
      console.error('Erreur chargement mappings:', error);
    }
  }, [tenant, token]);

  // Charger les matricules employés (depuis les profils employés)
  useEffect(() => {
    if (employes.length > 0) {
      const matriculesInit = {};
      employes.forEach(emp => {
        matriculesInit[emp.id] = emp.matricule_paie || emp.numero_employe || '';
      });
      setMatriculesEmployes(matriculesInit);
    }
  }, [employes]);

  useEffect(() => {
    fetchParametres();
    fetchFeuilles();
    fetchEmployes();
    fetchPayrollConfig();
    fetchCodeMappings();
  }, [fetchParametres, fetchFeuilles, fetchEmployes, fetchPayrollConfig, fetchCodeMappings]);

  // Charger les credentials quand le config change
  useEffect(() => {
    if (payrollConfig?.api_credentials) {
      setApiCredentials(payrollConfig.api_credentials);
    }
  }, [payrollConfig]);

  // Trouver le fournisseur sélectionné
  const selectedProvider = providersDisponibles.find(p => p.id === payrollConfig?.provider_id);

  const handleSaveApiCredentials = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/api/save-credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(apiCredentials)
      });
      
      if (response.ok) {
        toast.success('Credentials API enregistrés');
        fetchPayrollConfig();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleTestApiConnection = async () => {
    setTestingConnection(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/api/test-connection`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
      
      fetchPayrollConfig();
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendToApi = async () => {
    const feuillesAExporter = feuilles.filter(f => f.statut === 'valide');
    if (feuillesAExporter.length === 0) {
      toast.error('Aucune feuille validée à exporter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/api/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feuille_ids: feuillesAExporter.map(f => f.id)
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(data.message);
        fetchFeuilles();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveParametres = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/parametres`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parametres)
      });
      
      if (response.ok) {
        toast.success('Paramètres enregistrés');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleGenererLot = async () => {
    if (!genPeriodeDebut || !genPeriodeFin) {
      toast.error('Veuillez sélectionner une période');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/generer-lot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          periode_debut: genPeriodeDebut,
          periode_fin: genPeriodeFin
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        fetchFeuilles();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de la génération');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleValiderFeuille = async (feuilleId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}/valider`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Feuille validée');
        fetchFeuilles();
        if (selectedFeuille?.id === feuilleId) {
          setSelectedFeuille({...selectedFeuille, statut: 'valide'});
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de la validation');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const handleSupprimerFeuille = async (feuilleId) => {
    if (!window.confirm('Supprimer cette feuille de temps ?')) return;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Feuille supprimée');
        fetchFeuilles();
        if (selectedFeuille?.id === feuilleId) {
          setSelectedFeuille(null);
          setShowDetail(false);
        }
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de la suppression');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const handleVoirDetail = async (feuilleId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSelectedFeuille(data);
        setShowDetail(true);
      }
    } catch (error) {
      toast.error('Erreur de chargement');
    }
  };

  const handleExportPaie = async () => {
    const feuillesAExporter = feuilles.filter(f => f.statut === 'valide');
    if (feuillesAExporter.length === 0) {
      toast.error('Aucune feuille validée à exporter');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feuille_ids: feuillesAExporter.map(f => f.id)
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'export_paie.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        toast.success('Export téléchargé');
        fetchFeuilles();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de l\'export');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  // Entrer en mode édition d'une feuille
  const handleStartEdit = () => {
    // Assigner un ID unique à chaque ligne pour permettre l'édition indépendante
    const lignesAvecIds = (selectedFeuille.lignes || []).map((ligne, idx) => ({
      ...ligne,
      id: ligne.id || `ligne-${idx}-${Date.now()}`
    }));
    setEditedLignes(lignesAvecIds);
    setEditMode(true);
  };

  // Sauvegarder les modifications de la feuille
  const handleSaveFeuille = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${selectedFeuille.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lignes: editedLignes })
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success('Feuille de temps mise à jour');
        setSelectedFeuille(data.feuille);
        setEditMode(false);
        fetchFeuilles();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  // Ajouter une nouvelle ligne
  const handleAddLigne = () => {
    if (!newLigne.date || !newLigne.type) {
      toast.error('Date et type requis');
      return;
    }
    
    const ligne = {
      id: `manual-${Date.now()}`,
      ...newLigne,
      heures_brutes: parseFloat(newLigne.heures_payees) || 0,
      heures_payees: parseFloat(newLigne.heures_payees) || 0,
      montant: parseFloat(newLigne.montant) || 0,
      taux: 1,
      source_type: 'manuel'
    };
    
    setEditedLignes([...editedLignes, ligne].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    setNewLigne({ date: '', type: '', description: '', heures_payees: 0, montant: 0 });
  };

  // Supprimer une ligne
  const handleDeleteLigne = (ligneId) => {
    setEditedLignes(editedLignes.filter(l => l.id !== ligneId));
  };

  // Calculer les totaux en temps réel à partir des lignes éditées
  const calculerTotauxEnTempsReel = (lignes) => {
    const totaux = {
      gardes_internes: 0,
      gardes_externes: 0,
      rappels: 0,
      formations: 0,
      heures_payees: 0,
      montant_total: 0
    };
    
    for (const ligne of lignes) {
      const type = (ligne.type || '').toLowerCase();
      const code = ligne.type || '';
      const heures = parseFloat(ligne.heures_payees) || 0;
      const montant = parseFloat(ligne.montant) || 0;
      
      // Catégoriser selon le type
      if (type.includes('garde_interne') || code.includes('GARDE_INTERNE')) {
        totaux.gardes_internes += heures;
      } else if (type.includes('garde_externe') || code.includes('GARDE_EXTERNE')) {
        totaux.gardes_externes += heures;
      } else if (type.includes('rappel') || code.includes('RAPPEL') || code.includes('REPONDANT')) {
        totaux.rappels += heures;
      } else if (type.includes('formation') || type.includes('pratique') || code.includes('FORMATION') || code.includes('PRATIQUE')) {
        totaux.formations += heures;
      }
      
      // Ne compter les heures que pour les types en heures
      const eventType = eventTypes.find(et => et.code === code);
      if (!eventType?.unit || eventType?.unit === 'heures') {
        totaux.heures_payees += heures;
      }
      totaux.montant_total += montant;
    }
    
    return totaux;
  };
  
  // Totaux calculés en temps réel (utilisés en mode édition)
  const totauxTempsReel = editMode ? calculerTotauxEnTempsReel(editedLignes) : null;

  // Calculer le montant automatiquement selon le type et la quantité
  const calculerMontantAutomatique = (typeCode, quantite, fonctionSuperieure = false) => {
    const eventType = eventTypes.find(et => et.code === typeCode);
    if (!eventType) return 0;
    
    const unit = eventType.unit || 'heures';
    const tauxType = eventType.default_rate || 0;
    
    if (unit === 'heures') {
      // Pour les heures : utiliser le taux horaire de l'employé × multiplicateur du type
      const tauxHoraireEmploye = selectedFeuille?.taux_horaire || 25;
      const multiplicateur = tauxType || 1;
      let montant = quantite * tauxHoraireEmploye * multiplicateur;
      
      // Appliquer la prime fonction supérieure si cochée
      if (fonctionSuperieure) {
        const primePct = (parametres?.prime_fonction_superieure_pct || 10) / 100;
        montant = montant * (1 + primePct);
      }
      return Math.round(montant * 100) / 100;
    } else {
      // Pour km, montant, quantité : utiliser le default_rate directement
      return Math.round(quantite * tauxType * 100) / 100;
    }
  };

  // Modifier une ligne existante
  const handleUpdateLigne = (ligneId, field, value) => {
    setEditedLignes(editedLignes.map(l => {
      if (l.id === ligneId) {
        const updated = { ...l, [field]: value };
        
        // Si on change le type, auto-remplir la description et recalculer le montant
        if (field === 'type') {
          const eventType = eventTypes.find(et => et.code === value);
          if (eventType) {
            updated.description = eventType.label;
            // Recalculer le montant avec la nouvelle unité/taux
            updated.montant = calculerMontantAutomatique(value, parseFloat(updated.heures_payees) || 0, updated.fonction_superieure);
          }
        }
        
        // Si on change la quantité/heures, recalculer le montant
        if (field === 'heures_payees') {
          updated.montant = calculerMontantAutomatique(updated.type, parseFloat(value) || 0, updated.fonction_superieure);
        }
        
        // Si on coche/décoche fonction supérieure, recalculer le montant
        if (field === 'fonction_superieure') {
          updated.montant = calculerMontantAutomatique(updated.type, parseFloat(updated.heures_payees) || 0, value);
        }
        
        return updated;
      }
      return l;
    }));
  };

  // Modifier un type d'heure existant
  const [editingEventType, setEditingEventType] = useState(null);
  
  const handleEditEventType = (eventType) => {
    setEditingEventType({...eventType});
  };
  
  const handleSaveEditEventType = async () => {
    if (!editingEventType) return;
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${editingEventType.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editingEventType)
      });
      
      if (response.ok) {
        toast.success('Type d\'heure modifié');
        setEditingEventType(null);
        fetchCodeMappings();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const handleSavePayrollConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payrollConfig)
      });
      
      if (response.ok) {
        toast.success('Configuration enregistrée');
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCodeMapping = async () => {
    if (!newMapping.internal_event_type || !newMapping.external_pay_code) {
      toast.error('Veuillez remplir le type et le code');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newMapping)
      });
      
      if (response.ok) {
        toast.success('Mapping ajouté');
        setNewMapping({ internal_event_type: '', external_pay_code: '', description: '' });
        fetchCodeMappings();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const handleDeleteCodeMapping = async (mappingId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings/${mappingId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Mapping supprimé');
        fetchCodeMappings();
      }
    } catch (error) {
      toast.error('Erreur');
    }
  };

  // Sauvegarder un matricule employé
  const handleSaveMatricule = async (employeId, matricule) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/users/${employeId}/matricule-paie`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ matricule_paie: matricule })
      });
      
      if (response.ok) {
        toast.success('Matricule enregistré');
        setMatriculesEmployes(prev => ({...prev, [employeId]: matricule}));
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  // Sauvegarder tous les matricules
  const handleSaveAllMatricules = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/matricules`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ matricules: matriculesEmployes })
      });
      
      if (response.ok) {
        toast.success('Tous les matricules ont été enregistrés');
        fetchEmployes(); // Rafraîchir
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  // Ajouter un nouveau type d'heure
  const handleAddEventType = async () => {
    if (!newEventType.code || !newEventType.label) {
      toast.error('Le code et le libellé sont requis');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newEventType)
      });
      
      if (response.ok) {
        toast.success('Type d\'heure ajouté');
        setNewEventType({ code: '', label: '', category: 'heures', unit: 'heures', default_rate: 0 });
        setShowEventTypeForm(false);
        fetchCodeMappings(); // Rafraîchit aussi les eventTypes
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  // Supprimer un type d'heure
  const handleDeleteEventType = async (eventTypeId) => {
    if (!window.confirm('Supprimer ce type d\'heure ? Les mappings associés seront aussi supprimés.')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${eventTypeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        toast.success('Type d\'heure supprimé');
        fetchCodeMappings();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    }
  };

  const getStatutBadge = (statut) => {
    const styles = {
      brouillon: { bg: '#fef3c7', color: '#92400e', text: 'Brouillon' },
      valide: { bg: '#d1fae5', color: '#065f46', text: 'Validé' },
      exporte: { bg: '#dbeafe', color: '#1e40af', text: 'Exporté' }
    };
    const s = styles[statut] || styles.brouillon;
    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: '600',
        background: s.bg,
        color: s.color
      }}>
        {s.text}
      </span>
    );
  };

  const formatMontant = (montant) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(montant || 0);
  };

  // Onglet Paramètres
  const renderParametres = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Période de paie */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          <Calendar size={20} /> Période de paie
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Durée de la période (jours)
            </label>
            <select
              value={parametres?.periode_paie_jours || 14}
              onChange={(e) => setParametres({...parametres, periode_paie_jours: parseInt(e.target.value)})}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            >
              <option value={7}>7 jours (hebdomadaire)</option>
              <option value={14}>14 jours (bi-hebdomadaire)</option>
              <option value={30}>30 jours (mensuel)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Garde externe */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          📱 Garde externe (astreinte à domicile)
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Le montant fixe par garde est défini dans Paramètres &gt; Types de garde.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={parametres?.garde_externe_taux || 1}
              onChange={(e) => setParametres({...parametres, garde_externe_taux: parseFloat(e.target.value)})}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Heures minimum payées
            </label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={parametres?.garde_externe_minimum_heures || 3}
              onChange={(e) => setParametres({...parametres, garde_externe_minimum_heures: parseFloat(e.target.value)})}
            />
          </div>
        </div>
      </div>

      {/* Rappel */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          🚨 Rappel (hors garde planifiée)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={parametres?.rappel_taux || 1}
              onChange={(e) => setParametres({...parametres, rappel_taux: parseFloat(e.target.value)})}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Heures minimum payées
            </label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={parametres?.rappel_minimum_heures || 3}
              onChange={(e) => setParametres({...parametres, rappel_minimum_heures: parseFloat(e.target.value)})}
            />
          </div>
        </div>
      </div>

      {/* Formations */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          📚 Formations
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={parametres?.formation_taux || 1}
              onChange={(e) => setParametres({...parametres, formation_taux: parseFloat(e.target.value)})}
            />
          </div>
        </div>
      </div>

      {/* Prime fonction supérieure */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          ⬆️ Prime fonction supérieure
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Lorsqu'un employé avec "fonction supérieure" cochée dans sa fiche occupe un poste de grade supérieur 
          (ex: Pompier → Lieutenant, Lieutenant → Capitaine), son taux horaire est majoré de ce pourcentage.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Pourcentage de majoration (%)
            </label>
            <Input
              type="number"
              step="1"
              min="0"
              max="100"
              value={parametres?.prime_fonction_superieure_pct || 10}
              onChange={(e) => setParametres({...parametres, prime_fonction_superieure_pct: parseFloat(e.target.value)})}
              placeholder="10"
            />
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Ex: 10 = +10% sur le taux horaire</span>
          </div>
        </div>
      </div>

      {/* Heures supplémentaires */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          ⏰ Heures supplémentaires
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Actives uniquement si cochées dans Paramètres &gt; Planning &gt; Attribution.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Seuil hebdomadaire (heures)
            </label>
            <Input
              type="number"
              min="0"
              value={parametres?.heures_sup_seuil_hebdo || 40}
              onChange={(e) => setParametres({...parametres, heures_sup_seuil_hebdo: parseInt(e.target.value)})}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Taux multiplicateur
            </label>
            <Input
              type="number"
              step="0.1"
              min="1"
              value={parametres?.heures_sup_taux || 1.5}
              onChange={(e) => setParametres({...parametres, heures_sup_taux: parseFloat(e.target.value)})}
            />
          </div>
        </div>
      </div>

      {/* Types d'heures personnalisés */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            📋 Types d'heures personnalisés
          </h3>
          <Button size="sm" onClick={() => setShowEventTypeForm(!showEventTypeForm)} data-testid="add-event-type-btn">
            <Plus size={16} /> Ajouter
          </Button>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Créez vos propres types d'heures, primes ou frais pour les associer aux codes de gains de votre logiciel de paie.
        </p>

        {/* Formulaire d'ajout */}
        {showEventTypeForm && (
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Code *
                </label>
                <Input
                  value={newEventType.code}
                  onChange={(e) => setNewEventType({...newEventType, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_')})}
                  placeholder="Ex: KILOMETRAGE"
                  style={{ fontFamily: 'monospace' }}
                  data-testid="new-event-code"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Libellé *
                </label>
                <Input
                  value={newEventType.label}
                  onChange={(e) => setNewEventType({...newEventType, label: e.target.value})}
                  placeholder="Ex: Kilométrage"
                  data-testid="new-event-label"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Catégorie
                </label>
                <select
                  value={newEventType.category}
                  onChange={(e) => setNewEventType({...newEventType, category: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  <option value="heures">Heures travaillées</option>
                  <option value="prime">Prime / Bonus</option>
                  <option value="frais">Frais / Remboursement</option>
                  <option value="deduction">Déduction</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  Unité
                </label>
                <select
                  value={newEventType.unit || 'heures'}
                  onChange={(e) => setNewEventType({...newEventType, unit: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                >
                  <option value="heures">Heures (h)</option>
                  <option value="km">Kilomètres (km)</option>
                  <option value="montant">Montant ($)</option>
                  <option value="quantite">Quantité</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  {newEventType.unit === 'heures' ? 'Multiplicateur du taux horaire' : 'Taux unitaire'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newEventType.default_rate || (newEventType.unit === 'heures' ? 1 : 0)}
                  onChange={(e) => setNewEventType({...newEventType, default_rate: parseFloat(e.target.value) || 0})}
                  placeholder={newEventType.unit === 'km' ? '$/km' : newEventType.unit === 'montant' ? '$' : newEventType.unit === 'heures' ? '1.0' : '$/unité'}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {newEventType.unit === 'km' ? '$/km (ex: 0.65)' : 
                   newEventType.unit === 'montant' ? 'Montant fixe $' : 
                   newEventType.unit === 'quantite' ? '$/unité' : 
                   'Ex: 1.0 = 100% du taux horaire employé, 1.5 = 150%'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="sm" onClick={handleAddEventType} data-testid="save-event-type-btn">
                <Check size={14} /> Enregistrer
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowEventTypeForm(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Liste des types d'heures */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Code</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Libellé</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Catégorie</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Unité</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }} title="Pour heures: multiplicateur du taux horaire employé. Pour km/$: taux unitaire">Taux/Multi.</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {eventTypes.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucun type configuré. Cliquez sur "Ajouter" pour en créer.
                  </td>
                </tr>
              ) : (
                eventTypes.map(et => (
                  <tr key={et.id || et.code} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600', color: '#2563eb' }}>{et.code}</td>
                    <td style={{ padding: '10px' }}>
                      {editingEventType?.id === et.id ? (
                        <Input
                          value={editingEventType.label}
                          onChange={(e) => setEditingEventType({...editingEventType, label: e.target.value})}
                          style={{ padding: '4px', fontSize: '0.8rem' }}
                        />
                      ) : et.label}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {editingEventType?.id === et.id ? (
                        <select
                          value={editingEventType.category}
                          onChange={(e) => setEditingEventType({...editingEventType, category: e.target.value})}
                          style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          <option value="heures">Heures</option>
                          <option value="prime">Prime</option>
                          <option value="frais">Frais</option>
                          <option value="deduction">Déduction</option>
                        </select>
                      ) : (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: et.category === 'heures' ? '#dbeafe' : 
                                     et.category === 'prime' ? '#fef3c7' : 
                                     et.category === 'deduction' ? '#fee2e2' : '#dcfce7',
                          color: et.category === 'heures' ? '#1e40af' : 
                                 et.category === 'prime' ? '#92400e' : 
                                 et.category === 'deduction' ? '#991b1b' : '#166534'
                        }}>
                          {et.category === 'heures' ? 'Heures' : 
                           et.category === 'prime' ? 'Prime' : 
                           et.category === 'deduction' ? 'Déduction' : 'Frais'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px', color: '#64748b', fontSize: '0.8rem' }}>
                      {editingEventType?.id === et.id ? (
                        <select
                          value={editingEventType.unit || 'heures'}
                          onChange={(e) => setEditingEventType({...editingEventType, unit: e.target.value})}
                          style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem' }}
                        >
                          <option value="heures">h</option>
                          <option value="km">km</option>
                          <option value="montant">$</option>
                          <option value="quantite">qté</option>
                        </select>
                      ) : (
                        et.unit === 'km' ? 'km' : 
                        et.unit === 'montant' ? '$' : 
                        et.unit === 'quantite' ? 'qté' : 'h'
                      )}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.8rem', color: et.default_rate ? '#059669' : '#9ca3af' }}>
                      {editingEventType?.id === et.id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editingEventType.default_rate || (et.unit === 'heures' ? 1 : 0)}
                          onChange={(e) => setEditingEventType({...editingEventType, default_rate: parseFloat(e.target.value) || 0})}
                          style={{ width: '80px', padding: '4px', fontSize: '0.75rem' }}
                        />
                      ) : (
                        et.default_rate ? 
                          (et.unit === 'heures' ? `×${et.default_rate.toFixed(2)}` : 
                           et.unit === 'km' ? `${et.default_rate.toFixed(2)}$/km` : 
                           et.unit === 'montant' ? `${et.default_rate.toFixed(2)}$` : 
                           `${et.default_rate.toFixed(2)}$/u`)
                          : (et.unit === 'heures' ? '×1.00' : '-')
                      )}}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      {et.id && (
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {editingEventType?.id === et.id ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={handleSaveEditEventType}>
                                <Check size={14} style={{ color: '#16a34a' }} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditingEventType(null)}>
                                <XCircle size={14} style={{ color: '#64748b' }} />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleEditEventType(et)}>
                                <Edit size={14} style={{ color: '#2563eb' }} />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteEventType(et.id)}>
                                <Trash2 size={14} style={{ color: '#ef4444' }} />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Button onClick={handleSaveParametres} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
        <span style={{ marginLeft: '8px' }}>Enregistrer les paramètres</span>
      </Button>
    </div>
  );

  // Onglet Export / Configuration fournisseur (style Agendrix/Nethris)
  const renderExportConfig = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. Sélection fournisseur */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          <Link size={20} /> Fournisseur de paie
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Sélectionnez votre logiciel de paie. Le format d'export sera automatiquement configuré.
        </p>
        <div style={{ maxWidth: '400px' }}>
          <select
            value={payrollConfig?.provider_id || ''}
            onChange={(e) => setPayrollConfig({...payrollConfig, provider_id: e.target.value || null})}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '1rem' }}
            data-testid="provider-select"
          >
            <option value="">-- Sélectionner un fournisseur --</option>
            {providersDisponibles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.export_format?.toUpperCase()}) {p.api_available && '⚡ API'}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleSavePayrollConfig} disabled={loading} style={{ marginTop: '16px' }} data-testid="save-provider-btn">
          <Check size={16} /> Enregistrer
        </Button>
      </div>

      {/* 2. Configuration Nethris - Numéro de compagnie (comme Agendrix) */}
      {selectedProvider?.name?.toLowerCase().includes('nethris') && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            🏢 Numéro(s) de compagnie
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
            Votre numéro de compagnie Nethris (affiché sur l'accueil de Nethris). 
            <strong style={{ color: '#dc2626' }}> Important: sans lettres</strong> (ex: PM123456 → 123456)
          </p>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="company_mode"
                checked={payrollConfig?.company_number_mode !== 'per_branch'}
                onChange={() => setPayrollConfig({...payrollConfig, company_number_mode: 'single'})}
              />
              Un numéro pour l'ensemble de l'organisation
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="company_mode"
                checked={payrollConfig?.company_number_mode === 'per_branch'}
                onChange={() => setPayrollConfig({...payrollConfig, company_number_mode: 'per_branch'})}
              />
              Un numéro par succursale
            </label>
          </div>

          <div style={{ maxWidth: '300px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Numéro de compagnie *
            </label>
            <Input
              type="text"
              value={payrollConfig?.company_number || ''}
              onChange={(e) => setPayrollConfig({...payrollConfig, company_number: e.target.value.replace(/[^0-9]/g, '')})}
              placeholder="Ex: 00066573"
              style={{ fontFamily: 'monospace' }}
              data-testid="company-number-input"
            />
          </div>
        </div>
      )}

      {/* 3. Codes de gains standards (comme Agendrix) */}
      {selectedProvider?.name?.toLowerCase().includes('nethris') && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
            📋 Correspondance de champs
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
            Inscrivez les codes de gains utilisés dans Nethris. Ces codes doivent avoir la mention <strong>"Hrs"</strong> (heures).
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Temps régulier
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_regulier || '1'}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_regulier: e.target.value})}
                placeholder="Ex: 1"
                style={{ fontFamily: 'monospace' }}
              />
              <small style={{ color: '#64748b' }}>Généralement le code "1"</small>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Temps supplémentaire
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_supplementaire || '43'}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_supplementaire: e.target.value})}
                placeholder="Ex: 43"
                style={{ fontFamily: 'monospace' }}
              />
              <small style={{ color: '#64748b' }}>Généralement le code "43"</small>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Formation régulière
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_formation_regulier || ''}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_formation_regulier: e.target.value})}
                placeholder="Ex: 2"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                Formation supplémentaire
              </label>
              <Input
                type="text"
                value={payrollConfig?.code_gain_formation_sup || ''}
                onChange={(e) => setPayrollConfig({...payrollConfig, code_gain_formation_sup: e.target.value})}
                placeholder="Ex: 44"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
          </div>
          
          <Button onClick={handleSavePayrollConfig} disabled={loading} style={{ marginTop: '16px' }}>
            <Check size={16} /> Enregistrer la configuration
          </Button>
        </div>
      )}

      {/* 4. Configuration API (si disponible pour le fournisseur sélectionné) */}
      {selectedProvider?.api_available && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', borderRadius: '12px', padding: '24px', border: '1px solid #86efac' }}>
          <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
            <Zap size={20} /> Intégration API {selectedProvider.name}
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            {payrollConfig?.api_connection_tested ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
                <CheckCircle size={20} />
                <span style={{ fontWeight: '600' }}>Connexion vérifiée</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
                <XCircle size={20} />
                <span style={{ fontWeight: '600' }}>Connexion non testée</span>
              </div>
            )}
            {payrollConfig?.api_last_test_result && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                ({payrollConfig.api_last_test_result})
              </span>
            )}
          </div>

          <p style={{ color: '#166534', fontSize: '0.875rem', marginBottom: '16px' }}>
            Entrez vos credentials API pour activer l'envoi direct des données de paie.
            {selectedProvider.api_documentation_url && (
              <a 
                href={selectedProvider.api_documentation_url} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ marginLeft: '8px', color: '#2563eb' }}
              >
                📖 Documentation
              </a>
            )}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            {selectedProvider.api_required_fields?.map((field) => (
              <div key={field.name}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
                  {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <Input
                  type={field.type || 'text'}
                  value={apiCredentials[field.name] || ''}
                  onChange={(e) => setApiCredentials({...apiCredentials, [field.name]: e.target.value})}
                  placeholder={field.help_text}
                  style={{ background: 'white' }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <Button onClick={handleSaveApiCredentials} disabled={loading}>
              <Check size={16} /> Enregistrer les credentials
            </Button>
            <Button 
              variant="outline" 
              onClick={handleTestApiConnection} 
              disabled={testingConnection}
              style={{ background: 'white' }}
            >
              {testingConnection ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
              <span style={{ marginLeft: '8px' }}>Tester la connexion</span>
            </Button>
          </div>
        </div>
      )}

      {/* 5. Associations des codes de gains (comme Agendrix) */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          🔗 Associations des codes de gains
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '8px' }}>
          Associez vos types d'heures aux codes de gains {selectedProvider?.name || 'de votre système de paie'} correspondants.
        </p>
        {selectedProvider?.name?.toLowerCase().includes('nethris') && (
          <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginBottom: '16px', background: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>
            ⚠️ Les codes de gains doivent avoir la mention <strong>"Hrs"</strong> (heures) dans Nethris. Les codes avec "$" ne sont pas compatibles.
          </p>
        )}
        
        {/* Formulaire d'ajout */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Type d'heures</label>
            <select
              value={newMapping.internal_event_type}
              onChange={(e) => setNewMapping({...newMapping, internal_event_type: e.target.value})}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
              data-testid="event-type-select"
            >
              <option value="">-- Sélectionner --</option>
              {eventTypes.map(et => (
                <option key={et.code} value={et.code}>{et.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Code de gain {selectedProvider?.name || ''}</label>
            <Input
              value={newMapping.external_pay_code}
              onChange={(e) => setNewMapping({...newMapping, external_pay_code: e.target.value})}
              placeholder="Ex: 1, 43, 105"
              data-testid="pay-code-input"
            />
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Description</label>
            <Input
              value={newMapping.description}
              onChange={(e) => setNewMapping({...newMapping, description: e.target.value})}
              placeholder="Optionnel"
            />
          </div>
          <Button onClick={handleAddCodeMapping} data-testid="add-mapping-btn">
            <Plus size={16} /> Ajouter
          </Button>
        </div>

        {/* Liste des mappings */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type d'heures</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Code de gain</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codeMappings.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucune association configurée. Ajoutez vos codes de gains pour activer l'export.
                  </td>
                </tr>
              ) : (
                codeMappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>
                      {eventTypes.find(et => et.code === m.internal_event_type)?.label || m.internal_event_type}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600', color: '#2563eb' }}>{m.external_pay_code}</td>
                    <td style={{ padding: '10px', color: '#64748b' }}>{m.description || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCodeMapping(m.id)}>
                        <Trash2 size={16} style={{ color: '#ef4444' }} />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Onglet Feuilles de temps
  const renderFeuilles = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Section génération en lot */}
      <div style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', borderRadius: '12px', padding: '24px', color: 'white' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={20} /> Générer les feuilles de temps (tous les employés)
        </h3>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Début période
            </label>
            <Input
              type="date"
              value={genPeriodeDebut}
              onChange={(e) => setGenPeriodeDebut(e.target.value)}
              style={{ background: 'white', color: '#1e293b' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>
              Fin période
            </label>
            <Input
              type="date"
              value={genPeriodeFin}
              onChange={(e) => setGenPeriodeFin(e.target.value)}
              style={{ background: 'white', color: '#1e293b' }}
            />
          </div>
          <Button onClick={handleGenererLot} disabled={loading} style={{ background: 'white', color: '#ea580c' }}>
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <FileText size={16} />}
            <span style={{ marginLeft: '8px' }}>Générer pour tous</span>
          </Button>
        </div>
      </div>

      {/* Filtres et export */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', border: '1px solid #e5e7eb', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={18} style={{ color: '#64748b' }} />
        <select
          value={filtreAnnee}
          onChange={(e) => setFiltreAnnee(parseInt(e.target.value))}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          {[2026, 2025, 2024].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          value={filtreMois}
          onChange={(e) => setFiltreMois(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les mois</option>
          <option value="01">Janvier</option>
          <option value="02">Février</option>
          <option value="03">Mars</option>
          <option value="04">Avril</option>
          <option value="05">Mai</option>
          <option value="06">Juin</option>
          <option value="07">Juillet</option>
          <option value="08">Août</option>
          <option value="09">Septembre</option>
          <option value="10">Octobre</option>
          <option value="11">Novembre</option>
          <option value="12">Décembre</option>
        </select>
        <select
          value={filtreEmploye}
          onChange={(e) => setFiltreEmploye(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les employés</option>
          {employes.map(e => (
            <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>
          ))}
        </select>
        <select
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
        >
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="valide">Validé</option>
          <option value="exporte">Exporté</option>
        </select>
        <Button variant="outline" onClick={fetchFeuilles}>
          <Search size={16} />
        </Button>
        <div style={{ flex: 1 }} />
        <Button onClick={handleExportPaie} disabled={loading}>
          <Download size={16} /> Exporter fichier
        </Button>
        {selectedProvider?.api_available && payrollConfig?.api_connection_tested && (
          <Button 
            onClick={handleSendToApi} 
            disabled={loading}
            style={{ background: '#dc2626' }}
          >
            <Zap size={16} /> Envoyer via API
          </Button>
        )}
      </div>

      {/* Liste des feuilles */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Employé</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Période</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '0.875rem' }}>Heures</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '0.875rem' }}>Montant</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Statut</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {feuilles.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                  Aucune feuille de temps trouvée
                </td>
              </tr>
            ) : (
              feuilles.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: '500' }}>{f.employe_prenom} {f.employe_nom}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{f.employe_grade} • {f.employe_type_emploi}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {f.periode_debut} → {f.periode_fin}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {f.total_heures_payees}h
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600' }}>
                    {formatMontant(f.total_montant_final)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {getStatutBadge(f.statut)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <Button variant="ghost" size="sm" onClick={() => handleVoirDetail(f.id)}>
                        <Eye size={16} />
                      </Button>
                      {f.statut === 'brouillon' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleValiderFeuille(f.id)}>
                            <Check size={16} style={{ color: '#dc2626' }} />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleSupprimerFeuille(f.id)}>
                            <Trash2 size={16} style={{ color: '#ef4444' }} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal détail */}
      {showDetail && selectedFeuille && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1000px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>Feuille de temps - {selectedFeuille.employe_prenom} {selectedFeuille.employe_nom}</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b' }}>
                  {selectedFeuille.periode_debut} → {selectedFeuille.periode_fin} • {getStatutBadge(selectedFeuille.statut)}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setShowDetail(false)}>✕</Button>
            </div>
            
            <div style={{ padding: '24px' }}>
              {/* Résumé - utilise les totaux en temps réel en mode édition */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#16a34a' }}>
                    {editMode ? totauxTempsReel?.gardes_internes?.toFixed(1) : selectedFeuille.total_heures_gardes_internes}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes int.</div>
                </div>
                <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#d97706' }}>
                    {editMode ? totauxTempsReel?.gardes_externes?.toFixed(1) : selectedFeuille.total_heures_gardes_externes}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes ext.</div>
                </div>
                <div style={{ background: '#fee2e2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#dc2626' }}>
                    {editMode ? totauxTempsReel?.rappels?.toFixed(1) : selectedFeuille.total_heures_rappels}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Rappels</div>
                </div>
                <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2563eb' }}>
                    {editMode ? totauxTempsReel?.formations?.toFixed(1) : selectedFeuille.total_heures_formations}h
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Formations</div>
                </div>
                <div style={{ background: '#f3e8ff', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#9333ea' }}>
                    {editMode ? formatMontant(totauxTempsReel?.montant_total) : formatMontant(selectedFeuille.total_montant_final)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Total</div>
                </div>
              </div>

              {/* Détail lignes */}
              <h4 style={{ margin: '0 0 12px' }}>Détail des entrées</h4>
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Date</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Qté/Heures</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Montant</th>
                      {editMode && <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontSize: '0.65rem' }} title="Fonction supérieure (+{parametres?.prime_fonction_superieure_pct || 10}%)">Fct.Sup.</th>}
                      {editMode && <th style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Mode lecture */}
                    {!editMode && selectedFeuille.lignes?.map((ligne, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{ligne.date}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            background: ligne.type === 'garde_interne' || ligne.type?.includes('GARDE_INTERNE') ? '#d1fae5' :
                                       ligne.type === 'garde_externe' || ligne.type?.includes('GARDE_EXTERNE') ? '#fef3c7' :
                                       ligne.type === 'rappel' ? '#fee2e2' :
                                       ligne.type === 'formation' || ligne.type?.includes('PRATIQUE') ? '#dbeafe' :
                                       ligne.type === 'prime_repas' || ligne.type?.includes('REPAS') ? '#f3e8ff' : '#f1f5f9'
                          }}>
                            {eventTypes.find(et => et.code === ligne.type)?.label || ligne.type}
                          </span>
                          {ligne.fonction_superieure && (
                            <span style={{ marginLeft: '4px', fontSize: '0.6rem', color: '#059669' }}>⬆️</span>
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          {ligne.description}
                          {ligne.note && <small style={{ display: 'block', color: '#64748b' }}>{ligne.note}</small>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === ligne.type);
                            const unit = eventType?.unit || 'heures';
                            const unitLabel = unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                            return ligne.heures_payees > 0 ? `${ligne.heures_payees}${unitLabel}` : '-';
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '500' }}>
                          {ligne.montant > 0 ? formatMontant(ligne.montant) : '-'}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Mode édition */}
                    {editMode && editedLignes.map((ligne, idx) => (
                      <tr key={ligne.id || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{ligne.date}</td>
                        <td style={{ padding: '8px' }}>
                          <select 
                            value={ligne.type}
                            onChange={(e) => handleUpdateLigne(ligne.id, 'type', e.target.value)}
                            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem', minWidth: '120px' }}
                          >
                            <option value="">-- Type --</option>
                            {eventTypes.length > 0 ? (
                              eventTypes.map(et => (
                                <option key={et.code} value={et.code}>{et.label}</option>
                              ))
                            ) : (
                              <>
                                <option value="garde_interne">Garde interne</option>
                                <option value="garde_externe">Garde externe</option>
                                <option value="rappel">Rappel</option>
                                <option value="formation">Formation</option>
                                <option value="intervention">Intervention</option>
                                <option value="prime_repas">Prime repas</option>
                                <option value="autre">Autre</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            value={ligne.description || ''}
                            onChange={(e) => handleUpdateLigne(ligne.id, 'description', e.target.value)}
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Input
                              type="number"
                              step="0.5"
                              value={ligne.heures_payees || 0}
                              onChange={(e) => handleUpdateLigne(ligne.id, 'heures_payees', parseFloat(e.target.value) || 0)}
                              style={{ width: '60px', padding: '4px', fontSize: '0.75rem', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b', minWidth: '20px' }}>
                              {(() => {
                                const eventType = eventTypes.find(et => et.code === ligne.type);
                                const unit = eventType?.unit || 'heures';
                                return unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                              })()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="number"
                            step="0.01"
                            value={ligne.montant || 0}
                            onChange={(e) => handleUpdateLigne(ligne.id, 'montant', parseFloat(e.target.value) || 0)}
                            style={{ width: '80px', padding: '4px', fontSize: '0.75rem', textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {/* Afficher Fct.Sup. uniquement pour les types en heures */}
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === ligne.type);
                            const isHourBased = !eventType?.unit || eventType?.unit === 'heures';
                            return isHourBased ? (
                              <input
                                type="checkbox"
                                checked={ligne.fonction_superieure || false}
                                onChange={(e) => handleUpdateLigne(ligne.id, 'fonction_superieure', e.target.checked)}
                                title={`Fonction supérieure (+${parametres?.prime_fonction_superieure_pct || 10}%)`}
                                style={{ cursor: 'pointer' }}
                              />
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>N/A</span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteLigne(ligne.id)}>
                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    
                    {/* Formulaire ajout nouvelle ligne (mode édition) */}
                    {editMode && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="date"
                            value={newLigne.date}
                            onChange={(e) => setNewLigne({...newLigne, date: e.target.value})}
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select 
                            value={newLigne.type}
                            onChange={(e) => {
                              const selectedType = e.target.value;
                              const eventType = eventTypes.find(et => et.code === selectedType);
                              const montant = calculerMontantAutomatique(selectedType, parseFloat(newLigne.heures_payees) || 0, newLigne.fonction_superieure);
                              setNewLigne({
                                ...newLigne, 
                                type: selectedType,
                                description: eventType?.label || newLigne.description,
                                montant: montant
                              });
                            }}
                            style={{ padding: '4px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.75rem', minWidth: '120px' }}
                          >
                            <option value="">-- Type --</option>
                            {eventTypes.length > 0 ? (
                              eventTypes.map(et => (
                                <option key={et.code} value={et.code}>{et.label}</option>
                              ))
                            ) : (
                              <>
                                <option value="garde_interne">Garde interne</option>
                                <option value="garde_externe">Garde externe</option>
                                <option value="rappel">Rappel</option>
                                <option value="formation">Formation</option>
                                <option value="intervention">Intervention</option>
                                <option value="prime_repas">Prime repas</option>
                                <option value="autre">Autre</option>
                              </>
                            )}
                          </select>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            value={newLigne.description}
                            onChange={(e) => setNewLigne({...newLigne, description: e.target.value})}
                            placeholder="Description"
                            style={{ padding: '4px', fontSize: '0.75rem' }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Input
                              type="number"
                              step="0.5"
                              value={newLigne.heures_payees}
                              onChange={(e) => {
                                const quantite = parseFloat(e.target.value) || 0;
                                const montant = calculerMontantAutomatique(newLigne.type, quantite, newLigne.fonction_superieure);
                                setNewLigne({...newLigne, heures_payees: e.target.value, montant: montant});
                              }}
                              style={{ width: '60px', padding: '4px', fontSize: '0.75rem', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: '0.7rem', color: '#64748b', minWidth: '20px' }}>
                              {(() => {
                                const eventType = eventTypes.find(et => et.code === newLigne.type);
                                const unit = eventType?.unit || 'heures';
                                return unit === 'km' ? 'km' : unit === 'montant' ? '$' : unit === 'quantite' ? '' : 'h';
                              })()}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <Input
                            type="number"
                            step="0.01"
                            value={newLigne.montant}
                            onChange={(e) => setNewLigne({...newLigne, montant: e.target.value})}
                            style={{ width: '80px', padding: '4px', fontSize: '0.75rem', textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {/* Afficher Fct.Sup. uniquement pour les types en heures */}
                          {(() => {
                            const eventType = eventTypes.find(et => et.code === newLigne.type);
                            const isHourBased = !newLigne.type || !eventType?.unit || eventType?.unit === 'heures';
                            return isHourBased ? (
                              <input
                                type="checkbox"
                                checked={newLigne.fonction_superieure || false}
                                onChange={(e) => setNewLigne({...newLigne, fonction_superieure: e.target.checked})}
                                title={`Fonction supérieure (+${parametres?.prime_fonction_superieure_pct || 10}%)`}
                                style={{ cursor: 'pointer' }}
                              />
                            ) : (
                              <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>N/A</span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <Button size="sm" onClick={handleAddLigne} data-testid="add-ligne-btn">
                            <Plus size={14} />
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {selectedFeuille.statut === 'brouillon' && !editMode && (
                <>
                  <Button variant="outline" onClick={handleStartEdit} data-testid="edit-feuille-btn">
                    <Edit size={16} /> Modifier
                  </Button>
                  <Button onClick={() => handleValiderFeuille(selectedFeuille.id)}>
                    <Check size={16} /> Valider
                  </Button>
                </>
              )}
              {editMode && (
                <>
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSaveFeuille} disabled={loading}>
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                    <span style={{ marginLeft: '8px' }}>Enregistrer</span>
                  </Button>
                </>
              )}
              {!editMode && <Button variant="outline" onClick={() => setShowDetail(false)}>Fermer</Button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Onglet Matricules (comme Agendrix - association des numéros de matricule)
  const renderMatricules = () => {
    const providerName = selectedProvider?.name || 'votre système de paie';
    
    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          👥 Association des numéros de matricule
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '8px' }}>
          Pour chacun de vos employés, inscrivez le numéro de matricule utilisé dans {providerName}.
        </p>
        <p style={{ color: '#f59e0b', fontSize: '0.8rem', marginBottom: '16px', background: '#fffbeb', padding: '8px 12px', borderRadius: '6px' }}>
          ⚠️ <strong>Important:</strong> Si vous laissez une case vide pour un employé, aucune information ne sera exportée pour cet employé.
          Assurez-vous de ne pas avoir deux matricules identiques pour deux employés différents.
        </p>

        <div style={{ marginBottom: '16px' }}>
          <Button onClick={handleSaveAllMatricules} disabled={loading} data-testid="save-all-matricules-btn">
            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
            <span style={{ marginLeft: '8px' }}>Enregistrer tous les matricules</span>
          </Button>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Employé</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Grade</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type d'emploi</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', width: '200px' }}>
                  Matricule {selectedProvider?.name || ''}
                  <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 'normal', color: '#64748b' }}>
                    (Numéro d'employé)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employes.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucun employé actif
                  </td>
                </tr>
              ) : (
                employes.map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: '500' }}>{emp.prenom} {emp.nom}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{emp.email}</div>
                    </td>
                    <td style={{ padding: '12px' }}>{emp.grade || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        background: emp.type_emploi === 'temps_plein' ? '#dbeafe' : '#fef3c7',
                        color: emp.type_emploi === 'temps_plein' ? '#1e40af' : '#92400e'
                      }}>
                        {emp.type_emploi === 'temps_plein' ? 'Temps plein' : 
                         emp.type_emploi === 'temps_partiel' ? 'Temps partiel' : 
                         emp.type_emploi || 'Non spécifié'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Input
                        type="text"
                        value={matriculesEmployes[emp.id] || ''}
                        onChange={(e) => setMatriculesEmployes(prev => ({
                          ...prev, 
                          [emp.id]: e.target.value
                        }))}
                        placeholder="Ex: 000003246"
                        style={{ fontFamily: 'monospace', maxWidth: '150px' }}
                        data-testid={`matricule-input-${emp.id}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedProvider?.name && (
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '16px' }}>
            💡 Consultez la documentation de {selectedProvider.name} pour trouver les matricules de vos employés.
          </p>
        )}
      </div>
    </div>
  );
  };

  // Définition des onglets (même style que GestionInterventions)
  const tabs = [
    { id: 'feuilles', label: 'Feuilles de temps', icon: '📄' },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️' },
    { id: 'export', label: 'Export', icon: '🔗' },
    { id: 'matricules', label: 'Matricules', icon: '👥' },
  ];

  return (
    <div className="p-6" data-testid="module-paie">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <DollarSign size={28} className="text-red-500" />
          Module Paie
        </h1>
        <p className="text-gray-600">Gestion des feuilles de temps et configuration de l'export vers votre logiciel de paie</p>
      </div>

      {/* Onglets - même style que GestionInterventions */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {tabs.map(tab => (
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

      {/* Contenu */}
      {activeTab === 'feuilles' && renderFeuilles()}
      {activeTab === 'parametres' && renderParametres()}
      {activeTab === 'export' && renderExportConfig()}
      {activeTab === 'matricules' && renderMatricules()}
    </div>
  );
};

export default ModulePaie;
