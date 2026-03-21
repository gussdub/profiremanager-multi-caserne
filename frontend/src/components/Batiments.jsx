import React, { useState, useEffect, Suspense, lazy } from 'react';
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
  Filter,
  Download,
  Map,
  List,
  AlertTriangle,
  RefreshCw,
  X
} from 'lucide-react';

// Lazy load de la carte
const CarteBatiments = lazy(() => import('./CarteBatiments'));

// Composant de chargement
const LoadingComponent = () => (
  <div className="flex items-center justify-center p-8">
    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
    <span>Chargement...</span>
  </div>
);

// Mapping des groupes d'occupation
const GROUPES_OCCUPATION = {
  'A': 'Groupe A - Réunion',
  'B': 'Groupe B - Soins',
  'C': 'Groupe C - Habitations',
  'D': 'Groupe D - Affaires',
  'E': 'Groupe E - Commerciaux',
  'F': 'Groupe F - Industriels',
  'I': 'Groupe I - Risques élevés'
};

// Couleurs des niveaux de risque
const RISQUE_COLORS = {
  'Faible': { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Moyen': { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'Élevé': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Très élevé': { bg: '#7f1d1d', text: '#ffffff', border: '#991b1b' }
};

/**
 * Module Bâtiments - Gestion centralisée des bâtiments/adresses
 * Indépendant du module Prévention
 */
const Batiments = () => {
  const { tenantSlug } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasModuleAccess, hasModuleAction } = usePermissions(tenantSlug, user);
  
  // États
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('liste'); // 'liste' ou 'carte'
  const [filters, setFilters] = useState({
    niveau_risque: '',
    groupe_occupation: '',
    actif: ''
  });
  const [stats, setStats] = useState(null);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'create'
  const [exporting, setExporting] = useState(false);
  
  // Permissions
  const canView = hasModuleAction('batiments', 'voir');
  const canCreate = hasModuleAction('batiments', 'creer');
  const canEdit = hasModuleAction('batiments', 'modifier');
  const canDelete = hasModuleAction('batiments', 'supprimer');
  const canExport = hasModuleAction('batiments', 'exporter');

  // Chargement des données
  useEffect(() => {
    if (canView) {
      fetchBatiments();
      fetchStats();
    }
  }, [tenantSlug, canView]);

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

  const fetchStats = async () => {
    try {
      const data = await apiGet(tenantSlug, '/batiments/statistiques');
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
    }
  };

  // Filtrage des bâtiments
  const getFilteredBatiments = () => {
    let filtered = [...batiments];
    
    // Recherche textuelle
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(b =>
        (b.adresse_civique || '').toLowerCase().includes(query) ||
        (b.ville || '').toLowerCase().includes(query) ||
        (b.nom_etablissement || '').toLowerCase().includes(query) ||
        (b.code_postal || '').toLowerCase().includes(query)
      );
    }
    
    // Filtre par niveau de risque
    if (filters.niveau_risque) {
      filtered = filtered.filter(b => b.niveau_risque === filters.niveau_risque);
    }
    
    // Filtre par groupe d'occupation
    if (filters.groupe_occupation) {
      filtered = filtered.filter(b => b.groupe_occupation === filters.groupe_occupation);
    }
    
    // Filtre actif/inactif
    if (filters.actif !== '') {
      const isActif = filters.actif === 'true';
      filtered = filtered.filter(b => b.actif === isActif);
    }
    
    return filtered;
  };

  // Réinitialiser les filtres
  const resetFilters = () => {
    setSearchQuery('');
    setFilters({
      niveau_risque: '',
      groupe_occupation: '',
      actif: ''
    });
  };

  // Export Excel
  const handleExport = async () => {
    if (!canExport) return;
    
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

  const hasActiveFilters = searchQuery.trim() || Object.values(filters).some(v => v !== '');
  const filteredBatiments = getFilteredBatiments();

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

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
              <div className="text-sm text-gray-500">Total</div>
            </CardContent>
          </Card>
          {Object.entries(stats.par_niveau_risque || {}).map(([risque, count]) => (
            <Card key={risque}>
              <CardContent className="p-4 text-center">
                <div 
                  className="text-2xl font-bold"
                  style={{ color: RISQUE_COLORS[risque]?.text || '#374151' }}
                >
                  {count}
                </div>
                <div className="text-sm text-gray-500">{risque}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Barre de recherche et filtres */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4 flex-wrap items-center">
            {/* Recherche */}
            <div className="flex-1 min-w-[250px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                placeholder="Rechercher par adresse, ville, nom..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Filtre niveau de risque */}
            <select
              value={filters.niveau_risque}
              onChange={(e) => setFilters({ ...filters, niveau_risque: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">Tous les risques</option>
              <option value="Faible">🟢 Faible</option>
              <option value="Moyen">🟡 Moyen</option>
              <option value="Élevé">🟠 Élevé</option>
              <option value="Très élevé">🔴 Très élevé</option>
            </select>
            
            {/* Filtre groupe d'occupation */}
            <select
              value={filters.groupe_occupation}
              onChange={(e) => setFilters({ ...filters, groupe_occupation: e.target.value })}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="">Tous les groupes</option>
              {Object.entries(GROUPES_OCCUPATION).map(([code, nom]) => (
                <option key={code} value={code}>{nom}</option>
              ))}
            </select>
            
            {/* Compteur et reset */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                {filteredBatiments.length} / {batiments.length}
              </span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  <X size={16} className="mr-1" /> Réinitialiser
                </Button>
              )}
            </div>
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
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left font-semibold text-sm">Adresse</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Ville</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-sm">Risque</th>
                  <th className="px-4 py-3 text-center font-semibold text-sm">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBatiments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      {hasActiveFilters ? 'Aucun bâtiment ne correspond aux critères' : 'Aucun bâtiment enregistré'}
                    </td>
                  </tr>
                ) : (
                  filteredBatiments.map(batiment => (
                    <tr 
                      key={batiment.id} 
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{batiment.nom_etablissement || batiment.adresse_civique}</div>
                        {batiment.nom_etablissement && (
                          <div className="text-sm text-gray-500">{batiment.adresse_civique}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{batiment.ville}</td>
                      <td className="px-4 py-3">
                        {batiment.groupe_occupation && (
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                            {GROUPES_OCCUPATION[batiment.groupe_occupation] || batiment.groupe_occupation}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {batiment.niveau_risque && (
                          <span 
                            className="px-2 py-1 rounded text-sm font-medium"
                            style={{
                              backgroundColor: RISQUE_COLORS[batiment.niveau_risque]?.bg || '#f3f4f6',
                              color: RISQUE_COLORS[batiment.niveau_risque]?.text || '#374151',
                              border: `1px solid ${RISQUE_COLORS[batiment.niveau_risque]?.border || '#e5e7eb'}`
                            }}
                          >
                            {batiment.niveau_risque}
                          </span>
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
          </div>
        </Card>
      ) : (
        /* Vue Carte */
        <Card className="h-[600px]">
          <Suspense fallback={<LoadingComponent />}>
            <CarteBatiments 
              batiments={filteredBatiments}
              onBatimentClick={(batiment) => openModal(batiment, 'view')}
            />
          </Suspense>
        </Card>
      )}

      {/* Modal Détail/Édition */}
      {showModal && (
        <BatimentModal
          batiment={selectedBatiment}
          mode={modalMode}
          tenantSlug={tenantSlug}
          canEdit={canEdit}
          onClose={() => {
            setShowModal(false);
            setSelectedBatiment(null);
          }}
          onSave={() => {
            setShowModal(false);
            setSelectedBatiment(null);
            fetchBatiments();
          }}
          toast={toast}
        />
      )}
    </div>
  );
};

/**
 * Modal pour créer/éditer/voir un bâtiment
 */
const BatimentModal = ({ batiment, mode, tenantSlug, canEdit, onClose, onSave, toast }) => {
  const [formData, setFormData] = useState(batiment || {
    adresse_civique: '',
    ville: '',
    code_postal: '',
    province: 'Québec',
    nom_etablissement: '',
    groupe_occupation: '',
    niveau_risque: 'Faible',
    nombre_etages: '',
    superficie: '',
    annee_construction: '',
    description: '',
    contact_nom: '',
    contact_telephone: '',
    contact_email: ''
  });
  const [saving, setSaving] = useState(false);
  const isReadOnly = mode === 'view';

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    
    try {
      setSaving(true);
      
      if (mode === 'create') {
        await apiPost(tenantSlug, '/batiments', formData);
        toast({ title: "Succès", description: "Bâtiment créé" });
      } else {
        await apiPut(tenantSlug, `/batiments/${batiment.id}`, formData);
        toast({ title: "Succès", description: "Bâtiment modifié" });
      }
      
      onSave();
    } catch (error) {
      toast({ 
        title: "Erreur", 
        description: error.message || "Impossible de sauvegarder", 
        variant: "destructive" 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="text-blue-600" />
            {mode === 'create' ? 'Nouveau bâtiment' : mode === 'edit' ? 'Modifier le bâtiment' : 'Détail du bâtiment'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Adresse */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Nom de l'établissement</label>
              <Input
                value={formData.nom_etablissement || ''}
                onChange={(e) => handleChange('nom_etablissement', e.target.value)}
                placeholder="Ex: École Primaire du Village"
                disabled={isReadOnly}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Adresse civique *</label>
              <Input
                value={formData.adresse_civique || ''}
                onChange={(e) => handleChange('adresse_civique', e.target.value)}
                placeholder="Ex: 123 rue Principale"
                required
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ville *</label>
              <Input
                value={formData.ville || ''}
                onChange={(e) => handleChange('ville', e.target.value)}
                required
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code postal</label>
              <Input
                value={formData.code_postal || ''}
                onChange={(e) => handleChange('code_postal', e.target.value)}
                placeholder="J0H 1A0"
                disabled={isReadOnly}
              />
            </div>
          </div>
          
          {/* Classification */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Groupe d'occupation</label>
              <select
                value={formData.groupe_occupation || ''}
                onChange={(e) => handleChange('groupe_occupation', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={isReadOnly}
              >
                <option value="">-- Sélectionner --</option>
                {Object.entries(GROUPES_OCCUPATION).map(([code, nom]) => (
                  <option key={code} value={code}>{nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Niveau de risque</label>
              <select
                value={formData.niveau_risque || 'Faible'}
                onChange={(e) => handleChange('niveau_risque', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                disabled={isReadOnly}
              >
                <option value="Faible">🟢 Faible</option>
                <option value="Moyen">🟡 Moyen</option>
                <option value="Élevé">🟠 Élevé</option>
                <option value="Très élevé">🔴 Très élevé</option>
              </select>
            </div>
          </div>
          
          {/* Caractéristiques */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nombre d'étages</label>
              <Input
                type="number"
                value={formData.nombre_etages || ''}
                onChange={(e) => handleChange('nombre_etages', parseInt(e.target.value) || '')}
                min={1}
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Superficie (m²)</label>
              <Input
                type="number"
                value={formData.superficie || ''}
                onChange={(e) => handleChange('superficie', parseFloat(e.target.value) || '')}
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Année construction</label>
              <Input
                type="number"
                value={formData.annee_construction || ''}
                onChange={(e) => handleChange('annee_construction', parseInt(e.target.value) || '')}
                min={1800}
                max={new Date().getFullYear()}
                disabled={isReadOnly}
              />
            </div>
          </div>
          
          {/* Contact */}
          <div className="border-t pt-4 mt-4">
            <h3 className="font-medium mb-3">Contact</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nom</label>
                <Input
                  value={formData.contact_nom || ''}
                  onChange={(e) => handleChange('contact_nom', e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Téléphone</label>
                <Input
                  value={formData.contact_telephone || ''}
                  onChange={(e) => handleChange('contact_telephone', e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={formData.contact_email || ''}
                  onChange={(e) => handleChange('contact_email', e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>
          
          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description / Notes</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              disabled={isReadOnly}
            />
          </div>
          
          {/* Boutons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {isReadOnly ? 'Fermer' : 'Annuler'}
            </Button>
            {!isReadOnly && (
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    Enregistrement...
                  </>
                ) : (
                  mode === 'create' ? 'Créer' : 'Enregistrer'
                )}
              </Button>
            )}
            {isReadOnly && canEdit && (
              <Button type="button" onClick={() => {
                // Passer en mode édition
                // (Le parent devrait gérer ce changement)
              }}>
                <Edit2 size={16} className="mr-1" /> Modifier
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Batiments;
