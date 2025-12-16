import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';

// Fonction utilitaire pour parser une date ISO en timezone locale Canada (EST = UTC-5)
const parseDateLocal = (dateStr) => {
  if (!dateStr) return null;
  try {
    // Parser la date ISO et convertir en heure locale Canada (UTC-5)
    const dt = new Date(dateStr);
    // Ajuster pour le fuseau horaire du Canada (EST = UTC-5)
    const offset = dt.getTimezoneOffset(); // Offset en minutes
    const localTime = new Date(dt.getTime() - (5 * 60 * 60 * 1000)); // Soustraire 5 heures
    return localTime;
  } catch (e) {
    // Fallback: parser YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
};

// Fonction pour récupérer l'adresse à partir des coordonnées GPS (reverse geocoding)
const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    // Utiliser Nominatim (OpenStreetMap) pour le reverse geocoding (gratuit)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'ProFireManager-App'
        }
      }
    );
    const data = await response.json();
    
    if (data && data.address) {
      const addr = data.address;
      // Construire une adresse lisible
      const parts = [];
      if (addr.house_number) parts.push(addr.house_number);
      if (addr.road) parts.push(addr.road);
      if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
      if (addr.state) parts.push(addr.state);
      
      return parts.join(', ') || data.display_name;
    }
    return `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch (error) {
    console.error('Erreur récupération adresse:', error);
    return `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
};

const HistoriqueRondesSecurite = ({ vehicule, onClose, onContreSignerClick }) => {
  const { tenantSlug } = useTenant();
  const [rondes, setRondes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRondes();
  }, []);

  const fetchRondes = async () => {
    setLoading(true);
    try {
      const data = await apiGet(tenantSlug, `/actifs/rondes-securite?vehicule_id=${vehicule.id}`);
      setRondes(data);
    } catch (error) {
      console.error('Erreur lors du chargement des rondes:', error);
      alert('❌ Erreur lors du chargement des rondes');
    } finally {
      setLoading(false);
    }
  };

 

  const calculerStatutRonde = (ronde) => {
    const rondeDateTime = new Date(`${ronde.date}T${ronde.heure}`);
    const now = new Date();
    const diffMs = now - rondeDateTime;
    const diffHeures = diffMs / (1000 * 60 * 60);
    const diffJours = diffMs / (1000 * 60 * 60 * 24);

    if (diffHeures < 24) {
      const heuresRestantes = Math.floor(24 - diffHeures);
      return {
        valide: true,
        label: `✅ Valide (${heuresRestantes}h restantes)`,
        color: '#28a745',
        canCounterSign: ronde.contre_signatures?.length === 0
      };
    } else if (diffJours < 7) {
      const joursDepuis = Math.floor(diffJours);
      return {
        valide: false,
        label: `⏰ Expirée (il y a ${joursDepuis}j)`,
        color: '#ffc107',
        canCounterSign: false
      };
    } else {
      const joursDepuis = Math.floor(diffJours);
      return {
        valide: false,
        label: `❌ Expirée (il y a ${joursDepuis}j)`,
        color: '#dc3545',
        canCounterSign: false
      };
    }
  };

  const calculerProchaineRondeObligatoire = () => {
    if (rondes.length === 0) return null;

    const derniereRonde = rondes[0]; // déjà triée par date décroissante
    const derniereDateTime = new Date(`${derniereRonde.date}T${derniereRonde.heure}`);
    const prochaineDateLimite = new Date(derniereDateTime.getTime() + (7 * 24 * 60 * 60 * 1000));
    const now = new Date();
    const diffMs = prochaineDateLimite - now;
    const joursRestants = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (joursRestants <= 0) {
      return {
        urgent: true,
        message: '🚨 Ronde obligatoire MAINTENANT (véhicule stationné > 7 jours)'
      };
    } else if (joursRestants <= 2) {
      return {
        urgent: true,
        message: `⚠️ Ronde obligatoire dans ${joursRestants} jour(s) (véhicule stationné)`
      };
    } else {
      return {
        urgent: false,
        message: `📅 Prochaine ronde obligatoire dans ${joursRestants} jours (véhicule stationné)`
      };
    }
  };

  const nombreDefectueux = (pointsVerification) => {
    return Object.values(pointsVerification).filter(v => v === 'defectueux').length;
  };

  const prochaineRonde = calculerProchaineRondeObligatoire();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>📝 Historique rondes de sécurité - {vehicule.nom}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Alerte prochaine ronde obligatoire */}
          {prochaineRonde && (
            <div style={{ 
              background: prochaineRonde.urgent ? '#fff3cd' : '#e7f3ff', 
              border: `2px solid ${prochaineRonde.urgent ? '#ffc107' : '#0dcaf0'}`,
              padding: '15px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {prochaineRonde.message}
            </div>
          )}

          {/* Informations du véhicule */}
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '14px' }}>
              <div><strong>Type:</strong> {vehicule.type_vehicule}</div>
              <div><strong>Marque:</strong> {vehicule.marque}</div>
              <div><strong>Année:</strong> {vehicule.annee}</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <p>Chargement...</p>
            </div>
          ) : rondes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6c757d' }}>
              <p>📋 Aucune ronde de sécurité enregistrée pour ce véhicule</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {rondes.map((ronde) => {
                const statut = calculerStatutRonde(ronde);
                const defectueux = nombreDefectueux(ronde.points_verification);
                
                return (
                  <div 
                    key={ronde.id} 
                    style={{ 
                      border: `2px solid ${statut.color}`,
                      borderRadius: '10px',
                      padding: '20px',
                      background: '#fff'
                    }}
                  >
                    {/* En-tête de la ronde */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
                          📅 {parseDateLocal(ronde.date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <div style={{ color: '#6c757d', fontSize: '14px' }}>
                          🕐 {ronde.heure} • 📍 {ronde.lieu} • 🛣️ {ronde.km} km
                        </div>
                      </div>
                      <div style={{ 
                        background: statut.color, 
                        color: 'white', 
                        padding: '8px 15px', 
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}>
                        {statut.label}
                      </div>
                    </div>

                    {/* Personne mandatée */}
                    <div style={{ marginBottom: '15px' }}>
                      <strong>👤 Personne mandatée:</strong> {ronde.personne_mandatee}
                    </div>

                    {/* Résumé vérification */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: '10px', 
                      marginBottom: '15px',
                      padding: '12px',
                      background: defectueux > 0 ? '#fff3cd' : '#d1e7dd',
                      borderRadius: '6px'
                    }}>
                      <div>
                        <strong>✅ Conformes:</strong> {19 - defectueux}/19
                      </div>
                      <div>
                        <strong>❌ Défectueux:</strong> {defectueux}/19
                      </div>
                    </div>

                    {/* Défectuosités */}
                    {ronde.defectuosites && (
                      <div style={{ marginBottom: '15px' }}>
                        <strong>📝 Défectuosités:</strong>
                        <div style={{ 
                          background: '#f8f9fa', 
                          padding: '10px', 
                          borderRadius: '6px', 
                          marginTop: '5px',
                          fontSize: '14px'
                        }}>
                          {ronde.defectuosites}
                        </div>
                      </div>
                    )}

                    {/* Contre-signatures */}
                    {ronde.contre_signatures && ronde.contre_signatures.length > 0 && (
                      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #dee2e6' }}>
                        <strong>✍️ Contre-signatures:</strong>
                        {ronde.contre_signatures.map((cs, index) => (
                          <div key={index} style={{ 
                            background: '#e7f3ff', 
                            padding: '10px', 
                            borderRadius: '6px', 
                            marginTop: '8px',
                            fontSize: '14px'
                          }}>
                            👤 {cs.prenom_conducteur} {cs.nom_conducteur} • 
                            📅 {new Date(cs.date_contre_signature).toLocaleDateString('fr-FR')} à {new Date(cs.date_contre_signature).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Boutons d'action */}
                    <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #dee2e6' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: statut.canCounterSign ? '1fr 1fr' : '1fr', gap: '10px' }}>
                        {/* Bouton PDF */}
                        <Button
                          onClick={async () => {
                            try {
                              const token = localStorage.getItem(`${tenantSlug}_token`);
                              const response = await fetch(
                                `${process.env.REACT_APP_BACKEND_URL}/api/${tenantSlug}/actifs/rondes-securite/${ronde.id}/export-pdf`,
                                {
                                  headers: {
                                    'Authorization': `Bearer ${token}`
                                  }
                                }
                              );
                              
                              if (!response.ok) throw new Error('Erreur téléchargement PDF');
                              
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `ronde_securite_${vehicule.nom}_${ronde.date}.pdf`;
                              document.body.appendChild(a);
                              a.click();
                              window.URL.revokeObjectURL(url);
                              document.body.removeChild(a);
                            } catch (error) {
                              alert('❌ Erreur lors du téléchargement du PDF');
                            }
                          }}
                          variant="outline"
                          style={{ width: '100%' }}
                        >
                          📄 PDF
                        </Button>
                        
                        {/* Bouton contre-signer */}
                        {statut.canCounterSign && (
                          <Button
                            onClick={() => onContreSignerClick(ronde)}
                            style={{ width: '100%', background: '#0d6efd' }}
                          >
                            ✍️ Signer
                          </Button>
                        )}
                      </div>
                      
                      {statut.canCounterSign && (
                        <p style={{ fontSize: '12px', color: '#6c757d', marginTop: '8px', textAlign: 'center' }}>
                          Si vous devez prendre ce véhicule, vous pouvez accepter cette ronde au lieu d&apos;en créer une nouvelle
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HistoriqueRondesSecurite;
