import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { 
  Building2, 
  MapPin, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  Eye,
  Download,
  Map,
  List,
  AlertTriangle,
  RefreshCw,
  X,
  Image,
  Camera,
  Clipboard,
  ExternalLink,
  Home,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Settings,
  GripVertical
} from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Lazy load du modal de détail (partagé avec Prevention)
const BatimentDetailModal = lazy(() => import('./BatimentDetailModalNew'));

// Lazy load de la carte avec secteurs
const CarteBatiments = lazy(() => import('./CarteBatiments'));

// Composant de chargement
const LoadingComponent = () => (
  <div className="flex items-center justify-center p-8">
    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
    <span>Chargement...</span>
  </div>
);

/**
 * Module Bâtiments - Gestion centralisée des adresses et bâtiments
 * Utilise le même modal que Prévention avec onglets conditionnels
 */
const Batiments = () => {
  const { tenantSlug } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasModuleAction, hasModuleAccess } = usePermissions(tenantSlug, user);
  
  // États
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('liste');
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('view');
  const [exporting, setExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // État pour le tri des colonnes
  const [sortConfig, setSortConfig] = useState(() => {
    // Charger les préférences de tri depuis localStorage
    const saved = localStorage.getItem(`batiments_sort_${tenantSlug}_${user?.id}`);
    return saved ? JSON.parse(saved) : [];
  });
  
  // État pour la personnalisation des colonnes
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(`batiments_columns_${tenantSlug}_${user?.id}`);
    return saved ? JSON.parse(saved) : ['photo', 'adresse', 'ville', 'contact'];
  });
  
  // Configuration de toutes les colonnes disponibles
  const availableColumns = [
    { id: 'photo', label: 'Photo', required: true, sortable: false },
    { id: 'adresse', label: 'Adresse', required: true, sortable: true, sortKey: 'adresse_civique' },
    { id: 'ville', label: 'Ville', required: true, sortable: true, sortKey: 'ville' },
    { id: 'contact', label: 'Contact', required: false, sortable: true, sortKey: 'contact_nom' },
    { id: 'matricule', label: 'Cadastre / Matricule', required: false, sortable: true, sortKey: 'cadastre_matricule' },
    { id: 'risque', label: 'Niveau de Risque', required: false, sortable: true, sortKey: 'niveau_risque' },
    { id: 'categorie', label: 'Catégorie', required: false, sortable: true, sortKey: 'groupe_occupation' },
    { id: 'etages', label: 'Nb. Étages', required: false, sortable: true, sortKey: 'nombre_etages' },
    { id: 'logements', label: 'Nb. Logements', required: false, sortable: true, sortKey: 'nombre_logements' },
    { id: 'superficie', label: 'Superficie (m²)', required: false, sortable: true, sortKey: 'superficie' },
    { id: 'annee', label: 'Année Construction', required: false, sortable: true, sortKey: 'annee_construction' },
    { id: 'code_postal', label: 'Code Postal', required: false, sortable: true, sortKey: 'code_postal' },
  ];
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Permissions Bâtiments
  const canView = hasModuleAction('batiments', 'voir');
  const canCreate = hasModuleAction('batiments', 'creer');
  const canEdit = hasModuleAction('batiments', 'modifier');
  const canDelete = hasModuleAction('batiments', 'supprimer');
  const canExport = hasModuleAction('batiments', 'exporter');
  
  // Permissions Prévention (pour onglets conditionnels)
  const hasPreventionAccess = hasModuleAccess('prevention');
  
  // États pour les secteurs (si Prévention actif)
  const [secteurs, setSecteurs] = useState([]);
  const [preventionnistes, setPreventionnistes] = useState([]);

  // Récupérer l'ID du bâtiment depuis l'URL si présent
  const urlParams = new URLSearchParams(window.location.search);
  const batimentIdFromUrl = urlParams.get('id');

  // Chargement des données
  useEffect(() => {
    if (canView) {
      fetchBatiments();
      // Charger les secteurs et préventionnistes si Prévention actif
      if (hasPreventionAccess) {
        fetchSecteurs();
        fetchPreventionnistes();
      }
    }
  }, [tenantSlug, canView, hasPreventionAccess]);

  // Ouvrir automatiquement le modal si un ID est dans l'URL
  useEffect(() => {
    if (batimentIdFromUrl && batiments.length > 0) {
      const batiment = batiments.find(b => b.id === batimentIdFromUrl);
      if (batiment) {
        setSelectedBatiment(batiment);
        setModalMode('view');
        setShowModal(true);
        // Nettoyer l'URL après ouverture
        window.history.replaceState({}, '', `/${tenantSlug}/batiments`);
      }
    }
  }, [batimentIdFromUrl, batiments, tenantSlug]);

  const fetchBatiments = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/batiments');
      setBatiments(data || []);
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

  const fetchSecteurs = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/secteurs-geographiques');
      setSecteurs(data || []);
    } catch (error) {
      console.error('Erreur chargement secteurs:', error);
    }
  };

  const fetchPreventionnistes = async () => {
    try {
      const data = await apiGet(tenantSlug, '/prevention/preventionnistes');
      setPreventionnistes(data || []);
    } catch (error) {
      console.error('Erreur chargement préventionnistes:', error);
    }
  };

  // Filtrage simple par recherche textuelle
  const getFilteredBatiments = () => {
    if (!searchQuery.trim()) return batiments;
    
    const query = searchQuery.toLowerCase().trim();
    return batiments.filter(b =>
      (b.adresse_civique || '').toLowerCase().includes(query) ||
      (b.ville || '').toLowerCase().includes(query) ||
      (b.nom_etablissement || '').toLowerCase().includes(query) ||
      (b.code_postal || '').toLowerCase().includes(query)
    );
  };

  // Export
  const handleExport = async () => {
    if (!canExport) return;
    
    try {
      setExporting(true);
      const token = localStorage.getItem(`${tenantSlug}_token`);
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/batiments/export`,
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
      
      toast({ title: "Export réussi", description: "Le fichier a été téléchargé" });
    } catch (error) {
      console.error('Erreur export:', error);
      toast({ title: "Erreur", description: "Impossible d'exporter", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  // Ouvrir le modal
  const openModal = (batiment, mode) => {
    setSelectedBatiment(batiment);
    setModalMode(mode);
    setShowModal(true);
  };

  // Supprimer un bâtiment
  const handleDelete = async (batimentId) => {
    if (!canDelete) return;
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce bâtiment ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/batiments/${batimentId}`);
      toast({ title: "Succès", description: "Bâtiment supprimé" });
      fetchBatiments();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de supprimer", variant: "destructive" });
    }
  };

  // ==================== SYSTÈME DE TRI ====================
  
  /**
   * Gestion du tri multi-colonnes
   * Shift+Clic pour ajouter une colonne de tri secondaire
   */
  const handleSort = (column, event) => {
    let newSortConfig = [...sortConfig];
    
    // Trouver si cette colonne est déjà dans le tri
    const existingIndex = newSortConfig.findIndex(s => s.column === column);
    
    if (event?.shiftKey && existingIndex === -1) {
      // Shift+Clic : Ajouter une colonne de tri secondaire
      newSortConfig.push({ column, direction: 'asc' });
    } else if (existingIndex !== -1) {
      // Colonne déjà triée : Changer la direction ou retirer
      const currentDirection = newSortConfig[existingIndex].direction;
      if (currentDirection === 'asc') {
        newSortConfig[existingIndex].direction = 'desc';
      } else {
        // Retirer cette colonne du tri
        newSortConfig.splice(existingIndex, 1);
      }
    } else {
      // Nouveau tri simple
      newSortConfig = [{ column, direction: 'asc' }];
    }
    
    setSortConfig(newSortConfig);
    
    // Sauvegarder dans localStorage
    localStorage.setItem(
      `batiments_sort_${tenantSlug}_${user?.id}`,
      JSON.stringify(newSortConfig)
    );
  };
  
  /**
   * Fonction de comparaison pour le tri
   */
  const compareValues = (a, b, column) => {
    let aVal = a[column];
    let bVal = b[column];
    
    // Gestion des valeurs null/undefined
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    
    // Tri par importance pour niveau_risque
    if (column === 'niveau_risque') {
      const risqueOrder = {
        'Faible': 1,
        'Moyen': 2,
        'Élevé': 3,
        'Très élevé': 4
      };
      const aOrder = risqueOrder[aVal] || 0;
      const bOrder = risqueOrder[bVal] || 0;
      return aOrder - bOrder;
    }
    
    // Tri numérique
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return aVal - bVal;
    }
    
    // Tri numérique pour les champs qui peuvent être des strings numériques
    if (['cadastre_matricule', 'valeur_fonciere', 'nombre_etages', 'nombre_logements', 'superficie', 'annee_construction'].includes(column)) {
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
    }
    
    // Tri alphabétique par défaut
    return String(aVal).localeCompare(String(bVal), 'fr-CA', { numeric: true, sensitivity: 'base' });
  };
  
  /**
   * Applique le tri multi-colonnes
   */
  const getSortedBatiments = (batiments) => {
    if (sortConfig.length === 0) return batiments;
    
    return [...batiments].sort((a, b) => {
      for (const { column, direction } of sortConfig) {
        const comparison = compareValues(a, b, column);
        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  };
  
  /**
   * Rendu de l'icône de tri dans les en-têtes
   */
  const renderSortIcon = (column) => {
    const sortIndex = sortConfig.findIndex(s => s.column === column);
    
    if (sortIndex === -1) {
      return <ArrowUpDown size={14} className="ml-1 opacity-30" />;
    }
    
    const sort = sortConfig[sortIndex];
    const Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown;
    
    return (
      <span className="flex items-center gap-1">
        <Icon size={14} className="ml-1" />
        {sortConfig.length > 1 && (
          <span className="text-xs bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center">
            {sortIndex + 1}
          </span>
        )}
      </span>
    );
  };
  
  // ==================== FIN SYSTÈME DE TRI ====================
  
  // ==================== RENDU DYNAMIQUE DES COLONNES ====================
  
  /**
   * Rendu du contenu d'une cellule selon le type de colonne
   */
  const renderCellContent = (batiment, columnId) => {
    switch(columnId) {
      case 'photo':
        return batiment.photo_url ? (
          <img 
            src={batiment.photo_url} 
            alt="Bâtiment" 
            className="w-16 h-12 object-cover rounded border"
          />
        ) : (
          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
            <Building2 className="w-6 h-6 text-gray-400" />
          </div>
        );
        
      case 'adresse':
        return (
          <div>
            <div className="font-medium">{batiment.nom_etablissement || batiment.adresse_civique}</div>
            {batiment.nom_etablissement && (
              <div className="text-sm text-gray-500">{batiment.adresse_civique}</div>
            )}
          </div>
        );
        
      case 'ville':
        return (
          <div>
            {batiment.ville}
            {batiment.code_postal && (
              <div className="text-sm text-gray-400">{batiment.code_postal}</div>
            )}
          </div>
        );
        
      case 'contact':
        return (
          <div>
            {batiment.contact_nom && (
              <div className="text-sm">{batiment.contact_nom}</div>
            )}
            {batiment.contact_telephone && (
              <a href={`tel:${batiment.contact_telephone}`} className="text-sm text-blue-600" onClick={(e) => e.stopPropagation()}>
                {batiment.contact_telephone}
              </a>
            )}
          </div>
        );
        
      case 'matricule':
        return batiment.cadastre_matricule || '-';
        
      case 'risque':
        const risqueColors = {
          'Faible': 'bg-green-100 text-green-800',
          'Moyen': 'bg-yellow-100 text-yellow-800',
          'Élevé': 'bg-orange-100 text-orange-800',
          'Très élevé': 'bg-red-100 text-red-800'
        };
        const risque = batiment.niveau_risque || 'Faible';
        return (
          <span className={`px-2 py-1 rounded text-xs font-medium ${risqueColors[risque] || 'bg-gray-100'}`}>
            {risque}
          </span>
        );
        
      case 'categorie':
        return batiment.groupe_occupation || '-';
        
      case 'etages':
        return batiment.nombre_etages || '-';
        
      case 'logements':
        return batiment.nombre_logements || '-';
        
      case 'superficie':
        return batiment.superficie ? `${batiment.superficie} m²` : '-';
        
      case 'annee':
        return batiment.annee_construction || '-';
        
      case 'code_postal':
        return batiment.code_postal || '-';
        
      default:
        return '-';
    }
  };
  
  // ==================== FIN RENDU DYNAMIQUE ====================

  const filteredBatiments = getFilteredBatiments();
  const sortedBatiments = getSortedBatiments(filteredBatiments);
  const batimentsAvecCoords = sortedBatiments.filter(b => b.latitude && b.longitude);
  const visibleBatiments = sortedBatiments.slice(0, visibleCount);
  const hasMore = visibleCount < sortedBatiments.length;

  // Vérification des permissions
  if (!canView) {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
            <p className="text-gray-600">Vous n'avez pas la permission d'accéder au module Bâtiments.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="batiments-module p-4">
      {/* En-tête */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Bâtiments</h1>
            <p className="text-gray-500 text-sm">Gestion centralisée des adresses et bâtiments</p>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {/* Toggle vue */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('liste')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                viewMode === 'liste' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
              }`}
            >
              <List size={16} /> Liste
            </button>
            <button
              onClick={() => setViewMode('carte')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                viewMode === 'carte' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
              }`}
            >
              <Map size={16} /> Carte
            </button>
          </div>
          
          {/* Bouton Paramètres (Personnalisation des colonnes) */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowColumnModal(true)}
            title="Personnaliser les colonnes"
          >
            <Settings size={16} />
          </Button>
          
          {canExport && (
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              <Download size={16} className="mr-1" />
              {exporting ? 'Export...' : 'Exporter'}
            </Button>
          )}
          
          {canCreate && (
            <Button onClick={() => openModal(null, 'create')}>
              <Plus size={16} className="mr-1" /> Nouveau bâtiment
            </Button>
          )}
        </div>
      </div>

      {/* Statistiques simples */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-blue-600">{batiments.length}</div>
            <div className="text-xs md:text-sm text-gray-500">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-green-600">{batiments.filter(b => b.latitude && b.longitude).length}</div>
            <div className="text-xs md:text-sm text-gray-500">Géolocalisés</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-purple-600">
              {batiments.filter(b => b.photo_url).length}
            </div>
            <div className="text-xs md:text-sm text-gray-500">Avec photo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4 text-center">
            <div className="text-2xl md:text-3xl font-bold text-orange-600">
              {new Set(batiments.map(b => b.ville).filter(Boolean)).size}
            </div>
            <div className="text-xs md:text-sm text-gray-500">Villes</div>
          </CardContent>
        </Card>
      </div>

      {/* Barre de recherche */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                placeholder="Rechercher par adresse, ville, nom..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(50); }}
                className="pl-10"
              />
            </div>
            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
              {filteredBatiments.length} / {batiments.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Contenu principal */}
      {loading ? (
        <LoadingComponent />
      ) : viewMode === 'liste' ? (
        /* Vue Liste */
        <>
          {sortConfig.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-600 px-2">
              <span>Tri actif :</span>
              {sortConfig.map((sort, index) => (
                <span key={sort.column} className="bg-blue-50 px-2 py-1 rounded flex items-center gap-1">
                  {sort.column === 'adresse_civique' ? 'Adresse' : 
                   sort.column === 'ville' ? 'Ville' : 
                   sort.column === 'contact_nom' ? 'Contact' : 
                   sort.column}
                  {sort.direction === 'asc' ? ' ↑' : ' ↓'}
                  {index < sortConfig.length - 1 && <span className="text-gray-400">→</span>}
                </span>
              ))}
              <button 
                onClick={() => {
                  setSortConfig([]);
                  localStorage.removeItem(`batiments_sort_${tenantSlug}_${user?.id}`);
                }}
                className="text-xs text-red-600 hover:underline ml-2"
              >
                Réinitialiser
              </button>
            </div>
          )}
          <Card>
          <div className="overflow-x-auto">
            {isMobile ? (
              /* Vue Cards Mobile */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                {filteredBatiments.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    {searchQuery ? 'Aucun bâtiment ne correspond à la recherche' : 'Aucun bâtiment enregistré'}
                  </div>
                ) : visibleBatiments.map(batiment => (
                  <div
                    key={batiment.id}
                    data-testid={`batiment-card-${batiment.id}`}
                    onClick={() => openModal(batiment, 'view')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid #E5E7EB',
                      background: 'white',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                  >
                    {batiment.photo_url ? (
                      <img src={batiment.photo_url} alt="" style={{ width: '56px', height: '42px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: '56px', height: '42px', background: '#F3F4F6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={20} className="text-gray-400" />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {batiment.nom_etablissement || batiment.adresse_civique}
                      </div>
                      <div style={{ fontSize: '12px', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {batiment.adresse_civique}{batiment.ville ? `, ${batiment.ville}` : ''}
                      </div>
                    </div>
                    <Eye size={18} className="text-gray-400" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            ) : (
            /* Vue Table Desktop */
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {availableColumns
                    .filter(col => visibleColumns.includes(col.id))
                    .map(column => (
                      <th 
                        key={column.id}
                        className={`px-4 py-3 text-left font-semibold text-sm ${
                          column.sortable ? 'cursor-pointer hover:bg-gray-100 select-none' : ''
                        }`}
                        onClick={column.sortable ? (e) => handleSort(column.sortKey, e) : undefined}
                        title={column.sortable ? "Cliquer pour trier • Shift+Clic pour tri multi-colonnes" : undefined}
                      >
                        <div className="flex items-center">
                          {column.label}
                          {column.sortable && renderSortIcon(column.sortKey)}
                        </div>
                      </th>
                    ))}
                  <th className="px-4 py-3 text-center font-semibold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedBatiments.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-gray-500">
                      {searchQuery ? 'Aucun bâtiment ne correspond à la recherche' : 'Aucun bâtiment enregistré'}
                    </td>
                  </tr>
                ) : (
                  visibleBatiments.map(batiment => (
                    <tr 
                      key={batiment.id} 
                      className="border-b hover:bg-gray-50 transition-colors"
                      onClick={() => openModal(batiment, 'view')}
                      style={{ cursor: 'pointer' }}
                    >
                      {availableColumns
                        .filter(col => visibleColumns.includes(col.id))
                        .map(column => (
                          <td key={column.id} className="px-4 py-3">
                            {renderCellContent(batiment, column.id)}
                          </td>
                        ))}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          {canEdit && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => openModal(batiment, 'edit')}
                            >
                              <Edit2 size={16} />
                            </Button>
                          )}
                          {canDelete && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => handleDelete(batiment.id)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            )}
          </div>
          {hasMore && (
            <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid #e5e7eb' }}>
              <Button 
                variant="outline" 
                onClick={() => setVisibleCount(prev => prev + 50)}
                data-testid="load-more-batiments"
              >
                Charger plus ({filteredBatiments.length - visibleCount} restants)
              </Button>
            </div>
          )}
        </Card>
        </>
      ) : (
        /* Vue Carte avec secteurs */
        <Card className="overflow-hidden">
          {batimentsAvecCoords.length === 0 && secteurs.length === 0 ? (
            <div className="h-[600px] flex items-center justify-center">
              <div className="text-center p-8">
                <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-700 mb-2">Aucun bâtiment géolocalisé</h3>
                <p className="text-gray-500 text-sm">
                  Ajoutez des coordonnées GPS aux bâtiments pour les voir sur la carte.
                </p>
              </div>
            </div>
          ) : (
            <Suspense fallback={<div className="h-[600px] flex items-center justify-center"><LoadingComponent /></div>}>
              <CarteBatiments
                batiments={filteredBatiments}
                batimentsAvecPlan={new Set()}
                onBatimentClick={(batiment) => openModal(batiment, 'view')}
                secteurs={secteurs}
                preventionnistes={preventionnistes}
              />
            </Suspense>
          )}
        </Card>
      )}


      {/* Modal - Utilise le même composant que Prévention */}
      {showModal && (
        <Suspense fallback={<LoadingComponent />}>
          <BatimentDetailModal
            batiment={modalMode === 'create' ? null : selectedBatiment}
            onClose={() => {
              setShowModal(false);
              setSelectedBatiment(null);
            }}
            onUpdate={async (updatedBatiment) => {
              // Mise à jour via l'API batiments (pas prevention)
              try {
                await apiPut(tenantSlug, `/batiments/${updatedBatiment.id}`, updatedBatiment);
                toast({ title: "Succès", description: "Bâtiment modifié" });
                fetchBatiments();
              } catch (error) {
                toast({ title: "Erreur", description: error.message, variant: "destructive" });
              }
            }}
            onCreate={async (newBatiment) => {
              // Création via l'API batiments (pas prevention)
              try {
                await apiPost(tenantSlug, '/batiments', newBatiment);
                toast({ title: "Succès", description: "Bâtiment créé" });
                setShowModal(false);
                setSelectedBatiment(null);
                fetchBatiments();
              } catch (error) {
                toast({ title: "Erreur", description: error.message, variant: "destructive" });
              }
            }}
            onDelete={canDelete ? async (batimentId) => {
              if (window.confirm('Êtes-vous sûr de vouloir supprimer ce bâtiment ?')) {
                try {
                  await apiDelete(tenantSlug, `/batiments/${batimentId}`);
                  toast({ title: "Succès", description: "Bâtiment supprimé" });
                  setShowModal(false);
                  setSelectedBatiment(null);
                  fetchBatiments();
                } catch (error) {
                  toast({ title: "Erreur", description: error.message, variant: "destructive" });
                }
              }
            } : null}
            // Callbacks de Prévention - CONDITIONNELS au module actif
            onInspect={hasPreventionAccess ? (bat) => {
              // Rediriger vers le module Prévention pour inspecter
              window.location.href = `/${tenantSlug}/prevention?action=inspecter&batiment=${bat.id}`;
            } : null}
            onCreatePlan={hasPreventionAccess ? (bat) => {
              // Rediriger vers le module Prévention pour créer un plan
              window.location.href = `/${tenantSlug}/prevention?action=plan&batiment=${bat.id}`;
            } : null}
            onViewHistory={true}  // L'historique est toujours disponible
            onGenerateReport={hasPreventionAccess ? (bat) => {
              // Rediriger vers le module Prévention pour le rapport
              window.location.href = `/${tenantSlug}/prevention?action=rapport&batiment=${bat.id}`;
            } : null}
            canEdit={canEdit}
            currentUser={user}
            tenantSlug={tenantSlug}
          />
        </Suspense>
      )}
      
      {/* Modal de Personnalisation des Colonnes */}
      {showColumnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* En-tête */}
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Personnaliser l'affichage du tableau</h2>
              <button 
                onClick={() => setShowColumnModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>
            
            {/* Contenu */}
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-gray-600 mb-4">
                Sélectionnez les colonnes à afficher dans le tableau. Les colonnes obligatoires ne peuvent pas être désactivées.
              </p>
              
              <div className="space-y-2">
                {availableColumns.map((column) => {
                  const isVisible = visibleColumns.includes(column.id);
                  const isRequired = column.required;
                  
                  return (
                    <div
                      key={column.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        isRequired ? 'bg-gray-50 border-gray-200' : 'hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        disabled={isRequired}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setVisibleColumns([...visibleColumns, column.id]);
                          } else {
                            setVisibleColumns(visibleColumns.filter(id => id !== column.id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <label className={`flex-1 cursor-pointer ${isRequired ? 'text-gray-500' : ''}`}>
                        {column.label}
                        {isRequired && <span className="text-xs text-gray-400 ml-2">(Obligatoire)</span>}
                      </label>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                💡 <strong>Astuce :</strong> Les colonnes obligatoires (Photo, Adresse, Ville) sont toujours affichées pour faciliter l'identification des bâtiments.
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setVisibleColumns(['photo', 'adresse', 'ville', 'contact']);
                  toast({ title: "Réinitialisé", description: "Colonnes par défaut restaurées" });
                }}
              >
                Réinitialiser
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowColumnModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => {
                    // Sauvegarder dans localStorage
                    localStorage.setItem(
                      `batiments_columns_${tenantSlug}_${user?.id}`,
                      JSON.stringify(visibleColumns)
                    );
                    setShowColumnModal(false);
                    toast({ 
                      title: "Enregistré", 
                      description: `${visibleColumns.length} colonnes affichées` 
                    });
                  }}
                >
                  Enregistrer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Batiments;
