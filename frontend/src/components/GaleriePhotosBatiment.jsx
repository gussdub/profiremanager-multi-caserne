import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPost, apiDelete, buildApiUrl, getTenantToken } from '../utils/api';
import imageCompression from 'browser-image-compression';
import axios from 'axios';

/**
 * Composant pour la galerie de photos d'un bâtiment
 */
const GaleriePhotosBatiment = ({ 
  tenantSlug, 
  batimentId, 
  canEdit = true 
}) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // Charger les photos
  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      // Charger les photos existantes (ancien système)
      let existingPhotos = [];
      try {
        const data = await apiGet(tenantSlug, `/prevention/batiments/${batimentId}/photos`);
        existingPhotos = (data || []).map(p => ({ ...p, source: 'legacy' }));
      } catch {
        existingPhotos = [];
      }

      // Charger les photos importées (Object Storage)
      let importedPhotos = [];
      try {
        const data = await apiGet(tenantSlug, `/files/by-entity/batiment/${batimentId}`);
        importedPhotos = (data?.files || [])
          .filter(f => f.content_type && f.content_type.startsWith('image/'))
          .map(f => ({
            id: f.id,
            nom: f.original_filename,
            url: buildApiUrl(tenantSlug, `/files/${f.id}/download`) + `?auth=${getTenantToken()}`,
            source: 'imported',
            uploaded_at: f.uploaded_at,
          }));
      } catch {
        importedPhotos = [];
      }

      setPhotos([...existingPhotos, ...importedPhotos]);
    } catch (error) {
      console.error('Erreur chargement photos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, batimentId]);

  useEffect(() => {
    if (batimentId) {
      loadPhotos();
    }
  }, [batimentId, loadPhotos]);

  // Upload une photo
  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);

    try {
      for (const file of files) {
        // Compresser l'image
        const options = {
          maxSizeMB: 1,
          maxWidthOrHeight: 1600,
          useWebWorker: true
        };
        const compressedFile = await imageCompression(file, options);

        // Upload
        const formData = new FormData();
        formData.append('file', compressedFile);

        const response = await axios.post(
          buildApiUrl(tenantSlug, '/upload/image'),
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
              'Authorization': `Bearer ${getTenantToken()}`
            }
          }
        );

        // Ajouter à la galerie
        await apiPost(tenantSlug, `/prevention/batiments/${batimentId}/photos`, {
          url: response.data.url,
          nom: file.name,
          description: ''
        });
      }

      await loadPhotos();
    } catch (error) {
      console.error('Erreur upload:', error);
      alert('Erreur lors de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  // Supprimer une photo
  const handleDelete = async (photoId) => {
    if (!window.confirm('Supprimer cette photo ?')) return;

    try {
      await apiDelete(tenantSlug, `/prevention/batiments/${batimentId}/photos/${photoId}`);
      await loadPhotos();
      setSelectedPhoto(null);
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  };

  // Vue plein écran
  const renderFullscreen = () => {
    if (!selectedPhoto) return null;

    return (
      <div
        onClick={() => setSelectedPhoto(null)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          cursor: 'pointer'
        }}
      >
        <img
          src={selectedPhoto.url}
          alt={selectedPhoto.nom || 'Photo'}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain'
          }}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPhoto(null);
          }}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer'
          }}
        >
          ✕
        </button>
        {canEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(selectedPhoto.id);
            }}
            style={{
              position: 'absolute',
              bottom: '1rem',
              right: '1rem',
              background: '#ef4444',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem 1.5rem',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            🗑️ Supprimer
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Chargement des photos...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📸 Galerie Photos
          <span style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.125rem 0.5rem',
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            {photos.length}
          </span>
        </h3>
        {canEdit && (
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            borderRadius: '8px',
            cursor: uploading ? 'wait' : 'pointer',
            fontSize: '0.875rem',
            opacity: uploading ? 0.7 : 1
          }}>
            {uploading ? '⏳ Upload...' : '➕ Ajouter'}
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {/* Grille de photos */}
      {photos.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: '0.75rem'
        }}>
          {photos.map((photo, idx) => (
            <div
              key={photo.id || idx}
              onClick={() => setSelectedPhoto(photo)}
              style={{
                position: 'relative',
                paddingTop: '100%',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                transition: 'transform 0.15s',
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <img
                src={photo.url}
                alt={photo.nom || `Photo ${idx + 1}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
                }}
              />
              {photo.nom && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: '0.25rem 0.5rem',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  color: 'white',
                  fontSize: '0.7rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {photo.nom}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '2rem',
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📷</div>
          <p style={{ margin: 0 }}>Aucune photo dans la galerie</p>
          {canEdit && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
              Cliquez sur "Ajouter" pour télécharger des photos
            </p>
          )}
        </div>
      )}

      {/* Vue plein écran */}
      {renderFullscreen()}
    </div>
  );
};

export default GaleriePhotosBatiment;
