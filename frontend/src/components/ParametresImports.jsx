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
  Droplets
} from "lucide-react";

/**
 * ParametresImports - Onglet d'importation avec navigation par catégories
 * Design avec onglets style cartes (comme Gestion des Actifs)
 */
const ParametresImports = ({ tenantSlug, toast }) => {
  const [activeTab, setActiveTab] = useState('bornes');

  // Configuration des onglets d'import
  const importTabs = [
    {
      id: 'bornes',
      label: 'Inspections Bornes',
      icon: Droplets
    },
    {
      id: 'epi',
      label: 'EPI (NFPA 1851)',
      icon: Shield
    },
    {
      id: 'equipements',
      label: 'Matériel & Équipements',
      icon: Wrench
    },
    {
      id: 'personnel',
      label: 'Personnel',
      icon: Users
    },
    {
      id: 'rapports',
      label: 'Rapports & Budgets',
      icon: FileText
    },
    {
      id: 'disponibilites',
      label: 'Disponibilités',
      icon: Calendar
    }
  ];

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
    <div style={{ padding: '1.5rem' }}>
      {/* Navigation par onglets - Style cartes comme Gestion des Actifs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '0',
        marginBottom: '1.5rem',
        background: '#f1f5f9',
        borderRadius: '8px',
        overflow: 'hidden'
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
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '1rem 0.5rem',
                border: 'none',
                background: isActive ? '#dc2626' : '#f1f5f9',
                cursor: 'pointer',
                color: isActive ? 'white' : '#64748b',
                fontWeight: '500',
                fontSize: '0.8rem',
                transition: 'all 0.2s ease',
                minHeight: '80px',
                borderRight: '1px solid #e2e8f0'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#fee2e2';
                  e.currentTarget.style.color = '#dc2626';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.color = '#64748b';
                }
              }}
            >
              <IconComponent 
                size={22} 
                style={{ 
                  color: isActive ? 'white' : '#94a3b8'
                }} 
              />
              <span style={{ 
                textAlign: 'center',
                lineHeight: '1.2'
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Ligne de séparation */}
      <div style={{
        borderBottom: '2px solid #e2e8f0',
        marginBottom: '1.5rem'
      }} />

      {/* Contenu de l'onglet actif */}
      <div style={{ maxWidth: '900px' }}>
        {renderTabContent()}
      </div>

      {/* CSS pour wrapper */}
      <style>{`
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
