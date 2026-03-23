import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

// Fonction utilitaire pour obtenir la date locale au format YYYY-MM-DD (sans décalage timezone)
const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Lazy load sub-components  
const PlansIntervention = lazy(() => import('./PlansIntervention'));
const ParametresPrevention = lazy(() => import('./ParametresPrevention'));
const NonConformites = lazy(() => import('./NonConformites'));
const InspectionTerrain = lazy(() => import('./InspectionTerrain'));
const PlanificationView = lazy(() => import('./PlanificationView'));
const BatimentDetailModal = lazy(() => import('./BatimentDetailModalNew'));
const ParametresRefViolations = lazy(() => import('./ParametresRefViolations'));
const AvisNonConformiteModule = lazy(() => import('./AvisNonConformite'));
const InspectionsAValider = lazy(() => import('./InspectionsAValider'));
const GestionPreventionnistes = lazy(() => import('./GestionPreventionnistes'));
const ImportBatiments = lazy(() => import('./ImportBatiments'));
const ModuleRapports = lazy(() => import('./ModuleRapports'));
const GrillesInspection = lazy(() => import('./GrillesInspectionComponents'));
const CreateGrilleInspection = lazy(() => import('./GrillesInspectionComponents').then(m => ({ default: m.CreateGrilleInspection })));
const ListeInspections = lazy(() => import('./InspectionComponents').then(m => ({ default: m.ListeInspections })));
const NouvelleInspection = lazy(() => import('./InspectionComponents').then(m => ({ default: m.NouvelleInspection })));
const RealiserInspection = lazy(() => import('./InspectionComponents').then(m => ({ default: m.RealiserInspection })));
const DetailInspection = lazy(() => import('./InspectionComponents').then(m => ({ default: m.DetailInspection })));
const AssignerPreventionniste = lazy(() => import('./MapComponents').then(m => ({ default: m.AssignerPreventionniste })));
const CarteBatiments = lazy(() => import('./CarteBatiments'));

// Loading component
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loading-spinner"></div>
    <p>Chargement du module...</p>
  </div>
);

const Prevention = () => {
  const { user, tenant } = useAuth();
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
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
  
  // États pour la recherche et les filtres des bâtiments
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    statut: '', // '', 'a_inspecter', 'en_attente', 'valide'
    planIntervention: '', // '', 'avec', 'sans'
    categorie: '', // '', 'A', 'B', 'C', 'D', 'E', 'F', 'I'
    preventionniste: '', // '', 'id_du_preventionniste'
    niveauRisque: '', // '', 'Faible', 'Moyen', 'Élevé', 'Très élevé'
    derniereInspection: '', // '', 'jamais', '3mois', '6mois', '12mois'
    dependances: '' // '', 'avec', 'sans'
  });
  const [preventionnistes, setPreventionnistes] = useState([]);
  
  // État pour stocker le nombre de dépendances par bâtiment
  const [dependancesCounts, setDependancesCounts] = useState({});

  // Mapping des codes de groupe d'occupation vers leurs noms complets
  const GROUPES_OCCUPATION = {
    'A': 'Groupe A - Établissements de Réunion',
    'B': 'Groupe B - Soins et Détention',
    'C': 'Groupe C - Habitations',
    'D': 'Groupe D - Établissements d\'Affaires',
    'E': 'Groupe E - Établissements Commerciaux',
    'F': 'Groupe F - Établissements Industriels',
    'I': 'Groupe I - Établissements Industriels à risques'
  };

  // Fonction pour formater le groupe d'occupation
  const formatGroupeOccupation = (groupe) => {
    if (!groupe) return 'Non défini';
    // Si c'est déjà un format complet (contient "Groupe"), le retourner tel quel
    if (groupe.includes('Groupe')) return groupe;
    // Si c'est juste une lettre, chercher dans le mapping
    const letter = groupe.charAt(0).toUpperCase();
    return GROUPES_OCCUPATION[letter] || groupe;
  };

  // Fonction pour ouvrir un bâtiment - redirige vers le module Bâtiments
  const openBatimentModal = (batiment) => {
    // Rediriger vers le module Bâtiments avec l'ID du bâtiment
    window.location.href = `/${tenantSlug}/batiments?id=${batiment.id}`;
  };

  // État pour stocker les IDs de bâtiments ayant un plan
  const [batimentsAvecPlan, setBatimentsAvecPlan] = useState(new Set());

  const fetchBatiments = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/batiments');
      setBatiments(data);
      
      // Charger aussi les plans pour savoir quels bâtiments en ont
      try {
        const plans = await apiGet(tenantSlug, '/prevention/plans-intervention');
        const batimentIdsAvecPlan = new Set((plans || []).map(p => p.batiment_id).filter(Boolean));
        setBatimentsAvecPlan(batimentIdsAvecPlan);
      } catch (e) {
        console.log('Pas de plans chargés');
      }
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

  // Charger le comptage de dépendances pour tous les bâtiments
  const fetchDependancesCounts = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/dependances-count');
      setDependancesCounts(data || {});
    } catch (error) {
      console.error('Erreur chargement comptage dépendances:', error);
    }
  };

  useEffect(() => {
    fetchBatiments();
    fetchStats();
    fetchNotifications();
    fetchGrilles();
    fetchPreventionnistes();
    fetchDependancesCounts();
  }, [tenantSlug]);

  const fetchPreventionnistes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/users');
      const prevs = (data || []).filter(e => e.est_preventionniste || e.role === 'admin' || e.role === 'superviseur');
      setPreventionnistes(prevs);
    } catch (error) {
      console.error('Erreur chargement préventionnistes:', error);
    }
  };

  // Fonction de filtrage des bâtiments
  const getFilteredBatiments = () => {
    const isPreventionnisteOrAdmin = user?.est_preventionniste || user?.role === 'admin' || user?.role === 'superviseur';
    
    let filtered = isPreventionnisteOrAdmin 
      ? batiments 
      : batiments.filter(b => b.niveau_risque === 'Faible');

    // Recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(b => 
        (b.adresse_civique || '').toLowerCase().includes(query) ||
        (b.ville || '').toLowerCase().includes(query) ||
        (b.nom || '').toLowerCase().includes(query) ||
        (b.nom_etablissement || '').toLowerCase().includes(query) ||
        (b.code_postal || '').toLowerCase().includes(query)
      );
    }

    // Filtre par statut
    if (filters.statut) {
      filtered = filtered.filter(b => {
        const hasInspection = b.derniere_inspection_date;
        const inspectionStatus = b.derniere_inspection_statut;
        
        switch (filters.statut) {
          case 'a_inspecter':
            return !hasInspection || inspectionStatus === 'expire';
          case 'en_attente':
            return inspectionStatus === 'en_attente_validation';
          case 'valide':
            return inspectionStatus === 'valide' || inspectionStatus === 'conforme';
          default:
            return true;
        }
      });
    }

    // Filtre par plan d'intervention
    if (filters.planIntervention) {
      filtered = filtered.filter(b => {
        const hasPlan = batimentsAvecPlan.has(b.id) || b.plan_intervention_id || b.has_plan_intervention;
        return filters.planIntervention === 'avec' ? hasPlan : !hasPlan;
      });
    }

    // Filtre par catégorie/groupe d'occupation
    if (filters.categorie) {
      filtered = filtered.filter(b => b.groupe_occupation === filters.categorie);
    }

    // Filtre par préventionniste assigné
    if (filters.preventionniste) {
      filtered = filtered.filter(b => b.preventionniste_assigne_id === filters.preventionniste);
    }

    // Filtre par niveau de risque
    // Inclut les bâtiments dont le niveau de risque correspond OU dont une dépendance a ce niveau
    if (filters.niveauRisque) {
      const risqueFilter = filters.niveauRisque.toLowerCase().replace('é', 'e').replace('è', 'e');
      filtered = filtered.filter(b => {
        // Le bâtiment lui-même correspond
        if (b.niveau_risque === filters.niveauRisque) return true;
        
        // Une de ses dépendances correspond
        const depInfo = dependancesCounts[b.id];
        if (depInfo && depInfo.par_risque) {
          // Vérifier si une dépendance a ce niveau de risque
          for (const [risque, count] of Object.entries(depInfo.par_risque)) {
            if (count > 0 && risque.toLowerCase().includes(risqueFilter.replace('très ', 'tres_'))) {
              return true;
            }
          }
        }
        return false;
      });
    }

    // Filtre par date de dernière inspection
    if (filters.derniereInspection) {
      const now = new Date();
      filtered = filtered.filter(b => {
        if (filters.derniereInspection === 'jamais') {
          return !b.derniere_inspection_date;
        }
        
        if (!b.derniere_inspection_date) return false;
        
        const lastInspection = new Date(b.derniere_inspection_date);
        const monthsAgo = (now - lastInspection) / (1000 * 60 * 60 * 24 * 30);
        
        switch (filters.derniereInspection) {
          case '3mois':
            return monthsAgo > 3;
          case '6mois':
            return monthsAgo > 6;
          case '12mois':
            return monthsAgo > 12;
          default:
            return true;
        }
      });
    }

    // Filtre par dépendances
    if (filters.dependances) {
      filtered = filtered.filter(b => {
        const depInfo = dependancesCounts[b.id];
        const hasDependances = depInfo && depInfo.total > 0;
        return filters.dependances === 'avec' ? hasDependances : !hasDependances;
      });
    }

    return filtered;
  };

  // Réinitialiser les filtres
  const resetFilters = () => {
    setSearchQuery('');
    setFilters({
      statut: '',
      planIntervention: '',
      categorie: '',
      preventionniste: '',
      niveauRisque: '',
      derniereInspection: '',
      dependances: ''
    });
  };

  // Vérifier si des filtres sont actifs
  const hasActiveFilters = searchQuery.trim() || Object.values(filters).some(v => v !== '');

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
    
    // Récupérer le groupe d'occupation du bâtiment (ex: "C", "A", "B", etc.)
    const groupeOccupation = batiment.groupe_occupation;
    const sousType = batiment.sous_type_batiment;
    
    if (groupeOccupation) {
      // D'abord, chercher une grille qui correspond au sous-type spécifique (ex: "A-1", "F-2")
      if (sousType) {
        const grilleSousType = grilles.find(g => 
          g.groupe_occupation === sousType ||
          g.nom?.toLowerCase().includes(sousType.toLowerCase())
        );
        if (grilleSousType) return grilleSousType;
      }
      
      // Sinon, chercher une grille qui correspond au groupe principal (ex: "C", "A", "B")
      const grilleGroupe = grilles.find(g => 
        g.groupe_occupation === groupeOccupation ||
        g.nom?.toLowerCase().includes(`groupe ${groupeOccupation.toLowerCase()}`)
      );
      if (grilleGroupe) return grilleGroupe;
    }
    
    // Si pas trouvé, retourner la première grille générique ou la première disponible
    return grilles.find(g => g.nom?.toLowerCase().includes('générique')) || grilles[0];
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
        date_inspection: getLocalDateString()
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
                <div className="stat-icon">🏠</div>
                <div className="stat-content">
                  <div className="stat-number">
                    {Object.values(dependancesCounts).reduce((acc, dep) => acc + (dep?.total || 0), 0)}
                  </div>
                  <div className="stat-label">Dépendances</div>
                </div>
              </div>
              <div className="stat-card" style={{background: '#fef3c7', borderColor: '#fcd34d'}}>
                <div className="stat-icon">📊</div>
                <div className="stat-content">
                  <div className="stat-number">
                    {(stats?.batiments?.total || batiments.length) + Object.values(dependancesCounts).reduce((acc, dep) => acc + (dep?.total || 0), 0)}
                  </div>
                  <div className="stat-label">Total visites à planifier</div>
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
      
      case 'preventionnistes':
        return <GestionPreventionnistes />;
      
      case 'a-valider':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <InspectionsAValider 
              tenantSlug={tenantSlug} 
              toast={toast} 
              currentUser={user}
            />
          </Suspense>
        );
      
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
              // Rediriger vers le module Bâtiments après import
              window.location.href = `/${tenantSlug}/batiments`;
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
            currentUser={user}
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
      
      case 'parametres':
        return (
          <ParametresPrevention 
            tenantSlug={tenantSlug} 
            currentUser={user}
          />
        );
      
      case 'avis-nc':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <div className="avis-nc-container">
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>📋 Avis de Non-Conformité</h2>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Gestion des avis générés suite aux inspections</p>
                </div>
                <Button onClick={() => setCurrentView('ref-violations')} variant="outline">
                  ⚙️ Gérer le référentiel
                </Button>
              </div>
              <AvisNonConformiteModule tenantSlug={tenantSlug} toast={toast} />
            </div>
          </Suspense>
        );
      
      case 'ref-violations':
        return (
          <Suspense fallback={<LoadingComponent />}>
            <div style={{ marginBottom: '1rem' }}>
              <Button onClick={() => setCurrentView('avis-nc')} variant="outline" size="sm">
                ← Retour aux avis
              </Button>
            </div>
            <ParametresRefViolations tenantSlug={tenantSlug} toast={toast} />
          </Suspense>
        );
      
      default:
        return <div>Vue en développement...</div>;
    }
  };

  return (
    <div className="prevention-container" style={{ padding: '12px', position: 'relative', zIndex: 1, isolation: 'isolate' }}>
      {/* Header simple comme Gestion des Actifs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(1.1rem, 4vw, 1.5rem)' }}>🔥 Module Prévention</h1>
      </div>
      
      {/* Mobile Menu - Grid Cards */}
      <div className="prevention-mobile-menu" style={{ display: 'none' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => setCurrentView('dashboard')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'dashboard' ? '#fef2f2' : 'white',
              border: currentView === 'dashboard' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>📊</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'dashboard' ? '#dc2626' : '#374151' }}>Tableau de bord</span>
          </button>
          {(user?.est_preventionniste || user?.role === 'admin' || user?.role === 'superadmin') && (
            <button
              onClick={() => setCurrentView('a-valider')}
              style={{
                padding: '16px 12px',
                backgroundColor: currentView === 'a-valider' ? '#fef2f2' : 'white',
                border: currentView === 'a-valider' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
                borderRadius: '12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: '1.75rem' }}>⏳</span>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'a-valider' ? '#dc2626' : '#374151' }}>À valider</span>
            </button>
          )}
          <button
            onClick={() => setCurrentView('preventionnistes')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'preventionnistes' ? '#fef2f2' : 'white',
              border: currentView === 'preventionnistes' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>👨‍🚒</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'preventionnistes' ? '#dc2626' : '#374151' }}>Préventionnistes</span>
          </button>
          <button
            onClick={() => setCurrentView('calendrier')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'calendrier' ? '#fef2f2' : 'white',
              border: currentView === 'calendrier' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>📅</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'calendrier' ? '#dc2626' : '#374151' }}>Planification</span>
          </button>
          <button
            onClick={() => setCurrentView('non-conformites')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'non-conformites' ? '#fef2f2' : 'white',
              border: currentView === 'non-conformites' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>⚠️</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'non-conformites' ? '#dc2626' : '#374151' }}>Non-conformités</span>
          </button>
          <button
            onClick={() => setCurrentView('rapports')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'rapports' ? '#fef2f2' : 'white',
              border: currentView === 'rapports' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>📈</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'rapports' ? '#dc2626' : '#374151' }}>Rapports</span>
          </button>
          <button
            onClick={() => setCurrentView('plans-intervention')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'plans-intervention' ? '#fef2f2' : 'white',
              border: currentView === 'plans-intervention' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>🗺️</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'plans-intervention' ? '#dc2626' : '#374151' }}>Plans</span>
          </button>
          <button
            onClick={() => setCurrentView('parametres')}
            style={{
              padding: '16px 12px',
              backgroundColor: currentView === 'parametres' ? '#fef2f2' : 'white',
              border: currentView === 'parametres' ? '2px solid #e74c3c' : '1px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            <span style={{ fontSize: '1.75rem' }}>⚙️</span>
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: currentView === 'parametres' ? '#dc2626' : '#374151' }}>Paramètres</span>
          </button>
        </div>
      </div>

      {/* Desktop Tabs - Style unifié rouge comme Gestion des Actifs */}
      <div className="prevention-desktop-tabs" style={{ 
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '8px',
        flexWrap: 'wrap',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none'
      }}>
        <button
          onClick={() => setCurrentView('dashboard')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'dashboard' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📊 Tableau de bord
        </button>
        {(user?.est_preventionniste || user?.role === 'admin' || user?.role === 'superadmin') && (
          <button
            onClick={() => setCurrentView('a-valider')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
              currentView === 'a-valider' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            ⏳ À valider
          </button>
        )}
        <button
          onClick={() => setCurrentView('preventionnistes')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'preventionnistes' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          👨‍🚒 Préventionnistes
        </button>
        <button
          onClick={() => setCurrentView('calendrier')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'calendrier' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📅 Planification
        </button>
        <button
          onClick={() => setCurrentView('non-conformites')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'non-conformites' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ⚠️ Non-conformités
        </button>
        <button
          onClick={() => setCurrentView('rapports')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'rapports' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📈 Rapports
        </button>
        <button
          onClick={() => setCurrentView('plans-intervention')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'plans-intervention' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🗺️ Plans
        </button>
        <button
          onClick={() => setCurrentView('parametres')}
          className={`px-4 py-2 rounded-t-lg font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            currentView === 'parametres' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ⚙️ Paramètres
        </button>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          .prevention-mobile-menu {
            display: block !important;
          }
          .prevention-desktop-tabs {
            display: none !important;
          }
        }
        @media (min-width: 769px) {
          .prevention-mobile-menu {
            display: none !important;
          }
        }
        .prevention-desktop-tabs::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      
      <div className="prevention-content">
        {renderContent()}
      </div>

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

export default Prevention;
