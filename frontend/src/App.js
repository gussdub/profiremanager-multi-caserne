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

// Module EPI Component - Vue différente selon le rôle


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
        inspecteur_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
        inspecteur_id: user?.id || ''
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
            <h3>Historique par EPI</h3>
            {epis.filter(e => e.statut !== 'Retiré').map(epi => (
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
            ))}
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
            {epis.filter(e => e.statut !== 'Retiré').map(epi => (
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
            ))}
          </div>
        </div>
      )}

      {/* ONGLET RAPPORTS */}
      {activeTab === 'rapports' && (
        <div className="epi-rapports">
          {!rapportConformite ? (
            <div style={{textAlign: 'center', padding: '3rem'}}>
              <div className="loading-spinner"></div>
              <p>Chargement des rapports...</p>
            </div>
          ) : (
            <>
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
  const [stats, setStats] = useState(null);
  const [activiteRecente, setActiviteRecente] = useState([]);
  const [statistiquesDetaillees, setStatistiquesDetaillees] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const { tenantSlug } = useTenant();

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!tenantSlug) return;
      
      try {
        const [statsData, rapportsData, usersData] = await Promise.all([
          apiGet(tenantSlug, '/statistiques'),
          user.role === 'admin' ? apiGet(tenantSlug, '/rapports/statistiques-avancees') : Promise.resolve(null),
          user.role !== 'employe' ? apiGet(tenantSlug, '/users') : Promise.resolve([])
        ]);
        
        setStats(statsData);
        setStatistiquesDetaillees(rapportsData);
        
        // Générer activité récente dynamique
        const users = usersData || [];
        const activiteItems = [];
        
        // Dernières assignations (estimation basée sur stats)
        if (statsData.gardes_cette_semaine > 0) {
          activiteItems.push({
            type: 'assignation',
            text: `Assignation automatique effectuée (${statsData.gardes_cette_semaine} gardes)`,
            time: 'Il y a 2h',
            icon: '🤖'
          });
        }
        
        // Nouveau personnel (si créé récemment)
        const nouveauPersonnel = users.filter(u => {
          const creation = new Date(u.created_at);
          const maintenant = new Date();
          const diffHeures = (maintenant - creation) / (1000 * 60 * 60);
          return diffHeures < 24; // Créé dans les 24h
        });
        
        if (nouveauPersonnel.length > 0) {
          activiteItems.push({
            type: 'personnel',
            text: `${nouveauPersonnel.length} nouveau(x) pompier(s) ajouté(s)`,
            time: 'Il y a 4h',
            icon: '👤'
          });
        }
        
        // Formations planifiées
        if (statsData.formations_planifiees > 0) {
          activiteItems.push({
            type: 'formation',
            text: `${statsData.formations_planifiees} formation(s) planifiée(s)`,
            time: 'Hier',
            icon: '🎓'
          });
        }
        
        // Disponibilités mises à jour
        const employesTempsPartiel = users.filter(u => u.type_emploi === 'temps_partiel');
        if (employesTempsPartiel.length > 0) {
          activiteItems.push({
            type: 'disponibilite',
            text: `Disponibilités mises à jour (${employesTempsPartiel.length} employé(s) temps partiel)`,
            time: 'Il y a 6h',
            icon: '📅'
          });
        }
        
        setActiviteRecente(activiteItems.slice(0, 5)); // Max 5 items
        
      } catch (error) {
        console.error('Erreur lors du chargement du tableau de bord:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, tenantSlug]);

  const getPersonnelParType = () => {
    if (!statistiquesDetaillees) return { temps_plein: 0, temps_partiel: 0 };
    
    const stats = statistiquesDetaillees.statistiques_par_employe;
    return {
      temps_plein: stats.filter(emp => emp.type_emploi === 'temps_plein').length,
      temps_partiel: stats.filter(emp => emp.type_emploi === 'temps_partiel').length
    };
  };

  const getTauxActivite = () => {
    if (!stats) return 0;
    return stats.personnel_actif > 0 ? Math.round((stats.personnel_actif / stats.personnel_actif) * 100) : 0;
  };

  if (loading) return <div className="loading" data-testid="dashboard-loading">Chargement...</div>;

  const personnelTypes = getPersonnelParType();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1 data-testid="dashboard-title">Tableau de bord</h1>
        <p>Bienvenue, {user?.prenom} {user?.nom} - {new Date().toLocaleDateString('fr-FR', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>
      </div>

      {/* Statistiques principales - 100% dynamiques */}
      <div className="stats-grid">
        <div className="stat-card personnel">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>Personnel Actif</h3>
            <p className="stat-number" data-testid="stat-personnel">{stats?.personnel_actif || 0}</p>
            <p className="stat-label">Pompiers en service</p>
            <p className="stat-detail">
              {personnelTypes.temps_plein} temps plein, {personnelTypes.temps_partiel} temps partiel
            </p>
          </div>
        </div>

        <div className="stat-card gardes">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <h3>Gardes Cette Semaine</h3>
            <p className="stat-number" data-testid="stat-gardes">{stats?.gardes_cette_semaine || 0}</p>
            <p className="stat-label">Assignations planifiées</p>
            <p className="stat-detail">
              Du {new Date().toLocaleDateString('fr-FR')} au {new Date(Date.now() + 6*24*60*60*1000).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>

        <div className="stat-card formations">
          <div className="stat-icon">🎓</div>
          <div className="stat-content">
            <h3>Formations Planifiées</h3>
            <p className="stat-number" data-testid="stat-formations">{stats?.formations_planifiees || 0}</p>
            <p className="stat-label">Sessions à venir</p>
            <p className="stat-detail">Inscriptions ouvertes</p>
          </div>
        </div>

        <div className="stat-card couverture">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3>Taux de Couverture</h3>
            <p className="stat-number" data-testid="stat-couverture">{stats?.taux_couverture || 0}%</p>
            <p className="stat-label">Efficacité du planning</p>
            <p className="stat-detail">
              {stats?.taux_couverture >= 90 ? '🟢 Excellent' : 
               stats?.taux_couverture >= 75 ? '🟡 Bon' : '🔴 À améliorer'}
            </p>
          </div>
        </div>
      </div>

      {/* Activité récente dynamique */}
      <div className="activity-section">
        <h2>Activité Récente</h2>
        <div className="activity-list">
          {activiteRecente.length > 0 ? (
            activiteRecente.map((item, index) => (
              <div key={index} className="activity-item">
                <span className="activity-icon">{item.icon}</span>
                <span className="activity-text">{item.text}</span>
                <span className="activity-time">{item.time}</span>
              </div>
            ))
          ) : (
            <div className="no-activity">
              <p>Aucune activité récente</p>
              <small>Les actions récentes apparaîtront ici</small>
            </div>
          )}
        </div>
      </div>

      {/* Statistiques détaillées selon le rôle */}
      <div className="monthly-stats">
        <h2>Statistiques du Mois - {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
        <div className="monthly-grid">
          <div className="monthly-item">
            <span className="monthly-label">Heures de garde totales</span>
            <span className="monthly-value" data-testid="monthly-hours">{stats?.heures_travaillees || 0}h</span>
          </div>
          <div className="monthly-item">
            <span className="monthly-label">Remplacements effectués</span>
            <span className="monthly-value" data-testid="monthly-replacements">{stats?.remplacements_effectues || 0}</span>
          </div>
          <div className="monthly-item">
            <span className="monthly-label">Taux d'activité</span>
            <span className="monthly-value" data-testid="monthly-activity">{getTauxActivite()}%</span>
          </div>
          <div className="monthly-item">
            <span className="monthly-label">Disponibilités configurées</span>
            <span className="monthly-value" data-testid="monthly-disponibilites">
              {personnelTypes.temps_partiel > 0 ? `${personnelTypes.temps_partiel} employé(s)` : 'Aucune'}
            </span>
          </div>
        </div>
      </div>

      {/* Fin du Dashboard */}
      {user.role === 'employe' && (
        <div className="employee-dashboard-section">
          <h2>👤 Mon activité</h2>
          <div className="personal-stats">
            <div className="personal-stat-item">
              <span className="personal-stat-label">Mes gardes ce mois</span>
              <span className="personal-stat-value">
                {statistiquesDetaillees?.statistiques_par_employe?.find(emp => emp.id === user.id)?.assignations_count || 0}
              </span>
            </div>
            <div className="personal-stat-item">
              <span className="personal-stat-label">Mes heures travaillées</span>
              <span className="personal-stat-value">
                {statistiquesDetaillees?.statistiques_par_employe?.find(emp => emp.id === user.id)?.heures_estimees || 0}h
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Personnel Component complet
const Personnel = ({ setCurrentPage, setManagingUserDisponibilites }) => {
  const [users, setUsers] = useState([]);
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDisponibilitesModal, setShowDisponibilitesModal] = useState(false);
  const [showManageDisponibilitesModal, setShowManageDisponibilitesModal] = useState(false);
  const [showEPIModal, setShowEPIModal] = useState(false);
  const [showAddEPIModal, setShowAddEPIModal] = useState(false);
  const [showEPIAccordion, setShowEPIAccordion] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [userEPIs, setUserEPIs] = useState([]);
  const [newDisponibilite, setNewDisponibilite] = useState({
    date: new Date().toISOString().split('T')[0],
    heure_debut: '08:00',
    heure_fin: '17:00',
    statut: 'disponible',
    recurrence: false,
    type_recurrence: 'hebdomadaire',
    jours_semaine: [],
    bi_hebdomadaire: false,
    date_fin: ''
  });
  const [editingEPIId, setEditingEPIId] = useState(null);
  const [newEPI, setNewEPI] = useState({
    type_epi: '',
    taille: '',
    date_attribution: new Date().toISOString().split('T')[0],
    etat: 'Neuf',
    date_expiration: '',
    date_prochaine_inspection: '',
    notes: ''
  });
  const [newUser, setNewUser] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    adresse: '',
    contact_urgence: '',
    grade: '',
    fonction_superieur: false,
    type_emploi: '',
    numero_employe: '',
    date_embauche: '',
    taux_horaire: 0,
    formations: [],
    mot_de_passe: ''
  });
  const { toast } = useToast();
  const { tenantSlug } = useTenant();

  const grades = ['Directeur', 'Capitaine', 'Lieutenant', 'Pompier'];

  useEffect(() => {
    const fetchData = async () => {
      if (!tenantSlug) return;
      
      try {
        const [usersData, formationsData] = await Promise.all([
          apiGet(tenantSlug, '/users'),
          apiGet(tenantSlug, '/formations')
        ]);
        setUsers(usersData);
        setFormations(formationsData);
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantSlug]);

  const handleCreateUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.email || !newUser.grade || !newUser.type_emploi || !newUser.date_embauche) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires (marqués d'un *)",
        variant: "destructive"
      });
      return;
    }

    try {
      const userToCreate = {
        ...newUser,
        role: 'employe',
        numero_employe: newUser.numero_employe || `POM${String(Date.now()).slice(-3)}`,
        mot_de_passe: 'TempPassword123!' // Mot de passe temporaire par défaut
      };

      await apiPost(tenantSlug, '/users', userToCreate);
      toast({
        title: "Pompier créé",
        description: "Le nouveau pompier a été ajouté avec succès. Configurez son accès dans Paramètres > Comptes d'Accès",
        variant: "success"
      });
      
      setShowCreateModal(false);
      resetNewUser();
      
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de créer le pompier",
        variant: "destructive"
      });
    }
  };

  const resetNewUser = () => {
    setNewUser({
      nom: '',
      prenom: '',
      email: '',
      telephone: '',
      adresse: '',
      contact_urgence: '',
      grade: '',
      fonction_superieur: false,
      type_emploi: '',
      numero_employe: '',
      date_embauche: new Date().toISOString().split('T')[0],
      taux_horaire: 0,
      formations: [],
      mot_de_passe: ''
    });
  };

  const handleViewUser = async (user) => {
    setSelectedUser(user);
    // Charger les EPI de l'utilisateur
    try {
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setUserEPIs(episData);
    } catch (error) {
      console.error('Erreur lors du chargement des EPI:', error);
      setUserEPIs([]);
    }
    setShowViewModal(true);
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setNewUser({
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      adresse: user.adresse || '',
      contact_urgence: user.contact_urgence || '',
      grade: user.grade,
      fonction_superieur: user.fonction_superieur || false,
      type_emploi: user.type_emploi,
      numero_employe: user.numero_employe,
      date_embauche: user.date_embauche,
      formations: user.formations || [],
      mot_de_passe: ''
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    if (!newUser.nom || !newUser.prenom || !newUser.email || !newUser.grade || !newUser.type_emploi) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      const userToUpdate = {
        ...newUser,
        role: selectedUser.role, // Préserver le rôle existant
        statut: selectedUser.statut, // Préserver le statut existant
        mot_de_passe: newUser.mot_de_passe || 'unchanged' // Mot de passe optionnel
      };

      await apiPut(tenantSlug, `/users/${selectedUser.id}`, userToUpdate);
      toast({
        title: "Pompier mis à jour",
        description: "Les informations ont été mises à jour avec succès",
        variant: "success"
      });
      setShowEditModal(false);
      
      // Reload users list
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: "Erreur de modification",
        description: error.detail || error.message || "Impossible de mettre à jour le pompier",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce pompier ?")) return;

    try {
      await apiDelete(tenantSlug, `/users/${userId}`);
      toast({
        title: "Pompier supprimé",
        description: "Le pompier a été supprimé avec succès",
        variant: "success"
      });
      const usersData = await apiGet(tenantSlug, '/users');
      setUsers(usersData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le pompier",
        variant: "destructive"
      });
    }
  };

  const handleViewDisponibilites = async (user) => {
    if (user.type_emploi !== 'temps_partiel') {
      toast({
        title: "Information",
        description: "Les disponibilités ne concernent que les employés à temps partiel",
        variant: "default"
      });
      return;
    }

    try {
      const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${user.id}`);
      setUserDisponibilites(disponibilitesData);
      setSelectedUser(user);
      setShowDisponibilitesModal(true);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les disponibilités",
        variant: "destructive"
      });
    }
  };

  const handleManageDisponibilites = async (user) => {
    if (user.type_emploi !== 'temps_partiel') {
      toast({
        title: "Information",
        description: "Les disponibilités ne concernent que les employés à temps partiel",
        variant: "default"
      });
      return;
    }

    // Stocker l'utilisateur et naviguer vers le module disponibilités
    setManagingUserDisponibilites(user);
    setCurrentPage('disponibilites');
  };

  const handleAddDisponibilite = async () => {
    if (!newDisponibilite.date || !newDisponibilite.heure_debut || !newDisponibilite.heure_fin) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs",
        variant: "destructive"
      });
      return;
    }

    // Validation pour récurrence
    if (newDisponibilite.recurrence) {
      if (!newDisponibilite.date_fin) {
        toast({
          title: "Date de fin requise",
          description: "Veuillez spécifier une date de fin pour la récurrence",
          variant: "destructive"
        });
        return;
      }
      if (newDisponibilite.type_recurrence === 'hebdomadaire' && newDisponibilite.jours_semaine.length === 0) {
        toast({
          title: "Jours requis",
          description: "Veuillez sélectionner au moins un jour de la semaine",
          variant: "destructive"
        });
        return;
      }
    }

    try {
      let disponibilitesToCreate = [];

      if (newDisponibilite.recurrence) {
        // Générer toutes les occurrences
        disponibilitesToCreate = generateRecurringDisponibilites(newDisponibilite, selectedUser.id);
      } else {
        // Disponibilité unique
        disponibilitesToCreate = [{
          date: newDisponibilite.date,
          heure_debut: newDisponibilite.heure_debut,
          heure_fin: newDisponibilite.heure_fin,
          statut: newDisponibilite.statut,
          user_id: selectedUser.id
        }];
      }

      // Créer toutes les disponibilités
      for (const dispo of disponibilitesToCreate) {
        await apiPost(tenantSlug, '/disponibilites', dispo);
      }

      toast({
        title: "Disponibilité(s) ajoutée(s)",
        description: `${disponibilitesToCreate.length} disponibilité(s) créée(s) avec succès`
      });

      // Recharger les disponibilités
      const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${selectedUser.id}`);
      setUserDisponibilites(disponibilitesData);

      // Réinitialiser le formulaire
      setNewDisponibilite({
        date: new Date().toISOString().split('T')[0],
        heure_debut: '08:00',
        heure_fin: '17:00',
        statut: 'disponible',
        recurrence: false,
        type_recurrence: 'hebdomadaire',
        jours_semaine: [],
        bi_hebdomadaire: false,
        date_fin: ''
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'ajouter la disponibilité",
        variant: "destructive"
      });
    }
  };

  // Fonction pour générer les disponibilités récurrentes
  const generateRecurringDisponibilites = (config, userId) => {
    const disponibilites = [];
    const startDate = new Date(config.date);
    const endDate = new Date(config.date_fin);

    if (config.type_recurrence === 'hebdomadaire') {
      // Pour chaque jour sélectionné
      config.jours_semaine.forEach(jourIndex => {
        let currentDate = new Date(startDate);
        
        // Trouver le premier jour correspondant
        while (currentDate.getDay() !== jourIndex) {
          currentDate.setDate(currentDate.getDate() + 1);
        }

        let weekCounter = 0;
        // Générer les occurrences
        while (currentDate <= endDate) {
          // Si bi-hebdomadaire, ne créer qu'une semaine sur deux
          if (!config.bi_hebdomadaire || weekCounter % 2 === 0) {
            disponibilites.push({
              date: currentDate.toISOString().split('T')[0],
              heure_debut: config.heure_debut,
              heure_fin: config.heure_fin,
              statut: config.statut,
              user_id: userId
            });
          }
          currentDate.setDate(currentDate.getDate() + 7);
          weekCounter++;
        }
      });
    } else if (config.type_recurrence === 'mensuelle') {
      // Récurrence mensuelle (même jour du mois)
      let currentDate = new Date(startDate);
      const dayOfMonth = startDate.getDate();

      while (currentDate <= endDate) {
        disponibilites.push({
          date: currentDate.toISOString().split('T')[0],
          heure_debut: config.heure_debut,
          heure_fin: config.heure_fin,
          statut: config.statut,
          user_id: userId
        });

        // Passer au mois suivant
        currentDate.setMonth(currentDate.getMonth() + 1);
        // Garder le même jour du mois
        currentDate.setDate(dayOfMonth);
      }
    }

    return disponibilites;
  };

  const handleDeleteDisponibilite = async (disponibiliteId) => {
    try {
      await apiDelete(tenantSlug, `/disponibilites/${disponibiliteId}`);

      toast({
        title: "Disponibilité supprimée",
        description: "La disponibilité a été supprimée avec succès"
      });

      // Recharger les disponibilités
      const disponibilitesData = await apiGet(tenantSlug, `/disponibilites/${selectedUser.id}`);
      setUserDisponibilites(disponibilitesData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la disponibilité",
        variant: "destructive"
      });
    }
  };

  // Fonctions de gestion des EPI
  const handleViewEPI = async (user) => {
    try {
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setUserEPIs(episData);
      setSelectedUser(user);
      setShowEPIModal(true);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de charger les EPI",
        variant: "destructive"
      });
    }
  };

  const handleAddEPI = () => {
    setShowAddEPIModal(true);
  };

  const handleCreateEPI = async () => {
    if (!newEPI.type_epi || !newEPI.taille || !newEPI.date_attribution || !newEPI.date_expiration) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPost(tenantSlug, '/epi', {
        ...newEPI,
        employe_id: selectedUser.id
      });
      
      toast({
        title: "EPI ajouté",
        description: "L'équipement a été ajouté avec succès",
        variant: "success"
      });
      
      setShowAddEPIModal(false);
      resetNewEPI();
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible d'ajouter l'EPI",
        variant: "destructive"
      });
    }
  };

  const handleUpdateEPITaille = async (epiId, newTaille) => {
    try {
      await apiPut(tenantSlug, `/epi/${epiId}`, {
        taille: newTaille
      });
      
      toast({
        title: "Taille mise à jour",
        description: "La taille de l'EPI a été modifiée",
        variant: "success"
      });
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier la taille",
        variant: "destructive"
      });
    }
  };

  const handleDeleteEPI = async (epiId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet EPI ?")) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/epi/${epiId}`);
      
      toast({
        title: "EPI supprimé",
        description: "L'équipement a été supprimé",
        variant: "success"
      });
      
      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${selectedUser.id}`);
      setUserEPIs(episData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'EPI",
        variant: "destructive"
      });
    }
  };

  const resetNewEPI = () => {
    setNewEPI({
      type_epi: '',
      taille: '',
      date_attribution: new Date().toISOString().split('T')[0],
      etat: 'Neuf',
      date_expiration: '',
      date_prochaine_inspection: '',
      notes: ''
    });
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

  const getEtatColor = (etat) => {
    const colors = {
      'Neuf': '#10B981',
      'Bon': '#3B82F6',
      'À remplacer': '#F59E0B',
      'Défectueux': '#EF4444'
    };
    return colors[etat] || '#6B7280';
  };

  const getEPITailleForType = (typeEpi) => {
    const epi = userEPIs.find(e => e.type_epi === typeEpi);
    return epi ? epi.taille : '';
  };

  const getFormationName = (formationId) => {
    const formation = formations.find(f => f.id === formationId);
    return formation ? formation.nom : formationId;
  };

  const handleFormationToggle = (formationId) => {
    const updatedFormations = newUser.formations.includes(formationId)
      ? newUser.formations.filter(id => id !== formationId)
      : [...newUser.formations, formationId];
    
    setNewUser({...newUser, formations: updatedFormations});
  };

  const translateDay = (day) => {
    const translations = {
      'monday': 'Lundi', 'tuesday': 'Mardi', 'wednesday': 'Mercredi',
      'thursday': 'Jeudi', 'friday': 'Vendredi', 'saturday': 'Samedi', 'sunday': 'Dimanche'
    };
    return translations[day] || day;
  };

  const getStatusColor = (statut) => statut === 'Actif' ? '#10B981' : '#EF4444';
  const getGradeColor = (grade) => {
    const colors = {
      'Directeur': '#8B5CF6', 'Capitaine': '#3B82F6', 'Lieutenant': '#F59E0B', 'Pompier': '#10B981'
    };
    return colors[grade] || '#6B7280';
  };

  if (loading) return <div className="loading" data-testid="personnel-loading">Chargement...</div>;

  return (
    <div className="personnel">
      <div className="personnel-header">
        <div>
          <h1 data-testid="personnel-title">Gestion du personnel</h1>
          <p>{users.length} pompier(s) enregistré(s)</p>
        </div>
        <Button 
          className="add-btn" 
          onClick={() => setShowCreateModal(true)}
          data-testid="add-personnel-btn"
        >
          + Nouveau pompier
        </Button>
      </div>

      <div className="personnel-table">
        {/* Vue desktop */}
        <div className="personnel-table-desktop">
          <div className="table-header">
            <div className="header-cell">POMPIER</div>
            <div className="header-cell">GRADE / N° EMPLOYÉ</div>
            <div className="header-cell">CONTACT</div>
            <div className="header-cell">STATUT</div>
            <div className="header-cell">TYPE D'EMPLOI</div>
            <div className="header-cell">FORMATIONS</div>
            <div className="header-cell">ACTIONS</div>
          </div>

          {users.map(user => (
            <div key={user.id} className="table-row" data-testid={`user-row-${user.id}`}>
              <div className="user-cell">
                <div className="user-avatar">
                  <span className="avatar-icon">👤</span>
                </div>
                <div>
                  <p className="user-name">{user.prenom} {user.nom}</p>
                  <p className="user-hire-date">Embauché le {user.date_embauche}</p>
                </div>
              </div>

              <div className="grade-cell">
                <span className="grade" style={{ backgroundColor: getGradeColor(user.grade) }}>
                  {user.grade}
                  {user.fonction_superieur && <span className="fonction-sup">+</span>}
                </span>
                <p className="employee-id">#{user.numero_employe}</p>
                {user.fonction_superieur && (
                  <p className="fonction-superieur-indicator">🎖️ Fonction supérieur</p>
                )}
              </div>

              <div className="contact-cell">
                <p className="user-email">{user.email}</p>
                <p className="user-phone">{user.telephone}</p>
                {user.contact_urgence && (
                  <p className="user-emergency">🚨 {user.contact_urgence}</p>
                )}
              </div>

              <div className="status-cell">
                <span 
                  className="status-badge" 
                  style={{ backgroundColor: getStatusColor(user.statut) }}
                >
                  {user.statut}
                </span>
              </div>

              <div className="employment-cell">
                <span className={`employment-type ${user.type_emploi}`}>
                  {user.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                </span>
                {user.type_emploi === 'temps_partiel' && (
                  <div className="temps-partiel-info">
                    <div className="heures-max-info">
                      <span className="heures-max-label">Max :</span>
                      <span className="heures-max-value">{user.heures_max_semaine || 40}h/sem</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleViewDisponibilites(user)}
                      className="mt-1"
                      data-testid={`view-availability-${user.id}`}
                    >
                      📅 Disponibilités
                    </Button>
                  </div>
                )}
              </div>

              <div className="formations-cell">
                {user.formations?.map((formationId, index) => (
                  <span key={index} className="formation-badge">
                    {getFormationName(formationId)}
                  </span>
                ))}
                {user.formations?.length > 0 && (
                  <p className="formations-count">+{user.formations.length} certifications</p>
                )}
              </div>

              <div className="actions-cell">
                <Button 
                  variant="ghost" 
                  className="action-btn" 
                  onClick={() => handleViewUser(user)}
                  data-testid={`view-user-${user.id}`}
                  title="Visualiser"
                >
                  👁️
                </Button>
                <Button 
                  variant="ghost" 
                  className="action-btn" 
                  onClick={() => handleEditUser(user)}
                  data-testid={`edit-user-${user.id}`}
                  title="Modifier"
                >
                  ✏️
                </Button>
                <Button 
                  variant="ghost" 
                  className="action-btn danger" 
                  onClick={() => handleDeleteUser(user.id)}
                  data-testid={`delete-user-${user.id}`}
                  title="Supprimer"
                >
                  ❌
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Vue mobile - Cartes */}
        <div className="personnel-cards-mobile">
          {users.map(user => (
            <div key={user.id} className="personnel-card-mobile" data-testid={`user-card-mobile-${user.id}`}>
              <div className="card-header-mobile">
                <div className="user-info-mobile">
                  <div className="user-avatar">
                    <span className="avatar-icon">👤</span>
                  </div>
                  <div className="user-details-mobile">
                    <h3>{user.prenom} {user.nom}</h3>
                    <p className="user-grade-mobile">
                      {user.grade} #{user.numero_employe}
                      {user.fonction_superieur && <span className="fonction-sup-mobile">+ Fonction sup.</span>}
                    </p>
                  </div>
                </div>
                <div className="status-mobile">
                  <span 
                    className="status-badge-mobile" 
                    style={{ backgroundColor: getStatusColor(user.statut) }}
                  >
                    {user.statut}
                  </span>
                </div>
              </div>

              <div className="card-details-mobile">
                <div className="detail-row-mobile">
                  <span className="detail-label">📧</span>
                  <span className="detail-value">{user.email}</span>
                </div>
                <div className="detail-row-mobile">
                  <span className="detail-label">📞</span>
                  <span className="detail-value">{user.telephone}</span>
                </div>
                {user.contact_urgence && (
                  <div className="detail-row-mobile">
                    <span className="detail-label">🚨</span>
                    <span className="detail-value">{user.contact_urgence}</span>
                  </div>
                )}
                <div className="detail-row-mobile">
                  <span className="detail-label">💼</span>
                  <span className="detail-value">
                    {user.type_emploi === 'temps_plein' ? 'Temps plein' : `Temps partiel (${user.heures_max_semaine}h/sem)`}
                  </span>
                </div>
                <div className="detail-row-mobile">
                  <span className="detail-label">🎓</span>
                  <span className="detail-value">{user.formations?.length || 0} formation(s)</span>
                </div>
              </div>

              <div className="card-actions-mobile">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleViewUser(user)}
                  data-testid={`view-user-mobile-${user.id}`}
                >
                  👁️ Voir
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => handleEditUser(user)}
                  data-testid={`edit-user-mobile-${user.id}`}
                >
                  ✏️ Modifier
                </Button>
                {user.type_emploi === 'temps_partiel' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleViewDisponibilites(user)}
                    data-testid={`availability-mobile-${user.id}`}
                  >
                    📅 Dispo
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create User Modal - Version optimisée */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-user-modal">
            <div className="modal-header">
              <h3>🚒 Nouveau pompier</h3>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="personnel-form-grid">
                {/* Section 1: Informations personnelles */}
                <div className="form-section">
                  <h4 className="section-title">👤 Informations personnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Prénom *</Label>
                      <Input
                        value={newUser.prenom}
                        onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                        placeholder="Ex: Pierre"
                        data-testid="user-prenom-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nom *</Label>
                      <Input
                        value={newUser.nom}
                        onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                        placeholder="Ex: Dupont"
                        data-testid="user-nom-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      placeholder="ex: pierre.dupont@firemanager.ca"
                      data-testid="user-email-input"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Téléphone</Label>
                      <Input
                        value={newUser.telephone}
                        onChange={(e) => setNewUser({...newUser, telephone: e.target.value})}
                        placeholder="Ex: 514-555-1234"
                        data-testid="user-phone-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Adresse</Label>
                      <Input
                        value={newUser.adresse}
                        onChange={(e) => setNewUser({...newUser, adresse: e.target.value})}
                        placeholder="123 Rue Principale, Ville, Province"
                        data-testid="user-address-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Contact d'urgence</Label>
                    <Input
                      value={newUser.contact_urgence}
                      onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                      placeholder="Nom et téléphone du contact d'urgence"
                      data-testid="user-emergency-input"
                    />
                  </div>
                </div>

                {/* Section 2: Informations professionnelles */}
                <div className="form-section">
                  <h4 className="section-title">🎖️ Informations professionnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Grade *</Label>
                      <select
                        value={newUser.grade}
                        onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                        className="form-select"
                        data-testid="user-grade-select"
                      >
                        <option value="">Sélectionner un grade</option>
                        {grades.map(grade => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <Label>Type d'emploi *</Label>
                      <select
                        value={newUser.type_emploi}
                        onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value})}
                        className="form-select"
                        data-testid="user-employment-select"
                      >
                        <option value="">Sélectionner le type</option>
                        <option value="temps_plein">Temps plein</option>
                        <option value="temps_partiel">Temps partiel</option>
                      </select>
                    </div>
                  </div>

                  {/* Option fonction supérieur pour les pompiers */}
                  {newUser.grade === 'Pompier' && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.fonction_superieur}
                            onChange={(e) => setNewUser({...newUser, fonction_superieur: e.target.checked})}
                            data-testid="user-fonction-superieur"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎖️ Fonction supérieur</span>
                            <span className="fonction-description">
                              Ce pompier peut agir comme Lieutenant en dernier recours dans les affectations
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Numéro d'employé</Label>
                      <Input
                        value={newUser.numero_employe}
                        onChange={(e) => setNewUser({...newUser, numero_employe: e.target.value})}
                        placeholder="Ex: POM001 (automatique si vide)"
                        data-testid="user-number-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date d'embauche *</Label>
                      <Input
                        type="date"
                        value={newUser.date_embauche}
                        onChange={(e) => setNewUser({...newUser, date_embauche: e.target.value})}
                        data-testid="user-hire-date-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Taux horaire ($/h)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newUser.taux_horaire || ''}
                        onChange={(e) => setNewUser({...newUser, taux_horaire: parseFloat(e.target.value) || 0})}
                        placeholder="Ex: 25.50"
                        data-testid="user-taux-horaire-input"
                      />
                    </div>
                  </div>

                {/* Section 3: Compétences et formations - Version compacte */}
                <div className="form-section">
                  <h4 className="section-title">📜 Compétences et certifications</h4>
                  <div className="formations-compact-grid">
                    {formations.map(formation => (
                      <label key={formation.id} className="formation-compact-item">
                        <input
                          type="checkbox"
                          checked={newUser.formations.includes(formation.id)}
                          onChange={() => handleFormationToggle(formation.id)}
                          data-testid={`formation-${formation.id}`}
                        />
                        <div className="formation-compact-content">
                          <div className="formation-compact-header">
                            <span className="formation-compact-name">{formation.nom}</span>
                            {formation.obligatoire && (
                              <span className="compact-obligatoire">OBL</span>
                            )}
                          </div>
                          <div className="formation-compact-meta">
                            <span>{formation.duree_heures}h</span>
                            <span>{formation.validite_mois === 0 ? 'Permanent' : `${formation.validite_mois}m`}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="formations-summary">
                    <span className="summary-text">
                      {newUser.formations.length} compétence(s) sélectionnée(s)
                    </span>
                  </div>
                </div>

                {/* Section 4: EPI (Équipements de Protection Individuels) - Optionnel */}
                <div className="form-section">
                  <h4 className="section-title">🛡️ Tailles des EPI (Optionnel)</h4>
                  <p className="section-description">Les tailles peuvent être saisies maintenant ou ajoutées plus tard via le Module EPI</p>
                  
                  <div className="epi-tailles-grid-modal">
                    {getAllEPITypes().map(epiType => (
                      <div key={epiType.id} className="epi-taille-row">
                        <span className="epi-taille-icon-modal">{epiType.icone}</span>
                        <Label className="epi-taille-label-modal">{epiType.nom}</Label>
                        <Input
                          placeholder="Non attribué"
                          disabled
                          className="epi-taille-input-modal"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="epi-note-modal">
                    💡 Les EPI seront attribués et gérés via le <strong>Module EPI</strong> après la création du pompier
                  </p>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleCreateUser} data-testid="submit-user-btn">
                  🚒 Créer le pompier
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View User Modal - Version modernisée */}
      {showViewModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="view-user-modal">
            <div className="modal-header">
              <h3>👤 Profil de {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowViewModal(false)}>✕</Button>
            </div>
            <div className="modal-body modal-body-optimized">
              <div className="user-profile-view">
                {/* Header stylé */}
                <div className="profile-summary-compact">
                  <div className="profile-avatar-medium">
                    <span className="avatar-icon-medium">👤</span>
                  </div>
                  <div className="profile-info-summary">
                    <h4>{selectedUser.prenom} {selectedUser.nom}</h4>
                    <div className="profile-badges">
                      <span className="grade-badge" style={{ backgroundColor: getGradeColor(selectedUser.grade) }}>
                        {selectedUser.grade}
                      </span>
                      <span className="employment-badge">
                        {selectedUser.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                      </span>
                      <span className={`status-badge ${selectedUser.statut.toLowerCase()}`}>
                        {selectedUser.statut}
                      </span>
                    </div>
                    <p className="employee-id">#{selectedUser.numero_employe}</p>
                  </div>
                </div>

                {/* Grille 2 colonnes pour TOUTES les sections */}
                <div className="profile-details-grid-optimized">
                  {/* Colonne gauche */}
                  <div className="detail-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>📞 Contact</h5>
                      <div className="detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Email</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.email}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Téléphone</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.telephone || 'Non renseigné'}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Adresse</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.adresse || 'Non renseignée'}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Contact d'urgence</span>
                          <span className="detail-value emergency" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.contact_urgence || 'Non renseigné'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>📜 Compétences</h5>
                      {selectedUser.formations?.length > 0 ? (
                        <div className="competences-view-optimized">
                          {selectedUser.formations.map((formationId, index) => (
                            <div key={index} className="competence-badge-optimized">
                              <span className="competence-name">{getFormationName(formationId)}</span>
                              <span className="competence-status">✅</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-data-text">Aucune compétence enregistrée</p>
                      )}
                    </div>
                  </div>

                  {/* Colonne droite */}
                  <div className="detail-column" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>🎖️ Professionnel</h5>
                      <div className="detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Date d'embauche</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>{selectedUser.date_embauche}</span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Ancienneté</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {(() => {
                              const embauche = new Date(selectedUser.date_embauche.split('/').reverse().join('-'));
                              const annees = Math.floor((new Date() - embauche) / (365.25 * 24 * 60 * 60 * 1000));
                              return `${annees} an(s)`;
                            })()}
                          </span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Rôle système</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {selectedUser.role === 'admin' ? '👑 Administrateur' : 
                             selectedUser.role === 'superviseur' ? '🎖️ Superviseur' : '👤 Employé'}
                          </span>
                        </div>
                        <div className="detail-item-optimized" style={{ display: 'flex', justifyContent: 'space-between', gap: '2.5rem', padding: '0.65rem 0.85rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.5rem' }}>
                          <span className="detail-label" style={{ minWidth: '140px', color: '#64748b' }}>Taux horaire</span>
                          <span className="detail-value" style={{ marginLeft: '1.5rem', textAlign: 'right', flex: 1 }}>
                            {selectedUser.taux_horaire ? `${selectedUser.taux_horaire.toFixed(2)} $/h` : 'Non défini'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section detail-section-optimized" style={{ marginBottom: '1.5rem' }}>
                      <h5>🛡️ Équipements (EPI)</h5>
                      {userEPIs.length > 0 ? (
                        <div className="epi-view-optimized">
                          {userEPIs.map(epi => (
                            <div key={epi.id} className="epi-item-optimized">
                              <span className="epi-icon-opt">{getEPIIcone(epi.type_epi)}</span>
                              <div className="epi-info-opt">
                                <strong>{getEPINom(epi.type_epi)}</strong>
                                <span className="epi-details-opt">Taille: {epi.taille} • {epi.etat}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-data-text">Aucun EPI enregistré</p>
                      )}
                    </div>
                  </div>

                </div>

                {/* Actions rapides */}
                <div className="profile-actions">
                  <Button 
                    variant="default" 
                    onClick={() => {
                      setShowViewModal(false);
                      handleEditUser(selectedUser);
                    }}
                    data-testid="quick-edit-user-btn"
                  >
                    ✏️ Modifier ce profil
                  </Button>
                  {selectedUser.type_emploi === 'temps_partiel' && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setShowViewModal(false);
                          handleViewDisponibilites(selectedUser);
                        }}
                        data-testid="quick-view-availability-btn"
                      >
                        📅 Voir disponibilités
                      </Button>
                      <Button 
                        onClick={() => {
                          setShowViewModal(false);
                          handleManageDisponibilites(selectedUser);
                        }}
                        data-testid="manage-availability-btn"
                      >
                        ✏️ Gérer disponibilités
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disponibilités Modal - Lecture seule */}
      {showDisponibilitesModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowDisponibilitesModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="disponibilites-modal">
            <div className="modal-header">
              <h3>Disponibilités - {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowDisponibilitesModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="disponibilites-view">
                {userDisponibilites.length > 0 ? (
                  userDisponibilites.map(dispo => (
                    <div key={dispo.id} className="disponibilite-item">
                      <div className="dispo-day">
                        <strong>{new Date(dispo.date).toLocaleDateString('fr-FR')}</strong>
                      </div>
                      <div className="dispo-time">
                        {dispo.heure_debut} - {dispo.heure_fin}
                      </div>
                      <div className="dispo-status">
                        <span className={`status ${dispo.statut}`}>
                          {dispo.statut === 'disponible' ? '✅ Disponible' : '❌ Indisponible'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-disponibilites">
                    <p>Aucune disponibilité renseignée</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de gestion des disponibilités - Admin/Superviseur */}
      {/* Modal supprimé - On utilise maintenant le module complet Mes Disponibilités */}
      
      {false && showManageDisponibilitesModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowManageDisponibilitesModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="manage-disponibilites-modal">
            <div className="modal-header">
              <h3>✏️ Gérer les disponibilités - {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowManageDisponibilitesModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              {/* Formulaire d'ajout */}
              <div className="add-disponibilite-form" style={{ marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <h4 style={{ marginBottom: '1rem' }}>➕ Ajouter une disponibilité</h4>
                
                {/* Première ligne : Date, heures, statut */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      {newDisponibilite.recurrence ? 'Date de début' : 'Date'}
                    </label>
                    <input
                      type="date"
                      value={newDisponibilite.date}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, date: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Heure début</label>
                    <input
                      type="time"
                      value={newDisponibilite.heure_debut}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, heure_debut: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Heure fin</label>
                    <input
                      type="time"
                      value={newDisponibilite.heure_fin}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, heure_fin: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Statut</label>
                    <select
                      value={newDisponibilite.statut}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, statut: e.target.value})}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    >
                      <option value="disponible">✅ Disponible</option>
                      <option value="indisponible">❌ Indisponible</option>
                    </select>
                  </div>
                </div>

                {/* Checkbox récurrence */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newDisponibilite.recurrence}
                      onChange={(e) => setNewDisponibilite({...newDisponibilite, recurrence: e.target.checked})}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>📅 Récurrence (répéter cette disponibilité)</span>
                  </label>
                </div>

                {/* Options de récurrence */}
                {newDisponibilite.recurrence && (
                  <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', border: '2px solid #3b82f6', marginBottom: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Type de récurrence</label>
                        <select
                          value={newDisponibilite.type_recurrence}
                          onChange={(e) => setNewDisponibilite({...newDisponibilite, type_recurrence: e.target.value})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        >
                          <option value="hebdomadaire">📅 Hebdomadaire</option>
                          <option value="mensuelle">📆 Mensuelle</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>Date de fin *</label>
                        <input
                          type="date"
                          value={newDisponibilite.date_fin}
                          onChange={(e) => setNewDisponibilite({...newDisponibilite, date_fin: e.target.value})}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                        />
                      </div>
                    </div>

                    {/* Sélection des jours pour hebdomadaire */}
                    {newDisponibilite.type_recurrence === 'hebdomadaire' && (
                      <>
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                            Jours de la semaine *
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {[
                              { label: 'Lun', value: 1 },
                              { label: 'Mar', value: 2 },
                              { label: 'Mer', value: 3 },
                              { label: 'Jeu', value: 4 },
                              { label: 'Ven', value: 5 },
                              { label: 'Sam', value: 6 },
                              { label: 'Dim', value: 0 }
                            ].map(jour => (
                              <label 
                                key={jour.value}
                                style={{ 
                                  padding: '0.5rem 1rem', 
                                  borderRadius: '6px', 
                                  border: '2px solid',
                                  borderColor: newDisponibilite.jours_semaine.includes(jour.value) ? '#3b82f6' : '#cbd5e1',
                                  background: newDisponibilite.jours_semaine.includes(jour.value) ? '#dbeafe' : 'white',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={newDisponibilite.jours_semaine.includes(jour.value)}
                                  onChange={(e) => {
                                    const jours = e.target.checked 
                                      ? [...newDisponibilite.jours_semaine, jour.value]
                                      : newDisponibilite.jours_semaine.filter(j => j !== jour.value);
                                    setNewDisponibilite({...newDisponibilite, jours_semaine: jours});
                                  }}
                                  style={{ display: 'none' }}
                                />
                                {jour.label}
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Option bi-hebdomadaire */}
                        <div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newDisponibilite.bi_hebdomadaire}
                              onChange={(e) => setNewDisponibilite({...newDisponibilite, bi_hebdomadaire: e.target.checked})}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '0.875rem' }}>Une semaine sur deux (bi-hebdomadaire)</span>
                          </label>
                        </div>
                      </>
                    )}

                    {newDisponibilite.type_recurrence === 'mensuelle' && (
                      <p style={{ fontSize: '0.875rem', color: '#64748b', fontStyle: 'italic' }}>
                        💡 La disponibilité sera répétée le même jour chaque mois
                      </p>
                    )}
                  </div>
                )}

                {/* Bouton Ajouter */}
                <Button onClick={handleAddDisponibilite} style={{ width: '100%' }}>
                  {newDisponibilite.recurrence ? '➕ Créer les disponibilités récurrentes' : '➕ Ajouter'}
                </Button>
              </div>

              {/* Liste des disponibilités existantes */}
              <div className="disponibilites-list">
                <h4 style={{ marginBottom: '1rem' }}>📋 Disponibilités existantes</h4>
                {userDisponibilites.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {userDisponibilites.sort((a, b) => new Date(a.date) - new Date(b.date)).map(dispo => (
                      <div key={dispo.id} style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '150px 120px 120px 150px auto', 
                        gap: '1rem', 
                        padding: '0.75rem', 
                        background: 'white', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '6px',
                        alignItems: 'center'
                      }}>
                        <div>
                          <strong>{new Date(dispo.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}</strong>
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          {dispo.heure_debut}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                          {dispo.heure_fin}
                        </div>
                        <div>
                          <span style={{ 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '12px', 
                            fontSize: '0.875rem',
                            background: dispo.statut === 'disponible' ? '#dcfce7' : '#fee2e2',
                            color: dispo.statut === 'disponible' ? '#166534' : '#991b1b'
                          }}>
                            {dispo.statut === 'disponible' ? '✅ Disponible' : '❌ Indisponible'}
                          </span>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          onClick={() => handleDeleteDisponibilite(dispo.id)}
                        >
                          🗑️ Supprimer
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '8px' }}>
                    <p>Aucune disponibilité renseignée</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EPI Modal - Gestion des équipements */}
      {showEPIModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEPIModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="epi-modal">
            <div className="modal-header">
              <h3>🛡️ EPI - {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEPIModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="epi-management">
                {/* Bouton d'ajout (Admin/Superviseur uniquement) */}
                <div className="epi-header-actions">
                  <Button 
                    onClick={handleAddEPI}
                    data-testid="add-epi-btn"
                  >
                    + Ajouter un EPI
                  </Button>
                </div>

                {/* Liste des EPI */}
                {userEPIs.length > 0 ? (
                  <div className="epi-list">
                    {userEPIs.map(epi => (
                      <div key={epi.id} className="epi-item-card" data-testid={`epi-item-${epi.id}`}>
                        <div className="epi-item-header">
                          <div className="epi-item-icon">{getEPIIcone(epi.type_epi)}</div>
                          <div className="epi-item-title">
                            <h4>{getEPINom(epi.type_epi)}</h4>
                            <span 
                              className="epi-etat-badge" 
                              style={{ backgroundColor: getEtatColor(epi.etat) }}
                            >
                              {epi.etat}
                            </span>
                          </div>
                        </div>

                        <div className="epi-item-details">
                          <div className="epi-detail-row">
                            <span className="epi-label">Taille:</span>
                            <span className="epi-value">{epi.taille}</span>
                          </div>
                          <div className="epi-detail-row">
                            <span className="epi-label">Attribution:</span>
                            <span className="epi-value">{epi.date_attribution}</span>
                          </div>
                          <div className="epi-detail-row">
                            <span className="epi-label">Expiration:</span>
                            <span className="epi-value">{epi.date_expiration}</span>
                          </div>
                          {epi.date_prochaine_inspection && (
                            <div className="epi-detail-row">
                              <span className="epi-label">Prochaine inspection:</span>
                              <span className="epi-value">{epi.date_prochaine_inspection}</span>
                            </div>
                          )}
                          {epi.notes && (
                            <div className="epi-detail-row">
                              <span className="epi-label">Notes:</span>
                              <span className="epi-value">{epi.notes}</span>
                            </div>
                          )}
                        </div>

                        <div className="epi-item-actions">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              const newTaille = prompt("Nouvelle taille:", epi.taille);
                              if (newTaille) handleUpdateEPITaille(epi.id, newTaille);
                            }}
                            data-testid={`update-taille-${epi.id}`}
                          >
                            ✏️ Modifier taille
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDeleteEPI(epi.id)}
                            data-testid={`delete-epi-${epi.id}`}
                          >
                            🗑️ Supprimer
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-epi">
                    <p>Aucun EPI enregistré pour cet employé</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add EPI Modal */}
      {showAddEPIModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowAddEPIModal(false)}>
          <div className="modal-content medium-modal" onClick={(e) => e.stopPropagation()} data-testid="add-epi-modal">
            <div className="modal-header">
              <h3>+ Ajouter un EPI</h3>
              <Button variant="ghost" onClick={() => setShowAddEPIModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-field">
                  <Label>Type d'EPI *</Label>
                  <select
                    value={newEPI.type_epi}
                    onChange={(e) => setNewEPI({...newEPI, type_epi: e.target.value})}
                    className="form-select"
                    data-testid="new-epi-type-select"
                  >
                    <option value="">Sélectionnez un type</option>
                    <option value="casque">🪖 Casque</option>
                    <option value="bottes">👢 Bottes</option>
                    <option value="veste_bunker">🧥 Veste Bunker</option>
                    <option value="pantalon_bunker">👖 Pantalon Bunker</option>
                    <option value="gants">🧤 Gants</option>
                    <option value="masque_apria">😷 Facial APRIA</option>
                    <option value="cagoule">🎭 Cagoule Anti-Particules</option>
                  </select>
                </div>

                <div className="form-field">
                  <Label>Taille *</Label>
                  <Input
                    value={newEPI.taille}
                    onChange={(e) => setNewEPI({...newEPI, taille: e.target.value})}
                    placeholder="Ex: M, L, 42, etc."
                    data-testid="new-epi-taille-input"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Date d'attribution *</Label>
                    <Input
                      type="date"
                      value={newEPI.date_attribution}
                      onChange={(e) => setNewEPI({...newEPI, date_attribution: e.target.value})}
                      data-testid="new-epi-attribution-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>État</Label>
                    <select
                      value={newEPI.etat}
                      onChange={(e) => setNewEPI({...newEPI, etat: e.target.value})}
                      className="form-select"
                      data-testid="new-epi-etat-select"
                    >
                      <option value="Neuf">Neuf</option>
                      <option value="Bon">Bon</option>
                      <option value="À remplacer">À remplacer</option>
                      <option value="Défectueux">Défectueux</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <Label>Date d'expiration *</Label>
                    <Input
                      type="date"
                      value={newEPI.date_expiration}
                      onChange={(e) => setNewEPI({...newEPI, date_expiration: e.target.value})}
                      data-testid="new-epi-expiration-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Prochaine inspection</Label>
                    <Input
                      type="date"
                      value={newEPI.date_prochaine_inspection}
                      onChange={(e) => setNewEPI({...newEPI, date_prochaine_inspection: e.target.value})}
                      data-testid="new-epi-inspection-input"
                    />
                  </div>
                </div>

                <div className="form-field">
                  <Label>Notes</Label>
                  <textarea
                    value={newEPI.notes}
                    onChange={(e) => setNewEPI({...newEPI, notes: e.target.value})}
                    className="form-textarea"
                    rows="3"
                    placeholder="Remarques ou observations..."
                    data-testid="new-epi-notes-input"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowAddEPIModal(false)}>
                  Annuler
                </Button>
                <Button onClick={handleCreateEPI} data-testid="create-epi-btn">
                  Ajouter l'EPI
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal - Complet et fonctionnel */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-user-modal">
            <div className="modal-header">
              <h3>✏️ Modifier {selectedUser.prenom} {selectedUser.nom}</h3>
              <Button variant="ghost" onClick={() => setShowEditModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="personnel-form-grid">
                {/* Section 1: Informations personnelles */}
                <div className="form-section">
                  <h4 className="section-title">👤 Informations personnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Prénom *</Label>
                      <Input
                        value={newUser.prenom}
                        onChange={(e) => setNewUser({...newUser, prenom: e.target.value})}
                        data-testid="edit-user-prenom-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nom *</Label>
                      <Input
                        value={newUser.nom}
                        onChange={(e) => setNewUser({...newUser, nom: e.target.value})}
                        data-testid="edit-user-nom-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      data-testid="edit-user-email-input"
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Téléphone</Label>
                      <Input
                        value={newUser.telephone}
                        onChange={(e) => setNewUser({...newUser, telephone: e.target.value})}
                        data-testid="edit-user-phone-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Adresse</Label>
                      <Input
                        value={newUser.adresse}
                        onChange={(e) => setNewUser({...newUser, adresse: e.target.value})}
                        placeholder="123 Rue Principale, Ville, Province"
                        data-testid="edit-user-address-input"
                      />
                    </div>
                  </div>

                  <div className="form-field">
                    <Label>Contact d'urgence</Label>
                    <Input
                      value={newUser.contact_urgence}
                      onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                      placeholder="Nom et téléphone du contact d'urgence"
                      data-testid="edit-user-emergency-input"
                    />
                  </div>
                </div>

                {/* Section 2: Informations professionnelles */}
                <div className="form-section">
                  <h4 className="section-title">🎖️ Informations professionnelles</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Grade *</Label>
                      <select
                        value={newUser.grade}
                        onChange={(e) => setNewUser({...newUser, grade: e.target.value})}
                        className="form-select"
                        data-testid="edit-user-grade-select"
                      >
                        {grades.map(grade => (
                          <option key={grade} value={grade}>{grade}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field">
                      <Label>Type d'emploi *</Label>
                      <select
                        value={newUser.type_emploi}
                        onChange={(e) => setNewUser({...newUser, type_emploi: e.target.value})}
                        className="form-select"
                        data-testid="edit-user-employment-select"
                      >
                        <option value="temps_plein">Temps plein</option>
                        <option value="temps_partiel">Temps partiel</option>
                      </select>
                    </div>
                  </div>

                  {/* Option fonction supérieur pour les pompiers */}
                  {newUser.grade === 'Pompier' && (
                    <div className="form-field">
                      <div className="fonction-superieur-option">
                        <label className="fonction-checkbox">
                          <input
                            type="checkbox"
                            checked={newUser.fonction_superieur}
                            onChange={(e) => setNewUser({...newUser, fonction_superieur: e.target.checked})}
                            data-testid="edit-user-fonction-superieur"
                          />
                          <div className="fonction-content">
                            <span className="fonction-title">🎖️ Fonction supérieur</span>
                            <span className="fonction-description">
                              Ce pompier peut agir comme Lieutenant en dernier recours dans les affectations
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Numéro d'employé</Label>
                      <Input
                        value={newUser.numero_employe}
                        onChange={(e) => setNewUser({...newUser, numero_employe: e.target.value})}
                        data-testid="edit-user-number-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date d'embauche *</Label>
                      <Input
                        type="date"
                        value={newUser.date_embauche}
                        onChange={(e) => setNewUser({...newUser, date_embauche: e.target.value})}
                        data-testid="edit-user-hire-date-input"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 3: Compétences */}
                <div className="form-section">
                  <h4 className="section-title">📜 Compétences et certifications</h4>
                  <div className="formations-compact-grid">
                    {formations.map(formation => (
                      <label key={formation.id} className="formation-compact-item">
                        <input
                          type="checkbox"
                          checked={newUser.formations.includes(formation.id)}
                          onChange={() => handleFormationToggle(formation.id)}
                          data-testid={`edit-formation-${formation.id}`}
                        />
                        <div className="formation-compact-content">
                          <div className="formation-compact-header">
                            <span className="formation-compact-name">{formation.nom}</span>
                            {formation.obligatoire && (
                              <span className="compact-obligatoire">OBL</span>
                            )}
                          </div>
                          <div className="formation-compact-meta">
                            <span>{formation.duree_heures}h</span>
                            <span>{formation.validite_mois === 0 ? 'Permanent' : `${formation.validite_mois}m`}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="formations-summary">
                    <span className="summary-text">
                      {newUser.formations.length} compétence(s) sélectionnée(s)
                    </span>
                  </div>
                </div>

                {/* Section 4: EPI (Équipements de Protection Individuels) */}
                <div className="form-section">
                  <h4 className="section-title">🛡️ Tailles des EPI</h4>
                  <p className="section-description">Sélectionnez les tailles pour chaque équipement. Les autres détails seront gérés dans le module EPI.</p>
                  
                  <div className="epi-tailles-grid-modal">
                    {getAllEPITypes().map(epiType => {
                      const existingEPI = userEPIs.find(e => e.type_epi === epiType.id);
                      const currentValue = existingEPI ? existingEPI.taille : '';
                      
                      return (
                        <div key={epiType.id} className="epi-taille-row">
                          <span className="epi-taille-icon-modal">{epiType.icone}</span>
                          <Label className="epi-taille-label-modal">{epiType.nom}</Label>
                          <Input
                            value={currentValue}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              if (existingEPI) {
                                // Mettre à jour l'EPI existant
                                const updatedEPIs = userEPIs.map(item => 
                                  item.id === existingEPI.id ? {...item, taille: newValue} : item
                                );
                                setUserEPIs(updatedEPIs);
                              } else if (newValue) {
                                // Créer un nouvel EPI si une valeur est saisie
                                const newEPI = {
                                  id: `temp-${epiType.id}-${Date.now()}`,
                                  type_epi: epiType.id,
                                  taille: newValue,
                                  user_id: selectedUser.id
                                };
                                setUserEPIs([...userEPIs, newEPI]);
                              }
                            }}
                            placeholder="Saisir la taille"
                            className="epi-taille-input-modal"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="epi-note-modal">
                    💡 Pour attribuer ou gérer complètement les EPI, utilisez le <strong>Module EPI</strong> dans la sidebar
                  </p>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleUpdateUser} data-testid="update-user-btn">
                  💾 Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Planning Component optimisé - Vue moderne avec code couleur
const Planning = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    // Utiliser UTC pour éviter les problèmes de fuseau horaire
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayOfWeek = todayUTC.getUTCDay(); // 0 = dimanche, 1 = lundi, etc.
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(todayUTC);
    monday.setUTCDate(todayUTC.getUTCDate() + daysToMonday);
    return monday.toISOString().split('T')[0];
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [viewMode, setViewMode] = useState('semaine');
  const [typesGarde, setTypesGarde] = useState([]);
  const [assignations, setAssignations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showGardeDetailsModal, setShowGardeDetailsModal] = useState(false);
  const [showAdvancedAssignModal, setShowAdvancedAssignModal] = useState(false);
  const [advancedAssignConfig, setAdvancedAssignConfig] = useState({
    user_id: '',
    type_garde_id: '',
    recurrence_type: 'unique', // unique, hebdomadaire, mensuel
    jours_semaine: [], // pour récurrence hebdomadaire
    date_debut: '',
    date_fin: '',
    exceptions: [] // dates d'exception
  });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedGardeDetails, setSelectedGardeDetails] = useState(null);
  const { toast } = useToast();

  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const weekDaysEn = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const [year, month, day] = currentWeek.split('-').map(Number);
    // Utiliser Date.UTC pour éviter les problèmes de fuseau horaire
    const date = new Date(Date.UTC(year, month - 1, day + i));
    return date;
  });

  // Générer les dates du mois pour la vue mois (calendrier commençant le lundi)
  const monthDates = (() => {
    if (viewMode !== 'mois') return [];
    
    const [year, month] = currentMonth.split('-').map(Number);
    
    // Utiliser UTC pour éviter les problèmes de fuseau horaire
    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const lastDay = new Date(Date.UTC(year, month, 0));
    const dates = [];
    
    // Calculer le jour de la semaine du premier jour (0 = dimanche, 1 = lundi, etc.)
    let firstDayOfWeek = firstDay.getUTCDay();
    // Convertir pour que lundi = 0, dimanche = 6
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
    
    // Ajouter les jours vides au début pour commencer à lundi
    for (let i = 0; i < firstDayOfWeek; i++) {
      dates.push(null); // Jours vides
    }
    
    // Ajouter tous les jours du mois en UTC
    for (let day = 1; day <= lastDay.getUTCDate(); day++) {
      dates.push(new Date(Date.UTC(year, month - 1, day, 12, 0, 0))); // Midi UTC pour éviter les décalages
    }
    
    return dates;
  })();

  useEffect(() => {
    fetchPlanningData();
  }, [currentWeek, currentMonth, viewMode, tenantSlug]);

  const fetchPlanningData = async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const dateRange = viewMode === 'mois' ? 
        `${currentMonth}-01` : // Premier jour du mois
        currentWeek;
        
      const [typesData, assignationsData, usersData] = await Promise.all([
        apiGet(tenantSlug, '/types-garde'),
        apiGet(tenantSlug, `/planning/assignations/${dateRange}`),
        user.role !== 'employe' ? apiGet(tenantSlug, '/users') : Promise.resolve([])
      ]);
      
      setTypesGarde(typesData);
      setAssignations(assignationsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Erreur lors du chargement du planning:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger le planning",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getGardeCoverage = (date, typeGarde) => {
    const dateStr = date.toISOString().split('T')[0];
    const gardeAssignations = assignations.filter(a => 
      a.date === dateStr && a.type_garde_id === typeGarde.id
    );
    
    const assigned = gardeAssignations.length;
    const required = typeGarde.personnel_requis;
    
    if (assigned === 0) return 'vacante';
    if (assigned >= required) return 'complete';
    return 'partielle';
  };

  const getCoverageColor = (coverage) => {
    switch (coverage) {
      case 'complete': return '#10B981'; // Vert
      case 'partielle': return '#F59E0B'; // Jaune
      case 'vacante': return '#EF4444'; // Rouge
      default: return '#6B7280';
    }
  };

  const handleAttributionAuto = async () => {
    if (user.role === 'employe') return;

    try {
      const targetDate = viewMode === 'mois' ? `${currentMonth}-01` : currentWeek;
      const responseData = await apiPost(tenantSlug, `/planning/attribution-auto?semaine_debut=${targetDate}`, {});
      
      toast({
        title: "Attribution automatique réussie",
        description: `${responseData.assignations_creees} nouvelles assignations créées`,
        variant: "success"
      });

      fetchPlanningData();
    } catch (error) {
      toast({
        title: "Erreur d'attribution",
        description: error.detail || error.message || "Impossible d'effectuer l'attribution automatique",
        variant: "destructive"
      });
    }
  };

  const handleRemoveAllPersonnelFromGarde = async () => {
    console.log('selectedGardeDetails:', selectedGardeDetails);
    console.log('assignations:', selectedGardeDetails.assignations);
    
    if (!selectedGardeDetails.assignations || selectedGardeDetails.assignations.length === 0) {
      toast({
        title: "Aucun personnel",
        description: "Il n'y a aucun personnel assigné à cette garde",
        variant: "default"
      });
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer TOUT le personnel de cette garde ?\n\nCela supprimera ${selectedGardeDetails.assignations.length} assignation(s) pour la ${selectedGardeDetails.typeGarde.nom} du ${selectedGardeDetails.date.toLocaleDateString('fr-FR')}.`)) {
      return;
    }

    try {
      // Vérifier que chaque assignation a un ID
      const assignationsWithIds = selectedGardeDetails.assignations.filter(a => a.id);
      
      if (assignationsWithIds.length === 0) {
        toast({
          title: "Erreur technique",
          description: "Les assignations n'ont pas d'ID - impossible de les supprimer",
          variant: "destructive"
        });
        return;
      }

      console.log('Deleting assignations with IDs:', assignationsWithIds.map(a => a.id));

      // Supprimer toutes les assignations de cette garde
      const deletePromises = assignationsWithIds.map(assignation => 
        apiDelete(tenantSlug, `/planning/assignation/${assignation.id}`)
      );

      await Promise.all(deletePromises);
      
      toast({
        title: "Personnel supprimé",
        description: `Tout le personnel (${assignationsWithIds.length} personne(s)) a été retiré de cette garde`,
        variant: "success"
      });

      // Fermer le modal et recharger les données
      setShowGardeDetailsModal(false);
      fetchPlanningData();
      
    } catch (error) {
      console.error('Error removing all personnel:', error);
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de supprimer le personnel de cette garde",
        variant: "destructive"
      });
    }
  };

  const handleRemovePersonFromGarde = async (personId, gardeName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir retirer cette personne de la garde ${gardeName} ?`)) {
      return;
    }

    try {
      // Trouver l'assignation à supprimer
      const assignationToRemove = selectedGardeDetails.assignations.find(a => a.user_id === personId);
      
      if (!assignationToRemove) {
        toast({
          title: "Erreur",
          description: "Assignation non trouvée",
          variant: "destructive"
        });
        return;
      }

      await apiDelete(tenantSlug, `/planning/assignation/${assignationToRemove.id}`);
      
      toast({
        title: "Personne retirée",
        description: "La personne a été retirée de cette garde avec succès",
        variant: "success"
      });

      // Fermer le modal et recharger les données
      setShowGardeDetailsModal(false);
      fetchPlanningData();
      
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de retirer la personne",
        variant: "destructive"
      });
    }
  };

  const handleAssignUser = async (userId, typeGardeId, date) => {
    if (user.role === 'employe') return;

    try {
      await apiPost(tenantSlug, '/planning/assignation', {
        user_id: userId,
        type_garde_id: typeGardeId,
        date: date,
        assignation_type: "manuel"
      });

      toast({
        title: "Attribution réussie",
        description: "L'assignation a été créée avec succès",
        variant: "success"
      });

      fetchPlanningData();
      setShowAssignModal(false);
    } catch (error) {
      toast({
        title: "Erreur d'attribution",
        description: "Impossible de créer l'assignation",
        variant: "destructive"
      });
    }
  };

  const handleAdvancedAssignment = async () => {
    if (user.role === 'employe') return;

    // Validation des champs requis
    if (!advancedAssignConfig.user_id || !advancedAssignConfig.type_garde_id || !advancedAssignConfig.date_debut) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    // Validation spécifique pour récurrence hebdomadaire
    if (advancedAssignConfig.recurrence_type === 'hebdomadaire' && advancedAssignConfig.jours_semaine.length === 0) {
      toast({
        title: "Jours requis",
        description: "Veuillez sélectionner au moins un jour de la semaine",
        variant: "destructive"
      });
      return;
    }

    try {
      const assignmentData = {
        user_id: advancedAssignConfig.user_id,
        type_garde_id: advancedAssignConfig.type_garde_id,
        recurrence_type: advancedAssignConfig.recurrence_type,
        date_debut: advancedAssignConfig.date_debut,
        date_fin: advancedAssignConfig.date_fin || advancedAssignConfig.date_debut,
        jours_semaine: advancedAssignConfig.jours_semaine,
        assignation_type: "manuel_avance"
      };

      await apiPost(tenantSlug, '/planning/assignation-avancee', assignmentData);

      const selectedUser = users.find(u => u.id === advancedAssignConfig.user_id);
      const selectedTypeGarde = typesGarde.find(t => t.id === advancedAssignConfig.type_garde_id);
      
      toast({
        title: "Assignation avancée créée",
        description: `${selectedUser?.prenom} ${selectedUser?.nom} assigné(e) pour ${selectedTypeGarde?.nom} (${advancedAssignConfig.recurrence_type})`,
        variant: "success"
      });

      // Reset du formulaire
      setAdvancedAssignConfig({
        user_id: '',
        type_garde_id: '',
        recurrence_type: 'unique',
        jours_semaine: [],
        date_debut: '',
        date_fin: '',
        exceptions: []
      });

      setShowAdvancedAssignModal(false);
      fetchPlanningData();
    } catch (error) {
      toast({
        title: "Erreur d'assignation",
        description: error.response?.data?.detail || "Impossible de créer l'assignation avancée",
        variant: "destructive"
      });
    }
  };

  const getAssignationForSlot = (date, typeGardeId) => {
    const dateStr = date.toISOString().split('T')[0];
    return assignations.find(a => a.date === dateStr && a.type_garde_id === typeGardeId);
  };

  const getUserById = (userId) => {
    return users.find(u => u.id === userId);
  };

  const shouldShowTypeGardeForDay = (typeGarde, dayIndex) => {
    // Si pas de jours d'application spécifiés, afficher tous les jours
    if (!typeGarde.jours_application || typeGarde.jours_application.length === 0) {
      return true;
    }
    
    // Vérifier si le jour de la semaine est dans les jours d'application
    const dayNameEn = weekDaysEn[dayIndex];
    return typeGarde.jours_application.includes(dayNameEn);
  };

  const openGardeDetails = (date, typeGarde) => {
    const dateStr = date.toISOString().split('T')[0];
    const gardeAssignations = assignations.filter(a => 
      a.date === dateStr && a.type_garde_id === typeGarde.id
    );
    
    setSelectedGardeDetails({
      date: date,
      typeGarde: typeGarde,
      assignations: gardeAssignations,
      personnelAssigne: gardeAssignations.map(a => getUserById(a.user_id)).filter(Boolean)
    });
    setShowGardeDetailsModal(true);
  };

  const openAssignModal = (date, typeGarde) => {
    if (user.role === 'employe') return;
    setSelectedSlot({ date, typeGarde });
    setShowAssignModal(true);
  };

  const navigateWeek = (direction) => {
    const [year, month, day] = currentWeek.split('-').map(Number);
    const newDate = new Date(Date.UTC(year, month - 1, day));
    newDate.setUTCDate(newDate.getUTCDate() + (direction * 7));
    setCurrentWeek(newDate.toISOString().split('T')[0]);
  };

  const navigateMonth = (direction) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const newDate = new Date(year, month - 1 + direction, 1);
    setCurrentMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`);
  };

  if (loading) return <div className="loading" data-testid="planning-loading">Chargement du planning...</div>;

  return (
    <div className="planning">
      <div className="planning-header">
        <div>
          <h1 data-testid="planning-title">Planning des gardes</h1>
          <p>Affectation manuelle privilégiée et attribution automatique</p>
        </div>
        <div className="planning-controls">
          <div className="view-controls">
            <Button 
              variant={viewMode === 'semaine' ? 'default' : 'outline'}
              onClick={() => setViewMode('semaine')}
              data-testid="week-view-btn"
            >
              📅 Vue semaine
            </Button>
            <Button 
              variant={viewMode === 'mois' ? 'default' : 'outline'}
              onClick={() => setViewMode('mois')}
              data-testid="month-view-btn"
            >
              📊 Vue mois
            </Button>
          </div>
          <div className="action-controls">
            <Button 
              variant="default" 
              disabled={user.role === 'employe'}
              onClick={handleAttributionAuto}
              data-testid="auto-assign-btn"
            >
              ✨ Attribution auto
            </Button>
            <Button 
              variant="destructive" 
              disabled={user.role === 'employe'}
              onClick={() => setShowAdvancedAssignModal(true)}
              data-testid="manual-assign-btn"
            >
              👤 Assignation manuelle avancée
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation temporelle */}
      <div className="time-navigation">
        <Button 
          variant="ghost" 
          onClick={() => viewMode === 'mois' ? navigateMonth(-1) : navigateWeek(-1)}
          data-testid="prev-period-btn"
        >
          ← {viewMode === 'mois' ? 'Mois précédent' : 'Semaine précédente'}
        </Button>
        <h2 className="period-title">
          {viewMode === 'mois' ? (
            new Date(currentMonth + '-01T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          ) : (
            `Semaine du ${weekDates[0].toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au ${weekDates[6].toLocaleDateString('fr-FR', { timeZone: 'UTC' })}`
          )}
        </h2>
        <Button 
          variant="ghost" 
          onClick={() => viewMode === 'mois' ? navigateMonth(1) : navigateWeek(1)}
          data-testid="next-period-btn"
        >
          {viewMode === 'mois' ? 'Mois suivant' : 'Semaine suivante'} →
        </Button>
      </div>

      {/* Légende des couleurs */}
      <div className="coverage-legend">
        <h3>📊 Légende de couverture</h3>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color complete"></span>
            <span>Garde complète</span>
          </div>
          <div className="legend-item">
            <span className="legend-color partielle"></span>
            <span>Garde partielle</span>
          </div>
          <div className="legend-item">
            <span className="legend-color vacante"></span>
            <span>Garde vacante</span>
          </div>
        </div>
      </div>

      {/* Instructions for manual assignment */}
      {user.role !== 'employe' && (
        <div className="planning-instructions">
          <div className="instruction-card">
            <span className="instruction-icon">👆</span>
            <div className="instruction-text">
              <strong>Assignation manuelle :</strong> Cliquez sur une cellule vide (garde vacante) pour assigner un pompier manuellement
            </div>
          </div>
          <div className="instruction-card">
            <span className="instruction-icon">🤖</span>
            <div className="instruction-text">
              <strong>Attribution automatique :</strong> Utilise l'intelligence artificielle selon les priorités configurées
            </div>
          </div>
        </div>
      )}

      {/* Planning moderne avec code couleur */}
      {viewMode === 'semaine' ? (
        <div className="planning-moderne">
          {typesGarde
            .filter(typeGarde => {
              // Afficher seulement les types qui ont au moins un jour applicable cette semaine
              return weekDates.some((date, dayIndex) => 
                shouldShowTypeGardeForDay(typeGarde, dayIndex)
              );
            })
            .sort((a, b) => a.heure_debut.localeCompare(b.heure_debut))
            .map(typeGarde => (
              <div key={typeGarde.id} className="garde-row-moderne">
                <div className="garde-info-moderne">
                  <h3>{typeGarde.nom}</h3>
                  <div className="garde-meta">
                    <span>⏰ {typeGarde.heure_debut} - {typeGarde.heure_fin}</span>
                    <span>👥 {typeGarde.personnel_requis} requis</span>
                    {typeGarde.officier_obligatoire && <span>🎖️ Officier</span>}
                  </div>
                </div>
                
                <div className="jours-garde-moderne">
                  {weekDates.map((date, dayIndex) => {
                    if (!shouldShowTypeGardeForDay(typeGarde, dayIndex)) {
                      return null; // Ne pas afficher du tout
                    }

                    const coverage = getGardeCoverage(date, typeGarde);
                    const dateStr = date.toISOString().split('T')[0];
                    const gardeAssignations = assignations.filter(a => 
                      a.date === dateStr && a.type_garde_id === typeGarde.id
                    );
                    const assignedUsers = gardeAssignations.map(a => getUserById(a.user_id)).filter(Boolean);
                    const assignedCount = assignedUsers.length;
                    const requiredCount = typeGarde.personnel_requis;

                    return (
                      <div
                        key={dayIndex}
                        className={`jour-garde-card ${coverage}`}
                        style={{
                          backgroundColor: getCoverageColor(coverage) + '20',
                          borderColor: getCoverageColor(coverage)
                        }}
                        onClick={() => {
                          if (assignedUsers.length > 0) {
                            openGardeDetails(date, typeGarde);
                          } else if (user.role !== 'employe') {
                            openAssignModal(date, typeGarde);
                          }
                        }}
                        data-testid={`garde-card-${dayIndex}-${typeGarde.id}`}
                      >
                        <div className="jour-header">
                          <span className="jour-name">{weekDays[dayIndex]}</span>
                          <span className="jour-date">{date.getUTCDate()}</span>
                        </div>
                        
                        <div className="garde-content">
                          {assignedUsers.length > 0 ? (
                            <div className="assigned-info">
                              {/* Afficher TOUS les noms - Liste compacte */}
                              {assignedUsers.map((user, idx) => (
                                <div key={idx} className="assigned-name-item-compact">
                                  <span className="assigned-name-compact">
                                    {user.prenom.charAt(0)}. {user.nom.charAt(0)}. - {user.grade.substring(0, 6)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="vacant-info">
                              <span className="vacant-text">Vacant</span>
                            </div>
                          )}
                          
                          {/* Afficher le ratio en bas */}
                          <div className="personnel-ratio" style={{
                            marginTop: '8px',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            color: coverage === 'complete' ? '#10b981' : coverage === 'partielle' ? '#f59e0b' : '#ef4444'
                          }}>
                            {assignedCount}/{requiredCount}
                          </div>
                        </div>
                        
                        <div className="coverage-indicator">
                          <span className={`coverage-badge ${coverage}`}>
                            {coverage === 'complete' ? '✅' : coverage === 'partielle' ? '⚠️' : '❌'}
                          </span>
                        </div>
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="planning-mois">
          <div className="mois-header">
            <h3>📅 Planning mensuel - {new Date(currentMonth + '-01T12:00:00Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3>
          </div>
          
          <div className="calendrier-mois">
            {monthDates.map((date, index) => {
              // Si date est null, c'est un jour vide (avant le 1er du mois)
              if (date === null) {
                return <div key={`empty-${index}`} className="jour-mois jour-vide"></div>;
              }

              const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' });
              const dayIndex = date.getUTCDay() === 0 ? 6 : date.getUTCDay() - 1; // Lundi = 0
              
              const gardesJour = typesGarde.filter(typeGarde => 
                shouldShowTypeGardeForDay(typeGarde, dayIndex)
              );

              return (
                <div key={date.toISOString().split('T')[0]} className="jour-mois">
                  <div className="jour-mois-header">
                    <span className="jour-mois-name">{dayName}</span>
                    <span className="jour-mois-date">{date.getUTCDate()}</span>
                  </div>
                  
                  <div className="gardes-jour-list">
                    {gardesJour.map(typeGarde => {
                      const coverage = getGardeCoverage(date, typeGarde);
                      return (
                        <div
                          key={typeGarde.id}
                          className={`garde-mois-item ${coverage}`}
                          style={{
                            backgroundColor: getCoverageColor(coverage),
                            opacity: coverage === 'vacante' ? 0.7 : 1
                          }}
                          onClick={() => openGardeDetails(date, typeGarde)}
                          data-testid={`garde-mois-${date.getDate()}-${typeGarde.id}`}
                        >
                          <span className="garde-initiale">{typeGarde.nom.charAt(0)}</span>
                          <span className="coverage-icon">
                            {coverage === 'complete' ? '✅' : coverage === 'partielle' ? '⚠️' : '❌'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && selectedSlot && user.role !== 'employe' && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} data-testid="assign-modal">
            <div className="modal-header">
              <h3>Assigner une garde</h3>
              <Button variant="ghost" onClick={() => setShowAssignModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="assignment-details">
                <p><strong>Garde:</strong> {selectedSlot.typeGarde.nom}</p>
                <p><strong>Date:</strong> {selectedSlot.date.toLocaleDateString('fr-FR')}</p>
                <p><strong>Horaires:</strong> {selectedSlot.typeGarde.heure_debut} - {selectedSlot.typeGarde.heure_fin}</p>
              </div>
              
              <div className="user-selection">
                <h4>Sélectionner un pompier:</h4>
                <div className="user-list">
                  {users
                    .filter(userOption => {
                      // Filtrer les utilisateurs déjà assignés à cette garde
                      const dateStr = selectedSlot.date.toISOString().split('T')[0];
                      const alreadyAssigned = assignations.some(a => 
                        a.date === dateStr && 
                        a.type_garde_id === selectedSlot.typeGarde.id && 
                        a.user_id === userOption.id
                      );
                      return !alreadyAssigned;
                    })
                    .map(userOption => (
                    <div 
                      key={userOption.id} 
                      className="user-option"
                      onClick={() => handleAssignUser(userOption.id, selectedSlot.typeGarde.id, selectedSlot.date.toISOString().split('T')[0])}
                      data-testid={`assign-user-${userOption.id}`}
                    >
                      <span className="user-name">{userOption.prenom} {userOption.nom}</span>
                      <span className="user-grade">{userOption.grade}</span>
                      <span className="user-status">{userOption.statut}</span>
                    </div>
                  ))}
                  {users.filter(userOption => {
                    const dateStr = selectedSlot.date.toISOString().split('T')[0];
                    const alreadyAssigned = assignations.some(a => 
                      a.date === dateStr && 
                      a.type_garde_id === selectedSlot.typeGarde.id && 
                      a.user_id === userOption.id
                    );
                    return !alreadyAssigned;
                  }).length === 0 && (
                    <p style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                      Tous les pompiers sont déjà assignés à cette garde.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal détails d'une garde - Voir tout le personnel */}
      {showGardeDetailsModal && selectedGardeDetails && (
        <div className="modal-overlay" onClick={() => setShowGardeDetailsModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()} data-testid="garde-details-modal">
            <div className="modal-header">
              <h3>🚒 Détails de la garde - {selectedGardeDetails.date.toLocaleDateString('fr-FR')}</h3>
              <Button variant="ghost" onClick={() => setShowGardeDetailsModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="garde-info-header">
                <div className="garde-type-info">
                  <h4>{selectedGardeDetails.typeGarde.nom}</h4>
                  <div className="garde-details-meta">
                    <span>⏰ {selectedGardeDetails.typeGarde.heure_debut} - {selectedGardeDetails.typeGarde.heure_fin}</span>
                    <span>👥 {selectedGardeDetails.typeGarde.personnel_requis} personnel requis</span>
                    {selectedGardeDetails.typeGarde.officier_obligatoire && (
                      <span>🎖️ Officier obligatoire</span>
                    )}
                  </div>
                </div>
                <div className="coverage-indicator">
                  <span className="coverage-ratio">
                    {selectedGardeDetails.personnelAssigne.length}/{selectedGardeDetails.typeGarde.personnel_requis}
                  </span>
                  <span className="coverage-label">Personnel assigné</span>
                </div>
              </div>

              <div className="personnel-assigned">
                <h4>👥 Personnel assigné</h4>
                {selectedGardeDetails.personnelAssigne.length > 0 ? (
                  <div className="personnel-list">
                    {selectedGardeDetails.personnelAssigne.map((person, index) => (
                      <div key={person.id} className="personnel-item">
                        <div className="personnel-info">
                          <div className="personnel-avatar">
                            <span className="avatar-icon">👤</span>
                          </div>
                          <div className="personnel-details">
                            <span className="personnel-name">{person.prenom} {person.nom}</span>
                            <span className="personnel-grade">{person.grade}</span>
                            <span className="personnel-type">{person.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}</span>
                          </div>
                        </div>
                        <div className="personnel-actions">
                          <span className="assignment-method">
                            {selectedGardeDetails.assignations[index]?.assignation_type === 'auto' ? '🤖 Auto' : '👤 Manuel'}
                          </span>
                          {user.role !== 'employe' && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleRemovePersonFromGarde(person.id, selectedGardeDetails.typeGarde.nom)}
                              data-testid={`remove-person-${person.id}`}
                            >
                              ❌ Retirer
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-personnel">
                    <p>Aucun personnel assigné à cette garde</p>
                    {user.role !== 'employe' && (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setShowGardeDetailsModal(false);
                          openAssignModal(selectedGardeDetails.date, selectedGardeDetails.typeGarde);
                        }}
                        data-testid="assign-personnel-btn"
                      >
                        Assigner du personnel
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="garde-actions">
                {user.role !== 'employe' && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setShowGardeDetailsModal(false);
                        openAssignModal(selectedGardeDetails.date, selectedGardeDetails.typeGarde);
                      }}
                      data-testid="add-more-personnel-btn"
                    >
                      ➕ Ajouter personnel
                    </Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleRemoveAllPersonnelFromGarde}
                      data-testid="remove-all-personnel-btn"
                    >
                      🗑️ Supprimer tout le personnel
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal d'assignation manuelle avancée avec récurrence */}
      {showAdvancedAssignModal && user.role !== 'employe' && (
        <div className="modal-overlay" onClick={() => setShowAdvancedAssignModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="advanced-assign-modal">
            <div className="modal-header">
              <h3>👤 Assignation manuelle avancée</h3>
              <Button variant="ghost" onClick={() => setShowAdvancedAssignModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="advanced-assign-form">
                {/* Section 1: Sélection personnel */}
                <div className="assign-section">
                  <h4>👥 Sélection du personnel</h4>
                  <div className="form-field">
                    <Label>Pompier à assigner *</Label>
                    <select
                      value={advancedAssignConfig.user_id}
                      onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, user_id: e.target.value})}
                      className="form-select"
                      data-testid="advanced-user-select"
                    >
                      <option value="">Sélectionner un pompier</option>
                      {users.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.prenom} {user.nom} ({user.grade} - {user.type_emploi === 'temps_plein' ? 'TP' : 'Part.'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section 2: Type de garde */}
                <div className="assign-section">
                  <h4>🚒 Type de garde</h4>
                  <div className="form-field">
                    <Label>Type de garde *</Label>
                    <select
                      value={advancedAssignConfig.type_garde_id}
                      onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, type_garde_id: e.target.value})}
                      className="form-select"
                      data-testid="advanced-type-garde-select"
                    >
                      <option value="">Sélectionner un type de garde</option>
                      {typesGarde.map(type => (
                        <option key={type.id} value={type.id}>
                          {type.nom} ({type.heure_debut} - {type.heure_fin})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Section 3: Configuration récurrence */}
                <div className="assign-section">
                  <h4>🔄 Type d'assignation</h4>
                  <div className="recurrence-options">
                    <label className="recurrence-option">
                      <input
                        type="radio"
                        name="recurrence"
                        value="unique"
                        checked={advancedAssignConfig.recurrence_type === 'unique'}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_type: e.target.value})}
                      />
                      <div className="recurrence-content">
                        <span className="recurrence-title">📅 Assignation unique</span>
                        <span className="recurrence-description">Une seule date spécifique</span>
                      </div>
                    </label>

                    <label className="recurrence-option">
                      <input
                        type="radio"
                        name="recurrence"
                        value="hebdomadaire"
                        checked={advancedAssignConfig.recurrence_type === 'hebdomadaire'}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_type: e.target.value})}
                      />
                      <div className="recurrence-content">
                        <span className="recurrence-title">🔁 Récurrence hebdomadaire</span>
                        <span className="recurrence-description">Répéter chaque semaine sur des jours choisis</span>
                      </div>
                    </label>

                    <label className="recurrence-option">
                      <input
                        type="radio"
                        name="recurrence"
                        value="mensuel"
                        checked={advancedAssignConfig.recurrence_type === 'mensuel'}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, recurrence_type: e.target.value})}
                      />
                      <div className="recurrence-content">
                        <span className="recurrence-title">📆 Récurrence mensuelle</span>
                        <span className="recurrence-description">Répéter chaque mois aux mêmes dates</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Section 4: Configuration dates */}
                <div className="assign-section">
                  <h4>📅 Période d'assignation</h4>
                  <div className="form-row">
                    <div className="form-field">
                      <Label>Date de début *</Label>
                      <Input
                        type="date"
                        value={advancedAssignConfig.date_debut}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, date_debut: e.target.value})}
                        min={new Date().toISOString().split('T')[0]}
                        data-testid="advanced-date-debut"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Date de fin *</Label>
                      <Input
                        type="date"
                        value={advancedAssignConfig.date_fin}
                        onChange={(e) => setAdvancedAssignConfig({...advancedAssignConfig, date_fin: e.target.value})}
                        min={advancedAssignConfig.date_debut || new Date().toISOString().split('T')[0]}
                        data-testid="advanced-date-fin"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 5: Jours de semaine (si récurrence hebdomadaire) */}
                {advancedAssignConfig.recurrence_type === 'hebdomadaire' && (
                  <div className="assign-section">
                    <h4>📋 Jours de la semaine</h4>
                    <div className="jours-selection">
                      {[
                        { value: 'monday', label: 'Lundi' },
                        { value: 'tuesday', label: 'Mardi' },
                        { value: 'wednesday', label: 'Mercredi' },
                        { value: 'thursday', label: 'Jeudi' },
                        { value: 'friday', label: 'Vendredi' },
                        { value: 'saturday', label: 'Samedi' },
                        { value: 'sunday', label: 'Dimanche' }
                      ].map(jour => (
                        <label key={jour.value} className="jour-checkbox">
                          <input
                            type="checkbox"
                            checked={advancedAssignConfig.jours_semaine.includes(jour.value)}
                            onChange={(e) => {
                              const updatedJours = e.target.checked
                                ? [...advancedAssignConfig.jours_semaine, jour.value]
                                : advancedAssignConfig.jours_semaine.filter(j => j !== jour.value);
                              setAdvancedAssignConfig({...advancedAssignConfig, jours_semaine: updatedJours});
                            }}
                          />
                          <span>{jour.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Section 6: Résumé de l'assignation */}
                <div className="assign-section">
                  <h4>📊 Résumé de l'assignation</h4>
                  <div className="assignment-summary">
                    <div className="summary-row">
                      <span className="summary-label">Personnel :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.user_id ? 
                          users.find(u => u.id === advancedAssignConfig.user_id)?.prenom + ' ' + 
                          users.find(u => u.id === advancedAssignConfig.user_id)?.nom 
                          : 'Non sélectionné'}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Type de garde :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.type_garde_id ?
                          typesGarde.find(t => t.id === advancedAssignConfig.type_garde_id)?.nom
                          : 'Non sélectionné'}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Récurrence :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.recurrence_type === 'unique' ? 'Assignation unique' :
                         advancedAssignConfig.recurrence_type === 'hebdomadaire' ? `Chaque semaine (${advancedAssignConfig.jours_semaine.length} jour(s))` :
                         'Récurrence mensuelle'}
                      </span>
                    </div>
                    <div className="summary-row">
                      <span className="summary-label">Période :</span>
                      <span className="summary-value">
                        {advancedAssignConfig.date_debut && advancedAssignConfig.date_fin ?
                          `Du ${new Date(advancedAssignConfig.date_debut).toLocaleDateString('fr-FR')} au ${new Date(advancedAssignConfig.date_fin).toLocaleDateString('fr-FR')}`
                          : 'Période non définie'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowAdvancedAssignModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleAdvancedAssignment}
                  data-testid="create-advanced-assignment-btn"
                  disabled={!advancedAssignConfig.user_id || !advancedAssignConfig.type_garde_id || !advancedAssignConfig.date_debut}
                >
                  🚒 Créer l'assignation
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Remplacements Component optimisé - Gestion complète remplacements et congés
const Remplacements = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const [demandes, setDemandes] = useState([]);
  const [demandesConge, setDemandesConge] = useState([]);
  const [users, setUsers] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('remplacements');
  const [showCreateRemplacementModal, setShowCreateRemplacementModal] = useState(false);
  const [showCreateCongeModal, setShowCreateCongeModal] = useState(false);
  const [newDemande, setNewDemande] = useState({
    type_garde_id: '',
    date: '',
    raison: '',
    priorite: 'normale'
  });
  const [newConge, setNewConge] = useState({
    type_conge: '',
    date_debut: '',
    date_fin: '',
    raison: '',
    priorite: 'normale'
  });
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

  const fetchData = async () => {
    if (!tenantSlug) return;
    
    setLoading(true);
    try {
      const promises = [
        apiGet(tenantSlug, '/remplacements'),
        apiGet(tenantSlug, '/demandes-conge'),
        apiGet(tenantSlug, '/types-garde')
      ];
      
      if (user.role !== 'employe') {
        promises.push(apiGet(tenantSlug, '/users'));
      }

      const responses = await Promise.all(promises);
      setDemandes(responses[0]);
      setDemandesConge(responses[1]);
      setTypesGarde(responses[2]);
      
      if (responses[3]) {
        setUsers(responses[3]);
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
    if (user.role === 'employe') return;

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

  return (
    <div className="remplacements-optimized">
      <div className="remplacements-header">
        <div>
          <h1 data-testid="replacements-title">Gestion des remplacements et congés</h1>
          <p>Demandes de remplacement avec recherche automatique et gestion des congés</p>
        </div>
        <div className="header-actions">
          <Button 
            variant="default" 
            onClick={() => setShowCreateRemplacementModal(true)}
            data-testid="create-replacement-btn"
          >
            🔄 Demande de remplacement
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowCreateCongeModal(true)}
            data-testid="create-conge-btn"
          >
            🏖️ Demande de congé
          </Button>
        </div>
      </div>

      {/* Onglets Remplacements / Congés */}
      <div className="replacement-tabs">
        <button
          className={`tab-button ${activeTab === 'remplacements' ? 'active' : ''}`}
          onClick={() => setActiveTab('remplacements')}
          data-testid="tab-remplacements"
        >
          🔄 Remplacements ({demandes.length})
        </button>
        <button
          className={`tab-button ${activeTab === 'conges' ? 'active' : ''}`}
          onClick={() => setActiveTab('conges')}
          data-testid="tab-conges"
        >
          🏖️ Congés ({demandesConge.length})
        </button>
      </div>

      {/* Contenu des onglets */}
      <div className="tab-content">
        {activeTab === 'remplacements' && (
          <div className="remplacements-content">
            {/* Statistics Cards pour remplacements */}
            <div className="replacement-stats">
              <div className="stat-card pending">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <h3>En cours</h3>
                  <p className="stat-number">{demandes.filter(d => d.statut === 'en_cours').length}</p>
                  <p className="stat-label">Demandes en attente</p>
                </div>
              </div>

              <div className="stat-card approved">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <h3>Approuvées</h3>
                  <p className="stat-number">{demandes.filter(d => d.statut === 'approuve').length}</p>
                  <p className="stat-label">Ce mois</p>
                </div>
              </div>

              <div className="stat-card coverage">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>Taux de couverture</h3>
                  <p className="stat-number">
                    {demandes.length > 0 
                      ? Math.round((demandes.filter(d => d.statut === 'approuve' && d.remplacant_id).length / demandes.length) * 100)
                      : 0}%
                  </p>
                  <p className="stat-label">Remplacements trouvés</p>
                </div>
              </div>
            </div>

            {/* Aide contextuelle pour les admins/superviseurs */}
            {user.role !== 'employe' && demandes.filter(d => d.statut === 'en_cours').length > 0 && (
              <div style={{ 
                background: '#eff6ff', 
                border: '1px solid #3b82f6', 
                borderRadius: '8px', 
                padding: '1rem', 
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'start',
                gap: '0.75rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>💡</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#1e40af', display: 'block', marginBottom: '0.5rem' }}>
                    Actions manuelles disponibles
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: '#1e40af', margin: 0, lineHeight: '1.5' }}>
                    Les demandes de remplacement sont <strong>automatiquement traitées</strong> selon vos paramètres. 
                    Les boutons ci-dessous permettent d'<strong>intervenir manuellement</strong> si nécessaire :
                  </p>
                  <ul style={{ fontSize: '0.875rem', color: '#1e40af', margin: '0.5rem 0 0 1.5rem', lineHeight: '1.6' }}>
                    <li><strong>🔍 Recherche auto</strong> : Relancer la recherche si l'automatisation a échoué</li>
                    <li><strong>✅ Approuver</strong> : Valider manuellement (remplaçant trouvé hors système)</li>
                    <li><strong>❌ Rejeter</strong> : Annuler si la demande n'est plus nécessaire</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Liste des demandes de remplacement */}
            <div className="demandes-list">
              {demandes.length > 0 ? (
                demandes.map(demande => (
                  <div key={demande.id} className="demande-card" data-testid={`replacement-${demande.id}`}>
                    <div className="demande-header">
                      <div className="demande-info">
                        <h3>{getTypeGardeName(demande.type_garde_id)}</h3>
                        <span className="demande-date">{new Date(demande.date).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <div className="demande-status">
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
                        <span>Demandé par: {getUserName(demande.demandeur_id)}</span>
                        <span>Le: {new Date(demande.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>
                    {user.role !== 'employe' && demande.statut === 'en_cours' && (
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
                        >
                          ✅
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="danger" 
                          data-testid={`reject-replacement-${demande.id}`}
                          title="Rejeter/Annuler cette demande (si plus nécessaire ou aucun remplaçant disponible)"
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
            {user.role !== 'employe' && (
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
                  <span className="pending-count">{demandesConge.filter(d => d.statut === 'en_attente').length}</span>
                  <span className="pending-label">en attente d'approbation</span>
                </div>
              </div>
            )}

            {/* Boutons d'actions rapides pour admin/superviseur */}
            {user.role !== 'employe' && (
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

            {/* Statistics Cards pour congés */}
            <div className="conge-stats">
              <div className="stat-card-conge pending">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <h3>En attente</h3>
                  <p className="stat-number">{demandesConge.filter(d => d.statut === 'en_attente').length}</p>
                  <p className="stat-label">À approuver</p>
                </div>
              </div>

              <div className="stat-card-conge approved">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <h3>Approuvés</h3>
                  <p className="stat-number">{demandesConge.filter(d => d.statut === 'approuve').length}</p>
                  <p className="stat-label">Ce mois</p>
                </div>
              </div>

              <div className="stat-card-conge total">
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <h3>Total jours</h3>
                  <p className="stat-number">{demandesConge.reduce((total, d) => total + (d.nombre_jours || 0), 0)}</p>
                  <p className="stat-label">Jours de congé</p>
                </div>
              </div>
            </div>

            {/* Liste des demandes de congé */}
            <div className="conges-list">
              {demandesConge.length > 0 ? (
                demandesConge.map(conge => (
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
                          {new Date(conge.date_debut).toLocaleDateString('fr-FR')} - {new Date(conge.date_fin).toLocaleDateString('fr-FR')}
                        </span>
                        <span className="jours-count">({conge.nombre_jours} jour{conge.nombre_jours > 1 ? 's' : ''})</span>
                      </div>
                      <p className="conge-raison">{conge.raison}</p>
                      <div className="conge-meta">
                        <span>Demandé par: {getUserName(conge.demandeur_id)}</span>
                        <span>Le: {new Date(conge.created_at).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>

                    {user.role !== 'employe' && conge.statut === 'en_attente' && (
                      <div className="conge-actions">
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={() => handleApprouverConge(conge.id, 'approuver')}
                          data-testid={`approve-conge-${conge.id}`}
                        >
                          ✅ Approuver
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => handleApprouverConge(conge.id, 'refuser')}
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
                    {user.role !== 'employe' 
                      ? 'Les demandes de congé des employés apparaîtront ici pour approbation.' 
                      : 'Vos demandes de congé apparaîtront ici.'}
                  </p>
                  {user.role !== 'employe' && (
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
                      {user.role === 'employe' ? 'Approbation superviseur' : 'Approbation administrateur'}
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
    </div>
  );
};

// Formations Component complet - Planning de formations
const Formations = () => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  const [sessions, setSessions] = useState([]);
  const [competences, setCompetences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [editSession, setEditSession] = useState({
    titre: '',
    competence_id: '',
    duree_heures: 8,
    date_debut: '',
    heure_debut: '09:00',
    lieu: '',
    formateur: '',
    descriptif: '',
    plan_cours: '',
    places_max: 20
  });
  const [newSession, setNewSession] = useState({
    titre: '',
    competence_id: '',
    duree_heures: 8,
    date_debut: '',
    heure_debut: '09:00',
    lieu: '',
    formateur: '',
    descriptif: '',
    plan_cours: '',
    places_max: 20
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchFormations = async () => {
      if (!tenantSlug) return;
      
      try {
        const [sessionsData, competencesData] = await Promise.all([
          apiGet(tenantSlug, '/sessions-formation'),
          apiGet(tenantSlug, '/formations')
        ]);
        setSessions(sessionsData);
        setCompetences(competencesData);
      } catch (error) {
        console.error('Erreur lors du chargement des formations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFormations();
  }, [tenantSlug]);

  const handleCreateSession = async () => {
    if (!newSession.titre || !newSession.competence_id || !newSession.date_debut || !newSession.lieu || !newSession.formateur) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPost(tenantSlug, '/sessions-formation', newSession);
      toast({
        title: "Formation créée",
        description: "La session de formation a été programmée avec succès",
        variant: "success"
      });
      setShowCreateModal(false);
      resetNewSession();
      
      // Reload sessions
      const sessionsData = await apiGet(tenantSlug, '/sessions-formation');
      setSessions(sessionsData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la session de formation",
        variant: "destructive"
      });
    }
  };

  const handleEditSession = (session) => {
    setSelectedSession(session);
    setEditSession({
      titre: session.titre,
      competence_id: session.competence_id,
      duree_heures: session.duree_heures,
      date_debut: session.date_debut,
      heure_debut: session.heure_debut,
      lieu: session.lieu,
      formateur: session.formateur,
      descriptif: session.descriptif || '',
      plan_cours: session.plan_cours || '',
      places_max: session.places_max
    });
    setShowEditModal(true);
  };

  const handleUpdateSession = async () => {
    if (!editSession.titre || !editSession.competence_id || !editSession.date_debut || !editSession.lieu || !editSession.formateur) {
      toast({
        title: "Champs requis",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    try {
      await apiPut(tenantSlug, `/sessions-formation/${selectedSession.id}`, editSession);
      toast({
        title: "Formation mise à jour",
        description: "La session de formation a été modifiée avec succès",
        variant: "success"
      });
      setShowEditModal(false);
      setSelectedSession(null);
      
      // Reload sessions
      const sessionsData = await apiGet(tenantSlug, '/sessions-formation');
      setSessions(sessionsData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier la session de formation",
        variant: "destructive"
      });
    }
  };

  const handleInscription = async (sessionId, isInscrit) => {
    try {
      if (isInscrit) {
        await apiDelete(tenantSlug, `/sessions-formation/${sessionId}/desinscription`);
        toast({
          title: "Désinscription réussie",
          description: "Vous êtes désinscrit de cette formation",
          variant: "success"
        });
      } else {
        await apiPost(tenantSlug, `/sessions-formation/${sessionId}/inscription`, {});
        toast({
          title: "Inscription réussie",
          description: "Vous êtes maintenant inscrit à cette formation",
          variant: "success"
        });
      }
      
      // Reload sessions
      const sessionsData = await apiGet(tenantSlug, '/sessions-formation');
      setSessions(sessionsData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.detail || error.message || "Impossible de traiter l'inscription",
        variant: "destructive"
      });
    }
  };

  const resetNewSession = () => {
    setNewSession({
      titre: '',
      competence_id: '',
      duree_heures: 8,
      date_debut: '',
      heure_debut: '09:00',
      lieu: '',
      formateur: '',
      descriptif: '',
      plan_cours: '',
      places_max: 20
    });
  };

  const getCompetenceName = (competenceId) => {
    const competence = competences.find(c => c.id === competenceId);
    return competence ? competence.nom : 'Compétence non trouvée';
  };

  const isUserInscrit = (session) => {
    return session.participants.includes(user.id);
  };

  const getStatutColor = (statut) => {
    switch (statut) {
      case 'planifie': return '#3B82F6';
      case 'en_cours': return '#F59E0B';
      case 'termine': return '#10B981';
      case 'annule': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatutLabel = (statut) => {
    switch (statut) {
      case 'planifie': return 'Planifiée';
      case 'en_cours': return 'En cours';
      case 'termine': return 'Terminée';
      case 'annule': return 'Annulée';
      default: return statut;
    }
  };

  if (loading) return <div className="loading" data-testid="formations-loading">Chargement des formations...</div>;

  return (
    <div className="formations-planning">
      <div className="formations-header">
        <div>
          <h1 data-testid="formations-title">Planning des formations</h1>
          <p>Sessions de formation et maintien des compétences</p>
        </div>
        {user.role !== 'employe' && (
          <Button 
            variant="default" 
            onClick={() => setShowCreateModal(true)}
            data-testid="create-session-btn"
          >
            📚 Créer une formation
          </Button>
        )}
      </div>

      {/* Statistiques des formations */}
      <div className="formations-stats">
        <div className="stat-card-formation">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <span className="stat-number">{sessions.filter(s => s.statut === 'planifie').length}</span>
            <span className="stat-label">Formations planifiées</span>
          </div>
        </div>
        <div className="stat-card-formation">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <span className="stat-number">{sessions.reduce((total, s) => total + s.participants.length, 0)}</span>
            <span className="stat-label">Participants inscrits</span>
          </div>
        </div>
        <div className="stat-card-formation">
          <div className="stat-icon">🎓</div>
          <div className="stat-content">
            <span className="stat-number">{sessions.filter(s => s.statut === 'termine').length}</span>
            <span className="stat-label">Formations terminées</span>
          </div>
        </div>
      </div>

      {/* Liste des sessions de formation */}
      <div className="sessions-list">
        {sessions.length > 0 ? (
          <div className="sessions-grid">
            {sessions.map(session => (
              <div key={session.id} className="session-card" data-testid={`session-${session.id}`}>
                <div className="session-header">
                  <div className="session-title-area">
                    <h3>{session.titre}</h3>
                    <span 
                      className="session-statut" 
                      style={{ backgroundColor: getStatutColor(session.statut) }}
                    >
                      {getStatutLabel(session.statut)}
                    </span>
                  </div>
                  <div className="session-competence">
                    <span className="competence-badge">{getCompetenceName(session.competence_id)}</span>
                  </div>
                </div>

                <div className="session-details">
                  <div className="detail-row">
                    <span className="detail-icon">📅</span>
                    <span>{new Date(session.date_debut).toLocaleDateString('fr-FR')} à {session.heure_debut}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">⏱️</span>
                    <span>{session.duree_heures}h de formation</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">📍</span>
                    <span>{session.lieu}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-icon">👨‍🏫</span>
                    <span>{session.formateur}</span>
                  </div>
                </div>

                <div className="session-description">
                  <p>{session.descriptif}</p>
                </div>

                <div className="session-participants">
                  <div className="participants-count">
                    <span className="count-badge">
                      {session.participants.length}/{session.places_max}
                    </span>
                    <span className="participants-label">participants</span>
                  </div>
                  <div className="participants-progress">
                    <div 
                      className="progress-bar"
                      style={{ 
                        width: `${(session.participants.length / session.places_max) * 100}%`,
                        backgroundColor: session.participants.length >= session.places_max ? '#EF4444' : '#10B981'
                      }}
                    ></div>
                  </div>
                </div>

                <div className="session-actions">
                  {session.statut === 'planifie' && (
                    <Button
                      variant={isUserInscrit(session) ? "destructive" : "default"}
                      onClick={() => handleInscription(session.id, isUserInscrit(session))}
                      data-testid={`inscription-btn-${session.id}`}
                      disabled={!isUserInscrit(session) && session.participants.length >= session.places_max}
                    >
                      {isUserInscrit(session) ? '❌ Se désinscrire' : 
                       session.participants.length >= session.places_max ? '🚫 Complet' : '✅ S\'inscrire'}
                    </Button>
                  )}
                  {user.role !== 'employe' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleEditSession(session)}
                      data-testid={`edit-session-${session.id}`}
                    >
                      ✏️ Modifier
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-sessions">
            <h3>Aucune formation planifiée</h3>
            <p>Les sessions de formation apparaîtront ici une fois programmées.</p>
            {user.role !== 'employe' && (
              <Button 
                variant="outline" 
                onClick={() => setShowCreateModal(true)}
                className="mt-4"
              >
                Créer la première formation
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modal de création de session */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="create-session-modal">
            <div className="modal-header">
              <h3>📚 Créer une session de formation</h3>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="session-form-grid">
                <div className="form-section">
                  <h4 className="section-title">📋 Informations générales</h4>
                  <div className="form-field">
                    <Label>Titre de la formation *</Label>
                    <Input
                      value={newSession.titre}
                      onChange={(e) => setNewSession({...newSession, titre: e.target.value})}
                      placeholder="Ex: Formation sauvetage aquatique - Niveau 1"
                      data-testid="session-titre-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Compétence associée *</Label>
                    <select
                      value={newSession.competence_id}
                      onChange={(e) => setNewSession({...newSession, competence_id: e.target.value})}
                      className="form-select"
                      data-testid="session-competence-select"
                    >
                      <option value="">Sélectionner une compétence</option>
                      {competences.map(comp => (
                        <option key={comp.id} value={comp.id}>
                          {comp.nom} - {comp.duree_heures}h
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Date de début *</Label>
                      <Input
                        type="date"
                        value={newSession.date_debut}
                        onChange={(e) => setNewSession({...newSession, date_debut: e.target.value})}
                        min={new Date().toISOString().split('T')[0]}
                        data-testid="session-date-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Heure de début *</Label>
                      <Input
                        type="time"
                        value={newSession.heure_debut}
                        onChange={(e) => setNewSession({...newSession, heure_debut: e.target.value})}
                        data-testid="session-heure-input"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Durée (heures) *</Label>
                      <Input
                        type="number"
                        min="1"
                        max="40"
                        value={newSession.duree_heures}
                        onChange={(e) => setNewSession({...newSession, duree_heures: parseInt(e.target.value)})}
                        data-testid="session-duree-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nombre de places *</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={newSession.places_max}
                        onChange={(e) => setNewSession({...newSession, places_max: parseInt(e.target.value)})}
                        data-testid="session-places-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="section-title">📍 Logistique</h4>
                  <div className="form-field">
                    <Label>Lieu de formation *</Label>
                    <Input
                      value={newSession.lieu}
                      onChange={(e) => setNewSession({...newSession, lieu: e.target.value})}
                      placeholder="Ex: Caserne centrale, Salle de formation A"
                      data-testid="session-lieu-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Formateur *</Label>
                    <Input
                      value={newSession.formateur}
                      onChange={(e) => setNewSession({...newSession, formateur: e.target.value})}
                      placeholder="Ex: Capitaine Martin Dubois"
                      data-testid="session-formateur-input"
                    />
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="section-title">📝 Contenu pédagogique</h4>
                  <div className="form-field">
                    <Label>Description de la formation *</Label>
                    <textarea
                      value={newSession.descriptif}
                      onChange={(e) => setNewSession({...newSession, descriptif: e.target.value})}
                      placeholder="Décrivez les objectifs et le contenu de cette formation..."
                      rows="3"
                      className="form-textarea"
                      data-testid="session-descriptif-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Plan de cours (optionnel)</Label>
                    <textarea
                      value={newSession.plan_cours}
                      onChange={(e) => setNewSession({...newSession, plan_cours: e.target.value})}
                      placeholder="Détaillez le programme, les modules, les exercices pratiques..."
                      rows="4"
                      className="form-textarea"
                      data-testid="session-plan-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleCreateSession} data-testid="create-session-submit-btn">
                  📚 Créer la formation
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifier Session */}
      {showEditModal && selectedSession && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="edit-session-modal">
            <div className="modal-header">
              <h3>✏️ Modifier la session de formation</h3>
              <Button variant="ghost" onClick={() => setShowEditModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="session-form-grid">
                <div className="form-section">
                  <h4 className="section-title">📋 Informations générales</h4>
                  <div className="form-field">
                    <Label>Titre de la formation *</Label>
                    <Input
                      value={editSession.titre}
                      onChange={(e) => setEditSession({...editSession, titre: e.target.value})}
                      placeholder="Ex: Formation sauvetage aquatique - Niveau 1"
                      data-testid="edit-session-titre-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Compétence associée *</Label>
                    <select
                      value={editSession.competence_id}
                      onChange={(e) => setEditSession({...editSession, competence_id: e.target.value})}
                      className="form-select"
                      data-testid="edit-session-competence-select"
                    >
                      <option value="">Sélectionner une compétence</option>
                      {competences.map(comp => (
                        <option key={comp.id} value={comp.id}>
                          {comp.nom} - {comp.duree_heures}h
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Date de début *</Label>
                      <Input
                        type="date"
                        value={editSession.date_debut}
                        onChange={(e) => setEditSession({...editSession, date_debut: e.target.value})}
                        data-testid="edit-session-date-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Heure de début *</Label>
                      <Input
                        type="time"
                        value={editSession.heure_debut}
                        onChange={(e) => setEditSession({...editSession, heure_debut: e.target.value})}
                        data-testid="edit-session-heure-input"
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-field">
                      <Label>Durée (heures) *</Label>
                      <Input
                        type="number"
                        min="1"
                        max="40"
                        value={editSession.duree_heures}
                        onChange={(e) => setEditSession({...editSession, duree_heures: parseInt(e.target.value)})}
                        data-testid="edit-session-duree-input"
                      />
                    </div>
                    <div className="form-field">
                      <Label>Nombre de places *</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={editSession.places_max}
                        onChange={(e) => setEditSession({...editSession, places_max: parseInt(e.target.value)})}
                        data-testid="edit-session-places-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="section-title">📍 Logistique</h4>
                  <div className="form-field">
                    <Label>Lieu de formation *</Label>
                    <Input
                      value={editSession.lieu}
                      onChange={(e) => setEditSession({...editSession, lieu: e.target.value})}
                      placeholder="Ex: Caserne centrale, Salle de formation A"
                      data-testid="edit-session-lieu-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Formateur *</Label>
                    <Input
                      value={editSession.formateur}
                      onChange={(e) => setEditSession({...editSession, formateur: e.target.value})}
                      placeholder="Ex: Capitaine Martin Dubois"
                      data-testid="edit-session-formateur-input"
                    />
                  </div>
                </div>

                <div className="form-section">
                  <h4 className="section-title">📝 Contenu pédagogique</h4>
                  <div className="form-field">
                    <Label>Description de la formation *</Label>
                    <textarea
                      value={editSession.descriptif}
                      onChange={(e) => setEditSession({...editSession, descriptif: e.target.value})}
                      placeholder="Décrivez les objectifs et le contenu de cette formation..."
                      rows="3"
                      className="form-textarea"
                      data-testid="edit-session-descriptif-input"
                    />
                  </div>

                  <div className="form-field">
                    <Label>Plan de cours (optionnel)</Label>
                    <textarea
                      value={editSession.plan_cours}
                      onChange={(e) => setEditSession({...editSession, plan_cours: e.target.value})}
                      placeholder="Détaillez le programme, les modules, les exercices pratiques..."
                      rows="4"
                      className="form-textarea"
                      data-testid="edit-session-plan-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowEditModal(false)}>
                  Annuler
                </Button>
                <Button variant="default" onClick={handleUpdateSession} data-testid="update-session-submit-btn">
                  💾 Sauvegarder les modifications
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Mes Disponibilités Component - Module dédié
const MesDisponibilites = ({ managingUser, setCurrentPage, setManagingUserDisponibilites }) => {
  const { user } = useAuth();
  const { tenantSlug } = useTenant();
  
  // Déterminer quel utilisateur on gère (soi-même ou un autre)
  const targetUser = managingUser || user;
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [parametresDisponibilites, setParametresDisponibilites] = useState(null);
  const { toast } = useToast();
  
  // États pour le calendrier visuel mensuel
  const [calendarCurrentMonth, setCalendarCurrentMonth] = useState(new Date().getMonth());
  const [calendarCurrentYear, setCalendarCurrentYear] = useState(new Date().getFullYear());
  const [selectedDayForDetail, setSelectedDayForDetail] = useState(null);
  const [showDayDetailModal, setShowDayDetailModal] = useState(false);
  const [dayDetailData, setDayDetailData] = useState({ disponibilites: [], indisponibilites: [] });
  const [selectedDateDetails, setSelectedDateDetails] = useState(null);
  const [pendingConfigurations, setPendingConfigurations] = useState([]);
  const [availabilityConfig, setAvailabilityConfig] = useState({
    type_garde_id: '',
    heure_debut: '08:00',
    heure_fin: '16:00',
    statut: 'disponible',
    // Pour mode récurrence
    mode: 'calendrier', // 'calendrier' ou 'recurrence'
    date_debut: new Date().toISOString().split('T')[0],
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    recurrence_type: 'hebdomadaire',
    recurrence_frequence: 'jours',
    recurrence_intervalle: 1
  });
  const [generationConfig, setGenerationConfig] = useState({
    horaire_type: 'montreal',
    equipe: 'Rouge',
    date_debut: new Date().toISOString().split('T')[0],  // Date du jour
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],  // 31 décembre de l'année en cours
    conserver_manuelles: true
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [indispoTab, setIndispoTab] = useState('generation'); // 'generation', 'manuelle_calendrier', 'manuelle_recurrence'
  const [manualIndispoMode, setManualIndispoMode] = useState('calendrier'); // 'calendrier' ou 'recurrence'
  const [manualIndispoConfig, setManualIndispoConfig] = useState({
    // Pour mode calendrier (clics multiples)
    dates: [],
    
    // Pour mode récurrence
    date_debut: new Date().toISOString().split('T')[0],
    date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    heure_debut: '00:00',
    heure_fin: '23:59',
    
    // Options de récurrence
    recurrence_type: 'hebdomadaire', // 'hebdomadaire', 'bihebdomadaire', 'mensuelle', 'annuelle', 'personnalisee'
    recurrence_frequence: 'jours', // Pour personnalisée: 'jours', 'semaines', 'mois', 'ans'
    recurrence_intervalle: 1 // Tous les X (jours/semaines/mois/ans)
  });
  const [showReinitModal, setShowReinitModal] = useState(false);
  const [reinitConfig, setReinitConfig] = useState({
    periode: 'mois',
    mode: 'generees_seulement',
    type_entree: 'les_deux'
  });
  const [isReinitializing, setIsReinitializing] = useState(false);
  
  // Nouveau modal d'ajout rapide
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddType, setQuickAddType] = useState('disponibilite'); // 'disponibilite' ou 'indisponibilite'
  const [quickAddConfig, setQuickAddConfig] = useState({
    date: new Date().toISOString().split('T')[0],
    type_garde_id: '',
    heure_debut: '08:00',
    heure_fin: '16:00'
  });

  useEffect(() => {
    const fetchDisponibilites = async () => {
      if (!tenantSlug) return;
      
      try {
        const [dispoData, typesData, paramsData] = await Promise.all([
          apiGet(tenantSlug, `/disponibilites/${targetUser.id}`),
          apiGet(tenantSlug, '/types-garde'),
          apiGet(tenantSlug, '/parametres/disponibilites').catch(() => ({ jour_blocage_dispos: 15 }))
        ]);
        setUserDisponibilites(dispoData);
        setTypesGarde(typesData);
        setParametresDisponibilites(paramsData);
      } catch (error) {
        console.error('Erreur lors du chargement des disponibilités:', error);
      } finally {
        setLoading(false);
      }
    };

    if (targetUser?.id && targetUser?.type_emploi === 'temps_partiel') {
      fetchDisponibilites();
    } else {
      setLoading(false);
    }
  }, [targetUser?.id, tenantSlug]);

  const handleTypeGardeChange = (typeGardeId) => {
    const selectedType = typesGarde.find(t => t.id === typeGardeId);
    
    if (selectedType) {
      // Auto-remplir les horaires du type de garde
      setAvailabilityConfig({
        ...availabilityConfig,
        type_garde_id: typeGardeId,
        heure_debut: selectedType.heure_debut,
        heure_fin: selectedType.heure_fin
      });
    } else {
      // "Tous les types" - garder les horaires personnalisés
      setAvailabilityConfig({
        ...availabilityConfig,
        type_garde_id: typeGardeId
      });
    }
  };


  // Vérifier si un mois est bloqué selon les paramètres
  const estMoisBloque = (date) => {
    if (!parametresDisponibilites) return false;
    
    // Exception pour admin/superviseur si paramètre activé
    const exceptionsActives = parametresDisponibilites.exceptions_admin_superviseur !== false; // true par défaut
    if (exceptionsActives && user?.role && (user.role === 'admin' || user.role === 'superviseur')) {
      return false; // Admin/Superviseur jamais bloqués si exceptions activées
    }
    
    const jourBlocage = parametresDisponibilites.jour_blocage_dispos || 15;
    const dateObj = new Date(date);
    const aujourd_hui = new Date();
    
    const moisDate = dateObj.getMonth();
    const anDate = dateObj.getFullYear();
    const moisActuel = aujourd_hui.getMonth();
    const anActuel = aujourd_hui.getFullYear();
    const jourActuel = aujourd_hui.getDate();
    
    // Si on est après le jour de blocage du mois actuel
    // ET que la date est pour le mois suivant ou après
    if (jourActuel >= jourBlocage) {
      // Bloquer le mois suivant
      const moisSuivant = (moisActuel + 1) % 12;
      const anSuivant = moisActuel === 11 ? anActuel + 1 : anActuel;
      
      if (anDate === anSuivant && moisDate === moisSuivant) {
        return true;
      }
      // Bloquer aussi les mois encore plus loin
      if (anDate > anSuivant || (anDate === anSuivant && moisDate > moisSuivant)) {
        return true;
      }
    }
    
    return false;
  };



  const handleAddConfiguration = () => {
    if (selectedDates.length === 0) {
      toast({
        title: "Aucune date sélectionnée",
        description: "Veuillez sélectionner au moins une date",
        variant: "destructive"
      });
      return;
    }
    
    // Vérifier si certaines dates sont bloquées
    const datesBloquees = selectedDates.filter(date => estMoisBloque(date));
    if (datesBloquees.length > 0) {
      const jourBlocage = parametresDisponibilites?.jour_blocage_dispos || 15;
      toast({
        title: "Dates bloquées",
        description: `Impossible de modifier les disponibilités du mois suivant après le ${jourBlocage} du mois. ${datesBloquees.length} date(s) bloquée(s).`,
        variant: "destructive"
      });
      return;
    }

    const selectedType = typesGarde.find(t => t.id === availabilityConfig.type_garde_id);
    const newConfig = {
      id: Date.now(),
      type_garde_id: availabilityConfig.type_garde_id,
      type_garde_name: selectedType ? selectedType.nom : 'Tous les types',
      couleur: selectedType ? selectedType.couleur : '#10B981',
      heure_debut: selectedType ? selectedType.heure_debut : availabilityConfig.heure_debut,
      heure_fin: selectedType ? selectedType.heure_fin : availabilityConfig.heure_fin,
      statut: availabilityConfig.statut,
      dates: [...selectedDates]
    };

    setPendingConfigurations([...pendingConfigurations, newConfig]);
    setSelectedDates([]);
    
    toast({
      title: "Configuration ajoutée",
      description: `${newConfig.dates.length} jour(s) pour ${newConfig.type_garde_name}`,
      variant: "success"
    });
  };

  const handleRemoveConfiguration = (configId) => {
    setPendingConfigurations(prev => prev.filter(c => c.id !== configId));
  };

  const handleSaveAllConfigurations = async () => {
    if (pendingConfigurations.length === 0) {
      toast({
        title: "Aucune configuration",
        description: "Veuillez ajouter au moins une configuration",
        variant: "destructive"
      });
      return;
    }

    try {
      // Combiner avec les disponibilités existantes + nouvelles configurations
      const existingDispos = userDisponibilites.map(d => ({
        user_id: targetUser.id,
        date: d.date,
        type_garde_id: d.type_garde_id || null,
        heure_debut: d.heure_debut,
        heure_fin: d.heure_fin,
        statut: d.statut
      }));

      const newDispos = pendingConfigurations.flatMap(config => 
        config.dates.map(date => ({
          user_id: targetUser.id,
          date: date.toISOString().split('T')[0],
          type_garde_id: config.type_garde_id || null,
          heure_debut: config.heure_debut,
          heure_fin: config.heure_fin,
          statut: config.statut
        }))
      );

      const allDisponibilites = [...existingDispos, ...newDispos];

      await apiPut(tenantSlug, `/disponibilites/${targetUser.id}`, allDisponibilites);
      
      toast({
        title: "Toutes les disponibilités sauvegardées",
        description: `${newDispos.length} nouvelles disponibilités ajoutées`,
        variant: "success"
      });
      
      setShowCalendarModal(false);
      setPendingConfigurations([]);
      
      // Reload disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder",
        variant: "destructive"
      });
    }
  };

  const handleSaveAvailability = async () => {
    try {
      let disponibilitesACreer = [];
      
      if (availabilityConfig.mode === 'calendrier') {
        // MODE CALENDRIER: Clics multiples sur dates
        if (selectedDates.length === 0) {
          toast({
            title: "Aucune date sélectionnée",
            description: "Veuillez cliquer sur les dates dans le calendrier",
            variant: "destructive"
          });
          return;
        }
        
        // Créer une disponibilité pour chaque date sélectionnée
        for (const date of selectedDates) {
          disponibilitesACreer.push({
            user_id: targetUser.id,
            date: date.toISOString().split('T')[0],
            type_garde_id: availabilityConfig.type_garde_id || null,
            heure_debut: availabilityConfig.heure_debut,
            heure_fin: availabilityConfig.heure_fin,
            statut: availabilityConfig.statut,
            origine: 'manuelle'
          });
        }
        
      } else {
        // MODE RÉCURRENCE: Date début/fin avec récurrence
        const dateDebut = new Date(availabilityConfig.date_debut);
        const dateFin = new Date(availabilityConfig.date_fin);
        
        if (dateDebut > dateFin) {
          toast({
            title: "Dates invalides",
            description: "La date de début doit être avant la date de fin",
            variant: "destructive"
          });
          return;
        }
        
        // Calculer l'intervalle selon le type de récurrence
        let intervalJours = 1;
        
        switch (availabilityConfig.recurrence_type) {
          case 'hebdomadaire':
            intervalJours = 7;
            break;
          case 'bihebdomadaire':
            intervalJours = 14;
            break;
          case 'mensuelle':
            intervalJours = 30;
            break;
          case 'annuelle':
            intervalJours = 365;
            break;
          case 'personnalisee':
            if (availabilityConfig.recurrence_frequence === 'jours') {
              intervalJours = availabilityConfig.recurrence_intervalle;
            } else if (availabilityConfig.recurrence_frequence === 'semaines') {
              intervalJours = availabilityConfig.recurrence_intervalle * 7;
            } else if (availabilityConfig.recurrence_frequence === 'mois') {
              intervalJours = availabilityConfig.recurrence_intervalle * 30;
            } else if (availabilityConfig.recurrence_frequence === 'ans') {
              intervalJours = availabilityConfig.recurrence_intervalle * 365;
            }
            break;
        }
        
        // Générer les dates avec récurrence
        let currentDate = new Date(dateDebut);
        let compteur = 0;
        const maxIterations = 1000;
        
        while (currentDate <= dateFin && compteur < maxIterations) {
          disponibilitesACreer.push({
            user_id: targetUser.id,
            date: currentDate.toISOString().split('T')[0],
            type_garde_id: availabilityConfig.type_garde_id || null,
            heure_debut: availabilityConfig.heure_debut,
            heure_fin: availabilityConfig.heure_fin,
            statut: availabilityConfig.statut,
            origine: 'manuelle'
          });
          
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + intervalJours);
          compteur++;
        }
      }
      
      // Filtrer les dates bloquées avant création
      const disponibilitesNonBloquees = disponibilitesACreer.filter(dispo => {
        return !estMoisBloque(dispo.date);
      });
      
      const datesBloquees = disponibilitesACreer.length - disponibilitesNonBloquees.length;
      
      if (datesBloquees > 0) {
        const jourBlocage = parametresDisponibilites?.jour_blocage_dispos || 15;
        toast({
          title: "Certaines dates bloquées",
          description: `${datesBloquees} date(s) du mois suivant ignorée(s) (blocage au ${jourBlocage} du mois)`,
          variant: "default"
        });
      }
      
      if (disponibilitesNonBloquees.length === 0) {
        toast({
          title: "Aucune disponibilité créée",
          description: "Toutes les dates sont bloquées",
          variant: "destructive"
        });
        return;
      }
      
      // Envoyer les disponibilités au backend
      for (const dispo of disponibilitesNonBloquees) {
        await apiPost(tenantSlug, '/disponibilites', dispo);
      }
      
      toast({
        title: "Disponibilités enregistrées",
        description: `${disponibilitesNonBloquees.length} disponibilité(s) ajoutée(s) avec succès`,
        variant: "success"
      });
      
      setShowCalendarModal(false);
      setSelectedDates([]);
      
      // Réinitialiser la config
      setAvailabilityConfig({
        type_garde_id: '',
        heure_debut: '08:00',
        heure_fin: '16:00',
        statut: 'disponible',
        mode: 'calendrier',
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        recurrence_type: 'hebdomadaire',
        recurrence_frequence: 'jours',
        recurrence_intervalle: 1
      });
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur sauvegarde disponibilités:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'enregistrer les disponibilités",
        variant: "destructive"
      });
    }
  };


  // Fonctions pour le calendrier visuel
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month, year) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convertir dimanche (0) en 6, lundi reste 0
  };

  const navigateMonth = (direction) => {
    if (direction === 'prev') {
      if (calendarCurrentMonth === 0) {
        setCalendarCurrentMonth(11);
        setCalendarCurrentYear(calendarCurrentYear - 1);
      } else {
        setCalendarCurrentMonth(calendarCurrentMonth - 1);
      }
    } else {
      if (calendarCurrentMonth === 11) {
        setCalendarCurrentMonth(0);
        setCalendarCurrentYear(calendarCurrentYear + 1);
      } else {
        setCalendarCurrentMonth(calendarCurrentMonth + 1);
      }
    }
  };

  const getDisponibilitesForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return userDisponibilites.filter(d => d.date === dateStr);
  };

  const handleDayClick = (dayNumber) => {
    const clickedDate = new Date(calendarCurrentYear, calendarCurrentMonth, dayNumber);
    const dateStr = clickedDate.toISOString().split('T')[0];
    
    const disponibilites = userDisponibilites.filter(d => d.date === dateStr && d.statut === 'disponible');
    const indisponibilites = userDisponibilites.filter(d => d.date === dateStr && d.statut === 'indisponible');
    
    setSelectedDayForDetail(clickedDate);
    setDayDetailData({ disponibilites, indisponibilites });
    setShowDayDetailModal(true);
  };

  const handleDeleteDisponibilite = async (dispoId) => {
    try {
      await apiDelete(tenantSlug, `/disponibilites/${dispoId}`);
      toast({
        title: "Supprimé",
        description: "Entrée supprimée avec succès",
        variant: "success"
      });
      
      // Recharger
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      // Mettre à jour le modal
      const dateStr = selectedDayForDetail.toISOString().split('T')[0];
      const disponibilites = dispoData.filter(d => d.date === dateStr && d.statut === 'disponible');
      const indisponibilites = dispoData.filter(d => d.date === dateStr && d.statut === 'indisponible');
      setDayDetailData({ disponibilites, indisponibilites });
      
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer",
        variant: "destructive"
      });
    }
  };

  const getMonthName = (month) => {
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return months[month];
  };


  const handleGenerateIndisponibilites = async () => {
    setIsGenerating(true);
    
    try {
      const response = await apiPost(tenantSlug, '/disponibilites/generer', {
        user_id: targetUser.id,
        horaire_type: generationConfig.horaire_type,
        equipe: generationConfig.equipe,
        date_debut: generationConfig.date_debut,
        date_fin: generationConfig.date_fin,
        conserver_manuelles: generationConfig.conserver_manuelles
      });
      
      toast({
        title: "Génération réussie",
        description: `${response.nombre_indisponibilites} indisponibilités générées pour ${generationConfig.horaire_type === 'montreal' ? 'Montreal 7/24' : 'Quebec 10/14'} - Équipe ${generationConfig.equipe} (${generationConfig.date_debut} au ${generationConfig.date_fin})`,
        variant: "success"
      });
      
      setShowGenerationModal(false);
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur génération:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de générer les indisponibilités",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReinitialiser = async () => {
    setIsReinitializing(true);
    
    try {
      const response = await apiCall(tenantSlug, '/disponibilites/reinitialiser', {
        method: 'DELETE',
        body: JSON.stringify({
          user_id: targetUser.id,
          periode: reinitConfig.periode,
          mode: reinitConfig.mode,
          type_entree: reinitConfig.type_entree
        })
      });
      
      const periodeLabel = {
        'semaine': 'la semaine courante',
        'mois': 'le mois courant',
        'annee': "l'année courante"
      }[reinitConfig.periode];
      
      const typeLabel = {
        'disponibilites': 'disponibilités',
        'indisponibilites': 'indisponibilités',
        'les_deux': 'disponibilités et indisponibilités'
      }[reinitConfig.type_entree];
      
      const modeLabel = reinitConfig.mode === 'tout' 
        ? 'Toutes les' 
        : 'Les entrées générées automatiquement de';
      
      toast({
        title: "Réinitialisation réussie",
        description: `${modeLabel} ${typeLabel} de ${periodeLabel} ont été supprimées (${response.nombre_supprimees} entrée(s))`,
        variant: "success"
      });
      
      setShowReinitModal(false);
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur réinitialisation:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de réinitialiser",
        variant: "destructive"
      });
    } finally {
      setIsReinitializing(false);
    }
  };

  const handleSaveManualIndisponibilites = async () => {
    try {
      let indisponibilitesACreer = [];
      
      if (manualIndispoMode === 'calendrier') {
        // MODE CALENDRIER: Clics multiples sur dates
        if (manualIndispoConfig.dates.length === 0) {
          toast({
            title: "Aucune date sélectionnée",
            description: "Veuillez cliquer sur les dates dans le calendrier",
            variant: "destructive"
          });
          return;
        }
        
        // Créer une indisponibilité pour chaque date sélectionnée
        for (const date of manualIndispoConfig.dates) {
          indisponibilitesACreer.push({
            user_id: targetUser.id,
            date: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().split('T')[0],
            type_garde_id: null,
            heure_debut: manualIndispoConfig.heure_debut,
            heure_fin: manualIndispoConfig.heure_fin,
            statut: 'indisponible',
            origine: 'manuelle'
          });
        }
        
      } else {
        // MODE RÉCURRENCE: Date début/fin avec récurrence
        const dateDebut = new Date(manualIndispoConfig.date_debut);
        const dateFin = new Date(manualIndispoConfig.date_fin);
        
        if (dateDebut > dateFin) {
          toast({
            title: "Dates invalides",
            description: "La date de début doit être avant la date de fin",
            variant: "destructive"
          });
          return;
        }
        
        // Calculer l'intervalle selon le type de récurrence
        let intervalJours = 1;
        
        switch (manualIndispoConfig.recurrence_type) {
          case 'hebdomadaire':
            intervalJours = 7;
            break;
          case 'bihebdomadaire':
            intervalJours = 14;
            break;
          case 'mensuelle':
            intervalJours = 30; // Approximation
            break;
          case 'annuelle':
            intervalJours = 365;
            break;
          case 'personnalisee':
            // Calculer selon la fréquence et l'intervalle
            if (manualIndispoConfig.recurrence_frequence === 'jours') {
              intervalJours = manualIndispoConfig.recurrence_intervalle;
            } else if (manualIndispoConfig.recurrence_frequence === 'semaines') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 7;
            } else if (manualIndispoConfig.recurrence_frequence === 'mois') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 30;
            } else if (manualIndispoConfig.recurrence_frequence === 'ans') {
              intervalJours = manualIndispoConfig.recurrence_intervalle * 365;
            }
            break;
        }
        
        // Générer les dates avec récurrence
        let currentDate = new Date(dateDebut);
        let compteur = 0;
        const maxIterations = 1000; // Sécurité pour éviter boucle infinie
        
        while (currentDate <= dateFin && compteur < maxIterations) {
          indisponibilitesACreer.push({
            user_id: targetUser.id,
            date: currentDate.toISOString().split('T')[0],
            type_garde_id: null,
            heure_debut: manualIndispoConfig.heure_debut,
            heure_fin: manualIndispoConfig.heure_fin,
            statut: 'indisponible',
            origine: 'manuelle'
          });
          
          // Avancer à la prochaine date
          currentDate = new Date(currentDate);
          currentDate.setDate(currentDate.getDate() + intervalJours);
          compteur++;
        }
      }
      
      // Envoyer les indisponibilités au backend
      for (const indispo of indisponibilitesACreer) {
        await apiPost(tenantSlug, '/disponibilites', indispo);
      }
      
      toast({
        title: "Indisponibilités enregistrées",
        description: `${indisponibilitesACreer.length} indisponibilité(s) ajoutée(s) avec succès`,
        variant: "success"
      });
      
      setShowGenerationModal(false);
      
      // Réinitialiser la config
      setManualIndispoConfig({
        dates: [],
        date_debut: new Date().toISOString().split('T')[0],
        date_fin: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
        heure_debut: '00:00',
        heure_fin: '23:59',
        recurrence_type: 'hebdomadaire',
        recurrence_frequence: 'jours',
        recurrence_intervalle: 1
      });
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
    } catch (error) {
      console.error('Erreur sauvegarde indisponibilités:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'enregistrer les indisponibilités",
        variant: "destructive"
      });
    }
  };

  const getTypeGardeName = (typeGardeId) => {
    if (!typeGardeId) return 'Tous types';
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.nom : 'Type non spécifié';
  };

  const getAvailableDates = () => {
    return userDisponibilites
      .filter(d => d.statut === 'disponible')
      .map(d => new Date(d.date));
  };

  const getColorByTypeGarde = (typeGardeId) => {
    if (!typeGardeId) return '#10B981'; // Vert par défaut pour "Tous types"
    const typeGarde = typesGarde.find(t => t.id === typeGardeId);
    return typeGarde ? typeGarde.couleur : '#10B981';
  };

  // Fonction pour sauvegarde rapide (ajout simple d'une dispo ou indispo)
  const handleQuickAddSave = async () => {
    try {
      // Validation
      if (!quickAddConfig.date) {
        toast({
          title: "Erreur",
          description: "Veuillez sélectionner une date",
          variant: "destructive"
        });
        return;
      }

      // Créer l'entrée
      const newEntry = {
        user_id: targetUser.id,
        date: quickAddConfig.date,
        type_garde_id: quickAddConfig.type_garde_id || null,
        heure_debut: quickAddConfig.heure_debut,
        heure_fin: quickAddConfig.heure_fin,
        statut: quickAddType === 'disponibilite' ? 'disponible' : 'indisponible',
        origine: 'manuelle'
      };

      // Récupérer les disponibilités existantes
      const existingDispos = userDisponibilites.map(d => ({
        user_id: d.user_id,
        date: d.date,
        type_garde_id: d.type_garde_id || null,
        heure_debut: d.heure_debut,
        heure_fin: d.heure_fin,
        statut: d.statut,
        origine: d.origine
      }));

      // Ajouter la nouvelle entrée
      const allDisponibilites = [...existingDispos, newEntry];

      // Sauvegarder
      await apiPut(tenantSlug, `/disponibilites/${targetUser.id}`, allDisponibilites);
      
      toast({
        title: "✅ Enregistré !",
        description: quickAddType === 'disponibilite' 
          ? `Disponibilité ajoutée pour le ${quickAddConfig.date}`
          : `Indisponibilité ajoutée pour le ${quickAddConfig.date}`,
        variant: "success"
      });
      
      setShowQuickAddModal(false);
      
      // Recharger les disponibilités
      const dispoData = await apiGet(tenantSlug, `/disponibilites/${targetUser.id}`);
      setUserDisponibilites(dispoData);
      
      // Réinitialiser le formulaire
      setQuickAddConfig({
        date: new Date().toISOString().split('T')[0],
        type_garde_id: '',
        heure_debut: '08:00',
        heure_fin: '16:00'
      });
      
    } catch (error) {
      console.error('Erreur sauvegarde rapide:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'enregistrer",
        variant: "destructive"
      });
    }
  };

  const getDisponibiliteForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return userDisponibilites.find(d => d.date === dateStr);
  };

  const handleDateClick = (date) => {
    // Normaliser la date en UTC pour éviter les problèmes de fuseau horaire
    const normalizedDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dateStr = normalizedDate.toISOString().split('T')[0];
    const dispos = userDisponibilites.filter(d => d.date === dateStr);
    
    console.log('Date cliquée:', dateStr, 'Disponibilités trouvées:', dispos.length);
    
    if (dispos.length > 0) {
      // Afficher TOUTES les disponibilités pour cette date
      setSelectedDateDetails({
        date: normalizedDate,
        disponibilites: dispos, // Tableau au lieu d'un seul objet
        count: dispos.length
      });
    } else {
      setSelectedDateDetails(null);
    }
  };

  // Vérifier le type d'emploi de la personne dont on gère les disponibilités
  if (targetUser?.type_emploi !== 'temps_partiel') {
    return (
      <div className="access-denied">
        <h1>Module réservé aux employés temps partiel</h1>
        <p>Ce module permet aux employés à temps partiel de gérer leurs disponibilités.</p>
        {managingUser && (
          <p style={{ marginTop: '10px', color: '#dc2626' }}>
            ⚠️ <strong>{targetUser?.prenom} {targetUser?.nom}</strong> est un employé <strong>temps plein</strong> et ne peut pas gérer de disponibilités.
          </p>
        )}
      </div>
    );
  }

  if (loading) return <div className="loading" data-testid="disponibilites-loading">Chargement...</div>;

  return (
    <div className="mes-disponibilites">
      {/* Bouton retour si on gère un autre utilisateur */}
      {managingUser && (
        <div style={{ marginBottom: '20px' }}>
          <Button 
            variant="outline" 
            onClick={() => {
              setManagingUserDisponibilites(null);
              setCurrentPage('personnel');
            }}
          >
            ← Retour à Personnel
          </Button>
        </div>
      )}

      {/* Module Disponibilités - Design Visuel avec Grand Calendrier */}
      <div className="disponibilites-visual-container">
        {/* Header avec titre et actions */}
        <div className="disponibilites-visual-header">
          <div>
            <h1 data-testid="disponibilites-title">
              {managingUser 
                ? `Disponibilités de ${targetUser.prenom} ${targetUser.nom}`
                : 'Mes disponibilités'}
            </h1>
            <p>
              {managingUser 
                ? `Calendrier visuel et interactif de ${targetUser.prenom} ${targetUser.nom}`
                : 'Calendrier visuel et interactif de vos disponibilités'}
            </p>
          </div>
          <div className="disponibilites-actions">
            <Button 
              variant="default" 
              onClick={() => setShowCalendarModal(true)}
              data-testid="configure-availability-btn"
            >
              ✅ Gérer disponibilités
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowGenerationModal(true)}
              data-testid="generate-indisponibilites-btn"
            >
              ❌ Gérer indisponibilités
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => setShowReinitModal(true)}
              data-testid="reinit-disponibilites-btn"
            >
              🗑️ Réinitialiser
            </Button>
          </div>
        </div>

        {/* Barre de navigation du mois */}
        <div className="calendar-navigation-bar">
          <button 
            className="calendar-nav-button" 
            onClick={() => navigateMonth('prev')}
          >
            ◀
          </button>
          <div className="calendar-month-title">
            {getMonthName(calendarCurrentMonth)} {calendarCurrentYear}
          </div>
          <button 
            className="calendar-nav-button" 
            onClick={() => navigateMonth('next')}
          >
            ▶
          </button>
        </div>

        {/* Grand Calendrier Visuel */}
        <div className="visual-calendar">
          {/* Jours de la semaine */}
          <div className="calendar-weekdays">
            <div className="calendar-weekday">Lun</div>
            <div className="calendar-weekday">Mar</div>
            <div className="calendar-weekday">Mer</div>
            <div className="calendar-weekday">Jeu</div>
            <div className="calendar-weekday">Ven</div>
            <div className="calendar-weekday">Sam</div>
            <div className="calendar-weekday">Dim</div>
          </div>

          {/* Grille des jours */}
          <div className="calendar-days-grid">
            {/* Cases vides pour aligner le premier jour */}
            {Array.from({ length: getFirstDayOfMonth(calendarCurrentMonth, calendarCurrentYear) }).map((_, index) => (
              <div key={`empty-${index}`} className="calendar-day-cell empty"></div>
            ))}

            {/* Jours du mois */}
            {Array.from({ length: getDaysInMonth(calendarCurrentMonth, calendarCurrentYear) }).map((_, dayIndex) => {
              const dayNumber = dayIndex + 1;
              const currentDate = new Date(calendarCurrentYear, calendarCurrentMonth, dayNumber);
              const dateStr = currentDate.toISOString().split('T')[0];
              const today = new Date();
              const isToday = currentDate.toDateString() === today.toDateString();
              
              const dayDispos = userDisponibilites.filter(d => d.date === dateStr);
              const disponibilites = dayDispos.filter(d => d.statut === 'disponible');
              const hasIndisponibilite = dayDispos.some(d => d.statut === 'indisponible');

              return (
                <div 
                  key={dayNumber} 
                  className={`calendar-day-cell ${isToday ? 'today' : ''}`}
                  onClick={() => handleDayClick(dayNumber)}
                >
                  <div className="calendar-day-number">{dayNumber}</div>
                  <div className="calendar-day-content">
                    {/* Indisponibilité: croix rouge */}
                    {hasIndisponibilite && (
                      <div className="calendar-indispo-marker">❌</div>
                    )}

                    {/* Disponibilités: pastilles colorées */}
                    {!hasIndisponibilite && disponibilites.length > 0 && (
                      <div className="calendar-dispo-pills">
                        {disponibilites.slice(0, 2).map((dispo, idx) => {
                          const typeGarde = typesGarde.find(t => t.id === dispo.type_garde_id);
                          const color = typeGarde?.couleur || '#3b82f6';
                          const typeName = typeGarde?.nom || 'Dispo';
                          
                          return (
                            <div 
                              key={idx}
                              className="calendar-dispo-pill"
                              style={{ backgroundColor: color }}
                              title={`${typeName} ${dispo.heure_debut}-${dispo.heure_fin}`}
                            >
                              {typeName}
                            </div>
                          );
                        })}
                        {disponibilites.length > 2 && (
                          <div className="calendar-dispo-more">+{disponibilites.length - 2}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Légende du calendrier */}
        <div className="calendar-legend">
          <div className="calendar-legend-item">
            <span className="calendar-legend-icon">❌</span>
            <span className="calendar-legend-label">Indisponible</span>
          </div>
          {typesGarde.map(type => (
            <div key={type.id} className="calendar-legend-item">
              <div 
                className="calendar-legend-pill" 
                style={{ backgroundColor: type.couleur }}
              ></div>
              <span className="calendar-legend-label">{type.nom}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal détail du jour */}
      {showDayDetailModal && selectedDayForDetail && (
        <div className="day-detail-modal" onClick={() => setShowDayDetailModal(false)}>
          <div className="day-detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="day-detail-header">
              <h3>📅 {selectedDayForDetail.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
              <Button variant="ghost" onClick={() => setShowDayDetailModal(false)}>✕</Button>
            </div>
            
            <div className="day-detail-body">
              {/* Disponibilités */}
              <div className="day-detail-section">
                <h4>✅ Disponibilités ({dayDetailData.disponibilites.length})</h4>
                {dayDetailData.disponibilites.length === 0 ? (
                  <div className="day-detail-empty">Aucune disponibilité ce jour</div>
                ) : (
                  dayDetailData.disponibilites.map(dispo => {
                    const typeGarde = typesGarde.find(t => t.id === dispo.type_garde_id);
                    return (
                      <div key={dispo.id} className="day-detail-item">
                        <div className="day-detail-item-header">
                          <span className="day-detail-item-type" style={{ color: typeGarde?.couleur || '#3b82f6' }}>
                            {typeGarde?.nom || 'Disponibilité'}
                          </span>
                          <div className="day-detail-item-actions">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDeleteDisponibilite(dispo.id)}
                            >
                              🗑️ Supprimer
                            </Button>
                          </div>
                        </div>
                        <div className="day-detail-item-info">
                          ⏰ {dispo.heure_debut} - {dispo.heure_fin}
                          {dispo.origine && <span> • Origine: {dispo.origine}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Indisponibilités */}
              <div className="day-detail-section">
                <h4>❌ Indisponibilités ({dayDetailData.indisponibilites.length})</h4>
                {dayDetailData.indisponibilites.length === 0 ? (
                  <div className="day-detail-empty">Aucune indisponibilité ce jour</div>
                ) : (
                  dayDetailData.indisponibilites.map(indispo => (
                    <div key={indispo.id} className="day-detail-item">
                      <div className="day-detail-item-header">
                        <span className="day-detail-item-type" style={{ color: '#dc2626' }}>
                          Indisponible
                        </span>
                        <div className="day-detail-item-actions">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleDeleteDisponibilite(indispo.id)}
                          >
                            🗑️ Supprimer
                          </Button>
                        </div>
                      </div>
                      <div className="day-detail-item-info">
                        ⏰ {indispo.heure_debut} - {indispo.heure_fin}
                        {indispo.origine && <span> • Origine: {indispo.origine}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="day-detail-footer">
              <Button variant="outline" onClick={() => setShowDayDetailModal(false)}>
                Fermer
              </Button>
              <Button 
                variant="default" 
                onClick={() => {
                  if (selectedDayForDetail) {
                    setQuickAddConfig({
                      date: selectedDayForDetail.toISOString().split('T')[0],
                      type_garde_id: '',
                      heure_debut: '08:00',
                      heure_fin: '16:00'
                    });
                    setQuickAddType('disponibilite');
                    setShowDayDetailModal(false);
                    setShowQuickAddModal(true);
                  }
                }}
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
              >
                ✅ Ajouter disponibilité
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  if (selectedDayForDetail) {
                    setQuickAddConfig({
                      date: selectedDayForDetail.toISOString().split('T')[0],
                      type_garde_id: '',
                      heure_debut: '00:00',
                      heure_fin: '23:59'
                    });
                    setQuickAddType('indisponibilite');
                    setShowDayDetailModal(false);
                    setShowQuickAddModal(true);
                  }
                }}
              >
                ❌ Ajouter indisponibilité
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* NOUVEAU : Modal d'ajout rapide */}
      {showQuickAddModal && (
        <div className="modal-overlay" onClick={() => setShowQuickAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>
                {quickAddType === 'disponibilite' ? '✅ Ajouter disponibilité' : '❌ Ajouter indisponibilité'}
              </h3>
              <Button variant="ghost" onClick={() => setShowQuickAddModal(false)}>✕</Button>
            </div>
            
            <div className="modal-body">
              {/* Date fixe - non modifiable */}
              <div className="config-section" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <Label style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#64748b' }}>📅 Date</Label>
                <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#0f172a', marginTop: '0.5rem' }}>
                  {new Date(quickAddConfig.date + 'T00:00:00').toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>

              {/* Sélection du type de garde */}
              <div className="config-section">
                <Label>🚒 Type de garde</Label>
                <select
                  value={quickAddConfig.type_garde_id}
                  onChange={(e) => {
                    const selectedType = typesGarde.find(t => t.id === e.target.value);
                    setQuickAddConfig({
                      ...quickAddConfig,
                      type_garde_id: e.target.value,
                      heure_debut: selectedType ? selectedType.heure_debut : quickAddConfig.heure_debut,
                      heure_fin: selectedType ? selectedType.heure_fin : quickAddConfig.heure_fin
                    });
                  }}
                  className="form-select"
                  style={{ marginTop: '0.5rem' }}
                >
                  <option value="">
                    {quickAddType === 'disponibilite' ? 'Tous les types de garde' : 'Toute la journée'}
                  </option>
                  {typesGarde.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.nom} ({type.heure_debut} - {type.heure_fin})
                    </option>
                  ))}
                </select>
                <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                  {quickAddConfig.type_garde_id 
                    ? 'Les horaires du type de garde sont appliqués automatiquement'
                    : quickAddType === 'disponibilite'
                      ? 'Vous êtes disponible pour tous les types de garde avec les horaires ci-dessous'
                      : 'Vous êtes indisponible toute la journée'
                  }
                </small>
              </div>

              {/* Horaires personnalisés si pas de type spécifique */}
              <div className="config-section">
                <Label>⏰ Horaires</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '0.5rem' }}>
                  <div>
                    <Label style={{ fontSize: '0.85rem', color: '#64748b' }}>Heure de début</Label>
                    <Input 
                      type="time" 
                      value={quickAddConfig.heure_debut}
                      onChange={(e) => setQuickAddConfig({...quickAddConfig, heure_debut: e.target.value})}
                      disabled={!!quickAddConfig.type_garde_id}
                    />
                  </div>
                  <div>
                    <Label style={{ fontSize: '0.85rem', color: '#64748b' }}>Heure de fin</Label>
                    <Input 
                      type="time" 
                      value={quickAddConfig.heure_fin}
                      onChange={(e) => setQuickAddConfig({...quickAddConfig, heure_fin: e.target.value})}
                      disabled={!!quickAddConfig.type_garde_id}
                    />
                  </div>
                </div>
              </div>

              {/* Résumé */}
              <div style={{ 
                background: quickAddType === 'disponibilite' ? '#f0fdf4' : '#fef2f2', 
                padding: '1rem', 
                borderRadius: '8px', 
                border: quickAddType === 'disponibilite' ? '2px solid #16a34a' : '2px solid #dc2626',
                marginTop: '1.5rem'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: quickAddType === 'disponibilite' ? '#16a34a' : '#dc2626' }}>
                  📋 Résumé
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: '#0f172a' }}>
                  {quickAddType === 'disponibilite' ? '✅ Vous serez disponible' : '❌ Vous serez indisponible'}<br/>
                  📅 Le {new Date(quickAddConfig.date + 'T00:00:00').toLocaleDateString('fr-FR')}<br/>
                  ⏰ De {quickAddConfig.heure_debut} à {quickAddConfig.heure_fin}<br/>
                  🚒 {quickAddConfig.type_garde_id 
                    ? `Pour ${typesGarde.find(t => t.id === quickAddConfig.type_garde_id)?.nom}`
                    : quickAddType === 'disponibilite' ? 'Pour tous les types de garde' : 'Toute la journée'
                  }
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <Button variant="outline" onClick={() => setShowQuickAddModal(false)}>
                Annuler
              </Button>
              <Button 
                variant="default" 
                onClick={handleQuickAddSave}
                style={{ 
                  background: quickAddType === 'disponibilite' ? '#16a34a' : '#dc2626',
                  borderColor: quickAddType === 'disponibilite' ? '#16a34a' : '#dc2626'
                }}
              >
                {quickAddType === 'disponibilite' ? '✅ Ajouter disponibilité' : '❌ Ajouter indisponibilité'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuration avancée */}
      {showCalendarModal && (
        <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="availability-config-modal">
            <div className="modal-header">
              <h3>✅ Gérer disponibilités</h3>
              <Button variant="ghost" onClick={() => setShowCalendarModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="availability-config-advanced">
                {/* Sélecteur de mode */}
                <div className="config-section" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'calendrier'})}
                      style={{
                        padding: '10px 20px',
                        border: availabilityConfig.mode === 'calendrier' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                        borderRadius: '8px',
                        background: availabilityConfig.mode === 'calendrier' ? '#f0fdf4' : 'white',
                        cursor: 'pointer',
                        fontWeight: availabilityConfig.mode === 'calendrier' ? 'bold' : 'normal',
                        color: availabilityConfig.mode === 'calendrier' ? '#16a34a' : '#64748b'
                      }}
                    >
                      📅 Calendrier (Clics multiples)
                    </button>
                    <button
                      onClick={() => setAvailabilityConfig({...availabilityConfig, mode: 'recurrence'})}
                      style={{
                        padding: '10px 20px',
                        border: availabilityConfig.mode === 'recurrence' ? '2px solid #16a34a' : '2px solid #e2e8f0',
                        borderRadius: '8px',
                        background: availabilityConfig.mode === 'recurrence' ? '#f0fdf4' : 'white',
                        cursor: 'pointer',
                        fontWeight: availabilityConfig.mode === 'recurrence' ? 'bold' : 'normal',
                        color: availabilityConfig.mode === 'recurrence' ? '#16a34a' : '#64748b'
                      }}
                    >
                      🔄 Avec récurrence
                    </button>
                  </div>
                </div>

                {/* Configuration du type de garde */}
                <div className="config-section">
                  <h4>🚒 Type de garde spécifique</h4>
                  <div className="type-garde-selection">
                    <Label>Pour quel type de garde êtes-vous disponible ?</Label>
                    <select
                      value={availabilityConfig.type_garde_id}
                      onChange={(e) => handleTypeGardeChange(e.target.value)}
                      className="form-select"
                      data-testid="availability-type-garde-select"
                    >
                      <option value="">Tous les types de garde</option>
                      {typesGarde.map(type => (
                        <option key={type.id} value={type.id}>
                          {type.nom} ({type.heure_debut} - {type.heure_fin})
                        </option>
                      ))}
                    </select>
                    <small>
                      Sélectionnez un type spécifique ou laissez "Tous les types" pour une disponibilité générale
                    </small>
                  </div>
                </div>

                {/* Configuration des horaires - Seulement si "Tous les types" */}
                {!availabilityConfig.type_garde_id && (
                  <div className="config-section">
                    <h4>⏰ Créneaux horaires personnalisés</h4>
                    <p className="section-note">Définissez vos horaires de disponibilité générale</p>
                    <div className="time-config-row">
                      <div className="time-field">
                        <Label>Heure de début</Label>
                        <Input 
                          type="time" 
                          value={availabilityConfig.heure_debut}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_debut: e.target.value})}
                          data-testid="availability-start-time"
                        />
                      </div>
                      <div className="time-field">
                        <Label>Heure de fin</Label>
                        <Input 
                          type="time" 
                          value={availabilityConfig.heure_fin}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, heure_fin: e.target.value})}
                          data-testid="availability-end-time"
                        />
                      </div>
                    </div>
                    <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                      ℹ️ Les entrées créées ici seront automatiquement marquées comme "Disponible"
                    </small>
                  </div>
                )}

                {/* Horaires automatiques si type spécifique sélectionné */}
                {availabilityConfig.type_garde_id && (
                  <div className="config-section">
                    <h4>⏰ Horaires du type de garde</h4>
                    <div className="automatic-hours">
                      <div className="hours-display">
                        <span className="hours-label">Horaires automatiques :</span>
                        <span className="hours-value">
                          {(() => {
                            const selectedType = typesGarde.find(t => t.id === availabilityConfig.type_garde_id);
                            return selectedType ? `${selectedType.heure_debut} - ${selectedType.heure_fin}` : 'Non défini';
                          })()}
                        </span>
                      </div>
                      <small style={{ marginTop: '8px', display: 'block', color: '#64748b' }}>
                        ℹ️ Les disponibilités seront automatiquement enregistrées avec ces horaires
                      </small>
                    </div>
                  </div>
                )}

                {/* MODE CALENDRIER - Sélection des dates */}
                {availabilityConfig.mode === 'calendrier' && (
                  <div className="config-section">
                    <h4>📆 Sélection des dates</h4>
                    <div className="calendar-instructions">
                      <p>Cliquez sur les dates où vous êtes disponible :</p>
                    </div>
                    
                    <Calendar
                      mode="multiple"
                      selected={selectedDates}
                      onSelect={setSelectedDates}
                      className="interactive-calendar"
                      disabled={(date) => date < new Date().setHours(0,0,0,0)}
                    />
                    
                    <div className="selection-summary-advanced">
                      <div className="summary-item">
                        <strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}
                      </div>
                      <div className="summary-item">
                        <strong>Dates sélectionnées :</strong> {selectedDates?.length || 0} jour(s)
                      </div>
                      <div className="summary-item">
                        <strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE RÉCURRENCE - Période avec récurrence */}
                {availabilityConfig.mode === 'recurrence' && (
                  <>
                    <div className="config-section">
                      <h4>📅 Période</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <Label>Date de début</Label>
                          <Input
                            type="date"
                            value={availabilityConfig.date_debut}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_debut: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Date de fin</Label>
                          <Input
                            type="date"
                            value={availabilityConfig.date_fin}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, date_fin: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="config-section">
                      <h4>🔄 Récurrence</h4>
                      <Label>Type de récurrence</Label>
                      <select
                        value={availabilityConfig.recurrence_type}
                        onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_type: e.target.value})}
                        className="form-select"
                      >
                        <option value="hebdomadaire">Toutes les semaines (hebdomadaire)</option>
                        <option value="bihebdomadaire">Toutes les deux semaines (bihebdomadaire)</option>
                        <option value="mensuelle">Tous les mois (mensuelle)</option>
                        <option value="annuelle">Tous les ans (annuelle)</option>
                        <option value="personnalisee">Personnalisée</option>
                      </select>

                      {availabilityConfig.recurrence_type === 'personnalisee' && (
                        <div style={{ marginTop: '15px', padding: '15px', background: '#f0fdf4', borderRadius: '8px' }}>
                          <h5 style={{ marginTop: 0, marginBottom: '10px' }}>⚙️ Configuration personnalisée</h5>
                          <Label>Fréquence</Label>
                          <select
                            value={availabilityConfig.recurrence_frequence}
                            onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_frequence: e.target.value})}
                            className="form-select"
                            style={{ marginBottom: '10px' }}
                          >
                            <option value="jours">Jours</option>
                            <option value="semaines">Semaines</option>
                            <option value="mois">Mois</option>
                            <option value="ans">Ans</option>
                          </select>

                          <Label>Intervalle : Tous les</Label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <Input
                              type="number"
                              min="1"
                              max="365"
                              value={availabilityConfig.recurrence_intervalle}
                              onChange={(e) => setAvailabilityConfig({...availabilityConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                              style={{ width: '100px' }}
                            />
                            <span>{availabilityConfig.recurrence_frequence}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Résumé pour le mode récurrence */}
                    <div className="config-section" style={{ background: '#f0fdf4', padding: '15px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                      <h4 style={{ color: '#15803d', marginTop: 0 }}>📊 Résumé</h4>
                      <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#15803d' }}>
                        <li><strong>Mode :</strong> Récurrence</li>
                        <li><strong>Type de garde :</strong> {getTypeGardeName(availabilityConfig.type_garde_id)}</li>
                        <li><strong>Période :</strong> Du {new Date(availabilityConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(availabilityConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                        <li><strong>Récurrence :</strong> {
                          availabilityConfig.recurrence_type === 'hebdomadaire' ? 'Toutes les semaines' :
                          availabilityConfig.recurrence_type === 'bihebdomadaire' ? 'Toutes les 2 semaines' :
                          availabilityConfig.recurrence_type === 'mensuelle' ? 'Tous les mois' :
                          availabilityConfig.recurrence_type === 'annuelle' ? 'Tous les ans' :
                          `Tous les ${availabilityConfig.recurrence_intervalle} ${availabilityConfig.recurrence_frequence}`
                        }</li>
                        <li><strong>Horaires :</strong> {availabilityConfig.heure_debut} - {availabilityConfig.heure_fin}</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCalendarModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleSaveAvailability}
                  data-testid="save-availability-btn"
                  disabled={availabilityConfig.mode === 'calendrier' && (!selectedDates || selectedDates.length === 0)}
                >
                  {availabilityConfig.mode === 'calendrier' 
                    ? `✅ Sauvegarder (${selectedDates?.length || 0} jour${selectedDates?.length > 1 ? 's' : ''})`
                    : '✅ Générer les disponibilités'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de génération automatique d'indisponibilités */}
      {showGenerationModal && (
        <div className="modal-overlay" onClick={() => setShowGenerationModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>❌ Gérer indisponibilités</h3>
              <Button variant="ghost" onClick={() => setShowGenerationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              {/* Onglets */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
                <button
                  onClick={() => setIndispoTab('generation')}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: indispoTab === 'generation' ? 'white' : 'transparent',
                    borderBottom: indispoTab === 'generation' ? '3px solid #dc2626' : 'none',
                    fontWeight: indispoTab === 'generation' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    color: indispoTab === 'generation' ? '#dc2626' : '#64748b'
                  }}
                >
                  🚒 Génération automatique
                </button>
                <button
                  onClick={() => setIndispoTab('manuelle')}
                  style={{
                    padding: '12px 24px',
                    border: 'none',
                    background: indispoTab === 'manuelle' ? 'white' : 'transparent',
                    borderBottom: indispoTab === 'manuelle' ? '3px solid #dc2626' : 'none',
                    fontWeight: indispoTab === 'manuelle' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    color: indispoTab === 'manuelle' ? '#dc2626' : '#64748b'
                  }}
                >
                  ✍️ Saisie manuelle
                </button>
              </div>

              {/* Contenu de l'onglet Génération */}
              {indispoTab === 'generation' && (
              <div>
              <div className="generation-config">
                {/* Sélection du type d'horaire */}
                <div className="config-section">
                  <h4>📋 Type d'horaire</h4>
                  <select
                    value={generationConfig.horaire_type}
                    onChange={(e) => setGenerationConfig({...generationConfig, horaire_type: e.target.value})}
                    className="form-select"
                  >
                    <option value="montreal">Montreal 7/24 (Cycle 28 jours)</option>
                    <option value="quebec">Quebec 10/14 (Cycle 28 jours)</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    {generationConfig.horaire_type === 'montreal' 
                      ? 'Horaire Montreal 7/24 : Cycle de 28 jours commençant par lundi rouge. Vous serez INDISPONIBLE les 7 jours où votre équipe travaille.'
                      : 'Horaire Quebec 10/14 : 2J + 1×24h + 3N + REPOS + 4J + 3N + REPOS (cycle 28 jours). Vous serez INDISPONIBLE les 13 jours travaillés par cycle (~169 jours/an).'}
                  </small>
                </div>

                {/* Sélection de l'équipe */}
                <div className="config-section">
                  <h4>👥 Équipe</h4>
                  <div className="equipe-selection" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                    {[
                      {nom: 'Vert', numero: 1},
                      {nom: 'Bleu', numero: 2},
                      {nom: 'Jaune', numero: 3},
                      {nom: 'Rouge', numero: 4}
                    ].map(equipe => (
                      <button
                        key={equipe.nom}
                        onClick={() => setGenerationConfig({...generationConfig, equipe: equipe.nom})}
                        className={`equipe-button ${generationConfig.equipe === equipe.nom ? 'selected' : ''}`}
                        style={{
                          padding: '12px',
                          border: generationConfig.equipe === equipe.nom ? '2px solid #dc2626' : '2px solid #e2e8f0',
                          borderRadius: '8px',
                          background: generationConfig.equipe === equipe.nom ? '#fef2f2' : 'white',
                          cursor: 'pointer',
                          fontWeight: generationConfig.equipe === equipe.nom ? 'bold' : 'normal'
                        }}
                      >
                        {equipe.nom} (#{equipe.numero})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sélection des dates */}
                <div className="config-section">
                  <h4>📅 Période de génération</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date de début</label>
                      <Input
                        type="date"
                        value={generationConfig.date_debut}
                        onChange={(e) => setGenerationConfig({...generationConfig, date_debut: e.target.value})}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Date de fin</label>
                      <Input
                        type="date"
                        value={generationConfig.date_fin}
                        onChange={(e) => setGenerationConfig({...generationConfig, date_fin: e.target.value})}
                      />
                    </div>
                  </div>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    Les indisponibilités seront générées entre ces deux dates
                  </small>
                </div>

                {/* Option de conservation des modifications manuelles */}
                <div className="config-section">
                  <h4>⚠️ Gestion des données existantes</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
                    <input
                      type="checkbox"
                      id="conserver-manuelles"
                      checked={generationConfig.conserver_manuelles}
                      onChange={(e) => setGenerationConfig({...generationConfig, conserver_manuelles: e.target.checked})}
                      style={{ width: '20px', height: '20px' }}
                    />
                    <label htmlFor="conserver-manuelles" style={{ cursor: 'pointer', color: '#78350f' }}>
                      <strong>Conserver les modifications manuelles</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>
                        {generationConfig.conserver_manuelles 
                          ? 'Les disponibilités ajoutées manuellement seront préservées'
                          : '⚠️ ATTENTION : Toutes les disponibilités existantes seront supprimées'}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Résumé de la génération */}
                <div className="config-section" style={{ background: '#eff6ff', padding: '15px', borderRadius: '8px', border: '1px solid #3b82f6' }}>
                  <h4 style={{ color: '#1e40af', marginTop: 0 }}>📊 Résumé de la génération</h4>
                  <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#1e40af' }}>
                    <li><strong>Horaire :</strong> {generationConfig.horaire_type === 'montreal' ? 'Montreal 7/24' : 'Quebec 10/14'}</li>
                    <li><strong>Équipe :</strong> {generationConfig.equipe}</li>
                    <li><strong>Période :</strong> Du {new Date(generationConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(generationConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                    <li><strong>Mode :</strong> {generationConfig.conserver_manuelles ? 'Conservation des modifications manuelles' : 'Remplacement total'}</li>
                  </ul>
                  <p style={{ margin: '10px 0 0 0', fontSize: '0.875rem', color: '#1e40af' }}>
                    💡 Les <strong>INDISPONIBILITÉS</strong> seront générées pour tous les jours où votre équipe <strong>TRAVAILLE</strong> à son emploi principal selon le cycle sélectionné (vous ne serez donc pas disponible pour les gardes de pompiers ces jours-là).
                  </p>
                </div>
              </div>

                <div className="modal-actions">
                  <Button variant="outline" onClick={() => setShowGenerationModal(false)}>
                    Annuler
                  </Button>
                  <Button 
                    variant="default" 
                    onClick={handleGenerateIndisponibilites}
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Génération en cours...' : '🚀 Générer les indisponibilités'}
                  </Button>
                </div>
              </div>
              )}

              {/* Contenu de l'onglet Saisie manuelle */}
              {indispoTab === 'manuelle' && (
                <div>
                  <div className="manual-indispo-config">
                    {/* Sélecteur de mode */}
                    <div className="config-section" style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button
                          onClick={() => setManualIndispoMode('calendrier')}
                          style={{
                            padding: '10px 20px',
                            border: manualIndispoMode === 'calendrier' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            background: manualIndispoMode === 'calendrier' ? '#fef2f2' : 'white',
                            cursor: 'pointer',
                            fontWeight: manualIndispoMode === 'calendrier' ? 'bold' : 'normal',
                            color: manualIndispoMode === 'calendrier' ? '#dc2626' : '#64748b'
                          }}
                        >
                          📅 Calendrier (Clics multiples)
                        </button>
                        <button
                          onClick={() => setManualIndispoMode('recurrence')}
                          style={{
                            padding: '10px 20px',
                            border: manualIndispoMode === 'recurrence' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                            borderRadius: '8px',
                            background: manualIndispoMode === 'recurrence' ? '#fef2f2' : 'white',
                            cursor: 'pointer',
                            fontWeight: manualIndispoMode === 'recurrence' ? 'bold' : 'normal',
                            color: manualIndispoMode === 'recurrence' ? '#dc2626' : '#64748b'
                          }}
                        >
                          🔄 Avec récurrence
                        </button>
                      </div>
                    </div>

                    {/* MODE CALENDRIER */}
                    {manualIndispoMode === 'calendrier' && (
                      <>
                        <div className="config-section">
                          <h4>📆 Sélection des dates d'indisponibilité</h4>
                          <Calendar
                            mode="multiple"
                            selected={manualIndispoConfig.dates}
                            onSelect={(dates) => setManualIndispoConfig({...manualIndispoConfig, dates: dates || []})}
                            className="availability-calendar-large"
                            locale={fr}
                          />
                          <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                            📌 Cliquez sur plusieurs dates pour sélectionner vos jours d'indisponibilité
                          </small>
                          {manualIndispoConfig.dates.length > 0 && (
                            <p style={{ marginTop: '10px', color: '#dc2626', fontWeight: 'bold' }}>
                              ✓ {manualIndispoConfig.dates.length} date(s) sélectionnée(s)
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {/* MODE RÉCURRENCE */}
                    {manualIndispoMode === 'recurrence' && (
                      <>
                        <div className="config-section">
                          <h4>📅 Période</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                              <Label>Date de début</Label>
                              <Input
                                type="date"
                                value={manualIndispoConfig.date_debut}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, date_debut: e.target.value})}
                              />
                            </div>
                            <div>
                              <Label>Date de fin</Label>
                              <Input
                                type="date"
                                value={manualIndispoConfig.date_fin}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, date_fin: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="config-section">
                          <h4>🔄 Récurrence</h4>
                          <Label>Type de récurrence</Label>
                          <select
                            value={manualIndispoConfig.recurrence_type}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_type: e.target.value})}
                            className="form-select"
                          >
                            <option value="hebdomadaire">Toutes les semaines (hebdomadaire)</option>
                            <option value="bihebdomadaire">Toutes les deux semaines (bihebdomadaire)</option>
                            <option value="mensuelle">Tous les mois (mensuelle)</option>
                            <option value="annuelle">Tous les ans (annuelle)</option>
                            <option value="personnalisee">Personnalisée</option>
                          </select>

                          {manualIndispoConfig.recurrence_type === 'personnalisee' && (
                            <div style={{ marginTop: '15px', padding: '15px', background: '#f8fafc', borderRadius: '8px' }}>
                              <h5 style={{ marginTop: 0, marginBottom: '10px' }}>⚙️ Configuration personnalisée</h5>
                              <Label>Fréquence</Label>
                              <select
                                value={manualIndispoConfig.recurrence_frequence}
                                onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_frequence: e.target.value})}
                                className="form-select"
                                style={{ marginBottom: '10px' }}
                              >
                                <option value="jours">Jours</option>
                                <option value="semaines">Semaines</option>
                                <option value="mois">Mois</option>
                                <option value="ans">Ans</option>
                              </select>

                              <Label>Intervalle : Tous les</Label>
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <Input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={manualIndispoConfig.recurrence_intervalle}
                                  onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, recurrence_intervalle: parseInt(e.target.value) || 1})}
                                  style={{ width: '100px' }}
                                />
                                <span>{manualIndispoConfig.recurrence_frequence}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Configuration des horaires (commun aux deux modes) */}
                    <div className="config-section">
                      <h4>⏰ Horaires d'indisponibilité</h4>
                      <div className="time-config-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <Label>Heure de début</Label>
                          <Input 
                            type="time" 
                            value={manualIndispoConfig.heure_debut}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, heure_debut: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>Heure de fin</Label>
                          <Input 
                            type="time" 
                            value={manualIndispoConfig.heure_fin}
                            onChange={(e) => setManualIndispoConfig({...manualIndispoConfig, heure_fin: e.target.value})}
                          />
                        </div>
                      </div>
                      <small style={{ display: 'block', marginTop: '8px', color: '#64748b' }}>
                        💡 Par défaut : 00:00-23:59 (toute la journée)
                      </small>
                    </div>

                    {/* Résumé */}
                    <div className="config-section" style={{ background: '#fef2f2', padding: '15px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <h4 style={{ color: '#991b1b', marginTop: 0 }}>📊 Résumé</h4>
                      {manualIndispoMode === 'calendrier' ? (
                        <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#991b1b' }}>
                          <li><strong>Mode :</strong> Calendrier (clics multiples)</li>
                          <li><strong>Dates sélectionnées :</strong> {manualIndispoConfig.dates.length} jour(s)</li>
                          <li><strong>Horaires :</strong> {manualIndispoConfig.heure_debut} - {manualIndispoConfig.heure_fin}</li>
                        </ul>
                      ) : (
                        <ul style={{ margin: '10px 0', paddingLeft: '20px', color: '#991b1b' }}>
                          <li><strong>Mode :</strong> Récurrence</li>
                          <li><strong>Période :</strong> Du {new Date(manualIndispoConfig.date_debut).toLocaleDateString('fr-FR')} au {new Date(manualIndispoConfig.date_fin).toLocaleDateString('fr-FR')}</li>
                          <li><strong>Récurrence :</strong> {
                            manualIndispoConfig.recurrence_type === 'hebdomadaire' ? 'Toutes les semaines' :
                            manualIndispoConfig.recurrence_type === 'bihebdomadaire' ? 'Toutes les 2 semaines' :
                            manualIndispoConfig.recurrence_type === 'mensuelle' ? 'Tous les mois' :
                            manualIndispoConfig.recurrence_type === 'annuelle' ? 'Tous les ans' :
                            `Tous les ${manualIndispoConfig.recurrence_intervalle} ${manualIndispoConfig.recurrence_frequence}`
                          }</li>
                          <li><strong>Horaires :</strong> {manualIndispoConfig.heure_debut} - {manualIndispoConfig.heure_fin}</li>
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="modal-actions">
                    <Button variant="outline" onClick={() => setShowGenerationModal(false)}>
                      Annuler
                    </Button>
                    <Button 
                      variant="default" 
                      onClick={handleSaveManualIndisponibilites}
                      disabled={manualIndispoMode === 'calendrier' && manualIndispoConfig.dates.length === 0}
                    >
                      {manualIndispoMode === 'calendrier' 
                        ? `✅ Enregistrer ${manualIndispoConfig.dates.length > 0 ? `(${manualIndispoConfig.dates.length} jour${manualIndispoConfig.dates.length > 1 ? 's' : ''})` : ''}`
                        : '✅ Générer les indisponibilités'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de réinitialisation */}
      {showReinitModal && (
        <div className="modal-overlay" onClick={() => setShowReinitModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗑️ Réinitialiser les disponibilités</h3>
              <Button variant="ghost" onClick={() => setShowReinitModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="reinit-config">
                {/* Sélection de la période */}
                <div className="config-section">
                  <h4>📅 Période à réinitialiser</h4>
                  <select
                    value={reinitConfig.periode}
                    onChange={(e) => setReinitConfig({...reinitConfig, periode: e.target.value})}
                    className="form-select"
                  >
                    <option value="semaine">Semaine courante</option>
                    <option value="mois">Mois courant</option>
                    <option value="annee">Année courante</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    {reinitConfig.periode === 'semaine' && 'Du lundi au dimanche de la semaine en cours'}
                    {reinitConfig.periode === 'mois' && 'Du 1er au dernier jour du mois en cours'}
                    {reinitConfig.periode === 'annee' && 'Du 1er janvier au 31 décembre de l\'année en cours'}
                  </small>
                </div>

                {/* Sélection du type d'entrées */}
                <div className="config-section">
                  <h4>📊 Type d'entrées à supprimer</h4>
                  <select
                    value={reinitConfig.type_entree}
                    onChange={(e) => setReinitConfig({...reinitConfig, type_entree: e.target.value})}
                    className="form-select"
                  >
                    <option value="les_deux">Disponibilités ET Indisponibilités</option>
                    <option value="disponibilites">Disponibilités uniquement</option>
                    <option value="indisponibilites">Indisponibilités uniquement</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '8px', color: '#666' }}>
                    {reinitConfig.type_entree === 'disponibilites' && '✅ Supprime uniquement les jours disponibles'}
                    {reinitConfig.type_entree === 'indisponibilites' && '❌ Supprime uniquement les jours indisponibles'}
                    {reinitConfig.type_entree === 'les_deux' && '🔄 Supprime tous les types d\'entrées'}
                  </small>
                </div>

                {/* Sélection du mode */}
                <div className="config-section">
                  <h4>🎯 Mode de suppression</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={{ 
                      padding: '15px', 
                      border: reinitConfig.mode === 'generees_seulement' ? '2px solid #3b82f6' : '2px solid #e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: reinitConfig.mode === 'generees_seulement' ? '#eff6ff' : 'white'
                    }}>
                      <input
                        type="radio"
                        name="mode"
                        value="generees_seulement"
                        checked={reinitConfig.mode === 'generees_seulement'}
                        onChange={(e) => setReinitConfig({...reinitConfig, mode: e.target.value})}
                        style={{ marginRight: '10px' }}
                      />
                      <strong>Supprimer uniquement les entrées générées automatiquement</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '5px', marginLeft: '25px', color: '#64748b' }}>
                        ✅ Préserve vos modifications manuelles (origine: manuelle)
                      </div>
                    </label>

                    <label style={{ 
                      padding: '15px', 
                      border: reinitConfig.mode === 'tout' ? '2px solid #dc2626' : '2px solid #e2e8f0',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: reinitConfig.mode === 'tout' ? '#fef2f2' : 'white'
                    }}>
                      <input
                        type="radio"
                        name="mode"
                        value="tout"
                        checked={reinitConfig.mode === 'tout'}
                        onChange={(e) => setReinitConfig({...reinitConfig, mode: e.target.value})}
                        style={{ marginRight: '10px' }}
                      />
                      <strong>Supprimer TOUTES les entrées</strong>
                      <div style={{ fontSize: '0.875rem', marginTop: '5px', marginLeft: '25px', color: '#991b1b' }}>
                        ⚠️ Supprime tout (manuelles + générées automatiquement)
                      </div>
                    </label>
                  </div>
                </div>

                {/* Résumé et confirmation */}
                <div className="config-section" style={{ 
                  background: reinitConfig.mode === 'tout' ? '#fef2f2' : '#eff6ff', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  border: `1px solid ${reinitConfig.mode === 'tout' ? '#dc2626' : '#3b82f6'}` 
                }}>
                  <h4 style={{ color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af', marginTop: 0 }}>
                    ⚠️ Confirmation requise
                  </h4>
                  <p style={{ margin: '10px 0', color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af' }}>
                    Vous êtes sur le point de <strong>
                      {reinitConfig.mode === 'tout' 
                        ? 'SUPPRIMER TOUTES LES' 
                        : 'supprimer les entrées générées de'}
                    </strong> {' '}
                    <strong>
                      {reinitConfig.type_entree === 'disponibilites' && 'DISPONIBILITÉS'}
                      {reinitConfig.type_entree === 'indisponibilites' && 'INDISPONIBILITÉS'}
                      {reinitConfig.type_entree === 'les_deux' && 'DISPONIBILITÉS ET INDISPONIBILITÉS'}
                    </strong> {' de '}
                    {reinitConfig.periode === 'semaine' && 'la semaine courante'}
                    {reinitConfig.periode === 'mois' && 'du mois courant'}
                    {reinitConfig.periode === 'annee' && 'de l\'année courante'}
                  </p>
                  <p style={{ margin: '10px 0', fontSize: '0.875rem', color: reinitConfig.mode === 'tout' ? '#991b1b' : '#1e40af' }}>
                    {reinitConfig.mode === 'tout' 
                      ? `🚨 Cette action supprimera toutes les ${reinitConfig.type_entree === 'disponibilites' ? 'disponibilités' : reinitConfig.type_entree === 'indisponibilites' ? 'indisponibilités' : 'entrées'} (manuelles et automatiques).`
                      : '✅ Vos modifications manuelles seront préservées.'}
                  </p>
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowReinitModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant={reinitConfig.mode === 'tout' ? 'destructive' : 'default'}
                  onClick={handleReinitialiser}
                  disabled={isReinitializing}
                >
                  {isReinitializing ? 'Suppression...' : '🗑️ Confirmer la suppression'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Mon Profil Component épuré - sans disponibilités et remplacements
// Mon Profil Component épuré - sans disponibilités et remplacements
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
  const { toast } = useToast();

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchStatistiques();
    }
  }, [user, tenantSlug]);

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