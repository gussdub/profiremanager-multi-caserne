import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { apiGet } from '../utils/api';

const ImportCSVEPI = ({ tenantSlug, onImportComplete }) => {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({}); // NOUVEAU: Valeurs par défaut
  const [previewData, setPreviewData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [duplicateActions, setDuplicateActions] = useState({});
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
      // Continuer avec les champs par défaut en cas d'erreur
    }
  };

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
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error("Le fichier doit contenir au moins un en-tête et une ligne de données");
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      setCsvHeaders(headers);

      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = { _index: index };
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });

      setCsvData(data);
      setStep(2);
      
    } catch (error) {
      console.error('Erreur parsing CSV:', error);
      alert('Erreur d\'analyse du fichier CSV');
    }
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
      const token = localStorage.getItem(`${tenantSlug}_token`);
      const response = await fetch(`/api/${tenantSlug}/epi/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          data: mappedData,
          custom_required_fields: availableFields.filter(f => f.required).map(f => f.key)
        })
      });

      const result = await response.json();
      setImportResults(result);
      
      if (onImportComplete) {
        onImportComplete(result);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      setImportResults({
        success: false,
        message: 'Erreur lors de l\'import',
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
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📥 Import CSV - Équipements EPI</CardTitle>
        <CardDescription>
          Étape {step}/4
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && (
          <div className="import-step">
            <div className="step-header">
              <h3>📁 Étape 1: Sélectionner le fichier</h3>
              <p>Choisissez votre fichier CSV contenant les EPI</p>
            </div>

            <div className="file-upload-area">
              <Input
                id="csv-upload"
                type="file"
                accept=".csv,.CSV"
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
                  <small>Format accepté: .csv</small>
                </div>
              </Label>
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
                  📊 <strong>{csvFile?.name}</strong> - {csvData.length} ligne(s), {csvHeaders.length} colonne(s)
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
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f0fdf4', borderRadius: '0.5rem' }}>
                    <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: '1rem' }} />
                    <h3>Import réussi !</h3>
                    <p>{importResults.imported_count} EPI(s) importé(s)</p>
                    {importResults.skipped_count > 0 && (
                      <p style={{ color: '#f59e0b' }}>{importResults.skipped_count} ligne(s) ignorée(s)</p>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#fef2f2', borderRadius: '0.5rem' }}>
                    <XCircle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
                    <h3>Erreur lors de l'import</h3>
                    <p>{importResults.message}</p>
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
