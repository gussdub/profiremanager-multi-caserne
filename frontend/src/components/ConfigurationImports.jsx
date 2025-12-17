import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Save, RefreshCw } from 'lucide-react';
import { apiGet, apiPut } from '../utils/api';

const ConfigurationImports = ({ tenantSlug }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('epi');
  const [settings, setSettings] = useState(null);
  const [epiFields, setEpiFields] = useState([]);
  const [personnelFields, setPersonnelFields] = useState([]);
  const [rapportsFields, setRapportsFields] = useState([]);

  useEffect(() => {
    loadSettings();
  }, [tenantSlug]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, '/config/import-settings');
      if (!data) throw new Error('Erreur lors du chargement');

      const data = await response.json();
      setSettings(data);
      setEpiFields(data.epi_fields || []);
      setPersonnelFields(data.personnel_fields || []);
      setRapportsFields(data.rapports_fields || []);
    } catch (error) {
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRequired = (fieldType, fieldKey) => {
    if (fieldType === 'epi') {
      setEpiFields(prev => prev.map(field =>
        field.key === fieldKey ? { ...field, required: !field.required } : field
      ));
    } else if (fieldType === 'personnel') {
      setPersonnelFields(prev => prev.map(field =>
        field.key === fieldKey ? { ...field, required: !field.required } : field
      ));
    } else if (fieldType === 'rapports') {
      setRapportsFields(prev => prev.map(field =>
        field.key === fieldKey ? { ...field, required: !field.required } : field
      ));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiPut(tenantSlug, '/config/import-settings', {
        epi_fields: epiFields,
        personnel_fields: personnelFields,
        rapports_fields: rapportsFields
      });

      alert('Configuration sauvegardée avec succès !');
    } catch (error) {
      alert(`Erreur: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const renderFieldsList = (fields, fieldType) => {
    return (
      <div className="space-y-2">
        {fields.map((field) => (
          <div
            key={field.key}
            className="flex items-center justify-between p-3 border rounded hover:bg-gray-50"
          >
            <div>
              <Label className="font-medium">{field.label}</Label>
              <p className="text-xs text-gray-500 mt-1">Clé: {field.key}</p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Obligatoire</Label>
              <input
                type="checkbox"
                checked={field.required}
                onChange={() => handleToggleRequired(fieldType, field.key)}
                className="w-5 h-5 cursor-pointer"
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration des imports CSV</CardTitle>
          <CardDescription>
            Définissez quels champs sont obligatoires pour chaque type d'import
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b">
            <button
              onClick={() => setActiveTab('epi')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'epi'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              EPI
            </button>
            <button
              onClick={() => setActiveTab('personnel')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'personnel'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Personnel
            </button>
            <button
              onClick={() => setActiveTab('rapports')}
              className={`px-4 py-2 font-medium ${
                activeTab === 'rapports'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Rapports
            </button>
          </div>

          {/* Content */}
          <div className="mb-6">
            {activeTab === 'epi' && renderFieldsList(epiFields, 'epi')}
            {activeTab === 'personnel' && renderFieldsList(personnelFields, 'personnel')}
            {activeTab === 'rapports' && renderFieldsList(rapportsFields, 'rapports')}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={loadSettings}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <h4 className="font-semibold mb-2 text-blue-900">ℹ️ Information</h4>
          <p className="text-sm text-blue-800">
            Les champs marqués comme "obligatoires" devront être renseignés lors de l'import CSV.
            Si un champ obligatoire est manquant, l'import échouera avec un message d'erreur explicite.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfigurationImports;
