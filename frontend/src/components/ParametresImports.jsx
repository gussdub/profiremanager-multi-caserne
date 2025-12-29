import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiPost } from '../utils/api';

const ParametresImports = ({ tenantSlug }) => {
  const { toast } = useToast();
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importType, setImportType] = useState('personnel');

  const handleImport = async () => {
    if (!importFile) {
      toast({ title: "Erreur", description: "Veuillez sélectionner un fichier", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('type', importType);
      await apiPost(tenantSlug, '/import/csv', formData);
      toast({ title: "✅ Import réussi" });
      setImportFile(null);
    } catch (error) {
      toast({ title: "Erreur", description: "Erreur lors de l'import", variant: "destructive" });
    }
    setImporting(false);
  };

  return (
          <div className="imports-tab">
            <div className="tab-header">
              <div>
                <h2>Imports CSV - Importation en masse</h2>
                <p>Importez vos données rapidement via des fichiers CSV</p>
              </div>
            </div>
            
            <div className="imports-content" style={{ display: 'grid', gap: '2rem', marginTop: '2rem' }}>
              {/* Import EPI */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🛡️ Import EPI (Équipements)
                </h3>
                <ImportCSVEPI 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.success_count} EPI importés avec succès`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Personnel */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  👥 Import Personnel (Employés)
                </h3>
                <ImportCSVPersonnel 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.success_count} employés importés avec succès`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Rapports */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📊 Import Rapports (Budgets/Dépenses)
                </h3>
                <ImportCSVRapports 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.created_budgets} budgets et ${results.created_depenses} dépenses créés`,
                      variant: "success"
                    });
                  }}
                />
              </div>

              {/* Import Disponibilités */}
              <div className="import-section">
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📅 Import Disponibilités
                </h3>
                <ImportCSVDisponibilites 
                  tenantSlug={tenantSlug}
                  onImportComplete={(results) => {
                    toast({
                      title: "Import terminé",
                      description: `${results.created} créées, ${results.updated} mises à jour, ${results.errors?.length || 0} erreurs`,
                      variant: results.errors?.length > 0 ? "warning" : "success"
                    });
                  }}
                />
              </div>

              {/* Note d'information */}
              <div className="imports-info-section">
                <div className="info-card" style={{
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px'
                }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600' }}>
                    💡 Guide d'utilisation
                  </h4>
                  <ul style={{ 
                    listStyle: 'disc',
                    paddingLeft: '1.5rem',
                    lineHeight: '1.8',
                    color: '#475569'
                  }}>
                    <li>Téléchargez le template CSV pour chaque type d'import</li>
                    <li>Remplissez le fichier CSV avec vos données</li>
                    <li>Mappez les colonnes de votre CSV avec les champs requis</li>
                    <li>Prévisualisez vos données avant l'import final</li>
                    <li>Les doublons sont détectés automatiquement</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

  );
};

export default ParametresImports;
