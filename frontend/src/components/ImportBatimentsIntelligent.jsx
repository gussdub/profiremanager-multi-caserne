import React, { useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost } from '../utils/api';
import { 
  Upload, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft,
  Trash2,
  Plus,
  FileText,
  Building,
  Archive,
  Image,
  FileIcon
} from 'lucide-react';

const ImportBatimentsIntelligent = ({ tenantSlug, user, onImportComplete }) => {
  const { toast } = useToast();
  
  // États
  const [file, setFile] = useState(null);
  const [isZip, setIsZip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState(null);

  // Upload par chunks pour les gros fichiers ZIP
  const uploadChunkedBatiment = async () => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    // 1. Init
    const initRes = await fetch(`${API_BASE}/batiments/import/init-upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, total_size: file.size, total_chunks: totalChunks }),
    });
    if (!initRes.ok) throw new Error(`Échec initialisation (HTTP ${initRes.status})`);
    const { upload_id } = await initRes.json();
    // 2. Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      const formData = new FormData();
      formData.append('upload_id', upload_id);
      formData.append('chunk_index', i.toString());
      formData.append('file', chunk, `chunk_${i}`);
      let success = false;
      for (let attempt = 0; attempt < 3 && !success; attempt++) {
        try {
          const res = await fetch(`${API_BASE}/batiments/import/upload-chunk`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData,
          });
          if (res.ok) success = true;
          else if (attempt === 2) throw new Error(`Échec chunk ${i+1}/${totalChunks}`);
          else await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        } catch (err) {
          if (attempt === 2) throw err;
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        }
      }
    }
    // 3. Finalize
    const finalRes = await fetch(`${API_BASE}/batiments/import/finalize-upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_id }),
    });
    if (!finalRes.ok) {
      let detail = 'Échec finalisation';
      try { detail = (await finalRes.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    return await finalRes.json();
  };

  // Gestion du fichier
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const isZipFile = selectedFile.name.toLowerCase().endsWith('.zip');
      setFile(selectedFile);
      setIsZip(isZipFile);
      setPreviewData(null);
      setResolutions({});
      setResults(null);
    }
  };

  // Constantes pour chunked upload
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 Mo
  const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}`;
  const getToken = () => localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');

  // Prévisualisation de l'import
  const handlePreview = async () => {
    if (!file) return;

    setUploading(true);
    try {
      let data;
      const isLargeFile = file.size > CHUNK_SIZE;

      if (isLargeFile && isZip) {
        // Chunked upload pour les gros fichiers ZIP
        data = await uploadChunkedBatiment();
      } else {
        // Upload direct pour les petits fichiers
        const formData = new FormData();
        formData.append('file', file);

        const endpoint = isZip
          ? `/batiments/import/zip/preview`
          : `/batiments/import/preview?similarity_threshold=0.85`;

        const response = await fetch(
          `${API_BASE}${endpoint}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${getToken()}`
            },
            body: formData
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || 'Erreur lors de la prévisualisation');
        }

        data = await response.json();
      }

      setPreviewData(data);
      setCurrentConflictIndex(0);
      
      // Initialiser les résolutions par défaut
      const defaultResolutions = {};
      data.conflicts.forEach((conflict, idx) => {
        defaultResolutions[idx] = {
          action: conflict.suggested_action === 'replace' ? 'replace' : 'skip',
          mergePreferences: {}
        };
      });
      setResolutions(defaultResolutions);

      const desc = isZip
        ? `${data.new_batiments} nouveaux, ${data.conflicts.length} conflits, ${data.media_files_count || 0} fichiers média`
        : `${data.new_batiments} nouveaux, ${data.conflicts.length} conflits détectés`;

      toast({ title: "Prévisualisation terminée", description: desc });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  // Mise à jour de la résolution d'un conflit
  const updateResolution = (index, action, mergePreferences = {}) => {
    setResolutions(prev => ({
      ...prev,
      [index]: { action, mergePreferences }
    }));
  };

  // Exécution de l'import
  const handleExecute = async () => {
    if (!previewData) return;

    setExecuting(true);
    try {
      const resolutionsList = Object.entries(resolutions).map(([index, res]) => ({
        import_index: parseInt(index),
        action: res.action,
        existing_batiment_id: previewData.conflicts[index]?.existing_batiment?.id,
        merge_preferences: res.mergePreferences
      }));

      const endpoint = isZip
        ? '/batiments/import/zip/execute'
        : '/batiments/import/execute';

      const response = await apiPost(tenantSlug, endpoint, {
        session_id: previewData.session_id,
        resolutions: resolutionsList,
        create_new_buildings: true
      });

      setResults(response.results);
      
      toast({
        title: "Import terminé !",
        description: response.message
      });

      if (onImportComplete) {
        onImportComplete(response.results);
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: error.message || "Erreur lors de l'import",
        variant: "destructive"
      });
    } finally {
      setExecuting(false);
    }
  };

  // Rendu de la comparaison de valeurs
  const renderValueComparison = (field, diff, conflictIndex) => {
    const resolution = resolutions[conflictIndex] || {};
    const preference = resolution.mergePreferences?.[field];
    
    return (
      <div key={field} className="border rounded-lg p-3 mb-2 bg-gray-50">
        <div className="font-medium text-sm text-gray-600 mb-2">{field}</div>
        <div className="grid grid-cols-2 gap-4">
          <div 
            className={`p-2 rounded cursor-pointer transition-all ${
              preference === 'existing' ? 'bg-blue-100 border-2 border-blue-500' : 'bg-white border border-gray-200 hover:border-blue-300'
            }`}
            onClick={() => {
              if (resolution.action === 'merge') {
                updateResolution(conflictIndex, 'merge', {
                  ...resolution.mergePreferences,
                  [field]: 'existing'
                });
              }
            }}
          >
            <div className="text-xs text-gray-500 mb-1">Existant</div>
            <div className="text-sm">{diff.old || <span className="text-gray-400 italic">Vide</span>}</div>
          </div>
          <div 
            className={`p-2 rounded cursor-pointer transition-all ${
              preference === 'new' ? 'bg-green-100 border-2 border-green-500' : 'bg-white border border-gray-200 hover:border-green-300'
            }`}
            onClick={() => {
              if (resolution.action === 'merge') {
                updateResolution(conflictIndex, 'merge', {
                  ...resolution.mergePreferences,
                  [field]: 'new'
                });
              }
            }}
          >
            <div className="text-xs text-gray-500 mb-1">Nouveau (import)</div>
            <div className="text-sm">{diff.new || <span className="text-gray-400 italic">Vide</span>}</div>
          </div>
        </div>
      </div>
    );
  };

  // Rendu d'un conflit
  const renderConflict = (conflict, index) => {
    const resolution = resolutions[index] || { action: 'skip' };
    const similarityPercent = Math.round(conflict.similarity_score * 100);
    const diffCount = Object.keys(conflict.differences || {}).length;

    return (
      <div className="bg-white rounded-lg border p-6">
        {/* En-tête du conflit */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="text-yellow-500" size={20} />
              Conflit détecté
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Correspondance: <span className="font-medium">{similarityPercent}%</span> • 
              {diffCount} différence(s)
            </p>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-500">
              {index + 1} / {previewData.conflicts.length}
            </span>
          </div>
        </div>

        {/* Adresses comparées */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-600 font-medium mb-1">BÂTIMENT EXISTANT</div>
            <div className="font-medium">{conflict.existing_batiment.adresse_civique || conflict.existing_batiment.adresse}</div>
            {conflict.existing_batiment.nom_etablissement && (
              <div className="text-sm text-gray-600">{conflict.existing_batiment.nom_etablissement}</div>
            )}
          </div>
          <div className="p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-600 font-medium mb-1">DONNÉES D'IMPORT</div>
            <div className="font-medium">{conflict.new_data.adresse_civique || conflict.new_data.adresse}</div>
            {conflict.new_data.nom_etablissement && (
              <div className="text-sm text-gray-600">{conflict.new_data.nom_etablissement}</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6">
          <div className="text-sm font-medium mb-3">Action à effectuer :</div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={resolution.action === 'replace' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateResolution(index, 'replace')}
              className="flex items-center gap-1"
            >
              <RefreshCw size={14} />
              Remplacer (archiver l'ancien)
            </Button>
            <Button
              variant={resolution.action === 'merge' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateResolution(index, 'merge', {})}
              className="flex items-center gap-1"
            >
              <ArrowRightLeft size={14} />
              Fusionner
            </Button>
            <Button
              variant={resolution.action === 'skip' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateResolution(index, 'skip')}
              className="flex items-center gap-1"
            >
              <XCircle size={14} />
              Ignorer
            </Button>
            <Button
              variant={resolution.action === 'create_new' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateResolution(index, 'create_new')}
              className="flex items-center gap-1"
            >
              <Plus size={14} />
              Créer un doublon
            </Button>
          </div>
        </div>

        {/* Différences (si fusion sélectionnée) */}
        {resolution.action === 'merge' && Object.keys(conflict.differences || {}).length > 0 && (
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-3">
              Choisissez les valeurs à conserver pour chaque champ :
            </div>
            <div className="max-h-64 overflow-y-auto">
              {Object.entries(conflict.differences).map(([field, diff]) => 
                renderValueComparison(field, diff, index)
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => setCurrentConflictIndex(index - 1)}
          >
            <ChevronLeft size={16} /> Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={index === previewData.conflicts.length - 1}
            onClick={() => setCurrentConflictIndex(index + 1)}
          >
            Suivant <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    );
  };

  // Rendu des résultats
  const renderResults = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="text-green-500" />
          Import terminé
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-green-600">{results.created}</div>
            <div className="text-sm text-gray-600">Créés</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-blue-600">{results.updated}</div>
            <div className="text-sm text-gray-600">Mis à jour</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-gray-600">{results.skipped}</div>
            <div className="text-sm text-gray-600">Ignorés</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <div className="text-3xl font-bold text-purple-600">{results.interventions_linked}</div>
            <div className="text-sm text-gray-600">Interventions liées</div>
          </div>
        </div>
        
        {/* Résultats médias (ZIP) */}
        {(results.photos_uploaded > 0 || results.documents_uploaded > 0) && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-indigo-50 p-4 rounded-lg text-center flex items-center justify-center gap-3">
              <Image size={20} className="text-indigo-600" />
              <div>
                <div className="text-2xl font-bold text-indigo-600">{results.photos_uploaded}</div>
                <div className="text-sm text-gray-600">Photos importées</div>
              </div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg text-center flex items-center justify-center gap-3">
              <FileIcon size={20} className="text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{results.documents_uploaded}</div>
                <div className="text-sm text-gray-600">Documents importés</div>
              </div>
            </div>
          </div>
        )}

        {results.archived > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-sm">
            <span className="font-medium">{results.archived}</span> version(s) archivée(s) dans l'historique
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button onClick={() => {
            setFile(null);
            setIsZip(false);
            setPreviewData(null);
            setResults(null);
            setResolutions({});
          }}>
            Nouvel import
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div className="flex items-center gap-3">
        <Building className="h-8 w-8 text-blue-600" />
        <div>
          <h2 className="text-xl font-bold">Import intelligent de bâtiments</h2>
          <p className="text-sm text-gray-500">
            Import CSV, XML (Rôle d'évaluation) ou ZIP (ProFireManager) avec détection des doublons et géolocalisation automatique
          </p>
        </div>
      </div>

      {/* Résultats finaux */}
      {results && renderResults()}

      {/* Zone de sélection de fichier */}
      {!results && (
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
                id="csv-upload"
                data-testid="import-file-input"
              />
              <label
                htmlFor="csv-upload"
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
                data-testid="import-file-label"
              >
                {isZip ? <Archive size={20} className="text-purple-600" /> : <FileText size={20} />}
                {file ? file.name : 'Choisir un fichier CSV, XML ou ZIP'}
              </label>
              
              {file && !previewData && (
                <Button onClick={handlePreview} disabled={uploading} data-testid="import-preview-btn">
                  {uploading ? (
                    <>
                      <RefreshCw className="animate-spin mr-2" size={16} />
                      Analyse...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2" size={16} />
                      Analyser le fichier
                    </>
                  )}
                </Button>
              )}
            </div>
            {isZip && file && (
              <div className="mt-3 p-3 bg-purple-50 rounded-lg text-sm text-purple-800 flex items-center gap-2">
                <Archive size={16} />
                Archive ZIP détectée - les données et les photos/documents seront importés automatiquement
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prévisualisation */}
      {previewData && !results && (
        <>
          {/* Résumé */}
          <Card>
            <CardHeader>
              <CardTitle>2. Résumé de l'analyse</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{previewData.total_rows}</div>
                  <div className="text-sm text-gray-600">Lignes totales</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">{previewData.new_batiments}</div>
                  <div className="text-sm text-gray-600">Nouveaux bâtiments</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">{previewData.conflicts.length}</div>
                  <div className="text-sm text-gray-600">Conflits à résoudre</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-red-600">{previewData.errors.length}</div>
                  <div className="text-sm text-gray-600">Erreurs</div>
                </div>
              </div>

              {previewData.duplicates_in_file > 0 && (
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                  <AlertTriangle size={14} className="inline mr-1" /> <span className="font-medium">{previewData.duplicates_in_file}</span> doublon(s) détecté(s) dans le fichier (ignorés)
                </div>
              )}

              {/* Médias ZIP */}
              {previewData.media_files_count > 0 && (
                <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm flex items-center gap-4">
                  <Archive size={18} className="text-purple-600 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{previewData.media_files_count}</span> fichier(s) média détecté(s) :
                    {previewData.media_files_images > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-indigo-700">
                        <Image size={14} /> {previewData.media_files_images} photo(s)
                      </span>
                    )}
                    {previewData.media_files_documents > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-orange-700">
                        <FileIcon size={14} /> {previewData.media_files_documents} document(s)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conflits */}
          {previewData.conflicts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>3. Résolution des conflits</CardTitle>
              </CardHeader>
              <CardContent>
                {renderConflict(previewData.conflicts[currentConflictIndex], currentConflictIndex)}
              </CardContent>
            </Card>
          )}

          {/* Bouton d'exécution */}
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setPreviewData(null);
                setResolutions({});
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleExecute} disabled={executing}>
              {executing ? (
                <>
                  <RefreshCw className="animate-spin mr-2" size={16} />
                  Import en cours...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2" size={16} />
                  Exécuter l'import
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ImportBatimentsIntelligent;
