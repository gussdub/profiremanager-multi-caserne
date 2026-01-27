import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useToast } from "../hooks/use-toast";
import Debogage from "./Debogage";
import PayrollProvidersAdmin from "./PayrollProvidersAdmin";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Durée d'inactivité avant déconnexion automatique (2 heures en ms)
const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 heures
// Avertissement 5 minutes avant déconnexion
const WARNING_BEFORE_LOGOUT = 5 * 60 * 1000; // 5 minutes

const SuperAdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('tenants'); // tenants, debogage ou audit
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateAdminModal, setShowCreateAdminModal] = useState(false);
  const [showCreateSuperAdminModal, setShowCreateSuperAdminModal] = useState(false);
  const [showManageSuperAdminsModal, setShowManageSuperAdminsModal] = useState(false);
  const [showEditSuperAdminModal, setShowEditSuperAdminModal] = useState(false);
  const [superAdmins, setSuperAdmins] = useState([]);
  const [editingSuperAdmin, setEditingSuperAdmin] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [showSftpConfigModal, setShowSftpConfigModal] = useState(false);
  const [sftpConfig, setSftpConfig] = useState(null);
  const [sftpLoading, setSftpLoading] = useState(false);
  const [sftpTesting, setSftpTesting] = useState(false);
  const [sftpFormData, setSftpFormData] = useState({
    host: '',
    port: 22,
    username: '',
    password: '',
    remote_path: '/',
    polling_interval: 30,
    actif: true,
    description: ''
  });
  const [timeRemaining, setTimeRemaining] = useState(0);
  // États pour le journal d'audit
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSummary, setAuditSummary] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState({ action: '', tenant_slug: '' });
  // États pour les centrales 911
  const [centrales, setCentrales] = useState([]);
  const [centralesLoading, setCentralesLoading] = useState(false);
  const [showCentraleModal, setShowCentraleModal] = useState(false);
  const [editingCentrale, setEditingCentrale] = useState(null);
  const [newTenant, setNewTenant] = useState({
    nom: '',
    slug: '',
    contact_email: '',
    contact_telephone: '',
    adresse: '',
    date_creation: '',
    module_prevention_active: false,
    is_gratuit: false,
    is_active: true,
    centrale_911_id: ''
  });
  const [billingOverview, setBillingOverview] = useState(null);
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    prenom: '',
    nom: '',
    mot_de_passe: ''
  });
  const [newSuperAdmin, setNewSuperAdmin] = useState({
    email: '',
    prenom: '',
    nom: '',
    mot_de_passe: ''
  });
  const { toast } = useToast();

  // ==================== GESTION DE L'INACTIVITÉ ====================
  const resetInactivityTimer = useCallback(() => {
    setShowInactivityWarning(false);
    localStorage.setItem('lastActivity', Date.now().toString());
  }, []);

  // Détecter l'activité utilisateur
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      resetInactivityTimer();
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity);
    });

    // Initialiser le timestamp
    resetInactivityTimer();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [resetInactivityTimer]);

  // Vérifier l'inactivité périodiquement
  useEffect(() => {
    const checkInactivity = () => {
      const lastActivity = parseInt(localStorage.getItem('lastActivity') || Date.now().toString());
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      // Déconnexion après 2h d'inactivité
      if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
        toast({
          title: "Session expirée",
          description: "Vous avez été déconnecté pour inactivité (2 heures)",
          variant: "destructive"
        });
        onLogout();
        return;
      }
      
      // Avertissement 5 minutes avant
      const timeUntilLogout = INACTIVITY_TIMEOUT - timeSinceLastActivity;
      if (timeUntilLogout <= WARNING_BEFORE_LOGOUT && timeUntilLogout > 0) {
        setShowInactivityWarning(true);
        setTimeRemaining(Math.ceil(timeUntilLogout / 60000)); // en minutes
      } else {
        setShowInactivityWarning(false);
      }
    };

    const interval = setInterval(checkInactivity, 30000); // Vérifier toutes les 30 secondes
    checkInactivity(); // Vérifier immédiatement

    return () => clearInterval(interval);
  }, [onLogout, toast]);

  // Helper pour récupérer le token avec le bon préfixe
  const getToken = () => {
    return localStorage.getItem('admin_token') || localStorage.getItem('token');
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Pour le tenant admin, le token est stocké avec le préfixe "admin_token"
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      
      const [tenantsResponse, statsResponse, billingResponse, centralesResponse] = await Promise.all([
        fetch(`${API}/admin/tenants`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API}/admin/stats`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API}/admin/billing/overview`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API}/admin/centrales-911`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);

      const tenantsData = await tenantsResponse.json();
      const statsData = await statsResponse.json();
      
      // Charger les centrales 911
      if (centralesResponse.ok) {
        const centralesData = await centralesResponse.json();
        setCentrales(centralesData.centrales || []);
      }
      
      // Merge billing data with tenants
      let billingData = null;
      if (billingResponse.ok) {
        billingData = await billingResponse.json();
        setBillingOverview(billingData);
      }

      // Enrichir les tenants avec les données de facturation
      const enrichedTenants = tenantsData.map(tenant => {
        const billingInfo = billingData?.tenants?.find(b => b.tenant_id === tenant.id);
        return {
          ...tenant,
          billing: billingInfo || null
        };
      });

      setTenants(enrichedTenants || []);
      setStats(statsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour charger les logs d'audit
  const fetchAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      
      // Construire l'URL avec les filtres
      let url = `${API}/admin/audit-logs?limit=100`;
      if (auditFilter.action) url += `&action=${auditFilter.action}`;
      if (auditFilter.tenant_slug) url += `&tenant_slug=${auditFilter.tenant_slug}`;
      
      const [logsResponse, summaryResponse] = await Promise.all([
        fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`${API}/admin/audit-logs/summary`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        })
      ]);
      
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        setAuditLogs(logsData.logs || []);
      }
      
      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        setAuditSummary(summaryData);
      }
    } catch (error) {
      console.error('Erreur chargement audit:', error);
    } finally {
      setAuditLoading(false);
    }
  };

  // Charger les logs d'audit quand on change d'onglet
  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    }
    if (activeTab === 'centrales') {
      fetchCentrales();
    }
  }, [activeTab, auditFilter]);

  // Fonction pour charger les centrales 911
  const fetchCentrales = async () => {
    setCentralesLoading(true);
    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      const response = await fetch(`${API}/admin/centrales-911`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCentrales(data.centrales || []);
      }
    } catch (error) {
      console.error('Erreur chargement centrales:', error);
    } finally {
      setCentralesLoading(false);
    }
  };

  // Sauvegarder une centrale
  const saveCentrale = async (centraleData) => {
    try {
      const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
      const isEdit = !!centraleData.id;
      const url = isEdit 
        ? `${API}/admin/centrales-911/${centraleData.id}`
        : `${API}/admin/centrales-911`;
      
      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(centraleData)
      });
      
      if (response.ok) {
        toast({ title: "Succès", description: isEdit ? "Centrale mise à jour" : "Centrale créée" });
        fetchCentrales();
        setShowCentraleModal(false);
        setEditingCentrale(null);
      } else {
        const error = await response.json();
        toast({ title: "Erreur", description: error.detail || "Erreur", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur de connexion", variant: "destructive" });
    }
  };

  // Formater la date pour l'affichage
  const formatAuditDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Traduire le type d'action
  const getActionLabel = (action) => {
    const labels = {
      'login': '🔐 Connexion dashboard',
      'tenant_access': '🏢 Accès tenant',
      'tenant_create': '➕ Création tenant',
      'tenant_update': '✏️ Modification tenant',
      'tenant_delete': '🗑️ Suppression tenant',
      'admin_create': '👤 Création admin'
    };
    return labels[action] || action;
  };

  const handleCreateTenant = async () => {
    if (!newTenant.nom || !newTenant.slug) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir le nom et le slug",
        variant: "destructive"
      });
      return;
    }

    // Valider le slug (alphanumerique et tirets seulement)
    if (!/^[a-z0-9-]+$/.test(newTenant.slug)) {
      toast({
        title: "Slug invalide",
        description: "Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/tenants`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newTenant)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur création');
      }

      toast({
        title: "Caserne créée",
        description: `La caserne ${newTenant.nom} a été créée avec succès`,
        variant: "success"
      });

      setShowCreateModal(false);
      resetNewTenant();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer la caserne",
        variant: "destructive"
      });
    }
  };

  const handleEditTenant = (tenant) => {
    setSelectedTenant(tenant);
    setNewTenant({
      nom: tenant.nom,
      slug: tenant.slug,
      contact_email: tenant.contact_email || tenant.email_contact || '',
      contact_telephone: tenant.contact_telephone || tenant.telephone || '',
      adresse: tenant.adresse || '',
      date_creation: tenant.date_creation || '',
      is_active: tenant.actif !== undefined ? tenant.actif : (tenant.is_active !== undefined ? tenant.is_active : true),
      is_gratuit: tenant.is_gratuit || false,
      module_prevention_active: tenant.parametres?.module_prevention_active || false,
      centrale_911_id: tenant.centrale_911_id || ''
    });
    setShowEditModal(true);
  };

  const handleUpdateTenant = async () => {
    if (!newTenant.nom || !newTenant.contact_email) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/tenants/${selectedTenant.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nom: newTenant.nom,
          email_contact: newTenant.contact_email,
          telephone: newTenant.contact_telephone,
          adresse: newTenant.adresse,
          date_creation: newTenant.date_creation,
          actif: newTenant.is_active,
          is_gratuit: newTenant.is_gratuit,
          centrale_911_id: newTenant.centrale_911_id || null,
          parametres: {
            module_prevention_active: newTenant.module_prevention_active
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur modification');
      }

      toast({
        title: "Caserne modifiée",
        description: "Les informations ont été mises à jour",
        variant: "success"
      });

      setShowEditModal(false);
      setSelectedTenant(null);
      resetNewTenant();
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de modifier la caserne",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTenant = async (tenant) => {
    try {
      // Récupérer l'impact de la suppression
      const token = getToken();
      const impactResponse = await fetch(`${API}/admin/tenants/${tenant.id}/deletion-impact`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!impactResponse.ok) {
        throw new Error('Impossible de récupérer les informations');
      }

      const impactData = await impactResponse.json();
      const impact = impactData.impact;

      // Construire le message de confirmation détaillé
      let message = `⚠️ SUPPRESSION DÉFINITIVE DE LA CASERNE "${tenant.nom}"\n\n`;
      message += `Cette action est IRRÉVERSIBLE et supprimera:\n\n`;
      message += `• ${impact.utilisateurs} utilisateur(s)\n`;
      message += `• ${impact.assignations} assignation(s)\n`;
      message += `• ${impact.formations} formation(s)\n`;
      message += `• ${impact.epi} EPI\n`;
      message += `• ${impact.gardes} garde(s)\n`;
      message += `• ${impact.disponibilites} disponibilité(s)\n`;
      message += `• ${impact.conges} congé(s)\n`;
      message += `\n❌ TOUTES CES DONNÉES SERONT PERDUES DÉFINITIVEMENT!\n\n`;
      message += `Tapez "${tenant.nom}" pour confirmer la suppression.`;

      const confirmation = window.prompt(message);
      
      if (confirmation !== tenant.nom) {
        toast({
          title: "Suppression annulée",
          description: "La confirmation ne correspond pas au nom de la caserne",
          variant: "default"
        });
        return;
      }

      // Procéder à la suppression
      const response = await fetch(`${API}/admin/tenants/${tenant.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur suppression');
      }

      const result = await response.json();

      toast({
        title: "✅ Caserne supprimée définitivement",
        description: `${result.deleted.users} utilisateur(s) et toutes les données associées ont été supprimés`,
        variant: "success"
      });

      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de supprimer la caserne",
        variant: "destructive"
      });
    }
  };

  const handleCreateAdmin = (tenant) => {
    setSelectedTenant(tenant);
    setNewAdmin({
      email: '',
      prenom: '',
      nom: '',
      mot_de_passe: ''
    });
    setShowCreateAdminModal(true);
  };

  const handleSubmitCreateAdmin = async () => {
    if (!newAdmin.email || !newAdmin.prenom || !newAdmin.nom || !newAdmin.mot_de_passe) {
      toast({
        title: "Erreur",
        description: "Tous les champs sont requis",
        variant: "destructive"
      });
      return;
    }

    if (newAdmin.mot_de_passe.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/tenants/${selectedTenant.id}/create-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newAdmin)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur création admin');
      }

      toast({
        title: "Administrateur créé",
        description: `L'admin ${newAdmin.prenom} ${newAdmin.nom} a été créé avec succès. Un email de bienvenue a été envoyé.`,
        variant: "success"
      });

      setShowCreateAdminModal(false);
      setNewAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleAccessTenant = (tenant) => {
    // Rediriger vers l'interface du tenant
    window.location.href = `/${tenant.slug}`;
  };

  const resetNewTenant = () => {
    setNewTenant({
      nom: '',
      slug: '',
      contact_email: '',
      contact_telephone: '',
      adresse: '',
      module_prevention_active: false
    });
  };

  // ==================== FONCTIONS SFTP ====================
  
  const fetchSftpConfig = async (tenantSlug) => {
    try {
      setSftpLoading(true);
      const token = getToken();
      const response = await fetch(`${API}/${tenantSlug}/sftp/config`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setSftpConfig(data);
          setSftpFormData({
            host: data.host || '',
            port: data.port || 22,
            username: data.username || '',
            password: '', // Ne pas afficher le mot de passe
            remote_path: data.remote_path || '/',
            polling_interval: data.polling_interval || 30,
            actif: data.actif !== false,
            description: data.description || ''
          });
        }
      }
    } catch (error) {
      console.log('Pas de configuration SFTP');
    } finally {
      setSftpLoading(false);
    }
  };

  const handleSaveSftpConfig = async () => {
    if (!sftpFormData.host || !sftpFormData.username) {
      toast({
        title: "Erreur",
        description: "L'hôte et le nom d'utilisateur sont requis",
        variant: "destructive"
      });
      return;
    }
    
    // Si pas de nouveau mot de passe et config existante, on ne l'envoie pas
    const dataToSend = { ...sftpFormData };
    if (!dataToSend.password && sftpConfig) {
      delete dataToSend.password;
    } else if (!dataToSend.password && !sftpConfig) {
      toast({
        title: "Erreur",
        description: "Le mot de passe est requis pour une nouvelle configuration",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setSftpLoading(true);
      const token = getToken();
      const method = sftpConfig ? 'PUT' : 'POST';
      
      const response = await fetch(`${API}/${selectedTenant.slug}/sftp/config`, {
        method: method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataToSend)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de la sauvegarde');
      }
      
      toast({
        title: "Succès",
        description: "Configuration SFTP enregistrée"
      });
      
      await fetchSftpConfig(selectedTenant.slug);
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSftpLoading(false);
    }
  };

  const handleTestSftp = async () => {
    const testData = { ...sftpFormData };
    
    // Vérifier qu'on a les infos minimales pour tester
    if (!testData.host || !testData.username) {
      toast({
        title: "Erreur",
        description: "L'hôte et le nom d'utilisateur sont requis pour tester",
        variant: "destructive"
      });
      return;
    }
    
    // Si pas de mot de passe dans le formulaire et config existante, on ne peut pas tester avec les nouveaux params
    if (!testData.password && !sftpConfig) {
      toast({
        title: "Erreur",
        description: "Le mot de passe est requis pour tester une nouvelle configuration",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setSftpTesting(true);
      const token = getToken();
      
      // Si pas de mot de passe mais config existante, tester avec config existante (body null)
      // Sinon, envoyer les données du formulaire
      const body = testData.password ? testData : null;
      
      const response = await fetch(`${API}/${selectedTenant.slug}/sftp/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : null
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "✅ Connexion réussie",
          description: result.message
        });
      } else {
        toast({
          title: "❌ Échec de connexion",
          description: result.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSftpTesting(false);
    }
  };

  const handleStartSftpPolling = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API}/${selectedTenant.slug}/sftp/start-polling`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur');
      }
      
      toast({
        title: "Succès",
        description: "Surveillance SFTP démarrée"
      });
      
      await fetchSftpConfig(selectedTenant.slug);
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleStopSftpPolling = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API}/${selectedTenant.slug}/sftp/stop-polling`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur');
      }
      
      toast({
        title: "Succès",
        description: "Surveillance SFTP arrêtée"
      });
      
      await fetchSftpConfig(selectedTenant.slug);
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteSftpConfig = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer la configuration SFTP ?")) {
      return;
    }
    
    try {
      const token = getToken();
      const response = await fetch(`${API}/${selectedTenant.slug}/sftp/config`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur');
      }
      
      toast({
        title: "Succès",
        description: "Configuration SFTP supprimée"
      });
      
      setSftpConfig(null);
      setSftpFormData({
        host: '',
        port: 22,
        username: '',
        password: '',
        remote_path: '/',
        polling_interval: 30,
        actif: true,
        description: ''
      });
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Fonctions pour gérer les super admins
  const fetchSuperAdmins = async () => {
    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/super-admins`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des super admins');
      }

      const data = await response.json();
      setSuperAdmins(data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleCreateSuperAdmin = async () => {
    if (!newSuperAdmin.email || !newSuperAdmin.prenom || !newSuperAdmin.nom || !newSuperAdmin.mot_de_passe) {
      toast({
        title: "Erreur",
        description: "Tous les champs sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/super-admins`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newSuperAdmin)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la création du super admin');
      }

      toast({
        title: "Succès",
        description: "Super admin créé avec succès"
      });

      setShowCreateSuperAdminModal(false);
      setNewSuperAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
      fetchSuperAdmins();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDeleteSuperAdmin = async (superAdminId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce super admin ?')) {
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/super-admins/${superAdminId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la suppression');
      }

      toast({
        title: "Succès",
        description: "Super admin supprimé avec succès"
      });

      fetchSuperAdmins();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleEditSuperAdmin = async () => {
    if (!editingSuperAdmin.prenom || !editingSuperAdmin.nom) {
      toast({
        title: "Erreur",
        description: "Le prénom et le nom sont obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = getToken();
      const response = await fetch(`${API}/admin/super-admins/${editingSuperAdmin.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prenom: editingSuperAdmin.prenom,
          nom: editingSuperAdmin.nom
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de la modification');
      }

      toast({
        title: "Succès",
        description: "Super admin modifié avec succès"
      });

      setShowEditSuperAdminModal(false);
      setEditingSuperAdmin(null);
      fetchSuperAdmins();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="loading-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Bannière d'avertissement d'inactivité */}
      {showInactivityWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          color: 'white',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 99999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <strong>Session bientôt expirée</strong>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                Déconnexion automatique dans {timeRemaining} minute(s) pour inactivité
              </div>
            </div>
          </div>
          <Button 
            onClick={resetInactivityTimer}
            style={{ 
              background: 'white', 
              color: '#D97706',
              fontWeight: '600'
            }}
          >
            Rester connecté
          </Button>
        </div>
      )}
      
      {/* Header - Responsive */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        gap: '16px',
        marginBottom: '20px',
        marginTop: showInactivityWarning ? '70px' : '0'
      }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold', margin: '0 0 5px 0' }}>
            🔧 Administration Multi-Tenant
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: '0.875rem' }}>Gestion centralisée des casernes</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {activeTab === 'tenants' && (
            <>
              <Button 
                variant="default" 
                onClick={() => {
                  setShowCreateSuperAdminModal(true);
                }}
                style={{ background: '#10b981', fontSize: '0.8rem', padding: '8px 12px', flex: '1 1 auto', minWidth: '120px' }}
              >
                ➕ Super admin
              </Button>
              <Button 
                variant="default" 
                onClick={() => {
                  fetchSuperAdmins();
                  setShowManageSuperAdminsModal(true);
                }}
                style={{ background: '#3b82f6', fontSize: '0.8rem', padding: '8px 12px', flex: '1 1 auto', minWidth: '120px' }}
              >
                👥 Gérer admins
              </Button>
            </>
          )}
          <Button 
            variant="outline" 
            onClick={() => {
              // Rediriger vers la page d'accueil pour changer de tenant
              window.location.href = '/';
            }}
            style={{ fontSize: '0.8rem', padding: '8px 12px', background: '#8b5cf6', color: 'white', border: 'none' }}
          >
            🔄 Changer de tenant
          </Button>
          <Button variant="outline" onClick={onLogout} style={{ fontSize: '0.8rem', padding: '8px 12px' }}>
            Déconnexion
          </Button>
        </div>
      </div>

      {/* Tabs Navigation - Responsive */}
      <div style={{
        display: 'flex',
        gap: '0.25rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid #e2e8f0',
        overflowX: 'auto'
      }}>
        <button
          onClick={() => setActiveTab('tenants')}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'tenants' ? '#2563eb' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'tenants' ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap'
          }}
        >
          🏢 Tenants
        </button>
        <button
          onClick={() => setActiveTab('debogage')}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'debogage' ? '#dc2626' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'debogage' ? '2px solid #dc2626' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap'
          }}
        >
          🛠️ Débogage
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'audit' ? '#7c3aed' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'audit' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap'
          }}
        >
          📋 Journal d'audit
        </button>
        <button
          onClick={() => setActiveTab('centrales')}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'centrales' ? '#ea580c' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'centrales' ? '2px solid #ea580c' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap'
          }}
        >
          🚨 Centrales 911
        </button>
        <button
          onClick={() => setActiveTab('paie')}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            backgroundColor: 'transparent',
            color: activeTab === 'paie' ? '#10b981' : '#64748b',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'paie' ? '2px solid #10b981' : '2px solid transparent',
            marginBottom: '-2px',
            fontSize: '0.875rem',
            whiteSpace: 'nowrap'
          }}
        >
          💰 Fournisseurs Paie
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'debogage' ? (
        <Debogage />
      ) : activeTab === 'audit' ? (
        /* ==================== ONGLET JOURNAL D'AUDIT ==================== */
        <div>
          {/* Résumé */}
          {auditSummary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <Card>
                <CardHeader style={{ padding: '12px 12px 4px' }}>
                  <CardTitle style={{ fontSize: '12px', color: '#666' }}>Actions (24h)</CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '4px 12px 12px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7c3aed' }}>
                    {auditSummary.counts?.last_24h || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader style={{ padding: '12px 12px 4px' }}>
                  <CardTitle style={{ fontSize: '12px', color: '#666' }}>Actions (7j)</CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '4px 12px 12px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                    {auditSummary.counts?.last_7d || 0}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader style={{ padding: '12px 12px 4px' }}>
                  <CardTitle style={{ fontSize: '12px', color: '#666' }}>Actions (30j)</CardTitle>
                </CardHeader>
                <CardContent style={{ padding: '4px 12px 12px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#64748b' }}>
                    {auditSummary.counts?.last_30d || 0}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filtres */}
          <Card style={{ marginBottom: '20px' }}>
            <CardContent style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Type d'action</label>
                  <select
                    value={auditFilter.action}
                    onChange={(e) => setAuditFilter({ ...auditFilter, action: e.target.value })}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                  >
                    <option value="">Toutes les actions</option>
                    <option value="login">Connexion dashboard</option>
                    <option value="tenant_access">Accès tenant</option>
                    <option value="tenant_create">Création tenant</option>
                    <option value="tenant_update">Modification tenant</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>Tenant</label>
                  <select
                    value={auditFilter.tenant_slug}
                    onChange={(e) => setAuditFilter({ ...auditFilter, tenant_slug: e.target.value })}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                  >
                    <option value="">Tous les tenants</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.slug}>{t.nom}</option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={() => setAuditFilter({ action: '', tenant_slug: '' })}
                  variant="outline"
                  style={{ marginTop: '18px' }}
                >
                  Réinitialiser
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Liste des logs */}
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '16px' }}>📋 Historique des actions</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Chargement...
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Aucune action enregistrée
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Date</th>
                        <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Admin</th>
                        <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Action</th>
                        <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#374151' }}>Tenant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr key={log.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 8px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {formatAuditDate(log.created_at)}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <div style={{ fontWeight: '500' }}>{log.admin_nom}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>{log.admin_email}</div>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            {getActionLabel(log.action)}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            {log.tenant_nom ? (
                              <div>
                                <div style={{ fontWeight: '500' }}>{log.tenant_nom}</div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{log.tenant_slug}</div>
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : activeTab === 'centrales' ? (
        /* ==================== ONGLET CENTRALES 911 ==================== */
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b' }}>
              🚨 Centrales 911 du Québec ({centrales.length})
            </h2>
            <Button
              onClick={() => {
                setEditingCentrale(null);
                setShowCentraleModal(true);
              }}
              style={{ background: '#ea580c' }}
            >
              + Ajouter une centrale
            </Button>
          </div>

          {centralesLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>
          ) : (
            <Card>
              <CardContent style={{ padding: '0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Code</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Nom</th>
                      <th style={{ padding: '12px 8px', textAlign: 'left', fontWeight: '600', color: '#475569' }}>Région</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Profil XML</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Statut</th>
                      <th style={{ padding: '12px 8px', textAlign: 'center', fontWeight: '600', color: '#475569' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {centrales.map((centrale) => (
                      <tr key={centrale.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 8px', fontWeight: '600', color: '#ea580c' }}>{centrale.code}</td>
                        <td style={{ padding: '12px 8px' }}>{centrale.nom}</td>
                        <td style={{ padding: '12px 8px', color: '#64748b' }}>{centrale.region || '-'}</td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {Object.keys(centrale.field_mapping || {}).length > 0 ? (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                              ✓ Configuré
                            </span>
                          ) : (
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                              Non configuré
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          {centrale.actif ? (
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>Actif</span>
                          ) : (
                            <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>Inactif</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              setEditingCentrale(centrale);
                              setShowCentraleModal(true);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#2563eb',
                              cursor: 'pointer',
                              padding: '4px 8px'
                            }}
                          >
                            ✏️ Modifier
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Modale Centrale */}
          {showCentraleModal && (
            <div style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100000,
              padding: '1rem'
            }}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '100%',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflowY: 'auto'
              }}>
                <h3 style={{ marginBottom: '20px', fontSize: '1.25rem', fontWeight: '600' }}>
                  {editingCentrale ? '✏️ Modifier la centrale' : '➕ Nouvelle centrale'}
                </h3>
                <CentraleForm
                  centrale={editingCentrale}
                  onSave={saveCentrale}
                  onCancel={() => {
                    setShowCentraleModal(false);
                    setEditingCentrale(null);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'paie' ? (
        /* ==================== ONGLET FOURNISSEURS DE PAIE ==================== */
        <PayrollProvidersAdmin token={getToken()} />
      ) : (
        <>
          {/* Statistiques globales - Responsive */}
          {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card>
            <CardHeader style={{ padding: '12px 12px 4px' }}>
              <CardTitle style={{ fontSize: '12px', color: '#666' }}>Casernes Actives</CardTitle>
            </CardHeader>
            <CardContent style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                {stats.casernes_actives || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ padding: '12px 12px 4px' }}>
              <CardTitle style={{ fontSize: '12px', color: '#666' }}>Casernes Inactives</CardTitle>
            </CardHeader>
            <CardContent style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>
                {stats.casernes_inactives || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader style={{ padding: '12px 12px 4px' }}>
              <CardTitle style={{ fontSize: '12px', color: '#666' }}>Total Pompiers</CardTitle>
            </CardHeader>
            <CardContent style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                {stats.total_pompiers || 0}
              </div>
            </CardContent>
          </Card>

          <Card style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}>
            <CardHeader style={{ padding: '12px 12px 4px' }}>
              <CardTitle style={{ fontSize: '12px', color: 'white' }}>💰 MRR</CardTitle>
            </CardHeader>
            <CardContent style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>
                {billingOverview?.summary?.total_mrr ? `${billingOverview.summary.total_mrr.toFixed(0)}$` : '0$'}
              </div>
              <small style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px' }}>
                /mois récurrent
              </small>
            </CardContent>
          </Card>
          <Card style={{ background: billingOverview?.summary?.past_due_tenants > 0 ? '#fef2f2' : '#f0fdf4', border: billingOverview?.summary?.past_due_tenants > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0' }}>
            <CardHeader style={{ padding: '12px 12px 4px' }}>
              <CardTitle style={{ fontSize: '12px', color: billingOverview?.summary?.past_due_tenants > 0 ? '#dc2626' : '#16a34a' }}>
                {billingOverview?.summary?.past_due_tenants > 0 ? '⚠️ Impayés' : '✅ Paiements'}
              </CardTitle>
            </CardHeader>
            <CardContent style={{ padding: '4px 12px 12px' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: billingOverview?.summary?.past_due_tenants > 0 ? '#dc2626' : '#16a34a' }}>
                {billingOverview?.summary?.past_due_tenants || 0}
              </div>
              <small style={{ fontSize: '10px', color: '#64748b' }}>
                {billingOverview?.summary?.paying_tenants || 0} payants | {billingOverview?.summary?.free_tenants || 0} gratuits
              </small>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liste des casernes - Responsive */}
      <Card>
        <CardHeader style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '12px',
          padding: '12px'
        }}>
          <CardTitle style={{ fontSize: '1rem' }}>Casernes</CardTitle>
          <Button onClick={() => setShowCreateModal(true)} style={{ width: '100%', fontSize: '0.875rem' }}>
            ➕ Créer une caserne
          </Button>
        </CardHeader>
        <CardContent style={{ padding: '12px' }}>
          {tenants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '0.875rem' }}>
              Aucune caserne créée. Créez votre première caserne pour commencer.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {tenants.map(tenant => (
                <Card key={tenant.id} style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: '0 0 8px 0' }}>
                        🏢 {tenant.nom}
                      </h3>
                      <div style={{ display: 'grid', gap: '4px', fontSize: '0.8rem', color: '#666' }}>
                        <div>
                          <strong>URL:</strong> /{tenant.slug}
                        </div>
                        <div>
                          <strong>Email:</strong> {tenant.contact_email}
                        </div>
                        {tenant.contact_telephone && (
                          <div>
                            <strong>Téléphone:</strong> {tenant.contact_telephone}
                          </div>
                        )}
                        {tenant.adresse && (
                          <div>
                            <strong>Adresse:</strong> {tenant.adresse}
                          </div>
                        )}
                        <div>
                          <strong>Créée le:</strong> {tenant.date_creation ? new Date(tenant.date_creation).toLocaleDateString('fr-FR') : tenant.created_at ? new Date(tenant.created_at).toLocaleDateString('fr-FR') : 'Non spécifiée'}
                        </div>
                        <div>
                          <strong>Statut:</strong>{' '}
                          <span style={{ 
                            color: (tenant.is_active !== undefined ? tenant.is_active : tenant.actif) ? '#10b981' : '#ef4444',
                            fontWeight: 'bold'
                          }}>
                            {(tenant.is_active !== undefined ? tenant.is_active : tenant.actif) ? '✓ Active' : '✗ Inactive'}
                          </span>
                        </div>
                        <div style={{ 
                          marginTop: '15px', 
                          padding: '15px', 
                          background: tenant.is_gratuit ? '#d1fae5' : (tenant.billing?.billing_status === 'past_due' ? '#fef2f2' : '#f8fafc'), 
                          borderRadius: '8px',
                          border: `1px solid ${tenant.is_gratuit ? '#10b981' : (tenant.billing?.billing_status === 'past_due' ? '#fecaca' : '#e2e8f0')}`
                        }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>📊 Facturation</span>
                            {tenant.is_gratuit ? (
                              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#10b981', color: 'white', borderRadius: '4px' }}>🆓 GRATUIT</span>
                            ) : tenant.billing?.billing_status === 'past_due' ? (
                              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#ef4444', color: 'white', borderRadius: '4px' }}>⚠️ IMPAYÉ</span>
                            ) : tenant.billing?.billing_status === 'active' ? (
                              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#10b981', color: 'white', borderRadius: '4px' }}>✅ PAYÉ</span>
                            ) : (
                              <span style={{ fontSize: '12px', padding: '2px 8px', background: '#94a3b8', color: 'white', borderRadius: '4px' }}>⏳ EN ATTENTE</span>
                            )}
                          </div>
                          <div style={{ display: 'grid', gap: '5px' }}>
                            <div>
                              <strong>Personnel:</strong> {tenant.billing?.user_count || tenant.nombre_employes || 0}
                            </div>
                            <div>
                              <strong>Palier:</strong>{' '}
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                background: (tenant.billing?.user_count || tenant.nombre_employes || 0) <= 30 ? '#dbeafe' : (tenant.billing?.user_count || tenant.nombre_employes || 0) <= 50 ? '#fef3c7' : '#dcfce7',
                                color: (tenant.billing?.user_count || tenant.nombre_employes || 0) <= 30 ? '#1e40af' : (tenant.billing?.user_count || tenant.nombre_employes || 0) <= 50 ? '#92400e' : '#166534'
                              }}>
                                {(tenant.billing?.user_count || tenant.nombre_employes || 0) <= 30 ? '12$/utilisateur' : (tenant.billing?.user_count || tenant.nombre_employes || 0) <= 50 ? '20$/utilisateur' : '27$/utilisateur'}
                              </span>
                              {tenant.billing?.prevention_module && (
                                <span style={{ marginLeft: '5px', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', background: '#fef3c7', color: '#92400e' }}>
                                  +3$ Prévention
                                </span>
                              )}
                            </div>
                            {!tenant.is_gratuit && (
                              <div>
                                <strong>Total mensuel:</strong>{' '}
                                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#dc2626' }}>
                                  {(() => {
                                    const userCount = tenant.billing?.user_count || tenant.nombre_employes || 0;
                                    const tierPrice = userCount <= 30 ? 12 : userCount <= 50 ? 20 : 27;
                                    const preventionPrice = tenant.billing?.prevention_module ? 3 : 0;
                                    const total = userCount * (tierPrice + preventionPrice);
                                    return `${total}$/mois`;
                                  })()}
                                </span>
                              </div>
                            )}
                            {tenant.billing?.last_payment_date && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                Dernier paiement: {tenant.billing.last_payment_date}
                              </div>
                            )}
                            {tenant.billing?.next_billing_date && !tenant.is_gratuit && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                Prochain: {tenant.billing.next_billing_date}
                              </div>
                            )}
                            {tenant.billing?.payment_failed_date && (
                              <div style={{ 
                                marginTop: '8px', 
                                padding: '8px', 
                                background: '#fef2f2', 
                                borderRadius: '4px',
                                fontSize: '12px',
                                color: '#991b1b'
                              }}>
                                ⚠️ Échec paiement depuis le {tenant.billing.payment_failed_date}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Section Modules Actifs */}
                      <div style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '8px',
                        padding: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '16px' }}>🔥</span>
                          <span style={{ fontWeight: 'bold', color: '#065f46' }}>Modules Actifs</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {/* Module de base toujours actif */}
                          <span style={{
                            background: '#dcfce7',
                            color: '#166534',
                            padding: '4px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '600',
                            border: '1px solid #bbf7d0'
                          }}>
                            📊 Base (Planning)
                          </span>
                          
                          {/* Module Prévention */}
                          {tenant.parametres?.module_prevention_active ? (
                            <span style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600',
                              border: '1px solid #fbbf24'
                            }}>
                              🔥 Prévention
                            </span>
                          ) : null}
                          
                          {/* Aucun module complémentaire */}
                          {!tenant.parametres?.module_prevention_active && (
                            <span style={{
                              background: '#f3f4f6',
                              color: '#6b7280',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontStyle: 'italic'
                            }}>
                              Aucun module complémentaire
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                      <Button 
                        variant="default" 
                        onClick={() => handleAccessTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        🔗 Accéder
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleCreateAdmin(tenant)}
                        style={{ minWidth: '140px', background: '#10b981', color: 'white', border: 'none' }}
                      >
                        👤 Créer Admin
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => handleEditTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={() => handleDeleteTenant(tenant)}
                        style={{ minWidth: '140px' }}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Créer Caserne */}
      {showCreateModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              Créer une nouvelle caserne
            </h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <Label>Nom de la caserne *</Label>
                <Input
                  value={newTenant.nom}
                  onChange={(e) => setNewTenant({ ...newTenant, nom: e.target.value })}
                  placeholder="Ex: Caserne de Shefford"
                />
              </div>

              <div>
                <Label>Slug (URL) *</Label>
                <Input
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value.toLowerCase() })}
                  placeholder="Ex: shefford"
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Lettres minuscules, chiffres et tirets uniquement. URL: /{newTenant.slug || 'slug'}
                </p>
              </div>

              <div>
                <Label>Email de contact *</Label>
                <Input
                  type="email"
                  value={newTenant.contact_email}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_email: e.target.value })}
                  placeholder="contact@caserne.com"
                />
              </div>

              <div>
                <Label>Téléphone</Label>
                <Input
                  value={newTenant.contact_telephone}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_telephone: e.target.value })}
                  placeholder="(450) 555-1234"
                />
              </div>

              <div>
                <Label>Adresse</Label>
                <Input
                  value={newTenant.adresse}
                  onChange={(e) => setNewTenant({ ...newTenant, adresse: e.target.value })}
                  placeholder="123 Rue Principale, Ville, Province"
                />
              </div>

              <div>
                <Label>Date de création (optionnel)</Label>
                <Input
                  type="date"
                  value={newTenant.date_creation}
                  onChange={(e) => setNewTenant({ ...newTenant, date_creation: e.target.value })}
                  placeholder="Laissez vide pour aujourd'hui"
                />
                <small style={{ color: '#64748b' }}>Laissez vide pour la date actuelle</small>
              </div>

              <div>
                <Label>Centrale 911</Label>
                <select
                  value={newTenant.centrale_911_id || ''}
                  onChange={(e) => setNewTenant({ ...newTenant, centrale_911_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                >
                  <option value="">-- Sélectionner une centrale --</option>
                  {centrales.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.nom}</option>
                  ))}
                </select>
                <small style={{ color: '#64748b' }}>Centrale 911 associée pour l'import des interventions</small>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateModal(false);
                resetNewTenant();
              }}>
                Annuler
              </Button>
              <Button onClick={handleCreateTenant}>
                Créer la caserne
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifier Caserne */}
      {showEditModal && selectedTenant && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '30px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
              Modifier la caserne
            </h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <Label>Nom de la caserne *</Label>
                <Input
                  value={newTenant.nom}
                  onChange={(e) => setNewTenant({ ...newTenant, nom: e.target.value })}
                  placeholder="Ex: Caserne de Shefford"
                />
              </div>

              <div>
                <Label>Slug (URL)</Label>
                <Input
                  value={newTenant.slug}
                  disabled
                  style={{ backgroundColor: '#f3f4f6', cursor: 'not-allowed' }}
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  Le slug ne peut pas être modifié après création
                </p>
              </div>

              <div>
                <Label>Email de contact *</Label>
                <Input
                  type="email"
                  value={newTenant.contact_email}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_email: e.target.value })}
                  placeholder="contact@caserne.com"
                />
              </div>

              <div>
                <Label>Téléphone</Label>
                <Input
                  value={newTenant.contact_telephone}
                  onChange={(e) => setNewTenant({ ...newTenant, contact_telephone: e.target.value })}
                  placeholder="(450) 555-1234"
                />
              </div>

              <div>
                <Label>Adresse</Label>
                <Input
                  value={newTenant.adresse}
                  onChange={(e) => setNewTenant({ ...newTenant, adresse: e.target.value })}
                  placeholder="123 Rue Principale, Ville, Province"
                />
              </div>

              <div>
                <Label>Date de création</Label>
                <Input
                  type="date"
                  value={newTenant.date_creation?.split('T')[0] || ''}
                  onChange={(e) => setNewTenant({ ...newTenant, date_creation: e.target.value })}
                />
                <small style={{ color: '#64748b' }}>Date d'activation de la caserne</small>
              </div>

              <div>
                <Label>🚨 Centrale 911</Label>
                <select
                  value={newTenant.centrale_911_id || ''}
                  onChange={(e) => setNewTenant({ ...newTenant, centrale_911_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px' }}
                >
                  <option value="">-- Aucune centrale --</option>
                  {centrales.map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.nom}</option>
                  ))}
                </select>
                <small style={{ color: '#64748b' }}>Centrale 911 associée pour l'import des interventions</small>
              </div>

              <div style={{ 
                padding: '20px', 
                background: '#f8fafc', 
                borderRadius: '8px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Label style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' }}>
                      Statut de la caserne
                    </Label>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '5px 0 0 0' }}>
                      {newTenant.is_active 
                        ? "✅ Caserne active - Les utilisateurs peuvent se connecter" 
                        : "⚠️ Caserne inactive - Les utilisateurs ne peuvent pas se connecter"}
                    </p>
                  </div>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '60px', 
                    height: '34px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={newTenant.is_active}
                      onChange={(e) => setNewTenant({ ...newTenant, is_active: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: newTenant.is_active ? '#10b981' : '#ef4444',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: newTenant.is_active ? '30px' : '4px',
                        bottom: '4px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Section Gratuit */}
              <div style={{ 
                padding: '20px', 
                background: newTenant.is_gratuit ? '#d1fae5' : '#fef2f2', 
                borderRadius: '8px',
                border: `1px solid ${newTenant.is_gratuit ? '#10b981' : '#fecaca'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Label style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px', color: newTenant.is_gratuit ? '#065f46' : '#991b1b' }}>
                      🆓 Compte Gratuit
                    </Label>
                    <p style={{ fontSize: '13px', color: newTenant.is_gratuit ? '#065f46' : '#991b1b', margin: '5px 0 0 0' }}>
                      {newTenant.is_gratuit 
                        ? "✅ Ce tenant ne sera pas facturé" 
                        : "💳 Ce tenant sera facturé selon le nombre d'utilisateurs"}
                    </p>
                  </div>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '60px', 
                    height: '34px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={newTenant.is_gratuit || false}
                      onChange={(e) => setNewTenant({ ...newTenant, is_gratuit: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: newTenant.is_gratuit ? '#10b981' : '#94a3b8',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: newTenant.is_gratuit ? '30px' : '4px',
                        bottom: '4px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Section Module Prévention */}
              <div style={{ 
                padding: '20px', 
                background: '#fef3c7', 
                borderRadius: '8px',
                border: '1px solid #fbbf24'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Label style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '5px', color: '#92400e' }}>
                      🔥 Module Prévention
                    </Label>
                    <p style={{ fontSize: '13px', color: '#92400e', margin: '5px 0 0 0' }}>
                      {newTenant.module_prevention_active 
                        ? "✅ Module activé - Gestion des inspections et bâtiments disponible" 
                        : "⚠️ Module désactivé - Fonctionnalités de prévention non disponibles"}
                    </p>
                  </div>
                  <label style={{ 
                    position: 'relative', 
                    display: 'inline-block', 
                    width: '60px', 
                    height: '34px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={newTenant.module_prevention_active}
                      onChange={(e) => setNewTenant({ ...newTenant, module_prevention_active: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: newTenant.module_prevention_active ? '#f59e0b' : '#ef4444',
                      transition: '0.4s',
                      borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute',
                        content: '',
                        height: '26px',
                        width: '26px',
                        left: newTenant.module_prevention_active ? '30px' : '4px',
                        bottom: '4px',
                        backgroundColor: 'white',
                        transition: '0.4s',
                        borderRadius: '50%'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Section Configuration SFTP 911 */}
              <div style={{ 
                padding: '20px', 
                background: '#f0f9ff', 
                borderRadius: '8px',
                border: '1px solid #0ea5e9',
                marginTop: '10px'
              }}>
                <div style={{ marginBottom: '15px' }}>
                  <Label style={{ fontSize: '16px', fontWeight: 'bold', color: '#0369a1' }}>
                    📡 Configuration SFTP - Cartes d'appel 911
                  </Label>
                  <p style={{ fontSize: '13px', color: '#0369a1', margin: '5px 0 0 0' }}>
                    Configurez la connexion au serveur SFTP de la centrale 911 pour importer automatiquement les cartes d'appel
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setShowSftpConfigModal(true);
                    fetchSftpConfig(selectedTenant.slug);
                  }}
                  style={{ backgroundColor: 'white' }}
                >
                  ⚙️ Configurer le SFTP
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowEditModal(false);
                setSelectedTenant(null);
                resetNewTenant();
              }}>
                Annuler
              </Button>
              <Button onClick={handleUpdateTenant}>
                Enregistrer les modifications
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configuration SFTP */}
      {showSftpConfigModal && selectedTenant && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1001
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '700px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '10px', fontSize: '24px', fontWeight: 'bold' }}>
              📡 Configuration SFTP - Cartes d'appel 911
            </h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Configurer l'accès SFTP pour <strong>{selectedTenant.nom}</strong>
            </p>

            {sftpLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Chargement...</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px' }}>
                {/* Statut actuel */}
                {sftpConfig && (
                  <div style={{ 
                    padding: '15px', 
                    borderRadius: '8px', 
                    backgroundColor: sftpConfig.polling_active ? '#dcfce7' : '#fef3c7',
                    border: `1px solid ${sftpConfig.polling_active ? '#86efac' : '#fcd34d'}`,
                    marginBottom: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{sftpConfig.polling_active ? '✅ Surveillance active' : '⏸️ Surveillance inactive'}</strong>
                        {sftpConfig.last_check && (
                          <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Dernière vérification: {new Date(sftpConfig.last_check).toLocaleString('fr-FR')}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {sftpConfig.polling_active ? (
                          <Button variant="outline" size="sm" onClick={handleStopSftpPolling}>
                            ⏹️ Arrêter
                          </Button>
                        ) : (
                          <Button size="sm" onClick={handleStartSftpPolling}>
                            ▶️ Démarrer
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '15px' }}>
                  <div>
                    <Label>Serveur SFTP *</Label>
                    <Input
                      value={sftpFormData.host}
                      onChange={(e) => setSftpFormData({ ...sftpFormData, host: e.target.value })}
                      placeholder="sftp.centrale911.ca"
                    />
                  </div>
                  <div>
                    <Label>Port</Label>
                    <Input
                      type="number"
                      value={sftpFormData.port}
                      onChange={(e) => setSftpFormData({ ...sftpFormData, port: parseInt(e.target.value) || 22 })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Nom d'utilisateur *</Label>
                  <Input
                    value={sftpFormData.username}
                    onChange={(e) => setSftpFormData({ ...sftpFormData, username: e.target.value })}
                    placeholder="user_sftp"
                  />
                </div>

                <div>
                  <Label>Mot de passe {sftpConfig ? '(laisser vide pour conserver)' : '*'}</Label>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showSftpPassword ? 'text' : 'password'}
                      value={sftpFormData.password}
                      onChange={(e) => setSftpFormData({ ...sftpFormData, password: e.target.value })}
                      placeholder={sftpConfig ? '••••••••' : 'Mot de passe'}
                      style={{ paddingRight: '40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSftpPassword(!showSftpPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '0'
                      }}
                      title={showSftpPassword ? 'Masquer' : 'Afficher'}
                    >
                      {showSftpPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Chemin du répertoire</Label>
                  <Input
                    value={sftpFormData.remote_path}
                    onChange={(e) => setSftpFormData({ ...sftpFormData, remote_path: e.target.value })}
                    placeholder="/cartes_appel/shefford"
                  />
                  <small style={{ color: '#666' }}>Répertoire où sont déposées les cartes d'appel XML</small>
                </div>

                <div>
                  <Label>Intervalle de vérification (secondes)</Label>
                  <Input
                    type="number"
                    min="10"
                    max="300"
                    value={sftpFormData.polling_interval}
                    onChange={(e) => setSftpFormData({ ...sftpFormData, polling_interval: parseInt(e.target.value) || 30 })}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="sftp_actif"
                    checked={sftpFormData.actif}
                    onChange={(e) => setSftpFormData({ ...sftpFormData, actif: e.target.checked })}
                  />
                  <Label htmlFor="sftp_actif" style={{ marginBottom: 0 }}>Configuration active</Label>
                </div>

                <div>
                  <Label>Description (optionnel)</Label>
                  <Input
                    value={sftpFormData.description}
                    onChange={(e) => setSftpFormData({ ...sftpFormData, description: e.target.value })}
                    placeholder="CAUCA - Chaudière-Appalaches"
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '25px', justifyContent: 'space-between' }}>
              <div>
                {sftpConfig && (
                  <Button variant="destructive" onClick={handleDeleteSftpConfig}>
                    🗑️ Supprimer
                  </Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Button variant="outline" onClick={handleTestSftp} disabled={sftpTesting}>
                  {sftpTesting ? '⏳ Test...' : '🔌 Tester'}
                </Button>
                <Button variant="outline" onClick={() => {
                  setShowSftpConfigModal(false);
                  setSftpConfig(null);
                  setSftpFormData({
                    host: '',
                    port: 22,
                    username: '',
                    password: '',
                    remote_path: '/',
                    polling_interval: 30,
                    actif: true,
                    description: ''
                  });
                }}>
                  Fermer
                </Button>
                <Button onClick={handleSaveSftpConfig} disabled={sftpLoading}>
                  {sftpLoading ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Créer Admin pour Caserne */}
      {showCreateAdminModal && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: 'bold' }}>
              👤 Créer un Administrateur
            </h2>
            <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
              Créer le premier administrateur pour <strong>{selectedTenant?.nom}</strong>
            </p>

            <div style={{ display: 'grid', gap: '15px' }}>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@caserne.ca"
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <Label>Prénom *</Label>
                  <Input
                    value={newAdmin.prenom}
                    onChange={(e) => setNewAdmin({ ...newAdmin, prenom: e.target.value })}
                    placeholder="Jean"
                    required
                  />
                </div>

                <div>
                  <Label>Nom *</Label>
                  <Input
                    value={newAdmin.nom}
                    onChange={(e) => setNewAdmin({ ...newAdmin, nom: e.target.value })}
                    placeholder="Dupont"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={newAdmin.mot_de_passe}
                  onChange={(e) => setNewAdmin({ ...newAdmin, mot_de_passe: e.target.value })}
                  placeholder="Minimum 6 caractères"
                  required
                />
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Ce mot de passe sera envoyé par email à l'administrateur
                </small>
              </div>

              <div style={{
                padding: '15px',
                background: '#f0f9ff',
                borderRadius: '8px',
                border: '1px solid #bae6fd',
                fontSize: '13px',
                color: '#0369a1'
              }}>
                ℹ️ L'administrateur recevra un email de bienvenue avec ses identifiants de connexion et pourra créer d'autres utilisateurs depuis le module Personnel.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateAdminModal(false);
                setSelectedTenant(null);
                setNewAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
              }}>
                Annuler
              </Button>
              <Button onClick={handleSubmitCreateAdmin} style={{ background: '#10b981' }}>
                ✅ Créer l'administrateur
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Créer un super admin */}
      {showCreateSuperAdminModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '500px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
              👨‍💼 Créer un super admin
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <Label>Prénom *</Label>
                <Input
                  type="text"
                  value={newSuperAdmin.prenom}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, prenom: e.target.value })}
                  placeholder="Jean"
                  required
                />
              </div>

              <div>
                <Label>Nom *</Label>
                <Input
                  type="text"
                  value={newSuperAdmin.nom}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, nom: e.target.value })}
                  placeholder="Dupont"
                  required
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newSuperAdmin.email}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, email: e.target.value })}
                  placeholder="super.admin@exemple.com"
                  required
                />
              </div>

              <div>
                <Label>Mot de passe *</Label>
                <Input
                  type="password"
                  value={newSuperAdmin.mot_de_passe}
                  onChange={(e) => setNewSuperAdmin({ ...newSuperAdmin, mot_de_passe: e.target.value })}
                  placeholder="Minimum 8 caractères"
                  required
                />
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  Minimum 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial
                </small>
              </div>

              <div style={{
                padding: '15px',
                background: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
                fontSize: '13px',
                color: '#92400e'
              }}>
                ⚠️ Un super admin peut gérer TOUS les tenants et accéder à cette interface d'administration.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowCreateSuperAdminModal(false);
                setNewSuperAdmin({ email: '', prenom: '', nom: '', mot_de_passe: '' });
              }}>
                Annuler
              </Button>
              <Button onClick={handleCreateSuperAdmin} style={{ background: '#10b981' }}>
                ✅ Créer le super admin
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gérer les super admins */}
      {showManageSuperAdminsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '700px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
              👥 Gestion des super admins
            </h2>

            {superAdmins.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Aucun super admin trouvé
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {superAdmins.map((admin) => (
                  <div key={admin.id} style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px' }}>
                        {admin.prenom} {admin.nom}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '14px' }}>
                        {admin.email}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <Button 
                        variant="default"
                        onClick={() => {
                          setEditingSuperAdmin(admin);
                          setShowEditSuperAdminModal(true);
                        }}
                        style={{ background: '#3b82f6' }}
                      >
                        ✏️ Modifier
                      </Button>
                      <Button 
                        variant="destructive"
                        onClick={() => handleDeleteSuperAdmin(admin.id)}
                        style={{ background: '#dc2626' }}
                      >
                        🗑️ Supprimer
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowManageSuperAdminsModal(false);
              }}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifier un super admin */}
      {showEditSuperAdminModal && editingSuperAdmin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '500px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '24px', fontWeight: 'bold' }}>
              ✏️ Modifier un super admin
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingSuperAdmin.email}
                  disabled
                  style={{ background: '#f3f4f6', cursor: 'not-allowed' }}
                />
                <small style={{ color: '#64748b', fontSize: '12px' }}>
                  L'email ne peut pas être modifié
                </small>
              </div>

              <div>
                <Label>Prénom *</Label>
                <Input
                  type="text"
                  value={editingSuperAdmin.prenom}
                  onChange={(e) => setEditingSuperAdmin({ ...editingSuperAdmin, prenom: e.target.value })}
                  placeholder="Jean"
                  required
                />
              </div>

              <div>
                <Label>Nom *</Label>
                <Input
                  type="text"
                  value={editingSuperAdmin.nom}
                  onChange={(e) => setEditingSuperAdmin({ ...editingSuperAdmin, nom: e.target.value })}
                  placeholder="Dupont"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => {
                setShowEditSuperAdminModal(false);
                setEditingSuperAdmin(null);
              }}>
                Annuler
              </Button>
              <Button onClick={handleEditSuperAdmin} style={{ background: '#3b82f6' }}>
                ✅ Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

// ==================== COMPOSANT FORMULAIRE CENTRALE ====================
const CentraleForm = ({ centrale, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    id: centrale?.id || '',
    code: centrale?.code || '',
    nom: centrale?.nom || '',
    region: centrale?.region || '',
    actif: centrale?.actif ?? true,
    xml_encoding: centrale?.xml_encoding || 'utf-8',
    xml_root_element: centrale?.xml_root_element || 'carteAppel',
    notes: centrale?.notes || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.code || !formData.nom) {
      alert('Le code et le nom sont requis');
      return;
    }
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
          <div>
            <Label>Code *</Label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="CAUCA"
              disabled={!!centrale}
            />
          </div>
          <div>
            <Label>Nom complet *</Label>
            <Input
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Centre d'appels d'urgence..."
            />
          </div>
        </div>

        <div>
          <Label>Région</Label>
          <Input
            value={formData.region}
            onChange={(e) => setFormData({ ...formData, region: e.target.value })}
            placeholder="Chaudière-Appalaches"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <Label>Encodage XML</Label>
            <select
              value={formData.xml_encoding}
              onChange={(e) => setFormData({ ...formData, xml_encoding: e.target.value })}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
            >
              <option value="utf-8">UTF-8</option>
              <option value="iso-8859-1">ISO-8859-1</option>
              <option value="windows-1252">Windows-1252</option>
            </select>
          </div>
          <div>
            <Label>Élément racine XML</Label>
            <Input
              value={formData.xml_root_element}
              onChange={(e) => setFormData({ ...formData, xml_root_element: e.target.value })}
              placeholder="carteAppel"
            />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Notes sur cette centrale..."
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', minHeight: '80px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="actif"
            checked={formData.actif}
            onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
          />
          <label htmlFor="actif">Centrale active</label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '24px', justifyContent: 'flex-end' }}>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" style={{ background: '#ea580c' }}>
          {centrale ? '✅ Enregistrer' : '➕ Créer'}
        </Button>
      </div>
    </form>
  );
};

export default SuperAdminDashboard;
