import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { apiGet } from '../utils/api';
import axios from 'axios';
import { buildApiUrl, getTenantToken } from '../utils/api';

const RapportBatimentComplet = ({ batiment, tenantSlug, onBack }) => {
  const [inspections, setInspections] = useState([]);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [batiment.id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Charger les inspections
      const inspectionsData = await apiGet(tenantSlug, '/prevention/inspections');
      const batimentInspections = inspectionsData
        .filter(i => i.batiment_id === batiment.id)
        .sort((a, b) => new Date(b.date_inspection) - new Date(a.date_inspection));
      
      setInspections(batimentInspections);

      // Charger le plan d'intervention s'il existe
      try {
        const token = getTenantToken();
        const plansResponse = await axios.get(
          buildApiUrl(tenantSlug, '/prevention/plans-intervention'),
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const batimentPlan = plansResponse.data.find(p => p.batiment_id === batiment.id);
        setPlan(batimentPlan);
      } catch (err) {
        console.log('Aucun plan d\'intervention trouvé');
      }

    } catch (error) {
      console.error('Erreur chargement données rapport:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      const token = getTenantToken();
      const response = await axios.get(
        buildApiUrl(tenantSlug, `/prevention/batiments/${batiment.id}/export-batiment-report-pdf`),
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rapport-prevention-${batiment.nom_etablissement || 'batiment'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur export PDF:', err);
      alert('L\'export PDF n\'est pas encore disponible. Utilisez la fonction d\'impression du navigateur (Ctrl+P).');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatutLabel = (statut) => {
    const labels = {
      'valide': { label: '✅ Validée', color: '#22c55e', bg: '#dcfce7' },
      'brouillon': { label: '📝 Brouillon', color: '#6b7280', bg: '#f3f4f6' },
      'absent': { label: '🟠 Absent', color: '#f97316', bg: '#ffedd5' },
      'non_disponible': { label: '🟠 Non disponible', color: '#f97316', bg: '#ffedd5' },
      'personne_mineure': { label: '🟠 Personne mineure', color: '#f97316', bg: '#ffedd5' },
    };
    return labels[statut] || { label: statut, color: '#6b7280', bg: '#f3f4f6' };
  };

  // Calculer les statistiques
  const stats = {
    total: inspections.length,
    validees: inspections.filter(i => i.statut === 'valide').length,
    enCours: inspections.filter(i => ['absent', 'non_disponible', 'personne_mineure'].includes(i.statut)).length,
    brouillons: inspections.filter(i => i.statut === 'brouillon').length,
    derniereValidee: inspections.find(i => i.statut === 'valide'),
    tauxConformite: 0
  };

  // Calculer le taux de conformité moyen
  const inspectionsAvecGrille = inspections.filter(i => i.grille_data?.elements_inspectes);
  if (inspectionsAvecGrille.length > 0) {
    const totalElements = inspectionsAvecGrille.reduce((acc, insp) => 
      acc + (insp.grille_data?.elements_inspectes?.length || 0), 0);
    const totalConformes = inspectionsAvecGrille.reduce((acc, insp) => 
      acc + (insp.grille_data?.elements_inspectes?.filter(e => e.conforme).length || 0), 0);
    stats.tauxConformite = totalElements > 0 ? Math.round((totalConformes / totalElements) * 100) : 0;
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Génération du rapport...</p>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header - ne pas imprimer les boutons */}
      <div style={{
        padding: '1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb'
      }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Button variant="outline" onClick={onBack}>
            ← Retour
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            🖨️ Imprimer
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            📄 Exporter PDF
          </Button>
        </div>
        
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
          📊 Rapport de Prévention Complet
        </h2>
      </div>

      {/* Contenu du rapport - scrollable */}
      <div style={{ flex: 1, overflow: 'auto', padding: '2rem', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          
          {/* Page de garde */}
          <section style={{ marginBottom: '3rem', textAlign: 'center', paddingBottom: '2rem', borderBottom: '3px solid #e5e7eb' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
              📊 Rapport de Prévention
            </h1>
            <h2 style={{ fontSize: '1.875rem', color: '#3b82f6', marginBottom: '2rem' }}>
              {batiment.nom_etablissement || batiment.adresse_civique}
            </h2>
            <div style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              📍 {batiment.adresse_civique}, {batiment.ville}, {batiment.province} {batiment.code_postal}
            </div>
            <div style={{ fontSize: '1rem', color: '#6b7280', marginTop: '2rem' }}>
              📅 Rapport généré le {formatDate(new Date().toISOString())}
            </div>
          </section>

          {/* Informations générales */}
          <section style={{ marginBottom: '3rem', pageBreakInside: 'avoid' }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #3b82f6',
              color: '#111827'
            }}>
              ℹ️ Informations Générales
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1.5rem'
            }}>
              <InfoCard label="Type de bâtiment" value={batiment.type_batiment || '—'} />
              <InfoCard label="Nombre d'étages" value={batiment.nombre_etages || '—'} />
              <InfoCard label="Niveau de risque" value={batiment.niveau_risque || '—'} />
              <InfoCard label="Secteur" value={batiment.secteur_nom || 'Non assigné'} />
            </div>

            {/* Propriétaire */}
            {(batiment.proprietaire_nom || batiment.proprietaire_telephone || batiment.proprietaire_email) && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
                  👤 Propriétaire / Contact
                </h4>
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}>
                  {batiment.proprietaire_nom && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Nom:</strong> {batiment.proprietaire_nom} {batiment.proprietaire_prenom}
                    </div>
                  )}
                  {batiment.proprietaire_telephone && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Téléphone:</strong> {batiment.proprietaire_telephone}
                    </div>
                  )}
                  {batiment.proprietaire_email && (
                    <div>
                      <strong>Email:</strong> {batiment.proprietaire_email}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Statistiques */}
          <section style={{ marginBottom: '3rem', pageBreakInside: 'avoid' }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #3b82f6',
              color: '#111827'
            }}>
              📈 Statistiques d'Inspection
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1.5rem'
            }}>
              <StatCard label="Total d'inspections" value={stats.total} color="#3b82f6" />
              <StatCard label="Inspections validées" value={stats.validees} color="#22c55e" />
              <StatCard label="En cours / Échouées" value={stats.enCours} color="#f97316" />
              <StatCard label="Taux de conformité moyen" value={`${stats.tauxConformite}%`} color="#8b5cf6" />
            </div>
            {stats.derniereValidee && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#dcfce7',
                border: '1px solid #22c55e',
                borderRadius: '8px'
              }}>
                <strong>✅ Dernière inspection validée:</strong> {formatDate(stats.derniereValidee.date_inspection)}
              </div>
            )}
          </section>

          {/* Plan d'intervention */}
          {plan && (
            <section style={{ marginBottom: '3rem', pageBreakInside: 'avoid' }}>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: '700',
                marginBottom: '1.5rem',
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #3b82f6',
                color: '#111827'
              }}>
                🗺️ Plan d'Intervention
              </h3>
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Statut:</strong> {plan.statut === 'valide' ? '✅ Validé' : plan.statut === 'en_revision' ? '🔍 En révision' : '📝 Brouillon'}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Date de création:</strong> {formatDate(plan.created_at)}
                </div>
                {plan.validated_at && (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>Date de validation:</strong> {formatDate(plan.validated_at)}
                  </div>
                )}
                {plan.photo_url && (
                  <div style={{ marginTop: '1rem' }}>
                    <img 
                      src={plan.photo_url} 
                      alt="Plan d'intervention"
                      style={{
                        width: '100%',
                        maxWidth: '500px',
                        borderRadius: '8px',
                        border: '2px solid #e5e7eb'
                      }}
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Historique des inspections */}
          <section style={{ marginBottom: '3rem' }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
              paddingBottom: '0.5rem',
              borderBottom: '2px solid #3b82f6',
              color: '#111827'
            }}>
              📜 Historique Complet des Inspections
            </h3>
            {inspections.length === 0 ? (
              <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                Aucune inspection enregistrée
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {inspections.map((inspection, index) => {
                  const statutInfo = getStatutLabel(inspection.statut);
                  return (
                    <div
                      key={inspection.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.5rem',
                        backgroundColor: 'white',
                        pageBreakInside: 'avoid'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div>
                          <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            📅 Inspection #{inspections.length - index}
                          </h4>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {formatDate(inspection.date_inspection)}
                          </div>
                        </div>
                        <div style={{
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          backgroundColor: statutInfo.bg,
                          color: statutInfo.color,
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          height: 'fit-content'
                        }}>
                          {statutInfo.label}
                        </div>
                      </div>

                      {inspection.observations && (
                        <div style={{
                          padding: '1rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '6px',
                          marginBottom: '1rem'
                        }}>
                          <strong>Observations:</strong> {inspection.observations}
                        </div>
                      )}

                      {inspection.grille_data?.elements_inspectes && (
                        <div>
                          <h5 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem' }}>
                            ✓ Éléments inspectés
                          </h5>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                                <th style={{ padding: '0.75rem', textAlign: 'left' }}>Élément</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center' }}>Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inspection.grille_data.elements_inspectes.map((element, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <td style={{ padding: '0.75rem' }}>{element.nom}</td>
                                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                    <span style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      backgroundColor: element.conforme ? '#dcfce7' : '#fee2e2',
                                      color: element.conforme ? '#22c55e' : '#ef4444',
                                      fontSize: '0.8rem',
                                      fontWeight: '600'
                                    }}>
                                      {element.conforme ? '✓ Conforme' : '✗ Non conforme'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                            <strong>Résumé:</strong> {inspection.grille_data.elements_inspectes.filter(e => e.conforme).length} conformes, {inspection.grille_data.elements_inspectes.filter(e => !e.conforme).length} non conformes
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Pied de page */}
          <section style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #e5e7eb', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
            <p>Rapport généré automatiquement par le système de gestion de prévention</p>
            <p>© {new Date().getFullYear()} - Confidentiel</p>
          </section>

        </div>
      </div>

      {/* Styles pour l'impression */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          
          /* Masquer tout sauf le rapport */
          body > *:not(:has(.rapport-print-content)) {
            display: none !important;
          }
          
          /* Forcer l'affichage du rapport en pleine page */
          html, body {
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          @page {
            margin: 1.5cm;
            size: A4;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
};

// Composants helpers
const InfoCard = ({ label, value }) => (
  <div style={{
    padding: '1rem',
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '8px'
  }}>
    <div style={{
      fontSize: '0.75rem',
      fontWeight: '600',
      color: '#6b7280',
      textTransform: 'uppercase',
      marginBottom: '0.5rem',
      letterSpacing: '0.05em'
    }}>
      {label}
    </div>
    <div style={{
      fontSize: '1.125rem',
      color: '#111827',
      fontWeight: '600'
    }}>
      {value}
    </div>
  </div>
);

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

export default RapportBatimentComplet;
