import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import axios from 'axios';
import { buildApiUrl } from '../utils/api';
import PlanInterventionBuilder from './PlanInterventionBuilder';

const PlansIntervention = ({ tenantSlug }) => {
  const [plans, setPlans] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [filterStatut, setFilterStatut] = useState('');

  useEffect(() => {
    fetchPlans();
    fetchBatiments();
  }, []);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention`),
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
      const token = localStorage.getItem('token');
      const response = await axios.get(
        buildApiUrl(`/${tenantSlug}/prevention/batiments`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
    if (!window.confirm('Approuver ce plan d\'intervention?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention/${planId}/approuver`),
        { commentaires: '' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Plan approuvé avec succès!');
      fetchPlans();
    } catch (error) {
      console.error('Erreur approbation:', error);
      alert('Erreur lors de l\'approbation');
    }
  };

  const handleRejectPlan = async (planId) => {
    const commentaires = prompt('Commentaires de rejet:');
    if (!commentaires) return;

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention/${planId}/rejeter`),
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
      const token = localStorage.getItem('token');
      await axios.post(
        buildApiUrl(`/${tenantSlug}/prevention/plans-intervention/${planId}/generer-pdf`),
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('PDF généré avec succès!');
      fetchPlans();
    } catch (error) {
      console.error('Erreur génération PDF:', error);
      alert('Erreur lors de la génération PDF');
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
    return (
      <PlanInterventionBuilder
        batimentId={selectedBatiment}
        tenantSlug={tenantSlug}
        planId={selectedPlan?.id}
        onClose={handleClosBuilder}
      />
    );
  }

  const filteredPlans = filterStatut 
    ? plans.filter(p => p.statut === filterStatut)
    : plans;

  return (
    <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
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

        <Button onClick={() => fetchPlans()} variant="outline">
          🔄 Rafraîchir
        </Button>
      </div>

      {/* Section: Créer nouveau plan */}
      <Card style={{ marginBottom: '2rem' }}>
        <CardHeader>
          <CardTitle>➕ Créer un nouveau plan d'intervention</CardTitle>
        </CardHeader>
        <CardContent>
          <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
            Sélectionnez un bâtiment pour créer son plan d'intervention
          </p>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem'
          }}>
            {batiments.map(bat => {
              const hasPlans = plans.some(p => p.batiment_id === bat.id && p.statut !== 'archive');
              return (
                <div 
                  key={bat.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    backgroundColor: hasPlans ? '#f9fafb' : 'white'
                  }}
                >
                  <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                    {bat.nom_etablissement || 'Sans nom'}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    {bat.adresse_civique}, {bat.ville}
                  </p>
                  <p style={{ fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    Risque: <strong>{bat.niveau_risque}</strong>
                  </p>
                  {hasPlans ? (
                    <span style={{ fontSize: '0.75rem', color: '#059669' }}>
                      ✅ Plan existant
                    </span>
                  ) : (
                    <Button 
                      onClick={() => handleCreatePlan(bat.id)}
                      style={{ 
                        width: '100%', 
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        zIndex: 10,
                        position: 'relative'
                      }}
                    >
                      ➕ Créer plan
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
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

                      <div style={{ 
                        display: 'flex', 
                        gap: '1rem', 
                        fontSize: '0.875rem',
                        marginTop: '0.75rem'
                      }}>
                        <span>💧 {plan.hydrants?.length || 0} hydrants</span>
                        <span>🚪 {plan.sorties?.length || 0} sorties</span>
                        <span>⚠️ {plan.matieres_dangereuses?.length || 0} mat. dang.</span>
                        <span>🚒 {plan.vehicules?.length || 0} véhicules</span>
                      </div>

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
