import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import VoiceInputButton from '../../VoiceInputButton';

const Temoignages = ({ formData, setFormData, canEdit }) => {
  const addTestimony = () => {
    const newTestimony = {
      id: `testimony-${Date.now()}`,
      witness_name: '',
      witness_type: 'temoin',
      witness_phone: '',
      interview_datetime: new Date().toISOString(),
      testimony: ''
    };
    setFormData(prev => ({
      ...prev,
      testimonies: [...prev.testimonies, newTestimony]
    }));
  };

  const removeTestimony = (id) => {
    setFormData(prev => ({
      ...prev,
      testimonies: prev.testimonies.filter(t => t.id !== id)
    }));
  };

  const updateTestimony = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      testimonies: prev.testimonies.map(t =>
        t.id === id ? { ...t, [field]: value } : t
      )
    }));
  };

  const handleVoiceInput = (id, transcript) => {
    setFormData(prev => ({
      ...prev,
      testimonies: prev.testimonies.map(t =>
        t.id === id ? { ...t, testimony: t.testimony + (t.testimony ? ' ' : '') + transcript } : t
      )
    }));
  };

  const witnessTypes = [
    { value: 'proprietaire', label: 'Propriétaire' },
    { value: 'locataire', label: 'Locataire' },
    { value: 'temoin', label: 'Témoin oculaire' },
    { value: 'voisin', label: 'Voisin' },
    { value: 'employe', label: 'Employé/Gardien' },
    { value: 'autre', label: 'Autre' }
  ];

  return (
    <Card>
      <CardHeader style={{ backgroundColor: '#fef3c7', borderBottom: '2px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <CardTitle style={{ color: '#92400e', fontSize: '1.125rem', fontWeight: '700' }}>
            👥 3. Témoignages
          </CardTitle>
          {canEdit && (
            <Button
              onClick={addTestimony}
              size="sm"
              style={{ backgroundColor: '#10b981', color: 'white' }}
            >
              ➕ Ajouter un témoignage
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {formData.testimonies.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            border: '2px dashed #d1d5db'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👤</div>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Aucun témoignage enregistré</p>
            <p style={{ fontSize: '0.875rem' }}>Cliquez sur "Ajouter un témoignage" pour commencer</p>
          </div>
        ) : (
          formData.testimonies.map((testimony, index) => (
            <div
              key={testimony.id}
              style={{
                border: '2px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                backgroundColor: '#fffbeb',
                position: 'relative'
              }}
            >
              <div style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                display: 'flex',
                gap: '0.5rem'
              }}>
                <span style={{
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  Témoignage #{index + 1}
                </span>
                {canEdit && (
                  <Button
                    onClick={() => removeTestimony(testimony.id)}
                    size="sm"
                    variant="destructive"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    🗑️ Supprimer
                  </Button>
                )}
              </div>

              <div className="space-y-4 mt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nom du témoin</Label>
                    <Input
                      value={testimony.witness_name}
                      onChange={(e) => updateTestimony(testimony.id, 'witness_name', e.target.value)}
                      placeholder="Nom complet"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>Type de témoin</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2"
                      value={testimony.witness_type}
                      onChange={(e) => updateTestimony(testimony.id, 'witness_type', e.target.value)}
                      disabled={!canEdit}
                    >
                      {witnessTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Téléphone</Label>
                    <Input
                      value={testimony.witness_phone}
                      onChange={(e) => updateTestimony(testimony.id, 'witness_phone', e.target.value)}
                      placeholder="(123) 456-7890"
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>Date/heure de l'entrevue</Label>
                    <Input
                      type="datetime-local"
                      value={testimony.interview_datetime ? testimony.interview_datetime.substring(0, 16) : ''}
                      onChange={(e) => updateTestimony(testimony.id, 'interview_datetime', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <Label>Témoignage</Label>
                    {canEdit && (
                      <VoiceInputButton
                        onTranscript={(transcript) => handleVoiceInput(testimony.id, transcript)}
                        placeholder="Dicter le témoignage"
                      />
                    )}
                  </div>
                  <textarea
                    className="w-full border rounded-md p-3"
                    rows="5"
                    value={testimony.testimony}
                    onChange={(e) => updateTestimony(testimony.id, 'testimony', e.target.value)}
                    placeholder="Résumé du témoignage..."
                    disabled={!canEdit}
                    style={{ fontFamily: 'inherit', fontSize: '0.875rem', resize: 'vertical' }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default Temoignages;
