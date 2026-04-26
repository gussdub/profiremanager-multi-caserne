import React, { useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const RegistrePreuves = ({ formData, setFormData, canEdit, intervention, tenantSlug, getToken, toast }) => {
  const fileInputRefs = useRef({});

  const addEvidence = () => {
    const newEvidence = {
      id: `evidence-${Date.now()}`,
      description: '',
      location: '',
      seized_datetime: new Date().toISOString(),
      seized_by: '',
      photo_blob_name: null,
      handed_to_police: false,
      police_investigator_name: '',
      handover_date: null
    };
    setFormData(prev => ({
      ...prev,
      evidence_registry: [...prev.evidence_registry, newEvidence]
    }));
  };

  const removeEvidence = (id) => {
    setFormData(prev => ({
      ...prev,
      evidence_registry: prev.evidence_registry.filter(e => e.id !== id)
    }));
  };

  const updateEvidence = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      evidence_registry: prev.evidence_registry.map(e =>
        e.id === id ? { ...e, [field]: value } : e
      )
    }));
  };

  const handlePhotoUpload = async (evidenceId, file) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64 = e.target.result.split(',')[1];
        
        // Upload photo
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/interventions/${intervention.id}/rcci/photos`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${getToken()}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              photo_base64: base64,
              description: `Preuve - ${evidenceId}`,
              latitude: null,
              longitude: null
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          updateEvidence(evidenceId, 'photo_blob_name', data.blob_name);
          toast({
            title: "✅ Photo uploadée",
            description: "Photo de la preuve enregistrée"
          });
        } else {
          throw new Error('Erreur upload');
        }
      } catch (error) {
        console.error('Erreur upload photo:', error);
        toast({
          title: "Erreur",
          description: "Impossible d'uploader la photo",
          variant: "destructive"
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader style={{ backgroundColor: '#fce7f3', borderBottom: '2px solid #ec4899' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <CardTitle style={{ color: '#831843', fontSize: '1.125rem', fontWeight: '700' }}>
            📦 5. Registre des preuves saisies
          </CardTitle>
          {canEdit && (
            <Button
              onClick={addEvidence}
              size="sm"
              style={{ backgroundColor: '#10b981', color: 'white' }}
            >
              ➕ Ajouter une preuve
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {formData.evidence_registry.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: '#6b7280',
            backgroundColor: '#f9fafb',
            borderRadius: '0.5rem',
            border: '2px dashed #d1d5db'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
            <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Aucune preuve saisie</p>
            <p style={{ fontSize: '0.875rem' }}>Cliquez sur "Ajouter une preuve" pour commencer</p>
          </div>
        ) : (
          formData.evidence_registry.map((evidence, index) => (
            <div
              key={evidence.id}
              style={{
                border: '2px solid #ec4899',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                backgroundColor: '#fdf2f8',
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
                  backgroundColor: '#ec4899',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: '600'
                }}>
                  Preuve #{index + 1}
                </span>
                {canEdit && (
                  <Button
                    onClick={() => removeEvidence(evidence.id)}
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
                    <Label>Description de l'élément saisi</Label>
                    <Input
                      value={evidence.description}
                      onChange={(e) => updateEvidence(evidence.id, 'description', e.target.value)}
                      placeholder="Ex: Bidon d'accélérant, briquet..."
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>Emplacement précis</Label>
                    <Input
                      value={evidence.location}
                      onChange={(e) => updateEvidence(evidence.id, 'location', e.target.value)}
                      placeholder="Ex: Cuisine, près du comptoir"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Date/heure de saisie</Label>
                    <Input
                      type="datetime-local"
                      value={evidence.seized_datetime ? evidence.seized_datetime.substring(0, 16) : ''}
                      onChange={(e) => updateEvidence(evidence.id, 'seized_datetime', e.target.value ? new Date(e.target.value).toISOString() : null)}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <Label>Saisi par (officier)</Label>
                    <Input
                      value={evidence.seized_by}
                      onChange={(e) => updateEvidence(evidence.id, 'seized_by', e.target.value)}
                      placeholder="Nom de l'officier"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                {/* Photo */}
                <div>
                  <Label>Photo de la preuve</Label>
                  {canEdit && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="file"
                        accept="image/*"
                        ref={(el) => fileInputRefs.current[evidence.id] = el}
                        style={{ display: 'none' }}
                        onChange={(e) => handlePhotoUpload(evidence.id, e.target.files[0])}
                      />
                      <Button
                        onClick={() => fileInputRefs.current[evidence.id]?.click()}
                        size="sm"
                        variant="outline"
                      >
                        📷 {evidence.photo_blob_name ? 'Changer photo' : 'Ajouter photo'}
                      </Button>
                    </div>
                  )}
                  {evidence.photo_blob_name && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#059669' }}>
                      ✅ Photo enregistrée
                    </div>
                  )}
                </div>

                {/* Remise police */}
                <div style={{
                  borderTop: '1px solid #f9a8d4',
                  paddingTop: '1rem',
                  marginTop: '1rem'
                }}>
                  <label className="flex items-center space-x-2 mb-4">
                    <input
                      type="checkbox"
                      checked={evidence.handed_to_police}
                      onChange={(e) => updateEvidence(evidence.id, 'handed_to_police', e.target.checked)}
                      disabled={!canEdit}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>Remise à la police</span>
                  </label>

                  {evidence.handed_to_police && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Nom enquêteur police</Label>
                        <Input
                          value={evidence.police_investigator_name || ''}
                          onChange={(e) => updateEvidence(evidence.id, 'police_investigator_name', e.target.value)}
                          placeholder="Nom complet"
                          disabled={!canEdit}
                        />
                      </div>
                      <div>
                        <Label>Date de remise</Label>
                        <Input
                          type="date"
                          value={evidence.handover_date ? evidence.handover_date.split('T')[0] : ''}
                          onChange={(e) => updateEvidence(evidence.id, 'handover_date', e.target.value ? new Date(e.target.value).toISOString() : null)}
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default RegistrePreuves;
