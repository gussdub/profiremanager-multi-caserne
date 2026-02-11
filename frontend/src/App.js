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
import RemplacementResultat from './components/RemplacementResultat';
import RemplacementChoix from './components/RemplacementChoix';
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
const MonProfil = lazy(() => import("./components/MonProfil"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const Sidebar = lazy(() => import("./components/Sidebar"));
const Rapports = lazy(() => import("./components/Rapports"));
const Prevention = lazy(() => import("./components/Prevention"));
const ApprovisionnementEau = lazy(() => import("./components/ApprovisionnementEau"));
const GestionPreventionnistes = lazy(() => import("./components/GestionPreventionnistes"));
const ImportBatiments = lazy(() => import("./components/ImportBatiments"));
const AuthComponentsModule = lazy(() => import("./components/AuthComponents"));
const GrillesInspectionModule = lazy(() => import("./components/GrillesInspectionComponents"));
const InspectionComponentsModule = lazy(() => import("./components/InspectionComponents"));
const PointEauModalsModule = lazy(() => import("./components/PointEauModals"));
// Import individual components from extracted modules
const GrillesInspection = lazy(() => import("./components/GrillesInspectionComponents").then(m => ({ default: m.GrillesInspection })));
const EditerGrille = lazy(() => import("./components/GrillesInspectionComponents").then(m => ({ default: m.EditerGrille })));
const CreateGrilleInspection = lazy(() => import("./components/GrillesInspectionComponents").then(m => ({ default: m.CreateGrilleInspection })));
const ListeInspections = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.ListeInspections })));
const NouvelleInspection = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.NouvelleInspection })));
const RealiserInspection = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.RealiserInspection })));
const DetailInspection = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.DetailInspection })));
const GestionNonConformites = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.GestionNonConformites })));
const CalendrierInspections = lazy(() => import("./components/InspectionComponents").then(m => ({ default: m.CalendrierInspections })));
const ModuleRapports = lazy(() => import("./components/ModuleRapports"));
const PointEauModal = lazy(() => import("./components/PointEauModals").then(m => ({ default: m.PointEauModal })));
const InspectionModal = lazy(() => import("./components/PointEauModals").then(m => ({ default: m.InspectionModal })));
// Import auth components
const AssignerPreventionniste = lazy(() => import("./components/MapComponents").then(m => ({ default: m.AssignerPreventionniste })));
const Login = lazy(() => import("./components/AuthComponents").then(module => ({ default: module.Login })));
const ForgotPassword = lazy(() => import("./components/AuthComponents").then(module => ({ default: module.ForgotPassword })));
const ResetPassword = lazy(() => import("./components/AuthComponents").then(module => ({ default: module.ResetPassword })));
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
const GestionInterventions = lazy(() => import("./components/GestionInterventions"));
const PlanInterventionViewer = lazy(() => import("./components/PlanInterventionViewer"));
const ParametresPrevention = lazy(() => import("./components/ParametresPrevention"));
const PlanificationView = lazy(() => import("./components/PlanificationView"));
const CartePlanification = lazy(() => import("./components/CartePlanification"));
const NonConformites = lazy(() => import("./components/NonConformites"));
const InspectionTerrain = lazy(() => import("./components/InspectionTerrain"));
const ModulePaie = lazy(() => import("./components/ModulePaie"));
const DSIComplianceDashboard = lazy(() => import("./components/DSIComplianceDashboard"));
const EmailsHistory = lazy(() => import("./components/EmailsHistory"));
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
    
    if (qrActionData) {
      try {
        const qrAction = JSON.parse(qrActionData);
        
        // Rediriger vers la page actifs pour ronde_securite OU inventaire
        if (qrAction.action === 'ronde_securite' || qrAction.action === 'inventaire') {
          console.log('🚀 AppLayout - Changement de page vers actifs pour action:', qrAction.action);
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
    
    if (pageParam && user) {
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

      // Écouter les messages du Service Worker (pour la navigation depuis notifications)
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[App] Message du Service Worker:', event.data);
        if (event.data && event.data.type === 'NAVIGATE') {
          const url = event.data.url || '';
          const data = event.data.data || {};
          
          // Parser l'URL pour déterminer la page
          const urlParts = url.split('/').filter(Boolean);
          const pageName = urlParts[1] || urlParts[0] || '';
          
          // Navigation vers la bonne page
          if (pageName === 'remplacements' || url.includes('/remplacements')) {
            setCurrentPage('remplacements');
          } else if (pageName === 'actifs' || url.includes('/actifs')) {
            setCurrentPage('actifs');
          } else if (pageName === 'epi' || url.includes('/epi')) {
            setCurrentPage('actifs'); // EPI est dans gestion des actifs
          } else if (pageName === 'dashboard' || url.includes('/dashboard')) {
            setCurrentPage('dashboard');
          } else if (pageName === 'planning' || url.includes('/planning')) {
            setCurrentPage('planning');
          } else if (pageName === 'prevention' || url.includes('/prevention')) {
            setCurrentPage('prevention');
          }
          
          console.log('[App] Navigation vers:', pageName);
        }
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
        return <Dashboard setCurrentPage={setCurrentPage} />;
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
      case 'interventions':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <GestionInterventions user={user} tenantSlug={tenantSlug} />
          </Suspense>
        );
      case 'paie':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <ModulePaie tenant={tenantSlug} />
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
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Prevention />
          </Suspense>
        );
      case 'rapports':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Rapports />
          </Suspense>
        );
      case 'parametres':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <Parametres user={user} tenantSlug={tenantSlug} />
          </Suspense>
        );
      case 'mesepi':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <MesEPI user={user} />
          </Suspense>
        );
      case 'monprofil':
        return <MonProfil />;
      case 'emails-history':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <EmailsHistory />
          </Suspense>
        );
      default:
        return <Dashboard setCurrentPage={setCurrentPage} />;
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
        {/* Route pour résultat d'action remplacement via email */}
        <Route path="/remplacement-resultat" element={<RemplacementResultat />} />
        {/* Route pour choix accepter/refuser via SMS */}
        <Route path="/remplacement-choix" element={<RemplacementChoix />} />
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