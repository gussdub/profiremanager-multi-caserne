import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Calendar } from "./components/ui/calendar";
import { useToast } from "./hooks/use-toast";
import { Toaster } from "./components/ui/toaster";
import { useTenant } from "./contexts/TenantContext";
import { apiGet, apiPost, apiPut, apiDelete, apiCall } from "./utils/api";
import PushNotificationService from "./services/pushNotifications";
import { fr } from "date-fns/locale";
import "./App.css";

// Lazy loading pour optimiser les performances
const Parametres = lazy(() => import("./components/Parametres"));
const SuperAdminDashboard = lazy(() => import("./components/SuperAdminDashboard"));

// Composant de chargement
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loading-spinner"></div>
    <p>Chargement du module...</p>
  </div>
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Configure axios defaults
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Auth Context
const AuthContext = React.createContext();

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { tenantSlug, isSuperAdmin } = useTenant();

  useEffect(() => {
    const token = localStorage.getItem('token');
    
    // Ne pas vérifier le token si pas de tenantSlug
    if (!tenantSlug) {
      setLoading(false);
      return;
    }
    
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      // Construire l'URL correcte selon le type d'utilisateur
      const meUrl = isSuperAdmin 
        ? `${API}/admin/auth/me` 
        : `${API}/${tenantSlug}/auth/me`;
      
      // Verify token and get user info
      axios.get(meUrl)
        .then(response => {
          setUser(response.data);
        })
        .catch((error) => {
          console.log('Token invalide ou expiré, nettoyage complet et redirection...');
          // Nettoyer COMPLÈTEMENT
          localStorage.clear();
          sessionStorage.clear();
          delete axios.defaults.headers.common['Authorization'];
          setUser(null);
          
          // Forcer le rechargement de la page pour retourner au login
          setTimeout(() => {
            window.location.reload();
          }, 100);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [tenantSlug, isSuperAdmin]);

  const login = async (email, mot_de_passe) => {
    try {
      // Nettoyer complètement avant une nouvelle connexion (au cas où)
      localStorage.removeItem('token');
      localStorage.removeItem('tenant');
      localStorage.removeItem('user');
      delete axios.defaults.headers.common['Authorization'];
      
      // Utiliser l'endpoint tenant-spécifique
      const loginUrl = isSuperAdmin
        ? `${API}/admin/auth/login`
        : `${API}/${tenantSlug}/auth/login`;
      
      const response = await axios.post(loginUrl, {
        email,
        mot_de_passe
      });
      
      // Pour Super Admin, la réponse contient 'admin' au lieu de 'user'
      const { access_token, user: userData, admin: adminData, tenant } = response.data;
      const finalUserData = isSuperAdmin ? adminData : userData;
      
      localStorage.setItem('token', access_token);
      
      // Stocker les infos du tenant si présentes
      if (tenant) {
        localStorage.setItem('tenant', JSON.stringify(tenant));
      }
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setUser(finalUserData);
      
      // Initialiser les notifications push pour les utilisateurs non-super-admin
      if (!isSuperAdmin && tenantSlug && finalUserData?.id) {
        try {
          await PushNotificationService.initialize(tenantSlug, finalUserData.id);
          console.log('✅ Push notifications initialized');
        } catch (error) {
          console.error('⚠️ Push notifications initialization failed:', error);
          // Ne pas bloquer la connexion si les notifications échouent
        }
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erreur de connexion' 
      };
    }
  };

  const logout = () => {
    // Désenregistrer les notifications push
    PushNotificationService.unregister().catch(err => 
      console.error('Error unregistering push notifications:', err)
    );
    
    // Nettoyer COMPLÈTEMENT le localStorage et sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Supprimer le header Authorization d'axios
    delete axios.defaults.headers.common['Authorization'];
    
    // Réinitialiser l'état utilisateur
    setUser(null);
    
    // Forcer le rafraîchissement de la page pour éviter les problèmes de cache
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname;
    }, 100);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Login Component
const Login = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const result = await login(email, motDePasse);
    
    if (!result.success) {
      toast({
        title: "Erreur de connexion",
        description: result.error,
        variant: "destructive"
      });
    }
    
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo">
            <div className="logo-flame">
              <div className="flame-container">
                <i className="fas fa-fire flame-icon"></i>
              </div>
            </div>
            <h1>ProFireManager</h1>
            <p className="version">v2.0 Avancé</p>
          </div>
        </div>
        
        <Card className="login-card">
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  data-testid="login-email-input"
                />
              </div>
              <div>
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                  autoComplete="new-password"
                  data-testid="login-password-input"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Sidebar Navigation avec menu hamburger mobile
const Sidebar = ({ currentPage, setCurrentPage }) => {
  const { user, logout } = useAuth();
  const { tenantSlug } = useTenant();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Charger les notifications
  const loadNotifications = async () => {
    if (!tenantSlug || !user) return;
    
    // Ne charger les notifications que pour les utilisateurs non-employés
    if (user.role === 'employe') return;
    
    try {
      const notificationsData = await apiGet(tenantSlug, '/notifications');
      setNotifications(notificationsData);
      
      const countData = await apiGet(tenantSlug, '/notifications/non-lues/count');
      setUnreadCount(countData.count);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    }
  };

  // Charger au montage et toutes les 30 secondes
  useEffect(() => {
    if (user) {
      loadNotifications();
      const interval = setInterval(loadNotifications, 30000); // 30 secondes
      return () => clearInterval(interval);
    }
  }, [user]);

  // Jouer un son quand il y a de nouvelles notifications
  useEffect(() => {
    if (unreadCount > 0) {
      // Son de notification (vous pouvez personnaliser)
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZjTkIHGy57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3QtBSh+y/HajzsIHGu57OihUhELTKXh8bllHgU2jdXty3Qt');
      audio.volume = 0.3;
      audio.play().catch(e => console.log('Audio play failed:', e));
    }
  }, [unreadCount]);

  const marquerCommeLue = async (notifId) => {
    try {
      await apiPut(tenantSlug, `/notifications/${notifId}/marquer-lu`, {});
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage notification:', error);
    }
  };

  const marquerToutesLues = async () => {
    try {
      await apiPut(tenantSlug, '/notifications/marquer-toutes-lues', {});
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage toutes notifications:', error);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'personnel', label: 'Personnel', icon: '👥', roles: ['admin', 'superviseur'] },
    { id: 'epi', label: 'EPI', icon: '🛡️', roles: ['admin', 'superviseur'] },
    { id: 'planning', label: 'Planning', icon: '📅', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'disponibilites', label: 'Mes disponibilités', icon: '📋', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'remplacements', label: 'Remplacements', icon: '🔄', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'formations', label: 'Formations', icon: '📚', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'rapports', label: 'Rapports', icon: '📈', roles: ['admin'] },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', roles: ['admin'] },
    { id: 'monprofil', label: 'Mon profil', icon: '👤', roles: ['admin', 'superviseur', 'employe'] }
  ];

  const filteredMenuItems = menuItems.filter(item => {
    // Vérification du rôle
    if (!item.roles.includes(user?.role)) return false;
    
    // Vérifier si c'est le module "Mes disponibilités" qui ne doit être visible que pour les utilisateurs temps partiel
    if (item.id === 'disponibilites' && user.type_emploi !== 'temps_partiel') {
      return false;
    }
    
    return true;
  });

  return (
    <>
      {/* Notification bell icon */}
      <div className="notification-bell-container">
        <button 
          className="notification-bell"
          onClick={() => setShowNotifications(!showNotifications)}
          data-testid="notification-bell"
        >
          <i className="fas fa-bell"></i>
          {unreadCount > 0 && (
            <span className="notification-badge">{unreadCount}</span>
          )}
        </button>

        {/* Dropdown des notifications */}
        {showNotifications && (
          <div className="notifications-dropdown">
            <div className="notifications-header">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={marquerToutesLues} className="mark-all-read">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="notifications-list">
              {notifications.length === 0 ? (
                <div className="no-notifications">
                  <i className="fas fa-inbox"></i>
                  <p>Aucune notification</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div 
                    key={notif.id}
                    className={`notification-item ${notif.statut === 'non_lu' ? 'unread' : ''}`}
                    onClick={() => {
                      marquerCommeLue(notif.id);
                      if (notif.lien) {
                        setCurrentPage(notif.lien.replace('/', ''));
                        setShowNotifications(false);
                      }
                    }}
                  >
                    <div className="notification-icon">
                      {notif.type === 'remplacement_demande' && '🔄'}
                      {notif.type === 'conge_approuve' && '✅'}
                      {notif.type === 'conge_refuse' && '❌'}
                      {notif.type === 'conge_demande' && '📝'}
                      {notif.type === 'planning_assigne' && '📅'}
                    </div>
                    <div className="notification-content">
                      <h4>{notif.titre}</h4>
                      <p>{notif.message}</p>
                      <span className="notification-time">
                        {new Date(notif.date_creation).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    {notif.statut === 'non_lu' && (
                      <div className="notification-dot"></div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile hamburger button */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        data-testid="mobile-menu-toggle"
      >
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
        <span className="hamburger-line"></span>
      </button>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      <div className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-flame">
              <div className="flame-container">
                <i className="fas fa-fire flame-icon"></i>
              </div>
            </div>
            <div>
              <h2>ProFireManager</h2>
              <p className="version">v2.0 Avancé</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {filteredMenuItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentPage(item.id);
                setIsMobileMenuOpen(false); // Fermer menu mobile après clic
              }}
              data-testid={`nav-${item.id}-btn`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="user-info">
            <div className="user-avatar">
              <span className="user-icon">👤</span>
            </div>
            <div className="user-details">
              <p className="user-name">{user?.prenom} {user?.nom}</p>
              <p className="user-role">{user?.role === 'admin' ? 'Administrateur' : 
                                      user?.role === 'superviseur' ? 'Superviseur' : 'Employé'}</p>
              <p className="user-grade">{user?.grade}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            onClick={() => {
              logout();
              setIsMobileMenuOpen(false);
            }}
            className="logout-btn"
            data-testid="logout-btn"
          >
            🚪 Déconnexion
          </Button>
        </div>
      </div>
    </>
  );
};



// ==================== MODULE EPI NFPA 1851 - PHASE 1 ====================
const ModuleEPI = ({ user }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inventaire');
  
  // États inventaire
  const [epis, setEpis] = useState([]);
  const [selectedEPI, setSelectedEPI] = useState(null);
  const [showEPIModal, setShowEPIModal] = useState(false);
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
  
  // États rapports
  const [rapportConformite, setRapportConformite] = useState(null);
  const [rapportEcheances, setRapportEcheances] = useState(null);
  
  // Types EPI
  const typesEPI = [
    { id: 'casque', nom: 'Casque', icone: '🪖' },
    { id: 'bottes', nom: 'Bottes', icone: '👢' },
    { id: 'veste_bunker', nom: 'Manteau Habit de Combat', icone: '🧥' },
    { id: 'pantalon_bunker', nom: 'Pantalon Habit de Combat', icone: '👖' },
    { id: 'gants', nom: 'Gants', icone: '🧤' },
    { id: 'cagoule', nom: 'Cagoule Anti-Particules', icone: '🎭' }
  ];
  
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
        inspecteur_nom: `${user.prenom} ${user.nom}`,
        inspecteur_id: user.id
      }));
    }
  }, [tenantSlug, user]);
  
  useEffect(() => {
    if (activeTab === 'rapports') {
      loadRapports();
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
      const [conformite, echeances] = await Promise.all([
        apiGet(tenantSlug, '/epi/rapports/conformite'),
        apiGet(tenantSlug, '/epi/rapports/echeances?jours=30')
      ]);
      setRapportConformite(conformite);
      setRapportEcheances(echeances);
    } catch (error) {
      console.error('Erreur rapports:', error);
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
    await loadInspections(epi.id);
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
      
      {/* ONGLET RAPPORTS */}
      {activeTab === 'rapports' && rapportConformite && (
        <div className="epi-rapports">
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
                  <Label>Numéro de série interne *</Label>
                  <Input 
                    value={epiForm.numero_serie}
                    onChange={e => setEpiForm({...epiForm, numero_serie: e.target.value})}
                    placeholder="Ex: EPI-2025-001"
                  />
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
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                  <h3>📋 Historique des inspections ({inspections.length})</h3>
                  <Button onClick={() => setShowInspectionModal(true)}>
                    ➕ Nouvelle inspection
                  </Button>
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
    </div>
  );
};

const MonProfil = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const [userProfile, setUserProfile] = useState(null);
  const [formations, setFormations] = useState([]);
  const [monthlyStats, setMonthlyStats] = useState({
    gardes_ce_mois: 0,
    heures_travaillees: 0,
    certifications: 0
  });
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingEPI, setIsEditingEPI] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [profileData, setProfileData] = useState({});
  const [myEPIs, setMyEPIs] = useState([]);
  const [epiTailles, setEpiTailles] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!tenantSlug) return;
      
      try {
        const [userData, formationsData, statsData, episData] = await Promise.all([
          apiGet(tenantSlug, `/users/${user.id}`),
          apiGet(tenantSlug, '/formations'),
          apiGet(tenantSlug, `/users/${user.id}/stats-mensuelles`),
          apiGet(tenantSlug, `/epi/employe/${user.id}`)
        ]);
        
        setUserProfile(userData);
        setFormations(formationsData);
        setMonthlyStats(statsData);
        setMyEPIs(episData);
        
        // Créer un objet de tailles pour l'édition
        const tailles = {};
        episData.forEach(epi => {
          tailles[epi.type_epi] = epi.taille;
        });
        setEpiTailles(tailles);
        
        setProfileData({
          nom: userData.nom,
          prenom: userData.prenom,
          email: userData.email,
          telephone: userData.telephone,
          adresse: userData.adresse || '',
          contact_urgence: userData.contact_urgence || '',
          heures_max_semaine: userData.heures_max_semaine || 25
        });

      } catch (error) {
        console.error('Erreur lors du chargement du profil:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id, tenantSlug]);

  const handleSaveProfile = async () => {
    try {
      // Utiliser l'endpoint spécial pour modification de son propre profil
      const updateData = {
        prenom: profileData.prenom,
        nom: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        adresse: profileData.adresse,
        contact_urgence: profileData.contact_urgence,
        heures_max_semaine: profileData.heures_max_semaine || 25
      };

      const updatedData = await apiPut(tenantSlug, '/users/mon-profil', updateData);
      
      // Mettre à jour le profil local avec la réponse
      setUserProfile(updatedData);
      
      // Mettre à jour aussi profileData pour que les champs affichent les bonnes valeurs
      setProfileData({
        nom: updatedData.nom,
        prenom: updatedData.prenom,
        email: updatedData.email,
        telephone: updatedData.telephone,
        adresse: updatedData.adresse || '',
        contact_urgence: updatedData.contact_urgence || '',
        heures_max_semaine: updatedData.heures_max_semaine || 25
      });
      
      toast({
        title: "Profil mis à jour",
        description: "Vos informations ont été sauvegardées et sont maintenant visibles dans Personnel.",
        variant: "success"
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur sauvegarde profil:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder les modifications.",
        variant: "destructive"
      });
    }
  };

  const handleSaveEPITailles = async () => {
    try {
      // Mettre à jour chaque EPI avec sa nouvelle taille
      const updatePromises = myEPIs.map(epi => {
        if (epiTailles[epi.type_epi] && epiTailles[epi.type_epi] !== epi.taille) {
          return apiPut(tenantSlug, `/epi/${epi.id}`, {
            taille: epiTailles[epi.type_epi]
          });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);

      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setMyEPIs(episData);

      toast({
        title: "Tailles mises à jour",
        description: "Vos tailles d'EPI ont été sauvegardées",
        variant: "success"
      });

      setIsEditingEPI(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder les tailles",
        variant: "destructive"
      });
    }
  };

  const getEPINom = (typeEpi) => {
    const noms = {
      'casque': 'Casque',
      'bottes': 'Bottes',
      'veste_bunker': 'Veste Bunker',
      'pantalon_bunker': 'Pantalon Bunker',
      'gants': 'Gants',
      'masque_apria': 'Facial APRIA',
      'cagoule': 'Cagoule Anti-Particules'
    };
    return noms[typeEpi] || typeEpi;
  };

  const getAllEPITypes = () => {
    return [
      { id: 'casque', nom: 'Casque', icone: '🪖' },
      { id: 'bottes', nom: 'Bottes', icone: '👢' },
      { id: 'veste_bunker', nom: 'Veste Bunker', icone: '🧥' },
      { id: 'pantalon_bunker', nom: 'Pantalon Bunker', icone: '👖' },
      { id: 'gants', nom: 'Gants', icone: '🧤' },
      { id: 'masque_apria', nom: 'Facial APRIA', icone: '😷' },
      { id: 'cagoule', nom: 'Cagoule Anti-Particules', icone: '🎭' }
    ];
  };
  const getEPIIcone = (typeEpi) => {
    const icones = {
      'casque': '🪖',
      'bottes': '👢',
      'veste_bunker': '🧥',
      'pantalon_bunker': '👖',
      'gants': '🧤',
      'masque_apria': '😷',
      'cagoule': '🎭'
    };
    return icones[typeEpi] || '🛡️';
  };

  const handleChangePassword = async () => {
    if (!passwordData.current_password || !passwordData.new_password || !passwordData.confirm_password) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      toast({
        title: "Mots de passe différents",
        description: "Le nouveau mot de passe et la confirmation ne correspondent pas",
        variant: "destructive"
      });
      return;
    }

    try {
      // Appeler l'API backend pour changer le mot de passe
      await axios.put(`${API}/${tenantSlug}/users/${user.id}/password`, {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });
      
      toast({
        title: "Mot de passe modifié",
        description: "Votre mot de passe a été mis à jour avec succès",
        variant: "success"
      });
      setShowPasswordModal(false);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Impossible de modifier le mot de passe";
      toast({
        title: "Erreur",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const getFormationName = (formationId) => {
    const formation = formations.find(f => f.id === formationId);
    return formation ? formation.nom : formationId;
  };

  if (loading) return <div className="loading" data-testid="profile-loading">Chargement du profil...</div>;

  return (
    <div className="mon-profil">
      <div className="profile-header">
        <h1 data-testid="profile-title">Mon profil</h1>
        <p>Gérez vos informations personnelles et paramètres de compte</p>
      </div>

      <div className="profile-content">
        <div className="profile-main">
          {/* Informations personnelles - Modifiables par tous */}
          <div className="profile-section">
            <div className="section-header">
              <h2>Informations personnelles</h2>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant={isEditing ? "secondary" : "default"}
                data-testid="edit-profile-btn"
              >
                {isEditing ? 'Annuler' : 'Modifier'}
              </Button>
            </div>

            <div className="profile-form">
              <div className="form-row">
                <div className="form-field">
                  <Label>Prénom</Label>
                  <Input
                    value={profileData.prenom || ''}
                    onChange={(e) => setProfileData({...profileData, prenom: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-prenom-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Nom</Label>
                  <Input
                    value={profileData.nom || ''}
                    onChange={(e) => setProfileData({...profileData, nom: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-nom-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <Label>Email</Label>
                  <Input
                    value={profileData.email || ''}
                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-email-input"
                  />
                </div>
                <div className="form-field">
                  <Label>Téléphone</Label>
                  <Input
                    value={profileData.telephone || ''}
                    onChange={(e) => setProfileData({...profileData, telephone: e.target.value})}
                    disabled={!isEditing}
                    data-testid="profile-phone-input"
                  />
                </div>
              </div>

              <div className="form-field">
                <Label>Adresse</Label>
                <Input
                  value={profileData.adresse || ''}
                  onChange={(e) => setProfileData({...profileData, adresse: e.target.value})}
                  disabled={!isEditing}
                  placeholder="123 Rue Principale, Ville, Province"
                  data-testid="profile-address-input"
                />
              </div>

              <div className="form-field">
                <Label>Contact d'urgence</Label>
                <Input
                  value={profileData.contact_urgence || ''}
                  onChange={(e) => setProfileData({...profileData, contact_urgence: e.target.value})}
                  disabled={!isEditing}
                  placeholder="Nom et téléphone du contact d'urgence"
                  data-testid="profile-emergency-input"
                />
              </div>

              {/* Heures max pour temps partiel */}
              {userProfile?.type_emploi === 'temps_partiel' && (
                <div className="form-field">
                  <Label>Heures maximum par semaine</Label>
                  <div className="heures-max-input">
                    <Input
                      type="number"
                      min="5"
                      max="168"
                      value={profileData.heures_max_semaine || userProfile?.heures_max_semaine || 25}
                      onChange={(e) => setProfileData({...profileData, heures_max_semaine: parseInt(e.target.value)})}
                      disabled={!isEditing}
                      data-testid="profile-heures-max-input"
                    />
                    <span className="heures-max-unit">heures/semaine</span>
                  </div>
                  <small className="heures-max-help">
                    Indiquez le nombre maximum d'heures que vous souhaitez travailler par semaine (5-168h). Cette limite sera respectée lors de l'attribution automatique des gardes.
                  </small>
                </div>
              )}

              {isEditing && (
                <div className="form-actions">
                  <Button onClick={handleSaveProfile} data-testid="save-profile-btn">
                    Sauvegarder les modifications
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Informations verrouillées */}
          <div className="profile-section">
            <h2>Informations d'emploi</h2>
            <div className="locked-info">
              <div className="info-item">
                <span className="info-label">Numéro d'employé:</span>
                <span className="info-value locked" data-testid="profile-employee-id">
                  {userProfile?.numero_employe} 🔒
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Grade:</span>
                <span className="info-value locked" data-testid="profile-grade">
                  {userProfile?.grade} 🔒
                  {userProfile?.fonction_superieur && <span className="fonction-sup-profile"> + Fonction supérieur</span>}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Type d'emploi:</span>
                <span className="info-value locked" data-testid="profile-employment-type">
                  {userProfile?.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'} 🔒
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Date d'embauche:</span>
                <span className="info-value locked" data-testid="profile-hire-date">
                  {userProfile?.date_embauche} 🔒
                </span>
              </div>
            </div>
          </div>

          {/* Formations */}
          <div className="profile-section">
            <h2>Formations et certifications</h2>
            <div className="formations-list" data-testid="profile-formations">
              {userProfile?.formations?.length > 0 ? (
                <div className="formations-grid">
                  {userProfile.formations.map((formationId, index) => (
                    <div key={index} className="formation-item">
                      <span className="formation-name">{getFormationName(formationId)}</span>
                      <span className="formation-status">Certifié ✅</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-formations">
                  <p>Aucune formation enregistrée</p>
                  <p className="text-muted">Contactez votre superviseur pour l'inscription aux formations</p>
                </div>
              )}
            </div>
          </div>

          {/* Mes Tailles EPI */}
          <div className="profile-section">
            <div className="section-header">
              <h2>🛡️ Mes Tailles EPI</h2>
              <Button
                onClick={() => setIsEditingEPI(!isEditingEPI)}
                variant={isEditingEPI ? "secondary" : "default"}
                data-testid="edit-epi-tailles-btn"
              >
                {isEditingEPI ? 'Annuler' : 'Modifier'}
              </Button>
            </div>

            <p className="section-description" style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
              Sélectionnez les tailles pour chaque équipement. Les autres détails seront gérés dans le module EPI.
            </p>

            <div className="epi-tailles-grid">
              {getAllEPITypes().map(epiType => {
                const existingEPI = myEPIs.find(e => e.type_epi === epiType.id);
                return (
                  <div key={epiType.id} className="epi-taille-item">
                    <span className="epi-taille-icon">{epiType.icone}</span>
                    <div className="epi-taille-info">
                      <Label>{epiType.nom}</Label>
                      <Input
                        value={epiTailles[epiType.id] || (existingEPI ? existingEPI.taille : '')}
                        onChange={(e) => setEpiTailles({...epiTailles, [epiType.id]: e.target.value})}
                        disabled={!isEditingEPI}
                        placeholder="Saisir la taille"
                        className="epi-taille-input"
                        data-testid={`epi-taille-${epiType.id}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {isEditingEPI && (
              <div className="form-actions">
                <Button onClick={handleSaveEPITailles} data-testid="save-epi-tailles-btn">
                  💾 Sauvegarder les tailles
                </Button>
              </div>
            )}
          </div>

          {/* Sécurité du compte */}
          <div className="profile-section">
            <h2>Sécurité du compte</h2>
            <div className="security-options">
              <Button 
                variant="outline" 
                onClick={() => setShowPasswordModal(true)}
                data-testid="change-password-btn"
              >
                🔒 Changer le mot de passe
              </Button>
            </div>
          </div>
        </div>

        {/* Sidebar avec statistiques personnelles */}
        <div className="profile-sidebar">
          <div className="profile-card">
            <div className="profile-avatar">
              <span className="avatar-large">👤</span>
            </div>
            <h3 data-testid="profile-fullname">{userProfile?.prenom} {userProfile?.nom}</h3>
            <p className="profile-role">
              {user?.role === 'admin' ? 'Administrateur' : 
               user?.role === 'superviseur' ? 'Superviseur' : 'Employé'}
            </p>
            <p className="profile-grade">{userProfile?.grade}</p>
          </div>

          <div className="profile-stats">
            <h3>Statistiques personnelles</h3>
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-icon">🏆</span>
                <div className="stat-content">
                  <span className="stat-value">{monthlyStats.gardes_ce_mois}</span>
                  <span className="stat-label">Gardes ce mois</span>
                </div>
              </div>
              <div className="stat-item">
                <span className="stat-icon">⏱️</span>
                <div className="stat-content">
                  <span className="stat-value">{monthlyStats.heures_travaillees}h</span>
                  <span className="stat-label">Heures travaillées</span>
                </div>
              </div>
              <div className="stat-item">
                <span className="stat-icon">📜</span>
                <div className="stat-content">
                  <span className="stat-value">{monthlyStats.certifications}</span>
                  <span className="stat-label">Certifications</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de changement de mot de passe */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="change-password-modal">
            <div className="modal-header">
              <h3>🔒 Changer le mot de passe</h3>
              <Button variant="ghost" onClick={() => setShowPasswordModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="password-form">
                <div className="form-field">
                  <Label>Mot de passe actuel *</Label>
                  <Input
                    type="password"
                    value={passwordData.current_password}
                    onChange={(e) => setPasswordData({...passwordData, current_password: e.target.value})}
                    data-testid="current-password-input"
                  />
                </div>

                <div className="form-field">
                  <Label>Nouveau mot de passe *</Label>
                  <Input
                    type="password"
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData({...passwordData, new_password: e.target.value})}
                    data-testid="new-password-input"
                  />
                  <small className="password-requirements">
                    8 caractères minimum, 1 majuscule, 1 chiffre, 1 caractère spécial (!@#$%^&*+-?())
                  </small>
                </div>

                <div className="form-field">
                  <Label>Confirmer le nouveau mot de passe *</Label>
                  <Input
                    type="password"
                    value={passwordData.confirm_password}
                    onChange={(e) => setPasswordData({...passwordData, confirm_password: e.target.value})}
                    data-testid="confirm-password-input"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowPasswordModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleChangePassword} data-testid="save-password-btn">
                  Modifier le mot de passe
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Rapports Component optimisé - Analytics et exports avancés
const Rapports = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const [statistiques, setStatistiques] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('vue-ensemble');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [epiAlerts, setEpiAlerts] = useState([]);
  const [loadingEPI, setLoadingEPI] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchStatistiques();
    }
  }, [user, tenantSlug]);

  useEffect(() => {
    if (activeSection === 'epi' && user?.role === 'admin') {
      fetchEPIData();
    }
  }, [activeSection, user, tenantSlug]);

  const fetchStatistiques = async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const statsData = await apiGet(tenantSlug, '/rapports/statistiques-avancees');
      setStatistiques(statsData);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les statistiques",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEPIData = async () => {
    if (!tenantSlug) return;
    
    setLoadingEPI(true);
    try {
      const alertsData = await apiGet(tenantSlug, '/epi/alertes/all');
      setEpiAlerts(alertsData);
    } catch (error) {
      console.error('Erreur lors du chargement des données EPI:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données EPI",
        variant: "destructive"
      });
    } finally {
      setLoadingEPI(false);
    }
  };

  const getEPINom = (typeEpi) => {
    const noms = {
      'casque': 'Casque',
      'bottes': 'Bottes',
      'veste_bunker': 'Veste Bunker',
      'pantalon_bunker': 'Pantalon Bunker',
      'gants': 'Gants',
      'masque_apria': 'Facial APRIA',
      'cagoule': 'Cagoule Anti-Particules'
    };
    return noms[typeEpi] || typeEpi;
  };

  const handleExportPDF = async (typeRapport = "general", userId = null) => {
    try {
      const params = new URLSearchParams({ type_rapport: typeRapport });
      if (userId) params.append('user_id', userId);
      
      const responseData = await apiGet(tenantSlug, `/rapports/export-pdf?${params}`);
      
      // Décoder le base64 et créer le téléchargement
      const binaryString = atob(responseData.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = responseData.filename;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export PDF réussi",
        description: `Rapport ${typeRapport} téléchargé`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur export PDF",
        description: "Impossible de générer le rapport PDF",
        variant: "destructive"
      });
    }
  };

  const handleExportExcel = async (typeRapport = "general") => {
    try {
      const responseData = await apiGet(tenantSlug, `/rapports/export-excel?type_rapport=${typeRapport}`);
      
      // Décoder le base64 et créer le téléchargement
      const binaryString = atob(responseData.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = responseData.filename;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Excel réussi",
        description: `Rapport ${typeRapport} téléchargé`,
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Erreur export Excel",
        description: "Impossible de générer le rapport Excel",
        variant: "destructive"
      });
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="access-denied">
        <h1>Accès refusé</h1>
        <p>Cette section est réservée aux administrateurs.</p>
      </div>
    );
  }

  if (loading) return <div className="loading" data-testid="rapports-loading">Chargement des rapports...</div>;

  return (
    <div className="rapports-optimized">
      <div className="rapports-header">
        <div>
          <h1 data-testid="rapports-title">Rapports et analyses</h1>
          <p>Statistiques détaillées, indicateurs de performance et exports</p>
        </div>
        <div className="export-actions-header">
          <Button 
            variant="default" 
            onClick={() => handleExportPDF('general')}
            data-testid="export-pdf-general-btn"
          >
            📄 Export PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={() => handleExportExcel('general')}
            data-testid="export-excel-general-btn"
          >
            📊 Export Excel
          </Button>
        </div>
      </div>

      {/* Navigation sections */}
      <div className="rapports-sections">
        <button
          className={`section-button ${activeSection === 'vue-ensemble' ? 'active' : ''}`}
          onClick={() => setActiveSection('vue-ensemble')}
          data-testid="section-vue-ensemble"
        >
          📊 Vue d'ensemble
        </button>
        <button
          className={`section-button ${activeSection === 'par-role' ? 'active' : ''}`}
          onClick={() => setActiveSection('par-role')}
          data-testid="section-par-role"
        >
          👥 Par rôle
        </button>
        <button
          className={`section-button ${activeSection === 'par-employe' ? 'active' : ''}`}
          onClick={() => setActiveSection('par-employe')}
          data-testid="section-par-employe"
        >
          👤 Par employé
        </button>
        <button
          className={`section-button ${activeSection === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveSection('analytics')}
          data-testid="section-analytics"
        >
          📈 Analytics
        </button>
        <button
          className={`section-button ${activeSection === 'epi' ? 'active' : ''}`}
          onClick={() => setActiveSection('epi')}
          data-testid="section-epi"
        >
          🛡️ EPI
        </button>
      </div>

      {/* Contenu des sections */}
      <div className="rapports-content">
        {activeSection === 'vue-ensemble' && statistiques && (
          <div className="vue-ensemble">
            <h2>📊 Vue d'ensemble générale</h2>
            
            {/* KPI Cards */}
            <div className="kpi-grid">
              <div className="kpi-card personnel">
                <div className="kpi-icon">👥</div>
                <div className="kpi-content">
                  <span className="kpi-value">{statistiques.statistiques_generales.personnel_actif}</span>
                  <span className="kpi-label">Personnel actif</span>
                  <span className="kpi-detail">sur {statistiques.statistiques_generales.personnel_total} total</span>
                </div>
              </div>

              <div className="kpi-card assignations">
                <div className="kpi-icon">📅</div>
                <div className="kpi-content">
                  <span className="kpi-value">{statistiques.statistiques_generales.assignations_mois}</span>
                  <span className="kpi-label">Assignations ce mois</span>
                  <span className="kpi-detail">Septembre 2025</span>
                </div>
              </div>

              <div className="kpi-card couverture">
                <div className="kpi-icon">📊</div>
                <div className="kpi-content">
                  <span className="kpi-value">{statistiques.statistiques_generales.taux_couverture}%</span>
                  <span className="kpi-label">Taux de couverture</span>
                  <span className="kpi-detail">Efficacité planning</span>
                </div>
              </div>

              <div className="kpi-card formations">
                <div className="kpi-icon">📚</div>
                <div className="kpi-content">
                  <span className="kpi-value">{statistiques.statistiques_generales.formations_disponibles}</span>
                  <span className="kpi-label">Formations disponibles</span>
                  <span className="kpi-detail">Compétences actives</span>
                </div>
              </div>
            </div>

            {/* Export options */}
            <div className="export-section">
              <h3>📤 Options d'export</h3>
              <div className="export-grid">
                <div className="export-option">
                  <h4>📄 Rapport PDF</h4>
                  <p>Rapport complet avec graphiques et analyses</p>
                  <Button onClick={() => handleExportPDF('general')} data-testid="export-pdf-vue-ensemble">
                    Télécharger PDF
                  </Button>
                </div>
                <div className="export-option">
                  <h4>📊 Rapport Excel</h4>
                  <p>Données détaillées pour analyse personnalisée</p>
                  <Button onClick={() => handleExportExcel('general')} data-testid="export-excel-vue-ensemble">
                    Télécharger Excel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'par-role' && statistiques && (
          <div className="par-role">
            <h2>👥 Statistiques par rôle</h2>
            
            <div className="roles-grid">
              {Object.entries(statistiques.statistiques_par_role).map(([role, stats]) => (
                <div key={role} className={`role-card ${role}`}>
                  <div className="role-header">
                    <h3>
                      {role === 'admin' ? '👑 Administrateurs' : 
                       role === 'superviseur' ? '🎖️ Superviseurs' : '👤 Employés'}
                    </h3>
                    <span className="role-count">{stats.nombre_utilisateurs}</span>
                  </div>
                  <div className="role-stats">
                    <div className="role-stat">
                      <span className="stat-label">Assignations</span>
                      <span className="stat-value">{stats.assignations_totales}</span>
                    </div>
                    <div className="role-stat">
                      <span className="stat-label">Heures moy.</span>
                      <span className="stat-value">{stats.heures_moyennes}h</span>
                    </div>
                    <div className="role-stat">
                      <span className="stat-label">Formations</span>
                      <span className="stat-value">{stats.formations_completees}</span>
                    </div>
                  </div>
                  <div className="role-actions">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleExportPDF('role', role)}
                      data-testid={`export-role-${role}`}
                    >
                      📄 Export {role}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'par-employe' && statistiques && (
          <div className="par-employe">
            <h2>👤 Statistiques par employé</h2>
            
            <div className="employee-selector">
              <Label>Sélectionner un employé pour export individuel :</Label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="form-select"
                data-testid="employee-select"
              >
                <option value="">Choisir un employé...</option>
                {statistiques.statistiques_par_employe.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nom} ({emp.grade} - {emp.role})
                  </option>
                ))}
              </select>
              {selectedEmployee && (
                <div className="individual-export">
                  <Button 
                    variant="default"
                    onClick={() => handleExportPDF('employe', selectedEmployee)}
                    data-testid="export-individual-pdf"
                  >
                    📄 Export PDF individuel
                  </Button>
                </div>
              )}
            </div>

            {/* Tableau employés */}
            <div className="employees-table">
              <div className="table-header">
                <div className="header-cell">EMPLOYÉ</div>
                <div className="header-cell">RÔLE</div>
                <div className="header-cell">ASSIGNATIONS</div>
                <div className="header-cell">DISPONIBILITÉS</div>
                <div className="header-cell">FORMATIONS</div>
                <div className="header-cell">HEURES</div>
                <div className="header-cell">ACTIONS</div>
              </div>
              
              {statistiques.statistiques_par_employe.map(emp => (
                <div key={emp.id} className="employee-row" data-testid={`employee-${emp.id}`}>
                  <div className="employee-cell">
                    <span className="employee-name">{emp.nom}</span>
                    <span className="employee-grade">{emp.grade}</span>
                  </div>
                  <div className="role-cell">
                    <span className={`role-badge ${emp.role}`}>
                      {emp.role === 'admin' ? '👑' : emp.role === 'superviseur' ? '🎖️' : '👤'}
                    </span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-number">{emp.assignations_count}</span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-number">{emp.disponibilites_count}</span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-number">{emp.formations_count}</span>
                  </div>
                  <div className="stat-cell">
                    <span className="stat-number">{emp.heures_estimees}h</span>
                  </div>
                  <div className="actions-cell">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleExportPDF('employe', emp.id)}
                      data-testid={`export-employee-${emp.id}`}
                    >
                      📄
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'analytics' && (
          <div className="analytics">
            <h2>📈 Analytics avancées</h2>
            
            <div className="charts-section">
              <div className="chart-container">
                <h3>Évolution des assignations</h3>
                <div className="chart-placeholder">
                  <div className="chart-mock">
                    <div className="chart-bar" style={{height: '60%'}}>Jan</div>
                    <div className="chart-bar" style={{height: '75%'}}>Fév</div>
                    <div className="chart-bar" style={{height: '85%'}}>Mar</div>
                    <div className="chart-bar" style={{height: '90%'}}>Avr</div>
                    <div className="chart-bar" style={{height: '95%'}}>Sep</div>
                  </div>
                </div>
              </div>

              <div className="chart-container">
                <h3>Distribution par grade</h3>
                <div className="pie-chart-mock">
                  <div className="pie-segment directeur">Directeur 35%</div>
                  <div className="pie-segment capitaine">Capitaine 28%</div>
                  <div className="pie-segment lieutenant">Lieutenant 22%</div>
                  <div className="pie-segment pompier">Pompier 15%</div>
                </div>
              </div>
            </div>

            <div className="analytics-exports">
              <Button 
                variant="outline"
                onClick={() => handleExportPDF('analytics')}
                data-testid="export-analytics-pdf"
              >
                📄 Export Analytics PDF
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleExportExcel('analytics')}
                data-testid="export-analytics-excel"
              >
                📊 Export Analytics Excel
              </Button>
            </div>
          </div>
        )}

        {/* Section EPI */}
        {activeSection === 'epi' && (
          <div className="rapport-epi">
            <h2>🛡️ Rapport EPI</h2>
            
            {loadingEPI ? (
              <div className="loading">Chargement des données EPI...</div>
            ) : (
              <>
                {/* KPI Cards EPI */}
                <div className="kpi-grid">
                  <div className="kpi-card epi-expiration">
                    <div className="kpi-icon">⏰</div>
                    <div className="kpi-content">
                      <span className="kpi-value">{epiAlerts.filter(a => a.type === 'expiration').length}</span>
                      <span className="kpi-label">Expirations proches</span>
                      <span className="kpi-detail">Dans les 30 jours</span>
                    </div>
                  </div>

                  <div className="kpi-card epi-inspection">
                    <div className="kpi-icon">🔍</div>
                    <div className="kpi-content">
                      <span className="kpi-value">{epiAlerts.filter(a => a.type === 'inspection').length}</span>
                      <span className="kpi-label">Inspections à venir</span>
                      <span className="kpi-detail">Dans les 14 jours</span>
                    </div>
                  </div>

                  <div className="kpi-card epi-haute-priorite">
                    <div className="kpi-icon">🚨</div>
                    <div className="kpi-content">
                      <span className="kpi-value">{epiAlerts.filter(a => a.priorite === 'haute').length}</span>
                      <span className="kpi-label">Haute priorité</span>
                      <span className="kpi-detail">Action urgente requise</span>
                    </div>
                  </div>
                </div>

                {/* Table des alertes EPI */}
                {epiAlerts.length > 0 ? (
                  <div className="rapport-table-section">
                    <h3>Alertes EPI détaillées</h3>
                    <div className="rapport-table-wrapper">
                      <table className="rapport-table">
                        <thead>
                          <tr>
                            <th>Priorité</th>
                            <th>Employé</th>
                            <th>Type EPI</th>
                            <th>Type d'alerte</th>
                            <th>Échéance</th>
                            <th>Jours restants</th>
                          </tr>
                        </thead>
                        <tbody>
                          {epiAlerts.map((alert, index) => (
                            <tr key={index} className={`priority-${alert.priorite}`}>
                              <td>
                                <span className={`priority-badge ${alert.priorite}`}>
                                  {alert.priorite === 'haute' ? '🚨 Haute' : '⚠️ Moyenne'}
                                </span>
                              </td>
                              <td>{alert.employe_nom}</td>
                              <td>{getEPINom(alert.type_epi)}</td>
                              <td>{alert.type === 'expiration' ? '⏰ Expiration' : '🔍 Inspection'}</td>
                              <td>
                                {alert.type === 'expiration' ? alert.date_expiration : alert.date_inspection}
                              </td>
                              <td>
                                <span className={`days-remaining ${alert.jours_restants <= 7 ? 'urgent' : ''}`}>
                                  {alert.jours_restants} jour(s)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="no-alerts-message">
                    <p>✅ Aucune alerte EPI pour le moment</p>
                    <p>Tous les équipements sont à jour</p>
                  </div>
                )}

                {/* Exports */}
                <div className="analytics-exports">
                  <Button 
                    variant="outline"
                    onClick={() => handleExportPDF('epi')}
                    data-testid="export-epi-pdf"
                  >
                    📄 Export EPI PDF
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => handleExportExcel('epi')}
                    data-testid="export-epi-excel"
                  >
                    📊 Export EPI Excel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Main Application Layout
const AppLayout = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [managingUserDisponibilites, setManagingUserDisponibilites] = useState(null);
  const { user } = useAuth();
  const { tenantSlug } = useTenant();

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'personnel':
        return <Personnel 
          setCurrentPage={setCurrentPage}
          setManagingUserDisponibilites={setManagingUserDisponibilites}
        />;
      case 'epi':
        return <ModuleEPI user={user} />;
      case 'planning':
        return <Planning />;
      case 'remplacements':
        return <Remplacements />;
      case 'disponibilites':
        return <MesDisponibilites 
          user={user}
          managingUser={managingUserDisponibilites}
          setCurrentPage={setCurrentPage}
          setManagingUserDisponibilites={setManagingUserDisponibilites}
        />;
      case 'formations':
        return <Formations />;
      case 'rapports':
        return <Rapports />;
      case 'parametres':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Parametres user={user} tenantSlug={tenantSlug} />
          </Suspense>
        );
      case 'monprofil':
        return <MonProfil />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="main-content">
        {renderCurrentPage()}
      </main>
    </div>
  );
};

// Main App Component
const App = () => {
  const { user, loading, logout } = useAuth();
  const { isSuperAdmin } = useTenant();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">Chargement...</div>
      </div>
    );
  }

  // Si l'utilisateur est un Super-Admin, afficher le dashboard super-admin
  if (user && isSuperAdmin) {
    return (
      <div className="App">
        <Suspense fallback={<LoadingComponent />}>
          <SuperAdminDashboard onLogout={logout} />
        </Suspense>
        <Toaster />
      </div>
    );
  }

  // Sinon, afficher l'interface normale
  return (
    <div className="App">
      {user ? <AppLayout /> : <Login />}
      <Toaster />
    </div>
  );
};

// Root App with Providers
const AppWithProviders = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default AppWithProviders;