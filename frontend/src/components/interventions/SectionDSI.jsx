import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const SectionDSI = ({ formData, setFormData, editMode, referenceData }) => {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
        <p className="text-red-800 font-medium">
          🔥 Section obligatoire pour les incendies selon les standards MSP
        </p>
      </div>

      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg text-red-800">Détails de l'incendie</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cause probable * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.cause_id || ''}
                onChange={(e) => setFormData({ ...formData, cause_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.cause_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {referenceData.causes.map(cause => (
                  <option key={cause.id} value={cause.id}>
                    {cause.code} - {cause.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source de chaleur (Ignition) * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.source_heat_id || ''}
                onChange={(e) => setFormData({ ...formData, source_heat_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.source_heat_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {referenceData.sources_chaleur.map(source => (
                  <option key={source.id} value={source.id}>
                    {source.code} - {source.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Matériau premier enflammé * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.material_first_ignited_id || ''}
                onChange={(e) => setFormData({ ...formData, material_first_ignited_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.material_first_ignited_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.materiaux || []).map(mat => (
                  <option key={mat.id} value={mat.id}>
                    {mat.code} - {mat.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Objet/Pièce d'origine
              </label>
              <input
                type="text"
                value={formData.fire_origin_location || ''}
                onChange={(e) => setFormData({ ...formData, fire_origin_location: e.target.value })}
                disabled={!editMode}
                placeholder="ex: Cuisine, Chambre à coucher"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Propagation du feu
              </label>
              <select
                value={formData.fire_spread || ''}
                onChange={(e) => setFormData({ ...formData, fire_spread: e.target.value })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                <option value="object">Confiné à l'objet d'origine</option>
                <option value="room">Confiné à la pièce d'origine</option>
                <option value="floor">Propagé à l'étage</option>
                <option value="building">Propagé au bâtiment entier</option>
                <option value="neighbor">Propagé aux bâtiments voisins</option>
              </select>
            </div>
          </div>

          {/* Justification si cause indéterminée */}
          {formData.cause_id && referenceData.causes.find(c => c.id === formData.cause_id)?.libelle?.toLowerCase().includes('indéterminée') && (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <label className="block text-sm font-medium text-yellow-800 mb-1">
                ⚠️ Justification requise (cause indéterminée)
              </label>
              <textarea
                value={formData.cause_indeterminee_justification || ''}
                onChange={(e) => setFormData({ ...formData, cause_indeterminee_justification: e.target.value })}
                disabled={!editMode}
                placeholder="Expliquez pourquoi la cause n'a pu être déterminée..."
                className="w-full border border-yellow-300 rounded-lg p-2 min-h-[80px]"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionDSI;
