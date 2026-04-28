import React, { useState, useEffect, useRef } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useAuth } from '../contexts/AuthContext';

/**
 * Composants de champs pour les inspections
 * Utilisés dans RealiserInspection pour le rendu dynamique des types de champs
 */

// ====== NOMBRE AVEC UNITÉ ======
export const NombreUniteField = ({ value, onChange, config }) => {
  const handleChange = (field, val) => {
    onChange({ ...value, [field]: val });
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
      <Input
        type="number"
        value={value?.nombre || ''}
        onChange={(e) => handleChange('nombre', e.target.value)}
        placeholder="Valeur"
        style={{ flex: 1 }}
      />
      <Input
        value={value?.unite || config?.unite_defaut || ''}
        onChange={(e) => handleChange('unite', e.target.value)}
        placeholder="Unité"
        style={{ width: '120px' }}
      />
    </div>
  );
};

// ====== CURSEUR (SLIDER) ======
export const CurseurField = ({ value, onChange, config }) => {
  const min = config?.min || 0;
  const max = config?.max || 100;
  const step = config?.step || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value || min}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{
          minWidth: '60px',
          textAlign: 'center',
          fontWeight: '600',
          fontSize: '1.125rem',
          color: '#3b82f6'
        }}>
          {value || min}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280' }}>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};

// ====== CHRONOMÈTRE ======
export const ChronometreField = ({ value, onChange }) => {
  const [temps, setTemps] = useState(value || 0);
  const [enCours, setEnCours] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (enCours) {
      intervalRef.current = setInterval(() => {
        setTemps(prev => {
          const newValue = prev + 1;
          onChange(newValue);
          return newValue;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enCours]);

  const formatTemps = (secondes) => {
    const heures = Math.floor(secondes / 3600);
    const minutes = Math.floor((secondes % 3600) / 60);
    const secs = secondes % 60;
    return `${String(heures).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const reinitialiser = () => {
    setTemps(0);
    setEnCours(false);
    onChange(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{
        fontSize: '2rem',
        fontWeight: '600',
        textAlign: 'center',
        fontFamily: 'monospace',
        color: enCours ? '#3b82f6' : '#1f2937'
      }}>
        {formatTemps(temps)}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          size="sm"
          onClick={() => setEnCours(!enCours)}
          style={{ flex: 1, backgroundColor: enCours ? '#ef4444' : '#3b82f6', color: 'white' }}
        >
          {enCours ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reinitialiser}
        >
          🔄 Réinitialiser
        </Button>
      </div>
    </div>
  );
};

// ====== COMPTE À REBOURS ======
export const CompteReboursField = ({ value, onChange, config }) => {
  const dureeInitiale = config?.duree_secondes || 60;
  const [tempsRestant, setTempsRestant] = useState(value !== undefined ? value : dureeInitiale);
  const [enCours, setEnCours] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (enCours && tempsRestant > 0) {
      intervalRef.current = setInterval(() => {
        setTempsRestant(prev => {
          const newValue = Math.max(0, prev - 1);
          onChange(newValue);
          if (newValue === 0) {
            setEnCours(false);
          }
          return newValue;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enCours, tempsRestant]);

  const formatTemps = (secondes) => {
    const minutes = Math.floor(secondes / 60);
    const secs = secondes % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const reinitialiser = () => {
    setTempsRestant(dureeInitiale);
    setEnCours(false);
    onChange(dureeInitiale);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{
        fontSize: '2rem',
        fontWeight: '600',
        textAlign: 'center',
        fontFamily: 'monospace',
        color: tempsRestant <= 10 ? '#ef4444' : enCours ? '#3b82f6' : '#1f2937'
      }}>
        {formatTemps(tempsRestant)}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          size="sm"
          onClick={() => setEnCours(!enCours)}
          disabled={tempsRestant === 0}
          style={{ flex: 1, backgroundColor: enCours ? '#ef4444' : '#3b82f6', color: 'white' }}
        >
          {enCours ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={reinitialiser}
        >
          🔄 Réinitialiser
        </Button>
      </div>
    </div>
  );
};

// ====== QR CODE / CODE-BARRES ======
export const QRCodeField = ({ value, onChange }) => {
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState(false);

  const handleManualScan = (code) => {
    onChange(code);
    setManualInput(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {value ? (
        <div style={{
          padding: '0.75rem',
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '6px'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#166534', marginBottom: '0.25rem' }}>
            Code scanné:
          </div>
          <div style={{ fontWeight: '600', fontFamily: 'monospace' }}>{value}</div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onChange('')}
            style={{ marginTop: '0.5rem' }}
          >
            ✕ Effacer
          </Button>
        </div>
      ) : (
        <>
          {manualInput ? (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Input
                placeholder="Entrer le code manuellement"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleManualScan(e.target.value);
                  }
                }}
              />
              <Button size="sm" onClick={(e) => {
                const input = e.target.previousSibling;
                if (input.value) handleManualScan(input.value);
              }}>
                ✓
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                size="sm"
                style={{ flex: 1, backgroundColor: '#3b82f6', color: 'white' }}
                onClick={() => setScanning(true)}
              >
                📱 Scanner QR/Code-barres
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setManualInput(true)}
              >
                ⌨️ Saisie manuelle
              </Button>
            </div>
          )}
        </>
      )}
      {scanning && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '0.5rem' }}>📷 Fonction de scan disponible uniquement sur mobile avec caméra</p>
          <Button size="sm" variant="outline" onClick={() => setScanning(false)}>
            Fermer
          </Button>
        </div>
      )}
    </div>
  );
};

// ====== CALCUL AUTOMATIQUE ======
export const CalculAutoField = ({ value, onChange, config, allValues }) => {
  const [resultat, setResultat] = useState(value || 0);

  useEffect(() => {
    // Évaluer la formule si elle existe
    if (config?.formule) {
      try {
        // Remplacer les références de champs par leurs valeurs
        let formule = config.formule;
        Object.keys(allValues || {}).forEach(key => {
          const val = allValues[key];
          if (typeof val === 'number') {
            formule = formule.replace(new RegExp(`{${key}}`, 'g'), val);
          }
        });
        
        // Évaluer la formule (seulement si elle ne contient que des chiffres et opérateurs)
        if (/^[\d\s+\-*/.()]+$/.test(formule)) {
          const result = eval(formule);
          setResultat(result);
          onChange(result);
        }
      } catch (error) {
        console.error('Erreur calcul:', error);
      }
    }
  }, [config, allValues]);

  return (
    <div style={{
      padding: '0.75rem',
      backgroundColor: '#eff6ff',
      border: '1px solid #93c5fd',
      borderRadius: '6px'
    }}>
      <div style={{ fontSize: '0.75rem', color: '#1e40af', marginBottom: '0.25rem' }}>
        Résultat calculé:
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1e3a8a' }}>
        {resultat}
      </div>
      {config?.formule && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
          Formule: {config.formule}
        </div>
      )}
    </div>
  );
};

// ====== INSPECTEUR AUTO-REMPLI ======
export const InspecteurAutoField = ({ value, onChange }) => {
  const { user } = useAuth();
  const nomInspecteur = user ? `${user.prenom} ${user.nom}` : '';

  useEffect(() => {
    if (!value && nomInspecteur) {
      onChange(nomInspecteur);
    }
  }, [nomInspecteur]);

  return (
    <Input
      value={value || nomInspecteur}
      onChange={(e) => onChange(e.target.value)}
      style={{ backgroundColor: '#f9fafb' }}
      placeholder="Nom de l'inspecteur"
    />
  );
};

// ====== LIEU AUTO-REMPLI ======
export const LieuAutoField = ({ value, onChange, batiment }) => {
  const [useGPS, setUseGPS] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);

  const lieuDefaut = batiment 
    ? `${batiment.adresse_civique || ''}, ${batiment.ville || ''}`.trim()
    : '';

  useEffect(() => {
    if (!value && lieuDefaut) {
      onChange(lieuDefaut);
    }
  }, [lieuDefaut]);

  const obtenirPositionGPS = () => {
    if (navigator.geolocation) {
      setUseGPS(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setGpsCoords(coords);
          onChange(`GPS: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
          setUseGPS(false);
        },
        (error) => {
          console.error('Erreur GPS:', error);
          setUseGPS(false);
        }
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <Input
        value={value || lieuDefaut}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Adresse ou position"
        style={{ backgroundColor: '#f9fafb' }}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={obtenirPositionGPS}
        disabled={useGPS}
      >
        {useGPS ? '📍 Localisation en cours...' : '📍 Obtenir position GPS'}
      </Button>
    </div>
  );
};

// ====== MÉTÉO AUTO-REMPLI ======
export const MeteoAutoField = ({ value, onChange, location }) => {
  const [loading, setLoading] = useState(false);
  const [meteo, setMeteo] = useState(value || null);

  const obtenirMeteo = async () => {
    setLoading(true);
    try {
      // Simuler une API météo (OpenWeatherMap ou autre)
      // Pour l'instant, on génère une météo aléatoire
      const conditions = ['Ensoleillé ☀️', 'Nuageux ☁️', 'Pluvieux 🌧️', 'Neigeux ❄️', 'Orageux ⛈️'];
      const meteoData = {
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        temperature: Math.floor(Math.random() * 30) - 10,
        date: new Date().toLocaleString('fr-CA')
      };
      setMeteo(meteoData);
      onChange(JSON.stringify(meteoData));
    } catch (error) {
      console.error('Erreur météo:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!value) {
      obtenirMeteo();
    } else {
      try {
        setMeteo(JSON.parse(value));
      } catch {
        setMeteo({ condition: value, temperature: null });
      }
    }
  }, []);

  return (
    <div style={{
      padding: '0.75rem',
      backgroundColor: '#f0f9ff',
      border: '1px solid #bae6fd',
      borderRadius: '6px'
    }}>
      {meteo ? (
        <>
          <div style={{ fontSize: '1.125rem', fontWeight: '600' }}>
            {meteo.condition}
          </div>
          {meteo.temperature !== null && (
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Température: {meteo.temperature}°C
            </div>
          )}
          {meteo.date && (
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              {meteo.date}
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={obtenirMeteo}
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? '⏳ Actualisation...' : '🔄 Actualiser'}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          onClick={obtenirMeteo}
          disabled={loading}
        >
          {loading ? '⏳ Chargement...' : '🌤️ Obtenir météo'}
        </Button>
      )}
    </div>
  );
};

export default {
  NombreUniteField,
  CurseurField,
  ChronometreField,
  CompteReboursField,
  QRCodeField,
  CalculAutoField,
  InspecteurAutoField,
  LieuAutoField,
  MeteoAutoField
};
