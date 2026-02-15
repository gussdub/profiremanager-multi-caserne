import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet } from '../utils/api';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Info } from 'lucide-react';

/**
 * Composant d'import des inspections de bornes sèches depuis Excel
 * 
 * Fonctionnalités:
 * - Upload de fichiers Excel (.xlsx, .xls)
 * - Extraction automatique du nom de la borne depuis le nom du fichier
 * - Mapping intelligent des colonnes
 * - Prévisualisation avant import
 * - Affichage des résultats
 */
const ImportInspectionsBornes = ({ tenantSlug, onImportComplete }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [bornes, setBornes] = useState([]);
  const [selectedBorneId, setSelectedBorneId] = useState('');
  const [showBorneSelector, setShowBorneSelector] = useState(false);

  // Charger la liste des bornes pour la sélection manuelle
  useEffect(() => {
    const fetchBornes = async () => {
      try {
        const data = await apiGet(tenantSlug, '/points-eau');
        setBornes(data || []);
      } catch (err) {
        console.error('Erreur chargement bornes:', err);
      }
    };
    fetchBornes();
  }, [tenantSlug]);

  // Charger les infos de preview (colonnes attendues)
  useEffect(() => {
    const fetchPreviewInfo = async () => {
      try {
        const data = await apiGet(tenantSlug, '/import/inspections-bornes-seches/preview');
        setPreviewInfo(data);
      } catch (err) {
        console.error('Erreur chargement preview:', err);
      }
    };
    fetchPreviewInfo();
  }, [tenantSlug]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
        setError('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)');
        return;
      }
      setFile(selectedFile);
      setError(null);
      setResult(null);
      
      // Extraire le nom de la borne depuis le nom du fichier
      const nomExtrait = extractBorneName(selectedFile.name);
      console.log('Nom de borne extrait:', nomExtrait);
    }
  };

  const extractBorneName = (filename) => {
    // Retirer l'extension
    let name = filename.replace(/\.(xlsx|xls)$/i, '');
    
    // Patterns pour extraire le nom
    const patterns = [
      /^([^-]+)\s*-/,          // "Nom - Suite..." -> "Nom"
      /^([^_]+)_/,              // "Nom_suite..." -> "Nom"
    ];
    
    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return name.trim();
  };

  const handleImport = async () => {
    if (!file) {
      setError('Veuillez sélectionner un fichier');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (selectedBorneId) {
        formData.append('borne_id', selectedBorneId);
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/import/inspections-bornes-seches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Gérer l'erreur de borne non trouvée
        if (response.status === 404 && data.detail?.bornes_disponibles) {
          setError({
            type: 'borne_not_found',
            message: data.detail.message,
            nomExtrait: data.detail.nom_extrait,
            bornesDisponibles: data.detail.bornes_disponibles,
            suggestion: data.detail.suggestion
          });
          setShowBorneSelector(true);
        } else {
          setError(data.detail || 'Erreur lors de l\'import');
        }
        return;
      }

      setResult(data);
      setFile(null);
      setSelectedBorneId('');
      setShowBorneSelector(false);
      
      if (onImportComplete) {
        onImportComplete(data);
      }
    } catch (err) {
      console.error('Erreur import:', err);
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setSelectedBorneId('');
    setShowBorneSelector(false);
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      overflow: 'hidden'
    }}>
      {/* En-tête */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)'
      }}>
        <h3 style={{
          margin: 0,
          color: 'white',
          fontSize: '1.25rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <FileSpreadsheet size={24} />
          Import Inspections Bornes Sèches
        </h3>
        <p style={{
          margin: '0.5rem 0 0',
          color: 'rgba(255,255,255,0.8)',
          fontSize: '0.875rem'
        }}>
          Importez vos inspections historiques depuis un fichier Excel
        </p>
      </div>

      {/* Contenu */}
      <div style={{ padding: '1.5rem' }}>
        {/* Instructions */}
        <div style={{
          padding: '1rem',
          background: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem'
          }}>
            <Info size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: '600', color: '#b91c1c', fontSize: '0.875rem' }}>
                Comment ça fonctionne?
              </p>
              <ul style={{
                margin: '0.5rem 0 0',
                paddingLeft: '1.25rem',
                color: '#b91c1c',
                fontSize: '0.8rem',
                lineHeight: '1.6'
              }}>
                <li>Le <strong>nom de la borne</strong> est extrait automatiquement du nom du fichier</li>
                <li>Exemple: <code style={{ background: '#fee2e2', padding: '2px 6px', borderRadius: '4px' }}>Darby - Fiche technique.xlsx</code> → Borne "Darby"</li>
                <li>Les valeurs "Conforme", "Non conforme" et "N/A" sont reconnues automatiquement</li>
                <li>Format supporté: Export Google Forms ou Excel standard</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Zone de sélection du fichier */}
        {!result && (
          <>
            <div
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                background: file ? '#f0fdf4' : '#f9fafb',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '1rem'
              }}
              onClick={() => document.getElementById('excel-file-input').click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.background = '#eff6ff';
              }}
              onDragLeave={(e) => {
                e.currentTarget.style.borderColor = '#d1d5db';
                e.currentTarget.style.background = file ? '#f0fdf4' : '#f9fafb';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) {
                  handleFileChange({ target: { files: [droppedFile] } });
                }
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              <input
                id="excel-file-input"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              
              {file ? (
                <div>
                  <CheckCircle size={48} color="#10b981" style={{ marginBottom: '0.75rem' }} />
                  <p style={{ margin: 0, fontWeight: '600', color: '#10b981', fontSize: '1rem' }}>
                    {file.name}
                  </p>
                  <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.8rem' }}>
                    Borne détectée: <strong>{extractBorneName(file.name)}</strong>
                  </p>
                  <p style={{ margin: '0.25rem 0 0', color: '#9ca3af', fontSize: '0.75rem' }}>
                    Cliquez pour changer de fichier
                  </p>
                </div>
              ) : (
                <div>
                  <Upload size={48} color="#9ca3af" style={{ marginBottom: '0.75rem' }} />
                  <p style={{ margin: 0, fontWeight: '600', color: '#374151' }}>
                    Glissez votre fichier Excel ici
                  </p>
                  <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                    ou cliquez pour sélectionner
                  </p>
                  <p style={{ margin: '0.5rem 0 0', color: '#9ca3af', fontSize: '0.75rem' }}>
                    Formats acceptés: .xlsx, .xls
                  </p>
                </div>
              )}
            </div>

            {/* Sélection manuelle de la borne (si erreur ou choix) */}
            {showBorneSelector && (
              <div style={{
                padding: '1rem',
                background: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #fcd34d',
                marginBottom: '1rem'
              }}>
                <p style={{ margin: '0 0 0.75rem', fontWeight: '600', color: '#92400e', fontSize: '0.875rem' }}>
                  Sélectionnez la borne manuellement:
                </p>
                <select
                  value={selectedBorneId}
                  onChange={(e) => setSelectedBorneId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    background: 'white'
                  }}
                >
                  <option value="">-- Choisir une borne --</option>
                  {bornes.map(borne => (
                    <option key={borne.id} value={borne.id}>
                      {borne.nom || borne.numero_identification} ({borne.type || 'borne_seche'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Afficher l'erreur */}
            {error && (
              <div style={{
                padding: '1rem',
                background: '#fef2f2',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                marginBottom: '1rem'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem'
                }}>
                  <AlertCircle size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    {typeof error === 'string' ? (
                      <p style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontWeight: '600', color: '#dc2626', fontSize: '0.875rem' }}>
                          {error.message}
                        </p>
                        {error.nomExtrait && (
                          <p style={{ margin: '0.25rem 0 0', color: '#991b1b', fontSize: '0.8rem' }}>
                            Nom extrait du fichier: <strong>{error.nomExtrait}</strong>
                          </p>
                        )}
                        {error.suggestion && (
                          <p style={{ margin: '0.25rem 0 0', color: '#b91c1c', fontSize: '0.8rem' }}>
                            {error.suggestion}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Boutons d'action */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              {(file || error) && (
                <Button
                  variant="outline"
                  onClick={resetForm}
                  disabled={loading}
                >
                  Annuler
                </Button>
              )}
              <Button
                onClick={handleImport}
                disabled={loading || !file}
                style={{
                  background: loading || !file ? '#d1d5db' : '#dc2626',
                  color: 'white'
                }}
              >
                {loading ? (
                  <>
                    <span className="animate-spin" style={{ marginRight: '0.5rem' }}>⏳</span>
                    Import en cours...
                  </>
                ) : (
                  <>
                    <Upload size={18} style={{ marginRight: '0.5rem' }} />
                    Importer les inspections
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Résultat de l'import */}
        {result && (
          <div style={{
            padding: '1.5rem',
            background: result.imported_count > 0 ? '#f0fdf4' : '#fef2f2',
            borderRadius: '12px',
            border: `1px solid ${result.imported_count > 0 ? '#86efac' : '#fecaca'}`
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '1rem'
            }}>
              {result.imported_count > 0 ? (
                <CheckCircle size={32} color="#10b981" />
              ) : (
                <AlertCircle size={32} color="#ef4444" />
              )}
              <div>
                <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                  {result.imported_count > 0 ? 'Import réussi!' : 'Aucune inspection importée'}
                </h4>
                <p style={{ margin: '0.25rem 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                  {result.message}
                </p>
              </div>
            </div>

            {/* Statistiques */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#10b981' }}>
                  {result.imported_count}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Importées</div>
              </div>
              <div style={{
                padding: '1rem',
                background: 'white',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: result.errors_count > 0 ? '#ef4444' : '#9ca3af' }}>
                  {result.errors_count}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Erreurs</div>
              </div>
            </div>

            {/* Borne concernée */}
            {result.borne && (
              <div style={{
                padding: '0.75rem',
                background: 'white',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>Borne: </span>
                <strong style={{ color: '#111827' }}>{result.borne.nom}</strong>
              </div>
            )}

            {/* Erreurs détaillées */}
            {result.errors && result.errors.length > 0 && (
              <div style={{
                padding: '0.75rem',
                background: '#fef2f2',
                borderRadius: '8px',
                marginBottom: '1rem'
              }}>
                <p style={{ margin: '0 0 0.5rem', fontWeight: '600', color: '#dc2626', fontSize: '0.8rem' }}>
                  Erreurs détectées:
                </p>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: '#991b1b' }}>
                  {result.errors.map((err, idx) => (
                    <li key={idx}>Ligne {err.ligne}: {err.erreur}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bouton pour nouvel import */}
            <Button
              onClick={resetForm}
              style={{
                width: '100%',
                background: '#3b82f6',
                color: 'white'
              }}
            >
              <Upload size={18} style={{ marginRight: '0.5rem' }} />
              Importer un autre fichier
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportInspectionsBornes;
