import React, { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const CATEGORIES = [
  { value: 'hydrants', label: '💧 Hydrants' },
  { value: 'sorties', label: '🚪 Sorties' },
  { value: 'matieres_dangereuses', label: '☢️ Matières dangereuses' },
  { value: 'generateurs', label: '⚡ Générateurs' },
  { value: 'gaz_naturel', label: '🔥 Gaz naturel' },
  { value: 'propane', label: '🛢️ Propane' },
  { value: 'vehicules', label: '🚗 Véhicules' },
  { value: 'autre', label: '📌 Autre' }
];

const IconePersonnaliseeModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    nom: '',
    categorie: 'hydrants',
    image_base64: ''
  });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = (file) => {
    if (!file) return;

    // Vérifier la taille (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('La taille du fichier ne doit pas dépasser 10MB');
      return;
    }

    // Vérifier le type
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une image');
      return;
    }

    setError('');
    setUploading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      setFormData({ ...formData, image_base64: base64 });
      setPreviewUrl(base64);
      setUploading(false);
    };
    reader.onerror = () => {
      setError('Erreur lors de la lecture du fichier');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  };

  const handleSubmit = async () => {
    if (!formData.nom.trim()) {
      setError('Le nom est requis');
      return;
    }
    if (!formData.image_base64) {
      setError('Veuillez sélectionner une image');
      return;
    }

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message || 'Erreur lors de la sauvegarde');
    }
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
      zIndex: 100000
    }}>
      <Card style={{
        width: '90%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <CardHeader>
          <CardTitle>➕ Créer une Icône Personnalisée</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Nom */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Nom de l'icône *
              </label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ex: Hydrant spécial, Sortie secondaire..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              />
            </div>

            {/* Catégorie */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Catégorie *
              </label>
              <select
                value={formData.categorie}
                onChange={(e) => setFormData({ ...formData, categorie: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  fontSize: '1rem'
                }}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Upload zone */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Image *
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                  border: `2px dashed ${isDragging ? '#3B82F6' : '#D1D5DB'}`,
                  borderRadius: '8px',
                  padding: '2rem',
                  textAlign: 'center',
                  background: isDragging ? '#EFF6FF' : '#F9FAFB',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {previewUrl ? (
                  <div>
                    <img 
                      src={previewUrl} 
                      alt="Prévisualisation" 
                      style={{ 
                        maxWidth: '200px', 
                        maxHeight: '200px', 
                        margin: '0 auto',
                        display: 'block',
                        borderRadius: '4px'
                      }} 
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPreviewUrl(null);
                        setFormData({ ...formData, image_base64: '' });
                      }}
                      style={{ marginTop: '1rem' }}
                    >
                      Changer l'image
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📸</div>
                    <p style={{ marginBottom: '1rem', color: '#6B7280' }}>
                      Glissez-déposez une image ici
                    </p>
                    <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#9CA3AF' }}>
                      ou
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      
                      onChange={handleFileInput}
                      style={{ display: 'none' }}
                      id="file-input"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('file-input').click()}
                    >
                      📷 Prendre une photo
                    </Button>
                    <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9CA3AF' }}>
                      Max 10MB • Tous formats image acceptés
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div style={{
                padding: '0.75rem',
                background: '#FEE2E2',
                color: '#DC2626',
                borderRadius: '6px',
                fontSize: '0.875rem'
              }}>
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={uploading}>
                {uploading ? 'Chargement...' : 'Créer l\'icône'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IconePersonnaliseeModal;
