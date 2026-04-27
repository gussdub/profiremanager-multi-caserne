import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, Download, CheckCircle, XCircle, AlertCircle, MapPin, FileText, Globe, Droplet } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import JSZip from 'jszip';

/**
 * ImportHydrants - Import de points d'eau (bornes sèches, fontaines, etc.)
 * Supporte: CSV, Excel (XLS/XLSX), KML, KMZ, XML avec parsing intelligent
 */
const ImportHydrants = ({ tenantSlug, onImportComplete, onClose }) => {
  const [step, setStep] = useState(1); // 1: Upload, 2: Config/Mapping, 3: Preview, 4: Duplicates, 5: Results
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultType, setDefaultType] = useState('');
  const [assignTypePerPoint, setAssignTypePerPoint] = useState(false);
  const [pointTypes, setPointTypes] = useState([]);
  const [previewData, setPreviewData] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [duplicateActions, setDuplicateActions] = useState({});
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [existingPoints, setExistingPoints] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Types de points d'eau disponibles
  const typeOptions = [
    { value: 'borne_seche', label: 'Borne sèche' },
    { value: 'borne_fontaine', label: 'Borne fontaine' },
    { value: 'piscine', label: 'Piscine' },
    { value: 'lac', label: 'Lac / Étang' },
    { value: 'riviere', label: 'Rivière / Cours d\'eau' },
    { value: 'citerne', label: 'Citerne' },
    { value: 'reservoir', label: 'Réservoir' },
    { value: 'autre', label: 'Autre' }
  ];

  // Champs disponibles pour le mapping CSV/Excel
  const availableFields = [
    { key: 'nom', label: 'Nom / Identifiant', required: true },
    { key: 'latitude', label: 'Latitude', required: true },
    { key: 'longitude', label: 'Longitude', required: true },
    { key: 'type', label: 'Type de point d\'eau', required: false },
    { key: 'adresse', label: 'Adresse', required: false },
    { key: 'description', label: 'Description', required: false },
    { key: 'capacite', label: 'Capacité (litres)', required: false },
    { key: 'debit', label: 'Débit (L/min)', required: false },
    { key: 'remarques', label: 'Remarques', required: false }
  ];

  // Charger les points d'eau existants au montage
  useEffect(() => {
    loadExistingPoints();
  }, [tenantSlug]);

  const loadExistingPoints = async () => {
    try {
      const data = await apiGet(tenantSlug, '/points-eau');
      setExistingPoints(data || []);
    } catch (error) {
      console.error('Erreur chargement points d\'eau:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;
    processFile(uploadedFile);
  };

  // Gestionnaires Drag & Drop
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (uploadedFile) => {
    const fileName = uploadedFile.name.toLowerCase();
    const extension = fileName.split('.').pop();
    
    const supportedExtensions = ['csv', 'xls', 'xlsx', 'txt', 'kml', 'kmz', 'xml'];
    if (!supportedExtensions.includes(extension)) {
      alert(`Format non supporté. Formats acceptés: ${supportedExtensions.join(', ').toUpperCase()}`);
      return;
    }

    setFile(uploadedFile);
    setFileType(extension);

    if (extension === 'csv' || extension === 'txt') {
      parseCSV(uploadedFile);
    } else if (extension === 'xls' || extension === 'xlsx') {
      parseExcel(uploadedFile);
    } else if (extension === 'kml' || extension === 'xml') {
      parseKML(uploadedFile);  // XML utilise le même parser que KML
    } else if (extension === 'kmz') {
      parseKMZ(uploadedFile);
    }
  };

  const parseCSV = (file) => {
    Papa.parse(file, {
      complete: (results) => {
        if (results.data.length < 1) {
          alert("Le fichier doit contenir au moins un en-tête et une ligne de données");
          return;
        }

        const rows = results.data.filter(row => Object.values(row).some(val => val && val.toString().trim() !== ''));
        
        if (rows.length === 0) {
          alert("Le fichier ne contient pas de données valides");
          return;
        }

        const headers = results.meta.fields || Object.keys(rows[0]);
        setFileHeaders(headers);

        const data = rows.map((row, index) => ({ ...row, _index: index, _type: '' }));
        setFileData(data);
        
        autoMapColumns(headers);
        setStep(2);
      },
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8'
    });
  };

  const parseExcel = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      if (jsonData.length === 0) {
        alert("Le fichier ne contient pas de données");
        return;
      }

      const headers = Object.keys(jsonData[0]);
      setFileHeaders(headers);
      
      const data = jsonData.map((row, index) => ({ ...row, _index: index, _type: '' }));
      setFileData(data);
      
      autoMapColumns(headers);
      setStep(2);
      
    } catch (error) {
      console.error('Erreur parsing Excel:', error);
      alert(`Erreur de lecture du fichier Excel: ${error.message}`);
    }
  };

  const parseKML = async (file) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // Vérifier s'il y a des erreurs de parsing XML
      const parserError = xmlDoc.getElementsByTagName('parsererror');
      if (parserError.length > 0) {
        throw new Error('Format XML invalide');
      }
      
      // Essayer de trouver des placemarks (KML standard)
      let placemarks = xmlDoc.getElementsByTagName('Placemark');
      const data = [];
      
      // Si pas de Placemark, essayer d'autres structures XML communes
      if (placemarks.length === 0) {
        // Chercher des balises génériques pour points/bornes
        const possibleTags = ['point', 'marker', 'location', 'hydrant', 'borne', 'fontaine', 'feature'];
        for (const tag of possibleTags) {
          const elements = xmlDoc.getElementsByTagName(tag);
          if (elements.length > 0) {
            placemarks = elements;
            break;
          }
        }
      }
      
      if (placemarks.length === 0) {
        alert("Format XML non reconnu. Le fichier doit contenir des balises <Placemark> (KML) ou des balises de points géographiques.");
        return;
      }
      
      for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        
        // Extraire le nom (plusieurs variantes possibles)
        let nom = null;
        const nameVariants = ['name', 'nom', 'title', 'id', 'label'];
        for (const variant of nameVariants) {
          const el = placemark.getElementsByTagName(variant)[0];
          if (el && el.textContent.trim()) {
            nom = el.textContent.trim();
            break;
          }
        }
        if (!nom) nom = `Point ${i + 1}`;
        
        // Extraire la description
        let description = '';
        const descVariants = ['description', 'desc', 'info', 'details'];
        for (const variant of descVariants) {
          const el = placemark.getElementsByTagName(variant)[0];
          if (el && el.textContent.trim()) {
            description = el.textContent.trim();
            break;
          }
        }
        
        // Extraire les coordonnées (plusieurs formats possibles)
        let lat = null, lng = null, alt = 0;
        
        // Format 1: KML <coordinates>longitude,latitude,altitude</coordinates>
        const coordEl = placemark.getElementsByTagName('coordinates')[0];
        if (coordEl) {
          const coordText = coordEl.textContent.trim();
          const parts = coordText.split(',').map(c => parseFloat(c.trim()));
          if (parts.length >= 2) {
            lng = parts[0];
            lat = parts[1];
            alt = parts[2] || 0;
          }
        }
        
        // Format 2: Balises séparées <lat> et <lon> (ou lng/long)
        if (lat === null || lng === null) {
          const latVariants = ['lat', 'latitude', 'y'];
          const lngVariants = ['lon', 'lng', 'longitude', 'long', 'x'];
          
          for (const variant of latVariants) {
            const el = placemark.getElementsByTagName(variant)[0];
            if (el) {
              const val = parseFloat(el.textContent.trim());
              if (!isNaN(val)) {
                lat = val;
                break;
              }
            }
          }
          
          for (const variant of lngVariants) {
            const el = placemark.getElementsByTagName(variant)[0];
            if (el) {
              const val = parseFloat(el.textContent.trim());
              if (!isNaN(val)) {
                lng = val;
                break;
              }
            }
          }
        }
        
        // Format 3: Attributs XML (ex: <point lat="45.5" lng="-73.5" />)
        if (lat === null || lng === null) {
          if (placemark.hasAttribute('lat') || placemark.hasAttribute('latitude')) {
            lat = parseFloat(placemark.getAttribute('lat') || placemark.getAttribute('latitude'));
          }
          if (placemark.hasAttribute('lon') || placemark.hasAttribute('lng') || placemark.hasAttribute('longitude')) {
            lng = parseFloat(placemark.getAttribute('lon') || placemark.getAttribute('lng') || placemark.getAttribute('longitude'));
          }
        }
        
        // Vérifier si on a des coordonnées valides
        if (!isNaN(lat) && !isNaN(lng) && lat !== null && lng !== null) {
          // Extraire d'autres champs possibles
          const extractField = (fieldNames) => {
            for (const name of fieldNames) {
              const el = placemark.getElementsByTagName(name)[0];
              if (el && el.textContent.trim()) {
                return el.textContent.trim();
              }
            }
            return '';
          };
          
          data.push({
            _index: i,
            _type: '',
            nom: nom,
            latitude: lat,
            longitude: lng,
            description: description,
            altitude: alt || 0,
            adresse: extractField(['adresse', 'address', 'location']),
            type: extractField(['type', 'category', 'classe']),
            capacite: extractField(['capacite', 'capacity', 'volume']),
            debit: extractField(['debit', 'flow', 'flow_rate']),
            remarques: extractField(['remarques', 'remarks', 'notes', 'comment'])
          });
        }
      }
      
      if (data.length === 0) {
        alert("Aucun point avec coordonnées valides trouvé dans le fichier XML/KML");
        return;
      }
      
      setFileData(data);
      setFileHeaders(['nom', 'latitude', 'longitude', 'description', 'adresse', 'type']);
      // Pour KML/XML, pré-mapper automatiquement les champs détectés
      setColumnMapping({
        nom: 'nom',
        latitude: 'latitude',
        longitude: 'longitude',
        description: 'description',
        adresse: 'adresse',
        type: 'type'
      });
      setStep(2);
      
    } catch (error) {
      console.error('Erreur parsing KML/XML:', error);
      alert(`Erreur de lecture du fichier KML/XML: ${error.message}`);
    }
  };

  const parseKMZ = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      // Chercher le fichier .kml dans l'archive
      let kmlContent = null;
      for (const filename of Object.keys(zip.files)) {
        if (filename.toLowerCase().endsWith('.kml')) {
          kmlContent = await zip.files[filename].async('string');
          break;
        }
      }
      
      if (!kmlContent) {
        alert("Aucun fichier KML trouvé dans l'archive KMZ");
        return;
      }
      
      // Parser le KML extrait
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');
      
      const placemarks = xmlDoc.getElementsByTagName('Placemark');
      const data = [];
      
      for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        
        const nameEl = placemark.getElementsByTagName('name')[0];
        const nom = nameEl ? nameEl.textContent : `Point ${i + 1}`;
        
        const descEl = placemark.getElementsByTagName('description')[0];
        const description = descEl ? descEl.textContent : '';
        
        const coordEl = placemark.getElementsByTagName('coordinates')[0];
        if (coordEl) {
          const coordText = coordEl.textContent.trim();
          const [lng, lat, alt] = coordText.split(',').map(c => parseFloat(c.trim()));
          
          if (!isNaN(lat) && !isNaN(lng)) {
            data.push({
              _index: i,
              _type: '',
              nom: nom,
              latitude: lat,
              longitude: lng,
              description: description,
              altitude: alt || 0
            });
          }
        }
      }
      
      if (data.length === 0) {
        alert("Aucun point avec coordonnées trouvé dans le fichier KMZ");
        return;
      }
      
      setFileData(data);
      setFileHeaders(['nom', 'latitude', 'longitude', 'description']);
      setColumnMapping({
        nom: 'nom',
        latitude: 'latitude',
        longitude: 'longitude',
        description: 'description'
      });
      setStep(2);
      
    } catch (error) {
      console.error('Erreur parsing KMZ:', error);
      alert(`Erreur de lecture du fichier KMZ: ${error.message}`);
    }
  };

  // Mapping automatique intelligent
  const autoMapColumns = (headers) => {
    const mapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    
    const mappingRules = {
      'nom': ['nom', 'name', 'identifiant', 'numero', 'id', 'borne', 'point'],
      'latitude': ['latitude', 'lat', 'y'],
      'longitude': ['longitude', 'long', 'lng', 'x'],
      'type': ['type', 'categorie', 'category'],
      'adresse': ['adresse', 'address', 'lieu', 'location'],
      'description': ['description', 'desc', 'note', 'commentaire'],
      'capacite': ['capacite', 'capacity', 'volume', 'litres'],
      'debit': ['debit', 'flow', 'l/min'],
      'remarques': ['remarque', 'remark', 'observation']
    };
    
    availableFields.forEach(field => {
      const rules = mappingRules[field.key] || [field.key];
      
      for (let i = 0; i < headers.length; i++) {
        const header = normalizedHeaders[i];
        if (rules.some(rule => header.includes(rule.toLowerCase()))) {
          mapping[field.key] = headers[i];
          break;
        }
      }
    });
    
    setColumnMapping(mapping);
  };

  const handleColumnMapping = (fieldKey, csvColumn) => {
    setColumnMapping(prev => ({
      ...prev,
      [fieldKey]: csvColumn
    }));
  };

  const handlePointTypeChange = (index, type) => {
    setFileData(prev => prev.map((row, i) => 
      i === index ? { ...row, _type: type } : row
    ));
  };

  const generatePreview = () => {
    // Vérifier que les champs requis sont mappés
    if (!columnMapping.nom || !columnMapping.latitude || !columnMapping.longitude) {
      alert("Les champs Nom, Latitude et Longitude sont requis");
      return;
    }

    // Vérifier qu'un type est défini
    if (!defaultType && !assignTypePerPoint) {
      alert("Veuillez sélectionner un type de point d'eau par défaut ou activer l'assignation individuelle");
      return;
    }

    const preview = fileData.slice(0, 10).map(row => {
      const mapped = {
        nom: row[columnMapping.nom] || row.nom || '',
        latitude: parseFloat(row[columnMapping.latitude] || row.latitude) || 0,
        longitude: parseFloat(row[columnMapping.longitude] || row.longitude) || 0,
        type: assignTypePerPoint ? (row._type || defaultType) : defaultType,
        adresse: row[columnMapping.adresse] || row.adresse || '',
        description: row[columnMapping.description] || row.description || '',
        capacite: row[columnMapping.capacite] || '',
        debit: row[columnMapping.debit] || '',
        remarques: row[columnMapping.remarques] || ''
      };
      return mapped;
    });
    
    setPreviewData(preview);
    
    // Vérifier les doublons
    checkDuplicates();
  };

  const checkDuplicates = () => {
    const found = [];
    const tolerance = 0.0001; // ~11m de tolérance
    
    fileData.forEach((row, index) => {
      const lat = parseFloat(row[columnMapping.latitude] || row.latitude);
      const lng = parseFloat(row[columnMapping.longitude] || row.longitude);
      const nom = row[columnMapping.nom] || row.nom || '';
      
      const existing = existingPoints.find(p => {
        const pLat = parseFloat(p.latitude || p.coordonnees?.lat);
        const pLng = parseFloat(p.longitude || p.coordonnees?.lng);
        const pNom = p.nom || p.numero_identification || '';
        
        // Vérifier par coordonnées (proche) ou par nom identique
        const sameCoords = Math.abs(pLat - lat) < tolerance && Math.abs(pLng - lng) < tolerance;
        const sameName = pNom.toLowerCase() === nom.toLowerCase();
        
        return sameCoords || sameName;
      });
      
      if (existing) {
        found.push({
          index,
          newData: { nom, latitude: lat, longitude: lng },
          existingData: existing
        });
      }
    });
    
    setDuplicates(found);
    
    // Initialiser les actions par défaut (ignorer)
    const actions = {};
    found.forEach(d => {
      actions[d.index] = 'skip'; // 'skip', 'update', 'create'
    });
    setDuplicateActions(actions);
    
    if (found.length > 0) {
      setStep(4); // Afficher l'écran de gestion des doublons
    } else {
      setStep(3); // Passer directement à la prévisualisation
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setStep(5);

    const pointsToImport = fileData.map((row, index) => {
      const duplicateAction = duplicateActions[index];
      
      // Si c'est un doublon et qu'on doit l'ignorer
      if (duplicateAction === 'skip') {
        return null;
      }
      
      const duplicate = duplicates.find(d => d.index === index);
      
      return {
        nom: row[columnMapping.nom] || row.nom || '',
        latitude: parseFloat(row[columnMapping.latitude] || row.latitude) || 0,
        longitude: parseFloat(row[columnMapping.longitude] || row.longitude) || 0,
        type: assignTypePerPoint ? (row._type || defaultType) : defaultType,
        adresse: row[columnMapping.adresse] || row.adresse || '',
        description: row[columnMapping.description] || row.description || '',
        capacite: row[columnMapping.capacite] || null,
        debit: row[columnMapping.debit] || null,
        remarques: row[columnMapping.remarques] || '',
        _action: duplicateAction || 'create',
        _existingId: duplicate?.existingData?.id || null
      };
    }).filter(p => p !== null);

    try {
      const response = await apiPost(tenantSlug, '/points-eau/import', { 
        points: pointsToImport 
      });
      setImportResults(response);

      if (onImportComplete) {
        onImportComplete(response);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      setImportResults({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [{ ligne: 0, erreur: error.data?.detail || error.message || 'Erreur inconnue' }]
      });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setFileData([]);
    setFileHeaders([]);
    setColumnMapping({});
    setDefaultType('');
    setAssignTypePerPoint(false);
    setPreviewData([]);
    setDuplicates([]);
    setDuplicateActions({});
    setImportResults(null);
    setStep(1);
    setFileType(null);
  };

  const downloadTemplate = () => {
    const headers = ['Nom', 'Latitude', 'Longitude', 'Type', 'Adresse', 'Description', 'Capacité (L)', 'Débit (L/min)', 'Remarques'].join(',');
    const examples = [
      'Borne-001,45.5017,-73.5673,borne_seche,123 Rue Principale,Près du parc,50000,1500,Accès facile',
      'Lac-Nord,45.5123,-73.5789,lac,Chemin du Lac,Lac municipal,500000,,Accessible en été seulement'
    ].join('\n');
    const csv = headers + '\n' + examples;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_points_eau.csv';
    link.click();
  };

  const isKMLFormat = fileType === 'kml' || fileType === 'kmz' || fileType === 'xml';

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplet className="h-5 w-5 text-blue-600" />
          Import Points d'eau (Hydrants)
        </CardTitle>
        <CardDescription>
          Importez vos points d'eau depuis CSV, Excel, KML, KMZ ou XML
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Étape 1: Upload fichier */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-sm">CSV / Excel</span>
                </div>
                <p className="text-xs text-gray-600">Tableau avec colonnes Nom, Latitude, Longitude</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-sm">KML / KMZ / XML</span>
                </div>
                <p className="text-xs text-gray-600">Export Google Earth / Maps ou XML générique</p>
              </div>
            </div>

            <label htmlFor="file-upload-hydrants" className="cursor-pointer block">
              <div 
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-blue-500'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {file ? file.name : dragActive ? 'Déposez le fichier ici' : 'Cliquez ou glissez-déposez un fichier'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  <strong>CSV, XLS, XLSX, KML, KMZ, XML</strong> acceptés
                </p>
              </div>
              <input 
                id="file-upload-hydrants"
                type="file"
                accept=".csv,.CSV,.txt,.TXT,.xls,.XLS,.xlsx,.XLSX,.kml,.KML,.kmz,.KMZ,.xml,.XML"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Télécharger le template CSV
            </Button>
          </div>
        )}

        {/* Étape 2: Configuration et Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-semibold text-lg">Configuration de l'import</h3>
                <p className="text-sm text-gray-600">
                  {fileData.length} points détectés depuis {fileType?.toUpperCase()}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                isKMLFormat ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {fileType?.toUpperCase()}
              </span>
            </div>

            {/* Type de point d'eau */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <Label className="font-semibold mb-2 block">Type de point d'eau</Label>
              
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="assign-per-point"
                  checked={assignTypePerPoint}
                  onChange={(e) => setAssignTypePerPoint(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="assign-per-point" className="text-sm">
                  Assigner un type différent par point
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-600 mb-1 block">
                    {assignTypePerPoint ? 'Type par défaut' : 'Type pour tous les points'}
                  </Label>
                  <select
                    className="w-full p-2 border rounded-md text-sm"
                    value={defaultType}
                    onChange={(e) => setDefaultType(e.target.value)}
                  >
                    <option value="">-- Sélectionner --</option>
                    {typeOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Mapping des colonnes (seulement pour CSV/Excel) */}
            {!isKMLFormat && (
              <div className="border rounded-lg p-4">
                <h4 className="font-semibold mb-3">Mapping des colonnes</h4>
                <div className="space-y-2">
                  {availableFields.map(field => (
                    <div key={field.key} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-sm">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </span>
                      <select
                        className="col-span-2 p-2 border rounded-md text-sm"
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => handleColumnMapping(field.key, e.target.value)}
                      >
                        <option value="">-- Non mappé --</option>
                        {fileHeaders.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assignation individuelle des types */}
            {assignTypePerPoint && (
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto">
                <h4 className="font-semibold mb-3">Types par point</h4>
                <div className="space-y-2">
                  {fileData.slice(0, 20).map((row, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 items-center text-sm">
                      <span className="truncate">
                        {row[columnMapping.nom] || row.nom || `Point ${index + 1}`}
                      </span>
                      <select
                        className="p-1 border rounded text-sm"
                        value={row._type || defaultType}
                        onChange={(e) => handlePointTypeChange(index, e.target.value)}
                      >
                        <option value="">-- Type --</option>
                        {typeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {fileData.length > 20 && (
                    <p className="text-xs text-gray-500 text-center">
                      ...et {fileData.length - 20} autres points (utiliseront le type par défaut)
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={resetImport}>Annuler</Button>
              <Button onClick={generatePreview} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Vérifier et continuer
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3: Aperçu */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">
                Aperçu des données ({fileData.length} points)
              </h3>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Nom</th>
                    <th className="p-2 text-left">Latitude</th>
                    <th className="p-2 text-left">Longitude</th>
                    <th className="p-2 text-left">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{row.nom}</td>
                      <td className="p-2">{row.latitude?.toFixed(6)}</td>
                      <td className="p-2">{row.longitude?.toFixed(6)}</td>
                      <td className="p-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          {typeOptions.find(t => t.value === row.type)?.label || row.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button 
                onClick={handleImport} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Importer {fileData.length} points
              </Button>
            </div>
          </div>
        )}

        {/* Étape 4: Gestion des doublons */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="font-semibold text-amber-800 mb-2">
                <AlertCircle className="inline h-5 w-5 mr-2" />
                {duplicates.length} doublon(s) détecté(s)
              </h3>
              <p className="text-sm text-amber-700">
                Des points avec des coordonnées ou noms similaires existent déjà. Choisissez l'action pour chacun.
              </p>
            </div>

            <div className="border rounded-lg max-h-80 overflow-y-auto">
              {duplicates.map((dup, idx) => (
                <div key={idx} className="p-3 border-b last:border-b-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-sm">{dup.newData.nom}</p>
                      <p className="text-xs text-gray-500">
                        {dup.newData.latitude?.toFixed(6)}, {dup.newData.longitude?.toFixed(6)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <p>Existant: {dup.existingData.nom || dup.existingData.numero_identification}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className={`flex-1 px-3 py-1 rounded text-xs ${
                        duplicateActions[dup.index] === 'skip' 
                          ? 'bg-gray-600 text-white' 
                          : 'bg-gray-100 text-gray-700'
                      }`}
                      onClick={() => setDuplicateActions(prev => ({ ...prev, [dup.index]: 'skip' }))}
                    >
                      Ignorer
                    </button>
                    <button
                      className={`flex-1 px-3 py-1 rounded text-xs ${
                        duplicateActions[dup.index] === 'update' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-blue-100 text-blue-700'
                      }`}
                      onClick={() => setDuplicateActions(prev => ({ ...prev, [dup.index]: 'update' }))}
                    >
                      Mettre à jour
                    </button>
                    <button
                      className={`flex-1 px-3 py-1 rounded text-xs ${
                        duplicateActions[dup.index] === 'create' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-green-100 text-green-700'
                      }`}
                      onClick={() => setDuplicateActions(prev => ({ ...prev, [dup.index]: 'create' }))}
                    >
                      Créer quand même
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button 
                onClick={handleImport} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Continuer l'import
              </Button>
            </div>
          </div>
        )}

        {/* Étape 5: Résultats */}
        {step === 5 && (
          <div className="space-y-4">
            {importing ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Import en cours...</p>
              </div>
            ) : importResults && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <CheckCircle className="h-6 w-6 text-green-600 mx-auto" />
                    <p className="text-xl font-bold text-green-600 mt-1">{importResults.created || 0}</p>
                    <p className="text-xs text-green-700">Créés</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <AlertCircle className="h-6 w-6 text-blue-600 mx-auto" />
                    <p className="text-xl font-bold text-blue-600 mt-1">{importResults.updated || 0}</p>
                    <p className="text-xs text-blue-700">Mis à jour</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg text-center">
                    <XCircle className="h-6 w-6 text-gray-400 mx-auto" />
                    <p className="text-xl font-bold text-gray-600 mt-1">{importResults.skipped || 0}</p>
                    <p className="text-xs text-gray-700">Ignorés</p>
                  </div>
                  <div className="bg-red-50 p-3 rounded-lg text-center">
                    <XCircle className="h-6 w-6 text-red-600 mx-auto" />
                    <p className="text-xl font-bold text-red-600 mt-1">{importResults.errors?.length || 0}</p>
                    <p className="text-xs text-red-700">Erreurs</p>
                  </div>
                </div>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                    <h4 className="font-semibold text-red-700 mb-2">Erreurs:</h4>
                    <ul className="text-sm text-red-600 space-y-1">
                      {importResults.errors.map((err, idx) => (
                        <li key={idx}>Ligne {err.ligne}: {err.erreur}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={resetImport} className="flex-1">
                    Nouvel import
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportHydrants;
