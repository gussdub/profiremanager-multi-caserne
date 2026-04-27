import React, { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import SignatureCanvas from 'react-signature-canvas';
import { useTenant } from '../contexts/TenantContext';
import { apiPost } from '../utils/api';

// Fonction utilitaire pour parser une date en tant que date LOCALE (sans décalage timezone)
const parseDateLocal = (dateStr) => {
  if (!dateStr) return new Date();
  try {
    // Si c'est juste une date YYYY-MM-DD, la parser comme date locale
    if (dateStr.length === 10 && dateStr.includes('-')) {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day); // Crée la date en heure locale
    }
    // Si c'est une date ISO complète avec 'Z', la convertir en locale
    if (dateStr.includes('T') && dateStr.includes('Z')) {
      const dt = new Date(dateStr);
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    // Si c'est une date ISO sans 'Z', l'utiliser telle quelle
    if (dateStr.includes('T')) {
      const dt = new Date(dateStr);
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    // Fallback
    return new Date(dateStr);
  } catch (e) {
    console.error('Erreur parsing date:', e);
    return new Date();
  }
};

const ContreSignatureModal = ({ ronde, vehicule, user, onClose, onSuccess, onRefuser }) => {
  const { tenantSlug } = useTenant();
  const signatureRef = useRef(null);
  const signatureContainerRef = useRef(null);
  const [mode, setMode] = useState('choix'); // 'choix', 'accepter', 'refuser'
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    nom_conducteur: user?.nom || '',
    prenom_conducteur: user?.prenom || '',
    raison_refus: ''
  });

  const clearSignature = () => {
    if (signatureRef.current) {
      signatureRef.current.clear();
    }
  };

  // Calculer la largeur du canvas dynamiquement pour éviter le décalage de la souris
  React.useEffect(() => {
    const updateCanvasWidth = () => {
      if (signatureContainerRef.current) {
        const containerWidth = signatureContainerRef.current.offsetWidth;
        // Soustraire les bordures (2px * 2 = 4px)
        setCanvasWidth(containerWidth > 0 ? containerWidth - 4 : 600);
      }
    };

    updateCanvasWidth();
    window.addEventListener('resize', updateCanvasWidth);
    
    const resizeObserver = new ResizeObserver(updateCanvasWidth);
    if (signatureContainerRef.current) {
      resizeObserver.observe(signatureContainerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateCanvasWidth);
      resizeObserver.disconnect();
    };
  }, []);

  const handleAccepter = async (e) => {
    e.preventDefault();

    if (!formData.nom_conducteur || !formData.prenom_conducteur) {
      alert('⚠️ Veuillez renseigner votre nom et prénom');
      return;
    }

    const signature = signatureRef.current?.toDataURL();
    if (!signature || signatureRef.current?.isEmpty()) {
      alert('⚠️ La signature est requise');
      return;
    }

    setSaving(true);

    try {
      await apiPost(tenantSlug, `/actifs/rondes-securite/${ronde.id}/contre-signer`, {
        nom_conducteur: formData.nom_conducteur,
        prenom_conducteur: formData.prenom_conducteur,
        signature: signature
      });

      alert('✅ Contre-signature enregistrée avec succès');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      const errorMessage = error.data?.detail || error.message || 'Erreur inconnue';
      alert('❌ ' + errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleRefuser = () => {
    if (!formData.raison_refus.trim()) {
      alert('⚠️ Veuillez indiquer la raison du refus');
      return;
    }
    if (onRefuser) {
      onRefuser(formData.raison_refus);
    }
    onClose();
  };

  const nombreDefectueux = Object.values(ronde.points_verification).filter(v => v === 'defectueux').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>✍️ Contre-signature de ronde - {vehicule.nom}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Détails de la ronde (lecture seule) */}
          <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '10px', marginBottom: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px' }}>📋 Détails de la ronde existante</h3>
            
            <div style={{ display: 'grid', gap: '10px', fontSize: '14px' }}>
              <div><strong>📅 Date:</strong> {parseDateLocal(ronde.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <div><strong>🕐 Heure:</strong> {ronde.heure}</div>
              <div><strong>📍 Lieu:</strong> {ronde.lieu}</div>
              <div><strong>🛣️ Kilométrage:</strong> {ronde.km} km</div>
              <div><strong>👤 Effectuée par:</strong> {ronde.personne_mandatee}</div>
              
              <div style={{ 
                marginTop: '10px',
                padding: '10px',
                background: nombreDefectueux > 0 ? '#fff3cd' : '#d1e7dd',
                borderRadius: '6px'
              }}>
                <strong>Résumé:</strong> {19 - nombreDefectueux} conforme(s) • {nombreDefectueux} défectueux
              </div>

              {ronde.defectuosites && (
                <div style={{ marginTop: '10px' }}>
                  <strong>📝 Défectuosités:</strong>
                  <div style={{ background: 'white', padding: '10px', borderRadius: '6px', marginTop: '5px' }}>
                    {ronde.defectuosites}
                  </div>
                </div>
              )}
            </div>
          </div>

          {mode === 'choix' && (
            <div>
              <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                <strong>💡 Choix à faire :</strong><br/>
                • <strong>Accepter :</strong> Vous acceptez cette ronde et la contre-signez (pas besoin d'en refaire une)<br/>
                • <strong>Refuser :</strong> Vous estimez devoir refaire une ronde complète
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <Button
                  onClick={() => setMode('accepter')}
                  style={{ padding: '20px', height: 'auto', background: '#28a745' }}
                >
                  <div style={{ fontSize: '16px' }}>✅ Accepter</div>
                  <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.9 }}>
                    Contre-signer la ronde
                  </div>
                </Button>

                <Button
                  onClick={() => setMode('refuser')}
                  variant="outline"
                  style={{ padding: '20px', height: 'auto', borderColor: '#dc3545', color: '#dc3545' }}
                >
                  <div style={{ fontSize: '16px' }}>❌ Refuser</div>
                  <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.9 }}>
                    Créer une nouvelle ronde
                  </div>
                </Button>
              </div>
            </div>
          )}

          {mode === 'accepter' && (
            <form onSubmit={handleAccepter}>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>✍️ Votre contre-signature</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                  <div>
                    <Label>Prénom *</Label>
                    <Input
                      type="text"
                      value={formData.prenom_conducteur}
                      onChange={(e) => setFormData({ ...formData, prenom_conducteur: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Nom *</Label>
                    <Input
                      type="text"
                      value={formData.nom_conducteur}
                      onChange={(e) => setFormData({ ...formData, nom_conducteur: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Signature *</Label>
                  <div 
                    ref={signatureContainerRef}
                    style={{ 
                      border: '2px solid #dee2e6', 
                      borderRadius: '8px', 
                      background: '#fff', 
                      maxWidth: '600px',
                      overflow: 'hidden'
                    }}
                  >
                    <SignatureCanvas
                      ref={signatureRef}
                      canvasProps={{
                        width: canvasWidth,
                        height: 150,
                        className: 'signature-canvas',
                        style: { 
                          display: 'block',
                          touchAction: 'none',
                          cursor: 'crosshair'
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearSignature}
                    style={{ marginTop: '5px' }}
                  >
                    🗑️ Effacer
                  </Button>
                </div>

                <div style={{ background: '#d1f2eb', padding: '12px', borderRadius: '6px', marginTop: '15px', fontSize: '13px' }}>
                  ✅ En signant, je confirme avoir pris connaissance de cette ronde et l'accepter pour prendre le véhicule.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Button type="button" variant="outline" onClick={() => setMode('choix')} disabled={saving}>
                  Retour
                </Button>
                <Button type="submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? '⏳ Enregistrement...' : '✅ Confirmer la contre-signature'}
                </Button>
              </div>
            </form>
          )}

          {mode === 'refuser' && (
            <div>
              <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
                ⚠️ Vous allez refuser cette ronde et devrez en créer une nouvelle complète.
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Label>Raison du refus *</Label>
                <Textarea
                  value={formData.raison_refus}
                  onChange={(e) => setFormData({ ...formData, raison_refus: e.target.value })}
                  placeholder="Expliquez pourquoi vous refusez cette ronde..."
                  rows={4}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <Button type="button" variant="outline" onClick={() => setMode('choix')}>
                  Retour
                </Button>
                <Button 
                  onClick={handleRefuser}
                  style={{ flex: 1, background: '#dc3545' }}
                >
                  ❌ Confirmer le refus et créer une nouvelle ronde
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContreSignatureModal;
