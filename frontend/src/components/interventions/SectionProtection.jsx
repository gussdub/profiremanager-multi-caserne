import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const SectionProtection = ({ formData, setFormData, editMode }) => {
  return (
    <div className="space-y-6">
      <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
        <p className="text-orange-800 font-medium">
          🚨 Ces données sont essentielles pour les statistiques du MSP et les campagnes de prévention
        </p>
      </div>

      {/* Avertisseur de fumée */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">🔔 Avertisseur de fumée</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Présence * <span className="text-red-500">(Obligatoire)</span>
              </label>
              <select
                value={formData.smoke_detector_presence || ''}
                onChange={(e) => setFormData({ ...formData, smoke_detector_presence: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.smoke_detector_presence ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
                <option value="unknown">Indéterminé</option>
              </select>
            </div>

            {formData.smoke_detector_presence === 'yes' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fonctionnement
                  </label>
                  <select
                    value={formData.smoke_detector_functional || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_functional: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="worked">A fonctionné</option>
                    <option value="not_worked">N'a pas fonctionné</option>
                    <option value="unknown">Indéterminé</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type d'avertisseur
                  </label>
                  <select
                    value={formData.smoke_detector_type || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_type: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="battery">À pile</option>
                    <option value="electric">Électrique</option>
                    <option value="central">Relié à une centrale</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Impact sur l'évacuation
                  </label>
                  <select
                    value={formData.smoke_detector_impact || ''}
                    onChange={(e) => setFormData({ ...formData, smoke_detector_impact: e.target.value })}
                    disabled={!editMode}
                    className="w-full border border-gray-300 rounded-lg p-2"
                  >
                    <option value="">-- Sélectionner --</option>
                    <option value="helped">A permis l'évacuation</option>
                    <option value="no_impact">N'a pas été un facteur</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gicleurs */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">💧 Système de gicleurs</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Présence
              </label>
              <select
                value={formData.sprinkler_present ? 'yes' : formData.sprinkler_present === false ? 'no' : ''}
                onChange={(e) => setFormData({ ...formData, sprinkler_present: e.target.value === 'yes' })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </div>

            {formData.sprinkler_present && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fonctionnement
                </label>
                <select
                  value={formData.sprinkler_functional ? 'yes' : formData.sprinkler_functional === false ? 'no' : ''}
                  onChange={(e) => setFormData({ ...formData, sprinkler_functional: e.target.value === 'yes' })}
                  disabled={!editMode}
                  className="w-full border border-gray-300 rounded-lg p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="yes">A fonctionné</option>
                  <option value="no">N'a pas fonctionné</option>
                </select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionProtection;
