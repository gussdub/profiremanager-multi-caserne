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
        {/* Route pour résultat d'action remplacement via email */}
        <Route path="/remplacement-resultat" element={<RemplacementResultat />} />
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