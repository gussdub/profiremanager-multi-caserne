import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const CATEGORIES_PHOTOS = [
  { value: 'facade', label: '🏢 Façade' },
  { value: 'entree', label: '🚪 Entrée' },
  { value: 'systeme_alarme', label: "🚨 Système d'alarme" },
  { value: 'points_eau', label: "💧 Points d'eau" },
  { value: 'risques', label: '⚠️ Risques' },
  { value: 'autre', label: '📷 Autre' }
];

const GaleriePhotosBuilder = ({ photos, onPhotosChange }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleAddPhotos = async (newPhotos) => {
    const updatedPhotos = [...photos, ...newPhotos];
    onPhotosChange(updatedPhotos);
    setShowAddModal(false);
  };

  const handleEditPhoto = async (updatedPhoto) => {
    const updatedPhotos = photos.map(p => 
      p.id === updatedPhoto.id ? updatedPhoto : p
    );
    onPhotosChange(updatedPhotos);
    setEditingPhoto(null);
  };

  const handleDeletePhoto = (photoId) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    const updatedPhotos = photos.filter(p => p.id !== photoId);
    onPhotosChange(updatedPhotos);
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1rem'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
          📷 Galerie Photos ({photos.length})
        </h3>
        <Button onClick={() => setShowAddModal(true)}>
          ➕ Ajouter des Photos
        </Button>
      </div>

      {photos.length === 0 ? (
        <Card>
          <CardContent style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
            <p style={{ color: '#6B7280', marginBottom: '1rem' }}>
              Aucune photo ajoutée pour l'instant
            </p>
            <Button onClick={() => setShowAddModal(true)}>
              Ajouter la première photo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1rem'
        }}>
          {photos.map((photo) => (
            <Card key={photo.id} style={{ overflow: 'hidden' }}>
              <div style={{
                height: '200px',
                background: '#F3F4F6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
              }}>
                <img 
                  src={photo.url} 
                  alt={photo.titre}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              </div>
              <CardContent style={{ padding: '1rem' }}>
                <h4 style={{ 
                  margin: 0, 
                  marginBottom: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {photo.titre || 'Sans titre'}
                </h4>
                
                {photo.categorie && (
                  <div style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    background: '#EFF6FF',
                    color: '#1E40AF',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem'
                  }}>
                    {CATEGORIES_PHOTOS.find(c => c.value === photo.categorie)?.label || photo.categorie}
                  </div>
                )}

                {photo.description && (
                  <p style={{
                    fontSize: '0.875rem',
                    color: '#6B7280',
                    marginBottom: '0.5rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical'
                  }}>
                    {photo.description}
                  </p>
                )}

                {photo.localisation && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#9CA3AF',
                    marginBottom: '0.5rem'
                  }}>
                    📍 {photo.localisation}
                  </p>
                )}

                <div style={{ 
                  display: 'flex', 
                  gap: '0.5rem',
                  marginTop: '0.75rem'
                }}>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEditingPhoto(photo)}
                    style={{ flex: 1 }}
                  >
                    ✏️ Modifier
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDeletePhoto(photo.id)}
                    style={{ color: '#DC2626' }}
                  >
                    🗑️
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAddModal && (
        <PhotoUploadModal 
          onClose={() => setShowAddModal(false)}
          onSave={handleAddPhotos}
        />
      )}

      {editingPhoto && (
        <PhotoEditModal 
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onSave={handleEditPhoto}
        />
      )}
    </div>
  );
};

// Modal d'upload de photos
const PhotoUploadModal = ({ onClose, onSave }) => {
  const [files, setFiles] = useState([]);
  const [photoForms, setPhotoForms] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFilesSelect = (selectedFiles) => {
    const fileArray = Array.from(selectedFiles);
    
    // Vérifier la taille de chaque fichier
    const validFiles = fileArray.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        setError(`Le fichier "${file.name}" dépasse 10MB`);
        return false;
      }
      if (!file.type.startsWith('image/')) {
        setError(`Le fichier "${file.name}" n'est pas une image`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setError('');
    setUploading(true);

    // Lire tous les fichiers
    Promise.all(
      validFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              id: Math.random().toString(36).substring(7),
              file: file,
              preview: e.target.result,
              titre: file.name.split('.')[0],
              description: '',
              localisation: '',
              categorie: 'autre'
            });
          };
          reader.readAsDataURL(file);
        });
      })
    ).then(photosData => {
      setPhotoForms(photosData);
      setUploading(false);
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesSelect(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    // Valider que toutes les photos ont un titre
    const invalidPhotos = photoForms.filter(p => !p.titre.trim());
    if (invalidPhotos.length > 0) {
      setError('Toutes les photos doivent avoir un titre');
      return;
    }

    // Créer les objets photos finaux
    const photos = photoForms.map(form => ({
      id: form.id,
      url: form.preview, // Base64 data URL
      titre: form.titre,
      description: form.description,
      localisation: form.localisation,
      categorie: form.categorie,
      latitude: 0,
      longitude: 0,
      timestamp: new Date().toISOString()
    }));

    onSave(photos);
  };

  const updatePhotoForm = (id, field, value) => {
    setPhotoForms(photoForms.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const removePhoto = (id) => {
    setPhotoForms(photoForms.filter(p => p.id !== id));
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '2rem'
    }}>
      <Card style={{
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <CardHeader>
          <CardTitle>📷 Ajouter des Photos</CardTitle>
        </CardHeader>
        <CardContent>
          {photoForms.length === 0 ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              style={{
                border: `2px dashed ${isDragging ? '#3B82F6' : '#D1D5DB'}`,
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center',
                background: isDragging ? '#EFF6FF' : '#F9FAFB',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
              <p style={{ marginBottom: '1rem', color: '#6B7280' }}>
                Glissez-déposez des photos ici
              </p>
              <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#9CA3AF' }}>
                ou
              </p>
              <input
                type="file"
                accept="image/*"
                
                multiple
                onChange={(e) => handleFilesSelect(e.target.files)}
                style={{ display: 'none' }}
                id="photos-input"
              />
              <Button onClick={() => document.getElementById('photos-input').click()}>
                📷 Prendre des photos
              </Button>
              <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9CA3AF' }}>
                Max 10MB par photo • Tous formats image acceptés
              </p>
            </div>
          ) : (
            <div>
              <div style={{ 
                marginBottom: '1rem',
                padding: '1rem',
                background: '#F0F9FF',
                borderRadius: '6px'
              }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#0369A1' }}>
                  ℹ️ {photoForms.length} photo(s) sélectionnée(s). Remplissez les informations ci-dessous.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {photoForms.map((photo, index) => (
                  <Card key={photo.id} style={{ border: '1px solid #E5E7EB' }}>
                    <CardContent style={{ padding: '1.5rem' }}>
                      <div style={{ display: 'flex', gap: '1.5rem' }}>
                        {/* Prévisualisation */}
                        <div style={{ flexShrink: 0 }}>
                          <img 
                            src={photo.preview} 
                            alt="Preview"
                            style={{
                              width: '150px',
                              height: '150px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              border: '1px solid #E5E7EB'
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removePhoto(photo.id)}
                            style={{ 
                              width: '100%',
                              marginTop: '0.5rem',
                              color: '#DC2626'
                            }}
                          >
                            Retirer
                          </Button>
                        </div>

                        {/* Formulaire */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '600' }}>
                              Titre *
                            </label>
                            <input
                              type="text"
                              value={photo.titre}
                              onChange={(e) => updatePhotoForm(photo.id, 'titre', e.target.value)}
                              placeholder="Ex: Façade principale, Sortie de secours..."
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #E5E7EB',
                                borderRadius: '4px',
                                fontSize: '0.875rem'
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '600' }}>
                              Description
                            </label>
                            <textarea
                              value={photo.description}
                              onChange={(e) => updatePhotoForm(photo.id, 'description', e.target.value)}
                              placeholder="Ajoutez une description..."
                              rows={2}
                              style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: '1px solid #E5E7EB',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                                resize: 'vertical'
                              }}
                            />
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '600' }}>
                                Localisation
                              </label>
                              <input
                                type="text"
                                value={photo.localisation}
                                onChange={(e) => updatePhotoForm(photo.id, 'localisation', e.target.value)}
                                placeholder="Ex: 2e étage, entrée principale..."
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: '4px',
                                  fontSize: '0.875rem'
                                }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '600' }}>
                                Catégorie
                              </label>
                              <select
                                value={photo.categorie}
                                onChange={(e) => updatePhotoForm(photo.id, 'categorie', e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '0.5rem',
                                  border: '1px solid #E5E7EB',
                                  borderRadius: '4px',
                                  fontSize: '0.875rem'
                                }}
                              >
                                {CATEGORIES_PHOTOS.map(cat => (
                                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div style={{ 
                marginTop: '1.5rem',
                display: 'flex',
                justifyContent: 'center'
              }}>
                <Button
                  variant="outline"
                  onClick={() => document.getElementById('photos-input').click()}
                >
                  ➕ Ajouter d'autres photos
                </Button>
                <input
                  type="file"
                  accept="image/*"
                  
                  multiple
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files);
                    handleFilesSelect(newFiles);
                  }}
                  style={{ display: 'none' }}
                  id="photos-input"
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#FEE2E2',
              color: '#DC2626',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}

          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            justifyContent: 'flex-end',
            marginTop: '1.5rem'
          }}>
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            {photoForms.length > 0 && (
              <Button onClick={handleSubmit} disabled={uploading}>
                Ajouter {photoForms.length} photo(s)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Modal d'édition d'une photo
const PhotoEditModal = ({ photo, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    titre: photo.titre,
    description: photo.description,
    localisation: photo.localisation,
    categorie: photo.categorie
  });

  const handleSubmit = () => {
    if (!formData.titre.trim()) {
      alert('Le titre est requis');
      return;
    }
    onSave({ ...photo, ...formData });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <Card style={{
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <CardHeader>
          <CardTitle>✏️ Modifier la Photo</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Prévisualisation */}
            <div style={{ textAlign: 'center' }}>
              <img 
                src={photo.url} 
                alt={photo.titre}
                style={{
                  maxWidth: '100%',
                  maxHeight: '300px',
                  borderRadius: '8px',
                  border: '1px solid #E5E7EB'
                }}
              />
            </div>

            {/* Formulaire */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Titre *
              </label>
              <input
                type="text"
                value={formData.titre}
                onChange={(e) => setFormData({ ...formData, titre: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Localisation
              </label>
              <input
                type="text"
                value={formData.localisation}
                onChange={(e) => setFormData({ ...formData, localisation: e.target.value })}
                placeholder="Ex: 2e étage - côté est"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Catégorie
              </label>
              <select
                value={formData.categorie}
                onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px'
                }}
              >
                {CATEGORIES_PHOTOS.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={handleSubmit}>
                Enregistrer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GaleriePhotosBuilder;
export { CATEGORIES_PHOTOS };
