import React, { useState, useEffect } from 'react';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { Button } from './ui/button';
import { Card } from './ui/card';
import axios from 'axios';
import { buildApiUrl } from '../utils/api';

const BatimentDetailModal = ({ 
  batiment, 
  onClose, 
  onUpdate, 
  onCreate,
  onInspect,
  onCreatePlan,
  onViewHistory,
  onGenerateReport,
  onDelete,
  canEdit,
  tenantSlug 
}) => {
  const isCreating = !batiment;
  const [isEditing, setIsEditing] = useState(isCreating);
  const [editData, setEditData] = useState(isCreating ? {
    nom: '',
    adresse_civique: '',
    ville: '',
    province: 'QC',
    code_postal: '',
    latitude: null,
    longitude: null,
    categorie_officielle: '',
    niveau_risque: 'Moyen',
    risques_identifies: [],
    cadastre_matricule: '',
    valeur_fonciere: '',
    nombre_etages: '',
    annee_construction: '',
    superficie_totale_m2: '',
    contact_principal_nom: '',
    contact_principal_telephone: '',
    contact_principal_email: '',
    notes: ''
  } : {});
  const [inspections, setInspections] = useState([]);
  const [saving, setSaving] = useState(false);
  const [streetViewUrl, setStreetViewUrl] = useState('');

  const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

  // Couleurs selon niveau de risque
  const riskColors = {
    'Faible': { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    'Moyen': { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    'Élevé': { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    'Très élevé': { bg: '#fecaca', border: '#dc2626', text: '#7f1d1d' }
  };

  const riskColor = riskColors[editData.niveau_risque || batiment?.niveau_risque] || riskColors['Moyen'];

  useEffect(() => {
    if (batiment) {
      setEditData({ ...batiment });
      fetchInspections();
      generateStreetViewUrl();
    }
  }, [batiment]);

  const generateStreetViewUrl = () => {
    if (batiment.latitude && batiment.longitude) {
      const url = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${batiment.latitude},${batiment.longitude}&key=${GOOGLE_MAPS_API_KEY}`;
      setStreetViewUrl(url);
    } else if (batiment.adresse_civique && batiment.ville) {
      const address = encodeURIComponent(`${batiment.adresse_civique}, ${batiment.ville}`);
      const url = `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${address}&key=${GOOGLE_MAPS_API_KEY}`;
      setStreetViewUrl(url);
    }
  };

  const fetchInspections = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        buildApiUrl(`/${tenantSlug}/prevention/inspections?batiment_id=${batiment.id}&limit=5`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInspections(response.data.slice(0, 5));
    } catch (error) {
      console.error('Erreur chargement inspections:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isCreating) {
        await onCreate(editData);
      } else {
        await onUpdate(editData);
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field, value) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div 
      className="modal-overlay" 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '1rem'
      }}
    >
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          maxWidth: '1200px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Header avec photo et niveau de risque */}
        <div style={{
          position: 'relative',
          height: '200px',
          overflow: 'hidden',
          backgroundColor: '#1f2937'
        }}>
          {streetViewUrl && (
            <img 
              src={streetViewUrl} 
              alt="Vue du bâtiment"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.7
              }}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          )}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7))',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '2rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ 
                  color: 'white', 
                  fontSize: '2rem', 
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  {isCreating ? '➕ Nouveau Bâtiment' : (editData.nom_etablissement || 'Sans nom')}
                </h1>
                {!isCreating && (
                  <p style={{ color: '#e5e7eb', fontSize: '1rem' }}>
                    📍 {editData.adresse_civique}, {editData.ville}
                  </p>
                )}
              </div>
              <div style={{
                backgroundColor: riskColor.bg,
                border: `3px solid ${riskColor.border}`,
                color: riskColor.text,
                padding: '0.75rem 1.5rem',
                borderRadius: '2rem',
                fontWeight: 'bold',
                fontSize: '1.125rem'
              }}>
                🔥 Risque: {editData.niveau_risque || 'Non défini'}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✖
          </button>
        </div>

        {/* Contenu principal avec scroll */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2rem'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 400px',
            gap: '2rem'
          }}>
            {/* Colonne gauche - Informations */}
            <div>
              {/* Actions rapides */}
              <div style={{ 
                display: 'flex', 
                gap: '0.5rem', 
                marginBottom: '1.5rem',
                flexWrap: 'wrap'
              }}>
                <Button 
                  onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                  disabled={saving}
                  style={{ backgroundColor: '#3b82f6' }}
                >
                  {isCreating ? (saving ? '💾 Création...' : '✅ Créer le bâtiment') : (isEditing ? (saving ? '💾 Sauvegarde...' : '💾 Sauvegarder') : '✏️ Modifier')}
                </Button>
                {isEditing && !isCreating && (
                  <Button 
                    onClick={() => {
                      setIsEditing(false);
                      setEditData({ ...batiment });
                    }}
                    variant="outline"
                  >
                    ❌ Annuler
                  </Button>
                )}
                {!isEditing && (
                  <>
                    <Button onClick={onInspect} style={{ backgroundColor: '#10b981' }}>
                      🔍 Inspecter
                    </Button>
                    <Button onClick={onCreatePlan} variant="outline">
                      🗺️ Plan intervention
                    </Button>
                    <Button onClick={onViewHistory} variant="outline">
                      📜 Historique complet
                    </Button>
                    <Button onClick={onGenerateReport} variant="outline">
                      📄 Générer rapport
                    </Button>
                    {canEdit && (
                      <Button 
                        onClick={onDelete}
                        variant="outline"
                        style={{ 
                          borderColor: '#ef4444', 
                          color: '#ef4444' 
                        }}
                      >
                        🗑️ Supprimer
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Informations générales */}
              <Card style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  🏢 Informations générales
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Nom établissement
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.nom_etablissement || ''}
                        onChange={(e) => handleChange('nom_etablissement', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem'
                        }}
                      />
                    ) : (
                      <p style={{ marginTop: '0.25rem' }}>{editData.nom_etablissement || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Code postal
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.code_postal || ''}
                        onChange={(e) => handleChange('code_postal', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem'
                        }}
                      />
                    ) : (
                      <p style={{ marginTop: '0.25rem' }}>{editData.code_postal || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Cadastre/Matricule
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.cadastre_matricule || ''}
                        onChange={(e) => handleChange('cadastre_matricule', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem'
                        }}
                      />
                    ) : (
                      <p style={{ marginTop: '0.25rem' }}>{editData.cadastre_matricule || 'N/A'}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Valeur foncière
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editData.valeur_fonciere || ''}
                        onChange={(e) => handleChange('valeur_fonciere', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem'
                        }}
                      />
                    ) : (
                      <p style={{ marginTop: '0.25rem' }}>{editData.valeur_fonciere || 'N/A'}</p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Classification */}
              <Card style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  fontWeight: '600', 
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📊 Classification
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Groupe occupation
                    </label>
                    <p style={{ marginTop: '0.25rem', fontWeight: '600' }}>
                      {editData.groupe_occupation || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Sous-groupe
                    </label>
                    <p style={{ marginTop: '0.25rem' }}>{editData.sous_groupe || 'N/A'}</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontWeight: '500', fontSize: '0.875rem', color: '#6b7280' }}>
                      Description activité
                    </label>
                    {isEditing ? (
                      <textarea
                        value={editData.description_activite || ''}
                        onChange={(e) => handleChange('description_activite', e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          marginTop: '0.25rem',
                          minHeight: '60px'
                        }}
                      />
                    ) : (
                      <p style={{ marginTop: '0.25rem' }}>{editData.description_activite || 'N/A'}</p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Contacts */}
              {(editData.proprietaire_nom || editData.gerant_nom || isEditing) && (
                <Card style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                  <h3 style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '600', 
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    👥 Contacts
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div>
                      <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Propriétaire</h4>
                      {['proprietaire_nom', 'proprietaire_telephone', 'proprietaire_courriel'].map(field => (
                        <div key={field} style={{ marginBottom: '0.5rem' }}>
                          <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {field.split('_')[1]}
                          </label>
                          {isEditing ? (
                            <input
                              type={field.includes('courriel') ? 'email' : 'text'}
                              value={editData[field] || ''}
                              onChange={(e) => handleChange(field, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.375rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem'
                              }}
                            />
                          ) : (
                            <p style={{ fontSize: '0.875rem' }}>{editData[field] || 'N/A'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div>
                      <h4 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Gérant</h4>
                      {['gerant_nom', 'gerant_telephone', 'gerant_courriel'].map(field => (
                        <div key={field} style={{ marginBottom: '0.5rem' }}>
                          <label style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {field.split('_')[1]}
                          </label>
                          {isEditing ? (
                            <input
                              type={field.includes('courriel') ? 'email' : 'text'}
                              value={editData[field] || ''}
                              onChange={(e) => handleChange(field, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.375rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.875rem'
                              }}
                            />
                          ) : (
                            <p style={{ fontSize: '0.875rem' }}>{editData[field] || 'N/A'}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Historique des inspections */}
              {inspections.length > 0 && !isEditing && (
                <Card style={{ padding: '1.5rem' }}>
                  <h3 style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '600', 
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    📋 Dernières inspections ({inspections.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {inspections.map(insp => (
                      <div 
                        key={insp.id}
                        style={{
                          padding: '1rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '0.5rem',
                          border: '1px solid #e5e7eb',
                          cursor: 'pointer'
                        }}
                        onClick={() => {/* TODO: Ouvrir inspection */}}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: '600' }}>
                              📅 {new Date(insp.date_inspection).toLocaleDateString('fr-CA')}
                            </p>
                            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              Type: {insp.type_inspection}
                            </p>
                          </div>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '1rem',
                            fontSize: '0.75rem',
                            backgroundColor: insp.conformite === 'conforme' ? '#d1fae5' : '#fee2e2',
                            color: insp.conformite === 'conforme' ? '#065f46' : '#991b1b'
                          }}>
                            {insp.conformite === 'conforme' ? '✅ Conforme' : '❌ Non-conforme'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>

            {/* Colonne droite - Carte */}
            {!isEditing && editData.latitude && editData.longitude && (
              <div>
                <Card style={{ padding: '1rem', height: '100%' }}>
                  <h3 style={{ 
                    fontSize: '1rem', 
                    fontWeight: '600', 
                    marginBottom: '1rem'
                  }}>
                    📍 Localisation
                  </h3>
                  <div style={{ height: '400px', borderRadius: '0.5rem', overflow: 'hidden' }}>
                    <Map
                      defaultCenter={{ lat: editData.latitude, lng: editData.longitude }}
                      defaultZoom={18}
                      mapId="batiment_detail_map"
                      mapTypeId="satellite"
                    >
                      <AdvancedMarker
                        position={{ lat: editData.latitude, lng: editData.longitude }}
                      >
                        <div style={{
                          backgroundColor: riskColor.border,
                          padding: '0.5rem',
                          borderRadius: '50%',
                          border: '3px solid white',
                          fontSize: '1.5rem'
                        }}>
                          🏢
                        </div>
                      </AdvancedMarker>
                    </Map>
                  </div>
                  <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    <p><strong>Coordonnées:</strong></p>
                    <p>Lat: {editData.latitude.toFixed(6)}</p>
                    <p>Lng: {editData.longitude.toFixed(6)}</p>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatimentDetailModal;
