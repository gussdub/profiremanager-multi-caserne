import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import VoiceInputButton from '../VoiceInputButton';

// Sous-composants modulaires
import RapportStructure from './rcci/RapportStructure';
import Temoignages from './rcci/Temoignages';
import GestionScene from './rcci/GestionScene';
import RegistrePreuves from './rcci/RegistrePreuves';
import IntervenantsExternes from './rcci/IntervenantsExternes';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionRCCI = ({ intervention, tenantSlug, user, getToken, toast, canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rcci, setRcci] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [personnel, setPersonnel] = useState([]);
  
  const [formData, setFormData] = useState({
    // 1. Mécanique incendie
    origin_area: '',
    probable_cause: 'indeterminee',
    ignition_source: '',
    material_first_ignited: '',
    ignition_factor: '',
    propagation_factors: [],
    smoke_detector_status: 'indetermine',
    investigator_id: '',
    
    // 2. Rapport structuré
    structured_narrative_step1: '',
    structured_narrative_step2: '',
    structured_narrative_step3: '',
    structured_narrative_step4: '',
    
    // 3. Témoignages
    testimonies: [],
    
    // 4. Gestion scène
    scene_secured_at: '',
    scene_secured_by: '',
    scene_handed_to: '',
    investigator_badge: '',
    police_event_number: '',
    handover_datetime: '',
    
    // 5. Registre preuves
    evidence_registry: [],
    
    // 6. Intervenants externes
    hydro_quebec_intervention: false,
    hydro_quebec_time: '',
    energir_intervention: false,
    energir_time: '',
    croix_rouge_intervention: false,
    municipal_inspector: false,
    municipal_inspector_name: '',
    civil_security: false,
    other_intervenants: '',
    
    // 7. Météo
    weather_temp: null,
    weather_conditions: '',
    
    // 8. Narratif classique
    narrative: '',
    
    // 9. Transfert police
    transfert_police: false,
    motif_transfert: '',
    date_transfert: '',
    numero_dossier_police: ''
  });
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Charger personnel (officiers)
  useEffect(() => {
    const fetchPersonnel = async () => {
      try {
        const response = await fetch(`${API}/users`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const users = await response.json();
          setPersonnel(users.filter(u => u.role === 'admin' || u.role === 'superviseur'));
        }
      } catch (error) {
        console.error('Erreur chargement personnel:', error);
      }
    };
    fetchPersonnel();
  }, [tenantSlug]);
  
  // Charger données RCCI + météo depuis intervention
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API}/interventions/${intervention.id}/rcci`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.rcci) {
            setRcci(data.rcci);
            setPhotos(data.rcci.photos || []);
            
            setFormData({
              // 1. Mécanique
              origin_area: data.rcci.origin_area || '',
              probable_cause: data.rcci.probable_cause || 'indeterminee',
              ignition_source: data.rcci.ignition_source || '',
              material_first_ignited: data.rcci.material_first_ignited || '',
              ignition_factor: data.rcci.ignition_factor || '',
              propagation_factors: data.rcci.propagation_factors || [],
              smoke_detector_status: data.rcci.smoke_detector_status || 'indetermine',
              investigator_id: data.rcci.investigator_id || '',
              
              // 2. Rapport structuré
              structured_narrative_step1: data.rcci.structured_narrative_step1 || '',
              structured_narrative_step2: data.rcci.structured_narrative_step2 || '',
              structured_narrative_step3: data.rcci.structured_narrative_step3 || '',
              structured_narrative_step4: data.rcci.structured_narrative_step4 || '',
              
              // 3. Témoignages
              testimonies: data.rcci.testimonies || [],
              
              // 4. Gestion scène
              scene_secured_at: data.rcci.scene_secured_at ? data.rcci.scene_secured_at.split('T')[1]?.substring(0,5) : '',
              scene_secured_by: data.rcci.scene_secured_by || '',
              scene_handed_to: data.rcci.scene_handed_to || '',
              investigator_badge: data.rcci.investigator_badge || '',
              police_event_number: data.rcci.police_event_number || '',
              handover_datetime: data.rcci.handover_datetime ? data.rcci.handover_datetime.split('T')[0] : '',
              
              // 5. Registre preuves
              evidence_registry: data.rcci.evidence_registry || [],
              
              // 6. Intervenants
              hydro_quebec_intervention: data.rcci.hydro_quebec_intervention || false,
              hydro_quebec_time: data.rcci.hydro_quebec_time || '',
              energir_intervention: data.rcci.energir_intervention || false,
              energir_time: data.rcci.energir_time || '',
              croix_rouge_intervention: data.rcci.croix_rouge_intervention || false,
              municipal_inspector: data.rcci.municipal_inspector || false,
              municipal_inspector_name: data.rcci.municipal_inspector_name || '',
              civil_security: data.rcci.civil_security || false,
              other_intervenants: data.rcci.other_intervenants || '',
              
              // 7. Météo
              weather_temp: data.rcci.weather_temp || intervention.meteo_temperature || null,
              weather_conditions: data.rcci.weather_conditions || intervention.meteo_conditions || '',
              
              // 8. Narratif
              narrative: data.rcci.narrative || '',
              
              // 9. Transfert
              transfert_police: data.rcci.transfert_police || false,
              motif_transfert: data.rcci.motif_transfert || '',
              date_transfert: data.rcci.date_transfert ? data.rcci.date_transfert.split('T')[0] : '',
              numero_dossier_police: data.rcci.numero_dossier_police || ''
            });
          } else {
            // Pas de RCCI, initialiser avec météo de l'intervention
            setFormData(prev => ({
              ...prev,
              weather_temp: intervention.meteo_temperature || null,
              weather_conditions: intervention.meteo_conditions || ''
            }));
          }
        }
      } catch (error) {
        console.error('Erreur chargement RCCI:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [intervention.id, tenantSlug]);
  
  // Sauvegarder
  const handleSave = async () => {
    if (!canEdit) {
      toast({
        title: "Accès refusé",
        description: "Vous n'avez pas la permission de modifier ce rapport",
        variant: "destructive"
      });
      return;
    }
    
    setSaving(true);
    try {
      // Convertir heure de sécurisation en datetime complet
      const scene_secured_datetime = formData.scene_secured_at
        ? `${intervention.date_intervention.split('T')[0]}T${formData.scene_secured_at}:00Z`
        : null;
      
      const payload = {
        ...formData,
        scene_secured_at: scene_secured_datetime
      };
      
      const response = await fetch(`${API}/interventions/${intervention.id}/rcci`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "✅ Enregistré",
          description: "Rapport RCCI sauvegardé avec succès"
        });
        
        // Alerte si transfert recommandé
        if (data.requires_transfer_alert) {
          toast({
            title: "⚠️ Transfert recommandé",
            description: "Cette intervention devrait être transférée à la police (cause indéterminée ou intentionnelle)",
            variant: "warning"
          });
        }
      } else {
        throw new Error('Erreur serveur');
      }
    } catch (error) {
      console.error('Erreur sauvegarde RCCI:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder le rapport RCCI",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Toggle facteur de propagation
  const togglePropagationFactor = (factor) => {
    setFormData(prev => {
      const current = prev.propagation_factors || [];
      const exists = current.includes(factor);
      return {
        ...prev,
        propagation_factors: exists
          ? current.filter(f => f !== factor)
          : [...current, factor]
      };
    });
  };
  
  // Dictée vocale pour narratif
  const handleVoiceInputNarrative = (transcript) => {
    setFormData(prev => ({
      ...prev,
      narrative: prev.narrative + (prev.narrative ? ' ' : '') + transcript
    }));
  };
  
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          Chargement du rapport RCCI...
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Message si pas éditable */}
      {!canEdit && (
        <div style={{
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem',
          textAlign: 'center',
          color: '#92400e'
        }}>
          ⚠️ Vous êtes en mode lecture seule. Vous ne pouvez pas modifier ce rapport.
        </div>
      )}
      
      {/* ========== SECTION 1 : MÉCANIQUE DE L'INCENDIE ========== */}
      <Card>
        <CardHeader style={{ backgroundColor: '#fee2e2', borderBottom: '2px solid #ef4444' }}>
          <CardTitle style={{ color: '#991b1b', fontSize: '1.125rem', fontWeight: '700' }}>
            🔥 1. Mécanique de l'incendie (Ignition)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {/* Origine + Cause */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Zone d'origine</Label>
              <Input
                value={formData.origin_area}
                onChange={(e) => setFormData({...formData, origin_area: e.target.value})}
                placeholder="Ex: Cuisine, sous-sol..."
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Cause probable</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.probable_cause}
                onChange={(e) => setFormData({...formData, probable_cause: e.target.value})}
                disabled={!canEdit}
              >
                <option value="indeterminee">Indéterminée</option>
                <option value="accidentelle">Accidentelle</option>
                <option value="intentionnelle">Intentionnelle</option>
                <option value="naturelle">Naturelle</option>
              </select>
            </div>
          </div>
          
          {/* Source + Matériau */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Source de chaleur</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.ignition_source}
                onChange={(e) => setFormData({...formData, ignition_source: e.target.value})}
                disabled={!canEdit}
              >
                <option value="">-- Sélectionner --</option>
                <option value="electrique">Électrique (court-circuit, surcharge)</option>
                <option value="cuisson">Cuisson (four, plaque)</option>
                <option value="flamme_nue">Flamme nue (chandelle, bougie)</option>
                <option value="cigarette">Cigarette</option>
                <option value="appareil_chauffage">Appareil de chauffage</option>
                <option value="foudre">Foudre</option>
                <option value="friction">Friction</option>
                <option value="produit_chimique">Produit chimique</option>
                <option value="autre">Autre</option>
              </select>
            </div>
            <div>
              <Label>Premier matériau enflammé</Label>
              <Input
                value={formData.material_first_ignited}
                onChange={(e) => setFormData({...formData, material_first_ignited: e.target.value})}
                placeholder="Ex: Huile de cuisson, tissu..."
                disabled={!canEdit}
              />
            </div>
          </div>
          
          {/* Facteur d'allumage */}
          <div>
            <Label className="font-semibold">Circonstance / Facteur d'allumage</Label>
            <p className="text-sm text-gray-600 mb-2">Comment la source a-t-elle touché le matériau ?</p>
            <select
              className="w-full border rounded-md px-3 py-2"
              value={formData.ignition_factor}
              onChange={(e) => setFormData({...formData, ignition_factor: e.target.value})}
              disabled={!canEdit}
            >
              <option value="">-- Sélectionner --</option>
              <option value="inattention">Inattention</option>
              <option value="defaillance">Défaillance mécanique / électrique</option>
              <option value="mauvais_usage">Mauvais usage de l'équipement</option>
              <option value="surchauffe">Surchauffe</option>
              <option value="malveillant">Acte malveillant</option>
              <option value="enfant">Enfant qui joue avec le feu</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          
          {/* Facteurs de propagation */}
          <div>
            <Label className="font-semibold">Facteurs ayant contribué à la propagation</Label>
            <p className="text-sm text-gray-600 mb-2">Sélectionnez tous les facteurs applicables</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                { value: 'portes_ouvertes', label: 'Portes laissées ouvertes' },
                { value: 'finition_combustible', label: 'Finition extérieure combustible' },
                { value: 'retard_decouverte', label: 'Retard dans la découverte' },
                { value: 'accumulation_matieres', label: 'Accumulation de matières (Syndrome Diogène)' },
                { value: 'absence_gicleurs', label: 'Absence de gicleurs' },
                { value: 'ventilation', label: 'Ventilation (fenêtres ouvertes, vent)' },
                { value: 'autre', label: 'Autre' }
              ].map(factor => (
                <label key={factor.value} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.propagation_factors?.includes(factor.value)}
                    onChange={() => togglePropagationFactor(factor.value)}
                    disabled={!canEdit}
                  />
                  <span className="text-sm">{factor.label}</span>
                </label>
              ))}
            </div>
          </div>
          
          {/* Détecteur fumée + Enquêteur */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Statut avertisseur de fumée</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.smoke_detector_status}
                onChange={(e) => setFormData({...formData, smoke_detector_status: e.target.value})}
                disabled={!canEdit}
              >
                <option value="indetermine">Indéterminé</option>
                <option value="absent">Absent</option>
                <option value="present_fonctionnel">Présent et fonctionnel</option>
                <option value="present_non_fonctionnel">Présent mais non fonctionnel</option>
              </select>
            </div>
            <div>
              <Label>Enquêteur responsable</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={formData.investigator_id}
                onChange={(e) => setFormData({...formData, investigator_id: e.target.value})}
                disabled={!canEdit}
              >
                <option value="">-- Sélectionner --</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* ========== SECTIONS 2-6 : SOUS-COMPOSANTS MODULAIRES ========== */}
      <RapportStructure formData={formData} setFormData={setFormData} canEdit={canEdit} />
      
      <Temoignages formData={formData} setFormData={setFormData} canEdit={canEdit} />
      
      <GestionScene formData={formData} setFormData={setFormData} canEdit={canEdit} />
      
      <RegistrePreuves 
        formData={formData} 
        setFormData={setFormData} 
        canEdit={canEdit}
        intervention={intervention}
        tenantSlug={tenantSlug}
        getToken={getToken}
        toast={toast}
      />
      
      <IntervenantsExternes formData={formData} setFormData={setFormData} canEdit={canEdit} />
      
      {/* ========== SECTION 7 : MÉTÉO ========== */}
      <Card>
        <CardHeader style={{ backgroundColor: '#e0f2fe', borderBottom: '2px solid #0284c7' }}>
          <CardTitle style={{ color: '#075985', fontSize: '1.125rem', fontWeight: '700' }}>
            🌤️ 7. Conditions météorologiques
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-600 mb-4">
            ℹ️ Ces données proviennent du rapport d'intervention principal et sont copiées ici pour référence.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Température (°C)</Label>
              <Input
                type="number"
                value={formData.weather_temp || ''}
                onChange={(e) => setFormData({...formData, weather_temp: e.target.value ? parseFloat(e.target.value) : null})}
                placeholder="-10"
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label>Conditions</Label>
              <Input
                value={formData.weather_conditions || ''}
                onChange={(e) => setFormData({...formData, weather_conditions: e.target.value})}
                placeholder="Ex: Pluie, neige, vent..."
                disabled={!canEdit}
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* ========== SECTION 8 : NARRATIF CLASSIQUE ========== */}
      <Card>
        <CardHeader style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #6b7280' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle style={{ color: '#374151', fontSize: '1.125rem', fontWeight: '700' }}>
              📝 8. Narratif complet (texte libre)
            </CardTitle>
            {canEdit && (
              <VoiceInputButton
                onTranscript={handleVoiceInputNarrative}
                placeholder="Dicter le narratif"
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <textarea
            className="w-full border rounded-md p-3"
            rows="10"
            value={formData.narrative}
            onChange={(e) => setFormData({...formData, narrative: e.target.value})}
            placeholder="Description complète des circonstances de l'enquête..."
            disabled={!canEdit}
            style={{ fontFamily: 'inherit', fontSize: '0.875rem', resize: 'vertical' }}
          />
        </CardContent>
      </Card>
      
      {/* ========== SECTION 9 : TRANSFERT POLICE ========== */}
      <Card>
        <CardHeader style={{ backgroundColor: '#dbeafe', borderBottom: '2px solid #2563eb' }}>
          <CardTitle style={{ color: '#1e40af', fontSize: '1.125rem', fontWeight: '700' }}>
            🚨 9. Transfert du dossier à la police
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <label className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.transfert_police}
              onChange={(e) => setFormData({...formData, transfert_police: e.target.checked})}
              disabled={!canEdit}
            />
            <span style={{ fontWeight: '600' }}>Dossier transféré à la police</span>
          </label>
          
          {formData.transfert_police && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-md border border-blue-200">
              <div>
                <Label>Motif du transfert</Label>
                <select
                  className="w-full border rounded-md px-3 py-2"
                  value={formData.motif_transfert || ''}
                  onChange={(e) => setFormData({...formData, motif_transfert: e.target.value})}
                  disabled={!canEdit}
                >
                  <option value="">-- Sélectionner --</option>
                  <option value="incendie_suspect">Incendie suspect</option>
                  <option value="deces">Décès</option>
                  <option value="blessure_grave">Blessure grave</option>
                  <option value="crime_apparent">Évidence de crime</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Date de transfert</Label>
                  <Input
                    type="date"
                    value={formData.date_transfert || ''}
                    onChange={(e) => setFormData({...formData, date_transfert: e.target.value})}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Numéro de dossier police</Label>
                  <Input
                    value={formData.numero_dossier_police || ''}
                    onChange={(e) => setFormData({...formData, numero_dossier_police: e.target.value})}
                    placeholder="2024-123456"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* ========== BOUTON SAUVEGARDER (STICKY) ========== */}
      {canEdit && (
        <div style={{ position: 'sticky', bottom: '1rem', zIndex: 50, textAlign: 'right' }}>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: saving ? '#9ca3af' : '#10b981',
              color: 'white',
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
            }}
          >
            {saving ? '⏳ Enregistrement...' : '💾 Enregistrer tout'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default SectionRCCI;
