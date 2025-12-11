import React, { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';
import ImageUpload from './ImageUpload';

const InventaireVehiculeModal = ({ vehicule, user, onClose, onSuccess }) => {
  const { tenantSlug } = useTenant();
  const [loading, setLoading] = useState(false);
  const [modeles, setModeles] = useState([]);
  const [modeleSelectionne, setModeleSelectionne] = useState(null);
  const [itemsInventaire, setItemsInventaire] = useState([]);
  const [commentaire, setCommentaire] = useState('');
  const [heureDebut, setHeureDebut] = useState(null);

  useEffect(() => {
    fetchModeles();
  }, []);

  const fetchModeles = async () => {
    try {
      const data = await apiGet(tenantSlug, '/parametres/modeles-inventaires-vehicules');
      setModeles(data || []);
    } catch (error) {
      console.error('Erreur chargement modèles:', error);
    }
  };

  const handleSelectionModele = (modele) => {
    setModeleSelectionne(modele);
    setHeureDebut(new Date().toISOString()); // Démarrer le tracking
    
    // Initialiser les items avec le modèle
    const items = [];
    modele.sections.forEach(section => {
      section.items.forEach(item => {
        let initialValue;
        
        if (item.type_champ === 'checkbox') {
          initialValue = []; // Array pour multiple sélection
        } else if (item.type_champ === 'radio') {
          initialValue = item.options?.length > 0 ? item.options[0].label : '';
        } else if (item.type_champ === 'number') {
          initialValue = '0';
        } else if (item.type_champ === 'select') {
          initialValue = item.options?.length > 0 ? item.options[0].label : '';
        } else {
          initialValue = '';
        }
        
        items.push({
          section: section.titre,
          section_photo_url: section.photo_url,
          item_id: item.id,
          nom: item.nom,
          type_champ: item.type_champ || 'checkbox',
          photo_url: item.photo_url,
          options: item.options || [],
          obligatoire: item.obligatoire,
          valeur: initialValue, // Valeur saisie
          notes: '',
          photo_prise: '' // Photo prise pendant l'inventaire
        });
      });
    });
    setItemsInventaire(items);
  };

  const updateItemValeur = (index, valeur) => {
    const newItems = [...itemsInventaire];
    newItems[index].valeur = valeur;
    setItemsInventaire(newItems);
  };

  const updateItemNotes = (index, notes) => {
    const newItems = [...itemsInventaire];
    newItems[index].notes = notes;
    setItemsInventaire(newItems);
  };

  const updateItemPhoto = (index, photoUrl) => {
    const newItems = [...itemsInventaire];
    newItems[index].photo_prise = photoUrl;
    setItemsInventaire(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const heureFin = new Date().toISOString();
      
      const inventaireData = {
        vehicule_id: vehicule.id,
        modele_id: modeleSelectionne.id,
        date_inventaire: heureDebut,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        effectue_par: user.nom_complet || `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email,
        effectue_par_id: user.id,
        items_coches: itemsInventaire.map(item => ({
          item_id: item.item_id,
          nom: item.nom,
          type_champ: item.type_champ,
          valeur: item.valeur,
          notes: item.notes || '',
          photo_prise: item.photo_prise || ''
        })),
        notes_generales: commentaire
      };

      await apiPost(tenantSlug, `/vehicules/${vehicule.id}/inventaire`, inventaireData);
      
      alert('✅ Inventaire enregistré avec succès !');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Erreur enregistrement inventaire:', error);
      alert('❌ Erreur lors de l\'enregistrement de l\'inventaire');
    } finally {
      setLoading(false);
    }
  };

  // Grouper les items par section
  const itemsParSection = itemsInventaire.reduce((acc, item, index) => {
    if (!acc[item.section]) {
      acc[item.section] = [];
    }
    acc[item.section].push({ ...item, index });
    return acc;
  }, {});

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '2px solid #e9ecef',
          backgroundColor: '#8e44ad'
        }}>
          <h2 style={{ margin: 0, color: 'white', fontSize: '24px', fontWeight: 'bold' }}>
            📦 Inventaire - {vehicule.nom}
          </h2>
          <p style={{ margin: '8px 0 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '14px' }}>
            Vérifiez les équipements présents dans le véhicule
          </p>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px'
        }}>
          {!modeleSelectionne ? (
            // Sélection du modèle
            <div>
              <h3 style={{ marginBottom: '16px', color: '#2c3e50' }}>
                Sélectionnez un modèle d'inventaire :
              </h3>
              {modeles.length === 0 ? (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  color: '#6c757d'
                }}>
                  <p style={{ marginBottom: '16px', fontSize: '16px' }}>
                    Aucun modèle d'inventaire n'est configuré
                  </p>
                  <p style={{ fontSize: '14px' }}>
                    Allez dans <strong>Paramètres &gt; Inventaires</strong> pour créer un modèle
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {modeles.map(modele => (
                    <div
                      key={modele.id}
                      onClick={() => handleSelectionModele(modele)}
                      style={{
                        padding: '16px',
                        border: '2px solid #e9ecef',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#8e44ad';
                        e.currentTarget.style.backgroundColor = '#f8f4fc';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e9ecef';
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <h4 style={{ margin: 0, color: '#2c3e50', marginBottom: '8px' }}>
                        {modele.nom}
                      </h4>
                      {modele.description && (
                        <p style={{ margin: 0, color: '#6c757d', fontSize: '14px', marginBottom: '8px' }}>
                          {modele.description}
                        </p>
                      )}
                      <p style={{ margin: 0, color: '#8e44ad', fontSize: '13px' }}>
                        {modele.sections?.length || 0} section(s) • {modele.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0} item(s)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Formulaire d'inventaire
            <form onSubmit={handleSubmit}>
              <div style={{
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#f8f4fc',
                borderRadius: '8px',
                border: '1px solid #e1d5f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#8e44ad', marginBottom: '4px' }}>
                      {modeleSelectionne.nom}
                    </h4>
                    {modeleSelectionne.description && (
                      <p style={{ margin: 0, color: '#6c757d', fontSize: '13px' }}>
                        {modeleSelectionne.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModeleSelectionne(null);
                      setItemsInventaire([]);
                    }}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#6c757d',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Changer de modèle
                  </button>
                </div>
              </div>

              {/* Liste des items par section */}
              {Object.entries(itemsParSection).map(([sectionNom, items]) => {
                const sectionPhotoUrl = items[0]?.section_photo_url;
                
                return (
                  <div key={sectionNom} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      {sectionPhotoUrl && (
                        <img 
                          src={sectionPhotoUrl} 
                          alt={sectionNom}
                          style={{
                            width: '60px',
                            height: '60px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '2px solid #8e44ad'
                          }}
                        />
                      )}
                      <h4 style={{
                        margin: 0,
                        color: '#2c3e50',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        flex: 1
                      }}>
                        {sectionNom}
                      </h4>
                    </div>
                    
                    <div style={{ display: 'grid', gap: '12px' }}>
                      {items.map(item => {
                        const renderChamp = () => {
                          switch(item.type_champ) {
                            case 'checkbox':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {item.options.map((opt, optIdx) => (
                                      <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                          type="checkbox"
                                          checked={Array.isArray(item.valeur) && item.valeur.includes(opt.label)}
                                          onChange={(e) => {
                                            const currentVal = Array.isArray(item.valeur) ? item.valeur : [];
                                            const newVal = e.target.checked 
                                              ? [...currentVal, opt.label]
                                              : currentVal.filter(v => v !== opt.label);
                                            updateItemValeur(item.index, newVal);
                                          }}
                                          style={{ width: '18px', height: '18px' }}
                                        />
                                        <span style={{ fontSize: '14px' }}>
                                          {opt.label}
                                          {opt.declencherAlerte && <span style={{ marginLeft: '4px', color: '#f59e0b' }}>⚠️</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                  <textarea
                                    value={item.notes}
                                    onChange={(e) => updateItemNotes(item.index, e.target.value)}
                                    placeholder="Notes additionnelles (optionnel)"
                                    rows={2}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '13px', marginTop: '8px' }}
                                  />
                                </>
                              );
                            
                            case 'radio':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {item.options.map((opt, optIdx) => (
                                      <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                          type="radio"
                                          name={`radio_${item.index}`}
                                          checked={item.valeur === opt.label}
                                          onChange={() => updateItemValeur(item.index, opt.label)}
                                          style={{ width: '18px', height: '18px' }}
                                        />
                                        <span style={{ fontSize: '14px' }}>
                                          {opt.label}
                                          {opt.declencherAlerte && <span style={{ marginLeft: '4px', color: '#f59e0b' }}>⚠️</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                  <textarea
                                    value={item.notes}
                                    onChange={(e) => updateItemNotes(item.index, e.target.value)}
                                    placeholder="Notes additionnelles (optionnel)"
                                    rows={2}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '13px', marginTop: '8px' }}
                                  />
                                </>
                              );
                            
                            case 'text':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <textarea
                                    value={item.valeur}
                                    onChange={(e) => updateItemValeur(item.index, e.target.value)}
                                    placeholder="Votre réponse..."
                                    rows={2}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '13px' }}
                                  />
                                </>
                              );
                            
                            case 'number':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <input
                                    type="number"
                                    value={item.valeur}
                                    onChange={(e) => updateItemValeur(item.index, e.target.value)}
                                    placeholder="0"
                                    style={{ width: '150px', padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '13px' }}
                                  />
                                </>
                              );
                            
                            case 'select':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <select
                                    value={item.valeur}
                                    onChange={(e) => updateItemValeur(item.index, e.target.value)}
                                    style={{ padding: '8px', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white' }}
                                  >
                                    {item.options.map((opt, idx) => (
                                      <option key={idx} value={opt.label}>{opt.label}</option>
                                    ))}
                                  </select>
                                </>
                              );
                            
                            case 'photo':
                              return (
                                <>
                                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                    {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                                  </label>
                                  <ImageUpload
                                    value={item.photo_prise}
                                    onChange={(url) => updateItemPhoto(item.index, url)}
                                    compact={false}
                                    label="Prenez une photo"
                                  />
                                </>
                              );
                            
                            default:
                              return null;
                          }
                        };
                        
                        return (
                          <div
                            key={item.index}
                            style={{
                              padding: '12px',
                              border: '2px solid #e9ecef',
                              borderRadius: '8px',
                              backgroundColor: 'white'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'start' }}>
                              {item.photo_url && (
                                <img 
                                  src={item.photo_url} 
                                  alt={item.nom}
                                  style={{
                                    width: '50px',
                                    height: '50px',
                                    objectFit: 'cover',
                                    borderRadius: '4px',
                                    border: '1px solid #d1d5db',
                                    flexShrink: 0
                                  }}
                                />
                              )}
                              <div style={{ flex: 1 }}>
                                {renderChamp()}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Commentaire général */}
              <div style={{ marginTop: '24px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  color: '#2c3e50',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}>
                  Commentaire général (optionnel)
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  rows={3}
                  placeholder="Ajoutez un commentaire sur l'inventaire..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Info inspecteur en bas */}
              <div style={{
                marginTop: '24px',
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <p style={{ margin: 0, fontSize: '13px', color: '#6c757d' }}>
                  <strong>Réalisé par :</strong> {user.nom_complet || `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                  Débuté le {heureDebut ? new Date(heureDebut).toLocaleString('fr-CA') : '-'}
                </p>
              </div>

              {/* Boutons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '1px solid #dee2e6'
              }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#8e44ad',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Enregistrement...' : 'Enregistrer l\'inventaire'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventaireVehiculeModal;
