import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

// Lazy load map component
const SecteursMap = lazy(() => import('./SecteursMap'));

// Loading component
const LoadingComponent = () => (
  <div className="loading-component">
    <div className="loading-spinner"></div>
    <p>Chargement...</p>
  </div>
);

const GestionPreventionnistes = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [secteurs, setSecteurs] = useState([]);
  const [preventionnistes, setPreventionnistes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' ou 'secteurs'
  const [editMode, setEditMode] = useState(false);
  const [showSecteurModal, setShowSecteurModal] = useState(false);
  const [currentSecteur, setCurrentSecteur] = useState(null);
  const [pendingGeometry, setPendingGeometry] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Charger les préventionnistes avec l'endpoint dédié
      const [preventionnistesData, usersData, batimentsData, secteursData] = await Promise.all([
        apiGet(tenantSlug, '/prevention/preventionnistes'),
        apiGet(tenantSlug, '/users'),
        apiGet(tenantSlug, '/prevention/batiments'),
        apiGet(tenantSlug, '/prevention/secteurs').catch(() => [])
      ]);
      
      setUsers(usersData);
      setBatiments(batimentsData);
      setSecteurs(secteursData || []);
      
      // Enrichir les préventionnistes avec leurs stats
      const preventionnistesEnrichis = await Promise.all(
        preventionnistesData.map(async (prev) => {
          try {
            const stats = await apiGet(tenantSlug, `/prevention/preventionnistes/${prev.id}/stats`);
            return { ...prev, stats };
          } catch (error) {
            console.error(`Erreur stats pour ${prev.id}:`, error);
            return { ...prev, stats: {} };
          }
        })
      );
      
      setPreventionnistes(preventionnistesEnrichis);
      
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tenantSlug]);

  const handleRemoveAssignment = async (batimentId) => {
    try {
      await apiPut(tenantSlug, `/prevention/batiments/${batimentId}`, {
        preventionniste_assigne_id: null
      });
      
      toast({
        title: "Succès",
        description: "Assignation supprimée"
      });
      
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer l'assignation",
        variant: "destructive"
      });
    }
  };

  // Gestion des secteurs
  const handleSecteurCreate = (geometry) => {
    setPendingGeometry(geometry);
    setCurrentSecteur(null);
    setShowSecteurModal(true);
  };

  const handleSecteurClick = (secteur) => {
    setCurrentSecteur(secteur);
    setPendingGeometry(null);
    setShowSecteurModal(true);
  };

  const handleSaveSecteur = async (secteurData) => {
    try {
      let secteurId;
      let geometry;
      
      if (currentSecteur) {
        // Mise à jour - conserver la géométrie existante
        await apiPut(tenantSlug, `/prevention/secteurs/${currentSecteur.id}`, {
          ...secteurData,
          geometry: currentSecteur.geometry  // Garder la géométrie existante
        });
        secteurId = currentSecteur.id;
        geometry = currentSecteur.geometry;
        toast({
          title: "Succès",
          description: "Secteur mis à jour"
        });
      } else {
        // Création - utiliser la géométrie nouvellement dessinée
        const response = await apiPost(tenantSlug, '/prevention/secteurs', {
          ...secteurData,
          geometry: pendingGeometry
        });
        console.log('🔍 Réponse API création secteur:', response);
        secteurId = response?.id || response?._id;
        geometry = pendingGeometry;
        toast({
          title: "Succès",
          description: "Secteur créé"
        });
      }
      
      // Le champ du formulaire s'appelle preventionniste_assigne_id
      const preventionnisteId = secteurData.preventionniste_assigne_id || secteurData.preventionniste_id;
      console.log('🎯 Assignation - secteurId:', secteurId, 'preventionnisteId:', preventionnisteId, 'geometry:', geometry);
      
      // Utiliser l'endpoint backend dédié pour assigner le préventionniste au secteur
      // Cet endpoint s'occupe aussi d'assigner automatiquement tous les bâtiments du secteur
      if (preventionnisteId) {
        try {
          const response = await apiPut(tenantSlug, `/prevention/secteurs/${secteurId}/assigner`, {
            preventionniste_id: preventionnisteId,
            assigner_batiments: true
          });
          
          toast({
            title: "Assignation réussie",
            description: `Secteur et ${response.nb_batiments_assignes || 0} bâtiment(s) assignés au préventionniste`
          });
        } catch (error) {
          console.error('Erreur assignation secteur:', error);
          toast({
            title: "Avertissement",
            description: "Secteur sauvegardé mais erreur lors de l'assignation",
            variant: "warning"
          });
        }
      }
      
      // Fermer le modal et rafraîchir les données
      setShowSecteurModal(false);
      setCurrentSecteur(null);
      setPendingGeometry(null);
      
      // Rafraîchir toutes les données après l'assignation
      await fetchData();
    } catch (error) {
      console.error('Erreur sauvegarde secteur:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le secteur",
        variant: "destructive"
      });
    }
  };
  
  // Fonction pour assigner les bâtiments dans un secteur au préventionniste
  const assignBatimentsToSecteur = async (secteurId, preventionnisteId, geometry) => {
    try {
      console.log('🔍 Début assignation - secteurId:', secteurId, 'preventionnisteId:', preventionnisteId);
      console.log('🔍 Geometry:', geometry);
      console.log('🔍 Total bâtiments:', batiments.length);
      
      // Vérifier quels bâtiments sont dans le secteur (calcul côté client)
      const batimentsInSecteur = batiments.filter(batiment => {
        if (!batiment.latitude || !batiment.longitude) {
          console.log('❌ Bâtiment sans coordonnées:', batiment.nom_etablissement);
          return false;
        }
        
        // Vérifier si le point est dans le polygone
        const point = [batiment.longitude, batiment.latitude];
        const isInside = isPointInPolygon(point, geometry.coordinates[0]);
        console.log(`${isInside ? '✅' : '❌'} ${batiment.nom_etablissement}: [${point[0]}, ${point[1]}]`);
        return isInside;
      });
      
      console.log(`🎯 ${batimentsInSecteur.length} bâtiments trouvés dans le secteur:`, batimentsInSecteur.map(b => b.nom_etablissement));
      
      // Assigner chaque bâtiment au préventionniste
      let assignedCount = 0;
      for (const batiment of batimentsInSecteur) {
        try {
          await apiPut(tenantSlug, `/prevention/batiments/${batiment.id}`, {
            ...batiment,
            secteur_id: secteurId,
            preventionniste_assigne_id: preventionnisteId  // Utiliser le bon nom de champ
          });
          assignedCount++;
          console.log(`✅ Bâtiment assigné: ${batiment.nom_etablissement}`);
        } catch (err) {
          console.error(`❌ Erreur assignation ${batiment.nom_etablissement}:`, err);
        }
      }
      
      if (assignedCount > 0) {
        toast({
          title: "Assignation réussie",
          description: `${assignedCount} bâtiment(s) assigné(s) au préventionniste`
        });
      } else {
        toast({
          title: "Information",
          description: "Aucun bâtiment trouvé dans ce secteur"
        });
      }
    } catch (error) {
      console.error('Erreur assignation bâtiments:', error);
      toast({
        title: "Erreur",
        description: "Erreur lors de l'assignation des bâtiments",
        variant: "destructive"
      });
    }
  };
  
  // Fonction pour vérifier si un point est dans un polygone (algorithme ray-casting)
  const isPointInPolygon = (point, polygon) => {
    const x = point[0], y = point[1];
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  };

  const handleDeleteSecteur = async (secteurId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce secteur ?')) {
      return;
    }
    
    try {
      await apiDelete(tenantSlug, `/prevention/secteurs/${secteurId}`);
      toast({
        title: "Succès",
        description: "Secteur supprimé"
      });
      setShowSecteurModal(false);
      setCurrentSecteur(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le secteur",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="gestion-preventionnistes">
      {/* Vue d'ensemble */}
      <div className="overview-cards">
        <div className="overview-card">
          <div className="card-icon">👨‍🚒</div>
          <div className="card-content">
            <div className="card-number">{preventionnistes.length}</div>
            <div className="card-label">Préventionnistes actifs</div>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">🏢</div>
          <div className="card-content">
            <div className="card-number">{batiments.filter(b => b.preventionniste_assigne_id).length}</div>
            <div className="card-label">Bâtiments assignés</div>
          </div>
        </div>
        <div className="overview-card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <div className="card-number">{batiments.filter(b => !b.preventionniste_assigne_id).length}</div>
            <div className="card-label">Sans préventionniste</div>
          </div>
        </div>
      </div>

      {/* Toggle Vue Liste / Secteurs */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '10px', 
        margin: '20px 0',
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <button
          onClick={() => setViewMode('list')}
          style={{
            padding: '10px 20px',
            backgroundColor: viewMode === 'list' ? '#2563eb' : '#fff',
            color: viewMode === 'list' ? '#fff' : '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: viewMode === 'list' ? 'bold' : 'normal',
            transition: 'all 0.3s'
          }}
        >
          📋 Vue Liste
        </button>
        <button
          onClick={() => {
            setViewMode('secteurs');
            setEditMode(false);
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: viewMode === 'secteurs' ? '#2563eb' : '#fff',
            color: viewMode === 'secteurs' ? '#fff' : '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: viewMode === 'secteurs' ? 'bold' : 'normal',
            transition: 'all 0.3s'
          }}
        >
          🗺️ Secteurs ({secteurs.length})
        </button>
      </div>

      {/* Vue Carte */}
      {/* Vue Secteurs */}
      {viewMode === 'secteurs' && (
        <div className="secteurs-section" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>🗺️ Gestion des Secteurs Géographiques</h3>
            <button
              onClick={() => setEditMode(!editMode)}
              style={{
                padding: '8px 16px',
                backgroundColor: editMode ? '#dc2626' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {editMode ? '❌ Quitter le mode édition' : '✏️ Activer le mode édition'}
            </button>
          </div>
          
          {editMode && (
            <div style={{
              padding: '12px',
              backgroundColor: '#eff6ff',
              border: '1px solid #3b82f6',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#1e40af' }}>
                📝 Mode édition activé
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#1e40af' }}>
                <li>Cliquez sur l'icône polygone en haut à droite pour dessiner un secteur</li>
                <li>Cliquez sur l'icône crayon pour modifier un secteur existant</li>
                <li>Cliquez sur l'icône corbeille pour supprimer un secteur</li>
              </ul>
            </div>
          )}
          
          <SecteursMap
            batiments={batiments}
            secteurs={secteurs.map(s => ({
              ...s,
              preventionniste_assigne_nom: users.find(u => u.id === s.preventionniste_assigne_id)
                ? `${users.find(u => u.id === s.preventionniste_assigne_id).prenom} ${users.find(u => u.id === s.preventionniste_assigne_id).nom}`
                : null
            }))}
            center={[45.4042, -71.8929]}
            onBatimentClick={(batiment) => {
              console.log('Bâtiment cliqué:', batiment);
            }}
            onSecteurCreate={handleSecteurCreate}
            onSecteurClick={handleSecteurClick}
            editMode={editMode}
          />
          
          <p style={{ 
            marginTop: '10px', 
            fontSize: '14px', 
            color: '#666',
            textAlign: 'center'
          }}>
            {editMode ? 'Utilisez les outils en haut à droite pour créer, modifier ou supprimer des secteurs' : 'Cliquez sur un secteur pour voir ses détails'}
          </p>
          
          {/* Liste des secteurs */}
          <div style={{ marginTop: '30px' }}>
            <h4 style={{ marginBottom: '15px' }}>📋 Secteurs configurés ({secteurs.length})</h4>
            {secteurs.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                color: '#666'
              }}>
                <p>Aucun secteur créé</p>
                <p style={{ fontSize: '14px', marginTop: '8px' }}>
                  Activez le mode édition et dessinez votre premier secteur sur la carte
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                {secteurs.map(secteur => {
                  const preventionniste = users.find(u => u.id === secteur.preventionniste_assigne_id);
                  return (
                    <div
                      key={secteur.id}
                      onClick={() => handleSecteurClick(secteur)}
                      style={{
                        padding: '15px',
                        borderLeft: `4px solid ${secteur.couleur || '#3b82f6'}`,
                        backgroundColor: '#fff',
                        borderRadius: '6px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.15)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold' }}>
                        {secteur.nom}
                      </h5>
                      {secteur.description && (
                        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
                          {secteur.description}
                        </p>
                      )}
                      <div style={{ fontSize: '14px', marginTop: '8px' }}>
                        {preventionniste ? (
                          <span style={{ 
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: '#d1fae5',
                            color: '#065f46',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}>
                            👨‍🚒 {preventionniste.prenom} {preventionniste.nom}
                          </span>
                        ) : (
                          <span style={{ 
                            display: 'inline-block',
                            padding: '4px 8px',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}>
                            ⚠ Sans préventionniste
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}


      {/* Vue Liste */}
      {viewMode === 'list' && (
        <>
          {/* Liste des préventionnistes */}
          <div className="preventionnistes-section">
        <h3>👨‍🚒 Préventionnistes Actifs</h3>
        
        {preventionnistes.length === 0 ? (
          <div className="empty-state">
            <p>Aucun préventionniste assigné</p>
            <p><small>Assignez des bâtiments aux employés pour créer des préventionnistes</small></p>
          </div>
        ) : (
          <div className="preventionnistes-grid">
            {preventionnistes.map(preventionniste => {
              const batimentsAssignes = batiments.filter(b => b.preventionniste_assigne_id === preventionniste.id);
              const stats = preventionniste.stats || {};
              const secteursAssignes = secteurs.filter(s => s.preventionniste_assigne_id === preventionniste.id);
              
              return (
                <div key={preventionniste.id} className="preventionniste-card" style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}>
                  <div className="preventionniste-header" style={{ marginBottom: '1rem' }}>
                    <div className="preventionniste-info" style={{ marginBottom: '1rem' }}>
                      <h4 style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold', 
                        color: '#1e293b',
                        marginBottom: '0.5rem'
                      }}>
                        👨‍🚒 {preventionniste.prenom} {preventionniste.nom}
                      </h4>
                      <p style={{ color: '#64748b', fontSize: '0.9rem', margin: '0.25rem 0' }}>
                        📧 {preventionniste.email}
                      </p>
                      <span className="grade-badge" style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        borderRadius: '999px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        marginTop: '0.5rem'
                      }}>
                        {preventionniste.grade}
                      </span>
                    </div>
                    
                    <div className="preventionniste-stats" style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#3b82f6',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.batiments_assignes || batimentsAssignes.length}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Bâtiments
                        </div>
                      </div>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#10b981',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.secteurs_assignes || secteursAssignes.length}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Secteurs
                        </div>
                      </div>
                      <div className="stat-item" style={{ 
                        textAlign: 'center',
                        padding: '0.5rem',
                        minWidth: 0
                      }}>
                        <div className="stat-number" style={{
                          fontSize: '1.25rem',
                          fontWeight: 'bold',
                          color: '#f59e0b',
                          marginBottom: '0.25rem'
                        }}>
                          {stats.inspections_effectuees || 0}
                        </div>
                        <div className="stat-label" style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          fontWeight: '500'
                        }}>
                          Inspections
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="batiments-assignes">
                    <h5 style={{ 
                      fontSize: '1rem', 
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '0.75rem',
                      borderBottom: '2px solid #e5e7eb',
                      paddingBottom: '0.5rem'
                    }}>
                      🏢 Bâtiments assignés
                    </h5>
                    {batimentsAssignes.length === 0 ? (
                      <p className="no-batiments" style={{
                        textAlign: 'center',
                        color: '#9ca3af',
                        padding: '1rem',
                        fontStyle: 'italic'
                      }}>
                        Aucun bâtiment assigné
                      </p>
                    ) : (
                      <div className="batiments-list">
                        {batimentsAssignes.slice(0, 5).map(batiment => (
                          <div key={batiment.id} className="batiment-item" style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.75rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '6px',
                            marginBottom: '0.5rem',
                            border: '1px solid #e5e7eb',
                            gap: '0.75rem'
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontWeight: '500',
                                color: '#1e293b',
                                marginBottom: '0.25rem'
                              }}>
                                {batiment.nom_etablissement}
                              </div>
                              <div style={{
                                fontSize: '0.8rem',
                                color: '#64748b'
                              }}>
                                📍 {batiment.adresse_civique || 'Adresse non spécifiée'}
                              </div>
                            </div>
                            <button 
                              onClick={() => handleRemoveAssignment(batiment.id)}
                              className="remove-btn"
                              title="Supprimer l'assignation"
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '1.1rem',
                                cursor: 'pointer',
                                opacity: 0.6,
                                transition: 'opacity 0.2s',
                                flexShrink: 0,
                                padding: '0.25rem',
                                lineHeight: 1
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                            >
                              ❌
                            </button>
                          </div>
                        ))}
                        {batimentsAssignes.length > 5 && (
                          <p className="more-batiments" style={{
                            textAlign: 'center',
                            color: '#6b7280',
                            fontSize: '0.9rem',
                            marginTop: '0.75rem',
                            fontStyle: 'italic'
                          }}>
                            ... et {batimentsAssignes.length - 5} autre(s)
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {secteursAssignes.length > 0 && (
                    <div className="secteurs-assignes" style={{ marginTop: '1rem' }}>
                      <h5 style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600',
                        color: '#1e293b',
                        marginBottom: '0.75rem',
                        borderBottom: '2px solid #e5e7eb',
                        paddingBottom: '0.5rem'
                      }}>
                        🗺️ Secteurs assignés
                      </h5>
                      <div className="secteurs-list">
                        {secteursAssignes.map(secteur => (
                          <div key={secteur.id} style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: '#ecfdf5',
                            borderRadius: '6px',
                            marginBottom: '0.5rem',
                            border: '1px solid #a7f3d0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <span style={{ color: '#059669', fontWeight: '500' }}>
                              {secteur.nom}
                            </span>
                            {secteur.description && (
                              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                - {secteur.description}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

          {/* Bâtiments sans préventionniste */}
          <div className="batiments-section">
            <h3>⚠️ Bâtiments Sans Préventionniste</h3>
            
            {batiments.filter(b => !b.preventionniste_assigne_id).length === 0 ? (
              <div className="success-state">
                <p>✅ Tous les bâtiments ont un préventionniste assigné</p>
              </div>
            ) : (
              <div className="batiments-sans-preventionniste">
                {batiments
                  .filter(b => !b.preventionniste_assigne_id)
                  .slice(0, 10)
                  .map(batiment => (
                  <div key={batiment.id} className="batiment-sans-preventionniste">
                    <div className="batiment-details">
                      <h4>{batiment.nom_etablissement}</h4>
                      <p>{batiment.adresse_civique}, {batiment.ville}</p>
                      <span className="groupe-badge">{batiment.groupe_occupation}</span>
                    </div>
                    <div className="assign-actions">
                      <p><small>Besoin d'un préventionniste</small></p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal de configuration de secteur */}
      {showSecteurModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '20px', fontWeight: 'bold' }}>
              {currentSecteur ? '✏️ Modifier le secteur' : '📍 Nouveau secteur'}
            </h3>
            
            <SecteurForm
              secteur={currentSecteur}
              users={users.filter(u => u.role !== 'employe')}
              onSave={handleSaveSecteur}
              onDelete={currentSecteur ? () => handleDeleteSecteur(currentSecteur.id) : null}
              onCancel={() => {
                setShowSecteurModal(false);
                setCurrentSecteur(null);
                setPendingGeometry(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Formulaire de secteur

export default GestionPreventionnistes;
