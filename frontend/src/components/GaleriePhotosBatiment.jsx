import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPost, apiDelete, buildApiUrl, getTenantToken } from '../utils/api';
import imageCompression from 'browser-image-compression';
import axios from 'axios';

const GaleriePhotosBatiment = ({ 
  tenantSlug, 
  batimentId, 
  canEdit = true 
}) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const loadPhotos = useCallback(async () => {
    try {
      setLoading(true);
      let existingPhotos = [];
      try {
        const data = await apiGet(tenantSlug, `/prevention/batiments/${batimentId}/photos`);
        existingPhotos = (data || []).map(p => ({ ...p, source: 'legacy' }));
      } catch { existingPhotos = []; }

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
      } catch { importedPhotos = []; }

      setPhotos([...existingPhotos, ...importedPhotos]);
    } catch (error) {
      console.error('Erreur chargement photos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [tenantSlug, batimentId]);

  useEffect(() => {
    if (batimentId) loadPhotos();
  }, [batimentId, loadPhotos]);

  // Navigation clavier en plein écran
  useEffect(() => {
    if (selectedIndex < 0) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight') {
        setSelectedIndex(i => (i + 1) % photos.length);
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex(i => (i - 1 + photos.length) % photos.length);
      } else if (e.key === 'Escape') {
        setSelectedIndex(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, photos.length]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        const formData = new FormData();
        formData.append('file', compressedFile);
        const response = await axios.post(
          buildApiUrl(tenantSlug, '/upload/image'), formData,
          { headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${getTenantToken()}` } }
        );
        await apiPost(tenantSlug, `/prevention/batiments/${batimentId}/photos`, {
          url: response.data.url, nom: file.name, description: ''
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

  const handleDelete = async (photo, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      if (photo.source === 'imported') {
        await apiDelete(tenantSlug, `/files/${photo.id}`);
      } else {
        await apiDelete(tenantSlug, `/prevention/batiments/${batimentId}/photos/${photo.id}`);
      }
      setSelectedIndex(-1);
      await loadPhotos();
    } catch (error) {
      console.error('Erreur suppression:', error);
    }
  };

  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;

  // Plein écran
  const renderFullscreen = () => {
    if (!selectedPhoto) return null;
    return (
      <div
        onClick={() => setSelectedIndex(-1)}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, cursor: 'pointer',
        }}
      >
        <img
          src={selectedPhoto.url}
          alt={selectedPhoto.nom || 'Photo'}
          style={{ maxWidth: '85vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '4px' }}
        />

        {/* Compteur */}
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {selectedIndex + 1} / {photos.length}
        </div>

        {/* Flèche gauche */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedIndex(i => (i - 1 + photos.length) % photos.length); }}
            style={{
              position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '48px', height: '48px', color: 'white', fontSize: '1.5rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
            data-testid="photo-prev"
          >
            &#8249;
          </button>
        )}

        {/* Flèche droite */}
        {photos.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedIndex(i => (i + 1) % photos.length); }}
            style={{
              position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
              width: '48px', height: '48px', color: 'white', fontSize: '1.5rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
            data-testid="photo-next"
          >
            &#8250;
          </button>
        )}

        {/* Fermer */}
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedIndex(-1); }}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', color: 'white', fontSize: '1.25rem',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        >
          ✕
        </button>

        {/* Supprimer en plein écran */}
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(selectedPhoto); }}
            style={{
              position: 'absolute', bottom: '1.5rem', right: '1.5rem',
              background: '#ef4444', border: 'none', borderRadius: '8px',
              padding: '0.6rem 1.2rem', color: 'white', cursor: 'pointer',
              fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >
            Supprimer
          </button>
        )}

        {/* Nom du fichier */}
        <div style={{
          position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem',
        }}>
          {selectedPhoto.nom}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Chargement des photos...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Galerie Photos
          <span style={{
            backgroundColor: '#3b82f6', color: 'white',
            padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem',
          }}>
            {photos.length}
          </span>
        </h3>
        {canEdit && (
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 0.8rem', backgroundColor: '#3b82f6', color: 'white',
            borderRadius: '8px', cursor: uploading ? 'wait' : 'pointer', fontSize: '0.8rem',
            opacity: uploading ? 0.7 : 1,
          }}>
            {uploading ? 'Upload...' : '+ Ajouter'}
            <input type="file" accept="image/*" multiple hidden onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>

      {/* Grille */}
      {photos.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: '0.75rem',
        }}>
          {photos.map((photo, idx) => (
            <div
              key={photo.id || idx}
              style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#f3f4f6' }}
            >
              <div
                onClick={() => setSelectedIndex(idx)}
                style={{
                  paddingTop: '100%', position: 'relative', cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <img
                  src={photo.url}
                  alt={photo.nom || `Photo ${idx + 1}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {photo.nom && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '0.25rem 0.5rem',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                    color: 'white', fontSize: '0.65rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {photo.nom}
                  </div>
                )}
              </div>
              {/* Bouton supprimer sur la vignette */}
              {canEdit && (
                <button
                  onClick={(e) => handleDelete(photo, e)}
                  data-testid={`delete-photo-${photo.id}`}
                  style={{
                    position: 'absolute', top: '4px', right: '4px',
                    background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%',
                    width: '24px', height: '24px', color: 'white', fontSize: '0.7rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0,
                    opacity: 0.7, transition: 'opacity 0.15s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                  title="Supprimer cette photo"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '2rem', textAlign: 'center', backgroundColor: '#f9fafb',
          borderRadius: '12px', color: '#6b7280',
        }}>
          <p style={{ margin: 0 }}>Aucune photo dans la galerie</p>
          {canEdit && <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>Cliquez sur "Ajouter" pour télécharger des photos</p>}
        </div>
      )}

      {renderFullscreen()}
    </div>
  );
};

export default GaleriePhotosBatiment;
