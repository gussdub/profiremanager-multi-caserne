import React, { useState, useEffect, useRef } from 'react';
import { apiPost } from '../utils/api';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import Stopwatch from './ui/Stopwatch';
import SignaturePad from './ui/SignaturePad';
import Slider from './ui/Slider';

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
  const [photosReponses, setPhotosReponses] = useState({}); // Photos jointes aux réponses
  const [remarques, setRemarques] = useState('');
  const [demanderRemplacement, setDemanderRemplacement] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [sectionActuelle, setSectionActuelle] = useState(0); // Pagination par section
  const fileInputRefs = useRef({});

  // Initialiser les réponses selon le formulaire
  useEffect(() => {
    if (isOpen && formulaire && user) {
      const initialReponses = {};
      formulaire.sections?.forEach(section => {
        section.items?.forEach(item => {
          // Valeur par défaut selon le type de champ
          switch (item.type) {
            case 'radio':
              // Pour radio, la première option par défaut (si options définies)
              initialReponses[item.id] = (item.options && item.options.length > 0) ? item.options[0] : '';
              break;
            case 'checkbox':
              // Pour checkbox, tableau vide par défaut
              initialReponses[item.id] = [];
              break;
            // Rétrocompatibilité avec les anciens types
            case 'conforme_nc':
              initialReponses[item.id] = 'conforme';
              break;
            case 'oui_non':
              initialReponses[item.id] = 'oui';
              break;
            case 'present_absent':
              initialReponses[item.id] = 'present';
              break;
            case 'nombre':
            case 'nombre_unite':
              initialReponses[item.id] = item.config?.min || 0;
              break;
            case 'slider':
              initialReponses[item.id] = item.config?.min || 0;
              break;
            case 'inspecteur':
              // Auto-remplir avec le nom de l'utilisateur connecté
              initialReponses[item.id] = `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email;
              break;
            case 'lieu':
              initialReponses[item.id] = '';
              break;
            case 'signature':
              initialReponses[item.id] = '';
              break;
            case 'chronometre':
            case 'compte_rebours':
              initialReponses[item.id] = { time: 0, laps: [], formattedTime: '00:00.00' };
              break;
            case 'photo':
              initialReponses[item.id] = [];
              break;
            case 'audio':
              initialReponses[item.id] = null;
              break;
            case 'qr_scan':
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
      setPhotosReponses({});
      setRemarques('');
      setDemanderRemplacement(false);
      setSectionActuelle(0); // Réinitialiser la pagination
      
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

  // Gestion des photos en réponse
  const handlePhotoCapture = async (itemId, files) => {
    const newPhotos = [];
    for (const file of files) {
      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onloadend = () => {
          newPhotos.push({
            id: `photo-${Date.now()}-${Math.random()}`,
            data: reader.result,
            name: file.name
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    
    setPhotosReponses(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), ...newPhotos]
    }));
  };

  const removePhotoReponse = (itemId, photoIndex) => {
    setPhotosReponses(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter((_, i) => i !== photoIndex)
    }));
  };

  const handleReponseChange = (itemId, value) => {
    setReponses(prev => ({
      ...prev,
      [itemId]: value
    }));
  };

  // Collecter toutes les alertes basées sur les réponses
  const collectAlertes = () => {
    const alertes = [];
    
    formulaire?.sections?.forEach(section => {
      section.items?.forEach(item => {
        const valeur = reponses[item.id];
        const alertConfig = item.alertes || {};
        const valeursDeclenchantes = alertConfig.valeurs_declenchantes || [];
        
        let isAlerte = false;
        let typeAlerte = '';
        
        // Types à choix personnalisés (radio, checkbox)
        if (item.type === 'radio') {
          if (valeursDeclenchantes.includes(valeur)) {
            isAlerte = true;
            typeAlerte = valeur;
          }
        }
        
        if (item.type === 'checkbox') {
          // Pour checkbox, vérifier si une des valeurs sélectionnées est dans les déclencheurs
          const selectedValues = Array.isArray(valeur) ? valeur : [];
          const matchedValues = selectedValues.filter(v => valeursDeclenchantes.includes(v));
          if (matchedValues.length > 0) {
            isAlerte = true;
            typeAlerte = matchedValues.join(', ');
          }
        }
        
        // Rétrocompatibilité: Types binaires anciens
        if (['conforme_nc', 'oui_non', 'present_absent'].includes(item.type)) {
          const defaultDeclenchantes = valeursDeclenchantes.length > 0 
            ? valeursDeclenchantes 
            : ['non_conforme', 'non', 'absent', 'defectueux'];
          if (defaultDeclenchantes.includes(valeur)) {
            isAlerte = true;
            typeAlerte = valeur;
          }
        }
        
        // Types numériques
        if (['nombre', 'nombre_unite', 'slider'].includes(item.type)) {
          const numVal = parseFloat(valeur) || 0;
          if (alertConfig.seuil_min !== null && alertConfig.seuil_min !== undefined && numVal < alertConfig.seuil_min) {
            isAlerte = true;
            typeAlerte = `Valeur ${numVal} < ${alertConfig.seuil_min}`;
          }
          if (alertConfig.seuil_max !== null && alertConfig.seuil_max !== undefined && numVal > alertConfig.seuil_max) {
            isAlerte = true;
            typeAlerte = `Valeur ${numVal} > ${alertConfig.seuil_max}`;
          }
        }
        
        // Liste déroulante
        if (item.type === 'liste' && item.options) {
          const optIndex = item.options.indexOf(valeur);
          if (alertConfig.options_declenchantes?.includes(optIndex)) {
            isAlerte = true;
            typeAlerte = `Option: ${valeur}`;
          }
        }
        
        if (isAlerte) {
          alertes.push({
            item_id: item.id,
            item_label: item.label || item.nom,
            section: section.nom || section.titre,
            type: typeAlerte,
            valeur: Array.isArray(valeur) ? valeur.join(', ') : valeur,
            message: alertConfig.message || `Alerte: ${item.label || item.nom} - ${typeAlerte}`
          });
        }
      });
    });
    
    return alertes;
  };

  // Vérifier si l'inspection est conforme globalement
  const isConforme = () => {
    return collectAlertes().length === 0;
  };

  // Fonction pour obtenir la position GPS
  const getGPSLocation = async (itemId) => {
    if (!navigator.geolocation) {
      alert('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }
    
    setGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Essayer de convertir les coordonnées en adresse (reverse geocoding)
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'fr' } }
          );
          const data = await response.json();
          
          if (data.display_name) {
            handleReponseChange(itemId, data.display_name);
          } else {
            handleReponseChange(itemId, `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          }
        } catch (error) {
          // En cas d'erreur, utiliser les coordonnées brutes
          handleReponseChange(itemId, `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
        }
        
        setGettingLocation(false);
      },
      (error) => {
        console.error('Erreur GPS:', error);
        alert('Impossible d\'obtenir votre position. Veuillez saisir l\'adresse manuellement.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSubmit = async () => {
    if (!equipement || !formulaire) return;

    try {
      setSaving(true);
      
      const alertes = collectAlertes();
      const conforme = alertes.length === 0;
      
      // Déterminer le type d'asset
      const isEPI = equipement.type === 'epi' || equipement.type_epi !== undefined;
      const assetType = equipement.type || (isEPI ? 'epi' : 'equipement');

      const inspectionData = {
        asset_id: equipement.id,
        asset_type: assetType,
        equipement_id: equipement.id,
        equipement_nom: equipement.nom || equipement.type_epi || 'Équipement',
        formulaire_id: formulaire.id,
        formulaire_nom: formulaire.nom,
        type_inspection: formulaire.frequence || 'mensuelle',
        reponses: reponses,
        photos_reponses: photosReponses, // Photos jointes aux réponses
        conforme: conforme,
        alertes: alertes, // Liste des alertes détectées
        remarques: remarques,
        creer_demande_remplacement: !conforme && demanderRemplacement,
        metadata: {
          epi_nom: isEPI ? (equipement.nom || equipement.type_epi) : undefined,
          vehicule_nom: assetType === 'vehicule' ? equipement.nom : undefined,
          borne_nom: assetType === 'borne_seche' ? equipement.nom : undefined
        }
      };

      // Toujours utiliser l'endpoint unifié
      await apiPost(tenantSlug, '/inspections-unifiees', inspectionData);
      
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
      
      case 'present_absent':
        return (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleReponseChange(item.id, 'present')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                backgroundColor: value === 'present' ? '#22c55e' : '#e5e7eb',
                color: value === 'present' ? 'white' : '#6b7280'
              }}
            >
              ✅ Présent
            </button>
            <button
              type="button"
              onClick={() => handleReponseChange(item.id, 'absent')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                backgroundColor: value === 'absent' ? '#f59e0b' : '#e5e7eb',
                color: value === 'absent' ? 'white' : '#6b7280'
              }}
            >
              ⚠️ Absent
            </button>
            <button
              type="button"
              onClick={() => handleReponseChange(item.id, 'defectueux')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '500',
                backgroundColor: value === 'defectueux' ? '#ef4444' : '#e5e7eb',
                color: value === 'defectueux' ? 'white' : '#6b7280'
              }}
            >
              ❌ Défectueux
            </button>
          </div>
        );
      
      case 'radio':
        return (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(item.options || []).map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleReponseChange(item.id, opt)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: value === opt ? 'none' : '1px solid #d1d5db',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  backgroundColor: value === opt ? '#3b82f6' : 'white',
                  color: value === opt ? 'white' : '#374151'
                }}
              >
                {value === opt ? '● ' : '○ '}{opt}
              </button>
            ))}
          </div>
        );
      
      case 'checkbox':
        const selectedValues = Array.isArray(value) ? value : [];
        return (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(item.options || []).map((opt, idx) => {
              const isSelected = selectedValues.includes(opt);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    const newValues = isSelected 
                      ? selectedValues.filter(v => v !== opt)
                      : [...selectedValues, opt];
                    handleReponseChange(item.id, newValues);
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: isSelected ? 'none' : '1px solid #d1d5db',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                    backgroundColor: isSelected ? '#10b981' : 'white',
                    color: isSelected ? 'white' : '#374151'
                  }}
                >
                  {isSelected ? '☑ ' : '☐ '}{opt}
                </button>
              );
            })}
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
              fontSize: '16px',
              minWidth: '150px'
            }}
          >
            <option value="">Sélectionner...</option>
            {item.options?.map((opt, i) => (
              <option key={i} value={opt}>{opt}</option>
            ))}
          </select>
        );
      
      case 'inspecteur':
        return (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: '#dbeafe',
            borderRadius: '6px',
            fontSize: '0.9rem',
            color: '#1e40af'
          }}>
            👤 {value || 'Non défini'}
          </div>
        );
      
      case 'lieu':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Input
                value={value || ''}
                onChange={(e) => handleReponseChange(item.id, e.target.value)}
                placeholder="Adresse ou coordonnées..."
                style={{ flex: 1, fontSize: '16px' }}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => getGPSLocation(item.id)}
                disabled={gettingLocation}
                style={{ 
                  backgroundColor: '#22c55e',
                  color: 'white',
                  whiteSpace: 'nowrap'
                }}
              >
                {gettingLocation ? '⏳' : '📍 GPS'}
              </Button>
            </div>
            {value && (
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#64748b',
                padding: '0.25rem 0.5rem',
                backgroundColor: '#f1f5f9',
                borderRadius: '4px'
              }}>
                📍 {value}
              </div>
            )}
          </div>
        );
      
      case 'nombre_unite':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Input
              type="number"
              value={value || item.config?.min || 0}
              min={item.config?.min}
              max={item.config?.max}
              onChange={(e) => handleReponseChange(item.id, parseFloat(e.target.value) || 0)}
              style={{ width: '120px', fontSize: '16px' }}
            />
            <span style={{ 
              padding: '0.5rem 0.75rem', 
              backgroundColor: '#f1f5f9', 
              borderRadius: '6px',
              fontWeight: '500',
              color: '#475569'
            }}>
              {item.config?.unite || ''}
            </span>
          </div>
        );
      
      case 'slider':
        return (
          <Slider
            value={value || item.config?.min || 0}
            onChange={(v) => handleReponseChange(item.id, v)}
            min={item.config?.min || 0}
            max={item.config?.max || 100}
            step={item.config?.step || 1}
            unit={item.config?.unite || ''}
            thresholds={item.config?.seuils || []}
          />
        );
      
      case 'signature':
        return (
          <SignaturePad
            initialValue={value}
            onSignatureChange={(sig) => handleReponseChange(item.id, sig)}
            label={item.label || 'Signature'}
          />
        );
      
      case 'chronometre':
        return (
          <Stopwatch
            mode="stopwatch"
            initialValue={value}
            onTimeUpdate={(data) => handleReponseChange(item.id, data)}
            onLapRecorded={(lap, laps) => console.log('Lap:', lap)}
          />
        );
      
      case 'compte_rebours':
        return (
          <Stopwatch
            mode="countdown"
            countdownSeconds={item.config?.countdown_seconds || 300}
            initialValue={value}
            onTimeUpdate={(data) => handleReponseChange(item.id, data)}
            onComplete={() => alert('⏱️ Temps écoulé !')}
          />
        );
      
      case 'photo':
        return (
          <div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {(value || []).map((photo, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <img
                    src={photo.data || photo}
                    alt={`Photo ${idx + 1}`}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newPhotos = (value || []).filter((_, i) => i !== idx);
                      handleReponseChange(item.id, newPhotos);
                    }}
                    style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-5px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              border: '1px dashed #cbd5e1'
            }}>
              📷 Ajouter une photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      handleReponseChange(item.id, [...(value || []), { data: reader.result, name: file.name }]);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          </div>
        );
      
      case 'qr_scan':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Input
              value={value || ''}
              onChange={(e) => handleReponseChange(item.id, e.target.value)}
              placeholder="Code scanné ou saisi manuellement..."
              style={{ fontSize: '16px' }}
            />
            <Button
              type="button"
              size="sm"
              style={{ backgroundColor: '#8b5cf6', color: 'white' }}
              onClick={() => {
                // TODO: Implémenter le scan QR avec la caméra
                alert('📱 Le scan QR sera disponible dans une prochaine version. Saisissez le code manuellement.');
              }}
            >
              📱 Scanner un code
            </Button>
          </div>
        );
      
      case 'audio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {value && (
              <audio controls src={value} style={{ width: '100%' }} />
            )}
            <Button
              type="button"
              size="sm"
              style={{ backgroundColor: '#ec4899', color: 'white' }}
              onClick={() => {
                // TODO: Implémenter l'enregistrement audio
                alert('🎤 L\'enregistrement audio sera disponible dans une prochaine version.');
              }}
            >
              🎤 {value ? 'Réenregistrer' : 'Enregistrer une note vocale'}
            </Button>
          </div>
        );
      
      default:
        return null;
    }
  };

  // Fonction pour rendre la zone de photo en réponse
  const renderPhotoResponse = (item) => {
    if (!item.permettre_photo) return null;
    
    const photos = photosReponses[item.id] || [];
    
    return (
      <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #e5e7eb' }}>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
          📷 Photo(s) jointe(s) :
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {photos.map((photo, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <img
                src={photo.data}
                alt={photo.name}
                style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
              />
              <button
                type="button"
                onClick={() => removePhotoReponse(item.id, idx)}
                style={{
                  position: 'absolute',
                  top: '-5px',
                  right: '-5px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '50px',
            height: '50px',
            backgroundColor: '#f1f5f9',
            borderRadius: '4px',
            cursor: 'pointer',
            border: '1px dashed #cbd5e1'
          }}>
            <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>+</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handlePhotoCapture(item.id, Array.from(e.target.files))}
            />
          </label>
        </div>
      </div>
    );
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

          {/* Pagination - Indicateur de progression */}
          {(() => {
            const sections = formulaire.sections || [];
            const totalSections = sections.length;
            const sectionCourante = sections[sectionActuelle];
            const estPremiereSection = sectionActuelle === 0;
            const estDerniereSection = sectionActuelle === totalSections - 1;

            if (!sectionCourante) return <p>Aucune section trouvée.</p>;

            return (
              <>
                {/* Barre de progression */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      Section {sectionActuelle + 1} / {totalSections}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {Math.round(((sectionActuelle + 1) / totalSections) * 100)}%
                    </span>
                  </div>
                  <div style={{
                    height: '4px',
                    backgroundColor: '#e5e7eb',
                    borderRadius: '2px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      backgroundColor: '#3b82f6',
                      width: `${((sectionActuelle + 1) / totalSections) * 100}%`,
                      transition: 'width 0.3s'
                    }}></div>
                  </div>
                </div>

                {/* Section courante uniquement */}
                <div 
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
                    <span style={{ fontSize: '1.5rem' }}>{sectionCourante.icone || '📋'}</span>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>
                      {sectionCourante.titre || sectionCourante.nom}
                    </h4>
                  </div>

                  {/* Photos de référence de la section */}
                  {sectionCourante.photos && sectionCourante.photos.length > 0 && (
                    <div style={{ 
                      marginBottom: '0.75rem', 
                      padding: '0.5rem',
                      backgroundColor: '#fefce8',
                      borderRadius: '8px',
                      border: '1px solid #fef08a'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#854d0e', marginBottom: '0.5rem' }}>
                        📷 Photos de référence :
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {sectionCourante.photos.map((photo, photoIdx) => (
                          <img
                            key={photoIdx}
                            src={photo.data || photo}
                            alt={`Référence ${photoIdx + 1}`}
                            style={{
                              width: '80px',
                              height: '80px',
                              objectFit: 'cover',
                              borderRadius: '6px',
                              border: '2px solid #fef08a',
                              cursor: 'pointer'
                            }}
                            onClick={() => window.open(photo.data || photo, '_blank')}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {sectionCourante.items?.map((item, itemIndex) => (
                      <div 
                        key={item.id || itemIndex}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap'
                        }}>
                          <span style={{ fontSize: '0.9rem', flex: 1, minWidth: '150px' }}>
                            {item.label || item.nom}
                            {item.obligatoire && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                          </span>
                          {renderField(item, sectionActuelle)}
                        </div>
                        {/* Zone de photo en réponse si activée */}
                        {renderPhotoResponse(item)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Boutons de navigation - Affichés sur toutes les pages sauf la dernière */}
                {!estDerniereSection && (
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'space-between',
                    marginBottom: '1rem'
                  }}>
                    <button
                      type="button"
                      onClick={() => setSectionActuelle(sectionActuelle - 1)}
                      disabled={estPremiereSection}
                      style={{
                        flex: 1,
                        padding: '0.875rem',
                        backgroundColor: estPremiereSection ? '#e5e7eb' : '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: estPremiereSection ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600'
                      }}
                    >
                      ← Précédent
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectionActuelle(sectionActuelle + 1)}
                      style={{
                        flex: 1,
                        padding: '0.875rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600'
                      }}
                    >
                      Suivant →
                    </button>
                  </div>
                )}

                {/* Dernière page : Remarques, Alertes, Résultat et boutons finaux */}
                {estDerniereSection && (
                  <>
                    {/* Bouton Précédent seul en haut de la dernière page */}
                    <div style={{ marginBottom: '1rem' }}>
                      <button
                        type="button"
                        onClick={() => setSectionActuelle(sectionActuelle - 1)}
                        style={{
                          padding: '0.75rem 1.5rem',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: '600'
                        }}
                      >
                        ← Précédent
                      </button>
                    </div>

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

                    {/* Liste des alertes détectées */}
                    {collectAlertes().length > 0 && (
                      <div style={{
                        padding: '1rem',
                        borderRadius: '12px',
                        backgroundColor: '#fef3c7',
                        border: '2px solid #fcd34d',
                        marginBottom: '1rem'
                      }}>
                        <div style={{ 
                          fontWeight: '700', 
                          fontSize: '0.95rem',
                          color: '#92400e',
                          marginBottom: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          🔔 Alertes détectées ({collectAlertes().length})
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#78350f' }}>
                          Ces alertes seront envoyées au gestionnaire:
                        </div>
                        <ul style={{ 
                          margin: '0.5rem 0 0 0', 
                          paddingLeft: '1.25rem',
                          fontSize: '0.85rem',
                          color: '#92400e'
                        }}>
                          {collectAlertes().map((alerte, idx) => (
                            <li key={idx} style={{ marginBottom: '0.25rem' }}>
                              <strong>{alerte.item_label}</strong>: {alerte.type}
                              {alerte.message && alerte.message !== `Alerte: ${alerte.item_label} - ${alerte.type}` && (
                                <span style={{ fontStyle: 'italic' }}> - {alerte.message}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

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
                            : `${collectAlertes().length} alerte(s) seront envoyées au gestionnaire`}
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

                    {/* Bouton Valider final */}
                    <Button 
                      onClick={handleSubmit} 
                      style={{ 
                        width: '100%', 
                        padding: '1rem',
                        backgroundColor: '#10b981', 
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: '600'
                      }}
                      disabled={saving}
                    >
                      {saving ? '⏳ Enregistrement...' : '✓ Valider l\'inspection'}
                    </Button>
                  </>
                )}
              </>
            );
          })()}
        </div>

        {/* Footer - Bouton Annuler uniquement */}
        <div style={{ 
          padding: '0.75rem 1rem', 
          borderTop: '1px solid #e5e7eb', 
          display: 'flex', 
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: '#fafafa',
          borderRadius: '0 0 16px 16px'
        }}>
          <Button 
            variant="outline" 
            onClick={onClose} 
            style={{ padding: '0.625rem 1.5rem' }}
            disabled={saving}
          >
            ✕ Annuler l'inspection
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionUnifieeModal;
