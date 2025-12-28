import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

// ==================== ONGLET BORNES SÈCHES ====================
const BornesSechesTab = ({ bornesSeches, onEdit, onDelete, onInspect, onCreate, user }) => {

  return (
    <div>
      {/* Bouton Ajouter */}
      {(user?.role === 'admin' || user?.role === 'superviseur') && (
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCreate}
            style={{
              padding: '12px 24px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            + Ajouter une borne sèche
          </button>
        </div>
      )}

      {/* Liste des bornes */}
      {bornesSeches.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          background: '#f8f9fa', 
          borderRadius: '12px',
          color: '#6c757d'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔥</div>
          <h3 style={{ marginBottom: '10px' }}>Aucune borne sèche</h3>
          <p>Ajoutez votre première borne sèche pour commencer</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {bornesSeches.map(borne => (
            <div key={borne.id} style={{
              background: 'white',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}>
              {/* Photo de la borne */}
              {borne.photo_borne && (
                <div style={{ marginBottom: '15px', borderRadius: '8px', overflow: 'hidden' }}>
                  <img 
                    src={borne.photo_borne} 
                    alt={borne.nom_borne}
                    style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                  />
                </div>
              )}

              {/* Titre */}
              <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '10px', color: '#2c3e50' }}>
                🔥 {borne.nom_borne}
              </h3>

              {/* Infos */}
              <div style={{ marginBottom: '15px', color: '#555', fontSize: '14px' }}>
                <p style={{ marginBottom: '5px' }}><strong>Municipalité:</strong> {borne.municipalite}</p>
                {borne.adresse_proximite && (
                  <p style={{ marginBottom: '5px' }}><strong>Adresse:</strong> {borne.adresse_proximite}</p>
                )}
                {borne.transversale && (
                  <p style={{ marginBottom: '5px' }}><strong>Transversale:</strong> {borne.transversale}</p>
                )}
                <p style={{ marginBottom: '5px' }}>
                  <strong>Type:</strong> {borne.type_borne} - {borne.angle} - {borne.diametre_tuyau}
                </p>
              </div>

              {/* Boutons d'action */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => onInspect(borne)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: '#27ae60',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  📋 Inspecter
                </button>
                {(user?.role === 'admin' || user?.role === 'superviseur') && (
                  <>
                    <button
                      onClick={() => onEdit(borne)}
                      style={{
                        padding: '10px',
                        background: '#3498db',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      title="Modifier"
                    >
                      ✏️
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        onClick={() => onDelete(borne.id)}
                        style={{
                          padding: '10px',
                          background: '#e74c3c',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px'
                        }}
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Modal pour créer/modifier une borne sèche
const BorneSecheModal = ({ borne, tenantSlug, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    nom_borne: borne?.nom_borne || '',
    municipalite: borne?.municipalite || 'Canton de Shefford',
    adresse_proximite: borne?.adresse_proximite || '',
    transversale: borne?.transversale || '',
    lien_itineraire: borne?.lien_itineraire || '',
    notes_importantes: borne?.notes_importantes || '',
    type_borne: borne?.type_borne || 'PVC',
    angle: borne?.angle || '90°',
    diametre_tuyau: borne?.diametre_tuyau || '6"',
    diametre_raccordement: borne?.diametre_raccordement || '6"',
    type_branchement: borne?.type_branchement || 'Fileté',
    photo_localisation: borne?.photo_localisation || '',
    photo_borne: borne?.photo_borne || '',
    schema_1: borne?.schema_1 || '',
    schema_2: borne?.schema_2 || '',
    schema_3: borne?.schema_3 || '',
    schema_4: borne?.schema_4 || '',
    schema_5: borne?.schema_5 || ''
  });

  const handleFileUpload = (field, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (borne?.id) {
        await apiPut(tenantSlug, `/bornes-seches/templates/${borne.id}`, formData);
        alert('✅ Borne sèche modifiée avec succès');
      } else {
        await apiPost(tenantSlug, '/bornes-seches/templates', formData);
        alert('✅ Borne sèche créée avec succès');
      }
      onSuccess();
    } catch (error) {
      console.error('Erreur:', error);
      alert('❌ Erreur: ' + (error.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
      overflowY: 'auto'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '30px',
        margin: '20px 0'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '20px' }}>
          {borne ? 'Modifier' : 'Ajouter'} une Borne Sèche
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Informations générales */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              📋 Informations Générales
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Nom de la borne *
                </label>
                <input
                  type="text"
                  value={formData.nom_borne}
                  onChange={(e) => setFormData({...formData, nom_borne: e.target.value})}
                  required
                  placeholder="Ex: 11 Allard"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Municipalité
                </label>
                <input
                  type="text"
                  value={formData.municipalite}
                  onChange={(e) => setFormData({...formData, municipalite: e.target.value})}
                  placeholder="Canton de Shefford"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                Adresse à proximité
              </label>
              <input
                type="text"
                value={formData.adresse_proximite}
                onChange={(e) => setFormData({...formData, adresse_proximite: e.target.value})}
                placeholder="Ex: 11 chemin Allard"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Transversale
                </label>
                <input
                  type="text"
                  value={formData.transversale}
                  onChange={(e) => setFormData({...formData, transversale: e.target.value})}
                  placeholder="Ex: Route 243"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Lien Itinéraire Google Maps
                </label>
                <input
                  type="url"
                  value={formData.lien_itineraire}
                  onChange={(e) => setFormData({...formData, lien_itineraire: e.target.value})}
                  placeholder="https://maps.app.goo.gl/..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                Notes Importantes
              </label>
              <textarea
                value={formData.notes_importantes}
                onChange={(e) => setFormData({...formData, notes_importantes: e.target.value})}
                placeholder="Ex: Allumer vos gyrophares..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #ced4da',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          {/* Caractéristiques techniques */}
          <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              🔧 Caractéristiques Techniques
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Type de borne
                </label>
                <input
                  type="text"
                  value={formData.type_borne}
                  onChange={(e) => setFormData({...formData, type_borne: e.target.value})}
                  placeholder="PVC"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Angle
                </label>
                <input
                  type="text"
                  value={formData.angle}
                  onChange={(e) => setFormData({...formData, angle: e.target.value})}
                  placeholder="90°"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Type branchement
                </label>
                <input
                  type="text"
                  value={formData.type_branchement}
                  onChange={(e) => setFormData({...formData, type_branchement: e.target.value})}
                  placeholder="Fileté"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Diamètre tuyau
                </label>
                <input
                  type="text"
                  value={formData.diametre_tuyau}
                  onChange={(e) => setFormData({...formData, diametre_tuyau: e.target.value})}
                  placeholder='6"'
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '14px' }}>
                  Diamètre raccordement
                </label>
                <input
                  type="text"
                  value={formData.diametre_raccordement}
                  onChange={(e) => setFormData({...formData, diametre_raccordement: e.target.value})}
                  placeholder='6"'
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #ced4da',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Photos et Schémas */}
          <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px', color: '#34495e' }}>
              📸 Photos et Schémas
            </h3>
            <p style={{ fontSize: '13px', color: '#6c757d', marginBottom: '15px' }}>
              Uploadez les images (JPG/PNG). Les images seront stockées en Base64.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              {['photo_localisation', 'photo_borne', 'schema_1', 'schema_2', 'schema_3', 'schema_4', 'schema_5'].map((field, idx) => {
                const labels = {
                  photo_localisation: 'Photo de localisation',
                  photo_borne: 'Photo de la borne',
                  schema_1: 'Schéma 1 (Centre borne)',
                  schema_2: 'Schéma 2 (Centre entrée pompe)',
                  schema_3: 'Schéma 3 (Centre sortie borne)',
                  schema_4: 'Schéma 4 (Distance borne-berge)',
                  schema_5: 'Schéma 5 (Sortie-entrée)'
                };

                return (
                  <div key={field} style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600', fontSize: '13px' }}>
                      {labels[field]}
                    </label>
                    {formData[field] && (
                      <img 
                        src={formData[field]} 
                        alt={labels[field]}
                        style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '6px', marginBottom: '5px' }}
                      />
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) handleFileUpload(field, file);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #ced4da',
                        fontSize: '13px'
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '25px', paddingTop: '20px', borderTop: '1px solid #dee2e6' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};



export { BornesSechesTab, BorneSecheModal };
export default BornesSechesTab;
