import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPut } from '../utils/api';

const NonConformites = ({ tenantSlug, toast, openBatimentModal }) => {
  const [nonConformites, setNonConformites] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('tous'); // tous, a_corriger, corrige
  const [filtrePriorite, setFiltrePriorite] = useState('tous'); // tous, haute, moyenne, faible

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
      await apiPut(
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end' }}>
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
