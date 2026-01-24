import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionDSI = ({ formData, setFormData, editMode, referenceData, tenantSlug, vehicles, resources }) => {
  const [municipalites, setMunicipalites] = useState([]);
  const [searchMunicip, setSearchMunicip] = useState('');
  const [showMunicipDropdown, setShowMunicipDropdown] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  
  const getToken = () => {
    return localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');
  };

  // Calcul automatique des ressources
  const totalPompiers = (resources?.length || 0) + (formData.manual_personnel?.length || 0);
  const totalVehicules = (vehicles?.length || 0) + (formData.manual_vehicles?.length || 0);
  
  // Calcul automatique des pertes totales
  const totalPertes = (parseFloat(formData.estimated_loss_building) || 0) + 
                      (parseFloat(formData.estimated_loss_content) || 0);

  // Recherche de municipalités
  useEffect(() => {
    if (searchMunicip.length >= 2) {
      const fetchMunicip = async () => {
        try {
          const response = await fetch(
            `${BACKEND_URL}/api/dsi/references/municipalites?search=${encodeURIComponent(searchMunicip)}&limit=10`
          );
          if (response.ok) {
            const data = await response.json();
            setMunicipalites(data);
            setShowMunicipDropdown(true);
          }
        } catch (error) {
          console.error('Erreur recherche municipalités:', error);
        }
      };
      fetchMunicip();
    } else {
      setMunicipalites([]);
      setShowMunicipDropdown(false);
    }
  }, [searchMunicip]);

  // Sélectionner une municipalité
  const selectMunicipalite = (mun) => {
    setFormData({
      ...formData,
      municipalite_code: mun.code_mamh,
      municipalite_nom: mun.nom,
      municipalite_mrc: mun.mrc
    });
    setSearchMunicip(`${mun.code_mamh} - ${mun.nom}`);
    setShowMunicipDropdown(false);
  };

  // Vérifier si c'est un vrai incendie (requiert DSI complet)
  const isRealFire = () => {
    const nature = referenceData.natures?.find(n => n.id === formData.nature_code || n.code === formData.nature_code);
    return nature?.requiert_dsi === true || nature?.categorie === 'incendie';
  };

  // Validation DSI
  const validateDSI = async () => {
    setLoadingValidation(true);
    try {
      // Validation locale simple
      const errors = [];
      const warnings = [];
      
      if (!formData.municipalite_code) {
        errors.push({ section: 'Identification', champ: 'municipalite_code', message: 'Code municipalité MAMH obligatoire' });
      }
      
      if (isRealFire()) {
        if (!formData.cause_id) errors.push({ section: 'Analyse', champ: 'cause_id', message: 'Cause probable obligatoire' });
        if (!formData.source_heat_id) errors.push({ section: 'Analyse', champ: 'source_heat_id', message: 'Source de chaleur obligatoire' });
        if (!formData.facteur_allumage_id) errors.push({ section: 'Analyse', champ: 'facteur_allumage_id', message: 'Facteur d\'allumage obligatoire' });
        if (!formData.material_first_ignited_id) errors.push({ section: 'Analyse', champ: 'material_first_ignited_id', message: 'Matériau premier enflammé obligatoire' });
        if (!formData.usage_batiment_code) errors.push({ section: 'Localisation', champ: 'usage_batiment_code', message: 'Usage du bâtiment (CNB) obligatoire' });
        
        if (formData.estimated_loss_building === null || formData.estimated_loss_building === undefined) {
          errors.push({ section: 'Dommages', champ: 'estimated_loss_building', message: 'Estimation dommages bâtiment obligatoire' });
        }
        
        // Vérifier justification si cause indéterminée
        const cause = referenceData.causes?.find(c => c.id === formData.cause_id);
        if (cause?.libelle?.toLowerCase().includes('indéterminée') && !formData.cause_indeterminee_justification) {
          errors.push({ section: 'Analyse', champ: 'cause_indeterminee_justification', message: 'Justification requise si cause indéterminée' });
        }
      }
      
      if (formData.civilian_deaths === null || formData.civilian_deaths === undefined) {
        errors.push({ section: 'Victimes', champ: 'civilian_deaths', message: 'Nombre de décès civils obligatoire (0 si aucun)' });
      }
      if (formData.firefighter_deaths === null || formData.firefighter_deaths === undefined) {
        errors.push({ section: 'Victimes', champ: 'firefighter_deaths', message: 'Nombre de décès pompiers obligatoire (0 si aucun)' });
      }
      
      if (totalPompiers === 0) {
        errors.push({ section: 'Ressources', champ: 'personnel', message: 'Au moins un pompier doit être assigné' });
      }
      
      setValidationResult({ valid: errors.length === 0, errors, warnings });
    } catch (error) {
      console.error('Erreur validation:', error);
    } finally {
      setLoadingValidation(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Bannière info */}
      <div className="bg-red-50 p-4 rounded-lg border border-red-200">
        <p className="text-red-800 font-medium">
          🔥 Section obligatoire pour les incendies selon les standards MSP/DSI
        </p>
        {isRealFire() && (
          <p className="text-red-600 text-sm mt-1">
            Cette intervention est classée comme incendie - tous les champs marqués * sont obligatoires
          </p>
        )}
      </div>

      {/* Résumé automatique des ressources */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-blue-800">📊 Résumé des ressources (calculé automatiquement)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-3xl font-bold text-blue-600">{totalPompiers}</div>
              <div className="text-sm text-gray-600">Pompiers</div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-3xl font-bold text-blue-600">{totalVehicules}</div>
              <div className="text-sm text-gray-600">Véhicules</div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-3xl font-bold text-green-600">{totalPertes.toLocaleString('fr-CA')} $</div>
              <div className="text-sm text-gray-600">Pertes totales</div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-3xl font-bold text-orange-600">
                {(parseInt(formData.civilian_deaths || 0) + parseInt(formData.firefighter_deaths || 0))}
              </div>
              <div className="text-sm text-gray-600">Décès</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Code Municipalité MAMH */}
      <Card>
        <CardHeader className="bg-purple-50">
          <CardTitle className="text-lg text-purple-800">📍 Code Municipalité MAMH *</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rechercher une municipalité (par nom ou code)
            </label>
            <input
              type="text"
              value={formData.municipalite_code ? `${formData.municipalite_code} - ${formData.municipalite_nom || ''}` : searchMunicip}
              onChange={(e) => {
                setSearchMunicip(e.target.value);
                if (formData.municipalite_code) {
                  setFormData({ ...formData, municipalite_code: null, municipalite_nom: null });
                }
              }}
              disabled={!editMode}
              placeholder="Ex: Granby, 47017..."
              className={`w-full border rounded-lg p-2 ${!formData.municipalite_code && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
            />
            {showMunicipDropdown && municipalites.length > 0 && (
              <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg mt-1 max-h-60 overflow-auto">
                {municipalites.map(mun => (
                  <div
                    key={mun.code_mamh}
                    onClick={() => selectMunicipalite(mun)}
                    className="p-2 hover:bg-blue-50 cursor-pointer border-b"
                  >
                    <span className="font-medium">{mun.code_mamh}</span> - {mun.nom}
                    <span className="text-gray-500 text-sm ml-2">({mun.mrc || mun.region_administrative})</span>
                  </div>
                ))}
              </div>
            )}
            {formData.municipalite_code && (
              <p className="text-sm text-green-600 mt-1">
                ✓ Municipalité sélectionnée: {formData.municipalite_nom} (MRC: {formData.municipalite_mrc || 'N/A'})
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analyse de l'incendie */}
      <Card>
        <CardHeader className="bg-red-50">
          <CardTitle className="text-lg text-red-800">🔥 Analyse de l&apos;incendie</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cause probable */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cause probable {isRealFire() && <span className="text-red-500">*</span>}
              </label>
              <select
                value={formData.cause_id || ''}
                onChange={(e) => setFormData({ ...formData, cause_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.cause_id && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.causes || []).map(cause => (
                  <option key={cause.id} value={cause.id}>
                    {cause.code} - {cause.libelle}
                  </option>
                ))}
              </select>
            </div>

            {/* Source de chaleur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source de chaleur (Ignition) {isRealFire() && <span className="text-red-500">*</span>}
              </label>
              <select
                value={formData.source_heat_id || ''}
                onChange={(e) => setFormData({ ...formData, source_heat_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.source_heat_id && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.sources_chaleur || []).map(source => (
                  <option key={source.id} value={source.id}>
                    {source.code} - {source.libelle} {source.groupe && `(${source.groupe})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Facteur d'allumage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Facteur d&apos;allumage {isRealFire() && <span className="text-red-500">*</span>}
              </label>
              <select
                value={formData.facteur_allumage_id || ''}
                onChange={(e) => setFormData({ ...formData, facteur_allumage_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.facteur_allumage_id && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.facteurs_allumage || []).map(facteur => (
                  <option key={facteur.id} value={facteur.id}>
                    {facteur.code} - {facteur.libelle}
                  </option>
                ))}
              </select>
            </div>

            {/* Matériau premier enflammé */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Matériau premier enflammé {isRealFire() && <span className="text-red-500">*</span>}
              </label>
              <select
                value={formData.material_first_ignited_id || ''}
                onChange={(e) => setFormData({ ...formData, material_first_ignited_id: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.material_first_ignited_id && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.materiaux || []).map(mat => (
                  <option key={mat.id} value={mat.id}>
                    {mat.code} - {mat.libelle}
                  </option>
                ))}
              </select>
            </div>

            {/* Usage du bâtiment CNB */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Usage du bâtiment (CNB) {isRealFire() && <span className="text-red-500">*</span>}
              </label>
              <select
                value={formData.usage_batiment_code || ''}
                onChange={(e) => setFormData({ ...formData, usage_batiment_code: e.target.value })}
                disabled={!editMode}
                className={`w-full border rounded-lg p-2 ${!formData.usage_batiment_code && isRealFire() ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.usages_batiment || []).map(usage => (
                  <option key={usage.id} value={usage.id}>
                    {usage.code} - {usage.libelle}
                  </option>
                ))}
              </select>
            </div>

            {/* Lieu d'origine */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Objet/Pièce d&apos;origine
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

            {/* Propagation */}
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
                <option value="object">Confiné à l&apos;objet d&apos;origine</option>
                <option value="room">Confiné à la pièce d&apos;origine</option>
                <option value="floor">Propagé à l&apos;étage</option>
                <option value="building">Propagé au bâtiment entier</option>
                <option value="neighbor">Propagé aux bâtiments voisins</option>
              </select>
            </div>
          </div>

          {/* Justification si cause indéterminée */}
          {formData.cause_id && referenceData.causes?.find(c => c.id === formData.cause_id)?.libelle?.toLowerCase().includes('indéterminée') && (
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

      {/* Section Validation DSI */}
      <Card>
        <CardHeader className="bg-green-50">
          <CardTitle className="text-lg text-green-800">✅ Validation DSI</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 mb-4">
            <Button 
              onClick={validateDSI} 
              disabled={loadingValidation}
              variant="outline"
              className="bg-green-100 hover:bg-green-200"
            >
              {loadingValidation ? '⏳ Validation...' : '🔍 Vérifier la conformité DSI'}
            </Button>
            
            {validationResult && (
              <span className={`font-bold ${validationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                {validationResult.valid ? '✅ Conforme' : `❌ ${validationResult.errors.length} erreur(s)`}
              </span>
            )}
          </div>
          
          {validationResult && !validationResult.valid && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-200">
              <p className="font-bold text-red-800 mb-2">Erreurs à corriger avant signature :</p>
              <ul className="list-disc list-inside space-y-1">
                {validationResult.errors.map((err, idx) => (
                  <li key={idx} className="text-red-700 text-sm">
                    <span className="font-medium">[{err.section}]</span> {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {validationResult?.warnings?.length > 0 && (
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mt-3">
              <p className="font-bold text-yellow-800 mb-2">Avertissements :</p>
              <ul className="list-disc list-inside space-y-1">
                {validationResult.warnings.map((warn, idx) => (
                  <li key={idx} className="text-yellow-700 text-sm">
                    <span className="font-medium">[{warn.section}]</span> {warn.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionDSI;
