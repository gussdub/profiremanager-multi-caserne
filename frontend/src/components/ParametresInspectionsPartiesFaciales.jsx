import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useTenant } from '../contexts/TenantContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

const ParametresInspectionsPiecesFaciales = ({ user }) => {
  const { tenantSlug } = useTenant();
  const [modeles, setModeles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingModele, setEditingModele] = useState(null);
  const [saving, setSaving] = useState(false);

  // État du formulaire d'édition
  const [formData, setFormData] = useState({
    nom: '',
    description: '',
    frequence: 'mensuelle',
    sections: []
  });

  useEffect(() => {
    fetchModeles();
  }, [tenantSlug]);

  const fetchModeles = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/parties-faciales/modeles-inspection');
      setModeles(data || []);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (modele = null) => {
    if (modele) {
      setEditingModele(modele);
      setFormData({
        nom: modele.nom || '',
        description: modele.description || '',
        frequence: modele.frequence || 'mensuelle',
        sections: modele.sections || []
      });
    } else {
      setEditingModele(null);
      setFormData({
        nom: 'Nouveau formulaire',
        description: '',
        frequence: 'mensuelle',
        sections: [
          {
            id: `section_${Date.now()}`,
            titre: 'Inspection visuelle',
            icone: '👁️',
            type_champ: 'radio',
            options: [
              { label: 'Conforme', declencherAlerte: false },
              { label: 'Non conforme', declencherAlerte: true }
            ],
            items: [],
            ordre: 0
          }
        ]
      });
    }
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingModele(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (editingModele) {
        await apiPut(tenantSlug, `/parties-faciales/modeles-inspection/${editingModele.id}`, formData);
      } else {
        await apiPost(tenantSlug, '/parties-faciales/modeles-inspection', formData);
      }
      await fetchModeles();
      closeEditor();
      alert('✅ Formulaire enregistré !');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (modeleId) => {
    try {
      await apiPost(tenantSlug, `/parties-faciales/modeles-inspection/${modeleId}/activer`, {});
      await fetchModeles();
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  };

  const handleDelete = async (modeleId) => {
    if (!window.confirm('Supprimer ce formulaire ?')) return;
    try {
      await apiDelete(tenantSlug, `/parties-faciales/modeles-inspection/${modeleId}`);
      await fetchModeles();
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  };

  // Gestion des sections
  const addSection = () => {
    setFormData({
      ...formData,
      sections: [
        ...formData.sections,
        {
          id: `section_${Date.now()}`,
          titre: 'Nouvelle section',
          icone: '📋',
          type_champ: 'radio',
          options: [
            { label: 'Conforme', declencherAlerte: false },
            { label: 'Non conforme', declencherAlerte: true }
          ],
          items: [],
          ordre: formData.sections.length
        }
      ]
    });
  };

  const updateSection = (sectionIndex, updates) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex] = { ...newSections[sectionIndex], ...updates };
    setFormData({ ...formData, sections: newSections });
  };

  const deleteSection = (sectionIndex) => {
    const newSections = formData.sections.filter((_, i) => i !== sectionIndex);
    setFormData({ ...formData, sections: newSections });
  };

  // Gestion des items dans une section
  const addItem = (sectionIndex) => {
    const newSections = [...formData.sections];
    const section = newSections[sectionIndex];
    section.items = [
      ...(section.items || []),
      {
        id: `item_${Date.now()}`,
        nom: 'Nouvel élément à vérifier',
        ordre: (section.items || []).length
      }
    ];
    setFormData({ ...formData, sections: newSections });
  };

  const updateItem = (sectionIndex, itemIndex, updates) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].items[itemIndex] = {
      ...newSections[sectionIndex].items[itemIndex],
      ...updates
    };
    setFormData({ ...formData, sections: newSections });
  };

  const deleteItem = (sectionIndex, itemIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].items = newSections[sectionIndex].items.filter((_, i) => i !== itemIndex);
    setFormData({ ...formData, sections: newSections });
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        Chargement...
      </div>
    );
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🎭 Formulaires d'inspection - Pièces faciales</h3>
        <Button onClick={() => openEditor()} style={{ backgroundColor: '#10b981', fontSize: '0.85rem' }}>
          + Nouveau formulaire
        </Button>
      </div>

      {/* Liste des modèles */}
      {modeles.length === 0 ? (
        <div style={{ 
          padding: '2rem', 
          textAlign: 'center', 
          backgroundColor: '#f9fafb', 
          borderRadius: '8px',
          border: '1px dashed #d1d5db'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
          <p style={{ color: '#6b7280' }}>Aucun formulaire créé.</p>
          <Button onClick={() => openEditor()} style={{ marginTop: '1rem' }}>
            Créer un formulaire
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {modeles.map(modele => (
            <div 
              key={modele.id}
              style={{
                padding: '1rem',
                backgroundColor: modele.est_actif ? '#f0fdf4' : 'white',
                border: modele.est_actif ? '2px solid #22c55e' : '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: '600' }}>{modele.nom}</span>
                    {modele.est_actif && (
                      <span style={{ 
                        backgroundColor: '#22c55e', 
                        color: 'white', 
                        padding: '0.125rem 0.5rem', 
                        borderRadius: '9999px', 
                        fontSize: '0.7rem',
                        fontWeight: '600'
                      }}>
                        ACTIF
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>
                    {modele.description || 'Aucune description'}
                  </p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    {modele.sections?.length || 0} section(s) • Fréquence: {modele.frequence || 'non définie'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  {!modele.est_actif && (
                    <Button 
                      size="sm" 
                      onClick={() => handleActivate(modele.id)}
                      style={{ backgroundColor: '#22c55e', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Activer
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => openEditor(modele)}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  >
                    ✏️
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleDelete(modele.id)}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', color: '#ef4444', borderColor: '#ef4444' }}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal d'édition */}
      {showEditor && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '0.5rem',
            overflowY: 'auto'
          }}
          onClick={(e) => e.target === e.currentTarget && closeEditor()}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '700px',
              margin: '0.5rem auto',
              maxHeight: 'calc(100vh - 1rem)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{ 
              padding: '1rem', 
              borderBottom: '1px solid #e5e7eb', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              backgroundColor: '#f97316',
              borderRadius: '12px 12px 0 0'
            }}>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1rem' }}>
                {editingModele ? '✏️ Modifier le formulaire' : '📋 Nouveau formulaire'}
              </h3>
              <button onClick={closeEditor} style={{ 
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
                justifyContent: 'center'
              }}>×</button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              {/* Infos générales */}
              <div style={{ marginBottom: '1rem' }}>
                <Label style={{ fontSize: '0.85rem' }}>Nom du formulaire</Label>
                <Input
                  value={formData.nom}
                  onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <Label style={{ fontSize: '0.85rem' }}>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  style={{ fontSize: '16px' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <Label style={{ fontSize: '0.85rem' }}>Fréquence d'inspection</Label>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                  {[
                    { value: 'mensuelle', label: '📅 Mensuelle' },
                    { value: 'apres_usage', label: '🔧 Après usage' },
                    { value: 'les_deux', label: '📅🔧 Les deux' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, frequence: opt.value })}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: formData.frequence === opt.value ? 'none' : '1px solid #d1d5db',
                        backgroundColor: formData.frequence === opt.value ? '#f97316' : 'white',
                        color: formData.frequence === opt.value ? 'white' : '#374151',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sections */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <Label style={{ fontSize: '0.9rem', fontWeight: '600' }}>Sections du formulaire</Label>
                  <Button onClick={addSection} size="sm" style={{ fontSize: '0.75rem' }}>
                    + Section
                  </Button>
                </div>

                {formData.sections.map((section, sectionIndex) => (
                  <div 
                    key={section.id}
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      backgroundColor: '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <Input
                        value={section.titre}
                        onChange={(e) => updateSection(sectionIndex, { titre: e.target.value })}
                        style={{ flex: 1, fontWeight: '600', fontSize: '0.9rem' }}
                        placeholder="Titre de la section"
                      />
                      <button
                        onClick={() => deleteSection(sectionIndex)}
                        style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                      >
                        🗑️
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <select
                        value={section.type_champ}
                        onChange={(e) => updateSection(sectionIndex, { type_champ: e.target.value })}
                        style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                      >
                        <option value="radio">Conforme/Non conforme</option>
                        <option value="text">Texte libre</option>
                        <option value="number">Nombre</option>
                      </select>
                      <select
                        value={section.icone || '📋'}
                        onChange={(e) => updateSection(sectionIndex, { icone: e.target.value })}
                        style={{ padding: '0.25rem', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                      >
                        <option value="👁️">👁️ Visuel</option>
                        <option value="🎭">🎭 Masque</option>
                        <option value="💨">💨 Étanchéité</option>
                        <option value="🔧">🔧 Mécanique</option>
                        <option value="✅">✅ Résultat</option>
                        <option value="📝">📝 Notes</option>
                        <option value="📋">📋 Général</option>
                      </select>
                    </div>

                    {/* Items de la section */}
                    {section.type_champ === 'radio' && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Éléments à vérifier :</span>
                          <button
                            onClick={() => addItem(sectionIndex)}
                            style={{ fontSize: '0.75rem', background: '#3b82f6', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            + Élément
                          </button>
                        </div>
                        {(section.items || []).map((item, itemIndex) => (
                          <div key={item.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <Input
                              value={item.nom}
                              onChange={(e) => updateItem(sectionIndex, itemIndex, { nom: e.target.value })}
                              style={{ flex: 1, fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}
                              placeholder="Élément à vérifier"
                            />
                            <button
                              onClick={() => deleteItem(sectionIndex, itemIndex)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ 
              padding: '1rem', 
              borderTop: '1px solid #e5e7eb', 
              display: 'flex', 
              gap: '0.5rem' 
            }}>
              <Button variant="outline" onClick={closeEditor} style={{ flex: 1 }} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={handleSave} style={{ flex: 1, backgroundColor: '#f97316' }} disabled={saving}>
                {saving ? '⏳...' : '💾 Enregistrer'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParametresInspectionsPiecesFaciales;
