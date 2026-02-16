import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Upload, Download, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const ImportInspectionsBornes = ({ tenantSlug, onImportComplete, onClose }) => {
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Preview, 4: Results
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState([]);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [bornesSeches, setBornesSeches] = useState([]);

  // Champs disponibles pour le mapping
  const availableFields = [
    { key: 'borne_nom', label: 'Nom / Identifiant de la borne', required: true, type: 'select_borne' },
    { key: 'date_inspection', label: 'Date d\'inspection', required: false, type: 'text' },
    { key: 'matricule_inspecteur', label: 'Matricule inspecteur', required: false, type: 'text' },
    { key: 'accessibilite', label: 'Accessibilité de la borne', required: false, type: 'text' },
    { key: 'conditions_atmospheriques', label: 'Conditions atmosphériques', required: false, type: 'text' },
    { key: 'temperature_exterieure', label: 'Température extérieure', required: false, type: 'text' },
    { key: 'joint_present', label: 'Inspection - Joint présent', required: false, type: 'conformite' },
    { key: 'joint_bon_etat', label: 'Inspection - Joint en bon état', required: false, type: 'conformite' },
    { key: 'site_accessible', label: 'Inspection - Site accessible', required: false, type: 'conformite' },
    { key: 'site_deneige', label: 'Inspection - Site bien déneigé', required: false, type: 'conformite' },
    { key: 'vanne_storz_4', label: 'Inspection - Vanne Storz 4"', required: false, type: 'conformite' },
    { key: 'vanne_6_filetee', label: 'Inspection - Vanne 6" filetée', required: false, type: 'conformite' },
    { key: 'vanne_4_filetee', label: 'Inspection - Vanne 4" filetée', required: false, type: 'conformite' },
    { key: 'niveau_plan_eau', label: 'Inspection - Niveau du plan d\'eau', required: false, type: 'conformite' },
    { key: 'pompage_continu', label: 'Essai - Pompage en continu (5 min)', required: false, type: 'conformite' },
    { key: 'cavitation_pompage', label: 'Essai - Cavitation durant le pompage', required: false, type: 'conformite' },
    { key: 'temps_amorcage', label: 'Temps d\'amorçage (secondes)', required: false, type: 'text' },
    { key: 'commentaire', label: 'Commentaire', required: false, type: 'text' }
  ];

  // Charger les bornes sèches au montage
  useEffect(() => {
    loadBornesSeches();
  }, [tenantSlug]);

  const loadBornesSeches = async () => {
    try {
      const data = await apiGet(tenantSlug, '/points-eau?type=borne_seche');
      setBornesSeches(data || []);
    } catch (error) {
      console.error('Erreur chargement bornes sèches:', error);
    }
  };

  const handleFileUpload = (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;

    const fileName = uploadedFile.name.toLowerCase();
    const extension = fileName.split('.').pop();
    
    const supportedExtensions = ['csv', 'xls', 'xlsx', 'txt'];
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

        const data = rows.map((row, index) => ({ ...row, _index: index }));
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
      
      const data = jsonData.map((row, index) => {
        const newRow = { ...row, _index: index };
        // Convertir les dates Excel en dates lisibles
        Object.keys(newRow).forEach(key => {
          let value = newRow[key];
          if (typeof value === 'number' && value > 25569 && value < 50000) {
            const date = new Date((value - 25569) * 86400 * 1000);
            newRow[key] = date.toISOString().split('T')[0];
          }
        });
        return newRow;
      });
      
      setFileData(data);
      autoMapColumns(headers);
      setStep(2);
      
    } catch (error) {
      console.error('Erreur parsing Excel:', error);
      alert(`Erreur de lecture du fichier Excel: ${error.message}`);
    }
  };

  // Mapping automatique intelligent
  const autoMapColumns = (headers) => {
    const mapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    
    const mappingRules = {
      'borne_nom': ['borne', 'nom', 'identifiant', 'numero', 'name', 'darby', 'fiche'],
      'date_inspection': ['date', 'horodateur', 'timestamp'],
      'matricule_inspecteur': ['matricule', 'inspecteur', 'pompier', 'employee'],
      'accessibilite': ['accessibilite', 'accessible'],
      'conditions_atmospheriques': ['conditions', 'atmospherique', 'meteo', 'weather'],
      'temperature_exterieure': ['temperature', 'temp'],
      'joint_present': ['joint present', 'joint_present'],
      'joint_bon_etat': ['joint en bon etat', 'joint bon etat', 'joint_bon_etat'],
      'site_accessible': ['site accessible', 'site_accessible'],
      'site_deneige': ['site bien deneige', 'site deneige', 'deneige', 'deneigement'],
      'vanne_storz_4': ['storz 4', 'storz4', 'vanne storz'],
      'vanne_6_filetee': ['6 filetee', '6" filetee', 'vanne 6'],
      'vanne_4_filetee': ['4 filetee', '4" filetee', 'vanne 4'],
      'niveau_plan_eau': ['niveau', 'plan d\'eau', 'plan_eau'],
      'pompage_continu': ['pompage', 'continu', '5 minutes', '5 min'],
      'cavitation_pompage': ['cavitation'],
      'temps_amorcage': ['temps', 'amorcage', 'secondes'],
      'commentaire': ['commentaire', 'comment', 'note', 'remarque', 'observation']
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

  const handleDefaultValue = (fieldKey, value) => {
    setDefaultValues(prev => ({
      ...prev,
      [fieldKey]: value
    }));
  };

  const generatePreview = () => {
    const preview = fileData.slice(0, 5).map(row => {
      const mapped = {};
      availableFields.forEach(field => {
        if (defaultValues[field.key]) {
          mapped[field.key] = defaultValues[field.key];
        } else {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        }
      });
      return mapped;
    });
    setPreviewData(preview);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    setStep(4);

    const mappedData = fileData.map(row => {
      const mapped = {};
      availableFields.forEach(field => {
        if (defaultValues[field.key]) {
          mapped[field.key] = defaultValues[field.key];
        } else {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        }
      });
      return mapped;
    });

    try {
      const response = await apiPost(tenantSlug, '/inspections-bornes/import-csv', { inspections: mappedData });
      setImportResults(response);

      if (onImportComplete) {
        onImportComplete(response);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      setImportResults({
        created: 0,
        updated: 0,
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
    setDefaultValues({});
    setPreviewData([]);
    setImportResults(null);
    setStep(1);
    setFileType(null);
  };

  const downloadTemplate = () => {
    const headers = [
      'Nom Borne', 'Date', 'Matricule', 'Accessibilité', 'Conditions', 'Température',
      'Joint présent', 'Joint bon état', 'Site accessible', 'Site déneigé',
      'Vanne Storz 4"', 'Vanne 6" filetée', 'Vanne 4" filetée', 'Niveau plan d\'eau',
      'Pompage continu', 'Cavitation', 'Temps amorçage', 'Commentaire'
    ].join(',');
    const example = 'Darby,2026-02-15,967,Facile,Dégagé,-2,Conforme,Conforme,Conforme,N/A,N/A,Conforme,Conforme,Conforme,Conforme,Non conforme,18,RAS';
    const csv = headers + '\n' + example;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_inspections_bornes.csv';
    link.click();
  };

  const renderConformiteSelect = (fieldKey) => (
    <select
      className="w-full p-2 border rounded-md text-sm"
      value={defaultValues[fieldKey] || ''}
      onChange={(e) => handleDefaultValue(fieldKey, e.target.value)}
    >
      <option value="">-- Défaut --</option>
      <option value="Conforme">Conforme</option>
      <option value="Non conforme">Non conforme</option>
      <option value="N/A">N/A</option>
    </select>
  );

  const renderBorneSelect = (fieldKey) => (
    <select
      className="w-full p-2 border rounded-md text-sm"
      value={defaultValues[fieldKey] || ''}
      onChange={(e) => handleDefaultValue(fieldKey, e.target.value)}
    >
      <option value="">-- Défaut --</option>
      {bornesSeches.map(borne => (
        <option key={borne.id} value={borne.nom || borne.numero_identification}>
          {borne.nom || borne.numero_identification}
        </option>
      ))}
    </select>
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          📥 Import Inspections - Bornes Sèches
        </CardTitle>
        <CardDescription>
          Importez en masse vos inspections depuis un fichier CSV ou Excel avec mapping intelligent
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Étape 1: Upload fichier */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="file-upload-insp" className="cursor-pointer flex-1">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {file ? file.name : 'Cliquez pour sélectionner un fichier'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>CSV, XLS, XLSX, TXT</strong> acceptés
                  </p>
                </div>
                <input 
                  id="file-upload-insp"
                  type="file"
                  accept=".csv,.CSV,.xls,.XLS,.xlsx,.XLSX,.txt,.TXT"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Télécharger le template CSV
            </Button>

            {onClose && (
              <Button variant="ghost" onClick={onClose} className="w-full">
                Annuler
              </Button>
            )}
          </div>
        )}

        {/* Étape 2: Mapping des colonnes */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-semibold text-lg">Mapping des colonnes</h3>
                <p className="text-sm text-gray-600">
                  {fileData.length} lignes détectées - Associez vos colonnes aux champs
                </p>
              </div>
              {fileType && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {fileType.toUpperCase()}
                </span>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm">
              <p className="mb-1">
                💡 <strong>Astuce:</strong> Utilisez la colonne "Valeur par défaut" pour appliquer une même valeur à toutes les lignes.
              </p>
              <p className="text-xs text-gray-600">
                ⚠️ Les champs non reconnus seront ignorés. La valeur par défaut écrase les données du fichier si les deux sont renseignés.
              </p>
            </div>

            {/* En-tête du tableau de mapping */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 40px 2fr 2fr 2.5fr',
              gap: '0.5rem',
              padding: '0.75rem',
              backgroundColor: '#f8fafc',
              fontWeight: '600',
              borderBottom: '2px solid #e2e8f0',
              fontSize: '0.8rem',
              borderRadius: '8px 8px 0 0'
            }}>
              <div>Champ système</div>
              <div style={{ textAlign: 'center' }}>➡️</div>
              <div>Colonne fichier</div>
              <div>💾 Valeur par défaut</div>
              <div>📋 Aperçu données</div>
            </div>

            <div className="bg-white rounded-b-lg border border-t-0 max-h-96 overflow-y-auto">
              {availableFields.map(field => (
                <div key={field.key} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 40px 2fr 2fr 2.5fr',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  borderBottom: '1px solid #e5e7eb',
                  alignItems: 'center'
                }}>
                  {/* Champ cible */}
                  <div>
                    <span style={{ fontWeight: '500', color: '#475569', fontSize: '0.875rem' }}>
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </span>
                  </div>
                  
                  {/* Flèche */}
                  <div style={{ textAlign: 'center', color: '#9ca3af' }}>➡️</div>
                  
                  {/* Sélecteur de colonne */}
                  <div>
                    <select
                      className="w-full p-2 border rounded-md text-sm"
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => handleColumnMapping(field.key, e.target.value)}
                      disabled={!!defaultValues[field.key]}
                      style={{
                        backgroundColor: defaultValues[field.key] ? '#f1f5f9' : 'white'
                      }}
                    >
                      <option value="">-- Non mappé --</option>
                      {fileHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Valeur par défaut */}
                  <div>
                    {field.type === 'conformite' ? (
                      renderConformiteSelect(field.key)
                    ) : field.type === 'select_borne' ? (
                      renderBorneSelect(field.key)
                    ) : (
                      <Input
                        type="text"
                        placeholder="Valeur par défaut"
                        value={defaultValues[field.key] || ''}
                        onChange={(e) => handleDefaultValue(field.key, e.target.value)}
                        className="text-sm"
                      />
                    )}
                  </div>

                  {/* Aperçu des données */}
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {defaultValues[field.key] ? (
                      <span style={{ fontWeight: '600', color: '#059669' }}>
                        ✓ {defaultValues[field.key]} <small style={{ opacity: 0.7 }}>(toutes)</small>
                      </span>
                    ) : columnMapping[field.key] && fileData[0] ? (
                      <span style={{ 
                        display: 'inline-block',
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundColor: '#f0fdf4',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: '#166534'
                      }}>
                        {fileData[0][columnMapping[field.key]] || <em style={{ color: '#9ca3af' }}>(vide)</em>}
                      </span>
                    ) : (
                      <span style={{ color: '#d1d5db' }}>—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={resetImport}>Annuler</Button>
              <Button onClick={generatePreview} className="flex-1 bg-blue-600 hover:bg-blue-700">
                Aperçu avant import →
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3: Aperçu */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">
                Aperçu des données mappées ({fileData.length} inspections)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Vérifiez les 5 premières lignes avant d'importer
              </p>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '400px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
                    {availableFields.slice(0, 10).map(field => (
                      <th key={field.key} style={{ 
                        padding: '10px', 
                        textAlign: 'left', 
                        fontSize: '10px', 
                        fontWeight: '600', 
                        color: '#6b7280', 
                        textTransform: 'uppercase', 
                        whiteSpace: 'nowrap',
                        borderBottom: '2px solid #e5e7eb'
                      }}>
                        {field.label.split(' - ').pop().substring(0, 15)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      {availableFields.slice(0, 10).map(field => (
                        <td key={field.key} style={{ 
                          padding: '8px 10px', 
                          maxWidth: '120px', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {row[field.key] || <span style={{ color: '#d1d5db' }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>← Retour au mapping</Button>
              <Button 
                onClick={handleImport} 
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={importing}
              >
                {importing ? 'Import en cours...' : `Importer ${fileData.length} inspections`}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 4: Résultats */}
        {step === 4 && (
          <div className="space-y-4">
            {importing ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Import en cours...</p>
              </div>
            ) : importResults && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <CheckCircle className="h-8 w-8 text-green-600 mx-auto" />
                    <p className="text-2xl font-bold text-green-600 mt-2">{importResults.created || 0}</p>
                    <p className="text-sm text-green-700">Créées</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <AlertCircle className="h-8 w-8 text-blue-600 mx-auto" />
                    <p className="text-2xl font-bold text-blue-600 mt-2">{importResults.updated || 0}</p>
                    <p className="text-sm text-blue-700">Mises à jour</p>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg text-center">
                    <XCircle className="h-8 w-8 text-red-600 mx-auto" />
                    <p className="text-2xl font-bold text-red-600 mt-2">{importResults.errors?.length || 0}</p>
                    <p className="text-sm text-red-700">Erreurs</p>
                  </div>
                </div>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <h4 className="font-semibold text-red-700 mb-2">Détails des erreurs:</h4>
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
                  {onClose && (
                    <Button onClick={onClose} className="flex-1">
                      Fermer
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportInspectionsBornes;
