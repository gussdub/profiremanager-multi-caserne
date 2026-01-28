import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Calendar } from "./ui/calendar";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { fr } from "date-fns/locale";

// Fonction pour parser une date en évitant les problèmes de timezone
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const Remplacements = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const [demandes, setDemandes] = useState([]);
  const [demandesConge, setDemandesConge] = useState([]);
  const [users, setUsers] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('remplacements');
  const [viewMode, setViewMode] = useState('liste'); // 'liste' ou 'cartes'
  const [filterStatut, setFilterStatut] = useState('tous'); // 'tous', 'en_attente', 'accepte', 'refuse'
  const [showCreateRemplacementModal, setShowCreateRemplacementModal] = useState(false);
  const [showCreateCongeModal, setShowCreateCongeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState(''); // 'pdf' ou 'excel'
  // Fonction pour obtenir la date locale au format YYYY-MM-DD
  const getLocalDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [newDemande, setNewDemande] = useState({
    type_garde_id: '',
    date: getLocalDateString(),
    raison: '',
    priorite: 'normale'
  });
  const [newConge, setNewConge] = useState({
    type_conge: '',
    date_debut: getLocalDateString(),
    date_fin: getLocalDateString(),
    raison: '',
    priorite: 'normale'
  });
  const [propositionsRecues, setPropositionsRecues] = useState([]);
  const { toast } = useToast();

  const typesConge = [
    { value: 'maladie', label: '🏥 Maladie', description: 'Arrêt maladie avec justificatif' },
    { value: 'vacances', label: '🏖️ Vacances', description: 'Congés payés annuels' },
    { value: 'parental', label: '👶 Parental', description: 'Congé maternité/paternité' },
    { value: 'personnel', label: '👤 Personnel', description: 'Congé exceptionnel sans solde' }
  ];

  const niveauxPriorite = [
    { value: 'urgente', label: '🚨 Urgente', color: '#EF4444', description: 'Traitement immédiat requis' },
    { value: 'haute', label: '🔥 Haute', color: '#F59E0B', description: 'Traitement prioritaire dans 24h' },
    { value: 'normale', label: '📋 Normale', color: '#3B82F6', description: 'Traitement dans délai standard' },
    { value: 'faible', label: '📝 Faible', color: '#6B7280', description: 'Traitement différé possible' }
  ];

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  // Écouter les événements de navigation précise (depuis les notifications)
  useEffect(() => {
    const handleOpenDemandeConge = async (event) => {
      const { demandeId } = event.detail || {};
      console.log('[Remplacements] Ouverture demande de congé:', demandeId);
      
      if (demandeId) {
        // Naviguer vers l'onglet congés
        setActiveTab('conges');
        
        // Si les données ne sont pas encore chargées, les charger
        if (demandesConge.length === 0) {
          try {
            const data = await apiGet(tenantSlug, '/demandes-conges');
            setDemandesConge(data || []);
            // Le modal s'ouvrira quand on aura les données
          } catch (error) {
            console.error('Erreur chargement congés:', error);
          }
        }
        // TODO: Ouvrir un modal de détail si nécessaire
      }
    };

    const handleOpenDemandeRemplacement = async (event) => {
      const { demandeId } = event.detail || {};
      console.log('[Remplacements] Ouverture demande de remplacement:', demandeId);
      
      if (demandeId) {
        // Naviguer vers l'onglet remplacements
        setActiveTab('remplacements');
        
        // Si les données ne sont pas encore chargées, les charger
        if (demandes.length === 0) {
          try {
            const data = await apiGet(tenantSlug, '/demandes-remplacement');
            setDemandes(data || []);
          } catch (error) {
            console.error('Erreur chargement remplacements:', error);
          }
        }
        // TODO: Ouvrir un modal de détail si nécessaire
      }
    };

    window.addEventListener('openDemandeConge', handleOpenDemandeConge);
    window.addEventListener('openDemandeRemplacementQuart', handleOpenDemandeRemplacement);
    
    return () => {
      window.removeEventListener('openDemandeConge', handleOpenDemandeConge);
      window.removeEventListener('openDemandeRemplacementQuart', handleOpenDemandeRemplacement);
    };
  }, [tenantSlug, demandesConge.length, demandes.length]);

  const fetchData = async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const promises = [
        apiGet(tenantSlug, '/remplacements'),
        apiGet(tenantSlug, '/demandes-conge'),
        apiGet(tenantSlug, '/types-garde'),
        apiGet(tenantSlug, '/remplacements/propositions').catch(() => []) // Propositions reçues par l'utilisateur
      ];
      
      if (!['employe', 'pompier'].includes(user.role)) {
        promises.push(apiGet(tenantSlug, '/users'));
      }

      const responses = await Promise.all(promises);
      
      // Trier par date de création (plus récent en premier)
      const sortByCreatedAt = (a, b) => new Date(b.created_at) - new Date(a.created_at);
      
      setDemandes((responses[0] || []).sort(sortByCreatedAt));
      setDemandesConge((responses[1] || []).sort(sortByCreatedAt));
      setTypesGarde(responses[2]);
      setPropositionsRecues((responses[3] || []).sort(sortByCreatedAt));
      
      if (responses[4]) {
        setUsers(responses[4]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Basculer automatiquement vers l'onglet propositions s'il y en a
  useEffect(() => {
    if (propositionsRecues.length > 0 && activeTab === 'remplacements') {
      setActiveTab('propositions');
    }
  }, [propositionsRecues]);

  const handleCreateRemplacement = async () => {
    if (!newDemande.type_garde_id || !newDemande.date || !newDemande.raison.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPost(tenantSlug, '/remplacements', newDemande);
      toast({
        title: "Demande créée",
        description: "Votre demande de remplacement a été soumise et la recherche automatique va commencer",
        variant: "success"
      });
      setShowCreateRemplacementModal(false);
      setNewDemande({ type_garde_id: '', date: '', raison: '', priorite: 'normale' });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la demande",
        variant: "destructive"
      });
    }
  };

  const handleCreateConge = async () => {
    if (!newConge.type_conge || !newConge.date_debut || !newConge.date_fin || !newConge.raison.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPost(tenantSlug, '/demandes-conge', newConge);
      toast({
        title: "Demande de congé créée",
        description: "Votre demande a été soumise et sera examinée par votre superviseur",
        variant: "success"
      });
      setShowCreateCongeModal(false);
      setNewConge({ type_conge: '', date_debut: '', date_fin: '', raison: '', priorite: 'normale' });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la demande de congé",
        variant: "destructive"
      });
    }
  };

  const handleApprouverConge = async (demandeId, action, commentaire = "") => {
    if (['employe', 'pompier'].includes(user.role)) return;

    try {
      await apiPut(tenantSlug, `/demandes-conge/${demandeId}/approuver?action=${action}&commentaire=${commentaire}`, {});
      toast({
        title: action === 'approuver' ? "Congé approuvé" : "Congé refusé",
        description: `La demande de congé a été ${action === 'approuver' ? 'approuvée' : 'refusée'}`,
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de traiter la demande",
        variant: "destructive"
      });
    }
  };

  const handleApprouverRemplacement = async (demandeId, action) => {
    if (['employe', 'pompier'].includes(user.role)) return;

    try {
      const endpoint = action === 'approuver' ? 'accepter' : 'refuser';
      await apiPut(tenantSlug, `/remplacements/${demandeId}/${endpoint}`, {});
      toast({
        title: action === 'approuver' ? "Demande approuvée" : "Demande rejetée",
        description: `La demande de remplacement a été ${action === 'approuver' ? 'approuvée' : 'rejetée'}`,
        variant: "success"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de traiter la demande",
        variant: "destructive"
      });
    }
  };

  // Handler pour répondre à une proposition de remplacement (pour les remplaçants)
  const handleRepondreProposition = async (demandeId, action) => {
    try {
      const endpoint = action === 'accepter' ? 'accepter' : 'refuser';
      await apiPut(tenantSlug, `/remplacements/${demandeId}/${endpoint}`, {});
      toast({
        title: action === 'accepter' ? "✅ Remplacement accepté" : "Proposition refusée",
        description: action === 'accepter' 
          ? "Vous avez accepté ce remplacement. L'échange sera effectué automatiquement."
          : "Vous avez refusé cette proposition. Un autre remplaçant sera contacté.",
        variant: action === 'accepter' ? "success" : "default"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de traiter votre réponse",
        variant: "destructive"
      });
    }
  };

  const getStatutColor = (statut) => {
    switch (statut) {
      case 'en_cours': case 'en_attente': return '#F59E0B';
      case 'approuve': return '#10B981';
      case 'refuse': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatutLabel = (statut) => {
    switch (statut) {
      case 'en_cours': return 'En cours';
      case 'en_attente': return 'En attente';
      case 'approuve': return 'Approuvé';
      case 'refuse': return 'Refusé';
      default: return statut;
    }
  };

  const getTypeGardeName = (typeGardeId) => {
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.nom : 'Type non spécifié';
  };

  const handleFilterUrgentConges = () => {
    const congesUrgents = demandesConge.filter(d => d.priorite === 'urgente' && d.statut === 'en_attente');
    if (congesUrgents.length > 0) {
      toast({
        title: "Congés urgents",
        description: `${congesUrgents.length} demande(s) urgente(s) nécessite(nt) un traitement immédiat`,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Aucun congé urgent",
        description: "Aucune demande urgente en attente",
        variant: "default"
      });
    }
  };

  const handleExportConges = () => {
    try {
      // Simuler l'export (en production, ça générerait un fichier Excel/CSV)
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
    } catch (error) {
      toast({
        title: "Erreur d'export",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    }
  };

  const handlePlanningImpact = () => {
    const congesApprouves = demandesConge.filter(d => d.statut === 'approuve');
    const joursImpactes = congesApprouves.reduce((total, conge) => total + conge.nombre_jours, 0);
    
    toast({
      title: "Impact sur le planning",
      description: `${congesApprouves.length} congé(s) approuvé(s) = ${joursImpactes} jour(s) à remplacer dans le planning`,
      variant: "default"
    });
  };

  const getUserName = (userId) => {
    const foundUser = users.find(u => u.id === userId);
    return foundUser ? `${foundUser.prenom} ${foundUser.nom}` : `Employé #${userId?.slice(-4)}`;
  };

  const getPrioriteColor = (priorite) => {
    const prioriteObj = niveauxPriorite.find(p => p.value === priorite);
    return prioriteObj ? prioriteObj.color : '#6B7280';
  };

  if (loading) return <div className="loading" data-testid="replacements-loading">Chargement...</div>;

  // Déterminer si l'utilisateur est admin/superviseur
  const isAdminOrSuperviseur = !['employe', 'pompier'].includes(user.role);

  // Filtrer les demandes selon le rôle pour les KPIs ET l'affichage
  const mesDemandes = isAdminOrSuperviseur 
    ? demandes 
    : demandes.filter(d => d.demandeur_id === user.id);
  
  const mesConges = isAdminOrSuperviseur
    ? demandesConge
    : demandesConge.filter(c => c.demandeur_id === user.id);

  // Calculer les KPIs sur MES demandes (pour pompiers) ou TOUTES (pour admins)
  const totalDemandes = mesDemandes.length;
  const enAttente = mesDemandes.filter(d => d.statut === 'en_cours').length;
  const acceptees = mesDemandes.filter(d => d.statut === 'approuve').length;
  const refusees = mesDemandes.filter(d => d.statut === 'refuse').length;
  const remplacementsTrouves = mesDemandes.filter(d => d.statut === 'approuve' && d.remplacant_id).length;
  const tauxSucces = totalDemandes > 0 ? Math.round((remplacementsTrouves / totalDemandes) * 100) : 0;
  const congesDuMois = mesConges.length;

  // Filtrer les demandes selon le filtre de statut
  const getFilteredDemandes = () => {
    let filtered = mesDemandes;
    
    if (filterStatut !== 'tous') {
      const statutMap = {
        'en_attente': 'en_cours',
        'accepte': 'approuve',
        'refuse': 'refuse'
      };
      filtered = filtered.filter(d => d.statut === statutMap[filterStatut]);
    }
    
    return filtered;
  };

  const filteredDemandes = getFilteredDemandes();

  return (
    <div className="remplacements-refonte">
      {/* Header Moderne */}
      <div className="module-header">
        <div>
          <h1 data-testid="replacements-title">🔄 Remplacements & Congés</h1>
          <p>Gestion des demandes de remplacement avec recherche automatique et suivi des congés</p>
        </div>
      </div>

      {/* KPIs - Visible uniquement pour admin/superviseur */}
      {isAdminOrSuperviseur && (
        <div className="kpi-grid" style={{marginBottom: '2rem'}}>
          <div className="kpi-card" style={{background: '#FCA5A5'}}>
            <h3>{totalDemandes}</h3>
            <p>Total Demandes</p>
          </div>
          <div className="kpi-card kpi-card-triple" style={{background: '#FEF3C7'}}>
            <div className="kpi-triple-container">
              <div className="kpi-triple-item">
                <h3>{enAttente}</h3>
                <p>En Attente</p>
              </div>
              <div className="kpi-triple-item">
                <h3>{acceptees}</h3>
                <p>Acceptées</p>
              </div>
              <div className="kpi-triple-item">
                <h3>{refusees}</h3>
                <p>Refusées</p>
              </div>
            </div>
          </div>
          <div className="kpi-card" style={{background: '#D1FAE5'}}>
            <h3>{remplacementsTrouves}</h3>
            <p>Remplacements Trouvés</p>
          </div>
          <div className="kpi-card" style={{background: '#DBEAFE'}}>
            <h3>{tauxSucces}%</h3>
            <p>Taux de Succès</p>
          </div>
          <div className="kpi-card" style={{background: '#E9D5FF'}}>
            <h3>{congesDuMois}</h3>
            <p>Congés du Mois</p>
          </div>
        </div>
      )}

      {/* Barre de Contrôles */}
      <div className="personnel-controls" style={{marginBottom: '2rem'}}>
        <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between'}}>
          {/* Boutons d'action - Mis en évidence */}
          <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', width: '100%'}}>
            <Button 
              onClick={() => setShowCreateRemplacementModal(true)}
              data-testid="create-replacement-btn"
              style={{
                background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                color: 'white',
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                fontWeight: '600',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
                border: 'none',
                transition: 'all 0.2s ease',
                flex: '1 1 auto',
                minWidth: '140px',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              🔄 Remplacement
            </Button>
            <Button 
              onClick={() => setShowCreateCongeModal(true)}
              data-testid="create-conge-btn"
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                color: 'white',
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                fontWeight: '600',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                border: 'none',
                transition: 'all 0.2s ease',
                flex: '1 1 auto',
                minWidth: '140px',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              🏖️ Congé
            </Button>
            
            {/* Filtre par statut */}
            <select 
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                cursor: 'pointer'
              }}
            >
              <option value="tous">📋 Tous les statuts</option>
              <option value="en_attente">⏳ En attente</option>
              <option value="accepte">✅ Acceptées</option>
              <option value="refuse">❌ Refusées</option>
            </select>

            {/* Toggle Vue Liste/Cartes */}
            <div className="view-toggle">
              <button 
                className={viewMode === 'liste' ? 'active' : ''}
                onClick={() => setViewMode('liste')}
                title="Vue Liste"
              >
                ☰
              </button>
              <button 
                className={viewMode === 'cartes' ? 'active' : ''}
                onClick={() => setViewMode('cartes')}
                title="Vue Cartes"
              >
                ⊞
              </button>
            </div>
          </div>

          {/* Exports */}
          <div style={{display: 'flex', gap: '1rem'}}>
            <Button variant="outline" onClick={() => { setExportType('pdf'); setShowExportModal(true); }}>
              📄 Export PDF
            </Button>
            <Button variant="outline" onClick={() => { setExportType('excel'); setShowExportModal(true); }}>
              📊 Export Excel
            </Button>
          </div>
        </div>
      </div>

      {/* Onglets Remplacements / Congés / Propositions - Style unifié */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {/* Onglet Propositions reçues - Affiché en premier pour attirer l'attention */}
        {propositionsRecues.length > 0 && (
          <button
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'propositions' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
            style={{ animation: 'pulse 2s infinite' }}
            onClick={() => setActiveTab('propositions')}
            data-testid="tab-propositions"
          >
            🚨 Propositions reçues ({propositionsRecues.length})
          </button>
        )}
        <button
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'remplacements' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('remplacements')}
          data-testid="tab-remplacements"
        >
          🔄 Remplacements ({demandes.length})
        </button>
        <button
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
            activeTab === 'conges' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => setActiveTab('conges')}
          data-testid="tab-conges"
        >
          🏖️ Congés ({mesConges.length})
        </button>
      </div>

      {/* Contenu des onglets */}
      <div className="tab-content">
        {/* Onglet Propositions reçues */}
        {activeTab === 'propositions' && (
          <div className="propositions-recues">
            <div style={{
              background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
              borderRadius: '12px',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ color: '#166534', margin: 0, marginBottom: '0.5rem' }}>
                🚨 Demandes de remplacement pour vous
              </h3>
              <p style={{ color: '#15803d', margin: 0, fontSize: '0.9rem' }}>
                Un collègue a besoin d'être remplacé et vous avez été identifié comme disponible. 
                Répondez ci-dessous pour accepter ou refuser.
              </p>
            </div>
            
            <div className="propositions-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {propositionsRecues.map(proposition => (
                <Card key={proposition.id} style={{ 
                  border: '2px solid #22c55e',
                  boxShadow: '0 4px 12px rgba(34, 197, 94, 0.2)'
                }}>
                  <CardContent style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <h4 style={{ margin: 0, marginBottom: '0.5rem', color: '#1e3a5f' }}>
                          {getTypeGardeName(proposition.type_garde_id)}
                        </h4>
                        <p style={{ margin: 0, marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: 'bold' }}>
                          📅 {parseDateLocal(proposition.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <p style={{ margin: 0, marginBottom: '0.5rem', color: '#666' }}>
                          👤 Demandeur : <strong>{getUserName(proposition.demandeur_id)}</strong>
                        </p>
                        {proposition.raison && (
                          <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                            💬 Raison : {proposition.raison}
                          </p>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: '200px' }}>
                        <Button 
                          style={{ 
                            backgroundColor: '#22c55e', 
                            color: 'white',
                            padding: '1rem 2rem',
                            fontSize: '1rem'
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRepondreProposition(proposition.id, 'accepter');
                          }}
                        >
                          ✅ J'accepte ce remplacement
                        </Button>
                        <Button 
                          variant="outline"
                          style={{ 
                            borderColor: '#ef4444', 
                            color: '#ef4444',
                            padding: '0.75rem 2rem'
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRepondreProposition(proposition.id, 'refuser');
                          }}
                        >
                          ❌ Je refuse
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'remplacements' && (
          <div className="remplacements-content">
              <div style={{ 
                background: '#dbeafe', 
                border: '1px solid #93c5fd', 
                borderRadius: '8px', 
                padding: '0.75rem', 
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'start',
                gap: '0.5rem',
                overflow: 'hidden'
              }}>
                <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>💡</span>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <strong style={{ color: '#1e40af', display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>
                    Actions manuelles disponibles
                  </strong>
                  <p style={{ fontSize: '0.8rem', color: '#1e40af', margin: 0, lineHeight: '1.4' }}>
                    Les demandes sont traitées automatiquement. Utilisez les boutons pour intervenir :
                  </p>
                  <ul style={{ fontSize: '0.8rem', color: '#1e40af', margin: '0.25rem 0 0 1rem', lineHeight: '1.5', paddingLeft: '0.5rem' }}>
                    <li>🔍 Relancer la recherche auto</li>
                    <li>✅ Approuver manuellement</li>
                    <li>❌ Rejeter/Annuler</li>
                  </ul>
                </div>
              </div>

            {/* Liste des demandes de remplacement */}
            <div className="demandes-list">
              {demandes.length > 0 ? (
                demandes.map(demande => (
                  <div key={demande.id} className="demande-card" data-testid={`replacement-${demande.id}`}>
                    <div className="demande-header">
                      <div className="demande-info">
                        <h3>{getTypeGardeName(demande.type_garde_id)}</h3>
                        <span className="demande-date">{parseDateLocal(demande.date).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <div className="demande-status" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* Badge de priorité */}
                        <span 
                          className="priorite-badge" 
                          style={{ 
                            backgroundColor: getPrioriteColor(demande.priorite || 'normal'),
                            color: 'white',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          {demande.priorite === 'urgent' ? '🚨 Urgent' : '📋 Normal'}
                        </span>
                        {/* Badge de statut */}
                        <span 
                          className="status-badge" 
                          style={{ backgroundColor: getStatutColor(demande.statut) }}
                        >
                          {getStatutLabel(demande.statut)}
                        </span>
                      </div>
                    </div>
                    <div className="demande-details">
                      <p className="demande-raison">{demande.raison}</p>
                      <div className="demande-meta">
                        <span>Demandé par: {getUserName(demande.demandeur_id)} </span>
                        <span>Le: {new Date(demande.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                    {!['employe', 'pompier'].includes(user.role) && (demande.statut === 'en_cours' || demande.statut === 'en_attente') && (
                      <div className="demande-actions">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          data-testid={`search-replacement-${demande.id}`}
                          title="Relancer une recherche automatique de remplaçant si l'automatisation a échoué ou pour forcer une nouvelle recherche"
                          style={{ position: 'relative' }}
                        >
                          🔍 Recherche auto
                          <span style={{ 
                            position: 'absolute', 
                            top: '-8px', 
                            right: '-8px', 
                            background: '#3b82f6', 
                            color: 'white', 
                            borderRadius: '50%', 
                            width: '18px', 
                            height: '18px', 
                            fontSize: '12px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            cursor: 'help'
                          }} title="Relancer une recherche automatique">?</span>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          data-testid={`approve-replacement-${demande.id}`}
                          title="Approuver manuellement cette demande (si remplaçant trouvé hors système ou validation manuelle requise)"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprouverRemplacement(demande.id, 'approuver');
                          }}
                        >
                          ✅
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="danger" 
                          data-testid={`reject-replacement-${demande.id}`}
                          title="Rejeter/Annuler cette demande (si plus nécessaire ou aucun remplaçant disponible)"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprouverRemplacement(demande.id, 'rejeter');
                          }}
                        >
                          ❌
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <h3>Aucune demande de remplacement</h3>
                  <p>Les demandes apparaîtront ici.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'conges' && (
          <div className="conges-content">
            {/* En-tête de gestion toujours visible pour admin/superviseur */}
            {!['employe', 'pompier'].includes(user.role) && (
              <div className="management-header">
                <div className="management-info">
                  <h3>👑 Gestion des demandes de congé</h3>
                  <p>
                    {user.role === 'admin' ? 
                      'Vous pouvez approuver toutes les demandes de congé (employés et superviseurs)' : 
                      'Vous pouvez approuver les demandes des employés uniquement'}
                  </p>
                </div>
                <div className="pending-indicator">
                  <span className="pending-count">{mesConges.filter(d => d.statut === 'en_attente').length}</span>
                  <span className="pending-label">en attente d'approbation</span>
                </div>
              </div>
            )}

            {/* Boutons d'actions rapides pour admin/superviseur */}
            {isAdminOrSuperviseur && (
              <div className="management-actions">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleFilterUrgentConges}
                  data-testid="filter-urgent-conges"
                >
                  🚨 Congés urgents
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportConges}
                  data-testid="export-conges"
                >
                  📊 Exporter congés
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePlanningImpact}
                  data-testid="planning-impact"
                >
                  📅 Impact planning
                </Button>
              </div>
            )}

            {/* Statistics Cards pour congés - Affiche MES stats pour employés, TOUTES pour admins */}
            <div className="conge-stats">
              <div className="stat-card-conge pending">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <h3>En attente</h3>
                  <p className="stat-number">{mesConges.filter(d => d.statut === 'en_attente').length}</p>
                  <p className="stat-label">À approuver</p>
                </div>
              </div>

              <div className="stat-card-conge approved">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <h3>Approuvés</h3>
                  <p className="stat-number">{mesConges.filter(d => d.statut === 'approuve').length}</p>
                  <p className="stat-label">Ce mois</p>
                </div>
              </div>

              <div className="stat-card-conge total">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>Total jours</h3>
                  <p className="stat-number">{mesConges.reduce((total, d) => total + (d.nombre_jours || 0), 0)}</p>
                  <p className="stat-label">Jours de congé</p>
                </div>
              </div>
            </div>

            {/* Liste des demandes de congé */}
            <div className="conges-list">
              {mesConges.length > 0 ? (
                mesConges.map(conge => (
                  <div key={conge.id} className="conge-card" data-testid={`conge-${conge.id}`}>
                    <div className="conge-header">
                      <div className="conge-type">
                        <span className="type-badge">
                          {typesConge.find(t => t.value === conge.type_conge)?.label || conge.type_conge}
                        </span>
                        <span 
                          className="priorite-badge" 
                          style={{ backgroundColor: getPrioriteColor(conge.priorite) }}
                        >
                          {niveauxPriorite.find(p => p.value === conge.priorite)?.label || conge.priorite}
                        </span>
                      </div>
                      <div className="conge-status">
                        <span 
                          className="status-badge" 
                          style={{ backgroundColor: getStatutColor(conge.statut) }}
                        >
                          {getStatutLabel(conge.statut)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="conge-details">
                      <div className="conge-dates">
                        <span className="date-range">
                          {parseDateLocal(conge.date_debut).toLocaleDateString('fr-FR')} - {parseDateLocal(conge.date_fin).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="jours-count">({conge.nombre_jours} jour{conge.nombre_jours > 1 ? 's' : ''})</span>
                      </div>
                      <p className="conge-raison">{conge.raison}</p>
                      <div className="conge-meta">
                        <span>Demandé par: {getUserName(conge.demandeur_id)} </span>
                        <span>Le: {new Date(conge.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>

                    {!['employe', 'pompier'].includes(user.role) && conge.statut === 'en_attente' && (
                      <div className="conge-actions">
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprouverConge(conge.id, 'approuver');
                          }}
                          data-testid={`approve-conge-${conge.id}`}
                        >
                          ✅ Approuver
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleApprouverConge(conge.id, 'refuser');
                          }}
                          data-testid={`reject-conge-${conge.id}`}
                        >
                          ❌ Refuser
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          data-testid={`comment-conge-${conge.id}`}
                        >
                          💬 Commenter
                        </Button>
                      </div>
                    )}

                    {/* Affichage des infos d'approbation si déjà traitée */}
                    {conge.statut !== 'en_attente' && conge.approuve_par && (
                      <div className="approval-info">
                        <div className="approval-details">
                          <span className="approval-by">
                            {conge.statut === 'approuve' ? '✅' : '❌'} 
                            {conge.statut === 'approuve' ? 'Approuvé' : 'Refusé'} par {getUserName(conge.approuve_par)}
                          </span>
                          <span className="approval-date">le {conge.date_approbation}</span>
                        </div>
                        {conge.commentaire_approbation && (
                          <div className="approval-comment">
                            <strong>Commentaire :</strong> {conge.commentaire_approbation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <h3>Aucune demande de congé</h3>
                  <p>
                    {!['employe', 'pompier'].includes(user.role) 
                      ? 'Les demandes de congé des employés apparaîtront ici pour approbation.' 
                      : 'Vos demandes de congé apparaîtront ici.'}
                  </p>
                  {!['employe', 'pompier'].includes(user.role) && (
                    <div className="management-tips">
                      <h4>💡 Conseils de gestion :</h4>
                      <ul>
                        <li>Les demandes urgentes nécessitent un traitement immédiat</li>
                        <li>Vérifiez l'impact sur le planning avant d'approuver</li>
                        <li>Ajoutez des commentaires pour justifier vos décisions</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Replacement Modal */}
      {showCreateRemplacementModal && (
        <div className="modal-overlay" onClick={() => setShowCreateRemplacementModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="create-replacement-modal">
            <div className="modal-header">
              <h3>Nouvelle demande de remplacement</h3>
              <Button variant="ghost" onClick={() => setShowCreateRemplacementModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <Label htmlFor="type-garde">Type de garde *</Label>
                <select
                  id="type-garde"
                  value={newDemande.type_garde_id}
                  onChange={(e) => setNewDemande({...newDemande, type_garde_id: e.target.value})}
                  className="form-select"
                  data-testid="select-garde-type"
                >
                  <option value="">Sélectionner un type de garde</option>
                  {typesGarde.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.nom} ({type.heure_debut} - {type.heure_fin})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <Label htmlFor="date">Date de la garde *</Label>
                <Input
                  id="date"
                  type="date"
                  value={newDemande.date}
                  onChange={(e) => setNewDemande({...newDemande, date: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="select-date"
                />
              </div>

              <div className="form-field">
                <Label htmlFor="priorite">Priorité</Label>
                <select
                  id="priorite"
                  value={newDemande.priorite}
                  onChange={(e) => setNewDemande({...newDemande, priorite: e.target.value})}
                  className="form-select"
                  data-testid="select-priority"
                >
                  {niveauxPriorite.map(niveau => (
                    <option key={niveau.value} value={niveau.value}>
                      {niveau.label} - {niveau.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <Label htmlFor="raison">Raison du remplacement *</Label>
                <textarea
                  id="raison"
                  value={newDemande.raison}
                  onChange={(e) => setNewDemande({...newDemande, raison: e.target.value})}
                  placeholder="Expliquez la raison de votre demande de remplacement (ex: maladie, congé personnel, urgence familiale...)"
                  rows="4"
                  className="form-textarea"
                  data-testid="replacement-reason"
                />
              </div>

              <div className="modal-actions">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateRemplacementModal(false)}
                >
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleCreateRemplacement}
                  data-testid="submit-replacement-btn"
                >
                  Créer la demande
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Conge Modal */}
      {showCreateCongeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCongeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="create-conge-modal">
            <div className="modal-header">
              <h3>Nouvelle demande de congé</h3>
              <Button variant="ghost" onClick={() => setShowCreateCongeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <Label htmlFor="type-conge">Type de congé *</Label>
                <select
                  id="type-conge"
                  value={newConge.type_conge}
                  onChange={(e) => setNewConge({...newConge, type_conge: e.target.value})}
                  className="form-select"
                  data-testid="select-conge-type"
                >
                  <option value="">Sélectionner un type de congé</option>
                  {typesConge.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <Label htmlFor="date-debut">Date de début *</Label>
                  <Input
                    id="date-debut"
                    type="date"
                    value={newConge.date_debut}
                    onChange={(e) => setNewConge({...newConge, date_debut: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    data-testid="select-date-debut"
                  />
                </div>
                <div className="form-field">
                  <Label htmlFor="date-fin">Date de fin *</Label>
                  <Input
                    id="date-fin"
                    type="date"
                    value={newConge.date_fin}
                    onChange={(e) => setNewConge({...newConge, date_fin: e.target.value})}
                    min={newConge.date_debut || new Date().toISOString().split('T')[0]}
                    data-testid="select-date-fin"
                  />
                </div>
              </div>

              <div className="form-field">
                <Label htmlFor="priorite-conge">Priorité</Label>
                <select
                  id="priorite-conge"
                  value={newConge.priorite}
                  onChange={(e) => setNewConge({...newConge, priorite: e.target.value})}
                  className="form-select"
                  data-testid="select-conge-priority"
                >
                  {niveauxPriorite.map(niveau => (
                    <option key={niveau.value} value={niveau.value}>
                      {niveau.label} - {niveau.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <Label htmlFor="raison-conge">Raison du congé *</Label>
                <textarea
                  id="raison-conge"
                  value={newConge.raison}
                  onChange={(e) => setNewConge({...newConge, raison: e.target.value})}
                  placeholder="Expliquez la raison de votre demande de congé..."
                  rows="4"
                  className="form-textarea"
                  data-testid="conge-reason"
                />
              </div>

              <div className="modal-actions">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateCongeModal(false)}
                >
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleCreateConge}
                  data-testid="submit-conge-btn"
                >
                  Créer la demande
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de demande de remplacement avec priorité */}
      {showCreateRemplacementModal && (
        <div className="modal-overlay" onClick={() => setShowCreateRemplacementModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-replacement-modal">
            <div className="modal-header">
              <h3>🔄 Nouvelle demande de remplacement</h3>
              <Button variant="ghost" onClick={() => setShowCreateRemplacementModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="priority-section">
                <h4>🎯 Niveau de priorité</h4>
                <div className="priority-options">
                  {niveauxPriorite.map(priorite => (
                    <label key={priorite.value} className="priority-option">
                      <input
                        type="radio"
                        name="priorite"
                        value={priorite.value}
                        checked={newDemande.priorite === priorite.value}
                        onChange={(e) => setNewDemande({...newDemande, priorite: e.target.value})}
                      />
                      <div className="priority-content" style={{ borderColor: priorite.color }}>
                        <span className="priority-label" style={{ color: priorite.color }}>{priorite.label}</span>
                        <span className="priority-description">{priorite.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <Label>Type de garde *</Label>
                <select
                  value={newDemande.type_garde_id}
                  onChange={(e) => setNewDemande({...newDemande, type_garde_id: e.target.value})}
                  className="form-select"
                  data-testid="replacement-type-garde-select"
                >
                  <option value="">Sélectionner un type de garde</option>
                  {typesGarde.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.nom} ({type.heure_debut} - {type.heure_fin})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <Label>Date de la garde *</Label>
                <Input
                  type="date"
                  value={newDemande.date}
                  onChange={(e) => setNewDemande({...newDemande, date: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="replacement-date-input"
                />
              </div>

              <div className="form-field">
                <Label>Raison du remplacement *</Label>
                <textarea
                  value={newDemande.raison}
                  onChange={(e) => setNewDemande({...newDemande, raison: e.target.value})}
                  placeholder="Expliquez la raison (maladie, urgence familiale, conflit horaire...)"
                  rows="3"
                  className="form-textarea"
                  data-testid="replacement-reason-input"
                />
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateRemplacementModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateRemplacement} data-testid="submit-replacement-btn">
                  Créer la demande
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de demande de congé avec priorité */}
      {showCreateCongeModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCongeModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-conge-modal">
            <div className="modal-header">
              <h3>🏖️ Nouvelle demande de congé</h3>
              <Button variant="ghost" onClick={() => setShowCreateCongeModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="priority-section">
                <h4>🎯 Niveau de priorité</h4>
                <div className="priority-options">
                  {niveauxPriorite.map(priorite => (
                    <label key={priorite.value} className="priority-option">
                      <input
                        type="radio"
                        name="priorite-conge"
                        value={priorite.value}
                        checked={newConge.priorite === priorite.value}
                        onChange={(e) => setNewConge({...newConge, priorite: e.target.value})}
                      />
                      <div className="priority-content" style={{ borderColor: priorite.color }}>
                        <span className="priority-label" style={{ color: priorite.color }}>{priorite.label}</span>
                        <span className="priority-description">{priorite.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-field">
                <Label>Type de congé *</Label>
                <div className="conge-type-options">
                  {typesConge.map(type => (
                    <label key={type.value} className="conge-type-option">
                      <input
                        type="radio"
                        name="type-conge"
                        value={type.value}
                        checked={newConge.type_conge === type.value}
                        onChange={(e) => setNewConge({...newConge, type_conge: e.target.value})}
                      />
                      <div className="conge-type-content">
                        <span className="conge-type-label">{type.label}</span>
                        <span className="conge-type-description">{type.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <Label>Date de début *</Label>
                  <Input
                    type="date"
                    value={newConge.date_debut}
                    onChange={(e) => setNewConge({...newConge, date_debut: e.target.value})}
                    min={new Date().toISOString().split('T')[0]}
                    data-testid="conge-date-debut-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Date de fin *</Label>
                  <Input
                    type="date"
                    value={newConge.date_fin}
                    onChange={(e) => setNewConge({...newConge, date_fin: e.target.value})}
                    min={newConge.date_debut || new Date().toISOString().split('T')[0]}
                    data-testid="conge-date-fin-input"
                  />
                </div>
              </div>

              <div className="form-field">
                <Label>Raison du congé *</Label>
                <textarea
                  value={newConge.raison}
                  onChange={(e) => setNewConge({...newConge, raison: e.target.value})}
                  placeholder="Décrivez la raison de votre demande de congé..."
                  rows="3"
                  className="form-textarea"
                  data-testid="conge-reason-input"
                />
              </div>

              <div className="workflow-info">
                <h4>📋 Processus d'approbation</h4>
                <div className="workflow-steps">
                  <div className="workflow-step">
                    <span className="step-number">1</span>
                    <span>Soumission de la demande</span>
                  </div>
                  <div className="workflow-step">
                    <span className="step-number">2</span>
                    <span>
                      {['employe', 'pompier'].includes(user.role) ? 'Approbation superviseur' : 'Approbation administrateur'}
                    </span>
                  </div>
                  <div className="workflow-step">
                    <span className="step-number">3</span>
                    <span>Notification et mise à jour planning</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateCongeModal(false)}>Annuler</Button>
                <Button variant="default" onClick={handleCreateConge} data-testid="submit-conge-btn">
                  Soumettre la demande
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Export - Remplacements */}
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
                  onClick={async () => {
                    try {
                      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
                      const token = localStorage.getItem(`${tenantSlug}_token`);
                      
                      const endpoint = exportType === 'pdf' ? 'export-pdf' : 'export-excel';
                      const url = `${backendUrl}/api/${tenantSlug}/remplacements/${endpoint}`;
                      
                      const response = await fetch(url, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}` }
                      });
                      
                      if (!response.ok) throw new Error('Erreur export');
                      
                      const blob = await response.blob();
                      
                      if (exportType === 'pdf') {
                        // Pour les PDF, ouvrir directement le dialogue d'impression
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
                        // Pour les Excel, télécharger directement
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = downloadUrl;
                        link.download = `remplacements_tous.xlsx`;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(downloadUrl);
                      }
                      
                      toast({ title: "Succès", description: `Export ${exportType.toUpperCase()} téléchargé` });
                      setShowExportModal(false);
                    } catch (error) {
                      toast({ title: "Erreur", description: "Impossible d'exporter", variant: "destructive" });
                    }
                  }}
                  style={{
                    padding: '1.5rem',
                    justifyContent: 'flex-start',
                    gap: '1rem',
                    fontSize: '1rem'
                  }}
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
                  onClick={() => {
                    toast({ title: "Info", description: "Sélectionnez un pompier depuis le module Personnel pour exporter ses demandes" });
                  }}
                  style={{
                    padding: '1.5rem',
                    justifyContent: 'flex-start',
                    gap: '1rem',
                    fontSize: '1rem'
                  }}
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
    </div>
  );
};

// Formations Component complet - Planning de formations



export default Remplacements;
