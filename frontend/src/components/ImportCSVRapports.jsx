import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Upload, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';

const ImportCSVRapports = ({ tenantSlug, onImportComplete }) => {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [duplicateActions, setDuplicateActions] = useState({});

  const availableFields = [
    { key: 'type', label: 'Type (budget/depense)', required: true },
    { key: 'date', label: 'Date', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'categorie', label: 'Catégorie', required: false },
    { key: 'montant', label: 'Montant', required: true },
    { key: 'notes', label: 'Notes', required: false }
  ];

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Seuls les fichiers CSV sont acceptés');
      return;
    }

    setCsvFile(file);
    parseCSV(file);
  };

  const parseCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('Le fichier CSV doit contenir au moins une ligne d\'en-tête et une ligne de données');
        return;
      }

      // Parse headers
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      setCsvHeaders(headers);

      // Parse data
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      setCsvData(data);
      setStep(2); // Move to mapping step
    } catch (error) {
      console.error('Erreur lors du parsing CSV:', error);
      alert('Erreur lors de la lecture du fichier CSV');
    }
  };

  const handleMappingChange = (csvColumn, fieldKey) => {
    setColumnMapping(prev => ({
      ...prev,
      [csvColumn]: fieldKey
    }));
  };

  const handlePreview = () => {
    const mapped = csvData.map((row, index) => {
      const mappedRow = {};
      Object.entries(columnMapping).forEach(([csvCol, fieldKey]) => {
        if (fieldKey && fieldKey !== 'ignore') {
          mappedRow[fieldKey] = row[csvCol];
        }
      });
      return mappedRow;
    });

    setPreviewData(mapped);
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const token = localStorage.getItem('token');
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

      const response = await fetch(
        `${BACKEND_URL}/api/${tenantSlug}/rapports/import-csv`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            items: previewData.map((item, index) => ({
              ...item,
              action_doublon: duplicateActions[index] || 'skip'
            }))
          })
        }
      );

      if (!response.ok) {
        throw new Error('Erreur lors de l\'importation');
      }

      const results = await response.json();
      setImportResults(results);
      setStep(4);
      
      if (onImportComplete) {
        onImportComplete(results);
      }
    } catch (error) {
      console.error('Erreur lors de l\'importation:', error);
      alert('Erreur lors de l\'importation: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setPreviewData([]);
    setImportResults(null);
    setDuplicateActions({});
  };

  const downloadTemplate = () => {
    const headers = availableFields.map(f => f.label).join(',');
    const example = 'budget,2025-01-15,Budget annuel équipement,Équipement,50000,Budget principal\ndepense,2025-02-20,Achat casques,EPI,2500,Commande urgente';
    const csvContent = headers + '\n' + example;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_rapports.csv';
    link.click();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Import CSV - Rapports (Budgets/Dépenses)</CardTitle>
        <CardDescription>
          Importez des budgets et dépenses en masse depuis un fichier CSV
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger template CSV
              </Button>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <Label
                htmlFor="csv-upload"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-12 w-12 text-gray-400" />
                <span className="text-sm font-medium">
                  Cliquez pour sélectionner un fichier CSV
                </span>
                <span className="text-xs text-gray-500">
                  ou glissez-déposez un fichier ici
                </span>
              </Label>
            </div>

            {csvFile && (
              <div className="bg-blue-50 p-4 rounded-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-500" />
                <span className="text-sm">Fichier chargé: {csvFile.name}</span>
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <p className="text-sm font-medium">Conseils:</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Utilisez un fichier CSV avec des colonnes séparées par des virgules</li>
                <li>• La première ligne doit contenir les en-têtes de colonnes</li>
                <li>• Le champ Type doit contenir "budget" ou "depense"</li>
                <li>• Le champ Date au format YYYY-MM-DD est recommandé</li>
                <li>• Les champs Montant doivent être numériques</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Étape 2: Mapper les colonnes</h3>
              <span className="text-sm text-gray-500">
                {csvData.length} lignes détectées
              </span>
            </div>

            <div className="space-y-3">
              {csvHeaders.map(header => (
                <div key={header} className="flex items-center gap-4">
                  <Label className="w-1/3 text-sm">{header}</Label>
                  <select
                    className="flex-1 border rounded-md p-2 text-sm"
                    value={columnMapping[header] || ''}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                  >
                    <option value="">-- Ignorer --</option>
                    {availableFields.map(field => (
                      <option key={field.key} value={field.key}>
                        {field.label} {field.required ? '*' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Annuler
              </Button>
              <Button onClick={handlePreview}>
                Prévisualiser
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Étape 3: Prévisualisation</h3>
              <span className="text-sm text-gray-500">
                {previewData.length} éléments à importer
              </span>
            </div>

            <div className="max-h-96 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {availableFields.map(field => (
                      <th key={field.key} className="px-4 py-2 text-left font-medium">
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.slice(0, 5).map((row, index) => (
                    <tr key={index} className="border-t">
                      {availableFields.map(field => (
                        <td key={field.key} className="px-4 py-2">
                          {row[field.key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewData.length > 5 && (
              <p className="text-xs text-gray-500 text-center">
                ... et {previewData.length - 5} autres éléments
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Retour
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? 'Import en cours...' : 'Importer'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {step === 4 && importResults && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Résultats de l'importation</h3>

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">
                        {importResults.created_budgets + importResults.created_depenses}
                      </p>
                      <p className="text-sm text-gray-600">Créés</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold">
                        {importResults.duplicates?.length || 0}
                      </p>
                      <p className="text-sm text-gray-600">Doublons</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-2xl font-bold">
                        {importResults.errors?.length || 0}
                      </p>
                      <p className="text-sm text-gray-600">Erreurs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {importResults.errors && importResults.errors.length > 0 && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-700">Erreurs</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {importResults.errors.slice(0, 5).map((error, index) => (
                      <li key={index} className="text-sm text-red-600">
                        Ligne {error.line}: {error.error}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Button onClick={handleReset}>
              Nouvelle importation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportCSVRapports;
