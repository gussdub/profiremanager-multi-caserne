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
  const [sectionActuelle, setSectionActuelle] = useState(0); // Navigation par section

  useEffect(() => {
    fetchModeles();
  }, []);

  const fetchModeles = async () => {
    try {
      // Charger les formulaires d'inventaire depuis le système unifié
      const allFormulaires = await apiGet(tenantSlug, '/formulaires-inspection');
      
      console.log('Véhicule:', vehicule);
      console.log('modele_inventaire_id:', vehicule.modele_inventaire_id);
      console.log('Tous les formulaires chargés:', allFormulaires?.length);
      
      // Fonction pour convertir le format unifié vers le format attendu
      const convertFormulaire = (f) => {
        console.log('Conversion du formulaire:', f.nom, 'avec', f.sections?.length, 'sections');
        return {
          id: f.id,
          nom: f.nom,
          description: f.description || '',
          sections: (f.sections || []).map(s => {
            console.log('  - Section:', s.nom || s.titre, 'avec', s.items?.length, 'items');
            return {
              id: s.id,
              titre: s.nom || s.titre,
              type_champ: s.items?.[0]?.type || 'checkbox',
              options: s.items?.[0]?.options?.map(opt => ({ label: opt, declencherAlerte: false })) || [],
              photo_url: '',
              items: s.items?.map(item => ({
                id: item.id || `${s.nom}_${item.label}`,
                nom: item.label || item.nom,
                type: item.type,
                options: item.options || [],
                photo_url: '',
                obligatoire: item.obligatoire || false,
                ordre: 0
              })) || []
            };
          })
        };
      };
      
      // PRIORITÉ 1: Si le véhicule a un formulaire assigné, l'utiliser
      if (vehicule.modele_inventaire_id) {
        const assignedFormulaire = (allFormulaires || []).find(f => f.id === vehicule.modele_inventaire_id);
        if (assignedFormulaire) {
          const modeleConverti = convertFormulaire(assignedFormulaire);
          setModeles([modeleConverti]);
          handleSelectionModele(modeleConverti);
          return;
        }
      }
      
      // PRIORITÉ 2: Filtrer les formulaires avec la catégorie "vehicule" qui sont actifs
      const vehiculeFormulaires = (allFormulaires || []).filter(f => 
        f.est_actif !== false &&
        f.categorie_ids?.includes('vehicule')
      );
      
      // Convertir le format
      const modelesConverts = vehiculeFormulaires.map(convertFormulaire);
      
      setModeles(modelesConverts);
      
      // Si un seul modèle existe, le sélectionner automatiquement
      if (modelesConverts && modelesConverts.length === 1) {
        handleSelectionModele(modelesConverts[0]);
      }
    } catch (error) {
      console.error('Erreur chargement modèles:', error);
      setModeles([]);
    }
  };

  const handleSelectionModele = (modele) => {
    setModeleSelectionne(modele);
    setHeureDebut(new Date().toISOString());
    setSectionActuelle(0); // Commencer à la première section
    
    // Initialiser les items avec le modèle
    const items = [];
    modele.sections.forEach(section => {
      const sectionTypeChamp = section.type_champ || 'checkbox';
      const sectionOptions = section.options || [];
      
      section.items.forEach(item => {
        let initialValue;
        
        if (sectionTypeChamp === 'checkbox') {
          initialValue = [];
        } else if (sectionTypeChamp === 'radio') {
          initialValue = sectionOptions.length > 0 ? sectionOptions[0].label : '';
        } else if (sectionTypeChamp === 'number') {
          initialValue = '0';
        } else if (sectionTypeChamp === 'select') {
          initialValue = sectionOptions.length > 0 ? sectionOptions[0].label : '';
        } else {
          initialValue = '';
        }
        
        items.push({
          section: section.titre,
          section_photo_url: section.photo_url,
          section_type_champ: sectionTypeChamp,
          item_id: item.id || `${section.titre}_${item.nom}`,
          nom: item.nom,
          photo_url: item.photo_url,
          options: sectionOptions,
          obligatoire: item.obligatoire,
          valeur: initialValue,
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

  const handleSubmit = async () => {
    setLoading(true);

    try {
      const heureFin = new Date().toISOString();
      
      // Détecter les alertes
      const alertes = [];
      itemsInventaire.forEach(item => {
        if (item.section_type_champ === 'checkbox' && Array.isArray(item.valeur)) {
          item.valeur.forEach(valeurCochee => {
            const option = item.options.find(opt => opt.label === valeurCochee);
            if (option?.declencherAlerte) {
              alertes.push({
                section: item.section,
                item: item.nom,
                valeur: valeurCochee,
                notes: item.notes,
                photo: item.photo_prise
              });
            }
          });
        } else if (item.section_type_champ === 'radio') {
          const option = item.options.find(opt => opt.label === item.valeur);
          if (option?.declencherAlerte) {
            alertes.push({
              section: item.section,
              item: item.nom,
              valeur: item.valeur,
              notes: item.notes,
              photo: item.photo_prise
            });
          }
        }
      });
      
      const inventaireData = {
        formulaire_id: modeleSelectionne.id,
        asset_id: vehicule.id,
        asset_type: 'vehicule',
        user_id: user.id,
        reponses: itemsInventaire.reduce((acc, item) => {
          acc[item.item_id] = {
            valeur: item.valeur,
            notes: item.notes || '',
            photo: item.photo_prise || ''
          };
          return acc;
        }, {}),
        conforme: alertes.length === 0,
        notes_generales: commentaire,
        alertes: alertes,
        metadata: {
          vehicule_nom: vehicule.nom || vehicule.numero,
          effectue_par: user.nom_complet || `${user.prenom || ''} ${user.nom || ''}`.trim() || user.email,
          heure_debut: heureDebut,
          heure_fin: heureFin
        }
      };

      await apiPost(tenantSlug, '/inspections-unifiees', inventaireData);
      
      if (alertes.length > 0) {
        alert(`✅ Inventaire enregistré avec succès !\n⚠️ ${alertes.length} alerte(s) envoyée(s) aux superviseurs.`);
      } else {
        alert('✅ Inventaire enregistré avec succès !');
      }
      
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

  const sections = Object.keys(itemsParSection);
  const totalSections = sections.length;
  const sectionNom = sections[sectionActuelle];
  const itemsSection = itemsParSection[sectionNom] || [];

  // Navigation
  const allerSectionPrecedente = () => {
    if (sectionActuelle > 0) {
      setSectionActuelle(sectionActuelle - 1);
    }
  };

  const allerSectionSuivante = () => {
    if (sectionActuelle < totalSections - 1) {
      setSectionActuelle(sectionActuelle + 1);
    }
  };

  const estDerniereSection = sectionActuelle === totalSections - 1;
  const estPremiereSection = sectionActuelle === 0;

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
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        width: '100%',
        maxWidth: modeleSelectionne ? '600px' : '800px',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#8e44ad',
          color: 'white'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>
              📋 Inventaire - {vehicule.nom}
            </h2>
            {modeleSelectionne && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', opacity: 0.9 }}>
                {modeleSelectionne.nom}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem'
        }}>
          {!modeleSelectionne ? (
            // Sélection du modèle
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#1f2937' }}>
                Choisissez un modèle d'inventaire
              </h3>
              {modeles.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '0.5rem',
                  color: '#6b7280'
                }}>
                  <p style={{ marginBottom: '1rem' }}>
                    Aucun modèle d'inventaire n'est configuré
                  </p>
                  <p style={{ fontSize: '0.875rem' }}>
                    Allez dans <strong>Paramètres &gt; Inventaires</strong> pour créer un modèle
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {modeles.map(modele => (
                    <div
                      key={modele.id}
                      onClick={() => handleSelectionModele(modele)}
                      style={{
                        padding: '1rem',
                        border: '2px solid #e5e7eb',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        backgroundColor: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#8e44ad';
                        e.currentTarget.style.backgroundColor = '#f3e8ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <h4 style={{ margin: 0, color: '#1f2937', marginBottom: '0.5rem' }}>
                        {modele.nom}
                      </h4>
                      {modele.description && (
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          {modele.description}
                        </p>
                      )}
                      <p style={{ margin: 0, color: '#8e44ad', fontSize: '0.875rem' }}>
                        {modele.sections?.length || 0} section(s) • {modele.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0} item(s)
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Formulaire d'inventaire avec navigation par section
            <div>
              {/* Indicateur de progression */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f3e8ff',
                borderRadius: '0.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#6b21a8', fontWeight: '600' }}>
                    Section {sectionActuelle + 1} sur {totalSections}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9333ea', marginTop: '0.25rem' }}>
                    {sectionNom}
                  </div>
                </div>
                {/* Afficher le bouton "Changer de modèle" uniquement s'il y a plusieurs modèles */}
                {modeles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setModeleSelectionne(null);
                      setItemsInventaire([]);
                      setSectionActuelle(0);
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.75rem'
                    }}
                  >
                    Changer de modèle
                  </button>
                )}
              </div>

              {/* Barre de progression visuelle */}
              <div style={{
                height: '4px',
                backgroundColor: '#e5e7eb',
                borderRadius: '2px',
                marginBottom: '1.5rem',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#8e44ad',
                  width: `${((sectionActuelle + 1) / totalSections) * 100}%`,
                  transition: 'width 0.3s'
                }}></div>
              </div>

              {/* Photo de référence de la section */}
              {itemsSection[0]?.section_photo_url && (
                <div style={{ marginBottom: '1rem' }}>
                  <img 
                    src={itemsSection[0].section_photo_url} 
                    alt={sectionNom}
                    style={{
                      width: '100%',
                      maxHeight: '150px',
                      objectFit: 'cover',
                      borderRadius: '0.5rem',
                      border: '2px solid #8e44ad'
                    }}
                  />
                </div>
              )}

              {/* Items de la section actuelle */}
              <div style={{ marginBottom: '2rem' }}>
                {itemsSection.map(item => (
                  <div key={item.index} style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    {/* Photo de référence de l'item */}
                    {item.photo_url && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <img 
                          src={item.photo_url} 
                          alt={item.nom}
                          style={{
                            width: '100px',
                            height: '100px',
                            objectFit: 'cover',
                            borderRadius: '0.375rem',
                            border: '1px solid #d1d5db'
                          }}
                        />
                      </div>
                    )}

                    <label style={{ display: 'block', fontSize: '1rem', fontWeight: '600', marginBottom: '0.75rem', color: '#1f2937' }}>
                      {item.nom} {item.obligatoire && <span style={{color: '#ef4444'}}>*</span>}
                    </label>

                    {/* Rendu selon le type de champ */}
                    {item.section_type_champ === 'checkbox' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {item.options.map((opt, optIdx) => (
                          <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem', backgroundColor: 'white', borderRadius: '0.375rem' }}>
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
                              style={{ width: '20px', height: '20px' }}
                            />
                            <span style={{ fontSize: '1rem' }}>
                              {opt.label}
                              {opt.declencherAlerte && <span style={{ marginLeft: '0.5rem', fontSize: '1.2rem' }}>⚠️</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {item.section_type_champ === 'radio' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {item.options.map((opt, optIdx) => (
                          <label key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.5rem', backgroundColor: 'white', borderRadius: '0.375rem' }}>
                            <input
                              type="radio"
                              name={`item-${item.index}`}
                              checked={item.valeur === opt.label}
                              onChange={() => updateItemValeur(item.index, opt.label)}
                              style={{ width: '20px', height: '20px' }}
                            />
                            <span style={{ fontSize: '1rem' }}>
                              {opt.label}
                              {opt.declencherAlerte && <span style={{ marginLeft: '0.5rem', fontSize: '1.2rem' }}>⚠️</span>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}

                    {item.section_type_champ === 'text' && (
                      <input
                        type="text"
                        value={item.valeur}
                        onChange={(e) => updateItemValeur(item.index, e.target.value)}
                        placeholder="Saisir la valeur"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '1rem',
                          marginBottom: '0.75rem'
                        }}
                      />
                    )}

                    {item.section_type_champ === 'number' && (
                      <input
                        type="number"
                        value={item.valeur}
                        onChange={(e) => updateItemValeur(item.index, e.target.value)}
                        placeholder="Saisir un nombre"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.375rem',
                          fontSize: '1rem',
                          marginBottom: '0.75rem'
                        }}
                      />
                    )}

                    {/* Notes additionnelles */}
                    <textarea
                      value={item.notes}
                      onChange={(e) => updateItemNotes(item.index, e.target.value)}
                      placeholder="Notes additionnelles (optionnel)"
                      rows={2}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                        marginBottom: '0.75rem',
                        resize: 'vertical'
                      }}
                    />

                    {/* Upload photo - TOUJOURS VISIBLE */}
                    <div style={{ marginTop: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem', color: '#6b7280' }}>
                        📷 Photo (optionnel)
                      </label>
                      <ImageUpload
                        value={item.photo_prise || ''}
                        onChange={(url) => updateItemPhoto(item.index, url)}
                        compact={true}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes générales - seulement sur la dernière section */}
              {estDerniereSection && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem', color: '#1f2937' }}>
                    Notes générales (optionnel)
                  </label>
                  <textarea
                    value={commentaire}
                    onChange={(e) => setCommentaire(e.target.value)}
                    placeholder="Commentaires sur l'inventaire complet..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      resize: 'vertical'
                    }}
                  />
                </div>
              )}

              {/* Boutons de navigation */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'space-between'
              }}>
                <button
                  type="button"
                  onClick={allerSectionPrecedente}
                  disabled={estPremiereSection}
                  style={{
                    flex: 1,
                    padding: '1rem',
                    backgroundColor: estPremiereSection ? '#e5e7eb' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: estPremiereSection ? 'not-allowed' : 'pointer',
                    fontSize: '1rem',
                    fontWeight: '600'
                  }}
                >
                  ← Précédent
                </button>

                {estDerniereSection ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      backgroundColor: loading ? '#9ca3af' : '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                  >
                    {loading ? 'Enregistrement...' : '🏁 Terminer l\'inventaire'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={allerSectionSuivante}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      backgroundColor: '#8e44ad',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                  >
                    Suivant →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventaireVehiculeModal;
