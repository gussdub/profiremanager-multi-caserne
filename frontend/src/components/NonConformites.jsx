import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPatch, apiPost, getTenantToken } from '../utils/api';

const NonConformites = ({ tenantSlug, toast, openBatimentModal }) => {
  const [nonConformites, setNonConformites] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('tous'); // tous, a_corriger, corrige
  const [filtrePriorite, setFiltrePriorite] = useState('tous'); // tous, haute, moyenne, faible
  const [exporting, setExporting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingNC, setCreatingNC] = useState(false);
  const [newNC, setNewNC] = useState({
    titre: '',
    description: '',
    categorie: '',
    priorite: 'moyenne',
    batiment_id: '',
    date_identification: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Charger les non-conformités et bâtiments depuis le backend
      const [nonConformitesData, batimentsData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/non-conformites'),
        apiGet(tenantSlug, '/prevention/batiments')
      ]);

      setBatiments(batimentsData);

      // Enrichir les non-conformités avec les données du bâtiment et calculer la priorité
      const enrichedNonConf = nonConformitesData.map(nc => {
        const batiment = batimentsData.find(b => b.id === nc.batiment_id);
        
        // Mapper la gravité backend vers priorité frontend
        let priorite = 'faible';
        if (nc.gravite === 'critique' || nc.gravite === 'eleve') {
          priorite = 'haute';
        } else if (nc.gravite === 'moyen') {
          priorite = 'moyenne';
        }
        
        // Mapper le statut backend vers statut frontend
        let statut = 'a_corriger';
        if (nc.statut === 'corrigee' || nc.statut === 'fermee') {
          statut = 'corrige';
        }
        
        return {
          ...nc,
          batiment: batiment,
          element: nc.titre || nc.section_grille,
          observations: nc.description,
          date_inspection: nc.created_at,
          priorite: priorite,
          statut: statut
        };
      });
      
      setNonConformites(enrichedNonConf);
    } catch (error) {
      console.error('Erreur chargement non-conformités:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les non-conformités",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const marquerCorrige = async (nonConformite) => {
    try {
      // Mettre à jour le statut dans le backend
      await apiPatch(
        tenantSlug, 
        `/prevention/non-conformites/${nonConformite.id}/statut`,
        {
          statut: 'corrigee',
          notes_correction: `Marquée comme corrigée via l'interface le ${new Date().toLocaleDateString('fr-FR')}`
        }
      );
      
      // Mettre à jour localement
      const updated = nonConformites.map(nc => 
        nc.id === nonConformite.id 
          ? { ...nc, statut: 'corrige' }
          : nc
      );
      setNonConformites(updated);
      
      toast({
        title: "Succès",
        description: "Non-conformité marquée comme corrigée"
      });
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive"
      });
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      
      const token = getTenantToken();
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/prevention/export-excel?type_export=non_conformites`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) throw new Error('Erreur export');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `non_conformites_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export réussi",
        description: "Le fichier Excel a été téléchargé"
      });
    } catch (error) {
      console.error('Erreur export:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getPrioriteColor = (priorite) => {
    switch(priorite) {
      case 'haute': return { bg: '#fee2e2', color: '#991b1b', label: '🔴 Haute' };
      case 'moyenne': return { bg: '#fef3c7', color: '#92400e', label: '🟡 Moyenne' };
      case 'faible': return { bg: '#dbeafe', color: '#1e3a8a', label: '🔵 Faible' };
      default: return { bg: '#f3f4f6', color: '#374151', label: priorite };
    }
  };

  const getStatutColor = (statut) => {
    return statut === 'corrige' 
      ? { bg: '#dcfce7', color: '#166534', label: '✅ Corrigé' }
      : { bg: '#fef3c7', color: '#92400e', label: '⚠️ À corriger' };
  };

  // Filtrer les non-conformités
  const nonConformitesFiltrees = nonConformites.filter(nc => {
    if (filtreStatut !== 'tous' && nc.statut !== filtreStatut) return false;
    if (filtrePriorite !== 'tous' && nc.priorite !== filtrePriorite) return false;
    return true;
  });

  // Statistiques
  const stats = {
    total: nonConformites.length,
    aCorreler: nonConformites.filter(nc => nc.statut === 'a_corriger').length,
    corriges: nonConformites.filter(nc => nc.statut === 'corrige').length,
    haute: nonConformites.filter(nc => nc.priorite === 'haute').length,
    moyenne: nonConformites.filter(nc => nc.priorite === 'moyenne').length,
    faible: nonConformites.filter(nc => nc.priorite === 'faible').length
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Chargement des non-conformités...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header avec statistiques */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          📊 Non-conformités
        </h2>
        
        {/* Stats Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem'
        }}>
          <StatCard label="Total" value={stats.total} color="#3b82f6" />
          <StatCard label="⚠️ À corriger" value={stats.aCorreler} color="#f59e0b" />
          <StatCard label="✅ Corrigés" value={stats.corriges} color="#22c55e" />
          <StatCard label="🔴 Priorité haute" value={stats.haute} color="#ef4444" />
        </div>
      </div>

      {/* Filtres */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        padding: '1rem',
        backgroundColor: '#f9fafb',
        borderRadius: '8px'
      }}>
        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
            Statut
          </label>
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="tous">Tous ({stats.total})</option>
            <option value="a_corriger">À corriger ({stats.aCorreler})</option>
            <option value="corrige">Corrigés ({stats.corriges})</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
            Priorité
          </label>
          <select
            value={filtrePriorite}
            onChange={(e) => setFiltrePriorite(e.target.value)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem'
            }}
          >
            <option value="tous">Toutes</option>
            <option value="haute">🔴 Haute ({stats.haute})</option>
            <option value="moyenne">🟡 Moyenne ({stats.moyenne})</option>
            <option value="faible">🔵 Faible ({stats.faible})</option>
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
          <Button onClick={() => setShowCreateModal(true)}>
            ➕ Créer NC
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳ Export...' : '📥 Exporter Excel'}
          </Button>
          <Button variant="outline" onClick={loadData}>
            🔄 Actualiser
          </Button>
        </div>
      </div>

      {/* Liste des non-conformités */}
      {nonConformitesFiltrees.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f9fafb',
          borderRadius: '8px'
        }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
            {filtreStatut === 'tous' && filtrePriorite === 'tous' 
              ? '🎉 Aucune non-conformité trouvée!'
              : 'Aucune non-conformité ne correspond aux filtres'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {nonConformitesFiltrees.map(nc => {
            const prioriteInfo = getPrioriteColor(nc.priorite);
            const statutInfo = getStatutColor(nc.statut);
            
            return (
              <div
                key={nc.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  transition: 'box-shadow 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                onClick={() => nc.batiment && openBatimentModal(nc.batiment)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                      {nc.element}
                    </h3>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                      🏢 {nc.batiment?.nom_etablissement || nc.batiment?.adresse_civique}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      📅 Détecté le {formatDate(nc.date_inspection)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: prioriteInfo.bg,
                      color: prioriteInfo.color,
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}>
                      {prioriteInfo.label}
                    </span>
                    <span style={{
                      padding: '0.375rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: statutInfo.bg,
                      color: statutInfo.color,
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      whiteSpace: 'nowrap'
                    }}>
                      {statutInfo.label}
                    </span>
                  </div>
                </div>

                {nc.observations && (
                  <div style={{
                    padding: '0.75rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    marginBottom: '1rem'
                  }}>
                    {nc.observations}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {nc.statut === 'a_corriger' && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        marquerCorrige(nc);
                      }}
                    >
                      ✅ Marquer comme corrigé
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      nc.batiment && openBatimentModal(nc.batiment);
                    }}
                  >
                    👁️ Voir le bâtiment
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Création NC */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: '600' }}>
                ➕ Créer une Non-Conformité
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewNC({
                    titre: '',
                    description: '',
                    categorie: '',
                    priorite: 'moyenne',
                    batiment_id: '',
                    date_identification: new Date().toISOString().split('T')[0]
                  });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Bâtiment */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Bâtiment *
                </label>
                <select
                  value={newNC.batiment_id}
                  onChange={(e) => setNewNC({...newNC, batiment_id: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Sélectionner un bâtiment...</option>
                  {batiments.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.nom_etablissement || b.adresse_civique} - {b.ville}
                    </option>
                  ))}
                </select>
              </div>

              {/* Titre */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Titre *
                </label>
                <input
                  type="text"
                  value={newNC.titre}
                  onChange={(e) => setNewNC({...newNC, titre: e.target.value})}
                  placeholder="Ex: Extincteur manquant"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Description *
                </label>
                <textarea
                  value={newNC.description}
                  onChange={(e) => setNewNC({...newNC, description: e.target.value})}
                  placeholder="Détails de la non-conformité..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Catégorie */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Catégorie *
                </label>
                <select
                  value={newNC.categorie}
                  onChange={(e) => setNewNC({...newNC, categorie: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="">Sélectionner...</option>
                  <option value="Extérieur et Accès">Extérieur et Accès</option>
                  <option value="Moyens d'Évacuation">Moyens d'Évacuation</option>
                  <option value="Protection Incendie">Protection Incendie</option>
                  <option value="Électricité">Électricité</option>
                  <option value="Chauffage et Ventilation">Chauffage et Ventilation</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              {/* Priorité */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Priorité *
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['haute', 'moyenne', 'faible'].map(p => (
                    <button
                      key={p}
                      onClick={() => setNewNC({...newNC, priorite: p})}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: `2px solid ${newNC.priorite === p ? (p === 'haute' ? '#ef4444' : p === 'moyenne' ? '#f59e0b' : '#3b82f6') : '#d1d5db'}`,
                        backgroundColor: newNC.priorite === p ? (p === 'haute' ? '#fef2f2' : p === 'moyenne' ? '#fffbeb' : '#eff6ff') : 'white',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: newNC.priorite === p ? '600' : '400',
                        color: newNC.priorite === p ? (p === 'haute' ? '#dc2626' : p === 'moyenne' ? '#d97706' : '#2563eb') : '#6b7280'
                      }}
                    >
                      {p === 'haute' ? '🔴 Haute' : p === 'moyenne' ? '🟡 Moyenne' : '🔵 Faible'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div>
                <label style={{ fontWeight: '500', fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>
                  Date d'identification
                </label>
                <input
                  type="date"
                  value={newNC.date_identification}
                  onChange={(e) => setNewNC({...newNC, date_identification: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>

              {/* Boutons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <Button
                  onClick={async () => {
                    // Validation
                    if (!newNC.batiment_id || !newNC.titre || !newNC.description || !newNC.categorie) {
                      toast({
                        title: "Erreur",
                        description: "Veuillez remplir tous les champs obligatoires",
                        variant: "destructive"
                      });
                      return;
                    }

                    try {
                      setCreatingNC(true);
                      
                      const ncData = {
                        batiment_id: newNC.batiment_id,
                        titre: newNC.titre,
                        description: newNC.description,
                        categorie: newNC.categorie,
                        priorite: newNC.priorite,
                        statut: 'ouverte',
                        date_identification: newNC.date_identification
                      };

                      await apiPost(tenantSlug, '/prevention/non-conformites', ncData);
                      
                      toast({
                        title: "Succès",
                        description: "Non-conformité créée avec succès"
                      });

                      setShowCreateModal(false);
                      setNewNC({
                        titre: '',
                        description: '',
                        categorie: '',
                        priorite: 'moyenne',
                        batiment_id: '',
                        date_identification: new Date().toISOString().split('T')[0]
                      });
                      loadData();
                    } catch (error) {
                      console.error('Erreur création NC:', error);
                      toast({
                        title: "Erreur",
                        description: "Impossible de créer la non-conformité",
                        variant: "destructive"
                      });
                    } finally {
                      setCreatingNC(false);
                    }
                  }}
                  disabled={creatingNC}
                  style={{ flex: 1 }}
                >
                  {creatingNC ? '⏳ Création...' : '✅ Créer'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewNC({
                      titre: '',
                      description: '',
                      categorie: '',
                      priorite: 'moyenne',
                      batiment_id: '',
                      date_identification: new Date().toISOString().split('T')[0]
                    });
                  }}
                  style={{ flex: 1 }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color }) => (
  <div style={{
    padding: '1.5rem',
    backgroundColor: 'white',
    border: `2px solid ${color}`,
    borderRadius: '8px',
    textAlign: 'center'
  }}>
    <div style={{
      fontSize: '2rem',
      fontWeight: 'bold',
      color: color,
      marginBottom: '0.5rem'
    }}>
      {value}
    </div>
    <div style={{
      fontSize: '0.875rem',
      color: '#6b7280',
      fontWeight: '500'
    }}>
      {label}
    </div>
  </div>
);

export default NonConformites;
