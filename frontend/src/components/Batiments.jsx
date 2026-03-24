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
  Home
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
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('view');
  const [exporting, setExporting] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
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

  const filteredBatiments = getFilteredBatiments();
  const batimentsAvecCoords = filteredBatiments.filter(b => b.latitude && b.longitude);

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
                onChange={(e) => setSearchQuery(e.target.value)}
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
        <Card>
          <div className="overflow-x-auto">
            {isMobile ? (
              /* Vue Cards Mobile */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px' }}>
                {filteredBatiments.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    {searchQuery ? 'Aucun bâtiment ne correspond à la recherche' : 'Aucun bâtiment enregistré'}
                  </div>
                ) : filteredBatiments.map(batiment => (
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
                  <th className="px-4 py-3 text-left font-semibold text-sm">Photo</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Adresse</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Ville</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Contact</th>
                  <th className="px-4 py-3 text-center font-semibold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatiments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      {searchQuery ? 'Aucun bâtiment ne correspond à la recherche' : 'Aucun bâtiment enregistré'}
                    </td>
                  </tr>
                ) : (
                  filteredBatiments.map(batiment => (
                    <tr 
                      key={batiment.id} 
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {batiment.photo_url ? (
                          <img 
                            src={batiment.photo_url} 
                            alt="Bâtiment" 
                            className="w-16 h-12 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center">
                            <Building2 className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{batiment.nom_etablissement || batiment.adresse_civique}</div>
                        {batiment.nom_etablissement && (
                          <div className="text-sm text-gray-500">{batiment.adresse_civique}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {batiment.ville}
                        {batiment.code_postal && (
                          <div className="text-sm text-gray-400">{batiment.code_postal}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {batiment.contact_nom && (
                          <div className="text-sm">{batiment.contact_nom}</div>
                        )}
                        {batiment.contact_telephone && (
                          <a href={`tel:${batiment.contact_telephone}`} className="text-sm text-blue-600">
                            {batiment.contact_telephone}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => openModal(batiment, 'view')}
                          >
                            <Eye size={16} />
                          </Button>
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
        </Card>
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
    </div>
  );
};

export default Batiments;
