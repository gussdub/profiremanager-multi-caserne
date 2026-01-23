/**
 * SectionIdentification - Composant pour l'onglet Identification & Chrono
 * 
 * Affiche les informations générales de l'intervention:
 * - Bloc Général (No Dossier, Nature, Code Feu, Adresse, etc.)
 * - Chronologie (heures d'appel, arrivée, etc.)
 * - Météo (chargée automatiquement)
 * - Informations appelant
 * - Journal des communications
 */

import React, { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Sous-composant pour afficher un champ de temps
const TimeField = ({ label, value, highlight }) => (
  <div className={highlight ? "bg-yellow-50 p-2 rounded border border-yellow-200" : ""}>
    <label className="text-sm text-gray-500">{label}</label>
    <p className={`font-mono text-sm ${highlight ? "font-bold text-yellow-800" : ""}`}>{value}</p>
  </div>
);

const SectionIdentification = ({ formData, setFormData, editMode, formatDateTime, tenantSlug, getToken, toast }) => {
  // Charger la météo automatiquement si pas encore chargée
  useEffect(() => {
    const loadWeatherAuto = async () => {
      // Ne charger que si la météo n'est pas déjà chargée et qu'on a une date d'appel
      if (formData.meteo?.temperature != null || !formData.xml_time_call_received) {
        return;
      }
      
      let lat = formData.coordinates?.lat || formData.latitude;
      let lon = formData.coordinates?.lon || formData.longitude;
      
      // Si pas de coordonnées, essayer de les obtenir via geocoding de l'adresse
      if (!lat || !lon) {
        const addressToGeocode = [
          formData.address_full,
          formData.municipality || formData.xml_municipality || formData.address_city,
          'Québec, Canada'
        ].filter(Boolean).join(', ');
        
        if (!addressToGeocode || addressToGeocode === 'Québec, Canada') return;
        
        try {
          // Utiliser Nominatim pour le geocoding
          const geoResponse = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressToGeocode)}&limit=1`,
            { headers: { 'Accept': 'application/json' } }
          );
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData && geoData.length > 0) {
              lat = parseFloat(geoData[0].lat);
              lon = parseFloat(geoData[0].lon);
              console.log('📍 Coordonnées trouvées pour météo:', lat, lon);
            }
          }
        } catch (e) {
          console.error('Erreur geocoding:', e);
        }
      }
      
      // Si on a maintenant des coordonnées, charger la météo
      if (lat && lon) {
        try {
          const response = await fetch(
            `${BACKEND_URL}/api/${tenantSlug}/interventions/weather?lat=${lat}&lon=${lon}&datetime_str=${formData.xml_time_call_received}`,
            { headers: { 'Authorization': `Bearer ${getToken()}` } }
          );
          if (response.ok) {
            const weather = await response.json();
            if (weather.temperature !== null) {
              setFormData(prev => ({
                ...prev,
                coordinates: { lat, lon },
                meteo: {
                  temperature: weather.temperature,
                  conditions: weather.conditions?.[0] || 'inconnu',
                  chaussee: weather.chaussee,
                  precipitation_mm: weather.precipitation_mm,
                  neige_cm: weather.neige_cm,
                  vent_kmh: weather.vent_kmh,
                  visibilite_m: weather.visibilite_m
                }
              }));
              console.log('🌤️ Météo chargée automatiquement:', weather.temperature + '°C');
            }
          }
        } catch (e) {
          console.error('Erreur chargement météo:', e);
        }
      }
    };
    
    if (tenantSlug && getToken) {
      loadWeatherAuto();
    }
  }, [formData.address_full, formData.municipality, formData.xml_time_call_received, tenantSlug, getToken, setFormData]);

  return (
    <div className="space-y-6">
      {/* Bloc Général (Obligatoire pour TOUS les appels) */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">📋 Bloc Général (Obligatoire)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-500">No Dossier</label>
              <p className="font-mono font-bold">{formData.external_call_id}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Nature de l'incident</label>
              <p className="font-medium">{formData.type_intervention || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Code Feu</label>
              <p>{formData.code_feu || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Adresse complète</label>
              <p className="font-medium">{formData.address_full || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Municipalité</label>
              <p className="font-medium">{formData.municipality || formData.xml_municipality || formData.address_city || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Niveau de risque</label>
              <p>{formData.niveau_risque || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chronologie */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">⏱️ Chronologie</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TimeField label="Appel reçu" value={formatDateTime(formData.xml_time_call_received)} />
            <TimeField label="Alerte" value={formatDateTime(formData.xml_time_dispatch)} />
            <TimeField label="Départ caserne" value={formatDateTime(formData.xml_time_en_route)} />
            <TimeField label="Arrivée sur les lieux" value={formatDateTime(formData.xml_time_arrival_1st)} highlight />
            <TimeField label="Force de frappe" value={formatDateTime(formData.xml_time_force_frappe)} />
            <TimeField label="Sous contrôle" value={formatDateTime(formData.xml_time_under_control)} />
            <TimeField label="Disponible (10-22)" value={formatDateTime(formData.xml_time_1022)} />
            <TimeField label="Fin intervention" value={formatDateTime(formData.xml_time_terminated)} />
          </div>
        </CardContent>
      </Card>

      {/* Météo - Chargée automatiquement */}
      <Card>
        <CardHeader className="bg-blue-50">
          <CardTitle className="text-lg text-blue-800">
            <span>🌤️ Conditions météo</span>
            {formData.meteo?.temperature != null && (
              <span className="text-sm font-normal ml-2 text-blue-600">(chargé automatiquement)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-gray-500">Température</label>
              {editMode ? (
                <input
                  type="number"
                  value={formData.meteo?.temperature ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, temperature: e.target.value ? parseFloat(e.target.value) : null }
                  })}
                  className="w-full border rounded p-2"
                  placeholder="°C"
                />
              ) : (
                <p className="font-medium">{formData.meteo?.temperature != null ? `${formData.meteo.temperature}°C` : '-'}</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">Conditions</label>
              {editMode ? (
                <select
                  value={formData.meteo?.conditions || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, conditions: e.target.value }
                  })}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="soleil">☀️ Soleil</option>
                  <option value="nuageux">☁️ Nuageux</option>
                  <option value="pluie">🌧️ Pluie</option>
                  <option value="neige">🌨️ Neige</option>
                  <option value="brouillard">🌫️ Brouillard</option>
                  <option value="orage">⛈️ Orage</option>
                  <option value="verglas">🧊 Verglas</option>
                </select>
              ) : (
                <p className="font-medium">{
                  formData.meteo?.conditions === 'soleil' ? '☀️ Soleil' :
                  formData.meteo?.conditions === 'nuageux' ? '☁️ Nuageux' :
                  formData.meteo?.conditions === 'pluie' ? '🌧️ Pluie' :
                  formData.meteo?.conditions === 'neige' ? '🌨️ Neige' :
                  formData.meteo?.conditions === 'brouillard' ? '🌫️ Brouillard' :
                  formData.meteo?.conditions === 'orage' ? '⛈️ Orage' :
                  formData.meteo?.conditions === 'verglas' ? '🧊 Verglas' :
                  '-'
                }</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">État chaussée</label>
              {editMode ? (
                <select
                  value={formData.meteo?.chaussee || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, chaussee: e.target.value }
                  })}
                  className="w-full border rounded p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="sec">🛣️ Sec</option>
                  <option value="mouillée">💧 Mouillée</option>
                  <option value="glissante">⚠️ Glissante</option>
                  <option value="enneigée">❄️ Enneigée</option>
                  <option value="glacée">🧊 Glacée</option>
                </select>
              ) : (
                <p className="font-medium">{
                  formData.meteo?.chaussee === 'sec' ? '🛣️ Sec' :
                  formData.meteo?.chaussee === 'mouillée' ? '💧 Mouillée' :
                  formData.meteo?.chaussee === 'glissante' ? '⚠️ Glissante' :
                  formData.meteo?.chaussee === 'enneigée' ? '❄️ Enneigée' :
                  formData.meteo?.chaussee === 'glacée' ? '🧊 Glacée' :
                  '-'
                }</p>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-500">Vent</label>
              {editMode ? (
                <input
                  type="number"
                  value={formData.meteo?.vent_kmh ?? ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    meteo: { ...formData.meteo, vent_kmh: e.target.value ? parseFloat(e.target.value) : null }
                  })}
                  className="w-full border rounded p-2"
                  placeholder="km/h"
                />
              ) : (
                <p className="font-medium">{formData.meteo?.vent_kmh != null ? `${formData.meteo.vent_kmh} km/h` : '-'}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Appelant */}
      <Card>
        <CardHeader className="bg-gray-50">
          <CardTitle className="text-lg">📱 Informations appelant</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">De qui</label>
              <p>{formData.caller_name || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Téléphone</label>
              <p>{formData.caller_phone || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Pour qui</label>
              <p>{formData.for_whom || '-'}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Téléphone</label>
              <p>{formData.for_whom_phone || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commentaires du 911 */}
      {formData.xml_comments && formData.xml_comments.length > 0 && (
        <Card>
          <CardHeader className="bg-gray-50">
            <CardTitle className="text-lg">💬 Journal des communications</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...formData.xml_comments]
                .sort((a, b) => {
                  // Trier par timestamp chronologique
                  const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
                  const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
                  return dateA - dateB;
                })
                .map((comment, i) => (
                <div key={i} className="bg-gray-50 p-2 rounded text-sm">
                  <span className="text-gray-500">{comment.timestamp}</span>
                  <span className="mx-2">-</span>
                  <span>{comment.detail}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SectionIdentification;
