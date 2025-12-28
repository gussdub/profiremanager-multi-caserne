import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const EditerGrille = ({ grille, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: grille.nom,
    groupe_occupation: grille.groupe_occupation || '',
    sections: grille.sections || [],
    actif: grille.actif !== false,
    version: grille.version || '1.0'
  });
  const [saving, setSaving] = useState(false);

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { titre: '', questions: [] }]
    });
  };

  const removeSection = (index) => {
    setFormData({
      ...formData,
      sections: formData.sections.filter((_, i) => i !== index)
    });
  };

  const updateSection = (index, field, value) => {
    const newSections = [...formData.sections];
    newSections[index] = { ...newSections[index], [field]: value };
    setFormData({ ...formData, sections: newSections });
  };

  const addQuestion = (sectionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = [...(newSections[sectionIndex].questions || []), ''];
    setFormData({ ...formData, sections: newSections });
  };

  const removeQuestion = (sectionIndex, questionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = newSections[sectionIndex].questions.filter((_, i) => i !== questionIndex);
    setFormData({ ...formData, sections: newSections });
  };

  const updateQuestion = (sectionIndex, questionIndex, value) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions[questionIndex] = value;
    setFormData({ ...formData, sections: newSections });
  };

  const handleSave = async () => {
    if (!formData.nom) {
      toast({
        title: "Validation",
        description: "Le nom de la grille est requis",
        variant: "destructive"
      });
      return;
    }

    if (formData.sections.length === 0) {
      toast({
        title: "Validation",
        description: "La grille doit contenir au moins une section",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPut(tenantSlug, `/prevention/grilles-inspection/${grille.id}`, formData);
      
      toast({
        title: "Succès",
        description: "Grille mise à jour avec succès"
      });
      
      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editer-grille-container">
      <div className="page-header">
        <h2>✏️ Modifier la Grille: {grille.nom}</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={onClose}>
            ✕ Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="grille-form">
        {/* Informations générales */}
        <div className="form-section">
          <h3>Informations Générales</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="form-input"
                placeholder="Ex: Grille Résidentielle Personnalisée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
                className="form-select"
              >
                <option value="">-- Sélectionner --</option>
                <option value="A">A - Habitation</option>
                <option value="B">B - Soins et détention</option>
                <option value="C">C - Résidentiel</option>
                <option value="D">D - Affaires</option>
                <option value="E">E - Commerce</option>
                <option value="F">F - Industriel</option>
                <option value="I">I - Assemblée</option>
              </select>
            </div>
            <div className="form-field">
              <label>Version</label>
              <input
                type="text"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                className="form-input"
                placeholder="1.0"
              />
            </div>
            <div className="form-field checkbox-field">
              <label>
                <input
                  type="checkbox"
                  checked={formData.actif}
                  onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
                />
                <span>Grille active</span>
              </label>
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="form-section">
          <div className="section-header">
            <h3>Sections ({formData.sections.length})</h3>
            <Button size="sm" onClick={addSection}>
              ➕ Ajouter une section
            </Button>
          </div>

          <div className="sections-list">
            {formData.sections.map((section, sectionIndex) => (
              <div key={sectionIndex} className="section-editor">
                <div className="section-editor-header">
                  <h4>Section {sectionIndex + 1}</h4>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => removeSection(sectionIndex)}
                  >
                    🗑️ Supprimer section
                  </Button>
                </div>

                <div className="section-editor-content">
                  <div className="form-field">
                    <label>Titre de la section *</label>
                    <input
                      type="text"
                      value={section.titre}
                      onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                      className="form-input"
                      placeholder="Ex: Voies d'évacuation"
                    />
                  </div>

                  <div className="questions-editor">
                    <div className="questions-header">
                      <label>Questions ({section.questions?.length || 0})</label>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => addQuestion(sectionIndex)}
                      >
                        ➕ Ajouter question
                      </Button>
                    </div>

                    <div className="questions-list-editor">
                      {(section.questions || []).map((question, questionIndex) => (
                        <div key={questionIndex} className="question-editor-item">
                          <span className="question-number">{questionIndex + 1}.</span>
                          <input
                            type="text"
                            value={question}
                            onChange={(e) => updateQuestion(sectionIndex, questionIndex, e.target.value)}
                            className="question-input"
                            placeholder="Entrez votre question..."
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeQuestion(sectionIndex, questionIndex)}
                            className="remove-question-btn"
                          >
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {formData.sections.length === 0 && (
            <div className="empty-state">
              <p>Aucune section. Cliquez sur "Ajouter une section" pour commencer.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const GrillesInspection = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [grilles, setGrilles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingGrille, setEditingGrille] = useState(null);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(null);

  const fetchGrilles = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
      setGrilles(data);
    } catch (error) {
      console.error('Erreur chargement grilles:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les grilles d'inspection",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrilles();
  }, [tenantSlug]);

  const handleDeleteGrille = async (grilleId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette grille ?')) return;
    
    try {
      await apiDelete(tenantSlug, `/prevention/grilles-inspection/${grilleId}`);
      toast({
        title: "Succès",
        description: "Grille supprimée avec succès"
      });
      fetchGrilles();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la grille",
        variant: "destructive"
      });
    }
  };

  // Modal de prévisualisation du template
  if (viewingTemplate) {
    return (
      <TemplatePreviewModal 
        template={viewingTemplate}
        onClose={() => setViewingTemplate(null)}
        onUse={(template) => {
          setViewingTemplate(null);
          setCreatingFromTemplate(template);
        }}
      />
    );
  }

  // Édition d'une grille à partir d'un template
  if (creatingFromTemplate) {
    return (
      <EditerGrilleFromTemplate 
        template={creatingFromTemplate}
        onClose={() => setCreatingFromTemplate(null)}
        onSave={() => {
          setCreatingFromTemplate(null);
          fetchGrilles();
        }}
      />
    );
  }

  // Édition d'une grille existante
  if (editingGrille) {
    return <EditerGrille grille={editingGrille} onClose={() => setEditingGrille(null)} onSave={() => { setEditingGrille(null); fetchGrilles(); }} />;
  }

  if (loading) {
    return <div className="loading">Chargement des grilles...</div>;
  }

  return (
    <div className="grilles-inspection-container">
      {/* Grilles disponibles */}
      <div className="default-grilles-section">
        <h3>📋 Grilles d'Inspection Disponibles</h3>
        <p>Grilles d'inspection configurées pour votre service selon le Code de sécurité du Québec</p>
        
        {grilles.length === 0 && (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center', 
            backgroundColor: '#fef3c7', 
            border: '2px solid #fcd34d',
            borderRadius: '8px',
            margin: '1rem 0'
          }}>
            <p style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>⚠️ Aucune grille d'inspection configurée</p>
            <p style={{ color: '#92400e', marginBottom: '1rem' }}>
              Pour utiliser le module de prévention, vous devez d'abord initialiser les grilles d'inspection standards.
            </p>
            <Button 
              onClick={async () => {
                try {
                  setLoading(true);
                  await apiPost(tenantSlug, '/prevention/initialiser', {});
                  toast({
                    title: "Succès",
                    description: "7 grilles d'inspection créées avec succès"
                  });
                  fetchGrilles();
                } catch (error) {
                  toast({
                    title: "Erreur",
                    description: error.response?.data?.detail || "Impossible d'initialiser les grilles",
                    variant: "destructive"
                  });
                } finally {
                  setLoading(false);
                }
              }}
            >
              🚀 Initialiser les 7 grilles standards
            </Button>
          </div>
        )}
        
        <div className="default-grilles-grid">
          {grilles.map(grille => (
            <div key={grille.id} className="template-card">
              <div className="template-header">
                <h4>{grille.groupe_occupation ? `Groupe ${grille.groupe_occupation}` : 'Grille personnalisée'}</h4>
                {grille.groupe_occupation && <span className="groupe-badge">{grille.groupe_occupation}</span>}
              </div>
              <div className="template-info">
                <p><strong>{grille.nom}</strong></p>
                <p>{grille.description || 'Grille d\'inspection personnalisée'}</p>
                <div className="template-stats">
                  <span className="stat">{grille.sections?.length || 0} sections</span>
                  <span className="stat">{grille.sections?.reduce((acc, s) => acc + (s.questions?.length || 0), 0) || 0} questions</span>
                </div>
                {grille.sous_types && grille.sous_types.length > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    Sous-types: {grille.sous_types.join(', ')}
                  </div>
                )}
              </div>
              <div className="template-actions">
                <Button 
                  size="sm" 
                  onClick={() => setViewingTemplate(grille)}
                >
                  👀 Aperçu
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setEditingGrille(grille)}
                >
                  📝 Modifier
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('Dupliquer cette grille pour créer une variante?')) return;
                    const nouveauNom = prompt('Nom de la nouvelle grille:', `${grille.nom} (Copie)`);
                    if (!nouveauNom) return;
                    
                    try {
                      await apiPost(tenantSlug, `/prevention/grilles-inspection/${grille.id}/dupliquer?nouveau_nom=${encodeURIComponent(nouveauNom)}`, {});
                      toast({
                        title: "Succès",
                        description: "Grille dupliquée avec succès"
                      });
                      fetchGrilles();
                    } catch (error) {
                      toast({
                        title: "Erreur",
                        description: "Impossible de dupliquer la grille",
                        variant: "destructive"
                      });
                    }
                  }}
                >
                  📋 Dupliquer
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => handleDeleteGrille(grille.id)}
                >
                  🗑️ Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note informative */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '8px'
      }}>
        <p style={{ fontSize: '0.875rem', color: '#0369a1' }}>
          ℹ️ <strong>Astuce</strong>: Les grilles peuvent être dupliquées pour créer des variantes adaptées à vos besoins spécifiques.
          Les sous-types permettent d'afficher des questions conditionnelles lors des inspections.
        </p>
      </div>

      {/* Anciennes grilles personnalisées supprimées - maintenant toutes les grilles sont dans la même liste */}
      <div style={{ display: 'none' }}>
        {/* Section supprimée - grilles personnalisées fusionnées avec grilles principales */}
        <div className="custom-grilles-section">
          <h3>🛠️ Grilles Personnalisées</h3>
          <div className="empty-state">
            <p>Section fusionnée avec grilles principales ci-dessus</p>
          </div>
        </div>
      </div>

      {/* Reste du code inchangé - ne pas modifier */}
      <div style={{ display: 'none' }}>
        {grilles.length > 0 && (
          <div className="custom-grilles-grid">
            {grilles.map(grille => (
              <div key={grille.id} className="grille-card">
                <div className="grille-header">
                  <h4>{grille.nom}</h4>
                  <span className="groupe-badge">{grille.groupe_occupation}</span>
                </div>
                <div className="grille-info">
                  <p>Version: {grille.version}</p>
                  <p>Sections: {grille.sections?.length || 0}</p>
                  <p>Statut: {grille.actif ? '✅ Actif' : '❌ Inactif'}</p>
                </div>
                <div className="grille-actions">
                  <Button size="sm" onClick={() => setEditingGrille(grille)}>Modifier</Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDeleteGrille(grille.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* L'aperçu s'ouvre maintenant dans un modal au clic */}
    </div>
  );

};

// Modal de prévisualisation du template
const TemplatePreviewModal = ({ template, onClose, onUse }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '900px',
        maxHeight: '80vh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              📋 Grille Template - Groupe {template.groupe}
            </h2>
            <p style={{ color: '#6b7280' }}>{template.nom}</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>{template.description}</p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem',
              border: 'none',
              background: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
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
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <strong>📊 Statistiques:</strong>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem' }}>
              <span>🗂️ {template.sections.length} sections</span>
              <span>❓ {template.sections.reduce((acc, s) => acc + s.questions.length, 0)} questions</span>
            </div>
          </div>

          {template.sections.map((section, idx) => (
            <div key={idx} style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px'
            }}>
              <h4 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {section.titre}
              </h4>
              {section.description && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem', fontStyle: 'italic' }}>
                  {section.description}
                </p>
              )}
              
              <div style={{ paddingLeft: '1rem' }}>
                {section.questions.map((q, qIdx) => (
                  <div key={qIdx} style={{
                    padding: '0.5rem 0',
                    borderBottom: qIdx < section.questions.length - 1 ? '1px solid #f3f4f6' : 'none'
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>
                      {qIdx + 1}. {q.question}
                    </span>
                    <span style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      color: '#9ca3af',
                      fontStyle: 'italic'
                    }}>
                      ({q.type})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem'
        }}>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
          <Button onClick={() => onUse(template)}>
            📝 Utiliser & Personnaliser
          </Button>
        </div>
      </div>
    </div>
  );
};

// Éditeur de grille depuis template (avec questions pré-remplies)
const EditerGrilleFromTemplate = ({ template, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: `${template.nom} (Personnalisée)`,
    groupe_occupation: template.groupe,
    sections: JSON.parse(JSON.stringify(template.sections)), // Deep copy
    actif: true,
    version: "1.0"
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.nom) {
      toast({
        title: "Validation",
        description: "Le nom de la grille est requis",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPost(tenantSlug, '/prevention/grilles-inspection', formData);
      
      toast({
        title: "Succès",
        description: "Grille créée avec succès"
      });
      
      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({
        title: "Erreur",
        description: "Impossible de sauvegarder la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setFormData({
      ...formData,
      sections: [...formData.sections, { titre: '', description: '', questions: [] }]
    });
  };

  const removeSection = (index) => {
    const newSections = formData.sections.filter((_, i) => i !== index);
    setFormData({ ...formData, sections: newSections });
  };

  const updateSection = (index, field, value) => {
    const newSections = [...formData.sections];
    newSections[index] = { ...newSections[index], [field]: value };
    setFormData({ ...formData, sections: newSections });
  };

  const addQuestion = (sectionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = [
      ...(newSections[sectionIndex].questions || []),
      { question: '', type: 'choix', options: ['Conforme', 'Non-conforme', 'S.O.'] }
    ];
    setFormData({ ...formData, sections: newSections });
  };

  const removeQuestion = (sectionIndex, questionIndex) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions = newSections[sectionIndex].questions.filter((_, i) => i !== questionIndex);
    setFormData({ ...formData, sections: newSections });
  };

  const updateQuestion = (sectionIndex, questionIndex, field, value) => {
    const newSections = [...formData.sections];
    newSections[sectionIndex].questions[questionIndex] = {
      ...newSections[sectionIndex].questions[questionIndex],
      [field]: value
    };
    setFormData({ ...formData, sections: newSections });
  };

  return (
    <div className="editer-grille-container">
      <div className="page-header">
        <h2>✏️ Personnaliser: {template.nom}</h2>
        <div className="header-actions">
          <Button variant="outline" onClick={onClose}>
            ✕ Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>

      <div className="grille-form">
        {/* Informations générales */}
        <div className="form-section">
          <h3>Informations Générales</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                className="form-input"
                placeholder="Ex: Grille Résidentielle Personnalisée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
                className="form-select"
              >
                <option value="">-- Sélectionner --</option>
                <option value="A">A - Établissements de réunion</option>
                <option value="B">B - Soins ou détention</option>
                <option value="C">C - Résidentiel</option>
                <option value="D">D - Affaires et services personnels</option>
                <option value="E">E - Commercial</option>
                <option value="F">F - Industriel</option>
                <option value="G">G - Agricole</option>
              </select>
            </div>
          </div>

          {/* Info sur les sous-types */}
          {formData.groupe_occupation && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#eff6ff',
              borderLeft: '4px solid #3b82f6',
              borderRadius: '4px'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
                <div>
                  <strong style={{ fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>
                    Grille Universelle avec Questions Conditionnelles
                  </strong>
                  <p style={{ fontSize: '0.875rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                    Cette grille s'adapte automatiquement selon le <strong>sous-type du bâtiment</strong> lors de l'inspection.
                    Les questions non pertinentes seront masquées.
                  </p>
                  
                  {formData.groupe_occupation === 'C' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Unifamiliale, Bifamiliale, Multifamiliale (3-8), Multifamiliale (9+), Copropriété, Maison mobile
                    </div>
                  )}
                  {formData.groupe_occupation === 'E' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Bureau, Magasin, Restaurant, Hôtel, Centre commercial
                    </div>
                  )}
                  {formData.groupe_occupation === 'F' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Manufacture légère, Manufacture lourde, Entrepôt, Usine, Atelier
                    </div>
                  )}
                  {formData.groupe_occupation === 'B' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> École, Hôpital, CHSLD, Centre communautaire, Église, Bibliothèque
                    </div>
                  )}
                  {formData.groupe_occupation === 'G' && (
                    <div style={{ fontSize: '0.75rem', color: '#1e3a8a', marginTop: '0.5rem' }}>
                      <strong>Sous-types supportés :</strong> Ferme, Grange, Serre, Écurie, Silo
                    </div>
                  )}
                  
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.5rem',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    color: '#059669'
                  }}>
                    ✅ <strong>Comment ça marche :</strong><br/>
                    1. Le sous-type est défini sur le <strong>bâtiment</strong> (dans le modal bâtiment)<br/>
                    2. Lors de l'inspection, seules les questions pertinentes s'affichent<br/>
                    3. Vous pouvez ajouter des conditions aux questions (ex: "condition: multi_9 || copropriete")
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Option: Grille spécifique à un sous-type */}
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontSize: '0.875rem',
              color: '#3b82f6',
              padding: '0.5rem',
              backgroundColor: '#f9fafb',
              borderRadius: '4px'
            }}>
              🔧 Option Avancée : Créer une grille spécifique à un sous-type
            </summary>
            <div style={{ 
              marginTop: '0.5rem', 
              padding: '1rem',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              backgroundColor: '#fefce8'
            }}>
              <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                ⚠️ Par défaut, une grille s'applique à TOUS les sous-types d'un groupe.
              </p>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                Si vous voulez créer une grille qui ne s'applique qu'à un sous-type spécifique 
                (ex: uniquement pour Maisons mobiles), ajoutez un suffixe clair au nom.
              </p>
              <div className="form-field">
                <label style={{ fontSize: '0.875rem' }}>Sous-type cible (optionnel)</label>
                <input
                  type="text"
                  value={formData.sous_type_cible || ''}
                  onChange={(e) => setFormData({ ...formData, sous_type_cible: e.target.value })}
                  placeholder="Ex: maison_mobile, hotel, manufacture_legere"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Laissez vide pour une grille universelle (recommandé)
                </p>
              </div>
            </div>
          </details>
        </div>

        {/* Sections et questions */}
        <div className="form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Sections et Questions</h3>
            <Button size="sm" onClick={addSection}>
              ➕ Ajouter une section
            </Button>
          </div>

          {formData.sections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="section-editor" style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h4>Section {sectionIndex + 1}</h4>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => removeSection(sectionIndex)}
                >
                  🗑️ Supprimer section
                </Button>
              </div>

              <div className="form-field">
                <label>Titre de la section *</label>
                <input
                  type="text"
                  value={section.titre}
                  onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                  className="form-input"
                  placeholder="Ex: Voies d'évacuation"
                />
              </div>

              <div className="form-field">
                <label>Description</label>
                <textarea
                  value={section.description || ''}
                  onChange={(e) => updateSection(sectionIndex, 'description', e.target.value)}
                  className="form-textarea"
                  placeholder="Description optionnelle de la section"
                  rows={2}
                />
              </div>

              {/* Questions */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>Questions:</strong>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => addQuestion(sectionIndex)}
                  >
                    ➕ Ajouter question
                  </Button>
                </div>

                {section.questions && section.questions.map((question, qIndex) => (
                  <div key={qIndex} style={{
                    backgroundColor: 'white',
                    padding: '1rem',
                    borderRadius: '6px',
                    marginBottom: '0.5rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <input
                        type="text"
                        value={question.question}
                        onChange={(e) => updateQuestion(sectionIndex, qIndex, 'question', e.target.value)}
                        placeholder="Texte de la question"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px'
                        }}
                      />
                      <select
                        value={question.type}
                        onChange={(e) => updateQuestion(sectionIndex, qIndex, 'type', e.target.value)}
                        style={{
                          padding: '0.5rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px'
                        }}
                      >
                        <option value="choix">Choix multiple</option>
                        <option value="texte">Texte libre</option>
                        <option value="photos">Photos</option>
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeQuestion(sectionIndex, qIndex)}
                      >
                        🗑️
                      </Button>
                    </div>

                    {/* Photos de référence - optionnel pour guider l'inspecteur */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <details style={{ fontSize: '0.875rem' }}>
                        <summary style={{ cursor: 'pointer', color: '#3b82f6' }}>
                          📷 Photos de référence (optionnel)
                        </summary>
                        <div style={{ 
                          marginTop: '0.5rem', 
                          padding: '0.75rem', 
                          backgroundColor: '#f9fafb',
                          borderRadius: '4px'
                        }}>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                            Ajoutez des photos/schémas pour aider l'inspecteur (ex: localisation extincteur, schéma technique)
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            
                            multiple
                            onChange={(e) => {
                              const files = Array.from(e.target.files);
                              // Pour l'instant, on stocke juste les noms
                              // TODO: Upload vers serveur et stocker URLs
                              const photoNames = files.map(f => f.name);
                              updateQuestion(sectionIndex, qIndex, 'photos_reference', [
                                ...(question.photos_reference || []),
                                ...photoNames
                              ]);
                            }}
                            style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}
                          />
                          
                          {question.photos_reference && question.photos_reference.length > 0 && (
                            <div style={{ marginTop: '0.5rem' }}>
                              <strong style={{ fontSize: '0.75rem' }}>Photos ajoutées:</strong>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                                {question.photos_reference.map((photo, pIdx) => (
                                  <div key={pIdx} style={{
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: 'white',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem'
                                  }}>
                                    📎 {photo}
                                    <button
                                      onClick={() => {
                                        const newPhotos = question.photos_reference.filter((_, i) => i !== pIdx);
                                        updateQuestion(sectionIndex, qIndex, 'photos_reference', newPhotos);
                                      }}
                                      style={{
                                        border: 'none',
                                        background: 'none',
                                        cursor: 'pointer',
                                        color: '#ef4444',
                                        fontSize: '0.875rem'
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>

                    {/* Champ observations si non-conforme */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        color: '#6b7280'
                      }}>
                        <input
                          type="checkbox"
                          checked={question.photo_requise_si_non_conforme || false}
                          onChange={(e) => updateQuestion(sectionIndex, qIndex, 'photo_requise_si_non_conforme', e.target.checked)}
                        />
                        📸 Photo obligatoire si non-conforme
                      </label>
                    </div>

                    {/* Condition d'affichage */}
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ 
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        color: '#9ca3af'
                      }}>
                        🔀 Question conditionnelle (avancé)
                      </summary>
                      <div style={{ 
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '4px'
                      }}>
                        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>
                          Condition d'affichage
                        </label>
                        <input
                          type="text"
                          value={question.condition || ''}
                          onChange={(e) => updateQuestion(sectionIndex, qIndex, 'condition', e.target.value)}
                          placeholder="Ex: multi_9 || copropriete"
                          style={{
                            width: '100%',
                            padding: '0.25rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '0.75rem'
                          }}
                        />
                        <p style={{ fontSize: '0.65rem', color: '#92400e', marginTop: '0.25rem' }}>
                          Utilisez les sous-types: unifamiliale, bifamiliale, multi_3_8, multi_9, copropriete, maison_mobile, bureau, magasin, restaurant, hotel, etc.
                          <br/>Opérateurs: || (OU), && (ET)
                          <br/>Laissez vide pour afficher toujours
                        </p>
                        {question.condition && (
                          <div style={{ 
                            marginTop: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#dcfce7',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            color: '#166534'
                          }}>
                            ✓ Cette question s'affichera seulement pour: <strong>{question.condition}</strong>
                          </div>
                        )}
                      </div>
                    </details>

                    {question.type === 'photos' && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', marginTop: '0.5rem' }}>
                        💡 Type "Photos": L'inspecteur pourra prendre plusieurs photos librement
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CreateGrilleInspection = ({ onSave, onViewTemplates }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nom: '',
    groupe_occupation: '',
    sections: [],
    actif: true,
    version: '1.0'
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!formData.nom || !formData.groupe_occupation) {
      toast({
        title: "Validation",
        description: "Veuillez remplir tous les champs requis",
        variant: "destructive"
      });
      return;
    }

    try {
      setSaving(true);
      await apiPost(tenantSlug, '/prevention/grilles-inspection', formData);
      
      toast({
        title: "Succès",
        description: "Grille créée avec succès"
      });
      
      onSave();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la grille",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="create-grille-container">
      <div className="grille-form">
        <div className="form-section">
          <h3>ℹ️ Informations de base</h3>
          <div className="form-fields">
            <div className="form-field">
              <label>Nom de la grille *</label>
              <input
                type="text"
                value={formData.nom}
                onChange={(e) => setFormData({...formData, nom: e.target.value})}
                placeholder="Ex: Inspection Commerciale Détaillée"
              />
            </div>
            <div className="form-field">
              <label>Groupe d'occupation *</label>
              <select
                value={formData.groupe_occupation}
                onChange={(e) => setFormData({...formData, groupe_occupation: e.target.value})}
              >
                <option value="">Sélectionner un groupe</option>
                <option value="A">Groupe A - Résidentiel unifamilial</option>
                <option value="B">Groupe B - Soins et détention</option>
                <option value="C">Groupe C - Résidentiel</option>
                <option value="D">Groupe D - Affaires et services personnels</option>
                <option value="E">Groupe E - Commerce</option>
                <option value="F">Groupe F - Industriel</option>
                <option value="G">Groupe G - Garages et stations-service</option>
                <option value="H">Groupe H - Risques élevés</option>
                <option value="I">Groupe I - Assemblée</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>📝 Recommandation</h3>
          <div className="recommendation-note">
            <p>💡 <strong>Pour commencer rapidement :</strong></p>
            <p>Nous recommandons d'utiliser les <strong>grilles templates</strong> pré-configurées selon le Code de sécurité du Québec. Vous pourrez ensuite les personnaliser selon vos besoins.</p>
            <Button 
              variant="outline"
              onClick={onViewTemplates}
            >
              📋 Voir les templates disponibles
            </Button>
          </div>
        </div>

        <div className="form-actions">
          <Button variant="outline" onClick={onSave}>
            Annuler
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Création...' : 'Créer la grille'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// Templates de grilles d'inspection par défaut
const DEFAULT_GRILLES_TEMPLATES = [
  {
    groupe: "C",
    nom: "Résidentiel - Habitation",
    description: "Maisons unifamiliales, duplex, immeubles résidentiels",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Identification complète de l'établissement et des responsables",
        questions: [
          { question: "Plan de mesures d'urgence en cas d'incendie affiché?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan à jour et exercé dans la dernière année?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis d'occupation valide affiché?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Notes générales", type: "texte" },
          { question: "Photos", type: "photos" }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Vérification de la documentation obligatoire",
        questions: [
          { question: "Plans d'évacuation affichés et visibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registres d'entretien tenus à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Notes sur la documentation", type: "texte" }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Vérification des moyens d'évacuation et de leur accessibilité",
        questions: [
          { question: "Nombre de sorties suffisant et bien réparties?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Panneaux 'SORTIE' clairs et éclairés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes de sortie faciles à ouvrir de l'intérieur?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Dégagements libres de tout encombrement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de sécurité fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des voies d'évacuation", type: "photos" }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Vérification des équipements de protection contre l'incendie",
        questions: [
          { question: "Détecteurs de fumée présents et fonctionnels?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Date de fabrication des détecteurs < 10 ans?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détecteurs CO présents si applicable?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs présents et accessibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Inspection mensuelle extincteurs à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des équipements", type: "photos" }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Évaluation des risques particuliers selon l'occupation",
        questions: [
          { question: "Dégagement libre devant panneau électrique (1m)?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aucun fil électrique dénudé visible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Appareils à combustible: dégagements respectés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Conduits d'évacuation en bon état?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Photos des risques identifiés", type: "photos" }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Vérification de l'accessibilité pour les véhicules d'urgence",
        questions: [
          { question: "Adresse civique visible de la rue?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Voie d'accès dégagée pour véhicules d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Poteau d'incendie dégagé et accessible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "E",
    nom: "Commerce - Établissements commerciaux",
    description: "Magasins, centres commerciaux, bureaux commerciaux",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Identification complète de l'établissement commercial",
        questions: [
          { question: "Plan de mesures d'urgence affiché et accessible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Responsable sécurité incendie identifié?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis d'occupation commercial valide?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Formation du personnel sur évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation spécifique aux établissements commerciaux",
        questions: [
          { question: "Plans d'évacuation affichés à chaque étage?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registre des exercices d'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Certificats des systèmes de protection à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Moyens d'évacuation pour occupation commerciale",
        questions: [
          { question: "Sorties de secours dégagées et signalisées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Largeur des dégagements conforme au nombre d'occupants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes équipées de dispositifs anti-panique?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage d'urgence testé mensuellement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aucun stockage dans les dégagements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Systèmes de protection spécifiques aux commerces",
        questions: [
          { question: "Système d'alarme incendie fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détecteurs de fumée dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs appropriés au type de risque?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de gicleurs (si requis) opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Robinets d'incendie armés accessibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques particuliers aux activités commerciales",
        questions: [
          { question: "Stockage respecte les distances de sécurité?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Piles de marchandises stables et limitées en hauteur?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Séparation des produits incompatibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Zones de livraison dégagées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système électrique conforme et entretenu?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès pour intervention en milieu commercial",
        questions: [
          { question: "Signalisation claire pour identification du bâtiment?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Accès véhicules lourds possible et dégagé?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Boîte à clés (Knox Box) installée si requise?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan d'intervention disponible sur site?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "F",
    nom: "Industriel - Établissements industriels",
    description: "Usines, ateliers, entrepôts industriels",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Information sur l'établissement industriel et ses activités",
        questions: [
          { question: "Plan d'intervention d'urgence détaillé disponible?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Équipe de sécurité incendie formée et désignée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis pour matières dangereuses à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Formation du personnel sur les risques spécifiques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation technique et réglementaire",
        questions: [
          { question: "Fiches de données de sécurité (FDS) disponibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plans des installations avec localisation des risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registres de maintenance des équipements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Permis de travaux à chaud à jour?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Moyens d'évacuation pour milieu industriel",
        questions: [
          { question: "Sorties d'urgence adaptées aux effectifs?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Chemins d'évacuation clairement marqués?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes coupe-feu maintenues fermées automatiquement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de sécurité conforme aux zones à risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Points de rassemblement extérieurs identifiés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Systèmes de protection industrielle",
        questions: [
          { question: "Système d'alarme automatique fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de détection adapté aux risques?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs spécialisés selon les risques présents?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système fixe d'extinction (mousse, CO2) opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Réseau de gicleurs industriel fonctionnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Colonne sèche et raccords normalisés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques industriels particuliers",
        questions: [
          { question: "Matières dangereuses stockées selon les normes?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aires de stockage avec rétention appropriée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Équipements électriques adaptés aux zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de ventilation et évacuation des fumées?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Travaux à chaud avec surveillance appropriée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Nettoyage régulier des zones d'accumulation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès spécialisé pour intervention industrielle",
        questions: [
          { question: "Accès pompiers avec véhicules spécialisés?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan d'intervention détaillé remis aux pompiers?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de communication d'urgence opérationnel?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Moyens d'approvisionnement en eau suffisants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  },
  {
    groupe: "I",
    nom: "Assemblée - Lieux de rassemblement",
    description: "Écoles, théâtres, centres communautaires, églises",
    sections: [
      {
        titre: "1. Informations Générales & Contacts",
        description: "Gestion sécurité pour lieux d'assemblée",
        questions: [
          { question: "Plan d'évacuation affiché dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Responsable évacuation désigné pour chaque événement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Capacité maximale d'occupation respectée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Personnel formé aux procédures d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "2. Documentation & Plans",
        description: "Documentation pour gestion des foules",
        questions: [
          { question: "Plans d'évacuation adaptés au type d'assemblée?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Procédures d'urgence communiquées au public?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Registre des exercices d'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "3. Voies d'Évacuation & Sorties",
        description: "Évacuation sécuritaire des grandes assemblées",
        questions: [
          { question: "Nombre de sorties conforme à l'occupation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Largeur des sorties proportionnelle aux occupants?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Portes s'ouvrent dans le sens de l'évacuation?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage d'urgence sur tous les parcours?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Aisles et dégagements libres pendant les événements?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "4. Moyens de Protection Incendie",
        description: "Protection adaptée aux assemblées",
        questions: [
          { question: "Système d'alarme audible dans tout le bâtiment?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de sonorisation pour annonces d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Détection automatique dans toutes les zones?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Extincteurs accessibles et visibles?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Système de gicleurs dans les zones de rassemblement?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "5. Risques Spécifiques",
        description: "Risques liés aux activités d'assemblée",
        questions: [
          { question: "Sièges et rangées fixées selon les normes?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Scène et décors avec matériaux ignifuges?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Éclairage de scène avec protection thermique?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Cuisine (si présente) avec système d'extinction?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Contrôle du tabagisme respecté?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      },
      {
        titre: "6. Accessibilité Services d'Incendie",
        description: "Accès pour intervention lors d'assemblées",
        questions: [
          { question: "Accès prioritaire maintenu libre en tout temps?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Communication directe avec services d'urgence?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Plan du site remis aux services d'incendie?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] },
          { question: "Stationnement d'urgence réservé et signalisé?", type: "choix", options: ["Conforme", "Non-conforme", "S.O."] }
        ]
      }
    ]
  }
];

// MapComponent avec Leaflet + OpenStreetMap (GRATUIT, sans clé API)

export { 
  EditerGrille, 
  GrillesInspection, 
  TemplatePreviewModal, 
  EditerGrilleFromTemplate, 
  CreateGrilleInspection,
  DEFAULT_GRILLES_TEMPLATES 
};
export default GrillesInspection;
