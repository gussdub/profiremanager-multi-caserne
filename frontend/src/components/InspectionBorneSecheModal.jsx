import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost } from '../utils/api';
import ImageUpload from './ImageUpload';
import { Button } from './ui/button';

// Composant Chronomètre (s'incrémente)
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

// Composant Compte à Rebours (se décrémente et sonne à 0)
const CountdownField = ({ value, onChange, config }) => {
  const dureeInitiale = (config?.duree_minutes || 5) * 60; // Durée en secondes
  const [isRunning, setIsRunning] = useState(false);
  const [time, setTime] = useState(value !== undefined && value !== null && value !== '' ? value : dureeInitiale);
  const [hasFinished, setHasFinished] = useState(false);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  // Créer l'audio pour l'alarme
  useEffect(() => {
    // Créer un contexte audio pour la sonnerie
    audioRef.current = {
      play: () => {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 880; // Note LA
          oscillator.type = 'sine';
          gainNode.gain.value = 0.5;
          
          oscillator.start();
          
          // Faire biper 3 fois
          setTimeout(() => { gainNode.gain.value = 0; }, 200);
          setTimeout(() => { gainNode.gain.value = 0.5; }, 400);
          setTimeout(() => { gainNode.gain.value = 0; }, 600);
          setTimeout(() => { gainNode.gain.value = 0.5; }, 800);
          setTimeout(() => { gainNode.gain.value = 0; }, 1000);
          setTimeout(() => { oscillator.stop(); }, 1200);
        } catch (e) {
          console.warn('Audio non supporté:', e);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (isRunning && time > 0) {
      intervalRef.current = setInterval(() => {
        setTime(prev => {
          const newTime = Math.max(0, prev - 0.1);
          onChange(Math.round(newTime * 10) / 10);
          
          if (newTime <= 0 && !hasFinished) {
            setHasFinished(true);
            setIsRunning(false);
            // Jouer la sonnerie
            audioRef.current?.play();
          }
          
          return newTime;
        });
      }, 100);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, time, hasFinished]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const resetCountdown = () => {
    setTime(dureeInitiale);
    onChange(dureeInitiale);
    setIsRunning(false);
    setHasFinished(false);
  };

  const isLowTime = time <= 30 && time > 0; // Moins de 30 secondes
  const isFinished = time <= 0;

  return (
    <div style={{ 
      padding: '0.75rem', 
      backgroundColor: isFinished ? '#fef2f2' : isLowTime ? '#fffbeb' : '#f0fdf4', 
      borderRadius: '0.5rem', 
      border: isFinished ? '2px solid #dc2626' : isLowTime ? '2px solid #f59e0b' : '1px solid #10b981' 
    }}>
      <div style={{ textAlign: 'center', marginBottom: '0.5rem', color: '#6b7280', fontSize: '0.75rem' }}>
        ⏱️ Compte à rebours ({config?.duree_minutes || 5} min)
      </div>
      <div style={{ 
        fontSize: 'clamp(1.75rem, 8vw, 2.5rem)', 
        fontFamily: 'monospace', 
        fontWeight: 'bold', 
        textAlign: 'center', 
        color: isFinished ? '#dc2626' : isLowTime ? '#d97706' : '#059669', 
        marginBottom: '0.75rem' 
      }}>
        {formatTime(time)}
      </div>
      {isFinished && (
        <div style={{ textAlign: 'center', color: '#dc2626', fontWeight: '700', marginBottom: '0.5rem', fontSize: '1rem', animation: 'pulse 1s infinite' }}>
          🔔 TEMPS ÉCOULÉ!
        </div>
      )}
      {isLowTime && !isFinished && (
        <div style={{ textAlign: 'center', color: '#d97706', fontWeight: '600', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          ⚠️ Moins de 30 secondes!
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button
          type="button"
          onClick={() => { setIsRunning(!isRunning); setHasFinished(false); }}
          disabled={isFinished}
          style={{ 
            backgroundColor: isRunning ? '#f59e0b' : '#10b981', 
            color: 'white', 
            padding: '0.625rem 1rem', 
            fontWeight: '600', 
            fontSize: '0.875rem', 
            flex: '1 1 auto', 
            maxWidth: '140px',
            opacity: isFinished ? 0.5 : 1
          }}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        <Button
          type="button"
          onClick={resetCountdown}
          variant="outline"
          style={{ padding: '0.625rem 1rem', fontSize: '0.875rem', flex: '1 1 auto', maxWidth: '140px' }}
        >
          🔄 Réinitialiser
        </Button>
      </div>
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

// Composant Météo (auto-rempli via géolocalisation)
const MeteoField = ({ value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Codes météo WMO vers descriptions françaises
  const getWeatherDescription = (code) => {
    const descriptions = {
      0: { text: 'Ciel dégagé', icon: '☀️' },
      1: { text: 'Principalement dégagé', icon: '🌤️' },
      2: { text: 'Partiellement nuageux', icon: '⛅' },
      3: { text: 'Couvert', icon: '☁️' },
      45: { text: 'Brouillard', icon: '🌫️' },
      48: { text: 'Brouillard givrant', icon: '🌫️' },
      51: { text: 'Bruine légère', icon: '🌧️' },
      53: { text: 'Bruine modérée', icon: '🌧️' },
      55: { text: 'Bruine dense', icon: '🌧️' },
      61: { text: 'Pluie légère', icon: '🌧️' },
      63: { text: 'Pluie modérée', icon: '🌧️' },
      65: { text: 'Pluie forte', icon: '🌧️' },
      66: { text: 'Pluie verglaçante légère', icon: '🌨️' },
      67: { text: 'Pluie verglaçante forte', icon: '🌨️' },
      71: { text: 'Neige légère', icon: '🌨️' },
      73: { text: 'Neige modérée', icon: '🌨️' },
      75: { text: 'Neige forte', icon: '❄️' },
      77: { text: 'Grains de neige', icon: '❄️' },
      80: { text: 'Averses légères', icon: '🌦️' },
      81: { text: 'Averses modérées', icon: '🌦️' },
      82: { text: 'Averses violentes', icon: '🌦️' },
      85: { text: 'Averses de neige légères', icon: '🌨️' },
      86: { text: 'Averses de neige fortes', icon: '🌨️' },
      95: { text: 'Orage', icon: '⛈️' },
      96: { text: 'Orage avec grêle légère', icon: '⛈️' },
      99: { text: 'Orage avec grêle forte', icon: '⛈️' }
    };
    return descriptions[code] || { text: 'Inconnu', icon: '❓' };
  };

  const fetchWeather = async () => {
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée');
      return;
    }
    
    setLoading(true);
    setError('');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          // Utiliser Open-Meteo API (gratuite, pas de clé requise)
          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`
          );
          
          if (!response.ok) throw new Error('Erreur API météo');
          
          const data = await response.json();
          const current = data.current;
          const weather = getWeatherDescription(current.weather_code);
          
          onChange({
            temperature: current.temperature_2m,
            humidity: current.relative_humidity_2m,
            wind_speed: current.wind_speed_10m,
            wind_direction: current.wind_direction_10m,
            condition: weather.text,
            icon: weather.icon,
            latitude: latitude,
            longitude: longitude,
            timestamp: new Date().toISOString()
          });
          
          setLoading(false);
        } catch (err) {
          setError('Erreur lors de la récupération météo: ' + err.message);
          setLoading(false);
        }
      },
      (err) => {
        setError('Erreur géolocalisation: ' + err.message);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  // Charger automatiquement au montage
  useEffect(() => {
    if (!value?.temperature) {
      fetchWeather();
    }
  }, []);

  return (
    <div style={{ padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '0.5rem', border: '1px solid #bae6fd' }}>
      {value?.temperature !== undefined ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2.5rem' }}>{value.icon || '🌤️'}</span>
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0369a1' }}>
                {value.temperature}°C
              </div>
              <div style={{ fontSize: '0.875rem', color: '#0284c7', fontWeight: '500' }}>
                {value.condition}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>💧</span> Humidité: {value.humidity}%
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>💨</span> Vent: {value.wind_speed} km/h
            </div>
          </div>
          
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
              📍 {value.latitude?.toFixed(4)}, {value.longitude?.toFixed(4)}
            </span>
            <Button 
              type="button" 
              onClick={fetchWeather} 
              variant="outline" 
              size="sm"
              disabled={loading}
              style={{ fontSize: '0.75rem' }}
            >
              {loading ? '⏳' : '🔄'} Actualiser
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <Button 
            type="button" 
            onClick={fetchWeather} 
            disabled={loading} 
            style={{ backgroundColor: '#0284c7', color: 'white' }}
          >
            {loading ? '⏳ Récupération météo...' : '🌤️ Capturer la météo'}
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
  const containerRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (value && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  // Obtenir les coordonnées correctes en tenant compte de l'échelle
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { x, y } = getCoordinates(e);
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
    <div ref={containerRef} style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      <canvas
        ref={canvasRef}
        width={400}
        height={200}
        style={{ 
          border: '1px solid #d1d5db', 
          borderRadius: '0.375rem', 
          backgroundColor: 'white', 
          touchAction: 'none', 
          width: '100%', 
          maxWidth: '400px',
          display: 'block',
          cursor: 'crosshair'
        }}
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
  const [alertes, setAlertes] = useState([]);
  const [sectionActuelle, setSectionActuelle] = useState(0); // Pagination par section
  const [currentUserName, setCurrentUserName] = useState('');

  // Récupérer le nom de l'utilisateur connecté
  useEffect(() => {
    try {
      const savedCredentials = localStorage.getItem('profiremanager_saved_credentials');
      if (savedCredentials) {
        const creds = JSON.parse(savedCredentials);
        if (creds[tenantSlug]) {
          const userName = creds[tenantSlug].userName || creds[tenantSlug].name || '';
          setCurrentUserName(userName);
        }
      }
    } catch (e) {
      console.warn('Erreur récupération nom utilisateur:', e);
    }
  }, [tenantSlug]);

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
            titre: s.nom || s.titre,  // Priorité au nom (modifié via l'interface)
            description: '',
            items: (s.items || []).map((item, itemIdx) => ({
              id: item.id || `item_${idx}_${itemIdx}`,
              nom: item.label || item.nom,  // Le label contient le bon nom
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
          case 'inspecteur':
          case 'inspecteur_auto':
            // Auto-remplir avec le nom de l'utilisateur connecté
            defaultValue = currentUserName || '';
            break;
          case 'date':
            // Auto-remplir avec la date du jour
            defaultValue = new Date().toISOString().split('T')[0];
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
    setSectionActuelle(0); // Réinitialiser la pagination
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

  // Auto-remplir le champ inspecteur quand le nom d'utilisateur devient disponible
  useEffect(() => {
    if (currentUserName && modele) {
      setReponses(prev => {
        const newReponses = { ...prev };
        modele.sections?.forEach(section => {
          (section.items || []).forEach(item => {
            if ((item.type === 'inspecteur' || item.type === 'inspecteur_auto') && 
                newReponses[section.id]?.items && 
                !newReponses[section.id].items[item.id]) {
              newReponses[section.id] = {
                ...newReponses[section.id],
                items: {
                  ...newReponses[section.id].items,
                  [item.id]: currentUserName
                }
              };
            }
          });
        });
        return newReponses;
      });
    }
  }, [currentUserName, modele]);

  // Mettre à jour une réponse
  const updateReponse = (sectionId, value, itemId = null) => {
    // Mettre à jour les réponses
    setReponses(prev => {
      const newReponses = { ...prev };
      
      if (itemId) {
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

      return newReponses;
    });

    // Vérifier les alertes séparément (évite les doublons)
    const section = modele?.sections?.find(s => s.id === sectionId);
    if (!section) return;

    if (itemId) {
      const item = section.items?.find(i => i.id === itemId);
      if (item?.alertes?.valeurs_declenchantes && Array.isArray(item.alertes.valeurs_declenchantes)) {
        const declencheAlerte = item.alertes.valeurs_declenchantes.includes(value);
        const alerteId = `${sectionId}-${itemId}`;
        const sectionNom = section.nom || section.titre || 'Section';
        const itemNom = item.label || item.nom || itemId;
        
        setAlertes(prev => {
          // Filtrer d'abord pour éviter les doublons
          const filtered = prev.filter(a => a.id !== alerteId);
          
          if (declencheAlerte) {
            const messageAlerte = item.alertes.message || item.alertes.message_personnalise || 
              `${itemNom}: ${value}`;
            return [...filtered, {
              id: alerteId,
              section_id: sectionId,
              section_titre: sectionNom,
              item_id: itemId,
              item_nom: itemNom,
              valeur: value,
              message: messageAlerte,
              severite: 'error'
            }];
          }
          return filtered;
        });
      }
    } else {
      // Ancien format (alertes au niveau section)
      if (section.options) {
        const sectionNom = section.nom || section.titre || 'Section';
        const selectedOption = section.options.find(opt => opt.label === value);
        const alerteId = sectionId;
        
        setAlertes(prev => {
          const filtered = prev.filter(a => a.id !== alerteId);
          
          if (selectedOption?.declencherAlerte) {
            return [...filtered, {
              id: alerteId,
              section_id: sectionId,
              section_titre: sectionNom,
              item_id: null,
              valeur: value,
              message: `${sectionNom}: ${value}`,
              severite: 'warning'
            }];
          }
          return filtered;
        });
      }
    }
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
            // Trouver le label de l'item dans le modèle
            let itemLabel = itemId;
            const section = modele?.sections?.find(s => s.id === r.section_id);
            if (section) {
              const item = section.items?.find(i => i.id === itemId);
              if (item) {
                itemLabel = item.nom || item.label || itemId;
              }
            }
            
            reponsesUnifiees[itemId] = {
              valeur: valeur,
              section: r.section_titre,
              label: itemLabel  // Stocker le label pour l'affichage dans l'historique
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
        conforme: alertes.length === 0, // Conformité déterminée par les alertes du formulaire
        notes_generales: '',
        alertes: alertes,
        metadata: {
          borne_nom: borne.nom || borne.numero_identification,
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
      case 'timer':
        return <TimerField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} unite={item.config?.unite} seuilAlerte={item.alertes?.seuil_max} />;

      case 'compte_rebours':
      case 'countdown':
        return <CountdownField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} config={item.config} />;

      case 'photo':
        return (
          <ImageUpload
            value={value || ''}
            onChange={(url) => updateReponse(sectionId, url, item.id)}
            multiple={true}
          />
        );

      case 'inspecteur':
      case 'inspecteur_auto':
        return (
          <input
            type="text"
            value={value || currentUserName || ''}
            onChange={(e) => updateReponse(sectionId, e.target.value, item.id)}
            placeholder="Nom de l'inspecteur"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              backgroundColor: currentUserName ? '#f0fdf4' : 'white'
            }}
          />
        );

      case 'meteo':
        return <MeteoField value={value} onChange={(v) => updateReponse(sectionId, v, item.id)} />;

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
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Chargement du formulaire...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100000, padding: '0.5rem', overflowY: 'auto' }}>
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

        {/* Formulaire avec pagination */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
          {(() => {
            const sections = modele?.sections?.sort((a, b) => a.ordre - b.ordre) || [];
            const totalSections = sections.length;
            const sectionCourante = sections[sectionActuelle];
            const estPremiereSection = sectionActuelle === 0;
            const estDerniereSection = sectionActuelle === totalSections - 1;

            if (!sectionCourante) return <p>Aucune section trouvée.</p>;

            return (
              <>
                {/* Indicateur de progression */}
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
                      backgroundColor: '#dc2626',
                      width: `${((sectionActuelle + 1) / totalSections) * 100}%`,
                      transition: 'width 0.3s'
                    }}></div>
                  </div>
                </div>

                {/* Section courante */}
                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                  <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: '600', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sectionCourante.type_champ === 'timer' && '⏱️'}
                    {sectionCourante.type_champ === 'photo' && '📸'}
                    {sectionCourante.type_champ === 'geolocation' && '📍'}
                    {sectionCourante.type_champ === 'signature' && '✍️'}
                    {sectionCourante.titre}
                  </h3>
                  {sectionCourante.description && <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>{sectionCourante.description}</p>}
                  {renderField(sectionCourante)}
                </div>

                {/* Zone d'alertes et validation (dernière section seulement) */}
                {estDerniereSection && (
                  <div style={{ marginTop: '1rem' }}>
                    {/* Box jaune: Alertes détectées (style EPI) */}
                    {alertes.length > 0 && (
                      <div style={{
                        padding: '1rem',
                        backgroundColor: '#fef9c3',
                        border: '1px solid #fde047',
                        borderRadius: '0.5rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#854d0e', fontWeight: '600', marginBottom: '0.5rem' }}>
                          🔔 Alertes détectées ({alertes.length})
                        </div>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', color: '#713f12' }}>
                          Ces alertes seront envoyées au gestionnaire:
                        </p>
                        {alertes.map((a, i) => (
                          <div key={i} style={{ fontSize: '0.875rem', color: '#713f12', marginLeft: '0.5rem' }}>
                            <strong>{a.item_nom || a.section_titre}</strong>: {a.valeur}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Box rose: NON CONFORME (style EPI) */}
                    {alertes.length > 0 && (
                      <div style={{
                        padding: '1rem',
                        backgroundColor: '#ffe4e6',
                        border: '1px solid #fecdd3',
                        borderRadius: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                        <div>
                          <div style={{ fontWeight: '700', color: '#be123c' }}>NON CONFORME</div>
                          <div style={{ fontSize: '0.875rem', color: '#be123c' }}>
                            {alertes.length} alerte(s) seront envoyées au gestionnaire
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Boutons de navigation */}
                <div style={{
                  display: 'flex',
                  gap: '1rem',
                  justifyContent: 'space-between',
                  marginTop: '1rem'
                }}>
                  <button
                    type="button"
                    onClick={() => setSectionActuelle(sectionActuelle - 1)}
                    disabled={estPremiereSection}
                    style={{
                      padding: '0.875rem 1.5rem',
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

                  {estDerniereSection ? (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={submitting}
                      style={{
                        flex: 1,
                        padding: '0.875rem',
                        backgroundColor: submitting ? '#9ca3af' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.5rem',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        fontSize: '1rem',
                        fontWeight: '600'
                      }}
                    >
                      {submitting ? '⏳ Enregistrement...' : '✓ Valider l\'inspection'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSectionActuelle(sectionActuelle + 1)}
                      style={{
                        flex: 1,
                        padding: '0.875rem',
                        backgroundColor: '#dc2626',
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
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Footer - Bouton Annuler uniquement */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center' }}>
          <Button type="button" onClick={onClose} variant="outline" style={{ fontSize: '0.875rem', padding: '0.625rem 1.5rem' }}>
            ✕ Annuler l'inspection
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionBorneSecheModal;
