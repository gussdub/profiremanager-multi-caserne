import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './button';

/**
 * Composant Chronomètre avec support pour:
 * - Mode chronomètre (compte progressif)
 * - Mode compte à rebours
 * - Enregistrement des tours/intervalles
 */
const Stopwatch = ({ 
  mode = 'stopwatch', // 'stopwatch' ou 'countdown'
  countdownSeconds = 300, // 5 minutes par défaut pour le countdown
  onTimeUpdate,
  onLapRecorded,
  onComplete,
  initialValue = null
}) => {
  const [time, setTime] = useState(mode === 'countdown' ? countdownSeconds * 1000 : 0);
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState(initialValue?.laps || []);
  const [startTime, setStartTime] = useState(null);
  const intervalRef = useRef(null);

  // Formatage du temps en mm:ss.ms
  const formatTime = useCallback((ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  }, []);

  // Formatage court pour les tours
  const formatTimeLap = useCallback((ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes}min ${seconds}s`;
    }
    return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
  }, []);

  useEffect(() => {
    if (isRunning) {
      const start = Date.now() - (mode === 'countdown' ? (countdownSeconds * 1000 - time) : time);
      setStartTime(start);
      
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - start;
        
        if (mode === 'countdown') {
          const remaining = Math.max(0, countdownSeconds * 1000 - elapsed);
          setTime(remaining);
          
          if (remaining === 0) {
            setIsRunning(false);
            clearInterval(intervalRef.current);
            onComplete?.();
          }
        } else {
          setTime(elapsed);
        }
      }, 10);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isRunning, mode, countdownSeconds]);

  // Notifier le parent des changements
  useEffect(() => {
    onTimeUpdate?.({
      time,
      formattedTime: formatTime(time),
      laps,
      isRunning
    });
  }, [time, laps, isRunning]);

  const handleStartStop = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTime(mode === 'countdown' ? countdownSeconds * 1000 : 0);
    setLaps([]);
    setStartTime(null);
  };

  const handleLap = () => {
    if (isRunning) {
      const lapTime = mode === 'countdown' ? (countdownSeconds * 1000 - time) : time;
      const newLap = {
        number: laps.length + 1,
        time: lapTime,
        formatted: formatTimeLap(lapTime),
        delta: laps.length > 0 ? lapTime - laps[laps.length - 1].time : lapTime
      };
      const newLaps = [...laps, newLap];
      setLaps(newLaps);
      onLapRecorded?.(newLap, newLaps);
    }
  };

  // Couleur selon le temps restant (pour countdown)
  const getTimeColor = () => {
    if (mode === 'countdown') {
      const percent = (time / (countdownSeconds * 1000)) * 100;
      if (percent <= 10) return '#ef4444'; // Rouge
      if (percent <= 25) return '#f59e0b'; // Orange
      return '#22c55e'; // Vert
    }
    return '#3b82f6'; // Bleu par défaut
  };

  return (
    <div style={{
      border: '2px solid #e5e7eb',
      borderRadius: '12px',
      padding: '1rem',
      backgroundColor: '#f8fafc'
    }}>
      {/* Affichage du mode */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '0.5rem'
      }}>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
          {mode === 'countdown' ? '⏱️ Compte à rebours' : '🕐 Chronomètre'}
        </span>
        {mode === 'countdown' && (
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Max: {formatTimeLap(countdownSeconds * 1000)}
          </span>
        )}
      </div>

      {/* Affichage du temps principal */}
      <div style={{
        fontSize: '2.5rem',
        fontWeight: '700',
        fontFamily: 'monospace',
        textAlign: 'center',
        color: getTimeColor(),
        padding: '0.5rem 0',
        transition: 'color 0.3s'
      }}>
        {formatTime(time)}
      </div>

      {/* Barre de progression pour countdown */}
      {mode === 'countdown' && (
        <div style={{
          height: '6px',
          backgroundColor: '#e5e7eb',
          borderRadius: '3px',
          marginBottom: '1rem',
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${(time / (countdownSeconds * 1000)) * 100}%`,
            backgroundColor: getTimeColor(),
            transition: 'width 0.1s linear, background-color 0.3s'
          }} />
        </div>
      )}

      {/* Boutons de contrôle */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        justifyContent: 'center',
        marginBottom: '0.75rem'
      }}>
        <Button
          type="button"
          onClick={handleStartStop}
          style={{
            backgroundColor: isRunning ? '#f59e0b' : '#22c55e',
            color: 'white',
            padding: '0.5rem 1.5rem',
            borderRadius: '8px',
            fontWeight: '600',
            minWidth: '100px'
          }}
        >
          {isRunning ? '⏸️ Pause' : '▶️ Démarrer'}
        </Button>
        
        <Button
          type="button"
          onClick={handleLap}
          disabled={!isRunning}
          style={{
            backgroundColor: isRunning ? '#3b82f6' : '#9ca3af',
            color: 'white',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            fontWeight: '500'
          }}
        >
          🏁 Tour
        </Button>
        
        <Button
          type="button"
          onClick={handleReset}
          variant="outline"
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px'
          }}
        >
          🔄 Reset
        </Button>
      </div>

      {/* Liste des tours */}
      {laps.length > 0 && (
        <div style={{
          maxHeight: '150px',
          overflowY: 'auto',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '0.5rem',
          marginTop: '0.5rem'
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
            📋 Tours enregistrés:
          </div>
          {laps.map((lap, index) => (
            <div 
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0.25rem 0.5rem',
                backgroundColor: index % 2 === 0 ? '#f1f5f9' : 'transparent',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}
            >
              <span style={{ fontWeight: '500' }}>Tour {lap.number}</span>
              <span style={{ fontFamily: 'monospace' }}>{lap.formatted}</span>
              {index > 0 && (
                <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  (+{formatTimeLap(lap.delta)})
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stopwatch;
