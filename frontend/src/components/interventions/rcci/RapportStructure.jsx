import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Label } from '../../ui/label';
import VoiceInputButton from '../../VoiceInputButton';

const RapportStructure = ({ formData, setFormData, canEdit }) => {
  const handleVoiceInput = (step, transcript) => {
    setFormData(prev => ({
      ...prev,
      [step]: prev[step] + (prev[step] ? ' ' : '') + transcript
    }));
  };

  const steps = [
    {
      key: 'structured_narrative_step1',
      title: 'Étape 1 : Découverte de l\'incendie',
      icon: '🔔',
      questions: [
        'Qui a découvert le feu ?',
        'Quand (date/heure précise) ?',
        'Comment (fumée, flamme, alarme) ?'
      ]
    },
    {
      key: 'structured_narrative_step2',
      title: 'Étape 2 : Observations à l\'arrivée',
      icon: '👁️',
      questions: [
        'État du bâtiment',
        'Localisation des flammes/fumée',
        'Progression du feu'
      ]
    },
    {
      key: 'structured_narrative_step3',
      title: 'Étape 3 : Démarche d\'enquête',
      icon: '🔬',
      questions: [
        'Zone d\'origine identifiée',
        'Méthode utilisée (inspection visuelle, entrevues, tests)',
        'Éléments probants'
      ]
    },
    {
      key: 'structured_narrative_step4',
      title: 'Étape 4 : Conclusion',
      icon: '✅',
      questions: [
        'Cause déterminée / probable / indéterminée',
        'Recommandations'
      ]
    }
  ];

  return (
    <Card>
      <CardHeader style={{ backgroundColor: '#dbeafe', borderBottom: '2px solid #3b82f6' }}>
        <CardTitle style={{ color: '#1e40af', fontSize: '1.125rem', fontWeight: '700' }}>
          📝 2. Rapport structuré d'enquête
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div style={{
          padding: '1rem',
          backgroundColor: '#f0f9ff',
          border: '1px solid #3b82f6',
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem', fontWeight: '600' }}>
            📘 Guide de rédaction
          </p>
          <p style={{ fontSize: '0.875rem', color: '#1e3a8a' }}>
            Remplissez chaque étape pour structurer votre rapport selon les normes NFPA 921.
            Utilisez le bouton 🎤 pour dicter votre texte.
          </p>
        </div>

        {steps.map((step, index) => (
          <div
            key={step.key}
            style={{
              border: '2px solid #e5e7eb',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              backgroundColor: '#fafafa'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#374151' }}>
                {step.icon} {step.title}
              </h3>
              <VoiceInputButton
                onTranscript={(transcript) => handleVoiceInput(step.key, transcript)}
                placeholder="Dicter cette section"
              />
            </div>

            <div style={{
              backgroundColor: '#fef3c7',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              <strong style={{ color: '#92400e' }}>Points à aborder :</strong>
              <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem', color: '#92400e' }}>
                {step.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>

            <textarea
              className="w-full border rounded-md p-3"
              rows="6"
              value={formData[step.key]}
              onChange={(e) => setFormData({ ...formData, [step.key]: e.target.value })}
              placeholder={`Décrivez ${step.title.toLowerCase()}...`}
              disabled={!canEdit}
              style={{
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                resize: 'vertical'
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default RapportStructure;
