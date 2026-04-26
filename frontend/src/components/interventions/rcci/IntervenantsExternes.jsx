import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

const IntervenantsExternes = ({ formData, setFormData, canEdit }) => {
  return (
    <Card>
      <CardHeader style={{ backgroundColor: '#e0f2fe', borderBottom: '2px solid #0ea5e9' }}>
        <CardTitle style={{ color: '#075985', fontSize: '1.125rem', fontWeight: '700' }}>
          🚧 6. Intervenants externes & Utilités
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {/* Hydro-Québec */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.hydro_quebec_intervention}
              onChange={(e) => setFormData({ ...formData, hydro_quebec_intervention: e.target.checked })}
              disabled={!canEdit}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>⚡ Hydro-Québec (délestage)</span>
          </label>
          {formData.hydro_quebec_intervention && (
            <div>
              <Label>Heure d'intervention</Label>
              <Input
                type="time"
                value={formData.hydro_quebec_time || ''}
                onChange={(e) => setFormData({ ...formData, hydro_quebec_time: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        {/* Énergir */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.energir_intervention}
              onChange={(e) => setFormData({ ...formData, energir_intervention: e.target.checked })}
              disabled={!canEdit}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>🔥 Énergir / Gaz (fermeture)</span>
          </label>
          {formData.energir_intervention && (
            <div>
              <Label>Heure d'intervention</Label>
              <Input
                type="time"
                value={formData.energir_time || ''}
                onChange={(e) => setFormData({ ...formData, energir_time: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        {/* Croix-Rouge */}
        <label className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50">
          <input
            type="checkbox"
            checked={formData.croix_rouge_intervention}
            onChange={(e) => setFormData({ ...formData, croix_rouge_intervention: e.target.checked })}
            disabled={!canEdit}
          />
          <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>❤️ Croix-Rouge</span>
        </label>

        {/* Inspecteur municipal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.municipal_inspector}
              onChange={(e) => setFormData({ ...formData, municipal_inspector: e.target.checked })}
              disabled={!canEdit}
            />
            <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>🏗️ Inspecteur municipal</span>
          </label>
          {formData.municipal_inspector && (
            <div>
              <Label>Nom de l'inspecteur</Label>
              <Input
                value={formData.municipal_inspector_name || ''}
                onChange={(e) => setFormData({ ...formData, municipal_inspector_name: e.target.value })}
                placeholder="Nom complet"
                disabled={!canEdit}
              />
            </div>
          )}
        </div>

        {/* Sécurité civile */}
        <label className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50">
          <input
            type="checkbox"
            checked={formData.civil_security}
            onChange={(e) => setFormData({ ...formData, civil_security: e.target.checked })}
            disabled={!canEdit}
          />
          <span style={{ fontSize: '0.875rem', fontWeight: '600' }}>🛡️ Sécurité civile</span>
        </label>

        {/* Autres */}
        <div>
          <Label>Autres intervenants (texte libre)</Label>
          <textarea
            className="w-full border rounded-md p-3"
            rows="3"
            value={formData.other_intervenants || ''}
            onChange={(e) => setFormData({ ...formData, other_intervenants: e.target.value })}
            placeholder="Ex: CSSS, Services sociaux, etc."
            disabled={!canEdit}
            style={{ fontFamily: 'inherit', fontSize: '0.875rem', resize: 'vertical' }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default IntervenantsExternes;
