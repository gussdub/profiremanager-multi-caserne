import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "./ui/button.jsx";
import { Input } from "./ui/input.jsx";
import { Label } from "./ui/label.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.jsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.jsx";
import { Switch } from "./ui/switch.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs.jsx";
import { 
  MapPin, Plus, Edit2, Trash2, RefreshCw, Save, 
  Building2, Map, Home, AlertTriangle, Check, Eye, Pencil
} from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";

// Import dynamique de la carte pour éviter les erreurs SSR
let MapContainer, TileLayer, Polygon, FeatureGroup, useMap;
let EditControl;
let L;

if (typeof window !== 'undefined') {
  const leaflet = require('leaflet');
  L = leaflet;
  const reactLeaflet = require('react-leaflet');
  MapContainer = reactLeaflet.MapContainer;
  TileLayer = reactLeaflet.TileLayer;
  Polygon = reactLeaflet.Polygon;
  FeatureGroup = reactLeaflet.FeatureGroup;
  useMap = reactLeaflet.useMap;
  
  try {
    const leafletDraw = require('react-leaflet-draw');
    EditControl = leafletDraw.EditControl;
  } catch (e) {
    console.warn('react-leaflet-draw non disponible');
  }
  
  // Fix pour les icônes Leaflet
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}

/**
 * ParametresSecteurs - Gestion des secteurs d'intervention avec carte
 */
const ParametresSecteurs = ({ tenantSlug, toast }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secteurs, setSecteurs] = useState([]);
  const [statsUtilisation, setStatsUtilisation] = useState([]);
  
  // Vue active
  const [activeView, setActiveView] = useState('liste'); // 'liste' ou 'carte'
  const [mapType, setMapType] = useState('street'); // 'street' ou 'satellite'
  const [editMode, setEditMode] = useState(false);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedSecteur, setSelectedSecteur] = useState(null);
  
  // Centre de la carte (Shefford par défaut)
  const defaultCenter = [45.4042, -71.8929];
  const defaultZoom = 13;
  
  // Formulaire
  const [formData, setFormData] = useState({
    nom: "",
    type_secteur: "zone",
    code: "",
    description: "",
    couleur: "#3B82F6",
    actif: true,
    municipalites: [],
    codes_postaux: [],
    coordonnees: null // GeoJSON geometry pour polygone
  });
  
  // Input temporaire pour municipalités et codes postaux
  const [tempMunicipalite, setTempMunicipalite] = useState("");
  const [tempCodePostal, setTempCodePostal] = useState("");

  // Types de secteurs disponibles
  const TYPES_SECTEURS = [
    { value: "zone", label: "Zone numérotée", icon: Map, description: "Zone 1, Zone 2, etc." },
    { value: "municipalite", label: "Municipalité/Ville", icon: Building2, description: "Granby, Shefford, etc." },
    { value: "district", label: "District", icon: MapPin, description: "District Nord, Sud, etc." },
    { value: "caserne", label: "Caserne", icon: Home, description: "Caserne 1, Caserne 2, etc." },
    { value: "personnalise", label: "Personnalisé", icon: AlertTriangle, description: "Définition libre" }
  ];

  // Couleurs prédéfinies
  const COULEURS = [
    "#EF4444", "#F97316", "#EAB308", "#22C55E", "#14B8A6",
    "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#6B7280"
  ];

  // Charger les secteurs
  const loadSecteurs = useCallback(async () => {
    try {
      setLoading(true);
      const [secteursData, statsData] = await Promise.all([
        apiGet(tenantSlug, "/secteurs"),
        apiGet(tenantSlug, "/secteurs/stats/utilisation").catch(() => [])
      ]);
      setSecteurs(secteursData || []);
      setStatsUtilisation(statsData || []);
    } catch (error) {
      console.error("Erreur chargement secteurs:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les secteurs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, toast]);

  useEffect(() => {
    loadSecteurs();
  }, [loadSecteurs]);

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({
      nom: "",
      type_secteur: "zone",
      code: "",
      description: "",
      couleur: "#3B82F6",
      actif: true,
      municipalites: [],
      codes_postaux: [],
      coordonnees: null
    });
    setTempMunicipalite("");
    setTempCodePostal("");
  };

  // Ouvrir modal création
  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  // Ouvrir modal édition
  const openEditModal = (secteur) => {
    setSelectedSecteur(secteur);
    setFormData({
      nom: secteur.nom,
      type_secteur: secteur.type_secteur || "zone",
      code: secteur.code || "",
      description: secteur.description || "",
      couleur: secteur.couleur || "#3B82F6",
      actif: secteur.actif !== false,
      municipalites: secteur.municipalites || [],
      codes_postaux: secteur.codes_postaux || [],
      coordonnees: secteur.coordonnees || null
    });
    setShowEditModal(true);
  };

  // Ajouter une municipalité
  const addMunicipalite = () => {
    if (tempMunicipalite.trim() && !formData.municipalites.includes(tempMunicipalite.trim())) {
      setFormData(prev => ({
        ...prev,
        municipalites: [...prev.municipalites, tempMunicipalite.trim()]
      }));
      setTempMunicipalite("");
    }
  };

  // Retirer une municipalité
  const removeMunicipalite = (mun) => {
    setFormData(prev => ({
      ...prev,
      municipalites: prev.municipalites.filter(m => m !== mun)
    }));
  };

  // Ajouter un code postal
  const addCodePostal = () => {
    if (tempCodePostal.trim() && !formData.codes_postaux.includes(tempCodePostal.trim().toUpperCase())) {
      setFormData(prev => ({
        ...prev,
        codes_postaux: [...prev.codes_postaux, tempCodePostal.trim().toUpperCase()]
      }));
      setTempCodePostal("");
    }
  };

  // Retirer un code postal
  const removeCodePostal = (cp) => {
    setFormData(prev => ({
      ...prev,
      codes_postaux: prev.codes_postaux.filter(c => c !== cp)
    }));
  };

  // Créer un secteur
  const handleCreate = async () => {
    if (!formData.nom.trim()) {
      toast({ title: "Erreur", description: "Le nom est requis", variant: "destructive" });
      return;
    }
    
    try {
      setSaving(true);
      await apiPost(tenantSlug, "/secteurs", formData);
      toast({ title: "Succès", description: `Secteur "${formData.nom}" créé` });
      setShowCreateModal(false);
      loadSecteurs();
    } catch (error) {
      toast({ title: "Erreur", description: error.message || "Impossible de créer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Mettre à jour un secteur
  const handleUpdate = async () => {
    if (!selectedSecteur) return;
    
    try {
      setSaving(true);
      await apiPut(tenantSlug, `/secteurs/${selectedSecteur.id}`, formData);
      toast({ title: "Succès", description: `Secteur "${formData.nom}" mis à jour` });
      setShowEditModal(false);
      setSelectedSecteur(null);
      loadSecteurs();
    } catch (error) {
      toast({ title: "Erreur", description: error.message || "Impossible de mettre à jour", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Supprimer un secteur
  const handleDelete = async () => {
    if (!selectedSecteur) return;
    
    try {
      setSaving(true);
      await apiDelete(tenantSlug, `/secteurs/${selectedSecteur.id}`);
      toast({ title: "Succès", description: `Secteur "${selectedSecteur.nom}" supprimé` });
      setShowDeleteConfirm(false);
      setSelectedSecteur(null);
      loadSecteurs();
    } catch (error) {
      toast({ title: "Erreur", description: error.message || "Impossible de supprimer", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Initialiser les secteurs par défaut
  const handleInitDefault = async () => {
    if (!window.confirm("Voulez-vous créer les secteurs par défaut (5 zones) ?")) return;
    
    try {
      setSaving(true);
      const result = await apiPost(tenantSlug, "/secteurs/initialiser-defaut", {});
      toast({ title: "Succès", description: result.message });
      loadSecteurs();
    } catch (error) {
      toast({ title: "Erreur", description: error.message || "Impossible d'initialiser", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Obtenir les stats d'un secteur
  const getStats = (secteurId) => {
    return statsUtilisation.find(s => s.secteur_id === secteurId) || { total: 0, nb_interventions: 0, nb_batiments: 0 };
  };

  // Convertir les coordonnées GeoJSON en format Leaflet
  const convertGeoJSONToLeaflet = (geometry) => {
    if (!geometry || !geometry.coordinates) return [];
    // GeoJSON utilise [longitude, latitude], Leaflet utilise [latitude, longitude]
    return geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
  };

  // Convertir les coordonnées Leaflet en GeoJSON
  const convertLeafletToGeoJSON = (positions) => {
    if (!positions || positions.length === 0) return null;
    // Leaflet utilise [latitude, longitude], GeoJSON utilise [longitude, latitude]
    const coordinates = positions.map(pos => [pos[1], pos[0]]);
    // Fermer le polygone si nécessaire
    if (coordinates.length > 0 && 
        (coordinates[0][0] !== coordinates[coordinates.length - 1][0] || 
         coordinates[0][1] !== coordinates[coordinates.length - 1][1])) {
      coordinates.push(coordinates[0]);
    }
    return {
      type: "Polygon",
      coordinates: [coordinates]
    };
  };

  // Gestion du dessin de polygone
  const handlePolygonCreated = (e) => {
    const { layer } = e;
    const geojson = layer.toGeoJSON();
    setFormData(prev => ({
      ...prev,
      coordonnees: geojson.geometry
    }));
    toast({ title: "Zone définie", description: "Le polygone a été dessiné sur la carte" });
  };

  // Gestion de la modification de polygone
  const handlePolygonEdited = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      const geojson = layer.toGeoJSON();
      setFormData(prev => ({
        ...prev,
        coordonnees: geojson.geometry
      }));
    });
  };

  // Composant carte pour le formulaire
  const MapEditor = ({ initialCoordinates, onCoordinatesChange }) => {
    const featureGroupRef = useRef();
    
    useEffect(() => {
      // Si on a des coordonnées initiales, les afficher
      if (initialCoordinates && featureGroupRef.current) {
        // Clear existing layers
        featureGroupRef.current.clearLayers();
        
        // Add polygon if coordinates exist
        const positions = convertGeoJSONToLeaflet(initialCoordinates);
        if (positions.length > 0 && L) {
          const polygon = L.polygon(positions, {
            color: formData.couleur,
            fillColor: formData.couleur,
            fillOpacity: 0.3
          });
          featureGroupRef.current.addLayer(polygon);
        }
      }
    }, [initialCoordinates]);

    if (!MapContainer) return <div className="p-4 text-center text-gray-500">Chargement de la carte...</div>;

    return (
      <div className="h-[400px] rounded-lg overflow-hidden border border-gray-200 relative">
        {/* Toggle Carte/Satellite */}
        <div style={{ 
          position: 'absolute', 
          top: '10px', 
          right: '10px', 
          zIndex: 1000,
          display: 'flex',
          gap: '4px',
          backgroundColor: 'white',
          padding: '4px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          <button
            type="button"
            onClick={() => setMapType('street')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${mapType === 'street' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            🗺️ Plan
          </button>
          <button
            type="button"
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${mapType === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            🛰️ Satellite
          </button>
        </div>

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          maxZoom={19}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          {mapType === 'street' ? (
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          ) : (
            <TileLayer
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          )}
          
          {EditControl && (
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topleft"
                onCreated={(e) => {
                  const geojson = e.layer.toGeoJSON();
                  onCoordinatesChange(geojson.geometry);
                }}
                onEdited={(e) => {
                  e.layers.eachLayer((layer) => {
                    const geojson = layer.toGeoJSON();
                    onCoordinatesChange(geojson.geometry);
                  });
                }}
                onDeleted={() => {
                  onCoordinatesChange(null);
                }}
                draw={{
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polyline: false,
                  polygon: {
                    allowIntersection: false,
                    showArea: true,
                    shapeOptions: {
                      color: formData.couleur,
                      fillOpacity: 0.3
                    }
                  }
                }}
                edit={{
                  remove: true,
                  edit: true
                }}
              />
            </FeatureGroup>
          )}
        </MapContainer>
        
        <div className="absolute bottom-2 left-2 bg-white/90 px-2 py-1 rounded text-xs text-gray-600">
          💡 Cliquez sur l'icône polygone pour dessiner une zone
        </div>
      </div>
    );
  };

  // Composant carte de visualisation
  const MapViewer = () => {
    if (!MapContainer) return <div className="p-8 text-center text-gray-500">Chargement de la carte...</div>;

    return (
      <div className="h-[calc(100vh-400px)] min-h-[500px] rounded-lg overflow-hidden border border-gray-200 relative">
        {/* Toggle Carte/Satellite */}
        <div style={{ 
          position: 'absolute', 
          top: '10px', 
          right: '10px', 
          zIndex: 1000,
          display: 'flex',
          gap: '4px',
          backgroundColor: 'white',
          padding: '4px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          <button
            onClick={() => setMapType('street')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${mapType === 'street' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            🗺️ Plan
          </button>
          <button
            onClick={() => setMapType('satellite')}
            className={`px-3 py-1.5 text-xs font-medium rounded ${mapType === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
          >
            🛰️ Satellite
          </button>
        </div>

        {/* Bouton mode édition */}
        <div style={{ 
          position: 'absolute', 
          top: '10px', 
          left: '60px', 
          zIndex: 1000
        }}>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1 ${editMode ? 'bg-orange-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
            style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
          >
            {editMode ? <><Eye className="w-3 h-3" /> Vue</> : <><Pencil className="w-3 h-3" /> Éditer</>}
          </button>
        </div>

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          maxZoom={19}
          style={{ width: '100%', height: '100%' }}
          scrollWheelZoom={true}
        >
          {mapType === 'street' ? (
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          ) : (
            <TileLayer
              attribution='&copy; Esri'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          )}
          
          {/* Afficher les secteurs existants */}
          {secteurs.filter(s => s.coordonnees).map(secteur => {
            const positions = convertGeoJSONToLeaflet(secteur.coordonnees);
            if (positions.length === 0) return null;
            
            return (
              <Polygon
                key={secteur.id}
                positions={positions}
                pathOptions={{
                  color: secteur.couleur || '#3b82f6',
                  fillColor: secteur.couleur || '#3b82f6',
                  fillOpacity: 0.25,
                  weight: 2
                }}
                eventHandlers={{
                  click: () => {
                    setSelectedSecteur(secteur);
                    if (editMode) {
                      openEditModal(secteur);
                    }
                  }
                }}
              >
                {/* Popup au survol */}
              </Polygon>
            );
          })}
          
          {/* Mode édition: outils de dessin pour créer un nouveau secteur */}
          {editMode && EditControl && (
            <FeatureGroup>
              <EditControl
                position="topleft"
                onCreated={(e) => {
                  const geojson = e.layer.toGeoJSON();
                  // Préremplir le formulaire avec le nouveau polygone
                  setFormData(prev => ({
                    ...prev,
                    coordonnees: geojson.geometry
                  }));
                  setShowCreateModal(true);
                  // Supprimer le layer temporaire
                  if (e.layer._map) {
                    e.layer._map.removeLayer(e.layer);
                  }
                }}
                draw={{
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,
                  polyline: false,
                  polygon: {
                    allowIntersection: false,
                    showArea: true,
                    shapeOptions: {
                      color: '#3b82f6',
                      fillOpacity: 0.3
                    }
                  }
                }}
                edit={{ remove: false, edit: false }}
              />
            </FeatureGroup>
          )}
        </MapContainer>

        {/* Légende */}
        <div className="absolute bottom-2 left-2 bg-white/95 p-2 rounded-lg shadow-md max-w-xs">
          <div className="text-xs font-semibold mb-1.5 text-gray-700">Secteurs</div>
          <div className="space-y-1">
            {secteurs.filter(s => s.coordonnees).slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: s.couleur || '#3b82f6' }} />
                <span className="truncate">{s.nom}</span>
              </div>
            ))}
            {secteurs.filter(s => s.coordonnees).length > 5 && (
              <div className="text-xs text-gray-500">+{secteurs.filter(s => s.coordonnees).length - 5} autres</div>
            )}
          </div>
          {editMode && (
            <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-orange-600">
              🔶 Mode édition actif - Dessinez un polygone pour créer un secteur
            </div>
          )}
        </div>
      </div>
    );
  };

  // Rendu du formulaire
  const renderForm = () => (
    <Tabs defaultValue="general" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="general">Général</TabsTrigger>
        <TabsTrigger value="geographie">Géographie</TabsTrigger>
        <TabsTrigger value="carte">Carte</TabsTrigger>
      </TabsList>
      
      <TabsContent value="general" className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nom du secteur *</Label>
            <Input
              value={formData.nom}
              onChange={(e) => setFormData(prev => ({ ...prev, nom: e.target.value }))}
              placeholder="Ex: Zone Centre, District Nord..."
            />
          </div>
          <div>
            <Label>Code (optionnel)</Label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
              placeholder="Ex: Z1, DN, MTL"
              maxLength={10}
            />
          </div>
        </div>
        
        <div>
          <Label>Type de secteur</Label>
          <Select
            value={formData.type_secteur}
            onValueChange={(v) => setFormData(prev => ({ ...prev, type_secteur: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES_SECTEURS.map(t => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    <t.icon className="w-4 h-4" />
                    <span>{t.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 mt-1">
            {TYPES_SECTEURS.find(t => t.value === formData.type_secteur)?.description}
          </p>
        </div>
        
        <div>
          <Label>Description</Label>
          <Input
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Description optionnelle..."
          />
        </div>
        
        <div>
          <Label>Couleur</Label>
          <div className="flex gap-2 mt-1">
            {COULEURS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, couleur: c }))}
                className={`w-8 h-8 rounded-full transition-all ${
                  formData.couleur === c ? 'ring-2 ring-offset-2 ring-gray-600 scale-110' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={formData.couleur}
              onChange={(e) => setFormData(prev => ({ ...prev, couleur: e.target.value }))}
              className="w-8 h-8 rounded cursor-pointer"
            />
          </div>
        </div>
        
        {/* Actif */}
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.actif}
            onCheckedChange={(v) => setFormData(prev => ({ ...prev, actif: v }))}
          />
          <Label>Secteur actif</Label>
        </div>
      </TabsContent>
      
      <TabsContent value="geographie" className="space-y-4 mt-4">
        {/* Municipalités incluses */}
        <div>
          <Label>Municipalités incluses</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={tempMunicipalite}
              onChange={(e) => setTempMunicipalite(e.target.value)}
              placeholder="Ajouter une municipalité..."
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMunicipalite())}
            />
            <Button type="button" variant="outline" onClick={addMunicipalite}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {formData.municipalites.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {formData.municipalites.map(mun => (
                <span
                  key={mun}
                  className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-full flex items-center gap-1"
                >
                  {mun}
                  <button type="button" onClick={() => removeMunicipalite(mun)} className="hover:text-blue-900">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        
        {/* Codes postaux inclus */}
        <div>
          <Label>Codes postaux inclus</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={tempCodePostal}
              onChange={(e) => setTempCodePostal(e.target.value)}
              placeholder="Ex: J2G, J2H..."
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCodePostal())}
            />
            <Button type="button" variant="outline" onClick={addCodePostal}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {formData.codes_postaux.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {formData.codes_postaux.map(cp => (
                <span
                  key={cp}
                  className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full flex items-center gap-1"
                >
                  {cp}
                  <button type="button" onClick={() => removeCodePostal(cp)} className="hover:text-green-900">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        
        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600">
          💡 Les municipalités et codes postaux permettent de définir des critères de filtrage pour les interventions et bâtiments dans ce secteur.
        </div>
      </TabsContent>
      
      <TabsContent value="carte" className="mt-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Zone géographique (polygone)</Label>
            {formData.coordonnees && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={() => setFormData(prev => ({ ...prev, coordonnees: null }))}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Effacer la zone
              </Button>
            )}
          </div>
          
          <MapEditor 
            initialCoordinates={formData.coordonnees}
            onCoordinatesChange={(coords) => setFormData(prev => ({ ...prev, coordonnees: coords }))}
          />
          
          {formData.coordonnees ? (
            <div className="bg-green-50 border border-green-200 p-2 rounded text-sm text-green-700 flex items-center gap-2">
              <Check className="w-4 h-4" />
              Zone définie sur la carte
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-sm text-yellow-700">
              ℹ️ Dessinez un polygone sur la carte pour définir les limites géographiques du secteur
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        <span>Chargement des secteurs...</span>
      </div>
    );
  }

  return (
    <div className="parametres-secteurs space-y-6" data-testid="parametres-secteurs">
      {/* En-tête */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6" />
            Secteurs d'intervention
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Définissez les secteurs géographiques pour vos interventions et bâtiments
          </p>
        </div>
        <div className="flex gap-2">
          {/* Toggle Vue */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setActiveView('liste')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeView === 'liste' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              📋 Liste
            </button>
            <button
              onClick={() => setActiveView('carte')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeView === 'carte' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              🗺️ Carte
            </button>
          </div>
          
          {secteurs.length === 0 && (
            <Button variant="outline" onClick={handleInitDefault} disabled={saving}>
              Initialiser par défaut
            </Button>
          )}
          <Button onClick={openCreateModal} data-testid="create-secteur-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nouveau secteur
          </Button>
        </div>
      </div>

      {/* Vue Carte */}
      {activeView === 'carte' && <MapViewer />}

      {/* Vue Liste */}
      {activeView === 'liste' && (
        <>
          {secteurs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Aucun secteur défini</p>
                <p className="text-sm">Créez des secteurs pour organiser vos interventions géographiquement</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {secteurs.map(secteur => {
                const stats = getStats(secteur.id);
                const TypeIcon = TYPES_SECTEURS.find(t => t.value === secteur.type_secteur)?.icon || MapPin;
                
                return (
                  <Card key={secteur.id} className={`${!secteur.actif ? 'opacity-60' : ''} hover:shadow-md transition-shadow`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: secteur.couleur }}
                          />
                          <CardTitle className="text-lg">
                            {secteur.nom}
                            {secteur.code && (
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                ({secteur.code})
                              </span>
                            )}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          {secteur.coordonnees && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" title="Zone définie sur la carte">
                              📍
                            </span>
                          )}
                          {!secteur.actif && (
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                              Inactif
                            </span>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <TypeIcon className="w-4 h-4" />
                          <span>{TYPES_SECTEURS.find(t => t.value === secteur.type_secteur)?.label}</span>
                        </div>
                        
                        {secteur.description && (
                          <p className="text-gray-500 text-xs">{secteur.description}</p>
                        )}
                        
                        {/* Municipalités */}
                        {secteur.municipalites?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {secteur.municipalites.slice(0, 3).map(m => (
                              <span key={m} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                {m}
                              </span>
                            ))}
                            {secteur.municipalites.length > 3 && (
                              <span className="text-xs text-gray-500">+{secteur.municipalites.length - 3}</span>
                            )}
                          </div>
                        )}
                        
                        {/* Codes postaux */}
                        {secteur.codes_postaux?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {secteur.codes_postaux.slice(0, 4).map(cp => (
                              <span key={cp} className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">
                                {cp}
                              </span>
                            ))}
                            {secteur.codes_postaux.length > 4 && (
                              <span className="text-xs text-gray-500">+{secteur.codes_postaux.length - 4}</span>
                            )}
                          </div>
                        )}
                        
                        {/* Stats d'utilisation */}
                        <div className="flex gap-3 pt-2 border-t text-xs text-gray-500">
                          <span>{stats.nb_interventions} intervention(s)</span>
                          <span>{stats.nb_batiments} bâtiment(s)</span>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditModal(secteur)}
                          data-testid={`edit-secteur-${secteur.id}`}
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Modifier
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSecteur(secteur);
                            setShowDeleteConfirm(true);
                          }}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`delete-secteur-${secteur.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal Création */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nouveau secteur
            </DialogTitle>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Édition */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Modifier le secteur
            </DialogTitle>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Annuler
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Suppression */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Supprimer le secteur
            </DialogTitle>
          </DialogHeader>
          <p>Êtes-vous sûr de vouloir supprimer le secteur <strong>"{selectedSecteur?.nom}"</strong> ?</p>
          <p className="text-sm text-gray-500">
            Note : Un secteur utilisé dans des interventions ou bâtiments ne peut pas être supprimé.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParametresSecteurs;
