import React from 'react';

/**
 * Composant Slider/Curseur avec labels et valeur affichée
 */
const Slider = ({
  value = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  showValue = true,
  showLabels = true,
  lowLabel = '',
  highLabel = '',
  thresholds = [], // [{value: 50, color: '#f59e0b'}, {value: 80, color: '#ef4444'}]
  disabled = false
}) => {
  // Calculer la couleur basée sur les seuils
  const getColor = () => {
    if (thresholds.length === 0) return '#3b82f6';
    
    // Trier les seuils par valeur décroissante
    const sortedThresholds = [...thresholds].sort((a, b) => b.value - a.value);
    
    for (const threshold of sortedThresholds) {
      if (value >= threshold.value) {
        return threshold.color;
      }
    }
    return '#22c55e'; // Vert par défaut si en dessous de tous les seuils
  };

  // Calculer le pourcentage pour le style
  const percentage = ((value - min) / (max - min)) * 100;
  const color = getColor();

  return (
    <div style={{ width: '100%', padding: '0.5rem 0' }}>
      {/* Valeur affichée */}
      {showValue && (
        <div style={{
          textAlign: 'center',
          marginBottom: '0.5rem'
        }}>
          <span style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            color: color,
            fontFamily: 'monospace'
          }}>
            {value}
          </span>
          {unit && (
            <span style={{ 
              fontSize: '0.9rem', 
              color: '#64748b',
              marginLeft: '0.25rem'
            }}>
              {unit}
            </span>
          )}
        </div>
      )}

      {/* Slider */}
      <div style={{ position: 'relative', padding: '0 0.5rem' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
          disabled={disabled}
          style={{
            width: '100%',
            height: '8px',
            borderRadius: '4px',
            appearance: 'none',
            background: `linear-gradient(to right, ${color} 0%, ${color} ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1
          }}
        />
        
        {/* Markers pour les seuils */}
        {thresholds.map((threshold, index) => {
          const pos = ((threshold.value - min) / (max - min)) * 100;
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: `calc(${pos}% + 0.5rem)`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '2px',
                height: '16px',
                backgroundColor: threshold.color,
                opacity: 0.5
              }}
            />
          );
        })}
      </div>

      {/* Labels min/max */}
      {showLabels && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '0.25rem',
          fontSize: '0.75rem',
          color: '#64748b'
        }}>
          <span>{lowLabel || `${min}${unit}`}</span>
          <span>{highLabel || `${max}${unit}`}</span>
        </div>
      )}
    </div>
  );
};

export default Slider;
