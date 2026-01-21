import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Composant de capture de signature
const SignatureCanvas = ({ onSave, label }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if (e.touches) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (hasSignature) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onSave(dataUrl);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSave(null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="border-2 border-gray-300 rounded-lg bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clear}>
        Effacer
      </Button>
    </div>
  );
};

const RemiseProprieteModal = ({ intervention, tenantSlug, user, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Énergies, 2: Accès, 3: Signatures
  const [gpsCoords, setGpsCoords] = useState({ latitude: null, longitude: null });
  const [existingRemises, setExistingRemises] = useState([]);
  
  // État du formulaire
  const [formData, setFormData] = useState({
    // Énergies
    electricite: 'en_fonction',
    gaz: 'en_fonction',
    eau: 'en_fonction',
    
    // Accès
    niveau_acces: 'vert',
    zone_interdite: '',
    
    // Propriétaire
    proprietaire_nom: '',
    proprietaire_email: '',
    proprietaire_accepte_email: false,
    proprietaire_confirme_avertissements: true,
    proprietaire_comprend_interdiction: false,
    
    // Officier
    officier_nom: `${user?.prenom || ''} ${user?.nom || ''}`.trim(),
    officier_signature: null,
    proprietaire_signature: null,
    
    // Refus
    refus_de_signer: false,
    temoin_nom: ''
  });

  const API = `${BACKEND_URL}/api/${tenantSlug}`;
  
  const getToken = () => localStorage.getItem(`${tenantSlug}_token`) || localStorage.getItem('token');

  // Récupérer la position GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => console.log('GPS non disponible:', error),
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
          setExistingRemises(data.remises || []);
        }
      } catch (error) {
        console.error('Erreur chargement remises:', error);
      }
    };
    fetchRemises();
  }, [intervention.id]);

  const handleSubmit = async () => {
    // Validations
    if (!formData.officier_signature) {
      toast.error('La signature de l\'officier est requise');
      return;
    }
    if (!formData.refus_de_signer && !formData.proprietaire_signature) {
      toast.error('La signature du propriétaire est requise (ou cochez "Refus de signer")');
      return;
    }
    if (formData.refus_de_signer && !formData.temoin_nom) {
      toast.error('Le nom du témoin est requis en cas de refus de signer');
      return;
    }
    if (!formData.proprietaire_nom) {
      toast.error('Le nom du propriétaire est requis');
      return;
    }
    if (formData.niveau_acces === 'rouge' && !formData.proprietaire_comprend_interdiction && !formData.refus_de_signer) {
      toast.error('Le propriétaire doit confirmer qu\'il comprend l\'interdiction d\'accès');
      return;
    }

    setLoading(true);
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
        toast.success(result.email_envoye 
          ? 'Remise de propriété enregistrée et email envoyé' 
          : 'Remise de propriété enregistrée'
        );
        
        // Télécharger le PDF
        if (result.pdf_base64) {
          const link = document.createElement('a');
          link.href = `data:application/pdf;base64,${result.pdf_base64}`;
          link.download = `remise_propriete_${intervention.external_call_id || 'NA'}.pdf`;
          link.click();
        }
        
        onSuccess?.();
        onClose();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const downloadExistingPdf = async (remise) => {
    try {
      const response = await fetch(
        `${API}/interventions/${intervention.id}/remise-propriete/${remise.id}/pdf`,
        { headers: { 'Authorization': `Bearer ${getToken()}` } }
      );
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
      toast.error('Erreur téléchargement PDF');
    }
  };

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 100001 }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 text-white p-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">📋 Remise de propriété</h2>
              <p className="text-orange-100">
                Intervention #{intervention.external_call_id} - {intervention.address_full || intervention.address_street}
              </p>
            </div>
            <button onClick={onClose} className="text-white hover:text-orange-200 text-2xl">&times;</button>
          </div>
        </div>

        {/* Remises existantes */}
        {existingRemises.length > 0 && (
          <div className="bg-blue-50 p-3 border-b">
            <p className="text-sm font-medium text-blue-800 mb-2">
              📄 {existingRemises.length} remise(s) déjà enregistrée(s) pour cette intervention
            </p>
            <div className="flex flex-wrap gap-2">
              {existingRemises.map(r => (
                <button
                  key={r.id}
                  onClick={() => downloadExistingPdf(r)}
                  className="text-xs bg-white px-2 py-1 rounded border border-blue-200 hover:bg-blue-100"
                >
                  📥 {new Date(r.created_at).toLocaleDateString()} - {r.proprietaire_nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Étapes */}
        <div className="bg-gray-100 p-3 border-b flex gap-2">
          {[
            { num: 1, label: 'Énergies' },
            { num: 2, label: 'Accès' },
            { num: 3, label: 'Signatures' }
          ].map(s => (
            <button
              key={s.num}
              onClick={() => setStep(s.num)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                step === s.num 
                  ? 'bg-red-600 text-white' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.num}. {s.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Étape 1: Énergies */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                ⚡ État des énergies et services
              </h3>
              
              {/* Électricité */}
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <label className="block font-medium text-gray-700 mb-3">ÉLECTRICITÉ</label>
                <div className="space-y-2">
                  {[
                    { value: 'en_fonction', label: 'Laissée en fonction' },
                    { value: 'coupee_panneau', label: 'Coupée au panneau principal' },
                    { value: 'coupee_hydro', label: 'Coupée par Hydro-Québec (Compteur retiré/isolé)' }
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="electricite"
                        value={opt.value}
                        checked={formData.electricite === opt.value}
                        onChange={(e) => setFormData({...formData, electricite: e.target.value})}
                        className="w-4 h-4 text-red-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {formData.electricite !== 'en_fonction' && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
                    ⚠️ L'électricité ne doit être rétablie que par un maître électricien certifié.
                  </p>
                )}
              </div>

              {/* Gaz */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <label className="block font-medium text-gray-700 mb-3">GAZ (Naturel/Propane)</label>
                <div className="space-y-2">
                  {[
                    { value: 'en_fonction', label: 'Laissé en fonction' },
                    { value: 'ferme_valve', label: 'Fermé à la valve extérieure/réservoir' },
                    { value: 'verrouille', label: 'Compteur verrouillé/retiré par le distributeur' }
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gaz"
                        value={opt.value}
                        checked={formData.gaz === opt.value}
                        onChange={(e) => setFormData({...formData, gaz: e.target.value})}
                        className="w-4 h-4 text-red-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {formData.gaz !== 'en_fonction' && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
                    ⚠️ Ne jamais réouvrir une valve de gaz fermée. Seul le distributeur ou un technicien certifié est autorisé.
                  </p>
                )}
              </div>

              {/* Eau */}
              <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                <label className="block font-medium text-gray-700 mb-3">EAU</label>
                <div className="space-y-2">
                  {[
                    { value: 'en_fonction', label: 'Laissée en fonction' },
                    { value: 'fermee', label: 'Fermée à l\'entrée d\'eau principale' }
                  ].map(opt => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="eau"
                        value={opt.value}
                        checked={formData.eau === opt.value}
                        onChange={(e) => setFormData({...formData, eau: e.target.value})}
                        className="w-4 h-4 text-red-600"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Étape 2: Accès */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                🚧 Autorisation d'accès et sécurité
              </h3>
              
              <div className="space-y-4">
                {/* Rouge */}
                <label 
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.niveau_acces === 'rouge' 
                      ? 'border-red-500 bg-red-50' 
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="niveau_acces"
                      value="rouge"
                      checked={formData.niveau_acces === 'rouge'}
                      onChange={(e) => setFormData({...formData, niveau_acces: e.target.value})}
                      className="mt-1 w-5 h-5 text-red-600"
                    />
                    <div>
                      <span className="text-xl">🔴</span>
                      <span className="font-bold text-red-700 ml-2">ACCÈS INTERDIT (DANGER)</span>
                      <p className="text-sm text-gray-600 mt-1">
                        L'accès au bâtiment est strictement interdit. La structure est instable ou présente un danger immédiat.
                      </p>
                      <p className="text-sm text-red-600 mt-1 font-medium">
                        Action requise: Sécuriser le périmètre (clôture) et contacter un ingénieur en structure.
                      </p>
                    </div>
                  </div>
                </label>

                {/* Jaune */}
                <label 
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.niveau_acces === 'jaune' 
                      ? 'border-yellow-500 bg-yellow-50' 
                      : 'border-gray-200 hover:border-yellow-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="niveau_acces"
                      value="jaune"
                      checked={formData.niveau_acces === 'jaune'}
                      onChange={(e) => setFormData({...formData, niveau_acces: e.target.value})}
                      className="mt-1 w-5 h-5 text-yellow-600"
                    />
                    <div className="flex-1">
                      <span className="text-xl">🟡</span>
                      <span className="font-bold text-yellow-700 ml-2">ACCÈS RESTREINT (Temporaire/Partiel)</span>
                      <p className="text-sm text-gray-600 mt-1">
                        L'accès est limité pour récupération de biens essentiels sous supervision. L'occupation (dormir sur place) est interdite.
                      </p>
                    </div>
                  </div>
                </label>
                
                {formData.niveau_acces === 'jaune' && (
                  <div className="ml-8 mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zones spécifiques interdites (optionnel)
                    </label>
                    <Input
                      value={formData.zone_interdite}
                      onChange={(e) => setFormData({...formData, zone_interdite: e.target.value})}
                      placeholder="Ex: sous-sol, 2e étage, cuisine"
                    />
                  </div>
                )}

                {/* Vert */}
                <label 
                  className={`block p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.niveau_acces === 'vert' 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="niveau_acces"
                      value="vert"
                      checked={formData.niveau_acces === 'vert'}
                      onChange={(e) => setFormData({...formData, niveau_acces: e.target.value})}
                      className="mt-1 w-5 h-5 text-green-600"
                    />
                    <div>
                      <span className="text-xl">🟢</span>
                      <span className="font-bold text-green-700 ml-2">RÉINTÉGRATION POSSIBLE</span>
                      <p className="text-sm text-gray-600 mt-1">
                        Le service incendie n'émet aucune contre-indication à la réintégration, sous réserve des vérifications d'usage.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {/* Clause légale */}
              <div className="bg-gray-50 p-4 rounded-lg border mt-6">
                <h4 className="font-semibold text-gray-800 mb-2">📜 Transfert de responsabilité</h4>
                <p className="text-sm text-gray-600">
                  <strong>Transfert de garde:</strong> La garde juridique des lieux, incluant la responsabilité de la sécurité du site et des biens, 
                  est officiellement remise au propriétaire/occupant signataire.
                </p>
                <p className="text-sm text-gray-600 mt-2">
                  <strong>Exonération:</strong> Le Service de sécurité incendie et la municipalité se dégagent de toute responsabilité concernant:
                  le vol, le vandalisme, les dommages climatiques ou la détérioration des biens.
                </p>
              </div>
            </div>
          )}

          {/* Étape 3: Signatures */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">
                ✍️ Signatures
              </h3>
              
              {/* GPS */}
              {gpsCoords.latitude && (
                <div className="bg-green-50 p-3 rounded-lg text-sm text-green-700">
                  📍 Position GPS enregistrée: {gpsCoords.latitude.toFixed(6)}, {gpsCoords.longitude.toFixed(6)}
                </div>
              )}

              {/* Signature Officier */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-gray-800 mb-3">Officier responsable (SSI)</h4>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'officier</label>
                  <Input
                    value={formData.officier_nom}
                    onChange={(e) => setFormData({...formData, officier_nom: e.target.value})}
                    placeholder="Nom complet"
                  />
                </div>
                <SignatureCanvas 
                  label="Signature de l'officier *"
                  onSave={(sig) => setFormData({...formData, officier_signature: sig})}
                />
              </div>

              {/* Propriétaire */}
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <h4 className="font-semibold text-gray-800 mb-3">Propriétaire / Représentant</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom du propriétaire *</label>
                    <Input
                      value={formData.proprietaire_nom}
                      onChange={(e) => setFormData({...formData, proprietaire_nom: e.target.value})}
                      placeholder="Nom complet"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Courriel (optionnel)</label>
                    <Input
                      type="email"
                      value={formData.proprietaire_email}
                      onChange={(e) => setFormData({...formData, proprietaire_email: e.target.value})}
                      placeholder="email@exemple.com"
                    />
                  </div>
                </div>

                {formData.proprietaire_email && (
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.proprietaire_accepte_email}
                      onChange={(e) => setFormData({...formData, proprietaire_accepte_email: e.target.checked})}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="text-sm">J'accepte de recevoir une copie par courriel</span>
                  </label>
                )}

                <label className="flex items-start gap-2 mb-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.proprietaire_confirme_avertissements}
                    onChange={(e) => setFormData({...formData, proprietaire_confirme_avertissements: e.target.checked})}
                    className="mt-1 w-4 h-4 text-red-600"
                  />
                  <span className="text-sm">
                    Je confirme avoir reçu la garde des lieux et pris connaissance des avertissements de sécurité 
                    (notamment sur l'électricité et la structure).
                  </span>
                </label>

                {formData.niveau_acces === 'rouge' && !formData.refus_de_signer && (
                  <label className="flex items-start gap-2 mb-4 cursor-pointer bg-red-100 p-3 rounded-lg">
                    <input
                      type="checkbox"
                      checked={formData.proprietaire_comprend_interdiction}
                      onChange={(e) => setFormData({...formData, proprietaire_comprend_interdiction: e.target.checked})}
                      className="mt-1 w-4 h-4 text-red-600"
                    />
                    <span className="text-sm text-red-800 font-medium">
                      ⚠️ Je comprends qu'il est criminel ou passible d'amende de pénétrer dans un périmètre de sécurité fermé.
                    </span>
                  </label>
                )}

                {/* Refus de signer */}
                <div className="border-t pt-4 mt-4">
                  <label className="flex items-center gap-2 mb-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.refus_de_signer}
                      onChange={(e) => setFormData({...formData, refus_de_signer: e.target.checked, proprietaire_signature: null})}
                      className="w-4 h-4 text-red-600"
                    />
                    <span className="text-sm font-medium text-red-600">Le propriétaire refuse de signer</span>
                  </label>

                  {formData.refus_de_signer ? (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom du témoin *</label>
                      <Input
                        value={formData.temoin_nom}
                        onChange={(e) => setFormData({...formData, temoin_nom: e.target.value})}
                        placeholder="Nom d'un autre pompier témoin"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        L'avis sera inscrit comme "remis verbalement, refus de signer"
                      </p>
                    </div>
                  ) : (
                    <SignatureCanvas 
                      label="Signature du propriétaire *"
                      onSave={(sig) => setFormData({...formData, proprietaire_signature: sig})}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 p-4 border-t flex justify-between items-center">
          <div className="flex gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                ← Précédent
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)}>
                Suivant →
              </Button>
            ) : (
              <Button 
                onClick={handleSubmit} 
                disabled={loading}
                className="bg-red-600 hover:bg-red-700"
              >
                {loading ? '⏳ Génération...' : '✅ Enregistrer et générer PDF'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default RemiseProprieteModal;
