import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getTenantToken } from '../utils/api';

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
    { key: 'employe', label: 'Employé (nom ou liste de noms séparés par virgules)', required: true },
    { key: 'quart', label: 'Quart/Type de garde', required: false },
    { key: 'caserne', label: 'Caserne (optionnel)', required: false },
    { key: 'debut', label: 'Date/Heure début (YYYY-MM-DD HH:MM)', required: true },
    { key: 'fin', label: 'Date/Heure fin (YYYY-MM-DD HH:MM)', required: true },
    { key: 'selection', label: 'Sélection (Disponible par défaut)', required: false }
  ];

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    
    // Vérifier l'extension
    const isCSV = fileName.endsWith('.csv');
    const isXLS = fileName.endsWith('.xls');
    const isXLSX = fileName.endsWith('.xlsx');
    
    if (!isCSV && !isXLS && !isXLSX) {
      alert('Seuls les fichiers CSV, XLS et XLSX sont acceptés.\n\nVotre fichier: ' + file.name);
      return;
    }
    
    setCsvFile(file);
    
    if (isCSV) {
      parseCSV(file);
    } else {
      // Pour XLS et XLSX
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
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const arrayBuffer = new Uint8Array(e.target.result);
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          
          // Prendre la première feuille
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Convertir en JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
          
          if (jsonData.length < 2) {
            throw new Error("Le fichier doit contenir au moins un en-tête et une ligne");
          }
          
          // Extraire les headers
          const headers = jsonData[0].map(h => String(h).trim());
          setCsvHeaders(headers);
          
          // Extraire les données
          const parsedData = jsonData.slice(1)
            .filter(row => row.some(cell => cell !== '')) // Ignorer les lignes vides
            .map((row, index) => {
              const rowData = { _index: index };
              headers.forEach((header, i) => {
                // Gérer les dates Excel
                let value = row[i];
                if (value !== undefined && value !== null) {
                  // Si c'est un nombre et qu'il ressemble à une date Excel
                  if (typeof value === 'number' && value > 40000 && value < 60000) {
                    // Convertir le nombre Excel en date
                    const excelDate = XLSX.SSF.parse_date_code(value);
                    value = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')} ${String(excelDate.H || 0).padStart(2, '0')}:${String(excelDate.M || 0).padStart(2, '0')}`;
                  }
                }
                rowData[header] = String(value || '').trim();
              });
              return rowData;
            });
          
          setCsvData(parsedData);
          
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
          console.error('Erreur parse Excel:', error);
          alert('Erreur lors de l\'analyse du fichier Excel: ' + error.message);
        }
      };
      
      reader.onerror = () => {
        alert('Erreur lors de la lecture du fichier');
      };
      
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error('Erreur parse Excel:', error);
      alert('Erreur lors de la lecture du fichier Excel: ' + error.message);
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
      // Mapper toutes les données et exploser les lignes avec plusieurs employés
      const disponibilitesExploded = [];
      
      csvData.forEach(row => {
        const mapped = {};
        availableFields.forEach(field => {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        });
        
        // Détecter si la colonne employé contient plusieurs noms séparés par des virgules
        const employeValue = mapped.employe || '';
        
        if (employeValue.includes(',')) {
          // Exploser la ligne : créer une disponibilité pour chaque employé
          const employes = employeValue.split(',').map(nom => nom.trim()).filter(nom => nom);
          
          employes.forEach(nom => {
            disponibilitesExploded.push({
              ...mapped,
              employe: nom,
              // Mettre "Disponible" par défaut si le champ sélection est vide
              selection: mapped.selection || 'Disponible'
            });
          });
        } else {
          // Un seul employé, ajouter tel quel
          disponibilitesExploded.push({
            ...mapped,
            // Mettre "Disponible" par défaut si le champ sélection est vide
            selection: mapped.selection || 'Disponible'
          });
        }
      });
      
      console.log(`📊 Import : ${csvData.length} lignes → ${disponibilitesExploded.length} disponibilités (après explosion)`);
      
      // Envoyer au backend
      const token = getTenantToken();
      if (!token) {
        throw new Error('Vous devez être connecté pour importer des disponibilités');
      }
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/disponibilites/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ disponibilites: disponibilitesExploded })
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
    <Card className="w-full" style={{ overflow: 'visible' }}>
      <CardHeader>
        <CardTitle>Import Disponibilités</CardTitle>
        <CardDescription>
          Importez en masse les disponibilités de votre personnel
        </CardDescription>
      </CardHeader>
      <CardContent style={{ padding: step === 3 ? '0' : undefined, overflow: 'visible' }}>
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
              <div className="space-y-4">
                <Label htmlFor="csv-upload-disponibilites" className="cursor-pointer block">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Cliquez pour sélectionner un fichier
                  </span>
                </Label>
                <Input
                  id="csv-upload-disponibilites"
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <p className="text-sm text-gray-500">Formats acceptés: CSV, XLS, XLSX</p>
                <p className="text-xs text-gray-400">Si votre fichier XLS ne s'ouvre pas, essayez de le sauvegarder en XLSX depuis Excel</p>
              </div>
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
          <div className="space-y-4" style={{ width: '100%', minWidth: 0, padding: '24px' }}>
            <div>
              <h3 className="font-semibold mb-2">Étape 3: Aperçu des données</h3>
              <p className="text-sm text-gray-600 mb-4">
                Vérifiez que les données sont correctement mappées (affichage des 5 premières lignes)
              </p>
            </div>
            
            <div 
              style={{ 
                width: '100%',
                overflowX: 'scroll',
                overflowY: 'auto',
                maxHeight: '400px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <table 
                style={{ 
                  width: 'max-content',
                  borderCollapse: 'collapse',
                  tableLayout: 'auto'
                }}
              >
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#f9fafb' }}>
                  <tr>
                    {availableFields.map(field => (
                      <th 
                        key={field.key}
                        style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontSize: '11px',
                          fontWeight: '600',
                          color: '#6b7280',
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                          minWidth: '150px',
                          borderBottom: '1px solid #e5e7eb',
                          backgroundColor: '#f9fafb'
                        }}
                      >
                        {field.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, idx) => (
                    <tr 
                      key={idx}
                      style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}
                    >
                      {availableFields.map(field => (
                        <td 
                          key={field.key}
                          style={{
                            padding: '12px',
                            fontSize: '14px',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            minWidth: '150px',
                            borderBottom: '1px solid #f3f4f6'
                          }}
                        >
                          {row[field.key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ 
              marginTop: '12px', 
              padding: '8px 12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#1e40af'
            }}>
              💡 <strong>Astuce :</strong> Utilisez la barre de défilement horizontale ci-dessus pour voir toutes les colonnes (6 colonnes au total)
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
            
            <div className="grid grid-cols-4 gap-4">
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
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-gray-600 mb-2" />
                <div className="text-2xl font-bold text-gray-900">{importResults.skipped || 0}</div>
                <div className="text-sm text-gray-700">Ignorées</div>
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
                {importResults.skipped > 0 && (
                  <span className="block mt-1 text-gray-600">
                    ℹ️ {importResults.skipped} lignes ignorées (Sélection = "Aucune")
                  </span>
                )}
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
