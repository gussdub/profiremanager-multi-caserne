import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

const RemplacementChoix = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const token = searchParams.get('token');

  const handleAction = async (action) => {
    if (!token) {
      setError("Token manquant");
      return;
    }
    
    setLoading(true);
    // Rediriger vers le backend qui traitera l'action
    window.location.href = `${API}/api/remplacement-action/${token}/${action}`;
  };

  if (!token) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
        padding: '20px'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '40px',
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
        }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>❌</div>
          <h2 style={{ color: '#DC2626', marginBottom: '15px' }}>Erreur</h2>
          <p style={{ color: '#6B7280' }}>Lien invalide ou expiré</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '40px',
        maxWidth: '450px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{ fontSize: '60px', marginBottom: '20px' }}>🚨</div>
        <h2 style={{ color: '#DC2626', marginBottom: '10px', fontSize: '24px' }}>
          Demande de Remplacement
        </h2>
        <p style={{ color: '#6B7280', marginBottom: '30px', fontSize: '16px' }}>
          Pouvez-vous effectuer ce remplacement ?
        </p>

        {error && (
          <div style={{
            background: '#FEE2E2',
            color: '#991B1B',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <Button
            onClick={() => handleAction('accepter')}
            disabled={loading}
            style={{
              background: '#22C55E',
              color: 'white',
              padding: '16px 32px',
              fontSize: '18px',
              fontWeight: '600',
              borderRadius: '10px',
              border: 'none',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            ✅ J'accepte
          </Button>
          
          <Button
            onClick={() => handleAction('refuser')}
            disabled={loading}
            variant="outline"
            style={{
              background: 'white',
              color: '#EF4444',
              padding: '16px 32px',
              fontSize: '18px',
              fontWeight: '600',
              borderRadius: '10px',
              border: '2px solid #EF4444',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            ❌ Je refuse
          </Button>
        </div>

        <p style={{ 
          color: '#9CA3AF', 
          fontSize: '13px', 
          marginTop: '30px' 
        }}>
          Vous pouvez également répondre dans l'application ProFireManager
        </p>
      </div>
    </div>
  );
};

export default RemplacementChoix;
