import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../utils/api';
import axios from 'axios';

const VehiculeQRAction = () => {
  const { tenantSlug, vehiculeId } = useParams();
  const navigate = useNavigate();
  const [vehicule, setVehicule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    loadVehicule();
  }, [vehiculeId, tenantSlug]);

  const loadVehicule = async () => {
    try {
      setLoading(true);
      // Utiliser l'endpoint public (sans authentification)
      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/actifs/vehicules/${vehiculeId}/public`
      );
      
      if (!response.ok) {
        throw new Error('Véhicule non trouvé');
      }
      
      const data = await response.json();
      setVehicule(data);
    } catch (err) {
      console.error('Erreur chargement véhicule:', err);
      setError('Véhicule non trouvé');
    } finally {
      setLoading(false);
    }
  };

  const handleRondeSecurite = () => {
    // Rediriger vers la page de gestion des actifs avec le véhicule pré-sélectionné
    navigate(`/${tenantSlug}/actifs`, { 
      state: { 
        openRondeSecurite: true, 
        selectedVehicule: vehicule 
      } 
    });
  };

  const handleInventaire = () => {
    // Pour l'instant, afficher un message (fonctionnalité à venir)
    alert('📦 Module Inventaire à venir prochainement!');
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid #DC2626',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ color: '#6B7280' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (error || !vehicule) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        padding: '20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>❌</div>
          <h2 style={{ color: '#DC2626', marginBottom: '10px' }}>Erreur</h2>
          <p style={{ color: '#6B7280' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        maxWidth: '500px',
        width: '100%'
      }}>
        {/* En-tête avec icône véhicule */}
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{
            width: '80px',
            height: '80px',
            backgroundColor: '#FEE2E2',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '40px'
          }}>
            🚒
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '10px'
          }}>
            {vehicule.nom}
          </h1>
          <p style={{
            color: '#6B7280',
            fontSize: '1rem',
            marginBottom: '5px'
          }}>
            {vehicule.type_vehicule} • {vehicule.marque || 'N/A'}
          </p>
          {vehicule.numero_plaque && (
            <p style={{
              color: '#9CA3AF',
              fontSize: '0.875rem'
            }}>
              Plaque: {vehicule.numero_plaque}
            </p>
          )}
        </div>

        {/* Titre section */}
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: '600',
          color: '#374151',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          Que souhaitez-vous faire?
        </h2>

        {/* Boutons d'action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {/* Bouton Ronde de Sécurité */}
          <button
            onClick={handleRondeSecurite}
            style={{
              backgroundColor: '#DC2626',
              color: 'white',
              padding: '20px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.125rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px rgba(220, 38, 38, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#B91C1C';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(220, 38, 38, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#DC2626';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(220, 38, 38, 0.2)';
            }}
          >
            <span style={{ fontSize: '24px' }}>🔧</span>
            <span>Ronde de Sécurité SAAQ</span>
          </button>

          {/* Bouton Inventaire */}
          <button
            onClick={handleInventaire}
            style={{
              backgroundColor: '#F3F4F6',
              color: '#6B7280',
              padding: '20px',
              borderRadius: '12px',
              border: '2px dashed #D1D5DB',
              cursor: 'pointer',
              fontSize: '1.125rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#E5E7EB';
              e.currentTarget.style.borderColor = '#9CA3AF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#F3F4F6';
              e.currentTarget.style.borderColor = '#D1D5DB';
            }}
          >
            <span style={{ fontSize: '24px' }}>📦</span>
            <span>Inventaire</span>
            <span style={{
              fontSize: '0.75rem',
              backgroundColor: '#FEF3C7',
              color: '#92400E',
              padding: '4px 8px',
              borderRadius: '6px',
              fontWeight: '700'
            }}>
              Bientôt
            </span>
          </button>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '30px',
          paddingTop: '20px',
          borderTop: '1px solid #E5E7EB',
          textAlign: 'center'
        }}>
          <p style={{
            fontSize: '0.875rem',
            color: '#9CA3AF',
            margin: 0
          }}>
            ProFireManager • Gestion des Actifs
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default VehiculeQRAction;
