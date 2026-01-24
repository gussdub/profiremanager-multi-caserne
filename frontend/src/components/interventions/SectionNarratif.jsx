import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const SectionNarratif = ({ formData, setFormData, editMode, settings }) => {
  const [isListening, setIsListening] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef(null);
  const baseTextRef = useRef(''); // Texte de base avant la dictée
  
  // Template - utiliser celui des settings s'il existe
  const template = settings?.template_narratif?.length > 0 
    ? settings.template_narratif 
    : [
        { id: 'arrivee', label: 'Arrivée sur les lieux (360)', placeholder: 'Décrivez la situation à votre arrivée...' },
        { id: 'actions', label: 'Actions entreprises', placeholder: 'Décrivez les actions effectuées...' },
        { id: 'observations', label: 'Observations', placeholder: 'Notez vos observations...' },
        { id: 'conclusion', label: 'Conclusion', placeholder: 'Résumez la conclusion de l\'intervention...' },
      ];
  
  // Récupérer les valeurs du narratif structuré
  const narratifData = formData.narratif_structure || {};
  
  const updateNarratifField = (fieldId, value) => {
    setFormData({
      ...formData,
      narratif_structure: {
        ...narratifData,
        [fieldId]: value
      }
    });
  };
  
  // Nettoyer la reconnaissance vocale au démontage du composant
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, []);
  
  const startDictation = (fieldId) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("La dictée vocale n'est pas supportée par votre navigateur. Utilisez Chrome ou Edge.");
      return;
    }
    
    // Arrêter et nettoyer toute reconnaissance en cours
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
    
    // Sauvegarder le texte actuel comme base
    baseTextRef.current = formData.narratif_structure?.[fieldId] || '';
    setInterimText('');
    
    // Petit délai pour s'assurer que l'ancienne instance est bien nettoyée
    setTimeout(() => {
      try {
        // Créer une nouvelle instance
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        
        recognition.lang = 'fr-CA';
        recognition.continuous = true;
        recognition.interimResults = true;
        
        setActiveField(fieldId);
        
        recognition.onstart = () => {
          setIsListening(true);
        };
        
        recognition.onend = () => {
          setIsListening(false);
          setActiveField(null);
          setInterimText('');
          recognitionRef.current = null;
        };
        
        recognition.onerror = (event) => {
          console.error('Erreur reconnaissance vocale:', event.error);
          setIsListening(false);
          setActiveField(null);
          setInterimText('');
          recognitionRef.current = null;
        };
        
        recognition.onresult = (event) => {
          let finalTranscript = '';
          let interimTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Afficher le texte intermédiaire en temps réel
          setInterimText(interimTranscript);
          
          // Quand un segment est finalisé, l'ajouter au texte de base
          if (finalTranscript) {
            const newBase = (baseTextRef.current + ' ' + finalTranscript).trim();
            baseTextRef.current = newBase;
            updateNarratifField(fieldId, newBase);
          }
        };
        
        recognition.start();
      } catch (error) {
        console.error('Erreur démarrage dictée:', error);
        setIsListening(false);
        setActiveField(null);
      }
    }, 100);
  };
  
  const stopDictation = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop(); // Utiliser stop() au lieu de abort() pour finaliser le dernier segment
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setActiveField(null);
    setInterimText('');
  };
  
  // Obtenir le texte affiché (texte de base + texte intermédiaire en cours)
  const getDisplayText = (fieldId) => {
    if (activeField === fieldId && interimText) {
      return (narratifData[fieldId] || '') + ' ' + interimText;
    }
    return narratifData[fieldId] || '';
  };

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          📝 Remplissez chaque section du rapport. Utilisez le bouton 🎤 pour dicter votre texte.
        </p>
      </div>
      
      {/* Champs structurés du template */}
      {template.map((field) => (
        <Card key={field.id}>
          <CardHeader className="bg-gray-50 py-3">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-medium">{field.label}</CardTitle>
              {editMode && (
                <Button
                  type="button"
                  variant={isListening && activeField === field.id ? "destructive" : "outline"}
                  size="sm"
                  onClick={() => isListening && activeField === field.id ? stopDictation() : startDictation(field.id)}
                >
                  {isListening && activeField === field.id ? '🛑 Stop' : '🎤'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            {isListening && activeField === field.id && (
              <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 flex items-center gap-2 text-sm">
                <span className="animate-pulse">🔴</span>
                <span className="text-red-800">Dictée en cours... {interimText && <span className="italic text-red-600">"{interimText}"</span>}</span>
              </div>
            )}
            <textarea
              value={getDisplayText(field.id)}
              onChange={(e) => updateNarratifField(field.id, e.target.value)}
              disabled={!editMode || (isListening && activeField === field.id)}
              placeholder={field.placeholder}
              className={`w-full border rounded-lg p-3 min-h-[100px] resize-y ${isListening && activeField === field.id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            />
          </CardContent>
        </Card>
      ))}
      
      {/* Notes additionnelles (libre) */}
      <Card>
        <CardHeader className="bg-gray-50 py-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base font-medium">📋 Notes additionnelles (optionnel)</CardTitle>
            {editMode && (
              <Button
                type="button"
                variant={isListening && activeField === 'notes' ? "destructive" : "outline"}
                size="sm"
                onClick={() => isListening && activeField === 'notes' ? stopDictation() : startDictation('notes')}
              >
                {isListening && activeField === 'notes' ? '🛑 Stop' : '🎤'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {isListening && activeField === 'notes' && (
            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 flex items-center gap-2 text-sm">
              <span className="animate-pulse">🔴</span>
              <span className="text-red-800">Dictée en cours... {interimText && <span className="italic text-red-600">"{interimText}"</span>}</span>
            </div>
          )}
          <textarea
            value={getDisplayText('notes')}
            onChange={(e) => updateNarratifField('notes', e.target.value)}
            disabled={!editMode || (isListening && activeField === 'notes')}
            placeholder="Ajoutez toute information supplémentaire..."
            className={`w-full border rounded-lg p-3 min-h-[80px] resize-y ${isListening && activeField === 'notes' ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionNarratif;
