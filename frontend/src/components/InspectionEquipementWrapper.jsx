import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';
import InspectionUnifieeModal from './InspectionUnifieeModal';

/**
 * Composant wrapper pour InspectionUnifieeModal qui charge le formulaire depuis son ID
 * et adapte les props pour les équipements génériques
 */
const InspectionEquipementWrapper = ({ 
  isOpen, 
  onClose, 
  tenantSlug, 
  user, 
  equipement,  // L'équipement avec modele_inspection_id
  onSuccess 
}) => {
  const [formulaire, setFormulaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && equipement?.modele_inspection_id) {
      loadFormulaire();
    }
  }, [isOpen, equipement?.modele_inspection_id]);

  const loadFormulaire = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet(tenantSlug, `/formulaires-inspection/${equipement.modele_inspection_id}`);
      setFormulaire(data);
    } catch (err) {
      console.error('Erreur chargement formulaire:', err);
      setError('Impossible de charger le formulaire d\'inspection');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Afficher un loader pendant le chargement
  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.75rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Chargement du formulaire...</p>
        </div>
      </div>
    );
  }

  // Afficher l'erreur s'il y en a une
  if (error) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '0.75rem',
          textAlign: 'center',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
          <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // Passer les props correctement au modal unifié
  return (
    <InspectionUnifieeModal
      isOpen={isOpen}
      onClose={onClose}
      tenantSlug={tenantSlug}
      user={user}
      equipement={{
        id: equipement.id,
        nom: equipement.nom,
        code_unique: equipement.code_unique,
        categorie_nom: equipement.categorie_nom,
        asset_type: 'equipement'
      }}
      formulaire={formulaire}
      onInspectionCreated={onSuccess}
    />
  );
};

export default InspectionEquipementWrapper;
