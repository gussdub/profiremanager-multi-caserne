import React, { useState, useEffect } from 'react';
import { apiPost } from '../utils/api';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';

const InspectionUnifieeModal = ({ 
  isOpen, 
  onClose, 
  tenantSlug, 
  user, 
  equipement,  // L'équipement ou EPI à inspecter
  formulaire,  // Le formulaire d'inspection à utiliser
  onInspectionCreated 
}) => {
  const [saving, setSaving] = useState(false);
  const [reponses, setReponses] = useState({});
  const [remarques, setRemarques] = useState('');
  const [demanderRemplacement, setDemanderRemplacement] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // Initialiser les réponses selon le formulaire
  useEffect(() => {
    if (isOpen && formulaire && user) {
      const initialReponses = {};
      formulaire.sections?.forEach(section => {
        section.items?.forEach(item => {
          // Valeur par défaut selon le type de champ
          switch (item.type) {
            case 'conforme_nc':
              initialReponses[item.id] = 'conforme';
              break;
            case 'oui_non':
              initialReponses[item.id] = 'oui';
              break;
            case 'nombre':
              initialReponses[item.id] = 0;
              break;
            case 'inspecteur':
              // Auto-remplir avec le nom de l'utilisateur connecté
              initialReponses[item.id] = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;
              break;
            case 'lieu':
              initialReponses[item.id] = '';
              break;
            case 'texte':
            case 'date':
            case 'liste':
            default:
              initialReponses[item.id] = '';
          }
        });
      });
      setReponses(initialReponses);
      setRemarques('');
      setDemanderRemplacement(false);
      
      // Bloquer le scroll du body sur iOS
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen, formulaire]);

  const handleReponseChange = (itemId, value) => {
    setReponses(prev => ({
      ...prev,
      [itemId]: value
    }));
  };

  // Vérifier si l'inspection est conforme globalement
  const isConforme = () => {
    let allConforme = true;
    formulaire?.sections?.forEach(section => {
      section.items?.forEach(item => {
        if (item.type === 'conforme_nc' && reponses[item.id] === 'non_conforme') {
          allConforme = false;
        }
        if (item.type === 'oui_non' && reponses[item.id] === 'non') {
          allConforme = false;
        }
      });
    });
    return allConforme;
  };

  const handleSubmit = async () => {
    if (!equipement || !formulaire) return;

    try {
      setSaving(true);
      
      const conforme = isConforme();

      const inspectionData = {
        equipement_id: equipement.id,
        equipement_nom: equipement.nom || equipement.type_epi || 'Équipement',
        formulaire_id: formulaire.id,
        formulaire_nom: formulaire.nom,
        type_inspection: formulaire.frequence || 'mensuelle',
        reponses: reponses,
        conforme: conforme,
        remarques: remarques,
        creer_demande_remplacement: !conforme && demanderRemplacement
      };

      // Utiliser l'endpoint approprié selon le type
      const isEPI = equipement.type_epi !== undefined;
      const endpoint = isEPI 
        ? `/mes-epi/${equipement.id}/inspection`
        : '/inspections-unifiees';

      await apiPost(tenantSlug, endpoint, inspectionData);
      
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

  if (!isOpen || !formulaire) return null;

  const conformeGlobal = isConforme();

  // Rendu d'un champ selon son type
  const renderField = (item, sectionIndex) => {
    const value = reponses[item.id];
    
    switch (item.type) {
      case 'conforme_nc':
        return (
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
                backgroundColor: value === 'conforme' ? '#22c55e' : '#e5e7eb',
                color: value === 'conforme' ? 'white' : '#6b7280'
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
                backgroundColor: value === 'non_conforme' ? '#ef4444' : '#e5e7eb',
                color: value === 'non_conforme' ? 'white' : '#6b7280'
              }}
            >
              ❌ NC
            </button>
          </div>
        );
      
      case 'oui_non':
        return (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handleReponseChange(item.id, 'oui')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                backgroundColor: value === 'oui' ? '#22c55e' : '#e5e7eb',
                color: value === 'oui' ? 'white' : '#6b7280'
              }}
            >
              ✓ Oui
            </button>
            <button
              type="button"
              onClick={() => handleReponseChange(item.id, 'non')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                backgroundColor: value === 'non' ? '#ef4444' : '#e5e7eb',
                color: value === 'non' ? 'white' : '#6b7280'
              }}
            >
              ✗ Non
            </button>
          </div>
        );
      
      case 'nombre':
        return (
          <Input
            type="number"
            value={value || 0}
            onChange={(e) => handleReponseChange(item.id, parseInt(e.target.value) || 0)}
            style={{ width: '100px', fontSize: '16px' }}
          />
        );
      
      case 'texte':
        return (
          <Textarea
            value={value || ''}
            onChange={(e) => handleReponseChange(item.id, e.target.value)}
            placeholder="Saisir..."
            rows={2}
            style={{ width: '100%', fontSize: '16px' }}
          />
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => handleReponseChange(item.id, e.target.value)}
            style={{ fontSize: '16px' }}
          />
        );
      
      case 'liste':
        return (
          <select
            value={value || ''}
            onChange={(e) => handleReponseChange(item.id, e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              fontSize: '16px'
            }}
          >
            <option value="">Sélectionner...</option>
            {item.options?.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      default:
        return null;
    }
  };

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
          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          borderRadius: '16px 16px 0 0',
          flexShrink: 0
        }}>
          <div>
            <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem', fontWeight: '600' }}>
              📋 {formulaire.nom}
            </h3>
            <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem' }}>
              {equipement?.nom || equipement?.type_epi || 'Équipement'}
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
            backgroundColor: '#eff6ff',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{ fontSize: '2.5rem' }}>
              {equipement?.type_epi ? '🛡️' : '🔧'}
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#1e40af' }}>
                {equipement?.nom || equipement?.type_epi || 'Équipement'}
              </h4>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#3b82f6' }}>
                {equipement?.code_unique ? `#${equipement.code_unique}` : equipement?.numero_serie ? `N° ${equipement.numero_serie}` : ''}
              </p>
              {equipement?.categorie_nom && (
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#60a5fa' }}>
                  {equipement.categorie_nom}
                </p>
              )}
            </div>
          </div>

          {/* Sections du formulaire */}
          {formulaire.sections?.map((section, sectionIndex) => (
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {section.items?.map((item, itemIndex) => (
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
                    {renderField(item, sectionIndex)}
                  </div>
                ))}
              </div>
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
              style={{ width: '100%', fontSize: '16px', borderRadius: '8px' }}
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
                    Une demande sera créée automatiquement
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
            style={{ flex: 1, backgroundColor: '#3B82F6', color: 'white' }}
            disabled={saving}
          >
            {saving ? '⏳ Enregistrement...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionUnifieeModal;
