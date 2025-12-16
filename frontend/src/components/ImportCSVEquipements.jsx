import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Upload, Download, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';
import { apiPost } from '../utils/api';

const ImportCSVEquipements = ({ tenantSlug, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Preview, 3: Results

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFile(file);

    Papa.parse(file, {
      complete: (results) => {
        const rows = results.data.filter(row => Object.values(row).some(val => val));
        setCsvData(rows);
        if (rows.length > 0) {
          setStep(2);
        }
      },
      header: true,
      skipEmptyLines: true
    });
  };

  const handleImport = async () => {
    setImporting(true);

    try {
      const equipements = csvData.map(row => ({
        nom: row.nom || row.Nom,
        code_unique: row.code_unique || row['Code unique'] || row['code unique'],
        categorie_nom: row.categorie_nom || row.categorie || row.Catégorie || row['Categorie'],
        etat: row.etat || row.État || 'bon',
        emplacement: row.emplacement || row.Emplacement || '',
        quantite: row.quantite || row.Quantité || row['Quantite'] || 1,
        quantite_minimum: row.quantite_minimum || row['Quantité minimum'] || row['Quantite minimum'] || 0,
        vehicule: row.vehicule || row.Véhicule || row['Vehicule'] || '',
        employe: row.employe || row.employé || row.Employé || row['Employe'] || '',
        date_acquisition: row.date_acquisition || row['Date acquisition'] || row['date acquisition'] || '',
        date_fin_vie: row.date_fin_vie || row['Date fin vie'] || row['date fin vie'] || '',
        date_prochaine_maintenance: row.date_prochaine_maintenance || row['Date maintenance'] || row['date maintenance'] || '',
        valeur_achat: row.valeur_achat || row['Valeur achat'] || row['valeur achat'] || 0,
        notes: row.notes || row.Notes || '',
        champs_personnalises: row.champs_personnalises || row['Champs personnalisés'] || row['champs personnalises'] || '{}'
      }));

      const response = await apiPost(tenantSlug, '/equipements/import-csv', { equipements });

      setImportResults(response);
      setStep(3);

      if (onImportComplete) {
        onImportComplete(response);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      alert('Erreur lors de l\'import: ' + (error.data?.detail || error.message));
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setCsvData([]);
    setImportResults(null);
    setStep(1);
  };

  const downloadTemplate = () => {
    const headers = 'nom,code_unique,categorie_nom,etat,emplacement,quantite,quantite_minimum,vehicule,employe,date_acquisition,date_fin_vie,date_prochaine_maintenance,valeur_achat,notes,champs_personnalises\n';
    const example1 = 'Tuyau 2.5" - 50ft,TUY-001,Tuyaux,bon,Caserne A,5,2,Camion Pompe 1,,2024-01-15,,,1200,En bon état,"{""Diamètre"":""2.5\\"",""Longueur (pieds)"":50}"\n';
    const example2 = 'Radio portable Motorola,RAD-101,Radios portatives,bon,Bureau,1,0,,Jean Tremblay,2023-06-20,,,850,,"{}"\n';
    const csv = headers + example1 + example2;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'template_equipements.csv';
    link.click();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Import CSV/Excel - Équipements</CardTitle>
        <CardDescription>
          Importez en masse vos équipements depuis un fichier CSV ou Excel
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Étape 1: Upload fichier */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label 
                htmlFor="file-upload"
                className="cursor-pointer flex-1"
              >
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-red-500 transition-colors">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    {file ? file.name : 'Cliquez pour sélectionner un fichier'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    CSV, XLS, XLSX acceptés
                  </p>
                </div>
                <input 
                  id="file-upload"
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">📋 Colonnes attendues :</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• <strong>nom</strong> : Nom de l'équipement (obligatoire)</li>
                <li>• <strong>code_unique</strong> : Code unique (auto-généré si vide)</li>
                <li>• <strong>categorie_nom</strong> : Nom de la catégorie (obligatoire)</li>
                <li>• <strong>etat</strong> : bon, a_reparer, en_reparation, hors_service</li>
                <li>• <strong>emplacement</strong> : Localisation</li>
                <li>• <strong>quantite</strong> : Quantité disponible</li>
                <li>• <strong>vehicule</strong> : Nom du véhicule assigné (optionnel)</li>
                <li>• <strong>employe</strong> : Nom de l'employé assigné (optionnel)</li>
                <li>• <strong>champs_personnalises</strong> : JSON des champs (ex: {"{\"Diamètre\":\"2.5\\\"\"}"})</li>
              </ul>
            </div>

            <Button 
              onClick={downloadTemplate}
              variant="outline"
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Télécharger le template CSV
            </Button>
          </div>
        )}

        {/* Étape 2: Aperçu */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Aperçu des données ({csvData.length} équipements)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Vérifiez les 5 premières lignes avant d'importer
              </p>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '400px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <table style={{ width: 'max-content', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 10 }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Nom</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Code</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Catégorie</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>État</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>Quantité</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(0, 5).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{row.nom || row.Nom || '-'}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{row.code_unique || row['Code unique'] || 'Auto'}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{row.categorie_nom || row.categorie || row.Catégorie || '-'}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{row.etat || row.État || 'bon'}</td>
                      <td style={{ padding: '12px', fontSize: '14px' }}>{row.quantite || row.Quantité || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={resetImport}>Annuler</Button>
              <Button 
                onClick={handleImport}
                disabled={importing || csvData.length === 0}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {importing ? 'Import en cours...' : `Importer ${csvData.length} équipement(s)`}
              </Button>
            </div>
          </div>
        )}

        {/* Étape 3: Résultats */}
        {step === 3 && importResults && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">✅ Import terminé</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• {importResults.created} équipement(s) créé(s)</li>
                <li>• {importResults.updated} équipement(s) mis à jour</li>
                {importResults.errors.length > 0 && (
                  <li className="text-red-600">• {importResults.errors.length} erreur(s)</li>
                )}
              </ul>
            </div>

            {importResults.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
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
