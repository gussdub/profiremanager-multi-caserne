import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const InspectionAPRIAModal = ({ isOpen, onClose, tenantSlug, user, equipementPreselectionne = null, onInspectionCreated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [equipements, setEquipements] = useState([]);
  const [modeleActif, setModeleActif] = useState(null);
  const [noFormulaire, setNoFormulaire] = useState(false);
  
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
      fetchEquipements();
      fetchModeleActif();
      if (equipementPreselectionne) {
        setSelectedEquipementId(equipementPreselectionne.id);
      }
    }
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
        // Initialiser les réponses
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

  // Réinitialiser le formulaire
  const resetForm = () => {
    setSelectedEquipementId(equipementPreselectionne?.id || '');
    setTypeInspection('mensuelle');
    setReponses({});
    setPressionCylindre('');
    setConforme(true);
    setRemarques('');
  };

  // Vérifier si l'inspection est conforme
  const verifierConformite = () => {
    // Vérifier les réponses non conformes
    let estConforme = true;
    
    modeleActif?.sections?.forEach(section => {
      if (section.items && section.items.length > 0) {
        section.items.forEach(item => {
          const reponse = reponses[item.id];
          if (reponse === 'Non conforme') {
            estConforme = false;
          }
        });
      }
    });

    // Vérifier la pression
    if (pressionCylindre && parseInt(pressionCylindre) < 4050) {
      estConforme = false;
    }

    return estConforme;
  };

  // Mettre à jour la conformité automatiquement
  useEffect(() => {
    if (modeleActif) {
      setConforme(verifierConformite());
    }
  }, [reponses, pressionCylindre]);

  // Soumettre l'inspection
  const handleSubmit = async () => {
    if (!selectedEquipementId) {
      alert('Veuillez sélectionner un équipement APRIA');
      return;
    }

    try {
      setSaving(true);
      
      const inspectionData = {
        equipement_id: selectedEquipementId,
        type_inspection: typeInspection,
        inspecteur_id: user?.id,
        date_inspection: new Date().toISOString(),
        elements: reponses,
        pression_cylindre: pressionCylindre ? parseInt(pressionCylindre) : null,
        conforme: conforme,
        remarques: remarques,
        photos: []
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent style={{ maxWidth: '95vw', width: '700px', maxHeight: '90vh', overflow: 'auto', padding: '1rem' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'clamp(1rem, 4vw, 1.25rem)' }}>
            📝 Inspection APRIA
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            Chargement...
          </div>
        ) : noFormulaire ? (
          <div style={{ 
            padding: '3rem', 
            textAlign: 'center',
            backgroundColor: '#fef3c7',
            borderRadius: '12px',
            border: '2px solid #f59e0b'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <h3 style={{ color: '#92400e', marginBottom: '0.5rem', fontSize: '1.25rem' }}>
              Formulaire non disponible
            </h3>
            <p style={{ color: '#78350f', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              Aucun formulaire d'inspection APRIA n'a été configuré pour cette caserne.
            </p>
            <p style={{ color: '#92400e', fontSize: '0.875rem' }}>
              Veuillez contacter un administrateur pour créer un modèle d'inspection.
            </p>
            <Button onClick={onClose} style={{ marginTop: '1.5rem' }}>
              Fermer
            </Button>
          </div>
        ) : (
          <div style={{ padding: '1rem 0' }}>
            {/* Sélection équipement */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
                Équipement APRIA *
              </Label>
              <Select value={selectedEquipementId} onValueChange={setSelectedEquipementId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un équipement APRIA" />
                </SelectTrigger>
                <SelectContent>
                  {equipements.map(eq => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.numero_serie ? `${eq.numero_serie} - ` : ''}{eq.nom}
                      {eq.emplacement ? ` (${eq.emplacement})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEquipement && (
                <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#f3f4f6', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
                  <strong>Sélectionné:</strong> {selectedEquipement.nom}<br/>
                  {selectedEquipement.numero_serie && <><strong>N° Série:</strong> {selectedEquipement.numero_serie}<br/></>}
                  {selectedEquipement.emplacement && <><strong>Emplacement:</strong> {selectedEquipement.emplacement}</>}
                </div>
              )}
            </div>

            {/* Type d'inspection */}
            <div style={{ marginBottom: '1.5rem' }}>
              <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
                Type d'inspection
              </Label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: typeInspection === 'mensuelle' ? '#fef3c7' : 'white',
                  border: typeInspection === 'mensuelle' ? '2px solid #f97316' : '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="typeInspection"
                    value="mensuelle"
                    checked={typeInspection === 'mensuelle'}
                    onChange={(e) => setTypeInspection(e.target.value)}
                  />
                  📅 Mensuelle
                </label>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: typeInspection === 'apres_usage' ? '#fef3c7' : 'white',
                  border: typeInspection === 'apres_usage' ? '2px solid #f97316' : '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="typeInspection"
                    value="apres_usage"
                    checked={typeInspection === 'apres_usage'}
                    onChange={(e) => setTypeInspection(e.target.value)}
                  />
                  🔄 Après usage
                </label>
              </div>
            </div>

            {/* Sections du modèle */}
            {modeleActif?.sections?.map((section, sectionIndex) => (
              <div 
                key={section.id || sectionIndex}
                style={{ 
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  backgroundColor: '#fff7ed',
                  borderRadius: '0.5rem',
                  border: '1px solid #fed7aa'
                }}
              >
                <h4 style={{ margin: '0 0 1rem', fontWeight: '600', color: '#9a3412' }}>
                  {section.titre}
                </h4>

                {/* Champ nombre (pression) */}
                {section.type_champ === 'number' && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Input
                        type="number"
                        value={pressionCylindre}
                        onChange={(e) => setPressionCylindre(e.target.value)}
                        placeholder={`Minimum: ${section.seuil_minimum || 4050}`}
                        style={{ 
                          maxWidth: '200px',
                          borderColor: pressionCylindre && parseInt(pressionCylindre) < (section.seuil_minimum || 4050) ? '#ef4444' : '#d1d5db'
                        }}
                      />
                      <span style={{ color: '#6b7280' }}>{section.unite || 'PSI'}</span>
                    </div>
                    {pressionCylindre && parseInt(pressionCylindre) < (section.seuil_minimum || 4050) && (
                      <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
                        ⚠️ Pression inférieure au minimum requis ({section.seuil_minimum || 4050} {section.unite || 'PSI'})
                      </p>
                    )}
                  </div>
                )}

                {/* Items à vérifier (radio/checkbox) */}
                {(section.type_champ === 'radio' || section.type_champ === 'checkbox') && section.items?.length > 0 && (
                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    {section.items.map((item, itemIndex) => (
                      <div 
                        key={item.id || itemIndex}
                        style={{ 
                          padding: '0.75rem',
                          backgroundColor: 'white',
                          borderRadius: '0.375rem',
                          border: reponses[item.id] === 'Non conforme' ? '2px solid #ef4444' : '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{ marginBottom: '0.5rem', fontWeight: '500' }}>{item.nom}</div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          {(section.options || [{ label: 'Conforme' }, { label: 'Non conforme' }]).map((opt, optIndex) => (
                            <label 
                              key={optIndex}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.25rem',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                backgroundColor: reponses[item.id] === opt.label ? (opt.declencherAlerte ? '#fef2f2' : '#f0fdf4') : 'transparent'
                              }}
                            >
                              <input
                                type="radio"
                                name={`item_${item.id}`}
                                value={opt.label}
                                checked={reponses[item.id] === opt.label}
                                onChange={(e) => setReponses({ ...reponses, [item.id]: e.target.value })}
                              />
                              {opt.declencherAlerte && '⚠️'} {opt.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Texte libre (remarques) */}
                {section.type_champ === 'text' && section.titre.toLowerCase().includes('remarque') && (
                  <Textarea
                    value={remarques}
                    onChange={(e) => setRemarques(e.target.value)}
                    placeholder="Remarques ou observations..."
                    rows={3}
                  />
                )}
              </div>
            ))}

            {/* Résultat global */}
            <div style={{ 
              padding: '1rem',
              backgroundColor: conforme ? '#f0fdf4' : '#fef2f2',
              borderRadius: '0.5rem',
              border: conforme ? '2px solid #22c55e' : '2px solid #ef4444',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: '600', fontSize: '1.125rem' }}>
                  Résultat global :
                </span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: conforme ? '#22c55e' : 'white',
                    color: conforme ? 'white' : '#374151',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}>
                    <input
                      type="radio"
                      name="conforme"
                      checked={conforme}
                      onChange={() => setConforme(true)}
                    />
                    ✅ Conforme
                  </label>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: !conforme ? '#ef4444' : 'white',
                    color: !conforme ? 'white' : '#374151',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}>
                    <input
                      type="radio"
                      name="conforme"
                      checked={!conforme}
                      onChange={() => setConforme(false)}
                    />
                    ❌ Non Conforme
                  </label>
                </div>
              </div>
              {!conforme && (
                <p style={{ margin: '0.75rem 0 0', color: '#dc2626', fontSize: '0.875rem' }}>
                  ⚠️ L'équipement sera marqué "Hors service" et une alerte sera envoyée aux responsables.
                </p>
              )}
            </div>

            {/* Remarques générales */}
            <div style={{ marginBottom: '1rem' }}>
              <Label style={{ fontWeight: '600', marginBottom: '0.5rem', display: 'block' }}>
                Remarques additionnelles
              </Label>
              <Textarea
                value={remarques}
                onChange={(e) => setRemarques(e.target.value)}
                placeholder="Notes ou observations supplémentaires..."
                rows={3}
              />
            </div>

            {/* Info inspecteur */}
            <div style={{ 
              padding: '0.75rem', 
              backgroundColor: '#f3f4f6', 
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              <strong>Inspecteur:</strong> {user?.prenom} {user?.nom}<br/>
              <strong>Date:</strong> {new Date().toLocaleDateString('fr-CA')} à {new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !selectedEquipementId}
            style={{ backgroundColor: '#f97316' }}
          >
            {saving ? '⏳ Enregistrement...' : '💾 Enregistrer l\'inspection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InspectionAPRIAModal;
