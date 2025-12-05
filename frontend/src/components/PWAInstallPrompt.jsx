import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';

const PWAInstallPrompt = ({ tenantSlug, tenant }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Vérifier si déjà installé
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Vérifier si déjà installé (iOS)
    if (window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Capturer l'événement beforeinstallprompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Ne montrer la bannière que si l'utilisateur ne l'a pas déjà refusée
      const dismissed = localStorage.getItem(`pwa-prompt-dismissed-${tenantSlug}`);
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000); // Attendre 3 secondes avant de montrer
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Écouter l'événement d'installation réussie
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installée avec succès!');
      setIsInstalled(true);
      setShowPrompt(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [tenantSlug]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Montrer le prompt d'installation
    deferredPrompt.prompt();

    // Attendre la réponse de l'utilisateur
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);

    if (outcome === 'accepted') {
      console.log('✅ Utilisateur a accepté l\'installation');
    } else {
      console.log('❌ Utilisateur a refusé l\'installation');
    }

    // Réinitialiser le prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Sauvegarder que l'utilisateur a refusé (valide 30 jours)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    localStorage.setItem(`pwa-prompt-dismissed-${tenantSlug}`, expiryDate.getTime());
  };

  // Instructions pour iOS
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isInstalled) {
    return null; // Ne rien afficher si déjà installé
  }

  if (showIOSInstructions) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
        padding: '1.5rem',
        zIndex: 9999,
        borderTopLeftRadius: '16px',
        borderTopRightRadius: '16px'
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111827', margin: 0 }}>
              📱 Installer {tenant?.nom_service || 'ProFireManager'}
            </h3>
            <button 
              onClick={() => setShowIOSInstructions(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6B7280'
              }}
            >
              ×
            </button>
          </div>
          
          <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: '1.6' }}>
            <p style={{ marginBottom: '0.75rem' }}>
              <strong>Pour installer sur iOS/Safari:</strong>
            </p>
            <ol style={{ paddingLeft: '1.25rem', marginBottom: '1rem' }}>
              <li>Appuyez sur le bouton <strong>Partager</strong> <span style={{ fontSize: '1.25rem' }}>⬆️</span> (en bas de l'écran)</li>
              <li>Faites défiler et appuyez sur <strong>"Sur l'écran d'accueil"</strong></li>
              <li>Appuyez sur <strong>"Ajouter"</strong></li>
            </ol>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0 }}>
              L'application apparaîtra sur votre écran d'accueil comme une vraie app!
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!showPrompt || !deferredPrompt) {
    // Petit badge discret en haut à droite pour réafficher le prompt
    if (deferredPrompt || isIOS) {
      return (
        <button
          onClick={() => isIOS ? setShowIOSInstructions(true) : setShowPrompt(true)}
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            backgroundColor: '#DC2626',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
            zIndex: 999,
            fontSize: '1.5rem'
          }}
          title="Installer l'application"
        >
          📱
        </button>
      );
    }
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'white',
      boxShadow: '0 -4px 12px rgba(0,0,0,0.15)',
      padding: '1.5rem',
      zIndex: 9999,
      borderTopLeftRadius: '16px',
      borderTopRightRadius: '16px',
      animation: 'slideUp 0.3s ease-out'
    }}>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
      
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '12px',
            background: `linear-gradient(135deg, #DC2626, #991B1B)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            flexShrink: 0
          }}>
            🚒
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>
              Installer {tenant?.nom_service || 'ProFireManager'}
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Accédez rapidement à l'application depuis votre écran d'accueil. Fonctionne même hors ligne!
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <Button
            onClick={handleDismiss}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#F3F4F6',
              color: '#374151',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            Plus tard
          </Button>
          <Button
            onClick={handleInstall}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem'
            }}
          >
            📱 Installer
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
