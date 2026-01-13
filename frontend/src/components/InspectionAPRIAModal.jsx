import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

const InspectionAPRIAModal = ({ isOpen, onClose, tenantSlug, user, equipementPreselectionne = null, onInspectionCreated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [equipements, setEquipements] = useState([]);
  const [modeleActif, setModeleActif] = useState(null);
  const [noFormulaire, setNoFormulaire] = useState(false);
  const [sectionActuelle, setSectionActuelle] = useState(0); // Pagination par section
  
  // Données du formulaire
  const [selectedEquipementId, setSelectedEquipementId] = useState(equipementPreselectionne?.id || '');
  const [typeInspection, setTypeInspection] = useState('mensuelle');
  const [reponses, setReponses] = useState({});
  const [pressionCylindre, setPressionCylindre] = useState('');
  const [conforme, setConforme] = useState(true);
  const [remarques, setRemarques] = useState('');

  // Charger les équipements APRIA et le modèle actif
  useEffect(() => {
    if (isOpen) {
      setNoFormulaire(false);
      setSectionActuelle(0); // Réinitialiser la pagination
      fetchEquipements();
      fetchModeleActif();
      if (equipementPreselectionne) {
        setSelectedEquipementId(equipementPreselectionne.id);
      }
      // Bloquer le scroll du body sur iOS
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    }
    return () => {
      // Restaurer le scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen, tenantSlug]);

  const fetchEquipements = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/apria/equipements');
      setEquipements(data);
    } catch (error) {
      console.error('Erreur chargement équipements:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModeleActif = async () => {
    try {
      const data = await apiGet(tenantSlug, '/apria/modeles-inspection/actif');
      if (data && data.sections && data.sections.length > 0) {
        setModeleActif(data);
        setNoFormulaire(false);
        const initialReponses = {};
        data.sections?.forEach(section => {
          if (section.items && section.items.length > 0) {
            section.items.forEach(item => {
              initialReponses[item.id] = '';
            });
          }
        });
        setReponses(initialReponses);
      } else {
        setModeleActif(null);
        setNoFormulaire(true);
      }
    } catch (error) {
      console.error('Erreur chargement modèle:', error);
      setNoFormulaire(true);
    }
  };

  const resetForm = () => {
    setSelectedEquipementId(equipementPreselectionne?.id || '');
    setTypeInspection('mensuelle');
    setReponses({});
    setPressionCylindre('');
    setConforme(true);
    setRemarques('');
  };

  const handleSubmit = async () => {
    if (!selectedEquipementId) {
      alert('Veuillez sélectionner un équipement');
      return;
    }

    try {
      setSaving(true);
      
      let resultatGlobal = conforme;
      Object.values(reponses).forEach(val => {
        if (val === 'Non conforme' || val === 'À remplacer' || val === 'Défectueux') {
          resultatGlobal = false;
        }
      });

      const inspectionData = {
        equipement_id: selectedEquipementId,
        type_inspection: typeInspection,
        modele_utilise_id: modeleActif?.id || null,
        date_inspection: new Date().toISOString(),
        reponses: reponses,
        pression_cylindre: pressionCylindre ? parseFloat(pressionCylindre) : null,
        conforme: resultatGlobal,
        remarques: remarques,
        inspecteur_id: user?.id,
        inspecteur_nom: `${user?.prenom || ''} ${user?.nom || ''}`.trim()
      };

      await apiPost(tenantSlug, '/apria/inspections', inspectionData);
      
      alert('✅ Inspection enregistrée avec succès !');
      resetForm();
      onClose();
      if (onInspectionCreated) {
        onInspectionCreated();
      }
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      alert('Erreur lors de l\'enregistrement: ' + (error.message || 'Erreur inconnue'));
    } finally {
      setSaving(false);
    }
  };

  const selectedEquipement = equipements.find(e => e.id === selectedEquipementId);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '0.5rem',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          margin: '0.5rem auto',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 1rem)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header fixe */}
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f97316',
          borderRadius: '12px 12px 0 0',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ 
              margin: 0, 
              color: 'white', 
              fontSize: '1.1rem', 
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              📝 Inspection APRIA
            </h2>
            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: 'white',
                fontSize: '1.5rem',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '1rem'
        }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
              Chargement...
            </div>
          ) : noFormulaire ? (
            <div style={{ 
              padding: '2rem', 
              textAlign: 'center',
              backgroundColor: '#fef3c7',
              borderRadius: '12px',
              border: '2px solid #f59e0b'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
              <h3 style={{ color: '#92400e', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                Formulaire non disponible
              </h3>
              <p style={{ color: '#78350f', fontSize: '0.9rem', marginBottom: '1rem' }}>
                Aucun formulaire d'inspection APRIA n'a été configuré.
              </p>
              <p style={{ color: '#92400e', fontSize: '0.8rem' }}>
                Contactez un administrateur.
              </p>
            </div>
          ) : (
            <>
              {/* Sélection équipement */}
              <div style={{ marginBottom: '1rem' }}>
                <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block', fontSize: '0.9rem' }}>
                  Équipement APRIA *
                </Label>
                <select
                  value={selectedEquipementId}
                  onChange={(e) => setSelectedEquipementId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '16px', // Important pour éviter le zoom sur iOS
                    backgroundColor: 'white',
                    appearance: 'none',
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%236b7280\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '1.25rem'
                  }}
                >
                  <option value="">Sélectionner...</option>
                  {equipements.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.numero_serie ? `${eq.numero_serie} - ` : ''}{eq.nom}
                      {eq.emplacement ? ` (${eq.emplacement})` : ''}
                    </option>
                  ))}
                </select>
                {selectedEquipement && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    padding: '0.5rem', 
                    backgroundColor: '#f3f4f6', 
                    borderRadius: '6px', 
                    fontSize: '0.8rem' 
                  }}>
                    <strong>{selectedEquipement.nom}</strong>
                    {selectedEquipement.numero_serie && <span> • N° {selectedEquipement.numero_serie}</span>}
                    {selectedEquipement.emplacement && <span> • {selectedEquipement.emplacement}</span>}
                  </div>
                )}
              </div>

              {/* Type d'inspection */}
              <div style={{ marginBottom: '1rem' }}>
                <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block', fontSize: '0.9rem' }}>
                  Type d'inspection
                </Label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setTypeInspection('mensuelle')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: typeInspection === 'mensuelle' ? '#f97316' : 'white',
                      color: typeInspection === 'mensuelle' ? 'white' : '#374151',
                      border: typeInspection === 'mensuelle' ? 'none' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    📅 Mensuelle
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypeInspection('apres_usage')}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      backgroundColor: typeInspection === 'apres_usage' ? '#f97316' : 'white',
                      color: typeInspection === 'apres_usage' ? 'white' : '#374151',
                      border: typeInspection === 'apres_usage' ? 'none' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    🔧 Après usage
                  </button>
                </div>
              </div>

              {/* Sections du formulaire avec pagination */}
              {(() => {
                const sections = modeleActif?.sections || [];
                const totalSections = sections.length;
                const sectionCourante = sections[sectionActuelle];
                const estPremiereSection = sectionActuelle === 0;
                const estDerniereSection = sectionActuelle === totalSections - 1;

                if (!sectionCourante) return <p>Aucune section trouvée.</p>;

                return (
                  <>
                    {/* Barre de progression */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          Section {sectionActuelle + 1} / {totalSections}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                          {Math.round(((sectionActuelle + 1) / totalSections) * 100)}%
                        </span>
                      </div>
                      <div style={{
                        height: '4px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          backgroundColor: '#f97316',
                          width: `${((sectionActuelle + 1) / totalSections) * 100}%`,
                          transition: 'width 0.3s'
                        }}></div>
                      </div>
                    </div>

                    {/* Section courante uniquement */}
                    <div 
                      style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        backgroundColor: '#f9fafb',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb'
                      }}
                    >
                      <h4 style={{ 
                        margin: '0 0 0.75rem 0', 
                        fontSize: '0.95rem', 
                        fontWeight: '600',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        {sectionCourante.icone || '📋'} {sectionCourante.titre}
                      </h4>

                      {/* Champ pression cylindre */}
                      {sectionCourante.type_champ === 'number' && sectionCourante.titre.toLowerCase().includes('pression') && (
                        <div>
                          <Input
                            type="number"
                            value={pressionCylindre}
                            onChange={(e) => setPressionCylindre(e.target.value)}
                            placeholder="Ex: 4500"
                            style={{ fontSize: '16px' }}
                          />
                          {sectionCourante.unite && (
                            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                              {sectionCourante.unite}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Items à vérifier */}
                      {(sectionCourante.type_champ === 'radio' || sectionCourante.type_champ === 'checkbox') && sectionCourante.items?.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {sectionCourante.items.map((item, itemIndex) => (
                            <div 
                              key={item.id || itemIndex}
                              style={{ 
                                padding: '0.5rem',
                                backgroundColor: 'white',
                                borderRadius: '6px',
                                border: reponses[item.id] === 'Non conforme' ? '2px solid #ef4444' : '1px solid #e5e7eb'
                              }}
                            >
                              <div style={{ marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.85rem' }}>
                                {item.nom}
                              </div>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {(sectionCourante.options || [{ label: 'Conforme' }, { label: 'Non conforme' }]).map((opt, optIndex) => (
                                  <button
                                    key={optIndex}
                                    type="button"
                                    onClick={() => setReponses({ ...reponses, [item.id]: opt.label })}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      fontSize: '0.8rem',
                                      borderRadius: '6px',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontWeight: '500',
                                      backgroundColor: reponses[item.id] === opt.label 
                                        ? (opt.declencherAlerte ? '#ef4444' : '#22c55e')
                                        : '#e5e7eb',
                                      color: reponses[item.id] === opt.label ? 'white' : '#374151'
                                    }}
                                  >
                                    {opt.declencherAlerte && '⚠️'} {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Texte remarques */}
                      {sectionCourante.type_champ === 'text' && sectionCourante.titre.toLowerCase().includes('remarque') && (
                        <Textarea
                          value={remarques}
                          onChange={(e) => setRemarques(e.target.value)}
                          placeholder="Remarques..."
                          rows={2}
                          style={{ fontSize: '16px' }}
                        />
                      )}
                    </div>

                    {/* Boutons de navigation */}
                    {!estDerniereSection && (
                      <div style={{
                        display: 'flex',
                        gap: '1rem',
                        justifyContent: 'space-between',
                        marginBottom: '1rem'
                      }}>
                        <button
                          type="button"
                          onClick={() => setSectionActuelle(sectionActuelle - 1)}
                          disabled={estPremiereSection}
                          style={{
                            flex: 1,
                            padding: '0.875rem',
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
                        <button
                          type="button"
                          onClick={() => setSectionActuelle(sectionActuelle + 1)}
                          style={{
                            flex: 1,
                            padding: '0.875rem',
                            backgroundColor: '#f97316',
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
                      </div>
                    )}

                    {/* Dernière page : afficher résultat et boutons finaux */}
                    {estDerniereSection && (
                      <>
                        {/* Bouton Précédent */}
                        <div style={{ marginBottom: '1rem' }}>
                          <button
                            type="button"
                            onClick={() => setSectionActuelle(sectionActuelle - 1)}
                            style={{
                              padding: '0.75rem 1.5rem',
                              backgroundColor: '#6b7280',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '600'
                            }}
                          >
                            ← Précédent
                          </button>
                        </div>

                        {/* Résultat global */}
                        <div style={{ 
                          padding: '0.75rem',
                          backgroundColor: conforme ? '#f0fdf4' : '#fef2f2',
                          borderRadius: '8px',
                          border: conforme ? '2px solid #22c55e' : '2px solid #ef4444',
                          marginBottom: '1rem'
                        }}>
                          <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            Résultat global
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => setConforme(true)}
                              style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: conforme ? '#22c55e' : 'white',
                                color: conforme ? 'white' : '#374151',
                                border: conforme ? 'none' : '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              ✅ Conforme
                            </button>
                            <button
                              type="button"
                              onClick={() => setConforme(false)}
                              style={{
                                flex: 1,
                                padding: '0.75rem',
                                backgroundColor: !conforme ? '#ef4444' : 'white',
                                color: !conforme ? 'white' : '#374151',
                                border: !conforme ? 'none' : '1px solid #d1d5db',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              ❌ Non conforme
                            </button>
                          </div>
                          {!conforme && (
                            <p style={{ margin: '0.5rem 0 0', color: '#dc2626', fontSize: '0.8rem' }}>
                              ⚠️ L'équipement sera marqué "Hors service"
                            </p>
                          )}
                        </div>

                        {/* Remarques */}
                        <div style={{ marginBottom: '1rem' }}>
                          <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block', fontSize: '0.9rem' }}>
                            Remarques
                          </Label>
                          <Textarea
                            value={remarques}
                            onChange={(e) => setRemarques(e.target.value)}
                            placeholder="Notes supplémentaires..."
                            rows={2}
                            style={{ fontSize: '16px' }}
                          />
                        </div>

                        {/* Info inspecteur */}
                        <div style={{ 
                          padding: '0.5rem', 
                          backgroundColor: '#f3f4f6', 
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          color: '#6b7280',
                          marginBottom: '1rem'
                        }}>
                          <strong>Inspecteur:</strong> {user?.prenom} {user?.nom}<br/>
                          <strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')} à {new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {/* Bouton Valider */}
                        <Button 
                          onClick={handleSubmit} 
                          disabled={saving || !selectedEquipementId || noFormulaire}
                          style={{ 
                            width: '100%',
                            padding: '1rem',
                            backgroundColor: '#10b981', 
                            fontSize: '1rem', 
                            fontWeight: '600'
                          }}
                        >
                          {saving ? '⏳ Enregistrement...' : '✓ Valider l\'inspection'}
                        </Button>
                      </>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer fixe - Bouton Annuler uniquement */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'center',
          flexShrink: 0,
          backgroundColor: 'white',
          borderRadius: '0 0 12px 12px'
        }}>
          <Button 
            variant="outline" 
            onClick={onClose} 
            disabled={saving}
            style={{ padding: '0.625rem 1.5rem', fontSize: '0.9rem' }}
          >
            ✕ Annuler l'inspection
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InspectionAPRIAModal;
