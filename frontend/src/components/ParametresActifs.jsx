import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import ConfigurationEmailsRondes from './ConfigurationEmailsRondes';
import ConfigurationEmailsBornesSeches from './ConfigurationEmailsBornesSeches';
import ConfigurationEmailsEPI from './ConfigurationEmailsEPI';
import ParametresAlertesEquipements from './ParametresAlertesEquipements';
import FormulairesInspectionConfig from './FormulairesInspectionConfig';
import ImportCSVEquipements from './ImportCSVEquipements';
import ImportCSVEPI from './ImportCSVEPI';

// ==================== ONGLET PARAMÈTRES ====================
const ParametresActifsTab = ({ tenantSlug, user }) => {
  const [loading, setLoading] = useState(false);
  const [parametres, setParametres] = useState({
    dates_tests_bornes_seches: []  // [{date: '2024-06-15', description: 'Test printemps'}]
  });
  const [nouvelleDate, setNouvelleDate] = useState('');
  const [nouvelleDescription, setNouvelleDescription] = useState('');
  
  // États pour la configuration EPI
  const [epiSettings, setEpiSettings] = useState({
    epi_jours_avance_expiration: 30,
    epi_jour_alerte_inspection_mensuelle: 20
  });

  // États pour les types d'EPI personnalisés
  const [typesEPI, setTypesEPI] = useState([]);
  const [showTypeEPIModal, setShowTypeEPIModal] = useState(false);
  const [editingTypeEPI, setEditingTypeEPI] = useState(null);
  const [newTypeEPI, setNewTypeEPI] = useState({ nom: '', icone: '🛡️', description: '' });
  const [typeEPILoading, setTypeEPILoading] = useState(false);

  useEffect(() => {
    fetchParametres();
    fetchEpiSettings();
    fetchTypesEPI();
  }, [tenantSlug]);

  const fetchTypesEPI = async () => {
    try {
      const data = await apiGet(tenantSlug, '/types-epi');
      setTypesEPI(data || []);
    } catch (error) {
      console.error('Erreur chargement types EPI:', error);
    }
  };

  const handleSaveTypeEPI = async () => {
    if (!newTypeEPI.nom.trim()) {
      alert('Le nom du type d\'EPI est requis');
      return;
    }
    
    setTypeEPILoading(true);
    try {
      if (editingTypeEPI) {
        // Mise à jour
        await apiPut(tenantSlug, `/types-epi/${editingTypeEPI.id}`, newTypeEPI);
      } else {
        // Création
        await apiPost(tenantSlug, '/types-epi', newTypeEPI);
      }
      await fetchTypesEPI();
      setShowTypeEPIModal(false);
      setEditingTypeEPI(null);
      setNewTypeEPI({ nom: '', icone: '🛡️', description: '' });
    } catch (error) {
      alert('Erreur: ' + (error.message || 'Impossible de sauvegarder'));
    } finally {
      setTypeEPILoading(false);
    }
  };

  const handleDeleteTypeEPI = async (typeId, typeName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le type "${typeName}" ?`)) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, `/types-epi/${typeId}`);
      await fetchTypesEPI();
    } catch (error) {
      alert('Erreur: ' + (error.message || 'Impossible de supprimer'));
    }
  };

  const handleEditTypeEPI = (type) => {
    setEditingTypeEPI(type);
    setNewTypeEPI({ nom: type.nom, icone: type.icone, description: type.description || '' });
    setShowTypeEPIModal(true);
  };

  const fetchParametres = async () => {
    try {
      const data = await apiGet(tenantSlug, '/actifs/parametres');
      if (data) {
        setParametres({
          dates_tests_bornes_seches: data.dates_tests_bornes_seches || []
        });
      }
    } catch (error) {
      console.error('Erreur chargement paramètres:', error);
    }
  };

  const fetchEpiSettings = async () => {
    try {
      const data = await apiGet(tenantSlug, '/epi/parametres');
      if (data) {
        setEpiSettings({
          epi_jours_avance_expiration: data.epi_jours_avance_expiration || 30,
          epi_jour_alerte_inspection_mensuelle: data.epi_jour_alerte_inspection_mensuelle || 20
        });
      }
    } catch (error) {
      console.error('Erreur chargement paramètres EPI:', error);
    }
  };

  const handleEpiSettingChange = async (field, value) => {
    setEpiSettings(prev => ({ ...prev, [field]: value }));
    
    try {
      const data = await apiGet(tenantSlug, '/epi/parametres');
      await apiPut(tenantSlug, '/epi/parametres', {
        ...data,
        [field]: value
      });
    } catch (error) {
      console.error('Erreur sauvegarde paramètre EPI:', error);
      alert('❌ Erreur lors de la sauvegarde');
    }
  };

  const ajouterDateTest = async () => {
    if (!nouvelleDate) {
      alert('Veuillez sélectionner une date');
      return;
    }

    setLoading(true);
    try {
      const nouvelleDateObj = {
        date: nouvelleDate,
        description: nouvelleDescription || 'Test planifié',
        created_at: new Date().toISOString(),
        created_by: user?.id
      };

      const nouvellesParam = {
        ...parametres,
        dates_tests_bornes_seches: [...(parametres.dates_tests_bornes_seches || []), nouvelleDateObj]
      };

      await apiPut(tenantSlug, '/actifs/parametres', nouvellesParam);
      setParametres(nouvellesParam);
      setNouvelleDate('');
      setNouvelleDescription('');
      alert('✅ Date de test ajoutée avec succès');
    } catch (error) {
      console.error('Erreur ajout date:', error);
      alert('❌ Erreur lors de l\'ajout de la date');
    } finally {
      setLoading(false);
    }
  };

  const supprimerDateTest = async (index) => {
    if (!confirm('Supprimer cette date de test ?')) return;

    setLoading(true);
    try {
      const nouvellesParam = {
        ...parametres,
        dates_tests_bornes_seches: parametres.dates_tests_bornes_seches.filter((_, i) => i !== index)
      };

      await apiPut(tenantSlug, '/actifs/parametres', nouvellesParam);
      setParametres(nouvellesParam);
      alert('✅ Date de test supprimée');
    } catch (error) {
      console.error('Erreur suppression date:', error);
      alert('❌ Erreur lors de la suppression');
    } finally {
      setLoading(false);
    }
  };

  const [selectedModule, setSelectedModule] = useState('formulaires'); // Par défaut, sélectionner Formulaires

  const modules = [
    {
      id: 'formulaires',
      icon: '📋',
      title: 'Formulaires d\'inspection',
      description: 'Créer et gérer les formulaires'
    },
    {
      id: 'vehicules',
      icon: '🚗',
      title: 'Véhicules',
      description: 'Rondes de sécurité et inventaires'
    },
    {
      id: 'eau',
      icon: '💧',
      title: 'Approvisionnement en Eau',
      description: 'Bornes sèches et tests'
    },
    {
      id: 'equipements',
      icon: '🔧',
      title: 'Matériel & Équipements',
      description: 'Alertes et notifications'
    },
    {
      id: 'epi',
      icon: '🛡️',
      title: 'Gestion EPI',
      description: 'Équipements de protection'
    }
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: '700', marginBottom: '10px', color: '#2c3e50' }}>
        ⚙️ Paramètres - Gestion des Actifs
      </h1>
      <p style={{ color: '#6B7280', marginBottom: '20px', fontSize: '14px' }}>
        Configurez les paramètres et notifications pour chaque module
      </p>
      
      {/* Cartes fixes toujours visibles - RESPONSIVE */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
        gap: '10px',
        marginBottom: '24px'
      }}>
        {modules.map(module => {
          const isActive = selectedModule === module.id;
          return (
            <div
              key={module.id}
              onClick={() => setSelectedModule(module.id)}
              style={{
                background: isActive ? '#DC2626' : 'white',
                padding: '12px',
                borderRadius: '10px',
                boxShadow: isActive ? '0 4px 12px rgba(220, 38, 38, 0.3)' : '0 2px 6px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: isActive ? '2px solid #DC2626' : '1px solid #e0e0e0',
                textAlign: 'center',
                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                minWidth: '0'
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.12)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
                }
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>
                {module.icon}
              </div>
              <h3 style={{ 
                fontSize: '13px', 
                fontWeight: '600', 
                marginBottom: '2px', 
                color: isActive ? 'white' : '#2c3e50',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {module.title}
              </h3>
              <p style={{ 
                fontSize: '11px', 
                color: isActive ? 'rgba(255,255,255,0.9)' : '#6B7280', 
                margin: 0,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {module.description}
              </p>
            </div>
          );
        })}
      </div>

      
      {/* ========== MODULE FORMULAIRES D'INSPECTION ========== */}
      {selectedModule === 'formulaires' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📋</span>
            Formulaires d'inspection
          </h2>
          <p style={{ color: '#6B7280', marginBottom: '0', fontSize: '13px' }}>
            Créez, personnalisez et gérez tous vos formulaires d'inspection pour les EPI, équipements, véhicules et points d'eau.
          </p>
        </div>

        {/* Composant principal des formulaires */}
        <div style={{ 
          background: 'white', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <FormulairesInspectionConfig />
        </div>
      </div>
      )}

      {/* Contenu du module sélectionné */}
      {selectedModule === 'vehicules' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🚗</span>
            Véhicules
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des rondes de sécurité et inventaires
          </p>
        </div>

        {/* Sous-section: Notifications Rondes */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <ConfigurationEmailsRondes tenantSlug={tenantSlug} />
        </div>
      </div>
      )}

      {/* ========== MODULE APPROVISIONNEMENT EN EAU ========== */}
      {selectedModule === 'eau' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>💧</span>
            Approvisionnement en Eau
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des dates de tests et notifications pour les bornes sèches
          </p>
        </div>

        {/* Sous-section: Dates de Tests */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔥</span> Dates de Tests - Bornes Sèches
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Configurez les dates auxquelles les tests des bornes sèches doivent être effectués
          </p>

          {/* Formulaire d'ajout - RESPONSIVE */}
          <div style={{ 
            background: '#f8f9fa', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '15px',
            border: '1px solid #dee2e6'
          }}>
            <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: '#34495e' }}>
              Ajouter une nouvelle date
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ flex: '1 1 140px', minWidth: '140px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#555' }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    value={nouvelleDate}
                    onChange={(e) => setNouvelleDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #ced4da',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div style={{ flex: '2 1 180px', minWidth: '150px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: '#555' }}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={nouvelleDescription}
                    onChange={(e) => setNouvelleDescription(e.target.value)}
                    placeholder="Ex: Test printemps..."
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #ced4da',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <button
                onClick={ajouterDateTest}
                disabled={loading || !nouvelleDate}
                style={{
                  padding: '10px 16px',
                  background: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: loading || !nouvelleDate ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  opacity: loading || !nouvelleDate ? 0.6 : 1,
                  width: '100%'
                }}
              >
                {loading ? 'Ajout...' : '+ Ajouter la date'}
              </button>
            </div>
          </div>

          {/* Liste des dates configurées */}
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px', color: '#34495e' }}>
              Dates planifiées
            </h4>
            {!parametres.dates_tests_bornes_seches || parametres.dates_tests_bornes_seches.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '25px', 
                background: '#f8f9fa', 
                borderRadius: '6px',
                color: '#7f8c8d'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📅</div>
                <p style={{ margin: 0, fontSize: '12px' }}>Aucune date configurée</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {parametres.dates_tests_bornes_seches
                  .sort((a, b) => new Date(a.date) - new Date(b.date))
                  .map((dateTest, index) => {
                    const dateObj = new Date(dateTest.date);
                    const estPasse = dateObj < new Date();
                    const estProche = !estPasse && (dateObj - new Date()) < (30 * 24 * 60 * 60 * 1000);

                    return (
                      <div 
                        key={index}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          gap: '8px',
                          background: estPasse ? '#fff3cd' : estProche ? '#d1ecf1' : 'white',
                          border: `1px solid ${estPasse ? '#ffc107' : estProche ? '#0dcaf0' : '#dee2e6'}`,
                          borderRadius: '6px'
                        }}
                      >
                        <div style={{ flex: '1 1 200px', minWidth: '150px' }}>
                          <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '2px', color: '#2c3e50' }}>
                            📅 {new Date(dateTest.date).toLocaleDateString('fr-FR', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </div>
                          <div style={{ fontSize: '12px', color: '#6c757d' }}>
                            {dateTest.description}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {estPasse && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#ffc107',
                              color: '#000',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              Passé
                            </span>
                          )}
                          {estProche && !estPasse && (
                            <span style={{
                              padding: '2px 8px',
                              background: '#0dcaf0',
                              color: '#000',
                              borderRadius: '10px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              Proche
                            </span>
                          )}
                          <button
                            onClick={() => supprimerDateTest(index)}
                            disabled={loading}
                            style={{
                              padding: '6px 10px',
                              background: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: loading ? 'not-allowed' : 'pointer',
                              fontSize: '12px',
                              opacity: loading ? 0.6 : 1
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Sous-section: Notifications Défauts */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 25px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <ConfigurationEmailsBornesSeches tenantSlug={tenantSlug} />
        </div>
      </div>
      )}

      {/* ========== MODULE MATÉRIEL & ÉQUIPEMENTS ========== */}
      {selectedModule === 'equipements' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🔧</span>
            Matériel & Équipements
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des alertes et notifications pour les équipements
          </p>
        </div>
        
        {/* Sous-section: Notifications - Sans titre dupliqué */}
        {/* Sous-section: Configuration des alertes */}
        <ParametresAlertesEquipements tenantSlug={tenantSlug} user={user} />

        {/* Sous-section: Import CSV */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginTop: '15px'
        }}>
          <ImportCSVEquipements 
            tenantSlug={tenantSlug} 
            onImportComplete={(results) => {
              console.log('Import terminé:', results);
            }}
          />
        </div>
      </div>
      )}

      {/* ========== MODULE GESTION EPI ========== */}
      {selectedModule === 'epi' && (
      <div style={{ 
        background: '#f8f9fa', 
        padding: 'clamp(16px, 4vw, 30px)', 
        borderRadius: '12px', 
        border: '2px solid #e0e0e0',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', fontWeight: '700', marginBottom: '8px', color: '#2c3e50', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🛡️</span>
            Gestion EPI
          </h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
            Configuration des alertes et notifications pour les équipements de protection
          </p>
        </div>

        {/* Sous-section: Configuration des Alertes */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔔</span> Configuration des Alertes EPI
          </h3>
          <p style={{ color: '#7f8c8d', marginBottom: '12px', fontSize: '12px' }}>
            Définir les délais pour les alertes automatiques
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {/* Alerte expiration pour admins/superviseurs */}
            <div style={{ 
              padding: 'clamp(10px, 2vw, 15px)',
              background: '#fff3cd',
              borderRadius: '8px',
              border: '1px solid #ffc107'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>👑</span>
                <Label style={{ fontSize: '14px', fontWeight: '600', color: '#856404', margin: 0 }}>
                  Alerte expiration EPI (Admins)
                </Label>
              </div>
              <p style={{ fontSize: '11px', color: '#856404', marginBottom: '10px' }}>
                Notification X jours avant l&apos;expiration d&apos;un EPI
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Input
                  type="number"
                  min="1"
                  max="180"
                  value={epiSettings.epi_jours_avance_expiration}
                  onChange={(e) => handleEpiSettingChange('epi_jours_avance_expiration', parseInt(e.target.value))}
                  style={{ 
                    width: '80px',
                    padding: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#856404' }}>
                  jours avant échéance
                </span>
              </div>
              <small style={{ fontSize: '10px', color: '#856404', display: 'block', marginTop: '8px', fontStyle: 'italic' }}>
                💡 Ex: 30 jours = notif le 1er mars pour expiration le 31 mars
              </small>
            </div>

            {/* Alerte inspection mensuelle pour tous les utilisateurs */}
            <div style={{ 
              padding: 'clamp(10px, 2vw, 15px)',
              background: '#d1ecf1',
              borderRadius: '8px',
              border: '1px solid #0dcaf0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px' }}>👥</span>
                <Label style={{ fontSize: '14px', fontWeight: '600', color: '#055160', margin: 0 }}>
                  Alerte inspection mensuelle (Tous)
                </Label>
              </div>
              <p style={{ fontSize: '11px', color: '#055160', marginBottom: '10px' }}>
                Tous les utilisateurs seront notifiés le X du mois s&apos;ils n&apos;ont pas effectué leur inspection mensuelle
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#055160' }}>
                  Le
                </span>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={epiSettings.epi_jour_alerte_inspection_mensuelle}
                  onChange={(e) => handleEpiSettingChange('epi_jour_alerte_inspection_mensuelle', parseInt(e.target.value))}
                  style={{ 
                    width: '70px',
                    padding: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                />
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#055160' }}>
                  de chaque mois
                </span>
              </div>
              <small style={{ fontSize: '10px', color: '#055160', display: 'block', marginTop: '8px', fontStyle: 'italic' }}>
                💡 Si non fait avant ce jour, notification envoyée
              </small>
            </div>
          </div>
        </div>

        {/* Sous-section: Catégories d'EPI */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 20px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0',
          marginBottom: '15px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '5px', color: '#34495e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📦</span> Catégories d&apos;EPI
              </h3>
              <p style={{ color: '#7f8c8d', margin: 0, fontSize: '12px' }}>
                Gérez les types d&apos;équipements de protection disponibles
              </p>
            </div>
            <Button
              onClick={() => {
                setEditingTypeEPI(null);
                setNewTypeEPI({ nom: '', icone: '🛡️', description: '' });
                setShowTypeEPIModal(true);
              }}
              style={{ background: '#10B981', color: 'white', fontSize: '13px', padding: '8px 16px' }}
            >
              ➕ Nouveau type
            </Button>
          </div>

          {/* Liste des types d'EPI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {typesEPI.length === 0 ? (
              <p style={{ color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                Chargement des types d&apos;EPI...
              </p>
            ) : (
              typesEPI.map(type => (
                <div
                  key={type.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 16px',
                    background: type.est_defaut ? '#f0f9ff' : '#f9fafb',
                    borderRadius: '8px',
                    border: type.est_defaut ? '1px solid #bae6fd' : '1px solid #e5e7eb',
                    gap: '10px'
                  }}
                >
                  {/* Ligne 1: Icône, Nom, Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '24px', flexShrink: 0 }}>{type.icone}</span>
                    <p style={{ fontWeight: '600', color: '#1f2937', margin: 0, fontSize: '14px', flex: 1, minWidth: 0 }}>
                      {type.nom}
                    </p>
                    {type.est_defaut && (
                      <span style={{ 
                        fontSize: '10px', 
                        background: '#0ea5e9', 
                        color: 'white', 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}>
                        Par défaut
                      </span>
                    )}
                  </div>
                  
                  {/* Ligne 2: Description (si présente) */}
                  {type.description && (
                    <p style={{ color: '#6b7280', margin: 0, fontSize: '12px', paddingLeft: '34px' }}>{type.description}</p>
                  )}
                  
                  {/* Ligne 3: Boutons */}
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditTypeEPI(type)}
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                    >
                      ✏️ Modifier
                    </Button>
                    {!type.est_defaut && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteTypeEPI(type.id, type.nom)}
                        style={{ fontSize: '12px', padding: '6px 10px', color: '#ef4444', borderColor: '#fca5a5' }}
                      >
                        🗑️
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal création/édition type EPI */}
        {showTypeEPIModal && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px'
            }}
            onClick={() => setShowTypeEPIModal(false)}
          >
            <div 
              style={{
                background: 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '100%',
                maxWidth: '450px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px', color: '#1f2937' }}>
                {editingTypeEPI ? '✏️ Modifier le type d\'EPI' : '➕ Nouveau type d\'EPI'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <Label style={{ marginBottom: '6px', display: 'block' }}>Nom du type *</Label>
                  <Input
                    value={newTypeEPI.nom}
                    onChange={e => setNewTypeEPI({...newTypeEPI, nom: e.target.value})}
                    placeholder="Ex: Harnais, Lunettes, etc."
                  />
                </div>
                
                <div>
                  <Label style={{ marginBottom: '6px', display: 'block' }}>Icône (emoji)</Label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                      value={newTypeEPI.icone}
                      onChange={e => setNewTypeEPI({...newTypeEPI, icone: e.target.value})}
                      style={{ width: '80px', textAlign: 'center', fontSize: '20px' }}
                    />
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {['🛡️', '🪢', '👓', '🦺', '🎒', '🧯', '⛑️', '🥽'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => setNewTypeEPI({...newTypeEPI, icone: emoji})}
                          style={{
                            padding: '6px',
                            fontSize: '18px',
                            background: newTypeEPI.icone === emoji ? '#dbeafe' : '#f3f4f6',
                            border: newTypeEPI.icone === emoji ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label style={{ marginBottom: '6px', display: 'block' }}>Description (optionnel)</Label>
                  <Input
                    value={newTypeEPI.description}
                    onChange={e => setNewTypeEPI({...newTypeEPI, description: e.target.value})}
                    placeholder="Brève description du type d'équipement"
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  onClick={() => setShowTypeEPIModal(false)}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSaveTypeEPI}
                  disabled={typeEPILoading}
                  style={{ background: '#10B981', color: 'white' }}
                >
                  {typeEPILoading ? '⏳ Enregistrement...' : (editingTypeEPI ? 'Mettre à jour' : 'Créer')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sous-section: Notifications Destinataires */}
        <div style={{ 
          background: 'white', 
          padding: 'clamp(12px, 3vw, 25px)', 
          borderRadius: '10px', 
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          border: '1px solid #e0e0e0'
        }}>
          <ConfigurationEmailsEPI tenantSlug={tenantSlug} />
        </div>
      </div>
      )}
    </div>
  );
};


export default ParametresActifsTab;
