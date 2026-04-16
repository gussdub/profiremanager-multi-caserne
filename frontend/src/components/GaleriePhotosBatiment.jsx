import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { apiGet, apiPost, apiPut, apiDelete, buildApiUrl, getTenantToken } from '../utils/api';
import imageCompression from 'browser-image-compression';
import axios from 'axios';
import { GripVertical, Pencil, Check, X } from 'lucide-react';

const GaleriePhotosBatiment = ({ 
  tenantSlug, 
  batimentId, 
  canEdit = true 
}) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editingLegende, setEditingLegende] = useState(null);
  const [legendeValue, setLegendeValue] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

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
        // Chercher avec entity_type=batiment ET DossierAdresse (PFM Transfer)
        const results = await Promise.allSettled([
          apiGet(tenantSlug, `/files/by-entity/batiment/${batimentId}`),
          apiGet(tenantSlug, `/files/by-entity/DossierAdresse/${batimentId}`),
          apiGet(tenantSlug, `/files/by-entity/Intervention/${batimentId}`),
        ]);
        const allFiles = [];
        const seenIds = new Set();
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value?.files) {
            for (const f of r.value.files) {
              if (!seenIds.has(f.id)) {
                seenIds.add(f.id);
                allFiles.push(f);
              }
            }
          }
        }
        importedPhotos = allFiles
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

  // Keyboard navigation in fullscreen
  useEffect(() => {
    if (selectedIndex < 0) return;
    const handler = (e) => {
      if (e.key === 'ArrowRight') setSelectedIndex(i => (i + 1) % photos.length);
      else if (e.key === 'ArrowLeft') setSelectedIndex(i => (i - 1 + photos.length) % photos.length);
      else if (e.key === 'Escape') setSelectedIndex(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, photos.length]);

  // === DRAG & DROP ===
  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Transparent drag image
    const el = e.currentTarget;
    el.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = '1';
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) setDragOverIndex(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) return;

    const newPhotos = [...photos];
    const [moved] = newPhotos.splice(dragIndex, 1);
    newPhotos.splice(dropIndex, 0, moved);
    setPhotos(newPhotos);
    setHasChanges(true);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  // === LEGEND EDITING ===
  const startEditLegende = (photo, e) => {
    if (e) e.stopPropagation();
    setEditingLegende(photo.id);
    setLegendeValue(photo.legende || photo.nom || '');
  };

  const saveLegende = (photoId, e) => {
    if (e) e.stopPropagation();
    setPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, legende: legendeValue } : p
    ));
    setEditingLegende(null);
    setHasChanges(true);
  };

  const cancelEditLegende = (e) => {
    if (e) e.stopPropagation();
    setEditingLegende(null);
  };

  // === SAVE ORDER + LEGENDS ===
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const legacyPhotos = photos.filter(p => p.source === 'legacy');
      if (legacyPhotos.length > 0) {
        await apiPut(tenantSlug, `/prevention/batiments/${batimentId}/photos/reorder`, {
          photos: legacyPhotos.map(p => ({ id: p.id, legende: p.legende || '' })),
        });
      }
      setHasChanges(false);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

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
      alert("Erreur lors de l'upload");
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

  // === FULLSCREEN ===
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
        <div style={{
          position: 'absolute', top: '1rem', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500,
        }}>
          {selectedIndex + 1} / {photos.length}
        </div>
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
          >&#8249;</button>
        )}
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
          >&#8250;</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setSelectedIndex(-1); }}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: '40px', height: '40px', color: 'white', fontSize: '1.25rem',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
          }}
        >&#10005;</button>
        {canEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(selectedPhoto); }}
            style={{
              position: 'absolute', bottom: '1.5rem', right: '1.5rem',
              background: '#ef4444', border: 'none', borderRadius: '8px',
              padding: '0.6rem 1.2rem', color: 'white', cursor: 'pointer',
              fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
            }}
          >Supprimer</button>
        )}
        <div style={{
          position: 'absolute', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', textAlign: 'center',
          maxWidth: '60vw',
        }}>
          <div style={{ fontWeight: 600 }}>{selectedPhoto.legende || selectedPhoto.nom}</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Galerie Photos
          <span style={{
            backgroundColor: '#3b82f6', color: 'white',
            padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem',
          }}>
            {photos.length}
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saving}
              data-testid="save-photos-order"
              style={{ fontSize: '0.8rem' }}
            >
              {saving ? 'Sauvegarde...' : 'Enregistrer'}
            </Button>
          )}
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
      </div>

      {/* Grid */}
      {photos.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}>
          {photos.map((photo, idx) => (
            <div
              key={photo.id || idx}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              data-testid={`photo-card-${photo.id}`}
              style={{
                position: 'relative',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#fff',
                border: dragOverIndex === idx ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                boxShadow: dragIndex === idx ? '0 8px 25px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Drag handle */}
              {canEdit && (
                <div style={{
                  position: 'absolute', top: 6, left: 6, zIndex: 2,
                  background: 'rgba(0,0,0,0.45)', borderRadius: 6, padding: '3px 4px',
                  cursor: 'grab', display: 'flex', alignItems: 'center',
                }}>
                  <GripVertical size={14} color="#fff" />
                </div>
              )}

              {/* Delete button */}
              {canEdit && (
                <button
                  onClick={(e) => handleDelete(photo, e)}
                  data-testid={`delete-photo-${photo.id}`}
                  style={{
                    position: 'absolute', top: 6, right: 6, zIndex: 2,
                    background: 'rgba(239,68,68,0.85)', border: 'none', borderRadius: '50%',
                    width: 22, height: 22, color: 'white', fontSize: '0.65rem',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0.7, transition: 'opacity 0.15s',
                  }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                  title="Supprimer"
                >&#10005;</button>
              )}

              {/* Image */}
              <div
                onClick={() => setSelectedIndex(idx)}
                style={{ paddingTop: '75%', position: 'relative', cursor: 'pointer' }}
              >
                <img
                  src={photo.url}
                  alt={photo.legende || photo.nom || `Photo ${idx + 1}`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>

              {/* Legend */}
              <div style={{ padding: '8px 10px', borderTop: '1px solid #f1f5f9', minHeight: 36 }}>
                {editingLegende === photo.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={legendeValue}
                      onChange={(e) => setLegendeValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveLegende(photo.id); if (e.key === 'Escape') cancelEditLegende(); }}
                      style={{
                        flex: 1, fontSize: '0.75rem', padding: '3px 6px',
                        border: '1px solid #d1d5db', borderRadius: 4, outline: 'none',
                      }}
                      data-testid={`legende-input-${photo.id}`}
                    />
                    <button onClick={(e) => saveLegende(photo.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Check size={14} color="#22c55e" />
                    </button>
                    <button onClick={cancelEditLegende} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <X size={14} color="#ef4444" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={(e) => { if (canEdit) { e.stopPropagation(); startEditLegende(photo, e); } }}
                    style={{
                      fontSize: '0.75rem', color: photo.legende ? '#374151' : '#9ca3af',
                      cursor: canEdit ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 4,
                      minHeight: 20,
                    }}
                    data-testid={`legende-display-${photo.id}`}
                    title={canEdit ? 'Cliquer pour modifier la légende' : ''}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {photo.legende || photo.nom || 'Ajouter une légende...'}
                    </span>
                    {canEdit && <Pencil size={11} color="#9ca3af" />}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '2rem', textAlign: 'center', backgroundColor: '#f9fafb',
          borderRadius: '12px', color: '#6b7280',
        }}>
          <p style={{ margin: 0 }}>Aucune photo dans la galerie</p>
          {canEdit && <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>Cliquez sur "Ajouter" pour ajouter des photos</p>}
        </div>
      )}

      {renderFullscreen()}
    </div>
  );
};

export default GaleriePhotosBatiment;
