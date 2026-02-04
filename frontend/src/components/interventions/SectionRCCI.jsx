import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionRCCI = ({ intervention, tenantSlug, user, getToken, toast, canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rcci, setRcci] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [showPhotoForm, setShowPhotoForm] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [gpsCoords, setGpsCoords] = useState({ latitude: null, longitude: null });
  const [personnel, setPersonnel] = useState([]);
  
  const fileInputRef = useRef(null);
  
  const [formData, setFormData] = useState({
    origin_area: '',
    probable_cause: 'indeterminee',
    ignition_source: '',
    material_first_ignited: '',
    smoke_detector_status: 'indetermine',
    investigator_id: '',
    narrative: '',
    transfert_police: false,
    motif_transfert: '',
    date_transfert: '',
    numero_dossier_police: ''
  });
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);
  
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
  
  // Charger données RCCI
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
              origin_area: data.rcci.origin_area || '',
              probable_cause: data.rcci.probable_cause || 'indeterminee',
              ignition_source: data.rcci.ignition_source || '',
              material_first_ignited: data.rcci.material_first_ignited || '',
              smoke_detector_status: data.rcci.smoke_detector_status || 'indetermine',
              investigator_id: data.rcci.investigator_id || '',
              narrative: data.rcci.narrative || '',
              transfert_police: data.rcci.transfert_police || false,
              motif_transfert: data.rcci.motif_transfert || '',
              date_transfert: data.rcci.date_transfert ? data.rcci.date_transfert.split('T')[0] : '',
              numero_dossier_police: data.rcci.numero_dossier_police || ''
            });
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
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/rcci`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          date_transfert: formData.date_transfert ? new Date(formData.date_transfert).toISOString() : null
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast?.({ title: '✅ Rapport RCCI enregistré', variant: 'success' });
        
        if (result.requires_transfer_alert) {
          toast?.({ 
            title: '⚠️ Attention: Cause indéterminée ou intentionnelle', 
            description: 'Il est recommandé de transférer le dossier à la SQ/Police.',
            variant: 'warning',
            duration: 10000
          });
        }
      } else {
        const error = await response.json();
        toast?.({ title: error.detail || 'Erreur', variant: 'destructive' });
      }
    } catch (error) {
      toast?.({ title: 'Erreur de connexion', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        
        const response = await fetch(`${API}/interventions/${intervention.id}/rcci/photos`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            photo_base64: base64,
            description: '',
            latitude: gpsCoords.latitude,
            longitude: gpsCoords.longitude
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          setPhotos([...photos, {
            id: result.photo_id,
            photo_base64: base64,
            timestamp: new Date().toISOString(),
            latitude: gpsCoords.latitude,
            longitude: gpsCoords.longitude
          }]);
          toast?.({ title: '📷 Photo ajoutée', variant: 'success' });
        }
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast?.({ title: 'Erreur upload photo', variant: 'destructive' });
      setUploadingPhoto(false);
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleDeletePhoto = async (photoId) => {
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/rcci/photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      
      if (response.ok) {
        setPhotos(photos.filter(p => p.id !== photoId));
        toast?.({ title: 'Photo supprimée', variant: 'success' });
      }
    } catch (error) {
      toast?.({ title: 'Erreur suppression', variant: 'destructive' });
    }
  };
  
  // Alerte si cause nécessite transfert
  const showTransferAlert = (formData.probable_cause === 'indeterminee' || formData.probable_cause === 'intentionnelle') && !formData.transfert_police;
  
  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div></div>;
  }
  
  return (
    <div className="space-y-6">
      {/* Alerte transfert */}
      {showTransferAlert && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="font-bold text-amber-800">Dossier à transférer</h4>
              <p className="text-amber-700 text-sm">
                La cause {formData.probable_cause === 'intentionnelle' ? 'intentionnelle' : 'indéterminée'} suggère un transfert à la SQ/Police. 
                Certaines modifications peuvent être verrouillées une fois le transfert effectué.
              </p>
              <button 
                onClick={() => setFormData({...formData, transfert_police: true})}
                className="mt-2 bg-amber-500 text-white px-4 py-1 rounded text-sm hover:bg-amber-600"
              >
                🚔 Marquer comme transféré
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Formulaire RCCI */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            🔍 Rapport de Recherche des Causes et Circonstances de l'Incendie (RCCI)
          </h3>
          {rcci && (
            <span className="text-sm text-green-600">✅ Rapport existant</span>
          )}
        </div>
        
        {/* Cause probable */}
        <div>
          <Label className="font-medium">Cause probable *</Label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            {[
              { value: 'accidentelle', label: '✅ Accidentelle', color: 'border-green-500 bg-green-50' },
              { value: 'intentionnelle', label: '🔥 Intentionnelle', color: 'border-red-500 bg-red-50' },
              { value: 'naturelle', label: '⚡ Naturelle', color: 'border-blue-500 bg-blue-50' },
              { value: 'indeterminee', label: '❓ Indéterminée', color: 'border-amber-500 bg-amber-50' }
            ].map(opt => (
              <label 
                key={opt.value} 
                className={`block p-3 rounded-lg border-2 cursor-pointer text-center transition-all ${
                  formData.probable_cause === opt.value ? opt.color : 'border-gray-200 hover:border-gray-300'
                } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <input 
                  type="radio" 
                  name="probable_cause" 
                  value={opt.value} 
                  checked={formData.probable_cause === opt.value}
                  onChange={(e) => canEdit && setFormData({...formData, probable_cause: e.target.value})}
                  disabled={!canEdit}
                  className="sr-only" 
                />
                <span className="font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Point d'origine et source */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Point d'origine précis</Label>
            <Input 
              value={formData.origin_area}
              onChange={(e) => setFormData({...formData, origin_area: e.target.value})}
              placeholder="Ex: Cuisine, près du four"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Source de chaleur (ignition)</Label>
            <select
              value={formData.ignition_source}
              onChange={(e) => setFormData({...formData, ignition_source: e.target.value})}
              disabled={!canEdit}
              className="w-full p-2 border rounded-md"
            >
              <option value="">Sélectionner...</option>
              <option value="electrique">Électrique (court-circuit, surcharge)</option>
              <option value="flamme_nue">Flamme nue (chandelle, allumette)</option>
              <option value="cigarette">Matériel pour fumeur</option>
              <option value="appareil_chauffage">Appareil de chauffage</option>
              <option value="cuisson">Équipement de cuisson</option>
              <option value="foudre">Foudre</option>
              <option value="friction">Friction mécanique</option>
              <option value="produit_chimique">Réaction chimique</option>
              <option value="autre">Autre</option>
              <option value="indetermine">Indéterminé</option>
            </select>
          </div>
        </div>
        
        {/* Matériau et détecteur */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Premier matériau enflammé</Label>
            <Input 
              value={formData.material_first_ignited}
              onChange={(e) => setFormData({...formData, material_first_ignited: e.target.value})}
              placeholder="Ex: Huile de cuisson, tissu, papier"
              disabled={!canEdit}
            />
          </div>
          <div>
            <Label>Statut du détecteur de fumée</Label>
            <select
              value={formData.smoke_detector_status}
              onChange={(e) => setFormData({...formData, smoke_detector_status: e.target.value})}
              disabled={!canEdit}
              className="w-full p-2 border rounded-md"
            >
              <option value="indetermine">Indéterminé</option>
              <option value="absent">Absent</option>
              <option value="present_fonctionnel">Présent - Fonctionnel</option>
              <option value="present_non_fonctionnel">Présent - Non fonctionnel</option>
            </select>
          </div>
        </div>
        
        {/* Officier enquêteur */}
        <div>
          <Label>Officier responsable de l'enquête</Label>
          <select
            value={formData.investigator_id}
            onChange={(e) => setFormData({...formData, investigator_id: e.target.value})}
            disabled={!canEdit}
            className="w-full p-2 border rounded-md"
          >
            <option value="">Sélectionner un officier...</option>
            {personnel.filter(p => p.role === 'admin' || p.role === 'superviseur').map(p => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom} - {p.matricule || 'N/A'}
              </option>
            ))}
          </select>
        </div>
        
        {/* Narratif */}
        <div>
          <Label>Description des circonstances (Narratif)</Label>
          <textarea
            value={formData.narrative}
            onChange={(e) => setFormData({...formData, narrative: e.target.value})}
            disabled={!canEdit}
            rows={6}
            className="w-full p-3 border rounded-md resize-none"
            placeholder="Décrivez en détail les circonstances de l'incendie, les éléments observés, les témoignages recueillis..."
          />
        </div>
        
        {/* Transfert Police */}
        {(formData.probable_cause === 'indeterminee' || formData.probable_cause === 'intentionnelle' || formData.transfert_police) && (
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-800 flex items-center gap-2">
              🚔 Transfert à la SQ/Police
            </h4>
            
            <label className="flex items-center gap-2">
              <input 
                type="checkbox"
                checked={formData.transfert_police}
                onChange={(e) => setFormData({...formData, transfert_police: e.target.checked})}
                disabled={!canEdit}
              />
              <span>Dossier transféré à la police</span>
            </label>
            
            {formData.transfert_police && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Date du transfert</Label>
                  <input
                    type="date"
                    value={formData.date_transfert}
                    onChange={(e) => setFormData({...formData, date_transfert: e.target.value})}
                    disabled={!canEdit}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
                <div>
                  <Label>No. dossier police</Label>
                  <Input 
                    value={formData.numero_dossier_police}
                    onChange={(e) => setFormData({...formData, numero_dossier_police: e.target.value})}
                    placeholder="Ex: 2024-12345"
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label>Motif du transfert</Label>
                  <Input 
                    value={formData.motif_transfert}
                    onChange={(e) => setFormData({...formData, motif_transfert: e.target.value})}
                    placeholder="Ex: Cause indéterminée"
                    disabled={!canEdit}
                  />
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Photos enquête */}
        <div className="border-t pt-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-medium text-gray-800">📷 Photos de l'enquête</h4>
            {canEdit && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? '⏳ Upload...' : '📷 Ajouter photo'}
                </Button>
              </div>
            )}
          </div>
          
          {photos.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">Aucune photo d'enquête</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {photos.map(photo => (
                <div key={photo.id} className="relative group">
                  <img 
                    src={photo.photo_base64} 
                    alt="Photo enquête" 
                    className="w-full h-24 object-cover rounded-lg border"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 rounded-b-lg">
                    {new Date(photo.timestamp).toLocaleString('fr-CA', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      day: '2-digit',
                      month: 'short'
                    })}
                  </div>
                  {canEdit && (
                    <button 
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Bouton sauvegarder */}
        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Enregistrement...' : '💾 Enregistrer le RCCI'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionRCCI;
