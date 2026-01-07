import React, { useState, useEffect } from 'react';
import { apiPost } from '../utils/api';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

const InspectionPartieFacialeModal = ({ 
  isOpen, 
  onClose, 
  tenantSlug, 
  user, 
  equipement, 
  modele,
  onInspectionCreated 
}) => {
  const [saving, setSaving] = useState(false);
  const [reponses, setReponses] = useState({});
  const [remarques, setRemarques] = useState('');
  const [demanderRemplacement, setDemanderRemplacement] = useState(false);
  const [sectionActuelle, setSectionActuelle] = useState(0); // Pagination par section

  // Initialiser les réponses selon le modèle
  useEffect(() => {
    if (isOpen && modele) {
      const initialReponses = {};
      modele.sections?.forEach(section => {
        if (section.items && section.items.length > 0) {
          section.items.forEach(item => {
            initialReponses[item.id] = 'conforme'; // Par défaut conforme
          });
        } else {
          // Section sans items (radio simple pour la section entière)
          initialReponses[section.id] = 'conforme';
        }
      });
      setReponses(initialReponses);
      setRemarques('');
      setDemanderRemplacement(false);
      setSectionActuelle(0); // Réinitialiser la pagination
      
      // Bloquer le scroll du body sur iOS
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
    return () => {
      // Restaurer le scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen, modele]);

  const handleReponseChange = (itemId, value) => {
    setReponses(prev => ({
      ...prev,
      [itemId]: value
    }));
  };

  // Vérifier si l'inspection est conforme globalement
  const isConforme = () => {
    return Object.values(reponses).every(val => val === 'conforme');
  };

  const handleSubmit = async () => {
    if (!equipement || !modele) return;

    try {
      setSaving(true);
      
      const conforme = isConforme();

      const inspectionData = {
        equipement_id: equipement.id,
        equipement_nom: equipement.nom || 'Équipement',
        type_inspection: modele.frequence || 'mensuelle',
        modele_utilise_id: modele.id,
        reponses: reponses,
        conforme: conforme,
        remarques: remarques,
        creer_demande_remplacement: !conforme && demanderRemplacement
      };

      await apiPost(tenantSlug, '/parties-faciales/inspections', inspectionData);
      
      if (onInspectionCreated) {
        onInspectionCreated();
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de l\'enregistrement: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const conformeGlobal = isConforme();

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '0.5rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '600px',
          margin: '0.5rem auto',
          maxHeight: 'calc(100vh - 1rem)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ 
          padding: '1rem', 
          borderBottom: '1px solid #e5e7eb', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          borderRadius: '16px 16px 0 0',
          flexShrink: 0
        }}>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: '600' }}>
              🎭 Inspection Partie Faciale
            </h3>
            <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
              {modele?.nom || 'Formulaire d\'inspection'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.2)', 
              border: 'none', 
              color: 'white', 
              fontSize: '1.5rem', 
              cursor: 'pointer',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1rem',
          WebkitOverflowScrolling: 'touch'
        }}>
          {/* Info équipement */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
            backgroundColor: '#f5f3ff',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid #ddd6fe'
          }}>
            <div style={{ fontSize: '2.5rem' }}>🎭</div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#5b21b6' }}>
                {equipement?.nom || 'Équipement'}
              </h4>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#7c3aed' }}>
                #{equipement?.code_unique}
              </p>
              {equipement?.categorie_nom && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#8b5cf6' }}>
                  {equipement.categorie_nom}
                </p>
              )}
            </div>
          </div>

          {/* Sections du formulaire */}
          {modele?.sections?.map((section, sectionIndex) => (
            <div 
              key={section.id || sectionIndex}
              style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#fafafa',
                borderRadius: '12px',
                border: '1px solid #e5e7eb'
              }}
            >
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <span style={{ fontSize: '1.5rem' }}>{section.icone || '📋'}</span>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                  {section.titre}
                </h4>
              </div>

              {/* Si la section a des items */}
              {section.items && section.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {section.items.map((item, itemIndex) => (
                    <div 
                      key={item.id || itemIndex}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                      }}
                    >
                      <span style={{ fontSize: '0.9rem', flex: 1, minWidth: '150px' }}>
                        {item.nom}
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => handleReponseChange(item.id, 'conforme')}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            backgroundColor: reponses[item.id] === 'conforme' ? '#22c55e' : '#e5e7eb',
                            color: reponses[item.id] === 'conforme' ? 'white' : '#6b7280'
                          }}
                        >
                          ✅ OK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReponseChange(item.id, 'non_conforme')}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '500',
                            backgroundColor: reponses[item.id] === 'non_conforme' ? '#ef4444' : '#e5e7eb',
                            color: reponses[item.id] === 'non_conforme' ? 'white' : '#6b7280'
                          }}
                        >
                          ❌ NC
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Section radio simple (conforme/non conforme pour toute la section) */
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleReponseChange(section.id, 'conforme')}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '2px solid',
                      borderColor: reponses[section.id] === 'conforme' ? '#22c55e' : '#e5e7eb',
                      cursor: 'pointer',
                      backgroundColor: reponses[section.id] === 'conforme' ? '#dcfce7' : 'white',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>✅</span>
                    <span style={{ 
                      fontWeight: '600',
                      color: reponses[section.id] === 'conforme' ? '#166534' : '#6b7280'
                    }}>
                      Conforme
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReponseChange(section.id, 'non_conforme')}
                    style={{
                      flex: 1,
                      minWidth: '120px',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '2px solid',
                      borderColor: reponses[section.id] === 'non_conforme' ? '#ef4444' : '#e5e7eb',
                      cursor: 'pointer',
                      backgroundColor: reponses[section.id] === 'non_conforme' ? '#fee2e2' : 'white',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem' }}>❌</span>
                    <span style={{ 
                      fontWeight: '600',
                      color: reponses[section.id] === 'non_conforme' ? '#991b1b' : '#6b7280'
                    }}>
                      Non conforme
                    </span>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* Remarques */}
          <div style={{ marginBottom: '1.5rem' }}>
            <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
              📝 Remarques (optionnel)
            </Label>
            <Textarea
              value={remarques}
              onChange={(e) => setRemarques(e.target.value)}
              placeholder="Ajoutez des remarques si nécessaire..."
              rows={3}
              style={{ 
                width: '100%', 
                fontSize: '16px',
                borderRadius: '8px'
              }}
            />
          </div>

          {/* Résultat global */}
          <div style={{
            padding: '1rem',
            borderRadius: '12px',
            backgroundColor: conformeGlobal ? '#dcfce7' : '#fee2e2',
            border: `2px solid ${conformeGlobal ? '#86efac' : '#fca5a5'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <span style={{ fontSize: '2rem' }}>{conformeGlobal ? '✅' : '⚠️'}</span>
            <div>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '1.1rem',
                color: conformeGlobal ? '#166534' : '#991b1b'
              }}>
                {conformeGlobal ? 'CONFORME' : 'NON CONFORME'}
              </div>
              <div style={{ fontSize: '0.85rem', color: conformeGlobal ? '#15803d' : '#b91c1c' }}>
                {conformeGlobal 
                  ? 'Tous les critères sont validés' 
                  : 'Un ou plusieurs critères sont non conformes'}
              </div>
            </div>
          </div>

          {/* Option demande de remplacement si non conforme */}
          {!conformeGlobal && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.75rem',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={demanderRemplacement}
                  onChange={(e) => setDemanderRemplacement(e.target.checked)}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: '600', color: '#c2410c' }}>
                    🔄 Demander un remplacement
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#ea580c' }}>
                    Une demande de remplacement sera créée automatiquement
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ 
          padding: '1rem', 
          borderTop: '1px solid #e5e7eb', 
          display: 'flex', 
          gap: '0.75rem',
          flexShrink: 0,
          backgroundColor: '#fafafa',
          borderRadius: '0 0 16px 16px'
        }}>
          <Button 
            variant="outline" 
            onClick={onClose} 
            style={{ flex: 1 }}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button 
            onClick={handleSubmit} 
            style={{ 
              flex: 1, 
              backgroundColor: '#8b5cf6',
              color: 'white'
            }}
            disabled={saving}
          >
            {saving ? '⏳ Enregistrement...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionPartieFacialeModal;
