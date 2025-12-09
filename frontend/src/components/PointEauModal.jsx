import React, { useState, useEffect } from 'react';

const PointEauModal = ({ 
  point, 
  onClose, 
  onSave, 
  tenantSlug, 
  apiPost, 
  apiPut 
}) => {
  const [formData, setFormData] = useState({
    type: 'borne_fontaine',
    numero_identification: '',
    latitude: '',
    longitude: '',
    adresse: '',
    ville: 'Shefford',
    notes: '',
    // Bornes fontaines
    debit_gpm: '',
    pression_dynamique_psi: '',
    diametre_raccordement: '',
    etat: 'fonctionnelle',
    date_dernier_test: '',
    // Bornes sèches
    debit_max_statique_gpm: '',
    // Points d'eau statiques
    capacite_litres: '',
    accessibilite: 'facile',
    // Photos
    photos: []
  });
  
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Charger les données du point si modification
  useEffect(() => {
    if (point) {
      setFormData({
        type: point.type || 'borne_fontaine',
        numero_identification: point.numero_identification || '',
        latitude: point.latitude || '',
        longitude: point.longitude || '',
        adresse: point.adresse || '',
        ville: point.ville || 'Shefford',
        notes: point.notes || '',
        debit_gpm: point.debit_gpm || '',
        pression_dynamique_psi: point.pression_dynamique_psi || '',
        diametre_raccordement: point.diametre_raccordement || '',
        etat: point.etat || 'fonctionnelle',
        date_dernier_test: point.date_dernier_test || '',
        debit_max_statique_gpm: point.debit_max_statique_gpm || '',
        capacite_litres: point.capacite_litres || '',
        accessibilite: point.accessibilite || 'facile',
        photos: point.photos || []
      });
    }
  }, [point]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.type || !formData.latitude || !formData.longitude) {
      alert('Type et coordonnées GPS sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        statut_couleur: formData.etat === 'fonctionnelle' ? 'vert' : formData.etat === 'attention' ? 'jaune' : 'rouge'
      };

      if (point?.id) {
        await apiPut(tenantSlug, `/points-eau/${point.id}`, payload);
      } else {
        await apiPost(tenantSlug, '/points-eau', payload);
      }

      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('La photo est trop grande (max 5MB)');
      return;
    }

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result;
        setFormData(prev => ({
          ...prev,
          photos: [...prev.photos, base64]
        }));
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erreur upload:', error);
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (index) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '700px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 10
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937', margin: 0 }}>
            {point?.id ? '✏️ Modifier' : '➕ Ajouter'} un point d'eau
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
          {/* Type */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Type de point d'eau <span style={{ color: 'red' }}>*</span>
            </label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            >
              <option value="borne_fontaine">🔴 Borne fontaine</option>
              <option value="borne_seche">🟠 Borne sèche</option>
              <option value="point_eau_statique">💧 Point d'eau statique</option>
            </select>
          </div>

          {/* N° Identification */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              N° d'identification
            </label>
            <input
              type="text"
              value={formData.numero_identification}
              onChange={(e) => setFormData({ ...formData, numero_identification: e.target.value })}
              placeholder="Ex: BF-001, BS-001, PE-001"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>

          {/* Coordonnées GPS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Latitude <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                required
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="45.3778"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Longitude <span style={{ color: 'red' }}>*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                required
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="-72.6839"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>
          </div>

          {/* Adresse */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Adresse
            </label>
            <input
              type="text"
              value={formData.adresse}
              onChange={(e) => setFormData({ ...formData, adresse: e.target.value })}
              placeholder="123 rue Principale"
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>

          {/* Ville */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Ville
            </label>
            <input
              type="text"
              value={formData.ville}
              onChange={(e) => setFormData({ ...formData, ville: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem'
              }}
            />
          </div>

          {/* Champs spécifiques BORNE FONTAINE */}
          {formData.type === 'borne_fontaine' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Débit (GPM)
                  </label>
                  <input
                    type="number"
                    value={formData.debit_gpm}
                    onChange={(e) => setFormData({ ...formData, debit_gpm: e.target.value })}
                    placeholder="1500"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Pression dynamique (PSI)
                  </label>
                  <input
                    type="number"
                    value={formData.pression_dynamique_psi}
                    onChange={(e) => setFormData({ ...formData, pression_dynamique_psi: e.target.value })}
                    placeholder="50"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    Diamètre raccordement
                  </label>
                  <input
                    type="text"
                    value={formData.diametre_raccordement}
                    onChange={(e) => setFormData({ ...formData, diametre_raccordement: e.target.value })}
                    placeholder='6"'
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                    État
                  </label>
                  <select
                    value={formData.etat}
                    onChange={(e) => setFormData({ ...formData, etat: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '1rem'
                    }}
                  >
                    <option value="fonctionnelle">Fonctionnelle</option>
                    <option value="attention">Attention</option>
                    <option value="hors_service">Hors service</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Date dernier test
                </label>
                <input
                  type="date"
                  value={formData.date_dernier_test}
                  onChange={(e) => setFormData({ ...formData, date_dernier_test: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </>
          )}

          {/* Champs spécifiques BORNE SÈCHE */}
          {formData.type === 'borne_seche' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                Débit maximum statique (GPM)
              </label>
              <input
                type="number"
                value={formData.debit_max_statique_gpm}
                onChange={(e) => setFormData({ ...formData, debit_max_statique_gpm: e.target.value })}
                placeholder="2000"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              />
            </div>
          )}

          {/* Champs spécifiques POINT D'EAU STATIQUE */}
          {formData.type === 'point_eau_statique' && (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Capacité (litres)
                </label>
                <input
                  type="number"
                  value={formData.capacite_litres}
                  onChange={(e) => setFormData({ ...formData, capacite_litres: e.target.value })}
                  placeholder="50000"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
                  Accessibilité
                </label>
                <select
                  value={formData.accessibilite}
                  onChange={(e) => setFormData({ ...formData, accessibilite: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                >
                  <option value="facile">Facile</option>
                  <option value="moyenne">Moyenne</option>
                  <option value="difficile">Difficile</option>
                </select>
              </div>
            </>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notes importantes..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Photos */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.875rem' }}>
              Photos
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              disabled={uploadingPhoto}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}
            />
            {uploadingPhoto && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>Téléchargement...</p>}
            
            {/* Aperçu des photos */}
            {formData.photos.length > 0 && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {formData.photos.map((photo, index) => (
                  <div key={index} style={{ position: 'relative' }}>
                    <img
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #e5e7eb' }}
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      style={{
                        position: 'absolute',
                        top: '-8px',
                        right: '-8px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#f3f4f6',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                color: '#374151'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                background: loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Sauvegarde...' : (point?.id ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PointEauModal;
