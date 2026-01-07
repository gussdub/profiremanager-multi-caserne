import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../utils/api';
import ImageUpload from './ImageUpload';
import { Button } from './ui/button';

// Composant Chronomètre
const TimerField = ({ value, onChange, unite, seuilAlerte }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(value || 0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(prev => {
          const newTime = prev + 0.1;
          onChange(Math.round(newTime * 10) / 10);
          return newTime;
        });
      }, 100);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const isOverThreshold = seuilAlerte && time > seuilAlerte;

  return (
    <div style={{ padding: '0.75rem', backgroundColor: isOverThreshold ? '#fef2f2' : '#f9fafb', borderRadius: '0.5rem', border: isOverThreshold ? '2px solid #dc2626' : '1px solid #e5e7eb' }}>
      <div style={{ fontSize: 'clamp(1.75rem, 8vw, 2.5rem)', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center', color: isOverThreshold ? '#dc2626' : '#111827', marginBottom: '0.75rem' }}>
        {formatTime(time)}
      </div>
      {isOverThreshold && (
        <div style={{ textAlign: 'center', color: '#dc2626', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          ⚠️ Seuil dépassé ({seuilAlerte} {unite || 'sec'})
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button
          type="button"
          onClick={() => setIsRunning(!isRunning)}
          style={{ backgroundColor: isRunning ? '#f59e0b' : '#10b981', color: 'white', padding: '0.625rem 1rem', fontWeight: '600', fontSize: '0.875rem', flex: '1 1 auto', maxWidth: '140px' }}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        <Button
          type="button"
          onClick={() => { setTime(0); onChange(0); setIsRunning(false); }}
          variant="outline"
          style={{ padding: '0.625rem 1rem', fontSize: '0.875rem', flex: '1 1 auto', maxWidth: '140px' }}
        >
          🔄 Reset
        </Button>
      </div>
      {unite && <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.7rem', marginTop: '0.5rem' }}>Unité: {unite}</p>}
    </div>
  );
};

// Composant Géolocalisation
const GeolocationField = ({ value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getLocation = () => {
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée');
      return;
    }
    setLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setLoading(false);
      },
      (err) => {
        setError('Erreur: ' + err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      {value?.latitude ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📍</span>
            <span style={{ fontWeight: '600', color: '#10b981' }}>Position capturée</span>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#374151', fontFamily: 'monospace' }}>
            Lat: {value.latitude.toFixed(6)}<br />
            Lng: {value.longitude.toFixed(6)}
          </p>
          {value.accuracy && <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Précision: ±{Math.round(value.accuracy)}m</p>}
          <Button type="button" onClick={getLocation} variant="outline" style={{ marginTop: '0.5rem' }} disabled={loading}>
            🔄 Actualiser
          </Button>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <Button type="button" onClick={getLocation} disabled={loading} style={{ backgroundColor: '#3b82f6', color: 'white' }}>
            {loading ? '⏳ Localisation...' : '📍 Capturer la position'}
          </Button>
          {error && <p style={{ color: '#dc2626', marginTop: '0.5rem', fontSize: '0.875rem' }}>{error}</p>}
        </div>
      )}
    </div>
  );
};

// Composant Signature
const SignatureField = ({ value, onChange }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (value && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      onChange(canvasRef.current.toDataURL());
    }
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      <canvas
        ref={canvasRef}
        width={300}
        height={150}
        style={{ border: '1px solid #d1d5db', borderRadius: '0.375rem', backgroundColor: 'white', touchAction: 'none', width: '100%', maxWidth: '100%', height: 'auto', aspectRatio: '2/1' }}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <Button type="button" onClick={clearSignature} variant="outline" size="sm">
          🗑️ Effacer
        </Button>
      </div>
    </div>
  );
};

// Composant Rating (étoiles)
const RatingField = ({ value, onChange }) => {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          style={{ fontSize: '2rem', background: 'none', border: 'none', cursor: 'pointer', color: star <= (hovered || value) ? '#f59e0b' : '#d1d5db' }}
        >
          ★
        </button>
      ))}
      {value > 0 && <span style={{ marginLeft: '0.5rem', alignSelf: 'center', color: '#6b7280' }}>{value}/5</span>}
    </div>
  );
};

// Composant principal du modal d'inspection
const InspectionBorneSecheModal = ({ borne, tenantSlug, onClose, onSuccess, userRole }) => {
  const [modele, setModele] = useState(null);
  const [modelesDisponibles, setModelesDisponibles] = useState([]);
  const [selectedModeleId, setSelectedModeleId] = useState(null);
  const [reponses, setReponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAnomalieForm, setShowAnomalieForm] = useState(false);
  const [anomalieData, setAnomalieData] = useState({ commentaire: '', photos: [] });
  const [alertes, setAlertes] = useState([]);

  // Vérifier si l'utilisateur peut choisir le formulaire
  const canSelectModele = userRole === 'admin' || userRole === 'superviseur';

  // Charger les modèles disponibles depuis le système unifié
  useEffect(() => {
    const fetchModeles = async () => {
      try {
        // Charger tous les formulaires du système unifié
        const allFormulaires = await apiGet(tenantSlug, '/formulaires-inspection');
        
        console.log('Borne reçue:', borne);
        console.log('ID du formulaire assigné:', borne.modele_inspection_assigne_id);
        console.log('Tous les formulaires chargés:', allFormulaires?.length);
        
        // Fonction pour convertir un formulaire vers le format attendu
        const convertFormulaire = (f) => ({
          id: f.id,
          nom: f.nom,
          description: f.description || '',
          est_actif: f.est_actif !== false,
          sections: (f.sections || []).map((s, idx) => ({
            id: s.id || `section_${idx}`,
            titre: s.titre || s.nom,
            description: '',
            items: (s.items || []).map((item, itemIdx) => ({
              id: item.id || `item_${idx}_${itemIdx}`,
              nom: item.label || item.nom,
              type: item.type,
              options: item.options || [],
              obligatoire: item.obligatoire || false,
              ordre: item.ordre || itemIdx,
              alertes: item.alertes,
              config: item.config
            })),
            ordre: s.ordre || idx
          }))
        });
        
        // Filtrer pour les formulaires qui concernent les points d'eau (nouvelle catégorie)
        const pointEauFormulaires = (allFormulaires || []).filter(f => 
          f.est_actif !== false &&
          (f.categorie_ids?.includes('point_eau') || f.categorie_ids?.includes('borne_seche'))
        );
        
        console.log('Formulaires point_eau filtrés:', pointEauFormulaires?.length);
        
        // Convertir vers le format attendu par le composant existant
        const modelesConverts = pointEauFormulaires.map(convertFormulaire);
        
        if (canSelectModele) {
          setModelesDisponibles(modelesConverts);
        }
        
        // Déterminer quel modèle utiliser
        let modeleToUse = null;
        
        // PRIORITÉ 1: Si le point d'eau a un formulaire assigné, le charger directement
        if (borne.modele_inspection_assigne_id) {
          console.log('Recherche du formulaire assigné:', borne.modele_inspection_assigne_id);
          
          // D'abord chercher dans les formulaires convertis
          modeleToUse = modelesConverts.find(m => m.id === borne.modele_inspection_assigne_id);
          console.log('Trouvé dans modelesConverts:', !!modeleToUse);
          
          // Si pas trouvé dans les formulaires convertis, chercher dans tous et convertir
          if (!modeleToUse) {
            const assignedFormulaire = (allFormulaires || []).find(f => f.id === borne.modele_inspection_assigne_id);
            console.log('Trouvé dans allFormulaires:', !!assignedFormulaire);
            if (assignedFormulaire) {
              modeleToUse = convertFormulaire(assignedFormulaire);
            }
          }
          
          if (modeleToUse) {
            setSelectedModeleId(borne.modele_inspection_assigne_id);
            console.log('Modèle à utiliser:', modeleToUse.nom);
          }
        }
        
        // PRIORITÉ 2: Sinon, utiliser le premier formulaire actif de la catégorie point_eau
        if (!modeleToUse && modelesConverts.length > 0) {
          modeleToUse = modelesConverts.find(m => m.est_actif) || modelesConverts[0];
          setSelectedModeleId(modeleToUse?.id);
          console.log('Fallback - premier modèle actif:', modeleToUse?.nom);
        }
        
        if (modeleToUse) {
          console.log('Modèle final sélectionné:', modeleToUse.nom, 'avec', modeleToUse.sections?.length, 'sections');
          setModele(modeleToUse);
          initializeReponses(modeleToUse);
        } else {
          console.log('Aucun modèle trouvé, tentative fallback ancien système');
          // Fallback: essayer l'ancien système si aucun formulaire unifié n'est trouvé
          try {
            const oldModele = await apiGet(tenantSlug, '/bornes-seches/modeles-inspection/actif');
            if (oldModele) {
              setModele(oldModele);
              initializeReponses(oldModele);
              setSelectedModeleId(oldModele.id);
              if (canSelectModele) {
                const oldModeles = await apiGet(tenantSlug, '/bornes-seches/modeles-inspection');
                setModelesDisponibles(oldModeles || []);
              }
            }
          } catch (e) {
            console.log('Aucun formulaire trouvé dans l\'ancien système non plus');
          }
        }
      } catch (error) {
        console.error('Erreur chargement modèle:', error);
        alert('Erreur lors du chargement du formulaire');
      } finally {
        setLoading(false);
      }
    };
    fetchModeles();
  }, [tenantSlug, borne, canSelectModele]);

  // Initialiser les réponses pour un modèle (nouveau format avec items par section)
  const initializeReponses = (modeleData) => {
    const initialReponses = {};
    modeleData.sections?.forEach(section => {
      // Pour chaque section, initialiser les réponses de tous ses items
      const itemsReponses = {};
      (section.items || []).forEach(item => {
        const type = item.type || 'radio';
        let defaultValue = '';
        
        // Valeur par défaut selon le type
        switch(type) {
          case 'checkbox':
            defaultValue = [];
            break;
          case 'radio':
          case 'conforme_nc':
          case 'oui_non':
          case 'present_absent':
            defaultValue = item.options?.[0] || '';
            break;
          case 'nombre':
          case 'slider':
            defaultValue = item.config?.min || 0;
            break;
          case 'toggle':
            defaultValue = false;
            break;
          default:
            defaultValue = '';
        }
        
        itemsReponses[item.id] = defaultValue;
      });
      
      initialReponses[section.id] = {
        section_id: section.id,
        section_titre: section.titre,
        items: itemsReponses
      };
    });
    setReponses(initialReponses);
  };

  // Changer de modèle (admin/superviseur seulement)
  const handleModeleChange = async (modeleId) => {
    if (!canSelectModele) return;
    
    setLoading(true);
    try {
      const selectedModele = modelesDisponibles.find(m => m.id === modeleId);
      if (selectedModele) {
        // Si le modèle n'a pas les sections chargées, les récupérer
        if (!selectedModele.sections) {
          const fullModele = await apiGet(tenantSlug, `/bornes-seches/modeles-inspection/${modeleId}`);
          setModele(fullModele);
          initializeReponses(fullModele);
        } else {
          setModele(selectedModele);
          initializeReponses(selectedModele);
        }
        setSelectedModeleId(modeleId);
        setAlertes([]);
      }
    } catch (error) {
      console.error('Erreur changement modèle:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mettre à jour une réponse
  const updateReponse = (sectionId, value, itemId = null) => {
    setReponses(prev => {
      const section = modele.sections.find(s => s.id === sectionId);
      const newReponses = { ...prev };
      
      if (itemId) {
        // Réponse pour un item spécifique
        newReponses[sectionId] = {
          ...newReponses[sectionId],
          items: {
            ...newReponses[sectionId].items,
            [itemId]: value
          }
        };
      } else {
        newReponses[sectionId] = {
          ...newReponses[sectionId],
          valeur: value
        };
      }

      // Vérifier si cette réponse déclenche une alerte
      if (section?.options) {
        const selectedOption = section.options.find(opt => opt.label === value);
        if (selectedOption?.declencherAlerte) {
          const alerteExists = alertes.some(a => a.section_id === sectionId && a.item_id === itemId);
          if (!alerteExists) {
            setAlertes(prev => [...prev, {
              section_id: sectionId,
              section_titre: section.titre,
              item_id: itemId,
              item_nom: itemId ? section.items?.find(i => i.id === itemId)?.nom : null,
              message: `${section.titre}${itemId ? ' - ' + section.items?.find(i => i.id === itemId)?.nom : ''}: ${value}`,
              severite: 'warning'
            }]);
          }
        } else {
          // Retirer l'alerte si la réponse change
          setAlertes(prev => prev.filter(a => !(a.section_id === sectionId && a.item_id === itemId)));
        }
      }

      return newReponses;
    });
  };

  // Soumettre l'inspection vers le système unifié
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Convertir les réponses vers le format unifié
      const reponsesUnifiees = {};
      Object.values(reponses).forEach(r => {
        // Si la section a des items, les ajouter séparément
        if (r.items && Object.keys(r.items).length > 0) {
          Object.entries(r.items).forEach(([itemId, valeur]) => {
            reponsesUnifiees[itemId] = {
              valeur: valeur,
              section: r.section_titre
            };
          });
        } else {
          // Sinon, ajouter la valeur de la section directement
          reponsesUnifiees[r.section_id] = {
            valeur: r.valeur,
            section: r.section_titre
          };
        }
      });

      const inspectionData = {
        formulaire_id: modele.id,
        asset_id: borne.id,
        asset_type: 'borne_seche',
        reponses: reponsesUnifiees,
        conforme: alertes.length === 0 && !showAnomalieForm,
        notes_generales: anomalieData.commentaire || '',
        alertes: alertes,
        metadata: {
          borne_nom: borne.nom || borne.numero_identification,
          has_anomalie: showAnomalieForm,
          photos_anomalie: anomalieData.photos || [],
          latitude: reponses.geolocation?.valeur?.latitude,
          longitude: reponses.geolocation?.valeur?.longitude,
          signature_inspecteur: Object.values(reponses).find(r => r.type_champ === 'signature')?.valeur || ''
        }
      };

      await apiPost(tenantSlug, '/inspections-unifiees', inspectionData);
      alert('✅ Inspection enregistrée avec succès !');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Erreur soumission:', error);
      alert('Erreur lors de l\'enregistrement: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSubmitting(false);
    }
  };

  // Rendu d'une section avec ses items (nouveau format)
  const renderSection = (section) => {
    const sectionReponses = reponses[section.id];
    if (!sectionReponses) return null;
    
    // Si la section n'a pas d'items, afficher un message
    if (!section.items || section.items.length === 0) {
      return <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>Aucun élément dans cette section</p>;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {section.items.map(item => (
          <div key={item.id} style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#374151' }}>
              {item.nom}
              {item.obligatoire && <span style={{ color: '#dc2626', marginLeft: '0.25rem' }}>*</span>}
            </div>
            {renderItemField(item, section.id, sectionReponses.items?.[item.id])}
          </div>
        ))}
      </div>
    );
  };

  // Rendu d'un champ individuel selon son type
  const renderItemField = (item, sectionId, value) => {
    const type = item.type || 'radio';
    const options = item.options || [];
    
    switch (type) {
      case 'radio':
      case 'conforme_nc':
      case 'oui_non':
      case 'present_absent':
        // Champ avec boutons radio
        const radioOptions = options.length > 0 ? options : 
          (type === 'conforme_nc' ? ['Conforme', 'Non conforme'] :
           type === 'oui_non' ? ['Oui', 'Non'] :
           type === 'present_absent' ? ['Présent', 'Absent', 'Défectueux'] : ['Oui', 'Non']);
        
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {radioOptions.map(opt => {
              const isSelected = value === opt;
              const isAlerte = item.alertes?.valeurs_declenchantes?.includes(opt);
              return (
                <label
                  key={opt}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid' : '1px solid #d1d5db',
                    borderColor: isSelected ? (isAlerte ? '#dc2626' : '#10b981') : '#d1d5db',
                    backgroundColor: isSelected ? (isAlerte ? '#fef2f2' : '#f0fdf4') : 'white',
                    fontSize: '0.875rem'
                  }}
                >
                  <input
                    type="radio"
                    name={`${sectionId}_${item.id}`}
                    checked={isSelected}
                    onChange={() => updateReponse(sectionId, opt, item.id)}
                    style={{ display: 'none' }}
                  />
                  {isAlerte && isSelected && '⚠️ '}{opt}
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {options.map(opt => {
              const isChecked = Array.isArray(value) && value.includes(opt);
              return (
                <label
                  key={opt}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: isChecked ? '2px solid #10b981' : '1px solid #d1d5db',
                    backgroundColor: isChecked ? '#f0fdf4' : 'white',
                    fontSize: '0.875rem'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      const currentValues = Array.isArray(value) ? value : [];
                      const newValues = e.target.checked 
                        ? [...currentValues, opt]
                        : currentValues.filter(v => v !== opt);
                      updateReponse(sectionId, newValues, item.id);
                    }}
                  />
                  {opt}
                </label>
              );
            })}
          </div>
        );

      case 'texte':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            placeholder="Entrez votre texte..."
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              minHeight: '80px',
              resize: 'vertical'
            }}
          />
        );

      case 'nombre':
        return (
          <input
            type="number"
            value={value || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            min={item.config?.min}
            max={item.config?.max}
            step={item.config?.step || 1}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
        );

      case 'liste':
        return (
          <select
            value={value || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: 'white'
            }}
          >
            <option value="">-- Sélectionner --</option>
            {options.map((opt, idx) => (
              <option key={idx} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'lieu':
        return <GeolocationField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} />;

      case 'signature':
        return <SignatureField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} />;

      case 'chronometre':
        return <TimerField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} unite={item.config?.unite} seuilAlerte={item.alertes?.seuil_max} />;

      case 'photo':
        return (
          <ImageUpload
            value={value || ''}
            onChange={(url) => updateReponse(sectionId, url, item.id)}
            multiple={true}
          />
        );

      case 'inspecteur':
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            placeholder="Nom de l'inspecteur"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem'
            }}
          />
        );

      default:
        return <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>Type de champ non supporté: {type}</p>;
    }
  };

  // Ancienne fonction de rendu (pour compatibilité)
  const renderField = (section) => {
    return renderSection(section);
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Chargement du formulaire...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '0.5rem', overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', width: '100%', maxWidth: '700px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
        {/* Header - Responsive */}
        <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#dc2626', borderRadius: '0.75rem 0.75rem 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, color: 'white', fontSize: 'clamp(1rem, 4vw, 1.25rem)', fontWeight: '600', wordBreak: 'break-word' }}>
                🔍 {borne?.nom || borne?.numero_identification}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.75rem' }}>
                {modele?.nom}
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '1.25rem', cursor: 'pointer', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
          </div>
          
          {/* Sélecteur de formulaire pour admin/superviseur */}
          {canSelectModele && modelesDisponibles.length > 1 && (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.9)', fontSize: '0.7rem', marginBottom: '0.25rem' }}>
                📋 Formulaire:
              </label>
              <select
                value={selectedModeleId || ''}
                onChange={(e) => handleModeleChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  fontSize: '0.8rem',
                  backgroundColor: 'rgba(255,255,255,0.95)',
                  cursor: 'pointer'
                }}
              >
                {modelesDisponibles.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nom} {m.est_actif ? '(actif)' : ''} {borne.modele_inspection_assigne_id === m.id ? '★' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Alertes en cours */}
        {alertes.length > 0 && (
          <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', fontWeight: '600', marginBottom: '0.5rem' }}>
              <span>⚠️</span> {alertes.length} alerte(s) détectée(s)
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: '#991b1b' }}>
              {alertes.map((a, i) => <li key={i}>{a.message}</li>)}
            </ul>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          {modele?.sections?.sort((a, b) => a.ordre - b.ordre).map(section => (
            <div key={section.id} style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {section.type_champ === 'timer' && '⏱️'}
                {section.type_champ === 'photo' && '📸'}
                {section.type_champ === 'geolocation' && '📍'}
                {section.type_champ === 'signature' && '✍️'}
                {section.titre}
              </h3>
              {section.description && <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>{section.description}</p>}
              {renderField(section)}
            </div>
          ))}

          {/* Bouton Signaler Anomalie */}
          <div style={{ padding: '1rem', backgroundColor: showAnomalieForm ? '#fef2f2' : '#fff7ed', borderRadius: '0.5rem', border: showAnomalieForm ? '2px solid #dc2626' : '1px solid #fed7aa', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setShowAnomalieForm(!showAnomalieForm)}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: showAnomalieForm ? '#dc2626' : '#f97316',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              ⚠️ {showAnomalieForm ? 'Annuler le signalement' : 'Signaler une anomalie'}
            </button>

            {showAnomalieForm && (
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#991b1b' }}>
                  Description de l&apos;anomalie *
                </label>
                <textarea
                  value={anomalieData.commentaire}
                  onChange={(e) => setAnomalieData({ ...anomalieData, commentaire: e.target.value })}
                  rows={3}
                  required={showAnomalieForm}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #fca5a5', borderRadius: '0.375rem', fontSize: '1rem', resize: 'vertical' }}
                  placeholder="Décrivez l'anomalie constatée..."
                />
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#991b1b' }}>
                    Photos de l&apos;anomalie
                  </label>
                  <ImageUpload
                    value={anomalieData.photos}
                    onChange={(urls) => setAnomalieData({ ...anomalieData, photos: Array.isArray(urls) ? urls : [urls] })}
                    multiple={true}
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer - Responsive */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.5rem', justifyContent: 'stretch', flexDirection: 'row' }}>
          <Button type="button" onClick={onClose} variant="outline" style={{ flex: 1, fontSize: '0.875rem', padding: '0.625rem' }}>
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: submitting ? '#9ca3af' : '#10b981', color: 'white', fontWeight: '600', flex: 1, fontSize: '0.875rem', padding: '0.625rem' }}
          >
            {submitting ? '⏳...' : '✓ Terminer'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionBorneSecheModal;
