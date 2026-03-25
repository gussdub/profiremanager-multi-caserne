import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { 
  Upload, CheckCircle, RefreshCw, FileText, Archive, 
  AlertTriangle, Siren, XCircle 
} from 'lucide-react';

const ImportInterventions = ({ tenantSlug, onImportComplete }) => {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const isZip = file?.name?.toLowerCase().endsWith('.zip');

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setPreviewData(null);
      setResults(null);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/interventions/import-history/preview`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}` },
          body: formData,
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Erreur lors de la prévisualisation');
      }
      const data = await response.json();
      setPreviewData(data);
      toast({
        title: 'Analyse terminée',
        description: `${data.new_count} nouvelle(s) intervention(s), ${data.duplicate_count} doublon(s)`,
      });
    } catch (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleExecute = async () => {
    if (!previewData) return;
    setExecuting(true);
    try {
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/interventions/import-history/execute`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: previewData.session_id,
            skip_duplicates: skipDuplicates,
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Erreur lors de l'import");
      }
      const data = await response.json();
      setResults(data);
      toast({ title: 'Import terminé', description: data.message });
      if (onImportComplete) onImportComplete(data);
    } catch (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } finally {
      setExecuting(false);
    }
  };

  if (results) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Siren className="h-8 w-8 text-red-600" />
          <div>
            <h2 className="text-xl font-bold">Import d'historique d'interventions</h2>
            <p className="text-sm text-gray-500">CSV, XML ou ZIP</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="text-green-500" /> Import terminé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-green-600">{results.created}</div>
                <div className="text-sm text-gray-600">Interventions créées</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-red-600">{results.errors?.length || 0}</div>
                <div className="text-sm text-gray-600">Erreurs</div>
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <Button data-testid="import-interventions-reset" onClick={() => {
                setFile(null);
                setPreviewData(null);
                setResults(null);
              }}>
                Nouvel import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Siren className="h-8 w-8 text-red-600" />
        <div>
          <h2 className="text-xl font-bold">Import d'historique d'interventions</h2>
          <p className="text-sm text-gray-500">
            Importez l'historique depuis un fichier CSV, XML (cartes d'appel) ou ZIP (ProFireManager)
          </p>
        </div>
      </div>

      {/* Sélection de fichier */}
      <Card>
        <CardHeader>
          <CardTitle>1. Sélectionner le fichier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <input
              type="file"
              accept=".csv,.xml,.zip"
              onChange={handleFileChange}
              className="hidden"
              id="intervention-upload"
              data-testid="import-interventions-file-input"
            />
            <label
              htmlFor="intervention-upload"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
              data-testid="import-interventions-file-label"
            >
              {isZip ? <Archive size={20} className="text-purple-600" /> : <FileText size={20} />}
              {file ? file.name : 'Choisir un fichier CSV, XML ou ZIP'}
            </label>
            {file && !previewData && (
              <Button onClick={handlePreview} disabled={uploading} data-testid="import-interventions-preview-btn">
                {uploading ? (
                  <><RefreshCw className="animate-spin mr-2" size={16} /> Analyse...</>
                ) : (
                  <><Upload className="mr-2" size={16} /> Analyser le fichier</>
                )}
              </Button>
            )}
          </div>
          {isZip && file && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg text-sm text-purple-800 flex items-center gap-2">
              <Archive size={16} /> Archive ZIP - tous les fichiers CSV/XML contenus seront traités
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prévisualisation */}
      {previewData && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>2. Résumé de l'analyse</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{previewData.total}</div>
                  <div className="text-sm text-gray-600">Total trouvées</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{previewData.new_count}</div>
                  <div className="text-sm text-gray-600">Nouvelles</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">{previewData.duplicate_count}</div>
                  <div className="text-sm text-gray-600">Doublons existants</div>
                </div>
              </div>

              {previewData.duplicate_count > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
                  <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">{previewData.duplicate_count}</span> intervention(s) déjà présente(s).
                    <label className="ml-3 inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipDuplicates}
                        onChange={(e) => setSkipDuplicates(e.target.checked)}
                        className="rounded"
                      />
                      <span>Ignorer les doublons</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Aperçu des données */}
              {previewData.preview.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Aperçu des interventions :</h4>
                  <div className="border rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">No</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Adresse</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Ville</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewData.preview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{item.external_call_id || '-'}</td>
                            <td className="px-3 py-2">{item.type_intervention || '-'}</td>
                            <td className="px-3 py-2">{item.address_full || '-'}</td>
                            <td className="px-3 py-2">{item.municipality || '-'}</td>
                            <td className="px-3 py-2 text-xs">{item.date ? new Date(item.date).toLocaleDateString('fr-CA') : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => { setPreviewData(null); }}>
              <XCircle className="mr-2" size={16} /> Annuler
            </Button>
            <Button
              onClick={handleExecute}
              disabled={executing || previewData.new_count === 0}
              data-testid="import-interventions-execute-btn"
            >
              {executing ? (
                <><RefreshCw className="animate-spin mr-2" size={16} /> Import en cours...</>
              ) : (
                <><CheckCircle className="mr-2" size={16} /> Importer {skipDuplicates ? previewData.new_count : previewData.total} intervention(s)</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ImportInterventions;
