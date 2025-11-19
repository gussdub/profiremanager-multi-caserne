import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

const ImportCSVDisponibilites = ({ tenantSlug, onImportComplete }) => {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  
  const availableFields = [
    { key: 'Employé', label: 'Employé (nom avec numéro)', required: true },
    { key: 'Quart', label: 'Quart/Type de garde', required: false },
    { key: 'Caserne', label: 'Caserne', required: false },
    { key: 'Début', label: 'Date/Heure début (YYYY-MM-DD HH:MM)', required: true },
    { key: 'Fin', label: 'Date/Heure fin (YYYY-MM-DD HH:MM)', required: true },
    { key: 'Sélection', label: 'Sélection (Disponible/Aucune)', required: true }
  ];

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
      alert('Seuls les fichiers CSV, XLS et XLSX sont acceptés');
      return;
    }
    
    setCsvFile(file);
    
    if (fileName.endsWith('.csv')) {
      parseCSV(file);
    } else {
      parseExcel(file);
    }
  };

  const parseCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error("Le fichier doit contenir au moins un en-tête et une ligne");
      }
      
      // Parser les headers en gérant les guillemets
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      setCsvHeaders(headers);
      
      // Parser les données
      const data = lines.slice(1).map((line, index) => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());
        
        const row = { _index: index };
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });
      
      setCsvData(data);
      
      // Auto-mapping si les colonnes correspondent
      const autoMapping = {};
      availableFields.forEach(field => {
        const matchingHeader = headers.find(h => 
          h.toLowerCase() === field.key.toLowerCase() ||
          h.toLowerCase().includes(field.key.toLowerCase())
        );
        if (matchingHeader) {
          autoMapping[field.key] = matchingHeader;
        }
      });
      setColumnMapping(autoMapping);
      
      setStep(2);
    } catch (error) {
      console.error('Erreur parse CSV:', error);
      alert('Erreur d\'analyse du fichier CSV: ' + error.message);
    }
  };

  const parseExcel = async (file) => {
    try {
      // Pour Excel, on va utiliser FileReader pour lire les données binaires
      // puis les convertir en CSV côté backend
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);
        
        // On pourrait utiliser une bibliothèque comme xlsx ici
        // Mais pour simplifier, on demande à l'utilisateur d'exporter en CSV
        alert('Pour les fichiers Excel, veuillez d\'abord les sauvegarder en format CSV.\n\nDans Excel: Fichier > Enregistrer sous > Format: CSV');
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Erreur parse Excel:', error);
      alert('Erreur lors de la lecture du fichier Excel');
    }
  };

  const handleColumnMapping = (csvColumn, fieldKey) => {
    setColumnMapping(prev => ({ ...prev, [fieldKey]: csvColumn }));
  };

  const generatePreview = () => {
    const preview = csvData.slice(0, 5).map(row => {
      const mapped = {};
      availableFields.forEach(field => {
        const csvColumn = columnMapping[field.key];
        mapped[field.key] = csvColumn ? row[csvColumn] : '';
      });
      return mapped;
    });
    setPreviewData(preview);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    
    try {
      // Mapper toutes les données
      const disponibilites = csvData.map(row => {
        const mapped = {};
        availableFields.forEach(field => {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        });
        return mapped;
      });
      
      // Envoyer au backend
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/disponibilites/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ disponibilites })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erreur lors de l\'import');
      }
      
      const results = await response.json();
      setImportResults(results);
      setStep(4);
      
      if (onImportComplete) {
        onImportComplete(results);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      alert('Erreur lors de l\'import: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setStep(1);
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setPreviewData([]);
    setImportResults(null);
  };

  const downloadTemplate = () => {
    // Créer un CSV template
    const headers = 'Employé,Quart,Caserne,Début,Fin,Sélection\n';
    const example = 'Dupont Jean (101),jour 12h,Caserne Shefford,2025-12-01 06:00,2025-12-01 18:00,Disponible\n';
    const example2 = 'Tremblay Marie (102),matin,Caserne Shefford,2025-12-02 06:00,2025-12-02 18:00,Aucune\n';
    const csv = headers + example + example2;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_disponibilites.csv';
    link.click();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Import Disponibilités</CardTitle>
        <CardDescription>
          Importez en masse les disponibilités de votre personnel
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Étape 1: Upload fichier */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Étape 1: Télécharger votre fichier</h3>
                <p className="text-sm text-gray-600">Formats acceptés: CSV, XLS, XLSX</p>
              </div>
              <Button variant="outline" onClick={downloadTemplate} className="flex items-center gap-2">
                <Download size={16} />
                Télécharger le template
              </Button>
            </div>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <span className="text-blue-600 hover:text-blue-700 font-medium">
                  Cliquez pour sélectionner un fichier
                </span>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </Label>
              <p className="text-sm text-gray-500 mt-2">ou glissez-déposez votre fichier ici</p>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📋 Format attendu:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>Employé</strong>: Nom avec numéro (ex: "Dupont Jean (101)")</li>
                <li>• <strong>Quart</strong>: Type de garde (ex: "jour 12h", "matin", "apres midi")</li>
                <li>• <strong>Début</strong>: Date et heure (ex: "2025-12-01 06:00")</li>
                <li>• <strong>Fin</strong>: Date et heure (ex: "2025-12-01 18:00")</li>
                <li>• <strong>Sélection</strong>: "Disponible" ou "Aucune"</li>
              </ul>
            </div>
          </div>
        )}

        {/* Étape 2: Mapping colonnes */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Étape 2: Mapper les colonnes</h3>
              <p className="text-sm text-gray-600 mb-4">
                Associez les colonnes de votre fichier aux champs requis ({csvData.length} lignes détectées)
              </p>
            </div>
            
            <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-4">
              {availableFields.map(field => (
                <div key={field.key} className="flex items-center gap-4">
                  <Label className="w-1/3 font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <select
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => handleColumnMapping(e.target.value, field.key)}
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">-- Sélectionner une colonne --</option>
                    {csvHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetImport}>Annuler</Button>
              <Button 
                onClick={generatePreview}
                disabled={!columnMapping['Employé'] || !columnMapping['Début'] || !columnMapping['Fin']}
                className="flex-1"
              >
                Suivant: Aperçu
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3: Aperçu */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Étape 3: Aperçu des données</h3>
              <p className="text-sm text-gray-600 mb-4">
                Vérifiez que les données sont correctement mappées (affichage des 5 premières lignes)
              </p>
            </div>
            
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {availableFields.map(field => (
                      <th key={field.key} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.map((row, idx) => (
                    <tr key={idx}>
                      {availableFields.map(field => (
                        <td key={field.key} className="px-4 py-3 text-sm text-gray-900">
                          {row[field.key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Attention:</strong> Vous êtes sur le point d'importer {csvData.length} disponibilités.
                Les doublons seront mis à jour automatiquement.
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Retour</Button>
              <Button 
                onClick={handleImport}
                disabled={importing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {importing ? 'Import en cours...' : `Importer ${csvData.length} disponibilités`}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 4: Résultats */}
        {step === 4 && importResults && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Résultats de l'import</h3>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-green-600 mb-2" />
                <div className="text-2xl font-bold text-green-900">{importResults.created}</div>
                <div className="text-sm text-green-700">Créées</div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                <div className="text-2xl font-bold text-blue-900">{importResults.updated}</div>
                <div className="text-sm text-blue-700">Mises à jour</div>
              </div>
              
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <XCircle className="mx-auto h-8 w-8 text-red-600 mb-2" />
                <div className="text-2xl font-bold text-red-900">{importResults.errors?.length || 0}</div>
                <div className="text-sm text-red-700">Erreurs</div>
              </div>
            </div>
            
            {importResults.errors && importResults.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="font-semibold text-red-900 mb-2">Erreurs détectées:</h4>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {importResults.errors.map((error, idx) => (
                    <div key={idx} className="text-sm text-red-800">
                      <strong>Ligne {error.ligne}:</strong> {error.erreur}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                <strong>✅ Import terminé!</strong> {importResults.created + importResults.updated} disponibilités importées avec succès.
              </p>
            </div>
            
            <Button onClick={resetImport} className="w-full">
              Nouvel import
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportCSVDisponibilites;
