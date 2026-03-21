import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Icône personnalisée pour les bâtiments
const batimentIcon = L.divIcon({
  className: 'custom-marker',
  html: `<div style="
    background-color: #3b82f6;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  "><span style="font-size: 14px;">🏢</span></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14]
});

// Composant pour ajuster la vue de la carte
const MapBounds = ({ batiments }) => {
  const map = useMap();
  
  useEffect(() => {
    if (batiments && batiments.length > 0) {
      const validBatiments = batiments.filter(b => b.latitude && b.longitude);
      if (validBatiments.length > 0) {
        const bounds = validBatiments.map(b => [parseFloat(b.latitude), parseFloat(b.longitude)]);
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [batiments, map]);
  
  return null;
};

// Composant de chargement
const LoadingComponent = () => (
  <div className="flex items-center justify-center p-8">
    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
    <span>Chargement...</span>
  </div>
);

/**
 * Module Bâtiments - Gestion centralisée des adresses et bâtiments
 * INDÉPENDANT du module Prévention (pas de filtres risque/groupe/inspection)
 */
const Batiments = () => {
  const { tenantSlug } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { hasModuleAction } = usePermissions(tenantSlug, user);
  
  // États
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('liste');
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('view');
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{batiments.length}</div>
            <div className="text-sm text-gray-500">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{batimentsAvecCoords.length}</div>
            <div className="text-sm text-gray-500">Géolocalisés</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-600">
              {batiments.filter(b => b.photo_url).length}
            </div>
            <div className="text-sm text-gray-500">Avec photo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {new Set(batiments.map(b => b.ville).filter(Boolean)).size}
            </div>
            <div className="text-sm text-gray-500">Villes</div>
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
          </div>
        </Card>
      ) : (
        /* Vue Carte */
        <Card className="h-[600px] overflow-hidden">
          {batimentsAvecCoords.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center p-8">
                <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-700 mb-2">Aucun bâtiment géolocalisé</h3>
                <p className="text-gray-500 text-sm">
                  Ajoutez des coordonnées GPS aux bâtiments pour les voir sur la carte.
                </p>
              </div>
            </div>
          ) : (
            <MapContainer
              center={[45.4, -72.7]}
              zoom={10}
              className="h-full w-full"
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBounds batiments={batimentsAvecCoords} />
              {batimentsAvecCoords.map(batiment => (
                <Marker
                  key={batiment.id}
                  position={[parseFloat(batiment.latitude), parseFloat(batiment.longitude)]}
                  icon={batimentIcon}
                >
                  <Popup>
                    <div className="min-w-[200px]">
                      {batiment.photo_url && (
                        <img 
                          src={batiment.photo_url} 
                          alt="Bâtiment" 
                          className="w-full h-24 object-cover rounded mb-2"
                        />
                      )}
                      <div className="font-semibold">
                        {batiment.nom_etablissement || batiment.adresse_civique}
                      </div>
                      <div className="text-sm text-gray-600">
                        {batiment.adresse_civique}, {batiment.ville}
                      </div>
                      {batiment.contact_telephone && (
                        <a 
                          href={`tel:${batiment.contact_telephone}`}
                          className="text-sm text-blue-600 block mt-1"
                        >
                          {batiment.contact_telephone}
                        </a>
                      )}
                      <button
                        onClick={() => openModal(batiment, 'view')}
                        className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm w-full"
                      >
                        Voir détails
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </Card>
      )}

      {/* Modal */}
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
 * Simplifié - sans les champs de Prévention
 * Avec support copier-coller photo et Street View
 */
const BatimentModal = ({ batiment, mode, tenantSlug, canEdit, onClose, onSave, toast }) => {
  const [formData, setFormData] = useState(batiment || {
    adresse_civique: '',
    ville: '',
    code_postal: '',
    province: 'Québec',
    nom_etablissement: '',
    latitude: '',
    longitude: '',
    contact_nom: '',
    contact_telephone: '',
    contact_email: '',
    notes: '',
    photo_url: ''
  });
  const [saving, setSaving] = useState(false);
  const [loadingStreetView, setLoadingStreetView] = useState(false);
  const pasteAreaRef = useRef(null);
  const isReadOnly = mode === 'view';

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Gestion du copier-coller d'image
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        const reader = new FileReader();
        
        reader.onload = (event) => {
          const base64 = event.target.result;
          setFormData(prev => ({ ...prev, photo_url: base64 }));
          toast({ title: "Photo collée", description: "L'image a été ajoutée" });
        };
        
        reader.readAsDataURL(blob);
        break;
      }
    }
  }, [toast]);

  // Écouter le paste sur la zone dédiée
  useEffect(() => {
    const area = pasteAreaRef.current;
    if (area && !isReadOnly) {
      area.addEventListener('paste', handlePaste);
      return () => area.removeEventListener('paste', handlePaste);
    }
  }, [handlePaste, isReadOnly]);

  // Upload d'image classique
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Erreur", description: "Image trop grande (max 5MB)", variant: "destructive" });
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData(prev => ({ ...prev, photo_url: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  // Récupérer l'image Street View
  const fetchStreetView = async () => {
    if (!formData.adresse_civique || !formData.ville) {
      toast({ title: "Erreur", description: "Entrez d'abord une adresse et une ville", variant: "destructive" });
      return;
    }
    
    setLoadingStreetView(true);
    try {
      const address = encodeURIComponent(`${formData.adresse_civique}, ${formData.ville}, ${formData.province || 'Québec'}, Canada`);
      
      // Utiliser l'API Google Street View Static (nécessite une clé API)
      // Pour l'instant, on utilise une image placeholder ou on ouvre Street View dans un nouvel onglet
      
      // Ouvrir Google Maps Street View dans un nouvel onglet
      window.open(`https://www.google.com/maps?q=${address}&layer=c`, '_blank');
      
      toast({ 
        title: "Street View", 
        description: "Google Street View s'ouvre dans un nouvel onglet. Faites une capture d'écran et collez-la ici (Ctrl+V)."
      });
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible d'ouvrir Street View", variant: "destructive" });
    } finally {
      setLoadingStreetView(false);
    }
  };

  // Supprimer la photo
  const removePhoto = () => {
    setFormData(prev => ({ ...prev, photo_url: '' }));
  };

  // Soumettre le formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isReadOnly) return;
    
    if (!formData.adresse_civique || !formData.ville) {
      toast({ title: "Erreur", description: "L'adresse et la ville sont obligatoires", variant: "destructive" });
      return;
    }
    
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
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="text-blue-600" />
            {mode === 'create' ? 'Nouveau bâtiment' : mode === 'edit' ? 'Modifier le bâtiment' : 'Détail du bâtiment'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* SECTION PHOTO */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <Camera size={18} /> Photo du bâtiment
            </h3>
            
            {formData.photo_url ? (
              <div className="relative">
                <img 
                  src={formData.photo_url} 
                  alt="Bâtiment" 
                  className="w-full max-h-48 object-cover rounded-lg border"
                />
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : !isReadOnly ? (
              <div
                ref={pasteAreaRef}
                tabIndex={0}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 focus:border-blue-500 focus:outline-none transition-colors"
                onClick={() => document.getElementById('photo-upload')?.click()}
              >
                <Image className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-2">
                  Cliquez pour télécharger une image
                </p>
                <p className="text-sm text-gray-400 mb-3">
                  ou <strong>Ctrl+V</strong> pour coller une capture d'écran
                </p>
                <div className="flex justify-center gap-2">
                  <input
                    type="file"
                    id="photo-upload"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      fetchStreetView();
                    }}
                    disabled={loadingStreetView}
                  >
                    <ExternalLink size={14} className="mr-1" />
                    {loadingStreetView ? 'Chargement...' : 'Ouvrir Street View'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8">
                <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                Aucune photo
              </div>
            )}
          </div>

          {/* SECTION ADRESSE */}
          <div>
            <h3 className="font-medium mb-3 flex items-center gap-2">
              <MapPin size={18} /> Adresse
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Nom de l'établissement</label>
                <Input
                  value={formData.nom_etablissement || ''}
                  onChange={(e) => handleChange('nom_etablissement', e.target.value)}
                  placeholder="Ex: Restaurant Le Gourmet, École St-Joseph..."
                  disabled={isReadOnly}
                />
              </div>
              <div className="md:col-span-2">
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
              <div>
                <label className="block text-sm font-medium mb-1">Latitude</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.latitude || ''}
                  onChange={(e) => handleChange('latitude', e.target.value)}
                  placeholder="45.4001"
                  disabled={isReadOnly}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Longitude</label>
                <Input
                  type="number"
                  step="any"
                  value={formData.longitude || ''}
                  onChange={(e) => handleChange('longitude', e.target.value)}
                  placeholder="-72.7334"
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* SECTION CONTACT */}
          <div>
            <h3 className="font-medium mb-3">Contact</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* NOTES */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg resize-none"
              rows={3}
              disabled={isReadOnly}
              placeholder="Informations supplémentaires..."
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
          </div>
        </form>
      </div>
    </div>
  );
};

export default Batiments;
