import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Droplet, Home, Map, Users, FileText, Download, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Composant d'affichage du plan d'intervention d'un bâtiment
 * Affiche les informations critiques pour les pompiers
 */
const PlanInterventionTab = ({ batimentId, tenantSlug, onClose }) => {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    if (batimentId) {
      fetchPlanIntervention();
    }
  }, [batimentId]);

  const fetchPlanIntervention = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL;
      
      const response = await fetch(
        `${backendUrl}/api/${tenantSlug}/plan-intervention/batiment/${batimentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Erreur lors de la récupération du plan');
      
      const data = await response.json();
      
      if (data.plan_disponible) {
        setPlan(data.plan);
      } else {
        setPlan(null);
      }
    } catch (err) {
      console.error('Erreur récupération plan:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openPhotoModal = (photo, index) => {
    setSelectedPhoto(photo);
    setCurrentPhotoIndex(index);
  };

  const closePhotoModal = () => {
    setSelectedPhoto(null);
  };

  const navigatePhoto = (direction) => {
    const newIndex = direction === 'next'
      ? (currentPhotoIndex + 1) % plan.photos.length
      : (currentPhotoIndex - 1 + plan.photos.length) % plan.photos.length;
    
    setCurrentPhotoIndex(newIndex);
    setSelectedPhoto(plan.photos[newIndex]);
  };

  const handleDownloadPDF = () => {
    if (plan?.pdf_plan?.url) {
      window.open(plan.pdf_plan.url, '_blank');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Chargement...</span>
        </div>
        <p style={{ marginTop: '1rem', color: '#64748b' }}>Chargement du plan d'intervention...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <AlertTriangle size={48} color="#ef4444" />
        <p style={{ marginTop: '1rem', color: '#ef4444' }}>Erreur: {error}</p>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <FileText size={64} color="#94a3b8" style={{ margin: '0 auto' }} />
        <h3 style={{ marginTop: '1rem', color: '#475569' }}>Aucun plan d'intervention disponible</h3>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Ce bâtiment n'a pas encore de plan d'intervention importé depuis PFM Transfer.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxHeight: '80vh', overflowY: 'auto' }}>
      {/* En-tête */}
      <div style={{ 
        background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '12px',
        marginBottom: '1.5rem',
        boxShadow: '0 4px 6px rgba(220, 38, 38, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <AlertTriangle size={28} />
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>Plan d'Intervention</h2>
        </div>
        <p style={{ margin: 0, opacity: 0.9, fontSize: '1rem' }}>
          {plan.nom} • {plan.adresse_complete}
        </p>
        {plan.statut && (
          <span style={{
            display: 'inline-block',
            marginTop: '0.5rem',
            padding: '0.25rem 0.75rem',
            background: 'rgba(255,255,255,0.2)',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: '600'
          }}>
            {plan.statut} {plan.statut_rao && `• ${plan.statut_rao}`}
          </span>
        )}
      </div>

      {/* Sections d'informations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        
        {/* Identification */}
        <InfoCard
          icon={<Home size={20} />}
          title="Identification"
          color="#3b82f6"
          items={[
            { label: 'Propriétaire', value: plan.proprietaire },
            { label: 'Type d\'occupation', value: plan.type_occupation },
            { label: 'Niveau de risque', value: plan.niveau_risque, highlight: true }
          ]}
        />

        {/* Construction */}
        <InfoCard
          icon={<Home size={20} />}
          title="Construction"
          color="#f59e0b"
          items={[
            { label: 'Murs', value: plan.construction?.mur_construction },
            { label: 'Plancher', value: plan.construction?.plancher_construction },
            { label: 'Toit', value: plan.construction?.toit_construction },
            { label: 'Couverture', value: plan.construction?.toit_couverture },
            { label: 'Entretoit', value: plan.construction?.presence_entretoit ? 'OUI' : 'NON', highlight: plan.construction?.presence_entretoit }
          ]}
        />

        {/* Accès */}
        <InfoCard
          icon={<Map size={20} />}
          title="Accès"
          color="#8b5cf6"
          items={[
            { label: 'Accès principal', value: plan.acces?.acces_principal },
            { label: 'Obstruction échelle', value: plan.acces?.obstruction_echelle, highlight: !!plan.acces?.obstruction_echelle },
            { label: 'Portes extérieures', value: plan.acces?.porte_exterieur }
          ]}
        />

        {/* Personnes nécessitant assistance */}
        {plan.personnes_assistance && plan.personnes_assistance !== 'NON' && (
          <InfoCard
            icon={<Users size={20} />}
            title="Assistance"
            color="#ec4899"
            items={[
              { label: 'Personnes à assister', value: plan.personnes_assistance, highlight: true }
            ]}
          />
        )}
      </div>

      {/* CRITIQUE : Alimentation en eau */}
      {plan.alimentation_eau && (
        <div style={{
          background: plan.alimentation_eau.deficit_debit?.includes('-') ? '#fef2f2' : '#f0fdf4',
          border: `2px solid ${plan.alimentation_eau.deficit_debit?.includes('-') ? '#ef4444' : '#22c55e'}`,
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Droplet size={24} color={plan.alimentation_eau.deficit_debit?.includes('-') ? '#ef4444' : '#22c55e'} />
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '700' }}>
              Alimentation en Eau {plan.alimentation_eau.deficit_debit?.includes('-') && '⚠️ DÉFICIT'}
            </h3>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <WaterStat label="Débit requis" value={plan.alimentation_eau.debit_requis} />
            <WaterStat label="Débit disponible" value={plan.alimentation_eau.debit_disponible} />
            <WaterStat 
              label="Déficit/Surplus" 
              value={plan.alimentation_eau.deficit_debit}
              critical={plan.alimentation_eau.deficit_debit?.includes('-')}
            />
            {plan.alimentation_eau.superficie && (
              <WaterStat label="Superficie" value={plan.alimentation_eau.superficie} />
            )}
            {plan.alimentation_eau.type_construction && (
              <WaterStat label="Type construction" value={plan.alimentation_eau.type_construction} />
            )}
          </div>
        </div>
      )}

      {/* Galerie Photos / Croquis */}
      {plan.photos && plan.photos.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Map size={20} color="#3b82f6" />
            Photos et Croquis Sectoriels
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
            gap: '1rem' 
          }}>
            {plan.photos.map((photo, index) => (
              <div
                key={photo.id}
                onClick={() => openPhotoModal(photo, index)}
                style={{
                  position: 'relative',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  background: '#f1f5f9'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={photo.nom}
                    style={{
                      width: '100%',
                      height: '150px',
                      objectFit: 'cover'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '150px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#e2e8f0'
                  }}>
                    <FileText size={40} color="#94a3b8" />
                  </div>
                )}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
                  padding: '0.75rem 0.5rem 0.5rem',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  {photo.nom}
                </div>
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: 'rgba(0,0,0,0.6)',
                  borderRadius: '50%',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ZoomIn size={16} color="white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Plan complet */}
      {plan.pdf_plan && plan.pdf_plan.url && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <FileText size={32} color="#3b82f6" />
            <div>
              <p style={{ margin: 0, fontWeight: '600', fontSize: '1rem' }}>
                Plan d'intervention complet (PDF)
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                {plan.pdf_plan.nom}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadPDF}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#3b82f6'}
          >
            <Download size={18} />
            Télécharger
          </button>
        </div>
      )}

      {/* Modal Zoom Photo */}
      {selectedPhoto && (
        <div
          onClick={closePhotoModal}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '2rem'
          }}
        >
          <button
            onClick={closePhotoModal}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            <X size={24} />
          </button>

          {plan.photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigatePhoto('prev'); }}
                style={{
                  position: 'absolute',
                  left: '1rem',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                <ChevronLeft size={28} />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); navigatePhoto('next'); }}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'white',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }}
          >
            {selectedPhoto.url ? (
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.nom}
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  objectFit: 'contain',
                  borderRadius: '8px'
                }}
              />
            ) : (
              <div style={{
                width: '400px',
                height: '400px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1e293b',
                borderRadius: '8px'
              }}>
                <FileText size={80} color="#64748b" />
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: '-3rem',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.8)',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: '600',
              whiteSpace: 'nowrap'
            }}>
              {selectedPhoto.nom} ({currentPhotoIndex + 1}/{plan.photos.length})
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Composant InfoCard réutilisable
const InfoCard = ({ icon, title, color, items }) => (
  <div style={{
    background: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '1rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      <div style={{ color }}>{icon}</div>
      <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>
        {title}
      </h4>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {items.map((item, idx) => item.value && (
        <div key={idx} style={{ fontSize: '0.8125rem' }}>
          <span style={{ color: '#64748b', fontWeight: '500' }}>{item.label}: </span>
          <span style={{
            fontWeight: item.highlight ? '700' : '600',
            color: item.highlight ? '#dc2626' : '#1e293b'
          }}>
            {item.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// Composant WaterStat pour l'alimentation en eau
const WaterStat = ({ label, value, critical }) => (
  <div style={{
    background: critical ? '#fee2e2' : 'white',
    padding: '0.75rem',
    borderRadius: '6px',
    border: `1px solid ${critical ? '#ef4444' : '#e2e8f0'}`
  }}>
    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', marginBottom: '0.25rem' }}>
      {label}
    </div>
    <div style={{
      fontSize: '1.125rem',
      fontWeight: '700',
      color: critical ? '#dc2626' : '#1e293b',
      fontFamily: 'monospace'
    }}>
      {value || 'N/A'}
    </div>
  </div>
);

export default PlanInterventionTab;
