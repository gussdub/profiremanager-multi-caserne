import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Input } from '../ui/input';

const SectionPertes = ({ formData, setFormData, editMode }) => {
  // Helper pour gérer les inputs numériques (permet d'effacer le 0)
  const handleNumberChange = (field, value) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setFormData({ ...formData, [field]: numValue });
  };
  
  const getNumberValue = (value) => {
    return value === '' || value === null || value === undefined ? '' : value;
  };

  return (
    <div className="space-y-6">
      {/* Pertes matérielles */}
      <Card>
        <CardHeader className="bg-yellow-50">
          <CardTitle className="text-lg text-yellow-800">💰 Pertes matérielles</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dommages au bâtiment ($)
              </label>
              <input
                type="number"
                value={getNumberValue(formData.estimated_loss_building)}
                onChange={(e) => handleNumberChange('estimated_loss_building', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dommages au contenu ($)
              </label>
              <input
                type="number"
                value={getNumberValue(formData.estimated_loss_content)}
                onChange={(e) => handleNumberChange('estimated_loss_content', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div className="md:col-span-2 bg-gray-50 p-3 rounded-lg">
              <p className="text-lg font-bold text-gray-800">
                Total des pertes: {((parseFloat(formData.estimated_loss_building) || 0) + (parseFloat(formData.estimated_loss_content) || 0)).toLocaleString('fr-CA')} $
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Évacuation */}
      <Card>
        <CardHeader className="bg-yellow-50">
          <CardTitle className="text-lg text-yellow-800">🚪 Évacuation</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de personnes évacuées
              </label>
              <input
                type="number"
                value={getNumberValue(formData.evacuated_count)}
                onChange={(e) => handleNumberChange('evacuated_count', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 mt-6">
                <input
                  type="checkbox"
                  checked={formData.red_cross_involved || false}
                  onChange={(e) => setFormData({ ...formData, red_cross_involved: e.target.checked })}
                  disabled={!editMode}
                  className="w-5 h-5"
                />
                <span>Prise en charge par la Croix-Rouge</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Victimes */}
      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg text-red-800">🚑 Victimes</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="col-span-2 md:col-span-3">
              <p className="font-medium text-gray-700 mb-2">Civils</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés légers</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_injuries_minor)}
                onChange={(e) => handleNumberChange('civilian_injuries_minor', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_injuries_major)}
                onChange={(e) => handleNumberChange('civilian_injuries_major', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={getNumberValue(formData.civilian_deaths)}
                onChange={(e) => handleNumberChange('civilian_deaths', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2 bg-red-50"
              />
            </div>

            <div className="col-span-2 md:col-span-3 mt-4">
              <p className="font-medium text-gray-700 mb-2">Pompiers</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés légers</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_injuries_minor)}
                onChange={(e) => handleNumberChange('firefighter_injuries_minor', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Blessés graves</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_injuries_major)}
                onChange={(e) => handleNumberChange('firefighter_injuries_major', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Décès</label>
              <input
                type="number"
                value={getNumberValue(formData.firefighter_deaths)}
                onChange={(e) => handleNumberChange('firefighter_deaths', e.target.value)}
                disabled={!editMode}
                placeholder="0"
                min="0"
                className="w-full border border-gray-300 rounded-lg p-2 bg-red-50"
              />
            </div>
          </div>

          {(parseFloat(formData.civilian_deaths) > 0 || parseFloat(formData.firefighter_deaths) > 0) && (
            <div className="mt-4 bg-red-100 p-4 rounded-lg border border-red-300">
              <p className="text-red-800 font-medium">
                ⚠️ En cas de décès, le rapport sera transmis à la SQ/Coroner pour enquête.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionPertes;
