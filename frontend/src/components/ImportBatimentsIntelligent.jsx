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
  Building
} from 'lucide-react';

const ImportBatimentsIntelligent = ({ tenantSlug, user, onImportComplete }) => {
  const { toast } = useToast();
  
  // États
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [resolutions, setResolutions] = useState({});
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState(null);

  // Gestion du fichier
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewData(null);
      setResolutions({});
      setResults(null);
    }
  };

  // Prévisualisation de l'import
  const handlePreview = async () => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/batiments/import/preview?similarity_threshold=0.85`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem(`${tenantSlug}_token`)}`
          },
          body: formData
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erreur lors de la prévisualisation');
      }

      const data = await response.json();
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

      toast({
        title: "Prévisualisation terminée",
        description: `${data.new_batiments} nouveaux, ${data.conflicts.length} conflits détectés`
      });
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

      const response = await apiPost(tenantSlug, '/batiments/import/execute', {
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
        
        {results.archived > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg text-sm">
            <span className="font-medium">{results.archived}</span> version(s) archivée(s) dans l'historique
          </div>
        )}

        <div className="mt-6 flex justify-center">
          <Button onClick={() => {
            setFile(null);
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
            Import CSV ou XML (Rôle d'évaluation) avec détection des doublons et géolocalisation automatique
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
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept=".csv,.xml"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label
                htmlFor="csv-upload"
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors"
              >
                <FileText size={20} />
                {file ? file.name : 'Choisir un fichier CSV ou XML'}
              </label>
              
              {file && !previewData && (
                <Button onClick={handlePreview} disabled={uploading}>
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
                  ⚠️ <span className="font-medium">{previewData.duplicates_in_file}</span> doublon(s) détecté(s) dans le fichier (ignorés)
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
