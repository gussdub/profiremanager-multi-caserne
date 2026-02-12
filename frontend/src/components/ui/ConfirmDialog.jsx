import React, { createContext, useContext, useState, useCallback } from 'react';
import { Button } from './ui/button';

/**
 * ConfirmDialog - Composant de modale de confirmation
 * Remplace window.confirm() qui ne fonctionne pas dans les environnements iframe/sandbox
 */

// Contexte pour la modale de confirmation
const ConfirmDialogContext = createContext(null);

// Styles de la modale
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  animation: 'fadeIn 0.15s ease-out'
};

const dialogStyle = {
  backgroundColor: 'white',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '450px',
  width: '90%',
  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  animation: 'scaleIn 0.15s ease-out'
};

const titleStyle = {
  fontSize: '1.125rem',
  fontWeight: '600',
  color: '#111827',
  marginBottom: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
};

const messageStyle = {
  fontSize: '0.95rem',
  color: '#4b5563',
  marginBottom: '20px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap'
};

const buttonContainerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px'
};

// Variantes de styles pour différents types de confirmation
const variants = {
  danger: {
    icon: '⚠️',
    confirmButtonStyle: { backgroundColor: '#dc2626', color: 'white' },
    confirmText: 'Supprimer'
  },
  warning: {
    icon: '⚠️',
    confirmButtonStyle: { backgroundColor: '#f59e0b', color: 'white' },
    confirmText: 'Confirmer'
  },
  info: {
    icon: 'ℹ️',
    confirmButtonStyle: { backgroundColor: '#3b82f6', color: 'white' },
    confirmText: 'OK'
  },
  success: {
    icon: '✅',
    confirmButtonStyle: { backgroundColor: '#10b981', color: 'white' },
    confirmText: 'Confirmer'
  },
  default: {
    icon: '❓',
    confirmButtonStyle: { backgroundColor: '#374151', color: 'white' },
    confirmText: 'Confirmer'
  }
};

// Composant de dialogue
const ConfirmDialog = ({ 
  isOpen, 
  title, 
  message, 
  variant = 'default',
  confirmText,
  cancelText = 'Annuler',
  onConfirm, 
  onCancel,
  showCancel = true
}) => {
  if (!isOpen) return null;

  const variantConfig = variants[variant] || variants.default;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel?.();
    } else if (e.key === 'Enter') {
      onConfirm?.();
    }
  };

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div style={overlayStyle} onClick={handleOverlayClick} data-testid="confirm-dialog-overlay">
        <div style={dialogStyle} role="dialog" aria-modal="true" data-testid="confirm-dialog">
          <div style={titleStyle}>
            <span>{variantConfig.icon}</span>
            <span>{title || 'Confirmation'}</span>
          </div>
          <div style={messageStyle}>{message}</div>
          <div style={buttonContainerStyle}>
            {showCancel && (
              <Button
                variant="outline"
                onClick={onCancel}
                data-testid="confirm-dialog-cancel"
              >
                {cancelText}
              </Button>
            )}
            <Button
              onClick={onConfirm}
              style={variantConfig.confirmButtonStyle}
              data-testid="confirm-dialog-confirm"
            >
              {confirmText || variantConfig.confirmText}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

// Provider pour le contexte
export const ConfirmDialogProvider = ({ children }) => {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: '',
    message: '',
    variant: 'default',
    confirmText: null,
    cancelText: 'Annuler',
    showCancel: true,
    resolve: null
  });

  const confirm = useCallback(({ 
    title, 
    message, 
    variant = 'default',
    confirmText = null,
    cancelText = 'Annuler',
    showCancel = true
  }) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title,
        message,
        variant,
        confirmText,
        cancelText,
        showCancel,
        resolve
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    dialogState.resolve?.(true);
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, [dialogState.resolve]);

  const handleCancel = useCallback(() => {
    dialogState.resolve?.(false);
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, [dialogState.resolve]);

  // Fonction d'alerte (équivalent à window.alert)
  const alert = useCallback(({ title, message, variant = 'info' }) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title,
        message,
        variant,
        confirmText: 'OK',
        cancelText: 'Annuler',
        showCancel: false,
        resolve
      });
    });
  }, []);

  return (
    <ConfirmDialogContext.Provider value={{ confirm, alert }}>
      {children}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.title}
        message={dialogState.message}
        variant={dialogState.variant}
        confirmText={dialogState.confirmText}
        cancelText={dialogState.cancelText}
        showCancel={dialogState.showCancel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmDialogContext.Provider>
  );
};

// Hook pour utiliser le dialogue de confirmation
export const useConfirmDialog = () => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within a ConfirmDialogProvider');
  }
  return context;
};

// Export par défaut du composant
export default ConfirmDialog;
