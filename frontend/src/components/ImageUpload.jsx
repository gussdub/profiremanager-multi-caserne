import React, { useState, useRef, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';

const ImageUpload = ({ value, onChange, label = "Photo", compact = false }) => {
  const { tenantSlug } = useTenant();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(value || '');
  const [showFullUploader, setShowFullUploader] = useState(false);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  useEffect(() => {
    setPreviewUrl(value || '');
  }, [value]);

  // Gérer le paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      // Vérifier si le dropzone est dans le viewport
      if (!dropZoneRef.current) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (file) {
            handleFileUpload(file);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleFileUpload = async (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    // Limite de taille : 5MB
    if (file.size > 5 * 1024 * 1024) {
      alert('L\'image est trop volumineuse (max 5MB)');
      return;
    }

    setUploading(true);

    try {
      // Convertir en base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result;
        
        // Upload vers le serveur
        const token = localStorage.getItem(`${tenantSlug}_token`);
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/inventaires/upload-photo`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              photo_base64: base64String,
              filename: file.name
            })
          }
        );

        if (!response.ok) {
          throw new Error('Erreur lors de l\'upload');
        }

        const data = await response.json();
        const imageUrl = `${process.env.REACT_APP_BACKEND_URL}${data.url}`;
        
        setPreviewUrl(imageUrl);
        onChange(imageUrl);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('❌ Erreur lors de l\'upload de l\'image');
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleRemove = () => {
    setPreviewUrl('');
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Mode compact
  if (compact) {
    return (
      <div style={{ display: 'inline-block', position: 'relative' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          
          onChange={handleFileSelect}
          style={{ 
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: '0',
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: '0'
          }}
        />
        
        {!previewUrl ? (
          <button
            type="button"
            onClick={handleClick}
            disabled={uploading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.375rem 0.75rem',
              backgroundColor: uploading ? '#9ca3af' : '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => !uploading && (e.currentTarget.style.backgroundColor = '#4f46e5')}
            onMouseLeave={(e) => !uploading && (e.currentTarget.style.backgroundColor = '#6366f1')}
          >
            {uploading ? '⏳' : '📷'} {uploading ? 'Téléversement...' : 'Prendre photo'}
          </button>
        ) : (
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '0.375rem',
            backgroundColor: '#ffffff',
            borderRadius: '0.5rem',
            border: '2px solid #10b981',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              position: 'relative',
              width: '50px',
              height: '50px',
              overflow: 'hidden',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb'
            }}>
              <img
                src={previewUrl}
                alt="Aperçu"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.parentElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 1.5rem;">📷</div>';
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleRemove}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.375rem 0.625rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  }

  // Mode complet (original)
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={{ 
        display: 'block', 
        fontSize: '0.875rem', 
        fontWeight: '600', 
        marginBottom: '0.5rem', 
        color: '#374151' 
      }}>
        {label}
      </label>

      {!previewUrl ? (
        <div
          ref={dropZoneRef}
          onClick={handleClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? '#3b82f6' : '#d1d5db'}`,
            borderRadius: '0.5rem',
            padding: '2rem',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer',
            backgroundColor: isDragging ? '#eff6ff' : '#fafafa',
            transition: 'all 0.2s'
          }}
        >
          {uploading ? (
            <div style={{ color: '#6b7280' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
              <p>Upload en cours...</p>
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
              <p style={{ marginBottom: '0.5rem', fontWeight: '600' }}>
                Cliquez, glissez-déposez ou Ctrl+V
              </p>
              <p style={{ fontSize: '0.75rem' }}>
                PNG, JPG jusqu'à 5MB
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div style={{
          position: 'relative',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          padding: '0.5rem',
          backgroundColor: 'white'
        }}>
          <img
            src={previewUrl}
            alt="Aperçu"
            style={{
              maxWidth: '100%',
              maxHeight: '200px',
              borderRadius: '0.375rem',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto'
            }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = '<p style="color: #ef4444; text-align: center;">❌ Erreur de chargement de l\'image</p>';
            }}
          />
          <button
            type="button"
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600'
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
