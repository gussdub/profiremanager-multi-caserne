import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const PointEauModal = ({ point, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: point?.type || 'borne_fontaine',
    numero_identification: point?.numero_identification || '',
    latitude: point?.latitude || '',
    longitude: point?.longitude || '',
    adresse: point?.adresse || '',
    ville: point?.ville || '',
    notes: point?.notes || '',
    // Champs spécifiques
    debit_gpm: point?.debit_gpm || '',
    marque: point?.marque || '',
    modele: point?.modele || '',
    etat: point?.etat || 'fonctionnel',
    etat_raccords: point?.etat_raccords || 'bon',
    accessibilite: point?.accessibilite || 'facile',
    capacite_litres: point?.capacite_litres || '',
    profondeur_metres: point?.profondeur_metres || '',
    etat_eau: point?.etat_eau || 'propre',
    type_source: point?.type_source || 'etang',
    frequence_inspection_mois: point?.frequence_inspection_mois || (point?.type === 'borne_seche' ? 6 : 12)
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (point?.id) {
        await apiPut(tenantSlug, `/points-eau/${point.id}`, formData);
        toast({
          title: "Succès",
          description: "Point d'eau modifié avec succès"
        });
      } else {
        await apiPost(tenantSlug, '/points-eau', formData);
        toast({
          title: "Succès",
          description: "Point d'eau créé avec succès"
        });
      }
      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '2rem'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem' }}>
          {point ? 'Modifier' : 'Ajouter'} un point d'eau
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Type */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Type de point d'eau *
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            >
              <option value="borne_fontaine">⛲ Borne-fontaine</option>
              <option value="borne_seche">🔥 Borne sèche</option>
              <option value="point_eau_statique">💧 Point d'eau statique</option>
            </select>
          </div>

          {/* Informations de base */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                N° Identification *
              </label>
              <input
                type="text"
                value={formData.numero_identification}
                onChange={(e) => setFormData({...formData, numero_identification: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: BF-001"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Ville
              </label>
              <input
                type="text"
                value={formData.ville}
                onChange={(e) => setFormData({...formData, ville: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                placeholder="Ex: Montréal"
              />
            </div>
          </div>

          {/* Adresse */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Adresse
            </label>
            <input
              type="text"
              value={formData.adresse}
              onChange={(e) => setFormData({...formData, adresse: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              placeholder="Ex: 123 Rue Principale"
            />
          </div>

          {/* Coordonnées GPS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Latitude *
              </label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => setFormData({...formData, latitude: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: 45.5017"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Longitude *
              </label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => setFormData({...formData, longitude: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                required
                placeholder="Ex: -73.5673"
              />
            </div>
          </div>

          {/* Champs spécifiques selon le type */}
          {(formData.type === 'borne_fontaine' || formData.type === 'borne_seche') && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Débit (GPM)
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.debit_gpm}
                  onChange={(e) => setFormData({...formData, debit_gpm: parseFloat(e.target.value)})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                  placeholder="Ex: 1000"
                />
              </div>
              {formData.type === 'borne_fontaine' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    État
                  </label>
                  <select
                    value={formData.etat}
                    onChange={(e) => setFormData({...formData, etat: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="fonctionnel">Fonctionnel</option>
                    <option value="defectueux">Défectueux</option>
                    <option value="inaccessible">Inaccessible</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {formData.type === 'borne_seche' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  État des raccords
                </label>
                <select
                  value={formData.etat_raccords}
                  onChange={(e) => setFormData({...formData, etat_raccords: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bon">Bon</option>
                  <option value="moyen">Moyen</option>
                  <option value="mauvais">Mauvais</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Accessibilité
                </label>
                <select
                  value={formData.accessibilite}
                  onChange={(e) => setFormData({...formData, accessibilite: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="facile">Facile</option>
                  <option value="difficile">Difficile</option>
                  <option value="inaccessible">Inaccessible</option>
                </select>
              </div>
            </div>
          )}

          {formData.type === 'point_eau_statique' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Type de source
                  </label>
                  <select
                    value={formData.type_source}
                    onChange={(e) => setFormData({...formData, type_source: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="etang">Étang</option>
                    <option value="bassin">Bassin</option>
                    <option value="riviere">Rivière</option>
                    <option value="lac">Lac</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Accessibilité
                  </label>
                  <select
                    value={formData.accessibilite}
                    onChange={(e) => setFormData({...formData, accessibilite: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                  >
                    <option value="vehicule">Véhicule</option>
                    <option value="pied">À pied</option>
                    <option value="difficile">Difficile</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Capacité (litres)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.capacite_litres}
                    onChange={(e) => setFormData({...formData, capacite_litres: parseFloat(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Ex: 50000"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                    Profondeur (mètres)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.profondeur_metres}
                    onChange={(e) => setFormData({...formData, profondeur_metres: parseFloat(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.95rem'
                    }}
                    placeholder="Ex: 3.5"
                  />
                </div>
              </div>
            </>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder="Notes additionnelles..."
            />
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
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

// Modal pour créer une inspection
const InspectionModal = ({ point, onClose, onSave }) => {
  const { user, tenantSlug } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    point_eau_id: point?.id || '',
    inspecteur_id: user?.id || '',
    date_inspection: new Date().toISOString().split('T')[0],
    etat_general: 'conforme',
    debit_mesure_gpm: '',
    observations: '',
    defauts_constates: [],
    actions_requises: '',
    // Champs spécifiques bornes sèches
    etat_raccords: 'bon',
    test_pression_ok: true,
    // Champs spécifiques points statiques
    niveau_eau: 'moyen',
    accessibilite_verifiee: 'vehicule'
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiPost(tenantSlug, '/approvisionnement-eau/inspections', formData);
      toast({
        title: "Succès",
        description: "Inspection créée avec succès"
      });
      onSave();
    } catch (error) {
      console.error('Erreur:', error);
      toast({
        title: "Erreur",
        description: error.response?.data?.detail || "Une erreur est survenue",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '2rem'
      }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
          Nouvelle inspection - {point?.numero_identification}
        </h2>
        <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          Type: {point?.type === 'borne_fontaine' ? '⛲ Borne-fontaine' : 
                point?.type === 'borne_seche' ? '🔥 Borne sèche' : 
                '💧 Point d\'eau statique'}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Date inspection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Date d'inspection *
            </label>
            <input
              type="date"
              value={formData.date_inspection}
              onChange={(e) => setFormData({...formData, date_inspection: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            />
          </div>

          {/* État général */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              État général *
            </label>
            <select
              value={formData.etat_general}
              onChange={(e) => setFormData({...formData, etat_general: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem'
              }}
              required
            >
              <option value="conforme">✓ Conforme</option>
              <option value="non_conforme">⚠ Non conforme</option>
              <option value="defectueux">✗ Défectueux</option>
            </select>
          </div>

          {/* Débit mesuré */}
          {(point?.type === 'borne_fontaine' || point?.type === 'borne_seche') && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                Débit mesuré (GPM)
              </label>
              <input
                type="number"
                step="any"
                value={formData.debit_mesure_gpm}
                onChange={(e) => setFormData({...formData, debit_mesure_gpm: parseFloat(e.target.value)})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.95rem'
                }}
                placeholder="Ex: 1000"
              />
            </div>
          )}

          {/* Champs spécifiques bornes sèches */}
          {point?.type === 'borne_seche' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  État des raccords
                </label>
                <select
                  value={formData.etat_raccords}
                  onChange={(e) => setFormData({...formData, etat_raccords: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bon">Bon</option>
                  <option value="moyen">Moyen</option>
                  <option value="mauvais">Mauvais</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.5rem' }}>
                  <input
                    type="checkbox"
                    checked={formData.test_pression_ok}
                    onChange={(e) => setFormData({...formData, test_pression_ok: e.target.checked})}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.95rem', fontWeight: '600' }}>Test de pression OK</span>
                </label>
              </div>
            </div>
          )}

          {/* Champs spécifiques points statiques */}
          {point?.type === 'point_eau_statique' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Niveau d'eau
                </label>
                <select
                  value={formData.niveau_eau}
                  onChange={(e) => setFormData({...formData, niveau_eau: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="bas">Bas</option>
                  <option value="moyen">Moyen</option>
                  <option value="haut">Haut</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
                  Accessibilité vérifiée
                </label>
                <select
                  value={formData.accessibilite_verifiee}
                  onChange={(e) => setFormData({...formData, accessibilite_verifiee: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="vehicule">Véhicule</option>
                  <option value="pied">À pied</option>
                  <option value="difficile">Difficile</option>
                </select>
              </div>
            </div>
          )}

          {/* Observations */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Observations
            </label>
            <textarea
              value={formData.observations}
              onChange={(e) => setFormData({...formData, observations: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder="Observations générales..."
            />
          </div>

          {/* Actions requises */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600', fontSize: '0.95rem' }}>
              Actions requises
            </label>
            <textarea
              value={formData.actions_requises}
              onChange={(e) => setFormData({...formData, actions_requises: e.target.value})}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '0.95rem',
                minHeight: '80px',
                resize: 'vertical'
              }}
              placeholder="Actions à entreprendre..."
            />
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: '0.95rem'
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: '#10b981',
                color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '0.95rem',
                fontWeight: '600'
              }}
            >
              {loading ? 'Enregistrement...' : 'Enregistrer l\'inspection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};



export { PointEauModal, InspectionModal };
export default PointEauModal;
