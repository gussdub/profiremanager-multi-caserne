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
    <div style={{ padding: '1rem', backgroundColor: isOverThreshold ? '#fef2f2' : '#f9fafb', borderRadius: '0.5rem', border: isOverThreshold ? '2px solid #dc2626' : '1px solid #e5e7eb' }}>
      <div style={{ fontSize: '2.5rem', fontFamily: 'monospace', fontWeight: 'bold', textAlign: 'center', color: isOverThreshold ? '#dc2626' : '#111827', marginBottom: '1rem' }}>
        {formatTime(time)}
      </div>
      {isOverThreshold && (
        <div style={{ textAlign: 'center', color: '#dc2626', fontWeight: '600', marginBottom: '0.5rem' }}>
          ⚠️ Seuil dépassé ({seuilAlerte} {unite || 'sec'})
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        <Button
          type="button"
          onClick={() => setIsRunning(!isRunning)}
          style={{ backgroundColor: isRunning ? '#f59e0b' : '#10b981', color: 'white', padding: '0.75rem 1.5rem', fontWeight: '600' }}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        <Button
          type="button"
          onClick={() => { setTime(0); onChange(0); setIsRunning(false); }}
          variant="outline"
          style={{ padding: '0.75rem 1.5rem' }}
        >
          🔄 Reset
        </Button>
      </div>
      {unite && <p style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.75rem', marginTop: '0.5rem' }}>Unité: {unite}</p>}
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
    <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      <canvas
        ref={canvasRef}
        width={300}
        height={150}
        style={{ border: '1px solid #d1d5db', borderRadius: '0.375rem', backgroundColor: 'white', touchAction: 'none', width: '100%', maxWidth: '300px' }}
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
const InspectionBorneSecheModal = ({ borne, tenantSlug, onClose, onSuccess }) => {
  const [modele, setModele] = useState(null);
  const [reponses, setReponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAnomalieForm, setShowAnomalieForm] = useState(false);
  const [anomalieData, setAnomalieData] = useState({ commentaire: '', photos: [] });
  const [alertes, setAlertes] = useState([]);

  // Charger le modèle actif
  useEffect(() => {
    const fetchModele = async () => {
      try {
        const data = await apiGet(tenantSlug, '/bornes-seches/modeles-inspection/actif');
        setModele(data);
        // Initialiser les réponses
        const initialReponses = {};
        data.sections?.forEach(section => {
          initialReponses[section.id] = {
            section_id: section.id,
            section_titre: section.titre,
            type_champ: section.type_champ,
            valeur: section.type_champ === 'checkbox' ? [] : (section.type_champ === 'toggle' ? false : ''),
            items: {}
          };
        });
        setReponses(initialReponses);
      } catch (error) {
        console.error('Erreur chargement modèle:', error);
        alert('Erreur lors du chargement du formulaire');
      } finally {
        setLoading(false);
      }
    };
    fetchModele();
  }, [tenantSlug]);

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

  // Soumettre l'inspection
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const reponsesArray = Object.values(reponses).map(r => ({
        ...r,
        items: Object.entries(r.items || {}).map(([itemId, valeur]) => ({
          item_id: itemId,
          valeur
        }))
      }));

      const inspectionData = {
        borne_seche_id: borne.id,
        modele_id: modele.id,
        reponses: reponsesArray,
        alertes: alertes,
        has_anomalie: showAnomalieForm,
        commentaire_anomalie: anomalieData.commentaire,
        photos_anomalie: anomalieData.photos,
        latitude: reponses.geolocation?.valeur?.latitude,
        longitude: reponses.geolocation?.valeur?.longitude,
        signature_inspecteur: Object.values(reponses).find(r => r.type_champ === 'signature')?.valeur || ''
      };

      await apiPost(tenantSlug, '/bornes-seches/inspections-personnalisees', inspectionData);
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

  // Rendu d'un champ selon son type
  const renderField = (section) => {
    const reponse = reponses[section.id];
    if (!reponse) return null;

    switch (section.type_champ) {
      case 'radio':
        // Radio avec items
        if (section.items?.length > 0) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {section.items.map(item => (
                <div key={item.id} style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '500', marginBottom: '0.5rem' }}>{item.nom}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {section.options?.map(opt => {
                      const isSelected = reponse.items?.[item.id] === opt.label;
                      const isAlerte = opt.declencherAlerte;
                      return (
                        <label
                          key={opt.label}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            border: isSelected ? '2px solid' : '1px solid #d1d5db',
                            borderColor: isSelected ? (isAlerte ? '#dc2626' : '#10b981') : '#d1d5db',
                            backgroundColor: isSelected ? (isAlerte ? '#fef2f2' : '#f0fdf4') : 'white'
                          }}
                        >
                          <input
                            type="radio"
                            name={`${section.id}_${item.id}`}
                            checked={isSelected}
                            onChange={() => updateReponse(section.id, opt.label, item.id)}
                            style={{ display: 'none' }}
                          />
                          {isAlerte && '⚠️ '}{opt.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        }
        // Radio simple
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {section.options?.map(opt => {
              const isSelected = reponse.valeur === opt.label;
              const isAlerte = opt.declencherAlerte;
              return (
                <label
                  key={opt.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: isSelected ? '2px solid' : '1px solid #d1d5db',
                    borderColor: isSelected ? (isAlerte ? '#dc2626' : '#10b981') : '#d1d5db',
                    backgroundColor: isSelected ? (isAlerte ? '#fef2f2' : '#f0fdf4') : 'white'
                  }}
                >
                  <input
                    type="radio"
                    name={section.id}
                    checked={isSelected}
                    onChange={() => updateReponse(section.id, opt.label)}
                    style={{ display: 'none' }}
                  />
                  {isAlerte && '⚠️ '}{opt.label}
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {section.options?.map(opt => {
              const isChecked = Array.isArray(reponse.valeur) && reponse.valeur.includes(opt.label);
              return (
                <label key={opt.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {
                      const current = Array.isArray(reponse.valeur) ? reponse.valeur : [];
                      const newValue = isChecked ? current.filter(v => v !== opt.label) : [...current, opt.label];
                      updateReponse(section.id, newValue);
                    }}
                  />
                  {opt.declencherAlerte && '⚠️ '}{opt.label}
                </label>
              );
            })}
          </div>
        );

      case 'select':
        return (
          <select
            value={reponse.valeur || ''}
            onChange={(e) => updateReponse(section.id, e.target.value)}
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '1rem' }}
          >
            <option value="">-- Sélectionner --</option>
            {section.options?.map(opt => (
              <option key={opt.label} value={opt.label}>
                {opt.declencherAlerte ? '⚠️ ' : ''}{opt.label}
              </option>
            ))}
          </select>
        );

      case 'text':
        return (
          <textarea
            value={reponse.valeur || ''}
            onChange={(e) => updateReponse(section.id, e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '1rem', resize: 'vertical' }}
            placeholder="Entrez votre commentaire..."
          />
        );

      case 'number':
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="number"
              value={reponse.valeur || ''}
              onChange={(e) => updateReponse(section.id, e.target.value ? parseFloat(e.target.value) : '')}
              style={{ flex: 1, padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '1rem' }}
              placeholder="Valeur"
            />
            {section.unite && <span style={{ color: '#6b7280', fontWeight: '500' }}>{section.unite}</span>}
          </div>
        );

      case 'toggle':
        return (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={reponse.valeur || false}
              onChange={(e) => updateReponse(section.id, e.target.checked)}
              style={{ width: '1.5rem', height: '1.5rem' }}
            />
            <span style={{ fontWeight: '500' }}>{reponse.valeur ? 'Oui ✓' : 'Non'}</span>
          </label>
        );

      case 'date':
        return (
          <input
            type="date"
            value={reponse.valeur || ''}
            onChange={(e) => updateReponse(section.id, e.target.value)}
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '1rem' }}
          />
        );

      case 'timer':
        return <TimerField value={reponse.valeur} onChange={(v) => updateReponse(section.id, v)} unite={section.unite} seuilAlerte={section.seuil_alerte} />;

      case 'geolocation':
        return <GeolocationField value={reponse.valeur} onChange={(v) => updateReponse(section.id, v)} />;

      case 'signature':
        return <SignatureField value={reponse.valeur} onChange={(v) => updateReponse(section.id, v)} />;

      case 'rating':
        return <RatingField value={reponse.valeur || 0} onChange={(v) => updateReponse(section.id, v)} />;

      case 'photo':
        return (
          <div>
            <ImageUpload
              value={reponse.valeur || ''}
              onChange={(url) => updateReponse(section.id, url)}
              multiple={true}
            />
          </div>
        );

      default:
        return <p style={{ color: '#6b7280' }}>Type de champ non supporté: {section.type_champ}</p>;
    }
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
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '1rem', overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '0.75rem', width: '100%', maxWidth: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', marginTop: '2rem', marginBottom: '2rem' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem', borderBottom: '1px solid #e5e7eb', backgroundColor: '#dc2626', borderRadius: '0.75rem 0.75rem 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, color: 'white', fontSize: '1.25rem', fontWeight: '600' }}>
                🔍 Inspection: {borne?.nom || borne?.numero_identification}
              </h2>
              <p style={{ margin: '0.25rem 0 0', color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
                {modele?.nom}
              </p>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
          </div>
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
                  Description de l'anomalie *
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
                    Photos de l'anomalie
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

        {/* Footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose} variant="outline">
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ backgroundColor: submitting ? '#9ca3af' : '#10b981', color: 'white', fontWeight: '600' }}
          >
            {submitting ? '⏳ Enregistrement...' : '✓ Terminer l\'inspection'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionBorneSecheModal;
