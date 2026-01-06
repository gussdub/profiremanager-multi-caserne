import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from './button';

/**
 * Composant de signature tactile
 */
const SignaturePad = ({ 
  onSignatureChange, 
  initialValue = null,
  width = 400,
  height = 150,
  label = "Signature"
}) => {
  const sigRef = useRef(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    if (initialValue && sigRef.current) {
      sigRef.current.fromDataURL(initialValue);
      setIsEmpty(false);
    }
  }, [initialValue]);

  const handleEnd = () => {
    if (sigRef.current) {
      const dataUrl = sigRef.current.toDataURL('image/png');
      setIsEmpty(sigRef.current.isEmpty());
      onSignatureChange?.(dataUrl);
    }
  };

  const handleClear = () => {
    if (sigRef.current) {
      sigRef.current.clear();
      setIsEmpty(true);
      onSignatureChange?.('');
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.5rem'
      }}>
        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
          ✍️ {label}
        </span>
        <Button
          type="button"
          onClick={handleClear}
          variant="outline"
          size="sm"
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        >
          🗑️ Effacer
        </Button>
      </div>
      
      <div style={{
        border: `2px ${isEmpty ? 'dashed' : 'solid'} ${isEmpty ? '#d1d5db' : '#3b82f6'}`,
        borderRadius: '8px',
        backgroundColor: 'white',
        overflow: 'hidden',
        touchAction: 'none'
      }}>
        <SignatureCanvas
          ref={sigRef}
          penColor="#1e40af"
          canvasProps={{
            width: Math.min(width, window.innerWidth - 80),
            height: height,
            style: { 
              width: '100%', 
              height: `${height}px`,
              cursor: 'crosshair'
            }
          }}
          onEnd={handleEnd}
        />
      </div>
      
      {isEmpty && (
        <p style={{ 
          fontSize: '0.75rem', 
          color: '#9ca3af', 
          textAlign: 'center',
          marginTop: '0.25rem'
        }}>
          Signez dans le cadre ci-dessus
        </p>
      )}
    </div>
  );
};

export default SignaturePad;
