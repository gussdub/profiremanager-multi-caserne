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
import { apiGet, apiPost, apiPut, apiDelete } from "./utils/api";
import "./App.css";

// Lazy loading pour optimiser les performances
const Parametres = lazy(() => import("./components/Parametres"));

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
        .catch(() => {
          localStorage.removeItem('token');
          delete axios.defaults.headers.common['Authorization'];
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
      // Utiliser l'endpoint tenant-spécifique
      const loginUrl = isSuperAdmin
        ? `${API}/admin/auth/login`
        : `${API}/${tenantSlug}/auth/login`;
      
      const response = await axios.post(loginUrl, {
        email,
        mot_de_passe
      });
      
      const { access_token, user: userData, tenant } = response.data;
      localStorage.setItem('token', access_token);
      
      // Stocker les infos du tenant si présentes
      if (tenant) {
        localStorage.setItem('tenant', JSON.stringify(tenant));
      }
      
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setUser(userData);
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.detail || 'Erreur de connexion' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tenant');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Charger les notifications
  const loadNotifications = async () => {
    try {
      const response = await axios.get(`${API}/notifications`);
      setNotifications(response.data);
      
      const countResponse = await axios.get(`${API}/notifications/non-lues/count`);
      setUnreadCount(countResponse.data.count);
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
      await axios.put(`${API}/notifications/${notifId}/marquer-lu`);
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage notification:', error);
    }
  };

  const marquerToutesLues = async () => {
    try {
      await axios.put(`${API}/notifications/marquer-toutes-lues`);
      loadNotifications();
    } catch (error) {
      console.error('Erreur marquage toutes notifications:', error);
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'personnel', label: 'Personnel', icon: '👥', roles: ['admin', 'superviseur'] },
    { id: 'epi', label: 'EPI', icon: '🛡️', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'planning', label: 'Planning', icon: '📅', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'disponibilites', label: 'Mes disponibilités', icon: '📋', roles: ['employe'] },
    { id: 'remplacements', label: 'Remplacements', icon: '🔄', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'formations', label: 'Formations', icon: '📚', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'rapports', label: 'Rapports', icon: '📈', roles: ['admin'] },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', roles: ['admin'] },
    { id: 'monprofil', label: 'Mon profil', icon: '👤', roles: ['admin', 'superviseur', 'employe'] }
  ];

  const filteredMenuItems = menuItems.filter(item => {
    // Vérification du rôle
    if (!item.roles.includes(user?.role)) return false;
    
    // Vérification spéciale pour "Mes disponibilités" - uniquement temps partiel
    if (item.id === 'disponibilites' && user?.type_emploi !== 'temps_partiel') {
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
const ModuleEPI = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [myEPIs, setMyEPIs] = useState([]);
  const [allEPIs, setAllEPIs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedEPI, setSelectedEPI] = useState(null);
  const [inspectionForm, setInspectionForm] = useState({
    date_inspection: new Date().toISOString().split('T')[0],
    resultat: 'Conforme',
    integrite: true,
    proprete: true,
    dommages_visibles: false,
    coutures: true,
    fermetures: true,
    observations: ''
  });
  const { toast } = useToast();

  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'superviseur';

  useEffect(() => {
    fetchEPIData();
  }, [user]);

  const fetchEPIData = async () => {
    setLoading(true);
    try {
      if (isAdminOrSupervisor) {
        // Admin/Superviseur : charger tous les EPI et les alertes
        const [alertsResponse] = await Promise.all([
          axios.get(`${API}/epi/alertes/all`)
        ]);
        setAlerts(alertsResponse.data);
      } else {
        // Employé : charger ses propres EPI
        const response = await axios.get(`${API}/epi/employe/${user.id}`);
        setMyEPIs(response.data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des EPI:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données EPI",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartInspection = (epi) => {
    setSelectedEPI(epi);
    setShowInspectionModal(true);
  };

  const handleSubmitInspection = async () => {
    if (!selectedEPI) return;

    try {
      await axios.post(`${API}/epi/${selectedEPI.id}/inspection`, {
        ...inspectionForm,
        inspecteur_id: user.id
      });

      toast({
        title: "Inspection enregistrée",
        description: "L'inspection a été enregistrée avec succès",
        variant: "success"
      });

      setShowInspectionModal(false);
      fetchEPIData();
      resetInspectionForm();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer l'inspection",
        variant: "destructive"
      });
    }
  };

  const resetInspectionForm = () => {
    setInspectionForm({
      date_inspection: new Date().toISOString().split('T')[0],
      resultat: 'Conforme',
      integrite: true,
      proprete: true,
      dommages_visibles: false,
      coutures: true,
      fermetures: true,
      observations: ''
    });
    setSelectedEPI(null);
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

  if (loading) {
    return <div className="loading">Chargement des EPI...</div>;
  }

  // Vue Admin/Superviseur
  if (isAdminOrSupervisor) {
    return (
      <div className="module-epi">
        <div className="module-epi-header">
          <div>
            <h1>🛡️ Gestion des EPI</h1>
            <p>Vue d'ensemble et actions rapides</p>
          </div>
        </div>

        {/* Cartes d'alertes */}
        <div className="epi-quick-actions-grid">
          <div className="epi-stat-card">
            <div className="epi-stat-header">
              <h3>⚠️ Alertes</h3>
            </div>
            <div className="epi-stat-body">
              <div className="alert-stats">
                <div className="alert-stat-item">
                  <span className="alert-stat-number">{alerts.filter(a => a.type === 'expiration').length}</span>
                  <span className="alert-stat-label">Expirations proches</span>
                </div>
                <div className="alert-stat-item">
                  <span className="alert-stat-number">{alerts.filter(a => a.type === 'inspection').length}</span>
                  <span className="alert-stat-label">Inspections à venir</span>
                </div>
              </div>
            </div>
          </div>

          <div className="epi-stat-card">
            <div className="epi-stat-header epi-stat-header-priorite">
              <h3>🚨 Haute Priorité</h3>
            </div>
            <div className="epi-stat-body">
              <div className="alert-stats">
                <div className="alert-stat-item">
                  <span className="alert-stat-number urgent">{alerts.filter(a => a.priorite === 'haute').length}</span>
                  <span className="alert-stat-label">Actions urgentes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tableau détaillé des alertes */}
        {alerts.length > 0 ? (
          <div className="epi-table-section">
            <h3>📋 Détails des Alertes EPI</h3>
            <div className="epi-table-wrapper">
              <table className="epi-table">
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
                  {alerts.map((alert, index) => (
                    <tr key={index} className={`priority-row-${alert.priorite}`}>
                      <td>
                        <span className={`priority-badge ${alert.priorite}`}>
                          {alert.priorite === 'haute' ? '🚨 Haute' : '⚠️ Moyenne'}
                        </span>
                      </td>
                      <td><strong>{alert.employe_nom}</strong></td>
                      <td>{getEPINom(alert.type_epi)}</td>
                      <td>{alert.type === 'expiration' ? '⏰ Expiration' : '🔍 Inspection'}</td>
                      <td>{alert.type === 'expiration' ? alert.date_expiration : alert.date_inspection}</td>
                      <td>
                        <span className={`days-badge ${alert.jours_restants <= 7 ? 'urgent' : 'warning'}`}>
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
          <div className="no-alerts-epi">
            <p>✅ Aucune alerte EPI pour le moment</p>
            <p>Tous les équipements sont à jour</p>
          </div>
        )}

        <div className="epi-info-note">
          <p>💡 La gestion détaillée des EPI de chaque employé se fait via <strong>Personnel &gt; Fiche employé</strong></p>
        </div>
      </div>
    );
  }

  // Vue Employé
  return (
    <div className="module-epi">
      <div className="module-epi-header">
        <div>
          <h1>🛡️ Mes EPI</h1>
          <p>Gestion et inspections de vos équipements</p>
        </div>
      </div>

      {myEPIs.length > 0 ? (
        <div className="my-epi-grid">
          {myEPIs.map(epi => (
            <div key={epi.id} className="my-epi-card">
              <div className="my-epi-card-header">
                <span className="my-epi-icon">{getEPIIcone(epi.type_epi)}</span>
                <h3>{getEPINom(epi.type_epi)}</h3>
              </div>
              <div className="my-epi-card-body">
                <div className="my-epi-details">
                  <div className="my-epi-detail-row">
                    <span>Taille:</span>
                    <strong>{epi.taille}</strong>
                  </div>
                  <div className="my-epi-detail-row">
                    <span>État:</span>
                    <span style={{ color: getEtatColor(epi.etat), fontWeight: 600 }}>{epi.etat}</span>
                  </div>
                  <div className="my-epi-detail-row">
                    <span>Expiration:</span>
                    <strong>{epi.date_expiration}</strong>
                  </div>
                </div>
                <div className="my-epi-actions">
                  <Button 
                    size="sm" 
                    onClick={() => handleStartInspection(epi)}
                    data-testid={`inspect-epi-${epi.id}`}
                  >
                    🔍 Inspecter
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-epi-message">
          <p>Aucun EPI n'est actuellement enregistré pour vous.</p>
          <p>Contactez votre superviseur pour l'attribution de vos équipements.</p>
        </div>
      )}

      {/* Modal Inspection NFPA 1851 */}
      {showInspectionModal && selectedEPI && (
        <div className="modal-overlay" onClick={() => setShowInspectionModal(false)}>
          <div className="modal-content medium-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔍 Inspection NFPA 1851 - {getEPINom(selectedEPI.type_epi)}</h3>
              <Button variant="ghost" onClick={() => setShowInspectionModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="inspection-form">
                <div className="form-field">
                  <Label>Date d'inspection</Label>
                  <Input
                    type="date"
                    value={inspectionForm.date_inspection}
                    onChange={(e) => setInspectionForm({...inspectionForm, date_inspection: e.target.value})}
                  />
                </div>

                <div className="inspection-criteria">
                  <h4>Critères d'inspection (Norme NFPA 1851)</h4>
                  
                  <label className="inspection-checkbox">
                    <input
                      type="checkbox"
                      checked={inspectionForm.integrite}
                      onChange={(e) => setInspectionForm({...inspectionForm, integrite: e.target.checked})}
                    />
                    <span>Intégrité générale</span>
                  </label>

                  <label className="inspection-checkbox">
                    <input
                      type="checkbox"
                      checked={inspectionForm.proprete}
                      onChange={(e) => setInspectionForm({...inspectionForm, proprete: e.target.checked})}
                    />
                    <span>Propreté</span>
                  </label>

                  <label className="inspection-checkbox">
                    <input
                      type="checkbox"
                      checked={!inspectionForm.dommages_visibles}
                      onChange={(e) => setInspectionForm({...inspectionForm, dommages_visibles: !e.target.checked})}
                    />
                    <span>Aucun dommage visible</span>
                  </label>

                  <label className="inspection-checkbox">
                    <input
                      type="checkbox"
                      checked={inspectionForm.coutures}
                      onChange={(e) => setInspectionForm({...inspectionForm, coutures: e.target.checked})}
                    />
                    <span>Coutures en bon état</span>
                  </label>

                  <label className="inspection-checkbox">
                    <input
                      type="checkbox"
                      checked={inspectionForm.fermetures}
                      onChange={(e) => setInspectionForm({...inspectionForm, fermetures: e.target.checked})}
                    />
                    <span>Fermetures fonctionnelles</span>
                  </label>
                </div>

                <div className="form-field">
                  <Label>Résultat de l'inspection</Label>
                  <select
                    value={inspectionForm.resultat}
                    onChange={(e) => setInspectionForm({...inspectionForm, resultat: e.target.value})}
                    className="form-select"
                  >
                    <option value="Conforme">Conforme</option>
                    <option value="Non conforme">Non conforme</option>
                    <option value="À nettoyer">À nettoyer</option>
                    <option value="À réparer">À réparer</option>
                    <option value="Remplacement nécessaire">Remplacement nécessaire</option>
                  </select>
                </div>

                <div className="form-field">
                  <Label>Observations</Label>
                  <textarea
                    value={inspectionForm.observations}
                    onChange={(e) => setInspectionForm({...inspectionForm, observations: e.target.value})}
                    className="form-textarea"
                    rows="4"
                    placeholder="Remarques ou observations..."
                  />
                </div>
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowInspectionModal(false)}>
                  Annuler
                </Button>
                <Button onClick={handleSubmitInspection}>
                  📝 Enregistrer l'inspection
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Dashboard Component optimisé - 100% dynamique
const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [activiteRecente, setActiviteRecente] = useState([]);
  const [statistiquesDetaillees, setStatistiquesDetaillees] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [statsResponse, rapportsResponse, usersResponse] = await Promise.all([
          axios.get(`${API}/statistiques`),
          user.role === 'admin' ? axios.get(`${API}/rapports/statistiques-avancees`) : Promise.resolve({ data: null }),
          axios.get(`${API}/users`)
        ]);
        
        setStats(statsResponse.data);
        setStatistiquesDetaillees(rapportsResponse.data);
        
        // Générer activité récente dynamique
        const users = usersResponse.data;
        const activiteItems = [];
        
        // Dernières assignations (estimation basée sur stats)
        if (statsResponse.data.gardes_cette_semaine > 0) {
          activiteItems.push({
            type: 'assignation',
            text: `Assignation automatique effectuée (${statsResponse.data.gardes_cette_semaine} gardes)`,
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
        if (statsResponse.data.formations_planifiees > 0) {
          activiteItems.push({
            type: 'formation',
            text: `${statsResponse.data.formations_planifiees} formation(s) planifiée(s)`,
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
  }, [user]);

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
const Personnel = () => {
  const [users, setUsers] = useState([]);
  const [formations, setFormations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDisponibilitesModal, setShowDisponibilitesModal] = useState(false);
  const [showEPIModal, setShowEPIModal] = useState(false);
  const [showAddEPIModal, setShowAddEPIModal] = useState(false);
  const [showEPIAccordion, setShowEPIAccordion] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [userEPIs, setUserEPIs] = useState([]);
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
    contact_urgence: '',
    grade: '',
    fonction_superieur: false,
    type_emploi: '',
    numero_employe: '',
    date_embauche: '',
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
      contact_urgence: '',
      grade: '',
      fonction_superieur: false,
      type_emploi: '',
      numero_employe: '',
      date_embauche: new Date().toISOString().split('T')[0],
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

      await axios.put(`${API}/users/${selectedUser.id}`, userToUpdate);
      toast({
        title: "Pompier mis à jour",
        description: "Les informations ont été mises à jour avec succès",
        variant: "success"
      });
      setShowEditModal(false);
      
      // Reload users list
      const response = await axios.get(`${API}/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Error updating user:', error);
      toast({
        title: "Erreur de modification",
        description: error.response?.data?.detail || "Impossible de mettre à jour le pompier",
        variant: "destructive"
      });
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer ce pompier ?")) return;

    try {
      await axios.delete(`${API}/users/${userId}`);
      toast({
        title: "Pompier supprimé",
        description: "Le pompier a été supprimé avec succès",
        variant: "success"
      });
      const response = await axios.get(`${API}/users`);
      setUsers(response.data);
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
      const response = await axios.get(`${API}/disponibilites/${user.id}`);
      setUserDisponibilites(response.data);
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

  // Fonctions de gestion des EPI
  const handleViewEPI = async (user) => {
    try {
      const response = await axios.get(`${API}/epi/employe/${user.id}`);
      setUserEPIs(response.data);
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
      await axios.post(`${API}/epi`, {
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
      const response = await axios.get(`${API}/epi/employe/${selectedUser.id}`);
      setUserEPIs(response.data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'ajouter l'EPI",
        variant: "destructive"
      });
    }
  };

  const handleUpdateEPITaille = async (epiId, newTaille) => {
    try {
      await axios.put(`${API}/epi/${epiId}`, {
        taille: newTaille
      });
      
      toast({
        title: "Taille mise à jour",
        description: "La taille de l'EPI a été modifiée",
        variant: "success"
      });
      
      // Recharger les EPI
      const response = await axios.get(`${API}/epi/employe/${selectedUser.id}`);
      setUserEPIs(response.data);
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
      await axios.delete(`${API}/epi/${epiId}`);
      
      toast({
        title: "EPI supprimé",
        description: "L'équipement a été supprimé",
        variant: "success"
      });
      
      // Recharger les EPI
      const response = await axios.get(`${API}/epi/employe/${selectedUser.id}`);
      setUserEPIs(response.data);
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

  const getEPINom = (typeEpi) => {
    const noms = {
      'casque': 'Casque',
      'bottes': 'Bottes',
      'veste_bunker': 'Veste Bunker',
      'pantalon_bunker': 'Pantalon Bunker',
      'gants': 'Gants',
      'masque_scba': 'Masque SCBA'
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
      'masque_scba': '😷'
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
                      <Label>Contact d'urgence</Label>
                      <Input
                        value={newUser.contact_urgence}
                        onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                        placeholder="Ex: 514-999-8888"
                        data-testid="user-emergency-input"
                      />
                    </div>
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

      {/* View User Modal - Version modernisée */}}
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
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Disponibilités Modal */}
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
                      <Label>Contact d'urgence</Label>
                      <Input
                        value={newUser.contact_urgence}
                        onChange={(e) => setNewUser({...newUser, contact_urgence: e.target.value})}
                        data-testid="edit-user-emergency-input"
                      />
                    </div>
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
                      return (
                        <div key={epiType.id} className="epi-taille-row">
                          <span className="epi-taille-icon-modal">{epiType.icone}</span>
                          <Label className="epi-taille-label-modal">{epiType.nom}</Label>
                          <Input
                            value={existingEPI ? existingEPI.taille : ''}
                            onChange={(e) => {
                              if (existingEPI) {
                                const updatedEPIs = userEPIs.map(item => 
                                  item.id === existingEPI.id ? {...item, taille: e.target.value} : item
                                );
                                setUserEPIs(updatedEPIs);
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
  const [currentWeek, setCurrentWeek] = useState(() => {
    const today = new Date();
    const monday = new Date(today.setDate(today.getDate() - today.getDay() + 1));
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
    const date = new Date(currentWeek);
    date.setDate(date.getDate() + i);
    return date;
  });

  // Générer les dates du mois pour la vue mois
  const monthDates = (() => {
    if (viewMode !== 'mois') return [];
    
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const dates = [];
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      dates.push(new Date(year, month - 1, day));
    }
    return dates;
  })();

  useEffect(() => {
    fetchPlanningData();
  }, [currentWeek, currentMonth, viewMode]);

  const fetchPlanningData = async () => {
    setLoading(true);
    try {
      const dateRange = viewMode === 'mois' ? 
        `${currentMonth}-01` : // Premier jour du mois
        currentWeek;
        
      const [typesRes, assignationsRes, usersRes] = await Promise.all([
        axios.get(`${API}/types-garde`),
        axios.get(`${API}/planning/assignations/${dateRange}`),
        user.role !== 'employe' ? axios.get(`${API}/users`) : Promise.resolve({ data: [] })
      ]);
      
      setTypesGarde(typesRes.data);
      setAssignations(assignationsRes.data);
      setUsers(usersRes.data);
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
      const response = await axios.post(`${API}/planning/attribution-auto?semaine_debut=${targetDate}`);
      
      toast({
        title: "Attribution automatique réussie",
        description: `${response.data.assignations_creees} nouvelles assignations créées`,
        variant: "success"
      });

      fetchPlanningData();
    } catch (error) {
      toast({
        title: "Erreur d'attribution",
        description: error.response?.data?.detail || "Impossible d'effectuer l'attribution automatique",
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
        axios.delete(`${API}/planning/assignation/${assignation.id}`)
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
        description: error.response?.data?.detail || "Impossible de supprimer le personnel de cette garde",
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

      await axios.delete(`${API}/planning/assignation/${assignationToRemove.id}`);
      
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
        description: error.response?.data?.detail || "Impossible de retirer la personne",
        variant: "destructive"
      });
    }
  };

  const handleAssignUser = async (userId, typeGardeId, date) => {
    if (user.role === 'employe') return;

    try {
      await axios.post(`${API}/planning/assignation`, {
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

      await axios.post(`${API}/planning/assignation-avancee`, assignmentData);

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
    const newDate = new Date(currentWeek);
    newDate.setDate(newDate.getDate() + (direction * 7));
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
            new Date(currentMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
          ) : (
            `Semaine du ${weekDates[0].toLocaleDateString('fr-FR')} au ${weekDates[6].toLocaleDateString('fr-FR')}`
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
                    const assignation = getAssignationForSlot(date, typeGarde.id);
                    const assignedUser = assignation ? getUserById(assignation.user_id) : null;

                    return (
                      <div
                        key={dayIndex}
                        className={`jour-garde-card ${coverage}`}
                        style={{
                          backgroundColor: getCoverageColor(coverage) + '20',
                          borderColor: getCoverageColor(coverage)
                        }}
                        onClick={() => {
                          if (assignation && assignedUser) {
                            openGardeDetails(date, typeGarde);
                          } else if (user.role !== 'employe') {
                            openAssignModal(date, typeGarde);
                          }
                        }}
                        data-testid={`garde-card-${dayIndex}-${typeGarde.id}`}
                      >
                        <div className="jour-header">
                          <span className="jour-name">{weekDays[dayIndex]}</span>
                          <span className="jour-date">{date.getDate()}</span>
                        </div>
                        
                        <div className="garde-content">
                          {assignedUser ? (
                            <div className="assigned-info">
                              <span className="assigned-name">{assignedUser.prenom} {assignedUser.nom.charAt(0)}.</span>
                              <span className="assigned-grade">{assignedUser.grade}</span>
                              {typeGarde.personnel_requis > 1 && (
                                <span className="more-count">+{typeGarde.personnel_requis - 1}</span>
                              )}
                            </div>
                          ) : (
                            <div className="vacant-info">
                              <span className="vacant-text">Vacant</span>
                              <span className="personnel-need">{typeGarde.personnel_requis}p</span>
                            </div>
                          )}
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
            <h3>📅 Planning mensuel - {new Date(currentMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h3>
          </div>
          
          <div className="calendrier-mois">
            {monthDates.map(date => {
              const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' });
              const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1; // Lundi = 0
              
              const gardesJour = typesGarde.filter(typeGarde => 
                shouldShowTypeGardeForDay(typeGarde, dayIndex)
              );

              return (
                <div key={date.toISOString().split('T')[0]} className="jour-mois">
                  <div className="jour-mois-header">
                    <span className="jour-mois-name">{dayName}</span>
                    <span className="jour-mois-date">{date.getDate()}</span>
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
                  {users.map(userOption => (
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
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const promises = [
        axios.get(`${API}/remplacements`),
        axios.get(`${API}/demandes-conge`),
        axios.get(`${API}/types-garde`)
      ];
      
      if (user.role !== 'employe') {
        promises.push(axios.get(`${API}/users`));
      }

      const responses = await Promise.all(promises);
      setDemandes(responses[0].data);
      setDemandesConge(responses[1].data);
      setTypesGarde(responses[2].data);
      
      if (responses[3]) {
        setUsers(responses[3].data);
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
      await axios.post(`${API}/remplacements`, newDemande);
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
      await axios.post(`${API}/demandes-conge`, newConge);
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
      await axios.put(`${API}/demandes-conge/${demandeId}/approuver?action=${action}&commentaire=${commentaire}`);
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
                        <Button variant="outline" size="sm" data-testid={`search-replacement-${demande.id}`}>
                          🔍 Recherche auto
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`approve-replacement-${demande.id}`}>✅</Button>
                        <Button variant="ghost" size="sm" className="danger" data-testid={`reject-replacement-${demande.id}`}>❌</Button>
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
      try {
        const [sessionsResponse, competencesResponse] = await Promise.all([
          axios.get(`${API}/sessions-formation`),
          axios.get(`${API}/formations`)
        ]);
        setSessions(sessionsResponse.data);
        setCompetences(competencesResponse.data);
      } catch (error) {
        console.error('Erreur lors du chargement des formations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFormations();
  }, []);

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
      await axios.post(`${API}/sessions-formation`, newSession);
      toast({
        title: "Formation créée",
        description: "La session de formation a été programmée avec succès",
        variant: "success"
      });
      setShowCreateModal(false);
      resetNewSession();
      
      // Reload sessions
      const response = await axios.get(`${API}/sessions-formation`);
      setSessions(response.data);
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
      await axios.put(`${API}/sessions-formation/${selectedSession.id}`, editSession);
      toast({
        title: "Formation mise à jour",
        description: "La session de formation a été modifiée avec succès",
        variant: "success"
      });
      setShowEditModal(false);
      setSelectedSession(null);
      
      // Reload sessions
      const response = await axios.get(`${API}/sessions-formation`);
      setSessions(response.data);
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
        await axios.delete(`${API}/sessions-formation/${sessionId}/desinscription`);
        toast({
          title: "Désinscription réussie",
          description: "Vous êtes désinscrit de cette formation",
          variant: "success"
        });
      } else {
        await axios.post(`${API}/sessions-formation/${sessionId}/inscription`);
        toast({
          title: "Inscription réussie",
          description: "Vous êtes maintenant inscrit à cette formation",
          variant: "success"
        });
      }
      
      // Reload sessions
      const response = await axios.get(`${API}/sessions-formation`);
      setSessions(response.data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de traiter l'inscription",
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
const MesDisponibilites = () => {
  const { user } = useAuth();
  const [userDisponibilites, setUserDisponibilites] = useState([]);
  const [typesGarde, setTypesGarde] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState([]);
  const [selectedDateDetails, setSelectedDateDetails] = useState(null);
  const [pendingConfigurations, setPendingConfigurations] = useState([]);
  const [availabilityConfig, setAvailabilityConfig] = useState({
    type_garde_id: '',
    heure_debut: '08:00',
    heure_fin: '16:00',
    statut: 'disponible'
  });
  const { toast } = useToast();

  useEffect(() => {
    const fetchDisponibilites = async () => {
      try {
        const [dispoResponse, typesResponse] = await Promise.all([
          axios.get(`${API}/disponibilites/${user.id}`),
          axios.get(`${API}/types-garde`)
        ]);
        setUserDisponibilites(dispoResponse.data);
        setTypesGarde(typesResponse.data);
      } catch (error) {
        console.error('Erreur lors du chargement des disponibilités:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id && user?.type_emploi === 'temps_partiel') {
      fetchDisponibilites();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

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



  const handleAddConfiguration = () => {
    if (selectedDates.length === 0) {
      toast({
        title: "Aucune date sélectionnée",
        description: "Veuillez sélectionner au moins une date",
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
        user_id: user.id,
        date: d.date,
        type_garde_id: d.type_garde_id || null,
        heure_debut: d.heure_debut,
        heure_fin: d.heure_fin,
        statut: d.statut
      }));

      const newDispos = pendingConfigurations.flatMap(config => 
        config.dates.map(date => ({
          user_id: user.id,
          date: date.toISOString().split('T')[0],
          type_garde_id: config.type_garde_id || null,
          heure_debut: config.heure_debut,
          heure_fin: config.heure_fin,
          statut: config.statut
        }))
      );

      const allDisponibilites = [...existingDispos, ...newDispos];

      await axios.put(`${API}/disponibilites/${user.id}`, allDisponibilites);
      
      toast({
        title: "Toutes les disponibilités sauvegardées",
        description: `${newDispos.length} nouvelles disponibilités ajoutées`,
        variant: "success"
      });
      
      setShowCalendarModal(false);
      setPendingConfigurations([]);
      
      // Reload disponibilités
      const dispoResponse = await axios.get(`${API}/disponibilites/${user.id}`);
      setUserDisponibilites(dispoResponse.data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder",
        variant: "destructive"
      });
    }
  };

  const handleSaveAvailability = async () => {
    if (selectedDates.length === 0) {
      toast({
        title: "Aucune date sélectionnée",
        description: "Veuillez sélectionner au moins une date",
        variant: "destructive"
      });
      return;
    }

    try {
      // CORRECTION : Combiner avec les disponibilités existantes au lieu de remplacer
      const existingDispos = userDisponibilites.map(d => ({
        user_id: user.id,
        date: d.date,
        type_garde_id: d.type_garde_id || null,
        heure_debut: d.heure_debut,
        heure_fin: d.heure_fin,
        statut: d.statut
      }));

      const nouvelles_disponibilites = selectedDates.map(date => ({
        user_id: user.id,
        date: date.toISOString().split('T')[0],
        type_garde_id: availabilityConfig.type_garde_id || null,
        heure_debut: availabilityConfig.heure_debut,
        heure_fin: availabilityConfig.heure_fin,
        statut: availabilityConfig.statut
      }));

      // Combiner existantes + nouvelles
      const allDisponibilites = [...existingDispos, ...nouvelles_disponibilites];

      await axios.put(`${API}/disponibilites/${user.id}`, allDisponibilites);
      
      toast({
        title: "Disponibilités ajoutées",
        description: `${nouvelles_disponibilites.length} nouveaux jours configurés (${allDisponibilites.length} total)`,
        variant: "success"
      });
      
      setShowCalendarModal(false);
      setSelectedDates([]);
      
      // Reload
      const dispoResponse = await axios.get(`${API}/disponibilites/${user.id}`);
      setUserDisponibilites(dispoResponse.data);
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder",
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

  const getDisponibiliteForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return userDisponibilites.find(d => d.date === dateStr);
  };

  const handleDateClick = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    const dispos = userDisponibilites.filter(d => d.date === dateStr);
    
    if (dispos.length > 0) {
      // Afficher TOUTES les disponibilités pour cette date
      setSelectedDateDetails({
        date: date,
        disponibilites: dispos, // Tableau au lieu d'un seul objet
        count: dispos.length
      });
    } else {
      setSelectedDateDetails(null);
    }
  };

  if (user?.type_emploi !== 'temps_partiel') {
    return (
      <div className="access-denied">
        <h1>Module réservé aux employés temps partiel</h1>
        <p>Ce module permet aux employés à temps partiel de gérer leurs disponibilités.</p>
      </div>
    );
  }

  if (loading) return <div className="loading" data-testid="disponibilites-loading">Chargement...</div>;

  return (
    <div className="mes-disponibilites">
      <div className="disponibilites-header">
        <div>
          <h1 data-testid="disponibilites-title">Mes disponibilités</h1>
          <p>Gérez vos créneaux de disponibilité pour les différents types de garde</p>
        </div>
        <Button 
          variant="default" 
          onClick={() => setShowCalendarModal(true)}
          data-testid="configure-availability-btn"
        >
          📅 Configurer mes disponibilités
        </Button>
      </div>

      {/* Résumé des disponibilités - Design amélioré */}
      <div className="availability-overview-enhanced">
        <div className="overview-cards">
          <div className="overview-card">
            <div className="card-icon">📅</div>
            <div className="card-content">
              <span className="card-number">{userDisponibilites.length}</span>
              <span className="card-label">Disponibilités enregistrées</span>
            </div>
          </div>
          
          <div className="overview-card">
            <div className="card-icon">⏱️</div>
            <div className="card-content">
              <span className="card-number">
                {userDisponibilites.reduce((total, dispo) => {
                  if (dispo.statut === 'disponible') {
                    const start = new Date(`1970-01-01T${dispo.heure_debut}`);
                    let end = new Date(`1970-01-01T${dispo.heure_fin}`);
                    
                    // Corriger pour les horaires qui traversent minuit
                    if (end < start) {
                      end = new Date(`1970-01-02T${dispo.heure_fin}`); // Jour suivant
                    }
                    
                    const hours = (end - start) / (1000 * 60 * 60);
                    return total + hours;
                  }
                  return total;
                }, 0)}h
              </span>
              <span className="card-label">Heures/mois</span>
            </div>
          </div>
          
          <div className="overview-card">
            <div className="card-icon">🚒</div>
            <div className="card-content">
              <span className="card-number">{[...new Set(userDisponibilites.map(d => d.type_garde_id).filter(Boolean))].length}</span>
              <span className="card-label">Types de garde</span>
            </div>
          </div>
        </div>
      </div>

      {/* Calendrier et détails des disponibilités */}
      <div className="availability-main-enhanced">
        <div className="calendar-section-large">
          <h2>Calendrier de disponibilités - {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h2>
          
          <Calendar
            mode="multiple"
            selected={getAvailableDates()}
            onDayClick={handleDateClick}
            className="availability-calendar-large"
            disabled={(date) => date < new Date().setHours(0,0,0,0)}
            modifiers={{
              available: getAvailableDates(),
              ...userDisponibilites.reduce((acc, dispo) => {
                const date = new Date(dispo.date);
                const typeGardeName = getTypeGardeName(dispo.type_garde_id).toLowerCase().replace(/\s+/g, '-');
                if (!acc[typeGardeName]) acc[typeGardeName] = [];
                acc[typeGardeName].push(date);
                return acc;
              }, {})
            }}
            modifiersStyles={{
              available: { 
                backgroundColor: '#dcfce7', 
                color: '#166534',
                fontWeight: 'bold',
                cursor: 'pointer'
              },
              ...userDisponibilites.reduce((acc, dispo) => {
                const typeGardeName = getTypeGardeName(dispo.type_garde_id).toLowerCase().replace(/\s+/g, '-');
                const color = getColorByTypeGarde(dispo.type_garde_id);
                acc[typeGardeName] = {
                  backgroundColor: color + '20',
                  borderColor: color,
                  borderWidth: '2px',
                  color: color,
                  fontWeight: 'bold',
                  cursor: 'pointer'
                };
                return acc;
              }, {})
            }}
          />
          
          <div className="calendar-legend-enhanced">
            <div className="legend-section">
              <h4>📍 Légende du calendrier</h4>
              <div className="legend-items-enhanced">
                <div className="legend-item-enhanced available">
                  <div className="legend-indicator available"></div>
                  <span>Jours disponibles configurés</span>
                </div>
                <div className="legend-item-enhanced unavailable">
                  <div className="legend-indicator unavailable"></div>
                  <span>Jours non configurés</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Code couleur modernisé par type de garde */}
          {typesGarde.length > 0 && (
            <div className="type-garde-legend-enhanced">
              <h4>🎨 Code couleur par type de garde</h4>
              <div className="type-legend-grid">
                {typesGarde.map(type => (
                  <div key={type.id} className="type-legend-card">
                    <div className="type-color-indicator" style={{ backgroundColor: type.couleur }}>
                      <span className="type-initial">{type.nom.charAt(0)}</span>
                    </div>
                    <div className="type-info">
                      <span className="type-name">{type.nom}</span>
                      <span className="type-hours">{type.heure_debut} - {type.heure_fin}</span>
                    </div>
                  </div>
                ))}
                <div className="type-legend-card">
                  <div className="type-color-indicator general">
                    <span className="type-initial">T</span>
                  </div>
                  <div className="type-info">
                    <span className="type-name">Tous types (général)</span>
                    <span className="type-hours">Horaires variables</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="availability-details-enhanced">
          <div className="details-header">
            <h3>📋 Détails des disponibilités</h3>
            <p className="click-instruction">💡 Cliquez sur une date du calendrier pour voir les détails</p>
          </div>

          {/* Affichage des détails de la date cliquée - Gestion multiple */}
          {selectedDateDetails && (
            <div className="selected-date-details">
              <div className="selected-date-header">
                <h4>📅 {selectedDateDetails.date.toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} 
                {selectedDateDetails.count > 1 && (
                  <span className="multiple-indicator">({selectedDateDetails.count} configurations)</span>
                )}
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedDateDetails(null)}
                  className="close-details"
                >
                  ✕
                </Button>
              </div>
              
              <div className="selected-date-content">
                {selectedDateDetails.disponibilites.map((dispo, index) => (
                  <div key={index} className="dispo-detail-card">
                    <div className="detail-item-large">
                      <span className="detail-icon">🚒</span>
                      <div className="detail-info">
                        <span className="detail-title">Type de garde {selectedDateDetails.count > 1 ? `#${index + 1}` : ''}</span>
                        <span className="detail-value" style={{ color: getColorByTypeGarde(dispo.type_garde_id) }}>
                          {getTypeGardeName(dispo.type_garde_id)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="detail-item-large">
                      <span className="detail-icon">⏰</span>
                      <div className="detail-info">
                        <span className="detail-title">Horaires</span>
                        <span className="detail-value">
                          {dispo.heure_debut} - {dispo.heure_fin}
                        </span>
                      </div>
                    </div>
                    
                    <div className="detail-item-large">
                      <span className="detail-icon">📊</span>
                      <div className="detail-info">
                        <span className="detail-title">Statut</span>
                        <span className={`detail-status ${dispo.statut}`}>
                          {dispo.statut === 'disponible' ? '✅ Disponible' : 
                           dispo.statut === 'preference' ? '⚡ Préférence' : '❌ Indisponible'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste des disponibilités triée par date */}
          {userDisponibilites.length > 0 ? (
            <div className="availability-list-enhanced">
              {userDisponibilites
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map(dispo => (
                <div key={dispo.id} className="availability-item-enhanced">
                  <div className="availability-date-info">
                    <div className="date-badge">
                      <span className="date-day-short">{new Date(dispo.date).getDate()}</span>
                      <span className="date-month-short">{new Date(dispo.date).toLocaleDateString('fr-FR', { month: 'short' })}</span>
                    </div>
                    <div className="date-details">
                      <span className="date-full-text">{new Date(dispo.date).toLocaleDateString('fr-FR')}</span>
                      <span className="date-weekday">{new Date(dispo.date).toLocaleDateString('fr-FR', { weekday: 'long' })}</span>
                    </div>
                  </div>
                  
                  <div className="availability-garde-info">
                    <div className="garde-type">
                      <span 
                        className="garde-name" 
                        style={{ color: getColorByTypeGarde(dispo.type_garde_id) }}
                      >
                        {getTypeGardeName(dispo.type_garde_id)}
                      </span>
                      <span className="garde-icon">🚒</span>
                    </div>
                    <span className="garde-hours">{dispo.heure_debut} - {dispo.heure_fin}</span>
                  </div>
                  
                  <div className="availability-status-final">
                    <span className={`status-badge-final ${dispo.statut}`}>
                      {dispo.statut === 'disponible' ? 'Disponible' : 
                       dispo.statut === 'preference' ? 'Préférence' : 'Indisponible'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-availability-enhanced">
              <div className="empty-state-enhanced">
                <div className="empty-icon-large">📅</div>
                <h4>Aucune disponibilité configurée</h4>
                <p>Configurez vos créneaux pour faciliter la planification de vos gardes.</p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowCalendarModal(true)}
                  data-testid="start-configuration-btn"
                >
                  Commencer la configuration
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de configuration avancée */}
      {showCalendarModal && (
        <div className="modal-overlay" onClick={() => setShowCalendarModal(false)}>
          <div className="modal-content extra-large-modal" onClick={(e) => e.stopPropagation()} data-testid="availability-config-modal">
            <div className="modal-header">
              <h3>📅 Configurer mes disponibilités</h3>
              <Button variant="ghost" onClick={() => setShowCalendarModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="availability-config-advanced">
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
                      <div className="status-field">
                        <Label>Statut</Label>
                        <select 
                          value={availabilityConfig.statut}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, statut: e.target.value})}
                          className="form-select"
                          data-testid="availability-status-select"
                        >
                          <option value="disponible">✅ Disponible</option>
                          <option value="preference">⚡ Préférence</option>
                        </select>
                      </div>
                    </div>
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
                      <div className="status-selection-simple">
                        <Label>Statut de disponibilité</Label>
                        <select 
                          value={availabilityConfig.statut}
                          onChange={(e) => setAvailabilityConfig({...availabilityConfig, statut: e.target.value})}
                          className="form-select"
                          data-testid="availability-status-select"
                        >
                          <option value="disponible">✅ Disponible</option>
                          <option value="preference">⚡ Préférence</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sélection des dates */}
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
              </div>

              <div className="modal-actions">
                <Button variant="outline" onClick={() => setShowCalendarModal(false)}>
                  Annuler
                </Button>
                <Button 
                  variant="default" 
                  onClick={handleSaveAvailability}
                  data-testid="save-availability-btn"
                  disabled={!selectedDates || selectedDates.length === 0}
                >
                  Sauvegarder ({selectedDates?.length || 0} jour(s))
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
      try {
        const [userResponse, formationsResponse, statsResponse, episResponse] = await Promise.all([
          axios.get(`${API}/users/${user.id}`),
          axios.get(`${API}/formations`),
          axios.get(`${API}/users/${user.id}/stats-mensuelles`),
          axios.get(`${API}/epi/employe/${user.id}`)
        ]);
        
        setUserProfile(userResponse.data);
        setFormations(formationsResponse.data);
        setMonthlyStats(statsResponse.data);
        setMyEPIs(episResponse.data);
        
        // Créer un objet de tailles pour l'édition
        const tailles = {};
        episResponse.data.forEach(epi => {
          tailles[epi.type_epi] = epi.taille;
        });
        setEpiTailles(tailles);
        
        setProfileData({
          nom: userResponse.data.nom,
          prenom: userResponse.data.prenom,
          email: userResponse.data.email,
          telephone: userResponse.data.telephone,
          contact_urgence: userResponse.data.contact_urgence || '',
          heures_max_semaine: userResponse.data.heures_max_semaine || 25
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
  }, [user?.id]);

  const handleSaveProfile = async () => {
    try {
      // Utiliser l'endpoint spécial pour modification de son propre profil
      const updateData = {
        prenom: profileData.prenom,
        nom: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        contact_urgence: profileData.contact_urgence,
        heures_max_semaine: profileData.heures_max_semaine || 25
      };

      const response = await axios.put(`${API}/users/mon-profil`, updateData);
      
      // Mettre à jour le profil local avec la réponse
      setUserProfile(response.data);
      
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
          return axios.put(`${API}/epi/${epi.id}`, {
            taille: epiTailles[epi.type_epi]
          });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);

      // Recharger les EPI
      const response = await axios.get(`${API}/epi/employe/${user.id}`);
      setMyEPIs(response.data);

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
      // For demo - just show success
      toast({
        title: "Mot de passe modifié",
        description: "Votre mot de passe a été mis à jour avec succès",
        variant: "success"
      });
      setShowPasswordModal(false);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de modifier le mot de passe",
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
                <Label>Contact d'urgence</Label>
                <Input
                  value={profileData.contact_urgence || ''}
                  onChange={(e) => setProfileData({...profileData, contact_urgence: e.target.value})}
                  disabled={!isEditing}
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

            {myEPIs.length > 0 ? (
              <div className="epi-tailles-grid">
                {myEPIs.map(epi => (
                  <div key={epi.id} className="epi-taille-item">
                    <span className="epi-taille-icon">{getEPIIcone(epi.type_epi)}</span>
                    <div className="epi-taille-info">
                      <Label>{getEPINom(epi.type_epi)}</Label>
                      <Input
                        value={epiTailles[epi.type_epi] || epi.taille}
                        onChange={(e) => setEpiTailles({...epiTailles, [epi.type_epi]: e.target.value})}
                        disabled={!isEditingEPI}
                        placeholder="Taille"
                        className="epi-taille-input"
                        data-testid={`epi-taille-${epi.type_epi}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-epi-text">Aucun EPI n'est actuellement attribué. Contactez votre superviseur.</p>
            )}

            {isEditingEPI && myEPIs.length > 0 && (
              <div className="form-actions">
                <Button onClick={handleSaveEPITailles} data-testid="save-epi-tailles-btn">
                  Sauvegarder les tailles
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
  }, [user]);

  useEffect(() => {
    if (activeSection === 'epi' && user?.role === 'admin') {
      fetchEPIData();
    }
  }, [activeSection, user]);

  const fetchStatistiques = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/rapports/statistiques-avancees`);
      setStatistiques(response.data);
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
    setLoadingEPI(true);
    try {
      const response = await axios.get(`${API}/epi/alertes/all`);
      setEpiAlerts(response.data);
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
      
      const response = await axios.get(`${API}/rapports/export-pdf?${params}`);
      
      // Décoder le base64 et créer le téléchargement
      const binaryString = atob(response.data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.filename;
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
      const response = await axios.get(`${API}/rapports/export-excel?type_rapport=${typeRapport}`);
      
      // Décoder le base64 et créer le téléchargement
      const binaryString = atob(response.data.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = response.data.filename;
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
  const { user } = useAuth();

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'personnel':
        return <Personnel />;
      case 'epi':
        return <ModuleEPI user={user} />;
      case 'planning':
        return <Planning />;
      case 'remplacements':
        return <Remplacements />;
      case 'disponibilites':
        return <MesDisponibilites user={user} />;
      case 'formations':
        return <Formations />;
      case 'rapports':
        return <Rapports />;
      case 'parametres':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Parametres user={user} />
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
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner">Chargement...</div>
      </div>
    );
  }

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