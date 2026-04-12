import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { 
  Upload, CheckCircle, RefreshCw, FileText, Archive, 
  AlertTriangle, Siren, XCircle, Building2, Link2, LinkIcon
} from 'lucide-react';

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB par chunk (réduit le nombre de requêtes pour les gros fichiers)

const ImportInterventions = ({ tenantSlug, onImportComplete }) => {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}`;
  const getToken = () => localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');

  const isZip = file?.name?.toLowerCase().endsWith('.zip');
  const isLargeFile = file?.size > CHUNK_SIZE;

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setPreviewData(null);
      setResults(null);
      setUploadProgress(0);
    }
  };

  const uploadChunked = useCallback(async () => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    
    // 1. Init
    setUploadProgress(1);
    let initRes;
    try {
      initRes = await fetch(`${API}/interventions/import-history/init-upload`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          total_size: file.size,
          total_chunks: totalChunks,
        }),
      });
    } catch (networkErr) {
      throw new Error(`Erreur réseau lors de l'initialisation. Vérifiez votre connexion.`);
    }
    if (!initRes.ok) {
      let detail = 'Échec initialisation upload';
      try { detail = (await initRes.json()).detail || detail; } catch {}
      throw new Error(`${detail} (HTTP ${initRes.status})`);
    }
    const { upload_id } = await initRes.json();

    // 2. Upload chunks with retry
    const MAX_RETRIES = 3;
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const chunkSizeMB = ((end - start) / (1024 * 1024)).toFixed(1);
      
      let success = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !success; attempt++) {
        try {
          const formData = new FormData();
          formData.append('upload_id', upload_id);
          formData.append('chunk_index', i.toString());
          formData.append('file', chunk, `chunk_${i}`);

          const chunkRes = await fetch(`${API}/interventions/import-history/upload-chunk`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
          });
          if (!chunkRes.ok) {
            if (attempt === MAX_RETRIES - 1) throw new Error(`Échec chunk ${i + 1}/${totalChunks} (${chunkSizeMB} Mo)`);
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // backoff
            continue;
          }
          success = true;
        } catch (err) {
          if (attempt === MAX_RETRIES - 1) throw err;
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
      
      setUploadProgress(Math.round(((i + 1) / totalChunks) * 80));
    }

    // 3. Finalize
    setUploadProgress(85);
    const finalRes = await fetch(`${API}/interventions/import-history/finalize-upload`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ upload_id }),
    });
    if (!finalRes.ok) {
      let detail = 'Échec finalisation';
      try { detail = (await finalRes.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    setUploadProgress(100);
    return await finalRes.json();
  }, [file, API]);

  const uploadDirect = useCallback(async () => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API}/interventions/import-history/preview`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Erreur lors de la prévisualisation');
    }
    return await response.json();
  }, [file, API]);

  const handlePreview = async () => {
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const data = isLargeFile ? await uploadChunked() : await uploadDirect();
      setPreviewData(data);
      const desc = data.type === 'dossier_adresse' 
        ? `${data.total} dossier(s) d'adresse trouvé(s)`
        : `${data.new_count} nouvelle(s), ${data.duplicate_count} doublon(s), ${data.matched_count || 0} liée(s) à un bâtiment`;
      toast({ title: 'Analyse terminée', description: desc });
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
      const response = await fetch(`${API}/interventions/import-history/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: previewData.session_id,
          skip_duplicates: skipDuplicates,
        }),
      });
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

  const resetAll = () => {
    setFile(null);
    setPreviewData(null);
    setResults(null);
    setUploadProgress(0);
  };

  // ==================== RÉSULTATS ====================
  if (results) {
    return (
      <div className="space-y-6" data-testid="import-results">
        <div className="flex items-center gap-3">
          <Siren className="h-8 w-8 text-red-600" />
          <div>
            <h2 className="text-xl font-bold">Import d'historique</h2>
            <p className="text-sm text-gray-500">Résultat de l'import</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="text-green-500" /> Import terminé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-green-600" data-testid="import-created-count">{results.created}</div>
                <div className="text-sm text-gray-600">
                  {previewData?.type === 'dossier_adresse' ? 'Dossiers importés' : 'Interventions créées'}
                </div>
              </div>
              {results.files_uploaded > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-3xl font-bold text-blue-600">{results.files_uploaded}</div>
                  <div className="text-sm text-gray-600">Fichiers uploadés</div>
                </div>
              )}
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <div className="text-3xl font-bold text-red-600">{results.errors?.length || 0}</div>
                <div className="text-sm text-gray-600">Erreurs</div>
              </div>
            </div>
            {results.message && (
              <p className="mt-4 text-sm text-gray-600 text-center">{results.message}</p>
            )}
            <div className="mt-6 flex justify-center">
              <Button data-testid="import-interventions-reset" onClick={resetAll}>
                Nouvel import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==================== FORMULAIRE D'IMPORT ====================
  return (
    <div className="space-y-6" data-testid="import-interventions">
      <div className="flex items-center gap-3">
        <Siren className="h-8 w-8 text-red-600" />
        <div>
          <h2 className="text-xl font-bold">Import d'historique d'interventions</h2>
          <p className="text-sm text-gray-500">
            Importez depuis un fichier CSV, XML ou ZIP (ProFireManager). Les gros fichiers sont uploadés par morceaux.
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
                  <><RefreshCw className="animate-spin mr-2" size={16} /> {isLargeFile ? `Upload ${uploadProgress}%` : 'Analyse...'}</>
                ) : (
                  <><Upload className="mr-2" size={16} /> Analyser le fichier</>
                )}
              </Button>
            )}
          </div>
          {file && (
            <div className="mt-3 text-sm text-gray-500">
              Taille: {(file.size / (1024 * 1024)).toFixed(1)} Mo
              {isLargeFile && <span className="ml-2 text-purple-600 font-medium">(upload par morceaux)</span>}
            </div>
          )}
          {uploading && isLargeFile && (
            <div className="mt-3">
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-red-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                  data-testid="upload-progress-bar"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">{uploadProgress}% uploadé</p>
            </div>
          )}
          {isZip && file && !uploading && (
            <div className="mt-3 p-3 bg-purple-50 rounded-lg text-sm text-purple-800 flex items-center gap-2">
              <Archive size={16} /> Archive ZIP - tous les fichiers CSV/XML contenus seront traités, les photos/PDFs seront uploadés vers le stockage.
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
              {previewData.type === 'dossier_adresse' ? (
                /* Preview DossierAdresse */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{previewData.total}</div>
                      <div className="text-sm text-gray-600">Dossiers d'adresse</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">{previewData.files_count || 0}</div>
                      <div className="text-sm text-gray-600">Fichiers joints</div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                    <Building2 size={16} className="inline mr-2 text-blue-600" />
                    Ces dossiers seront stockés comme <strong>référence de mapping</strong>. Lors de l'import des interventions, ils serviront à relier automatiquement chaque intervention au bon bâtiment.
                  </div>
                  {previewData.preview?.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium mb-2">Aperçu :</h4>
                      <div className="border rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">ID</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Adresse</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Ville</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {previewData.preview.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-xs">{item.pfm_id}</td>
                                <td className="px-3 py-2">{item.adresse_civique}</td>
                                <td className="px-3 py-2">{item.ville}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Preview Interventions */
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{previewData.total}</div>
                      <div className="text-xs text-gray-600">Total trouvées</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{previewData.new_count}</div>
                      <div className="text-xs text-gray-600">Nouvelles</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-yellow-600">{previewData.duplicate_count}</div>
                      <div className="text-xs text-gray-600">Doublons</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">{previewData.files_count || 0}</div>
                      <div className="text-xs text-gray-600">Fichiers joints</div>
                    </div>
                  </div>

                  {/* Mapping stats */}
                  {(previewData.matched_count > 0 || previewData.unmatched_count > 0) && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
                        <LinkIcon size={16} className="text-emerald-600" />
                        <div>
                          <span className="font-bold text-emerald-700">{previewData.matched_count}</span>
                          <span className="text-sm text-emerald-600 ml-1">liée(s) à un bâtiment</span>
                        </div>
                      </div>
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                        <AlertTriangle size={16} className="text-orange-600" />
                        <div>
                          <span className="font-bold text-orange-700">{previewData.unmatched_count}</span>
                          <span className="text-sm text-orange-600 ml-1">sans correspondance</span>
                        </div>
                      </div>
                    </div>
                  )}

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

                  {/* Aperçu des données avec indicateur de mapping */}
                  {previewData.preview?.length > 0 && (
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
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Bâtiment</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {previewData.preview.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-mono text-xs">{item.external_call_id || item.pfm_id || '-'}</td>
                                <td className="px-3 py-2">{item.type_intervention || '-'}</td>
                                <td className="px-3 py-2">{item.address_full || '-'}</td>
                                <td className="px-3 py-2">{item.municipality || '-'}</td>
                                <td className="px-3 py-2 text-xs">{item.date ? new Date(item.date).toLocaleDateString('fr-CA') : '-'}</td>
                                <td className="px-3 py-2">
                                  {item.batiment_id ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs" data-testid={`match-badge-${idx}`}>
                                      <LinkIcon size={10} /> Lié
                                    </span>
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => { setPreviewData(null); }}>
              <XCircle className="mr-2" size={16} /> Annuler
            </Button>
            <Button
              onClick={handleExecute}
              disabled={executing || (previewData.type !== 'dossier_adresse' && previewData.new_count === 0)}
              data-testid="import-interventions-execute-btn"
            >
              {executing ? (
                <><RefreshCw className="animate-spin mr-2" size={16} /> Import en cours...</>
              ) : previewData.type === 'dossier_adresse' ? (
                <><CheckCircle className="mr-2" size={16} /> Importer {previewData.total} dossier(s)</>
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
