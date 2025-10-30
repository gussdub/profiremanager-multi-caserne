import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Upload, CheckCircle, Download, Mail } from 'lucide-react';

const ImportCSVPersonnel = ({ tenantSlug, onImportComplete }) => {
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
    { key: 'prenom', label: 'Prénom', required: true },
    { key: 'nom', label: 'Nom', required: true },
    { key: 'email', label: 'Email', required: true },
    { key: 'numero_employe', label: 'Numéro d\'employé', required: false },
    { key: 'grade', label: 'Grade', required: false },
    { key: 'type_emploi', label: 'Type emploi (temps_plein/temps_partiel)', required: false },
    { key: 'date_embauche', label: 'Date d\'embauche (YYYY-MM-DD)', required: false },
    { key: 'taux_horaire', label: 'Taux horaire', required: false },
    { key: 'telephone', label: 'Téléphone', required: false },
    { key: 'adresse', label: 'Adresse', required: false },
    { key: 'role', label: 'Rôle (admin/superviseur/employe)', required: false },
    { key: 'accepte_gardes_externes', label: 'Accepte gardes externes (true/false)', required: false },
    { key: 'competences', label: 'Compétences (séparées par virgules)', required: false },
    { key: 'contact_urgence_nom', label: 'Contact urgence - Nom', required: false },
    { key: 'contact_urgence_telephone', label: 'Contact urgence - Téléphone', required: false },
    { key: 'contact_urgence_relation', label: 'Contact urgence - Relation', required: false }
  ];

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
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
        throw new Error('Le fichier doit contenir au moins un en-tête et une ligne de données');
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
      alert(`Erreur lors de la lecture du fichier: ${error.message}`);
    }
  };

  const handleMapping = () => {
    const requiredFields = availableFields.filter(f => f.required);
    const missingRequired = requiredFields.filter(rf => !columnMapping[rf.key]);
    
    if (missingRequired.length > 0) {
      alert(`Champs obligatoires manquants: ${missingRequired.map(f => f.label).join(', ')}`);
      return;
    }

    const mapped = csvData.map(row => {
      const mappedRow = {};
      Object.keys(columnMapping).forEach(fieldKey => {
        const csvColumn = columnMapping[fieldKey];
        if (csvColumn && csvColumn !== 'none') {
          let value = row[csvColumn];
          
          // Convertir les booléens
          if (fieldKey === 'accepte_gardes_externes') {
            value = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'oui';
          }
          
          mappedRow[fieldKey] = value;
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
      const dataWithActions = previewData.map((item, index) => ({
        ...item,
        action_doublon: duplicateActions[index] || 'skip'
      }));

      const response = await fetch(`/api/${tenantSlug}/users/import-csv`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ users: dataWithActions })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de l\'import');
      }

      const results = await response.json();
      setImportResults(results);
      setStep(4);

      if (onImportComplete) {
        onImportComplete(results);
      }
    } catch (error) {
      alert(`Erreur: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDuplicateAction = (index, action) => {
    setDuplicateActions(prev => ({
      ...prev,
      [index]: action
    }));
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <Label htmlFor="csv-upload" className="cursor-pointer">
          <span className="text-blue-600 hover:text-blue-700 font-medium">
            Cliquez pour uploader
          </span>
          <span className="text-gray-600"> ou glissez-déposez</span>
        </Label>
        <Input
          id="csv-upload"
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />
        <p className="text-sm text-gray-500 mt-2">CSV uniquement</p>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-semibold mb-2">Format attendu :</h4>
        <p className="text-sm text-gray-700 mb-2">
          Champs obligatoires marqués *
        </p>
        <ul className="text-sm text-gray-700 space-y-1 max-h-48 overflow-auto">
          {availableFields.map(field => (
            <li key={field.key}>
              • <strong>{field.label}</strong> {field.required && <span className="text-red-600">*</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg">
        <p className="text-sm text-gray-700">
          <strong>Note importante :</strong> Un email de réinitialisation de mot de passe sera automatiquement envoyé à chaque nouvel employé.
        </p>
      </div>

      <Button onClick={() => {
        const csvContent = availableFields.map(f => f.label).join(',') + '\n';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_personnel.csv';
        a.click();
      }}>
        <Download className="mr-2 h-4 w-4" />
        Télécharger le modèle CSV
      </Button>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Faites correspondre les colonnes de votre CSV avec les champs du système.
      </p>

      <div className="grid gap-4 max-h-96 overflow-auto">
        {availableFields.map(field => (
          <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
            <Label className="font-medium">
              {field.label}
              {field.required && <span className="text-red-600 ml-1">*</span>}
            </Label>
            <select
              className="border rounded px-3 py-2"
              value={columnMapping[field.key] || 'none'}
              onChange={(e) => setColumnMapping({
                ...columnMapping,
                [field.key]: e.target.value
              })}
            >
              <option value="none">-- Ignorer --</option>
              {csvHeaders.map(header => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          Retour
        </Button>
        <Button onClick={handleMapping}>
          Continuer
        </Button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Vérifiez les données avant l'import ({previewData.length} employés)
      </p>

      <div className="max-h-96 overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left">Prénom</th>
              <th className="px-4 py-2 text-left">Nom</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">N° Employé</th>
              <th className="px-4 py-2 text-left">Grade</th>
              <th className="px-4 py-2 text-left">Action doublon</th>
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, index) => (
              <tr key={index} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">{row.prenom}</td>
                <td className="px-4 py-2">{row.nom}</td>
                <td className="px-4 py-2">{row.email}</td>
                <td className="px-4 py-2">{row.numero_employe || '-'}</td>
                <td className="px-4 py-2">{row.grade || '-'}</td>
                <td className="px-4 py-2">
                  <select
                    className="border rounded px-2 py-1 text-xs"
                    value={duplicateActions[index] || 'skip'}
                    onChange={(e) => handleDuplicateAction(index, e.target.value)}
                  >
                    <option value="skip">Ignorer</option>
                    <option value="update">Mettre à jour</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setStep(2)}>
          Retour
        </Button>
        <Button onClick={handleImport} disabled={importing}>
          {importing ? 'Import en cours...' : `Importer ${previewData.length} employés`}
        </Button>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-green-600 mb-4" />
        <h3 className="text-xl font-semibold mb-2">Import terminé !</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Créés</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{importResults?.created || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mis à jour</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{importResults?.updated || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Erreurs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{importResults?.errors?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      {importResults?.password_reset_emails?.length > 0 && (
        <Card className="bg-green-50">
          <CardHeader>
            <CardTitle className="text-sm text-green-800 flex items-center">
              <Mail className="mr-2 h-4 w-4" />
              Emails envoyés
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-700">
              {importResults.password_reset_emails.length} email(s) de réinitialisation envoyé(s)
            </p>
          </CardContent>
        </Card>
      )}

      {importResults?.errors?.length > 0 && (
        <Card className="bg-red-50">
          <CardHeader>
            <CardTitle className="text-sm text-red-800">Erreurs détaillées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-auto">
              {importResults.errors.map((error, index) => (
                <div key={index} className="text-sm text-red-700 mb-2">
                  <strong>Ligne {error.line}:</strong> {error.error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={() => {
        setStep(1);
        setCsvFile(null);
        setCsvData([]);
        setPreviewData([]);
        setImportResults(null);
      }}>
        Nouvel import
      </Button>
    </div>
  );

  return (
    <Card className="w-full max-w-6xl mx-auto">
      <CardHeader>
        <CardTitle>Import CSV - Personnel</CardTitle>
        <CardDescription>
          Étape {step}/4: {
            step === 1 ? 'Upload du fichier' :
            step === 2 ? 'Mapping des colonnes' :
            step === 3 ? 'Aperçu des données' :
            'Résultats'
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </CardContent>
    </Card>
  );
};

export default ImportCSVPersonnel;
