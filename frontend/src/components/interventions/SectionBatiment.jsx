/**
 * SectionBatiment - Composant pour l'onglet Bâtiment dans le module Interventions
 * 
 * LOGIQUE INTELLIGENTE:
 * 1. Recherche automatique basée sur l'adresse de l'intervention
 * 2. Si correspondance exacte trouvée → liaison automatique
 * 3. Si plusieurs correspondances → proposition de sélection
 * 4. Si aucune correspondance → mode recherche manuelle
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const SectionBatiment = ({ formData, setFormData, editMode, referenceData, tenantSlug, getToken }) => {
  // États principaux
  const [linkedBatiment, setLinkedBatiment] = useState(null);
  const [loadingBatiment, setLoadingBatiment] = useState(false);
  
  // États pour la recherche automatique
  const [autoSearchStatus, setAutoSearchStatus] = useState('idle'); // 'idle' | 'searching' | 'found' | 'multiple' | 'not_found'
  const [autoSearchResults, setAutoSearchResults] = useState([]);
  
  // États pour la recherche manuelle (fallback)
  const [showManualSearch, setShowManualSearch] = useState(false);
  const [manualSearchQuery, setManualSearchQuery] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [showManualResults, setShowManualResults] = useState(false);

  const API_URL = process.env.REACT_APP_BACKEND_URL;

  // Fonction pour normaliser les adresses pour comparaison
  const normalizeAddress = (address) => {
    if (!address) return '';
    return address
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
      .replace(/[,.\-#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Fonction pour calculer un score de correspondance
  const calculateMatchScore = (batiment, interventionAddress, interventionCity) => {
    const batimentAddr = normalizeAddress(batiment.adresse_civique);
    const batimentCity = normalizeAddress(batiment.ville);
    const searchAddr = normalizeAddress(interventionAddress);
    const searchCity = normalizeAddress(interventionCity);
    
    let score = 0;
    
    // Correspondance exacte de l'adresse
    if (batimentAddr === searchAddr) {
      score += 50;
    } else if (batimentAddr.includes(searchAddr) || searchAddr.includes(batimentAddr)) {
      score += 30;
    }
    
    // Correspondance de la ville
    if (batimentCity === searchCity) {
      score += 30;
    } else if (batimentCity.includes(searchCity) || searchCity.includes(batimentCity)) {
      score += 15;
    }
    
    // Bonus pour numéro civique identique
    const batimentNum = batimentAddr.match(/^\d+/)?.[0];
    const searchNum = searchAddr.match(/^\d+/)?.[0];
    if (batimentNum && searchNum && batimentNum === searchNum) {
      score += 20;
    }
    
    return score;
  };

  // Charger les détails du bâtiment si déjà lié
  useEffect(() => {
    const loadLinkedBatiment = async () => {
      if (!formData.batiment_id) {
        setLinkedBatiment(null);
        return;
      }

      setLoadingBatiment(true);
      try {
        const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
        const response = await fetch(
          `${API_URL}/api/${tenantSlug}/batiments/${formData.batiment_id}`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        if (response.ok) {
          const data = await response.json();
          setLinkedBatiment(data);
          setAutoSearchStatus('found');
        }
      } catch (error) {
        console.error('Erreur chargement bâtiment:', error);
      } finally {
        setLoadingBatiment(false);
      }
    };
    
    loadLinkedBatiment();
  }, [formData.batiment_id, tenantSlug, getToken, API_URL]);

  // RECHERCHE AUTOMATIQUE basée sur l'adresse de l'intervention
  const performAutoSearch = useCallback(async () => {
    // Ne pas rechercher si déjà lié ou pas d'adresse
    if (formData.batiment_id || linkedBatiment) return;
    
    const interventionAddress = formData.address_street || formData.address_full || '';
    const interventionCity = formData.address_city || '';
    
    if (!interventionAddress || interventionAddress.length < 3) {
      setAutoSearchStatus('idle');
      return;
    }

    setAutoSearchStatus('searching');
    
    try {
      const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
      
      // Recherche avec l'adresse
      const response = await fetch(
        `${API_URL}/api/${tenantSlug}/batiments/search?q=${encodeURIComponent(interventionAddress)}&limit=20`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const results = await response.json();
        
        if (results.length === 0) {
          setAutoSearchStatus('not_found');
          setAutoSearchResults([]);
          setShowManualSearch(true);
          return;
        }
        
        // Calculer les scores de correspondance
        const scoredResults = results.map(bat => ({
          ...bat,
          matchScore: calculateMatchScore(bat, interventionAddress, interventionCity)
        })).sort((a, b) => b.matchScore - a.matchScore);
        
        // Si le meilleur résultat a un score élevé (>= 70), liaison automatique
        if (scoredResults[0].matchScore >= 70) {
          handleSelectBatiment(scoredResults[0]);
          setAutoSearchStatus('found');
        }
        // Si plusieurs résultats avec des scores moyens, proposer sélection
        else if (scoredResults.filter(r => r.matchScore >= 30).length > 0) {
          setAutoSearchResults(scoredResults.filter(r => r.matchScore >= 30).slice(0, 5));
          setAutoSearchStatus('multiple');
        }
        // Sinon, pas de correspondance fiable
        else {
          setAutoSearchStatus('not_found');
          setAutoSearchResults([]);
          setShowManualSearch(true);
        }
      }
    } catch (error) {
      console.error('Erreur recherche automatique:', error);
      setAutoSearchStatus('not_found');
      setShowManualSearch(true);
    }
  }, [formData.batiment_id, formData.address_street, formData.address_full, formData.address_city, linkedBatiment, tenantSlug, getToken, API_URL]);

  // Déclencher la recherche automatique quand l'adresse change
  useEffect(() => {
    if (!formData.batiment_id && !linkedBatiment && editMode) {
      const timer = setTimeout(() => {
        performAutoSearch();
      }, 500); // Debounce de 500ms
      
      return () => clearTimeout(timer);
    }
  }, [formData.address_street, formData.address_full, formData.address_city, performAutoSearch, editMode]);

  // Recherche manuelle
  const handleManualSearch = async (query) => {
    if (!query || query.length < 2) {
      setManualSearchResults([]);
      return;
    }
    
    setManualSearching(true);
    try {
      const token = getToken ? getToken() : localStorage.getItem(`${tenantSlug}_token`);
      const response = await fetch(
        `${API_URL}/api/${tenantSlug}/batiments/search?q=${encodeURIComponent(query)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setManualSearchResults(data);
        setShowManualResults(true);
      }
    } catch (error) {
      console.error('Erreur recherche manuelle:', error);
    } finally {
      setManualSearching(false);
    }
  };

  // Sélectionner un bâtiment
  const handleSelectBatiment = (batiment) => {
    setLinkedBatiment(batiment);
    setAutoSearchStatus('found');
    setAutoSearchResults([]);
    setShowManualSearch(false);
    setShowManualResults(false);
    setManualSearchQuery('');
    
    // Mapper les données du bâtiment vers le formulaire d'intervention
    setFormData(prev => ({
      ...prev,
      batiment_id: batiment.id,
      batiment_prevention_id: batiment.id, // Rétrocompatibilité
      building_name: batiment.nom_etablissement || prev.building_name || '',
      building_floors: parseInt(batiment.nombre_etages) || prev.building_floors,
      building_year: parseInt(batiment.annee_construction) || prev.building_year,
      building_area: batiment.superficie || prev.building_area || '',
      building_category_code: batiment.groupe_occupation || prev.building_category_code,
      owner_name: batiment.contact_nom || prev.owner_name || '',
      owner_phone: batiment.contact_telephone || prev.owner_phone || '',
      risk_level: batiment.niveau_risque || prev.risk_level || '',
      latitude: batiment.latitude || prev.latitude,
      longitude: batiment.longitude || prev.longitude
    }));
  };

  // Délier le bâtiment
  const handleUnlinkBatiment = () => {
    setLinkedBatiment(null);
    setAutoSearchStatus('idle');
    setShowManualSearch(true);
    setFormData(prev => ({
      ...prev,
      batiment_id: null,
      batiment_prevention_id: null
    }));
  };

  // Relancer la recherche automatique
  const handleRetryAutoSearch = () => {
    setShowManualSearch(false);
    setAutoSearchStatus('idle');
    performAutoSearch();
  };

  return (
    <div className="space-y-6">
      {/* STATUT DE LA RECHERCHE AUTOMATIQUE */}
      {autoSearchStatus === 'searching' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 rounded-full border-t-transparent"></div>
              <span className="text-blue-700">
                Recherche automatique d'un bâtiment correspondant à "{formData.address_street || formData.address_full}"...
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* BÂTIMENT TROUVÉ ET LIÉ */}
      {(linkedBatiment || formData.batiment_id) && autoSearchStatus === 'found' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-green-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                ✅ Bâtiment automatiquement identifié
              </span>
              {editMode && (
                <button
                  type="button"
                  onClick={handleUnlinkBatiment}
                  className="text-sm text-red-600 hover:text-red-800 font-normal"
                >
                  Délier
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingBatiment ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-green-500 rounded-full border-t-transparent"></div>
              </div>
            ) : linkedBatiment ? (
              <div className="space-y-3">
                <div className="font-medium text-gray-900">
                  {linkedBatiment.nom_etablissement || linkedBatiment.adresse_civique}
                </div>
                <div className="text-sm text-gray-600">
                  {linkedBatiment.adresse_civique}, {linkedBatiment.ville} {linkedBatiment.code_postal}
                </div>
                <div className="flex flex-wrap gap-2">
                  {linkedBatiment.groupe_occupation && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Groupe {linkedBatiment.groupe_occupation}
                    </span>
                  )}
                  {linkedBatiment.niveau_risque && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      linkedBatiment.niveau_risque === 'Élevé' || linkedBatiment.niveau_risque === 'Très élevé'
                        ? 'bg-red-100 text-red-700'
                        : linkedBatiment.niveau_risque === 'Moyen'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      Risque {linkedBatiment.niveau_risque}
                    </span>
                  )}
                  {linkedBatiment.nombre_etages && (
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {linkedBatiment.nombre_etages} étages
                    </span>
                  )}
                </div>
                
                {/* Informations supplémentaires */}
                {(linkedBatiment.contact_nom || linkedBatiment.contact_telephone) && (
                  <div className="pt-2 border-t text-sm">
                    <span className="text-gray-500">Contact: </span>
                    <span className="font-medium">{linkedBatiment.contact_nom}</span>
                    {linkedBatiment.contact_telephone && (
                      <a href={`tel:${linkedBatiment.contact_telephone}`} className="ml-2 text-blue-600">
                        {linkedBatiment.contact_telephone}
                      </a>
                    )}
                  </div>
                )}
                
                {linkedBatiment.latitude && linkedBatiment.longitude && (
                  <a 
                    href={`https://www.google.com/maps?q=${linkedBatiment.latitude},${linkedBatiment.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    🗺️ Voir sur Google Maps
                  </a>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* PLUSIEURS CORRESPONDANCES POSSIBLES */}
      {autoSearchStatus === 'multiple' && autoSearchResults.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-yellow-800 flex items-center gap-2">
              🔍 Plusieurs bâtiments correspondent à cette adresse
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700 mb-3">
              Sélectionnez le bâtiment correspondant à cette intervention :
            </p>
            <div className="space-y-2">
              {autoSearchResults.map(bat => (
                <div
                  key={bat.id}
                  onClick={() => handleSelectBatiment(bat)}
                  className="p-3 bg-white border border-yellow-300 rounded-lg hover:border-yellow-500 hover:bg-yellow-50 cursor-pointer transition-colors"
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
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setAutoSearchStatus('not_found');
                setShowManualSearch(true);
              }}
              className="mt-3 text-sm text-gray-600 hover:text-gray-800"
            >
              Aucun ne correspond → Recherche manuelle
            </button>
          </CardContent>
        </Card>
      )}

      {/* AUCUN BÂTIMENT TROUVÉ - RECHERCHE MANUELLE */}
      {(autoSearchStatus === 'not_found' || showManualSearch) && !linkedBatiment && editMode && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
              ⚠️ Aucun bâtiment trouvé automatiquement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-orange-700 mb-3">
              Aucun bâtiment ne correspond à l'adresse "{formData.address_street || formData.address_full}". 
              Vous pouvez rechercher manuellement ou continuer sans liaison.
            </p>
            
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={handleRetryAutoSearch}
                className="text-sm px-3 py-1.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
              >
                🔄 Réessayer la recherche auto
              </button>
            </div>
            
            <div className="relative">
              <input
                type="text"
                value={manualSearchQuery}
                onChange={(e) => {
                  setManualSearchQuery(e.target.value);
                  handleManualSearch(e.target.value);
                }}
                placeholder="Rechercher un bâtiment par adresse ou nom..."
                className="w-full border border-orange-300 rounded-lg p-2 pr-10"
              />
              {manualSearching && (
                <div className="absolute right-3 top-2.5">
                  <div className="animate-spin h-5 w-5 border-2 border-orange-500 rounded-full border-t-transparent"></div>
                </div>
              )}
              
              {/* Résultats de recherche manuelle */}
              {showManualResults && manualSearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {manualSearchResults.map(bat => (
                    <div
                      key={bat.id}
                      onClick={() => handleSelectBatiment(bat)}
                      className="p-3 hover:bg-orange-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-medium text-gray-900">
                        {bat.nom_etablissement || bat.adresse_civique}
                      </div>
                      <div className="text-sm text-gray-600">
                        {bat.adresse_civique}, {bat.ville}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {showManualResults && manualSearchResults.length === 0 && manualSearchQuery.length >= 2 && !manualSearching && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-gray-500 text-sm">
                  Aucun bâtiment trouvé
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODE LECTURE - Pas de bâtiment lié */}
      {!editMode && !linkedBatiment && autoSearchStatus !== 'searching' && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4">
            <p className="text-gray-500 text-sm">
              Aucun bâtiment n'est lié à cette intervention.
            </p>
          </CardContent>
        </Card>
      )}

      {/* INFORMATIONS DÉTAILLÉES DU BÂTIMENT LIÉ */}
      {linkedBatiment && (
        <Card className="border-orange-200">
          <CardHeader className="bg-orange-50">
            <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
              📋 Informations détaillées du bâtiment
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Photo */}
              {linkedBatiment.photo_url && (
                <div className="md:col-span-2">
                  <img 
                    src={linkedBatiment.photo_url} 
                    alt="Photo du bâtiment" 
                    className="max-w-md rounded-lg border shadow-sm"
                  />
                </div>
              )}
              
              {/* Coordonnées */}
              <div>
                <label className="text-sm text-gray-500">Adresse complète</label>
                <p className="font-medium">
                  {linkedBatiment.adresse_civique}, {linkedBatiment.ville} {linkedBatiment.code_postal}
                </p>
              </div>
              
              {linkedBatiment.nom_etablissement && (
                <div>
                  <label className="text-sm text-gray-500">Nom de l'établissement</label>
                  <p className="font-medium">{linkedBatiment.nom_etablissement}</p>
                </div>
              )}
              
              {linkedBatiment.groupe_occupation && (
                <div>
                  <label className="text-sm text-gray-500">Groupe d'occupation</label>
                  <p className="font-medium">Groupe {linkedBatiment.groupe_occupation}</p>
                </div>
              )}
              
              {linkedBatiment.nombre_etages && (
                <div>
                  <label className="text-sm text-gray-500">Nombre d'étages</label>
                  <p className="font-medium">{linkedBatiment.nombre_etages}</p>
                </div>
              )}
              
              {linkedBatiment.annee_construction && (
                <div>
                  <label className="text-sm text-gray-500">Année de construction</label>
                  <p className="font-medium">{linkedBatiment.annee_construction}</p>
                </div>
              )}
              
              {linkedBatiment.superficie && (
                <div>
                  <label className="text-sm text-gray-500">Superficie</label>
                  <p className="font-medium">{linkedBatiment.superficie} m²</p>
                </div>
              )}
              
              {linkedBatiment.description && (
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-500">Notes</label>
                  <p className="text-gray-700">{linkedBatiment.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* FORMULAIRE DES INFORMATIONS DU BÂTIMENT */}
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
