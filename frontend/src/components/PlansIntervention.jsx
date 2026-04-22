import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';
import { useConfirmDialog } from './ui/ConfirmDialog';
import PlanInterventionBuilder from './PlanInterventionBuilder';

const PlansIntervention = ({ tenantSlug, filteredBatimentId, setFilteredBatimentId }) => {
  const { confirm } = useConfirmDialog();
  const [plans, setPlans] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  console.log('🔍 PlansIntervention - tenantSlug reçu:', tenantSlug, 'Type:', typeof tenantSlug);

  useEffect(() => {
    console.log('🔄 PlansIntervention useEffect - tenantSlug:', tenantSlug);
    if (tenantSlug) {
      console.log('✅ TenantSlug valide, chargement des données...');
      fetchPlans();
      fetchBatiments();
    } else {
      console.warn('⚠️ TenantSlug undefined, skip chargement');
    }
  }, [tenantSlug]);

  const fetchPlans = async () => {
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, '/prevention/plans-intervention'),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPlans(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur chargement plans:', error);
      setLoading(false);
    }
  };

  const fetchBatiments = async () => {
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, '/prevention/batiments'),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Bâtiments chargés:', response.data);
      setBatiments(response.data);
    } catch (error) {
      console.error('Erreur chargement bâtiments:', error);
    }
  };

  const handleCreatePlan = (batimentId) => {
    console.log('handleCreatePlan appelé avec batimentId:', batimentId);
    setSelectedBatiment(batimentId);
    setShowBuilder(true);
  };

  const handleEditPlan = (plan) => {
    setSelectedPlan(plan);
    setSelectedBatiment(plan.batiment_id);
    setShowBuilder(true);
  };

  const handleClosBuilder = () => {
    setShowBuilder(false);
    setSelectedBatiment(null);
    setSelectedPlan(null);
    fetchPlans();
  };

  const handleApprovePlan = async (planId) => {
    const confirmed = await confirm({
      title: 'Approuver le plan',
      message: 'Approuver ce plan d\'intervention?',
      variant: 'success',
      confirmText: 'Approuver'
    });
    if (!confirmed) return;

    try {
      const token = getTenantToken();
      await axios.post(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${planId}/approuver`),
        { commentaires: '' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchPlans();
    } catch (error) {
      console.error('Erreur approbation:', error);
    }
  };

  const handleRejectPlan = async (planId) => {
    const commentaires = prompt('Commentaires de rejet:');
    if (!commentaires) return;

    try {
      const token = getTenantToken();
      await axios.post(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${planId}/rejeter`),
        { commentaires_rejet: commentaires },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Plan rejeté');
      fetchPlans();
    } catch (error) {
      console.error('Erreur rejet:', error);
      alert('Erreur lors du rejet');
    }
  };

  const handleGeneratePDF = async (planId) => {
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/plans-intervention/${planId}/export-pdf`),
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      
      // Utiliser iframe pour ouvrir la fenêtre d'impression (comme Planning/Remplacements)
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(url);
        }, 1000);
      };
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Erreur inconnue';
      alert(`Erreur lors de la génération du PDF: ${errorMsg}`);
    }
  };

  const getStatutBadge = (statut) => {
    const styles = {
      brouillon: { bg: '#e5e7eb', color: '#374151' },
      en_attente_validation: { bg: '#fef3c7', color: '#92400e' },
      valide: { bg: '#d1fae5', color: '#065f46' },
      rejete: { bg: '#fee2e2', color: '#991b1b' },
      archive: { bg: '#f3f4f6', color: '#6b7280' }
    };

    const labels = {
      brouillon: 'Brouillon',
      en_attente_validation: 'En attente',
      valide: 'Validé',
      rejete: 'Rejeté',
      archive: 'Archivé'
    };

    const style = styles[statut] || styles.brouillon;

    return (
      <span style={{
        backgroundColor: style.bg,
        color: style.color,
        padding: '0.25rem 0.75rem',
        borderRadius: '1rem',
        fontSize: '0.75rem',
        fontWeight: '600'
      }}>
        {labels[statut] || statut}
      </span>
    );
  };

  if (showBuilder) {
    const batiment = batiments.find(b => b.id === selectedBatiment);
    return (
      <PlanInterventionBuilder
        tenantSlug={tenantSlug}
        batiment={batiment}
        existingPlan={selectedPlan}
        onClose={handleClosBuilder}
        onSave={(plan) => {
          console.log('Plan sauvegardé:', plan);
          setSelectedPlan(plan); // Mettre à jour avec le plan sauvegardé
          // Ne pas fermer automatiquement pour permettre la soumission
          // handleClosBuilder();
        }}
      />
    );
  }

  const filteredPlans = plans.filter(p => {
    // Filtrer par statut si spécifié
    if (filterStatut && p.statut !== filterStatut) return false;
    // Filtrer par bâtiment si spécifié
    if (filteredBatimentId && p.batiment_id !== filteredBatimentId) return false;
    return true;
  });

  // Afficher un indicateur si on filtre par bâtiment
  const filteredBatiment = filteredBatimentId ? batiments.find(b => b.id === filteredBatimentId) : null;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {filteredBatiment && (
        <div style={{ 
          backgroundColor: '#eff6ff', 
          border: '2px solid #3b82f6',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>🏢 Filtré par bâtiment:</strong> {filteredBatiment.nom_etablissement || 'Sans nom'} - {filteredBatiment.adresse_civique}
          </div>
          <Button size="sm" onClick={() => setFilteredBatimentId(null)} variant="outline">
            ❌ Retirer filtre
          </Button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          🗺️ Plans d'Intervention
        </h1>
      </div>

      {/* Filtres et actions */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '2rem',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '0.875rem'
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="en_attente_validation">En attente</option>
          <option value="valide">Validé</option>
          <option value="rejete">Rejeté</option>
          <option value="archive">Archivé</option>
        </select>

        <Button 
          onClick={() => fetchPlans()} 
          variant="outline"
          style={{ 
            cursor: 'pointer', 
            pointerEvents: 'auto',
            zIndex: 10,
            position: 'relative'
          }}
        >
          🔄 Rafraîchir
        </Button>
      </div>

      {/* Section: Créer nouveau plan avec recherche prédictive */}
      <Card style={{ marginBottom: '2rem', position: 'relative', zIndex: 1 }}>
        <CardHeader>
          <CardTitle>➕ Créer un nouveau plan d'intervention</CardTitle>
        </CardHeader>
        <CardContent style={{ position: 'relative', zIndex: 100 }}>
          {batiments.length === 0 ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center',
              border: '2px dashed #d1d5db',
              borderRadius: '0.5rem',
              color: '#6b7280'
            }}>
              <p>Aucun bâtiment disponible.</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Créez d'abord des bâtiments dans la section "Bâtiments" du module Prévention.
              </p>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Recherche prédictive */}
              <input
                type="text"
                placeholder="🔍 Rechercher un bâtiment sans plan d'intervention..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '1rem 1.25rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  backgroundColor: 'white'
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
              />
              
              {/* Résultats de recherche (dropdown) */}
              {searchQuery && (() => {
                // Filtrer les bâtiments SANS plan
                const batimentsSansPlan = batiments.filter(bat => {
                  const hasPlans = plans.some(p => p.batiment_id === bat.id && p.statut !== 'archive');
                  return !hasPlans;
                });
                
                // Recherche prédictive
                const filteredBatiments = batimentsSansPlan.filter(bat => {
                  const query = searchQuery.toLowerCase();
                  const nom = (bat.nom_etablissement || '').toLowerCase();
                  const adresse = `${bat.adresse_civique || ''} ${bat.rue || ''} ${bat.ville || ''}`.toLowerCase();
                  return nom.includes(query) || adresse.includes(query);
                });
                
                return filteredBatiments.length > 0 ? (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    marginTop: '0.5rem',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                    zIndex: 200
                  }}>
                    <div style={{ 
                      padding: '0.75rem 1rem', 
                      borderBottom: '1px solid #f3f4f6',
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      fontWeight: '600'
                    }}>
                      {filteredBatiments.length} bâtiment(s) sans plan trouvé(s)
                    </div>
                    {filteredBatiments.map(bat => (
                      <div
                        key={bat.id}
                        onClick={() => {
                          handleCreatePlan(bat.id);
                          setSearchQuery('');
                        }}
                        style={{
                          padding: '1rem 1.25rem',
                          borderBottom: '1px solid #f9fafb',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          backgroundColor: 'white'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f0f9ff';
                          e.currentTarget.style.borderLeft = '4px solid #3b82f6';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'white';
                          e.currentTarget.style.borderLeft = 'none';
                        }}
                      >
                        <div style={{ 
                          fontWeight: '600',
                          fontSize: '1rem',
                          marginBottom: '0.25rem',
                          color: '#1e293b'
                        }}>
                          {bat.nom_etablissement || 'Sans nom'}
                        </div>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: '#64748b',
                          display: 'flex',
                          gap: '1rem',
                          flexWrap: 'wrap'
                        }}>
                          <span>📍 {bat.adresse_civique}, {bat.ville}</span>
                          {bat.niveau_risque && (
                            <span style={{ 
                              padding: '0.125rem 0.5rem',
                              background: bat.niveau_risque === 'Élevé' ? '#fee2e2' : bat.niveau_risque === 'Moyen' ? '#fef3c7' : '#dcfce7',
                              color: bat.niveau_risque === 'Élevé' ? '#dc2626' : bat.niveau_risque === 'Moyen' ? '#d97706' : '#16a34a',
                              borderRadius: '12px',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}>
                              Risque: {bat.niveau_risque}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 0.5rem)',
                    left: 0,
                    right: 0,
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '2rem',
                    textAlign: 'center',
                    color: '#6b7280',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    zIndex: 200
                  }}>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                      Aucun bâtiment sans plan ne correspond à "{searchQuery}"
                    </p>
                    <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#9ca3af' }}>
                      Tous les bâtiments correspondants ont déjà un plan d'intervention
                    </p>
                  </div>
                );
              })()}
              
              {!searchQuery && (
                <p style={{ 
                  marginTop: '1rem', 
                  fontSize: '0.875rem', 
                  color: '#6b7280',
                  textAlign: 'center'
                }}>
                  💡 Tapez le nom ou l'adresse d'un bâtiment pour créer son plan d'intervention
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Liste des plans existants */}
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Plans existants ({filteredPlans.length})
      </h2>

      {loading ? (
        <p>Chargement...</p>
      ) : filteredPlans.length === 0 ? (
        <Card>
          <CardContent style={{ textAlign: 'center', padding: '3rem' }}>
            <p style={{ color: '#6b7280', fontSize: '1.125rem' }}>
              Aucun plan d'intervention trouvé
            </p>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {filteredPlans.map(plan => {
            const batiment = batiments.find(b => b.id === plan.batiment_id);
            return (
              <Card key={plan.id}>
                <CardContent style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
                          {plan.numero_plan} - {batiment?.nom_etablissement || 'Bâtiment inconnu'}
                        </h3>
                        {getStatutBadge(plan.statut)}
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: '#6b7280',
                          backgroundColor: '#f3f4f6',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem'
                        }}>
                          v{plan.version}
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                        📍 {batiment?.adresse_civique}, {batiment?.ville}
                      </p>

                      {plan.distance_caserne_km && (
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          📏 Distance caserne: {plan.distance_caserne_km.toFixed(2)} km 
                          {plan.temps_acces_minutes && ` (${plan.temps_acces_minutes} min)`}
                        </p>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                      {(plan.statut === 'brouillon' || plan.statut === 'rejete') && (
                        <Button 
                          onClick={() => handleEditPlan(plan)}
                          style={{ fontSize: '0.875rem' }}
                        >
                          ✏️ Modifier
                        </Button>
                      )}

                      {plan.statut === 'en_attente_validation' && (
                        <>
                          <Button 
                            onClick={() => handleEditPlan(plan)}
                            variant="outline"
                            style={{ fontSize: '0.875rem' }}
                          >
                            👁️ Voir le plan
                          </Button>
                          <Button 
                            onClick={() => handleApprovePlan(plan.id)}
                            style={{ fontSize: '0.875rem', backgroundColor: '#10b981' }}
                          >
                            ✅ Approuver
                          </Button>
                          <Button 
                            onClick={() => handleRejectPlan(plan.id)}
                            style={{ fontSize: '0.875rem', backgroundColor: '#ef4444' }}
                          >
                            ❌ Rejeter
                          </Button>
                        </>
                      )}

                      {plan.statut === 'valide' && (
                        <>
                          <Button 
                            onClick={() => handleGeneratePDF(plan.id)}
                            style={{ fontSize: '0.875rem', backgroundColor: '#3b82f6' }}
                          >
                            📄 Générer PDF
                          </Button>
                          <Button 
                            onClick={() => handleEditPlan(plan)}
                            variant="outline"
                            style={{ fontSize: '0.875rem' }}
                          >
                            👁️ Voir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlansIntervention;
