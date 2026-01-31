import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { apiGet, apiPost } from '../utils/api';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const ImportCSVEPI = ({ tenantSlug, onImportComplete }) => {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({});
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [duplicateActions, setDuplicateActions] = useState({});
  const [fileType, setFileType] = useState(null);
  const [availableFields, setAvailableFields] = useState([
    { key: 'numero_serie', label: 'Numéro de série interne (optionnel)', required: false },
    { key: 'type_epi', label: 'Type d\'EPI', required: true },
    { key: 'marque', label: 'Marque', required: true },
    { key: 'modele', label: 'Modèle', required: true },
    { key: 'numero_serie_fabricant', label: 'N° série fabricant', required: false },
    { key: 'date_fabrication', label: 'Date fabrication (YYYY-MM-DD)', required: false },
    { key: 'date_mise_en_service', label: 'Date mise en service (YYYY-MM-DD)', required: true },
    { key: 'norme_certification', label: 'Norme certification', required: false },
    { key: 'cout_achat', label: 'Coût d\'achat', required: false },
    { key: 'couleur', label: 'Couleur', required: false },
    { key: 'taille', label: 'Taille', required: false },
    { key: 'user_id', label: 'Assigné à (ID utilisateur)', required: false },
    { key: 'statut', label: 'Statut', required: true },
    { key: 'notes', label: 'Notes', required: false }
  ]);

  // Charger les champs configurés dynamiquement
  React.useEffect(() => {
    loadFieldsConfiguration();
  }, [tenantSlug]);

  const loadFieldsConfiguration = async () => {
    try {
      const data = await apiGet(tenantSlug, '/config/import-settings');
      if (data.epi_fields && data.epi_fields.length > 0) {
        setAvailableFields(data.epi_fields);
      }
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration:', error);
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

        // Filtrer les lignes vides
        const rows = results.data.filter(row => Object.values(row).some(val => val && val.toString().trim() !== ''));
        
        if (rows.length === 0) {
          alert("Le fichier ne contient pas de données valides");
          return;
        }

        // Récupérer les headers depuis le meta de Papa
        const headers = results.meta.fields || Object.keys(rows[0]);
        setCsvHeaders(headers);

        // Transformer les données pour avoir un index
        const data = rows.map((row, index) => ({ ...row, _index: index }));
        setCsvData(data);
        
        // Auto-mapping des colonnes
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
      
      // Convertir en JSON avec headers
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      
      if (jsonData.length === 0) {
        alert("Le fichier ne contient pas de données");
        return;
      }

      // Récupérer les headers
      const headers = Object.keys(jsonData[0]);
      setCsvHeaders(headers);
      
      // Convertir les dates Excel si nécessaire et ajouter l'index
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

  // Mapping automatique intelligent des colonnes
  const autoMapColumns = (headers) => {
    const mapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    
    const mappingRules = {
      'numero_serie': ['numero_serie', 'num_serie', 'no_serie', 'numero serie', 'n° serie', 'serie'],
      'type_epi': ['type_epi', 'type', 'type epi', 'categorie', 'category'],
      'marque': ['marque', 'brand', 'fabricant', 'manufacturer'],
      'modele': ['modele', 'model', 'reference', 'ref'],
      'numero_serie_fabricant': ['numero_serie_fabricant', 'num_serie_fab', 'serial', 'serial_number', 'n° fabricant'],
      'date_fabrication': ['date_fabrication', 'date_fab', 'fabrication', 'manufacturing_date', 'date fab'],
      'date_mise_en_service': ['date_mise_en_service', 'date_service', 'mise_service', 'in_service', 'date service'],
      'norme_certification': ['norme', 'certification', 'norme_certification', 'standard'],
      'cout_achat': ['cout', 'cout_achat', 'prix', 'price', 'cost', 'montant'],
      'couleur': ['couleur', 'color', 'colour'],
      'taille': ['taille', 'size', 'grandeur'],
      'user_id': ['user_id', 'utilisateur', 'assigne', 'assigned', 'employe', 'pompier'],
      'statut': ['statut', 'status', 'etat', 'state', 'condition'],
      'notes': ['notes', 'note', 'commentaire', 'comment', 'remarque', 'description']
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

  const handleColumnMapping = (csvColumn, fieldKey) => {
    setColumnMapping(prev => ({
      ...prev,
      [fieldKey]: csvColumn
    }));
  };

  // NOUVEAU: Gestion des valeurs par défaut
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
        // Priorité 1: Valeur par défaut (écrase tout)
        if (defaultValues[field.key]) {
          mapped[field.key] = defaultValues[field.key];
        } 
        // Priorité 2: Valeur du CSV
        else {
          const csvColumn = columnMapping[field.key];
          mapped[field.key] = csvColumn ? row[csvColumn] : '';
        }
      });
      return mapped;
    });
    setPreviewData(preview);
    setStep(3);
  };

  const validateMapping = () => {
    // Plus de validation stricte - on permet l'import même avec des champs manquants
    // Les champs non mappés auront des valeurs par défaut ou null
    return true;
  };

  const handleImport = async () => {
    if (!validateMapping()) return;

    setImporting(true);
    setStep(4);

    // Mapper les données avec le bon format pour l'API
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
      
      // Mapping spécifique pour l'assignation employé
      // L'API attend "employe_nom" pour le matching intelligent
      if (mapped.user_id) {
        mapped.employe_nom = mapped.user_id;  // Le champ user_id contient le nom de l'employé
      }
      
      // Mapper numero_serie à partir du bon champ
      if (!mapped.numero_serie && mapped.numero_serie_fabricant) {
        mapped.numero_serie = mapped.numero_serie_fabricant;
      }
      
      return mapped;
    });

    try {
      // Utiliser apiPost qui gère correctement l'URL et le token
      const result = await apiPost(tenantSlug, '/epi/import-csv', {
        epis: mappedData
      });

      const result = await response.json();
      
      // Formater les résultats pour l'affichage
      if (response.ok) {
        setImportResults({
          success: true,
          imported_count: result.created || 0,
          updated_count: result.updated || 0,
          skipped_count: (result.duplicates?.length || 0) + (result.errors?.length || 0),
          errors: result.errors || [],
          fuzzy_matches: result.fuzzy_matches || [],
          duplicates: result.duplicates || []
        });
      } else {
        setImportResults({
          success: false,
          message: result.detail || 'Erreur lors de l\'import',
          errors: result.errors || []
        });
      }
      
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      setImportResults({
        success: false,
        message: 'Erreur lors de l\'import: ' + error.message,
        errors: [error.message]
      });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMapping({});
    setDefaultValues({});
    setPreviewData([]);
    setImportResults(null);
    setFileType(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📥 Import - Équipements EPI</CardTitle>
        <CardDescription>
          Étape {step}/4 • Formats acceptés: CSV, XLS, XLSX, TXT
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="import-step">
            <div className="step-header">
              <h3>📁 Étape 1: Sélectionner le fichier</h3>
              <p>Choisissez votre fichier contenant les EPI</p>
            </div>

            <div className="file-upload-area">
              <Input
                id="csv-upload"
                type="file"
                accept=".csv,.CSV,.xls,.XLS,.xlsx,.XLSX,.txt,.TXT"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Label htmlFor="csv-upload" className="file-upload-label" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3rem',
                border: '2px dashed #cbd5e1',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                <Upload size={48} style={{ marginBottom: '1rem', color: '#64748b' }} />
                <div style={{ textAlign: 'center' }}>
                  <strong>Cliquer pour sélectionner</strong> ou glisser votre fichier ici
                  <br />
                  <small style={{ color: '#64748b' }}>Formats acceptés: <strong>.csv, .xls, .xlsx, .txt</strong></small>
                </div>
              </Label>
            </div>
            
            {/* Info sur le mapping intelligent */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🧠</span>
                <div>
                  <strong style={{ color: '#166534' }}>Mapping intelligent</strong>
                  <p style={{ fontSize: '0.875rem', color: '#15803d', margin: '0.25rem 0 0 0' }}>
                    Le système détecte automatiquement les colonnes de votre fichier et les associe aux champs correspondants.
                    Vous pourrez ajuster le mapping manuellement si nécessaire.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="import-step">
            <div className="step-header">
              <h3>🔗 Étape 2: Correspondance des colonnes</h3>
              <p>Associez les colonnes de votre fichier aux champs du système</p>
            </div>

            <div className="mapping-container">
              <div className="mapping-header" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                padding: '0.75rem',
                backgroundColor: '#f1f5f9',
                borderRadius: '0.5rem'
              }}>
                <div className="file-info">
                  {fileType === 'xlsx' || fileType === 'xls' ? '📊' : '📄'} <strong>{csvFile?.name}</strong> - {csvData.length} ligne(s), {csvHeaders.length} colonne(s)
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                    {fileType?.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="mapping-info-box" style={{
                padding: '1rem',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.875rem'
              }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  💡 <strong>Astuce:</strong> Utilisez la colonne "Valeur par défaut" pour appliquer une même valeur à toutes les lignes importées.
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  ⚠️ La valeur par défaut écrase toujours les données du CSV si les deux sont renseignés.
                </p>
              </div>

              <div className="mapping-table" style={{ overflowX: 'auto' }}>
                <div className="mapping-row header" style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 50px 2fr 2fr 2fr',
                  gap: '0.5rem',
                  padding: '0.75rem',
                  backgroundColor: '#f8fafc',
                  fontWeight: '600',
                  borderBottom: '2px solid #e2e8f0',
                  fontSize: '0.875rem'
                }}>
                  <div>Champ système</div>
                  <div style={{ textAlign: 'center' }}>➡️</div>
                  <div>Colonne CSV</div>
                  <div>💾 Valeur par défaut</div>
                  <div>Aperçu données</div>
                </div>

                {availableFields.map(field => (
                  <div key={field.key} className="mapping-row" style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 50px 2fr 2fr 2fr',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    borderBottom: '1px solid #e2e8f0',
                    alignItems: 'center'
                  }}>
                    <div className="field-column">
                      <span style={{
                        fontWeight: '500',
                        color: '#475569'
                      }}>
                        {field.label}
                      </span>
                    </div>
                    <div style={{ textAlign: 'center' }}>➡️</div>
                    <div className="csv-column">
                      <select
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => handleColumnMapping(e.target.value, field.key)}
                        disabled={!!defaultValues[field.key]}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          backgroundColor: defaultValues[field.key] ? '#f1f5f9' : 'white'
                        }}
                      >
                        <option value="">-- Sélectionner --</option>
                        {csvHeaders.map(header => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                    <div className="default-value-column">
                      <input
                        type="text"
                        value={defaultValues[field.key] || ''}
                        onChange={(e) => handleDefaultValue(field.key, e.target.value)}
                        placeholder="Ex: Bon"
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #cbd5e1',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                    <div className="preview-column" style={{
                      fontSize: '0.875rem',
                      color: '#64748b'
                    }}>
                      {defaultValues[field.key] ? (
                        <span style={{ fontWeight: '600', color: '#059669' }}>
                          {defaultValues[field.key]} <small>(toutes)</small>
                        </span>
                      ) : columnMapping[field.key] && csvData[0] ? (
                        <span>
                          {csvData[0][columnMapping[field.key]] || '(vide)'}
                        </span>
                      ) : (
                        <span>-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mapping-actions" style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1.5rem'
              }}>
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Retour
                </Button>
                <Button onClick={generatePreview}>
                  Aperçu données →
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="import-step">
            <div className="step-header">
              <h3>👀 Étape 3: Aperçu des données</h3>
              <p>Vérifiez que les données sont correctement mappées</p>
            </div>

            <div className="preview-container">
              <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f1f5f9', borderRadius: '0.5rem' }}>
                📋 Aperçu des <strong>5 premières lignes</strong> sur {csvData.length} total
              </div>

              <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', position: 'sticky', left: 0, backgroundColor: '#f8fafc', zIndex: 1 }}>#</th>
                      {availableFields.map(field => (
                        <th key={field.key} style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          {field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '0.75rem', color: '#64748b', position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 1 }}>{index + 1}</td>
                        {availableFields.map(field => (
                          <td key={field.key} style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                            {row[field.key] ? (
                              <span style={{ color: defaultValues[field.key] ? '#059669' : '#0f172a' }}>
                                {row[field.key]}
                              </span>
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>(vide)</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', position: 'sticky', bottom: 0, backgroundColor: 'white', padding: '1rem 0', borderTop: '1px solid #e2e8f0', zIndex: 10 }}>
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Modifier mapping
                </Button>
                <Button onClick={handleImport}>
                  Lancer l'import →
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="import-step">
            <div className="step-header">
              <h3>⚙️ Import en cours...</h3>
            </div>

            {importing ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                <p>Import en cours, veuillez patienter...</p>
              </div>
            ) : importResults ? (
              <div>
                {importResults.success ? (
                  <div>
                    <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#f0fdf4', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                      <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
                      <h3>Import terminé !</h3>
                      <p style={{ fontSize: '1.1rem' }}>
                        <strong>{importResults.imported_count}</strong> EPI(s) créé(s)
                        {importResults.updated_count > 0 && (
                          <span> • <strong>{importResults.updated_count}</strong> mis à jour</span>
                        )}
                      </p>
                    </div>
                    
                    {/* Affichage des matchs fuzzy (approximatifs) */}
                    {importResults.fuzzy_matches && importResults.fuzzy_matches.length > 0 && (
                      <div style={{ 
                        padding: '1rem', 
                        backgroundColor: '#fffbeb', 
                        border: '1px solid #fbbf24',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem'
                      }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertCircle size={20} />
                          Correspondances approximatives ({importResults.fuzzy_matches.length})
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: '0.75rem' }}>
                          Ces employés ont été associés automatiquement mais vérifiez les correspondances :
                        </p>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {importResults.fuzzy_matches.map((match, idx) => (
                            <div key={idx} style={{ 
                              padding: '0.5rem', 
                              backgroundColor: 'white', 
                              borderRadius: '4px',
                              marginBottom: '0.5rem',
                              fontSize: '0.85rem',
                              border: '1px solid #fcd34d'
                            }}>
                              <strong>Ligne {match.line}:</strong> "{match.searched}" → <strong>{match.found}</strong>
                              <span style={{ 
                                marginLeft: '0.5rem', 
                                padding: '2px 6px', 
                                backgroundColor: match.confidence >= 80 ? '#d1fae5' : '#fef3c7',
                                borderRadius: '4px',
                                fontSize: '0.75rem'
                              }}>
                                {match.confidence}% de confiance
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Affichage des erreurs */}
                    {importResults.errors && importResults.errors.length > 0 && (
                      <div style={{ 
                        padding: '1rem', 
                        backgroundColor: '#fef2f2', 
                        border: '1px solid #fca5a5',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem'
                      }}>
                        <h4 style={{ margin: '0 0 0.75rem 0', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <XCircle size={20} />
                          Erreurs ({importResults.errors.length} ligne(s) ignorée(s))
                        </h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {importResults.errors.map((err, idx) => (
                            <div key={idx} style={{ 
                              padding: '0.5rem', 
                              backgroundColor: 'white', 
                              borderRadius: '4px',
                              marginBottom: '0.5rem',
                              fontSize: '0.85rem',
                              border: '1px solid #fecaca'
                            }}>
                              <strong>Ligne {err.line || idx + 1}:</strong> {err.error || err}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Affichage des doublons */}
                    {importResults.duplicates && importResults.duplicates.length > 0 && (
                      <div style={{ 
                        padding: '1rem', 
                        backgroundColor: '#f0f9ff', 
                        border: '1px solid #7dd3fc',
                        borderRadius: '0.5rem',
                        marginBottom: '1rem'
                      }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>
                          ℹ️ Doublons détectés ({importResults.duplicates.length})
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#0369a1' }}>
                          Ces numéros de série existaient déjà et ont été ignorés.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#fef2f2', borderRadius: '0.5rem' }}>
                    <XCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
                    <h3>Erreur lors de l'import</h3>
                    <p>{importResults.message}</p>
                    
                    {importResults.errors && importResults.errors.length > 0 && (
                      <div style={{ marginTop: '1rem', textAlign: 'left', maxHeight: '200px', overflowY: 'auto' }}>
                        {importResults.errors.map((err, idx) => (
                          <div key={idx} style={{ 
                            padding: '0.5rem', 
                            backgroundColor: 'white', 
                            borderRadius: '4px',
                            marginBottom: '0.5rem',
                            fontSize: '0.85rem',
                            border: '1px solid #fecaca'
                          }}>
                            {typeof err === 'string' ? err : `Ligne ${err.line}: ${err.error}`}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <Button onClick={reset}>
                    Nouvel import
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ImportCSVEPI;
