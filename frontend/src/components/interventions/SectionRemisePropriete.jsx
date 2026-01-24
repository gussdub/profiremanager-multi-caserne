import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import SignatureCanvas from 'react-signature-canvas';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SectionRemisePropriete = ({ intervention, tenantSlug, user, getToken, toast, canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [remises, setRemises] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [gpsCoords, setGpsCoords] = useState({ latitude: null, longitude: null });
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    electricite: 'en_fonction',
    gaz: 'en_fonction',
    eau: 'en_fonction',
    niveau_acces: 'vert',
    zone_interdite: '',
    proprietaire_nom: '',
    proprietaire_email: '',
    proprietaire_accepte_email: false,
    proprietaire_confirme_avertissements: true,
    proprietaire_comprend_interdiction: false,
    officier_nom: `${user?.prenom || ''} ${user?.nom || ''}`.trim(),
    officier_signature: null,
    proprietaire_signature: null,
    refus_de_signer: false,
    temoin_nom: ''
  });
  
  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  // Récupérer GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setGpsCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => {},
        { enableHighAccuracy: true }
      );
    }
  }, []);
  
  // Charger les remises existantes
  useEffect(() => {
    const fetchRemises = async () => {
      try {
        const response = await fetch(`${API}/interventions/${intervention.id}/remises-propriete`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (response.ok) {
          const data = await response.json();
          setRemises(data.remises || []);
        }
      } catch (error) {
        console.error('Erreur chargement remises:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRemises();
  }, [intervention.id, tenantSlug]);
  
  const handleDownloadPdf = async (remise) => {
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/remise-propriete/${remise.id}/pdf`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `remise_propriete_${remise.id.slice(0, 8)}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      toast?.({ title: 'Erreur téléchargement PDF', variant: 'destructive' });
    }
  };
  
  const handleSubmit = async () => {
    if (!formData.officier_signature) {
      toast?.({ title: 'La signature de l\'officier est requise', variant: 'destructive' });
      return;
    }
    if (!formData.refus_de_signer && !formData.proprietaire_signature) {
      toast?.({ title: 'La signature du propriétaire est requise', variant: 'destructive' });
      return;
    }
    if (formData.refus_de_signer && !formData.temoin_nom) {
      toast?.({ title: 'Le nom du témoin est requis', variant: 'destructive' });
      return;
    }
    if (!formData.proprietaire_nom) {
      toast?.({ title: 'Le nom du propriétaire est requis', variant: 'destructive' });
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/interventions/${intervention.id}/remise-propriete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intervention_id: intervention.id,
          ...formData,
          latitude: gpsCoords.latitude,
          longitude: gpsCoords.longitude
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        toast?.({ title: result.email_envoye ? 'Remise enregistrée et email envoyé' : 'Remise enregistrée', variant: 'success' });
        
        if (result.pdf_base64) {
          const link = document.createElement('a');
          link.href = `data:application/pdf;base64,${result.pdf_base64}`;
          link.download = `remise_propriete_${intervention.external_call_id || 'NA'}.pdf`;
          link.click();
        }
        
        setShowForm(false);
        // Recharger les remises
        const refreshRes = await fetch(`${API}/interventions/${intervention.id}/remises-propriete`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setRemises(data.remises || []);
        }
      } else {
        const error = await response.json();
        toast?.({ title: error.detail || 'Erreur', variant: 'destructive' });
      }
    } catch (error) {
      toast?.({ title: 'Erreur de connexion', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };
  
  // Composant signature avec prévisualisation
  const SignaturePad = ({ onSave, label, existingSignature }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [savedSignature, setSavedSignature] = useState(existingSignature || null);
    const [isEditing, setIsEditing] = useState(!existingSignature);
    
    useEffect(() => {
      if (isEditing && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }, [isEditing]);
    
    const getCoords = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };
    
    const start = (e) => { 
      e.preventDefault(); 
      const {x, y} = getCoords(e); 
      canvasRef.current.getContext('2d').beginPath(); 
      canvasRef.current.getContext('2d').moveTo(x, y); 
      setIsDrawing(true); 
      setHasDrawn(true);
    };
    
    const draw = (e) => { 
      if (!isDrawing) return; 
      e.preventDefault(); 
      const {x, y} = getCoords(e); 
      canvasRef.current.getContext('2d').lineTo(x, y); 
      canvasRef.current.getContext('2d').stroke(); 
    };
    
    const stop = () => { 
      if (isDrawing && hasDrawn) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        setSavedSignature(dataUrl);
        onSave(dataUrl);
      }
      setIsDrawing(false); 
    };
    
    const clear = () => { 
      const ctx = canvasRef.current.getContext('2d'); 
      ctx.fillStyle = 'white'; 
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); 
      setSavedSignature(null);
      setHasDrawn(false);
      onSave(null); 
    };
    
    const confirmSignature = () => {
      if (savedSignature) {
        setIsEditing(false);
      }
    };
    
    const editSignature = () => {
      setIsEditing(true);
      setHasDrawn(false);
    };
    
    // Afficher la prévisualisation si signature existante et pas en mode édition
    if (savedSignature && !isEditing) {
      return (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">{label}</label>
          <div className="border-2 border-green-300 rounded-lg bg-green-50 p-2">
            <img src={savedSignature} alt="Signature" className="max-h-24 mx-auto" />
          </div>
          <div className="flex gap-2">
            <span className="text-sm text-green-600">✅ Signature enregistrée</span>
            <button type="button" onClick={editSignature} className="text-sm text-blue-600 hover:text-blue-800 underline">
              Modifier
            </button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <div className="border-2 border-gray-300 rounded-lg bg-white">
          <canvas 
            ref={canvasRef} 
            width={350} 
            height={120} 
            className="w-full touch-none cursor-crosshair" 
            onMouseDown={start} 
            onMouseMove={draw} 
            onMouseUp={stop} 
            onMouseLeave={stop} 
            onTouchStart={start} 
            onTouchMove={draw} 
            onTouchEnd={stop} 
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={clear} className="text-sm text-gray-600 hover:text-gray-800">
            Effacer
          </button>
          {hasDrawn && savedSignature && (
            <button type="button" onClick={confirmSignature} className="text-sm text-green-600 hover:text-green-800 font-medium">
              ✅ Confirmer la signature
            </button>
          )}
        </div>
      </div>
    );
  };
  
  if (loading) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div></div>;
  }
  
  return (
    <div className="space-y-6">
      {/* Liste des remises existantes */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-800">📋 Remises de propriété</h3>
          {canEdit && (
            <button onClick={() => setShowForm(!showForm)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {showForm ? '✕ Annuler' : '+ Nouvelle remise'}
            </button>
          )}
        </div>
        
        {remises.length === 0 && !showForm ? (
          <p className="text-gray-500 text-center py-8">Aucune remise de propriété enregistrée pour cette intervention.</p>
        ) : (
          <div className="space-y-3">
            {remises.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div>
                  <span className="font-medium">{r.proprietaire_nom}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    {new Date(r.created_at).toLocaleString('fr-CA')}
                  </span>
                  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    r.niveau_acces === 'rouge' ? 'bg-red-100 text-red-800' :
                    r.niveau_acces === 'jaune' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {r.niveau_acces === 'rouge' ? '🔴 Interdit' : r.niveau_acces === 'jaune' ? '🟡 Restreint' : '🟢 OK'}
                  </span>
                  {r.refus_de_signer && <span className="ml-2 text-xs text-red-600">⚠️ Refus de signer</span>}
                </div>
                <button onClick={() => handleDownloadPdf(r)} className="text-blue-600 hover:text-blue-800 text-sm">
                  📥 PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Formulaire nouvelle remise */}
      {showForm && (
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-6 space-y-6">
          <h4 className="font-semibold text-orange-800">Nouvelle remise de propriété</h4>
          
          {/* GPS */}
          {gpsCoords.latitude && (
            <div className="bg-green-100 text-green-800 text-sm p-2 rounded">
              📍 Position GPS: {gpsCoords.latitude.toFixed(5)}, {gpsCoords.longitude.toFixed(5)}
            </div>
          )}
          
          {/* Énergies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">⚡ Électricité</label>
              <select value={formData.electricite} onChange={(e) => setFormData({...formData, electricite: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="coupee_panneau">Coupée au panneau</option>
                <option value="coupee_hydro">Coupée par Hydro-Québec</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">🔥 Gaz</label>
              <select value={formData.gaz} onChange={(e) => setFormData({...formData, gaz: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="ferme_valve">Fermé à la valve</option>
                <option value="verrouille">Compteur verrouillé</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">💧 Eau</label>
              <select value={formData.eau} onChange={(e) => setFormData({...formData, eau: e.target.value})} className="w-full p-2 border rounded">
                <option value="en_fonction">En fonction</option>
                <option value="fermee">Fermée</option>
              </select>
            </div>
          </div>
          
          {/* Niveau d'accès */}
          <div>
            <label className="block text-sm font-medium mb-2">🚧 Niveau d'accès</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'rouge', label: '🔴 INTERDIT', desc: 'Danger - Structure instable', color: 'border-red-500 bg-red-50' },
                { value: 'jaune', label: '🟡 RESTREINT', desc: 'Récupération limitée', color: 'border-yellow-500 bg-yellow-50' },
                { value: 'vert', label: '🟢 OK', desc: 'Réintégration possible', color: 'border-green-500 bg-green-50' }
              ].map(opt => (
                <label key={opt.value} className={`block p-3 rounded-lg border-2 cursor-pointer ${formData.niveau_acces === opt.value ? opt.color : 'border-gray-200'}`}>
                  <input type="radio" name="niveau_acces" value={opt.value} checked={formData.niveau_acces === opt.value} onChange={(e) => setFormData({...formData, niveau_acces: e.target.value})} className="sr-only" />
                  <span className="font-bold">{opt.label}</span>
                  <span className="block text-xs text-gray-600">{opt.desc}</span>
                </label>
              ))}
            </div>
            {formData.niveau_acces === 'jaune' && (
              <input type="text" value={formData.zone_interdite} onChange={(e) => setFormData({...formData, zone_interdite: e.target.value})} placeholder="Zones interdites (ex: sous-sol, 2e étage)" className="mt-2 w-full p-2 border rounded" />
            )}
          </div>
          
          {/* Propriétaire */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom du propriétaire *</label>
              <input type="text" value={formData.proprietaire_nom} onChange={(e) => setFormData({...formData, proprietaire_nom: e.target.value})} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Courriel</label>
              <input type="email" value={formData.proprietaire_email} onChange={(e) => setFormData({...formData, proprietaire_email: e.target.value})} className="w-full p-2 border rounded" />
            </div>
          </div>
          
          {formData.proprietaire_email && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.proprietaire_accepte_email} onChange={(e) => setFormData({...formData, proprietaire_accepte_email: e.target.checked})} />
              <span className="text-sm">Envoyer une copie par courriel</span>
            </label>
          )}
          
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={formData.proprietaire_confirme_avertissements} onChange={(e) => setFormData({...formData, proprietaire_confirme_avertissements: e.target.checked})} />
            <span className="text-sm">Le propriétaire confirme avoir reçu les avertissements de sécurité</span>
          </label>
          
          {formData.niveau_acces === 'rouge' && (
            <label className="flex items-center gap-2 bg-red-100 p-2 rounded">
              <input type="checkbox" checked={formData.proprietaire_comprend_interdiction} onChange={(e) => setFormData({...formData, proprietaire_comprend_interdiction: e.target.checked})} />
              <span className="text-sm text-red-800 font-medium">⚠️ Le propriétaire comprend que l'accès est interdit</span>
            </label>
          )}
          
          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Officier: {formData.officier_nom}</label>
              <SignaturePad 
                label="Signature de l'officier *" 
                existingSignature={formData.officier_signature}
                onSave={(sig) => setFormData({...formData, officier_signature: sig})} 
              />
            </div>
            
            <div>
              <label className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={formData.refus_de_signer} onChange={(e) => setFormData({...formData, refus_de_signer: e.target.checked, proprietaire_signature: null})} />
                <span className="text-sm text-red-600 font-medium">Refus de signer</span>
              </label>
              
              {formData.refus_de_signer ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Nom du témoin *</label>
                  <input type="text" value={formData.temoin_nom} onChange={(e) => setFormData({...formData, temoin_nom: e.target.value})} className="w-full p-2 border rounded" placeholder="Nom d'un autre pompier" />
                </div>
              ) : (
                <SignaturePad 
                  label="Signature du propriétaire *" 
                  existingSignature={formData.proprietaire_signature}
                  onSave={(sig) => setFormData({...formData, proprietaire_signature: sig})} 
                />
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded hover:bg-gray-50">Annuler</button>
            <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
              {submitting ? '⏳ Génération...' : '✅ Enregistrer et générer PDF'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SectionRemisePropriete;
