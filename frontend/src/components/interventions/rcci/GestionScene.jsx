import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const GestionScene = ({ formData, setFormData, canEdit }) => {
  return (
    <Card>
      <CardHeader style={{ backgroundColor: '#e0e7ff', borderBottom: '2px solid #6366f1' }}>
        <CardTitle style={{ color: '#3730a3', fontSize: '1.125rem', fontWeight: '700' }}>
          🔒 4. Gestion de la scène
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {/* Sécurisation */}
        <div style={{
          border: '2px solid #c7d2fe',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          backgroundColor: '#eef2ff'
        }}>
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: '#4338ca' }}>
            🚧 Sécurisation de la scène
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Heure de sécurisation</Label>
              <Input
                type="time"
                value={formData.scene_secured_at || ''}
                onChange={(e) => setFormData({ ...formData, scene_secured_at: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Sécurisée par (nom officier)</Label>
              <Input
                value={formData.scene_secured_by || ''}
                onChange={(e) => setFormData({ ...formData, scene_secured_by: e.target.value })}
                placeholder="Nom de l'officier"
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>

        {/* Remise de la scène */}
        <div style={{
          border: '2px solid #c7d2fe',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          backgroundColor: '#eef2ff'
        }}>
          <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: '#4338ca' }}>
            👮 Remise de la scène à la police
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Remise à (nom enquêteur SQ/Police)</Label>
              <Input
                value={formData.scene_handed_to || ''}
                onChange={(e) => setFormData({ ...formData, scene_handed_to: e.target.value })}
                placeholder="Nom complet"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Matricule enquêteur</Label>
              <Input
                value={formData.investigator_badge || ''}
                onChange={(e) => setFormData({ ...formData, investigator_badge: e.target.value })}
                placeholder="#12345"
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <Label>N° événement police</Label>
              <Input
                value={formData.police_event_number || ''}
                onChange={(e) => setFormData({ ...formData, police_event_number: e.target.value })}
                placeholder="2024-123456"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Date/heure de remise</Label>
              <Input
                type="datetime-local"
                value={formData.handover_datetime || ''}
                onChange={(e) => setFormData({ ...formData, handover_datetime: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default GestionScene;
