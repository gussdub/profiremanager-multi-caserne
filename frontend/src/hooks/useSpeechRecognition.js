import { useState, useEffect, useCallback } from 'react';

/**
 * Hook personnalisé pour la reconnaissance vocale (Speech-to-Text)
 * Supporte FR et EN avec fallback si non supporté
 */
export const useSpeechRecognition = (language = 'fr-CA') => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    // Vérifier si le navigateur supporte la reconnaissance vocale
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false; // Arrêt automatique après silence
      recognitionInstance.interimResults = true; // Résultats en temps réel
      recognitionInstance.lang = language; // Langue par défaut
      recognitionInstance.maxAlternatives = 1;

      recognitionInstance.onstart = () => {
        setIsListening(true);
      };

      recognitionInstance.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart + ' ';
          } else {
            interimTranscript += transcriptPart;
          }
        }

        setTranscript(finalTranscript || interimTranscript);
      };

      recognitionInstance.onerror = (event) => {
        console.error('Erreur reconnaissance vocale:', event.error);
        setIsListening(false);
        
        // Gestion des erreurs spécifiques
        if (event.error === 'no-speech') {
          console.log('Aucune parole détectée');
        } else if (event.error === 'not-allowed') {
          console.log('Permission micro refusée');
        }
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    } else {
      setIsSupported(false);
      console.warn('Web Speech API non supportée par ce navigateur');
    }

    return () => {
      if (recognition) {
        recognition.abort();
      }
    };
  }, [language]);

  const startListening = useCallback((lang = null) => {
    if (recognition && !isListening) {
      setTranscript('');
      if (lang) {
        recognition.lang = lang;
      }
      try {
        recognition.start();
      } catch (error) {
        console.error('Erreur démarrage reconnaissance:', error);
      }
    }
  }, [recognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognition && isListening) {
      recognition.stop();
    }
  }, [recognition, isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  const toggleLanguage = useCallback((lang) => {
    if (recognition) {
      recognition.lang = lang;
    }
  }, [recognition]);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    toggleLanguage
  };
};

export default useSpeechRecognition;
