import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

const RemplacementChoix = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [expired, setExpired] = useState(false);
  const [expiredReason, setExpiredReason] = useState('');
  const [demandeInfo, setDemandeInfo] = useState(null);
  const [error, setError] = useState(null);
  
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    
    const checkToken = async () => {
      try {
        const response = await fetch(`${API}/api/remplacement-check-token/${token}`);
        const data = await response.json();
        
        if (!data.valid) {
          setExpired(true);
          setExpiredReason(data.reason || 'Temps dépassé, impossible de choisir');
        } else {
          setDemandeInfo(data);
        }
      } catch (err) {
        console.error('Erreur vérification token:', err);
      } finally {
        setChecking(false);
      }
    };
    
    checkToken();
  }, [token]);

  const handleAction = async (action) => {
    if (!token) {
      setError("Token manquant");
      return;
    }
    
    setLoading(true);
    window.location.href = `${API}/api/remplacement-action/${token}/${action}`;
  };

  if (!token) {
    return (
      <div data-testid="remplacement-choix-error" style={{
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
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>&#10060;</div>
          <h2 style={{ color: '#DC2626', marginBottom: '15px' }}>Erreur</h2>
          <p style={{ color: '#6B7280' }}>Lien invalide ou expiré</p>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div data-testid="remplacement-choix-loading" style={{
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
          <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'spin 1s linear infinite' }}>&#9203;</div>
          <p style={{ color: '#6B7280', fontSize: '16px' }}>Vérification en cours...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div data-testid="remplacement-choix-expired" style={{
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
          <div style={{ 
            width: '80px', 
            height: '80px', 
            borderRadius: '50%', 
            background: '#FEF2F2', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            margin: '0 auto 20px',
            border: '3px solid #FECACA'
          }}>
            <span style={{ fontSize: '40px' }}>&#9200;</span>
          </div>
          <h2 data-testid="expired-title" style={{ 
            color: '#DC2626', 
            marginBottom: '12px', 
            fontSize: '22px',
            fontWeight: '700'
          }}>
            Temps dépassé
          </h2>
          <p data-testid="expired-message" style={{ 
            color: '#6B7280', 
            marginBottom: '30px', 
            fontSize: '16px',
            lineHeight: '1.5'
          }}>
            {expiredReason}
          </p>
          <div style={{
            background: '#FFF7ED',
            border: '1px solid #FDBA74',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '24px'
          }}>
            <p style={{ 
              color: '#9A3412', 
              margin: 0, 
              fontSize: '14px',
              fontWeight: '500'
            }}>
              Le délai de réponse alloué pour cette demande de remplacement est écoulé. 
              Veuillez contacter votre superviseur si nécessaire.
            </p>
          </div>
          <p style={{ 
            color: '#9CA3AF', 
            fontSize: '13px', 
            marginTop: '20px' 
          }}>
            Vous pouvez fermer cette page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="remplacement-choix-page" style={{
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
        <div style={{ 
          width: '70px', 
          height: '70px', 
          borderRadius: '50%', 
          background: '#FEF2F2', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          margin: '0 auto 20px',
          border: '3px solid #FECACA'
        }}>
          <span style={{ fontSize: '36px' }}>&#128680;</span>
        </div>
        <h2 data-testid="choix-title" style={{ color: '#DC2626', marginBottom: '10px', fontSize: '24px' }}>
          Demande de Remplacement
        </h2>
        
        {demandeInfo && (
          <div style={{
            background: '#F8FAFC',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '20px',
            textAlign: 'left',
            border: '1px solid #E2E8F0'
          }}>
            {demandeInfo.demandeur_nom && (
              <p style={{ margin: '0 0 8px', color: '#475569', fontSize: '14px' }}>
                <strong>Demandeur:</strong> {demandeInfo.demandeur_nom}
              </p>
            )}
            {demandeInfo.date && (
              <p style={{ margin: '0 0 8px', color: '#475569', fontSize: '14px' }}>
                <strong>Date:</strong> {demandeInfo.date}
              </p>
            )}
            {demandeInfo.type_garde_nom && (
              <p style={{ margin: '0 0 8px', color: '#475569', fontSize: '14px' }}>
                <strong>Type:</strong> {demandeInfo.type_garde_nom}
                {demandeInfo.heure_debut && demandeInfo.heure_fin && (
                  <span> ({demandeInfo.heure_debut} - {demandeInfo.heure_fin})</span>
                )}
              </p>
            )}
            {demandeInfo.raison && (
              <p style={{ margin: 0, color: '#475569', fontSize: '14px' }}>
                <strong>Raison:</strong> {demandeInfo.raison}
              </p>
            )}
          </div>
        )}

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
            data-testid="accept-remplacement-btn"
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
            J'accepte
          </Button>
          
          <Button
            data-testid="refuse-remplacement-btn"
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
            Je refuse
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
