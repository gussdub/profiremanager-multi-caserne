import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Calendar } from "./ui/calendar";
import { useToast } from "../hooks/use-toast";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet, apiPost, apiPut, apiDelete, downloadFile } from '../utils/api';
import { fr } from "date-fns/locale";
import { AlertTriangle, FileSpreadsheet, CalendarDays, Clock, CheckCircle, BarChart3, ClipboardList } from 'lucide-react';
import { useWebSocketUpdate } from '../hooks/useWebSocketUpdate';
import SuiviRemplacementModal from './SuiviRemplacementModal';
import usePermissions from '../hooks/usePermissions';

// Import des sous-composants refactorisés
import KPICards from './remplacements/KPICards';
import TabsBar from './remplacements/TabsBar';
import PropositionsRecues from './remplacements/PropositionsRecues';
import RemplacementsList from './remplacements/RemplacementsList';
import CongesList from './remplacements/CongesList';
import CreateRemplacementModal from './remplacements/CreateRemplacementModal';
import CreateCongeModal from './remplacements/CreateCongeModal';
import ExportModal from './remplacements/ExportModal';
import ImpactPlanningModal from './remplacements/ImpactPlanningModal';

// Fonction pour parser une date en évitant les problèmes de timezone
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const Remplacements = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  
  // Hook RBAC pour les permissions
  const { hasModuleAccess, hasModuleAction } = usePermissions(tenantSlug, user);
  const canCreateRemplacement = hasModuleAction('remplacements', 'creer');
  const canEditRemplacement = hasModuleAction('remplacements', 'modifier');
  const canDeleteRemplacement = hasModuleAction('remplacements', 'supprimer');
  const canApproveRemplacement = hasModuleAction('remplacements', 'approuver');
  
  const [demandes, setDemandes] = useState([]);
  const [demandesConge, setDemandesConge] = useState([]);
  const [users, setUsers] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('remplacements');
  const [filterStatut, setFilterStatut] = useState('non_traitees'); // 'non_traitees', 'acceptees', 'refusees', 'toutes'
  const [filterPeriode, setFilterPeriode] = useState('toutes'); // 'ce_mois', 'mois_precedent', '3_mois', 'cette_annee', 'personnalise', 'toutes'
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [showCreateRemplacementModal, setShowCreateRemplacementModal] = useState(false);
  const [showCreateCongeModal, setShowCreateCongeModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSuiviModal, setShowSuiviModal] = useState(false);
  const [selectedDemandeForSuivi, setSelectedDemandeForSuivi] = useState(null);
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
  const [showImpactModal, setShowImpactModal] = useState(false);
  const [impactData, setImpactData] = useState(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
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

  const fetchData = useCallback(async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const promises = [
        apiGet(tenantSlug, '/remplacements'),
        apiGet(tenantSlug, '/demandes-conge'),
        apiGet(tenantSlug, '/types-garde'),
        apiGet(tenantSlug, '/remplacements/propositions').catch(() => []) // Propositions reçues par l'utilisateur
      ];
      
      if (!['employe', 'pompier'].includes(user?.role)) {
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
  }, [tenantSlug, user?.role, toast]);

  // Écouter les mises à jour WebSocket pour synchronisation temps réel
  useWebSocketUpdate(['remplacement_update', 'conge_update'], (data) => {
    console.log('[Remplacements] Mise à jour WebSocket:', data);
    fetchData();
    
    // Notifications toast selon l'action
    if (data.type === 'remplacement_update') {
      const toastMessages = {
        'accepte': { title: "✅ Remplacement accepté", desc: `${data.data?.remplacant_nom || 'Un remplaçant'} a accepté une demande` },
        'nouvelle_demande': { title: "📋 Nouvelle demande", desc: `${data.data?.demandeur_nom || 'Quelqu\'un'} cherche un remplaçant` },
        'approuve_manuellement': { title: "✅ Demande approuvée", desc: `Approuvée par ${data.data?.approuve_par_nom || 'un superviseur'}` },
        'annulee': { title: "❌ Demande annulée", desc: `Annulée par ${data.data?.annule_par_nom || 'un superviseur'}` },
        'relancee': { title: "🔄 Demande relancée", desc: `Relancée par ${data.data?.relance_par_nom || 'un utilisateur'}` },
        'supprimee': { title: "🗑️ Demande supprimée", desc: "Une demande a été supprimée" },
        'expiree': { title: "⏱️ Demande expirée", desc: "Aucun remplaçant trouvé" },
        'arrete': { title: "🛑 Processus arrêté", desc: `Arrêté par ${data.data?.arrete_par_nom || 'un superviseur'}` }
      };
      
      const msg = toastMessages[data.action];
      if (msg) {
        toast({
          title: msg.title,
          description: msg.desc,
          duration: 5000
        });
      }
    }
  }, [fetchData, toast]);

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
    if (!canApproveRemplacement) return;

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

  // Handler pour arrêter le processus (via permission RBAC)
  const handleArreterProcessus = async (demandeId) => {
    if (!canEditRemplacement) return;

    if (!window.confirm("Voulez-vous vraiment arrêter ce processus de remplacement? Cette action est irréversible.")) {
      return;
    }

    try {
      await apiPut(tenantSlug, `/remplacements/${demandeId}/arreter`, {});
      toast({
        title: "🛑 Processus arrêté",
        description: "Le processus de remplacement a été arrêté",
        variant: "default"
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible d'arrêter le processus",
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

  // Handler pour relancer une demande expirée/annulée
  const handleRelancerDemande = async (demandeId) => {
    if (window.confirm("Voulez-vous relancer cette demande? La recherche de remplaçant repartira de zéro.")) {
      try {
        await apiPut(tenantSlug, `/remplacements/${demandeId}/relancer`, {});
        toast({
          title: "🔄 Demande relancée",
          description: "La recherche de remplaçant a redémarré.",
          variant: "success"
        });
        fetchData();
      } catch (error) {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de relancer la demande",
          variant: "destructive"
        });
      }
    }
  };

  // Handler pour supprimer une demande (avec permission RBAC)
  const handleSupprimerDemande = async (demandeId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette demande? Cette action est irréversible.")) {
      try {
        await apiDelete(tenantSlug, `/remplacements/${demandeId}`);
        toast({
          title: "🗑️ Demande supprimée",
          description: "La demande a été supprimée.",
          variant: "success"
        });
        fetchData();
      } catch (error) {
        toast({
          title: "Erreur",
          description: error.message || "Impossible de supprimer la demande",
          variant: "destructive"
        });
      }
    }
  };

  // Handler pour annuler sa propre demande (par le demandeur)
  const handleAnnulerDemande = async (demandeId) => {
    if (window.confirm("Voulez-vous vraiment annuler votre demande de remplacement?")) {
      try {
        await apiDelete(tenantSlug, `/remplacements/${demandeId}/annuler`);
        toast({
          title: "❌ Demande annulée",
          description: "Votre demande de remplacement a été annulée.",
          variant: "default"
        });
        fetchData();
      } catch (error) {
        toast({
          title: "Erreur",
          description: error.response?.data?.detail || error.message || "Impossible d'annuler la demande",
          variant: "destructive"
        });
      }
    }
  };

  const getStatutColor = (statut) => {
    switch (statut) {
      case 'en_cours': case 'en_attente': return '#F59E0B';
      case 'approuve': case 'accepte': case 'approuve_manuellement': return '#10B981';
      case 'refuse': case 'refusee': case 'annulee': return '#EF4444';
      case 'expiree': return '#9CA3AF';
      default: return '#6B7280';
    }
  };

  const getStatutLabel = (statut) => {
    switch (statut) {
      case 'en_cours': return 'En cours';
      case 'en_attente': return 'En attente';
      case 'approuve': case 'accepte': return 'Acceptée';
      case 'approuve_manuellement': return 'Approuvée manuellement';
      case 'refuse': case 'refusee': return 'Refusée';
      case 'annulee': return 'Annulée';
      case 'expiree': return 'Expirée';
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

  // Charger l'impact planning pour un congé spécifique
  const handleShowImpact = async (congeId) => {
    setLoadingImpact(true);
    try {
      const data = await apiGet(tenantSlug, `/demandes-conge/${congeId}/impact-planning`);
      setImpactData(data);
      setShowImpactModal(true);
    } catch (error) {
      console.error('Erreur chargement impact:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger l'impact sur le planning",
        variant: "destructive"
      });
    } finally {
      setLoadingImpact(false);
    }
  };

  const getUserName = (userId, demandeurNom = null) => {
    // Si on a déjà le nom du demandeur, l'utiliser directement
    if (demandeurNom) return demandeurNom;
    
    const foundUser = users.find(u => u.id === userId);
    return foundUser ? `${foundUser.prenom} ${foundUser.nom}` : `Employé #${userId?.slice(-4) || '?'}`;
  };

  const getPrioriteColor = (priorite) => {
    const prioriteObj = niveauxPriorite.find(p => p.value === priorite);
    return prioriteObj ? prioriteObj.color : '#6B7280';
  };

  if (loading) return <div className="loading" data-testid="replacements-loading">Chargement...</div>;

  // Déterminer si l'utilisateur peut voir toutes les demandes (via RBAC)
  const canViewAllDemandes = hasModuleAction('remplacements', 'voir_tous') || user?.role === 'admin';
  const isAdminOrSuperviseur = !['employe', 'pompier'].includes(user?.role);

  // Filtrer les demandes selon les permissions pour les KPIs ET l'affichage
  const mesDemandes = canViewAllDemandes 
    ? demandes 
    : demandes.filter(d => d.demandeur_id === user.id);
  
  const mesConges = canViewAllDemandes
    ? demandesConge
    : demandesConge.filter(c => c.demandeur_id === user.id);

  // Calculer les KPIs sur MES demandes (pour pompiers) ou TOUTES (pour admins)
  const totalDemandes = mesDemandes.length;
  const enAttente = mesDemandes.filter(d => ['en_cours', 'en_attente'].includes(d.statut)).length;
  const acceptees = mesDemandes.filter(d => ['approuve', 'accepte', 'approuve_manuellement'].includes(d.statut)).length;
  const refusees = mesDemandes.filter(d => ['refuse', 'refusee', 'annulee', 'expiree'].includes(d.statut)).length;
  const remplacementsTrouves = mesDemandes.filter(d => ['approuve', 'accepte', 'approuve_manuellement'].includes(d.statut) && d.remplacant_id).length;
  const tauxSucces = totalDemandes > 0 ? Math.round((remplacementsTrouves / totalDemandes) * 100) : 0;
  const congesDuMois = mesConges.length;

  // Fonction pour obtenir les dates de la période sélectionnée
  const getPeriodeDates = () => {
    const now = new Date();
    let dateDebut = null;
    let dateFin = null;

    switch (filterPeriode) {
      case 'ce_mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'mois_precedent':
        dateDebut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        dateFin = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case '3_mois':
        dateDebut = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        dateFin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'cette_annee':
        dateDebut = new Date(now.getFullYear(), 0, 1);
        dateFin = new Date(now.getFullYear(), 11, 31);
        break;
      case 'personnalise':
        if (filterDateDebut) dateDebut = new Date(filterDateDebut);
        if (filterDateFin) dateFin = new Date(filterDateFin);
        break;
      default: // 'toutes'
        return { dateDebut: null, dateFin: null };
    }
    return { dateDebut, dateFin };
  };

  // Fonction de filtrage générique (pour remplacements et congés)
  const filterByStatutAndPeriode = (items, dateField = 'date') => {
    let filtered = [...items];
    
    // Filtre par statut
    if (filterStatut !== 'toutes') {
      if (filterStatut === 'non_traitees') {
        filtered = filtered.filter(d => ['en_attente', 'en_cours'].includes(d.statut));
      } else if (filterStatut === 'acceptees') {
        filtered = filtered.filter(d => ['accepte', 'approuve', 'approuve_manuellement'].includes(d.statut));
      } else if (filterStatut === 'refusees') {
        filtered = filtered.filter(d => ['refuse', 'refusee', 'annulee', 'expiree'].includes(d.statut));
      }
    }
    
    // Filtre par période
    const { dateDebut, dateFin } = getPeriodeDates();
    if (dateDebut || dateFin) {
      filtered = filtered.filter(d => {
        const itemDate = new Date(d[dateField] || d.created_at);
        if (dateDebut && itemDate < dateDebut) return false;
        if (dateFin && itemDate > dateFin) return false;
        return true;
      });
    }
    
    return filtered;
  };

  // Filtrer les demandes de remplacement
  const getFilteredDemandes = () => {
    return filterByStatutAndPeriode(mesDemandes, 'date');
  };

  // Filtrer les demandes de congés
  const getFilteredConges = () => {
    return filterByStatutAndPeriode(mesConges, 'date_debut');
  };

  // Réinitialiser les filtres
  const resetFilters = () => {
    setFilterStatut('non_traitees');
    setFilterPeriode('toutes');
    setFilterDateDebut('');
    setFilterDateFin('');
  };

  const filteredDemandes = getFilteredDemandes();
  const filteredConges = getFilteredConges();

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
          </div>

          {/* Barre de filtres compacte */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            padding: '1rem',
            backgroundColor: '#F9FAFB',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            marginTop: '1rem'
          }}>
            <span style={{ fontWeight: '600', color: '#374151', fontSize: '0.9rem' }}>🔍 Filtres:</span>
            
            {/* Filtre par statut */}
            <select 
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                cursor: 'pointer',
                backgroundColor: 'white',
                fontSize: '0.9rem'
              }}
            >
              <option value="non_traitees">⏳ Non traitées</option>
              <option value="acceptees">✅ Acceptées</option>
              <option value="refusees">❌ Refusées/Annulées</option>
              <option value="toutes">📋 Toutes</option>
            </select>

            {/* Filtre par période */}
            <select 
              value={filterPeriode}
              onChange={(e) => setFilterPeriode(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                cursor: 'pointer',
                backgroundColor: 'white',
                fontSize: '0.9rem'
              }}
            >
              <option value="toutes">📅 Toutes périodes</option>
              <option value="ce_mois">📅 Ce mois-ci</option>
              <option value="mois_precedent">📅 Mois précédent</option>
              <option value="3_mois">📅 3 derniers mois</option>
              <option value="cette_annee">📅 Cette année</option>
              <option value="personnalise">🔧 Période personnalisée</option>
            </select>

            {/* Dates personnalisées */}
            {filterPeriode === 'personnalise' && (
              <>
                <input
                  type="date"
                  value={filterDateDebut}
                  onChange={(e) => setFilterDateDebut(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid #D1D5DB',
                    fontSize: '0.9rem'
                  }}
                  placeholder="Date début"
                />
                <span style={{ color: '#6B7280' }}>→</span>
                <input
                  type="date"
                  value={filterDateFin}
                  onChange={(e) => setFilterDateFin(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '8px',
                    border: '1px solid #D1D5DB',
                    fontSize: '0.9rem'
                  }}
                  placeholder="Date fin"
                />
              </>
            )}

            {/* Bouton réinitialiser */}
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                borderRadius: '8px'
              }}
            >
              🔄 Réinitialiser
            </Button>

            {/* Compteur de résultats */}
            <span style={{ 
              marginLeft: 'auto', 
              fontSize: '0.85rem', 
              color: '#6B7280',
              backgroundColor: '#E5E7EB',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px'
            }}>
              {activeTab === 'remplacements' ? filteredDemandes.length : filteredConges.length} résultat(s)
            </span>
          </div>

          {/* Exports */}
          <div style={{display: 'flex', gap: '1rem', marginTop: '1rem'}}>
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
      <TabsBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        propositionsCount={propositionsRecues.length}
        remplacementsCount={filteredDemandes.length}
        congesCount={filteredConges.length}
      />

      {/* Contenu des onglets */}
      <div className="tab-content">
        {/* Onglet Propositions reçues */}
        {activeTab === 'propositions' && (
          <PropositionsRecues
            propositions={propositionsRecues}
            getTypeGardeName={getTypeGardeName}
            getUserName={getUserName}
            parseDateLocal={parseDateLocal}
            onAccept={(id) => handleRepondreProposition(id, 'accepter')}
            onRefuse={(id) => handleRepondreProposition(id, 'refuser')}
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
            onArreterProcessus={handleArreterProcessus}
            onRelancerDemande={handleRelancerDemande}
            onSupprimerDemande={handleSupprimerDemande}
            onAnnulerDemande={handleAnnulerDemande}
            canDeleteRemplacement={canDeleteRemplacement}
            canEditRemplacement={canEditRemplacement}
            onShowSuivi={(demande) => {
              setSelectedDemandeForSuivi(demande);
              setShowSuiviModal(true);
            }}
            filterStatut={filterStatut}
            filterPeriode={filterPeriode}
          />
        )}

        {activeTab === 'conges' && (
          <CongesList
            conges={mesConges}
            filteredConges={filteredConges}
            user={user}
            isAdminOrSuperviseur={isAdminOrSuperviseur}
            loadingImpact={loadingImpact}
            filterStatut={filterStatut}
            filterPeriode={filterPeriode}
            getUserName={getUserName}
            getStatutColor={getStatutColor}
            getStatutLabel={getStatutLabel}
            getPrioriteColor={getPrioriteColor}
            parseDateLocal={parseDateLocal}
            onFilterUrgent={handleFilterUrgentConges}
            onExportConges={handleExportConges}
            onShowImpact={handleShowImpact}
            onApprouverConge={handleApprouverConge}
          />
        )}
      </div>

      {/* Create Replacement Modal */}

      {/* Modals de création utilisant les composants extraits */}
      <CreateRemplacementModal
        show={showCreateRemplacementModal}
        onClose={() => setShowCreateRemplacementModal(false)}
        newDemande={newDemande}
        setNewDemande={setNewDemande}
        typesGarde={typesGarde}
        onSubmit={handleCreateRemplacement}
      />

      <CreateCongeModal
        show={showCreateCongeModal}
        onClose={() => setShowCreateCongeModal(false)}
        newConge={newConge}
        setNewConge={setNewConge}
        onSubmit={handleCreateConge}
      />

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

      {/* Modal de suivi de remplacement */}
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

      {/* Modal d'impact planning pour les congés */}
      <ImpactPlanningModal
        show={showImpactModal}
        onClose={() => setShowImpactModal(false)}
        impactData={impactData}
      />
    </div>
  );
};

// Formations Component complet - Planning de formations



export default Remplacements;
