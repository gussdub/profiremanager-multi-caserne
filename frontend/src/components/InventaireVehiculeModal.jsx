import React, { useState, useEffect } from 'react';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost } from '../utils/api';

const InventaireVehiculeModal = ({ vehicule, user, onClose, onSuccess }) => {
  const { tenantSlug } = useTenant();
  const [loading, setLoading] = useState(false);
  const [modeles, setModeles] = useState([]);
  const [modeleSelectionne, setModeleSelectionne] = useState(null);
  const [itemsInventaire, setItemsInventaire] = useState([]);
  const [commentaire, setCommentaire] = useState('');

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
    // Initialiser les items avec le modèle
    const items = [];
    modele.sections.forEach(section => {
      section.items.forEach(item => {
        items.push({
          section: section.nom,
          nom: item.nom,
          present: false,
          commentaire: ''
        });
      });
    });
    setItemsInventaire(items);
  };

  const toggleItem = (index) => {
    const newItems = [...itemsInventaire];
    newItems[index].present = !newItems[index].present;
    setItemsInventaire(newItems);
  };

  const updateItemCommentaire = (index, commentaire) => {
    const newItems = [...itemsInventaire];
    newItems[index].commentaire = commentaire;
    setItemsInventaire(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const inventaireData = {
        vehicule_id: vehicule.id,
        vehicule_nom: vehicule.nom,
        modele_id: modeleSelectionne.id,
        modele_nom: modeleSelectionne.nom,
        items: itemsInventaire,
        commentaire_general: commentaire,
        realise_par: user.nom_complet || user.email,
        realise_par_id: user.id
      };

      await apiPost(tenantSlug, '/actifs/inventaires-vehicules', inventaireData);
      
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
              {Object.entries(itemsParSection).map(([sectionNom, items]) => (
                <div key={sectionNom} style={{ marginBottom: '24px' }}>
                  <h4 style={{
                    margin: '0 0 12px 0',
                    color: '#2c3e50',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    paddingBottom: '8px',
                    borderBottom: '2px solid #8e44ad'
                  }}>
                    {sectionNom}
                  </h4>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {items.map(item => (
                      <div
                        key={item.index}
                        style={{
                          padding: '12px',
                          border: `2px solid ${item.present ? '#27ae60' : '#e9ecef'}`,
                          borderRadius: '8px',
                          backgroundColor: item.present ? '#e8f5e9' : 'white',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input
                            type="checkbox"
                            checked={item.present}
                            onChange={() => toggleItem(item.index)}
                            style={{
                              width: '20px',
                              height: '20px',
                              cursor: 'pointer'
                            }}
                          />
                          <label
                            onClick={() => toggleItem(item.index)}
                            style={{
                              flex: 1,
                              cursor: 'pointer',
                              fontSize: '14px',
                              color: '#2c3e50',
                              fontWeight: item.present ? 'bold' : 'normal'
                            }}
                          >
                            {item.nom}
                          </label>
                        </div>
                        {!item.present && (
                          <div style={{ marginTop: '8px', marginLeft: '32px' }}>
                            <input
                              type="text"
                              placeholder="Commentaire (optionnel)"
                              value={item.commentaire}
                              onChange={(e) => updateItemCommentaire(item.index, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #dee2e6',
                                borderRadius: '4px',
                                fontSize: '13px'
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

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

              {/* Boutons */}
              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                marginTop: '24px',
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
