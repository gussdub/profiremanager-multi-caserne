import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';
import IconePersonnaliseeModal from './IconePersonnaliseeModal';
import GaleriePhotosBuilder from './GaleriePhotosBuilder';

// Fix pour les icônes Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const PlanInterventionBuilder = ({ tenantSlug, batiment, existingPlan, onClose, onSave }) => {
  console.log('🚀 PlanInterventionBuilder monté avec existingPlan:', existingPlan);
  console.log('🚀 Layers dans existingPlan au montage:', existingPlan?.layers);
  
  const [formData, setFormData] = useState({
    titre: existingPlan?.titre || `Plan d'intervention - ${batiment?.nom_etablissement || batiment?.adresse_civique}`,
    description: existingPlan?.description || '',
    statut: existingPlan?.statut || 'brouillon',
    risques_identifies: existingPlan?.risques_identifies || [],
    points_acces: existingPlan?.points_acces || [],
    zones_dangereuses: existingPlan?.zones_dangereuses || [],
    equipements: existingPlan?.equipements || [],
    notes_tactiques: existingPlan?.notes_tactiques || '',
  });

  const [layers, setLayers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [map, setMap] = useState(null);
  const markersRef = useRef([]);
  
  // États pour la palette de symboles et modals
  const [mapType, setMapType] = useState('satellite');
  const [showSymbolPalette, setShowSymbolPalette] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [customSymbols, setCustomSymbols] = useState([]);
  const [showAddSymbolModal, setShowAddSymbolModal] = useState(false);
  const [showEditSymbolModal, setShowEditSymbolModal] = useState(false);
  const [symbolToEdit, setSymbolToEdit] = useState(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [symbolToDelete, setSymbolToDelete] = useState(null);

  // Charger les layers depuis existingPlan au montage ou quand il change
  useEffect(() => {
    console.log('🔍 useEffect déclenché - existingPlan:', existingPlan);
    console.log('🔍 existingPlan?.layers:', existingPlan?.layers);
    console.log('🔍 Nombre de layers dans existingPlan:', existingPlan?.layers?.length || 0);
    
    if (existingPlan?.layers && existingPlan.layers.length > 0) {
      console.log('📥 Chargement des layers depuis existingPlan:', existingPlan.layers);
      setLayers(existingPlan.layers);
    } else {
      console.log('⚠️ Aucun layer à charger depuis existingPlan');
    }
  }, [existingPlan]);

  // Restaurer les layers sur la carte Leaflet
  useEffect(() => {
    // Conditions de sortie rapide
    if (!map) {
      console.log('⚠️ Pas de carte disponible');
      return;
    }
    
    // 🧹 NETTOYER les markers existants avant d'en créer de nouveaux
    if (markersRef.current && markersRef.current.length > 0) {
      markersRef.current.forEach(marker => {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
      });
      markersRef.current = [];
      console.log('🧹 Markers précédents nettoyés');
    }
    
    if (!layers || layers.length === 0) {
      console.log('⚠️ Aucun layer à restaurer');
      return;
    }
    
    console.log('🗺️ Restauration de', layers.length, 'layers');
    
    // Fonction pour créer un marker à partir d'un layer
    const createMarkerFromLayer = (layer) => {
      try {
        // Vérifier que c'est un symbole avec des coordonnées
        if ((layer.type !== 'symbol' && layer.type !== 'marker') || 
            layer.geometry?.type !== 'Point' || 
            !layer.geometry?.coordinates) {
          return null;
        }
        
        const [lng, lat] = layer.geometry.coordinates;
        const props = layer.properties || {};
        
        // Créer l'icône
        let icon = null;
        
        if (props.isCustom && props.image) {
          icon = L.divIcon({
            html: `<img src="${props.image}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5));" />`,
            className: 'custom-image-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
        } else if (props.symbol) {
          icon = L.divIcon({
            html: `<div style="font-size: 32px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${props.symbol}</div>`,
            className: 'custom-emoji-marker',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          });
        }
        
        // Créer le marker
        const marker = icon 
          ? L.marker([lat, lng], { icon, draggable: true })
          : L.marker([lat, lng], { draggable: true });
        
        // Ajouter l'ID pour pouvoir supprimer
        marker.layerId = layer.id;
        
        // Événement de suppression
        marker.on('contextmenu', function() {
          if (window.confirm('🗑️ Supprimer ce symbole ?')) {
            setLayers(prevLayers => prevLayers.filter(l => l.id !== layer.id));
            if (map.hasLayer(marker)) {
              map.removeLayer(marker);
            }
          }
        });
        
        // Popup
        if (props.label) {
          const symbolDisplay = props.isCustom && props.image
            ? `<img src="${props.image}" style="width: 40px; height: 40px; object-fit: contain;" />`
            : `<div style="font-size: 24px;">${props.symbol || '📍'}</div>`;
          
          const popupContent = props.note 
            ? `<div style="min-width: 150px;">
                 <div style="text-align: center; margin-bottom: 8px;">${symbolDisplay}</div>
                 <strong>${props.label}</strong><br/>
                 <div style="margin-top: 8px; color: #666; font-size: 13px;">${props.note}</div>
                 <hr style="margin: 8px 0;"/>
                 <div style="font-size: 11px; color: #999; text-align: center;">Clic droit pour supprimer</div>
               </div>`
            : `<div style="text-align: center;">
                 <div style="margin-bottom: 5px;">${symbolDisplay}</div>
                 <strong>${props.label}</strong>
                 <hr style="margin: 8px 0;"/>
                 <div style="font-size: 11px; color: #999;">Clic droit pour supprimer</div>
               </div>`;
          
          marker.bindPopup(popupContent);
        }
        
        return marker;
      } catch (error) {
        console.error('Erreur création marker:', error);
        return null;
      }
    };
    
    // Créer tous les markers et autres layers
    const timeoutId = setTimeout(() => {
      const newMarkers = [];
      
      layers.forEach((layer, index) => {
        try {
          // Gérer les markers/symbols
          if (layer.type === 'symbol' || layer.type === 'marker') {
            const marker = createMarkerFromLayer(layer);
            if (marker) {
              marker.addTo(map);
              newMarkers.push(marker);
              console.log('✅ Symbol/Marker ajouté à la carte');
            }
          }
          
          // Gérer les polygons
          if (layer.type === 'polygon' && layer.geometry?.coordinates) {
            const positions = layer.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
            const polygon = L.polygon(positions, {
              color: layer.properties?.color || '#3b82f6'
            });
            polygon.addTo(map);
            console.log('✅ Polygon ajouté à la carte');
          }
          
          // Gérer les polylines
          if (layer.type === 'polyline' && layer.geometry?.coordinates) {
            const positions = layer.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            const polyline = L.polyline(positions, {
              color: layer.properties?.color || '#3b82f6'
            });
            polyline.addTo(map);
            console.log('✅ Polyline ajouté à la carte');
          }
          
          // Gérer les circles
          if (layer.type === 'circle' && layer.geometry?.coordinates) {
            const [lng, lat] = layer.geometry.coordinates;
            const circle = L.circle([lat, lng], {
              radius: layer.properties?.radius || 50,
              color: layer.properties?.color || '#3b82f6'
            });
            circle.addTo(map);
            console.log('✅ Circle ajouté à la carte');
          }
        } catch (error) {
          console.error('❌ Erreur lors de la restauration du layer', index, ':', error);
        }
      });
      
      // Stocker les markers pour cleanup
      markersRef.current = newMarkers;
    }, 100);
    
    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [map, layers, customSymbols]);

  // Palette de symboles pour les plans d'intervention
  const symbolCategories = {
    'Dangers & Risques': [
      { emoji: '⚡', label: 'Électricité / Hydro-Québec', color: '#fbbf24' },
      { emoji: '⛽', label: 'Essence', color: '#ef4444' },
      { emoji: '🛢️', label: 'Diesel / Mazout', color: '#7c2d12' },
      { emoji: '🔥', label: 'Gaz naturel / Propane', color: '#f97316' },
      { emoji: '☢️', label: 'Matières dangereuses', color: '#dc2626' },
      { emoji: '💥', label: 'Explosifs', color: '#991b1b' },
      { emoji: '⚠️', label: 'Zone à risque', color: '#eab308' },
    ],
    'Sécurité & Équipements': [
      { emoji: '🚪', label: 'Sortie d\'urgence', color: '#10b981' },
      { emoji: '🧯', label: 'Extincteur', color: '#dc2626' },
      { emoji: '🚨', label: 'Alarme incendie', color: '#ef4444' },
      { emoji: '🔵', label: 'Borne-fontaine', color: '#3b82f6' },
      { emoji: '🚿', label: 'Gicleurs / Sprinklers', color: '#0ea5e9' },
      { emoji: '🚰', label: 'Robinet d\'incendie (RIA)', color: '#2563eb' },
      { emoji: '🪜', label: 'Échelle fixe', color: '#6b7280' },
      { emoji: '🚑', label: 'Premiers soins', color: '#ef4444' },
    ],
    'Points Stratégiques': [
      { emoji: '📍', label: 'Point de rassemblement', color: '#10b981' },
      { emoji: '🚒', label: 'Accès pompiers', color: '#dc2626' },
      { emoji: '🔌', label: 'Panneau électrique', color: '#f59e0b' },
      { emoji: '🔒', label: 'Vanne d\'arrêt gaz', color: '#f97316' },
      { emoji: '💧', label: 'Vanne d\'arrêt eau', color: '#3b82f6' },
      { emoji: '🚪', label: 'Entrée principale', color: '#059669' },
      { emoji: '🏢', label: 'Bâtiment', color: '#64748b' },
      { emoji: '🅿️', label: 'Stationnement', color: '#6b7280' },
    ],
  };

  // Centre la carte sur le bâtiment
  const center = batiment?.latitude && batiment?.longitude 
    ? [batiment.latitude, batiment.longitude]
    : [45.4042, -71.8929]; // Défaut

  // Charger les symboles personnalisés
  useEffect(() => {
    const fetchCustomSymbols = async () => {
      try {
        const token = getTenantToken();
        const response = await axios.get(
          buildApiUrl(tenantSlug, '/prevention/symboles-personnalises'),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCustomSymbols(response.data || []);
      } catch (error) {
        console.error('Erreur chargement symboles personnalisés:', error);
      }
    };

    if (tenantSlug) {
      fetchCustomSymbols();
    }
  }, [tenantSlug]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const placeSymbolOnMap = (symbol, latlng) => {
    const note = prompt(`Ajouter une note pour ce symbole (${symbol.label}):`);
    
    // Créer un marqueur personnalisé avec l'emoji ou l'image
    let icon;
    if (symbol.isCustom && symbol.image) {
      // Symbole personnalisé avec image
      icon = L.divIcon({
        html: `<img src="${symbol.image}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5));" />`,
        className: 'custom-image-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
    } else {
      // Symbole emoji standard
      icon = L.divIcon({
        html: `<div style="font-size: 32px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">${symbol.emoji}</div>`,
        className: 'custom-emoji-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
    }

    // Note: Le marker sera créé et ajouté à la carte par le useEffect
    // qui observe le state 'layers'. Cela évite la duplication.

    // Ajouter aux données
    const layerData = {
      id: Date.now().toString(),
      type: 'symbol',
      geometry: {
        type: 'Point',
        coordinates: [latlng.lng, latlng.lat]
      },
      properties: {
        symbol: symbol.emoji,
        label: symbol.label,
        note: note || '',
        color: symbol.color,
        symbolId: symbol.symbolId || null,  // ID du symbole personnalisé si applicable
        isCustom: symbol.isCustom || false,
        image: symbol.image || null  // Sauvegarder l'image pour les symboles personnalisés
      }
    };

    setLayers(prev => [...prev, layerData]);

    // Catégoriser selon le type
    if (symbol.label.includes('urgence') || symbol.label.includes('Accès')) {
      setFormData(prev => ({
        ...prev,
        points_acces: [...prev.points_acces, { description: `${symbol.emoji} ${symbol.label}${note ? ': ' + note : ''}`, geometry: layerData.geometry }]
      }));
    } else if (symbol.label.includes('risque') || symbol.label.includes('danger') || symbol.label.includes('Explosifs') || symbol.label.includes('Matières')) {
      setFormData(prev => ({
        ...prev,
        zones_dangereuses: [...prev.zones_dangereuses, { description: `${symbol.emoji} ${symbol.label}${note ? ': ' + note : ''}`, geometry: layerData.geometry }]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        equipements: [...prev.equipements, { description: `${symbol.emoji} ${symbol.label}${note ? ': ' + note : ''}`, type: 'autre', geometry: layerData.geometry }]
      }));
    }
  };

  const handleSymbolClick = (symbol) => {
    setSelectedSymbol(symbol);
    // NE PAS fermer la palette pour permettre la sélection
    // setShowSymbolPalette(false);
    
    // Activer le mode placement sur la carte
    if (map) {
      // Changer le curseur
      map.getContainer().style.cursor = 'crosshair';
      
      map.once('click', (e) => {
        placeSymbolOnMap(symbol, e.latlng);
        setSelectedSymbol(null);
        // Remettre le curseur normal
        map.getContainer().style.cursor = '';
      });
    }
  };

  // Gérer le drag and drop des symboles
  const handleDragStart = (e, symbol) => {
    e.dataTransfer.setData('symbol', JSON.stringify(symbol));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleMapDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleMapDrop = (e) => {
    e.preventDefault();
    
    try {
      const symbolData = JSON.parse(e.dataTransfer.getData('symbol'));
      
      // Obtenir les coordonnées de la carte à partir de la position du drop
      if (map) {
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const latlng = map.containerPointToLatLng([x, y]);
        
        placeSymbolOnMap(symbolData, latlng);
      }
    } catch (error) {
      console.error('Erreur lors du drop:', error);
    }
  };

  const handleCreated = (e) => {
    const { layerType, layer } = e;
    const geojson = layer.toGeoJSON();
    
    // Demander le type et la description de l'élément
    const type = prompt('Type d\'élément:\n1. Point d\'accès\n2. Zone dangereuse\n3. Équipement\n4. Route d\'accès', '1');
    const description = prompt('Description de cet élément:');
    
    if (!description) {
      map.removeLayer(layer);
      return;
    }

    const layerData = {
      id: Date.now().toString(),
      type: layerType,
      geometry: geojson.geometry,
      properties: {
        type: type === '1' ? 'acces' : type === '2' ? 'danger' : type === '3' ? 'equipement' : 'route',
        description
      }
    };

    setLayers(prev => [...prev, layerData]);

    // Ajouter la couche à la catégorie appropriée
    if (type === '1') {
      setFormData(prev => ({
        ...prev,
        points_acces: [...prev.points_acces, { description, geometry: geojson.geometry }]
      }));
    } else if (type === '2') {
      setFormData(prev => ({
        ...prev,
        zones_dangereuses: [...prev.zones_dangereuses, { description, geometry: geojson.geometry }]
      }));
    } else if (type === '3') {
      setFormData(prev => ({
        ...prev,
        equipements: [...prev.equipements, { description, type: 'autre', geometry: geojson.geometry }]
      }));
    }
  };

  const handleEdited = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      const geojson = layer.toGeoJSON();
      console.log('Layer edited:', geojson);
    });
  };

  const handleDeleted = (e) => {
    const layers = e.layers;
    layers.eachLayer((layer) => {
      console.log('Layer deleted');
    });
  };

  const handleSavePlan = async () => {
    try {
      setSaving(true);
      const token = getTenantToken();

      // Nettoyer les layers pour enlever toute référence circulaire ou objet non sérialisable
      const cleanLayers = layers.map(layer => ({
        id: layer.id,
        type: layer.type,
        geometry: layer.geometry,
        properties: layer.properties
      }));

      const planData = {
        ...formData,
        batiment_id: batiment.id,
        centre_lat: batiment.latitude || 0,
        centre_lng: batiment.longitude || 0,
        layers: cleanLayers
      };

      console.log('📤 Envoi du plan:', planData);
      console.log('📤 Nombre de layers à sauvegarder:', cleanLayers.length);
      console.log('📤 Layers détaillés:', JSON.stringify(cleanLayers, null, 2));

      let response;
      if (existingPlan) {
        // Mise à jour
        response = await axios.put(
          buildApiUrl(tenantSlug, `/prevention/plans-intervention/${existingPlan.id}`),
          planData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        // Création
        response = await axios.post(
          buildApiUrl(tenantSlug, '/prevention/plans-intervention'),
          planData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      console.log('📥 Réponse du serveur après sauvegarde:', response.data);
      console.log('📥 Layers dans la réponse:', response.data?.layers);
      
      alert('Plan d\'intervention sauvegardé avec succès! 🎉');
      if (onSave) onSave(response.data);
      if (onClose) onClose();
    } catch (error) {
      console.error('❌ Erreur sauvegarde plan:', error);
      console.error('Détails:', error.response?.data);
      
      // Gérer les différents types de détails d'erreur
      let errorMessage = 'Erreur lors de la sauvegarde du plan';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          // Erreur de validation Pydantic
          errorMessage += ':\n' + detail.map(err => `- ${err.loc?.join('.') || 'champ'}: ${err.msg}`).join('\n');
        } else if (typeof detail === 'object') {
          errorMessage += ': ' + JSON.stringify(detail);
        } else {
          errorMessage += ': ' + detail;
        }
      } else {
        errorMessage += ': ' + error.message;
      }
      
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!window.confirm('⚠️ Êtes-vous sûr de vouloir supprimer définitivement ce plan d\'intervention ?')) return;

    try {
      setSaving(true);
      const token = getTenantToken();
      
      await axios.delete(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${existingPlan.id}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Plan d\'intervention supprimé avec succès! 🗑️');
      if (onClose) onClose();
    } catch (error) {
      console.error('❌ Erreur suppression plan:', error);
      alert(`Erreur lors de la suppression: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForValidation = async () => {
    if (!window.confirm('Soumettre ce plan pour validation?')) return;
    
    try {
      setSaving(true);
      const token = getTenantToken();

      await axios.post(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${existingPlan.id}/valider`),
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Plan soumis pour validation!');
      if (onClose) onClose();
    } catch (error) {
      console.error('Erreur soumission plan:', error);
      alert('Erreur lors de la soumission');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSymbol = (symbol) => {
    setSymbolToEdit(symbol);
    setShowEditSymbolModal(true);
  };

  const handleDeleteSymbol = (symbol) => {
    setSymbolToDelete(symbol);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteSymbol = async () => {
    if (!symbolToDelete) return;

    try {
      const token = getTenantToken();
      
      await axios.delete(
        buildApiUrl(tenantSlug, `/prevention/symboles-personnalises/${symbolToDelete.id}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Retirer le symbole de la liste
      setCustomSymbols(prev => prev.filter(s => s.id !== symbolToDelete.id));
      setShowDeleteConfirmModal(false);
      setSymbolToDelete(null);
      alert('Symbole supprimé avec succès! ✅');
    } catch (error) {
      console.error('Erreur suppression symbole:', error);
      const errorMessage = error.response?.data?.detail || error.message;
      alert(`Erreur lors de la suppression: ${errorMessage}`);
    }
  };

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: '#f9fafb',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ 
        backgroundColor: '#fff',
        borderBottom: '2px solid #e5e7eb',
        padding: '15px 20px',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, marginBottom: '3px' }}>
            🗺️ {existingPlan ? 'Modifier' : 'Créer'} un Plan d'Intervention
          </h1>
          <p style={{ color: '#6b7280', fontSize: '13px', margin: 0 }}>
            🏢 {batiment?.nom_etablissement || batiment?.adresse_civique}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" onClick={onClose}>
            ❌ Annuler
          </Button>
          {existingPlan && (
            <Button 
              onClick={handleDeletePlan} 
              disabled={saving}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none'
              }}
            >
              🗑️ Supprimer
            </Button>
          )}
          <Button onClick={handleSavePlan} disabled={saving}>
            {saving ? '⏳ Sauvegarde...' : '💾 Sauvegarder'}
          </Button>
          {existingPlan && existingPlan.statut === 'brouillon' && (
            <Button onClick={handleSubmitForValidation} disabled={saving}>
              ✅ Soumettre pour validation
            </Button>
          )}
        </div>
      </div>

      {/* Layout 3 colonnes */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Colonne gauche - Palette de symboles (300px) */}
        <div style={{ 
          width: '300px', 
          backgroundColor: '#fff', 
          borderRight: '1px solid #e5e7eb',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
              🎨 Palette de Symboles
            </h3>
            {selectedSymbol ? (
              <p style={{ fontSize: '12px', color: '#2563eb', margin: 0, fontWeight: 'bold' }}>
                ✨ "{selectedSymbol.label}" sélectionné
              </p>
            ) : (
              <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                Drag & drop ou clic
              </p>
            )}
            <Button
              onClick={() => setShowAddSymbolModal(true)}
              style={{
                backgroundColor: '#8b5cf6',
                color: 'white',
                padding: '6px 12px',
                fontSize: '12px',
                marginTop: '10px',
                width: '100%'
              }}
            >
              ➕ Ajouter Symbole
            </Button>
          </div>
          
          <div style={{ padding: '15px', flex: 1, overflowY: 'auto' }}>
            {/* Symboles personnalisés en premier */}
            {customSymbols.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: '#374151' }}>
                  🎨 Symboles Personnalisés
                </h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px'
                }}>
                    {customSymbols.map((symbol) => (
                      <div
                        key={symbol.id}
                        style={{ position: 'relative' }}
                      >
                        <button
                          draggable
                          onDragStart={(e) => handleDragStart(e, { 
                            emoji: null, 
                            image: symbol.image_base64,
                            label: symbol.nom, 
                            color: symbol.couleur,
                            isCustom: true,
                            symbolId: symbol.id
                          })}
                          onClick={() => handleSymbolClick({ 
                            emoji: null, 
                            image: symbol.image_base64,
                            label: symbol.nom, 
                            color: symbol.couleur,
                            isCustom: true,
                            symbolId: symbol.id
                          })}
                          style={{
                            padding: '12px',
                            border: selectedSymbol?.label === symbol.nom ? `3px solid ${symbol.couleur}` : `2px solid ${symbol.couleur}`,
                            borderRadius: '8px',
                            backgroundColor: selectedSymbol?.label === symbol.nom ? `${symbol.couleur}30` : 'white',
                            cursor: 'grab',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.2s',
                            textAlign: 'center',
                            boxShadow: selectedSymbol?.label === symbol.nom ? `0 0 10px ${symbol.couleur}` : 'none',
                            width: '100%'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                            // Afficher les boutons Edit/Delete
                            const parent = e.currentTarget.parentElement;
                            const actionButtons = parent.querySelector('.action-buttons');
                            if (actionButtons) {
                              actionButtons.style.display = 'flex';
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                            // Cacher les boutons Edit/Delete
                            const parent = e.currentTarget.parentElement;
                            const actionButtons = parent.querySelector('.action-buttons');
                            if (actionButtons) {
                              actionButtons.style.display = 'none';
                            }
                          }}
                        >
                          <img 
                            src={symbol.image_base64} 
                            alt={symbol.nom}
                            style={{ 
                              width: '32px', 
                              height: '32px',
                              objectFit: 'contain',
                              pointerEvents: 'none'
                            }} 
                          />
                          <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.2', pointerEvents: 'none' }}>
                            {symbol.nom}
                          </div>
                        </button>
                        
                        {/* Boutons Edit/Delete */}
                        <div 
                          className="action-buttons"
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            display: 'none',
                            gap: '2px',
                            zIndex: 10,
                            pointerEvents: 'auto'
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSymbol(symbol);
                            }}
                            title="Modifier"
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSymbol(symbol);
                            }}
                            title="Supprimer"
                            style={{
                              width: '24px',
                              height: '24px',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Symboles standards */}
              {Object.entries(symbolCategories).map(([category, symbols]) => (
                <div key={category} style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#374151' }}>
                    {category}
                  </h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px'
                }}>
                    {symbols.map((symbol, idx) => (
                      <button
                        key={idx}
                        draggable
                        onDragStart={(e) => handleDragStart(e, symbol)}
                        onClick={() => handleSymbolClick(symbol)}
                        style={{
                          padding: '12px',
                          border: selectedSymbol?.emoji === symbol.emoji ? `3px solid ${symbol.color}` : `2px solid ${symbol.color}`,
                          borderRadius: '8px',
                          backgroundColor: selectedSymbol?.emoji === symbol.emoji ? `${symbol.color}30` : 'white',
                          cursor: 'grab',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '5px',
                          transition: 'all 0.2s',
                          textAlign: 'center',
                          boxShadow: selectedSymbol?.emoji === symbol.emoji ? `0 0 10px ${symbol.color}` : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)';
                          e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        onDragEnd={(e) => {
                          e.currentTarget.style.cursor = 'grab';
                        }}
                      >
                        <div style={{ fontSize: '28px', pointerEvents: 'none' }}>{symbol.emoji}</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', lineHeight: '1.2', pointerEvents: 'none' }}>
                          {symbol.label}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Colonne centrale - Carte (flexible) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', position: 'relative' }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              🗺️ Carte Interactive
            </h3>
          </div>
          <div style={{ flex: 1, position: 'relative' }}>
            <div 
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              onDragOver={handleMapDragOver}
              onDrop={handleMapDrop}
            >
                {/* Toggle Vue Carte / Satellite - intégré sur la carte */}
                <div style={{ 
                  position: 'absolute', 
                  top: '10px', 
                  left: '10px', 
                  zIndex: 1000,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  backgroundColor: 'white',
                  padding: '5px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  <button
                    onClick={() => setMapType('street')}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: mapType === 'street' ? '#2563eb' : '#fff',
                      color: mapType === 'street' ? '#fff' : '#333',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: mapType === 'street' ? 'bold' : 'normal'
                    }}
                  >
                    🗺️ Carte
                  </button>
                  <button
                    onClick={() => setMapType('satellite')}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: mapType === 'satellite' ? '#2563eb' : '#fff',
                      color: mapType === 'satellite' ? '#fff' : '#333',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: mapType === 'satellite' ? 'bold' : 'normal'
                    }}
                  >
                    🛰️ Satellite
                  </button>
                </div>

                {/* Aide pour supprimer les symboles */}
                <div style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '10px',
                  zIndex: 1000,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  fontSize: '12px',
                  color: '#666',
                  border: '1px solid #e5e7eb'
                }}>
                  💡 <strong>Astuce :</strong> Clic droit sur un symbole pour le supprimer
                </div>
                <MapContainer
                  center={center}
                  zoom={18}
                  maxZoom={19}
                  style={{ width: '100%', height: '100%' }}
                  whenReady={(mapInstance) => setMap(mapInstance.target)}
                >
                  {mapType === 'street' ? (
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxZoom={19}
                    />
                  ) : (
                    <TileLayer
                      attribution='Tiles &copy; Esri'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                      maxZoom={19}
                    />
                  )}

                  {/* Marqueur du bâtiment */}
                  {batiment?.latitude && batiment?.longitude && (
                    <Marker position={[batiment.latitude, batiment.longitude]}>
                      <Popup>
                        <div style={{ padding: '5px' }}>
                          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 'bold' }}>
                            🏢 {batiment.nom_etablissement || 'Bâtiment'}
                          </h3>
                          <p style={{ margin: '3px 0', fontSize: '12px' }}>
                            {batiment.adresse_civique}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Outils de dessin */}
                  <FeatureGroup>
                    <EditControl
                      position="topright"
                      onCreated={handleCreated}
                      onEdited={handleEdited}
                      onDeleted={handleDeleted}
                      draw={{
                        rectangle: false,
                        circle: true,
                        circlemarker: false,
                        marker: true,
                        polyline: true,
                        polygon: {
                          allowIntersection: false,
                          showArea: true,
                          drawError: {
                            color: '#e1e100',
                            message: ''
                          },
                          shapeOptions: {
                            color: '#3b82f6'
                          }
                        }
                      }}
                      edit={{
                        remove: true,
                        edit: true
                      }}
                    />
                  </FeatureGroup>
                </MapContainer>
            </div>
          </div>
        </div>

        {/* Colonne droite - Formulaire (300px) */}
        <div style={{ 
          width: '300px', 
          backgroundColor: '#fff', 
          borderLeft: '1px solid #e5e7eb',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '15px', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
              📋 Informations du Plan
            </h3>
          </div>
          
          <div style={{ padding: '15px', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Titre
                    </label>
                    <input
                      type="text"
                      name="titre"
                      value={formData.titre}
                      onChange={handleChange}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Description
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows="3"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                      Notes Tactiques
                    </label>
                    <textarea
                      name="notes_tactiques"
                      value={formData.notes_tactiques}
                      onChange={handleChange}
                      placeholder="Consignes particulières, dangers, accès..."
                      rows="5"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
            </div>

            {/* Résumé des éléments */}
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold' }}>
                📊 Éléments du Plan
              </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ padding: '10px', backgroundColor: '#f0f9ff', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e40af' }}>
                      📍 Points d'accès
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>
                      {formData.points_acces.length}
                    </div>
                  </div>

                  <div style={{ padding: '10px', backgroundColor: '#fef3c7', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#92400e' }}>
                      ⚠️ Zones dangereuses
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#92400e' }}>
                      {formData.zones_dangereuses.length}
                    </div>
                  </div>

                  <div style={{ padding: '10px', backgroundColor: '#d1fae5', borderRadius: '6px' }}>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: '#065f46' }}>
                      🔧 Équipements
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#065f46' }}>
                      {formData.equipements.length}
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Ajouter Symbole Personnalisé */}
      {showAddSymbolModal && (
        <AddCustomSymbolModal
          tenantSlug={tenantSlug}
          onClose={() => setShowAddSymbolModal(false)}
          onSymbolAdded={(newSymbol) => {
            setCustomSymbols(prev => [...prev, newSymbol]);
            setShowAddSymbolModal(false);
          }}
        />
      )}

      {/* Modal Modifier Symbole Personnalisé */}
      {showEditSymbolModal && symbolToEdit && (
        <EditCustomSymbolModal
          tenantSlug={tenantSlug}
          symbol={symbolToEdit}
          onClose={() => {
            setShowEditSymbolModal(false);
            setSymbolToEdit(null);
          }}
          onSymbolUpdated={(updatedSymbol) => {
            setCustomSymbols(prev => prev.map(s => s.id === updatedSymbol.id ? updatedSymbol : s));
            setShowEditSymbolModal(false);
            setSymbolToEdit(null);
          }}
        />
      )}

      {/* Modal Confirmation Suppression */}
      {showDeleteConfirmModal && symbolToDelete && (
        <DeleteConfirmModal
          symbol={symbolToDelete}
          onConfirm={confirmDeleteSymbol}
          onCancel={() => {
            setShowDeleteConfirmModal(false);
            setSymbolToDelete(null);
          }}
        />
      )}
    </div>
  );
};

// Modal pour modifier un symbole personnalisé
const EditCustomSymbolModal = ({ tenantSlug, symbol, onClose, onSymbolUpdated }) => {
  const [nom, setNom] = useState(symbol.nom);
  const [imageBase64, setImageBase64] = useState(symbol.image_base64);
  const [loading, setLoading] = useState(false);

  const handleImageUpload = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('L\'image est trop volumineuse (max 2 Mo)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageBase64(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    handleImageUpload(file);
  };

  // Gérer Ctrl+V
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handleImageUpload(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleSave = async () => {
    if (!nom.trim()) {
      alert('Veuillez entrer un nom pour le symbole');
      return;
    }

    if (!imageBase64) {
      alert('Veuillez ajouter une image');
      return;
    }

    try {
      setLoading(true);
      const token = getTenantToken();

      const response = await axios.put(
        buildApiUrl(tenantSlug, `/prevention/symboles-personnalises/${symbol.id}`),
        {
          nom,
          image_base64: imageBase64,
          couleur: symbol.couleur
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Symbole modifié avec succès ! ✏️');
      onSymbolUpdated(response.data);
    } catch (error) {
      console.error('Erreur modification symbole:', error);
      alert('Erreur lors de la modification du symbole');
    } finally {
      setLoading(false);
    }
  };

  return (
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
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
          ✏️ Modifier le Symbole
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Nom du symbole *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex: Borne-fontaine rouge"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Image du symbole *
          </label>
          
          {imageBase64 ? (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <img 
                src={imageBase64} 
                alt="Aperçu" 
                style={{ 
                  maxWidth: '100px', 
                  maxHeight: '100px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px'
                }} 
              />
              <div>
                <label style={{
                  marginTop: '10px',
                  padding: '6px 12px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'inline-block',
                  marginRight: '10px'
                }}>
                  📂 Changer l'image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div style={{
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              padding: '30px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🖼️</div>
              <label style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-block',
                fontSize: '14px',
                marginBottom: '10px'
              }}>
                📂 Choisir une image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                ou utilisez Ctrl+V pour coller
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
                Max 2 Mo - PNG, JPG, GIF
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? '⏳ Modification...' : '✅ Modifier'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal de confirmation de suppression
const DeleteConfirmModal = ({ symbol, onConfirm, onCancel }) => {
  return (
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
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '450px',
        width: '90%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '20px', fontWeight: 'bold', color: '#dc2626' }}>
          ⚠️ Confirmer la suppression
        </h3>

        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <img 
            src={symbol.image_base64} 
            alt={symbol.nom}
            style={{ 
              maxWidth: '80px', 
              maxHeight: '80px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              padding: '10px'
            }} 
          />
        </div>

        <p style={{ marginBottom: '15px', fontSize: '14px', color: '#4b5563' }}>
          Êtes-vous sûr de vouloir supprimer le symbole <strong>"{symbol.nom}"</strong> ?
        </p>

        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #fbbf24',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '20px'
        }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>
            ⚠️ <strong>Attention:</strong> Si ce symbole est utilisé dans des plans d'intervention existants, 
            ces plans seront également affectés par cette suppression.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              backgroundColor: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🗑️ Supprimer
          </button>
        </div>
      </div>
    </div>
  );
};

// Modal pour ajouter un symbole personnalisé
const AddCustomSymbolModal = ({ tenantSlug, onClose, onSymbolAdded }) => {
  const [nom, setNom] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [loading, setLoading] = useState(false);

  // Import nécessaire pour React hooks
  const { useState: _useState, useEffect: _useEffect } = React;

  const handleImageUpload = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('L\'image est trop volumineuse (max 2 Mo)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageBase64(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    handleImageUpload(file);
  };

  // Gérer Ctrl+V
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handleImageUpload(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleSave = async () => {
    if (!nom.trim()) {
      alert('Veuillez entrer un nom pour le symbole');
      return;
    }

    if (!imageBase64) {
      alert('Veuillez ajouter une image');
      return;
    }

    try {
      setLoading(true);
      const token = getTenantToken();

      const response = await axios.post(
        buildApiUrl(tenantSlug, '/prevention/symboles-personnalises'),
        {
          nom,
          image_base64: imageBase64,
          categorie: 'Personnalisé',
          couleur: '#8b5cf6'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Symbole ajouté avec succès ! 🎨');
      onSymbolAdded(response.data);
    } catch (error) {
      console.error('Erreur ajout symbole:', error);
      alert('Erreur lors de l\'ajout du symbole');
    } finally {
      setLoading(false);
    }
  };

  return (
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
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
          🎨 Ajouter un Symbole Personnalisé
        </h3>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Nom du symbole *
          </label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex: Borne-fontaine rouge"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '14px' }}>
            Image du symbole *
          </label>
          
          {imageBase64 ? (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <img 
                src={imageBase64} 
                alt="Aperçu" 
                style={{ 
                  maxWidth: '100px', 
                  maxHeight: '100px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '10px'
                }} 
              />
              <div>
                <button
                  onClick={() => setImageBase64('')}
                  style={{
                    marginTop: '10px',
                    padding: '6px 12px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <div style={{
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              padding: '30px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🖼️</div>
              <label style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'inline-block',
                fontSize: '14px',
                marginBottom: '10px'
              }}>
                📂 Choisir une image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                ou utilisez Ctrl+V pour coller
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '5px' }}>
                Max 2 Mo - PNG, JPG, GIF
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6b7280',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? '⏳ Ajout...' : '✅ Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanInterventionBuilder;
