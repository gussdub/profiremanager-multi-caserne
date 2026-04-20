import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';
import { useCacheInvalidation } from '../hooks/useCacheInvalidation';

const ImportBatiments = ({ onImportComplete }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { invalidateAfterImport } = useCacheInvalidation();
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Preview, 4: Conflicts, 5: Import
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'csv', 'excel', 'html'
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [defaultValues, setDefaultValues] = useState({}); // Valeurs par défaut pour saisie de masse
  const [previewData, setPreviewData] = useState([]);
  const [conflicts, setConflicts] = useState([]); // Doublons détectés
  const [conflictResolutions, setConflictResolutions] = useState({}); // Actions choisies par l'utilisateur
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [existingBatiments, setExistingBatiments] = useState([]); // Pour la détection de doublons

  // Champs par défaut
  const defaultFields = [
    { key: 'nom_etablissement', label: 'Nom établissement', required: true },
    { key: 'adresse_civique', label: 'Adresse civique', required: true },
    { key: 'ville', label: 'Ville', required: false },
    { key: 'code_postal', label: 'Code postal', required: false },
    { key: 'cadastre_matricule', label: 'Cadastre/Matricule', required: false },
    { key: 'proprietaire_nom', label: 'Propriétaire - Nom', required: false },
    { key: 'proprietaire_telephone', label: 'Propriétaire - Téléphone', required: false },
    { key: 'proprietaire_courriel', label: 'Propriétaire - Courriel', required: false },
    { key: 'gerant_nom', label: 'Gérant - Nom', required: false },
    { key: 'gerant_telephone', label: 'Gérant - Téléphone', required: false },
    { key: 'gerant_courriel', label: 'Gérant - Courriel', required: false },
    { key: 'groupe_occupation', label: 'Groupe occupation (C,E,F,I...)', required: false },
    { key: 'description_activite', label: 'Description activité', required: false },
    { key: 'notes_generales', label: 'Notes générales', required: false }
  ];

  // Charger les champs personnalisés depuis le localStorage ou utiliser les champs par défaut
  const [availableFields, setAvailableFields] = useState(() => {
    const savedFields = localStorage.getItem(`${tenantSlug}_import_fields`);
    if (savedFields) {
      const fields = JSON.parse(savedFields);
      // Migration automatique: remplacer numero_lot_cadastre par cadastre_matricule
      const migratedFields = fields.map(field => {
        if (field.key === 'numero_lot_cadastre') {
          return { ...field, key: 'cadastre_matricule', label: 'Cadastre/Matricule' };
        }
        return field;
      });
      // Sauvegarder la version migrée
      localStorage.setItem(`${tenantSlug}_import_fields`, JSON.stringify(migratedFields));
      return migratedFields;
    }
    return defaultFields;
  });

  // Sauvegarder les champs personnalisés
  const saveCustomFields = (fields) => {
    localStorage.setItem(`${tenantSlug}_import_fields`, JSON.stringify(fields));
    setAvailableFields(fields);
    toast({
      title: "Champs sauvegardés",
      description: "Vos champs personnalisés ont été enregistrés"
    });
  };

  // Réinitialiser aux champs par défaut
  const resetToDefaultFields = () => {
    localStorage.removeItem(`${tenantSlug}_import_fields`);
    setAvailableFields(defaultFields);
    toast({
      title: "Réinitialisation",
      description: "Les champs ont été réinitialisés aux valeurs par défaut"
    });
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'html', 'htm', 'xml'].includes(fileExtension)) {
      toast({
        title: "Format non supporté",
        description: "Formats acceptés : CSV, Excel (.xlsx, .xls), HTML (.html, .htm) et XML (.xml)",
        variant: "destructive"
      });
      return;
    }

    setUploadedFile(file);
    
    let type;
    if (fileExtension === 'html' || fileExtension === 'htm') {
      type = 'html';
    } else if (fileExtension === 'xml') {
      type = 'xml';
    } else if (fileExtension === 'csv') {
      type = 'csv';
    } else {
      type = 'excel';
    }
    setFileType(type);
    
    if (fileExtension === 'html' || fileExtension === 'htm') {
      parseHTML(file);
    } else if (fileExtension === 'xml') {
      parseXML(file);
    } else {
      parseCSV(file);
    }
  };

  const parseHTML = async (file) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      
      // Chercher le premier tableau
      const table = doc.querySelector('table');
      if (!table) {
        throw new Error("Aucun tableau HTML trouvé dans le fichier");
      }
      
      // Extraire les en-têtes
      const headerRow = table.querySelector('thead tr, tr:first-child');
      if (!headerRow) {
        throw new Error("Aucune ligne d'en-tête trouvée");
      }
      
      const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => cell.textContent.trim());
      setCsvHeaders(headers);
      
      // Extraire les données
      const rows = Array.from(table.querySelectorAll('tbody tr, tr')).slice(headers.length > 0 ? 1 : 0);
      const data = rows.map((row, index) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const rowData = { _index: index };
        headers.forEach((header, i) => {
          rowData[header] = cells[i] ? cells[i].textContent.trim() : '';
        });
        return rowData;
      });
      
      setCsvData(data);
      setStep(2);
      
      toast({
        title: "Fichier HTML analysé",
        description: `${data.length} ligne(s) détectée(s) avec ${headers.length} colonne(s)`
      });
      
    } catch (error) {
      console.error('Erreur parsing HTML:', error);
      toast({
        title: "Erreur d'analyse HTML",
        description: error.message || "Impossible d'analyser le fichier HTML",
        variant: "destructive"
      });
    }
  };


  const parseXML = async (file) => {
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      
      // Vérifier les erreurs de parsing
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new Error("Le fichier XML n'est pas valide");
      }
      
      // Extraire tous les éléments récursifs du XML
      // Pour un XML municipal québécois, on cherche les éléments répétitifs
      const extractAllElements = (node, prefix = '') => {
        const result = {};
        
        if (node.nodeType === Node.ELEMENT_NODE) {
          const path = prefix ? `${prefix}/${node.nodeName}` : node.nodeName;
          
          // Si l'élément a du texte et pas d'enfants éléments
          if (node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE) {
            const value = node.textContent.trim();
            if (value) {
              result[path] = value;
            }
          }
          
          // Parcourir les enfants
          Array.from(node.children).forEach(child => {
            const childData = extractAllElements(child, path);
            Object.assign(result, childData);
          });
        }
        
        return result;
      };
      
      // Trouver les éléments qui se répètent (probablement les bâtiments/adresses)
      // Pour le format municipal québécois, c'est généralement CE02 qui se répète
      const findRepeatingElements = (xmlDoc) => {
        // Essayer de détecter automatiquement l'élément parent qui se répète
        const commonParents = ['CE02', 'CEx', 'batiment', 'adresse', 'record', 'row'];
        
        for (const parentName of commonParents) {
          const elements = xmlDoc.getElementsByTagName(parentName);
          if (elements.length > 0) {
            return Array.from(elements);
          }
        }
        
        // Si aucun élément commun trouvé, prendre tous les enfants directs de la racine
        return Array.from(xmlDoc.documentElement.children);
      };
      
      const repeatingElements = findRepeatingElements(xmlDoc);
      
      if (repeatingElements.length === 0) {
        throw new Error("Aucun élément répétitif trouvé dans le XML");
      }
      
      // Extraire les données de chaque élément
      const data = repeatingElements.map((element, index) => {
        const rowData = { _index: index };
        const extracted = extractAllElements(element);
        Object.assign(rowData, extracted);
        return rowData;
      });
      
      // Extraire tous les chemins uniques comme en-têtes
      const allPaths = new Set();
      data.forEach(row => {
        Object.keys(row).forEach(key => {
          if (key !== '_index') {
            allPaths.add(key);
          }
        });
      });
      
      const headers = Array.from(allPaths).sort();
      
      setCsvHeaders(headers);
      setCsvData(data);
      setStep(2);
      
      toast({
        title: "Fichier XML analysé",
        description: `${data.length} élément(s) détecté(s) avec ${headers.length} champ(s) disponible(s)`
      });
      
    } catch (error) {
      console.error('Erreur parsing XML:', error);
      toast({
        title: "Erreur d'analyse XML",
        description: error.message || "Impossible d'analyser le fichier XML",
        variant: "destructive"
      });
    }
  };


  const parseCSV = async (file) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        throw new Error("Le fichier doit contenir au moins un en-tête et une ligne de données");
      }

      // Parse headers (première ligne)
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      setCsvHeaders(headers);

      // Parse data (lignes suivantes)
      const data = lines.slice(1).map((line, index) => {
        const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
        const row = { _index: index };
        headers.forEach((header, i) => {
          row[header] = values[i] || '';
        });
        return row;
      });

      setCsvData(data);
      setStep(2); // Passer au mapping
      
      toast({
        title: "Fichier analysé",
        description: `${data.length} ligne(s) détectée(s) avec ${headers.length} colonne(s)`
      });

    } catch (error) {
      console.error('Erreur parsing CSV:', error);
      toast({
        title: "Erreur d'analyse",
        description: error.message || "Impossible d'analyser le fichier",
        variant: "destructive"
      });
    }
  };

  const handleColumnMapping = (csvColumn, fieldKey) => {
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

  // Détecter les doublons avant import
  const detectConflicts = async () => {
    try {
      // Récupérer tous les bâtiments existants
      const existingData = await apiGet(tenantSlug, '/prevention/batiments');
      setExistingBatiments(existingData);
      
      // Mapper toutes les données CSV
      const allMappedData = csvData.map(row => {
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
      
      // Détecter les conflits (adresse, matricule, cadastre)
      const detectedConflicts = [];
      allMappedData.forEach((newBat, index) => {
        const duplicates = existingData.filter(existing => {
          // Vérifier adresse
          const sameAddress = existing.adresse_civique && newBat.adresse_civique && 
            existing.adresse_civique.toLowerCase().trim() === newBat.adresse_civique.toLowerCase().trim();
          
          // Vérifier cadastre/matricule
          const sameCadastre = existing.cadastre_matricule && newBat.cadastre_matricule &&
            existing.cadastre_matricule.toLowerCase().trim() === newBat.cadastre_matricule.toLowerCase().trim();
          
          return sameAddress || sameCadastre;
        });
        
        if (duplicates.length > 0) {
          detectedConflicts.push({
            index,
            newData: newBat,
            existing: duplicates[0], // Prendre le premier doublon
            reasons: [
              duplicates[0].adresse_civique === newBat.adresse_civique && 'Même adresse',
              duplicates[0].cadastre_matricule === newBat.cadastre_matricule && 'Même cadastre'
            ].filter(Boolean)
          });
        }
      });
      
      if (detectedConflicts.length > 0) {
        setConflicts(detectedConflicts);
        // Initialiser les résolutions à "ignorer" par défaut
        const initialResolutions = {};
        detectedConflicts.forEach(c => {
          initialResolutions[c.index] = 'ignorer';
        });
        setConflictResolutions(initialResolutions);
        setStep(4); // Étape de résolution des conflits
        
        toast({
          title: "⚠️ Doublons détectés",
          description: `${detectedConflicts.length} conflit(s) trouvé(s). Veuillez choisir une action.`,
          variant: "warning"
        });
      } else {
        // Pas de conflits, passer directement à l'import
        proceedWithImport();
      }
      
    } catch (error) {
      console.error('Erreur détection conflits:', error);
      toast({
        title: "Erreur",
        description: "Impossible de vérifier les doublons",
        variant: "destructive"
      });
    }
  };

  const validateMapping = () => {
    const requiredFields = availableFields.filter(f => f.required);
    const missingFields = requiredFields.filter(f => 
      !columnMapping[f.key] && !defaultValues[f.key] // Valide si colonne CSV OU valeur par défaut
    );
    
    if (missingFields.length > 0) {
      toast({
        title: "Champs requis manquants",
        description: `Veuillez mapper ou définir une valeur par défaut pour: ${missingFields.map(f => f.label).join(', ')}`,
        variant: "destructive"
      });
      return false;
    }
    return true;
  };

  const handleImport = async () => {
    if (!validateMapping()) return;

    setImporting(true);
    try {
      const mappedData = csvData.map(row => {
        const batiment = {};
        availableFields.forEach(field => {
          // Priorité 1: Valeur par défaut (saisie de masse écrase tout)
          if (defaultValues[field.key]) {
            batiment[field.key] = defaultValues[field.key];
          }
          // Priorité 2: Valeur du CSV
          else {
            const csvColumn = columnMapping[field.key];
            batiment[field.key] = csvColumn ? (row[csvColumn] || '') : '';
          }
        });
        return batiment;
      });

      // Extraire les champs requis personnalisés
      const requiredFields = availableFields
        .filter(f => f.required)
        .map(f => ({ key: f.key, label: f.label }));

      const response = await apiPost(tenantSlug, '/prevention/batiments/import-csv', {
        batiments: mappedData,
        required_fields: requiredFields  // Envoyer les champs requis
      });

      setImportResults(response);
      setStep(4);
      
      // Invalider le cache pour garantir des données fraîches
      await invalidateAfterImport();

      toast({
        title: "Import terminé",
        description: `${response.success_count} bâtiment(s) importé(s) avec succès`
      });

    } catch (error) {
      console.error('Erreur import:', error);
      toast({
        title: "Erreur d'import",
        description: error.message || "Une erreur s'est produite lors de l'import",
        variant: "destructive"
      });
    } finally {
      setImporting(false);
    }
  };

  // Composant éditeur de champs
  const FieldEditor = () => {
    const [editingFields, setEditingFields] = useState([...availableFields]);
    const [newField, setNewField] = useState({ key: '', label: '', required: false });

    const addField = () => {
      if (!newField.key || !newField.label) {
        toast({
          title: "Validation",
          description: "Veuillez remplir la clé et le label du champ",
          variant: "destructive"
        });
        return;
      }

      // Vérifier que la clé n'existe pas déjà
      if (editingFields.some(f => f.key === newField.key)) {
        toast({
          title: "Erreur",
          description: "Un champ avec cette clé existe déjà",
          variant: "destructive"
        });
        return;
      }

      setEditingFields([...editingFields, { ...newField }]);
      setNewField({ key: '', label: '', required: false });
    };

    const removeField = (key) => {
      setEditingFields(editingFields.filter(f => f.key !== key));
    };

    const updateField = (key, updates) => {
      setEditingFields(editingFields.map(f => 
        f.key === key ? { ...f, ...updates } : f
      ));
    };

    const handleSave = () => {
      if (editingFields.length === 0) {
        toast({
          title: "Erreur",
          description: "Vous devez avoir au moins un champ",
          variant: "destructive"
        });
        return;
      }

      saveCustomFields(editingFields);
      setShowFieldEditor(false);
    };

    return (
      <div className="field-editor-overlay">
        <div className="field-editor-modal">
          <div className="modal-header">
            <h3>⚙️ Personnaliser les champs d'import</h3>
            <button 
              className="close-btn" 
              onClick={() => setShowFieldEditor(false)}
            >
              ✕
            </button>
          </div>

          <div className="modal-content">
            {/* Liste des champs existants */}
            <div className="existing-fields">
              <h4>Champs actuels ({editingFields.length})</h4>
              <p className="helper-text">💡 Cochez "Obligatoire" pour les champs qui doivent absolument être remplis lors de l'import.</p>
              <div className="fields-list">
                {editingFields.map((field, index) => (
                  <div key={field.key} className={`field-item ${field.required ? 'required-field-item' : ''}`}>
                    <div className="field-number">{index + 1}</div>
                    <div className="field-details">
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(field.key, { label: e.target.value })}
                        placeholder="Label du champ"
                        className="field-label-input"
                      />
                      <code className="field-key">{field.key}</code>
                    </div>
                    <label className={`field-required-toggle ${field.required ? 'required-active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.key, { required: e.target.checked })}
                      />
                      <span className="toggle-text">
                        {field.required ? '✅ Obligatoire' : '⚪ Optionnel'}
                      </span>
                    </label>
                    <button
                      onClick={() => removeField(field.key)}
                      className="remove-field-btn"
                      title="Supprimer ce champ"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Ajouter un nouveau champ */}
            <div className="add-field-section">
              <h4>➕ Ajouter un nouveau champ</h4>
              <div className="add-field-form">
                <div className="add-field-inputs">
                  <input
                    type="text"
                    value={newField.key}
                    onChange={(e) => setNewField({ ...newField, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="Clé (ex: contact_urgence)"
                    className="field-key-input"
                  />
                  <input
                    type="text"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    placeholder="Label (ex: Contact d'urgence)"
                    className="field-label-input"
                  />
                </div>
                <label className={`field-required-toggle ${newField.required ? 'required-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={newField.required}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                  />
                  <span className="toggle-text">
                    {newField.required ? '✅ Obligatoire' : '⚪ Optionnel'}
                  </span>
                </label>
                <Button size="sm" onClick={addField}>
                  ➕ Ajouter
                </Button>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <Button 
              variant="outline" 
              onClick={resetToDefaultFields}
            >
              🔄 Réinitialiser par défaut
            </Button>
            <div className="footer-actions">
              <Button 
                variant="outline" 
                onClick={() => setShowFieldEditor(false)}
              >
                Annuler
              </Button>
              <Button onClick={handleSave}>
                💾 Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>📁 Étape 1: Sélectionner le fichier</h3>
              <p>Choisissez votre fichier CSV, Excel, XML ou HTML contenant les données des bâtiments</p>
            </div>

            <div className="file-upload-area">
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.xml,.html,.htm"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="file-upload-label">
                <div className="upload-icon">📄</div>
                <div className="upload-text">
                  <strong>Cliquer pour sélectionner</strong> ou glisser votre fichier ici
                  <br />
                  <small>Formats acceptés: .csv, .xlsx, .xls</small>
                </div>
              </label>
            </div>

            <div className="import-tips">
              <h4>💡 Conseils pour un import réussi:</h4>
              <ul>
                <li>La première ligne doit contenir les en-têtes de colonnes</li>
                <li>Utilisez des noms de colonnes clairs (ex: "Nom", "Adresse", "Ville")</li>
                <li>Les champs requis: Nom établissement, Adresse civique</li>
                <li>Encodage recommandé: UTF-8</li>
                <li><strong>💾 Nouveau:</strong> Vous pourrez définir des valeurs par défaut pour tous les bâtiments (ex: même ville pour tous)</li>
              </ul>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>🔗 Étape 2: Correspondance des colonnes</h3>
              <p>Associez les colonnes de votre fichier aux champs du système</p>
            </div>

            <div className="mapping-container">
              <div className="mapping-header">
                <div className="file-info">
                  📊 <strong>{uploadedFile?.name}</strong> - {csvData.length} ligne(s), {csvHeaders.length} colonne(s)
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setShowFieldEditor(true)}
                >
                  ⚙️ Personnaliser les champs
                </Button>
              </div>

              <div className="mapping-info-box">
                <p>💡 <strong>Astuce:</strong> Utilisez la colonne "Valeur par défaut" pour appliquer une même valeur à toutes les lignes importées. Par exemple, si tous vos bâtiments sont dans la même ville, entrez le nom de la ville dans "Valeur par défaut" au lieu de l'ajouter dans le CSV.</p>
                <p><small>⚠️ La valeur par défaut écrase toujours les données du CSV si les deux sont renseignés.</small></p>
              </div>

              <div className="mapping-table">
                <div className="mapping-row header">
                  <div className="field-column">Champ système</div>
                  <div className="arrow-column">➡️</div>
                  <div className="csv-column">Colonne CSV</div>
                  <div className="default-value-column">💾 Valeur par défaut (saisie de masse)</div>
                  <div className="preview-column">Aperçu données</div>
                </div>

                {availableFields.map(field => (
                  <div key={field.key} className="mapping-row">
                    <div className="field-column">
                      <span className={field.required ? 'required-field' : 'optional-field'}>
                        {field.label}
                        {field.required && <span className="required-star"> *</span>}
                      </span>
                    </div>
                    <div className="arrow-column">➡️</div>
                    <div className="csv-column">
                      <select
                        value={columnMapping[field.key] || ''}
                        onChange={(e) => handleColumnMapping(e.target.value, field.key)}
                        className="mapping-select"
                        disabled={!!defaultValues[field.key]}
                      >
                        <option value="">-- Sélectionner une colonne --</option>
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
                        placeholder="Ex: Montréal (appliqué à toutes les lignes)"
                        className="default-value-input"
                      />
                    </div>
                    <div className="preview-column">
                      {defaultValues[field.key] ? (
                        <span className="preview-data default-preview">
                          <strong>{defaultValues[field.key]}</strong> (toutes)
                        </span>
                      ) : columnMapping[field.key] && csvData[0] ? (
                        <span className="preview-data">
                          {csvData[0][columnMapping[field.key]] || '(vide)'}
                        </span>
                      ) : (
                        <span className="no-preview">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mapping-actions">
                <Button variant="outline" onClick={() => setStep(1)}>
                  ← Retour
                </Button>
                <Button onClick={generatePreview}>
                  Aperçu données →
                </Button>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>👀 Étape 3: Aperçu des données</h3>
              <p>Vérifiez que les données sont correctement mappées avant l'import</p>
            </div>

            <div className="preview-container">
              <div className="preview-info">
                📋 Aperçu des <strong>5 premières lignes</strong> sur {csvData.length} total
              </div>

              <div className="preview-table-wrapper">
                <table className="preview-table-enhanced">
                  <thead>
                    <tr>
                      <th className="row-number-header">#</th>
                      {availableFields.map(field => (
                        <th key={field.key} className={field.required ? 'required-header' : ''}>
                          {field.label}
                          {field.required && <span className="required-star"> *</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index}>
                        <td className="row-number">{index + 1}</td>
                        {availableFields.map(field => (
                          <td key={field.key} className="preview-data-cell">
                            {row[field.key] ? (
                              <span className={defaultValues[field.key] ? 'default-value-indicator' : 'csv-value-indicator'}>
                                {row[field.key]}
                              </span>
                            ) : (
                              <span className="empty-cell">(vide)</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="preview-legend">
                <div className="legend-item">
                  <span className="legend-badge default-badge">Bleu</span>
                  <span>Valeur par défaut (appliquée à toutes les lignes)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-badge csv-badge">Vert</span>
                  <span>Valeur du fichier CSV</span>
                </div>
              </div>

              <div className="preview-actions">
                <Button variant="outline" onClick={() => setStep(2)}>
                  ← Modifier mapping
                </Button>
                <Button 
                  onClick={handleImport}
                  disabled={importing}
                  className="import-confirm-btn"
                >
                  {importing ? '⏳ Import en cours...' : '✅ Confirmer import'}
                </Button>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="import-step">
            <div className="step-header">
              <h3>🎉 Import terminé</h3>
            </div>

            {importResults && (
              <div className="import-results">
                <div className="results-summary">
                  <div className="result-stat success">
                    <div className="stat-number">{importResults.success_count}</div>
                    <div className="stat-label">Importés avec succès</div>
                  </div>
                  {importResults.error_count > 0 && (
                    <div className="result-stat error">
                      <div className="stat-number">{importResults.error_count}</div>
                      <div className="stat-label">Erreurs</div>
                    </div>
                  )}
                </div>

                {importResults.errors && importResults.errors.length > 0 && (
                  <div className="import-errors">
                    <h4>⚠️ Lignes avec erreurs:</h4>
                    <ul>
                      {importResults.errors.map((error, index) => (
                        <li key={index}>
                          Ligne {error.row}: {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="final-actions">
                  <Button 
                    onClick={onImportComplete}
                    className="finish-btn"
                  >
                    📋 Voir les bâtiments
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setStep(1);
                      setUploadedFile(null);
                      setCsvData([]);
                      setColumnMapping({});
                      setImportResults(null);
                    }}
                  >
                    🔄 Nouvel import
                  </Button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <div>Étape inconnue</div>;
    }
  };

  return (
    <div className="import-csv-container">
      {showFieldEditor && <FieldEditor />}
      
      <div className="import-progress">
        <div className="progress-steps">
          {[1, 2, 3, 4].map(stepNum => (
            <div 
              key={stepNum} 
              className={`progress-step ${step >= stepNum ? 'active' : ''} ${step === stepNum ? 'current' : ''}`}
            >
              <div className="step-circle">{stepNum}</div>
              <div className="step-label">
                {stepNum === 1 && 'Téléverser'}
                {stepNum === 2 && 'Mappage'}
                {stepNum === 3 && 'Aperçu'}
                {stepNum === 4 && 'Importer'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="import-content">
        {renderStep()}
      </div>
    </div>
  );
};

// Gestion des Grilles d'Inspection

export default ImportBatiments;
