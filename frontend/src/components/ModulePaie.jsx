import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { 
  DollarSign, 
  RefreshCw
} from 'lucide-react';
import TabParametres from './paie/TabParametres';
import TabExport from './paie/TabExport';
import TabFeuilles from './paie/TabFeuilles';
import TabMatricules from './paie/TabMatricules';
import TabJoursFeries from './paie/TabJoursFeries';

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
  const [newLigne, setNewLigne] = useState({ date: new Date().toISOString().split('T')[0], type: '', description: '', heures_payees: 0, montant: 0 });
  
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

  // Modifier un type d'heure existant
  const [editingEventType, setEditingEventType] = useState(null);

  // Récupérer le token avec le bon préfixe tenant
  const getToken = () => localStorage.getItem(`${tenant}_token`);

  // ===== FETCH FUNCTIONS =====
  const fetchParametres = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/parametres`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setParametres(data);
      }
    } catch (error) {
      console.error('Erreur chargement paramètres paie:', error);
    }
  }, [tenant]);

  const fetchFeuilles = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) return;
    try {
      let url = `${API_URL}/api/${tenant}/paie/feuilles-temps?`;
      if (filtreAnnee) url += `annee=${filtreAnnee}&`;
      if (filtreMois) url += `mois=${filtreMois}&`;
      if (filtreEmploye) url += `user_id=${filtreEmploye}&`;
      if (filtreStatut) url += `statut=${filtreStatut}&`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFeuilles(data.feuilles || []);
      }
    } catch (error) {
      console.error('Erreur chargement feuilles:', error);
    }
  }, [tenant, filtreAnnee, filtreMois, filtreEmploye, filtreStatut]);

  const fetchEmployes = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/users`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setEmployes(data.filter(u => u.statut === 'Actif'));
      }
    } catch (error) {
      console.error('Erreur chargement employés:', error);
    }
  }, [tenant]);

  const fetchPayrollConfig = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPayrollConfig(data.config);
        setProvidersDisponibles(data.providers_disponibles || []);
      }
    } catch (error) {
      console.error('Erreur chargement config paie:', error);
    }
  }, [tenant]);

  const fetchCodeMappings = useCallback(async () => {
    const currentToken = getToken();
    if (!currentToken) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCodeMappings(data.mappings || []);
        setEventTypes(data.event_types || []);
      }
    } catch (error) {
      console.error('Erreur chargement mappings:', error);
    }
  }, [tenant]);

  // ===== EFFECTS =====
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

  useEffect(() => {
    if (payrollConfig?.api_credentials) {
      setApiCredentials(payrollConfig.api_credentials);
    }
  }, [payrollConfig]);

  const selectedProvider = providersDisponibles.find(p => p.id === payrollConfig?.provider_id);

  // ===== HANDLERS =====
  const handleSaveApiCredentials = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/api/save-credentials`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
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
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      if (data.success) { toast.success(data.message); } else { toast.error(data.message); }
      fetchPayrollConfig();
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSendToApi = async () => {
    const feuillesAExporter = feuilles.filter(f => f.statut === 'valide');
    if (feuillesAExporter.length === 0) { toast.error('Aucune feuille validée à exporter'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/api/send`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feuille_ids: feuillesAExporter.map(f => f.id) })
      });
      const data = await response.json();
      if (data.success) { toast.success(data.message); fetchFeuilles(); } else { toast.error(data.message); }
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
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(parametres)
      });
      if (response.ok) { toast.success('Paramètres enregistrés'); } 
      else { const error = await response.json(); toast.error(error.detail || 'Erreur lors de l\'enregistrement'); }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleGenererLot = async () => {
    if (!genPeriodeDebut || !genPeriodeFin) { toast.error('Veuillez sélectionner une période'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/generer-lot`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode_debut: genPeriodeDebut, periode_fin: genPeriodeFin })
      });
      if (response.ok) { const data = await response.json(); toast.success(data.message); fetchFeuilles(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur lors de la génération'); }
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
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        toast.success('Feuille validée');
        fetchFeuilles();
        if (selectedFeuille?.id === feuilleId) setSelectedFeuille({...selectedFeuille, statut: 'valide'});
      } else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleSupprimerFeuille = async (feuilleId) => {
    if (!window.confirm('Supprimer cette feuille de temps ?')) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        toast.success('Feuille supprimée');
        fetchFeuilles();
        if (selectedFeuille?.id === feuilleId) { setSelectedFeuille(null); setShowDetail(false); }
      } else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleVoirDetail = async (feuilleId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${feuilleId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) { const data = await response.json(); setSelectedFeuille(data); setShowDetail(true); }
    } catch (error) { toast.error('Erreur de chargement'); }
  };

  const handleExportPaie = async () => {
    const feuillesAExporter = feuilles.filter(f => f.statut === 'valide' || f.statut === 'exporte');
    if (feuillesAExporter.length === 0) { toast.error('Aucune feuille validée ou exportée à exporter'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/export`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feuille_ids: feuillesAExporter.map(f => f.id) })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'export_paie.xlsx';
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
        toast.success(`${feuillesAExporter.length} feuille(s) exportée(s)`);
        fetchFeuilles();
      } else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleValiderTout = async () => {
    const feuillesBrouillon = feuilles.filter(f => f.statut === 'brouillon');
    if (feuillesBrouillon.length === 0) { toast.error('Aucune feuille en brouillon à valider'); return; }
    if (!window.confirm(`Valider ${feuillesBrouillon.length} feuille(s) en brouillon ?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/valider-tout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ periode_debut: genPeriodeDebut || undefined, periode_fin: genPeriodeFin || undefined })
      });
      const data = await response.json();
      if (response.ok) { toast.success(data.message || `${data.count} feuille(s) validée(s)`); fetchFeuilles(); }
      else { toast.error(data.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleExportPDF = async (feuilleId = null) => {
    const feuillesExportables = feuilles.filter(f => f.statut === 'valide' || f.statut === 'exporte');
    if (!feuilleId && feuillesExportables.length === 0) { toast.error('Aucune feuille validée à exporter en PDF'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/export-pdf`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ feuille_id: feuilleId || undefined, periode_debut: genPeriodeDebut || undefined, periode_fin: genPeriodeFin || undefined })
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'feuilles_temps.pdf';
        document.body.appendChild(a); a.click(); a.remove();
        window.URL.revokeObjectURL(url);
        toast.success(feuilleId ? 'PDF généré' : `PDF généré avec ${feuillesExportables.length} feuille(s)`);
      } else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleStartEdit = () => {
    const lignesAvecIds = (selectedFeuille.lignes || []).map((ligne, idx) => ({
      ...ligne, id: ligne.id || `ligne-${idx}-${Date.now()}`
    }));
    setEditedLignes(lignesAvecIds);
    setEditMode(true);
  };

  const handleSaveFeuille = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/feuilles-temps/${selectedFeuille.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lignes: editedLignes })
      });
      if (response.ok) {
        const data = await response.json();
        toast.success('Feuille de temps mise à jour');
        setSelectedFeuille(data.feuille); setEditMode(false); fetchFeuilles();
      } else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleAddLigne = () => {
    if (!newLigne.date || !newLigne.type) { toast.error('Date et type requis'); return; }
    const ligne = {
      id: `manual-${Date.now()}`, ...newLigne,
      heures_brutes: parseFloat(newLigne.heures_payees) || 0,
      heures_payees: parseFloat(newLigne.heures_payees) || 0,
      montant: parseFloat(newLigne.montant) || 0,
      taux: 1, source_type: 'manuel'
    };
    setEditedLignes([...editedLignes, ligne].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    setNewLigne({ date: new Date().toISOString().split('T')[0], type: '', description: '', heures_payees: 0, montant: 0 });
  };

  const handleDeleteLigne = (ligneId) => {
    setEditedLignes(editedLignes.filter(l => l.id !== ligneId));
  };

  const calculerTotauxEnTempsReel = (lignes) => {
    const totaux = { gardes_internes: 0, gardes_externes: 0, rappels: 0, formations: 0, heures_payees: 0, montant_total: 0 };
    for (const ligne of lignes) {
      const type = (ligne.type || '').toLowerCase();
      const code = ligne.type || '';
      const heures = parseFloat(ligne.heures_payees) || 0;
      const montant = parseFloat(ligne.montant) || 0;
      if (type.includes('garde_interne') || code.includes('GARDE_INTERNE')) totaux.gardes_internes += heures;
      else if (type.includes('garde_externe') || code.includes('GARDE_EXTERNE')) totaux.gardes_externes += heures;
      else if (type.includes('rappel') || code.includes('RAPPEL') || code.includes('REPONDANT')) totaux.rappels += heures;
      else if (type.includes('formation') || type.includes('pratique') || code.includes('FORMATION') || code.includes('PRATIQUE')) totaux.formations += heures;
      const eventType = eventTypes.find(et => et.code === code);
      if (!eventType?.unit || eventType?.unit === 'heures') totaux.heures_payees += heures;
      totaux.montant_total += montant;
    }
    return totaux;
  };

  const totauxTempsReel = editMode ? calculerTotauxEnTempsReel(editedLignes) : null;

  const calculerMontantAutomatique = (typeCode, quantite, fonctionSuperieure = false) => {
    const eventType = eventTypes.find(et => et.code === typeCode);
    if (!eventType) return 0;
    const unit = eventType.unit || 'heures';
    const tauxType = eventType.default_rate || 0;
    if (unit === 'heures') {
      const tauxHoraireEmploye = selectedFeuille?.taux_horaire || 25;
      const multiplicateur = tauxType || 1;
      let montant = quantite * tauxHoraireEmploye * multiplicateur;
      if (fonctionSuperieure) {
        const primePct = (parametres?.prime_fonction_superieure_pct || 10) / 100;
        montant = montant * (1 + primePct);
      }
      return Math.round(montant * 100) / 100;
    } else {
      return Math.round(quantite * tauxType * 100) / 100;
    }
  };

  const handleUpdateLigne = (ligneId, field, value) => {
    setEditedLignes(editedLignes.map(l => {
      if (l.id === ligneId) {
        const updated = { ...l, [field]: value };
        if (field === 'type') {
          const et = eventTypes.find(e => e.code === value);
          if (et) { updated.description = et.label; updated.montant = calculerMontantAutomatique(value, parseFloat(updated.heures_payees) || 0, updated.fonction_superieure); }
        }
        if (field === 'heures_payees') updated.montant = calculerMontantAutomatique(updated.type, parseFloat(value) || 0, updated.fonction_superieure);
        if (field === 'fonction_superieure') updated.montant = calculerMontantAutomatique(updated.type, parseFloat(updated.heures_payees) || 0, value);
        return updated;
      }
      return l;
    }));
  };

  const handleEditEventType = (eventType) => { setEditingEventType({...eventType}); };

  const handleSaveEditEventType = async () => {
    if (!editingEventType) return;
    const identifier = editingEventType.id || editingEventType.code;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${identifier}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEventType)
      });
      if (response.ok) { toast.success('Type d\'heure modifié'); setEditingEventType(null); fetchCodeMappings(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleSavePayrollConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/config`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payrollConfig)
      });
      if (response.ok) { toast.success('Configuration enregistrée'); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleAddCodeMapping = async () => {
    if (!newMapping.internal_event_type || !newMapping.external_pay_code) { toast.error('Veuillez remplir le type et le code'); return; }
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapping)
      });
      if (response.ok) { toast.success('Mapping ajouté'); setNewMapping({ internal_event_type: '', external_pay_code: '', description: '' }); fetchCodeMappings(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleDeleteCodeMapping = async (mappingId) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/code-mappings/${mappingId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) { toast.success('Mapping supprimé'); fetchCodeMappings(); }
    } catch (error) { toast.error('Erreur'); }
  };

  const handleSaveMatricule = async (employeId, matricule) => {
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/users/${employeId}/matricule-paie`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule_paie: matricule })
      });
      if (response.ok) { toast.success('Matricule enregistré'); setMatriculesEmployes(prev => ({...prev, [employeId]: matricule})); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleSaveAllMatricules = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/matricules`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricules: matriculesEmployes })
      });
      if (response.ok) { toast.success('Tous les matricules ont été enregistrés'); fetchEmployes(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleAddEventType = async () => {
    if (!newEventType.code || !newEventType.label) { toast.error('Le code et le libellé sont requis'); return; }
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newEventType)
      });
      if (response.ok) { toast.success('Type d\'heure ajouté'); setNewEventType({ code: '', label: '', category: 'heures', unit: 'heures', default_rate: 0 }); setShowEventTypeForm(false); fetchCodeMappings(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const handleDeleteEventType = async (eventTypeId) => {
    if (!window.confirm('Supprimer ce type d\'heure ? Les mappings associés seront aussi supprimés.')) return;
    try {
      const response = await fetch(`${API_URL}/api/${tenant}/paie/event-types/${eventTypeId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) { toast.success('Type d\'heure supprimé'); fetchCodeMappings(); }
      else { const error = await response.json(); toast.error(error.detail || 'Erreur'); }
    } catch (error) { toast.error('Erreur de connexion'); }
  };

  const getStatutBadge = (statut) => {
    const styles = { brouillon: { bg: '#fef3c7', color: '#92400e', text: 'Brouillon' }, valide: { bg: '#d1fae5', color: '#065f46', text: 'Validé' }, exporte: { bg: '#dbeafe', color: '#1e40af', text: 'Exporté' } };
    const s = styles[statut] || styles.brouillon;
    return (<span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '600', background: s.bg, color: s.color }}>{s.text}</span>);
  };

  const formatMontant = (montant) => {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(montant || 0);
  };

  // ===== CONTEXT OBJECT FOR TAB COMPONENTS =====
  const tabContext = {
    // State
    parametres, setParametres, feuilles, employes, selectedFeuille, setSelectedFeuille,
    showDetail, setShowDetail, editMode, setEditMode, editedLignes, setEditedLignes,
    newLigne, setNewLigne, payrollConfig, setPayrollConfig, providersDisponibles,
    codeMappings, newMapping, setNewMapping, eventTypes, apiCredentials, setApiCredentials,
    testingConnection, filtreAnnee, setFiltreAnnee, filtreMois, setFiltreMois,
    filtreEmploye, setFiltreEmploye, filtreStatut, setFiltreStatut,
    genPeriodeDebut, setGenPeriodeDebut, genPeriodeFin, setGenPeriodeFin,
    matriculesEmployes, setMatriculesEmployes, newEventType, setNewEventType,
    showEventTypeForm, setShowEventTypeForm, editingEventType, setEditingEventType,
    selectedProvider, loading, totauxTempsReel,
    // Handlers
    handleSaveParametres, handleGenererLot, handleValiderFeuille, handleSupprimerFeuille,
    handleVoirDetail, handleExportPaie, handleValiderTout, handleExportPDF,
    handleStartEdit, handleSaveFeuille, handleAddLigne, handleDeleteLigne,
    handleUpdateLigne, calculerMontantAutomatique, handleSaveApiCredentials,
    handleTestApiConnection, handleSendToApi, handleSavePayrollConfig,
    handleAddCodeMapping, handleDeleteCodeMapping, handleSaveMatricule,
    handleSaveAllMatricules, handleAddEventType, handleDeleteEventType,
    handleEditEventType, handleSaveEditEventType, getStatutBadge, formatMontant,
    fetchFeuilles
  };

  // ===== TABS DEFINITION =====
  const tabs = [
    { id: 'feuilles', label: 'Feuilles de temps', icon: '📄' },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️' },
    { id: 'jours-feries', label: 'Jours Fériés', icon: '📅' },
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
        <p className="text-gray-600">Gestion des feuilles de temps et configuration de l&apos;export vers votre logiciel de paie</p>
      </div>

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

      {activeTab === 'feuilles' && <TabFeuilles context={tabContext} />}
      {activeTab === 'parametres' && <TabParametres context={tabContext} />}
      {activeTab === 'export' && <TabExport context={tabContext} />}
      {activeTab === 'matricules' && <TabMatricules context={tabContext} />}
    </div>
  );
};

export default ModulePaie;
