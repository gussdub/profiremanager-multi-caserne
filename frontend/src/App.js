import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Calendar } from "./components/ui/calendar";
import { useToast } from "./hooks/use-toast";
import { Toaster } from "./components/ui/toaster";
import VehiculeQRAction from './components/VehiculeQRAction';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { useTenant } from "./contexts/TenantContext";
import { useAuth, AuthProvider } from "./contexts/AuthContext";
import { getTenantToken, buildApiUrl } from "./utils/api";
const SecteursMap = lazy(() => import("./components/SecteursMap"));
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, apiCall } from "./utils/api";
import PushNotificationService from "./services/pushNotifications";
import { fr } from "date-fns/locale";
// Chart dynamique pour réduire bundle initial
const Chart = lazy(() => import("react-apexcharts"));
const RapportHeuresModal = lazy(() => import("./components/RapportHeuresModal"));
const AuditModal = lazy(() => import("./components/AuditModal"));
// Composants extraits pour réduire la taille de App.js
const Planning = lazy(() => import("./components/Planning"));
const Personnel = lazy(() => import("./components/Personnel"));
const ModuleEPI = lazy(() => import("./components/ModuleEPI"));
const Remplacements = lazy(() => import("./components/Remplacements"));
const Formations = lazy(() => import("./components/Formations"));
const MesDisponibilites = lazy(() => import("./components/MesDisponibilites"));
import "./App.css";

// Composant d'installation PWA pour iOS
// Affiche une page d'installation SANS redirection automatique
// L'utilisateur doit d'abord ajouter le raccourci, puis cliquer pour continuer
const PWARedirect = () => {
  const { tenantSlug } = useParams();
  const [isInstalled, setIsInstalled] = useState(false);
  
  // Vérifier si l'app est lancée depuis un raccourci (mode standalone)
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || window.navigator.standalone === true;
    
    if (isStandalone && tenantSlug) {
      // L'app est ouverte depuis un raccourci - rediriger vers le dashboard
      localStorage.setItem('profiremanager_last_tenant', tenantSlug);
      window.location.href = `/${tenantSlug}/dashboard`;
    }
  }, [tenantSlug]);
  
  const handleContinue = () => {
    if (tenantSlug) {
      localStorage.setItem('profiremanager_last_tenant', tenantSlug);
      window.location.href = `/${tenantSlug}/dashboard`;
    }
  };
  
  const tenantName = tenantSlug ? tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1) : '';
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #DC2626 0%, #991b1b 100%)',
      color: 'white',
      textAlign: 'center',
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '20px',
        padding: '1.5rem',
        maxWidth: '380px',
        width: '100%',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🚒</div>
        <h1 style={{ color: '#DC2626', fontSize: '1.3rem', marginBottom: '0.25rem' }}>
          ProFireManager
        </h1>
        <h2 style={{ color: '#374151', fontSize: '1.1rem', marginBottom: '1rem', fontWeight: '600' }}>
          {tenantName}
        </h2>
        
        {/* Instructions d'installation */}
        <div style={{
          background: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '12px',
          padding: '1rem',
          marginBottom: '1rem',
          textAlign: 'left'
        }}>
          <p style={{ color: '#92400e', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            📱 Pour créer un raccourci :
          </p>
          <ol style={{ color: '#78350f', fontSize: '0.8rem', margin: 0, paddingLeft: '1.2rem', lineHeight: '1.6' }}>
            <li>Cliquez sur <strong>Partager</strong> (⬆️) en bas de Safari</li>
            <li>Sélectionnez <strong>"Sur l'écran d'accueil"</strong></li>
            <li>Nommez-le <strong>"{tenantName}"</strong></li>
            <li>Cliquez <strong>Ajouter</strong></li>
          </ol>
        </div>
        
        {/* Bouton pour continuer */}
        <button
          onClick={handleContinue}
          style={{
            width: '100%',
            padding: '0.9rem',
            background: '#DC2626',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '0.75rem'
          }}
        >
          Continuer vers {tenantName} →
        </button>
        
        <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>
          Créez d'abord le raccourci, puis cliquez sur "Continuer"
        </p>
      </div>
      
      {/* Note pour plusieurs casernes */}
      <p style={{ 
        color: 'rgba(255,255,255,0.8)', 
        fontSize: '0.75rem', 
        marginTop: '1rem',
        maxWidth: '320px'
      }}>
        💡 Pour ajouter une autre caserne, utilisez l'URL :<br/>
        <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
          /pwa/nom-caserne
        </code>
      </p>
    </div>
  );
};

// Lazy loading pour optimiser les performances
const Parametres = lazy(() => import("./components/Parametres"));
const SuperAdminDashboard = lazy(() => import("./components/SuperAdminDashboard"));
const MesEPI = lazy(() => import("./components/MesEPI"));
const PlansIntervention = lazy(() => import("./components/PlansIntervention"));
const BatimentDetailModal = lazy(() => import("./components/BatimentDetailModalNew"));
const ConflictResolutionModal = lazy(() => import("./components/ConflictResolutionModal"));
const GestionActifs = lazy(() => import("./components/GestionActifs"));
const PlanInterventionViewer = lazy(() => import("./components/PlanInterventionViewer"));
const ParametresPrevention = lazy(() => import("./components/ParametresPrevention"));
const PlanificationView = lazy(() => import("./components/PlanificationView"));
const CartePlanification = lazy(() => import("./components/CartePlanification"));
const NonConformites = lazy(() => import("./components/NonConformites"));
const InspectionTerrain = lazy(() => import("./components/InspectionTerrain"));
import OfflineManager from "./components/OfflineManager";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Composant de chargement
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loading-spinner"></div>
    <p>Chargement du module...</p>
  </div>
);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = BACKEND_URL ? `${BACKEND_URL}/api` : '/api';

// Fonction utilitaire pour parser une date string "YYYY-MM-DD" en timezone local
const parseDateLocal = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Fonction utilitaire pour formater une date en string "YYYY-MM-DD" en timezone local
const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Configure axios defaults
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Fonctions utilitaires pour localStorage avec préfixe tenant (globales)
const getStorageKey = (key, tenantSlug) => {
  return tenantSlug ? `${tenantSlug}_${key}` : key;
};

window.getTenantItem = (key) => {
  const tenantSlug = window.location.pathname.split('/')[1];
  return localStorage.getItem(getStorageKey(key, tenantSlug));
};

window.setTenantItem = (key, value) => {
  const tenantSlug = window.location.pathname.split('/')[1];
  localStorage.setItem(getStorageKey(key, tenantSlug), value);
};

// ForgotPassword Component
const ForgotPassword = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { tenantSlug } = useTenant();
  const { toast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/${tenantSlug}/auth/forgot-password`, {
        email
      });

      setEmailSent(true);
      toast({
        title: "Email envoyé",
        description: "Si cet email existe, vous recevrez un lien de réinitialisation.",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
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
              <CardTitle>Email envoyé ✅</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants.
              </p>
              <p className="text-center text-sm text-gray-500">
                Vérifiez votre boîte de réception et vos courriers indésirables.
              </p>
              <Button 
                onClick={onBack}
                className="w-full"
                variant="outline"
              >
                Retour à la connexion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
            <CardTitle>Mot de passe oublié</CardTitle>
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
                  placeholder="votre@email.com"
                  required
                />
                <p className="text-sm text-gray-500 mt-2">
                  Nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </Button>
              <Button 
                type="button"
                onClick={onBack}
                className="w-full"
                variant="outline"
              >
                Retour à la connexion
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ResetPassword Component
const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(null);
  const [email, setEmail] = useState('');
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  // Extraire le token de l'URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  useEffect(() => {
    // Vérifier la validité du token au chargement
    const verifyToken = async () => {
      if (!token) {
        setTokenValid(false);
        return;
      }

      try {
        const response = await axios.get(`${API}/${tenantSlug}/auth/verify-reset-token/${token}`);
        setTokenValid(true);
        setEmail(response.data.email);
      } catch (error) {
        setTokenValid(false);
        toast({
          title: "Token invalide",
          description: error.response?.data?.detail || "Ce lien est invalide ou a expiré",
          variant: "destructive"
        });
      }
    };

    verifyToken();
  }, [token, tenantSlug]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 8 caractères",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/${tenantSlug}/auth/reset-password`, {
        token,
        nouveau_mot_de_passe: password
      });

      setSuccess(true);
      toast({
        title: "Succès",
        description: "Votre mot de passe a été réinitialisé avec succès",
      });

      // Rediriger vers la page de connexion après 3 secondes
      setTimeout(() => {
        window.location.href = `/${tenantSlug}`;
      }, 3000);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (tokenValid === null) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div className="loading-spinner"></div>
            <p>Vérification du lien...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokenValid === false) {
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
              <CardTitle>Lien invalide ❌</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Ce lien de réinitialisation est invalide ou a expiré.
              </p>
              <Button 
                onClick={() => window.location.href = `/${tenantSlug}`}
                className="w-full"
              >
                Retour à la connexion
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (success) {
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
              <CardTitle>Mot de passe réinitialisé ✅</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-gray-600">
                Votre mot de passe a été réinitialisé avec succès.
              </p>
              <p className="text-center text-sm text-gray-500">
                Vous allez être redirigé vers la page de connexion...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

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
            <CardTitle>Nouveau mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  Email: <strong>{email}</strong>
                </p>
              </div>
              <div>
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <div style={{position: 'relative'}}>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{paddingRight: '40px'}}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Minimum 8 caractères, 1 majuscule, 1 chiffre, 1 caractère spécial
                </p>
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
              >
                {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Login Component
const Login = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [personnalisation, setPersonnalisation] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [autoLoginDone, setAutoLoginDone] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const { login } = useAuth();
  const { toast } = useToast();
  const { tenantSlug } = useTenant();

  // Import des fonctions de stockage robuste (async)
  const storageModule = React.useRef(null);
  
  // Charger le module de stockage au montage
  useEffect(() => {
    import('./utils/storage').then(module => {
      storageModule.current = module;
      console.log('[Login] ✅ Module de stockage chargé');
    });
  }, []);

  // Auto-login au chargement (version async avec stockage robuste)
  useEffect(() => {
    if (!tenantSlug || autoLoginDone) {
      if (!tenantSlug) setLoading(false);
      return;
    }
    
    const attemptAutoLogin = async () => {
      setAutoLoginDone(true);
      
      // Attendre que le module de stockage soit chargé
      let attempts = 0;
      while (!storageModule.current && attempts < 20) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      
      if (!storageModule.current) {
        console.log('[Login] ⚠️ Module de stockage non disponible, utilisation localStorage');
        // Fallback localStorage
        try {
          const savedCreds = localStorage.getItem('profiremanager_saved_credentials');
          if (savedCreds) {
            const allCreds = JSON.parse(savedCreds);
            const tenantCreds = allCreds[tenantSlug];
            if (tenantCreds?.email && tenantCreds?.password) {
              setEmail(tenantCreds.email);
              setMotDePasse(tenantCreds.password);
              const result = await login(tenantCreds.email, tenantCreds.password);
              if (result.success) {
                console.log('[Login] ✅ Auto-connexion réussie (localStorage)!');
                return;
              }
            }
          }
        } catch (e) {}
        setLoading(false);
        return;
      }
      
      // Utiliser le stockage robuste
      const tenantCreds = await storageModule.current.getCredentials(tenantSlug);
      console.log('[Login] Vérification identifiants pour:', tenantSlug, '- Trouvé:', !!tenantCreds);
      
      if (tenantCreds && tenantCreds.email && tenantCreds.password) {
        setEmail(tenantCreds.email);
        setMotDePasse(tenantCreds.password);
        
        console.log('[Login] Tentative auto-connexion...');
        
        try {
          const result = await login(tenantCreds.email, tenantCreds.password);
          
          if (result.success) {
            console.log('[Login] ✅ Auto-connexion réussie!');
            return;
          } else {
            console.log('[Login] ❌ Auto-connexion échouée:', result.error);
            await storageModule.current.clearCredentials(tenantSlug);
            setMotDePasse('');
          }
        } catch (error) {
          console.error('[Login] Erreur auto-login:', error);
        }
      }
      
      setLoading(false);
    };
    
    attemptAutoLogin();
  }, [tenantSlug, login]);
  
  // Fonction de debug pour afficher l'état du stockage
  const showStorageDebug = async () => {
    if (storageModule.current) {
      const info = await storageModule.current.getStorageDebugInfo();
      setDebugInfo(info);
      setShowDebugPanel(true);
    }
  }

  // Charger la personnalisation du tenant
  useEffect(() => {
    const loadPersonnalisation = async () => {
      try {
        const response = await axios.get(`${API}/${tenantSlug}/public/branding`);
        setPersonnalisation(response.data);
      } catch (error) {
        setPersonnalisation({
          logo_url: '',
          nom_service: '',
          afficher_profiremanager: true
        });
      }
    };

    if (tenantSlug) {
      loadPersonnalisation();
    }
  }, [tenantSlug]);

  if (showForgotPassword) {
    return <ForgotPassword onBack={() => setShowForgotPassword(false)} />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const result = await login(email, motDePasse);
    
    if (result.success) {
      // Sauvegarder les identifiants si "Se souvenir" est coché
      if (rememberMe && storageModule.current) {
        await storageModule.current.saveCredentials(tenantSlug, email, motDePasse);
        toast({
          title: "✅ Identifiants sauvegardés",
          description: "Vous serez connecté automatiquement la prochaine fois"
        });
      }
    } else {
      toast({
        title: "Erreur de connexion",
        description: result.error,
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  // Afficher un loader pendant la tentative d'auto-login
  if (loading && !email) {
    return (
      <div className="login-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
          <p>Connexion en cours...</p>
          {/* Bouton debug caché - triple tap pour activer */}
          <div 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            style={{ marginTop: '2rem', opacity: 0.3, fontSize: '0.75rem' }}
          >
            🔧 Debug
          </div>
        </div>
      </div>
    );
  }

  // Panneau de debug pour iOS
  const DebugPanel = () => (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: '#1a1a2e',
      color: '#00ff00',
      padding: '1rem',
      maxHeight: '50vh',
      overflow: 'auto',
      fontSize: '0.75rem',
      fontFamily: 'monospace',
      zIndex: 9999
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong>🔧 Debug Storage</strong>
        <button onClick={() => setShowDebugPanel(false)} style={{ background: 'red', color: 'white', border: 'none', padding: '2px 8px' }}>X</button>
      </div>
      <button onClick={showStorageDebug} style={{ background: '#333', color: 'white', padding: '4px 8px', marginBottom: '0.5rem' }}>
        Refresh Debug Info
      </button>
      {debugInfo && (
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      )}
    </div>
  )

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="logo">
            {personnalisation?.logo_url ? (
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <img 
                  src={personnalisation.logo_url} 
                  alt="Logo du service" 
                  style={{ 
                    maxHeight: '150px', 
                    maxWidth: '100%', 
                    objectFit: 'contain',
                    marginBottom: '1rem',
                    display: 'block',
                    marginLeft: 'auto',
                    marginRight: 'auto'
                  }}
                />
                {personnalisation.nom_service && (
                  <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'white', margin: '0', textAlign: 'center' }}>
                    {personnalisation.nom_service}
                  </h2>
                )}
              </div>
            ) : (
              <>
                <div className="logo-flame">
                  <div className="flame-container">
                    <i className="fas fa-fire flame-icon"></i>
                  </div>
                </div>
                <h1>ProFireManager</h1>
                <p className="version">v2.0 Avancé</p>
              </>
            )}
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
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username email"
                  data-testid="login-email-input"
                />
              </div>
              <div>
                <Label htmlFor="password">Mot de passe</Label>
                <div style={{position: 'relative'}}>
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    autoComplete="current-password"
                    data-testid="login-password-input"
                    style={{paddingRight: '40px'}}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>
              {/* Option "Se souvenir de moi" sur mobile */}
              {/* Option "Se souvenir de moi" - toujours visible */}
              <div className="flex items-center gap-2" style={{ marginBottom: '1rem' }}>
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="rememberMe" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                  Se souvenir de moi sur cet appareil
                </label>
              </div>
              <Button 
                type="submit" 
                className="w-full" 
                disabled={loading}
                data-testid="login-submit-btn"
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textDecoration: 'underline'
                  }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
        
        {/* Footer ProFireManager - Discret */}
        {personnalisation?.logo_url && (
          <div style={{ 
            marginTop: '2rem', 
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            opacity: 0.85
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div className="logo-flame" style={{ transform: 'scale(0.6)' }}>
                <div className="flame-container">
                  <i className="fas fa-fire flame-icon"></i>
                </div>
              </div>
            </div>
            <span style={{ 
              fontSize: '0.75rem', 
              color: 'white',
              fontWeight: '500'
            }}>
              Propulsé par ProFireManager
            </span>
          </div>
        )}
        
        {/* Lien debug discret - visible seulement en tapant plusieurs fois */}
        <div 
          onClick={showStorageDebug}
          style={{ 
            marginTop: '1rem', 
            textAlign: 'center',
            opacity: 0.3,
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer'
          }}
        >
          🔧
        </div>
      </div>
      
      {/* Panneau de debug */}
      {showDebugPanel && <DebugPanel />}
    </div>
  );
};

// Sidebar Navigation avec menu hamburger mobile
const Sidebar = ({ currentPage, setCurrentPage, tenant }) => {
  const { user, tenant: authTenant, logout } = useAuth();

  const { tenantSlug, switchTenant } = useTenant();
  
  // Afficher le bouton "Changer de caserne" sur mobile (écran < 768px) ou app native/standalone
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768 || 
        window.navigator.standalone === true || 
        window.matchMedia('(display-mode: standalone)').matches ||
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      setIsMobileDevice(isMobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showRemplacementModal, setShowRemplacementModal] = useState(false);
  const [selectedDemandeRemplacement, setSelectedDemandeRemplacement] = useState(null);
  const [remplacementCommentaire, setRemplacementCommentaire] = useState('');
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  
  // Effet pour ajouter une classe au body quand le menu mobile est ouvert
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.classList.add('mobile-menu-open');
    } else {
      document.body.classList.remove('mobile-menu-open');
    }
    return () => {
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMobileMenuOpen]);
  
  // Paramètres de notifications (localStorage)
  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem('notificationSettings');
    return saved ? JSON.parse(saved) : {
      soundEnabled: true,
      soundType: 'default',
      volume: 50,
      pushEnabled: true
    };
  });

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

  // Ouvrir le modal de détails de demande de remplacement
  const openRemplacementModal = async (demande_id) => {
    try {
      const demande = await apiGet(tenantSlug, `/remplacements/${demande_id}`);
      setSelectedDemandeRemplacement(demande);
      setRemplacementCommentaire('');
      setShowRemplacementModal(true);
    } catch (error) {
      console.error('Erreur chargement demande:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails de la demande",
        variant: "destructive"
      });
    }
  };

  // Accepter une demande de remplacement
  const handleAccepterRemplacement = async () => {
    if (!selectedDemandeRemplacement) return;
    
    try {
      await apiPost(
        tenantSlug,
        `/remplacements/${selectedDemandeRemplacement.id}/accepter`,
        { commentaire: remplacementCommentaire }
      );
      
      toast({
        title: "✅ Remplacement accepté",
        description: "Vous avez été assigné à cette garde. Le demandeur a été notifié.",
      });
      
      setShowRemplacementModal(false);
      setSelectedDemandeRemplacement(null);
      loadNotifications();
      
    } catch (error) {
      console.error('Erreur acceptation remplacement:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible d'accepter la demande",
        variant: "destructive"
      });
    }
  };

  // Refuser une demande de remplacement
  const handleRefuserRemplacement = async () => {
    if (!selectedDemandeRemplacement) return;
    
    try {
      await apiPost(
        tenantSlug,
        `/remplacements/${selectedDemandeRemplacement.id}/refuser`,
        { raison: remplacementCommentaire || "Non disponible" }
      );
      
      toast({
        title: "Demande refusée",
        description: "Le demandeur a été notifié de votre refus.",
      });
      
      setShowRemplacementModal(false);
      setSelectedDemandeRemplacement(null);
      loadNotifications();
      
    } catch (error) {
      console.error('Erreur refus remplacement:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de refuser la demande",
        variant: "destructive"
      });
    }
  };

  // Jouer un son quand il y a de nouvelles notifications
  useEffect(() => {
    if (unreadCount > 0) {
      playNotificationSound();
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
  
  // Jouer le son de notification
  const playNotificationSound = (customSettings = null) => {
    const settings = customSettings || notificationSettings;
    
    if (!settings.soundEnabled) return;
    
    try {
      // Sons simples générés
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Fréquences selon le type
      const frequencies = {
        default: [523.25, 659.25, 783.99], // Do-Mi-Sol
        chime: [659.25, 783.99, 1046.50], // Mi-Sol-Do aigu
        bell: [830.61, 987.77] // Sol#-Si
      };
      
      const freqs = frequencies[settings.soundType] || frequencies.default;
      
      // Volume
      gainNode.gain.setValueAtTime(settings.volume / 200, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      // Jouer les notes
      freqs.forEach((freq, index) => {
        setTimeout(() => {
          oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
          if (index === 0) {
            oscillator.start(audioContext.currentTime);
          }
        }, index * 100);
      });
      
      oscillator.stop(audioContext.currentTime + 0.5);
      
      console.log('🔊 Son joué:', settings.soundType, 'volume:', settings.volume);
    } catch (error) {
      console.error('Erreur lecture son:', error);
    }
  };
  
  // Sauvegarder les paramètres
  const saveNotificationSettings = (newSettings) => {
    setNotificationSettings(newSettings);
    localStorage.setItem('notificationSettings', JSON.stringify(newSettings));
    toast({
      title: "✅ Paramètres sauvegardés",
      description: "Vos préférences de notification ont été enregistrées"
    });
  };

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'personnel', label: 'Personnel', icon: '👥', roles: ['admin', 'superviseur'] },
    { id: 'actifs', label: 'Gestion des Actifs', icon: '🚒', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'planning', label: 'Planning', icon: '📅', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'disponibilites', label: 'Mes disponibilités', icon: '📋', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'remplacements', label: 'Remplacements', icon: '🔄', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'formations', label: 'Formations', icon: '📚', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'prevention', label: 'Prévention', icon: '🔥', roles: ['admin'] },  // Supprimé requiresModule temporairement
    { id: 'rapports', label: 'Rapports', icon: '📈', roles: ['admin'] },
    { id: 'parametres', label: 'Paramètres', icon: '⚙️', roles: ['admin'] },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧', roles: ['admin'], superAdminOnly: true },
    { id: 'mesepi', label: 'Mes EPI', icon: '🛡️', roles: ['admin', 'superviseur', 'employe'] },
    { id: 'monprofil', label: 'Mon profil', icon: '👤', roles: ['admin', 'superviseur', 'employe'] }
  ];

  const filteredMenuItems = menuItems.filter(item => {
    // Vérification du rôle seulement
    if (!item.roles.includes(user?.role)) return false;
    
    // Vérifier si c'est réservé aux super-admin (uniquement si connecté)
    if (item.superAdminOnly && (typeof isSuperAdmin === 'undefined' || !isSuperAdmin)) return false;
    
    // Vérifier si c'est le module "Mes disponibilités" qui ne doit être visible que pour les utilisateurs temps partiel
    if (item.id === 'disponibilites' && user.type_emploi !== 'temps_partiel') {
      return false;
    }
    
    // Vérifier si c'est le module "Prévention" et s'il est activé pour ce tenant
    if (item.id === 'prevention' && !authTenant?.parametres?.module_prevention_active) {
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

        {/* Overlay pour fermer les notifications en cliquant dehors */}
        {showNotifications && (
          <div 
            className="notifications-overlay"
            onClick={() => setShowNotifications(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 998
            }}
          />
        )}

        {/* Dropdown des notifications */}
        {showNotifications && (
          <div className="notifications-dropdown" style={{ zIndex: 999 }}>
            <div className="notifications-header">
              <h3>Notifications</h3>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button 
                  onClick={() => setShowNotificationSettings(!showNotificationSettings)} 
                  className="notification-settings-btn"
                  title="Paramètres des notifications"
                >
                  ⚙️
                </button>
                {unreadCount > 0 && (
                  <button onClick={marquerToutesLues} className="mark-all-read">
                    Tout marquer comme lu
                  </button>
                )}
              </div>
            </div>
            
            {/* Section Paramètres */}
            {showNotificationSettings && (
              <div className="notification-settings" style={{
                padding: '1rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                borderRadius: '8px',
                margin: '0.5rem'
              }}>
                <h4 style={{marginBottom: '1rem', fontSize: '0.9rem', fontWeight: '600'}}>⚙️ Paramètres des notifications</h4>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
                  {/* Activer/Désactiver le son */}
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={notificationSettings.soundEnabled}
                      onChange={(e) => saveNotificationSettings({...notificationSettings, soundEnabled: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <span style={{fontSize: '0.85rem'}}>🔔 Activer les sons</span>
                  </label>
                  
                  {/* Choix du son */}
                  {notificationSettings.soundEnabled && (
                    <>
                      <div>
                        <label style={{fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem'}}>🎵 Type de son</label>
                        <select
                          value={notificationSettings.soundType}
                          onChange={(e) => {
                            const newSettings = {...notificationSettings, soundType: e.target.value};
                            saveNotificationSettings(newSettings);
                            // Jouer un aperçu
                            setTimeout(() => playNotificationSound(newSettings), 100);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.85rem'
                          }}
                        >
                          <option value="default">Son par défaut</option>
                          <option value="chime">Carillon</option>
                          <option value="bell">Cloche</option>
                        </select>
                      </div>
                      
                      {/* Volume */}
                      <div>
                        <label style={{fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem'}}>
                          🔊 Volume ({notificationSettings.volume}%)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={notificationSettings.volume}
                          onChange={(e) => saveNotificationSettings({...notificationSettings, volume: parseInt(e.target.value)})}
                          style={{width: '100%'}}
                        />
                      </div>
                    </>
                  )}
                  
                  {/* Notifications push */}
                  <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={notificationSettings.pushEnabled}
                      onChange={(e) => saveNotificationSettings({...notificationSettings, pushEnabled: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <span style={{fontSize: '0.85rem'}}>📱 Notifications push du navigateur</span>
                  </label>
                </div>
              </div>
            )}

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
                  >
                    <div 
                      onClick={() => {
                        marquerCommeLue(notif.id);
                        setShowNotifications(false);
                        
                        // Navigation intelligente selon le type de notification
                        switch (notif.type) {
                          case 'remplacement_disponible':
                            if (notif.data?.demande_id) {
                              openRemplacementModal(notif.data.demande_id);
                            } else {
                              setCurrentPage('remplacements');
                            }
                            break;
                          case 'remplacement_accepte':
                          case 'remplacement_refuse':
                          case 'remplacement_demande':
                          case 'remplacement_pourvu':
                            // Aller au module Remplacements
                            setCurrentPage('remplacements');
                            break;
                          case 'planning_assigne':
                          case 'planning_modifie':
                            // Aller au Planning
                            setCurrentPage('planning');
                            break;
                          case 'conge_approuve':
                          case 'conge_refuse':
                          case 'conge_demande':
                            // Aller aux disponibilités
                            setCurrentPage('disponibilites');
                            break;
                          case 'formation_assignee':
                          case 'formation_rappel':
                            // Aller aux formations
                            setCurrentPage('formations');
                            break;
                          default:
                            // Utiliser le lien par défaut si disponible
                            if (notif.lien) {
                              setCurrentPage(notif.lien.replace(/^\/[^\/]+\//, ''));
                            }
                        }
                      }}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                        <div className="notification-icon">
                          {notif.type === 'remplacement_demande' && '🔄'}
                          {notif.type === 'remplacement_disponible' && '🔔'}
                          {notif.type === 'remplacement_accepte' && '✅'}
                          {notif.type === 'remplacement_pourvu' && 'ℹ️'}
                          {notif.type === 'conge_approuve' && '✅'}
                          {notif.type === 'conge_refuse' && '❌'}
                          {notif.type === 'conge_demande' && '📝'}
                          {notif.type === 'planning_assigne' && '📅'}
                        </div>
                        <div className="notification-content" style={{ flex: 1 }}>
                          <h4>{notif.titre}</h4>
                          <p>{notif.message}</p>
                          <span className="notification-time">
                            {new Date(notif.date_creation).toLocaleString('fr-FR')}
                          </span>
                          
                          {/* Boutons d'action pour remplacement disponible */}
                          {notif.type === 'remplacement_disponible' && notif.data?.demande_id && (
                            <div style={{ 
                              display: 'flex', 
                              gap: '8px', 
                              marginTop: '10px',
                              paddingTop: '10px',
                              borderTop: '1px solid #e5e7eb'
                            }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRemplacementModal(notif.data.demande_id);
                                  setShowNotifications(false);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 12px',
                                  background: '#10b981',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                ✅ Accepter
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openRemplacementModal(notif.data.demande_id);
                                  setShowNotifications(false);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '6px 12px',
                                  background: '#6b7280',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                📋 Voir détails
                              </button>
                            </div>
                          )}
                        </div>
                        {notif.statut === 'non_lu' && (
                          <div className="notification-dot"></div>
                        )}
                      </div>
                    </div>
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

      <div 
        className={`sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}
      >
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
              type="button"
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => {
                setCurrentPage(item.id);
                setIsMobileMenuOpen(false);
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
              {user?.photo_profil ? (
                <img 
                  src={user.photo_profil} 
                  alt="Photo de profil"
                  style={{ 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    borderRadius: '50%'
                  }}
                />
              ) : (
                <span className="user-icon">👤</span>
              )}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.prenom} {user?.nom}</p>
              <p className="user-role">{user?.role === 'admin' ? 'Administrateur' : 
                                      user?.role === 'superviseur' ? 'Superviseur' : 'Employé'}</p>
              <p className="user-grade">{user?.grade}</p>
            </div>
          </div>
          <div className="sidebar-user-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            {/* Bouton Changer de caserne - visible sur mobile */}
            {isMobileDevice && (
              <Button 
                variant="outline" 
                onClick={() => {
                  if (switchTenant) {
                    switchTenant();
                  } else {
                    localStorage.removeItem('profiremanager_last_tenant');
                    window.location.href = '/';
                  }
                  setIsMobileMenuOpen(false);
                }}
                className="switch-tenant-btn"
                style={{ 
                  fontSize: '0.85rem', 
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white'
                }}
              >
                🏢 Changer de caserne
              </Button>
            )}
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
      </div>
      
      {/* Zone cliquable pour fermer le menu - APRÈS la sidebar dans le DOM */}
      {isMobileMenuOpen && (
        <div 
          className="mobile-close-area"
          onClick={() => setIsMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99997,
            background: 'rgba(0, 0, 0, 0.6)',
            cursor: 'pointer'
          }}
        ></div>
      )}
    </>
  );
};


// Mon Profil Component épuré - sans disponibilités et remplacements
// Mon Profil Component épuré - sans disponibilités et remplacements
const MonProfil = () => {
  const { user, setUser, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const [userProfile, setUserProfile] = useState(null);
  const [formations, setFormations] = useState([]);
  const [competences, setCompetences] = useState([]);
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = React.useRef(null);
  
  // États pour le crop d'image
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropContainerRef = React.useRef(null);
  const cropImageRef = React.useRef(null);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!tenantSlug || !user?.id) {
        return;
      }
      
      console.log('🔍 Mon Profil - Début chargement:', {
        tenantSlug,
        userId: user.id,
        token: localStorage.getItem('token') ? 'Présent' : 'Absent'
      });
      
      try {
        const [userData, competencesData, statsData, episData] = await Promise.all([
          apiGet(tenantSlug, `/users/${user.id}`),
          apiGet(tenantSlug, '/competences'),
          apiGet(tenantSlug, `/users/${user.id}/stats-mensuelles`),
          apiGet(tenantSlug, `/epi/employe/${user.id}`)
        ]);
        
        console.log('📊 Mon Profil - userData chargé:', userData);
        console.log('🔍 Champs critiques:', {
          numero_employe: userData?.numero_employe,
          taux_horaire: userData?.taux_horaire,
          grade: userData?.grade,
          date_embauche: userData?.date_embauche,
          adresse: userData?.adresse
        });
        
        setUserProfile(userData);
        setCompetences(competencesData || []);
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
          numero_employe: userData.numero_employe || '',
          taux_horaire: userData.taux_horaire || 0,
          heures_max_semaine: userData.heures_max_semaine || 25
        });

      } catch (error) {
        console.error('❌ Mon Profil - Erreur chargement:', {
          error: error.message,
          stack: error.stack,
          tenantSlug,
          userId: user?.id
        });
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchUserProfile();
    }
  }, [user?.id, tenantSlug]);

  // Gestion de l'upload de photo de profil - Ouvre le modal de crop
  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Veuillez choisir une image JPG, PNG ou WEBP",
        variant: "destructive"
      });
      event.target.value = '';
      return;
    }

    // Lire l'image et ouvrir le modal de crop
    const reader = new FileReader();
    reader.onload = (e) => {
      // Charger l'image pour obtenir ses dimensions
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.width, height: img.height });
        setImageToCrop(e.target.result);
        setShowCropModal(true);
        setCropPosition({ x: 0, y: 0 });
        setZoom(1);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  // Gestion du drag pour déplacer l'image
  const handleCropMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - cropPosition.x, y: clientY - cropPosition.y });
  };

  const handleCropMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const container = cropContainerRef.current;
    if (!container) return;
    
    const containerSize = container.offsetWidth;
    const scaledWidth = imageSize.width * zoom;
    const scaledHeight = imageSize.height * zoom;
    
    // Calculer les limites de déplacement
    const minX = containerSize - scaledWidth;
    const minY = containerSize - scaledHeight;
    
    let newX = clientX - dragStart.x;
    let newY = clientY - dragStart.y;
    
    // Contraindre le déplacement pour que l'image couvre toujours le cercle
    newX = Math.min(0, Math.max(minX, newX));
    newY = Math.min(0, Math.max(minY, newY));
    
    setCropPosition({ x: newX, y: newY });
  };

  const handleCropMouseUp = () => {
    setIsDragging(false);
  };

  // Fonction pour recadrer et uploader l'image
  const handleCropComplete = async () => {
    if (!imageToCrop) return;
    
    setPhotoUploading(true);
    
    try {
      const img = new Image();
      img.src = imageToCrop;
      
      await new Promise((resolve) => {
        if (img.complete) resolve();
        else img.onload = resolve;
      });
      
      const canvas = document.createElement('canvas');
      const outputSize = 400; // Taille de sortie
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      
      // Calculer la zone de crop basée sur la position et le zoom
      const container = cropContainerRef.current;
      const containerSize = container ? container.offsetWidth : 300;
      
      // Ratio entre la taille affichée et la taille réelle
      const displayRatio = containerSize / (Math.min(imageSize.width, imageSize.height) * zoom);
      
      // Position du crop dans l'image originale
      const sourceX = -cropPosition.x / displayRatio / zoom;
      const sourceY = -cropPosition.y / displayRatio / zoom;
      const sourceSize = containerSize / displayRatio / zoom;
      
      // Dessiner l'image croppée
      ctx.drawImage(
        img,
        sourceX, sourceY, sourceSize, sourceSize,
        0, 0, outputSize, outputSize
      );
      
      // Convertir en base64 JPEG
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      
      const response = await apiPost(tenantSlug, '/users/photo-profil', {
        photo_base64: base64
      });
      
      // Mettre à jour le profil local
      setUserProfile(prev => ({...prev, photo_profil: response.photo_profil}));
      
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: response.photo_profil}));
      
      setShowCropModal(false);
      setImageToCrop(null);
      
      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été enregistrée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder la photo",
        variant: "destructive"
      });
    } finally {
      setPhotoUploading(false);
    }
  };

  // Ancienne fonction de compression (gardée pour compatibilité mais pas utilisée)
  const handlePhotoSelectOld = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Vérifier le type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Veuillez choisir une image JPG, PNG ou WEBP",
        variant: "destructive"
      });
      return;
    }

    setPhotoUploading(true);

    try {
      // Fonction pour compresser l'image côté client
      const compressImage = (file, maxWidth = 400, quality = 0.8) => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Redimensionner si nécessaire
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
              
              canvas.width = width;
              canvas.height = height;
              
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              // Convertir en JPEG compressé
              const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
              resolve(compressedBase64);
            };
            img.onerror = reject;
            img.src = e.target.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      };

      // Compresser si > 500KB, sinon utiliser directement
      let base64;
      if (file.size > 500 * 1024) {
        toast({
          title: "Compression en cours...",
          description: "L'image est optimisée automatiquement",
        });
        base64 = await compressImage(file, 400, 0.85);
      } else {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }
      
      const response = await apiPost(tenantSlug, '/users/photo-profil', {
        photo_base64: base64
      });
      
      // Mettre à jour le profil local
      setUserProfile(prev => ({...prev, photo_profil: response.photo_profil}));
      
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: response.photo_profil}));
      
      toast({
        title: "Photo mise à jour",
        description: "Votre photo de profil a été enregistrée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Impossible de sauvegarder la photo",
        variant: "destructive"
      });
    } finally {
      setPhotoUploading(false);
    }
    
    // Reset l'input pour permettre de re-sélectionner le même fichier
    event.target.value = '';
  };

  const handleDeletePhoto = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer votre photo de profil ?')) {
      return;
    }

    try {
      await apiDelete(tenantSlug, '/users/photo-profil');
      setUserProfile(prev => ({...prev, photo_profil: null}));
      // Mettre à jour le user global (pour la sidebar)
      setUser(prev => ({...prev, photo_profil: null}));
      toast({
        title: "Photo supprimée",
        description: "Votre photo de profil a été supprimée",
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la photo",
        variant: "destructive"
      });
    }
  };

  const handleSaveProfile = async () => {
    try {
      // Valider heures_max_semaine avant sauvegarde
      let heuresMax = profileData.heures_max_semaine;
      if (heuresMax === '' || heuresMax === null || heuresMax === undefined) {
        heuresMax = 25;
      } else {
        heuresMax = parseInt(heuresMax);
        if (heuresMax < 5) heuresMax = 5;
        if (heuresMax > 168) heuresMax = 168;
      }

      // Utiliser l'endpoint spécial pour modification de son propre profil
      const updateData = {
        prenom: profileData.prenom,
        nom: profileData.nom,
        email: profileData.email,
        telephone: profileData.telephone,
        adresse: profileData.adresse,
        contact_urgence: profileData.contact_urgence,
        heures_max_semaine: heuresMax
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
      console.log('💾 [Mon Profil] Début sauvegarde tailles EPI');
      console.log('📋 [Mon Profil] Tailles actuelles:', epiTailles);
      console.log('📦 [Mon Profil] EPIs existants:', myEPIs);
      
      const allEPITypes = getAllEPITypes();
      const updatePromises = [];
      const createPromises = [];
      
      // Pour chaque type d'EPI
      for (const epiType of allEPITypes) {
        const taille = epiTailles[epiType.id];
        const existingEPI = myEPIs.find(e => e.type_epi === epiType.id);
        
        console.log(`🔍 [${epiType.nom}] Taille: ${taille}, EPI existant:`, existingEPI ? `Oui (${existingEPI.taille})` : 'Non');
        
        // Si une taille est saisie
        if (taille && taille.trim() !== '') {
          if (existingEPI) {
            // Mettre à jour l'EPI existant si la taille a changé
            if (taille !== existingEPI.taille) {
              console.log(`✏️ [${epiType.nom}] Mise à jour: ${existingEPI.taille} → ${taille}`);
              updatePromises.push(
                apiPut(tenantSlug, `/epi/${existingEPI.id}`, {
                  taille: taille
                }).catch(err => {
                  console.error(`❌ Erreur PUT /epi/${existingEPI.id}:`, err);
                  throw err;
                })
              );
            } else {
              console.log(`⏭️ [${epiType.nom}] Aucun changement, skip`);
            }
          } else {
            // Créer un nouvel EPI
            console.log(`➕ [${epiType.nom}] Création nouvel EPI avec taille: ${taille}`);
            createPromises.push(
              apiPost(tenantSlug, '/epi', {
                user_id: user.id,
                type_epi: epiType.id,
                taille: taille,
                numero_serie: `${epiType.id.toUpperCase()}-${user.id.substring(0, 8)}`,
                marque: 'N/A',
                modele: 'N/A',
                date_mise_en_service: new Date().toISOString().split('T')[0],
                statut: 'En service',
                notes: 'Taille déclarée par l\'employé'
              }).catch(err => {
                console.error(`❌ Erreur POST /epi:`, err);
                throw err;
              })
            );
          }
        }
      }

      console.log(`📊 [Mon Profil] ${updatePromises.length} mise(s) à jour, ${createPromises.length} création(s)`);
      
      // Exécuter toutes les mises à jour et créations
      await Promise.all([...updatePromises, ...createPromises]);

      // Recharger les EPI
      const episData = await apiGet(tenantSlug, `/epi/employe/${user.id}`);
      setMyEPIs(episData);
      
      // Mettre à jour l'objet de tailles
      const tailles = {};
      episData.forEach(epi => {
        tailles[epi.type_epi] = epi.taille;
      });
      setEpiTailles(tailles);

      toast({
        title: "Tailles mises à jour",
        description: "Vos tailles d'EPI ont été sauvegardées et sont maintenant visibles dans le module Personnel",
        variant: "success"
      });

      setIsEditingEPI(false);
    } catch (error) {
      console.error('Erreur sauvegarde EPI:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Impossible de sauvegarder les tailles",
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

  const getCompetenceName = (competenceId) => {
    const competence = competences.find(c => c.id === competenceId);
    if (competence) return competence.nom;
    // Fallback pour compétences obsolètes/supprimées
    return "⚠️ Compétence obsolète";
  };

  if (loading) return <div className="loading" data-testid="profile-loading">Chargement du profil...</div>;
  
  // Debug : Vérifier si user est chargé
  if (!user || !user.id) {
    return (
      <div className="mon-profil">
        <div className="profile-header">
          <h1>Erreur</h1>
          <p style={{color: 'red'}}>
            ❌ Impossible de charger le profil utilisateur. user.id manquant.
            <br/>
            Debug: user = {JSON.stringify(user)}
            <br/>
            tenantSlug = {tenantSlug}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-epi-nfpa">
      <div className="module-header">
        <div>
          <h1>👤 Mon Profil</h1>
          <p>Gérez vos informations personnelles et paramètres de compte</p>
        </div>
      </div>

      {/* Layout en 2 colonnes */}
      <div className="profil-grid-layout">
        {/* Colonne gauche - Informations principales */}
        <div className="profil-main-column">
          
          {/* Section Photo de Profil */}
          <div className="formation-card" style={{ marginBottom: '1.5rem' }}>
            <div className="formation-header">
              <h3>📷 Photo de profil</h3>
            </div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1.5rem',
              padding: '1rem',
              flexWrap: 'wrap'
            }}>
              {/* Photo preview */}
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                overflow: 'hidden',
                background: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '3px solid #e5e7eb',
                flexShrink: 0
              }}>
                {userProfile?.photo_profil ? (
                  <img 
                    src={userProfile.photo_profil} 
                    alt="Photo de profil"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ 
                    fontSize: '3rem', 
                    color: '#9ca3af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    👤
                  </div>
                )}
              </div>
              
              {/* Boutons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/jpeg,image/png,image/webp"
                  
                  style={{ 
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    padding: '0',
                    margin: '-1px',
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: '0'
                  }}
                />
                <Button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={photoUploading}
                  style={{ minWidth: '160px' }}
                >
                  {photoUploading ? '⏳ Téléversement...' : '📷 Prendre une photo'}
                </Button>
                {userProfile?.photo_profil && (
                  <Button
                    variant="outline"
                    onClick={handleDeletePhoto}
                    style={{ minWidth: '160px', color: '#ef4444' }}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
                <p style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280',
                  margin: '0.5rem 0 0 0'
                }}>
                  JPG, PNG ou WEBP • Recadrage disponible
                </p>
              </div>
            </div>
          </div>

          {/* Modal de recadrage d'image avec drag-and-drop */}
          {showCropModal && imageToCrop && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px'
              }}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
              onTouchEnd={handleCropMouseUp}
            >
              <div 
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '24px',
                  width: '100%',
                  maxWidth: '450px',
                  maxHeight: '90vh',
                  overflow: 'auto'
                }}
              >
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>
                  ✂️ Recadrer votre photo
                </h3>
                <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                  Glissez l&apos;image pour la positionner dans le cercle
                </p>
                
                {/* Zone de crop avec drag */}
                <div 
                  ref={cropContainerRef}
                  style={{ 
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '1',
                    background: '#1f2937',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    marginBottom: '16px',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none'
                  }}
                  onMouseDown={handleCropMouseDown}
                  onMouseMove={handleCropMouseMove}
                  onTouchStart={handleCropMouseDown}
                  onTouchMove={handleCropMouseMove}
                >
                  <img
                    ref={cropImageRef}
                    src={imageToCrop}
                    alt="À recadrer"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: imageSize.width > imageSize.height 
                        ? `${(imageSize.width / imageSize.height) * 100 * zoom}%` 
                        : `${100 * zoom}%`,
                      height: imageSize.height > imageSize.width 
                        ? `${(imageSize.height / imageSize.width) * 100 * zoom}%` 
                        : `${100 * zoom}%`,
                      minWidth: `${100 * zoom}%`,
                      minHeight: `${100 * zoom}%`,
                      objectFit: 'cover',
                      left: cropPosition.x,
                      top: cropPosition.y,
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  />
                  {/* Overlay avec cercle transparent au centre */}
                  <svg 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <mask id="cropMask">
                        <rect x="0" y="0" width="100" height="100" fill="white"/>
                        <circle cx="50" cy="50" r="48" fill="black"/>
                      </mask>
                    </defs>
                    <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.6)" mask="url(#cropMask)"/>
                    <circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="0.5" strokeDasharray="2,2"/>
                  </svg>
                </div>
                
                {/* Contrôle de zoom */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>🔍</span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => {
                        const newZoom = parseFloat(e.target.value);
                        setZoom(newZoom);
                        // Recentrer après zoom
                        setCropPosition({ x: 0, y: 0 });
                      }}
                      style={{ flex: 1, height: '8px' }}
                    />
                    <span style={{ fontSize: '14px', color: '#6b7280', minWidth: '50px' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCropModal(false);
                      setImageToCrop(null);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCropComplete}
                    disabled={photoUploading}
                    style={{ background: '#10B981', color: 'white' }}
                  >
                    {photoUploading ? '⏳ Enregistrement...' : '✅ Valider'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Informations personnelles */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>📋 Informations personnelles</h3>
              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant={isEditing ? "outline" : "default"}
                data-testid="edit-profile-btn"
              >
                {isEditing ? 'Annuler' : '✏️ Modifier'}
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

              {/* Heures maximum par semaine - Visible pour tous, modifiable pour temps partiel uniquement */}
              <div className="form-field">
                <Label>Heures maximum par semaine</Label>
                <div className="heures-max-input">
                  <Input
                    type="number"
                    min="5"
                    max="168"
                    value={profileData.heures_max_semaine !== null && profileData.heures_max_semaine !== undefined 
                      ? profileData.heures_max_semaine 
                      : (userProfile?.heures_max_semaine || 40)}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permettre champ vide ou nombre valide
                      if (value === '') {
                        setProfileData({...profileData, heures_max_semaine: ''});
                      } else {
                        const numValue = parseInt(value);
                        // Accepter toute valeur pendant la saisie pour permettre l'effacement
                        setProfileData({...profileData, heures_max_semaine: numValue});
                      }
                    }}
                    onBlur={(e) => {
                      // Valider à la sortie du champ
                      const value = e.target.value;
                      if (value === '' || value < 5) {
                        setProfileData({...profileData, heures_max_semaine: 5});
                      } else if (value > 168) {
                        setProfileData({...profileData, heures_max_semaine: 168});
                      }
                    }}
                    disabled={!isEditing || userProfile?.type_emploi === 'temps_plein'}
                    data-testid="profile-heures-max-input"
                  />
                  <span className="heures-max-unit">heures/semaine</span>
                </div>
                <small className="heures-max-help">
                  {userProfile?.type_emploi === 'temps_partiel' 
                    ? "Indiquez le nombre maximum d'heures que vous souhaitez travailler par semaine (5-168h)."
                    : "Limite d'heures hebdomadaires configurée par l'administrateur."}
                </small>
              </div>

              {isEditing && (
                <div className="form-actions">
                  <Button onClick={handleSaveProfile} data-testid="save-profile-btn">
                    💾 Sauvegarder les modifications
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mes Tailles EPI */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>🛡️ Mes Tailles EPI</h3>
              <Button
                onClick={() => {
                  console.log('🔘 [Mon Profil EPI] Bouton Modifier cliqué, isEditingEPI avant:', isEditingEPI);
                  setIsEditingEPI(!isEditingEPI);
                  console.log('🔘 [Mon Profil EPI] isEditingEPI après:', !isEditingEPI);
                }}
                variant={isEditingEPI ? "outline" : "default"}
                data-testid="edit-epi-tailles-btn"
              >
                {isEditingEPI ? 'Annuler' : '✏️ Modifier'}
              </Button>
            </div>

            <div className="epi-content-wrapper">
              <p style={{ marginBottom: '15px', fontSize: '14px', color: '#6B7280' }}>
                {isEditingEPI 
                  ? '✏️ Mode édition activé - Vous pouvez maintenant modifier les tailles' 
                  : '👉 Cliquez sur "Modifier" pour éditer vos tailles d\'EPI'}
              </p>

              <div className="epi-tailles-grid-profile">
                {getAllEPITypes().map(epiType => {
                  const existingEPI = myEPIs.find(e => e.type_epi === epiType.id);
                  const isDisabled = !isEditingEPI;
                  // Utiliser ?? au lieu de || pour permettre les chaînes vides
                  const currentValue = epiTailles[epiType.id] ?? (existingEPI ? existingEPI.taille : '');
                  
                  console.log(`[${epiType.nom}] disabled=${isDisabled}, value="${currentValue}", epiTailles[${epiType.id}]="${epiTailles[epiType.id]}"`);
                  
                  return (
                    <div key={epiType.id} className="epi-taille-item-profile">
                      <span className="epi-taille-icon-profile">{epiType.icone}</span>
                      <div className="epi-taille-info-profile">
                        <Label style={{fontSize: '13px'}}>{epiType.nom}</Label>
                        <Input
                          value={currentValue}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            console.log(`✏️ [${epiType.nom}] onChange: "${currentValue}" → "${newValue}"`);
                            setEpiTailles({...epiTailles, [epiType.id]: newValue});
                          }}
                          disabled={isDisabled}
                          placeholder="Taille"
                          className="epi-taille-input-compact"
                          data-testid={`epi-taille-${epiType.id}`}
                          style={isDisabled ? {cursor: 'not-allowed', opacity: 0.6} : {}}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {isEditingEPI && (
                <div className="form-actions" style={{marginTop: '15px'}}>
                  <Button onClick={handleSaveEPITailles} data-testid="save-epi-tailles-btn">
                    💾 Sauvegarder les tailles
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne droite - Infos complémentaires */}
        <div className="profil-side-column">
          {/* Informations d'emploi */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>💼 Emploi</h3>
              <span className="statut-badge planifiee" style={{fontSize: '12px', background: '#FEE2E2', color: '#991B1B'}}>
                🔒 Verrouillé
              </span>
            </div>
            <div style={{padding: '1rem 1.5rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>N° Employé</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-employee-id">{userProfile?.numero_employe}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Grade</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-grade">
                  {userProfile?.grade}
                  {userProfile?.fonction_superieur && <span style={{fontSize: '0.75rem', color: '#EF4444', marginLeft: '0.5rem'}}> + Fonction sup.</span>}
                </span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Type</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-employment-type">
                  {userProfile?.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                </span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #F3F4F6', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Embauche</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-hire-date">{userProfile?.date_embauche}</span>
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', gap: '1rem'}}>
                <span style={{fontSize: '0.813rem', fontWeight: '500', color: '#6B7280'}}>Taux horaire</span>
                <span style={{fontSize: '0.875rem', fontWeight: '600', color: '#1F2937', textAlign: 'right'}} data-testid="profile-taux-horaire">
                  {userProfile?.taux_horaire ? `${userProfile.taux_horaire.toFixed(2)} $/h` : 'Non défini'}
                </span>
              </div>
            </div>
          </div>

          {/* Formations et compétences */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>📚 Compétences</h3>
              <span className="statut-badge planifiee" style={{fontSize: '11px', background: '#FEE2E2', color: '#991B1B'}}>
                {userProfile?.competences?.length || 0}
              </span>
            </div>
            <div style={{padding: '0.75rem 1.5rem'}}>
              {userProfile?.competences?.length > 0 ? (
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.5rem'}}>
                  {userProfile.competences.map((competenceId, index) => (
                    <span key={index} className="formation-badge-compact">
                      {getCompetenceName(competenceId)} ✅
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{textAlign: 'center', color: '#9CA3AF', fontSize: '14px', margin: 0}}>
                  Aucune compétence
                </p>
              )}
            </div>
          </div>

          {/* Sécurité du compte */}
          <div className="formation-card">
            <div className="formation-header">
              <h3>🔒 Sécurité</h3>
            </div>
            <div style={{padding: '1rem'}}>
              <Button 
                variant="outline" 
                onClick={() => setShowPasswordModal(true)}
                data-testid="change-password-btn"
                style={{width: '100%'}}
              >
                🔑 Changer le mot de passe
              </Button>
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
            </div>
            <div className="modal-actions">
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

// ====================================================================
// MODULE RAPPORTS AVANCÉS - INTERNES ET EXTERNES
// ====================================================================

const Rapports = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('internes'); // 'internes' ou 'externes'
  const [activeRapport, setActiveRapport] = useState('dashboard'); // Type de rapport actif
  
  // États pour les données
  const [dashboardData, setDashboardData] = useState(null);
  const [rapportSalaires, setRapportSalaires] = useState(null);
  const [rapportDisponibilite, setRapportDisponibilite] = useState(null);
  const [rapportCoutsFormations, setRapportCoutsFormations] = useState(null);
  const [rapportBudgetaire, setRapportBudgetaire] = useState(null);
  const [rapportImmobilisations, setRapportImmobilisations] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [immobilisations, setImmobilisations] = useState([]);
  
  // États pour les filtres
  const [dateDebut, setDateDebut] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [dateFin, setDateFin] = useState(new Date().toISOString().split('T')[0]);
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(new Date().getFullYear());
  
  // États pour les modals de saisie
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showImmobilisationModal, setShowImmobilisationModal] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ annee: new Date().getFullYear(), categorie: 'salaires', budget_alloue: 0, notes: '' });
  const [immobilisationForm, setImmobilisationForm] = useState({ 
    type_immobilisation: 'vehicule', 
    nom: '', 
    date_acquisition: new Date().toISOString().split('T')[0], 
    cout_acquisition: 0, 
    cout_entretien_annuel: 0, 
    etat: 'bon', 
    notes: '' 
  });

  useEffect(() => {
    if (user?.role === 'admin' && tenantSlug) {
      loadData();
    }
  }, [user, tenantSlug, activeTab, activeRapport, anneeSelectionnee]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'internes') {
        if (activeRapport === 'dashboard') {
          const dashData = await apiGet(tenantSlug, '/rapports/dashboard-interne');
          setDashboardData(dashData);
        } else if (activeRapport === 'salaires') {
          // Ne pas charger automatiquement, attendre que l'utilisateur clique sur "Générer"
        } else if (activeRapport === 'disponibilite') {
          // Ne pas charger automatiquement
        } else if (activeRapport === 'formations') {
          // Ne pas charger automatiquement
        }
      } else if (activeTab === 'externes') {
        if (activeRapport === 'budgetaire') {
          const [budgetsData] = await Promise.all([
            apiGet(tenantSlug, `/rapports/budgets?annee=${anneeSelectionnee}`)
          ]);
          setBudgets(budgetsData || []);
          
          // Charger aussi le rapport budgétaire agrégé
          try {
            const rapportBudg = await apiGet(tenantSlug, `/rapports/tableau-bord-budgetaire?annee=${anneeSelectionnee}`);
            setRapportBudgetaire(rapportBudg);
          } catch (e) {
            console.log('Pas de données budgétaires agrégées');
          }
        } else if (activeRapport === 'immobilisations') {
          const [immobData, rapportImmob] = await Promise.all([
            apiGet(tenantSlug, '/rapports/immobilisations'),
            apiGet(tenantSlug, '/rapports/rapport-immobilisations')
          ]);
          setImmobilisations(immobData || []);
          setRapportImmobilisations(rapportImmob);
        }
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({ title: "Erreur", description: "Impossible de charger les données", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportSalaires = async () => {
    setLoading(true);
    try {
      const params = `date_debut=${dateDebut}&date_fin=${dateFin}`;
      const rapport = await apiGet(tenantSlug, `/rapports/couts-salariaux?${params}`);
      setRapportSalaires(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportDisponibilite = async () => {
    setLoading(true);
    try {
      const params = `date_debut=${dateDebut}&date_fin=${dateFin}`;
      const rapport = await apiGet(tenantSlug, `/rapports/disponibilite?${params}`);
      setRapportDisponibilite(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleGenererRapportFormations = async () => {
    setLoading(true);
    try {
      const rapport = await apiGet(tenantSlug, `/rapports/couts-formations?annee=${anneeSelectionnee}`);
      setRapportCoutsFormations(rapport);
      toast({ title: "Succès", description: "Rapport généré" });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de générer le rapport", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleSaveBudget = async () => {
    try {
      await apiPost(tenantSlug, '/rapports/budgets', budgetForm);
      toast({ title: "Succès", description: "Budget ajouté" });
      setShowBudgetModal(false);
      setBudgetForm({ annee: new Date().getFullYear(), categorie: 'salaires', budget_alloue: 0, notes: '' });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter le budget", variant: "destructive" });
    }
  };

  const handleSaveImmobilisation = async () => {
    try {
      await apiPost(tenantSlug, '/rapports/immobilisations', immobilisationForm);
      toast({ title: "Succès", description: "Immobilisation ajoutée" });
      setShowImmobilisationModal(false);
      setImmobilisationForm({ 
        type_immobilisation: 'vehicule', 
        nom: '', 
        date_acquisition: new Date().toISOString().split('T')[0], 
        cout_acquisition: 0, 
        cout_entretien_annuel: 0, 
        etat: 'bon', 
        notes: '' 
      });
      loadData();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'ajouter l'immobilisation", variant: "destructive" });
    }
  };

  const handleExportPDF = async (typeRapport) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      let url = '';
      if (typeRapport === 'dashboard') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-dashboard-pdf`;
      } else if (typeRapport === 'salaires') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-salaires-pdf?date_debut=${dateDebut}&date_fin=${dateFin}`;
      } else if (typeRapport === 'budgetaire') {
        toast({ title: "Info", description: "Export PDF Budgétaire en développement" });
        return;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `rapport_${typeRapport}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ title: "Succès", description: `Rapport PDF téléchargé` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exporter le PDF", variant: "destructive" });
    }
  };

  const handleExportExcel = async (typeRapport) => {
    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL;
      const token = localStorage.getItem(`${tenantSlug}_token`);
      
      let url = '';
      if (typeRapport === 'salaires') {
        url = `${backendUrl}/api/${tenantSlug}/rapports/export-salaires-excel?date_debut=${dateDebut}&date_fin=${dateFin}`;
      } else {
        toast({ title: "Info", description: "Export Excel en développement pour ce rapport" });
        return;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur lors de l\'export');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `rapport_${typeRapport}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ title: "Succès", description: `Rapport Excel téléchargé` });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'exporter l'Excel", variant: "destructive" });
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

  if (loading) return <div className="loading">Chargement des rapports...</div>;

  return (
    <div className="module-rapports-nfpa">
      <div className="module-header">
        <div>
          <h1>📈 Rapports et Analyses</h1>
          <p>Rapports internes et externes pour la gestion et la communication</p>
        </div>
      </div>

      {/* Onglets principaux */}
      <div className="rapports-tabs">
        <button 
          className={activeTab === 'internes' ? 'active' : ''} 
          onClick={() => { setActiveTab('internes'); setActiveRapport('dashboard'); }}
        >
          📊 Rapports Internes
        </button>
        <button 
          className={activeTab === 'externes' ? 'active' : ''} 
          onClick={() => { setActiveTab('externes'); setActiveRapport('budgetaire'); }}
        >
          📈 Rapports Externes
        </button>
      </div>

      {/* SECTION RAPPORTS INTERNES */}
      {activeTab === 'internes' && (
        <div className="rapports-internes">
          {/* Sous-navigation */}
          <div className="rapports-sub-nav">
            <button className={activeRapport === 'dashboard' ? 'active' : ''} onClick={() => setActiveRapport('dashboard')}>
              📊 Dashboard
            </button>
            <button className={activeRapport === 'salaires' ? 'active' : ''} onClick={() => setActiveRapport('salaires')}>
              💰 Coûts Salariaux
            </button>
            <button className={activeRapport === 'disponibilite' ? 'active' : ''} onClick={() => setActiveRapport('disponibilite')}>
              📅 Disponibilité
            </button>
            <button className={activeRapport === 'formations' ? 'active' : ''} onClick={() => setActiveRapport('formations')}>
              🎓 Formations
            </button>
          </div>

          {/* Dashboard Interne */}
          {activeRapport === 'dashboard' && dashboardData && (
            <div className="dashboard-interne">
              <h2>📊 Dashboard Interne - {dashboardData.periode}</h2>
              
              <div className="kpi-grid">
                <div className="kpi-card" style={{background: '#FEF3C7'}}>
                  <h3>{dashboardData.heures_travaillees_mois}h</h3>
                  <p>Heures travaillées ce mois</p>
                </div>
                <div className="kpi-card" style={{background: '#FCA5A5'}}>
                  <h3>${dashboardData.cout_salarial_mois.toLocaleString()}</h3>
                  <p>Coût salarial du mois</p>
                </div>
                <div className="kpi-card" style={{background: '#D1FAE5'}}>
                  <h3>{dashboardData.pompiers_disponibles}</h3>
                  <p>Pompiers disponibles</p>
                </div>
                <div className="kpi-card" style={{background: '#DBEAFE'}}>
                  <h3>{dashboardData.total_pompiers}</h3>
                  <p>Total pompiers</p>
                </div>
              </div>
              
              {/* Graphiques */}
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem', marginTop: '2rem'}}>
                {/* Graphique Donut - Disponibilité */}
                <div style={{background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                  <h3 style={{marginBottom: '1rem'}}>Disponibilité du Personnel</h3>
                  <Chart
                    options={{
                      chart: { type: 'donut' },
                      labels: ['Disponibles', 'Non disponibles'],
                      colors: ['#10B981', '#EF4444'],
                      legend: { position: 'bottom' },
                      dataLabels: { enabled: true },
                      plotOptions: {
                        pie: {
                          donut: {
                            labels: {
                              show: true,
                              total: {
                                show: true,
                                label: 'Total',
                                formatter: () => dashboardData.total_pompiers
                              }
                            }
                          }
                        }
                      }
                    }}
                    series={[dashboardData.pompiers_disponibles, dashboardData.total_pompiers - dashboardData.pompiers_disponibles]}
                    type="donut"
                    height={300}
                  />
                </div>

                {/* Graphique Barres - Coûts */}
                <div style={{background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                  <h3 style={{marginBottom: '1rem'}}>Évolution Coûts Mensuels</h3>
                  <Chart
                    options={{
                      chart: { type: 'bar' },
                      xaxis: { categories: ['Janv', 'Févr', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil', 'Août', 'Sept'] },
                      colors: ['#FCA5A5'],
                      plotOptions: {
                        bar: {
                          borderRadius: 8,
                          dataLabels: { position: 'top' }
                        }
                      },
                      dataLabels: {
                        enabled: true,
                        formatter: (val) => `$${Math.round(val/1000)}k`,
                        offsetY: -20,
                        style: { fontSize: '12px', colors: ['#6B7280'] }
                      }
                    }}
                    series={[{
                      name: 'Coûts',
                      data: [25000, 28000, 30000, 27000, 29000, 31000, 32000, 30000, dashboardData.cout_salarial_mois]
                    }]}
                    type="bar"
                    height={300}
                  />
                </div>
              </div>
              
              <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                <Button onClick={() => handleExportPDF('dashboard')}>📄 Export PDF</Button>
                <Button variant="outline" onClick={() => handleExportExcel('dashboard')}>📊 Export Excel</Button>
              </div>
            </div>
          )}

          {/* Rapport Coûts Salariaux */}
          {activeRapport === 'salaires' && (
            <div className="rapport-salaires">
              <h2>💰 Rapport de Coûts Salariaux Détaillés</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Date début</Label>
                  <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <Label>Date fin</Label>
                  <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportSalaires}>Générer le rapport</Button>
                </div>
              </div>

              {rapportSalaires ? (
                <div>
                  {/* Résumé */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportSalaires.cout_total.toLocaleString()}</h3>
                      <p>Coût Total</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportSalaires.nombre_employes}</h3>
                      <p>Employés</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>
                        {rapportSalaires.employes.reduce((sum, e) => sum + e.heures_travaillees, 0)}h
                      </h3>
                      <p>Total Heures</p>
                    </div>
                  </div>

                  {/* Tableau détaillé */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Nom</div>
                      <div className="header-cell">Matricule</div>
                      <div className="header-cell">Type</div>
                      <div className="header-cell">Heures</div>
                      <div className="header-cell">Taux/h</div>
                      <div className="header-cell">Coût Total</div>
                    </div>
                    {rapportSalaires.employes.map((emp, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{emp.nom}</div>
                        <div className="table-cell">{emp.matricule}</div>
                        <div className="table-cell">
                          <span className={`badge ${emp.type_emploi}`}>
                            {emp.type_emploi === 'temps_plein' ? 'Temps plein' : 'Temps partiel'}
                          </span>
                        </div>
                        <div className="table-cell">{emp.heures_travaillees}h</div>
                        <div className="table-cell">${emp.taux_horaire}/h</div>
                        <div className="table-cell" style={{fontWeight: 'bold', color: '#DC2626'}}>
                          ${emp.cout_total.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Exports */}
                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('salaires')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('salaires')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une période et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}
          {/* Rapport Disponibilité */}
          {activeRapport === 'disponibilite' && (
            <div className="rapport-disponibilite">
              <h2>📅 Rapport de Disponibilité/Indisponibilité</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Date début</Label>
                  <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <Label>Date fin</Label>
                  <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} />
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportDisponibilite}>Générer le rapport</Button>
                </div>
              </div>

              {rapportDisponibilite ? (
                <div>
                  {/* Résumé avec graphique */}
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem'}}>
                    <div>
                      <div className="kpi-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
                        <div className="kpi-card" style={{background: '#D1FAE5'}}>
                          <h3>{rapportDisponibilite.total_jours_disponibles}</h3>
                          <p>Jours Disponibles</p>
                        </div>
                        <div className="kpi-card" style={{background: '#FCA5A5'}}>
                          <h3>{rapportDisponibilite.total_jours_indisponibles}</h3>
                          <p>Jours Indisponibles</p>
                        </div>
                        <div className="kpi-card" style={{background: '#DBEAFE', gridColumn: 'span 2'}}>
                          <h3>{rapportDisponibilite.taux_disponibilite_global}%</h3>
                          <p>Taux de Disponibilité Global</p>
                        </div>
                      </div>
                    </div>
                    <div style={{background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                      <Chart
                        options={{
                          chart: { type: 'pie' },
                          labels: ['Disponibles', 'Indisponibles'],
                          colors: ['#10B981', '#EF4444'],
                          legend: { position: 'bottom' }
                        }}
                        series={[rapportDisponibilite.total_jours_disponibles, rapportDisponibilite.total_jours_indisponibles]}
                        type="pie"
                        height={250}
                      />
                    </div>
                  </div>

                  {/* Tableau par employé */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Nom</div>
                      <div className="header-cell">Grade</div>
                      <div className="header-cell">Jours Dispo.</div>
                      <div className="header-cell">Jours Indispo.</div>
                      <div className="header-cell">Taux %</div>
                      <div className="header-cell">Motifs</div>
                    </div>
                    {rapportDisponibilite.employes.map((emp, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{emp.nom}</div>
                        <div className="table-cell">{emp.grade}</div>
                        <div className="table-cell" style={{color: '#10B981', fontWeight: 'bold'}}>{emp.jours_disponibles}</div>
                        <div className="table-cell" style={{color: '#EF4444', fontWeight: 'bold'}}>{emp.jours_indisponibles}</div>
                        <div className="table-cell">{emp.taux_disponibilite}%</div>
                        <div className="table-cell" style={{fontSize: '0.85rem'}}>
                          {Object.entries(emp.motifs_indisponibilite).map(([motif, count]) => (
                            <span key={motif} style={{display: 'block'}}>{motif}: {count}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('disponibilite')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('disponibilite')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une période et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}

          {/* Rapport Coûts Formations */}
          {activeRapport === 'formations' && (
            <div className="rapport-formations">
              <h2>🎓 Rapport de Coûts de Formation</h2>
              
              <div className="filtres-grid" style={{marginBottom: '2rem'}}>
                <div>
                  <Label>Année</Label>
                  <select 
                    className="form-select" 
                    value={anneeSelectionnee} 
                    onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{display: 'flex', alignItems: 'end'}}>
                  <Button onClick={handleGenererRapportFormations}>Générer le rapport</Button>
                </div>
              </div>

              {rapportCoutsFormations ? (
                <div>
                  {/* KPIs */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportCoutsFormations.cout_total.toLocaleString()}</h3>
                      <p>Coût Total</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportCoutsFormations.nombre_formations}</h3>
                      <p>Formations</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>{rapportCoutsFormations.nombre_total_participants}</h3>
                      <p>Participants</p>
                    </div>
                    <div className="kpi-card" style={{background: '#FEF3C7'}}>
                      <h3>{rapportCoutsFormations.heures_totales}h</h3>
                      <p>Heures Totales</p>
                    </div>
                  </div>

                  {/* Tableau formations */}
                  <div className="salaires-table">
                    <div className="table-header">
                      <div className="header-cell">Formation</div>
                      <div className="header-cell">Date</div>
                      <div className="header-cell">Durée</div>
                      <div className="header-cell">Participants</div>
                      <div className="header-cell">Coût Formation</div>
                      <div className="header-cell">Coût Salarial</div>
                    </div>
                    {rapportCoutsFormations.formations.map((formation, idx) => (
                      <div key={idx} className="table-row">
                        <div className="table-cell">{formation.nom_formation}</div>
                        <div className="table-cell">{new Date(formation.date).toLocaleDateString('fr-FR')}</div>
                        <div className="table-cell">{formation.duree_heures}h</div>
                        <div className="table-cell">{formation.nombre_participants}</div>
                        <div className="table-cell">${formation.cout_formation.toLocaleString()}</div>
                        <div className="table-cell" style={{fontWeight: 'bold', color: '#DC2626'}}>
                          ${formation.cout_total.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('formations')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('formations')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Sélectionnez une année et cliquez sur "Générer le rapport"</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION RAPPORTS EXTERNES */}
      {activeTab === 'externes' && (
        <div className="rapports-externes">
          {/* Sous-navigation */}
          <div className="rapports-sub-nav">
            <button className={activeRapport === 'budgetaire' ? 'active' : ''} onClick={() => setActiveRapport('budgetaire')}>
              💰 Tableau Budgétaire
            </button>
            <button className={activeRapport === 'immobilisations' ? 'active' : ''} onClick={() => setActiveRapport('immobilisations')}>
              🚒 Immobilisations
            </button>
          </div>

          {/* Tableau de Bord Budgétaire */}
          {activeRapport === 'budgetaire' && (
            <div className="rapport-budgetaire">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
                <h2>💰 Tableau de Bord Budgétaire - {anneeSelectionnee}</h2>
                <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
                  <select 
                    className="form-select" 
                    value={anneeSelectionnee} 
                    onChange={e => setAnneeSelectionnee(parseInt(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <Button onClick={() => setShowBudgetModal(true)}>➕ Ajouter Budget</Button>
                </div>
              </div>

              {budgets.length > 0 ? (
                <div>
                  <div className="budgets-grid">
                    {budgets.map(budget => {
                      const pourcentage = budget.budget_alloue > 0 ? (budget.budget_consomme / budget.budget_alloue * 100) : 0;
                      return (
                        <div key={budget.id} className="budget-card">
                          <h3>{budget.categorie}</h3>
                          <div className="budget-montants">
                            <div>
                              <p className="budget-label">Alloué</p>
                              <p className="budget-value">${budget.budget_alloue.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="budget-label">Consommé</p>
                              <p className="budget-value">${budget.budget_consomme.toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="budget-bar">
                            <div 
                              className="budget-progress" 
                              style={{
                                width: `${Math.min(pourcentage, 100)}%`,
                                background: pourcentage > 90 ? '#EF4444' : pourcentage > 75 ? '#F59E0B' : '#10B981'
                              }}
                            />
                          </div>
                          <p style={{fontSize: '0.9rem', color: '#6B7280', marginTop: '0.5rem'}}>
                            {pourcentage.toFixed(1)}% utilisé
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Graphique Budget Global */}
                  {rapportBudgetaire && (
                    <div style={{marginTop: '2rem', background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #E5E7EB'}}>
                      <h3 style={{marginBottom: '1rem'}}>Vue d'ensemble Budgétaire - {anneeSelectionnee}</h3>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem'}}>
                        <div>
                          <Chart
                            options={{
                              chart: { type: 'donut' },
                              labels: rapportBudgetaire.par_categorie.map(b => b.categorie),
                              colors: ['#FCA5A5', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'],
                              legend: { position: 'bottom' },
                              plotOptions: {
                                pie: {
                                  donut: {
                                    labels: {
                                      show: true,
                                      total: {
                                        show: true,
                                        label: 'Total Alloué',
                                        formatter: () => `$${(rapportBudgetaire.budget_total_alloue/1000).toFixed(0)}k`
                                      }
                                    }
                                  }
                                }
                              }
                            }}
                            series={rapportBudgetaire.par_categorie.map(b => b.budget_alloue)}
                            type="donut"
                            height={300}
                          />
                        </div>
                        <div>
                          <div className="kpi-grid" style={{gridTemplateColumns: '1fr 1fr'}}>
                            <div className="kpi-card" style={{background: '#FEF3C7'}}>
                              <h3>${rapportBudgetaire.budget_total_alloue.toLocaleString()}</h3>
                              <p>Budget Alloué</p>
                            </div>
                            <div className="kpi-card" style={{background: '#FCA5A5'}}>
                              <h3>${rapportBudgetaire.budget_total_consomme.toLocaleString()}</h3>
                              <p>Budget Consommé</p>
                            </div>
                            <div className="kpi-card" style={{background: '#D1FAE5', gridColumn: 'span 2'}}>
                              <h3>{rapportBudgetaire.pourcentage_global}%</h3>
                              <p>Taux d'utilisation global</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('budgetaire')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('budgetaire')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Aucun budget pour {anneeSelectionnee}. Cliquez sur "Ajouter Budget" pour commencer.</p>
                </div>
              )}
            </div>
          )}

          {/* Immobilisations */}
          {activeRapport === 'immobilisations' && (
            <div className="rapport-immobilisations">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
                <h2>🚒 Rapport sur les Immobilisations</h2>
                <Button onClick={() => setShowImmobilisationModal(true)}>➕ Ajouter Immobilisation</Button>
              </div>

              {rapportImmobilisations ? (
                <div>
                  {/* Statistiques globales */}
                  <div className="kpi-grid" style={{marginBottom: '2rem'}}>
                    <div className="kpi-card" style={{background: '#FEF3C7'}}>
                      <h3>{rapportImmobilisations.statistiques.nombre_vehicules}</h3>
                      <p>Véhicules</p>
                    </div>
                    <div className="kpi-card" style={{background: '#D1FAE5'}}>
                      <h3>{rapportImmobilisations.statistiques.nombre_equipements}</h3>
                      <p>Équipements</p>
                    </div>
                    <div className="kpi-card" style={{background: '#FCA5A5'}}>
                      <h3>${rapportImmobilisations.statistiques.cout_acquisition_total.toLocaleString()}</h3>
                      <p>Coût Acquisition</p>
                    </div>
                    <div className="kpi-card" style={{background: '#DBEAFE'}}>
                      <h3>${rapportImmobilisations.statistiques.cout_entretien_annuel_total.toLocaleString()}</h3>
                      <p>Entretien Annuel</p>
                    </div>
                  </div>

                  {/* Véhicules */}
                  {rapportImmobilisations.vehicules.length > 0 && (
                    <div style={{marginBottom: '2rem'}}>
                      <h3 style={{marginBottom: '1rem'}}>🚒 Véhicules (Âge moyen: {rapportImmobilisations.statistiques.age_moyen_vehicules} ans)</h3>
                      <div className="immobilisations-grid">
                        {rapportImmobilisations.vehicules.map(vehicule => (
                          <div key={vehicule.id} className="immobilisation-card">
                            <h4>{vehicule.nom}</h4>
                            <div className="immobilisation-details">
                              <p><strong>Acquisition:</strong> {new Date(vehicule.date_acquisition).toLocaleDateString('fr-FR')}</p>
                              <p><strong>Âge:</strong> {vehicule.age_annees} ans</p>
                              <p><strong>État:</strong> <span className={`badge ${vehicule.etat}`}>{vehicule.etat}</span></p>
                              <p><strong>Coût:</strong> ${vehicule.cout_acquisition.toLocaleString()}</p>
                              <p><strong>Entretien:</strong> ${vehicule.cout_entretien_annuel.toLocaleString()}/an</p>
                              {vehicule.date_remplacement_prevue && (
                                <p><strong>Remplacement prévu:</strong> {new Date(vehicule.date_remplacement_prevue).toLocaleDateString('fr-FR')}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Équipements */}
                  {rapportImmobilisations.equipements.length > 0 && (
                    <div>
                      <h3 style={{marginBottom: '1rem'}}>🔧 Équipements (Âge moyen: {rapportImmobilisations.statistiques.age_moyen_equipements} ans)</h3>
                      <div className="immobilisations-grid">
                        {rapportImmobilisations.equipements.map(equip => (
                          <div key={equip.id} className="immobilisation-card">
                            <h4>{equip.nom}</h4>
                            <div className="immobilisation-details">
                              <p><strong>Acquisition:</strong> {new Date(equip.date_acquisition).toLocaleDateString('fr-FR')}</p>
                              <p><strong>Âge:</strong> {equip.age_annees} ans</p>
                              <p><strong>État:</strong> <span className={`badge ${equip.etat}`}>{equip.etat}</span></p>
                              <p><strong>Coût:</strong> ${equip.cout_acquisition.toLocaleString()}</p>
                              <p><strong>Entretien:</strong> ${equip.cout_entretien_annuel.toLocaleString()}/an</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{marginTop: '2rem', display: 'flex', gap: '1rem'}}>
                    <Button onClick={() => handleExportPDF('immobilisations')}>📄 Export PDF</Button>
                    <Button variant="outline" onClick={() => handleExportExcel('immobilisations')}>📊 Export Excel</Button>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <p>Aucune immobilisation. Cliquez sur "Ajouter Immobilisation" pour commencer.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Budget */}
      {showBudgetModal && (
        <div className="modal-overlay" onClick={() => setShowBudgetModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Ajouter un Budget</h2>
              <Button variant="ghost" onClick={() => setShowBudgetModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Année</Label>
                  <Input type="number" value={budgetForm.annee} onChange={e => setBudgetForm({...budgetForm, annee: parseInt(e.target.value)})} />
                </div>
                <div>
                  <Label>Catégorie</Label>
                  <select 
                    className="form-select" 
                    value={budgetForm.categorie} 
                    onChange={e => setBudgetForm({...budgetForm, categorie: e.target.value})}
                  >
                    <option value="salaires">Salaires</option>
                    <option value="formations">Formations</option>
                    <option value="equipements">Équipements</option>
                    <option value="carburant">Carburant</option>
                    <option value="entretien">Entretien</option>
                    <option value="autres">Autres</option>
                  </select>
                </div>
                <div>
                  <Label>Budget Alloué ($)</Label>
                  <Input type="number" value={budgetForm.budget_alloue} onChange={e => setBudgetForm({...budgetForm, budget_alloue: parseFloat(e.target.value)})} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input value={budgetForm.notes} onChange={e => setBudgetForm({...budgetForm, notes: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowBudgetModal(false)}>Annuler</Button>
              <Button onClick={handleSaveBudget}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Immobilisation */}
      {showImmobilisationModal && (
        <div className="modal-overlay" onClick={() => setShowImmobilisationModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>➕ Ajouter une Immobilisation</h2>
              <Button variant="ghost" onClick={() => setShowImmobilisationModal(false)}>✕</Button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div>
                  <Label>Type</Label>
                  <select 
                    className="form-select" 
                    value={immobilisationForm.type_immobilisation} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, type_immobilisation: e.target.value})}
                  >
                    <option value="vehicule">Véhicule</option>
                    <option value="equipement_majeur">Équipement Majeur</option>
                  </select>
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input 
                    value={immobilisationForm.nom} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, nom: e.target.value})} 
                    placeholder="Ex: Camion-citerne 2024"
                  />
                </div>
                <div>
                  <Label>Date d'acquisition</Label>
                  <Input 
                    type="date" 
                    value={immobilisationForm.date_acquisition} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, date_acquisition: e.target.value})} 
                  />
                </div>
                <div>
                  <Label>Coût d'acquisition ($)</Label>
                  <Input 
                    type="number" 
                    value={immobilisationForm.cout_acquisition} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, cout_acquisition: parseFloat(e.target.value)})} 
                  />
                </div>
                <div>
                  <Label>Coût entretien annuel ($)</Label>
                  <Input 
                    type="number" 
                    value={immobilisationForm.cout_entretien_annuel} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, cout_entretien_annuel: parseFloat(e.target.value)})} 
                  />
                </div>
                <div>
                  <Label>État</Label>
                  <select 
                    className="form-select" 
                    value={immobilisationForm.etat} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, etat: e.target.value})}
                  >
                    <option value="bon">Bon</option>
                    <option value="moyen">Moyen</option>
                    <option value="mauvais">Mauvais</option>
                  </select>
                </div>
                <div style={{gridColumn: 'span 2'}}>
                  <Label>Notes</Label>
                  <Input 
                    value={immobilisationForm.notes} 
                    onChange={e => setImmobilisationForm({...immobilisationForm, notes: e.target.value})} 
                    placeholder="Notes additionnelles..."
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <Button variant="outline" onClick={() => setShowImmobilisationModal(false)}>Annuler</Button>
              <Button onClick={handleSaveImmobilisation}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Import Bâtiments Component - Support CSV, Excel et HTML
const ImportBatiments = ({ onImportComplete }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Preview, 4: Conflicts, 5: Import
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'csv', 'excel', 'html'
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({}); // Valeurs par défaut pour saisie de masse
  const [previewData, setPreviewData] = useState([]);
  const [conflicts, setConflicts] = useState([]); // Doublons détectés
  const [conflictResolutions, setConflictResolutions] = useState({}); // Actions choisies par l'utilisateur
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [existingBatiments, setExistingBatiments] = useState([]); // Pour la détection de doublons

  // Champs par défaut
  const defaultFields = [
    { key: 'nom_etablissement', label: 'Nom établissement', required: true },
    { key: 'adresse_civique', label: 'Adresse civique', required: true },
    { key: 'ville', label: 'Ville', required: false },
    { key: 'code_postal', label: 'Code postal', required: false },
    { key: 'cadastre_matricule', label: 'Cadastre/Matricule', required: false },
    { key: 'proprietaire_nom', label: 'Propriétaire - Nom', required: false },
    { key: 'proprietaire_telephone', label: 'Propriétaire - Téléphone', required: false },
    { key: 'proprietaire_courriel', label: 'Propriétaire - Courriel', required: false },
    { key: 'gerant_nom', label: 'Gérant - Nom', required: false },
    { key: 'gerant_telephone', label: 'Gérant - Téléphone', required: false },
    { key: 'gerant_courriel', label: 'Gérant - Courriel', required: false },
    { key: 'groupe_occupation', label: 'Groupe occupation (C,E,F,I...)', required: false },
    { key: 'description_activite', label: 'Description activité', required: false },
    { key: 'notes_generales', label: 'Notes générales', required: false }
  ];

  // Charger les champs personnalisés depuis le localStorage ou utiliser les champs par défaut
  const [availableFields, setAvailableFields] = useState(() => {
    const savedFields = localStorage.getItem(`${tenantSlug}_import_fields`);
    if (savedFields) {
      const fields = JSON.parse(savedFields);
      // Migration automatique: remplacer numero_lot_cadastre par cadastre_matricule
      const migratedFields = fields.map(field => {
        if (field.key === 'numero_lot_cadastre') {
          return { ...field, key: 'cadastre_matricule', label: 'Cadastre/Matricule' };
        }
        return field;
      });
      // Sauvegarder la version migrée
      localStorage.setItem(`${tenantSlug}_import_fields`, JSON.stringify(migratedFields));
      return migratedFields;
    }
    return defaultFields;
  });

  // Sauvegarder les champs personnalisés
  const saveCustomFields = (fields) => {
    localStorage.setItem(`${tenantSlug}_import_fields`, JSON.stringify(fields));
    setAvailableFields(fields);
    toast({
      title: "Champs sauvegardés",
      description: "Vos champs personnalisés ont été enregistrés"
    });
  };

  // Réinitialiser aux champs par défaut
  const resetToDefaultFields = () => {
    localStorage.removeItem(`${tenantSlug}_import_fields`);
    setAvailableFields(defaultFields);
    toast({
      title: "Réinitialisation",
      description: "Les champs ont été réinitialisés aux valeurs par défaut"
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'html', 'htm', 'xml'].includes(fileExtension)) {
      toast({
        title: "Format non supporté",
        description: "Formats acceptés : CSV, Excel (.xlsx, .xls), HTML (.html, .htm) et XML (.xml)",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(file);
    
    let type;
    if (fileExtension === 'html' || fileExtension === 'htm') {
      type = 'html';
    } else if (fileExtension === 'xml') {
      type = 'xml';
    } else if (fileExtension === 'csv') {
      type = 'csv';
    } else {
      type = 'excel';
    }
    setFileType(type);
    
    if (fileExtension === 'html' || fileExtension === 'htm') {
      parseHTML(file);
    } else if (fileExtension === 'xml') {
      parseXML(file);
    } else {
      parseCSV(file);
    }
  };

  const parseHTML = async (file) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      
      // Chercher le premier tableau
      const table = doc.querySelector('table');
      if (!table) {
        throw new Error("Aucun tableau HTML trouvé dans le fichier");
      }
      
      // Extraire les en-têtes
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (!headerRow) {
        throw new Error("Aucune ligne d'en-tête trouvée");
      }
      
      const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
      setCsvHeaders(headers);
      
      // Extraire les données
      const rows = Array.from(table.querySelectorAll('tbody tr, tr')).slice(headers.length > 0 ? 1 : 0);
      const data = rows.map((row, index) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const rowData = { _index: index };
        headers.forEach((header, i) => {
          rowData[header] = cells[i] ? cells[i].textContent.trim() : '';
        });
        return rowData;
      });
      
      setCsvData(data);
      setStep(2);
      
      toast({
        title: "Fichier HTML analysé",
        description: `${data.length} ligne(s) détectée(s) avec ${headers.length} colonne(s)`
      });
      
    } catch (error) {
      console.error('Erreur parsing HTML:', error);
      toast({
        title: "Erreur d'analyse HTML",
        description: error.message || "Impossible d'analyser le fichier HTML",
        variant: "destructive"
      });
    }
  };


  const parseXML = async (file) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // Vérifier les erreurs de parsing
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error("Le fichier XML n'est pas valide");
      }
      
      // Extraire tous les éléments récursifs du XML
      // Pour un XML municipal québécois, on cherche les éléments répétitifs
      const extractAllElements = (node, prefix = '') => {
        const result = {};
        
        if (node.nodeType === Node.ELEMENT_NODE) {
          const path = prefix ? `${prefix}/${node.nodeName}` : node.nodeName;
          
          // Si l'élément a du texte et pas d'enfants éléments
          if (node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE) {
            const value = node.textContent.trim();
            if (value) {
              result[path] = value;
            }
          }
          
          // Parcourir les enfants
          Array.from(node.children).forEach(child => {
            const childData = extractAllElements(child, path);
            Object.assign(result, childData);
          });
        }
        
        return result;
      };
      
      // Trouver les éléments qui se répètent (probablement les bâtiments/adresses)
      // Pour le format municipal québécois, c'est généralement CE02 qui se répète
      const findRepeatingElements = (xmlDoc) => {
        // Essayer de détecter automatiquement l'élément parent qui se répète
        const commonParents = ['CE02', 'CEx', 'batiment', 'adresse', 'record', 'row'];
        
        for (const parentName of commonParents) {
          const elements = xmlDoc.getElementsByTagName(parentName);
          if (elements.length > 0) {
            return Array.from(elements);
          }
        }
        
        // Si aucun élément commun trouvé, prendre tous les enfants directs de la racine
        return Array.from(xmlDoc.documentElement.children);
      };
      
      const repeatingElements = findRepeatingElements(xmlDoc);
      
      if (repeatingElements.length === 0) {
        throw new Error("Aucun élément répétitif trouvé dans le XML");
      }
      
      // Extraire les données de chaque élément
      const data = repeatingElements.map((element, index) => {
        const rowData = { _index: index };
        const extracted = extractAllElements(element);
        Object.assign(rowData, extracted);
        return rowData;
      });
      
      // Extraire tous les chemins uniques comme en-têtes
      const allPaths = new Set();
      data.forEach(row => {
        Object.keys(row).forEach(key => {
          if (key !== '_index') {
            allPaths.add(key);
          }
        });
      });
      
      const headers = Array.from(allPaths).sort();
      
      setCsvHeaders(headers);
      setCsvData(data);
      setStep(2);
      
      toast({
        title: "Fichier XML analysé",
        description: `${data.length} élément(s) détecté(s) avec ${headers.length} champ(s) disponible(s)`
      });
      
    } catch (error) {
      console.error('Erreur parsing XML:', error);
      toast({
        title: "Erreur d'analyse XML",
        description: error.message || "Impossible d'analyser le fichier XML",
        variant: "destructive"
      });
    }
  };


  const parseCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error("Le fichier doit contenir au moins un en-tête et une ligne de données");
      }

      // Parse headers (première ligne)
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      setCsvHeaders(headers);

      // Parse data (lignes suivantes)
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = { _index: index };
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });

      setCsvData(data);
      setStep(2); // Passer au mapping
      
      toast({
        title: "Fichier analysé",
        description: `${data.length} ligne(s) détectée(s) avec ${headers.length} colonne(s)`
      });

    } catch (error) {
      console.error('Erreur parsing CSV:', error);
      toast({
        title: "Erreur d'analyse",
        description: error.message || "Impossible d'analyser le fichier",
        variant: "destructive"
      });
    }
  };

  const handleColumnMapping = (csvColumn, fieldKey) => {
    setColumnMapping(prev => ({
      ...prev,
      [fieldKey]: csvColumn
    }));
  };

  const handleDefaultValue = (fieldKey, value) => {
    setDefaultValues(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  const generatePreview = () => {
    const preview = csvData.slice(0, 5).map(row => {
      const mapped = {};
      availableFields.forEach(field => {
        // Priorité 1: Valeur par défaut (écrase tout)
        if (defaultValues[field.key]) {
          mapped[field.key] = defaultValues[field.key];
        } 
        // Priorité 2: Valeur du CSV
        else {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        }
      });
      return mapped;
    });
    setPreviewData(preview);
    setStep(3);
  };

  // Détecter les doublons avant import
  const detectConflicts = async () => {
    try {
      // Récupérer tous les bâtiments existants
      const existingData = await apiGet(tenantSlug, '/prevention/batiments');
      setExistingBatiments(existingData);
      
      // Mapper toutes les données CSV
      const allMappedData = csvData.map(row => {
        const mapped = {};
        availableFields.forEach(field => {
          if (defaultValues[field.key]) {
            mapped[field.key] = defaultValues[field.key];
          } else {
            const csvColumn = columnMapping[field.key];
            mapped[field.key] = csvColumn ? row[csvColumn] : '';
          }
        });
        return mapped;
      });
      
      // Détecter les conflits (adresse, matricule, cadastre)
      const detectedConflicts = [];
      allMappedData.forEach((newBat, index) => {
        const duplicates = existingData.filter(existing => {
          // Vérifier adresse
          const sameAddress = existing.adresse_civique && newBat.adresse_civique && 
            existing.adresse_civique.toLowerCase().trim() === newBat.adresse_civique.toLowerCase().trim();
          
          // Vérifier cadastre/matricule
          const sameCadastre = existing.cadastre_matricule && newBat.cadastre_matricule &&
            existing.cadastre_matricule.toLowerCase().trim() === newBat.cadastre_matricule.toLowerCase().trim();
          
          return sameAddress || sameCadastre;
        });
        
        if (duplicates.length > 0) {
          detectedConflicts.push({
            index,
            newData: newBat,
            existing: duplicates[0], // Prendre le premier doublon
            reasons: [
              duplicates[0].adresse_civique === newBat.adresse_civique && 'Même adresse',
              duplicates[0].cadastre_matricule === newBat.cadastre_matricule && 'Même cadastre'
            ].filter(Boolean)
          });
        }
      });
      
      if (detectedConflicts.length > 0) {
        setConflicts(detectedConflicts);
        // Initialiser les résolutions à "ignorer" par défaut
        const initialResolutions = {};
        detectedConflicts.forEach(c => {
          initialResolutions[c.index] = 'ignorer';
        });
        setConflictResolutions(initialResolutions);
        setStep(4); // Étape de résolution des conflits
        
        toast({
          title: "⚠️ Doublons détectés",
          description: `${detectedConflicts.length} conflit(s) trouvé(s). Veuillez choisir une action.`,
          variant: "warning"
        });
      } else {
        // Pas de conflits, passer directement à l'import
        proceedWithImport();
      }
      
    } catch (error) {
      console.error('Erreur détection conflits:', error);
      toast({
        title: "Erreur",
        description: "Impossible de vérifier les doublons",
        variant: "destructive"
      });
    }
  };

  const validateMapping = () => {
    const requiredFields = availableFields.filter(f => f.required);
    const missingFields = requiredFields.filter(f => 
      !columnMapping[f.key] && !defaultValues[f.key] // Valide si colonne CSV OU valeur par défaut
    );
    
    if (missingFields.length > 0) {
      toast({
        title: "Champs requis manquants",
        description: `Veuillez mapper ou définir une valeur par défaut pour: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const handleImport = async () => {
    if (!validateMapping()) return;

    setImporting(true);
    try {
      const mappedData = csvData.map(row => {
        const batiment = {};
        availableFields.forEach(field => {
          // Priorité 1: Valeur par défaut (saisie de masse écrase tout)
          if (defaultValues[field.key]) {
            batiment[field.key] = defaultValues[field.key];
          }
          // Priorité 2: Valeur du CSV
          else {
            const csvColumn = columnMapping[field.key];
            batiment[field.key] = csvColumn ? (row[csvColumn] || '') : '';
          }
        });
        return batiment;
      });

      // Extraire les champs requis personnalisés
      const requiredFields = availableFields
        .filter(f => f.required)
        .map(f => ({ key: f.key, label: f.label }));

      const response = await apiPost(tenantSlug, '/prevention/batiments/import-csv', {
        batiments: mappedData,
        required_fields: requiredFields  // Envoyer les champs requis
      });

      setImportResults(response);
      setStep(4);

      toast({
        title: "Import terminé",
        description: `${response.success_count} bâtiment(s) importé(s) avec succès`
      });

    } catch (error) {
      console.error('Erreur import:', error);
      toast({
        title: "Erreur d'import",
        description: error.message || "Une erreur s'est produite lors de l'import",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  // Composant éditeur de champs
  const FieldEditor = () => {
    const [editingFields, setEditingFields] = useState([...availableFields]);
    const [newField, setNewField] = useState({ key: '', label: '', required: false });

    const addField = () => {
      if (!newField.key || !newField.label) {
        toast({
          title: "Validation",
          description: "Veuillez remplir la clé et le label du champ",
          variant: "destructive"
        });
        return;
      }

      // Vérifier que la clé n'existe pas déjà
      if (editingFields.some(f => f.key === newField.key)) {
        toast({
          title: "Erreur",
          description: "Un champ avec cette clé existe déjà",
          variant: "destructive"
        });
        return;
      }

      setEditingFields([...editingFields, { ...newField }]);
      setNewField({ key: '', label: '', required: false });
    };

    const removeField = (key) => {
      setEditingFields(editingFields.filter(f => f.key !== key));
    };

    const updateField = (key, updates) => {
      setEditingFields(editingFields.map(f => 
        f.key === key ? { ...f, ...updates } : f
      ));
    };

    const handleSave = () => {
      if (editingFields.length === 0) {
        toast({
          title: "Erreur",
          description: "Vous devez avoir au moins un champ",
          variant: "destructive"
        });
        return;
      }

      saveCustomFields(editingFields);
      setShowFieldEditor(false);
    };

    return (
      <div className="field-editor-overlay">
        <div className="field-editor-modal">
          <div className="modal-header">
            <h3>⚙️ Personnaliser les champs d'import</h3>
            <button 
              className="close-btn" 
              onClick={() => setShowFieldEditor(false)}
            >
              ✕
            </button>
          </div>

          <div className="modal-content">
            {/* Liste des champs existants */}
            <div className="existing-fields">
              <h4>Champs actuels ({editingFields.length})</h4>
              <p className="helper-text">💡 Cochez "Obligatoire" pour les champs qui doivent absolument être remplis lors de l'import.</p>
              <div className="fields-list">
                {editingFields.map((field, index) => (
                  <div key={field.key} className={`field-item ${field.required ? 'required-field-item' : ''}`}>
                    <div className="field-number">{index + 1}</div>
                    <div className="field-details">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(field.key, { label: e.target.value })}
                        placeholder="Label du champ"
                        className="field-label-input"
                      />
                      <code className="field-key">{field.key}</code>
                    </div>
                    <label className={`field-required-toggle ${field.required ? 'required-active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.key, { required: e.target.checked })}
                      />
                      <span className="toggle-text">
                        {field.required ? '✅ Obligatoire' : '⚪ Optionnel'}
                      </span>
                    </label>
                    <button
                      onClick={() => removeField(field.key)}
                      className="remove-field-btn"
                      title="Supprimer ce champ"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Ajouter un nouveau champ */}
            <div className="add-field-section">
              <h4>➕ Ajouter un nouveau champ</h4>
              <div className="add-field-form">
                <div className="add-field-inputs">
                  <input
                    type="text"
                    value={newField.key}
                    onChange={(e) => setNewField({ ...newField, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="Clé (ex: contact_urgence)"
                    className="field-key-input"
                  />
                  <input
                    type="text"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    placeholder="Label (ex: Contact d'urgence)"
                    className="field-label-input"
                  />
                </div>
                <label className={`field-required-toggle ${newField.required ? 'required-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={newField.required}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                  />
                  <span className="toggle-text">
                    {newField.required ? '✅ Obligatoire' : '⚪ Optionnel'}
                  </span>
                </label>
                <Button size="sm" onClick={addField}>
                  ➕ Ajouter
                </Button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <Button 
              variant="outline" 
              onClick={resetToDefaultFields}
            >
              🔄 Réinitialiser par défaut
            </Button>
            <div className="footer-actions">
              <Button 
                variant="outline" 
                onClick={() => setShowFieldEditor(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleSave}>
                💾 Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>📁 Étape 1: Sélectionner le fichier</h3>
              <p>Choisissez votre fichier CSV, Excel, XML ou HTML contenant les données des bâtiments</p>
            </div>

            <div className="file-upload-area">
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.xml,.html,.htm"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="file-upload-label">
                <div className="upload-icon">📄</div>
                <div className="upload-text">
                  <strong>Cliquer pour sélectionner</strong> ou glisser votre fichier ici
                  <br />
                  <small>Formats acceptés: .csv, .xlsx, .xls</small>
                </div>
              </label>
            </div>

            <div className="import-tips">
              <h4>💡 Conseils pour un import réussi:</h4>
              <ul>
                <li>La première ligne doit contenir les en-têtes de colonnes</li>
                <li>Utilisez des noms de colonnes clairs (ex: "Nom", "Adresse", "Ville")</li>
                <li>Les champs requis: Nom établissement, Adresse civique</li>
                <li>Encodage recommandé: UTF-8</li>
                <li><strong>💾 Nouveau:</strong> Vous pourrez définir des valeurs par défaut pour tous les bâtiments (ex: même ville pour tous)</li>
              </ul>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>🔗 Étape 2: Correspondance des colonnes</h3>
              <p>Associez les colonnes de votre fichier aux champs du système</p>
            </div>

            <div className="mapping-container">
              <div className="mapping-header">
                <div className="file-info">
                  📊 <strong>{uploadedFile?.name}</strong> - {csvData.length} ligne(s), {csvHeaders.length} colonne(s)
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowFieldEditor(true)}
                >
                  ⚙️ Personnaliser les champs
                </Button>
              </div>

              <div className="mapping-info-box">
                <p>💡 <strong>Astuce:</strong> Utilisez la colonne "Valeur par défaut" pour appliquer une même valeur à toutes les lignes importées. Par exemple, si tous vos bâtiments sont dans la même ville, entrez le nom de la ville dans "Valeur par défaut" au lieu de l'ajouter dans le CSV.</p>
                <p><small>⚠️ La valeur par défaut écrase toujours les données du CSV si les deux sont renseignés.</small></p>
              </div>

              <div className="mapping-table">
                <div className="mapping-row header">
                  <div className="field-column">Champ système</div>
                  <div className="arrow-column">➡️</div>
                  <div className="csv-column">Colonne CSV</div>
                  <div className="default-value-column">💾 Valeur par défaut (saisie de masse)</div>
                  <div className="preview-column">Aperçu données</div>
                </div>

                {availableFields.map(field => (
                  <div key={field.key} className="mapping-row">
                    <div className="field-column">
                      <span className={field.required ? 'required-field' : 'optional-field'}>
                        {field.label}
                        {field.required && <span className="required-star"> *</span>}
                      </span>
                    </div>
                    <div className="arrow-column">➡️</div>
                    <div className="csv-column">
                      <select
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => handleColumnMapping(e.target.value, field.key)}
                        className="mapping-select"
                        disabled={!!defaultValues[field.key]}
                      >
                        <option value="">-- Sélectionner une colonne --</option>
                        {csvHeaders.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                    <div className="default-value-column">
                      <input
                        type="text"
                        value={defaultValues[field.key] || ''}
                        onChange={(e) => handleDefaultValue(field.key, e.target.value)}
                        placeholder="Ex: Montréal (appliqué à toutes les lignes)"
                        className="default-value-input"
                      />
                    </div>
                    <div className="preview-column">
                      {defaultValues[field.key] ? (
                        <span className="preview-data default-preview">
                          <strong>{defaultValues[field.key]}</strong> (toutes)
                        </span>
                      ) : columnMapping[field.key] && csvData[0] ? (
                        <span className="preview-data">
                          {csvData[0][columnMapping[field.key]] || '(vide)'}
                        </span>
                      ) : (
                        <span className="no-preview">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mapping-actions">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Retour
                </Button>
                <Button onClick={generatePreview}>
                  Aperçu données →
                </Button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>👀 Étape 3: Aperçu des données</h3>
              <p>Vérifiez que les données sont correctement mappées avant l'import</p>
            </div>

            <div className="preview-container">
              <div className="preview-info">
                📋 Aperçu des <strong>5 premières lignes</strong> sur {csvData.length} total
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table-enhanced">
                  <thead>
                    <tr>
                      <th className="row-number-header">#</th>
                      {availableFields.map(field => (
                        <th key={field.key} className={field.required ? 'required-header' : ''}>
                          {field.label}
                          {field.required && <span className="required-star"> *</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index}>
                        <td className="row-number">{index + 1}</td>
                        {availableFields.map(field => (
                          <td key={field.key} className="preview-data-cell">
                            {row[field.key] ? (
                              <span className={defaultValues[field.key] ? 'default-value-indicator' : 'csv-value-indicator'}>
                                {row[field.key]}
                              </span>
                            ) : (
                              <span className="empty-cell">(vide)</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="preview-legend">
                <div className="legend-item">
                  <span className="legend-badge default-badge">Bleu</span>
                  <span>Valeur par défaut (appliquée à toutes les lignes)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-badge csv-badge">Vert</span>
                  <span>Valeur du fichier CSV</span>
                </div>
              </div>

              <div className="preview-actions">
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Modifier mapping
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={importing}
                  className="import-confirm-btn"
                >
                  {importing ? '⏳ Import en cours...' : '✅ Confirmer import'}
                </Button>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>🎉 Import terminé</h3>
            </div>

            {importResults && (
              <div className="import-results">
                <div className="results-summary">
                  <div className="result-stat success">
                    <div className="stat-number">{importResults.success_count}</div>
                    <div className="stat-label">Importés avec succès</div>
                  </div>
                  {importResults.error_count > 0 && (
                    <div className="result-stat error">
                      <div className="stat-number">{importResults.error_count}</div>
                      <div className="stat-label">Erreurs</div>
                    </div>
                  )}
                </div>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="import-errors">
                    <h4>⚠️ Lignes avec erreurs:</h4>
                    <ul>
                      {importResults.errors.map((error, index) => (
                        <li key={index}>
                          Ligne {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="final-actions">
                  <Button 
                    onClick={onImportComplete}
                    className="finish-btn"
                  >
                    📋 Voir les bâtiments
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setStep(1);
                      setUploadedFile(null);
                      setCsvData([]);
                      setColumnMapping({});
                      setImportResults(null);
                    }}
                  >
                    🔄 Nouvel import
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <div>Étape inconnue</div>;
    }
  };

  return (
    <div className="import-csv-container">
      {showFieldEditor && <FieldEditor />}
      
      <div className="import-progress">
        <div className="progress-steps">
          {[1, 2, 3, 4].map(stepNum => (
            <div 
              key={stepNum} 
              className={`progress-step ${step >= stepNum ? 'active' : ''} ${step === stepNum ? 'current' : ''}`}
            >
              <div className="step-circle">{stepNum}</div>
              <div className="step-label">
                {stepNum === 1 && 'Téléverser'}
                {stepNum === 2 && 'Mappage'}
                {stepNum === 3 && 'Aperçu'}
                {stepNum === 4 && 'Importer'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="import-content">
        {renderStep()}
      </div>
    </div>
  );
};

// Gestion des Grilles d'Inspection
const EditerGrille = ({ grille, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: grille.nom,
    groupe_occupation: grille.groupe_occupation || '',
    sections: grille.sections || [],
    actif: grille.actif !== false,
    version: grille.version || '1.0'
  });
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { titre: '', questions: [] }]
    });
  };

  const removeSection = (index) => {
    setFormData({
      ...formData,
      sections: formData.sections.filter((_, i) => i !== index)
    });
  };

  const updateSection = (index, field, value) => {
    const newSections = [...formData.sections];
    newSections[index] = { ...newSections[index], [field]: value };
    setFormData({ ...formData, sections: newSections });
  };

  const addQuestion = (sectionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = [...(newSections[sectionIndex].questions || []), ''];
    setFormData({ ...formData, sections: newSections });
  };

  const removeQuestion = (sectionIndex, questionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = newSections[sectionIndex].questions.filter((_, i) => i !== questionIndex);
    setFormData({ ...formData, sections: newSections });
  };

  const updateQuestion = (sectionIndex, questionIndex, value) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions[questionIndex] = value;
    setFormData({ ...formData, sections: newSections });
  };

  const handleSave = async () => {
    if (!formData.nom) {
      toast({
        title: "Validation",
        description: "Le nom de la grille est requis",
        variant: "destructive"
      });
      return;
    }

    if (formData.sections.length === 0) {
      toast({
        title: "Validation",
        description: "La grille doit contenir au moins une section",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPut(tenantSlug, `/prevention/grilles-inspection/${grille.id}`, formData);
      
      toast({
        title: "Succès",
        description: "Grille mise à jour avec succès"
      });
      
      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editer-grille-container">
      <div className="page-header">
        <h2>✏️ Modifier la Grille: {grille.nom}</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={onClose}>
            ✕ Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="grille-form">
        {/* Informations générales */}
        <div className="form-section">
          <h3>Informations Générales</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="form-input"
                placeholder="Ex: Grille Résidentielle Personnalisée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
                className="form-select"
              >
                <option value="">-- Sélectionner --</option>
                <option value="A">A - Habitation</option>
                <option value="B">B - Soins et détention</option>
                <option value="C">C - Résidentiel</option>
                <option value="D">D - Affaires</option>
                <option value="E">E - Commerce</option>
                <option value="F">F - Industriel</option>
                <option value="I">I - Assemblée</option>
              </select>
            </div>
            <div className="form-field">
              <label>Version</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="form-input"
                placeholder="1.0"
              />
            </div>
            <div className="form-field checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                />
                <span>Grille active</span>
              </label>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="form-section">
          <div className="section-header">
            <h3>Sections ({formData.sections.length})</h3>
            <Button size="sm" onClick={addSection}>
              ➕ Ajouter une section
            </Button>
          </div>

          <div className="sections-list">
            {formData.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="section-editor">
                <div className="section-editor-header">
                  <h4>Section {sectionIndex + 1}</h4>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => removeSection(sectionIndex)}
                  >
                    🗑️ Supprimer section
                  </Button>
                </div>

                <div className="section-editor-content">
                  <div className="form-field">
                    <label>Titre de la section *</label>
                    <input
                      type="text"
                      value={section.titre}
                      onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                      className="form-input"
                      placeholder="Ex: Voies d'évacuation"
                    />
                  </div>

                  <div className="questions-editor">
                    <div className="questions-header">
                      <label>Questions ({section.questions?.length || 0})</label>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => addQuestion(sectionIndex)}
                      >
                        ➕ Ajouter question
                      </Button>
                    </div>

                    <div className="questions-list-editor">
                      {(section.questions || []).map((question, questionIndex) => (
                        <div key={questionIndex} className="question-editor-item">
                          <span className="question-number">{questionIndex + 1}.</span>
                          <input
                            type="text"
                            value={question}
                            onChange={(e) => updateQuestion(sectionIndex, questionIndex, e.target.value)}
                            className="question-input"
                            placeholder="Entrez votre question..."
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeQuestion(sectionIndex, questionIndex)}
                            className="remove-question-btn"
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {formData.sections.length === 0 && (
            <div className="empty-state">
              <p>Aucune section. Cliquez sur "Ajouter une section" pour commencer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const GrillesInspection = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [grilles, setGrilles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingGrille, setEditingGrille] = useState(null);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(null);

  const fetchGrilles = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
      setGrilles(data);
    } catch (error) {
      console.error('Erreur chargement grilles:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les grilles d'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrilles();
  }, [tenantSlug]);

  const handleDeleteGrille = async (grilleId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette grille ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/prevention/grilles-inspection/${grilleId}`);
      toast({
        title: "Succès",
        description: "Grille supprimée avec succès"
      });
      fetchGrilles();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la grille",
        variant: "destructive"
      });
    }
  };

  // Modal de prévisualisation du template
  if (viewingTemplate) {
    return (
      <TemplatePreviewModal 
        template={viewingTemplate}
        onClose={() => setViewingTemplate(null)}
        onUse={(template) => {
          setViewingTemplate(null);
          setCreatingFromTemplate(template);
        }}
      />
    );
  }

  // Édition d'une grille à partir d'un template
  if (creatingFromTemplate) {
    return (
      <EditerGrilleFromTemplate 
        template={creatingFromTemplate}
        onClose={() => setCreatingFromTemplate(null)}
        onSave={() => {
          setCreatingFromTemplate(null);
          fetchGrilles();
        }}
      />
    );
  }

  // Édition d'une grille existante
  if (editingGrille) {
    return <EditerGrille grille={editingGrille} onClose={() => setEditingGrille(null)} onSave={() => { setEditingGrille(null); fetchGrilles(); }} />;
  }

  if (loading) {
    return <div className="loading">Chargement des grilles...</div>;
  }

  return (
    <div className="grilles-inspection-container">
      {/* Grilles disponibles */}
      <div className="default-grilles-section">
        <h3>📋 Grilles d'Inspection Disponibles</h3>
        <p>Grilles d'inspection configurées pour votre service selon le Code de sécurité du Québec</p>
        
        {grilles.length === 0 && (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            backgroundColor: '#fef3c7', 
            border: '2px solid #fcd34d',
            borderRadius: '8px',
            margin: '1rem 0'
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>⚠️ Aucune grille d'inspection configurée</p>
            <p style={{ color: '#92400e', marginBottom: '1rem' }}>
              Pour utiliser le module de prévention, vous devez d'abord initialiser les grilles d'inspection standards.
            </p>
            <Button 
              onClick={async () => {
                try {
                  setLoading(true);
                  await apiPost(tenantSlug, '/prevention/initialiser', {});
                  toast({
                    title: "Succès",
                    description: "7 grilles d'inspection créées avec succès"
                  });
                  fetchGrilles();
                } catch (error) {
                  toast({
                    title: "Erreur",
                    description: error.response?.data?.detail || "Impossible d'initialiser les grilles",
                    variant: "destructive"
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              🚀 Initialiser les 7 grilles standards
            </Button>
          </div>
        )}
        
        <div className="default-grilles-grid">
          {grilles.map(grille => (
            <div key={grille.id} className="template-card">
              <div className="template-header">
                <h4>{grille.groupe_occupation ? `Groupe ${grille.groupe_occupation}` : 'Grille personnalisée'}</h4>
                {grille.groupe_occupation && <span className="groupe-badge">{grille.groupe_occupation}</span>}
              </div>
              <div className="template-info">
                <p><strong>{grille.nom}</strong></p>
                <p>{grille.description || 'Grille d\'inspection personnalisée'}</p>
                <div className="template-stats">
                  <span className="stat">{grille.sections?.length || 0} sections</span>
                  <span className="stat">{grille.sections?.reduce((acc, s) => acc + (s.questions?.length || 0), 0) || 0} questions</span>
                </div>
                {grille.sous_types && grille.sous_types.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    Sous-types: {grille.sous_types.join(', ')}
                  </div>
                )}
              </div>
              <div className="template-actions">
                <Button 
                  size="sm" 
                  onClick={() => setViewingTemplate(grille)}
                >
                  👀 Aperçu
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setEditingGrille(grille)}
                >
                  📝 Modifier
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('Dupliquer cette grille pour créer une variante?')) return;
                    const nouveauNom = prompt('Nom de la nouvelle grille:', `${grille.nom} (Copie)`);
                    if (!nouveauNom) return;
                    
                    try {
                      await apiPost(tenantSlug, `/prevention/grilles-inspection/${grille.id}/dupliquer?nouveau_nom=${encodeURIComponent(nouveauNom)}`, {});
                      toast({
                        title: "Succès",
                        description: "Grille dupliquée avec succès"
                      });
                      fetchGrilles();
                    } catch (error) {
                      toast({
                        title: "Erreur",
                        description: "Impossible de dupliquer la grille",
                        variant: "destructive"
                      });
                    }
                  }}
                >
                  📋 Dupliquer
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => handleDeleteGrille(grille.id)}
                >
                  🗑️ Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note informative */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px'
      }}>
        <p style={{ fontSize: '0.875rem', color: '#0369a1' }}>
          ℹ️ <strong>Astuce</strong>: Les grilles peuvent être dupliquées pour créer des variantes adaptées à vos besoins spécifiques.
          Les sous-types permettent d'afficher des questions conditionnelles lors des inspections.
        </p>
      </div>

      {/* Anciennes grilles personnalisées supprimées - maintenant toutes les grilles sont dans la même liste */}
      <div style={{ display: 'none' }}>
        {/* Section supprimée - grilles personnalisées fusionnées avec grilles principales */}
        <div className="custom-grilles-section">
          <h3>🛠️ Grilles Personnalisées</h3>
          <div className="empty-state">
            <p>Section fusionnée avec grilles principales ci-dessus</p>
          </div>
        </div>
      </div>

      {/* Reste du code inchangé - ne pas modifier */}
      <div style={{ display: 'none' }}>
        {grilles.length > 0 && (
          <div className="custom-grilles-grid">
            {grilles.map(grille => (
              <div key={grille.id} className="grille-card">
                <div className="grille-header">
                  <h4>{grille.nom}</h4>
                  <span className="groupe-badge">{grille.groupe_occupation}</span>
                </div>
                <div className="grille-info">
                  <p>Version: {grille.version}</p>
                  <p>Sections: {grille.sections?.length || 0}</p>
                  <p>Statut: {grille.actif ? '✅ Actif' : '❌ Inactif'}</p>
                </div>
                <div className="grille-actions">
                  <Button size="sm" onClick={() => setEditingGrille(grille)}>Modifier</Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDeleteGrille(grille.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* L'aperçu s'ouvre maintenant dans un modal au clic */}
    </div>
  );

};

// Modal de prévisualisation du template
const TemplatePreviewModal = ({ template, onClose, onUse }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '900px',
        maxHeight: '80vh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              📋 Grille Template - Groupe {template.groupe}
            </h2>
            <p style={{ color: '#6b7280' }}>{template.nom}</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{template.description}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              border: 'none',
              background: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem'
        }}>
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <strong>📊 Statistiques:</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
              <span>🗂️ {template.sections.length} sections</span>
              <span>❓ {template.sections.reduce((acc, s) => acc + s.questions.length, 0)} questions</span>
            </div>
          </div>

          {template.sections.map((section, idx) => (
            <div key={idx} style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px'
            }}>
              <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {section.titre}
              </h4>
              {section.description && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem', fontStyle: 'italic' }}>
                  {section.description}
                </p>
              )}
              
              <div style={{ paddingLeft: '1rem' }}>
                {section.questions.map((q, qIdx) => (
                  <div key={qIdx} style={{
                    padding: '0.5rem 0',
                    borderBottom: qIdx < section.questions.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      {qIdx + 1}. {q.question}
                    </span>
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      ({q.type})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem'
        }}>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={() => onUse(template)}>
            📝 Utiliser & Personnaliser
          </Button>
        </div>
      </div>
    </div>
  );
};

// Éditeur de grille depuis template (avec questions pré-remplies)
const EditerGrilleFromTemplate = ({ template, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: `${template.nom} (Personnalisée)`,
    groupe_occupation: template.groupe,
    sections: JSON.parse(JSON.stringify(template.sections)), // Deep copy
    actif: true,
    version: "1.0"
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.nom) {
      toast({
        title: "Validation",
        description: "Le nom de la grille est requis",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPost(tenantSlug, '/prevention/grilles-inspection', formData);
      
      toast({
        title: "Succès",
        description: "Grille créée avec succès"
      });
      
      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { titre: '', description: '', questions: [] }]
    });
  };

  const removeSection = (index) => {
    const newSections = formData.sections.filter((_, i) => i !== index);
    setFormData({ ...formData, sections: newSections });
  };

  const updateSection = (index, field, value) => {
    const newSections = [...formData.sections];
    newSections[index] = { ...newSections[index], [field]: value };
    setFormData({ ...formData, sections: newSections });
  };

  const addQuestion = (sectionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = [
      ...(newSections[sectionIndex].questions || []),
      { question: '', type: 'choix', options: ['Conforme', 'Non-conforme', 'S.O.'] }
    ];
    setFormData({ ...formData, sections: newSections });
  };

  const removeQuestion = (sectionIndex, questionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = newSections[sectionIndex].questions.filter((_, i) => i !== questionIndex);
    setFormData({ ...formData, sections: newSections });
  };

  const updateQuestion = (sectionIndex, questionIndex, field, value) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions[questionIndex] = {
      ...newSections[sectionIndex].questions[questionIndex],
      [field]: value
    };
    setFormData({ ...formData, sections: newSections });
  };

  return (
    <div className="editer-grille-container">
      <div className="page-header">
        <h2>✏️ Personnaliser: {template.nom}</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={onClose}>
            ✕ Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="grille-form">
        {/* Informations générales */}
        <div className="form-section">
          <h3>Informations Générales</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="form-input"
                placeholder="Ex: Grille Résidentielle Personnalisée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
                className="form-select"
              >
                <option value="">-- Sélectionner --</option>
                <option value="A">A - Établissements de réunion</option>
                <option value="B">B - Soins ou détention</option>
                <option value="C">C - Résidentiel</option>
                <option value="D">D - Affaires et services personnels</option>
                <option value="E">E - Commercial</option>
                <option value="F">F - Industriel</option>
                <option value="G">G - Agricole</option>
              </select>
            </div>
          </div>

          {/* Info sur les sous-types */}
          {formData.groupe_occupation && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#eff6ff',
              borderLeft: '4px solid #3b82f6',
              borderRadius: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                <div>
                  <strong style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>
                    Grille Universelle avec Questions Conditionnelles
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                    Cette grille s'adapte automatiquement selon le <strong>sous-type du bâtiment</strong> lors de l'inspection.
                    Les questions non pertinentes seront masquées.
                  </p>
                  
                  {formData.groupe_occupation === 'C' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Unifamiliale, Bifamiliale, Multifamiliale (3-8), Multifamiliale (9+), Copropriété, Maison mobile
                    </div>
                  )}
                  {formData.groupe_occupation === 'E' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Bureau, Magasin, Restaurant, Hôtel, Centre commercial
                    </div>
                  )}
                  {formData.groupe_occupation === 'F' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Manufacture légère, Manufacture lourde, Entrepôt, Usine, Atelier
                    </div>
                  )}
                  {formData.groupe_occupation === 'B' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> École, Hôpital, CHSLD, Centre communautaire, Église, Bibliothèque
                    </div>
                  )}
                  {formData.groupe_occupation === 'G' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Ferme, Grange, Serre, Écurie, Silo
                    </div>
                  )}
                  
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.5rem',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#059669'
                  }}>
                    ✅ <strong>Comment ça marche :</strong><br/>
                    1. Le sous-type est défini sur le <strong>bâtiment</strong> (dans le modal bâtiment)<br/>
                    2. Lors de l'inspection, seules les questions pertinentes s'affichent<br/>
                    3. Vous pouvez ajouter des conditions aux questions (ex: "condition: multi_9 || copropriete")
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Option: Grille spécifique à un sous-type */}
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontSize: '0.875rem',
              color: '#3b82f6',
              padding: '0.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '4px'
            }}>
              🔧 Option Avancée : Créer une grille spécifique à un sous-type
            </summary>
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              backgroundColor: '#fefce8'
            }}>
              <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                ⚠️ Par défaut, une grille s'applique à TOUS les sous-types d'un groupe.
              </p>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                Si vous voulez créer une grille qui ne s'applique qu'à un sous-type spécifique 
                (ex: uniquement pour Maisons mobiles), ajoutez un suffixe clair au nom.
              </p>
              <div className="form-field">
                <label style={{ fontSize: '0.875rem' }}>Sous-type cible (optionnel)</label>
                <input
                  type="text"
                  value={formData.sous_type_cible || ''}
                  onChange={(e) => setFormData({ ...formData, sous_type_cible: e.target.value })}
                  placeholder="Ex: maison_mobile, hotel, manufacture_legere"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Laissez vide pour une grille universelle (recommandé)
                </p>
              </div>
            </div>
          </details>
        </div>

        {/* Sections et questions */}
        <div className="form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Sections et Questions</h3>
            <Button size="sm" onClick={addSection}>
              ➕ Ajouter une section
            </Button>
          </div>

          {formData.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="section-editor" style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4>Section {sectionIndex + 1}</h4>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => removeSection(sectionIndex)}
                >
                  🗑️ Supprimer section
                </Button>
              </div>

              <div className="form-field">
                <label>Titre de la section *</label>
                <input
                  type="text"
                  value={section.titre}
                  onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                  className="form-input"
                  placeholder="Ex: Voies d'évacuation"
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  value={section.description || ''}
                  onChange={(e) => updateSection(sectionIndex, 'description', e.target.value)}
                  className="form-textarea"
                  placeholder="Description optionnelle de la section"
                  rows={2}
                />
              </div>

              {/* Questions */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Questions:</strong>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => addQuestion(sectionIndex)}
                  >
                    ➕ Ajouter question
                  </Button>
                </div>

                {section.questions && section.questions.map((question, qIndex) => (
                  <div key={qIndex} style={{
                    backgroundColor: 'white',
                    padding: '1rem',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={question.question}
                        onChange={(e) => updateQuestion(sectionIndex, qIndex, 'question', e.target.value)}
                        placeholder="Texte de la question"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px'
                        }}
                      />
                      <select
                        value={question.type}
                        onChange={(e) => updateQuestion(sectionIndex, qIndex, 'type', e.target.value)}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px'
                        }}
                      >
                        <option value="choix">Choix multiple</option>
                        <option value="texte">Texte libre</option>
                        <option value="photos">Photos</option>
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeQuestion(sectionIndex, qIndex)}
                      >
                        🗑️
                      </Button>
                    </div>

                    {/* Photos de référence - optionnel pour guider l'inspecteur */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <details style={{ fontSize: '0.875rem' }}>
                        <summary style={{ cursor: 'pointer', color: '#3b82f6' }}>
                          📷 Photos de référence (optionnel)
                        </summary>
                        <div style={{ 
                          marginTop: '0.5rem', 
                          padding: '0.75rem', 
                          backgroundColor: '#f9fafb',
                          borderRadius: '4px'
                        }}>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                            Ajoutez des photos/schémas pour aider l'inspecteur (ex: localisation extincteur, schéma technique)
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files);
                              // Pour l'instant, on stocke juste les noms
                              // TODO: Upload vers serveur et stocker URLs
                              const photoNames = files.map(f => f.name);
                              updateQuestion(sectionIndex, qIndex, 'photos_reference', [
                                ...(question.photos_reference || []),
                                ...photoNames
                              ]);
                            }}
                            style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}
                          />
                          
                          {question.photos_reference && question.photos_reference.length > 0 && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <strong style={{ fontSize: '0.75rem' }}>Photos ajoutées:</strong>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                {question.photos_reference.map((photo, pIdx) => (
                                  <div key={pIdx} style={{
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    📎 {photo}
                                    <button
                                      onClick={() => {
                                        const newPhotos = question.photos_reference.filter((_, i) => i !== pIdx);
                                        updateQuestion(sectionIndex, qIndex, 'photos_reference', newPhotos);
                                      }}
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        color: '#ef4444',
                                        fontSize: '0.875rem'
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>

                    {/* Champ observations si non-conforme */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#6b7280'
                      }}>
                        <input
                          type="checkbox"
                          checked={question.photo_requise_si_non_conforme || false}
                          onChange={(e) => updateQuestion(sectionIndex, qIndex, 'photo_requise_si_non_conforme', e.target.checked)}
                        />
                        📸 Photo obligatoire si non-conforme
                      </label>
                    </div>

                    {/* Condition d'affichage */}
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ 
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        color: '#9ca3af'
                      }}>
                        🔀 Question conditionnelle (avancé)
                      </summary>
                      <div style={{ 
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '4px'
                      }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                          Condition d'affichage
                        </label>
                        <input
                          type="text"
                          value={question.condition || ''}
                          onChange={(e) => updateQuestion(sectionIndex, qIndex, 'condition', e.target.value)}
                          placeholder="Ex: multi_9 || copropriete"
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <p style={{ fontSize: '0.65rem', color: '#92400e', marginTop: '0.25rem' }}>
                          Utilisez les sous-types: unifamiliale, bifamiliale, multi_3_8, multi_9, copropriete, maison_mobile, bureau, magasin, restaurant, hotel, etc.
                          <br/>Opérateurs: || (OU), && (ET)
                          <br/>Laissez vide pour afficher toujours
                        </p>
                        {question.condition && (
                          <div style={{ 
                            marginTop: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#dcfce7',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            color: '#166534'
                          }}>
                            ✓ Cette question s'affichera seulement pour: <strong>{question.condition}</strong>
                          </div>
                        )}
                      </div>
                    </details>

                    {question.type === 'photos' && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        💡 Type "Photos": L'inspecteur pourra prendre plusieurs photos librement
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CreateGrilleInspection = ({ onSave, onViewTemplates }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: '',
    groupe_occupation: '',
    sections: [],
    actif: true,
    version: '1.0'
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.nom || !formData.groupe_occupation) {
      toast({
        title: "Validation",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPost(tenantSlug, '/prevention/grilles-inspection', formData);
      
      toast({
        title: "Succès",
        description: "Grille créée avec succès"
      });
      
      onSave();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-grille-container">
      <div className="grille-form">
        <div className="form-section">
          <h3>ℹ️ Informations de base</h3>
          <div className="form-fields">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                placeholder="Ex: Inspection Commerciale Détaillée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation *</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({...formData, groupe_occupation: e.target.value})}
              >
                <option value="">Sélectionner un groupe</option>
                <option value="A">Groupe A - Résidentiel unifamilial</option>
                <option value="B">Groupe B - Soins et détention</option>
                <option value="C">Groupe C - Résidentiel</option>
                <option value="D">Groupe D - Affaires et services personnels</option>
                <option value="E">Groupe E - Commerce</option>
                <option value="F">Groupe F - Industriel</option>
                <option value="G">Groupe G - Garages et stations-service</option>
                <option value="H">Groupe H - Risques élevés</option>
                <option value="I">Groupe I - Assemblée</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>📝 Recommandation</h3>
          <div className="recommendation-note">
            <p>💡 <strong>Pour commencer rapidement :</strong></p>
            <p>Nous recommandons d'utiliser les <strong>grilles templates</strong> pré-configurées selon le Code de sécurité du Québec. Vous pourrez ensuite les personnaliser selon vos besoins.</p>
            <Button 
              variant="outline"
              onClick={onViewTemplates}
            >
              📋 Voir les templates disponibles
            </Button>
          </div>
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={onSave}>
            Annuler
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Création...' : 'Créer la grille'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Templates de grilles d'inspection par défaut
const DEFAULT_GRILLES_TEMPLATES = [
  {
    groupe: "C",
    nom: "Résidentiel - Habitation",
    description: "Maisons unifamiliales, duplex, immeubles résidentiels",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Identification complète de l'établissement et des responsables",
        questions: [
          { question: "Plan de mesures d'urgence en cas d'incendie affiché?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan à jour et exercé dans la dernière année?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis d'occupation valide affiché?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Notes générales", type: "texte" },
          { question: "Photos", type: "photos" }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Vérification de la documentation obligatoire",
        questions: [
          { question: "Plans d'évacuation affichés et visibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registres d'entretien tenus à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Notes sur la documentation", type: "texte" }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Vérification des moyens d'évacuation et de leur accessibilité",
        questions: [
          { question: "Nombre de sorties suffisant et bien réparties?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Panneaux 'SORTIE' clairs et éclairés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes de sortie faciles à ouvrir de l'intérieur?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Dégagements libres de tout encombrement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de sécurité fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des voies d'évacuation", type: "photos" }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Vérification des équipements de protection contre l'incendie",
        questions: [
          { question: "Détecteurs de fumée présents et fonctionnels?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Date de fabrication des détecteurs < 10 ans?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détecteurs CO présents si applicable?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs présents et accessibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Inspection mensuelle extincteurs à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des équipements", type: "photos" }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Évaluation des risques particuliers selon l'occupation",
        questions: [
          { question: "Dégagement libre devant panneau électrique (1m)?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aucun fil électrique dénudé visible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Appareils à combustible: dégagements respectés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Conduits d'évacuation en bon état?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des risques identifiés", type: "photos" }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Vérification de l'accessibilité pour les véhicules d'urgence",
        questions: [
          { question: "Adresse civique visible de la rue?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Voie d'accès dégagée pour véhicules d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Poteau d'incendie dégagé et accessible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "E",
    nom: "Commerce - Établissements commerciaux",
    description: "Magasins, centres commerciaux, bureaux commerciaux",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Identification complète de l'établissement commercial",
        questions: [
          { question: "Plan de mesures d'urgence affiché et accessible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Responsable sécurité incendie identifié?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis d'occupation commercial valide?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Formation du personnel sur évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation spécifique aux établissements commerciaux",
        questions: [
          { question: "Plans d'évacuation affichés à chaque étage?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registre des exercices d'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Certificats des systèmes de protection à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Moyens d'évacuation pour occupation commerciale",
        questions: [
          { question: "Sorties de secours dégagées et signalisées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Largeur des dégagements conforme au nombre d'occupants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes équipées de dispositifs anti-panique?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage d'urgence testé mensuellement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aucun stockage dans les dégagements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Systèmes de protection spécifiques aux commerces",
        questions: [
          { question: "Système d'alarme incendie fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détecteurs de fumée dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs appropriés au type de risque?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de gicleurs (si requis) opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Robinets d'incendie armés accessibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques particuliers aux activités commerciales",
        questions: [
          { question: "Stockage respecte les distances de sécurité?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Piles de marchandises stables et limitées en hauteur?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Séparation des produits incompatibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Zones de livraison dégagées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système électrique conforme et entretenu?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès pour intervention en milieu commercial",
        questions: [
          { question: "Signalisation claire pour identification du bâtiment?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Accès véhicules lourds possible et dégagé?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Boîte à clés (Knox Box) installée si requise?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan d'intervention disponible sur site?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "F",
    nom: "Industriel - Établissements industriels",
    description: "Usines, ateliers, entrepôts industriels",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Information sur l'établissement industriel et ses activités",
        questions: [
          { question: "Plan d'intervention d'urgence détaillé disponible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Équipe de sécurité incendie formée et désignée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis pour matières dangereuses à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Formation du personnel sur les risques spécifiques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation technique et réglementaire",
        questions: [
          { question: "Fiches de données de sécurité (FDS) disponibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plans des installations avec localisation des risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registres de maintenance des équipements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis de travaux à chaud à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Moyens d'évacuation pour milieu industriel",
        questions: [
          { question: "Sorties d'urgence adaptées aux effectifs?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Chemins d'évacuation clairement marqués?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes coupe-feu maintenues fermées automatiquement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de sécurité conforme aux zones à risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Points de rassemblement extérieurs identifiés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Systèmes de protection industrielle",
        questions: [
          { question: "Système d'alarme automatique fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de détection adapté aux risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs spécialisés selon les risques présents?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système fixe d'extinction (mousse, CO2) opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Réseau de gicleurs industriel fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Colonne sèche et raccords normalisés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques industriels particuliers",
        questions: [
          { question: "Matières dangereuses stockées selon les normes?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aires de stockage avec rétention appropriée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Équipements électriques adaptés aux zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de ventilation et évacuation des fumées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Travaux à chaud avec surveillance appropriée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Nettoyage régulier des zones d'accumulation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès spécialisé pour intervention industrielle",
        questions: [
          { question: "Accès pompiers avec véhicules spécialisés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan d'intervention détaillé remis aux pompiers?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de communication d'urgence opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Moyens d'approvisionnement en eau suffisants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "I",
    nom: "Assemblée - Lieux de rassemblement",
    description: "Écoles, théâtres, centres communautaires, églises",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Gestion sécurité pour lieux d'assemblée",
        questions: [
          { question: "Plan d'évacuation affiché dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Responsable évacuation désigné pour chaque événement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Capacité maximale d'occupation respectée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Personnel formé aux procédures d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation pour gestion des foules",
        questions: [
          { question: "Plans d'évacuation adaptés au type d'assemblée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Procédures d'urgence communiquées au public?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registre des exercices d'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Évacuation sécuritaire des grandes assemblées",
        questions: [
          { question: "Nombre de sorties conforme à l'occupation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Largeur des sorties proportionnelle aux occupants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes s'ouvrent dans le sens de l'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage d'urgence sur tous les parcours?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aisles et dégagements libres pendant les événements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Protection adaptée aux assemblées",
        questions: [
          { question: "Système d'alarme audible dans tout le bâtiment?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de sonorisation pour annonces d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détection automatique dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs accessibles et visibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de gicleurs dans les zones de rassemblement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques liés aux activités d'assemblée",
        questions: [
          { question: "Sièges et rangées fixées selon les normes?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Scène et décors avec matériaux ignifuges?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de scène avec protection thermique?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Cuisine (si présente) avec système d'extinction?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Contrôle du tabagisme respecté?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès pour intervention lors d'assemblées",
        questions: [
          { question: "Accès prioritaire maintenu libre en tout temps?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Communication directe avec services d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan du site remis aux services d'incendie?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Stationnement d'urgence réservé et signalisé?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  }
];

// MapComponent avec Leaflet + OpenStreetMap (GRATUIT, sans clé API)
const MapComponent = ({ batiments, onBatimentClick }) => {
  const [mapReady, setMapReady] = useState(false);
  
  // Importer Leaflet CSS
  React.useEffect(() => {
    // Ajouter le CSS de Leaflet
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
    
    setMapReady(true);
    
    return () => {
      document.head.removeChild(link);
    };
  }, []);
  
  if (!mapReady) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        minHeight: '500px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f9fafb',
        borderRadius: '8px',
        border: '1px solid #ddd'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🗺️</div>
        <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6' }}>
          Chargement de la carte...
        </div>
      </div>
    );
  }
  
  // Calculer le centre basé sur les bâtiments
  let center = [45.4042, -71.8929]; // Shefford par défaut
  
  if (batiments && batiments.length > 0) {
    const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
    if (batimentsAvecCoords.length > 0) {
      const avgLat = batimentsAvecCoords.reduce((sum, b) => sum + b.latitude, 0) / batimentsAvecCoords.length;
      const avgLng = batimentsAvecCoords.reduce((sum, b) => sum + b.longitude, 0) / batimentsAvecCoords.length;
      center = [avgLat, avgLng];
    }
  }
  
  return (
    <LeafletMap 
      batiments={batiments}
      center={center}
      onBatimentClick={onBatimentClick}
    />
  );
};

// Composant Leaflet séparé
const LeafletMap = ({ batiments, center, onBatimentClick }) => {
  const { MapContainer, TileLayer, Marker, Popup, useMap } = require('react-leaflet');
  const L = require('leaflet');
  
  // Fix pour les icônes Leaflet
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
  
  // Composant pour ajuster la vue aux marqueurs
  const FitBounds = ({ batiments }) => {
    const map = useMap();
    
    React.useEffect(() => {
      if (batiments && batiments.length > 0) {
        const batimentsAvecCoords = batiments.filter(b => b.latitude && b.longitude);
        if (batimentsAvecCoords.length > 0) {
          const bounds = batimentsAvecCoords.map(b => [b.latitude, b.longitude]);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }
    }, [batiments, map]);
    
    return null;
  };
  
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '500px', borderRadius: '8px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ width: '100%', height: '100%', minHeight: '500px' }}
        scrollWheelZoom={true}
      >
        {/* OpenStreetMap tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Marqueurs pour chaque bâtiment */}
        {batiments && batiments.filter(b => b.latitude && b.longitude).map(batiment => (
          <Marker 
            key={batiment.id}
            position={[batiment.latitude, batiment.longitude]}
            eventHandlers={{
              click: () => {
                if (onBatimentClick) {
                  onBatimentClick(batiment);
                }
              }
            }}
          >
            <Popup>
              <div style={{ padding: '5px', maxWidth: '250px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', fontWeight: 'bold' }}>
                  {batiment.nom_etablissement || 'Sans nom'}
                </h3>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Adresse:</strong> {batiment.adresse_civique || 'N/A'}
                </p>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Ville:</strong> {batiment.ville || 'N/A'}
                </p>
                <p style={{ margin: '5px 0', fontSize: '13px' }}>
                  <strong>Groupe:</strong> {batiment.groupe_occupation || 'N/A'}
                </p>
                {batiment.preventionniste_assigne_id ? (
                  <p style={{ margin: '5px 0', fontSize: '13px', color: 'green' }}>
                    <strong>✓ Préventionniste assigné</strong>
                  </p>
                ) : (
                  <p style={{ margin: '5px 0', fontSize: '13px', color: 'orange' }}>
                    <strong>⚠ Sans préventionniste</strong>
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        
        <FitBounds batiments={batiments} />
      </MapContainer>
    </div>
  );
};

// Gestion des Préventionnistes
const GestionPreventionnistes = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [preventionnistes, setPreventionnistes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' ou 'secteurs'
  const [editMode, setEditMode] = useState(false);
  const [showSecteurModal, setShowSecteurModal] = useState(false);
  const [currentSecteur, setCurrentSecteur] = useState(null);
  const [pendingGeometry, setPendingGeometry] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Charger les préventionnistes avec l'endpoint dédié
      const [preventionnistesData, usersData, batimentsData, secteursData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/preventionnistes'),
        apiGet(tenantSlug, '/users'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/prevention/secteurs').catch(() => [])
      ]);
      
      setUsers(usersData);
      setBatiments(batimentsData);
      setSecteurs(secteursData || []);
      
      // Enrichir les préventionnistes avec leurs stats
      const preventionnistesEnrichis = await Promise.all(
        preventionnistesData.map(async (prev) => {
          try {
            const stats = await apiGet(tenantSlug, `/prevention/preventionnistes/${prev.id}/stats`);
            return { ...prev, stats };
          } catch (error) {
            console.error(`Erreur stats pour ${prev.id}:`, error);
            return { ...prev, stats: {} };
          }
        })
      );
      
      setPreventionnistes(preventionnistesEnrichis);
      
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

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const handleRemoveAssignment = async (batimentId) => {
    try {
      await apiPut(tenantSlug, `/prevention/batiments/${batimentId}`, {
        preventionniste_assigne_id: null
      });
      
      toast({
        title: "Succès",
        description: "Assignation supprimée"
      });
      
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'assignation",
        variant: "destructive"
      });
    }
  };

  // Gestion des secteurs
  const handleSecteurCreate = (geometry) => {
    setPendingGeometry(geometry);
    setCurrentSecteur(null);
    setShowSecteurModal(true);
  };

  const handleSecteurClick = (secteur) => {
    setCurrentSecteur(secteur);
    setPendingGeometry(null);
    setShowSecteurModal(true);
  };

  const handleSaveSecteur = async (secteurData) => {
    try {
      let secteurId;
      let geometry;
      
      if (currentSecteur) {
        // Mise à jour - conserver la géométrie existante
        await apiPut(tenantSlug, `/prevention/secteurs/${currentSecteur.id}`, {
          ...secteurData,
          geometry: currentSecteur.geometry  // Garder la géométrie existante
        });
        secteurId = currentSecteur.id;
        geometry = currentSecteur.geometry;
        toast({
          title: "Succès",
          description: "Secteur mis à jour"
        });
      } else {
        // Création - utiliser la géométrie nouvellement dessinée
        const response = await apiPost(tenantSlug, '/prevention/secteurs', {
          ...secteurData,
          geometry: pendingGeometry
        });
        console.log('🔍 Réponse API création secteur:', response);
        secteurId = response?.id || response?._id;
        geometry = pendingGeometry;
        toast({
          title: "Succès",
          description: "Secteur créé"
        });
      }
      
      // Le champ du formulaire s'appelle preventionniste_assigne_id
      const preventionnisteId = secteurData.preventionniste_assigne_id || secteurData.preventionniste_id;
      console.log('🎯 Assignation - secteurId:', secteurId, 'preventionnisteId:', preventionnisteId, 'geometry:', geometry);
      
      // Utiliser l'endpoint backend dédié pour assigner le préventionniste au secteur
      // Cet endpoint s'occupe aussi d'assigner automatiquement tous les bâtiments du secteur
      if (preventionnisteId) {
        try {
          const response = await apiPut(tenantSlug, `/prevention/secteurs/${secteurId}/assigner`, {
            preventionniste_id: preventionnisteId,
            assigner_batiments: true
          });
          
          toast({
            title: "Assignation réussie",
            description: `Secteur et ${response.nb_batiments_assignes || 0} bâtiment(s) assignés au préventionniste`
          });
        } catch (error) {
          console.error('Erreur assignation secteur:', error);
          toast({
            title: "Avertissement",
            description: "Secteur sauvegardé mais erreur lors de l'assignation",
            variant: "warning"
          });
        }
      }
      
      // Fermer le modal et rafraîchir les données
      setShowSecteurModal(false);
      setCurrentSecteur(null);
      setPendingGeometry(null);
      
      // Rafraîchir toutes les données après l'assignation
      await fetchData();
    } catch (error) {
      console.error('Erreur sauvegarde secteur:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le secteur",
        variant: "destructive"
      });
    }
  };
  
  // Fonction pour assigner les bâtiments dans un secteur au préventionniste
  const assignBatimentsToSecteur = async (secteurId, preventionnisteId, geometry) => {
    try {
      console.log('🔍 Début assignation - secteurId:', secteurId, 'preventionnisteId:', preventionnisteId);
      console.log('🔍 Geometry:', geometry);
      console.log('🔍 Total bâtiments:', batiments.length);
      
      // Vérifier quels bâtiments sont dans le secteur (calcul côté client)
      const batimentsInSecteur = batiments.filter(batiment => {
        if (!batiment.latitude || !batiment.longitude) {
          console.log('❌ Bâtiment sans coordonnées:', batiment.nom_etablissement);
          return false;
        }
        
        // Vérifier si le point est dans le polygone
        const point = [batiment.longitude, batiment.latitude];
        const isInside = isPointInPolygon(point, geometry.coordinates[0]);
        console.log(`${isInside ? '✅' : '❌'} ${batiment.nom_etablissement}: [${point[0]}, ${point[1]}]`);
        return isInside;
      });
      
      console.log(`🎯 ${batimentsInSecteur.length} bâtiments trouvés dans le secteur:`, batimentsInSecteur.map(b => b.nom_etablissement));
      
      // Assigner chaque bâtiment au préventionniste
      let assignedCount = 0;
      for (const batiment of batimentsInSecteur) {
        try {
          await apiPut(tenantSlug, `/prevention/batiments/${batiment.id}`, {
            ...batiment,
            secteur_id: secteurId,
            preventionniste_assigne_id: preventionnisteId  // Utiliser le bon nom de champ
          });
          assignedCount++;
          console.log(`✅ Bâtiment assigné: ${batiment.nom_etablissement}`);
        } catch (err) {
          console.error(`❌ Erreur assignation ${batiment.nom_etablissement}:`, err);
        }
      }
      
      if (assignedCount > 0) {
        toast({
          title: "Assignation réussie",
          description: `${assignedCount} bâtiment(s) assigné(s) au préventionniste`
        });
      } else {
        toast({
          title: "Information",
          description: "Aucun bâtiment trouvé dans ce secteur"
        });
      }
    } catch (error) {
      console.error('Erreur assignation bâtiments:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors de l'assignation des bâtiments",
        variant: "destructive"
      });
    }
  };
  
  // Fonction pour vérifier si un point est dans un polygone (algorithme ray-casting)
  const isPointInPolygon = (point, polygon) => {
    const x = point[0], y = point[1];
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  };

  const handleDeleteSecteur = async (secteurId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce secteur ?')) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, `/prevention/secteurs/${secteurId}`);
      toast({
        title: "Succès",
        description: "Secteur supprimé"
      });
      setShowSecteurModal(false);
      setCurrentSecteur(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le secteur",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="gestion-preventionnistes">
      {/* Vue d'ensemble */}
      <div className="overview-cards">
        <div className="overview-card">
          <div className="card-icon">👨‍🚒</div>
          <div className="card-content">
            <div className="card-number">{preventionnistes.length}</div>
            <div className="card-label">Préventionnistes actifs</div>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">🏢</div>
          <div className="card-content">
            <div className="card-number">{batiments.filter(b => b.preventionniste_assigne_id).length}</div>
            <div className="card-label">Bâtiments assignés</div>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <div className="card-number">{batiments.filter(b => !b.preventionniste_assigne_id).length}</div>
            <div className="card-label">Sans préventionniste</div>
          </div>
        </div>
      </div>

      {/* Toggle Vue Liste / Secteurs */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '10px', 
        margin: '20px 0',
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <button
          onClick={() => setViewMode('list')}
          style={{
            padding: '10px 20px',
            backgroundColor: viewMode === 'list' ? '#2563eb' : '#fff',
            color: viewMode === 'list' ? '#fff' : '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: viewMode === 'list' ? 'bold' : 'normal',
            transition: 'all 0.3s'
          }}
        >
          📋 Vue Liste
        </button>
        <button
          onClick={() => {
            setViewMode('secteurs');
            setEditMode(false);
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: viewMode === 'secteurs' ? '#2563eb' : '#fff',
            color: viewMode === 'secteurs' ? '#fff' : '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: viewMode === 'secteurs' ? 'bold' : 'normal',
            transition: 'all 0.3s'
          }}
        >
          🗺️ Secteurs ({secteurs.length})
        </button>
      </div>

      {/* Vue Carte */}
      {/* Vue Secteurs */}
      {viewMode === 'secteurs' && (
        <div className="secteurs-section" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>🗺️ Gestion des Secteurs Géographiques</h3>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                padding: '8px 16px',
                backgroundColor: editMode ? '#dc2626' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {editMode ? '❌ Quitter le mode édition' : '✏️ Activer le mode édition'}
            </button>
          </div>
          
          {editMode && (
            <div style={{
              padding: '12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#1e40af' }}>
                📝 Mode édition activé
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1e40af' }}>
                <li>Cliquez sur l'icône polygone en haut à droite pour dessiner un secteur</li>
                <li>Cliquez sur l'icône crayon pour modifier un secteur existant</li>
                <li>Cliquez sur l'icône corbeille pour supprimer un secteur</li>
              </ul>
            </div>
          )}
          
          <SecteursMap
            batiments={batiments}
            secteurs={secteurs.map(s => ({
              ...s,
              preventionniste_assigne_nom: users.find(u => u.id === s.preventionniste_assigne_id)
                ? `${users.find(u => u.id === s.preventionniste_assigne_id).prenom} ${users.find(u => u.id === s.preventionniste_assigne_id).nom}`
                : null
            }))}
            center={[45.4042, -71.8929]}
            onBatimentClick={(batiment) => {
              console.log('Bâtiment cliqué:', batiment);
            }}
            onSecteurCreate={handleSecteurCreate}
            onSecteurClick={handleSecteurClick}
            editMode={editMode}
          />
          
          <p style={{ 
            marginTop: '10px', 
            fontSize: '14px', 
            color: '#666',
            textAlign: 'center'
          }}>
            {editMode ? 'Utilisez les outils en haut à droite pour créer, modifier ou supprimer des secteurs' : 'Cliquez sur un secteur pour voir ses détails'}
          </p>
          
          {/* Liste des secteurs */}
          <div style={{ marginTop: '30px' }}>
            <h4 style={{ marginBottom: '15px' }}>📋 Secteurs configurés ({secteurs.length})</h4>
            {secteurs.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                color: '#666'
              }}>
                <p>Aucun secteur créé</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  Activez le mode édition et dessinez votre premier secteur sur la carte
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {secteurs.map(secteur => {
                  const preventionniste = users.find(u => u.id === secteur.preventionniste_assigne_id);
                  return (
                    <div
                      key={secteur.id}
                      onClick={() => handleSecteurClick(secteur)}
                      style={{
                        padding: '15px',
                        borderLeft: `4px solid ${secteur.couleur || '#3b82f6'}`,
                        backgroundColor: '#fff',
                        borderRadius: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
                        {secteur.nom}
                      </h5>
                      {secteur.description && (
                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
                          {secteur.description}
                        </p>
                      )}
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>
                        {preventionniste ? (
                          <span style={{ 
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: '#d1fae5',
                            color: '#065f46',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}>
                            👨‍🚒 {preventionniste.prenom} {preventionniste.nom}
                          </span>
                        ) : (
                          <span style={{ 
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}>
                            ⚠ Sans préventionniste
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Vue Liste */}
      {viewMode === 'list' && (
        <>
          {/* Liste des préventionnistes */}
          <div className="preventionnistes-section">
        <h3>👨‍🚒 Préventionnistes Actifs</h3>
        
        {preventionnistes.length === 0 ? (
          <div className="empty-state">
            <p>Aucun préventionniste assigné</p>
            <p><small>Assignez des bâtiments aux employés pour créer des préventionnistes</small></p>
          </div>
        ) : (
          <div className="preventionnistes-grid">
            {preventionnistes.map(preventionniste => {
              const batimentsAssignes = batiments.filter(b => b.preventionniste_assigne_id === preventionniste.id);
              const stats = preventionniste.stats || {};
              const secteursAssignes = secteurs.filter(s => s.preventionniste_assigne_id === preventionniste.id);
              
              return (
                <div key={preventionniste.id} className="preventionniste-card" style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}>
                  <div className="preventionniste-header" style={{ marginBottom: '1rem' }}>
                    <div className="preventionniste-info" style={{ marginBottom: '1rem' }}>
                      <h4 style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold', 
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        👨‍🚒 {preventionniste.prenom} {preventionniste.nom}
                      </h4>
                      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                        📧 {preventionniste.email}
                      </p>
                      <span className="grade-badge" style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        marginTop: '0.5rem'
                      }}>
                        {preventionniste.grade}
                      </span>
                    </div>
                    
                    <div className="preventionniste-stats" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#3b82f6',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.batiments_assignes || batimentsAssignes.length}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Bâtiments
                        </div>
                      </div>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#10b981',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.secteurs_assignes || secteursAssignes.length}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Secteurs
                        </div>
                      </div>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#f59e0b',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.inspections_effectuees || 0}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Inspections
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="batiments-assignes">
                    <h5 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '0.75rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem'
                    }}>
                      🏢 Bâtiments assignés
                    </h5>
                    {batimentsAssignes.length === 0 ? (
                      <p className="no-batiments" style={{
                        textAlign: 'center',
                        color: '#9ca3af',
                        padding: '1rem',
                        fontStyle: 'italic'
                      }}>
                        Aucun bâtiment assigné
                      </p>
                    ) : (
                      <div className="batiments-list">
                        {batimentsAssignes.slice(0, 5).map(batiment => (
                          <div key={batiment.id} className="batiment-item" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            marginBottom: '0.5rem',
                            border: '1px solid #e5e7eb',
                            gap: '0.75rem'
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: '500',
                                color: '#1e293b',
                                marginBottom: '0.25rem'
                              }}>
                                {batiment.nom_etablissement}
                              </div>
                              <div style={{
                                fontSize: '0.8rem',
                                color: '#64748b'
                              }}>
                                📍 {batiment.adresse_civique || 'Adresse non spécifiée'}
                              </div>
                            </div>
                            <button 
                              onClick={() => handleRemoveAssignment(batiment.id)}
                              className="remove-btn"
                              title="Supprimer l'assignation"
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '1.1rem',
                                cursor: 'pointer',
                                opacity: 0.6,
                                transition: 'opacity 0.2s',
                                flexShrink: 0,
                                padding: '0.25rem',
                                lineHeight: 1
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                            >
                              ❌
                            </button>
                          </div>
                        ))}
                        {batimentsAssignes.length > 5 && (
                          <p className="more-batiments" style={{
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: '0.9rem',
                            marginTop: '0.75rem',
                            fontStyle: 'italic'
                          }}>
                            ... et {batimentsAssignes.length - 5} autre(s)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {secteursAssignes.length > 0 && (
                    <div className="secteurs-assignes" style={{ marginTop: '1rem' }}>
                      <h5 style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600',
                        color: '#1e293b',
                        marginBottom: '0.75rem',
                        borderBottom: '2px solid #e5e7eb',
                        paddingBottom: '0.5rem'
                      }}>
                        🗺️ Secteurs assignés
                      </h5>
                      <div className="secteurs-list">
                        {secteursAssignes.map(secteur => (
                          <div key={secteur.id} style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#ecfdf5',
                            borderRadius: '6px',
                            marginBottom: '0.5rem',
                            border: '1px solid #a7f3d0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ color: '#059669', fontWeight: '500' }}>
                              {secteur.nom}
                            </span>
                            {secteur.description && (
                              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                - {secteur.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

          {/* Bâtiments sans préventionniste */}
          <div className="batiments-section">
            <h3>⚠️ Bâtiments Sans Préventionniste</h3>
            
            {batiments.filter(b => !b.preventionniste_assigne_id).length === 0 ? (
              <div className="success-state">
                <p>✅ Tous les bâtiments ont un préventionniste assigné</p>
              </div>
            ) : (
              <div className="batiments-sans-preventionniste">
                {batiments
                  .filter(b => !b.preventionniste_assigne_id)
                  .slice(0, 10)
                  .map(batiment => (
                  <div key={batiment.id} className="batiment-sans-preventionniste">
                    <div className="batiment-details">
                      <h4>{batiment.nom_etablissement}</h4>
                      <p>{batiment.adresse_civique}, {batiment.ville}</p>
                      <span className="groupe-badge">{batiment.groupe_occupation}</span>
                    </div>
                    <div className="assign-actions">
                      <p><small>Besoin d'un préventionniste</small></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de configuration de secteur */}
      {showSecteurModal && (
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
          zIndex: 99999
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
              {currentSecteur ? '✏️ Modifier le secteur' : '📍 Nouveau secteur'}
            </h3>
            
            <SecteurForm
              secteur={currentSecteur}
              users={users.filter(u => u.role !== 'employe')}
              onSave={handleSaveSecteur}
              onDelete={currentSecteur ? () => handleDeleteSecteur(currentSecteur.id) : null}
              onCancel={() => {
                setShowSecteurModal(false);
                setCurrentSecteur(null);
                setPendingGeometry(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Formulaire de secteur
const SecteurForm = ({ secteur, users, onSave, onDelete, onCancel }) => {
  const [formData, setFormData] = useState({
    nom: secteur?.nom || '',
    description: secteur?.description || '',
    couleur: secteur?.couleur || '#3b82f6',
    preventionniste_assigne_id: secteur?.preventionniste_assigne_id || '',
    actif: secteur?.actif !== false
  });

  const couleursPredefinies = [
    { nom: 'Bleu', valeur: '#3b82f6' },
    { nom: 'Vert', valeur: '#10b981' },
    { nom: 'Rouge', valeur: '#ef4444' },
    { nom: 'Orange', valeur: '#f97316' },
    { nom: 'Violet', valeur: '#8b5cf6' },
    { nom: 'Rose', valeur: '#ec4899' },
    { nom: 'Jaune', valeur: '#eab308' },
    { nom: 'Cyan', valeur: '#06b6d4' }
  ];

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.nom.trim()) {
      alert('Veuillez entrer un nom pour le secteur');
      return;
    }
    
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Nom du secteur *
        </label>
        <input
          type="text"
          name="nom"
          value={formData.nom}
          onChange={handleChange}
          placeholder="Ex: Secteur Nord, Zone industrielle..."
          required
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Description
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Description du secteur..."
          rows="3"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            resize: 'vertical'
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Couleur
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {couleursPredefinies.map(c => (
            <button
              key={c.valeur}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, couleur: c.valeur }))}
              style={{
                padding: '10px',
                borderRadius: '6px',
                border: formData.couleur === c.valeur ? '3px solid #000' : '2px solid #d1d5db',
                backgroundColor: c.valeur,
                cursor: 'pointer',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              {c.nom}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
          Préventionniste assigné
        </label>
        <select
          name="preventionniste_assigne_id"
          value={formData.preventionniste_assigne_id}
          onChange={handleChange}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '14px',
            backgroundColor: '#fff'
          }}
        >
          <option value="">-- Sélectionner un préventionniste --</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.prenom} {user.nom} ({user.grade})
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            name="actif"
            checked={formData.actif}
            onChange={handleChange}
            style={{ marginRight: '8px', cursor: 'pointer' }}
          />
          Secteur actif
        </label>
      </div>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '30px' }}>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginRight: 'auto'
            }}
          >
            🗑️ Supprimer
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6b7280',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Annuler
        </button>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {secteur ? 'Mettre à jour' : 'Créer'}
        </button>
      </div>
    </form>
  );
};

const AssignerPreventionniste = ({ onAssign }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedBatiments, setSelectedBatiments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersData, batimentsData] = await Promise.all([
        apiGet(tenantSlug, '/users'),
        apiGet(tenantSlug, '/prevention/batiments')
      ]);
      
      setUsers(usersData.filter(u => u.role === 'admin' || u.role === 'superviseur'));
      setBatiments(batimentsData);
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

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const handleBatimentToggle = (batimentId) => {
    setSelectedBatiments(prev => 
      prev.includes(batimentId) 
        ? prev.filter(id => id !== batimentId)
        : [...prev, batimentId]
    );
  };

  const handleAssign = async () => {
    if (!selectedUser || selectedBatiments.length === 0) {
      toast({
        title: "Validation",
        description: "Veuillez sélectionner un préventionniste et au moins un bâtiment",
        variant: "destructive"
      });
      return;
    }

    try {
      setAssigning(true);
      
      // Assigner le préventionniste à tous les bâtiments sélectionnés
      await Promise.all(
        selectedBatiments.map(batimentId =>
          apiPut(tenantSlug, `/prevention/batiments/${batimentId}`, {
            preventionniste_assigne_id: selectedUser
          })
        )
      );

      toast({
        title: "Succès",
        description: `${selectedBatiments.length} bâtiment(s) assigné(s) avec succès`
      });

      onAssign();
    } catch (error) {
      console.error('Erreur assignation:', error);
      toast({
        title: "Erreur",
        description: "Une erreur s'est produite lors de l'assignation",
        variant: "destructive"
      });
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  const selectedUserInfo = users.find(u => u.id === selectedUser);

  return (
    <div className="assigner-preventionniste">
      <div className="assignment-steps">
        {/* Étape 1: Sélectionner préventionniste */}
        <div className="step-section">
          <h3>👤 Étape 1: Sélectionner le préventionniste</h3>
          <div className="users-grid">
            {users.map(user => (
              <label key={user.id} className="user-option">
                <input
                  type="radio"
                  name="preventionniste"
                  value={user.id}
                  checked={selectedUser === user.id}
                  onChange={(e) => setSelectedUser(e.target.value)}
                />
                <div className="user-card">
                  <div className="user-info">
                    <h4>{user.prenom} {user.nom}</h4>
                    <p>{user.email}</p>
                    <div className="user-badges">
                      <span className={`role-badge ${user.role}`}>{user.role}</span>
                      {user.grade && <span className="grade-badge">{user.grade}</span>}
                    </div>
                  </div>
                  <div className="user-stats">
                    <span className="current-assignments">
                      {batiments.filter(b => b.preventionniste_assigne_id === user.id).length} bâtiments actuels
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Étape 2: Sélectionner bâtiments */}
        {selectedUser && (
          <div className="step-section">
            <h3>🏢 Étape 2: Sélectionner les bâtiments ({selectedBatiments.length} sélectionnés)</h3>
            <div className="batiments-selection">
              {batiments
                .filter(b => !b.preventionniste_assigne_id || b.preventionniste_assigne_id === selectedUser)
                .map(batiment => (
                <label key={batiment.id} className="batiment-option">
                  <input
                    type="checkbox"
                    checked={selectedBatiments.includes(batiment.id)}
                    onChange={() => handleBatimentToggle(batiment.id)}
                  />
                  <div className="batiment-card">
                    <div className="batiment-info">
                      <h4>{batiment.nom_etablissement}</h4>
                      <p>{batiment.adresse_civique}, {batiment.ville}</p>
                      <div className="batiment-meta">
                        <span className="groupe-badge">{batiment.groupe_occupation}</span>
                        {batiment.preventionniste_assigne_id === selectedUser && (
                          <span className="assigned-badge">Déjà assigné</span>
                        )}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Résumé et confirmation */}
        {selectedUser && selectedBatiments.length > 0 && (
          <div className="step-section confirmation">
            <h3>✅ Confirmation de l'assignation</h3>
            <div className="assignment-summary">
              <div className="summary-item">
                <strong>Préventionniste:</strong> {selectedUserInfo?.prenom} {selectedUserInfo?.nom}
              </div>
              <div className="summary-item">
                <strong>Bâtiments à assigner:</strong> {selectedBatiments.length}
              </div>
            </div>

            <div className="confirmation-actions">
              <Button 
                variant="outline"
                onClick={() => {
                  setSelectedUser('');
                  setSelectedBatiments([]);
                }}
              >
                🔄 Recommencer
              </Button>
              <Button 
                onClick={handleAssign}
                disabled={assigning}
                className="confirm-btn"
              >
                {assigning ? '⏳ Assignation...' : '✅ Confirmer l\'assignation'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== COMPOSANTS INSPECTIONS ====================

// Composant d'upload de photos
const PhotoUploader = ({ photos, setPhotos, maxPhotos = 10 }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    
    if (photos.length + files.length > maxPhotos) {
      toast({
        title: "Limite atteinte",
        description: `Maximum ${maxPhotos} photos`,
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    try {
      for (const file of files) {
        // Convertir en base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result;
          
          try {
            const response = await apiPost(tenantSlug, '/prevention/upload-photo', {
              photo_base64: base64,
              filename: file.name
            });
            
            setPhotos(prev => [...prev, response.url]);
            
            toast({
              title: "Photo ajoutée",
              description: file.name
            });
          } catch (error) {
            console.error('Erreur upload:', error);
            toast({
              title: "Erreur",
              description: `Impossible d'uploader ${file.name}`,
              variant: "destructive"
            });
          }
        };
        reader.readAsDataURL(file);
      }
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="photo-uploader">
      <div className="upload-header">
        <label>📸 Photos ({photos.length}/{maxPhotos})</label>
        <input
          type="file"
          accept="image/*"
          
          multiple
          onChange={handleFileChange}
          disabled={uploading || photos.length >= maxPhotos}
          className="file-input"
          id="photo-upload"
          style={{ 
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: '0',
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: '0'
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => document.getElementById('photo-upload').click()}
          disabled={uploading || photos.length >= maxPhotos}
        >
          {uploading ? '⏳ Téléversement...' : '📷 Ajouter photos'}
        </Button>
      </div>

      {photos.length > 0 && (
        <div className="photos-grid">
          {photos.map((photoUrl, index) => (
            <div key={index} className="photo-item">
              <img 
                src={photoUrl.includes('data:') ? photoUrl : `${process.env.REACT_APP_BACKEND_URL}${photoUrl}`} 
                alt={`Photo ${index + 1}`}
                className="photo-thumbnail"
              />
              <button
                onClick={() => removePhoto(index)}
                className="remove-photo-btn"
                title="Supprimer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ListeInspections = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [inspections, setInspections] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [users, setUsers] = useState([]);
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, conforme, non_conforme

  const fetchData = async () => {
    try {
      setLoading(true);
      const [inspectionsData, batimentsData, usersData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/inspections'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/users')
      ]);
      
      setInspections(inspectionsData);
      setBatiments(batimentsData);
      setUsers(usersData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les inspections",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const getBatimentName = (batimentId) => {
    const batiment = batiments.find(b => b.id === batimentId);
    return batiment?.nom_etablissement || 'Inconnu';
  };

  const getPreventionnisteName = (userId) => {
    const preventionniste = users.find(u => u.id === userId);
    return preventionniste ? `${preventionniste.prenom} ${preventionniste.nom}` : 'Inconnu';
  };

  const handleDeleteInspection = async (inspectionId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette inspection ?')) {
      return;
    }

    try {
      await apiDelete(tenantSlug, `/prevention/inspections/${inspectionId}`);
      toast({
        title: "Succès",
        description: "Inspection supprimée avec succès",
        variant: "default"
      });
      // Recharger la liste
      fetchData();
    } catch (error) {
      console.error('Erreur suppression inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'inspection",
        variant: "destructive"
      });
    }
  };

  const filteredInspections = inspections.filter(insp => {
    if (filter === 'all') return true;
    if (filter === 'conforme') return insp.statut_global === 'conforme';
    if (filter === 'non_conforme') return insp.statut_global !== 'conforme';
    return true;
  });

  const handleDownloadPDF = async (inspectionId) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/inspections/${inspectionId}/rapport-pdf`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
        }
      });
      
      if (!response.ok) throw new Error('Erreur téléchargement');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport_inspection_${inspectionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Succès",
        description: "Rapport téléchargé"
      });
    } catch (error) {
      console.error('Erreur téléchargement PDF:', error);
      toast({
        title: "Erreur",
        description: "Impossible de télécharger le rapport",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="loading-spinner">Chargement des inspections...</div>;
  }

  return (
    <div className="inspections-container">
      <div className="page-header">
        <h2>📋 Liste des Inspections</h2>
        <Button onClick={() => setCurrentView('nouvelle-inspection')}>
          ➕ Nouvelle Inspection
        </Button>
      </div>

      <div className="inspections-filters">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Toutes ({inspections.length})
        </Button>
        <Button
          variant={filter === 'conforme' ? 'default' : 'outline'}
          onClick={() => setFilter('conforme')}
        >
          ✅ Conformes ({inspections.filter(i => i.statut_global === 'conforme').length})
        </Button>
        <Button
          variant={filter === 'non_conforme' ? 'default' : 'outline'}
          onClick={() => setFilter('non_conforme')}
        >
          ⚠️ Non-conformes ({inspections.filter(i => i.statut_global !== 'conforme').length})
        </Button>
      </div>

      {filteredInspections.length === 0 ? (
        <div className="empty-state">
          <p>Aucune inspection trouvée</p>
          <Button onClick={() => setCurrentView('nouvelle-inspection')}>
            Créer la première inspection
          </Button>
        </div>
      ) : (
        <div className="inspections-list">
          {filteredInspections.map(inspection => (
            <div key={inspection.id} className="inspection-card">
              <div className="inspection-header">
                <div>
                  <h4>{getBatimentName(inspection.batiment_id)}</h4>
                  <p className="inspection-date">{inspection.date_inspection}</p>
                </div>
                <span className={`statut-badge ${inspection.statut_global}`}>
                  {inspection.statut_global === 'conforme' ? '✅ Conforme' : '⚠️ Non-conforme'}
                </span>
              </div>
              
              <div className="inspection-details">
                <div className="detail-item">
                  <span className="label">Préventionniste:</span>
                  <span>{getPreventionnisteName(inspection.preventionniste_id)}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Type:</span>
                  <span>{inspection.type_inspection}</span>
                </div>
                <div className="detail-item">
                  <span className="label">Score:</span>
                  <span className="score">{inspection.score_conformite}%</span>
                </div>
              </div>
              
              <div className="inspection-actions">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleDownloadPDF(inspection.id)}
                >
                  📄 Rapport PDF
                </Button>
                <Button 
                  size="sm"
                  onClick={() => {
                    localStorage.setItem('detail_inspection_id', inspection.id);
                    setCurrentView('detail-inspection');
                  }}
                >
                  👁️ Voir détails
                </Button>
                {(user.role === 'admin' || user.role === 'superviseur') && (
                  <Button 
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteInspection(inspection.id)}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const NouvelleInspection = ({ setCurrentView, batiments, selectedBatiment, onBatimentSelected }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [grilles, setGrilles] = useState([]);
  const [formData, setFormData] = useState({
    batiment_id: selectedBatiment?.id || '',
    grille_inspection_id: '',
    date_inspection: new Date().toISOString().split('T')[0],
    type_inspection: 'reguliere'
  });

  // Mettre à jour le bâtiment si selectedBatiment change
  useEffect(() => {
    if (selectedBatiment?.id) {
      setFormData(prev => ({ ...prev, batiment_id: selectedBatiment.id }));
    }
  }, [selectedBatiment]);

  useEffect(() => {
    const fetchGrilles = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
        setGrilles(data);
      } catch (error) {
        console.error('Erreur chargement grilles:', error);
      }
    };
    fetchGrilles();
  }, [tenantSlug]);

  const handleSubmit = async () => {
    if (!formData.batiment_id || !formData.grille_inspection_id) {
      toast({
        title: "Validation",
        description: "Veuillez sélectionner un bâtiment et une grille",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      const inspection = await apiPost(tenantSlug, '/prevention/inspections', {
        ...formData,
        preventionniste_id: user.id,
        heure_debut: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }),
        resultats: {},
        statut_global: 'en_cours',
        score_conformite: 0
      });

      toast({
        title: "Succès",
        description: "Inspection créée"
      });

      // Rediriger vers la réalisation de l'inspection
      localStorage.setItem('current_inspection_id', inspection.id);
      setCurrentView('realiser-inspection');
    } catch (error) {
      console.error('Erreur création inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de créer l'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nouvelle-inspection-container">
      <div className="page-header">
        <h2>🔍 Nouvelle Inspection</h2>
        <Button variant="outline" onClick={() => setCurrentView('inspections')}>
          ← Retour
        </Button>
      </div>

      <div className="inspection-form">
        <div className="form-section">
          <label>Bâtiment à inspecter *</label>
          <select
            value={formData.batiment_id}
            onChange={(e) => setFormData({ ...formData, batiment_id: e.target.value })}
            className="form-select"
          >
            <option value="">-- Sélectionner un bâtiment --</option>
            {batiments.map(b => (
              <option key={b.id} value={b.id}>
                {b.nom_etablissement} - {b.adresse_civique}
              </option>
            ))}
          </select>
        </div>

        <div className="form-section">
          <label>Grille d'inspection *</label>
          <select
            value={formData.grille_inspection_id}
            onChange={(e) => setFormData({ ...formData, grille_inspection_id: e.target.value })}
            className="form-select"
          >
            <option value="">-- Sélectionner une grille --</option>
            {grilles.map(g => (
              <option key={g.id} value={g.id}>
                {g.nom} {g.groupe_occupation ? `(Groupe ${g.groupe_occupation})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="form-section">
          <label>Date d'inspection *</label>
          <input
            type="date"
            value={formData.date_inspection}
            onChange={(e) => setFormData({ ...formData, date_inspection: e.target.value })}
            className="form-input"
          />
        </div>

        <div className="form-section">
          <label>Type d'inspection</label>
          <select
            value={formData.type_inspection}
            onChange={(e) => setFormData({ ...formData, type_inspection: e.target.value })}
            className="form-select"
          >
            <option value="reguliere">Régulière</option>
            <option value="suivi">Suivi</option>
            <option value="urgence">Urgence</option>
            <option value="plainte">Suite à plainte</option>
          </select>
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={() => setCurrentView('inspections')}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Création...' : 'Démarrer l\'inspection'}
          </Button>
        </div>
      </div>
    </div>
  );
};

const RealiserInspection = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState(null);
  const [grille, setGrille] = useState(null);
  const [batiment, setBatiment] = useState(null);
  const [resultats, setResultats] = useState({});
  const [nonConformites, setNonConformites] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [notes, setNotes] = useState('');
  const [recommandations, setRecommandations] = useState('');

  useEffect(() => {
    const loadInspection = async () => {
      try {
        const inspectionId = localStorage.getItem('current_inspection_id');
        if (!inspectionId) {
          setCurrentView('inspections');
          return;
        }

        const inspData = await apiGet(tenantSlug, `/prevention/inspections/${inspectionId}`);
        setInspection(inspData);
        setResultats(inspData.resultats || {});

        const [grilleData, batimentData] = await Promise.all([
          apiGet(tenantSlug, `/prevention/grilles-inspection/${inspData.grille_inspection_id}`),
          apiGet(tenantSlug, `/prevention/batiments/${inspData.batiment_id}`)
        ]);

        setGrille(grilleData);
        setBatiment(batimentData);
      } catch (error) {
        console.error('Erreur chargement inspection:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger l'inspection",
          variant: "destructive"
        });
        // Rediriger vers la liste des inspections en cas d'erreur
        setCurrentView('inspections');
      } finally {
        setLoading(false);
      }
    };

    loadInspection();
  }, [tenantSlug]);

  const handleReponse = (sectionIndex, questionIndex, valeur) => {
    setResultats(prev => ({
      ...prev,
      [`section_${sectionIndex}_question_${questionIndex}`]: valeur
    }));
  };

  const handleSaveInspection = async (statut = 'brouillon') => {
    try {
      // Calculer le score de conformité
      const totalQuestions = grille.sections.reduce((acc, section) => acc + section.questions.length, 0);
      const reponsesConformes = Object.values(resultats).filter(r => r === 'conforme' || r === 'oui').length;
      const score = totalQuestions > 0 ? Math.round((reponsesConformes / totalQuestions) * 100) : 0;

      const statutGlobal = score >= 80 ? 'conforme' : score >= 50 ? 'partiellement_conforme' : 'non_conforme';

      await apiPut(tenantSlug, `/prevention/inspections/${inspection.id}`, {
        ...inspection,
        resultats,
        score_conformite: score,
        statut_global: statutGlobal,
        photos: photos,
        notes_inspection: notes,
        recommandations: recommandations,
        heure_fin: new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
      });

      // Créer les non-conformités si nécessaire
      for (const nc of nonConformites) {
        await apiPost(tenantSlug, '/prevention/non-conformites', {
          ...nc,
          inspection_id: inspection.id,
          batiment_id: inspection.batiment_id
        });
      }

      toast({
        title: "Succès",
        description: statut === 'brouillon' ? "Inspection sauvegardée" : "Inspection terminée"
      });

      localStorage.removeItem('current_inspection_id');
      setCurrentView('inspections');
    } catch (error) {
      console.error('Erreur sauvegarde inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder l'inspection",
        variant: "destructive"
      });
    }
  };

  const ajouterNonConformite = (sectionIndex, questionIndex, question) => {
    setNonConformites(prev => [...prev, {
      titre: question,
      section_grille: `Section ${sectionIndex + 1}`,
      description: '',
      gravite: 'moyen',
      statut: 'ouverte'
    }]);
  };

  if (loading) {
    return <div className="loading-spinner">Chargement de l'inspection...</div>;
  }

  if (!inspection || !grille || !batiment) {
    return <div>Erreur: Données manquantes</div>;
  }

  return (
    <div className="realiser-inspection-container">
      <div className="page-header">
        <div>
          <h2>🔍 Inspection en cours</h2>
          <p className="inspection-subtitle">{batiment.nom_etablissement} - {batiment.adresse_civique}</p>
        </div>
        <div className="header-actions">
          <Button variant="outline" onClick={() => handleSaveInspection('brouillon')}>
            💾 Sauvegarder brouillon
          </Button>
          <Button onClick={() => handleSaveInspection('termine')}>
            ✅ Terminer l'inspection
          </Button>
        </div>
      </div>

      <div className="grille-inspection-content">
        {grille.sections.map((section, sectionIdx) => (
          <div key={sectionIdx} className="grille-section">
            <h3>{section.titre}</h3>
            
            <div className="questions-list">
              {section.questions.map((question, questionIdx) => (
                <div key={questionIdx} className="question-item">
                  <label className="question-text">{question}</label>
                  
                  <div className="question-reponses">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name={`section_${sectionIdx}_question_${questionIdx}`}
                        value="conforme"
                        checked={resultats[`section_${sectionIdx}_question_${questionIdx}`] === 'conforme'}
                        onChange={(e) => handleReponse(sectionIdx, questionIdx, e.target.value)}
                      />
                      <span>✅ Conforme</span>
                    </label>
                    
                    <label className="radio-label">
                      <input
                        type="radio"
                        name={`section_${sectionIdx}_question_${questionIdx}`}
                        value="non_conforme"
                        checked={resultats[`section_${sectionIdx}_question_${questionIdx}`] === 'non_conforme'}
                        onChange={(e) => handleReponse(sectionIdx, questionIdx, e.target.value)}
                      />
                      <span>⚠️ Non-conforme</span>
                    </label>
                    
                    <label className="radio-label">
                      <input
                        type="radio"
                        name={`section_${sectionIdx}_question_${questionIdx}`}
                        value="na"
                        checked={resultats[`section_${sectionIdx}_question_${questionIdx}`] === 'na'}
                        onChange={(e) => handleReponse(sectionIdx, questionIdx, e.target.value)}
                      />
                      <span>⊘ N/A</span>
                    </label>
                  </div>

                  {resultats[`section_${sectionIdx}_question_${questionIdx}`] === 'non_conforme' && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => ajouterNonConformite(sectionIdx, questionIdx, question)}
                      className="add-nc-btn"
                    >
                      ➕ Ajouter non-conformité
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {nonConformites.length > 0 && (
        <div className="non-conformites-preview">
          <h3>⚠️ Non-conformités identifiées ({nonConformites.length})</h3>
          <div className="nc-list-preview">
            {nonConformites.map((nc, idx) => (
              <div key={idx} className="nc-preview-item">
                <span className="nc-number">#{idx + 1}</span>
                <span>{nc.titre}</span>
                <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="inspection-documentation">
        <div className="doc-section">
          <h3>📸 Photos de l'inspection</h3>
          <PhotoUploader photos={photos} setPhotos={setPhotos} maxPhotos={20} />
        </div>

        <div className="doc-section">
          <h3>📝 Notes d'inspection</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes, observations, commentaires..."
            className="notes-textarea"
            rows={4}
          />
        </div>

        <div className="doc-section">
          <h3>💡 Recommandations</h3>
          <textarea
            value={recommandations}
            onChange={(e) => setRecommandations(e.target.value)}
            placeholder="Recommandations pour améliorer la conformité..."
            className="notes-textarea"
            rows={4}
          />
        </div>
      </div>
    </div>
  );
};

const DetailInspection = ({ inspectionId, setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState(null);
  const [batiment, setBatiment] = useState(null);
  const [grille, setGrille] = useState(null);
  const [preventionniste, setPreventionniste] = useState(null);
  const [nonConformites, setNonConformites] = useState([]);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const inspData = await apiGet(tenantSlug, `/prevention/inspections/${inspectionId}`);
        setInspection(inspData);

        const [batData, grilleData, prevData, ncData] = await Promise.all([
          apiGet(tenantSlug, `/prevention/batiments/${inspData.batiment_id}`),
          apiGet(tenantSlug, `/prevention/grilles-inspection/${inspData.grille_inspection_id}`),
          apiGet(tenantSlug, `/users`).then(users => users.find(u => u.id === inspData.preventionniste_id)),
          apiGet(tenantSlug, `/prevention/non-conformites?inspection_id=${inspectionId}`)
        ]);

        setBatiment(batData);
        setGrille(grilleData);
        setPreventionniste(prevData);
        setNonConformites(ncData);
      } catch (error) {
        console.error('Erreur chargement détails:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les détails",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [inspectionId, tenantSlug]);

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  if (!inspection || !batiment) {
    return <div>Erreur: Données manquantes</div>;
  }

  return (
    <div className="detail-inspection-container">
      <div className="page-header">
        <h2>🔍 Détails de l'Inspection</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={() => setCurrentView('inspections')}>
            ← Retour à la liste
          </Button>
          <Button onClick={() => {
            window.open(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/inspections/${inspectionId}/rapport-pdf`, '_blank');
          }}>
            📄 Télécharger PDF
          </Button>
        </div>
      </div>

      <div className="detail-content">
        {/* Résumé */}
        <div className="detail-card">
          <h3>📊 Résumé</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <span className="label">Statut:</span>
              <span className={`statut-badge ${inspection.statut_global}`}>
                {inspection.statut_global === 'conforme' ? '✅ Conforme' : '⚠️ Non-conforme'}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">Score:</span>
              <span className="score-badge">{inspection.score_conformite}%</span>
            </div>
            <div className="summary-item">
              <span className="label">Date:</span>
              <span>{inspection.date_inspection}</span>
            </div>
            <div className="summary-item">
              <span className="label">Type:</span>
              <span>{inspection.type_inspection}</span>
            </div>
          </div>
        </div>

        {/* Bâtiment */}
        <div className="detail-card">
          <h3>🏢 Bâtiment Inspecté</h3>
          <div className="info-grid">
            <div className="info-item">
              <span className="label">Nom:</span>
              <span>{batiment.nom_etablissement}</span>
            </div>
            <div className="info-item">
              <span className="label">Adresse:</span>
              <span>{batiment.adresse_civique}, {batiment.ville}</span>
            </div>
            <div className="info-item">
              <span className="label">Groupe occupation:</span>
              <span>{batiment.groupe_occupation}</span>
            </div>
          </div>
        </div>

        {/* Préventionniste */}
        {preventionniste && (
          <div className="detail-card">
            <h3>👨‍🚒 Préventionniste</h3>
            <p><strong>{preventionniste.prenom} {preventionniste.nom}</strong></p>
            <p>{preventionniste.email}</p>
          </div>
        )}

        {/* Grille utilisée */}
        {grille && (
          <div className="detail-card">
            <h3>📋 Grille d'Inspection</h3>
            <p><strong>{grille.nom}</strong></p>
            {grille.groupe_occupation && <p>Groupe {grille.groupe_occupation}</p>}
          </div>
        )}

        {/* Non-conformités */}
        {nonConformites.length > 0 && (
          <div className="detail-card">
            <h3>⚠️ Non-Conformités ({nonConformites.length})</h3>
            <div className="nc-detail-list">
              {nonConformites.map((nc, idx) => (
                <div key={nc.id} className="nc-detail-item">
                  <div className="nc-detail-header">
                    <span className="nc-number">#{idx + 1}</span>
                    <h4>{nc.titre}</h4>
                    <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span>
                    <span className={`statut-badge ${nc.statut}`}>{nc.statut}</span>
                  </div>
                  {nc.description && <p className="nc-description">{nc.description}</p>}
                  {nc.delai_correction && (
                    <p className="nc-delai">
                      <strong>Délai:</strong> {nc.delai_correction}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {inspection.photos && inspection.photos.length > 0 && (
          <div className="detail-card">
            <h3>📸 Photos ({inspection.photos.length})</h3>
            <div className="photos-grid">
              {inspection.photos.map((photoUrl, idx) => (
                <div key={idx} className="photo-item-view">
                  <img 
                    src={photoUrl.includes('data:') ? photoUrl : `${process.env.REACT_APP_BACKEND_URL}${photoUrl}`}
                    alt={`Photo ${idx + 1}`}
                    className="photo-detail"
                    onClick={() => window.open(photoUrl, '_blank')}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {inspection.notes_inspection && (
          <div className="detail-card">
            <h3>📝 Notes d'Inspection</h3>
            <p className="note-text">{inspection.notes_inspection}</p>
          </div>
        )}

        {/* Recommandations */}
        {inspection.recommandations && (
          <div className="detail-card">
            <h3>💡 Recommandations</h3>
            <p className="note-text">{inspection.recommandations}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const GestionNonConformites = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [nonConformites, setNonConformites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchNonConformites = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/non-conformites');
        setNonConformites(data);
      } catch (error) {
        console.error('Erreur chargement non-conformités:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les non-conformités",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchNonConformites();
  }, [tenantSlug]);

  const handleUpdateStatut = async (ncId, newStatut) => {
    try {
      await apiPatch(tenantSlug, `/prevention/non-conformites/${ncId}/statut`, {
        statut: newStatut
      });

      setNonConformites(prev => 
        prev.map(nc => nc.id === ncId ? { ...nc, statut: newStatut } : nc)
      );

      toast({
        title: "Succès",
        description: "Statut mis à jour"
      });
    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive"
      });
    }
  };

  const filteredNC = nonConformites.filter(nc => {
    if (filter === 'all') return true;
    if (filter === 'ouverte') return nc.statut === 'ouverte' || nc.statut === 'en_cours';
    if (filter === 'corrigee') return nc.statut === 'corrigee' || nc.statut === 'fermee';
    return true;
  });

  if (loading) {
    return <div className="loading-spinner">Chargement...</div>;
  }

  return (
    <div className="non-conformites-container">
      <div className="page-header">
        <h2>⚠️ Gestion des Non-Conformités</h2>
      </div>

      <div className="nc-filters">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Toutes ({nonConformites.length})
        </Button>
        <Button
          variant={filter === 'ouverte' ? 'default' : 'outline'}
          onClick={() => setFilter('ouverte')}
        >
          🔴 Ouvertes ({nonConformites.filter(nc => nc.statut === 'ouverte' || nc.statut === 'en_cours').length})
        </Button>
        <Button
          variant={filter === 'corrigee' ? 'default' : 'outline'}
          onClick={() => setFilter('corrigee')}
        >
          ✅ Corrigées ({nonConformites.filter(nc => nc.statut === 'corrigee' || nc.statut === 'fermee').length})
        </Button>
      </div>

      {filteredNC.length === 0 ? (
        <div className="empty-state">
          <p>Aucune non-conformité trouvée</p>
        </div>
      ) : (
        <div className="nc-list">
          {filteredNC.map(nc => (
            <div key={nc.id} className="nc-card">
              <div className="nc-header">
                <h4>{nc.titre}</h4>
                <span className={`statut-badge ${nc.statut}`}>{nc.statut}</span>
              </div>
              
              <div className="nc-details">
                <p><strong>Description:</strong> {nc.description || 'N/A'}</p>
                <p><strong>Gravité:</strong> <span className={`gravite-badge ${nc.gravite}`}>{nc.gravite}</span></p>
                {nc.delai_correction && (
                  <p><strong>Délai correction:</strong> {nc.delai_correction}</p>
                )}
              </div>

              <div className="nc-actions">
                <select
                  value={nc.statut}
                  onChange={(e) => handleUpdateStatut(nc.id, e.target.value)}
                  className="statut-select"
                >
                  <option value="ouverte">Ouverte</option>
                  <option value="en_cours">En cours</option>
                  <option value="corrigee">Corrigée</option>
                  <option value="fermee">Fermée</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const CalendrierInspections = ({ setCurrentView, batiments, filteredBatimentId, setFilteredBatimentId }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchInspections = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/inspections');
        setInspections(data);
      } catch (error) {
        console.error('Erreur chargement inspections:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les inspections",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInspections();
  }, [tenantSlug]);

  // Filtrer les inspections par bâtiment si spécifié
  const filteredInspections = filteredBatimentId 
    ? inspections.filter(insp => insp.batiment_id === filteredBatimentId)
    : inspections;

  const filteredBatiment = filteredBatimentId ? batiments.find(b => b.id === filteredBatimentId) : null;

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const getInspectionsForDay = (day) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    return filteredInspections.filter(insp => insp.date_inspection === dateStr);
  };

  const getBatimentName = (batimentId) => {
    const batiment = batiments.find(b => b.id === batimentId);
    return batiment?.nom_etablissement || 'Inconnu';
  };

  const getSuggestedInspections = () => {
    // Bâtiments sans inspection dans les 3 derniers mois
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    return batiments.filter(batiment => {
      const batimentInspections = filteredInspections.filter(insp => insp.batiment_id === batiment.id);
      if (batimentInspections.length === 0) return true;
      
      const lastInspection = batimentInspections.sort((a, b) => 
        new Date(b.date_inspection) - new Date(a.date_inspection)
      )[0];
      
      return new Date(lastInspection.date_inspection) < threeMonthsAgo;
    });
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const today = new Date();
  const isToday = (day) => {
    return today.getDate() === day && 
           today.getMonth() === month && 
           today.getFullYear() === year;
  };

  if (loading) {
    return <div className="loading-spinner">Chargement du calendrier...</div>;
  }

  return (
    <div className="calendrier-container">
      <div className="page-header">
        <h2>📅 Calendrier des Inspections</h2>
        <Button onClick={() => setCurrentView('nouvelle-inspection')}>
          ➕ Planifier une inspection
        </Button>
      </div>

      {filteredBatiment && (
        <div style={{ 
          backgroundColor: '#eff6ff', 
          border: '2px solid #3b82f6',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>🏢 Filtré par bâtiment:</strong> {filteredBatiment.nom_etablissement || filteredBatiment.adresse_civique}
          </div>
          <Button size="sm" onClick={() => setFilteredBatimentId(null)} variant="outline">
            ❌ Retirer filtre
          </Button>
        </div>
      )}

      {/* Navigation du calendrier */}
      <div className="calendar-nav">
        <Button variant="outline" onClick={previousMonth}>
          ← Mois précédent
        </Button>
        <h3>{monthNames[month]} {year}</h3>
        <Button variant="outline" onClick={nextMonth}>
          Mois suivant →
        </Button>
      </div>

      {/* Grille du calendrier */}
      <div className="calendar-grid">
        {/* En-têtes des jours */}
        {dayNames.map(day => (
          <div key={day} className="calendar-day-header">
            {day}
          </div>
        ))}
        
        {/* Jours vides au début */}
        {Array.from({ length: startingDayOfWeek }).map((_, index) => (
          <div key={`empty-${index}`} className="calendar-day empty"></div>
        ))}
        
        {/* Jours du mois */}
        {Array.from({ length: daysInMonth }).map((_, index) => {
          const day = index + 1;
          const dayInspections = getInspectionsForDay(day);
          
          return (
            <div 
              key={day} 
              className={`calendar-day ${isToday(day) ? 'today' : ''} ${dayInspections.length > 0 ? 'has-inspections' : ''}`}
            >
              <div className="day-number">{day}</div>
              {dayInspections.length > 0 && (
                <div className="day-inspections">
                  {dayInspections.slice(0, 2).map(insp => (
                    <div 
                      key={insp.id} 
                      className={`inspection-badge ${insp.statut_global}`}
                      title={getBatimentName(insp.batiment_id)}
                    >
                      {getBatimentName(insp.batiment_id).substring(0, 15)}...
                    </div>
                  ))}
                  {dayInspections.length > 2 && (
                    <div className="more-inspections">
                      +{dayInspections.length - 2} autre(s)
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inspections à venir suggérées */}
      <div className="suggested-inspections">
        <h3>🔔 Inspections Suggérées</h3>
        <p className="subtitle">Bâtiments sans inspection depuis plus de 3 mois</p>
        
        {getSuggestedInspections().length === 0 ? (
          <div className="empty-state">
            ✅ Tous les bâtiments sont à jour dans leurs inspections
          </div>
        ) : (
          <div className="suggested-list">
            {getSuggestedInspections().slice(0, 10).map(batiment => (
              <div key={batiment.id} className="suggested-item">
                <div className="suggested-info">
                  <h4>{batiment.nom_etablissement}</h4>
                  <p>{batiment.adresse_civique}</p>
                  {batiment.groupe_occupation && (
                    <span className="groupe-badge">Groupe {batiment.groupe_occupation}</span>
                  )}
                </div>
                <Button 
                  size="sm"
                  onClick={() => {
                    // Pre-remplir le formulaire avec ce bâtiment
                    setCurrentView('nouvelle-inspection');
                  }}
                >
                  Planifier
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="calendar-legend">
        <h4>Légende</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color today-marker"></div>
            <span>Aujourd'hui</span>
          </div>
          <div className="legend-item">
            <div className="legend-color conforme"></div>
            <span>Inspection conforme</span>
          </div>
          <div className="legend-item">
            <div className="legend-color non_conforme"></div>
            <span>Inspection non-conforme</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModuleRapports = ({ setCurrentView }) => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [tendances, setTendances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchTendances = async () => {
      try {
        const data = await apiGet(tenantSlug, '/prevention/rapports/tendances');
        setTendances(data.tendances);
      } catch (error) {
        console.error('Erreur chargement tendances:', error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les tendances",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTendances();
  }, [tenantSlug]);

  const handleExport = async (type) => {
    try {
      setExporting(true);
      
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=${type}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Succès",
        description: "Export Excel téléchargé avec succès"
      });
    } catch (error) {
      console.error('Erreur export:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="loading-spinner">Chargement des rapports...</div>;
  }

  return (
    <div className="rapports-container">
      <div className="page-header">
        <h2>📊 Rapports et Analyses</h2>
      </div>

      {/* Exports Excel */}
      <div className="rapport-section">
        <h3>📥 Exports Excel</h3>
        <p className="section-description">Téléchargez vos données en format Excel pour analyses approfondies</p>
        
        <div className="export-cards">
          <div className="export-card">
            <div className="export-icon">📋</div>
            <h4>Inspections</h4>
            <p>Toutes les inspections avec dates, statuts, scores et non-conformités</p>
            <Button 
              onClick={() => handleExport('inspections')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>

          <div className="export-card">
            <div className="export-icon">🏢</div>
            <h4>Bâtiments</h4>
            <p>Liste complète des bâtiments avec informations et historiques d'inspections</p>
            <Button 
              onClick={() => handleExport('batiments')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>

          <div className="export-card">
            <div className="export-icon">⚠️</div>
            <h4>Non-Conformités</h4>
            <p>Toutes les non-conformités détectées avec statuts et délais de correction</p>
            <Button 
              onClick={() => handleExport('non_conformites')}
              disabled={exporting}
            >
              {exporting ? 'Export...' : 'Télécharger Excel'}
            </Button>
          </div>
        </div>
      </div>

      {/* Graphiques de tendances */}
      {tendances && (
        <div className="rapport-section">
          <h3>📈 Tendances sur 6 mois</h3>
          <p className="section-description">Évolution des inspections et de la conformité</p>
          
          <div className="tendances-grid">
            {/* Graphique inspections */}
            <div className="tendance-card">
              <h4>Nombre d'Inspections</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar"
                        style={{ 
                          height: `${Math.max((month.inspections_total / Math.max(...tendances.map(m => m.inspections_total))) * 100, 5)}%` 
                        }}
                        title={`${month.inspections_total} inspections`}
                      >
                        <span className="bar-value">{month.inspections_total}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique taux conformité */}
            <div className="tendance-card">
              <h4>Taux de Conformité (%)</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar conformite-bar"
                        style={{ height: `${month.taux_conformite}%` }}
                        title={`${month.taux_conformite}% conforme`}
                      >
                        <span className="bar-value">{month.taux_conformite}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique NC */}
            <div className="tendance-card">
              <h4>Nouvelles Non-Conformités</h4>
              <div className="chart-bars">
                {tendances.map((month, idx) => (
                  <div key={idx} className="chart-bar-wrapper">
                    <div className="chart-bar-label">{month.mois.split(' ')[0]}</div>
                    <div className="chart-bar-container">
                      <div 
                        className="chart-bar nc-bar"
                        style={{ 
                          height: `${Math.max((month.non_conformites_nouvelles / Math.max(...tendances.map(m => m.non_conformites_nouvelles || 1))) * 100, 5)}%` 
                        }}
                        title={`${month.non_conformites_nouvelles} NC`}
                      >
                        <span className="bar-value">{month.non_conformites_nouvelles}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tableau récapitulatif */}
      {tendances && (
        <div className="rapport-section">
          <h3>📊 Tableau Récapitulatif</h3>
          <div className="recap-table-wrapper">
            <table className="recap-table">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Inspections</th>
                  <th>Conformes</th>
                  <th>Taux Conformité</th>
                  <th>Nouvelles NC</th>
                </tr>
              </thead>
              <tbody>
                {tendances.map((month, idx) => (
                  <tr key={idx}>
                    <td>{month.mois}</td>
                    <td>{month.inspections_total}</td>
                    <td>{month.inspections_conformes}</td>
                    <td>
                      <span className={`taux-badge ${month.taux_conformite >= 80 ? 'good' : month.taux_conformite >= 50 ? 'medium' : 'bad'}`}>
                        {month.taux_conformite}%
                      </span>
                    </td>
                    <td>{month.non_conformites_nouvelles}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Module Prévention - Gestion des inspections et bâtiments


// Modal pour ajout/modification de point d'eau
const PointEauModal = ({ point, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: point?.type || 'borne_fontaine',
    numero_identification: point?.numero_identification || '',
    latitude: point?.latitude || '',
    longitude: point?.longitude || '',
    adresse: point?.adresse || '',
    ville: point?.ville || '',
    notes: point?.notes || '',
    // Champs spécifiques
    debit_gpm: point?.debit_gpm || '',
    marque: point?.marque || '',
    modele: point?.modele || '',
    etat: point?.etat || 'fonctionnel',
    etat_raccords: point?.etat_raccords || 'bon',
    accessibilite: point?.accessibilite || 'facile',
    capacite_litres: point?.capacite_litres || '',
    profondeur_metres: point?.profondeur_metres || '',
    etat_eau: point?.etat_eau || 'propre',
    type_source: point?.type_source || 'etang',
    frequence_inspection_mois: point?.frequence_inspection_mois || (point?.type === 'borne_seche' ? 6 : 12)
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (point?.id) {
        await apiPut(tenantSlug, `/points-eau/${point.id}`, formData);
        toast({
          title: "Succès",
          description: "Point d'eau modifié avec succès"
        });
      } else {
        await apiPost(tenantSlug, '/points-eau', formData);
        toast({
          title: "Succès",
          description: "Point d'eau créé avec succès"
        });
      }
      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '2rem'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
          {point ? 'Modifier' : 'Ajouter'} un point d'eau
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Type */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Type de point d'eau *
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            >
              <option value="borne_fontaine">⛲ Borne-fontaine</option>
              <option value="borne_seche">🔥 Borne sèche</option>
              <option value="point_eau_statique">💧 Point d'eau statique</option>
            </select>
          </div>

          {/* Informations de base */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                N° Identification *
              </label>
              <input
                type="text"
                value={formData.numero_identification}
                onChange={(e) => setFormData({...formData, numero_identification: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: BF-001"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Ville
              </label>
              <input
                type="text"
                value={formData.ville}
                onChange={(e) => setFormData({...formData, ville: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                placeholder="Ex: Montréal"
              />
            </div>
          </div>

          {/* Adresse */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Adresse
            </label>
            <input
              type="text"
              value={formData.adresse}
              onChange={(e) => setFormData({...formData, adresse: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              placeholder="Ex: 123 Rue Principale"
            />
          </div>

          {/* Coordonnées GPS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Latitude *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: 45.5017"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Longitude *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: -73.5673"
              />
            </div>
          </div>

          {/* Champs spécifiques selon le type */}
          {(formData.type === 'borne_fontaine' || formData.type === 'borne_seche') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Débit (GPM)
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.debit_gpm}
                  onChange={(e) => setFormData({...formData, debit_gpm: parseFloat(e.target.value)})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                  placeholder="Ex: 1000"
                />
              </div>
              {formData.type === 'borne_fontaine' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    État
                  </label>
                  <select
                    value={formData.etat}
                    onChange={(e) => setFormData({...formData, etat: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="fonctionnel">Fonctionnel</option>
                    <option value="defectueux">Défectueux</option>
                    <option value="inaccessible">Inaccessible</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {formData.type === 'borne_seche' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  État des raccords
                </label>
                <select
                  value={formData.etat_raccords}
                  onChange={(e) => setFormData({...formData, etat_raccords: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bon">Bon</option>
                  <option value="moyen">Moyen</option>
                  <option value="mauvais">Mauvais</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Accessibilité
                </label>
                <select
                  value={formData.accessibilite}
                  onChange={(e) => setFormData({...formData, accessibilite: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="facile">Facile</option>
                  <option value="difficile">Difficile</option>
                  <option value="inaccessible">Inaccessible</option>
                </select>
              </div>
            </div>
          )}

          {formData.type === 'point_eau_statique' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Type de source
                  </label>
                  <select
                    value={formData.type_source}
                    onChange={(e) => setFormData({...formData, type_source: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="etang">Étang</option>
                    <option value="bassin">Bassin</option>
                    <option value="riviere">Rivière</option>
                    <option value="lac">Lac</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Accessibilité
                  </label>
                  <select
                    value={formData.accessibilite}
                    onChange={(e) => setFormData({...formData, accessibilite: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="vehicule">Véhicule</option>
                    <option value="pied">À pied</option>
                    <option value="difficile">Difficile</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Capacité (litres)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.capacite_litres}
                    onChange={(e) => setFormData({...formData, capacite_litres: parseFloat(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Ex: 50000"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Profondeur (mètres)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.profondeur_metres}
                    onChange={(e) => setFormData({...formData, profondeur_metres: parseFloat(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Ex: 3.5"
                  />
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder="Notes additionnelles..."
            />
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Modal pour créer une inspection
const InspectionModal = ({ point, onClose, onSave }) => {
  const { user, tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    point_eau_id: point?.id || '',
    inspecteur_id: user?.id || '',
    date_inspection: new Date().toISOString().split('T')[0],
    etat_general: 'conforme',
    debit_mesure_gpm: '',
    observations: '',
    defauts_constates: [],
    actions_requises: '',
    // Champs spécifiques bornes sèches
    etat_raccords: 'bon',
    test_pression_ok: true,
    // Champs spécifiques points statiques
    niveau_eau: 'moyen',
    accessibilite_verifiee: 'vehicule'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiPost(tenantSlug, '/approvisionnement-eau/inspections', formData);
      toast({
        title: "Succès",
        description: "Inspection créée avec succès"
      });
      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '2rem'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
          Nouvelle inspection - {point?.numero_identification}
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Type: {point?.type === 'borne_fontaine' ? '⛲ Borne-fontaine' : 
                point?.type === 'borne_seche' ? '🔥 Borne sèche' : 
                '💧 Point d\'eau statique'}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Date inspection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Date d'inspection *
            </label>
            <input
              type="date"
              value={formData.date_inspection}
              onChange={(e) => setFormData({...formData, date_inspection: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            />
          </div>

          {/* État général */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              État général *
            </label>
            <select
              value={formData.etat_general}
              onChange={(e) => setFormData({...formData, etat_general: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            >
              <option value="conforme">✓ Conforme</option>
              <option value="non_conforme">⚠ Non conforme</option>
              <option value="defectueux">✗ Défectueux</option>
            </select>
          </div>

          {/* Débit mesuré */}
          {(point?.type === 'borne_fontaine' || point?.type === 'borne_seche') && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Débit mesuré (GPM)
              </label>
              <input
                type="number"
                step="any"
                value={formData.debit_mesure_gpm}
                onChange={(e) => setFormData({...formData, debit_mesure_gpm: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                placeholder="Ex: 1000"
              />
            </div>
          )}

          {/* Champs spécifiques bornes sèches */}
          {point?.type === 'borne_seche' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  État des raccords
                </label>
                <select
                  value={formData.etat_raccords}
                  onChange={(e) => setFormData({...formData, etat_raccords: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bon">Bon</option>
                  <option value="moyen">Moyen</option>
                  <option value="mauvais">Mauvais</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.test_pression_ok}
                    onChange={(e) => setFormData({...formData, test_pression_ok: e.target.checked})}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.95rem', fontWeight: '600' }}>Test de pression OK</span>
                </label>
              </div>
            </div>
          )}

          {/* Champs spécifiques points statiques */}
          {point?.type === 'point_eau_statique' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Niveau d'eau
                </label>
                <select
                  value={formData.niveau_eau}
                  onChange={(e) => setFormData({...formData, niveau_eau: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bas">Bas</option>
                  <option value="moyen">Moyen</option>
                  <option value="haut">Haut</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Accessibilité vérifiée
                </label>
                <select
                  value={formData.accessibilite_verifiee}
                  onChange={(e) => setFormData({...formData, accessibilite_verifiee: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="vehicule">Véhicule</option>
                  <option value="pied">À pied</option>
                  <option value="difficile">Difficile</option>
                </select>
              </div>
            </div>
          )}

          {/* Observations */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Observations
            </label>
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData({...formData, observations: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder="Observations générales..."
            />
          </div>

          {/* Actions requises */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Actions requises
            </label>
            <textarea
              value={formData.actions_requises}
              onChange={(e) => setFormData({...formData, actions_requises: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="Actions à entreprendre..."
            />
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#10b981',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer l\'inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// ==================== MODULE APPROVISIONNEMENT EN EAU ====================
const ApprovisionnementEau = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  
  const [currentView, setCurrentView] = useState('carte');
  const [pointsEau, setPointsEau] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showPointModal, setShowPointModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statutFilter, setStatutFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState([45.5017, -73.5673]); // Montréal par défaut
  const [mapZoom, setMapZoom] = useState(12);
  const [mapLayer, setMapLayer] = useState('plan'); // 'plan' ou 'satellite'

  // Charger les points d'eau
  const fetchPointsEau = async () => {
    try {
      setLoading(true);
      let url = '/points-eau';
      const params = new URLSearchParams();
      
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statutFilter !== 'all') params.append('etat', statutFilter);
      
      if (params.toString()) url += '?' + params.toString();
      
      const data = await apiGet(tenantSlug, url);
      setPointsEau(data);
      
      // Centrer la carte sur le premier point si disponible
      if (data.length > 0 && data[0].latitude && data[0].longitude) {
        setMapCenter([data[0].latitude, data[0].longitude]);
      }
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les points d'eau",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Charger les statistiques
  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/points-eau-statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  useEffect(() => {
    fetchPointsEau();
    fetchStats();
  }, [tenantSlug, typeFilter, statutFilter]);

  // Filtrer les points selon la recherche
  const filteredPoints = pointsEau.filter(point => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      point.numero_identification?.toLowerCase().includes(term) ||
      point.adresse?.toLowerCase().includes(term) ||
      point.ville?.toLowerCase().includes(term)
    );
  });

  // Déterminer la couleur du marqueur selon le statut
  const getMarkerColor = (statutCouleur) => {
    switch (statutCouleur) {
      case 'vert': return '#10b981';
      case 'orange': return '#f59e0b';
      case 'rouge': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  // Déterminer l'icône selon le type
  const getTypeIcon = (type) => {
    switch (type) {
      case 'borne_fontaine': return '⛲';
      case 'borne_seche': return '🔥';
      case 'point_eau_statique': return '💧';
      default: return '📍';
    }
  };

  // Obtenir l'icône Leaflet personnalisée avec badge coloré
  const getLeafletIcon = (type, statutCouleur) => {
    const iconUrls = {
      borne_fontaine: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/opwhu1ma_Borne%20fontaine.png',
      borne_seche: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/wkhxcmid_Borne%20seche.png',
      point_eau_statique: 'https://customer-assets.emergentagent.com/job_1c79b284-3589-40f0-b5e3-5fa8640320ff/artifacts/1nhnxx97_eau.png'
    };

    const badgeColor = statutCouleur === 'vert' ? '#10b981' : statutCouleur === 'jaune' ? '#f59e0b' : statutCouleur === 'rouge' ? '#ef4444' : '#6b7280';

    return L.divIcon({
      html: `
        <div style="position: relative; width: 40px; height: 40px;">
          <img src="${iconUrls[type] || iconUrls.point_eau_statique}" style="width: 40px; height: 40px;" />
          <div style="
            position: absolute;
            bottom: 0px;
            right: 0px;
            width: 14px;
            height: 14px;
            background: ${badgeColor};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      className: '',
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40]
    });
  };

  // Ouvrir le modal d'ajout/modification
  const openPointModal = (point = null) => {
    setSelectedPoint(point);
    setShowPointModal(true);
  };

  // Ouvrir le modal d'inspection
  const openInspectionModal = (point) => {
    setSelectedPoint(point);
    setShowInspectionModal(true);
  };

  // Supprimer un point
  const deletePoint = async (pointId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce point d\'eau ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/points-eau/${pointId}`);
      toast({
        title: "Succès",
        description: "Point d'eau supprimé avec succès"
      });
      fetchPointsEau();
      fetchStats();
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le point d'eau",
        variant: "destructive"
      });
    }
  };

  // Composant pour gérer le clic sur la carte
  const MapClickHandler = () => {
    const map = useMapEvents({
      click: (e) => {
        // Seulement pour admin/superviseur
        if (user?.role === 'admin' || user?.role === 'superviseur') {
          openPointModal({
            latitude: e.latlng.lat,
            longitude: e.latlng.lng,
            type: 'borne_fontaine',
            ville: 'Shefford'
          });
        }
      }
    });
    return null;
  };

  // Rendu de la carte
  const renderCarte = () => (
    <div style={{ height: 'calc(100vh - 300px)', minHeight: '500px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
      {/* Toggle Plan/Satellite */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex'
      }}>
        <button
          onClick={() => setMapLayer('plan')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'plan' ? '#3b82f6' : 'white',
            color: mapLayer === 'plan' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '8px 0 0 8px',
            borderRight: '1px solid #e5e7eb'
          }}
        >
          🗺️ Plan
        </button>
        <button
          onClick={() => setMapLayer('satellite')}
          style={{
            padding: '8px 16px',
            border: 'none',
            background: mapLayer === 'satellite' ? '#3b82f6' : 'white',
            color: mapLayer === 'satellite' ? 'white' : '#6b7280',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            borderRadius: '0 8px 8px 0'
          }}
        >
          🛰️ Satellite
        </button>
      </div>
      <MapContainer 
        center={mapCenter} 
        zoom={mapZoom} 
        style={{ height: '100%', width: '100%' }}
        whenCreated={setMap}
      >
        {mapLayer === 'plan' ? (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        ) : (
          <TileLayer
            attribution='&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        )}
        <MapClickHandler />
        {filteredPoints.map(point => (
          point.latitude && point.longitude && (
            <Marker
              key={point.id}
              position={[point.latitude, point.longitude]}
              icon={getLeafletIcon(point.type, point.statut_couleur)}
            >
              <Popup>
                <div style={{ minWidth: '250px' }}>
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '1rem' }}>
                    {getTypeIcon(point.type)} {point.numero_identification}
                  </h3>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                    <p><strong>Type:</strong> {
                      point.type === 'borne_fontaine' ? 'Borne-fontaine' :
                      point.type === 'borne_seche' ? 'Borne sèche' :
                      'Point d\'eau statique'
                    }</p>
                    {point.adresse && <p><strong>Adresse:</strong> {point.adresse}</p>}
                    {point.ville && <p><strong>Ville:</strong> {point.ville}</p>}
                    {point.debit_gpm && <p><strong>Débit:</strong> {point.debit_gpm} GPM</p>}
                    <p><strong>État:</strong> <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      background: getMarkerColor(point.statut_couleur) + '20',
                      color: getMarkerColor(point.statut_couleur)
                    }}>
                      {point.etat || 'Non défini'}
                    </span></p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        // Sur iOS, essayer d'ouvrir Apple Plans si disponible
                        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                        if (isIOS) {
                          e.preventDefault();
                          // Utiliser le schéma maps:// pour iOS
                          window.location.href = `maps://maps.apple.com/?daddr=${point.latitude},${point.longitude}&dirflg=d`;
                        }
                      }}
                      style={{
                        padding: '0.5rem',
                        background: '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        textDecoration: 'none',
                        fontWeight: '500'
                      }}
                    >
                      🗺️ Navigation GPS
                    </a>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          openPointModal(point);
                        }}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Modifier
                      </button>
                      {point.type === 'borne_seche' && (
                        <button
                          onClick={() => openInspectionModal(point)}
                          style={{
                            flex: 1,
                            padding: '0.5rem',
                            background: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          Inspecter
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );

  // Rendu de la vue liste
  const renderListe = () => (
    <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Type</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>N° Identification</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Adresse</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Débit</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>État</th>
            <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem' }}>Dernière Inspection</th>
            <th style={{ padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredPoints.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>
                Aucun point d'eau trouvé
              </td>
            </tr>
          ) : (
            filteredPoints.map(point => (
              <tr key={point.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '1rem', fontSize: '1.5rem' }}>
                  {getTypeIcon(point.type)}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: '500' }}>
                  {point.numero_identification}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.adresse || '-'}<br/>
                  <span style={{ fontSize: '0.75rem' }}>{point.ville || ''}</span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {point.debit_gpm ? `${point.debit_gpm} GPM` : '-'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    background: getMarkerColor(point.statut_couleur) + '20',
                    color: getMarkerColor(point.statut_couleur)
                  }}>
                    {point.statut_couleur === 'vert' && '✓ Conforme'}
                    {point.statut_couleur === 'orange' && '⚠ À venir'}
                    {point.statut_couleur === 'rouge' && '✗ En défaut'}
                    {point.statut_couleur === 'gris' && '◯ Non inspecté'}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  {point.date_derniere_inspection ? 
                    new Date(point.date_derniere_inspection).toLocaleDateString('fr-FR') : 
                    'Jamais'}
                </td>
                <td style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => openPointModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => openInspectionModal(point)}
                      style={{
                        padding: '0.5rem',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                      title="Inspecter"
                    >
                      📋
                    </button>
                    {(user?.role === 'admin' || user?.role === 'superviseur') && (
                      <button
                        onClick={() => deletePoint(point.id)}
                        style={{
                          padding: '0.5rem',
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1f2937' }}>
          💧 Approvisionnement en Eau
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.95rem' }}>
          Gestion des points d'eau et inspections
        </p>
      </div>

      {/* Statistiques */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⛲</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_fontaines || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes-fontaines</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔥</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.bornes_seches || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Bornes sèches</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💧</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#1f2937', marginBottom: '0.25rem' }}>
              {stats.par_type?.points_statiques || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Points statiques</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✓</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
              {stats.par_etat?.fonctionnels || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Fonctionnels</div>
          </div>
          <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.25rem' }}>
              {stats.inspections_30_jours || 0}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Inspections (30j)</div>
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      <div style={{ 
        background: 'white', 
        padding: '1rem', 
        borderRadius: '12px', 
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1rem',
        alignItems: 'center'
      }}>
        {/* Bouton Ajouter */}
        {(user?.role === 'admin' || user?.role === 'superviseur') && (
          <button
            onClick={() => openPointModal(null)}
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            ➕ Ajouter un point d'eau
          </button>
        )}

        {/* Filtre Type */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les types</option>
          <option value="borne_fontaine">Bornes-fontaines</option>
          <option value="borne_seche">Bornes sèches</option>
          <option value="point_eau_statique">Points statiques</option>
        </select>

        {/* Filtre Statut */}
        <select
          value={statutFilter}
          onChange={(e) => setStatutFilter(e.target.value)}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem',
            minWidth: '180px'
          }}
        >
          <option value="all">Tous les états</option>
          <option value="fonctionnel">Fonctionnel</option>
          <option value="defectueux">Défectueux</option>
          <option value="inaccessible">Inaccessible</option>
        </select>

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher (n°, adresse, ville)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: 1,
            minWidth: '250px',
            padding: '0.75rem',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontSize: '0.95rem'
          }}
        />

        {/* Spacer pour pousser le toggle à droite */}
        <div style={{ flex: 1, minWidth: '50px' }}></div>

        {/* Toggle Vue */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setCurrentView('carte')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'carte' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'carte' ? '#eff6ff' : 'white',
              color: currentView === 'carte' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            🗺️ Carte
          </button>
          <button
            onClick={() => setCurrentView('liste')}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              border: currentView === 'liste' ? '2px solid #3b82f6' : '1px solid #d1d5db',
              background: currentView === 'liste' ? '#eff6ff' : 'white',
              color: currentView === 'liste' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.95rem',
              whiteSpace: 'nowrap'
            }}
          >
            📋 Liste
          </button>
        </div>
      </div>

      {/* Contenu principal */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
          Chargement...
        </div>
      ) : (
        <>
          {currentView === 'carte' ? renderCarte() : renderListe()}
        </>
      )}

      {/* Modals (à implémenter avec les formulaires complets) */}
      {showPointModal && (
        <PointEauModal
          point={selectedPoint}
          onClose={() => {
            setShowPointModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            fetchPointsEau();
            fetchStats();
            setShowPointModal(false);
            setSelectedPoint(null);
          }}
        />
      )}

      {showInspectionModal && (
        <InspectionModal
          point={selectedPoint}
          onClose={() => {
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
          onSave={() => {
            fetchPointsEau();
            fetchStats();
            setShowInspectionModal(false);
            setSelectedPoint(null);
          }}
        />
      )}
    </div>
  );
};


const Prevention = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState('dashboard');
  const [batiments, setBatiments] = useState([]);
  const [stats, setStats] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [filteredBatimentId, setFilteredBatimentId] = useState(null); // Pour filtrer inspections/plans par bâtiment
  const [showBatimentModal, setShowBatimentModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(null); // Pour afficher le viewer de plan
  const [grilles, setGrilles] = useState([]);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [viewMode, setViewMode] = useState('liste'); // 'liste' ou 'carte'
  const [googleMap, setGoogleMap] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fonction pour ouvrir le modal d'un bâtiment
  const openBatimentModal = (batiment) => {
    setSelectedBatiment(batiment);
    setShowBatimentModal(true);
  };

  const fetchBatiments = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/batiments');
      setBatiments(data);
    } catch (error) {
      console.error('Erreur chargement bâtiments:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les bâtiments",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/notifications');
      setNotifications(data.notifications || []);
    } catch (error) {
      console.error('Erreur chargement notifications:', error);
    }
  };

  useEffect(() => {
    fetchBatiments();
    fetchStats();
    fetchNotifications();
    fetchGrilles();
  }, [tenantSlug]);

  const fetchGrilles = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
      setGrilles(data);
    } catch (error) {
      console.error('Erreur chargement grilles:', error);
    }
  };

  // Déterminer la grille par défaut selon le type de bâtiment
  const getDefaultGrille = (batiment) => {
    if (!grilles || grilles.length === 0) return null;
    
    // Si une seule grille, la retourner
    if (grilles.length === 1) return grilles[0];
    
    // Mapping type de bâtiment → grille
    const grilleMapping = {
      'C': 'residentiel',
      'A-1': 'residentiel',
      'A-2': 'soins',
      'B': 'soins',
      'D': 'commercial',
      'E': 'commercial',
      'F-1': 'industriel_elevé',
      'F-2': 'industriel_moyen',
      'F-3': 'industriel_faible',
      'I': 'assemblée'
    };
    
    const key = batiment.sous_groupe || batiment.groupe_occupation;
    const grilleType = grilleMapping[key];
    
    // Chercher une grille correspondante
    const grille = grilles.find(g => 
      g.nom.toLowerCase().includes(grilleType) ||
      g.type_batiment === grilleType
    );
    
    // Si pas trouvé, retourner la première grille générique
    return grille || grilles.find(g => g.nom.toLowerCase().includes('générique')) || grilles[0];
  };

  // Ouvrir le nouveau composant InspectionTerrain pour réaliser l'inspection
  const handleInspectBatiment = async (batiment) => {
    try {
      setLoading(true);
      
      // Déterminer la grille par défaut
      const grille = getDefaultGrille(batiment);
      
      if (!grille) {
        toast({
          title: "Erreur",
          description: "Aucune grille d'inspection disponible. Créez-en une dans les paramètres.",
          variant: "destructive"
        });
        return;
      }

      // Stocker les données dans localStorage pour InspectionTerrain
      localStorage.setItem('inspection_terrain_data', JSON.stringify({
        grille: grille,
        batiment: batiment,
        inspecteur_id: user.id,
        date_inspection: new Date().toISOString().split('T')[0]
      }));

      // Naviguer vers la vue inspection-terrain
      setCurrentView('inspection-terrain');

      toast({
        title: "Inspection démarrée",
        description: `Inspection pour ${batiment.nom_etablissement || batiment.adresse_civique}`
      });

    } catch (error) {
      console.error('Erreur démarrage inspection:', error);
      toast({
        title: "Erreur",
        description: "Impossible de démarrer l'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch(currentView) {
      case 'dashboard':
        return (
          <div className="prevention-dashboard">
            {/* Notifications en haut */}
            {notifications.length > 0 && (
              <div className="notifications-section">
                <h3>🔔 Notifications ({notifications.length})</h3>
                <div className="notifications-list">
                  {notifications.slice(0, 5).map(notif => (
                    <div key={notif.id} className={`notification-item priority-${notif.priority}`}>
                      <div className="notif-icon">
                        {notif.priority === 'urgent' && '🚨'}
                        {notif.priority === 'high' && '⚠️'}
                        {notif.priority === 'medium' && '📌'}
                      </div>
                      <div className="notif-content">
                        <h4>{notif.titre}</h4>
                        <p>{notif.description}</p>
                        {notif.jours_retard && (
                          <span className="notif-badge retard">{notif.jours_retard} jours de retard</span>
                        )}
                        {notif.jours_restants !== undefined && (
                          <span className="notif-badge warning">{notif.jours_restants} jours restants</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {notifications.length > 5 && (
                    <div className="more-notifications">
                      +{notifications.length - 5} notification(s) supplémentaire(s)
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-icon">🏢</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.batiments?.total || batiments.length}</div>
                  <div className="stat-label">Bâtiments</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📋</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.inspections?.total || 0}</div>
                  <div className="stat-label">Inspections totales</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⚠️</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.non_conformites?.ouvertes || 0}</div>
                  <div className="stat-label">Non-conformités ouvertes</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-content">
                  <div className="stat-number">{stats?.inspections?.taux_conformite || 100}%</div>
                  <div className="stat-label">Taux conformité</div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'batiments':
        return (
          <div className="prevention-batiments">
            <div className="page-header">
              <h2>🏢 Gestion des Bâtiments</h2>
              <div className="batiments-header-controls">
                <div className="view-mode-toggle">
                  <button
                    onClick={() => setViewMode('carte')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      background: viewMode === 'carte' ? '#fff' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: viewMode === 'carte' ? '600' : 'normal',
                      boxShadow: viewMode === 'carte' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Vue carte"
                  >
                    🗺️
                  </button>
                  <button
                    onClick={() => setViewMode('liste')}
                    style={{
                      padding: '0.5rem 1rem',
                      border: 'none',
                      background: viewMode === 'liste' ? '#fff' : 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: viewMode === 'liste' ? '600' : 'normal',
                      boxShadow: viewMode === 'liste' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.2s'
                    }}
                    title="Vue liste"
                  >
                    📋
                  </button>
                </div>
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    try {
                      setExporting(true);
                      const token = localStorage.getItem(`${tenantSlug}_token`);
                      const response = await fetch(
                        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=batiments`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                      );
                      if (!response.ok) throw new Error('Erreur export');
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `batiments_${new Date().toISOString().split('T')[0]}.xlsx`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      toast({ title: "Export réussi", description: "Le fichier Excel a été téléchargé" });
                    } catch (error) {
                      console.error('Erreur export:', error);
                      toast({ title: "Erreur", description: "Impossible d'exporter les données", variant: "destructive" });
                    } finally {
                      setExporting(false);
                    }
                  }}
                  disabled={exporting}
                >
                  {exporting ? '⏳ Export...' : '📥 Exporter Excel'}
                </Button>
                <Button onClick={() => setCurrentView('nouveau-batiment')}>
                  ➕ Nouveau Bâtiment
                </Button>
              </div>
            </div>
            
            {(() => {
              // Filtrer les bâtiments selon le rôle de l'utilisateur
              const isPreventionnisteOrAdmin = user?.est_preventionniste || user?.role === 'admin' || user?.role === 'superviseur';
              const filteredBatiments = isPreventionnisteOrAdmin 
                ? batiments 
                : batiments.filter(b => b.niveau_risque === 'Faible');
              
              if (loading) {
                return <div className="loading">Chargement des bâtiments...</div>;
              }
              
              if (batiments.length === 0) {
                return (
                  <div className="empty-state">
                    <p>Aucun bâtiment enregistré</p>
                    {isPreventionnisteOrAdmin && (
                      <Button onClick={() => setCurrentView('nouveau-batiment')}>
                        Ajouter le premier bâtiment
                      </Button>
                    )}
                  </div>
                );
              }
              
              if (filteredBatiments.length === 0 && !isPreventionnisteOrAdmin) {
                return (
                  <div className="empty-state">
                    <p>Aucun bâtiment à risque faible à inspecter</p>
                  </div>
                );
              }
              
              return viewMode === 'liste' ? (
                <div className="batiments-table" style={{background: '#fff', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'}}>
                  <table style={{width: '100%', borderCollapse: 'collapse'}}>
                    <thead>
                      <tr style={{background: '#f9fafb', borderBottom: '2px solid #e5e7eb'}}>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>📫 Adresse</th>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>🏢 Type</th>
                        <th style={{padding: '1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem'}}>📅 Dernière inspection</th>
                        <th style={{padding: '1rem', textAlign: 'center', fontWeight: '600', fontSize: '0.875rem'}}>⚡ Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatiments.map(batiment => (
                      <tr key={batiment.id} style={{borderBottom: '1px solid #e5e7eb', transition: 'background 0.2s'}} onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                        <td style={{padding: '1rem'}}>
                          <div>
                            <div style={{fontWeight: '600', marginBottom: '0.25rem'}}>{batiment.nom_etablissement || batiment.adresse_civique}</div>
                            <div style={{fontSize: '0.813rem', color: '#6b7280'}}>{batiment.ville}</div>
                          </div>
                        </td>
                        <td style={{padding: '1rem'}}>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            background: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '12px',
                            fontSize: '0.813rem',
                            fontWeight: '500'
                          }}>
                            {batiment.groupe_occupation}
                          </span>
                        </td>
                        <td style={{padding: '1rem', fontSize: '0.875rem', color: '#6b7280'}}>
                          {batiment.derniere_inspection ? new Date(batiment.derniere_inspection).toLocaleDateString('fr-FR') : 'Aucune'}
                        </td>
                        <td style={{padding: '1rem'}}>
                          <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'center'}}>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setSelectedBatiment(batiment);
                                setShowBatimentModal(true);
                              }}
                            >
                              👁️ Voir
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => {
                                setSelectedBatiment(batiment);
                                setCurrentView('nouvelle-inspection');
                              }}
                            >
                              📋 Inspecter
                            </Button>
                          </div>
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="batiments-list">
                    <div className="batiments-grid">
                      {filteredBatiments.map(batiment => (
                      <div key={batiment.id} className="batiment-card">
                        <div className="batiment-header">
                          <h4>{batiment.nom_etablissement || batiment.adresse_civique}</h4>
                          <span className="groupe-badge">{batiment.groupe_occupation}</span>
                        </div>
                        <div className="batiment-info">
                          <p>{batiment.adresse_civique}</p>
                          <p>{batiment.ville}</p>
                        </div>
                        <div className="batiment-actions">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedBatiment(batiment);
                              setShowBatimentModal(true);
                            }}
                          >
                            Voir
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => {
                              setSelectedBatiment(batiment);
                              setCurrentView('nouvelle-inspection');
                            }}
                          >
                            Inspecter
                          </Button>
                        </div>
                      </div>
                      ))}
                    </div>
                </div>
              );
            })()}
          </div>
        );
      
      case 'preventionnistes':
        return <GestionPreventionnistes />;
      
      case 'assigner-preventionniste':
        return (
          <div className="prevention-assigner">
            <div className="page-header">
              <h2>👤 Assigner un Préventionniste</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('preventionnistes')}
              >
                ← Retour
              </Button>
            </div>
            
            <AssignerPreventionniste onAssign={() => {
              setCurrentView('preventionnistes');
            }} />
          </div>
        );

      case 'grilles':
        return (
          <div className="prevention-grilles">
            <div className="page-header">
              <h2>📋 Grilles d'Inspection</h2>
              <Button onClick={() => setCurrentView('nouvelle-grille')}>
                ➕ Nouvelle Grille
              </Button>
            </div>
            
            <GrillesInspection />
          </div>
        );
      
      case 'nouvelle-grille':
        return (
          <div className="prevention-nouvelle-grille">
            <div className="page-header">
              <h2>📝 Créer une Grille d'Inspection</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('grilles')}
              >
                ← Retour aux grilles
              </Button>
            </div>
            
            <CreateGrilleInspection 
              onSave={() => setCurrentView('grilles')} 
              onViewTemplates={() => setCurrentView('grilles')}
            />
          </div>
        );

      case 'import':
        return (
          <div className="prevention-import">
            <div className="page-header">
              <h2>🏢 Importer des bâtiments</h2>
              <Button 
                variant="outline" 
                onClick={() => setCurrentView('dashboard')}
              >
                ← Retour
              </Button>
            </div>
            
            <ImportBatiments onImportComplete={() => {
              setCurrentView('batiments');
              fetchBatiments();
            }} />
          </div>
        );
      
      case 'inspections':
        return <ListeInspections setCurrentView={setCurrentView} />;
      
      case 'detail-inspection':
        return <DetailInspection inspectionId={localStorage.getItem('detail_inspection_id')} setCurrentView={setCurrentView} />;
      
      case 'nouvelle-inspection':
        return (
          <NouvelleInspection 
            setCurrentView={setCurrentView}
            batiments={batiments}
            selectedBatiment={selectedBatiment}
            onBatimentSelected={setSelectedBatiment}
          />
        );
      
      case 'realiser-inspection':
        return (
          <RealiserInspection 
            setCurrentView={setCurrentView}
          />
        );

      case 'inspection-terrain':
        // Nouveau composant d'inspection terrain (mobile-friendly)
        const inspectionData = JSON.parse(localStorage.getItem('inspection_terrain_data') || '{}');
        return (
          <InspectionTerrain
            tenantSlug={tenantSlug}
            grille={inspectionData.grille}
            batiment={inspectionData.batiment}
            onComplete={() => {
              localStorage.removeItem('inspection_terrain_data');
              setCurrentView('calendrier');
              toast({
                title: "Inspection terminée",
                description: "Les données ont été enregistrées"
              });
            }}
            onCancel={() => {
              localStorage.removeItem('inspection_terrain_data');
              setCurrentView('calendrier');
            }}
          />
        );
      
      case 'calendrier':
        return <PlanificationView 
          tenantSlug={tenantSlug}
          setCurrentView={setCurrentView}
          batiments={batiments}
          filteredBatimentId={filteredBatimentId}
          setFilteredBatimentId={setFilteredBatimentId}
          openBatimentModal={openBatimentModal}
          parametres={tenant?.config?.prevention_settings}
          user={user}
        />;
      
      case 'non-conformites':
        return <NonConformites tenantSlug={tenantSlug} toast={toast} openBatimentModal={openBatimentModal} />;
      
      case 'plans-intervention':
        console.log('🎯 Prevention - Rendu PlansIntervention avec tenantSlug:', tenantSlug);
        return <PlansIntervention tenantSlug={tenantSlug} filteredBatimentId={filteredBatimentId} setFilteredBatimentId={setFilteredBatimentId} />;
      
      case 'rapports':
        return <ModuleRapports setCurrentView={setCurrentView} />;
      
      case 'nouveau-batiment':
        // Ouvrir le modal de création de bâtiment et retourner la vue batiments
        if (!showBatimentModal) {
          setShowBatimentModal(true);
          setSelectedBatiment(null); // null pour créer un nouveau
        }
        // Retourner la vue batiments (avec le modal ouvert)
        return (
          <div className="prevention-content">
            <div className="page-header">
              <div>
                <h2>🏢 Gestion des bâtiments</h2>
                <p>Cadastre des bâtiments à risque</p>
              </div>
            </div>
            <div className="batiments-grid">
              {batiments.map(batiment => (
                <div key={batiment.id} className="batiment-card" onClick={() => {
                  setSelectedBatiment(batiment);
                  setShowBatimentModal(true);
                }}>
                  <h3>{batiment.nom_etablissement || batiment.adresse_civique}</h3>
                  <p>{batiment.adresse_civique}, {batiment.ville}</p>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'parametres':
        return (
          <ParametresPrevention 
            tenantSlug={tenantSlug} 
            currentUser={user}
            onRefreshBatiments={fetchBatiments}
            ImportBatimentsComponent={ImportBatiments}
          />
        );
      
      default:
        return <div>Vue en développement...</div>;
    }
  };

  return (
    <div className="prevention-container">
      <div className="prevention-header">
        <div className="header-content">
          <h1>🔥 Module Prévention</h1>
          <p>Gestion des inspections et de la sécurité incendie</p>
        </div>
        
        <div className="prevention-nav">
          <Button 
            variant={currentView === 'dashboard' ? 'default' : 'outline'}
            onClick={() => setCurrentView('dashboard')}
          >
            📊 Tableau de bord
          </Button>
          <Button 
            variant={currentView === 'batiments' ? 'default' : 'outline'}
            onClick={() => setCurrentView('batiments')}
          >
            🏢 Bâtiments
          </Button>
          <Button 
            variant={currentView === 'preventionnistes' ? 'default' : 'outline'}
            onClick={() => setCurrentView('preventionnistes')}
          >
            👨‍🚒 Préventionnistes
          </Button>
          <Button 
            variant={currentView === 'calendrier' ? 'default' : 'outline'}
            onClick={() => setCurrentView('calendrier')}
          >
            📅 Planification
          </Button>
          <Button 
            variant={currentView === 'non-conformites' ? 'default' : 'outline'}
            onClick={() => setCurrentView('non-conformites')}
          >
            ⚠️ Non-conformités
          </Button>
          <Button 
            variant={currentView === 'grilles' ? 'default' : 'outline'}
            onClick={() => setCurrentView('grilles')}
          >
            📋 Grilles d'Inspection
          </Button>
          <Button 
            variant={currentView === 'rapports' ? 'default' : 'outline'}
            onClick={() => setCurrentView('rapports')}
          >
            📈 Rapports
          </Button>
          <Button 
            variant={currentView === 'plans-intervention' ? 'default' : 'outline'}
            onClick={() => setCurrentView('plans-intervention')}
          >
            🗺️ Plans d'Intervention
          </Button>
          <Button 
            variant={currentView === 'parametres' ? 'default' : 'outline'}
            onClick={() => setCurrentView('parametres')}
          >
            ⚙️ Paramètres
          </Button>
        </div>
      </div>
      
      <div className="prevention-content">
        {renderContent()}
      </div>

      {/* Modal détails bâtiment moderne */}
      {showBatimentModal && (
        <Suspense fallback={<div>Chargement...</div>}>
          <BatimentDetailModal
            batiment={selectedBatiment}
            onClose={() => {
              setShowBatimentModal(false);
              setSelectedBatiment(null);
              if (currentView === 'nouveau-batiment') {
                setCurrentView('batiments');
              }
            }}
            onCreate={async (newBatimentData) => {
              try {
                await apiPost(tenantSlug, `/prevention/batiments`, newBatimentData);
                await fetchBatiments();
                setShowBatimentModal(false);
                setSelectedBatiment(null);
                setCurrentView('batiments');
                toast({
                  title: "Succès",
                  description: "Bâtiment créé avec succès"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de créer le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            onUpdate={async (updatedData) => {
              try {
                await apiPut(tenantSlug, `/prevention/batiments/${selectedBatiment.id}`, updatedData);
                await fetchBatiments();
                setSelectedBatiment(updatedData);
                toast({
                  title: "Succès",
                  description: "Bâtiment mis à jour avec succès"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de mettre à jour le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            onInspect={() => {
              setShowBatimentModal(false);
              handleInspectBatiment(selectedBatiment);
            }}
            onCreatePlan={async () => {
              try {
                // Chercher un plan d'intervention validé pour ce bâtiment
                const plans = await apiGet(tenantSlug, `/prevention/plans-intervention?batiment_id=${selectedBatiment.id}`);
                
                // Filtrer les plans validés
                const planValide = plans.find(p => p.statut === 'valide');
                
                if (planValide) {
                  // Ouvrir le plan validé en visualisation
                  setShowBatimentModal(false);
                  setSelectedPlanId(planValide.id);
                  
                  toast({
                    title: "Plan d'intervention trouvé",
                    description: `Plan ${planValide.numero_plan || planValide.id} - Statut: Validé`
                  });
                } else {
                  // Aucun plan validé trouvé
                  toast({
                    title: "Aucun plan d'intervention",
                    description: "Aucun plan validé pour ce bâtiment",
                    variant: "destructive"
                  });
                }
              } catch (error) {
                console.error('Erreur récupération plan:', error);
                toast({
                  title: "Erreur",
                  description: "Impossible de récupérer les plans d'intervention",
                  variant: "destructive"
                });
              }
            }}
            onViewHistory={() => {
              setShowBatimentModal(false);
              setFilteredBatimentId(selectedBatiment.id); // Filtrer par ce bâtiment
              setCurrentView('calendrier'); // Vue calendrier dans planification
              
              toast({
                title: "Historique",
                description: `Affichage des inspections pour ${selectedBatiment.nom_etablissement || selectedBatiment.adresse_civique}`
              });
            }}
            onGenerateReport={async () => {
              try {
                toast({
                  title: "Génération en cours",
                  description: "Téléchargement du rapport PDF..."
                });
                
                const response = await fetch(
                  buildApiUrl(tenantSlug, `/prevention/batiments/${selectedBatiment.id}/rapport-pdf`),
                  {
                    headers: {
                      'Authorization': `Bearer ${getTenantToken()}`
                    }
                  }
                );
                
                if (!response.ok) throw new Error('Erreur génération rapport');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `rapport_${selectedBatiment.nom_etablissement || 'batiment'}_${new Date().toISOString().split('T')[0]}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                toast({
                  title: "Rapport généré",
                  description: "Le PDF a été téléchargé avec succès",
                  variant: "success"
                });
              } catch (error) {
                console.error('Erreur génération rapport:', error);
                toast({
                  title: "Erreur",
                  description: "Impossible de générer le rapport",
                  variant: "destructive"
                });
              }
            }}
            onDelete={async () => {
              if (!window.confirm(`Supprimer le bâtiment ${selectedBatiment.nom_etablissement || selectedBatiment.adresse_civique}?`)) {
                return;
              }
              try {
                await apiDelete(tenantSlug, `/prevention/batiments/${selectedBatiment.id}`);
                await fetchBatiments();
                setShowBatimentModal(false);
                setSelectedBatiment(null);
                toast({
                  title: "Succès",
                  description: "Bâtiment supprimé"
                });
              } catch (error) {
                toast({
                  title: "Erreur",
                  description: "Impossible de supprimer le bâtiment",
                  variant: "destructive"
                });
              }
            }}
            canEdit={['admin', 'superviseur', 'preventionniste'].includes(user?.role)}
            tenantSlug={tenantSlug}
          />
        </Suspense>
      )}

      {/* Viewer pour plan d'intervention */}
      {selectedPlanId && (
        <Suspense fallback={<div>Chargement...</div>}>
          <PlanInterventionViewer
            planId={selectedPlanId}
            tenantSlug={tenantSlug}
            onClose={() => setSelectedPlanId(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

// Main Application Layout
const AppLayout = () => {
  // Persister la page active dans localStorage pour conserver après refresh
  const [currentPage, setCurrentPage] = useState(() => {
    const savedPage = localStorage.getItem('currentPage');
    return savedPage || 'dashboard';
  });
  const [managingUserDisponibilites, setManagingUserDisponibilites] = useState(null);
  const [personnalisation, setPersonnalisation] = useState({
    logo_url: '',
    nom_service: '',
    afficher_profiremanager: true
  });
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();

  // Sauvegarder la page active dans localStorage à chaque changement
  useEffect(() => {
    if (currentPage) {
      localStorage.setItem('currentPage', currentPage);
    }
  }, [currentPage]);

  // Charger la personnalisation
  useEffect(() => {
    const loadPersonnalisation = async () => {
      try {
        const response = await axios.get(`${API}/${tenantSlug}/personnalisation`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem(getStorageKey('token', tenantSlug))}`
          }
        });
        setPersonnalisation(response.data);
      } catch (error) {
        console.error('Erreur chargement personnalisation:', error);
      }
    };

    if (tenantSlug && user) {
      loadPersonnalisation();
    }
  }, [tenantSlug, user]);

  // Détecter si l'utilisateur vient d'un QR code et rediriger vers le bon module
  useEffect(() => {
    const qrActionData = localStorage.getItem('qr_action');
    console.log('🔍 AppLayout - Vérification qr_action:', qrActionData);
    
    if (qrActionData) {
      try {
        const qrAction = JSON.parse(qrActionData);
        console.log('✅ AppLayout - QR Action trouvée:', qrAction);
        
        if (qrAction.action === 'ronde_securite') {
          console.log('🚀 AppLayout - Changement de page vers actifs');
          setCurrentPage('actifs');
        }
        // Ne pas supprimer ici, laisser GestionActifs le faire après avoir ouvert le modal
      } catch (err) {
        console.error('❌ AppLayout - Erreur parsing qr_action:', err);
        localStorage.removeItem('qr_action');
      }
    }
  }, [user]);

  // Détecter si l'utilisateur vient d'un lien email et rediriger vers la bonne page
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const pageParam = urlParams.get('page');
    const vehiculeIdParam = urlParams.get('vehicule_id');
    
    console.log('🔍 AppLayout - Vérification paramètres URL:', { page: pageParam, vehicule_id: vehiculeIdParam });
    
    if (pageParam && user) {
      console.log('✅ AppLayout - Navigation vers:', pageParam);
      setCurrentPage(pageParam);
      
      // Nettoyer l'URL pour éviter les rechargements avec les paramètres
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [user]);

  // Enregistrer le Service Worker PWA et le manifest dynamique
  useEffect(() => {
    if ('serviceWorker' in navigator && tenantSlug) {
      // Enregistrer le Service Worker
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('✅ Service Worker enregistré:', registration.scope);
        })
        .catch((error) => {
          console.log('❌ Erreur Service Worker:', error);
        });

      // Mettre à jour le manifest dynamique
      const manifestLink = document.querySelector('link[rel="manifest"]');
      if (manifestLink) {
        manifestLink.href = `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/manifest.json`;
      } else {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/manifest.json`;
        document.head.appendChild(link);
      }
    }
  }, [tenantSlug]);

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'personnel':
        return <Personnel 
          setCurrentPage={setCurrentPage}
          setManagingUserDisponibilites={setManagingUserDisponibilites}
        />;
      case 'actifs':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <GestionActifs user={user} ModuleEPI={ModuleEPI} />
          </Suspense>
        );
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
      case 'prevention':
        return <Prevention />;
      case 'rapports':
        return <Rapports />;
      case 'parametres':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Parametres user={user} tenantSlug={tenantSlug} />
          </Suspense>
        );
      case 'maintenance':
        return (
          <div className="maintenance-page" style={{padding: '2rem'}}>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">🔧 Maintenance - Outils Système</CardTitle>
                <p className="text-sm text-gray-600 mt-2">
                  Outils réservés aux super-administrateurs pour maintenir l'intégrité des données
                </p>
              </CardHeader>
              <CardContent>
                <div className="maintenance-tools" style={{display: 'flex', flexDirection: 'column', gap: '1.5rem'}}>
                  
                  {/* Outil 1: Nettoyage des assignations invalides */}
                  <div className="tool-card" style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    backgroundColor: '#fef3c7'
                  }}>
                    <h3 style={{fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem'}}>
                      🗑️ Nettoyage des Assignations Invalides
                    </h3>
                    <p style={{color: '#6b7280', marginBottom: '1rem'}}>
                      Supprime automatiquement les assignations qui ne respectent pas les jours d'application de leur type de garde.
                    </p>
                    <ul style={{color: '#6b7280', marginBottom: '1rem', paddingLeft: '1.5rem'}}>
                      <li>Exemple: "Garde WE" assignée un mardi</li>
                      <li>Utile après importation de données ou bug système</li>
                      <li>Analyse d'abord, puis demande confirmation</li>
                    </ul>
                    <Button 
                      onClick={handleNettoyerAssignationsInvalides}
                      style={{background: '#F59E0B'}}
                    >
                      🗑️ Analyser et Nettoyer
                    </Button>
                  </div>
                  
                  {/* Espace pour futurs outils */}
                  <div className="tool-card" style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    backgroundColor: '#f3f4f6',
                    opacity: 0.6
                  }}>
                    <h3 style={{fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem'}}>
                      📊 Autres Outils (À venir)
                    </h3>
                    <p style={{color: '#6b7280'}}>
                      D'autres outils de maintenance seront ajoutés ici au besoin.
                    </p>
                  </div>
                  
                </div>
              </CardContent>
            </Card>
          </div>
        );
      case 'mesepi':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <MesEPI user={user} />
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
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        tenant={tenant}
        personnalisation={personnalisation}
      />
      <main className="main-content">
        <div className="main-header" style={{
          padding: '1rem 2rem',
          backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {personnalisation.logo_url && (
              <img 
                src={personnalisation.logo_url} 
                alt="Logo du service" 
                style={{ height: '50px', maxWidth: '200px', objectFit: 'contain' }}
              />
            )}
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>
                {personnalisation.nom_service || tenant?.nom || 'ProFireManager'}
              </h1>
            </div>
          </div>
        </div>
        {renderCurrentPage()}
      </main>
    </div>
  );
};

// Main App Component
const App = () => {
  const { user, tenant, loading, logout } = useAuth();
  const { isSuperAdmin, tenantSlug } = useTenant();

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
      {user && <OfflineManager tenant={tenant} />}
      {/* PWAInstallPrompt désactivé - app native disponible */}
      {user ? <AppLayout /> : <Login />}
      <Toaster />
    </div>
  );
};

// Root App with Providers
const AppWithProviders = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes spécifiques QR - DOIT être avant les routes avec paramètres */}
        <Route path="/qr/:tenantSlug/vehicule/:vehiculeId" element={
          <VehiculeQRAction />
        } />
        {/* Route spéciale pour installation PWA sur iOS */}
        <Route path="/pwa/:tenantSlug" element={<PWARedirect />} />
        <Route path="/:tenant/reset-password" element={
          <AuthProvider>
            <ResetPassword />
            <Toaster />
          </AuthProvider>
        } />
        <Route path="*" element={
          <AuthProvider>
            <App />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
};

export default AppWithProviders;