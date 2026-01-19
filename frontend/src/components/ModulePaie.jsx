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
  const [filtreEmploye, setFiltreEmploye] = useState('');
  const [filtreStatut, setFiltreStatut] = useState('');
  
  // Génération en lot
  const [genPeriodeDebut, setGenPeriodeDebut] = useState('');
  const [genPeriodeFin, setGenPeriodeFin] = useState('');
  
  // Nouveau mapping
  const [newMapping, setNewMapping] = useState({ internal_event_type: '', external_pay_code: '', description: '' });

  const token = localStorage.getItem('token');

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
  }, [tenant, token, filtreAnnee, filtreEmploye, filtreStatut]);

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
    if (!payrollConfig?.provider_id) {
      toast.error('Aucun fournisseur de paie configuré. Allez dans Paramètres > Export.');
      return;
    }
    
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

      <Button onClick={handleSaveParametres} disabled={loading} style={{ alignSelf: 'flex-start' }}>
        {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
        <span style={{ marginLeft: '8px' }}>Enregistrer les paramètres</span>
      </Button>
    </div>
  );

  // Onglet Export / Configuration fournisseur
  const renderExportConfig = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Sélection fournisseur */}
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
          >
            <option value="">-- Sélectionner un fournisseur --</option>
            {providersDisponibles.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.export_format?.toUpperCase()})</option>
            ))}
          </select>
        </div>
        <Button onClick={handleSavePayrollConfig} disabled={loading} style={{ marginTop: '16px' }}>
          <Check size={16} /> Enregistrer
        </Button>
      </div>

      {/* Mapping des codes */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', border: '1px solid #e5e7eb' }}>
        <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' }}>
          🔗 Mapping des codes de paie
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '16px' }}>
          Associez vos types d'événements aux codes attendus par votre logiciel de paie.
        </p>
        
        {/* Formulaire d'ajout */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Type d'événement</label>
            <select
              value={newMapping.internal_event_type}
              onChange={(e) => setNewMapping({...newMapping, internal_event_type: e.target.value})}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
            >
              <option value="">-- Sélectionner --</option>
              {eventTypes.map(et => (
                <option key={et.code} value={et.code}>{et.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1', minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500', fontSize: '0.875rem' }}>Code paie externe</label>
            <Input
              value={newMapping.external_pay_code}
              onChange={(e) => setNewMapping({...newMapping, external_pay_code: e.target.value})}
              placeholder="Ex: REG, 105, T-FEU"
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
          <Button onClick={handleAddCodeMapping}>
            <Plus size={16} /> Ajouter
          </Button>
        </div>

        {/* Liste des mappings */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Type d'événement</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Code paie</th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Description</th>
                <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {codeMappings.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                    Aucun mapping configuré
                  </td>
                </tr>
              ) : (
                codeMappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>
                      {eventTypes.find(et => et.code === m.internal_event_type)?.label || m.internal_event_type}
                    </td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: '600' }}>{m.external_pay_code}</td>
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
      <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '12px', padding: '24px', color: 'white' }}>
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
          <Button onClick={handleGenererLot} disabled={loading} style={{ background: 'white', color: '#059669' }}>
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
        <Button onClick={handleExportPaie} disabled={loading || !payrollConfig?.provider_id}>
          <Download size={16} /> Exporter vers logiciel de paie
        </Button>
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
                            <Check size={16} style={{ color: '#10b981' }} />
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
              {/* Résumé */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#16a34a' }}>{selectedFeuille.total_heures_gardes_internes}h</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes int.</div>
                </div>
                <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#d97706' }}>{selectedFeuille.total_heures_gardes_externes}h</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Gardes ext.</div>
                </div>
                <div style={{ background: '#fee2e2', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#dc2626' }}>{selectedFeuille.total_heures_rappels}h</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Rappels</div>
                </div>
                <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#2563eb' }}>{selectedFeuille.total_heures_formations}h</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Formations</div>
                </div>
                <div style={{ background: '#f3e8ff', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#9333ea' }}>{formatMontant(selectedFeuille.total_montant_final)}</div>
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
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Heures</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedFeuille.lignes?.map((ligne, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>{ligne.date}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            background: ligne.type === 'garde_interne' ? '#d1fae5' :
                                       ligne.type === 'garde_externe' ? '#fef3c7' :
                                       ligne.type === 'rappel' ? '#fee2e2' :
                                       ligne.type === 'formation' ? '#dbeafe' :
                                       ligne.type === 'prime_repas' ? '#f3e8ff' : '#f1f5f9'
                          }}>
                            {ligne.type}
                          </span>
                        </td>
                        <td style={{ padding: '8px' }}>
                          {ligne.description}
                          {ligne.note && <small style={{ display: 'block', color: '#64748b' }}>{ligne.note}</small>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          {ligne.heures_payees > 0 ? `${ligne.heures_payees}h` : '-'}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '500' }}>
                          {ligne.montant > 0 ? formatMontant(ligne.montant) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {selectedFeuille.statut === 'brouillon' && (
                <Button onClick={() => handleValiderFeuille(selectedFeuille.id)}>
                  <Check size={16} /> Valider
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowDetail(false)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <DollarSign size={28} style={{ color: '#10b981' }} />
          Module Paie
        </h1>
        <p style={{ margin: 0, color: '#64748b' }}>
          Gestion des feuilles de temps et configuration de l'export vers votre logiciel de paie
        </p>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveTab('feuilles')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'feuilles' ? '#10b981' : 'transparent',
            color: activeTab === 'feuilles' ? 'white' : '#64748b',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileText size={18} /> Feuilles de temps
        </button>
        <button
          onClick={() => setActiveTab('parametres')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'parametres' ? '#10b981' : 'transparent',
            color: activeTab === 'parametres' ? 'white' : '#64748b',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Settings size={18} /> Paramètres
        </button>
        <button
          onClick={() => setActiveTab('export')}
          style={{
            padding: '10px 20px',
            border: 'none',
            background: activeTab === 'export' ? '#10b981' : 'transparent',
            color: activeTab === 'export' ? 'white' : '#64748b',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Link size={18} /> Export
        </button>
      </div>

      {/* Contenu */}
      {activeTab === 'feuilles' && renderFeuilles()}
      {activeTab === 'parametres' && renderParametres()}
      {activeTab === 'export' && renderExportConfig()}
    </div>
  );
};

export default ModulePaie;
