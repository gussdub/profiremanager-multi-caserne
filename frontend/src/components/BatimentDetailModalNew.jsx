import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';
import imageCompression from 'browser-image-compression';
import HistoriqueInspections from './HistoriqueInspections';
import InspectionDetailView from './InspectionDetailView';
import PlanInterventionViewerNew from './PlanInterventionViewerNew';
import RapportBatimentComplet from './RapportBatimentComplet';
import DependancesBatiment from './DependancesBatiment';
import GaleriePhotosBatiment from './GaleriePhotosBatiment';
import HistoriqueModifications from './HistoriqueModifications';
import HistoriqueInterventionsBatiment from './HistoriqueInterventionsBatiment';
import { useModalScrollLock } from '../hooks/useModalScrollLock';
import { Pencil, ClipboardCheck, Map, ScrollText, Clock, FileText, Trash2, Save, X, Download } from 'lucide-react';

// Style pour l'animation de rotation
const spinKeyframes = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

// Injecter les keyframes dans le document
if (typeof document !== 'undefined' && !document.getElementById('spin-keyframes')) {
  const style = document.createElement('style');
  style.id = 'spin-keyframes';
  style.innerHTML = spinKeyframes;
  document.head.appendChild(style);
}

// Mini-carte Leaflet pour l'aperçu dans le modal
const MiniMapPreview = ({ latitude, longitude, address }) => {
  const [mapReady, setMapReady] = useState(false);
  
  useEffect(() => {
    // Charger le CSS de Leaflet si pas déjà fait
    if (!document.querySelector('link[href*="leaflet.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    setMapReady(true);
  }, []);
  
  if (!mapReady) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f0f0f0'
      }}>
        <span>Chargement de la carte...</span>
      </div>
    );
  }
  
  try {
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');
    const L = require('leaflet');
    
    // Fix pour les icônes Leaflet
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    
    return (
      <MapContainer
        center={[latitude, longitude]}
        zoom={16}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={false}
        dragging={false}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]}>
          <Popup>{address || 'Bâtiment'}</Popup>
        </Marker>
      </MapContainer>
    );
  } catch (err) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#f0f0f0',
        color: '#666'
      }}>
        <span>📍 Carte non disponible</span>
      </div>
    );
  }
};

// Composant principal du formulaire de bâtiment
const BatimentForm = ({ 
  batiment, 
  onClose, 
  onUpdate, 
  onCreate,
  onInspect,
  onCreatePlan,
  onViewHistory,
  onGenerateReport,
  onDelete,
  onDependancesChange,
  canEdit,
  currentUser,
  tenantSlug 
}) => {
  // Verrouiller le scroll du body quand le modal est ouvert
  useModalScrollLock(true);
  
  // Responsive: détecter mobile/tablette
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: isMobile ? 0 : '280px',
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 100000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: isMobile ? 'flex-end' : 'center',
    padding: isMobile ? 0 : undefined
  };
  
  const modalContentStyle = {
    width: isMobile ? '100%' : '90%',
    maxWidth: isMobile ? '100%' : '1200px',
    maxHeight: isMobile ? '95vh' : '90vh',
    backgroundColor: 'white',
    borderRadius: isMobile ? '16px 16px 0 0' : '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column'
  };
  
  const modalContentSmallStyle = {
    ...modalContentStyle,
    maxWidth: isMobile ? '100%' : '1000px'
  };
  
  const isCreating = !batiment;
  const [isEditing, setIsEditing] = useState(isCreating);
  const [viewMode, setViewMode] = useState('form'); // 'form', 'history', 'inspection-detail', 'plan-intervention', 'rapport'
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [hasPlan, setHasPlan] = useState(false);
  
  // Permissions granulaires
  // Les préventionnistes et admins peuvent tout modifier
  // Les autres utilisateurs ne peuvent modifier que les contacts et les notes
  const isPreventionnisteOrAdmin = currentUser?.est_preventionniste || 
                                    ['admin', 'superadmin', 'superviseur'].includes(currentUser?.role);
  const canEditAll = isPreventionnisteOrAdmin;
  const canEditContactsAndNotes = canEdit || true; // Tous peuvent modifier contacts et notes
  
  const [editData, setEditData] = useState(isCreating ? {
    adresse_civique: '',
    ville: '',
    province: 'QC',
    code_postal: '',
    latitude: null,
    longitude: null,
    type_batiment: '',
    sous_type_batiment: '',
    groupe_occupation: '',
    proprietaire_nom: '',
    proprietaire_prenom: '',
    proprietaire_telephone: '',
    proprietaire_courriel: '',
    proprietaire_adresse: '',
    proprietaire_ville: '',
    proprietaire_code_postal: '',
    locataire_nom: '',
    locataire_prenom: '',
    locataire_telephone: '',
    locataire_courriel: '',
    gestionnaire_nom: '',
    gestionnaire_prenom: '',
    gestionnaire_telephone: '',
    gestionnaire_courriel: '',
    gestionnaire_adresse: '',
    gestionnaire_ville: '',
    gestionnaire_code_postal: '',
    niveau_risque: 'Moyen',
    risques_identifies: [],
    cadastre_matricule: '',
    valeur_fonciere: '',
    nombre_etages: '',
    annee_construction: '',
    superficie_totale_m2: '',
    nombre_logements: '',
    description_activite: '',
    notes: ''
  } : {});
  
  const [streetViewUrl, setStreetViewUrl] = useState('');
  const [buildingPhoto, setBuildingPhoto] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showPhotoUpload, setShowPhotoUpload] = useState(false);
  const [addressValidated, setAddressValidated] = useState(false);
  const [validatingAddress, setValidatingAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inspections, setInspections] = useState([]);
  const [nonConformites, setNonConformites] = useState([]);
  const [dependancesCount, setDependancesCount] = useState(0);
  const [contacts, setContacts] = useState([]);
  const autocompleteInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [preventionnistes, setPreventionnistes] = useState([]);

  // Types de bâtiment avec sous-catégories
  // Vérifier si un plan d'intervention existe pour ce bâtiment
  useEffect(() => {
    if (!batiment?.id || !tenantSlug) return;
    const checkPlan = async () => {
      try {
        const token = getTenantToken();
        const response = await axios.get(
          buildApiUrl(tenantSlug, `/prevention/plans-intervention`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const plan = response.data.find(p => p.batiment_id === batiment.id);
        if (plan) {
          setHasPlan(true);
          setSelectedPlanId(plan.id);
        } else {
          setHasPlan(false);
          setSelectedPlanId(null);
        }
      } catch {
        setHasPlan(false);
      }
    };
    checkPlan();
  }, [batiment?.id, tenantSlug]);

  const typesBatiment = {
    'Résidentiel': ['Unifamiliale', 'Bifamiliale', 'Multifamiliale (3-8 logements)', 'Multifamiliale (9+ logements)', 'Copropriété', 'Maison mobile'],
    'Industriel': ['Manufacture légère', 'Manufacture lourde', 'Entrepôt', 'Usine', 'Atelier'],
    'Agricole': ['Ferme', 'Grange', 'Serre', 'Écurie', 'Silo'],
    'Commercial': ['Bureau', 'Magasin', 'Restaurant', 'Hôtel', 'Centre commercial'],
    'Institutionnel': ['École', 'Hôpital', 'CHSLD', 'Centre communautaire', 'Église', 'Bibliothèque']
  };

  // Groupes d'occupation selon Code de sécurité avec sous-types pour questions conditionnelles
  const groupesOccupation = [
    { code: 'A', nom: 'Groupe A - Établissements de Réunion' },
    { code: 'B', nom: 'Groupe B - Établissements de Soins et de Détention' },
    { code: 'C', nom: 'Groupe C - Habitations' },
    { code: 'D', nom: 'Groupe D - Établissements d\'Affaires' },
    { code: 'E', nom: 'Groupe E - Établissements Commerciaux' },
    { code: 'F', nom: 'Groupe F - Établissements Industriels' },
    { code: 'G', nom: 'Groupe G - Agricole' }
  ];

  // Sous-types par groupe d'occupation (pour grilles d'inspection conditionnelles)
  const sousTypesParGroupe = {
    'A': [], // Pas de sous-types spécifiques pour Groupe A
    'B': [
      { value: 'ecole', label: 'École' },
      { value: 'hopital', label: 'Hôpital' },
      { value: 'chsld', label: 'CHSLD / Résidence pour aînés' },
      { value: 'centre_communautaire', label: 'Centre communautaire' },
      { value: 'eglise', label: 'Église / Lieu de culte' },
      { value: 'bibliotheque', label: 'Bibliothèque' }
    ],
    'C': [
      { value: 'unifamiliale', label: 'Unifamiliale' },
      { value: 'bifamiliale', label: 'Bifamiliale' },
      { value: 'multi_3_8', label: 'Multifamiliale (3-8 logements)' },
      { value: 'multi_9', label: 'Multifamiliale (9+ logements)' },
      { value: 'copropriete', label: 'Copropriété / Condo' },
      { value: 'chalet', label: 'Chalet' },
      { value: 'residence_ainee', label: 'Résidence pour aînés' },
      { value: 'maison_mobile', label: 'Maison mobile / Parc de maisons mobiles' }
    ],
    'D': [
      { value: 'bureau', label: 'Bureau' },
      { value: 'magasin', label: 'Magasin de détail' },
      { value: 'restaurant', label: 'Restaurant' },
      { value: 'hotel', label: 'Hôtel / Motel' },
      { value: 'centre_commercial', label: 'Centre commercial' }
    ],
    'E': [
      { value: 'commerce_detail', label: 'Commerce de détail' },
      { value: 'commerce_gros', label: 'Commerce de gros' },
      { value: 'service', label: 'Services' }
    ],
    'F': [
      { value: 'manufacture_legere', label: 'Manufacture légère' },
      { value: 'manufacture_lourde', label: 'Manufacture lourde' },
      { value: 'entrepot', label: 'Entrepôt' },
      { value: 'usine', label: 'Usine' },
      { value: 'atelier', label: 'Atelier' }
    ],
    'G': [
      { value: 'ferme', label: 'Ferme' },
      { value: 'grange', label: 'Grange' },
      { value: 'serre', label: 'Serre' },
      { value: 'ecurie', label: 'Écurie / Étable' },
      { value: 'silo', label: 'Silo' }
    ]
  };

  const niveauxRisque = ['Faible', 'Moyen', 'Élevé', 'Très élevé'];

  const riskColors = {
    'Faible': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    'Moyen': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    'Élevé': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    'Très élevé': { bg: '#fecaca', border: '#dc2626', text: '#7f1d1d' }
  };

  const riskColor = riskColors[editData.niveau_risque] || riskColors['Moyen'];

  useEffect(() => {
    if (batiment) {
      // Charger le bâtiment enrichi via le detail endpoint (photos, contacts)
      const loadEnrichedBatiment = async () => {
        try {
          const token = getTenantToken();
          const response = await axios.get(
            buildApiUrl(tenantSlug, `/batiments/${batiment.id}`),
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const enriched = response.data;
          setEditData({ ...enriched });
          
          // Photos
          if (enriched.photo_url) {
            setBuildingPhoto({ url: enriched.photo_url, source: 'uploaded' });
          } else if (batiment.photo_url) {
            setBuildingPhoto({ url: batiment.photo_url, source: 'uploaded' });
          } else {
            setBuildingPhoto(null);
          }
          
          // Contacts
          initContacts(enriched);
        } catch {
          // Fallback: utiliser les données de la liste
          setEditData({ ...batiment });
          if (batiment.photo_url) {
            setBuildingPhoto({ url: batiment.photo_url, source: 'uploaded' });
          } else {
            setBuildingPhoto(null);
          }
          initContacts(batiment);
        }
      };
      
      // Initialiser immédiatement avec les données de la liste
      setEditData({ ...batiment });
      loadEnrichedBatiment();
      fetchInspections();
      fetchNonConformites();
      fetchDependancesCount();
    }
  }, [batiment]);
  
  const initContacts = (bat) => {
    const existingContacts = [];
    if (bat.contacts?.length) {
      setContacts(bat.contacts);
      return;
    }
    if (bat.contacts_ressources?.length) {
      bat.contacts_ressources.forEach((c, i) => {
        existingContacts.push({
          type: i === 0 ? 'Propriétaire' : 'Autre',
          nom: c.nom || '', prenom: c.prenom || '',
          telephone: c.telephone || '', courriel: c.courriel || '',
          adresse: c.adresse || '', ville: c.ville || '', code_postal: c.code_postal || '',
        });
      });
    }
    if (!existingContacts.length) {
      if (bat.proprietaire_nom || bat.proprietaire_prenom) {
        existingContacts.push({
          type: 'Propriétaire', nom: bat.proprietaire_nom || '', prenom: bat.proprietaire_prenom || '',
          telephone: bat.proprietaire_telephone || '', courriel: bat.proprietaire_courriel || '',
          adresse: bat.proprietaire_adresse || '', ville: bat.proprietaire_ville || '', code_postal: bat.proprietaire_code_postal || '',
        });
      }
      if (bat.locataire_nom || bat.locataire_prenom) {
        existingContacts.push({
          type: 'Locataire', nom: bat.locataire_nom || '', prenom: bat.locataire_prenom || '',
          telephone: bat.locataire_telephone || '', courriel: bat.locataire_courriel || '',
          adresse: '', ville: '', code_postal: '',
        });
      }
      if (bat.gestionnaire_nom || bat.gestionnaire_prenom) {
        existingContacts.push({
          type: 'Gestionnaire', nom: bat.gestionnaire_nom || '', prenom: bat.gestionnaire_prenom || '',
          telephone: bat.gestionnaire_telephone || '', courriel: bat.gestionnaire_courriel || '',
          adresse: bat.gestionnaire_adresse || '', ville: bat.gestionnaire_ville || '', code_postal: bat.gestionnaire_code_postal || '',
        });
      }
    }
    setContacts(existingContacts);
  };

  // Charger le nombre de dépendances
  const fetchDependancesCount = async () => {
    if (!batiment?.id) return;
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/batiments/${batiment.id}/dependances`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setDependancesCount(response.data?.length || 0);
    } catch (error) {
      console.error('Erreur chargement dépendances:', error);
      setDependancesCount(0);
    }
  };

  // Charger la liste des préventionnistes
  useEffect(() => {
    const fetchPreventionnistes = async () => {
      try {
        const token = getTenantToken();
        const response = await axios.get(
          buildApiUrl(tenantSlug, `/prevention/preventionnistes`),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setPreventionnistes(response.data);
      } catch (error) {
        console.error('Erreur chargement préventionnistes:', error);
      }
    };
    
    fetchPreventionnistes();
  }, [tenantSlug]);

  // Autocomplétion d'adresse avec API Adresse Québec (gratuite et fiable)
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const addressJustSelected = useRef(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const searchAddress = async (query) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    
    setIsSearching(true);
    try {
      // Utiliser l'API Adresse Québec (gratuite)
      const response = await fetch(
        `https://geogratis.gc.ca/services/geolocation/en/locate?q=${encodeURIComponent(query)}&maxResultCount=5`
      );
      
      const data = await response.json();
      
      if (data && data.length > 0) {
        setSuggestions(data);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Erreur recherche adresse:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  };
  
  const handleAddressSelect = async (suggestion) => {
    const { title, geometry } = suggestion;
    
    // Marquer qu'on vient de sélectionner une adresse pour éviter de relancer la recherche
    addressJustSelected.current = true;
    
    // Parser l'adresse - Format: "Numéro Rue, Ville, Province" (PAS de code postal dans cette API)
    const addressParts = title.split(',').map(p => p.trim());
    const streetAddress = addressParts[0] || '';
    const city = addressParts[1] || '';
    const provinceName = addressParts[2] || 'Quebec';
    
    // Convertir le nom de la province en code
    const provinceMap = {
      'Quebec': 'QC',
      'Québec': 'QC',
      'Ontario': 'ON',
      'Alberta': 'AB',
      'British Columbia': 'BC',
      'Manitoba': 'MB',
      'New Brunswick': 'NB',
      'Newfoundland and Labrador': 'NL',
      'Nova Scotia': 'NS',
      'Prince Edward Island': 'PE',
      'Saskatchewan': 'SK'
    };
    const province = provinceMap[provinceName] || 'QC';
    
    const lat = geometry?.coordinates?.[1] || null;
    const lng = geometry?.coordinates?.[0] || null;
    
    // Obtenir le code postal via reverse geocoding Nominatim (OpenStreetMap)
    let postalCode = '';
    if (lat && lng) {
      try {
        // Utiliser Nominatim API (gratuite, sans clé)
        const geocodeUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;
        const response = await fetch(geocodeUrl, {
          headers: {
            'User-Agent': 'ProFireManager/1.0'
          }
        });
        const data = await response.json();
        
        if (data && data.address && data.address.postcode) {
          postalCode = data.address.postcode;
        }
      } catch (error) {
        console.error('Erreur récupération code postal:', error);
      }
    }
    
    setEditData(prev => ({
      ...prev,
      adresse_civique: streetAddress,
      ville: city,
      province: province,
      code_postal: postalCode,
      latitude: lat,
      longitude: lng
    }));
    
    setAddressValidated(true);
    setShowSuggestions(false);
    
    // Générer carte statique OpenStreetMap si on a les coordonnées
    if (lat && lng) {
      // Utiliser l'API de carte statique OpenStreetMap
      const zoom = 16;
      const width = 400;
      const height = 250;
      const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},red-pushpin`;
      setStreetViewUrl(url);
    }
  };
  
  useEffect(() => {
    // Ne pas rechercher si on vient de sélectionner une adresse
    if (addressJustSelected.current) {
      addressJustSelected.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (isEditing && editData.adresse_civique) {
        searchAddress(editData.adresse_civique);
      }
    }, 500); // Debounce de 500ms
    
    return () => clearTimeout(timeoutId);
  }, [editData.adresse_civique, isEditing]);

  // Générer photo Mapillary automatiquement si pas de photo uploadée
  useEffect(() => {
    // Ne chercher automatiquement que si :
    // 1. Il y a une adresse
    // 2. Pas de photo uploadée existante (pas de batiment.photo_url)
    // 3. buildingPhoto est null ou vient de Mapillary (pas uploaded/thumbnail)
    if (editData.adresse_civique && editData.ville) {
      const shouldSearch = !batiment?.photo_url && 
                          (!buildingPhoto || 
                           buildingPhoto.source === 'mapillary');
      
      if (shouldSearch) {
        generateStreetViewUrl();
      }
    }
  }, [editData.latitude, editData.longitude, editData.adresse_civique, editData.ville]);

  const generateStreetViewUrl = async () => {
    // Chercher une photo réelle du bâtiment via Mapillary
    if (editData.latitude && editData.longitude) {
      await fetchMapillaryPhoto(editData.latitude, editData.longitude);
    } else if (editData.adresse_civique && editData.ville) {
      // Si pas de coordonnées, tenter un geocoding pour obtenir les coordonnées
      const address = encodeURIComponent(`${editData.adresse_civique}, ${editData.ville}, ${editData.province || 'QC'}, Canada`);
      
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${address}&format=json&limit=1`, {
          headers: {
            'User-Agent': 'ProFireManager/1.0'
          }
        });
        const data = await response.json();
        
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          // Mettre à jour les coordonnées dans editData
          setEditData(prev => ({
            ...prev,
            latitude: lat,
            longitude: lon
          }));
          await fetchMapillaryPhoto(lat, lon);
        }
      } catch (err) {
        console.log('Erreur geocoding:', err);
      }
    }
  };
  
  const fetchMapillaryPhoto = async (lat, lng) => {
    console.log('📷 Recherche photo Mapillary pour:', lat, lng);
    setPhotoLoading(true);
    try {
      // Chercher des images Mapillary dans un rayon de 50m
      const url = `https://graph.mapillary.com/images?access_token=MLY|5824985657540538|2ca5e88149fc6be2e9edeae0c17a24e2&fields=id,thumb_2048_url,captured_at&bbox=${lng-0.001},${lat-0.001},${lng+0.001},${lat+0.001}&limit=1`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.data && data.data.length > 0) {
        // Photo trouvée !
        console.log('✅ Photo Mapillary trouvée!');
        setBuildingPhoto({
          url: data.data[0].thumb_2048_url,
          source: 'mapillary',
          capturedAt: data.data[0].captured_at
        });
      } else {
        // Pas de photo Mapillary
        console.log('❌ Aucune photo Mapillary dans ce secteur');
        setBuildingPhoto(null);
      }
    } catch (error) {
      console.log('❌ Erreur Mapillary:', error);
      setBuildingPhoto(null);
    } finally {
      setPhotoLoading(false);
    }
  };
  
  const uploadPhotoFromFile = async (file) => {
    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    // Si c'est une création, on ne peut pas encore uploader (pas d'ID)
    if (!batiment || !batiment.id) {
      alert('Veuillez d\'abord créer le bâtiment avant d\'ajouter une photo');
      return;
    }
    
    setPhotoLoading(true);
    
    try {
      // Options de compression
      // Options pour le thumbnail (très petite taille pour affichage rapide)
      const thumbnailOptions = {
        maxSizeMB: 0.05, // 50KB max
        maxWidthOrHeight: 400, // Petite dimension
        useWebWorker: true,
        initialQuality: 0.6
      };
      
      // Options pour l'image complète
      const fullImageOptions = {
        maxSizeMB: 0.5, // Taille max 500KB
        maxWidthOrHeight: 1920, // Dimension max
        useWebWorker: true,
        initialQuality: 0.8 // Qualité initiale
      };
      
      console.log('📦 Compression de l\'image en cours...');
      console.log(`Taille originale: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
      
      // Générer le thumbnail en parallèle
      const thumbnailPromise = imageCompression(file, thumbnailOptions);
      const fullImagePromise = imageCompression(file, fullImageOptions);
      
      // Afficher d'abord le thumbnail
      const thumbnail = await thumbnailPromise;
      console.log(`Thumbnail créé: ${(thumbnail.size / 1024).toFixed(2)} KB`);
      
      // Convertir le thumbnail en base64 et l'afficher immédiatement
      const thumbnailReader = new FileReader();
      thumbnailReader.onload = (e) => {
        setBuildingPhoto({
          url: e.target.result,
          source: 'thumbnail',
          capturedAt: new Date().toISOString()
        });
      };
      thumbnailReader.readAsDataURL(thumbnail);
      
      // Attendre l'image complète
      const compressedFile = await fullImagePromise;
      console.log(`Image complète: ${(compressedFile.size / 1024).toFixed(2)} KB`);
      
      // Convertir en base64 pour stockage
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target.result;
        
        try {
          const token = getTenantToken();
          
          // Utiliser l'endpoint dédié à l'upload de photos
          await axios.post(
            buildApiUrl(tenantSlug, `/prevention/batiments/${batiment.id}/photo`),
            { photo_base64: base64Image },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          setBuildingPhoto({
            url: base64Image,
            source: 'uploaded',
            capturedAt: new Date().toISOString()
          });
          
          // Mettre à jour l'état local
          setEditData(prev => ({
            ...prev,
            photo_url: base64Image
          }));
          
          // Notifier le parent que le bâtiment a été mis à jour
          if (onUpdate && batiment) {
            await onUpdate({ ...batiment, photo_url: base64Image });
          }
          
          alert('Photo enregistrée avec succès ! 📷');
        } catch (error) {
          console.error('Erreur upload photo:', error);
          alert('Erreur lors de l\'enregistrement de la photo');
        } finally {
          setPhotoLoading(false);
        }
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Erreur compression photo:', error);
      alert('Erreur lors de la compression de la photo');
      setPhotoLoading(false);
    }
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    uploadPhotoFromFile(file);
  };

  // Gérer le collage d'images (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      // Vérifier si le modal est visible
      if (!batiment || !batiment.id) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            console.log('📋 Image collée détectée, upload en cours...');
            uploadPhotoFromFile(file);
          }
          break;
        }
      }
    };

    // Ajouter le listener uniquement si le modal est ouvert avec un bâtiment valide
    if (batiment && batiment.id) {
      console.log('✅ Listener Ctrl+V activé pour le bâtiment:', batiment.id);
      document.addEventListener('paste', handlePaste);
    }
    
    return () => {
      console.log('🧹 Nettoyage du listener Ctrl+V');
      document.removeEventListener('paste', handlePaste);
    };
  }, [batiment?.id]); // Re-créer le listener si l'ID du bâtiment change

  const validateAddress = () => {
    // Fonction simplifiée - l'autocomplétion gère tout automatiquement
    if (!editData.adresse_civique || !editData.ville) {
      alert('⚠️ Veuillez utiliser l\'autocomplétion d\'adresse ci-dessus ou saisir manuellement tous les champs.');
      return;
    }
    
    if (editData.latitude && editData.longitude) {
      alert(`✅ Adresse déjà validée!\n\nLat: ${editData.latitude.toFixed(6)}\nLng: ${editData.longitude.toFixed(6)}`);
    } else {
      alert('ℹ️ Utilisez l\'autocomplétion d\'adresse en tapant dans le champ ci-dessus pour obtenir les coordonnées GPS automatiquement.');
    }
  };

  const fetchInspections = async () => {
    if (!batiment || !batiment.id) {
      return;
    }
    
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/inspections?batiment_id=${batiment.id}&limit=5`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInspections(
        response.data
          .sort((a, b) => new Date(b.date_inspection) - new Date(a.date_inspection))
          .slice(0, 5)
      );
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
    }
  };

  const fetchNonConformites = async () => {
    if (!batiment || !batiment.id) {
      return;
    }
    
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/non-conformites?batiment_id=${batiment.id}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNonConformites(response.data || []);
    } catch (error) {
      console.error('Erreur chargement non-conformités:', error);
    }
  };

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    if (['adresse_civique', 'ville', 'code_postal'].includes(field)) {
      setAddressValidated(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Préparer les données à envoyer (nettoyer les champs non nécessaires)
      const dataToSave = { ...editData };
      
      // Si on a une photo uploadée, s'assurer que photo_url est une string
      if (buildingPhoto && buildingPhoto.url) {
        dataToSave.photo_url = buildingPhoto.url;
      } else if (!dataToSave.photo_url) {
        dataToSave.photo_url = '';
      }
      
      // Supprimer les champs qui ne doivent pas être envoyés
      delete dataToSave._id;
      delete dataToSave.__v;
      delete dataToSave.created_at;
      delete dataToSave.updated_at;
      
      // S'assurer que les champs numériques sont bien des nombres ou null
      if (dataToSave.latitude !== undefined && dataToSave.latitude !== null) {
        dataToSave.latitude = parseFloat(dataToSave.latitude);
      }
      if (dataToSave.longitude !== undefined && dataToSave.longitude !== null) {
        dataToSave.longitude = parseFloat(dataToSave.longitude);
      }
      if (dataToSave.valeur_fonciere !== undefined && dataToSave.valeur_fonciere !== null && dataToSave.valeur_fonciere !== '') {
        dataToSave.valeur_fonciere = parseFloat(dataToSave.valeur_fonciere);
      }
      
      // S'assurer que risques est un array
      if (!Array.isArray(dataToSave.risques)) {
        dataToSave.risques = [];
      }
      
      // Ajouter les contacts dynamiques
      dataToSave.contacts = contacts;
      // Mapper aussi vers les champs legacy pour rétro-compatibilité
      const proprietaire = contacts.find(c => c.type === 'Propriétaire');
      if (proprietaire) {
        dataToSave.proprietaire_nom = proprietaire.nom;
        dataToSave.proprietaire_prenom = proprietaire.prenom;
        dataToSave.proprietaire_telephone = proprietaire.telephone;
        dataToSave.proprietaire_courriel = proprietaire.courriel;
        dataToSave.proprietaire_adresse = proprietaire.adresse;
        dataToSave.proprietaire_ville = proprietaire.ville;
        dataToSave.proprietaire_code_postal = proprietaire.code_postal;
        dataToSave.contact_nom = `${proprietaire.prenom} ${proprietaire.nom}`.trim();
        dataToSave.contact_telephone = proprietaire.telephone;
      }
      const locataire = contacts.find(c => c.type === 'Locataire');
      if (locataire) {
        dataToSave.locataire_nom = locataire.nom;
        dataToSave.locataire_prenom = locataire.prenom;
        dataToSave.locataire_telephone = locataire.telephone;
        dataToSave.locataire_courriel = locataire.courriel;
      }
      const gestionnaire = contacts.find(c => c.type === 'Gestionnaire');
      if (gestionnaire) {
        dataToSave.gestionnaire_nom = gestionnaire.nom;
        dataToSave.gestionnaire_prenom = gestionnaire.prenom;
        dataToSave.gestionnaire_telephone = gestionnaire.telephone;
        dataToSave.gestionnaire_courriel = gestionnaire.courriel;
        dataToSave.gestionnaire_adresse = gestionnaire.adresse;
        dataToSave.gestionnaire_ville = gestionnaire.ville;
        dataToSave.gestionnaire_code_postal = gestionnaire.code_postal;
      }
      
      // Si pas de nom, générer un nom basé sur l'adresse
      if (!dataToSave.nom_etablissement || dataToSave.nom_etablissement.trim() === '') {
        if (dataToSave.adresse_civique) {
          dataToSave.nom_etablissement = `Bâtiment ${dataToSave.adresse_civique}`;
        } else {
          dataToSave.nom_etablissement = 'Bâtiment sans nom';
        }
      }
      
      console.log('Données à sauvegarder:', dataToSave);
      
      if (isCreating) {
        await onCreate(dataToSave);
      } else {
        await onUpdate(dataToSave);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur sauvegarde complète:', error);
      console.error('Détails erreur:', error.response?.data || error.message);
      alert(`Erreur lors de la sauvegarde du bâtiment: ${error.response?.data?.detail || error.message || 'Vérifiez les champs requis.'}`);
    } finally {
      setSaving(false);
    }
  };

  // Sauvegarder à la fermeture du modal
  const handleCloseWithSave = async () => {
    if (isCreating) {
      // Si c'est une création, on annule juste
      onClose();
      return;
    }

    // Si des modifications ont été faites, sauvegarder
    if (isEditing && batiment) {
      try {
        setSaving(true);
        const dataToSave = { ...editData };
        
        if (buildingPhoto && buildingPhoto.url) {
          dataToSave.photo_url = buildingPhoto.url;
        } else if (!dataToSave.photo_url) {
          dataToSave.photo_url = '';
        }
        
        delete dataToSave._id;
        delete dataToSave.__v;
        delete dataToSave.created_at;
        delete dataToSave.updated_at;
        
        if (dataToSave.latitude !== undefined && dataToSave.latitude !== null) {
          dataToSave.latitude = parseFloat(dataToSave.latitude);
        }
        if (dataToSave.longitude !== undefined && dataToSave.longitude !== null) {
          dataToSave.longitude = parseFloat(dataToSave.longitude);
        }
        if (dataToSave.valeur_fonciere !== undefined && dataToSave.valeur_fonciere !== null && dataToSave.valeur_fonciere !== '') {
          dataToSave.valeur_fonciere = parseFloat(dataToSave.valeur_fonciere);
        }
        
        if (!Array.isArray(dataToSave.risques)) {
          dataToSave.risques = [];
        }
        
        if (!dataToSave.nom_etablissement || dataToSave.nom_etablissement.trim() === '') {
          if (dataToSave.adresse_civique) {
            dataToSave.nom_etablissement = `Bâtiment ${dataToSave.adresse_civique}`;
          } else {
            dataToSave.nom_etablissement = 'Bâtiment sans nom';
          }
        }
        
        await onUpdate(dataToSave);
        console.log('✅ Modifications sauvegardées à la fermeture');
      } catch (error) {
        console.error('❌ Erreur sauvegarde:', error);
        alert(`Erreur lors de la sauvegarde: ${error.response?.data?.detail || error.message || 'Vérifiez les champs requis.'}`);
        setSaving(false);
        return; // Ne pas fermer si erreur
      } finally {
        setSaving(false);
      }
    }
    
    onClose();
  };

  // Export PDF de la fiche bâtiment
  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (!batiment?.id) return;
    setExportingPdf(true);
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/batiments/${batiment.id}/rapport-pdf`),
        { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      const nom = batiment.nom_etablissement || batiment.adresse_civique || 'batiment';
      link.setAttribute('download', `fiche_${nom.replace(/\s+/g, '_')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF. Veuillez réessayer.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Gestion de la navigation rapport complet
  if (viewMode === 'rapport') {
    return (
      <>
        <div 
          className="no-print"
          style={{
            position: 'fixed',
            top: 0,
            left: isMobile ? 0 : '280px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 100000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onClick={onClose}
        >
          <div 
            style={{
              width: isMobile ? '100%' : '90%',
              maxWidth: isMobile ? '100%' : '1200px',
              height: isMobile ? '95vh' : '90vh',
              backgroundColor: 'white',
              borderRadius: isMobile ? '16px 16px 0 0' : '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <RapportBatimentComplet
              batiment={batiment}
              tenantSlug={tenantSlug}
              onBack={() => setViewMode('form')}
            />
          </div>
        </div>
      </>
    );
  }

  // Gestion de la navigation plan d'intervention
  if (viewMode === 'plan-intervention' && selectedPlanId) {
    return (
      <>
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: isMobile ? 0 : '280px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 100000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onClick={onClose}
        >
          <div 
            style={{
              width: isMobile ? '100%' : '90%',
              maxWidth: isMobile ? '100%' : '1200px',
              height: isMobile ? '95vh' : '90vh',
              backgroundColor: 'white',
              borderRadius: isMobile ? '16px 16px 0 0' : '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <PlanInterventionViewerNew
                planId={selectedPlanId}
                batiment={batiment}
                tenantSlug={tenantSlug}
                onBack={() => {
                  setViewMode('form');
                  setSelectedPlanId(null);
                }}
              />
          </div>
        </div>
      </>
    );
  }

  // Gestion de l'historique complet (modifications, inspections, NC, interventions)
  if (viewMode === 'full-history') {
    return (
      <>
        <div style={modalOverlayStyle} onClick={onClose}>
          <div style={modalContentSmallStyle} onClick={(e) => e.stopPropagation()}>
            <HistoriqueModifications
              batiment={batiment}
              tenantSlug={tenantSlug}
              onBack={() => setViewMode('form')}
            />
          </div>
        </div>
      </>
    );
  }

  // Gestion de la navigation historique/inspection
  if (viewMode === 'history') {
    return (
      <>
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: isMobile ? 0 : '280px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 100000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onClick={onClose}
        >
          <div 
            style={{
              width: isMobile ? '100%' : '90%',
              maxWidth: isMobile ? '100%' : '1000px',
              maxHeight: isMobile ? '95vh' : '90vh',
              backgroundColor: 'white',
              borderRadius: isMobile ? '16px 16px 0 0' : '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <HistoriqueInspections
              batiment={batiment}
              tenantSlug={tenantSlug}
              onBack={() => setViewMode('form')}
              onViewInspection={(inspection) => {
                setSelectedInspection(inspection);
                setViewMode('inspection-detail');
              }}
            />
          </div>
        </div>
      </>
    );
  }

  if (viewMode === 'inspection-detail' && selectedInspection) {
    return (
      <>
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: isMobile ? 0 : '280px',
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 100000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
          onClick={onClose}
        >
          <div 
            style={{
              width: isMobile ? '100%' : '90%',
              maxWidth: isMobile ? '100%' : '1000px',
              maxHeight: isMobile ? '95vh' : '90vh',
              backgroundColor: 'white',
              borderRadius: isMobile ? '16px 16px 0 0' : '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <InspectionDetailView
              inspection={selectedInspection}
              batiment={batiment}
              onBack={() => setViewMode('history')}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Style global pour les suggestions Google Places */}
      <style>{`
        .pac-container {
          z-index: 10000 !important;
          font-family: system-ui, -apple-system, sans-serif;
          border-radius: 8px;
          border: 1px solid #d1d5db;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          margin-top: 4px;
        }
        .pac-item {
          padding: 10px 14px;
          cursor: pointer;
          font-size: 14px;
        }
        .pac-item:hover {
          background-color: #f3f4f6;
        }
        .pac-item-query {
          font-weight: 600;
          color: #1f2937;
        }
      `}</style>
      
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: isMobile ? 0 : '280px',
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: isMobile ? 'flex-end' : 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: isMobile ? 0 : '2rem'
        }}
        onClick={handleCloseWithSave}
      >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          width: '100%',
          maxWidth: isMobile ? '100%' : '1200px',
          maxHeight: isMobile ? '95vh' : '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec Street View */}
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: isMobile ? '1rem' : '2rem',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: isMobile ? '0.5rem' : '2rem',
          flexDirection: isMobile ? 'column' : 'row'
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ 
              fontSize: isMobile ? '1.25rem' : '1.875rem', 
              fontWeight: '700', 
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              {isCreating ? '✚ Nouveau Bâtiment' : `🏢 ${editData.nom_etablissement || editData.adresse_civique || 'Bâtiment'}`}
              {/* Badge dépendances */}
              {!isCreating && dependancesCount > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  🏚️ {dependancesCount} dépendance{dependancesCount > 1 ? 's' : ''}
                </span>
              )}
            </h2>
            {!isCreating && (
              <p style={{ opacity: 0.9, fontSize: '1rem' }}>
                {editData.adresse_civique && `${editData.adresse_civique}, `}
                {editData.ville && `${editData.ville}, `}
                {editData.province} {editData.code_postal}
              </p>
            )}
          </div>
          
          {/* Photo du Bâtiment */}
          <div style={{
            width: '400px',
            height: '250px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            background: '#f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            {photoLoading ? (
              <div style={{ textAlign: 'center', color: 'white' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📷</div>
                <div>Recherche d'une photo...</div>
              </div>
            ) : buildingPhoto ? (
              <>
                <img 
                  src={buildingPhoto.url} 
                  alt="Photo du bâtiment" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div style={{
                  position: 'absolute',
                  bottom: '5px',
                  right: '5px',
                  background: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px'
                }}>
                  {buildingPhoto.source === 'mapillary' ? '© Mapillary' : '📸 Photo uploadée'}
                </div>
                <button
                  onClick={() => setShowPhotoUpload(true)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'rgba(255,255,255,0.9)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  📷 Changer
                </button>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                <div style={{ fontSize: '64px', marginBottom: '15px' }}>🏢</div>
                <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                  Aucune photo disponible pour ce bâtiment
                </div>
                <label style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'inline-block',
                  fontSize: '14px',
                  marginBottom: '10px'
                }}>
                  📷 Ajouter une photo
                  <input 
                    type="file" 
                    accept="image/*"
                    
                    onChange={handlePhotoUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  ou utilisez Ctrl+V pour coller une capture d'écran
                </div>
              </div>
            )}
            
            {showPhotoUpload && buildingPhoto && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <div style={{ color: 'white', marginBottom: '15px' }}>
                  Remplacer la photo actuelle ?
                </div>
                <label style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  marginBottom: '10px'
                }}>
                  📷 Choisir une nouvelle photo
                  <input 
                    type="file" 
                    accept="image/*"
                    
                    onChange={(e) => {
                      handlePhotoUpload(e);
                      setShowPhotoUpload(false);
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                <button
                  onClick={() => setShowPhotoUpload(false)}
                  style={{
                    background: 'transparent',
                    color: 'white',
                    border: '1px solid white',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
          
          <Button 
            variant="ghost" 
            onClick={handleCloseWithSave}
            style={{
              color: 'white',
              fontSize: '1.5rem',
              padding: '0.5rem',
              minWidth: 'auto'
            }}
          >
            ✕
          </Button>
        </div>

        {/* Actions Bar */}
        {!isCreating && (
          <div style={{
            padding: '0.6rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#f8fafc',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            {isEditing ? (
              <>
                <Button 
                  size="sm"
                  onClick={handleSave} 
                  disabled={saving}
                  style={{ backgroundColor: '#16a34a', color: 'white', borderRadius: '8px' }}
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
                <Button 
                  size="sm"
                  variant="outline" 
                  onClick={() => { setEditData(batiment || {}); setIsEditing(false); }}
                  disabled={saving}
                  style={{ borderRadius: '8px' }}
                >
                  Annuler
                </Button>
              </>
            ) : (
              <>
                {[
                  canEdit && { label: 'Modifier', icon: Pencil, action: () => setIsEditing(true), primary: true },
                  onInspect && { label: 'Inspecter', icon: ClipboardCheck, action: () => onInspect(batiment) },
                  onCreatePlan && hasPlan && { label: 'Plan', icon: Map, action: () => setViewMode('plan-intervention') },
                  onViewHistory && { label: 'Inspections', icon: ScrollText, action: () => setViewMode('history') },
                  { label: 'Historique', icon: Clock, action: () => setViewMode('full-history'), testid: 'btn-full-history' },
                  onGenerateReport && { label: 'Rapport', icon: FileText, action: () => setViewMode('rapport') },
                  !isCreating && { label: exportingPdf ? 'Export...' : 'PDF', icon: Download, action: handleExportPdf, testid: 'btn-export-pdf' },
                  canEdit && onDelete && { label: 'Supprimer', icon: Trash2, action: () => onDelete(batiment), danger: true },
                ].filter(Boolean).map((item, idx) => (
                  <button
                    key={idx}
                    onClick={item.action}
                    data-testid={item.testid}
                    style={{
                      padding: '0.45rem 1rem',
                      border: item.primary ? 'none' : item.danger ? '1px solid #fca5a5' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: item.primary ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : item.danger ? '#fff5f5' : 'white',
                      color: item.danger ? '#dc2626' : item.primary ? 'white' : '#475569',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      cursor: 'pointer',
                      lineHeight: '1.5',
                      display: 'inline-flex',
                      alignItems: 'center',
                      boxShadow: item.primary ? '0 1px 3px rgba(99,102,241,0.3)' : '0 1px 2px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseOver={(e) => {
                      if (item.primary) {
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(99,102,241,0.4)';
                      } else if (item.danger) {
                        e.currentTarget.style.background = '#fee2e2';
                      } else {
                        e.currentTarget.style.background = '#f1f5f9';
                        e.currentTarget.style.borderColor = '#cbd5e1';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (item.primary) {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(99,102,241,0.3)';
                      } else if (item.danger) {
                        e.currentTarget.style.background = '#fff5f5';
                      } else {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#e2e8f0';
                      }
                    }}
                  >
                    {item.icon && <item.icon size={14} style={{ marginRight: '0.35rem', flexShrink: 0 }} />}
                    {item.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Actions pour création */}
        {isCreating && (
          <div style={{
            padding: '1rem 2rem',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            gap: '0.75rem',
            backgroundColor: '#f9fafb'
          }}>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Création...' : '✅ Créer le bâtiment'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        )}

        {/* Content scrollable */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '2rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
            
            {/* Section 1 - LOCALISATION */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e0e7ff', opacity: (!canEditAll && isEditing) ? 0.7 : 1 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📍 Localisation
                {!canEditAll && isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    🔒 Réservé aux préventionnistes
                  </span>
                )}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Adresse civique * {isEditing && canEditAll && <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal' }}>(Commencez à taper pour l'autocomplétion)</span>}
                  </label>
                  <div style={{ width: '100%', position: 'relative' }}>
                    <input
                      ref={autocompleteInputRef}
                      type="text"
                      value={editData.adresse_civique || ''}
                      onChange={(e) => {
                        handleChange('adresse_civique', e.target.value);
                        setAddressValidated(false);
                      }}
                      onFocus={() => {
                        if (suggestions.length > 0) setShowSuggestions(true);
                      }}
                      onBlur={(e) => {
                        // Fermer après un délai pour permettre le clic sur une suggestion
                        setTimeout(() => setShowSuggestions(false), 200);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setShowSuggestions(false);
                          e.target.blur();
                        }
                      }}
                      placeholder="Commencez à taper votre adresse..."
                      disabled={!isEditing || !canEditAll}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        paddingRight: isSearching ? '2.5rem' : '0.75rem',
                        border: addressValidated ? '2px solid #10b981' : '2px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        transition: 'all 0.2s',
                        backgroundColor: addressValidated ? '#d1fae5' : (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                      }}
                    />
                    {isSearching && (
                      <div style={{ 
                        position: 'absolute', 
                        right: '0.75rem', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        color: '#6b7280'
                      }}>
                        ⏳
                      </div>
                    )}
                    
                    {/* Suggestions dropdown */}
                    {isEditing && canEditAll && showSuggestions && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        marginTop: '0.25rem',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                        zIndex: 100000,
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {/* Bouton fermer */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.5rem 0.75rem',
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: '#f9fafb'
                        }}>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {suggestions.length > 0 ? `${suggestions.length} suggestion(s)` : 'Aucune suggestion'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowSuggestions(false)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '1rem',
                              color: '#9ca3af',
                              padding: '0.25rem'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        
                        {suggestions.length > 0 ? (
                          suggestions.map((suggestion, index) => (
                            <div
                              key={index}
                              onClick={() => handleAddressSelect(suggestion)}
                              style={{
                                padding: '0.75rem',
                                cursor: 'pointer',
                                borderBottom: index < suggestions.length - 1 ? '1px solid #f3f4f6' : 'none',
                                transition: 'background-color 0.2s'
                              }}
                              onMouseEnter={(e) => e.target.style.backgroundColor = '#f9fafb'}
                              onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                            >
                              <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#1f2937' }}>
                                {suggestion.title}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280' }}>
                            <div style={{ fontSize: '0.875rem' }}>Adresse non trouvée</div>
                            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                              Vous pouvez saisir l'adresse manuellement
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {isEditing && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                      💡 Conseil: Commencez à taper et sélectionnez une suggestion pour remplir automatiquement tous les champs
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Ville *
                  </label>
                  <input
                    type="text"
                    value={editData.ville || ''}
                    onChange={(e) => handleChange('ville', e.target.value)}
                    onBlur={validateAddress}
                    placeholder="Montréal"
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Province
                  </label>
                  <select
                    value={editData.province || 'QC'}
                    onChange={(e) => handleChange('province', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  >
                    <option value="QC">Québec</option>
                    <option value="ON">Ontario</option>
                    <option value="AB">Alberta</option>
                    <option value="BC">Colombie-Britannique</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={editData.code_postal || ''}
                    onChange={(e) => handleChange('code_postal', e.target.value)}
                    placeholder="J0J 0J0"
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                {addressValidated && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.75rem', backgroundColor: '#d1fae5', borderRadius: '8px', color: '#065f46', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>✅</span>
                    <div>
                      <strong>Adresse validée et géolocalisée</strong>
                      {editData.latitude && editData.longitude && (
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>
                          📍 {editData.latitude.toFixed(6)}, {editData.longitude.toFixed(6)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {isEditing && canEditAll && !addressValidated && (
                  <div style={{ gridColumn: '1 / -1', padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#92400e', fontSize: '0.875rem' }}>
                    ⚠️ Utilisez l'autocomplétion ci-dessus pour valider automatiquement l'adresse et obtenir les coordonnées GPS
                  </div>
                )}
              </div>
            </Card>

            {/* Section 3 - CONTACTS - Accessible à tous */}
            <Card style={{ padding: '1.5rem', border: '2px solid #10b981' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                👥 Contacts
                {isEditing && !canEditAll && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#10b981', marginLeft: '0.5rem' }}>
                    ✓ Vous pouvez modifier cette section
                  </span>
                )}
              </h3>
              
              {/* Contacts dynamiques */}
              {contacts.map((contact, idx) => (
                <div key={idx} data-testid={`contact-${idx}`} style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    {isEditing ? (
                      <select
                        data-testid={`contact-type-${idx}`}
                        value={contact.type || 'Propriétaire'}
                        onChange={(e) => {
                          const updated = [...contacts];
                          updated[idx] = { ...updated[idx], type: e.target.value };
                          setContacts(updated);
                        }}
                        style={{ fontWeight: '600', fontSize: '1rem', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.375rem 0.75rem' }}
                      >
                        <option value="Propriétaire">Propriétaire</option>
                        <option value="Locataire">Locataire</option>
                        <option value="Gestionnaire">Gestionnaire</option>
                        <option value="Autre">Autre</option>
                      </select>
                    ) : (
                      <h4 style={{ fontWeight: '600', color: '#374151', fontSize: '1rem' }}>
                        {contact.type || 'Contact'}
                      </h4>
                    )}
                    {isEditing && (
                      <button
                        data-testid={`contact-delete-${idx}`}
                        onClick={() => setContacts(contacts.filter((_, i) => i !== idx))}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500' }}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Nom</label>
                      <input type="text" value={contact.nom || ''} disabled={!isEditing}
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], nom: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Prénom</label>
                      <input type="text" value={contact.prenom || ''} disabled={!isEditing}
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], prenom: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Téléphone</label>
                      <input type="tel" value={contact.telephone || ''} disabled={!isEditing}
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], telephone: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>Courriel</label>
                      <input type="email" value={contact.courriel || ''} disabled={!isEditing}
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], courriel: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.625rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                  </div>
                  <h5 style={{ fontWeight: '500', marginTop: '1rem', marginBottom: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    Adresse postale (si différente du bâtiment)
                  </h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.75rem', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>Adresse</label>
                      <input type="text" value={contact.adresse || ''} disabled={!isEditing} placeholder="123 rue Exemple"
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], adresse: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.75rem', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>Ville</label>
                      <input type="text" value={contact.ville || ''} disabled={!isEditing}
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], ville: e.target.value }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                    <div>
                      <label style={{ fontWeight: '500', fontSize: '0.75rem', color: '#9ca3af', display: 'block', marginBottom: '0.25rem' }}>Code Postal</label>
                      <input type="text" value={contact.code_postal || ''} disabled={!isEditing} placeholder="J2X 1X1"
                        onChange={(e) => { const u = [...contacts]; u[idx] = { ...u[idx], code_postal: e.target.value.toUpperCase() }; setContacts(u); }}
                        style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem' }} />
                    </div>
                  </div>
                </div>
              ))}

              {/* Bouton Ajouter un contact */}
              {isEditing && (
                <button
                  data-testid="add-contact-btn"
                  onClick={() => setContacts([...contacts, { type: 'Propriétaire', nom: '', prenom: '', telephone: '', courriel: '', adresse: '', ville: '', code_postal: '' }])}
                  style={{
                    width: '100%', padding: '0.75rem', border: '2px dashed #d1d5db', borderRadius: '8px',
                    backgroundColor: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem',
                    fontWeight: '500', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.target.style.borderColor = '#10b981'; e.target.style.color = '#10b981'; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = '#d1d5db'; e.target.style.color = '#6b7280'; }}
                >
                  + Ajouter un contact
                </button>
              )}
              {!isEditing && contacts.length === 0 && (
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>Aucun contact enregistré</p>
              )}
            </Card>

            {/* Section 2 - TYPE DE BÂTIMENT & CLASSIFICATION */}
            <Card style={{ padding: '1.5rem', border: '2px solid #dbeafe', opacity: (!canEditAll && isEditing) ? 0.7 : 1 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🏗️ Type de bâtiment & Classification
                {!canEditAll && isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    🔒 Réservé aux préventionnistes
                  </span>
                )}
              </h3>
              
              {/* Ligne 1: Groupe d'occupation */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                  Groupe d'occupation (Code de sécurité) *
                </label>
                <select
                  value={editData.groupe_occupation || ''}
                  onChange={(e) => {
                    handleChange('groupe_occupation', e.target.value);
                    handleChange('sous_type_batiment', ''); // Reset sous-type car dépend du groupe
                  }}
                  disabled={!isEditing || !canEditAll}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                  }}
                >
                  <option value="">Sélectionner...</option>
                  {groupesOccupation.map(groupe => (
                    <option key={groupe.code} value={groupe.code}>{groupe.nom}</option>
                  ))}
                </select>
              </div>

              {/* Ligne 2: Sous-type (selon groupe d'occupation) */}
              {editData.groupe_occupation && (
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                    Sous-type {editData.groupe_occupation && '(pour grille d\'inspection adaptative)'}
                    {editData.groupe_occupation && sousTypesParGroupe[editData.groupe_occupation]?.length === 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                        (Pas de sous-types pour ce groupe)
                      </span>
                    )}
                  </label>
                  <select
                    value={editData.sous_type_batiment || ''}
                    onChange={(e) => handleChange('sous_type_batiment', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  >
                    <option value="">Sélectionner...</option>
                    {sousTypesParGroupe[editData.groupe_occupation]?.map(sousType => (
                      <option key={sousType.value} value={sousType.value}>{sousType.label}</option>
                    ))}
                  </select>
                  {sousTypesParGroupe[editData.groupe_occupation]?.length > 0 && (
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem', 
                      backgroundColor: '#f0f9ff', 
                      border: '1px solid #bae6fd',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#0369a1'
                    }}>
                      ℹ️ Le sous-type sélectionné détermine les questions affichées lors de l'inspection (grille adaptative)
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Section 4 - ÉVALUATION DES RISQUES */}
            <Card style={{ padding: '1.5rem', border: `2px solid ${riskColor.border}`, backgroundColor: riskColor.bg, opacity: (!canEditAll && isEditing) ? 0.7 : 1 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: riskColor.text,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                ⚠️ Évaluation des risques
                {!canEditAll && isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    🔒 Réservé aux préventionnistes
                  </span>
                )}
              </h3>
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                  Niveau de risque *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  {niveauxRisque.map(niveau => {
                    const color = riskColors[niveau];
                    const isSelected = editData.niveau_risque === niveau;
                    return (
                      <button
                        key={niveau}
                        type="button"
                        onClick={() => isEditing && canEditAll && handleChange('niveau_risque', niveau)}
                        disabled={!isEditing || !canEditAll}
                        style={{
                          padding: '1rem 0.75rem',
                          border: `3px solid ${isSelected ? color.border : '#d1d5db'}`,
                          borderRadius: '8px',
                          backgroundColor: isSelected ? color.bg : ((!canEditAll && isEditing) ? '#f3f4f6' : 'white'),
                          color: isSelected ? color.text : '#6b7280',
                          fontWeight: isSelected ? '700' : '500',
                          cursor: (isEditing && canEditAll) ? 'pointer' : 'not-allowed',
                          transition: 'all 0.2s',
                          fontSize: '0.875rem',
                          textAlign: 'center'
                        }}
                      >
                        {niveau}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Section 5 - INFORMATIONS CADASTRALES */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e5e7eb', opacity: (!canEditAll && isEditing) ? 0.7 : 1 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📋 Informations cadastrales
                {!canEditAll && isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    🔒 Réservé aux préventionnistes
                  </span>
                )}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Cadastre / Matricule
                  </label>
                  <input
                    type="text"
                    value={editData.cadastre_matricule || ''}
                    onChange={(e) => handleChange('cadastre_matricule', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Valeur foncière
                  </label>
                  <input
                    type="text"
                    value={editData.valeur_fonciere || ''}
                    onChange={(e) => handleChange('valeur_fonciere', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    placeholder="$"
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Année de construction
                  </label>
                  <input
                    type="number"
                    value={editData.annee_construction || ''}
                    onChange={(e) => handleChange('annee_construction', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    placeholder="2020"
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Nombre d'étages
                  </label>
                  <input
                    type="number"
                    value={editData.nombre_etages || ''}
                    onChange={(e) => handleChange('nombre_etages', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Superficie (m²)
                  </label>
                  <input
                    type="number"
                    value={editData.superficie_totale_m2 || ''}
                    onChange={(e) => handleChange('superficie_totale_m2', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Nombre de logements
                  </label>
                  <input
                    type="number"
                    value={editData.nombre_logements || ''}
                    onChange={(e) => handleChange('nombre_logements', e.target.value)}
                    disabled={!isEditing || !canEditAll}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : 'white'
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Section 6 - GESTION ET ASSIGNATION */}
            <Card style={{ padding: '1.5rem', border: '2px solid #e5e7eb', opacity: (!canEditAll && isEditing) ? 0.7 : 1 }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#6b7280',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🎯 Gestion
                {!canEditAll && isEditing && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', marginLeft: '0.5rem' }}>
                    🔒 Réservé aux préventionnistes
                  </span>
                )}
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Préventionniste assigné
                  </label>
                  <select
                    value={editData.preventionniste_assigne_id || ''}
                    onChange={(e) => handleChange('preventionniste_assigne_id', e.target.value || null)}
                    disabled={!isEditing || !canEditAll}
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      backgroundColor: (!canEditAll && isEditing) ? '#f3f4f6' : (isEditing ? 'white' : '#f9fafb'),
                      cursor: (isEditing && canEditAll) ? 'pointer' : 'not-allowed'
                    }}
                  >
                    <option value="">Aucun préventionniste assigné</option>
                    {preventionnistes.map(prev => (
                      <option key={prev.id} value={prev.id}>
                        🎯 {prev.prenom} {prev.nom} {prev.grade && `(${prev.grade})`}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    Responsable de l'entretien et suivi préventif du bâtiment
                  </p>
                </div>
              </div>
            </Card>

            {/* Section - PRODUITS DANGEREUX */}
            {(() => {
              const pd = editData.produits_dangereux;
              if (!pd) return null;
              let items = [];
              if (Array.isArray(pd)) items = pd;
              else if (pd.produit_dangereux) {
                items = Array.isArray(pd.produit_dangereux) ? pd.produit_dangereux : [pd.produit_dangereux];
              }
              if (!items.length) return null;
              
              // Mapping ERG (Guide des mesures d'urgence) — codes page jaune → substance
              const pageJauneMap = {
                '115': 'Gaz inflammables (hydrogène)', '116': 'Gaz inflammables (méthane)',
                '117': 'Gaz inflammables (butane)', '118': 'Gaz inflammables (acétylène)',
                '124': 'Gaz toxiques/corrosifs', '125': 'Gaz corrosifs (chlore)',
                '127': 'Liquides inflammables (essence)', '128': 'Liquides inflammables (diesel)',
                '129': 'Propane', '130': 'Liquides inflammables (solvants)',
                '131': 'Liquides inflammables (toluène)', '132': 'Liquides inflammables (kérosène)',
                '133': 'Liquides inflammables', '134': 'Liquides combustibles (mazout)',
                '135': 'Solides inflammables', '136': 'Solides inflammables (soufre)',
                '137': 'Solides oxydants', '138': 'Gaz inertes',
                '139': 'Liquides toxiques', '140': 'Oxydants',
                '141': 'Peroxydes organiques', '142': 'Acides',
                '143': 'Pesticides', '144': 'Matières corrosives',
                '145': 'Substances radioactives', '146': 'Substances réactives à l\'eau',
                '147': 'Lithium', '148': 'Matières dangereuses diverses',
                '149': 'Ammoniac', '150': 'Gaz toxiques (CO)',
                '151': 'Huiles essentielles', '152': 'Peintures/Laques',
                '153': 'Matières dangereuses diverses', '154': 'Engrais chimiques',
                '155': 'Explosifs', '156': 'Produits chimiques organiques',
                '157': 'Produits chimiques organiques', '158': 'Matières infectieuses',
                '159': 'Halogénures', '160': 'Métaux réactifs',
                '161': 'Métaux radioactifs', '162': 'Cyanures',
                '163': 'Fluorures', '164': 'Composés arsenicaux',
                '165': 'Composés de plomb', '166': 'Composés de mercure',
                '167': 'Composés de sélénium', '168': 'Acide fluorhydrique',
                '170': 'Métaux (magnésium)', '171': 'Métaux (aluminium)',
              };
              
              const getPageJauneLabel = (code) => {
                if (!code) return '-';
                const name = pageJauneMap[String(code)];
                return name || `Code ${code}`;
              };
              
              return (
                <Card data-testid="produits-dangereux-section" style={{ padding: '1.5rem', border: '2px solid #ef4444' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Produits dangereux
                    <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#9ca3af', backgroundColor: '#fef2f2', padding: '0.125rem 0.5rem', borderRadius: '9999px' }}>
                      {items.length}
                    </span>
                  </h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #fecaca', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Produit</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Équip. raccordé</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Localisation</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Contenant</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Nbr</th>
                          <th style={{ padding: '0.5rem 0.75rem', color: '#991b1b', fontWeight: '600' }}>Volume</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((p, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #fee2e2', backgroundColor: idx % 2 === 0 ? '#fff5f5' : 'white' }}>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '600' }}>
                              <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                                {getPageJauneLabel(p.id_page_jaune)}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>{p.equip_raccorde || '-'}</td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>{p.localisation || (p.secteur ? `Secteur ${p.secteur}` : '-')}</td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>{p.contenant || '-'}</td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>{p.nbr_contenant || '-'}</td>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: '500' }}>{p.volume || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })()}

            {/* Section 7 - NOTES ET COMPLÉMENTS - Accessible à tous */}
            <Card style={{ padding: '1.5rem', border: '2px solid #10b981' }}>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: '600', 
                marginBottom: '1rem',
                color: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                📝 Notes et compléments
                {isEditing && !canEditAll && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#10b981', marginLeft: '0.5rem' }}>
                    ✓ Vous pouvez modifier cette section
                  </span>
                )}
              </h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Description de l'activité
                  </label>
                  <textarea
                    value={editData.description_activite || ''}
                    onChange={(e) => handleChange('description_activite', e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    placeholder="Décrivez l'activité principale du bâtiment..."
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.5rem' }}>
                    Notes générales
                  </label>
                  <textarea
                    value={editData.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    disabled={!isEditing}
                    rows={3}
                    placeholder="Notes additionnelles, particularités, etc..."
                    style={{
                      width: '100%',
                      padding: '0.625rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* ====== SECTION DÉPENDANCES ====== */}
            {!isEditing && batiment?.id && (
              <Card style={{ padding: '1.5rem' }}>
                <DependancesBatiment
                  tenantSlug={tenantSlug}
                  batimentId={batiment.id}
                  batimentAdresse={batiment?.adresse_civique || batiment?.nom_etablissement || 'Adresse'}
                  preventionnisteId={batiment?.preventionniste_assigne_id}
                  onUpdate={() => {
                    fetchDependancesCount();
                    // Notifier le parent pour mettre à jour la liste principale
                    if (onDependancesChange) {
                      onDependancesChange();
                    }
                  }}
                  canEdit={true}
                />
              </Card>
            )}

            {/* ====== SECTION GALERIE PHOTOS ====== */}
            {!isEditing && batiment?.id && (
              <Card style={{ padding: '1.5rem' }}>
                <GaleriePhotosBatiment
                  tenantSlug={tenantSlug}
                  batimentId={batiment.id}
                  canEdit={true}
                />
              </Card>
            )}

            {/* Historique des inspections (pour les bâtiments existants) */}
            {inspections.length > 0 && !isEditing && (
              <Card style={{ padding: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📋 Dernières inspections ({inspections.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {inspections.map(insp => (
                    <div 
                      key={insp.id}
                      onClick={() => {
                        setSelectedInspection(insp);
                        setViewMode('inspection-detail');
                      }}
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '0.5rem',
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,130,246,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: '600' }}>
                            📅 {new Date(insp.date_inspection).toLocaleDateString('fr-CA')}
                          </p>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            Type: {(insp.type_inspection || '').replace(/^\*/, '')}
                          </p>
                        </div>
                        {/* Badge : uniquement si conformité explicitement définie ou avis émis */}
                        {(insp.conformite === 'conforme' || insp.conformite === 'non_conforme' || insp.avis_emis === true) && (
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '1rem',
                            fontSize: '0.75rem',
                            backgroundColor: insp.conformite === 'conforme' ? '#d1fae5' : '#fee2e2',
                            color: insp.conformite === 'conforme' ? '#065f46' : '#991b1b'
                          }}>
                            {insp.conformite === 'conforme' ? '✅ Conforme' : '⚠️ Avis émis'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.5rem', fontWeight: '500' }}>
                        Voir le rapport →
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ====== SECTION HISTORIQUE INTERVENTIONS ====== */}
            {!isEditing && batiment?.id && (
              <HistoriqueInterventionsBatiment
                tenantSlug={tenantSlug}
                batimentId={batiment.id}
              />
            )}

            {/* Non-conformités du bâtiment */}
            {nonConformites.length > 0 && !isEditing && (
              <Card style={{ padding: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  ⚠️ Non-conformités ({nonConformites.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {nonConformites.map(nc => {
                    const prioriteColors = {
                      'haute': { bg: '#fee2e2', color: '#991b1b', label: '🔴 Haute' },
                      'moyenne': { bg: '#fef3c7', color: '#92400e', label: '🟡 Moyenne' },
                      'faible': { bg: '#d1fae5', color: '#065f46', label: '🟢 Faible' }
                    };
                    const statutColors = {
                      'a_corriger': { bg: '#fee2e2', color: '#991b1b', label: 'À corriger' },
                      'ouverte': { bg: '#fee2e2', color: '#991b1b', label: 'Ouverte' },
                      'en_cours': { bg: '#fef3c7', color: '#92400e', label: 'En cours' },
                      'corrige': { bg: '#d1fae5', color: '#065f46', label: 'Corrigé' },
                      'fermee': { bg: '#d1fae5', color: '#065f46', label: 'Fermée' }
                    };
                    const pInfo = prioriteColors[nc.priorite] || prioriteColors['moyenne'];
                    const sInfo = statutColors[nc.statut] || statutColors['a_corriger'];
                    
                    // Formater la date en local
                    const formatDateLocal = (dateStr) => {
                      if (!dateStr) return 'Date inconnue';
                      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        const [year, month, day] = dateStr.split('-').map(Number);
                        return new Date(year, month - 1, day).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
                      }
                      return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
                    };
                    
                    return (
                      <div 
                        key={nc.id}
                        style={{
                          padding: '1rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                              {nc.titre || nc.section_grille || 'Non-conformité'}
                            </p>
                            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              📅 {formatDateLocal(nc.date_identification || nc.created_at)}
                              {nc.est_manuel && ' • 👤 Manuelle'}
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              backgroundColor: pInfo.bg,
                              color: pInfo.color
                            }}>
                              {pInfo.label}
                            </span>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              backgroundColor: sInfo.bg,
                              color: sInfo.color
                            }}>
                              {sInfo.label}
                            </span>
                          </div>
                        </div>
                        {nc.description && (
                          <p style={{ fontSize: '0.875rem', color: '#374151', marginTop: '0.5rem' }}>
                            {nc.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

          </div>
        </div>
      </div>
    </div>
    </>
  );
};

// Export direct du composant - APIProvider est maintenant au niveau racine dans index.js
export default BatimentForm;
