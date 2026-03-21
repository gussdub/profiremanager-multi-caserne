/**
 * SectionBatiment - Composant pour l'onglet Bâtiment dans le module Interventions
 * 
 * Affiche les informations du bâtiment et l'intégration avec le module Bâtiments (indépendant)
 * Utilise le nouveau module Bâtiments accessible à tous les tenants
 */

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const SectionBatiment = ({ formData, setFormData, editMode, referenceData, tenantSlug, getToken }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedBatiment, setSelectedBatiment] = useState(null);
  const [linkedBatiment, setLinkedBatiment] = useState(null);
  const [loadingBatiment, setLoadingBatiment] = useState(false);

  const API_URL = process.env.REACT_APP_BACKEND_URL;

  // Charger les détails du bâtiment si lié
  useEffect(() => {
    const loadLinkedBatiment = async () => {
      if (!formData.batiment_id) {
        setLinkedBatiment(null);
        return;
      }

      setLoadingBatiment(true);
      try {
        const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
        // Utiliser les nouvelles routes du module Bâtiments indépendant
        const response = await fetch(
          `${API_URL}/api/${tenantSlug}/batiments/${formData.batiment_id}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setLinkedBatiment(data);
        }
      } catch (error) {
        console.error('Erreur chargement bâtiment:', error);
      } finally {
        setLoadingBatiment(false);
      }
    };
    
    loadLinkedBatiment();
  }, [formData.batiment_id, tenantSlug, getToken, API_URL]);

  // Rechercher les bâtiments (utilise le nouveau module Bâtiments)
  const handleSearch = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
      // Utiliser les nouvelles routes du module Bâtiments indépendant
      const response = await fetch(
        `${API_URL}/api/${tenantSlug}/batiments/search?q=${encodeURIComponent(query)}`,
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
    setLinkedBatiment(batiment);
    setShowResults(false);
    setSearchQuery(batiment.adresse_civique || batiment.nom_etablissement || '');
    
    // Mapper les données du bâtiment vers le formulaire d'intervention
    setFormData(prev => ({
      ...prev,
      // ID du bâtiment lié
      batiment_id: batiment.id,
      // Pour rétrocompatibilité avec l'ancien champ
      batiment_prevention_id: batiment.id,
      // Infos bâtiment
      building_name: batiment.nom_etablissement || '',
      building_floors: parseInt(batiment.nombre_etages) || prev.building_floors,
      building_year: parseInt(batiment.annee_construction) || prev.building_year,
      building_area: batiment.superficie || '',
      building_category_code: batiment.groupe_occupation || prev.building_category_code,
      // Contact
      owner_name: batiment.contact_nom || '',
      owner_phone: batiment.contact_telephone || '',
      // Risques
      risk_level: batiment.niveau_risque || '',
      // Géolocalisation
      latitude: batiment.latitude || prev.latitude,
      longitude: batiment.longitude || prev.longitude,
      // Adresse complète
      address_street: batiment.adresse_civique || prev.address_street,
      address_city: batiment.ville || prev.address_city,
      address_postal: batiment.code_postal || prev.address_postal,
      address_full: `${batiment.adresse_civique || ''}, ${batiment.ville || ''}`.trim()
    }));
  };

  // Délier le bâtiment
  const handleUnlinkBatiment = () => {
    setSelectedBatiment(null);
    setLinkedBatiment(null);
    setSearchQuery('');
    setFormData(prev => ({
      ...prev,
      batiment_id: null,
      batiment_prevention_id: null
    }));
  };

  return (
    <div className="space-y-6">
      {/* Recherche bâtiment */}
      {editMode && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-blue-800 flex items-center gap-2">
              🔍 Rechercher un bâtiment existant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Recherchez un bâtiment dans la base de données pour auto-remplir les informations.
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
                  Aucun bâtiment trouvé
                </div>
              )}
            </div>
            
            {(selectedBatiment || linkedBatiment) && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-800">
                  <span>✅</span>
                  <span className="font-medium">
                    Bâtiment lié : {(selectedBatiment || linkedBatiment)?.nom_etablissement || (selectedBatiment || linkedBatiment)?.adresse_civique}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUnlinkBatiment}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Délier
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Infos du bâtiment lié */}
      {(linkedBatiment || formData.batiment_id) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
              📋 Informations du bâtiment lié
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBatiment ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-orange-500 rounded-full border-t-transparent"></div>
              </div>
            ) : linkedBatiment ? (
              <div className="space-y-4">
                {/* Photo du bâtiment */}
                {linkedBatiment.photo_url && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">📷 Photo du bâtiment</h4>
                    <img 
                      src={linkedBatiment.photo_url} 
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
                      <span className="ml-2 font-medium">{linkedBatiment.adresse_civique || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Ville :</span>
                      <span className="ml-2 font-medium">{linkedBatiment.ville || 'N/A'}</span>
                    </div>
                    {linkedBatiment.latitude && linkedBatiment.longitude && (
                      <>
                        <div>
                          <span className="text-gray-500">Latitude :</span>
                          <span className="ml-2 font-medium">{linkedBatiment.latitude}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Longitude :</span>
                          <span className="ml-2 font-medium">{linkedBatiment.longitude}</span>
                        </div>
                        <div className="md:col-span-2">
                          <a 
                            href={`https://www.google.com/maps?q=${linkedBatiment.latitude},${linkedBatiment.longitude}`}
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

                {/* Contact */}
                {(linkedBatiment.contact_nom || linkedBatiment.contact_telephone) && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">👤 Contact</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {linkedBatiment.contact_nom && (
                        <div>
                          <span className="text-gray-500">Nom :</span>
                          <span className="ml-2 font-medium">{linkedBatiment.contact_nom}</span>
                        </div>
                      )}
                      {linkedBatiment.contact_telephone && (
                        <div>
                          <span className="text-gray-500">Téléphone :</span>
                          <a href={`tel:${linkedBatiment.contact_telephone}`} className="ml-2 font-medium text-blue-600 hover:underline">
                            {linkedBatiment.contact_telephone}
                          </a>
                        </div>
                      )}
                      {linkedBatiment.contact_email && (
                        <div>
                          <span className="text-gray-500">Email :</span>
                          <a href={`mailto:${linkedBatiment.contact_email}`} className="ml-2 font-medium text-blue-600 hover:underline">
                            {linkedBatiment.contact_email}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Niveau de risque */}
                {linkedBatiment.niveau_risque && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">⚠️ Niveau de risque</h4>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      linkedBatiment.niveau_risque === 'Élevé' || linkedBatiment.niveau_risque === 'Très élevé'
                        ? 'bg-red-100 text-red-700'
                        : linkedBatiment.niveau_risque === 'Moyen'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      {linkedBatiment.niveau_risque}
                    </span>
                  </div>
                )}

                {/* Description */}
                {linkedBatiment.description && (
                  <div>
                    <h4 className="font-medium text-gray-700 mb-2">📝 Notes</h4>
                    <p className="text-sm text-gray-600">{linkedBatiment.description}</p>
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
