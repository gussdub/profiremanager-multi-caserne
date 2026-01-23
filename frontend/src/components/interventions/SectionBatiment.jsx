/**
 * SectionBatiment - Composant pour l'onglet Bâtiment dans le module Interventions
 * 
 * Affiche les informations du bâtiment et l'intégration avec le module Prévention
 */

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const SectionBatiment = ({ formData, setFormData, editMode, referenceData, tenantSlug, getToken }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [preventionBatiment, setPreventionBatiment] = useState(null);
  const [loadingPrevention, setLoadingPrevention] = useState(false);
  const [modulePreventionActif, setModulePreventionActif] = useState(null); // null = en cours de chargement

  const API_URL = process.env.REACT_APP_BACKEND_URL;

  // Vérifier si le module prévention est activé pour ce tenant
  useEffect(() => {
    const checkModulePrevention = async () => {
      try {
        const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
        const response = await fetch(
          `${API_URL}/api/${tenantSlug}/tenant-info`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setModulePreventionActif(data?.parametres?.module_prevention_active || false);
        } else {
          setModulePreventionActif(false);
        }
      } catch (error) {
        console.error('Erreur vérification module prévention:', error);
        setModulePreventionActif(false);
      }
    };
    checkModulePrevention();
  }, [tenantSlug, getToken, API_URL]);

  // Charger les détails du bâtiment si lié au module prévention
  useEffect(() => {
    const loadPreventionBatiment = async () => {
      if (!formData.batiment_prevention_id || !modulePreventionActif) {
        setPreventionBatiment(null);
        return;
      }

      setLoadingPrevention(true);
      try {
        const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
        const response = await fetch(
          `${API_URL}/api/${tenantSlug}/prevention/batiments/${formData.batiment_prevention_id}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setPreventionBatiment(data);
        }
      } catch (error) {
        console.error('Erreur chargement bâtiment prévention:', error);
      } finally {
        setLoadingPrevention(false);
      }
    };
    
    if (modulePreventionActif !== null) {
      loadPreventionBatiment();
    }
  }, [formData.batiment_prevention_id, modulePreventionActif, tenantSlug, getToken, API_URL]);

  // Rechercher les bâtiments dans Prévention
  const handleSearch = async (query) => {
    if (!query || query.length < 2 || !modulePreventionActif) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
      const response = await fetch(
        `${API_URL}/api/${tenantSlug}/prevention/batiments/search?q=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Erreur recherche bâtiments:', error);
    } finally {
      setSearching(false);
    }
  };

  // Appliquer les données du bâtiment sélectionné
  const handleSelectBatiment = (batiment) => {
    setSelectedBatiment(batiment);
    setPreventionBatiment(batiment);
    setShowResults(false);
    setSearchQuery(batiment.adresse_civique || batiment.nom_etablissement || '');
    
    // Mapper les données de Prévention vers le formulaire d'intervention
    setFormData(prev => ({
      ...prev,
      // Infos bâtiment
      batiment_prevention_id: batiment.id,
      building_name: batiment.nom_etablissement || '',
      building_floors: parseInt(batiment.nombre_etages) || prev.building_floors,
      building_year: parseInt(batiment.annee_construction) || prev.building_year,
      building_area: batiment.superficie_totale_m2 || '',
      building_category_code: batiment.groupe_occupation || prev.building_category_code,
      // Propriétaire
      owner_name: batiment.proprietaire_nom || '',
      owner_phone: batiment.proprietaire_telephone || '',
      // Risques identifiés
      building_risks: batiment.risques_identifies || [],
      risk_level: batiment.niveau_risque || '',
      // Géolocalisation
      latitude: batiment.latitude || prev.latitude,
      longitude: batiment.longitude || prev.longitude
    }));
  };

  // Si le module prévention n'est pas activé
  if (modulePreventionActif === false) {
    return (
      <div className="space-y-6">
        <Card className="border-gray-200 bg-gray-50">
          <CardHeader>
            <CardTitle className="text-lg text-gray-600 flex items-center gap-2">
              🏠 Module Prévention non disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500">
              Le module Prévention n'est pas activé pour votre caserne. 
              Contactez un administrateur pour activer ce module et accéder aux informations détaillées des bâtiments.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Chargement en cours
  if (modulePreventionActif === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-orange-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recherche bâtiment dans Prévention */}
      {editMode && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-blue-800 flex items-center gap-2">
              🔍 Rechercher un bâtiment existant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Recherchez un bâtiment dans le module Prévention pour auto-remplir les informations.
            </p>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                placeholder="Entrez une adresse ou nom d'établissement..."
                className="w-full border border-blue-300 rounded-lg p-2 pr-10"
              />
              {searching && (
                <div className="absolute right-3 top-2.5">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
                </div>
              )}
              
              {/* Résultats de recherche */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchResults.map(bat => (
                    <div
                      key={bat.id}
                      onClick={() => handleSelectBatiment(bat)}
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">
                        {bat.nom_etablissement || bat.adresse_civique}
                      </div>
                      <div className="text-sm text-gray-600">
                        {bat.adresse_civique}, {bat.ville}
                      </div>
                      <div className="flex gap-2 mt-1">
                        {bat.groupe_occupation && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            Groupe {bat.groupe_occupation}
                          </span>
                        )}
                        {bat.niveau_risque && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            bat.niveau_risque === 'Élevé' || bat.niveau_risque === 'Très élevé' 
                              ? 'bg-red-100 text-red-700' 
                              : bat.niveau_risque === 'Moyen' 
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                          }`}>
                            Risque {bat.niveau_risque}
                          </span>
                        )}
                        {bat.nombre_etages && (
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {bat.nombre_etages} étages
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {showResults && searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-gray-500 text-sm">
                  Aucun bâtiment trouvé dans le module Prévention
                </div>
              )}
            </div>
            
            {selectedBatiment && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-800">
                  <span>✅</span>
                  <span className="font-medium">Bâtiment lié : {selectedBatiment.nom_etablissement || selectedBatiment.adresse_civique}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Infos du module Prévention (si bâtiment lié) */}
      {(preventionBatiment || formData.batiment_prevention_id) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
              📋 Informations du module Prévention
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPrevention ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-orange-500 rounded-full border-t-transparent"></div>
              </div>
            ) : preventionBatiment ? (
              <div className="space-y-4">
                {/* Photo du bâtiment */}
                {preventionBatiment.photo_url && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">📷 Photo du bâtiment</h4>
                    <img 
                      src={preventionBatiment.photo_url} 
                      alt="Photo du bâtiment" 
                      className="max-w-md rounded-lg border shadow-sm"
                    />
                  </div>
                )}

                {/* Coordonnées / Localisation */}
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">📍 Coordonnées</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Adresse :</span>
                      <span className="ml-2 font-medium">{preventionBatiment.adresse_civique || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ville :</span>
                      <span className="ml-2 font-medium">{preventionBatiment.ville || 'N/A'}</span>
                    </div>
                    {preventionBatiment.latitude && preventionBatiment.longitude && (
                      <>
                        <div>
                          <span className="text-gray-500">Latitude :</span>
                          <span className="ml-2 font-medium">{preventionBatiment.latitude}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Longitude :</span>
                          <span className="ml-2 font-medium">{preventionBatiment.longitude}</span>
                        </div>
                        <div className="md:col-span-2">
                          <a 
                            href={`https://www.google.com/maps?q=${preventionBatiment.latitude},${preventionBatiment.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            🗺️ Voir sur Google Maps
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Propriétaire */}
                {(preventionBatiment.proprietaire_nom || preventionBatiment.proprietaire_telephone) && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">👤 Propriétaire</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {preventionBatiment.proprietaire_nom && (
                        <div>
                          <span className="text-gray-500">Nom :</span>
                          <span className="ml-2 font-medium">{preventionBatiment.proprietaire_nom}</span>
                        </div>
                      )}
                      {preventionBatiment.proprietaire_telephone && (
                        <div>
                          <span className="text-gray-500">Téléphone :</span>
                          <a href={`tel:${preventionBatiment.proprietaire_telephone}`} className="ml-2 font-medium text-blue-600 hover:underline">
                            {preventionBatiment.proprietaire_telephone}
                          </a>
                        </div>
                      )}
                      {preventionBatiment.proprietaire_email && (
                        <div>
                          <span className="text-gray-500">Email :</span>
                          <a href={`mailto:${preventionBatiment.proprietaire_email}`} className="ml-2 font-medium text-blue-600 hover:underline">
                            {preventionBatiment.proprietaire_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Plan d'intervention */}
                {preventionBatiment.plan_intervention_url && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">📄 Plan d'intervention</h4>
                    <a 
                      href={preventionBatiment.plan_intervention_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      📥 Télécharger le plan d'intervention
                    </a>
                  </div>
                )}

                {/* Niveau de risque */}
                {preventionBatiment.niveau_risque && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">⚠️ Niveau de risque</h4>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      preventionBatiment.niveau_risque === 'Élevé' || preventionBatiment.niveau_risque === 'Très élevé'
                        ? 'bg-red-100 text-red-700'
                        : preventionBatiment.niveau_risque === 'Moyen'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      {preventionBatiment.niveau_risque}
                    </span>
                  </div>
                )}

                {/* Risques identifiés */}
                {preventionBatiment.risques_identifies && preventionBatiment.risques_identifies.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">🔥 Risques identifiés</h4>
                    <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                      {preventionBatiment.risques_identifies.map((risque, idx) => (
                        <li key={idx}>{risque}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Dernière inspection */}
                {preventionBatiment.derniere_inspection && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">🔍 Dernière inspection</h4>
                    <span className="text-sm text-gray-600">
                      {new Date(preventionBatiment.derniere_inspection).toLocaleDateString('fr-CA')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">Impossible de charger les informations du bâtiment.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Informations générales du bâtiment (toujours affichées) */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="text-lg text-orange-800">🏠 Informations sur le bâtiment</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom de l'établissement
              </label>
              <input
                type="text"
                value={formData.building_name || ''}
                onChange={(e) => setFormData({ ...formData, building_name: e.target.value })}
                disabled={!editMode}
                placeholder="Ex: École primaire, Restaurant..."
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code d'usage du bâtiment *
              </label>
              <select
                value={formData.building_category_code || ''}
                onChange={(e) => setFormData({ ...formData, building_category_code: e.target.value })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              >
                <option value="">-- Sélectionner --</option>
                {(referenceData.categories_batiment || []).map(cat => (
                  <option key={cat.id} value={cat.code}>
                    {cat.code} - {cat.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre de logements
              </label>
              <input
                type="number"
                value={formData.building_units || ''}
                onChange={(e) => setFormData({ ...formData, building_units: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre d'étages
              </label>
              <input
                type="number"
                value={formData.building_floors || ''}
                onChange={(e) => setFormData({ ...formData, building_floors: parseInt(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Année de construction
              </label>
              <input
                type="number"
                value={formData.building_year || ''}
                onChange={(e) => setFormData({ ...formData, building_year: parseInt(e.target.value) || null })}
                disabled={!editMode}
                placeholder="ex: 1985"
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Superficie (m²)
              </label>
              <input
                type="text"
                value={formData.building_area || ''}
                onChange={(e) => setFormData({ ...formData, building_area: e.target.value })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valeur du bâtiment ($)
              </label>
              <input
                type="number"
                value={formData.building_value || ''}
                onChange={(e) => setFormData({ ...formData, building_value: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valeur du contenu ($)
              </label>
              <input
                type="number"
                value={formData.content_value || ''}
                onChange={(e) => setFormData({ ...formData, content_value: parseFloat(e.target.value) || 0 })}
                disabled={!editMode}
                className="w-full border border-gray-300 rounded-lg p-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SectionBatiment;
