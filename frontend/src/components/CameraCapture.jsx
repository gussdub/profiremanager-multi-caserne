import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './ui/button';

/**
 * CameraCapture - Composant de capture photo compatible iOS
 * 
 * Utilise getUserMedia() au lieu du picker natif iOS qui peut crasher.
 * Fournit une UI pour capturer une photo directement depuis le navigateur.
 * 
 * @param {function} onCapture - Callback appelé avec le fichier capturé (File object)
 * @param {function} onClose - Callback pour fermer le composant
 * @param {number} maxWidth - Largeur max de l'image capturée (défaut: 1280)
 * @param {number} quality - Qualité JPEG 0-1 (défaut: 0.85)
 * @param {string} facingMode - 'environment' (arrière) ou 'user' (avant) (défaut: environment)
 */
const CameraCapture = ({ 
  onCapture, 
  onClose, 
  maxWidth = 1280, 
  quality = 0.85,
  facingMode = 'environment'
}) => {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [capturedImage, setCapturedImage] = useState(null);
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Démarrer la caméra
  const startCamera = useCallback(async (facing = currentFacingMode) => {
    setIsLoading(true);
    setError(null);
    
    // Arrêter le stream précédent si existe
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      // Vérifier si getUserMedia est disponible
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('UNSUPPORTED');
      }

      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Attendre que la vidéo soit prête
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(console.error);
          setIsLoading(false);
        };
      }
    } catch (err) {
      console.error('Erreur caméra:', err);
      
      if (err.message === 'UNSUPPORTED') {
        setError('UNSUPPORTED');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('PERMISSION_DENIED');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('NO_CAMERA');
      } else if (err.name === 'OverconstrainedError') {
        // Si la caméra demandée n'est pas disponible, essayer sans contrainte facingMode
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: false 
          });
          setStream(fallbackStream);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current.play().catch(console.error);
              setIsLoading(false);
            };
          }
          return;
        } catch (fallbackErr) {
          setError('CAMERA_ERROR');
        }
      } else {
        setError('CAMERA_ERROR');
      }
      setIsLoading(false);
    }
  }, [stream, currentFacingMode]);

  // Basculer entre caméra avant/arrière
  const switchCamera = useCallback(() => {
    const newFacing = currentFacingMode === 'environment' ? 'user' : 'environment';
    setCurrentFacingMode(newFacing);
    startCamera(newFacing);
  }, [currentFacingMode, startCamera]);

  // Capturer une photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Calculer les dimensions en conservant le ratio
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > maxWidth) {
      const ratio = maxWidth / width;
      width = maxWidth;
      height = Math.round(height * ratio);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    // Si caméra frontale, miroir horizontal
    if (currentFacingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0, width, height);
    
    // Convertir en data URL pour preview
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    setCapturedImage(dataUrl);
    
    // Arrêter le stream pendant qu'on review
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream, maxWidth, quality, currentFacingMode]);

  // Confirmer la photo capturée
  const confirmCapture = useCallback(() => {
    if (!capturedImage || !canvasRef.current) return;

    canvasRef.current.toBlob(
      (blob) => {
        if (blob) {
          // Créer un objet File à partir du Blob
          const file = new File([blob], `photo_${Date.now()}.jpg`, { 
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          onCapture(file);
        }
      },
      'image/jpeg',
      quality
    );
  }, [capturedImage, quality, onCapture]);

  // Reprendre une photo (après preview)
  const retakePhoto = useCallback(() => {
    setCapturedImage(null);
    startCamera();
  }, [startCamera]);

  // Nettoyer le stream à la fermeture
  const handleClose = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onClose();
  }, [stream, onClose]);

  // Démarrer la caméra au montage
  useEffect(() => {
    startCamera();
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line
  }, []);

  // Rendu des états d'erreur
  const renderError = () => {
    const errorMessages = {
      UNSUPPORTED: {
        title: "Caméra non supportée",
        message: "Votre navigateur ne supporte pas l'accès à la caméra. Veuillez utiliser Safari ou un navigateur récent.",
        showFallback: true
      },
      PERMISSION_DENIED: {
        title: "Permission refusée",
        message: "Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur, puis réessayez.",
        showRetry: true
      },
      NO_CAMERA: {
        title: "Caméra introuvable",
        message: "Aucune caméra n'a été détectée sur votre appareil.",
        showFallback: true
      },
      CAMERA_ERROR: {
        title: "Erreur caméra",
        message: "Impossible d'accéder à la caméra. Veuillez fermer les autres applications utilisant la caméra et réessayer.",
        showRetry: true,
        showFallback: true
      }
    };

    const errorInfo = errorMessages[error] || errorMessages.CAMERA_ERROR;

    return (
      <div className="camera-capture-error">
        <div className="error-icon">📷❌</div>
        <h3>{errorInfo.title}</h3>
        <p>{errorInfo.message}</p>
        <div className="error-actions">
          {errorInfo.showRetry && (
            <Button onClick={() => startCamera()} variant="outline">
              🔄 Réessayer
            </Button>
          )}
          {errorInfo.showFallback && (
            <Button onClick={handleClose} variant="outline">
              📁 Choisir depuis les fichiers
            </Button>
          )}
          <Button onClick={handleClose} variant="ghost">
            ✕ Fermer
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="camera-capture-overlay">
      <div className="camera-capture-container">
        {/* Header */}
        <div className="camera-capture-header">
          <h3>📷 {capturedImage ? 'Aperçu' : 'Prendre une photo'}</h3>
          <Button variant="ghost" onClick={handleClose} className="close-btn">
            ✕
          </Button>
        </div>

        {/* Contenu principal */}
        <div className="camera-capture-content">
          {error ? (
            renderError()
          ) : isLoading && !capturedImage ? (
            <div className="camera-loading">
              <div className="loading-spinner"></div>
              <p>Activation de la caméra...</p>
            </div>
          ) : capturedImage ? (
            // Aperçu de la photo capturée
            <div className="captured-preview">
              <img src={capturedImage} alt="Photo capturée" />
            </div>
          ) : (
            // Flux vidéo live
            <div className="camera-viewfinder">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                style={{ transform: currentFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
              />
              <div className="viewfinder-overlay">
                <div className="viewfinder-corners">
                  <span className="corner top-left"></span>
                  <span className="corner top-right"></span>
                  <span className="corner bottom-left"></span>
                  <span className="corner bottom-right"></span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Canvas caché pour la capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Actions */}
        {!error && !isLoading && (
          <div className="camera-capture-actions">
            {capturedImage ? (
              // Actions après capture
              <>
                <Button onClick={retakePhoto} variant="outline">
                  🔄 Reprendre
                </Button>
                <Button onClick={confirmCapture} className="capture-confirm-btn">
                  ✓ Utiliser cette photo
                </Button>
              </>
            ) : (
              // Actions pendant le live
              <>
                <Button onClick={switchCamera} variant="outline" className="switch-camera-btn">
                  🔄
                </Button>
                <button onClick={capturePhoto} className="capture-btn" aria-label="Prendre une photo">
                  <span className="capture-btn-inner"></span>
                </button>
                <Button onClick={handleClose} variant="outline" className="cancel-btn">
                  ✕
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Utilitaire pour détecter si on devrait utiliser getUserMedia
 * Retourne true sur iOS (où le picker natif peut crasher)
 */
export const shouldUseGetUserMedia = () => {
  // Détecter iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  
  // Détecter si on est en mode PWA standalone
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
    window.navigator.standalone === true;
  
  // Vérifier si getUserMedia est disponible
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  
  // Utiliser getUserMedia sur iOS (surtout en PWA) si disponible
  return isIOS && hasGetUserMedia;
};

/**
 * Utilitaire pour détecter iOS
 */
export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export default CameraCapture;
