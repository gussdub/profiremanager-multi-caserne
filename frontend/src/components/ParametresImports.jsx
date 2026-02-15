import React, { useState } from "react";
import ImportCSVEPI from "./ImportCSVEPI.jsx";
import ImportCSVEquipements from "./ImportCSVEquipements.jsx";
import ImportCSVPersonnel from "./ImportCSVPersonnel.jsx";
import ImportCSVRapports from "./ImportCSVRapports.jsx";
import ImportCSVDisponibilites from "./ImportCSVDisponibilites.jsx";
import ImportInspectionsBornes from "./ImportInspectionsBornes.jsx";
import { 
  Shield, 
  Wrench, 
  Users, 
  FileText, 
  Calendar, 
  Droplets,
  Upload,
  Info
} from "lucide-react";

/**
 * ParametresImports - Onglet d'importation avec navigation par catégories
 * Design moderne avec onglets verticaux sur desktop et horizontaux sur mobile
 */
const ParametresImports = ({ tenantSlug, toast }) => {
  const [activeTab, setActiveTab] = useState('bornes');

  // Configuration des onglets d'import
  const importTabs = [
    {
      id: 'bornes',
      label: 'Inspections Bornes',
      shortLabel: 'Bornes',
      icon: Droplets,
      color: '#3b82f6',
      description: 'Importez vos inspections historiques de bornes sèches depuis Excel'
    },
    {
      id: 'epi',
      label: 'EPI (NFPA 1851)',
      shortLabel: 'EPI',
      icon: Shield,
      color: '#10b981',
      description: 'Bunker gear, casques, gants, bottes...'
    },
    {
      id: 'equipements',
      label: 'Matériel & Équipements',
      shortLabel: 'Matériel',
      icon: Wrench,
      color: '#f59e0b',
      description: 'APRIA, masques, outils, accessoires...'
    },
    {
      id: 'personnel',
      label: 'Personnel',
      shortLabel: 'Personnel',
      icon: Users,
      color: '#8b5cf6',
      description: 'Employés et informations RH'
    },
    {
      id: 'rapports',
      label: 'Rapports & Budgets',
      shortLabel: 'Rapports',
      icon: FileText,
      color: '#ec4899',
      description: 'Budgets et dépenses'
    },
    {
      id: 'disponibilites',
      label: 'Disponibilités',
      shortLabel: 'Dispos',
      icon: Calendar,
      color: '#06b6d4',
      description: 'Disponibilités du personnel'
    }
  ];

  const activeTabConfig = importTabs.find(t => t.id === activeTab);

  // Rendu du contenu selon l'onglet actif
  const renderTabContent = () => {
    switch (activeTab) {
      case 'bornes':
        return (
          <ImportInspectionsBornes 
            tenantSlug={tenantSlug}
            onImportComplete={(results) => {
              toast({
                title: "Import terminé",
                description: `${results.imported_count} inspection(s) importée(s) pour ${results.borne?.nom || 'la borne'}`,
                variant: results.errors_count > 0 ? "warning" : "success"
              });
            }}
          />
        );
      case 'epi':
        return (
          <div className="import-content-wrapper">
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
        );
      case 'equipements':
        return (
          <div className="import-content-wrapper">
            <ImportCSVEquipements 
              tenantSlug={tenantSlug}
              onImportComplete={(results) => {
                toast({
                  title: "Import terminé",
                  description: `${results.success_count || results.created} équipements importés avec succès`,
                  variant: "success"
                });
              }}
            />
          </div>
        );
      case 'personnel':
        return (
          <div className="import-content-wrapper">
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
        );
      case 'rapports':
        return (
          <div className="import-content-wrapper">
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
        );
      case 'disponibilites':
        return (
          <div className="import-content-wrapper">
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
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ 
      minHeight: '100%',
      background: '#f8fafc'
    }}>
      {/* En-tête de la page */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        padding: '2rem',
        marginBottom: '0'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.5rem'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Upload size={24} color="white" />
          </div>
          <div>
            <h1 style={{ 
              margin: 0, 
              color: 'white', 
              fontSize: '1.5rem', 
              fontWeight: '700' 
            }}>
              Importation de données
            </h1>
            <p style={{ 
              margin: '0.25rem 0 0', 
              color: 'rgba(255,255,255,0.7)', 
              fontSize: '0.875rem' 
            }}>
              Importez vos données en masse via fichiers CSV ou Excel
            </p>
          </div>
        </div>
      </div>

      {/* Navigation par onglets (horizontal scrollable sur mobile) */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}>
        <div style={{
          display: 'flex',
          gap: '0',
          minWidth: 'max-content',
          padding: '0 1rem'
        }}>
          {importTabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '1rem 1.25rem',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderBottom: isActive ? `3px solid ${tab.color}` : '3px solid transparent',
                  color: isActive ? tab.color : '#64748b',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = tab.color;
                    e.currentTarget.style.background = `${tab.color}08`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#64748b';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <IconComponent 
                  size={18} 
                  style={{ 
                    color: isActive ? tab.color : '#94a3b8',
                    transition: 'color 0.2s ease'
                  }} 
                />
                <span className="tab-label-full" style={{
                  display: 'none'
                }}>
                  {tab.label}
                </span>
                <span className="tab-label-short">
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Description de l'onglet actif */}
      {activeTabConfig && (
        <div style={{
          background: `${activeTabConfig.color}08`,
          borderBottom: `1px solid ${activeTabConfig.color}20`,
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem'
        }}>
          <Info size={16} color={activeTabConfig.color} />
          <span style={{ 
            color: activeTabConfig.color, 
            fontSize: '0.875rem',
            fontWeight: '500'
          }}>
            {activeTabConfig.description}
          </span>
        </div>
      )}

      {/* Contenu de l'onglet actif */}
      <div style={{
        padding: '1.5rem',
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        {renderTabContent()}
      </div>

      {/* Guide d'utilisation en bas */}
      <div style={{
        padding: '1.5rem',
        maxWidth: '900px',
        margin: '0 auto'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          marginTop: '1rem'
        }}>
          <h4 style={{ 
            margin: '0 0 1rem', 
            fontSize: '1rem', 
            fontWeight: '600',
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Info size={18} color="#64748b" />
            Guide d'utilisation
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem'
          }}>
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              borderLeft: '3px solid #3b82f6'
            }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                1. Télécharger le template
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                Utilisez le modèle fourni pour chaque type d'import
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              borderLeft: '3px solid #10b981'
            }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                2. Remplir les données
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                Complétez le fichier avec vos données
              </div>
            </div>
            <div style={{
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              borderLeft: '3px solid #f59e0b'
            }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                3. Importer
              </div>
              <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                Glissez-déposez ou sélectionnez votre fichier
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CSS pour responsive */}
      <style>{`
        @media (min-width: 768px) {
          .tab-label-full {
            display: inline !important;
          }
          .tab-label-short {
            display: none !important;
          }
        }
        
        .import-content-wrapper {
          background: white;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 1.5rem;
        }
      `}</style>
    </div>
  );
};

export default ParametresImports;
