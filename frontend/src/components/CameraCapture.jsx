import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Button } from './ui/button';
import { Capacitor } from '@capacitor/core';

/**
 * Détection iOS
 */
const isIOSDevice = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isIOS = isIOSDevice;

/**
 * Détection si on est en mode natif Capacitor
 */
const isNativeApp = () => {
  try {
    return Capacitor && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Détection PWA (mode standalone)
 * Important: Sur iOS PWA, input type="file" avec capture="camera" cause un crash
 */
const isPWAMode = () => {
  return window.matchMedia('(display-mode: standalone)').matches || 
         window.navigator.standalone === true;
};

/**
 * CameraCapture - Composant de capture photo compatible iOS
 * 
 * Sur app native Capacitor: Utilise le plugin Camera natif
 * Sur iOS web: Utilise l'input natif avec capture="environment" (fiable)
 * Ailleurs: Utilise getUserMedia() pour une meilleure UX
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
  const [useNativeInput, setUseNativeInput] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sur app native, utiliser le plugin Camera de Capacitor
  useEffect(() => {
    const initCamera = async () => {
      if (isNativeApp()) {
        try {
          // Import dynamique du plugin Camera
          const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
          
          const image = await Camera.getPhoto({
            quality: Math.round(quality * 100),
            allowEditing: false,
            resultType: CameraResultType.DataUrl,
            source: CameraSource.Camera,
            direction: facingMode === 'user' ? 'FRONT' : 'REAR'
          });
          
          if (image.dataUrl) {
            // Convertir dataUrl en File
            const response = await fetch(image.dataUrl);
            const blob = await response.blob();
            const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
          } else {
            onClose();
          }
        } catch (err) {
          console.log('[Camera] Erreur ou annulation:', err);
          onClose();
        }
        return;
      }
      
      // Sur iOS web, utiliser l'input natif
      if (isIOSDevice()) {
        setUseNativeInput(true);
        setIsLoading(false);
      }
    };
    
    initCamera();
  }, [facingMode, quality, onCapture, onClose]);

  // Gérer la sélection de fichier (pour iOS ou fallback)
  const handleFileSelect = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Optionnel: redimensionner l'image si nécessaire
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calculer les dimensions en conservant le ratio
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * ratio);
          }
          
          // Créer un canvas pour redimensionner
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convertir en blob et créer un File
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const resizedFile = new File([blob], file.name, { 
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                onCapture(resizedFile);
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }, [maxWidth, quality, onCapture]);

  // Démarrer la caméra (pour non-iOS)
  const startCamera = useCallback(async (facing = currentFacingMode) => {
    // Sur iOS, on utilise l'input natif
    if (isIOSDevice()) {
      setUseNativeInput(true);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    // Arrêter le stream précédent si existe
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      // Vérifier si getUserMedia est disponible
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback vers input natif
        setUseNativeInput(true);
        setIsLoading(false);
        return;
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
      
      // Sur toute erreur, fallback vers input natif
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('PERMISSION_DENIED');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        // Pas de caméra, utiliser input natif
        setUseNativeInput(true);
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
          // Fallback vers input natif
          setUseNativeInput(true);
        }
      } else {
        // Fallback vers input natif pour toute autre erreur
        setUseNativeInput(true);
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
      PERMISSION_DENIED: {
        title: "Permission refusée",
        message: "Veuillez autoriser l'accès à la caméra dans les paramètres de votre navigateur, puis réessayez.",
        showRetry: true,
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
            <>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                🖼️ Importer depuis la photothèque
              </Button>
            </>
          )}
          <Button onClick={handleClose} variant="ghost">
            ✕ Fermer
          </Button>
        </div>
      </div>
    );
  };

  // Rendu pour iOS (input natif simplifié)
  // Sur iOS PWA, on propose simplement d'importer depuis la photothèque
  const renderNativeInput = () => {
    return (
      <div className="camera-native-input">
        <div className="native-input-content">
          <div className="native-input-icon">🖼️</div>
          <h3>Importer une photo</h3>
          <p>Sélectionnez une photo depuis votre photothèque ou vos fichiers</p>
          
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          
          <div className="native-input-actions">
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              className="capture-main-btn"
              style={{ 
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                padding: '16px 32px',
                fontSize: '1.1rem',
                borderRadius: '12px'
              }}
            >
              🖼️ Choisir depuis la photothèque
            </Button>
            
            <Button onClick={handleClose} variant="ghost">
              ✕ Annuler
            </Button>
          </div>
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
          {useNativeInput ? (
            // Mode iOS : Input natif
            renderNativeInput()
          ) : error ? (
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

        {/* Actions (seulement pour mode non-iOS avec getUserMedia) */}
        {!useNativeInput && !error && !isLoading && (
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

export default CameraCapture;
