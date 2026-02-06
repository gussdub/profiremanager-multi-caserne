import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, Download, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const ImportCSVEquipements = ({ tenantSlug, onImportComplete }) => {
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Preview, 4: Results
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [categories, setCategories] = useState([]);

  // Champs disponibles pour le mapping
  const availableFields = [
    { key: 'nom', label: 'Nom de l\'équipement', required: true },
    { key: 'code_unique', label: 'Code unique (auto-généré si vide)', required: false },
    { key: 'categorie_nom', label: 'Catégorie', required: true },
    { key: 'etat', label: 'État (bon, a_reparer, en_reparation, hors_service)', required: false },
    { key: 'emplacement', label: 'Emplacement / Localisation', required: false },
    { key: 'quantite', label: 'Quantité', required: false },
    { key: 'quantite_minimum', label: 'Quantité minimum (alerte stock bas)', required: false },
    { key: 'vehicule', label: 'Véhicule assigné (nom)', required: false },
    { key: 'employe', label: 'Employé assigné (nom)', required: false },
    { key: 'date_acquisition', label: 'Date d\'acquisition (YYYY-MM-DD)', required: false },
    { key: 'date_fin_vie', label: 'Date fin de vie (YYYY-MM-DD)', required: false },
    { key: 'date_prochaine_maintenance', label: 'Date prochaine maintenance (YYYY-MM-DD)', required: false },
    { key: 'valeur_achat', label: 'Valeur d\'achat ($)', required: false },
    { key: 'notes', label: 'Notes / Remarques', required: false }
  ];

  // Charger les catégories au montage
  React.useEffect(() => {
    loadCategories();
  }, [tenantSlug]);

  const loadCategories = async () => {
    try {
      const data = await apiGet(tenantSlug, '/equipements/categories');
      setCategories(data || []);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const extension = fileName.split('.').pop();
    
    const supportedExtensions = ['csv', 'xls', 'xlsx', 'txt'];
    if (!supportedExtensions.includes(extension)) {
      alert(`Format non supporté. Formats acceptés: ${supportedExtensions.join(', ').toUpperCase()}`);
      return;
    }

    setCsvFile(file);
    setFileType(extension);

    if (extension === 'csv' || extension === 'txt') {
      parseCSV(file);
    } else if (extension === 'xls' || extension === 'xlsx') {
      parseExcel(file);
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
        setCsvHeaders(headers);

        const data = rows.map((row, index) => ({ ...row, _index: index }));
        setCsvData(data);
        
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
      setCsvHeaders(headers);
      
      const data = jsonData.map((row, index) => {
        const newRow = { ...row, _index: index };
        Object.keys(newRow).forEach(key => {
          let value = newRow[key];
          if (typeof value === 'number' && value > 25569 && value < 50000) {
            const date = new Date((value - 25569) * 86400 * 1000);
            newRow[key] = date.toISOString().split('T')[0];
          }
        });
        return newRow;
      });
      
      setCsvData(data);
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
      'nom': ['nom', 'name', 'designation', 'libelle', 'intitule', 'equipement'],
      'code_unique': ['code_unique', 'code', 'reference', 'ref', 'numero', 'id', 'identifiant'],
      'categorie_nom': ['categorie', 'category', 'type', 'famille', 'groupe', 'categorie_nom'],
      'etat': ['etat', 'statut', 'status', 'condition', 'state'],
      'emplacement': ['emplacement', 'location', 'localisation', 'lieu', 'position', 'stockage'],
      'quantite': ['quantite', 'qty', 'quantity', 'nombre', 'stock', 'qte'],
      'quantite_minimum': ['quantite_minimum', 'stock_min', 'seuil', 'min', 'alerte'],
      'vehicule': ['vehicule', 'vehicle', 'camion', 'auto', 'engin'],
      'employe': ['employe', 'employee', 'pompier', 'utilisateur', 'user', 'assigne', 'assigned'],
      'date_acquisition': ['date_acquisition', 'acquisition', 'achat', 'purchase', 'date_achat'],
      'date_fin_vie': ['date_fin_vie', 'fin_vie', 'expiration', 'peremption'],
      'date_prochaine_maintenance': ['date_maintenance', 'maintenance', 'entretien', 'prochain_entretien'],
      'valeur_achat': ['valeur_achat', 'prix', 'cout', 'cost', 'price', 'valeur', 'montant'],
      'notes': ['notes', 'note', 'remarque', 'commentaire', 'comment', 'description', 'obs']
    };
    
    availableFields.forEach(field => {
      const rules = mappingRules[field.key] || [field.key];
      
      for (let i = 0; i < normalizedHeaders.length; i++) {
        const header = normalizedHeaders[i];
        if (rules.some(rule => header.includes(rule) || rule.includes(header))) {
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
    const preview = csvData.slice(0, 5).map(row => {
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

    const mappedData = csvData.map(row => {
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
      const response = await apiPost(tenantSlug, '/equipements/import-csv', { equipements: mappedData });

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
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setDefaultValues({});
    setPreviewData([]);
    setImportResults(null);
    setStep(1);
    setFileType(null);
  };

  const downloadTemplate = () => {
    const headers = availableFields.map(f => f.key).join(',');
    const example1 = 'Tuyau 2.5" - 50ft,TUY-001,Tuyaux,bon,Caserne A,5,2,Camion Pompe 1,,2024-01-15,,,1200,En bon état';
    const example2 = 'Radio portable Motorola,RAD-101,Radios portatives,bon,Bureau,1,0,,Jean Tremblay,2023-06-20,,,850,';
    const csv = headers + '\n' + example1 + '\n' + example2;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_equipements.csv';
    link.click();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>📥 Import - Équipements (Matériel)</CardTitle>
        <CardDescription>
          Importez en masse vos équipements depuis un fichier CSV, Excel ou TXT
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Étape 1: Upload fichier */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="file-upload-equip" className="cursor-pointer flex-1">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {csvFile ? csvFile.name : 'Cliquez pour sélectionner un fichier'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>CSV, XLS, XLSX, TXT</strong> acceptés
                  </p>
                </div>
                <input 
                  id="file-upload-equip"
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
          </div>
        )}

        {/* Étape 2: Mapping des colonnes */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-semibold text-lg">Mapping des colonnes</h3>
                <p className="text-sm text-gray-600">
                  {csvData.length} lignes détectées - Associez vos colonnes aux champs
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
                ⚠️ La valeur par défaut écrase les données du CSV si les deux sont renseignés.
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
              <div>Colonne CSV</div>
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
                  
                  {/* Sélecteur de colonne CSV */}
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
                      {csvHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Valeur par défaut */}
                  <div>
                    {field.key === 'categorie_nom' && categories.length > 0 ? (
                      <select
                        className="w-full p-2 border rounded-md text-sm"
                        value={defaultValues[field.key] || ''}
                        onChange={(e) => handleDefaultValue(field.key, e.target.value)}
                      >
                        <option value="">-- Défaut --</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.nom}>{cat.nom}</option>
                        ))}
                      </select>
                    ) : field.key === 'etat' ? (
                      <select
                        className="w-full p-2 border rounded-md text-sm"
                        value={defaultValues[field.key] || ''}
                        onChange={(e) => handleDefaultValue(field.key, e.target.value)}
                      >
                        <option value="">-- Défaut --</option>
                        <option value="neuf">Neuf</option>
                        <option value="bon">Bon</option>
                        <option value="a_reparer">À réparer</option>
                        <option value="en_reparation">En réparation</option>
                        <option value="hors_service">Hors service</option>
                      </select>
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
                        ✓ {defaultValues[field.key]} <small style={{ opacity: 0.7 }}>(toutes les lignes)</small>
                      </span>
                    ) : columnMapping[field.key] && csvData[0] ? (
                      <span style={{ 
                        display: 'inline-block',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundColor: '#f0fdf4',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: '#166534'
                      }}>
                        {csvData[0][columnMapping[field.key]] || <em style={{ color: '#9ca3af' }}>(vide)</em>}
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
                Aperçu des données mappées ({csvData.length} équipements)
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Vérifiez les 5 premières lignes avant d'importer
              </p>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '400px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table style={{ width: 'max-content', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
                    {availableFields.slice(0, 8).map(field => (
                      <th key={field.key} style={{ 
                        padding: '10px', 
                        textAlign: 'left', 
                        fontSize: '10px', 
                        fontWeight: '600', 
                        color: '#6b7280', 
                        textTransform: 'uppercase', 
                        borderBottom: '1px solid #e5e7eb',
                        whiteSpace: 'nowrap'
                      }}>
                        {field.label.split('(')[0].trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      {availableFields.slice(0, 8).map(field => (
                        <td key={field.key} style={{ 
                          padding: '10px', 
                          fontSize: '13px',
                          maxWidth: '150px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {row[field.key] || <span style={{ color: '#9ca3af' }}>-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                ← Retour au mapping
              </Button>
              <Button 
                onClick={handleImport}
                disabled={importing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {importing ? 'Import en cours...' : `✓ Importer ${csvData.length} équipement(s)`}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 4: Résultats */}
        {step === 4 && importResults && (
          <div className="space-y-4">
            <div className={`border rounded-lg p-4 ${
              importResults.errors?.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
            }`}>
              <h3 className={`font-semibold mb-2 flex items-center gap-2 ${
                importResults.errors?.length > 0 ? 'text-yellow-900' : 'text-green-900'
              }`}>
                {importResults.errors?.length > 0 ? (
                  <AlertCircle className="h-5 w-5" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                Import terminé
              </h3>
              <ul className="text-sm space-y-1">
                <li className="text-green-800">✓ {importResults.created || 0} équipement(s) créé(s)</li>
                <li className="text-blue-800">↻ {importResults.updated || 0} équipement(s) mis à jour</li>
                {importResults.errors?.length > 0 && (
                  <li className="text-red-600">✗ {importResults.errors.length} erreur(s)</li>
                )}
              </ul>
            </div>

            {importResults.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Erreurs détaillées
                </h4>
                <ul className="text-sm text-red-800 space-y-1">
                  {importResults.errors.map((err, idx) => (
                    <li key={idx}>Ligne {err.ligne}: {err.erreur}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button onClick={resetImport} className="w-full">
              Nouvel import
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportCSVEquipements;
