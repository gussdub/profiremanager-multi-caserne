import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import useSpeechRecognition from '../hooks/useSpeechRecognition';

/**
 * Bouton d'entrée vocale avec support bilingue FR/EN
 * Affiche le micro animé pendant l'écoute
 */
const VoiceInputButton = ({ 
  onTranscript, 
  defaultLanguage = 'fr-CA',
  placeholder = 'Cliquez pour parler...',
  size = 'sm'
}) => {
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    toggleLanguage
  } = useSpeechRecognition(defaultLanguage);

  const [currentLang, setCurrentLang] = useState(defaultLanguage);

  // Quand un nouveau transcript arrive, l'envoyer au parent
  useEffect(() => {
    if (transcript && !isListening) {
      onTranscript(transcript);
      resetTranscript();
    }
  }, [transcript, isListening, onTranscript, resetTranscript]);

  const handleToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(currentLang);
    }
  };

  const handleLanguageSwitch = () => {
    const newLang = currentLang === 'fr-CA' ? 'en-US' : 'fr-CA';
    setCurrentLang(newLang);
    toggleLanguage(newLang);
  };

  // Si pas supporté, ne rien afficher (fallback)
  if (!isSupported) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
      <Button
        type="button"
        size={size}
        variant={isListening ? 'default' : 'outline'}
        onClick={handleToggle}
        style={{
          backgroundColor: isListening ? '#ef4444' : 'white',
          color: isListening ? 'white' : '#374151',
          animation: isListening ? 'pulse 1.5s infinite' : 'none',
          border: isListening ? 'none' : '1px solid #e5e7eb'
        }}
        title={isListening ? 'Cliquez pour arrêter' : placeholder}
      >
        {isListening ? (
          <>
            <span style={{ fontSize: '1rem' }}>🔴</span>
            <span style={{ marginLeft: '0.25rem', fontSize: '0.75rem' }}>En écoute...</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1rem' }}>🎤</span>
          </>
        )}
      </Button>
      
      {/* Bouton pour changer de langue */}
      <button
        type="button"
        onClick={handleLanguageSwitch}
        style={{
          padding: '0.25rem 0.5rem',
          fontSize: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          backgroundColor: 'white',
          cursor: 'pointer',
          color: '#6b7280'
        }}
        title="Changer de langue"
      >
        {currentLang === 'fr-CA' ? '🇫🇷 FR' : '🇬🇧 EN'}
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.05);
          }
        }
      `}</style>
    </div>
  );
};

export default VoiceInputButton;
